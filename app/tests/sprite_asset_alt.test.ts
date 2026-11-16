import { expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import { checkScenario } from '../src/engine/scenario.ts';
import type { Scenario } from '../src/engine/types.ts';
import { FakeGm, loadDesert } from './helpers.ts';

const base = await loadDesert();

function scenario(): Scenario {
  return {
    id: 'sprite_alt_test', title: '입식 대체', episode: '시험', source: '시험', rating: '전체',
    start: 'room',
    sheet: {
      name: base.sheet.name,
      abilities: { ...base.sheet.abilities },
      tracks: { ...base.sheet.tracks },
      items: [{ id: 'magic_bag', name: '가방', desc: '가방' }],
    },
    cast: {
      아시나: {
        display: '아시나', style: 'speech', sprite: 'asina_hood', faces: ['neutral', 'wary'],
        sprite_alt: { if: '!flag:hood_on', sprite: 'asina' },
      },
    },
    backgrounds: {}, cgs: {}, facts: [],
    sprites: {
      asina_hood: { label: '후드' },
      asina_hood_wary: { label: '후드 경계' },
      asina: { label: '가방', alt: { if: '!item:magic_bag', id: 'asina_nobag' } },
      asina_wary: { label: '가방 경계' },
      asina_nobag: { label: '빈손' },
      asina_nobag_wary: { label: '빈손 경계' },
    },
    beats: {
      room: {
        id: 'room', title: '방', cast: { center: '아시나' },
        lines: [{ speaker: '아시나', text: '주위를 살핀다.', face: 'wary' }],
        choices: [
          { id: 'lose', text: '놓는다', effects: { lose: ['magic_bag'] }, next: 'room' },
          { id: 'gain', text: '줍는다', effects: { gain: ['magic_bag'] }, next: 'room' },
          { id: 'hood', text: '후드를 쓴다', effects: { flags: { hood_on: true } }, next: 'room' },
          { id: 'unhood', text: '후드를 벗는다', effects: { flags: { hood_on: false } }, next: 'room' },
          { id: 'finish', text: '나간다', next: 'end' },
        ],
      },
      end: {
        id: 'end', title: '밖', lines: [],
        ending: { id: 'end', title: '밖', summary: '밖으로 나왔다.', next_hook: '' },
      },
    },
  };
}

test('시작 장면은 가방을 든 입식과 대사의 표정을 선택한다', () => {
  const engine = new Engine(scenario(), new FakeGm());
  const { step } = engine.newGame(1, 'start');
  expect(step.events.find(event => event.type === 'scene')).toMatchObject({ sprites: { 아시나: 'asina' } });
  expect(step.events.find(event => event.type === 'line')).toMatchObject({ speaker: '아시나', face: 'wary' });
});

test.each([
  { hood: false, action: 'lose', expected: 'asina_nobag', items: [] },
  { hood: false, action: 'gain', expected: 'asina', items: ['magic_bag'] },
  { hood: true, action: 'lose', expected: 'asina_hood', items: [] },
  { hood: true, action: 'gain', expected: 'asina_hood', items: ['magic_bag'] },
])('후드 $hood 상태에서 $action 효과가 입식과 소지품을 함께 갱신한다', async ({ hood, action, expected, items }) => {
  const engine = new Engine(scenario(), new FakeGm());
  let { state } = engine.newGame(1, 'inventory');
  if (hood) ({ state } = await engine.act(state, { type: 'choose', id: 'hood' }));
  if (action === 'gain') ({ state } = await engine.act(state, { type: 'choose', id: 'lose' }));

  const result = await engine.act(state, { type: 'choose', id: action });

  expect(result.state.items).toEqual([...items]);
  expect(result.step.events.filter(event => event.type === 'sprite')).toEqual(
    hood ? [] : [{ type: 'sprite', cast: '아시나', sprite: expected }],
  );
  expect(result.step.events.find(event => event.type === 'scene')).toMatchObject({
    sprites: hood ? {} : { 아시나: expected },
  });
  expect(result.step.events.find(event => event.type === 'line')).toMatchObject({ face: 'wary' });
  if (!hood) {
    expect(result.step.events.findIndex(event => event.type === 'sprite')).toBeLessThan(
      result.step.events.findIndex(event => event.type === 'scene'),
    );
  }
});

test('가방이 없는 상태에서 후드를 벗으면 빈손 얼굴 계열로 전환한다', async () => {
  const engine = new Engine(scenario(), new FakeGm());
  let { state } = engine.newGame(1, 'hood');
  ({ state } = await engine.act(state, { type: 'choose', id: 'hood' }));
  ({ state } = await engine.act(state, { type: 'choose', id: 'lose' }));

  const result = await engine.act(state, { type: 'choose', id: 'unhood' });

  expect(result.step.events.filter(event => event.type === 'sprite')).toEqual([
    { type: 'sprite', cast: '아시나', sprite: 'asina_nobag' },
  ]);
  expect(engine.resume(result.state).events[0]).toMatchObject({ sprites: { 아시나: 'asina_nobag' } });
});

test('배우 대체 선언이 없어도 기본 입식은 가방 분실과 회복을 반영한다', async () => {
  const input = scenario();
  input.cast.아시나 = { display: '아시나', style: 'speech', sprite: 'asina', faces: ['neutral', 'wary'] };
  const engine = new Engine(input, new FakeGm());
  const start = engine.newGame(1, 'base');
  const lost = await engine.act(start.state, { type: 'choose', id: 'lose' });

  const regained = await engine.act(lost.state, { type: 'choose', id: 'gain' });

  expect(lost.step.events.filter(event => event.type === 'sprite')).toEqual([
    { type: 'sprite', cast: '아시나', sprite: 'asina_nobag' },
  ]);
  expect(regained.step.events.filter(event => event.type === 'sprite')).toEqual([
    { type: 'sprite', cast: '아시나', sprite: 'asina' },
  ]);
});

test.each([
  { condition: '!item:magic_bag', id: 'missing', error: 'sprites.asina.alt.id: 없는 입식 "missing"' },
  { condition: '!item:missing', id: 'asina_nobag', error: 'sprites.asina.alt.if: 없는 소지품 "missing"' },
  { condition: 'unknown > 0', id: 'asina_nobag', error: 'sprites.asina.alt.if: 수치나 능력치가 아닌 이름 "unknown" (flag 는 flag:이름 으로 씁니다)' },
])('대체 입식 선언 $condition / $id의 잘못된 참조를 거부한다', ({ condition, id, error }) => {
  const input = scenario();
  input.sprites.asina = { label: '가방', alt: { if: condition, id } };

  const problems = checkScenario(input);

  expect(problems).toEqual([error]);
});

test('유효한 대체 입식 선언을 허용한다', () => {
  expect(checkScenario(scenario())).toEqual([]);
});

test('대체 입식 조건의 문법 오류를 선언 위치와 함께 거부한다', () => {
  const input = scenario();
  input.sprites.asina = { label: '가방', alt: { if: '(', id: 'asina_nobag' } };

  const problems = checkScenario(input);

  expect(problems).toEqual([expect.stringMatching(/^sprites\.asina\.alt\.if:/)]);
});

test.each([
  { held: true, cg: 'bag_cg' },
  { held: false, cg: 'bagless_cg' },
])('재개 CG는 가방 소지 $held 상태를 반영하고 대사 효과를 다시 적용하지 않는다', async ({ held, cg }) => {
  const input = scenario();
  input.cgs = {
    bag_cg: { label: '가방', file: '/bag.webp', alt: { if: '!item:magic_bag', id: 'bagless_cg' } },
    bagless_cg: { label: '빈손', file: '/bagless.webp' },
  };
  const room = input.beats.room;
  if (!room) throw new Error('시험 장면이 필요합니다');
  room.lines = [{
    speaker: '아시나', text: '주위를 살핀다.', face: 'wary', cg: 'bag_cg', sets: 'cg_seen',
    effects: { tracks: { 체력: -1 }, flags: { cg_effect: true } },
  }];
  const gm = new FakeGm();
  const engine = new Engine(input, gm);
  let { state, step } = engine.newGame(1, 'resume-cg');
  if (!held) ({ state, step } = await engine.act(state, { type: 'choose', id: 'lose' }));
  expect(step.events.find(event => event.type === 'line')).toMatchObject({ cg });
  const before = structuredClone(state);
  const calls = [...gm.calls];
  const observed: string[] = [];

  const resumed = engine.resume(state, observation => observed.push(observation.event.type));

  expect(resumed.events.find(event => event.type === 'line')).toMatchObject({ cg });
  expect(resumed.events.map(event => event.type)).toEqual(['scene', 'line']);
  expect(state).toEqual(before);
  expect(gm.calls).toEqual(calls);
  expect(observed).toEqual(['scene']);
});
