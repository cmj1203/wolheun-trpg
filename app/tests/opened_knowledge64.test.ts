import { expect, test } from 'bun:test';
import { Engine, type GmContext } from '../src/engine/engine.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient } from '../src/gm/llm.ts';
import { loreFor, type Lore } from '../src/gm/lore.ts';
import { buildInterpretUser, buildSystem, GRAMMAR_SYSTEM, interpretSchema, questionFacts } from '../src/gm/prompt.ts';
import { FakeGm, loadDesert, loadWolheunLore, tokenBudgetFixture } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const gates = [
  ['fesian', '페시안_앎'], ['jail', '감옥_앎'], ['ep03_harem', 'ep03_하렘_앎'],
  ['man_true', 'ep04_name_known'], ['man_ruler', 'ep04_ruler_known'], ['man_la_kun', 'ep04_title_known'],
] as const;

function context(flags: Record<string, boolean>): GmContext {
  const { state } = new Engine(scenario, new FakeGm()).newGame(64, 'opened-knowledge');
  state.flags = { ...state.flags, ...Object.fromEntries(gates.map(([, flag]) => [flag, false])), ...flags };
  const beat = scenario.beats[state.beat];
  if (!beat?.free) throw new Error('질문할 자유 입력 장면이 없다');
  return { scenario, beat, free: beat.free, state, text: '왜 그런 곳이지?' };
}

interface RequestBody {
  messages: { role: string; content: string }[];
  response_format: { json_schema: { schema: { properties: { about: { enum: string[] }; answerable?: object; answer?: object } } } };
}

function probe(about: string, answer?: string) {
  const requests: RequestBody[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(req) {
      const budget = await tokenBudgetFixture(req);
      if (budget) return budget;
      const body: RequestBody = await req.json();
      requests.push(body);
      let text = JSON.stringify({
        reason: '배경 질문', kind: 'lore', about, risk: 'none', approach: 'none', item: '',
        target: 'none', scope: 'ready', odd: false, absurd: false, bold: false, deed: '', stat: '재치', difficulty: '보통',
      });
      if (answer !== undefined) {
        const properties = body.response_format.json_schema.schema.properties;
        if (properties.answerable) {
          const payload: { evidence: Record<string, string> } = JSON.parse(body.messages[1]?.content ?? '{}');
          const source = `note:${about}`, quote = payload.evidence[source];
          text = JSON.stringify({ subject: about, relation: '공개된 항목 설명', answerType: '정본 정보', answerable: Boolean(quote), evidence: quote ? [{ source, quote }] : [] });
        } else if (properties.answer) text = '{"answer":true}';
        else if (body.messages[0]?.content === GRAMMAR_SYSTEM) {
          const payload: { lines: { text: string }[] } = JSON.parse(body.messages[1]?.content ?? '{}');
          text = JSON.stringify({ lines: payload.lines.map(line => ({ original: line.text, corrected: line.text })) });
        } else text = JSON.stringify({ lines: [{ speaker: 'GM', text: answer }] });
      }
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });
  return { server, requests, client: new LlmClient({ baseUrl: `http://127.0.0.1:${server.port}`, timeoutMs: 1000 }) };
}

test.each(gates.flatMap(([id, flag]) => [false, true].map((opened) => [id, flag, opened] as const)))(
  '%s · %s=%s에서 같은 질문의 본문·선택 id·해석 결과가 일치한다',
  async (id, flag, opened) => {
    const ctx = context({ [flag]: opened });
    const note = lore.knowledge.find((entry) => entry.id === id);
    if (!note) throw new Error(`질문 항목 없음: ${id}`);
    const mock = probe(id);
    try {
      const result = await new LocalGm(mock.client, lore).interpret(ctx);
      expect(result).toMatchObject({ kind: 'ask', about: opened ? id : 'none' });
      expect(mock.requests).toHaveLength(1);
      const request = mock.requests[0];
      if (!request) throw new Error('해석 요청 없음');
      expect(request.messages[0]?.content.includes(note.text)).toBe(false);
      expect(JSON.stringify(questionFacts(ctx, loreFor(lore, ctx.state))).includes(note.text)).toBe(opened);
      expect(request.messages[1]?.content.includes(`${id}=`)).toBe(opened);
      expect(request.response_format.json_schema.schema.properties.about.enum.includes(id)).toBe(opened);
    } finally {
      mock.server.stop(true);
    }
  },
);

