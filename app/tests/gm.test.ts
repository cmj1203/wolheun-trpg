import { afterEach, describe, expect, test } from 'bun:test';
import { Engine, type GmContext, type NarrateContext } from '../src/engine/engine.ts';
import { DEFAULT_GM_OPTIONS, LocalGm, type GmTrace } from '../src/gm/gm.ts';
import { LlmClient, assertLoopback } from '../src/gm/llm.ts';
import { ruleInterpret } from '../src/gm/rules.ts';
import { typedFallbackLines } from '../src/engine/scenario.ts';
import { actClauses, isAboutSelf, isLinkedAct, isNoAttempt, isRefusedClause, parseStoryInput } from '../src/engine/text.ts';
import { ASK_SYSTEM, ATTEMPT_CHECK_SYSTEM, CHANGE_SYSTEM, GRAMMAR_SYSTEM, NO_CHANGE, OWN_MOVE, SHOWN_CHANGE, YIELD_CHANGE } from '../src/gm/prompt.ts';
import type { Face } from '../src/engine/types.ts';
import { validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { FakeGm, loadDesert, loadWolheunLore, tokenBudgetFixture } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

interface ChatBody {
  stream?: boolean;
  max_tokens?: number;
  messages: { role: string; content: string }[];
  response_format?: { json_schema: { schema: { properties: { changes?: { minItems: number }; target?: { enum: string[] }; lines: { prefixItems?: { anyOf?: { properties: { speaker: { enum: string[] } } }[]; properties?: { speaker: { enum: string[] } } }[] } } } } };
}

const SERVER_ERROR = '<서버 오류로 끝남>';
let changeReply = '{"change":"자리가 바뀜"}';
let askReply = '{"ask":"게임에 대해 물음"}';

function mockLlama(outputs: string[], grammarOutputs: string[] = []) {
  const requests: ChatBody[] = [];
  const grammarRequests: ChatBody[] = [];
  const fidelityRequests: ChatBody[] = [];
  let warmed: () => void = () => undefined;
  const warmSeen = new Promise<void>((resolve) => {
    warmed = resolve;
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      const budget = await tokenBudgetFixture(req);
      if (budget) return budget;
      if (pathname === '/health') return Response.json({ status: 'ok' });
      if (pathname === '/v1/models') return Response.json({ data: [{ id: 'mock-gm' }] });
      const body = (await req.json()) as ChatBody;
      // 별도 검수는 기존 생성·분류 fixture를 소비하지 않는다.
      const grammar = body.messages[0]?.content === GRAMMAR_SYSTEM;
      const fidelity = body.messages[0]?.content === ATTEMPT_CHECK_SYSTEM;
      (grammar ? grammarRequests : fidelity ? fidelityRequests : requests).push(body);
      if (!body.stream) {
        warmed();
        return Response.json({ choices: [{ message: { content: '' } }] });
      }
      const system = body.messages[0]?.content;
      const written = grammar ? JSON.parse(body.messages[1]?.content ?? '{}') as { lines: { text: string }[] } : undefined;
      const count = body.response_format?.json_schema.schema.properties.changes?.minItems;
      const configured: unknown = system === CHANGE_SYSTEM ? JSON.parse(changeReply) : null;
      const changes = count !== undefined && configured !== null && typeof configured === 'object'
        && 'change' in configured && !('changes' in configured) && typeof configured.change === 'string'
        ? JSON.stringify({ changes: Array.from({ length: count }, () => configured.change) }) : changeReply;
      const queued = grammar ? (grammarOutputs.shift() ?? JSON.stringify({ lines: written?.lines.map(l => ({ original: l.text, corrected: l.text })) })) : fidelity ? '{"supported":true}' : system === CHANGE_SYSTEM ? changes : system === ASK_SYSTEM ? askReply : (outputs.shift() ?? '{"lines":[]}');
      const failAtEnd = queued.startsWith(SERVER_ERROR);
      const text = failAtEnd ? queued.slice(SERVER_ERROR.length) : queued;
      const cut = Math.floor(text.length / 2);
      const chunks = [text.slice(0, cut), text.slice(cut)].map((c) => ({ model: 'mock-gm', choices: [{ delta: { content: c } }] }));
      const done = failAtEnd
        ? { error: { code: 500, message: 'The model produced output that does not match the expected peg-native format' } }
        : { choices: [{ delta: {}, finish_reason: 'stop' }], timings: { prompt_n: 12, prompt_ms: 3, predicted_n: 8, predicted_ms: 4 } };
      const sse = [...chunks, done].map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
      return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  return { server, requests, grammarRequests, fidelityRequests, warmSeen, url: `http://127.0.0.1:${server.port}` };
}

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
});

function contexts(text: string) {
  const engine = new Engine(scenario, new FakeGm());
  const { state } = engine.newGame(1, 'gm-test');
  const beat = scenario.beats.b05_why;
  const free = beat?.free;
  const approach = free?.approaches.find((a) => a.id === 'plead');
  if (!beat || !free || !approach) throw new Error('b05_why 구성이 바뀌었습니다');
  const ctx = { scenario, beat, free, state, text } satisfies GmContext;
  const roll = { label: approach.label, stat: approach.stat, statValue: 2, mods: [], dice: [5, 5] as [number, number], total: 12, tier: 'hit' as const };
  const narrate: NarrateContext = { ...ctx, approach, roll, outcome: approach.outcomes.hit };
  return { ctx, narrate };
}

const checkFor = (speakers: string[]): CheckOptions => ({
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
});

// 가짜 모델 답: 인물 대사·속마음 줄에는 스키마대로 face 가 붙고, 나레이션·GM 줄에는 없다.
const FACED_SPEAKERS = new Set(['아시나', '속마음', '남자']);
const lines = (...xs: ([string, string] | [string, string, string])[]) =>
  JSON.stringify({ lines: xs.map(([speaker, text, face]) => ({ speaker, text, ...(face ? { face } : FACED_SPEAKERS.has(speaker) ? { face: 'neutral' } : {}) })) });

describe('로컬 GM 생성과 재생성', () => {
  test.each(['narrate', 'talk'] as const)('교열에 완료 결과와 현재 근거를 전달하고 미판정 대화와 구분한다(%s)', async (task) => {
    const mock = mockLlama([lines(['나레이션', '칼끝은 그대로였다.'], ['남자', '계속해라.', 'intrigued'])]);
    stop = () => mock.server.stop(true);
    const base = contexts('제 이야기를 먼저 들어 주세요.').narrate;
    const ctx: NarrateContext = {
      ...base,
      free: { ...base.free, goal: '해명을 끝까지 듣게 한다.' },
      state: { ...base.state, recent: [{ speaker: '남자', text: '그 말을 믿으라고?' }] },
      displayed: { type: 'line', speaker: '남자', display: '붉은 눈의 남자', style: 'speech', text: '그 말을 믿으라고?', by: 'script' },
      approach: { ...base.approach, label: '상대가 해명을 듣게 한다' },
      outcome: { ...base.outcome, gist: '남자는 내 해명을 끝까지 들었다.' },
      price: { id: 'breath', tag: '수치', weight: 'soft', text: '긴장이 남아 숨을 고르기 힘들었다.', effects: {} },
    };
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const reply = task === 'narrate' ? await gm.narrate(ctx) : await gm.talk(contexts(ctx.text).ctx);
    expect(reply.meta.fallback).toBe(false);
    const request = mock.grammarRequests[0]?.messages[1]?.content;
    if (!request) throw new Error('교열 요청이 없습니다.');
    expect(JSON.parse(request)).toMatchObject({
      context: task === 'narrate' ? {
        task, goal: '해명을 끝까지 듣게 한다.',
        resolution: { action: '상대가 해명을 듣게 한다', tier: 'hit', gist: '남자는 내 해명을 끝까지 들었다.', price: '긴장이 남아 숨을 고르기 힘들었다.' },
        evidence: { recent: [{ speaker: '남자', text: '그 말을 믿으라고?' }], displayed: { speaker: '남자', text: '그 말을 믿으라고?' } },
      } : { task, resolution: null },
    });
  });

  test('사동·시간 연결 교열은 문장 전체를 재생성하며 교정문을 직접 표시하지 않는다', async () => {
    const original = '남자는 내 말을 자르지 않고 끝까지 듣게 해주었다.';
    const corrected = '남자는 내 말을 자르지 않고 끝까지 들었다.';
    const regenerated = '남자는 칼을 든 채 내 해명이 끝날 때까지 잠자코 들었다.';
    const mock = mockLlama([
      lines(['나레이션', original], ['남자', '어디 한번 해봐라.', 'intrigued']),
      lines(['나레이션', regenerated], ['남자', '해명은 그럴듯하군.', 'intrigued']),
    ], [JSON.stringify({ lines: [
      { original, corrected },
      { original: '어디 한번 해봐라.', corrected: '해명은 들었다.' },
    ] })]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const reply = await gm.narrate(contexts('제 이야기를 먼저 들어 주세요.').narrate);
    expect(reply.meta).toMatchObject({ attempts: 2, fallback: false });
    expect(reply.lines).toEqual([
      { speaker: '나레이션', text: regenerated },
      { speaker: '남자', text: '해명은 그럴듯하군.', face: 'intrigued' },
    ]);
    expect(reply.meta.violations.some(v => v.startsWith('format/grammar:'))).toBe(true);
  });

  // 계약(리드 결정, resume90 2차 #7): 맞춤법 수준의 작은 교정은 재생성하지 않고 바로 적용한다.
  test.each([false, true])('문법 오류는 일반·짧은 반응 대화 모두 교정문을 바로 적용한다(reaction=%s)', async (reaction) => {
    const bad = lines(['남자', '그렇게 우는다고 목숨이 붙어있나, 이방인.', 'sneer']);
    const good = lines(['남자', '울어 봐야 달라질 건 없다.', 'sneer']);
    const mock = mockLlama(
      reaction ? [bad, '{"answer":false}', '{"answer":true}', good, '{"answer":false}', '{"answer":true}'] : [bad, good],
      [JSON.stringify({ lines: [{ original: '그렇게 우는다고 목숨이 붙어있나, 이방인.', corrected: '그렇게 운다고 목숨이 붙어있나, 이방인.' }] })],
    );
    stop = () => mock.server.stop(true);
    const traces: GmTrace[] = [];
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, onTrace: t => traces.push(t) });
    const reply = await gm.talk({ ...contexts('눈물이 멈추지 않는다').ctx, reaction });
    expect(reply.meta).toMatchObject({ attempts: 1, fallback: false });
    expect(reply.lines).toEqual([{ speaker: '남자', text: '그렇게 운다고 목숨이 붙어있나, 이방인.', face: 'sneer' }]);
    expect(reply.meta.violations.some(v => v.startsWith('format/grammar:'))).toBe(false);
    expect(traces[0]?.violations ?? []).not.toContainEqual(expect.objectContaining({ rule: 'grammar' }));
    expect(mock.grammarRequests).toHaveLength(1);
  });

  test('의도적인 단편 대사는 문법 검수 뒤 그대로 내보낸다', async () => {
    const mock = mockLlama([lines(['남자', '…그래서?', 'intrigued'])]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const reply = await gm.talk(contexts('칼부터 치우고 얘기하죠.').ctx);
    expect(reply.meta).toMatchObject({ attempts: 1, fallback: false, violations: [] });
    expect(reply.lines).toEqual([{ speaker: '남자', text: '…그래서?', face: 'intrigued' }]);
    expect(mock.grammarRequests).toHaveLength(1);
  });

  test.each([SERVER_ERROR, '{}'])('문법 검수가 실패하면 검수되지 않은 생성문을 내보내지 않는다(%s)', async (review) => {
    const mock = mockLlama([lines(['남자', '검수되지 않은 말이다.'])], [review]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, retries: 0 });
    const reply = await gm.talk(contexts('살려 줘요.').ctx);
    expect(reply.meta).toMatchObject({ attempts: 1, fallback: true });
    expect(reply.lines.map(l => l.text)).not.toContain('검수되지 않은 말이다.');
    expect(reply.meta.violations.some(v => v.startsWith('format/grammar:'))).toBe(true);
  });

  test('설정 위반 출력은 막고 지적을 붙여 다시 생성한다', async () => {
    const mock = mockLlama([lines(['남자', '폐하의 칼 앞에서 무슨 말이냐.']), lines(['나레이션', '칼끝이 손가락 한 마디만큼 물러났다.'], ['남자', '거짓은 아닌 모양이군.'])]);
    stop = () => mock.server.stop(true);
    const traces: GmTrace[] = [];
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { retries: 2, softRetries: 1, temperature: 0.7, interpretTemperature: 0.1, maxLines: 4, talkLines: 2, maxChars: 80, budgetMs: 60_000, onTrace: (t) => traces.push(t) });
    const { narrate } = contexts('억울해요!');
    const reply = await gm.narrate(narrate);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.lines.map((l) => l.text)).toEqual(['칼끝이 손가락 한 마디만큼 물러났다.', '거짓은 아닌 모양이군.']);
    expect(reply.meta.violations.some((v) => v.startsWith('lore/spoilers'))).toBe(true);
    expect(mock.requests[1]?.messages[1]?.content).toContain('직전 답의 문제');
    expect(traces[0]?.llm?.completionTokens).toBe(8);
  });

  // 계약(리드 결정, resume90 2차 #12): 세계 밖 행동은 나레이션으로 그리지 않고 상대의 받아넘기는 줄만 쓴다.
  test('세계 밖 행동이 끝까지 위반하면 대체 줄은 나레이션 없이 상대의 반응 줄만 온다(택시 재발 방지)', async () => {
    const bad = lines(['나레이션', '택시를 불렀다.'], ['남자', '택시라니.']);
    const mock = mockLlama([bad, bad, bad]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const { ctx } = contexts('택시를 부른다');
    const reply = await gm.talk({ ...ctx, absurd: true, deed: '허공에 손을 흔들었다' });
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines.length).toBeGreaterThanOrEqual(1);
    expect(reply.lines.every((l) => l.speaker === '남자' && !l.text.includes('택시'))).toBe(true);
    const sent = mock.requests[0] as { response_format?: { json_schema?: { schema?: { properties?: { lines?: { prefixItems?: { properties?: { speaker?: { enum?: string[] } } }[] } } } } } } | undefined;
    expect(sent?.response_format?.json_schema?.schema?.properties?.lines?.prefixItems?.[0]?.properties?.speaker?.enum).toEqual(['남자']);
  });

  test('플레이어가 한 갈래의 낱말을 쓰면 같은 갈래의 다른 낱말을 되받아도 막지 않는다', async () => {
    const reply = lines(['나레이션', '남자가 코웃음을 쳤다.'], ['남자', '네가 그렇게 예쁜가?']);
    const mock = mockLlama([reply, reply, reply]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const said = contexts('저는 미소녀니까요').narrate;
    expect((await gm.narrate(said)).meta).toMatchObject({ fallback: false, attempts: 1 });
    const unsaid = contexts('억울해요!').narrate;
    expect((await gm.narrate(unsaid)).meta.violations.some((v) => v.startsWith('beat/echo_only'))).toBe(true);
  });

  test('다음 장면 고정 줄과 안 한 말의 낱말을 서술 지시에 적는다', async () => {
    const mock = mockLlama([lines(['나레이션', '칼끝이 멈췄다.'])]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    await gm.narrate(contexts('억울해요!').narrate);
    const sent = JSON.stringify(mock.requests[0]);
    expect(sent).toContain('웃기는 여자군.');
    expect(sent).toContain('미인');
  });

  test('"하."만 붙여 다음 장면 줄을 베낀 줄은 다른 줄이 남으면 뺀다', async () => {
    const reply = lines(['나레이션', '칼끝이 멈췄다.'], ['남자', '하. 웃기는 여자군.']);
    const mock = mockLlama([reply]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const out = await gm.narrate(contexts('억울해요!').narrate);
    expect(out.meta).toMatchObject({ fallback: false, attempts: 1 });
    expect(out.lines.map((l) => l.text)).toEqual(['칼끝이 멈췄다.']);
  });

  test('끝까지 위반하면 작가가 쓴 대사로 대체한다', async () => {
    const bad = lines(['남자', '내 하렘에 온 걸 환영한다.']);
    const mock = mockLlama([bad, bad, bad]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const { narrate } = contexts('억울해요!');
    const reply = await gm.narrate(narrate);
    expect(reply.meta.fallback).toBe(true);
    expect(reply.meta.attempts).toBe(3);
    expect(reply.lines).toEqual(typedFallbackLines(scenario, narrate.outcome.lines));
    expect(reply.lines.some((l) => l.speaker === '아시나')).toBe(false);
  });

  test('즉흥 행동에서 끝까지 못 쓰면 행동 요약 내레이션과 상대 인물의 성격 반응 줄로 조립한다', async () => {
    const bad = lines(['남자', '내 하렘에 온 걸 환영한다.']);
    const mock = mockLlama([bad, bad, bad]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const { ctx } = contexts('뽀뽀');
    const outcomes = ctx.free.improv_bold ?? ctx.free.improv;
    const approach = { id: 'improv', label: '뽀뽀', stat: '매력' as const, hint: '', examples: [], keywords: [], outcomes };
    const roll = { label: '뽀뽀', stat: '매력' as const, statValue: 2, mods: [], dice: [6, 5] as [number, number], total: 13, tier: 'hit' as const };
    const deed = '남자의 입에 입을 맞췄다';
    const reply = await gm.narrate({ ...ctx, approach, roll, outcome: outcomes.hit, improv: { absurd: false, bold: true, deed }, deed });
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines[0]).toEqual({ speaker: '나레이션', text: `${deed}.` });
    expect(reply.lines[1]).toEqual({ speaker: '나레이션', text: outcomes.hit.gist ?? '' });
    expect(reply.lines[2]?.speaker).toBe('남자');
    // 고정 반응 줄은 그 줄에 맞는 표정을 함께 실고 온다.
    expect(lore.characters.베히다트?.reactions?.hit).toContainEqual({ text: reply.lines[2]?.text ?? '', face: reply.lines[2]?.face as Face });
    expect(reply.lines).toHaveLength(3);
  });

  test('다시 쓸 시간이 시간 상한을 넘으면 바로 작가 대사로 대체한다', async () => {
    const bad = lines(['남자', '내 하렘에 온 걸 환영한다.']);
    const mock = mockLlama([bad, bad, bad]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, budgetMs: 0 });
    const { narrate } = contexts('억울해요!');
    const reply = await gm.narrate(narrate);
    expect(reply.meta.attempts).toBe(1);
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines).toEqual(typedFallbackLines(scenario, narrate.outcome.lines));
    expect(reply.lines.some((l) => l.speaker === '아시나')).toBe(false);
  });

  test('문체 위반만 남으면 한 번 더 써 보고, 그래도 문체만 어긋나면 덜 어긋난 출력을 쓴다', async () => {
    const first = lines(['나레이션', '칼끝이 조금 물러난다.'], ['남자', '거짓은 아닌 모양이군.']);
    const second = lines(['나레이션', '나는 숨을 삼킨다.'], ['나레이션', '칼끝이 흔들린다.']);
    const firstCheck = validateOutput(first, checkFor(['나레이션', '남자']));
    const secondCheck = validateOutput(second, checkFor(['나레이션', '남자']));
    expect(firstCheck.violations.length).toBeGreaterThan(0);
    expect(secondCheck.violations.length).toBeGreaterThan(firstCheck.violations.length);
    expect([...firstCheck.violations, ...secondCheck.violations].every(v => v.severity === 'soft')).toBe(true);
    const mock = mockLlama([first, second]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const { narrate } = contexts('억울해요!');
    const reply = await gm.narrate(narrate);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.lines.map((l) => l.text)).toEqual(['칼끝이 조금 물러난다.', '거짓은 아닌 모양이군.']);
    expect(mock.requests.length).toBe(2);
  });

  test('스트림 끝의 서버 오류 조각은 JSON 이 온전하면 받아들이고, 잘렸으면 다시 생성한다', async () => {
    const good = lines(['나레이션', '칼끝이 손가락 한 마디만큼 물러났다.'], ['남자', '거짓은 아닌 모양이군.']);
    const mock = mockLlama([SERVER_ERROR + good, SERVER_ERROR + '{"lines":[{"speaker":"남자","te', good]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const first = await gm.narrate(contexts('억울해요!').narrate);
    expect(first.meta.attempts).toBe(1);
    expect(first.meta.fallback).toBe(false);
    const second = await gm.narrate(contexts('제발요!').narrate);
    expect(second.meta.attempts).toBe(2);
    expect(second.meta.fallback).toBe(false);
    expect(second.meta.violations.some((v) => v.startsWith('error:') && v.includes('peg-native'))).toBe(true);
  });

  test('LLM 서버가 꺼져 있으면 해석은 규칙으로, 서술은 작가 대사로 진행한다', async () => {
    const gm = new LocalGm(new LlmClient({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 2000 }), lore);
    const { ctx, narrate } = contexts('제발 살려 주세요');
    const read = await gm.interpret(ctx);
    expect(read).toMatchObject({ kind: 'approach', approach: 'plead', source: 'rule' });
    expect(read.meta.fallback).toBe(true);
    const reply = await gm.narrate(narrate);
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines).toEqual(typedFallbackLines(scenario, narrate.outcome.lines));
    expect(reply.lines.some((l) => l.speaker === '아시나')).toBe(false);
  });

  test('해석은 허용된 행동 id 만 받고, 모르는 id 면 규칙 해석으로 돌아간다', async () => {
    const mock = mockLlama(['{"reason":"미모를 내세움","kind":"person","about":"none","approach":"beauty","item":""}', '{"reason":"?","kind":"action","about":"none","approach":"dance","item":""}']);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('대륙에서 하나뿐인 미소녀니까요').ctx)).toMatchObject({ kind: 'approach', approach: 'beauty', source: 'llm' });
    expect(await gm.interpret(contexts('억울해요').ctx)).toMatchObject({ kind: 'approach', approach: 'plead', source: 'rule' });
  });

  test('입력 종류마다 답하는 쪽이 갈린다', async () => {
    const reply = (kind: string, about = 'none', approach = 'none', odd = false) => JSON.stringify({ reason: '근거', label: '틈 조사', question: '', kind, about, approach, item: '', odd, absurd: false, stat: '재치', difficulty: '보통', target: kind === 'action' ? approach === 'none' ? 'local' : approach : 'none', scope: kind === 'action' ? 'ready' : 'none', deed: kind === 'action' ? '바위 틈에 숨은 흔적을 조사한다' : '' });
    const cases = [
      { out: reply('how'), want: { kind: 'ask', play: true } },
      { out: reply('lore', 'asina'), want: { kind: 'ask', about: 'asina' } },
      { out: reply('lore'), want: { kind: 'ask', about: 'none' } },
      { out: reply('person', 'none', 'plead'), want: { kind: 'approach', approach: 'plead', spoken: true } },
      { out: reply('person'), want: { kind: 'talk', to: 'person' } },
      { out: reply('self', 'none', 'plead'), want: { kind: 'talk', to: 'self' } },
      { out: reply('bad'), want: { kind: 'talk', tone: 'deflect' } },
      { out: reply('action', 'none', 'plead'), want: { kind: 'approach', approach: 'plead', spoken: false } },
      { out: reply('action'), want: { kind: 'improv', odd: false } },
      { out: reply('action', 'none', 'none', true), want: { kind: 'improv', odd: true } },
    ];
    // 혼잣말로 읽거나 답할 항목이 없는 세계 물음으로 읽으면 한 번 더 가린다.
    // 행동 꼴이 아닌 글을 접근법 없는 행동으로 읽어도 한 번 더 가린다.
    const mock = mockLlama(cases.flatMap((c) => (c.want.to === 'self' ? [c.out, reply('self')] : c.want.about === 'none' ? [c.out, reply('lore')] : c.want.kind === 'improv' ? [c.out, c.out] : [c.out])));
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    for (const c of cases) expect(await gm.interpret(contexts('그게 그러니까').ctx)).toMatchObject({ ...c.want, source: 'llm' });
  });

  test('행동으로 읽어도 그 동작 뒤에 달라지는 것이 없으면 판정 없이 흘려보낸다', async () => {
    const reply = JSON.stringify({ reason: '근거', kind: 'action', about: 'none', approach: 'none', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통', risk: 'none' });
    const mock = mockLlama([reply, reply]);
    stop = () => {
      changeReply = '{"change":"자리가 바뀜"}';
      mock.server.stop(true);
    };
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect((await gm.interpret(contexts('바위 뒤로 굴러 들어간다').ctx)).kind).not.toBe('idle');
    changeReply = JSON.stringify({ change: NO_CHANGE });
    expect(await gm.interpret(contexts('입술을 깨문다').ctx)).toMatchObject({ kind: 'idle', source: 'llm' });
  });

  describe('입력 종류: 동작 뒤에 달라지는 것으로 가른다', () => {
    const action = JSON.stringify({ reason: '근거', kind: 'action', about: 'none', approach: 'none', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통', risk: 'none' });
    const game = JSON.stringify({ reason: '근거', kind: 'game', about: 'none', approach: 'none', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통', risk: 'none' });
    function gmWith(outputs: string[]) {
      const mock = mockLlama(outputs);
      stop = () => {
        changeReply = '{"change":"자리가 바뀜"}';
        askReply = '{"ask":"게임에 대해 물음"}';
        mock.server.stop(true);
      };
      return new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    }

    test.each([
      ['손을 내려놓고 칼을 받아들인다', [NO_CHANGE, NO_CHANGE]],
      // 하지 않는다고 적은 동작은 모델이 달라진다고 읽어도 세지 않는다.
      ['살길을 찾지 않고 죽음을 기다린다', ['자리가 바뀜', NO_CHANGE]],
      ['손을 내려놓고 칼을 받아들인다', [NO_CHANGE, '물건을 잡거나 씀']],
      ['체념하고 고개를 떨군다', [YIELD_CHANGE, NO_CHANGE]],
    ])('이어진 문장의 동작이 모두 몸에서 끝나면 시도가 아니다: %s', async (text, changes) => {
      const gm = gmWith([action, action, action]);
      changeReply = JSON.stringify({ changes });
      expect(await gm.interpret(contexts(text).ctx)).toMatchObject({ kind: 'idle', source: 'llm' });
    });

    test('낱말이 고정 접근과 같아도 변화 없는 몸짓은 판정을 만들지 않는다', async () => {
      const charm = JSON.stringify({ reason: '근거', label: '미소', question: '', kind: 'action', about: 'none', approach: 'beauty', target: 'beauty', scope: 'ready', deed: '상대에게 미모를 납득시킨다', item: '', odd: false, absurd: false, stat: '매력', difficulty: '보통', risk: 'none' });
      const gm = gmWith([charm, charm, charm]);
      changeReply = JSON.stringify({ change: NO_CHANGE });
      const text = '(생긋 웃는다)';
      expect(await gm.interpret({ ...contexts(text).ctx, input: parseStoryInput(text) })).toMatchObject({ kind: 'idle', source: 'llm' });
    });

    test('하지 않는다고 적은 문장은 낱말이 겹쳐도 시도가 아니다', async () => {
      const charm = JSON.stringify({ reason: '근거', kind: 'action', about: 'none', approach: 'beauty', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통', risk: 'none' });
      const gm = gmWith([charm, charm, charm]);
      changeReply = JSON.stringify({ changes: ['자리가 바뀜', NO_CHANGE] });
      expect(await gm.interpret(contexts('반항하지 않고 생긋 웃는다').ctx)).toMatchObject({ kind: 'idle', source: 'llm' });
    });

    test('이어진 문장에 달라지는 동작이 하나라도 있으면 시도다', async () => {
      const attempt = JSON.stringify({ reason: '상대의 감시에서 벗어나려 한다', label: '거리 벌리기', question: '', kind: 'action', about: 'none', approach: 'none', target: 'resist', scope: 'ready', deed: '상대의 감시를 피해 옆으로 달아난다', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통', risk: 'none' });
      const gm = gmWith([attempt, attempt, attempt]);
      changeReply = JSON.stringify({ changes: [NO_CHANGE, '자리가 바뀜'] });
      expect(await gm.interpret(contexts('고개를 숙이고 옆으로 달려간다').ctx)).toMatchObject({ kind: 'improv', source: 'llm' });
    });

    test('저절로 드러난 몸 상태는 말이 아니라 시도하지 않음으로 간다', async () => {
      const gm = gmWith([action, action, action]);
      changeReply = JSON.stringify({ change: SHOWN_CHANGE });
      expect(await gm.interpret(contexts('눈물을 뚝뚝 흘린다').ctx)).toMatchObject({ kind: 'idle', source: 'llm' });
    });

    test('울음과 함께 건넨 말을 서술해도 몸의 시도로 덮어쓰지 않는다', async () => {
      const person = JSON.stringify({ reason: '건넨 말', kind: 'person', about: 'none', approach: 'none', item: '', risk: 'none' });
      const gm = gmWith([person, person, person]);
      expect(await gm.interpret(contexts('흐느끼며 "그 칼부터 치워 주세요"라고 말한다').ctx)).toMatchObject({ kind: 'talk', to: 'person', source: 'llm' });
    });

    test('드러난 몸 상태의 대꾸는 나레이션이 먼저 그리고 상대가 뒤이어 반응한다', async () => {
      const mock = mockLlama([lines(['나레이션', '눈물이 모래 위로 떨어졌다.'], ['남자', '우는 것으로 살 순 없다.'])]);
      stop = () => mock.server.stop(true);
      const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
      const reply = await gm.talk({ ...contexts('눈물을 뚝뚝 흘린다').ctx, shown: true });
      expect(reply.lines.map((l) => l.speaker)).toEqual(['나레이션', '남자']);
      const [first, second] = mock.requests.at(-1)?.response_format?.json_schema.schema.properties.lines.prefixItems ?? [];
      expect(first?.properties?.speaker.enum).toEqual(['나레이션']);
      expect(second?.properties?.speaker.enum ?? second?.anyOf?.[0]?.properties.speaker.enum).toEqual(['남자']);
    });

    test('물음표 끝 게임 질문은 행동으로 읽혀도 판정으로 가지 않는다', async () => {
      const gm = gmWith([action, game]);
      changeReply = JSON.stringify({ change: NO_CHANGE });
      const text = '불러오기 하면 지금까지 한 거 사라져?';
      expect(await gm.interpret({ ...contexts(text).ctx, input: parseStoryInput(text) })).toMatchObject({ kind: 'ask', source: 'llm' });
    });

    test('물음표로 끝나도 스스로 할 일을 정하는 말이면 시도다', async () => {
      const attempt = JSON.stringify({ reason: '세 사람에게 접근하려 한다', label: '길 묻기', question: '', kind: 'action', about: 'none', approach: 'none', target: 'run', scope: 'ready', deed: '세 사람에게 다가가 길을 묻는다', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통', risk: 'none' });
      const gm = gmWith([attempt, attempt, attempt]);
      askReply = JSON.stringify({ ask: OWN_MOVE });
      const beat = scenario.beats.b02_people;
      if (!beat?.free) throw new Error('세 사람 접근 장면 없음');
      expect(await gm.interpret({ ...contexts('저 사람들한테 가 볼까?').ctx, beat, free: beat.free })).toMatchObject({ kind: 'improv', source: 'llm', target: 'run' });
    });
  });

  test('문장 꼴이 물음이나 건넨 말이면 모델이 혼잣말이나 행동으로 읽어도 바로잡는다', async () => {
    const reply = (kind: string, about = 'none') => JSON.stringify({ reason: '근거', kind, about, approach: 'none', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통' });
    const mock = mockLlama([reply('self'), reply('lore', 'asina'), reply('action'), reply('how'), reply('action'), reply('person'), reply('self'), reply('self')]);
    stop = () => { changeReply = '{"change":"자리가 바뀜"}'; mock.server.stop(true); };
    changeReply = JSON.stringify({ change: NO_CHANGE });
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('그걸 왜 하고 있어?').ctx)).toMatchObject({ kind: 'ask', about: 'asina', source: 'llm', meta: { fallback: false } });
    expect(await gm.interpret({ ...contexts('지금 할 수 있는 게 뭐야?').ctx, input: parseStoryInput('지금 할 수 있는 게 뭐야?') })).toMatchObject({ kind: 'ask', play: true, source: 'llm', meta: { fallback: false } });
    expect(await gm.interpret({ ...contexts('좀 떨어져요').ctx, input: parseStoryInput('좀 떨어져요') })).toMatchObject({ kind: 'talk', to: 'person', source: 'llm', meta: { fallback: false } });
    expect(await gm.interpret(contexts('아 죽겠네').ctx)).toMatchObject({ kind: 'talk', to: 'self', source: 'llm', meta: { fallback: false } });
    expect(mock.requests.filter((r) => r.stream)).toHaveLength(10);
    expect(mock.requests.filter(r => r.messages[0]?.content === CHANGE_SYSTEM)).toHaveLength(2);
    expect(mock.requests.filter(r => Object.hasOwn(r.response_format?.json_schema.schema.properties ?? {}, 'answerable'))).toHaveLength(0);
  });

  test.each([
    { text: '기록을 불러온 뒤 무엇이 남는지 설명해 주세요.', kind: 'game', want: { kind: 'ask', game: 'outcome' } },
    { text: '문 앞에서 본 일이 무엇인지 들려주시겠어요?', kind: 'person', want: { kind: 'talk', to: 'person' } },
    { text: '내가 생각을 좀 정리해야겠네.', kind: 'self', want: { kind: 'talk', to: 'self' } },
  ])('무시도 발화의 수신자는 문장 꼴 대신 목표 없는 독립 문맥에서 고른다: $kind', async ({ text, kind, want }) => {
    const candidate = JSON.stringify({ kind: 'action', approach: 'beauty', target: 'beauty', scope: 'ready', deed: '아름다움으로 흥미를 끈다' });
    const mock = mockLlama([candidate, JSON.stringify({ kind, about: kind === 'game' ? 'outcome' : 'none', approach: 'none' })]);
    stop = () => { changeReply = '{"change":"자리가 바뀜"}'; mock.server.stop(true); };
    changeReply = JSON.stringify({ change: NO_CHANGE });
    const ctx = contexts(text).ctx;
    const result = await new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore)
      .interpret({ ...ctx, input: parseStoryInput(text) });
    expect(result).toMatchObject({ ...want, source: 'llm', meta: { fallback: false } });
    const address = mock.requests.at(-1), goal = ctx.free.goals?.beauty;
    if (!address || !goal) throw new Error('수신자 분류나 원래 목표가 없습니다.');
    expect(address.messages[0]?.content).not.toContain(goal.text);
    expect(address.messages[1]?.content).not.toContain(goal.text);
    expect(address.response_format?.json_schema.schema.properties.target?.enum).toEqual(['local', 'none']);
    expect(mock.fidelityRequests).toHaveLength(0);
  });

  test('실제 증거로 결정을 바꾸려는 질문형 설득은 무시도 수신자 분류로 보내지 않는다', async () => {
    const candidate = JSON.stringify({ kind: 'action', approach: 'plead', target: 'plead', scope: 'ready', deed: '결백의 근거를 끝까지 전달해 잠깐의 여유를 얻었다' });
    const mock = mockLlama([candidate]);
    stop = () => { changeReply = '{"change":"자리가 바뀜"}'; mock.server.stop(true); };
    changeReply = JSON.stringify({ change: '말로 새로운 성취를 시도함' });
    const text = '이 모순이 제가 범인이 아니라는 증거예요. 제 설명을 끝까지 듣고 판단해 주시겠어요?';
    const result = await new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore)
      .interpret({ ...contexts(text).ctx, input: parseStoryInput(text) });
    expect(result).toMatchObject({ kind: 'approach', approach: 'plead', spoken: true, source: 'llm', meta: { fallback: false } });
    expect(mock.fidelityRequests).toHaveLength(1);
    expect(mock.requests.filter(r => r.messages[0]?.content !== CHANGE_SYSTEM)).toHaveLength(1);
  });

  test('물음 꼴이어도 다시 가려 혼잣말이면 혼잣말로 받고, 물음이면 물음으로 받는다', async () => {
    const reply = (kind: string) => JSON.stringify({ reason: '근거', kind, about: 'none', approach: 'none', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통' });
    const mock = mockLlama([reply('self'), reply('self'), reply('self'), reply('how')]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('내가 여기서 뭘 하는 거지').ctx)).toMatchObject({ kind: 'talk', to: 'self' });
    expect(await gm.interpret(contexts('지금 뭘 해야 돼?').ctx)).toMatchObject({ kind: 'ask' });
  });

  test('자기 자신을 두고 물음표를 찍은 말은 다시 읽을 때 혼잣말을 고를 수 없다', async () => {
    const reply = (kind: string) => JSON.stringify({ reason: '근거', kind, about: 'none', approach: 'none', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통' });
    const mock = mockLlama([reply('self'), reply('lore'), reply('lore')]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('내가 귀족이라고?').ctx)).toMatchObject({ kind: 'ask' });
    expect(mock.requests.some((r) => JSON.stringify(r).includes('kind 는 how, lore, game 중에서'))).toBe(true);
  });

  test('문장 끝에서 자기를 가리키는 물음도 자기 자신을 묻는 말이다', () => {
    for (const text of ['여기 주인공이 나야?', '범인이 나라고?', '그 공녀가 나였어?']) expect(isAboutSelf(text)).toBe(true);
    for (const text of ['저 사람은 나그네야?', '나무야?', '이게 맞나']) expect(isAboutSelf(text)).toBe(false);
  });

  test('이 세계에 없는 물건을 쓰는 행동은 접근법을 골랐어도 세계 밖 행동으로 받는다', async () => {
    const reply = JSON.stringify({ reason: '근거', kind: 'action', about: 'none', approach: 'plead', item: '', odd: false, absurd: true, bold: false, deed: '', stat: '재치', difficulty: '보통', risk: 'none' });
    const mock = mockLlama([reply]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('라이터를 켠다').ctx)).toMatchObject({ kind: 'improv', absurd: true });
  });

  test('큰 신체 행동은 같은 목적의 말 접근법에 가리지 않고 실제 시도를 남긴다', async () => {
    const reply = (kind: string, bold: boolean) => JSON.stringify({
      reason: '상대와 접촉하려 함', kind, about: 'none', approach: 'beauty', item: '',
      label: '입맞춤', question: '', target: kind === 'action' ? 'local' : 'none', scope: kind === 'action' ? 'ready' : 'none',
      odd: false, absurd: false, bold, deed: '남자의 입에 입을 맞추려 했다', stat: '매력', difficulty: '어려움', risk: 'none',
    });
    const mock = mockLlama([reply('action', true), reply('person', false)]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('남자에게 입을 맞춘다').ctx))
      .toMatchObject({ kind: 'improv', bold: true, deed: '남자의 입에 입을 맞추려 했다' });
    expect(await gm.interpret(contexts('제 얼굴을 보고도 베실 수 있어요?').ctx))
      .toMatchObject({ kind: 'approach', approach: 'beauty', spoken: true });
  });

  test('행동 꼴이 아닌 말을 몸이 하는 일로 읽으면 판정 전에 다시 가린다', async () => {
    const reply = (kind: string) => JSON.stringify({ reason: '근거', kind, about: 'none', approach: 'none', item: '', odd: false, absurd: false, bold: false, deed: '', stat: '재치', difficulty: '보통', risk: 'none' });
    const mock = mockLlama([reply('action'), reply('self'), reply('self')]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('배에서 꼬르륵 소리 나').ctx)).toMatchObject({ kind: 'talk', to: 'self' });
  });

  test('혼잣말이 끝까지 위반하면 대본의 대체 줄 대신 말이 흩어지는 나레이션으로 받는다', async () => {
    const bad = lines(['속마음', '나는 크롬웰의 공녀다.']);
    const mock = mockLlama([bad, bad, bad]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const { ctx } = contexts('내가 미쳤지');
    const reply = await gm.talk({ ...ctx, self: true });
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines.map((l) => l.speaker)).toEqual(['나레이션']);
    expect(ctx.free.talk_fallback.map((l) => l.text)).not.toContain(reply.lines[0]?.text);
  });

  test('혼잣말로 읽은 입력은 게임에 건넨 말인지 한 번 더 가린다', async () => {
    const reply = (kind: string, about = 'none') => JSON.stringify({ reason: '근거', kind, about, risk: 'none', approach: 'none', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통' });
    const mock = mockLlama([reply('self'), reply('game', 'quit')]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('이제 그만 하고 싶은데').ctx)).toMatchObject({ kind: 'ask', game: 'quit' });
    expect(JSON.stringify(mock.requests.at(-1))).toContain('혼잣말인지');
  });

  test('답할 항목이 없는 세계 물음은 게임 자체를 묻는 말인지 한 번 더 가린다', async () => {
    const reply = (kind: string, about = 'none') => JSON.stringify({ reason: '근거', kind, about, risk: 'none', approach: 'none', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통' });
    const mock = mockLlama([reply('lore'), reply('game', 'ai')]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('근데 이거 누가 만든 거야?').ctx)).toMatchObject({ kind: 'ask', game: 'ai' });
    expect(JSON.stringify(mock.requests.at(-1))).toContain('이 게임 자체를 묻는지');
  });

  test('사람을 묻는 질문에 모른다고 답하면 다른 답으로 막지 않는다', async () => {
    const mock = mockLlama([JSON.stringify({ subject: '남자', relation: '미래의 추적 기간', answerType: '기간', answerable: false, evidence: [] })]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const reply = await gm.explain({ ...contexts('이 사람 언제까지 쫓아올까?').ctx, about: 'man' });
    expect(reply.lines).toEqual([{ speaker: 'GM', text: '그건 아직 몰라.' }]);
    expect(reply.meta.fallback).toBe(false);
  });

  test('답할 공개 관계 근거가 없으면 생성 없이 모른다고 답한다', async () => {
    const mock = mockLlama([JSON.stringify({ subject: '남자', relation: '추적하지 않는 이유', answerType: '이유', answerable: false, evidence: [] })]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const reply = await gm.explain({ ...contexts('저 남자는 왜 안 쫓아와?').ctx, about: 'none' });
    expect(reply.lines).toEqual([{ speaker: 'GM', text: '그건 아직 몰라.' }]);
    expect(mock.requests.filter((r) => r.stream)).toHaveLength(1);
  });

  test('지도와 호소의 혼합 입력은 몸짓·말을 함께 해석하고 지도 접근과 소지품을 보존한다', async () => {
    const reading = JSON.stringify({ reason: '지도를 꺼내 길을 잃었음을 보인다', label: '지도 제시', question: '', kind: 'action', about: 'none', approach: 'bag', item: 'magic_bag', target: 'bag', scope: 'ready', deed: '낡은 지도를 꺼내 길을 잃었음을 보인다', stat: '재치', difficulty: '보통', odd: false, absurd: false, bold: false, risk: 'none' });
    const mock = mockLlama([reading, reading]);
    const previousChange = changeReply;
    changeReply = JSON.stringify({ change: '물건을 잡거나 씀', changes: ['물건을 잡거나 씀', '물건을 잡거나 씀'] });
    stop = () => { changeReply = previousChange; mock.server.stop(true); };
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const inputs = ['(지도를 꺼낸다)', '(가방에서 낡은 지도를 꺼내 보여 준다) 길을 잃었을 뿐이에요.'];
    for (const text of inputs) {
      expect(await gm.interpret({ ...contexts(text).ctx, input: parseStoryInput(text) })).toMatchObject({ kind: 'approach', approach: 'bag', item: 'magic_bag', source: 'llm' });
    }
    const interpretations = mock.requests.filter((r) => r.stream && r.messages[0]?.content !== CHANGE_SYSTEM);
    expect(interpretations).toHaveLength(2);
    for (const [index, input] of inputs.entries()) expect(interpretations[index]?.messages[1]?.content).toContain(input);
  });

  test('게임 질문과 위험 여부를 해석이 내고, 자기 물음은 앞사람이 있어도 물음 종류로 다시 고른다', async () => {
    const reply = (kind: string, about = 'none', risk = 'none', approach = 'none') => JSON.stringify({ reason: '근거', label: '박치기', question: '', kind, about, risk, approach, target: kind === 'action' ? 'local' : 'none', scope: kind === 'action' ? 'ready' : 'none', deed: kind === 'action' ? '머리로 남자를 밀친다' : '', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통' });
    const mock = mockLlama([
      reply('game', 'luck'),
      reply('game', 'none'),
      reply('game', 'ai'),
      reply('lore', 'save'),
      reply('action', 'none', 'attack'),
      reply('person', 'none', 'identity', 'plead'),
      reply('self', 'none', 'identity'),
      reply('person', 'none', 'none', 'plead'),
      reply('lore', 'asina'),
      reply('person'),
      reply('person'),
    ]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const read = (text: string) => gm.interpret(contexts(text).ctx);
    expect(await read('운이 좋다는 건')).toMatchObject({ kind: 'ask', game: 'luck' });
    expect(await read('그건 그렇고')).toMatchObject({ kind: 'ask', game: 'ai' });
    expect(await read('그건 또')).toMatchObject({ kind: 'ask', game: 'save' });
    expect(await read('머리로 들이받는다')).toMatchObject({ kind: 'improv', risk: 'attack' });
    expect(await read('제가 그 사람이에요')).toMatchObject({ kind: 'approach', risk: 'identity' });
    expect(await read('그 사람인가 나는')).not.toHaveProperty('risk');
    expect(await read('내 고향이 어디였지?')).toMatchObject({ kind: 'ask', about: 'asina' });
    expect(await read('당신은 대체 뭐야?')).toMatchObject({ kind: 'talk', to: 'person' });
    expect(mock.requests.filter((r) => r.stream && r.messages[0]?.content !== CHANGE_SYSTEM)).toHaveLength(11);
  });

  test('글자 없는 입력은 모델 없이 대체 줄로 받고, 귀찌를 풀려는 입력은 모델 없이 위험으로 본다', async () => {
    const mock = mockLlama([]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const { ctx } = contexts('?');
    expect(await gm.interpret(ctx)).toMatchObject({ kind: 'talk', source: 'rule' });
    const reply = await gm.talk(ctx);
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines.length).toBeGreaterThan(0);
    expect(await gm.interpret(contexts('귀찌를 뗀다').ctx)).toMatchObject({ kind: 'talk', risk: 'unmask', source: 'rule' });
    expect(mock.requests.length).toBe(0);
  });

  test('모델이 없으면 정체를 밝히는 낱말과 화면 용어를 낱말로 받는다', async () => {
    const gm = new LocalGm(null, lore);
    expect(await gm.interpret(contexts('난 공녀다').ctx)).toMatchObject({ risk: 'identity', source: 'rule' });
    expect(await gm.interpret(contexts('공녀가 무슨 뜻이야?').ctx)).not.toHaveProperty('risk');
    expect(await gm.interpret(contexts('귀찌 수명이 뭐야?').ctx)).toMatchObject({ kind: 'ask', game: 'earring' });
  });

  test('연출이 판정 결과와 반대면 다시 쓰게 한다', async () => {
    const mock = mockLlama([lines(['나레이션', '주먹은 허공을 갈랐다.'], ['남자', '우습군.']), lines(['나레이션', '주먹이 남자의 어깨를 스쳤다.'], ['남자', '제법이군.'])]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const { narrate } = contexts('주먹을 내지른다');
    const reply = await gm.narrate(narrate);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.join(' ')).toContain('tier_mismatch');
    expect(reply.lines[0]?.text).toContain('스쳤다');
  });

  test('현대 물건은 어이없는 즉흥 행동으로, 등급에 맞지 않는 입력과 뜻 모를 글자는 대꾸로 LLM 없이 받는다', async () => {
    const mock = mockLlama([]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('총을 꺼내 쏜다').ctx)).toMatchObject({ kind: 'improv', absurd: true, difficulty: -1, source: 'rule' });
    expect(await gm.interpret(contexts('옷을 벗는다').ctx)).toMatchObject({ kind: 'talk', tone: 'deflect', source: 'rule' });
    expect(await gm.interpret(contexts('ㅋㅋㅋ').ctx)).toMatchObject({ kind: 'talk', source: 'rule' });
    expect(mock.requests.length).toBe(0);
  });

  test('자유 입력 비트에 들어서면 시스템 프롬프트를 미리 데운다', async () => {
    const mock = mockLlama([]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const { ctx } = contexts('');
    gm.prepare({ scenario: ctx.scenario, beat: ctx.beat, free: ctx.free, state: ctx.state });
    await mock.warmSeen;
    expect(mock.requests[0]?.max_tokens).toBe(1);
    expect(mock.requests[0]?.messages[0]?.content).toContain('이번 장면: 왜지?');
  });
});

describe('규칙 해석과 주소 제한', () => {
  test('키워드로 행동을 고르고, 질문은 대화로 본다', () => {
    const free = scenario.beats.b05_why?.free;
    if (!free) throw new Error('b05_why 에 free 가 없습니다');
    const items = scenario.sheet.items.map((i) => i.id);
    expect(ruleInterpret(free, '후드를 벗고 생긋 웃는다', items, lore)).toMatchObject({ approach: 'beauty' });
    expect(ruleInterpret(free, '가방에서 지도를 꺼내 보여 준다', items, lore)).toMatchObject({ approach: 'bag', item: 'magic_bag' });
    expect(ruleInterpret(free, '당신 누구예요?', items, lore)).toEqual({ kind: 'talk' });
    expect(ruleInterpret(free, '지도를 꺼낸다', items, lore)).toMatchObject({ approach: 'bag', item: 'magic_bag' });
    expect(ruleInterpret(free, '가방에서 지도를 꺼낸다', [], lore)).toMatchObject({ kind: 'improv', absurd: false });
  });

  test('배경 질문은 GM 설명으로, 인물에게 하는 말은 대화로 본다', () => {
    const free = scenario.beats.b05_why?.free;
    if (!free) throw new Error('b05_why 에 free 가 없습니다');
    const items = scenario.sheet.items.map((i) => i.id);
    for (const q of ['크롬웰이 뭐야?', '저 남자 누구야?', '여기가 어디야', '귀찌가 뭐지?', '크롬웰은 어떤 나라야?']) expect(ruleInterpret(free, q, items, lore)).toEqual({ kind: 'ask', why: false });
    for (const q of ['너 누구야?', '당신 누구예요?', '왜냐하면 저는 미소녀니까요?', '너 몇 살이야']) expect(ruleInterpret(free, q, items, lore)).not.toEqual({ kind: 'ask' });
  });

  test('GM 설명은 스포일러를 막고 다시 쓰며, 공개된 아시나의 배경만 말한다', async () => {
    const ok = '게임 마스터로서 말하면, 아시나는 크롬웰 제국 출신이야.';
    const mock = mockLlama([lines(['GM', '저 남자는 베히다트, 페시안의 왕이다.']), lines(['GM', '여긴 페시안이야.']), lines(['GM', ok], ['GM', '칼끝은 여전히 목에 닿아 있어.']), '{"answer":true}']);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, budgetMs: 60_000 });
    const ctx = contexts('아시나는 누구야?').ctx;
    const note = lore.knowledge.find(entry => entry.name === '아시나');
    if (!note) throw new Error('주인공 공개 정본 없음');
    const reply = await gm.explain({ ...ctx, inquiry: { question: ctx.text, subject: '아시나', relation: '공개된 배경', answerType: '인물 소개', evidence: [{ source: `note:${note.id}`, quote: note.text }] } });
    expect(reply.meta.attempts).toBe(3);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.violations.some((v) => v.includes('베히다트'))).toBe(true);
    expect(reply.meta.violations.some((v) => v.includes('페시안'))).toBe(true);
    expect(reply.lines.map((l) => l.speaker)).toEqual(['GM', 'GM']);
    expect(reply.lines[0]?.text).toBe(ok);
    expect(mock.requests[0]?.messages.at(-1)?.content).toContain('할 일: 배경 설명');
  });

  test('인물 대사에서는 "게임 마스터"를 계속 막는다', () => {
    const out = validateOutput(lines(['남자', '게임 마스터라도 되는 건가?']), checkFor(['남자']));
    expect(out.violations.some((v) => v.rule === 'meta')).toBe(true);
  });

  test('LLM 없이 관계를 검수하지 못하면 공개 note도 무검증 답변으로 내지 않는다', async () => {
    const gm = new LocalGm(null, lore);
    const ask = async (q: string) => (await gm.explain(contexts(q).ctx)).lines.map((l) => l.text).join(' ');
    expect(await ask('크롬웰이 뭐야?')).toBe('그건 아직 몰라.');
    expect(await ask('크롬웰이 뭐야?')).not.toMatch(/페시안|적국/);
    expect(await ask('저 남자 누구야?')).toBe('그건 아직 몰라.');
    expect(await ask('베히다트가 누구야?')).toBe('그건 아직 몰라.');
  });

  test('왜 묻는 말은 설정을 물을 때만 여우에게 간다', () => {
    const free = scenario.beats.b05_why?.free;
    if (!free) throw new Error('b05_why 에 free 가 없습니다');
    const items = scenario.sheet.items.map((i) => i.id);
    expect(ruleInterpret(free, '근데 왜 변장했어?', items, lore)).toEqual({ kind: 'ask', why: true });
    for (const q of ['왜 죽여요?', '왜 여기 있어?', '왜 변장했냐고 묻는 거예요?']) expect(ruleInterpret(free, q, items, lore)).not.toEqual({ kind: 'ask' });
  });

  test('여우 줄이 "다"로 끝나면 막고, 변장이 풀린 줄과 없는 인물은 대사와 내레이션에서만 막는다', () => {
    const rules = (raw: string, speakers: string[], absent: string[] = []) => validateOutput(raw, { ...checkFor(speakers), absent }).violations.map((v) => v.rule);
    expect(rules(lines(['GM', '여긴 죽음의 사막 지르다다.']), ['GM'])).toContain('gm_voice');
    expect(rules(lines(['GM', '여긴 죽음의 사막 지르다야.']), ['GM'])).toEqual([]);
    expect(rules(lines(['나레이션', '감춰져 있던 은발이 쏟아져 내렸다.']), ['나레이션'])).toContain('exposed');
    expect(rules(lines(['GM', '본모습은 은발이야.']), ['GM'])).toEqual([]);
    expect(rules(lines(['나레이션', '바라보던 남자가 헛웃음을 터뜨렸다.']), ['나레이션'], ['남자'])).toContain('absent');
  });

  test('혼자인 장면에 남자를 쓴 모델 줄은 다시 쓰고, 남자 줄의 "하."와 물병은 고친다', async () => {
    const mock = mockLlama([
      lines(['나레이션', '바라보던 남자가 헛웃음을 터뜨렸다.'], ['속마음', '뭐 하는 거야.']),
      // 아시나의 속마음도 플레이어 못이라 GM 이 지어 쓰지 않는다(혼자말 제외). 여기서는 내레이션 두 줄이 통과한다.
      lines(['나레이션', '모래가 발목을 휘감았다.'], ['나레이션', '물병이 가벼워져 있었다.']),
      lines(['남자', '하. 웃기는군.']),
    ]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, budgetMs: 60_000 });
    const beat = scenario.beats.b02_people;
    if (!beat?.free) throw new Error('b02_people 에 free 가 없습니다');
    const { state } = new Engine(scenario, new FakeGm()).newGame(1, 'alone');
    const alone = await gm.talk({ scenario, beat, free: beat.free, state, text: '춤을 춘다' });
    expect(alone.meta.attempts).toBe(2);
    expect(alone.lines.map((l) => l.text)).toEqual(['모래가 발목을 휘감았다.', '물통이 가벼워져 있었다.']);
    const facing = await gm.talk(contexts('뭐라고?').ctx);
    expect(facing.lines[0]?.text).toBe('웃기는군.');
  });

  test('LLM 이 말이라고 읽어도 행동을 적은 입력은 판정으로 받는다', async () => {
    const mock = mockLlama([
      JSON.stringify({ reason: '말', kind: 'person', about: 'none', approach: 'none', item: '', stat: '재치', difficulty: '보통', absurd: false }),
      JSON.stringify({ reason: '모래를 쌓는 시도', label: '모래성 쌓기', question: '', kind: 'action', about: 'none', approach: 'none', target: 'local', scope: 'ready', deed: '모래를 쌓아 작은 성을 만든다', item: '', stat: '손재주', difficulty: '보통', odd: false, absurd: false }),
    ]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, budgetMs: 60_000 });
    expect((await gm.interpret(contexts('모래성을 쌓는다').ctx)).kind).toBe('improv');
  });

  test('GM 은 이 컴퓨터 안의 LLM 서버 주소만 받는다', () => {
    expect(() => assertLoopback('https://api.openai.com/v1')).toThrow();
    expect(() => assertLoopback('http://192.168.0.10:8080')).toThrow();
    expect(() => assertLoopback('https://127.0.0.1:18080')).toThrow();
    expect(assertLoopback('http://127.0.0.1:18080').hostname).toBe('127.0.0.1');
    expect(assertLoopback('http://localhost:18080').hostname).toBe('localhost');
  });
});


describe('아시나 속마음과 여우 한 줄', () => {
  test('앞에 사람이 있어도 혼잣말이면 상대의 줄을 요구해 다시 쓰지 않는다', async () => {
    const mock = mockLlama([lines(['속마음', '입이 바짝 마른다. 조금만 더 가자.'])]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, budgetMs: 60_000 });
    const beat = scenario.beats.b06_swing;
    if (!beat?.free) throw new Error('b06_swing 에 free 가 없습니다');
    const { state } = new Engine(scenario, new FakeGm()).newGame(1, 'self');
    const self = await gm.talk({ scenario, beat, free: beat.free, state, text: '망했다 정말', self: true });
    expect(self.meta.attempts).toBe(1);
    expect(self.lines.map((l) => l.speaker)).toEqual(['속마음']);
  });

  test('혼자인 장면의 혼잣말이면 속마음 줄이 통과하고, 그렇지 않으면 다시 쓴다', async () => {
    const mock = mockLlama([
      lines(['속마음', '입이 바짝 마른다. 조금만 더 가자.']),
      lines(['속마음', '입이 바짝 마른다. 조금만 더 가자.']),
      lines(['나레이션', '바람이 모래를 쓸고 지나갔다.']),
    ]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, budgetMs: 60_000 });
    const beat = scenario.beats.b02_people;
    if (!beat?.free) throw new Error('b02_people 에 free 가 없습니다');
    const { state } = new Engine(scenario, new FakeGm()).newGame(1, 'self');
    const self = await gm.talk({ scenario, beat, free: beat.free, state, text: '숨 좀 돌리자', self: true });
    expect(self.meta.attempts).toBe(1);
    expect(self.lines.map((l) => l.speaker)).toEqual(['속마음']);
    const acted = await gm.talk({ scenario, beat, free: beat.free, state, text: '한숨을 쉰다' });
    expect(acted.meta.attempts).toBe(2);
    expect(acted.lines.map((l) => l.speaker)).toEqual(['나레이션']);
  });

  test('여우 한 줄 생성이 모두 막히면 설정 사전의 감탄 가운데 한 줄을 대신 내고 fallback 으로 표시한다', async () => {
    const bad = lines(['남자', '혼자 뭐 하는 거냐.']);
    const mock = mockLlama([bad, bad, bad, bad]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, budgetMs: 60_000 });
    const beat = scenario.beats.b02_people;
    if (!beat?.free) throw new Error('b02_people 에 free 가 없습니다');
    const { state } = new Engine(scenario, new FakeGm()).newGame(1, 'quip');
    const quip = await gm.quip({ scenario, beat, free: beat.free, state, text: '물구나무를 선다' });
    expect(quip.meta.fallback).toBe(true);
    expect(quip.lines).toHaveLength(1);
    expect(lore.gmQuips).toContain(quip.lines[0]?.text ?? '');
  });
});

describe('이번 판 되풀이와 엔진 상태', () => {
  const REPLY = lines(['나레이션', '칼끝이 손가락 한 마디만큼 물러났다.'], ['남자', '거짓은 아닌 모양이군.']);
  const HOOD_OFF = lines(['나레이션', '후드가 어깨 너머로 젖혀졌다.'], ['남자', '거짓은 아닌 모양이군.']);
  const YES = JSON.stringify({ answer: true });
  const NO = JSON.stringify({ answer: false });
  const gmOn = (url: string) => new LocalGm(new LlmClient({ baseUrl: url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, retries: 2, softRetries: 1 });
  const withSpoken = (ctx: NarrateContext, spoken: Record<string, string[]>): NarrateContext => ({ ...ctx, state: { ...ctx.state, spoken } });
  const neutral = (ctx: NarrateContext, gist = '칼끝이 조금 물러난다.'): NarrateContext => ({ ...ctx, outcome: { ...ctx.outcome, gist } });

  test('입력 해석과 줄 쓰기를 분리하고 독립 시도 검수에 후보 목표를 되먹이지 않는다', async () => {
    const candidate = JSON.stringify({ kind: 'action', about: 'none', risk: 'none', approach: 'beauty', target: 'beauty', scope: 'ready', deed: '아름다움으로 상대의 흥미를 끈다', item: '' });
    const mock = mockLlama([JSON.stringify({ kind: 'person', about: 'none', risk: 'none', approach: 'none', item: '' }), REPLY, candidate]);
    stop = () => { changeReply = '{"change":"자리가 바뀜"}'; mock.server.stop(true); };
    const gm = gmOn(mock.url);
    const { ctx, narrate } = contexts('억울해요!');
    await gm.interpret(ctx);
    await gm.narrate(neutral(narrate));
    expect(mock.requests[1]?.messages[0]?.content).not.toBe(mock.requests[0]?.messages[0]?.content);
    expect(Object.hasOwn(mock.requests[0]?.response_format?.json_schema.schema.properties ?? {}, 'kind')).toBe(true);
    expect(Object.hasOwn(mock.requests[0]?.response_format?.json_schema.schema.properties ?? {}, 'lines')).toBe(false);
    expect(Object.hasOwn(mock.requests[1]?.response_format?.json_schema.schema.properties ?? {}, 'lines')).toBe(true);
    changeReply = JSON.stringify({ change: '눈앞의 상황을 확인함' });
    const text = '(상대를 바라본다) 기분 안 좋으세요?';
    expect(await gm.interpret({ ...contexts(text).ctx, input: parseStoryInput(text) })).toMatchObject({ kind: 'talk', to: 'person' });
    const probe = mock.requests.findLast(r => r.messages[0]?.content === CHANGE_SYSTEM);
    const goal = ctx.free.goals?.beauty;
    if (!probe || !goal) throw new Error('독립 검수 요청이나 후보 목표가 없습니다.');
    expect(probe.messages[1]?.content).not.toContain(goal.text);
  });

  test('이번 판에 이미 한 말을 처음 프롬프트부터 알린다', async () => {
    const mock = mockLlama([REPLY]);
    stop = () => mock.server.stop(true);
    await gmOn(mock.url).narrate(withSpoken(neutral(contexts('억울해요!').narrate), { 남자: ['…뭐?'] }));
    expect(mock.requests[0]?.messages[1]?.content).toContain('…뭐?');
  });

  test('같은 인물이 이번 판에 이미 한 말은 짧아도 다시 쓰게 한다', async () => {
    const mock = mockLlama([lines(['남자', '…뭐?']), REPLY]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).narrate(withSpoken(neutral(contexts('억울해요!').narrate), { 남자: ['…뭐?'] }));
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('beat/repeat_play'))).toBe(true);
    expect(mock.requests[1]?.messages[1]?.content).toContain('…뭐?');
    expect(reply.lines.map((l) => l.text)).not.toContain('…뭐?');
  });

  test('다른 인물이 한 말은 되풀이가 아니다', async () => {
    const mock = mockLlama([lines(['나레이션', '칼끝이 손가락 한 마디만큼 물러났다.'], ['남자', '…뭐?'])]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).narrate(withSpoken(neutral(contexts('억울해요!').narrate), { 아시나: ['…뭐?'] }));
    expect(reply.meta.attempts).toBe(1);
    expect(reply.meta.violations).toEqual([]);
  });

  test.each([
    { previous: ['그게 전부인가?', '그게 한계인가?'], draft: '벌써 지친 건가?', reason: '끝맺음' },
  ])('직전 두 줄과 같은 $reason 반응은 다시 쓰고 다른 구조를 표시한다', async ({ previous, draft, reason }) => {
    const mock = mockLlama([lines(['남자', draft]), NO, YES, lines(['남자', '이 떨리는 소리부터 멈춰.']), NO, YES]);
    stop = () => mock.server.stop(true);
    const base = contexts('이가 덜덜 떨려 말이 안 나온다').ctx;
    const reply = await gmOn(mock.url).talk({ ...base, reaction: true, state: { ...base.state, spoken: { 남자: [...previous] } } });
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.lines.find(l => l.speaker === '남자')?.text).toBe('이 떨리는 소리부터 멈춰.');
    expect(reply.meta.violations.some(v => v.startsWith('beat/reaction_repeat'))).toBe(true);
    expect(mock.requests.some(req => req.messages[1]?.content.includes('직전 대사') && req.messages[1]?.content.includes(reason))).toBe(true);
  });

  test.each([
    { previous: ['나그네, 고개를 들어라.', '눈을 피하지 마라.'], draft: '나그네, 아직 버티는군.' },
    { previous: ['상인, 대답해라.', '그게 한계인가?'], draft: '상인, 겁이 난 건가?' },
  ])('같은 호칭으로 서로 다른 반응을 하면 불필요하게 재생성하지 않는다($draft)', async ({ previous, draft }) => {
    const mock = mockLlama([lines(['남자', draft]), NO, YES]);
    stop = () => mock.server.stop(true);
    const base = contexts('이가 덜덜 떨려 말이 안 나온다').ctx;
    const reply = await gmOn(mock.url).talk({ ...base, reaction: true, state: { ...base.state, spoken: { 남자: [...previous] } } });
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.attempts).toBe(1);
    expect(reply.lines.find((line) => line.speaker === '남자')?.text).toBe(draft);
    expect(reply.meta.violations.filter((violation) => violation.startsWith('beat/reaction_repeat'))).toEqual([]);
  });

  test('재시도 예산 소진 뒤 반복만 남은 초안은 침묵 대신 채택한다', async () => {
    const mock = mockLlama([lines(['남자', '벌써 이가 부딪히는 건가?']), NO, YES]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, {
      ...DEFAULT_GM_OPTIONS, retries: 0, softRetries: 0,
    });
    const base = contexts('이가 덜덜 떨려 말이 안 나온다').ctx;
    const reply = await gm.talk({ ...base, reaction: true, state: { ...base.state, spoken: {
      남자: ['그게 전부인가?', '그게 한계인가?'],
    } } });
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.attempts).toBe(1);
    expect(reply.lines.find(l => l.speaker === '남자')?.text).toBe('벌써 이가 부딪히는 건가?');
    expect(reply.meta.violations.every(v => v.startsWith('beat/reaction_repeat'))).toBe(true);
    expect(reply.meta.violations.length).toBeGreaterThan(0);
  });

  test.each(['talk', 'narrate'] as const)('직접 대화·큰 행동의 %s 반응이 말 없는 줄이면 다시 쓴다', async mode => {
    const draft = (text: string) => mode === 'talk'
      ? lines(['남자', text, 'menacing'])
      : lines(['나레이션', '양손으로 손목을 붙잡자 칼날이 옆으로 비껴갔다.'],
        ['남자', text, 'menacing'], ['나레이션', '남자의 눈이 가늘어졌다.']);
    const mock = mockLlama([draft('…….'), draft('그 손부터 놓아라.')]);
    stop = () => mock.server.stop(true);
    const gm = gmOn(mock.url);
    const base = contexts('칼을 든 손목을 양손으로 잡아 옆으로 밀어낸다.');
    const reply = mode === 'talk' ? await gm.talk(base.ctx)
      : await gm.narrate({ ...neutral(base.narrate), improv: {
        deed: '남자의 손목을 잡아 옆으로 밀어냈다.', bold: true, absurd: false,
      } });
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some(v => v.startsWith('beat/reaction_response'))).toBe(true);
    expect(reply.lines.find(line => line.speaker === '남자')?.text).toBe('그 손부터 놓아라.');
  });

  test('직접 큰 행동의 hard 위반은 시간·횟수 예산이 0이어도 두 번 다시 쓴다', async () => {
    const failed = lines(['나레이션', '내 손은 허공을 갈랐다.'], ['남자', '멈춰라.'], ['나레이션', '남자의 눈이 가늘어졌다.']);
    const corrected = lines(['나레이션', '손목을 밀자 칼날이 옆으로 비껴갔다.'], ['남자', '그 손부터 놓아라.'], ['나레이션', '남자의 눈이 가늘어졌다.']);
    const mock = mockLlama([failed, failed, corrected]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, {
      ...DEFAULT_GM_OPTIONS, retries: 0, budgetMs: 0,
    });
    const base = neutral(contexts('칼을 든 손목을 양손으로 잡아 옆으로 밀어낸다.').narrate);
    const gist = '손목을 붙잡은 힘에 칼날이 목에서 비껴난다.';
    const reply = await gm.narrate({ ...base, outcome: { ...base.outcome, gist }, improv: {
      deed: '남자의 손목을 잡아 옆으로 밀어냈다.', bold: true, absurd: false,
    } });
    expect(reply.meta.attempts).toBe(3);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.lines.find(line => line.speaker === '남자')?.text).toBe('그 손부터 놓아라.');
    expect(mock.requests.some(request => request.messages[1]?.content.includes('엔진이 정한 결과') && request.messages[1]?.content.includes(gist))).toBe(true);
  });

  test('큰 행동이어도 soft 반복만 남으면 설정한 재시도 횟수를 늘리지 않는다', async () => {
    const draft = lines(['나레이션', '손목을 밀자 칼날이 옆으로 비껴갔다.'], ['남자', '상인, 그 손부터 놓아라.'], ['나레이션', '남자의 눈이 가늘어졌다.']);
    const mock = mockLlama([draft]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, {
      ...DEFAULT_GM_OPTIONS, retries: 0,
    });
    const base = neutral(contexts('칼을 든 손목을 양손으로 잡아 옆으로 밀어낸다.').narrate);
    const reply = await gm.narrate({
      ...base, state: { ...base.state, spoken: { 남자: ['상인, 눈을 들어라.'] } },
      improv: { deed: '남자의 손목을 잡아 옆으로 밀어냈다.', bold: true, absurd: false },
    });
    expect(reply.meta.attempts).toBe(1);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.violations.every(v => v.startsWith('beat/reaction_repeat'))).toBe(true);
  });

  test.each([
    { tier: 'hit', gist: '붙잡은 손목이 밀리며 칼끝이 목에서 비껴났다.' },
    { tier: 'miss', gist: '손을 뻗었지만 남자가 내 손목을 잡아 멈춰 세웠다.' },
  ] as const)('큰 행동 $tier 대체에도 엔진 결과와 기존 인물 대사가 남는다', async ({ tier, gist }) => {
    const base = neutral(contexts('칼을 든 손목을 양손으로 잡아 옆으로 밀어낸다.').narrate);
    const pool = lore.characters.베히다트?.reactions?.[tier] ?? [];
    const reply = await new LocalGm(null, lore).narrate({
      ...base, state: { ...base.state, spoken: { 남자: pool.map(line => line.text) } },
      roll: { ...base.roll, tier }, outcome: { ...base.outcome, gist },
      improv: { deed: '남자의 손목을 잡아 옆으로 밀어냈다.', bold: true, absurd: false },
    });
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines.some(line => line.speaker === '나레이션' && line.text.includes(gist))).toBe(true);
    const authored = base.outcome.lines.filter(line => scenario.cast[line.speaker]?.style === 'speech').map(line => line.text);
    expect(reply.lines.some(line => line.speaker === '남자' && [...pool.map(item => item.text), ...authored].includes(line.text))).toBe(true);
    if (tier === 'miss') expect(reply.lines.some(line => line.text.startsWith('남자의 손목을 잡아 옆으로 밀어냈다.'))).toBe(false);
  });

  test('끝내 되풀이하면 대체 문구도 이번 판에 안 쓴 말에서 고른다', async () => {
    const pool = lore.characters['베히다트']?.reactions?.hit ?? [];
    expect(pool.length).toBeGreaterThan(1);
    const unused = pool.at(-1)?.text;
    const mock = mockLlama([lines(['남자', '…뭐?']), lines(['남자', '…뭐?']), lines(['남자', '…뭐?'])]);
    stop = () => mock.server.stop(true);
    const spoken = { 남자: ['…뭐?', ...pool.slice(0, -1).map((p) => p.text)] };
    const improvised: NarrateContext = { ...withSpoken(neutral(contexts('모래를 뿌린다').narrate), spoken), improv: { deed: '모래를 뿌렸다', bold: true, absurd: false } };
    const reply = await gmOn(mock.url).narrate(improvised);
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines.find((l) => l.speaker === '남자')?.text).toBe(unused as string);
  });

  test('명시된 소지품 압수 대가는 서술할 수 있고 대가 없는 상실은 막는다', async () => {
    const loss = lines(['나레이션', '호위가 내 가방을 빼앗았다.'], ['남자', '가만히 있어라.']);
    const mock = mockLlama([loss, loss, REPLY]);
    stop = () => mock.server.stop(true);
    const gm = gmOn(mock.url);
    const ctx = neutral(contexts('남자에게 다가간다').narrate);
    const allowed = await gm.narrate({ ...ctx, price: {
      id: 'bag_taken', tag: '소지품', weight: 'hard', text: '호위가 가방을 빼앗았다.',
      effects: { lose: ['magic_bag'] },
    } });
    expect(allowed.meta.attempts).toBe(1);
    expect(allowed.meta.fallback).toBe(false);
    expect(allowed.lines[0]?.text).toBe('호위가 내 가방을 빼앗았다.');
    const blocked = await gm.narrate(ctx);
    expect(blocked.meta.violations.some(v => v.startsWith('beat/item_lost'))).toBe(true);
    expect(blocked.lines[0]?.text).toBe('칼끝이 손가락 한 마디만큼 물러났다.');
  });

  test('화자 목록 밖 표정은 neutral로 덮지 않고 모델에 다시 고르게 한다', async () => {
    const mock = mockLlama([lines(['남자', '말은 잘하는군.', 'scared']), lines(['남자', '말은 잘하는군.', 'sneer'])]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).talk(contexts('살려 주면 보답하겠어요.').ctx);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.lines.find(l => l.speaker === '남자')?.face).toBe('sneer');
    expect(reply.meta.violations.some(v => v.startsWith('format/face:') && v.includes('남자') && v.includes('sneer'))).toBe(true);
  });

  test('짧은 감정 반응은 상태 사실로 거절하지 않고 말투 해설만 다시 쓴다', async () => {
    const mock = mockLlama([lines(['남자', '이런 상황에서 왜 이러는지 알 수가 없군.']), YES, lines(['남자', '떨지 마라.']), NO, YES]);
    stop = () => mock.server.stop(true);
    const ctx = { ...contexts('이가 덜덜 떨려 말이 안 나온다').ctx, reaction: true };
    const reply = await gmOn(mock.url).talk(ctx);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.lines.find((l) => l.speaker === '남자')?.text).toBe('떨지 마라.');
    expect(reply.meta.violations.some((v) => v.startsWith('lore/reaction_style'))).toBe(true);
    expect(reply.meta.violations.some((v) => v.startsWith('beat/state_check'))).toBe(false);
  });

  test('감정 입력과 무관한 짧은 질문도 다시 써서 실제 떨림에 답한다', async () => {
    const mock = mockLlama([lines(['남자', '무엇이 반칙이지?']), NO, NO, lines(['남자', '떨지 마라.']), NO, YES]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).talk({ ...contexts('이가 덜덜 떨려 말이 안 나온다').ctx, reaction: true });
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.lines.find((l) => l.speaker === '남자')?.text).toBe('떨지 마라.');
    expect(reply.meta.violations.some((v) => v.startsWith('beat/reaction_response'))).toBe(true);
  });

  test('서술이 후드를 벗기면 낱말 목록에 없어도 뜻으로 막고 다시 쓰게 한다', async () => {
    const mock = mockLlama([HOOD_OFF, YES, REPLY]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).narrate(neutral(contexts('억울해요!').narrate));
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('beat/state_check'))).toBe(true);
    expect(reply.meta.setFlags ?? []).toEqual([]);
    expect(reply.lines[0]?.text).toBe('칼끝이 손가락 한 마디만큼 물러났다.');
  });

  test('후드를 쓴 채 잡는 서술은 재확인을 거쳐 그대로 나간다', async () => {
    const mock = mockLlama([lines(['나레이션', '후드를 움켜쥐고 물러났다.'], ['남자', '거짓은 아닌 모양이군.']), NO]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).narrate(neutral(contexts('억울해요!').narrate));
    expect(reply.meta.attempts).toBe(1);
    expect(reply.lines[0]?.text).toBe('후드를 움켜쥐고 물러났다.');
    expect(mock.requests).toHaveLength(2);
  });

  test('플레이어가 직접 벗었으면 서술을 살리고 상태 플래그를 돌려준다', async () => {
    const mock = mockLlama([HOOD_OFF, YES, YES]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).narrate(neutral(contexts('후드를 뒤로 넘긴다').narrate));
    expect(reply.meta.attempts).toBe(1);
    expect(reply.meta.setFlags).toEqual(['후드_벗음']);
  });

  test('플레이어 입력이 후드를 언급만 하면 벗긴 서술을 막는다', async () => {
    const mock = mockLlama([HOOD_OFF, YES, NO, REPLY]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).narrate(neutral(contexts('후드 잡고 버틴다').narrate));
    expect(reply.meta.setFlags ?? []).toEqual([]);
    expect(reply.lines[0]?.text).toBe('칼끝이 손가락 한 마디만큼 물러났다.');
  });

  test('결과에 적힌 변화면 서술을 다시 묻지 않고 통과한다', async () => {
    const mock = mockLlama([HOOD_OFF, YES]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).narrate(neutral(contexts('억울해요!').narrate, '나동그라져 후드가 벗겨진다.'));
    expect(reply.meta.attempts).toBe(1);
    expect(mock.requests).toHaveLength(2);
  });

  test('결과에 같은 낱말이 있어도 그 변화를 정하지 않았으면 서술을 막는다', async () => {
    const mock = mockLlama([HOOD_OFF, NO, YES, REPLY]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).narrate(neutral(contexts('억울해요!').narrate, '칼날이 머리카락 끝을 스치고 지나간다.'));
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('beat/state_check'))).toBe(true);
    expect(reply.meta.setFlags ?? []).toEqual([]);
  });

  test('재확인 답을 못 읽으면 기록을 남기고 확인되지 않은 서술을 다시 쓰게 한다', async () => {
    const mock = mockLlama([HOOD_OFF, '답 아님', REPLY]);
    stop = () => mock.server.stop(true);
    const reply = await gmOn(mock.url).narrate(neutral(contexts('억울해요!').narrate));
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.violations.some((v) => v.startsWith('state_check_error'))).toBe(true);
    expect(reply.lines[0]?.text).toBe('칼끝이 손가락 한 마디만큼 물러났다.');
  });
});

