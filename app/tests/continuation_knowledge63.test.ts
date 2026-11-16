import { describe, expect, test } from 'bun:test';
import { Engine, type GmContext } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { withNotes } from '../src/gm/lore.ts';
import { FakeGm, SCENARIO_PATH, loadWolheunLore } from './helpers.ts';

const lore = await loadWolheunLore();
const scenario = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const gm = new LocalGm(null, lore);
const engine = new Engine(scenario, new FakeGm());

describe('후속 지식: 들은 호칭과 본명·신분은 따로 연다', () => {
  test.each([
    ['페시안_앎', '페시안이 어떤 나라예요?'],
    ['감옥_앎', '감옥 밖을 살핀다'],
    ['시하드_호칭', '시하드라고 불러도 돼요?'],
    ['ep03_하렘_앎', '하렘'],
    ['ep04_name_known', '베히다트'],
    ['ep04_ruler_known', '폐하'],
    ['ep04_title_known', '라 쿤'],
  ] as const)('%s 공개 전에는 막고 공개된 뒤 같은 입력은 허용한다', (flag, text) => {
    const { state } = engine.newGame(63, `knowledge-${flag}`);
    const beat = scenario.beats[state.beat];
    if (!beat?.free) throw new Error('첫 자유 입력 장면이 없다');
    const context: GmContext = { scenario, state, beat, free: beat.free, text };
    expect(gm.screen(context)?.reason).toBe('unknown');
    expect(gm.screen({ ...context, state: { ...state, flags: { ...state.flags, [flag]: true } } })).toBeNull();
  });

  test('나라·감옥·호칭을 알아도 남자의 본명과 왕 신분은 공개하지 않는다', () => {
    const { state } = engine.newGame(63, 'knowledge-title');
    state.flags.페시안_앎 = true;
    state.flags.감옥_앎 = true;
    state.flags.시하드_호칭 = true;
    const beat = scenario.beats[state.beat];
    if (!beat?.free) throw new Error('첫 자유 입력 장면이 없다');
    for (const [text, flag] of [
      ['베히다트', 'ep04_name_known'],
      ['폐하', 'ep04_ruler_known'],
      ['사막의 왕', 'ep04_ruler_known'],
      ['라 쿤', 'ep04_title_known'],
    ] as const) {
      const context: GmContext = { scenario, state, beat, free: beat.free, text };
      expect(gm.screen(context)?.reason).toBe('unknown');
      expect(gm.screen({ ...context, state: { ...state, flags: { ...state.flags, [flag]: true } } })).toBeNull();
    }
  });

  test.each([
    'ep03_하렘_앎',
    'ep04_name_known',
    'ep04_ruler_known',
    'ep04_title_known',
    '남자_정체_앎',
    'ep03_관객_잘릴접견',
    'ep03_관객_총기소문',
  ])('%s 하나로 다른 미공개 정보는 열리지 않는다', (flag) => {
    const { state } = engine.newGame(63, `isolated-${flag}`);
    const beat = scenario.beats[state.beat];
    if (!beat?.free) throw new Error('첫 자유 입력 장면이 없다');
    for (const [required, text] of [
      ['ep03_하렘_앎', '하렘'],
      ['ep04_name_known', '베히다트'],
      ['ep04_ruler_known', '폐하'],
      ['ep04_title_known', '라 쿤'],
    ] as const) {
      if (required === flag) continue;
      const context: GmContext = {
        scenario, state: { ...state, flags: { ...state.flags, [flag]: true } },
        beat, free: beat.free, text,
      };
      expect(gm.screen(context)?.reason).toBe('unknown');
    }
  });
});
