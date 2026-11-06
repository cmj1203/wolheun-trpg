import { Engine } from '../../app/src/engine/engine.ts';
import { LocalGm, DEFAULT_GM_OPTIONS } from '../../app/src/gm/gm.ts';
import { LlmClient } from '../../app/src/gm/llm.ts';
import { loadDesert, loadWolheunLore } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const baseline = await Bun.file(new URL('../lead_check58/model_emotions.json', import.meta.url)).json();
const retry = Number(process.argv.find(arg => arg.startsWith('--retry='))?.split('=')[1] ?? 0);
const rows = process.argv.includes('--resume') || retry
  ? await Bun.file(new URL('./model_emotions.json', import.meta.url)).json() : [];
let traces = [];
let errorSnapshots = [];
const gm = new LocalGm(new LlmClient({ baseUrl: 'http://127.0.0.1:18097', timeoutMs: 90000 }), lore,
  { ...DEFAULT_GM_OPTIONS, budgetMs: 45000, onTrace: t => {
    traces.push(t);
    if (t.error) errorSnapshots.push(Bun.$`ps -p 16678 -o pid=,stat=,%cpu=,etime=`.quiet().text()
      .then(cpu => ({ error: t.error, at: new Date().toISOString(), cpu: cpu.trim() })));
  } });
for (const [i, item] of baseline.entries()) {
  if (retry ? i !== retry - 1 : i < rows.length) continue;
  traces = [];
  errorSnapshots = [];
  const cpuBefore = (await Bun.$`ps -p 16678 -o pid=,stat=,%cpu=,etime=`.quiet().text()).trim();
  const started = performance.now();
  const engine = new Engine({ ...scenario, start: item.beat }, gm, () => 0, false);
  const { state } = engine.newGame(2, `emotion58b-${i}`);
  const result = await engine.act(state, { type: 'free', text: item.text });
  const row = {
    text: item.text, beat: item.beat,
    lines: result.step.events.filter(e => e.type === 'line'),
    rolled: result.step.events.some(e => e.type === 'roll'),
    gm: result.state.log.filter(e => e.kind === 'gm'),
    traces,
    wallMs: Math.round(performance.now() - started), cpuBefore,
    cpuAfter: (await Bun.$`ps -p 16678 -o pid=,stat=,%cpu=,etime=`.quiet().text()).trim(),
    errorSnapshots: await Promise.all(errorSnapshots),
  };
  rows[i] = row;
  await Bun.write(new URL('./model_emotions.json', import.meta.url), JSON.stringify(rows, null, 2));
  console.log(`감정 ${i + 1}/10: ${row.lines.filter(l => l.speaker === '남자').map(l => l.text).join(' / ')}`);
}
console.log('MODEL58B_DONE');