describe('isLinkedAct', () => {
  test.each(['후드를 눌러쓰고 천천히 걸어간다', '그늘에 쪼그려 앉아 기다린다', '고개를 젖혀 칼끝에서 목을 뗀다', '숨을 내쉬며 손을 쥔다'])('%s 는 이어진 동작이다', (text) => {
    expect(isLinkedAct(text)).toBe(true);
  });
  test.each(['입 꾹 다물고 있는다', '고개를 푹 숙이고 있다', '그냥 서 있다', '어깨를 축 늘어뜨린다', '침만 꿀꺽 삼킨다', '아무 말도 안 한다'])('%s 는 이어진 동작이 아니다', (text) => {
    expect(isLinkedAct(text)).toBe(false);
  });
});

describe('actClauses', () => {
  test.each([
    ['그대로 굳어 버린다', 1],
    ['숨어 본다', 1],
    ['체념하고 고개를 떨군다', 2],
    ['손을 내려놓고 칼을 받아들인다', 2],
    ['후드를 눌러쓰고 걸어가며 웃는다', 3],
  ])('%s → 동작 %d개', (text, count) => {
    expect(actClauses(text)).toHaveLength(count);
  });

  test('하지 않는다고 적은 동작만 뺀다. 포기하지 않는 것은 계속 하겠다는 말이다', () => {
    expect(isRefusedClause('반항하지 않고')).toBe(true);
    expect(isRefusedClause('아무 말 없이')).toBe(true);
    expect(isRefusedClause('포기하지 않고')).toBe(false);
    expect(isRefusedClause('칼을 들고')).toBe(false);
    expect(isRefusedClause('칼을 받아들인다')).toBe(true);
  });
});

