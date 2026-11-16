import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBridge, type Bridge, type BridgeState } from './server.ts';

// The fake claude reads its behaviour from the system prompt ("MODE:<x> CONTROL:<url>") and
// reports to a control server, so every test awaits explicit events instead of timing.
const FAKE = `
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('9.9.9 (fake)'); process.exit(0); }
const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const system = get('--system-prompt') ?? '';
const mode = /MODE:(\\w+)/.exec(system)?.[1] ?? 'ok';
const control = /CONTROL:(\\S+)/.exec(system)?.[1];
const stdin = await new Response(Bun.stdin.stream()).text();
const model = get('--model');
if (control) await fetch(control + '/started?pid=' + process.pid);
if (mode === 'fail') { console.error('boom'); process.exit(3); }
if (mode === 'hang') {
  Bun.spawn([process.execPath, '-e', 'await fetch(' + JSON.stringify(control + '/hold') + ')'], { stdout: 'ignore' });
  await new Promise(() => {});
}
if (mode === 'gate') await fetch(control + '/gate');
const schemaArg = get('--json-schema');
const out = { type: 'result', subtype: 'success', is_error: false,
  result: schemaArg ? '' : 'plain:' + stdin,
  usage: { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 2, output_tokens: 7 },
  modelUsage: { ['claude-' + model + '-fake']: {} }, ttft_ms: 1 };
if (schemaArg) out.structured_output = { lines: [{ speaker: 'gm', text: stdin + '|' + args.includes('--safe-mode') }] };
const argsFile = /ARGS:(\\S+)/.exec(system)?.[1];
if (argsFile) appendFileSync(argsFile, JSON.stringify({ system, schema: schemaArg ?? null, stdin }) + '\\n');
const out1 = /OUT1:(\\S+)/.exec(system)?.[1];
if (out1) {
  const state = /STATE:(\\S+)/.exec(system)?.[1];
  const second = state !== undefined && existsSync(state);
  if (state && !second) writeFileSync(state, '1');
  const out2 = /OUT2:(\\S+)/.exec(system)?.[1] ?? out1;
  out.structured_output = JSON.parse(Buffer.from(second ? out2 : out1, 'base64').toString());
}
console.log(JSON.stringify(out));
`;

interface Control {
  url: string;
  started: number[];
  waitStarted(n: number): Promise<void>;
  releaseGates(): void;
  holdClosed: Promise<void>;
  stop(): void;
}

function startControl(): Control {
  const started: number[] = [];
  const startWaiters: { n: number; resolve: () => void }[] = [];
  const gates: (() => void)[] = [];
  let released = false;
  let holdClosedResolve!: () => void;
  const holdClosed = new Promise<void>((r) => (holdClosedResolve = r));
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 0,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === '/started') {
        started.push(Number(u.searchParams.get('pid')));
        for (const w of startWaiters.filter((w) => started.length >= w.n)) w.resolve();
        return new Response('ok');
      }
      if (u.pathname === '/gate') {
        if (released) return new Response('ok');
        return new Promise<Response>((resolve) => gates.push(() => resolve(new Response('ok'))));
      }
      if (u.pathname === '/hold') {
        req.signal.addEventListener('abort', () => holdClosedResolve());
        return new Promise<Response>(() => {});
      }
      return new Response('?', { status: 404 });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    started,
    waitStarted: (n) => (started.length >= n ? Promise.resolve() : new Promise((resolve) => startWaiters.push({ n, resolve }))),
    releaseGates: () => {
      released = true;
      for (const g of gates.splice(0)) g();
    },
    holdClosed,
    stop: () => server.stop(true),
  };
}

function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Error(`timeout waiting for ${what}`)), ms))),
  ]).finally(() => clearTimeout(timer));
}

function stateReached(b: Bridge, pred: (s: BridgeState) => boolean): Promise<BridgeState> {
  if (pred(b.state())) return Promise.resolve(b.state());
  return new Promise((resolve) => {
    const on = (e: Event) => {
      const s = (e as CustomEvent<BridgeState>).detail;
      if (pred(s)) {
        b.events.removeEventListener('state', on);
        resolve(s);
      }
    };
    b.events.addEventListener('state', on);
  });
}

