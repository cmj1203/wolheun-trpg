import { describe, expect, test } from 'bun:test';
import { loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { Engine, type GmContext, type Interpretation } from '../src/engine/engine.ts';
import { TIER_LABEL, type GameEvent, type GameState, type Tier } from '../src/engine/types.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { FakeGm, LORE_PATH, META, SCENARIO_PATH } from './helpers.ts';

// resume90 스토리 QA(work/continuation/resume90/story-qa/report.md) 결함 #4·#7·#12·#18·#25·#32 의 엔진 회귀.
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), await loadLore(LORE_PATH));

const lastTier = (state: GameState): Tier | undefined => {
  const check = state.log.findLast((entry) => entry.kind === 'check');
  return check?.kind === 'check' ? check.roll.tier : undefined;
};
const beatsEntered = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'scene' ? [e.beat] : []));

async function atWhy(gm: FakeGm, seed: number) {
  const engine = new Engine(campaign, gm);
  let { state } = engine.newGame(seed, 'fix90');
  ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
  return { engine, state };
}

describe('#18 대가 있는 성공은 그 자리에서 작은 끝으로 가지 않는다', () => {
  function atProve(engine: Engine, seed: number, suspicion: number): GameState {
    const { state } = engine.newGame(seed, 'fix90-prove');
    state.beat = 'r4_prove';
    state.free = { beat: 'r4_prove', talks: 0, rolls: 0, turns: 0 };
    state.tracks = { ...state.tracks, 의심: suspicion, 정신력: 3 };
    // 의심 7 징조는 앞 턴에 이미 나갔다(R2c 턴 3과 같은 상태).
    state.flags = { ...state.flags, 경고_spy_cut: true, 칼끝_만남: true, 거래: true };
    return state;
  }

  async function firstWith(tier: Tier, suspicion: number) {
    for (let seed = 1; seed <= 400; seed++) {
      const engine = new Engine(campaign, new FakeGm());
      const before = atProve(engine, seed, suspicion);
      const { state, step } = await engine.act(before, { type: 'approach', id: 'guide' });
      if (lastTier(state) === tier) return { state, step };
    }
    throw new Error(`${tier} 시드가 없습니다`);
  }

  test('의심 8에서 길 읽기가 대가 있는 성공이면 의심 두 칸이 붙어도 첩자 끝이 아니라 성공 목표(r4_walk)로 간다', async () => {
    const { state, step } = await firstWith('mixed', 8);
    expect(state.ending).not.toBe('spy_cut');
    expect(beatsEntered(step.events)).toContain('r4_walk');
    expect(beatsEntered(step.events)).not.toContain('x_spy_cut');
    expect(state.tracks.의심).toBe(9);
  });

  test('실패는 그대로다: 이미 징조가 나간 뒤 의심이 10에 닿는 실패는 첩자 끝으로 간다', async () => {
    const { state } = await firstWith('miss', 9);
    expect(state.tracks.의심).toBeGreaterThanOrEqual(10);
    expect(state.ending).toBe('spy_cut');
  });
});

