import { attachAtlasView, buildAtlas, checkpointAtlas, emptyAtlas, forkBeats, nextHint, recordAtlas, restartAtlas, type AtlasRecord } from '../engine/atlas.ts';
import {
  atlasSceneToken, beginAtlasPlayback, confirmAtlasScene, createAtlasPlayback,
  enqueueAtlasScene, packAtlasView, prepareAtlasDisplay, restoreAtlasPlayback,
  type AtlasPlayback,
} from '../engine/atlas-display.ts';
import { appendFile, mkdir, rename } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { seedFrom } from '../engine/dice.ts';
import { Engine } from '../engine/engine.ts';
import { loadCampaignScenario, resumeCampaign } from '../engine/continuation.ts';
import { SaveError, listSaves, readSave, readSaveSnapshot, writeSave } from '../engine/save.ts';
import { ViewpointPlayback, rotateViewFrames, forgetViewFrames, type SavedViewpoint } from './viewpoint.ts';
import { summarize } from '../engine/summary.ts';
import { GameError, type Action, type AssetSpec, type GameState, type Scenario } from '../engine/types.ts';
import { DEFAULT_GM_OPTIONS, LocalGm, type GmOptions } from '../gm/gm.ts';
import { LlmClient, assertLoopback } from '../gm/llm.ts';
import { SwitchableLlm } from '../gm/switch.ts';
import { loadLore, withNotes } from '../gm/lore.ts';
import { gitShortHash, handleFeedback } from './feedback.ts';
import { rejectForeignPost } from './same_origin.ts';

const APP = resolve(import.meta.dir, '..', '..');
const ROOT = resolve(APP, '..');
const WEB = join(APP, 'web');
const MEDIA = join(ROOT, 'assets');
const TITLE_LOGO = join(MEDIA, 'ep01', 'title_logo.png');
export const CREDIT = '그림 하나비 / 각색 미예 / 원작 윤슬 / 채색 및 보정 루라키 / 도움 팀 나비, 파아란';

export interface ModelEntry {
  label: string;
  /** 브리지 모델은 파일·라이선스가 없다. */
  file?: string;
  license?: string;
  chat_template_kwargs?: Record<string, unknown>;
  kind?: 'local' | 'bridge';
  served_model?: string;
  gm_budget_ms?: number;
}

export interface ModelStatus {
  key: string;
  label: string;
  kind: 'local' | 'bridge';
  available: boolean;
  reason?: string;
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
  /** 브리지 주소. 없으면 사용자 판(18081)만 기본 브리지를 쓴다. bridgeUrlFor 참고. */
  bridgeUrl?: string | null;
  /** 게임 속 피드백을 덧붙이는 jsonl. 없으면 app/feedback/feedback.jsonl. */
  feedbackFile?: string;
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
    bridgeUrl: env.WOLHEUN_BRIDGE_URL ?? null,
    feedbackFile: env.WOLHEUN_FEEDBACK ?? join(APP, 'feedback', 'feedback.jsonl'),
  };
}

const USER_PORT = 18081;
const USER_LLM = 'http://127.0.0.1:18080';
const USER_BRIDGE = 'http://127.0.0.1:18090';

/**
 * 이 서버가 쓸 브리지 주소. 다른 포트의 서버는 사용자 브리지(18090)를 함께 쓰지 않는다.
 * 따로 WOLHEUN_BRIDGE_URL 을 주지 않았거나 18090 을 주면 서버는 뜨되 브리지 모델만 끈다(null).
 */
export function bridgeUrlFor(opts: ServerOptions): string | null {
  const url = opts.bridgeUrl ?? (opts.port === USER_PORT ? USER_BRIDGE : null);
  if (url === null) return null;
  const parsed = assertLoopback(url);
  if (opts.port !== USER_PORT && parsed.port === new URL(USER_BRIDGE).port) return null;
  return url;
}

