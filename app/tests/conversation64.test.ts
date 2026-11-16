import { describe, expect, test } from 'bun:test';
import { Engine, type GmContext, type GmLines, type GmPort, type Interpretation } from '../src/engine/engine.ts';
import { parseScenario } from '../src/engine/scenario.ts';
import type { GameState } from '../src/engine/types.ts';
import { FakeGm, loadDesert, META } from './helpers.ts';

const original = await Bun.file(new URL('../content/ep03_palace.yaml', import.meta.url)).text();

function fixture() {
  const scenario = parseScenario(original);
  scenario.start = 'ep03_c046';
  for (const key of ['ep03_시녀', 'ep03_목욕시녀', 'ep03_보고자', 'ep03_시종', 'ep03_대족장', 'ep03_잘릴', 'ep03_잘릴독백']) {
    const cast = scenario.cast[key];
    if (!cast) throw new Error(`배우 없음: ${key}`);
    cast.presentation = 'cg';
    cast.faces = ['neutral', 'scared'];
  }
  for (const [id, next, cg] of [
    ['ep03_c046', 'after_protest', 'ep03_cg_046'],
    ['ep03_c049', 'after_question', 'ep03_cg_049'],
  ] as const) {
    const beat = scenario.beats[id];
    if (!beat) throw new Error(`장면 없음: ${id}`);
    beat.cast = { left: 'ep03_아시나', center: null, right: 'ep03_시녀' };
    beat.conversation = {
      situation: '시녀가 아시나 앞에서 답을 기다린다.', goal: '지금 한 말과 몸짓에 반응한다.',
      speakers: ['ep03_나레이션', 'ep03_시녀'], must_not: [], state_guard: [], echo_only: [],
      talk_fallback: [], deflect: [], cg, next,
    };
  }
  scenario.beats.after_protest = { id: 'after_protest', title: '대화 뒤', lines: [], next: 'ep03_c049' };
  scenario.beats.after_question = {
    id: 'after_question', title: '통보',
    lines: [{ speaker: 'ep03_시녀', text: '아가씨께서 유일한 아이라시니까요.', cg: 'ep03_cg_050', sets: 'ep03_유일한아이라_앎' }],
    next: 'ep03_c052',
  };
  return scenario;
}

class ConversationGm implements GmPort {
  contexts: GmContext[] = [];
  talkContexts: GmContext[] = [];
  calls = 0;
  constructor(
    readonly reading: Interpretation = { kind: 'talk', to: 'person', source: 'llm', meta: META },
    readonly reply: GmLines = { lines: [{ speaker: 'ep03_시녀', text: '시녀는 고개를 기울였다.', face: 'neutral' }], meta: META },
  ) {}
  async interpret(ctx: GmContext): Promise<Interpretation> {
    this.contexts.push(structuredClone(ctx));
    return this.reading;
  }
  async talk(ctx: GmContext): Promise<GmLines> { this.calls += 1; this.talkContexts.push(structuredClone(ctx)); return this.reply; }
  async narrate(): Promise<GmLines> { throw new Error('선택 대화에서 판정을 요청했다'); }
  async explain(): Promise<GmLines> { throw new Error('인물 대화에서 설명을 요청했다'); }
}

const send = (engine: Engine, state: GameState, text: string) =>
  engine.act(state, { type: 'interject', text, scene: state.beat, shown: [], pending: [] });