describe('#32 상대를 해치는 큰 행동의 결과', () => {
  const stab = (risk: 'attack' | undefined) => new FakeGm((): Interpretation => ({
    kind: 'improv', stat: '손재주', difficulty: 0, label: '단검 공격', absurd: false, bold: true, target: 'local',
    deed: '호위의 단검을 낚아채 남자의 옆구리를 찔렀다', ...(risk ? { risk } : {}), source: 'llm', meta: META,
  }));

  async function stabWith(tier: Tier, risk: 'attack' | undefined) {
    for (let seed = 1; seed <= 400; seed++) {
      const { engine, state: why } = await atWhy(stab(risk), seed);
      if (why.beat !== 'b05_why') continue;
      const asked = await engine.act(why, { type: 'free', text: '(호위 허리춤의 단검을 낚아채서 남자의 옆구리를 찌른다)' });
      if (!asked.state.pendingIntent) throw new Error('큰 행동인데 의도 확인 창이 없습니다');
      const { state, step } = await engine.act(asked.state, { type: 'confirm', ok: true });
      if (lastTier(state) === tier) return { before: why, state, step };
    }
    throw new Error(`${tier} 시드가 없습니다`);
  }

  test('찌르기가 성공하면 호감은 오르지 않고 의심이 오른다(호감 +1·의심 0 이던 결함)', async () => {
    const { before, state } = await stabWith('hit', 'attack');
    expect(state.tracks.호감).toBe(before.tracks.호감);
    expect(state.tracks.의심 - before.tracks.의심).toBe(2);
    expect(state.flags['큰_행동']).toBe(true);
  });

  test('대가 있는 성공도 굴릴 수 있고(비용 중복 거절 없음) 공격의 의심은 그대로, 대가는 따로 붙는다', async () => {
    const { before, state, step } = await stabWith('mixed', 'attack');
    expect(step.events.some((e) => e.type === 'notice' && e.kind === 'rewrite')).toBe(false);
    expect(state.tracks.호감).toBe(before.tracks.호감);
    expect(state.tracks.의심 - before.tracks.의심).toBe(2);
    expect(step.events.filter((e) => e.type === 'price').length).toBe(1);
  });

  test('공격이 아닌 큰 행동(뽀뽀 등)은 그대로 흥미·호감 묶음을 쓴다', async () => {
    const { before, state } = await stabWith('hit', undefined);
    expect(state.tracks.호감 - before.tracks.호감).toBe(1);
    expect(state.tracks.집착 - before.tracks.집착).toBe(2);
  });
});

describe('#25 감옥에서 아무것도 시도하지 않으면 장면이 스스로 넘어간다', () => {
  test('무행동 입력은 주사위 없이 ep02_unlock 을 떠나고 같은 물음을 다시 걸지 않는다', async () => {
    const engine = new Engine(campaign, new FakeGm((): Interpretation => ({ kind: 'idle', source: 'llm', meta: META })), () => 1_000);
    const { state: fresh } = engine.newGame(913, 'fix90-jail');
    fresh.beat = 'e_curious';
    fresh.ending = 'curious';
    fresh.free = null;
    const entered = await resumeCampaign(engine, fresh);
    expect(entered.state.beat).toBe('ep02_unlock');
    const checks = entered.state.log.filter((e) => e.kind === 'check').length;
    const { state, step } = await engine.act(entered.state, { type: 'free', text: '(아무것도 안 하고 가만히 있는다)' });
    expect(state.log.filter((e) => e.kind === 'check').length).toBe(checks);
    expect(state.beat).not.toBe('ep02_unlock');
    expect(beatsEntered(step.events)).toContain('ep02_confidence');
    expect(state.flags['감옥_탈출']).toBe(true);
  });
});

