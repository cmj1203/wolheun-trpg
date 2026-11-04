import type { FreeSpec } from '../engine/types.ts';
import type { Lore } from './lore.ts';
import { isNoise } from '../engine/text.ts';
import { mentions } from './validate.ts';

export type RuleReading =
  | { kind: 'approach'; approach: string; item: string | null; score: number }
  | { kind: 'talk' }
  /** why: 이유를 묻는 말. 아는 것 안에 답이 있는지 LLM 이 가른다. */
  | { kind: 'ask'; why: boolean }
  | { kind: 'deflect'; reason: string }
  | { kind: 'improv'; absurd: boolean };

/** 가진 소지품을 쓰는 행동의 키워드가 이만큼 맞으면 LLM 보다 규칙 해석을 따른다. */
export const ITEM_RULE_MIN_SCORE = 2;

const QUESTION = /[?？]|^(누구|뭐|왜|어디|무슨|어떻게|당신|이름|여긴|여기)/;
const ACTION_ENDING = /[가-힣]+다[.!…~]*$/;
const RATING_GROUPS = ['sexual', 'gore', 'harm', 'profanity'] as const;

const ASK_WORDS = /(뭐야|뭔데|뭐지|뭐였지|뭐더라|누구야|누구지|누군데|누구더라|어디야|어디지|어딘데|어디더라|어떤 (곳|나라|사람|도시|물건)|무슨 (뜻|곳|나라|사람)|알려 ?줘|설명해)/;
const ADDRESS = /^(너|넌|네가|니가|당신|그쪽|댁)(\s|$)/;
const ASK_PLACE = /저 ?(남자|사람)|여기|이곳/;
const ASK_WHY = /(^|\s)왜\s/;
const POLITE_END = /요[?？.!…~\s]*$/;

/** 인물에게 하는 말이 아니라 이야기 배경을 묻는 질문("크롬웰이 뭐야?", "저 남자 누구야?"). */
export function isLoreQuestion(text: string, lore: Lore): boolean {
  const t = text.trim();
  if (ADDRESS.test(t)) return false;
  // "왜 변장했어?"는 여우에게 묻는 말이고, "왜 죽여요?"나 "왜 여기 있어?"는 앞사람에게 하는 말이다.
  if (ASK_WHY.test(t) && !POLITE_END.test(t) && lore.knowledge.some((n) => n.tier !== 'hidden' && n.kind !== '장소' && n.keys.some((k) => mentions(t, k)))) return true;
  if (!ASK_WORDS.test(t)) return false;
  return ASK_PLACE.test(t) || lore.knowledge.some((n) => n.tier !== 'hidden' && n.keys.some((k) => mentions(t, k)));
}

export function ruleInterpret(free: FreeSpec, text: string, items: readonly string[], lore: Lore): RuleReading {
  for (const group of RATING_GROUPS) {
    const hit = lore.forbidden[group].find((term) => mentions(text, term));
    if (hit) return { kind: 'deflect', reason: `${group}: ${hit}` };
  }
  if (lore.forbidden.modern.some((term) => mentions(text, term))) return { kind: 'improv', absurd: true };
  if (isNoise(text)) return { kind: 'talk' };
  if (isLoreQuestion(text, lore)) return { kind: 'ask', why: ASK_WHY.test(text.trim()) };
  let best: { id: string; score: number; item: string | null } | null = null;
  for (const approach of free.approaches) {
    if (approach.item !== undefined && !items.includes(approach.item)) continue;
    const score = approach.keywords.reduce((n, k) => n + (mentions(text, k) ? 1 : 0), 0);
    if (score > 0 && (best === null || score > best.score)) best = { id: approach.id, score, item: approach.item ?? null };
  }
  if (best) return { kind: 'approach', approach: best.id, item: best.item, score: best.score };
  if (QUESTION.test(text.trim())) return { kind: 'talk' };
  return ACTION_ENDING.test(text.trim()) ? { kind: 'improv', absurd: false } : { kind: 'talk' };
}
