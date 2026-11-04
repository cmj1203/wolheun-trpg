import { condNames, parseCond } from './conditions.ts';
import { type CallbackSpec,
  ABILITIES,
  TIERS,
  TRACKS,
  type Ability,
  type ApproachSpec,
  type AssetSpec,
  type BeatSpec,
  type CastSpec,
  type CastSlots,
  type RefuseSpec,
  type ChoiceSpec,
  type Crop,
  type Effects,
  type EndingSpec,
  type FateSpec,
  type FlagValue,
  type FreeSpec,
  type ItemSpec,
  type Line,
  type LineStyle,
  type Mod,
  type Next,
  type NoteEntry,
  type Outcome,
  OMEN_BAN,
  PRICE_TAGS,
  type PriceSpec,
  type PriceTag,
  type PriceWeight,
  type Scenario,
  type Tier,
  type Track,
} from './types.ts';

export class ScenarioError extends Error {
  override name = 'ScenarioError';
}

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, where: string): string {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string' || v.trim() === '') throw new ScenarioError(`${where}: 글자가 필요합니다`);
  return v;
}
const optStr = (v: unknown, where: string): string | undefined => (v === undefined || v === null ? undefined : str(v, where));
function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ScenarioError(`${where}: 숫자가 필요합니다`);
  return v;
}
function list(v: unknown, where: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ScenarioError(`${where}: 목록이 필요합니다`);
  return v;
}
function rec(v: unknown, where: string): Raw {
  if (!isRecord(v)) throw new ScenarioError(`${where}: 이름: 값 묶음이 필요합니다`);
  return v;
}
function oneOf<T extends string>(v: unknown, options: readonly T[], where: string): T {
  if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) {
    throw new ScenarioError(`${where}: ${options.join(', ')} 중 하나여야 합니다 (받은 값: ${String(v)})`);
  }
  return v as T;
}

const LINE_EXTRAS = ['fx', 'sfx', 'face', 'cg', 'if'] as const;

/**
 * 대사 줄의 face 가 가리키는 입식이 있는지 본다. 화자(또는 같은 인물의 다른 화자, 예: 속마음→아시나)의 입식 이름 뒤에
 * `_face` 를 붙인 입식이 명세에 있어야 한다. neutral 은 기본 입식 그대로다. 없는 표정은 화면에서 조용히 앞 표정으로 남으니 읽을 때 막는다.
 */
export function faceProblem(s: Pick<Scenario, 'cast' | 'sprites'>, speaker: string, face: string): string | null {
  const c = s.cast[speaker];
  if (!c) return null;
  if (c.style === 'narration') return '나레이션 줄에는 face 를 둘 수 없습니다';
  const lore = c.lore ?? speaker;
  const bases = Object.entries(s.cast)
    .filter(([key, x]) => (x.lore ?? key) === lore)
    .flatMap(([, x]) => [x.sprite, x.sprite_alt?.sprite])
    .filter((b): b is string => typeof b === 'string');
  if (bases.length === 0) return `"${speaker}" 에게 입식이 없습니다`;
  if (face === 'neutral') return null;
  const missing = bases.filter((b) => !s.sprites[`${b}_${face}`]);
  return missing.length ? `없는 입식 ${missing.map((b) => `"${b}_${face}"`).join(', ')}` : null;
}

function parseLine(v: unknown, cast: Record<string, CastSpec>, where: string): Line {
  const r = rec(v, where);
  const speakers = Object.keys(r).filter((k) => k !== 'tie' && !(LINE_EXTRAS as readonly string[]).includes(k));
  const speaker = speakers[0];
  if (speakers.length !== 1 || speaker === undefined) throw new ScenarioError(`${where}: "화자: 대사" 한 쌍이 필요합니다`);
  if (!cast[speaker]) throw new ScenarioError(`${where}: cast 에 없는 화자 "${speaker}"`);
  const line: Line = { speaker, text: str(r[speaker], where) };
  for (const key of LINE_EXTRAS) {
    const extra = optStr(r[key], `${where}.${key}`);
    if (extra) line[key] = extra;
  }
  if (r.tie === true) line.tie = true;
  return line;
}

const parseLines = (v: unknown, cast: Record<string, CastSpec>, where: string): Line[] =>
  list(v, where).map((l, i) => parseLine(l, cast, `${where}[${i}]`));

/** 징조 줄: 여우(gm)가 말하지 않고, 결과 이름·규칙 용어(OMEN_BAN)를 쓰지 않는다. */
function parseOmenLines(v: unknown, cast: Record<string, CastSpec>, where: string): Line[] {
  const lines = parseLines(v, cast, where);
  if (!lines.length) throw new ScenarioError(`${where}: 징조 줄이 한 줄 이상 필요합니다`);
  lines.forEach((line, i) => {
    if (cast[line.speaker]?.style === 'gm') throw new ScenarioError(`${where}[${i}]: 징조는 여우가 말하지 않습니다 (화자 "${line.speaker}")`);
    const hit = OMEN_BAN.exec(line.text);
    if (hit) throw new ScenarioError(`${where}[${i}]: 징조 줄에 "${hit[0]}" 을 쓸 수 없습니다`);
  });
  return lines;
}

/** GM 무브 ③ 대가 붙은 기회. 줄이 한 줄 이상이고 여우(GM)는 말하지 않는다. */
function parseOffer(v: unknown, cast: Record<string, CastSpec>, where: string): { lines: Line[]; effects?: Effects } {
  const r = rec(v, where);
  const lines = parseLines(r.lines, cast, `${where}.lines`);
  if (!lines.length) throw new Error(`${where}.lines: 기회 줄이 한 줄 이상 필요합니다`);
  if (lines.some((l) => cast[l.speaker]?.style === 'gm')) throw new Error(`${where}.lines: 기회는 여우가 말하지 않습니다`);
  const effects = parseEffects(r.effects, `${where}.effects`);
  return effects ? { lines, effects } : { lines };
}

