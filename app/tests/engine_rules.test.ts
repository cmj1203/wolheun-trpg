import { describe, expect, test } from 'bun:test';
import { Engine, noteOpen, MAX_INPUT_CHARS, type Interpretation } from '../src/engine/engine.ts';
import { rollD6 } from '../src/engine/dice.ts';
import { parseScenario } from '../src/engine/scenario.ts';
import { GameError, type Action, type GameEvent, type GameState, type NoteEntry, type Scenario } from '../src/engine/types.ts';
import { FakeGm, META, approachOf, fakeClock } from './helpers.ts';

// 규칙만 보는 작은 시나리오. 주사위는 state.rng 를 골라 눈을 정한다(능력치는 모두 0).
const outcomes = (extra = '') => `
            hit: { gist: 된다, lines: [ { 나레이션: 됐다. } ]${extra} }
            mixed: { gist: 조금 된다, lines: [ { 나레이션: 조금 됐다. } ]${extra} }
            miss: { gist: 안 된다, lines: [ { 나레이션: 안 됐다. } ]${extra} }`;

const freeBlock = (opts: { patience?: number; press?: string; turns?: number; until?: string; prices?: string; approaches: string; next: string }) => `
    free:
      prompt: 무엇을 할까.
      situation: 시험.
      goal: 시험.
      speakers: [나레이션]
      must_not: []
      state_guard: []
      patience: ${opts.patience ?? 3}
      talk_fallback: [ { 나레이션: 조용하다. } ]
      press: ${opts.press ?? '[ { 나레이션: 발소리가 다가온다. } ]'}
      deflect: [ { 나레이션: 그건 안 된다. } ]
      improv:${outcomes()}
      turns: ${opts.turns ?? 5}
${opts.until ? `      until: "${opts.until}"\n` : ''}${opts.prices ? `      prices:\n${opts.prices}` : ''}      default_approach: watch
      approaches:
        - id: watch
          label: 둘러본다
          stat: 재치
          hint: 주위를 본다
          examples: []
          keywords: [관찰]
          outcomes:${outcomes()}
${opts.approaches}
      next: ${opts.next}`;

