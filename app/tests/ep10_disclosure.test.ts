import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { Scenario } from '../src/engine/types.ts';
import { FakeGm } from './helpers.ts';

const scenario = await loadScenario(join(import.meta.dir, '../content/ep10_internal.yaml'));

describe('10화 선언 효과의 Engine 줄 소비 시점', () => {
  // Engine은 자동 대사를 한 번에 소비한다. 화면 표시 시점 검사가 아니라
  // 원본 줄의 접두 구간만 소비한 상태를 정지시켜 선언 효과의 경계를 검사한다.
  for (const [beatId, flag] of [
    ['ep10_c049', 'ep10_시하드뜻_앎'],
    ['ep10_c053', 'ep10_베히님'],
  ] as const) {
    test(`${beatId}: 마지막 설명·수락 줄 이전에는 잠겨 있고 소비 후에만 열린다`, () => {
      const beat = scenario.beats[beatId];
      if (!beat || beat.lines.length === 0) throw new Error('공개 원문 줄이 없다');
      for (let count = 0; count <= beat.lines.length; count += 1) {
        const prefix: Scenario = {
          ...scenario,
          start: beatId,
          beats: {
            ...scenario.beats,
            [beatId]: { ...beat, lines: beat.lines.slice(0, count), choices: [] },
          },
        };
        const { state, step } = new Engine(prefix, new FakeGm(), () => 1000)
          .newGame(10, `ep10-공개-${beatId}-${count}`);
        expect(state.beat).toBe(beatId);
        expect(step.events.flatMap((event) => event.type === 'line' ? [event.text] : []))
          .toEqual(beat.lines.slice(0, count).map((line) => line.text));
        expect(state.flags[flag]).toBe(count === beat.lines.length ? true : undefined);
      }
    });
  }

  test('라 쿤 호칭 분기는 베히님 수락을 거치지 않아 별칭 플래그를 얻지 않는다', async () => {
    const engine = new Engine({ ...scenario, start: 'ep10_c052' }, new FakeGm(), () => 1000);
    const first = engine.newGame(10, 'ep10-라쿤-호칭');
    expect(first.state.flags.ep10_베히님).toBeUndefined();
    const result = await engine.act(first.state, { type: 'choose', id: 'ep10_title_king' });
    expect(result.state.beat).toBe('ep10_c058');
    expect(result.step.events.flatMap((event) => event.type === 'scene' ? [event.beat] : []))
      .not.toContain('ep10_c053');
    expect(result.state.flags.ep10_베히님).toBeUndefined();
  });
});