// Mirrors LlmClient.chatJson's SSE loop (app/src/gm/llm.ts).
async function readLikeLlmClient(res: Response) {
  let text = '';
  let model: string | null = null;
  let last: { usage?: { prompt_tokens?: number; completion_tokens?: number }; timings?: { prompt_n?: number; predicted_n?: number } } = {};
  let buffer = '';
  let sawDone = false;
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        sawDone = true;
        continue;
      }
      const chunk = JSON.parse(data);
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') text += delta;
      if (chunk.model) model = chunk.model;
      if (chunk.timings || chunk.usage) last = { ...last, ...chunk };
    }
  }
  return {
    text,
    model,
    sawDone,
    promptTokens: last.timings?.prompt_n ?? last.usage?.prompt_tokens ?? null,
    completionTokens: last.timings?.predicted_n ?? last.usage?.completion_tokens ?? null,
  };
}

const SCHEMA = {
  type: 'object',
  properties: { lines: { type: 'array', items: { type: 'object', properties: { speaker: { type: 'string' }, text: { type: 'string' } }, required: ['speaker', 'text'] } } },
  required: ['lines'],
};

function gmBody(system: string, user: string, extra: Record<string, unknown> = {}) {
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
    top_p: 0.9,
    seed: 1,
    max_tokens: 400,
    stream: true,
    cache_prompt: true,
    response_format: { type: 'json_schema', json_schema: { name: 'gm_output', strict: true, schema: SCHEMA } },
    model: 'haiku',
    ...extra,
  };
}

const post = (b: Bridge, body: unknown) =>
  fetch(`${b.url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

let dir: string;
let fakeBin: string;
let control: Control;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'llm-bridge-test-'));
  await writeFile(join(dir, 'fake.mjs'), FAKE);
  fakeBin = join(dir, 'claude');
  await writeFile(fakeBin, `#!/bin/sh\nexec "${process.execPath}" "${join(dir, 'fake.mjs')}" "$@"\n`);
  await chmod(fakeBin, 0o755);
  control = startControl();
});

afterAll(async () => {
  control.stop();
  await rm(dir, { recursive: true, force: true });
});

