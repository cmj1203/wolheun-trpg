import { expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient } from '../src/gm/llm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { CHANGE_SYSTEM, GRAMMAR_SYSTEM } from '../src/gm/prompt.ts';
import { FakeGm, SCENARIO_PATH, LORE_PATH, tokenBudgetFixture } from './helpers.ts';

const lore = await loadLore(LORE_PATH);
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const scenario = { ...campaign, start: 'ep03_c001' };
const reason = '플레이어의 입력은 현재 장면의 목표와 달라 scope를 clarify로 설정한다.';

function fake(reading: Record<string, unknown>) {
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(req) {
      const budget = await tokenBudgetFixture(req);
      if (budget) return budget;
      const body: { messages: { content: string }[] } = await req.json();
      const system = body.messages[0]?.content;
      const user = body.messages[1]?.content ?? '{}';
      const grammar: { lines: { text: string }[] } = system === GRAMMAR_SYSTEM ? JSON.parse(user) : { lines: [] };
      const text = JSON.stringify(system === GRAMMAR_SYSTEM
        ? { lines: grammar.lines.map((line) => ({ original: line.text, corrected: line.text })) }
        : system === CHANGE_SYSTEM ? { change: '자리가 바뀜' }
        : { reason, kind: 'action', about: 'none', risk: 'none', approach: 'none', target: 'local', scope: 'clarify', item: '', odd: false, absurd: false, bold: false, deed: '출입구로 몸을 옮긴다', stat: '근력', difficulty: '보통', ...reading });
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  return { server, gm: new LocalGm(new LlmClient({ baseUrl: `http://127.0.0.1:${server.port}`, timeoutMs: 1000 }), lore) };
}

test.each([
  { label: '궁 밖으로 이동', question: '궁을 벗어나려면 지금 어디로 움직일까?' },
  { label: '궁 밖으로 이동' },
  { label: '궁 밖으로 이동', question: '궁을 벗어나려면 우선' },
  { label: '궁 밖으로 이동', question: reason },
])('분석 근거와 완결된 재질문은 별도 필드로 다룬다: %p', async (reading) => {
  const mock = fake(reading);
  try {
    const setup = new Engine(scenario, new FakeGm());
    const { state } = setup.newGame(2, 'clarify');
    const engine = new Engine(scenario, mock.gm);
    const out = await engine.act(state, { type: 'interject', text: '(궁을 나와 자유를 되찾는다)', scene: state.beat, shown: [], pending: [] });
    const question = out.step.events.find((event) => event.type === 'line' && event.style === 'gm');
    if (question?.type !== 'line') throw new Error('표시할 확인 질문이 없다');
    expect(question.text).not.toBe(reason);
    expect(question.text.endsWith('?')).toBe(true);
    // 계약(리드 결정, resume90 4차 1번): 모델이 쓴 물음은 화면에 내지 않는다. 고정된 여우 줄만 보인다.
    if ('question' in reading) expect(out.step.events.some((event) => event.type === 'line' && event.text === reading.question)).toBe(false);
    expect(out.state.beat).toBe(state.beat);
    expect(out.state.rng).toBe(state.rng);
    expect(out.state.tracks).toEqual(state.tracks);
    expect(out.step.events.some((event) => event.type === 'notice' && event.kind === 'rewrite')).toBe(true);
  } finally { mock.server.stop(true); }
});
