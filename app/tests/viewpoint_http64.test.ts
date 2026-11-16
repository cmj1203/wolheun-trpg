import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../src/server/main.ts';
import type { GameEvent } from '../src/engine/types.ts';
import { LORE_PATH, SCENARIO_PATH } from './helpers.ts';

let dir: string, base: string;
let running: Awaited<ReturnType<typeof startServer>>;
const post = (path: string, value: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wolheun-viewpoint-'));
  running = await startServer({
    port: 0, llmUrl: null, modelKey: null, scenarioPath: SCENARIO_PATH, lorePath: LORE_PATH,
    savesDir: join(dir, 'saves'), atlasFile: join(dir, 'atlas.json'), logsDir: join(dir, 'logs'), feedbackFile: join(dir, 'feedback.jsonl'), llmTimeoutMs: 1000,
  });
  base = `http://127.0.0.1:${running.server.port}`;
});

test('load가 파일을 읽은 직후 같은 슬롯이 교체돼도 상태·화면·투영은 같은 세대다', async () => {
  const game = await fresh();
  const first = frame(game.step.events[0]);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: first })).status).toBe(200);
  expect((await post('/api/save', { session: game.session, slot: 'atomic', view: { frame: first, generation: 'A' } })).status).toBe(200);
  const path = join(dir, 'saves/atomic.json');
  const a = await Bun.file(path).json();
  a.state.flags.generation = 'A';
  a.viewpoint.current.state.flags.generation = 'A';
  await Bun.write(path, JSON.stringify(a));
  const b = structuredClone(a);
  b.state.flags.generation = 'B';
  b.view.generation = 'B';
  b.viewpoint.current.state.flags.generation = 'B';
  const replacement = join(dir, 'replacement.json');
  await Bun.write(replacement, JSON.stringify(b));
  const file = Bun.file;
  let reads = 0;
  const intercept = spyOn(Bun, 'file').mockImplementation((name, options) => {
    const real = typeof name === 'number' ? file(name, options)
      : typeof name === 'string' || name instanceof URL ? file(name, options) : file(name, options);
    if (name !== path) return real;
    return new Proxy(real, {
      get(target, key) {
        if (key === 'json') return async () => {
          const parsed = await target.json();
          if (++reads === 1) await rename(replacement, path);
          return parsed;
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
  let loaded: { session: string; view: { frame: string; generation: string } };
  try {
    const response = await post('/api/load', { slot: 'atomic' });
    expect(response.status).toBe(200);
    loaded = await response.json();
    expect(reads).toBe(1);
  } finally { intercept.mockRestore(); }
  expect((await Bun.file(path).json()).view.generation).toBe('B');
  expect(running.sessions.get(loaded.session)?.state.flags.generation).toBe('A');
  expect(loaded.view.generation).toBe('A');
  expect((await post('/api/save', { session: loaded.session, slot: 'atomic-restored', view: loaded.view })).status).toBe(200);
  const restored = await Bun.file(join(dir, 'saves/atomic-restored.json')).json();
  expect(restored.viewpoint.current.state.flags.generation).toBe('A');
});
afterAll(async () => { running.server.stop(true); await rm(dir, { recursive: true, force: true }); });

async function fresh() {
  const response = await post('/api/new', { seed: 2 });
  expect(response.status).toBe(200);
  return await response.json() as { session: string; step: { events: GameEvent[] } };
}
function frame(event: GameEvent | undefined): string {
  if (!event || !('frame' in event) || !event.frame) throw new Error('표시 frame 없음');
  return event.frame;
}

test('HTTP 확인은 busy 중 허용하되 미래 점프·다른 세션·미확인 질문을 거부한다', async () => {
  const game = await fresh(), other = await fresh();
  const frames = game.step.events.filter((event) => 'frame' in event);
  const first = frame(frames[0]), next = frame(frames[1]);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: next })).status).toBe(400);
  expect((await post('/api/viewpoint/confirm', { session: other.session, frame: first })).status).toBe(400);
  expect((await post('/api/act', { session: game.session, action: { type: 'ask', text: '여기는 어디야?', frame: first } })).status).toBe(400);
  const session = running.sessions.get(game.session);
  if (!session) throw new Error('세션 없음');
  session.busy = true;
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: first })).status).toBe(200);
  session.busy = false;
  const before = structuredClone(session.state);
  const answer = await post('/api/act', { session: game.session, action: { type: 'ask', text: '어떻게 플레이해?', frame: first, flags: { future: true } } });
  expect(answer.status).toBe(200);
  const stream = await answer.text();
  expect(stream).not.toContain('"error"');
  expect(session.state.rng).toBe(before.rng);
  expect(session.state.flags).toEqual(before.flags);
  expect(session.state.items).toEqual(before.items);
  expect(session.state.recent).toEqual(before.recent);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: next })).status).toBe(200);
});

