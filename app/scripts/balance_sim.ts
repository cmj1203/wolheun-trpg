// 균형 측정: --no-llm 경로(LocalGm(null), 서버처럼 행운을 묻는 엔진)로 1화를 전략별로 여러 판 끝까지 돌려
// 결말 분포, 판정 성공률, 행운 소진, 긴장·귀찌 곡선, 비트 수를 잰다. src·content 는 읽기만 한다.
// 조정안은 불러온 시나리오 사본에만 덧씌운다(대본 파일은 그대로다).
//
//   bun scripts/balance_sim.ts                          # 전략 4개 × 10000판, 마크다운 요약을 표준 출력에
//   bun scripts/balance_sim.ts --games 20000 --json out.json
//   (본 측정 + 장면별 선택 실험 + 행운 실험 + 조정안 전후 표는 scripts/balance_report.ts)
//   bun scripts/balance_sim.ts --proposal P1            # 조정안 하나를 덧씌워 같은 측정
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Engine, type GmContext, type GmLines, type GmPort, type Interpretation, type NarrateContext } from '../src/engine/engine.ts';
import { nextU32, seedFrom } from '../src/engine/dice.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import { TRACKS, TENSION_MAX, TENSION_MIN, TENSION_START, type Action, type GameState, type Scenario, type Step, type Tier, type Track } from '../src/engine/types.ts';
import { DEFAULT_GM_OPTIONS, LocalGm } from '../src/gm/gm.ts';
import { loadLore, withNotes, type Lore } from '../src/gm/lore.ts';

const APP = join(import.meta.dir, '..');
export const SCENARIO_PATH = join(APP, 'content', 'ep01_desert.yaml');
export const LORE_PATH = join(APP, 'content', 'lore_wolheun.yaml');

/** 한 판에 넣는 행동 상한. 넘기면 막힌 판으로 센다. */
export const MAX_ACTS = 80;

// ───────────────────────── 전략 ─────────────────────────

export type LuckPolicy = 'always' | 'never' | 'random';

export interface Decide {
  scenario: Scenario;
  state: GameState;
  step: Step;
  /** 전략 전용 난수(엔진 주사위 흐름과 따로). [0,1) */
  rand: () => number;
  /** 이 장면에서 이 전략이 넣은 입력 수(같은 말 되풀이를 피하는 데 쓴다). */
  turn: number;
}

export interface Strategy {
  id: string;
  label: string;
  /** 문서에 적는 한 줄 정의. */
  rule: string;
  luck: LuckPolicy;
  /** 자유 입력 장면에서 넣을 행동. */
  act(d: Decide): Action;
}

/** 장면마다 '안전한' 접근(의심을 덜 올리고 몸을 사리는 쪽). 소지품이 없어 잠기면 다음 후보. */
export const SAFE_PICK: Record<string, string[]> = {
  b02_people: ['watch'],
  b05_why: ['plead'],
  b06_swing: ['block', 'dodge'],
  b08_gaze: ['hide_earring'],
  r2_bind: ['deny'],
  r3_dusk: ['shelter'],
  r4_prove: ['guide'],
  r5_claim: ['manners'],
};

/** 장면마다 정면으로 맞서는 접근(버튼 공격 변형). */
export const BOLD_PICK: Record<string, string[]> = {
  b02_people: ['run'],
  b05_why: ['resist'],
  b06_swing: ['dodge'],
  b08_gaze: ['retort'],
  r2_bind: ['silent'],
  r3_dusk: ['drink'],
  r4_prove: ['wits'],
  r5_claim: ['bluster'],
};

/** 규칙 해석(--no-llm)이 판정 없는 말(talk)로 읽는 입력. tests/balance.test.ts 가 장면마다 확인한다. */
export const TALK_LINES = ['음… 잠깐만요.', '저기, 잠시만 기다려 주세요.', '그러니까 제 말은요…', '하아, 오늘따라 왜 이러지.', '잠깐, 생각 좀 하고요.'];

/** 공격하는 자유 입력. 규칙 해석은 낱말이 맞는 접근이나 즉흥 행동(재치, 보통)으로 받는다. */
export const ATTACK_LINES = ['칼을 빼앗아 남자를 공격한다', '주먹으로 남자의 얼굴을 친다', '모래를 집어 남자 눈에 뿌린다', '남자에게 달려들어 목을 조른다'];

