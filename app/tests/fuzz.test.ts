// 퍼저(scripts/fuzz.ts)가 찾은 버그를 하나씩 고정하는 시험과, 퍼저 자체의 짧은 회귀 실행.
import { describe, expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarize } from '../src/engine/summary.ts';
import { startServer } from '../src/server/main.ts';
import { Engine, type Interpretation } from '../src/engine/engine.ts';
import { GameError, type Action, type GameState, type Step } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { FakeGm, LORE_PATH, META, SCENARIO_PATH, fakeClock, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

/** 행동 단추와 첫 선택지로만 결말까지 간다. */
async function playToEnd(engine: Engine, start: { state: GameState; step: Step }) {
  let { state, step } = start;
  for (let i = 0; i < 200 && !state.ending; i++) {
    const p = step.prompt;
    const action: Action =
      p.type === 'luck' ? { type: 'luck', use: false }
      : p.type === 'choices' ? { type: 'choose', id: p.options[0]!.id }
      : p.type === 'free' ? { type: 'approach', id: p.approaches.find((a) => !a.locked)!.id }
      : (() => {
          throw new Error('끝');
        })();
    ({ state, step } = await engine.act(state, action));
  }
  if (!state.ending) throw new Error('결말에 닿지 않았습니다');
  return { state, step };
}

/** 큰 즉흥 행동으로 읽는 GM(LLM 이 낼 수 있는 해석). risk 를 주면 정체를 밝히는 말로도 읽는다. */
const boldGm = (deed: string, risk?: 'identity') =>
  new FakeGm((): Interpretation => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥', absurd: false, bold: true, deed, target: 'local', ...(risk ? { risk } : {}), source: 'llm', meta: META }));

const interject = (text: string, scene: string | null): Action => ({ type: 'interject', text, scene, shown: [], pending: [] });

describe('퍼저가 찾은 버그: 그만두기 확인이 남는 자리', () => {
  test('끝난 판에 끼어들어 그만두겠다고 해도 확인을 남기지 않고 결말도 바뀌지 않는다', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    const { state: ended } = await playToEnd(engine, engine.newGame(68, 'q'));
    const ending = ended.ending;
    expect(ending).not.toBe('quit');
    const asked = await engine.act(ended, interject('집에 갈래', ended.beat));
    expect(asked.state.pendingRisk).toBeUndefined();
    const yes = await engine.act(asked.state, interject('응', ended.beat));
    expect(yes.state.ending).toBe(ending);
    expect(yes.state.beat).toBe(ended.beat);
    const please = await engine.act(yes.state, interject('끝내줘', ended.beat));
    expect(please.state.ending).toBe(ending);
  });

  test('그만두기 확인이 떠 있는 채로 결말에 닿으면 확인은 사라진다', async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, true);
    const first = engine.newGame(3, 'q');
    const asked = await engine.act(first.state, { type: 'ask', text: '그만할래', scene: first.state.beat });
    expect(asked.state.pendingRisk).toBeDefined();
    const { state } = await playToEnd(engine, asked);
    expect(state.pendingRisk).toBeUndefined();
  });

  test('그만두기 확인에 답하지 않고 행동 단추를 누르면 확인은 끝나고, 뒤의 "응"이 판을 끝내지 않는다', async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, false);
    const first = engine.newGame(2, 'q');
    const asked = await engine.act(first.state, { type: 'ask', text: '그만할래', scene: first.state.beat });
    expect(asked.state.pendingRisk).toBeDefined();
    const pressed = await engine.act(asked.state, { type: 'approach', id: 'run' });
    expect(pressed.state.pendingRisk).toBeUndefined();
    if (pressed.state.ending === null && pressed.step.prompt.type === 'free') {
      const yes = await engine.act(pressed.state, { type: 'free', text: '응' });
      expect(yes.state.ending).not.toBe('quit');
    }
  });

  test('그만두기 확인 뒤 선택지를 고르거나 행운에 답해도 확인은 끝난다', async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, true);
    for (let seed = 1; seed < 400; seed++) {
      const { state } = engine.newGame(seed, 'l');
      const r = await engine.act(state, { type: 'approach', id: 'run' });
      if (r.step.prompt.type !== 'luck') continue;
      const asked = await engine.act(r.state, { type: 'free', text: '그만할래' });
      expect(asked.state.pendingRisk).toBeDefined();
      const luck = await engine.act(asked.state, { type: 'luck', use: false });
      expect(luck.state.pendingRisk).toBeUndefined();
      return;
    }
    throw new Error('행운을 묻는 시드가 없습니다');
  });

  test('의도 카드가 떠 있을 때 질문 모드로 그만두겠다고 하면, 확인 창의 답은 그만두기에 간다', async () => {
    const engine = new Engine(scenario, boldGm('그의 칼을 붙잡았다'), fakeClock().now, false);
    const first = engine.newGame(2, 'i');
    const carded = await engine.act(first.state, { type: 'free', text: '(칼을 붙잡는다)' });
    expect(carded.state.pendingIntent).toBeDefined();
    const asked = await engine.act(carded.state, { type: 'ask', text: '그만할래', scene: first.state.beat });
    expect(asked.state.pendingRisk).toBeDefined();
    const ok = await engine.act(asked.state, { type: 'confirm', ok: true });
    expect(ok.state.ending).toBe('quit');
    expect(ok.state.log.filter((e) => e.kind === 'check').length).toBe(carded.state.log.filter((e) => e.kind === 'check').length);
  });
});

