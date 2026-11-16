import { GameError, type GameState, type Scenario } from './types.ts';
import type { AtlasDisplayRecord } from './atlas-display.ts';

export interface AtlasCheckpoint {
  readonly key: string;
  readonly state: GameState;
  readonly version: number;
  readonly visit: number;
  readonly view?: unknown;
}

/** 저장 칸과 따로, 판을 넘어 남는 도달 기록. */
export interface AtlasRecord {
  beats: string[];
  last: string[];
  /** 칸마다 본 힌트 단계. */
  hints?: Record<string, number>;
  /** 하나의 실제 판에서 관찰한 비트열. 끝점 방문 여부로 선을 추정하지 않는다. */
  paths?: string[][];
  scenario?: string;
  checkpoints?: AtlasCheckpoint[];
  display?: AtlasDisplayRecord;
}

export const emptyAtlas = (): AtlasRecord => ({ beats: [], last: [] });

export function appendAtlasPath(paths: readonly (readonly string[])[], run: readonly string[]): string[][] {
  const prefix = (a: readonly string[], b: readonly string[]) => a.length <= b.length && a.every((beat, i) => beat === b[i]);
  return paths.some((path) => prefix(run, path))
    ? paths.map((path) => [...path])
    : [...paths.filter((path) => !prefix(path, run)).map((path) => [...path]), [...run]];
}

export function recordAtlas(record: AtlasRecord, state: GameState): AtlasRecord {
  const run = state.log.flatMap((e) => (e.kind === 'beat' ? [e.beat] : []));
  const prior = record.scenario && record.scenario !== state.scenario ? emptyAtlas() : record;
  // 긴 경로의 접두사만 다시 저장하지 않는다. 갈라진 두 실제 경로는 각각 남긴다.
  return {
    ...prior,
    scenario: state.scenario,
    beats: [...new Set([...prior.beats, ...run])],
    last: run,
    paths: appendAtlasPath(prior.paths ?? [], run),
  };
}

/** 지도에서 나가는 선이 두 개 이상인 칸의 비트. 여기 들어선 직후가 '마지막 갈림길'이라 자동 저장한다. */
export function forkBeats(scenario: Scenario): Set<string> {
  const atlas = scenario.atlas ?? { nodes: [], edges: [] };
  const out = new Map<string, number>();
  for (const [from] of atlas.edges) out.set(from, (out.get(from) ?? 0) + 1);
  return new Set(atlas.nodes.filter((n) => (out.get(n.id) ?? 0) >= 2).flatMap((n) => n.beats));
}

function checkpointBeats(scenario: Scenario): Set<string> {
  return new Set((scenario.atlas?.nodes ?? []).flatMap((node) => node.beats).filter((id) => {
    const beat = scenario.beats[id];
    // 다음 장면은 같아도 선택에 따라 손실·정보가 달라지는 자유 입력은 재시작 지점이다.
    return (beat?.choices?.length ?? 0) > 1 || (beat?.free?.approaches.length ?? 0) > 1;
  }));
}

/** 엔진이 진입 효과와 대사를 처리한 직후의 서버 상태만 보관한다. */
export function checkpointAtlas(scenario: Scenario, record: AtlasRecord, state: GameState): AtlasRecord {
  if (state.ending || !checkpointBeats(scenario).has(state.beat)) return record;
  const entered = state.log.findLastIndex((entry) => entry.kind === 'beat');
  if (entered < 0 || state.log.slice(entered + 1).some((entry) => entry.kind === 'input' || entry.kind === 'choice' || entry.kind === 'check')) return record;
  const visit = state.log.filter((entry) => entry.kind === 'beat').length;
  const checkpoints = record.checkpoints ?? [];
  if (checkpoints.some((point) => point.state.session === state.session && point.visit === visit)) return record;
  return {
    ...record,
    checkpoints: [...checkpoints, { key: `c${checkpoints.length}`, state: structuredClone(state), version: state.log.length, visit }],
  };
}

