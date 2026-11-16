import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { Engine } from '../src/engine/engine.ts';
import { readSave, SaveError, writeSave } from '../src/engine/save.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { APP, FakeGm, LORE_PATH, META, SCENARIO_PATH } from './helpers.ts';

const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), await loadLore(LORE_PATH));
const run = join(APP, '../work/continuation/ep02/run');
await mkdir(run, { recursive: true });
const saves = await mkdtemp(join(run, 'ep05-save-tests-'));
afterAll(() => rm(saves, { recursive: true, force: true }));

async function finishFourth(seed: number, distance: boolean) {
  const engine = new Engine({ ...campaign, start: 'ep04_c001' },
    new FakeGm(() => ({ kind: 'idle', source: 'rule', meta: META })));
  let result = engine.newGame(seed, `actual-fourth-${seed}`);
  result.state.flags.후속_시작 = true;
  result = await engine.act(result.state, { type: 'choose', id: 'guards' });
  result = await engine.act(result.state, { type: 'free', text: '(가만히 기다린다)' });
  result = await engine.act(result.state, { type: 'choose', id: 'conceal' });
  result = await engine.act(result.state, { type: 'choose', id: distance ? 'distance' : 'retort' });
  if (distance) result = await engine.act(result.state, { type: 'approach', id: 'ep04_keep_distance' });
  return result;
}

describe('배포 캠페인 4→5 저장과 거리 성취', () => {
  test.each([1, 2])('실제 거리 성취 seed %i를 옛 종료 저장에서 한 번만 계승한다', async (seed) => {
    const previous = await finishFourth(seed, true);
    expect(previous.state.beat).toBe('ep04_distance_boundary');
    expect(previous.state.flags.ep04_distance_kept).toBe(true);
    const saved = { ...previous.state, ending: 'ep04_distance_boundary' };
    await writeSave(saves, `distance_${seed}`, campaign, saved);
    const loaded = await readSave(saves, `distance_${seed}`, campaign);
    const snapshot = structuredClone(loaded);
    const engine = new Engine(campaign, new FakeGm());
    const result = await resumeCampaign(engine, loaded);
    expect(loaded).toEqual(snapshot);
    expect(result.continued).toBe(true);
    const scenes = result.step.events.filter((event) => event.type === 'scene').map((event) => event.beat);
    expect(scenes[0]).toBe('ep05_entry');
    expect(scenes).toContain('ep05_c010');
    expect(scenes).not.toContain('ep05_c001');
    expect(result.state.flags.ep04_distance_kept).toBe(true);
    expect(result.state.flags.ep04_active).toBe(false);
    expect(result.state.flags.ep05_독자_첫입맞춤).not.toBe(true);
    expect(result.state.rng).toBe(loaded.rng);
    expect(result.state.tracks).toEqual(loaded.tracks);
    expect(result.state.abilities).toEqual(loaded.abilities);
    expect(result.state.items).toEqual(loaded.items);
    expect(result.state.said).toEqual(loaded.said);
    expect(result.state.log.slice(loaded.log.length).filter((entry) => entry.kind === 'choice')
      .map((entry) => entry.choice)).toEqual(['continue_ep05']);
    const again = await resumeCampaign(engine, result.state);
    expect(again.continued).toBe(false);
    expect(again.state).toEqual(result.state);
  });

  test('실제 원작 선택은 같은 entry에서 원작 입맞춤 경로로 간다', async () => {
    const previous = await finishFourth(2, false);
    expect(previous.state.beat).toBe('ep04_boundary');
    expect(previous.state.flags.ep04_distance_kept).not.toBe(true);
    const engine = new Engine(campaign, new FakeGm());
    const result = await engine.act(previous.state, { type: 'choose', id: 'continue_ep05' });
    const scenes = result.step.events.filter((event) => event.type === 'scene').map((event) => event.beat);
    expect(scenes[0]).toBe('ep05_entry');
    expect(scenes).toContain('ep05_c001');
  });

  test.each([null, 'ep04_distance_boundary'])('거리 경계의 손상 성취는 ending %s에서도 원작으로 덮지 않는다', async (ending) => {
    const previous = await finishFourth(2, true);
    previous.state.ending = ending;
    delete previous.state.flags.ep04_distance_kept;
    const snapshot = structuredClone(previous.state);
    await expect(resumeCampaign(new Engine(campaign, new FakeGm()), previous.state)).rejects.toBeInstanceOf(SaveError);
    expect(previous.state).toEqual(snapshot);
  });

  test('두 실제 종료의 지도는 동일한 공개 entry로만 이어진다', () => {
    const atlas = campaign.atlas;
    if (!atlas) throw new Error('합성 지도가 없습니다');
    const entry = atlas.nodes.find((node) => node.beats.includes('ep05_entry'));
    if (!entry) throw new Error('5화 공개 진입 노드가 없습니다');
    for (const id of ['ep04_boundary', 'ep04_distance_boundary']) {
      const node = atlas.nodes.find((candidate) => candidate.beats.includes(id));
      if (!node) throw new Error(`${id} 지도 노드가 없습니다`);
      expect(node.ending).toBe(false);
      expect(atlas.edges).toContainEqual([node.id, entry.id]);
      expect(campaign.beats[id]?.choices).toEqual([{ id: 'continue_ep05', text: '계속', next: 'ep05_entry' }]);
    }
  });
});
