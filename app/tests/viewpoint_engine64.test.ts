import { expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import type { BeatSpec, Line, Scenario, ViewpointObservation } from '../src/engine/types.ts';
import { FakeGm, loadDesert } from './helpers.ts';

const desert = await loadDesert();
const cg = Object.values(desert.cgs).find((entry) => entry.file);
const first: Line = { speaker: '나레이션', text: '나는 첫 번째 표시를 보았다.', sets: 'first_seen', cg: 'before' };
const second: Line = { speaker: '나레이션', text: '두 번째 표시가 모습을 드러냈다.', sets: 'second_seen', if: 'flag:first_seen', cg: 'before' };

function fixture(lead: Line[], patch: Partial<BeatSpec> = {}): Scenario {
  if (!cg) throw new Error('CG 기준 없음');
  return {
    ...desert, start: 'view_start', fates: [], notes: [],
    cgs: { ...desert.cgs, before: { ...cg, alt: { if: 'flag:후드_벗음', id: 'after' } }, after: { ...cg, alt: undefined } },
    beats: {
      ...desert.beats,
      view_start: {
        id: 'view_start', title: '표시 경계', lead, lines: [],
        effects: { flags: { 후드_벗음: true }, lose: ['earring'] },
        choices: [{ id: 'stay', text: '계속', next: 'view_start', lines: [] }],
        ...patch,
      },
    },
  };
}

test.each([0, 1, 2])('실제 lead %i개: 앞줄은 뒤 기억을 모르고 마지막 줄만 진입 효과를 포함한다', (count) => {
  const observations: ViewpointObservation[] = [];
  const engine = new Engine(fixture([first, second].slice(0, count)), new FakeGm());
  const { step, state } = engine.newGame(1, 'opening', (observation) => observations.push(observation));
  const scene = observations[0];
  if (!scene || scene.event.type !== 'scene') throw new Error('첫 scene 관측 없음');
  expect(scene.state.flags.후드_벗음 === true).toBe(count === 0);
  expect(scene.state.flags.first_seen).toBeUndefined();
  const lines = observations.filter((item) => item.event.type === 'line');
  expect(lines).toHaveLength(count);
  if (count === 2) {
    expect(lines[0]?.state.flags.first_seen).toBe(true);
    expect(lines[0]?.state.flags.second_seen).toBeUndefined();
    expect(lines[0]?.state.flags.후드_벗음).toBeUndefined();
    expect(lines[0]?.state.recent.some((line) => line.text === second.text)).toBe(false);
  }
  const final = lines.at(-1) ?? scene;
  expect(final.state.flags.후드_벗음).toBe(true);
  expect(final.state.items).not.toContain('earring');
  expect(lines.every((item) => item.event.type === 'line' && item.event.cg === 'before')).toBe(true);
  expect(step.events[0]?.type).toBe('scene');
  expect(step.events.filter((event) => event.type === 'line')).toHaveLength(count);
  expect(state.flags.후드_벗음).toBe(true);
  expect(step.events.every((event) => !('state' in event) && !('readLog' in event))).toBe(true);
});

test('if로 lead가 전부 제외되면 무대사 선택지 scene은 진입 효과 확정 뒤를 관측한다', () => {
  const observations: ViewpointObservation[] = [];
  new Engine(fixture([{ ...first, if: 'flag:never' }]), new FakeGm()).newGame(1, 'filtered', (item) => observations.push(item));
  expect(observations).toHaveLength(1);
  expect(observations[0]?.state.flags.후드_벗음).toBe(true);
  expect(observations[0]?.state.recent).toEqual([]);
});

test('본문의 공개 sets는 같은 line 관측에 포함되고 뒤 line 정보는 포함하지 않는다', () => {
  const observations: ViewpointObservation[] = [];
  new Engine(fixture([], { effects: undefined, lines: [first, second] }), new FakeGm()).newGame(1, 'body', (item) => observations.push(item));
  const lines = observations.filter((item) => item.event.type === 'line');
  expect(lines[0]?.state.flags.first_seen).toBe(true);
  expect(lines[0]?.state.flags.second_seen).toBeUndefined();
  expect(lines[1]?.state.flags.second_seen).toBe(true);
  expect(lines[0]?.readLog().length).toBe(lines[0]?.logLength);
});

test('확정되지 못한 opening은 observer에게 일부를 먼저 내보내지 않는다', () => {
  const base = fixture([first, { speaker: '남자', text: '유효 CG 없는 줄' }]);
  const man = base.cast.남자;
  if (!man) throw new Error('배우 기준 없음');
  base.cast = { ...base.cast, 남자: { ...man, presentation: 'cg', sprite: undefined } };
  const observations: ViewpointObservation[] = [];
  expect(() => new Engine(base, new FakeGm()).newGame(1, 'failed', (item) => observations.push(item))).toThrow();
  expect(observations).toEqual([]);
});

test.each([undefined, 'audience'] as const)('관객 명시=%s만 기억에서 제외하고 화면 밖 주인공 POV와 정사 이벤트는 보존한다', (perspective) => {
  const scenario = fixture([], { effects: undefined, perspective, cast: { left: null, center: null, right: null }, lines: [first] });
  const { state, step } = new Engine(scenario, new FakeGm()).newGame(1, 'perspective');
  expect(step.events.some((event) => event.type === 'line' && event.text === first.text)).toBe(true);
  expect(state.log.some((entry) => entry.kind === 'beat' && entry.beat === 'view_start')).toBe(true);
  expect(state.recent.some((line) => line.text === first.text)).toBe(perspective !== 'audience');
  expect(state.spoken?.나레이션?.includes(first.text) ?? false).toBe(perspective !== 'audience');
});

test('GM 메타는 기억과 새 이야기 frame을 만들지 않는다', () => {
  const gm = Object.entries(desert.cast).find(([, cast]) => cast.style === 'gm')?.[0] ?? 'GM';
  const observations: ViewpointObservation[] = [];
  const { state, step } = new Engine(fixture([], { effects: undefined, lines: [{ speaker: gm, text: '화면 조작 안내야.' }] }), new FakeGm())
    .newGame(1, 'meta', (item) => observations.push(item));
  expect(step.events.some((event) => event.type === 'line')).toBe(true);
  expect(state.recent).toEqual([]);
  expect(state.spoken?.[gm]).toBeUndefined();
  expect(observations.every((item) => item.event.type === 'scene')).toBe(true);
});

test('관측 상태와 고정 로그 prefix는 나중 권위 상태의 변경과 가변 배열을 공유하지 않는다', () => {
  const observations: ViewpointObservation[] = [];
  const engine = new Engine(fixture([], { effects: undefined, lines: [first] }), new FakeGm());
  const { state } = engine.newGame(1, 'copies', (item) => observations.push(item));
  const point = observations.at(-1);
  if (!point) throw new Error('관측 없음');
  const original = structuredClone(point.state);
  const prefix = point.readLog();
  state.flags.later = true;
  state.items.length = 0;
  expect(point.state).toEqual(original);
  const head = prefix[0];
  if (head?.kind === 'start') head.seed = 99;
  expect(point.readLog()[0]).toEqual(state.log[0]);
});

test('resume hook는 현재 저장 경계만 표시하고 과거 줄의 상태를 새로 증명하지 않는다', () => {
  const engine = new Engine(fixture([], { effects: undefined, lines: [first] }), new FakeGm());
  const { state } = engine.newGame(1, 'resume');
  const before = structuredClone(state);
  const observations: ViewpointObservation[] = [];
  engine.resume(state, (item) => observations.push(item));
  expect(observations).toHaveLength(1);
  expect(observations[0]?.source).toBe('resume');
  expect(state).toEqual(before);
});

test('기존 b07 후드 lead의 if/CG와 진입 효과 순서를 실제 대본으로 유지한다', () => {
  const observations: ViewpointObservation[] = [];
  const rule = desert.beats.b07_rule;
  const lead = rule?.lead?.[0];
  if (!lead) throw new Error('후드 원작 lead 없음');
  const { step } = new Engine({ ...desert, start: 'b07_rule' }, new FakeGm()).newGame(2, 'hood', (item) => observations.push(item));
  expect(step.events.some((event) => event.type === 'line' && event.text === lead.text)).toBe(true);
  const firstLine = observations.find((item) => item.event.type === 'line');
  expect(firstLine?.state.flags.후드_벗음).toBe(true);
});