function unlocked(d: Decide): string[] {
  const p = d.step.prompt;
  return p.type === 'free' ? p.approaches.filter((a) => !a.locked).map((a) => a.id) : [];
}

function pickFrom(d: Decide, table: Record<string, string[]>): Action {
  const open = unlocked(d);
  const id = (table[d.state.beat] ?? []).find((a) => open.includes(a)) ?? open[0];
  if (!id) throw new Error(`${d.state.beat}: 고를 접근이 없습니다`);
  return { type: 'approach', id };
}

export const STRATEGIES: Record<string, Strategy> = {
  safe: {
    id: 'safe',
    label: '항상 안전',
    rule: '장면마다 정해 둔 안전한 접근 버튼(살피기·결백·막기·귀찌 숨기기·결백 주장·쉴 곳·길 읽기·예법). 행운은 늘 쓴다.',
    luck: 'always',
    act: (d) => pickFrom(d, SAFE_PICK),
  },
  attack: {
    id: 'attack',
    label: '항상 공격',
    rule: '장면마다 공격 문장을 자유 입력으로 넣는다(규칙 해석이 받는 대로). 행운은 늘 쓴다.',
    luck: 'always',
    act: (d) => ({ type: 'free', text: ATTACK_LINES[(d.turn + d.state.log.length) % ATTACK_LINES.length]! }),
  },
  random: {
    id: 'random',
    label: '무작위',
    rule: '열린 접근 버튼 가운데 하나를 고르게 뽑는다. 행운은 반반으로 쓴다.',
    luck: 'random',
    act: (d) => {
      const open = unlocked(d);
      return { type: 'approach', id: open[Math.floor(d.rand() * open.length)]! };
    },
  },
  talk: {
    id: 'talk',
    label: '말만',
    rule: '판정 없는 말(규칙 해석이 talk 로 읽는 문장)만 돌려 가며 넣는다. 행운은 늘 쓴다.',
    luck: 'always',
    act: (d) => ({ type: 'free', text: TALK_LINES[d.turn % TALK_LINES.length]! }),
  },
  bold: {
    id: 'bold',
    label: '정면 버튼(보조)',
    rule: '장면마다 정면으로 맞서는 접근 버튼(달려가기·칼 밀어내기·몸 던지기·받아치기·버티기·물·말솜씨·호통). 행운은 늘 쓴다.',
    luck: 'always',
    act: (d) => pickFrom(d, BOLD_PICK),
  },
  chat: {
    id: 'chat',
    label: '말 섞기(보조)',
    rule: '장면마다 참을성만큼 말(talk)을 넣어 세계가 한 번 움직이게(징조·재촉) 한 뒤 열린 접근 버튼 하나를 고르게 뽑는다. 행운은 반반으로 쓴다.',
    luck: 'random',
    act: (d) => {
      const patience = d.scenario.beats[d.state.beat]?.free?.patience ?? 1;
      if (d.turn < patience) return { type: 'free', text: TALK_LINES[d.turn % TALK_LINES.length]! };
      const open = unlocked(d);
      return { type: 'approach', id: open[Math.floor(d.rand() * open.length)]! };
    },
  },
};

export const MAIN_STRATEGIES = ['safe', 'attack', 'random', 'talk'] as const;

// ───────────────────────── LLM 공격 가정(보조) ─────────────────────────

/**
 * --no-llm 규칙 해석은 attack 위험·큰 행동(bold)을 내지 않는다. LLM 이 공격 문장을 '칼 앞 큰 맨손 행동'으로 읽는다고 가정할 때
 * 결말이 어떻게 바뀌는지 보려는 보조 GM. 해석만 바꾸고 대사·서술은 LocalGm(null) 그대로다.
 */