function parseEffects(v: unknown, where: string): Effects | undefined {
  if (v === undefined || v === null) return undefined;
  const r = rec(v, where);
  const effects: Effects = {};
  for (const [key, value] of Object.entries(r)) {
    if ((TRACKS as readonly string[]).includes(key)) {
      effects.tracks = { ...effects.tracks, [key as Track]: num(value, `${where}.${key}`) };
    } else if (key === 'flags') {
      const flags: Record<string, FlagValue> = {};
      for (const [name, fv] of Object.entries(rec(value, `${where}.flags`))) {
        if (typeof fv !== 'boolean' && typeof fv !== 'number' && typeof fv !== 'string') throw new ScenarioError(`${where}.flags.${name}: 참/거짓, 숫자, 글자만 됩니다`);
        flags[name] = fv;
      }
      effects.flags = flags;
    } else if (key === 'gain' || key === 'lose') {
      effects[key] = list(value, `${where}.${key}`).map((x, i) => str(x, `${where}.${key}[${i}]`));
    } else {
      throw new ScenarioError(`${where}: 알 수 없는 효과 "${key}" (수치: ${TRACKS.join(', ')} / flags / gain / lose)`);
    }
  }
  return effects;
}

function parseNext(v: unknown, where: string): Next | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v;
  return list(v, where).map((x, i) => {
    const r = rec(x, `${where}[${i}]`);
    const cond = optStr(r.if, `${where}[${i}].if`);
    const to = str(r.to, `${where}[${i}].to`);
    return cond === undefined ? { to } : { if: cond, to };
  });
}

function parseOutcome(v: unknown, cast: Record<string, CastSpec>, where: string): Outcome {
  const r = rec(v, where);
  const outcome: Outcome = { lines: parseLines(r.lines, cast, `${where}.lines`) };
  const gist = optStr(r.gist, `${where}.gist`);
  if (gist) outcome.gist = gist;
  const effects = parseEffects(r.effects, `${where}.effects`);
  if (effects) outcome.effects = effects;
  const next = parseNext(r.next, `${where}.next`);
  if (next) outcome.next = next;
  if (r.price !== undefined) outcome.price = list(r.price, `${where}.price`).map((x, i) => str(x, `${where}.price[${i}]`));
  rejectForbid(r, where);
  const guard = list(r.state_guard, `${where}.state_guard`).map((x, i) => str(x, `${where}.state_guard[${i}]`));
  if (guard.length) outcome.state_guard = guard;
  return outcome;
}

function parsePrice(v: unknown, where: string): PriceSpec {
  const r = rec(v, where);
  const price: PriceSpec = {
    id: str(r.id, `${where}.id`),
    tag: oneOf<PriceTag>(r.tag, PRICE_TAGS, `${where}.tag`),
    weight: oneOf<PriceWeight>(r.weight, ['soft', 'hard'], `${where}.weight`),
    text: str(r.text, `${where}.text`),
  };
  const effects = parseEffects(r.effects, `${where}.effects`);
  if (effects) price.effects = effects;
  const cond = optStr(r.if, `${where}.if`);
  if (cond) price.if = cond;
  if (r.once !== undefined) {
    if (typeof r.once !== 'boolean') throw new ScenarioError(`${where}.once: 참/거짓이 필요합니다`);
    price.once = r.once;
  }
  for (const key of Object.keys(r)) if (!['id', 'tag', 'weight', 'text', 'effects', 'if', 'once'].includes(key)) throw new ScenarioError(`${where}: 알 수 없는 항목 "${key}"`);
  return price;
}

/** soft 대가는 성공을 뒤집지 않는다: 소지품을 잃게 하거나 탈주를 내리거나 플래그를 꺼서는 안 된다. */
function softPriceProblem(p: PriceSpec): string | null {
  if (p.weight !== 'soft') return null;
  if (p.effects?.lose?.length) return 'soft 대가는 소지품을 잃게 할 수 없습니다(hard 로)';
  if ((p.effects?.tracks?.탈주 ?? 0) < 0) return 'soft 대가는 탈주를 내릴 수 없습니다(hard 로)';
  for (const [k, v] of Object.entries(p.effects?.flags ?? {})) if (v === false) return `soft 대가는 플래그를 끔 수 없습니다(${k})`;
  return null;
}

/** 대가 표 규칙: id 고유, 결과의 price 후보는 표에 있고, mixed 후보는 soft 만, soft 는 그 접근의 hit 가 세우는 플래그를 건드리지 않는다. */
export function checkPrices(free: FreeSpec, where: string): string[] {
  const problems: string[] = [];
  const prices = free.prices ?? [];
  const byId = new Map<string, PriceSpec>();
  for (const p of prices) {
    const at = `${where}.prices.${p.id}`;
    if (byId.has(p.id)) problems.push(`${at}: 같은 id 가 두 번 나옵니다`);
    byId.set(p.id, p);
    const soft = softPriceProblem(p);
    if (soft) problems.push(`${at}: ${soft}`);
  }
  const softIds = prices.filter((p) => p.weight === 'soft').map((p) => p.id);
  const sets: [string, Record<Tier, Outcome>][] = [...free.approaches.map((a) => [a.id, a.outcomes] as [string, Record<Tier, Outcome>]), ['improv', free.improv]];
  if (free.improv_bold) sets.push(['improv_bold', free.improv_bold]);
  for (const [id, outcomes] of sets) {
    const at = `${where}.${id}`;
    if (outcomes.hit.price) problems.push(`${at}.hit.price: hit 에는 대가를 두지 않습니다`);
    for (const tier of ['mixed', 'miss'] as const) {
      const listed = outcomes[tier].price;
      if (!listed) continue;
      if (!prices.length) problems.push(`${at}.${tier}.price: 비트에 prices 가 없습니다`);
      if (listed.length === 0) problems.push(`${at}.${tier}.price: 후보가 비어 있습니다`);
      for (const pid of listed) {
        const p = byId.get(pid);
        if (!p) problems.push(`${at}.${tier}.price: 표에 없는 대가 "${pid}"`);
        else if (tier === 'mixed' && p.weight !== 'soft') problems.push(`${at}.mixed.price: 7~9 에는 soft 대가만 둡니다 ("${pid}" 는 hard)`);
      }
    }
    if (!prices.length) continue;
    const hitFlags = Object.entries(outcomes.hit.effects?.flags ?? {}).filter(([, v]) => v !== false).map(([k]) => k);
    const mixedIds = outcomes.mixed.price ?? softIds;
    if (mixedIds.length === 0) problems.push(`${at}.mixed: 뽑을 soft 대가가 없습니다`);
    for (const pid of mixedIds) {
      const p = byId.get(pid);
      if (!p) continue;
      const clash = Object.keys(p.effects?.flags ?? {}).find((k) => hitFlags.includes(k));
      if (clash) problems.push(`${where}.prices.${pid}: soft 대가가 ${id} 의 hit 플래그 '${clash}' 를 건드립니다`);
    }
  }
  return problems;
}

