import { describe, expect, test } from 'bun:test';
import { loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { Engine, type GmContext, type Interpretation, type NarrateContext } from '../src/engine/engine.ts';
import { parseStoryInput } from '../src/engine/text.ts';
import type { GameState, Tier } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { ATTEMPT_CHECK_SYSTEM, CHANGE_SYSTEM, GRAMMAR_SYSTEM } from '../src/gm/prompt.ts';
import { approachOf, FakeGm, LORE_PATH, META, SCENARIO_PATH } from './helpers.ts';

// resume90 스토리 수정 3차(리드 결정 1~9)의 회귀. 모델 없이 엔진과 가짜 LlmClient 로 돈다.
const lore = await loadLore(LORE_PATH);
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const YES_NO = '글을 읽고 질문에 예/아니오로만 판정한다. JSON으로만 답한다.';

class StubLlm extends LlmClient {
  readonly calls: ChatRequest[] = [];
  constructor(private readonly replies: { interpret?: object; lines?: object[]; yes?: boolean }) {
    super({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 1000 });
  }

  override async chatJson(req: ChatRequest): Promise<LlmResult> {
    this.calls.push(req);
    return { text: this.answer(req), ttftMs: null, totalMs: 0, promptTokens: null, completionTokens: null, promptMs: null, genMs: null, model: 'stub' };
  }

  private answer(req: ChatRequest): string {
    if (req.system === GRAMMAR_SYSTEM) {
      const written = (JSON.parse(req.user) as { lines: { text: string }[] }).lines;
      return JSON.stringify({ lines: written.map((l) => ({ original: l.text, corrected: l.text })) });
    }
    if (req.system === ATTEMPT_CHECK_SYSTEM) return JSON.stringify({ supported: true, partial: false, typed: '' });
    if (req.system === CHANGE_SYSTEM) {
      const count = (req.schema as { properties?: { changes?: { minItems?: number } } }).properties?.changes?.minItems;
      return JSON.stringify(count !== undefined ? { changes: Array.from({ length: count }, () => '자리가 바뀜') } : { change: '자리가 바뀜' });
    }
    if (req.system === YES_NO) return JSON.stringify({ answer: this.replies.yes ?? false });
    if (req.system.startsWith('플레이어 입력의 의도')) return JSON.stringify(this.replies.interpret ?? {});
    return JSON.stringify(this.replies.lines?.shift() ?? { lines: [] });
  }
}

function ctxAt(beatId: string, text: string, flags: Record<string, boolean> = {}): GmContext {
  const engine = new Engine(campaign, new FakeGm());
  const { state } = engine.newGame(11, 'fix90-r3');
  state.beat = beatId;
  state.flags = { ...state.flags, ...flags };
  const beat = campaign.beats[beatId];
  if (!beat?.free) throw new Error(`${beatId} 자유 입력이 없습니다`);
  return { scenario: campaign, beat, free: beat.free, state, text, input: parseStoryInput(text) };
}

function narrateAt(beatId: string, approachId: string, text: string, extra: Partial<NarrateContext> = {}, flags: Record<string, boolean> = {}): NarrateContext {
  const ctx = ctxAt(beatId, text, flags);
  const approach = ctx.free.approaches.find((a) => a.id === approachId);
  if (!approach) throw new Error(`${approachId} 가 없습니다`);
  return { ...ctx, approach, roll: { label: approach.label, stat: approach.stat, statValue: 1, mods: [], dice: [5, 5], total: 11, tier: 'hit' }, outcome: approach.outcomes.hit, ...extra };
}

const lastTier = (state: GameState): Tier | undefined => {
  const check = state.log.findLast((entry) => entry.kind === 'check');
  return check?.kind === 'check' ? check.roll.tier : undefined;
};

describe('3차 1: 상한 판정 호출 없음', () => {
  test('서술 한 번에 생성·교열 외의 상한 판정 호출이 없고 overreach 위반도 없다', async () => {
    const llm = new StubLlm({ lines: [{ lines: [{ speaker: '나레이션', text: '남자는 내 말을 끝까지 들었다.' }, { speaker: '남자', text: '그것뿐인가.', face: 'neutral' }] }] });
    const reply = await new LocalGm(llm, lore).narrate(narrateAt('b05_why', 'plead', '저는 길을 잃었어요.', { bound: '끝까지 전달한다.' }));
    expect(reply.meta).toMatchObject({ attempts: 1, fallback: false });
    expect(llm.calls.filter((c) => c.system.startsWith('판정 결과 서술에서'))).toHaveLength(0);
    expect(reply.meta.violations.some((v) => v.includes('overreach'))).toBe(false);
  });
});

describe('3차 2: 전제 동작 검사(presume)', () => {
  const fled = { lines: [{ speaker: '나레이션', text: '나는 칼날 아래로 몸을 숙이고 모래 언덕 쪽으로 도망쳤다.' }, { speaker: '남자', text: '내버려 둬라.', face: 'neutral' }] };

  test('원문이 그 접근법 전체를 한 판정(달아나기를 골라 달아남)은 그 동작을 막지 않는다', async () => {
    const llm = new StubLlm({ lines: [structuredClone(fled)] });
    const reply = await new LocalGm(llm, lore).narrate(narrateAt('b06_swing', 'flee', '(칼날 아래로 몸을 숙이고 그대로 모래 언덕 쪽으로 냅다 달린다)'));
    expect(reply.meta).toMatchObject({ attempts: 1, fallback: false });
    expect(reply.meta.violations.some((v) => v.startsWith('beat/presume'))).toBe(false);
  });

  test('입력 검수가 일부만 했다고 좁힌 판정은 하지 않은 동작을 여전히 막는다', async () => {
    const llm = new StubLlm({ lines: [structuredClone(fled), structuredClone(fled), structuredClone(fled)] });
    const reply = await new LocalGm(llm, lore).narrate(narrateAt('b06_swing', 'flee', '(칼날 아래로 몸을 숙인다)', { deed: '칼날 아래로 몸을 숙였다' }));
    expect(reply.meta.violations.some((v) => v.startsWith('beat/presume'))).toBe(true);
  });
});

describe('3차 3: 감옥에서 시도하지 않으면', () => {
  test('굴리지 않고 같은 물음을 다시 걸지 않으며, 성공의 탈주 +2 없이 실패 결과(소음)로 자물쇠 장면을 지난다', async () => {
    const engine = new Engine(campaign, new FakeGm((): Interpretation => ({ kind: 'idle', source: 'llm', meta: META })), () => 1_000);
    const { state: fresh } = engine.newGame(913, 'fix90-r3-jail');
    fresh.beat = 'e_curious';
    fresh.ending = 'curious';
    fresh.free = null;
    const entered = await resumeCampaign(engine, fresh);
    expect(entered.state.beat).toBe('ep02_unlock');
    const checks = entered.state.log.filter((e) => e.kind === 'check').length;
    const { state, step } = await engine.act(entered.state, { type: 'free', text: '(차가운 돌바닥에 주저앉아 한참 멍하니 있는다)' });
    expect(state.log.filter((e) => e.kind === 'check').length).toBe(checks);
    expect(state.beat).not.toBe('ep02_unlock');
    expect(state.tracks.탈주).toBe(entered.state.tracks.탈주);
    expect(state.flags['탈옥_소음']).toBe(true);
    expect(state.flags['감옥_탈출']).toBe(true);
    expect(step.events.some((e) => e.type === 'scene' && e.beat === 'ep02_confidence')).toBe(true);
  });
});

describe('3차 4: 들을 사람이 없는 장면에서 말만 거듭하면', () => {
  test('b02 에서 말만 하면 재촉·머뭇이 쌓이고 장면의 결과(쓰러짐)가 온다', async () => {
    const engine = new Engine(campaign, new FakeGm((): Interpretation => ({ kind: 'talk', to: 'person', source: 'llm', meta: META })));
    let { state } = engine.newGame(2809, 'fix90-r3-talk');
    let moved = false;
    for (let i = 0; i < 8 && !state.ending && state.beat === 'b02_people'; i++) {
      ({ state } = await engine.act(state, { type: 'free', text: `저기요! 거기 누구 있어요? ${i}` }));
      if ((state.free?.moves?.length ?? 0) > 0) moved = true;
    }
    expect(moved || state.beat !== 'b02_people').toBe(true);
    expect(typeof state.flags['머뭇'] === 'number' && state.flags['머뭇'] >= 1).toBe(true);
    expect(state.ending === 'collapse' || state.beat !== 'b02_people').toBe(true);
    expect(state.log.filter((e) => e.kind === 'check')).toHaveLength(0);
  });

  test('들을 사람이 있는 장면의 대화는 그대로 소모하지 않는다(기존 계약)', async () => {
    const engine = new Engine(campaign, new FakeGm((): Interpretation => ({ kind: 'talk', to: 'person', source: 'llm', meta: META })));
    let { state } = engine.newGame(5, 'fix90-r3-listener');
    ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
    if (state.beat !== 'b05_why') throw new Error('b05_why 가 아닙니다');
    for (let i = 0; i < 6; i++) ({ state } = await engine.act(state, { type: 'free', text: `당신은 말투가 거칠군요 ${i}` }));
    expect(state.beat).toBe('b05_why');
    expect(state.free?.moves ?? []).toEqual([]);
  });
});

describe('3차 5: 해석은 자기 주장 칸을 돌려주지 않는다', () => {
  test('모델이 claims 를 적어 보내도 해석 결과에 남지 않는다', async () => {
    const llm = new StubLlm({ interpret: { reason: '근거', label: '말', question: '', kind: 'person', about: 'none', risk: 'none', approach: 'none', target: 'none', scope: 'none', item: '', odd: false, absurd: false, bold: false, deed: '', stat: '재치', difficulty: '보통', claims: ['말_상인'] } });
    const result = await new LocalGm(llm, lore).interpret(ctxAt('r4_prove', '북대륙 상인들이 뭘 사는지 다 알아요.'));
    expect('claims' in result).toBe(false);
    const schema = llm.calls.find((c) => c.system.startsWith('플레이어 입력의 의도'))?.schema as { properties: Record<string, unknown> } | undefined;
    expect(schema && 'claims' in schema.properties).toBe(false);
  });
});

describe('3차 6: 후드는 후드가 나올 때만 바뀐다', () => {
  test('머리카락을 쓸어 넘기는 입력·서술은 모델이 예라고 해도 후드 플래그를 세우지 않는다', async () => {
    const llm = new StubLlm({ yes: true, lines: [{ lines: [{ speaker: '나레이션', text: '머리카락을 쓸어 넘기며 보인 미소가 눈부셨다.' }, { speaker: '남자', text: '…뭐?', face: 'neutral' }] }] });
    const reply = await new LocalGm(llm, lore).narrate(narrateAt('b05_why', 'beauty', '(머리카락을 쓸어 넘기며 생긋 웃는다) 저처럼 예쁜 사람을 죽이면 아깝지 않아요?'));
    expect(reply.meta.setFlags ?? []).not.toContain('후드_벗음');
  });

  test('후드를 벗는다고 적은 입력과 그 서술은 후드 플래그를 세운다', async () => {
    const llm = new StubLlm({ yes: true, lines: [{ lines: [{ speaker: '나레이션', text: '나는 후드를 젖혀 얼굴을 드러냈다.' }, { speaker: '남자', text: '…뭐?', face: 'neutral' }] }] });
    const reply = await new LocalGm(llm, lore).narrate(narrateAt('b05_why', 'beauty', '(후드를 벗고 생긋 웃는다) 저처럼 예쁜 사람을 죽이면 아깝지 않아요?'));
    expect(reply.meta.setFlags ?? []).toContain('후드_벗음');
  });
});

describe('3차 9: 서술에 확정 수치 변화를 넘긴다', () => {
  test('실패·대가가 있는 판정의 서술 입력에 적용될 수치 변화가 들어 있다', async () => {
    const seen: NarrateContext[] = [];
    class Capture extends FakeGm {
      override async narrate(ctx: NarrateContext) {
        seen.push(ctx);
        return super.narrate(ctx);
      }
    }
    for (let seed = 1; seed <= 300; seed++) {
      const engine = new Engine(campaign, new Capture((): Interpretation => approachOf('run')));
      const { state } = engine.newGame(seed, 'fix90-r3-applied');
      const after = await engine.act(state, { type: 'free', text: '(사람들 쪽으로 달려간다)' });
      if (lastTier(after.state) !== 'miss') continue;
      const ctx = seen.at(-1);
      expect(ctx?.applied).toBeDefined();
      const sceneAt = after.step.events.findIndex((e) => e.type === 'scene');
      const shown = after.step.events.slice(0, sceneAt < 0 ? undefined : sceneAt).flatMap((e) => (e.type === 'tracks' ? e.changes : []));
      expect(shown.length).toBeGreaterThan(0);
      for (const change of shown) expect(ctx?.applied?.[change.key]).toBe(change.to - change.from);
      return;
    }
    throw new Error('실패 시드가 없습니다');
  });
});
