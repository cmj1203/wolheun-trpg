import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { Engine } from '../src/engine/engine.ts';
import { readSave, writeSave } from '../src/engine/save.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { ViewpointObservation } from '../src/engine/types.ts';
import { FakeGm, SCENARIO_PATH } from './helpers.ts';

const campaign = await loadCampaignScenario(SCENARIO_PATH);
const original = await loadScenario(SCENARIO_PATH);
const directory = await mkdtemp(join(tmpdir(), 'continuation-restraint-'));
afterAll(() => rm(directory, { recursive: true, force: true }));

test.each([
  { beat: 'e_survivor', ending: 'survivor' },
  { beat: 'e_curious', ending: 'curious' },
])('$ending 옛 종료 저장의 팔 붙들림은 c077 첫 표시에서만 끝나고 비용은 유지된다', async ({ beat, ending }) => {
  // 종료 저장의 주어진 상태를 검증하는 단위 fixture이며 실제 스토리 완주가 아니다.
  const legacy = new Engine({ ...original, start: beat }, new FakeGm()).newGame(913, `unit-held-${ending}`).state;
  expect(legacy.ending).toBe(ending);
  legacy.flags.팔_붙들림 = true;
  legacy.flags.머뭇 = 1;
  legacy.tracks.체력 = 2;
  legacy.tracks.정신력 = 2;
  legacy.tracks.의심 = 8;
  await writeSave(directory, ending, campaign, legacy);
  const saved = await readSave(directory, ending, campaign);
  const before = structuredClone(saved);
  const observations: ViewpointObservation[] = [];
  const engine = new Engine(campaign, new FakeGm());
  const result = await resumeCampaign(engine, saved, (observation) => observations.push(observation));
  expect(result.continued).toBe(true);
  expect(saved).toEqual(before);
  const scene = observations.find((observation) => observation.event.type === 'scene');
  const tower = observations.find((observation) => observation.event.type === 'line' && observation.event.cg === 'ep02_prod_ep01_c076_tower');
  const floor = observations.find((observation) => observation.event.type === 'line' && observation.event.cg === 'ep02_prod_ep01_c077_floor');
  expect(scene?.state.flags.팔_붙들림).toBe(true);
  expect(tower?.state.flags.팔_붙들림).toBe(true);
  expect(floor?.source).toBe('fresh');
  expect(floor?.state.flags.팔_붙들림).toBe(false);
  expect(floor?.state.flags.머뭇).toBe(1);
  expect(floor?.state.flags.후드_벗음).toBe(true);
  expect(floor?.state.tracks).toEqual(saved.tracks);
  expect(floor?.state.items).toEqual(saved.items);
  expect(floor?.state.abilities).toEqual(saved.abilities);
  expect(floor?.state.rng).toBe(saved.rng);
  expect(floor?.state.said).toEqual(saved.said);
  expect(floor?.readLog().slice(0, saved.log.length)).toEqual(saved.log);
  for (const [speaker, words] of Object.entries(saved.spoken ?? {})) {
    expect(floor?.state.spoken?.[speaker]?.slice(0, words.length)).toEqual(words);
  }
  expect(result.state.log.slice(saved.log.length).filter((entry) => entry.kind === 'choice').map((entry) => entry.choice))
    .toEqual(['continue_chapter']);
});

test('이미 지난 감옥 줄을 재개해 이후의 현재 붙들림을 다시 지우지 않는다', async () => {
  const engine = new Engine({ ...campaign, start: 'ep02_question' }, new FakeGm());
  const { state } = engine.newGame(37, 'unit-later-hold');
  state.flags.팔_붙들림 = true;
  state.tracks.체력 = 2;
  const before = structuredClone(state);
  const result = await resumeCampaign(engine, state);
  expect(result.continued).toBe(false);
  expect(result.state).toEqual(before);
  expect(result.state.flags.팔_붙들림).toBe(true);
});