/** 예전 이름 forbid 는 조용히 버려지지 않게 바로 알린다. 상태 표현은 state_guard, 이름·사실은 설정 사전의 숨긴 항목에 쓴다. */
function rejectForbid(r: Raw, where: string): void {
  if (r.forbid !== undefined) throw new ScenarioError(`${where}.forbid: forbid 는 없어졌습니다. 엔진 상태와 어긋나는 표현은 state_guard 에, 아직 모르는 이름·사실은 설정 사전 knowledge.hidden[].keys 에 적으세요`);
}

function parseOutcomes(v: unknown, cast: Record<string, CastSpec>, where: string): Record<Tier, Outcome> {
  const r = rec(v, where);
  const out = {} as Record<Tier, Outcome>;
  for (const tier of TIERS) {
    if (r[tier] === undefined) throw new ScenarioError(`${where}: ${tier} 결과가 없습니다 (hit, mixed, miss 모두 필요)`);
    out[tier] = parseOutcome(r[tier], cast, `${where}.${tier}`);
  }
  return out;
}

function parseMods(v: unknown, where: string): Mod[] | undefined {
  const mods = list(v, where).map((x, i) => {
    const r = rec(x, `${where}[${i}]`);
    return { if: str(r.if, `${where}[${i}].if`), value: num(r.value, `${where}[${i}].value`), label: str(r.label, `${where}[${i}].label`) };
  });
  return mods.length ? mods : undefined;
}

function parseChoice(v: unknown, cast: Record<string, CastSpec>, where: string): ChoiceSpec {
  const r = rec(v, where);
  const choice: ChoiceSpec = { id: str(r.id, `${where}.id`), text: str(r.text, `${where}.text`) };
  const cond = optStr(r.if, `${where}.if`);
  if (cond) choice.if = cond;
  if (r.check !== undefined) {
    const c = rec(r.check, `${where}.check`);
    choice.check = { stat: oneOf(c.stat, ABILITIES, `${where}.check.stat`), label: str(c.label, `${where}.check.label`) };
    const mods = parseMods(c.mods, `${where}.check.mods`);
    if (mods) choice.check.mods = mods;
    choice.outcomes = parseOutcomes(r.outcomes, cast, `${where}.outcomes`);
  } else {
    choice.lines = parseLines(r.lines, cast, `${where}.lines`);
    const effects = parseEffects(r.effects, `${where}.effects`);
    if (effects) choice.effects = effects;
  }
  const next = parseNext(r.next, `${where}.next`);
  if (next) choice.next = next;
  return choice;
}

function parseApproach(v: unknown, cast: Record<string, CastSpec>, where: string): ApproachSpec {
  const r = rec(v, where);
  const approach: ApproachSpec = {
    id: str(r.id, `${where}.id`),
    label: str(r.label, `${where}.label`),
    stat: oneOf(r.stat, ABILITIES, `${where}.stat`),
    hint: str(r.hint, `${where}.hint`),
    examples: list(r.examples, `${where}.examples`).map((x, i) => str(x, `${where}.examples[${i}]`)),
    keywords: list(r.keywords, `${where}.keywords`).map((x, i) => str(x, `${where}.keywords[${i}]`)),
    outcomes: parseOutcomes(r.outcomes, cast, `${where}.outcomes`),
  };
  const item = optStr(r.item, `${where}.item`);
  if (item) approach.item = item;
  const mods = parseMods(r.mods, `${where}.mods`);
  if (mods) approach.mods = mods;
  const before = parseEffects(r.before, `${where}.before`);
  if (before) approach.before = before;
  if (r.presume !== undefined) approach.presume = list(r.presume, `${where}.presume`).map((x, i) => str(x, `${where}.presume[${i}]`));
  if (r.said !== undefined) {
    const s = rec(r.said, `${where}.said`);
    approach.said = { flag: str(s.flag, `${where}.said.flag`), words: list(s.words, `${where}.said.words`).map((x, i) => str(x, `${where}.said.words[${i}]`)) };
  }
  return approach;
}

