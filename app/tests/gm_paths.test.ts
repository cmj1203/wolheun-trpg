import { afterAll, describe, expect, test } from 'bun:test';
import { Engine, type GmContext, type NarrateContext } from '../src/engine/engine.ts';
import type { Scenario } from '../src/engine/types.ts';
import { DEFAULT_GM_OPTIONS, LocalGm, type GmOptions } from '../src/gm/gm.ts';
import { LlmClient, LlmError } from '../src/gm/llm.ts';
import { LoreError, parseLore, withNotes } from '../src/gm/lore.ts';
import { buildSystem, interpretSchema, linesSchema } from '../src/gm/prompt.ts';
import { isLoreQuestion, ruleInterpret } from '../src/gm/rules.ts';
import { feedbackFor, mentions, parseGmJson, validateOutput, type CheckOptions, type Violation } from '../src/gm/validate.ts';
import { FakeGm, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

interface ChatBody {
  stream?: boolean;
  seed?: number;
  max_tokens?: number;
  chat_template_kwargs?: Record<string, unknown>;
  response_format?: { json_schema?: { strict?: boolean; schema?: unknown } };
  messages: { role: string; content: string }[];
}

/** 가짜 llama-server 의 한 번 답: 모델 글(JSON 문자열), HTTP 오류, 그대로 보낼 SSE, 끝나지 않는 스트림, 답하지 않음. */
type Reply = string | { status: number } | { raw: string } | { hang: 'stream' | 'headers' };

const servers: { stop: (force?: boolean) => unknown }[] = [];
afterAll(async () => {
  for (const s of servers) void s.stop(true);
});

function sse(text: string): string {
  const cut = Math.floor(text.length / 2);
  const chunks = [text.slice(0, cut), text.slice(cut)].map((c) => ({ model: 'mock-gm', choices: [{ delta: { content: c } }] }));
  const done = { choices: [{ delta: {}, finish_reason: 'stop' }], timings: { prompt_n: 12, prompt_ms: 3, predicted_n: 8, predicted_ms: 4 } };
  return [...chunks, done].map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
}

function mockLlama(outputs: Reply[], opts: { health?: number } = {}) {
  const requests: ChatBody[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === '/health') return new Response(JSON.stringify({ status: 'x' }), { status: opts.health ?? 200 });
      if (pathname === '/v1/models') return Response.json({ data: [{ id: 'mock-gm' }] });
      const body = (await req.json()) as ChatBody;
      requests.push(body);
      const queued = outputs.shift() ?? '{"lines":[]}';
      if (typeof queued === 'string') return new Response(sse(queued), { headers: { 'content-type': 'text/event-stream' } });
      if ('status' in queued) return new Response('{"error":"mock"}', { status: queued.status });
      if ('raw' in queued) return new Response(queued.raw, { headers: { 'content-type': 'text/event-stream' } });
      // 머리를 보내지 않는다. 클라이언트가 시간 상한을 지키지 않을 때 테스트가 멈추지 않게 결국은 빈 답으로 끝낸다.
      if (queued.hang === 'headers') return new Promise<Response>((resolve) => setTimeout(() => resolve(new Response('', { status: 200 })), 800));
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '{' } }] })}\n\n`));
        },
      });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  servers.push(server);
  return { server, requests, url: `http://127.0.0.1:${server.port}` };
}

const FAST: GmOptions = { ...DEFAULT_GM_OPTIONS, budgetMs: 60_000 };
const gmAt = (url: string, opts: GmOptions = FAST, kwargs?: Record<string, unknown>) =>
  new LocalGm(new LlmClient({ baseUrl: url, timeoutMs: 5000, ...(kwargs ? { chatTemplateKwargs: kwargs } : {}) }), lore, opts);

function contexts(text: string, beatId = 'b05_why', patch: { flags?: Record<string, boolean>; items?: string[] } = {}) {
  const { state: fresh } = new Engine(scenario, new FakeGm()).newGame(1, 'gm-paths');
  const state = { ...fresh, flags: { ...fresh.flags, ...(patch.flags ?? {}) }, ...(patch.items ? { items: patch.items } : {}) };
  const beat = scenario.beats[beatId];
  const free = beat?.free;
  if (!beat || !free) throw new Error(`${beatId} 구성이 바뀌었습니다`);
  const ctx: GmContext = { scenario, beat, free, state, text };
  const approach = free.approaches.find((a) => a.id === 'plead') ?? free.approaches[0];
  if (!approach) throw new Error('행동이 없습니다');
  const roll = { label: approach.label, stat: approach.stat, statValue: 2, mods: [], dice: [5, 5] as [number, number], total: 12, tier: 'hit' as const };
  const narrate: NarrateContext = { ...ctx, approach, roll, outcome: { ...approach.outcomes.hit, gist: '칼끝이 조금 물러난다.' } };
  return { ctx, narrate };
}

