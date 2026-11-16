import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine, type NarrateContext } from '../src/engine/engine.ts';
import { rollD6 } from '../src/engine/dice.ts';
import { parseScenario } from '../src/engine/scenario.ts';
import { readSave, readSaveSnapshot, writeSave } from '../src/engine/save.ts';
import { summarize } from '../src/engine/summary.ts';
import { ViewpointPlayback } from '../src/server/viewpoint.ts';
import { connectContinuation, resumeCampaign } from '../src/engine/continuation.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { buildSystem } from '../src/gm/prompt.ts';
import { FakeGm, META, loadWolheunLore } from './helpers.ts';

const SOURCE = `
id: fumble_test
title: 판정 경계
episode: 시험
source: 시험
rating: 15세
start: cell
sheet:
  name: 아시나
  abilities: { 재치: 0, 손재주: 0, 매력: 0, 근력: 0, 교양: 0 }
  tracks: { 체력: 4, 정신력: 4, 의심: 0, 집착: 0, 호감: 0, 귀찌: 7, 탈주: 0, 행운: 6 }
  items: []
cast:
  나레이션: { display: "", style: narration }
  GM: { display: GM, style: gm }
backgrounds: { cell: { label: 감옥, placeholder: blackout } }
sprites: {}
beats:
  cell:
    title: 감옥
    bg: cell
    lines: []
    free:
      prompt: 행동
      situation: 잠긴 문을 연다.
      goal: 문을 연다.
      goals:
        open: { text: 문이 열린다, effects: { flags: { 문_열림: true } }, next: out, price: [strain] }
      speakers: [나레이션]
      must_not: []
      state_guard: []
      talk_fallback: [ { 나레이션: 문 앞에 서 있다. } ]
      press: [ { 나레이션: 문은 잠겨 있다. } ]
      deflect: [ { 나레이션: 문은 움직이지 않는다. } ]
      prices:
        - { id: strain, tag: 수치, weight: soft, text: 힘을 쓰느라 정신력이 닳는다., effects: { 정신력: -1 } }
        - { id: bruise, tag: 수치, weight: hard, text: 문에 부딪쳐 다친다., effects: { 체력: -1 } }
      improv:
        hit: { lines: [ { 나레이션: 문이 열린다. } ], gist: 열린다 }
        mixed: { lines: [ { 나레이션: 힘겹게 문이 열린다. } ], gist: 열린다 }
        miss: { lines: [ { 나레이션: 문이 열리지 않는다. } ], gist: 문이 열리지 않는다, price: [bruise] }
      turns: 5
      default_approach: open
      approaches:
        - id: open
          goal: open
          label: 문을 연다
          stat: 재치
          hint: 문을 민다
          examples: []
          keywords: []
          before: { flags: { 시도_자세: true } }
          outcomes:
            hit: { lines: [ { 나레이션: 문이 열린다. } ], gist: 열린다 }
            mixed: { lines: [ { 나레이션: 힘겹게 문이 열린다. } ], gist: 열린다 }
            miss: { lines: [ { 나레이션: 문이 열리지 않는다. } ], gist: 문이 열리지 않는다, price: [bruise] }
    next: out
  out:
    title: 바깥
    lines: []
    ending: { id: out, title: 바깥, summary: 끝, next_hook: 다음 }
`;

function scenario() { return parseScenario(SOURCE); }
function seedFor(a: number, b: number): number {
  for (let seed = 0; seed < 10_000; seed++) {
    const first = rollD6(seed), second = rollD6(first.state);
    if (first.face === a && second.face === b) return seed;
  }
  throw new Error('주사위 조합 없음');
}
const seed = seedFor(1, 1);

test.each(['고정', '즉흥'] as const)('%s 대실패는 실패 비용 한 번과 실제 추가 한 칸만 적용하고 성취하지 않는다', async (kind) => {
  const s = scenario();
  const contexts: NarrateContext[] = [];
  const gm = new FakeGm(() => kind === '즉흥'
    ? { kind: 'improv', stat: '재치', difficulty: 0, label: '문을 민다', target: 'open', deed: '문을 밀어 연다', bold: false, absurd: false, source: 'llm', meta: META }
    : { kind: 'approach', approach: 'open', item: null, source: 'llm', meta: META });
  gm.narrate = async (ctx) => { contexts.push(structuredClone(ctx)); return { lines: [], meta: META }; };
  const engine = new Engine(s, gm);
  const { state } = engine.newGame(seed, kind);
  const result = await engine.act(state, { type: 'free', text: '(문을 밀어 연다)' });
  expect(result.state.tracks.체력).toBe(2);
  expect(result.state.flags.문_열림).toBeUndefined();
  expect(result.state.preempted).toBeUndefined();
  expect(result.state.log.filter(e => e.kind === 'price').map(e => e.id)).toEqual(['bruise']);
  expect(result.state.log.filter(e => e.kind === 'check')).toHaveLength(1);
  expect(contexts[0]?.roll.tier).toBe('fumble');
  expect(contexts[0]?.outcome.gist).toBe('문이 열리지 않는다');
  expect(contexts[0]?.fumble).toEqual({ key: '체력', from: 3, to: 2 });
  expect(result.step.events.filter(e => e.type === 'tracks').flatMap(e => e.changes).filter(c => c.key === '체력')).toEqual([
    { key: '체력', from: 4, to: 3 }, { key: '체력', from: 3, to: 2 },
  ]);
});

