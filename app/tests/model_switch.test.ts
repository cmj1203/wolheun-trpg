import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LlmClient, type ChatRequest } from '../src/gm/llm.ts';
import { bridgeUrlFor, optionsFromEnv, startServer } from '../src/server/main.ts';
import type { Action, Prompt } from '../src/engine/types.ts';
import { LORE_PATH, SCENARIO_PATH } from './helpers.ts';

interface Seen {
  path: string;
  method: string;
  body: Record<string, unknown> | null;
  raw: string;
}

/** llama-server 나 브리지를 흉내 내는 루프백 서버. 받은 요청을 모두 적는다. */
function stub(kind: 'llama' | 'bridge', models: () => string[], up: () => boolean = () => true) {
  const seen: Seen[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      const raw = req.method === 'POST' ? await req.text() : '';
      seen.push({ path: pathname, method: req.method, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null, raw });
      if (!up()) return new Response('down', { status: 503 });
      if (pathname === '/health') return Response.json({ status: 'ok' });
      if (pathname === '/v1/models') return Response.json({ data: models().map((id) => ({ id })) });
      if (kind === 'llama' && pathname === '/props') return Response.json({ default_generation_settings: { n_ctx: 65536 } });
      if (kind === 'llama' && pathname === '/apply-template') return Response.json({ prompt: 'p' });
      if (kind === 'llama' && pathname === '/tokenize') return Response.json({ tokens: [1, 2, 3] });
      if (pathname === '/v1/chat/completions') {
        const chunk = { model: kind === 'llama' ? models()[0] : 'stub-bridge', choices: [{ delta: { content: '{}' } }] };
        return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
      }
      return new Response('none', { status: 404 });
    },
  });
  const chats = () => seen.filter((s) => s.path === '/v1/chat/completions' && s.body?.stream === true);
  return { url: `http://127.0.0.1:${server.port}`, seen, chats, stop: () => server.stop(true) };
}

const LLAMA_ONLY = ['/props', '/apply-template', '/tokenize'];

describe('LlmClient 요청 본문', () => {
  const req: ChatRequest = { system: '시스템', user: '사용자', schema: { type: 'object' }, temperature: 0.7, seed: 42, maxTokens: 600, reserveContext: true };
  // 바꾸기 전 chatJson 이 만들던 본문과 같은 순서·같은 값.
  const before = (kwargs?: Record<string, unknown>) => JSON.stringify({
    messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
    temperature: req.temperature,
    top_p: 0.9,
    seed: req.seed,
    max_tokens: req.maxTokens,
    stream: true,
    cache_prompt: true,
    response_format: { type: 'json_schema', json_schema: { name: 'gm_output', strict: true, schema: req.schema } },
    ...(kwargs ? { chat_template_kwargs: kwargs } : {}),
  });

  test('로컬 모델 본문은 바꾸기 전과 바이트까지 같고, 브리지 본문은 model 만 더한다', async () => {
    const llama = stub('llama', () => ['gemma-4-26b-a4b']);
    const bridge = stub('bridge', () => ['haiku']);
    try {
      await new LlmClient({ baseUrl: llama.url, timeoutMs: 2000 }).chatJson(req);
      await new LlmClient({ baseUrl: llama.url, timeoutMs: 2000, chatTemplateKwargs: { enable_thinking: false } }).chatJson(req);
      const result = await new LlmClient({ baseUrl: bridge.url, timeoutMs: 2000, servedModel: 'haiku' }).chatJson(req);
      expect(llama.chats().map((c) => c.raw)).toEqual([before(), before({ enable_thinking: false })]);
      const sent = bridge.chats()[0]?.body;
      expect(sent?.model).toBe('haiku');
      expect(JSON.stringify({ ...sent, model: undefined })).toBe(before());
      expect(result.model).toBe('stub-bridge');
      expect(bridge.seen.some((s) => LLAMA_ONLY.includes(s.path))).toBe(false);
      expect(llama.seen.filter((s) => LLAMA_ONLY.includes(s.path)).length).toBe(6);
    } finally {
      llama.stop();
      bridge.stop();
    }
  });
});

describe('사용자 브리지 보호', () => {
  const opts = (port: number, bridgeUrl?: string | null) => ({ ...optionsFromEnv({}), port, ...(bridgeUrl === undefined ? {} : { bridgeUrl }) });

  test('사용자 포트만 기본 브리지를 쓰고, 다른 포트는 18090 이 아닌 주소를 따로 받아야 한다', () => {
    expect(bridgeUrlFor(opts(18081))).toBe('http://127.0.0.1:18090');
    expect(bridgeUrlFor(opts(18234))).toBeNull();
    expect(bridgeUrlFor(opts(18234, 'http://127.0.0.1:18090'))).toBeNull();
    expect(bridgeUrlFor(opts(18234, 'http://localhost:18090'))).toBeNull();
    expect(bridgeUrlFor(opts(18234, 'http://127.0.0.1:18299'))).toBe('http://127.0.0.1:18299');
    expect(() => bridgeUrlFor(opts(18234, 'http://example.com:18299'))).toThrow();
  });
});

