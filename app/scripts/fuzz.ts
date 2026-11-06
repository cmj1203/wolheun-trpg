// 시드 고정 무작위 플레이 퍼저. 규칙 경로(--no-llm, LocalGm(null))로 엔진을 수만 판 돌려 불변식을 검사한다.
// 모든 행동 종류(선택지·행동 단추·자유 입력·끼어들기·질문·확인·행운)와 그 잘못된 형태, 저장·불러오기(JSON 왕복과 실제 파일),
// 그만두기, 끝난 판에 보내는 행동을 섞는다. src 는 읽기만 한다.
//
//   bun scripts/fuzz.ts                         # 기본 20000판, 시드 1부터
//   bun scripts/fuzz.ts --games 50000 --seed 7  # 판 수와 첫 시드
//   bun scripts/fuzz.ts --server 300            # 서버(HTTP) 퍼즈도 300판 돌린다(잘못된 요청 포함)
//   bun scripts/fuzz.ts --replay 1234           # 그 판 하나를 다시 돌리고 행동 목록을 보인다
//
// 불변식이 깨지면 판 시드·행동 번호·행동·이유를 적고 0 이 아닌 값으로 끝난다. 같은 시드는 언제나 같은 판을 낸다.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Engine, type GmContext, type GmLines, type GmPort, type InputScreen, type Interpretation, type NarrateContext } from '../src/engine/engine.ts';
import { nextU32 } from '../src/engine/dice.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import { SaveError, assertState, readSave, writeSave } from '../src/engine/save.ts';
import { summarize } from '../src/engine/summary.ts';
import { holdBefore } from '../src/engine/conditions.ts';
import { ABILITIES, GameError, TENSION_MAX, TENSION_MIN, TRACKS, TRACK_INFO, type Action, type GameState, type Scenario, type Step } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { loadLore, withNotes, type Lore } from '../src/gm/lore.ts';

const APP = join(import.meta.dir, '..');
const ROOT = join(APP, '..');

// ───────────── 난수 ─────────────

/** 퍼저 자신의 난수(엔진 주사위와 별개). mulberry32. */
export class Rng {
  constructor(private s: number) {}
  u32(): number {
    const n = nextU32(this.s);
    this.s = n.state;
    return n.value;
  }
  int(n: number): number {
    return n <= 0 ? 0 : this.u32() % n;
  }
  chance(p: number): boolean {
    return this.u32() / 0x1_0000_0000 < p;
  }
  pick<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new Error('빈 목록에서 고를 수 없습니다');
    return xs[this.int(xs.length)] as T;
  }
}

// ───────────── 입력 말뭉치 ─────────────

/** 엔진 정규식에 걸리는 짧은 답, 그만두기 말, 경계 입력. 말뭉치(docs/research/input_corpus.jsonl)와 섞어 쓴다. */
const SHORT = [
  '응', '네', '어', '그래', '써', '쓸게', '바꿔', '아니', '아뇨', '안 써', '됐어', '괜찮아',
  '해', '할게', '진행', '그래도', '싫어', '취소', '안 해', '더 해 볼래', 'ㅇㅇ', 'ㄴㄴ',
  '그만할래', '게임 끝', '끝낼래', '끝내줘', '그만 둘래', '집에 갈래', '여기서 끝',
  '이거 맞아?', '뭐 해야 돼?', '어떻게 해야 해?', '모르겠어', '물 있어?', '지도를 볼 수 있어?',
  '...', '?', '!!', '음', '아', 'ㅋㅋㅋ', '안녕', '당신 누구야?', '저 사람은 왜 저래?',
  '주변을 둘러본다', '도망친다', '칼을 빼앗는다', '총을 쏜다', '귀찌를 뺀다', '나는 마족이야',
  '상인이라고 한다', '길을 물어본다', '미소녀라고 해', '해 지는 쪽으로 간다',
];
const JUNK = ['', ' ', '\n\t ', 'a'.repeat(500), '가'.repeat(250), '😀🌙', '<script>alert(1)</script>', '\u0000​', '{"type":"luck"}', 'null'];

/** 시나리오와 설정 사전이 실제로 쓰는 낱말(정체·거절·그만두기·되받기·접근법 예시, 원작 독자만 아는 이름). 규칙 경로의 여러 갈래에 닿게 한다. */
export function scenarioWords(scenario: Scenario, lore: Lore): string[] {
  const out = new Set<string>();
  for (const w of scenario.identity?.words ?? []) out.add(`나는 ${w}다`), out.add(`${w} 얘기를 꺼낸다`);
  for (const r of scenario.refuse ?? []) for (const w of r.words.slice(0, 6)) out.add(`${w}고 길을 물어본다`);
  for (const r of scenario.risky ?? []) for (const w of r.words) out.add(w);
  for (const c of scenario.callbacks ?? []) for (const w of c.words ?? []) out.add(`저는 ${w}이에요`);
  for (const beat of Object.values(scenario.beats)) {
    for (const a of beat.free?.approaches ?? []) {
      for (const e of a.examples) out.add(e);
      for (const w of a.said?.words ?? []) out.add(`${w}?`), out.add(`${w} 물어본다`);
    }
  }
  for (const name of lore.forbidden.spoilers.slice(0, 12)) out.add(`${name}한테 길을 물어본다`), out.add(`${name}가 어디야?`);
  for (const h of scenario.gameHelp ?? []) out.add(`${h.name}이 뭐야?`);
  return [...out];
}

export async function loadCorpus(): Promise<string[]> {
  try {
    const raw = await readFile(join(ROOT, 'docs', 'research', 'input_corpus.jsonl'), 'utf8');
    return raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => (JSON.parse(l) as { text: string }).text);
  } catch {
    return [];
  }
}

// ───────────── 행동 만들기 ─────────────

