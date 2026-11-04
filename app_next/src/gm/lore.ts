import { checkNotes } from '../engine/scenario.ts';
import { NOTE_KINDS, type NoteEntry, type NoteKind, type NoteTier, type Scenario } from '../engine/types.ts';

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
  voice: string[];
  samples: { speech: string[]; thought: string[] };
  register: Register;
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
  misspellings: Record<string, string[]>;
  forbidden: Record<ForbiddenGroup, string[]>;
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
      voice: texts(r.voice, `characters.${key}.voice`),
      samples: { speech: texts(samples.speech, `characters.${key}.samples.speech`), thought: texts(samples.thought, `characters.${key}.samples.thought`) },
      register: register(r.register, `characters.${key}.register`),
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