function parseFree(v: unknown, cast: Record<string, CastSpec>, where: string, defaults: Raw): FreeSpec {
  const r = { ...defaults, ...rec(v, where) };
  const strings = (key: string) => list(r[key], `${where}.${key}`).map((x, i) => str(x, `${where}.${key}[${i}]`));
  const free: FreeSpec = {
    prompt: str(r.prompt, `${where}.prompt`),
    ...(r.aim === undefined ? {} : { aim: str(r.aim, `${where}.aim`) }),
    situation: str(r.situation, `${where}.situation`),
    goal: str(r.goal, `${where}.goal`),
    speakers: strings('speakers'),
    must_not: strings('must_not'),
    state_guard: strings('state_guard'),
    echo_only: strings('echo_only'),
    patience: r.patience === undefined ? 3 : num(r.patience, `${where}.patience`),
    talk_fallback: parseLines(r.talk_fallback, cast, `${where}.talk_fallback`),
    press: parseLines(r.press, cast, `${where}.press`),
    ...(r.nudge !== undefined ? { nudge: parseLines(r.nudge, cast, `${where}.nudge`) } : {}),
    ...(r.offer !== undefined ? { offer: parseOffer(r.offer, cast, `${where}.offer`) } : {}),
    deflect: parseLines(r.deflect, cast, `${where}.deflect`),
    improv: parseOutcomes(r.improv, cast, `${where}.improv`),
    ...(r.improv_bold === undefined ? {} : { improv_bold: parseOutcomes(r.improv_bold, cast, `${where}.improv_bold`) }),
    ...(r.neutral === undefined
      ? {}
      : { neutral: Object.fromEntries(TIERS.map((t) => [t, parseLines(rec(r.neutral, `${where}.neutral`)[t], cast, `${where}.neutral.${t}`)])) as Record<Tier, Line[]> }),
    ...(r.prices === undefined ? {} : { prices: list(r.prices, `${where}.prices`).map((p, i) => parsePrice(p, `${where}.prices[${i}]`)) }),
    turns: r.turns === undefined ? 1 : num(r.turns, `${where}.turns`),
    default_approach: str(r.default_approach, `${where}.default_approach`),
    ...(r.addressed === undefined ? {} : { addressed: str(r.addressed, `${where}.addressed`) }),
    approaches: list(r.approaches, `${where}.approaches`).map((a, i) => parseApproach(a, cast, `${where}.approaches[${i}]`)),
  };
  rejectForbid(r, where);
  const until = optStr(r.until, `${where}.until`);
  if (until) free.until = until;
  const next = parseNext(r.next, `${where}.next`);
  if (next) free.next = next;
  return free;
}

function parseCastSlots(v: unknown, where: string): CastSlots | undefined {
  if (v === undefined || v === null) return undefined;
  const r = rec(v, where);
  const slots: CastSlots = {};
  for (const key of ['left', 'center', 'right'] as const) {
    if (r[key] === null) slots[key] = null;
    else if (r[key] !== undefined) slots[key] = str(r[key], `${where}.${key}`);
  }
  return slots;
}

function parseBeat(id: string, v: unknown, cast: Record<string, CastSpec>, freeDefaults: Raw): BeatSpec {
  const where = `beats.${id}`;
  const r = rec(v, where);
  const beat: BeatSpec = { id, title: str(r.title, `${where}.title`), lines: parseLines(r.lines, cast, `${where}.lines`) };
  if (r.situation !== undefined) beat.situation = str(r.situation, `${where}.situation`);
  rejectForbid(r, where);
  const cut = optStr(r.cut, `${where}.cut`);
  if (cut) beat.cut = cut;
  const bg = optStr(r.bg, `${where}.bg`);
  if (bg) beat.bg = bg;
  const slots = parseCastSlots(r.cast, `${where}.cast`);
  if (slots) beat.cast = slots;
  if (r.time !== undefined) beat.time = num(r.time, `${where}.time`);
  const effects = parseEffects(r.effects, `${where}.effects`);
  if (effects) beat.effects = effects;
  if (r.choices !== undefined) beat.choices = list(r.choices, `${where}.choices`).map((c, i) => parseChoice(c, cast, `${where}.choices[${i}]`));
  if (r.free !== undefined) beat.free = parseFree(r.free, cast, `${where}.free`, freeDefaults);
  const next = parseNext(r.next, `${where}.next`);
  if (next) beat.next = next;
  if (r.ending !== undefined) {
    const e = rec(r.ending, `${where}.ending`);
    const ending: EndingSpec = {
      id: str(e.id, `${where}.ending.id`),
      title: str(e.title, `${where}.ending.title`),
      summary: str(e.summary, `${where}.ending.summary`),
      next_hook: str(e.next_hook, `${where}.ending.next_hook`),
    };
    if (e.bad === true) ending.bad = true;
    beat.ending = ending;
  }
  return beat;
}

function parseAssets(v: unknown, where: string, needsPlaceholder: boolean): Record<string, AssetSpec> {
  const out: Record<string, AssetSpec> = {};
  if (v === undefined || v === null) return out;
  for (const [id, raw] of Object.entries(rec(v, where))) {
    const at = `${where}.${id}`;
    const r = rec(raw, at);
    const asset: AssetSpec = { label: str(r.label, `${at}.label`) };
    const placeholder = needsPlaceholder ? str(r.placeholder, `${at}.placeholder`) : optStr(r.placeholder, `${at}.placeholder`);
    if (placeholder) asset.placeholder = placeholder;
    const file = optStr(r.file, `${at}.file`);
    if (file) asset.file = file;
    if (r.crop !== undefined) {
      const crop = list(r.crop, `${at}.crop`).map((n, i) => num(n, `${at}.crop[${i}]`));
      if (crop.length !== 4 || crop.some((n) => n < 0) || (crop[2] ?? 0) <= 0 || (crop[3] ?? 0) <= 0) throw new ScenarioError(`${at}.crop: [x, y, 너비, 높이] 네 수가 필요합니다`);
      asset.crop = crop as Crop;
    }
    if (r.fit !== undefined) asset.fit = oneOf(r.fit, ['cover', 'contain'] as const, `${at}.fit`);
    if (r.alt !== undefined) {
      const alt = rec(r.alt, `${at}.alt`);
      asset.alt = { if: str(alt.if, `${at}.alt.if`), id: str(alt.id, `${at}.alt.id`) };
    }
    out[id] = asset;
  }
  return out;
}

export function linesOfBeat(beat: BeatSpec): Line[] {
  const out = [...beat.lines];
  for (const c of beat.choices ?? []) {
    out.push(...(c.lines ?? []));
    for (const tier of TIERS) out.push(...(c.outcomes?.[tier].lines ?? []));
  }
  if (beat.free) {
    out.push(...beat.free.press, ...beat.free.deflect, ...beat.free.talk_fallback);
    for (const tier of TIERS) out.push(...beat.free.improv[tier].lines, ...(beat.free.improv_bold?.[tier].lines ?? []));
    for (const a of beat.free.approaches) for (const tier of TIERS) out.push(...a.outcomes[tier].lines);
  }
  return out;
}

