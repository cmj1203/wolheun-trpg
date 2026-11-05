import { FACES, isFace, type CastSpec, type Line, type Tier } from '../engine/types.ts';
import { isPresentTense, longestCommon, normalizeKo, preemptedBy } from '../engine/text.ts';
import { FORBIDDEN_GROUPS, RATING_GROUPS, type ForbiddenGroup, type Lore, type Register } from './lore.ts';

export type ViolationKind = 'format' | 'lore' | 'rating' | 'beat';
export type Severity = 'hard' | 'soft';

export interface Violation {
  kind: ViolationKind;
  rule: string;
  detail: string;
  severity: Severity;
}

export interface CheckOptions {
  speakers: readonly string[];
  maxLines: number;
  maxChars: number;
  cast: Record<string, CastSpec>;
  lore: Lore;
  /** 엔진이 정한 상태와 어긋나는 표현(장면 state_guard + 참인 사실의 state_guard). */
  stateGuard: readonly string[];
  /** 이번 판에 화면에 나온 줄(화자별). 같은 화자의 같은 말은 길이와 상관없이 막는다. */
  spoken?: Readonly<Record<string, readonly string[]>>;
  echoOnly: readonly string[];
  /** 이 행동을 전제하는 낱말 묶음. 입력에 하나도 없는데 출력에 있으면 막는다. */
  presume?: readonly string[];
  outcomeForbid: readonly string[];
  /** 플레이어가 친 글과 해석이 요약한 행동(deed). 여기 든 말은 스포일러·등급 밖의 장면 검사에서 못 걸린다. */
  playerText: string;
  /** 해석이 요약한 플레이어의 행동 한 문장. 같은 일을 그린 다음 장면 원작 줄은 앞당김으로 보지 않는다. */
  deed?: string;
  /** 이보다 적으면 다시 쓰게 한다(큰 행동의 반응 2~3줄). */
  minLines?: number;
  reserved: readonly ReservedLine[];
  gist: string;
  playerLore: string;
  reactor?: string;
  /** 첫 줄을 말해야 하는 화자(세계 밖 행동은 나레이션이 먼저 동작을 그린다). */
  first?: string;
  /** 지금 장면에 없는 인물을 가리키는 말. 인물 대사와 내레이션에서 막는다. */
  absent?: readonly string[];
  /** 이번 입력. 속마음이 이 문구를 되풀이하면 막는다. */
  input?: string;
  /** 아시나가 잃으면 안 되는 소지품의 짧은 이름. */
  keepItems?: readonly string[];
  /** 답에 하나는 나와야 하는 말. 묻는 대상과 다른 답을 막는다. */
  mustMention?: readonly string[];
  /** 판정 결과. 결과와 반대되는 서술을 막는다. */
  tier?: Tier;
  /** 줄마다 face 가 있어야 하는 화자(입식이 있는 인물의 대사·속마음). 여기 없는 화자의 줄에 face 가 있어도 형식 위반이다. */
  faced?: readonly string[];
}

/** 표정을 바꾸는 줄의 화자: 인물의 대사와 속마음. 나레이션과 GM 여우는 입식 표정이 없다. */
export function facedSpeakers(cast: Record<string, CastSpec>, speakers: readonly string[]): string[] {
  return speakers.filter((s) => {
    const style = cast[s]?.style;
    return style === 'speech' || style === 'thought';
  });
}

export interface ReservedLine {
  norm: string;
  text: string;
  future: boolean;
}

/** 대사 줄에 섞인 지문("~며 말했다", "웃었다"). 인물이 소리 내어 하는 말에는 나오지 않는다. */
const STAGE_DIRECTION = /[\p{Script=Hangul}]*(며|고|서) ?(말했다|웃었다|외쳤다|소리쳤다|대답했다|중얼거렸다|속삭였다|물었다)|(말했다|웃었다|외쳤다|소리쳤다|대답했다|중얼거렸다|속삭였다)[.!]?$/u;

