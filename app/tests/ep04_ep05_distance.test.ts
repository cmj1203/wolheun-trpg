import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { activeFacts, Engine } from '../src/engine/engine.ts';
import { checkScenario, loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent, GameState, Scenario } from '../src/engine/types.ts';
import { FakeGm, META } from './helpers.ts';

const fourth = await loadScenario(join(import.meta.dir, '../content/ep04_night.yaml'));
const fifth = await loadScenario(join(import.meta.dir, '../content/ep05_audience.yaml'));

// 공유 캠페인은 아직 3화까지만 연결한다. 이 입력 호스트는 실제 4화 종료 상태를
// 5화의 공개 start에 넘긴다. 캠페인 합성·옛 저장 변환의 구현을 대신하지 않는다.
const entryHost: Scenario = {
  ...fifth,
  start: 'ep05_test_incoming',
  beats: {
    ...fifth.beats,
    ep05_test_incoming: {
      id: 'ep05_test_incoming',
      title: '4화 종료 상태 인계',
      lines: [],
      choices: [{ id: 'continue_ep05', text: '계속', next: fifth.start }],
    },
  },
};

async function finishFourth(seed: number, distance: boolean) {
  const engine = new Engine(fourth, new FakeGm(() => ({ kind: 'idle', source: 'rule', meta: META })));
  let result = engine.newGame(seed, `거리-경계-${seed}`);
  result.state.items = ['earring', 'pin'];
  result.state.tracks.귀찌 = 3;
  result = await engine.act(result.state, { type: 'choose', id: 'guards' });
  result = await engine.act(result.state, { type: 'free', text: '(가만히 기다린다)' });
  result = await engine.act(result.state, { type: 'choose', id: 'conceal' });
  result = await engine.act(result.state, { type: 'choose', id: distance ? 'distance' : 'retort' });
  if (distance) result = await engine.act(result.state, { type: 'approach', id: 'ep04_keep_distance' });
  return result;
}

async function enterFifth(saved: GameState) {
  const engine = new Engine(entryHost, new FakeGm());
  const opened = structuredClone(saved);
  opened.beat = entryHost.start;
  opened.ending = null;
  const entry = await engine.act(opened, { type: 'choose', id: 'continue_ep05' });
  let result = entry;
  const events: GameEvent[] = [...entry.step.events];
  for (const id of ['ep05_role_original', 'ep05_summons_original', 'ep05_reply_short']) {
    result = await engine.act(result.state, { type: 'choose', id });
    events.push(...result.step.events);
  }
  return { ...result, entry, events };
}

