import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FALLBACK_INPUT } from '../e2e/routes.ts';
import { emptyAtlas } from '../src/engine/atlas.ts';
import { seedFrom } from '../src/engine/dice.ts';
import { optionsFromEnv, startServer, type ServerOptions } from '../src/server/main.ts';
import { LORE_PATH, SCENARIO_PATH } from './helpers.ts';

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

type Line = { event?: { type: string; drop?: unknown[]; jump?: boolean }; done?: { prompt: { type: string; beat?: string } }; error?: string };

async function boot(extra: Partial<ServerOptions> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'wh-server-'));
  const opts: ServerOptions = {
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
    ...extra,
  };
  const started = await startServer(opts);
  const base = `http://127.0.0.1:${started.server.port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const act = async (session: string, action: unknown) => {
    const res = await post('/api/act', { session, action });
    const text = await res.text();
    return { res, lines: text.trim().split('\n').map((l) => JSON.parse(l) as Line) };
  };
  const newGame = async (seed: number | string) => (await (await post('/api/new', { seed })).json()) as { session: string; seed: number; step: { prompt: { type: string; beat?: string } } };
  const stop = async () => {
    started.server.stop(true);
    await rm(dir, { recursive: true, force: true });
  };
  return { ...started, dir, opts, base, post, act, newGame, stop };
}

type Booted = Awaited<ReturnType<typeof boot>>;

describe('서버: 정적 파일과 응답 머리글', () => {
  let b: Booted;
  beforeAll(async () => {
    b = await boot();
  });
  afterAll(async () => {
    await b.stop();
  });

  test('인코딩한 ../ 로 img·media 폴더 밖을 열지 못한다', async () => {
    expect((await fetch(`${b.base}/img/..%2f..%2fpackage.json`)).status).toBe(400);
    expect((await fetch(`${b.base}/media/..%2fapp%2fpackage.json`)).status).toBe(400);
    // web/img 와 이름이 겹치는 형제 폴더(web/img2)도 밖이다.
    expect((await fetch(`${b.base}/img/..%2fimg2%2fx.svg`)).status).toBe(400);
  });

  test('퍼센트 인코딩한 이름은 풀어서 찾는다', async () => {
    const res = await fetch(`${b.base}/img/%61sina.svg`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<svg');
  });

  test('잘못된 인코딩은 400, 없는 그림은 404, 없는 주소는 404', async () => {
    expect((await fetch(`${b.base}/img/%E0%A4%A.svg`)).status).toBe(400);
    expect((await fetch(`${b.base}/img/nope.svg`)).status).toBe(404);
    const nope = await fetch(`${b.base}/nope`);
    expect(nope.status).toBe(404);
    expect(nope.headers.get('content-security-policy')).toBe(CSP);
  });

  test('정적 파일에 보안 머리글 전체가 붙는다', async () => {
    const res = await fetch(`${b.base}/img/asina.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe(CSP);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  test('--no-llm 이면 health 의 llm.enabled 는 false', async () => {
    const res = await fetch(`${b.base}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; llm: { enabled: boolean; ok: boolean; model: unknown }; model: unknown };
    expect(body.ok).toBe(true);
    expect(body.llm).toEqual({ enabled: false, ok: false, model: null });
    expect(body.model).toBeNull();
    expect(b.server.hostname).toBe('127.0.0.1');
  });

  test('JSON 응답은 no-store 와 보안 머리글을 단다', async () => {
    const res = await fetch(`${b.base}/api/saves`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-security-policy')).toBe(CSP);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('서버: 요청 검사', () => {
  let b: Booted;
  beforeAll(async () => {
    b = await boot();
  });
  afterAll(async () => {
    await b.stop();
  });

  test('본문이 null·배열·깨진 JSON·문자열이면 400', async () => {
    for (const body of ['null', '[]', '{bad', '"str"']) {
      const res = await b.post('/api/new', body);
      expect(res.status).toBe(400);
      expect(typeof ((await res.json()) as { error: unknown }).error).toBe('string');
    }
  });

  test('행동 형식이 틀리면 400', async () => {
    const { session } = await b.newGame(1);
    for (const action of [{ type: 'dance' }, { type: 'choose', id: 123 }, null]) {
      const res = await b.post('/api/act', { session, action });
      expect(res.status).toBe(400);
    }
    // 거절 뒤에도 세션은 잡혀 있지 않다.
    expect(b.sessions.get(session)?.busy).toBe(false);
  });

  test('session 이 빠진 요청과 없는 session 은 다른 오류다', async () => {
    const missing = await b.post('/api/act', { action: { type: 'free', text: 'a' } });
    const unknown = await b.post('/api/act', { session: 'nope', action: { type: 'free', text: 'a' } });
    expect(missing.status).toBe(400);
    expect(unknown.status).toBe(400);
    const a = ((await missing.json()) as { error: string }).error;
    const c = ((await unknown.json()) as { error: string }).error;
    expect(a).not.toBe(c);
    expect((await fetch(`${b.base}/api/result`)).status).toBe(400);
  });

  test('다른 출처·다른 Host·same-site 는 403', async () => {
    for (const headers of [{ origin: 'http://evil.example' }, { host: 'evil.example' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
      const res = await b.post('/api/new', {}, headers);
      expect(res.status).toBe(403);
    }
  });

  test('JSON 이 아닌 content-type 은 400', async () => {
    for (const ct of ['text/plain', 'text/json', 'application/x-www-form-urlencoded']) {
      const res = await b.post('/api/new', '{}', { 'content-type': ct });
      expect(res.status).toBe(400);
    }
  });

  test('localhost·[::1] Host 와 같은 출처는 받는다', async () => {
    const port = b.server.port;
    expect((await b.post('/api/new', {}, { host: `localhost:${port}` })).status).toBe(200);
    expect((await b.post('/api/new', {}, { host: `[::1]:${port}` })).status).toBe(200);
    expect((await b.post('/api/new', {}, { origin: b.base, 'sec-fetch-site': 'same-origin' })).status).toBe(200);
  });

  test('없는 칸 힌트는 400, 있는 칸은 단계를 준다', async () => {
    expect((await b.post('/api/atlas/hint', { key: 'zz' })).status).toBe(400);
    const ok = await b.post('/api/atlas/hint', { key: 'n0' });
    expect(ok.status).toBe(200);
    expect(typeof ((await ok.json()) as { level: unknown }).level).toBe('number');
  });

  test('빈 저장 칸 불러오기는 400', async () => {
    expect((await b.post('/api/load', { slot: 'empty' })).status).toBe(400);
  });

  test('저장 화면 상태가 null 이거나 너무 크면 400', async () => {
    const { session } = await b.newGame(1);
    expect((await b.post('/api/save', { session, slot: 'v', view: null })).status).toBe(400);
    expect((await b.post('/api/save', { session, slot: 'v', view: { v: 'x'.repeat(400_000) } })).status).toBe(400);
    expect((await b.post('/api/save', { session, slot: 'v', view: { v: 'ok' } })).status).toBe(200);
    expect(b.sessions.get(session)?.busy).toBe(false);
  });

  test('같은 seed 로 시작하면 같은 판이다', async () => {
    const one = await b.newGame(7);
    const two = await b.newGame(7);
    expect(one.seed).toBe(seedFrom(7));
    expect(two.seed).toBe(one.seed);
    expect(one.session).not.toBe(two.session);
    expect((await b.newGame('abc')).seed).toBe(seedFrom('abc'));
  });
});

describe('서버: 행동 흐름', () => {
  let b: Booted;
  beforeAll(async () => {
    b = await boot();
  });
  afterAll(async () => {
    await b.stop();
  });

  test('행동 스트림은 done 으로 끝나고 다음 행동·저장을 막지 않는다', async () => {
    const { session } = await b.newGame(1);
    const first = await b.act(session, { type: 'free', text: FALLBACK_INPUT });
    expect(first.res.status).toBe(200);
    expect(first.res.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8');
    expect(first.res.headers.get('cache-control')).toBe('no-store');
    expect(first.lines.at(-1)?.done?.prompt.type).toBe('free');
    expect(b.sessions.get(session)?.busy).toBe(false);
    const save = await b.post('/api/save', { session, slot: 'flow' });
    expect(save.status).toBe(200);
    const second = await b.act(session, { type: 'free', text: FALLBACK_INPUT });
    expect(second.res.status).toBe(200);
    expect(second.lines.at(-1)?.done?.prompt.type).toBe('free');
  });

  test('행동을 처리하는 중이면 저장은 409', async () => {
    const { session } = await b.newGame(1);
    const s = b.sessions.get(session);
    expect(s).toBeDefined();
    s!.busy = true;
    try {
      expect((await b.post('/api/save', { session, slot: 'busy' })).status).toBe(409);
      expect((await b.post('/api/act', { session, action: { type: 'free', text: 'a' } })).status).toBe(409);
    } finally {
      s!.busy = false;
    }
  });

  test('불러온 판은 새 session 으로 이어지고 로그는 겹치지 않는다', async () => {
    const { session } = await b.newGame(3);
    await b.act(session, { type: 'free', text: FALLBACK_INPUT });
    expect((await b.post('/api/save', { session, slot: 'logs' })).status).toBe(200);
    const old = b.sessions.get(session)!.state.log;
    const oldLines = (await readFile(join(b.opts.logsDir, `${session}.jsonl`), 'utf8')).trim().split('\n');
    expect(oldLines.length).toBe(old.length);
    expect(oldLines).toEqual(old.map((e) => JSON.stringify(e)));

    const loaded = await b.post('/api/load', { slot: 'logs' });
    expect(loaded.status).toBe(200);
    const body = (await loaded.json()) as { session: string; step: unknown; view: unknown };
    expect(body.session).not.toBe(session);
    expect(body.view).toBeNull();
    expect(b.sessions.get(body.session)?.state.session).toBe(body.session);
    const next = await b.act(body.session, { type: 'free', text: FALLBACK_INPUT });
    expect(next.lines.at(-1)?.done?.prompt.type).toBe('free');
    const state = b.sessions.get(body.session)!.state;
    const newLines = (await readFile(join(b.opts.logsDir, `${body.session}.jsonl`), 'utf8')).trim().split('\n');
    expect(newLines.length).toBe(state.log.length);
    // 앞 세션 로그 파일은 그대로다.
    expect((await readFile(join(b.opts.logsDir, `${session}.jsonl`), 'utf8')).trim().split('\n')).toEqual(oldLines);
  });

  test('행운 창에서 use 가 true 가 아니면 행운을 쓰지 않는다', async () => {
    const { session } = await b.newGame(1);
    const asked = await b.act(session, { type: 'approach', id: 'run' });
    expect(asked.lines.at(-1)?.done?.prompt.type).toBe('luck');
    const before = b.sessions.get(session)!.state.tracks['행운'];
    await b.act(session, { type: 'luck', use: 'yes' });
    const s = b.sessions.get(session)!.state;
    expect(s.pendingLuck).toBeUndefined();
    expect(s.tracks['행운']).toBe(before);
  });

  test('그만두기 확인에 ok 가 없으면 그만두지 않는다', async () => {
    const { session } = await b.newGame(1);
    await b.act(session, { type: 'free', text: '그만할래' });
    expect(b.sessions.get(session)!.state.pendingRisk).toBeDefined();
    await b.act(session, { type: 'confirm' });
    expect(b.sessions.get(session)!.state.ending).toBeNull();
  });

  test('끼어들기 pending 은 앞 200 줄만, 형식이 맞는 줄만 받는다', async () => {
    const { session } = await b.newGame(1);
    const pending: unknown[] = Array.from({ length: 250 }, (_, i) => ({ i, text: 'x' }));
    pending.splice(1, 0, { text: 'no index' });
    const r = await b.act(session, { type: 'interject', text: '달려가서 길을 묻는다', scene: 'b02_people', shown: [], pending });
    const revise = r.lines.filter((l) => l.event?.type === 'revise' && l.event.jump === true);
    expect(revise.length).toBe(1);
    expect(revise[0]?.event?.drop).toEqual(Array.from({ length: 199 }, (_, i) => i));
  });

  test('끼어들기 shown 에서 형식이 틀린 줄은 버린다(마지막 화자가 여우로 남는다)', async () => {
    const { session } = await b.newGame(1);
    await b.act(session, { type: 'interject', text: '안녕하세요', scene: 'b02_people', shown: [{ speaker: 'GM', text: 'a' }, { speaker: '남자' }], pending: [] });
    expect(b.sessions.get(session)!.state.flags['말함']).toBeUndefined();
  });

  test('질문의 scene 이 문자열이 아니면 지금 장면으로 묻는다', async () => {
    const { session } = await b.newGame(1);
    await b.act(session, { type: 'ask', text: '저 남자는 누구야?', scene: ['b05_why'] });
    const inputs = b.sessions.get(session)!.state.log.filter((e) => e.kind === 'input');
    expect(inputs.map((e) => (e as { beat: string }).beat)).toEqual(['b02_people']);
  });

  test('피드백에 판 상태가 붙는다', async () => {
    const { session, seed } = await b.newGame(5);
    const res = await b.post('/feedback', { text: '좋아요', session });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    const lines = (await readFile(b.opts.feedbackFile!, 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { id: string; game: { seed: number; beat: string } | null });
    const rec = lines.find((l) => l.id === id);
    expect(rec?.game?.seed).toBe(seed);
    expect(rec?.game?.beat).toBe('b02_people');
  });

  test('끝난 이야기의 행동 오류와 서버 오류는 다르고, 깨진 지도는 500', async () => {
    const { session } = await b.newGame(1);
    let prompt = 'free';
    for (let turn = 0; prompt === 'free'; turn++) {
      expect(turn).toBeLessThan(10);
      const r = await b.act(session, { type: 'free', text: FALLBACK_INPUT });
      prompt = r.lines.at(-1)?.done?.prompt.type ?? 'error';
    }
    expect(prompt).toBe('end');
    const ended = await b.act(session, { type: 'free', text: FALLBACK_INPUT });
    const gameError = ended.lines.at(-1)?.error;
    expect(typeof gameError).toBe('string');

    const fresh = await b.newGame(2);
    await writeFile(b.opts.atlasFile, '{broken');
    try {
      const broken = await b.act(fresh.session, { type: 'free', text: FALLBACK_INPUT });
      const serverError = broken.lines.at(-1)?.error;
      expect(typeof serverError).toBe('string');
      expect(serverError).not.toBe(gameError);
      expect(b.sessions.get(fresh.session)?.busy).toBe(false);
      expect((await fetch(`${b.base}/api/atlas`)).status).toBe(500);
    } finally {
      await writeFile(b.opts.atlasFile, JSON.stringify(emptyAtlas()));
    }
    expect((await fetch(`${b.base}/api/atlas`)).status).toBe(200);
  });
});

describe('서버: 갈림길 자동 저장', () => {
  let b: Booted;
  beforeAll(async () => {
    b = await boot();
  });
  afterAll(async () => {
    await b.stop();
  });

  test('갈림길 비트에서만 자동 저장하고 목록에 숨기며, 같은 seed 판에만 fork 를 연다', async () => {
    const { session } = await b.newGame(1);
    const beats: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await b.act(session, { type: 'free', text: FALLBACK_INPUT });
      beats.push(r.lines.at(-1)?.done?.prompt.beat);
    }
    expect(beats).toEqual(['b05_why', 'b06_swing', 'b08_gaze']);
    expect((await b.post('/api/save', { session, slot: 'mine' })).status).toBe(200);

    const { saves } = (await (await fetch(`${b.base}/api/saves`)).json()) as { saves: { slot: string }[] };
    expect(saves.map((m) => m.slot)).toEqual(['mine']);

    const result = (await (await fetch(`${b.base}/api/result?session=${session}`)).json()) as { fork: boolean };
    expect(result.fork).toBe(true);
    const other = await b.newGame(2);
    const otherResult = (await (await fetch(`${b.base}/api/result?session=${other.session}`)).json()) as { fork: boolean };
    expect(otherResult.fork).toBe(false);

    const loaded = await b.post('/api/load', { slot: 'auto_fork' });
    expect(loaded.status).toBe(200);
    const { session: forkSession } = (await loaded.json()) as { session: string };
    expect(b.sessions.get(forkSession)?.state.beat).toBe('b06_swing');
  });
});

describe('서버: 그림 주소', () => {
  let b: Booted;
  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wh-scn-'));
    const yaml = (await readFile(SCENARIO_PATH, 'utf8'))
      .replace('desert_wide: { label: 끝없는 모래사막, file: assets/ep01/gen/bg/desert_wide.png, placeholder: desert_wide }', 'desert_wide: { label: 끝없는 모래사막, file: app/package.json, placeholder: desert_wide }')
      .replace('blackout: { label: 암전, placeholder: blackout }', 'blackout: { label: 암전, placeholder: "a b?c" }');
    const path = join(dir, 'scenario.yaml');
    await writeFile(path, yaml);
    b = await boot({ scenarioPath: path });
    const stop = b.stop;
    b.stop = async () => {
      await stop();
      await rm(dir, { recursive: true, force: true });
    };
  });
  afterAll(async () => {
    await b.stop();
  });

  test('assets 밖 파일은 그림 주소로 내주지 않고, 자리 그림 이름은 인코딩한다', async () => {
    const manifest = (await (await fetch(`${b.base}/api/manifest`)).json()) as { backgrounds: Record<string, { label: string; url: string; placeholder: boolean }> };
    expect(manifest.backgrounds.desert_wide).toEqual({ label: '끝없는 모래사막', url: '/img/desert_wide.svg', placeholder: true });
    expect(manifest.backgrounds.blackout?.url).toBe('/img/a%20b%3Fc.svg');
  });
});

describe('서버: LLM 시간 제한', () => {
  let b: Booted;
  let hang: ReturnType<typeof Bun.serve>;
  beforeAll(async () => {
    // 답하지 않는 LLM 서버. 서버 쪽 시간 제한(llmTimeoutMs)이 지나야 작가 대사로 넘어간다.
    hang = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Promise<Response>(() => {}) });
    b = await boot({ llmUrl: `http://127.0.0.1:${hang.port}`, llmTimeoutMs: 150 });
  });
  afterAll(async () => {
    await b.stop();
    hang.stop(true);
  });

  test('응답 없는 LLM 은 llmTimeoutMs 뒤 작가 대사로 넘어가 행동이 끝난다', async () => {
    const { session } = await b.newGame(1);
    const r = await b.act(session, { type: 'free', text: '춤을 춘다' });
    expect(r.res.status).toBe(200);
    expect(r.lines.at(-1)?.done?.prompt.type).toBe('free');
  });
});

