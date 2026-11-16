import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import type { GmContext, GmLines, Interpretation } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { readSave, writeSave } from '../src/engine/save.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent, GameState, Scenario } from '../src/engine/types.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { APP, FakeGm, LORE_PATH, META, SCENARIO_PATH } from './helpers.ts';

const chapter = await loadScenario(join(APP, 'content/ep03_palace.yaml'));
const campaign = withNotes(await loadCampaignScenario(SCENARIO_PATH), await loadLore(LORE_PATH));
const tracks = { 체력: 1, 정신력: 2, 의심: 5, 집착: 3, 호감: 2, 귀찌: 3, 탈주: 2, 행운: 4 };
const flags = { 후드_벗음: true, 지도_찢김: true, 가방_끈: true, 정신력_충격: true, 플레이어_기억: '모래를 맛봄', 긴장: 5 };
const protest = [
  '말이 돼? 정신 차려! 남자와 여자는 무조건 한 쌍이어야 한다고!',
  '여러 명의 여자랑 놀아나는 곳에 들어온 건데, 어떻게 영광이야!',
  '당신들은 장난감 취급 당하고 있는 거야.',
  '이건 부당한 대우라고! 정신 차려!',
];
const objection = [
  { id: 'ep03_i01_protest', lines: protest, flag: 'ep03_항의_직접', other: 'ep03_시녀가치관_질문' },
  { id: 'ep03_i01_ask', lines: ['남자의 장난감 취급을 받는 게, 어떻게 영광이죠?'], flag: 'ep03_시녀가치관_질문', other: 'ep03_항의_직접' },
] as const;
const question = [
  { id: 'ep03_i02_quiet', lines: ['…근데, 왜 이렇게 조용하죠?', '다른 여자들은 어디 있길래…'], flag: 'ep03_조용한방_질문', other: 'ep03_다른입실자_질문' },
  { id: 'ep03_i02_others', lines: ['이곳에 저 말고 다른 분도 계신가요?'], flag: 'ep03_다른입실자_질문', other: 'ep03_조용한방_질문' },
] as const;

// 입장 직전 선택 하나로 이전 화 상태를 주입한다. 3화 비트는 그대로 실행한다.
function entrance(scenario: Scenario, gm = new FakeGm()) {
  const playable: Scenario = {
    ...scenario,
    start: 'test_ep03_entry',
    beats: {
      ...scenario.beats,
      test_ep03_entry: {
        id: 'test_ep03_entry', title: '3화 직전', lines: [],
        choices: [{ id: 'enter', text: '계속', next: scenario.start }],
      },
    },
  };
  const engine = new Engine(playable, gm, () => 1_000);
  const { state } = engine.newGame(913, 'ep03-regression');
  state.tracks = { ...tracks };
  state.flags = { ...flags };
  state.rng = 731;
  state.items = ['earring', 'pin'];
  state.said = ['물을 아껴 마셨다'];
  state.heard = [{ text: '길을 알려 줘', action: false }];
  return { engine, gm, state, scenario: playable };
}

class PalaceGm extends FakeGm {
  readonly contexts: GmContext[] = [];

  constructor(
    readonly reply?: GmLines,
    reading: Interpretation = { kind: 'talk', to: 'person', source: 'llm', meta: META },
  ) {
    super(() => reading);
  }

  override async interpret(ctx: GmContext): Promise<Interpretation> {
    this.contexts.push(structuredClone(ctx));
    return super.interpret(ctx);
  }

  override async talk(ctx: GmContext): Promise<GmLines> {
    this.calls.push(`talk:${ctx.text}`);
    return this.reply ?? {
      lines: [{
        speaker: 'ep03_시녀',
        text: ctx.beat.id === 'ep03_c049' ? '시녀가 아시나를 돌아보았다.' : '시녀가 잠시 손을 모았다.',
        face: 'neutral',
      }],
      meta: META,
    };
  }
}

async function play(scenario = chapter) {
  const setup = entrance(scenario);
  const turns = [await setup.engine.act(setup.state, { type: 'choose', id: 'enter' })];
  for (let i = 0; i < 2; i += 1) {
    const last = turns.at(-1);
    if (!last || last.step.prompt.type !== 'choices') break;
    const choice = last.step.prompt.options[0];
    if (!choice) break;
    turns.push(await setup.engine.act(last.state, { type: 'choose', id: choice.id }));
  }
  return { ...setup, turns, events: turns.flatMap((turn) => turn.step.events) };
}

