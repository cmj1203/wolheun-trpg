import { describe, expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import { drawPrice, priceCandidates } from '../src/engine/prices.ts';
import { parseScenario } from '../src/engine/scenario.ts';
import { TRACKS, type Effects, type FreeSpec, type GameEvent, type Outcome, type PriceSpec, type Tier, type Tiered } from '../src/engine/types.ts';
import { FakeGm, SCENARIO_PATH, approachOf, loadDesert } from './helpers.ts';

const scenario = await loadDesert();
const yamlText = await Bun.file(SCENARIO_PATH).text();
const freeBeats = Object.values(scenario.beats).flatMap((b) => (b.free ? [{ id: b.id, free: b.free }] : []));

function merged(...list: (Effects | undefined)[]): string {
  const tracks: Record<string, number> = {};
  const flags: Record<string, unknown> = {};
  const gain = new Set<string>();
  const lose = new Set<string>();
  for (const e of list) {
    for (const key of TRACKS) if (e?.tracks?.[key]) tracks[key] = (tracks[key] ?? 0) + e.tracks[key]!;
    Object.assign(flags, e?.flags ?? {});
    for (const g of e?.gain ?? []) gain.add(g);
    for (const l of e?.lose ?? []) lose.add(l);
  }
  const sortedFlags = Object.fromEntries(Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ tracks, flags: sortedFlags, gain: [...gain].sort(), lose: [...lose].sort() });
}

/** 조건(if)과 무관하게 이 결과에서 나올 수 있는 모든 대가 묶음. hard 가 조건부뿐이면 soft 로 떨어지는 경우도 넣는다. */
function possiblePrices(free: FreeSpec, outcome: Outcome, tier: Tier): PriceSpec[] {
  const table = free.prices ?? [];
  const listed = outcome.price ? outcome.price.flatMap((id) => table.filter((p) => p.id === id)) : table;
  if (tier === 'mixed') return listed.filter((p) => p.weight === 'soft');
  const hard = listed.filter((p) => p.weight === 'hard');
  if (hard.length === 0) return listed;
  return hard.every((p) => p.if !== undefined) ? [...hard, ...listed.filter((p) => p.weight === 'soft')] : hard;
}

function outcomeSets(free: FreeSpec): [string, Tiered<Outcome>][] {
  const sets: [string, Tiered<Outcome>][] = free.approaches.map((a) => [a.id, a.outcomes]);
  sets.push(['improv', free.improv]);
  if (free.improv_bold) sets.push(['improv_bold', free.improv_bold]);
  return sets;
}

function sameMixedMiss(free: FreeSpec): string[] {
  const clashes: string[] = [];
  for (const [id, outcomes] of outcomeSets(free)) {
    const mixed = new Set(possiblePrices(free, outcomes.mixed, 'mixed').map((p) => merged(outcomes.mixed.effects, p.effects)));
    if (mixed.size === 0) mixed.add(merged(outcomes.mixed.effects));
    const miss = possiblePrices(free, outcomes.miss, 'miss').map((p) => merged(outcomes.miss.effects, p.effects));
    if (miss.length === 0) miss.push(merged(outcomes.miss.effects));
    if (miss.some((sig) => mixed.has(sig))) clashes.push(id);
  }
  return clashes;
}

const b02 = scenario.beats.b02_people!.free!;
const ctx = { tracks: { 체력: 3, 정신력: 4, 의심: 0, 집착: 0, 호감: 0, 귀찌: 8, 탈주: 0, 행운: 6 }, abilities: scenario.sheet.abilities, items: scenario.sheet.items.map((i) => i.id), flags: {} };