/** 사용자 판(18081)의 파일이나 LLM 을 함께 쓰게 된 옵션 이름. 다른 포트의 서버가 이 파일에 쓰면 사용자 저장이 덮인다. */
export function sharedWithUser(opts: ServerOptions): string[] {
  if (opts.port === USER_PORT) return [];
  const within = (dir: string, path: string) => resolve(path) === dir || resolve(path).startsWith(dir + sep);
  const userData = [join(APP, 'saves'), join(APP, 'logs')];
  const inUserData = (path: string) => userData.some((dir) => within(dir, path));
  return [
    ...(inUserData(opts.savesDir) ? ['WOLHEUN_SAVES'] : []),
    ...(inUserData(opts.atlasFile) ? ['WOLHEUN_ATLAS'] : []),
    ...(inUserData(opts.logsDir) ? ['WOLHEUN_LOGS'] : []),
    ...(within(join(APP, 'feedback'), opts.feedbackFile ?? join(APP, 'feedback', 'feedback.jsonl')) ? ['WOLHEUN_FEEDBACK'] : []),
    ...(opts.llmUrl === USER_LLM ? ['WOLHEUN_LLM_URL'] : []),
  ];
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
const MAX_MEMO_CHARS = 2000;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** 갈림길 비트에 들어선 직후 서버가 쓰는 자동 저장 칸. 화면 저장 칸과 별개라 목록에 보이지 않고, 작은 끝 뒤 '마지막 갈림길에서 다시'가 연다. */
export const AUTO_FORK = 'auto_fork';

class BadRequest extends Error {
  override name = 'BadRequest';
}

interface Session {
  state: GameState;
  logged: number;
  busy: boolean;
  memo: string;
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
  if (a?.type === 'confirm') return { type: 'confirm', ok: (v as { ok?: unknown }).ok === true };
  if (a?.type === 'ask' && typeof a.text === 'string') {
    const scene = (v as { scene?: unknown }).scene;
    const frame = (v as { frame?: unknown }).frame;
    return { type: 'ask', text: a.text, scene: typeof scene === 'string' ? scene : null, ...(typeof frame === 'string' ? { frame } : {}) };
  }
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
    items: Object.fromEntries((await Promise.all(scenario.sheet.items.map(async (i) => [i.id, await mediaUrl(i.file)] as const))).filter((p): p is readonly [string, string] => p[1] !== null)),
    cutins: { crit: await mediaUrl('assets/ep01/gen/fx/cutin_crit.png'), miss: await mediaUrl('assets/ep01/gen/fx/cutin_miss.png') },
    cast: Object.fromEntries(
      Object.entries(scenario.cast).map(([key, c]) => [key, { display: c.display, style: c.style, sprite: c.sprite ?? null, lore: c.lore ?? null }]),
    ),
  };
}

