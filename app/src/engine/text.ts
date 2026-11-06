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

/** 실제로 상대에게 긍정해 말한 절만 남긴다. 행동과 함께 적은 발화도 별도 사건이다. */
export function assertedSpeech(text: string, spoken = false): string {
  return text.split(/(?<=[.!?？])\s*|\n+/u).map((s) => s.trim()).filter((clause) => {
    if (!clause || (isQuestionText(clause) && !spoken)) return false;
    // 부정의 서술어와 무발화·간접 인용은 그 안의 명사를 주장한 것이 아니다.
    if (/(아니(?:에|예|야|다|라|고|었)|지\s*않|지\s*못|(?:^|\s)안\s|(?:라|다)고\s*(?:들었|했었|생각|적혀|쓰여|말했))/u.test(clause)) return false;
    const form = readInput(clause).kind;
    const declaration = /^(난|나는|전|저는|내가|제가)\s+.+(?:이다|다|예요|에요|입니다|야)(?:\s+하고\s|[.!]*$)/u.test(clause);
    return form === 'speech' || declaration || (spoken && !['self', 'refrain', 'noise'].includes(form) && !isActionText(clause));
  }).join(' ');
}

/** 부정·질문·내적 독백은 공개가 아니다. 공개하겠다는 행동 서술도 별도 사건으로 받는다. */
export function discloses(text: string, words: readonly string[]): boolean {
  return text.split(/(?<=[.!?？])\s*|\n+/u).some((clause) => {
    if (isQuestionText(clause) || /(?:아니(?:에|예|야|다|라)|지\s*않|지\s*못|(?:^|\s)안\s)/u.test(clause)) return false;
    const kind = readInput(clause).kind;
    const disclosureAction = kind === 'action' && words.some((w) => /[을를]\s+\S/u.test(w) && clause.includes(w));
    return words.some((w) => clause.includes(w)) && (assertedSpeech(clause).length > 0 || disclosureAction);
  });
}

/** 마지막 문장이 행동을 적은 말인가("던진다", "말 걸어본다", "해 볼게"). 질문은 행동이 아니다. */
export function isActionText(text: string): boolean {
  if (/[?？]\s*$/u.test(text)) return false;
  const last = text.split(/[.!?？…~]+/u).map((s) => s.trim()).filter(Boolean).at(-1) ?? '';
  return isPresentTense(last) || WILL.test(last);
}

// 무언가 하려는 말 없이 그대로 있다는 서술. 몸을 움직여 시도하는 말(다가간다, 피한다)과 나누는 것은 문장의 꼴이다.
const STAY_MANNER = '(가만히|그냥|멍하니|멍하게|우두커니|꼼짝|잠자코|묵묵히|넋 ?놓고)';
const NO_ATTEMPT = [
  /^아무.*(안|않|못)\s?\S*$/u, // 아무 말도 안 한다
  /(^|[^숨])([서어아여려칰워]|그대로|가만히|멍하니|우두커니)\s*있(다|는다|어|을게|음)$/u, // 그냥 서 있다, 얼어붙어 있다. 숨어 있다는 시도다.
  new RegExp(`^${STAY_MANNER}.*(본다|보고 있|기다린다|선다|앉는다|눕는다|멈춘다|맞는다|둔다)$`, 'u'), // 멍하니 본다
  /^(\S+\s)?(기다린다|지켜본다)$/u,
  /눈(을|만)?\s*(꼭|질끈)?\s*감(는다|을게|음)$/u, // 눈만 감는다
  /(보|듣|서|있)기만 (한다|할게)$/u,
  /\S+만\s*(\S*[다라])?본다$/u, // 발끝만 내려다본다, 하늘만 쳐다본다
  /(포기|체념)(한다|할게|함)$/u,
];
// 안 피한다, 피하지 않는다. 멈추지 않는다, 포기하지 않는다처럼 계속 하겠다는 말은 시도다.
const NEGATED_ACT = /(\S+지 않(는다|을게|음)|(^|\s)안 \S*(는다|한다|인다|친다|간다|본다))$/u;
const KEEPS_TRYING = /(포기하|멈추|그만두|물러서|굴하|지)지 않/u;

// 동작을 잇는 문장은 몸짓 하나로 끝나지 않는다(눌러쓰고 걸어간다, 앉아 기다린다). '다물고 있다'처럼 그대로 있는 꼴로 끝나면 이어진 동작이 아니다.
// 앞 동사를 돕기만 하는 말(굳어 버린다, 숨어 본다)은 동작을 잇지 않는다.
const ACT_LINK = /(?<=(?:고|며|서|[아어여혀려]))\s+(?!(?:버린다|버렸다|본다|둔다|놓는다|낸다)(?:\s|$))/u;
const ENDS_STAYING = /있(다|는다|어|음)$/u;

/** 문장을 잇는 말로 나눈 동작들. */
export function actClauses(text: string): string[] {
  return text.trim().split(ACT_LINK).filter(Boolean);
}

/**
 * '반항하지 않고'처럼 하지 않는다고 적은 동작인가. '포기하지 않고'는 계속 하겠다는 말이라 아니다.
 * '칼을 받아들인다'는 모델이 어떤 규칙 문구로 물어도 칼을 쥐는 것으로 읽어 꼴로 뺀다(docs/lead_check34/input_kinds.md).
 */
export const isRefusedClause = (clause: string): boolean => (/(지 않고|없이)$/u.test(clause) && !KEEPS_TRYING.test(clause)) || /받아들(인다|이고|여)/u.test(clause);

