import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeFacts, Engine, improvLabel, isPermission } from '../src/engine/engine.ts';
import { SaveError, listSaves, readSave, readSaveView, writeSave } from '../src/engine/save.ts';
import { checkScenario, parseScenario } from '../src/engine/scenario.ts';
import { summarize } from '../src/engine/summary.ts';
import { GameError, type GameState, type Step } from '../src/engine/types.ts';
import { buildAtlas, emptyAtlas, recordAtlas } from '../src/engine/atlas.ts';
import { FakeGm, META, approachOf, fakeClock, loadDesert } from './helpers.ts';

const scenario = await loadDesert();

async function toGaze(seed: number, gm = new FakeGm(() => approachOf('plead'))) {
  const clock = fakeClock();
  const engine = new Engine(scenario, gm, clock.now);
  let { state, step } = engine.newGame(seed, `t${seed}`);
  for (const action of [
    { type: 'approach', id: 'water' },
    { type: 'approach', id: 'run' },
    { type: 'approach', id: 'plead' },
    { type: 'approach', id: 'dodge' },
  ] as const) {
    clock.advance(5_000);
    ({ state, step } = await engine.act(state, action));
  }
  return { engine, state, step, clock };
}

describe('1화 사막 조우 콘텐츠', () => {
  test('시나리오 검증 문제가 없다', () => {
    expect(checkScenario(scenario)).toEqual([]);
  });

  test('판정 지점이 2개 이상이고 결말이 2개 이상이다', () => {
    const beats = Object.values(scenario.beats);
    const checkPoints = beats.filter((b) => b.free || b.choices?.some((c) => c.check)).length;
    const endings = beats.filter((b) => b.ending).length;
    expect(checkPoints).toBeGreaterThanOrEqual(2);
    expect(endings).toBeGreaterThanOrEqual(2);
  });
});

