import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { assertState } from '../src/engine/save.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent, Tier } from '../src/engine/types.ts';
import { FakeGm, META } from './helpers.ts';

const root = join(import.meta.dir, '../..');
const campaign = await loadCampaignScenario(join(root, 'app/content/ep01_desert.yaml'));
const chapter = await loadScenario(join(root, 'app/content/ep04_night.yaml'));
const raw = await Bun.file(join(import.meta.dir, 'fixtures/ep04_beauty_earned_state20_action21.jsonl')).text();
const records: readonly unknown[] = raw.split('\n').filter(Boolean).map((line): unknown => JSON.parse(line));

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function detailAt(kind: string, action: number): Record<string, unknown> {
  const found = records.find((value) => record(value) && value.kind === kind && value.action === action);
  if (!record(found) || !record(found.detail)) throw new Error(`획득 기록을 찾지 못했다: ${kind}/${action}`);
  return found.detail;
}

function delivered(events: readonly GameEvent[]) {
  return events.filter((event) => event.type === 'line');
}

function assertNoMemory(events: readonly GameEvent[]) {
  expect(delivered(events).filter((event) => event.cg === 'ep04_c058_source')).toEqual([]);
  expect(events.filter((event) => event.type === 'scene' && (
    event.beat === 'ep04_c058' || event.beat === 'ep04_distance_c058' || event.bg === 'ep04_c058_stage'
  ))).toEqual([]);
  expect(delivered(events).some((event) => event.text === '전에 내게 미소녀라고 주장했었나.')).toBe(false);
}

function assertSourceMemory(events: readonly GameEvent[]) {
  const lines = delivered(events);
  expect(lines.filter((event) => event.cg === 'ep04_c058_source').map((event) => event.text))
    .toEqual(['…아, 그때.', '하, 대체 어디가 미소녀냐면서 비웃었으면서!']);
  expect(lines.some((event) => event.text === '전에 내게 미소녀라고 주장했었나.')).toBe(true);
  const memory = lines.findIndex((event) => event.cg === 'ep04_c058_source');
  expect(lines.findIndex((event) => event.cg === 'ep04_c057_source')).toBeLessThan(memory);
  expect(lines.findIndex((event) => event.cg === 'ep04_c059_source')).toBeGreaterThan(memory);
}

test('실제 미인계 없는 행동20 저장의 retort는 거짓 회상·장면·CG 없이 효과와 종료를 보존한다', async () => {
  const earned = assertState(campaign, structuredClone(detailAt('state', 20).state));
  const action = detailAt('action', 21);
  if (action.type !== 'choose' || typeof action.id !== 'string') throw new Error('실제 행동21이 선택이 아니다');
  expect(earned.beat).toBe('ep04_i04_distance');
  expect(earned.flags.미인계).toBeUndefined();
  expect(earned.flags.미소녀).toBeUndefined();
  expect(earned.flags.후드_벗음).toBe(true);
  const gm = new FakeGm();
  const result = await new Engine(campaign, gm).act(earned, { type: 'choose', id: action.id });
  assertNoMemory(result.step.events);
  expect(result.state.beat).toBe('ep04_boundary');
  expect(result.state.flags.ep04_wet_known).toBe(true);
  expect(result.state.flags.ep04_eye_praise).toBe(true);
  for (const flag of ['ep04_name_known', 'ep04_ruler_known', 'ep04_title_known']) {
    expect(result.state.flags[flag]).toBe(earned.flags[flag]);
  }
  expect(result.state.tracks).toEqual(earned.tracks);
  const lines = delivered(result.step.events);
  expect(lines.findIndex((event) => event.cg === 'ep04_c057_source'))
    .toBeLessThan(lines.findIndex((event) => event.cg === 'ep04_c059_source'));
  expect(gm.calls).toEqual([]);
});

