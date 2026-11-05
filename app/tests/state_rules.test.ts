import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAtlas, nextHint, type AtlasRecord } from '../src/engine/atlas.ts';
import { evalCond, holdBefore, parseCond, type CondContext } from '../src/engine/conditions.ts';
import { Engine } from '../src/engine/engine.ts';
import { SaveError, assertState, listSaves, readSave, writeSave } from '../src/engine/save.ts';
import { summarize } from '../src/engine/summary.ts';
import { isActionText, isPlainQuestion, preemptedBy, splitMixed } from '../src/engine/text.ts';
import type { GameState, LogEntry, Scenario } from '../src/engine/types.ts';
import { FakeGm, fakeClock, loadDesert } from './helpers.ts';

const scenario = await loadDesert();

const fresh = (): GameState => structuredClone(new Engine(scenario, new FakeGm(), fakeClock().now).newGame(1, 's').state);

describe('조건식', () => {
  const ctx = (over: Partial<CondContext> = {}): CondContext => ({
    tracks: { 의심: 3, 집착: 0, 호감: 0, 귀찌: 5, 탈주: 0, 행운: 0 },
    abilities: { 재치: 3, 손재주: 0, 매력: 0, 체력: 0, 교양: 0 },
    flags: {},
    items: [],
    ...over,
  });

  test('해석할 수 없는 조건식은 예외를 던진다', () => {
    expect(() => parseCond('의심 >>> 3')).toThrow();
    expect(() => evalCond('아무 말', ctx())).toThrow();
  });

  test('연산자 경계와 플래그·소지품·능력치 값을 표대로 판정한다', () => {
    const cases: [string, Partial<CondContext>, boolean][] = [
      ['의심 == 3', {}, true],
      ['의심 == 2', {}, false],
      ['의심 != 3', {}, false],
      ['의심 != 4', {}, true],
      ['의심 > 3', {}, false],
      ['의심 > 2', {}, true],
      ['의심 < 3', {}, false],
      ['의심 < 4', {}, true],
      ['재치 >= 3', {}, true],
      ['재치 <= 2', {}, false],
      ['!item:pin', {}, true],
      ['!item:pin', { items: ['pin'] }, false],
      ['item:pin', { items: ['pin'] }, true],
      ['flag:x', { flags: { x: 0 } }, false],
      ['flag:x', { flags: { x: '' } }, false],
      ['flag:x', { flags: { x: 1 } }, true],
      ['flag:x >= 1', { flags: { x: true } }, true],
      ['flag:x == 0', { flags: { x: false } }, true],
      ['flag:x == 0', {}, true],
      ['flag:x == 0', { flags: { x: 'a' } }, true],
      ['x == 1', { flags: { x: true } }, true],
      // flag: 를 붙이면 같은 이름의 수치가 아니라 플래그를 본다.
      ['flag:의심 >= 1', {}, false],
    ];
    expect(cases).toHaveLength(22);
    expect(cases.map(([src, over]) => evalCond(src, ctx(over)))).toEqual(cases.map(([, , want]) => want));
  });

  test('holdBefore 는 < 와 > 에서 문턱 값을 그대로, <= 에서 하나 위, 플래그 표시를 지킨다', () => {
    expect(holdBefore('귀찌 < 2')).toEqual({ name: '귀찌', flag: false, value: 2 });
    expect(holdBefore('의심 > 5')).toEqual({ name: '의심', flag: false, value: 5 });
    expect(holdBefore('flag:머뭇 <= 2')).toEqual({ name: '머뭇', flag: true, value: 3 });
    expect(holdBefore('의심 == 5')).toBeNull();
  });
});

