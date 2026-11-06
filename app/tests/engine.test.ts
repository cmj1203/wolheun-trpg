import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeFacts, Engine, improvLabel, isPermission, type GmContext, type GmLines, type Interpretation } from '../src/engine/engine.ts';
import { splitMixed } from '../src/engine/text.ts';
import { SaveError, listSaves, readSave, readSaveView, writeSave } from '../src/engine/save.ts';
import { checkScenario, faceProblem, parseScenario } from '../src/engine/scenario.ts';
import { summarize } from '../src/engine/summary.ts';
import { GameError, type Action, type GameState, type Step } from '../src/engine/types.ts';
import { buildAtlas, emptyAtlas, forkBeats, recordAtlas } from '../src/engine/atlas.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { FakeGm, META, SCENARIO_PATH, approachOf, fakeClock, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();

async function toGaze(seed: number, gm = new FakeGm(() => approachOf('plead'))) {
  const clock = fakeClock();
  const engine = new Engine(scenario, gm, clock.now);
  let { state, step } = engine.newGame(seed, `t${seed}`);
  for (const action of [
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

  test('대본의 face 는 입식이 있는 표정이어야 하고, 없는 표정(sad)은 읽을 때 막힌다', async () => {
    // 속마음은 아시나 입식(후드·변장 둘 다)으로 풀린다. GM 여우는 자기 표정 집합(thinking)이 따로 있다.
    expect(faceProblem(scenario, '남자', 'wary')).toBeNull();
    expect(faceProblem(scenario, '속마음', 'surprised')).toBeNull();
    expect(faceProblem(scenario, '아시나', 'neutral')).toBeNull();
    expect(faceProblem(scenario, 'GM', 'thinking')).toBeNull();
    expect(faceProblem(scenario, '남자', 'sad')).toContain('받은 값: sad');
    expect(faceProblem(scenario, '남자', 'scared')).toContain('받은 값: scared');
    const missingSprite = { ...scenario.sprites };
    delete missingSprite.man_sneer;
    expect(faceProblem({ ...scenario, sprites: missingSprite }, '남자', 'sneer')).toContain('man_sneer');
    expect(faceProblem(scenario, 'GM', 'sad')).toContain('gm_sad');
    expect(faceProblem(scenario, '나레이션', 'smile')).toContain('나레이션');
    const source = await Bun.file(SCENARIO_PATH).text();
    expect(source).not.toContain('face: sad');
    expect(() => parseScenario(source.replace('face: wary', 'face: sad'))).toThrow(/받은 값: sad/);
  });
});

describe('엔진 진행', () => {
  test('주인공의 미인계 CG가 남자의 표정 반응 줄을 덮지 않는다', async () => {
    class FaceGm extends FakeGm {
      override async narrate() {
        return { lines: [
          { speaker: '나레이션', text: '나는 뻔뻔하게 웃었다.' },
          { speaker: '남자', text: '그런 수를 쓸 셈인가.', face: 'sneer' },
        ], meta: META };
      }
    }
    const engine = new Engine({ ...scenario, start: 'b05_why' }, new FaceGm(() => ({
      kind: 'approach', approach: 'beauty', item: null, spoken: true, source: 'llm', meta: META,
    })), () => 0, false);
    const { state } = engine.newGame(13, 'cg-face59');
    let result = await engine.act(state, { type: 'free', text: '저처럼 예쁜 여자를 베실 거예요?' });
    const events = [...result.step.events];
    if (result.state.pendingLuck) {
      result = await engine.act(result.state, { type: 'luck', use: false });
      events.push(...result.step.events);
    }
    const narration = events.find(e => e.type === 'line' && e.text === '나는 뻔뻔하게 웃었다.');
    const male = events.find(e => e.type === 'line' && e.text === '그런 수를 쓸 셈인가.');
    expect(narration).toMatchObject({ type: 'line', cg: 'cg_beauty' });
    expect(male).toMatchObject({ type: 'line', face: 'sneer' });
    expect(male?.type === 'line' ? male.cg : '줄 없음').toBeUndefined();
  });

  test('새 게임은 첫 비트의 자유 입력에서 멈춘다', () => {
    const engine = new Engine(scenario, new FakeGm());
    const { state, step } = engine.newGame(1, 's');
    expect(state.beat).toBe('b02_people');
    expect(step.prompt.type).toBe('free');
    expect(step.hud.tracks.find((t) => t.key === '귀찌')?.label).toBe('귀찌 수명');
    // b02_people 는 time 으로 tracks 가 한 번, 장면 검사(twist) 한 번. 시드 1 은 끼어드는 일(모래바람)이라 tracks 가 한 번 더 남는다.
    expect(state.log.flatMap((e) => (e.kind === 'beat' ? [e.beat] : [e.kind]))).toEqual(['start', 'b00_open', 'b01_sand', 'b02_people', 'twist']);
  });

  test('의심·귀찌만 조각 시계이고 위험 칸 경계는 fates 의 징조 문턱에서 온다', () => {
    const engine = new Engine(scenario, new FakeGm());
    const { step } = engine.newGame(2, 's'); // 시드 2 는 장면 검사가 '그대로'라 귀찌가 time 만큼만 줄어 있다.
    const by = Object.fromEntries(step.hud.tracks.map((t) => [t.key, t]));
    expect(by['의심']?.clock).toEqual({ kind: 'progress', warnAt: 7 });
    expect(by['귀찌']?.clock).toEqual({ kind: 'countdown', warnAt: 2 });
    // 줄어드는 시계는 시작할 때 꽉 차 있다(b02_people 의 time 으로 첫 자유 입력 자리에서는 한 칸 비어 있다).
    expect(by['귀찌']?.max).toBe(scenario.sheet.tracks.귀찌);
    expect(by['귀찌']?.value).toBe(scenario.sheet.tracks.귀찌);
    for (const key of ['집착', '호감', '탈주', '행운'] as const) expect(by[key]?.clock).toBeUndefined();
  });

  test('b01_sand 는 입력 없이 흐르고 첫 자유 입력은 b02_people 다', () => {
    expect(scenario.beats.b01_sand?.free).toBeUndefined();
    const { step } = new Engine(scenario, new FakeGm()).newGame(2, 's');
    const scenes = step.events.flatMap((e) => (e.type === 'scene' ? [e.beat] : []));
    expect(scenes).toEqual(['b00_open', 'b01_sand', 'b02_people']);
    expect(step.prompt.type === 'free' && step.prompt.beat).toBe('b02_people');
  });

  test('여는 글에는 GM 줄이 없고, 원작 인트로 순서의 CG 만 쓰며(은발·전환 없음) 원작에 없는 귀찌 설명 두 줄 없이 사막 횡단 줄로 간다', () => {
    const { step } = new Engine(scenario, new FakeGm()).newGame(1, 's');
    const firstScene = step.events.findIndex((e) => e.type === 'scene' && e.beat === 'b01_sand');
    const opening = step.events.slice(0, firstScene).flatMap((e) => (e.type === 'line' ? [e] : []));
    expect(opening.some((l) => l.style === 'gm')).toBe(false);
    expect([...new Set(opening.flatMap((l) => (l.cg ? [l.cg] : [])))]).toEqual(['cg_open_sun', 'cg_open_land', 'cg_open_dark', 'cg_open_blade', 'cg_cromwell', 'cg_manor', 'cg_hill', 'cg_travel_3cuts']);
    expect(opening.some((l) => l.cg_from !== undefined)).toBe(false);
    // 원작 c001~c003 자막 경계대로 나눈 첫 줄(글자는 예전 한 줄과 같다) 뒤에 c004 는 글 없는 한 박자다.
    expect(opening.slice(0, 3).map((l) => l.text).join(' ')).toBe('꿈에도 몰랐다. 거대한 태양 아래, 고국이 아닌 낯선 땅에서 죽음을 맞이하게 될 줄은―');
    expect(opening[3]).toMatchObject({ text: '', cg: 'cg_open_blade', style: 'narration' });
    expect(opening[4]?.cg).toBe('cg_cromwell');
    for (const needle of ['페시안', '공녀라는 게', '갈색으로']) {
      expect(opening.some((l) => l.text.includes(needle))).toBe(false);
    }
    const travel = opening.findIndex((l) => l.text.startsWith('어느새 난 북대륙의'));
    expect(opening[travel - 1]?.cg).toBe('cg_travel_3cuts');
    expect(opening[travel]?.cg).toBe('cg_travel_3cuts');
    expect(opening[travel + 1]?.text).toStartWith('그렇게 남대륙의 크라차로');
    if (step.prompt.type !== 'free') throw new Error('자유 입력이 아닙니다');
    expect(step.prompt.aim).toBe('저 사람들에게 다가갈지, 먼저 살필지, 피해 갈지 정한다.');
  });

  test('후드를 쓴 판에서도 b06 칼날 CG 는 원작 c057(후드 없음)이고 그 뒤 입식이 후드 없는 쪽으로 바뀌며, 미소녀라고 하지 않은 판에는 "어디가 아름답다는 거지"가 없다', async () => {
    const engine = new Engine(scenario, new FakeGm());
    let { state, step } = engine.newGame(5, 's');
    for (const id of ['run', 'plead']) ({ state, step } = await engine.act(state, { type: 'approach', id }));
    expect(state.beat).toBe('b06_swing');
    const cgs = step.events.flatMap((e) => (e.type === 'line' && e.cg ? [e.cg] : []));
    expect(cgs).toContain('cg_swing');
    expect(cgs).not.toContain('cg_swing_hood');
    const swingAt = step.events.findIndex((e) => e.type === 'line' && e.cg === 'cg_swing');
    const spriteAt = step.events.findIndex((e) => e.type === 'sprite' && e.cast === '아시나' && e.sprite === 'asina');
    expect(spriteAt).toBeGreaterThan(swingAt);
    expect(state.flags['후드_벗음']).toBe(true);
    expect(activeFacts(scenario, state).map((f) => f.text).join(' ')).toContain('후드를 벗어');
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
      for (const id of ['run']) ({ state } = await engine.act(state, { type: 'approach', id }));
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

  test('수첩: 처음엔 누구나·아시나가 아는 것만, 남자는 만난 뒤 적히고(여우 소개 줄 없이), 숨길 것은 적히지 않는다', async () => {
    const engine = new Engine(scenario, new FakeGm());
    let { state, step } = engine.newGame(3, 's');
    const names = () => step.hud.notes.map((n) => n.name);
    expect(names()).toEqual(expect.arrayContaining(['크롬웰 제국', '지르다', '아시나', '마법 귀찌']));
    expect(step.hud.notes.map((n) => `${n.name} ${n.text}`).join(' ')).not.toMatch(/페시안|적국/);
    expect(names()).not.toContain('붉은 눈의 남자');
    expect(step.hud.trackGate).toEqual([
      { note: 'man', tracks: ['의심', '집착', '호감'] },
      { note: 'captive', tracks: ['탈주'] },
      { flag: '귀찌_설명', tracks: ['귀찌'] },
    ]);
    ({ state, step } = await engine.act(state, { type: 'approach', id: 'run' }));
    // 19-C: 판정 뒤 숫자 설명(explainTier)과 수첩 소개 줄(note.intro)은 이야기 화면에서 나오지 않는다.
    expect(step.events.some((e) => e.type === 'roll')).toBe(true);
    expect(step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
    expect(step.hud.trackGate.map((g) => g.note ?? g.flag)).toEqual(['captive', '귀찌_설명']);
    expect(names()).toContain('붉은 눈의 남자');
    expect(step.events.some((e) => e.type === 'note' && e.id === 'man')).toBe(true);
    const all = step.hud.notes.map((n) => `${n.name} ${n.text}`).join(' ');
    for (const word of ['베히다트', '왕이다', '페시안', '적국']) expect(all).not.toContain(word);
    expect(state.beat).toBe('b05_why');
  });

  test('이야기 입력칸의 배경 질문은 여우가 받지 않고 질문 모드 안내만 뜨며 장면은 그대로다(대화 횟수도 안 늘어난다)', async () => {
    const gm = new FakeGm(() => ({ kind: 'ask', source: 'rule', meta: META }));
    const engine = new Engine(scenario, gm);
    const start = engine.newGame(1, 's');
    const { state, step } = await engine.act(start.state, { type: 'free', text: '크롬웰이 뭐야?' });
    expect(gm.calls.some((c) => c.startsWith('explain:'))).toBe(false);
    expect(step.events.some((e) => e.type === 'notice' && e.kind === 'ask')).toBe(true);
    expect(step.events.some((e) => e.type === 'line')).toBe(false);
    expect(state.said ?? []).not.toContain('크롬웰이 뭐야?');
    expect(state.beat).toBe('b02_people');
    expect(state.free?.talks).toBe(0);
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(state.log.some((e) => e.kind === 'input' && e.result === 'ask')).toBe(true);
  });

  test('실패해도 이야기가 다음 비트로 넘어가고 대가가 적용된다', async () => {
    let found = false;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const engine = new Engine(scenario, new FakeGm());
      const start = engine.newGame(seed, 's');
      const { state, step } = await engine.act(start.state, { type: 'approach', id: 'run' });
      const roll = step.events.find((e) => e.type === 'roll');
      if (roll?.type !== 'roll' || roll.tier !== 'miss') continue;
      found = true;
      expect(state.beat).toBe('b05_why');
      const hit = await (async () => { for (let s = 1; s < 400; s++) { const e = new Engine(scenario, new FakeGm()); const g = e.newGame(s, 's'); const r = await e.act(g.state, { type: 'approach', id: 'run' }); const q = r.step.events.find((v) => v.type === 'roll'); if (q?.type === 'roll' && q.tier === 'hit') return r.state; } throw new Error('hit 시드 없음'); })();
      expect(state.tracks.의심).toBe(hit.tracks.의심 + 1);
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
  const withoutIdleThreat = (story = scenario) => {
    const beat = story.beats.b05_why;
    if (!beat?.free?.idle) throw new Error('b05 위협이 필요합니다');
    return { ...story, beats: { ...story.beats, b05_why: { ...beat, free: { ...beat.free, idle: { ...beat.free.idle, threat: false } } } } };
  };
  async function atWhy(gm: FakeGm, seed = 5, story = scenario) {
    const engine = new Engine(story, gm);
    let { state, step } = engine.newGame(seed, 's');
    ({ state, step } = await engine.act(state, { type: 'approach', id: 'run' }));
    expect(state.beat).toBe('b05_why');
    return { engine, state, step };
  }

  test('GM 이 돌려준 플래그는 켜고, 화면에 나온 줄은 화자별로 이번 판 장부에 남는다', async () => {
    class HoodGm extends FakeGm {
      override async talk(): Promise<GmLines> {
        return { lines: [{ speaker: '남자', text: '…뭐?' }], meta: { ...META, setFlags: ['후드_벗음'] } };
      }
    }
    const { engine, state: at } = await atWhy(new HoodGm());
    const { state, step } = await engine.act(at, { type: 'free', text: '안녕' });
    expect(state.flags['후드_벗음']).toBe(true);
    const types = step.events.map((ev) => ev.type);
    expect(types.indexOf('sprite')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('sprite')).toBeLessThan(types.indexOf('line'));
    expect(state.spoken?.['남자']).toContain('…뭐?');
  });

  test('고정·모델·복원 대사의 말줄임표만 통일하고 숫자와 코드 표기는 보존한다', async () => {
    const raw = '...뭐? 잠깐.... Wait... 1.25 1...3 v1...2 ...items https://a/.../b';
    const displayed = '…뭐? 잠깐… Wait… 1.25 1...3 v1...2 ...items https://a/.../b';
    const start = scenario.beats.b05_why;
    if (!start) throw new Error('입력 대기 비트가 필요합니다');
    const story = { ...scenario, start: start.id, beats: { ...scenario.beats, [start.id]: {
      ...start, lines: [{ speaker: '나레이션', text: raw }],
    } } };
    class EllipsisGm extends FakeGm {
      override async talk(): Promise<GmLines> {
        return { lines: [{ speaker: '남자', text: raw }], meta: META };
      }
    }
    const engine = new Engine(story, new EllipsisGm(() => ({ kind: 'talk', source: 'llm', meta: META })));
    const fresh = engine.newGame(5, 'ellipsis');
    for (const step of [fresh.step, engine.resume({ ...fresh.state, beat: start.id })]) {
      expect(step.events.filter(e => e.type === 'line').map(e => e.text)).toContain(displayed);
    }
    const { engine: talking, state } = await atWhy(new EllipsisGm(() => ({ kind: 'talk', source: 'llm', meta: META })));
    const reply = await talking.act(state, { type: 'free', text: '안녕' });
    expect(reply.step.events.flatMap(e => e.type === 'line' && e.by === 'gm' ? [e.text] : [])).toContain(displayed);
  });

  test('즉시 닥칠 위협이 없는 무브 표는 징조→압박→시간 순서로 진행된다', async () => {
    let { engine, state } = await atWhy(talkGm(), 5, withoutIdleThreat());
    let step: Step;
    const scriptLines = (s: Step) => s.events.flatMap((e) => (e.type === 'line' && e.by === 'script' ? [e.text] : []));
    for (const text of ['배고파', '너 몇 살이야']) {
      ({ state, step } = await engine.act(state, { type: 'free', text }));
      expect(state.beat).toBe('b05_why');
      expect(step.events.some((e) => e.type === 'roll')).toBe(false);
      expect(state.free?.moves ?? []).toEqual([]);
    }
    // ① 위협의 징조: 장면 사건(nudge) + 귀찌 -1 + 머뭇 1
    ({ state, step } = await engine.act(state, { type: 'free', text: 'ㅋㅋㅋ' }));
    expect(state.beat).toBe('b05_why');
    expect(state.free?.moves).toEqual(['threat']);
    expect(scriptLines(step).length).toBeGreaterThan(0);
    expect(state.flags['머뭇']).toBe(1);
    // ② 상대가 압박: press 줄, 아직 판정 없음, 머뭇 2(쓰러짐 징조)
    ({ state, step } = await engine.act(state, { type: 'free', text: '모래가 맛있겠다' }));
    expect(state.beat).toBe('b05_why');
    expect(state.free?.moves).toEqual(['threat', 'press']);
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(state.flags['머뭇']).toBe(2);
    // ③ 대가 붙은 기회: b05 의 offer 줄(칼끝을 내림)이 나레이션으로 나오고 머뭇은 그대로 2
    ({ state, step } = await engine.act(state, { type: 'free', text: '음' }));
    expect(state.beat).toBe('b05_why');
    expect(state.free?.moves).toEqual(['threat', 'press', 'offer']);
    expect(scriptLines(step).some((t) => t.startsWith('남자가 칼끝을 살짝 내렸다'))).toBe(true);
    expect(state.flags['머뭇']).toBe(2);
    // ④ 시간이 감: b05 에는 시간 대가가 없어 공통 줄 + 귀찌 -1, 머뭇 3 → 쓰러지는 작은 끝
    const before = state.tracks.귀찌;
    ({ state, step } = await engine.act(state, { type: 'free', text: '하늘이 파랗다' }));
    expect(state.free?.moves ?? state.log.filter((e) => e.kind === 'beat').at(-1)?.beat).toBeTruthy();
    expect(scriptLines(step)).toContain('해가 한 뼘 더 기울었다.');
    expect(state.ending).toBe('collapse');
    expect(state.tracks.귀찌).toBe(before);
  });

  test('GM 무브 표: press 가 없는 장면은 상대행동 대가로 압박하고, 시간 무브는 시간 대가를 써서 같은 대가가 판정 대가로 다시 나오지 않는다', async () => {
    const prove = scenario.beats['r4_prove'];
    if (!prove?.free) throw new Error('r4_prove 가 없습니다');
    const r4 = { ...prove.free, press: [] };
    const noPress = { ...scenario, beats: { ...scenario.beats, r4_prove: { ...prove, free: r4 } } };
    const engine = new Engine(noPress, talkGm(), fakeClock().now);
    let { state } = engine.newGame(1, 'mv');
    state = { ...state, beat: 'r4_prove', free: { beat: 'r4_prove', talks: 0, rolls: 0 } };
    const texts = (s: Step) => s.events.flatMap((e) => (e.type === 'line' ? [e.text] : []));
    let step: Step;
    for (const text of ['음', '글쎄']) ({ state, step } = await engine.act(state, { type: 'free', text }));
    ({ state, step } = await engine.act(state, { type: 'free', text: '잠깐' }));
    expect(state.free?.moves).toEqual(['threat']);
    ({ state, step } = await engine.act(state, { type: 'free', text: '으음' }));
    expect(state.free?.moves).toEqual(['threat', 'press']);
    const pressed = (r4.prices ?? []).filter((p) => p.tag === '상대행동' && p.weight === 'soft').map((p) => p.text);
    expect(texts(step).some((t) => pressed.includes(t))).toBe(true);
    expect((state.free?.prices ?? []).length).toBe(1);
    const usedPress = state.free?.prices?.[0];
    ({ state, step } = await engine.act(state, { type: 'free', text: '저기' }));
    const clocks = (r4.prices ?? []).filter((p) => p.tag === '시간' && p.weight === 'soft').map((p) => p.text);
    expect(texts(step).some((t) => clocks.includes(t))).toBe(true);
    expect(state.free?.prices ?? state.log.filter((e) => e.kind === 'input').length).toBeTruthy();
    // 무브로 쓴 대가는 그 장면의 뽑힌 대가 목록에 들어가 판정 대가로 거듭 나오지 않는다.
    if (state.free) expect(state.free.prices).toContain(usedPress);
  });

  test('GM 무브 표: offer 가 있는 장면은 압박 뒤에 기회를 한 번 내고 머뭇을 쌓지 않으며, 효과는 적용된다', async () => {
    const offer = { lines: [{ speaker: '나레이션', text: '남자가 칼끝을 살짝 내렸다. 말할 틈이 생겼다.' }], effects: { flags: { 기회_틈: true } } };
    const why = scenario.beats['b05_why'];
    if (!why?.free) throw new Error('b05_why 가 없습니다');
    const withOffer = { ...scenario, beats: { ...scenario.beats, b05_why: { ...why, free: { ...why.free, offer } } } };
    const engine = new Engine(withoutIdleThreat(withOffer), talkGm(), fakeClock().now);
    let { state } = engine.newGame(1, 'of');
    state = { ...state, beat: 'b05_why', free: { beat: 'b05_why', talks: 0, rolls: 0 } };
    let step: Step;
    for (const text of ['음', '글쎄', '잠깐', '으음']) ({ state, step } = await engine.act(state, { type: 'free', text }));
    expect(state.free?.moves).toEqual(['threat', 'press']);
    expect(state.flags['머뭇']).toBe(2);
    ({ state, step } = await engine.act(state, { type: 'free', text: '저기' }));
    expect(state.free?.moves).toEqual(['threat', 'press', 'offer']);
    expect(step.events.some((e) => e.type === 'line' && e.text === offer.lines[0]!.text)).toBe(true);
    expect(state.flags['기회_틈']).toBe(true);
    expect(state.flags['머뭇']).toBe(2);
    expect(state.ending).toBeNull();
    expect(step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
  });

  test('수령 없는 b02·b08 제안은 없고 b05는 두 번째 대화에 위협으로 진행된다', async () => {
    expect(scenario.beats.b02_people?.free?.offer).toBeUndefined();
    expect(scenario.beats.b08_gaze?.free?.offer).toBeUndefined();
    const expected: Record<string, { head: string; flag: boolean }> = {
      b05_why: { head: '남자가 칼끝을 살짝 내렸다', flag: false },
    };
    for (const [beat, want] of Object.entries(expected)) {
      const offer = scenario.beats[beat]?.free?.offer;
      if (!offer) throw new Error(`${beat} 에 offer 가 없습니다`);
      expect(offer.lines[0]!.speaker).toBe('나레이션');
      expect(offer.lines[0]!.text.startsWith(want.head)).toBe(true);
      const engine = new Engine(scenario, talkGm(), fakeClock().now);
      let { state } = engine.newGame(1, 'oy');
      state = { ...state, beat, free: { beat, talks: 0, rolls: 0 } };
      if (beat === 'b05_why') {
        ({ state } = await engine.act(state, { type: 'free', text: '음' }));
        expect(state.beat).toBe('b05_why');
        const next = await engine.act(state, { type: 'free', text: '글쎄' });
        expect(next.state.beat).toBe('b06_swing');
        expect(next.step.events.some((e) => e.type === 'roll')).toBe(false);
        continue;
      }
      for (const text of ['음', '글쎄', '잠깐', '으음']) ({ state } = await engine.act(state, { type: 'free', text }));
      expect(state.free?.moves).toEqual(['threat', 'press']);
      let step: Step;
      ({ state, step } = await engine.act(state, { type: 'free', text: '저기' }));
      expect(state.free?.moves).toEqual(['threat', 'press', 'offer']);
      expect(step.events.some((e) => e.type === 'line' && e.text === offer.lines[0]!.text && e.style !== 'gm')).toBe(true);
      expect(state.flags['기회_물'] === true).toBe(want.flag);
      expect(state.ending).toBeNull();
    }
  });

  test('로더는 offer 의 빈 줄과 여우 화자를 거부한다', async () => {
    const source = await Bun.file(SCENARIO_PATH).text();
    const real = '      offer:\n        lines:\n          - 나레이션: 남자가 칼끝을 살짝 내렸다. 말할 틈이 생겼다. 그가 다시 들어 올리기 전까지.\n';
    const inject = (offer: string) => source.replace(real, `      offer:\n${offer}\n`);
    expect(source).toContain(real);
    expect(() => parseScenario(inject('        lines: []'))).toThrow(/offer\.lines/);
    expect(() => parseScenario(inject('        lines:\n          - GM: 기회야.'))).toThrow(/여우가 말하지 않습니다/);
  });

  test('같은 말을 되풀이하면 재촉이 빨라지고 어조가 바뀐다', async () => {
    const tones: (string | undefined)[] = [];
    class ToneGm extends FakeGm {
      override async talk(ctx: Parameters<FakeGm['talk']>[0]) {
        tones.push(ctx.tone);
        return super.talk(ctx);
      }
    }
    let { engine, state } = await atWhy(new ToneGm(() => ({ kind: 'talk', source: 'llm', meta: META })), 5, withoutIdleThreat());
    ({ state } = await engine.act(state, { type: 'free', text: '배고파' }));
    ({ state } = await engine.act(state, { type: 'free', text: '배고파!' }));
    expect(tones).toEqual(['plain', 'repeat']);
    expect(state.free?.talks).toBe(3);
  });

  test('목록에 없는 행동은 GM 이 고른 능력치와 난이도로 판정하고 장면이 진행된다', async () => {
    const gm = new FakeGm(() => ({ kind: 'improv', stat: '근력', difficulty: -1, label: '춤추기', absurd: false, bold: false, source: 'llm', meta: META }));
    const { engine, state } = await atWhy(gm);
    const { state: after, step } = await engine.act(state, { type: 'free', text: '춤을 춘다' });
    const roll = step.events.find((e) => e.type === 'roll');
    // 판정 이름은 GM 메모(reason)가 아니라 플레이어가 쓴 행동을 짧게 줄인 것이다.
    expect(roll?.type === 'roll' && [roll.stat, roll.label, roll.mods.at(-1)?.value]).toEqual(['근력', '춤을 춘다', -1]);
    expect(improvLabel('말도 안 되는 농담으로 상황을 모면하려 한다.')).toBe('말도 안 되는 농담으로 상황을 모면하려 한다');
    expect(improvLabel('(아무 말 없이 노래를 부른다)')).toBe('아무 말 없이 노래를 부른다');
    expect(improvLabel('돌을 주워서 저 사람들한테 던진다')).toBe('돌을 주워서 저 사람들한테 던진다');
    expect(improvLabel('모래를 한 줌 집어서 얼굴에 뿌린다')).toBe('모래를 한 줌 집어서 얼굴에 뿌린다');
    expect(improvLabel('물을 아껴서 조금만 마시고 지도를 펼친 다음 해가 지는 쪽으로 천천히 걸어 간다')).toBe('물을 아껴서 조금만 마시고 지도를 펼친 다음 해가…');
    expect(improvLabel('(아무 말 없이 노래를 부른다)')).not.toMatch(/[()…]/);
    expect(after.beat).toBe('b06_swing');
    expect(gm.calls.some((call) => call.startsWith('narrate:improv:'))).toBe(true);
    expect(gm.calls.at(-1)).toBe('talk:춤을 춘다');
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
    expect(state.playMs).toBe(3 * 5_000);
    const times = state.log.map((e) => e.playMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const sum = summarize(scenario, state);
    expect(sum.checks.length).toBe(3);
    expect(sum.decisions.map((d) => d.text)).toContain('결백을 호소한다');
  });

  test('돌아보기는 선택 → 판정 → 대가를 일어난 순서대로 놓고, 선택·판정 수는 따로 모은 목록과 같다', async () => {
    let priced: ReturnType<typeof summarize> | null = null;
    for (let seed = 1; seed <= 60 && !priced; seed++) {
      const sum = summarize(scenario, (await toGaze(seed)).state);
      expect(sum.replay.filter((r) => r.kind === 'decision').length).toBe(sum.decisions.length);
      expect(sum.replay.filter((r) => r.kind === 'check').length).toBe(sum.checks.length);
      const times = sum.replay.map((r) => r.playMs);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      if (sum.replay.some((r) => r.kind === 'price')) priced = sum;
    }
    if (!priced) throw new Error('60개 시드 안에서 대가가 나온 판이 없습니다');
    const kinds = priced.replay.map((r) => r.kind);
    const at = kinds.indexOf('price');
    // 판정 대가는 그 판정 바로 뒤에, 판정은 그 판정을 부른 선택 뒤에 온다.
    expect(kinds[at - 1]).toBe('check');
    expect(kinds.slice(0, at - 1)).toContain('decision');
  });

  test('돌아보기에 세계 무브(압박·시간)로 나온 대가도 남는다', async () => {
    const prove = scenario.beats['r4_prove'];
    if (!prove?.free) throw new Error('r4_prove 가 없습니다');
    const noPress = { ...scenario, beats: { ...scenario.beats, r4_prove: { ...prove, free: { ...prove.free, press: [] } } } };
    const engine = new Engine(noPress, talkGm(), fakeClock().now);
    let { state } = engine.newGame(1, 'rp');
    state = { ...state, beat: 'r4_prove', free: { beat: 'r4_prove', talks: 0, rolls: 0 } };
    for (const text of ['음', '글쎄', '잠깐', '으음', '저기']) ({ state } = await engine.act(state, { type: 'free', text }));
    const prices = summarize(noPress, state).replay.filter((r) => r.kind === 'price');
    expect(prices.map((p) => p.tag)).toEqual(['상대행동', '시간']);
    expect(prices.every((p) => p.beatTitle === prove.title && p.text.length > 0)).toBe(true);
  });

  test('오래 손을 놓은 시간은 3분까지만 플레이 시간에 더한다', async () => {
    const clock = fakeClock();
    const engine = new Engine(scenario, new FakeGm(), clock.now);
    const { state } = engine.newGame(1, 's');
    clock.advance(60 * 60 * 1000);
    const { state: after } = await engine.act(state, { type: 'approach', id: 'run' });
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
  abilities: { 재치: 1, 손재주: 1, 매력: 0, 근력: 0, 교양: 0 }
  tracks: { 체력: 3, 정신력: 4, 의심: 0, 집착: 0, 호감: 0, 귀찌: 5, 탈주: 0, 행운: 0 }
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
      state_guard: []
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
    const { engine, state } = await toGaze(8, new SlowNarrate(() => approachOf('stare_back')));
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

  test('후드를 쓴 판은 b06 칼날 CG(원작 c057, 후드 없음) 줄 뒤에 입식이 바뀌고, 그 뒤 피하기에는 벗겨지는 서술도 입식 교체도 없다', async () => {
    const { engine, state } = await atWhy(new FakeGm(), 3);
    expect(state.flags.후드_벗음).toBeUndefined();
    const { state: after, step } = await engine.act(state, { type: 'approach', id: 'plead' });
    const at = (pick: (e: (typeof step.events)[number]) => boolean) => step.events.findIndex(pick);
    expect(at((e) => e.type === 'sprite')).toBeGreaterThan(at((e) => e.type === 'line' && e.cg === 'cg_swing'));
    expect(after.flags.후드_벗음).toBe(true);
    const { step: next } = await engine.act(after, { type: 'approach', id: 'dodge' });
    expect(next.events.some((e) => e.type === 'sprite')).toBe(false);
    expect(next.events.some((e) => e.type === 'line' && e.text.includes('후드가 벗겨'))).toBe(false);
  });

  const HOOD_LINE = '그 바람에 후드가 벗겨졌다.';

  test('b06 에서 이미 벗었으니 b07 에서 벗겨지는 줄과 입식 교체가 나오지 않는다', async () => {
    const { engine, state } = await atWhy(new FakeGm(), 3);
    const { state: swing } = await engine.act(state, { type: 'approach', id: 'plead' });
    const { step, state: after } = await engine.act(swing, { type: 'approach', id: 'block' });
    expect(step.events.some((e) => e.type === 'scene' && e.beat === 'b07_rule')).toBe(true);
    expect(step.events.some((e) => e.type === 'line' && e.text === HOOD_LINE)).toBe(false);
    expect(step.events.some((e) => e.type === 'sprite')).toBe(false);
    expect(after.flags.후드_벗음).toBe(true);
  });

  test('GM 이 쓴 서술에도 그 결과의 CG 가 붙는다', async () => {
    const { engine, state } = await atWhy(new PlainNarrate(() => approachOf('beauty')), 3);
    const { step } = await engine.act(state, { type: 'free', text: '대륙에서 하나뿐인 미소녀니까요' });
    const line = step.events.find((e) => e.type === 'line' && e.by === 'gm');
    expect(line).toMatchObject({ text: '…뭐라고?', cg: 'cg_beauty' });
  });

  test('GM 이 끝내 못 써 대체 줄로 끝나도 그 결과의 CG 가 붙는다', async () => {
    class FallbackNarrate extends FakeGm {
      override async narrate() {
        return { lines: [{ speaker: '남자', text: '…뭐?' }], meta: { ...META, fallback: true } };
      }
    }
    const { engine, state } = await atWhy(new FallbackNarrate(() => approachOf('beauty')), 3);
    const { step } = await engine.act(state, { type: 'free', text: '대륙에서 하나뿐인 미소녀니까요' });
    const line = step.events.find((e) => e.type === 'line' && e.text === '…뭐?');
    expect(line).toMatchObject({ cg: 'cg_beauty' });
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

  test('끼어든 질문은 자리를 유지하고 입력 로그에만 남으며 긍정 주장으로 기억되지 않는다', async () => {
    const { engine, state } = start();
    const { state: after, step } = await engine.act(state, interject('저기 누구 없어요?', state.beat));
    expect(after.beat).toBe(state.beat);
    expect(after.said).toEqual([]);
    expect(after.log.some((e) => e.kind === 'input' && e.text === '저기 누구 없어요?')).toBe(true);
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
    const gm = new FakeGm(() => approachOf('run'));
    const engine = new Engine(scenario, gm, fakeClock().now);
    const { state } = engine.newGame(1, 'j');
    const { step } = await engine.act(state, interject('달려가서 길을 묻는다', state.beat, [{ i: 2, text: '남은 줄' }]));
    const revise = step.events.find((e) => e.type === 'revise');
    expect(revise?.type === 'revise' && [revise.jump, revise.drop]).toEqual([true, [2]]);
    expect(step.events.some((e) => e.type === 'roll')).toBe(true);
  });

  test('판정이 뒤 장면에 있으면 큰 행동은 굴리지 않고 묘사만 하며, 없는 인물은 화자에서 빠진다', async () => {
    const seen: string[][] = [];
    const gm = new FakeGm(() => approachOf('run'));
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

  test('허락을 묻는 말은 질문 모드에서만 GM 이 답하고, 이야기 입력칸에서는 특별 처리 없이 해석대로 받는다', async () => {
    expect(isPermission('여기 물 있어?')).toBe(true);
    expect(isPermission('지도를 볼 수 있어?')).toBe(true);
    expect(isPermission('지도를 본다')).toBe(false);
    // 이야기 입력칸: 해석이 ask 면 안내(notice)만 뜨고 여우 줄이 없다.
    const asking = new FakeGm(() => ({ kind: 'ask', source: 'rule', meta: META }));
    const story = gmOf(asking);
    const told = await story.engine.act(story.state, { type: 'free', text: '가방에 물 있어?' });
    expect(told.step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(told.step.events.some((e) => e.type === 'notice' && e.kind === 'ask')).toBe(true);
    expect(told.step.events.some((e) => e.type === 'line')).toBe(false);
    expect(asking.calls.some((c) => c.startsWith('explain:'))).toBe(false);
    // 질문 모드: 여우가 explain(permission) 으로 답한다. 판정은 없다.
    const seen: GmContext[] = [];
    class PermGm extends FakeGm {
      override async explain(ctx: GmContext): Promise<GmLines> {
        seen.push(ctx);
        return super.explain(ctx);
      }
    }
    const gm = new PermGm(() => approachOf('run'));
    const { engine, state } = gmOf(gm);
    const { step } = await engine.act(state, { type: 'ask', text: '가방에 물 있어?' });
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(gm.calls).toContain('explain:가방에 물 있어?');
    expect(seen.at(-1)?.permission).toBe(true);
    expect(step.events.some((e) => e.type === 'line' && e.speaker === 'GM')).toBe(true);
  });

  test('뜻이 약한 설득도 되묻지 않고 바로 굴리고, 구체적인 말은 판정에 보정을 준다', async () => {
    const gm = new FakeGm(() => approachOf('plead'));
    const engine = new Engine(scenario, gm, fakeClock().now);
    let { state, step } = engine.newGame(1, 'd');
    for (const id of ['run']) ({ state, step } = await engine.act(state, { type: 'approach', id }));
    expect(state.beat).toBe('b05_why');
    const first = await engine.act(state, { type: 'free', text: '설득한다' });
    expect(first.step.events.some((e) => e.type === 'roll')).toBe(true);
    expect(first.step.events.some((e) => e.type === 'line' && e.text === '뭐라고 말할 건데?')).toBe(false);
    expect(first.step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
    const second = await engine.act(state, { type: 'free', text: '저는 그저 길을 묻던 여행자일 뿐이에요' });
    const roll = second.step.events.find((e) => e.type === 'roll');
    expect(roll?.type === 'roll' && roll.mods.some((m) => m.label === '입력한 말')).toBe(true);
    expect(second.state.flags['말_여행자']).toBe(true);
  });

  test('말만 거듭해도 여우 힌트 줄은 나오지 않고, 세 번째에 세계가 먼저 움직인다(nudge)', async () => {
    const { engine, state } = gmOf();
    const first = await engine.act(state, { type: 'free', text: '너 몇 살이야' });
    const second = await engine.act(first.state, { type: 'free', text: '오늘 날씨 좋네' });
    const third = await engine.act(second.state, { type: 'free', text: '정말 덥다' });
    const gmLines = (s: Step) => s.events.filter((e) => e.type === 'line' && e.style === 'gm').length;
    const nudges = (s: Step) => s.events.filter((e) => e.type === 'line' && e.text.includes('세 사람의 그림자가 움직이기')).length;
    for (const s of [first.step, second.step, third.step]) expect(gmLines(s)).toBe(0);
    expect([nudges(first.step), nudges(second.step), nudges(third.step)]).toEqual([0, 0, 1]);
    expect(third.state.free?.nudged).toBe(true);
  });

  test('지어낸 말과 놓친 단서는 뒤 장면에서 인물이 한 줄씩 되받는다', async () => {
    const lines = async (flags: Record<string, boolean>, talked?: string) => {
      const gm = new FakeGm(() => approachOf('plead'));
      const engine = new Engine(scenario, gm, fakeClock().now);
      let { state, step } = engine.newGame(1, 'e');
      for (const id of ['run', 'beauty']) ({ state, step } = await engine.act(state, { type: 'approach', id }));
      const prepared: GameState = { ...state, flags: { ...state.flags, ...flags }, ...(talked ? { talked } : {}) };
      ({ step } = await engine.act(prepared, { type: 'approach', id: 'dodge' }));
      return step.events.flatMap((e) => (e.type === 'line' ? [e.text] : []));
    };
    expect((await lines({ 말_상인: true })).some((t) => t.includes('상인이라던'))).toBe(true);
    // 장면마다 한 줄씩, 놓친 단서가 먼저 나온다.
    const callbackLines = await lines({ 보석_놓침: true, 말_상인: true });
    expect(callbackLines.indexOf('하. 웃기는 여자군.')).toBeGreaterThanOrEqual(0);
    expect(callbackLines.findIndex((t) => t.includes('상인이라던'))).toBeGreaterThan(callbackLines.indexOf('하. 웃기는 여자군.'));
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
    for (const id of ['run']) ({ state, step } = await engine.act(state, { type: 'approach', id }));
    return { engine, state, step };
  };
  const gmLines = (s: Step) => s.events.flatMap((e) => (e.type === 'line' && e.style === 'gm' ? [e.text] : []));

  test('첫 입력칸이 떠도 여우 안내 줄은 없고 플래그만 선다', () => {
    const { step, state } = start();
    const firstScene = step.events.findIndex((e) => e.type === 'scene' && e.beat === 'b01_sand');
    expect(firstScene).toBeGreaterThan(0);
    expect(gmLines({ ...step, events: step.events.slice(firstScene) })).toEqual([]);
    expect(gmLines(step).some((t) => t.includes('행동으로 적어도'))).toBe(false);
    expect(state.flags['안내_입력']).toBe(true);
  });

  test('칼 앞에서 틀어질 입력은 되묻지 않고 징조 속마음 한 줄 뒤 바로 굴린다', async () => {
    const gm = new FakeGm(() => ({ kind: 'approach', approach: 'plead', item: null, risk: 'attack', source: 'llm', meta: META }));
    const { engine, state } = await toMan(gm);
    const done = await engine.act(state, { type: 'free', text: '남자를 공격한다' });
    expect(gmLines(done.step)).toEqual([]);
    const omen = done.step.events.findIndex((e) => e.type === 'line' && e.text === '맨손이다. 저 칼은 진짜다.');
    const roll = done.step.events.findIndex((e) => e.type === 'roll');
    expect(omen).toBeGreaterThanOrEqual(0);
    expect(roll).toBeGreaterThan(omen);
    expect(done.state.pendingRisk).toBeUndefined();
    expect(done.state.flags['징조_맨손']).toBe(true);
    // 강행 판정은 끝나면 위험_강행을 지우고 miss 면 위험_실패를 세운다. 경고를 거친 입력으로 남는다.
    expect(done.state.warned).toContain('남자를공격한다');
    expect(done.state.flags['위험_강행']).toBeUndefined();
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

  test('막막하다는 말을 질문 모드로 물으면 안심과 할 수 있는 것을 준다', async () => {
    const { engine, state } = start();
    const { step } = await engine.act(state, { type: 'ask', text: '뭐 해야 돼?' });
    const line = gmLines(step).at(-1) ?? '';
    expect(line.startsWith('잘 가고 있어.')).toBe(true);
    expect(line).toContain('같은 수가 있어');
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
  });

  test('힌트 뒤에도 그 자리면 장면 사건이 한 번 나오고 비공개 귀찌는 줄지 않는다', async () => {
    const { engine, state } = start();
    let s = state;
    const seen: string[] = [];
    for (const text of ['너 몇 살이야', '오늘 날씨 좋네', '정말 덥다']) {
      const r = await engine.act(s, { type: 'free', text });
      s = r.state;
      seen.push(...r.step.events.flatMap((e) => (e.type === 'line' ? [e.text] : [])));
    }
    expect(seen.filter((t) => t.includes('세 사람의 그림자가 움직이기'))).toHaveLength(1);
    expect(s.tracks.귀찌).toBe(state.tracks.귀찌);
  });

  test('짚어 둔 것을 쓰면 보정만 주고 칭찬 줄은 없다', async () => {
    const gm = new FakeGm(() => approachOf('plead'));
    const { engine, state } = await toMan(gm);
    const { step } = await engine.act(state, { type: 'free', text: '터번의 보석을 보니 귀한 분이시죠' });
    const roll = step.events.find((e) => e.type === 'roll');
    expect(roll?.type === 'roll' && roll.mods.some((m) => m.label === '기억해 둔 것')).toBe(true);
    expect(gmLines(step)).toEqual([]);
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
    const view = buildAtlas(scenario, recordAtlas(emptyAtlas(), await play(['run'])));
    const json = JSON.stringify(view);
    for (const hidden of ['크라차로 가는 길', '길잡이 계약', '값을 매긴 여자', '수상한 이방인', '흥미로운 여자', '살아남은 자', 'e_road', 'r5_claim', 'road', 'deal']) expect(json).not.toContain(hidden);
    expect(view.nodes.filter((n) => n.label !== null).map((n) => n.label)).toEqual(['사람?!', '왜지?']);
    for (const name of ['베히다트', '시하드', '폐하', '국왕']) expect(json).not.toContain(name);
  });

  test('다음 판에도 기록이 남고 지나온 길은 이번 판만 표시한다', async () => {
    const first = recordAtlas(emptyAtlas(), await play(['run']));
    const second = recordAtlas(first, await play([]));
    const view = buildAtlas(scenario, second);
    expect(view.nodes.filter((n) => n.label !== null).length).toBe(2);
    expect(view.nodes.filter((n) => n.onPath).length).toBe(1);
    expect(buildAtlas(scenario, emptyAtlas()).nodes.every((n) => n.label === null)).toBe(true);
  });
});

describe('행운', () => {
  const toMiss = async (tension?: number) => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, true);
    for (let seed = 1; seed < 400; seed++) {
      const { state } = engine.newGame(seed, 'l');
      if (tension !== undefined) state.flags['긴장'] = tension;
      const r = await engine.act(state, { type: 'approach', id: 'run' });
      if (r.step.prompt.type === 'luck') return { engine, ...r };
    }
    throw new Error('실패하는 시드가 없습니다');
  };

  test('쓰면 모자란 만큼 깎고 여우 줄 없이 대가 있는 성공으로 잇는다', async () => {
    const { engine, state, step } = await toMiss();
    if (step.prompt.type !== 'luck') throw new Error('묻는 창이 아닙니다');
    const need = step.prompt.need;
    const used = await engine.act(state, { type: 'luck', use: true });
    expect(used.state.tracks.행운).toBe(state.tracks.행운 - need);
    expect(used.step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
    expect(used.state.log.filter((e) => e.kind === 'check').at(-1)).toMatchObject({ roll: { tier: 'mixed' } });
    expect(used.state.pendingLuck).toBeUndefined();
  });

  test('쓰면 실패로 오른 긴장이 판정 전 값으로 돌아가고 안 쓰면 남는다', async () => {
    const { engine, state } = await toMiss(3);
    expect(state.flags['긴장']).toBe(4);
    const used = await engine.act(state, { type: 'luck', use: true });
    expect(used.state.flags['긴장']).toBe(3);
    const skip = await engine.act(state, { type: 'luck', use: false });
    expect(skip.state.flags['긴장']).toBe(4);
  });

  test('긴장이 상한이라 실패로 오르지 않았으면 행운을 써도 내려가지 않는다', async () => {
    const { engine, state } = await toMiss(6);
    expect(state.flags['긴장']).toBe(6);
    const used = await engine.act(state, { type: 'luck', use: true });
    expect(used.state.flags['긴장']).toBe(6);
  });

  test('안 쓰면 실패로 잇고 행운은 그대로다', async () => {
    const { engine, state } = await toMiss();
    const skip = await engine.act(state, { type: 'luck', use: false });
    expect(skip.state.tracks.행운).toBe(state.tracks.행운);
    expect(skip.state.log.filter((e) => e.kind === 'check').at(-1)).toMatchObject({ roll: { tier: 'miss' } });
  });

  test('모자라면 묻지 않고 여우 줄 없이 실패로 잇는다', async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, true);
    let shortfall = false;
    for (let seed = 1; seed < 400 && !shortfall; seed++) {
      const { state } = engine.newGame(seed, 'l');
      const r = await engine.act({ ...state, tracks: { ...state.tracks, 행운: 1 } }, { type: 'approach', id: 'run' });
      const roll = r.step.events.find((e) => e.type === 'roll');
      // 행운 1 로는 7 까지 메울 수 없는 실패(합 5 이하).
      shortfall = roll?.type === 'roll' && roll.tier === 'miss' && roll.total <= 5;
      if (!shortfall) continue;
      expect(r.step.prompt.type).not.toBe('luck');
      expect(r.state.pendingLuck).toBeUndefined();
      expect(r.step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
      expect(r.state.tracks.행운).toBe(1);
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

describe('변장과 여우에게 묻는 말', () => {
  const play = (seed = 1, gm = new FakeGm(), luck = false) => {
    const engine = new Engine(scenario, gm, fakeClock().now, luck);
    return { engine, gm, ...engine.newGame(seed, 'r') };
  };
  const texts = (s: Step) => s.events.flatMap((e) => (e.type === 'line' ? [e.text] : []));
  const at = (state: GameState, beat: string, flags: GameState['flags'] = {}): GameState => ({ ...state, beat, free: { beat, talks: 0, rolls: 0 }, flags: { ...state.flags, ...flags } });
  /** 앞 판정이 실패해 작은 끝(reckless)으로 갔어도, 같은 판의 기록(warned·징조 플래그)을 지닌 채 b08 로 되돌린다. */
  const back = (state: GameState, flags: GameState['flags'] = {}): GameState => {
    const { 위험_실패: _drop, ...kept } = state.flags;
    return at({ ...state, ending: null, flags: kept }, 'b08_gaze', flags);
  };
  /** 공격이나 때린다는 입력만 해석이 위험하다고 내는 즉흥 행동. */
  const improv = () => new FakeGm((ctx) => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥 행동', absurd: false, bold: false, ...(/공격|때린|빼앗/u.test(ctx.text) ? { risk: 'attack' as const } : {}), source: 'rule', meta: META }));
  const earring = (s: GameState) => s.tracks.귀찌;

  test('해석이 unmask 로 본 입력은 주사위와 제거 불가 서술 없이 받고, 판정 기록과 경고가 없다', async () => {
    const { engine, state } = play(1, new FakeGm(() => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥 행동', absurd: false, bold: false, risk: 'unmask', source: 'llm', meta: META })));
    const before = earring(state);
    const { state: after, step } = await engine.act(state, { type: 'free', text: '귀찌 빼고 다 보여 줄 거야' });
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(after.pendingRisk).toBeUndefined();
    expect(texts(step)).toEqual([]);
    expect(texts(step).join(' ')).not.toContain('그래도 할 거야');
    expect(earring(after)).toBe(before);
    expect(after.said).toEqual([]);
    expect(after.log.some((e) => e.kind === 'check')).toBe(false);
  });

  test('신분을 밝히는 입력은 징조 속마음 한 번 뒤, 남자 앞에서는 의심과 신분_노출로 받고 남자가 없으면 혼잣말로 흐른다', async () => {
    const omen = '웰든이란 이름이 목까지 올라왔다.';
    const seen: GmContext[] = [];
    class SelfGm extends FakeGm {
      override async talk(ctx: GmContext): Promise<GmLines> {
        seen.push(ctx);
        return super.talk(ctx);
      }
    }
    const gm = new SelfGm(() => ({ kind: 'talk', to: 'person', risk: 'identity', source: 'llm', meta: META }));
    const { engine, state } = play(1, gm);
    const alone = await engine.act(state, { type: 'free', text: '정체를 밝힌다' });
    expect(texts(alone.step)).toContain(omen);
    expect(alone.step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
    expect(gm.calls).toEqual(['interpret:정체를 밝힌다', 'talk:정체를 밝힌다']);
    expect(seen.at(-1)?.self).toBe(true);
    expect(alone.state.tracks.의심).toBe(state.tracks.의심);
    expect(alone.state.flags['신분_노출']).toBeUndefined();
    expect(alone.state.flags['징조_정체']).toBe(true);
    // 같은 판에서 남자 앞: 징조는 다시 안 나오고, 의심 +3·신분_노출 뒤 인물이 받는다.
    const claim = await engine.act(at(alone.state, 'b05_why'), { type: 'free', text: '저는 크롬웰의 공녀예요' });
    expect(texts(claim.step)).not.toContain(omen);
    expect(claim.step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
    expect(gm.calls.slice(2)).toEqual(['interpret:저는 크롬웰의 공녀예요', 'talk:저는 크롬웰의 공녀예요']);
    expect(seen.at(-1)?.self).toBeUndefined();
    expect(claim.state.tracks.의심).toBe(alone.state.tracks.의심 + 3);
    expect(claim.state.flags['신분_노출']).toBe(true);
    // 따로 시작한 판에서는 남자 앞에서도 징조가 한 번 나온다.
    const fresh = await engine.act(at(state, 'b05_why'), { type: 'free', text: '저는 크롬웰의 공녀예요' });
    expect(texts(fresh.step)).toContain(omen);
    // 물음문은 징조·수치 없이 평소대로 받는다.
    const asked = await engine.act(at(state, 'b05_why'), { type: 'free', text: '제가 공녀라면 어챌 건데요?' });
    expect(texts(asked.step)).not.toContain(omen);
    expect(asked.state.flags['신분_노출']).toBeUndefined();
  });

  test('여우 줄에 끼어든 질문은 여우가 받지 않고 안내만 뜨며, 남자 앞에서 한 말과 콜백에 남지 않는다', async () => {
    const { engine, gm, state } = play();
    const before = at(state, 'b05_why');
    const { state: after, step } = await engine.act(before, { type: 'interject', text: '근데 왜 상인이야?', scene: 'b05_why', shown: [{ speaker: 'GM', text: '여우 줄' }], pending: [] });
    expect(gm.calls.some((c) => c.startsWith('explain:'))).toBe(false);
    expect(step.events.some((e) => e.type === 'notice' && e.kind === 'ask')).toBe(true);
    expect(step.events.some((e) => e.type === 'line')).toBe(false);
    expect(after.said).toEqual([]);
    expect(after.heard).toBeUndefined();
    expect(after.flags['말_상인']).toBeUndefined();
  });

  test('남자가 없는 장면의 말은 되받지 않고, 남자 앞에서 한 말은 작전 회의에 줄을 나눠 나온다', async () => {
    const { engine, state } = play();
    const alone = await engine.act(state, { type: 'free', text: '저는 상인이에요' });
    expect(alone.state.flags['말_상인']).toBeUndefined();
    const talk = await engine.act(at(state, 'b05_why'), { type: 'free', text: '저 그냥 길 잃은 사람이에요. 제발 살려 주세요' });
    expect(talk.state.heard).toEqual([{ text: '저 그냥 길 잃은 사람이에요. 제발 살려 주세요', action: false }]);
  });

  test('경고를 거친 입력에는 칭찬과 계획 보정이 없다', async () => {
    const { engine, state } = play(1, improv());
    const prepared = at(state, 'b08_gaze', { 작전_회의: true });
    const plain = await engine.act(prepared, { type: 'free', text: '지도를 내려친다' });
    const roll = (s: Step) => s.events.find((e) => e.type === 'roll');
    const plainRoll = roll(plain.step);
    expect(plainRoll?.type === 'roll' && plainRoll.mods.map((m) => m.label)).toEqual(['계획']);
    // 되묻지 않고 바로 굴린다. 경고를 거친 입력이라 계획 보정이 없다.
    const warned = await engine.act(prepared, { type: 'free', text: '지도로 남자를 공격한다' });
    const warnedRoll = roll(warned.step);
    expect(warnedRoll?.type === 'roll' && warnedRoll.mods).toEqual([]);
    expect(texts(warned.step).join(' ')).not.toContain('제대로 쓰네');
    const again = await engine.act(back(warned.state, { 작전_회의: true }), { type: 'free', text: '지도로 남자를 공격한다' });
    expect(texts(again.step)).not.toContain('맨손이다. 저 칼은 진짜다.');
    const againRoll = roll(again.step);
    expect(againRoll?.type === 'roll' && againRoll.mods).toEqual([]);
    const named = await engine.act(prepared, { type: 'free', text: '남자 눈을 쳐다본다' });
    expect(texts(named.step).join(' ')).not.toContain('제대로 쓰네');
  });

  test('칼 앞 맨손 행동의 징조는 한 판 한 번이고, 다른 입력·같은 입력 모두 되묻지 않고 경고를 거친 입력으로 굴린다', async () => {
    const { engine, state } = play(1, improv());
    const omened = (s: Step) => texts(s).includes('맨손이다. 저 칼은 진짜다.');
    const rolled = (s: Step) => s.events.some((e) => e.type === 'roll');
    const first = await engine.act(at(state, 'b08_gaze'), { type: 'free', text: '지도로 남자를 공격한다' });
    expect([omened(first.step), rolled(first.step)]).toEqual([true, true]);
    const other = await engine.act(back(first.state), { type: 'free', text: '남자를 때린다' });
    expect([omened(other.step), rolled(other.step)]).toEqual([false, true]);
    const same = await engine.act(back(other.state), { type: 'free', text: '남자를 때린다' });
    expect([omened(same.step), rolled(same.step)]).toEqual([false, true]);
    expect(same.state.warned).toEqual(['지도로남자를공격한다', '남자를때린다']);
    for (const s of [first, other, same]) {
      expect(s.state.pendingRisk).toBeUndefined();
      expect(s.step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
    }
  });

  test('질문 모드의 게임 질문은 그 항목의 뜻을 답하고, 판정과 귀찌 소모가 없고 말이 막힌 횟수에도 들지 않는다', async () => {
    const gm = new FakeGm(() => ({ kind: 'ask', game: 'luck', source: 'llm', meta: META }));
    const { engine, state } = play(1, gm);
    const story = await engine.act(state, { type: 'free', text: '행운이 뭔지' });
    expect(texts(story.step)).toEqual([]);
    expect(story.step.events.some((e) => e.type === 'notice' && e.kind === 'ask')).toBe(true);
    const before = state.tracks.귀찌;
    let now = state;
    for (let i = 0; i < 6; i++) {
      const r = await engine.act(now, { type: 'ask', text: `행운이 뭔지 ${i}` });
      expect(texts(r.step)).toEqual([`${scenario.gameHelp?.find((h) => h.id === 'luck')?.say} 지금은 ${state.tracks.행운}${[2, 4, 5, 9].includes(state.tracks.행운) ? '야' : '이야'}.`]);
      expect(r.step.events.some((e) => e.type === 'roll')).toBe(false);
      now = r.state;
    }
    expect(now.tracks.귀찌).toBe(before);
    expect(now.said ?? []).toEqual([]);
    expect(now.free?.nudged).toBeFalsy();
    expect(now.free?.talks).toBe(state.free?.talks);
    expect(gm.calls.every((c) => c.startsWith('interpret:'))).toBe(true);
  });

  test('질문 모드에서 끝내겠다는 게임 질문은 귀찌를 깎지 않고 확인 창을 띄우고, 답에 따라 끝나거나 여우 말 없이 이어진다', async () => {
    const gm = new FakeGm(() => ({ kind: 'ask', game: 'quit', source: 'llm', meta: META }));
    const { engine, state } = play(1, gm);
    const asked = await engine.act(state, { type: 'ask', text: '이제 그만 하고 싶은데' });
    expect(asked.state.pendingRisk?.quit).toBe(true);
    expect(asked.step.events.some((e) => e.type === 'confirm' && e.kind === 'quit')).toBe(true);
    expect(asked.step.events.some((e) => e.type === 'line')).toBe(false);
    expect(asked.state.tracks.귀찌).toBe(state.tracks.귀찌);
    const stay = await engine.act(asked.state, { type: 'free', text: '더 해 볼래' });
    expect(stay.state.beat).toBe(state.beat);
    expect(stay.step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
    expect(stay.state.pendingRisk).toBeUndefined();
    for (const yes of ['응', '끝낼래', '끝낼 거야', '그만둘래']) {
      const quit = await engine.act(asked.state, { type: 'free', text: yes });
      expect(quit.state.beat).toBe('e_quit');
    }
    const denied = await engine.act(asked.state, { type: 'free', text: '끝낼 생각 없어' });
    expect(denied.state.beat).toBe(state.beat);
    const moved = await engine.act(asked.state, { type: 'free', text: '해 지는 쪽으로 간다' });
    expect(moved.state.beat).not.toBe('e_quit');
  });

  test('끝낼 거냐는 확인 창에 혼잣말처럼 답해도 여우가 받지 않고 귀찌를 깎지 않는다', async () => {
    let read: Interpretation = { kind: 'ask', game: 'quit', source: 'llm', meta: META };
    const { engine, state } = play(1, new FakeGm(() => read));
    const asked = await engine.act(state, { type: 'ask', text: '끝내고 싶은데' });
    expect(asked.state.pendingRisk?.quit).toBe(true);
    read = { kind: 'talk', to: 'self', source: 'llm', meta: META };
    const stay = await engine.act(asked.state, { type: 'free', text: '끝낼 생각 없어' });
    expect(stay.step.events.flatMap((e) => (e.type === 'line' && e.style === 'gm' ? [e.text] : []))).toEqual([]);
    expect(stay.state.pendingRisk).toBeUndefined();
    expect(stay.state.beat).toBe(state.beat);
    expect(stay.state.tracks.귀찌).toBe(state.tracks.귀찌);
  });

  test('게임 답은 쉼표에서 잘리지 않고 문장으로 끝난다', () => {
    expect((scenario.gameHelp ?? []).filter((h) => !/[.?!]$/u.test(h.say)).map((h) => h.id)).toEqual([]);
    expect(scenario.gameHelp?.find((h) => h.id === 'check')?.say.endsWith('대성공이야.')).toBe(true);
  });

  describe('시도하지 않은 입력', () => {
    const idle = () => new FakeGm(() => ({ kind: 'idle', source: 'rule', meta: META }));
    const lineTexts = (step: Step) => step.events.flatMap((e) => (e.type === 'line' ? [e.text] : []));

    test.each(['b05_why', 'b06_swing', 'r2_bind'])('위협이 있는 %s 는 주사위 없이 그 위협이 닥치고 다음으로 간다', async (beat) => {
      const { engine, state } = play(1, idle());
      const { state: after, step } = await engine.act(at(state, beat), { type: 'free', text: '가만히 있는다' });
      expect(step.events.some((e) => e.type === 'roll')).toBe(false);
      expect(after.log.some((e) => e.kind === 'check')).toBe(false);
      expect(after.beat).not.toBe(beat);
      const want = scenario.beats[beat]?.free?.idle?.lines.map((l) => l.text) ?? [];
      expect(want.length).toBeGreaterThan(0);
      expect(lineTexts(step)[0]).toBe('없다면, 잘 가라.');
      expect(lineTexts(step).slice(1, want.length + 1)).toEqual(want);
    });

    test.each(['b02_people', 'b08_gaze', 'r3_dusk', 'r4_prove', 'r5_claim'])('위협이 없는 %s 는 장면이 먼저 움직이고 한 번 더 그러면 판정 없이 넘어간다', async (beat) => {
      const { engine, state } = play(1, idle());
      const first = await engine.act(at(state, beat), { type: 'free', text: '멍하니 본다' });
      expect(first.state.beat).toBe(beat);
      expect(lineTexts(first.step)).toEqual(scenario.beats[beat]?.free?.nudge?.map((l) => l.text) ?? []);
      const second = await engine.act(first.state, { type: 'free', text: '그냥 서 있다' });
      expect(second.state.beat).not.toBe(beat);
      expect([...first.step.events, ...second.step.events].some((e) => e.type === 'roll')).toBe(false);
    });

    test('대사가 흐르는 중이면 판정도 답도 없이 대사가 이어진다', async () => {
      const gm = idle();
      const { engine, state } = play(1, gm);
      const { step } = await engine.act(at(state, 'b05_why'), { type: 'interject', text: '가만히 있는다', scene: 'b05_why', shown: [{ speaker: '남자', text: '하.' }], pending: [] });
      expect(step.events.some((e) => e.type === 'roll' || e.type === 'line')).toBe(false);
      expect(gm.calls).toEqual(['interpret:가만히 있는다']);
    });
  });

  test('글자 없는 입력은 말한 것으로 치지 않고, 여우 줄에 끼어들어도 물음이 되지 않는다', async () => {
    const gm = new FakeGm();
    const { engine, state } = play(1, gm);
    const { state: after } = await engine.act(at(state, 'b05_why'), { type: 'free', text: '?' });
    expect(after.heard).toBeUndefined();
    const fox = await engine.act(at(state, 'b05_why'), { type: 'interject', text: '?', scene: 'b05_why', shown: [{ speaker: 'GM', text: '여우 줄' }], pending: [] });
    expect(fox.step.events.some((e) => e.type === 'line')).toBe(true);
    expect(gm.calls).not.toContain('explain:?');
  });

  test('끼어든 질문은 곧 나올 줄에 있든 없든 여우가 받지 않고 안내만 뜨며 남은 줄은 그대로다', async () => {
    const note = scenario.notes?.find((n) => n.say && [...n.say.replace(/[^가-힣]/gu, '')].length >= 12);
    if (!note?.say) throw new Error('수첩 설명이 없습니다');
    const gm = new FakeGm(() => ({ kind: 'ask', about: note.id, source: 'llm', meta: META }));
    const { engine, state } = play(1, gm);
    const ask = (pending: { i: number; speaker: string; text: string }[]) => engine.act(state, { type: 'interject', text: '그게 뭐야?', scene: state.beat, shown: [{ speaker: '나레이션', text: '줄' }], pending });
    for (const text of [`앞말 ${note.say} 뒷말`, '전혀 다른 줄이야.']) {
      const r = await ask([{ i: 0, speaker: '나레이션', text }]);
      expect(texts(r.step)).toEqual([]);
      expect(r.step.events.filter((e) => e.type === 'notice' && e.kind === 'ask')).toHaveLength(1);
      expect(r.step.events.some((e) => e.type === 'revise')).toBe(false);
      expect(r.state.said).toEqual(state.said ?? []);
    }
    expect(gm.calls.some((c) => c.startsWith('explain:'))).toBe(false);
  });

  test('칼 앞 맨손 행동은 되묻지 않으니 뒤이은 "아니"도 확인 답이 아닌 새 입력으로 받는다', async () => {
    const { engine, gm, state } = play(1, improv());
    const hit = await engine.act(at(state, 'b08_gaze'), { type: 'free', text: '남자를 때린다' });
    expect(gm.calls[0]).toBe('interpret:남자를 때린다');
    expect(hit.step.events.some((e) => e.type === 'roll')).toBe(true);
    expect(hit.state.pendingRisk).toBeUndefined();
    const no = await engine.act(back(hit.state), { type: 'free', text: '아니' });
    expect(gm.calls).toContain('interpret:아니');
    expect(texts(no.step)).not.toContain('그래, 다른 수를 생각해 봐.');
    expect(no.step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
    expect(no.state.pendingRisk).toBeUndefined();
  });

  test('플레이 방법을 질문 모드로 물으면 모델 없이 여우가 고정 두 줄로 받고, 이야기 입력칸에서는 안내만 뜬다', async () => {
    const { engine, gm, state } = play(1, new FakeGm(() => ({ kind: 'ask', play: true, source: 'llm', meta: META })));
    const story = await engine.act(state, { type: 'free', text: '이거 어떻게 해?' });
    expect(texts(story.step)).toEqual([]);
    expect(story.step.events.some((e) => e.type === 'notice' && e.kind === 'ask')).toBe(true);
    const { step, state: after } = await engine.act(state, { type: 'ask', text: '이거 어떻게 해?' });
    const said = texts(step);
    expect(said).toHaveLength(2);
    expect(said[0]).toContain('아시나가 할 말이나 행동을 그대로 적으면 돼');
    expect(said[1]).toContain('같은 수가 있어');
    expect(step.events.every((e) => e.type !== 'line' || e.style === 'gm')).toBe(true);
    expect(gm.calls).toEqual(['interpret:이거 어떻게 해?', 'interpret:이거 어떻게 해?']);
    expect(after.said ?? []).toEqual([]);
  });

  test('사람이 멀리 있는 장면에서 건넨 말은 다가가 말을 거는 판정으로 가고, 혼잣말은 그렇지 않다', async () => {
    const { engine, state } = play(1, new FakeGm(() => ({ kind: 'talk', to: 'person', source: 'llm', meta: META })));
    const spoken = await engine.act(at(state, 'b02_people'), { type: 'free', text: '거기요! 물 좀 나눠 주세요!' });
    expect(spoken.step.events.some((e) => e.type === 'roll')).toBe(true);
    const alone = play(1, new FakeGm(() => ({ kind: 'talk', to: 'self', source: 'llm', meta: META })));
    const muttered = await alone.engine.act(at(alone.state, 'b02_people'), { type: 'free', text: '신기루인가' });
    expect(muttered.step.events.some((e) => e.type === 'roll')).toBe(false);
  });

  test('혼잣말은 앞사람이 들은 말로 남지 않는다', async () => {
    const { engine, state } = play(1, new FakeGm(() => ({ kind: 'talk', to: 'self', source: 'llm', meta: META })));
    const { state: after } = await engine.act(at(state, 'b05_why'), { type: 'free', text: '아 무서워' });
    expect(after.heard).toBeUndefined();
    expect(after.flags['말함']).toBeUndefined();
  });

  test('행동을 적은 입력은 heard 에 행동으로 남는다', async () => {
    const { engine, state } = play(1, improv());
    const { state: after } = await engine.act(at(state, 'b05_why'), { type: 'free', text: '욕을 한다' });
    expect(after.heard).toEqual([{ text: '욕을 한다', action: true }]);
  });

  test('여우 태클(quip)은 엉뚱한 입력에도 부르지 않는다', async () => {
    class QuipGm extends FakeGm {
      async quip(ctx: GmContext): Promise<GmLines> {
        this.calls.push(`quip:${ctx.text}`);
        return { lines: [{ speaker: 'GM', text: '그게 되겠어!' }], meta: META };
      }
    }
    const read = (odd: boolean) => new QuipGm(() => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥 행동', absurd: false, bold: false, odd, source: 'llm', meta: META }));
    const calm = play(1, read(false));
    await calm.engine.act(calm.state, { type: 'free', text: '주변을 살핀다' });
    expect(calm.gm.calls.some((c) => c.startsWith('quip:'))).toBe(false);
    const odd = play(1, read(true));
    const { step } = await odd.engine.act(odd.state, { type: 'free', text: '물구나무를 선다' });
    expect(odd.gm.calls.some((c) => c.startsWith('quip:'))).toBe(false);
    expect(texts(step)).not.toContain('그게 되겠어!');
  });

  test('칼을 빼앗는 입력은 되묻지 않고 징조 뒤 굴리고, 해도 되는지 묻는 말은 징조 없이 받는다', async () => {
    const { engine, state } = play(1, improv());
    const prepared = at(state, 'b05_why');
    const grab = await engine.act(prepared, { type: 'free', text: '칼을 빼앗는다' });
    expect(grab.state.pendingRisk).toBeUndefined();
    expect(grab.state.warned).toEqual(['칼을빼앗는다']);
    expect(texts(grab.step)).toContain('맨손이다. 저 칼은 진짜다.');
    expect(grab.step.events.some((e) => e.type === 'roll')).toBe(true);
    const may = await engine.act(prepared, { type: 'free', text: '칼을 빼앗을 수 있어?' });
    expect(may.state.pendingRisk).toBeUndefined();
    expect(may.state.warned).toBeUndefined();
    expect(texts(may.step)).not.toContain('맨손이다. 저 칼은 진짜다.');
  });

  test('질문과 행동이 섞이면 행동만 판정하고 질문은 여우 줄 없이 안내 한 건으로 남는다', async () => {
    expect(splitMixed('저 사람들 누구지? 일단 말 걸어본다')).toEqual({ ask: '저 사람들 누구지?', act: '일단 말 걸어본다' });
    expect(splitMixed('저 그냥 길 잃은 사람이에요. 제발 살려 주세요')).toBeNull();
    const gm = new FakeGm(() => ({ kind: 'approach', approach: 'run', item: null, source: 'rule', meta: META }));
    const { engine, state } = play(1, gm);
    const { step } = await engine.act(at(state, 'b02_people'), { type: 'free', text: '저 사람들 누구지? 일단 말 걸어본다' });
    expect(gm.calls[0]).toBe('interpret:일단 말 걸어본다');
    expect(gm.calls.some((c) => c.startsWith('explain:'))).toBe(false);
    expect(step.events.filter((e) => e.type === 'notice' && e.kind === 'ask')).toHaveLength(1);
    expect(step.events.some((e) => e.type === 'line' && e.style === 'gm')).toBe(false);
    expect(step.events.some((e) => e.type === 'roll')).toBe(true);
  });

  test('첫 입력 뒤 여우의 고정 줄은 "다"로 끝나지 않는다', () => {
    const fixed = [
      ...(scenario.notes ?? []).flatMap((n) => [n.intro, n.say]),
      ...(scenario.risky ?? []).map((r) => r.warn),
      ...(scenario.gameHelp ?? []).map((h) => h.say),
      ...(scenario.refuse ?? []).flatMap((r) => r.lines.filter((l) => l.speaker === 'GM').map((l) => l.text)),
    ];
    expect(fixed.filter((t): t is string => t !== undefined && /다[.!…]*$/u.test(t))).toEqual([]);
  });
});

describe('세계 밖 행동(absurd) — 인물이 성격대로 받아치고 이야기는 그대로다', () => {
  const texts = (s: Step) => s.events.flatMap((e) => (e.type === 'line' ? [e.text] : []));
  const gmLines = (s: Step) => s.events.flatMap((e) => (e.type === 'line' && e.style === 'gm' ? [e.text] : []));
  const at = (state: GameState, beat: string): GameState => ({ ...state, beat, free: { beat, talks: 0, rolls: 0 } });
  class AbsurdGm extends FakeGm {
    seen: GmContext[] = [];
    constructor(private readonly deed?: string) {
      super(() => ({ kind: 'improv', stat: '재치', difficulty: -1, label: '즉흥 행동', absurd: true, bold: false, odd: true, risk: 'attack', ...(this.deed ? { deed: this.deed } : {}), source: 'llm', meta: META }));
    }
    override async talk(ctx: GmContext): Promise<GmLines> {
      this.seen.push(ctx);
      return super.talk(ctx);
    }
  }
  const play = (gm: AbsurdGm, beat: string, seed = 1) => {
    const engine = new Engine(scenario, gm, fakeClock().now);
    const { state } = engine.newGame(seed, 'ab');
    return { engine, state: at(state, beat) };
  };

  test('남자 앞: 판정·수치·다음 비트 없이 상대 인물 줄로 받고, 여우 줄과 맨손 징조가 없다', async () => {
    const gm = new AbsurdGm('품을 더듬었지만 잡히는 것이 없었다');
    const { engine, state } = play(gm, 'b05_why');
    const { state: after, step } = await engine.act(state, { type: 'free', text: '핸드폰을 꺼내 경찰에 신고한다' });
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(after.tracks).toEqual(state.tracks);
    expect(after.beat).toBe('b05_why');
    expect(after.ending).toBeNull();
    expect(step.events.some((e) => e.type === 'line' && e.speaker === '남자')).toBe(true);
    expect(gmLines(step)).toEqual([]);
    expect(texts(step)).not.toContain('맨손이다. 저 칼은 진짜다.');
    expect(after.flags['징조_맨손']).toBeUndefined();
    expect(after.pendingRisk).toBeUndefined();
    expect(gm.calls).toEqual(['interpret:핸드폰을 꺼내 경찰에 신고한다', 'talk:핸드폰을 꺼내 경찰에 신고한다']);
    expect(gm.seen.at(-1)?.absurd).toBe(true);
    expect(gm.seen.at(-1)?.self).toBeUndefined();
    expect(after.log.filter((e) => e.kind === 'check')).toHaveLength(0);
  });

  test('인물의 기억에는 세계 밖 낱말이 아니라 해석이 요약한 동작(deed)이 행동으로 남는다', async () => {
    const { engine, state } = play(new AbsurdGm('품을 더듬었지만 잡히는 것이 없었다'), 'b05_why');
    const { state: after } = await engine.act(state, { type: 'free', text: '핸드폰을 꺼낸다' });
    expect(after.heard).toEqual([{ text: '품을 더듬었지만 잡히는 것이 없었다', action: true }]);
    const plain = play(new AbsurdGm(), 'b05_why');
    const { state: noDeed } = await plain.engine.act(plain.state, { type: 'free', text: '총을 쏜다' });
    expect(noDeed.heard?.[0]?.action).toBe(true);
    expect(noDeed.heard?.[0]?.text).not.toContain('총');
  });

  test('혼자 장면: 속마음으로 받고(self) 상대 줄을 요구하지 않으며 기억에는 남지 않는다', async () => {
    const gm = new AbsurdGm('허공에 손을 흔들었다');
    const { engine, state } = play(gm, 'b02_people');
    const { state: after, step } = await engine.act(state, { type: 'free', text: '택시를 부른다' });
    expect(gm.seen.at(-1)?.absurd).toBe(true);
    expect(gm.seen.at(-1)?.self).toBe(true);
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(after.tracks).toEqual(state.tracks);
    expect(after.heard).toBeUndefined();
    expect(gmLines(step)).toEqual([]);
  });

  test('말 걸기와 같이 셈해 세 번이면 세계가 먼저 움직인다', async () => {
    const { engine, state } = play(new AbsurdGm('빈 손을 귀에 대었다'), 'b05_why');
    let cur = state;
    for (const text of ['핸드폰을 쓴다', '전화를 건다']) ({ state: cur } = await engine.act(cur, { type: 'free', text }));
    expect(cur.free?.moves ?? []).toEqual([]);
    const third = await engine.act(cur, { type: 'free', text: '인터넷을 켠다' });
    expect(third.state.free?.moves).toEqual(['threat']);
    expect(third.state.free?.talks).toBe(3);
  });

  test('세계 밖 물건이 든 말(talk)은 지금처럼 인물이 받고 판정이 없다', async () => {
    const gm = new FakeGm(() => ({ kind: 'talk', to: 'person', source: 'llm', meta: META }));
    const engine = new Engine(scenario, gm, fakeClock().now);
    const { state } = engine.newGame(1, 'tk');
    const { step } = await engine.act(at(state, 'b05_why'), { type: 'free', text: '핸드폰 있어요?' });
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(step.events.some((e) => e.type === 'line' && e.speaker === '남자')).toBe(true);
  });

  test('불변식: 시드 1~8, 남자 앞·혼자 장면의 세계 밖 행동에 이야기 화면 여우 줄 0·판정 0', async () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const beat of ['b02_people', 'b05_why', 'b08_gaze']) {
        const { engine, state } = play(new AbsurdGm('품을 더듬었다'), beat, seed);
        const { step, state: after } = await engine.act(state, { type: 'free', text: '핸드폰을 사용한다' });
        expect(gmLines(step)).toEqual([]);
        expect(step.events.some((e) => e.type === 'roll')).toBe(false);
        expect(after.tracks).toEqual(state.tracks);
      }
    }
  });
});

describe('큰 즉흥 행동(bold)과 먼저 일어난 원작 줄', () => {
  const texts = (s: Step) => s.events.flatMap((e) => (e.type === 'line' ? [e.text] : []));
  const boldKiss = (deed: string) => new FakeGm(() => ({ kind: 'improv', stat: '매력', difficulty: 0, label: '입을 맞춤', absurd: false, bold: true, deed, source: 'llm', meta: META }));

  test('큰 행동은 improv_bold 결과를 써서 수치가 두 단계 움직이고 큰_행동 표시가 켜진다', async () => {
    const { engine, state } = await toGaze(3, boldKiss('남자의 입에 입을 맞췄다'));
    expect(state.beat).toBe('b08_gaze');
    const before = { ...state.tracks };
    const asked = await engine.act(state, { type: 'free', text: '뽀뽀' });
    expect(asked.step.events.some((e) => e.type === 'confirm' && e.kind === 'intent')).toBe(true);
    const { state: after, step } = await engine.act(asked.state, { type: 'confirm', ok: true });
    const moved = Math.max(after.tracks.집착 - before.집착, after.tracks.의심 - before.의심);
    expect(moved).toBeGreaterThanOrEqual(2);
    expect(after.flags.큰_행동).toBe(true);
    // b09 는 대사만 있는 장면이라 바로 결말로 이어진다. 거쳐 갔는지는 기록으로 본다.
    expect(after.log.some((e) => e.kind === 'beat' && e.beat === 'b09_verdict')).toBe(true);
    expect(texts(step)).toContain('죽기 직전에 그런 짓을 하는 여자는 처음 보는군.');
    expect(texts(step)).not.toContain('이상한 여자군.');
  });

  test('플레이어가 먼저 해 버린 일과 같은 다음 장면의 원작 줄은 그 줄만 건너뛴다', async () => {
    const { engine, state } = await toGaze(3, boldKiss('남자에게 마음이 바뀌었다고 말했다'));
    const asked = await engine.act(state, { type: 'free', text: '마음이 바뀌었다고 말한다' });
    const { state: after, step } = await engine.act(asked.state, { type: 'free', text: '그래' });
    expect(after.preempted).toContain('마음이바뀌었다');
    const shown = texts(step);
    expect(shown).not.toContain('마음이 바뀌었다.');
    expect(shown).toContain('…바로 죽일까 했는데,');
  });

  test('의도 카드에 답하지 않고 다른 행동으로 넘어가면 카드가 끝나, 뒤의 입력이 그 답이 되지 않는다', async () => {
    const { engine, state } = await toGaze(3, boldKiss('남자의 입에 입을 맞췄다'));
    const asked = await engine.act(state, { type: 'free', text: '뽀뽀' });
    expect(asked.state.pendingIntent?.text).toBe('뽀뽀');
    const approachId = asked.step.prompt.type === 'free' ? asked.step.prompt.approaches[0]?.id : undefined;
    if (!approachId) throw new Error('b08_gaze 에 접근 단추가 없습니다');
    const moved = await engine.act(asked.state, { type: 'approach', id: approachId });
    expect(moved.state.pendingIntent).toBeUndefined();
    expect(moved.state.said ?? []).not.toContain('뽀뽀');
  });

  test('의도 확인 카드: 큰 행동은 굴리기 전에 해석(deed)을 카드로 묻고, 다른 뜻이면 대가 없이 지우며, 다른 말을 적으면 새 입력으로 받는다', async () => {
    const { engine, state } = await toGaze(3, boldKiss('남자의 입에 입을 맞췄다'));
    const tracks = { ...state.tracks };
    const asked = await engine.act(state, { type: 'free', text: '뽀뽀' });
    const card = asked.step.events.find((e) => e.type === 'confirm');
    expect(card).toEqual({ type: 'confirm', kind: 'intent', text: '남자의 입에 입을 맞췄다 — 이렇게 하는 거야?', yes: '그래', no: '다른 뜻' });
    expect(asked.step.events.some((e) => e.type === 'roll' || e.type === 'line')).toBe(false);
    expect(asked.state.pendingIntent?.text).toBe('뽀뽀');
    expect(asked.state.tracks).toEqual(tracks);
    // 다른 뜻: 입력이 지워지고 판정·수치·말 없이 같은 자리
    const no = await engine.act(asked.state, { type: 'confirm', ok: false });
    expect(no.state.pendingIntent).toBeUndefined();
    expect(no.state.said ?? []).not.toContain('뽀뽀');
    expect(no.state.beat).toBe('b08_gaze');
    expect(no.step.events.some((e) => e.type === 'roll' || e.type === 'line')).toBe(false);
    expect(no.state.tracks).toEqual(tracks);
    // 카드가 떠 있는 동안 다른 말을 적으면 새 입력으로 받아 다시 카드가 뜨고, 기다리는 확인이 없을 때 confirm 은 오류다
    const again = await engine.act(asked.state, { type: 'free', text: '손을 잡는다' });
    expect(again.state.pendingIntent?.text).toBe('손을 잡는다');
    expect(again.state.said?.filter((s) => s === '뽀뽀')).toEqual([]);
    await expect(engine.act(no.state, { type: 'confirm', ok: true })).rejects.toBeInstanceOf(GameError);
  });
});


describe('작은 끝(나쁜 엔딩)', () => {
  // 4화 공개 이후에도 보존해야 하는 운명·대가 계약을 검사한다.
  const play = (seed = 1, gm = new FakeGm(), luck = false) => {
    const engine = new Engine(scenario, gm, fakeClock().now, luck);
    const opened = engine.newGame(seed, 'x');
    opened.state.flags['귀찌_설명'] = true;
    return { engine, gm, ...opened };
  };
  const at = (state: GameState, beat: string, flags: GameState['flags'] = {}, tracks: Partial<GameState['tracks']> = {}): GameState => ({
    ...state,
    beat,
    free: { beat, talks: 0, rolls: 0 },
    flags: { ...state.flags, ...flags },
    tracks: { ...state.tracks, ...tracks },
  });
  const gmLines = (s: Step) => s.events.flatMap((e) => (e.type === 'line' && e.style === 'gm' ? [e.text] : []));
  const indexOfLine = (s: Step, text: string) => s.events.findIndex((e) => e.type === 'line' && e.text === text);
  const indexOfEnding = (s: Step) => s.events.findIndex((e) => e.type === 'ending');
  const endingEvent = (s: Step) => s.events.find((e) => e.type === 'ending');
  const improv = () => new FakeGm((ctx) => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥 행동', absurd: false, bold: false, ...(/공격|때린|빼앗/u.test(ctx.text) ? { risk: 'attack' as const } : {}), source: 'rule', meta: META }));
  /** 징조 줄은 GM(여우)이 아니라 나레이션·속마음으로 나온다. */
  const omens = (s: Step) => s.events.flatMap((e) => (e.type === 'line' && e.style !== 'gm' ? [e.text] : []));
  const EARRING_WARN = '귀찌가 귓불에서 차갑게 식어 갔다.';
  const SUSPICION_WARN = '남자의 손이 칼자루로 내려갔다. 눈은 아시나에게서 떨어지지 않았다.';
  const COLLAPSE_WARN = '무릎이 한 번 허물어졌다. 모래가 발목을 잡아당겼다.';

  /** 같은 자리에서 말만 거듭해 쓰러지는 작은 끝까지 간 상태. */
  async function collapse() {
    const { engine, state } = play(1);
    let cur = at(state, 'b02_people', { 머뭇: 1 });
    const steps: Step[] = [];
    for (let i = 0; i < 20 && !cur.ending; i++) {
      const r = await engine.act(cur, { type: 'free', text: `잠깐 생각한다 ${i}` });
      cur = r.state;
      steps.push(r.step);
    }
    return { state: cur, steps };
  }

  test('귀찌 2 이면 여우 말 없이 귀찌가 식는 징조가 한 번 나오고, 징조 뒤 0 이 되면 은발 작은 끝으로 간다', async () => {
    const { engine, state } = play(1);
    const low = await engine.act(at(state, 'b02_people', {}, { 귀찌: 2 }), { type: 'free', text: '하늘을 올려다본다' });
    expect(omens(low.step).filter((t) => t === EARRING_WARN)).toHaveLength(1);
    expect(omens(low.step)).toContain('…오래 못 버티겠어.');
    expect(gmLines(low.step)).toEqual([]);
    expect(low.state.ending).toBeNull();
    const again = await engine.act(low.state, { type: 'free', text: '모래를 만져 본다' });
    expect(omens(again.step)).not.toContain(EARRING_WARN);

    // 경고를 이미 받은 판에서 0 이 되면 끝난다.
    const zero = await engine.act(at(low.state, 'b02_people', {}, { 귀찌: 0 }), { type: 'free', text: '하늘을 올려다본다' });
    expect(zero.state.ending).toBe('unmasked');
    expect(zero.state.beat).toBe('x_unmasked');
    expect(omens(zero.step)).not.toContain(EARRING_WARN);
    expect(endingEvent(zero.step)).toMatchObject({ type: 'ending', id: 'unmasked', bad: true });
  });

  test('징조는 반응할 자리가 남아 있을 때만 나온다: 결말로만 가는 길에서는 귀찌 징조를 생략하고, 자유 입력이 남은 길에서는 한 번 나온다', async () => {
    const hit = async (seed: number, beat: string) => {
      const { engine, state } = play(seed, improv());
      return engine.act(at(state, beat, {}, { 귀찌: 2 }), { type: 'free', text: '지도로 남자를 공격한다' });
    };
    // b08 맨손 공격은 같은 턴에 b09_verdict 를 거쳐 결말로만 간다(반응할 자리 없음).
    const seen = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const r = await hit(seed, 'b08_gaze');
      if (r.state.ending === 'reckless') continue;
      expect(r.state.ending).not.toBeNull();
      expect(omens(r.step)).not.toContain(EARRING_WARN);
      // 징조를 생략해도 작은 끝 조건은 그대로다: b09 에 들어서며 귀찌가 0 에 닿으면 붙들지 않고 은발 작은 끝으로 간다.
      if (r.state.ending === 'unmasked') expect(r.state.tracks.귀찌).toBeLessThanOrEqual(0);
      seen.add(r.state.ending!);
    }
    expect(seen.has('survivor')).toBe(true);
    // 같은 상태라도 자유 입력이 남은 길(b05 → b06 등)에서는 징조가 한 번 나온다.
    const stays: boolean[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = await hit(seed, 'b05_why');
      if (r.state.ending !== null) continue;
      stays.push(true);
      expect(omens(r.step).filter((t) => t === EARRING_WARN)).toHaveLength(1);
      expect(r.state.flags['경고_unmasked']).toBe(true);
    }
    expect(stays.length).toBeGreaterThan(0);
  });

  test('불변식: 징조(경고)가 처음 나오는 턴에는 끝 조건이 참이어도 끝내지 않고 문턱 바로 위(귀찌 1·의심 9·머뭇 2)에 멈춘다', async () => {
    const { engine, state } = play(1);
    // 귀찌: 경고 없이 0 에 닿으면 경고만 나오고 1 에서 멈춘다. 다음 턴에 다시 0 이면 끝.
    const held = await engine.act(at(state, 'b02_people', {}, { 귀찌: 0 }), { type: 'free', text: '하늘을 올려다본다' });
    expect(omens(held.step).filter((t) => t === EARRING_WARN)).toHaveLength(1);
    expect(gmLines(held.step)).toEqual([]);
    expect(held.state.ending).toBeNull();
    expect(held.state.tracks.귀찌).toBe(1);
    expect(held.state.flags['경고_unmasked']).toBe(true);
    const next = await engine.act({ ...held.state, tracks: { ...held.state.tracks, 귀찌: 0 } }, { type: 'free', text: '모래를 만져 본다' });
    expect(next.state.ending).toBe('unmasked');

    // 의심: 경고 없이 10 에 닿으면 9 에서 멈춘다.
    const spy = await engine.act(at(state, 'b08_gaze', {}, { 의심: 10 }), { type: 'free', text: '저기요' });
    expect(omens(spy.step).filter((t) => t === SUSPICION_WARN)).toHaveLength(1);
    expect(gmLines(spy.step)).toEqual([]);
    expect(spy.state.ending).toBeNull();
    expect(spy.state.tracks.의심).toBe(9);

    // 머뭇: 경고 없이 3 에 닿으면 2 에서 멈춘다.
    const slow = await engine.act(at(state, 'b02_people', { 머뭇: 3 }), { type: 'free', text: '하늘을 올려다본다' });
    expect(omens(slow.step).filter((t) => t === COLLAPSE_WARN)).toHaveLength(1);
    expect(gmLines(slow.step)).toEqual([]);
    expect(slow.state.ending).toBeNull();
    expect(slow.state.flags['머뭇']).toBe(2);
  });

  test('의심 7 이면 칼자루로 손이 가는 징조 한 번, 10 이면 첩자 작은 끝이고 상대가 곁에 있던 줄이 나온다', async () => {
    const { engine, state } = play(1);
    const warned = await engine.act(at(state, 'b08_gaze', {}, { 의심: 7 }), { type: 'free', text: '저기요' });
    const twice = await engine.act(warned.state, { type: 'free', text: '잠깐만요' });
    expect([...omens(warned.step), ...omens(twice.step)].filter((t) => t === SUSPICION_WARN)).toHaveLength(1);
    expect([...gmLines(warned.step), ...gmLines(twice.step)]).toEqual([]);
    expect(twice.state.ending).toBeNull();

    const gaze = await toGaze(1, new FakeGm());
    expect(gaze.state.beat).toBe('b08_gaze');
    // 경고를 이미 받은 판(경고_spy_cut)에서 10 에 닿으면 끝난다.
    const cut = await gaze.engine.act({ ...gaze.state, flags: { ...gaze.state.flags, 경고_spy_cut: true }, tracks: { ...gaze.state.tracks, 의심: 10 } }, { type: 'free', text: '저기요' });
    expect(cut.state.ending).toBe('spy_cut');
    expect(cut.state.flags['상대_곁']).toBe(true);
    expect(cut.step.events.some((e) => e.type === 'line' && e.text === '없다면, 잘 가라.')).toBe(true);
    expect(endingEvent(cut.step)).toMatchObject({ id: 'spy_cut', bad: true });
  });

  test('칼 앞에서 되묻지 않고 바로 덤빈 판정이 실패하면 작은 끝, 행운으로 메우면 이어진다', async () => {
    let reckless: { state: GameState; step: Step } | null = null;
    for (let seed = 1; seed < 400 && !reckless; seed++) {
      const { engine, state } = play(seed, improv());
      const r = await engine.act(at(state, 'b08_gaze'), { type: 'free', text: '지도로 남자를 공격한다' });
      expect(r.state.pendingRisk).toBeUndefined();
      const roll = r.step.events.find((e) => e.type === 'roll');
      if (roll?.type === 'roll' && roll.tier === 'miss') reckless = r;
    }
    if (!reckless) throw new Error('실패하는 시드가 없습니다');
    const fell: { state: GameState; step: Step } = reckless;
    expect(fell.state.ending).toBe('reckless');
    expect(fell.state.flags['위험_강행']).toBeUndefined();
    expect(fell.state.flags['위험_실패']).toBe(true);
    expect(endingEvent(fell.step)).toMatchObject({ id: 'reckless', bad: true });

    let saved: { state: GameState; step: Step } | null = null;
    for (let seed = 1; seed < 400 && !saved; seed++) {
      const { engine, state } = play(seed, improv(), true);
      const r = await engine.act(at(state, 'b08_gaze'), { type: 'free', text: '지도로 남자를 공격한다' });
      if (r.step.prompt.type === 'luck') saved = await engine.act(r.state, { type: 'luck', use: true });
    }
    if (!saved) throw new Error('행운을 묻는 시드가 없습니다');
    const kept: { state: GameState; step: Step } = saved;
    // 행운으로 메운 판정은 대가 있는 성공이라 작은 끝이 아니다(b08 뒤 원작 결말로 이어질 수는 있다).
    expect(kept.state.ending).not.toBe('reckless');
    expect(kept.state.log.some((e) => e.kind === 'beat' && e.beat === 'x_reckless')).toBe(false);
    expect(kept.state.flags['위험_실패']).toBeUndefined();
    expect(kept.state.flags['위험_강행']).toBeUndefined();
  });

  test('재촉 뒤에도 말만 거듭하면 무릎이 허물어지는 징조 한 번 뒤 쓰러지는 작은 끝으로 간다', async () => {
    const { state, steps } = await collapse();
    expect(state.ending).toBe('collapse');
    expect(steps.flatMap((s) => omens(s)).filter((t) => t === COLLAPSE_WARN)).toHaveLength(1);
    // 결말 비트(x_collapse)의 여우 끝 줄은 예외다. 그 앞까지는 여우 줄이 없다.
    const beforeEnd = (s: Step) => {
      const end = s.events.findIndex((e) => e.type === 'scene' && e.beat.startsWith('x_'));
      return gmLines({ ...s, events: end < 0 ? s.events : s.events.slice(0, end) });
    };
    expect(steps.flatMap(beforeEnd)).toEqual([]);
    const warnStep = steps.findIndex((s) => indexOfLine(s, COLLAPSE_WARN) >= 0);
    const endStep = steps.findIndex((s) => indexOfEnding(s) >= 0);
    expect(warnStep).toBeLessThanOrEqual(endStep);
    if (warnStep === endStep) expect(indexOfLine(steps[endStep]!, COLLAPSE_WARN)).toBeLessThan(indexOfEnding(steps[endStep]!));
    expect(state.flags['머뭇']).toBeGreaterThanOrEqual(3);
    // 이음새: 머뭇 3 이 차는 턴에는 기본 접근법 판정을 풀지 않고 바로 쓰러진다(성공 직후 쓰러지는 장면 없음).
    // 기본 접근법을 풀면 수치 변화(tracks)가 나온다. 앞 턴에는 있고, 쓰러지는 턴에는 없다.
    expect(steps[endStep - 1]!.events.some((e) => e.type === 'tracks')).toBe(true);
    expect(steps[endStep]!.events.filter((e) => e.type === 'tracks' || e.type === 'roll')).toHaveLength(0);
  });

  test('지도는 작은 끝을 아래 점 줄로 두고 도달한 것만 제목을 주며, 갈림길 비트와 결과 요약이 맞는다', async () => {
    const { state } = await collapse();
    const view = buildAtlas(scenario, recordAtlas(emptyAtlas(), state));
    expect(view.fates).toHaveLength(4);
    expect(view.fates.filter((f) => f.reached).map((f) => f.label)).toEqual(['모래 위에서']);
    expect(view.fates.filter((f) => !f.reached).every((f) => f.label === null)).toBe(true);
    expect([...forkBeats(scenario)].sort()).toEqual(['b02_people', 'b05_why', 'b06_swing', 'b09_verdict']);
    expect(summarize(scenario, state).ending?.bad).toBe(true);
  });

  test('GM 생성 줄은 기록 jsonl 의 gm 항목에 "화자: 글"로 남는다', async () => {
    const { engine, state } = play(1);
    const { state: after } = await engine.act(at(state, 'b05_why'), { type: 'free', text: '뭐라고요?' });
    const gm = after.log.filter((e) => e.kind === 'gm' && e.task === 'talk').at(-1);
    expect(gm).toMatchObject({ kind: 'gm', lines: ['남자: 묻는 말에나 답해라.'] });
  });

  test('마지막 갈림길 자동 저장은 같은 시드·같은 비트로 돌아온다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wolheun-fork-'));
    try {
      const { state } = play(7);
      const fork = at(state, 'b02_people');
      await writeSave(dir, 'auto_fork', scenario, fork);
      const loaded = await readSave(dir, 'auto_fork', scenario);
      expect(loaded.seed).toBe(fork.seed);
      expect(loaded.beat).toBe('b02_people');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('여우가 짚어 두는 것은 줄로 나오지 않고 플래그만 세우며, 뒤 장면 복선 회수는 그대로다', async () => {
    const engine = new Engine(scenario, new FakeGm(() => approachOf('plead')), fakeClock().now);
    let { state, step } = engine.newGame(3, 'f');
    const shown = [...step.events];
    for (const id of ['run', 'plead', 'dodge']) {
      ({ state, step } = await engine.act(state, { type: 'approach', id }));
      shown.push(...step.events);
    }
    expect(state.beat).toBe('b08_gaze');
    expect(state.log.some((e) => e.kind === 'beat' && e.beat === 'b03_ask')).toBe(true);
    expect(shown.some((e) => e.type === 'line' && /별은 그대로야|기억해 둬/u.test(e.text))).toBe(false);
    expect(state.flags['짚음_별']).toBe(true);
    expect(state.flags['짚음_보석']).toBe(true);
    const remember = new Engine(scenario, new FakeGm(() => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥 행동', absurd: false, bold: false, source: 'rule', meta: META })), fakeClock().now);
    const { step: used } = await remember.act(state, { type: 'free', text: '터번의 보석을 가리킨다' });
    const usedRoll = used.events.find((e) => e.type === 'roll');
    expect(usedRoll?.type === 'roll' && usedRoll.mods.some((m) => m.label === '기억해 둔 것')).toBe(true);
    expect(gmLines(used)).toEqual([]);
  });

  test('첫 장면의 판정이 실패해도 여우의 응원 줄은 나오지 않는다', async () => {
    const texts: string[] = [];
    let misses = 0;
    for (let seed = 1; seed < 400 && misses < 2; seed++) {
      const { engine, state } = play(seed);
      const r = await engine.act(state, { type: 'approach', id: 'run' });
      const roll = r.step.events.find((e) => e.type === 'roll');
      if (roll?.type !== 'roll' || roll.tier !== 'miss') continue;
      misses++;
      texts.push(...gmLines(r.step));
    }
    expect(misses).toBe(2);
    expect(texts.some((t) => /기억에 남아|주사위가 나빴어|주사위 탓/u.test(t))).toBe(false);
  });
});

describe('19-C 이야기 화면에는 여우 줄이 없다', () => {
  const lineEvents = (s: Step) => s.events.filter((e) => e.type === 'line');

  test('불변식: 실제 1화를 규칙 GM(LLM 없이)으로 자유 입력·선택·끼어들기·확인 창을 섞어 돌려도 b00·결말 비트·되돌림 밖에서 여우 줄이 0건이다', async () => {
    const gm = new LocalGm(null, await loadWolheunLore());
    const endings = new Set(Object.entries(scenario.beats).filter(([, b]) => b.ending).map(([id]) => id));
    const inputs = ['주변을 살핀다', '저기요, 물 좀 나눠 주세요', '남자를 공격한다', '저는 크롬웰의 공녀예요', '아 무서워', '그만할래', '저 사람들 누구지? 일단 말 걸어본다', '이거 어떻게 해?', '칼을 빼앗는다', '저는 그냥 길 잃은 여행자예요', '크롬웰이 뭐야?', '고개를 숙이고 뒤로 물러난다'];
    const offenders: string[] = [];
    const seen = { turns: 0, luck: 0, confirm: 0, interject: 0, notice: 0, roll: 0, endings: new Set<string>(), beats: new Set<string>() };
    const check = (seed: number, step: Step, state: GameState, newLog: GameState['log'], from = 0) => {
      if (newLog.some((e) => e.kind === 'input' && e.result === 'bounced')) return;
      let inEnding = false;
      for (const e of step.events.slice(from)) {
        if (e.type === 'scene') {
          inEnding = endings.has(e.beat);
          seen.beats.add(e.beat);
        }
        if (e.type === 'confirm') seen.confirm++;
        if (e.type === 'notice') seen.notice++;
        if (e.type === 'roll') seen.roll++;
        if (e.type === 'line' && e.style === 'gm' && !inEnding) offenders.push(`seed ${seed} ${state.beat}: ${e.text}`);
      }
    };
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const engine = new Engine(scenario, gm, fakeClock().now, true);
      let { state, step } = engine.newGame(seed, `inv${seed}`);
      // b00 여는 글(yaml 고정 줄)은 예외다.
      check(seed, step, state, state.log, step.events.findIndex((e) => e.type === 'scene' && e.beat !== 'b00_open'));
      for (let i = 0; i < 40 && step.prompt.type !== 'end'; i++) {
        const p = step.prompt;
        const text = inputs[(i + seed) % inputs.length]!;
        let action: Action;
        if (state.pendingRisk) action = { type: 'confirm', ok: false };
        // 행운 창은 쓰는 답과 안 쓰는 답을 번갈아 낸다. 쓰는 경로에도 여우 줄이 없어야 한다.
        else if (p.type === 'luck') {
          action = { type: 'luck', use: seen.luck % 2 === 0 };
          seen.luck++;
        }
        else if (p.type === 'choices') action = { type: 'choose', id: p.options[i % p.options.length]!.id };
        else if (p.type === 'free' && i % 4 === 3 && p.approaches.some((a) => !a.locked)) action = { type: 'approach', id: p.approaches.find((a) => !a.locked)!.id };
        else if (i % 4 === 1) {
          action = { type: 'interject', text, scene: state.beat, shown: state.recent.slice(-1).map((l) => ({ speaker: l.speaker, text: l.text })), pending: [] };
          seen.interject++;
        } else action = { type: 'free', text };
        const before = state.log.length;
        ({ state, step } = await engine.act(state, action));
        seen.turns++;
        check(seed, step, state, state.log.slice(before));
      }
      if (state.ending) seen.endings.add(state.ending);
    }
    expect(offenders).toEqual([]);
    // 여러 갈래를 실제로 지나갔는지: 확인 창·안내·끼어들기·판정이 모두 나왔고, 여러 비트와 결말에 닿았다.
    expect(seen.turns).toBeGreaterThan(60);
    expect(seen.confirm).toBeGreaterThan(0);
    expect(seen.luck).toBeGreaterThan(0);
    expect(seen.notice).toBeGreaterThan(0);
    expect(seen.interject).toBeGreaterThan(0);
    expect(seen.roll).toBeGreaterThan(5);
    expect(seen.beats.size).toBeGreaterThan(5);
    expect(seen.endings.size).toBeGreaterThan(0);
  });

  test('ask 액션(질문 모드)은 여우 줄을 내고 talks·said·수치·판정을 바꾸지 않는다', async () => {
    let read: Interpretation = { kind: 'talk', to: 'person', source: 'rule', meta: META };
    const gm = new FakeGm(() => read);
    const engine = new Engine(scenario, gm, fakeClock().now);
    const start = engine.newGame(1, 'ask');
    const talked = await engine.act(start.state, { type: 'free', text: '거기 누구 있어요' });
    read = { kind: 'ask', about: 'none', source: 'rule', meta: META };
    const { state, step } = await engine.act(talked.state, { type: 'ask', text: '크롬웰이 뭐야?' });
    expect(step.events[0]).toEqual({ type: 'echo', text: '크롬웰이 뭐야?' });
    expect(lineEvents(step).length).toBeGreaterThan(0);
    expect(lineEvents(step).every((e) => e.type === 'line' && e.style === 'gm')).toBe(true);
    expect(gm.calls.at(-1)).toBe('explain:크롬웰이 뭐야?');
    expect(state.free?.talks).toBe(talked.state.free?.talks);
    expect(state.said).toEqual(talked.state.said);
    expect(state.tracks).toEqual(talked.state.tracks);
    expect(state.beat).toBe(talked.state.beat);
    expect(step.events.some((e) => e.type === 'roll')).toBe(false);
    expect(state.log.filter((e) => e.kind === 'input').at(-1)).toMatchObject({ kind: 'input', result: 'ask', text: '크롬웰이 뭐야?' });
    await expect(engine.act(talked.state, { type: 'ask', text: '   ' })).rejects.toBeInstanceOf(GameError);
  });

  test('ask 액션은 진행자가 없는 시나리오에서 GameError 다', async () => {
    const noGm = { ...scenario, cast: Object.fromEntries(Object.entries(scenario.cast).filter(([, c]) => c.style !== 'gm')) };
    const engine = new Engine(noGm, new FakeGm(), fakeClock().now);
    const { state } = engine.newGame(1, 'nogm');
    await expect(engine.act(state, { type: 'ask', text: '이거 뭐야?' })).rejects.toBeInstanceOf(GameError);
  });

  test('확인 창 왕복: 그만할래는 여우 줄 없이 confirm 이벤트를 내고, confirm 액션·글 답으로 끝나거나 아무 말 없이 이어진다', async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now);
    const { state } = engine.newGame(1, 'confirm');
    const warn = scenario.risky?.find((r) => r.quit)?.warn;
    await expect(engine.act(state, { type: 'confirm', ok: true })).rejects.toBeInstanceOf(GameError);

    const asked = await engine.act(state, { type: 'free', text: '그만할래' });
    expect(asked.step.events.filter((e) => e.type === 'confirm')).toEqual([{ type: 'confirm', kind: 'quit', text: warn! }]);
    expect(lineEvents(asked.step)).toEqual([]);
    expect(asked.state.pendingRisk).toEqual({ text: '그만할래', quit: true });

    const stay = await engine.act(asked.state, { type: 'confirm', ok: false });
    expect(stay.state.pendingRisk).toBeUndefined();
    expect(stay.state.beat).toBe(state.beat);
    expect(lineEvents(stay.step)).toEqual([]);
    expect(stay.step.prompt.type).toBe('free');

    const leave = await engine.act(asked.state, { type: 'confirm', ok: true });
    expect(leave.state.beat).toBe('e_quit');
    expect(leave.state.ending).toBe('quit');

    const no = await engine.act(asked.state, { type: 'free', text: '아니' });
    expect(no.state.pendingRisk).toBeUndefined();
    expect(lineEvents(no.step)).toEqual([]);
    expect(no.state.beat).toBe(state.beat);
    expect((await engine.act(asked.state, { type: 'free', text: '응' })).state.beat).toBe('e_quit');
    await expect(engine.act(stay.state, { type: 'confirm', ok: true })).rejects.toBeInstanceOf(GameError);
  });

  test('작은 끝 4곳의 결말 비트에는 여우 줄이 없고, 들어가도 이야기 화면 여우 줄이 0 이다', async () => {
    const gmOf = (lines: readonly { speaker: string }[]) => lines.filter((l) => scenario.cast[l.speaker]?.style === 'gm');
    for (const id of ['x_unmasked', 'x_spy_cut', 'x_reckless', 'x_collapse']) expect(gmOf(scenario.beats[id]?.lines ?? [])).toEqual([]);
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now);
    const { state } = engine.newGame(1, 'xe');
    const cases: [string, Partial<GameState['tracks']>, GameState['flags']][] = [
      ['unmasked', { 귀찌: 0 }, { 경고_unmasked: true, 귀찌_설명: true }],
      ['spy_cut', { 의심: 10 }, { 경고_spy_cut: true }],
      ['collapse', {}, { 머뭇: 3, 경고_collapse: true }],
    ];
    for (const [ending, tracks, flags] of cases) {
      const r = await engine.act({ ...state, beat: 'b02_people', free: { beat: 'b02_people', talks: 0, rolls: 0 }, tracks: { ...state.tracks, ...tracks }, flags: { ...state.flags, ...flags } }, { type: 'free', text: '하늘을 올려다본다' });
      expect(r.state.ending).toBe(ending);
      expect(r.step.events.filter((e) => e.type === 'line' && e.style === 'gm')).toEqual([]);
    }
  });

  test('로더는 징조 줄의 GM 화자·금지 낱말·빈 줄과 unmask 밖의 refuse 를 거부한다', async () => {
    const source = await Bun.file(SCENARIO_PATH).text();
    const swap = (from: string, to: string) => {
      expect(source).toContain(from);
      return source.replace(from, to);
    };
    expect(() => parseScenario(swap('        - 나레이션: 무릎이 한 번 허물어졌다.', '        - GM: 무릎이 한 번 허물어졌다.'))).toThrow(/징조는 여우가 말하지 않습니다/);
    expect(() => parseScenario(swap('귀찌가 귓불에서 차갑게 식어 갔다.', '귀찌가 식으면 은발이 드러난다.'))).toThrow(/징조 줄에 "은발"/);
    expect(() => parseScenario(swap('맨손이다. 저 칼은 진짜다.', '맨손이다. 판정이 어렵다.'))).toThrow(/danger\.omen.*"판정"/);
    expect(() => parseScenario(swap('  omen:\n    - 속마음: 맨손이다. 저 칼은 진짜다.', '  omen: []'))).toThrow(/danger\.omen: 징조 줄이 한 줄 이상 필요합니다/);
    expect(() => parseScenario(swap('refuse:\n  - id: unmask\n', 'refuse:\n  - id: identity\n'))).toThrow(/refuse\[0\]\.id/);
  });
});

describe('장면 검사와 긴장값(19-F)', () => {
  const texts = (step: Step) => step.events.flatMap((e) => (e.type === 'line' ? [e.text] : []));
  const twistOf = (step: Step) => step.events.find((e) => e.type === 'twist');

  test('장면 검사 표는 남자를 만나기 전 사막 장면 2곳에만 있다', () => {
    expect(Object.values(scenario.beats).filter((b) => b.twist).map((b) => b.id)).toEqual(['b02_people', 'r3_dusk']);
    for (const b of Object.values(scenario.beats)) if (b.twist) expect(Object.values(b.cast ?? {})).toEqual(['아시나']);
    expect(scenario.sheet.tension).toBe(3);
  });

  test('d6 이 긴장 이하면 홀수는 달라진 결(장면 줄 뒤), 짝수는 끼어드는 일(장면 줄 앞)', () => {
    const none = new Engine(scenario, new FakeGm()).newGame(2, 's');
    expect(twistOf(none.step)).toMatchObject({ type: 'twist', beat: 'b02_people', tension: 3, roll: 6, result: 'none', id: null });
    expect(texts(none.step).some((t) => t.includes('모래바람') || t.includes('가까웠다'))).toBe(false);

    const altered = new Engine(scenario, new FakeGm()).newGame(3, 's');
    expect(twistOf(altered.step)).toMatchObject({ roll: 3, result: 'altered', id: 'closer' });
    const at = texts(altered.step);
    expect(at.indexOf('사람?!')).toBeLessThan(at.findIndex((t) => t.startsWith('바람이 방향을 바꿨다')));
    expect(altered.state.flags['거리_가까움']).toBe(true);

    const interrupt = new Engine(scenario, new FakeGm()).newGame(1, 's');
    expect(twistOf(interrupt.step)).toMatchObject({ roll: 2, result: 'interrupt', id: 'sandstorm' });
    const it = texts(interrupt.step);
    expect(it.findIndex((t) => t.startsWith('모래바람이 덮쳤다'))).toBeLessThan(it.findIndex((t) => t.startsWith('바람에 낯선 냄새')));
    expect(interrupt.state.tracks['귀찌']).toBe(scenario.sheet.tracks.귀찌);
    expect(interrupt.state.flags['모래바람']).toBe(true);
    expect(interrupt.state.log.find((e) => e.kind === 'twist')).toMatchObject({ kind: 'twist', beat: 'b02_people', roll: 2, result: 'interrupt', id: 'sandstorm' });
  });

  test('사건이 세운 플래그는 그 장면 접근법의 보정으로 읽힌다', async () => {
    const engine = new Engine(scenario, new FakeGm());
    const { state } = engine.newGame(1, 's'); // 모래바람
    const { step } = await engine.act(state, { type: 'approach', id: 'watch' });
    const roll = step.events.find((e) => e.type === 'roll');
    expect(roll && roll.type === 'roll' ? roll.mods : []).toContainEqual({ label: '바람에 흐린 시야', value: -1 });
  });

  test('장면 검사는 주사위 흐름을 쓰지 않아 표가 없어도 같은 시드는 같은 눈이 나온다', async () => {
    const bare = structuredClone(scenario);
    delete bare.beats.b02_people!.twist;
    for (const seed of [2, 6, 7]) {
      // 장면 검사가 '그대로'인 시드: 표를 빼도 첩 판정의 눈이 같다.
      const a = new Engine(scenario, new FakeGm()).newGame(seed, 's');
      const b = new Engine(bare, new FakeGm()).newGame(seed, 's');
      expect(a.state.rng).toBe(b.state.rng);
      const ra = (await new Engine(scenario, new FakeGm()).act(a.state, { type: 'approach', id: 'run' })).step.events.find((e) => e.type === 'roll');
      const rb = (await new Engine(bare, new FakeGm()).act(b.state, { type: 'approach', id: 'run' })).step.events.find((e) => e.type === 'roll');
      expect(ra && ra.type === 'roll' ? ra.dice : null).toEqual(rb && rb.type === 'roll' ? rb.dice : null);
    }
  });

  test('긴장값은 판정 성공 -1, 실패 +1 이고 1~6 안에 머물러 화면(hud)에 나간다', async () => {
    const found: Record<string, number> = {};
    for (let seed = 1; seed <= 200 && Object.keys(found).length < 3; seed++) {
      const engine = new Engine(scenario, new FakeGm());
      const { state, step } = engine.newGame(seed, 's');
      expect(step.hud.tension).toBe(3);
      const next = await engine.act(state, { type: 'approach', id: 'run' });
      const roll = next.step.events.find((e) => e.type === 'roll');
      const tier = roll && roll.type === 'roll' ? roll.tier : 'none';
      if (found[tier] !== undefined) continue;
      found[tier] = next.step.hud.tension;
    }
    expect(found).toEqual({ hit: 2, mixed: 3, miss: 4 });

    const engine = new Engine(scenario, new FakeGm());
    for (const [start, want] of [[1, [1, 1, 2]], [6, [5, 6, 6]]] as const) {
      for (let seed = 1; seed <= 200; seed++) {
        const { state } = engine.newGame(seed, 's');
        state.flags['긴장'] = start;
        const next = await engine.act(state, { type: 'approach', id: 'run' });
        const roll = next.step.events.find((e) => e.type === 'roll');
        const tier = roll && roll.type === 'roll' ? roll.tier : 'mixed';
        expect(next.step.hud.tension).toBe(want[tier === 'hit' ? 0 : tier === 'mixed' ? 1 : 2]);
        if (seed >= 30) break;
      }
    }
  });

  test('가방 끈 사실은 가방이 있을 때만 GM 에게 간다', async () => {
    const scenario = await loadDesert();
    const engine = new Engine(scenario, new FakeGm());
    const { state } = engine.newGame(5, 's');
    const facts = (items: string[]) => activeFacts(scenario, { ...state, items, flags: { ...state.flags, 가방_끈: true } }).map((f) => f.text).join(' ');
    expect(facts(['magic_bag'])).toContain('가방을 손으로 쥐고');
    expect(facts([])).not.toContain('가방을 손으로 쥐고');
  });

  test('표 검사: 사건 줄의 CG 와 사건 효과도 대본 검사에 걸린다', async () => {
    const scenario = parseScenario(await Bun.file(SCENARIO_PATH).text());
    const strap = scenario.beats.b02_people!.twist!.interrupt.find((t) => t.id === 'strap')!;
    strap.lines[0]!.cg = '없는_그림';
    strap.effects = { gain: ['없는_물건'] };
    const problems = checkScenario(scenario).join('\n');
    expect(problems).toContain('없는 이벤트 CG "없는_그림"');
    expect(problems).toContain('twist.strap.effects');
  });

  test('표 검사: cg_from 은 있는 CG 여야 하고 cg 와 함께 써야 한다', async () => {
    const scenario = parseScenario(await Bun.file(SCENARIO_PATH).text());
    const [first, second] = scenario.beats.b00_open!.lines.filter((l) => l.cg_from === undefined && l.cg !== undefined);
    first!.cg_from = '없는_앞그림';
    second!.cg_from = 'cg_hill';
    delete second!.cg;
    const problems = checkScenario(scenario).join('\n');
    expect(problems).toContain('없는 이벤트 CG "없는_앞그림"(cg_from)');
    expect(problems).toContain('에 cg 없이 cg_from 만 있습니다');
  });

  test('표 검사: 글 없는 줄은 나레이션에 cg 가 있을 때만 읽는다', async () => {
    const source = await Bun.file(SCENARIO_PATH).text();
    const silent = '      - 나레이션: ""\n        cg: cg_open_blade\n';
    expect(source).toContain(silent);
    expect(() => parseScenario(source.replace(silent, '      - 나레이션: ""\n'))).toThrow(/글자가 필요합니다/);
    expect(() => parseScenario(source.replace(silent, '      - 아시나: ""\n        cg: cg_open_blade\n'))).toThrow(/글자가 필요합니다/);
  });

  test('표 검사: id 중복·빈 목록·범위 밖 긴장값은 읽지 않는다', async () => {
    const source = await Bun.file(SCENARIO_PATH).text();
    expect(() => parseScenario(source.replace('        - id: glare\n', '        - id: closer\n'))).toThrow(/twist\.altered\[1\]\.id: 같은 id/);
    expect(() => parseScenario(source.replace('  tension: 3\n', '  tension: 7\n'))).toThrow(/sheet\.tension: 1~6/);
    expect(() => parseScenario(source.replace(/      interrupt:\n        - id: sandstorm\n[\s\S]*?        - id: strap\n[\s\S]*?effects: \{ flags: \{ 가방_끈: true \} \}\n/, '      interrupt: []\n'))).toThrow(/twist: altered 와 interrupt/);
  });
});
