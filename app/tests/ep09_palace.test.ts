import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { checkScenario, loadScenario } from '../src/engine/scenario.ts';
import { FakeGm } from './helpers.ts';

const scenario = await loadScenario(join(import.meta.dir, '../content/ep09_palace.yaml'));

describe('9화 내부 진행', () => {
  test('회상과 짐 거래는 입력이나 판정 없이 반환 유보까지 이어진다', () => {
    const engine = new Engine(scenario, new FakeGm(), () => 1000);
    const { state, step } = engine.newGame(91, 'ep09-start');

    expect(checkScenario(scenario)).toEqual([]);
    expect(state.beat).toBe('ep09_c063');
    expect(state.items).toEqual(scenario.sheet.items.map((item) => item.id));
    expect(state.tracks).toEqual(scenario.sheet.tracks);
    expect(state.flags.ep09_짐반환승인).toBe(true);
    expect(state.flags.ep09_짐반환유보).toBe(true);
    expect(step.events.filter((e) => e.type === 'roll')).toEqual([]);
  });

  for (const response of ['ep09_protest', 'ep09_silent']) {
    for (const reaction of ['ep09_breath', 'ep09_gaze']) {
      test(`${response} → ${reaction}: 짐을 얻거나 탈출을 확정하지 않고 내부 경계에서 끝난다`, async () => {
        const engine = new Engine(scenario, new FakeGm(), () => 1000);
        const initial = engine.newGame(91, 'ep09-route');
        const night = await engine.act(initial.state, { type: 'choose', id: response });
        expect(night.state.beat).toBe('ep09_c080');
        expect(night.state.flags[response]).toBe(true);
        expect(night.state.flags.ep09_r13).toBe(true);

        const end = await engine.act(night.state, { type: 'choose', id: reaction });
        expect(end.state.beat).toBe('ep09_c084');
        expect(end.state.ending).toBe('ep09_internal_end');
        expect(end.state.flags[reaction]).toBe(true);
        expect(end.state.items).toEqual(initial.state.items);
        expect(end.state.tracks).toEqual(initial.state.tracks);
        expect([...night.step.events, ...end.step.events].filter((e) => e.type === 'roll')).toEqual([]);

        const visited = end.state.log.flatMap((entry) => entry.kind === 'beat' ? [entry.beat] : []);
        const nodes = scenario.atlas?.nodes ?? [];
        const route = visited.map((beat) => nodes.find((node) => node.beats.includes(beat))?.id);
        expect(route.every((node) => node !== undefined)).toBe(true);
        for (let i = 1; i < route.length; i++) {
          if (route[i - 1] !== route[i]) {
            expect(scenario.atlas?.edges.some(([from, to]) => from === route[i - 1] && to === route[i])).toBe(true);
          }
        }
        expect(visited).toContain(response);
        expect(visited).toContain(reaction);
        expect(visited).not.toContain(response === 'ep09_protest' ? 'ep09_silent' : 'ep09_protest');
      });
    }
  }

  test('비공개 독백과 상상은 들리는 발언으로 재생하지 않는다', async () => {
    const engine = new Engine(scenario, new FakeGm(), () => 1000);
    const start = engine.newGame(91, 'ep09-private');
    const night = await engine.act(start.state, { type: 'choose', id: 'ep09_silent' });
    const end = await engine.act(night.state, { type: 'choose', id: 'ep09_breath' });

    const privateLines = [...start.step.events, ...night.step.events, ...end.step.events]
      .filter((e) => e.type === 'line')
      .filter((e) => ['ep09_황제독백', 'ep09_나시르독백', 'ep09_상상'].includes(e.speaker));
    expect(privateLines.length).toBeGreaterThan(0);
    expect(privateLines.every((line) => line.style === 'thought')).toBe(true);
    expect(scenario.cast.ep09_상상?.lore).toBe('아시나');
    expect(end.state.flags.ep09_r09).toBeUndefined();
    expect(end.state.flags.ep09_r14).toBeUndefined();
    expect(end.state.flags.ep09_r15).toBeUndefined();
  });
});