export function atlasCheckpoint(record: AtlasRecord, state: GameState) {
  if (record.display && record.display.runs[state.session]?.at(-1) !== state.beat) return null;
  const point = record.checkpoints?.findLast((candidate) => candidate.state.session === state.session && candidate.version === state.log.length && candidate.state.beat === state.beat);
  return point ? { key: point.key, version: point.version, visit: point.visit } : null;
}

/** 클라이언트의 화면만 받고, 서버가 보관한 과거 게임 상태는 바꾸지 않는다. */
export function attachAtlasView(record: AtlasRecord, state: GameState, key: string, version: number, visit: number, view: unknown): AtlasRecord {
  const point = record.checkpoints?.find((candidate) => candidate.key === key);
  if (!point || point.state.session !== state.session || point.state.beat !== state.beat ||
    point.version !== version || state.log.length !== version || point.visit !== visit ||
    state.log.filter((entry) => entry.kind === 'beat').length !== visit ||
    (record.display !== undefined && record.display.runs[state.session]?.at(-1) !== state.beat)) {
    throw new GameError('갈림길 이후 상태가 바뀌었습니다. 분기 맵을 다시 열어 주세요.');
  }
  if (point.view !== undefined) return record;
  return { ...record, checkpoints: record.checkpoints?.map((candidate) => candidate === point ? { ...candidate, view: structuredClone(view) } : candidate) };
}

/** 진입을 다시 실행하지 않는다. 반환 상태에는 이 지점 이후의 지식·소지품이 없다. */
export function restartAtlas(scenario: Scenario, record: AtlasRecord, key: string, session: string, now: number): { state: GameState; view: unknown } {
  const point = record.checkpoints?.find((candidate) => candidate.key === key);
  if (!point || point.state.scenario !== scenario.id || !checkpointBeats(scenario).has(point.state.beat)) throw new GameError('다시 시작할 갈림길이 없습니다.');
  if (point.view === undefined) throw new GameError('갈림길 화면이 아직 저장되지 않았습니다. 분기 맵을 다시 열어 주세요.');
  return {
    state: { ...structuredClone(point.state), session, lastActiveAt: now },
    view: structuredClone(point.view),
  };
}

export type AtlasEndingKind = 'chapter' | 'alternative' | 'failure' | 'variation';

function endingKind(id: string, bad: boolean): AtlasEndingKind {
  if (bad) return 'failure';
  if (id === 'e_survivor' || id === 'ep02_court_boundary') return 'chapter';
  if (id === 'e_curious' || id === 'e_spy') return 'variation';
  return 'alternative';
}

/**
 * 화면에 줄 지도. 안 가 본 칸은 이름도 장면 id 도 넣지 않는다. 작은 끝은 칸이 아니라 지도 아래 작은 점 줄로, 도달한 것만 제목을 받는다.
 * key 는 그 칸의 차례일 뿐이라 내용을 알려 주지 않는다.
 */
