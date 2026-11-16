import { expect, test } from 'bun:test';
import { Engine, type GmContext, type GmLines, type Interpretation } from '../src/engine/engine.ts';
import { facesPerson } from '../src/engine/scenario.ts';
import type { GameState } from '../src/engine/types.ts';
import { FakeGm, META, loadDesert } from './helpers.ts';

const scenario = await loadDesert();
const setup = new Engine(scenario, new FakeGm());
const base = (await setup.act(setup.newGame(1, 'faces59d').state, { type: 'approach', id: 'run' })).state;

class RecordingGm extends FakeGm {
  readonly replies: GmContext[] = [];
  constructor(reading: (ctx: GmContext) => Interpretation) {
    super(reading);
  }
  override async talk(ctx: GmContext): Promise<GmLines> {
    this.replies.push(ctx);
    return { lines: [{ speaker: '남자', text: ctx.text === '근처에 물을 얻을 곳이 있나요?' ? '물은 없다.' : '무슨 수작이냐.' }], meta: META };
  }
}

test('b06: 연속 발화는 건넨 말로 응답하고 판정이나 세계 무브를 소비하지 않는다', async () => {
  const gm = new RecordingGm(() => ({ kind: 'talk', to: 'person', source: 'llm', meta: META }));
  const engine = new Engine(scenario, gm);
  const state: GameState = { ...structuredClone(base), beat: 'b06_swing', free: { beat: 'b06_swing', talks: 0, rolls: 0 } };
  const first = await engine.act(state, { type: 'free', text: '다치게 할 생각은 없어요.' });
  const second = await engine.act(first.state, { type: 'free', text: '근처에 물을 얻을 곳이 있나요?' });
  expect(gm.replies.map((c) => [c.text, c.spoken, c.acted, c.self])).toEqual([
    ['다치게 할 생각은 없어요.', true, false, undefined],
    ['근처에 물을 얻을 곳이 있나요?', true, false, undefined],
  ]);
  expect(second.step.events.some((e) => e.type === 'line' && e.speaker === '남자')).toBe(true);
  expect(second.state.beat).toBe(state.beat);
  expect(second.state.rng).toBe(state.rng);
  expect(second.state.tracks).toEqual(state.tracks);
  expect(second.state.free?.rolls).toBe(0);
  expect(second.state.free?.moves).toBeUndefined();
  expect(second.state.free?.prices).toBeUndefined();
  expect(second.step.events.some((e) => e.type === 'roll' || e.type === 'change')).toBe(false);
});

test('b06: 감정 반응은 건넨 말로 표시하지 않는다', async () => {
  const gm = new RecordingGm(() => ({ kind: 'idle', source: 'llm', meta: META }));
  const engine = new Engine(scenario, gm);
  const state: GameState = { ...structuredClone(base), beat: 'b06_swing', free: { beat: 'b06_swing', talks: 0, rolls: 0 } };
  await engine.act(state, { type: 'free', text: '(눈물이 쏟아져 몸이 굳는다)' });
  expect(gm.replies.map((c) => c.spoken)).toEqual([undefined]);
});

test('판정 이벤트는 등급과 상대 유무에 맞는 아시나 표정을 싣는다', async () => {
  const seen = new Map<string, string | undefined>();
  let start: GameState | undefined;
  for (let seed = 1; seed < 200 && seen.size < 3; seed++) {
    const engine = new Engine(scenario, new FakeGm());
    const game = engine.newGame(seed, 's');
    start ??= game.state;
    const { step } = await engine.act(game.state, { type: 'approach', id: 'run' });
    const roll = step.events.find((e) => e.type === 'roll');
    if (roll?.type !== 'roll') continue;
    const tier = roll.tier === 'crit' ? 'hit' : roll.tier;
    if (!seen.has(tier)) seen.set(tier, roll.hero ? `${roll.hero.speaker}:${roll.hero.face}` : undefined);
  }
  const beat = start ? scenario.beats[start.beat] : undefined;
  if (!beat) throw new Error('시작 비트가 필요합니다');
  const missFace = facesPerson(scenario, beat) ? 'scared' : 'flustered';
  expect(Object.fromEntries(seen)).toEqual({ hit: '아시나:smug', mixed: '아시나:wary', miss: `아시나:${missFace}` });
});
