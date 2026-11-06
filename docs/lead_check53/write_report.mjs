const records = (await Bun.file(new URL('./gm_raw.jsonl', import.meta.url)).text()).trim().split('\n').map(JSON.parse);
const verdict = await Bun.file(new URL('./verdict.json', import.meta.url)).json();
const escape = (text) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
const category = { body: '감정·몸 반응', mixed: '말과 반응 혼합', 'second-talk': '대화 1회 뒤 일반 말', 'attempt-control': '의도적 행동 대조' };
const table = [
  '# 실제 26B 입력 · 분류 · 다음 비트 · 화면 줄',
  '',
  '일반 말 두 입력은 이미 대화가 한 번 오간 상태(talks=1)에서 보냈다. 나머지는 해당 비트의 첫 입력이다. 원시 모델 응답과 검증 재시도는 gm_raw.jsonl에 있다.',
  '',
  '| 비트 | 입력 | 종류 | 엔진 처리 | 주사위 | 다음 비트 | 화면 줄(순서대로) |',
  '|---|---|---|---|---|---|---|',
  ...records.map((r) => `| ${r.beat} | ${escape(r.text)} | ${category[r.category]} | ${r.classification} | ${r.rolls} | ${r.next} | ${r.lines.map((l) => `${l.speaker}: ${escape(l.text)}`).join('<br>')} |`),
  '',
];
await Bun.write(new URL('./input_table.md', import.meta.url), table.join('\n'));
const body = records.filter((r) => r.category === 'body');
const progress = records.filter((r) => ['body', 'second-talk'].includes(r.category));
const summary = {
  total: records.length,
  passed: verdict.passed,
  failed: verdict.failed,
  bodyCases: body.length,
  bodyRolls: body.reduce((n, r) => n + r.rolls, 0),
  progressCases: progress.length,
  repeatedPromptOnProgress: verdict.repeatedPromptOnProgress,
  idleNarrationRepeatViolations: verdict.idleNarrationRepeatViolations,
  endingsOnProgress: progress.filter((r) => r.ending !== null).length,
  identityLeaks: records.filter((r) => r.lines.some((l) => /베히다트|페샨|국왕|왕이다|왕이야/.test(l.text))).map((r) => r.text),
  foxLines: records.filter((r) => r.lines.some((l) => l.speaker === 'GM')).map((r) => r.text),
  bodyReactionMaxChars: Math.max(...body.map((r) => [...(r.lines.find((l) => l.speaker === '남자')?.text ?? '')].length)),
};
await Bun.write(new URL('./qa_summary.json', import.meta.url), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
