import { Engine } from '../src/engine/engine.ts';
import { loreFor } from '../src/gm/lore.ts';
import { validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { FakeGm, loadDesert, loadWolheunLore } from '../tests/helpers.ts';

const root = new URL('../../', import.meta.url);
const evidence = new URL('docs/lead_check59b/', root);
const scenario = await loadDesert();
const state = new Engine(scenario, new FakeGm()).newGame(1, '59b-offline').state;
const lore = loreFor(await loadWolheunLore(), state);
const observations: {
  text: string;
  lines: { speaker: string; text: string; by: string; face?: string }[];
}[] = await Bun.file(new URL('docs/lead_check58b/model_emotions.json', root)).json();
const spoken: string[] = [];
const rows = observations.map((observation, index) => {
  const lines = observation.lines.filter(line => line.speaker === '남자' && line.by === 'gm');
  const options: CheckOptions = {
    speakers: ['남자'], maxLines: 4, maxChars: 80, cast: scenario.cast, lore,
    stateGuard: [], spoken: { 남자: [...spoken] }, echoOnly: [], outcomeForbid: [],
    playerText: observation.text, input: observation.text, reserved: [], gist: '',
    playerLore: scenario.sheet.name,
  };
  const repeats = validateOutput(JSON.stringify({ lines }), options).violations.filter(v => v.rule === 'reaction_repeat');
  const row = {
    index: index + 1, input: observation.text, previous: spoken.slice(-2),
    lines: lines.map(line => line.text), rewrite: repeats.length > 0, reasons: repeats.map(v => v.detail),
  };
  // 모델을 호출하지 않으므로 재작성 결과를 지어내지 않고 관측 원문을 계속 누적한다.
  spoken.push(...row.lines);
  return row;
});
await Bun.write(new URL('model_repetition.json', evidence), `${JSON.stringify(rows, null, 2)}\n`);
const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = [
  '# 58b 열 문장 연속 재평가',
  '',
  '각각 새 판이었던 58b의 최종 남자 원문을 번호순으로 같은 판에서 말했다고 가정했다. 직전 두 원문과만 비교한다. 재작성 대상도 원문을 기록에 남겨 다음 행을 계산한다. 모델을 실행하지 않았으므로 실제 재작성 뒤의 연쇄 결과나 새 말투 품질을 뜻하지 않는다.',
  '',
  '| 번호 | 직전 두 남자 줄 | 최종 원문 | 새 검사 | 이유 |',
  '|---|---|---|---|---|',
  ...rows.map(row => `| ${row.index} | ${cell(row.previous.join(' / ') || '없음')} | ${cell(row.lines.join(' / '))} | ${row.rewrite ? '재작성' : '통과'} | ${cell(row.reasons.join(' / ') || '반복 없음')} |`),
  '',
  `재작성 ${rows.filter(row => row.rewrite).length}/10, 통과 ${rows.filter(row => !row.rewrite).length}/10. 기존 58b의 말투·입력 반응 검사와 별도인 구조 반복 검사 결과다.`,
];
await Bun.write(new URL('model_repetition.md', evidence), `${table.join('\n')}\n`);

const baseline: { current: { matched: number; total: number; mismatches: number }; ids: string[] } =
  await Bun.file(new URL('docs/lead_check59/engine_corpus_delta.json', root)).json();
const corpus: { id: string; ok: boolean }[] = (await Bun.file('/tmp/laneC5/corpus.jsonl').text())
  .trim().split('\n').map(line => JSON.parse(line));
const ids = corpus.filter(row => !row.ok).map(row => row.id);
const delta = {
  baseline: baseline.current,
  current: { matched: corpus.length - ids.length, total: corpus.length, mismatches: ids.length },
  added: ids.filter(id => !baseline.ids.includes(id)),
  resolved: baseline.ids.filter(id => !ids.includes(id)),
  ids,
};
await Bun.write(new URL('corpus_delta.json', evidence), `${JSON.stringify(delta, null, 2)}\n`);
console.log(JSON.stringify({ rescored: rows.length, rewrites: rows.filter(row => row.rewrite).length, corpus: delta.current, added: delta.added.length, resolved: delta.resolved.length }));
