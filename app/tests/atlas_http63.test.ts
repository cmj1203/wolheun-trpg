import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server/main.ts';
import type { AtlasRecord } from '../src/engine/atlas.ts';
import type { GameEvent } from '../src/engine/types.ts';
import { LORE_PATH, SCENARIO_PATH } from './helpers.ts';

type Token = { key: string; version: number; visit: number };

function reboundEvent<E extends GameEvent>(before: E, after: GameEvent | undefined): E {
  if (!after) throw new Error('복원한 재생 이벤트가 없다');
  if ('frame' in before && typeof before.frame === 'string') {
    if (!('frame' in after) || typeof after.frame !== 'string') throw new Error('복원한 화면 토큰이 없다');
    expect(after.frame).not.toBe(before.frame);
    return { ...before, frame: after.frame };
  }
  return before;
}

describe('지도 HTTP: 서버 체크포인트만 복원한다', () => {
  let dir: string;
  let base: string;
  let running: Awaited<ReturnType<typeof startServer>>;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const newGame = async () => {
    const response = await post('/api/new', { seed: 1 });
    expect(response.status).toBe(200);
    const game: { session: string; step: { events: GameEvent[] } } = await response.json();
    const scenes = game.step.events.filter((event) => event.type === 'scene');
    for (const scene of scenes) {
      const tokens = await fetch(`${base}/api/atlas/view?session=${game.session}`);
      const { token }: { token: Token } = await tokens.json();
      expect((await post('/api/atlas/view', { session: game.session, ...token, view: { scene } })).status).toBe(200);
    }
    const scene = scenes.at(-1);
    if (!scene) throw new Error('새 판의 표시 장면이 없다');
    return { ...game, view: { phase: 'free', scene, remaining: [], atlas: { path: scenes.map((entry) => entry.beat) } } };
  };
  const tokenOf = async (session: string) => {
    const response = await fetch(`${base}/api/atlas?session=${session}`);
    expect(response.status).toBe(200);
    const atlas = await response.json() as { checkpoint: Token | null };
    if (!atlas.checkpoint) throw new Error('새 판의 첫 갈림길 체크포인트가 없다');
    return atlas.checkpoint;
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wolheun-atlas-http-'));
    running = await startServer({
      port: 0, llmUrl: null, modelKey: null, scenarioPath: SCENARIO_PATH, lorePath: LORE_PATH,
      savesDir: join(dir, 'saves'), atlasFile: join(dir, 'atlas.json'), logsDir: join(dir, 'logs'),
      feedbackFile: join(dir, 'feedback.jsonl'), llmTimeoutMs: 1000,
    });
    base = `http://127.0.0.1:${running.server.port}`;
  });
  afterAll(async () => {
    running.server.stop(true);
    await rm(dir, { recursive: true, force: true });
  });

  test('엔진이 먼저 진입해도 송신 큐 첫 장면만 확인하며 busy 중에도 표시 확인은 허용한다', async () => {
    const response = await post('/api/new', { seed: 1 });
    const game: { session: string; step: { events: GameEvent[] } } = await response.json();
    const scenes = game.step.events.filter((event) => event.type === 'scene');
    const first = scenes[0];
    const future = scenes[1];
    if (!first || !future) throw new Error('여러 장면의 실제 시작 큐가 필요하다');
    const before = await (await fetch(`${base}/api/atlas?session=${game.session}`)).json();
    expect(before.currentScene).toBeNull();
    expect(before.checkpoint).toBeNull();
    const { token }: { token: Token } = await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json();
    expect((await post('/api/atlas/view', { session: game.session, ...token, view: { scene: future } })).status).toBe(400);
    for (const altered of [{ ...token, key: 'forged' }, { ...token, version: token.version + 1 }, { ...token, visit: token.visit + 1 }]) {
      expect((await post('/api/atlas/view', { session: game.session, ...altered, view: { scene: first } })).status).toBe(400);
    }
    const session = running.sessions.get(game.session);
    if (!session) throw new Error('판이 없다');
    const original = structuredClone(session.state);
    session.busy = true;
    try {
      expect((await post('/api/atlas/view', { session: game.session, ...token, view: { scene: first } })).status).toBe(200);
    } finally {
      session.busy = false;
    }
    expect((await post('/api/atlas/view', { session: game.session, ...token, view: { scene: first } })).status).toBe(400);
    const current = await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json();
    expect(current.current).toBe(first.beat);
    expect(current.token.visit).toBe(token.visit + 1);
    expect(session.state).toEqual(original);
  });

  test('중간 대사 저장의 경로는 서버가 덮고 load가 같은 현재 장면·남은 큐를 복원한다', async () => {
    const response = await post('/api/new', { seed: 2 });
    const game: { session: string; step: { events: GameEvent[] } } = await response.json();
    const index = game.step.events.findIndex((event) => event.type === 'scene');
    const scene = game.step.events[index];
    if (scene?.type !== 'scene') throw new Error('시작 장면이 없다');
    const { token }: { token: Token } = await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json();
    expect((await post('/api/atlas/view', { session: game.session, ...token, view: { scene } })).status).toBe(200);
    const view = { scene, remaining: game.step.events.slice(index + 1), atlas: { path: ['forged'] } };
    const original = structuredClone(running.sessions.get(game.session)?.state);
    if (!original) throw new Error('저장할 판이 없다');
    expect((await post('/api/save', { session: game.session, slot: 'display-mid', view })).status).toBe(200);
    const loaded = await post('/api/load', { slot: 'display-mid' });
    expect(loaded.status).toBe(200);
    const restored: { session: string; view: typeof view } = await loaded.json();
    expect(restored.view).toEqual({
      ...view, scene: reboundEvent(scene, restored.view.scene),
      remaining: view.remaining.map((event, i) => reboundEvent(event, restored.view.remaining[i])),
      atlas: { path: [scene.beat] },
    });
    const restoredState = running.sessions.get(restored.session)?.state;
    expect(restoredState?.rng).toBe(original.rng);
    expect(restoredState?.tracks).toEqual(original.tracks);
    expect(restoredState?.items).toEqual(original.items);
    expect(restoredState?.flags).toEqual(original.flags);
    const restoredToken = await (await fetch(`${base}/api/atlas/view?session=${restored.session}`)).json();
    expect((await post('/api/atlas/view', { session: restored.session, ...restoredToken.token, view: { scene: restored.view.scene } })).status).toBe(200);
    const next = await (await fetch(`${base}/api/atlas/view?session=${restored.session}`)).json();
    expect(next.current).toBe(scene.beat);
    const nextScene = restored.view.remaining.find((event) => event.type === 'scene');
    if (!nextScene) throw new Error('저장 후 남은 장면이 없다');
    expect((await post('/api/atlas/view', { session: restored.session, ...next.token, view: { scene: nextScene } })).status).toBe(200);
  });

  test('행동 스트림의 실제 장면을 한 번씩 확인하면 큐가 끝나며 완료 뒤 중복 장면이 남지 않는다', async () => {
    const game = await newGame();
    const response = await post('/api/act', { session: game.session, action: { type: 'approach', id: 'avoid' } });
    expect(response.status).toBe(200);
    const messages: { event?: GameEvent; error?: string }[] = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    for (const message of messages) expect(message.error).toBeUndefined();
    const scenes = messages.flatMap((message) => message.event?.type === 'scene' ? [message.event] : []);
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      const { token }: { token: Token | null } = await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json();
      if (!token) throw new Error('송신한 장면의 확인 토큰이 없다');
      expect((await post('/api/atlas/view', { session: game.session, ...token, view: { scene } })).status).toBe(200);
    }
    const end = await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json();
    expect(end.token).toBeNull();
    expect(end.current).toBe(scenes.at(-1)?.beat);
  });

  test('서로 다른 판의 동시 저장도 양쪽 체크포인트를 보존한다', async () => {
    const games = await Promise.all([newGame(), newGame()]);
    const tokens = await Promise.all(games.map((game) => tokenOf(game.session)));
    expect(new Set(tokens.map((token) => token.key)).size).toBe(2);
    const record = await Bun.file(join(dir, 'atlas.json')).json() as AtlasRecord;
    for (const game of games) expect(record.checkpoints?.some((point) => point.state.session === game.session)).toBe(true);
  });

  test('화면만 첨부하고 위조 상태·다른 판·틀린 버전과 방문은 받지 않는다', async () => {
    const game = await newGame();
    const other = await newGame();
    const token = await tokenOf(game.session);
    const body = { session: game.session, ...token, view: { ...game.view, memo: '현재 화면', atlas: { path: ['forged'] } } };
    for (const altered of [
      { ...body, session: other.session },
      { ...body, version: token.version + 1 },
      { ...body, visit: token.visit + 1 },
    ]) expect((await post('/api/atlas/checkpoint', altered)).status).toBe(400);
    const original = structuredClone(running.sessions.get(game.session)?.state);
    expect((await post('/api/atlas/checkpoint', { ...body, state: { tracks: { 체력: 999 }, items: [] } })).status).toBe(200);
    expect(running.sessions.get(game.session)?.state).toEqual(original);
    const record = await Bun.file(join(dir, 'atlas.json')).json() as AtlasRecord;
    const saved = record.checkpoints?.find((point) => point.key === token.key);
    expect(saved?.state).toEqual(original);
    expect(saved?.view).toEqual({ ...body.view, atlas: game.view.atlas });
  });

  test('행동 뒤 늦게 도착한 화면은 거절하고 재시작은 수치·아이템·정보·로그를 당시 그대로 돌린다', async () => {
    const game = await newGame();
    const token = await tokenOf(game.session);
    const original = structuredClone(running.sessions.get(game.session)?.state);
    if (!original) throw new Error('새 판이 없다');
    const view = { ...game.view, memo: '갈림길 메모' };
    expect((await post('/api/atlas/checkpoint', { session: game.session, ...token, view })).status).toBe(200);
    const action = await post('/api/act', { session: game.session, action: { type: 'approach', id: 'avoid' } });
    expect(action.status).toBe(200);
    await action.text();
    expect((await post('/api/atlas/checkpoint', { session: game.session, ...token, view })).status).toBe(400);
    const response = await post('/api/atlas/restart', { key: token.key, state: { beat: 'e_road' } });
    expect(response.status).toBe(200);
    const restored: { session: string; view: typeof view } = await response.json();
    expect(restored.view).toEqual({ ...view, scene: reboundEvent(view.scene, restored.view.scene) });
    const state = running.sessions.get(restored.session)?.state;
    if (!state) throw new Error('재시작한 판이 없다');
    expect(state.tracks).toEqual(original.tracks);
    expect(state.items).toEqual(original.items);
    expect(state.said).toEqual(original.said);
    expect(state.heard).toEqual(original.heard);
    expect(state.flags).toEqual(original.flags);
    expect(state.log).toEqual(original.log);
    expect(state.free).toEqual(original.free);
    expect(state.rng).toBe(original.rng);
    expect(state.playMs).toBe(original.playMs);
  });
});
