import { expect, test } from 'bun:test';
import { activeFacts, Engine, type GmContext, type GmPort, type NarrateContext } from '../src/engine/engine.ts';
import { actClauses } from '../src/engine/text.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { ATTEMPT_CHECK_SYSTEM, buildNarrateUser, buildSystem, CHANGE_SYSTEM, OBSERVE_CHANGE } from '../src/gm/prompt.ts';
import { loreFor } from '../src/gm/lore.ts';
import { FakeGm, META, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const original = '(고개를 들고 붉은 눈을 똑바로 마주한다) 길을 잃었을 뿐이에요.';

class ReadingClient extends LlmClient {
  readonly requests: ChatRequest[] = [];
  constructor(private readonly text: string, private readonly primary: string, private readonly change: string) {
    super({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1 });
  }
  override async chatJson(request: ChatRequest): Promise<LlmResult> {
    this.requests.push(request);
    return {
      text: request.system === CHANGE_SYSTEM ? JSON.stringify({ change: this.change, changes: actClauses(this.text).map(() => this.change) })
        : request.system === ATTEMPT_CHECK_SYSTEM ? JSON.stringify({ supported: true })
        : this.primary,
      ttftMs: 0, totalMs: 0, promptTokens: 0, completionTokens: 0, promptMs: 0, genMs: 0, model: '분류 경계 fixture',
    };
  }
}

// 모의 분류 응답 이후의 실제 엔진 경계를 검증한다. 모델의 의미 분류 품질은 별도 실모델 검증 대상이다.
test.each([
  { name: '실제 첫 혼합', text: original, beat: 'b08_gaze', kind: 'action', change: '남에게 보이려는 몸짓', attempt: true },
  { name: '새 사회적 유지 표현', text: '(위압에 눌리지 않겠다는 뜻으로 몸을 곧추세우고 태도를 끝까지 유지한다)', beat: 'b08_gaze', kind: 'action', change: '남에게 보이려는 몸짓', attempt: true },
  { name: '호흡만 고름', text: '(천천히 숨을 고른다)', beat: 'b08_gaze', kind: 'idle', change: '저절로 드러난 몸 상태', attempt: false },
  { name: '눈색 관찰의 잘못된 시도 분류', text: '(붉은 눈의 색을 바라본다)', beat: 'b08_gaze', kind: 'action', change: OBSERVE_CHANGE, attempt: false },
  { name: '다른 장면의 같은 혼합', text: original, beat: 'b05_why', kind: 'person', change: OBSERVE_CHANGE, attempt: false },
])('$name: 분류된 의도와 현재 목표에 따라 판정 경계를 지킨다', async (row) => {
  const primary = JSON.stringify({
    reason: '현재 입력의 의도 분류', label: '태도 유지', question: '', kind: row.kind, about: 'none',
    approach: row.kind === 'action' ? 'stare_back' : 'none', target: row.kind === 'action' ? 'stare_back' : 'none',
    scope: row.kind === 'action' ? 'ready' : 'none', deed: '압박에 굴하지 않고 태도를 끝까지 유지한다',
    stat: '매력', difficulty: '보통', item: '', risk: 'none', absurd: false, odd: false, bold: false,
  });
  const client = new ReadingClient(row.text, primary, row.change);
  const actual = new LocalGm(client, lore);
  const fake = new FakeGm();
  const gm: GmPort = {
    interpret: (ctx) => actual.interpret(ctx), talk: (ctx) => fake.talk(ctx),
    narrate: (ctx) => fake.narrate(ctx), explain: (ctx) => fake.explain(ctx),
  };
  const engine = new Engine({ ...scenario, start: row.beat }, gm, () => 1000);
  const { state } = engine.newGame(10, row.name);
  const before = structuredClone(state);
  const result = await engine.act(state, { type: 'free', text: row.text });
  expect(result.step.events.filter((event) => event.type === 'roll')).toHaveLength(row.attempt ? 1 : 0);
  expect(result.state.log.filter((entry) => entry.kind === 'check').length - before.log.filter((entry) => entry.kind === 'check').length).toBe(row.attempt ? 1 : 0);
  if (!row.attempt) expect(result.state.rng).toBe(before.rng);
  const beat = scenario.beats[row.beat];
  if (!beat?.free) throw new Error('대조 장면 없음');
  expect(client.requests[0]?.system).toContain(beat.free.situation);
  expect(client.requests[0]?.user).toContain(row.text);
  for (const request of client.requests.filter((item) => item.system === CHANGE_SYSTEM)) expect(request.user).toContain(beat.free.situation);
});

test.each(['free', 'approach'] as const)('이미 달성한 눈_맞섬은 %s 경로에서도 재판정·비용·기록을 소비하지 않는다', async (type) => {
  const gm = new FakeGm(() => ({ kind: 'approach', approach: 'stare_back', item: null, source: 'rule', meta: META }));
  const engine = new Engine({ ...scenario, start: 'b08_gaze' }, gm, () => 1000);
  const { state } = engine.newGame(10, 'completed');
  state.flags.눈_맞섬 = true;
  const before = structuredClone(state);
  const result = await engine.act(state, type === 'free' ? { type, text: original } : { type, id: 'stare_back' });
  expect(result.step.events.some((event) => event.type === 'roll' || event.type === 'price')).toBe(false);
  expect(result.step.events.some((event) => event.type === 'notice' && event.kind === 'rewrite')).toBe(true);
  expect(result.state).toEqual(before);
});

test('새 판에서 얻은 두 miss는 비용·RNG·로그를 유지하며 구속 사실을 다음 서술에 넘긴다', async () => {
  const contexts: NarrateContext[] = [];
  let reads = 0;
  class ReplayGm extends FakeGm {
    override async interpret(_ctx: GmContext) {
      reads += 1;
      if (reads === 1) return {
        kind: 'clarify' as const, message: '가까이 다가가 길을 물을까?', source: 'llm' as const, meta: META,
        proposal: { target: 'run', deed: '사람들에게 달려가 크라차로 가는 길을 묻는다.', stat: '재치' as const, difficulty: 0, label: '사람들에게 달려가 길 묻기', bold: false, absurd: false, source: 'llm' as const, meta: META },
      };
      return { kind: 'approach' as const, approach: reads === 2 ? 'plead' : 'dodge', item: null, source: 'llm' as const, meta: META };
    }
    override async narrate(ctx: NarrateContext) {
      contexts.push(structuredClone(ctx));
      return super.narrate(ctx);
    }
  }
  // 원시 첫 실행과 동일한 행운 확인 없는 변형이다. 정상 앱의 행운 UI 검증으로 세지 않는다.
  const engine = new Engine(scenario, new ReplayGm(), () => 1000);
  let { state } = engine.newGame(913, 'two-misses');
  state = (await engine.act(state, { type: 'free', text: '(눈앞의 사람들에게 달려가 말을 건다) 길을 잃었어요. 가까운 마을이 어디인가요?' })).state;
  state = (await engine.act(state, { type: 'confirm', ok: true })).state;
  state = (await engine.act(state, { type: 'free', text: '길을 잃었어요. 당신들에게 해를 끼치려는 게 아니에요. 칼을 내려 주세요.' })).state;
  const first = structuredClone(state);
  state = (await engine.act(state, { type: 'free', text: '(몸을 옆으로 던져 날아오는 칼날을 피한다)' })).state;
  const binding = scenario.facts.find((fact) => fact.if === 'flag:팔_붙들림');
  if (!binding) throw new Error('구속 사실 없음');
  const beforeFirst = contexts.find((ctx) => ctx.price?.id === 'guard_grip');
  const beforeSecond = contexts.find((ctx) => ctx.price?.id === 'guard_hold');
  if (!beforeFirst || !beforeSecond) throw new Error('실제 두 비용을 재현하지 못함');
  expect(activeFacts(scenario, beforeFirst.state)).not.toContainEqual(binding);
  expect(activeFacts(scenario, beforeSecond.state)).toContainEqual(binding);
  expect(buildSystem(beforeFirst, loreFor(lore, beforeFirst.state))).not.toContain(binding.text);
  expect(buildSystem(beforeSecond, loreFor(lore, beforeSecond.state))).toContain(binding.text);
  expect(buildNarrateUser(beforeSecond, '', 4, 100)).toContain(beforeSecond.price?.text ?? '');
  expect(beforeFirst.price?.effects?.flags?.팔_붙들림).toBe(true);
  expect(beforeSecond.price?.effects?.flags?.팔_붙들림).toBe(true);
  expect(first.rng).toBe(3031296869);
  expect(state.rng).toBe(2399461199);
  expect(state.tracks).toEqual({ 체력: 2, 정신력: 2, 의심: 8, 집착: 0, 호감: 0, 귀찌: 7, 탈주: 1, 행운: 6 });
  expect(state.log.filter((entry) => entry.kind === 'price').map((entry) => entry.id)).toEqual(['guard_grip', 'guard_hold']);
  expect(state.log.filter((entry) => entry.kind === 'check').map((entry) => [entry.beat, entry.roll.tier, entry.roll.total])).toEqual([
    ['b02_people', 'hit', 10], ['b05_why', 'miss', 6], ['b06_swing', 'miss', 6],
  ]);
  expect(state.flags.팔_붙들림).toBe(true);
  expect(state.beat).toBe('b08_gaze');
});