test('끝난 판은 끼어들기와 GM 질문만 받고 질문은 결과를 보존한다', async () => {
  const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
  const { state } = await playToEnd(engine, engine.newGame(5, 'e'));
  const before = structuredClone(state);
  for (const action of [
    { type: 'confirm', ok: true }, { type: 'free', text: '응' },
    { type: 'luck', use: true }, { type: 'choose', id: 'x' }, { type: 'approach', id: 'run' },
  ] satisfies Action[]) {
    await expect(engine.act(state, action)).rejects.toBeInstanceOf(GameError);
  }
  for (const text of ['행운이 뭐야', '그만할래']) {
    const after = await engine.act(state, { type: 'ask', text, scene: state.beat });
    expect(after.state.ending).toBe(state.ending);
    expect(after.state.beat).toBe(state.beat);
    expect(after.state.rng).toBe(state.rng);
    expect(after.state.tracks).toEqual(state.tracks);
    expect(after.state.items).toEqual(state.items);
    expect(after.state.flags).toEqual(state.flags);
    expect(after.state.pendingRisk).toBeUndefined();
    const a = summarize(scenario, state);
    const b = summarize(scenario, after.state);
    expect([b.decisions, b.checks, b.ending]).toEqual([a.decisions, a.checks, a.ending]);
    expect(after.step.events.some((e) => e.type === 'echo' && e.text === text)).toBe(true);
    expect(after.step.events.some((e) => e.type === 'line')).toBe(true);
  }
  expect(state).toEqual(before);
  const { playGame } = await import('../scripts/fuzz.ts');
  const report = await playGame({ scenario, lore, corpus: [] }, 5, {
    luck: true, chaos: 0,
    ops: [
      { op: 'act', action: { type: 'free', text: '그만할래' }, advance: 0 },
      { op: 'act', action: { type: 'confirm', ok: true }, advance: 0 },
      { op: 'act', action: { type: 'ask', text: '행운이 뭐야' }, advance: 0 },
      { op: 'act', action: interject('안녕', null), advance: 0 },
    ],
  });
  expect(report.violation).toBeUndefined();
  expect(report.ending).toBe('quit');
  expect(report.acts).toBe(4);
  expect(report.errors).toBe(0);
});

describe('퍼저·감사가 찾은 버그: 끝난 판과 잘못된 끼어들기', () => {
  test('끝난 판에 끼어들어 정체를 밝혀도 수치·플래그가 바뀌지 않는다(결과 화면 수치가 그대로)', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    const first = engine.newGame(1, 'e');
    const asked = await engine.act(first.state, { type: 'free', text: '그만할래' });
    const { state: ended } = await engine.act(asked.state, { type: 'confirm', ok: true });
    expect(ended.ending).toBe('quit');
    const after = await engine.act(ended, interject('나는 웰든 공녀다', 'b04_blade'));
    expect(after.state.tracks).toEqual(ended.tracks);
    expect(after.state.flags['신분_노출']).toBeUndefined();
  });

  test('끼어들기의 남은 줄 조건이 잘못된 식이어도 GameError 가 아닌 오류(서버 오류)를 내지 않는다', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    const { state } = engine.newGame(1, 'p');
    const r = await engine.act(state, { type: 'interject', text: '살려 주세요', scene: state.beat, shown: [], pending: [{ i: 0, text: 'x', if: 'flag:말함 &&' }, { i: 1, text: 'y', if: '!말함' }] });
    expect(r.state.beat).toBe(state.beat);
  });

  test('장면 이름이 __proto__·constructor 같은 이름이면 없는 장면으로 보고 지금 비트를 쓴다', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    const { state } = engine.newGame(1, 'p');
    for (const scene of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      for (const action of [interject('안녕하세요', scene), { type: 'ask', text: '행운이 뭐야', scene } as Action]) {
        const r = await engine.act(state, action);
        const fresh = r.state.log.slice(state.log.length);
        for (const e of fresh) if ('beat' in e) expect(typeof e.beat).toBe('string');
      }
    }
  });
});

