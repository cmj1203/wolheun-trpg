import { describe, expect, test } from 'bun:test';
import { roll2d6 } from '../src/engine/dice.ts';
import { Engine } from '../src/engine/engine.ts';
import { parseScenario, ScenarioError } from '../src/engine/scenario.ts';
import { FakeGm, META } from './helpers.ts';

function declaration(goal: Record<string, unknown> = {}) {
  const outcomes = () => ({
    hit: { lines: [{ 나레이션: '문이 열렸다.' }], gist: '문이 열렸다.' },
    mixed: { lines: [{ 나레이션: '문이 열리고 숨이 가빠졌다.' }], gist: '문이 열리고 숨이 가빠졌다.' },
    miss: { lines: [{ 나레이션: '걸림쇠가 움직이지 않았다.' }], gist: '걸림쇠가 움직이지 않았다.' },
  });
  return {
    id: 'continuation_goal_test',
    title: '잠금장치',
    episode: '시험',
    source: '시험 fixture',
    rating: '15세 이용가',
    start: 'lock',
    sheet: {
      name: '아시나',
      abilities: { 재치: 1, 손재주: 1, 매력: 2, 근력: 0, 교양: 1 },
      tracks: { 체력: 4, 정신력: 4, 의심: 0, 집착: 0, 호감: 0, 귀찌: 7, 탈주: 0, 행운: 6 },
      items: [],
    },
    cast: { 나레이션: { display: '', style: 'narration' }, GM: { display: 'GM', style: 'gm' } },
    backgrounds: {},
    sprites: {},
    cgs: {},
    beats: {
      lock: {
        title: '걸림쇠',
        lines: [],
        next: 'failed',
        free: {
          prompt: '핀을 어떻게 움직일까?',
          situation: '가는 핀과 자물쇠가 있다.',
          goal: '자물쇠를 연다.',
          speakers: ['나레이션'],
          must_not: [],
          state_guard: [],
          echo_only: [],
          patience: 1,
          talk_fallback: [{ 나레이션: '금속이 뜨겁다.' }],
          press: [{ 나레이션: '해가 높아진다.' }],
          deflect: [{ 나레이션: '핀은 손에 있다.' }],
          improv: outcomes(),
          prices: [{ id: 'fatigue', tag: '수치', weight: 'soft', text: '숨이 가빠졌다.', effects: { 정신력: -1 }, if: '정신력 > 0' }],
          default_approach: 'steady',
          approaches: [{
            id: 'steady', goal: 'open', label: '핀을 천천히 돌린다.', stat: '손재주',
            hint: '핀 끝으로 걸림쇠를 더듬는다.', examples: [], keywords: [], outcomes: outcomes(),
          }],
          goals: { open: { text: '자물쇠를 열고 문밖으로 나간다.', effects: { flags: { 문_열림: true } }, next: 'outside', price: ['fatigue'], ...goal } },
        },
      },
      outside: { title: '문밖', lines: [], ending: { id: 'outside', title: '문밖', summary: '문밖으로 나왔다.', next_hook: '다음 길로 이어진다.' } },
      failed: { title: '닫힌 문', lines: [], ending: { id: 'failed', title: '닫힌 문', summary: '문은 닫혀 있다.', next_hook: '문 앞에 머문다.' } },
    },
  };
}

function inlineDeclaration() {
  const source = declaration({ price: [] });
  const free = source.beats.lock.free;
  const inline = { effects: { 정신력: -1 }, price: [] };
  return {
    ...source,
    beats: {
      ...source.beats,
      lock: {
        ...source.beats.lock,
        free: {
          ...free,
          improv: { ...free.improv, mixed: { ...free.improv.mixed, ...inline } },
          approaches: free.approaches.map((approach) => ({
            ...approach,
            outcomes: { ...approach.outcomes, mixed: { ...approach.outcomes.mixed, ...inline } },
          })),
        },
      },
    },
  };
}

function mixedSeed(): number {
  for (let seed = 1; seed <= 100; seed += 1) {
    if (roll2d6(seed, '핀', '손재주', 1, []).roll.tier === 'mixed') return seed;
  }
  throw new Error('혼합 성공 시드를 찾지 못했습니다');
}

