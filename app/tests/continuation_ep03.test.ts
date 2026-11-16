import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { connectContinuation, loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { Engine } from '../src/engine/engine.ts';
import { readSave, writeSave } from '../src/engine/save.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { APP, FakeGm, LORE_PATH, SCENARIO_PATH } from './helpers.ts';

const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), await loadLore(LORE_PATH));
const base = await loadScenario(SCENARIO_PATH);
const second = connectContinuation(base, await loadScenario(join(APP, 'content/ep02_captivity.yaml')));
const run = join(APP, '../work/continuation/ep02/run');
await mkdir(run, { recursive: true });
const saves = await mkdtemp(join(run, 'ep03-save-tests-'));
afterAll(() => rm(saves, { recursive: true, force: true }));

function courtSave(engine: Engine) {
  const { state } = engine.newGame(913, 'ep02-ended-save');
  state.beat = 'ep02_court_boundary';
  state.ending = 'ep02_court_boundary';
  state.free = null;
  state.rng = 913;
  state.tracks = { ...state.tracks, 체력: 2, 정신력: 3, 귀찌: 4, 의심: 2, 탈주: 2 };
  state.flags = { 후속_시작: true, 시하드_호칭: true, 페시안_앎: true, 가방_끈: true, 플레이어_기억: '모래를 맛봄' };
  return state;
}

describe('2화 궁정에서 3화로 이어지는 한 경계', () => {
  test('기존 캠페인 식별자·시트·시작을 유지하고 준비된 실제 10화까지 등록한다', () => {
    expect(campaign.id).toBe('ep01_desert');
    expect(campaign.start).toBe(base.start);
    expect(campaign.sheet).toEqual(base.sheet);
    expect(campaign.fates).toEqual(second.fates);
    expect(campaign.beats.ep02_court_boundary?.ending).toBeUndefined();
    expect(campaign.beats.ep02_court_boundary?.choices)
      .toEqual([{ id: 'continue_ep03', text: '계속', next: 'ep03_c001' }]);
    expect(campaign.beats.ep03_c001).toBeDefined();
    expect(campaign.beats.ep04_c001).toBeDefined();
    expect(campaign.beats.ep05_entry).toBeDefined();
    expect(campaign.beats.ep06_c001).toBeDefined();
    expect(campaign.beats.ep07_c001).toBeDefined();
    expect(campaign.beats.ep08_c001).toBeDefined();
    expect(campaign.beats.ep09_c001).toBeDefined();
    expect(campaign.beats.ep10_c001).toBeDefined();
  });

  test('궁정 노드가 중간 노드로 바뀌고 3화 첫 장면과 실제 선으로 이어진다', () => {
    const atlas = campaign.atlas;
    if (!atlas) throw new Error('합성 캠페인에 지도가 없습니다');
    const court = atlas.nodes.find((node) => node.beats.includes('ep02_court_boundary'));
    const entry = atlas.nodes.find((node) => node.beats.includes('ep03_c001'));
    if (!court || !entry) throw new Error('실제 궁정 또는 3화 진입 노드가 없습니다');
    expect(court.ending).toBe(false);
    expect(entry.id).toBe('ep03_s01');
    expect(atlas.edges).toContainEqual([court.id, entry.id]);
    expect(atlas.chapters?.find((chapter) => chapter.id === 'ep03')?.nodes).toContain('ep03_s01');
    const independent = atlas.nodes.filter((node) => node.beats.some((beat) => [
      'ep02_city_escape', 'e_road', 'e_deal', 'e_value', 'e_spy',
    ].includes(beat)));
    for (const node of independent) {
      expect(node.ending).toBe(true);
      expect(atlas.edges.some(([from]) => from === node.id)).toBe(false);
    }
  });

  test('기존 궁정 종료 저장은 궁정 줄을 반복하지 않고 3화 선택 지점까지 한 번 진행한다', async () => {
    const engine = new Engine(campaign, new FakeGm(), () => 1_000);
    const before = courtSave(engine);
    await writeSave(saves, 'ep02_old_end', campaign, before, 1_000);
    const loaded = await readSave(saves, 'ep02_old_end', campaign);
    const resumed = await resumeCampaign(engine, loaded);
    expect(resumed.continued).toBe(true);
    expect(resumed.state.beat).toBe('ep03_c046');
    expect(resumed.state.ending).toBeNull();
    expect(resumed.state.rng).toBe(before.rng);
    expect(resumed.state.tracks).toEqual(before.tracks);
    expect(resumed.state.flags.가방_끈).toBe(true);
    expect(resumed.state.flags.플레이어_기억).toBe('모래를 맛봄');
    expect(resumed.state.items).not.toContain('magic_bag');
    expect(resumed.state.items).not.toContain('map');
    expect(resumed.state.items).toContain('earring');
    expect(resumed.state.items).toContain('pin');
    expect(resumed.state.flags.ep03_짐_수중없음).toBe(true);
    const scenes = resumed.step.events.filter((event) => event.type === 'scene');
    expect(scenes[0]?.beat).toBe('ep03_c001');
    expect(scenes.every((event) => event.beat.startsWith('ep03_'))).toBe(true);
    const entries = resumed.state.log.slice(before.log.length);
    expect(entries.filter((entry) => entry.kind === 'choice').map((entry) => entry.choice)).toEqual(['continue_ep03']);
    expect(entries.filter((entry) => entry.kind === 'beat' && entry.beat === 'ep03_c001')).toHaveLength(1);
  });

  test('3화 중간 저장 재개는 이미 적용한 물건 분리와 의상 전환을 다시 적용하지 않는다', async () => {
    const engine = new Engine(campaign, new FakeGm(), () => 1_000);
    const entered = await resumeCampaign(engine, courtSave(engine));
    await writeSave(saves, 'ep03_mid', campaign, entered.state, 1_000);
    const saved = await readSave(saves, 'ep03_mid', campaign);
    const snapshot = structuredClone(saved);
    const resumed = await resumeCampaign(engine, saved);
    expect(resumed.continued).toBe(false);
    expect(resumed.state).toEqual(snapshot);
    expect(resumed.step.events.some((event) => event.type === 'items')).toBe(false);
    expect(resumed.step.events.filter((event) => event.type === 'scene').map((event) => event.beat)).toEqual(['ep03_c046']);
  });
});