describe('저장 상태 검사', () => {
  const bad = (mutate: (s: Record<string, unknown>) => void) => {
    const s = fresh() as unknown as Record<string, unknown>;
    mutate(s);
    return () => assertState(scenario, s);
  };

  test('새 판 상태는 그대로 통과한다', () => {
    expect(assertState(scenario, fresh()).beat).toBe(fresh().beat);
  });

  test('객체가 아닌 값은 상태 없음으로 거른다', () => {
    expect(() => assertState(scenario, 'abc')).toThrow(SaveError);
    expect(() => assertState(scenario, 'abc')).toThrow(/상태 없음/);
  });

  test('필드가 잘못된 상태는 SaveError 로 거른다', () => {
    const broken: ((s: Record<string, unknown>) => void)[] = [
      (s) => (s.v = 2),
      (s) => (s.beat = '없는_비트'),
      (s) => (s.seed = 'x'),
      (s) => delete (s.tracks as Record<string, number>).의심,
      (s) => delete (s.abilities as Record<string, number>).재치,
      (s) => (s.flags = []),
      (s) => (s.items = [1]),
      (s) => (s.log = {}),
      (s) => (s.startedAt = 'x'),
      (s) => (s.free = null),
      (s) => (s.free = { ...(s.free as object), beat: 'b01_sand' }),
    ];
    expect(broken).toHaveLength(11);
    expect(broken.map((m) => {
      try {
        bad(m)();
        return 'ok';
      } catch (e) {
        return e instanceof SaveError ? 'SaveError' : 'other';
      }
    })).toEqual(broken.map(() => 'SaveError'));
  });

  test('행운이 없는 옛 저장은 0 으로 채우고, recent 가 없으면 빈 목록이다', () => {
    const s = fresh() as unknown as Record<string, unknown>;
    delete (s.tracks as Record<string, number>).행운;
    delete s.recent;
    const out = assertState(scenario, s);
    expect(out.tracks.행운).toBe(0);
    expect(out.recent).toEqual([]);
  });
});

describe('저장 파일', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wh-rules-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('저장 칸 이름은 32자까지다', async () => {
    expect((await writeSave(dir, 'a'.repeat(32), scenario, fresh(), 1)).slot).toHaveLength(32);
    await expect(writeSave(dir, 'a'.repeat(33), scenario, fresh(), 1)).rejects.toBeInstanceOf(SaveError);
  });

  test('meta.ended 는 결말에 닿았을 때만 참이다', async () => {
    const ended = { ...fresh(), ending: 'out' };
    expect((await writeSave(dir, 'live', scenario, fresh(), 1)).ended).toBe(false);
    expect((await writeSave(dir, 'done', scenario, ended, 1)).ended).toBe(true);
  });

  test('없는 칸을 읽으면 비어 있다는 SaveError 다', async () => {
    await expect(readSave(dir, 'nothing', scenario)).rejects.toBeInstanceOf(SaveError);
    await expect(readSave(dir, 'nothing', scenario)).rejects.toThrow(/비어/);
  });

  test('파일 버전이 1 이 아니면 readSave 는 거르고 listSaves 는 빼놓는다', async () => {
    const meta = await writeSave(dir, 'old', scenario, fresh(), 1);
    await Bun.write(join(dir, 'old.json'), JSON.stringify({ v: 2, meta, state: fresh() }));
    await expect(readSave(dir, 'old', scenario)).rejects.toBeInstanceOf(SaveError);
    expect(await listSaves(dir)).toEqual([]);
  });

  test('listSaves 는 .json 만 이름 순으로 돌려준다', async () => {
    for (const slot of ['m', 'z', 'b', 'y', 'a', 'x']) await writeSave(dir, slot, scenario, fresh(), 1);
    const meta = await writeSave(dir, 'q', scenario, fresh(), 1);
    await rm(join(dir, 'q.json'));
    await Bun.write(join(dir, 'q.txt'), JSON.stringify({ v: 1, meta, state: fresh() }));
    expect((await listSaves(dir)).map((m) => m.slot)).toEqual(['a', 'b', 'm', 'x', 'y', 'z']);
  });
});