/** 인물 대사에서만 막는 금지어. GM 설명 줄에는 적용하지 않는다. */
const GM_SELF_TERMS: readonly string[] = ['게임 마스터'];

export { normalizeKo };

const compact = (s: string) => s.replace(/\s+/g, '');

export function mentions(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return text.includes(t) || compact(text).includes(compact(t));
}

/** 띄어쓰기를 지우고 맞추면 두 낱말에 걸친 우연(자 해 → 자해, 일 본 → 일본, 작은 발 → 은발)이 걸린다. 이만큼 짧은 낱말은 붙여 쓴 그대로만 본다. */
const LOOSE_MIN = 3;

/**
 * 금지어 사전(바깥 이야기·현대 물건·현실 지명·스포일러·변장 노출) 낱말이 글에 들었는가.
 * 띄어 쓴 낱말과 세 글자 이상인 낱말만 띄어쓰기를 무시하고 맞춘다. 등급 낱말은 ratingIn 으로 본다.
 */
export function forbiddenIn(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  if (text.includes(t)) return true;
  return (/\s/u.test(t) || [...t].length >= LOOSE_MIN) && compact(text).includes(compact(t));
}

/** 등급 낱말과 겹치지만 해롭지 않은 말. 띄어쓰기를 무시하고 맞추기 전에 지운다("자, 해 보자" → 자해 아님). */
const RATING_INNOCENT: readonly RegExp[] = [/(^|[\s,.!?…~])자[\s,.!…~]+해(?=\s*[보볼봐봅줘야라요])/gu];

/** 등급(욕·선정·잔혹·자해) 낱말이 글에 들었는가. 일부러 띄어 써 피하는 일("시 발", "섹 스")이 흔해 띄어쓰기를 무시하고 맞춘다. */
export function ratingIn(text: string, term: string): boolean {
  return mentions(RATING_INNOCENT.reduce((t, re) => t.replace(re, '$1'), text), term);
}

/** 금지 묶음 이름에 맞는 비교로 낱말이 글에 들었는지 본다. */
export function forbiddenTermIn(group: ForbiddenGroup, text: string, term: string): boolean {
  return RATING_GROUPS.includes(group) ? ratingIn(text, term) : forbiddenIn(text, term);
}

/** 상대 인물 줄 앞의 "하."는 polish 가 지운다. 같은 말인지 맞출 때도 떼고 보되("하,"도 같은 말로 본다), "하."뿐인 줄은 그대로 본다. */
const LEADING_HA = /^하[.…!,]+\s*/u;
const bareNorm = (s: string) => normalizeKo(s.replace(LEADING_HA, '')) || normalizeKo(s);

/** 이보다 짧은 원작 줄은 글 안에 들었는지가 아니라 줄 전체가 같은지로 본다("여자."가 "입을 닫아라, 여자."를 막지 않게). */
const RESERVED_SUBSTRING_MIN = 5;

const ECHO_MIN = 3;
const ECHO_MAX = 6;


/** 속마음이 플레이어 입력을 남이 한 말처럼 받는 말. */
const HEARD_AS_OTHER = /무슨 소리|뭔 소리|헛소리/u;
/** "나 지금 무슨 소리를 하는 거야"는 자기 말을 돌아보는 것이지 남의 말처럼 듣는 것이 아니다. */
const SELF_SUBJECT = /(^|[\s,.!?…])(나|내가|난|내)\s/u;

/** 속마음이 입력 문구를 그대로 안고 있는가. 짧은 입력은 거의 전부, 긴 입력은 여섯 글자 이어지면 되풀이로 본다. */
export function echoesInput(line: string, input: string): boolean {
  const norm = normalizeKo(input);
  const size = [...norm].length;
  if (size < ECHO_MIN) return false;
  return longestCommon(normalizeKo(line), norm) >= Math.max(ECHO_MIN, Math.min(ECHO_MAX, Math.ceil(size * 0.6)));
}

