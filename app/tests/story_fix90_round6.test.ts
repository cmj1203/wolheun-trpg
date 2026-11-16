import { describe, expect, test } from 'bun:test';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { Engine, type Interpretation } from '../src/engine/engine.ts';
import { parseStoryInput } from '../src/engine/text.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { GRAMMAR_SYSTEM } from '../src/gm/prompt.ts';
import { FakeGm, LORE_PATH, META, SCENARIO_PATH } from './helpers.ts';

// resume90 스토리 수정 6차(리드 결정 1·2)의 회귀. 모델 없이 엔진과 가짜 LlmClient 로 돈다.
const lore = await loadLore(LORE_PATH);
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const CLARIFY_LINE = '그 목표를 이루려면 우선 어떤 행동을 할까?';
const typed = '모래 언덕을 내려가 세 사람 쪽으로 걸어갔다';

const clarifyWith = (bold: boolean) => (): Interpretation => ({
  kind: 'clarify', message: CLARIFY_LINE, typed: true, source: 'llm', meta: META,
  proposal: { stat: '재치', difficulty: 0, label: '다가가기', absurd: false, bold, deed: typed, target: 'local', source: 'llm', meta: META },
});

describe('6차 1: 원문 그대로의 범위 제안은 확인 없이 굴린다', () => {
  test('작은 행동의 범위 제안은 확인 창 없이 그 범위로 바로 판정한다', async () => {
    const engine = new Engine(campaign, new FakeGm(clarifyWith(false)));
    const { state } = engine.newGame(41, 'fix90-r6');
    const { state: after, step } = await engine.act(state, { type: 'free', text: '(모래 언덕을 내려가 세 사람 쪽으로 걸어간다)' });
    expect(step.events.some((e) => e.type === 'confirm')).toBe(false);
    expect(after.pendingIntent).toBeUndefined();
    expect(after.log.filter((e) => e.kind === 'check')).toHaveLength(1);
  });

  test('큰 행동의 범위 제안은 확인 창이 남고, 창 글에 되묻는 고정 줄이 섞이지 않는다', async () => {
    const engine = new Engine(campaign, new FakeGm(clarifyWith(true)));
    const { state } = engine.newGame(41, 'fix90-r6-bold');
    const { state: after, step } = await engine.act(state, { type: 'free', text: '(모래 언덕을 내려가 세 사람 쪽으로 걸어간다)' });
    const card = step.events.find((e) => e.type === 'confirm' && e.kind === 'intent');
    if (card?.type !== 'confirm') throw new Error('확인 창이 없습니다');
    expect(card.text.includes(CLARIFY_LINE)).toBe(false);
    expect(card.text.includes(typed)).toBe(true);
    expect(after.log.filter((e) => e.kind === 'check')).toHaveLength(0);
  });
});

describe('6차 2: 시도 없는 대화의 생성 입력에 화면 목표·선택지가 없다', () => {
  class StubLlm extends LlmClient {
    readonly calls: ChatRequest[] = [];
    constructor() {
      super({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 1000 });
    }

    override async chatJson(req: ChatRequest): Promise<LlmResult> {
      this.calls.push(req);
      const text = req.system === GRAMMAR_SYSTEM
        ? JSON.stringify({ lines: (JSON.parse(req.user) as { lines: { text: string }[] }).lines.map((l) => ({ original: l.text, corrected: l.text })) })
        : req.system.startsWith('글을 읽고') ? JSON.stringify({ answer: false })
        : JSON.stringify({ lines: [{ speaker: '나레이션', text: '목소리는 바람에 흩어졌다.' }] });
      return { text, ttftMs: null, totalMs: 0, promptTokens: null, completionTokens: null, promptMs: null, genMs: null, model: 'stub' };
    }
  }

  test('b02 에서 시도 없는 말의 대화 생성 요청(system·user)에 장면 목표·화면 목표·행동 이름이 없고 상황은 있다', async () => {
    const engine = new Engine(campaign, new FakeGm());
    const { state } = engine.newGame(41, 'fix90-r6-talk');
    const beat = campaign.beats.b02_people;
    const free = beat?.free;
    if (!beat || !free) throw new Error('b02 가 없습니다');
    const text = '저기요! 거기 누구 있어요?';
    const llm = new StubLlm();
    await new LocalGm(llm, lore).talk({ scenario: campaign, beat, free, state, text, input: parseStoryInput(text) });
    const generation = llm.calls.find((c) => c.system !== GRAMMAR_SYSTEM && !c.system.startsWith('글을 읽고'));
    if (!generation) throw new Error('생성 요청이 없습니다');
    const sent = `${generation.system}\n${generation.user}`;
    expect(sent.includes(free.goal)).toBe(false);
    expect(free.aim ? sent.includes(free.aim) : false).toBe(false);
    for (const approach of free.approaches) expect(sent.includes(approach.label)).toBe(false);
    expect(sent.includes(free.situation)).toBe(true);
  });
});
