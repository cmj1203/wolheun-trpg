import { afterEach, describe, expect, test } from 'bun:test';
import { Engine, type GmContext, type NarrateContext } from '../src/engine/engine.ts';
import { DEFAULT_GM_OPTIONS, LocalGm, type GmTrace } from '../src/gm/gm.ts';
import { LlmClient, assertLoopback } from '../src/gm/llm.ts';
import { ruleInterpret } from '../src/gm/rules.ts';
import { typedFallbackLines } from '../src/engine/scenario.ts';
import type { Face } from '../src/engine/types.ts';
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
    expect(reply.lines[1]?.speaker).toBe('남자');
    // 고정 반응 줄은 그 줄에 맞는 표정을 함께 실고 온다.
    expect(lore.characters.베히다트?.reactions?.hit).toContainEqual({ text: reply.lines[1]?.text ?? '', face: reply.lines[1]?.face as Face });
    expect(reply.lines).toHaveLength(2);
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
    const mock = mockLlama(cases.flatMap((c) => (c.want.to === 'self' ? [c.out, reply('self')] : c.want.about === 'none' ? [c.out, reply('lore')] : [c.out])));
    stop = () => mock.server.stop(true);
    const gm = new LocalGm(new LlmClient({ baseUrl: mock.url, timeoutMs: 5000 }), lore);
    for (const c of cases) expect(await gm.interpret(contexts('그게 그러니까').ctx)).toMatchObject({ ...c.want, source: 'llm' });
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
    expect(mock.requests.filter((r) => r.stream)).toHaveLength(11);
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
    for (const q of ['크롬웰이 뭐야?', '저 남자 누구야?', '여기가 어디야', '귀찌가 뭐지?', '페시안은 어떤 나라야?']) expect(ruleInterpret(free, q, items, lore)).toEqual({ kind: 'ask', why: false });
    for (const q of ['너 누구야?', '당신 누구예요?', '왜냐하면 저는 미소녀니까요?', '너 몇 살이야']) expect(ruleInterpret(free, q, items, lore)).not.toEqual({ kind: 'ask' });
  });

  test('GM 설명은 스포일러를 막고 다시 쓰며, "게임 마스터"와 공녀라는 말은 GM 줄에서 막지 않는다', async () => {
    const ok = '게임 마스터로서 말하면, 그 사람은 크롬웰의 공녀야.';
    const mock = mockLlama([lines(['GM', '저 남자는 베히다트, 페시안의 왕이다.']), lines(['GM', ok], ['GM', '칼끝은 여전히 목에 닿아 있어.'])]);
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
    expect(await ask('저 남자 누구야?')).toContain('본 적이 없어');
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