const NOT_DONE = /^[가-힣]*?(지\s*(못|않)(?![가-힣]*으면)|\s*(틈|새|겨를|수|곳|데|길|여유|시간)[도은는이가조차]*\s*없)/u;

/** 행동으로 쓴 낱말인가. 다른 낱말의 일부('정막을')와 하지 못했다는 서술('막을 틈도 없이')은 전제가 아니다. */
function presumes(text: string, term: string): boolean {
  const pattern = new RegExp(`(?<![가-힣])${term.trim().split(/\s+/).join('\\s*')}`, 'gu');
  return [...text.matchAll(pattern)].some((m) => !NOT_DONE.test(text.slice(m.index + m[0].length, m.index + m[0].length + 16)));
}

/** 등급과 반대되는 서술. 정해진 결과 요지에 같은 말이 있으면 막지 않는다. */
const TIER_OPPOSITE: Record<Tier, readonly string[]> = {
  hit: ['헛손질', '헛발질', '허공을 갈', '허공을 가르', '허공을 휘', '헛수고', '허탕', '아무 소용', '소용없', '소용이 없', '고꾸라', '엉뚱한 곳'],
  mixed: ['헛손질', '헛발질', '허공을 갈', '허공을 가르', '허공을 휘', '헛수고', '허탕', '아무 소용', '소용없', '소용이 없'],
  miss: ['성공했', '해냈다', '완벽하게'],
};

const LOSS_VERB = '던지|던져|던졌|내던|내팽개|버리|버렸|떨어뜨|떨어트|빼앗|뺏|찢|태워|태웠|부러|박살|망가';

/** 소지품이 아시나 손을 떠났다고 읽히는 줄인가. */
export function losesItem(line: string, name: string): boolean {
  return new RegExp(`${name}[^.!?\\n]{0,12}(${LOSS_VERB})|${name}(을|를)\\s*(잃|놓치|놓쳤)|(던진|던져진|내던진|버려진|버린)\\s*${name}`, 'u').test(line);
}

export function parseGmJson(raw: string): Line[] | string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'JSON 으로 읽을 수 없습니다';
  }
  const linesRaw = (data as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(linesRaw)) return 'lines 목록이 없습니다';
  const lines: Line[] = [];
  for (const item of linesRaw) {
    const r = item as { speaker?: unknown; text?: unknown; face?: unknown } | null;
    if (typeof r?.speaker !== 'string' || typeof r.text !== 'string') return '각 줄에 speaker 와 text 가 필요합니다';
    // face 는 있는 대로 넘기고 허용 집합 검사는 checkLines 가 한다.
    lines.push({ speaker: r.speaker.trim(), text: r.text.trim(), ...(typeof r.face === 'string' ? { face: r.face.trim() } : {}) });
  }
  return lines;
}

const SENTENCE_SPLIT = /[.!?…~]+|\n/;
/** 여우 줄에서 반말이 아닌 '다' 끝: 합쇼체(~ㅂ니다)와 과거 서술(~었다/았다/했다/갔다 — '다' 앞 음절의 받침이 ㅆ). */
function isFormalOrPastDa(sentence: string): boolean {
  if (sentence.endsWith('니다')) return true;
  const prev = sentence.codePointAt(sentence.length - 2);
  if (prev === undefined || prev < 0xac00 || prev > 0xd7a3) return false;
  return (prev - 0xac00) % 28 === 20; // 받침 ㅆ
}
/** 여우 줄의 존댓말 끝(~요, ~죠, ~십시오). 합쇼체 '~니다'는 '다' 끝 검사가 hard 로 잡는다. "땅이니까."는 반말이라 넣지 않고, 필요·중요·강요 같은 낱말은 뺀다. */
const GM_POLITE = /((?<![필중강수주소요])요|죠|십시오)$/u;
const QUOTED = /"[^"]*"|“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』/gu;
const TRAILING = /["'“”‘’()[\]「」『』\-―—\s]+$/u;

function sentenceEnds(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.replace(TRAILING, '').trim())
    .filter(Boolean);
}