test.each([
  { type: 'free', text: '플레이 방법이 뭐야?' },
  { type: 'free', text: '춤을 춘다' },
  { type: 'free', text: '(손을 든다' },
  { type: 'interject', text: '근데 왜 상인이야?', shown: [{ speaker: 'GM', text: '조작 안내' }], pending: [] },
])('세계 관측 없는 $type 입력 $text 뒤에도 현재·남은 frame과 지도 토큰을 보존한다', async (action) => {
  const game = await fresh();
  const frames = game.step.events.filter((event) => 'frame' in event);
  const first = frame(frames[0]), next = frame(frames[1]);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: first })).status).toBe(200);
  const atlasBefore = await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json();
  const before = structuredClone(running.sessions.get(game.session)?.state);
  const response = await post('/api/act', { session: game.session, action });
  expect(response.status).toBe(200);
  const messages = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
  expect(messages.some((message) => message.error)).toBe(false);
  expect(messages.some((message) => message.event?.frame)).toBe(false);
  expect(messages.some((message) => message.event?.type === 'notice')).toBe(true);
  const after = running.sessions.get(game.session)?.state;
  expect(after?.rng).toBe(before?.rng);
  expect(after?.tracks).toEqual(before?.tracks);
  expect(after?.items).toEqual(before?.items);
  expect(after?.flags).toEqual(before?.flags);
  expect(after?.recent).toEqual(before?.recent);
  expect(await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json()).toEqual(atlasBefore);
  const question = await post('/api/act', { session: game.session, action: { type: 'ask', text: '어떻게 플레이해?', frame: first } });
  expect(question.status).toBe(200);
  expect(await question.text()).not.toContain('"error"');
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: next })).status).toBe(200);
});

test.each(['오류', '확인 대기·취소'] as const)('관측 없는 %s 경로는 상태와 표시 투영을 혼동하지 않는다', async (kind) => {
  const game = await fresh();
  const frames = game.step.events.filter((event) => 'frame' in event);
  const first = frame(frames[0]), next = frame(frames[1]);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: first })).status).toBe(200);
  const session = running.sessions.get(game.session);
  if (!session) throw new Error('세션 없음');
  const before = structuredClone(session.state);
  const atlas = await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json();
  if (kind === '오류') {
    const response = await post('/api/act', { session: game.session, action: { type: 'confirm', ok: false } });
    const messages = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(messages.some((message) => typeof message.error === 'string')).toBe(true);
    expect(messages.some((message) => message.event?.frame)).toBe(false);
    expect(session.state).toEqual(before);
  } else {
    const response = await post('/api/act', { session: game.session, action: { type: 'free', text: '그만할래' } });
    const messages = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(messages.some((message) => message.error)).toBe(false);
    expect(messages.some((message) => message.event?.type === 'confirm')).toBe(true);
    expect(messages.some((message) => message.event?.frame)).toBe(false);
    expect(session.state.pendingRisk?.quit).toBe(true);
    const cancel = await post('/api/act', { session: game.session, action: { type: 'confirm', ok: false } });
    expect(await cancel.text()).not.toContain('"error"');
    expect(session.state.pendingRisk).toBeUndefined();
    expect(session.state.rng).toBe(before.rng);
    expect(session.state.flags).toEqual(before.flags);
  }
  expect(session.busy).toBe(false);
  expect(await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json()).toEqual(atlas);
  const question = await post('/api/act', { session: game.session, action: { type: 'ask', text: '어떻게 플레이해?', frame: first } });
  expect(question.status).toBe(200);
  expect(await question.text()).not.toContain('"error"');
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: next })).status).toBe(200);
});