describe('optionsFromEnv', () => {
  test('WOLHEUN_NO_LLM=1 이면 LLM 을 쓰지 않는다', () => {
    expect(optionsFromEnv({ WOLHEUN_NO_LLM: '1', WOLHEUN_LLM_URL: 'http://127.0.0.1:9' }).llmUrl).toBeNull();
    expect(optionsFromEnv({ WOLHEUN_LLM_URL: 'http://127.0.0.1:9' }).llmUrl).toBe('http://127.0.0.1:9');
  });

  test('기본값', () => {
    const o = optionsFromEnv({});
    expect(o.port).toBe(18081);
    expect(o.llmUrl).toBe('http://127.0.0.1:18080');
    expect(o.llmTimeoutMs).toBe(90_000);
    expect(o.modelKey).toBeNull();
  });

  test('환경 변수를 읽는다', () => {
    const o = optionsFromEnv({ WOLHEUN_PORT: '1234', WOLHEUN_LLM_TIMEOUT_MS: '500', WOLHEUN_MODEL: 'm', WOLHEUN_SAVES: '/x/s', WOLHEUN_LOGS: '/x/l', WOLHEUN_ATLAS: '/x/a.json', WOLHEUN_FEEDBACK: '/x/f.jsonl' });
    expect(o).toMatchObject({ port: 1234, llmTimeoutMs: 500, modelKey: 'm', savesDir: '/x/s', logsDir: '/x/l', atlasFile: '/x/a.json', feedbackFile: '/x/f.jsonl' });
  });
});