describe('게임 모델 바꾸기', () => {
  let dir: string;
  let base: string;
  let stopServer: () => void;
  let bridgeUp = true;
  let bridgeModels = ['haiku', 'sonnet'];
  const llama = stub('llama', () => ['gemma-4-26b-a4b']);
  const bridge = stub('bridge', () => bridgeModels, () => bridgeUp);

  interface Listed {
    current: string | null;
    models: { key: string; label: string; kind: string; available: boolean; reason?: string }[];
  }
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const list = async () => (await (await fetch(`${base}/api/model`)).json()) as Listed;
  const statusOf = (l: Listed, key: string) => l.models.find((m) => m.key === key);

  const act = async (session: string, action: Action): Promise<Prompt> => {
    const res = await post('/api/act', { session, action });
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as { done?: { prompt: Prompt }; error?: string });
    const last = lines.at(-1);
    if (!last?.done) throw new Error(`행동이 끝나지 않았다: ${last?.error ?? '응답 없음'}`);
    return last.done.prompt;
  };

  /** 이 스텁이 GM 대화 요청을 받을 때까지 판을 진행한다. */
  const playUntilChat = async (session: string, prompt: Prompt, target: ReturnType<typeof stub>): Promise<Prompt> => {
    const start = target.chats().length;
    let current = prompt;
    for (let step = 0; step < 60 && target.chats().length === start; step++) {
      if (current.type === 'end') throw new Error('GM 호출 전에 판이 끝났다');
      const action: Action = current.type === 'free'
        ? { type: 'free', text: '주변을 살핀다' }
        : current.type === 'choices'
          ? { type: 'choose', id: current.options[0]?.id ?? '' }
          : { type: 'luck', use: false };
      current = await act(session, action);
    }
    expect(target.chats().length).toBeGreaterThan(start);
    return current;
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wolheun-model-switch-'));
    const { server } = await startServer({
      port: 0, llmUrl: llama.url, bridgeUrl: bridge.url, modelKey: 'gemma-4-26b-a4b', scenarioPath: SCENARIO_PATH, lorePath: LORE_PATH,
      savesDir: join(dir, 'saves'), atlasFile: join(dir, 'atlas.json'), logsDir: join(dir, 'logs'), feedbackFile: join(dir, 'feedback.jsonl'), llmTimeoutMs: 5000,
    });
    base = `http://127.0.0.1:${server.port}`;
    stopServer = () => server.stop(true);
  });

  afterAll(async () => {
    stopServer();
    llama.stop();
    bridge.stop();
    await rm(dir, { recursive: true, force: true });
  });

  test('목록은 실제로 도는 로컬 모델과 브리지가 내놓은 모델만 쓸 수 있다고 한다', async () => {
    bridgeUp = true;
    bridgeModels = ['haiku', 'sonnet'];
    const up = await list();
    expect(up.current).toBe('gemma-4-26b-a4b');
    expect(statusOf(up, 'gemma-4-26b-a4b')).toMatchObject({ kind: 'local', available: true });
    expect(statusOf(up, 'qwen3.5-4b')?.available).toBe(false);
    expect(statusOf(up, 'qwen3.5-4b')?.reason).toBeString();
    expect(statusOf(up, 'claude-haiku')).toMatchObject({ kind: 'bridge', available: true });
    expect(statusOf(up, 'claude-sonnet')?.available).toBe(true);
    expect(statusOf(up, 'claude-opus')?.available).toBe(false);
    expect(statusOf(up, 'claude-opus')?.reason).toBeString();

    bridgeUp = false;
    const down = await list();
    expect(down.models.filter((m) => m.kind === 'bridge').every((m) => !m.available && typeof m.reason === 'string')).toBe(true);
    expect(statusOf(down, 'gemma-4-26b-a4b')?.available).toBe(true);
    bridgeUp = true;
  });

  test('없는 모델은 400, 쓸 수 없는 모델은 409 이고 지금 모델을 그대로 둔다', async () => {
    expect((await post('/api/model', { key: 'no-such-model' })).status).toBe(400);
    expect((await post('/api/model', { key: 'toString' })).status).toBe(400);
    const busy = await post('/api/model', { key: 'claude-opus' });
    expect(busy.status).toBe(409);
    expect(((await busy.json()) as { error?: string }).error).toBeString();
    bridgeUp = false;
    expect((await post('/api/model', { key: 'claude-haiku' })).status).toBe(409);
    bridgeUp = true;
    expect((await list()).current).toBe('gemma-4-26b-a4b');
  });

  test('판을 이어 가며 바꾸면 다음 GM 요청부터 고른 모델로 가고 판은 그대로다', async () => {
    const started = (await (await post('/api/new', { seed: 2 })).json()) as { session: string; step: { prompt: Prompt } };
    let prompt = await playUntilChat(started.session, started.step.prompt, llama);
    expect(llama.chats().every((c) => c.body !== null && !('model' in c.body))).toBe(true);
    const bridgeChats = bridge.chats().length;

    const switched = await post('/api/model', { key: 'claude-haiku' });
    expect(switched.status).toBe(200);
    expect(((await switched.json()) as Listed).current).toBe('claude-haiku');
    const health = (await (await fetch(`${base}/api/health`)).json()) as { model: { key: string; kind: string } | null };
    expect(health.model).toMatchObject({ key: 'claude-haiku', kind: 'bridge' });

    const localChats = llama.chats().length;
    prompt = await playUntilChat(started.session, prompt, bridge);
    expect(bridge.chats().length).toBeGreaterThan(bridgeChats);
    expect(llama.chats().length).toBe(localChats);
    expect(bridge.chats().every((c) => c.body?.model === 'haiku')).toBe(true);
    expect(bridge.seen.some((s) => LLAMA_ONLY.includes(s.path))).toBe(false);

    const saved = await post('/api/save', { session: started.session, slot: 'slot1' });
    expect(saved.status).toBe(200);

    expect((await post('/api/model', { key: 'gemma-4-26b-a4b' })).status).toBe(200);
    await playUntilChat(started.session, prompt, llama);
    expect(llama.chats().length).toBeGreaterThan(localChats);
    expect(llama.chats().every((c) => c.body !== null && !('model' in c.body))).toBe(true);
    expect(bridge.seen.some((s) => LLAMA_ONLY.includes(s.path))).toBe(false);
  });
});