function registerOf(line: Line, opt: CheckOptions): { who: string; reg: Register; severity: Severity } | null {
  const cast = opt.cast[line.speaker];
  if (!cast) return null;
  if (cast.style === 'narration') return { who: '내레이션', reg: opt.lore.narration.register, severity: 'soft' };
  if (cast.style === 'thought') return { who: '속마음', reg: opt.lore.thought.register, severity: 'soft' };
  const character = cast.lore ? opt.lore.characters[cast.lore] : undefined;
  if (!character) return null;
  return { who: cast.display || line.speaker, reg: character.register, severity: cast.lore === opt.playerLore ? 'soft' : 'hard' };
}

function speakerPrefix(line: Line, opt: CheckOptions): string | null {
  const head = /^([\p{L}\s·]{1,10})\s*[:：]/u.exec(line.text)?.[1]?.trim();
  if (!head) return null;
  const names = Object.entries(opt.cast).flatMap(([key, c]) => [key, c.display]).filter(Boolean);
  return names.includes(head) || head === '나레이션' ? head : null;
}

export function checkLines(lines: readonly Line[], opt: CheckOptions): Violation[] {
  const found: Violation[] = [];
  const add = (kind: ViolationKind, rule: string, detail: string, severity: Severity = 'hard') => found.push({ kind, rule, detail, severity });

  if (lines.length === 0) add('format', 'empty', '대사가 한 줄도 없습니다');
  if (opt.reactor && lines.length > 0 && !lines.some((l) => l.speaker === opt.reactor)) add('format', 'no_reaction', `${opt.reactor}의 대사나 생각이 한 줄은 있어야 합니다`);
  if (opt.first && lines.length > 0 && lines[0]?.speaker !== opt.first) add('format', 'first_speaker', `첫 줄은 ${opt.first}이 ${opt.playerLore}가 실제로 한 동작을 그려야 합니다`);
  if (lines.length > opt.maxLines) add('format', 'too_many', `${lines.length}줄입니다(최대 ${opt.maxLines}줄)`);
  if (opt.minLines !== undefined && lines.length > 0 && lines.length < opt.minLines) add('format', 'too_few', `${lines.length}줄입니다. 큰 행동에는 행동이 어떻게 됐는지와 상대의 대사·몸짓 반응을 합쳌 ${opt.minLines}줄 이상 쓰세요`);
  // 플레이어가 먼저 한 말·행동에 든 말은 GM 이 지어낸 것이 아니다. 스포일러와 등급을 뻐고 장면 검사에서 뻐 준다.
  const playerDid = (term: string) => mentions(opt.playerText, term);
  // 스포일러·변장 노출은 이번 입력에 든 말만 면제한다. 지난 입력(said)이나 해석이 지어 쓴 요약(deed)에 든 말로 몇 턴씩 풀리지 않게.
  const inputDid = (term: string) => mentions(opt.input ?? opt.playerText, term);
  const seen = new Set<string>();
  for (const line of lines) {
    if (!opt.speakers.includes(line.speaker)) add('format', 'speaker', `허용되지 않은 화자 "${line.speaker}"`);
    if (opt.faced?.includes(line.speaker)) {
      if (line.face === undefined) add('format', 'face_missing', `"${line.speaker}" 줄에 face 가 없습니다. ${FACES.join('·')} 중 하나를 적으세요`);
      else if (!isFace(line.face)) add('format', 'face', `허용되지 않은 표정 "${line.face}". ${FACES.join('·')} 중 하나만 씁니다`);
    } else if (opt.faced && line.face !== undefined) add('format', 'face_extra', `"${line.speaker}" 줄에는 face 를 쓰지 않습니다(나레이션·GM 줄은 표정이 없습니다)`);
    if (!line.text) add('format', 'empty_line', '빈 대사가 있습니다');
    if (/[,，、]$/.test(line.text)) add('format', 'unfinished', `문장이 끝나지 않았습니다: "${line.text}"`);
    const length = [...line.text].length;
    // 길이는 가벼운 위반이다. 넘으면 다시 쓰게 하되, 끝내 넘어도 작가 대사로 바꾸지 않는다.
    if (length > opt.maxChars) add('format', 'too_long', `한 줄이 ${length}자입니다(최대 ${opt.maxChars}자)`, 'soft');
    const repeatKey = bareNorm(line.text) || line.text;
    if (seen.has(repeatKey)) add('format', 'repeat', `같은 대사를 되풀이했습니다: "${line.text}"`, 'soft');
    const spokenNorm = bareNorm(line.text);
    if (spokenNorm && opt.spoken?.[line.speaker]?.some((t) => bareNorm(t) === spokenNorm)) add('beat', 'repeat_play', `이번 판에 ${line.speaker}이(가) 이미 한 말("${line.text}")입니다. 이번 입력에 맞는 다른 말로 쓰세요`);
    seen.add(repeatKey);
    const prefix = speakerPrefix(line, opt);
    if (prefix) add('format', 'speaker_prefix', `대사 안에 화자 이름("${prefix}:")을 넣었습니다. 화자는 speaker 칸에만 쓰세요`);
    const cast = opt.cast[line.speaker];
    if (cast?.style === 'thought' && HEARD_AS_OTHER.test(line.text) && !SELF_SUBJECT.test(line.text)) {
      add('beat', 'echo_input', `속마음이 입력을 남의 말처럼 받았습니다("${line.text}"). 입력은 아시나 자신의 말이나 행동입니다. 몸 상태와 주변 상황으로 이으세요`);
    }
    if (cast?.style === 'thought' && opt.input && echoesInput(line.text, opt.input)) {
      add('beat', 'echo_input', `속마음이 플레이어 입력을 되풀이했습니다("${line.text}"). 입력은 아시나 자신의 말이나 행동입니다. 인용하거나 되묻지 말고 몸 상태와 주변 상황으로 이으세요`);
    }
    if (cast?.style !== 'gm') {
      const lost = opt.keepItems?.find((name) => losesItem(line.text, name));
      if (lost) add('beat', 'item_lost', `${lost}이(가) 아시나 손을 떠났다고 썼습니다. 소지품은 잃지 않습니다. 끈을 쥔 채 휘두르거나 바로 되찾는 모습으로 쓰세요`);
    }
    if (cast?.style === 'speech') {
      const direction = STAGE_DIRECTION.exec(line.text)?.[0];
      if (direction) add('format', 'stage_direction', `${cast.display || line.speaker}의 대사에 지문("${direction}")이 섞였습니다. 행동과 표정은 나레이션 줄로 따로 쓰세요`);
      const selfRefs = [cast.display, line.speaker].filter((name) => name.length > 0).flatMap((name) => [`${name}는`, `${name}가`, `${name}의`, `${name}은`, `${name}이`]);
      const selfRef = selfRefs.find((ref) => line.text.includes(ref));
      if (selfRef) add('format', 'speaker_voice', `${cast.display || line.speaker}의 대사에 자기를 가리키는 묘사("${selfRef}")가 섞였습니다. 묘사는 나레이션으로 쓰세요`, 'soft');
    }
    if (cast?.style === 'gm') {
      // 합쇼체(~습니다)와 과거 서술(~었다/았다/였다)은 여우 말투가 아니라 막는다. "대담하다"처럼 '다'로 끝나는 반말 감탄은 자연스러워 soft 로만 적는다.
      // 여우가 인용한 남의 말("살려 주세요")은 여우 말투가 아니다. 따옴표 안을 빼고 끝을 본다.
      const unquoted = line.text.replace(QUOTED, ' ');
      const own = /[가-힣]/u.test(unquoted) ? unquoted : line.text;
      const polite = sentenceEnds(own).find((s) => GM_POLITE.test(s));
      if (polite) add('lore', 'gm_voice', `여우는 플레이어에게 반말로 말합니다("${polite}"가 존댓말로 끝남). "~야", "~해", "~어"로 쓰세요`);
      const flat = sentenceEnds(own).find((s) => s.endsWith('다'));
      if (flat) add('lore', 'gm_voice', `여우는 플레이어에게 반말로 말합니다("${flat}"가 "다"로 끝남). "~야", "~해", "~어"로 쓰세요`, isFormalOrPastDa(flat) ? 'hard' : 'soft');
    }
    if (cast?.style === 'narration') {
      const present = sentenceEnds(line.text).find(isPresentTense);
      if (present) add('lore', 'tense', `내레이션은 과거형으로 씁니다("${present}")`, 'soft');
    }
    const normalized = normalizeKo(line.text);
    const bare = bareNorm(line.text);
    const reserved = opt.reserved.find((r) => {
      if (r.norm.length < RESERVED_SUBSTRING_MIN) return normalized === r.norm || bare === r.norm;
      const rBare = bareNorm(r.text);
      return normalized.includes(r.norm) || (rBare !== r.norm && rBare.length >= RESERVED_SUBSTRING_MIN && normalized.includes(rBare));
    });
    // 플레이어가 먼저 해 버린 일과 같은 다음 장면 줄은 '먼저 일어난 것'으로 받아 잇는다. 그 장면에 가면 엔진이 그 줄만 건너뛴다.
    if (reserved?.future && !preemptedBy(reserved.norm, opt.deed)) add('beat', 'reserved_line', `다음 장면의 원작 대사("${reserved.text}")를 앞당겨 썼습니다`);
    else if (reserved) add('beat', 'repeat_earlier', `이미 나온 대사("${reserved.text}")를 되풀이했습니다`, 'soft');
    const reg = registerOf(line, opt);
    if (!reg) continue;
    for (const sentence of sentenceEnds(line.text)) {
      const ending = reg.reg.forbid_endings.find((e) => sentence.endsWith(e));
      if (ending) {
        add('lore', 'register', `${reg.who}의 말투가 아닙니다("${sentence}"가 "${ending}"로 끝남)`, reg.severity);
        break;
      }
    }
    for (const word of reg.reg.forbid_words) if (mentions(line.text, word)) add('lore', 'register_word', `${reg.who}는 "${word}"라는 말을 쓰지 않습니다`, reg.severity);
  }

  const all = lines.map((l) => l.text).join('\n');
  const opposite = opt.tier ? TIER_OPPOSITE[opt.tier].find((w) => mentions(all, w) && !mentions(opt.gist, w) && !playerDid(w)) : undefined;
  if (opposite) add('beat', 'tier_mismatch', `판정 결과와 반대되는 서술입니다("${opposite}"). 정해진 결과대로 입력한 행동이 어떻게 됐는지 쓰세요`);
  if (opt.mustMention?.length && lines.length > 0 && !mentions(all, '몰라') && !opt.mustMention.some((w) => mentions(all, w))) add('beat', 'off_topic', `묻는 대상과 다른 답입니다. ${opt.mustMention[0]}에 대해 답하세요`);
  // GM 설명 줄은 아시나가 아는 사실(공녀, 웰든)을 말해도 되고 스스로를 GM 이라 부를 수 있다. 인물 대사에만 거는 규칙은 이 글자로 본다.
  const voiced = lines.filter((l) => opt.cast[l.speaker]?.style !== 'gm').map((l) => l.text).join('\n');
  if (/\p{Script=Han}/u.test(all)) add('format', 'han', '한자가 섞였습니다');
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(all)) add('format', 'kana', '일본 문자가 섞였습니다');
  const latin = all.match(/[A-Za-z]+/g);
  if (latin) add('format', 'latin', `영문이 섞였습니다: ${[...new Set(latin)].slice(0, 3).join(', ')}`);
  if (/\p{Extended_Pictographic}/u.test(all)) add('format', 'emoji', '이모지가 섞였습니다');

  for (const group of FORBIDDEN_GROUPS) {
    const kind: ViolationKind = RATING_GROUPS.includes(group) ? 'rating' : 'lore';
    for (const term of opt.lore.forbidden[group]) {
      // 플레이어가 먼저 꺼낸 이름·사실은 인물이 되받아 말해도 새로 꺼낸 것이 아니다. 등급(욕·선정·잔혹·자해)은 GM 줄에 그대로 건다.
      if (group === 'spoilers' && inputDid(term)) continue;
      const scope = GM_SELF_TERMS.includes(term) ? voiced : all;
      if (forbiddenTermIn(group, scope, term)) add(kind, group, term);
    }
  }
  for (const [right, wrongs] of Object.entries(opt.lore.misspellings)) {
    for (const wrong of wrongs) if (mentions(all, wrong)) add('lore', 'misspelling', `"${wrong}"가 아니라 "${right}"입니다`);
  }
  // 상태 표현도 플레이어가 먼저 한 일이면 GM 이 되받는 것을 막지 않는다.
  for (const term of opt.stateGuard) if (mentions(all, term) && !playerDid(term)) add('beat', 'state_guard', `지금 상태와 어긋나는 표현 "${term}"`);
  for (const term of opt.lore.exposure) if (forbiddenIn(voiced, term) && !inputDid(term)) add('beat', 'exposed', `변장이 풀렸다고 읽히는 말("${term}")을 썼습니다. 변장은 풀리지 않고 아무도 본모습을 보지 못합니다`);
  for (const term of opt.absent ?? []) if (mentions(voiced, term) && !playerDid(term)) add('beat', 'absent', `지금 장면에 없는 인물("${term}")을 썼습니다. 아시나 혼자 겪는 일로 쓰세요`);
  if (opt.presume?.length && !opt.presume.some(playerDid)) {
    const used = opt.presume.find((w) => presumes(voiced, w));
    if (used) add('beat', 'presume', `플레이어가 하지 않은 행동("${used}")을 전제했습니다. 플레이어가 실제로 한 행동으로 쓰세요`);
  }
  for (const term of opt.echoOnly) {
    if (mentions(voiced, term) && !playerDid(term)) add('beat', 'echo_only', `플레이어가 먼저 말하지 않은 "${term}"을(를) 꺼냈습니다`);
  }
  for (const term of opt.outcomeForbid) if (mentions(all, term) && !playerDid(term)) add('beat', 'outcome_forbid', `판정 결과와 어긋나는 표현 "${term}"`);
  const gistSentences = opt.gist
    .split(/[.!?…]+/)
    .map(normalizeKo)
    .filter((s) => s.length >= 12);
  const lineNorms = lines.map((l) => normalizeKo(l.text));
  if (gistSentences.some((g) => lineNorms.some((n) => n.includes(g) || (n.length >= 12 && g.includes(n))))) {
    add('beat', 'gist_copy', '"반드시 일어날 일" 문장을 그대로 옮겼습니다. 장면으로 다시 쓰세요', 'soft');
  }
  return found;
}

