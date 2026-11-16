import { expect, test } from 'bun:test';
import { Engine, type GmContext } from '../src/engine/engine.ts';
import { LocalGm, explainFallback } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { GRAMMAR_SYSTEM, questionFacts } from '../src/gm/prompt.ts';
import { loreFor } from '../src/gm/lore.ts';
import { FakeGm, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

function context(text: string, about = 'kracha'): GmContext {
  const engine = new Engine(scenario, new FakeGm());
  const { state } = engine.newGame(2, 'question');
  const beat = scenario.beats.b02_people;
  if (!beat?.free) throw new Error('질문 장면 없음');
  return { scenario, beat, free: beat.free, state, text, question: true, about };
}

test('후보 note의 say는 현재 관계에 답한다는 근거 없이 최종 fallback이 되지 않는다', () => {
  const ctx = context('이 발밑 땅이 속한 왕국을 알고 싶어.');
  expect(explainFallback(ctx, lore, 'GM')).toEqual([{ speaker: 'GM', text: '그건 아직 몰라.' }]);
});

test('모델 없는 설명은 공개된 다른 관계의 note로 질문을 바꾸지 않는다', async () => {
  const reply = await new LocalGm(null, lore).explain(context('방금 저 대화를 아시나도 들었어?', 'strangers'));
  expect(reply.lines).toEqual([{ speaker: 'GM', text: '그건 아직 몰라.' }]);
});

function hasField(schema: object, key: string): boolean {
  return 'properties' in schema && schema.properties !== null && typeof schema.properties === 'object' && key in schema.properties;
}

// 의미 판정 모델의 응답은 fixture다. 실제 모델 품질이 아닌 정합성 경계·송신·최종 fallback을 검사한다.
class QuestionClient extends LlmClient {
  readonly requests: ChatRequest[] = [];
  constructor(
    private readonly candidate: string,
    private readonly evidence: { source: string; quote: string }[],
    private readonly answer: string,
    private readonly supported = true,
    private readonly answerable = true,
  ) { super({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1 }); }

  override async chatJson(request: ChatRequest): Promise<LlmResult> {
    this.requests.push(request);
    let text: string;
    if (hasField(request.schema, 'kind')) text = JSON.stringify({
      reason: '원문 질문', kind: 'lore', about: this.candidate, risk: 'none', approach: 'none',
      target: 'none', scope: 'none', item: '', odd: false, absurd: false, bold: false,
      deed: '', stat: '재치', difficulty: '보통', label: '질문', question: '',
    });
    else if (hasField(request.schema, 'answerable')) text = JSON.stringify({
      subject: '원문이 지시한 대상', relation: '원문이 물은 관계', answerType: '원문이 요구한 종류',
      answerable: this.answerable, evidence: this.evidence,
    });
    else if (hasField(request.schema, 'answer')) text = JSON.stringify({ answer: this.supported });
    else if (request.system === GRAMMAR_SYSTEM) {
      const body: { lines: { text: string }[] } = JSON.parse(request.user);
      text = JSON.stringify({ lines: body.lines.map(line => ({ original: line.text, corrected: line.text })) });
    } else text = JSON.stringify({ lines: [{ speaker: 'GM', text: this.answer }] });
    return { text, ttftMs: 0, totalMs: 0, promptTokens: 0, completionTokens: 0, promptMs: 0, genMs: 0, model: '질문 경계 fixture' };
  }
}

const rows = [
  { name: '미공개 현재 국가', question: '지금 우리가 있는 나라는 어디야?', candidate: 'kracha', source: '', answer: '', open: false, audience: false },
  { name: '공개 후 다른 후보를 골라도 국가 근거', question: '이 발밑 땅이 속한 왕국을 알고 싶어.', candidate: 'kracha', source: 'note:fesian', answer: '여긴 페시안이야.', open: true, audience: false },
  { name: '목적지 도시', question: '우리가 가려던 도시는 어디였지?', candidate: 'kracha', source: 'note:kracha', answer: '가려던 도시는 크라차야.', open: false, audience: false },
  { name: '공개 모국 관계', question: '크롬웰과 아시나는 어떤 관계야?', candidate: 'kracha', source: 'note:nations', answer: '크롬웰은 아시나의 모국이야.', open: false, audience: false },
  { name: '같은 지명의 없는 다른 관계', question: '크라차의 왕은 누구야?', candidate: 'kracha', source: '', answer: '', open: false, audience: false },
  { name: '관객 대화의 뜻', question: '저 말은 크롬웰의 사정을 알아내자는 뜻이야?', candidate: 'strangers', source: 'displayed', answer: '크롬웰의 정보를 얻자는 뜻이야.', open: false, audience: true },
  { name: '관객 대화의 청취 여부', question: '화면의 저 말이 아시나 귀에도 들어갔다고 봐도 돼?', candidate: 'strangers', source: 'scene', answer: '관객에게 보인 대화야. 아시나가 들었다는 근거는 없어.', open: false, audience: true },
  { name: '공개 근거 없는 물음', question: '그들이 내일 머무를 곳은 어디야?', candidate: 'strangers', source: '', answer: '', open: false, audience: false },
] as const;

test.each(rows)('$name: 원문 관계의 공개 근거만 최종 답변으로 채택한다', async (row) => {
  const ctx = context(row.question, row.candidate);
  if (row.open) ctx.state.flags.페시안_앎 = true;
  if (row.audience) {
    ctx.beat = { ...ctx.beat, perspective: 'audience', title: '궁정 대화' };
    ctx.displayed = { type: 'line', speaker: '남자', display: '남자', style: 'speech', text: '크롬웰의 정보를 캐내자.', by: 'script' };
  }
  const facts = questionFacts(ctx, loreFor(lore, ctx.state));
  const selected = row.source ? facts[row.source] : undefined;
  if (row.source && !selected) throw new Error('공개 근거 없음');
  const client = new QuestionClient(row.candidate, selected ? [{ source: row.source, quote: selected }] : [], row.answer, true, Boolean(selected));
  const gm = new LocalGm(client, lore);
  const reading = await gm.interpret(ctx);
  if (reading.kind !== 'ask') throw new Error('질문 해석 아님');
  const result = await gm.explain({ ...ctx, about: reading.about, inquiry: reading.inquiry });
  expect(result.lines.map(line => line.text)).toEqual([selected ? row.answer : '그건 아직 몰라.']);
  expect(client.requests.filter(request => hasField(request.schema, 'answerable'))).toHaveLength(1);
  const planRequest = client.requests.find(request => hasField(request.schema, 'answerable'));
  if (!planRequest) throw new Error('관계 검수 요청 없음');
  const payload: { question: string; evidence: Record<string, string> } = JSON.parse(planRequest.user);
  expect(payload.question).toBe(row.question);
  expect('note:fesian' in payload.evidence).toBe(row.open);
  if (row.audience) expect(JSON.parse(payload.evidence.scene ?? '{}').perspective).toBe('audience');
  expect(ctx.state.flags.페시안_앎).toBe(row.open ? true : undefined);
});

test.each([
  { source: 'note:fesian', quote: '페시안' },
  { source: 'note:kracha', quote: '아시나가 지금 있는 국가' },
])('없는 공개 source 또는 위조 quote는 근거가 되지 않는다: $source', async (evidence) => {
  const client = new QuestionClient('kracha', [evidence], '페시안이야.');
  const result = await new LocalGm(client, lore).explain(context('이곳은 어느 영토야?'));
  expect(result.lines.map(line => line.text)).toEqual(['그건 아직 몰라.']);
  expect(client.requests.some(request => hasField(request.schema, 'lines'))).toBe(false);
});

test('모든 생성 후보가 관계 검수에 반려되면 잘못 고른 note.say로 되돌아가지 않는다', async () => {
  const ctx = context('가려던 도시가 어디였어?', 'strangers');
  const source = questionFacts(ctx, loreFor(lore, ctx.state))['note:kracha'];
  if (!source) throw new Error('목적지 근거 없음');
  const client = new QuestionClient('strangers', [{ source: 'note:kracha', quote: source }], '일주일 만에 본 사람들이야.', false);
  const result = await new LocalGm(client, lore).explain(ctx);
  expect(result.lines.map(line => line.text)).toEqual(['그건 아직 몰라.']);
  expect(result.meta.fallback).toBe(true);
  expect(result.meta.violations.some(item => item.includes('question_relation'))).toBe(true);
  expect(client.requests.filter(request => hasField(request.schema, 'lines') && request.system !== GRAMMAR_SYSTEM)).toHaveLength(3);
});

test('실제 ask 엔진은 원문 관계를 전달하고 질문 전후 세계 상태를 보존한다', async () => {
  const ctx = context('가려던 도시가 어디였지?');
  const source = questionFacts(ctx, loreFor(lore, ctx.state))['note:kracha'];
  if (!source) throw new Error('목적지 근거 없음');
  const client = new QuestionClient('kracha', [{ source: 'note:kracha', quote: source }], '가려던 도시는 크라차야.');
  const engine = new Engine(scenario, new LocalGm(client, lore), () => 1000);
  const { state } = engine.newGame(2, 'engine-question');
  const before = structuredClone(state);
  const result = await engine.act(state, { type: 'ask', text: ctx.text });
  expect(result.step.events.filter(event => event.type === 'line').map(event => event.text)).toEqual(['가려던 도시는 크라차야.']);
  expect(client.requests.filter(request => hasField(request.schema, 'answerable'))).toHaveLength(1);
  expect(result.state.tracks).toEqual(before.tracks);
  expect(result.state.flags).toEqual(before.flags);
  expect(result.state.recent).toEqual(before.recent);
  expect(result.state.spoken).toEqual(before.spoken);
  expect(result.state.rng).toBe(before.rng);
});

test('해석 단계의 근거 검수가 실패하면 설명에서 같은 검수를 재시도하지 않는다', async () => {
  const client = new QuestionClient('kracha', [{ source: 'note:fesian', quote: '페시안' }], '페시안이야.');
  const engine = new Engine(scenario, new LocalGm(client, lore), () => 1000);
  const { state } = engine.newGame(2, 'failed-question');
  const result = await engine.act(state, { type: 'ask', text: '지금 우리가 있는 나라는 어디야?' });
  expect(result.step.events.filter(event => event.type === 'line').map(event => event.text)).toEqual(['그건 아직 몰라.']);
  expect(client.requests.filter(request => hasField(request.schema, 'answerable'))).toHaveLength(1);
  expect(client.requests.some(request => hasField(request.schema, 'lines'))).toBe(false);
});

test('관객 현장 근거는 실제 시점·화면 배치·표시 줄을 담고 내부 인물 id를 지식으로 내지 않는다', () => {
  const ctx = context('저 대화는 어떤 뜻이야?');
  const spoken = structuredClone(ctx.state.spoken);
  const actor = scenario.cast.남자;
  if (!actor) throw new Error('표시 인물 없음');
  ctx.scenario = { ...scenario, cast: { ...scenario.cast, internal_private_actor: { ...actor, display: '붉은 눈의 남자' } } };
  ctx.beat = { ...ctx.beat, perspective: 'audience', cast: { left: 'internal_private_actor', right: null } };
  ctx.free = { ...ctx.free, speakers: ['internal_private_actor'] };
  ctx.displayed = { type: 'line', speaker: 'internal_private_actor', display: '붉은 눈의 남자', style: 'speech', text: '말을 전해라.', by: 'script' };
  const facts = questionFacts(ctx, loreFor(lore, ctx.state));
  const scene = JSON.parse(facts.scene ?? '{}');
  expect(scene.perspective).toBe('audience');
  expect(scene.stagedCast).toEqual({ left: '붉은 눈의 남자', right: null });
  expect(scene.speakers).toEqual(['붉은 눈의 남자']);
  expect(facts.displayed).toBe('붉은 눈의 남자: 말을 전해라.');
  expect(JSON.stringify(facts)).not.toContain('internal_private_actor');
  expect(ctx.state.spoken).toEqual(spoken);
});