export class AttackReadingGm implements GmPort {
  constructor(private readonly inner: LocalGm) {}
  prepare(ctx: Omit<GmContext, 'text'>): void {
    this.inner.prepare(ctx);
  }
  async interpret(ctx: GmContext): Promise<Interpretation> {
    if (ATTACK_LINES.includes(ctx.text)) {
      return { kind: 'improv', stat: '체력', difficulty: -1, label: '공격', absurd: false, bold: true, deed: '남자에게 덤벼들었다.', risk: 'attack', source: 'llm', meta: { attempts: 1, violations: [], fallback: false, ms: 0, model: 'assumed' } };
    }
    return this.inner.interpret(ctx);
  }
  talk(ctx: GmContext): Promise<GmLines> {
    return this.inner.talk(ctx);
  }
  narrate(ctx: NarrateContext): Promise<GmLines> {
    return this.inner.narrate(ctx);
  }
  explain(ctx: GmContext): Promise<GmLines> {
    return this.inner.explain(ctx);
  }
}

// ───────────────────────── 한 판 ─────────────────────────

export interface RollRecord {
  beat: string;
  label: string;
  stat: string;
  /** 행운을 쓰기 전 등급 */
  raw: Tier;
  /** 행운을 쓴 뒤 등급 */
  tier: Tier;
  total: number;
  luck: number;
  /** 실패인데 행운이 모자라 묻지도 않았다. */
  luckShort: boolean;
  /** 이 판정의 접근 id(버튼·해석). 즉흥 행동은 improv. */
  approach: string;
  /** 판정 직전 긴장·귀찌·의심(로그 재구성). */
  before: { tension: number; 귀찌: number; 의심: number };
}

export interface BeatSnapshot {
  beat: string;
  tension: number;
  tracks: Record<Track, number>;
}

export interface GameRecord {
  seed: number;
  ending: string;
  bad: boolean;
  stuck: boolean;
  acts: number;
  beats: string[];
  /** 비트에 들어갈 때(그 비트 효과 전) 값. */
  snapshots: BeatSnapshot[];
  rolls: RollRecord[];
  luckSpent: number;
  luckEnd: number;
  tracks: Record<Track, number>;
  tension: number;
  twists: { beat: string; result: string }[];
  prices: string[];
  talks: number;
  /** 징조가 나온 작은 끝 id */
  warned: string[];
  /** 로그에 없이 수치가 문턱 위로 멈춘 횟수(settleFate 의 holdAboveThreshold). */
  holds: number;
  /** 대가를 뽑은 직후 다음 판정 첫 주사위(같은 rng 를 씨앗으로 쓰는지 보려고). */
  priceThenDie: { id: string; beat: string; die: number }[];
}

/** 시나리오에 덧씌우는 수치 조정(사본에만). */
export type Patch = (s: Scenario) => void;

export interface SimOptions {
  scenario: Scenario;
  lore: Lore;
  /** 기본 LocalGm(null). 'attack-llm' 이면 AttackReadingGm. */
  gm?: 'rule' | 'attack-llm';
  /** 이 비트에서는 이 접근을 고른다(장면별 선택 실험). */
  force?: { beat: string; approach: string };
  /** 전략의 행운 정책을 덮어쓴다. */
  luck?: LuckPolicy;
  /**
   * 가정 실험: 대가를 뽑은 행동 뒤 주사위 흐름(state.rng)을 한 칸 넘긴다. 엔진은 대가를 nextU32(state.rng) 로 뽑고 흐름을
   * 넘기지 않아 다음 판정 첫 주사위와 같은 수를 쓴다. 엔진을 고치지 않고 '따로 뽑았다면'을 흉내 낸다(같은 행동 안에서 대가 뒤
   * 곧바로 굴리는 장면 무브 기본 판정은 흉내 내지 못한다).
   */
  decouplePrice?: boolean;
}

function strategyRand(seed: number): () => number {
  let s = seedFrom(`strategy:${seed}`);
  return () => {
    const n = nextU32(s);
    s = n.state;
    return n.value / 0x1_0000_0000;
  };
}

export function makeEngine(opts: SimOptions): Engine {
  let now = 1_000_000;
  const local = new LocalGm(null, opts.lore, DEFAULT_GM_OPTIONS);
  const gm: GmPort = opts.gm === 'attack-llm' ? new AttackReadingGm(local) : local;
  // 서버(--no-llm)와 같게 실패 직후 행운을 묻는다.
  return new Engine(opts.scenario, gm, () => (now += 1500), true);
}

