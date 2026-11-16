import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Engine, type GmContext } from '../src/engine/engine.ts';
import { cgLineProblem, faceProblem, loadScenario } from '../src/engine/scenario.ts';
import type { BeatSpec, Scenario } from '../src/engine/types.ts';
import { loadLore } from '../src/gm/lore.ts';
import { buildSystem } from '../src/gm/prompt.ts';
import { FakeGm, META } from './helpers.ts';

const ep07 = await loadScenario(join(import.meta.dir, '../content/ep07_harem.yaml'));
const ep09 = await loadScenario(join(import.meta.dir, '../content/ep09_palace.yaml'));
const ep04 = await loadScenario(join(import.meta.dir, '../content/ep04_night.yaml'));
const ep03 = await loadScenario(join(import.meta.dir, '../content/ep03_palace.yaml'));
const lore = await loadLore(join(import.meta.dir, '../content/lore_wolheun.yaml'));

function dialogue(id: string, actor: string, cg: string): BeatSpec {
  return {
    id, title: '기억 경계 검증', lines: [],
    choices: [{ id: 'hold', text: '대기', next: id }],
    conversation: {
      situation: '앞선 대화를 기억하는지 확인한다.', goal: '현재 말에 반응한다.',
      speakers: [actor], must_not: [], state_guard: [], echo_only: [],
      talk_fallback: [], deflect: [], cg, next: id,
    },
  };
}

