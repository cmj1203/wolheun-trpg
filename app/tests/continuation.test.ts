import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { connectContinuation, resumeCampaign } from '../src/engine/continuation.ts';
import { Engine } from '../src/engine/engine.ts';
import { readSave, writeSave } from '../src/engine/save.ts';
import { parseScenario, ScenarioError } from '../src/engine/scenario.ts';
import type { GameState, Scenario } from '../src/engine/types.ts';
import { APP, FakeGm, loadDesert } from './helpers.ts';

const base = await loadDesert();
const chapter: Scenario = {
  ...base,
  id: 'ep02_continuation_test',
  start: 'ep01_prison_test',
  cast: {},
  backgrounds: {},
  sprites: {},
  cgs: {},
  facts: [],
  fates: [],
  callbacks: [],
  foreshadow: [],
  atlas: undefined,
  beats: {
    ep01_prison_test: {
      id: 'ep01_prison_test',
      title: '감옥',
      lines: [{ speaker: '나레이션', text: '돌벽 너머로 햇볕이 비친다.' }],
      choices: [{ id: 'leave', text: '나간다', next: 'ep02_city_test' }],
    },
    ep02_city_test: {
      id: 'ep02_city_test',
      title: '거리',
      lines: [],
      ending: { id: 'chapter_test', title: '거리', summary: '거리로 나왔다.', next_hook: '' },
    },
  },
};
const campaign = connectContinuation(base, chapter);
const declaration = Bun.YAML.parse(await Bun.file(join(import.meta.dir, '../content/ep01_desert.yaml')).text());
if (typeof declaration !== 'object' || declaration === null || Array.isArray(declaration)) {
  throw new Error('시험 원본 대본이 객체가 아닙니다');
}
const run = join(APP, '../work/continuation/ep02/run');
await mkdir(run, { recursive: true });
const saves = await mkdtemp(join(run, 'save-tests-'));
afterAll(() => rm(saves, { recursive: true, force: true }));

function captured(beat: 'e_curious' | 'e_survivor' = 'e_curious'): GameState {
  const { state } = new Engine(base, new FakeGm(), () => 1_000).newGame(913, 'old-capture');
  state.beat = beat;
  state.ending = beat === 'e_curious' ? 'curious' : 'survivor';
  state.tracks = { ...state.tracks, 체력: 1, 정신력: 2, 귀찌: 3, 의심: 6, 탈주: 2 };
  state.flags = { ...state.flags, 지도_찢김: true, 가방_끈: true, 후드_벗음: true, 플레이어_기억: '모래를 맛봄' };
  state.items = state.items.filter((id) => id !== 'map');
  state.free = null;
  return state;
}