const LAB_YAML = `
id: rules_test
title: 규칙 시험
episode: 시험
source: 단위 테스트
rating: 15세 이용가
start: hub
sheet:
  name: 아시나
  abilities: { 재치: 0, 손재주: 0, 매력: 0, 체력: 0, 교양: 0 }
  tracks: { 의심: 0, 집착: 0, 호감: 0, 귀찌: 5, 탈주: 0, 행운: 3 }
  items:
    - { id: pin, name: 가는 핀, desc: 자물쇠를 딸 수 있는 핀 }
    - { id: rope, name: 밧줄, desc: 튼튼한 밧줄 }
    - { id: seal, name: 봉인 편지, desc: 아직 모르는 편지, hidden: true }
cast:
  나레이션: { display: "", style: narration }
  여우: { display: 여우, style: gm }
backgrounds: { room: { label: 방, placeholder: blackout } }
sprites: {}
cgs:
  c_plain: { label: 칼, file: a.png, alt: { if: "flag:후드", id: c_hood } }
  c_hood: { label: 칼(후드), file: b.png }
foreshadow:
  - { id: f_pin, at: hub, words: [핀], beats: [cell] }
council: [plan]
refuse:
  - id: unmask
    words: [후드를 벗]
    unless: []
    lines: [ { 나레이션: 손이 멈췄다. } ]
fates:
  - { id: f_sus, when: "의심 >= 10", to: bad }
beats:
  hub:
    title: 갈림길
    bg: room
    lines:
      - 나레이션: 갈림길이다.
      - 나레이션: 칼날이 번뜩인다.
        cg: c_plain
    choices:
      - { id: clamp, text: 크게 흔든다, effects: { 호감: 15, 귀찌: -20, gain: [pin] }, next: hub }
      - { id: hood, text: 후드를 쓴다, effects: { flags: { 후드: true } }, next: hub }
      - { id: win, text: 끝까지 버틴다, effects: { 의심: 10 }, next: good }
      - id: modroll
        text: 재 본다
        check:
          stat: 재치
          label: 재 보기
          mods:
            - { if: "flag:없는것", value: 3, label: 거짓 보정 }
            - { if: "!flag:없는것", value: 1, label: 참 보정 }
        outcomes:
          hit: { lines: [ { 나레이션: 됐다. } ], next: side }
          mixed: { lines: [ { 나레이션: 조금 됐다. } ], next: side }
          miss: { lines: [ { 나레이션: 안 됐다. } ], next: side }
        next: hub
      - { id: to_cell, text: 감방, next: cell }
      - { id: to_plan, text: 작전, next: plan }
      - { id: to_luck, text: 행운, next: luck }
      - { id: to_rush, text: 서두름, next: rush }
      - { id: to_loop, text: 되풀이, next: loop }
      - { id: to_price, text: 대가, next: price }
      - { id: to_press, text: 압박, next: press }
      - { id: to_used, text: 쓴 대가, next: used }
      - { id: to_move, text: 무브, next: move }
  side:
    title: 옆길
    lines: [ { 나레이션: 옆길이다. } ]
    choices:
      - { id: back, text: 돌아간다, next: hub }
  cell:
    title: 감방
    lines: [ { 나레이션: 감방이다. } ]
${freeBlock({
  approaches: `        - id: pick
          label: 자물쇠를 딴다
          stat: 손재주
          item: pin
          hint: 핀을 쓴다
          examples: []
          keywords: [딴다]
          outcomes:${outcomes()}`,
  next: 'hub',
})}
  plan:
    title: 작전
    lines: [ { 나레이션: 작전을 짠다. } ]
${freeBlock({ approaches: '', next: 'hub' })}
  luck:
    title: 행운
    lines: [ { 나레이션: 운을 시험한다. } ]
${freeBlock({
  approaches: `        - id: risky
          label: 무리한다
          stat: 재치
          hint: 무리한다
          examples: []
          keywords: [무리]
          before: { 의심: 10 }
          outcomes:${outcomes()}`,
  next: 'hub',
})}
  rush:
    title: 서두름
    lines: [ { 나레이션: 서두른다. } ]
${freeBlock({
  until: '탈주 >= 1',
  approaches: `        - id: dash
          label: 달린다
          stat: 체력
          hint: 달린다
          examples: []
          keywords: [달린다]
          outcomes:${outcomes(', effects: { 탈주: 1 }')}`,
  next: 'hub',
})}
  loop:
    title: 되풀이
    lines: [ { 나레이션: 같은 자리다. } ]
${freeBlock({ turns: 1, approaches: '', next: '[ { if: "탈주 >= 5", to: hub }, { to: loop } ]' })}
  price:
    title: 대가
    lines: [ { 나레이션: 대가가 따른다. } ]
${freeBlock({ prices: '        - { id: p_once, tag: 수치, weight: soft, text: 숨이 가빠진다., once: true }\n', approaches: '', next: 'hub' })}
  press:
    title: 압박
    lines: [ { 나레이션: 누군가 다가온다. } ]
${freeBlock({ patience: 1, prices: '        - { id: p_time, tag: 시간, weight: soft, text: 해가 기운다., once: true }\n', approaches: '', next: 'hub' })}
  used:
    title: 쓴 대가
    lines: [ { 나레이션: 상대가 지켜본다. } ]
${freeBlock({ patience: 1, prices: '        - { id: p_eye, tag: 시간, weight: soft, text: 그림자가 길어진다. }\n', approaches: '', next: 'hub' })}
  move:
    title: 무브
    lines: [ { 나레이션: 바람이 분다. } ]
${freeBlock({ patience: 1, approaches: '', next: 'hub' })}
  good:
    title: 버텼다
    lines: [ { 나레이션: 버텼다. } ]
    ending: { id: good, title: 버팀, summary: 버텼다, next_hook: 다음 }
  bad:
    title: 들켰다
    lines: [ { 나레이션: 들켰다. } ]
    ending: { id: bad, title: 들킴, summary: 들켰다, next_hook: 다음, bad: true }
`;

