import { expect, test } from 'bun:test';
import { Engine, type GmContext } from '../src/engine/engine.ts';
import { DEFAULT_GM_OPTIONS, LocalGm } from '../src/gm/gm.ts';
import { LlmClient } from '../src/gm/llm.ts';
import { GRAMMAR_SYSTEM } from '../src/gm/prompt.ts';
import { FakeGm, loadDesert, loadWolheunLore } from './helpers.ts';

test.each([
  { input: '앞으로 어떻게 되나요?', unsupported: '누구도 널 해치지 않을 것이다.', accepted: '네 행동을 지켜보겠다.', kind: 'intention' },
  { input: '(시녀를 향해 손바닥을 편다) 이 방은 왜 이렇게 조용한가요?', unsupported: '이곳에서는 언제나 침묵을 지켜야 한다.', accepted: '내게는 이 침묵이 편하다.', kind: 'opinion' },
  { input: '(문 쪽으로 귀를 기울인다) 복도에서도 아무 소리가 안 들려요.', unsupported: '소리가 없으니 궁 안에는 다른 사람이 없다.', accepted: '난 네 앞에 서 있다.', kind: 'world' },
  { input: '(방 안을 둘러본다) 여긴 다들 목소리를 낮추네요.', unsupported: '궁에 들어온 자는 누구나 대화를 삼가야 한다.', accepted: '네 행동을 지켜보겠다.', kind: 'intention' },
])('외부 사실 주장 $unsupported은 근거 검수 후 재생성하고 $kind는 정당한 귀속으로 허용한다', async ({ input, unsupported, accepted, kind }) => {
  const scenario = await loadDesert();
  const lore = await loadWolheunLore();
  const beat = scenario.beats.b05_why;
  if (!beat?.free) throw new Error('대화 기준 없음');
  const { state } = new Engine(scenario, new FakeGm()).newGame(2, 'grounding');
  const ctx: GmContext = {
    scenario, state, beat: { ...beat, conversation: { ...beat.free, cg: 'unused', next: beat.id } },
    free: { ...beat.free, situation: '남자가 아시나 앞에 서 있다.' }, text: input, spoken: true,
  };
  let generations = 0;
  const candidates: unknown[] = [];
  const mock = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(req) {
      const body: { messages: { content: string }[] } = await req.json();
      const system = body.messages[0]?.content ?? '';
      const user = body.messages[1]?.content ?? '';
      let answer: unknown;
      if (system === GRAMMAR_SYSTEM) {
        const input = JSON.parse(user);
        answer = { lines: input.lines.map((line: { text: string }) => ({ original: line.text, corrected: line.text })) };
      } else if (system.startsWith('대화의 주장을')) {
        const request = JSON.parse(user);
        candidates.push(request);
        const bad = candidates.length === 1;
        const forgedQuote = bad && kind === 'opinion';
        const unrelatedQuote = bad && kind === 'world';
        answer = { assessments: request.lines.map((line: { line: number }) => ({
          line: line.line, claims: [{
            text: bad ? unsupported : accepted, kind: forgedQuote ? 'opinion' : bad ? 'world' : kind,
            supported: !bad || forgedQuote || unrelatedQuote,
            source: forgedQuote || unrelatedQuote || (!bad && kind === 'world') ? 'situation' : 'none',
            quote: forgedQuote ? unsupported : unrelatedQuote || (!bad && kind === 'world') ? request.evidence.situation : '',
          }],
        })) };
      } else if (system.startsWith('인용한 근거가')) {
        const request = JSON.parse(user);
        answer = { supported: request.citations.map(() => generations > 1) };
      } else if (system.startsWith('글을 읽고')) {
        answer = { answer: false };
      } else {
        generations += 1;
        answer = { lines: [{ speaker: '남자', face: 'menacing', text: generations === 1 ? unsupported : accepted }] };
      }
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(answer) } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  try {
    const gm = new LocalGm(new LlmClient({ baseUrl: `http://127.0.0.1:${mock.port}`, timeoutMs: 1000 }), lore, { ...DEFAULT_GM_OPTIONS, retries: 1, budgetMs: 10000 });
    const reply = await gm.talk(ctx);
    expect(generations).toBe(2);
    expect(candidates).toHaveLength(2);
    expect(reply.meta.violations.some((message) => message.startsWith('lore/grounding:'))).toBe(true);
    expect(reply.meta.fallback).toBe(false);
    expect(reply.lines[0]?.text).toBe(accepted);
    expect(candidates[0]).toMatchObject({ evidence: { situation: ctx.free.situation, input: ctx.text }, lines: [{ line: 0, speaker: '남자', text: unsupported }] });
  } finally { mock.stop(true); }
});
