import { describe, expect, test } from 'bun:test';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { Engine, type GmContext, type Interpretation, type NarrateContext } from '../src/engine/engine.ts';
import { parseStoryInput } from '../src/engine/text.ts';
import type { GameEvent, GameState, Tier } from '../src/engine/types.ts';
import { correctionKind, LocalGm } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { ATTEMPT_CHECK_SYSTEM, CHANGE_SYSTEM, GRAMMAR_SYSTEM } from '../src/gm/prompt.ts';
import { approachOf, FakeGm, LORE_PATH, META, SCENARIO_PATH } from './helpers.ts';

// resume90 스토리 수정 2차(리드 결정 1~12)의 회귀. 모델 없이 엔진과 가짜 LlmClient 로 돈다.
const lore = await loadLore(LORE_PATH);
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const YES_NO = '글을 읽고 질문에 예/아니오로만 판정한다. JSON으로만 답한다.';

interface Replies {
  interpret?: object;
  audit?: object;
  lines?: object[];
  grammar?: (lines: { text: string }[]) => object;
  yes?: (user: string) => boolean;
}

class StubLlm extends LlmClient {
  readonly calls: ChatRequest[] = [];
  constructor(private readonly replies: Replies) {
    super({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 1000 });
  }

  override async chatJson(req: ChatRequest): Promise<LlmResult> {
    this.calls.push(req);
    return { text: this.answer(req), ttftMs: null, totalMs: 0, promptTokens: null, completionTokens: null, promptMs: null, genMs: null, model: 'stub' };
  }

  private answer(req: ChatRequest): string {
    if (req.system === GRAMMAR_SYSTEM) {
      const written = (JSON.parse(req.user) as { lines: { text: string }[] }).lines;
      return JSON.stringify(this.replies.grammar?.(written) ?? { lines: written.map((l) => ({ original: l.text, corrected: l.text })) });
    }
    if (req.system === ATTEMPT_CHECK_SYSTEM) return JSON.stringify(this.replies.audit ?? { supported: true, partial: false, typed: '' });
    if (req.system === CHANGE_SYSTEM) {
      const count = (req.schema as { properties?: { changes?: { minItems?: number } } }).properties?.changes?.minItems;
      return JSON.stringify(count !== undefined ? { changes: Array.from({ length: count }, () => '자리가 바뀜') } : { change: '자리가 바뀜' });
    }
    if (req.system === YES_NO) return JSON.stringify({ answer: this.replies.yes?.(req.user) ?? false });
    if (req.system.startsWith('플레이어 입력의 의도')) return JSON.stringify(this.replies.interpret ?? {});
    return JSON.stringify(this.replies.lines?.shift() ?? { lines: [] });
  }
}

const read = (fields: Record<string, unknown>) => ({
  reason: '근거', label: '행동', question: '', kind: 'action', about: 'none', risk: 'none', approach: 'none', target: 'local', scope: 'ready',
  item: '', odd: false, absurd: false, bold: false, deed: '', stat: '재치', difficulty: '보통', ...fields,
});

function ctxAt(beatId: string, text: string): GmContext {
  const engine = new Engine(campaign, new FakeGm());
  const { state } = engine.newGame(11, 'fix90-r2');
  state.beat = beatId;
  const beat = campaign.beats[beatId];
  if (!beat?.free) throw new Error(`${beatId} 자유 입력이 없습니다`);
  return { scenario: campaign, beat, free: beat.free, state, text, input: parseStoryInput(text) };
}

const lastTier = (state: GameState): Tier | undefined => {
  const check = state.log.findLast((entry) => entry.kind === 'check');
  return check?.kind === 'check' ? check.roll.tier : undefined;
};

function atProve(engine: Engine, seed: number, suspicion: number): GameState {
  const { state } = engine.newGame(seed, 'fix90-r2-prove');
  state.beat = 'r4_prove';
  state.free = { beat: 'r4_prove', talks: 0, rolls: 0, turns: 0 };
  state.tracks = { ...state.tracks, 의심: suspicion, 정신력: 3 };
  state.flags = { ...state.flags, 경고_spy_cut: true, 칼끝_만남: true, 거래: true };
  return state;
}