describe('llm-bridge', () => {
  test('health ok with a runnable binary, 503 without', async () => {
    const good = startBridge({ port: 0, claudeBin: fakeBin });
    const bad = startBridge({ port: 0, claudeBin: join(dir, 'missing') });
    try {
      const r1 = await fetch(`${good.url}/health`);
      expect(r1.status).toBe(200);
      expect(await r1.json()).toEqual({ status: 'ok' });
      expect((await fetch(`${bad.url}/health`)).status).toBe(503);
    } finally {
      await good.stop();
      await bad.stop();
    }
  });

  test('models lists the three aliases', async () => {
    const b = startBridge({ port: 0, claudeBin: fakeBin });
    try {
      const body = (await (await fetch(`${b.url}/v1/models`)).json()) as { object: string; data: { id: string }[] };
      expect(body.object).toBe('list');
      expect(body.data.map((m) => m.id)).toEqual(['haiku', 'sonnet', 'opus']);
    } finally {
      await b.stop();
    }
  });

  test('streamed JSON completion parses like LlmClient', async () => {
    const b = startBridge({ port: 0, claudeBin: fakeBin });
    try {
      const res = await post(b, gmBody('시스템', '안녕'));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const out = await readLikeLlmClient(res);
      expect(out.sawDone).toBe(true);
      expect(JSON.parse(out.text)).toEqual({ lines: [{ speaker: 'gm', text: '안녕|true' }] });
      expect(out.model).toBe('claude-haiku-fake');
      expect(out.promptTokens).toBe(17);
      expect(out.completionTokens).toBe(7);
    } finally {
      await b.stop();
    }
  });

  test('non-stream completion and plain-text request', async () => {
    const b = startBridge({ port: 0, claudeBin: fakeBin });
    try {
      const res = await post(b, gmBody('s', 'x', { stream: false, model: 'opus' }));
      const body = (await res.json()) as { object: string; model: string; choices: { message: { content: string }; finish_reason: string }[] };
      expect(body.object).toBe('chat.completion');
      expect(body.model).toBe('claude-opus-fake');
      expect(JSON.parse(body.choices[0]!.message.content).lines[0].text).toBe('x|true');
      expect(body.choices[0]!.finish_reason).toBe('stop');

      const plain = await post(b, { messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'hi' }], model: 'sonnet', max_tokens: 50 });
      const pb = (await plain.json()) as { choices: { message: { content: string } }[] };
      expect(pb.choices[0]!.message.content).toBe('plain:hi');
    } finally {
      await b.stop();
    }
  });

  test('warm-up call (max_tokens 1, no model) is answered without spawning claude', async () => {
    const b = startBridge({ port: 0, claudeBin: join(dir, 'missing') });
    try {
      const res = await post(b, { messages: [{ role: 'system', content: 's' }, { role: 'user', content: '.' }], max_tokens: 1, temperature: 0, cache_prompt: true });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { choices: { finish_reason: string }[] };
      expect(body.choices[0]!.finish_reason).toBe('length');
    } finally {
      await b.stop();
    }
  });

  test('unknown model is 400', async () => {
    const b = startBridge({ port: 0, claudeBin: fakeBin });
    try {
      const res = await post(b, gmBody('s', 'u', { model: 'gpt-9' }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(400);
    } finally {
      await b.stop();
    }
  });

  test('CLI failure is 502', async () => {
    const b = startBridge({ port: 0, claudeBin: fakeBin });
    try {
      const res = await post(b, gmBody('MODE:fail', 'u'));
      expect(res.status).toBe(502);
    } finally {
      await b.stop();
    }
  });

  test('timeout kills the child process tree and returns 502', async () => {
    const b = startBridge({ port: 0, claudeBin: fakeBin, timeoutMs: 1500 });
    try {
      const before = control.started.length;
      const res = await within(post(b, gmBody(`MODE:hang CONTROL:${control.url}`, 'u')), 10_000, 'timeout response');
      expect(res.status).toBe(502);
      const pid = control.started[before]!;
      const ps = Bun.spawn(['ps', '-o', 'stat=', '-p', String(pid)], { stdout: 'pipe' });
      const stat = (await new Response(ps.stdout).text()).trim();
      expect(stat === '' || stat.startsWith('Z')).toBe(true);
      await within(control.holdClosed, 5000, 'grandchild to die');
    } finally {
      await b.stop();
    }
  });

  test('concurrency cap queues the third request', async () => {
    const b = startBridge({ port: 0, claudeBin: fakeBin, concurrency: 2 });
    try {
      const before = control.started.length;
      const reqs = [1, 2, 3].map((n) => post(b, gmBody(`MODE:gate CONTROL:${control.url}`, `r${n}`)));
      await within(stateReached(b, (s) => s.running === 2 && s.queued === 1), 5000, 'two running, one queued');
      await within(control.waitStarted(before + 2), 5000, 'two fakes started');
      expect(control.started.length - before).toBe(2);
      control.releaseGates();
      const results = await within(Promise.all(reqs), 10_000, 'all requests');
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(control.started.length - before).toBe(3);
      expect(b.state()).toEqual({ running: 0, queued: 0 });
    } finally {
      await b.stop();
    }
  });
});

const line = (speaker: string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['speaker', 'text'],
  properties: { speaker: { type: 'string', enum: speaker }, text: { type: 'string' } },
});
const TUPLE = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: { lines: { type: 'array', prefixItems: [line(['A']), line(['B']), line(['A', 'B']), line(['A', 'B'])], items: false, minItems: 2 } },
};
const GOOD = { lines: [{ speaker: 'A', text: 'x' }, { speaker: 'B', text: 'y' }] };
const SWAPPED = { lines: [{ speaker: 'B', text: 'y' }, { speaker: 'A', text: 'x' }] };
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64');

interface FakeCall {
  system: string;
  schema: string | null;
  stdin: string;
}

async function fakeCalls(file: string): Promise<FakeCall[]> {
  const raw = await Bun.file(file).text();
  return raw.trim().split('\n').map((l) => JSON.parse(l) as FakeCall);
}

