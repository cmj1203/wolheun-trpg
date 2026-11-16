import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { cgLineProblem, faceProblem, linesOfBeat, loadScenario } from '../src/engine/scenario.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';

const content = join(import.meta.dir, '../content');
const chapter = await loadScenario(join(content, 'ep10_internal.yaml'));
const base = await loadScenario(join(content, 'ep01_desert.yaml'));
const lore = await loadLore(join(content, 'lore_wolheun.yaml'));
// 전체 캠페인 검증과 구분해 실제 정식 배우와 10화 배우의 충돌만 합성한다.
const composed = {
  ...base,
  cast: { ...base.cast, ...chapter.cast },
  sprites: { ...base.sprites, ...chapter.sprites },
  cgs: { ...base.cgs, ...chapter.cgs },
  beats: { ...base.beats, ...chapter.beats },
};
const asina = base.cast.아시나;
const behidat = lore.characters.베히다트;
if (!asina?.faces || !asina.sprite || !behidat?.reactions) throw new Error('정식 인물 계약이 없다');
const asinaFaces = asina.faces;
const asinaSprite = asina.sprite;
const behidatFaces = Object.values(behidat.reactions).flat().map((line) => line.face);
const actors = Object.entries(chapter.cast).filter(([, cast]) => cast.style !== 'narration');

describe('10화 전체 CG 배우의 동일 로어 합성', () => {
  test('CG 별칭 추가가 정식 배우를 덮거나 기존 실제 입식의 표정 검사를 오염시키지 않는다', () => {
    for (const [id, canonical] of Object.entries(base.cast)) {
      expect(composed.cast[id]).toEqual(canonical);
      for (const face of canonical.faces ?? []) {
        expect(faceProblem(composed, id, face)).toBeNull();
      }
    }
    expect(withNotes(composed, lore).notes).toEqual(lore.knowledge);
  });

  test('모든 원작 CG 배우는 실제 인물별 허용 표정만 선언하고 유효 CG를 쓴다', () => {
    for (const [id, cast] of actors) {
      let expected: readonly string[];
      switch (cast.lore) {
        case '아시나': expected = asinaFaces; break;
        case '베히다트': expected = behidatFaces; break;
        case '누르': expected = ['neutral', 'smile', 'surprised']; break;
        default: throw new Error(`감사하지 않은 로어: ${cast.lore}`);
      }
      expect(cast.presentation).toBe('cg');
      expect(cast.sprite).toBeUndefined();
      expect(cast.sprite_alt).toBeUndefined();
      expect(new Set(cast.faces)).toEqual(new Set(expected));
      for (const face of new Set(expected)) {
        expect(faceProblem(composed, id, face)).toBeNull();
      }
      const lines = Object.values(chapter.beats).flatMap(linesOfBeat)
        .filter((line) => line.speaker === id);
      expect(lines.length).not.toBe(0);
      for (const line of lines) expect(cgLineProblem(composed, line)).toBeNull();
    }
  });

  test('CG 표시 계약은 CG 없는 줄·미승인 표정과 정식 입식 파일 누락을 계속 거절한다', () => {
    for (const [speaker] of actors) {
      expect(cgLineProblem(composed, { speaker, text: '검사', face: 'neutral' })).not.toBeNull();
      expect(cgLineProblem(composed, {
        speaker, text: '검사', face: 'ep10_unapproved', cg: 'ep10_c016',
      })).not.toBeNull();
    }
    const sprites = { ...composed.sprites };
    delete sprites[`${asinaSprite}_smile`];
    expect(faceProblem({ ...composed, sprites }, '아시나', 'smile')).not.toBeNull();
  });
});
