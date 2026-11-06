import { describe, expect, test } from 'bun:test';
import { roll2d6, rollD6 } from '../src/engine/dice.ts';
import { Engine } from '../src/engine/engine.ts';
import { checkScenario, parseScenario } from '../src/engine/scenario.ts';
import type { Outcome, Scenario } from '../src/engine/types.ts';
import { FakeGm, loadDesert, SCENARIO_PATH } from './helpers.ts';

const scenario = await loadDesert();

async function beauty(rng: number, source: Scenario = scenario, luck = false) {
  const engine = new Engine({ ...source, start: 'b05_why' }, new FakeGm(), () => 0, luck);
  const { state } = engine.newGame(33, '대성공-재현');
  state.rng = rng;
  state.tracks.정신력 = 2;
  state.tracks.의심 = 3;
  const result = await engine.act(state, { type: 'approach', id: 'beauty' });
  return { engine, ...result };
}

function withHit(hit: Outcome): Scenario {
  const beat = scenario.beats.b05_why;
  if (!beat?.free) throw new Error('칼끝 장면의 자유 입력이 없다');
  return { ...scenario, beats: { ...scenario.beats, b05_why: {
    ...beat, free: { ...beat.free, approaches: beat.free.approaches.map((a) =>
      a.id === 'beauty' ? { ...a, outcomes: { ...a.outcomes, hit } } : a) },
  } } };
}

describe('6·6 대성공', () => {
  test('합계나 보정과 무관하게 두 눈이 6일 때만 대성공이며 난수 두 개만 소비한다', () => {
    const first = rollD6(33);
    const second = rollD6(first.state);
    const critical = roll2d6(33, '미인계', '매력', -20, [{ label: '시험 보정', value: -10 }]);
    expect(critical.roll).toMatchObject({ dice: [6, 6], total: -18, tier: 'crit' });
    expect(critical.rng).toBe(second.state);
    const ordinary = roll2d6(2, '미인계', '매력', 20, []);
    expect(ordinary.roll.dice).not.toEqual([6, 6]);
    expect(ordinary.roll.tier).toBe('hit');
    expect(roll2d6(33, '미인계', '매력', -20, [{ label: '시험 보정', value: -10 }])).toEqual(critical);
  });

  test('성공의 서술과 긴장은 같고 호감만 한 칸 커지며 대가가 없다', async () => {
    const critical = await beauty(33);
    const ordinary = await beauty(2);
    expect(critical.step.events.find((e) => e.type === 'roll')).toMatchObject({ dice: [6, 6], tier: 'crit', tierLabel: '대성공' });
    expect(ordinary.step.events.find((e) => e.type === 'roll')?.tier).toBe('hit');
    expect([critical.state.tracks.호감, ordinary.state.tracks.호감]).toEqual([2, 1]);
    expect([critical.state.tracks.집착, ordinary.state.tracks.집착]).toEqual([1, 1]);
    expect([critical.state.tracks.정신력, ordinary.state.tracks.정신력]).toEqual([3, 3]);
    expect([critical.state.flags.긴장, ordinary.state.flags.긴장]).toEqual([2, 2]);
    expect(critical.step.events.filter((e) => e.type === 'line')).toEqual(ordinary.step.events.filter((e) => e.type === 'line'));
    expect(critical.step.events.some((e) => e.type === 'price')).toBe(false);
    expect(critical.step.events.filter((e) => e.type === 'change').flatMap((e) => e.parts)).toContainEqual({ text: '대성공', tone: 'good' });
  });

  test('좋은 증가와 좋은 감소는 모두 한 칸 키우고 나쁜 변화는 그대로 둔다', async () => {
    const source = withHit({ lines: [], effects: { tracks: { 호감: 1, 탈주: 1, 의심: -1, 체력: -1, 집착: 1 } } });
    const { state } = await beauty(33, source);
    expect([state.tracks.호감, state.tracks.탈주, state.tracks.의심, state.tracks.체력, state.tracks.집착]).toEqual([2, 2, 1, 3, 1]);
  });

  test('좋은 수치 변화가 없는 성공은 정신력 한 칸으로 대신하고 중복 회복하지 않는다', async () => {
    const { state } = await beauty(33, withHit({ lines: [], effects: { tracks: { 집착: 1 } } }));
    expect(state.tracks.정신력).toBe(3);
    expect(state.tracks.집착).toBe(1);
  });

  test('행운으로 메운 실패는 6·6 대성공으로 바뀌지 않는다', async () => {
    const first = await beauty(5, scenario, true);
    expect(first.state.pendingLuck).toBeDefined();
    const filled = await first.engine.act(first.state, { type: 'luck', use: true });
    const check = filled.state.log.findLast((e) => e.kind === 'check');
    expect(check?.kind === 'check' ? check.roll : null).toMatchObject({ tier: 'mixed', total: 7, luck: 2 });
    expect(filled.step.events.filter((e) => e.type === 'change').flatMap((e) => e.parts)).not.toContainEqual({ text: '대성공', tone: 'good' });
  });

  test('YAML의 선택형 crit 결과는 자동 증폭 대신 그대로 쓰고 경로도 검증한다', async () => {
    const yaml = await Bun.file(SCENARIO_PATH).text();
    const marker = 'effects: { 집착: 1, 호감: 1, flags: { 미인계: true } }';
    const parsed = parseScenario(yaml.replace(marker, `${marker}
            crit:
              gist: 미인계가 먹혔다.
              lines:
                - 남자: …뭐?
              effects: { 호감: 4 }
              next: b06_swing`));
    const { state } = await beauty(33, parsed);
    expect(state.tracks.호감).toBe(4);
    const beat = parsed.beats.b05_why;
    const approach = beat?.free?.approaches.find((a) => a.id === 'beauty');
    if (!approach?.outcomes.crit) throw new Error('대성공 결과가 파싱되지 않았다');
    approach.outcomes.crit.next = '없는_장면';
    expect(checkScenario(parsed).some((p) => p.includes('crit.next') && p.includes('없는_장면'))).toBe(true);
  });
});
