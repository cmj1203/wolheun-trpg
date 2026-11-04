import { afterEach, describe, expect, test } from 'bun:test';
import { Engine, type GmContext, type NarrateContext } from '../src/engine/engine.ts';
import { DEFAULT_GM_OPTIONS, LocalGm, type GmTrace } from '../src/gm/gm.ts';
import { LlmClient, assertLoopback } from '../src/gm/llm.ts';
import { ruleInterpret } from '../src/gm/rules.ts';
import { typedFallbackLines } from '../src/engine/scenario.ts';
import { validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { FakeGm, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

interface ChatBody {
  stream?: boolean;
  max_tokens?: number;
  messages: { role: string; content: string }[];
}

const SERVER_ERROR = '<서버 오류로 끝남>';

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
      const queued = outputs.shift() ?? '{"lines":[]}';
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
  sceneForbid: [],
  echoOnly: [],
  outcomeForbid: [],
  playerText: '',
  reserved: [],
  gist: '',
  playerLore: '아시나',
});

const lines = (...xs: [string, string][]) => JSON.stringify({ lines: xs.map(([speaker, text]) => ({ speaker, text })) });

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
    expect(reply.meta.violations.some((v) => v.startsWith('beat/scene_forbid'))).toBe(true);
    expect(mock.requests[1]?.messages[1]?.content).toContain('직전 답의 문제');
    expect(traces[0]?.llm?.completionTokens).toBe(8);
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
    const mock = mockLlama(['{"reason":"미모를 내세움","approach":"beauty","item":""}', '{"reason":"?","approach":"dance","item":""}']);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    expect(await gm.interpret(contexts('대륙에서 하나뿐인 미소녀니까요').ctx)).toMatchObject({ kind: 'approach', approach: 'beauty', source: 'llm' });
    expect(await gm.interpret(contexts('억울해요').ctx)).toMatchObject({ kind: 'approach', approach: 'plead', source: 'rule' });
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
    for (const q of ['크롬웰이 뭐야?', '저 남자 누구야?', '여기가 어디야', '귀찌가 뭐지?', '페시안은 어떤 나라야?']) expect(ruleInterpret(free, q, items, lore)).toEqual({ kind: 'ask' });
    for (const q of ['너 누구야?', '당신 누구예요?', '왜냐하면 저는 미소녀니까요?', '너 몇 살이야']) expect(ruleInterpret(free, q, items, lore)).not.toEqual({ kind: 'ask' });
  });

  test('GM 설명은 스포일러를 막고 다시 쓰며, "게임 마스터"와 공녀라는 말은 GM 줄에서 막지 않는다', async () => {
    const ok = '게임 마스터로서 말하면, 아시나는 알고 있다. 그녀는 크롬웰의 공녀다.';
    const mock = mockLlama([lines(['GM', '저 남자는 베히다트, 페시안의 왕이다.']), lines(['GM', ok], ['GM', '칼끝은 여전히 목에 닿아 있다.'])]);
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore, { ...DEFAULT_GM_OPTIONS, budgetMs: 60_000 });
    const reply = await gm.explain(contexts('아시나는 누구야?').ctx);
    expect(reply.meta.attempts).toBe(2);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.meta.violations.some((v) => v.includes('베히다트'))).toBe(true);
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
    expect(await ask('크롬웰이 뭐야?')).toContain('오랜 적');
    expect(await ask('저 남자 누구야?')).toContain('본 적이 없다');
    expect(await ask('베히다트가 누구야?')).toBe('그건 아시나도 모른다.');
  });

  test('GM 은 이 컴퓨터 안의 LLM 서버 주소만 받는다', () => {
    expect(() => assertLoopback('https://api.openai.com/v1')).toThrow();
    expect(() => assertLoopback('http://192.168.0.10:8080')).toThrow();
    expect(() => assertLoopback('https://127.0.0.1:18080')).toThrow();
    expect(assertLoopback('http://127.0.0.1:18080').hostname).toBe('127.0.0.1');
    expect(assertLoopback('http://localhost:18080').hostname).toBe('localhost');
  });
});
