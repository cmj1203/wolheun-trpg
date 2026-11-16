import assert from 'node:assert/strict';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Engine, type GmContext, type GmPort } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import type { Action, GameEvent } from '../src/engine/types.ts';
import { LocalGm, DEFAULT_GM_OPTIONS } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest } from '../src/gm/llm.ts';
import { withNotes, loadLore } from '../src/gm/lore.ts';
import { parseStoryInput } from '../src/engine/text.ts';
import { FakeGm, SCENARIO_PATH, LORE_PATH } from './helpers.ts';

// 수동 집중 검증 전용. 단위 시험에서 실행하지 않으며 공유 모델 한 개를 순차 사용한다.
const out = join(import.meta.dir, '../../work/demo-slice/lane64', `mixed-real-${Date.now()}`);
await mkdir(out, { recursive: true });
const log = join(out, 'trace.jsonl');
const sources = ['src/gm/gm.ts', 'src/gm/prompt.ts', 'src/gm/validate.ts', 'src/engine/engine.ts'];
await appendFile(join(out, 'sources.json'), JSON.stringify(Object.fromEntries(await Promise.all(
  sources.map(async (path) => [path, new Bun.CryptoHasher('sha256').update(await Bun.file(join(import.meta.dir, '..', path)).arrayBuffer()).digest('hex')]),
)), null, 2));
let current = '';
async function record(kind: string, value: unknown) {
  await appendFile(log, `${JSON.stringify({ case: current, kind, value })}\n`);
}
class CapturedClient extends LlmClient {
  override async chatJson(request: ChatRequest) {
    await record('request', request);
    const result = await super.chatJson(request);
    await record('raw', result);
    return result;
  }
}
const lore = await loadLore(LORE_PATH);
const scenario = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const prepare = new Engine(scenario, new FakeGm());
let { state: baseline } = prepare.newGame(2, 'mixed-fixture');
for (const action of [
  { type: 'approach', id: 'run' }, { type: 'approach', id: 'plead' },
  { type: 'approach', id: 'dodge' }, { type: 'approach', id: 'stare_back' },
  { type: 'choose', id: 'continue_chapter' }, { type: 'approach', id: 'steady' },
] satisfies Action[]) {
  baseline = (await prepare.act(baseline, action)).state;
  if (baseline.pendingLuck) baseline = (await prepare.act(baseline, { type: 'luck', use: true })).state;
}
assert.equal(baseline.beat, 'ep02_question');
await record('fixture', baseline);
const client = new CapturedClient({ baseUrl: 'http://127.0.0.1:18196', timeoutMs: 90000 });
const cases = [
  ['원문 혼합 반려', '（그의 눈을 피하지 않고 손목을 잡은 손을 내려다본다） 잡은 손부터 놓아 주세요.', false],
  ['새 관찰과 부탁', '(그의 옷깃에 묻은 먼지를 바라본다) 잠시 이야기해도 될까요.', false],
  ['인사와 몸짓', '(가볍게 고개를 기울이며 인사한다) 처음 뵙겠습니다.', false],
  ['관찰과 요구', '(붙들린 팔의 위치를 천천히 살핀다) 제 말도 끝까지 들어 주세요.', false],
  ['말 없는 관찰', '(움직이지 않고 눈앞의 모습을 확인한다)', false],
  ['감정 반응', '(입술을 깨물며 울음을 삼킨다)', false],
  ['실제 위험 시도', '(그의 팔을 쳐서 붙든 손을 뿌리치고 인파로 달아난다) 비키세요.', true],
  ['실제 설득 시도', '(탈옥 과정을 차근차근 설명한다) 제 기술을 쓰면 당신에게도 이익이라고 증거를 들어 설득하겠어요.', true],
] as const;
const selected = process.argv.slice(2);
const requested = selected.length ? cases.filter(([name]) => selected.includes(name)) : cases;
if (selected.length) assert.equal(requested.length, new Set(selected).size, '알 수 없는 집중 사례 이름');
const rows: { name: string; passed: boolean; error?: string }[] = [];
for (const [name, text, attempt] of requested) {
  current = name;
  console.log(`CASE_START ${name}`);
  const readings: unknown[] = [];
  const traces: unknown[] = [];
  const actual = new LocalGm(client, lore, {
    ...DEFAULT_GM_OPTIONS, budgetMs: 60000,
    onTrace(trace) { traces.push(trace); },
  });
  // prepare의 비동기 warm만 제외해 np1 공유 모델에 중복 요청을 만들지 않는다.
  const gm: GmPort = {
    async interpret(ctx: GmContext) {
      const result = await actual.interpret(ctx);
      readings.push(result);
      await record('reading', result);
      return result;
    },
    talk: (ctx) => actual.talk(ctx),
    narrate: (ctx) => actual.narrate(ctx),
    explain: (ctx) => actual.explain(ctx),
  };
  const engine = new Engine(scenario, gm);
  const before = structuredClone(baseline);
  const events: GameEvent[] = [];
  try {
    await record('input', { original: text, separated: parseStoryInput(text), before });
    let result = await engine.act(before, { type: 'free', text });
    events.push(...result.step.events);
    if (attempt && result.state.pendingIntent) {
      await record('intent', result.state.pendingIntent);
      result = await engine.act(result.state, { type: 'confirm', ok: true });
      events.push(...result.step.events);
    }
    await record('result', { readings, traces, after: result.state, events });
    if (!attempt) {
      assert.equal(events.some((event) => event.type === 'roll'), false);
      assert.equal(result.state.rng, before.rng);
      assert.deepEqual(result.state.tracks, before.tracks);
      assert.deepEqual(result.state.items, before.items);
      assert.equal(result.state.log.slice(before.log.length).some((entry) => entry.kind === 'check' || entry.kind === 'price'), false);
      assert.equal(events.some((event) => event.type === 'line' && event.by === 'gm'), true);
    } else {
      assert.equal(events.some((event) => event.type === 'roll'), true);
    }
    rows.push({ name, passed: true });
    console.log(`CASE_PASS ${name}`);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    await record('failure', { error: error.message, readings, traces, events });
    rows.push({ name, passed: false, error: error.message });
    console.log(`CASE_FAIL ${name}: ${error.message}`);
  }
}
await Bun.write(join(out, 'summary.json'), JSON.stringify({ out, rows }, null, 2));
console.log(`FOCUSED_DONE ${JSON.stringify({ out, pass: rows.filter((row) => row.passed).length, fail: rows.filter((row) => !row.passed).length })}`);
if (rows.some((row) => !row.passed)) process.exitCode = 1;