describe('#4 직접 적은 미인계는 후드를 벗기지 않는다', () => {
  const beautyRead = (): Interpretation => ({ kind: 'approach', approach: 'beauty', item: null, spoken: true, source: 'llm', meta: META });

  async function freeBeauty(gm: FakeGm) {
    for (let seed = 1; seed <= 400; seed++) {
      const { engine, state: why } = await atWhy(gm, seed);
      if (why.beat !== 'b05_why' || why.flags['후드_벗음'] === true) continue;
      const result = await engine.act(why, { type: 'free', text: '저처럼 예쁜 사람을 죽이면 아깝지 않아요?' });
      if (result.state.beat === 'b06_swing') return result;
    }
    throw new Error('b06 로 가는 시드가 없습니다');
  }

  test('후드를 말하지 않은 입력이면 후드는 b06 칼날 CG 뒤에야 벗겨지고, 그 전에 입식이 바뀌지 않는다', async () => {
    const { step, state } = await freeBeauty(new FakeGm(beautyRead));
    const swingAt = step.events.findIndex((e) => e.type === 'line' && e.cg === 'cg_swing');
    const spriteAt = step.events.findIndex((e) => e.type === 'sprite' && e.cast === '아시나');
    expect(swingAt).toBeGreaterThanOrEqual(0);
    expect(spriteAt).toBeGreaterThan(swingAt);
    expect(state.flags['후드_벗음']).toBe(true);
  });

  test('서술 검사가 후드를 벗었다고 본 입력은 그 자리에서 플래그가 켜진다', async () => {
    class HoodOff extends FakeGm {
      override async narrate(ctx: Parameters<FakeGm['narrate']>[0]) {
        const reply = await super.narrate(ctx);
        return { ...reply, meta: { ...META, setFlags: ['후드_벗음'] } };
      }
    }
    const { step } = await freeBeauty(new HoodOff(beautyRead));
    const swingAt = step.events.findIndex((e) => e.type === 'line' && e.cg === 'cg_swing');
    const spriteAt = step.events.findIndex((e) => e.type === 'sprite' && e.cast === '아시나');
    expect(spriteAt).toBeGreaterThanOrEqual(0);
    expect(spriteAt).toBeLessThan(swingAt);
  });
});

describe('#12 피해 간 판의 r3_night', () => {
  test('칼끝 앞에서 만난 적이 없으면 남자가 아시나보다 먼저 그녀를 평하지 않는다', async () => {
    const reads = new FakeGm((ctx: GmContext): Interpretation => ({ kind: 'approach', approach: ctx.beat.id === 'b02_people' ? 'avoid' : 'shelter', item: null, source: 'llm', meta: META }));
    for (let seed = 1; seed <= 400; seed++) {
      const engine = new Engine(campaign, reads);
      let { state } = engine.newGame(seed, 'fix90-slip');
      ({ state } = await engine.act(state, { type: 'approach', id: 'avoid' }));
      if (state.beat !== 'r3_dusk') continue;
      const { step, state: after } = await engine.act(state, { type: 'approach', id: 'shelter' });
      const nightAt = step.events.findIndex((e) => e.type === 'scene' && e.beat === 'r3_night');
      if (nightAt < 0) continue;
      expect(after.flags['칼끝_만남']).toBeUndefined();
      const night = step.events.slice(nightAt + 1);
      const end = night.findIndex((e) => e.type === 'scene');
      const lines = (end < 0 ? night : night.slice(0, end)).filter((e): e is Extract<GameEvent, { type: 'line' }> => e.type === 'line');
      const manAt = lines.findIndex((l) => l.speaker === '남자');
      const heroAt = lines.findIndex((l) => l.speaker === '아시나');
      expect(heroAt).toBeGreaterThanOrEqual(0);
      expect(manAt).toBeGreaterThan(heroAt);
      return;
    }
    throw new Error('r3_night 에 닿는 시드가 없습니다');
  });
});

describe('#7 행운으로 실패를 올리면 등급이 바뀐 것이 화면에 나온다', () => {
  test('실패 → 아슬아슬한 성공 변화가 행운 사용 턴의 이벤트에 있다', async () => {
    for (let seed = 1; seed <= 400; seed++) {
      const engine = new Engine(campaign, new FakeGm(), Date.now, true);
      const { state } = engine.newGame(seed, 'fix90-luck');
      const failed = await engine.act(state, { type: 'approach', id: 'run' });
      if (!failed.state.pendingLuck || lastTier(failed.state) !== 'miss') continue;
      const { step, state: after } = await engine.act(failed.state, { type: 'luck', use: true });
      expect(lastTier(after)).toBe('mixed');
      const parts = step.events.flatMap((e) => (e.type === 'change' ? e.parts.map((p) => p.text) : []));
      expect(parts).toContain(`${TIER_LABEL.miss} → ${TIER_LABEL.mixed}`);
      return;
    }
    throw new Error('행운을 묻는 실패 시드가 없습니다');
  });
});