export async function playOne(engine: Engine, strategy: Strategy, seed: number, opts: Pick<SimOptions, 'force' | 'luck' | 'decouplePrice'> = {}): Promise<GameRecord> {
  const scenario = engine.scenario;
  let { state, step } = engine.newGame(seed, `sim-${seed}`);
  const rand = strategyRand(seed);
  const luckPolicy = opts.luck ?? strategy.luck;
  let acts = 0;
  let turnBeat = '';
  let turn = 0;
  let stuck = false;
  const approachOfCheck: string[] = [];
  const shortMisses = new Set<number>();
  while (!state.ending) {
    if (acts >= MAX_ACTS) {
      stuck = true;
      break;
    }
    let action: Action;
    const prompt = step.prompt;
    if (prompt.type === 'luck') {
      const use = luckPolicy === 'always' ? true : luckPolicy === 'never' ? false : rand() < 0.5;
      action = { type: 'luck', use };
    } else if (state.pendingIntent || state.pendingRisk) {
      // 의도 카드는 "그래", 그만두기 창은 "아니".
      action = { type: 'confirm', ok: state.pendingIntent !== undefined };
    } else if (prompt.type === 'free') {
      if (turnBeat !== state.beat) {
        turnBeat = state.beat;
        turn = 0;
      }
      const forced = opts.force && opts.force.beat === state.beat && prompt.approaches.some((a) => a.id === opts.force!.approach && !a.locked);
      action = forced ? { type: 'approach', id: opts.force!.approach } : strategy.act({ scenario, state, step, rand, turn });
      turn += 1;
    } else if (prompt.type === 'choices') {
      const options = prompt.options;
      action = { type: 'choose', id: options[Math.floor(rand() * options.length)]!.id };
    } else {
      break;
    }
    const checksBefore = state.log.filter((e) => e.kind === 'check').length;
    const res = await engine.act(state, action);
    acts += 1;
    const newLog = res.state.log.slice(state.log.length);
    const checks = res.state.log.filter((e) => e.kind === 'check');
    for (let i = checksBefore; i < checks.length; i++) {
      const check = checks[i]!;
      if (check.kind !== 'check') continue;
      approachOfCheck[i] = checkApproach(scenario, action, newLog, check.beat);
      // 실패인데 행운 창이 뜨지 않았으면 행운이 모자란 것이다(행운을 묻는 엔진).
      // 선택지 판정(choose)은 행운을 묻지 않으므로 자유 입력 장면의 판정만 센다.
      if (check.roll.tier === 'miss' && res.step.prompt.type !== 'luck' && scenario.beats[check.beat]?.free) shortMisses.add(i);
    }
    state = res.state;
    step = res.step;
    if (opts.decouplePrice && newLog.some((e) => e.kind === 'price')) state.rng = nextU32(state.rng).state;
  }
  return summarizeGame(scenario, state, seed, acts, stuck, approachOfCheck, shortMisses);
}

/** 이번 행동에서 생긴 판정의 접근 id. 말만 하다 인물이 먼저 움직인 판정은 default:<기본 접근>. */
function checkApproach(scenario: Scenario, action: Action, newLog: readonly GameState['log'][number][], beat: string): string {
  if (action.type === 'approach') return action.id;
  if (action.type === 'confirm') return 'improv';
  const input = [...newLog].reverse().find((e) => e.kind === 'input');
  if (input?.kind === 'input' && input.result === 'approach' && input.approach) return input.approach;
  if (input?.kind === 'input' && input.result === 'improv') return 'improv';
  return `default:${scenario.beats[beat]?.free?.default_approach ?? '?'}`;
}

