import { afterEach, describe, expect, test } from 'bun:test';
import { Engine, type GmContext, type NarrateContext } from '../src/engine/engine.ts';
import { DEFAULT_GM_OPTIONS, LocalGm, type GmTrace } from '../src/gm/gm.ts';
import { LlmClient, assertLoopback } from '../src/gm/llm.ts';
import { ruleInterpret } from '../src/gm/rules.ts';
import { typedFallbackLines } from '../src/engine/scenario.ts';
import { actClauses, isAboutSelf, isLinkedAct, isNoAttempt, isRefusedClause } from '../src/engine/text.ts';
import { ASK_SYSTEM, CHANGE_SYSTEM, NO_CHANGE, OWN_MOVE, SHOWN_CHANGE, YIELD_CHANGE } from '../src/gm/prompt.ts';
import type { Face } from '../src/engine/types.ts';
import { validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { FakeGm, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

interface ChatBody {
  stream?: boolean;
  max_tokens?: number;
  messages: { role: string; content: string }[];
  response_format?: { json_schema: { schema: { properties: { lines: { prefixItems?: { anyOf?: { properties: { speaker: { enum: string[] } } }[]; properties?: { speaker: { enum: string[] } } }[] } } } } };
}

const SERVER_ERROR = '<서버 오류로 끝남>';
let changeReply = '{"change":"자리가 바뀜"}';
let askReply = '{"ask":"게임에 대해 물음"}';

function mockLlama(outputs: string[]) {
  const requests: ChatBody[] = [];
  let warmed: () => void = () => undefined;
  const warmSeen = new Promise<void>((resolve) => {
    warmed = resolve;
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === '/health') return Response.json({ status: 'ok' });
      if (pathname === '/v1/models') return Response.json({ data: [{ id: 'mock-gm' }] });
      const body = (await req.json()) as ChatBody;
      requests.push(body);
      if (!body.stream) {
        warmed();
        return Response.json({ choices: [{ message: { content: '' } }] });
      }
      const system = body.messages[0]?.content;
      const queued = system === CHANGE_SYSTEM ? changeReply : system === ASK_SYSTEM ? askReply : (outputs.shift() ?? '{"lines":[]}');
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
  return { server, requests, warmSeen, url: `http://127.0.0.1:${server.port}` };
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
  const ctx: GmContext = { scenario, beat, free, state, text };
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

  test('세계 밖 행동이 끝까지 위반하면 대체 줄도 나레이션 동작 한 줄 뒤에 반응 줄이 온다(택시 재발 방지)', async () => {
    const bad = lines(['나레이션', '택시를 불렀다.'], ['남자', '택시라니.']);
    const mock = mockLlama([bad, bad, bad]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const { ctx } = contexts('택시를 부른다');
    const reply = await gm.talk({ ...ctx, absurd: true, deed: '허공에 손을 흔들었다' });
    expect(reply.meta.fallback).toBe(true);
    expect(reply.lines[0]?.speaker).toBe('나레이션');
    expect(reply.lines[0]?.text).not.toContain('택시');
    expect(reply.lines.length).toBeGreaterThanOrEqual(2);
    expect(reply.lines.slice(1).every((l) => l.speaker !== '나레이션' && !l.text.includes('택시'))).toBe(true);
    const sent = mock.requests[0] as { response_format?: { json_schema?: { schema?: { properties?: { lines?: { prefixItems?: { properties?: { speaker?: { enum?: string[] } } }[] } } } } } } | undefined;
    expect(sent?.response_format?.json_schema?.schema?.properties?.lines?.prefixItems?.[0]?.properties?.speaker?.enum).toEqual(['나레이션']);
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
    const second = lines(['나레이션', '아시나는 숨을 삼켰다.'], ['나레이션', '칼끝이 흔들린다.']);
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
    const reply = (kind: string, about = 'none', approach = 'none', odd = false) => JSON.stringify({ reason: '근거', kind, about, approach, item: '', odd, absurd: false, stat: '재치', difficulty: '보통' });
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

    test('모델과 대본 낱말이 같은 접근법을 고르면 분류가 몸에서 끝난다고 해도 그 접근법이다', async () => {
      const charm = JSON.stringify({ reason: '근거', kind: 'action', about: 'none', approach: 'beauty', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통', risk: 'none' });
      const gm = gmWith([charm, charm, charm]);
      changeReply = JSON.stringify({ change: NO_CHANGE });
      expect(await gm.interpret(contexts('생긋 웃는다').ctx)).toMatchObject({ kind: 'approach', approach: 'beauty', source: 'llm' });
    });

    test('하지 않는다고 적은 문장은 낱말이 겹쳐도 시도가 아니다', async () => {
      const charm = JSON.stringify({ reason: '근거', kind: 'action', about: 'none', approach: 'beauty', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통', risk: 'none' });
      const gm = gmWith([charm, charm, charm]);
      changeReply = JSON.stringify({ changes: ['자리가 바뀜', NO_CHANGE] });
      expect(await gm.interpret(contexts('반항하지 않고 생긋 웃는다').ctx)).toMatchObject({ kind: 'idle', source: 'llm' });
    });

    test('이어진 문장에 달라지는 동작이 하나라도 있으면 시도다', async () => {
      const gm = gmWith([action, action, action]);
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
      const gm = gmWith([action, action, game, game]);
      expect(await gm.interpret(contexts('불러오기 하면 지금까지 한 거 사라져?').ctx)).toMatchObject({ kind: 'ask', source: 'llm' });
    });

    test('물음표로 끝나도 스스로 할 일을 정하는 말이면 시도다', async () => {
      const gm = gmWith([action, action, action]);
      askReply = JSON.stringify({ ask: OWN_MOVE });
      expect(await gm.interpret(contexts('저 사람들한테 가 볼까?').ctx)).toMatchObject({ kind: 'improv', source: 'llm' });
    });
  });

  test('문장 꼴이 물음이나 건넨 말이면 모델이 혼잣말이나 행동으로 읽어도 바로잡는다', async () => {
    const reply = (kind: string, about = 'none') => JSON.stringify({ reason: '근거', kind, about, approach: 'none', item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통' });
    const mock = mockLlama([reply('self'), reply('lore', 'asina'), reply('action'), reply('how'), reply('action'), reply('self'), reply('self')]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('그걸 왜 하고 있어?').ctx)).toMatchObject({ kind: 'ask', about: 'asina' });
    expect(await gm.interpret(contexts('지금 할 수 있는 게 뭐야?').ctx)).toMatchObject({ kind: 'ask', play: true });
    expect(await gm.interpret(contexts('좀 떨어져요').ctx)).toMatchObject({ kind: 'talk', to: 'person' });
    expect(await gm.interpret(contexts('아 죽겠네').ctx)).toMatchObject({ kind: 'talk', to: 'self' });
    expect(mock.requests.filter((r) => r.stream)).toHaveLength(7);
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
    const mock = mockLlama([JSON.stringify({ lines: [{ speaker: 'GM', text: '그건 아직 몰라.' }] })]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const reply = await gm.explain({ ...contexts('이 사람 언제까지 쫓아올까?').ctx, about: 'man' });
    expect(reply.lines).toEqual([{ speaker: 'GM', text: '그건 아직 몰라.' }]);
    expect(reply.meta.fallback).toBe(false);
  });

  test('답이 없는 질문과 아직 안 열린 항목은 모델 없이 모른다고 답한다', async () => {
    const mock = mockLlama([]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    const reply = await gm.explain({ ...contexts('저 남자는 왜 안 쫓아와?').ctx, about: 'none' });
    expect(reply.lines).toEqual([{ speaker: 'GM', text: '그건 아직 몰라.' }]);
    expect(mock.requests.filter((r) => r.stream)).toHaveLength(0);
  });

  test('지도를 꺼내는 입력은 호소가 섞여도 LLM 을 거치지 않고 가방 행동으로 읽는다', async () => {
    const mock = mockLlama(['{"reason":"억울함을 호소","approach":"plead","item":""}']);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    for (const text of ['지도를 꺼낸다', '가방에서 낡은 지도를 꺼내 보여 주며 길을 잃었을 뿐이라고 말한다.']) {
      expect(await gm.interpret(contexts(text).ctx)).toMatchObject({ kind: 'approach', approach: 'bag', item: 'magic_bag', source: 'rule' });
    }
    expect(mock.requests.filter((r) => r.stream)).toHaveLength(0);
  });

  test('게임 질문과 위험 여부를 해석이 내고, 자기 물음은 앞사람이 있어도 물음 종류로 다시 고른다', async () => {
    const reply = (kind: string, about = 'none', risk = 'none', approach = 'none') => JSON.stringify({ reason: '근거', kind, about, risk, approach, item: '', odd: false, absurd: false, stat: '재치', difficulty: '보통' });
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
    const mock = mockLlama([lines(['GM', '저 남자는 베히다트, 페시안의 왕이다.']), lines(['GM', '여긴 페시안이야.']), lines(['GM', ok], ['GM', '칼끝은 여전히 목에 닿아 있어.'])]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, budgetMs: 60_000 });
    const reply = await gm.explain(contexts('아시나는 누구야?').ctx);
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

  test('LLM 이 없으면 아시나가 아는 범위로만 답하고, 아직 못 본 사람은 모른다고 한다', async () => {
    const gm = new LocalGm(null, lore);
    const ask = async (q: string) => (await gm.explain(contexts(q).ctx)).lines.map((l) => l.text).join(' ');
    expect(await ask('크롬웰이 뭐야?')).toContain('아시나의 모국');
    expect(await ask('크롬웰이 뭐야?')).not.toMatch(/페시안|적국/);
    expect(await ask('저 남자 누구야?')).toBe('그건 아직 몰라.');
    expect(await ask('베히다트가 누구야?')).toBe('그건 아시나도 몰라.');
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
    const mock = mockLlama([JSON.stringify({ reason: '말', kind: 'person', about: 'none', approach: 'none', item: '', stat: '재치', difficulty: '보통', absurd: false })]);
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

  test('입력 해석과 줄 쓰기의 시스템 프롬프트가 같아 LLM 캐시를 이어 쓴다', async () => {
    const mock = mockLlama([JSON.stringify({ kind: 'person', about: 'none', risk: 'none', approach: 'none', item: '' }), REPLY]);
    stop = () => mock.server.stop(true);
    const gm = gmOn(mock.url);
    const { ctx, narrate } = contexts('억울해요!');
    await gm.interpret(ctx);
    await gm.narrate(neutral(narrate));
    expect(mock.requests[1]?.messages[0]?.content).toBe(mock.requests[0]?.messages[0]?.content as string);
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
    { previous: ['나그네, 고개를 들어라.', '눈을 피하지 마라.'], draft: '나그네, 아직 버티는군.', reason: '호칭' },
    { previous: ['상인, 대답해라.', '그게 한계인가?'], draft: '상인, 겁이 난 건가?', reason: '호칭' },
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

  test('재시도 예산 소진 뒤 반복만 남은 초안은 침묵 대신 채택한다', async () => {
    const mock = mockLlama([lines(['남자', '나그네, 이가 요란하게 부딪히는군.']), NO, YES]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, {
      ...DEFAULT_GM_OPTIONS, retries: 0, softRetries: 0,
    });
    const base = contexts('이가 덜덜 떨려 말이 안 나온다').ctx;
    const reply = await gm.talk({ ...base, reaction: true, state: { ...base.state, spoken: {
      남자: ['나그네, 고개를 들어라.', '눈을 피하지 마라.'],
    } } });
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.attempts).toBe(1);
    expect(reply.lines.find(l => l.speaker === '남자')?.text).toBe('나그네, 이가 요란하게 부딪히는군.');
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

  test.each(['발끝만 내려다본다', '하늘만 쳐다본다', '가만히 있는다', '그냥 서 있다', '눈만 감는다', '멍하니 본다', '포기한다', '아무 말도 안 한다', '아무것도 하지 않는다', '칼을 안 피한다', '피하지 않는다', '우두커니 서 있다', '기다린다', '쳐다보기만 한다'])('%s: 시도 없음', (text) => {
    expect(isNoAttempt(text)).toBe(true);
  });
  test.each(['가만히 다가간다', '그냥 도망친다', '포기하지 않고 버틴다', '포기하지 않는다', '눈을 감고 달린다', '기다렸다가 덮친다', '아무 말 없이 칼을 뽑는다', '가만히 있을까?', '가만히 있어요', '몸을 숙인다', '칼을 막는다'])('%s: 시도 있음', (text) => {
    expect(isNoAttempt(text)).toBe(false);
  });
});
