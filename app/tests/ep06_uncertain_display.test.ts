import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent } from '../src/engine/types.ts';
import { FakeGm } from './helpers.ts';

const scenario = await loadScenario(join(import.meta.dir, '../content/ep06_library.yaml'));
// 실제 canonical_first.jsonl의 전달 행을 기준으로 고정한 원문·화자·CG다.
const fixtures = [
  { row: 1728, speaker: 'ep06_미확정풍선', style: 'narration', text: '이 상황에서도 입은 살아있군.', cg: 'ep06_cg_026' },
  { row: 1729, speaker: 'ep06_한숨미확정', style: 'speech', text: '하아…', cg: 'ep06_cg_027' },
  { row: 1731, speaker: 'ep06_독백미확정', style: 'thought', text: '왜 날 자꾸 어디론가 보내는 거야?!', cg: 'ep06_cg_027' },
  { row: 1948, speaker: 'ep06_아시나미확정', style: 'narration', text: '타는듯한 더위에 녹아 사라져도 좋을 만큼.', cg: 'ep06_cg_062' },
] as const;
const gm = new FakeGm();
const engine = new Engine(scenario, gm, () => 1000);
let result = engine.newGame(6, 'ep06-미확정표시');
const events: GameEvent[] = [...result.step.events];
for (const decision of ['decline', 'purpose', 'origin', 'question', 'politics', 'travel']) {
  result = await engine.act(result.state, { type: 'choose', id: `ep06_${decision}_direct` });
  events.push(...result.step.events);
}
const lines = events.filter((event) => event.type === 'line');
const targets = new Set<string>(fixtures.map((fixture) => fixture.speaker));
const delivered = lines.filter((line) => targets.has(line.speaker));

describe('6화 미확정 화자의 플레이어 표시', () => {
  for (const fixture of fixtures) {
    test(`실제 기록 ${fixture.row}: 전달 이름표에 제작 메모나 추정 이름을 넣지 않는다`, () => {
      const matching = delivered.filter((line) => line.speaker === fixture.speaker);
      expect(matching.length).toBe(1);
      expect(matching.map((line) => line.display)).toEqual(['']);
    });
  }

  test('이름표를 숨겨도 실제 네 원문·화자·종류·CG·순서는 바뀌지 않는다', () => {
    expect(delivered.map((line) => [line.speaker, line.style, line.text, line.cg]))
      .toEqual(fixtures.map((fixture) => [fixture.speaker, fixture.style, fixture.text, fixture.cg]));
  });

  test('알 수 없는 개인 신원과 알려진 아시나의 내부 정체성을 그대로 보존한다', () => {
    for (const id of ['ep06_미확정풍선', 'ep06_한숨미확정', 'ep06_독백미확정']) {
      expect(scenario.cast[id]?.lore).toBeUndefined();
    }
    expect(scenario.cast.ep06_아시나미확정?.lore).toBe('아시나');
    expect(scenario.cast.ep06_아시나미확정?.style).toBe('narration');
    for (const id of targets) {
      const source = Object.values(scenario.beats).flatMap((beat) => beat.lines)
        .filter((line) => line.speaker === id);
      expect(source.length).toBe(1);
      expect(source[0]?.sets).toBeUndefined();
      expect(source[0]?.effects).toBeUndefined();
    }
  });

  test('이미 확정된 다른 인물의 이름표를 함께 지우지 않는다', () => {
    expect(lines.find((line) => line.text === '고맙지만 그건 정중히 사양하겠습니다.')?.display).toBe('아시나');
    expect(lines.find((line) => line.text === '어떤가?')?.display).toBe('라');
    expect(lines.find((line) => line.text === '또 뵙게 되어 반갑습니다. 아시나님.')?.display).toBe('나시르');
  });

  test('표시 확인은 실제 모델이나 추가 판정 없이 독립 내부 경계까지 진행한다', () => {
    expect(gm.calls).toEqual([]);
    expect(events.filter((event) => event.type === 'roll')).toEqual([]);
    expect(result.state.ending).toBe('ep06_internal_end');
  });
});
