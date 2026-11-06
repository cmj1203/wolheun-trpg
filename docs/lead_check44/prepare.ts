import { Engine } from '../../app/src/engine/engine.ts';
import { loadScenario } from '../../app/src/engine/scenario.ts';
import { writeSave } from '../../app/src/engine/save.ts';
import { LocalGm } from '../../app/src/gm/gm.ts';
import { loadLore, withNotes } from '../../app/src/gm/lore.ts';
import type { GameEvent, Tier } from '../../app/src/engine/types.ts';

const app = `${import.meta.dir}/../../app`;
const lore = await loadLore(`${app}/content/lore_wolheun.yaml`);
const scenario = withNotes(await loadScenario(`${app}/content/ep01_desert.yaml`), lore);
const engine = new Engine(scenario, new LocalGm(null, lore), Date.now, true);
const cases: { id: string; beat: string; text: string; tier: Tier; hidden?: boolean; price?: string }[] = [
  { id: 'pin-hit', beat: 'b05_why', text: '핀으로 밧줄을 쑤셔 본다', tier: 'hit' },
  { id: 'map-mixed', beat: 'b02_people', text: '지도를 펼쳐 저 남자 눈앞에 들이민다', tier: 'mixed', hidden: true, price: 'map_wind' },
  { id: 'bag-miss', beat: 'b05_why', text: '가방을 방패처럼 휘두른다', tier: 'miss', price: 'bag_taken' },
  { id: 'map-miss', beat: 'r3_dusk', text: '지도를 펼쳐 별이 뜰 방향을 짚는다', tier: 'miss', price: 'map_lost' },
  { id: 'pin-mixed', beat: 'b05_why', text: '핀으로 밧줄을 쑤셔 본다', tier: 'mixed' },
];
const rows = [];
for (const sample of cases) {
  let found = false;
  for (let seed = 1; seed < 1000; seed++) {
    const { state } = engine.newGame(seed, crypto.randomUUID());
    state.beat = sample.beat;
    state.free = { beat: sample.beat, talks: 0, rolls: 0 };
    state.rng = seed;
    state.tracks.행운 = 0;
    state.tracks.귀찌 = 8;
    state.flags['설명_귀찌'] = true;
    state.flags['수첩:man'] = !sample.hidden;
    state.flags['수첩:captive'] = !sample.hidden;
    state.recent = [];
    state.log = [];
    const result = await engine.act(state, { type: 'free', text: sample.text });
    const roll = result.step.events.find((e) => e.type === 'roll');
    const price = result.step.events.find((e) => e.type === 'price');
    if (roll?.type !== 'roll' || roll.tier !== sample.tier || (sample.price && (price?.type !== 'price' || price.id !== sample.price))) continue;
    await writeSave('/tmp/lane44/srv/saves', 'slot1', scenario, state);
    const bytes = await Bun.file('/tmp/lane44/srv/saves/slot1.json').text();
    await Bun.write(`/tmp/lane44/srv/${sample.id}.json`, bytes);
    const rows44 = result.step.events.flatMap((e: GameEvent) => e.type === 'change' ? [e.parts.map((p) => p.text).join(' · ')] : []);
    rows.push({ ...sample, seed, total: roll.total, dice: roll.dice, cost: price?.type === 'price' ? price.id : '없음', lines: rows44 });
    found = true;
    break;
  }
  if (!found) throw new Error(`${sample.id}: 고정 시드를 찾지 못함`);
}
await Bun.write(`${import.meta.dir}/cases.json`, JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows));
