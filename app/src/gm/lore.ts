import { noteOpen } from '../engine/engine.ts';
import { checkNotes } from '../engine/scenario.ts';
import { FACES, isFace, NOTE_KINDS, type Face, type GameState, type NoteEntry, type NoteKind, type NoteTier, type Scenario, type Tier } from '../engine/types.ts';

export const FORBIDDEN_GROUPS = ['meta', 'modern', 'realworld', 'spoilers', 'profanity', 'sexual', 'gore', 'harm'] as const;
export type ForbiddenGroup = (typeof FORBIDDEN_GROUPS)[number];
export const RATING_GROUPS: readonly ForbiddenGroup[] = ['profanity', 'sexual', 'gore', 'harm'];

export interface Register {
  forbid_endings: string[];
  forbid_words: string[];
}

export interface LoreCharacter {
  names: string[];
  alias: string;
  secret: string;
  look: string;
  personality: string;
  values: string[];
  voice: string[];
  samples: { speech: string[]; thought: string[] };
  register: Register;
  /** GM 이 끝내 못 썼을 때 쓰는 이 인물의 반응 줄. 등급별로 성격·말투 안에서 쓴 짧은 대사다. */
  reactions?: Record<Tier, ReactionLine[]>;
  /** 이 인물의 표정 규칙. GM 이 대사 줄마다 face 를 고를 때 따른다. */
  faces: string[];
}

/** 고정 반응 줄. 화면 입식이 그 줄에 맞게 바뀌도록 표정을 함께 적는다. */
export interface ReactionLine {
  text: string;
  face: Face;
}

const OUTCOME_TIERS: readonly Tier[] = ['hit', 'mixed', 'miss'];

function reactionLines(v: unknown, where: string): ReactionLine[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new LoreError(`${where}: 목록이 필요합니다`);
  return v.map((x, i) => {
    const r = rec(x, `${where}[${i}]`);
    if (!isFace(r.face)) throw new LoreError(`${where}[${i}].face: 표정은 ${FACES.join('·')} 중 하나여야 합니다`);
    return { text: text(r.text, `${where}[${i}].text`), face: r.face };
  });
}

function reactions(v: unknown, where: string): Record<Tier, ReactionLine[]> {
  const r = rec(v, where);
  const out = Object.fromEntries(OUTCOME_TIERS.map((t) => [t, reactionLines(r[t], `${where}.${t}`)])) as Record<Tier, ReactionLine[]>;
  for (const t of OUTCOME_TIERS) if (out[t].length === 0) throw new LoreError(`${where}.${t}: 반응 줄이 한 줄은 필요합니다`);
  return out;
}

export interface Lore {
  work: string;
  credit: string;
  rating: string;
  knowledge: NoteEntry[];
  characters: Record<string, LoreCharacter>;
  narration: { voice: string[]; register: Register };
  thought: { voice: string[]; register: Register };
  places: string[];
  terms: string[];
  /** 변장이 풀렸다고 읽히는 말. 인물 대사와 내레이션에서 막는다. */
  exposure: string[];
  /** 뜰금없는 행동에 여우가 덧붙이는 한마디를 모델이 못 썼을 때 쓰는 짧은 감탄. */
  gmQuips: string[];
  misspellings: Record<string, string[]>;
  forbidden: Record<ForbiddenGroup, string[]>;
}

/** 아직 열리지 않은 숨긴 항목의 keys 를 더한 스포일러 목록. 항목의 if 가 참이 되면 그 이름은 저절로 풀린다. */
export function spoilersFor(lore: Lore, state: Pick<GameState, 'tracks' | 'abilities' | 'flags' | 'items'>): string[] {
  const hidden = lore.knowledge.filter((n) => n.tier === 'hidden' && !noteOpen(n, state)).flatMap((n) => n.keys);
  return [...lore.forbidden.spoilers, ...hidden];
}

/** 지금 상태에 맞춘 설정 사전. 스포일러만 바뀐다. */
export function loreFor(lore: Lore, state: Pick<GameState, 'tracks' | 'abilities' | 'flags' | 'items'>): Lore {
  return { ...lore, forbidden: { ...lore.forbidden, spoilers: spoilersFor(lore, state) } };
}

export class LoreError extends Error {
  override name = 'LoreError';
}

type Raw = Record<string, unknown>;

function rec(v: unknown, where: string): Raw {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new LoreError(`${where}: 이름: 값 묶음이 필요합니다`);
  return v as Raw;
}

function text(v: unknown, where: string, allowEmpty = false): string {
  if (v === undefined && allowEmpty) return '';
  if (typeof v !== 'string' || (!allowEmpty && v.trim() === '')) throw new LoreError(`${where}: 글자가 필요합니다`);
  return v;
}

function texts(v: unknown, where: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new LoreError(`${where}: 목록이 필요합니다`);
  return v.map((x, i) => text(x, `${where}[${i}]`));
}