export function parseScenario(text: string): Scenario {
  const root = rec(Bun.YAML.parse(text), 'scenario');
  const cast: Record<string, CastSpec> = {};
  for (const [key, raw] of Object.entries(rec(root.cast, 'cast'))) {
    const r = rec(raw, `cast.${key}`);
    const spec: CastSpec = { display: typeof r.display === 'string' ? r.display : '', style: oneOf<LineStyle>(r.style, ['speech', 'thought', 'narration', 'gm'], `cast.${key}.style`) };
    const sprite = optStr(r.sprite, `cast.${key}.sprite`);
    if (sprite) spec.sprite = sprite;
    if (r.sprite_alt !== undefined) {
      const alt = rec(r.sprite_alt, `cast.${key}.sprite_alt`);
      spec.sprite_alt = { if: str(alt.if, `cast.${key}.sprite_alt.if`), sprite: str(alt.sprite, `cast.${key}.sprite_alt.sprite`) };
    }
    const lore = optStr(r.lore, `cast.${key}.lore`);
    if (lore) spec.lore = lore;
    cast[key] = spec;
  }
  const sheet = rec(root.sheet, 'sheet');
  const abilitiesRaw = rec(sheet.abilities, 'sheet.abilities');
  const tracksRaw = rec(sheet.tracks, 'sheet.tracks');
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, num(abilitiesRaw[a], `sheet.abilities.${a}`)])) as Record<Ability, number>;
  const tracks = Object.fromEntries(TRACKS.map((t) => [t, num(tracksRaw[t], `sheet.tracks.${t}`)])) as Record<Track, number>;
  const items: ItemSpec[] = list(sheet.items, 'sheet.items').map((x, i) => {
    const r = rec(x, `sheet.items[${i}]`);
    const item: ItemSpec = { id: str(r.id, `sheet.items[${i}].id`), name: str(r.name, `sheet.items[${i}].name`), desc: str(r.desc, `sheet.items[${i}].desc`) };
    if (r.hidden === true) item.hidden = true;
    return item;
  });
  const beats: Record<string, BeatSpec> = {};
  for (const [id, raw] of Object.entries(rec(root.beats, 'beats'))) beats[id] = parseBeat(id, raw, cast, root.free_defaults === undefined ? {} : rec(root.free_defaults, 'free_defaults'));
  const scenario: Scenario = {
    id: str(root.id, 'id'),
    title: str(root.title, 'title'),
    episode: str(root.episode, 'episode'),
    source: str(root.source, 'source'),
    rating: str(root.rating, 'rating'),
    start: str(root.start, 'start'),
    sheet: {
      name: str(sheet.name, 'sheet.name'),
      abilities,
      tracks,
      items,
      ...(sheet.reveal === undefined
        ? {}
        : (() => {
            const one = (v: unknown, at: string) => {
              const r = rec(v, at);
              return { note: str(r.note, `${at}.note`), tracks: list(r.tracks, `${at}.tracks`).map((t, i) => oneOf<Track>(t, TRACKS, `${at}.tracks[${i}]`)) };
            };
            return { reveal: Array.isArray(sheet.reveal) ? sheet.reveal.map((v, i) => one(v, `sheet.reveal[${i}]`)) : [one(sheet.reveal, 'sheet.reveal')] };
          })()),
    },
    cast,
    backgrounds: parseAssets(root.backgrounds, 'backgrounds', true),
    sprites: parseAssets(root.sprites, 'sprites', true),
    cgs: parseAssets(root.cgs, 'cgs', false),
    beats,
    callbacks: list(root.callbacks ?? [], 'callbacks').map((x, i) => {
      const where = `callbacks[${i}]`;
      const r = rec(x, where);
      const spec: CallbackSpec = { flag: str(r.flag, `${where}.flag`), after: list(r.after, `${where}.after`).map((a, k) => str(a, `${where}.after[${k}]`)), line: parseLine(r.line, cast, `${where}.line`) };
      if (r.words !== undefined) spec.words = list(r.words, `${where}.words`).map((w, k) => str(w, `${where}.words[${k}]`));
      return spec;
    }),
    foreshadow: list(root.foreshadow ?? [], 'foreshadow').map((x, i) => {
      const where = `foreshadow[${i}]`;
      const r = rec(x, where);
      const words = (v: unknown, at: string) => list(v, at).map((w, k) => str(w, `${at}[${k}]`));
      return { id: str(r.id, `${where}.id`), at: str(r.at, `${where}.at`), words: words(r.words, `${where}.words`), beats: words(r.beats, `${where}.beats`) };
    }),
    council: list(root.council ?? [], 'council').map((v, i) => str(v, `council[${i}]`)),
    ...(root.atlas !== undefined
      ? (() => {
          const a = rec(root.atlas, 'atlas');
          return {
            atlas: {
              nodes: list(a.nodes, 'atlas.nodes').map((v, i) => {
                const r = rec(v, `atlas.nodes[${i}]`);
                return { id: str(r.id, `atlas.nodes[${i}].id`), col: num(r.col, `atlas.nodes[${i}].col`), row: num(r.row, `atlas.nodes[${i}].row`), beats: list(r.beats, `atlas.nodes[${i}].beats`).map((b, k) => str(b, `atlas.nodes[${i}].beats[${k}]`)), ...(r.ending === true ? { ending: true } : {}), ...(r.hints !== undefined ? { hints: list(r.hints, `atlas.nodes[${i}].hints`).map((h, k) => str(h, `atlas.nodes[${i}].hints[${k}]`)) } : {}) };
              }),
              edges: list(a.edges, 'atlas.edges').map((v, i) => {
                const e = list(v, `atlas.edges[${i}]`);
                return [str(e[0], `atlas.edges[${i}][0]`), str(e[1], `atlas.edges[${i}][1]`)] as [string, string];
              }),
            },
          };
        })()
      : {}),
    risky: list(root.risky ?? [], 'risky').map((x, i) => {
      const where = `risky[${i}]`;
      const r = rec(x, where);
      return {
        words: list(r.words, `${where}.words`).map((w, k) => str(w, `${where}.words[${k}]`)),
        warn: str(r.warn, `${where}.warn`),
        ...(r.with !== undefined ? { with: str(r.with, `${where}.with`) } : {}),
        ...(r.quit === true ? { quit: true } : {}),
      };
    }),
    refuse: list(root.refuse ?? [], 'refuse').map((x, i) => {
      const where = `refuse[${i}]`;
      const r = rec(x, where);
      return {
        id: oneOf<RefuseSpec['id']>(r.id, ['unmask'], `${where}.id`),
        words: list(r.words, `${where}.words`).map((w, k) => str(w, `${where}.words[${k}]`)),
        unless: list(r.unless ?? [], `${where}.unless`).map((u, k) => str(u, `${where}.unless[${k}]`)),
        lines: parseLines(r.lines, cast, `${where}.lines`),
      };
    }),
    ...(root.danger !== undefined
      ? (() => {
          const d = rec(root.danger, 'danger');
          return { danger: { with: str(d.with, 'danger.with'), omen: parseOmenLines(d.omen, cast, 'danger.omen') } };
        })()
      : {}),
    ...(root.identity !== undefined
      ? (() => {
          const d = rec(root.identity, 'identity');
          const effects = parseEffects(d.effects, 'identity.effects');
          if (!effects) throw new ScenarioError('identity.effects: 큰 행동의 효과가 필요합니다');
          return {
            identity: {
              with: str(d.with, 'identity.with'),
              words: list(d.words, 'identity.words').map((w, k) => str(w, `identity.words[${k}]`)),
              omen: parseOmenLines(d.omen, cast, 'identity.omen'),
              effects,
            },
          };
        })()
      : {}),
    fates: list(root.fates ?? [], 'fates').map((x, i) => {
      const where = `fates[${i}]`;
      const r = rec(x, where);
      const fate: FateSpec = { id: str(r.id, `${where}.id`), when: str(r.when, `${where}.when`), to: str(r.to, `${where}.to`) };
      if (r.warn !== undefined) {
        const w = rec(r.warn, `${where}.warn`);
        fate.warn = { when: str(w.when, `${where}.warn.when`), lines: parseOmenLines(w.lines, cast, `${where}.warn.lines`) };
      }
      return fate;
    }),
    gameHelp: list(root.game_help ?? [], 'game_help').map((x, i) => {
      const r = rec(x, `game_help[${i}]`);
      return {
        id: str(r.id, `game_help[${i}].id`),
        name: str(r.name, `game_help[${i}].name`),
        say: str(r.say, `game_help[${i}].say`),
        ...(r.track !== undefined ? { track: oneOf<Track>(r.track, TRACKS, `game_help[${i}].track`) } : {}),
      };
    }),
    ...(root.stage !== undefined
      ? (() => {
          const st = rec(root.stage, 'stage');
          const words = (v: unknown, at: string) => list(v, at).map((w, k) => str(w, `${at}[${k}]`));
          return { stage: { who: str(st.who, 'stage.who'), met: str(st.met, 'stage.met'), near: words(st.near, 'stage.near'), unseen: words(st.unseen, 'stage.unseen'), gone: words(st.gone, 'stage.gone') } };
        })()
      : {}),
    facts: list(root.facts ?? [], 'facts').map((x, i) => {
      const r = rec(x, `facts[${i}]`);
      rejectForbid(r, `facts[${i}]`);
      return { if: str(r.if, `facts[${i}].if`), text: str(r.text, `facts[${i}].text`), state_guard: list(r.state_guard ?? [], `facts[${i}].state_guard`).map((t, j) => str(t, `facts[${i}].state_guard[${j}]`)) };
    }),
  };
  const problems = checkScenario(scenario);
  if (problems.length) throw new ScenarioError(`시나리오 검증 실패:\n- ${problems.join('\n- ')}`);
  return scenario;
}

