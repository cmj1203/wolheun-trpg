import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { Engine } from '../src/engine/engine.ts';
import { cgLineProblem, checkScenario, faceProblem, loadScenario } from '../src/engine/scenario.ts';
import type { Line } from '../src/engine/types.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { FakeGm } from './helpers.ts';

const chapter = await loadScenario(join(import.meta.dir, '../content/ep09_palace.yaml'));
const desert = await loadScenario(join(import.meta.dir, '../content/ep01_desert.yaml'));
const lore = await loadLore(join(import.meta.dir, '../content/lore_wolheun.yaml'));
const aliases = ['ep09_황제', 'ep09_황제독백'] as const;
const reactionFaces = [...new Set(Object.values(lore.characters.베히다트?.reactions ?? {}).flat().map((line) => line.face))];
const canonicalFaces: Record<string, readonly string[]> = {
  아시나: desert.cast.아시나?.faces ?? [],
  베히다트: reactionFaces,
  카림: ['neutral', 'wary', 'flustered'],
  나시르: ['neutral', 'smile'],
  ep09_장발대족장: ['neutral', 'smile'],
  ep09_대족장동행: ['neutral'],
};

describe('9화 원작 CG 별칭과 실제 캠페인', () => {
  test('실제 1~9화 로더 결과가 시나리오와 공유 로어 검증을 통과한다', async () => {
    const campaign = await loadCampaignScenario(join(import.meta.dir, '../content/ep01_desert.yaml'));

    const result = withNotes(campaign, lore);

    expect(campaign.beats.ep09_c084).toBeDefined();
    expect(checkScenario(result)).toEqual([]);
    expect(result.notes).toEqual(lore.knowledge);
  });

  for (const [actor, cast] of Object.entries(chapter.cast).filter(([, cast]) => cast.style === 'speech' || cast.style === 'thought')) {
    test(`${actor}는 로어 인물의 정확한 표정과 원작 CG를 사용한다`, async () => {
      const faces = cast.lore ? canonicalFaces[cast.lore] : undefined;
      if (!faces) throw new Error(`인물 표정 계약이 없다: ${actor}`);
      expect(cast.presentation).toBe('cg');
      expect(cast.sprite).toBeUndefined();
      expect(cast.sprite_alt).toBeUndefined();
      expect([...(cast.faces ?? [])].sort()).toEqual([...faces].sort());
      for (const face of faces) expect(faceProblem(chapter, actor, face)).toBeNull();
      for (const line of Object.values(chapter.beats).flatMap((beat) => beat.lines).filter((line) => line.speaker === actor)) {
        expect(cgLineProblem(chapter, line)).toBeNull();
        const file = line.cg ? chapter.cgs[line.cg]?.file : undefined;
        if (!file) throw new Error(`원작 CG가 없는 줄: ${actor}`);
        expect(await Bun.file(join(import.meta.dir, '../..', file)).exists()).toBe(true);
      }
    });
  }

  for (const actor of aliases) {
    test(`${actor}는 공유 반응의 정확한 표정과 모든 고정 줄의 실재 CG를 지원한다`, async () => {
      const lines = Object.values(chapter.beats).flatMap((beat) => beat.lines).filter((line) => line.speaker === actor);
      expect(lines.length).toBeGreaterThan(0);
      expect([...(chapter.cast[actor]?.faces ?? [])].sort()).toEqual([...reactionFaces].sort());
      for (const line of lines) {
        const file = line.cg ? chapter.cgs[line.cg]?.file : undefined;
        if (!file) throw new Error(`CG가 없는 줄: ${actor}`);
        expect(await Bun.file(join(import.meta.dir, '../..', file)).exists()).toBe(true);
        for (const face of reactionFaces) {
          expect(faceProblem(chapter, actor, face)).toBeNull();
          expect(cgLineProblem(chapter, { ...line, face })).toBeNull();
        }
      }
    });

    test.each(['CG 없음', '없는 CG', '미승인 표정'] as const)(`${actor}의 %s 출력은 실제 엔진이 거절한다`, (invalid) => {
      const entry = Object.entries(chapter.beats).find(([, beat]) => beat.lines.some((line) => line.speaker === actor));
      if (!entry) throw new Error(`배우 비트가 없다: ${actor}`);
      const [id, beat] = entry;
      const line = beat.lines.find((candidate) => candidate.speaker === actor);
      if (!line) throw new Error(`배우 줄이 없다: ${actor}`);
      const { cg, ...withoutCg } = line;
      expect(cg).toBeDefined();
      let bad: Line;
      switch (invalid) {
        case 'CG 없음': bad = withoutCg; break;
        case '없는 CG': bad = { ...line, cg: '없는_CG' }; break;
        case '미승인 표정': bad = { ...line, face: 'surprised' }; break;
      }
      const scenario = { ...chapter, start: id, beats: { ...chapter.beats, [id]: { ...beat, lines: [bad] } } };

      expect(() => new Engine(scenario, new FakeGm(), () => 1000).newGame(91, 'CG 거절 경계')).toThrow(/CG|표정/);
    });
  }
});
