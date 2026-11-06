import type { FreeSpec } from '../engine/types.ts';
import type { Lore } from './lore.ts';
import { assertedSpeech, isActionText, isAsking, isNoAttempt, isNoise, readInput } from '../engine/text.ts';
import { forbiddenIn, mentions, ratingIn } from './validate.ts';

export type RuleReading =
  | { kind: 'approach'; approach: string; item: string | null; score: number; spoken: boolean }
  | { kind: 'talk' }
  /** why: 이유를 묻는 말. 아는 것 안에 답이 있는지 LLM 이 가른다. */
  | { kind: 'ask'; why: boolean }
  | { kind: 'deflect'; reason: string }
  | { kind: 'improv'; absurd: boolean }
  /** 아무것도 시도하지 않는 입력. 판정 없이 장면이 흘러간다. */
  | { kind: 'idle' };

/** 가진 소지품을 쓰는 행동의 키워드가 이만큼 맞으면 LLM 보다 규칙 해석을 따른다. */
export const ITEM_RULE_MIN_SCORE = 2;

const QUESTION = /[?？]|^(누구|뭐|왜|어디|무슨|어떻게|당신|이름|여긴|여기)/;
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

/** 접근법 낱말 맞춤. 띄어 쓴 낱말만 띄어쓰기를 무시하고 맞춘다. 붙여 쓴 낱말이 어절을 넘어 맞으면 안 된다("계신 분들"의 "신분"). */
const keywordIn = (text: string, keyword: string): boolean => (/\s/.test(keyword.trim()) ? mentions(text, keyword) : text.includes(keyword.trim()));

export function ruleInterpret(free: FreeSpec, text: string, items: readonly string[], lore: Lore): RuleReading {
  for (const group of RATING_GROUPS) {
    // 등급 낱말은 띄어 써 피하는 일이 흔해 띄어쓰기를 무시하되, "자, 해 볼까" 같은 우연은 빼고 본다.
    const hit = lore.forbidden[group].find((term) => ratingIn(text, term));
    if (hit) return { kind: 'deflect', reason: `${group}: ${hit}` };
  }
  if (lore.forbidden.modern.some((term) => forbiddenIn(text, term))) return { kind: 'improv', absurd: true };
  if (isNoise(text)) return { kind: 'talk' };
  if (isLoreQuestion(text, lore)) return { kind: 'ask', why: ASK_WHY.test(text.trim()) };
  const spoken = readInput(text).kind === 'speech';
  if (readInput(text).kind === 'self' && !isNoAttempt(text) && !assertedSpeech(text)) return { kind: 'talk' };
  const idle = !spoken && isNoAttempt(text);
  // 명사만 일치하는 부정문은 그 신분이나 행동을 주장한 근거가 아니다.
  const claimed = text.split(/[.!?？\n]+/u).filter((clause) => !/(아니(?:에요|예요|야|다|라)|(?:라|다)고\s*말하지\s*않)/u.test(clause)).join(' ');
  let best: { id: string; score: number; item: string | null } | null = null;
  for (const approach of free.approaches) {
    if (approach.item !== undefined && !items.includes(approach.item)) continue;
    // 그대로 있는 말은 접근법 낱말이 들어 있어도("안 피한다") 그 접근이 아니다. 하지 않는 것 자체가 접근법인 낱말("말하지 않")만 맞춘다.
    const score = approach.keywords.reduce((n, k) => n + (keywordIn(claimed, k) && (!idle || k.includes('않')) ? 1 : 0), 0);
    if (score > 0 && (best === null || score > best.score)) best = { id: approach.id, score, item: approach.item ?? null };
  }
  // 낱말 하나만 맞은 물음은 그 접근을 하겠다는 말이 아니다("불러오기 하면 사라져?", "…처럼 보여요?").
  if (best && !(isAsking(text) && (best.score === 1 || /(?:인가|입니까|일까)/u.test(text)))) return { kind: 'approach', approach: best.id, item: best.item, score: best.score, spoken };
  if (idle) return { kind: 'idle' };
  if (spoken) return { kind: 'talk' };
  if (QUESTION.test(text.trim())) return { kind: 'talk' };
  return isActionText(text.trim()) ? { kind: 'improv', absurd: false } : { kind: 'talk' };
}