/** 동작을 둘 이상 이은 문장인가. */
export function isLinkedAct(text: string): boolean {
  return actClauses(text).length > 1 && !ENDS_STAYING.test(text.trim());
}

/** 아시나가 아무것도 시도하지 않는다는 입력인가. 물음과 상대에게 건넨 말은 아니다. */
export function isNoAttempt(text: string): boolean {
  const t = text.trim();
  if (/[?？]\s*$/u.test(t) || SPOKEN_ENDING.test(t)) return false;
  const last = t.split(/[.!?？…~]+/u).map((s) => s.trim()).filter(Boolean).at(-1) ?? '';
  // 목적어를 대상으로 한 시도가 아니라, 각 절의 주어에 생긴 피동·상태 변화다.
  // "입 안이 마르고 숨이 막힌다"를 현재형 동작 어미라는 이유만으로 시도로 읽지 않는다.
  const clauses = actClauses(last);
  const passiveState = /[힌린긴인진된]다$/u.test(last) && clauses.every(clause => {
    const subjects = [...clause.matchAll(/(?:^|\s)(\S+[이가])(?=\s)/gu)].map(m => m[1]);
    return subjects.length > 0
      && subjects.every(subject => !/^(내가|제가|네가|니가|그가)$/u.test(subject ?? ''))
      && !/(?:^|\s)\S+[을를](?:\s|$)/u.test(clause)
      && !/(?:려고|려\s|기\s*위해|일부러|스스로)/u.test(clause);
  });
  if (passiveState) return true;
  return NO_ATTEMPT.some((p) => p.test(last)) || (NEGATED_ACT.test(last) && !KEEPS_TRYING.test(last));
}

const QUESTION_MARK = /[?？]\s*$/u;
const QUESTION_WORD = /(^|\s)(뭐|뭘|왜|어디|누구|언제|어떻게|무슨)/u;
const SPOKEN_ENDING = /(요|줘)[.!…~\s]*$/u;
const POLITE_ENDING = /요[?？.!…~\s]*$/u;
// 조사로 띄어 쓴 '내가 ...'와, 문장 끝에서 서술어가 된 '범인이 나야?'를 함께 본다.
const ABOUT_SELF = /(^|\s)(내|내가|나|난|나는)\s|(^|\s)나(야|냐|니|라고|였|인가)[^\s]*$/u;
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
/** 물음표를 직접 찍은 말. 답을 바라지 않는 혼잣말에는 잘 찍지 않는다. */
export const hasQuestionMark = (text: string): boolean => QUESTION_MARK.test(text);
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

// ───────────────────────────── 입력 종류 읽기(문장 구조) ─────────────────────────────
// 낱말 목록으로 뜻을 맞히지 않고 한국어 문장의 꼴로 입력 종류를 가른다.
//   1. 마지막 서술어의 어미(말 높이·서법): 현재 서술 "-ㄴ다/-는다", 다짐 "-ㄹ게/-ㄹ래/-자", 해요체 "-요", 합쇼체 "-ㅂ니다",
//      물음 "-냐/-니/-나요/-ㄹ까요", 자문 "-지/-나/-ㄹ까/-ㄹ걸", 그 밖의 해체·해라체.
//   2. 듣는 이 표지: 2인칭 대명사, 호칭(부르는 말·"-님/-씨/분"), 듣는 이를 높이는 "-시-", 자기를 낮추는 "저/제가/여쭙-",
//      시키는 "-어 줘", 막는 "-지 마", 듣는 이에게 기대는 "-잖아/-거든".
//   3. 부정의 범위: 마지막 서술어가 "안/못 ~", "-지 않-", "-지 말-", "-다(가) 말-" 이면 하려던 일을 하지 않는 것이다.
//   4. 물음의 방향: 듣는 이 표지가 없는 물음은 이야기 속 사람이 아니라 진행자에게 묻는 말이다. 답을 바라지 않는
//      반어("~는 거 아니야?")와 물음표 없는 자문은 혼잣말이다.
//   5. 이 세계 밖: 로마자, 자모만 쓴 웃음(ㅋㅋ), 화면을 가리키는 "이거", 채팅체 명사 끝("-는 중", "-함/-음").
//      세계에 없는 물건 이름은 낱말 목록 없이는 알 수 없으므로 부르는 쪽이 가진 목록(lore.forbidden.modern)을 넘긴다.
// 문장의 꼴만 보므로 "출근하기 싫다"처럼 낱말 뜻으로만 세계 밖임을 아는 말은 혼잣말로 읽는다.

/** 입력 종류. action 행동 · speech 인물에게 건넨 말 · self 혼잣말 · question 게임(진행자)에게 묻는 말 ·
 * outside 이 세계 밖의 말이나 물건 · refrain 하려던 일을 하지 않음 · noise 읽을 글자가 없음. */
export type InputKind = 'action' | 'speech' | 'self' | 'question' | 'outside' | 'refrain' | 'noise';

/** 마지막 서술어의 꼴. */
export type PredicateForm =
  | 'narrative' // 현재 서술 "-ㄴ다/-는다"(아시나가 하는 일을 적은 글)
  | 'volitional' // 다짐·제안 "-ㄹ게/-ㄹ래/-자/-아 볼까"
  | 'formal' // 합쇼체 "-ㅂ니다/-ㅂ니까/-십시오"
  | 'polite' // 해요체 "-요/-죠"
  | 'asking' // 해라체 물음 "-냐/-니"
  | 'musing' // 자문 "-지/-나/-ㄹ까/-ㄹ걸/-더라"
  | 'background' // "-는데/-ㄴ데"
  | 'declarative' // "-다"(현재 서술이 아닌 것: 형용사·과거·"-겠다"·"-이다")
  | 'imperative' // 해라체 시킴 "-아라/-어라"
  | 'nominal' // 명사로 끝남 "-는 중/-함/-음"
  | 'other'; // 해체 "-어/-아/-야" 와 조각