const NOTES: NoteEntry[] = [
  { id: 'n_open', tier: 'common', kind: '장소', name: '갈림길', text: '두 갈래 길.', keys: [], after: ['hub'] },
  { id: 'n_secret', tier: 'hidden', kind: '사람', name: '숨은 이', text: '아직 모르는 사람.', keys: [], after: ['hub'], if: 'flag:비밀' },
];

const lab: Scenario = { ...parseScenario(LAB_YAML), notes: NOTES };

/** 두 주사위 눈의 합이 sum 이 되는 rng 값. */
function rngForSum(sum: number): number {
  for (let r = 1; r < 100_000; r++) {
    const a = rollD6(r);
    const b = rollD6(a.state);
    if (a.face + b.face === sum) return r;
  }
  throw new Error(`합 ${sum} 을 내는 rng 가 없습니다`);
}

function setup(reading?: (text: string) => Interpretation, luck = false) {
  const gm = new FakeGm(reading ? (ctx) => reading(ctx.text) : undefined);
  const engine = new Engine(lab, gm, fakeClock().now, luck);
  return { engine, ...engine.newGame(1, 'rules') };
}

async function go(engine: Engine, state: GameState, action: Action, sum?: number) {
  return engine.act(sum === undefined ? state : { ...state, rng: rngForSum(sum) }, action);
}

const rolls = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'roll' ? [e] : []));
const priceIds = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'price' ? [e.id] : []));
const lastInput = (state: GameState) => state.log.filter((e) => e.kind === 'input').at(-1);

describe('수치와 소지품 효과', () => {
  test('수치는 0 과 상한 사이로 잘리고, 이미 가진 소지품은 다시 얻어도 하나다', async () => {
    const { engine, state } = setup();
    const r = await go(engine, state, { type: 'choose', id: 'clamp' });
    expect(r.state.tracks.호감).toBe(10);
    expect(r.state.tracks.귀찌).toBe(0);
    const changes = r.step.events.flatMap((e) => (e.type === 'tracks' ? e.changes : []));
    expect(changes).toEqual([
      { key: '호감', from: 0, to: 10 },
      { key: '귀찌', from: 5, to: 0 },
    ]);
    expect(r.state.items.filter((i) => i === 'pin')).toHaveLength(1);
    expect(r.step.events.some((e) => e.type === 'items')).toBe(false);
  });

  test('숨긴 소지품은 HUD 소지품과 수첩에 나오지 않는다', () => {
    const { state, step } = setup();
    expect(state.items).toContain('seal');
    expect(step.hud.items.map((i) => i.id)).toEqual(['pin', 'rope']);
    expect(step.hud.notes.map((n) => n.id)).not.toContain('item:seal');
  });
});

describe('선택지 판정', () => {
  test('조건이 거짓인 보정은 빠지고, 결과의 next 가 선택지의 next 보다 앞선다', async () => {
    const { engine, state } = setup();
    const r = await go(engine, state, { type: 'choose', id: 'modroll' }, 5);
    const [roll] = rolls(r.step.events);
    expect(rolls(r.step.events)).toHaveLength(1);
    expect(roll?.mods).toEqual([{ label: '참 보정', value: 1 }]);
    expect(roll?.total).toBe(6);
    expect(r.state.beat).toBe('side');
  });
});

describe('결말과 작은 끝', () => {
  test('스스로 들어간 결말은 같은 턴에 참이 된 작은 끝 조건으로 덮이지 않는다', async () => {
    const { engine, state } = setup();
    const r = await go(engine, state, { type: 'choose', id: 'win' });
    expect(r.state.tracks.의심).toBe(10);
    expect(r.state.ending).toBe('good');
    expect(r.step.events.flatMap((e) => (e.type === 'ending' ? [e.id] : []))).toEqual(['good']);
  });

  test('끝난 판에는 여우에게 묻는 말도 받지 않는다', async () => {
    const { engine, state } = setup();
    const ended = await go(engine, state, { type: 'choose', id: 'win' });
    expect(ended.state.ending).toBe('good');
    await expect(engine.act(ended.state, { type: 'ask', text: '이건 뭐야?' })).rejects.toBeInstanceOf(GameError);
  });
});