async function proveWith(tier: Tier, suspicion: number) {
  for (let seed = 1; seed <= 400; seed++) {
    const engine = new Engine(campaign, new FakeGm());
    const before = atProve(engine, seed, suspicion);
    const { state, step } = await engine.act(before, { type: 'approach', id: 'guide' });
    if (lastTier(state) === tier) return { before, state, step };
  }
  throw new Error(`${tier} 시드가 없습니다`);
}

describe('2차 1: 문턱에서 멈춘 성공의 화면 변화', () => {
  test('보이는 의심 변화의 합이 실제 변화와 같고 10으로 가는 변화가 나가지 않는다', async () => {
    const { before, state, step } = await proveWith('mixed', 9);
    const shown = step.events.flatMap((e) => (e.type === 'tracks' ? e.changes.filter((c) => c.key === '의심') : []));
    expect(shown.some((c) => c.to >= 10)).toBe(false);
    expect(shown.reduce((sum, c) => sum + c.to - c.from, 0)).toBe(state.tracks.의심 - before.tracks.의심);
    expect(state.ending).not.toBe('spy_cut');
  });
});

describe('2차 2: r4_prove 단추 성공', () => {
  test.each(['hit', 'mixed'] as const)('길 읽기 %s 는 쓸모_증명을 세운다', async (tier) => {
    const { state } = await proveWith(tier, 2);
    expect(state.flags['쓸모_증명']).toBe(true);
  });
});

describe('2차 3: 멀리서 피해 간 판의 수첩', () => {
  test('r3_slip 에서는 남자 항목이 열리지 않고, 처음 마주친 r3_night 에서 열린다', async () => {
    const reads = new FakeGm((): Interpretation => approachOf('avoid'));
    for (let seed = 1; seed <= 400; seed++) {
      const engine = new Engine(campaign, reads);
      let { state } = engine.newGame(seed, 'fix90-r2-slip');
      ({ state } = await engine.act(state, { type: 'approach', id: 'avoid' }));
      if (state.beat !== 'r3_dusk') continue;
      expect(state.flags['수첩:man']).toBeUndefined();
      const night = await engine.act(state, { type: 'approach', id: 'shelter' });
      if (!night.step.events.some((e) => e.type === 'scene' && e.beat === 'r3_night')) continue;
      expect(night.state.flags['수첩:man']).toBe(true);
      return;
    }
    throw new Error('r3_dusk 에 닿는 시드가 없습니다');
  });
});

describe('2차 10: 한 행동에 같은 인물의 말 반응은 한 줄', () => {
  test('서술에 남자의 대사가 있으면 b06 앞 반응 호출이 없다', async () => {
    class ManNarrates extends FakeGm {
      override async narrate(ctx: NarrateContext) {
        this.calls.push(`narrate:${ctx.approach.id}:${ctx.roll.tier}`);
        return { lines: [{ speaker: '나레이션', text: '행동' }, { speaker: '남자', text: '반응' }], meta: META };
      }
    }
    const gm = new ManNarrates((): Interpretation => ({ kind: 'improv', stat: '근력', difficulty: 0, label: '춤', absurd: false, bold: false, target: 'local', deed: '춤을 췄다', source: 'llm', meta: META }));
    const engine = new Engine(campaign, gm);
    let { state } = engine.newGame(5, 'fix90-r2-react');
    ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
    const { step, state: after } = await engine.act(state, { type: 'free', text: '(춤을 춘다)' });
    expect(after.beat).toBe('b06_swing');
    expect(gm.calls.filter((c) => c.startsWith('talk:')).length).toBe(0);
    const swingAt = step.events.findIndex((e) => e.type === 'scene' && e.beat === 'b06_swing');
    expect(step.events.slice(0, swingAt).filter((e) => e.type === 'line' && e.speaker === '남자').length).toBe(1);
  });
});