function summarizeGame(scenario: Scenario, state: GameState, seed: number, acts: number, stuck: boolean, approaches: string[], shortMisses: Set<number>): GameRecord {
  const tracks: Record<Track, number> = { ...scenario.sheet.tracks };
  let tension = scenario.sheet.tension ?? TENSION_START;
  let holds = 0;
  const snapshots: BeatSnapshot[] = [];
  const beats: string[] = [];
  const rolls: RollRecord[] = [];
  const twists: { beat: string; result: string }[] = [];
  const prices: string[] = [];
  const priceThenDie: GameRecord['priceThenDie'] = [];
  let checkIndex = 0;
  for (const e of state.log) {
    if (e.kind === 'beat') {
      beats.push(e.beat);
      snapshots.push({ beat: e.beat, tension, tracks: { ...tracks } });
    } else if (e.kind === 'tracks') {
      for (const c of e.changes) {
        if (tracks[c.key] !== c.from) holds += 1;
        tracks[c.key] = c.to;
      }
    } else if (e.kind === 'check') {
      const r = e.roll;
      const luck = r.luck ?? 0;
      const raw: Tier = luck > 0 ? 'miss' : r.tier;
      // 행운을 쓰면 긴장은 판정 전 값으로 돌아간다(7~9 는 긴장을 바꾸지 않는다).
      const before = { tension, 귀찌: tracks.귀찌, 의심: tracks.의심 };
      if (luck === 0) tension = Math.max(TENSION_MIN, Math.min(TENSION_MAX, tension + (r.tier === 'hit' ? -1 : r.tier === 'miss' ? 1 : 0)));
      rolls.push({ beat: e.beat, label: r.label, stat: r.stat, raw, tier: r.tier, total: luck > 0 ? r.total - luck : r.total, luck, luckShort: shortMisses.has(checkIndex), approach: approaches[checkIndex] ?? '?', before });
      checkIndex += 1;
    } else if (e.kind === 'twist') {
      twists.push({ beat: e.beat, result: e.result });
    } else if (e.kind === 'price') {
      prices.push(e.id);
    }
  }
  // 대가 뒤 주사위 짝: 판정 결과의 대가와 장면 무브(시간·재촉)의 대가 모두, 그 뒤 처음 굴린 판정과 짝짓는다.
  {
    let lastPrice: { id: string; beat: string } | null = null;
    for (const e of state.log) {
      if (e.kind === 'price') {
        lastPrice = { id: e.id, beat: e.beat };
      } else if (e.kind === 'check' && lastPrice) {
        priceThenDie.push({ ...lastPrice, die: e.roll.dice[0] });
        lastPrice = null;
      }
    }
  }
  for (const key of TRACKS) if (tracks[key] !== state.tracks[key]) holds += 1;
  const ending = state.ending ? state.beat : 'stuck';
  const finalTension = typeof state.flags['긴장'] === 'number' ? state.flags['긴장'] : scenario.sheet.tension ?? TENSION_START;
  if (finalTension !== tension) throw new Error(`seed ${seed}: 긴장 재구성 ${tension} ≠ 엔진 ${finalTension}`);
  const luckSpent = rolls.reduce((n, r) => n + r.luck, 0);
  if (scenario.sheet.tracks.행운 - luckSpent !== state.tracks.행운) throw new Error(`seed ${seed}: 행운 재구성 어긋남`);
  return {
    seed,
    ending,
    bad: scenario.beats[ending]?.ending?.bad === true,
    stuck,
    acts,
    beats,
    snapshots,
    rolls,
    luckSpent,
    luckEnd: state.tracks.행운,
    tracks: { ...state.tracks },
    tension: finalTension,
    twists,
    prices,
    talks: state.log.filter((e) => e.kind === 'input' && e.result === 'talk').length,
    warned: Object.keys(state.flags).filter((k) => k.startsWith('경고_') && state.flags[k] === true).map((k) => k.slice(3)),
    holds,
    priceThenDie,
  };
}

export async function simulate(strategy: Strategy, games: number, opts: SimOptions, seedBase = 0): Promise<GameRecord[]> {
  const engine = makeEngine(opts);
  const out: GameRecord[] = [];
  for (let i = 0; i < games; i++) out.push(await playOne(engine, strategy, seedFrom(`balance:${seedBase + i}`), opts));
  return out;
}

// ───────────────────────── 집계 ─────────────────────────

export interface Ci {
  p: number;
  lo: number;
  hi: number;
}

