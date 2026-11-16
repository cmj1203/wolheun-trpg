import { expect, test } from 'bun:test';
import { Engine, type GmContext, type GmPort } from '../src/engine/engine.ts';
import { ViewpointPlayback, rotateViewFrames } from '../src/server/viewpoint.ts';
import type { GameEvent } from '../src/engine/types.ts';
import { FakeGm, loadDesert } from './helpers.ts';

const scenario = await loadDesert();
function setup(session = 'frame') {
  const playback = new ViewpointPlayback();
  const engine = new Engine(scenario, new FakeGm());
  return { playback, engine, ...engine.newGame(2, session, playback.observe) };
}
function token(event: GameEvent | undefined): string {
  if (!event || !('frame' in event) || !event.frame) throw new Error('표시 토큰 없음');
  return event.frame;
}

test('frame은 송신 순서대로 확인하고 미래·이전·타 세션 토큰을 거부한다', async () => {
  const a = setup();
  const b = setup('other');
  const frames = a.step.events.filter((event) => 'frame' in event);
  const first = token(frames[0]), second = token(frames[1]);
  expect(() => a.playback.confirm(second)).toThrow();
  expect(() => a.playback.confirm(token(b.step.events[0]))).toThrow();
  expect(() => a.playback.question(first)).toThrow();
  a.playback.confirm(first);
  a.playback.confirm(first);
  expect(a.playback.question(first).scene).toBe(frames[0]?.type === 'scene' ? frames[0].beat : '');
  a.playback.confirm(second);
  expect(() => a.playback.question(first)).toThrow();
  a.playback.begin();
  expect(a.playback.question(second).line?.text).toBe(frames[1]?.type === 'line' ? frames[1].text : undefined);
  await a.engine.act(a.state, { type: 'approach', id: 'run' }, undefined, { observer: a.playback.observe });
  expect(() => a.playback.confirm(second)).toThrow();
});

test('새 저장은 현재와 남은 frame 투영 모두 보존하고 세션 토큰을 회전한다', () => {
  const a = setup();
  const frames = a.step.events.filter((event) => 'frame' in event);
  const first = token(frames[0]), second = token(frames[1]);
  a.playback.confirm(first);
  const expected = a.playback.question(first);
  const saved = JSON.parse(JSON.stringify(a.playback.save()));
  const restored = new ViewpointPlayback();
  const mapping = restored.restore(saved, 'loaded');
  expect(saved.pending.length).toBe(frames.length - 1);
  expect(() => restored.question(first)).toThrow();
  const newFirst = mapping.get(first), newSecond = mapping.get(second);
  expect(restored.question(newFirst).state).toEqual({ ...expected.state, session: 'loaded' });
  restored.confirm(newSecond);
  expect(restored.question(newSecond).line?.text).toBe(frames[1]?.type === 'line' ? frames[1].text : undefined);
  const view = rotateViewFrames({ frame: first, remaining: frames.slice(1) }, mapping);
  expect(JSON.stringify(view)).not.toContain(first);
  expect(JSON.stringify(view)).not.toContain(second);
  expect(a.state.flags).toEqual(setup().state.flags);
});

