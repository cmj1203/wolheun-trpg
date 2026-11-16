import { describe, expect, test } from 'bun:test';
import { buildAtlas, emptyAtlas, type AtlasRecord } from '../src/engine/atlas.ts';
import type { BeatSpec, Scenario } from '../src/engine/types.ts';
import { loadDesert } from './helpers.ts';

const desert = await loadDesert();
const beatFixture = (id: string): BeatSpec => ({
  id,
  title: id,
  lines: [{ speaker: '나레이션', text: id }],
});
const scenario: Scenario = {
  ...desert,
  backgrounds: {
    ...desert.backgrounds,
    thumbnail_room: { label: 'thumbnail room', file: '/images/thumbnail-room.webp' },
  },
  cgs: {
    ...desert.cgs,
    thumbnail_cg: { label: 'thumbnail CG', file: '/images/thumbnail-cg.webp' },
    thumbnail_alt_cg: { label: 'alternate CG', file: '/images/thumbnail-alt.webp', alt: { if: 'flag:hood', id: 'thumbnail_cg' } },
  },
  beats: {
    ...desert.beats,
    thumbnail_before: { ...beatFixture('thumbnail_before'), bg: 'thumbnail_room' },
    thumbnail_cg_beat: {
      ...beatFixture('thumbnail_cg_beat'),
      lines: [{ speaker: '나레이션', text: '첫 줄 CG', cg: 'thumbnail_cg' }, { speaker: '나레이션', text: '후속 CG', cg: 'thumbnail_alt_cg' }],
    },
    thumbnail_conditional_cg: {
      ...beatFixture('thumbnail_conditional_cg'), bg: 'thumbnail_room',
      lines: [{ speaker: '나레이션', text: '조건부 첫 줄', cg: 'thumbnail_cg', if: 'flag:hood' }],
    },
    thumbnail_alt_cg_beat: {
      ...beatFixture('thumbnail_alt_cg_beat'), bg: 'thumbnail_room',
      lines: [{ speaker: '나레이션', text: '대체 CG는 배경으로 처리', cg: 'thumbnail_alt_cg' }],
    },
    thumbnail_after: { ...beatFixture('thumbnail_after'), bg: 'thumbnail_room' },
    thumbnail_hidden: { ...beatFixture('thumbnail_hidden'), bg: 'thumbnail_room' },
  },
  atlas: {
    nodes: [
      { id: 'mixed', col: 0, row: 0, beats: ['thumbnail_before', 'thumbnail_cg_beat'] },
      { id: 'hidden', col: 1, row: 0, beats: ['thumbnail_hidden'] },
      { id: 'later', col: 2, row: 0, beats: ['thumbnail_after'] },
      { id: 'conditional', col: 3, row: 0, beats: ['thumbnail_conditional_cg'] },
      { id: 'alt', col: 4, row: 0, beats: ['thumbnail_alt_cg_beat'] },
    ],
    edges: [['mixed', 'hidden'], ['hidden', 'later'], ['later', 'conditional'], ['conditional', 'alt']],
  },
};

describe('분기 지도 썸네일의 표시 이력과 장면 자산', () => {
  test('도달 전 노드에는 해당 장면 이미지 URL을 노출하지 않는다', () => {
    const record: AtlasRecord = { ...emptyAtlas(), display: { beats: [], paths: [], runs: {} } };
    const view = buildAtlas(scenario, record);

    expect(view.nodes.find((node) => node.key === 'n1')?.thumbnail).toBeNull();
  });

  test('도달한 노드는 도달한 비트의 CG를 배경보다 우선한다', () => {
    const record: AtlasRecord = {
      ...emptyAtlas(),
      display: { beats: ['thumbnail_cg_beat'], paths: [], runs: {} },
    };
    const view = buildAtlas(scenario, record);

    expect(view.nodes.find((node) => node.key === 'n0')?.thumbnail).toEqual({
      kind: 'cgs',
      id: 'thumbnail_cg',
    });
  });

  test('앞 비트만 도달한 노드는 뒤 비트의 CG를 미리 보여 주지 않는다', () => {
    const record: AtlasRecord = {
      ...emptyAtlas(),
      display: { beats: ['thumbnail_before'], paths: [], runs: {} },
    };
    const view = buildAtlas(scenario, record);

    expect(view.nodes.find((node) => node.key === 'n0')?.thumbnail).toEqual({
      kind: 'backgrounds',
      id: 'thumbnail_room',
    });
  });

  test('같은 노드에서 더 나중에 표시한 비트의 첫 CG를 대표 썸네일로 쓴다', () => {
    const record: AtlasRecord = {
      ...emptyAtlas(),
      display: { beats: ['thumbnail_before', 'thumbnail_cg_beat'], paths: [], runs: {} },
    };
    const view = buildAtlas(scenario, record);

    expect(view.nodes.find((node) => node.key === 'n0')?.thumbnail).toEqual({
      kind: 'cgs',
      id: 'thumbnail_cg',
    });
  });

  test('첫 줄의 조건부 CG는 무시하고 유효한 배경을 사용한다', () => {
    const record: AtlasRecord = {
      ...emptyAtlas(),
      display: { beats: ['thumbnail_conditional_cg'], paths: [], runs: {} },
    };
    const view = buildAtlas(scenario, record);

    expect(view.nodes.find((node) => node.key === 'n3')?.thumbnail).toEqual({
      kind: 'backgrounds',
      id: 'thumbnail_room',
    });
  });

  test('alt가 선언된 CG는 직접 선택하지 않고 배경으로 대체한다', () => {
    const record: AtlasRecord = {
      ...emptyAtlas(),
      display: { beats: ['thumbnail_alt_cg_beat'], paths: [], runs: {} },
    };
    const view = buildAtlas(scenario, record);

    expect(view.nodes.find((node) => node.key === 'n4')?.thumbnail).toEqual({
      kind: 'backgrounds',
      id: 'thumbnail_room',
    });
  });

  test('표시 이력이 있으면 선처리 로그만 있는 미래 노드 이미지를 숨긴다', () => {
    const record: AtlasRecord = {
      beats: ['thumbnail_hidden', 'thumbnail_after'],
      last: ['thumbnail_hidden', 'thumbnail_after'],
      display: { beats: [], paths: [], runs: { session: ['thumbnail_hidden', 'thumbnail_after'] } },
    };
    const view = buildAtlas(scenario, record);

    expect(view.nodes.find((node) => node.key === 'n1')?.thumbnail).toBeNull();
    expect(view.nodes.find((node) => node.key === 'n2')?.thumbnail).toBeNull();
  });

  test('표시 이력 없는 이전 기록은 record.beats로 도달한 노드의 배경을 고른다', () => {
    const record: AtlasRecord = { ...emptyAtlas(), beats: ['thumbnail_before'] };
    const view = buildAtlas(scenario, record);

    expect(view.nodes.find((node) => node.key === 'n0')?.thumbnail).toEqual({
      kind: 'backgrounds',
      id: 'thumbnail_room',
    });
  });
});