describe('이벤트 CG', () => {
  test('alt 조건이 참일 때만 다른 CG 로 바꾼다', async () => {
    const { engine, step } = setup();
    const cgs = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'line' && e.cg ? [e.cg] : []));
    expect(cgs(step.events)).toEqual(['c_plain']);
    const { state } = setup();
    const hooded = await go(engine, state, { type: 'choose', id: 'hood' });
    expect(cgs(hooded.step.events)).toEqual(['c_hood']);
  });
});

describe('수첩의 숨길 것', () => {
  test('숨길 것은 after 비트에 들어가도 조건 전에는 적히지 않는다', () => {
    const { state, step } = setup();
    expect(step.events.flatMap((e) => (e.type === 'note' ? [e.id] : []))).toEqual(['n_open']);
    expect(state.flags['수첩:n_secret']).toBeUndefined();
    expect(step.hud.notes.map((n) => n.id)).not.toContain('n_secret');
  });

  test('조건 없는 숨길 것은 수첩에 열리지 않는다', () => {
    const { state } = setup();
    const bare: NoteEntry = { id: 'bare', tier: 'hidden', kind: '세계', name: '비밀', text: '비밀.', keys: [] };
    expect(noteOpen(bare, state)).toBe(false);
    expect(noteOpen({ ...bare, if: '!flag:비밀' }, state)).toBe(true);
  });
});

describe('자유 입력 해석', () => {
  test('소지품이 없는 행동으로 읽힌 입력은 기본 행동으로, 없는 소지품은 쓰지 않은 것으로 굴린다', async () => {
    const reading = (text: string): Interpretation =>
      text.includes('딴다') ? approachOf('pick') : { kind: 'approach', approach: 'watch', item: 'rope', source: 'llm', meta: META };
    const { engine, state } = setup(reading);
    const cell = (await go(engine, state, { type: 'choose', id: 'to_cell' })).state;
    const bare = { ...cell, items: ['seal'] };
    const picked = await go(engine, bare, { type: 'free', text: '자물쇠를 딴다' }, 8);
    expect(lastInput(picked.state)).toMatchObject({ result: 'approach', approach: 'watch' });
    expect(rolls(picked.step.events).map((r) => r.stat)).toEqual(['재치']);
    const roped = await go(engine, bare, { type: 'free', text: '주위를 살핀다' }, 8);
    expect(lastInput(roped.state)).toMatchObject({ result: 'approach', approach: 'watch', item: null });
  });

  test('입력은 200자에서 자른다', async () => {
    const { engine, state } = setup();
    const cell = (await go(engine, state, { type: 'choose', id: 'to_cell' })).state;
    const r = await go(engine, cell, { type: 'free', text: '가'.repeat(300) });
    const echo = r.step.events.find((e) => e.type === 'echo');
    expect(echo?.type === 'echo' && [...echo.text].length).toBe(MAX_INPUT_CHARS);
    expect(lastInput(r.state)?.text).toHaveLength(MAX_INPUT_CHARS);
  });
});

describe('한 번뿐인 보정', () => {
  const modLabels = (events: GameEvent[]) => rolls(events).flatMap((r) => r.mods.map((m) => m.label));

  test('짚어 둔 것을 쓴 보정은 한 번뿐이고, 물음으로 적은 말에는 붙지 않는다', async () => {
    const { engine, state } = setup(() => approachOf('watch'));
    const cell = (await go(engine, state, { type: 'choose', id: 'to_cell' })).state;
    const asked = await go(engine, cell, { type: 'free', text: '핀을 써 볼까?' }, 8);
    expect(rolls(asked.step.events)).toHaveLength(1);
    expect(modLabels(asked.step.events)).toEqual([]);
    const first = await go(engine, asked.state, { type: 'free', text: '핀으로 자물쇠를 연다' }, 8);
    expect(modLabels(first.step.events)).toEqual(['기억해 둔 것']);
    const second = await go(engine, first.state, { type: 'free', text: '핀으로 다시 연다' }, 8);
    expect(rolls(second.step.events)).toHaveLength(1);
    expect(modLabels(second.step.events)).toEqual([]);
  });

  test('작전 회의 장면에서 가진 것을 쓴 계획 보정은 한 번뿐이다', async () => {
    const { engine, state } = setup(() => approachOf('watch'));
    const plan = (await go(engine, state, { type: 'choose', id: 'to_plan' })).state;
    const first = await go(engine, plan, { type: 'free', text: '밧줄로 창살을 묶는다' }, 8);
    expect(modLabels(first.step.events)).toEqual(['계획']);
    const second = await go(engine, first.state, { type: 'free', text: '밧줄을 당긴다' }, 8);
    expect(rolls(second.step.events)).toHaveLength(1);
    expect(modLabels(second.step.events)).toEqual([]);
  });
});

