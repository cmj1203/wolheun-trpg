#!/usr/bin/env bun
/**
 * 대본 기계 점검. app/content/ep01_desert.yaml 과 lore_wolheun.yaml 을 읽어
 * 모든 비트·갈래·플래그·대가 조합을 엔진 규칙대로 탐색하고, 결과를 표로 적는다.
 *
 *   bun scripts/script_audit.ts                 # docs/research/script_audit.md 의 자동 구역을 새로 쓴다
 *   bun scripts/script_audit.ts --stdout        # 파일을 쓰지 않고 표만 출력
 *   bun scripts/script_audit.ts --json          # 찾은 것을 JSON 으로 출력
 *
 * 대본 글은 바꾸지 않는다. 파일에서 `<!-- audit:begin -->` ~ `<!-- audit:end -->` 사이만 다시 쓰고,
 * 그 밖(사람이 적은 판단)은 그대로 둔다.
 *
 * 탐색 모형(엔진 src/engine/engine.ts 를 따른다. 다른 점은 맨 아래 '모형의 한계'에 적는다):
 * - 비트에 들어서면: 작은 끝 검사 → 상대_곁 → 들어설 때 효과·time → 장면 검사(없음·altered 각각·interrupt 각각) → 줄(if) → 수첩·되받는 줄 → 다음 비트.
 * - 자유 입력 비트의 한 수: 접근법(단추 / 말로 입력하며 said 낱말을 씀 / 말로 입력하며 안 씀) × 성공·대가 있는 성공·실패 × 뽑힐 수 있는 대가 각각,
 *   즉흥 행동(보통·큰 행동) × 세 결과 × 대가, 칼 앞 맨손 강행 실패(위험_실패), 정체 밝히기, 말만 하기(말함), 머뭇거리기(세계의 수 ①~④), 그만두기.
 * - 같은 상태(비트·수치·플래그·소지품·이 비트에서 쓴 대가·세계의 수)는 하나로 합친다.
 */
import { join } from 'node:path';
import { evalCond as evalCondRaw, holdBefore, condNames, parseCond, type CondContext } from '../src/engine/conditions.ts';
import { noteFlag } from '../src/engine/engine.ts';
import { priceCandidates } from '../src/engine/prices.ts';
import { edgesOf as edgesOfBeat, loadScenario, typedFallbackLines } from '../src/engine/scenario.ts';
import { TIERS, TRACKS, TRACK_INFO, type ApproachSpec, type BeatSpec, type Effects, type FlagValue, type FreeSpec, type Line, type Outcome, type PriceSpec, type Scenario, type Tier, type Track } from '../src/engine/types.ts';
import { loadLore, withNotes, type Lore } from '../src/gm/lore.ts';

const APP = join(import.meta.dir, '..');
const ROOT = join(APP, '..');
export const SCENARIO_PATH = join(APP, 'content', 'ep01_desert.yaml');
export const LORE_PATH = join(APP, 'content', 'lore_wolheun.yaml');
export const REPORT_PATH = join(ROOT, 'docs', 'research', 'script_audit.md');

