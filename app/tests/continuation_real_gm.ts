import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evalCond } from '../src/engine/conditions.ts';
import { loadCampaignScenario, resumeCampaign } from '../src/engine/continuation.ts';
import { roll2d6 } from '../src/engine/dice.ts';
import { Engine } from '../src/engine/engine.ts';
import { readSave, writeSave } from '../src/engine/save.ts';
import type { Action, GameState, Tier } from '../src/engine/types.ts';
import { DEFAULT_GM_OPTIONS, LocalGm } from '../src/gm/gm.ts';
import { LlmClient } from '../src/gm/llm.ts';
import { loadLore, loreFor, withNotes } from '../src/gm/lore.ts';

// 수동 실행 전용. 기본 단위 시험에서는 실제 모델을 호출하지 않는다.
const APP = join(import.meta.dir, '..');
const RUN = join(APP, '..', 'work', 'continuation', 'ep02', 'run');
const ONLY = Bun.argv[2];
const OUT = join(RUN, `real-gm-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
const TRANSCRIPT = join(OUT, 'transcript.jsonl');
writeFileSync(TRANSCRIPT, '', { flag: 'wx' });
const lore = await loadLore(join(APP, 'content', 'lore_wolheun.yaml'));
const scenario = withNotes(await loadCampaignScenario(join(APP, 'content', 'ep01_desert.yaml')), lore);
let currentCase = '';
let traces = 0;
const gm = new LocalGm(new LlmClient({
  baseUrl: 'http://127.0.0.1:18196',
  timeoutMs: 60_000,
}), lore, {
  ...DEFAULT_GM_OPTIONS,
  onTrace(trace) {
    traces += 1;
    appendFileSync(TRANSCRIPT, `${JSON.stringify({ case: currentCase, kind: 'gm', trace })}\n`);
  },
});
const rows: { name: string; passed: boolean; error?: string }[] = [];
const OUTSIDE_INPUT = '(하늘을 향해 택시를 불러 달라고 외친다)';
const MIXED_SPEECH_INPUT = '（그의 눈을 피하지 않고 손목을 잡은 손을 내려다본다） 잡은 손부터 놓아 주세요.';

function record(kind: string, detail: unknown): void {
  appendFileSync(TRANSCRIPT, `${JSON.stringify({ case: currentCase, kind, detail })}\n`);
}

function capture(engine: Engine): GameState {
  // 감옥 직전 저장의 입력 fixture이며 복귀 처리는 실제 구현을 호출한다.
  const { state } = engine.newGame(913, `real-${currentCase}`);
  state.beat = 'e_curious';
  state.ending = 'curious';
  state.free = null;
  state.tracks = { ...state.tracks, 체력: 3, 정신력: 3, 귀찌: 4, 의심: 2, 탈주: 1 };
  state.items = state.items.filter((item) => item !== 'map');
  state.flags = { 가방_끈: true, 지도_찢김: true, 플레이어_기억: '모래를 맛봄' };
  record('fixture', state);
  return state;
}

async function entered() {
  const engine = new Engine(scenario, gm);
  const resumed = await resumeCampaign(engine, capture(engine));
  record('resume', resumed);
  assert.equal(resumed.state.beat, 'ep02_unlock');
  return { engine, state: resumed.state };
}

async function act(engine: Engine, state: GameState, action: Action) {
  const before = { beat: state.beat, rng: state.rng, tracks: state.tracks, items: state.items };
  const result = await engine.act(state, action);
  record('action', { before, action, ...result });
  return result;
}

async function atQuestion() {
  const { engine, state } = await entered();
  const result = await act(engine, state, { type: 'approach', id: 'steady' });
  assert.equal(result.state.beat, 'ep02_question');
  return { engine, state: result.state };
}

async function run(name: string, body: () => Promise<void>): Promise<void> {
  if (ONLY && !name.includes(ONLY)) return;
  currentCase = name;
  console.log(`CASE_START ${name}`);
  try {
    await body();
    rows.push({ name, passed: true });
    console.log(`CASE_PASS ${name}`);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    rows.push({ name, passed: false, error: error.stack ?? error.message });
    record('failure', { message: error.message, stack: error.stack });
    console.log(`CASE_FAIL ${name}: ${error.message}`);
  }
}

function escapeSeed(state: GameState, tier: Tier): number {
  const approach = scenario.beats.ep02_question?.free?.approaches.find((a) => a.id === 'escape');
  assert.ok(approach);
  const mods = (approach.mods ?? []).filter((mod) => evalCond(mod.if, state));
  for (let seed = 1; seed <= 10_000; seed += 1) {
    if (roll2d6(seed, approach.label, approach.stat, state.abilities[approach.stat], mods).roll.tier === tier) return seed;
  }
  assert.fail(`${tier} 재현 시드 없음`);
}

await run('공개 전후 질문과 본선 계승', async () => {
  const engine = new Engine(scenario, gm);
  const initial = engine.newGame(913, 'real-before-disclosure');
  record('new', initial);
  await act(engine, initial.state, { type: 'ask', text: '여기가 어느 나라이고 누가 다스려?' });
  const resumed = await resumeCampaign(engine, capture(engine));
  record('resume', resumed);
  const country = await act(engine, resumed.state, { type: 'ask', text: '페시안의 감옥에 왜 갇힌 거야?' });
  const unknown = await act(engine, country.state, { type: 'ask', text: '날 데려온 사람은 누구야?' });
  const unlocked = await act(engine, unknown.state, { type: 'free', text: '(손끝으로 핀의 떨림을 누르며 걸리는 곳을 조용히 밀어 본다)' });
  assert.equal(unlocked.state.beat, 'ep02_question');
  const beforeTitle = await act(engine, unlocked.state, { type: 'ask', text: '이 남자의 이름과 지위가 뭐야?' });
  assert.ok(!loreFor(lore, beforeTitle.state).knowledge.some((note) => note.id === 'man_title' || note.id === 'man_true'));
  const final = await act(engine, beforeTitle.state, { type: 'approach', id: 'conceal' });
  assert.equal(final.state.beat, 'ep02_court_boundary');
  assert.equal(final.state.ending, null);
  assert.ok(!final.state.items.includes('map'));
  assert.equal(final.state.flags.가방_끈, true);
  assert.equal(final.state.flags.플레이어_기억, '모래를 맛봄');
  const afterTitle = await act(engine, final.state, { type: 'ask', text: '시하드가 누구인지 이제 알 수 있어?' });
  record('knowledge', loreFor(lore, afterTitle.state));
  assert.ok(!loreFor(lore, afterTitle.state).knowledge.some((note) => note.id === 'man_true'));
});

for (const text of ['(가만히 있는다)', '(울음을 삼키며 숨을 고른다)']) {
  await run(`무행동 ${text}`, async () => {
    const { engine, state } = await entered();
    const result = await act(engine, state, { type: 'free', text });
    assert.equal(result.state.rng, state.rng);
    assert.equal(result.state.free?.rolls, state.free?.rolls);
    assert.ok(!result.step.events.some((event) => event.type === 'roll'));
    assert.equal(result.state.beat, 'ep02_unlock');
  });
}

for (const text of ['(', '()', '（', '（ ）']) {
  await run(`입력 수정 ${JSON.stringify(text)}`, async () => {
    const { engine, state } = await entered();
    const result = await act(engine, state, { type: 'free', text });
    assert.equal(result.state.beat, state.beat);
    assert.equal(result.state.rng, state.rng);
    assert.deepEqual(result.state.tracks, state.tracks);
    assert.deepEqual(result.state.items, state.items);
    assert.equal(result.state.free?.rolls, state.free?.rolls);
    assert.ok(!result.step.events.some((event) => event.type === 'roll'));
  });
}

for (const text of [
  '문이 열려 있어서 걸어 나왔어요.',
  MIXED_SPEECH_INPUT,
  '(그의 옷깃을 당겨 입술에 짧게 입을 맞춘다)',
  OUTSIDE_INPUT,
]) {
  await run(`재회 새 표현 ${text}`, async () => {
    const { engine, state } = await atQuestion();
    let result = await act(engine, state, { type: 'free', text });
    if (result.state.pendingIntent || result.state.pendingRisk) {
      result = await act(engine, result.state, { type: 'confirm', ok: true });
    }
    assert.ok(result.step.events.some((event) => event.type === 'line' || event.type === 'notice'));
    assert.ok(!result.state.items.includes('map'));
    if (text === MIXED_SPEECH_INPUT) {
      assert.equal(result.state.rng, state.rng);
      assert.deepEqual(result.state.tracks, state.tracks);
      assert.ok(!result.step.events.some((event) => event.type === 'roll'));
    }
    if (text === OUTSIDE_INPUT) {
      assert.deepEqual(result.state.tracks, state.tracks);
      assert.deepEqual(result.state.items, state.items);
      assert.equal(result.state.beat, state.beat);
      assert.ok(!result.step.events.some((event) => event.type === 'roll'));
    }
    // 행동의 적절한 반응·말투·문법은 transcript 원문 전체를 별도로 읽어 판정한다.
  });
}

for (const tier of ['hit', 'mixed', 'miss'] as const) {
  await run(`도주 ${tier}`, async () => {
    const { engine, state } = await atQuestion();
    state.rng = escapeSeed(state, tier);
    if (tier === 'miss') state.items = state.items.filter((item) => item !== 'magic_bag');
    const result = await act(engine, state, { type: 'approach', id: 'escape' });
    assert.equal(result.step.events.find((event) => event.type === 'roll')?.tier, tier);
    assert.equal(result.state.beat, tier === 'miss' ? 'ep02_court_boundary' : 'ep02_city_escape');
    assert.ok(!result.state.items.includes('map'));
    if (tier === 'miss') assert.ok(!result.state.items.includes('magic_bag'));
  });
}

await run('후속 중간 저장 재개와 3화 경계', async () => {
  const { engine, state } = await atQuestion();
  const dir = join(OUT, 'saves');
  await writeSave(dir, 'question', scenario, state);
  const restored = await readSave(dir, 'question', scenario);
  const resumed = await resumeCampaign(engine, restored);
  record('middle-resume', resumed);
  assert.equal(resumed.continued, false);
  assert.deepEqual(resumed.state.tracks, state.tracks);
  assert.deepEqual(resumed.state.items, state.items);
  assert.deepEqual(resumed.state.flags, state.flags);
  const final = await act(engine, resumed.state, { type: 'approach', id: 'conceal' });
  await writeSave(dir, 'court', scenario, final.state);
  const court = await readSave(dir, 'court', scenario);
  const courtResume = await resumeCampaign(engine, court);
  record('court-resume', courtResume);
  assert.deepEqual(courtResume.state.tracks, court.tracks);
  assert.deepEqual(courtResume.state.items, court.items);
  const next = await act(engine, courtResume.state, { type: 'choose', id: 'continue_ep03' });
  assert.equal(next.state.beat, 'ep03_c046');
  assert.ok(!next.state.items.includes('magic_bag'));
  assert.ok(!next.state.items.includes('map'));
  assert.ok(next.state.items.includes('earring'));
});

await run('정상 소지품 계승', async () => {
  const engine = new Engine(scenario, gm);
  const before = capture(engine);
  before.items.push('map');
  const resumed = await resumeCampaign(engine, before);
  record('resume', resumed);
  const unlocked = await act(engine, resumed.state, { type: 'approach', id: 'steady' });
  const final = await act(engine, unlocked.state, { type: 'approach', id: 'conceal' });
  assert.equal(final.state.beat, 'ep02_court_boundary');
  for (const item of before.items) assert.ok(final.state.items.includes(item), `${item} 계승`);
  assert.equal(final.state.flags.가방_끈, true);
  assert.equal(final.state.flags.플레이어_기억, before.flags.플레이어_기억);
});

assert.ok(rows.length > 0, '실행할 검증 케이스가 없습니다');
const summary = { selection: ONLY ?? null, cases: rows, traces, transcript: TRANSCRIPT, reviewedDialogue: false };
writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`REAL_GM_DONE pass=${rows.filter((row) => row.passed).length} fail=${rows.filter((row) => !row.passed).length} traces=${traces} output=${OUT}`);
process.exitCode = rows.some((row) => !row.passed) ? 1 : 0;