function logFields(lines: string[]): Record<string, string>[] {
  return lines.map((l) => Object.fromEntries(l.split(' ').slice(1).map((kv) => kv.split('=') as [string, string])));
}

describe('schema translation through the bridge', () => {
  test('prefixItems schema reaches the CLI as anyOf with a positional instruction', async () => {
    const logs: string[] = [];
    const b = startBridge({ port: 0, claudeBin: fakeBin, log: (l) => logs.push(l) });
    const argsFile = join(dir, 'args-translate.jsonl');
    const system = `ARGS:${argsFile} OUT1:${b64(GOOD)}`;
    const original = structuredClone(TUPLE);
    try {
      const res = await post(b, gmBody(system, 'u', { stream: false, response_format: { type: 'json_schema', json_schema: { name: 'g', strict: true, schema: TUPLE } } }));
      expect(res.status).toBe(200);
      const calls = await fakeCalls(argsFile);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.schema).not.toContain('prefixItems');
      expect(calls[0]!.system.startsWith(system)).toBe(true);
      expect(calls[0]!.system.length).toBeGreaterThan(system.length);
      expect(calls[0]!.system).toContain('$.lines');
      expect(TUPLE).toEqual(original);
      expect(logFields(logs)[0]).toMatchObject({ model: 'haiku', status: '200', retried: 'no', in: '17', out: '7' });
    } finally {
      await b.stop();
    }
  });

  test('schema without prefixItems passes the system prompt unchanged', async () => {
    const b = startBridge({ port: 0, claudeBin: fakeBin, log: () => {} });
    const argsFile = join(dir, 'args-plain.jsonl');
    const system = `ARGS:${argsFile}`;
    try {
      expect((await post(b, gmBody(system, 'u'))).status).toBe(200);
      const calls = await fakeCalls(argsFile);
      expect(calls[0]!.system).toBe(system);
      expect(JSON.parse(calls[0]!.schema!)).toEqual(SCHEMA);
    } finally {
      await b.stop();
    }
  });

  test('positional mismatch is retried once with the error and then succeeds', async () => {
    const logs: string[] = [];
    const b = startBridge({ port: 0, claudeBin: fakeBin, log: (l) => logs.push(l) });
    const argsFile = join(dir, 'args-retry.jsonl');
    const system = `ARGS:${argsFile} STATE:${join(dir, 'state-retry')} OUT1:${b64(SWAPPED)} OUT2:${b64(GOOD)}`;
    try {
      const res = await post(b, gmBody(system, 'u', { response_format: { type: 'json_schema', json_schema: { name: 'g', strict: true, schema: TUPLE } } }));
      expect(res.status).toBe(200);
      const out = await readLikeLlmClient(res);
      expect(JSON.parse(out.text)).toEqual(GOOD);
      expect(out.promptTokens).toBe(34);
      const calls = await fakeCalls(argsFile);
      expect(calls).toHaveLength(2);
      expect(calls[1]!.stdin.startsWith('u')).toBe(true);
      expect(calls[1]!.stdin).toContain('$.lines[0]');
      expect(logFields(logs)[0]).toMatchObject({ status: '200', retried: 'yes', in: '34', out: '14' });
    } finally {
      await b.stop();
    }
  });

  test('mismatch on both attempts is 502 with the failing path', async () => {
    const logs: string[] = [];
    const b = startBridge({ port: 0, claudeBin: fakeBin, log: (l) => logs.push(l) });
    const argsFile = join(dir, 'args-fail.jsonl');
    const system = `ARGS:${argsFile} STATE:${join(dir, 'state-fail')} OUT1:${b64(SWAPPED)} OUT2:${b64(SWAPPED)}`;
    try {
      const res = await post(b, gmBody(system, 'u', { response_format: { type: 'json_schema', json_schema: { name: 'g', strict: true, schema: TUPLE } } }));
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message.startsWith('schema mismatch: $.lines[0]')).toBe(true);
      expect(await fakeCalls(argsFile)).toHaveLength(2);
      expect(logFields(logs)[0]).toMatchObject({ status: '502', retried: 'yes' });
    } finally {
      await b.stop();
    }
  });
});