/** 조건식은 한 번만 해석해 둔다. 값 매기기는 conditions.ts 의 test 와 같은 뜻이다(tests/script_audit.test.ts 가 맞춰 본다). */
type Atom = { kind: 'flag' | 'item'; name: string; negate: boolean } | { kind: 'cmp'; name: string; op: string; value: number; flag: boolean };
const parsed = new Map<string, Atom[][]>();
const flagNum = (v: FlagValue | undefined) => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0);
export function evalCond(src: string, ctx: CondContext): boolean {
  let groups = parsed.get(src);
  if (!groups) {
    groups = parseCond(src) as unknown as Atom[][];
    parsed.set(src, groups);
  }
  for (const all of groups) {
    let ok = true;
    for (const atom of all) {
      let v: boolean;
      if (atom.kind === 'flag') {
        const f = ctx.flags[atom.name];
        const on = f !== undefined && f !== false && f !== 0 && f !== '';
        v = atom.negate ? !on : on;
      } else if (atom.kind === 'item') {
        const has = ctx.items.includes(atom.name);
        v = atom.negate ? !has : has;
      } else {
        const left = atom.flag ? flagNum(ctx.flags[atom.name]) : ((ctx.tracks as Record<string, number>)[atom.name] ?? (ctx.abilities as Record<string, number>)[atom.name] ?? flagNum(ctx.flags[atom.name]));
        const r = atom.value;
        v = atom.op === '>=' ? left >= r : atom.op === '<=' ? left <= r : atom.op === '==' ? left === r : atom.op === '!=' ? left !== r : atom.op === '>' ? left > r : left < r;
      }
      if (!v) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}
export { evalCondRaw };

const CLOCK_FALLBACK = '해가 한 뼘 더 기울었다. 귀찌가 미지근해진다.';
const EARRING_EXPLAIN = '귀찌가 뜨겁게 달아올랐다. 변장이 버틸 시간이 줄고 있다.';
const MAX_HOPS = 30;

// ───────────────────────── 상태와 줄 ─────────────────────────

interface St {
  beat: string;
  tracks: Record<Track, number>;
  flags: Record<string, FlagValue>;
  items: string[];
  /** 이 비트에서 이미 나온 대가 id */
  used: string[];
  /** 이 비트에서 일어난 세계의 수(threat·press·offer·clock) */
  moves: string[];
  ending?: string;
}

/** 화면에 나온 줄 하나. src 는 대본 안의 자리. */
export interface Shown {
  src: string;
  beat: string;
  speaker: string;
  text: string;
}

interface World {
  st: St;
  out: Shown[];
  label: string[];
}

interface Edge {
  from: number;
  to: number;
  label: string;
  lines: Shown[];
}

export interface Finding {
  kind: string;
  where: string;
  line?: number;
  text: string;
  detail: string;
  path?: string;
}

/** 같은 자리·같은 비트의 줄은 한 객체를 함께 쓴다(수가 수백만이라 메모리를 아낀다). */
const interned = new Map<string, Shown>();
function shownOf(src: string, beat: string, speaker: string, text: string): Shown {
  const k = `${src}@${beat}`;
  let v = interned.get(k);
  if (!v) {
    v = { src, beat, speaker, text };
    interned.set(k, v);
  }
  return v;
}

const clone = (w: World): World => ({
  st: { ...w.st, tracks: { ...w.st.tracks }, flags: { ...w.st.flags }, items: [...w.st.items], used: [...w.st.used], moves: [...w.st.moves] },
  out: [...w.out],
  label: [...w.label],
});

const ctxOf = (st: St, s: Scenario): CondContext => ({ tracks: st.tracks, abilities: s.sheet.abilities, flags: st.flags, items: st.items });

/** 상태를 합칠 때 보는 것: 어떤 조건이라도 읽는 수치·플래그만. 읽히지 않는 것은 갈래를 바꾸지 못한다. */
export interface KeySpec {
  /** 비트마다 그 뒤에서 읽힐 수 있는 이름(플래그·수치) */
  live: Map<string, Set<string>>;
  caps: Partial<Record<Track, number>>;
}

function keyOf(st: St, spec: KeySpec): string {
  // 결말은 더 갈 곳이 없다. 결말 id 하나로 합친다.
  if (st.ending) return `end|${st.beat}`;
  const live = spec.live.get(st.beat);
  const keep = (n: string) => !live || live.has(n) || /^(경고_|대가_)/u.test(n);
  const flags = Object.keys(st.flags)
    .filter(keep)
    .sort()
    .map((k) => `${k}=${String(st.flags[k])}`)
    .join(',');
  const tracks = TRACKS.filter(keep).map((t) => `${t}${Math.min(st.tracks[t], spec.caps[t] ?? 99)}`);
  return [st.beat, st.ending ?? '', tracks.join('.'), flags, [...st.items].sort().join(','), [...st.used].sort().join(','), st.moves.join(',')].join('|');
}

/** 비트마다 그 비트와 그 뒤에서 조건으로 읽힐 수 있는 이름. 이미 지나간 갈래만 가르던 플래그는 상태를 합칠 때 보지 않는다. */
function liveness(s: Scenario, extraGlobal: string[]): KeySpec {
  const names = (c: string | undefined): string[] => {
    if (!c) return [];
    const n = condNames(c);
    return [...n.flags, ...n.numbers];
  };
  const linesN = (ls: readonly Line[] | undefined) => (ls ?? []).flatMap((l) => names(l.if));
  const nextN = (n: BeatSpec['next']) => (Array.isArray(n) ? n.flatMap((r) => names(r.if)) : []);
  const global = new Set<string>(extraGlobal);
  for (const f of s.fates ?? []) for (const x of [...names(f.when), ...names(f.warn?.when), ...linesN(f.warn?.lines)]) global.add(x);
  for (const c of Object.values(s.cast)) for (const x of names(c.sprite_alt?.if)) global.add(x);
  for (const c of Object.values(s.cgs)) for (const x of names(c.alt?.if)) global.add(x);
  const local = new Map<string, Set<string>>();
  for (const [id, b] of Object.entries(s.beats)) {
    const set = new Set<string>([...linesN(b.lines), ...nextN(b.next)]);
    for (const k of ['altered', 'interrupt'] as const) for (const t of b.twist?.[k] ?? []) for (const x of linesN(t.lines)) set.add(x);
    const f = b.free;
    if (f) {
      for (const p of f.prices ?? []) for (const x of names(p.if)) set.add(x);
      for (const x of [...linesN(f.nudge), ...linesN(f.offer?.lines), ...linesN(f.press), ...nextN(f.next), ...names(f.until)]) set.add(x);
      const outs: Outcome[] = [];
      for (const t of TIERS) {
        outs.push(f.improv[t]);
        if (f.improv_bold) outs.push(f.improv_bold[t]);
        for (const x of linesN(f.neutral?.[t])) set.add(x);
      }
      for (const a of f.approaches) {
        // 보정(mods)은 주사위 합만 바꾸지만, 보정이 붙는지 따지려면 상태를 갈라 둬야 한다.
        for (const m of a.mods ?? []) for (const x of names(m.if)) set.add(x);
        for (const t of TIERS) outs.push(a.outcomes[t]);
      }
      for (const o of outs) for (const x of [...linesN(o.lines), ...nextN(o.next)]) set.add(x);
      set.add('머뭇');
    }
    for (const c of s.callbacks ?? [])
      if (c.after.includes(id)) {
        set.add(c.flag);
        set.add(`되받음_${c.flag}`);
        if (c.flag === '아무말') set.add('말함');
      }
    local.set(id, set);
  }
  const succ = (id: string): string[] => {
    const b = s.beats[id];
    if (!b) return [];
    const out = [...edgesOfBeat(b), ...(s.fates ?? []).map((f) => f.to)];
    if (b.free && s.beats['e_quit']) out.push('e_quit');
    return out;
  };
  const live = new Map<string, Set<string>>();
  let changed = true;
  for (const id of Object.keys(s.beats)) live.set(id, new Set([...(local.get(id) ?? []), ...global]));
  while (changed) {
    changed = false;
    for (const id of Object.keys(s.beats)) {
      const mine = live.get(id) as Set<string>;
      for (const n of succ(id))
        for (const x of live.get(n) ?? []) {
          if (!mine.has(x)) {
            mine.add(x);
            changed = true;
          }
        }
    }
  }
  return { live, caps: {} };
}

// ───────────────────────── 대본 위치 ─────────────────────────

class Locator {
  private readonly rows: string[];
  private readonly beatRow = new Map<string, number>();

  constructor(yaml: string) {
    this.rows = yaml.split('\n');
    let inBeats = false;
    this.rows.forEach((row, i) => {
      if (/^beats:/.test(row)) inBeats = true;
      const m = /^ {2}([A-Za-z0-9_]+):\s*$/.exec(row);
      if (inBeats && m?.[1]) this.beatRow.set(m[1], i);
    });
  }

  /** 글이 처음 나오는 YAML 줄 번호(1부터). 비트가 주어지면 그 비트 안에서 먼저 찾는다. */
  find(text: string, beat?: string): number | undefined {
    const needle = text.slice(0, 40);
    const start = beat ? this.beatRow.get(beat) : undefined;
    if (start !== undefined) {
      for (let i = start; i < this.rows.length; i++) {
        if (i > start && /^ {2}[A-Za-z0-9_]+:\s*$/.test(this.rows[i] ?? '')) break;
        if ((this.rows[i] ?? '').includes(needle)) return i + 1;
      }
    }
    const i = this.rows.findIndex((r) => r.includes(needle));
    return i >= 0 ? i + 1 : undefined;
  }
}

// ───────────────────────── 탐색기 ─────────────────────────

interface ModUse {
  where: string;
  cond: string;
  label: string;
  on: number;
  off: number;
}

export class Explorer {
  readonly nodes: St[] = [];
  readonly edges: Edge[] = [];
  readonly out = new Map<number, number[]>();
  private readonly index = new Map<string, number>();
  /** 줄 자리 → 나온 횟수 / if 로 숨은 횟수 */
  readonly shown = new Map<string, number>();
  readonly hidden = new Map<string, number>();
  readonly lineOf = new Map<string, { beat: string; speaker: string; text: string; if?: string }>();
  readonly visited = new Set<string>();
  readonly routesTaken = new Set<string>();
  readonly pricesDrawn = new Set<string>();
  readonly twistsPlayed = new Set<string>();
  readonly approachesUsed = new Set<string>();
  readonly callbacksFired = new Set<string>();
  readonly flagsSeen = new Set<string>();
  readonly mods: ModUse[] = [];
  readonly deadEnds: Finding[] = [];
  readonly stateBreaks: Finding[] = [];
  readonly offStage: Finding[] = [];
  readonly fatesReached = new Set<string>();
  private readonly spec: KeySpec;
  private readonly breakKeys = new Set<string>();

  constructor(
    readonly s: Scenario,
    readonly lore: Lore,
    readonly loc: Locator,
    yaml: string,
  ) {
    void yaml;
    this.spec = liveness(s, ['말함', '위험_강행', '위험_실패', '신분_노출']);
    // 줄어드는 효과가 없는 수치는 읽는 문턱 중 가장 큰 값에서 자른다.
    for (const t of TRACKS) {
      if (new RegExp(`${t}:\\s*-\\d`, 'u').test(yaml)) continue;
      const limits = [...yaml.matchAll(new RegExp(`${t}\\s*(>=|>)\\s*(\\d+)`, 'gu'))].map((m) => Number(m[2]) + (m[1] === '>' ? 1 : 0));
      if (limits.length && !new RegExp(`${t}\\s*(<=|<|==|!=)`, 'u').test(yaml)) this.spec.caps[t] = Math.max(...limits);
    }
  }

  /** 개발용: 이만큼 펼친 뒤 멈춘다(결과는 일부만). */
  limit = Infinity;

  run(): void {
    const sheet = this.s.sheet;
    const st: St = { beat: '', tracks: { ...sheet.tracks }, flags: {}, items: sheet.items.map((i) => i.id), used: [], moves: [] };
    const starts = this.enter({ st, out: [], label: ['시작'] }, this.s.start, 0);
    const root = this.addNode({ ...st, beat: '(시작)' });
    for (const w of starts) this.link(root, w);
    for (let i = 0; i < this.nodes.length && i < this.limit; i++) this.expand(i);
  }

  private addNode(st: St): number {
    const key = keyOf(st, this.spec);
    const have = this.index.get(key);
    if (have !== undefined) return have;
    const id = this.nodes.length;
    this.nodes.push(st);
    this.index.set(key, id);
    for (const [k, v] of Object.entries(st.flags)) if (v !== false && v !== 0 && v !== '') this.flagsSeen.add(k);
    return id;
  }

  private link(from: number, w: World): void {
    for (const [k, v] of Object.entries(w.st.flags)) if (v !== false && v !== 0 && v !== '') this.flagsSeen.add(k);
    const to = this.addNode(w.st);
    this.edges.push({ from, to, label: w.label.join(' → '), lines: w.out });
    const list = this.out.get(from) ?? [];
    list.push(this.edges.length - 1);
    this.out.set(from, list);
  }

  // ── 줄 ──

  private say(w: World, line: Line, src: string): void {
    const beat = w.st.beat;
    if (!this.lineOf.has(src)) this.lineOf.set(src, { beat, speaker: line.speaker, text: line.text, ...(line.if ? { if: line.if } : {}) });
    if (line.if !== undefined && !evalCond(line.if, ctxOf(w.st, this.s))) {
      this.hidden.set(src, (this.hidden.get(src) ?? 0) + 1);
      return;
    }
    this.shown.set(src, (this.shown.get(src) ?? 0) + 1);
    w.out.push(shownOf(src, beat, line.speaker, line.text));
    this.checkState(w, line, src);
    this.checkStage(w, line, src);
  }

  private once(k: string): boolean {
    if (this.breakKeys.has(k)) return false;
    this.breakKeys.add(k);
    return true;
  }

  /** 지금 상태와 어긋나는 글(facts 의 state_guard, 없는 소지품, 끊긴 가방끈). */
  private checkState(w: World, line: Line, src: string): void {
    const ctx = ctxOf(w.st, this.s);
    const plain = line.text.replace(/\s+/g, '');
    for (const fact of this.s.facts) {
      if (!evalCond(fact.if, ctx)) continue;
      const hit = fact.state_guard.find((g) => plain.includes(g.replace(/\s+/g, '')));
      if (hit && this.once(`${src}|${fact.if}`)) this.stateBreaks.push({ kind: '상태', where: src, text: line.text, detail: `"${fact.if}" 인데 "${hit}" (사실: ${fact.text})` });
    }
    for (const rule of STATE_RULES) {
      if (!evalCond(rule.when, ctx)) continue;
      if (rule.words.some((x) => line.text.includes(x)) && !(rule.unless ?? []).some((x) => line.text.includes(x)) && this.once(`${src}|${rule.when}`))
        this.stateBreaks.push({ kind: '상태', where: src, text: line.text, detail: `${rule.why} ("${rule.when}")` });
    }
  }

  /** 대사(speech) 화자가 그 비트 무대에 없다. */
  private checkStage(w: World, line: Line, src: string): void {
    const cast = this.s.cast[line.speaker];
    if (!cast || cast.style !== 'speech') return;
    const beat = this.s.beats[w.st.beat];
    const onStage = Object.values(beat?.cast ?? {});
    if (!onStage.includes(line.speaker) && this.once(`stage|${src}`)) this.offStage.push({ kind: '무대', where: src, text: line.text, detail: `${w.st.beat} 의 cast 에 ${line.speaker} 가 없다` });
  }

  // ── 효과 ──

  private apply(w: World, eff: Effects | undefined, quiet = false): void {
    if (!eff) return;
    let earring = false;
    for (const key of TRACKS) {
      const d = eff.tracks?.[key];
      if (!d) continue;
      const from = w.st.tracks[key];
      const to = Math.max(0, Math.min(TRACK_INFO[key].max, from + d));
      if (to !== from) {
        w.st.tracks[key] = to;
        if (key === '귀찌') earring = true;
      }
    }
    Object.assign(w.st.flags, eff.flags ?? {});
    if (earring && w.st.flags['설명_귀찌'] !== true) {
      w.st.flags['설명_귀찌'] = true;
      this.say(w, { speaker: '나레이션', text: EARRING_EXPLAIN }, 'engine:설명_귀찌');
    }
    const lost = (eff.lose ?? []).filter((id) => w.st.items.includes(id));
    const gained = (eff.gain ?? []).filter((id) => !w.st.items.includes(id));
    w.st.items = w.st.items.filter((id) => !lost.includes(id)).concat(gained);
    if (!quiet) this.warn(w);
  }

  private reactionAhead(st: St, from: string): boolean {
    let id = from;
    for (let hops = 0; hops <= MAX_HOPS; hops++) {
      const beat = this.s.beats[id];
      if (!beat || beat.ending) return false;
      if (beat.free || beat.choices?.length) return true;
      const next = this.routeOf(st, beat.next);
      if (!next) return false;
      id = next;
    }
    return false;
  }

  private warn(w: World, heading = w.st.beat): void {
    if (w.st.ending || !this.reactionAhead(w.st, heading)) return;
    const ctx = ctxOf(w.st, this.s);
    for (const fate of this.s.fates ?? []) {
      const flag = `경고_${fate.id}`;
      if (!fate.warn || w.st.flags[flag] === true || !evalCond(fate.warn.when, ctx)) continue;
      w.st.flags[flag] = true;
      fate.warn.lines.forEach((l, i) => this.say(w, l, `fates.${fate.id}.warn[${i}]`));
    }
  }

  private dueFate(st: St) {
    if (st.ending) return undefined;
    const ctx = ctxOf(st, this.s);
    return (this.s.fates ?? []).find((f) => evalCond(f.when, ctx));
  }

  private routeOf(st: St, next: BeatSpec['next']): string | undefined {
    if (next === undefined) return undefined;
    if (typeof next === 'string') return next;
    const ctx = ctxOf(st, this.s);
    return next.find((r) => r.if === undefined || evalCond(r.if, ctx))?.to;
  }

  private route(w: World, next: BeatSpec['next'], from: string): string | undefined {
    if (next === undefined) {
      this.deadEnds.push({ kind: '막다른 길', where: from, text: '', detail: '다음 비트가 없다(next 없음)', path: w.label.join(' → ') });
      return undefined;
    }
    if (typeof next === 'string') {
      this.routesTaken.add(`${from}→${next}`);
      return next;
    }
    const ctx = ctxOf(w.st, this.s);
    const hit = next.find((r) => r.if === undefined || evalCond(r.if, ctx));
    if (!hit) {
      this.deadEnds.push({ kind: '막다른 길', where: from, text: '', detail: '조건에 맞는 next 가 없다', path: w.label.join(' → ') });
      return undefined;
    }
    this.routesTaken.add(`${from}→${hit.to}${hit.if ? ` [${hit.if}]` : ''}`);
    return hit.to;
  }

  // ── 비트에 들어서기 ──

  private enter(w0: World, id: string, hops: number): World[] {
    if (hops > MAX_HOPS) {
      this.deadEnds.push({ kind: '막다른 길', where: id, text: '', detail: '비트 연결이 끝나지 않는다(고리)', path: w0.label.join(' → ') });
      return [];
    }
    let beat = this.s.beats[id];
    if (!beat) {
      this.deadEnds.push({ kind: '막다른 길', where: id, text: '', detail: '없는 비트로 간다', path: w0.label.join(' → ') });
      return [];
    }
    const w = clone(w0);
    if (!beat.ending) {
      const fate = this.dueFate(w.st);
      if (fate && this.s.beats[fate.to]) {
        this.fatesReached.add(fate.id);
        beat = this.s.beats[fate.to] as BeatSpec;
      }
    }
    this.visited.add(beat.id);
    w.st.beat = beat.id;
    w.st.used = [];
    w.st.moves = [];
    w.label.push(beat.id);
    w.out.push(shownOf(`${beat.id}.title`, beat.id, '제목', beat.title));
    if (!beat.ending && this.s.stage) w.st.flags['상대_곁'] = Object.values(beat.cast ?? {}).includes(this.s.stage.who);
    const onEnter: Effects = { ...beat.effects, tracks: { ...beat.effects?.tracks } };
    if (beat.time && onEnter.tracks) onEnter.tracks.귀찌 = (onEnter.tracks.귀찌 ?? 0) - beat.time;
    this.apply(w, onEnter);

    const variants: { kind: 'none' | 'altered' | 'interrupt'; spec?: { id: string; lines: Line[]; effects?: Effects } }[] = [{ kind: 'none' }];
    if (beat.twist && !beat.ending) {
      for (const spec of beat.twist.altered) variants.push({ kind: 'altered', spec });
      for (const spec of beat.twist.interrupt) variants.push({ kind: 'interrupt', spec });
    }
    const results: World[] = [];
    for (const v of variants) {
      const b = beat;
      const x = clone(w);
      if (v.spec) {
        x.label.push(`장면검사:${v.spec.id}`);
        this.twistsPlayed.add(`${b.id}.${v.spec.id}`);
      }
      const play = () => {
        if (!v.spec) return;
        v.spec.lines.forEach((l, i) => this.say(x, l, `${b.id}.twist.${v.kind}.${v.spec?.id}[${i}]`));
        this.apply(x, v.spec.effects);
      };
      if (v.kind === 'interrupt') play();
      b.lines.forEach((l, i) => this.say(x, l, `${b.id}.lines[${i}]`));
      if (v.kind === 'altered') play();
      for (const note of this.s.notes ?? []) if (note.tier !== 'hidden' && note.after?.includes(b.id)) x.st.flags[noteFlag(note.id)] = true;
      this.callback(x, b);
      for (const f of this.s.foreshadow ?? []) if (f.at === b.id) x.st.flags[`짚음_${f.id}`] = true;
      if (b.free && this.s.council?.includes(b.id)) x.st.flags['작전_회의'] = true;
      if (b.free) x.st.flags['안내_입력'] = true;
      if (b.ending) {
        x.st.ending = b.ending.id;
        x.out.push(shownOf(`${b.id}.ending.summary`, b.id, '결말', b.ending.summary));
        x.out.push(shownOf(`${b.id}.ending.next_hook`, b.id, '결말', b.ending.next_hook));
        results.push(x);
        continue;
      }
      if (b.free) {
        x.out.push(shownOf(`${b.id}.free.prompt`, b.id, '안내', b.free.prompt));
        if (b.free.aim) x.out.push(shownOf(`${b.id}.free.aim`, b.id, '안내', b.free.aim));
        results.push(x);
        continue;
      }
      if (b.choices?.length) {
        results.push(x);
        continue;
      }
      const next = this.route(x, b.next, b.id);
      if (next) results.push(...this.enter(x, next, hops + 1));
    }
    return results;
  }

  private callback(w: World, beat: BeatSpec): void {
    const speakers = new Set(Object.values(beat.cast ?? {}));
    for (const spec of this.s.callbacks ?? []) {
      const used = `되받음_${spec.flag}`;
      if (!spec.after.includes(beat.id) || w.st.flags[used] === true || !speakers.has(spec.line.speaker)) continue;
      if (spec.flag === '아무말' ? w.st.flags['말함'] !== true : w.st.flags[spec.flag] !== true) continue;
      w.st.flags[used] = true;
      this.callbacksFired.add(spec.flag);
      this.say(w, spec.line, `callbacks.${spec.flag}`);
      return;
    }
  }

  // ── 한 수 ──

  private expand(i: number): void {
    const st = this.nodes[i] as St;
    if (st.ending || st.beat === '(시작)') return;
    const beat = this.s.beats[st.beat];
    const free = beat?.free;
    if (!beat || !free) {
      if (beat && !beat.choices?.length) this.deadEnds.push({ kind: '막다른 길', where: st.beat, text: '', detail: '결말도 입력도 아닌 비트에서 멈췄다' });
      return;
    }
    const base: World = { st, out: [], label: [] };
    const results: World[] = [];
    const facing = Object.values(beat.cast ?? {});

    // 접근법
    for (const a of free.approaches) {
      if (a.item !== undefined && !st.items.includes(a.item)) continue;
      const modes: ('단추' | '말+said' | '말')[] = a.said ? ['단추', '말+said', '말'] : ['단추', '말'];
      for (const mode of modes) {
        const w = clone(base);
        w.label.push(`${a.id}(${mode})`);
        if (mode === '말+said' && a.said) {
          w.st.flags[a.said.flag] = true;
          w.st.flags[`이미_${a.said.flag}`] = true;
        }
        results.push(...this.resolve(w, beat, free, a, mode));
      }
    }
    // 즉흥 행동
    for (const bold of [false, true]) {
      const outcomes = bold ? free.improv_bold : free.improv;
      if (!outcomes) continue;
      const a: ApproachSpec = { id: bold ? 'improv_bold' : 'improv', label: '즉흥', stat: '재치', hint: '', examples: [], keywords: [], outcomes };
      const w = clone(base);
      w.label.push(bold ? '즉흥(큰 행동)' : '즉흥');
      results.push(...this.resolve(w, beat, free, a, '말'));
      // 칼 앞 맨손 강행: 실패하면 위험_실패
      if (this.s.danger && facing.includes(this.s.danger.with)) {
        const d = clone(base);
        d.label.push(bold ? '맨손 강행(큰 행동)' : '맨손 강행');
        if (d.st.flags['징조_맨손'] !== true) {
          d.st.flags['징조_맨손'] = true;
          this.s.danger.omen.forEach((l, k) => this.say(d, l, `danger.omen[${k}]`));
        }
        d.st.flags['위험_강행'] = true;
        results.push(...this.resolve(d, beat, free, a, '말', ['miss']));
      }
    }
    // 말만 하기
    if (st.flags['말함'] !== true) {
      const w = clone(base);
      w.label.push('말만 함');
      w.st.flags['말함'] = true;
      results.push(...this.settle(w, new Set(this.warned(st))));
    }
    // 정체를 밝힘
    const id = this.s.identity;
    if (id && facing.includes(id.with) && st.flags['신분_노출'] !== true) {
      const w = clone(base);
      w.label.push('정체를 밝힘');
      const before = new Set(this.warned(st));
      if (w.st.flags['징조_정체'] !== true) {
        w.st.flags['징조_정체'] = true;
        id.omen.forEach((l, k) => this.say(w, l, `identity.omen[${k}]`));
      }
      w.st.flags['말함'] = true;
      this.apply(w, id.effects);
      results.push(...this.settle(w, before));
    }
    // 머뭇거림(세계의 수)
    results.push(...this.worldMove(base, beat, free));
    // 그만두기
    if (this.s.beats['e_quit']) {
      const w = clone(base);
      w.label.push('그만둠');
      results.push(...this.enter(w, 'e_quit', 0));
    }
    for (const w of results) this.link(i, w);
  }

  private warned(st: St): string[] {
    return Object.keys(st.flags).filter((k) => k.startsWith('경고_') && st.flags[k] === true).map((k) => k.slice(3));
  }

  /** 비트에 머문 채 수가 끝났을 때의 작은 끝(settleFate). 이번 턴에 처음 징조가 나온 끝은 문턱 바로 위에 멈춘다. */
  private settle(w: World, warnedBefore: Set<string>): World[] {
    this.warn(w);
    for (let fate = this.dueFate(w.st); fate; fate = this.dueFate(w.st)) {
      if (fate.warn && !warnedBefore.has(fate.id)) {
        const hold = holdBefore(fate.when);
        if (hold) {
          if (hold.flag) w.st.flags[hold.name] = hold.value;
          else w.st.tracks[hold.name as Track] = hold.value;
          if (!evalCond(fate.when, ctxOf(w.st, this.s))) continue;
        }
      }
      this.fatesReached.add(fate.id);
      return this.enter(w, fate.to, 0);
    }
    return [w];
  }

  private worldMove(base: World, beat: BeatSpec, free: FreeSpec): World[] {
    const order = ['threat', 'press', 'offer', 'clock'] as const;
    const st = base.st;
    const ctx = ctxOf(st, this.s);
    const soft = (tag: string) => (free.prices ?? []).filter((p) => p.tag === tag && p.weight === 'soft' && !st.used.includes(p.id) && (p.if === undefined || evalCond(p.if, ctx)));
    const can = (m: (typeof order)[number]) => (m === 'threat' ? (free.nudge?.length ?? 0) > 0 : m === 'press' ? free.press.length > 0 || soft('상대행동').length > 0 : m === 'offer' ? free.offer !== undefined : true);
    const move = order.find((m) => !st.moves.includes(m) && can(m));
    const before = new Set(this.warned(st));
    const start = clone(base);
    start.st.flags['말함'] = true;
    const bump = (w: World) => {
      const v = w.st.flags['머뭇'];
      w.st.flags['머뭇'] = (typeof v === 'number' ? v : 0) + 1;
      this.warn(w);
    };
    const hard = (w: World): World[] => {
      if (this.dueFate(w.st)) return this.settle(w, before);
      const a = free.approaches.find((x) => x.id === free.default_approach);
      if (!a) {
        this.deadEnds.push({ kind: '막다른 길', where: beat.id, text: '', detail: `기본 접근법 ${free.default_approach} 이 없다` });
        return [];
      }
      w.label.push(`기본 행동 ${a.id}`);
      return this.resolve(w, beat, free, a, '단추');
    };
    if (!move) {
      start.label.push('머뭇(수 없음)');
      bump(start);
      return hard(start);
    }
    start.st.moves = [...st.moves, move];
    start.label.push(`머뭇:${move}`);
    if (move === 'threat') {
      (free.nudge ?? []).forEach((l, k) => this.say(start, l, `${beat.id}.free.nudge[${k}]`));
      bump(start);
      this.apply(start, { tracks: { 귀찌: -1 } });
      return this.settle(start, before);
    }
    if (move === 'press') {
      if (free.press.length) {
        const k = free.patience % free.press.length;
        this.say(start, free.press[k] as Line, `${beat.id}.free.press[${k}]`);
        bump(start);
        return this.settle(start, before);
      }
      return soft('상대행동').flatMap((p) => {
        const w = clone(start);
        this.sayPrice(w, beat, p);
        bump(w);
        return this.settle(w, before);
      });
    }
    if (move === 'offer') {
      (free.offer?.lines ?? []).forEach((l, k) => this.say(start, l, `${beat.id}.free.offer[${k}]`));
      this.apply(start, free.offer?.effects);
      return this.settle(start, before);
    }
    const prices = soft('시간');
    const branches = prices.length
      ? prices.map((p) => {
          const w = clone(start);
          this.sayPrice(w, beat, p);
          return w;
        })
      : [
          (() => {
            const w = clone(start);
            this.say(w, { speaker: '나레이션', text: CLOCK_FALLBACK }, 'engine:CLOCK_FALLBACK');
            this.apply(w, { tracks: { 귀찌: -1 } });
            return w;
          })(),
        ];
    return branches.flatMap((w) => {
      bump(w);
      return hard(w);
    });
  }

  private sayPrice(w: World, beat: BeatSpec, p: PriceSpec): void {
    w.st.used = [...w.st.used, p.id];
    this.pricesDrawn.add(`${beat.id}.${p.id}`);
    this.say(w, { speaker: '나레이션', text: p.text }, `${beat.id}.free.prices.${p.id}`);
    this.apply(w, p.effects);
  }

  private resolve(w0: World, beat: BeatSpec, free: FreeSpec, a: ApproachSpec, mode: '단추' | '말+said' | '말', tiers: readonly Tier[] = TIERS): World[] {
    const res: World[] = [];
    const where = `${beat.id}.free.${a.id}`;
    for (const m of a.mods ?? []) {
      const on = evalCond(m.if, ctxOf(w0.st, this.s));
      let rec = this.mods.find((x) => x.where === where && x.cond === m.if);
      if (!rec) {
        rec = { where, cond: m.if, label: m.label, on: 0, off: 0 };
        this.mods.push(rec);
      }
      if (on) rec.on++;
      else rec.off++;
    }
    for (const tier of tiers) {
      const w1 = clone(w0);
      w1.label.push(tier);
      this.approachesUsed.add(`${where}.${tier}`);
      this.apply(w1, a.before);
      const outcome: Outcome = a.outcomes[tier];
      if (a.said && mode === '단추') w1.st.flags[a.said.flag] = true;
      const cands = priceCandidates(free, outcome, tier, ctxOf(w1.st, this.s), w1.st.flags, w1.st.used);
      const picks: (PriceSpec | null)[] = cands.length ? cands : [null];
      for (const price of picks) {
        const w = clone(w1);
        if (price) {
          w.label.push(`대가:${price.id}`);
          w.st.used = [...w.st.used, price.id];
          this.pricesDrawn.add(`${beat.id}.${price.id}`);
        }
        const base = `${where}.${tier}`;
        if (mode === '단추') outcome.lines.forEach((l, k) => this.say(w, l, `${base}.lines[${k}]`));
        else {
          const kept = typedFallbackLines(this.s, outcome.lines);
          if (kept.length) outcome.lines.forEach((l, k) => kept.includes(l) && this.say(w, l, `${base}.lines[${k}]`));
          else (free.neutral?.[tier] ?? []).forEach((l, k) => this.say(w, l, `${beat.id}.free.neutral.${tier}[${k}]`));
        }
        if (price) this.say(w, { speaker: '나레이션', text: price.text }, `${beat.id}.free.prices.${price.id}`);
        this.apply(w, outcome.effects, true);
        if (price) this.apply(w, price.effects, true);
        if (w.st.flags['위험_강행'] === true) {
          delete w.st.flags['위험_강행'];
          if (tier === 'miss') w.st.flags['위험_실패'] = true;
        }
        const heading = outcome.next !== undefined ? this.route(w, outcome.next, beat.id) : this.route(w, free.next ?? beat.next, beat.id);
        if (!heading) continue;
        this.warn(w, heading);
        if (heading === beat.id) res.push(...this.settle(w, new Set(this.warned(w0.st))));
        else res.push(...this.enter(w, heading, 0));
      }
    }
    return res;
  }
}

// ───────────────────────── 손으로 적은 규칙 ─────────────────────────

/** 상태와 어긋나는 글. when 이 참인 상태에서 words 가 나오면 적는다. */
const STATE_RULES: { when: string; words: string[]; unless?: string[]; why: string }[] = [
  { when: '!item:magic_bag', words: ['가방'], unless: ['빼앗', '낚아채'], why: '마법 가방을 이미 잃었는데 가방이 나온다' },
  { when: '!item:magic_bag', words: ['가방까지 빼앗', '가방을 빼앗기'], why: '마법 가방을 이미 잃었는데 지금 빼앗기는 것으로 나온다' },
  { when: '!item:map', words: ['지도'], unless: ['날려', '가져가'], why: '지도를 이미 잃었는데 지도가 나온다' },
  { when: 'flag:가방_끈 && item:magic_bag', words: ['어깨의 가방', '가방을 메', '멘 가방'], why: '가방끈이 끊겨 손에 쥐고 다니는데 어깨에 멘 것으로 나온다' },
  { when: 'flag:후드_벗음', words: ['후드 틈', '후드를 움켜', '후드를 깊이'], why: '후드를 이미 벗었는데 쓴 것으로 나온다' },
  { when: 'flag:팔_붙들림', words: ['몸을 날', '내달렸'], why: '호위에게 팔이 붙들린 채 몸을 날린다' },
];

/** 설정(lore)과 부딪는 말. 대본 전체에서 찾는다. */
const LORE_RULES: { words: RegExp; lore: string; why: string; speaker?: string }[] = [
  { words: /짐승|맹수|늑대|자칼|하이에나/u, lore: 'knowledge.common.zirda: "생명이 살지 않는 모래사막"', why: '생명이 살지 않는 사막에 짐승이 있다' },
  { words: /호위[^.]*(귓속말|말했|외쳤|소리쳤|중얼)/u, lore: 'characters.호위.voice: "사막 장면에서는 말하지 않는다"', why: '말하지 않는 호위가 말을 한다' },
  { words: /그대/u, lore: 'characters.아시나.register.forbid_words: 그대', why: '아시나가 쓰지 않는 호칭', speaker: '아시나' },
];

/** 처음 하는 사람이 앞에서 들은 적이 있어야 하는 말. 처음 나오는 자리를 갈래마다 찾는다. */
const TERMS = [
  '지르다', '크라차', '페시안', '크롬웰', '웰든', '공녀', '북대륙', '남대륙', '적국',
  '귀찌', '은발', '붉은 눈', '터번', '보석', '곡도', '호위', '복면', '검은 머리',
  '가방', '마법 가방', '지도', '물통', '물주머니', '바위', '후드', '밧줄', '낙타', '반지', '향신료',
  '북쪽', '말씨', '첩자', '미소녀', '상단', '일주일', '세 사람', '세 남자', '쓸모',
];
/** 앞의 일을 가리키는 표지. 처음 나오는 말 앞뒤에 붙으면 전제할 가능성이 크다. */
const PRESUPPOSE = /(그|저|아까|이미|다시|또|역시|그때|그 남자|이 사람)\s*$|^(이|가|은|는|도|까지)/u;

// ───────────────────────── 분석 ─────────────────────────

const norm = (t: string) => t.replace(/[\s.,!?…~―—\-'"“”‘’()]/g, '');
function sentences(t: string): string[] {
  return t
    .split(/(?<=[.!?…])\s+|(?<=―)/u)
    .map(norm)
    .filter((x) => x.length >= 6);
}
function bigrams(t: string): Set<string> {
  const s = norm(t);
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}
function longestCommon(a: string, b: string): string {
  let best = 0;
  let end = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++)
      if (a[i - 1] === b[j - 1]) {
        cur[j] = (prev[j - 1] as number) + 1;
        if ((cur[j] as number) > best) {
          best = cur[j] as number;
          end = i;
        }
      }
    prev = cur;
  }
  return a.slice(end - best, end);
}
function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}

export interface Report {
  stats: { nodes: number; edges: number; endings: Record<string, number> };
  unreachableBeats: Finding[];
  deadEnds: Finding[];
  flags: { name: string; set: string[]; read: string[]; seen: boolean; problem: string }[];
  coverage: Finding[];
  lore: Finding[];
  state: Finding[];
  repeats: Finding[];
  habits: Finding[];
  premises: Finding[];
}

export async function audit(opts: { limit?: number } = {}): Promise<{ report: Report; explorer: Explorer }> {
  const yaml = await Bun.file(SCENARIO_PATH).text();
  const lore = await loadLore(LORE_PATH);
  const s = withNotes(await loadScenario(SCENARIO_PATH), lore);
  const loc = new Locator(yaml);
  const ex = new Explorer(s, lore, loc, yaml);
  if (opts.limit !== undefined) ex.limit = opts.limit;
  const t0 = Date.now();
  const tick = (what: string) => console.error(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${what}`);
  ex.run();
  tick(`탐색 끝: 상태 ${ex.nodes.length}, 수 ${ex.edges.length}`);
  const at = (src: string, text?: string) => {
    const beat = src.split('.')[0] ?? '';
    return text ? loc.find(text, s.beats[beat] ? beat : undefined) : undefined;
  };

  // 결말 도달
  const endings: Record<string, number> = {};
  for (const n of ex.nodes) if (n.ending) endings[n.ending] = (endings[n.ending] ?? 0) + 1;

  // 닿지 않는 비트
  const unreachableBeats: Finding[] = Object.keys(s.beats)
    .filter((b) => !ex.visited.has(b))
    .map((b) => ({ kind: '닿지 않음', where: b, line: loc.find(`  ${b}:`), text: s.beats[b]?.title ?? '', detail: '어떤 갈래로도 들어서지 않는다' }));

  // 막다른 길(중복 제거)
  const deadKeys = new Set<string>();
  const deadEnds = ex.deadEnds.filter((d) => {
    const k = `${d.where}|${d.detail}`;
    if (deadKeys.has(k)) return false;
    deadKeys.add(k);
    return true;
  });
  // 결말이 아닌데 나가는 수가 없는 상태
  ex.nodes.forEach((n, i) => {
    if (!n.ending && n.beat !== '(시작)' && !(ex.out.get(i)?.length)) deadEnds.push({ kind: '막다른 길', where: n.beat, text: '', detail: '입력 자리인데 나갈 수가 없다' });
  });

  // 플래그
  const flags = flagTable(s, lore, ex);

  // 쓰이지 않는 조각
  const coverage: Finding[] = [];
  for (const [src, info] of ex.lineOf) {
    if (!info.if) continue;
    if (!ex.shown.has(src)) coverage.push({ kind: '안 나오는 줄', where: src, line: at(src, info.text), text: info.text, detail: `if "${info.if}" 가 이 자리에서 한 번도 참이 아니다` });
    else if (!ex.hidden.has(src)) coverage.push({ kind: '늘 나오는 조건 줄', where: src, line: at(src, info.text), text: info.text, detail: `if "${info.if}" 가 이 자리에서 한 번도 거짓이 아니다(조건이 필요 없음)` });
  }
  for (const [id, beat] of Object.entries(s.beats)) {
    if (!ex.visited.has(id)) continue;
    for (const p of beat.free?.prices ?? [])
      if (!ex.pricesDrawn.has(`${id}.${p.id}`)) coverage.push({ kind: '안 뽑히는 대가', where: `${id}.free.prices.${p.id}`, line: loc.find(`id: ${p.id},`, id), text: p.text, detail: `${p.weight} · ${p.tag}${p.if ? ` · if ${p.if}` : ''}: 어떤 결과의 후보에도 오르지 않는다` });
    if (Array.isArray(beat.next))
      for (const r of beat.next) {
        const k = `${id}→${r.to}${r.if ? ` [${r.if}]` : ''}`;
        if (!ex.routesTaken.has(k)) coverage.push({ kind: '안 타는 갈래', where: `${id}.next`, line: loc.find(`to: ${r.to}`, id), text: `${r.if ?? '(그 밖)'} → ${r.to}`, detail: '이 조건으로 이 갈래를 타는 상태가 없다' });
      }
    for (const a of beat.free?.approaches ?? [])
      for (const t of TIERS)
        if (!ex.approachesUsed.has(`${id}.free.${a.id}.${t}`)) coverage.push({ kind: '못 쓰는 행동', where: `${id}.free.${a.id}.${t}`, line: loc.find(`id: ${a.id}`, id), text: a.label, detail: a.item ? `필요한 소지품 ${a.item} 을 가진 채 이 비트에 오는 갈래가 없다` : '쓰이지 않는다' });
  }
  for (const m of ex.mods) {
    if (m.on === 0) coverage.push({ kind: '안 붙는 보정', where: m.where, line: loc.find(`if: "${m.cond}"`, m.where.split('.')[0]), text: `${m.label} (${m.cond})`, detail: '이 행동을 할 때 조건이 참인 상태가 없다' });
  }
  for (const f of s.fates ?? []) if (!ex.fatesReached.has(f.id)) coverage.push({ kind: '안 닿는 작은 끝', where: `fates.${f.id}`, text: f.when, detail: '탐색에서 닿지 않았다' });
  for (const c of s.callbacks ?? []) if (!ex.callbacksFired.has(c.flag)) coverage.push({ kind: '안 나오는 되받음', where: `callbacks.${c.flag}`, line: loc.find(`flag: ${c.flag}`), text: c.line.text, detail: c.words ? '플레이어가 그 낱말을 입력해야 선다(탐색은 낱말 입력을 모형에 넣지 않음)' : '플래그가 선 채 after 비트(남자가 무대에 있는)에 닿는 갈래가 없다' });
  for (const [id, beat] of Object.entries(s.beats))
    for (const kind of ['altered', 'interrupt'] as const)
      for (const t of beat.twist?.[kind] ?? []) if (!ex.twistsPlayed.has(`${id}.${t.id}`)) coverage.push({ kind: '안 나오는 장면 검사', where: `${id}.twist.${t.id}`, text: '', detail: '' });

  // 설정과 어긋나는 대사
  const loreFindings = loreCheck(s, lore, ex, at);

  // 상태와 어긋남(중복 제거)
  const stateKeys = new Set<string>();
  const state = ex.stateBreaks
    .filter((f) => {
      const k = `${f.where}|${f.detail}`;
      if (stateKeys.has(k)) return false;
      stateKeys.add(k);
      return true;
    })
    .map((f) => ({ ...f, line: at(f.where, f.text) }));
  const stageKeys = new Set<string>();
  for (const f of ex.offStage) {
    const k = f.where;
    if (stageKeys.has(k)) continue;
    stageKeys.add(k);
    state.push({ ...f, line: at(f.where, f.text) });
  }

  tick('조각·설정·상태 점검 끝');
  const { repeats, habits } = repeatCheck(ex, at);
  tick('반복 점검 끝');
  const premises = premiseCheck(s, ex, at);
  tick('처음 나옴 점검 끝');

  return { report: { stats: { nodes: ex.nodes.length, edges: ex.edges.length, endings }, unreachableBeats, deadEnds, flags, coverage, lore: loreFindings, state, repeats, habits, premises }, explorer: ex };
}

// ── 플래그 ──

function flagTable(s: Scenario, lore: Lore, ex: Explorer): Report['flags'] {
  const set = new Map<string, Set<string>>();
  const read = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, name: string, where: string) => {
    const x = m.get(name) ?? new Set<string>();
    x.add(where);
    m.set(name, x);
  };
  const effects = (e: Effects | undefined, where: string) => {
    for (const k of Object.keys(e?.flags ?? {})) add(set, k, where);
  };
  const cond = (c: string | undefined, where: string) => {
    if (!c) return;
    for (const f of condNames(c).flags) add(read, f, where);
  };
  const lines = (ls: readonly Line[] | undefined, where: string) => {
    for (const l of ls ?? []) cond(l.if, where);
  };
  const outcome = (o: Outcome | undefined, where: string) => {
    if (!o) return;
    effects(o.effects, where);
    lines(o.lines, where);
    if (Array.isArray(o.next)) for (const r of o.next) cond(r.if, where);
  };
  for (const [id, b] of Object.entries(s.beats)) {
    effects(b.effects, `${id}.effects`);
    lines(b.lines, `${id}.lines`);
    if (Array.isArray(b.next)) for (const r of b.next) cond(r.if, `${id}.next`);
    for (const kind of ['altered', 'interrupt'] as const)
      for (const t of b.twist?.[kind] ?? []) {
        effects(t.effects, `${id}.twist.${t.id}`);
        lines(t.lines, `${id}.twist.${t.id}`);
      }
    const f = b.free;
    if (!f) continue;
    for (const p of f.prices ?? []) {
      effects(p.effects, `${id}.prices.${p.id}`);
      cond(p.if, `${id}.prices.${p.id}`);
    }
    effects(f.offer?.effects, `${id}.free.offer`);
    lines(f.offer?.lines, `${id}.free.offer`);
    lines(f.nudge, `${id}.free.nudge`);
    cond(f.until, `${id}.free.until`);
    for (const t of TIERS) {
      outcome(f.improv[t], `${id}.free.improv`);
      outcome(f.improv_bold?.[t], `${id}.free.improv_bold`);
      lines(f.neutral?.[t], `${id}.free.neutral`);
    }
    for (const a of f.approaches) {
      effects(a.before, `${id}.${a.id}.before`);
      if (a.said) {
        add(set, a.said.flag, `${id}.${a.id}.said(입력 낱말·단추)`);
        add(set, `이미_${a.said.flag}`, `${id}.${a.id}.said(입력 낱말)`);
      }
      for (const m of a.mods ?? []) cond(m.if, `${id}.${a.id}.mods`);
      for (const t of TIERS) outcome(a.outcomes[t], `${id}.${a.id}.${t}`);
    }
  }
  for (const fact of s.facts) {
    cond(fact.if, 'facts');
    if (fact.state_check?.sets) add(set, fact.state_check.sets, 'facts.state_check(GM 서술 판정)');
  }
  for (const f of s.fates ?? []) {
    cond(f.when, `fates.${f.id}`);
    cond(f.warn?.when, `fates.${f.id}.warn`);
  }
  for (const [k, c] of Object.entries(s.cast)) cond(c.sprite_alt?.if, `cast.${k}.sprite_alt`);
  for (const [k, c] of Object.entries(s.cgs)) cond(c.alt?.if, `cgs.${k}.alt`);
  for (const c of s.callbacks ?? []) {
    add(read, c.flag, `callbacks.${c.flag}`);
    if (c.words) add(set, c.flag, `callbacks.${c.flag}.words(입력 낱말)`);
  }
  if (s.identity) effects(s.identity.effects, 'identity');
  for (const n of lore.knowledge) cond(n.if, `lore.knowledge.${n.id}`);
  if (s.stage) add(read, s.stage.met, 'stage.met');

  // 엔진 코드가 세우거나 읽는 플래그
  const code = ['src/engine/engine.ts', 'src/gm/gm.ts', 'src/gm/prompt.ts', 'src/gm/rules.ts', 'src/gm/validate.ts', 'src/server/main.ts'].map((p) => {
    try {
      return require('node:fs').readFileSync(join(APP, p), 'utf8') as string;
    } catch {
      return '';
    }
  });
  const codeText = code.join('\n');
  for (const m of codeText.matchAll(/flags\[['"]([^'"]+)['"]\]\s*(=(?!=))?/g)) {
    const name = m[1] ?? '';
    add(m[2] ? set : read, name, '엔진 코드');
  }
  for (const n of lore.knowledge) if (n.after?.length) add(set, noteFlag(n.id), '엔진(수첩 after)');
  for (const g of s.sheet.reveal ?? []) add(read, noteFlag(g.note), 'sheet.reveal');
  // 엔진이 이름을 지어 세우는 것(되받음_·경고_·대가_·짚음_·씀_)은 표에서 뺀다.
  const engineMade = /^(되받음_|경고_|대가_|짚음_|씀_|수첩:)/u;

  const names = new Set([...set.keys(), ...read.keys()]);
  const rows: Report['flags'] = [];
  for (const name of [...names].sort()) {
    if (engineMade.test(name) && !read.has(name)) continue;
    const ss = [...(set.get(name) ?? [])];
    const rr = [...(read.get(name) ?? [])];
    let problem = '';
    const quoted = codeText.includes(`'${name}'`) || codeText.includes(`"${name}"`);
    const engineOnly = ss.length > 0 && ss.every((x) => x === '엔진 코드');
    if (name === '아무말') problem = '';
    else if (!ss.length) problem = '읽지만 세우는 곳이 없음';
    else if (engineOnly) problem = '';
    else if (!rr.length && !quoted) problem = '세우지만 읽는 곳이 없음';
    else if (rr.length && !ex.flagsSeen.has(name) && !ss.some((x) => x.includes('입력') || x.includes('GM'))) problem = '탐색에서 한 번도 서지 않음';
    rows.push({ name, set: ss, read: rr, seen: ex.flagsSeen.has(name), problem });
  }
  return rows;
}

// ── 설정 ──

function endingOf(sentence: string): string {
  return sentence.replace(/[\s.,!?…~―—"'”’)]+$/u, '');
}

function loreCheck(s: Scenario, lore: Lore, ex: Explorer, at: (src: string, text?: string) => number | undefined): Finding[] {
  const out: Finding[] = [];
  const hiddenKeys = lore.knowledge.filter((n) => n.tier === 'hidden').flatMap((n) => n.keys);
  const groups = Object.entries(lore.forbidden).filter(([g]) => g !== 'meta');
  for (const [src, info] of ex.lineOf) {
    if (src.startsWith('engine:')) continue;
    if (!ex.shown.has(src)) continue;
    const text = info.text;
    const add = (detail: string) => out.push({ kind: '설정', where: src, line: at(src, text), text, detail });
    const cast = s.cast[info.speaker];
    const who = cast?.lore;
    const reg = cast?.style === 'narration' ? lore.narration.register : cast?.style === 'thought' ? lore.thought.register : who ? lore.characters[who]?.register : undefined;
    if (reg) {
      for (const sent of text.split(/(?<=[.!?…])\s+/u)) {
        const end = endingOf(sent);
        const bad = reg.forbid_endings.find((e) => end.endsWith(e));
        if (bad) add(`${info.speaker} 말투: "${bad}" 로 끝남 (lore register.forbid_endings)`);
      }
      const word = reg.forbid_words.find((w) => text.includes(w));
      if (word) add(`${info.speaker} 금지어 "${word}" (lore register.forbid_words)`);
    }
    for (const [g, words] of groups) {
      const w = words.find((x) => text.includes(x));
      if (w) add(`금지 목록 ${g}: "${w}"`);
    }
    const h = hiddenKeys.find((k) => text.includes(k));
    if (h) add(`숨긴 설정 낱말 "${h}" (knowledge.hidden — 이 판에서 열리지 않음)`);
    for (const [right, wrongs] of Object.entries(lore.misspellings)) {
      const w = wrongs.find((x) => text.includes(x));
      if (w) add(`오타 목록: "${w}" → "${right}"`);
    }
    const isEnding = !!s.beats[info.beat]?.ending;
    const exp = lore.exposure.find((x) => text.includes(x));
    if (exp && !isEnding) add(`노출 낱말 "${exp}" (lore exposure — 결말 밖)`);
    for (const r of LORE_RULES) if (r.words.test(text) && (!r.speaker || r.speaker === info.speaker)) add(`${r.why} — ${r.lore}`);
  }
  // free_defaults 가 남자 없는 비트로 물려 내려간 줄
  for (const [id, beat] of Object.entries(s.beats)) {
    const f = beat.free;
    if (!f) continue;
    const onStage = new Set(Object.values(beat.cast ?? {}));
    const check = (ls: readonly Line[] | undefined, where: string) => {
      for (const l of ls ?? []) {
        const speaksAbout = s.stage && !onStage.has(s.stage.who) && (l.speaker === s.stage.who || /남자|붉은 눈|호위/u.test(l.text));
        if (speaksAbout) out.push({ kind: '설정', where: `${id}.${where}`, line: undefined, text: l.text, detail: `${s.stage?.who} 가 무대에 없는 비트(${id})에서 쓰일 수 있는 줄(free_defaults 에서 물려받음)` });
      }
    };
    for (const t of TIERS) check(f.improv_bold?.[t].lines, `free.improv_bold.${t}`);
    for (const t of TIERS) check(f.improv[t].lines, `free.improv.${t}`);
    check(f.talk_fallback, 'free.talk_fallback');
    check(f.press, 'free.press');
    check(f.deflect, 'free.deflect');
  }
  return out;
}

// ── 반복 ──

function repeatCheck(ex: Explorer, at: (src: string, text?: string) => number | undefined): { repeats: Finding[]; habits: Finding[] } {
  // 줄 자리별 글
  const texts = new Map<string, { text: string; speaker: string }>();
  for (const e of ex.edges)
    for (const l of e.lines) {
      if (l.speaker === '제목' || l.speaker === '안내' || l.speaker === '결말') continue;
      texts.set(l.src, { text: l.text, speaker: l.speaker });
    }
  // 글이 같은 자리는 묶어서 한 번만 견준다.
  const byText = new Map<string, string[]>();
  for (const [src, t] of texts) {
    if (norm(t.text).length < 5) continue;
    byText.set(t.text, [...(byText.get(t.text) ?? []), src]);
  }
  const uniq = [...byText.keys()];
  const bg = uniq.map(bigrams);
  const sent = uniq.map(sentences);
  const nm = uniq.map(norm);
  const similar: [string, string, string][] = [];
  const pairUp = (i: number, j: number, why: string) => {
    for (const a of byText.get(uniq[i] as string) ?? []) for (const b of byText.get(uniq[j] as string) ?? []) if (a !== b) similar.push([a, b, why]);
  };
  for (let i = 0; i < uniq.length; i++) {
    pairUp(i, i, '같은 줄');
    for (let j = 0; j < uniq.length; j++) {
      if (i === j) continue;
      const ta = nm[i] as string;
      const tb = nm[j] as string;
      let why = '';
      if (ta === tb) why = '같은 줄';
      else {
        const shared = (sent[i] ?? []).find((x) => (sent[j] ?? []).includes(x) || tb.includes(x));
        if (shared) why = `같은 문장 "${shared}"`;
        else {
          const d = dice(bg[i] as Set<string>, bg[j] as Set<string>);
          if (d >= 0.72) why = '거의 같은 줄';
          else if (d >= 0.2) {
            const common = longestCommon(ta, tb);
            if (common.length >= 6) why = `같은 말 "${common}"`;
          }
        }
      }
      if (why) pairUp(i, j, why);
    }
  }

  // 앞 줄 a 가 나온 뒤 같은 길에서 b 가 나오는가: 상태 그래프를 한 번 앞으로 훑으며 '어떤 길로든 이미 나왔을 수 있는 줄'을 비트로 실어 나른다.
  const order = topo(ex);
  const candA = [...new Set(similar.map(([x]) => x))];
  const bit = new Map(candA.map((x, i) => [x, i]));
  const words = Math.max(1, Math.ceil(candA.length / 32));
  const partners = new Map<string, { a: string; why: string }[]>();
  for (const [x, y, why] of similar) {
    const list = partners.get(y);
    if (list) list.push({ a: x, why });
    else partners.set(y, [{ a: x, why }]);
  }
  const may = new Map<number, Uint32Array>();
  const found = new Map<string, { a: string; b: string; why: string; edge: number }>();
  for (const n of order) {
    const here = may.get(n) ?? new Uint32Array(words);
    for (const ei of ex.out.get(n) ?? []) {
      const e = ex.edges[ei] as Edge;
      const run = here.slice();
      for (const l of e.lines) {
        for (const p of partners.get(l.src) ?? []) {
          const k = bit.get(p.a) as number;
          const key = [p.a, l.src].sort().join('|');
          if ((run[k >> 5] as number) & (1 << (k & 31)) && !found.has(key)) found.set(key, { a: p.a, b: l.src, why: p.why, edge: ei });
        }
        const k = bit.get(l.src);
        if (k !== undefined) run[k >> 5] = (run[k >> 5] as number) | (1 << (k & 31));
      }
      const into = may.get(e.to);
      if (!into) may.set(e.to, run);
      else for (let i = 0; i < words; i++) into[i] = (into[i] as number) | (run[i] as number);
    }
  }
  may.clear();

  // 갈래 예: 시작 → (a 가 나온 수) → … → (b 가 나온 수)
  const inEdges = new Map<number, number[]>();
  ex.edges.forEach((e, i) => {
    const list = inEdges.get(e.to);
    if (list) list.push(i);
    else inEdges.set(e.to, [i]);
  });
  let rootTree: Map<number, number> | undefined;
  const pathTo = (target: number): string[] => {
    if (!rootTree) {
      rootTree = new Map();
      const q = [0];
      const seen = new Set([0]);
      for (let qi = 0; qi < q.length; qi++)
        for (const ei of ex.out.get(q[qi] as number) ?? []) {
          const to = ex.edges[ei]?.to as number;
          if (seen.has(to)) continue;
          seen.add(to);
          rootTree.set(to, ei);
          q.push(to);
        }
    }
    const steps: string[] = [];
    let n = target;
    while (n !== 0 && rootTree.has(n)) {
      const e = ex.edges[rootTree.get(n) as number] as Edge;
      steps.unshift(e.label);
      n = e.from;
    }
    return steps;
  };
  const example = (a: string, edge: number): string => {
    const e = ex.edges[edge] as Edge;
    const idxB = e.lines.findIndex((l) => partners.get(l.src)?.some((p) => p.a === a));
    if (e.lines.slice(0, idxB).some((l) => l.src === a)) return [...pathTo(e.from), e.label].join(' ⇒ ');
    // e.from 에서 거꾸로 a 가 나온 수를 찾는다
    const child = new Map<number, number>();
    const q = [e.from];
    const seen = new Set([e.from]);
    for (let qi = 0; qi < q.length; qi++) {
      const n = q[qi] as number;
      for (const ei of inEdges.get(n) ?? []) {
        const pe = ex.edges[ei] as Edge;
        if (pe.lines.some((l) => l.src === a)) {
          const steps = [...pathTo(pe.from), pe.label];
          let m = n;
          while (m !== e.from) {
            const ce = ex.edges[child.get(m) as number] as Edge;
            steps.push(ce.label);
            m = ce.to;
          }
          return [...steps, e.label].join(' ⇒ ');
        }
        if (seen.has(pe.from)) continue;
        seen.add(pe.from);
        child.set(pe.from, ei);
        q.push(pe.from);
      }
    }
    return e.label;
  };

  const repeats: Finding[] = [];
  for (const { a, b, why, edge } of found.values()) {
    const ta = texts.get(a);
    const tb = texts.get(b);
    const pair = [`${ta?.speaker}: ${ta?.text}`, `${tb?.speaker}: ${tb?.text}`].sort().join(' / ');
    const have = repeats.find((x) => x.text === pair);
    if (have) {
      have.detail = have.detail.replace(/ \(같은 글이 (\d+)곳 짝\)$|$/u, (_m, n) => ` (같은 글이 ${Number(n ?? 1) + 1}곳 짝)`);
      continue;
    }
    repeats.push({ kind: '반복', where: `${a} → ${b}`, line: at(b, tb?.text), text: pair, detail: why, path: example(a, edge) });
  }

  // 말버릇: 한 갈래에서 같은 짧은 줄이 몇 번 나오는가(가장 많이 나오는 길)
  const counts = new Map<string, number>();
  const short = new Map<string, string>();
  for (const e of ex.edges) for (const l of e.lines) if (norm(l.text).length > 0 && norm(l.text).length < 5 && l.speaker !== '제목') short.set(`${l.speaker}: ${l.text}`, l.src);
  const habits: Finding[] = [];
  for (const key of short.keys()) {
    const best = new Map<number, number>();
    for (const n of order) {
      const here = best.get(n) ?? 0;
      for (const ei of ex.out.get(n) ?? []) {
        const e = ex.edges[ei] as Edge;
        const k = here + e.lines.filter((l) => `${l.speaker}: ${l.text}` === key).length;
        if ((best.get(e.to) ?? -1) < k) best.set(e.to, k);
      }
    }
    const max = Math.max(0, ...best.values());
    counts.set(key, max);
    if (max >= 3) habits.push({ kind: '말버릇', where: key, text: key, detail: `한 갈래에서 최대 ${max}번` });
  }
  habits.sort((x, y) => Number(/\d+/.exec(y.detail)?.[0]) - Number(/\d+/.exec(x.detail)?.[0]));
  return { repeats, habits };
}

function topo(ex: Explorer): number[] {
  const indeg = new Array(ex.nodes.length).fill(0) as number[];
  for (const e of ex.edges) if (e.from !== e.to) indeg[e.to] = (indeg[e.to] ?? 0) + 1;
  const q: number[] = [];
  indeg.forEach((d, i) => d === 0 && q.push(i));
  const out: number[] = [];
  for (let qi = 0; qi < q.length; qi++) {
    const n = q[qi] as number;
    out.push(n);
    for (const ei of ex.out.get(n) ?? []) {
      const to = ex.edges[ei]?.to as number;
      if (to === n) continue;
      indeg[to] = (indeg[to] ?? 0) - 1;
      if (indeg[to] === 0) q.push(to);
    }
  }
  if (out.length !== ex.nodes.length) throw new Error(`상태 그래프에 고리가 있다(${ex.nodes.length - out.length}개)`);
  return out;
}

// ── 앞에서 안 나온 사실 ──

function premiseCheck(s: Scenario, ex: Explorer, at: (src: string, text?: string) => number | undefined): Finding[] {
  const order = topo(ex);
  // 노드마다 '어떤 길로는 아직 못 들은 말'
  const unseen = new Map<number, Set<string>>();
  unseen.set(0, new Set(TERMS));
  const firstAt = new Map<string, Map<string, { count: number; text: string; speaker: string; before: string }>>();
  const heardIn = (l: Shown): string => {
    const display = s.cast[l.speaker]?.display ?? '';
    return `${display} ${l.text}`;
  };
  for (const n of order) {
    const here = unseen.get(n);
    if (!here) continue;
    for (const ei of ex.out.get(n) ?? []) {
      const e = ex.edges[ei] as Edge;
      const left = new Set(here);
      for (const l of e.lines) {
        if (l.speaker === '안내') continue;
        for (const t of [...left]) {
          const textOnly = l.text;
          const heard = heardIn(l);
          if (!heard.includes(t)) continue;
          left.delete(t);
          if (!textOnly.includes(t)) continue; // 화자 이름표로 처음 본 것
          const m = firstAt.get(t) ?? new Map();
          const i = textOnly.indexOf(t);
          const rec = m.get(l.src) ?? { count: 0, text: l.text, speaker: l.speaker, before: textOnly.slice(Math.max(0, i - 6), i) + '|' + textOnly.slice(i + t.length, i + t.length + 3) };
          rec.count++;
          m.set(l.src, rec);
          firstAt.set(t, m);
        }
      }
      const prev = unseen.get(e.to);
      if (!prev) unseen.set(e.to, left);
      else for (const t of left) prev.add(t);
    }
  }
  const out: Finding[] = [];
  const keep = (style: string, marked: boolean, others: number) => style === 'speech' || style === 'thought' || style === '결말' || (marked && others > 0);
  for (const [term, places] of firstAt) {
    const all = [...places.entries()];
    for (const [src, r] of all) {
      const [pre = '', post = ''] = r.before.split('|');
      const marked = PRESUPPOSE.test(pre) || /^(이|가|은|는|도|까지|에|을|를)/u.test(post);
      const others = all.filter(([x]) => x !== src).map(([x]) => x.split('.')[0]);
      const style = s.cast[r.speaker]?.style ?? r.speaker;
      if (!keep(style, marked, others.length)) continue;
      const same = out.find((x) => x.where === src);
      if (same) {
        same.detail += ` · "${term}"(${marked ? '가리키는 꼴, ' : ''}다른 길 첫 자리: ${[...new Set(others)].join(', ') || '없음'})`;
        continue;
      }
      out.push({
        kind: '처음 나옴',
        where: src,
        line: at(src, r.text),
        text: `${r.speaker}: ${r.text}`,
        detail: `"${term}" 이 이 길에서 처음 나온다(${style}${marked ? ', 앞말을 가리키는 꼴' : ''}). 다른 길의 첫 자리: ${[...new Set(others)].join(', ') || '없음'}`,
      });
    }
  }
  out.sort((a, b) => a.where.localeCompare(b.where));
  return out;
}

// ───────────────────────── 표 쓰기 ─────────────────────────

const cell = (t: string | number | undefined) => String(t ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function table(head: string[], rows: (string | number | undefined)[][], limit = 400): string {
  if (!rows.length) return '_없음_\n';
  const shown = rows.slice(0, limit);
  const more = rows.length > limit ? `\n_외 ${rows.length - limit}건 (--json 으로 전부 볼 수 있다)_\n` : '';
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...shown.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n') + '\n' + more;
}
const loc = (f: Finding) => (f.line ? `${f.where} (ep01_desert.yaml:${f.line})` : f.where);

export function render(r: Report): string {
  const parts: string[] = [];
  parts.push('<!-- audit:begin -->');
  parts.push('<!-- 이 구역은 `cd app && bun scripts/script_audit.ts` 가 다시 쓴다. 손으로 고치지 말 것. -->');
  parts.push('');
  parts.push('## 자동 점검 결과');
  parts.push('');
  parts.push(`탐색한 상태 ${r.stats.nodes}개, 수(상태 사이 이동) ${r.stats.edges}개. 결말별 도달 상태 수: ${Object.entries(r.stats.endings).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  parts.push('');
  parts.push('### 1. 닿지 않는 비트');
  parts.push(table(['비트', '제목', '내용'], r.unreachableBeats.map((f) => [loc(f), f.text, f.detail])));
  parts.push('### 2. 막다른 길');
  parts.push(table(['어디', '내용', '갈래'], r.deadEnds.map((f) => [loc(f), f.detail, f.path])));
  parts.push('### 3. 플래그');
  parts.push('세우는 곳·읽는 곳이 한쪽뿐이거나, 읽히지만 탐색 중 한 번도 서지 않는 플래그만 적는다. 전체 목록은 `--json`.');
  parts.push('');
  parts.push(table(['플래그', '문제', '세우는 곳', '읽는 곳'], r.flags.filter((f) => f.problem).map((f) => [f.name, f.problem, f.set.join(', '), f.read.join(', ')])));
  parts.push('### 4. 쓰이지 않는 조각(조건 줄·대가·갈래·행동·보정)');
  parts.push(table(['종류', '어디', '글', '내용'], r.coverage.map((f) => [f.kind, loc(f), f.text, f.detail])));
  parts.push('### 5. 설정과 어긋나는 대사');
  parts.push(table(['어디', '글', '내용'], r.lore.map((f) => [loc(f), f.text, f.detail])));
  parts.push('### 6. 그때의 상태와 어긋나는 글');
  parts.push(table(['종류', '어디', '글', '내용'], r.state.map((f) => [f.kind, loc(f), f.text, f.detail])));
  parts.push('### 7. 같은 말 반복(한 갈래 안)');
  parts.push(table(['어디(앞 → 뒤)', '글', '내용', '갈래 예'], r.repeats.map((f) => [loc(f), f.text, f.detail, f.path])));
  parts.push('짧은 줄 말버릇(한 갈래에서 3번 이상):');
  parts.push('');
  parts.push(table(['줄', '횟수'], r.habits.map((f) => [f.text, f.detail])));
  parts.push('### 8. 앞에서 안 나온 말이 처음 나오는 자리');
  parts.push('고른 낱말(TERMS)이 어떤 갈래에서 처음 화면에 나오는 줄. 처음 나온 자리가 갈래마다 다르거나, 앞말을 가리키는 꼴이면 전제 후보다. 판단은 위 "사람 판단" 표에 적는다.');
  parts.push('');
  parts.push(table(['어디', '글', '내용'], r.premises.map((f) => [loc(f), f.text, f.detail])));
  parts.push('### 모형의 한계');
  parts.push('- 행운(실패를 대가 있는 성공으로 바꿈)은 대가 있는 성공 갈래로 대신한다. 행운 수치 자체는 따지지 않는다.');
  parts.push('- 말로 입력한 판은 LLM 이 없을 때(--no-llm)의 대체 줄(typedFallbackLines·neutral)로 본다. LLM 이 쓰는 글은 점검하지 않는다.');
  parts.push('- 플레이어 낱말로만 서는 되받음(상인·여행자·고양이)과 GM 서술 판정(state_check)은 상태 탐색에 넣지 않는다.');
  parts.push('- 끼어들기(대사 도중 입력), 여러 번 말하기의 참을성 줄, 질문 모드는 넣지 않는다. 말한 적이 있는지(말함)만 갈래로 둔다.');
  parts.push('- 상태를 합칠 때는 그 비트 뒤에서 조건으로 읽힐 수 있는 수치·플래그만 본다(읽히지 않는 것은 갈래를 바꾸지 못한다). 그래서 6번 표의 어긋남은 합쳐진 상태 하나로 본 것이라, 같은 줄이 다른 상태에서도 어긋날 수 있다.');
  parts.push('- 7번 \'같은 말\'(6글자 이상 겹침)은 후보다. "남자의 눈빛이" 같은 흔한 말이 걸린 것은 사람 판단 표에서 뺐다.');
  parts.push('');
  parts.push('<!-- audit:end -->');
  return parts.join('\n');
}

if (import.meta.main) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--limit') && !args.has('--json') && !args.has('--stdout')) throw new Error('--limit 은 --json 이나 --stdout 과 함께만 쓴다');
  const li = process.argv.indexOf('--limit');
  const limit = li >= 0 ? Number(process.argv[li + 1]) : undefined;
  const { report } = await audit(limit === undefined ? {} : { limit });
  if (limit !== undefined) console.error(`--limit ${limit}: 일부만 펼친 결과다. 문서에 쓰지 말 것.`);
  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const body = render(report);
    if (args.has('--stdout')) console.log(body);
    else {
      const file = Bun.file(REPORT_PATH);
      const old = (await file.exists()) ? await file.text() : '';
      const begin = old.indexOf('<!-- audit:begin -->');
      const end = old.indexOf('<!-- audit:end -->');
      const next = begin >= 0 && end > begin ? old.slice(0, begin) + body + old.slice(end + '<!-- audit:end -->'.length) : `# 대본 기계 점검 (ep01_desert)\n\n${body}\n`;
      await Bun.write(REPORT_PATH, next);
      console.log(`${REPORT_PATH} 를 썼다.`);
    }
    const n = (x: unknown[]) => x.length;
    console.log(
      `상태 ${report.stats.nodes} · 수 ${report.stats.edges} · 닿지 않는 비트 ${n(report.unreachableBeats)} · 막다른 길 ${n(report.deadEnds)} · 문제 플래그 ${n(report.flags.filter((f) => f.problem))} · 안 쓰이는 조각 ${n(report.coverage)} · 설정 ${n(report.lore)} · 상태 ${n(report.state)} · 반복 ${n(report.repeats)} · 처음 나옴 ${n(report.premises)}`,
    );
  }
}
