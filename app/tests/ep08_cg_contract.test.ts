import { describe, expect, test } from 'bun:test';
import { cgLineProblem, faceProblem, loadScenario } from '../src/engine/scenario.ts';
import { loadLore } from '../src/gm/lore.ts';
import { APP, LORE_PATH } from './helpers.ts';

const chapter = await loadScenario(`${APP}/content/ep08_harem.yaml`);
const lore = await loadLore(LORE_PATH);
const character = lore.characters.베히다트;
if (!character) throw new Error('실제 베히다트 로어가 없습니다');
const reactions = Object.values(character.reactions ?? {}).flat();
const speakers = Object.entries(chapter.cast).filter(([, cast]) => cast.lore === '베히다트');

describe('8화 왕의 같은 인물 CG 별칭', () => {
  test('독백을 포함한 모든 별칭에서 실제 공유 로어 반응이 유효한 CG로 표시된다', () => {
    expect(reactions.length).toBeGreaterThan(0);
    expect(speakers.length).toBeGreaterThan(0);
    for (const [speaker] of speakers) {
      for (const reaction of reactions) {
        expect(faceProblem(chapter, speaker, reaction.face)).toBeNull();
        expect(cgLineProblem(chapter, {
          speaker, text: reaction.text, face: reaction.face, cg: 'ep08_cg_036',
        })).toBeNull();
      }
    }
  });

  test('CG 누락·없는 그림·미승인 표정은 모든 왕 별칭에서 거절한다', () => {
    for (const [speaker] of speakers) {
      expect(cgLineProblem(chapter, { speaker, text: '검증 대사', face: 'neutral' })).not.toBeNull();
      expect(cgLineProblem(chapter, {
        speaker, text: '검증 대사', cg: '없는_CG', face: 'neutral',
      })).not.toBeNull();
      expect(cgLineProblem(chapter, {
        speaker, text: '검증 대사', cg: 'ep08_cg_036', face: '허용하지않은표정',
      })).not.toBeNull();
    }
  });
});