function lines(events: readonly GameEvent[]) {
  return events.filter((event) => event.type === 'line');
}

function cutLines(events: readonly GameEvent[]) {
  const cuts = new Map<string, Extract<GameEvent, { type: 'line' }>[]>();
  let cut = '';
  for (const event of events) {
    if (event.type === 'scene') cut = event.beat;
    if (event.type === 'line') {
      const previous = cuts.get(cut) ?? [];
      cuts.set(cut, [...previous, event]);
    }
  }
  return cuts;
}

describe('3화 왕궁의 실제 진행', () => {
  test('현재 캠페인의 두 직접 대화는 이전 장 문맥과 미선택 원문을 재생하지 않고 끝까지 이어진다', async () => {
    const gm = new PalaceGm();
    const { engine, state } = entrance({ ...campaign, start: chapter.start }, gm);
    const entered = await engine.act(state, { type: 'choose', id: 'enter' });
    const first = await engine.act(entered.state, {
      type: 'interject', text: '제 생각도 들어 주세요.', scene: entered.state.beat, shown: [], pending: [],
    });
    expect(first.state.beat).toBe('ep03_c049');
    expect(first.state.free).toBeNull();
    expect(first.state.flags.ep03_금색신발_벗음).toBe(true);
    expect(first.step.events.filter((event) => event.type === 'scene').map((event) => event.beat))
      .toEqual(['ep03_i01_custom_tail', 'ep03_c049']);
    expect(gm.contexts[0]?.beat.id).toBe('ep03_c046');
    expect(gm.contexts[0]?.free.approaches).toEqual([]);
    expect(gm.contexts[0]?.state.heard).toEqual([]);
    expect(gm.contexts[0]?.state.recent).toEqual([]);

    const second = await engine.act(first.state, {
      type: 'interject', text: '(시녀를 바라보며 고개를 기울인다)', scene: first.state.beat, shown: [], pending: [],
    });
    expect(second.state.beat).toBe('ep03_c061');
    expect(second.step.prompt.type).toBe('choices');
    if (second.step.prompt.type !== 'choices') throw new Error('3→4 경계 선택이 없습니다');
    expect(second.step.prompt.options.map((option) => option.id)).toEqual(['continue_ep04']);
    expect(gm.contexts[1]?.beat.id).toBe('ep03_c049');
    expect(gm.contexts[1]?.state.heard).toEqual([{ text: '제 생각도 들어 주세요.', action: false }]);
    const emitted = lines([...first.step.events, ...second.step.events]);
    const unselected = [
      ...objection.flatMap((choice) => choice.lines),
      ...question.flatMap((choice) => choice.lines),
      '무슨 부당한 대우라는 거죠?', '나 혼자라고?',
    ];
    expect(emitted.filter((line) => unselected.includes(line.text))).toEqual([]);
    expect(emitted.filter((line) => line.text === "아가씨께서 하렘의 유일한 '아이라'시니까요.")).toHaveLength(1);
    expect(emitted.filter((line) => line.by === 'gm').map((line) => line.cg))
      .toEqual(['ep03_cg_046', 'ep03_cg_049']);
    expect(second.state.flags.ep03_유일한아이라_앎).toBe(true);
    for (const choice of [...objection, ...question]) expect(second.state.flags[choice.flag]).toBeUndefined();
    expect(second.state.tracks).toEqual(tracks);
    expect(second.state.rng).toBe(731);
    expect(second.state.items).toEqual(['earring', 'pin']);
    expect([...first.step.events, ...second.step.events].filter((event) => event.type === 'roll' || event.type === 'tracks')).toEqual([]);
    expect(gm.calls.filter((call) => call.startsWith('narrate:'))).toEqual([]);
  });

  test.each([
    { lines: [], meta: META },
    { lines: [{ speaker: 'ep03_시녀', text: '실패 대체문', face: 'neutral' }], meta: { ...META, fallback: true } },
  ] satisfies GmLines[])('실제 3화의 무응답·fallback %#은 직접 입력 경로와 기억을 소비하지 않는다', async (reply) => {
    const gm = new PalaceGm(reply);
    const { engine, state } = entrance(chapter, gm);
    const entered = await engine.act(state, { type: 'choose', id: 'enter' });
    const before = structuredClone(entered.state);
    await expect(engine.act(entered.state, {
      type: 'interject', text: '제 생각도 들어 주세요.', scene: entered.state.beat, shown: [], pending: [],
    })).rejects.toThrow('대화 응답을 만들지 못했습니다');
    expect(entered.state).toEqual(before);
    expect(gm.calls.filter((call) => call.startsWith('talk:'))).toHaveLength(1);
  });

  test('실제 3화에서 지속 목표 해석은 판정 없는 몸짓으로 축소하지 않고 선택을 남긴다', async () => {
    const gm = new PalaceGm(undefined, {
      kind: 'improv', target: 'leave_palace', deed: '궁을 빠져나가 고국으로 돌아간다',
      stat: '재치', difficulty: 0, label: '탈출', absurd: false, bold: false, source: 'llm', meta: META,
    });
    const { engine, state } = entrance(chapter, gm);
    const entered = await engine.act(state, { type: 'choose', id: 'enter' });
    const out = await engine.act(entered.state, {
      type: 'interject', text: '(궁을 빠져나가 고국으로 돌아간다)', scene: entered.state.beat, shown: [], pending: [],
    });
    expect(out.state).toEqual(entered.state);
    expect(out.step.prompt.type).toBe('choices');
    expect(out.step.events.some((event) => event.type === 'notice' && event.kind === 'rewrite')).toBe(true);
    expect(gm.calls.filter((call) => call.startsWith('talk:') || call.startsWith('narrate:'))).toEqual([]);
  });

  for (const first of objection) for (const second of question) {
    test(`${first.id} → ${second.id}: 선택 발화를 한 번만 읽고 기억하며 수치와 난수를 보존한다`, async () => {
      const { engine, gm, state } = entrance(chapter);
      const entered = await engine.act(state, { type: 'choose', id: 'enter' });
      const answered = await engine.act(entered.state, { type: 'choose', id: first.id });
      const ended = await engine.act(answered.state, { type: 'choose', id: second.id });

      expect(entered.state.beat).toBe('ep03_c046');
      expect(answered.state.beat).toBe('ep03_c049');
      expect(ended.state.beat).toBe('ep03_c061');
      expect(ended.step.prompt.type).toBe('end');
      expect(lines(answered.step.events).slice(0, first.lines.length + 2).map((line) => line.text))
        .toEqual([...first.lines, '무슨 부당한 대우라는 거죠?', '그분께서 절 장난감으로라도 여겨 주신다면, 그저 기쁠 뿐입니다.']);
      expect(lines(ended.step.events).slice(0, second.lines.length + 4).map((line) => line.text))
        .toEqual([...second.lines, '그야,', "아가씨께서 하렘의 유일한 '아이라'시니까요.", '하렘에…', '나 혼자라고?']);
      const all = [...entered.step.events, ...answered.step.events, ...ended.step.events];
      for (const text of [...first.lines, ...second.lines]) {
        expect(lines(all).filter((line) => line.text === text)).toHaveLength(1);
      }
      for (const turn of [entered, answered, ended]) {
        expect(turn.state.tracks).toEqual(tracks);
        expect(turn.state.rng).toBe(731);
        expect(turn.state.flags).toMatchObject(flags);
        expect(turn.state.items).toEqual(['earring', 'pin']);
        expect(turn.step.events.filter((event) => event.type === 'roll' || event.type === 'tracks')).toEqual([]);
      }
      expect(ended.state.flags[first.flag]).toBe(true);
      expect(ended.state.flags[second.flag]).toBe(true);
      expect(ended.state.flags[first.other]).toBeUndefined();
      expect(ended.state.flags[second.other]).toBeUndefined();
      expect(gm.calls).toEqual([]);
    });
  }

  // 자동 진행은 한 번에 묶이므로 해당 컷의 줄 접두 구간 끝에만 정지점을 둔다.
  for (const reveal of [
    { cut: 'ep03_c040', count: 5, flag: 'ep03_하렘_앎' },
    { cut: 'ep03_c050', count: 2, flag: 'ep03_유일한아이라_앎' },
  ]) {
    test(`${reveal.cut}: 마지막 공개 발화 전의 모든 접두 구간에서는 지식이 잠겨 있다`, async () => {
      const beat = chapter.beats[reveal.cut];
      if (!beat) throw new Error(`공개 장면이 없습니다: ${reveal.cut}`);
      for (let count = 0; count <= reveal.count; count += 1) {
        const prefix: Scenario = {
          ...chapter,
          beats: { ...chapter.beats, [beat.id]: { ...beat, lines: beat.lines.slice(0, count), choices: [] } },
        };
        const { turns } = await play(prefix);
        const reached = turns.at(-1);
        expect(reached?.state.beat).toBe(reveal.cut);
        expect(reached?.state.flags[reveal.flag] === true).toBe(count === reveal.count);
      }
    });
  }

  test('관객만 본 궁정·잘릴 대화는 아시나의 입력 기억이나 지식으로 추가하지 않는다', async () => {
    const { turns } = await play();
    const before = turns[1];
    const after = turns[2];
    if (!before || !after) throw new Error('궁정 전후 진행이 없습니다');
    expect(after.state.said).toEqual(['물을 아껴 마셨다']);
    expect(after.state.heard).toEqual([{ text: '길을 알려 줘', action: false }]);
    expect(after.step.hud.notes).toEqual(before.step.hud.notes);
    expect(after.state.flags.ep03_관객_잘릴접견).toBe(true);
    expect(after.state.flags.ep03_관객_총기소문).toBe(true);
    expect(after.state.flags.잘릴_앎).toBeUndefined();
    expect(after.state.flags.다라_앎).toBeUndefined();
    expect(after.state.flags.남자_정체_앎).toBeUndefined();
  });

  test('짐·은발 삽입에서 획득이나 변장 해제 없이 귀찌와 이전 상태를 보존한다', async () => {
    const { turns, events } = await play();
    const state = turns.at(-1)?.state;
    expect(state?.items).toEqual(['earring', 'pin']);
    expect(state?.tracks).toEqual(tracks);
    expect(state?.flags).toMatchObject({ ...flags, ep03_짐_수중없음: true, ep03_귀찌_변장설명: true });
    expect(events.filter((event) => event.type === 'items' || event.type === 'tracks' || event.type === 'sprite')).toEqual([]);
  });

  test('침실 공개와 소문 뒤 석류 파열만 줄 경계에서 전환하고 나머지 컷의 CG를 유지한다', async () => {
    const { events } = await play();
    const cuts = cutLines(events);
    for (const line of lines(events)) {
      expect(typeof line.cg).toBe('string');
      expect(chapter.cgs[line.cg ?? '']).toBeDefined();
    }
    for (const [id, cut] of cuts) {
      if (id === 'ep03_c040') {
        expect(cut.map((line) => line.cg)).toEqual([
          'ep03_cg_039', 'ep03_cg_039', 'ep03_cg_039', 'ep03_cg_039', 'ep03_cg_040',
        ]);
      } else if (id === 'ep03_c055') {
        expect(cut.map((line) => line.cg)).toEqual([
          'ep03_cg_054', 'ep03_cg_054', 'ep03_cg_054', 'ep03_cg_054', 'ep03_cg_054', 'ep03_cg_055',
        ]);
        expect(cut.at(-1)?.text).toBe('');
      } else {
        expect(new Set(cut.map((line) => line.cg)).size).toBe(1);
      }
    }
    for (const [previous, transition] of [
      ['ep03_c023', 'ep03_c024'],
      ['ep03_c029', 'ep03_c030'],
      ['ep03_c036', 'ep03_c037'],
    ] as const) {
      expect(cuts.get(transition)?.map((line) => ({ text: line.text, cg: line.cg })))
        .toEqual([{ text: '', cg: cuts.get(previous ?? '')?.at(-1)?.cg }]);
    }
  });

  test('두 선택 지점과 결말에서 저장·재개해도 효과와 이전 기억을 다시 적용하지 않는다', async () => {
    const { engine, scenario, turns } = await play();
    const directory = await mkdtemp(join(tmpdir(), 'wolheun-ep03-'));
    try {
      for (const [index, turn] of turns.entries()) {
        await writeSave(directory, `stage-${index}`, scenario, turn.state, 1_000);
        const loaded = await readSave(directory, `stage-${index}`, scenario);
        const before = structuredClone(loaded);
        const resumed = engine.resume(loaded);
        expect(loaded).toEqual(before);
        expect(resumed.events.filter((event) => event.type === 'items' || event.type === 'tracks' || event.type === 'change')).toEqual([]);
        if (turn.step.prompt.type === 'choices') {
          const option = turn.step.prompt.options[0];
          const next = turns[index + 1];
          if (!option || !next) throw new Error('저장 이후 선택 결과가 없습니다');
          const continued = await engine.act(loaded, { type: 'choose', id: option.id });
          expect(continued.state).toEqual(next.state);
          expect(continued.step).toEqual(next.step);
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
