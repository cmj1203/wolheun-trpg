import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer } from '../src/server/main.ts';
import { LORE_PATH, SCENARIO_PATH } from './helpers.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('HTTP 갈림길 복원은 다른 세션과 늦은 화면을 거부하고 저장 재개 후에도 당시 상태를 유지한다', async () => {
  const root = join(import.meta.dir, '../../work/continuation/map/run');
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'http-'));
  const { server } = await startServer({
    port: 0, llmUrl: null, modelKey: null, scenarioPath: SCENARIO_PATH, lorePath: LORE_PATH,
    savesDir: join(dir, 'saves'), atlasFile: join(dir, 'atlas.json'), logsDir: join(dir, 'logs'),
    feedbackFile: join(dir, 'feedback.jsonl'), llmTimeoutMs: 1000,
  });
  const base = `http://127.0.0.1:${server.port}`;
  const request = async (path: string, body?: object) => {
    const response = await fetch(base + path, body ? {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body),
    } : undefined);
    const data: unknown = await response.json();
    if (!isRecord(data)) throw new Error('API 응답 형식이 올바르지 않습니다');
    return { status: response.status, data };
  };
  const displayScenes = async (session: string, events: unknown[]) => {
    for (const event of events) {
      if (isRecord(event) && typeof event.frame === 'string') {
        expect((await request('/api/viewpoint/confirm', { session, frame: event.frame })).status).toBe(200);
      }
    }
    for (const scene of events.filter((event: unknown) => isRecord(event) && event.type === 'scene')) {
      const display = await request(`/api/atlas/view?session=${session}`);
      if (!isRecord(display.data.token)) throw new Error('장면 확인 토큰이 없습니다');
      expect((await request('/api/atlas/view', { session, ...display.data.token, view: { scene } })).status).toBe(200);
    }
  };
  try {
    const created = await request('/api/new', { seed: 3 });
    expect(created.status).toBe(200);
    const session = created.data.session;
    const step = created.data.step;
    if (typeof session !== 'string' || !isRecord(step) || !Array.isArray(step.events) || !isRecord(step.hud)) throw new Error('시작 응답이 올바르지 않습니다');
    await displayScenes(session, step.events);
    const atlas = await request(`/api/atlas?session=${session}`);
    const point = atlas.data.checkpoint;
    if (!isRecord(point) || typeof point.key !== 'string') throw new Error('시작 갈림길이 없습니다');
    const scenes = step.events.filter((event: unknown): event is Record<string, unknown> => isRecord(event) && event.type === 'scene');
    const line = step.events.findLast((event: unknown): event is Record<string, unknown> => isRecord(event) && event.type === 'line' && typeof event.frame === 'string');
    if (!line) throw new Error('실제로 표시한 마지막 대사가 없습니다');
    const view = { scene: scenes.at(-1), line, remaining: [], backlog: [] };
    const expectedView = { ...view, atlas: { path: scenes.map((scene) => scene.beat) } };
    const expectRestoredView = (actual: unknown, previousFrame: unknown) => {
      if (!isRecord(actual) || !isRecord(actual.line) || typeof actual.line.frame !== 'string') throw new Error('복원한 화면 토큰이 없습니다');
      expect(actual.line.frame).not.toBe(previousFrame);
      expect(actual).toEqual({ ...expectedView, line: { ...line, frame: actual.line.frame } });
      return actual.line.frame;
    };
    expect((await request('/api/atlas/checkpoint', { session, ...point, view })).status).toBe(200);
    const other = await request('/api/new', { seed: 5 });
    if (typeof other.data.session !== 'string' || !isRecord(other.data.step) || !Array.isArray(other.data.step.events)) throw new Error('다른 판 시작 응답이 올바르지 않습니다');
    await displayScenes(other.data.session, other.data.step.events);
    expect((await request('/api/atlas/checkpoint', { session: other.data.session, ...point, view })).status).toBe(400);
    expect((await request('/api/atlas/restart', { key: '없는_갈림길' })).status).toBe(400);
    const acted = await fetch(base + '/api/act', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ session, action: { type: 'ask', text: '체력은 뭐야?', frame: line.frame } }),
    });
    const stream = await acted.text();
    expect(acted.status).toBe(200);
    expect(stream).toContain('"done"');
    const late = await request('/api/atlas/checkpoint', { session, ...point, view });
    expect(late.status).toBe(400);
    expect(late.data.error).toBe('갈림길 이후 상태가 바뀌었습니다. 분기 맵을 다시 열어 주세요.');
    const restored = await request('/api/atlas/restart', { key: point.key });
    expect(restored.status).toBe(200);
    const restoredFrame = expectRestoredView(restored.data.view, line.frame);
    if (!isRecord(restored.data.step) || !Array.isArray(restored.data.step.events) || typeof restored.data.session !== 'string') throw new Error('복원 응답이 올바르지 않습니다');
    await displayScenes(restored.data.session, restored.data.step.events);
    expect(restored.data.step.hud).toEqual(step.hud);
    expect(restored.data.step.prompt).toEqual(step.prompt);
    const saved = await request('/api/save', { session: restored.data.session, slot: '1', view: restored.data.view });
    expect(saved.status).toBe(200);
    if (!isRecord(saved.data.meta)) throw new Error('저장 응답이 올바르지 않습니다');
    const loaded = await request('/api/load', { slot: '1' });
    expect(loaded.status).toBe(200);
    expectRestoredView(loaded.data.view, restoredFrame);
    if (!isRecord(loaded.data.step)) throw new Error('불러오기 응답이 올바르지 않습니다');
    // 저장은 noteSlot에서 실제 경과 시간을 갱신한다. 불러오기는 저장된 시각을 유지한다.
    expect(loaded.data.step.hud).toEqual({ ...step.hud, playMs: saved.data.meta.playMs });
    expect(loaded.data.step.prompt).toEqual(step.prompt);
  } finally {
    server.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
}, 20_000);
