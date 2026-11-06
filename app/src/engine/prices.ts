import { evalCond, type CondContext } from './conditions.ts';
import { nextU32 } from './dice.ts';
import type { FlagValue, FreeSpec, ItemSpec, Outcome, PriceSpec, Tier } from './types.ts';

/** 한 판에 한 번뿐인 대가가 이미 나왔음을 남기는 플래그 이름. */
export function onceFlag(id: string): string {
  return `대가_${id}`;
}

/**
 * 이 결과에서 뽑을 수 있는 대가 후보.
 * 결과에 price 목록이 있으면 그것, 없으면 비트 표 전체. 7~9 는 soft 만, 6- 는 hard 가 하나라도 있으면 hard 만.
 * 조건(if)에 안 맞거나 once 가 이미 쓰인 것은 뺀다. 이 장면에서 이미 뽑힌 것은 다른 후보가 남아 있는 한 뒤로 미룬다.
 */
export function priceCandidates(free: FreeSpec, outcome: Outcome, tier: Tier, ctx: CondContext, flags: Record<string, FlagValue>, used: readonly string[], item?: ItemSpec, spoken = true): PriceSpec[] {
  if (tier === 'hit' || tier === 'crit') return [];
  const table = (free.prices ?? []).filter((p) => !p.spoken || spoken);
  // 쓴 물건의 대가는 장면 표에서 찾는다. 없으면 결과별 후보와 기존 추첨 규칙을 따른다.
  const preferred = item && item.id !== 'earring' ? table.filter((p) =>
    p.tag === '소지품' && p.weight === (tier === 'mixed' ? 'soft' : 'hard') &&
    (p.if === undefined || evalCond(p.if, ctx)) && !(p.once && flags[onceFlag(p.id)] === true) &&
    (p.effects?.lose?.includes(item.id) || item.states?.some((s) => p.effects?.flags?.[s.flag] === true))) : [];
  if (preferred.length) {
    const fresh = preferred.filter((p) => !used.includes(p.id));
    return fresh.length ? fresh : preferred;
  }
  const listed = outcome.price ? outcome.price.flatMap((id) => table.filter((p) => p.id === id)) : table;
  let pool = listed.filter((p) => (tier === 'mixed' ? p.weight === 'soft' : true) && (p.if === undefined || evalCond(p.if, ctx)) && !(p.once && flags[onceFlag(p.id)] === true));
  if (tier === 'miss' && pool.some((p) => p.weight === 'hard')) pool = pool.filter((p) => p.weight === 'hard');
  const fresh = pool.filter((p) => !used.includes(p.id));
  return fresh.length ? fresh : pool;
}

/** 후보 중 하나를 씨앗(지금 주사위 상태)으로 뽑는다. 같은 씨앗이면 같은 대가다. */
export function drawPrice(candidates: readonly PriceSpec[], seed: number): { price: PriceSpec | null } {
  if (candidates.length === 0) return { price: null };
  return { price: candidates[nextU32(seed).value % candidates.length] ?? null };
}
