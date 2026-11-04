import { buildAtlas, emptyAtlas, nextHint, recordAtlas, type AtlasRecord } from '../engine/atlas.ts';
import { appendFile, mkdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { seedFrom } from '../engine/dice.ts';
import { Engine } from '../engine/engine.ts';
import { loadScenario } from '../engine/scenario.ts';
import { SaveError, listSaves, readSave, readSaveView, writeSave } from '../engine/save.ts';
import { summarize } from '../engine/summary.ts';
import { GameError, type Action, type AssetSpec, type GameState, type Scenario } from '../engine/types.ts';
import { DEFAULT_GM_OPTIONS, LocalGm } from '../gm/gm.ts';
import { LlmClient } from '../gm/llm.ts';
import { loadLore, withNotes } from '../gm/lore.ts';

const APP = resolve(import.meta.dir, '..', '..');
const ROOT = resolve(APP, '..');
const WEB = join(APP, 'web');
const MEDIA = join(ROOT, 'assets');
const TITLE_LOGO = join(MEDIA, 'ep01', 'title_logo.png');
export const CREDIT = '그림 하나비 / 각색 미예 / 원작 윤슬 / 채색 및 보정 루라키 / 도움 팀 나비, 파아란';

export interface ModelEntry {
  label: string;
  file: string;
  license: string;
  chat_template_kwargs?: Record<string, unknown>;
}

export interface ServerOptions {
  port: number;
  llmUrl: string | null;
  modelKey: string | null;
  scenarioPath: string;
  lorePath: string;
  savesDir: string;
  atlasFile: string;
  logsDir: string;
  llmTimeoutMs: number;
}

export function optionsFromEnv(env: Record<string, string | undefined> = process.env): ServerOptions {
  return {
    port: Number(env.WOLHEUN_PORT ?? 18081),
    llmUrl: env.WOLHEUN_NO_LLM === '1' ? null : (env.WOLHEUN_LLM_URL ?? 'http://127.0.0.1:18080'),
    modelKey: env.WOLHEUN_MODEL ?? null,
    scenarioPath: env.WOLHEUN_SCENARIO ?? join(APP, 'content', 'ep01_desert.yaml'),
    lorePath: join(APP, 'content', 'lore_wolheun.yaml'),
    savesDir: env.WOLHEUN_SAVES ?? join(APP, 'saves'),
    atlasFile: env.WOLHEUN_ATLAS ?? join(APP, 'logs', 'atlas.json'),
    logsDir: env.WOLHEUN_LOGS ?? join(APP, 'logs'),
    llmTimeoutMs: Number(env.WOLHEUN_LLM_TIMEOUT_MS ?? 90_000),
  };
}

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
};

const MAX_VIEW_CHARS = 400_000;

class BadRequest extends Error {
  override name = 'BadRequest';
}

interface Session {
  state: GameState;
  logged: number;
  busy: boolean;
}

interface AssetRef {
  label: string;
  url: string;
  placeholder: boolean;
  crop?: [number, number, number, number];
  fit?: 'cover' | 'contain';
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS },
  });

async function staticFile(base: string, rel: string): Promise<Response> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return new Response('잘못된 경로입니다', { status: 400 });
  }
  const abs = resolve(base, decoded);
  if (!abs.startsWith(base + sep)) return new Response('잘못된 경로입니다', { status: 400 });
  const file = Bun.file(abs);
  if (!(await file.exists())) return new Response('없는 파일입니다', { status: 404 });
  return new Response(file, { headers: { 'cache-control': 'no-cache', ...SECURITY_HEADERS } });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new BadRequest('요청 본문이 올바른 JSON 이 아닙니다');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new BadRequest('요청 본문이 올바르지 않습니다');
  return data as Record<string, unknown>;
}

function parseAction(v: unknown): Action {
  const a = v as { type?: unknown; id?: unknown; text?: unknown } | null;
  if (a?.type === 'choose' && typeof a.id === 'string') return { type: 'choose', id: a.id };
  if (a?.type === 'approach' && typeof a.id === 'string') return { type: 'approach', id: a.id };
  if (a?.type === 'free' && typeof a.text === 'string') return { type: 'free', text: a.text };
  if (a?.type === 'luck') return { type: 'luck', use: (v as { use?: unknown }).use === true };
  if (a?.type === 'interject' && typeof a.text === 'string') {
    const raw = v as { scene?: unknown; shown?: unknown; pending?: unknown };
    const shown = Array.isArray(raw.shown) ? raw.shown.slice(-12) : [];
    const pending = Array.isArray(raw.pending) ? raw.pending.slice(0, 200) : [];
    return {
      type: 'interject',
      text: a.text,
      scene: typeof raw.scene === 'string' ? raw.scene : null,
      shown: shown.filter((l) => typeof l?.speaker === 'string' && typeof l?.text === 'string').map((l) => ({ speaker: l.speaker, text: l.text })),
      pending: pending.filter((l) => typeof l?.i === 'number' && typeof l?.text === 'string').map((l) => ({ i: l.i, text: l.text, ...(typeof l.if === 'string' ? { if: l.if } : {}) })),
    };
  }
  throw new BadRequest('행동 형식이 올바르지 않습니다');
}