describe('행운(규칙)', () => {
  const toLuck = async () => {
    const { engine, state } = setup(undefined, true);
    return { engine, state: (await go(engine, state, { type: 'choose', id: 'to_luck' })).state };
  };

  test('7 까지 모자란 만큼을 묻고, 쓰면 그만큼 깎아 합 7 로 고친다', async () => {
    const { engine, state } = await toLuck();
    const r = await go(engine, state, { type: 'approach', id: 'watch' }, 5);
    expect(r.step.prompt).toEqual({ type: 'luck', need: 2, have: 3 });
    const used = await engine.act(r.state, { type: 'luck', use: true });
    expect(used.state.tracks.행운).toBe(1);
    expect(used.state.log.filter((e) => e.kind === 'check').at(-1)).toMatchObject({ roll: { total: 7, tier: 'mixed', luck: 2 } });
  });

  test('남은 행운이 모자란 만큼과 같으면 묻는다', async () => {
    const { engine, state } = await toLuck();
    const r = await go(engine, state, { type: 'approach', id: 'watch' }, 4);
    expect(r.step.prompt).toEqual({ type: 'luck', need: 3, have: 3 });
  });

  test('대가 있는 성공에는 행운을 묻지 않는다', async () => {
    const { engine, state } = await toLuck();
    const r = await go(engine, state, { type: 'approach', id: 'watch' }, 8);
    expect(rolls(r.step.events).map((x) => x.tier)).toEqual(['mixed']);
    expect(r.step.prompt.type).toBe('free');
    expect(r.state.pendingLuck).toBeUndefined();
  });

  test('행운을 묻는 동안은 작은 끝 조건이 참이어도 끝내지 않는다', async () => {
    const { engine, state } = await toLuck();
    const r = await go(engine, state, { type: 'approach', id: 'risky' }, 5);
    expect(r.state.tracks.의심).toBe(10);
    expect(r.step.prompt.type).toBe('luck');
    expect(r.state.ending).toBeNull();
  });
});

describe('여러 턴 자유 입력', () => {
  test('until 이 참이 되면 턴이 남아도 다음 비트로 간다', async () => {
    const { engine, state } = setup();
    const rush = (await go(engine, state, { type: 'choose', id: 'to_rush' })).state;
    const r = await go(engine, rush, { type: 'approach', id: 'dash' }, 8);
    expect(r.state.tracks.탈주).toBe(1);
    expect(r.state.beat).toBe('hub');
  });

  test('같은 비트로 되돌아와 턴을 넘겨도 남은 판정 수는 0 아래로 내려가지 않는다', async () => {
    const { engine, state } = setup();
    let { state: s, step } = await go(engine, state, { type: 'choose', id: 'to_loop' });
    for (const sum of [8, 8]) ({ state: s, step } = await go(engine, s, { type: 'approach', id: 'watch' }, sum));
    expect(s.beat).toBe('loop');
    expect(s.free?.rolls).toBe(2);
    expect(step.prompt.type === 'free' && step.prompt.rollsLeft).toBe(0);
  });
});