const FACED = new Set(['아시나', '속마음', '남자']);
const lines = (...xs: [string, string][]) => JSON.stringify({ lines: xs.map(([speaker, text]) => ({ speaker, text, ...(FACED.has(speaker) ? { face: 'neutral' } : {}) })) });
const GOOD = lines(['나레이션', '칼끝이 손가락 한 마디만큼 물러났다.'], ['남자', '거짓은 아닌 모양이군.']);
const reading = (fields: Record<string, unknown>) => JSON.stringify({ reason: '근거', kind: 'person', about: 'none', risk: 'none', approach: 'none', item: '', odd: false, absurd: false, bold: false, deed: '', stat: '재치', difficulty: '보통', ...fields });

const checkFor = (speakers: string[], extra: Partial<CheckOptions> = {}): CheckOptions => ({
  speakers,
  maxLines: 4,
  maxChars: 80,
  cast: scenario.cast,
  lore,
  stateGuard: [],
  echoOnly: [],
  outcomeForbid: [],
  playerText: '',
  reserved: [],
  gist: '',
  playerLore: '아시나',
  ...extra,
});
const rulesOf = (vs: readonly Violation[]) => vs.map((v) => v.rule);

/** 스키마 어디에든 나오는 speaker enum 을 모은다. */
function speakerEnums(schema: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const sp = (o.properties as { speaker?: { enum?: string[] } } | undefined)?.speaker?.enum;
      if (sp) out.push(...sp);
      Object.values(o).forEach(walk);
    }
  };
  walk(schema);
  return out;
}

async function refusedUrl(): Promise<string> {
  const s = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('x') });
  const url = `http://127.0.0.1:${s.port}`;
  await s.stop(true);
  return url;
}

const REQ = { system: 's', user: 'u', schema: { type: 'object' }, temperature: 0, seed: 1, maxTokens: 8 };

async function llmErrorOf(p: Promise<unknown>): Promise<LlmError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof LlmError) return err;
    throw err;
  }
  throw new Error('LlmError 가 나지 않았습니다');
}