describe('퍼저·감사가 찾은 버그: 불러온 판의 확인 창', () => {
  test('그만두기 확인이 떠 있던 저장을 화면 상태 없이 불러오면 확인 창을 다시 띄운다(보이지 않는 확인에 "응"이 판을 끝내지 않게)', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    const first = engine.newGame(1, 'r');
    const asked = await engine.act(first.state, { type: 'free', text: '그만할래' });
    expect(asked.state.pendingRisk).toBeDefined();
    const loaded = engine.noteSlot(JSON.parse(JSON.stringify(asked.state)) as GameState, 'load', 'x');
    const step = engine.resume(loaded);
    expect(step.events.some((e) => e.type === 'confirm' && e.kind === 'quit')).toBe(true);
  });

  test('불러온 판에 다시 띄우는 그만두기 확인은 처음 띄운 창과 같은 글이다(질문 모드로 물었을 때도)', async () => {
    // 질문 모드에서 '게임을 끝내는 말'로 읽히면 여우 답(game_help)의 글로 창을 띄운다.
    const engine = new Engine(scenario, new FakeGm((): Interpretation => ({ kind: 'ask', game: 'quit', source: 'llm', meta: META })), fakeClock().now, true);
    const first = engine.newGame(1, 'r');
    for (const action of [{ type: 'free', text: '그만할래' }, { type: 'ask', text: '이제 그만하고 싶은데', scene: first.state.beat }] as Action[]) {
      const asked = await engine.act(first.state, action);
      const shown = asked.step.events.find((e) => e.type === 'confirm');
      expect(shown).toBeDefined();
      const step = engine.resume(engine.noteSlot(asked.state, 'load', 'x'));
      expect(step.events.find((e) => e.type === 'confirm')).toEqual(shown!);
    }
  });

  test('의도 카드가 떠 있던 저장을 불러와도 카드를 다시 띄운다', async () => {
    const engine = new Engine(scenario, boldGm('그의 칼을 붙잡았다'), fakeClock().now, false);
    const first = engine.newGame(2, 'i');
    const carded = await engine.act(first.state, { type: 'free', text: '(칼을 붙잡는다)' });
    const shown = carded.step.events.find((e) => e.type === 'confirm');
    expect(shown).toBeDefined();
    const step = engine.resume(engine.noteSlot(carded.state, 'load', 'x'));
    expect(step.events.find((e) => e.type === 'confirm')).toEqual(shown!);
  });

  test('결말에 들어가면 의도 카드도 남지 않고, 결말 단계에 카드가 뜨지 않는다', async () => {
    // 칼 든 남자 앞에서 정체를 밝히며 붙잡는 큰 행동(LLM 이 낼 수 있는 해석). 의심이 문턱 근처다.
    const engine = new Engine(scenario, boldGm('정체를 밝혔다', 'identity'), fakeClock().now, false);
    let endings = 0;
    for (let seed = 1; seed < 20; seed++) {
      let { state, step } = engine.newGame(seed, 'x');
      for (let i = 0; i < 40 && !state.ending; i++) {
        const facing = Object.values(scenario.beats[state.beat]?.cast ?? {}).includes('남자');
        const p = step.prompt;
        const a: Action =
          state.pendingIntent ? { type: 'confirm', ok: true }
          : p.type === 'luck' ? { type: 'luck', use: false }
          : p.type === 'free' ? (facing ? { type: 'free', text: '나는 웰든 공녀다' } : { type: 'approach', id: p.approaches.find((x) => !x.locked)!.id })
          : { type: 'choose', id: (p as { options: { id: string }[] }).options[0]!.id };
        ({ state, step } = await engine.act(state, a));
        if (state.ending) {
          endings++;
          expect(state.pendingIntent).toBeUndefined();
          expect(step.events.some((e) => e.type === 'confirm')).toBe(false);
        }
      }
    }
    expect(endings).toBeGreaterThan(0);
  });

  test('의도 카드에 "다른 뜻"이라 답하면 정체를 밝힌 대가(의심·신분_노출)도 남지 않는다', async () => {
    const engine = new Engine(scenario, boldGm('남자의 팔을 붙잡았다', 'identity'), fakeClock().now, false);
    let { state } = engine.newGame(1, 'c');
    ({ state } = await engine.act(state, { type: 'approach', id: 'run' }));
    expect(Object.values(scenario.beats[state.beat]?.cast ?? {})).toContain('남자');
    const carded = await engine.act(state, { type: 'free', text: '나는 공녀다 (남자의 팔을 붙잡는다)' });
    expect(carded.state.pendingIntent).toBeDefined();
    const no = await engine.act(carded.state, { type: 'confirm', ok: false });
    expect(no.state.tracks.의심).toBe(state.tracks.의심);
    expect(no.state.flags['신분_노출']).toBeUndefined();
    // "그래"면 대가가 붙는다.
    const yes = await engine.act(carded.state, { type: 'confirm', ok: true });
    expect(yes.state.flags['신분_노출']).toBe(true);
  });

});