export function buildAtlas(scenario: Scenario, record: AtlasRecord, state?: GameState) {
  const atlas = scenario.atlas ?? { nodes: [], edges: [] };
  const seen = new Set(record.scenario && record.scenario !== scenario.id ? [] : record.display?.beats ?? record.beats);
  const currentRun = state
    ? record.display ? record.display.runs[state.session] ?? [] : state.log.flatMap((entry) => entry.kind === 'beat' ? [entry.beat] : [])
    : record.display ? Object.values(record.display.runs).at(-1) ?? [] : record.last;
  const last = new Set(currentRun);
  const keyOf = new Map(atlas.nodes.map((n, i) => [n.id, `n${i}`]));
  const nodeOfBeat = new Map(atlas.nodes.flatMap((node) => node.beats.map((beat) => [beat, node.id] as const)));
  const links = (path: readonly string[]) => {
    const mapped = path.flatMap((beat) => nodeOfBeat.has(beat) ? [nodeOfBeat.get(beat) ?? ''] : []);
    return new Set(mapped.slice(1).flatMap((to, i) => mapped[i] === to ? [] : [JSON.stringify([mapped[i], to])]));
  };
  const travelled = new Set((record.display?.paths ?? record.paths ?? [record.last]).flatMap((path) => [...links(path)]));
  const active = links(currentRun);
  const reached = new Map(atlas.nodes.map((n) => [n.id, n.beats.some((b) => seen.has(b))]));
  const onPath = new Map(atlas.nodes.map((n) => [n.id, n.beats.some((b) => last.has(b))]));
  const current = currentRun.findLast((beat) => nodeOfBeat.has(beat));
  const checkpoints = record.checkpoints ?? [];
  const runs = [...new Set(checkpoints.map((point) => point.state.session))];
  const declaredChapters = atlas.chapters ?? [{ id: 'ep01', label: scenario.episode, nodes: atlas.nodes.map((node) => node.id) }];
  const chapterOf = (beats: readonly string[]) => declaredChapters.find((chapter) => beats.some((beat) => chapter.nodes.includes(nodeOfBeat.get(beat) ?? '')))?.id ?? declaredChapters[0]?.id ?? 'ep01';
  const nodes = atlas.nodes.flatMap((n) => {
    const implemented = n.beats.filter((id) => scenario.beats[id] !== undefined);
    if (implemented.length === 0) return [];
    const visited = implemented.find((id) => seen.has(id));
    const beat = scenario.beats[visited ?? implemented[0] ?? ''];
    if (!beat || beat.ending?.id === 'quit') return [];
    const isReached = reached.get(n.id) === true;
    const shownBeat = scenario.beats[[...seen].findLast((id) => implemented.includes(id)) ?? ''];
    const opening = (shownBeat?.lead ?? shownBeat?.lines ?? [])[0];
    const cg = opening?.if ? undefined : opening?.cg_from ?? opening?.cg;
    const thumbnail = isReached && cg && scenario.cgs[cg] && !scenario.cgs[cg]?.alt
      ? { kind: 'cgs' as const, id: cg }
      : isReached && shownBeat?.bg && scenario.backgrounds[shownBeat.bg]
        ? { kind: 'backgrounds' as const, id: shownBeat.bg }
        : null;
    return [{
      key: keyOf.get(n.id) ?? '', col: n.col, row: n.row, chapter: chapterOf(implemented),
      ending: beat.ending !== undefined, label: isReached ? (n.label ?? beat.ending?.title ?? beat.title) : null,
      thumbnail,
      onPath: onPath.get(n.id) === true, current: current !== undefined && implemented.includes(current),
      hint: isReached ? 0 : (record.hints?.[n.id] ?? 0),
      kind: isReached && beat.ending ? endingKind(beat.id, beat.ending.bad === true) : null,
      checkpoints: isReached ? checkpoints.filter((point) => implemented.includes(point.state.beat)).map((point) => ({
        key: point.key, run: runs.indexOf(point.state.session) + 1, ready: point.view !== undefined,
      })) : [],
    }];
  });
  const keys = new Set(nodes.map((node) => node.key));
  const knownPairs = new Set(atlas.edges.map((edge) => JSON.stringify(edge)));
  // 고정표에 없는 실제 이동도 표시해, 바뀐 분기를 옛 선으로 접어 넣지 않는다.
  const pairs = [...atlas.edges];
  for (const path of record.display?.paths ?? record.paths ?? [record.last]) {
    const mapped = path.flatMap((beat) => nodeOfBeat.has(beat) ? [nodeOfBeat.get(beat) ?? ''] : []);
    for (let i = 1; i < mapped.length; i++) {
      const from = mapped[i - 1];
      const to = mapped[i];
      if (!from || !to || from === to || knownPairs.has(JSON.stringify([from, to]))) continue;
      knownPairs.add(JSON.stringify([from, to]));
      pairs.push([from, to]);
    }
  }
  const endings = Object.values(scenario.beats).filter((beat) => beat.ending && beat.ending.id !== 'quit');
  const arrivals = new Map<string, { key: string; reached: boolean; label: string | null; kind: AtlasEndingKind | null; chapter: string; variants: string[] }>();
  for (const beat of endings) {
    const kind = endingKind(beat.id, beat.ending?.bad === true);
    const group = kind === 'variation' || beat.id === 'e_survivor' ? 'ep01_main' : beat.id;
    const previous = arrivals.get(group);
    const hit = seen.has(beat.id);
    arrivals.set(group, {
      key: previous?.key ?? `e${arrivals.size}`, reached: hit || previous?.reached === true,
      label: hit ? (beat.ending?.title ?? beat.title) : previous?.label ?? null,
      kind: hit ? kind : previous?.kind ?? null,
      chapter: chapterOf([beat.id]),
      variants: [...(previous?.variants ?? []), ...(hit && kind === 'variation' ? [beat.ending?.title ?? beat.title] : [])],
    });
  }
  // 장 통과는 실제로 다른 장에 들어간 이력으로 수집한다. 중간 합류를 결말로 세지 않는다.
  for (const chapter of declaredChapters) {
    const exits = pairs.filter(([from, to]) => chapter.nodes.includes(from) && declaredChapters.some((other) => other.id !== chapter.id && other.nodes.includes(to)));
    if (exits.length === 0) continue;
    const reached = exits.some(([from, to]) => travelled.has(JSON.stringify([from, to])));
    arrivals.set(`chapter:${chapter.id}`, {
      key: `e${arrivals.size}`, reached, label: reached ? `${chapter.label} 통과` : null,
      kind: reached ? 'chapter' : null, chapter: chapter.id,
      variants: reached ? atlas.nodes.filter((node) => chapter.nodes.includes(node.id) && node.beats.some((beat) => seen.has(beat) && (beat === 'e_curious' || beat === 'e_survivor')))
        .flatMap((node) => node.beats.filter((beat) => seen.has(beat)).map((beat) => scenario.beats[beat]?.title ?? '')).filter(Boolean) : [],
    });
  }
  const implementedChapters = new Set(nodes.map((node) => node.chapter));
  return {
    chapters: declaredChapters.filter((chapter) => implementedChapters.has(chapter.id)).map((chapter) => ({ key: chapter.id, label: chapter.label })),
    currentScene: nodes.find((node) => node.current)?.label ?? (currentRun.length ? scenario.beats[currentRun.at(-1) ?? '']?.title ?? null : null),
    checkpoint: state ? atlasCheckpoint(record, state) : null,
    arrivals: [...arrivals.values()],
    cols: Math.max(1, ...nodes.map((n) => n.col + 1)),
    rows: Math.max(1, ...nodes.map((n) => n.row + 1)),
    nodes,
    edges: pairs.map(([from, to]) => ({
      from: keyOf.get(from) ?? '',
      to: keyOf.get(to) ?? '',
      seen: travelled.has(JSON.stringify([from, to])),
      onPath: active.has(JSON.stringify([from, to])),
    })).filter((edge) => keys.has(edge.from) && keys.has(edge.to)),
    fates: (scenario.fates ?? []).map((f, i) => {
      const reached = seen.has(f.to);
      const beat = scenario.beats[f.to];
      return { key: `f${i}`, reached, label: reached ? (beat?.ending?.title ?? beat?.title ?? null) : null };
    }),
  };
}

/** 안 가 본 칸의 다음 힌트. 이미 가 본 칸이거나 없는 칸이면 null. */
export function nextHint(scenario: Scenario, record: AtlasRecord, key: string): { record: AtlasRecord; level: number; text: string } | null {
  const nodes = scenario.atlas?.nodes ?? [];
  // buildAtlas 가 준 칸 이름(n0, n1 …)만 받는다. Number('') 가 0 이라 빈 값·다른 글자가 첫 칸으로 읽히던 것을 막는다.
  const node = /^n(0|[1-9]\d*)$/.test(key) ? nodes[Number(key.slice(1))] : undefined;
  if (!node?.hints?.length || node.beats.some((b) => (record.display?.beats ?? record.beats).includes(b))) return null;
  const level = Math.min((record.hints?.[node.id] ?? 0) + 1, node.hints.length);
  return { record: { ...record, hints: { ...record.hints, [node.id]: level } }, level, text: node.hints[level - 1] ?? '' };
}
