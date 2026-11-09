import { describe, expect, test } from 'bun:test';
import { ROUTES, FALLBACK_INPUT } from '../e2e/routes.ts';
import { Engine } from '../src/engine/engine.ts';
import type { GameEvent, GameState, Step } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const DEATH = '죽음을 맞이하게 될 줄은―';

/** 판 전체에 나온 사건(장면·줄)을 차례대로 모은다. */
async function play(seed: number, first: { type: 'approach'; id: string } | null, inputs: Record<string, string[]>) {
  const engine = new Engine(scenario, new LocalGm(null, lore));
  let { state, step } = engine.newGame(seed, 'opening60');
  const events: GameEvent[] = [...step.events];
  const queue = structuredClone(inputs);
  if (first) {
    ({ state, step } = await engine.act(state, first));
    events.push(...step.events);
  }
  for (let turn = 0; step.prompt.type === 'free' && turn < 30; turn++) {
    ({ state, step } = await engine.act(state, { type: 'free', text: queue[step.prompt.beat]?.shift() ?? FALLBACK_INPUT }));
    events.push(...step.events);
  }
  return { state: state as GameState, step: step as Step, events };
}

const beats = (state: GameState) => state.log.flatMap((e) => (e.kind === 'beat' ? [e.beat] : []));
const deathLines = (events: GameEvent[]) => events.filter((e) => e.type === 'line' && e.text === DEATH);
/** 독백 줄이 어느 장면 안에서 나왔는가. */
const sceneOf = (events: GameEvent[], line: GameEvent) => events.slice(0, events.indexOf(line)).findLast((e) => e.type === 'scene');

describe('60차: 원작 c001~c004 독백은 칼끝이 목에 닿는 판에서만 나온다', () => {
  test('남자를 만나지 않고 피해 간 판(r3_slip → e_road)에는 "죽음을 맞이" 독백이 없다', async () => {
    let found = 0;
    for (let seed = 1; seed <= 40 && found < 3; seed++) {
      const run = await play(seed, { type: 'approach', id: 'avoid' }, { r3_dusk: ['별을 보고 남쪽을 찾는다'] });
      if (!beats(run.state).includes('r3_slip') || run.state.ending !== 'road') continue;
      found++;
      expect(beats(run.state)).not.toContain('b04_blade');
      expect(deathLines(run.events)).toHaveLength(0);
      expect(run.events.some((e) => e.type === 'line' && e.cg?.startsWith('cg_open_'))).toBe(false);
    }
    expect(found).toBeGreaterThan(0);
  });

  test.each(Object.entries(ROUTES))('b04 를 지나는 경로 %s 는 칼끝 장면 안에서 한 번만 나온다', async (_key, route) => {
    const run = await play(route.seed, null, route.inputs);
    expect(run.state.ending).toBe(route.ending);
    expect(beats(run.state)).toContain('b04_blade');
    const lines = deathLines(run.events);
    expect(lines).toHaveLength(1);
    expect(sceneOf(run.events, lines[0]!)).toMatchObject({ type: 'scene', beat: 'b04_blade' });
    // 원작 컷 순서: c001 태양 → c002 낯선 땅 → c003 그림자 → c004 목에 닿은 칼날(글 없는 한 박자).
    const cgs = run.events.flatMap((e) => (e.type === 'line' && e.cg?.startsWith('cg_open_') ? [e.cg] : []));
    expect(cgs).toEqual(['cg_open_sun', 'cg_open_land', 'cg_open_dark', 'cg_open_blade']);
  });
});
