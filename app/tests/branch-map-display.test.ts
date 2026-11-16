import { describe, expect, test } from 'bun:test';
import { atlasCheckpoint, buildAtlas, checkpointAtlas, emptyAtlas, nextHint, recordAtlas } from '../src/engine/atlas.ts';
import {
  atlasSceneToken, beginAtlasPlayback, confirmAtlasScene, createAtlasPlayback,
  packAtlasView, prepareAtlasDisplay, restoreAtlasPlayback,
} from '../src/engine/atlas-display.ts';
import { Engine } from '../src/engine/engine.ts';
import type { GameEvent, Scenario } from '../src/engine/types.ts';
import { FakeGm, fakeClock, loadDesert } from './helpers.ts';

const desert = await loadDesert();
const ids = ['b02_people', 'b05_why', 'b06_swing'] as const;
const graph: Scenario = {
  ...desert,
  atlas: {
    nodes: ids.map((beat, i) => ({ id: `node${i}`, col: i, row: 0, beats: [beat] })),
    edges: [['node0', 'node1'], ['node1', 'node2'], ['node0', 'node2']],
    chapters: [{ id: 'ep01', label: '1화', nodes: ['node0', 'node1'] }, { id: 'ep02', label: '2화', nodes: ['node2'] }],
  },
};
const scene = (beat: string): Extract<GameEvent, { type: 'scene' }> => ({
  type: 'scene', beat, title: desert.beats[beat]?.title ?? beat, bg: null,
  cast: { left: null, center: null, right: null }, sprites: {},
});
const events = ids.map(scene);

function ahead(session = 'first') {
  const engine = new Engine(desert, new FakeGm(), fakeClock().now);
  const { state } = engine.newGame(3, session);
  state.beat = 'b06_swing';
  state.free = { beat: state.beat, talks: 0, rolls: 0 };
  state.log = ids.map((beat, at) => ({ kind: 'beat', beat, title: desert.beats[beat]?.title ?? beat, at, playMs: at }));
  return state;
}