export type FuzzOp =
  | { op: 'act'; action: Action; advance: number }
  /** JSON 왕복(저장 파일과 같은 길)으로 불러온 상태를 이어 쓴다. */
  | { op: 'reload' }
  /** 실제 저장 파일에 쓰고 읽는다. */
  | { op: 'disk'; slot: string }
  /** 지금 상태에서 앞으로만 가는 행동으로 결말까지 밀어 본다(멈춤 검사). 원래 판은 그대로 잇는다. */
  | { op: 'drive' };

function text(rng: Rng, corpus: readonly string[]): string {
  const r = rng.int(10);
  if (r < 4 && corpus.length) return rng.pick(corpus);
  if (r < 8) return rng.pick(SHORT);
  if (r < 9) return rng.pick(JUNK);
  // 두 입력을 잇는다(질문+행동 섞인 입력 따위).
  return `${rng.pick(SHORT)} ${corpus.length ? rng.pick(corpus) : rng.pick(SHORT)}`;
}

/** 평범한 객체에서 물려받는 이름. 시나리오 표를 이 이름으로 찾으면 비트가 아닌 것이 나온다. */
const PROTO = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];

function anyBeat(rng: Rng, scenario: Scenario): string {
  return rng.pick(Object.keys(scenario.beats));
}

/** 지금 상태에서 무작위 행동 하나. 대부분은 화면이 낼 만한 것이고, 일부는 일부러 틀린 것이다. */
export function randomAction(rng: Rng, scenario: Scenario, state: GameState, step: Step, corpus: readonly string[]): Action {
  const prompt = step.prompt;
  const beat = scenario.beats[state.beat];
  const roll = rng.int(100);
  // 화면이 낼 만한 행동
  if (roll < 60) {
    if (prompt.type === 'choices' && prompt.options.length) return { type: 'choose', id: rng.pick(prompt.options).id };
    if (prompt.type === 'luck') return rng.chance(0.7) ? { type: 'luck', use: rng.chance(0.5) } : { type: 'free', text: rng.pick(['응', '써', '아니', '안 써', '됐어', ...SHORT]) };
    if (prompt.type === 'free') {
      const r = rng.int(10);
      if (r < 3) return { type: 'approach', id: rng.pick(prompt.approaches).id };
      if (r < 8) return { type: 'free', text: text(rng, corpus) };
      return { type: 'ask', text: text(rng, corpus), scene: rng.chance(0.8) ? state.beat : null };
    }
  }
  if (roll < 72) return { type: 'confirm', ok: rng.chance(0.5) };
  if (roll < 84) {
    const lines = beat?.lines ?? [];
    const shown = Array.from({ length: rng.int(4) }, () => {
      const l = lines.length ? rng.pick(lines) : { speaker: 'GM', text: '...' };
      return { speaker: rng.chance(0.2) ? 'GM' : l.speaker, text: l.text };
    });
    const pending = Array.from({ length: rng.int(4) }, (_, i) => {
      const l = lines.length ? rng.pick(lines) : { text: '...' };
      // 화면이 보내는 조건식. 가끔 읽을 수 없는 식·조작된 식을 섞는다.
      const cond = rng.chance(0.1) ? rng.pick(['flag:말함 &&', '(((', '!', '의심 >=', '말함', 'flag:말함 || ', '']) : 'if' in l && typeof l.if === 'string' ? l.if : rng.chance(0.3) ? rng.pick(['!flag:말함', 'flag:말함', '!flag:길_물음', 'flag:길_물음', '!flag:이미_길_물음']) : undefined;
      return { i, text: l.text, ...(cond !== undefined ? { if: cond } : {}) };
    });
    const scene = rng.int(10) < 7 ? state.beat : rng.chance(0.5) ? anyBeat(rng, scenario) : rng.pick([null, 'no_such_beat', ...PROTO]);
    return { type: 'interject', text: text(rng, corpus), scene, shown, pending };
  }
  // 틀린 행동: 없는 id, 다른 비트의 id, 지금 고를 수 없는 것
  const other = scenario.beats[anyBeat(rng, scenario)];
  const r = rng.int(6);
  if (r === 0) return { type: 'choose', id: rng.pick([...(other?.choices?.map((c) => c.id) ?? []), 'nope', '']) };
  if (r === 1) return { type: 'approach', id: rng.pick([...(other?.free?.approaches.map((a) => a.id) ?? []), 'nope', '']) };
  if (r === 2) return { type: 'luck', use: rng.chance(0.5) };
  if (r === 3) return { type: 'free', text: rng.pick(JUNK) };
  if (r === 4) return { type: 'ask', text: text(rng, corpus), scene: rng.pick([anyBeat(rng, scenario), 'no_such_beat', null, ...PROTO]) };
  return { type: 'free', text: text(rng, corpus) };
}

/** 앞으로만 가는 행동(멈춤 검사용). 결말에 가는 길을 고른다. */
export function forwardAction(rng: Rng, step: Step): Action | null {
  const p = step.prompt;
  if (p.type === 'end') return null;
  if (p.type === 'luck') return { type: 'luck', use: rng.chance(0.5) };
  if (p.type === 'choices') return p.options.length ? { type: 'choose', id: rng.pick(p.options).id } : null;
  const open = p.approaches.filter((a) => !a.locked);
  return open.length ? { type: 'approach', id: rng.pick(open).id } : null;
}

// ───────────── GM ─────────────

/**
 * 규칙 GM(LocalGm(null))을 감싸 해석을 가끔 LLM 이 낼 만한 것으로 바꾼다(큰 행동, 칼 앞 맨손, 정체 노출, 세계 밖 물건).
 * 규칙 경로만으로는 의도 카드·위험 경고·정체 대가 갈래에 닿지 않는다. 판 시드로 정해지니 재현된다.
 */
