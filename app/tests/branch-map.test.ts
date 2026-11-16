import { describe, expect, test } from 'bun:test';
import { atlasCheckpoint, attachAtlasView, buildAtlas, checkpointAtlas, emptyAtlas, recordAtlas, restartAtlas } from '../src/engine/atlas.ts';
import { Engine } from '../src/engine/engine.ts';
import type { GameState, Scenario } from '../src/engine/types.ts';
import { FakeGm, fakeClock, loadDesert } from './helpers.ts';

const desert = await loadDesert();
const graph: Scenario = {
  ...desert,
  atlas: {
    nodes: [
      { id: 'a', col: 0, row: 0, beats: ['b02_people'] },
      { id: 'b', col: 1, row: 0, beats: ['b05_why'] },
      { id: 'c', col: 2, row: 0, beats: ['b06_swing'] },
    ],
    edges: [['a', 'b'], ['b', 'c'], ['a', 'c']],
  },
};

function stateAt(beats: string[], session: string): GameState {
  const engine = new Engine(desert, new FakeGm(), fakeClock().now);
  const { state } = engine.newGame(3, session);
  return {
    ...state,
    beat: beats.at(-1) ?? state.beat,
    log: beats.map((beat, at) => ({ kind: 'beat', beat, title: desert.beats[beat]?.title ?? beat, at, playMs: at })),
  };
}

describe('분기 맵 실제 이동 이력', () => {
  test('서로 다른 판에서 끝점만 방문한 선을 지난 길로 표시하지 않는다', () => {
    const first = recordAtlas(emptyAtlas(), stateAt(['b02_people', 'b05_why'], 'first'));
    const all = recordAtlas(first, stateAt(['b02_people', 'b06_swing'], 'second'));
    const view = buildAtlas(graph, all);
    expect(view.edges.find((edge) => edge.from === 'n1' && edge.to === 'n2')?.seen).toBe(false);
    expect(view.edges.filter((edge) => edge.onPath).map((edge) => [edge.from, edge.to])).toEqual([['n0', 'n2']]);
  });

  test('이전 저장을 불러온 짧은 경로가 이미 수집한 실제 이동을 지우지 않는다', () => {
    const first = recordAtlas(emptyAtlas(), stateAt(['b02_people', 'b05_why', 'b06_swing'], 'first'));
    const loaded = recordAtlas(first, stateAt(['b02_people'], 'loaded'));
    const view = buildAtlas(graph, loaded);
    expect(view.edges.filter((edge) => edge.seen).map((edge) => [edge.from, edge.to])).toEqual([['n0', 'n1'], ['n1', 'n2']]);
    expect(view.edges.some((edge) => edge.onPath)).toBe(false);
  });

  test('장 선언으로 분류하고 구현되지 않은 화를 표시하지 않는다', () => {
    const chapterGraph: Scenario = {
      ...desert,
      atlas: {
        nodes: [
          { id: 'prison', col: 0, row: 0, beats: ['b02_people'] },
          { id: 'city', col: 1, row: 0, beats: ['b05_why'] },
          { id: 'future', col: 2, row: 0, beats: ['ep03_missing'] },
        ],
        edges: [['prison', 'city']],
        chapters: [
          { id: 'ep01', label: '1화', nodes: ['prison'] },
          { id: 'ep02', label: '2화', nodes: ['city'] },
          { id: 'ep03', label: '3화', nodes: ['future'] },
        ],
      },
    };
    const view = buildAtlas(chapterGraph, recordAtlas(emptyAtlas(), stateAt(['b02_people', 'b05_why'], 'first')));
    expect(view.chapters).toEqual([{ key: 'ep01', label: '1화' }, { key: 'ep02', label: '2화' }]);
    expect(view.nodes.map((node) => node.chapter)).toEqual(['ep01', 'ep02']);
    expect(view.arrivals.find((arrival) => arrival.chapter === 'ep01' && arrival.kind === 'chapter')?.reached).toBe(true);
    expect(view.nodes.some((node) => node.key === 'n2')).toBe(false);
  });

  test('장 경계의 두 끝점을 다른 판에서 봐도 장 통과를 수집하지 않는다', () => {
    const chapterGraph: Scenario = {
      ...graph,
      atlas: {
        nodes: [
          { id: 'a', col: 0, row: 0, beats: ['b02_people'] },
          { id: 'b', col: 1, row: 0, beats: ['b05_why'] },
        ],
        edges: [['a', 'b']],
        chapters: [{ id: 'ep01', label: '1화', nodes: ['a'] }, { id: 'ep02', label: '2화', nodes: ['b'] }],
      },
    };
    const first = recordAtlas(emptyAtlas(), stateAt(['b02_people'], 'first'));
    const second = recordAtlas(first, stateAt(['b05_why'], 'second'));
    const view = buildAtlas(chapterGraph, second);
    expect(view.arrivals.every((arrival) => !arrival.reached && arrival.label === null)).toBe(true);
  });
});