describe('2차 4: 괄호 행동은 모델 없는 지름길에 먹히지 않는다', () => {
  test('물음 꼴이 섞인 괄호 행동도 해석 호출로 가서 접근법으로 읽힌다', async () => {
    const text = '(모래 언덕 뒤에 납작 엎드려서 저 사람들이 어떤 사람들인지 먼저 지켜본다)';
    const llm = new StubLlm({ interpret: read({ approach: 'watch', target: 'watch', deed: '모래 언덕 뒤에 엎드려 지켜봤다' }) });
    const result = await new LocalGm(llm, lore).interpret(ctxAt('b02_people', text));
    expect(llm.calls.some((c) => c.system.startsWith('플레이어 입력의 의도'))).toBe(true);
    expect(result).toMatchObject({ kind: 'approach', approach: 'watch', source: 'llm' });
  });
});

describe('2차 5: 입력 검수는 한 방향, 일부만 한 행동은 그 부분만 굴린다', () => {
  const text = '(언덕을 내려가 저 사람들에게 다가간다)';
  const interpret = read({ approach: 'run', target: 'run', deed: '언덕을 내려가 사람들에게 다가갔다' });

  test('후보의 일부만 한 원문은 되돌리지 않고 실제로 한 부분을 범위로 싣는다', async () => {
    const llm = new StubLlm({ interpret, audit: { supported: true, partial: true, typed: '언덕을 내려가 사람들에게 다가갔다' } });
    const result = await new LocalGm(llm, lore).interpret(ctxAt('b02_people', text));
    expect(result).toMatchObject({ kind: 'approach', approach: 'run', scope: '언덕을 내려가 사람들에게 다가갔다' });
  });

  test('원문이 후보보다 많은 것을 주장하면 그대로 다시 적게 한다', async () => {
    const llm = new StubLlm({ interpret, audit: { supported: false, partial: false, typed: '' } });
    const result = await new LocalGm(llm, lore).interpret(ctxAt('b02_people', text));
    expect(result.kind).toBe('clarify');
  });

  test('엔진은 그 범위를 서술의 실제 행동(deed)과 상한(bound)으로 넘긴다', async () => {
    const seen: NarrateContext[] = [];
    class Capture extends FakeGm {
      override async narrate(ctx: NarrateContext) {
        seen.push(ctx);
        return super.narrate(ctx);
      }
    }
    const scope = '언덕을 내려가 사람들에게 다가갔다';
    for (let seed = 1; seed <= 200; seed++) {
      const gm = new Capture((): Interpretation => ({ kind: 'approach', approach: 'run', item: null, scope, source: 'llm', meta: META }));
      const engine = new Engine(campaign, gm);
      const { state } = engine.newGame(seed, 'fix90-r2-scope');
      const after = await engine.act(state, { type: 'free', text });
      const tier = lastTier(after.state);
      if (tier !== 'hit' && tier !== 'mixed') continue;
      const ctx = seen.at(-1);
      expect(ctx?.deed).toBe(scope);
      expect(ctx?.bound).toBe(scope);
      expect(after.state.free?.scope).toBeUndefined();
      return;
    }
    throw new Error('성공 시드가 없습니다');
  });
});

