import { describe, expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import { connectContinuation, resumeCampaign } from '../src/engine/continuation.ts';
import { checkScenario, loadScenario } from '../src/engine/scenario.ts';
import type { ViewpointObservation } from '../src/engine/types.ts';
import { FakeGm } from './helpers.ts';

const scenario = await loadScenario(`${import.meta.dir}/../content/ep08_harem.yaml`);
const captivity = await loadScenario(`${import.meta.dir}/../content/ep02_captivity.yaml`);

describe('8화 독립 내부 시나리오', () => {
  test('실제 로더와 시나리오 검사를 통과한다', () => {
    expect(checkScenario(scenario)).toEqual([]);
  });

  test('2화 시트 카탈로그와 동일하며 실제 연결·재개 시 기존 물품과 수치를 보존한다', async () => {
    expect(scenario.sheet).toEqual(captivity.sheet);
    const desert = await loadScenario(`${import.meta.dir}/../content/ep01_desert.yaml`);
    const connected = connectContinuation(desert, scenario);
    expect(connected.sheet).toEqual(desert.sheet);
    const gm = new FakeGm();
    const engine = new Engine(connected, gm);
    // 연결 함수 계약 검증용 저장 상태다. 실제 7→8화 플레이 연결을 뜻하지 않는다.
    const { state } = new Engine(desert, gm).newGame(8, 'ep08-bridge');
    const saved = {
      ...state,
      beat: 'e_survivor',
      ending: 'survivor',
      items: ['earring'],
      tracks: { ...state.tracks, 체력: 2, 귀찌: 3 },
      flags: { ...state.flags, 기존_기억: true },
    };
    const result = await resumeCampaign(engine, saved);
    expect(result.continued).toBe(true);
    expect(result.state.beat).toBe('ep08_c024');
    expect(result.state.items).toEqual(saved.items);
    expect(result.state.tracks).toEqual(saved.tracks);
    expect(result.state.abilities).toEqual(saved.abilities);
    expect(result.state.flags['기존_기억']).toBe(true);
    expect(saved.ending).toBe('survivor');
    expect(gm.calls).toEqual([]);
  });

  test.each([
    ['ask', 'quiet'],
    ['home', 'tell'],
  ])('질문 %s와 확인 %s는 판정 없이 원작 순서로 끝까지 진행한다', async (question, approach) => {
    const gm = new FakeGm();
    const engine = new Engine(scenario, gm);
    const initial = engine.newGame(8, 'ep08-test');
    expect(initial.state.beat).toBe('ep08_c024');
    expect(initial.state.scenario).toBe('ep08_harem');
    expect(initial.state.items).toEqual(captivity.sheet.items.map((item) => item.id));
    const observations: ViewpointObservation[] = [];
    const middle = await engine.act(initial.state, { type: 'choose', id: `ep08_c024_${question}` }, undefined, {
      observer: (observation) => { observations.push(observation); },
    });
    expect(middle.state.beat).toBe('ep08_c057');
    expect(middle.state.flags[`ep08_c024_${question}`]).toBe(true);
    expect(middle.state.flags[`ep08_c024_${question === 'ask' ? 'home' : 'ask'}`]).not.toBe(true);
    const spoken = middle.step.events.filter((event) => event.type === 'line');
    const questionLines = spoken.filter((line) => line.cg === 'ep08_cg_024' || line.cg === 'ep08_cg_025');
    expect(questionLines.map((line) => [line.speaker, line.text, line.cg])).toEqual(
      question === 'ask'
        ? [
          ['ep08_아시나', '하렘은 왜 이렇게 큰 걸까?', 'ep08_cg_025'],
          ['ep08_아시나', '누르는 그 이유를 알아?', 'ep08_cg_025'],
        ]
        : [['ep08_아시나', '여기에는 어떤 사람들이 살아?', 'ep08_cg_024']],
    );
    expect(middle.state.flags['말함_ep08_c025'] === true).toBe(question === 'ask');
    expect(spoken.filter((line) => line.cg === 'ep08_cg_026' || line.cg === 'ep08_cg_027')
      .map((line) => [line.speaker, line.text, line.cg])).toEqual([
      ['ep08_누르', '보통 하렘은 집의 안주인들이 사는 곳입니다.', 'ep08_cg_026'],
      ['ep08_누르', '다만 궁정의 하렘은 쿤의 여인들뿐만 아니라 연고 없는 어린 소녀까지 데려와 키우기도 하기 때문에 훨씬 넓은 거지요.', 'ep08_cg_026'],
      ['ep08_아시나', '설마… 자라면 쿤이 첩 삼는 거야?', 'ep08_cg_027'],
      ['ep08_누르', '그런 경우도 있지만…', 'ep08_cg_027'],
      ['ep08_누르', '보통은 쿤께서 페시안 주요 인사들의 부인으로 보내십니다.', 'ep08_cg_027'],
    ]);
    expect(initial.state.flags.ep08_r07).not.toBe(true);
    expect(initial.state.flags.ep08_r10).not.toBe(true);
    expect(observations.filter((observation) => observation.state.beat === 'ep08_c026')
      .map((observation) => [observation.event.type, observation.state.flags.ep08_r07 === true])).toEqual([
      ['scene', false], ['line', false], ['line', true],
    ]);
    expect(observations.filter((observation) => observation.state.beat === 'ep08_c034')
      .map((observation) => [observation.event.type, observation.state.flags.ep08_r10 === true])).toEqual([
      ['scene', false], ['line', true],
    ]);
    const final = await engine.act(middle.state, { type: 'choose', id: `ep08_c057_${approach}` });
    expect(final.state.ending).toBe('ep08_boundary');
    expect(final.state.flags[`ep08_c057_${approach}`]).toBe(true);
    expect(final.state.tracks).toEqual(initial.state.tracks);
    expect(final.state.rng).toBe(initial.state.rng);
    expect(final.state.items).toEqual(initial.state.items);
    expect(gm.calls).toEqual([]);
    const events = [...initial.step.events, ...middle.step.events, ...final.step.events];
    expect(events.some((e) => e.type === 'roll')).toBe(false);
    expect(final.state.log.filter((e) => e.kind === 'beat').map((e) => e.beat)).toEqual(
      [
        'ep08_c001', 'ep08_c002', 'ep08_c002_audience',
        ...Array.from({ length: 60 }, (_, i) => `ep08_c${String(i + 3).padStart(3, '0')}`)
          .filter((beat) => question === 'ask' || beat !== 'ep08_c025'),
      ],
    );
    const speech = events.filter((e) => e.type === 'line');
    expect(speech.find((l) => l.text === '……' && l.cg === 'ep08_cg_012')?.speaker).toBe('ep08_미확정');
    expect(speech.filter((l) => l.cg === 'ep08_cg_038').some((l) => l.text.includes('아슈마에'))).toBe(true);
    expect(speech.filter((l) => l.cg === 'ep08_cg_039').some((l) => l.text.includes('이슈마에'))).toBe(true);
    expect(speech.at(-1)?.text).toBe('당신은 하렘 밖에 있어야 하잖아요?');
  });
});