describe('갈림길의 실제 상태 복원', () => {
  test('같은 노드를 다른 소지품으로 방문한 두 판을 각각 복원한다', () => {
    const first = stateAt(['b02_people'], 'first');
    first.items = ['magic_bag'];
    first.flags = { 아는_정보: true };
    const second = stateAt(['b02_people'], 'second');
    second.items = ['map'];
    second.flags = {};
    let record = checkpointAtlas(graph, checkpointAtlas(graph, emptyAtlas(), first), second);
    record = attachAtlasView(record, first, 'c0', 1, 1, { scene: { beat: first.beat }, remaining: [] });
    record = attachAtlasView(record, second, 'c1', 1, 1, { scene: { beat: second.beat }, remaining: [] });
    const restoredFirst = restartAtlas(graph, record, 'c0', 'restored-first', 2000);
    const restoredSecond = restartAtlas(graph, record, 'c1', 'restored-second', 2000);
    expect(restoredFirst.state.items).toEqual(['magic_bag']);
    expect(restoredFirst.state.flags).toEqual({ 아는_정보: true });
    expect(restoredSecond.state.items).toEqual(['map']);
    expect(restoredSecond.state.flags).toEqual({});
    restoredFirst.state.items.push('map');
    expect(restartAtlas(graph, record, 'c0', 'again', 2000).state.items).toEqual(['magic_bag']);
  });

  test('판정·시간·의심과 입력 진행 및 대사 큐를 그대로 복원한다', () => {
    const original = stateAt(['b02_people'], 'first');
    original.rng = 98765;
    original.playMs = 4000;
    original.tracks.의심 = 3;
    const view = { scene: { beat: original.beat }, remaining: [{ type: 'line', text: '아직 읽지 않은 줄' }], backlog: [] };
    let record = checkpointAtlas(graph, emptyAtlas(), original);
    const token = atlasCheckpoint(record, original);
    if (!token) throw new Error('테스트 갈림길이 생성되지 않았습니다');
    record = attachAtlasView(record, original, token.key, token.version, token.visit, view);
    original.items = [];
    original.flags.미래_지식 = true;
    original.tracks.의심 = 9;
    const restored = restartAtlas(graph, record, token.key, 'restored', 9000);
    const before = structuredClone(restored.state);
    const engine = new Engine(desert, new FakeGm(), fakeClock().now);
    engine.resume(restored.state);
    expect(restored.state).toEqual(before);
    expect(restored.state.rng).toBe(98765);
    expect(restored.state.tracks.의심).toBe(3);
    expect(restored.state.playMs).toBe(4000);
    expect(restored.state.flags.미래_지식).toBeUndefined();
    expect(restored.state.free).toEqual(before.free);
    expect(restored.view).toEqual(view);
    expect(record.checkpoints?.[0]?.state.session).toBe('first');
  });

  test('더 진행한 뒤 늦게 도착한 화면과 다른 세션의 화면을 거부한다', () => {
    const original = stateAt(['b02_people'], 'first');
    const record = checkpointAtlas(graph, emptyAtlas(), original);
    const token = atlasCheckpoint(record, original);
    if (!token) throw new Error('테스트 갈림길이 생성되지 않았습니다');
    const later = stateAt(['b02_people', 'b05_why'], 'first');
    expect(() => attachAtlasView(record, later, token.key, token.version, token.visit, {})).toThrow('상태가 바뀌었습니다');
    expect(() => attachAtlasView(record, { ...original, session: 'other' }, token.key, token.version, token.visit, {})).toThrow('상태가 바뀌었습니다');
    expect(() => attachAtlasView(record, original, token.key, token.version + 1, token.visit, {})).toThrow('상태가 바뀌었습니다');
    expect(() => attachAtlasView(record, original, token.key, token.version, token.visit + 1, {})).toThrow('상태가 바뀌었습니다');
    expect(record.checkpoints?.[0]?.view).toBeUndefined();
  });

  test('갈림길 이후의 자유 입력 진행을 새 진입 상태로 저장하지 않는다', () => {
    const original = stateAt(['b02_people'], 'first');
    const progressed = structuredClone(original);
    progressed.log.push({ kind: 'input', beat: progressed.beat, text: '잠깐 기다린다', result: 'idle', approach: null, item: null, source: 'rule', at: 2, playMs: 2 });
    expect(checkpointAtlas(graph, emptyAtlas(), progressed).checkpoints).toBeUndefined();
  });

  test('당시 화면이 저장되지 않은 지점에서 재시작하지 않는다', () => {
    const original = stateAt(['b02_people'], 'first');
    const record = checkpointAtlas(graph, emptyAtlas(), original);
    expect(() => restartAtlas(graph, record, 'c0', 'new', 3000)).toThrow('화면이 아직 저장되지 않았습니다');
    expect(() => restartAtlas(graph, record, 'c99', 'new', 3000)).toThrow('갈림길이 없습니다');
  });
});