describe('대가 표', () => {
  test('자유 입력 비트마다 prices 가 4~6개이고 태그가 세 종류 이상이다', () => {
    expect(freeBeats.length).toBe(8);
    for (const { id, free } of freeBeats) {
      const prices = free.prices ?? [];
      expect(prices.length, id).toBeGreaterThanOrEqual(4);
      expect(prices.length, id).toBeLessThanOrEqual(6);
      expect(new Set(prices.map((p) => p.tag)).size, id).toBeGreaterThanOrEqual(3);
      expect(prices.some((p) => p.weight === 'hard'), `${id}: hard 대가가 하나는 있어야 6- 가 7~9 와 갈린다`).toBe(true);
    }
  });

  test('전수: 모든 접근과 improv 에서 mixed 와 miss 의 최종 효과가 어떤 뽑기 조합에서도 같지 않다', () => {
    const clashes = freeBeats.flatMap(({ id, free }) => sameMixedMiss(free).map((a) => `${id}.${a}`));
    expect(clashes).toEqual([]);
  });

  test('대가 표가 없으면 같은 접근의 mixed 와 miss 효과가 같은 곳이 남는다(표가 메우는 구멍)', () => {
    const bare = parseScenario(yamlText.replace(/\n {6}prices:\n(?: {8}- \{[^\n]*\n)+/g, '\n').replace(/\n {14}price: \[[^\]]*\]\n/g, '\n'));
    expect(Object.values(bare.beats).some((b) => b.free?.prices)).toBe(false);
    const clashes = Object.values(bare.beats).flatMap((b) => (b.free ? sameMixedMiss(b.free).map((a) => `${b.id}.${a}`) : []));
    expect(clashes).toEqual(['b02_people.improv', 'r3_dusk.improv']);
  });

  test('7~9 대가는 성공을 뒤집지 않는다: soft 대가는 lose·탈주 감소·플래그 끄기가 없고 hit 가 세운 플래그를 건드리지 않는다', () => {
    const softLose = yamlText.replace(/- \{ id: sun,[^\n]+/, '- { id: sun, tag: 시간, weight: soft, text: 지도를 잃었다., effects: { lose: [map] } }');
    expect(softLose).not.toBe(yamlText);
    expect(() => parseScenario(softLose)).toThrow(/prices\.sun: soft 대가는 소지품을 잃게 할 수 없습니다/);

    const hitFlag = yamlText.replace('- { id: foe_look, tag: 상대행동, weight: soft, text: 셋 중 하나가 걸음을 멈추고 이쪽을 똑바로 본다., effects: { 의심: 1 } }', '- { id: foe_look, tag: 상대행동, weight: soft, text: 길이 막혔다., effects: { flags: { 도주: true } } }');
    expect(hitFlag).not.toBe(yamlText);
    expect(() => parseScenario(hitFlag)).toThrow(/prices\.foe_look: soft 대가가 avoid 의 hit 플래그 '도주' 를 건드립니다/);

    const hardInMixed = yamlText.replace('price: [sun, open_sand]', 'price: [sun, foe_approach]');
    expect(hardInMixed).not.toBe(yamlText);
    expect(() => parseScenario(hardInMixed)).toThrow(/mixed\.price: 7~9 에는 soft 대가만 둡니다/);

    const unknown = yamlText.replace('price: [foe_approach, sand_fall]', 'price: [foe_approach, nothing]');
    expect(() => parseScenario(unknown)).toThrow(/표에 없는 대가 "nothing"/);
  });

  test('같은 시드면 같은 대가가 뽑힌다', () => {
    const run = b02.approaches.find((a) => a.id === 'run')!;
    const missPool = priceCandidates(b02, run.outcomes.miss, 'miss', ctx, {}, []);
    expect(missPool.map((p) => p.id)).toEqual(['foe_approach', 'sand_fall']);
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const picks = seeds.map((seed) => drawPrice(missPool, seed).price?.id);
    expect(picks).toEqual(seeds.map((seed) => drawPrice(missPool, seed).price?.id));
    expect(new Set(picks).size).toBe(2);
    expect(priceCandidates(b02, run.outcomes.hit, 'hit', ctx, {}, [])).toEqual([]);
    expect(drawPrice([], 7).price).toBeNull();
  });

  test('같은 장면에서 후보가 남아 있는 한 같은 대가가 연달아 뽑히지 않는다', () => {
    const mixedPool = priceCandidates(b02, b02.improv.mixed, 'mixed', ctx, {}, []);
    expect(mixedPool.map((p) => p.id)).toEqual(['sun', 'map_wind', 'open_sand', 'foe_look']);
    expect(priceCandidates(b02, b02.improv.mixed, 'mixed', ctx, {}, ['sun', 'map_wind']).map((p) => p.id)).toEqual(['open_sand', 'foe_look']);
    expect(priceCandidates(b02, b02.improv.mixed, 'mixed', ctx, {}, ['sun', 'map_wind', 'open_sand', 'foe_look']).map((p) => p.id)).toEqual(['sun', 'map_wind', 'open_sand', 'foe_look']);
    const b05 = scenario.beats.b05_why!.free!;
    const bag = b05.approaches.find((a) => a.id === 'bag')!;
    expect(priceCandidates(b05, bag.outcomes.miss, 'miss', ctx, {}, []).map((p) => p.id)).toEqual(['bag_taken']);
    expect(priceCandidates(b05, bag.outcomes.miss, 'miss', { ...ctx, items: [] }, {}, []).map((p) => p.id)).toEqual(['guard_step']);
  });

  test('뽑힌 대가의 text 가 서술에 들어가고 price 이벤트와 효과로 나간다', async () => {
    const engine = new Engine(scenario, new FakeGm(() => approachOf('run')), () => 1_000_000);
    let found: { events: GameEvent[]; before: number; after: number } | null = null;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const { state } = engine.newGame(seed, `p${seed}`);
      state.flags['귀찌_설명'] = true;
      const events: GameEvent[] = [];
      const next = await engine.act(state, { type: 'approach', id: 'run' }, (e) => events.push(e));
      const roll = events.find((e) => e.type === 'roll');
      if (roll?.type === 'roll' && roll.tier === 'miss') found = { events, before: state.tracks.귀찌, after: next.state.tracks.귀찌 };
    }
    expect(found).not.toBeNull();
    const { events } = found!;
    const price = events.find((e) => e.type === 'price');
    expect(price?.type).toBe('price');
    if (price?.type !== 'price') return;
    expect(['foe_approach', 'sand_fall']).toContain(price.id);
    const spoken = events.filter((e) => e.type === 'line').map((e) => (e.type === 'line' ? e.text : ''));
    expect(spoken).toContain(price.text);
    expect(events.indexOf(price)).toBeGreaterThan(events.findIndex((e) => e.type === 'line' && e.text === price.text));
    const tracks = events.filter((e) => e.type === 'tracks');
    expect(tracks.length).toBeGreaterThanOrEqual(1);
    if (price.id === 'sand_fall') expect(found!.after).toBe(found!.before - 1);
  });

  test('hit 에는 대가가 없고, price 를 안 적은 접근은 비트 표의 soft 에서 뽑는다', async () => {
    const engine = new Engine(scenario, new FakeGm(() => approachOf('run')), () => 1_000_000);
    let hit: GameEvent[] | null = null;
    let mixed: GameEvent[] | null = null;
    for (let seed = 1; seed < 200 && !(hit && mixed); seed++) {
      const { state } = engine.newGame(seed, `h${seed}`);
      const events: GameEvent[] = [];
      await engine.act(state, { type: 'approach', id: 'watch' }, (e) => events.push(e));
      const roll = events.find((e) => e.type === 'roll');
      if (roll?.type !== 'roll') continue;
      if (roll.tier === 'hit' && !hit) hit = events;
      if (roll.tier === 'mixed' && !mixed) mixed = events;
    }
    expect(hit?.some((e) => e.type === 'price')).toBe(false);
    const price = mixed?.find((e) => e.type === 'price');
    expect(price?.type).toBe('price');
    if (price?.type !== 'price') return;
    expect(['sun', 'map_wind', 'open_sand', 'foe_look']).toContain(price.id);
  });
});