describe('엔진 선처리와 실제 표시 이력 분리', () => {
  test('표시 확인 전에는 세션 없는 지도에도 선처리한 현재 장면을 노출하지 않는다', () => {
    const record = recordAtlas(prepareAtlasDisplay(emptyAtlas()), ahead());
    const view = buildAtlas(graph, record);
    expect(view.currentScene).toBeNull();
    expect(view.nodes.filter((node) => node.current || node.onPath)).toEqual([]);
    expect(view.edges.filter((edge) => edge.onPath)).toEqual([]);
  });

  test('힌트의 발견 여부는 원시 로그 대신 실제 표시 기록을 따른다', () => {
    const hinted: Scenario = {
      ...graph,
      atlas: { ...graph.atlas, nodes: [{ id: 'hinted', col: 0, row: 0, beats: [ids[0]], hints: ['주변을 살핀다'] }], edges: [] },
    };
    const record = recordAtlas(prepareAtlasDisplay(emptyAtlas()), ahead());
    expect(nextHint(hinted, record, 'n0')?.level).toBe(1);
    const playback = createAtlasPlayback('first', events);
    const token = atlasSceneToken(playback);
    if (!token) throw new Error('확인 토큰이 없습니다');
    const shown = confirmAtlasScene(record, playback, 'first', token, { scene: events[0] });
    expect(nextHint(hinted, { ...shown, beats: [] }, 'n0')).toBeNull();
    const legacy = recordAtlas(emptyAtlas(), ahead());
    expect(buildAtlas(graph, legacy).currentScene).toBe(desert.beats[ids[2]]?.title ?? null);
    expect(buildAtlas(graph, legacy).nodes.filter((node) => node.current).map((node) => node.key)).toEqual(['n2']);
    expect(nextHint(hinted, legacy, 'n0')).toBeNull();
  });

  test('다음 화까지 선처리돼도 실제로 확인한 장면까지만 현재 위치와 이름과 발견수를 연다', () => {
    const state = ahead();
    const playback = createAtlasPlayback(state.session, events);
    let record = checkpointAtlas(graph, recordAtlas(prepareAtlasDisplay(emptyAtlas()), state), state);
    expect(buildAtlas(graph, record, state).nodes.filter((node) => node.label !== null)).toHaveLength(0);
    const first = atlasSceneToken(playback);
    if (!first) throw new Error('첫 확인 토큰이 없습니다');
    record = confirmAtlasScene(record, playback, state.session, first, { scene: events[0] });
    const view = buildAtlas(graph, record, state);
    expect(view.nodes.filter((node) => node.label !== null).map((node) => node.key)).toEqual(['n0']);
    expect(view.nodes.find((node) => node.current)?.chapter).toBe('ep01');
    expect(view.nodes.find((node) => node.key === 'n2')?.label).toBeNull();
    expect(atlasCheckpoint(record, state)).toBeNull();
    for (const event of events.slice(1)) {
      const token = atlasSceneToken(playback);
      if (!token) throw new Error('다음 확인 토큰이 없습니다');
      record = confirmAtlasScene(record, playback, state.session, token, { scene: event });
    }
    expect(buildAtlas(graph, record, state).nodes.find((node) => node.current)?.chapter).toBe('ep02');
    expect(buildAtlas(graph, record, state).nodes.filter((node) => node.label !== null)).toHaveLength(3);
    expect(atlasCheckpoint(record, state)).not.toBeNull();
  });

  test('실제 로그에 존재하는 미래 장면도 순서를 건너뛰면 거부한다', () => {
    const state = ahead();
    const playback = createAtlasPlayback(state.session, events);
    const record = recordAtlas(prepareAtlasDisplay(emptyAtlas()), state);
    const token = atlasSceneToken(playback);
    if (!token) throw new Error('확인 토큰이 없습니다');
    expect(() => confirmAtlasScene(record, playback, state.session, token, { scene: events[2] })).toThrow('장면 순서가 바뀌었습니다');
    expect(() => confirmAtlasScene(record, playback, 'other', token, { scene: events[0] })).toThrow('장면 순서가 바뀌었습니다');
    expect(playback.path).toEqual([]);
    expect(playback.queue).toEqual([...ids]);
  });

  test('확인한 뒤의 늦은 키와 다음 입력 전에 발급한 버전을 거부한다', () => {
    const state = ahead();
    const playback = createAtlasPlayback(state.session, events);
    let record = recordAtlas(prepareAtlasDisplay(emptyAtlas()), state);
    const token = atlasSceneToken(playback);
    if (!token) throw new Error('확인 토큰이 없습니다');
    record = confirmAtlasScene(record, playback, state.session, token, { scene: events[0] });
    expect(() => confirmAtlasScene(record, playback, state.session, token, { scene: events[1] })).toThrow('장면 순서가 바뀌었습니다');
    const beforeInput = atlasSceneToken(playback);
    if (!beforeInput) throw new Error('다음 확인 토큰이 없습니다');
    beginAtlasPlayback(playback);
    expect(() => confirmAtlasScene(record, playback, state.session, beforeInput, { scene: events[1] })).toThrow('장면 순서가 바뀌었습니다');
    const current = atlasSceneToken(playback);
    if (!current) throw new Error('갱신한 확인 토큰이 없습니다');
    expect(() => confirmAtlasScene(record, playback, state.session, { ...current, visit: 99 }, { scene: events[1] })).toThrow('장면 순서가 바뀌었습니다');
  });

  test('다른 판에서 정당하게 본 이력은 새 판의 선처리와 구분해 보존한다', () => {
    const first = ahead('first');
    const second = ahead('second');
    let record = recordAtlas(prepareAtlasDisplay(emptyAtlas()), first);
    const playback = createAtlasPlayback(first.session, events.slice(0, 2));
    for (const event of events.slice(0, 2)) {
      const token = atlasSceneToken(playback);
      if (!token) throw new Error('확인 토큰이 없습니다');
      record = confirmAtlasScene(record, playback, first.session, token, { scene: event });
    }
    record = recordAtlas(record, second);
    const other = createAtlasPlayback(second.session, events);
    const token = atlasSceneToken(other);
    if (!token) throw new Error('새 판 확인 토큰이 없습니다');
    record = confirmAtlasScene(record, other, second.session, token, { scene: events[0] });
    const view = buildAtlas(graph, record, second);
    expect(view.nodes.filter((node) => node.label !== null).map((node) => node.key)).toEqual(['n0', 'n1']);
    expect(view.nodes.filter((node) => node.onPath).map((node) => node.key)).toEqual(['n0']);
    expect(view.edges.filter((edge) => edge.seen).map((edge) => [edge.from, edge.to])).toEqual([['n0', 'n1']]);
  });

  test('자동 대사 중간 저장의 현재 장면과 남은 큐를 복원하며 게임 상태를 바꾸지 않는다', () => {
    const state = ahead();
    const before = structuredClone(state);
    const playback = createAtlasPlayback(state.session, events);
    const token = atlasSceneToken(playback);
    if (!token) throw new Error('확인 토큰이 없습니다');
    confirmAtlasScene(prepareAtlasDisplay(emptyAtlas()), playback, state.session, token, { scene: events[0] });
    const view = { scene: events[0], remaining: events.slice(1), backlog: [] };
    const packed = packAtlasView(playback, view);
    const restored = restoreAtlasPlayback({ ...state, session: 'loaded' }, [], packed);
    expect(restored.queue).toEqual([...ids]);
    expect(restored.path).toEqual([]);
    expect(state).toEqual(before);
    expect(() => packAtlasView(playback, { ...view, scene: events[2], remaining: [] })).toThrow('화면과 장면 순서가 다릅니다');
    expect(() => packAtlasView(playback, { ...view, remaining: [] })).toThrow('화면과 장면 순서가 다릅니다');
  });
});