describe('퍼저·감사가 찾은 버그: 행운 창과 작은 끝', () => {
  test('행운 창에 글로 답해도 그 전에 물은 그만두기 확인은 끝난다', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    const { state } = engine.newGame(1, 'l');
    const miss = await engine.act(state, { type: 'approach', id: 'run' });
    expect(miss.step.prompt.type).toBe('luck');
    const asked = await engine.act(miss.state, { type: 'ask', text: '그만할래', scene: state.beat });
    expect(asked.state.pendingRisk).toBeDefined();
    const used = await engine.act(asked.state, { type: 'free', text: '응' });
    expect(used.state.pendingRisk).toBeUndefined();
    const yes = await engine.act(used.state, { type: 'free', text: '해' });
    expect(yes.state.ending).not.toBe('quit');
  });

  test('한 번의 실패로는 끝나지 않는다: 실패가 다음 장면으로 넘어가는 판정이어도 징조가 처음 나온 턴에는 작은 끝으로 가지 않는다', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    let { state } = engine.newGame(147, 'f');
    for (const action of [
      { type: 'approach', id: 'run' },
      { type: 'approach', id: 'resist' },
      { type: 'luck', use: false },
      { type: 'approach', id: 'dodge' },
      { type: 'approach', id: 'hide_earring' },
    ] as Action[])
      ({ state } = await engine.act(state, action));
    expect(state.pendingLuck).toBeDefined();
    expect(state.flags['경고_spy_cut']).not.toBe(true);
    const r = await engine.act(state, { type: 'luck', use: false });
    expect(r.state.ending).toBeNull();
    expect(r.state.flags['경고_spy_cut']).toBe(true);
    expect(r.state.tracks.의심).toBe(9);
  });
});

describe('퍼저·감사가 찾은 버그: 이야기에 들어가지 않은 입력의 플래그', () => {
  test('질문 모드로 안내한 말, 여우가 되돌린 말, 거절한 말은 갈래 플래그(길_물음)를 세우지 않는다', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    const { state } = engine.newGame(1, 'u');
    for (const text of ['크라차가 어디야?', '살라딘한테 길을 물어본다', '귀찌를 빼고 길을 물어본다']) {
      const r = await engine.act(state, { type: 'free', text });
      expect(r.state.said ?? []).toEqual(state.said ?? []);
      expect(r.state.flags['길_물음']).toBeUndefined();
      expect(r.state.flags['이미_길_물음']).toBeUndefined();
    }
  });

  test('끝난 판에 끼어든 말은 플래그도 결과 화면의 선택 기록도 바꾸지 않는다', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    const { state: ended } = await playToEnd(engine, engine.newGame(5, 'z'));
    const before = summarize(scenario, ended);
    const r = await engine.act(ended, interject('길을 물어본다', ended.beat));
    expect(r.state.flags).toEqual(ended.flags);
    const after = summarize(scenario, r.state);
    // GM 호출 수는 늘 수 있다(인물이 말로 받는다). 결정·판정·수치·결말은 그대로다.
    expect({ d: after.decisions, c: after.checks, t: after.tracks, e: after.ending }).toEqual({ d: before.decisions, c: before.checks, t: before.tracks, e: before.ending });
  });
});