/** 글 앞에 쓴 화자 이름("속마음: …")은 뜻이 분명하니 다시 쓰게 하지 않고 그 화자의 줄로 옮긴다. */
function moveSpeakerPrefix(line: Line, opt: CheckOptions): Line {
  const head = speakerPrefix(line, opt);
  const key = head ? opt.speakers.find((s) => s === head || opt.cast[s]?.display === head) : undefined;
  if (!key) return line;
  const text = line.text.replace(/^[^:：]*[:：]\s*/u, '');
  if (!text) return line;
  const { face, ...rest } = line;
  return { ...rest, speaker: key, text, ...(opt.faced?.includes(key) ? { face: face ?? 'neutral' } : {}) };
}

/** 길이 상한을 넘은 줄을 문장 경계에서 나눈다. 줄 수 상한을 넘게 되면 그대로 둔다(그때는 다시 쓰게 한다). */
function splitLongLines(lines: Line[], opt: CheckOptions): Line[] {
  const out = lines.flatMap((line) => {
    if ([...line.text].length <= opt.maxChars) return [line];
    const chunks: string[] = [];
    for (const sentence of line.text.split(/(?<=[.!?…])\s+/u)) {
      const last = chunks.at(-1);
      if (last !== undefined && [...`${last} ${sentence}`].length <= opt.maxChars) chunks[chunks.length - 1] = `${last} ${sentence}`;
      else chunks.push(sentence);
    }
    return chunks.map((text) => ({ ...line, text }));
  });
  return out.length <= opt.maxLines ? out : lines;
}

