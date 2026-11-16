import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import { FakeGm } from './helpers.ts';

const path = join(import.meta.dir, '../content/ep06_library.yaml');
const scenario = await loadScenario(path);
const authored: unknown = Bun.YAML.parse(await Bun.file(path).text());
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
if (!isRecord(authored) || !isRecord(authored.beats)) throw new Error('6화 비트 정의가 필요합니다');
const authoredBeats = authored.beats;
const authoredBeat = (id: string): Record<string, unknown> => {
  const beat = authoredBeats[id];
  if (!isRecord(beat)) throw new Error(`원작 관점 비트가 없습니다: ${id}`);
  return beat;
};

// 현재 파서·메모리 연결과 별개인, 원작 근거에 따른 데이터 선언 계약이다.
const audience = [
  'ep06_c007', 'ep06_c031', 'ep06_c032', 'ep06_c044', 'ep06_c045',
  'ep06_c056_interior', 'ep06_c057', 'ep06_c060_interior', 'ep06_c061',
  'ep06_c064', 'ep06_c065',
] as const;

describe('6화 원작 관점 선언', () => {
  for (const id of audience) {
    test(`${id}: 명시된 타인 내면·비공개 회상을 독자 시점으로 선언한다`, () => {
      expect(authoredBeat(id).perspective).toBe('audience');
    });
  }

  test('화면 밖 화자·미확정 풍선·아시나의 자기 회상만으로 독자 시점을 추론하지 않는다', () => {
    for (const id of [
      'ep06_c017', 'ep06_c026', 'ep06_c027', 'ep06_c029', 'ep06_c037',
      'ep06_c052', 'ep06_c056', 'ep06_c056_response', 'ep06_c062',
    ]) {
      expect(authoredBeat(id).perspective).toBeUndefined();
    }
  });

  for (const boundary of [
    { route: ['ep06_c045', 'ep06_c045_question'], private: 'ep06_c045', public: 'ep06_c045_question' },
    { route: ['ep06_c056', 'ep06_c056_interior', 'ep06_c056_response'], private: 'ep06_c056_interior', public: 'ep06_c056_response' },
    { route: ['ep06_c060', 'ep06_c060_interior'], private: 'ep06_c060_interior', public: 'ep06_c060' },
    { route: ['ep06_c061', 'ep06_c061_question'], private: 'ep06_c061', public: 'ep06_c061_question' },
    { route: ['ep06_c064', 'ep06_c064_reply'], private: 'ep06_c064', public: 'ep06_c064_reply' },
  ]) {
    test(`${boundary.private}: 혼합 컷의 순서·CG·사적 속마음 경계를 유지한다`, () => {
      expect(authoredBeat(boundary.private).perspective).toBe('audience');
      expect(authoredBeat(boundary.public).perspective).toBeUndefined();
      expect(scenario.beats[boundary.private]?.lines.every(
        (line) => scenario.cast[line.speaker]?.style === 'thought',
      )).toBe(true);
      for (let i = 1; i < boundary.route.length; i++) {
        const prior = boundary.route[i - 1];
        const next = boundary.route[i];
        if (prior === undefined || next === undefined) throw new Error('관점 경계 경로가 필요합니다');
        expect(scenario.beats[prior]?.next).toBe(next);
        expect(scenario.beats[prior]?.lines[0]?.cg).toBe(scenario.beats[next]?.lines[0]?.cg);
        expect(scenario.beats[prior]?.cut).toBe(scenario.beats[next]?.cut);
      }
    });
  }

  test('비공개 시험 뒤 입력은 공개 질문의 응답 자리에서 받고 효과를 잃지 않는다', async () => {
    const engine = new Engine(scenario, new FakeGm(), () => 1000);
    let result = engine.newGame(6, 'ep06-관점응답');
    for (const id of ['decline', 'purpose', 'origin', 'question', 'politics']) {
      result = await engine.act(result.state, { type: 'choose', id: `ep06_${id}_direct` });
    }
    expect(result.state.beat).toBe('ep06_c056_response');
    expect(result.step.prompt.type).toBe('choices');
    expect(authoredBeat(result.state.beat).perspective).toBeUndefined();
    expect(result.state.flags.ep06_독자_사막동기시험).toBe(true);
    expect(scenario.beats[result.state.beat]?.lines.map((line) => [line.text, line.cg]))
      .toEqual([['', 'ep06_cg_056']]);
  });
});
