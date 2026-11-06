import { Engine } from '../../app/src/engine/engine.ts';
import { LocalGm, DEFAULT_GM_OPTIONS } from '../../app/src/gm/gm.ts';
import { LlmClient } from '../../app/src/gm/llm.ts';
import { loadDesert, loadWolheunLore } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const gm = new LocalGm(new LlmClient({ baseUrl: 'http://127.0.0.1:18097', timeoutMs: 90000 }), lore,
  { ...DEFAULT_GM_OPTIONS, budgetMs: 45000 });
const cases = [
  '눈가가 따끔해져 말문이 막힌다',
  '설움이 북받쳐 목소리가 잠긴다',
  '등골이 서늘해져 온몸이 굳는다',
  '분해서 입술만 파르르 떨린다',
  '헛웃음이 새어 나오고 눈물이 맺힌다',
  '맥이 풀려 어깨가 축 처진다',
  '이가 덜덜 떨려 말이 안 나온다',
  '어이가 없어 멍하니 눈만 깜빡인다',
  '입 안이 바싹 마르고 숨이 막힌다',
  '가슴이 먹먹해 아무 말도 못 한다',
];
const rows = [];
for (const [i, text] of cases.entries()) {
  const beat = i % 2 ? 'b06_swing' : 'b05_why';
  const engine = new Engine({ ...scenario, start: beat }, gm, () => 0, false);
  const { state } = engine.newGame(2, `emotion58-${i}`);
  const before = structuredClone(state);
  const started = performance.now();
  const result = await engine.act(state, { type: 'free', text });
  const row = {
    text, beat, before, after: result.state,
    lines: result.step.events.filter((e) => e.type === 'line'),
    rolled: result.step.events.some((e) => e.type === 'roll'),
    gm: result.state.log.filter((e) => e.kind === 'gm'),
    ms: Math.round(performance.now() - started),
  };
  rows.push(row);
  await Bun.write(new URL('./model_emotions.json', import.meta.url), JSON.stringify(rows, null, 2));
  console.log(`감정 ${i + 1}/10: ${row.lines.filter((l) => l.speaker === '남자').map((l) => l.text).join(' / ')}`);
}

const beat = scenario.beats.b05_why;
if (!beat?.free) throw new Error('b05 대화 필요');
const repeatEngine = new Engine({ ...scenario, start: 'b05_why' }, gm, () => 0, false);
let { state } = repeatEngine.newGame(2, 'repeat58');
const repeated = [];
for (const text of ['어째서 내 목에 칼을 댔어요?', '제가 뭘 했다고 칼부터 대요?', '칼을 들이대는 이유가 대체 뭔데요?']) {
  state = { ...state, beat: beat.id, free: { beat: beat.id, talks: 0, rolls: 0 } };
  const reply = await gm.talk({ scenario, state, beat, free: beat.free, text });
  repeated.push({ text, ...reply });
  for (const line of reply.lines) state.spoken[line.speaker] = [...(state.spoken[line.speaker] ?? []), line.text];
}
await Bun.write(new URL('./model_repeat.json', import.meta.url), JSON.stringify(repeated, null, 2));
console.log('MODEL58_DONE');