test('실제 새 세계 관측을 송신하면 이전 frame을 거절하고 새 송신 순서만 확인한다', async () => {
  const game = await fresh();
  const first = frame(game.step.events[0]);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: first })).status).toBe(200);
  const response = await post('/api/act', { session: game.session, action: { type: 'approach', id: 'run' } });
  const messages = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
  expect(messages.some((message) => message.error)).toBe(false);
  const frames = messages.flatMap((message) => message.event?.frame ? [message.event] : []);
  expect(frames.length).toBeGreaterThan(1);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: first })).status).toBe(400);
  expect((await post('/api/act', { session: game.session, action: { type: 'ask', text: '어떻게 플레이해?', frame: first } })).status).toBe(400);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: frame(frames[1]) })).status).toBe(400);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: frame(frames[0]) })).status).toBe(200);
  const question = await post('/api/act', { session: game.session, action: { type: 'ask', text: '어떻게 플레이해?', frame: frame(frames[0]) } });
  expect(question.status).toBe(200);
  expect(await question.text()).not.toContain('"error"');
});

test('저장은 비공개 투영을 서버 파일에만 두며 load는 현재와 남은 토큰을 모두 회전한다', async () => {
  const game = await fresh();
  const frames = game.step.events.filter((event) => 'frame' in event);
  const first = frame(frames[0]), next = frame(frames[1]);
  expect((await post('/api/viewpoint/confirm', { session: game.session, frame: first })).status).toBe(200);
  const view = { frame: first, scene: frames[0], remaining: game.step.events.slice(1), viewpoint: { state: { flags: { forged: true } } } };
  const atlas = await (await fetch(`${base}/api/atlas/view?session=${game.session}`)).json();
  expect((await post('/api/atlas/view', { session: game.session, ...atlas.token, view })).status).toBe(200);
  expect((await post('/api/save', { session: game.session, slot: 'mid', view })).status).toBe(200);
  const file = await Bun.file(join(dir, 'saves/mid.json')).json();
  expect(file.viewpoint.current.token).toBe(first);
  expect(file.viewpoint.current.state.flags.forged).toBeUndefined();
  expect(file.viewpoint.pending.length).toBe(frames.length - 1);
  const response = await post('/api/load', { slot: 'mid' });
  expect(response.status).toBe(200);
  const loaded = await response.json();
  expect(loaded.view.frame).not.toBe(first);
  expect(loaded.view.remaining.find((event: GameEvent) => 'frame' in event).frame).not.toBe(next);
  expect(JSON.stringify(loaded)).not.toContain('"readLog"');
  expect(Object.keys(loaded).sort()).toEqual(['session', 'step', 'view']);
  expect(loaded.view).not.toHaveProperty('state');
  expect(loaded.step).not.toHaveProperty('state');
  expect(loaded.step.events.every((event: GameEvent) => !('state' in event) && !('readLog' in event))).toBe(true);
  expect((await post('/api/viewpoint/confirm', { session: loaded.session, frame: first })).status).toBe(400);
  const answer = await post('/api/act', { session: loaded.session, action: { type: 'ask', text: '어떻게 플레이해?', frame: loaded.view.frame } });
  expect((await answer.text())).not.toContain('"error"');
  const newNext = loaded.view.remaining.find((event: GameEvent) => 'frame' in event).frame;
  expect((await post('/api/viewpoint/confirm', { session: loaded.session, frame: newNext })).status).toBe(200);
});