describe('LLM 클라이언트 오류의 재시도 여부', () => {
  test('HTTP 400 은 다시 해도 소용없는 오류, 503 은 다시 할 오류로 본다', async () => {
    const mock = mockLlama([{ status: 400 }, { status: 503 }]);
    const client = new LlmClient({ baseUrl: mock.url, timeoutMs: 2000 });
    expect((await llmErrorOf(client.chatJson(REQ))).retryable).toBe(false);
    expect((await llmErrorOf(client.chatJson(REQ))).retryable).toBe(true);
  });

  test('서버에 연결하지 못하면 다시 하지 않을 오류다', async () => {
    const client = new LlmClient({ baseUrl: await refusedUrl(), timeoutMs: 2000 });
    expect((await llmErrorOf(client.chatJson(REQ))).retryable).toBe(false);
  });

  test('스트림이 시간 상한에 끊기면 다시 하지 않고, 조각을 못 읽으면 다시 한다', async () => {
    const mock = mockLlama([{ hang: 'stream' }, { raw: 'data: {깨진 조각\n\n' }]);
    const client = new LlmClient({ baseUrl: mock.url, timeoutMs: 150 });
    expect((await llmErrorOf(client.chatJson(REQ))).retryable).toBe(false);
    expect((await llmErrorOf(client.chatJson(REQ))).retryable).toBe(true);
  }, 2000);

  test('응답 머리가 오지 않으면 시간 상한에서 연결 실패로 끝낸다', async () => {
    const mock = mockLlama([{ hang: 'headers' }]);
    const client = new LlmClient({ baseUrl: mock.url, timeoutMs: 100 });
    expect((await llmErrorOf(client.chatJson(REQ))).retryable).toBe(false);
  }, 1500);

  test('미리 데우기도 응답이 없으면 시간 상한에서 실패한다', async () => {
    const mock = mockLlama([{ hang: 'headers' }]);
    const client = new LlmClient({ baseUrl: mock.url, timeoutMs: 100 });
    await expect(client.warm('시스템')).rejects.toThrow();
  }, 1500);

  test('health 가 실패 응답이면 연결되지 않은 것으로 본다', async () => {
    const mock = mockLlama([], { health: 503 });
    expect((await new LlmClient({ baseUrl: mock.url, timeoutMs: 2000 }).health()).ok).toBe(false);
  });

  test('요청에 엄격한 JSON 스키마와 chat_template_kwargs 를 실어 보낸다', async () => {
    const mock = mockLlama([GOOD]);
    const client = new LlmClient({ baseUrl: mock.url, timeoutMs: 2000, chatTemplateKwargs: { enable_thinking: false } });
    const res = await client.chatJson(REQ);
    expect(res.text).toBe(GOOD);
    expect(mock.requests[0]?.response_format?.json_schema?.strict).toBe(true);
    expect(mock.requests[0]?.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});

describe('GM 재시도와 대체', () => {
  test('400 오류는 한 번만 묻고 작가 대사로 넘어가고, 503 뒤에 좋은 답이 오면 그 답을 쓴다', async () => {
    const bad = mockLlama([{ status: 400 }, { status: 400 }, { status: 400 }]);
    const failed = await gmAt(bad.url).narrate(contexts('억울해요!').narrate);
    expect(failed.meta.fallback).toBe(true);
    expect(failed.meta.attempts).toBe(1);
    expect(bad.requests).toHaveLength(1);
    const flaky = mockLlama([{ status: 503 }, GOOD]);
    const ok = await gmAt(flaky.url).narrate(contexts('억울해요!').narrate);
    expect(ok.meta.fallback).toBe(false);
    expect(ok.meta.attempts).toBe(2);
  });

  test('빈 lines 출력은 위반이고 끝내 비면 대체 줄로 간다', async () => {
    const out = validateOutput('{"lines":[]}', checkFor(['나레이션']));
    expect(out.violations).toContainEqual(expect.objectContaining({ kind: 'format', rule: 'empty', severity: 'hard' }));
    const mock = mockLlama(['{"lines":[]}', '{"lines":[]}', '{"lines":[]}']);
    const reply = await gmAt(mock.url).narrate(contexts('억울해요!').narrate);
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines.length).toBeGreaterThan(0);
  });

  test('text 가 빠진 줄이나 목록이 아닌 lines 는 오류로 읽고, GM 은 던지지 않고 대체 줄로 간다', async () => {
    expect(typeof parseGmJson('{"lines":[{"speaker":"남자"}]}')).toBe('string');
    expect(typeof parseGmJson('{"lines":5}')).toBe('string');
    expect(typeof parseGmJson('{"lines":{"speaker":"남자","text":"뭐냐."}}')).toBe('string');
    const missing = '{"lines":[{"speaker":"나레이션"}]}';
    const mock = mockLlama([missing, missing, missing]);
    const reply = await gmAt(mock.url).narrate(contexts('억울해요!').narrate);
    expect(reply.meta.fallback).toBe(true);
    expect(reply.meta.violations.some((v) => v.startsWith('format/json'))).toBe(true);
  });

  test('겉 검사에 걸린 출력은 상태 재확인을 묻지 않는다', async () => {
    const hoodSpoiler = lines(['나레이션', '후드가 어깨 너머로 젖혀졌다.'], ['남자', '살라딘이 기다린다.']);
    const mock = mockLlama([hoodSpoiler, GOOD]);
    const reply = await gmAt(mock.url).narrate(contexts('억울해요!').narrate);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.attempts).toBe(2);
    expect(mock.requests).toHaveLength(2);
  });

  test('이번 결과로 잃기로 정한 소지품은 잃는 서술을 막지 않는다', async () => {
    const { narrate } = contexts('억울해요!');
    const losing: NarrateContext = { ...narrate, outcome: { ...narrate.outcome, effects: { lose: ['magic_bag'] } } };
    const mock = mockLlama([lines(['나레이션', '남자가 가방을 던졌다.'], ['남자', '거짓은 아닌 모양이군.']), GOOD]);
    const reply = await gmAt(mock.url).narrate(losing);
    expect(reply.meta.attempts).toBe(1);
    expect(reply.meta.violations).toEqual([]);
  });

  test('입력과 결과에 이동이 없으면 지어낸 긴 이동을 막는다', async () => {
    const mock = mockLlama([lines(['나레이션', '둘은 한참을 걸었다.'], ['남자', '거짓은 아닌 모양이군.']), GOOD]);
    const reply = await gmAt(mock.url).narrate(contexts('억울해요!').narrate);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('beat/outcome_forbid'))).toBe(true);
  });

  test('다음 장면의 원작 대사를 앞당겨 쓰면 다시 쓰게 한다', async () => {
    const mock = mockLlama([lines(['나레이션', '칼끝이 흔들렸다.'], ['남자', '인간을 죽이는 데 규칙이고 율법이 필요한가?']), GOOD]);
    const reply = await gmAt(mock.url).narrate(contexts('억울해요!').narrate);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('beat/reserved_line') || v.startsWith('beat/repeat_earlier'))).toBe(true);
  });

  test('큰 행동의 연출이 너무 짧으면 다시 쓰게 한다', async () => {
    const { narrate } = contexts('남자를 끌어안는다');
    const bold: NarrateContext = { ...narrate, improv: { absurd: false, bold: true, deed: '남자를 끌어안았다' }, deed: '남자를 끌어안았다' };
    const three = lines(['나레이션', '팔을 벌려 남자를 끌어안았다.'], ['나레이션', '남자의 몸이 굳었다.'], ['남자', '거짓은 아닌 모양이군.']);
    const mock = mockLlama([lines(['나레이션', '팔을 벌려 남자를 끌어안았다.'], ['남자', '거짓은 아닌 모양이군.']), three]);
    const reply = await gmAt(mock.url).narrate(bold);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('format/too_few'))).toBe(true);
  });

  test('없는 지도를 펼치는 서술은 참인 사실의 state_guard 로 막고, 대체 줄에서도 뺀다', async () => {
    const items = scenario.sheet.items.map((i) => i.id).filter((id) => id !== 'map');
    const guarded = mockLlama([lines(['나레이션', '조심스레 지도를 펼쳤다.'], ['남자', '거짓은 아닌 모양이군.']), GOOD]);
    const reply = await gmAt(guarded.url).narrate(contexts('억울해요!', 'b05_why', { items }).narrate);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('beat/state_guard'))).toBe(true);

    const { narrate } = contexts('억울해요!', 'b05_why', { items });
    const withMap: NarrateContext = { ...narrate, outcome: { ...narrate.outcome, lines: [{ speaker: '나레이션', text: '아시나가 지도를 펼쳤다.' }, { speaker: '나레이션', text: '바람이 불었다.' }] } };
    const empty = mockLlama(['{"lines":[]}', '{"lines":[]}', '{"lines":[]}']);
    const fallback = await gmAt(empty.url).narrate(withMap);
    expect(fallback.meta.fallback).toBe(true);
    expect(fallback.lines.length).toBeGreaterThan(0);
    expect(fallback.lines.some((l) => mentions(l.text, '지도를 펼'))).toBe(false);
  });

  test('세계 밖 행동의 대화에서 "이상한 몸짓"으로 얼버무리면 다시 쓰게 한다', async () => {
    const mock = mockLlama([lines(['나레이션', '이상한 몸짓을 했다.'], ['남자', '뭘 하는 거냐.']), lines(['나레이션', '허공에 손을 흔들었다.'], ['남자', '뭘 하는 거냐.'])]);
    const reply = await gmAt(mock.url).talk({ ...contexts('택시를 부른다').ctx, absurd: true, deed: '허공에 손을 흔들었다' });
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('beat/outcome_forbid'))).toBe(true);
  });

  test('여우 한 줄은 입력에 없는 정체 낱말을 꺼내면 다시 쓴다', async () => {
    const mock = mockLlama([lines(['GM', '미소녀라니 재밌네.']), lines(['GM', '모래 위에서 그러면 재밌네.'])]);
    const reply = await gmAt(mock.url).quip(contexts('물구나무를 선다', 'b02_people').ctx);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.fallback).toBe(false);
  });

  test('줄 쓰기 스키마와 검사의 화자에 플레이어 인물의 대사는 없다', async () => {
    const mock = mockLlama([lines(['아시나', '억울해요.']), GOOD]);
    const reply = await gmAt(mock.url).narrate(contexts('억울해요!').narrate);
    expect(speakerEnums(mock.requests[0]?.response_format?.json_schema?.schema)).not.toContain('아시나');
    expect(speakerEnums(mock.requests[0]?.response_format?.json_schema?.schema)).toContain('남자');
    expect(reply.meta.attempts).toBe(2);
  });
});