export async function loadScenario(path: string): Promise<Scenario> {
  try {
    return parseScenario(await Bun.file(path).text());
  } catch (err) {
    if (err instanceof ScenarioError) throw new ScenarioError(`${path}\n${err.message}`);
    throw err;
  }
}

function nextTargets(next: Next | undefined): string[] {
  if (next === undefined) return [];
  return typeof next === 'string' ? [next] : next.map((r) => r.to);
}

function* outcomesOf(beat: BeatSpec): Generator<[string, Outcome]> {
  for (const c of beat.choices ?? []) for (const tier of TIERS) if (c.outcomes) yield [`choices.${c.id}.${tier}`, c.outcomes[tier]];
  for (const a of beat.free?.approaches ?? []) for (const tier of TIERS) yield [`free.${a.id}.${tier}`, a.outcomes[tier]];
  for (const tier of TIERS) if (beat.free) yield [`free.improv.${tier}`, beat.free.improv[tier]];
  for (const tier of TIERS) if (beat.free?.improv_bold) yield [`free.improv_bold.${tier}`, beat.free.improv_bold[tier]];
}

export function edgesOf(beat: BeatSpec): string[] {
  const edges = [...nextTargets(beat.next), ...nextTargets(beat.free?.next)];
  for (const c of beat.choices ?? []) edges.push(...nextTargets(c.next));
  for (const [, o] of outcomesOf(beat)) edges.push(...nextTargets(o.next));
  return edges;
}

/**
 * 직접 입력한 판에서 GM 이 실패했을 때 대신 쓸 수 있는 판정 대사. 플레이어 대신 말하는 주인공 대사와
 * 특정 말·몸짓을 전제로 하는 줄(tie)은 빼서, 플레이어가 하지 않은 말이 화면에 나오지 않게 한다.
 */
