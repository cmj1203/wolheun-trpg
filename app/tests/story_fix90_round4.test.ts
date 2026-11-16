import { expect, test } from 'bun:test';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { Engine } from '../src/engine/engine.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { ATTEMPT_CHECK_SYSTEM, CHANGE_SYSTEM, GRAMMAR_SYSTEM } from '../src/gm/prompt.ts';
import { LORE_PATH, SCENARIO_PATH } from './helpers.ts';

// resume90 스토리 수정 4차(리드 결정 1번): 해석이 clarify 로 돌아올 때 모델이 쓴 물음은 화면에 나오지 않는다.
const lore = await loadLore(LORE_PATH);
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const MODEL_QUESTION = '멀리 있는 사람들에게 직접 다가가 말을 거시겠습니까, 아니면 일단 거리를 두고 지켜보시겠습니까?';

class StubLlm extends LlmClient {
  readonly calls: ChatRequest[] = [];
  constructor(private readonly deed = '사람들에게 소리쳐 불렀다') {
    super({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 1000 });
  }

  override async chatJson(req: ChatRequest): Promise<LlmResult> {
    this.calls.push(req);
    const text = req.system === GRAMMAR_SYSTEM
      ? JSON.stringify({ lines: (JSON.parse(req.user) as { lines: { text: string }[] }).lines.map((l) => ({ original: l.text, corrected: l.text })) })
      : req.system === ATTEMPT_CHECK_SYSTEM ? JSON.stringify({ supported: true, partial: false, typed: '' })
      : req.system === CHANGE_SYSTEM ? JSON.stringify({ change: '자리가 바뀜' })
      : JSON.stringify({ reason: '근거', label: '사람들에게 말 걸기', question: MODEL_QUESTION, kind: 'action', about: 'none', risk: 'none', approach: 'none', target: 'run', scope: 'clarify', item: '', odd: false, absurd: false, bold: false, deed: this.deed, stat: '재치', difficulty: '보통' });
    return { text, ttftMs: null, totalMs: 0, promptTokens: null, completionTokens: null, promptMs: null, genMs: null, model: 'stub' };
  }
}

const shownTexts = (events: readonly { type: string; text?: string }[]) => events.flatMap((e) => (typeof e.text === 'string' ? [e.text] : []));

test.each([
  ['범위 제안이 없는 clarify', ''],
  ['범위 제안(확인 창)이 붙은 clarify', '사람들에게 소리쳐 불렀다'],
])('%s: 모델이 쓴 물음은 줄·확인 창 어디에도 나오지 않고 고정된 여우 줄만 쓴다', async (_name, deed) => {
  const llm = new StubLlm(deed);
  const engine = new Engine(campaign, new LocalGm(llm, lore));
  const { state } = engine.newGame(2809, 'fix90-r4');
  const { step, state: after } = await engine.act(state, { type: 'free', text: '저기요! 거기 누구 있어요?' });
  expect(shownTexts(step.events).some((text) => text.includes(MODEL_QUESTION))).toBe(false);
  const fox = step.events.filter((e) => e.type === 'line' && e.style === 'gm');
  const card = step.events.filter((e) => e.type === 'confirm' && e.kind === 'intent');
  expect(fox.length + card.length).toBe(1);
  if (fox[0]?.type === 'line') expect(fox[0].by).toBe('script');
  expect(after.beat).toBe('b02_people');
  expect(after.log.filter((e) => e.kind === 'check')).toHaveLength(0);
});

test('해석 스키마에 물음(question) 칸이 없어 모델이 물음을 쓰지 않는다', async () => {
  const llm = new StubLlm();
  const engine = new Engine(campaign, new LocalGm(llm, lore));
  const { state } = engine.newGame(2809, 'fix90-r4-schema');
  await engine.act(state, { type: 'free', text: '저기요! 거기 누구 있어요?' });
  const interpret = llm.calls.find((c) => c.system.startsWith('플레이어 입력의 의도'));
  const props = (interpret?.schema as { properties?: Record<string, unknown>; required?: string[] } | undefined);
  expect(props && 'question' in (props.properties ?? {})).toBe(false);
  expect(props?.required ?? []).not.toContain('question');
});
