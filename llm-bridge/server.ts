import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { positionalInstruction, translateForCli, validate } from './schema.ts';

export const MODELS = ['haiku', 'sonnet', 'opus'] as const;
type ModelAlias = (typeof MODELS)[number];

export interface BridgeOptions {
  port?: number;
  claudeBin?: string;
  timeoutMs?: number;
  concurrency?: number;
  defaultModel?: ModelAlias;
  log?: (line: string) => void;
}

export interface BridgeState {
  running: number;
  queued: number;
}

export interface Bridge {
  port: number;
  url: string;
  state(): BridgeState;
  events: EventTarget;
  stop(): Promise<void>;
}

interface ChatMessage {
  role: string;
  content: unknown;
}

interface ChatBody {
  model?: unknown;
  messages?: unknown;
  max_tokens?: unknown;
  stream?: unknown;
  response_format?: { type?: unknown; json_schema?: { schema?: unknown } };
}

interface CliUsage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

interface CliResult {
  is_error?: boolean;
  subtype?: string;
  result?: unknown;
  structured_output?: unknown;
  usage?: CliUsage;
  modelUsage?: Record<string, unknown>;
  ttft_ms?: number;
}

interface Completion {
  text: string;
  structured: unknown;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  wallMs: number;
  ttftMs: number | null;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_BIN = '/Users/choeminju/.local/bin/claude';
const STDERR_LIMIT = 200;

// Drops ANTHROPIC_API_KEY so the child always bills the logged-in subscription, never an API key.
function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k === 'ANTHROPIC_API_KEY' || k === 'CLAUDECODE' || k.startsWith('CLAUDE_AGENT_SDK') || k === 'CLAUDE_CODE_ENTRYPOINT') continue;
    env[k] = v;
  }
  return env;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

export function buildCliArgs(model: ModelAlias, system: string, schema: object | null): string[] {
  const args = [
    '-p',
    '--model', model,
    '--output-format', 'json',
    '--system-prompt', system,
    '--tools', '',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--disable-slash-commands',
    '--setting-sources', '',
    '--safe-mode',
    '--no-session-persistence',
  ];
  if (schema !== null) args.push('--json-schema', JSON.stringify(schema));
  return args;
}

class Limiter {
  running = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(
    private readonly max: number,
    private readonly onChange: () => void,
  ) {}
  get queued(): number {
    return this.waiting.length;
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
        this.onChange();
      });
    } else {
      this.running++;
      this.onChange();
    }
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
      this.onChange();
    }
  }
}

async function runClaude(bin: string, timeoutMs: number, model: ModelAlias, system: string, user: string, schema: object | null): Promise<Completion> {
  const cwd = await mkdtemp(join(tmpdir(), 'llm-bridge-'));
  const started = performance.now();
  try {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn([bin, ...buildCliArgs(model, system, schema)], {
        cwd,
        env: childEnv(),
        stdin: new TextEncoder().encode(user),
        stdout: 'pipe',
        stderr: 'pipe',
        detached: true, // own process group, so a timeout can kill the whole tree
      });
    } catch (err) {
      throw new HttpError(502, `claude 실행 실패: ${(err as Error).message.slice(0, STDERR_LIMIT)}`);
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch {
        proc.kill('SIGKILL');
      }
    }, timeoutMs);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
      proc.exited,
    ]).finally(() => clearTimeout(timer));
    const wallMs = Math.round(performance.now() - started);
    if (timedOut) throw new HttpError(502, `claude 시간 초과 (${timeoutMs}ms)`);

    let parsed: CliResult | null = null;
    try {
      parsed = JSON.parse(stdout) as CliResult;
    } catch {
      parsed = null;
    }
    if (code !== 0 || parsed === null || parsed.is_error === true) {
      const reason = parsed?.subtype ?? (stderr.trim().split('\n')[0] ?? '').slice(0, STDERR_LIMIT);
      throw new HttpError(502, `claude 실패 (exit ${code}${reason ? `: ${reason}` : ''})`);
    }

    let text: string;
    if (schema !== null) {
      if (parsed.structured_output === undefined || parsed.structured_output === null) {
        throw new HttpError(502, 'claude 가 구조화 출력을 내지 않았습니다');
      }
      text = JSON.stringify(parsed.structured_output);
    } else {
      text = typeof parsed.result === 'string' ? parsed.result : '';
    }
    const u = parsed.usage;
    const promptTokens = u && typeof u.input_tokens === 'number'
      ? u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
      : null;
    const models = parsed.modelUsage ? Object.keys(parsed.modelUsage) : [];
    return {
      text,
      structured: parsed.structured_output ?? null,
      model: models[0] ?? null,
      promptTokens,
      completionTokens: typeof u?.output_tokens === 'number' ? u.output_tokens : null,
      wallMs,
      ttftMs: typeof parsed.ttft_ms === 'number' ? parsed.ttft_ms : null,
    };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function errorResponse(status: number, message: string): Response {
  return json(status, { error: { message, type: status === 400 ? 'invalid_request_error' : 'server_error', code: status } });
}

