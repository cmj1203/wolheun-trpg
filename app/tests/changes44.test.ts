import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { priceCandidates } from '../src/engine/prices.ts';
import { readSave, writeSave } from '../src/engine/save.ts';
import { type GameEvent, type Tier } from '../src/engine/types.ts';
import { FakeGm, META, loadDesert } from './helpers.ts';

const scenario = await loadDesert();
const gm = () => new FakeGm(() => ({ kind: 'improv', label: '물건 사용', stat: '손재주', difficulty: 0, absurd: false, bold: false, source: 'rule', meta: META }));

function ready(beat: string, seed: number, revealed = true) {
  const engine = new Engine(scenario, gm(), () => 1_000_000);
  const { state } = engine.newGame(seed, `변화44-${seed}`);
  state.beat = beat;
  state.free = { beat, talks: 0, rolls: 0 };
  state.rng = seed;
  state.tracks.행운 = 0;
  state.tracks.귀찌 = 8;
  state.log = [];
  if (revealed) {
    state.flags['수첩:man'] = true;
    state.flags['수첩:captive'] = true;
  }
  return { engine, state };
}

function changes(events: GameEvent[]): string[] {
  return events.flatMap((e) => e.type === 'change' ? e.parts.map((p) => p.text) : []);
}

describe('44차 변화 기록과 사용 물건 대가', () => {
  test('지도 soft 대가는 결과별 목록보다 먼저 고르고 hard 가 없으면 기존 후보를 쓴다', () => {
    const free = scenario.beats.b02_people!.free!;
    const move = free.approaches.find((a) => a.id === 'run')!;
    const item = scenario.sheet.items.find((i) => i.id === 'map')!;
    const ctx = { tracks: scenario.sheet.tracks, abilities: scenario.sheet.abilities, flags: {}, items: ['map'] };
    expect(priceCandidates(free, move.outcomes.mixed, 'mixed', ctx, {}, ['map_wind'], item).map((p) => p.id)).toEqual(['map_wind']);
    expect(priceCandidates(free, move.outcomes.miss, 'miss', ctx, {}, [], item).map((p) => p.id)).toEqual(['foe_approach', 'sand_fall']);
    expect(priceCandidates(free, move.outcomes.hit, 'hit', ctx, {}, [], item)).toEqual([]);
  });

  test('핀과 귀찌는 대응 대가가 없으면 기존 표를 유지한다', () => {
    const free = scenario.beats.b05_why!.free!;
    const outcome = free.improv.miss;
    const ctx = { tracks: scenario.sheet.tracks, abilities: scenario.sheet.abilities, flags: {}, items: scenario.sheet.items.map((i) => i.id) };
    const original = priceCandidates(free, outcome, 'miss', ctx, {}, []);
    for (const id of ['pin', 'earring']) {
      expect(priceCandidates(free, outcome, 'miss', ctx, {}, [], scenario.sheet.items.find((i) => i.id === id))).toEqual(original);
    }
  });

  test('세 판정 단계의 실제 변화만 결과 줄 뒤에 남기고 숨긴 수치는 쓰지 않는다', async () => {
    const found = new Set<Tier>();
    for (let seed = 1; seed <= 100 && found.size < 3; seed++) {
      const { engine, state } = ready('b02_people', seed, false);
      const { step } = await engine.act(state, { type: 'free', text: '지도를 펼쳐 저 남자 눈앞에 들이민다' });
      const roll = step.events.find((e) => e.type === 'roll');
      if (roll?.type !== 'roll') throw new Error('판정 없음');
      found.add(roll.tier);
      const nextScene = step.events.findIndex((e) => e.type === 'scene');
      const visible = changes(nextScene < 0 ? step.events : step.events.slice(0, nextScene));
      expect(visible.some((s) => /의심|집착|호감|탈주 준비도/.test(s))).toBe(false);
      if (roll.tier === 'mixed') {
        expect(visible).toContain('낡은 지도 찢김');
        const index = step.events.findIndex((e) => e.type === 'change' && e.parts.some((p) => p.text === '낡은 지도 찢김'));
        expect(index).toBeGreaterThan(step.events.findIndex((e) => e.type === 'price' && e.id === 'map_wind'));
        expect(step.hud.notes.find((n) => n.id === 'item:map')?.text).toContain('한 귀퉁이가 찢겨 나갔다.');
      }
      expect(visible.some((s) => /[+-]0$/.test(s))).toBe(false);
    }
    expect([...found].sort()).toEqual(['hit', 'miss', 'mixed']);
  });

  test('즉흥 행동의 가방을 hard 대가로 잃으면 다음 버튼과 직접 입력이 잠긴다', async () => {
    let checked = false;
    for (let seed = 1; seed <= 100 && !checked; seed++) {
      const { engine, state } = ready('b05_why', seed);
      const result = await engine.act(state, { type: 'free', text: '가방을 방패처럼 휘두른다' });
      if (!result.step.events.some((e) => e.type === 'roll' && e.tier === 'miss')) continue;
      expect(result.step.events.find((e) => e.type === 'price')?.id).toBe('bag_taken');
      expect(result.state.items).not.toContain('magic_bag');
      expect(changes(result.step.events)).toContain('마법 가방 잃음');
      result.state.beat = 'b05_why';
      result.state.free = { beat: 'b05_why', talks: 0, rolls: 0 };
      const prompt = engine.prompt(result.state);
      if (prompt.type !== 'free') throw new Error('자유 입력 아님');
      expect(prompt.approaches.find((a) => a.id === 'bag')?.locked).toBe(true);
      await expect(engine.act(result.state, { type: 'approach', id: 'bag' })).rejects.toThrow('소지품');
      await expect(engine.act(result.state, { type: 'free', text: '가방을 방패처럼 휘두른다' })).rejects.toThrow('마법 가방 없음');
      checked = true;
    }
    expect(checked).toBe(true);
  });

  test('변화 기록과 소지품 상태가 저장을 거쳐 유지된다', async () => {
    const { engine, state } = ready('b05_why', 1);
    state.flags['지도_찢김'] = true;
    const result = await engine.act(state, { type: 'free', text: '핀으로 밧줄을 쑤셔 본다' });
    expect(result.state.log.some((e) => e.kind === 'change')).toBe(true);
    const dir = await mkdtemp(join(tmpdir(), '변화44-'));
    try {
      await writeSave(dir, 'test', scenario, result.state);
      const restored = await readSave(dir, 'test', scenario);
      expect(restored.log.filter((e) => e.kind === 'change')).toEqual(result.state.log.filter((e) => e.kind === 'change'));
      expect(engine.hud(restored).notes.find((n) => n.id === 'item:map')?.text).toContain('한 귀퉁이가 찢겨 나갔다.');
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
