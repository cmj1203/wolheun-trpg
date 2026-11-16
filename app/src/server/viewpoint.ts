import { GameError, type ConfirmedViewpoint, type GameEvent, type GameState, type ViewpointObservation, type ViewpointObserver } from '../engine/types.ts';

interface Frame {
  token: string;
  event: ViewpointObservation['event'];
  state: ViewpointObservation['state'];
  readLog: ViewpointObservation['readLog'];
}

export interface SavedViewpoint {
  current?: { token: string; event: Frame['event']; state: GameState };
  pending: { token: string; event: Frame['event']; state: GameState }[];
}

/** 서버만 소유한다. DTO에는 이 저장 내용이 아닌 불투명 token만 보낸다. */
export class ViewpointPlayback {
  private current?: Frame;
  private pending: Frame[] = [];
  private replaceOnObservation = false;

  begin(): void {
    this.replaceOnObservation = true;
  }

  private clear(): void {
    this.current = undefined;
    this.pending = [];
    this.replaceOnObservation = false;
  }

  readonly observe: ViewpointObserver = (observation) => {
    if (observation.source !== 'fresh') return;
    if (this.replaceOnObservation) this.clear();
    const token = crypto.randomUUID();
    observation.event.frame = token;
    this.pending.push({ token, event: observation.event, state: observation.state, readLog: observation.readLog });
  };

  confirm(token: unknown): void {
    if (typeof token !== 'string') throw new GameError('표시 확인 정보가 없습니다.');
    if (this.current?.token === token) return;
    const next = this.pending[0];
    if (!next || next.token !== token) throw new GameError('표시 순서가 달라졌습니다. 현재 대사를 다시 확인해 주세요.');
    this.current = this.pending.shift();
  }

  question(token: unknown): ConfirmedViewpoint {
    const frame = this.current;
    if (!frame || frame.token !== token) throw new GameError('현재 대사를 표시한 뒤 다시 물어 주세요.');
    return {
      scene: frame.event.type === 'scene' ? frame.event.beat : frame.state.beat,
      state: { ...structuredClone(frame.state), log: frame.readLog() as GameState['log'] },
      ...(frame.event.type === 'line' ? { line: structuredClone(frame.event) } : {}),
    };
  }

  save(): SavedViewpoint {
    const pack = (frame: Frame) => ({ token: frame.token, event: structuredClone(frame.event), state: { ...structuredClone(frame.state), log: frame.readLog() as GameState['log'] } });
    return { ...(this.current ? { current: pack(this.current) } : {}), pending: this.pending.map(pack) };
  }

  restore(saved: SavedViewpoint, session: string): Map<string, string> {
    this.clear();
    const tokens = new Map<string, string>();
    const unpack = (frame: NonNullable<SavedViewpoint['current']>): Frame => {
      const token = crypto.randomUUID();
      tokens.set(frame.token, token);
      const { log, ...state } = structuredClone(frame.state);
      state.session = session;
      return { token, event: { ...structuredClone(frame.event), frame: token }, state, readLog: () => structuredClone(log) };
    };
    if (saved.current) this.current = unpack(saved.current);
    this.pending = saved.pending.map(unpack);
    return tokens;
  }

  /** 구형 저장의 과거 줄을 복원했다고 주장하지 않는다. 마지막 재생 경계만 권위 상태와 일치한다. */
  legacy(state: GameState, events: GameEvent[]): void {
    this.clear();
    const last = events.findLast((event) => event.type === 'line' && event.style !== 'gm') ?? events.findLast((event) => event.type === 'scene');
    if (!last || (last.type !== 'line' && last.type !== 'scene')) return;
    const { log, ...snapshot } = structuredClone(state);
    this.observe({ source: 'fresh', event: last, state: snapshot, logLength: log.length, readLog: () => structuredClone(log) });
  }
}

export function rotateViewFrames(value: unknown, tokens: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return tokens.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rotateViewFrames(item, tokens));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rotateViewFrames(item, tokens)]));
  return value;
}

export function forgetViewFrames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(forgetViewFrames);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'frame').map(([key, item]) => [key, forgetViewFrames(item)]));
  return value;
}
