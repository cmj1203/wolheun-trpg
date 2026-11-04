import type { CastSpec, Line } from '../engine/types.ts';
import { FORBIDDEN_GROUPS, RATING_GROUPS, type Lore, type Register } from './lore.ts';

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
  sceneForbid: readonly string[];
  echoOnly: readonly string[];
  /** 이 행동을 전제하는 낱말 묶음. 입력에 하나도 없는데 출력에 있으면 막는다. */
  presume?: readonly string[];
  outcomeForbid: readonly string[];
  playerText: string;
  reserved: readonly ReservedLine[];
  gist: string;
  playerLore: string;
  reactor?: string;
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

export const normalizeKo = (s: string) => s.replace(/[^\p{Script=Hangul}\p{N}]/gu, '');

const HANGUL_BASE = 0xac00;
const JONG_NIEUN = 4;

function isPresentTense(sentence: string): boolean {
  const chars = [...sentence];
  if (chars.at(-1) !== '다' || chars.length < 2) return false;
  const prev = chars.at(-2) ?? '';
  if (prev === '는') return true;
  const code = prev.charCodeAt(0) - HANGUL_BASE;
  return code >= 0 && code < 11172 && code % 28 === JONG_NIEUN;
}

const compact = (s: string) => s.replace(/\s+/g, '');

export function mentions(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return text.includes(t) || compact(text).includes(compact(t));
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
    const r = item as { speaker?: unknown; text?: unknown } | null;
    if (typeof r?.speaker !== 'string' || typeof r.text !== 'string') return '각 줄에 speaker 와 text 가 필요합니다';
    lines.push({ speaker: r.speaker.trim(), text: r.text.trim() });
  }
  return lines;
}

const SENTENCE_SPLIT = /[.!?…~]+|\n/;
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
  if (lines.length > opt.maxLines) add('format', 'too_many', `${lines.length}줄입니다(최대 ${opt.maxLines}줄)`);
  const seen = new Set<string>();
  for (const line of lines) {
    if (!opt.speakers.includes(line.speaker)) add('format', 'speaker', `허용되지 않은 화자 "${line.speaker}"`);
    if (!line.text) add('format', 'empty_line', '빈 대사가 있습니다');
    if (/[,，、]$/.test(line.text)) add('format', 'unfinished', `문장이 끝나지 않았습니다: "${line.text}"`);
    const length = [...line.text].length;
    // 길이는 가벼운 위반이다. 넘으면 다시 쓰게 하되, 끝내 넘어도 작가 대사로 바꾸지 않는다.
    if (length > opt.maxChars) add('format', 'too_long', `한 줄이 ${length}자입니다(최대 ${opt.maxChars}자)`, 'soft');
    if (seen.has(line.text)) add('format', 'repeat', `같은 대사를 되풀이했습니다: "${line.text}"`, 'soft');
    seen.add(line.text);
    const prefix = speakerPrefix(line, opt);
    if (prefix) add('format', 'speaker_prefix', `대사 안에 화자 이름("${prefix}:")을 넣었습니다. 화자는 speaker 칸에만 쓰세요`);
    const cast = opt.cast[line.speaker];
    if (cast?.style === 'speech') {
      const direction = STAGE_DIRECTION.exec(line.text)?.[0];
      if (direction) add('format', 'stage_direction', `${cast.display || line.speaker}의 대사에 지문("${direction}")이 섞였습니다. 행동과 표정은 나레이션 줄로 따로 쓰세요`);
      const selfRefs = [cast.display, line.speaker].filter((name) => name.length > 0).flatMap((name) => [`${name}는`, `${name}가`, `${name}의`, `${name}은`, `${name}이`]);
      const selfRef = selfRefs.find((ref) => line.text.includes(ref));
      if (selfRef) add('format', 'speaker_voice', `${cast.display || line.speaker}의 대사에 자기를 가리키는 묘사("${selfRef}")가 섞였습니다. 묘사는 나레이션으로 쓰세요`, 'soft');
    }
    if (cast?.style === 'narration') {
      const present = sentenceEnds(line.text).find(isPresentTense);
      if (present) add('lore', 'tense', `내레이션은 과거형으로 씁니다("${present}")`, 'soft');
    }
    const normalized = normalizeKo(line.text);
    const reserved = opt.reserved.find((r) => normalized.includes(r.norm));
    if (reserved?.future) add('beat', 'reserved_line', `다음 장면의 원작 대사("${reserved.text}")를 앞당겨 썼습니다`);
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
  // GM 설명 줄은 아시나가 아는 사실(공녀, 웰든)을 말해도 되고 스스로를 GM 이라 부를 수 있다. 인물 대사에만 거는 규칙은 이 글자로 본다.
  const voiced = lines.filter((l) => opt.cast[l.speaker]?.style !== 'gm').map((l) => l.text).join('\n');
  if (/\p{Script=Han}/u.test(all)) add('format', 'han', '한자가 섞였습니다');
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(all)) add('format', 'kana', '일본 문자가 섞였습니다');
  const latin = all.match(/[A-Za-z]+/g);
  if (latin) add('format', 'latin', `영문이 섞였습니다: ${[...new Set(latin)].slice(0, 3).join(', ')}`);
  if (/\p{Extended_Pictographic}/u.test(all)) add('format', 'emoji', '이모지가 섞였습니다');

  for (const group of FORBIDDEN_GROUPS) {
    const kind: ViolationKind = RATING_GROUPS.includes(group) ? 'rating' : 'lore';
    for (const term of opt.lore.forbidden[group]) if (mentions(GM_SELF_TERMS.includes(term) ? voiced : all, term)) add(kind, group, term);
  }
  for (const [right, wrongs] of Object.entries(opt.lore.misspellings)) {
    for (const wrong of wrongs) if (mentions(all, wrong)) add('lore', 'misspelling', `"${wrong}"가 아니라 "${right}"입니다`);
  }
  for (const term of opt.sceneForbid) if (mentions(all, term)) add('beat', 'scene_forbid', `이 장면에서 쓸 수 없는 말 "${term}"`);
  if (opt.presume?.length && !opt.presume.some((w) => mentions(opt.playerText, w))) {
    const used = opt.presume.find((w) => mentions(voiced, w));
    if (used) add('beat', 'presume', `플레이어가 하지 않은 행동("${used}")을 전제했습니다. 플레이어가 실제로 한 행동으로 쓰세요`);
  }
  for (const term of opt.echoOnly) {
    if (mentions(voiced, term) && !mentions(opt.playerText, term)) add('beat', 'echo_only', `플레이어가 먼저 말하지 않은 "${term}"을(를) 꺼냈습니다`);
  }
  for (const term of opt.outcomeForbid) if (mentions(all, term)) add('beat', 'outcome_forbid', `판정 결과와 어긋나는 표현 "${term}"`);
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

export function validateOutput(raw: string, opt: CheckOptions): { lines: Line[]; violations: Violation[] } {
  const parsed = parseGmJson(raw);
  if (typeof parsed === 'string') return { lines: [], violations: [{ kind: 'format', rule: 'json', detail: parsed, severity: 'hard' }] };
  return { lines: parsed, violations: checkLines(parsed, opt) };
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
