// 시나리오 조건식. 예: "의심 >= 6", "flag:미인계", "item:pin", "!flag:들킴 && 집착 >= 2", "a || b", 숫자 플래그는 "flag:머뭇 >= 3".
// eval 을 쓰지 않고 직접 해석한다. 문법 오류는 시나리오를 읽을 때 잡힌다.

import { ABILITIES, TRACKS, type Ability, type FlagValue, type Track } from './types.ts';

export interface CondContext {
  tracks: Record<Track, number>;
  abilities: Record<Ability, number>;
  flags: Record<string, FlagValue>;
  items: readonly string[];
}

type Atom =
  | { kind: 'flag'; name: string; negate: boolean }
  | { kind: 'item'; name: string; negate: boolean }
  | { kind: 'cmp'; name: string; op: Op; value: number; flag: boolean };

type Op = '>=' | '<=' | '==' | '!=' | '>' | '<';

const FLAG_RE = /^(!?)\s*(flag|item):([\p{L}\p{N}_-]+)$/u;
const CMP_RE = /^(flag:)?([\p{L}\p{N}_-]+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/u;

function parseAtom(src: string): Atom {
  const s = src.trim();
  const f = FLAG_RE.exec(s);
  if (f) {
    const negate = f[1] === '!';
    const name = f[3] ?? '';
    return f[2] === 'flag' ? { kind: 'flag', name, negate } : { kind: 'item', name, negate };
  }
  const c = CMP_RE.exec(s);
  if (c) return { kind: 'cmp', name: c[2] ?? '', op: c[3] as Op, value: Number(c[4]), flag: c[1] !== undefined };
  throw new Error(`조건식을 해석할 수 없습니다: "${src}"`);
}

export function parseCond(src: string): Atom[][] {
  return src.split('||').map((part) => part.split('&&').map(parseAtom));
}

function flagNumber(v: FlagValue | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

function numeric(name: string, ctx: CondContext): number {
  if ((TRACKS as readonly string[]).includes(name)) return ctx.tracks[name as Track];
  if ((ABILITIES as readonly string[]).includes(name)) return ctx.abilities[name as Ability];
  return flagNumber(ctx.flags[name]);
}

function test(atom: Atom, ctx: CondContext): boolean {
  switch (atom.kind) {
    case 'flag': {
      const v = ctx.flags[atom.name];
      const on = v !== undefined && v !== false && v !== 0 && v !== '';
      return atom.negate ? !on : on;
    }
    case 'item': {
      const has = ctx.items.includes(atom.name);
      return atom.negate ? !has : has;
    }
    case 'cmp': {
      const left = atom.flag ? flagNumber(ctx.flags[atom.name]) : numeric(atom.name, ctx);
      switch (atom.op) {
        case '>=': return left >= atom.value;
        case '<=': return left <= atom.value;
        case '==': return left === atom.value;
        case '!=': return left !== atom.value;
        case '>': return left > atom.value;
        case '<': return left < atom.value;
      }
    }
  }
}

export function evalCond(src: string, ctx: CondContext): boolean {
  return parseCond(src).some((all) => all.every((atom) => test(atom, ctx)));
}

/**
 * 한 개의 비교식("귀찌 <= 0", "flag:머뭇 >= 3")이 참이 되기 직전 값. 작은 끝 경고가 처음 나온 턴에 수치를 문턱 바로 위에 멈추는 데 쓴다.
 * 공개 플래그와 비교식 하나의 AND 결합도 받는다. OR·복수 비교식·==/!= 이면 null.
 */
export function holdBefore(src: string): { name: string; flag: boolean; value: number } | null {
  if (src.includes('||')) return null;
  const parts = src.split('&&').map((s) => s.trim());
  const comparisons = parts.filter((s) => CMP_RE.test(s));
  if (comparisons.length !== 1 || parts.some((s) => !CMP_RE.test(s) && !FLAG_RE.test(s))) return null;
  const c = CMP_RE.exec(comparisons[0] ?? '');
  if (!c) return null;
  const value = Number(c[4]);
  switch (c[3] as Op) {
    case '<=':
      return { name: c[2] ?? '', flag: c[1] === 'flag:', value: value + 1 };
    case '<':
      return { name: c[2] ?? '', flag: c[1] === 'flag:', value };
    case '>=':
      return { name: c[2] ?? '', flag: c[1] === 'flag:', value: value - 1 };
    case '>':
      return { name: c[2] ?? '', flag: c[1] === 'flag:', value };
    default:
      return null;
  }
}

export function condNames(src: string): { flags: string[]; items: string[]; numbers: string[] } {
  const out = { flags: [] as string[], items: [] as string[], numbers: [] as string[] };
  for (const group of parseCond(src)) {
    for (const atom of group) {
      if (atom.kind === 'flag') out.flags.push(atom.name);
      else if (atom.kind === 'item') out.items.push(atom.name);
      else if (atom.flag) out.flags.push(atom.name);
      else out.numbers.push(atom.name);
    }
  }
  return out;
}
