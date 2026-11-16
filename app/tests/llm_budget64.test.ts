import { expect, onTestFinished, test } from 'bun:test';
import { ContextBudgetError, LlmClient, LlmError } from '../src/gm/llm.ts';

const request = {
  system: '분류 규칙\n<특수 토큰>',
  user: '질문인가요?\n"그대로"',
  schema: { type: 'object', properties: { answer: { type: 'boolean' } } },
  temperature: 0.17,
  seed: 6417,
  maxTokens: 8,
  reserveContext: true,
};
const kwargs = { enable_thinking: false, custom: '원문' };
const completionBody = {
  messages: [
    { role: 'system', content: request.system },
    { role: 'user', content: request.user },
  ],
  temperature: 0.17,
  top_p: 0.9,
  seed: 6417,
  max_tokens: 8,
  stream: true,
  cache_prompt: true,
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'gm_output', strict: true, schema: request.schema },
  },
  chat_template_kwargs: kwargs,
};

interface Fault {
  readonly path: string;
  readonly body?: unknown;
  readonly status?: number;
  readonly raw?: string;
}

function mockLlama(options: { readonly capacity?: number; readonly promptTokens?: number; readonly fault?: Fault } = {}) {
  const calls: { readonly path: string; readonly method: string; readonly body: unknown }[] = [];
  let capacity = options.capacity ?? 32;
  const prompt = '<bos>시스템\n사용자\n<assistant>';
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      calls.push({ path, method: req.method, body: req.method === 'POST' ? await req.json() : null });
      if (options.fault?.path === path) {
        return options.fault.raw !== undefined
          ? new Response(options.fault.raw, { status: options.fault.status ?? 200 })
          : Response.json(options.fault.body ?? null, { status: options.fault.status ?? 200 });
      }
      switch (path) {
        case '/props':
          return Response.json({ default_generation_settings: { n_ctx: capacity }, total_slots: 4 });
        case '/apply-template':
          return Response.json({ prompt });
        case '/tokenize':
          return Response.json({ tokens: Array.from({ length: options.promptTokens ?? 24 }, (_, i) => i + 1) });
        case '/v1/chat/completions':
          return new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content: '{"answer":true}' } }], usage: { prompt_tokens: 24, completion_tokens: 5 } })}\n\ndata: [DONE]\n\n`,
            { headers: { 'content-type': 'text/event-stream' } },
          );
        default:
          return new Response('없는 경로', { status: 404 });
      }
    },
  });
  onTestFinished(() => server.stop(true));
  const client = new LlmClient({
    baseUrl: `http://127.0.0.1:${server.port}`,
    timeoutMs: 1000,
    chatTemplateKwargs: kwargs,
  });
  return { client, calls, prompt, server, setCapacity(value: number) { capacity = value; } };
}

test('입력과 출력 예약량이 슬롯 용량과 정확히 같으면 생성한다', async () => {
  const mock = mockLlama();
  const result = await mock.client.chatJson(request);
  expect(result.text).toBe('{"answer":true}');
  expect(mock.calls.map(c => [c.method, c.path])).toEqual([
    ['GET', '/props'],
    ['POST', '/apply-template'],
    ['POST', '/tokenize'],
    ['POST', '/v1/chat/completions'],
  ]);
});

test('출력 예약량을 합쳐 한 토큰 초과하면 수치가 있는 재시도 불가 오류로 생성을 막는다', async () => {
  const mock = mockLlama({ promptTokens: 25 });
  const error: unknown = await mock.client.chatJson(request).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(LlmError);
  expect(error).toBeInstanceOf(ContextBudgetError);
  expect(error).toMatchObject({
    name: 'ContextBudgetError', retryable: false, contextTokens: 32, promptTokens: 25, outputTokens: 8,
  });
  expect(mock.calls.map(c => c.path)).toEqual(['/props', '/apply-template', '/tokenize']);
});

test('템플릿 메시지와 옵션 및 생성 본문과 난수 설정을 그대로 보존한다', async () => {
  const mock = mockLlama();
  await mock.client.chatJson(request);
  expect(mock.calls.find(c => c.path === '/apply-template')?.body).toEqual(completionBody);
  expect(mock.calls.find(c => c.path === '/v1/chat/completions')?.body).toEqual(completionBody);
  expect(request.maxTokens).toBe(8);
});

test('반환된 프롬프트에 BOS 추가와 특수 토큰 해석을 모두 켠다', async () => {
  const mock = mockLlama();
  await mock.client.chatJson(request);
  expect(mock.calls.find(c => c.path === '/tokenize')?.body).toEqual({
    content: mock.prompt, add_special: true, parse_special: true,
  });
});

test('8192보다 큰 실제 슬롯 용량을 사용한다', async () => {
  const mock = mockLlama({ capacity: 10000, promptTokens: 9992 });
  await mock.client.chatJson(request);
  expect(mock.calls.filter(c => c.path === '/v1/chat/completions')).toHaveLength(1);
});

