import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server/main.ts';
import type { Action, Prompt } from '../src/engine/types.ts';
import { LORE_PATH, SCENARIO_PATH } from './helpers.ts';

const nextAction = (p: Prompt): Action => {
  if (p.type === 'free') {
    const approach = p.approaches.find((a) => !a.locked);
    if (!approach) throw new Error('메모 경로에 고를 수 있는 행동이 없다');
    return { type: 'approach', id: approach.id };
  }
  if (p.type === 'choices') {
    const option = p.options[0];
    if (!option) throw new Error('메모 경로에 고를 수 있는 선택지가 없다');
    return { type: 'choose', id: option.id };
  }
  if (p.type === 'luck') return { type: 'luck', use: false };
  throw new Error('메모 경로가 갈림길 전에 끝났다');
};

describe('메모', () => {
  let dir: string;
  let base: string;
  let stop: () => void;

  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const newSession = async () => ((await (await post('/api/new', { seed: 2 })).json()) as { session: string }).session;
  const load = async (slot: string) => (await (await post('/api/load', { slot })).json()) as { session: string; view: { memo?: string } | null };
  const memoOf = async (session: string) => ((await (await fetch(`${base}/api/notes?session=${session}`)).json()) as { memo: string }).memo;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wolheun-notes-'));
    const { server } = await startServer({ port: 0, llmUrl: null, modelKey: null, scenarioPath: SCENARIO_PATH, lorePath: LORE_PATH, savesDir: join(dir, 'saves'), atlasFile: join(dir, 'atlas.json'), logsDir: join(dir, 'logs'), feedbackFile: join(dir, 'feedback.jsonl'), llmTimeoutMs: 1000 });
    base = `http://127.0.0.1:${server.port}`;
    stop = () => server.stop(true);
  });

  afterAll(async () => {
    stop();
    await rm(dir, { recursive: true, force: true });
  });

  test('판마다 따로 저장하고 다시 읽는다', async () => {
    const [a, b] = [await newSession(), await newSession()];
    expect((await post('/api/notes', { session: a, memo: '붉은 눈 조심' })).ok).toBe(true);
    expect(await memoOf(a)).toBe('붉은 눈 조심');
    expect(await memoOf(b)).toBe('');
  });

  test('2000자까지만 받고, 넘으면 있던 글을 지키고 거절한다', async () => {
    const session = await newSession();
    expect((await post('/api/notes', { session, memo: '가'.repeat(2000) })).ok).toBe(true);
    expect((await post('/api/notes', { session, memo: '가'.repeat(2001) })).status).toBe(400);
    expect(await memoOf(session)).toHaveLength(2000);
  });

  test('저장 칸을 불러오면 그 때의 메모가 새 판으로 온다', async () => {
    const session = await newSession();
    await post('/api/notes', { session, memo: '저장할 때 글' });
    expect((await post('/api/save', { session, slot: 'slot1' })).ok).toBe(true);
    await post('/api/notes', { session, memo: '저장 뒤에 고친 글' });
    const loaded = await load('slot1');
    expect(loaded.view?.memo).toBe('저장할 때 글');
    expect(await memoOf(loaded.session)).toBe('저장할 때 글');
  });

  test('메모를 적은 판의 갈림길 자동 저장에도 메모가 들어간다', async () => {
    const start = (await (await post('/api/new', { seed: 2 })).json()) as { session: string; step: { prompt: Prompt } };
    await post('/api/notes', { session: start.session, memo: '갈림길 전 메모' });
    let auto: { memo?: string } | null = null;
    let prompt: Prompt | null = start.step.prompt;
    for (let i = 0; i < 40 && prompt && !auto; i++) {
      const reply = await (await post('/api/act', { session: start.session, action: nextAction(prompt) })).text();
      prompt = (JSON.parse(reply.trim().split('\n').at(-1) ?? '{}') as { done?: { prompt: Prompt } }).done?.prompt ?? null;
      const file = Bun.file(join(dir, 'saves', 'auto_fork.json'));
      if (await file.exists()) auto = ((await file.json()) as { view?: { memo?: string } }).view ?? null;
    }
    expect(auto?.memo).toBe('갈림길 전 메모');
  });

  test('판 번호 꼴이 아니면 파일을 찾지 않는다', async () => {
    expect((await fetch(`${base}/api/notes?session=${encodeURIComponent('../../etc/passwd')}`)).status).toBe(400);
  });
});
