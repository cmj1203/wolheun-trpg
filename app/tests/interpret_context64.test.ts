import { expect, test } from 'bun:test';
import { Engine, type GmContext } from '../src/engine/engine.ts';
import { parseStoryInput } from '../src/engine/text.ts';
import { GameError } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { ContextBudgetError, LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { loreFor } from '../src/gm/lore.ts';
import { buildInterpretSystem, buildInterpretUser, interpretSchema } from '../src/gm/prompt.ts';
import { FakeGm, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
function context(): GmContext {
  const { state } = new Engine({ ...scenario, start: 'b08_gaze' }, new FakeGm()).newGame(2, 'compact');
  const beat = scenario.beats.b08_gaze;
  if (!beat?.free) throw new Error('현재 목표 없음');
  const text = '(자세를 세우고 위압에 굴하지 않겠다는 태도를 유지한다) 물러서지 않겠어요.';
  return { scenario, state, beat, free: beat.free, text, input: parseStoryInput(text) };
}

test('분류 문맥은 생성 예문·무관한 장기 기억 증가에 흔들리지 않고 현재 참조를 보존한다', () => {
  const ctx = context();
  ctx.state = { ...ctx.state, recent: Array.from({ length: 4 }, (_, i) => ({ speaker: '남자', text: `CURRENT_REFERENCE_${i}` })) };
  const before = buildInterpretSystem(ctx, loreFor(lore, ctx.state));
  const long = structuredClone(ctx);
  long.state.recent.unshift(...Array.from({ length: 100 }, (_, i) => ({ speaker: '남자', text: `UNRELATED_OLD_${i}` })));
  for (let i = 0; i < 100; i++) {
    long.state.log.push({ kind: 'check', beat: 'b02_people', at: 0, playMs: 0,
      roll: { label: '과거', stat: '재치', statValue: 0, mods: [], dice: [5, 5], total: 10, tier: 'hit' },
      improv: { absurd: false, bold: false, deed: `UNRELATED_ACHIEVEMENT_${i}` } });
  }
  const changed = structuredClone(lore);
  for (const character of Object.values(changed.characters)) {
    character.voice.push('GENERATION_ONLY_VOICE');
    character.samples.speech.push('GENERATION_ONLY_SAMPLE');
  }
  const after = buildInterpretSystem(long, loreFor(changed, long.state));
  expect(after).toBe(before);
  for (const line of ctx.state.recent) expect(after).toContain(line.text);
  expect(after).toContain(ctx.free.situation);
  expect(after).toContain(ctx.free.goal);
});

test('현재 목표 완료·몸 상태·수치·소지품과 명시 동작/발화는 분류에 남는다', () => {
  const ctx = context();
  ctx.state.flags.팔_붙들림 = true;
  ctx.state.flags.눈_맞섬 = true;
  const visible = loreFor(lore, ctx.state);
  const system = buildInterpretSystem(ctx, visible), user = buildInterpretUser(ctx, visible);
  expect(system).toContain(JSON.stringify(ctx.state.tracks));
  expect(system).toContain(JSON.stringify(ctx.state.abilities));
  expect(system).toContain('호위가 이미 아시나의 팔을 붙들고 있다.');
  expect(system).toContain('위압에 굴하지 않겠다는 태도');
  expect(system).toContain('물러서지 않겠어요.');
  expect(user).toContain('stare_back');
  expect(user).toContain('이미 달성함');
  expect(JSON.stringify(interpretSchema(ctx.free, ctx.state.items, visible, [], undefined, true))).toContain('scene');
});

class OverBudgetClient extends LlmClient {
  calls = 0;
  constructor() { super({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1 }); }
  override async warm(): Promise<void> {}
  override async chatJson(request: ChatRequest): Promise<LlmResult> {
    this.calls += 1;
    expect(request.reserveContext).toBe(true);
    throw new ContextBudgetError(8192, 8000, request.maxTokens);
  }
}

test('입력 분류 예산 초과를 무관한 talk/행동 fallback으로 바꾸거나 재시도하지 않는다', async () => {
  const client = new OverBudgetClient();
  const ctx = context(), before = structuredClone(ctx.state);
  const engine = new Engine(ctx.scenario, new LocalGm(client, lore), () => 1000);
  await expect(engine.act(ctx.state, { type: 'free', text: ctx.text })).rejects.toBeInstanceOf(GameError);
  expect(client.calls).toBe(1);
  expect(ctx.state).toEqual(before);
});