describe('지도', () => {
  const mini = {
    beats: {},
    fates: [],
    atlas: {
      nodes: [
        { id: 'p', col: 0, row: 0, beats: ['bp'], hints: ['h1', 'h2'] },
        { id: 'q', col: 1, row: 0, beats: ['bq'], hints: ['h1', 'h2'] },
      ],
      edges: [['p', 'q']],
    },
  } as unknown as Scenario;
  const rec = (beats: string[], hints?: Record<string, number>): AtlasRecord => ({ beats, last: [], ...(hints ? { hints } : {}) });

  test('선은 두 끝을 다 가 봤을 때만 본 것이다', () => {
    expect(buildAtlas(mini, rec(['bp'])).edges.map((e) => e.seen)).toEqual([false]);
    expect(buildAtlas(mini, rec(['bp', 'bq'])).edges.map((e) => e.seen)).toEqual([true]);
  });

  test('가 본 칸의 힌트 단계는 0 이고 안 가 본 칸은 기록을 따른다', () => {
    expect(buildAtlas(mini, rec(['bp'], { p: 2, q: 1 })).nodes.map((n) => n.hint)).toEqual([0, 1]);
  });

  test('가 본 칸은 힌트가 없고, 힌트 단계는 힌트 수를 넘지 않는다', () => {
    expect(nextHint(mini, rec(['bp']), 'n0')).toBeNull();
    const capped = nextHint(mini, rec([], { q: 2 }), 'n1');
    expect(capped?.level).toBe(2);
    expect(capped?.record.hints?.q).toBe(2);
    expect(capped?.text).toBe('h2');
  });
});

describe('결과 요약', () => {
  const withLog = (entries: LogEntry[]): GameState => ({ ...fresh(), log: entries });
  const base = { at: 0, playMs: 0, beat: 'b02_people' };

  test('행동 버튼 선택, 여우 놀이 입력, 행동 해석 입력을 구분한다', () => {
    const sum = summarize(scenario, withLog([
      { ...base, kind: 'choice', choice: 'approach:run', text: '달린다' },
      { ...base, kind: 'input', text: '게임', result: 'game', approach: null, item: null, source: 'rule' },
      { ...base, kind: 'input', text: '달려간다', result: 'approach', approach: 'run', item: null, source: 'llm' },
    ]));
    expect(sum.decisions).toHaveLength(2);
    expect(sum.decisions[0]?.detail).toBe('행동 버튼');
    expect(sum.decisions[1]?.detail).toContain('달려가서 길을 묻는다');
  });

  test('GM 통계는 재시도·막힌 줄·대체·시간을 더한다', () => {
    const gm = (attempts: number, violations: string[], fallback: boolean, ms: number): LogEntry => ({ ...base, kind: 'gm', task: 'talk', attempts, violations, fallback, ms, model: null });
    const sum = summarize(scenario, withLog([gm(3, ['a', 'b'], true, 100), gm(1, [], false, 50)]));
    expect(sum.gm).toEqual({ calls: 2, retries: 2, blocked: 2, fallbacks: 1, llmMs: 150 });
  });
});

describe('입력 글 판별', () => {
  test('물음표로 끝나면 행동이 아니다', () => {
    expect(isActionText('간다?')).toBe(false);
    expect(isActionText('간다')).toBe(true);
  });

  test('먼저 한 행동은 네 글자 이상 겹쳐야 같은 일이다', () => {
    expect(preemptedBy('가나다', '가나다')).toBe(false);
    expect(preemptedBy('가나다라', '가나다라')).toBe(true);
  });

  test('의문사 없는 물음은 그냥 물음이 아니다', () => {
    expect(isPlainQuestion('던져 볼까?')).toBe(false);
    expect(isPlainQuestion('뭐 들었어?')).toBe(true);
  });

  test('질문 문장 하나를 질문이자 행동으로 함께 쓰지 않는다', () => {
    expect(splitMixed('왜 그냥 간다. 흠.')).toBeNull();
  });
});
