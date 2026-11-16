import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { checkScenario, loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent, GameState } from '../src/engine/types.ts';
import { FakeGm } from './helpers.ts';

const scenario = await loadScenario(join(import.meta.dir, '../content/ep06_library.yaml'));
const second = await loadScenario(join(import.meta.dir, '../content/ep02_captivity.yaml'));
const decisions = [
  'ep06_decline', 'ep06_purpose', 'ep06_origin',
  'ep06_question', 'ep06_politics', 'ep06_travel',
] as const;

describe('6화 독립 내부 진행', () => {
  test('독립 적재가 통과하고 2화의 소지품 정의를 그대로 사용한다', () => {
    expect(checkScenario(scenario)).toEqual([]);
    expect(scenario.sheet.items).toEqual(second.sheet.items);
    expect(scenario.id).toBe('ep06_library');
  });

  for (let route = 0; route < 64; route++) {
    test(`태도 선택 조합 ${route}: 원작 순서와 상태를 보존해 도서실에서 끝난다`, async () => {
      const gm = new FakeGm();
      const engine = new Engine(scenario, gm, () => 1000);
      const initial = engine.newGame(6, `ep06-${route}`);
      let state = initial.state;
      const events: GameEvent[] = [...initial.step.events];
      const chosen: string[] = [];
      for (const [index, decision] of decisions.entries()) {
        const id = `${decision}_${route & (1 << index) ? 'pause' : 'direct'}`;
        chosen.push(id);
        const result = await engine.act(state, { type: 'choose', id });
        state = result.state;
        events.push(...result.step.events);
      }

      expect(state.beat).toBe('ep06_c065');
      expect(state.ending).toBe('ep06_internal_end');
      expect(state.items).toEqual(initial.state.items);
      expect(state.tracks).toEqual(initial.state.tracks);
      expect(events.filter((event) => event.type === 'roll')).toEqual([]);
      expect(gm.calls).toEqual([]);
      const visited = state.log.flatMap((entry) => entry.kind === 'beat' ? [entry.beat] : []);
      const originalCuts = visited.filter((id) => /^ep06_c\d{3}$/.test(id));
      expect(originalCuts).toEqual(
        Array.from({ length: 65 }, (_, i) => `ep06_c${String(i + 1).padStart(3, '0')}`),
      );
      for (const id of chosen) {
        if (id.endsWith('_pause')) expect(visited).toContain(id);
      }
      const nodes = scenario.atlas?.nodes ?? [];
      const routeNodes = visited.map((beat) => nodes.find((node) => node.beats.includes(beat))?.id);
      expect(routeNodes.every((node) => node !== undefined)).toBe(true);
      for (let i = 1; i < routeNodes.length; i++) {
        if (routeNodes[i - 1] !== routeNodes[i]) {
          expect(scenario.atlas?.edges.some(
            ([from, to]) => from === routeNodes[i - 1] && to === routeNodes[i],
          )).toBe(true);
        }
      }
      const lines = events.filter((event) => event.type === 'line');
      const beforeDesertName = lines.findIndex((line) => line.text.startsWith('고작 그딴 이유'));
      expect(beforeDesertName).toBeGreaterThan(0);
      expect(lines[beforeDesertName - 1]?.text).toBe('말도 안 되는 소리.');
      const afterGreeting = lines.findIndex((line) => line.text === '옷을 갈아입으시니 몰라보겠습니다.');
      expect(afterGreeting).toBeGreaterThan(0);
      expect(lines[afterGreeting + 1]?.text)
        .toBe('아주 어여쁘시네요. 라 쿤께서는 좋으시겠습니다.');
      expect(lines[afterGreeting + 1]?.cg).toBe(lines[afterGreeting]?.cg);
      expect(lines.every((line) => line.cg !== undefined)).toBe(true);
      expect(lines.find((line) => line.text === '부르셔서 왔습니다만, 되돌아갈까요?')?.display)
        .toBe('푸른 머리 남자');
    });
  }

  test('이미 소지품이 없고 수치가 달라진 저장 상태도 초기화하지 않는다', async () => {
    const engine = new Engine(scenario, new FakeGm(), () => 1000);
    const initial = engine.newGame(6, 'ep06-승계검사');
    const inherited: GameState = {
      ...initial.state,
      items: [],
      tracks: { ...initial.state.tracks, 체력: 2, 정신력: 1, 귀찌: 2, 행운: 3 },
      flags: { ...initial.state.flags, 선행_알던사실: true },
    };
    let state = inherited;
    for (const decision of decisions) {
      const result = await engine.act(state, { type: 'choose', id: `${decision}_direct` });
      state = result.state;
    }
    expect(state.ending).toBe('ep06_internal_end');
    expect(state.items).toEqual([]);
    expect(state.tracks).toEqual(inherited.tracks);
    expect(state.flags.선행_알던사실).toBe(true);
  });

  test('공개 시점에서 들은 사실만 아시나 지식으로 열리고 밀명은 독자 정보로 남는다', async () => {
    const engine = new Engine(scenario, new FakeGm(), () => 1000);
    const start = engine.newGame(6, 'ep06-지식');
    expect(start.state.flags.ep06_아시나_나시르소개).toBeUndefined();
    const purpose = await engine.act(start.state, { type: 'choose', id: 'ep06_decline_direct' });
    expect(purpose.state.flags.ep06_독자_귀족추측).toBe(true);
    expect(purpose.state.flags.ep06_아시나_죽음의사막).toBeUndefined();
    const origin = await engine.act(purpose.state, { type: 'choose', id: 'ep06_purpose_direct' });
    expect(origin.state.flags.ep06_아시나_나시르소개).toBe(true);
    expect(origin.state.flags.ep06_독자_조사명령).toBe(true);
    expect(origin.state.flags.ep06_독자_시하드호칭).toBe(true);
    expect(origin.state.flags.ep06_아시나_현재적대).toBeUndefined();
    const question = await engine.act(origin.state, { type: 'choose', id: 'ep06_origin_direct' });
    expect(question.state.flags.ep06_아시나_경유경로).toBe(true);
    expect(question.state.flags.ep06_아시나_자르다이름).toBeUndefined();
    const politics = await engine.act(question.state, { type: 'choose', id: 'ep06_question_direct' });
    expect(politics.state.flags.ep06_아시나_자르다이름).toBe(true);
    expect(politics.state.flags.ep06_아시나_현재적대).toBe(true);
    expect(politics.state.flags.ep06_아시나_최근악화).toBeUndefined();
    const travel = await engine.act(politics.state, { type: 'choose', id: 'ep06_politics_direct' });
    expect(travel.state.flags.ep06_아시나_최근악화).toBe(true);
    const end = await engine.act(travel.state, { type: 'choose', id: 'ep06_travel_direct' });
    expect(end.state.flags.ep06_독자_나시르경험).toBe(true);
    expect(end.state.flags.ep06_독자_잠정이해).toBe(true);
    expect(scenario.facts.filter((fact) => fact.if.includes('ep06_독자_'))).toEqual([]);
    expect(scenario.cast.ep06_라?.lore).toBe(scenario.cast.ep06_라독백?.lore);
    expect(scenario.cast.ep06_청발?.lore).toBe(scenario.cast.ep06_나시르?.lore);
  });
});