describe('isNoAttempt', () => {
  test('규칙 해석: 접근법 낱말이 있어도 그대로 있는 말은 판정이 아니고, 하지 않는 것 자체가 접근법이면 그 접근법이다', () => {
    const swing = scenario.beats.b06_swing?.free;
    const bind = scenario.beats.r2_bind?.free;
    if (!swing || !bind) throw new Error('자유 입력 비트가 없습니다');
    expect(ruleInterpret(swing, '칼을 안 피한다', [], lore).kind).toBe('idle');
    expect(ruleInterpret(swing, '가만히 있는다', [], lore).kind).toBe('idle');
    expect(ruleInterpret(swing, '몸을 숙여 피한다', [], lore).kind).toBe('approach');
    expect(ruleInterpret(bind, '말하지 않는다', [], lore)).toMatchObject({ kind: 'approach', approach: 'silent' });
  });

  test.each(['발끝만 내려다본다', '하늘만 쳐다본다', '가만히 있는다', '그냥 서 있다', '눈만 감는다', '멍하니 본다', '포기한다', '아무 말도 안 한다', '아무것도 하지 않는다', '칼을 안 피한다', '피하지 않는다', '우두커니 서 있다', '쓰러져 있다', '넘어져 있다', '기다린다', '쳐다보기만 한다'])('%s: 시도 없음', (text) => {
    expect(isNoAttempt(text)).toBe(true);
  });
  test.each(['가만히 다가간다', '그냥 도망친다', '포기하지 않고 버틴다', '포기하지 않는다', '눈을 감고 달린다', '기다렸다가 덮친다', '아무 말 없이 칼을 뽑는다', '가만히 있을까?', '가만히 있어요', '몸을 숙인다', '칼을 막는다'])('%s: 시도 있음', (text) => {
    expect(isNoAttempt(text)).toBe(false);
  });
});

test('정체가 드러나기 전 칼 장면 요청문에는 숨긴 나라 이름이 없다(59e)', async () => {
  const mock = mockLlama([]);
  stop = () => mock.server.stop(true);
  const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
  for (const id of ['b05_why', 'b06_swing'] as const) {
    const { ctx, narrate } = contexts('칼 좀 내려 주실래요? 목이 따끔해서요.');
    const beat = scenario.beats[id];
    if (!beat?.free) throw new Error(`${id} 구성이 바뀌었습니다`);
    expect(ctx.state.flags['페시안_앎']).toBeUndefined();
    const here = { ...ctx, beat, free: beat.free };
    await gm.interpret(here);
    await gm.talk({ ...here, tone: 'plain' });
    await gm.narrate({ ...narrate, beat, free: beat.free });
  }
  const sent = mock.requests.filter((r) => r.stream).flatMap((r) => r.messages.map((m) => m.content)).join('\n');
  expect(sent).toContain('왕이라는 신분');
  expect(sent).not.toMatch(/페샨|페시안/);
});
