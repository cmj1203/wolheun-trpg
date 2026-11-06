import type { GameEvent, GameState } from '../src/engine/types.ts';
import type { GmTrace } from '../src/gm/gm.ts';
import { loreFor } from '../src/gm/lore.ts';
import { validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { loadDesert, loadWolheunLore } from '../tests/helpers.ts';

const root = new URL('../../', import.meta.url);
const dir = new URL('docs/lead_check59c/', root);
const scenario = await loadDesert();
const lore = await loadWolheunLore();
const run: { rows: {
  i: number; text: string; beat: string; before: GameState; after: GameState;
  events: GameEvent[]; traces: GmTrace[]; ms: number; baselineMs: number; ratio: number;
  cpuBefore: string; cpuAfter: string;
  situation: string; expected: string[];
}[] } = await Bun.file(new URL('model_sequential.json', dir)).json();
const run1: { rows: { ms: number }[] } = await Bun.file(new URL('model_sequential_run1.json', dir)).json();
const rows = run.rows.map(row => {
  const male = row.events.flatMap(e => e.type === 'line' && e.speaker === '남자' ? [e] : []);
  const generated = row.traces.filter(t => t.task !== 'interpret' && t.attempt > 0 && t.raw);
  const raw = generated.map(trace => {
    const parsed: { lines?: { speaker: string; text: string }[] } = JSON.parse(trace.raw);
    return `${trace.attempt}회: ${(parsed.lines ?? []).filter(line => line.speaker === '남자').map(line => line.text).join(' / ')}`;
  });
  const gm = row.after.log.slice(row.before.log.length).flatMap(entry => entry.kind === 'gm' ? [entry] : []);
  const check: CheckOptions = {
    speakers: ['남자'], maxLines: 10, maxChars: 200, cast: scenario.cast,
    lore: loreFor(lore, row.before), stateGuard: [], spoken: row.before.spoken,
    echoOnly: [], outcomeForbid: [], playerText: row.text, reserved: [],
    gist: '', playerLore: scenario.sheet.name,
  };
  const addressRepeats = validateOutput(JSON.stringify({ lines: male }), check).violations
    .filter(v => v.rule === 'reaction_repeat' && v.detail.includes('호칭'));
  return {
    i: row.i, input: row.text, beat: row.beat, raw,
    violations: [
      ...generated.flatMap(trace => trace.violations.map(v => `${v.rule}(${v.severity}): ${v.detail}`)),
      ...gm.flatMap(entry => entry.violations.filter(v => v.startsWith('budget:') || v.startsWith('error:'))),
    ],
    rewrites: gm.reduce((sum, entry) => sum + Math.max(0, entry.attempts - 1), 0),
    final: male.map(line => line.text), faces: male.map(line => line.face ?? '없음'),
    situation: row.situation, expected: row.expected,
    faceMatches: male.length > 0 && male.every(line => row.expected.includes(line.face ?? '없음')),
    resultNarration: row.events.flatMap(event => event.type === 'line' && event.style === 'narration' ? [event.text] : []),
    prices: row.events.flatMap(event => event.type === 'price' ? [event.text] : []),
    roll: row.events.flatMap(event => event.type === 'roll' ? [`${event.label}: ${event.tierLabel}`] : []),
    silentLines: male.filter(line => !/[가-힣A-Za-z0-9]/u.test(line.text)).length,
    fallback: gm.some(entry => entry.task !== 'interpret' && entry.fallback),
    addressRepeats, ms: row.ms, baselineMs: row.baselineMs, ratio: row.ratio,
    run1Ms: run1.rows[row.i - 1]?.ms ?? 0,
    cpuBefore: row.cpuBefore, cpuAfter: row.cpuAfter,
  };
});
const summary = {
  count: rows.length,
  silentLines: rows.reduce((sum, row) => sum + row.silentLines, 0),
  fallbackTurns: rows.filter(row => row.fallback).length,
  addressRepeats: rows.reduce((sum, row) => sum + row.addressRepeats.length, 0),
  overThirtyPercent: rows.filter(row => row.ratio > 1.3).map(row => row.i),
  overThirtyPercentFromRun1: rows.filter(row => row.ms > row.run1Ms * 1.3).map(row => row.i),
  menacing: rows.filter(row => row.faces.includes('menacing')).map(row => row.i),
  intrigued: rows.filter(row => row.faces.includes('intrigued')).map(row => row.i),
  sneer: rows.filter(row => row.faces.includes('sneer')).map(row => row.i),
  faceMatches: rows.filter(row => row.faceMatches).length,
};
await Bun.write(new URL('model_audit.json', dir), `${JSON.stringify({ summary, rows }, null, 2)}\n`);
const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
await Bun.write(new URL('model_table.md', dir), [
  '# 59c 실제 26B 연속 입력',
  '',
  '같은 판의 상태·발화 기록을 유지했다. 각 1턴인 원래 위협 장면은 시험 복사본에서 b05 3턴·b06 20턴으로 늘려 8개 입력을 받을 자리를 만들었다. 실제 콘텐츠는 변경하지 않았다. 이 표는 기본 대본 완주 시험이 아니다.',
  '',
  '| 입력 | 모델 원문(남자, 생성 차례별) | 위반 | 다시 쓰기 횟수 | 결과 서술 | 최종 줄 | 고른 표정 | 상황 → 기대 표정 → 실제 표정 | 걸린 시간 |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(row => `| ${cell(row.input)} | ${cell(row.raw.join(' / '))} | ${cell(row.violations.join(' / ') || '없음')} | ${row.rewrites} | ${cell([...row.roll, ...row.resultNarration, ...row.prices].join(' / ') || '없음')} | ${cell(row.final.join(' / '))}${row.fallback ? ' (기존 대체)' : ''} | ${row.faces.join(' / ')} | ${cell(row.situation)} → ${row.expected.join('/')} → ${row.faces.join('/')} (${row.faceMatches ? '일치' : '불일치'}) | ${(row.ms / 1000).toFixed(3)}초 |`),
  '',
  `침묵 줄 ${summary.silentLines}, 대체 출력 턴 ${summary.fallbackTurns}, 직전 두 줄 호칭 반복 ${summary.addressRepeats}, 시간 30% 초과 ${summary.overThirtyPercent.length}건.`,
  ...rows.filter(row => row.silentLines > 0).map(row => `${row.i}번 최종 줄에 말 내용 없는 반응이 남아 침묵 0 조건 미충족이다.`),
  '',
  '| 입력 번호 | 전체 턴 시간 | 58b 같은 순번 GM 시간 합 | 58b 대비 | run1 시간 → 증가율 | CPU 전 → 후(PID·상태·CPU%·경과) |',
  '|---|---|---|---|---|---|',
  ...rows.map(row => `| ${row.i} | ${row.ms}ms | ${row.baselineMs}ms | ${row.ratio.toFixed(3)}배 | ${row.run1Ms}ms → ${((row.ms / row.run1Ms - 1) * 100).toFixed(1)}% | ${row.cpuBefore} → ${row.cpuAfter} |`),
  '',
  '58b 원본에는 전체 벽시계 시간이 없으므로 interpret·talk의 ms 합을 기준으로 사용했다. 새 입력과 같은 순번을 비교했으며 평범 입력 3개도 58b의 감정 입력 순번과 비교한 참고치다. 같은 입력·같은 장비 부하를 고정한 성능 실험은 아니다. 모델 적재 시간은 제외했다. CPU 실행 중 표본은 model_cpu.log에 있다.',
  '',
  `menacing은 ${summary.menacing.length}회, intrigued는 ${summary.intrigued.length}회다. 나오지 않은 표정은 재생·강제하지 않았다.`,
  `sneer는 ${summary.sneer.length}/8이다. 이전 실행은 7/8이었으며 model_table_run1.md에 보존했다.`,
  `상황별 기대와 일치 ${summary.faceMatches}/8. 기대 표정은 모델 실행 전에 스크립트에 정했으며 실행 뒤 바꾸지 않았다.`,
  '',
].join('\n'));

const baseline: { current: { matched: number; total: number; mismatches: number }; ids: string[] } =
  await Bun.file(new URL('docs/lead_check59b/corpus_delta.json', root)).json();
const corpus: { id: string; ok: boolean }[] = (await Bun.file('/tmp/laneC5/corpus59c_run3.jsonl').text())
  .trim().split('\n').map(line => JSON.parse(line));
const ids = corpus.filter(row => !row.ok).map(row => row.id);
const delta = {
  baseline: baseline.current,
  current: { matched: corpus.length - ids.length, total: corpus.length, mismatches: ids.length },
  added: ids.filter(id => !baseline.ids.includes(id)),
  resolved: baseline.ids.filter(id => !ids.includes(id)), ids,
};
await Bun.write(new URL('corpus_delta.json', dir), `${JSON.stringify(delta, null, 2)}\n`);
console.log(JSON.stringify({ summary, corpus: delta.current, added: delta.added.length, resolved: delta.resolved.length }));

const requests: { at: number; body: { messages: { role: string; content: string }[]; response_format?: {
  json_schema?: { schema?: { properties?: { lines?: unknown } } };
} } }[] = (await Bun.file(new URL('model_requests.jsonl', dir)).text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const requestRows = requests.flatMap((request, index) => {
  const lines = request.body.response_format?.json_schema?.schema?.properties?.lines;
  if (!lines) return [];
  const enums: string[][] = [];
  let defaultFound = false;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value === null || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'face' && item !== null && typeof item === 'object') {
        if ('enum' in item && Array.isArray(item.enum)) enums.push(item.enum.filter((face): face is string => typeof face === 'string'));
        if ('default' in item) defaultFound = true;
      }
      visit(item);
    }
  };
  visit(lines);
  return [{
    request: index + 1, at: request.at,
    scenarioRules: request.body.messages.some(message => message.content.includes('몸으로 덤비거나 그의 무기')),
    characterRules: request.body.messages.some(message => message.content.includes('표정:') || message.content.includes('표정(face)')),
    faceEnums: enums, faceDefaultFound: defaultFound,
    neutralExample: request.body.messages.some(message => message.content.includes('"face":"neutral"')),
  }];
});
await Bun.write(new URL('request_audit.json', dir), `${JSON.stringify(requestRows, null, 2)}\n`);
console.log(JSON.stringify({ actualRequests: requests.length, generationRequests: requestRows.length, allScenarioRules: requestRows.every(row => row.scenarioRules), allCharacterRules: requestRows.every(row => row.characterRules), anyFaceDefault: requestRows.some(row => row.faceDefaultFound) }));