test('같은 클라이언트에서도 매 요청마다 서버 용량을 새로 확인한다', async () => {
  const mock = mockLlama();
  await mock.client.chatJson(request);
  mock.setCapacity(31);
  const error: unknown = await mock.client.chatJson(request).catch((err: unknown) => err);
  expect(error).toMatchObject({ name: 'ContextBudgetError', contextTokens: 31, outputTokens: 8 });
  expect(mock.calls.filter(c => c.path === '/props')).toHaveLength(2);
  expect(mock.calls.filter(c => c.path === '/v1/chat/completions')).toHaveLength(1);
});

const invalidReplies: readonly (readonly [string, Fault])[] = [
  ['서버 속성 누락', { path: '/props', body: {} }],
  ['서버 속성 null', { path: '/props', body: null }],
  ['슬롯 설정 누락', { path: '/props', body: { default_generation_settings: {} } }],
  ['문자열 용량', { path: '/props', body: { default_generation_settings: { n_ctx: '32' } } }],
  ['영 용량', { path: '/props', body: { default_generation_settings: { n_ctx: 0 } } }],
  ['음수 용량', { path: '/props', body: { default_generation_settings: { n_ctx: -1 } } }],
  ['소수 용량', { path: '/props', body: { default_generation_settings: { n_ctx: 32.5 } } }],
  ['프롬프트 누락', { path: '/apply-template', body: {} }],
  ['문자열 아닌 프롬프트', { path: '/apply-template', body: { prompt: 42 } }],
  ['빈 프롬프트', { path: '/apply-template', body: { prompt: '' } }],
  ['토큰 누락', { path: '/tokenize', body: {} }],
  ['배열 아닌 토큰', { path: '/tokenize', body: { tokens: 24 } }],
  ['빈 토큰', { path: '/tokenize', body: { tokens: [] } }],
  ['잘못된 토큰 원소', { path: '/tokenize', body: { tokens: [1, '2'] } }],
  ['음수 토큰 원소', { path: '/tokenize', body: { tokens: [-1] } }],
  ['객체 토큰 원소', { path: '/tokenize', body: { tokens: [{ id: 1, piece: 'a' }] } }],
  ...['/props', '/apply-template', '/tokenize'].flatMap(path => [
    [`${path} 사용 불가`, { path, status: 503 }],
    [`${path} JSON 손상`, { path, raw: '{' }],
  ] satisfies readonly (readonly [string, Fault])[]),
];

test.each(invalidReplies)('%s이면 재시도 없이 생성 전에 중단한다', async (_name, fault) => {
  const mock = mockLlama({ fault });
  const error: unknown = await mock.client.chatJson(request).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(LlmError);
  expect(error).toMatchObject({ name: 'LlmError', retryable: false });
  expect(mock.calls.map(c => c.path)).toEqual(
    ['/props', '/apply-template', '/tokenize'].slice(0, ['/props', '/apply-template', '/tokenize'].indexOf(fault.path) + 1),
  );
});

test('사전 검사 서버 연결이 끊기면 재시도 불가 오류로 중단한다', async () => {
  const mock = mockLlama();
  await mock.server.stop(true);
  const error: unknown = await mock.client.chatJson(request).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(LlmError);
  expect(error).toMatchObject({ retryable: false });
  expect(mock.calls).toEqual([]);
});

test.each([0, -1, 1.5, NaN, Infinity])('출력 예약량 %s은 유효한 양의 정수가 아니므로 생성하지 않는다', async maxTokens => {
  const mock = mockLlama();
  const error: unknown = await mock.client.chatJson({ ...request, maxTokens }).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(LlmError);
  expect(error).toMatchObject({ retryable: false });
  expect(mock.calls.filter(c => c.path === '/v1/chat/completions')).toHaveLength(0);
});

test.each([undefined, false])('예약 옵션 %s인 기존 요청은 사전 검사 없이 기존 본문으로만 전송한다', async reserveContext => {
  const mock = mockLlama({ fault: { path: '/props', status: 503 } });
  const result = await mock.client.chatJson({ ...request, reserveContext });
  expect(result.text).toBe('{"answer":true}');
  expect(mock.calls).toEqual([{ path: '/v1/chat/completions', method: 'POST', body: completionBody }]);
  expect(result.promptTokens).toBe(24);
  expect(result.completionTokens).toBe(5);
});

test('템플릿 옵션이 없으면 사전 검사와 생성에서 모두 생략한다', async () => {
  const mock = mockLlama();
  const client = new LlmClient({ baseUrl: `http://127.0.0.1:${mock.server.port}`, timeoutMs: 1000 });
  await client.chatJson(request);
  const { chat_template_kwargs, ...withoutKwargs } = completionBody;
  expect(mock.calls.find(c => c.path === '/apply-template')?.body).toEqual(withoutKwargs);
  expect(mock.calls.find(c => c.path === '/v1/chat/completions')?.body).toEqual(withoutKwargs);
});
