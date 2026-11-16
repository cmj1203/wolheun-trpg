import { describe, expect, test } from 'bun:test';
import { evalCond } from '../src/engine/conditions.ts';
import { loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { roll2d6 } from '../src/engine/dice.ts';
import { Engine } from '../src/engine/engine.ts';
import { hasCharacter } from '../src/engine/scenario.ts';
import type { GameState, Tier } from '../src/engine/types.ts';
import { loadLore, loreFor, spoilersFor, withNotes } from '../src/gm/lore.ts';
import { FakeGm, LORE_PATH, SCENARIO_PATH } from './helpers.ts';

const lore = await loadLore(LORE_PATH);
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const engineFor = () => new Engine(campaign, new FakeGm(), () => 1_000);

function legacyCapture(engine: Engine): GameState {
  const { state } = engine.newGame(913, 'continuation-story');
  state.beat = 'e_curious';
  state.ending = 'curious';
  state.free = null;
  state.tracks = { ...state.tracks, 체력: 3, 정신력: 3, 귀찌: 4, 의심: 2, 탈주: 1 };
  state.items = state.items.filter((item) => item !== 'map');
  state.flags = { 가방_끈: true, 지도_찢김: true, 플레이어_기억: '모래를 맛봄' };
  return state;
}

async function atQuestion() {
  const engine = engineFor();
  const entered = await resumeCampaign(engine, legacyCapture(engine));
  const unlocked = await engine.act(entered.state, { type: 'approach', id: 'steady' });
  expect(unlocked.state.beat).toBe('ep02_question');
  return { engine, state: unlocked.state };
}

function seedFor(state: GameState, tier: Tier): number {
  const approach = campaign.beats.ep02_question?.free?.approaches.find((candidate) => candidate.id === 'escape');
  if (!approach) throw new Error('실제 후속 대본에 도주 접근법이 없습니다');
  const mods = (approach.mods ?? []).filter((mod) => evalCond(mod.if, state));
  for (let seed = 1; seed <= 10_000; seed += 1) {
    if (roll2d6(seed, approach.label, approach.stat, state.abilities[approach.stat], mods).roll.tier === tier) return seed;
  }
  throw new Error(`${tier} 재현 시드가 없습니다`);
}

describe('실제 후속 선언형 대본', () => {
  test('감옥의 실제 공개 뒤 나라·감옥을 알지만 아직 듣지 않은 호칭과 본명은 잠긴다', async () => {
    const engine = engineFor();
    const before = legacyCapture(engine);
    expect(spoilersFor(lore, before)).toContain('감옥');
    expect(spoilersFor(lore, before)).toContain('페시안');
    const entered = await resumeCampaign(engine, before);
    expect(entered.state.beat).toBe('ep02_unlock');
    const known = loreFor(lore, entered.state).knowledge.map((note) => note.id);
    expect(known).toContain('jail');
    expect(known).toContain('fesian');
    expect(known).not.toContain('man_title');
    expect(known).not.toContain('man_true');
    expect(spoilersFor(lore, entered.state)).not.toContain('감옥');
    expect(spoilersFor(lore, entered.state)).not.toContain('페시안');
    expect(spoilersFor(lore, entered.state)).toContain('시하드');
    expect(entered.state.tracks).toEqual(before.tracks);
    expect(entered.state.items).toEqual(before.items);
    expect(entered.state.flags.가방_끈).toBe(true);
    expect(entered.state.flags.플레이어_기억).toBe('모래를 맛봄');
  });

  test('감옥 진입 시 같은 컷의 이어지는 대사도 명시한 CG를 가진다', async () => {
    const engine = engineFor();
    const entered = await resumeCampaign(engine, legacyCapture(engine));
    const lines = entered.step.events.filter((event) => event.type === 'line');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      if (line.by !== 'script') continue;
      expect(line.cg).toBeDefined();
      expect(line.cg && campaign.cgs[line.cg]?.file).toBeDefined();
    }
  });

  test('CG 전용 남자도 같은 인물로 인식하고 본선 궁정까지 기존 기억·물건을 계승한다', async () => {
    const { engine, state } = await atQuestion();
    const question = campaign.beats.ep02_question;
    if (!question) throw new Error('실제 후속 대본에 질문 장면이 없습니다');
    expect(hasCharacter(campaign, question, '남자')).toBe(true);
    expect(campaign.cast.ep02_남자?.lore).toBe(campaign.cast.남자?.lore);
    expect(campaign.cast.ep02_남자?.sprite).toBeUndefined();
    expect(campaign.cast.ep02_남자?.faces).toEqual(campaign.cast.남자?.faces);
    expect(spoilersFor(lore, state)).toContain('시하드');
    const final = await engine.act(state, { type: 'approach', id: 'conceal' });
    expect(final.state.beat).toBe('ep02_court_boundary');
    expect(final.state.ending).toBeNull();
    expect(final.step.prompt).toMatchObject({ type: 'choices', options: [{ id: 'continue_ep03' }] });
    expect(loreFor(lore, final.state).knowledge.map((note) => note.id)).toContain('man_title');
    expect(loreFor(lore, final.state).knowledge.map((note) => note.id)).not.toContain('man_true');
    expect(spoilersFor(lore, final.state)).not.toContain('시하드');
    expect(spoilersFor(lore, final.state)).toContain('베히다트');
    expect(final.state.flags.남자_정체_앎).not.toBe(true);
    expect(final.state.flags.가방_끈).toBe(true);
    expect(final.state.items).not.toContain('map');
    expect(final.state.flags.플레이어_기억).toBe('모래를 맛봄');
    expect(final.state.log.filter((entry) => entry.kind === 'end').map((entry) => entry.ending))
      .toEqual([]);
  });

  test.each(['hit', 'mixed'] as const)('도주 %s는 실제 도시 이탈이며 궁정 포획으로 돌아가지 않는다', async (tier) => {
    const { engine, state } = await atQuestion();
    state.rng = seedFor(state, tier);
    const before = state.log.length;
    const escaped = await engine.act(state, { type: 'approach', id: 'escape' });
    expect(escaped.step.events.find((event) => event.type === 'roll')?.tier).toBe(tier);
    expect(escaped.state.beat).toBe('ep02_city_escape');
    expect(escaped.state.flags.도시_이탈).toBe(true);
    expect(escaped.state.log.slice(before).filter((entry) => entry.kind === 'beat').map((entry) => entry.beat))
      .toEqual(['ep02_city_escape']);
  });

  test('도주 실패만 호송 본선으로 이어지며 가방·지도를 임의 복구하지 않는다', async () => {
    const { engine, state } = await atQuestion();
    state.rng = seedFor(state, 'miss');
    state.items = state.items.filter((item) => item !== 'magic_bag');
    const failed = await engine.act(state, { type: 'approach', id: 'escape' });
    expect(failed.step.events.find((event) => event.type === 'roll')?.tier).toBe('miss');
    expect(failed.state.beat).toBe('ep02_court_boundary');
    expect(failed.state.items).not.toContain('magic_bag');
    expect(failed.state.items).not.toContain('map');
  });
});