async function beautyPlay(mode: 'legacy' | 'action' | 'speech') {
  const gm = new FakeGm(() => mode === 'action'
    ? {
        kind: 'improv', target: 'beauty', deed: '후드를 벗고 웃으며 상대의 시선을 붙잡았다.',
        stat: '매력', difficulty: 0, label: '시선 붙잡기', absurd: false, bold: false,
        source: 'rule', meta: META,
      }
    : { kind: 'talk', source: 'rule', meta: META });
  const engine = new Engine(campaign, gm, () => 1_000_000, true);
  let result = engine.newGame(913, `ep04-beauty-${mode}`);
  const history: GameEvent[] = [...result.step.events];
  let beautyDone = false;
  for (let turn = 0; turn < 40 && result.state.beat !== 'ep04_i04_distance'; turn++) {
    const prompt = result.step.prompt;
    if (prompt.type === 'luck') {
      result = await engine.act(result.state, { type: 'luck', use: true });
    } else if (result.state.beat === 'b05_why' && !beautyDone) {
      if (mode === 'speech') {
        result = await engine.act(result.state, { type: 'free', text: '미소녀니까요.' });
        history.push(...result.step.events);
        result = await engine.act(result.state, { type: 'approach', id: 'plead' });
      } else {
        result = await engine.act(result.state, mode === 'legacy'
          ? { type: 'approach', id: 'beauty' }
          : { type: 'free', text: '(후드를 벗고 웃으며 상대의 시선을 붙잡는다)' });
      }
      beautyDone = true;
    } else if (prompt.type === 'free') {
      const approaches: Readonly<Record<string, string>> = {
        b02_people: 'run', b06_swing: 'dodge', b08_gaze: 'stare_back',
        ep02_unlock: 'steady', ep02_question: 'conceal', ep04_i02_accusation: 'ep04_heard',
      };
      const approach = approaches[result.state.beat];
      if (!approach) throw new Error(`예상하지 않은 응답 자리: ${result.state.beat}`);
      result = await engine.act(result.state, { type: 'approach', id: approach });
    } else if (prompt.type === 'choices') {
      const choice = prompt.options.find((option) => option.id === 'conceal') ?? prompt.options[0];
      if (!choice) throw new Error('다음 선택이 없다');
      result = await engine.act(result.state, { type: 'choose', id: choice.id });
    } else {
      throw new Error(`4화 전에 끝났다: ${result.state.beat}`);
    }
    history.push(...result.step.events);
  }
  expect(beautyDone).toBe(true);
  expect(result.state.beat).toBe('ep04_i04_distance');
  return { engine, result, history };
}

test.each(['legacy', 'action', 'speech'] as const)('실제 %s 미인계 발화·행동 경로는 원문 회상과 그림 순서를 보존한다', async (mode) => {
  const { engine, result: before, history } = await beautyPlay(mode);
  if (mode === 'action') {
    expect(before.state.flags.미인계).toBe(true);
    expect(before.state.flags.미소녀).toBeUndefined();
  } else if (mode === 'speech') {
    expect(before.state.flags.미인계).toBeUndefined();
    expect(before.state.flags.미소녀).toBe(true);
  } else {
    expect(before.state.flags.미인계).toBe(true);
    expect(delivered(history).some((event) => event.text === '미소녀니까요.')).toBe(true);
  }
  const result = await engine.act(before.state, { type: 'choose', id: 'retort' });
  assertSourceMemory(result.step.events);
  expect(result.state.flags.ep04_wet_known).toBe(true);
  expect(result.state.beat).toBe('ep04_boundary');
});

test('미인계 없는 거리 확보의 hit·mixed는 회상 없이 거리 성공과 젖음 인식을 유지한다', async () => {
  const found = new Set<Tier>();
  for (let seed = 1; seed <= 160 && (!found.has('hit') || !found.has('mixed')); seed++) {
    const engine = new Engine({ ...chapter, start: 'ep04_distance_free' }, new FakeGm());
    const initial = engine.newGame(seed, `ep04-distance-memory-${seed}`);
    const result = await engine.act(initial.state, { type: 'approach', id: 'ep04_keep_distance' });
    const check = result.state.log.find((entry) => entry.kind === 'check');
    if (check?.kind !== 'check' || (check.roll.tier !== 'hit' && check.roll.tier !== 'mixed')) continue;
    found.add(check.roll.tier);
    assertNoMemory(result.step.events);
    expect(result.state.flags.ep04_wet_known).toBe(true);
    expect(result.state.flags.ep04_distance_kept).toBe(true);
    expect(result.state.flags.ep04_eye_praise).toBe(true);
    expect(result.state.beat).toBe('ep04_distance_boundary');
    expect(delivered(result.step.events).some((event) => [
      'ep04_c057_source', 'ep04_c061_source', 'ep04_c062_source',
    ].includes(event.cg ?? ''))).toBe(false);
  }
  expect(found).toEqual(new Set(['hit', 'mixed']));
});
