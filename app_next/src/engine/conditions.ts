// 시나리오 조건식. 예: "의심 >= 6", "flag:미인계", "item:pin", "!flag:들킴 && 집착 >= 2", "a || b".
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
  | { kind: 'cmp'; name: string; op: Op; value: number };

type Op = '>=' | '<=' | '==' | '!=' | '>' | '<';

const FLAG_RE = /^(!?)\s*(flag|item):([\p{L}\p{N}_-]+)$/u;
const CMP_RE = /^([\p{L}\p{N}_-]+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$/u;

function parseAtom(src: string): Atom {
  const s = src.trim();
  const f = FLAG_RE.exec(s);
  if (f) {
    const negate = f[1] === '!';
    const name = f[3] ?? '';
    return f[2] === 'flag' ? { kind: 'flag', name, negate } : { kind: 'item', name, negate };
  }
  const c = CMP_RE.exec(s);
  if (c) return { kind: 'cmp', name: c[1] ?? '', op: c[2] as Op, value: Number(c[3]) };
  throw new Error(`조건식을 해석할 수 없습니다: "${src}"`);
}

export function parseCond(src: string): Atom[][] {
  return src.split('||').map((part) => part.split('&&').map(parseAtom));
}

function numeric(name: string, ctx: CondContext): number {
  if ((TRACKS as readonly string[]).includes(name)) return ctx.tracks[name as Track];
  if ((ABILITIES as readonly string[]).includes(name)) return ctx.abilities[name as Ability];
  const v = ctx.flags[name];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
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
      const left = numeric(atom.name, ctx);
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

export function condNames(src: string): { flags: string[]; items: string[]; numbers: string[] } {
  const out = { flags: [] as string[], items: [] as string[], numbers: [] as string[] };
  for (const group of parseCond(src)) {
    for (const atom of group) {
      if (atom.kind === 'flag') out.flags.push(atom.name);
      else if (atom.kind === 'item') out.items.push(atom.name);
      else out.numbers.push(atom.name);
    }
  }
  return out;
}