describe('후속 장 연결과 기존 저장', () => {
  test('장을 더해도 기존 저장 식별자와 사막 시작 시트는 유지한다', () => {
    expect(campaign.id).toBe(base.id);
    expect(campaign.start).toBe(base.start);
    expect(campaign.sheet).toEqual(base.sheet);
    expect(base.beats.e_curious?.ending?.id).toBe('curious');
  });

  test('탈주·계약·인질·압수 결말은 감옥으로 바꾸지 않는다', () => {
    for (const id of ['e_road', 'e_deal', 'e_value', 'e_spy']) {
      expect(campaign.beats[id]).toEqual(base.beats[id]);
    }
  });

  test('후속 장이 새 물건을 시작 소지품에 끼워 넣으면 거부한다', () => {
    const changed = { ...chapter, sheet: { ...chapter.sheet, items: [...chapter.sheet.items, { id: 'veil', name: '천', desc: '천' }] } };
    expect(() => connectContinuation(base, changed)).toThrow(ScenarioError);
  });

  test('후속 장이 기존 비트 식별자를 덮어쓰면 거부한다', () => {
    const changed = { ...chapter, beats: { ...chapter.beats, ...base.beats } };
    expect(() => connectContinuation(base, changed)).toThrow(ScenarioError);
  });

  test('같은 1화에 감옥을 합치고 기존 포획 결말을 감옥과 실제 연결한다', () => {
    const added: Scenario = {
      ...chapter,
      atlas: {
        nodes: [
          { id: 'prison_test', col: 5, row: 0, beats: ['ep01_prison_test'] },
          { id: 'city_test', col: 0, row: 0, beats: ['ep02_city_test'] },
        ],
        edges: [['prison_test', 'city_test']],
        chapters: [
          { id: 'ep01', label: '1화', nodes: ['prison_test'] },
          { id: 'ep02', label: '2화', nodes: ['city_test'] },
        ],
      },
    };
    const connected = connectContinuation(base, added);
    expect(connected.atlas?.chapters?.find((group) => group.id === 'ep01')?.nodes)
      .toEqual([...(base.atlas?.nodes.map((node) => node.id) ?? []), 'prison_test']);
    expect(connected.atlas?.chapters?.find((group) => group.id === 'ep02')?.nodes).toEqual(['city_test']);
    expect(connected.atlas?.nodes.find((node) => node.id === 'curious')?.ending).toBe(false);
    expect(connected.atlas?.nodes.find((node) => node.id === 'survivor')?.ending).toBe(false);
    expect(connected.atlas?.edges).toContainEqual(['curious', 'prison_test']);
    expect(connected.atlas?.edges).toContainEqual(['survivor', 'prison_test']);
  });

  test('대본에 선언한 화 이름과 노드 그룹을 파싱하여 보존한다', () => {
    const parsed = parseScenario(JSON.stringify({
      ...declaration,
      atlas: {
        ...base.atlas,
        chapters: [{ id: 'ep01', label: '1화', nodes: base.atlas?.nodes.map((node) => node.id) }],
      },
    }));
    expect(parsed.atlas?.chapters?.[0]?.label).toBe('1화');
  });

  test.each([
    { name: '미지 노드', chapters: [{ id: 'ep01', label: '1화', nodes: ['missing_node'] }] },
    { name: '중복 노드', chapters: [{ id: 'ep01', label: '1화', nodes: ['curious', 'curious'] }] },
    { name: '중복 화', chapters: [{ id: 'ep01', label: '1화', nodes: ['curious'] }, { id: 'ep01', label: '1화', nodes: ['survivor'] }] },
  ])('$name 지도 선언을 경계에서 거부한다', ({ chapters }) => {
    expect(() => parseScenario(JSON.stringify({
      ...declaration,
      atlas: { ...base.atlas, chapters },
    }))).toThrow(ScenarioError);
  });

  test.each(['e_curious', 'e_survivor'] as const)('%s 종료 저장은 효과와 난수 재적용 없이 감옥으로 이어진다', async (beat) => {
    const saved = captured(beat);
    const snapshot = structuredClone(saved);
    await writeSave(saves, beat, base, saved, 1_000);
    const loaded = await readSave(saves, beat, campaign);
    const resumed = await resumeCampaign(new Engine(campaign, new FakeGm(), () => 1_000), loaded);
    expect(resumed.continued).toBe(true);
    expect(resumed.state.beat).toBe('ep01_prison_test');
    expect(resumed.state.ending).toBeNull();
    expect(resumed.state.rng).toBe(snapshot.rng);
    expect(resumed.state.tracks).toEqual(snapshot.tracks);
    expect(resumed.state.items).toEqual(snapshot.items);
    for (const [flag, value] of Object.entries(snapshot.flags)) expect(resumed.state.flags[flag]).toEqual(value);
    expect(saved).toEqual(snapshot);
    expect(resumed.step.events.filter((event) => event.type === 'line').map((event) => event.text))
      .toEqual(['돌벽 너머로 햇볕이 비친다.']);
  });

  test('감옥에서 사막의 의심·머뭇·체력 쓰러짐 조건이 남아도 사막 끝으로 돌아가지 않는다', async () => {
    const saved = captured();
    saved.tracks.의심 = 10;
    saved.flags.머뭇 = 3;
    saved.flags.위험_실패 = true;
    saved.flags.체력_쓰러짐 = true;
    const engine = new Engine(campaign, new FakeGm(), () => 1_000);
    const resumed = await resumeCampaign(engine, saved);
    const next = await engine.act(resumed.state, { type: 'choose', id: 'leave' });
    expect(next.state.beat).toBe('ep02_city_test');
    expect(next.state.ending).toBe('chapter_test');
    expect(next.state.tracks.의심).toBe(10);
    expect(next.state.flags.체력_쓰러짐).toBe(true);
  });

  test('후속 장 중간 저장은 재개해도 소지품과 수치·난수가 바뀌지 않는다', async () => {
    const engine = new Engine(campaign, new FakeGm(), () => 1_000);
    const first = await resumeCampaign(engine, captured());
    await writeSave(saves, 'midchapter', campaign, first.state, 1_000);
    const loaded = await readSave(saves, 'midchapter', campaign);
    const snapshot = structuredClone(loaded);
    const resumed = await resumeCampaign(engine, loaded);
    expect(resumed.continued).toBe(false);
    expect(resumed.state).toEqual(snapshot);
    expect(resumed.step.prompt.type).toBe('choices');
  });

  test('사막 단독 실행과 탈주 종료 저장은 후속으로 자동 이동하지 않는다', async () => {
    const engine = new Engine(base, new FakeGm(), () => 1_000);
    const state = captured();
    state.beat = 'e_road';
    state.ending = 'road';
    const resumed = await resumeCampaign(engine, state);
    expect(resumed.continued).toBe(false);
    expect(resumed.state.beat).toBe('e_road');
    expect(resumed.state.ending).toBe('road');
  });
});
