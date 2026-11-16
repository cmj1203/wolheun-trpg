import { describe, expect, test } from 'bun:test';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { hasCharacter, loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent } from '../src/engine/types.ts';
import { FakeGm } from './helpers.ts';

const root = join(import.meta.dir, '../..');
const scenario = await loadScenario(join(root, 'app/content/ep10_internal.yaml'));
const source = await Bun.file(join(root, 'docs/continuation/ep10/script.md')).text();
const expectedText = source.split(/^### /m).slice(1).flatMap((block) => block.split('\n')
  .filter((line) => /^- (아시나|베히다트|누르|화자 미확정).*?: /.test(line))
  .map((line) => line.slice(line.indexOf(': ') + 2)));
const originalChoices: Readonly<Record<string, string>> = {
  ep10_c026: 'ep10_hair_source', ep10_c029: 'ep10_family_tell',
  ep10_c034: 'ep10_name_tell', ep10_c043: 'ep10_travel_retort',
  ep10_travel_choice: 'ep10_travel_retort', ep10_c052: 'ep10_title_behi',
  ep10_c058: 'ep10_contact_silent',
};

async function play(seed: number, changes: Readonly<Record<string, string>> = {}) {
  const gm = new FakeGm();
  const engine = new Engine(scenario, gm, () => 1000);
  let result = engine.newGame(seed, 'ep10-독립검증');
  const events: GameEvent[] = [...result.step.events];
  while (!result.state.ending && result.state.beat !== 'ep10_withdraw') {
    const id = changes[result.state.beat] ?? originalChoices[result.state.beat];
    if (!id) throw new Error('시험에서 선택하지 않은 비트: ' + result.state.beat);
    result = await engine.act(result.state, { type: 'choose', id });
    events.push(...result.step.events);
  }
  return { engine, gm, state: result.state, events };
}

function texts(events: readonly GameEvent[]) {
  return events.flatMap((event) => event.type === 'line' && event.text ? [event.text] : []);
}

function seenCuts(events: readonly GameEvent[]) {
  const ids = events.flatMap((event) => event.type === 'line' && event.cg ? [event.cg] : []);
  return ids.filter((id, i) => i === 0 || ids[i - 1] !== id);
}

describe('10화 독립 내부 대본', () => {
  test('원작 경로가 전사 발화와 컷을 순서대로 모두 내보내고 독백에는 입력을 요구하지 않는다', async () => {
    const first = new Engine(scenario, new FakeGm(), () => 1000).newGame(1, 'ep10-첫질문');
    expect(first.state.beat).toBe('ep10_c026');
    expect(first.state.flags.ep10_눈색인지_앎).toBeUndefined();
    const result = await play(1);
    expect(texts(result.events)).toEqual(expectedText);
    expect(seenCuts(result.events)).toEqual(Array.from({ length: 78 }, (_, i) => 'ep10_c' + String(i + 1).padStart(3, '0')));
    expect(result.state.ending).toBe('ep10_boundary');
    expect(result.state.flags.ep10_눈색인지_앎).toBe(true);
    expect(result.state.flags.ep10_입맞춤_발생).toBe(true);
    expect(result.events.filter((event) => event.type === 'roll')).toEqual([]);
    expect(result.gm.calls).toEqual([]);
  });

  test('공개 범위·호칭·거부의 모든 결정 조합이 실제 상태와 맞게 끝난다', async () => {
    for (let mask = 0; mask < 64; mask++) {
      const changes = {
        ep10_c026: mask & 1 ? 'ep10_hair_hold' : 'ep10_hair_source',
        ep10_c029: mask & 2 ? 'ep10_family_hold' : 'ep10_family_tell',
        ep10_c034: mask & 4 ? 'ep10_name_only' : 'ep10_name_tell',
        ep10_c043: mask & 8 ? 'ep10_travel_hold' : 'ep10_travel_retort',
        ep10_travel_choice: mask & 8 ? 'ep10_travel_hold' : 'ep10_travel_retort',
        ep10_c052: mask & 16 ? 'ep10_title_king' : 'ep10_title_behi',
        ep10_c058: mask & 32 ? 'ep10_contact_refuse' : 'ep10_contact_silent',
      };
      const result = await play(mask + 1, changes);
      expect(result.state.beat).toBe('ep10_end');
      expect(result.state.flags.ep10_머리이유_말함 === true).toBe(!(mask & 1));
      expect(result.state.flags.ep10_사촌_말함 === true).toBe(!(mask & 2));
      expect(result.state.flags.ep10_이름뜻_말함 === true).toBe(!(mask & 4));
      expect(result.state.flags.ep10_베히님 === true).toBe(!(mask & 16));
      expect(result.state.flags.ep10_입맞춤_발생 === true).toBe(!(mask & 32));
      expect(result.state.flags.ep10_눈색인지_앎).toBe(true);
      if (mask & 32) {
        expect(seenCuts(result.events).includes('ep10_c062')).toBe(false);
        expect(seenCuts(result.events).includes('ep10_c071')).toBe(false);
      }
      expect(result.events.filter((event) => event.type === 'roll')).toEqual([]);
    }
  });

  test('손목을 빼고 물러서는 선택은 판정과 비용 없이 접촉을 끝내고 거리를 보존한다', async () => {
    for (const seed of [1, 7, 19]) {
      const control = await play(seed);
      const result = await play(seed, { ep10_c058: 'ep10_contact_escape' });
      expect(result.state.beat).toBe('ep10_end');
      expect(result.state.flags.ep10_접촉중단).toBe(true);
      expect(result.state.flags.ep10_접촉회피).toBe(true);
      expect(result.state.flags.ep10_입맞춤_발생).toBeUndefined();
      expect(result.events.filter((event) => event.type === 'roll' || event.type === 'price')).toEqual([]);
      expect(result.state.rng).toBe(control.state.rng);
      expect(result.state.tracks).toEqual(control.state.tracks);
      expect(result.state.items).toEqual(control.state.items);
      expect(seenCuts(result.events).includes('ep10_c062')).toBe(false);
      const visits = result.events.flatMap((event) => event.type === 'scene' ? [event.beat] : []);
      expect(visits.includes('ep10_distance_success')).toBe(true);
      expect(result.state.flags.ep10_눈색인지_앎).toBe(true);
    }
  });

  test('서버가 읽는 실제 자산을 사용하고 공유 시트와 동일 인물 슬롯을 보존한다', async () => {
    const base = await loadScenario(join(root, 'app/content/ep02_captivity.yaml'));
    expect(scenario.id).toBe('ep10_internal');
    expect(scenario.sheet).toEqual(base.sheet);
    for (const asset of Object.values(scenario.cgs)) {
      expect(asset.file?.startsWith('assets/ep10/')).toBe(true);
      if (!asset.file) throw new Error('컷 자산 경로가 없다');
      await access(join(root, asset.file));
    }
    const bath = scenario.beats.ep10_c003;
    const room = scenario.beats.ep10_c041;
    if (!bath || !room) throw new Error('장면이 없다');
    expect(hasCharacter(scenario, room, 'ep10_왕속마음')).toBe(true);
    expect(hasCharacter(scenario, room, 'ep10_아시나속마음')).toBe(true);
    expect(scenario.cast.ep10_누르?.lore).toBe('누르');
    expect(scenario.cast.ep10_왕속마음?.style).toBe('thought');
    expect(scenario.beats.ep10_c070?.lines[0]?.speaker).toBe('나레이션');
    expect(scenario.beats.ep10_c070?.effects).toBeUndefined();
  });
});
