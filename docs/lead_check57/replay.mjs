import { Engine } from '../../app/src/engine/engine.ts';
import { LocalGm } from '../../app/src/gm/gm.ts';
import { loadDesert, loadWolheunLore } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const baseline = await Bun.file('/tmp/flow_audit/results.json').json();
const probes = await Bun.file('/tmp/flow_audit/probes.json').json();
const engine = new Engine(scenario, new LocalGm(null, lore), () => 0, false);
const out = [];
function capture(id, source, before, action, after) {
  out.push({
    id, source, action, before,
    after: { beat: after.state.beat, ending: after.state.ending, tracks: after.state.tracks,
      flags: after.state.flags, items: after.state.items, said: after.state.said },
    lines: after.step.events.filter((e) => e.type === 'line'),
    events: after.step.events,
  });
}
// E: 같은 시작 시드와 이전 입력을 처음부터 다시 재생한다.
for (const [id, sample] of Object.entries(baseline.interesting)) {
  let { state } = engine.newGame(sample.seed, `replay57-${id}`);
  const history = sample.history.map((entry) => entry.kind === 'choice'
    ? { type: 'approach', id: entry.choice.replace(/^approach:/, '') }
    : { type: 'free', text: entry.text });
  let reason = null;
  for (const action of history) {
    if (state.ending) { reason = '앞선 입력에서 이미 결말'; break; }
    try { ({ state } = await engine.act(state, action)); }
    catch (error) { reason = String(error); break; }
  }
  if (reason || state.ending || state.beat !== sample.beat) {
    out.push({ id, source: 'E', seed: sample.seed, history, original: sample,
      changedRoute: { beat: state.beat, ending: state.ending, reason } });
    continue;
  }
  const before = structuredClone(state);
  capture(id, { kind: 'E', seed: sample.seed, history, original: sample }, before, sample.action,
    await engine.act(state, sample.action));
}
// D/B: 감사 당시 도달한 fixture의 상태·다음 RNG·입력을 그대로 맞춘다.
for (const sample of probes.filter((p) =>
  ['improv/mixed', 'improv/miss', 'typed:cover/mixed', 'typed:cover/miss', 'typed:charm/mixed', 'typed:shelter/mixed'].includes(p.name)
  || /identity|noble|미소녀|map-offer|resume-ending:value/.test(p.name))) {
  const base = structuredClone(baseline.fixtures[sample.beat]?.state ?? baseline.fixtures.b02_people.state);
  if (!sample.action) {
    const state = { ...base, beat: sample.beat, ending: 'value', flags: sample.flags };
    out.push({ id: sample.name, source: 'resume', before: state, events: engine.resume(state).events });
    continue;
  }
  const state = { ...base, beat: sample.beat, rng: sample.rng, ...sample.before };
  capture(`${sample.beat}/${sample.name}`, { kind: 'D/B', original: sample }, structuredClone(state), sample.action,
    await engine.act(state, sample.action));
}
for (const [id, beat, text] of [
  ['F06', 'b05_why', '나는 웰든 공녀예요. 가방에서 지도를 꺼내 보여 준다'],
  ['F07', 'b05_why', '나는 웰든 공녀가 아니에요'],
  ['F08', 'b05_why', '미소녀라고 말하지 않는다'],
  ['F18', 'b02_people', '물을 받으러 다가간다'],
]) {
  const before = structuredClone(baseline.fixtures[beat].state);
  const action = { type: 'free', text };
  capture(id, { kind: 'D', fixture: beat }, before, action, await engine.act(before, action));
}
await Bun.write(new URL('./replay.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ records: out.length, routeChanges: out.filter((r) => r.changedRoute).map((r) => ({ id: r.id, ...r.changedRoute })) }));
