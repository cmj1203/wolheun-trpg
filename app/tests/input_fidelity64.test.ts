import { expect, test } from 'bun:test';
import { Engine, type GmContext, type GmLines } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { parseStoryInput } from '../src/engine/text.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient } from '../src/gm/llm.ts';
import { withNotes } from '../src/gm/lore.ts';
import { CHANGE_SYSTEM } from '../src/gm/prompt.ts';
import { FakeGm, META, SCENARIO_PATH, loadWolheunLore, tokenBudgetFixture } from './helpers.ts';

const lore = await loadWolheunLore();
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const scenario = { ...campaign, start: 'ep04_i02_accusation' };
const scene = scenario.beats[scenario.start];
if (!scene?.free) throw new Error('항의 장면이 없습니다.');
const hearing = scene.free.goals?.ep04_heard;
if (!hearing) throw new Error('항의 목표가 없습니다.');
const hearingText = hearing.text;

function fixture(options: { attempt?: boolean; supported?: boolean; auditReply?: object; reading?: Record<string, unknown>; contaminate?: boolean } = {}) {
  const requests: { system: string; user: string }[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(req) {
      const budget = await tokenBudgetFixture(req);
      if (budget) return budget;
      const body: {
        messages: { content: string }[];
        response_format: { json_schema: { schema: { properties: { supported?: unknown; changes?: { minItems: number } } } } };
      } = await req.json();
      const system = body.messages[0]?.content ?? '', user = body.messages[1]?.content ?? '';
      requests.push({ system, user });
      // 일차 오판을 고정하고 후보 목표가 독립 검사에 새어 들어올 때 같은 오판을 재현한다.
      const attempt = options.attempt ?? (options.contaminate === true && user.includes(hearingText));
      const change = attempt ? '말로 새로운 성취를 시도함' : '눈앞의 상황을 확인함';
      const properties = body.response_format.json_schema.schema.properties;
      const text = JSON.stringify(system === CHANGE_SYSTEM
        ? (properties.changes ? { changes: Array.from({ length: properties.changes.minItems }, () => change) } : { change })
        : properties.supported ? options.auditReply ?? { supported: options.supported ?? true }
          : { reason: '상대가 내 해명을 듣게 한다.', label: '해명 요구', question: '', kind: 'action', about: 'none', risk: 'none',
            approach: 'ep04_heard', target: 'ep04_heard', scope: 'ready', item: '', odd: false, absurd: false, bold: false,
            deed: '상대가 내 해명을 끝까지 들었다.', stat: '매력', difficulty: '보통', ...options.reading });
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  const gm = new LocalGm(new LlmClient({ baseUrl: `http://127.0.0.1:${server.port}`, timeoutMs: 1000 }), lore);
  return { gm, server, requests };
}

function context(text: string): GmContext {
  const { state } = new Engine(scenario, new FakeGm()).newGame(913, 'input-fidelity');
  const beat = scenario.beats[state.beat];
  if (!beat?.free) throw new Error('자유 입력 장면이 아닙니다.');
  return { scenario, beat, free: beat.free, state, text, input: parseStoryInput(text) };
}

test.each([
  '(또렷하게 상대를 바라본다) 무슨 근거로 그런 말을 하는 거죠?',
  '(시선을 맞춘다) 저를 수상하게 보신 이유를 들을 수 있을까요?',
  '(고개를 기울여 인사한다) 처음 뵙겠습니다.',
])('후보 목표에 오염된 일차 설득 분류도 입력 자체가 관찰·발화이면 무판정으로 보존한다: %s', async (text) => {
  const mock = fixture({ contaminate: true });
  try {
    const result = await mock.gm.interpret(context(text));
    expect(result).toMatchObject({ kind: 'talk', to: 'person' });
    expect(result.meta.fallback).toBe(false);
  } finally { mock.server.stop(true); }
});

test.each([
  { reason: '상대가 내 해명을 듣는다.', deed: '상대의 혐의 근거를 내가 들었다.' },
  { reason: '그를 굴복시켜 의심을 완전히 지웠다.', deed: '상대가 내 해명을 들었다.' },
])('실제 시도라도 reason/deed/목표의 역할·성취가 입력과 다르면 거절한다: %j', async (reading) => {
  const mock = fixture({ attempt: true, supported: false, reading });
  try {
    const result = await mock.gm.interpret(context('(억울한 사정을 근거로 설명한다) 제 설명을 끝까지 들어 주세요.'));
    expect(result.kind).toBe('clarify');
    expect(result.meta.fallback).toBe(false);
  } finally { mock.server.stop(true); }
});

test.each([
  '듣지도 않고 도둑으로 몰지 마세요. 물건을 훔친 적 없어요.',
  '이 모순을 근거로 제 설명을 끝까지 듣고 판단해 주시겠어요?',
  '(억울한 사정을 설명한다) 제 말을 끝까지 들어 주세요.',
])('명확한 설득과 질문형 실제 요구는 입력의 성공 목표를 유지한다: %s', async (text) => {
  const mock = fixture({ attempt: true });
  try {
    const result = await mock.gm.interpret(context(text));
    expect(result).toMatchObject({ kind: 'approach', approach: 'ep04_heard' });
    expect(result.meta.fallback).toBe(false);
  } finally { mock.server.stop(true); }
});

test('명확한 위험 시도는 목표 정합성 확인 뒤 실제 행동으로 유지한다', async () => {
  const mock = fixture({ attempt: true, reading: {
    approach: 'none', target: 'local', risk: 'attack', bold: true,
    deed: '칼을 쥔 손목을 쳐서 이번 칼날의 방향을 비틀었다.',
  } });
  try {
    const result = await mock.gm.interpret(context('(칼을 쥔 손목을 쳐서 날아드는 칼날의 방향을 비튼다)'));
    expect(result).toMatchObject({ kind: 'improv', target: 'local', risk: 'attack', bold: true });
  } finally { mock.server.stop(true); }
});

test('person에 남은 접근법도 실제 시도가 없으면 판정으로 소비하지 않는다', async () => {
  const mock = fixture({ reading: { kind: 'person' }, contaminate: true });
  try {
    expect(await mock.gm.interpret(context('(고개를 들어 바라본다) 저를 부르신 이유를 알고 싶어요.')))
      .toMatchObject({ kind: 'talk', to: 'person' });
  } finally { mock.server.stop(true); }
});

test('성취 정합성 검수의 응답이 불완전하면 기존 접근법으로 우회하지 않는다', async () => {
  const mock = fixture({ attempt: true, auditReply: {} });
  try {
    expect((await mock.gm.interpret(context('억울한 사정을 근거로 설명하겠어요. 끝까지 들어 주세요.'))).kind).toBe('clarify');
  } finally { mock.server.stop(true); }
});

class Replies extends FakeGm {
  readonly seen: GmContext[] = [];
  constructor(readonly classifier: LocalGm) { super(); }
  override interpret(ctx: GmContext) { return this.classifier.interpret(ctx); }
  override async talk(ctx: GmContext): Promise<GmLines> {
    this.seen.push(ctx);
    return { lines: [{ speaker: 'ep04_man', text: '네가 있던 곳부터 말해라.', face: 'intrigued' }], meta: META };
  }
}

test('관찰·혐의 질문은 실제 엔진에서 판정·가격·RNG·성공 플래그를 소비하지 않는다', async () => {
  const text = '(또렷하게 상대를 바라본다) 무슨 근거로 그런 말을 하는 거죠?';
  const mock = fixture({ contaminate: true });
  try {
    const gm = new Replies(mock.gm), engine = new Engine(scenario, gm);
    const { state } = engine.newGame(913, 'no-consumption');
    const out = await engine.act(state, { type: 'free', text });
    expect(out.step.events.some(event => event.type === 'roll')).toBe(false);
    expect(out.state.rng).toBe(state.rng);
    expect(out.state.tracks).toEqual(state.tracks);
    expect(out.state.items).toEqual(state.items);
    expect(out.state.flags.ep04_accusation_heard).not.toBe(true);
    expect(out.state.log.some(entry => entry.kind === 'price' || entry.kind === 'check')).toBe(false);
    expect(gm.seen[0]?.input).toEqual(parseStoryInput(text));
    expect(out.state.beat).toBe(state.beat);
  } finally { mock.server.stop(true); }
});

test('검수된 명확한 설득은 실제 엔진의 성공 목표 효과를 보존한다', async () => {
  const mock = fixture({ attempt: true });
  try {
    const gm = new Replies(mock.gm), engine = new Engine(scenario, gm);
    const { state } = engine.newGame(913, 'success-preserved');
    const out = await engine.act(state, { type: 'free', text: '(억울한 사정을 근거로 설명한다) 제 말을 끝까지 들어 주세요.' });
    expect(out.step.events.some(event => event.type === 'roll')).toBe(true);
    expect(out.state.flags.ep04_accusation_heard).toBe(true);
    expect(out.state.log.some(entry => entry.kind === 'check')).toBe(true);
  } finally { mock.server.stop(true); }
});

test('정본 접근법은 즉흥 deed가 없어도 검수된 성공 목표를 실제 엔진에 적용한다', async () => {
  const mock = fixture({ attempt: true, reading: { deed: '' } });
  try {
    const gm = new Replies(mock.gm), engine = new Engine(scenario, gm);
    const { state } = engine.newGame(913, 'canonical-without-deed');
    const out = await engine.act(state, { type: 'free', text: '(억울한 사정을 근거로 설명한다) 제 말을 끝까지 들어 주세요.' });
    expect(out.step.events.some(event => event.type === 'roll')).toBe(true);
    expect(out.state.flags.ep04_accusation_heard).toBe(true);
    expect(out.state.log.some(entry => entry.kind === 'check')).toBe(true);
  } finally { mock.server.stop(true); }
});

test.each([
  { approach: 'none', target: 'local', deed: '' },
  { bold: true, deed: '' },
])('즉흥 사건을 쓰는 시도는 빈 deed로 성취 검사를 우회하지 않는다: %j', async (reading) => {
  const mock = fixture({ attempt: true, reading });
  try {
    const text = '(억울한 사정을 근거로 설명한다) 제 말을 끝까지 들어 주세요.';
    expect((await mock.gm.interpret(context(text))).kind).toBe('clarify');
  } finally { mock.server.stop(true); }
});

test('이미 대화한 자리의 다음 person 질문도 목표 완료나 자동 줄거리 진행으로 소비하지 않는다', async () => {
  const mock = fixture({ contaminate: true });
  try {
    const gm = new Replies(mock.gm), engine = new Engine(scenario, gm);
    const { state } = engine.newGame(913, 'after-prior-talk');
    if (!state.free) throw new Error('자유 입력 상태가 없습니다.');
    state.free.talks = 1;
    const out = await engine.act(state, { type: 'free', text: '(또렷하게 상대를 바라본다) 무슨 근거로 그런 말을 하는 거죠?' });
    expect(out.state.beat).toBe(state.beat);
    expect(out.state.rng).toBe(state.rng);
    expect(out.state.tracks).toEqual(state.tracks);
    expect(out.state.flags.ep04_accusation_heard).not.toBe(true);
    expect(out.step.events.some(event => event.type === 'roll')).toBe(false);
    expect(out.step.events.some(event => event.type === 'line' && event.text === '네가 있던 곳부터 말해라.')).toBe(true);
  } finally { mock.server.stop(true); }
});

test.each(['(가만히 있는다)', '(울며 주저앉는다)'])('명시적 무시도·감정 반응은 판정 없이 자연 진행을 유지한다: %s', async (text) => {
  const mock = fixture({ reading: { kind: 'idle', approach: 'none', target: 'none', scope: 'none' } });
  try {
    const engine = new Engine(scenario, new Replies(mock.gm));
    const { state } = engine.newGame(913, 'idle-preserved');
    const out = await engine.act(state, { type: 'free', text });
    expect(out.state.beat).not.toBe(state.beat);
    expect(out.state.rng).toBe(state.rng);
    expect(out.step.events.some(event => event.type === 'roll')).toBe(false);
    expect(out.state.log.some(entry => entry.kind === 'check' || entry.kind === 'price')).toBe(false);
  } finally { mock.server.stop(true); }
});

test('후속 질문은 입력마다 상대 응답을 받으며 반복 재질문이나 강제 판정으로 바뀌지 않는다', async () => {
  const mock = fixture({ contaminate: true });
  try {
    const gm = new Replies(mock.gm), engine = new Engine(scenario, gm);
    const original = engine.newGame(913, 'questions-preserved').state;
    let state = original;
    const questions = [
      '(눈을 맞춘다) 저를 의심하게 된 일을 들려주시겠어요?',
      '(고개를 기울인다) 제가 있으면 안 되는 곳이었나요?',
      '(상대를 바라본다) 그곳의 주인이 누구인가요?',
    ];
    for (const text of questions) {
      const out = await engine.act(state, { type: 'free', text });
      expect(out.state.beat).toBe(original.beat);
      expect(out.state.rng).toBe(original.rng);
      expect(out.state.tracks).toEqual(original.tracks);
      expect(out.step.events.some(event => event.type === 'roll' || (event.type === 'notice' && event.kind === 'rewrite'))).toBe(false);
      state = out.state;
    }
    expect(gm.seen.map(ctx => ctx.text)).toEqual(questions);
    expect(state.log.some(entry => entry.kind === 'check' || entry.kind === 'price')).toBe(false);
  } finally { mock.server.stop(true); }
});