describe('퍼저·감사가 찾은 버그: 서버', () => {
  const boot = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wh-fz-'));
    const srv = await startServer({
      port: 0,
      llmUrl: null,
      modelKey: null,
      scenarioPath: SCENARIO_PATH,
      lorePath: LORE_PATH,
      savesDir: join(dir, 'saves'),
      atlasFile: join(dir, 'atlas.json'),
      logsDir: join(dir, 'logs'),
      llmTimeoutMs: 1000,
      feedbackFile: join(dir, 'feedback.jsonl'),
    });
    const base = `http://127.0.0.1:${srv.server.port}`;
    const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const act = async (session: string, action: Action) => JSON.parse((await (await post('/api/act', { session, action })).text()).trim().split('\n').at(-1)!) as { done?: unknown; error?: string };
    const stop = async () => {
      srv.server.stop(true);
      await rm(dir, { recursive: true, force: true });
    };
    return { ...srv, dir, base, post, act, stop };
  };

  test('지도 기록 파일(atlas.json)이 깨져 있어도 행동 결과는 화면에 가고, 지도 요청이 서버 오류를 내지 않는다', async () => {
    const s = await boot();
    try {
      await Bun.write(join(s.dir, 'atlas.json'), '{"visited": ["b0');
      const { session } = (await (await s.post('/api/new', { seed: 1 })).json()) as { session: string };
      const before = s.sessions.get(session)!.state.log.length;
      const last = await s.act(session, { type: 'approach', id: 'run' });
      const after = s.sessions.get(session)!.state.log.length;
      // 세션이 나아갔으면 화면도 done 을 받아야 한다(어긋나지 않게).
      expect(after > before).toBe(last.done !== undefined);
      expect(last.done).toBeDefined();
      await Bun.write(join(s.dir, 'atlas.json'), '{"vis');
      expect((await fetch(`${s.base}/api/atlas`)).status).toBe(200);
      expect((await s.post('/api/atlas/hint', { key: 'n0' })).status).toBe(200);
    } finally {
      await s.stop();
    }
  });

  test("'마지막 갈림길에서 다시'는 같은 판의 갈림길 저장일 때만 열린다(같은 시드의 다른 판 저장은 아니다)", async () => {
    const s = await boot();
    try {
      const run1 = ((await (await s.post('/api/new', { seed: 5 })).json()) as { session: string }).session;
      const forkFile = Bun.file(join(s.dir, 'saves', 'auto_fork.json'));
      for (let i = 0; i < 10 && !(await forkFile.exists()); i++) {
        const p = s.engine.prompt(s.sessions.get(run1)!.state);
        await s.act(run1, p.type === 'luck' ? { type: 'luck', use: false } : { type: 'approach', id: p.type === 'free' ? p.approaches.find((a) => !a.locked)!.id : '' });
      }
      expect(await Bun.file(join(s.dir, 'saves', 'auto_fork.json')).exists()).toBe(true);
      // 같은 ms 에 시작하지 않게 판을 하나 사이에 둔다.
      await s.post('/api/new', { seed: 9 });
      const run2 = ((await (await s.post('/api/new', { seed: 5 })).json()) as { session: string }).session;
      await s.act(run2, { type: 'free', text: '그만할래' });
      await s.act(run2, { type: 'confirm', ok: true });
      const res = (await (await fetch(`${s.base}/api/result?session=${run2}`)).json()) as { fork: boolean };
      expect(res.fork).toBe(false);
      const own = (await (await fetch(`${s.base}/api/result?session=${run1}`)).json()) as { fork: boolean };
      expect(own.fork).toBe(true);
    } finally {
      await s.stop();
    }
  });
});

