import { describe, expect, test } from 'bun:test';
import { Engine, closedTrackGates, type GmContext } from '../src/engine/engine.ts';
import { INTRODUCTION } from '../web/introduction.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { loreFor } from '../src/gm/lore.ts';
import { FakeGm, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

describe('58차 원작 공개 시점', () => {
  test('1화의 시간·대가로 비공개 귀찌가 닳거나 본모습 설명이 나오지 않는다', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), () => 0, false);
    let { state, step } = engine.newGame(1, 'hidden58');
    const events = [...step.events];
    for (const id of ['run', 'beauty', 'dodge', 'retort']) {
      if (state.ending) break;
      ({ state, step } = await engine.act(state, { type: 'approach', id }));
      events.push(...step.events);
    }
    expect(state.tracks.귀찌).toBe(7);
    expect(closedTrackGates(scenario, state).some((g) => g.tracks.includes('귀찌'))).toBe(true);
    expect(events.filter((e) => e.type === 'line').map((e) => e.text).join(' ')).not.toMatch(/귀찌 수명|귀찌가 뜨겁|귀찌가 식|은발|변장 귀찌/);
    expect(events.filter((e) => e.type === 'change').flatMap((e) => e.parts).map((p) => p.text).join(' ')).not.toContain('귀찌');
  });

  test('3화 독백 플래그는 수첩의 변장만 열고 7일 수치는 아직 닫는다', () => {
    const engine = new Engine(scenario, new FakeGm());
    const { state } = engine.newGame(2, 'ep3');
    state.flags['귀찌_변장_설명'] = true;
    expect(engine.hud(state).notes.find((n) => n.id === 'disguise')?.text).toContain('은발에 붉은 눈');
    expect(engine.hud(state).notes.some((n) => n.id === 'earring_power')).toBe(false);
    expect(closedTrackGates(scenario, state).some((g) => g.tracks.includes('귀찌'))).toBe(true);
  });

  test('4화 일주일 독백에서 7칸·일 단위 수치와 수첩을 열고 새 수치 알림을 한 번만 낸다', () => {
    const opening = scenario.beats.b00_open;
    if (!opening) throw new Error('시작 장면이 필요합니다');
    const explained = { ...scenario, beats: { ...scenario.beats, b00_open: {
      ...opening, lines: [
        { speaker: '속마음', text: '귀찌가 버틸 수 있는 시간은 일주일.', sets: '귀찌_설명' },
        { speaker: '속마음', text: '일주일 안에 이곳을 탈출해야 한다!', sets: '귀찌_설명' },
      ],
    } } };
    const engine = new Engine(explained, new FakeGm());
    const { state, step } = engine.newGame(2, 'ep4');
    expect(closedTrackGates(explained, state).some((g) => g.tracks.includes('귀찌'))).toBe(false);
    expect(step.hud.tracks.find((t) => t.key === '귀찌')).toMatchObject({ max: 7, unit: '일' });
    expect(step.hud.notes.find((n) => n.id === 'earring_power')?.text).toContain('일주일');
    expect(step.events.filter((e) => e.type === 'change').flatMap((e) => e.parts).filter((p) => p.text === '새 수치: 귀찌 수명')).toHaveLength(1);
    expect(state.tracks.귀찌).toBe(6);
  });

  test('1화 수첩·소지품·안내에는 귀찌 비밀과 공녀 신분이 먼저 나오지 않는다', () => {
    const engine = new Engine(scenario, new FakeGm());
    const { state } = engine.newGame(2, 'notes58');
    const hud = engine.hud(state);
    expect(JSON.stringify([hud.notes, hud.items, INTRODUCTION])).not.toMatch(/귀찌 수명|변장|은발|웰든|대공가|공녀/);
    expect(hud.items.find((i) => i.id === 'earring')?.desc).toBe('귓불에 달린 마법 귀찌.');
    expect(hud.notes.find((n) => n.id === 'asina')?.text).toContain('부족함 없이');
    expect(INTRODUCTION).toHaveLength(6);
  });

  test('숨긴 귀찌 도움말과 설정 질문은 아직 모른다고 받고 공개 뒤에는 원작 설명을 준다', async () => {
    const engine = new Engine(scenario, new FakeGm(() => ({ kind: 'ask', game: 'earring', source: 'rule', meta: { attempts: 0, violations: [], fallback: false, ms: 0, model: null } })));
    const { state } = engine.newGame(2, 'help58');
    const hidden = await engine.act(state, { type: 'ask', text: '귀찌 수명이 뭐야?' });
    expect(hidden.step.events.filter((e) => e.type === 'line').map((e) => e.text)).toEqual(['그건 아직 몰라.']);
    state.flags['귀찌_설명'] = true;
    const open = await engine.act(state, { type: 'ask', text: '귀찌 수명이 뭐야?' });
    expect(open.step.events.filter((e) => e.type === 'line').map((e) => e.text).join(' ')).toContain('일주일');
    const beat = scenario.beats.b05_why;
    if (!beat?.free) throw new Error('b05 필요');
    const ctx: GmContext = { scenario, state: { ...state, flags: {} }, beat, free: beat.free, text: '귀찌가 뭐야?', about: 'earring_power' };
    expect((await new LocalGm(null, lore).explain(ctx)).lines).toEqual([{ speaker: 'GM', text: '그건 아직 몰라.' }]);
    expect(loreFor(lore, ctx.state).knowledge.some((n) => n.id === 'disguise' || n.id === 'earring_power')).toBe(false);
  });

  test('귀찌 0도 공개 전에는 은발 결말을 열지 않는다', async () => {
    const engine = new Engine(scenario, new FakeGm(), () => 0, false);
    const { state } = engine.newGame(2, 'fate58');
    state.tracks.귀찌 = 0;
    state.flags['경고_unmasked'] = true;
    const hidden = await engine.act(state, { type: 'free', text: '저기요' });
    expect(hidden.state.ending).toBeNull();
    state.flags['귀찌_설명'] = true;
    const opened = await engine.act(state, { type: 'free', text: '저기요' });
    expect(opened.state.ending).toBe('unmasked');
  });
});