describe('숨긴 설정과 입력 가리기', () => {
  test('숨긴 항목은 열려 있어도 배경 설명 프롬프트에 내용이 실리지 않는다', async () => {
    const hidden = lore.knowledge.find((n) => n.id === 'man_true');
    expect(hidden?.tier).toBe('hidden');
    const mock = mockLlama([lines(['GM', '그건 아시나도 몰라.'])]);
    await gmAt(mock.url).explain({ ...contexts('저 남자 정체가 뭐야?', 'b05_why', { flags: { 남자_정체_앎: true } }).ctx, about: 'man_true' });
    expect(mock.requests).toHaveLength(1);
    expect(JSON.stringify(mock.requests[0]?.messages)).not.toContain(hidden?.text ?? '?');
  });

  test('해석 스키마의 about 목록에 숨긴 항목 id 는 없다', () => {
    const { ctx } = contexts('');
    const schema = interpretSchema(ctx.free, ctx.state.items, lore, ['luck'], ['lore', 'game']) as { properties: { about: { enum: string[] }; reason: { maxLength?: number } } };
    const hiddenIds = lore.knowledge.filter((n) => n.tier === 'hidden').map((n) => n.id);
    expect(hiddenIds.length).toBeGreaterThan(0);
    for (const id of hiddenIds) expect(schema.properties.about.enum).not.toContain(id);
    expect(schema.properties.about.enum).toContain('nations');
    expect(schema.properties.reason.maxLength).toBe(40);
  });

  test('줄 스키마는 줄 수 상한을 둔다', () => {
    const schema = linesSchema(['나레이션'], 3, 80) as { properties: { lines: { maxItems?: number } } };
    expect(schema.properties.lines.maxItems).toBe(3);
  });

  test('시스템 프롬프트에 등급 규칙이 들어간다', () => {
    expect(buildSystem(contexts('').ctx, lore)).toContain(`${lore.rating}:`);
  });

  test('스포일러 입력은 unknown, 장면에 없는 인물은 absent 로 가린다', () => {
    const gm = new LocalGm(null, lore);
    expect(gm.screen(contexts('살라딘을 아세요?').ctx)?.reason).toBe('unknown');
    expect(gm.screen(contexts('남자가 어디 갔지', 'r3_dusk').ctx)?.reason).toBe('absent');
    expect(gm.screen(contexts('모래를 털어낸다', 'r3_dusk').ctx)).toBeNull();
  });

  test('숨긴 항목의 낱말로 묻는 말은 배경 질문이 아니고, 너로 시작하면 인물에게 하는 말이다', () => {
    expect(isLoreQuestion('베히다트가 누구야?', lore)).toBe(false);
    expect(isLoreQuestion('너 여기가 어디야?', lore)).toBe(false);
    expect(isLoreQuestion('여기가 어디야?', lore)).toBe(true);
  });
});