describe('엔진 진행', () => {
  test('새 게임은 첫 비트의 자유 입력에서 멈춘다', () => {
    const engine = new Engine(scenario, new FakeGm());
    const { state, step } = engine.newGame(1, 's');
    expect(state.beat).toBe('b01_sand');
    expect(step.prompt.type).toBe('free');
    expect(step.hud.tracks.find((t) => t.key === '귀찌')?.label).toBe('귀찌 수명');
    expect(state.log.flatMap((e) => (e.kind === 'beat' ? [e.beat] : [e.kind]))).toEqual(['start', 'b00_open', 'b01_sand']);
  });

  test('여는 글은 GM 이 읽고, 배경과 아시나의 정체, 목표를 6~8줄로 말한 뒤 첫 장면으로 간다', () => {
    const { step } = new Engine(scenario, new FakeGm()).newGame(1, 's');
    const firstScene = step.events.findIndex((e) => e.type === 'scene' && e.beat === 'b01_sand');
    const opening = step.events.slice(0, firstScene).flatMap((e) => (e.type === 'line' ? [e] : []));
    expect(opening.length).toBeGreaterThanOrEqual(6);
    expect(opening.length).toBeLessThanOrEqual(8);
    expect(opening.every((l) => l.style === 'gm' && l.display === 'GM')).toBe(true);
    const text = opening.map((l) => l.text).join(' ');
    for (const word of ['크롬웰', '페시안', '지르다', '공녀', '귀찌', '크라차']) expect(text).toContain(word);
    if (step.prompt.type !== 'free') throw new Error('자유 입력이 아닙니다');
    expect(step.prompt.aim).toBe('쓰러지기 전에 버틸 방법을 찾아 다시 걷는다.');
  });

  test('후드를 쓴 판의 b06 칼날 CG 는 후드 그림이고, 미소녀라고 하지 않은 판에는 "어디가 아름답다는 거지"가 없다', async () => {
    const engine = new Engine(scenario, new FakeGm());
    let { state, step } = engine.newGame(5, 's');
    for (const id of ['water', 'run', 'plead']) ({ state, step } = await engine.act(state, { type: 'approach', id }));
    expect(state.beat).toBe('b06_swing');
    const cgs = step.events.flatMap((e) => (e.type === 'line' && e.cg ? [e.cg] : []));
    expect(cgs).toContain('cg_swing_hood');
    expect(cgs).not.toContain('cg_swing');
    expect(activeFacts(scenario, state).map((f) => f.text).join(' ')).toContain('후드를 깊이 눌러쓰고');
    const texts: string[] = [];
    for (let i = 0; i < 6 && !state.ending; i++) {
      const p = step.prompt;
      if (p.type !== 'free') break;
      const a = p.approaches.find((x) => !x.locked && x.id !== 'beauty');
      if (!a) break;
      ({ state, step } = await engine.act(state, { type: 'approach', id: a.id }));
      texts.push(...step.events.flatMap((e) => (e.type === 'line' ? [e.text] : [])));
    }
    if (texts.some((t) => t.includes('마음이 바뀌었다'))) {
      expect(texts).not.toContain('도대체 어디가 아름답다는 거지?');
      // "끝까지 눈을 피하지 않는군"은 b08 에서 눈을 끝까지 마주한 판(눈_맞섬)에만 나온다.
      expect(texts).toContain(state.flags['눈_맞섬'] ? '끝까지 눈을 피하지 않는군.' : '이상한 여자군.');
      expect(texts).not.toContain(state.flags['눈_맞섬'] ? '이상한 여자군.' : '끝까지 눈을 피하지 않는군.');
    }
  });

  test('미소녀 플래그는 미소녀라고 말했거나 버튼을 누른 판에만 켜진다', async () => {
    const at = async (action: { type: 'free'; text: string } | { type: 'approach'; id: string }) => {
      const engine = new Engine(scenario, new FakeGm(() => approachOf('beauty')));
      let { state } = engine.newGame(5, 's');
      for (const id of ['water', 'run']) ({ state } = await engine.act(state, { type: 'approach', id }));
      expect(state.beat).toBe('b05_why');
      ({ state } = await engine.act(state, action));
      return state.flags;
    };
    expect((await at({ type: 'free', text: '후드를 벗고 생긋 웃는다' }))['미소녀']).toBeUndefined();
    expect((await at({ type: 'free', text: '대륙에서 하나뿐인 미소녀니까요' }))['미소녀']).toBe(true);
    expect((await at({ type: 'approach', id: 'beauty' }))['미소녀']).toBe(true);
  });

  test('모든 자유 입력 비트에 장면 목표 문장이 있다', () => {
    const missing = Object.values(scenario.beats).filter((b) => b.free && !b.free.aim?.trim()).map((b) => b.id);
    expect(missing).toEqual([]);
  });

  test('수첩: 처음엔 누구나·아시나가 아는 것만, 남자는 만난 뒤 한 줄 설명과 함께, 숨길 것은 적히지 않는다', async () => {
    const engine = new Engine(scenario, new FakeGm());
    let { state, step } = engine.newGame(3, 's');
    const names = () => step.hud.notes.map((n) => n.name);
    expect(names()).toEqual(expect.arrayContaining(['크롬웰과 페시안', '지르다', '아시나', '마법 귀찌']));
    expect(names()).not.toContain('붉은 눈의 남자');
    expect(step.hud.trackGate).toEqual([
      { note: 'man', tracks: ['의심', '집착', '호감'] },
      { note: 'captive', tracks: ['탈주'] },
    ]);
    ({ state, step } = await engine.act(state, { type: 'approach', id: 'water' }));
    // 규칙은 결과가 처음 나온 직후에 그 숫자로 한 줄 말한다.
    const rollAt = step.events.findIndex((e) => e.type === 'roll');
    const after = step.events[rollAt + 1];
    expect(after?.type === 'line' && after.style === 'gm' && /합 \d+\./.test(after.text)).toBe(true);
    expect(step.hud.trackGate.map((g) => g.note)).toContain('man');
    ({ state, step } = await engine.act(state, { type: 'approach', id: 'run' }));
    expect(step.hud.trackGate.map((g) => g.note)).toEqual(['captive']);
    expect(names()).toContain('붉은 눈의 남자');
    const intro = step.events.find((e) => e.type === 'line' && e.style === 'gm');
    expect(intro?.type === 'line' && intro.text).toContain('페시안 사람');
    expect(step.events.some((e) => e.type === 'note' && e.id === 'man')).toBe(true);
    const all = step.hud.notes.map((n) => `${n.name} ${n.text}`).join(' ');
    for (const word of ['베히다트', '왕이다']) expect(all).not.toContain(word);
    expect(state.beat).toBe('b05_why');
  });

  test('배경 질문은 GM 설명으로 받고 장면은 그대로다(대화 횟수도 안 늘어난다)', async () => {
    const gm = new FakeGm(() => ({ kind: 'ask', source: 'rule', meta: META }));
    const engine = new Engine(scenario, gm);
    const start = engine.newGame(1, 's');
    const { state, step } = await engine.act(start.state, { type: 'free', text: '크롬웰이 뭐야?' });
    expect(gm.calls).toContain('explain:크롬웰이 뭐야?');
    expect(state.beat).toBe('b01_sand');
    expect(state.free?.talks).toBe(0);
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(state.log.some((e) => e.kind === 'input' && e.result === 'ask')).toBe(true);
  });

  test('실패해도 이야기가 다음 비트로 넘어가고 대가가 적용된다', async () => {
    let found = false;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const engine = new Engine(scenario, new FakeGm());
      const start = engine.newGame(seed, 's');
      const { state, step } = await engine.act(start.state, { type: 'approach', id: 'map' });
      const roll = step.events.find((e) => e.type === 'roll');
      if (roll?.type !== 'roll' || roll.tier !== 'miss') continue;
      found = true;
      expect(state.beat).toBe('b02_people');
      expect(state.tracks.귀찌).toBe(start.state.tracks.귀찌 - 1 - 1);
      expect(step.prompt.type).toBe('free');
    }
    expect(found).toBe(true);
  });

  test('같은 시드와 같은 행동은 같은 판정과 같은 결과를 만든다', async () => {
    const a = await toGaze(9);
    const b = await toGaze(9);
    const rolls = (s: GameState) => s.log.flatMap((e) => (e.kind === 'check' ? [e.roll] : []));
    expect(rolls(a.state)).toEqual(rolls(b.state));
    expect(a.state.tracks).toEqual(b.state.tracks);
    expect(a.state.beat).toBe('b08_gaze');
  });

  test.each([
    ['spy', { 의심: 9, 집착: 0 }],
    ['curious', { 의심: 0, 집착: 5 }],
    ['survivor', { 의심: 0, 집착: 0 }],
  ] as const)('진행 수치에 따라 결말 %s 로 갈린다', async (ending, tracks) => {
    const { engine, state } = await toGaze(3);
    const forced = structuredClone(state);
    Object.assign(forced.tracks, tracks);
    let { state: end, step } = await engine.act(forced, { type: 'approach', id: 'stare_back' });
    if (ending === 'spy') {
      expect(end.beat).toBe('r2_bind');
      ({ state: end, step } = await engine.act(end, { type: 'approach', id: 'deny' }));
    }
    expect(end.ending).toBe(ending);
    expect(step.prompt.type).toBe('end');
    expect(step.events.some((e) => e.type === 'ending' && e.id === ending)).toBe(true);
  });

  const talkGm = () => new FakeGm(() => ({ kind: 'talk', source: 'llm', meta: META }));
  async function atWhy(gm: FakeGm, seed = 5) {
    const engine = new Engine(scenario, gm);
    let { state, step } = engine.newGame(seed, 's');
    ({ state } = await engine.act(state, { type: 'approach', id: 'water' }));
    ({ state, step } = await engine.act(state, { type: 'approach', id: 'run' }));
    expect(state.beat).toBe('b05_why');
    return { engine, state, step };
  }

  test('엉뚱한 말은 판정 없이 받고, 인내가 차면 재촉하고, 넘으면 인물이 먼저 움직여 진행한다', async () => {
    let { engine, state } = await atWhy(talkGm());
    let step: Step;
    for (const text of ['배고파', '너 몇 살이야']) {
      ({ state, step } = await engine.act(state, { type: 'free', text }));
      expect(state.beat).toBe('b05_why');
      expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    }
    ({ state, step } = await engine.act(state, { type: 'free', text: 'ㅋㅋㅋ' }));
    expect(state.beat).toBe('b05_why');
    expect(step.events.some((e) => e.type === 'line' && e.by === 'script')).toBe(true);
    ({ state, step } = await engine.act(state, { type: 'free', text: '모래가 맛있겠다' }));
    const roll = step.events.find((e) => e.type === 'roll');
    expect(roll?.type === 'roll' && roll.label).toBe('결백을 호소한다');
    expect(state.beat).not.toBe('b05_why');
  });

  test('같은 말을 되풀이하면 재촉이 빨라지고 어조가 바뀐다', async () => {
    const tones: (string | undefined)[] = [];
    class ToneGm extends FakeGm {
      override async talk(ctx: Parameters<FakeGm['talk']>[0]) {
        tones.push(ctx.tone);
        return super.talk(ctx);
      }
    }
    let { engine, state } = await atWhy(new ToneGm(() => ({ kind: 'talk', source: 'llm', meta: META })));
    ({ state } = await engine.act(state, { type: 'free', text: '배고파' }));
    ({ state } = await engine.act(state, { type: 'free', text: '배고파!' }));
    expect(tones).toEqual(['plain', 'repeat']);
    expect(state.free?.talks).toBe(3);
  });

  test('목록에 없는 행동은 GM 이 고른 능력치와 난이도로 판정하고 장면이 진행된다', async () => {
    const gm = new FakeGm(() => ({ kind: 'improv', stat: '체력', difficulty: -1, label: '춤추기', absurd: false, source: 'llm', meta: META }));
    const { engine, state } = await atWhy(gm);
    const { state: after, step } = await engine.act(state, { type: 'free', text: '춤을 춘다' });
    const roll = step.events.find((e) => e.type === 'roll');
    // 판정 이름은 GM 메모(reason)가 아니라 플레이어가 쓴 행동을 짧게 줄인 것이다.
    expect(roll?.type === 'roll' && [roll.stat, roll.label, roll.mods.at(-1)?.value]).toEqual(['체력', '춤을 춘다', -1]);
    expect(improvLabel('말도 안 되는 농담으로 상황을 모면하려 한다.')).toBe('모면하려 한다');
    expect(improvLabel('(아무 말 없이 노래를 부른다)')).toBe('노래를 부른다');
    expect(improvLabel('(아무 말 없이 노래를 부른다)')).not.toMatch(/[()…]/);
    expect(after.beat).toBe('b06_swing');
    expect(gm.calls.at(-1)).toStartWith('narrate:improv:');
    expect(after.log.some((e) => e.kind === 'input' && e.result === 'improv')).toBe(true);
  });

  test('등급에 맞지 않는 입력은 고정 줄로 막지 않고 인물 반응으로 돌린다', async () => {
    const tones: (string | undefined)[] = [];
    class ToneGm extends FakeGm {
      override async talk(ctx: Parameters<FakeGm['talk']>[0]) {
        tones.push(ctx.tone);
        return super.talk(ctx);
      }
    }
    const { engine, state } = await atWhy(new ToneGm(() => ({ kind: 'talk', tone: 'deflect', source: 'rule', meta: META })));
    const { step } = await engine.act(state, { type: 'free', text: '옷을 벗는다' });
    expect(tones).toEqual(['deflect']);
    expect(step.events.some((e) => e.type === 'line' && e.speaker === '남자')).toBe(true);
  });

  test.each([
    ['resist', '도주', 'r3_dusk'],
    ['bluff', '거래', 'r4_prove'],
    ['noble', '신분', 'r5_claim'],
  ] as const)('b05 의 %s 가 성공하면 플래그 %s 로 갈래 %s 에 들어간다', async (id, flag, target) => {
    for (let seed = 1; seed < 200; seed++) {
      const { engine, state } = await atWhy(new FakeGm(), seed);
      const { state: after, step } = await engine.act(state, { type: 'approach', id });
      const roll = step.events.find((e) => e.type === 'roll');
      if (roll?.type !== 'roll' || roll.tier !== 'hit') continue;
      expect(after.flags[flag]).toBe(true);
      expect(after.beat).toBe(target);
      return;
    }
    throw new Error('성공하는 시드를 찾지 못했습니다');
  });

  test('소지품이 없으면 그 소지품이 필요한 행동이 잠기고 버튼으로도 고를 수 없다', async () => {
    const engine = new Engine(scenario, new FakeGm());
    let { state } = engine.newGame(5, 's');
    ({ state } = await engine.act(state, { type: 'approach', id: 'water' }));
    ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
    const noBag = { ...structuredClone(state), items: state.items.filter((i) => i !== 'magic_bag') };
    const prompt = engine.prompt(noBag);
    expect(prompt.type === 'free' && prompt.approaches.find((a) => a.id === 'bag')?.locked).toBe(true);
    await expect(engine.act(noBag, { type: 'approach', id: 'bag' })).rejects.toBeInstanceOf(GameError);
  });

  test('플레이 기록에 선택, 판정, 자유 입력, 시간이 남는다', async () => {
    const { state } = await toGaze(11);
    const kinds = new Set(state.log.map((e) => e.kind));
    for (const k of ['start', 'beat', 'choice', 'check', 'tracks']) expect(kinds.has(k as never)).toBe(true);
    expect(state.playMs).toBe(4 * 5_000);
    const times = state.log.map((e) => e.playMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const sum = summarize(scenario, state);
    expect(sum.checks.length).toBe(4);
    expect(sum.decisions.map((d) => d.text)).toContain('결백을 호소한다');
  });

  test('오래 손을 놓은 시간은 3분까지만 플레이 시간에 더한다', async () => {
    const clock = fakeClock();
    const engine = new Engine(scenario, new FakeGm(), clock.now);
    const { state } = engine.newGame(1, 's');
    clock.advance(60 * 60 * 1000);
    const { state: after } = await engine.act(state, { type: 'approach', id: 'water' });
    expect(after.playMs).toBe(3 * 60 * 1000);
  });
});