export class ChaosGm implements GmPort {
  private readonly rng: Rng;
  constructor(
    private readonly inner: LocalGm,
    seed: number,
    private readonly rate: number,
  ) {
    this.rng = new Rng(seed ^ 0x7f4a7c15);
  }
  prepare(ctx: Omit<GmContext, 'text'>): void {
    this.inner.prepare(ctx);
  }
  screen(ctx: GmContext): InputScreen | null {
    return this.inner.screen(ctx);
  }
  async interpret(ctx: GmContext): Promise<Interpretation> {
    const read = await this.inner.interpret(ctx);
    if (!this.rng.chance(this.rate)) return read;
    const meta = read.meta;
    const r = this.rng.int(6);
    const deed = this.rng.pick(['남자의 팔을 붙잡았다', '칼을 쳐냈다', '모래를 뿌렸다', '정체를 밝혔다']);
    if (r === 0) return { kind: 'improv', stat: '근력', difficulty: 0, label: '즉흥 행동', absurd: false, bold: true, deed, source: 'llm', meta };
    if (r === 1) return { kind: 'improv', stat: '근력', difficulty: -1, label: '즉흥 행동', absurd: false, bold: this.rng.chance(0.5), deed, risk: 'attack', source: 'llm', meta };
    if (r === 2) return { kind: 'improv', stat: '매력', difficulty: 0, label: '즉흥 행동', absurd: false, bold: true, deed, risk: 'identity', source: 'llm', meta };
    if (r === 3) return { kind: 'talk', to: this.rng.chance(0.5) ? 'person' : 'self', risk: 'identity', source: 'llm', meta };
    if (r === 4) return { kind: 'improv', stat: '재치', difficulty: -1, label: '즉흥 행동', absurd: true, bold: false, deed: '품을 더듬었다', source: 'llm', meta };
    const free = ctx.free.approaches;
    return { kind: 'approach', approach: this.rng.pick(free).id, item: null, spoken: this.rng.chance(0.5), ...(this.rng.chance(0.3) ? { risk: 'attack' as const } : {}), source: 'llm', meta };
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

// ───────────── 불변식 ─────────────

export class Violation extends Error {
  override name = 'Violation';
}

const fail = (why: string): never => {
  throw new Violation(why);
};

/** 상태 하나만 보고 확인하는 불변식. */
export function checkState(engine: Engine, state: GameState, step?: Step): void {
  const scenario = engine.scenario;
  const beat = scenario.beats[state.beat];
  if (!beat) fail(`없는 비트에 있다: ${state.beat}`);
  for (const t of TRACKS) {
    const v = state.tracks[t];
    if (!Number.isInteger(v)) fail(`수치 ${t} 가 정수가 아니다: ${v}`);
    if (v < 0) fail(`수치 ${t} 가 음수다: ${v}`);
    if (v > TRACK_INFO[t].max) fail(`수치 ${t} 가 최댓값을 넘었다: ${v}`);
  }
  for (const a of ABILITIES) if (state.abilities[a] !== scenario.sheet.abilities[a]) fail(`능력치 ${a} 가 바뀌었다: ${state.abilities[a]}`);
  const tension = state.flags['긴장'];
  if (tension !== undefined && (typeof tension !== 'number' || tension < TENSION_MIN || tension > TENSION_MAX)) fail(`긴장값이 범위를 벗어났다: ${String(tension)}`);
  const hes = state.flags['머뭇'];
  if (hes !== undefined && (typeof hes !== 'number' || hes < 0)) fail(`머뭇이 음수다: ${String(hes)}`);
  if (state.playMs < 0 || !Number.isFinite(state.playMs)) fail(`플레이 시간이 이상하다: ${state.playMs}`);
  if (new Set(state.items).size !== state.items.length) fail(`소지품이 겹친다: ${state.items.join(',')}`);
  const known = new Set(scenario.sheet.items.map((i) => i.id));
  for (const i of state.items) if (!known.has(i)) fail(`없는 소지품: ${i}`);
  if (state.ending !== null) {
    if (!beat?.ending || beat.ending.id !== state.ending) fail(`끝(${state.ending})과 비트(${state.beat})가 어긋난다`);
    if (state.pendingLuck) fail('끝난 판에 행운 창이 남았다');
    if (state.pendingIntent) fail('끝난 판에 의도 카드가 남았다');
    if (state.free) fail('끝난 판에 자유 입력 진행이 남았다');
    if (state.pendingRisk) fail('끝난 판에 그만두기 확인이 남았다');
  } else {
    if (beat?.ending) fail(`결말 비트(${state.beat})에 있는데 끝나지 않았다`);
    if (!beat?.free && !beat?.choices?.length) fail(`입력을 받지 않는 비트(${state.beat})에 멈췄다`);
    if (beat?.free && (!state.free || state.free.beat !== state.beat)) fail(`자유 입력 진행이 비트와 어긋난다: ${state.free?.beat} ≠ ${state.beat}`);
    if (!beat?.free && state.free) fail(`자유 입력 비트가 아닌데(${state.beat}) 진행이 남았다`);
  }
  if (state.free) {
    if (state.free.rolls < 0 || state.free.talks < 0) fail('자유 입력 횟수가 음수다');
    const turns = beat?.free?.turns ?? 0;
    if (state.free.rolls > turns) fail(`판정 횟수(${state.free.rolls})가 장면 한도(${turns})를 넘었다`);
  }
  if (state.pendingLuck) {
    if (state.pendingLuck.beat !== state.beat) fail(`행운 창이 다른 비트(${state.pendingLuck.beat})의 판정을 묻는다`);
    if (state.pendingLuck.need < 1) fail(`행운이 필요 없는데 묻는다: need ${state.pendingLuck.need}`);
    if (state.pendingLuck.need > state.tracks.행운) fail(`가진 행운(${state.tracks.행운})보다 많이 묻는다: ${state.pendingLuck.need}`);
  }
  if (state.pendingIntent && !beat?.free) fail('자유 입력 비트가 아닌데 의도 카드가 떠 있다');
  for (let i = 1; i < state.log.length; i++) {
    const a = state.log[i - 1];
    const b = state.log[i];
    if (a && b && b.playMs < a.playMs) fail(`기록의 플레이 시간이 거꾸로 간다(${i})`);
  }
  for (const e of state.log) if ('beat' in e && !Object.hasOwn(scenario.beats, e.beat)) fail(`기록에 없는 비트가 남았다: ${String(e.beat)} (${e.kind})`);
  const ends = state.log.filter((e) => e.kind === 'end');
  if (state.ending === null ? ends.length !== 0 : ends.length !== 1) fail(`끝 기록이 ${ends.length}개다(끝: ${state.ending})`);
  if (step) {
    let fresh: Step['prompt'];
    try {
      fresh = engine.prompt(state);
    } catch (err) {
      return fail(`prompt 가 던졌다: ${(err as Error).message}`);
    }
    if (JSON.stringify(fresh) !== JSON.stringify(step.prompt)) fail('돌려준 prompt 가 상태와 어긋난다');
    const p = step.prompt;
    if ((p.type === 'end') !== (state.ending !== null)) fail(`끝 여부와 prompt(${p.type})가 어긋난다`);
    if (p.type === 'choices' && p.options.length === 0) fail(`고를 선택지가 없다(${state.beat})`);
    if (p.type === 'free' && !p.approaches.some((a) => !a.locked)) fail(`누를 수 있는 행동이 없다(${state.beat})`);
    if (p.type === 'free' && p.rollsLeft < 1) fail(`남은 판정이 없는 자유 입력에 멈췄다(${state.beat})`);
    for (const e of step.events) {
      if (e.type === 'roll' && (e.dice.some((d) => d < 1 || d > 6 || !Number.isInteger(d)) || e.dice.length !== 2)) fail(`주사위 눈이 이상하다: ${e.dice.join(',')}`);
      if (e.type === 'tracks') for (const c of e.changes) if (c.to < 0 || c.to > TRACK_INFO[c.key].max) fail(`수치 변화가 범위를 벗어났다: ${c.key} ${c.to}`);
    }
    const hudTracks = Object.fromEntries(step.hud.tracks.map((t) => [t.key, t.value]));
    for (const t of TRACKS) if (hudTracks[t] !== state.tracks[t]) fail(`HUD 수치 ${t} 가 상태와 어긋난다`);
  }
}

/** 행동 하나 전후를 비교하는 불변식. */
function checkTransition(prev: GameState, prevSnap: string, next: GameState, action: Action, step?: Step, scenario?: Scenario): void {
  if (JSON.stringify(prev) !== prevSnap) fail('act 가 받은 상태를 바꿨다');
  if (step) {
    // 새로 뜬 확인 창은 이번 단계에 보여야 하고, 보인 창은 답을 기다려야 한다(보이지 않는 창에 뒤의 "응"이 답이 되지 않게).
    const confirms = step.events.filter((e) => e.type === 'confirm');
    const fresh = (a: unknown, b: unknown) => b !== undefined && JSON.stringify(a) !== JSON.stringify(b);
    if (fresh(prev.pendingIntent, next.pendingIntent) && !confirms.some((e) => e.kind === 'intent')) fail('의도 카드가 떴는데 화면에 보내지 않았다');
    if (fresh(prev.pendingRisk, next.pendingRisk) && !confirms.some((e) => e.kind === 'quit')) fail('그만두기 확인이 떴는데 화면에 보내지 않았다');
    if (confirms.some((e) => e.kind === 'intent') && !next.pendingIntent) fail('의도 카드를 보냈는데 답을 기다리지 않는다');
    if (confirms.some((e) => e.kind === 'quit') && !next.pendingRisk) fail('그만두기 확인을 보냈는데 답을 기다리지 않는다');
  }
  if (scenario) {
    // 이야기에 들어가지 않은 입력(질문 모드로 안내·여우가 되돌림)만 있었던 턴은 말로 갈리는 갈래 플래그를 세우지 않는다.
    const inputs = next.log.slice(prev.log.length).filter((e) => e.kind === 'input');
    const story = next.log.slice(prev.log.length).some((e) => e.kind === 'check' || e.kind === 'choice' || (e.kind === 'input' && e.result !== 'ask' && e.result !== 'bounced' && e.result !== 'game'));
    if (inputs.length && !story) {
      const said = Object.values(scenario.beats).flatMap((b) => (b.free?.approaches ?? []).flatMap((a) => (a.said ? [a.said.flag, `이미_${a.said.flag}`] : [])));
      for (const f of said) if (next.flags[f] === true && prev.flags[f] !== true) fail(`이야기에 들어가지 않은 입력이 갈래 플래그 ${f} 를 세웠다`);
    }
  }
  if (scenario && next.ending !== null && prev.ending === null) {
    // 한 번의 실패로는 끝나지 않는다: 징조가 있는 작은 끝은 이번 턴 전에 징조가 나갔어야 한다(비교식이 아니라 멈출 수 없는 것만 예외).
    const fate = scenario.fates?.find((f) => f.to === next.beat || scenario.beats[f.to]?.ending?.id === next.ending);
    if (fate?.warn && prev.flags[`경고_${fate.id}`] !== true && holdBefore(fate.when)) fail(`징조가 처음 나온 턴에 작은 끝(${fate.id})으로 갔다`);
  }
  if (next.playMs < prev.playMs) fail('플레이 시간이 줄었다');
  if (next.log.length < prev.log.length) fail('기록이 줄었다');
  for (let i = 0; i < prev.log.length; i++) {
    const a = prev.log[i];
    const b = next.log[i];
    // 행운을 쓰면 묻던 판정(마지막 판정 기록)만 7, 대가 있는 성공으로 고친다(엔진 설계). 그 밖의 기록은 덧붙이기만 한다.
    const lastCheck = prev.log.findLastIndex((e) => e.kind === 'check');
    if (i === lastCheck && prev.pendingLuck && a?.kind === 'check' && b?.kind === 'check' && (action.type === 'luck' || action.type === 'free') && JSON.stringify(a) !== JSON.stringify(b)) {
      const same = JSON.stringify({ ...b.roll, total: a.roll.total, tier: a.roll.tier, luck: a.roll.luck }) === JSON.stringify(a.roll);
      if (!same || b.roll.total !== 7 || b.roll.tier !== 'mixed' || b.roll.luck !== prev.pendingLuck.need) fail('행운이 판정 기록을 잘못 고쳤다');
      continue;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`이전 기록 ${i} 가 바뀌었다(${a?.kind})`);
  }
  if (prev.ending !== null) {
    // 끝난 판에서 받는 행동은 끼어들기뿐이고, 이야기를 움직이지 않는다.
    if (action.type !== 'interject') fail(`끝난 판이 ${action.type} 를 받았다`);
    if (next.ending !== prev.ending) fail(`끝난 판의 결말이 바뀌었다: ${prev.ending} → ${next.ending}`);
    if (next.beat !== prev.beat) fail(`끝난 판의 비트가 바뀌었다: ${prev.beat} → ${next.beat}`);
    if (JSON.stringify(next.tracks) !== JSON.stringify(prev.tracks)) fail('끝난 판의 수치가 바뀌었다');
    if (next.rng !== prev.rng) fail('끝난 판에서 주사위를 굴렸다');
    if (JSON.stringify(next.items) !== JSON.stringify(prev.items)) fail('끝난 판의 소지품이 바뀌었다');
    if (JSON.stringify(next.flags) !== JSON.stringify(prev.flags)) fail('끝난 판의 플래그가 바뀌었다');
    if (scenario) {
      const a = summarize(scenario, prev);
      const b = summarize(scenario, next);
      if (JSON.stringify([a.decisions, a.checks, a.ending]) !== JSON.stringify([b.decisions, b.checks, b.ending])) fail('끝난 판의 결과 화면(결정·판정·결말)이 바뀌었다');
    }
  }
  if (next.seed !== prev.seed || next.session !== prev.session || next.startedAt !== prev.startedAt) fail('판의 정체(seed·session·startedAt)가 바뀌었다');
}

// ───────────── 한 판 ─────────────

export interface GameReport {
  seed: number;
  ops: FuzzOp[];
  acts: number;
  errors: number;
  ending: string | null;
  /** 실패 직후 행운을 묻는 엔진이었나(서버와 같은 설정이 기본, 일부 판은 끈다). */
  luck: boolean;
  /** 해석을 LLM 같은 것으로 바꾸는 비율(0 이면 규칙 GM 그대로). */
  chaos: number;
  violation?: { at: number; op: FuzzOp; why: string };
}

export interface FuzzEnv {
  scenario: Scenario;
  lore: Lore;
  corpus: string[];
  savesDir?: string;
}

const MAX_OPS = 160;
const DRIVE_LIMIT = 400;

function makeEngine(env: FuzzEnv, clock: () => number, luck: boolean, chaos?: { seed: number; rate: number }): Engine {
  const gm = new LocalGm(null, env.lore);
  return new Engine(env.scenario, chaos && chaos.rate > 0 ? new ChaosGm(gm, chaos.seed, chaos.rate) : gm, clock, luck);
}

/** 판 하나를 시드로 만들어 돌린다. ops 를 주면 그대로 다시 돌린다(재현). */
export async function playGame(env: FuzzEnv, seed: number, replay?: { ops: FuzzOp[]; luck: boolean; chaos: number }): Promise<GameReport> {
  const rng = new Rng(seed ^ 0x9e3779b9);
  let now = 1_000_000;
  const clock = () => now;
  const luck = replay ? replay.luck : rng.chance(0.85);
  // 판의 절반은 규칙 GM 그대로, 나머지는 해석을 가끔 LLM 같은 것으로 바꾼다.
  const chaos = replay ? replay.chaos : rng.chance(0.5) ? 0 : rng.pick([0.15, 0.4]);
  const engine = makeEngine(env, clock, luck, { seed, rate: chaos });
  const ops: FuzzOp[] = [];
  const report: GameReport = { seed, ops, acts: 0, errors: 0, ending: null, luck, chaos };
  let { state, step } = engine.newGame(seed, `f${seed}`);
  let index = -1;
  const guard = (op: FuzzOp, why: string) => {
    report.violation = { at: index, op, why };
  };
  try {
    checkState(engine, state, step);
  } catch (err) {
    guard({ op: 'reload' }, (err as Error).message);
    return report;
  }
  const limit = replay ? replay.ops.length : MAX_OPS;
  // 끝난 뒤에도 몇 번 더 두드린다(끝난 판 진행 검사).
  let afterEnd = replay ? Infinity : 2 + rng.int(4);
  for (index = 0; index < limit; index++) {
    let op: FuzzOp;
    if (replay) op = replay.ops[index] as FuzzOp;
    else {
      const r = rng.int(100);
      if (r < 6) op = { op: 'reload' };
      else if (r < 8 && env.savesDir) op = { op: 'disk', slot: rng.pick(['a', 'b', 'slot_1', 'auto-x']) };
      else if (r < 10) op = { op: 'drive' };
      else op = { op: 'act', action: randomAction(rng, env.scenario, state, step, env.corpus), advance: rng.pick([0, 1, 500, 5_000, 60_000, 10 * 60_000, -30_000]) };
    }
    ops.push(op);
    try {
      if (op.op === 'reload') {
        const saved = engine.noteSlot(state, 'save', 'fuzz');
        const loaded = assertState(env.scenario, JSON.parse(JSON.stringify(saved)));
        if (JSON.stringify(loaded) !== JSON.stringify(saved)) fail('저장 → 불러오기 왕복에서 상태가 달라졌다');
        state = engine.noteSlot(loaded, 'load', 'fuzz');
        step = engine.resume(state);
        checkState(engine, state, step);
        const shown = step.events.filter((e) => e.type === 'confirm');
        if (!state.ending && state.pendingIntent && !shown.some((e) => e.kind === 'intent')) fail('불러온 판에 의도 카드가 남았는데 다시 띄우지 않았다');
        if (!state.ending && state.pendingRisk && !shown.some((e) => e.kind === 'quit')) fail('불러온 판에 그만두기 확인이 남았는데 다시 띄우지 않았다');
      } else if (op.op === 'disk') {
        const dir = env.savesDir as string;
        await writeSave(dir, op.slot, env.scenario, state, now);
        const back = await readSave(dir, op.slot, env.scenario);
        if (JSON.stringify(back) !== JSON.stringify(state)) fail('저장 파일 왕복에서 상태가 달라졌다');
        summarize(env.scenario, back);
      } else if (op.op === 'drive') {
        await drive(env, state, seed + index);
      } else {
        now += op.advance;
        const snap = JSON.stringify(state);
        const prev = state;
        let result: { state: GameState; step: Step } | null = null;
        try {
          result = await engine.act(state, op.action);
        } catch (err) {
          if (!(err instanceof GameError)) throw new Violation(`GameError 가 아닌 오류: ${(err as Error).name}: ${(err as Error).message}`);
          if (JSON.stringify(prev) !== snap) fail('실패한 act 가 받은 상태를 바꿨다');
          if (prev.ending === null && op.action.type !== 'luck' && op.action.type !== 'confirm' && op.action.type !== 'choose' && op.action.type !== 'approach') {
            // 자유 입력·질문·끼어들기는 빈 입력이 아니면 받아야 한다(화면은 늘 입력칸을 연다).
            const t = 'text' in op.action ? op.action.text.trim() : '';
            if (t && !(op.action.type === 'free' && step.prompt.type === 'choices')) fail(`입력이 거절됐다: ${(err as Error).message}`);
          }
          report.errors++;
        }
        if (result) {
          checkTransition(prev, snap, result.state, op.action, result.step, env.scenario);
          state = result.state;
          step = result.step;
          checkState(engine, state, step);
          report.acts++;
        }
      }
    } catch (err) {
      guard(op, err instanceof Violation ? err.message : `예상 못 한 오류: ${(err as Error).stack ?? String(err)}`);
      return report;
    }
    if (state.ending !== null && !replay && --afterEnd <= 0) {
      break;
    }
  }
  report.ending = state.ending;
  // 같은 시드·같은 행동은 같은 판을 낸다.
  if (!replay && !report.violation) {
    const again = await playGame(env, seed, { ops: [...ops], luck, chaos });
    if (again.violation) report.violation = { at: again.violation.at, op: again.violation.op, why: `재현 중: ${again.violation.why}` };
    else if (again.ending !== report.ending || again.acts !== report.acts) report.violation = { at: -1, op: { op: 'reload' }, why: '같은 시드·행동을 다시 돌렸는데 결과가 다르다' };
  }
  return report;
}

/** 지금 상태에서 앞으로만 가는 행동으로 결말까지 민다. 어디서든 결말에 닿아야 한다. */
async function drive(env: FuzzEnv, from: GameState, seed: number): Promise<void> {
  const rng = new Rng(seed ^ 0x51ed270b);
  let now = from.lastActiveAt;
  const engine = makeEngine(env, () => now, rng.chance(0.5));
  let state = from;
  // 행운 창이나 확인 창이 떠 있으면 먼저 답한다(정해진 prompt 로).
  let step: Step = { events: [], prompt: engine.prompt(state), hud: engine.hud(state) };
  for (let i = 0; i < DRIVE_LIMIT; i++) {
    if (state.ending === null && (state.pendingIntent || state.pendingRisk)) {
      const r = await engine.act(state, { type: 'confirm', ok: false }).catch((e: unknown) => {
        if (e instanceof GameError) return null;
        throw e;
      });
      if (r) ({ state, step } = r);
      if (state.pendingIntent || state.pendingRisk) fail('확인 창을 닫을 수 없다');
    }
    const action = forwardAction(rng, step);
    if (!action) {
      if (state.ending === null) fail(`앞으로 갈 행동이 없는데 끝나지 않았다(${state.beat})`);
      return;
    }
    now += 1_000;
    const prev = state;
    const snap = JSON.stringify(prev);
    try {
      ({ state, step } = await engine.act(state, action));
    } catch (err) {
      if (err instanceof GameError) fail(`앞으로 가는 행동이 거절됐다(${prev.beat}, ${JSON.stringify(action)}): ${err.message}`);
      throw new Violation(`GameError 가 아닌 오류(밀기): ${(err as Error).message}`);
    }
    checkTransition(prev, snap, state, action, step, env.scenario);
    checkState(engine, state, step);
  }
  fail(`앞으로만 ${DRIVE_LIMIT}번 갔는데 끝나지 않았다(${state.beat}) — 멈춤`);
}

// ───────────── 서버 퍼즈 ─────────────

/** 서버를 --no-llm 으로 띄워 무작위·잘못된 HTTP 요청을 보낸다. 500, 끝나지 않는 응답, 세션 어긋남을 찾는다. */
export async function fuzzServer(env: FuzzEnv, games: number, firstSeed: number): Promise<string[]> {
  const { startServer } = await import('../src/server/main.ts');
  const dir = await mkdtemp(join(tmpdir(), 'wh-fuzz-srv-'));
  const problems: string[] = [];
  const { server, sessions, engine } = await startServer({
    port: 0,
    llmUrl: null,
    modelKey: null,
    scenarioPath: join(APP, 'content', 'ep01_desert.yaml'),
    lorePath: join(APP, 'content', 'lore_wolheun.yaml'),
    savesDir: join(dir, 'saves'),
    atlasFile: join(dir, 'atlas.json'),
    logsDir: join(dir, 'logs'),
    llmTimeoutMs: 1000,
    feedbackFile: join(dir, 'feedback.jsonl'),
  });
  const base = `http://127.0.0.1:${server.port}`;
  const origin = { origin: base, 'content-type': 'application/json' };
  const post = (path: string, body: unknown, raw?: string) => fetch(`${base}${path}`, { method: 'POST', headers: origin, body: raw ?? JSON.stringify(body) });
  try {
    for (let g = 0; g < games; g++) {
      const seed = firstSeed + g;
      const rng = new Rng(seed ^ 0x2545f491);
      const note = (why: string, detail = '') => problems.push(`서버 판 ${seed}: ${why}${detail ? ` ⟨${detail}⟩` : ''}`);
      const created = await post('/api/new', { seed });
      if (created.status !== 200) {
        note(`/api/new ${created.status}`);
        continue;
      }
      let { session, step } = (await created.json()) as { session: string; step: Step };
      for (let i = 0; i < 80; i++) {
        const s = sessions.get(session);
        if (!s) {
          note('세션이 사라졌다');
          break;
        }
        const r = rng.int(100);
        let res: Response;
        if (r < 70) {
          // 가끔 지도 기록을 쓰다 만 파일로 바꿔 둔다. 행동 결과는 그래도 화면에 가야 한다.
          if (rng.chance(0.05)) await Bun.write(join(dir, 'atlas.json'), '{"visited": ["b0');
          const action = randomAction(rng, env.scenario, s.state, step, env.corpus);
          const logBefore = s.state.log.length;
          res = await post('/api/act', { session, action });
          if (res.status === 200) {
            const lines = (await res.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { done?: { prompt: Step['prompt']; hud: Step['hud'] }; error?: string });
            const last = lines.at(-1);
            if (!last || (!last.done && !last.error)) note(`/api/act 응답이 done/error 로 끝나지 않았다`);
            if (last?.error?.startsWith('서버 오류')) note('/api/act 서버 오류', JSON.stringify(action).slice(0, 200));
            if (last?.done) step = { events: [], prompt: last.done.prompt, hud: last.done.hud };
            const after = sessions.get(session);
            if (last?.error && after && after.state.log.length !== logBefore) note(`화면은 오류를 받았는데 세션은 나아갔다: ${last.error}`);
            if (after?.busy) note('행동이 끝났는데 세션이 바쁨으로 남았다');
            if (after && last?.done && JSON.stringify(engine.prompt(after.state)) !== JSON.stringify(last.done.prompt)) note('응답 prompt 와 세션 상태가 어긋난다');
            if (after) {
              try {
                checkState(engine, after.state);
              } catch (err) {
                note(`세션 상태 불변식: ${(err as Error).message}`);
              }
            }
          } else if (res.status !== 400) note(`/api/act ${res.status}`);
          else await res.text();
        } else if (r < 78) {
          res = await post('/api/save', { session, slot: rng.pick(['s1', 'auto_fork', 'BAD SLOT', '../x', '', 'a'.repeat(40)]), ...(rng.chance(0.5) ? { view: rng.pick([{ a: 1 }, null, 'x', [1], { big: 'x'.repeat(10) }]) } : {}) });
          if (res.status >= 500) note(`/api/save ${res.status}`);
          await res.text();
        } else if (r < 86) {
          res = await post('/api/load', { slot: rng.pick(['s1', 'auto_fork', 'nope', '../etc', 7]) });
          if (res.status >= 500) note(`/api/load ${res.status}`);
          if (res.status === 200) {
            const body = (await res.json()) as { session: string; step: Step };
            session = body.session;
            step = body.step;
          } else await res.text();
        } else if (r < 90) {
          res = await fetch(`${base}/api/result?session=${encodeURIComponent(rng.chance(0.8) ? session : 'nope')}`);
          if (res.status >= 500) note(`/api/result ${res.status}`);
          const body = (await res.text()).trim();
          if (res.status === 200) {
            // '마지막 갈림길에서 다시'는 이 판(시드·시작 시각이 같은 판)의 갈림길 저장일 때만 열린다.
            const fork = (JSON.parse(body) as { fork: boolean }).fork;
            const file = Bun.file(join(dir, 'saves', 'auto_fork.json'));
            const saved = (await file.exists()) ? ((await file.json()) as { state: GameState }).state : null;
            const cur = sessions.get(session)?.state;
            const mine = saved !== null && cur !== undefined && saved.seed === cur.seed && saved.startedAt === cur.startedAt;
            if (fork !== mine) note(`갈림길 다시 하기 표시(${fork})가 저장의 판과 어긋난다`);
          }
        } else {
          // 잘못된 요청 묶음
          const bad = rng.pick<[string, string | undefined, unknown]>([
            ['/api/act', 'not json', null],
            ['/api/act', '[]', null],
            ['/api/act', 'null', null],
            ['/api/act', undefined, { session }],
            ['/api/act', undefined, { session, action: { type: 'nope' } }],
            ['/api/act', undefined, { session, action: { type: 'choose', id: 5 } }],
            ['/api/act', undefined, { session, action: { type: 'interject', text: 'x', shown: [null, 5, { speaker: 1 }], pending: [null, { i: 'x' }] } }],
            ['/api/act', undefined, { session, action: { type: 'interject', text: 'x', shown: 'nope', pending: { i: 1 } } }],
            ['/api/act', undefined, { session: 5, action: { type: 'luck' } }],
            ['/api/act', undefined, { session: 'nope', action: { type: 'luck' } }],
            ['/api/new', undefined, { seed: { x: 1 } }],
            ['/api/new', undefined, { seed: Number.MAX_SAFE_INTEGER }],
            ['/api/new', undefined, { seed: -1 }],
            ['/api/save', undefined, { session, slot: 5 }],
            ['/api/load', undefined, {}],
            ['/api/atlas/hint', undefined, { key: rng.pick(['n0', 'x', 5]) }],
          ]);
          res = await post(bad[0], bad[2], bad[1]);
          if (res.status >= 500) note(`${bad[0]} 잘못된 요청에 ${res.status}`, bad[1] ?? JSON.stringify(bad[2]).slice(0, 120));
          if (bad[0] === '/api/new' && res.status === 200) {
            const body = (await res.json()) as { session: string; step: Step };
            session = body.session;
            step = body.step;
          } else if (res.status === 200 && bad[0] === '/api/act') {
            const t = await res.text();
            if (t.includes('서버 오류')) note('잘못된 행동에 서버 오류', JSON.stringify(bad[2]).slice(0, 160));
          } else await res.text();
        }
      }
      if (problems.length > 500) break;
    }
  } finally {
    server.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
  return problems;
}

// ───────────── 실행 ─────────────

export async function loadEnv(): Promise<FuzzEnv> {
  const lore = await loadLore(join(APP, 'content', 'lore_wolheun.yaml'));
  const scenario = withNotes(await loadScenario(join(APP, 'content', 'ep01_desert.yaml')), lore);
  return { scenario, lore, corpus: [...(await loadCorpus()), ...scenarioWords(scenario, lore)] };
}

/** 여러 판을 돌려 깨진 판들을 돌려준다. */
export async function fuzz(env: FuzzEnv, games: number, firstSeed: number, onProgress?: (done: number) => void): Promise<{ reports: GameReport[]; endings: Record<string, number>; acts: number; errors: number }> {
  const bad: GameReport[] = [];
  const endings: Record<string, number> = {};
  let acts = 0;
  let errors = 0;
  for (let g = 0; g < games; g++) {
    const r = await playGame(env, firstSeed + g);
    acts += r.acts;
    errors += r.errors;
    endings[r.ending ?? '(끝나지 않음)'] = (endings[r.ending ?? '(끝나지 않음)'] ?? 0) + 1;
    if (r.violation) bad.push(r);
    if (onProgress && (g + 1) % 1000 === 0) onProgress(g + 1);
  }
  return { reports: bad, endings, acts, errors };
}

/** 같은 이유는 하나로 묶는다(숫자·비트 이름을 지운 이유로). */
export function bucket(why: string): string {
  return why.replace(/\d+/g, '#').replace(/\(([a-z0-9_]+)\)/g, '(…)').split('\n')[0] ?? why;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { games: { type: 'string', default: '20000' }, seed: { type: 'string', default: '1' }, server: { type: 'string', default: '0' }, replay: { type: 'string' }, disk: { type: 'boolean', default: true } },
  });
  const env = await loadEnv();
  const dir = await mkdtemp(join(tmpdir(), 'wh-fuzz-'));
  env.savesDir = dir;
  try {
    if (values.replay) {
      const seed = Number(values.replay);
      const r = await playGame(env, seed);
      for (const [i, op] of r.ops.entries()) console.log(i, JSON.stringify(op));
      console.log(r.violation ? `깨짐 #${r.violation.at}: ${r.violation.why}` : `이상 없음 (끝: ${r.ending})`);
      process.exit(r.violation ? 1 : 0);
    }
    const games = Number(values.games);
    const first = Number(values.seed);
    const started = performance.now();
    const { reports, endings, acts, errors } = await fuzz(env, games, first, (n) => console.error(`  ${n}판…`));
    const buckets = new Map<string, GameReport[]>();
    for (const r of reports) {
      const key = bucket(r.violation?.why ?? '');
      buckets.set(key, [...(buckets.get(key) ?? []), r]);
    }
    console.log(`판 ${games} (시드 ${first}~${first + games - 1}), 행동 ${acts}, 거절된 행동 ${errors}, ${((performance.now() - started) / 1000).toFixed(1)}초`);
    console.log(`결말: ${Object.entries(endings).sort().map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`불변식 깨진 판: ${reports.length}`);
    for (const [key, rs] of buckets) {
      const r = rs[0] as GameReport;
      console.log(`- [${rs.length}판] ${key}\n    예: 시드 ${r.seed} 단계 ${r.violation?.at} ${JSON.stringify(r.violation?.op).slice(0, 300)}`);
    }
    let serverProblems: string[] = [];
    if (Number(values.server) > 0) {
      serverProblems = await fuzzServer(env, Number(values.server), first);
      console.log(`서버 퍼즈 ${values.server}판: 문제 ${serverProblems.length}`);
      const kinds = new Map<string, string[]>();
      for (const p of serverProblems) {
        const key = bucket(p.replace(/^서버 판 \d+: /, '').replace(/ ⟨[\s\S]*⟩$/, ''));
        kinds.set(key, [...(kinds.get(key) ?? []), p]);
      }
      for (const [key, ps] of kinds) console.log(`- [${ps.length}건] ${key}\n    예: ${ps[0]?.slice(0, 300)}`);
    }
    process.exit(reports.length || serverProblems.length ? 1 : 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export { SaveError };