function usageOf(c: Completion) {
  return {
    prompt_tokens: c.promptTokens,
    completion_tokens: c.completionTokens,
    total_tokens: c.promptTokens !== null && c.completionTokens !== null ? c.promptTokens + c.completionTokens : null,
  };
}

function completionResponse(c: Completion, alias: ModelAlias, stream: boolean, retried: boolean): Response {
  const id = `chatcmpl-bridge-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = c.model ?? alias;
  const bridge = { wall_ms: c.wallMs, ttft_ms: c.ttftMs, retried };
  if (!stream) {
    return json(200, {
      id, object: 'chat.completion', created, model,
      choices: [{ index: 0, message: { role: 'assistant', content: c.text }, finish_reason: 'stop' }],
      usage: usageOf(c),
      bridge,
    });
  }
  const base = { id, object: 'chat.completion.chunk', created, model };
  const events = [
    { ...base, choices: [{ index: 0, delta: { role: 'assistant', content: c.text }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: usageOf(c), bridge },
  ];
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
}

export function startBridge(opts: BridgeOptions = {}): Bridge {
  const bin = opts.claudeBin ?? process.env.BRIDGE_CLAUDE_BIN ?? DEFAULT_BIN;
  const timeoutMs = opts.timeoutMs ?? Number(process.env.BRIDGE_TIMEOUT_MS ?? 80_000);
  const concurrency = opts.concurrency ?? Number(process.env.BRIDGE_CONCURRENCY ?? 2);
  const defaultModel = opts.defaultModel ?? 'haiku';
  const events = new EventTarget();
  const limiter: Limiter = new Limiter(concurrency, () => {
    events.dispatchEvent(new CustomEvent<BridgeState>('state', { detail: { running: limiter.running, queued: limiter.queued } }));
  });
  let healthCache: { ok: boolean; at: number } | null = null;

  async function healthy(): Promise<boolean> {
    if (healthCache && Date.now() - healthCache.at < 30_000) return healthCache.ok;
    let ok = false;
    try {
      const proc = Bun.spawn([bin, '--version'], { env: childEnv(), stdout: 'ignore', stderr: 'ignore', timeout: 5000 });
      ok = (await proc.exited) === 0;
    } catch {
      ok = false;
    }
    healthCache = { ok, at: Date.now() };
    return ok;
  }

  const log = opts.log ?? ((line: string) => console.log(line));

  interface RequestLog {
    model: string | null;
    calls: Completion[];
    retried: boolean;
  }

  async function chat(req: Request): Promise<Response> {
    const started = performance.now();
    const ctx: RequestLog = { model: null, calls: [], retried: false };
    const res = await chatInner(req, ctx);
    const sum = (pick: (c: Completion) => number | null) =>
      ctx.calls.length > 0 && ctx.calls.every((c) => pick(c) !== null) ? ctx.calls.reduce((a, c) => a + (pick(c) ?? 0), 0) : null;
    const resolved = ctx.calls.find((c) => c.model !== null)?.model ?? null;
    log([
      new Date().toISOString(),
      `model=${ctx.model ?? '-'}`,
      `id=${resolved ?? '-'}`,
      `status=${res.status}`,
      `wall=${Math.round(performance.now() - started)}ms`,
      `in=${sum((c) => c.promptTokens) ?? '-'}`,
      `out=${sum((c) => c.completionTokens) ?? '-'}`,
      `retried=${ctx.retried ? 'yes' : 'no'}`,
    ].join(' '));
    return res;
  }

  async function complete(model: ModelAlias, system: string, user: string, schema: object | null, ctx: RequestLog): Promise<Completion> {
    const deadline = Date.now() + timeoutMs;
    const cli = schema === null ? null : translateForCli(schema);
    const cliSchema = cli === null ? null : (cli.schema as object);
    const cliSystem = cli !== null && cli.rewrites.length > 0 ? `${system}\n\n${positionalInstruction(cli.rewrites)}` : system;
    const first = await runClaude(bin, timeoutMs, model, cliSystem, user, cliSchema);
    ctx.calls.push(first);
    if (schema === null) return first;
    let error = validate(schema, first.structured);
    if (error === null) return first;
    const remaining = deadline - Date.now();
    if (remaining < 1000) throw new HttpError(502, `schema mismatch: ${error.path}: ${error.reason}`);
    ctx.retried = true;
    const retryUser = `${user}\n\n[Previous output rejected by the schema] ${error.path}: ${error.reason}. Produce the whole output again with this fixed.`;
    const second = await runClaude(bin, remaining, model, cliSystem, retryUser, cliSchema);
    ctx.calls.push(second);
    error = validate(schema, second.structured);
    if (error !== null) throw new HttpError(502, `schema mismatch: ${error.path}: ${error.reason}`);
    const add = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
    return {
      ...second,
      promptTokens: add(first.promptTokens, second.promptTokens),
      completionTokens: add(first.completionTokens, second.completionTokens),
      wallMs: first.wallMs + second.wallMs,
    };
  }

  async function chatInner(req: Request, ctx: RequestLog): Promise<Response> {
    let body: ChatBody;
    try {
      body = (await req.json()) as ChatBody;
    } catch {
      return errorResponse(400, 'JSON 본문이 아닙니다');
    }
    if (body === null || typeof body !== 'object' || !Array.isArray(body.messages)) return errorResponse(400, 'messages 배열이 필요합니다');
    const model = body.model === undefined ? defaultModel : body.model;
    if (typeof model !== 'string' || !(MODELS as readonly string[]).includes(model)) {
      return errorResponse(400, `알 수 없는 모델: ${String(model).slice(0, 40)} (가능: ${MODELS.join(', ')})`);
    }
    ctx.model = model;
    const messages = body.messages as ChatMessage[];
    const system = messages.filter((m) => m?.role === 'system').map((m) => textOf(m.content)).join('\n\n');
    const user = messages.filter((m) => m?.role === 'user').map((m) => textOf(m.content)).join('\n\n');
    if (user.length === 0) return errorResponse(400, 'user 메시지가 필요합니다');
    const rf = body.response_format;
    let schema: object | null = null;
    if (rf && rf.type === 'json_schema') {
      const s = rf.json_schema?.schema;
      if (typeof s !== 'object' || s === null) return errorResponse(400, 'response_format.json_schema.schema 가 필요합니다');
      schema = s;
    }
    // LlmClient.warm(): max_tokens 1, no schema, response ignored. It only primes llama's KV cache,
    // which has no Claude equivalent, so answer locally instead of spending a real call.
    if (schema === null && body.max_tokens === 1) {
      return json(200, {
        id: `chatcmpl-bridge-${crypto.randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'length' }],
        usage: null,
        bridge: { skipped: 'warm' },
      });
    }
    try {
      const c = await limiter.run(() => complete(model as ModelAlias, system, user, schema, ctx));
      return completionResponse(c, model as ModelAlias, body.stream === true, ctx.retried);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err.status, err.message);
      return errorResponse(502, `브리지 오류: ${(err as Error).message.slice(0, STDERR_LIMIT)}`);
    }
  }

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port ?? 18090,
    idleTimeout: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (req.method === 'GET' && pathname === '/health') {
        return (await healthy()) ? json(200, { status: 'ok' }) : json(503, { status: 'error', error: 'claude 실행 불가' });
      }
      if (req.method === 'GET' && pathname === '/v1/models') {
        return json(200, { object: 'list', data: MODELS.map((id) => ({ id, object: 'model', owned_by: 'anthropic' })) });
      }
      if (req.method === 'POST' && pathname === '/v1/chat/completions') return chat(req);
      return errorResponse(404, `없는 경로: ${req.method} ${pathname}`);
    },
  });

  return {
    port: server.port as number,
    url: `http://127.0.0.1:${server.port}`,
    state: () => ({ running: limiter.running, queued: limiter.queued }),
    events,
    stop: async () => {
      await server.stop(true);
    },
  };
}

if (import.meta.main) {
  const i = process.argv.indexOf('--port');
  const port = i >= 0 ? Number(process.argv[i + 1]) : 18090;
  if (!Number.isInteger(port) || port <= 0) {
    console.error('사용법: bun llm-bridge/server.ts --port <n>');
    process.exit(2);
  }
  const b = startBridge({ port });
  console.log(`llm-bridge listening on ${b.url}`);
}
