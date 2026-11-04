import { describe, expect, test } from 'bun:test';
import { FALLBACK_INPUT, ROUTES } from '../e2e/routes.ts';
import { Engine } from '../src/engine/engine.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

describe('이야기 갈래 5개', () => {
  test.each(Object.entries(ROUTES))('경로 %s 는 정해 둔 결말에 닿는다', async (_key, route) => {
    const engine = new Engine(scenario, new LocalGm(null, lore));
    let { state, step } = engine.newGame(route.seed, 's');
    const queue = structuredClone(route.inputs);
    for (let turn = 0; step.prompt.type === 'free'; turn++) {
      expect(turn).toBeLessThan(30);
      const text = queue[step.prompt.beat]?.shift() ?? FALLBACK_INPUT;
      ({ state, step } = await engine.act(state, { type: 'free', text }));
    }
    expect(state.ending).toBe(route.ending);
  });

  test('경로 다섯 개의 결말이 모두 다르다', () => {
    expect(new Set(Object.values(ROUTES).map((r) => r.ending)).size).toBe(5);
  });

  test('어떤 입력을 되풀이해도 LLM 없이 끝까지 간다', async () => {
    for (const text of ['ㅋㅋㅋ', '배고파', '춤을 춘다', '핸드폰을 꺼낸다', '옷을 벗는다', 'asdf']) {
      const engine = new Engine(scenario, new LocalGm(null, lore));
      let { state, step } = engine.newGame(11, 's');
      for (let turn = 0; step.prompt.type === 'free'; turn++) {
        expect(turn).toBeLessThan(40);
        ({ state, step } = await engine.act(state, { type: 'free', text }));
        expect(step.events.some((e) => e.type === 'line')).toBe(true);
      }
      expect(state.ending).not.toBeNull();
    }
  });
});
