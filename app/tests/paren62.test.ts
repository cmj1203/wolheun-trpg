import { describe, expect, test } from 'bun:test';
import { Engine, type GmContext, type Interpretation } from '../src/engine/engine.ts';
import { assertedSpeech } from '../src/engine/text.ts';
import { FakeGm, META, loadDesert } from './helpers.ts';

const desert = await loadDesert();
const scenario = { ...desert, start: 'b05_why' };
const odd: Interpretation = { kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥 행동', absurd: false, bold: false, odd: true, deed: '모래를 한 줌 입에 넣었다', source: 'llm', meta: META };

class CaptureGm extends FakeGm {
  readonly replies: GmContext[] = [];
  override async talk(ctx: GmContext) {
    this.replies.push(ctx);
    return super.talk(ctx);
  }
}

describe('62차: 말과 행동의 괄호 경계', () => {
  test('ASCII와 전각 괄호만 있는 행동은 대사나 보상이 되지 않는다', async () => {
    for (const text of ['(모래를 먹는다)', '（모래를 먹는다）']) {
      const gm = new CaptureGm(() => odd);
      const engine = new Engine(scenario, gm);
      const { state } = engine.newGame(62, 'paren62-action');
      const result = await engine.act(state, { type: 'free', text });
      expect(result.step.events.find((e) => e.type === 'heard')).toMatchObject({ as: 'action' });
      expect(result.step.events.some((e) => e.type === 'roll')).toBe(false);
      expect(result.state.tracks).toEqual(state.tracks);
      expect(result.state.free?.spoken).toBe(false);
      expect(assertedSpeech(text)).toBe('');
      expect(gm.replies[0]?.odd).toBe(true);
      expect(gm.replies[0]?.input).toEqual({ kind: 'valid', action: '모래를 먹는다', speech: '', explicit: true });
      expect(gm.replies[0]?.acted).toBe(true);
      expect(gm.replies[0]?.spoken).toBe(false);
    }
  });

  test('괄호 없는 불확실한 입력은 분류기가 혼잣말로 읽어도 소리 낸 말이다', async () => {
    const gm = new CaptureGm(() => ({ kind: 'talk', to: 'self', source: 'llm', meta: META }));
    const engine = new Engine(scenario, gm);
    const { state } = engine.newGame(62, 'paren62-speech');
    const result = await engine.act(state, { type: 'free', text: '참 묘한 기분이네' });
    expect(result.step.events.find((e) => e.type === 'heard')).toMatchObject({ as: 'speech' });
    expect(result.state.heard?.at(-1)).toEqual({ text: '참 묘한 기분이네', action: false });
    expect(gm.replies[0]?.self).toBeUndefined();
    expect(gm.replies[0]?.spoken).toBe(true);
    expect(gm.replies[0]?.acted).toBe(false);
    expect(result.state.flags['말함']).toBe(true);
  });

  test('섞어 쓴 입력은 두 행동과 바깥 말 모두 보존하고 행동을 발화로 기록하지 않는다', async () => {
    const gm = new CaptureGm();
    const engine = new Engine(scenario, gm);
    const { state } = engine.newGame(62, 'paren62-mixed');
    const result = await engine.act(state, { type: 'free', text: '(칼을 밀어내며) 그만해! （한 걸음 물러선다）' });
    expect(result.step.events.find((e) => e.type === 'heard')).toMatchObject({ as: 'mixed' });
    expect(result.state.heard?.slice(-2)).toEqual([
      { text: '칼을 밀어내며 한 걸음 물러선다', action: true },
      { text: '그만해!', action: false },
    ]);
    expect(gm.replies[0]?.input).toEqual({ kind: 'valid', action: '칼을 밀어내며 한 걸음 물러선다', speech: '그만해!', explicit: true });
    expect(gm.replies[0]?.spoken).toBe(true);
    expect(gm.replies[0]?.acted).toBe(true);
    expect(assertedSpeech('(칼을 밀어내며) 그만해!')).toBe('그만해!');
  });

  test('빈 괄호는 여우 안내 한 줄만 내고 상태와 턴을 보존한다', async () => {
    for (const text of ['()', '（ ）', '그만해! ( )']) {
      const gm = new FakeGm(() => odd);
      const engine = new Engine(scenario, gm);
      const { state } = engine.newGame(62, 'paren62-empty');
      const result = await engine.act(state, { type: 'free', text });
      expect(result.state).toEqual(state);
      expect(result.step.events.filter((e) => e.type === 'line')).toHaveLength(1);
      expect(result.step.events).toContainEqual({ type: 'notice', kind: 'rewrite' });
      expect(gm.calls).toEqual([]);
    }
  });

  test('짝이 맞지 않거나 중첩된 괄호는 끼어들기에서도 턴을 쓰지 않는다', async () => {
    for (const text of ['(칼을 밀어낸다', '칼을 밀어낸다)', '（칼을 밀어낸다)', '((칼을 밀어낸다))']) {
      const gm = new FakeGm(() => odd);
      const engine = new Engine(scenario, gm);
      const { state } = engine.newGame(62, 'paren62-unmatched');
      const result = await engine.act(state, { type: 'interject', text, scene: state.beat, shown: [], pending: [] });
      expect(result.state).toEqual(state);
      expect(result.step.events.filter((e) => e.type === 'line')).toHaveLength(1);
      expect(result.step.events).toContainEqual({ type: 'notice', kind: 'rewrite' });
      expect(gm.calls).toEqual([]);
    }
  });

  test('확신한 무괄호 서술형 행동은 자유 입력과 끼어들기 모두 안내만 낸다', async () => {
    for (const type of ['free', 'interject'] as const) {
      const gm = new CaptureGm(() => odd);
      const engine = new Engine(scenario, gm);
      const { state } = engine.newGame(62, 'paren62-rewrite');
      const text = '모래를 먹는다';
      const result = await engine.act(state, type === 'free'
        ? { type, text }
        : { type, text, scene: state.beat, shown: [], pending: [] });
      expect(result.state).toEqual(state);
      expect(result.step.events.filter((e) => e.type === 'line')).toHaveLength(1);
      expect(result.step.events.some((e) => e.type === 'roll' || e.type === 'tracks')).toBe(false);
      expect(result.step.events).toContainEqual({ type: 'notice', kind: 'rewrite' });
      expect(gm.replies).toHaveLength(0);
    }
  });
});
