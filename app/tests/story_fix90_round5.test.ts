import { describe, expect, test } from 'bun:test';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { Engine, type GmContext, type Interpretation, type NarrateContext } from '../src/engine/engine.ts';
import { parseStoryInput } from '../src/engine/text.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { ATTEMPT_CHECK_SYSTEM, buildTalkUser, CHANGE_SYSTEM, GRAMMAR_SYSTEM, NO_CHANGE } from '../src/gm/prompt.ts';
import { approachOf, FakeGm, LORE_PATH, SCENARIO_PATH } from './helpers.ts';

// resume90 스토리 수정 5차(리드 결정 1~3)의 회귀. 모델 없이 엔진과 가짜 LlmClient 로 돈다.
const lore = await loadLore(LORE_PATH);
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const GOAL_TEXT = campaign.beats.b02_people?.free?.goals?.run?.text ?? '';

class StubLlm extends LlmClient {
  readonly calls: ChatRequest[] = [];
  constructor(private readonly opts: { change: string; audit: object }) {
    super({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 1000 });
  }

  override async chatJson(req: ChatRequest): Promise<LlmResult> {
    this.calls.push(req);
    const text = req.system === GRAMMAR_SYSTEM
      ? JSON.stringify({ lines: (JSON.parse(req.user) as { lines: { text: string }[] }).lines.map((l) => ({ original: l.text, corrected: l.text })) })
      : req.system === ATTEMPT_CHECK_SYSTEM ? JSON.stringify(this.opts.audit)
      : req.system === CHANGE_SYSTEM ? JSON.stringify({ change: this.opts.change })
      : JSON.stringify({ reason: '근거', label: '사람들에게 다가가기', kind: 'action', about: 'none', risk: 'none', approach: 'none', target: 'run', scope: 'clarify', item: '', odd: false, absurd: false, bold: false, deed: GOAL_TEXT, stat: '재치', difficulty: '보통' });
    return { text, ttftMs: null, totalMs: 0, promptTokens: null, completionTokens: null, promptMs: null, genMs: null, model: 'stub' };
  }
}

function ctxAt(beatId: string, text: string): GmContext {
  const engine = new Engine(campaign, new FakeGm());
  const { state } = engine.newGame(11, 'fix90-r5');
  state.beat = beatId;
  const beat = campaign.beats[beatId];
  if (!beat?.free) throw new Error(`${beatId} 자유 입력이 없습니다`);
  return { scenario: campaign, beat, free: beat.free, state, text, input: parseStoryInput(text) };
}

describe('5차 1: 다음 장면 첫 줄은 서술 입력에 없다', () => {
  test('판정 서술에 넘기는 문맥에 next 가 없다(상한은 그대로)', async () => {
    const seen: NarrateContext[] = [];
    class Capture extends FakeGm {
      override async narrate(ctx: NarrateContext) {
        seen.push(ctx);
        return super.narrate(ctx);
      }
    }
    const engine = new Engine(campaign, new Capture((): Interpretation => approachOf('plead')));
    let { state } = engine.newGame(5, 'fix90-r5-next');
    ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
    await engine.act(state, { type: 'free', text: '저는 그냥 길을 잃은 여행자예요.' });
    const ctx = seen.at(-1);
    expect(ctx).toBeDefined();
    expect(ctx && 'next' in ctx).toBe(false);
    expect(typeof ctx?.bound).toBe('string');
  });
});

describe('5차 2: 범위 제안은 원문에서 확인한 부분으로만 만든다', () => {
  const text = '저 여기 있어요! 여기요!';

  test('아무것도 시도하지 않는 말에는 범위 제안이 없고 검수도 부르지 않는다', async () => {
    const llm = new StubLlm({ change: NO_CHANGE, audit: { supported: true, partial: true, typed: '외쳤다' } });
    const result = await new LocalGm(llm, lore).interpret(ctxAt('b02_people', text));
    expect(result.kind === 'clarify' && result.proposal).toBeFalsy();
    expect(llm.calls.some((c) => c.system === ATTEMPT_CHECK_SYSTEM)).toBe(false);
  });

  test('시도가 있어도 검수가 일부를 확인하지 못하면(후보 목표 문구만 있으면) 제안하지 않는다', async () => {
    const llm = new StubLlm({ change: '자리가 바뀜', audit: { supported: true, partial: false, typed: '' } });
    const result = await new LocalGm(llm, lore).interpret(ctxAt('b02_people', '(언덕을 내려간다) 저 여기 있어요!'));
    expect(result.kind === 'clarify' && result.proposal).toBeFalsy();
  });

  test('검수가 확인한 원문의 부분이 있으면 그 부분으로만 제안하고 목표 문구를 쓰지 않는다', async () => {
    const llm = new StubLlm({ change: '자리가 바뀜', audit: { supported: true, partial: true, typed: '언덕을 내려갔다' } });
    const result = await new LocalGm(llm, lore).interpret(ctxAt('b02_people', '(언덕을 내려간다) 저 여기 있어요!'));
    if (result.kind !== 'clarify') throw new Error(`clarify 가 아닙니다: ${result.kind}`);
    expect(result.proposal?.deed).toBe('언덕을 내려갔다');
    expect(result.proposal?.deed).not.toBe(GOAL_TEXT);
  });
});

describe('5차 3: 판정 없는 말의 대화 입력에 지금 순간이 들어간다', () => {
  test('대화 지시에 화면의 마지막 장면 줄이 들어가고, 짧은 반응에는 넣지 않는다', () => {
    const ctx = ctxAt('b06_swing', '꺄악! 잠깐, 잠깐만요!!');
    const now = { speaker: '속마음', text: '미친―! 피해야 돼!!' };
    const withRecent = { ...ctx, state: { ...ctx.state, recent: [...ctx.state.recent, now] } };
    expect(buildTalkUser(withRecent, '', 2, 80)).toContain(now.text);
    expect(buildTalkUser({ ...withRecent, reaction: true }, '', 1, 40)).not.toContain(`마지막 장면 줄: ${now.speaker}: ${now.text}`);
  });
});
