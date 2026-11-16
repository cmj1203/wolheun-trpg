import { expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import type { Scenario } from '../src/engine/types.ts';
import { FakeGm, META, loadDesert } from './helpers.ts';

const desert = await loadDesert();

function fixture(turns: number): Scenario {
  const base = desert.beats.b05_why;
  const ending = desert.beats.e_survivor?.ending;
  if (!base?.free) throw new Error('자유 입력 기준 없음');
  if (!ending) throw new Error('종료 기준 없음');
  const scene = {
    ...base, id: 'idle_count', lines: [], twist: undefined,
    free: { ...base.free, turns, nudge: [], until: undefined, next: 'idle_done', idle: { threat: true, lines: [] } },
  };
  return { ...desert, start: scene.id, fates: [], beats: {
    ...desert.beats, [scene.id]: scene,
    idle_done: { id: 'idle_done', title: '자동 진행 뒤', lines: [], ending: { ...ending, id: 'idle_done', title: '끝' } },
  } };
}

test.each(['(가만히 기다린다)', '(눈물이 흐른다)'])('%s는 진행을 소비해도 실제 판정 횟수는 늘리지 않는다', async (text) => {
  const engine = new Engine(fixture(3), new FakeGm(() => ({ kind: 'idle', source: 'llm', meta: META })));
  const { state } = engine.newGame(2, 'idle-count');
  const out = await engine.act(state, { type: 'free', text });
  expect(out.state.beat).toBe('idle_count');
  expect(out.state.free?.rolls).toBe(0);
  expect(out.state.rng).toBe(state.rng);
  expect(out.step.events.some((event) => event.type === 'roll')).toBe(false);
  expect(out.state.log.some((entry) => entry.kind === 'check')).toBe(false);
});

test('감정 반응은 판정 없이 기존 턴 한도에서 자동 진행한다', async () => {
  const engine = new Engine(fixture(1), new FakeGm(() => ({ kind: 'idle', source: 'llm', meta: META })));
  const { state } = engine.newGame(2, 'idle-finish');
  const out = await engine.act(state, { type: 'free', text: '(눈물이 흐른다)' });
  expect(out.state.beat).toBe('idle_done');
  expect(out.state.rng).toBe(state.rng);
  expect(out.state.log.some((entry) => entry.kind === 'check')).toBe(false);
});

test('구형 저장의 idle 누적은 진행량만 계승하고 실제 check 없는 판정을 만들어 내지 않는다', async () => {
  const engine = new Engine(fixture(3), new FakeGm(() => ({ kind: 'idle', source: 'llm', meta: META })));
  const { state } = engine.newGame(2, 'legacy-idle');
  const first = await engine.act(state, { type: 'free', text: '(가만히 기다린다)' });
  const legacy = structuredClone(first.state);
  if (!legacy.free) throw new Error('진행 중인 장면 없음');
  delete legacy.free.turns;
  legacy.free.rolls = 1;
  const out = await engine.act(legacy, { type: 'free', text: '(눈물이 흐른다)' });
  expect(out.state.free?.turns).toBe(2);
  expect(out.state.free?.rolls).toBe(0);
  expect(out.state.rng).toBe(legacy.rng);
});