describe('행운 oracle 회귀', () => {
  type Check = Extract<GameState['log'][number], { kind: 'check' }>;
  const cases = [
    { name: '일반 실패', tier: 'miss', high: false },
    { name: '낮은 합계 대실패', tier: 'fumble', high: false },
    { name: '7 초과 대실패', tier: 'fumble', high: true },
  ] as const;

  async function fixture(row: (typeof cases)[number]) {
    const sheet = row.high
      ? { ...scenario.sheet, abilities: { 재치: 8, 손재주: 8, 매력: 8, 근력: 8, 교양: 8 } }
      : scenario.sheet;
    const env = { scenario: { ...scenario, sheet }, lore, corpus: [] };
    const engine = new Engine(env.scenario, new LocalGm(null, lore), fakeClock().now, true);
    for (let seed = 1; seed <= 400; seed++) {
      const first = engine.newGame(seed, 'oracle');
      const r = await engine.act(first.state, { type: 'approach', id: 'run' });
      const check = r.state.log.findLast((e) => e.kind === 'check');
      if (r.state.pendingLuck && check?.kind === 'check' && check.roll.tier === row.tier && (!row.high || check.roll.total > 7)) {
        return { env, seed };
      }
    }
    throw new Error(`실제 행운 판정을 찾지 못했다: ${row.name}`);
  }

  async function replay(row: (typeof cases)[number], mutate?: (check: Check, previous: Check) => void) {
    const { env, seed } = await fixture(row);
    const { playGame } = await import('../scripts/fuzz.ts');
    const original = Engine.prototype.act;
    let changed = false;
    const spy = spyOn(Engine.prototype, 'act').mockImplementation(async function (this: Engine, state, action, onEvent, viewpoint) {
      const result = await original.call(this, state, action, onEvent, viewpoint);
      if (mutate && state.pendingLuck && action.type === 'luck' && action.use) {
        const previous = state.log.findLast((e) => e.kind === 'check');
        const check = result.state.log.findLast((e) => e.kind === 'check');
        if (previous?.kind !== 'check' || check?.kind !== 'check') throw new Error('실제 판정 기록이 없다');
        mutate(check, previous);
        changed = true;
      }
      return result;
    });
    try {
      const report = await playGame(env, seed, {
        luck: true, chaos: 0,
        ops: [
          { op: 'act', action: { type: 'approach', id: 'run' }, advance: 0 },
          { op: 'act', action: { type: 'luck', use: true }, advance: 0 },
        ],
      });
      if (mutate) expect(changed).toBe(true);
      return report;
    } finally {
      spy.mockRestore();
    }
  }

  for (const row of cases) {
    test(`${row.name}: 실제 행운 구제를 허용한다`, async () => {
      const report = await replay(row);
      expect(report.violation).toBeUndefined();
      expect(report.acts).toBe(2);
      expect(report.errors).toBe(0);
    });
  }

  const mutations: readonly { name: string; mutate: (check: Check, previous: Check) => void }[] = [
    { name: '잘못된 합계', mutate: (c) => { c.roll.total++; } },
    { name: '성공 단계 변조', mutate: (c) => { c.roll.tier = 'hit'; } },
    { name: '행운 사용량 변조', mutate: (c) => { c.roll.luck = 0; } },
    { name: '주사위 변조', mutate: (c) => { c.roll.dice = [6, 6]; } },
    { name: '판정 바깥 기록 변조', mutate: (c) => { c.at++; } },
    { name: '구제 출처 변조', mutate: (c) => { if (c.roll.rescuedFrom) delete c.roll.rescuedFrom; else c.roll.rescuedFrom = 'fumble'; } },
  ];
  for (const row of [cases[0], cases[2]]) {
    for (const mutation of mutations) {
      test(`${row.name}: ${mutation.name}를 거부한다`, async () => {
        const report = await replay(row, mutation.mutate);
        expect(report.violation?.at).toBe(1);
        expect(report.violation?.why).toBe('행운이 판정 기록을 잘못 고쳤다');
      });
    }
  }
  test('7 초과 대실패: 합계를 7로 낮추는 구제를 거부한다', async () => {
    const report = await replay(cases[2], (c) => { c.roll.total = 7; });
    expect(report.violation?.at).toBe(1);
    expect(report.violation?.why).toBe('행운이 판정 기록을 잘못 고쳤다');
  });
});

describe('퍼저 회귀(짧게)', () => {
  test('시드 1~150 판에서 불변식이 깨지지 않는다', async () => {
    const { loadEnv, fuzz } = await import('../scripts/fuzz.ts');
    const env = await loadEnv();
    const dir = await mkdtemp(join(tmpdir(), 'wh-fz-run-'));
    env.savesDir = dir;
    try {
      const { reports, endings } = await fuzz(env, 150, 1);
      expect(reports.map((r) => `${r.seed}#${r.violation?.at}: ${r.violation?.why}`)).toEqual([]);
      expect(endings['(끝나지 않음)']).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test('같은 시드는 같은 판을 낸다', async () => {
    const { loadEnv, playGame } = await import('../scripts/fuzz.ts');
    const env = await loadEnv();
    const a = await playGame(env, 4242);
    const b = await playGame(env, 4242);
    expect(JSON.stringify(b.ops)).toBe(JSON.stringify(a.ops));
    expect(b.ending).toBe(a.ending);
  });
});
