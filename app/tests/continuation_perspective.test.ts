import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { loadScenario, parseScenario } from '../src/engine/scenario.ts';
import { APP, SCENARIO_PATH } from './helpers.ts';

function declaration(perspective?: unknown) {
  return {
    id: 'perspective_test', title: '시점', episode: '시험', source: '선언 경계', rating: '15세 이용가', start: 'first',
    sheet: {
      name: '아시나', abilities: { 재치: 1, 손재주: 1, 매력: 1, 근력: 0, 교양: 1 },
      tracks: { 체력: 4, 정신력: 4, 의심: 0, 집착: 0, 호감: 0, 귀찌: 7, 탈주: 0, 행운: 6 }, items: [],
    },
    cast: { 나레이션: { display: '', style: 'narration' } },
    backgrounds: {}, sprites: {}, cgs: {},
    beats: {
      first: {
        title: '화면', perspective, cast: { left: null, center: null, right: null },
        lines: [{ 나레이션: '두 사람이 복도에서 이야기를 나눈다.' }],
        choices: [{ id: 'continue', text: '계속', next: 'end' }],
      },
      end: { title: '끝', lines: [], ending: { id: 'done', title: '끝', summary: '종료.', next_hook: '다음 장면.' } },
    },
  };
}

describe('명시적 관객 시점 선언', () => {
  test('관객 표시와 장 통과 선택을 파싱하고 다음 비트로 추정 전파하지 않는다', () => {
    const scenario = parseScenario(JSON.stringify(declaration('audience')));
    expect(scenario.beats.first?.perspective).toBe('audience');
    expect(scenario.beats.first?.choices?.[0]?.next).toBe('end');
    expect(scenario.beats.end?.perspective).toBeUndefined();
  });

  test('주인공이 슬롯에 없어도 미선언 장면은 관객으로 추정하지 않는다', () => {
    expect(parseScenario(JSON.stringify(declaration())).beats.first?.perspective).toBeUndefined();
  });

  test.each(['player', 'omniscient', '', null, 1, true, {}, []].map((value) => ({ value })))('지원하지 않는 시점 %p를 경계에서 거절한다', ({ value }) => {
    expect(() => parseScenario(JSON.stringify(declaration(value)))).toThrow(/perspective/);
  });

  test('실제 2화 궁정 관객 표시가 장 합성 뒤에도 유지된다', async () => {
    const scenario = await loadCampaignScenario(SCENARIO_PATH);
    for (const id of ['ep02_palace', 'ep02_proposal', 'ep02_suspicion', 'ep02_court_boundary']) {
      expect(scenario.beats[id]?.perspective).toBe('audience');
    }
    expect(scenario.beats.ep02_unlock?.perspective).toBeUndefined();
    expect(scenario.beats.ep02_court_boundary?.choices?.[0]?.id).toBe('continue_ep03');
  });

  test('6화 소유 YAML의 실제 관객 표시를 누락시키지 않는다', async () => {
    const path = join(APP, 'content/ep06_library.yaml');
    const raw = Bun.YAML.parse(await Bun.file(path).text());
    if (typeof raw !== 'object' || raw === null || !('beats' in raw) || typeof raw.beats !== 'object' || raw.beats === null) throw new Error('6화 대본 형식 오류');
    const scenario = await loadScenario(path);
    const declared = Object.entries(raw.beats).filter(([, beat]) => (
      typeof beat === 'object' && beat !== null && 'perspective' in beat && beat.perspective === 'audience'
    )).map(([id]) => id);
    expect(declared.length).toBeGreaterThan(0);
    for (const id of declared) expect(scenario.beats[id]?.perspective).toBe('audience');
  });
});
