import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { evalCond } from '../src/engine/conditions.ts';
import { Engine } from '../src/engine/engine.ts';
import { checkScenario, loadScenario } from '../src/engine/scenario.ts';
import type { FlagValue, GameEvent, GameState, Scenario } from '../src/engine/types.ts';
import { FakeGm } from './helpers.ts';

const scenario = await loadScenario(join(import.meta.dir, '../content/ep06_library.yaml'));
const fifth = await loadScenario(join(import.meta.dir, '../content/ep05_audience.yaml'));
const decisions = ['decline', 'purpose', 'origin', 'question', 'politics', 'travel'] as const;

const replay = async (count: number) => {
  const engine = new Engine(scenario, new FakeGm(), () => 1000);
  let result = engine.newGame(6, 'ep06-교정기억');
  const events: GameEvent[] = [...result.step.events];
  for (const decision of decisions.slice(0, count)) {
    result = await engine.act(result.state, { type: 'choose', id: `ep06_${decision}_direct` });
    events.push(...result.step.events);
  }
  return { state: result.state, events };
};

const factsAt = (state: GameState) => new Map(
  scenario.facts.filter((fact) => evalCond(fact.if, {
    flags: state.flags, tracks: state.tracks, abilities: state.abilities, items: state.items,
  })).map((fact) => [fact.if, fact.text]),
);

const atlas = scenario.atlas;
if (!atlas) throw new Error('6화 지도 계약이 필요합니다');
const entry = atlas.nodes.find((node) => node.beats.includes(scenario.start));
if (!entry) throw new Error('6화 진입 노드가 필요합니다');
const ingress: Scenario = {
  ...scenario,
  start: 'ep06_test_entry',
  beats: {
    ...scenario.beats,
    ep06_test_entry: {
      id: 'ep06_test_entry', title: '장 연결 검사', lines: [],
      choices: [{ id: 'ep06_test_continue', text: '계속', next: scenario.start }],
    },
  },
  atlas: {
    ...atlas,
    nodes: [{ id: 'ep06_test_entry', col: -1, row: 2, beats: ['ep06_test_entry'] }, ...atlas.nodes],
    edges: [['ep06_test_entry', entry.id], ...atlas.edges],
    chapters: atlas.chapters?.map((chapter) => chapter.id === 'ep06'
      ? { ...chapter, nodes: ['ep06_test_entry', ...chapter.nodes] } : chapter),
  },
};

