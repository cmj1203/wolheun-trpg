import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { evalCond } from '../src/engine/conditions.ts';
import { checkScenario, edgesOf, loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent, GameState, Scenario, Tier } from '../src/engine/types.ts';
import { FakeGm, META } from './helpers.ts';

const root = join(import.meta.dir, '../..');
const path = join(root, 'app/content/ep04_night.yaml');
const scenario = await loadScenario(path);
const previous = await loadScenario(join(root, 'app/content/ep02_captivity.yaml'));
const source = await Bun.file(join(root, 'docs/continuation/ep04/script.md')).text();
const sections = [...source.matchAll(/^### (ep04_c\d{3})\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)];
const idleGm = () => new FakeGm(() => ({ kind: 'idle', source: 'rule', meta: META }));

function sourceText(text: string): string {
  return text === 'LOADING… / YOU DIE' ? '불러오는 중… / 사망' : text.replace('Lv.999', '레벨 999');
}

async function distanceResult(seed: number, ownedScenario: Scenario = scenario) {
  const engine = new Engine(ownedScenario, idleGm());
  let result = engine.newGame(seed, `ep04-distance-${seed}`);
  result = await engine.act(result.state, { type: 'choose', id: 'guards' });
  result = await engine.act(result.state, { type: 'free', text: '(가만히 기다린다)' });
  result = await engine.act(result.state, { type: 'choose', id: 'conceal' });
  result = await engine.act(result.state, { type: 'choose', id: 'distance' });
  return engine.act(result.state, { type: 'approach', id: 'ep04_keep_distance' });
}

function assertDistance(state: GameState, events: readonly GameEvent[]) {
  expect(state.flags.ep04_distance_kept).toBe(true);
  expect(state.beat).toBe('ep04_distance_boundary');
  expect(state.ending).toBe('ep04_distance_boundary');
  const lines = events.filter((e) => e.type === 'line');
  const ids = lines.flatMap((e) => e.cg ? [e.cg] : []);
  expect(ids).not.toContain('ep04_c057_source');
  expect(ids).not.toContain('ep04_c061_source');
  expect(ids).not.toContain('ep04_c062_source');
  expect(state.flags.ep04_eye_praise).toBe(true);
}

describe('4화 독립 대본의 원문·연결 계약', () => {
  test('실제 로더에서 독립 식별자로 읽고 공유 소지품 사전을 보존한다', async () => {
    const campaignLoader = await loadCampaignScenario(path);
    expect(checkScenario(scenario)).toEqual([]);
    expect(campaignLoader.id).toBe('ep04_night');
    expect(Object.keys(campaignLoader.beats).some((id) => id.startsWith('ep02_'))).toBe(false);
    expect(scenario.sheet).toEqual(previous.sheet);
  });

  test('원문 63컷의 모든 대사·독백·삽입 글자를 원문 순서대로 보존한다', () => {
    expect(sections.length).toBe(63);
    for (const section of sections) {
      const id = section[1];
      const body = section[2];
      if (!id || body === undefined) throw new Error('원문 컷을 분리하지 못했다');
      const expected = [...body.matchAll(/^- (아시나(?:\([^\n)]*\))?|남성|베히다트(?:\(화면 밖\))?|삽입 글자|삽입 설명): (.*)$/gm)]
        .map((match) => {
          if (match[2] === undefined) throw new Error('원문 대사를 읽지 못했다');
          return sourceText(match[2]);
        });
      const beat = scenario.beats[id];
      if (!beat) throw new Error(`원문 컷의 비트가 없다: ${id}`);
      expect(beat.lines.map((line) => line.text)).toEqual(expected.length ? expected : ['']);
      expect(new Set(beat.lines.map((line) => line.cg))).toEqual(new Set([`${id}_source`]));
    }
  });

  test('c053과 c054 사이 컷 범위 밖 풍선을 생략하지 않는다', () => {
    const original = source.match(/별도 풍선 “([^”]+)”/u)?.[1];
    if (!original) throw new Error('보충 풍선의 원문이 없다');
    expect(scenario.beats.ep04_c053?.next).toBe('ep04_c053_balloon');
    expect(scenario.beats.ep04_c053_balloon?.lines.map((line) => line.text)).toEqual([original]);
    expect(scenario.beats.ep04_c053_balloon?.next).toBe('ep04_c054');
    expect(scenario.beats.ep04_c053_balloon?.lines[0]?.cg).toBe('ep04_c053_source');
  });

  test('모든 CG가 서버 제공 가능한 실재 자산이고 슬롯은 CG 전용 별칭이다', async () => {
    for (const cg of Object.values(scenario.cgs)) {
      expect(cg.file?.startsWith('assets/ep04/')).toBe(true);
      if (!cg.file) throw new Error('CG 파일 경로가 없다');
      expect(await Bun.file(join(root, cg.file)).exists()).toBe(true);
    }
    for (const beat of Object.values(scenario.beats)) {
      for (const slot of Object.values(beat.cast ?? {})) {
        if (!slot) continue;
        expect(slot.startsWith('ep04_')).toBe(true);
        expect(scenario.cast[slot]?.sprite).toBeUndefined();
      }
    }
    expect(scenario.cast.ep04_man?.lore).toBe(scenario.cast.ep04_behidat?.lore);
    expect(scenario.cast.ep04_asina?.lore).toBe(scenario.cast.ep04_thought?.lore);
  });

  test('실명·통치자·칭호는 각 대사 뒤에만 따로 열린다', () => {
    const gates = [
      ['ep04_c040', 'ep04_name_known', 'ep04_man', '남성'],
      ['ep04_c041', 'ep04_ruler_known', 'ep04_behidat', '베히다트'],
      ['ep04_c042', 'ep04_title_known', 'ep04_asina', '아시나'],
    ] as const;
    for (const [cut, flag, speaker, display] of gates) {
      const owners = Object.entries(scenario.beats)
        .flatMap(([id, beat]) => beat.lines.filter((line) => line.sets === flag).map(() => id));
      expect(owners).toEqual([cut]);
      const line = scenario.beats[cut]?.lines.at(-1);
      expect(line?.sets).toBe(flag);
      expect(line?.speaker).toBe(speaker);
      expect(scenario.cast[speaker]?.display).toBe(display);
    }
    expect(scenario.beats.ep04_c011?.lines.at(-1)?.sets).toBe('ep04_earring_rest_known');
    expect(scenario.beats.ep04_c012?.lines.at(-1)?.sets).toBe('ep04_earring_week_known');
  });

  test('지도는 모든 비트와 실제 관찰·침묵·거리 갈래를 빠짐없이 잇는다', () => {
    const atlas = scenario.atlas;
    if (!atlas) throw new Error('4화 지도가 없다');
    expect(atlas.nodes.every((node) => node.col >= 32)).toBe(true);
    expect(new Set(atlas.nodes.map((node) => `${node.col},${node.row}`)).size).toBe(atlas.nodes.length);
    const nodeFor = new Map(atlas.nodes.flatMap((node) => node.beats.map((beat) => [beat, node.id])));
    expect([...nodeFor.keys()].sort()).toEqual(Object.keys(scenario.beats).sort());
    const expected = new Set<string>();
    for (const beat of Object.values(scenario.beats)) {
      for (const next of edgesOf(beat)) {
        const fromNode = nodeFor.get(beat.id);
        const toNode = nodeFor.get(next);
        if (fromNode !== toNode) expected.add(JSON.stringify([fromNode, toNode]));
      }
    }
    expect(new Set(atlas.edges.map((edge) => JSON.stringify(edge)))).toEqual(expected);
    expect(atlas.chapters?.map((chapter) => chapter.id)).toEqual(['ep04']);
  });

  test('탐색 진행 중 수치·핀·기억을 초기화하지 않고 c014 신발 상태를 유지한다', async () => {
    const engine = new Engine(scenario, idleGm());
    const initial = engine.newGame(11, 'ep04-inheritance');
    initial.state.tracks.귀찌 = 3;
    initial.state.tracks.호감 = 4;
    initial.state.items = ['earring', 'pin'];
    initial.state.flags.ep03_하렘_앎 = true;
    initial.state.flags.시하드_호칭 = true;
    initial.state.heard = [{ text: '이번 판에서 실제로 들은 말', action: false }];
    const result = await engine.act(initial.state, { type: 'choose', id: 'guards' });
    expect(result.step.prompt.type).toBe('free');
    expect(result.state.tracks.귀찌).toBe(3);
    expect(result.state.tracks.호감).toBe(4);
    expect(result.state.items).toEqual(['earring', 'pin']);
    expect(result.state.heard).toEqual([{ text: '이번 판에서 실제로 들은 말', action: false }]);
    expect(result.state.flags.ep03_금색신발_벗음).toBe(false);
    expect(result.state.flags.ep04_청록단화_착용).toBe(true);
  });

  test('4화 물리 상태 facts는 다음 화에서 비활성화할 수 있다', () => {
    const flags = { ep04_active: false, ep04_started: true, ep04_distance_kept: true, ep04_earring_rest_known: true };
    for (const fact of scenario.facts) {
      expect(evalCond(fact.if, { flags, tracks: scenario.sheet.tracks, abilities: scenario.sheet.abilities, items: [] })).toBe(false);
    }
  });
});

describe('4화 실제 엔진에서 거리와 무행동', () => {
  test('거리 확보의 성공·대가 있는 성공 모두 칭찬과 종료까지 달성 결과를 보존한다', async () => {
    const found = new Set<Tier>();
    for (let seed = 1; seed <= 160 && (!found.has('hit') || !found.has('mixed')); seed++) {
      const result = await distanceResult(seed);
      const checks = result.state.log.filter((entry) => entry.kind === 'check');
      expect(checks.length).toBe(1);
      const tier = checks[0]?.roll.tier;
      if (tier !== 'hit' && tier !== 'mixed') continue;
      found.add(tier);
      assertDistance(result.state, result.step.events);
      if (tier === 'mixed') expect(result.state.log.filter((entry) => entry.kind === 'price').length).toBe(1);
    }
    expect(found).toEqual(new Set(['hit', 'mixed']));
  });

  test('거리 확보 실패는 성공 플래그를 주지 않고 원작 경로에 남는다', async () => {
    let witnessed = false;
    for (let seed = 1; seed <= 160; seed++) {
      const result = await distanceResult(seed);
      const roll = result.state.log.find((entry) => entry.kind === 'check');
      if (roll?.kind !== 'check' || roll.roll.tier !== 'miss') continue;
      expect(result.state.flags.ep04_distance_kept).toBeUndefined();
      expect(result.state.ending).toBe('ep04_boundary');
      witnessed = true;
      break;
    }
    expect(witnessed).toBe(true);
  });

  test('거리 자리에서 가만히 있으면 판정·가짜 거리 성공 없이 원작 마지막 대사로 진행한다', async () => {
    const owned = { ...scenario, start: 'ep04_distance_free' };
    const engine = new Engine(owned, idleGm());
    const initial = engine.newGame(7, 'ep04-idle');
    const result = await engine.act(initial.state, { type: 'free', text: '(가만히 있는다)' });
    expect(result.state.log.filter((entry) => entry.kind === 'check')).toEqual([]);
    expect(result.state.flags.ep04_distance_kept).toBeUndefined();
    expect(result.state.ending).toBe('ep04_boundary');
  });

  test('침묵을 선택한 뒤 여행자라고 말했다는 고정 발화를 덧붙이지 않는다', async () => {
    const owned = { ...scenario, start: 'ep04_i03_origin' };
    const engine = new Engine(owned, idleGm());
    const initial = engine.newGame(9, 'ep04-silent');
    const result = await engine.act(initial.state, { type: 'choose', id: 'silent' });
    const lines = result.step.events.filter((event) => event.type === 'line').filter((event) => event.speaker === 'ep04_asina');
    expect(lines.some((line) => scenario.beats.ep04_c051?.lines.some((original) => original.text === line.text))).toBe(false);
    expect(lines.some((line) => scenario.beats.ep04_c052?.lines.some((original) => original.text === line.text))).toBe(false);
    expect(result.state.flags.ep04_origin_private).toBe(true);
    expect(result.state.log.filter((entry) => entry.kind === 'check')).toEqual([]);
  });
});