describe('2차 7: 교열은 1인칭을 지키고 잘못된 교정은 버린다', () => {
  test.each([
    ['다행히 세 사람은 내가 지나가는 것을 눈치채지 못한 듯했다.', '다행히 세 사람은 아시나가 지나가는 것을 눈치채지 못한 듯했다.', 'invalid'],
    ['그들의 말소리가 멀어질 때까지 나는 숨을 죽이고 걸어야 했다.', '그들의 말소리가 멀어질 때까지 아시나는 숨을 죽이고 걸었다.', 'invalid'],
    ['나는 무거운 발걸음을 옮기며 앞으로 나아갔다.', '무거운 발걸음을 옮기며 앞으로 나아갔다..', 'invalid'],
    ['남자의 눈이 가늘어졌다.', '남자의 눈이 가늘어졌다..', 'invalid'],
    ['나는 무거운 발걸음을 옮겼다.', '무거운 발걸음을 옮겼다.', 'invalid'],
    ['죽음이 피할 수 있는 건가.', '죽음을 피할 수 있는 건가.', 'small'],
    ['이대로 살려주는 것만으로도 감사히 여겨라.', '이대로 살려 주는 것만으로도 감사히 여겨라.', 'small'],
    ['남자는 내 말을 자르지 않고 끝까지 듣게 해주었다.', '남자는 칼을 든 채 내 해명이 끝날 때까지 잠자코 들었다.', 'rewrite'],
  ] as const)('%s → %s 는 %s', (original, corrected, kind) => {
    expect(correctionKind(original, corrected, '아시나')).toBe(kind);
  });

  test('시점을 바꾼 교정은 버리고 원문을 한 번에 내보낸다(위반·재생성 없음)', async () => {
    const original = '다행히 세 사람은 내가 지나가는 것을 눈치채지 못한 듯했다.';
    const llm = new StubLlm({
      lines: [{ lines: [{ speaker: '나레이션', text: original }, { speaker: '나레이션', text: '나는 숨을 골랐다.' }] }],
      grammar: (lines) => ({ lines: lines.map((l) => ({ original: l.text, corrected: l.text.replace('내가', '아시나가').replace(/\.$/u, '..') })) }),
    });
    const ctx = ctxAt('b02_people', '(몰래 돌아서 피해 간다)');
    const approach = ctx.free.approaches.find((a) => a.id === 'avoid');
    if (!approach) throw new Error('avoid 가 없습니다');
    const narrate: NarrateContext = { ...ctx, approach, roll: { label: approach.label, stat: approach.stat, statValue: 1, mods: [], dice: [5, 5], total: 11, tier: 'hit' }, outcome: approach.outcomes.hit };
    const reply = await new LocalGm(llm, lore).narrate(narrate);
    expect(reply.meta).toMatchObject({ attempts: 1, fallback: false });
    expect(reply.lines.map((l) => l.text)).toEqual([original, '나는 숨을 골랐다.']);
    expect(reply.meta.violations.some((v) => v.includes('grammar'))).toBe(false);
  });

  test('맞춤법 수준의 교정은 바로 적용한다', async () => {
    const llm = new StubLlm({
      lines: [{ lines: [{ speaker: '나레이션', text: '죽음이 피할 수 있는 건가 싶었다.' }, { speaker: '나레이션', text: '나는 숨을 골랐다.' }] }],
      grammar: (lines) => ({ lines: lines.map((l) => ({ original: l.text, corrected: l.text.replace('죽음이', '죽음을') })) }),
    });
    const ctx = ctxAt('b02_people', '(몰래 돌아서 피해 간다)');
    const approach = ctx.free.approaches.find((a) => a.id === 'avoid');
    if (!approach) throw new Error('avoid 가 없습니다');
    const narrate: NarrateContext = { ...ctx, approach, roll: { label: approach.label, stat: approach.stat, statValue: 1, mods: [], dice: [5, 5], total: 11, tier: 'hit' }, outcome: approach.outcomes.hit };
    const reply = await new LocalGm(llm, lore).narrate(narrate);
    expect(reply.meta.attempts).toBe(1);
    expect(reply.lines[0]?.text).toBe('죽음을 피할 수 있는 건가 싶었다.');
  });
});

describe('2차 9 → 3차 5: 되받기 플래그는 자유 입력으로 서지 않는다', () => {
  test('자기가 상인이라고 말해도 남의 사정을 말해도 되받기 플래그를 세우지 않는다(게임이 확정한 주장만 쓴다)', async () => {
    for (const text of ['북대륙 상인들이 요즘 뭘 사들이는지 다 알아요.', '저는 북대륙 상인이에요.']) {
      const engine = new Engine(campaign, new FakeGm((): Interpretation => ({ kind: 'talk', to: 'person', source: 'llm', meta: META })));
      const { state } = engine.newGame(3, 'fix90-r2-claims');
      state.beat = 'r4_prove';
      state.free = { beat: 'r4_prove', talks: 0, rolls: 0, turns: 0 };
      state.flags = { ...state.flags, 칼끝_만남: true };
      const after = await engine.act(state, { type: 'free', text });
      expect(after.state.flags['말_상인']).toBeUndefined();
    }
  });
});

