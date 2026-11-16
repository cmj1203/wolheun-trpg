import { expect, test } from 'bun:test';
import { Engine, type GmContext, type Interpretation } from '../src/engine/engine.ts';
import type { GameState } from '../src/engine/types.ts';
import { isNoAttempt } from '../src/engine/text.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { FakeGm, META, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const setup = new Engine(scenario, new FakeGm());
const opening = setup.newGame(1, 'silence52');
const base = (await setup.act(opening.state, { type: 'approach', id: 'run' })).state;
const linesOf = (events: Awaited<ReturnType<Engine['act']>>['step']['events']) =>
  events.flatMap((e) => e.type === 'line' ? [`${e.speaker}: ${e.text}`] : []);

test('모델 없이도 주어에 저절로 생긴 복합 몸 반응은 시도로 읽지 않는다', async () => {
  const gm = new LocalGm(null, lore);
  const engine = new Engine(scenario, gm);
  const beat = scenario.beats.b05_why;
  if (!beat?.free) throw new Error('b05 자유 입력 필요');
  for (const text of [
    '입 안이 바싹 마르고 숨이 막힌다',
    '기운이 빠지고 손끝이 저린다',
    '정신이 아득해지고 다리가 풀린다',
  ]) {
    const state = structuredClone(base);
    expect((await gm.interpret({ scenario, state, beat, free: beat.free, text })).kind).toBe('idle');
    const { step } = await engine.act(state, { type: 'free', text: `(${text})` });
    expect(step.events.some(e => e.type === 'roll')).toBe(false);
  }
  for (const text of [
    '숨이 막혀도 남자의 팔을 밀어낸다',
    '입이 마르고 나는 도망간다',
    '나는 남자가 보도록 일부러 다리를 떤다',
  ]) {
    expect((await gm.interpret({ scenario, state: structuredClone(base), beat, free: beat.free, text })).kind).not.toBe('idle');
  }
});

test('이전 장면에서 말했어도 b05 침묵 뒤 말 전제 대사는 없다', async () => {
  const gm = new LocalGm(null, lore);
  const engine = new Engine(scenario, gm);
  const state: GameState = { ...structuredClone(base), flags: { ...base.flags, 말함: true, 말함_b02_people: true } };
  const { state: after, step } = await engine.act(state, { type: 'free', text: '(아무 말도 하지 않는다)' });
  expect(after.beat).toBe('b06_swing');
  expect(step.events.some((e) => e.type === 'roll')).toBe(false);
  expect(linesOf(step.events)).toContain('남자: …뭐?');
  expect(linesOf(step.events)).not.toContain('남자: 없다면, 잘 가라.');
  expect(linesOf(step.events).some((line) => /그것뿐인가|그게…|마지막으로 남길 말인가/.test(line))).toBe(false);
});

class ReadingGm extends FakeGm {
  constructor(reading: (ctx: GmContext) => Interpretation) { super(reading); }
  override async talk(ctx: GmContext) {
    return { lines: [{ speaker: '남자', text: ctx.reaction ? '…뭐?' : '묻는 말에나 답해라.' }], meta: META };
  }
}

test('미인계로 건넨 말 뒤 c054~c055는 전부 남자가 말한다', async () => {
  const gm = new ReadingGm(() => ({ kind: 'approach', approach: 'beauty', item: null, spoken: true, source: 'llm', meta: META }));
  const engine = new Engine(scenario, gm);
  const { step } = await engine.act(structuredClone(base), { type: 'free', text: '저처럼 예쁜 여자까지 베실 거예요?' });
  const scene = step.events.findIndex((e) => e.type === 'scene' && e.beat === 'b06_swing');
  expect(linesOf(step.events.slice(scene)).filter((line) => line.startsWith('남자:'))).toEqual([
    '남자: 하.', '남자: 웃기는 여자군.', '남자: 그게…', '남자: 마지막으로 남길 말인가?',
  ]);
  expect(linesOf(step.events.slice(scene))).not.toContain('아시나: 그게…');
});

test('다른 말을 건넨 판은 미인계 대사 대신 일반 추궁이 이어진다', async () => {
  const gm = new ReadingGm(() => ({ kind: 'approach', approach: 'plead', item: null, spoken: true, source: 'llm', meta: META }));
  const engine = new Engine(scenario, gm);
  const { step } = await engine.act(structuredClone(base), { type: 'free', text: '전 그냥 지나가던 여행자예요, 제발요' });
  const scene = step.events.findIndex((e) => e.type === 'scene' && e.beat === 'b06_swing');
  expect(linesOf(step.events.slice(scene)).filter((line) => line.startsWith('남자:'))).toEqual([
    '남자: 하.', '남자: 그것뿐인가?', '남자: 그게… 마지막으로 남길 말인가?',
  ]);
});