export interface InputReading {
  kind: InputKind;
  /** 마지막 문장의 서술어 꼴. */
  form: PredicateForm;
  /** 물음 꼴인가(물음표 또는 물음 어미). */
  asking: boolean;
  /** outside 일 때 무엇이 세계 밖인가: thing 없는 물건·힘을 쓰려는 행동 / talk 플레이어 쪽 잡담. */
  outside?: 'thing' | 'talk';
  /** 판단에 쓴 문장 표지(시험과 기록용). */
  cues: string[];
}

export interface ReadInputOptions {
  /** 플레이어 인물의 이름. 제 이름을 부르는 말("정신 차려 아시나")은 혼잣말이다. */
  selfNames?: readonly string[];
  /** 이 장면에 있는 인물의 이름이나 부르는 말. 부르면 그 사람에게 건넨 말이다. */
  names?: readonly string[];
  /** 이 세계에 없는 물건·힘의 이름(로어의 금지 목록을 그대로 넘긴다). */
  outsideWords?: readonly string[];
}

const JONG_RIEUL = 8;
const JONG_BIEUP = 17;

/** 완성된 한글 한 글자의 받침 번호. 받침이 없거나 한글이 아니면 0. */
function jongOf(ch: string | undefined): number {
  if (!ch) return 0;
  const code = ch.charCodeAt(0) - HANGUL_BASE;
  return code >= 0 && code < 11172 ? code % 28 : 0;
}

/** 완성된 한글 한 글자의 홀소리 번호(ㅏ=0, ㅐ=1, ㅓ=4, ㅕ=6, ㅘ=9, ㅙ=10, ㅝ=14, ㅞ=15). 한글이 아니면 -1. */
function jungOf(ch: string | undefined): number {
  if (!ch) return -1;
  const code = ch.charCodeAt(0) - HANGUL_BASE;
  return code >= 0 && code < 11172 ? Math.floor((code % 588) / 28) : -1;
}

/** 어절 앞뒤의 문장부호·자모·기호를 떼어 낸다. */
const bare = (w: string): string => w.replace(/^[^\p{Script=Hangul}\p{L}\p{N}]+|[^가-힣\p{L}\p{N}]+$/gu, '').replace(/[ㄱ-ㅎㅏ-ㅣ]+$/u, '');

interface Sentence {
  words: string[];
  /** 문장 끝 부호("?", "!", "…" 따위). */
  end: string;
  /** 쉼표로 나눈 조각(호칭을 찾는 데 쓴다). */
  chunks: string[][];
}

function sentencesOf(text: string): Sentence[] {
  const out: Sentence[] = [];
  for (const m of text.matchAll(/([^.!?？！…~\n]+)([.!?？！…~\n]*)/gu)) {
    const body = m[1] ?? '';
    const chunks = body.split(/[,，]/u).map((c) => c.split(/\s+/u).map(bare).filter(Boolean)).filter((c) => c.length > 0);
    const words = chunks.flat();
    if (words.length === 0) continue;
    out.push({ words, end: m[2] ?? '', chunks });
  }
  return out;
}

const WH = /^(누구|누가|누군|뭐|뭘|뭔|무엇|무슨|어디|언제|왜|어떻게|어떤|어때|얼마|몇)/u;
/** 2인칭 대명사. "너무"처럼 "너"로 시작하는 다른 낱말은 넣지 않는다. "그쪽으로/그쪽에"는 방향이다. */
const SECOND_PERSON = /^(너|넌|널|너희.*|너[는를도랑만가의]|너한테|너에게|너보고|네가|니가|네게|당신.*|그쪽(?!으로|에|로|을|를).*|자네.*|그대|그대[는가를의도여]|그대에게|귀하.*|댁[은이도]?)$/u;
/** 1인칭(해체·해라체). */
const FIRST_PLAIN = /^(나|난|날|내|내가|나를|나는|나도|나한테|나보고)$/u;
/** 자기를 낮추는 1인칭. 해요체·합쇼체와 함께 쓰일 때만 본다(지시어 "저"와 꼴이 같다). */
const FIRST_HUMBLE = /^(저|제가|저를|저는|저도|저한테|제|저희.*)$/u;
/** 자기를 낮추는 서술어(여쭙다·드리다·뵙다). */
const HUMBLE_VERB = /(여쭈|여쭤|여쭙|드리|드릴|드려|드립|뵙|뵐|뵈)/u;
/** 듣는 이(주어)를 높이는 "-시-"가 어미 자리에 있는 낱말. 낱말 첫 글자는 보지 않는다("시간", "신발").
 * "-시는"(도시는), 낱말 속 "시"(메시지), 홀로 끝나는 "실"(사실)은 넣지 않는다. "주실 수"는 따로 본다. */