describe('6화 실제 인사 완료 상태의 연결', () => {
  test('검사용 진입 노드도 기존 시나리오·장 지도 검사를 통과한다', () => {
    expect(checkScenario(ingress)).toEqual([]);
  });

  test('5화 실제 마지막 줄이 만든 두 플래그로 이어 오면 인사는 총 한 번만 나온다', async () => {
    const prior = new Engine({ ...fifth, start: 'ep05_c055' }, new FakeGm(), () => 1000)
      .newGame(5, 'ep05-실제인사');
    expect(prior.state.flags.ep05_지난밤답변).toBe(true);
    expect(prior.state.flags.ep05_지난밤되물음).toBe(true);
    const engine = new Engine(ingress, new FakeGm(), () => 1000);
    const initial = engine.newGame(6, 'ep06-실제연결');
    const next = await engine.act({
      ...initial.state, flags: { ...initial.state.flags, ...prior.state.flags },
    }, { type: 'choose', id: 'ep06_test_continue' });
    const greetings = ['덕분에 잘 지냈다마다요.', '라 쿤께선 지난밤 평안하셨는지요?'];
    const spoken = [...prior.step.events, ...next.step.events]
      .flatMap((event) => event.type === 'line' && greetings.includes(event.text) ? [event.text] : []);
    expect(spoken).toEqual(greetings);
    expect(next.state.beat).toBe('ep06_c003');
    expect(next.step.prompt.type).toBe('choices');
  });

  test('실제 짧은 응답 뒤에는 감사·되물음·하렘 칭찬·거절을 대신 말하지 않는다', async () => {
    const prior = new Engine({ ...fifth, start: 'ep05_reply_short' }, new FakeGm(), () => 1000)
      .newGame(5, 'ep05-실제짧은응답');
    expect(prior.state.flags.ep05_시선답변).toBe(true);
    expect(prior.state.flags.ep05_지난밤답변).toBeUndefined();
    expect(prior.state.flags.ep05_지난밤되물음).toBeUndefined();
    const engine = new Engine(ingress, new FakeGm(), () => 1000);
    const initial = engine.newGame(6, 'ep06-짧은응답연결');
    let next = await engine.act({
      ...initial.state, flags: { ...initial.state.flags, ...prior.state.flags },
    }, { type: 'choose', id: 'ep06_test_continue' });
    expect(next.state.beat).toBe('ep06_c008');
    const entering = next.step.events.flatMap((event) => event.type === 'scene' ? [event.beat] : []);
    expect(entering).toContain('ep06_c005');
    for (const skipped of ['ep06_c002', 'ep06_c003', 'ep06_c004', 'ep06_decline_pause']) {
      expect(entering).not.toContain(skipped);
    }
    expect(next.state.spoken?.ep06_아시나).toBeUndefined();
    expect(next.state.spoken?.ep06_라)
      .not.toContain('내 하렘이 그렇게 마음에 들었다면 평생을 살아도 된다고 허락하고 싶군.');
    for (const decision of decisions.slice(1)) {
      next = await engine.act(next.state, { type: 'choose', id: `ep06_${decision}_direct` });
    }
    expect(next.state.ending).toBe('ep06_internal_end');
    const visited = next.state.log.flatMap((entry) => entry.kind === 'beat' ? [entry.beat] : []);
    const nodes = scenario.atlas?.nodes ?? [];
    const route = visited.filter((beat) => beat !== 'ep06_test_entry')
      .map((beat) => nodes.find((node) => node.beats.includes(beat))?.id);
    expect(route).not.toContain('ep06_offer_choice');
    expect(route).not.toContain('ep06_decline_reply');
    for (let i = 1; i < route.length; i++) {
      if (route[i - 1] !== route[i]) {
        expect(scenario.atlas?.edges.some(([from, to]) => from === route[i - 1] && to === route[i])).toBe(true);
      }
    }
  });

  for (const [answer, question] of [[false, false], [true, false], [false, true], [true, true]] as const) {
    test(`단독·부분 승계: 답변 ${answer}, 되물음 ${question}의 미발화 줄만 재생한다`, async () => {
      const engine = new Engine(ingress, new FakeGm(), () => 1000);
      const initial = engine.newGame(6, 'ep06-부분승계');
      const flags: Record<string, FlagValue> = {
        ...initial.state.flags, ep05_지난밤답변: answer, ep05_지난밤되물음: question,
      };
      const next = await engine.act({ ...initial.state, flags }, { type: 'choose', id: 'ep06_test_continue' });
      const greeting = next.step.events
        .flatMap((event) => event.type === 'line' && event.cg === 'ep06_cg_001' ? [event.text] : []);
      expect(greeting).toEqual([
        ...(answer ? [] : ['덕분에 잘 지냈다마다요.']),
        ...(question ? [] : ['라 쿤께선 지난밤 평안하셨는지요?']),
      ]);
      expect(next.state.beat).toBe('ep06_c003');
    });
  }
});