test.each([true, false])('행운 결정 %s 전 효과가 없고 저장·질문·재개 뒤 최종 결과를 한 번 적용한다', async (use) => {
  const s = scenario(), engine = new Engine(s, new FakeGm(), () => 1000, true);
  const { state } = engine.newGame(seed, 'luck');
  const pending = await engine.act(state, { type: 'approach', id: 'open' });
  expect(pending.step.prompt.type).toBe('luck');
  expect(pending.state.tracks).toEqual(state.tracks);
  expect(pending.state.flags).toEqual(state.flags);
  expect(pending.state.flags.시도_자세).toBeUndefined();
  expect(pending.state.flags.문_열림).toBeUndefined();
  expect(pending.state.log.some(e => e.kind === 'price')).toBe(false);
  const dir = await mkdtemp(join(tmpdir(), 'wolheun-fumble-'));
  try {
    await writeSave(dir, 'pending', s, pending.state);
    const saved = await readSave(dir, 'pending', s);
    expect(engine.resume(saved).prompt.type).toBe('luck');
    const question = await engine.act(saved, { type: 'ask', text: '행운이 뭐야?' });
    const result = await engine.act(question.state, { type: 'luck', use });
    expect(result.state.rng).toBe(pending.state.rng);
    expect(result.state.log.filter(e => e.kind === 'check')).toHaveLength(1);
    expect(result.state.log.filter(e => e.kind === 'price')).toHaveLength(1);
    expect(result.state.log.find(e => e.kind === 'check')).toMatchObject({ roll: { tier: use ? 'mixed' : 'fumble' } });
    expect(result.state.tracks.행운).toBe(use ? 1 : 6);
    expect(result.state.tracks.체력).toBe(use ? 4 : 2);
    expect(result.state.flags.문_열림).toBe(use ? true : undefined);
    expect(result.state.flags.시도_자세).toBe(true);
    const rescue = result.step.events.filter(e => e.type === 'change').flatMap(e => e.parts)
      .filter(part => part.text === '대실패 → 아슬아슬한 성공');
    expect(rescue).toEqual(use ? [{ text: '대실패 → 아슬아슬한 성공', tone: 'good' }] : []);
    expect(result.step.events.some(e => e.type === 'roll')).toBe(false);
    await writeSave(dir, 'resolved', s, result.state);
    expect((await readSave(dir, 'resolved', s)).log).toEqual(result.state.log);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('명시 대실패는 자체 결과만 적용하고 기본 강화와 성공 효과를 더하지 않는다', async () => {
  const s = parseScenario(SOURCE.replace('      turns: 5',
    '        fumble: { lines: [ { 나레이션: 문틈에 끼인다. } ], gist: 문틈에 끼인다, effects: { 정신력: -1 }, price: [] }\n      turns: 5'));
  // 고정 접근법의 명시 결과는 같은 선언을 직접 선택한다.
  const free = s.beats.cell?.free;
  if (!free?.improv.fumble || !free.approaches[0]) throw new Error('명시 결과 없음');
  free.approaches[0].outcomes.fumble = free.improv.fumble;
  free.approaches[0].risky = true;
  const engine = new Engine(s, new FakeGm());
  const { state } = engine.newGame(seed, 'explicit');
  const result = await engine.act(state, { type: 'approach', id: 'open' });
  expect(result.state.tracks.정신력).toBe(3);
  expect(result.state.tracks.체력).toBe(4);
  expect(result.state.flags.문_열림).toBeUndefined();
  expect(result.state.log.some(e => e.kind === 'price')).toBe(false);
});

test.each([
  { name: '잠긴 선언 수치', locked: true, suspicion: 0, spirit: 4, health: 4, expectedSpirit: 3, expectedHealth: 4 },
  { name: '상한 선언 수치', locked: false, suspicion: 10, spirit: 4, health: 4, expectedSpirit: 3, expectedHealth: 4 },
  { name: '정신력 소진 뒤 체력', locked: false, suspicion: 10, spirit: 0, health: 4, expectedSpirit: 0, expectedHealth: 3 },
  { name: '모든 후보 포화', locked: false, suspicion: 10, spirit: 0, health: 0, expectedSpirit: 0, expectedHealth: 0 },
])('$name: 가용한 추가 한 칸만 적용하고 포화에 포획을 위조하지 않는다', async (row) => {
  const s = scenario(), free = s.beats.cell?.free;
  if (!free?.approaches[0]) throw new Error('접근법 없음');
  // 새 목표의 mixed 비용 사전 검증과 별개로, 기존 고정 접근법의 포화 실패를 검증한다.
  delete free.approaches[0].goal;
  free.approaches[0].outcomes.miss = { lines: [], effects: { tracks: { 의심: 1 } }, price: [] };
  if (row.locked) s.sheet.reveal = [{ flag: '수치_공개', tracks: ['의심'] }];
  const engine = new Engine(s, new FakeGm());
  const { state } = engine.newGame(seed, row.name);
  state.tracks.의심 = row.suspicion;
  state.tracks.정신력 = row.spirit;
  state.tracks.체력 = row.health;
  const result = await engine.act(state, { type: 'approach', id: 'open' });
  expect(result.state.log.find(e => e.kind === 'check')).toMatchObject({ roll: { tier: 'fumble' } });
  expect(result.state.tracks.정신력).toBe(row.expectedSpirit);
  expect(result.state.tracks.체력).toBe(row.expectedHealth);
  expect(result.state.tracks.의심).toBe(row.locked ? 0 : 10);
  expect(result.state.flags.체력_쓰러짐).toBeUndefined();
  expect(result.state.flags.문_열림).toBeUndefined();
  if (row.health === 0) expect(result.step.events.some(e => e.type === 'tracks')).toBe(false);
});

test('기본 실패가 체력을 소진하면 추가 불이익은 남은 정신력으로 가고 기존 종료 경로만 따른다', async () => {
  const s = scenario(), free = s.beats.cell?.free;
  if (!free?.approaches[0]) throw new Error('접근법 없음');
  free.approaches[0].outcomes.miss.next = 'out';
  const engine = new Engine(s, new FakeGm());
  const { state } = engine.newGame(seed, 'ending');
  state.tracks.체력 = 1;
  const result = await engine.act(state, { type: 'approach', id: 'open' });
  expect(result.state.tracks.체력).toBe(0);
  expect(result.state.tracks.정신력).toBe(3);
  expect(result.state.flags.체력_쓰러짐).toBeUndefined();
  expect(result.state.ending).toBe('out');
  expect(result.state.log.filter(e => e.kind === 'end')).toHaveLength(1);
});

test('큰 양보정 대실패는 최소 행운 한 점을 쓰고 높은 합계·구제 원등급을 저장한다', async () => {
  const s = scenario(), engine = new Engine(s, new FakeGm(), () => 1000, true);
  const { state } = engine.newGame(seed, 'high');
  state.abilities.재치 = 20;
  const pending = await engine.act(state, { type: 'approach', id: 'open' });
  expect(pending.step.prompt).toMatchObject({ type: 'luck', need: 1 });
  const result = await engine.act(pending.state, { type: 'luck', use: true });
  const check = result.state.log.find(e => e.kind === 'check');
  expect(check).toMatchObject({ roll: { total: 22, tier: 'mixed', luck: 1, rescuedFrom: 'fumble', dice: [1, 1] } });
  expect(result.state.tracks.행운).toBe(5);
  expect(result.state.rng).toBe(pending.state.rng);
  expect(summarize(s, result.state).checks[0]).toMatchObject({ rescuedFrom: 'fumble' });
  expect(result.step.events.filter(e => e.type === 'change').flatMap(e => e.parts)).toContainEqual({ text: '대실패 → 아슬아슬한 성공', tone: 'good' });
  expect(result.step.events.some(e => e.type === 'roll')).toBe(false);
});

test('행운이 부족하면 묻지 않고 대실패 비용·추가 불이익을 한 번 적용한다', async () => {
  const s = scenario(), engine = new Engine(s, new FakeGm(), () => 1000, true);
  const { state } = engine.newGame(seed, 'short');
  state.tracks.행운 = 1;
  const result = await engine.act(state, { type: 'approach', id: 'open' });
  expect(result.state.pendingLuck).toBeUndefined();
  expect(result.state.tracks.행운).toBe(1);
  expect(result.state.tracks.체력).toBe(2);
  expect(result.state.log.filter(e => e.kind === 'price')).toHaveLength(1);
});

test('무행동·호흡 응답은 대실패 시드여도 판정과 RNG를 소비하지 않는다', async () => {
  const s = scenario(), engine = new Engine(s, new FakeGm(() => ({ kind: 'idle', source: 'rule', meta: META })));
  const { state } = engine.newGame(seed, 'idle');
  const result = await engine.act(state, { type: 'free', text: '(천천히 숨을 고른다)' });
  expect(result.state.rng).toBe(state.rng);
  expect(result.state.log.some(e => e.kind === 'check')).toBe(false);
  expect(result.step.events.some(e => e.type === 'roll')).toBe(false);
});

test('옛 자연 1·1 miss 기록은 저장을 읽어도 소급 대실패로 바뀌지 않는다', async () => {
  const s = scenario(), engine = new Engine(s, new FakeGm());
  const { state } = engine.newGame(seed, 'legacy');
  state.log.push({ kind: 'check', beat: 'cell', at: 0, playMs: 0, roll: { label: '옛 판정', stat: '재치', statValue: 0, mods: [], dice: [1, 1], total: 2, tier: 'miss' } });
  const dir = await mkdtemp(join(tmpdir(), 'wolheun-old-miss-'));
  try {
    await writeSave(dir, 'old', s, state);
    const loaded = await readSave(dir, 'old', s);
    expect(loaded.log).toEqual(state.log);
    expect(loaded.tracks).toEqual(state.tracks);
    expect(loaded.rng).toBe(state.rng);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('대실패 즉흥 fallback과 이후 GM 기억은 실패한 목표를 성취로 만들지 않는다', async () => {
  const s = scenario(), lore = await loadWolheunLore();
  const local = new LocalGm(null, lore);
  let observed: NarrateContext | undefined;
  const gm = new FakeGm(() => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '문을 민다', target: 'open', deed: '문을 밀어 연다', bold: false, absurd: false, source: 'llm', meta: META }));
  gm.narrate = async ctx => { observed = structuredClone(ctx); return local.narrate(ctx); };
  const engine = new Engine(s, gm), { state } = engine.newGame(seed, 'fallback');
  const result = await engine.act(state, { type: 'free', text: '(문을 밀어 연다)' });
  expect(result.step.events.filter(e => e.type === 'line').map(e => e.text)).not.toContain('문을 밀어 연다.');
  expect(observed?.fumble).toEqual({ key: '체력', from: 3, to: 2 });
  if (!observed) throw new Error('GM 문맥 없음');
  const after = buildSystem({ ...observed, state: result.state, text: '' }, lore);
  const withoutFailedCheck = { ...result.state, log: result.state.log.filter(e => e.kind !== 'check') };
  expect(after).toBe(buildSystem({ ...observed, state: withoutFailedCheck, text: '' }, lore));
  expect(result.state.flags.문_열림).toBeUndefined();
});

test('명시 대실패의 없는 비용과 성공 목표 효과는 기존 파서 검증을 통과하지 못한다', () => {
  expect(() => parseScenario(SOURCE.replace('      turns: 5',
    '        fumble: { lines: [ { 나레이션: 막힌다. } ], price: [missing] }\n      turns: 5'))).toThrow('표에 없는 대가');
  expect(() => parseScenario(SOURCE.replace('      turns: 5',
    '        fumble: { lines: [ { 나레이션: 막힌다. } ], effects: { flags: { 문_열림: true } } }\n      turns: 5'))).toThrow('성공 효과');
});

test.each([false, true])('선택지 판정도 명시 결과 %s 여부에 따라 대실패 한 칸만 적용한다', async (explicit) => {
  const s = scenario(), beat = s.beats.cell;
  if (!beat) throw new Error('장면 없음');
  delete beat.free;
  beat.choices = [{
    id: 'push', text: '문을 민다', check: { stat: '재치', label: '문을 민다' }, next: 'out',
    outcomes: {
      hit: { lines: [] }, mixed: { lines: [] },
      miss: { lines: [], effects: { tracks: { 정신력: -1 } } },
      ...(explicit ? { fumble: { lines: [], effects: { tracks: { 정신력: -1 } } } } : {}),
    },
  }];
  const engine = new Engine(s, new FakeGm()), { state } = engine.newGame(seed, 'choice');
  const result = await engine.act(state, { type: 'choose', id: 'push' });
  expect(result.state.tracks.정신력).toBe(explicit ? 3 : 2);
  expect(result.state.log.find(e => e.kind === 'check')).toMatchObject({ roll: { tier: 'fumble' } });
  expect(result.state.ending).toBe('out');
});

test('이미 종료한 상태에는 대실패 시드여도 새 판정·추가 불이익을 적용하지 않는다', async () => {
  const s = scenario(), engine = new Engine(s, new FakeGm());
  const { state } = engine.newGame(seed, 'ended');
  state.ending = 'out';
  const before = structuredClone(state);
  await expect(engine.act(state, { type: 'approach', id: 'open' })).rejects.toThrow('이미 끝난');
  expect(state).toEqual(before);
});

test('실패 전이 뒤 표시 투영·비공개 저장·재개는 대실패와 실제 추가 불이익을 보존한다', async () => {
  const s = scenario(), free = s.beats.cell?.free;
  if (!free?.approaches[0] || !s.beats.out) throw new Error('실패 경로 없음');
  free.approaches[0].outcomes.miss.next = 'out';
  s.beats.out.lines = [{ speaker: '나레이션', text: '문은 끝내 열리지 않았다.' }];
  const engine = new Engine(s, new FakeGm()), { state } = engine.newGame(seed, 'view');
  const playback = new ViewpointPlayback();
  const result = await engine.act(state, { type: 'approach', id: 'open' }, undefined, { observer: playback.observe });
  const frames = result.step.events.flatMap(event => 'frame' in event && event.frame ? [event.frame] : []);
  expect(frames.length).toBeGreaterThan(0);
  for (const token of frames) playback.confirm(token);
  const last = frames.at(-1);
  const question = playback.question(last);
  expect(question.state.tracks.체력).toBe(2);
  expect(question.state.log.find(e => e.kind === 'check')).toMatchObject({ roll: { tier: 'fumble' } });
  const dir = await mkdtemp(join(tmpdir(), 'wolheun-fumble-view-'));
  try {
    const packed = playback.save();
    await writeSave(dir, 'view', s, result.state, 1000, { frame: last }, packed);
    const saved = await readSaveSnapshot(dir, 'view', s);
    expect(saved.viewpoint).toEqual(packed);
    expect(saved.state.tracks).toEqual(result.state.tracks);
    expect(saved.state.log).toEqual(result.state.log);
    const resumed = engine.resume(saved.state);
    expect(resumed.events.find(e => e.type === 'ending')).toBeDefined();
    expect(saved.state.log).toEqual(result.state.log);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('대실패로 도달한 옛 종료 저장을 다음 화로 계승해도 판정·비용·RNG가 재적용되지 않는다', async () => {
  const s = scenario(), free = s.beats.cell?.free;
  if (!free?.approaches[0] || !s.beats.out) throw new Error('실패 경로 없음');
  for (const [id, ending] of [['e_curious', 'curious'], ['e_survivor', 'survivor']] as const) {
    s.beats[id] = { ...s.beats.out, id, ending: { id: ending, title: '경계', summary: '경계', next_hook: '' } };
  }
  free.approaches[0].outcomes.miss.next = [{ if: '체력 > 0', to: 'e_curious' }, { to: 'e_survivor' }];
  const engine = new Engine(s, new FakeGm()), { state } = engine.newGame(seed, 'chapter');
  const failed = await engine.act(state, { type: 'approach', id: 'open' });
  const campaign = connectContinuation(s, {
    ...s, id: 'next_test', start: 'next',
    beats: { next: { id: 'next', title: '다음 화', lines: [], choices: [{ id: 'stay', text: '머문다', next: 'next' }] } },
  });
  const dir = await mkdtemp(join(tmpdir(), 'wolheun-fumble-chapter-'));
  try {
    await writeSave(dir, 'boundary', s, failed.state);
    const saved = await readSave(dir, 'boundary', campaign);
    const continued = await resumeCampaign(new Engine(campaign, new FakeGm()), saved);
    expect(continued.continued).toBe(true);
    expect(continued.state.beat).toBe('next');
    expect(continued.state.tracks).toEqual(failed.state.tracks);
    expect(continued.state.rng).toBe(failed.state.rng);
    expect(continued.state.log.filter(e => e.kind === 'check' || e.kind === 'price' || e.kind === 'tracks'))
      .toEqual(failed.state.log.filter(e => e.kind === 'check' || e.kind === 'price' || e.kind === 'tracks'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
