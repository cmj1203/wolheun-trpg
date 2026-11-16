import assert from 'node:assert/strict';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Engine, type GmPort } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { LocalGm, DEFAULT_GM_OPTIONS } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest } from '../src/gm/llm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { FakeGm, SCENARIO_PATH, LORE_PATH } from './helpers.ts';

// 리드 배정 후 재반려 두 건만 순차 실행한다. UI 검증을 대신하지 않는다.
const out = join(import.meta.dir, '../../work/demo-slice/lane64', `ep03-grounded-${Date.now()}`);
await mkdir(out, { recursive: true });
const trace = join(out, 'trace.jsonl');
let current = '';
const record = (kind: string, value: unknown) => appendFile(trace, `${JSON.stringify({ case: current, kind, value })}\n`);
class CapturedClient extends LlmClient {
  override async chatJson(request: ChatRequest) {
    await record('request', request);
    const result = await super.chatJson(request);
    await record('raw', result);
    return result;
  }
}
const hashes: Record<string, string> = {};
for await (const path of new Bun.Glob('src/{gm,engine}/**/*.ts').scan(join(import.meta.dir, '..'))) {
  hashes[path] = new Bun.CryptoHasher('sha256').update(await Bun.file(join(import.meta.dir, '..', path)).arrayBuffer()).digest('hex');
}
await record('sourceHashes', hashes);
const lore = await loadLore(LORE_PATH);
const scenario = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
await record('runtimeScenario', { sha256: new Bun.CryptoHasher('sha256').update(JSON.stringify(scenario)).digest('hex'), scenario });
const client = new CapturedClient({ baseUrl: 'http://127.0.0.1:18196', timeoutMs: 90000 });
const rows: { name: string; passed: boolean; error?: string }[] = [];
const cases = [
  ['혼합대사행동', false, '(손을 가볍게 들어 보인다) 잠시 제 말도 들어 주세요.'],
  ['둘째자리혼합', true, '(시녀를 향해 손바닥을 편다) 이 방은 왜 이렇게 조용한가요?'],
] as const;
const selected = process.argv.slice(2);
const requested = selected.length ? cases.filter(([name]) => selected.includes(name)) : cases;
assert.equal(requested.length, selected.length ? new Set(selected).size : cases.length, '알 수 없는 표적 사례');
for (const [name, second, text] of requested) {
  current = name;
  console.log(`CASE_START ${name}`);
  const prepare = new Engine({ ...scenario, start: 'ep03_c001' }, new FakeGm(), () => 1000);
  let { state } = prepare.newGame(20261109, `grounded-${name}`);
  if (second) state = (await prepare.act(state, { type: 'choose', id: 'ep03_i01_protest' })).state;
  const actual = new LocalGm(client, lore, { ...DEFAULT_GM_OPTIONS, onTrace(value) { void record('gmTrace', value); } });
  const replies: Awaited<ReturnType<LocalGm['talk']>>[] = [];
  const gm: GmPort = {
    async interpret(ctx) { await record('interpretContext', ctx); const reading = await actual.interpret(ctx); await record('reading', reading); return reading; },
    async talk(ctx) { await record('talkContext', ctx); const reply = await actual.talk(ctx); replies.push(reply); await record('reply', reply); return reply; },
    narrate: (ctx) => actual.narrate(ctx), explain: (ctx) => actual.explain(ctx),
  };
  const engine = new Engine(scenario, gm, () => 1000);
  const before = structuredClone(state);
  try {
    await record('input', { text, before });
    const result = await engine.act(state, { type: 'interject', text, scene: state.beat, shown: state.recent, pending: [] });
    await record('result', result);
    assert.equal(result.step.events.some((event) => event.type === 'roll'), false);
    assert.equal(result.state.rng, before.rng);
    assert.deepEqual(result.state.tracks, before.tracks);
    assert.deepEqual(result.state.items, before.items);
    assert.equal(replies.length, 1);
    assert.equal(replies[0]?.meta.fallback, false);
    assert.ok(replies[0]?.lines.length);
    assert.equal(result.state.beat, second ? 'ep03_c061' : 'ep03_c049');
    rows.push({ name, passed: true });
    console.log(`CASE_PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await record('failure', message);
    rows.push({ name, passed: false, error: message });
    console.log(`CASE_FAIL ${name}: ${message}`);
  }
}
await appendFile(join(out, 'summary.json'), JSON.stringify({ out, rows }, null, 2));
console.log(`GROUNDED_DONE ${JSON.stringify({ out, rows })}`);
if (rows.some((row) => !row.passed)) process.exitCode = 1;
