import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { activeFacts, Engine } from '../src/engine/engine.ts';
import { checkScenario, loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent, GameState, Scenario } from '../src/engine/types.ts';
import { FakeGm } from './helpers.ts';

const scenario = await loadScenario(join(import.meta.dir, '../content/ep05_audience.yaml'));
const second = await loadScenario(join(import.meta.dir, '../content/ep02_captivity.yaml'));
const source = await Bun.file(join(import.meta.dir, '../../docs/continuation/ep05/script.md')).text();
const sourceCuts = [...source.matchAll(/### (ep05_c\d{3})\n([\s\S]*?)(?=\n### |\n## |$)/g)];
const routes = Array.from({ length: 8 }, (_, route) => route);
const compact = (text: string): string => text.replace(/\s/g, '');

async function play(route: number) {
  const gm = new FakeGm();
  const engine = new Engine(scenario, gm, () => 1000);
  const initial = engine.newGame(51, `ep05-${route}`);
  let state = initial.state;
  const events: GameEvent[] = [...initial.step.events];
  for (const id of [
    route & 1 ? 'ep05_role_rest' : 'ep05_role_original',
    route & 2 ? 'ep05_summons_accept' : 'ep05_summons_original',
    route & 4 ? 'ep05_reply_short' : 'ep05_reply_original',
  ]) {
    const result = await engine.act(state, { type: 'choose', id });
    state = result.state;
    events.push(...result.step.events);
  }
  return { state, initial: initial.state, events, gm };
}

describe('5화 독립 내부 진행', () => {
  test('실제 적재와 검사가 통과하며 정식 소지품 정의와 그림 파일을 사용한다', async () => {
    expect(checkScenario(scenario)).toEqual([]);
    expect(scenario.id).toBe('ep05_audience');
    expect(scenario.id).not.toBe(second.id);
    expect(scenario.sheet.items).toEqual(second.sheet.items);
    for (const asset of Object.values(scenario.cgs)) {
      expect(asset.file).toBeDefined();
      if (!asset.file) throw new Error('그림 파일 경로가 없다');
      expect(await Bun.file(join(import.meta.dir, '../..', asset.file)).exists()).toBe(true);
    }
  });

  test('원작 경로의 실제 발화와 CG가 전사 55컷의 원문 순서를 보존한다', async () => {
    const { events } = await play(0);
    const actual = new Map<string, string[]>();
    const cuts: string[] = [];
    let current = '';
    for (const event of events) {
      if (event.type === 'scene') {
        current = scenario.beats[event.beat]?.cut ?? '';
        if (current && cuts.at(-1) !== current) cuts.push(current);
      }
      if (event.type === 'line') {
        if (current) {
          expect(event.cg).toBe(`ep05_cg_${current.slice(-3)}`);
          actual.set(current, [...(actual.get(current) ?? []), event.text]);
        }
      }
    }
    expect(sourceCuts).toHaveLength(55);
    expect(cuts).toEqual(sourceCuts.flatMap((cut) => cut[1] ? [cut[1]] : []));
    for (const cut of sourceCuts) {
      const id = cut[1];
      const body = cut[2];
      if (!id || !body) throw new Error('전사 컷 구조가 없다');
      const original = body.match(/^- 원문[^\n]*(?:\n  [^\n]*)*/m)?.[0] ?? '';
      const quotes = original.startsWith('- 원문 대사: 없음')
        ? []
        : [...original.matchAll(/“([^”]+)”/g)].map((match) => match[1]);
      const emitted = compact((actual.get(id) ?? []).join(''));
      let cursor = 0;
      for (const quote of quotes) {
        if (!quote) throw new Error('전사 원문이 비어 있다');
        const index = emitted.indexOf(compact(quote), cursor);
        expect(index, `${id}: ${quote}`).toBeGreaterThanOrEqual(cursor);
        cursor = index + compact(quote).length;
      }
    }
  });

  test.each(routes)('내부 선택 조합 %i는 실제 응답만 남기고 판정·비용 없이 끝난다', async (route) => {
    const { state, initial, events, gm } = await play(route);
    expect(state.ending).toBe('ep05_boundary');
    expect(state.items).toEqual(initial.items);
    expect(state.tracks).toEqual(initial.tracks);
    expect(state.rng).toBe(initial.rng);
    expect(events.filter((event) => ['roll', 'price', 'twist', 'items', 'tracks'].includes(event.type))).toEqual([]);
    expect(gm.calls).toEqual([]);
    const lines = events.filter((event) => event.type === 'line');
    expect(lines.some((line) => line.text === '라 쿤께선 지난밤 평안하셨는지요?')).toBe(!(route & 4));
    expect(state.flags.ep05_지난밤되물음).toBe(route & 4 ? undefined : true);
    expect(state.flags.ep05_지난밤답변).toBe(route & 4 ? undefined : true);
    expect(state.flags.ep05_시선답변).toBe(true);
    expect(lines.some((line) => line.text === '그래도 가셔야 합니다…')).toBe(!(route & 2));
    expect(state.flags.ep05_소환응낙).toBe(route & 2 ? true : undefined);
    const nodes = scenario.atlas?.nodes ?? [];
    const traversed = state.log.flatMap((entry) => entry.kind === 'beat'
      ? [nodes.find((node) => node.beats.includes(entry.beat))?.id]
      : []);
    expect(traversed.every((node) => node !== undefined)).toBe(true);
    for (let i = 1; i < traversed.length; i++) {
      if (traversed[i - 1] !== traversed[i]) {
        expect(scenario.atlas?.edges.some(([from, to]) => from === traversed[i - 1] && to === traversed[i])).toBe(true);
      }
    }
  });

  test('실제 진입 전 저장 상태의 짐·변장·이름 지식·잔여 수치를 초기화하지 않는다', async () => {
    const incoming: Scenario = {
      ...scenario,
      start: 'ep05_incoming',
      beats: {
        ...scenario.beats,
        ep05_incoming: {
          id: 'ep05_incoming',
          title: '4화에서 이어가기',
          lines: [],
          choices: [{ id: 'ep05_continue', text: '계속', next: scenario.start }],
        },
      },
    };
    const engine = new Engine(incoming, new FakeGm(), () => 1000);
    const prepared = engine.newGame(5, 'ep05-계승');
    const inherited: GameState = {
      ...prepared.state,
      items: ['earring', 'pin'],
      tracks: { ...prepared.state.tracks, 체력: 2, 정신력: 3, 귀찌: 2, 행운: 1, 의심: 4 },
      flags: {
        ep04_name_heard: true,
        ep04_eye_praise: true,
        짐_미회수: true,
        갈색변장: true,
        선행_실제선택: '거리 요구',
      },
    };
    let result = await engine.act(inherited, { type: 'choose', id: 'ep05_continue' });
    for (const id of ['ep05_role_original', 'ep05_summons_original', 'ep05_reply_short']) {
      result = await engine.act(result.state, { type: 'choose', id });
    }
    expect(result.state.ending).toBe('ep05_boundary');
    expect(result.state.items).toEqual(inherited.items);
    expect(result.state.tracks).toEqual(inherited.tracks);
    for (const [flag, value] of Object.entries(inherited.flags)) {
      expect(result.state.flags[flag]).toBe(value);
    }
  });

  test('소개와 호칭 뜻은 실제 줄 뒤에 열리고 비공개 대화는 아시나 사실에 섞이지 않는다', async () => {
    const gm = new FakeGm();
    const engine = new Engine(scenario, gm, () => 1000);
    const beforeRole = engine.newGame(5, 'ep05-공개');
    expect(beforeRole.state.flags.ep05_아시나_누르소개).toBe(true);
    expect(beforeRole.state.flags.ep05_아시나_시녀물림).toBeUndefined();
    expect(beforeRole.state.flags.ep05_독자_자이드보고).toBeUndefined();
    const beforeSummons = await engine.act(beforeRole.state, { type: 'choose', id: 'ep05_role_original' });
    expect(beforeSummons.state.flags.ep05_아시나_시녀물림).toBe(true);
    expect(beforeSummons.state.flags.ep05_독자_자이드보고).toBe(true);
    expect(beforeSummons.state.flags.ep05_독자_조사의향).toBe(true);
    expect(beforeSummons.state.flags.ep05_아시나_소환전달).toBe(true);
    const known = activeFacts(scenario, beforeSummons.state).map((fact) => fact.text).join('\n');
    expect(known).not.toContain('자이드의 움직임은 평소와 같');
    expect(known).not.toContain('그 여자에 대해 더 알아봐야겠다');
    expect(scenario.facts.filter((fact) => fact.if.includes('ep05_독자_'))).toEqual([]);
    expect(scenario.cast.ep05_남성?.lore).toBe(scenario.cast.ep05_라쿤?.lore);
    expect(scenario.cast.ep05_여성?.lore).toBe(scenario.cast.ep05_누르?.lore);
    expect(scenario.cast.ep05_목소리?.lore).toBeUndefined();
  });

  for (const [beatId, index, flag] of [
    ['ep05_c014', 0, 'ep05_아시나_누르소개'],
    ['ep05_c017', 0, 'ep05_아시나_아이라뜻'],
    ['ep05_c045', 0, 'ep05_아시나_소환전달'],
  ] as const) {
    test(`${beatId}: 공개 줄 전에는 지식이 없고 말한 뒤에만 열린다`, () => {
      const beat = scenario.beats[beatId];
      const disclosed = beat?.lines[index];
      if (!beat || !disclosed) throw new Error('공개 원문 줄이 없다');
      const probe: Scenario = {
        ...scenario,
        start: beatId,
        beats: {
          ...scenario.beats,
          [beatId]: {
            ...beat,
            lines: [
              { speaker: 'ep05_서술', text: '공개 전', if: `flag:${flag}` },
              ...beat.lines.slice(0, index + 1),
              { speaker: 'ep05_서술', text: '공개 후', if: `flag:${flag}` },
            ],
            choices: [{ id: 'ep05_probe_stop', text: '계속', next: 'ep05_boundary' }],
            next: undefined,
          },
        },
      };
      const { step } = new Engine(probe, new FakeGm(), () => 1000).newGame(5, 'ep05-줄공개');
      expect(step.events.filter((event) => event.type === 'line').map((event) => event.text))
        .toEqual([...beat.lines.slice(0, index + 1).map((line) => line.text), '공개 후']);
    });
  }
});