test('관객 줄 질문은 그 표시 줄만 전달하고 권위 상태와 인물 기억을 바꾸지 않는다', async () => {
  const seen: GmContext[] = [];
  const fake = new FakeGm();
  const gm: GmPort = {
    ...fake,
    interpret: async (ctx) => { seen.push(ctx); return { kind: 'ask', about: 'none', source: 'rule', meta: { attempts: 0, violations: [], fallback: false, ms: 0, model: null } }; },
    explain: async (ctx) => { seen.push(ctx); return fake.explain(ctx); },
    talk: (ctx) => fake.talk(ctx), narrate: (ctx) => fake.narrate(ctx),
  };
  const beat = {
    id: 'audience', title: '궁정의 밀담', perspective: 'audience' as const, situation: '궁정 안',
    lines: [{ speaker: '나레이션', text: '그들은 낮은 소리로 계획을 나누었다.', sets: 'opened' }],
    choices: [{ id: 'stay', text: '계속', next: 'audience', lines: [] }],
  };
  const playback = new ViewpointPlayback();
  const engine = new Engine({ ...scenario, start: beat.id, beats: { ...scenario.beats, [beat.id]: beat } }, gm);
  const { state, step } = engine.newGame(2, 'question', playback.observe);
  for (const event of step.events) if ('frame' in event) playback.confirm(event.frame);
  const frame = token(step.events.findLast((event) => 'frame' in event));
  const original = structuredClone(state);
  state.flags.future = true;
  state.ending = 'already_ahead';
  state.tracks.의심 = 10;
  const held = structuredClone(state);
  const result = await engine.act(state, { type: 'ask', text: '지금 무슨 말이야?', frame }, undefined, { question: playback.question(frame), observer: playback.observe });
  expect(seen.length).toBeGreaterThan(0);
  for (const ctx of seen) {
    expect(ctx.beat.id).toBe('audience');
    expect(ctx.free.situation).toBe('궁정 안');
    expect(ctx.state.flags.future).toBeUndefined();
    expect(ctx.state.recent).toEqual([]);
    expect(ctx.displayed?.text).toBe(beat.lines[0]?.text);
  }
  expect(result.state.flags).toEqual({ ...original.flags, future: true });
  expect(result.state.ending).toBe(held.ending);
  expect(result.state.playMs).toBe(held.playMs);
  expect(result.state.tracks).toEqual(held.tracks);
  expect(result.state.rng).toBe(original.rng);
  expect(result.state.items).toEqual(original.items);
  expect(result.state.recent).toEqual([]);
  expect(playback.save().pending).toHaveLength(0);
});

test('같은 beat의 공개 직전·직후는 서로 다른 투영이고 뒤의 완료 기억을 앞당기지 않는다', () => {
  const beat = {
    id: 'reveal', title: '이름을 듣는 순간',
    lines: [{ speaker: '나레이션', text: '그가 입을 열었다.' }, { speaker: '나레이션', text: '이곳은 페샨이다.', sets: '페샨_들음' }],
    choices: [{ id: 'stay', text: '계속', next: 'reveal', lines: [] }],
  };
  const playback = new ViewpointPlayback();
  const engine = new Engine({ ...scenario, start: beat.id, beats: { ...scenario.beats, [beat.id]: beat } }, new FakeGm());
  const { step, state } = engine.newGame(2, 'reveal', playback.observe);
  const frames = step.events.filter((event) => 'frame' in event);
  for (const event of frames.slice(0, 2)) playback.confirm(token(event));
  const before = playback.question(token(frames[1]));
  expect(before.state.flags.페샨_들음).toBeUndefined();
  expect(before.state.recent.some((line) => line.text === beat.lines[1]?.text)).toBe(false);
  playback.confirm(token(frames[2]));
  const after = playback.question(token(frames[2]));
  expect(after.scene).toBe(before.scene);
  expect(after.state.flags.페샨_들음).toBe(true);
  expect(after.state.recent.some((line) => line.text === beat.lines[1]?.text)).toBe(true);
  expect(state.flags.페샨_들음).toBe(true);
});

test('구형 재생은 마지막 표시 경계 전에는 동적 질문 증거가 없다', () => {
  const { engine, state } = setup();
  const step = engine.resume(state);
  const playback = new ViewpointPlayback();
  playback.legacy(state, step.events);
  const witnessed = step.events.filter((event) => 'frame' in event);
  expect(witnessed).toHaveLength(1);
  const last = token(witnessed[0]);
  expect(() => playback.question(last)).toThrow();
  playback.confirm(last);
  expect(playback.question(last).state).toEqual(state);
});
