import { describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import sourceCuts from '../../assets/ep07/cuts.json';
import sourceScenes from '../../docs/continuation/ep07/scenes.json';
import { emptyAtlas, forkBeats, recordAtlas } from '../src/engine/atlas.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { activeFacts, Engine } from '../src/engine/engine.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { Scenario } from '../src/engine/types.ts';
import { FakeGm } from './helpers.ts';

const root = join(import.meta.dir, '../..');
const path = join(root, 'app/content/ep07_harem.yaml');
const scenario = await loadScenario(path);
const preceding = await loadScenario(join(root, 'app/content/ep03_palace.yaml'));
const shared = await loadScenario(join(root, 'app/content/ep02_captivity.yaml'));
const cutIds = sourceCuts.cuts.map((cut) => cut.id);

// 실제 앞 화의 종료를 가정하지 않는다. 이미 존재하는 판의 보존 여부만 시험한다.
async function enterFromPrior(chapter: Scenario) {
  const gm = new FakeGm();
  const gate = 'ep07_test_gate';
  const engine = new Engine({
    ...chapter,
    start: gate,
    beats: {
      ...chapter.beats,
      [gate]: {
        id: gate,
        title: '검증용 진입',
        lines: [],
        choices: [{ id: 'enter', text: '진입', next: chapter.start }],
      },
    },
  }, gm, () => 1_000_000);
  const initial = engine.newGame(42, 'ep07_이전상태보존');
  const prior = {
    ...initial.state,
    items: ['earring'],
    tracks: { ...initial.state.tracks, 정신력: 2, 귀찌: 3, 의심: 4, 탈주: 1 },
    flags: {
      ep03_시작: true,
      ep03_짐_수중없음: true,
      ep03_복장_청록복: true,
      이전판_보존: true,
    },
    said: ['이전 장면에서 플레이어가 직접 한 말'],
  };
  return { prior, gm, ...await engine.act(prior, { type: 'choose', id: 'enter' }) };
}

describe('7화 독립 내부 시나리오', () => {
  test('고유 ID로 단독 캠페인을 로드하며 공유 소지품과 표정 사전을 보존한다', async () => {
    const standalone = await loadCampaignScenario(path);

    expect(standalone.id).toBe('ep07_harem');
    expect(standalone.start).toBe('ep07_c001');
    expect(Object.keys(standalone.beats)).toEqual(cutIds);
    expect(standalone.sheet).toEqual(shared.sheet);
    expect(standalone.sprites).toEqual(shared.sprites);
    for (const key of ['나레이션', 'GM', '아시나', '속마음', '남자']) {
      expect(standalone.cast[key]).toEqual(shared.cast[key]);
    }
  });

  test('원작 전 컷을 한 번씩 지나며 독백과 감정 반응에 입력이나 판정을 요구하지 않는다', () => {
    const gm = new FakeGm();
    const result = new Engine(scenario, gm, () => 1_000_000).newGame(17, 'ep07_자동진행');

    expect(result.state.log.flatMap((entry) => entry.kind === 'beat' ? [entry.beat] : [])).toEqual(cutIds);
    expect(result.state.log.filter((entry) => entry.kind === 'check')).toEqual([]);
    expect(result.state.beat).toBe('ep07_c063');
    expect(result.state.ending).toBe('ep07_internal_end');
    expect(result.state.rng).toBe(17);
    expect(gm.calls).toEqual([]);
  });

  test('부분 반환과 호위 배정이 기존 재고와 수치를 임의로 채우거나 소비하지 않는다', async () => {
    const result = await enterFromPrior(scenario);

    expect(result.state.items).toEqual(result.prior.items);
    expect(result.state.tracks).toEqual(result.prior.tracks);
    expect(result.state.rng).toBe(result.prior.rng);
    expect(result.state.flags.이전판_보존).toBe(true);
    expect(result.state.flags.ep07_짐_부분반환).toBe(true);
    expect(result.state.flags.ep07_호위_밖대기).toBe(true);
    expect(result.state.flags.ep07_단화).toBe(true);
  });

  test.each([
    { stop: 'ep07_c003', notReturned: true, partial: undefined },
    { stop: 'ep07_c004', notReturned: false, partial: true },
  ])('$stop 진입 직전까지 반환 전후 사실을 구분하고 청록복 사실을 종료한다', async ({ stop, notReturned, partial }) => {
    const barrier = scenario.beats[stop];
    if (!barrier) throw new Error(`검증할 비트가 없다: ${stop}`);
    const chapter: Scenario = {
      ...scenario,
      facts: [...preceding.facts, ...scenario.facts],
      beats: {
        ...scenario.beats,
        [stop]: {
          id: stop,
          title: '검증용 정지',
          lines: [],
          choices: [{ id: 'hold', text: '대기', next: stop }],
        },
      },
    };

    const result = await enterFromPrior(chapter);

    expect(result.state.flags.ep03_짐_수중없음).toBe(notReturned);
    expect(result.state.flags.ep07_짐_부분반환).toBe(partial);
    expect(result.state.flags.ep03_복장_청록복).toBe(false);
    const active = activeFacts(chapter, result.state);
    for (const fact of preceding.facts.filter((fact) => fact.if === 'flag:ep03_짐_수중없음')) {
      expect(active.includes(fact)).toBe(notReturned);
    }
    for (const fact of preceding.facts.filter((fact) => fact.if === 'flag:ep03_복장_청록복')) {
      expect(active.includes(fact)).toBe(false);
    }
  });

  test('비공개 면담과 타인 독백을 아시나의 입력 기억이나 새 수첩 정보로 저장하지 않는다', async () => {
    const result = await enterFromPrior(scenario);

    expect(result.state.said).toEqual(result.prior.said);
    expect(result.state.heard).toEqual(result.prior.heard);
    expect(result.step.events.filter((event) => event.type === 'note')).toEqual([]);
    for (const cut of sourceScenes.scenes[2]?.cut_ids ?? []) {
      const beat = scenario.beats[cut];
      expect(Object.values(beat?.cast ?? {})).not.toContain('ep07_아시나');
      expect(beat?.lines.some((line) => scenario.cast[line.speaker]?.lore === '아시나')).toBe(false);
    }
    expect(scenario.cast.ep07_독백?.lore).toBe(scenario.cast.ep07_아시나?.lore);
    expect(scenario.cast.ep07_카림독백?.style).toBe('thought');
    expect(scenario.cast.ep07_카림독백?.lore).toBe(scenario.cast.ep07_카림?.lore);
    expect(scenario.cast.ep07_은발남성독백?.style).toBe('thought');
    expect(scenario.cast.ep07_은발남성독백?.lore).toBe(scenario.cast.ep07_은발남성?.lore);
    expect(scenario.cast.ep07_은발남성?.lore).toBe(scenario.cast.남자?.lore);
  });

  test('모든 대사와 무언 컷이 첫 줄부터 해당 원작 파일을 유지하고 사막 입식을 출연시키지 않는다', async () => {
    const result = new Engine(scenario, new FakeGm(), () => 1_000_000).newGame(17, 'ep07_컷유지');
    const assets = await realpath(join(root, 'assets'));
    let currentCut = '';
    const shown = new Set<string>();

    for (const event of result.step.events) {
      if (event.type === 'scene') {
        currentCut = event.beat;
        for (const actor of Object.values(event.cast)) {
          if (!actor) continue;
          expect(scenario.cast[actor]?.sprite).toBeUndefined();
          expect(scenario.cast[actor]?.sprite_alt).toBeUndefined();
        }
      }
      if (event.type !== 'line') continue;
      const asset = event.cg ? scenario.cgs[event.cg] : undefined;
      expect(asset?.file).toBe(`assets/ep07/cuts/full_res/clean/${currentCut}.png`);
      if (!asset?.file) throw new Error(`그림이 없는 대사: ${currentCut}`);
      const file = await realpath(join(root, asset.file));
      const withinAssets = relative(assets, file);
      expect(isAbsolute(withinAssets)).toBe(false);
      expect(withinAssets.startsWith('..')).toBe(false);
      const signature = new Uint8Array(await Bun.file(file).slice(0, 8).arrayBuffer());
      expect([...signature]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      shown.add(currentCut);
    }
    expect([...shown]).toEqual(cutIds);
  });

  test('지도에는 실제 열 장면의 방문 경로만 남고 가짜 선택이나 앞뒤 화 연결이 없다', () => {
    const result = new Engine(scenario, new FakeGm(), () => 1_000_000).newGame(17, 'ep07_지도');

    const record = recordAtlas(emptyAtlas(), result.state);

    expect(record.paths).toEqual([cutIds]);
    expect(scenario.atlas?.nodes.map((node) => ({ id: node.id, beats: node.beats })))
      .toEqual(sourceScenes.scenes.map((scene) => ({ id: scene.id, beats: scene.cut_ids })));
    expect(scenario.atlas?.edges).toEqual(sourceScenes.scenes.flatMap((scene, index) => {
      const next = sourceScenes.scenes[index + 1];
      return next ? [[scene.id, next.id] satisfies [string, string]] : [];
    }));
    expect(scenario.atlas?.chapters).toEqual([{ id: 'ep07', label: '7화', nodes: sourceScenes.scenes.map((scene) => scene.id) }]);
    expect([...forkBeats(scenario)]).toEqual([]);
    expect(result.state.flags.ep07_근접_종료).toBe(true);
    expect(scenario.beats.ep07_c063?.next).toBeUndefined();
  });
});
