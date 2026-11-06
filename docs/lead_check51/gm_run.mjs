import { Engine } from '../../app/src/engine/engine.ts';
import { LocalGm, DEFAULT_GM_OPTIONS } from '../../app/src/gm/gm.ts';
import { LlmClient } from '../../app/src/gm/llm.ts';
import { loadDesert, loadWolheunLore } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const paths = [];
let base;
for (const path of ['run', 'watch', 'avoid']) {
  const engine = new Engine(scenario, new LocalGm(null, lore));
  const fresh = engine.newGame(1, `lane51-${path}`).state;
  const result = await engine.act(fresh, { type: 'approach', id: path });
  if (path === 'run') base = result.state;
  const first = result.step.events.findIndex((e) => e.type === 'scene' && e.beat === 'b03_ask');
  paths.push({ path, events: result.step.events.slice(first), hud: result.step.hud });
}
await Bun.write(new URL('./paths.json', import.meta.url), JSON.stringify(paths, null, 2));
if (process.argv.includes('--paths-only')) process.exit(0);
const records = [];
for (const beat of ['b04_blade', 'b05_why']) {
  for (const text of ['왜 나한테 칼을 겨눠?', '내가 뭘 잘못했는데?']) {
    const traces = [];
    const gm = new LocalGm(new LlmClient({ baseUrl: 'http://127.0.0.1:18097', timeoutMs: 90_000 }), lore, {
      ...DEFAULT_GM_OPTIONS,
      onTrace: (trace) => traces.push(trace),
    });
    const engine = new Engine(scenario, gm);
    const state = structuredClone(base);
    const action = beat === 'b04_blade'
      ? { type: 'interject', scene: beat, text, shown: [{ speaker: '남자', text: '마지막으로 할 말은 있나?' }], pending: [] }
      : { type: 'free', text };
    const result = await engine.act(state, action);
    const record = {
      beat, text, traces, events: result.step.events,
      lines: result.step.events.filter((e) => e.type === 'line'),
      next: result.state.beat,
    };
    records.push(record);
    await Bun.write(new URL('./gm_raw.jsonl', import.meta.url), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(JSON.stringify({ beat, text, lines: record.lines.map((l) => `${l.speaker}: ${l.text}`) }));
  }
}