/** 입력은 화면에 이미 나왔다. 그걸 되받는 속마음 줄은 다른 줄이 남으면 다시 쓰게 하지 않고 뺀다. */
function dropEchoThoughts(lines: Line[], opt: CheckOptions): Line[] {
  const kept = lines.filter((line) => {
    if (opt.cast[line.speaker]?.style !== 'thought') return true;
    const heard = HEARD_AS_OTHER.test(line.text) && !SELF_SUBJECT.test(line.text);
    return !heard && !(opt.input && echoesInput(line.text, opt.input));
  });
  return kept.length ? kept : lines;
}

/** 한 답 안에서 같은 화자가 같은 말(문장부호·띄어쓰기만 다른 말 포함)을 또 쓴 줄은 뺀다. 가벼운 위반이라 빼지 않으면 끝내 두 줄이 다 화면에 나온다. */
function dropRepeats(lines: Line[]): Line[] {
  const seen = new Set<string>();
  const kept = lines.filter((line) => {
    const key = `${line.speaker}|${bareNorm(line.text) || line.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return kept.length ? kept : lines;
}

export function validateOutput(raw: string, opt: CheckOptions): { lines: Line[]; violations: Violation[] } {
  const parsed = parseGmJson(raw);
  if (typeof parsed === 'string') return { lines: [], violations: [{ kind: 'format', rule: 'json', detail: parsed, severity: 'hard' }] };
  const cleaned = dropEchoThoughts(splitLongLines(parsed.map((l) => moveSpeakerPrefix(l, opt)), opt), opt);
  const lines = dropRepeats(cleaned);
  const violations = checkLines(lines, opt);
  // 뺀 줄도 다시 쓰게 할 거리는 된다(가벼운 위반). 끝내 고치지 못하면 뺀 채로 화면에 낸다.
  const dropped = cleaned.find((l, i) => !lines.includes(l) && i > 0);
  if (dropped) violations.push({ kind: 'format', rule: 'repeat', detail: `같은 대사를 되풀이했습니다: "${dropped.text}"`, severity: 'soft' });
  return { lines, violations };
}

const KIND_LABEL: Record<ViolationKind, string> = { format: '형식', lore: '설정', rating: '등급', beat: '장면' };

function advice(v: Violation): string {
  switch (v.rule) {
    case 'meta':
      return `게임 밖 이야기("${v.detail}")를 하지 마라`;
    case 'modern':
      return `이 세계에 없는 물건이나 말("${v.detail}")을 쓰지 마라`;
    case 'realworld':
      return `현실 세계의 지명이나 종교("${v.detail}")를 쓰지 마라`;
    case 'spoilers':
      return `아직 나오지 않은 이야기("${v.detail}")를 꺼내지 마라`;
    case 'profanity':
    case 'sexual':
    case 'gore':
    case 'harm':
      return `15세 이용가에 맞지 않는 표현("${v.detail}")을 빼라`;
    default:
      return v.detail;
  }
}

export function feedbackFor(violations: readonly Violation[]): string {
  return violations
    .slice(0, 6)
    .map((v) => `- [${KIND_LABEL[v.kind]}] ${advice(v)}`)
    .join('\n');
}