const HEARER_HONORIFIC = /.(세요|셔요|셨어요|셨나요|셨죠|십시오|십니다|십니까|시죠|시지요|시고|시면|시며|시네요|시겠어요|시겠습니다|신가요|신지|신데|실까요|실래요|실게요)$|^계[시신셔세]/u;
/** 사람을 부르는 말로만 쓰이는 낱말(부름말). 조각 맨 앞에 혼자 올 때만 본다. */
const CALL_WORD = /^(어이|이봐|이봐요|저기요|여보세요|여보|헤이|야|여기요|거기요)$/u;
/** 부르는 말이 될 수 있는 장소 지시어. 쉼표나 느낌표로 홀로 끊길 때만 부름으로 본다("거기, 잠깐!"). */
const CALL_PLACE = /^(거기|저기|여기)$/u;
/** 높임 호칭 꼴("아저씨", "선생님", "세 분"). */
const TITLE = /^((?!하느님|하나님)[가-힣]+님|[가-힣]{2,}씨|분|분들)$/u;
/** 신이나 없는 이를 부르는 말("신이시여"). 앞사람에게 건넨 말이 아니다. */
const INVOCATION = /[가-힣](이시여|시여|이여)$/u;

/** 하오체 "-소/-오"("있소", "하시오"). 이야기 속 사람을 대접하는 옛 말투라 진행자에게 묻는 말에는 쓰지 않는다. */
function isHao(last: string): boolean {
  const chars = [...last];
  return (chars.at(-1) === '소' && chars.length >= 2 && [20, 18].includes(jongOf(chars.at(-2)))) || /(시오|하오)$/u.test(last);
}

/** 마지막 어절(과 그 앞 어절)로 서술어 꼴을 정한다. */
function formOf(last: string, prev: string | undefined): PredicateForm {
  const chars = [...last];
  const end = chars.at(-1) ?? '';
  const before = chars.at(-2);
  if (/(니다|니까)$/u.test(last) && jongOf(chars.at(-3)) === JONG_BIEUP) return 'formal';
  if (/십시오$/u.test(last)) return 'formal';
  if (isHao(last)) return 'formal';
  if (end === '요' || end === '죠') return 'polite';
  if (end === '다' && isPresentTense(last)) return 'narrative';
  if ((end === '게' || end === '래') && jongOf(before) === JONG_RIEUL && !/길래$/u.test(last)) return 'volitional';
  // 띄어 쓴 "할 게", "갈 래".
  if ((last === '게' || last === '래') && jongOf([...(prev ?? '')].at(-1)) === JONG_RIEUL) return 'volitional';
  if (/볼까$/u.test(last)) return 'volitional';
  // 청유 "-자"("도망가자"). "웬 상자", "이 남자"처럼 꾸밈말 뒤의 명사는 넣지 않는다.
  // 앞 낱말이 매김꼴(받침 ㄴ·ㄹ: "칼 든 남자", "수상한 남자")이거나 낱말 하나뿐이면("남자") 명사로 본다.
  const prevEnd = [...(prev ?? '')].at(-1);
  if (end === '자' && chars.length >= 2 && prev !== undefined && !/^(웬|저|이|그|그런|이런|저런|무슨|어떤)$/u.test(prev) && ![JONG_NIEUN, JONG_RIEUL].includes(jongOf(prevEnd))) return 'volitional';
  if (end === '자' && chars.length >= 3 && prev === undefined) return 'volitional';
  if (end === '다') return 'declarative';
  // 해라체 시킴 "-아라/-어라"("비켜라", "가라"). "-라고"는 마지막 글자가 다르다.
  if (end === '라' && chars.length >= 2 && jongOf(before) === 0 && [0, 4, 6, 1, 9, 14, 10, 15].includes(jungOf(before))) return 'imperative';
  if (end === '냐' || (end === '니' && chars.length >= 2)) return 'asking';
  if (end === '데') return 'background';
  if (last === '중' && prev !== undefined && jongOf([...prev].at(-1)) === JONG_NIEUN) return 'nominal';
  // 채팅체 명사 끝 "-함/-임/-됨", "있음/없음/했음"(받침 ㅄ·ㅆ 뒤의 "음"만 본다. "얼음", "웃음"은 명사다).
  if (/^[가-힣]+(함|임|됨)$/u.test(last) || (end === '음' && [18, 20].includes(jongOf(before)))) return 'nominal';
  if (/^(함|됨)$/u.test(last) && /^(안|못)$/u.test(prev ?? '')) return 'nominal';
  if (end === '지' || end === '나' || end === '걸' || /더라$/u.test(last) || (end === '까' && jongOf(before) === JONG_RIEUL)) return 'musing';
  if (end === '까' && chars.length === 1 && prev && jongOf([...prev].at(-1)) === JONG_RIEUL) return 'musing';
  return 'other';
}

/** 마지막 서술어가 부정인가: "안 한다", "잡지 않는다", "하지 말자", "던지려다 만다", "안할래". */
function negatedPredicate(words: readonly string[]): boolean {
  const last = words.at(-1) ?? '';
  const prev = words.at(-2) ?? '';
  // "안 된다/안 돼"는 하지 않는 일이 아니라 안 된다는 판단이다.
  if ((prev === '안' || prev === '못') && !/^(되|된|될|돼|됐)/u.test(last)) return true;
  // 하던 일을 멈추는 "그만 ~하다/두다".
  if ((prev === '그만' && /^(하|한|할|해|두|둔|둘|둬)/u.test(last)) || /^그만(하|한|할|해|두|둔|둘|둬)/u.test(last)) return true;
  if (/^(않|못하|못한|못할|못해)/u.test(last) && /지$/u.test(prev)) return true;
  // 보조 용언 "말다"("하지 말자", "던지려다 만다"). "다 말한다", "말리다"는 아니다.
  if (/^(만다|말자|말래|말까|말아|말았|맙|말기로|말게|마$|마라$)/u.test(last) && /(지|다|다가)$/u.test(prev)) return true;
  if (/지(않|못하|말)/u.test(last)) return true;
  // 붙여 쓴 "안한다/안할래/안간다". "안내한다", "안긴다", "안는다"는 낱말이 "안"으로 시작할 뿐이다.
  return /^안(하|한|할|해|함|가|간|갈)/u.test(last);
}

