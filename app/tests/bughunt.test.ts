import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyAtlas, nextHint } from '../src/engine/atlas.ts';
import { Engine } from '../src/engine/engine.ts';
import { SaveError, readSave, writeSave } from '../src/engine/save.ts';
import { GameError } from '../src/engine/types.ts';
import { startServer } from '../src/server/main.ts';
import { FakeGm, LORE_PATH, SCENARIO_PATH, fakeClock, loadDesert } from './helpers.ts';

const scenario = await loadDesert();

/** 행운을 묻는 창이 뜬 상태. */
const toLuck = async () => {
  const engine = new Engine(scenario, new FakeGm(), fakeClock().now, true);
  for (let seed = 1; seed < 400; seed++) {
    const { state } = engine.newGame(seed, 'l');
    const r = await engine.act(state, { type: 'approach', id: 'run' });
    if (r.step.prompt.type === 'luck') return { engine, ...r };
  }
  throw new Error('실패하는 시드가 없습니다');
};

describe('행운을 묻는 동안', () => {
  test('행동 단추를 눌러도 다시 굴리지 않는다(행운이 엉뚱한 판정을 고치지 않게)', async () => {
    const { engine, state } = await toLuck();
    await expect(engine.act(state, { type: 'approach', id: 'run' })).rejects.toBeInstanceOf(GameError);
  });

  test('그만두기로 끝나면 행운 창이 남지 않고 결과 화면으로 간다', async () => {
    const { engine, state } = await toLuck();
    const asked = await engine.act(state, { type: 'free', text: '그만할래' });
    expect(asked.state.pendingRisk).toBeDefined();
    const quit = await engine.act(asked.state, { type: 'confirm', ok: true });
    expect(quit.state.ending).toBe('quit');
    expect(quit.state.pendingLuck).toBeUndefined();
    expect(quit.step.prompt.type).toBe('end');
  });
});

describe('지도 힌트', () => {
  test('칸 이름(n0, n1 …)이 아닌 key 는 없는 칸이다', () => {
    for (const key of ['', 'x', 'n', 'f0', 'n-0', 'n1e0', 'n 3', 'n01']) expect(nextHint(scenario, emptyAtlas(), key)).toBeNull();
    expect(nextHint(scenario, emptyAtlas(), 'n0')).not.toBeNull();
  });
});

describe('저장 파일', () => {
  test('플래그가 없는 저장은 SaveError 로 거른다(불러온 뒤 서버 오류가 나지 않게)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wh-save-'));
    try {
      const engine = new Engine(scenario, new FakeGm(), fakeClock().now);
      const { state } = engine.newGame(1, 's');
      const { flags: _flags, ...broken } = state;
      await writeSave(dir, 'broken', scenario, broken as typeof state);
      await expect(readSave(dir, 'broken', scenario)).rejects.toBeInstanceOf(SaveError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('서버 동시 요청', () => {
  test('저장과 행동을 함께 보내도 행동 결과가 저장에 덮이지 않는다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wh-race-'));
    const { server, sessions } = await startServer({
      port: 0,
      llmUrl: null,
      modelKey: null,
      scenarioPath: SCENARIO_PATH,
      lorePath: LORE_PATH,
      savesDir: join(dir, 'saves'),
      atlasFile: join(dir, 'atlas.json'),
      logsDir: join(dir, 'logs'),
      llmTimeoutMs: 1000,
      feedbackFile: join(dir, 'feedback.jsonl'),
    });
    const post = (path: string, body: unknown) =>
      fetch(`http://127.0.0.1:${server.port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      for (let i = 0; i < 10; i++) {
        const { session } = (await (await post('/api/new', { seed: i })).json()) as { session: string };
        const [save, act] = await Promise.all([post('/api/save', { session, slot: 'race' }), post('/api/act', { session, action: { type: 'approach', id: 'run' } })]);
        const actDone = act.status === 200 && (await act.text()).includes('"done"');
        const saveDone = save.status === 200;
        const log = sessions.get(session)?.state.log ?? [];
        // 화면에 결과를 보낸 요청은 세션 상태에도 남아 있어야 한다.
        if (actDone) expect(log.some((e) => e.kind === 'check')).toBe(true);
        if (saveDone) expect(log.some((e) => e.kind === 'save')).toBe(true);
        expect(actDone || saveDone).toBe(true);
      }
    } finally {
      server.stop(true);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
