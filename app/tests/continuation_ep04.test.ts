import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { Engine } from '../src/engine/engine.ts';
import { readSave, writeSave } from '../src/engine/save.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { APP, FakeGm, LORE_PATH, SCENARIO_PATH } from './helpers.ts';

const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), await loadLore(LORE_PATH));
const original = await loadScenario(join(APP, 'content/ep03_palace.yaml'));
const run = join(APP, '../work/continuation/ep02/run');
await mkdir(run, { recursive: true });
const saves = await mkdtemp(join(run, 'ep04-save-tests-'));
afterAll(() => rm(saves, { recursive: true, force: true }));

function oldEnding(engine: Engine) {
  const { state } = engine.newGame(913, 'ep03-ended-save');
  state.beat = 'ep03_c061';
  state.ending = 'ep03_boundary';
  state.free = null;
  state.rng = 913;
  state.items = ['earring', 'pin'];
  state.tracks = { ...state.tracks, 체력: 2, 정신력: 3, 귀찌: 4, 의심: 2, 탈주: 2 };
  state.flags = {
    후속_시작: true, ep03_완료: true, 시하드_호칭: true,
    페시안_앎: true, 가방_끈: true, 플레이어_기억: '모래를 맛봄',
  };
  state.said = ['처음 보는 곳이다.'];
  state.spoken = { 아시나: ['처음 보는 곳이다.'] };
  return state;
}

describe('3화 실제 종점에서 4화로 이어지는 경계', () => {
  test('원래 종점 대사와 기존 시트는 보존하고 준비된 실제 시작만 연결한다', () => {
    expect(campaign.beats.ep03_c061?.lines).toEqual(original.beats.ep03_c061?.lines);
    expect(campaign.beats.ep03_c061?.ending).toBeUndefined();
    expect(campaign.beats.ep03_c061?.choices)
      .toEqual([{ id: 'continue_ep04', text: '계속', next: 'ep04_c001' }]);
    expect(campaign.id).toBe('ep01_desert');
    expect(campaign.start).toBe('b00_open');
    expect(campaign.sheet.name).toBe('아시나');
    expect(campaign.beats.ep04_c001).toBeDefined();
    expect(campaign.beats.ep04_distance_boundary?.choices)
      .toEqual([{ id: 'continue_ep05', text: '계속', next: 'ep05_entry' }]);
  });

  test('기존 종료 저장은 지난 줄 없이 선택을 한 번 실행하고 상태를 계승한다', async () => {
    const engine = new Engine(campaign, new FakeGm(), () => 1_000);
    const before = oldEnding(engine);
    const snapshot = structuredClone(before);
    await writeSave(saves, 'ep03_old_end', campaign, before, 1_000);
    const loaded = await readSave(saves, 'ep03_old_end', campaign);
    const resumed = await resumeCampaign(engine, loaded);
    expect(before).toEqual(snapshot);
    expect(resumed.continued).toBe(true);
    expect(resumed.state.beat).toBe('ep04_i01_scout');
    expect(resumed.state.ending).toBeNull();
    expect(resumed.state.rng).toBe(before.rng);
    expect(resumed.state.tracks).toEqual(before.tracks);
    expect(resumed.state.abilities).toEqual(before.abilities);
    expect(resumed.state.items).toEqual(before.items);
    expect(resumed.state.said).toEqual(before.said);
    expect(resumed.state.flags.플레이어_기억).toBe('모래를 맛봄');
    expect(resumed.state.flags.ep03_완료).toBe(true);
    expect(resumed.state.flags.ep04_started).toBe(true);
    expect(resumed.state.flags.ep04_active).toBe(true);
    expect(resumed.state.flags.ep04_name_known).not.toBe(true);
    expect(resumed.state.flags.ep04_ruler_known).not.toBe(true);
    const entered = resumed.step.events.filter((event) => event.type === 'scene');
    expect(entered[0]?.beat).toBe('ep04_c001');
    expect(entered.every((event) => event.beat.startsWith('ep04_'))).toBe(true);
    const entries = resumed.state.log.slice(before.log.length);
    expect(entries.filter((entry) => entry.kind === 'choice').map((entry) => entry.choice)).toEqual(['continue_ep04']);
    expect(entries.filter((entry) => entry.kind === 'beat' && entry.beat === 'ep04_c001')).toHaveLength(1);
    const again = await resumeCampaign(engine, resumed.state);
    expect(again.continued).toBe(false);
    expect(again.state).toEqual(resumed.state);
    expect(again.step.events.some((event) => event.type === 'items')).toBe(false);
  });

  test('이미 경계 선택을 보고 있는 판은 자동으로 새 화에 보내지 않는다', async () => {
    const engine = new Engine(campaign, new FakeGm(), () => 1_000);
    const before = oldEnding(engine);
    before.ending = null;
    const resumed = await resumeCampaign(engine, before);
    expect(resumed.continued).toBe(false);
    expect(resumed.state).toEqual(before);
    expect(resumed.step.prompt.type).toBe('choices');
  });

  test('3화 종점과 4화 거리 성취의 실제 장 경계를 연결한다', () => {
    const atlas = campaign.atlas;
    if (!atlas) throw new Error('합성 지도가 없습니다');
    expect(atlas.nodes.find((node) => node.id === 'ep03_s12')?.ending).toBe(false);
    expect(atlas.edges).toContainEqual(['ep03_s12', 'ep04_plan']);
    expect(atlas.nodes.find((node) => node.id === 'ep04_plan')?.beats).toContain('ep04_c001');
    expect(atlas.chapters?.find((chapter) => chapter.id === 'ep04')?.nodes).toContain('ep04_plan');
    expect(atlas.nodes.find((node) => node.id === 'ep04_end_apart')?.ending).toBe(false);
    const fifthEntry = atlas.nodes.find((node) => node.beats.includes('ep05_entry'));
    if (!fifthEntry) throw new Error('5화 공개 진입 노드가 없습니다');
    expect(atlas.edges).toContainEqual(['ep04_end_apart', fifthEntry.id]);
  });
});