export function typedFallbackLines(s: Scenario, lines: readonly Line[]): Line[] {
  return lines.filter((l) => !l.tie && !(s.cast[l.speaker]?.style === 'speech' && s.cast[l.speaker]?.lore === s.sheet.name));
}

/** 수첩 항목 검사. 숨길 것은 조건 없이 적힐 수 없고, after 는 있는 비트여야 한다. */
export function checkNotes(s: Scenario, notes: readonly NoteEntry[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const n of notes) {
    const where = `knowledge.${n.tier}.${n.id}`;
    if (ids.has(n.id)) problems.push(`${where}: 같은 id 가 두 번 나옵니다`);
    ids.add(n.id);
    if (n.tier === 'hidden' && !n.if) problems.push(`${where}: 숨길 것에는 언제 알게 되는지 if 조건이 필요합니다`);
    if (n.tier === 'hidden' && n.intro) problems.push(`${where}: 숨길 것에는 intro 를 둘 수 없습니다`);
    for (const b of n.after ?? []) if (!s.beats[b]) problems.push(`${where}.after: 없는 비트 "${b}"`);
    if (n.intro && !n.after?.length) problems.push(`${where}: intro 는 after 가 있는 항목에만 둡니다`);
    if (n.if) {
      try {
        parseCond(n.if);
      } catch (err) {
        problems.push(`${where}.if: ${(err as Error).message}`);
      }
    }
  }
  return problems;
}

