import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { Engine } from '../src/engine/engine.ts';
import { readSave, SaveError, writeSave } from '../src/engine/save.ts';
import { ScenarioError } from '../src/engine/scenario.ts';
import type { ViewpointObservation } from '../src/engine/types.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { APP, FakeGm, LORE_PATH, SCENARIO_PATH } from './helpers.ts';

const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), await loadLore(LORE_PATH));
const run = join(APP, '../work/continuation/ep02/run');
await mkdir(run, { recursive: true });
const saves = await mkdtemp(join(run, 'ep06-save-tests-'));
afterAll(() => rm(saves, { recursive: true, force: true }));
const flags = ['ep05_시선답변', 'ep05_지난밤답변', 'ep05_지난밤되물음'] as const;
const routes = [
  { choice: 'ep05_reply_original', destination: 'ep06_c003', short: false },
  { choice: 'ep05_reply_short', destination: 'ep06_c008', short: true },
] as const;

async function finishFifth(choice: string) {
  const engine = new Engine({ ...campaign, start: 'ep05_c053' }, new FakeGm());
  const start = engine.newGame(37, `fifth-${choice}`);
  start.state.flags.후속_시작 = true;
  const result = await engine.act(start.state, { type: 'choose', id: choice });
  expect(result.state.beat).toBe('ep05_boundary');
  return { engine, result };
}

describe('실제 5→6 장 경계', () => {
  test.each(routes)('$choice 종료 저장은 선택한 대답만 계승하고 인사를 반복하지 않는다', async (route) => {
    const previous = await finishFifth(route.choice);
    const saved = { ...previous.result.state, ending: 'ep05_boundary' };
    await writeSave(saves, route.choice, campaign, saved);
    const loaded = await readSave(saves, route.choice, campaign);
    const before = structuredClone(loaded);
    const observed: ViewpointObservation[] = [];
    const result = await resumeCampaign(previous.engine, loaded, (entry) => observed.push(entry));
    expect(result.continued).toBe(true);
    expect(result.state.beat).toBe(route.destination);
    expect(loaded).toEqual(before);
    for (const key of ['tracks', 'abilities', 'items', 'said', 'heard', 'rng'] as const) {
      expect(result.state[key]).toEqual(loaded[key]);
    }
    for (const [flag, value] of Object.entries(loaded.flags)) expect(result.state.flags[flag]).toBe(value);
    const lines = result.step.events.filter((event) => event.type === 'line');
    expect(lines.map((line) => line.text)).not.toContain('덕분에 잘 지냈다마다요.');
    expect(lines.map((line) => line.text)).not.toContain('라 쿤께선 지난밤 평안하셨는지요?');
    expect(lines.some((line) => line.cg === 'ep06_cg_002')).toBe(!route.short);
    expect(lines.some((line) => line.cg === 'ep06_cg_005')).toBe(route.short);
    if (route.short) {
      for (const beat of ['ep06_c002', 'ep06_c003', 'ep06_c004']) {
        expect(result.state.log.some((entry) => entry.kind === 'beat' && entry.beat === beat)).toBe(false);
      }
      expect(result.state.flags.ep05_지난밤답변).toBeUndefined();
      expect(result.state.flags.ep05_지난밤되물음).toBeUndefined();
    }
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every((entry) => entry.source === 'fresh')).toBe(true);
    expect(observed.map((entry) => entry.event)).toEqual(result.step.events.filter((event) => event.type === 'scene' || event.type === 'line'));
    expect(observed[0]?.state.beat).toBe('ep06_c001');
    expect(observed[0]?.state.flags.ep05_시선답변).toBe(true);
    expect(result.state.log.slice(loaded.log.length).filter((entry) => entry.kind === 'choice').map((entry) => entry.choice))
      .toEqual(['continue_ep06']);
    const resumed: ViewpointObservation[] = [];
    const again = await resumeCampaign(previous.engine, result.state, (entry) => resumed.push(entry));
    expect(again.continued).toBe(false);
    expect(again.state).toEqual(result.state);
    expect(resumed.length).toBeGreaterThan(0);
    expect(resumed.every((entry) => entry.source === 'resume')).toBe(true);
  });

  for (const route of routes) {
    test.each([{ ending: null }, { ending: 'ep05_boundary' }] as const)(`${route.choice} 옛 플래그 없는 저장 %p는 실제 발화로만 구별한다`, async ({ ending }) => {
      const previous = await finishFifth(route.choice);
      const saved = structuredClone(previous.result.state);
      saved.ending = ending;
      for (const flag of flags) delete saved.flags[flag];
      const original = structuredClone(saved);
      const opened = await resumeCampaign(previous.engine, saved);
      expect(saved).toEqual(original);
      expect(opened.continued).toBe(ending !== null);
      const result = ending === null
        ? await previous.engine.act(opened.state, { type: 'choose', id: 'continue_ep06' })
        : opened;
      expect(result.state.beat).toBe(route.destination);
      expect(result.state.flags.ep05_시선답변).toBe(true);
      expect(result.state.flags.ep05_지난밤답변).toBe(route.short ? undefined : true);
      expect(result.state.flags.ep05_지난밤되물음).toBe(route.short ? undefined : true);
    });
  }

  test.each(['speech', 'visit', 'partial'] as const)('불충분하거나 모순된 %s 기록은 표준 인사로 추정하지 않는다', async (missing) => {
    const previous = await finishFifth('ep05_reply_original');
    const saved = structuredClone(previous.result.state);
    saved.ending = 'ep05_boundary';
    for (const flag of flags) delete saved.flags[flag];
    switch (missing) {
      case 'speech':
        saved.spoken = {};
        saved.recent = [];
        break;
      case 'visit':
        saved.log = saved.log.filter((entry) => entry.kind !== 'beat' || entry.beat !== 'ep05_c055');
        break;
      case 'partial':
        saved.flags.ep05_지난밤답변 = true;
        break;
      default:
        throw new ScenarioError(`검증 분기 오류: ${missing satisfies never}`);
    }
    const before = structuredClone(saved);
    await expect(resumeCampaign(previous.engine, saved)).rejects.toBeInstanceOf(SaveError);
    expect(saved).toEqual(before);
  });

  test('다른 종료 이름은 실제 5화 경계로 위장해 넘기지 않는다', async () => {
    const previous = await finishFifth('ep05_reply_short');
    const saved = { ...previous.result.state, ending: 'unrelated_end' };
    const result = await resumeCampaign(previous.engine, saved);
    expect(result.continued).toBe(false);
    expect(result.state.ending).toBe('unrelated_end');
    expect(result.state.beat).toBe('ep05_boundary');
  });

  test('실제 지도 경계가 선언된 6화 시작 노드로 연결된다', () => {
    const source = campaign.atlas?.nodes.find((node) => node.beats.includes('ep05_boundary'));
    const entry = campaign.atlas?.nodes.find((node) => node.beats.includes('ep06_c001'));
    if (!source || !entry) throw new ScenarioError('실제 5→6 지도 경계가 없습니다');
    expect(campaign.atlas?.edges).toContainEqual([source.id, entry.id]);
    expect(source.ending).toBe(false);
    expect(campaign.beats.ep05_boundary?.choices?.[0]?.next).toBe('ep06_c001');
  });
});
