import type { GameState, Scenario } from './types.ts';

/** 저장 칸과 따로, 판을 넘어 남는 도달 기록. */
export interface AtlasRecord {
  beats: string[];
  last: string[];
  /** 칸마다 본 힌트 단계. */
  hints?: Record<string, number>;
}

export const emptyAtlas = (): AtlasRecord => ({ beats: [], last: [] });

export function recordAtlas(record: AtlasRecord, state: GameState): AtlasRecord {
  const run = state.log.flatMap((e) => (e.kind === 'beat' ? [e.beat] : []));
  return { ...record, beats: [...new Set([...record.beats, ...run])], last: run };
}

/**
 * 화면에 줄 지도. 안 가 본 칸은 이름도 장면 id 도 넣지 않는다.
 * key 는 그 칸의 차례일 뿐이라 내용을 알려 주지 않는다.
 */
export function buildAtlas(scenario: Scenario, record: AtlasRecord) {
  const atlas = scenario.atlas ?? { nodes: [], edges: [] };
  const seen = new Set(record.beats);
  const last = new Set(record.last);
  const keyOf = new Map(atlas.nodes.map((n, i) => [n.id, `n${i}`]));
  const reached = new Map(atlas.nodes.map((n) => [n.id, n.beats.some((b) => seen.has(b))]));
  const onPath = new Map(atlas.nodes.map((n) => [n.id, n.beats.some((b) => last.has(b))]));
  return {
    cols: Math.max(1, ...atlas.nodes.map((n) => n.col + 1)),
    rows: Math.max(1, ...atlas.nodes.map((n) => n.row + 1)),
    nodes: atlas.nodes.map((n) => {
      const beat = n.beats.map((b) => scenario.beats[b]).find((b) => b !== undefined);
      const title = beat ? (n.ending ? (beat.ending?.title ?? beat.title) : beat.title) : null;
      return { key: keyOf.get(n.id) ?? '', col: n.col, row: n.row, ending: n.ending === true, label: reached.get(n.id) ? title : null, onPath: onPath.get(n.id) === true, hint: reached.get(n.id) ? 0 : (record.hints?.[n.id] ?? 0) };
    }),
    edges: atlas.edges.map(([from, to]) => ({
      from: keyOf.get(from) ?? '',
      to: keyOf.get(to) ?? '',
      seen: reached.get(from) === true && reached.get(to) === true,
      onPath: onPath.get(from) === true && onPath.get(to) === true,
    })),
  };
}

/** 안 가 본 칸의 다음 힌트. 이미 가 본 칸이거나 없는 칸이면 null. */
export function nextHint(scenario: Scenario, record: AtlasRecord, key: string): { record: AtlasRecord; level: number; text: string } | null {
  const nodes = scenario.atlas?.nodes ?? [];
  const node = nodes[Number(key.slice(1))];
  if (!node?.hints?.length || node.beats.some((b) => record.beats.includes(b))) return null;
  const level = Math.min((record.hints?.[node.id] ?? 0) + 1, node.hints.length);
  return { record: { ...record, hints: { ...record.hints, [node.id]: level } }, level, text: node.hints[level - 1] ?? '' };
}