export async function startServer(opts: ServerOptions) {
  const shared = sharedWithUser(opts);
  if (shared.length > 0) throw new Error(`포트 ${opts.port} 서버는 사용자 판(${USER_PORT})과 같은 파일·LLM 을 쓸 수 없습니다. 따로 주세요: ${shared.join(', ')} (LLM 이 필요 없으면 WOLHEUN_NO_LLM=1)`);
  const lore = await loadLore(opts.lorePath);
  const scenario = withNotes(await loadCampaignScenario(opts.scenarioPath), lore);
  const registry = (await Bun.file(join(APP, 'config', 'models.json')).json()) as { models: Record<string, ModelEntry> };
  const model = opts.modelKey ? (registry.models[opts.modelKey] ?? null) : null;
  const bridgeUrl = bridgeUrlFor(opts);
  const localClient = (llmUrl: string, entry: ModelEntry | null) =>
    new LlmClient({
      baseUrl: llmUrl,
      timeoutMs: opts.llmTimeoutMs,
      ...(entry?.chat_template_kwargs ? { chatTemplateKwargs: entry.chat_template_kwargs } : {}),
    });
  const startClient = opts.llmUrl ? localClient(opts.llmUrl, model) : null;
  const budgetOf = (entry: ModelEntry | null) => (typeof entry?.gm_budget_ms === 'number' ? { budgetMs: entry.gm_budget_ms } : {});
  // GM 은 이 하나를 쥐고, /api/model 이 판을 두고 고른 모델만 바꾼다. LLM 없이 띄운 서버는 예전처럼 null 이다.
  const llm = startClient ? new SwitchableLlm({ key: opts.modelKey, client: startClient, ...budgetOf(model) }) : null;
  const gmOptions: GmOptions = {
    ...DEFAULT_GM_OPTIONS,
    get budgetMs() {
      return llm?.budgetMs ?? DEFAULT_GM_OPTIONS.budgetMs;
    },
  };
  const clients = new Map<string, LlmClient>(opts.modelKey && startClient ? [[opts.modelKey, startClient]] : []);
  const kindOf = (entry: ModelEntry): 'local' | 'bridge' => (entry.kind === 'bridge' ? 'bridge' : 'local');
  const bridgeServed = async (url: string): Promise<string[] | null> => {
    try {
      const health = (await fetch(new URL('/health', url), { signal: AbortSignal.timeout(2000) }).then((r) => (r.ok ? r.json() : null))) as { status?: unknown } | null;
      if (health?.status !== 'ok') return null;
      const list = (await fetch(new URL('/v1/models', url), { signal: AbortSignal.timeout(2000) }).then((r) => (r.ok ? r.json() : null))) as { data?: { id?: unknown }[] } | null;
      return (list?.data ?? []).flatMap((m) => (typeof m.id === 'string' ? [m.id] : []));
    } catch {
      return null;
    }
  };
  const listModels = async (): Promise<ModelStatus[]> => {
    const [local, served] = await Promise.all([startClient ? startClient.health() : null, bridgeUrl ? bridgeServed(bridgeUrl) : null]);
    return Object.entries(registry.models).map(([key, entry]): ModelStatus => {
      const kind = kindOf(entry);
      const base = { key, label: entry.label, kind };
      const off = (reason: string): ModelStatus => ({ ...base, available: false, reason });
      if (!llm) return off('이 서버는 LLM 없이 실행 중입니다');
      if (kind === 'bridge') {
        if (!bridgeUrl) return off('이 포트는 브리지를 쓰지 않습니다 (WOLHEUN_BRIDGE_URL 필요)');
        if (!served) return off('브리지가 꺼져 있습니다 (tools/llm-bridge 를 켜세요)');
        if (!entry.served_model || !served.includes(entry.served_model)) return off('브리지에 이 모델이 없습니다');
        return { ...base, available: true };
      }
      if (!local?.ok) return off('로컬 LLM 서버가 꺼져 있습니다');
      if (local.model !== key) return off(`실행 중인 모델이 아닙니다 (./run.sh --model ${key})`);
      return { ...base, available: true };
    });
  };
  const clientFor = (key: string, entry: ModelEntry): LlmClient | null => {
    const cached = clients.get(key);
    if (cached) return cached;
    const url = kindOf(entry) === 'bridge' ? bridgeUrl : opts.llmUrl;
    if (!url) return null;
    const client = kindOf(entry) === 'bridge'
      ? new LlmClient({ baseUrl: url, timeoutMs: opts.llmTimeoutMs, ...(entry.served_model ? { servedModel: entry.served_model } : {}) })
      : localClient(url, entry);
    clients.set(key, client);
    return client;
  };
  const currentEntry = () => {
    const key = llm ? llm.key : opts.modelKey;
    const entry = key ? registry.models[key] : undefined;
    return key && entry ? { key, entry } : null;
  };
  const readAtlas = async (): Promise<AtlasRecord> => {
    const file = Bun.file(opts.atlasFile);
    if (!(await file.exists())) return emptyAtlas();
    try {
      return (await file.json()) as AtlasRecord;
    } catch {
      // 깨진 기록(쓰다 만 파일 따위)은 빈 지도로 본다. 지도 때문에 판이 막히면 안 된다.
      return emptyAtlas();
    }
  };
  // 다른 요청이 쓰다 만 파일을 읽지 않게, 임시 파일에 다 쓴 뒤 이름을 바꾼다.
  let atlasSeq = 0;
  const writeAtlas = async (record: AtlasRecord): Promise<void> => {
    const tmp = `${opts.atlasFile}.${process.pid}.${++atlasSeq}.tmp`;
    await Bun.write(tmp, JSON.stringify(record));
    await rename(tmp, opts.atlasFile);
  };
  let atlasWrites: Promise<void> = Promise.resolve();
  const updateAtlas = (change: (record: AtlasRecord) => AtlasRecord): Promise<AtlasRecord> => {
    const operation = atlasWrites.then(async () => {
      const record = change(await readAtlas());
      await writeAtlas(record);
      return record;
    });
    atlasWrites = operation.then(() => undefined, () => undefined);
    return operation;
  };
  const engine = new Engine(scenario, new LocalGm(llm, lore, gmOptions), Date.now, true);
  const forks = forkBeats(scenario);

  const build = await Bun.build({ entrypoints: [join(WEB, 'main.ts')], target: 'browser', minify: true });
  const bundle = build.outputs[0];
  if (!build.success || !bundle) throw new AggregateError(build.logs, '화면 스크립트를 묶지 못했습니다');
  const appJs = await bundle.text();
  const manifest = await buildManifest(scenario);
  const sessions = new Map<string, Session>();
  const playbacks = new Map<string, AtlasPlayback>();
  const viewpoints = new Map<string, ViewpointPlayback>();
  const viewpointOf = (id: string): ViewpointPlayback => {
    const viewpoint = viewpoints.get(id);
    if (!viewpoint) throw new BadRequest('표시할 판이 없습니다.');
    return viewpoint;
  };
  const playbackOf = (id: string): AtlasPlayback => {
    const playback = playbacks.get(id);
    if (!playback) throw new BadRequest('표시할 판이 없습니다. 저장한 판을 다시 열어 주세요.');
    return playback;
  };
  await mkdir(opts.logsDir, { recursive: true });
  const feedbackFile = opts.feedbackFile ?? join(APP, 'feedback', 'feedback.jsonl');
  const version = await gitShortHash(APP);

  const memoFile = (id: string) => join(opts.savesDir, 'notes', `${id}.txt`);
  const writeMemo = async (id: string, memo: string) => {
    await mkdir(join(opts.savesDir, 'notes'), { recursive: true });
    await Bun.write(memoFile(id), memo);
  };
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

  const post = (fn: (req: Request) => Promise<Response>) =>
    handle(async (req) => {
      const foreign = rejectForeignPost(req);
      return foreign ? json({ error: foreign.error }, foreign.status) : fn(req);
    });

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port,
    idleTimeout: 255,
    routes: {
      '/': () => new Response(Bun.file(join(WEB, 'index.html')), { headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS } }),
      '/app.js': () => new Response(appJs, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', ...SECURITY_HEADERS } }),
      '/style.css': () => staticFile(WEB, 'style.css'),
      '/branch-map.css': () => staticFile(WEB, 'branch-map.css'),
      '/api/health': {
        GET: handle(async () => {
          const status = llm ? await llm.health() : { ok: false, model: null };
          const current = currentEntry();
          return json({
            ok: true,
            scenario: { id: scenario.id, title: scenario.title, episode: scenario.episode },
            llm: { enabled: llm !== null, ok: status.ok, model: status.model },
            model: current
              ? { key: current.key, label: current.entry.label, kind: kindOf(current.entry), ...(current.entry.license ? { license: current.entry.license } : {}) }
              : null,
          });
        }),
      },
      '/api/model': {
        GET: handle(async () => json({ current: currentEntry()?.key ?? null, models: await listModels() })),
        POST: post(async (req) => {
          const body = await readBody(req);
          const key = typeof body.key === 'string' ? body.key : '';
          const entry = Object.hasOwn(registry.models, key) ? registry.models[key] : undefined;
          if (!entry) throw new BadRequest(`없는 모델입니다: ${key}`);
          const models = await listModels();
          const status = models.find((m) => m.key === key);
          const client = status?.available && llm ? clientFor(key, entry) : null;
          if (!llm || !client) return json({ error: `${entry.label}을(를) 쓸 수 없습니다: ${status?.reason ?? '연결할 주소가 없습니다'}` }, 409);
          llm.select({ key, client, ...budgetOf(entry) });
          return json({ current: key, models });
        }),
      },
      '/api/manifest': { GET: () => json(manifest) },
      '/feedback': {
        POST: (req, srv): Promise<Response> =>
          handleFeedback(req, {
            file: feedbackFile,
            version,
            ip: srv.requestIP(req)?.address ?? null,
            enrich: (id) => {
              const s = typeof id === 'string' ? sessions.get(id) : undefined;
              if (!s) return null;
              const { state } = s;
              return { seed: state.seed, beat: state.beat, beatTitle: scenario.beats[state.beat]?.title ?? null, lastInput: state.said?.at(-1) ?? null, tracks: state.tracks, flags: state.flags, ending: state.ending };
            },
          }),
      },
      '/api/new': {
        POST: post(async (req) => {
          const body = await readBody(req);
          const seed = typeof body.seed === 'number' || typeof body.seed === 'string' ? seedFrom(body.seed) : seedFrom(crypto.randomUUID());
          const id = crypto.randomUUID();
          const viewpoint = new ViewpointPlayback();
          const { state, step } = engine.newGame(seed, id, viewpoint.observe);
          viewpoints.set(id, viewpoint);
          const s: Session = { state, logged: 0, busy: false, memo: '' };
          sessions.set(id, s);
          playbacks.set(id, createAtlasPlayback(id, step.events));
          await updateAtlas((record) => checkpointAtlas(scenario, recordAtlas(prepareAtlasDisplay(record), state), state));
          await persist(s);
          return json({ session: id, seed, step });
        }),
      },
      '/api/act': {
        POST: post(async (req) => {
          const body = await readBody(req);
          const s = sessionOf(body.session);
          const action = parseAction(body.action);
          if (s.busy) return json({ error: '앞의 행동을 처리하는 중입니다' }, 409);
          const viewpoint = viewpointOf(s.state.session);
          const question = action.type === 'ask' ? viewpoint.question(action.frame) : undefined;
          s.busy = true;
          const playback = playbackOf(s.state.session);
          if (action.type !== 'ask') {
            viewpoint.begin();
          }
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
                const logged = s.state.log.length;
                let replaceDisplay = action.type !== 'ask';
                const { state, step } = await engine.act(s.state, action, (event) => {
                  enqueueAtlasScene(playback, event);
                  send({ event });
                }, { observer: (observation) => {
                  if (replaceDisplay && observation.source === 'fresh') {
                    beginAtlasPlayback(playback);
                    replaceDisplay = false;
                  }
                  viewpoint.observe(observation);
                }, ...(question ? { question } : {}) });
                s.state = state;
                // 세션은 이미 나아갔다. 기록·자동 저장·지도가 실패해도 화면에는 결과를 보내 둘이 어긋나지 않게 한다.
                try {
                  await persist(s);
                  // 갈림길 비트에 이번 행동으로 들어섰으번 그 자리를 자동 저장한다(화면 상태 없음 → 불러오면 비트 처음부터).
                  if (!state.ending && forks.has(state.beat) && state.log.slice(logged).some((e) => e.kind === 'beat' && e.beat === state.beat)) {
                    await writeSave(opts.savesDir, AUTO_FORK, scenario, state, Date.now(), s.memo ? { memo: s.memo } : undefined);
                  }
                  await updateAtlas((record) => checkpointAtlas(scenario, recordAtlas(prepareAtlasDisplay(record), state), state));
                } catch (err) {
                  console.error(err);
                }
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
        POST: post(async (req) => {
          const body = await readBody(req);
          const s = sessionOf(body.session);
          const slot = typeof body.slot === 'string' ? body.slot : '';
          if (s.busy) return json({ error: '앞의 행동을 처리하는 중입니다' }, 409);
          const view = body.view;
          if (view !== undefined && (typeof view !== 'object' || view === null || JSON.stringify(view).length > MAX_VIEW_CHARS))
            throw new BadRequest('저장할 화면 상태가 올바르지 않습니다');
          // 파일을 쓰는 동안 들어온 행동이 끝난 뒤 저장 전 상태로 덮이지 않게, 저장도 행동처럼 세션을 잡는다.
          s.busy = true;
          try {
            const packed = typeof view === 'object' && view !== null && 'scene' in view
              ? packAtlasView(playbackOf(s.state.session), view)
              : view;
            const next = engine.noteSlot(s.state, 'save', slot);
            const saved = s.memo ? { ...packed, memo: s.memo } : packed;
            const meta = await writeSave(opts.savesDir, slot, scenario, next, Date.now(), saved, viewpointOf(s.state.session).save());
            s.state = next;
            await persist(s);
            return json({ meta });
          } finally {
            s.busy = false;
          }
        }),
      },
      '/api/notes': {
        GET: handle(async (req) => {
          const id = new URL(req.url).searchParams.get('session') ?? '';
          if (!SESSION_ID.test(id)) throw new BadRequest('session 값이 올바르지 않습니다');
          const file = Bun.file(memoFile(id));
          return json({ memo: (await file.exists()) ? await file.text() : '' });
        }),
        POST: post(async (req) => {
          const body = await readBody(req);
          const s = sessionOf(body.session);
          if (typeof body.memo !== 'string' || body.memo.length > MAX_MEMO_CHARS) throw new BadRequest(`메모는 ${MAX_MEMO_CHARS}자까지 저장합니다`);
          s.memo = body.memo;
          await writeMemo(s.state.session, s.memo);
          return json({ ok: true });
        }),
      },
      '/api/saves': { GET: handle(async () => json({ saves: (await listSaves(opts.savesDir)).filter((m) => m.slot !== AUTO_FORK) })) },
      '/api/load': {
        POST: post(async (req) => {
          const body = await readBody(req);
          const slot = typeof body.slot === 'string' ? body.slot : '';
          const snapshot = await readSaveSnapshot(opts.savesDir, slot, scenario);
          const loaded = snapshot.state;
          const id = crypto.randomUUID();
          const viewpoint = new ViewpointPlayback();
          const resumed = await resumeCampaign(engine, engine.noteSlot({ ...loaded, session: id }, 'load', slot), viewpoint.observe);
          const { state } = resumed;
          const savedView = snapshot.view;
          let view = resumed.continued ? undefined : savedView;
          if (!resumed.continued) {
            const saved = snapshot.viewpoint as SavedViewpoint | null;
            if (saved) view = rotateViewFrames(view, viewpoint.restore(saved, id));
            else if (view) view = forgetViewFrames(view);
            else viewpoint.legacy(state, resumed.step.events);
          }
          viewpoints.set(id, viewpoint);
          const memo = (savedView as { memo?: unknown } | null)?.memo;
          const s: Session = { state, logged: 0, busy: false, memo: typeof memo === 'string' ? memo.slice(0, MAX_MEMO_CHARS) : '' };
          playbacks.set(id, restoreAtlasPlayback(state, resumed.step.events, view));
          sessions.set(id, s);
          await updateAtlas((record) => checkpointAtlas(scenario, recordAtlas(prepareAtlasDisplay(record), state), state));
          await persist(s);
          if (s.memo) await writeMemo(id, s.memo);
          return json({ session: id, step: resumed.step, view });
        }),
      },
      '/api/atlas': {
        GET: handle(async (req) => {
          const id = new URL(req.url).searchParams.get('session');
          const state = id ? sessionOf(id).state : undefined;
          return json(buildAtlas(scenario, await readAtlas(), state));
        }),
      },
      '/api/viewpoint/confirm': {
        POST: post(async (req) => {
          const body = await readBody(req);
          const s = sessionOf(body.session);
          viewpointOf(s.state.session).confirm(body.frame);
          return json({ ok: true });
        }),
      },
      '/api/atlas/view': {
        GET: handle(async (req) => {
          const s = sessionOf(new URL(req.url).searchParams.get('session'));
          const playback = playbackOf(s.state.session);
          return json({ token: atlasSceneToken(playback), current: playback.path.at(-1) ?? null });
        }),
        POST: post(async (req) => {
          const body = await readBody(req);
          const s = sessionOf(body.session);
          const { key, version, visit } = body;
          if (typeof key !== 'string' || typeof version !== 'number' || typeof visit !== 'number' ||
            !Number.isSafeInteger(version) || !Number.isSafeInteger(visit))
            throw new BadRequest('장면 확인 정보가 올바르지 않습니다');
          await updateAtlas((record) => confirmAtlasScene(
            record, playbackOf(s.state.session), s.state.session, { key, version, visit }, body.view,
          ));
          return json({ ok: true });
        }),
      },
      '/api/atlas/checkpoint': {
        POST: post(async (req) => {
          const body = await readBody(req);
          const s = sessionOf(body.session);
          if (s.busy) return json({ error: '앞의 행동을 처리하는 중입니다' }, 409);
          const { key, version, visit } = body;
          if (typeof key !== 'string' || typeof version !== 'number' || typeof visit !== 'number' || !Number.isSafeInteger(version) || !Number.isSafeInteger(visit))
            throw new BadRequest('갈림길 정보가 올바르지 않습니다');
          const view = body.view;
          if (typeof view !== 'object' || view === null || JSON.stringify(view).length > MAX_VIEW_CHARS)
            throw new BadRequest('저장할 화면 상태가 올바르지 않습니다');
          s.busy = true;
          try {
            await updateAtlas((record) => {
              const attached = attachAtlasView(record, s.state, key, version, visit, packAtlasView(playbackOf(s.state.session), view));
              return { ...attached, checkpoints: attached.checkpoints?.map((point) =>
                point.key === key && !('viewpoint' in point) ? { ...point, viewpoint: viewpointOf(s.state.session).save() } : point) };
            });
            return json({ ok: true });
          } finally {
            s.busy = false;
          }
        }),
      },
      '/api/atlas/restart': {
        POST: post(async (req) => {
          const body = await readBody(req);
          if (typeof body.key !== 'string') throw new BadRequest('갈림길 정보가 올바르지 않습니다');
          const id = crypto.randomUUID();
          const record = await readAtlas();
          const restarted = restartAtlas(scenario, record, body.key, id, Date.now());
          const { state } = restarted;
          let { view } = restarted;
          const memo = typeof view === 'object' && view !== null && 'memo' in view && typeof view.memo === 'string' ? view.memo : '';
          const s: Session = { state, logged: 0, busy: false, memo };
          const step = engine.resume(state);
          const viewpoint = new ViewpointPlayback();
          const point = record.checkpoints?.find((entry) => entry.key === body.key) as { viewpoint?: SavedViewpoint } | undefined;
          if (point?.viewpoint) view = rotateViewFrames(view, viewpoint.restore(point.viewpoint, id));
          else if (view) view = forgetViewFrames(view);
          else viewpoint.legacy(state, step.events);
          viewpoints.set(id, viewpoint);
          playbacks.set(id, restoreAtlasPlayback(state, step.events, view));
          sessions.set(id, s);
          await persist(s);
          if (memo) await writeMemo(id, memo);
          await updateAtlas((record) => recordAtlas(prepareAtlasDisplay(record), state));
          return json({ session: id, step, view });
        }),
      },
      '/api/atlas/hint': {
        POST: post(async (req) => {
          const body = await readBody(req);
          let hint: { level: number; text: string } | undefined;
          await updateAtlas((record) => {
            const next = nextHint(scenario, record, typeof body.key === 'string' ? body.key : '');
            if (!next) return record;
            hint = { level: next.level, text: next.text };
            return next.record;
          });
          return hint ? json(hint) : json({ error: '없는 칸입니다' }, 400);
        }),
      },
      '/api/atlas/reset': {
        POST: post(async () => {
          await updateAtlas(() => emptyAtlas());
          return json({ ok: true });
        }),
      },
      '/api/result': {
        GET: handle(async (req) => {
          const s = sessionOf(new URL(req.url).searchParams.get('session'));
          // 같은 판의 갈림길 자동 저장이 있을 때만 '마지막 갈림길에서 다시'가 연다. 같은 시드로 새로 시작한 다른 판은 시작 시각이 다르다.
          const fork = await readSave(opts.savesDir, AUTO_FORK, scenario).catch(() => null);
          return json({ ...summarize(scenario, s.state), fork: fork !== null && fork.seed === s.state.seed && fork.startedAt === s.state.startedAt });
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