describe('대가 표', () => {
  test('once 대가는 판정에서 한 번 나오면 다시 뽑히지 않는다', async () => {
    const { engine, state } = setup();
    const room = (await go(engine, state, { type: 'choose', id: 'to_price' })).state;
    const first = await go(engine, room, { type: 'approach', id: 'watch' }, 8);
    expect(priceIds(first.step.events)).toEqual(['p_once']);
    const second = await go(engine, first.state, { type: 'approach', id: 'watch' }, 8);
    expect(rolls(second.step.events).map((x) => x.tier)).toEqual(['mixed']);
    expect(priceIds(second.step.events)).toEqual([]);
  });

  test('시간 무브로 나간 once 대가는 이어서 굴린 기본 행동 판정에서 다시 뽑히지 않는다', async () => {
    const { engine, state } = setup();
    const room = (await go(engine, state, { type: 'choose', id: 'to_press' })).state;
    const pressed = await go(engine, room, { type: 'free', text: '저기요' });
    expect(pressed.state.free?.moves).toEqual(['press']);
    const clocked = await go(engine, pressed.state, { type: 'free', text: '여보세요' }, 8);
    expect(clocked.state.free?.moves).toEqual(['press', 'clock']);
    expect(rolls(clocked.step.events).map((x) => x.tier)).toEqual(['mixed']);
    expect(clocked.state.log.filter((e) => e.kind === 'price').map((e) => e.kind === 'price' && e.id)).toEqual(['p_time']);
  });

  test('이 장면에서 이미 나온 대가는 시간 무브에 다시 쓰지 않는다', async () => {
    const { engine, state } = setup();
    const room = (await go(engine, state, { type: 'choose', id: 'to_used' })).state;
    const rolled = await go(engine, room, { type: 'approach', id: 'watch' }, 8);
    expect(priceIds(rolled.step.events)).toEqual(['p_eye']);
    const pressed = await go(engine, rolled.state, { type: 'free', text: '저기요' });
    const clocked = await go(engine, pressed.state, { type: 'free', text: '여보세요' }, 11);
    expect(clocked.state.free?.moves).toEqual(['press', 'clock']);
    expect(rolls(clocked.step.events).map((x) => x.tier)).toEqual(['hit']);
    expect(clocked.state.log.filter((e) => e.kind === 'price')).toHaveLength(1);
  });
});

describe('GM 무브', () => {
  const toMove = async (reading?: (text: string) => Interpretation) => {
    const { engine, state } = setup(reading);
    return { engine, state: (await go(engine, state, { type: 'choose', id: 'to_move' })).state };
  };

  test('징조 줄이 없는 장면은 위협 무브를 건너뛰고 압박부터 한다', async () => {
    const { engine, state } = await toMove();
    const r = await go(engine, state, { type: 'free', text: '저기요' });
    expect(r.state.free?.moves).toEqual(['press']);
    expect(r.state.tracks.귀찌).toBe(state.tracks.귀찌);
    expect(r.state.flags['머뭇']).toBe(1);
  });

  test('일어나지 않게 정한 행동으로 막힌 입력은 시간 무브만 하고 기본 행동을 굴리지 않는다', async () => {
    const { engine, state } = await toMove((text) => (text.includes('후드') ? { kind: 'talk', risk: 'unmask', source: 'llm', meta: META } : { kind: 'talk', source: 'llm', meta: META }));
    const talked = await go(engine, state, { type: 'free', text: '저기요' });
    expect(talked.state.free?.moves).toEqual(['press']);
    const refused = await go(engine, talked.state, { type: 'free', text: '후드를 벗는다' });
    expect(refused.state.free?.moves).toEqual(['press', 'clock']);
    expect(refused.state.log.filter((e) => e.kind === 'check')).toHaveLength(0);
    expect(rolls(refused.step.events)).toHaveLength(0);
  });

  test('대사 도중 끼어든 말도 참을성에 닿으면 그 자리에서 재촉 줄이 나온다', async () => {
    const { engine, state } = await toMove();
    const r = await go(engine, state, { type: 'interject', text: '잠깐만요', scene: 'move', shown: [], pending: [] });
    const press = lab.beats.move?.free?.press[0];
    expect(press).toBeDefined();
    expect(r.step.events.some((e) => e.type === 'line' && e.by === 'script' && e.speaker === press?.speaker && e.text === press?.text)).toBe(true);
  });
});