test.each(gates.slice(3))('%s 공개는 나머지 정체 항목을 열지 않는다', (id, flag) => {
  const ctx = context({ [flag]: true });
  const visible = loreFor(lore, ctx.state);
  for (const [other] of gates.slice(3)) {
    expect(visible.knowledge.some((entry) => entry.id === other && entry.tier !== 'hidden')).toBe(other === id);
  }
});

test.each([false, true])('수첩의 after 공개 조건도 본문·선택 목록을 함께 잠근다: %p', async (opened) => {
  const ctx = context({ '수첩:captive': opened });
  const note = lore.knowledge.find((entry) => entry.id === 'captive');
  if (!note) throw new Error('수첩 항목 없음');
  const mock = probe('captive');
  try {
    const result = await new LocalGm(mock.client, lore).interpret(ctx);
    expect(result).toMatchObject({ kind: 'ask', about: opened ? 'captive' : 'none' });
    const request = mock.requests[0];
    if (!request) throw new Error('해석 요청 없음');
    expect(request.messages[0]?.content.includes(note.text)).toBe(false);
    expect(JSON.stringify(questionFacts(ctx, loreFor(lore, ctx.state))).includes(note.text)).toBe(opened);
    expect(request.response_format.json_schema.schema.properties.about.enum.includes('captive')).toBe(opened);
  } finally {
    mock.server.stop(true);
  }
});

test('if 없는 영구 hidden은 질문 본문·선택 목록·직접 설명으로 공개하지 않는다', async () => {
  const permanent = {
    id: 'permanent_private', tier: 'hidden', kind: '세계', name: '봉인된 비밀', text: '영구 비공개 설정 본문', keys: ['봉인된 설정'],
  } as const;
  const raw: Lore = { ...lore, knowledge: [...lore.knowledge, { ...permanent, keys: [...permanent.keys] }] };
  const ctx = context(Object.fromEntries(gates.map(([, flag]) => [flag, true])));
  const visible = loreFor(raw, ctx.state);
  expect(visible.knowledge.find((entry) => entry.id === permanent.id)?.tier).toBe('hidden');
  expect(buildSystem(ctx, visible)).not.toContain(permanent.text);
  expect(buildInterpretUser(ctx, visible)).not.toContain(`${permanent.id}=`);
  expect(JSON.stringify(interpretSchema(ctx.free, ctx.state.items, visible, []))).not.toContain(permanent.id);
  const out = await new LocalGm(null, raw).explain({ ...ctx, about: permanent.id });
  expect(out.lines.some((line) => line.text.includes(permanent.text))).toBe(false);
});

test.each(gates)('%s는 위조한 about를 거절하고 공개 뒤 관계 근거 검수를 거쳐 설명한다', async (id, flag) => {
  const gm = new LocalGm(null, lore);
  const note = lore.knowledge.find((entry) => entry.id === id);
  if (!note) throw new Error(`항목 없음: ${id}`);
  const closed = await gm.explain({ ...context({}), about: id });
  expect(closed.lines.some((line) => line.text === (note.say ?? note.text))).toBe(false);
  // 정본 raw text를 그대로 내보내던 옛 fallback과 달리, 생성문은 말투·독립 공개 잠금도 지킨다.
  const answers: Record<string, string> = {
    fesian: '페시안은 남대륙을 거의 통째로 차지한 사막의 거대 국가야.',
    jail: '감옥은 도시 중앙의 햇볕이 잘 드는 곳에 있어.',
    ep03_harem: '그 방은 하렘에서 아시나가 지낼 곳이야.',
    man_true: '그 남자의 본명은 베히다트야.',
    man_ruler: '그 남자는 자신이 그 나라의 주인이라고 밝혔어.',
    man_la_kun: '그 남자는 라 쿤이라 불려. 신적 능력이 확인된 건 아니야.',
  };
  const answer = answers[id] ?? note.say ?? note.text;
  const mock = probe(id, answer);
  try {
    const open = await new LocalGm(mock.client, lore)
      .explain({ ...context({ [flag]: true }), text: `${note.name}에 대해 알려 줘.`, about: id });
    expect({ fallback: open.meta.fallback, errors: open.meta.fallback ? open.meta.violations : [] }).toEqual({ fallback: false, errors: [] });
    expect(open.lines.some(line => line.text === answer)).toBe(true);
  } finally { mock.server.stop(true); }
});