for (const beat of ['b05_why', 'b06_swing']) {
  test(`${beat}: 감정 반응은 굴리지 않고 다음 장면으로 간다`, async () => {
    const gm = new ReadingGm(() => ({ kind: 'idle', source: 'llm', meta: META }));
    const engine = new Engine(scenario, gm);
    const state: GameState = { ...structuredClone(base), beat, free: { beat, talks: 0, rolls: 0 } };
    const { state: after, step } = await engine.act(state, { type: 'free', text: '(눈물이 쏟아져 몸이 굳는다)' });
    expect(after.beat).not.toBe(beat);
    expect(after.ending).toBeNull();
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(linesOf(step.events).filter((line) => line === '남자: …뭐?')).toHaveLength(1);
    expect(linesOf(step.events)).not.toContain('남자: 없다면, 잘 가라.');
  });

  test(`${beat}: 두 person 대화는 기록하고 명시 무시도 뒤 한 번만 위협이 진행된다`, async () => {
    const gm = new class extends ReadingGm {
      override async talk(ctx: GmContext) {
        if (ctx.reaction || ctx.state.free?.talks !== 2) return super.talk(ctx);
        const reply = scenario.beats.b06_swing?.free?.talk_fallback[1];
        if (!reply) throw new Error('서로 다른 두 응답을 위한 기존 대사가 없다');
        return { lines: [reply], meta: META };
      }
    }(ctx =>
      ctx.input?.kind === 'valid' && ctx.input.action && !ctx.input.speech && isNoAttempt(ctx.input.action)
        ? { kind: 'idle', source: 'llm', meta: META }
        : { kind: 'talk', to: 'person', source: 'llm', meta: META });
    const engine = new Engine(scenario, gm);
    const state: GameState = { ...structuredClone(base), beat, free: { beat, talks: 0, rolls: 0 } };
    const first = await engine.act(state, { type: 'free', text: '이게 지금 뭐 하는 짓이야?' });
    const second = await engine.act(first.state, { type: 'free', text: '내 질문이 안 들렸어?' });
    expect(first.state.beat).toBe(beat);
    expect(second.state.beat).toBe(beat);
    expect(first.step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(second.step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(first.state.said).toContain('이게 지금 뭐 하는 짓이야?');
    // 부정형 질문은 주장 기억에 넣지 않고 아래의 원문 대화 로그로 검증한다.
    expect(second.state.said).toEqual(first.state.said);
    expect(second.state.log.filter(e => e.kind === 'input').slice(-2)).toMatchObject([
      { result: 'talk', text: '이게 지금 뭐 하는 짓이야?' },
      { result: 'talk', text: '내 질문이 안 들렸어?' },
    ]);
    expect(linesOf(first.step.events).length).toBeGreaterThan(0);
    expect(linesOf(second.step.events).length).toBeGreaterThan(0);
    const third = await engine.act(second.state, { type: 'free', text: '(가만히 있는다)' });
    expect(third.state.beat).not.toBe(beat);
    expect(third.step.events.some(e => e.type === 'roll')).toBe(false);
    expect(third.state.log.findLast(e => e.kind === 'input')).toMatchObject({ result: 'idle', text: '(가만히 있는다)' });
    expect(third.state.said).toEqual(second.state.said);
    expect(linesOf([...first.step.events, ...second.step.events, ...third.step.events])
      .filter(line => line === '남자: …뭐?')).toHaveLength(1);
  });
}

test('시도하지 않음 경로에서 이미 본 고정 나레이션은 반복하지 않는다', async () => {
  const engine = new Engine(scenario, new ReadingGm(() => ({ kind: 'idle', source: 'llm', meta: META })));
  const text = scenario.beats.b05_why?.free?.idle?.lines.find((line) => line.speaker === '나레이션')?.text;
  if (!text) throw new Error('b05 위협 나레이션이 필요합니다');
  const state = { ...structuredClone(base), spoken: { ...base.spoken, 나레이션: [text] } };
  const { step } = await engine.act(state, { type: 'free', text: '(그대로 멎어 버린다)' });
  expect(linesOf(step.events)).not.toContain(`나레이션: ${text}`);
});
