import { Engine } from '../../app/src/engine/engine.ts';
import { LocalGm, DEFAULT_GM_OPTIONS } from '../../app/src/gm/gm.ts';
import { LlmClient } from '../../app/src/gm/llm.ts';
import { loadDesert, loadWolheunLore } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const offline = new Engine(scenario, new LocalGm(null, lore));
const opening = offline.newGame(1, 'lane53-base');
const b05 = (await offline.act(opening.state, { type: 'approach', id: 'run' })).state;
const b06 = (await offline.act(structuredClone(b05), { type: 'free', text: '아무 말도 하지 않는다' })).state;
const initial = (await Bun.file(new URL('./gm_initial.jsonl', import.meta.url)).text()).trim().split('\n').map(JSON.parse);
const original = [...new Set(initial.map((r) => r.text))];
const cases = [
  ...original.map((text, i) => ({ text, kind: i < 4 ? 'body' : i < 6 ? 'mixed' : 'second-talk' })),
  { text: '무릎이 후들거려 모래에 그대로 주저앉고 만다.', kind: 'body' },
  { text: '온몸의 힘이 빠져 다리가 꺾인다.', kind: 'body' },
];
const records = [];
async function run(beat, sample) {
  const traces = [];
  const gm = new LocalGm(new LlmClient({ baseUrl: 'http://127.0.0.1:18097', timeoutMs: 90_000 }), lore, {
    ...DEFAULT_GM_OPTIONS, onTrace: (trace) => traces.push(trace),
  });
  const engine = new Engine(scenario, gm);
  const state = structuredClone(beat === 'b05_why' ? b05 : b06);
  state.session = crypto.randomUUID();
  if (sample.kind === 'second-talk' && state.free) state.free.talks = 1;
  let result = await engine.act(state, { type: 'free', text: sample.text });
  const events = [...result.step.events];
  if (result.state.pendingLuck) {
    result = await engine.act(result.state, { type: 'luck', use: false });
    events.push(...result.step.events);
  }
  const input = result.state.log.findLast((entry) => entry.kind === 'input');
  const record = {
    beat, text: sample.text, category: sample.kind,
    classification: input?.result, next: result.state.beat, ending: result.state.ending,
    prompt: result.step.prompt, events,
    lines: events.filter((e) => e.type === 'line'),
    rolls: events.filter((e) => e.type === 'roll').length, traces,
  };
  records.push(record);
  await Bun.write(new URL('./gm_raw.jsonl', import.meta.url), records.map(JSON.stringify).join('\n') + '\n');
  console.log(JSON.stringify({ beat, text: record.text, kind: record.classification, next: record.next, rolls: record.rolls, reaction: record.lines.find((l) => l.speaker === '남자')?.text }));
}
for (const beat of ['b05_why', 'b06_swing']) {
  for (const sample of cases) await run(beat, sample);
}
for (const text of ['칼을 피하려고 몸을 낮춰 앉는다', '숨을 자리를 찾으려고 바위 뒤로 몸을 옮긴다']) {
  await run('b06_swing', { text, kind: 'attempt-control' });
}
const verdict = records.map((r) => {
  const noRollProgress = r.rolls === 0 && r.next !== r.beat && r.ending === null;
  const pass = r.category === 'body'
    ? r.classification === 'idle' && noRollProgress
    : r.category === 'second-talk' ? noRollProgress
    : r.category === 'mixed' ? ['talk', 'approach'].includes(r.classification)
    : ['approach', 'improv'].includes(r.classification) && r.rolls > 0;
  return { beat: r.beat, text: r.text, category: r.category, pass };
});
await Bun.write(new URL('./verdict.json', import.meta.url), JSON.stringify({
  checks: verdict,
  passed: verdict.filter((v) => v.pass).length,
  failed: verdict.filter((v) => !v.pass).length,
  repeatedPromptOnProgress: records.filter((r) => ['body', 'second-talk'].includes(r.category) && r.next === r.beat).length,
  idleNarrationRepeatViolations: records.filter((r) => r.category === 'body').flatMap((r) => r.traces.flatMap((t) => t.violations.filter((v) => v.rule === 'repeat_play'))).length,
}, null, 2));
if (verdict.some((v) => !v.pass)) process.exitCode = 1;