describe('규칙 해석', () => {
  const free = scenario.beats.b05_why?.free;
  if (!free) throw new Error('b05_why 에 free 가 없습니다');
  const items = scenario.sheet.items.map((i) => i.id);

  test('욕설은 규칙에서 바로 받아넘긴다', () => {
    expect(ruleInterpret(free, '씨발 뭐야', items, lore).kind).toBe('deflect');
  });

  test('키워드 수가 같으면 먼저 적힌 행동을 고른다', () => {
    expect(ruleInterpret(free, '제발 보상', items, lore)).toMatchObject({ kind: 'approach', approach: 'plead', score: 1 });
  });

  test('소지품 키워드가 하나뿐이면 규칙으로 정하지 않고 LLM 에 묻는다', async () => {
    const mock = mockLlama([reading({ kind: 'action', approach: 'bag', item: 'magic_bag' })]);
    const read = await gmAt(mock.url).interpret(contexts('가방이 무겁다').ctx);
    expect(read).toMatchObject({ kind: 'approach', approach: 'bag', source: 'llm' });
    expect(mock.requests).toHaveLength(1);
  });
});

describe('LLM 해석 결과 다듬기', () => {
  test('가지지 않은 소지품은 해석 결과의 item 으로 받지 않는다', async () => {
    const mock = mockLlama([reading({ kind: 'action', approach: 'bag', item: 'magic_bag' })]);
    const read = await gmAt(mock.url).interpret(contexts('그게 그러니까', 'b05_why', { items: ['earring'] }).ctx);
    expect(read).toMatchObject({ kind: 'approach', approach: 'bag', item: null, source: 'llm' });
  });

  test('모르는 입력 종류는 규칙 해석으로 돌아간다', async () => {
    const mock = mockLlama([reading({ kind: 'weird' })]);
    const read = await gmAt(mock.url).interpret(contexts('그게 그러니까').ctx);
    expect(read.source).toBe('rule');
    expect(read.meta.fallback).toBe(true);
  });

  test('모르는 난이도는 보통으로, 긴 이유는 20자로 자른다', async () => {
    const reason = '모래성을 아주 높이 쌓아 올리며 남자의 눈길을 끈다는 행동';
    const mock = mockLlama([reading({ kind: 'action', difficulty: '극악', reason })]);
    const read = await gmAt(mock.url).interpret(contexts('모래성을 쌓는다').ctx);
    expect(read).toMatchObject({ kind: 'improv', difficulty: 0, label: reason.slice(0, 20) });
  });

  test('혼잣말로 읽은 입력에는 위험 표시를 붙이지 않는다', async () => {
    const mock = mockLlama([reading({ kind: 'self', risk: 'identity' }), reading({ kind: 'self', risk: 'identity' })]);
    const read = await gmAt(mock.url).interpret(contexts('아 진짜 힘들어').ctx);
    expect(read).toMatchObject({ kind: 'talk', to: 'self', source: 'llm' });
    expect(read).not.toHaveProperty('risk');
  });

  test('해석 시드는 입력마다 다르다', async () => {
    const mock = mockLlama([reading({}), reading({})]);
    const gm = gmAt(mock.url);
    await gm.interpret(contexts('그게 그러니까').ctx);
    await gm.interpret(contexts('저게 저러니까').ctx);
    expect(mock.requests).toHaveLength(2);
    expect(mock.requests[0]?.seed).not.toBe(mock.requests[1]?.seed);
  });
});

