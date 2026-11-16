import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { Engine } from '../src/engine/engine.ts';
import { readSave, writeSave } from '../src/engine/save.ts';
import { loadScenario, ScenarioError } from '../src/engine/scenario.ts';
import type { ViewpointObservation } from '../src/engine/types.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { APP, FakeGm, LORE_PATH, SCENARIO_PATH } from './helpers.ts';

const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), await loadLore(LORE_PATH));
const run = join(APP, '../work/continuation/ep02/run');
await mkdir(run, { recursive: true });
const saves = await mkdtemp(join(run, 'later-save-tests-'));
afterAll(() => rm(saves, { recursive: true, force: true }));
const bridges = [
  { file: 'ep06_library.yaml', beat: 'ep06_c065', ending: 'ep06_internal_end', choice: 'continue_ep07', start: 'ep07_c001' },
  { file: 'ep07_harem.yaml', beat: 'ep07_c063', ending: 'ep07_internal_end', choice: 'continue_ep08', start: 'ep08_c001' },
  { file: 'ep08_harem.yaml', beat: 'ep08_c062', ending: 'ep08_boundary', choice: 'continue_ep09', start: 'ep09_c001' },
  { file: 'ep09_palace.yaml', beat: 'ep09_c084', ending: 'ep09_internal_end', choice: 'continue_ep10', start: 'ep10_c001' },
] as const;

describe('후반부 실제 원작 경계와 옛 저장', () => {
  test.each(bridges)('$beat/$ending 원본 종료 저장은 $start로 한 번만 이어진다', async (bridge) => {
    const chapter = await loadScenario(join(APP, 'content', bridge.file));
    const original = chapter.beats[bridge.beat];
    if (!original) throw new ScenarioError(`실제 원작 종점이 없습니다: ${bridge.beat}`);
    expect(original.ending?.id).toBe(bridge.ending);
    const legacy = new Engine({
      ...campaign, start: bridge.beat, beats: { ...campaign.beats, [bridge.beat]: original },
    }, new FakeGm()).newGame(71, `legacy-${bridge.beat}`);
    expect(legacy.state.ending).toBe(bridge.ending);
    legacy.state.flags.후속_시작 = true;
    await writeSave(saves, bridge.beat, campaign, legacy.state);
    const saved = await readSave(saves, bridge.beat, campaign);
    const before = structuredClone(saved);
    const observed: ViewpointObservation[] = [];
    const engine = new Engine(campaign, new FakeGm());
    const next = await resumeCampaign(engine, saved, (entry) => observed.push(entry));
    expect(next.continued).toBe(true);
    expect(saved).toEqual(before);
    const scenes = next.step.events.filter((event) => event.type === 'scene');
    expect(scenes[0]?.beat).toBe(bridge.start);
    expect(scenes.some((event) => event.beat === bridge.beat)).toBe(false);
    expect(observed.length).toBeGreaterThan(0);
    const first = observed[0];
    if (!first) throw new ScenarioError('신규 진입 관측이 없습니다');
    expect(first.source).toBe('fresh');
    expect(first.state.beat).toBe(bridge.start);
    for (const key of ['items', 'tracks', 'abilities', 'said', 'heard', 'rng'] as const) {
      expect(first.state[key]).toEqual(saved[key]);
    }
    expect(first.readLog().slice(0, saved.log.length)).toEqual(saved.log);
    if (bridge.beat === 'ep09_c084') {
      const destination = await loadScenario(join(APP, 'content/ep10_internal.yaml'));
      for (const observation of observed) {
        if (observation.event.type !== 'line') continue;
        const event = observation.event;
        const beat = destination.beats[observation.state.beat];
        expect([...(beat?.lead ?? []), ...(beat?.lines ?? [])]
          .some((line) => line.speaker === event.speaker && line.text === event.text)).toBe(true);
      }
    }
    for (const [speaker, words] of Object.entries(saved.spoken ?? {})) {
      expect(next.state.spoken?.[speaker]?.slice(0, words.length)).toEqual(words);
    }
    expect(next.state.log.slice(saved.log.length).filter((entry) => entry.kind === 'choice').map((entry) => entry.choice))
      .toEqual([bridge.choice]);
    const source = campaign.atlas?.nodes.find((node) => node.beats.includes(bridge.beat));
    const target = campaign.atlas?.nodes.find((node) => node.beats.includes(bridge.start));
    if (!source || !target) throw new ScenarioError('실제 원작 경계 지도 노드가 없습니다');
    expect(source.ending).toBe(false);
    expect(campaign.atlas?.edges).toContainEqual([source.id, target.id]);
    if (bridge.beat === 'ep06_c065') expect([source.col, source.row]).toEqual([20, 2]);
    const again = await resumeCampaign(engine, next.state);
    expect(again.continued).toBe(false);
    expect(again.state).toEqual(next.state);
  });
});