/** 윌슨 95% 구간. */
export function wilson(k: number, n: number): Ci {
  if (n === 0) return { p: 0, lo: 0, hi: 0 };
  const z = 1.959964;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

export interface Summary {
  games: number;
  endings: Record<string, number>;
  bad: number;
  stuck: number;
  rolls: number;
  raw: Record<Tier, number>;
  final: Record<Tier, number>;
  luckUsedRolls: number;
  luckShort: number;
  luckSpentMean: number;
  luckEndMean: number;
  luckZero: number;
  /** 행운이 3 이하로 떨어진 판 */
  luckLow: number;
  beatsMean: number;
  rollsMean: number;
  actsMean: number;
  talksMean: number;
  holds: number;
  twistRate: number;
  twistBeats: number;
  /** 비트별 진입 값 평균(그 비트를 지난 판만). */
  byBeat: Record<string, { n: number; tension: number; 귀찌: number; 의심: number; 집착: number; 행운: number }>;
  /** k 번째 판정 직전 긴장·귀찌 평균. */
  byRoll: { k: number; n: number; tension: number; 귀찌: number }[];
  /** 접근별 등급(행운 전). */
  byApproach: Record<string, { n: number; hit: number; mixed: number; miss: number }>;
  warned: Record<string, number>;
  earringEnd: number[];
  suspicionEnd: number[];
}

export function summarize(scenario: Scenario, records: readonly GameRecord[]): Summary {
  const n = records.length;
  const endings: Record<string, number> = {};
  const raw: Record<Tier, number> = { hit: 0, mixed: 0, miss: 0 };
  const final: Record<Tier, number> = { hit: 0, mixed: 0, miss: 0 };
  const byBeatAcc: Record<string, { n: number; tension: number; 귀찌: number; 의심: number; 집착: number; 행운: number }> = {};
  const byRollAcc: { n: number; tension: number; 귀찌: number }[] = [];
  const byApproach: Summary['byApproach'] = {};
  const warned: Record<string, number> = {};
  const earringEnd = Array(scenario.sheet.tracks.귀찌 + 1).fill(0) as number[];
  const suspicionEnd = Array(11).fill(0) as number[];
  let rolls = 0,
    luckUsedRolls = 0,
    luckShort = 0,
    luckSpent = 0,
    luckEnd = 0,
    luckZero = 0,
    luckLow = 0,
    beats = 0,
    acts = 0,
    talks = 0,
    holds = 0,
    bad = 0,
    stuck = 0,
    twistHits = 0,
    twistBeats = 0;
  for (const g of records) {
    endings[g.ending] = (endings[g.ending] ?? 0) + 1;
    if (g.bad) bad += 1;
    if (g.stuck) stuck += 1;
    beats += g.beats.length;
    acts += g.acts;
    talks += g.talks;
    holds += g.holds;
    luckSpent += g.luckSpent;
    luckEnd += g.luckEnd;
    if (g.luckEnd === 0) luckZero += 1;
    if (g.luckEnd <= 3) luckLow += 1;
    earringEnd[g.tracks.귀찌] = (earringEnd[g.tracks.귀찌] ?? 0) + 1;
    suspicionEnd[g.tracks.의심] = (suspicionEnd[g.tracks.의심] ?? 0) + 1;
    for (const w of g.warned) warned[w] = (warned[w] ?? 0) + 1;
    for (const t of g.twists) {
      twistBeats += 1;
      if (t.result !== 'none') twistHits += 1;
    }
    const seen = new Set<string>();
    for (const s of g.snapshots) {
      if (seen.has(s.beat)) continue;
      seen.add(s.beat);
      const acc = (byBeatAcc[s.beat] ??= { n: 0, tension: 0, 귀찌: 0, 의심: 0, 집착: 0, 행운: 0 });
      acc.n += 1;
      acc.tension += s.tension;
      acc.귀찌 += s.tracks.귀찌;
      acc.의심 += s.tracks.의심;
      acc.집착 += s.tracks.집착;
      acc.행운 += s.tracks.행운;
    }
    g.rolls.forEach((r, k) => {
      const acc = (byRollAcc[k] ??= { n: 0, tension: 0, 귀찌: 0 });
      acc.n += 1;
      acc.tension += r.before.tension;
      acc.귀찌 += r.before.귀찌;
      rolls += 1;
      raw[r.raw] += 1;
      final[r.tier] += 1;
      if (r.luck > 0) luckUsedRolls += 1;
      if (r.luckShort) luckShort += 1;
      const key = `${r.beat}/${r.approach}`;
      const a = (byApproach[key] ??= { n: 0, hit: 0, mixed: 0, miss: 0 });
      a.n += 1;
      a[r.raw] += 1;
    });
  }
  const byBeat: Summary['byBeat'] = {};
  for (const [k, v] of Object.entries(byBeatAcc)) byBeat[k] = { n: v.n, tension: v.tension / v.n, 귀찌: v.귀찌 / v.n, 의심: v.의심 / v.n, 집착: v.집착 / v.n, 행운: v.행운 / v.n };
  return {
    games: n,
    endings,
    bad,
    stuck,
    rolls,
    raw,
    final,
    luckUsedRolls,
    luckShort,
    luckSpentMean: luckSpent / n,
    luckEndMean: luckEnd / n,
    luckZero,
    luckLow,
    beatsMean: beats / n,
    rollsMean: rolls / n,
    actsMean: acts / n,
    talksMean: talks / n,
    holds,
    twistRate: twistBeats ? twistHits / twistBeats : 0,
    twistBeats,
    byBeat,
    byRoll: byRollAcc.map((v, k) => ({ k: k + 1, n: v.n, tension: v.tension / v.n, 귀찌: v.귀찌 / v.n })),
    byApproach,
    warned,
    earringEnd,
    suspicionEnd,
  };
}

/** 2d6 + 보정이 각 등급에 드는 정확한 확률. */
export function tierOdds(bonus: number): Record<Tier, number> {
  const out: Record<Tier, number> = { hit: 0, mixed: 0, miss: 0 };
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++) {
      const t = a + b + bonus;
      out[t >= 10 ? 'hit' : t >= 7 ? 'mixed' : 'miss'] += 1 / 36;
    }
  return out;
}

