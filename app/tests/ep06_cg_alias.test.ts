import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { cgLineProblem, checkScenario, loadScenario } from '../src/engine/scenario.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';

const app = join(import.meta.dir, '..');
const scenario = await loadScenario(join(app, 'content/ep06_library.yaml'));
const lore = await loadLore(join(app, 'content/lore_wolheun.yaml'));
const core = await loadScenario(join(app, 'content/ep01_desert.yaml'));
const faces = ['dumbfounded', 'intrigued', 'wary', 'sneer', 'neutral', 'menacing'] as const;

describe('6화 라·라독백의 동일 인물 CG 표정 계약', () => {
  test('실제 공유 반응 전체를 두 별칭 모두에 적용해도 수첩 결합이 통과한다', () => {
    // 원래 수첩과 반응을 유지한다. 기존 앞 화 after 참조만 실제 앞 화 비트로 해소하는 검사 자료다.
    const references = { ...scenario, beats: { ...core.beats, ...scenario.beats } };
    const linked = withNotes(references, lore);
    expect(linked.notes).toEqual(lore.knowledge);
    expect(linked.cast.ep06_라?.lore).toBe('베히다트');
    expect(linked.cast.ep06_라독백?.lore).toBe('베히다트');
  });

  test('현재 두 CG 배우의 모든 원작 줄이 유효한 CG를 갖고 시나리오 검사를 통과한다', () => {
    const lines = Object.values(scenario.beats).flatMap((beat) => beat.lines)
      .filter((line) => scenario.cast[line.speaker]?.lore === '베히다트');
    expect(lines.length).toBeGreaterThan(0);
    expect(checkScenario(scenario)).toEqual([]);
    for (const line of lines) expect(cgLineProblem(scenario, line)).toBeNull();
  });

  for (const [speaker, beatId] of [['ep06_라', 'ep06_c002'], ['ep06_라독백', 'ep06_c007']] as const) {
    const beat = scenario.beats[beatId];
    if (!beat) throw new Error(`원작 비트가 없습니다: ${beatId}`);
    const line = beat.lines.find((entry) => entry.speaker === speaker);
    if (!line) throw new Error(`배우의 실제 원작 줄이 없습니다: ${speaker}`);

    test(`${speaker}: 입식 없이 승인된 여섯 표정만 CG에서 허용한다`, () => {
      expect(scenario.cast[speaker]?.presentation).toBe('cg');
      expect(scenario.cast[speaker]?.sprite).toBeUndefined();
      expect(scenario.cast[speaker]?.sprite_alt).toBeUndefined();
      expect(scenario.cast[speaker]?.faces).toEqual(faces);
      for (const face of faces) expect(cgLineProblem(scenario, { ...line, face })).toBeNull();
    });

    test(`${speaker}: CG를 뺀 줄은 기존 정합성 검사에서 거부한다`, () => {
      const { cg: _cg, ...missing } = line;
      const changed = {
        ...scenario,
        beats: {
          ...scenario.beats,
          [beatId]: { ...beat, lines: beat.lines.map((entry) => entry === line ? missing : entry) },
        },
      };
      expect(checkScenario(changed).some((problem) => problem.includes('유효한 CG가 필요합니다'))).toBe(true);
    });

    test(`${speaker}: 등록되지 않은 CG는 기존 정합성 검사에서 거부한다`, () => {
      const changed = {
        ...scenario,
        beats: {
          ...scenario.beats,
          [beatId]: {
            ...beat,
            lines: beat.lines.map((entry) => entry === line ? { ...entry, cg: 'ep06_missing_cg' } : entry),
          },
        },
      };
      expect(checkScenario(changed).some((problem) => problem.includes('유효한 CG가 필요합니다'))).toBe(true);
    });

    for (const face of ['smile', 'surprised']) {
      test(`${speaker}: 승인하지 않은 ${face} 표정은 기존 정합성 검사에서 거부한다`, () => {
        const changed = {
          ...scenario,
          beats: {
            ...scenario.beats,
            [beatId]: {
              ...beat,
              lines: beat.lines.map((entry) => entry === line ? { ...entry, face } : entry),
            },
          },
        };
        expect(checkScenario(changed).some((problem) => problem.includes(`받은 값: ${face}`))).toBe(true);
      });
    }
  }
});
