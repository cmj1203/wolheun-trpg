import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { summarize } from '../src/engine/summary.ts';
import type { GameState, Scenario } from '../src/engine/types.ts';
import { APP, loadDesert } from './helpers.ts';

const emptyState = (beat: string, ending: string | null = null): GameState => ({
  v: 1,
  scenario: 'fixture',
  session: 'summary',
  seed: 1,
  rng: 1,
  beat,
  tracks: { 체력: 4, 정신력: 4, 의심: 0, 집착: 0, 호감: 0, 귀찌: 4, 탈주: 0, 행운: 0 },
  abilities: { 재치: 1, 손재주: 1, 매력: 2, 근력: 0, 교양: 1 },
  items: [],
  flags: {},
  free: null,
  recent: [],
  ending,
  startedAt: 0,
  playMs: 0,
  lastActiveAt: 0,
  log: [],
});

test('terminal10 summary uses its declared chapter label', async () => {
  const scenario = await loadCampaignScenario(join(APP, 'content', 'ep01_desert.yaml'));
  const beat = scenario.beats.ep10_end;
  expect(beat).toBeDefined();
  expect(beat?.ending).toBeDefined();
  expect(beat?.ending?.id).toBe('ep10_boundary');
  expect(summarize(scenario, emptyState(beat?.id ?? '', beat?.ending?.id ?? null)).episode).toBe('10화');
});

test('an ending in an earlier declared alternative chapter uses that chapter label', () => {
  const scenario: Scenario = {
    ...minimalScenario(),
    beats: {
      route: minimalBeat('route'),
      ep01_outcome: { ...minimalBeat('ep01_outcome'), ending: { id: 'alternate', title: '대안', summary: '', next_hook: '' } },
    },
    atlas: {
      nodes: [{ id: 'start', col: 0, row: 0, beats: ['route'] }, { id: 'outcome', col: 1, row: 0, beats: ['ep01_outcome'] }],
      edges: [['midpoint', 'outcome']],
      chapters: [
        { id: 'ep01', label: '1화', nodes: ['start'] },
        { id: 'ep02', label: '2화 · 궁 안', nodes: ['outcome'] },
      ],
    },
  };
  expect(summarize(scenario, emptyState('route', 'alternate')).episode).toBe('2화 · 궁 안');
});

test('desert and standalone summaries preserve their original episode wording', async () => {
  const desert = await loadDesert();
  expect(summarize(desert, emptyState(desert.start)).episode).toBe(desert.episode);
  const campaign = await loadCampaignScenario(join(APP, 'content', 'ep01_desert.yaml'));
  const road = campaign.beats.e_road;
  expect(road?.ending).toBeDefined();
  expect(summarize(campaign, emptyState(road?.id ?? '', road?.ending?.id ?? null)).episode).toBe(campaign.episode);
  const standalone = minimalScenario();
  standalone.episode = '첫 화 · 사막 조우';
  expect(summarize(standalone, emptyState(standalone.start)).episode).toBe('첫 화 · 사막 조우');
});

test('metadata wins for ambiguous beat IDs and ongoing state uses its current beat', () => {
  const scenario: Scenario = {
    ...minimalScenario(),
    beats: {
      start: minimalBeat('start'),
      ep01_named_something_else: minimalBeat('ep01_named_something_else'),
      unconventional: { ...minimalBeat('unconventional'), ending: { id: 'declared-ending', title: '', summary: '', next_hook: '' } },
    },
    atlas: {
      nodes: [
        { id: 'chapter-one-node', col: 0, row: 0, beats: ['start'] },
        { id: 'chapter-two-node', col: 1, row: 0, beats: ['ep01_named_something_else', 'unconventional'] },
      ],
      edges: [],
      chapters: [
        { id: 'chapter-one', label: '1화', nodes: ['chapter-one-node'] },
        { id: 'chapter-two', label: '2화 · 다른 길', nodes: ['chapter-two-node'] },
      ],
    },
  };
  expect(summarize(scenario, emptyState('ep01_named_something_else')).episode).toBe('2화 · 다른 길');
  expect(summarize(scenario, emptyState('unconventional', 'declared-ending')).episode).toBe('2화 · 다른 길');
});

function minimalScenario(): Scenario {
  const beat = minimalBeat('start');
  return {
    id: 'fixture',
    title: '시험',
    episode: '1화 · 사막 조우',
    source: '',
    rating: '',
    start: 'start',
    sheet: { name: '아시나', abilities: { 재치: 1, 손재주: 1, 매력: 2, 근력: 0, 교양: 1 }, tracks: { 체력: 4, 정신력: 4, 의심: 0, 집착: 0, 호감: 0, 귀찌: 4, 탈주: 0, 행운: 0 }, items: [] },
    cast: {},
    backgrounds: {},
    sprites: {},
    cgs: {},
    beats: { start: beat },
    facts: [],
  };
}

function minimalBeat(id: string): Scenario['beats'][string] {
  return { id, title: id, lines: [] };
}
