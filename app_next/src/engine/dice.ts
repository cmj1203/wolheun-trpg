import type { Ability, ModApplied, RollResult, Tier } from './types.ts';

/** mulberry32 한 단계. 다음 상태와 32비트 정수 하나를 돌려준다. */
export function nextU32(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(s ^ (s >>> 15), s | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: (r ^ (r >>> 14)) >>> 0, state: s };
}

const D6_LIMIT = Math.floor(0x1_0000_0000 / 6) * 6;

/** 치우침 없는 d6. 나머지 연산의 편향을 피하려고 범위를 벗어난 값은 버리고 다시 뽑는다. */
export function rollD6(state: number): { face: number; state: number } {
  let s = state;
  for (;;) {
    const next = nextU32(s);
    s = next.state;
    if (next.value < D6_LIMIT) return { face: (next.value % 6) + 1, state: s };
  }
}

export function tierOf(total: number): Tier {
  if (total >= 10) return 'hit';
  if (total >= 7) return 'mixed';
  return 'miss';
}

export function roll2d6(
  rng: number,
  label: string,
  stat: Ability,
  statValue: number,
  mods: ModApplied[],
): { roll: RollResult; rng: number } {
  const a = rollD6(rng);
  const b = rollD6(a.state);
  const total = a.face + b.face + statValue + mods.reduce((sum, m) => sum + m.value, 0);
  return {
    roll: { label, stat, statValue, mods, dice: [a.face, b.face], total, tier: tierOf(total) },
    rng: b.state,
  };
}

/** 문자열 시드를 uint32 로 바꾼다(FNV-1a). 숫자 시드는 그대로 쓴다. */
export function seedFrom(input: string | number): number {
  if (typeof input === 'number') return input >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
