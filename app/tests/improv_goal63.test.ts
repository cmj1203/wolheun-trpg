import { describe, expect, test } from 'bun:test';
import { Engine, type GmContext, type ImprovPlan, type Interpretation, type NarrateContext } from '../src/engine/engine.ts';
import { assertState } from '../src/engine/save.ts';
import type { GameState, Tier } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { CHANGE_SYSTEM } from '../src/gm/prompt.ts';
import { FakeGm, META, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const plan = (target: string, extra: Partial<ImprovPlan> = {}): Interpretation & { kind: 'improv' } => ({
  kind: 'improv', target, deed: '모래를 튀겨 시야를 가린 사이 달아났다', stat: '손재주',
  difficulty: 0, label: '모래로 도주', absurd: false, bold: false, source: 'llm', meta: META, ...extra,
});
function ready(beat: string, reading: Interpretation, seed = 1, luck = false) {
  const gm = new FakeGm(() => reading);
  const engine = new Engine({ ...scenario, start: beat }, gm, () => 1000, luck);
  const { state } = engine.newGame(seed, `goal63-${seed}`);
  state.tracks.체력 = 1;
  state.tracks.정신력 = 4;
  state.tracks.의심 = 0;
  state.tracks.귀찌 = 7;
  state.tracks.행운 = 10;
  state.rng = seed;
  return { engine, gm, state };
}
async function resolved(beat: string, target: string, tier: Tier, extra: Partial<ImprovPlan> = {}) {
  for (let seed = 1; seed <= 120; seed++) {
    const run = ready(beat, plan(target, extra), seed);
    const result = await run.engine.act(run.state, { type: 'free', text: '(모래를 튀겨 시야를 가린 사이 달아난다)' });
    if (result.step.events.some(e => e.type === 'roll' && e.tier === tier)) return { ...run, before: run.state, ...result };
  }
  throw new Error(`${beat}/${target}: ${tier} 판정 없음`);
}
const checks = (state: GameState) => state.log.filter(e => e.kind === 'check');

describe('즉흥의 성공 목표는 기법과 분리된다', () => {
  test.each(['hit', 'mixed', 'crit'] as const)('%s 도주는 저체력에서도 실제 도주 경로와 한 번의 비용을 보존한다', async tier => {
    const { before, state, step } = await resolved('b05_why', 'resist', tier);
    expect(state.flags.도주).toBe(true);
    expect(state.beat).toBe('r3_dusk');
    expect(state.log.filter(e => e.kind === 'beat').map(e => e.beat)).toEqual(['b05_why', 'r3_flee', 'r3_dusk']);
    expect(state.tracks.체력).toBe(1);
    expect(state.tracks.의심).toBe(0);
    expect(state.tracks.정신력).toBe(before.tracks.정신력 + (tier === 'mixed' ? -1 : 1));
    expect(step.events.flatMap(e => e.type === 'price' ? [e.id] : [])).toEqual(tier === 'mixed' ? ['mind_strain'] : []);
    expect(checks(state)[0]?.improv?.target).toBe('resist');
  });

  test.each([
    ['b02_people', 'avoid', 'r3_slip'], ['b06_swing', 'flee', 'r3_flee'],
    ['b08_gaze', 'flee', 'r3_flee'], ['r2_bind', 'flee', 'r3_flee'],
    ['r4_prove', 'flee', 'r3_flee'], ['r5_claim', 'flee', 'r3_flee'],
  ] as const)('%s의 다른 도주 기법도 %s 목표 경로를 쓴다', async (beat, goal, via) => {
    const { state } = await resolved(beat, goal, 'mixed');
    expect(state.log.filter(e => e.kind === 'beat').map(e => e.beat)).toEqual([beat, via, 'r3_dusk']);
    expect(state.flags.도주).toBe(true);
    expect(state.flags.포박).toBe(false);
  });

  test('같은 목표를 새 기법으로 달성해도 고정 접근의 물건·선행 효과·발화를 복사하지 않는다', async () => {
    const copy = structuredClone(scenario);
    const fixed = copy.beats.b05_why?.free?.approaches.find(a => a.id === 'resist');
    if (!fixed) throw new Error('resist 없음');
    fixed.item = 'magic_bag';
    fixed.before = { flags: { 다른_기법: true } };
    fixed.said = { flag: '말하지_않음', words: ['도주'] };
    const { before } = await resolved('b05_why', 'resist', 'hit');
    before.items = before.items.filter(id => id !== 'magic_bag');
    const engine = new Engine(copy, new FakeGm(() => plan('resist')), () => 1000);
    const { state } = await engine.act(before, { type: 'free', text: '(모래를 튀겨 시야를 가린 사이 달아난다)' });
    expect(state.flags.도주).toBe(true);
    expect(state.flags.다른_기법).toBeUndefined();
    expect(state.flags.말하지_않음).toBeUndefined();
    expect(checks(state)[0]?.roll.stat).toBe('손재주');
  });

  test('유효한 독립 비용이 없는 목표는 굴리기 전에 전체 상태를 보존한다', async () => {
    const { engine, state } = ready('b05_why', plan('resist'));
    state.tracks.정신력 = 0;
    const result = await engine.act(state, { type: 'free', text: '(모래를 튀겨 달아난다)' });
    expect(result.state).toEqual(state);
    expect(result.step.events.filter(e => e.type === 'roll')).toHaveLength(0);
    expect(result.step.events.some(e => e.type === 'notice' && e.kind === 'rewrite')).toBe(true);
  });

  test('혼합 성공의 경로는 비용으로 조건이 바뀌기 전에 확정한다', async () => {
    const copy = structuredClone(scenario);
    const free = copy.beats.b05_why?.free;
    const goal = free?.goals?.resist;
    if (!free || !goal) throw new Error('목표 없음');
    goal.next = [{ if: '정신력 >= 4', to: 'r3_flee' }, { to: 'b06_swing' }];
    const { before } = await resolved('b05_why', 'resist', 'mixed');
    const engine = new Engine(copy, new FakeGm(() => plan('resist')), () => 1000);
    expect((await engine.act(before, { type: 'free', text: '(모래를 튀겨 달아난다)' })).state.beat).toBe('r3_dusk');
  });

  test('빈 추첨 목록의 인라인 비용은 행운과 저장 뒤에도 한 번만 낸다', async () => {
    const copy = structuredClone(scenario);
    const free = copy.beats.b05_why?.free;
    const goal = free?.goals?.resist;
    if (!free || !goal) throw new Error('목표 없음');
    goal.price = [];
    free.improv.mixed = { ...free.improv.mixed, price: [], effects: { tracks: { 정신력: -1 } } };
    for (let seed = 1; seed <= 120; seed++) {
      const { state } = ready('b05_why', plan('resist'), seed);
      const engine = new Engine(copy, new FakeGm(() => plan('resist', { difficulty: -1 })), () => 1000, true);
      const held = await engine.act(state, { type: 'free', text: '(모래를 튀겨 달아난다)' });
      if (!held.state.pendingLuck) continue;
      const done = await engine.act(assertState(copy, JSON.parse(JSON.stringify(held.state))), { type: 'luck', use: true });
      expect(done.state.beat).toBe('r3_dusk');
      expect(done.state.tracks.정신력).toBe(3);
      expect(done.step.events.filter(e => e.type === 'price')).toHaveLength(0);
      expect(checks(done.state)).toHaveLength(1);
      return;
    }
    throw new Error('행운 대기 없음');
  });

  test.each(['empty', 'floor', 'locked', 'duplicate'] as const)('%s 비용 계약은 성공을 굴린 뒤 고치지 않고 사전 차단한다', async mode => {
    const copy = structuredClone(scenario);
    const free = copy.beats.b05_why?.free;
    const goal = free?.goals?.resist;
    if (!free || !goal) throw new Error('목표 없음');
    goal.price = mode === 'duplicate' ? ['mind_strain'] : [];
    free.improv.mixed = { ...free.improv.mixed, price: [], effects: mode === 'empty' ? undefined : mode === 'locked' ? { tracks: { 귀찌: -1 } } : { tracks: { 정신력: -1 } } };
    const { state } = ready('b05_why', plan('resist'));
    if (mode === 'floor') state.tracks.정신력 = 0;
    const engine = new Engine(copy, new FakeGm(() => plan('resist')), () => 1000);
    const result = await engine.act(state, { type: 'free', text: '(모래를 튀겨 달아난다)' });
    expect(result.state).toEqual(state);
    expect(result.step.events.filter(e => e.type === 'roll')).toHaveLength(0);
  });
});

describe('범위 동의와 저장은 승인한 계획 하나를 실행한다', () => {
  const scoped: Interpretation = {
    kind: 'clarify', message: '지속적인 시력 손상은 후속 상태가 없어. 모래로 시야를 가리고 벗어나는 범위는 가능해.',
    proposal: plan('resist'), source: 'llm', meta: META,
  };

  test('미지원 목표의 카드와 거절은 턴·RNG·플래그·시간을 소비하지 않는다', async () => {
    const { engine, state } = ready('b05_why', scoped);
    state.warned = ['모래로영원히눈멀게한다'];
    const held = await engine.act(state, { type: 'free', text: '(모래로 영원히 눈멀게 한다) 나는 공녀야' });
    expect(held.state).toEqual({ ...state, pendingIntent: held.state.pendingIntent });
    expect(held.state.pendingIntent?.target).toBe('resist');
    expect(held.step.events.filter(e => e.type === 'confirm')).toHaveLength(1);
    expect((await engine.act(held.state, { type: 'confirm', ok: false })).state).toEqual(state);
  });

  test('저장한 범위를 승인하면 재해석이나 두 번째 확인 없이 같은 능력치로 한 번 굴린다', async () => {
    const { engine, gm, state } = ready('b05_why', scoped);
    const held = await engine.act(state, { type: 'free', text: '(모래로 영원히 눈멀게 한다)' });
    const restored = assertState(scenario, JSON.parse(JSON.stringify(held.state)));
    const done = await engine.act(restored, { type: 'confirm', ok: true });
    expect(checks(done.state)).toHaveLength(1);
    expect(checks(done.state)[0]?.roll.stat).toBe('손재주');
    expect(checks(done.state)[0]?.improv).toEqual({ absurd: false, bold: false, target: 'resist', deed: scoped.proposal?.deed });
    expect(gm.calls.filter(c => c.startsWith('interpret:'))).toHaveLength(1);
    expect(done.step.events.filter(e => e.type === 'confirm')).toHaveLength(0);
  });

  test('실행 가능한 대안도 없으면 카드 없이 무소비 재입력을 받는다', async () => {
    const { engine, state } = ready('b05_why', { ...scoped, proposal: undefined });
    const result = await engine.act(state, { type: 'free', text: '(칼을 빼앗아 영원히 무장 해제한다)' });
    expect(result.state).toEqual(state);
    expect(result.step.events.some(e => e.type === 'notice' && e.kind === 'rewrite')).toBe(true);
  });

  test('목표 필드가 없던 일반 저장은 목표를 지어내지 않고 새 판정을 시작한다', async () => {
    const { engine, state } = ready('b05_why', plan('resist'));
    const restored = assertState(scenario, JSON.parse(JSON.stringify(state)));
    expect(engine.resume(restored).prompt.type).toBe('free');
    expect(restored.pendingIntent).toBeUndefined();
    expect(restored.pendingLuck).toBeUndefined();
    const result = await engine.act(restored, { type: 'free', text: '(모래를 튀겨 달아난다)' });
    expect(checks(result.state)).toHaveLength(1);
    expect(checks(result.state)[0]?.improv?.target).toBe('resist');
  });

  test('대사 도중 범위 확인은 승인할 때만 남은 줄을 지운다', async () => {
    const { engine, state } = ready('b05_why', scoped);
    const held = await engine.act(state, { type: 'interject', scene: state.beat, shown: [], pending: [{ i: 4, text: '아직 나오지 않은 줄' }], text: '(모래로 영원히 눈멀게 한다)' });
    expect(held.step.events.filter(e => e.type === 'revise')).toHaveLength(0);
    expect(held.state).toEqual({ ...state, pendingIntent: held.state.pendingIntent });
    const done = await engine.act(assertState(scenario, JSON.parse(JSON.stringify(held.state))), { type: 'confirm', ok: true });
    expect(done.step.events.filter(e => e.type === 'revise')).toEqual([{ type: 'revise', drop: [4], jump: true }]);
    expect(checks(done.state)).toHaveLength(1);
  });

  test('행운과 저장 복원은 실패 때의 목표를 그대로 mixed로 확정한다', async () => {
    for (let seed = 1; seed <= 120; seed++) {
      const { engine, state } = ready('b05_why', plan('resist', { difficulty: -1 }), seed, true);
      const failed = await engine.act(state, { type: 'free', text: '(모래를 튀겨 달아난다)' });
      if (!failed.state.pendingLuck) continue;
      expect(failed.state.flags.도주).toBeUndefined();
      const restored = assertState(scenario, JSON.parse(JSON.stringify(failed.state)));
      const success = await engine.act(restored, { type: 'luck', use: true });
      expect(success.state.beat).toBe('r3_dusk');
      expect(success.state.tracks.정신력).toBe(3);
      expect(checks(success.state)).toHaveLength(1);
      expect(checks(success.state)[0]?.improv?.target).toBe('resist');
      expect(checks(success.state)[0]?.roll.tier).toBe('mixed');
      const legacy = structuredClone(restored);
      if (legacy.pendingLuck?.improv) delete legacy.pendingLuck.improv.target;
      await expect(engine.act(legacy, { type: 'luck', use: true })).rejects.toThrow('옛 저장');
      expect((await engine.act(legacy, { type: 'luck', use: false })).state.pendingLuck).toBeUndefined();
      return;
    }
    throw new Error('행운 대기 사례 없음');
  });
});

test('현장에서 완료한 대담한 행동은 성공 기록과 실제 fallback에 남는다', async () => {
  const gm = new LocalGm(null, lore);
  class ReceivingGm extends FakeGm {
    override narrate(ctx: NarrateContext) { return gm.narrate(ctx); }
  }
  const reading = plan('local', { bold: true, deed: '남자의 뺨에 입을 맞췄다' });
  const { before } = await resolved('b05_why', 'resist', 'hit');
  const engine = new Engine(scenario, new ReceivingGm(() => reading), () => 1000);
  const held = await engine.act(before, { type: 'free', text: '(남자의 뺨에 입을 맞춘다)' });
  const done = await engine.act(held.state, { type: 'confirm', ok: true });
  expect(checks(done.state)[0]?.improv?.target).toBe('local');
  expect(done.state.flags.도주).toBeUndefined();
  expect(done.state.flags.큰_행동).toBe(true);
  expect(done.step.events.some(e => e.type === 'line' && e.text === `${reading.deed}.`)).toBe(true);
});

class InterpretationClient extends LlmClient {
  constructor(private readonly response: Record<string, unknown>) { super({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1 }); }
  override async chatJson(request: ChatRequest): Promise<LlmResult> {
    return { text: JSON.stringify(request.system === CHANGE_SYSTEM ? { change: '자리가 바뀜' } : this.response),
      ttftMs: 0, totalMs: 0, promptTokens: 0, completionTokens: 0, promptMs: 0, genMs: 0, model: 'fixture' };
  }
}
function context(): GmContext {
  const beat = scenario.beats.b05_why;
  if (!beat?.free) throw new Error('free 없음');
  return { scenario, beat, free: beat.free, state: ready(beat.id, plan('resist')).state,
    text: '(손끝으로 모래를 튀겨 달아난다)', input: { kind: 'valid', explicit: true, action: '손끝으로 모래를 튀겨 달아난다', speech: '' } };
}
test.each([{}, { target: 'none', scope: 'ready' }, { target: 'unknown', scope: 'ready' }, { target: 'resist', scope: 'ready', deed: '' }])('해석 경계의 불완전한 목표 %j는 임의 local 판정으로 복구하지 않는다', async fields => {
  const gm = new LocalGm(new InterpretationClient({ kind: 'action', approach: 'none', stat: '손재주', difficulty: '보통', deed: '모래를 튀겨 달아났다', ...fields }), lore);
  expect((await gm.interpret(context())).kind).toBe('clarify');
});
test('세계 밖 행동은 해석 목표가 섞여도 판정으로 가지 않는다', async () => {
  const { engine, state } = ready('b05_why', plan('resist', { absurd: true, risk: 'attack', bold: true }));
  let current = state;
  for (let i = 0; i < 4; i++) current = (await engine.act(current, { type: 'free', text: '(휴대폰으로 구조를 부른다)' })).state;
  expect(checks(current)).toHaveLength(0);
  expect(current.flags).toEqual(state.flags);
  expect(current.beat).toBe(state.beat);
  expect(current.pendingIntent).toBeUndefined();
  expect(current.tracks).toEqual(state.tracks);
});
