import { appendAtlasPath, type AtlasRecord } from './atlas.ts';
import { GameError, type GameEvent, type GameState } from './types.ts';

export interface AtlasDisplayRecord {
  readonly beats: readonly string[];
  readonly paths: readonly (readonly string[])[];
  readonly runs: Readonly<Record<string, readonly string[]>>;
}

/** 서버가 실제로 송신한 장면을 순서대로 확인하는 커서. 게임 상태와 별개다. */
export interface AtlasPlayback {
  readonly session: string;
  version: number;
  visit: number;
  key: string;
  queue: string[];
  path: string[];
}

export interface AtlasSceneToken {
  readonly key: string;
  readonly version: number;
  readonly visit: number;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sceneOf(view: unknown): string | null {
  return object(view) && object(view.scene) && typeof view.scene.beat === 'string' ? view.scene.beat : null;
}

function remainingScenes(view: unknown): string[] {
  if (!object(view) || !Array.isArray(view.remaining)) throw new GameError('저장할 장면 순서가 올바르지 않습니다.');
  return view.remaining.flatMap((event: unknown) => object(event) && event.type === 'scene' && typeof event.beat === 'string' ? [event.beat] : []);
}

/** 예전 수집은 보존하고, 이후 엔진 선처리 로그는 발견 기록으로 사용하지 않는다. */
export function prepareAtlasDisplay(record: AtlasRecord): AtlasRecord {
  return record.display ? record : {
    ...record,
    display: { beats: [...record.beats], paths: (record.paths ?? [record.last]).map((path) => [...path]), runs: {} },
  };
}

export function createAtlasPlayback(session: string, events: readonly GameEvent[], base: readonly string[] = []): AtlasPlayback {
  const playback: AtlasPlayback = { session, version: 0, visit: 0, key: crypto.randomUUID(), queue: [], path: [...base] };
  for (const event of events) enqueueAtlasScene(playback, event);
  return playback;
}

/** 새 입력이 시작하면 이전 입력의 확인 토큰은 즉시 무효가 된다. */
export function beginAtlasPlayback(playback: AtlasPlayback): void {
  playback.version += 1;
  playback.key = crypto.randomUUID();
}

/** 반드시 서버의 실제 이벤트 송신 직전에 호출한다. */
export function enqueueAtlasScene(playback: AtlasPlayback, event: GameEvent): void {
  if (event.type === 'revise' && event.jump) playback.queue = [];
  if (event.type === 'scene') playback.queue.push(event.beat);
}

export function atlasSceneToken(playback: AtlasPlayback): AtlasSceneToken | null {
  return playback.queue.length ? { key: playback.key, version: playback.version, visit: playback.visit } : null;
}

/** 커서는 확인 후 제자리에서 갱신한다. 스트림의 뒤 장면 추가와 같은 객체를 공유한다. */
export function confirmAtlasScene(record: AtlasRecord, playback: AtlasPlayback, session: string, token: AtlasSceneToken, view: unknown): AtlasRecord {
  const beat = sceneOf(view);
  if (session !== playback.session || token.key !== playback.key || token.version !== playback.version ||
    token.visit !== playback.visit || !beat || playback.queue[0] !== beat) {
    throw new GameError('표시할 장면 순서가 바뀌었습니다. 분기 맵을 다시 열어 주세요.');
  }
  playback.queue.shift();
  playback.path.push(beat);
  playback.visit += 1;
  playback.key = crypto.randomUUID();
  const display = prepareAtlasDisplay(record).display;
  if (!display) throw new GameError('지도 표시 기록이 없습니다.');
  return {
    ...record,
    display: {
      beats: [...new Set([...display.beats, ...playback.path])],
      paths: appendAtlasPath(display.paths, playback.path),
      runs: { ...display.runs, [session]: [...playback.path] },
    },
  };
}

/** 서버의 확인된 현재 장면·미표시 큐와 같은 화면만 저장한다. 경로 표식은 서버가 덮어쓴다. */
export function packAtlasView(playback: AtlasPlayback, view: unknown): Record<string, unknown> {
  const remaining = remainingScenes(view);
  if (!object(view) || sceneOf(view) !== playback.path.at(-1) ||
    remaining.length !== playback.queue.length || remaining.some((beat, i) => beat !== playback.queue[i])) {
    throw new GameError('화면과 장면 순서가 다릅니다. 저장할 장면을 다시 확인해 주세요.');
  }
  return { ...view, atlas: { path: [...playback.path] } };
}

/** 저장 화면을 다시 그릴 현재 장면부터 확인한다. 진입 효과나 RNG는 실행하지 않는다. */
export function restoreAtlasPlayback(state: GameState, events: readonly GameEvent[], view: unknown): AtlasPlayback {
  const scene = sceneOf(view);
  const path = state.log.flatMap((entry) => entry.kind === 'beat' ? [entry.beat] : []);
  if (!scene) {
    const scenes = events.flatMap((event) => event.type === 'scene' ? [event.beat] : []);
    const start = path.length - scenes.length;
    if (start < 0 || scenes.some((beat, i) => path[start + i] !== beat)) throw new GameError('재개할 장면 순서가 올바르지 않습니다.');
    return createAtlasPlayback(state.session, events, path.slice(0, start));
  }
  const remaining = remainingScenes(view);
  const stored = object(view) && object(view.atlas) ? view.atlas.path : undefined;
  const acknowledged = Array.isArray(stored) && stored.every((beat: unknown) => typeof beat === 'string') ? stored : undefined;
  // 구형 저장에는 확인 경로가 없으므로, 저장된 화면과 남은 장면이 실제 로그의 연속 접미사인지 대조한다.
  const through = path.length - remaining.length;
  const legacy = path.slice(0, through);
  const shown = acknowledged ?? legacy;
  if (shown.at(-1) !== scene || through < 1 || path[through - 1] !== scene ||
    remaining.some((beat, i) => path[through + i] !== beat)) {
    throw new GameError('저장된 화면의 장면 순서가 올바르지 않습니다.');
  }
  return { session: state.session, version: 0, visit: 0, key: crypto.randomUUID(), queue: [scene, ...remaining], path: shown.slice(0, -1) };
}