function register(v: unknown, where: string): Register {
  const r = rec(v, where);
  return { forbid_endings: texts(r.forbid_endings, `${where}.forbid_endings`), forbid_words: texts(r.forbid_words, `${where}.forbid_words`) };
}

const TIERS: readonly NoteTier[] = ['common', 'asina', 'hidden'];

function knowledge(v: unknown): NoteEntry[] {
  const root = rec(v, 'knowledge');
  return TIERS.flatMap((tier) => {
    const raw = root[tier];
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) throw new LoreError(`knowledge.${tier}: 목록이 필요합니다`);
    return raw.map((x, i): NoteEntry => {
      const where = `knowledge.${tier}[${i}]`;
      const r = rec(x, where);
      const kind = text(r.kind, `${where}.kind`);
      if (!(NOTE_KINDS as readonly string[]).includes(kind)) throw new LoreError(`${where}.kind: ${NOTE_KINDS.join(', ')} 중 하나여야 합니다`);
      const entry: NoteEntry = { id: text(r.id, `${where}.id`), tier, kind: kind as NoteKind, name: text(r.name, `${where}.name`), text: text(r.text, `${where}.text`), keys: texts(r.keys, `${where}.keys`) };
      if (r.after !== undefined) entry.after = texts(r.after, `${where}.after`);
      if (r.intro !== undefined) entry.intro = text(r.intro, `${where}.intro`);
      if (r.say !== undefined) entry.say = text(r.say, `${where}.say`);
      if (r.if !== undefined) entry.if = text(r.if, `${where}.if`);
      return entry;
    });
  });
}

export function parseLore(source: string): Lore {
  const root = rec(Bun.YAML.parse(source), 'lore');
  const characters: Record<string, LoreCharacter> = {};
  for (const [key, raw] of Object.entries(rec(root.characters, 'characters'))) {
    const r = rec(raw, `characters.${key}`);
    const samples = rec(r.samples, `characters.${key}.samples`);
    characters[key] = {
      names: texts(r.names, `characters.${key}.names`),
      alias: text(r.alias, `characters.${key}.alias`),
      secret: text(r.secret, `characters.${key}.secret`, true),
      look: text(r.look, `characters.${key}.look`),
      personality: text(r.personality, `characters.${key}.personality`),
      values: r.values === undefined ? [] : texts(r.values, `characters.${key}.values`),
      voice: texts(r.voice, `characters.${key}.voice`),
      samples: { speech: texts(samples.speech, `characters.${key}.samples.speech`), thought: texts(samples.thought, `characters.${key}.samples.thought`) },
      register: register(r.register, `characters.${key}.register`),
      faces: texts(r.faces, `characters.${key}.faces`),
      ...(r.reactions === undefined ? {} : { reactions: reactions(r.reactions, `characters.${key}.reactions`) }),
    };
  }
  const narration = rec(root.narration, 'narration');
  const thought = rec(root.thought, 'thought');
  const forbiddenRaw = rec(root.forbidden, 'forbidden');
  const forbidden = Object.fromEntries(FORBIDDEN_GROUPS.map((g) => [g, texts(forbiddenRaw[g], `forbidden.${g}`)])) as Record<ForbiddenGroup, string[]>;
  const misspellings: Record<string, string[]> = {};
  for (const [right, wrongs] of Object.entries(rec(root.misspellings, 'misspellings'))) misspellings[right] = texts(wrongs, `misspellings.${right}`);
  return {
    work: text(root.work, 'work'),
    credit: text(root.credit, 'credit'),
    rating: text(root.rating, 'rating'),
    knowledge: knowledge(root.knowledge),
    characters,
    narration: { voice: texts(narration.voice, 'narration.voice'), register: register(narration.register, 'narration.register') },
    thought: { voice: texts(thought.voice, 'thought.voice'), register: register(thought.register, 'thought.register') },
    exposure: texts(root.exposure, 'exposure'),
    gmQuips: texts(root.gm_quips, 'gm_quips'),
    places: texts(root.places, 'places'),
    terms: texts(root.terms, 'terms'),
    misspellings,
    forbidden,
  };
}

/** lore 의 지식 세 칸을 시나리오의 수첩 항목으로 붙인다. after 가 없는 비트를 가리키거나 숨길 것에 조건이 없으면 멈춘다. */
export function withNotes(scenario: Scenario, lore: Lore): Scenario {
  const problems = checkNotes(scenario, lore.knowledge);
  if (problems.length) throw new LoreError(`수첩 검증 실패:\n- ${problems.join('\n- ')}`);
  return { ...scenario, notes: lore.knowledge };
}

export async function loadLore(path: string): Promise<Lore> {
  try {
    return parseLore(await Bun.file(path).text());
  } catch (err) {
    if (err instanceof LoreError) throw new LoreError(`${path}\n${err.message}`);
    throw err;
  }
}