// ───────────────────────── 조정안 ─────────────────────────

function approach(s: Scenario, beat: string, id: string) {
  const a = s.beats[beat]?.free?.approaches.find((x) => x.id === id);
  if (!a) throw new Error(`조정안: 없는 접근 ${beat}/${id}`);
  return a;
}

export interface Proposal {
  id: string;
  title: string;
  /** '어디 · 전 → 후' 줄 */
  changes: string[];
  apply: Patch;
}

function setRoute(s: Scenario, beat: string, from: string, to: string): void {
  const next = s.beats[beat]?.next;
  const r = Array.isArray(next) ? next.find((x) => x.if === from) : undefined;
  if (!r) throw new Error(`조정안: ${beat} 에 조건 "${from}" 이 없습니다`);
  r.if = to;
}

function setFate(s: Scenario, id: string, when: string, warn?: string): void {
  const f = s.fates?.find((x) => x.id === id);
  if (!f) throw new Error(`조정안: 없는 작은 끝 ${id}`);
  f.when = when;
  if (warn !== undefined && f.warn) f.warn.when = warn;
}

function setTrack(s: Scenario, beat: string, id: string, tier: Tier, track: Track, value: number): void {
  const o = approach(s, beat, id).outcomes[tier];
  const tracks = { ...o.effects?.tracks };
  if (value === 0) delete tracks[track];
  else tracks[track] = value;
  o.effects = { ...o.effects, tracks };
}