describe('선택 대화의 실제 엔진 경계', () => {
  test('이미 끝난 이야기에서 완료할 수 없는 시도는 기존 실패 시도 문맥을 유지한다', async () => {
    const scenario = await loadDesert();
    let context: GmContext | undefined;
    class EndingGm extends FakeGm {
      override async talk(ctx: GmContext): Promise<GmLines> { context = ctx; return super.talk(ctx); }
    }
    const gm = new EndingGm();
    const engine = new Engine(scenario, gm);
    const { state } = engine.newGame(1, 'ended');
    state.ending = 'finished';
    const result = await engine.act(state, { type: 'interject', scene: 'b05_why', text: '(칼을 빼앗으려 손을 뻗는다)', shown: [], pending: [] });
    expect(context?.interject?.action).toBe(true);
    expect(result.state.ending).toBe('finished');
    expect(result.state.rng).toBe(state.rng);
    expect(result.state.tracks).toEqual(state.tracks);
    expect(result.step.events.some((event) => event.type === 'roll')).toBe(false);
  });
  test('평범한 혼합 몸짓은 실제 동작으로 전달하되 실패 시도 경로로 보내지 않는다', async () => {
    const gm = new ConversationGm();
    const engine = new Engine(fixture(), gm);
    const { state } = engine.newGame(1, 'gesture');
    const result = await send(engine, state, '(손바닥을 가볍게 든다) 제 말도 들어 주세요.');
    const ctx = gm.talkContexts[0];
    expect(ctx?.acted).toBe(true);
    expect(ctx?.spoken).toBe(true);
    expect(ctx?.interject?.action).toBe(false);
    expect(ctx?.input).toMatchObject({ kind: 'valid', action: '손바닥을 가볍게 든다', speech: '제 말도 들어 주세요.' });
    expect(result.state.rng).toBe(state.rng);
    expect(result.state.tracks).toEqual(state.tracks);
    expect(result.step.events.some((event) => event.type === 'roll')).toBe(false);
  });
  test('원문 선택지는 자유 입력 진행 없이 원래 대사와 다음 자리를 보존한다', async () => {
    const gm = new ConversationGm();
    const engine = new Engine(fixture(), gm);
    const { state, step } = engine.newGame(1, 'choices');
    expect(state.free).toBeNull();
    expect(step.prompt.type).toBe('choices');
    const out = await engine.act(state, { type: 'choose', id: 'ep03_i01_protest' });
    expect(out.state.beat).toBe('ep03_c049');
    expect(out.step.events.some((event) => event.type === 'line' && event.text.includes('정신 차려'))).toBe(true);
    expect(gm.calls).toBe(0);
  });

  test.each([
    ['제 뜻도 존중해 주세요.', { kind: 'talk', to: 'person', source: 'llm', meta: META }],
    ['그 말을 영광이라고 하는 이유가 뭐죠?', { kind: 'ask', about: 'unknown', source: 'llm', meta: META }],
    ['(가만히 기다린다)', { kind: 'idle', source: 'llm', meta: META }],
    ['(눈물이 흐른다)', { kind: 'idle', source: 'llm', meta: META }],
    ['(벽의 무늬를 손가락으로 짚는다)', { kind: 'improv', target: 'local', deed: '벽을 손가락으로 짚는다', stat: '재치', difficulty: 0, label: '몸짓', absurd: false, bold: false, source: 'llm', meta: META }],
  ] satisfies [string, Interpretation][])('%s는 판정·비용 없이 현재 응답자로 받고 직접 입력 경로로 간다', async (text, reading) => {
    const gm = new ConversationGm(reading);
    const engine = new Engine(fixture(), gm);
    const { state } = engine.newGame(1, 'conversation');
    const out = await send(engine, state, text);
    expect(out.state.beat).toBe('ep03_c049');
    expect(out.state.rng).toBe(state.rng);
    expect(out.state.tracks).toEqual(state.tracks);
    expect(out.state.items).toEqual(state.items);
    expect(out.state.free).toBeNull();
    expect(out.state.log.some((entry) => entry.kind === 'check')).toBe(false);
    expect(out.step.events.some((event) => event.type === 'line' && event.by === 'gm' && event.cg === 'ep03_cg_046')).toBe(true);
    expect(out.step.events.some((event) => event.type === 'line' && event.text.includes('정신 차려'))).toBe(false);
    expect(gm.contexts[0]?.free.approaches).toEqual([]);
  });

  test.each([
    { lines: [], meta: META },
    { lines: [{ speaker: 'ep03_시녀', text: '대체 응답', face: 'neutral' }], meta: { ...META, fallback: true } },
    { lines: [{ speaker: 'ep03_잘릴', text: '무대 밖 응답', face: 'neutral' }], meta: META },
    { lines: [{ speaker: 'ep03_시녀', text: '허용되지 않은 표정', face: 'menacing' }], meta: META },
  ] satisfies GmLines[])('실패 응답 %#으로는 다음 장면을 완료하지 않는다', async (reply) => {
    const engine = new Engine(fixture(), new ConversationGm(undefined, reply));
    const { state } = engine.newGame(1, 'invalid-reply');
    const before = structuredClone(state);
    await expect(send(engine, state, '듣고 계세요?')).rejects.toBeInstanceOf(Error);
    expect(state).toEqual(before);
  });

  test.each([
    { scene: 'ep03_c049', pending: [] },
    { scene: 'ep03_c046', pending: [{ i: 0, text: '미표시 대사' }] },
  ])('현재 문맥을 확정할 수 없는 화면 %#에서는 응답을 요청하지 않는다', async ({ scene, pending }) => {
    const gm = new ConversationGm();
    const engine = new Engine(fixture(), gm);
    const { state } = engine.newGame(1, 'wrong-view');
    await expect(engine.act(state, { type: 'interject', text: '잠깐요.', scene, shown: [], pending: [...pending] })).rejects.toBeInstanceOf(Error);
    expect(gm.calls).toBe(0);
  });

  test('지속 목표는 수치·장면 소비 없이 범위를 다시 묻는다', async () => {
    const gm = new ConversationGm({ kind: 'clarify', message: '지금 할 몸짓을 적어 줘.', source: 'llm', meta: META });
    const engine = new Engine(fixture(), gm);
    const { state } = engine.newGame(1, 'scope');
    const out = await send(engine, state, '(궁을 나와 고국으로 돌아간다)');
    expect(out.state).toEqual(state);
    expect(out.step.events.some((event) => event.type === 'notice' && event.kind === 'rewrite')).toBe(true);
    expect(gm.calls).toBe(0);
  });

  test('현재 선택 대화 기억은 같은 응답자와 실제 나눈 대화만 쓴다', async () => {
    const gm = new ConversationGm();
    const engine = new Engine(fixture(), gm);
    const { state } = engine.newGame(1, 'memory');
    state.heard = [{ text: '다른 장의 비공개 발화', action: false }];
    const first = await send(engine, state, '제 뜻도 존중해 주세요.');
    await send(engine, first.state, '방금 말을 기억하세요?');
    expect(gm.contexts[0]?.state.heard).toEqual([]);
    expect(gm.contexts[0]?.state.recent).toEqual([]);
    expect(gm.contexts[1]?.state.heard).toEqual([{ text: '제 뜻도 존중해 주세요.', action: false }]);
  });
});