describe('4화에서 이룬 거리와 거절을 5화가 취소하지 않는다', () => {
  test.each([{ seed: 1, tier: 'mixed' }, { seed: 2, tier: 'hit' }])(
    '$tier 성공의 실제 대사·그림·기억·비용을 화 경계 뒤에도 보존한다',
    async ({ seed, tier }) => {
      const previous = await finishFourth(seed, true);
      expect(previous.state.log.find((entry) => entry.kind === 'check')?.roll.tier).toBe(tier);
      expect(previous.state.ending).toBe('ep04_distance_boundary');
      expect(previous.state.flags.ep04_distance_kept).toBe(true);
      expect(previous.state.spoken?.ep04_asina).toContain('…거기 있어요.');
      expect(previous.state.log.filter((entry) => entry.kind === 'price')).toHaveLength(tier === 'mixed' ? 1 : 0);

      const result = await enterFifth(previous.state);
      const lines = result.events.filter((event) => event.type === 'line');
      const scenes = result.events.filter((event) => event.type === 'scene').map((event) => event.beat);
      expect(scenes).toContain('ep05_c010');
      expect(scenes).not.toContain('ep05_c001');
      expect(lines.some((line) => /입을 맞추|입술이 맞닿|첫 키스|놔앗/.test(line.text))).toBe(false);
      expect(lines.some((line) => line.text.includes('문 앞에 선 채'))).toBe(true);
      const forbidden = new Set([
        ...Array.from({ length: 9 }, (_, index) => `ep05_cg_${String(index + 1).padStart(3, '0')}`),
        'ep05_cg_032', 'ep05_cg_034', 'ep05_cg_052',
      ]);
      expect(lines.filter((line) => line.cg && forbidden.has(line.cg))).toEqual([]);
      expect(lines.some((line) => line.text === '하렘에서 하룻밤은, 잘 보냈는가?')).toBe(true);
      expect(result.state.ending).toBe('ep05_boundary');
      expect(result.state.flags.ep04_distance_kept).toBe(true);
      expect(result.state.flags.ep05_독자_첫입맞춤).toBeUndefined();
      expect(result.state.flags.ep05_아시나_하렘선언).toBeUndefined();
      expect(result.state.flags.ep05_아시나_라쿤회고).toBe(true);
      expect(result.state.spoken?.ep04_asina).toEqual(previous.state.spoken?.ep04_asina);
      expect(Object.values(result.state.spoken ?? {}).flat().some((text) => /첫 키스|입술이 맞닿/.test(text))).toBe(false);
      expect(result.state.heard).toEqual(previous.state.heard);
      expect(result.state.said).toEqual(previous.state.said);
      expect(result.state.items).toEqual(previous.state.items);
      expect(result.state.tracks).toEqual(previous.state.tracks);
      expect(result.state.abilities).toEqual(previous.state.abilities);
      expect(result.state.rng).toBe(previous.state.rng);
      for (const flag of ['ep04_name_known', 'ep04_ruler_known', 'ep04_title_known', 'ep04_origin_private', 'ep04_eye_praise']) {
        expect(previous.state.flags[flag]).toBe(true);
        expect(result.state.flags[flag]).toBe(true);
      }
      expect(result.events.filter((event) => ['roll', 'price', 'tracks', 'items'].includes(event.type))).toEqual([]);
      const facts = activeFacts(fifth, result.state).map((fact) => fact.text).join('\n');
      expect(facts).toContain('손이 닿지 않는 거리');
      expect(facts).not.toContain('자이드의 움직임');
      expect(facts).not.toContain('그 여자에 대해 더 알아');
      expect(result.state.spoken?.ep05_라쿤?.some((text) => /크롬웰 출신|첫 키스/.test(text))).not.toBe(true);
    },
  );

  test('성취가 없는 원작 경로와 거리 확보 실패는 원문 입맞춤과 첫 입맞춤 기억을 유지한다', async () => {
    for (const distance of [false, true]) {
      const previous = await finishFourth(5, distance);
      expect(previous.state.ending).toBe('ep04_boundary');
      expect(previous.state.flags.ep04_distance_kept).toBeUndefined();
      const result = await enterFifth(previous.state);
      const lines = result.events.filter((event) => event.type === 'line');
      expect(lines.some((line) => line.cg === 'ep05_cg_001' && line.text.includes('입을 맞추고'))).toBe(true);
      expect(lines.some((line) => line.text === '나… 첫 키스였는데.' && line.cg === 'ep05_cg_034')).toBe(true);
      expect(result.state.flags.ep05_독자_첫입맞춤).toBe(true);
      expect(result.state.flags.ep05_아시나_하렘선언).toBe(true);
      expect(result.state.flags.ep04_distance_kept).toBeUndefined();
    }
  });

  test('목표 확인 거절은 진행·판정·동의가 아니며 뒤에 실제로 확보한 거리를 취소하지 않는다', async () => {
    const gm = new FakeGm(() => ({
      kind: 'clarify',
      message: '손이 닿지 않는 거리를 확보하려는 건가?',
      proposal: {
        stat: '매력', difficulty: 0, label: '거리 확보', absurd: false, bold: false,
        deed: '손을 들어 다가오지 말라고 요구한다.', target: 'ep04_keep_distance',
        source: 'llm', meta: META,
      },
      source: 'llm', meta: META,
    }));
    const engine = new Engine({ ...fourth, start: 'ep04_distance_free' }, gm);
    const before = engine.newGame(2, '거리-확인거절');
    const question = await engine.act(before.state, { type: 'free', text: '(몸을 뒤로 뺀다)' });
    expect(question.step.events.some((event) => event.type === 'confirm' && event.kind === 'intent')).toBe(true);
    const declined = await engine.act(question.state, { type: 'confirm', ok: false });
    expect(declined.state.beat).toBe('ep04_distance_free');
    expect(declined.state.ending).toBeNull();
    expect(declined.state.pendingIntent).toBeUndefined();
    expect(declined.state.flags).toEqual(before.state.flags);
    expect(declined.state.tracks).toEqual(before.state.tracks);
    expect(declined.state.rng).toBe(before.state.rng);
    expect(declined.state.heard).toEqual(before.state.heard);
    expect(declined.state.spoken).toEqual(before.state.spoken);
    expect(declined.state.log).toEqual(before.state.log);
    const achieved = await engine.act(declined.state, { type: 'approach', id: 'ep04_keep_distance' });
    expect(achieved.state.ending).toBe('ep04_distance_boundary');
    const result = await enterFifth(achieved.state);
    expect(result.state.flags.ep04_distance_kept).toBe(true);
    expect(result.state.spoken?.ep04_asina).toContain('…거기 있어요.');
    expect(result.state.flags.ep05_독자_첫입맞춤).toBeUndefined();
    expect(result.events.filter((event) => event.type === 'scene').map((event) => event.beat)).not.toContain('ep05_c001');
  });

  test('두 화의 목표·가격·장 지도·얼굴을 엄격한 시나리오 검사로 읽는다', () => {
    expect(checkScenario(fourth)).toEqual([]);
    expect(checkScenario(fifth)).toEqual([]);
  });
});
