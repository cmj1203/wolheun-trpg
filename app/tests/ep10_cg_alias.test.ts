import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { cgLineProblem, faceProblem, linesOfBeat, loadScenario } from '../src/engine/scenario.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';

const content = join(import.meta.dir, '../content');
const scenario = await loadScenario(join(content, 'ep10_internal.yaml'));
const base = await loadScenario(join(content, 'ep01_desert.yaml'));
const lore = await loadLore(join(content, 'lore_wolheun.yaml'));
const aliases = ['ep10_왕', 'ep10_왕속마음'] as const;
const character = lore.characters.베히다트;
if (!character?.reactions) throw new Error('실제 베히다트 반응이 없다');
const reactions = Object.values(character.reactions).flat();

describe('10화 왕 별칭의 CG 반응 계약', () => {
  test('실제 로어 반응을 두 별칭 모두 적재하고 해당 대사마다 유효한 CG를 요구한다', () => {
    // 기존 수첩 after 참조에는 실제 1화 비트만 보충한다. cast는 10화 것을 유지한다.
    const attached = withNotes({
      ...scenario,
      beats: { ...base.beats, ...scenario.beats },
    }, lore);
    expect(attached.notes).toEqual(lore.knowledge);
    expect(new Set(reactions.map((line) => line.face)))
      .toEqual(new Set(['dumbfounded', 'intrigued', 'wary', 'sneer', 'neutral', 'menacing']));
    for (const speaker of aliases) {
      const cast = scenario.cast[speaker];
      expect(cast?.lore).toBe('베히다트');
      expect(cast?.presentation).toBe('cg');
      expect(cast?.sprite).toBeUndefined();
      expect(cast?.sprite_alt).toBeUndefined();
      expect(new Set(cast?.faces)).toEqual(new Set(reactions.map((line) => line.face)));
      for (const line of reactions) expect(faceProblem(scenario, speaker, line.face)).toBeNull();
      const lines = Object.values(scenario.beats).flatMap(linesOfBeat)
        .filter((line) => line.speaker === speaker);
      expect(lines.length).not.toBe(0);
      for (const line of lines) expect(cgLineProblem(scenario, line)).toBeNull();
    }
  });

  test('두 별칭 모두 CG 없는 줄과 존재하지 않는 CG를 거절한다', () => {
    for (const speaker of aliases) {
      expect(cgLineProblem(scenario, { speaker, text: '검사', face: 'neutral' })).not.toBeNull();
      expect(cgLineProblem(scenario, {
        speaker, text: '검사', face: 'neutral', cg: 'ep10_missing_cg',
      })).not.toBeNull();
    }
  });

  test('유효한 CG가 있어도 승인하지 않은 표정은 두 별칭 모두 거절한다', () => {
    for (const speaker of aliases) {
      for (const face of ['smile', 'surprised', 'scared']) {
        expect(faceProblem(scenario, speaker, face)).not.toBeNull();
        expect(cgLineProblem(scenario, {
          speaker, text: '검사', face, cg: 'ep10_c016',
        })).not.toBeNull();
      }
    }
  });
});
