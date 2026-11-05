import { describe, expect, test } from 'bun:test';
import { checkScenario } from '../src/engine/scenario.ts';
import { ruleInterpret } from '../src/gm/rules.ts';
import {
  ATTACK_LINES,
  BOLD_PICK,
  MAIN_STRATEGIES,
  PROPOSALS,
  SAFE_PICK,
  STRATEGIES,
  TALK_LINES,
  loadAll,
  makeEngine,
  patched,
  playOne,
  simulate,
  summarize,
  tierOdds,
  wilson,
} from '../scripts/balance_sim.ts';

const { scenario, lore } = await loadAll();
const freeBeats = Object.entries(scenario.beats).filter(([, b]) => b.free);

describe('균형 시뮬레이터 전략 정의', () => {
  test('말만 전략의 문장은 모든 자유 입력 장면에서 규칙 해석이 판정 없는 말로 읽는다', () => {
    for (const [id, b] of freeBeats)
      for (const text of TALK_LINES) expect({ id, text, kind: ruleInterpret(b.free!, text, scenario.sheet.items.map((i) => i.id), lore).kind }).toEqual({ id, text, kind: 'talk' });
  });

  test('공격 문장은 규칙 해석에서 판정(접근 또는 즉흥 행동)으로 간다', () => {
    for (const [id, b] of freeBeats)
      for (const text of ATTACK_LINES) expect(['approach', 'improv']).toContain(ruleInterpret(b.free!, text, scenario.sheet.items.map((i) => i.id), lore).kind);
  });

  test('안전·정면 표는 모든 자유 입력 장면의 실제 접근 id 를 가리킨다', () => {
    for (const table of [SAFE_PICK, BOLD_PICK]) {
      expect(Object.keys(table).sort()).toEqual(freeBeats.map(([id]) => id).sort());
      for (const [beat, ids] of Object.entries(table)) for (const id of ids) expect(scenario.beats[beat]!.free!.approaches.map((a) => a.id)).toContain(id);
    }
  });
});

describe('균형 시뮬레이터 한 판', () => {
  test('같은 시드는 같은 판이다', async () => {
    const engine = makeEngine({ scenario, lore });
    const a = await playOne(engine, STRATEGIES.random!, 77);
    const b = await playOne(engine, STRATEGIES.random!, 77);
    expect(b).toEqual(a);
  });

  test('본 전략 넷과 보조 전략은 막히지 않고 결말에 닿는다(긴장·행운 재구성은 엔진 값과 맞지 않으면 던진다)', async () => {
    for (const id of [...MAIN_STRATEGIES, 'bold', 'chat']) {
      const recs = await simulate(STRATEGIES[id]!, 60, { scenario, lore });
      for (const g of recs) {
        expect(g.stuck).toBe(false);
        expect(scenario.beats[g.ending]?.ending).toBeDefined();
        expect(g.beats.at(-1)).toBe(g.ending);
      }
    }
  });

  test('말만 하면 첫 장면에서 판정 없이 쓰러진다(지금 대본)', async () => {
    const recs = await simulate(STRATEGIES.talk!, 20, { scenario, lore });
    for (const g of recs) {
      expect(g.ending).toBe('x_collapse');
      expect(g.rolls).toHaveLength(0);
    }
  });

  test('--no-llm 규칙 해석으로는 칼 앞에서(x_reckless)에 닿지 않고, LLM 공격 해석을 가정하면 닿는다', async () => {
    const rule = await simulate(STRATEGIES.attack!, 200, { scenario, lore });
    expect(rule.some((g) => g.ending === 'x_reckless')).toBe(false);
    const llm = await simulate(STRATEGIES.attack!, 200, { scenario, lore, gm: 'attack-llm' });
    expect(llm.some((g) => g.ending === 'x_reckless')).toBe(true);
  });

  test('장면 고정 실험은 그 장면에서 고른 접근으로 굴린다', async () => {
    const recs = await simulate(STRATEGIES.random!, 40, { scenario, lore, force: { beat: 'b05_why', approach: 'bluff' } });
    for (const g of recs) for (const r of g.rolls.filter((x) => x.beat === 'b05_why')) expect(r.approach).toBe('bluff');
  });

  test('행운을 늘 쓰면 실패가 남는 것은 행운이 모자란 판정뿐이다', async () => {
    const recs = await simulate(STRATEGIES.safe!, 100, { scenario, lore });
    for (const g of recs) for (const r of g.rolls) if (r.tier === 'miss') expect(r.luckShort).toBe(true);
  });
});

describe('균형 집계', () => {
  test('2d6 등급 확률', () => {
    const o = tierOdds(0);
    expect(o.hit).toBeCloseTo(6 / 36, 10);
    expect(o.mixed).toBeCloseTo(15 / 36, 10);
    expect(o.miss).toBeCloseTo(15 / 36, 10);
    const t = tierOdds(2);
    expect(t.hit + t.mixed + t.miss).toBeCloseTo(1, 10);
    expect(t.hit).toBeCloseTo(15 / 36, 10);
  });

  test('윌슨 구간은 비율을 감싼다', () => {
    const w = wilson(30, 100);
    expect(w.lo).toBeLessThan(0.3);
    expect(w.hi).toBeGreaterThan(0.3);
    expect(wilson(0, 100).lo).toBe(0);
  });

  test('결말 합은 판 수다', async () => {
    const s = summarize(scenario, await simulate(STRATEGIES.random!, 50, { scenario, lore }));
    expect(Object.values(s.endings).reduce((a, b) => a + b, 0)).toBe(50);
    expect(s.raw.hit + s.raw.mixed + s.raw.miss).toBe(s.rolls);
  });
});

describe('조정안', () => {
  test('조정안은 사본에만 덧씌우고 원본 대본은 그대로다', () => {
    const before = JSON.stringify(scenario);
    const all = patched(scenario, Object.keys(PROPOSALS));
    expect(JSON.stringify(scenario)).toBe(before);
    expect(JSON.stringify(all)).not.toBe(before);
  });

  test('조정안을 모두 덧씌워도 시나리오 검사를 통과한다', () => {
    expect(checkScenario(scenario)).toEqual([]);
    expect(checkScenario(patched(scenario, Object.keys(PROPOSALS)))).toEqual([]);
  });

  test('조정안마다 바꾸는 곳을 적어 둔다', () => {
    for (const p of Object.values(PROPOSALS)) expect(p.changes.length).toBeGreaterThan(0);
  });
});
