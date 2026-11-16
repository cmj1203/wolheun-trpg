import { describe, expect, test } from 'bun:test';
import { Engine, type GmContext } from '../src/engine/engine.ts';
import { FakeGm, META, approachOf, loadDesert } from './helpers.ts';

const scenario = await loadDesert();
const sandEating = { kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥 행동', absurd: false, bold: false, odd: true, deed: '모래를 한 줌 집어 입에 넣었다', source: 'llm', meta: META } as const;

describe('61차: 엉뚱한 딴짓과 선택지 행동', () => {
  test('딴짓(모래 먹기)은 주사위·수치 변화 없이 장면에 머물고, 피해 가는 길이 그대로 남는다', async () => {
    const gm = new FakeGm(() => sandEating);
    const engine = new Engine(scenario, gm);
    let { state } = engine.newGame(93994131, 'odd61');
    const tracks = structuredClone(state.tracks);
    const result = await engine.act(state, { type: 'free', text: '(모래를 먹는다)' });
    state = result.state;
    expect(state.log.some((e) => e.kind === 'check')).toBe(false);
    expect(result.step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(state.tracks).toEqual(tracks);
    expect(state.beat).toBe('b02_people');
    expect(result.step.prompt.type).toBe('free');
    expect(gm.calls).toContain('talk:(모래를 먹는다)');
    const avoid = await engine.act(state, { type: 'approach', id: 'avoid' });
    expect(avoid.state.log.some((e) => e.kind === 'choice' && e.choice === 'approach:avoid')).toBe(true);
  });

  test('선택지로 고른 행동(마법 가방) 뒤 남자는 감정이 아니라 그 행동을 받는다', async () => {
    const seen: GmContext[] = [];
    class Capture extends FakeGm {
      override async talk(ctx: GmContext) {
        seen.push(ctx);
        return super.talk(ctx);
      }
    }
    // 아시나가 대사 없이 끝나는 판정(사용자 판 ad574a90 의 대가 있는 성공 등)에서만 남자의 반응 줄이 붙는다. 그런 판을 시드로 찾는다.
    for (let seed = 1; seed <= 40 && !seen.some((c) => c.reaction); seed++) {
      const engine = new Engine(scenario, new Capture(() => approachOf('run')));
      let { state } = engine.newGame(seed, `bag61-${seed}`);
      ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
      if (state.beat !== 'b05_why') continue;
      const { 말함_b05_why: _, ...flags } = state.flags;
      await engine.act({ ...state, flags }, { type: 'approach', id: 'bag' });
    }
    const reaction = seen.find((c) => c.reaction === true);
    expect(reaction?.text).toBe('마법 가방에서 물건을 꺼낸다');
    expect(reaction?.acted).toBe(true);
    expect(reaction?.spoken).toBeUndefined();
  });
});
