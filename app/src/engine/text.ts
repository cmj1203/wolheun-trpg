const HANGUL_BASE = 0xac00;
const JONG_NIEUN = 4;
const WILL = /(볼게|할게|할래|갈게|갈래|볼래)$/u;
const ASK_HINT = /(뭐야|뭔데|뭐지|누구야|누구지|누군데|어디야|어디지|어딘데)|(^|\s)왜\s/u;

/** 문장이 현재형("~는다", "~ㄴ다")으로 끝나는가. */
export function isPresentTense(sentence: string): boolean {
  const chars = [...sentence];
  if (chars.at(-1) !== '다' || chars.length < 2) return false;
  const prev = chars.at(-2) ?? '';
  if (prev === '는') return true;
  const code = prev.charCodeAt(0) - HANGUL_BASE;
  return code >= 0 && code < 11172 && code % 28 === JONG_NIEUN;
}

export const isQuestionText = (text: string): boolean => /[?？]\s*$/u.test(text) || ASK_HINT.test(text);

/** 마지막 문장이 행동을 적은 말인가("던진다", "말 걸어본다", "해 볼게"). 질문은 행동이 아니다. */
export function isActionText(text: string): boolean {
  if (/[?？]\s*$/u.test(text)) return false;
  const last = text.split(/[.!?？…~]+/u).map((s) => s.trim()).filter(Boolean).at(-1) ?? '';
  return isPresentTense(last) || WILL.test(last);
}

const QUESTION_MARK = /[?？]\s*$/u;
const QUESTION_WORD = /(^|\s)(뭐|뭘|왜|어디|누구|언제|어떻게|무슨)/u;
const SPOKEN_ENDING = /(요|줘)[.!…~\s]*$/u;
const POLITE_ENDING = /요[?？.!…~\s]*$/u;
const ABOUT_SELF = /(^|\s)(내|내가|나|난|나는)\s/u;
const SYLLABLE = /[가-힣]/u;

/** 완성된 글자가 없는 입력(?, ㅋㅋㅋ, ㅁㄴㅇㄹ). 뜻을 읽을 수 없으니 모델에 넘기지 않는다. */
export const isNoise = (text: string): boolean => !SYLLABLE.test(text);

/** 존댓말로 끝나는 문장인가. 앞사람에게 건넨 말로 본다. */
export const isPolite = (text: string): boolean => POLITE_ENDING.test(text);

/** 플레이어가 자기 자신을 가리키는 문장인가("내 머리 색이 뭐야?"). */
export const isAboutSelf = (text: string): boolean => ABOUT_SELF.test(text);

/** 한글과 숫자만 남긴 글. 줄이 같은 말인지 맞출 때 쓴다. */
export const normalizeKo = (s: string): string => s.replace(/[^\p{Script=Hangul}\p{N}]/gu, '');

/** 플레이어가 먼저 한 행동(deed)이 원작 줄과 같은 일을 그린 것으로 보는 공통 글자 수. 어미("었다")만 같은 줄은 넣지 않게 세 글자보다 길다. */
export const PREEMPT_MIN = 4;

/** 정규화한 원작 줄이 플레이어가 먼저 한 행동과 같은 일인가. */
export function preemptedBy(lineNorm: string, deed: string | undefined): boolean {
  if (!deed) return false;
  const d = normalizeKo(deed);
  return d.length >= PREEMPT_MIN && longestCommon(lineNorm, d) >= PREEMPT_MIN;
}

/** 두 글에서 가장 길게 이어지는 공통 글자 수. */
export function longestCommon(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let row: number[] = new Array<number>(y.length + 1).fill(0);
  let best = 0;
  for (const cx of x) {
    const next = new Array<number>(y.length + 1).fill(0);
    y.forEach((cy, j) => {
      if (cx !== cy) return;
      const run = (row[j] ?? 0) + 1;
      next[j + 1] = run;
      best = Math.max(best, run);
    });
    row = next;
  }
  return best;
}

/** 답을 구하는 꼴의 문장인가. */
export const isAsking = (text: string): boolean => QUESTION_MARK.test(text) || QUESTION_WORD.test(text);

/** 물음표와 의문사를 함께 쓴, 행동으로 읽을 수 없는 물음인가("뭐 들었어?"). "던져 볼까?"는 아니다. */
export const isPlainQuestion = (text: string): boolean => QUESTION_MARK.test(text) && QUESTION_WORD.test(text);

/** 상대에게 직접 말하는 투로 끝나는 문장인가("도와주세요!", "좀 떨어져요"). */
export const isSpokenText = (text: string): boolean => SPOKEN_ENDING.test(text) && !isActionText(text);

/** 질문과 행동이 섞인 입력("저 사람들 누구지? 일단 말 걸어본다")을 나눈다. 섞이지 않았으면 null. */
export function splitMixed(text: string): { ask: string; act: string } | null {
  const parts = text.split(/(?<=[?？.!…,])\s+/u).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const ask = parts.find(isQuestionText);
  const act = parts.findLast((p) => p !== ask && isActionText(p));
  return ask && act ? { ask, act } : null;
}