describe('2차 11: 서술의 상한과 다음 장면', () => {
  test('엔진은 성공 서술에 목표 상한과 다음 장면 첫 사건을 넘긴다', async () => {
    const seen: NarrateContext[] = [];
    class Capture extends FakeGm {
      override async narrate(ctx: NarrateContext) {
        seen.push(ctx);
        return super.narrate(ctx);
      }
    }
    for (let seed = 1; seed <= 200; seed++) {
      const engine = new Engine(campaign, new Capture((): Interpretation => approachOf('plead')));
      let { state } = engine.newGame(seed, 'fix90-r2-bound');
      ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
      if (state.beat !== 'b05_why') continue;
      const after = await engine.act(state, { type: 'free', text: '저는 그냥 길을 잃은 여행자예요. 정말이에요.' });
      if (after.state.beat !== 'b06_swing' || lastTier(after.state) !== 'hit') continue;
      const ctx = seen.at(-1);
      expect(typeof ctx?.bound).toBe('string');
      // 계약(리드 결정, resume90 5차 1번): 다음 장면 첫 줄은 서술 입력에 넣지 않는다.
      expect(ctx && 'next' in ctx).toBe(false);
      return;
    }
    throw new Error('b05 성공 시드가 없습니다');
  });

  test('상한·다음 장면은 서술 지침으로만 넘기고 따로 판정하지 않는다(3차 1번)', async () => {
    const ctx = ctxAt('b05_why', '저는 그냥 길을 잃은 여행자예요.');
    const approach = ctx.free.approaches.find((a) => a.id === 'plead');
    if (!approach) throw new Error('plead 가 없습니다');
    const llm = new StubLlm({ lines: [{ lines: [{ speaker: '나레이션', text: '칼끝이 완전히 거둬졌다.' }, { speaker: '남자', text: '그것뿐인가.', face: 'neutral' }] }] });
    const narrate: NarrateContext = {
      ...ctx, approach, roll: { label: approach.label, stat: approach.stat, statValue: 1, mods: [], dice: [5, 5], total: 11, tier: 'hit' }, outcome: approach.outcomes.hit,
      bound: '결백을 호소한 내용을 끝까지 전달해 잠깐의 여유를 얻는다.',
    };
    const reply = await new LocalGm(llm, lore).narrate(narrate);
    expect(reply.meta).toMatchObject({ attempts: 1, fallback: false });
    expect(reply.meta.violations.some((v) => v.startsWith('beat/overreach'))).toBe(false);
    const generation = llm.calls.filter((c) => c.system !== GRAMMAR_SYSTEM && c.system !== YES_NO);
    expect(generation).toHaveLength(1);
    expect(generation[0]?.user).toContain(narrate.bound);
  });
});

describe('2차 12: 세계 밖 입력', () => {
  test('서술 줄 없이 상대의 받아넘기는 줄만 쓴다', async () => {
    const llm = new StubLlm({ lines: [{ lines: [{ speaker: '나레이션', text: '나는 주머니에서 매끄러운 물건을 꺼냈다.' }, { speaker: '남자', text: '…뭐?', face: 'neutral' }] }] });
    const ctx = ctxAt('b05_why', '(주머니에서 핸드폰을 꺼내 112에 전화를 건다)');
    const reply = await new LocalGm(llm, lore).talk({ ...ctx, absurd: true });
    expect(reply.lines.length).toBeGreaterThan(0);
    expect(reply.lines.every((l) => l.speaker !== '나레이션')).toBe(true);
  });

  test('엔진은 판정·수치 변화 없이 받는다', async () => {
    const gm = new FakeGm((): Interpretation => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '세계 밖', absurd: true, bold: false, odd: true, source: 'rule', meta: META }));
    const engine = new Engine(campaign, gm);
    let { state } = engine.newGame(5, 'fix90-r2-absurd');
    ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
    const before = structuredClone(state);
    const { state: after, step } = await engine.act(state, { type: 'free', text: '(주머니에서 핸드폰을 꺼내 112에 전화를 건다)' });
    expect(step.events.some((e: GameEvent) => e.type === 'roll' || e.type === 'tracks')).toBe(false);
    expect(after.tracks).toEqual(before.tracks);
    expect(after.log.filter((e) => e.kind === 'check').length).toBe(before.log.filter((e) => e.kind === 'check').length);
  });
});