async function mediaUrl(file: string | undefined): Promise<string | null> {
  if (!file) return null;
  const abs = resolve(ROOT, file);
  if (!abs.startsWith(MEDIA + sep) || !(await Bun.file(abs).exists())) return null;
  return `/media/${relative(MEDIA, abs).split(sep).map(encodeURIComponent).join('/')}`;
}

async function assetRef(asset: AssetSpec): Promise<AssetRef | null> {
  const url = await mediaUrl(asset.file);
  if (url) return { label: asset.label, url, placeholder: false, ...(asset.crop ? { crop: asset.crop } : {}), ...(asset.fit ? { fit: asset.fit } : {}) };
  if (!asset.placeholder) return null;
  return { label: asset.label, url: `/img/${encodeURIComponent(asset.placeholder)}.svg`, placeholder: true };
}

async function buildManifest(scenario: Scenario) {
  const refs = async (assets: Record<string, AssetSpec>) => {
    const pairs = await Promise.all(Object.entries(assets).map(async ([id, a]) => [id, await assetRef(a)] as const));
    return Object.fromEntries(pairs.filter((p): p is readonly [string, AssetRef] => p[1] !== null));
  };
  return {
    titleLogo: (await Bun.file(TITLE_LOGO).exists()) ? '/media/ep01/title_logo.png' : null,
    credit: CREDIT,
    title: scenario.title,
    episode: scenario.episode,
    rating: scenario.rating,
    source: scenario.source,
    backgrounds: await refs(scenario.backgrounds),
    sprites: await refs(scenario.sprites),
    cgs: await refs(scenario.cgs),
    cast: Object.fromEntries(
      Object.entries(scenario.cast).map(([key, c]) => [key, { display: c.display, style: c.style, sprite: c.sprite ?? null, lore: c.lore ?? null }]),
    ),
  };
}