describe('후속 성공 목표의 선언 경계', () => {
  test('자연어 목표와 별개인 성취·경로·비용을 파싱하고 목표 경로를 도달 가능하게 센다', () => {
    const parsed = parseScenario(JSON.stringify(declaration()));
    const free = parsed.beats.lock?.free;
    expect(free?.goal).toBe('자물쇠를 연다.');
    expect(free?.goals?.open?.next).toBe('outside');
    expect(free?.goals?.open?.effects?.flags).toEqual({ 문_열림: true });
    expect(free?.goals?.open?.price).toEqual(['fatigue']);
    expect(free?.approaches[0]?.goal).toBe('open');
  });

  test.each([
    { name: '없는 성공 도착지', goal: { next: 'missing' } },
    { name: '생략한 성공 도착지', goal: { next: undefined } },
    { name: '빈 조건부 경로', goal: { next: [] } },
    { name: '기본 경로 없는 조건부 분기', goal: { next: [{ if: '정신력 > 0', to: 'outside' }] } },
    { name: '틀린 목표 조건', goal: { if: '정신력 ??? 0' } },
    { name: '없는 비용', goal: { price: ['missing'] } },
    { name: '생략한 비용 목록', goal: { price: undefined } },
    { name: '중복 비용', goal: { price: ['fatigue', 'fatigue'] } },
    { name: '실제 비용 없는 빈 후보', goal: { price: [] } },
  ])('$name 선언을 거부한다', ({ goal }) => {
    expect(() => parseScenario(JSON.stringify(declaration(goal)))).toThrow(ScenarioError);
  });

  test.each(['local', 'none', ''])('예약값 또는 빈 ID %j를 작가 목표로 숨기지 못한다', (id) => {
    const source = declaration();
    const target = source.beats.lock.free.goals.open;
    const goals: Record<string, typeof target> = { [id]: target };
    expect(() => parseScenario(JSON.stringify({
      ...source,
      beats: { ...source.beats, lock: { ...source.beats.lock, free: { ...source.beats.lock.free, goals } } },
    }))).toThrow(ScenarioError);
  });

  test.each(['missing', 'toString', 'constructor'])('정의하지 않은 접근법 목표 %s 참조를 거부한다', (target) => {
    const source = declaration();
    source.beats.lock.free.approaches[0]!.goal = target;
    expect(() => parseScenario(JSON.stringify(source))).toThrow(ScenarioError);
  });

  test('혼합 성공 목표에 hard 비용을 연결하면 거부한다', () => {
    const source = declaration();
    source.beats.lock.free.prices[0]!.weight = 'hard';
    expect(() => parseScenario(JSON.stringify(source))).toThrow(ScenarioError);
  });

  test('목표와 같은 상태를 비용이 되돌리거나 덧쓰면 거부한다', () => {
    const source = declaration({ effects: { 정신력: 1 } });
    expect(() => parseScenario(JSON.stringify(source))).toThrow(ScenarioError);
  });

  test.each(['hit', 'mixed', 'crit'])('성취 효과를 %s 결과에 다시 넣으면 중복 적용 전에 거부한다', (tier) => {
    const source = declaration();
    const approach = source.beats.lock.free.approaches[0]!;
    expect(() => parseScenario(JSON.stringify({
      ...source,
      beats: {
        ...source.beats,
        lock: {
          ...source.beats.lock,
          free: {
            ...source.beats.lock.free,
            approaches: [{ ...approach, outcomes: { ...approach.outcomes, [tier]: { ...approach.outcomes.hit, effects: { flags: { 문_열림: true } } } } }],
          },
        },
      },
    }))).toThrow(ScenarioError);
  });

  test('빈 목록은 추첨을 끄며 모든 혼합 경로가 인라인 비용을 이미 내면 허용한다', () => {
    const parsed = parseScenario(JSON.stringify(inlineDeclaration()));
    expect(parsed.beats.lock?.free?.goals?.open?.price).toEqual([]);
  });

  test.each(['고정 접근', '즉흥 행동'])('%s에서 빈 목표 비용과 인라인 실비용을 실제로 한 번 적용한다', async (mode) => {
    const parsed = parseScenario(JSON.stringify(inlineDeclaration()));
    const gm = new FakeGm(() => ({
      kind: 'improv', stat: '손재주', difficulty: 0, label: '핀', absurd: false, bold: false,
      target: 'open', deed: '핀을 돌려 자물쇠를 열고 문밖으로 나왔다.', source: 'llm', meta: META,
    }));
    const engine = new Engine(parsed, gm, () => 1_000);
    const { state } = engine.newGame(mixedSeed(), 'inline-goal');
    const result = await engine.act(state, mode === '고정 접근'
      ? { type: 'approach', id: 'steady' }
      : { type: 'free', text: '(핀을 조금 돌려 자물쇠를 연다)' });
    expect(result.step.events.find((event) => event.type === 'roll')?.tier).toBe('mixed');
    expect(result.state.beat).toBe('outside');
    expect(result.state.flags.문_열림).toBe(true);
    expect(result.state.tracks.정신력).toBe(state.tracks.정신력 - 1);
    expect(result.step.events.filter((event) => event.type === 'price')).toHaveLength(0);
  });

  test('인라인 비용 자원이 바닥이면 판정 전에 멈추고 상태·난수를 소비하지 않는다', async () => {
    const parsed = parseScenario(JSON.stringify(inlineDeclaration()));
    const engine = new Engine(parsed, new FakeGm(), () => 1_000);
    const { state } = engine.newGame(mixedSeed(), 'inline-floor');
    state.tracks.정신력 = 0;
    const snapshot = structuredClone(state);
    const result = await engine.act(state, { type: 'approach', id: 'steady' });
    expect(result.state).toEqual(snapshot);
    expect(result.step.events.some((event) => event.type === 'roll')).toBe(false);
    expect(result.step.events.some((event) => event.type === 'notice' && event.kind === 'rewrite')).toBe(true);
  });
});