describe('7~9화 정체성과 소지품 승계', () => {
  for (const chapter of [ep07, ep09]) {
    test.each([false, true])(`${chapter.id} 진입은 이전 재고 전체를 보존한다: 전체 소지=%s`, async (allItems) => {
      const gate = 'ep07_09_inventory_gate';
      const scenario: Scenario = {
        ...chapter, start: gate,
        beats: {
          ...chapter.beats,
          [gate]: {
            id: gate, title: '이전 화에서 진입', lines: [],
            choices: [{ id: 'enter', text: '진입', next: chapter.start }],
          },
        },
      };
      const engine = new Engine(scenario, new FakeGm(), () => 1000);
      const initial = engine.newGame(91, '소지품 승계');
      const inherited = allItems ? chapter.sheet.items.map((item) => item.id) : ['earring'];
      const prior = { ...initial.state, items: inherited, flags: { ep03_짐_수중없음: true } };

      const result = await engine.act(prior, { type: 'choose', id: 'enter' });

      expect(result.state.items).toEqual(inherited);
      if (chapter.id === ep07.id) {
        expect(result.state.flags.ep03_짐_수중없음).toBe(false);
        expect(result.state.flags.ep07_짐_부분반환).toBe(true);
      }
    });
  }

  test.each([
    { chapter: ep07, actor: 'ep07_은발남성', prior: 'ep04_behidat', identity: '베히다트', remembers: true, beat: 'ep07_c050', cg: 'ep07_cg_050' },
    { chapter: ep09, actor: 'ep09_장발', prior: 'ep09_대족장', identity: 'ep09_장발대족장', remembers: true, beat: 'ep09_c081', cg: 'ep09_cg_081' },
    { chapter: ep09, actor: 'ep09_대족장', prior: 'ep09_장발', identity: 'ep09_장발대족장', remembers: true, beat: 'ep09_c083', cg: 'ep09_cg_083' },
    { chapter: ep09, actor: 'ep09_동행', prior: 'ep09_대족장', identity: 'ep09_대족장동행', remembers: false, beat: 'ep09_c082', cg: 'ep09_cg_082' },
  ])('$actor의 실제 대화 문맥은 정체성에 따라 기억을 계승한다', async ({ chapter, actor, prior, identity, remembers, beat, cg }) => {
    const before = 'ep07_09_prior_dialogue';
    const unrelated = 'ep07_09_jalil_dialogue';
    const scenario: Scenario = {
      ...chapter, start: beat, cast: { ...ep03.cast, ...ep04.cast, ...chapter.cast },
      beats: {
        ...chapter.beats,
        [before]: dialogue(before, prior, cg),
        [unrelated]: dialogue(unrelated, 'ep03_잘릴', cg),
        [beat]: dialogue(beat, actor, cg),
      },
    };
    const contexts: GmContext[] = [];
    const gm = new FakeGm((ctx) => {
      contexts.push(ctx);
      return { kind: 'clarify', message: '지금 할 말을 확인해 줘.', source: 'rule', meta: META };
    });
    const engine = new Engine(scenario, gm, () => 1000);
    const initial = engine.newGame(91, '인물 기억');
    initial.state.flags.ep04_name_known = true;
    initial.state.log.push({
      kind: 'input', beat: before, text: '제 이름을 기억해 주세요.', result: 'talk',
      approach: null, item: null, source: 'rule', at: 1000, playMs: 0,
    });
    initial.state.log.push({
      kind: 'input', beat: unrelated, text: '잘릴에게만 건넨 말이에요.', result: 'talk',
      approach: null, item: null, source: 'rule', at: 1000, playMs: 0,
    });

    await engine.act(initial.state, { type: 'interject', text: '전에 한 말을 기억하세요?', scene: beat, shown: [], pending: [] });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.state.heard).toEqual(remembers ? [{ text: '제 이름을 기억해 주세요.', action: false }] : []);
    expect(contexts[0]?.scenario.cast[actor]?.lore).toBe(identity);
    expect(contexts[0]?.state.flags.ep04_name_known).toBe(true);
  });

  test.each(['ep07_은발남성', 'ep07_은발남성독백'])('%s는 선언된 반응 표정과 실제 CG만 허용한다', (actor) => {
    const line = Object.values(ep07.beats).flatMap((beat) => beat.lines).find((entry) => entry.speaker === actor);
    if (!line) throw new Error(`배우 대사가 없다: ${actor}`);
    const declared = ep07.cast[actor]?.faces ?? [];
    const required = [...new Set(Object.values(lore.characters.베히다트?.reactions ?? {}).flat().map((entry) => entry.face))];

    expect([...declared].sort()).toEqual(required.sort());
    for (const face of declared) {
      expect(faceProblem(ep07, actor, face)).toBeNull();
      expect(cgLineProblem(ep07, { ...line, face })).toBeNull();
    }
    expect(faceProblem(ep07, actor, '미선언_표정')).not.toBeNull();
    expect(cgLineProblem(ep07, { ...line, cg: '없는_CG' })).not.toBeNull();
    const { cg, ...withoutCg } = line;
    expect(cg).toBeDefined();
    expect(cgLineProblem(ep07, withoutCg)).not.toBeNull();
  });

  test('은발 남성 독백 문맥은 4화에서 공개된 인물의 독백 자료를 사용한다', async () => {
    const actor = 'ep07_은발남성독백';
    const beat = 'ep07_c057';
    const scenario: Scenario = {
      ...ep07, start: beat,
      beats: { ...ep07.beats, [beat]: dialogue(beat, actor, 'ep07_cg_057') },
    };
    const behidat = lore.characters.베히다트;
    if (!behidat) throw new Error('베히다트 로어가 없다');
    // 문구를 고정하지 않고, 구별 가능한 입력 자료가 어느 인물 절로 전달되는지 검사한다.
    const marker = '베히다트_독백_자료_경계';
    const taggedLore = {
      ...lore,
      characters: {
        ...lore.characters,
        베히다트: { ...behidat, samples: { ...behidat.samples, thought: [marker] } },
      },
    };
    const prompts: string[] = [];
    const gm = new FakeGm((ctx) => {
      prompts.push(buildSystem(ctx, taggedLore));
      return { kind: 'clarify', message: '입력을 확인해 줘.', source: 'rule', meta: META };
    });
    const engine = new Engine(scenario, gm, () => 1000);
    const initial = engine.newGame(91, '독백 로어 경계');

    await engine.act(initial.state, { type: 'interject', text: '잠깐만요.', scene: beat, shown: [], pending: [] });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(marker);
  });
});