export async function startServer(opts: ServerOptions) {
  const lore = await loadLore(opts.lorePath);
  const scenario = withNotes(await loadScenario(opts.scenarioPath), lore);
  const registry = (await Bun.file(join(APP, 'config', 'models.json')).json()) as { models: Record<string, ModelEntry> };
  const model = opts.modelKey ? (registry.models[opts.modelKey] ?? null) : null;
  const llm = opts.llmUrl
    ? new LlmClient({
        baseUrl: opts.llmUrl,
        timeoutMs: opts.llmTimeoutMs,
        ...(model?.chat_template_kwargs ? { chatTemplateKwargs: model.chat_template_kwargs } : {}),
      })
    : null;
  const readAtlas = async (): Promise<AtlasRecord> => {
    const file = Bun.file(opts.atlasFile);
    return (await file.exists()) ? ((await file.json()) as AtlasRecord) : emptyAtlas();
  };
  const engine = new Engine(scenario, new LocalGm(llm, lore, DEFAULT_GM_OPTIONS), Date.now, true);

  const build = await Bun.build({ entrypoints: [join(WEB, 'main.ts')], target: 'browser', minify: true });
  const bundle = build.outputs[0];
  if (!build.success || !bundle) throw new AggregateError(build.logs, '화면 스크립트를 묶지 못했습니다');
  const appJs = await bundle.text();
  const manifest = await buildManifest(scenario);
  const sessions = new Map<string, Session>();
  await mkdir(opts.logsDir, { recursive: true });

  const persist = async (s: Session) => {
    const fresh = s.state.log.slice(s.logged);
    if (fresh.length === 0) return;
    await appendFile(join(opts.logsDir, `${s.state.session}.jsonl`), `${fresh.map((e) => JSON.stringify(e)).join('\n')}\n`);
    s.logged = s.state.log.length;
  };

  const sessionOf = (id: unknown): Session => {
    if (typeof id !== 'string') throw new BadRequest('session 값이 필요합니다');
    const s = sessions.get(id);
    if (!s) throw new GameError('세션이 없습니다. 처음부터 다시 시작해 주세요.');
    return s;
  };

  const handle =
    (fn: (req: Request) => Promise<Response>) =>
    async (req: Request): Promise<Response> => {
      try {
        return await fn(req);
      } catch (err) {
        if (err instanceof GameError || err instanceof SaveError || err instanceof BadRequest) return json({ error: err.message }, 400);
        console.error(err);
        return json({ error: '서버 오류가 났습니다. app/logs 를 확인해 주세요.' }, 500);
      }
    };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port,
    idleTimeout: 255,
    routes: {
      '/': () => new Response(Bun.file(join(WEB, 'index.html')), { headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS } }),
      '/app.js': () => new Response(appJs, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', ...SECURITY_HEADERS } }),
      '/style.css': () => staticFile(WEB, 'style.css'),
      '/api/health': {
        GET: handle(async () => {
          const status = llm ? await llm.health() : { ok: false, model: null };
          return json({
            ok: true,
            scenario: { id: scenario.id, title: scenario.title, episode: scenario.episode },
            llm: { enabled: llm !== null, ok: status.ok, model: status.model },
            model: model ? { key: opts.modelKey, label: model.label, license: model.license } : null,
          });
        }),
      },
      '/api/manifest': { GET: () => json(manifest) },
      '/api/new': {
        POST: handle(async (req) => {
          const body = await readBody(req);
          const seed = typeof body.seed === 'number' || typeof body.seed === 'string' ? seedFrom(body.seed) : seedFrom(crypto.randomUUID());
          const id = crypto.randomUUID();
          const { state, step } = engine.newGame(seed, id);
          const s: Session = { state, logged: 0, busy: false };
          sessions.set(id, s);
          await persist(s);
          return json({ session: id, seed, step });
        }),
      },
      '/api/act': {
        POST: handle(async (req) => {
          const body = await readBody(req);
          const s = sessionOf(body.session);
          const action = parseAction(body.action);
          if (s.busy) return json({ error: '앞의 행동을 처리하는 중입니다' }, 409);
          s.busy = true;
          const encoder = new TextEncoder();
          const body$ = new ReadableStream<Uint8Array>({
            async start(controller) {
              const send = (message: unknown) => {
                try {
                  controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
                } catch {
                  // 브라우저가 연결을 끊어도 행동은 끝까지 처리해 세션 상태를 맞춘다.
                }
              };
              try {
                const { state, step } = await engine.act(s.state, action, (event) => send({ event }));
                s.state = state;
                await persist(s);
                await Bun.write(opts.atlasFile, JSON.stringify(recordAtlas(await readAtlas(), state)));
                send({ done: { prompt: step.prompt, hud: step.hud } });
              } catch (err) {
                if (!(err instanceof GameError)) console.error(err);
                send({ error: err instanceof GameError ? err.message : '서버 오류가 났습니다. app/logs 를 확인해 주세요.' });
              } finally {
                s.busy = false;
                try {
                  controller.close();
                } catch {
                  // 이미 끊긴 연결
                }
              }
            },
          });
          return new Response(body$, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS } });
        }),
      },
      '/api/save': {
        POST: handle(async (req) => {
          const body = await readBody(req);
          const s = sessionOf(body.session);
          const slot = typeof body.slot === 'string' ? body.slot : '';
          if (s.busy) return json({ error: '앞의 행동을 처리하는 중입니다' }, 409);
          const view = body.view;
          if (view !== undefined && (typeof view !== 'object' || view === null || JSON.stringify(view).length > MAX_VIEW_CHARS))
            throw new BadRequest('저장할 화면 상태가 올바르지 않습니다');
          const next = engine.noteSlot(s.state, 'save', slot);
          const meta = await writeSave(opts.savesDir, slot, scenario, next, Date.now(), view);
          s.state = next;
          await persist(s);
          return json({ meta });
        }),
      },
      '/api/saves': { GET: handle(async () => json({ saves: await listSaves(opts.savesDir) })) },
      '/api/load': {
        POST: handle(async (req) => {
          const body = await readBody(req);
          const slot = typeof body.slot === 'string' ? body.slot : '';
          const loaded = await readSave(opts.savesDir, slot, scenario);
          const id = crypto.randomUUID();
          const state = engine.noteSlot({ ...loaded, session: id }, 'load', slot);
          const s: Session = { state, logged: 0, busy: false };
          sessions.set(id, s);
          await persist(s);
          return json({ session: id, step: engine.resume(state), view: await readSaveView(opts.savesDir, slot) });
        }),
      },
      '/api/atlas': { GET: handle(async () => json(buildAtlas(scenario, await readAtlas()))) },
      '/api/atlas/hint': {
        POST: handle(async (req) => {
          const body = await readBody(req);
          const hint = nextHint(scenario, await readAtlas(), typeof body.key === 'string' ? body.key : '');
          if (!hint) return json({ error: '없는 칸입니다' }, 400);
          await Bun.write(opts.atlasFile, JSON.stringify(hint.record));
          return json({ level: hint.level, text: hint.text });
        }),
      },
      '/api/atlas/reset': {
        POST: handle(async () => {
          await Bun.write(opts.atlasFile, JSON.stringify(emptyAtlas()));
          return json({ ok: true });
        }),
      },
      '/api/result': {
        GET: handle(async (req) => {
          const s = sessionOf(new URL(req.url).searchParams.get('session'));
          return json(summarize(scenario, s.state));
        }),
      },
    },
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith('/img/')) return staticFile(join(WEB, 'img'), pathname.slice('/img/'.length));
      if (pathname.startsWith('/media/')) return staticFile(MEDIA, pathname.slice('/media/'.length));
      return new Response('없는 주소입니다', { status: 404, headers: SECURITY_HEADERS });
    },
  });
  return { server, scenario, engine, sessions };
}

if (import.meta.main) {
  const opts = optionsFromEnv();
  const { server } = await startServer(opts);
  console.log(`월흔 데모 서버: http://127.0.0.1:${server.port}  (로컬 GM: ${opts.llmUrl ?? '사용 안 함, 작가 대사로 진행'})`);
}
