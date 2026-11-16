import { describe, expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import type { Tier } from '../src/engine/types.ts';
import { FakeGm, loadDesert } from './helpers.ts';

const scenario = await loadDesert();

async function resolve(beat: string, action: string, tier: Tier) {
  const engine = new Engine({ ...scenario, start: beat }, new FakeGm(), () => 0);
  for (let seed = 1; seed <= 120; seed++) {
    const { state } = engine.newGame(seed, `mixed63-${beat}-${action}-${seed}`);
    state.tracks.체력 = 1;
    state.tracks.정신력 = 4;
    state.tracks.의심 = 0;
    state.tracks.귀찌 = 8;
    state.rng = seed;
    const result = await engine.act(state, { type: 'approach', id: action });
    const roll = result.step.events.find((event) => event.type === 'roll');
    if (roll?.type === 'roll' && roll.tier === tier) return { engine, before: state, ...result };
  }
  throw new Error(`${beat}/${action}: ${tier} 판정 시드를 찾지 못했습니다`);
}

describe('63차: 성취를 보존하는 혼합 성공', () => {
  test.each(['hit', 'mixed'] as const)('체력 1에서도 %s 회피는 포획 없이 끝나고 mixed만 정신력을 쓴다', async (tier) => {
    const { before, state, step } = await resolve('b02_people', 'avoid', tier);
    expect(state.beat).toBe('r3_dusk');
    expect(state.flags.도주).toBe(true);
    expect(state.tracks.체력).toBe(1);
    expect(state.tracks.정신력).toBe(before.tracks.정신력 + (tier === 'mixed' ? -1 : 1));
    expect(state.tracks.귀찌).toBe(before.tracks.귀찌);
    expect(step.events.flatMap((event) => event.type === 'price' ? [event.id] : []))
      .toEqual(tier === 'mixed' ? ['mind_strain'] : []);
    expect(state.log.filter((entry) => entry.kind === 'beat').map((entry) => entry.beat))
      .toEqual(['b02_people', 'r3_slip', 'r3_dusk']);
  });

  test.each(['hit', 'mixed'] as const)('관찰 %s 뒤에는 접근이나 회피를 직접 선택하고 다시 관찰하지 않는다', async (tier) => {
    const { engine, state, step } = await resolve('b02_people', 'watch', tier);
    expect(step.prompt.type).toBe('choices');
    expect(state.flags.정체_눈치).toBe(true);
    expect(state.flags.다가감).toBeUndefined();
    expect(state.flags.길_물음).toBeUndefined();
    expect(state.log.filter((entry) => entry.kind === 'beat').map((entry) => entry.beat))
      .toEqual(['b02_people', 'b02_observed']);
    const avoid = await engine.act(state, { type: 'choose', id: 'avoid' });
    expect(avoid.state.beat).toBe('r3_dusk');
    expect(avoid.state.flags.도주).toBe(true);
    expect(avoid.state.flags.다가감).toBeUndefined();
    const approach = await engine.act(state, { type: 'choose', id: 'approach' });
    expect(approach.state.beat).toBe('b05_why');
    expect(approach.state.flags.다가감).toBe(true);
    expect(approach.state.log.filter((entry) => entry.kind === 'beat' && entry.beat === 'b04_blade')).toHaveLength(1);
  });

  test.each([
    ['b05_why', 'resist'],
    ['b06_swing', 'flee'],
  ] as const)('%s/%s 혼합 도주는 칼 앞에 남기지 않고 정신력 비용만 낸다', async (beat, action) => {
    const { before, state, step } = await resolve(beat, action, 'mixed');
    expect(state.flags.도주).toBe(true);
    expect(state.beat).toBe('r3_dusk');
    expect(state.tracks.체력).toBe(1);
    expect(state.tracks.정신력).toBe(before.tracks.정신력 - 1);
    expect(state.tracks.의심).toBe(before.tracks.의심);
    expect(state.tracks.귀찌).toBe(before.tracks.귀찌);
    expect(step.events.flatMap((event) => event.type === 'price' ? [event.id] : [])).toEqual(['mind_strain']);
    expect(state.log.filter((entry) => entry.kind === 'beat').map((entry) => entry.beat))
      .toEqual([beat, 'r3_flee', 'r3_dusk']);
  });

  test('시선을 피하지 않는 혼합 성공은 이후 판결에서도 눈을 맞선 상태로 남는다', async () => {
    const { state } = await resolve('b08_gaze', 'stare_back', 'mixed');
    expect(state.flags.눈_맞섬).toBe(true);
    expect(state.tracks.정신력).toBe(3);
  });

  const approaches = Object.values(scenario.beats).flatMap((beat) =>
    (beat.free?.approaches ?? []).map((approach) => [beat.id, approach.id] as const));
  test.each(approaches)('%s/%s 혼합 성공에는 실제 자원 또는 소지품 비용이 있다', async (beat, action) => {
    const { before, state } = await resolve(beat, action, 'mixed');
    const damage = (key: '체력' | '정신력' | '귀찌') => state.tracks[key] < before.tracks[key];
    const damagedItem = ['가방_끈', '짐_쏟음', '외투_찢김', '지도_찢김', '물_적음']
      .some((flag) => before.flags[flag] !== true && state.flags[flag] === true);
    expect(damage('체력') || damage('정신력') || damage('귀찌') || damagedItem).toBe(true);
  });
});
