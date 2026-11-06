import { describe, expect, test } from 'bun:test';
import { nextU32, roll2d6, rollD6, seedFrom, tierOf } from '../src/engine/dice.ts';

function faces(seed: number, count: number): number[] {
  const out: number[] = [];
  let state = seed;
  for (let i = 0; i < count; i++) {
    const r = rollD6(state);
    out.push(r.face);
    state = r.state;
  }
  return out;
}

describe('시드 고정 난수', () => {
  test('같은 시드는 같은 주사위 순서를 만든다', () => {
    expect(faces(42, 100)).toEqual(faces(42, 100));
  });

  test('다른 시드는 다른 순서를 만든다', () => {
    expect(faces(42, 50)).not.toEqual(faces(43, 50));
  });

  test('시드 42의 첫 주사위 열 개는 고정값이다(난수 알고리즘이 바뀌면 깨진다)', () => {
    expect(faces(42, 10)).toEqual([1,5,1,6,1,4,5,6,1,4]);
  });

  test('d6 는 1~6 이 고르게 나온다(60,000번, 각 면 ±5% 안)', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const f of faces(2026, 60_000)) counts[f - 1] = (counts[f - 1] ?? 0) + 1;
    for (const c of counts) {
      expect(c).toBeGreaterThan(9_500);
      expect(c).toBeLessThan(10_500);
    }
  });

  test('nextU32 는 상태를 바꾸고 32비트 정수를 낸다', () => {
    const a = nextU32(1);
    expect(a.state).not.toBe(1);
    expect(Number.isInteger(a.value)).toBe(true);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(2 ** 32);
  });

  test('문자열 시드는 같은 글자면 같은 값이다', () => {
    expect(seedFrom('월흔')).toBe(seedFrom('월흔'));
    expect(seedFrom('월흔')).not.toBe(seedFrom('월흔2'));
    expect(seedFrom(77)).toBe(77);
  });
});

describe('2d6 + 능력치 판정 등급', () => {
  test.each([
    [2, 'miss'],
    [6, 'miss'],
    [7, 'mixed'],
    [9, 'mixed'],
    [10, 'hit'],
    [12, 'hit'],
    [15, 'hit'],
  ] as const)('합계 %i 는 %s', (total, tier) => {
    expect(tierOf(total)).toBe(tier);
  });

  test('합계는 주사위 두 개 + 능력치 + 보정이고 등급은 합계로 정해진다', () => {
    const { roll, rng } = roll2d6(7, '미인계', '매력', 2, [{ label: '귀찌가 불안함', value: -1 }]);
    expect(roll.total).toBe(roll.dice[0] + roll.dice[1] + 2 - 1);
    expect(roll.tier).toBe(tierOf(roll.total));
    expect(rng).not.toBe(7);
  });

  test('같은 난수 상태에서 굴리면 같은 결과가 나온다', () => {
    const a = roll2d6(123, '판정', '재치', 1, []);
    const b = roll2d6(123, '판정', '재치', 1, []);
    expect(a).toEqual(b);
  });

  test('시드 1~300 에서 대성공을 포함한 네 등급이 모두 나온다', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) seen.add(roll2d6(seed, '판정', '근력', 0, []).roll.tier);
    expect([...seen].sort()).toEqual(['crit', 'hit', 'miss', 'mixed']);
  });
});