describe('저장과 불러오기', () => {
  test('저장한 상태를 불러오면 같고, 이어서 굴린 주사위도 같다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wolheun-save-'));
    try {
      const { engine, state } = await toGaze(21);
      const meta = await writeSave(dir, 'slot1', scenario, state);
      expect(meta.beatTitle).toBe('한여름의 태양');
      const loaded = await readSave(dir, 'slot1', scenario);
      expect(loaded).toEqual(state);
      const a = await engine.act(state, { type: 'approach', id: 'retort' });
      const b = await engine.act(loaded, { type: 'approach', id: 'retort' });
      expect(b.state.ending).toBe(a.state.ending);
      expect(b.state.tracks).toEqual(a.state.tracks);
      expect((await listSaves(dir)).map((m) => m.slot)).toEqual(['slot1']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('화면이 보낸 저장 순간의 모습(대사 기록 포함)을 그대로 돌려준다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wolheun-save-'));
    try {
      const { state } = await toGaze(21);
      const view = { scene: { type: 'scene', beat: 'b08_gaze' }, line: { type: 'line', text: '하.' }, remaining: [], backlog: Array.from({ length: 40 }, (_, i) => ({ who: '아시나', text: `줄 ${i}`, by: 'script' })) };
      await writeSave(dir, 'slot1', scenario, state, 1, view);
      expect(await readSaveView(dir, 'slot1')).toEqual(view);
      expect(await readSave(dir, 'slot1', scenario)).toEqual(state);
      await writeSave(dir, 'slot2', scenario, state);
      expect(await readSaveView(dir, 'slot2')).toBeNull();
      expect(await readSaveView(dir, 'slot3')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('잘못된 칸 이름과 다른 시나리오의 저장은 거부한다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wolheun-save-'));
    try {
      const { state } = await toGaze(2);
      await expect(writeSave(dir, '../escape', scenario, state)).rejects.toBeInstanceOf(SaveError);
      await writeSave(dir, 'slot2', scenario, { ...state, scenario: 'other' });
      await expect(readSave(dir, 'slot2', scenario)).rejects.toBeInstanceOf(SaveError);
      await expect(readSave(dir, 'slot3', scenario)).rejects.toBeInstanceOf(SaveError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

const PRISON = `
id: prison_test
title: 탈옥 시험
episode: 시험
source: 단위 테스트
rating: 15세 이용가
start: cell
sheet:
  name: 아시나
  abilities: { 재치: 1, 손재주: 1, 매력: 0, 체력: 0, 교양: 0 }
  tracks: { 의심: 0, 집착: 0, 호감: 0, 귀찌: 5, 탈주: 0, 행운: 0 }
  items:
    - { id: pin, name: 가는 핀, desc: 자물쇠를 딸 수 있는 핀 }
cast:
  나레이션: { display: "", style: narration }
  간수: { display: 간수, style: speech }
backgrounds: { cell: { label: 감옥, placeholder: blackout } }
sprites: {}
beats:
  cell:
    title: 감옥
    bg: cell
    lines:
      - 나레이션: 쇠사슬이 무겁다.
    free:
      prompt: 탈옥 계획을 세워 보세요.
      situation: 감옥.
      goal: 탈옥 준비.
      speakers: [나레이션, 간수]
      must_not: [간수가 문을 열어 준다]
      forbid: []
      talk_fallback: [ { 간수: 조용히 해라. } ]
      press: [ { 간수: 조용히 해라. } ]
      deflect: [ { 나레이션: 그건 안 된다. } ]
      improv:
        hit: { gist: 먹힌다, lines: [ { 나레이션: 먹혔다. } ] }
        mixed: { gist: 조금 먹힌다, lines: [ { 나레이션: 조금 먹혔다. } ] }
        miss: { gist: 안 먹힌다, lines: [ { 나레이션: 안 먹혔다. } ] }
      turns: 5
      until: "탈주 >= 3"
      default_approach: watch
      approaches:
        - id: watch
          label: 간수를 관찰한다
          stat: 재치
          hint: 순찰 간격을 센다
          examples: []
          keywords: [관찰]
          outcomes:
            hit: { gist: 순찰 간격을 알아낸다, lines: [ { 나레이션: 간격을 알아냈다. } ], effects: { 탈주: 1 } }
            mixed: { gist: 조금 알아낸다, lines: [ { 나레이션: 조금 알았다. } ], effects: { 탈주: 1, 귀찌: -1 } }
            miss: { gist: 들킨다, lines: [ { 나레이션: 들켰다. } ], effects: { 의심: 1 } }
        - id: pick
          label: 핀으로 자물쇠를 딴다
          stat: 손재주
          item: pin
          hint: 핀을 쓴다
          examples: []
          keywords: [핀]
          outcomes:
            hit: { gist: 열린다, lines: [ { 나레이션: 찰칵. } ], effects: { 탈주: 2 } }
            mixed: { gist: 반쯤 열린다, lines: [ { 나레이션: 덜컥. } ], effects: { 탈주: 1 } }
            miss: { gist: 핀이 부러진다, lines: [ { 나레이션: 핀이 부러졌다. } ], effects: { lose: [pin], 의심: 1 } }
    next:
      - { if: "탈주 >= 3", to: out }
      - { to: caught }
  out:
    title: 탈출
    lines: [ { 나레이션: 빠져나왔다. } ]
    ending: { id: out, title: 탈출, summary: 나왔다, next_hook: 다음 }
  caught:
    title: 붙잡힘
    lines: [ { 나레이션: 붙잡혔다. } ]
    ending: { id: caught, title: 붙잡힘, summary: 잡혔다, next_hook: 다음 }
`;

describe('여러 턴 계획 비트(다음 단계 감옥 탈옥용)', () => {
  const prison = parseScenario(PRISON);

  test('턴 한도와 조건, 소지품 소모를 지키며 결말까지 간다', async () => {
    const endings = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const engine = new Engine(prison, new FakeGm(() => approachOf('pick')));
      let { state, step } = engine.newGame(seed, 'p');
      let rolls = 0;
      while (step.prompt.type === 'free') {
        const pickLocked = step.prompt.approaches.find((a) => a.id === 'pick')?.locked ?? true;
        expect(pickLocked).toBe(!state.items.includes('pin'));
        ({ state, step } = await engine.act(state, { type: 'approach', id: pickLocked ? 'watch' : 'pick' }));
        rolls += 1;
      }
      expect(rolls).toBeLessThanOrEqual(5);
      expect(state.ending).toBe(state.tracks.탈주 >= 3 ? 'out' : 'caught');
      endings.add(state.ending ?? '');
    }
    expect([...endings].sort()).toEqual(['caught', 'out']);
  });
});

describe('사건 스트리밍', () => {
  test('자유 입력의 주사위는 서술이 끝나기 전에 흘러 나온다', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    class SlowNarrate extends FakeGm {
      override async narrate(ctx: Parameters<FakeGm['narrate']>[0]) {
        await held;
        return super.narrate(ctx);
      }
    }
    const { engine, state } = await toGaze(7, new SlowNarrate(() => approachOf('stare_back')));
    let rolled: () => void = () => undefined;
    const rollSeen = new Promise<void>((resolve) => {
      rolled = resolve;
    });
    const seen: string[] = [];
    const acting = engine.act(state, { type: 'free', text: '똑바로 마주 본다' }, (ev) => {
      seen.push(ev.type);
      if (ev.type === 'roll') rolled();
    });
    await rollSeen;
    expect(seen).toEqual(['echo', 'roll']);
    release();
    const { step } = await acting;
    expect(seen).toEqual(step.events.map((ev) => ev.type));
    expect(seen).toContain('line');
  });
});

describe('후드 입식과 새 CG', () => {
  async function atWhy(gm: FakeGm, seed: number) {
    const engine = new Engine(scenario, gm);
    let { state } = engine.newGame(seed, 's');
    ({ state } = await engine.act(state, { type: 'approach', id: 'water' }));
    ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
    expect(state.beat).toBe('b05_why');
    return { engine, state };
  }

  class PlainNarrate extends FakeGm {
    override async narrate() {
      return { lines: [{ speaker: '남자', text: '…뭐라고?' }], meta: META };
    }
  }

  test('미인계를 고르면 주사위 뒤, 서술 앞에 입식이 바뀌고 다시 열어도 유지된다', async () => {
    const { engine, state } = await atWhy(new FakeGm(), 3);
    expect(engine.resume(state).events[0]).toMatchObject({ type: 'scene', sprites: {} });
    const { state: after, step } = await engine.act(state, { type: 'approach', id: 'beauty' });
    const order = step.events.map((e) => e.type);
    expect(order.indexOf('roll')).toBeLessThan(order.indexOf('sprite'));
    expect(order.indexOf('sprite')).toBeLessThan(order.indexOf('line'));
    expect(step.events.find((e) => e.type === 'sprite')).toEqual({ type: 'sprite', cast: '아시나', sprite: 'asina' });
    expect(engine.resume(after).events[0]).toMatchObject({ type: 'scene', sprites: { 아시나: 'asina' } });
  });

  test('다른 행동은 후드를 쓴 채 가다가 b07 에서 벗는다(피하다 굴러떨어진 판은 그 자리에서 벗겨진다)', async () => {
    const { engine, state } = await atWhy(new FakeGm(), 3);
    const { state: after, step } = await engine.act(state, { type: 'approach', id: 'plead' });
    expect(step.events.some((e) => e.type === 'sprite')).toBe(false);
    expect(after.flags.후드_벗음).toBeUndefined();
    const { step: next } = await engine.act(after, { type: 'approach', id: 'dodge' });
    const events = next.events.map((e) => (e.type === 'scene' ? e.beat : e.type));
    expect(events.indexOf('b07_rule')).toBeGreaterThanOrEqual(0);
    const roll = next.events.find((e) => e.type === 'roll');
    // 피하기가 '대가 있는 성공'이면 서술이 "후드가 벗겨지고"라 입식도 그 자리에서 바뀐다.
    if (roll?.type === 'roll' && roll.tier === 'mixed') expect(events.indexOf('sprite')).toBeLessThan(events.indexOf('b07_rule'));
    else expect(events.indexOf('sprite')).toBeGreaterThan(events.indexOf('b07_rule'));
  });

  test('GM 이 쓴 서술에도 그 결과의 CG 가 붙는다', async () => {
    const { engine, state } = await atWhy(new PlainNarrate(() => approachOf('beauty')), 3);
    const { step } = await engine.act(state, { type: 'free', text: '대륙에서 하나뿐인 미소녀니까요' });
    const line = step.events.find((e) => e.type === 'line' && e.by === 'gm');
    expect(line).toMatchObject({ text: '…뭐라고?', cg: 'cg_beauty' });
  });
});

describe('대사 도중 끼어들기', () => {
  const start = () => {
    const gm = new FakeGm();
    const engine = new Engine(scenario, gm, fakeClock().now);
    const { state } = engine.newGame(1, 'i');
    return { gm, engine, state };
  };
  const interject = (text: string, scene: string, pending: { i: number; text: string; if?: string }[] = []) => ({ type: 'interject' as const, text, scene, shown: [{ speaker: '아시나', text: '보인 줄' }], pending });

  test('말을 끼워 넣어도 이야기 자리는 그대로이고 입력이 기록에 쌓인다', async () => {
    const { engine, state } = start();
    const { state: after, step } = await engine.act(state, interject('저기 누구 없어요?', state.beat));
    expect(after.beat).toBe(state.beat);
    expect(after.said).toEqual(['저기 누구 없어요?']);
    expect(after.flags['말함']).toBe(true);
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(step.prompt.type).toBe(state.free ? 'free' : step.prompt.type);
  });

  test('끼어들어 길을 물으면 뒤의 길 묻는 고정 줄만 빠진다', async () => {
    const { engine, state } = start();
    const asks = { i: 3, text: '혹시 크라차까지 가는 길을 아시나요?', if: 'flag:길_물음 && !flag:이미_길_물음' };
    const other = { i: 5, text: '다른 조건 줄', if: '!flag:미소녀' };
    const prepared: GameState = { ...state, flags: { 길_물음: true } };
    const { state: after, step } = await engine.act(prepared, interject('길 좀 알려 주세요', state.beat, [asks, other]));
    expect(after.flags['이미_길_물음']).toBe(true);
    const revise = step.events.find((e) => e.type === 'revise');
    expect(revise?.type === 'revise' && revise.drop).toEqual([3]);
  });

  test('보이는 장면에 판정이 있으면 큰 행동은 남은 줄을 건너뛰고 판정으로 간다', async () => {
    const gm = new FakeGm(() => approachOf('water'));
    const engine = new Engine(scenario, gm, fakeClock().now);
    const { state } = engine.newGame(1, 'j');
    const { step } = await engine.act(state, interject('물을 마신다', state.beat, [{ i: 2, text: '남은 줄' }]));
    const revise = step.events.find((e) => e.type === 'revise');
    expect(revise?.type === 'revise' && [revise.jump, revise.drop]).toEqual([true, [2]]);
    expect(step.events.some((e) => e.type === 'roll')).toBe(true);
  });

  test('판정이 뒤 장면에 있으면 큰 행동은 굴리지 않고 묘사만 하며, 없는 인물은 화자에서 빠진다', async () => {
    const seen: string[][] = [];
    const gm = new FakeGm(() => approachOf('water'));
    const talk = gm.talk.bind(gm);
    gm.talk = (ctx) => {
      seen.push([...ctx.free.speakers]);
      return talk(ctx);
    };
    const engine = new Engine(scenario, gm, fakeClock().now);
    const { state } = engine.newGame(1, 'k');
    const { state: after, step } = await engine.act(state, interject('도망친다', 'b00_open'));
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(after.beat).toBe(state.beat);
    expect(seen[0]).not.toContain('남자');
  });
});

describe('테이블 진행', () => {
  const gmOf = (reading = new FakeGm()) => {
    const engine = new Engine(scenario, reading, fakeClock().now);
    return { engine, ...engine.newGame(2, 'c') };
  };

  test('허락을 묻는 말은 판정 없이 GM 이 답한다', async () => {
    expect(isPermission('여기 물 있어?')).toBe(true);
    expect(isPermission('지도를 볼 수 있어?')).toBe(true);
    expect(isPermission('지도를 본다')).toBe(false);
    const gm = new FakeGm(() => approachOf('water'));
    const { engine, state } = gmOf(gm);
    const { step } = await engine.act(state, { type: 'free', text: '가방에 물 있어?' });
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(gm.calls).toContain('explain:가방에 물 있어?');
  });

  test('뜻이 약한 설득은 한 번 되묻고, 구체적인 말은 판정에 보정을 준다', async () => {
    const gm = new FakeGm(() => approachOf('plead'));
    const engine = new Engine(scenario, gm, fakeClock().now);
    let { state, step } = engine.newGame(1, 'd');
    for (const id of ['water', 'run']) ({ state, step } = await engine.act(state, { type: 'approach', id }));
    expect(state.beat).toBe('b05_why');
    const first = await engine.act(state, { type: 'free', text: '설득한다' });
    expect(first.step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(first.step.events.some((e) => e.type === 'line' && e.text === '뭐라고 말할 건데?')).toBe(true);
    const second = await engine.act(first.state, { type: 'free', text: '저는 그저 길을 묻던 여행자일 뿐이에요' });
    const roll = second.step.events.find((e) => e.type === 'roll');
    expect(roll?.type === 'roll' && roll.mods.some((m) => m.label === '입력한 말')).toBe(true);
    expect(second.state.flags['말_여행자']).toBe(true);
  });

  test('말만 거듭하면 여우 힌트가 한 번 나온다', async () => {
    const { engine, state } = gmOf();
    const first = await engine.act(state, { type: 'free', text: '너 몇 살이야' });
    const second = await engine.act(first.state, { type: 'free', text: '오늘 날씨 좋네' });
    const third = await engine.act(second.state, { type: 'free', text: '정말 덥다' });
    const hints = (s: Step) => s.events.filter((e) => e.type === 'line' && e.speaker === 'GM' && e.text.includes('같은 수가 있어')).length;
    expect(hints(first.step)).toBe(0);
    expect(hints(second.step)).toBe(1);
    expect(hints(third.step)).toBe(0);
  });

  test('지어낸 말과 놓친 단서는 뒤 장면에서 인물이 한 줄씩 되받는다', async () => {
    const lines = async (flags: Record<string, boolean>, talked?: string) => {
      const gm = new FakeGm(() => approachOf('plead'));
      const engine = new Engine(scenario, gm, fakeClock().now);
      let { state, step } = engine.newGame(1, 'e');
      for (const id of ['water', 'run', 'beauty']) ({ state, step } = await engine.act(state, { type: 'approach', id }));
      const prepared: GameState = { ...state, flags: { ...state.flags, ...flags }, ...(talked ? { talked } : {}) };
      ({ step } = await engine.act(prepared, { type: 'approach', id: 'dodge' }));
      return step.events.flatMap((e) => (e.type === 'line' ? [e.text] : []));
    };
    expect((await lines({ 말_상인: true })).some((t) => t.includes('상인이라던'))).toBe(true);
    // 장면마다 한 줄씩, 놓친 단서가 먼저 나온다.
    expect((await lines({ 방향_놓침: true, 말_상인: true })).filter((t) => t.includes('상인이라던') || t.includes('남쪽도 모르고')).map((t) => t.slice(0, 5))).toEqual(['남쪽도 모', '상인이라던']);
    expect((await lines({}, '고양이 좋아하세요')).some((t) => t.includes("아까 '고양이 좋아하세요'"))).toBe(true);
  });
});

describe('처음 하는 사람', () => {
  const start = (gm = new FakeGm()) => {
    const engine = new Engine(scenario, gm, fakeClock().now);
    return { engine, gm, ...engine.newGame(1, 'n') };
  };
  const toMan = async (gm: FakeGm) => {
    const engine = new Engine(scenario, gm, fakeClock().now);
    let { state, step } = engine.newGame(1, 'm');
    for (const id of ['water', 'run']) ({ state, step } = await engine.act(state, { type: 'approach', id }));
    return { engine, state, step };
  };
  const gmLines = (s: Step) => s.events.flatMap((e) => (e.type === 'line' && e.style === 'gm' ? [e.text] : []));

  test('첫 입력 직전에 안내가 한 번 나온다', () => {
    const { step } = start();
    expect(gmLines(step).filter((t) => t.includes('행동으로 적어도'))).toHaveLength(1);
  });

  test('틀어질 입력은 한 번 묻고, 그래도 하면 진행한다', async () => {
    const gm = new FakeGm(() => approachOf('plead'));
    const { engine, state } = await toMan(gm);
    const asked = await engine.act(state, { type: 'free', text: '남자를 공격한다' });
    expect(gmLines(asked.step).some((t) => t.includes('그래도 할 거야'))).toBe(true);
    expect(asked.step.events.some((e) => e.type === 'roll')).toBe(false);
    const done = await engine.act(asked.state, { type: 'free', text: '응' });
    expect(done.step.events.some((e) => e.type === 'roll')).toBe(true);
  });

  test('다른 말을 하면 물음은 사라지고, 끝낸다고 답하면 결말로 간다', async () => {
    const { engine, state } = start();
    const asked = await engine.act(state, { type: 'free', text: '그만할래' });
    expect(asked.state.pendingRisk?.quit).toBe(true);
    const other = await engine.act(asked.state, { type: 'free', text: '더 해 볼게 고마워' });
    expect(other.state.pendingRisk).toBeUndefined();
    const again = await engine.act(other.state, { type: 'free', text: '그만할래' });
    const quit = await engine.act(again.state, { type: 'free', text: '응' });
    expect(quit.state.ending).toBe('quit');
    expect(quit.step.prompt.type).toBe('end');
  });

  test('막막하다는 말에는 안심과 할 수 있는 것을 준다', async () => {
    const { engine, state } = start();
    const { step } = await engine.act(state, { type: 'free', text: '뭐 해야 돼?' });
    const line = gmLines(step).at(-1) ?? '';
    expect(line.startsWith('잘 가고 있어.')).toBe(true);
    expect(line).toContain('같은 수가 있어');
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
  });

  test('힌트 뒤에도 그 자리면 장면 사건이 한 번 나오고 귀찌가 준다', async () => {
    const { engine, state } = start();
    let s = state;
    const seen: string[] = [];
    for (const text of ['너 몇 살이야', '오늘 날씨 좋네', '정말 덥다']) {
      const r = await engine.act(s, { type: 'free', text });
      s = r.state;
      seen.push(...r.step.events.flatMap((e) => (e.type === 'line' ? [e.text] : [])));
    }
    expect(seen.filter((t) => t.includes('모래바람이 한 차례'))).toHaveLength(1);
    expect(s.tracks.귀찌).toBe(state.tracks.귀찌 - 1);
  });

  test('짚어 둔 것을 쓰면 보정과 칭찬을 주고, 등급 설명은 등급마다 한 번이다', async () => {
    const gm = new FakeGm(() => approachOf('plead'));
    const { engine, state } = await toMan(gm);
    const { step } = await engine.act(state, { type: 'free', text: '터번의 보석을 보니 귀한 분이시죠' });
    const roll = step.events.find((e) => e.type === 'roll');
    expect(roll?.type === 'roll' && roll.mods.some((m) => m.label === '기억해 둔 것')).toBe(true);
    expect(gmLines(step).some((t) => t.includes('기억하고 있었네'))).toBe(true);
  });
});

describe('이야기 지도', () => {
  const play = async (ids: string[]) => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now);
    let { state } = engine.newGame(3, 'a');
    for (const id of ids) ({ state } = await engine.act(state, { type: 'approach', id }));
    return state;
  };

  test('안 가 본 칸은 이름도 장면 id 도 응답에 없다', async () => {
    const view = buildAtlas(scenario, recordAtlas(emptyAtlas(), await play(['water', 'run'])));
    const json = JSON.stringify(view);
    for (const hidden of ['크라차로 가는 길', '길잡이 계약', '값을 매긴 여자', '수상한 이방인', '흥미로운 여자', '살아남은 자', 'e_road', 'r5_claim', 'road', 'deal']) expect(json).not.toContain(hidden);
    expect(view.nodes.filter((n) => n.label !== null).map((n) => n.label)).toEqual(['사람?!', '왜지?']);
    for (const name of ['베히다트', '시하드', '폐하', '국왕']) expect(json).not.toContain(name);
  });

  test('다음 판에도 기록이 남고 지나온 길은 이번 판만 표시한다', async () => {
    const first = recordAtlas(emptyAtlas(), await play(['water', 'run']));
    const second = recordAtlas(first, await play(['water']));
    const view = buildAtlas(scenario, second);
    expect(view.nodes.filter((n) => n.label !== null).length).toBe(2);
    expect(view.nodes.filter((n) => n.onPath).length).toBe(1);
    expect(buildAtlas(scenario, emptyAtlas()).nodes.every((n) => n.label === null)).toBe(true);
  });
});

describe('행운', () => {
  const toMiss = async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, true);
    for (let seed = 1; seed < 400; seed++) {
      const { state } = engine.newGame(seed, 'l');
      const r = await engine.act(state, { type: 'approach', id: 'map' });
      if (r.step.prompt.type === 'luck') return { engine, ...r };
    }
    throw new Error('실패하는 시드가 없습니다');
  };

  test('쓰면 모자란 만큼 깎고 대가 있는 성공으로 잇는다', async () => {
    const { engine, state, step } = await toMiss();
    if (step.prompt.type !== 'luck') throw new Error('묻는 창이 아닙니다');
    const need = step.prompt.need;
    const used = await engine.act(state, { type: 'luck', use: true });
    expect(used.state.tracks.행운).toBe(state.tracks.행운 - need);
    expect(used.state.log.filter((e) => e.kind === 'check').at(-1)).toMatchObject({ roll: { tier: 'mixed' } });
    expect(used.state.pendingLuck).toBeUndefined();
  });

  test('안 쓰면 실패로 잇고 행운은 그대로다', async () => {
    const { engine, state } = await toMiss();
    const skip = await engine.act(state, { type: 'luck', use: false });
    expect(skip.state.tracks.행운).toBe(state.tracks.행운);
    expect(skip.state.log.filter((e) => e.kind === 'check').at(-1)).toMatchObject({ roll: { tier: 'miss' } });
  });

  test('모자라면 묻지 않고 실패로 잇는다', async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, true);
    let shortfall = false;
    for (let seed = 1; seed < 400 && !shortfall; seed++) {
      const { state } = engine.newGame(seed, 'l');
      const r = await engine.act({ ...state, tracks: { ...state.tracks, 행운: 1 } }, { type: 'approach', id: 'map' });
      shortfall = r.step.events.some((e) => e.type === 'line' && /행운이 \d+ 모자라/.test(e.text));
      if (shortfall) expect(r.step.prompt.type).not.toBe('luck');
    }
    expect(shortfall).toBe(true);
  });

  test('묻는 창에 다른 말을 쳐도 창은 그대로다', async () => {
    const { engine, state } = await toMiss();
    const talk = await engine.act(state, { type: 'free', text: '잠깐만 생각 좀 할게' });
    expect(talk.step.prompt.type).toBe('luck');
    expect(talk.state.pendingLuck).toBeDefined();
  });
});