describe('6화 교정된 공개 정보와 미확정 보존', () => {
  test('도착 보고의 실제 화자는 공유 계약의 미확정 보고자 키에만 연결한다', async () => {
    const { events } = await replay(2);
    const report = events.flatMap((event) => event.type === 'line' && event.speaker === 'ep06_보고자'
      ? [event] : []);
    expect(report.map((line) => [line.display, line.style, line.text]))
      .toEqual([['화면 밖 목소리', 'speech', '쿤이시여, 서기관이 도착했습니다.']]);
    expect(scenario.cast.ep06_보고자?.lore).toBe('ep06_도착보고자');
    expect(scenario.cast.ep06_보고자?.lore).not.toBe(scenario.cast.ep06_나시르?.lore);
  });

  test('미소녀 자칭만 현장 기억이 되고 미확정 풍선의 말을 라나 나시르에게 붙이지 않는다', async () => {
    const { state } = await replay(2);
    const facts = factsAt(state);
    expect(facts.get('flag:ep06_현장_미소녀자칭')).toBe('아시나가 자신을 미소녀라고 말했다.');
    expect(state.flags.ep06_아시나_일방적애첩발언).toBeUndefined();
    expect(state.spoken?.ep06_라).not.toContain('이 상황에서도 입은 살아있군.');
    expect(state.spoken?.ep06_나시르).not.toContain('하아…');
    expect(state.spoken?.ep06_나시르독백).toBeUndefined();
    expect(scenario.cast.ep06_미확정풍선?.lore).toBeUndefined();
    expect(scenario.cast.ep06_독백미확정?.lore).toBeUndefined();
  });

  test('최근 마찰과 북의 기록 설명은 출처가 다르고 우회 권유 거절은 실제 들은 말로 남는다', async () => {
    const { state } = await replay(5);
    const facts = factsAt(state);
    expect(facts.get('flag:ep06_아시나_최근악화'))
      .toBe('나시르는 최근 크라차와 페시안 사이에 마찰이 있었고 분위기가 좋지 않다고 설명했다. 기간은 특정하지 않았다.');
    expect(state.flags.ep06_현장_북의기록설명).toBe(true);
    expect(state.flags.ep06_현장_우회거절).toBe(true);
    expect(facts.get('flag:ep06_아시나_우회권유'))
      .toBe('나시르는 안내인들이 사막을 가로지르지 않고 우회하는 길을 권하지 않았느냐고 물었다. 사막 우회로가 존재한다.');
    expect(facts.has('flag:ep06_아시나_북대륙추정')).toBe(false);
    expect(facts.has('flag:ep06_아시나_자르다경로')).toBe(false);
  });

  test('죄인 취급 이해는 발화지만 길 질문과 탈옥 회상은 자백이 아니다', async () => {
    const { state } = await replay(5);
    expect(state.flags.ep06_현장_죄인취급이해).toBe(true);
    expect(state.flags.ep06_아시나_의심회상).toBe(true);
    expect(state.spoken?.ep06_아시나).toContain('날 그렇게 죄인 취급했던 것도 이해가 가네요.');
    expect(state.spoken?.ep06_아시나).not.toContain('심지어 감옥에서도 탈출하고');
    expect(state.spoken?.ep06_독백).toContain('심지어 감옥에서도 탈출하고');
  });

  test('아름다운 사막 감상만 현장 발화이며 더위 감상과 나시르의 진실 판단은 들은 기억으로 승격하지 않는다', async () => {
    const { state } = await replay(6);
    const facts = factsAt(state);
    expect(state.flags.ep06_현장_사막감상).toBe(true);
    expect(state.flags.ep06_독자_감상진실판단).toBe(true);
    expect(state.spoken?.ep06_아시나).toContain('상상했던 것보다 더 예뻤어요.');
    expect(state.spoken?.ep06_아시나).not.toContain('타는듯한 더위에 녹아 사라져도 좋을 만큼.');
    expect(state.spoken?.ep06_아시나미확정).toContain('타는듯한 더위에 녹아 사라져도 좋을 만큼.');
    expect([...facts.keys()].filter((key) => key.includes('독자_'))).toEqual([]);
    expect([...facts.values()].some((text) => text.includes('타는듯한 더위'))).toBe(false);
    expect(facts.has('flag:ep06_아시나_칭찬')).toBe(false);
    expect(state.ending).toBe('ep06_internal_end');
  });
});