export const PROPOSALS: Record<string, Proposal> = {
  P1: {
    id: 'P1',
    title: '판결 문턱: 묶이는 의심을 6에서 7로',
    changes: ['ep01_desert.yaml b09_verdict.next 첫 갈래 · `if: 의심 >= 6` → `if: 의심 >= 7`'],
    apply: (s) => setRoute(s, 'b09_verdict', '의심 >= 6', '의심 >= 7'),
  },
  P2: {
    id: 'P2',
    title: '원작 결말 문턱: 흥미를 끄는 집착을 4에서 3으로',
    changes: ['ep01_desert.yaml b09_verdict.next 둘째 갈래 · `if: 집착 >= 4` → `if: 집착 >= 3`'],
    apply: (s) => setRoute(s, 'b09_verdict', '집착 >= 4', '집착 >= 3'),
  },
  P3: {
    id: 'P3',
    title: '"안전한" 접근의 대가 있는 성공에서 의심을 빼기',
    changes: [
      'ep01_desert.yaml b02_people.watch.mixed.effects · `의심: 1` → (뺌)',
      'ep01_desert.yaml b08_gaze.hide_earring.mixed.effects · `의심: 1` → (뺌)',
    ],
    apply: (s) => {
      setTrack(s, 'b02_people', 'watch', 'mixed', '의심', 0);
      setTrack(s, 'b08_gaze', 'hide_earring', 'mixed', '의심', 0);
    },
  },
  P4: {
    id: 'P4',
    title: '말만 해도 남자를 만나기까지: 쓰러지는 머뭇을 3에서 4로(징조 2→3)',
    changes: ['ep01_desert.yaml fates.collapse · `when: flag:머뭇 >= 3`, `warn.when: flag:머뭇 >= 2` → `when: flag:머뭇 >= 4`, `warn.when: flag:머뭇 >= 3`'],
    apply: (s) => setFate(s, 'collapse', 'flag:머뭇 >= 4', 'flag:머뭇 >= 3'),
  },
  P5: {
    id: 'P5',
    title: '귀찌 시계에 힘을: 한여름의 태양 장면에 시간 1',
    changes: ['ep01_desert.yaml b08_gaze · `time:` (없음) → `time: 1`'],
    apply: (s) => {
      const b = s.beats.b08_gaze;
      if (!b) throw new Error('조정안: b08_gaze 가 없습니다');
      b.time = 1;
    },
  },
  P6: {
    id: 'P6',
    title: '행운을 빠듯하게: 시작 행운 6에서 4로',
    changes: ['ep01_desert.yaml sheet.tracks · `행운: 6` → `행운: 4`'],
    apply: (s) => {
      s.sheet.tracks.행운 = 4;
    },
  },
};

/** 조정안을 시나리오 사본에 덧씌운다. */
export function patched(base: Scenario, ids: readonly string[]): Scenario {
  const s = structuredClone(base);
  for (const id of ids) {
    const p = PROPOSALS[id];
    if (!p) throw new Error(`없는 조정안: ${id}`);
    p.apply(s);
  }
  return s;
}

export { approach as approachSpec };

// ───────────────────────── 출력 ─────────────────────────

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export function endingTitle(s: Scenario, id: string): string {
  const e = s.beats[id]?.ending;
  return e ? `${e.title}${e.bad ? '(작은 끝)' : ''}` : id;
}

export function endingIds(s: Scenario): string[] {
  return Object.values(s.beats)
    .filter((b) => b.ending)
    .map((b) => b.id);
}

export async function loadAll(): Promise<{ scenario: Scenario; lore: Lore }> {
  const lore = await loadLore(LORE_PATH);
  return { scenario: withNotes(await loadScenario(SCENARIO_PATH), lore), lore };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      games: { type: 'string', default: '10000' },
      json: { type: 'string' },
      proposal: { type: 'string', multiple: true },
      strategy: { type: 'string', multiple: true },
    },
  });
  const games = Number(values.games);
  const { scenario: base, lore } = await loadAll();
  const scenario = values.proposal?.length ? patched(base, values.proposal) : base;
  const ids = values.strategy?.length ? values.strategy : [...MAIN_STRATEGIES];
  const all: Record<string, Summary> = {};
  for (const id of ids) {
    const strategy = STRATEGIES[id];
    if (!strategy) throw new Error(`없는 전략: ${id}`);
    const started = performance.now();
    const recs = await simulate(strategy, games, { scenario, lore });
    all[id] = summarize(scenario, recs);
    console.error(`${strategy.label}: ${games}판 ${((performance.now() - started) / 1000).toFixed(1)}초`);
  }
  for (const [id, s] of Object.entries(all)) {
    console.log(`\n## ${STRATEGIES[id]!.label}`);
    for (const e of endingIds(scenario)) {
      const k = s.endings[e] ?? 0;
      const ci = wilson(k, s.games);
      console.log(`- ${endingTitle(scenario, e)}: ${k} (${pct(ci.p)}, ${pct(ci.lo)}~${pct(ci.hi)})`);
    }
    console.log(`- 판정 ${s.rolls} 행운 전 성공 ${pct(s.raw.hit / s.rolls)} 대가 ${pct(s.raw.mixed / s.rolls)} 실패 ${pct(s.raw.miss / s.rolls)} · 비트 ${s.beatsMean.toFixed(2)} · 행운 끝 ${s.luckEndMean.toFixed(2)}`);
  }
  if (values.json) await writeFile(values.json, JSON.stringify(all, null, 1));
}
