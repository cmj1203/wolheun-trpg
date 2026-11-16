import { expect, test } from 'bun:test';
import { Engine, type GmContext, type GmLines } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient } from '../src/gm/llm.ts';
import { withNotes } from '../src/gm/lore.ts';
import { CHANGE_SYSTEM } from '../src/gm/prompt.ts';
import { parseStoryInput } from '../src/engine/text.ts';
import { FakeGm, META, SCENARIO_PATH, loadWolheunLore, tokenBudgetFixture } from './helpers.ts';

const lore = await loadWolheunLore();
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const scenario = { ...campaign, start: 'ep02_question' };

function model(reading: Record<string, unknown>, change = '눈앞의 상황을 확인함') {
  const inputs: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(req) {
      const budget = await tokenBudgetFixture(req);
      if (budget) return budget;
      const body: { messages: { content: string }[]; response_format: { json_schema: { schema: { properties: { supported?: unknown; changes?: { minItems: number } } } } } } = await req.json();
      inputs.push(body.messages[1]?.content ?? '');
      const count = body.response_format.json_schema.schema.properties.changes?.minItems ?? 1;
      const text = JSON.stringify(body.response_format.json_schema.schema.properties.supported ? { supported: true } : body.messages[0]?.content === CHANGE_SYSTEM
        ? { change, changes: Array.from({ length: count }, () => change) }
        : { reason: '현재 반응과 상대에게 건넨 말', about: 'none', risk: 'none', approach: 'none', target: 'none', scope: 'none', item: '', odd: false, absurd: false, bold: false, deed: '', stat: '재치', difficulty: '보통', ...reading });
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  return { server, inputs, gm: new LocalGm(new LlmClient({ baseUrl: `http://127.0.0.1:${server.port}`, timeoutMs: 1000 }), lore) };
}

class Responses extends FakeGm {
  readonly seen: GmContext[] = [];
  constructor(readonly classifier: LocalGm) { super(); }
  override interpret(ctx: GmContext) { return this.classifier.interpret(ctx); }
  override async talk(ctx: GmContext): Promise<GmLines> {
    this.seen.push(structuredClone(ctx));
    return { lines: [{ speaker: 'ep02_남자', text: '내가 시선을 옮기자 남자는 잡은 손을 내려다보았다.', face: 'neutral' }], meta: META };
  }
}

test.each([
  '（그의 눈을 피하지 않고 손목을 잡은 손을 내려다본다） 잡은 손부터 놓아 주세요.',
  '(그의 옷깃에 묻은 먼지를 바라본다) 잠시 이야기해도 될까요.',
  '(가볍게 고개를 기울이며 인사한다) 처음 뵙겠습니다.',
])('혼합 관찰과 발화 %s는 몸 동작 때문에 판정으로 강제되지 않는다', async (text) => {
  const mock = model({ kind: 'person' });
  try {
    const gm = new Responses(mock.gm);
    const engine = new Engine(scenario, gm);
    const { state } = engine.newGame(2, 'mixed');
    const out = await engine.act(state, { type: 'free', text });
    expect(out.step.events.some((event) => event.type === 'roll')).toBe(false);
    expect(out.state.rng).toBe(state.rng);
    expect(out.state.tracks).toEqual(state.tracks);
    expect(out.state.items).toEqual(state.items);
    expect(out.state.log.some((entry) => entry.kind === 'price')).toBe(false);
    expect(gm.seen.length).toBeGreaterThan(0);
    expect(gm.seen[0]?.input).toEqual(parseStoryInput(text));
    expect(gm.seen[0]?.text).toBe(text);
  } finally { mock.server.stop(true); }
});

test('일차 action 분류도 관찰로 확인되면 local 판정을 만들지 않는다', async () => {
  const text = '(쥔 손의 위치를 천천히 살핀다) 제가 하는 말도 들어 주세요.';
  const mock = model({ kind: 'action', target: 'local', scope: 'ready', deed: '쥔 손을 살피며 말을 건넸다' });
  try {
    const gm = new Responses(mock.gm);
    const engine = new Engine(scenario, gm);
    const { state } = engine.newGame(2, 'observed');
    const out = await engine.act(state, { type: 'free', text });
    expect(out.step.events.some((event) => event.type === 'roll')).toBe(false);
    expect(out.state.rng).toBe(state.rng);
    expect(out.state.tracks).toEqual(state.tracks);
    expect(gm.seen[0]?.input).toEqual(parseStoryInput(text));
    expect(mock.inputs[0]).toContain(text);
  } finally { mock.server.stop(true); }
});

test.each([
  ['(그의 팔을 쳐서 붙든 손을 뿌리치고 인파로 달아난다) 비키세요.',
    { kind: 'action', target: 'escape', scope: 'ready', deed: '붙든 손을 뿌리치고 인파에 섞여 거리를 벌렸다', risk: 'attack', bold: true },
    { kind: 'improv', target: 'escape', risk: 'attack' }],
  ['(탈옥 과정을 차근차근 설명한다) 제 기술을 쓰면 당신에게도 이익이라고 증거를 들어 설득하겠어요.',
    { kind: 'person', approach: 'bargain' },
    { kind: 'approach', approach: 'bargain' }],
] as const)('실제 위험·설득 시도 %s는 관찰 반응으로 축소하지 않는다', async (text, reading, expected) => {
  const mock = model(reading, '상대나 주변에 닿거나 신호함');
  try {
    const engine = new Engine(scenario, new FakeGm());
    const { state } = engine.newGame(2, 'attempt');
    const beat = scenario.beats[state.beat];
    if (!beat?.free) throw new Error('판정 자리 없음');
    const result = await mock.gm.interpret({ scenario, beat, free: beat.free, state, text, input: parseStoryInput(text) });
    expect(result).toMatchObject(expected);
  } finally { mock.server.stop(true); }
});
