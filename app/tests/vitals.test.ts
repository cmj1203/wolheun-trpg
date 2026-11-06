import { describe, expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import { roll2d6 } from '../src/engine/dice.ts';
import { checkScenario } from '../src/engine/scenario.ts';
import { assertState } from '../src/engine/save.ts';
import type { GameState, Track } from '../src/engine/types.ts';
import { FakeGm, loadDesert } from './helpers.ts';

const scenario = await loadDesert();
function at(beat: string, rng: number, tracks: Partial<Record<Track, number>> = {}, flags: GameState['flags'] = {}, luck = false) {
  const engine = new Engine({ ...scenario, start: beat }, new FakeGm(), () => 0, luck);
  const { state } = engine.newGame(2, `vitals-${beat}-${rng}`);
  state.rng = rng;
  Object.assign(state.tracks, tracks);
  Object.assign(state.flags, flags);
  return { engine, state };
}

describe('몸과 마음 상태', () => {
  test('칼끝 위협은 b04와 b05가 이어져도 정신력을 한 번만 깎는다', () => {
    const engine = new Engine({ ...scenario, start: 'b04_blade' }, new FakeGm());
    const { state, step } = engine.newGame(2, '같은-칼끝');
    expect(state.beat).toBe('b05_why');
    expect(state.tracks.정신력).toBe(3);
    expect(step.events.filter((e) => e.type === 'tracks').flatMap((e) => e.changes).filter((c) => c.key === '정신력')).toEqual([
      { key: '정신력', from: 4, to: 3 },
    ]);
    const direct = new Engine({ ...scenario, start: 'b05_why' }, new FakeGm()).newGame(2, '직접-칼끝');
    expect(direct.state.tracks.정신력).toBe(3);
  });

  test.each([
    ['dodge', 1],
    ['block', 2],
  ] as const)('위험 접근 %s의 6 이하 hard 부상은 %s칸이다', async (id, loss) => {
    const { engine, state } = at('b06_swing', 5);
    const result = await engine.act(state, { type: 'approach', id });
    const roll = result.step.events.find((e) => e.type === 'roll');
    expect(roll?.tier).toBe('miss');
    expect(result.step.events.find((e) => e.type === 'price')?.id).toBe('blade_graze');
    expect(result.state.tracks.체력).toBe(4 - loss);
    expect(result.state.flags['체력_쓰러짐']).toBeUndefined();
  });

  test('45차 이전 저장을 새 상태와 근력으로 읽고 이전 판정 기록도 보존한다', () => {
    const { state } = at('b02_people', 2);
    const roll = roll2d6(2, '이전 판정', '근력', 0, []).roll;
    const legacy = { ...state, abilities: { 재치: 1, 손재주: 1, 매력: 2, 체력: 0, 교양: 1 }, tracks: { 의심: 0, 집착: 0, 호감: 0, 귀찌: 7, 탈주: 0, 행운: 6 }, log: [{ kind: 'check', beat: 'b02_people', at: 0, roll: { ...roll, stat: '체력' } }] };
    const restored = assertState(scenario, legacy);
    expect([restored.abilities.근력, restored.tracks.체력, restored.tracks.정신력]).toEqual([0, 4, 4]);
    expect(restored.items).toEqual(state.items);
    expect(restored.log[0]).toMatchObject({ kind: 'check', roll: { stat: '근력', total: 11 } });
  });

  test.each(['missing', 'b02_people'])('기절 목적지 %s가 결말이 아니면 로더가 거부한다', (collapseTo) => {
    expect(checkScenario({ ...scenario, sheet: { ...scenario.sheet, collapseTo } })).toContain(`sheet.collapse_to: 기존 결말 비트여야 합니다 ("${collapseTo}")`);
  });
  test('시작 HUD는 상태 둘을 공개하고 남자의 마음은 숨긴다', () => {
    const { engine, state } = at('b00_open', 2);
    const hud = engine.hud(state);
    expect(hud.tracks.slice(0, 2).map((t) => [t.key, t.value, t.max])).toEqual([['체력', 4, 5], ['정신력', 4, 5]]);
    expect(hud.trackGate.flatMap((g) => g.tracks)).toEqual(['의심', '집착', '호감', '탈주', '귀찌']);
  });

  test('7~9의 땡볕 대가는 체력 한 칸과 변화 기록을 남긴다', async () => {
    const { engine, state } = at('b02_people', 7);
    const r = await engine.act(state, { type: 'approach', id: 'run' });
    expect(r.step.events.find((e) => e.type === 'price')).toMatchObject({ id: 'sun', tag: '시간' });
    expect(r.state.tracks.체력).toBe(3);
    expect(r.step.events.filter((e) => e.type === 'change').flatMap((e) => e.parts)).toContainEqual({ text: '체력 -1', tone: 'bad' });
  });

  test('실패의 결과와 대가가 같은 부상이면 한 번만 깎는다', async () => {
    const { engine, state } = at('b02_people', 1, { 체력: 1 });
    const r = await engine.act(state, { type: 'approach', id: 'run' });
    expect(r.state.tracks.체력).toBe(0);
    expect(r.state.ending).toBeNull();
    expect(r.state.flags['체력_쓰러짐']).toBeUndefined();
  });

  test('언덕 아래로 크게 구르는 실패는 체력 두 칸을 잃는다', async () => {
    const { engine, state } = at('b02_people', 5);
    const r = await engine.act(state, { type: 'approach', id: 'watch' });
    expect(r.state.tracks.체력).toBe(2);
  });

  test('물 마시는 성공은 체력, 큰 성공은 정신력을 회복한다', async () => {
    const { engine, state } = at('r3_dusk', 2, { 체력: 2, 정신력: 2 });
    const r = await engine.act(state, { type: 'approach', id: 'drink' });
    expect([r.state.tracks.체력, r.state.tracks.정신력]).toEqual([3, 3]);
    expect(r.step.events.filter((e) => e.type === 'change').flatMap((e) => e.parts)).toContainEqual({ text: '체력 +1', tone: 'good' });
  });

  test('밤에 눈을 붙이는 대가 있는 성공은 몸과 마음 한 칸씩 회복한다', async () => {
    const { engine, state } = at('r3_dusk', 4, { 체력: 2, 정신력: 2 });
    const r = await engine.act(state, { type: 'approach', id: 'shelter' });
    expect([r.state.tracks.체력, r.state.tracks.정신력]).toEqual([3, 3]);
  });

  test('회복은 최대 다섯 칸을 넘지 않고 가짜 변화도 남기지 않는다', async () => {
    const { engine, state } = at('r3_dusk', 2, { 체력: 5, 정신력: 5 });
    const r = await engine.act(state, { type: 'approach', id: 'drink' });
    expect([r.state.tracks.체력, r.state.tracks.정신력]).toEqual([5, 5]);
    expect(r.step.events.filter((e) => e.type === 'change').flatMap((e) => e.parts).filter((p) => /^(체력|정신력)/.test(p.text))).toEqual([]);
  });

  test.each([
    ['b02_people', 'run', { 체력: 1 }, '지친 몸'],
    ['b05_why', 'beauty', { 정신력: 1 }, '흔들리는 마음'],
    ['b05_why', 'bluff', { 정신력: 1 }, '흔들리는 마음'],
  ] as const)('%s/%s 낮은 상태 보정이 판정에 포함된다', async (beat, id, tracks, label) => {
    const { engine, state } = at(beat, 4, tracks);
    const r = await engine.act(state, { type: 'approach', id });
    const roll = r.step.events.find((e) => e.type === 'roll');
    expect(roll?.mods).toContainEqual({ label, value: -1 });
  });

  test('체력 둘 이상은 근력에 상태 감점을 주지 않는다', async () => {
    const { engine, state } = at('b02_people', 4, { 체력: 2 });
    const r = await engine.act(state, { type: 'approach', id: 'run' });
    expect(r.step.events.find((e) => e.type === 'roll')?.mods).not.toContainEqual({ label: '지친 몸', value: -1 });
  });

  test('정신력 한 칸에서 공포를 겪으면 0과 다음 판정 충격을 남긴다', async () => {
    const { engine, state } = at('b05_why', 5, { 정신력: 1 });
    const r = await engine.act(state, { type: 'approach', id: 'beauty' });
    // 행운을 쓰지 않고 실제 실패를 확정한다.
    const done = r.state.pendingLuck ? await engine.act(r.state, { type: 'luck', use: false }) : r;
    expect(done.state.tracks.정신력).toBe(0);
    expect(done.state.flags['정신력_충격']).toBe(true);
  });

  test('정신력 0의 충격은 다음 한 판정에 -2, 행운은 회복 전까지 금지한다', async () => {
    const { engine, state } = at('b02_people', 1, { 정신력: 0 }, { 정신력_충격: true }, true);
    const r = await engine.act(state, { type: 'approach', id: 'run' });
    expect(r.step.events.find((e) => e.type === 'roll')?.mods).toContainEqual({ label: '겁에 질림', value: -2 });
    expect(r.state.pendingLuck).toBeUndefined();
    expect(r.state.flags['정신력_충격']).toBeUndefined();
    r.state.rng = 1;
    const next = await engine.act(r.state, { type: 'approach', id: 'beauty' });
    const mods = next.step.events.find((e) => e.type === 'roll')?.mods;
    expect(mods).toContainEqual({ label: '흔들리는 마음', value: -1 });
    expect(mods).not.toContainEqual({ label: '겁에 질림', value: -2 });
    expect(next.state.pendingLuck).toBeUndefined();
  });

  test('정신력을 회복하면 다시 행운을 쓸 수 있다', async () => {
    const { engine, state } = at('b02_people', 1, { 정신력: 1 }, {}, true);
    const r = await engine.act(state, { type: 'approach', id: 'run' });
    expect(r.step.prompt.type).toBe('luck');
  });

  test('체력 0에서 또 다치면 새 결말 없이 기존 붙잡힘 결말과 가방 상실로 이어진다', async () => {
    const { engine, state } = at('b02_people', 1, { 체력: 0, 정신력: 0 });
    const r = await engine.act(state, { type: 'approach', id: 'run' });
    expect([r.state.beat, r.state.ending]).toEqual(['e_spy', 'spy']);
    expect(r.state.items).not.toContain('magic_bag');
    expect(r.step.events.filter((e) => e.type === 'line').map((e) => e.text)).toContain('거친 밧줄이 손목을 파고들었다. 마법 가방까지 빼앗기는 걸 보면서, 나는 정신을 잃었다.');
  });
});