/** 답을 바라지 않는 반어 꼬리("~는 거 아니야?", "~겠지"). */
function rhetoricalTail(words: readonly string[]): boolean {
  const last = words.at(-1) ?? '';
  const prev = words.at(-2) ?? '';
  return /^(아니야|아냐|아닐까|아니지|아니겠지|아니냐)$/u.test(last) && /(거|것|게|건)$/u.test(prev);
}

/** "저"가 지시어("저 여행자들은", "저 사람 누구예요?")인가. */
function demonstrative(words: readonly string[], w: string): boolean {
  if (w !== '저') return false;
  const next = words[words.indexOf(w) + 1] ?? '';
  // 뒤 낱말이 서술어("저 아세요?")가 아니면 지시어로 본다. 낮춤 "저"는 존댓말 물음을 앞사람에게 한 말로 가르는 데만 쓰인다.
  return next !== '' && formOf(next, '저') === 'other';
}

/** 문장에서 듣는 이를 가리키는 표지를 찾는다. */
function addresseeCues(sentences: readonly Sentence[], formal: boolean, opts: ReadInputOptions): string[] {
  const cues: string[] = [];
  const names = opts.names ?? [];
  for (const s of sentences) {
    for (const w of s.words) {
      if (SECOND_PERSON.test(w)) cues.push(`2인칭:${w}`);
      // 매김말 "네/니"("네 이름이 뭐야?"). 대답 "네"와 갈라 뒤에 낱말이 있을 때만 본다.
      else if (/^(네|니)$/u.test(w) && s.words.indexOf(w) < s.words.length - 1 && s.words.length >= 3) cues.push(`2인칭:${w}`);
      if (formal && FIRST_HUMBLE.test(w) && !demonstrative(s.words, w)) cues.push(`낮춤:${w}`);
      if (formal && HUMBLE_VERB.test(w)) cues.push(`낮춤말:${w}`);
      if (formal && HEARER_HONORIFIC.test(w) && !INVOCATION.test(w)) cues.push(`높임:${w}`);
      else if (formal && ((/.실$/u.test(w) && s.words[s.words.indexOf(w) + 1] === '수') || /.실수$/u.test(w))) cues.push(`높임:${w} 수`);
      if (names.some((n) => w.startsWith(n))) cues.push(`이름:${w}`);
    }
    s.chunks.forEach((chunk, i) => {
      const first = chunk[0] ?? '';
      const lastWord = chunk.at(-1) ?? '';
      // 쉼표로 앞뒤가 끊긴 조각(앞에 오든 "괜찮아, 아저씨"처럼 뒤에 오든)이거나 느낌표로 끝난 문장 하나가 통째로 부르는 말인가.
      const alone = s.chunks.length > 1 || s.words.length === 1 || /[!！~?？…]/u.test(s.end);
      if (CALL_WORD.test(first)) cues.push(`부름:${first}`);
      else if (i === 0 && TITLE.test(first) && !/^분/u.test(first) && chunk.length > 1) cues.push(`호칭:${first}`);
      else if (alone && chunk.length <= 3 && (TITLE.test(lastWord) || (chunk.length === 1 && CALL_PLACE.test(first)))) cues.push(`호칭:${chunk.join(' ')}`);
    });
  }
  return cues;
}

/** 문장 하나의 서술어 꼴. 끝에 붙은 호칭("~할게요 나리")은 건너뛰고 그 앞 서술어를 본다. */
function sentenceForm(words: readonly string[]): { form: PredicateForm; last: string; trailing?: string } {
  const last = words.at(-1) ?? '';
  const form = formOf(last, words.at(-2));
  const prev = words.at(-2);
  // "-ㄹ 거야/거다/겁니다"는 앞으로 할 일을 밝히는 다짐이다("말 안 할 거야").
  if (/^(거야|거다|거예요|겁니다)$/u.test(last) && prev !== undefined && jongOf([...prev].at(-1)) === JONG_RIEUL) return { form: 'volitional', last };
  if (form === 'other' && prev !== undefined) {
    const before = formOf(prev, words.at(-3));
    if (before === 'polite' || before === 'formal') return { form: before, last: prev, trailing: last };
  }
  return { form, last };
}

/** 하려다 그만둔 일: "-려다(가)", "-려고 … -다가", "-ㄹ까 하다가", "-지 않기로". */
function abandoned(words: readonly string[]): boolean {
  if (words.some((w) => /려다(가)?$/u.test(w))) return true;
  if (words.some((w) => /^(않기로|말기로)$/u.test(w) || /지(않기로|말기로)$/u.test(w))) return true;
  const i = words.findIndex((w) => /려고$/u.test(w));
  if (i >= 0 && words.slice(i + 1, -1).some((w) => /다가?$/u.test(w) && !/^[가-힣]?다$/u.test(w))) return true;
  return words.some((w, k) => /[가-힣]까$/u.test(w) && jongOf([...w].at(-2)) === JONG_RIEUL && /^하다가?$/u.test(words[k + 1] ?? ''));
}

/** 같은 말만 되풀이한 주문 같은 말("침착하자 침착하자", "침착하자 아시나, 침착하자"). 다른 낱말이 끼면("도망가자, 빨리 도망가자") 아니다. */
function chanted(words: readonly string[], skip: readonly string[]): boolean {
  const stems = words.filter((w) => !skip.includes(w)).map((w) => [...w].slice(0, 2).join(''));
  if (stems.length < 2 || stems.length % 2 !== 0) return false;
  const half = stems.length / 2;
  return stems.slice(0, half).every((x, i) => x === stems[half + i]);
}