describe('배경 설명', () => {
  test('사람을 물었는데 다른 대상을 답하면 다시 쓴다', async () => {
    const mock = mockLlama([lines(['GM', '여긴 사막이야.']), lines(['GM', '넌 웰든 대공가의 공녀야.'])]);
    const reply = await gmAt(mock.url).explain({ ...contexts('나는 누구야?').ctx, about: 'asina' });
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('beat/off_topic'))).toBe(true);
  });

  test('GM 화자가 없는 시나리오에서 배경 설명을 부르면 던진다', () => {
    const cast = Object.fromEntries(Object.entries(scenario.cast).filter(([, c]) => c.style !== 'gm'));
    const noGm: Scenario = { ...scenario, cast };
    const { ctx } = contexts('크롬웰이 뭐야?');
    expect(() => new LocalGm(null, lore).explain({ ...ctx, scenario: noGm })).toThrow();
  });
});

describe('미리 데우기', () => {
  test('데우기 실패는 삼키고 처리되지 않은 거부를 남기지 않는다', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      let caught = false;
      const fake = {
        warm: () => {
          const p = Promise.reject(new Error('데우기 실패'));
          const original = p.catch.bind(p);
          p.catch = ((fn: (e: unknown) => unknown) => {
            caught = true;
            return original(fn);
          }) as typeof p.catch;
          return p;
        },
      } as unknown as LlmClient;
      const { ctx } = contexts('');
      expect(() => new LocalGm(fake, lore).prepare({ scenario: ctx.scenario, beat: ctx.beat, free: ctx.free, state: ctx.state })).not.toThrow();
      await new Promise((r) => setImmediate(r));
      expect(caught).toBe(true);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('검사 규칙', () => {
  test('띄어 쓴 금지어도 잡는다', () => {
    expect(mentions('개 새 끼', '개새끼')).toBe(true);
    const out = validateOutput(lines(['남자', '하 렘으로 데려가겠다.']), checkFor(['남자']));
    expect(out.violations).toContainEqual(expect.objectContaining({ kind: 'lore', rule: 'spoilers' }));
  });

  test('빈 낱말은 어디에도 나온 것으로 보지 않는다', () => {
    expect(mentions('아무 말', '   ')).toBe(false);
    expect(mentions('아무 말', '')).toBe(false);
  });

  test('빈 대사, 일본 문자는 형식 위반이고 긴 줄은 가벼운 위반이다', () => {
    expect(rulesOf(validateOutput(lines(['나레이션', '']), checkFor(['나레이션'])).violations)).toContain('empty_line');
    expect(rulesOf(validateOutput(lines(['나레이션', '모래가 ありがとう 흩날렸다.']), checkFor(['나레이션'])).violations)).toContain('kana');
    const long = '모'.repeat(90);
    const tooLong = validateOutput(lines(['나레이션', long]), checkFor(['나레이션'])).violations.find((v) => v.rule === 'too_long');
    expect(tooLong?.severity).toBe('soft');
  });

  test('묻는 대상을 하나도 말하지 않으면 off_topic, 소지품을 잃는 서술은 item_lost', () => {
    expect(rulesOf(validateOutput(lines(['GM', '여긴 사막이야.']), checkFor(['GM'], { mustMention: ['아시나'] })).violations)).toContain('off_topic');
    expect(rulesOf(validateOutput(lines(['나레이션', '아시나는 가방을 던졌다.']), checkFor(['나레이션'], { keepItems: ['가방'] })).violations)).toContain('item_lost');
  });

  test('화자 이름만 있고 글이 없는 줄은 옮기지 않는다', () => {
    const out = validateOutput(JSON.stringify({ lines: [{ speaker: '나레이션', text: '남자:' }] }), checkFor(['나레이션', '남자']));
    expect(out.lines[0]?.speaker).toBe('나레이션');
    expect(rulesOf(out.violations)).toContain('speaker_prefix');
    expect(rulesOf(out.violations)).not.toContain('empty_line');
  });

  test('다시 쓰기 지적은 여섯 개까지만 붙인다', () => {
    const many: Violation[] = Array.from({ length: 8 }, (_, i) => ({ kind: 'format', rule: `r${i}`, detail: `d${i}`, severity: 'hard' }));
    expect(feedbackFor(many).split('\n')).toHaveLength(6);
  });
});

describe('설정 사전 읽기', () => {
  const BASE = `
work: 시험
credit: 시험
rating: 15세
knowledge:
  common:
    - id: a
      kind: 세계
      name: 항목
      text: 내용
      keys: [열쇠]
characters:
  갑:
    names: [갑]
    alias: 갑
    look: 모습
    personality: 성격
    voice: [말투]
    samples: { speech: [말], thought: [생각] }
    register: { forbid_endings: [], forbid_words: [] }
    faces: [표정]
    reactions:
      hit: [{ text: 좋아, face: neutral }]
      mixed: [{ text: 글쎄, face: neutral }]
      miss: [{ text: 아니, face: neutral }]
narration: { voice: [과거], register: { forbid_endings: [], forbid_words: [] } }
thought: { voice: [생각], register: { forbid_endings: [], forbid_words: [] } }
exposure: []
gm_quips: []
places: []
terms: []
misspellings: {}
forbidden: {}
`;

  test('올바른 사전은 읽힌다', () => {
    expect(parseLore(BASE).knowledge.map((n) => n.id)).toEqual(['a']);
  });

  test('반응 줄이 빈 등급, 모르는 항목 종류, 빈 글자는 LoreError 로 멈춘다', () => {
    expect(() => parseLore(BASE.replace('miss: [{ text: 아니, face: neutral }]', 'miss: []'))).toThrow(LoreError);
    expect(() => parseLore(BASE.replace('kind: 세계', 'kind: 음식'))).toThrow(LoreError);
    expect(() => parseLore(BASE.replace('work: 시험', "work: '   '"))).toThrow(LoreError);
  });

  test('조건 없는 숨긴 항목은 수첩 검증에서 멈춘다', () => {
    const bad = { ...lore, knowledge: [...lore.knowledge, { id: 'secret_x', tier: 'hidden' as const, kind: '세계' as const, name: '비밀', text: '비밀', keys: [] }] };
    expect(() => withNotes(scenario, bad)).toThrow(LoreError);
  });
});
