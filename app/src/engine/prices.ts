import { evalCond, type CondContext } from './conditions.ts';
import { nextU32 } from './dice.ts';
import { TRACKS, TRACK_INFO, type Effects, type FlagValue, type FreeSpec, type ItemSpec, type Outcome, type PriceSpec, type Tier, type Track } from './types.ts';

export interface PriceContext extends CondContext {
  lockedTracks?: readonly Track[];
}

/** 문맥이 있으면 바닥·상한·이미 잃은 물건을 제외한 실제 인라인 비용만 센다. */
export function hasInlineCost(effects: Effects | undefined, ctx?: PriceContext): boolean {
  return TRACKS.some(track => {
    if (ctx?.lockedTracks?.includes(track)) return false;
    const delta = effects?.tracks?.[track] ?? 0;
    return track === '의심' || track === '집착'
      ? delta > 0 && (!ctx || ctx.tracks[track] < TRACK_INFO[track].max)
      : delta < 0 && (!ctx || ctx.tracks[track] > 0);
  }) || Boolean(effects?.lose?.some(id => !ctx || ctx.items.includes(id)));
}

/** 한 판에 한 번뿐인 대가가 이미 나왔음을 남기는 플래그 이름. */
export function onceFlag(id: string): string {
  return `대가_${id}`;
}

/**
 * 이 결과에서 뽑을 수 있는 대가 후보.
 * 결과에 price 목록이 있으면 그것, 없으면 비트 표 전체. 7~9 는 soft 만, 6- 는 hard 가 하나라도 있으면 hard 만.
 * 조건(if)에 안 맞거나 once 가 이미 쓰인 것은 뺀다. 이 장면에서 이미 뽑힌 것은 다른 후보가 남아 있는 한 뒤로 미룬다.
 */
export function priceCandidates(free: FreeSpec, outcome: Outcome, tier: Tier, ctx: PriceContext, flags: Record<string, FlagValue>, used: readonly string[], item?: ItemSpec, spoken = true, actualCost = false): PriceSpec[] {
  if (tier === 'hit' || tier === 'crit') return [];
  const table = (free.prices ?? []).filter((p) => (!p.spoken || spoken) && (!actualCost ||
    hasInlineCost(p.effects, ctx) ||
    Object.entries(p.effects?.flags ?? {}).some(([key, value]) => ctx.flags[key] !== value) ||
    p.effects?.lose?.some(id => ctx.items.includes(id))));
  const listed = outcome.price ? outcome.price.flatMap((id) => table.filter((p) => p.id === id)) : table;
  // 물건 대가의 우선순위도 이 결과에서 허용한 후보 안에서만 적용한다.
  const preferred = item && item.id !== 'earring' ? listed.filter((p) =>
    p.tag === '소지품' && p.weight === (tier === 'mixed' ? 'soft' : 'hard') &&
    (p.if === undefined || evalCond(p.if, ctx)) && !(p.once && flags[onceFlag(p.id)] === true) &&
    (p.effects?.lose?.includes(item.id) || item.states?.some((s) => p.effects?.flags?.[s.flag] === true))) : [];
  if (preferred.length) {
    const fresh = preferred.filter((p) => !used.includes(p.id));
    return fresh.length ? fresh : preferred;
  }
  let pool = listed.filter((p) => (tier === 'mixed' ? p.weight === 'soft' : true) && (p.if === undefined || evalCond(p.if, ctx)) && !(p.once && flags[onceFlag(p.id)] === true));
  if ((tier === 'miss' || tier === 'fumble') && pool.some((p) => p.weight === 'hard')) pool = pool.filter((p) => p.weight === 'hard');
  const fresh = pool.filter((p) => !used.includes(p.id));
  return fresh.length ? fresh : pool;
}

/** 후보 중 하나를 씨앗(지금 주사위 상태)으로 뽑는다. 같은 씨앗이면 같은 대가다. */
export function drawPrice(candidates: readonly PriceSpec[], seed: number): { price: PriceSpec | null } {
  if (candidates.length === 0) return { price: null };
  return { price: candidates[nextU32(seed).value % candidates.length] ?? null };
}