/** 입력 하나를 문장 꼴로 읽어 종류를 정한다. 엔진 상태를 보지 않는 순수 함수다. */
export function readInput(text: string, opts: ReadInputOptions = {}): InputReading {
  // 괄호 속 덧붙임("(진지)")은 글의 꼴을 정하지 않는다.
  const t = text.replace(/[(（][^()（）]*[)）]/gu, ' ').trim() || text.trim();
  if (/^(속으로|마음속으로|마음속에서)\s/u.test(t)) return { kind: 'self', form: 'other', asking: false, cues: ['내적독백'] };
  if (isNoise(t) && !/[A-Za-z]/u.test(t)) return { kind: 'noise', form: 'other', asking: false, cues: ['글자없음'] };
  const all = sentencesOf(t);
  // 물음 뒤에 붙인 한 낱말 꼬리("~되는 거야? 규칙상")는 앞 문장이 정한다.
  const tail = all.at(-1);
  // 서술어 꼴이 분명한 문장 뒤의 한 낱말 꼬리("칼을 뽑는다. 천천히.")도 같다. 대답 낱말과 호칭은 꼬리가 아니다.
  const prior = all.at(-2);
  const tailWord = tail?.words[0] ?? '';
  const tagged =
    prior !== undefined &&
    tail !== undefined &&
    tail.words.length === 1 &&
    !/[!！]/u.test(tail.end) &&
    formOf(tailWord, undefined) === 'other' &&
    !/^(네|예|응|아니|아뇨|그래)$/u.test(tailWord) &&
    !TITLE.test(tailWord) &&
    !CALL_WORD.test(tailWord) &&
    (/[?？]/u.test(prior.end) || ['narrative', 'volitional', 'polite', 'formal'].includes(sentenceForm(prior.words).form));
  const sentences = tagged ? all.slice(0, -1) : all;
  const lastSentence = sentences.at(-1);
  if (!lastSentence) return { kind: 'noise', form: 'other', asking: false, cues: ['글자없음'] };
  const words = lastSentence.words;
  const head = sentenceForm(words);
  const { form, last } = head;
  const chars = [...last];
  const cues: string[] = [`꼴:${form}`];
  if (head.trailing) cues.push(`뒤호칭:${head.trailing}`);
  const endMark = lastSentence.end;
  const qMark = /[?？]/u.test(endMark);
  const wh = words.some((w) => WH.test(w));
  const forms = sentences.map((s) => sentenceForm(s.words).form);
  const honored = forms.some((f) => f === 'polite' || f === 'formal');
  // 물음표 없는 물음: 해라체 "-냐/-니"는 느낌표나 의문사가 있어야 묻는 말이다("누구냐!"; "하필 걸리냐"는 탄식).
  // 존댓말·채팅체는 의문사가 있으면 묻는 말이다. 해체는 "몇/어디/언제/누구"와 "-야"가 함께일 때만 본다("무슨 날벼락이야"는 탄식).
  const asking =
    qMark ||
    (form === 'asking' && (wh || /[!！]/u.test(endMark))) ||
    (form === 'formal' && /니까$/u.test(last)) ||
    (form === 'polite' && ((/나요$/u.test(last) && jongOf(chars.at(-3)) !== 0) || (/가요$/u.test(last) && jongOf(chars.at(-3)) === JONG_NIEUN) || (/까요$/u.test(last) && jongOf(chars.at(-3)) === JONG_RIEUL) || wh)) ||
    (form === 'nominal' && wh) ||
    (form === 'other' && /야$/u.test(last) && words.some((w) => /^(몇|어디|언제|누구)/u.test(w)));
  const allWords = sentences.flatMap((s) => s.words);
  const selfNames = opts.selfNames ?? [];
  const outsideHit = (opts.outsideWords ?? []).find((w) => t.includes(w));
  const latin = /[A-Za-z]/u.test(t);
  const done = (kind: InputKind, extra: string[] = [], outside?: 'thing' | 'talk'): InputReading => ({
    kind,
    form,
    asking,
    ...(outside ? { outside } : {}),
    cues: [...cues, ...extra],
  });
  const addressed = addresseeCues(sentences, honored, opts);
  // 듣는 이 표지 가운데 행동 글에서도 말로 볼 것. "그쪽"은 행동 글에서 흔히 방향("그쪽 길로 간다")이라 뺀다.
  const callsSomeone = addressed.some((c) => (c.startsWith('2인칭') && !c.startsWith('2인칭:그쪽')) || c.startsWith('부름') || c.startsWith('호칭') || c.startsWith('이름'));
  const hearerMarked = callsSomeone || head.trailing !== undefined || addressed.some((c) => c.startsWith('높임') || c.startsWith('낮춤'));
  // 높임 다짐 "-ㄹ게요/-ㄹ래요"와 격조사가 붙은 낱말을 거느린 합쇼체 서술 "문을 엽니다"는 듣는 이 표지가 없으면 진행자에게 알리는 행동이다.
  // "감사합니다", "실례합니다"처럼 받는 말이 없는 합쇼체는 인사말로 본다.
  const politeWill = form === 'polite' && /(게|래)요$/u.test(last) && jongOf(chars.at(-3)) === JONG_RIEUL && !qMark;
  const formalDeed = form === 'formal' && /니다$/u.test(last) && words.slice(0, -1).some((w) => /[가-힣](을|를|으로|로|에|에서|에게|한테)$/u.test(w));
  // "-ㄹ래?/-ㄹ게?"는 듣는 이의 뜻을 묻는 말이다. "던져 볼까?"는 제 행동을 저울질하는 글이다.
  const offer = form === 'volitional' && qMark && /(래|게|거야|거예요|겁니다)$/u.test(last);
  // "-어 보인다"는 모습을 그리는 말이고, "안 된다"는 판단이다. 행동 글이 아니다.
  const judged = /^(안|못)$/u.test(words.at(-2) ?? '') && /^(되|된|될|돼|됐)/u.test(last);
  // 과거로 적은 서술("칼을 뽑았다")은 격조사를 거느리고 1인칭 주어가 없으면 아시나가 한 일이다. "배고팠다"처럼 받는 말이 없으면 느낌이다.
  const caseArg = words.slice(0, -1).some((w) => /[가-힣](을|를|으로|로|에게|한테)$/u.test(w));
  const past = (form === 'declarative' || form === 'other') && /[았었였했켰혔쳤졌웠왔]/u.test(chars.at(-2) ?? '') && /[다어]$/u.test(last);
  const pastDeed = past && caseArg && !allWords.some((w) => FIRST_PLAIN.test(w)) && !qMark;
  // 채팅체로 적은 행동("칼을 뽑음", "남자에게 다가감")도 격조사를 거느리면 행동이다.
  const nominalDeed = caseArg && !qMark && /[가-힣]$/u.test(last) && jongOf(chars.at(-1)) === 16 && form !== 'polite' && !wh;
  const isAct =
    (form === 'narrative' && !/^보인다$/u.test(last) && !judged) ||
    pastDeed ||
    (nominalDeed && (form === 'nominal' || form === 'other')) ||
    (form === 'volitional' && !honored && !offer) ||
    ((politeWill || formalDeed) && !hearerMarked && sentences.length === 1);
  if (offer) return done('speech', ['뜻을물음', ...addressed]);
  // 마지막 문장이 통째로 따옴표에 싸인 말: 큰따옴표는 소리 내어 한 말, 작은따옴표는 속생각이다.
  const lastRaw = text.trim().split(/(?<=[.!?？…~])\s+/u).at(-1) ?? '';
  if (/^["“].*["”]$/u.test(lastRaw)) return done('speech', ['따옴표말']);
  if (/^['‘].*['’]$/u.test(lastRaw)) return done('self', ['속생각']);
  // 같은 다짐을 되풀이하는 말("침착하자 침착하자")은 저를 다잡는 혼잣말이다.
  if (form === 'volitional' && !callsSomeone && chanted(allWords, selfNames)) return done('self', ['되풀이']);

  if (isAct) {
    // "-ㄹ 거야"는 그 앞 서술어의 부정을 본다("말 안 할 거야").
    const pred = /^(거야|거다|거예요|겁니다)$/u.test(last) ? words.slice(0, -1) : words;
    if (negatedPredicate(pred) || abandoned(words)) return done('refrain', ['부정']);
    // 부정 극어("아무것도", "아무 말도")가 부정과 함께 있고 마지막이 그대로 있는 일이면 하지 않는 것이다.
    const npi = allWords.some((w) => /^아무(것|말|짓|일)?(도)$/u.test(w));
    const stays = /^있/u.test(last);
    if ((npi || sentences.length > 1) && stays && sentences.some((s) => negatedPredicate(s.words) || s.words.some((w) => /지$/u.test(w) && /^않/u.test(s.words[s.words.indexOf(w) + 1] ?? '')))) return done('refrain', ['부정', '그대로']);
    // 따옴표 말 바로 뒤에 말하는 동사가 오면 말이고("…" 하고 외친다), 사이에 다른 마디가 있으면 행동이다("…"라고 중얼거리며 물러선다).
    if (/["“”'‘’「」『』]/u.test(t)) {
      const raw = t.split(/\s+/u);
      const close = raw.findLastIndex((w) => /["”’'」』]/u.test(w));
      const after = raw.slice(close + 1).filter((w) => /[가-힣]/u.test(w));
      if (/^(하고|라고|하며|하면서|소리치며)$/u.test(after[0] ?? '')) after.shift();
      return after.length <= 1 ? done('speech', ['따옴표']) : done('action', ['따옴표뒤행동']);
    }
    if (callsSomeone) return done('speech', addressed);
    if (outsideHit || latin) return done('outside', [outsideHit ? `세계밖:${outsideHit}` : '로마자'], 'thing');
    return done('action');
  }

  // 신이나 없는 이를 부르는 기도.
  if (allWords.some((w) => INVOCATION.test(w))) return done('self', ['기원']);
  // 제 이름을 부르는 말.
  const named = allWords.some((w) => selfNames.some((n) => w === n || w === `${n}야` || w === `${n}아`));
  if (named && !asking) return done('self', ['제이름']);
  // 채팅체로 적은 "안 함"은 하지 않겠다는 말이다.
  if (form === 'nominal' && !asking && (negatedPredicate(words) || /^안/u.test(last) || /안함$/u.test(last))) return done('refrain', ['부정', '채팅체']);

  // 의문사와 "-는데"로 따지는 말("왜 이러는데")은 물음표가 없어도 앞사람에게 한 말이다.
  if (!asking && wh && /는데$/u.test(last) && !honored) return done('speech', ['따지는말']);

  if (asking) {
    if (rhetoricalTail(words)) return done('self', ['반어']);
    const personal = [...addressed];
    // 듣는 이에게 하는 물음 꼴: 해라체 "-냐/-니", 대명사와 함께 쓴 "-는데?", 듣는 이 쪽 "그 ~", 존댓말 부정 물음("안 아파요?").
    if (form === 'asking') personal.push('해라체물음');
    if (isHao(last)) personal.push('하오체');
    // 앞사람이 한 말을 되묻는 "-라고?/-다고?".
    if (qMark && /(라고|다고|자고|냐고)(요)?$/u.test(last)) personal.push('되물음');
    if (wh && /는데$/u.test(last) && !honored) personal.push('따지는말');
    if (/데(요)?$/u.test(last) && allWords.some((w) => FIRST_PLAIN.test(w) || SECOND_PERSON.test(w))) personal.push('따지는물음');
    // 주어 없이 앞으로의 뜻을 묻는 "-ㄹ 거야?"("진짜로 쓸 거야?")는 듣는 이의 뜻을 묻는 말이다.
    const prevWord = words.at(-2) ?? '';
    if (!wh && /^(거야|거예요|거에요|건데|건가|겁니까|거냐)$/u.test(last) && jongOf([...prevWord].at(-1)) === JONG_RIEUL) personal.push('뜻을물음');
    if (honored && !wh && allWords.some((w) => w === '안' || w === '못')) personal.push('부정물음');
    // 제 이름을 3인칭으로 쓴 물음("아시나는 원래 어떤 사람이었어요?")은 진행자에게 묻는 말이다.
    if (named || allWords.some((w) => selfNames.some((n) => w.startsWith(n) && w !== n))) return done('question', ['제이름3인칭']);
    // 낮춤 1인칭만 있고 사실을 묻는 "-나요/-ㄴ가요"로 끝난 물음("제가 다쳤나요?")은 제 일을 진행자에게 묻는 말이다.
    // "제가 … 보여요?"처럼 해요체 그대로 묻는 말은 앞사람에게 한 말로 둔다.
    if (personal.length > 0 && personal.every((c) => c.startsWith('낮춤:')) && /(나요|가요)$/u.test(last)) return done('question', ['제일을물음']);
    if (personal.length > 0) return done('speech', personal);
    return done('question', ['듣는이없음']);
  }

  // 진행자에게 물은 뒤 덧붙인 부탁("몇 명 보여? 묘사 좀 더 해줘")은 진행자에게 한 말이다.
  const request = /(줘|주세요|줄래)$/u.test(last);
  if (request && sentences.length > 1 && sentences.slice(0, -1).some((s) => /[?？]/u.test(s.end))) {
    const lastAsked = sentences.findLastIndex((s, k) => k < sentences.length - 1 && /[?？]/u.test(s.end));
    const asked = sentences[lastAsked];
    const earlier = asked ? readInput(asked.words.join(' ') + asked.end, opts) : { kind: 'noise' as InputKind };
    if (earlier.kind === 'question') return done('question', ['물은뒤부탁']);
  }
  // 앞사람을 "이/저 ~"로 가리키며 무엇인지 알려 달라는 부탁("이 남자 정체가 뭔지 알려줘")은 진행자에게 한 말이다.
  const embeddedWh = words.some((w) => WH.test(w) && /지$/u.test(w));
  if (request && embeddedWh && !callsSomeone && words.some((w, k) => /^(이|저)$/u.test(w) && k < words.length - 1)) return done('question', ['3인칭부탁']);
  if (honored) return done('speech', ['높임말', ...addressed]);
  if (form === 'imperative') return done('speech', ['시킴:해라체', ...addressed]);
  // 앞사람 말에 대답하는 한 낱말("네", "응", "아니").
  if (allWords.length === 1 && /^(네|예|응|아니|아뇨|그래)$/u.test(last)) return done('speech', ['대답']);
  if (addressed.length > 0) return done('speech', addressed);
  // 듣는 이에게 시키거나 막는 해체 어미, 듣는 이 쪽을 가리키는 "그거". 앞 문장에 있어도 본다("베지 마! 난 …").
  for (const s of sentences) {
    const w = s.words;
    const lw = w.at(-1) ?? '';
    if (/(줘|줘라|주라|줄래)$/u.test(lw)) return done('speech', ['시킴:줘']);
    if (/^(마|마라)$/u.test(lw) && /지$/u.test(w.at(-2) ?? '')) return done('speech', ['막음:지마']);
    if (/지마(라)?$/u.test(lw)) return done('speech', ['막음:지마']);
    if (w.length >= 2 && /^(그거|그걸|그건)$/u.test(w[0] ?? '') && formOf(lw, w.at(-2)) === 'other') return done('speech', ['듣는이쪽:그거']);
  }

  // 행동을 적은 문장 뒤의 해체·해라체 한마디("칼을 뽑는다. 꺼져!")는 그 자리에서 소리 내어 한 말이다. 서술자는 해체로 쓰지 않는다.
  if (sentences.length > 1 && forms.slice(0, -1).includes('narrative') && form === 'other' && /[!！]/u.test(endMark)) return done('speech', ['행동뒤한마디']);
  if (outsideHit || latin) return done('outside', [outsideHit ? `세계밖:${outsideHit}` : '로마자'], 'thing');
  if (/[ㅋㅎㅠㅜ]{2,}/u.test(t)) return done('outside', ['자모웃음'], 'talk');
  if (form === 'nominal') return done('outside', ['채팅체'], 'talk');
  if (allWords.includes('이거')) return done('outside', ['이거'], 'talk');
  return done('self', ['듣는이없음']);
}