export function checkScenario(s: Scenario): string[] {
  const problems: string[] = [];
  const itemIds = new Set(s.sheet.items.map((i) => i.id));
  const knownNumbers = new Set<string>([...TRACKS, ...ABILITIES]);
  const checkCond = (cond: string, where: string) => {
    try {
      parseCond(cond);
      const names = condNames(cond);
      for (const it of names.items) if (!itemIds.has(it)) problems.push(`${where}: 없는 소지품 "${it}"`);
      for (const n of names.numbers) if (!knownNumbers.has(n)) problems.push(`${where}: 수치나 능력치가 아닌 이름 "${n}" (flag 는 flag:이름 으로 씁니다)`);
    } catch (err) {
      problems.push(`${where}: ${(err as Error).message}`);
    }
  };
  const checkNext = (next: Next | undefined, where: string) => {
    if (next === undefined) return;
    for (const to of nextTargets(next)) if (!s.beats[to]) problems.push(`${where}: 없는 비트 "${to}"`);
    if (Array.isArray(next)) {
      next.forEach((r, i) => r.if && checkCond(r.if, `${where}[${i}].if`));
      if (next.at(-1)?.if !== undefined) problems.push(`${where}: 조건 분기의 마지막 항목은 조건 없는 기본 경로여야 합니다`);
    }
  };
  const checkEffects = (e: Effects | undefined, where: string) => {
    for (const id of [...(e?.gain ?? []), ...(e?.lose ?? [])]) if (!itemIds.has(id)) problems.push(`${where}: 없는 소지품 "${id}"`);
  };

  if (!s.beats[s.start]) problems.push(`start: 없는 비트 "${s.start}"`);
  s.facts.forEach((f, i) => checkCond(f.if, `facts[${i}].if`));
  const fateIds = new Set<string>();
  for (const f of s.fates ?? []) {
    const where = `fates.${f.id}`;
    if (fateIds.has(f.id)) problems.push(`${where}: 같은 id 가 두 번 나옵니다`);
    fateIds.add(f.id);
    checkCond(f.when, `${where}.when`);
    if (f.warn) checkCond(f.warn.when, `${where}.warn.when`);
    const to = s.beats[f.to];
    if (!to) problems.push(`${where}.to: 없는 비트 "${f.to}"`);
    else if (!to.ending?.bad) problems.push(`${where}.to: 작은 끝은 ending.bad 가 참인 결말 비트여야 합니다 ("${f.to}")`);
  }
  for (const [id, cg] of Object.entries(s.cgs)) {
    if (!cg.alt) continue;
    checkCond(cg.alt.if, `cgs.${id}.alt.if`);
    if (!s.cgs[cg.alt.id]) problems.push(`cgs.${id}.alt.id: 없는 이벤트 CG "${cg.alt.id}"`);
  }
  for (const [key, c] of Object.entries(s.cast)) {
    if (c.sprite && !s.sprites[c.sprite]) problems.push(`cast.${key}.sprite: 없는 입식 "${c.sprite}"`);
    if (c.sprite_alt) {
      if (!s.sprites[c.sprite_alt.sprite]) problems.push(`cast.${key}.sprite_alt.sprite: 없는 입식 "${c.sprite_alt.sprite}"`);
      checkCond(c.sprite_alt.if, `cast.${key}.sprite_alt.if`);
    }
  }

  for (const beat of Object.values(s.beats)) {
    const where = `beats.${beat.id}`;
    if (beat.bg && !s.backgrounds[beat.bg]) problems.push(`${where}.bg: 없는 배경 "${beat.bg}"`);
    for (const line of linesOfBeat(beat)) {
      if (line.cg && !s.cgs[line.cg]) problems.push(`${where}: 없는 이벤트 CG "${line.cg}"`);
      if (line.face) {
        const bad = faceProblem(s, line.speaker, line.face);
        if (bad) problems.push(`${where}: 대사 "${line.text}" 의 face "${line.face}": ${bad}`);
      }
      if (line.if) checkCond(line.if, `${where}: 대사 "${line.text}" 의 if`);
    }
    for (const [id, cg] of Object.entries(s.cgs)) if (!cg.file) problems.push(`cgs.${id}.file: 이벤트 CG 에는 파일이 필요합니다`);
    for (const slot of Object.values(beat.cast ?? {})) if (slot && !s.cast[slot]) problems.push(`${where}.cast: cast 에 없는 인물 "${slot}"`);
    checkEffects(beat.effects, `${where}.effects`);
    checkNext(beat.next, `${where}.next`);
    const waits = beat.choices !== undefined || beat.free !== undefined;
    if (beat.ending) {
      if (waits || beat.next !== undefined) problems.push(`${where}: 결말 비트에는 choices, free, next 를 둘 수 없습니다`);
    } else if (!waits && beat.next === undefined) {
      problems.push(`${where}: choices, free, next, ending 중 하나가 필요합니다`);
    }
    if (beat.choices && beat.free) problems.push(`${where}: choices 와 free 를 한 비트에 함께 둘 수 없습니다`);
    for (const c of beat.choices ?? []) {
      if (c.if) checkCond(c.if, `${where}.choices.${c.id}.if`);
      c.check?.mods?.forEach((m, i) => checkCond(m.if, `${where}.choices.${c.id}.check.mods[${i}]`));
      checkNext(c.next, `${where}.choices.${c.id}.next`);
      checkEffects(c.effects, `${where}.choices.${c.id}.effects`);
      const everyOutcomeRoutes = c.outcomes ? TIERS.every((t) => c.outcomes?.[t].next !== undefined) : false;
      if (c.next === undefined && beat.next === undefined && !everyOutcomeRoutes) problems.push(`${where}.choices.${c.id}: 다음 비트가 정해지지 않습니다`);
    }
    if (beat.choices && beat.choices.length === 0) problems.push(`${where}.choices: 선택지가 비어 있습니다`);
    const free = beat.free;
    if (free) {
      const ids = new Set(free.approaches.map((a) => a.id));
      if (free.approaches.length === 0) problems.push(`${where}.free.approaches: 접근이 하나 이상 필요합니다`);
      if (!ids.has(free.default_approach)) problems.push(`${where}.free.default_approach: 없는 접근 "${free.default_approach}"`);
      if (free.addressed && !ids.has(free.addressed)) problems.push(`${where}.free.addressed: 없는 접근 "${free.addressed}"`);
      const def = free.approaches.find((a) => a.id === free.default_approach);
      if (def?.item) problems.push(`${where}.free.default_approach: 기본 접근에는 소지품 조건을 둘 수 없습니다`);
      for (const sp of free.speakers) if (!s.cast[sp]) problems.push(`${where}.free.speakers: cast 에 없는 화자 "${sp}"`);
      if (free.talk_fallback.length === 0) problems.push(`${where}.free.talk_fallback: GM 이 실패할 때 쓸 대사가 필요합니다`);
      if (free.press.length === 0) problems.push(`${where}.free.press: 재촉할 때 쓸 대사가 필요합니다`);
      if (free.deflect.length === 0) problems.push(`${where}.free.deflect: 등급에 안 맞는 입력을 돌릴 대사가 필요합니다`);
      if (free.patience < 1) problems.push(`${where}.free.patience: 1 이상이어야 합니다`);
      if (free.turns < 1) problems.push(`${where}.free.turns: 1 이상이어야 합니다`);
      if (free.until) checkCond(free.until, `${where}.free.until`);
      checkNext(free.next, `${where}.free.next`);
      for (const a of free.approaches) {
        if (a.item && !itemIds.has(a.item)) problems.push(`${where}.free.${a.id}.item: 없는 소지품 "${a.item}"`);
        a.mods?.forEach((m, i) => checkCond(m.if, `${where}.free.${a.id}.mods[${i}]`));
      }
      for (const p of free.prices ?? []) {
        checkEffects(p.effects, `${where}.free.prices.${p.id}.effects`);
        if (p.if) checkCond(p.if, `${where}.free.prices.${p.id}.if`);
      }
      problems.push(...checkPrices(free, `${where}.free`));
      const everyRoutes = free.approaches.every((a) => TIERS.every((t) => a.outcomes[t].next !== undefined));
      if (free.next === undefined && beat.next === undefined && !everyRoutes) problems.push(`${where}.free: 턴이 끝난 뒤 갈 비트(next)가 필요합니다`);
    }
    for (const [path, o] of outcomesOf(beat)) {
      checkNext(o.next, `${where}.${path}.next`);
      checkEffects(o.effects, `${where}.${path}.effects`);
      if (o.lines.length === 0) problems.push(`${where}.${path}.lines: 작가 대사가 비어 있습니다 (GM 실패 시 대체 대사)`);
    }
    for (const a of free?.approaches ?? []) {
      for (const t of TIERS) {
        const kept = typedFallbackLines(s, a.outcomes[t].lines);
        if (kept.length === 0 && !free?.neutral?.[t].length) problems.push(`${where}.free.${a.id}.${t}: 직접 입력한 판에서 GM 이 실패하면 남는 대사가 없습니다(free.neutral 이 필요합니다)`);
      }
    }
    for (const a of free?.approaches ?? []) for (const t of TIERS) if (!a.outcomes[t].gist) problems.push(`${where}.free.${a.id}.${t}.gist: GM 이 연출할 요지가 필요합니다`);
    for (const t of TIERS) if (free && !free.improv[t].gist) problems.push(`${where}.free.improv.${t}.gist: GM 이 연출할 요지가 필요합니다`);
    for (const t of TIERS) if (free?.improv_bold && !free.improv_bold[t].gist) problems.push(`${where}.free.improv_bold.${t}.gist: GM 이 연출할 요지가 필요합니다`);
  }

  const seen = new Set<string>();
  // 플레이어가 끝내겠다고 하면 어디서든 가는 결말이다. 작은 끝도 상태 조건으로 어디서든 간다.
  const queue = [s.start, ...(s.risky?.some((r) => r.quit) ? ['e_quit'] : []), ...(s.fates ?? []).map((f) => f.to)];
  while (queue.length) {
    const id = queue.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    const beat = s.beats[id];
    if (beat) queue.push(...edgesOf(beat));
  }
  for (const id of Object.keys(s.beats)) if (!seen.has(id)) problems.push(`beats.${id}: 시작에서 닿을 수 없는 비트입니다`);
  if (!Object.values(s.beats).some((b) => b.ending && seen.has(b.id))) problems.push('닿을 수 있는 결말 비트가 없습니다');
  return problems;
}
