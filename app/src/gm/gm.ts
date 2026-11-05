import { seedFrom } from '../engine/dice.ts';
import { ABOUT_UNKNOWN, activeFacts, gmSpeakerOf, noteOpen, type GmContext, type GmLines, type GmMeta, type GmPort, type InputRisk, type InputScreen, type Interpretation, type NarrateContext } from '../engine/engine.ts';
import { edgesOf, linesOfBeat, typedFallbackLines } from '../engine/scenario.ts';
import { isAboutSelf, isActionText, isAsking, isNoise, isPlainQuestion, isPolite, isSpokenText } from '../engine/text.ts';
import { ABILITIES, type Ability, type GmTask, type Line, type NoteEntry, type Scenario, type Tier } from '../engine/types.ts';
import { LlmError, type LlmClient, type LlmResult } from './llm.ts';
import { loreFor, spoilersFor, type Lore } from './lore.ts';
import { buildQuipUser, buildExplainUser, buildInterpretUser, buildNarrateUser, buildSystem, buildTalkUser, INPUT_KINDS, interpretSchema, linesSchema, type InputKind } from './prompt.ts';
import { ITEM_RULE_MIN_SCORE, ruleInterpret } from './rules.ts';
import { facedSpeakers, feedbackFor, forbiddenIn, mentions, normalizeKo, validateOutput, type CheckOptions, type ReservedLine, type Violation } from './validate.ts';

export interface GmTrace {
  task: GmTask;
  beat: string;
  attempt: number;
  input: string;
  raw: string;
  violations: Violation[];
  llm: LlmResult | null;
  error: string | null;
}

export interface GmOptions {
  retries: number;
  softRetries: number;
  temperature: number;
  interpretTemperature: number;
  maxLines: number;
  talkLines: number;
  maxChars: number;
  budgetMs: number;
  onTrace?: (trace: GmTrace) => void;
}

/** 답을 구하는 물음이 될 수 있는 입력 종류. */
const QUESTION_KINDS: readonly InputKind[] = ['how', 'lore', 'game'];
const SELF_OR_GAME: readonly InputKind[] = ['self', 'game'];
const LORE_OR_GAME: readonly InputKind[] = ['lore', 'game'];
const RISKS: readonly InputRisk[] = ['attack', 'unmask', 'identity'];
/** 게임 질문의 대상을 고르지 못했을 때의 항목. */
const HELP_OTHER = 'other';
const HELP_PLAY = 'play';
const DIFFICULTY: Record<string, number> = { 쉬움: 1, 보통: 0, 어려움: -1 };
/** 입력이나 결과에 이동이 없는데 모델이 지어내는 이동. */
const INVENTED_TRAVEL: readonly string[] = ['한참을 걸', '한참 걸', '오래 걸', '언덕을 넘', '몇 번이나 넘', '걷고 또', '한참이나 돌아', '걷기를 한참'];
const MOVE_WORD = /걷|걸어|걸었|달려|달린|뛰|이동|넘|떠나|돌아|다가|찾아/;
/** 큰 행동(bold)의 연출은 행동이 어떻게 됐는지와 상대의 대사·몸짓 반응을 합쳐 이만큼은 써야 한다. */
const BOLD_MIN_LINES = 3;
/** 여우 한마디가 입력에 없는데 꺼내면 안 되는 말. */
const QUIP_UNSAID: readonly string[] = ['미소녀', '공녀', '은발', '웰든'];

export const DEFAULT_GM_OPTIONS: GmOptions = {
  retries: 2,
  softRetries: 1,
  temperature: 0.7,
  interpretTemperature: 0.1,
  maxLines: 4,
  talkLines: 2,
  maxChars: 100,
  budgetMs: 15_000,
};

/** 화자가 이번 판에 이미 한 말은 뺀 대체 줄. 다 뺐으면 원래 묶음을 쓴다(아무 줄도 없는 것보다 낫다). */
function freshLines<T extends Line>(pool: readonly T[], spoken: Readonly<Record<string, readonly string[]>> | undefined): T[] {
  const fresh = pool.filter((l) => !(spoken?.[l.speaker] ?? []).some((t) => normalizeKo(t) === normalizeKo(l.text)));
  return fresh.length ? fresh : [...pool];
}

/** 질문에 나온 낱말로 아시나가 아는 항목을 찾는다. */
function noteMentioned(text: string, lore: Lore): NoteEntry | undefined {
  const score = (n: NoteEntry) => Math.max(0, ...n.keys.filter((k) => mentions(text, k)).map((k) => k.length));
  return lore.knowledge.filter((n) => n.tier !== 'hidden' && score(n) > 0).sort((a, b) => score(b) - score(a))[0];
}

/** LLM 이 없거나 실패할 때의 배경 설명. */
export function explainFallback(ctx: GmContext, lore: Lore, gm: string): Line[] {
  const best = lore.knowledge.find((n) => n.id === ctx.about) ?? noteMentioned(ctx.text, lore);
  if (!best) return [{ speaker: gm, text: '그건 아시나도 몰라.' }];
  if (best.after?.length && !noteOpen(best, ctx.state)) return [{ speaker: gm, text: '아시나는 아직 그런 사람을 본 적이 없어.' }];
  return [{ speaker: gm, text: best.say ?? best.text }];
}

/** 이번 결과로 잃기로 정해지지 않은 소지품의 짧은 이름. */
function keptItems(ctx: GmContext, task: GmTask): string[] {
  const lose = task === 'narrate' ? ((ctx as NarrateContext).outcome.effects?.lose ?? []) : [];
  return ctx.scenario.sheet.items.filter((i) => !i.hidden && ctx.state.items.includes(i.id) && !lose.includes(i.id)).map((i) => i.name.split(' ').at(-1) ?? i.name);
}

/** 지금 장면에 없는 인물을 가리키는 말. */
function absentWords(ctx: GmContext): readonly string[] {
  const stage = ctx.scenario.stage;
  if (!stage || stage.near.includes(ctx.beat.id) || ctx.free.speakers.includes(stage.who) || Object.values(ctx.beat.cast ?? {}).includes(stage.who)) return [];
  return ctx.state.flags[stage.met] === true ? stage.gone : [...stage.unseen, ...stage.gone];
}

export class LocalGm implements GmPort {
  private model: string | null = null;
  private readonly reservedCache = new Map<string, ReservedLine[]>();

  constructor(
    private readonly llm: LlmClient | null,
    private readonly lore: Lore,
    private readonly opts: GmOptions = DEFAULT_GM_OPTIONS,
  ) {}

  prepare(ctx: Omit<GmContext, 'text'>): void {
    if (!this.llm) return;
    const system = buildSystem({ ...ctx, text: '' }, this.lore);
    void this.llm.warm(system).catch(() => undefined);
  }

  async interpret(ctx: GmContext): Promise<Interpretation> {
    const started = performance.now();
    const meta = (attempts: number, violations: string[], fallback: boolean): GmMeta => ({
      attempts,
      violations,
      fallback,
      ms: Math.round(performance.now() - started),
      model: this.model,
    });
    const rule = ruleInterpret(ctx.free, ctx.text, ctx.state.items, this.lore);
    const improvByRule = (absurd: boolean, m: GmMeta): Interpretation => ({ kind: 'improv', stat: '재치', difficulty: absurd ? -1 : 0, label: '즉흥 행동', absurd, bold: false, odd: absurd, source: 'rule', meta: m });
    const askByRule = (m: GmMeta): Interpretation => {
      const help = ctx.scenario.gameHelp?.find((h) => mentions(ctx.text, h.name));
      if (help) return { kind: 'ask', game: help.id, source: 'rule', meta: m };
      const note = noteMentioned(ctx.text, this.lore);
      return { kind: 'ask', ...(note ? { about: note.id } : {}), source: 'rule', meta: m };
    };
    if (rule.kind === 'ask' && !rule.why) return askByRule(meta(0, [], false));
    if (rule.kind === 'deflect') return { kind: 'talk', tone: 'deflect', source: 'rule', meta: meta(0, [], false) };
    // 귀찌나 변장을 풀려는 행동은 뜻이 분명하니 모델 없이 받는다. 정체를 밝히는 말은 잡아떼는 말과 낱말이 같아 모델이 가른다.
    const wordRisk: InputRisk | undefined = isAsking(ctx.text)
      ? undefined
      : (ctx.scenario.refuse?.find((r) => r.words.some((w) => mentions(ctx.text, w)))?.id ??
        (ctx.scenario.identity?.words.some((w) => mentions(ctx.text, w)) ? 'identity' : undefined));
    if (wordRisk === 'unmask') return { kind: 'talk', risk: wordRisk, source: 'rule', meta: meta(0, [], false) };
    if (rule.kind === 'improv' && rule.absurd && !isAsking(ctx.text)) return improvByRule(true, meta(0, [], false));
    if (rule.kind === 'talk' && isNoise(ctx.text)) return { kind: 'talk', source: 'rule', meta: meta(0, [], false) };
    if (rule.kind === 'approach' && rule.item !== null && rule.score >= ITEM_RULE_MIN_SCORE)
      return { kind: 'approach', approach: rule.approach, item: rule.item, source: 'rule', meta: meta(0, [], false) };
    const byRule = (attempts: number, violations: string[]): Interpretation => {
      const m = meta(attempts, violations, true);
      const risk = wordRisk ? { risk: wordRisk } : {};
      if (rule.kind === 'ask') return askByRule(m);
      if (rule.kind === 'approach') return { kind: 'approach', approach: rule.approach, item: rule.item, ...risk, source: 'rule', meta: m };
      return rule.kind === 'improv' ? { ...improvByRule(rule.absurd, m), ...risk } as Interpretation : { kind: 'talk', ...risk, source: 'rule', meta: m };
    };
    if (!this.llm) return byRule(0, ['error:LLM 미연결']);

    let res = null as LlmResult | null;
    try {
      const llm = this.llm;
      const help = (ctx.scenario.gameHelp ?? []).map((h) => h.id);
      // '그건 내가 답할 게 아니야'는 모델이 고르는 항목이 아니다. 항목을 두 번 고르고도 것이 없을 때만 거기로 떨어진다.
      const choices = help.filter((h) => h !== HELP_OTHER);
      const read = async (only?: readonly InputKind[]) => {
        const out = await llm.chatJson({
          system: buildSystem(ctx, this.lore),
          user: buildInterpretUser(ctx, this.lore, only),
          schema: interpretSchema(ctx.free, ctx.state.items, this.lore, choices, only ?? INPUT_KINDS),
          temperature: this.opts.interpretTemperature,
          seed: this.seed(ctx, 'interpret', only ? 2 : 1),
          maxTokens: 200,
        });
        this.model = out.model ?? this.model;
        res = out;
        return JSON.parse(out.text) as { kind?: unknown; about?: unknown; risk?: unknown; approach?: unknown; item?: unknown; reason?: unknown; stat?: unknown; difficulty?: unknown; odd?: unknown; absurd?: unknown; bold?: unknown; deed?: unknown };
      };
      let parsed = await read();
      // 물음 꼴이어도 답을 바라지 않는 탄식이나 자문이면 혼잣말이다. 답을 구하는 물음인지 다시 가린다.
      // 존댓말 물음은 앞사람에게 건넨 말이다. 자기 자신을 묻는 말은 앞에 사람이 있어도 진행자에게 묻는 말이다.
      const spokenOrActed = parsed.kind === 'action' || parsed.kind === 'person';
      if (parsed.kind === 'self' && isAsking(ctx.text)) parsed = await read([...QUESTION_KINDS, 'self']);
      // 그만하고 싶다는 말은 아시나의 푸념과 꼴이 같다. 혼잣말로 읽었으면 게임에 건넨 말인지 한 번 더 가린다.
      else if (parsed.kind === 'self') parsed = await read(SELF_OR_GAME);
      else if (spokenOrActed && isPlainQuestion(ctx.text) && !isPolite(ctx.text)) {
        parsed = await read(isAboutSelf(ctx.text) || (parsed.kind === 'action' && parsed.approach === 'none') ? QUESTION_KINDS : [...QUESTION_KINDS, 'person']);
      }
      // 세계 물음인데 답할 항목을 못 골랐으면 게임 자체를 묻는 말인지 한 번 더 가린다.
      if (parsed.kind === 'lore' && (parsed.about === ABOUT_UNKNOWN || typeof parsed.about !== 'string')) parsed = await read(LORE_OR_GAME);
      // 게임 질문이라고 읽고 항목을 못 골랐으면 항목만 다시 고르게 한다.
      if (parsed.kind === 'game' && !choices.includes(String(parsed.about))) parsed = await read(['game']);
      // 상대에게 말하는 투로 끝난 문장은 행동을 적은 글이 아니다.
      const kind = parsed.kind === 'action' && isSpokenText(ctx.text) ? 'person' : INPUT_KINDS.find((k) => k === parsed.kind);
      const approach = typeof parsed.approach === 'string' ? parsed.approach : 'none';
      this.emit({ task: 'interpret', beat: ctx.beat.id, attempt: 1, input: ctx.text, raw: res?.text ?? '', violations: [], llm: res, error: null });
      if (!kind) throw new Error(`알 수 없는 입력 종류 "${String(parsed.kind)}"`);
      const known = ctx.free.approaches.some((a) => a.id === approach);
      if (approach !== 'none' && !known) throw new Error(`알 수 없는 행동 id "${approach}"`);
      const done = meta(1, [], false);
      const about = typeof parsed.about === 'string' ? parsed.about : ABOUT_UNKNOWN;
      if (kind === 'how' || (kind === 'game' && about === HELP_PLAY)) return { kind: 'ask', play: true, source: 'llm', meta: done };
      if (kind === 'game') return { kind: 'ask', game: choices.includes(about) ? about : HELP_OTHER, source: 'llm', meta: done };
      if (kind === 'lore') {
        // 수첩 항목이 아니라 게임 항목을 골랐으면 게임 질문이다.
        if (help.includes(about) && !this.lore.knowledge.some((n) => n.id === about)) return { kind: 'ask', game: about, source: 'llm', meta: done };
        return { kind: 'ask', about, source: 'llm', meta: done };
      }
      if (kind === 'bad') return { kind: 'talk', tone: 'deflect', source: 'llm', meta: done };
      const found = kind === 'self' ? undefined : RISKS.find((r) => r === parsed.risk);
      const risk = found ? { risk: found } : {};
      if (known && kind !== 'self') {
        const item = typeof parsed.item === 'string' && ctx.state.items.includes(parsed.item) ? parsed.item : null;
        return { kind: 'approach', approach, item, spoken: kind === 'person', ...risk, source: 'llm', meta: done };
      }
      // 말이라고 읽었어도 행동을 적은 문장이면 판정으로 받는다.
      if (kind === 'action' || isActionText(ctx.text)) {
        if (rule.kind === 'approach' && kind !== 'action') return { kind: 'approach', approach: rule.approach, item: rule.item, spoken: false, ...risk, source: 'rule', meta: done };
        const stat: Ability = ABILITIES.find((a) => a === parsed.stat) ?? '재치';
        const absurd = parsed.absurd === true;
        const label = typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim().slice(0, 20) : '즉흥 행동';
        // deed 는 행동을 보통 말로 요약한 한 문장이다. 검사 면제와 GM 실패 때의 대체 줄에 쓴다. 곁에 사람이 없으면 큰 행동일 수 없다.
        const deed = typeof parsed.deed === 'string' && parsed.deed.trim() ? { deed: parsed.deed.trim() } : {};
        const bold = parsed.bold === true && this.reactorOf(ctx) !== undefined && ctx.scenario.cast[this.reactorOf(ctx) ?? '']?.style === 'speech';
        return { kind: 'improv', stat, difficulty: DIFFICULTY[String(parsed.difficulty)] ?? 0, label, absurd, bold, odd: absurd || parsed.odd === true, ...deed, ...risk, source: 'llm', meta: done };
      }
      return { kind: 'talk', to: kind === 'self' ? 'self' : 'person', ...risk, source: 'llm', meta: done };
    } catch (err) {
      const message = (err as Error).message;
      this.emit({ task: 'interpret', beat: ctx.beat.id, attempt: 1, input: ctx.text, raw: res?.text ?? '', violations: [], llm: res, error: message });
      return byRule(1, [`error:${message}`]);
    }
  }

  /**
   * 아시나의 대사는 플레이어가 친 글자 그대로 이미 화면에 있다. GM 은 아시나 줄을 새로 쓰거나 바꿔 쓰지 않고
   * 상대 인물의 반응·내레이션·속마음만 쓴다. 혼잣말이면 앞사람도 받지 않는다.
   */
  private withoutPlayerVoice<T extends GmContext>(ctx: T, self = false): T {
    const { cast, sheet } = ctx.scenario;
    // 아시나의 속마음도 플레이어 못이라 지어 쓰지 않는다(대본의 속마음 줄은 그대로). 혼자말일 때만 속마음으로 이어 쓴다.
    const speakers = ctx.free.speakers.filter((s) => {
      const c = cast[s];
      if (c?.style === 'speech') return !self && c.lore !== sheet.name;
      if (c?.style === 'thought') return self || c.lore !== sheet.name;
      return true;
    });
    return { ...ctx, free: { ...ctx.free, speakers } };
  }

  /**
   * 입력이 이야기에 들어가기 전에 가린다. 원작 독자만 알 수 있는 이름·사실(설정 사전의 spoilers)과
   * 지금 장면에 없는 사람·물건(stage 의 unseen/gone)이 들어 있으면 걸린다. 거친 말·헛소리는 걸리지 않는다.
   */
  screen(ctx: GmContext): InputScreen | null {
    const { cast, sheet } = ctx.scenario;
    const spoiler = spoilersFor(this.lore, ctx.state).find((t) => forbiddenIn(ctx.text, t));
    if (spoiler) {
      const hiddenPerson = this.lore.knowledge.some((n) => n.kind === '사람' && !noteOpen(n, ctx.state) && (n.text.includes(spoiler) || n.name.includes(spoiler)));
      const facing = ctx.free.speakers.map((s) => cast[s]).find((c) => c?.style === 'speech' && c.lore !== sheet.name);
      const who = hiddenPerson ? (facing ? (facing.display.endsWith('남자') ? '저 남자' : facing.display) : '그 사람') : undefined;
      return { reason: 'unknown', term: spoiler, ...(who ? { who } : {}) };
    }
    const absent = absentWords(ctx).find((w) => mentions(ctx.text, w));
    if (absent) return { reason: 'absent', term: absent.replace(/(가|는|이|은)$/u, '') };
    return null;
  }

  talk(ctx: GmContext): Promise<GmLines> {
    // 지금 장면에 없는 인물의 대체 줄은 쓰지 않는다.
    const said = this.withoutPlayerVoice(ctx, ctx.self === true);
    const pool = freshLines((said.tone === 'deflect' ? said.free.deflect : said.free.talk_fallback).filter((l) => said.free.speakers.includes(l.speaker)), said.state.spoken);
    // talks 와 said 는 한 턴에 같이 하나씩 늘어 둘을 더하면 두 줄짜리 묶음에서 늘 첫 줄만 나온다. talks 로만 돌린다.
    const picked = pool[(said.state.free?.talks ?? 0) % Math.max(pool.length, 1)];
    const narrator = said.free.speakers.find((s) => said.scenario.cast[s]?.style === 'narration');
    const quiet: Line[] = narrator ? [{ speaker: narrator, text: ctx.self ? '말은 사막 바람에 흩어졌다.' : '대답은 돌아오지 않았다.' }] : [];
    // 뜻을 읽을 수 없는 입력은 모델에 넘기면 없는 말을 지어낸다.
    if (isNoise(ctx.text)) return Promise.resolve({ lines: picked ? [picked] : quiet, meta: { attempts: 0, violations: [], fallback: true, ms: 0, model: this.model } });
    // 세계 밖 물건을 꺼낸 행동은 "이상한 몸짓" 같은 얼버무리 말을 막고, 상대가 있으면 그 인물의 반응 줄이 있어야 한다.
    const guards = said.absurd ? ['이상한 몸짓'] : [];
    // 혼자 한 세계 밖 행동은 속마음이 받는다. 상대가 있으면 그 인물이 받는다(첫 줄은 write 가 나레이션으로 고정).
    // 혼잣말은 앞사람이 듣고 대꾸하지 않는다고 프롬프트에 시키므로 상대의 줄을 요구하지 않는다.
    const thought = said.free.speakers.find((s) => said.scenario.cast[s]?.style === 'thought');
    const reactor = said.interject?.action ? undefined : said.self ? (said.absurd ? thought : undefined) : this.reactorOf(said);
    // 끝까지 위반하면(입력 낱말을 그대로 쓰는 등) 대체 줄도 세계 밖 행동의 틀(나레이션 동작 한 줄 → 반응 한 줄)을 지킨다.
    const absurdFloor: Line[] = said.absurd && narrator ? [{ speaker: narrator, text: '허공에 손을 내밀었지만 잡히는 것은 없었다.' }] : [];
    // 혼잣말에 대본의 대체 줄을 내면 입력을 무시하고 대본을 이어 가는 것처럼 보인다. 말이 흩어지는 한 줄로 받는다.
    const unanswered = ctx.self && quiet.length ? quiet : picked ? [picked] : quiet;
    const fallback = absurdFloor.length ? [...absurdFloor, ...(picked ? [picked] : [])] : unanswered;
    return this.write('talk', said, fallback, this.opts.talkLines, guards, (feedback) => buildTalkUser(said, feedback, this.opts.talkLines, this.opts.maxChars), reactor);
  }

  /** 대화에서 입력에 반응해야 하는 인물. 상대 인물이 있으면 그 인물, 혼자면 속마음이다. */
  private reactorOf(ctx: GmContext): string | undefined {
    const { cast, sheet } = ctx.scenario;
    return ctx.free.speakers.find((s) => cast[s]?.style === 'speech' && cast[s]?.lore !== sheet.name) ?? ctx.free.speakers.find((s) => cast[s]?.style === 'thought');
  }

  narrate(raw: NarrateContext): Promise<GmLines> {
    const ctx = this.withoutPlayerVoice(raw);
    // 이 세계에 없는 물건을 꺼냈을 때와 상대가 지나칠 수 없는 큰 행동에는 상대 인물의 반응 줄이 있어야 한다.
    const absurd = ctx.improv?.absurd === true;
    const bold = ctx.improv?.bold === true;
    return this.write(
      'narrate',
      ctx,
      this.narrateFallback(ctx),
      this.opts.maxLines,
      [...(ctx.outcome.state_guard ?? []), ...(absurd ? ['이상한 몸짓'] : [])],
      (feedback) => buildNarrateUser(ctx, feedback, this.opts.maxLines, this.opts.maxChars),
      absurd || bold ? this.reactorOf(ctx) : undefined,
      undefined,
      bold ? Math.min(BOLD_MIN_LINES, this.opts.maxLines) : undefined,
    );
  }

  /**
   * GM 이 끝내 못 썼을 때 쓰는 줄. 플레이어 대신 하는 말과 특정 입력을 전제로 한 줄은 빼고,
   * 이미 일어난 일(후드를 벗었다 등)과 어긋나는 줄도 뺀다. 남는 줄이 없으면 장면의 중립 줄을 쓴다.
   */
  private narrateFallback(ctx: NarrateContext): Line[] {
    const guard = activeFacts(ctx.scenario, ctx.state).flatMap((f) => f.state_guard);
    const fits = (lines: readonly Line[]) => lines.filter((l) => !guard.some((w) => mentions(l.text, w)));
    // 즉흥 행동은 결과 줄이 행동과 무관한 범용 줄이다. 해석이 요약한 행동 + 상대 인물의 등급별 반응 줄로 조립한다.
    // 요약(deed)은 해석 모델이 입력 낱말로 쓴 글이라 세계 밖 물건·스포일러·변장 노출이 들 수 있다. 그런 요약은 화면에 내지 않는다.
    const deed = ctx.improv?.deed && !this.unsafeDeed(ctx, ctx.improv.deed) ? ctx.improv.deed : undefined;
    const improvised = deed ? this.improvFallback(ctx, deed) : [];
    if (improvised.length) return fits(improvised);
    const kept = fits(typedFallbackLines(ctx.scenario, ctx.outcome.lines));
    return kept.length ? kept : fits(ctx.free.neutral?.[ctx.roll.tier] ?? []);
  }

  /** 검사 없이 화면에 낼 요약에 금지어(바깥 이야기·현대 물건·현실 지명·스포일러·등급)나 변장 노출 말이 들었는가. */
  private unsafeDeed(ctx: GmContext, deed: string): boolean {
    const lore = loreFor(this.lore, ctx.state);
    return Object.values(lore.forbidden).some((terms) => terms.some((t) => forbiddenIn(deed, t))) || lore.exposure.some((t) => forbiddenIn(deed, t));
  }

  /** (행동 요약 내레이션) + (상대 인물의 성격에 맞는 등급별 반응 한 줄). 상대가 없으면 중립 줄을 잇는다. */
  private improvFallback(ctx: NarrateContext, deed: string): Line[] {
    const { cast } = ctx.scenario;
    const narrator = ctx.free.speakers.find((s) => cast[s]?.style === 'narration');
    const sentence = /[.!?…]$/u.test(deed) ? deed : `${deed}.`;
    const lines: Line[] = narrator ? [{ speaker: narrator, text: sentence }] : [];
    const reactor = this.reactorOf(ctx);
    const who = reactor ? cast[reactor] : undefined;
    const pool = who?.style === 'speech' && who.lore ? this.lore.characters[who.lore]?.reactions?.[ctx.roll.tier] : undefined;
    if (reactor && pool?.length) {
      // 이번 판에 이미 한 말은 남은 게 있는 동안 고르지 않는다.
      const said = new Set((ctx.state.spoken?.[reactor] ?? []).map(normalizeKo));
      const fresh = pool.filter((p) => !said.has(normalizeKo(p.text)));
      const from = fresh.length ? fresh : pool;
      const pick = from[seedFrom(`${ctx.state.seed}|${ctx.beat.id}|${ctx.text}`) % from.length];
      if (pick) lines.push({ speaker: reactor, text: pick.text, face: pick.face });
    } else {
      lines.push(...(ctx.free.neutral?.[ctx.roll.tier] ?? []));
    }
    return lines;
  }

  quip(ctx: GmContext): Promise<GmLines> {
    const gm = gmSpeakerOf(ctx.scenario);
    if (!gm) return Promise.resolve({ lines: [], meta: { attempts: 0, violations: [], fallback: true, ms: 0, model: this.model } });
    const unsaid = QUIP_UNSAID.filter((w) => !mentions(ctx.text, w));
    // 생성이 실패해도 뜰금없는 행동에 여우 한 줄은 나온다. 설정 사전의 짧은 감탄 가운데 시드로 고른다.
    const pool = freshLines(this.lore.gmQuips.map((text) => ({ speaker: gm, text })), ctx.state.spoken).map((l) => l.text);
    const pick = pool[seedFrom(`${ctx.state.seed}|${ctx.beat.id}|${ctx.text}`) % Math.max(pool.length, 1)];
    return this.write('talk', ctx, pick ? [{ speaker: gm, text: pick }] : [], 1, unsaid, (feedback) => buildQuipUser(ctx, feedback), undefined, [gm]);
  }

  explain(ctx: GmContext): Promise<GmLines> {
    const gm = gmSpeakerOf(ctx.scenario);
    if (!gm) throw new Error('cast 에 GM 화자(style: gm)가 없습니다');
    const note = this.lore.knowledge.find((n) => n.id === ctx.about && n.tier !== 'hidden');
    // 답이 없는 질문은 지어낼 틈 없이 짧게 받는다.
    if (ctx.about === ABOUT_UNKNOWN || (note && !noteOpen(note, ctx.state))) {
      return Promise.resolve({ lines: [{ speaker: gm, text: '그건 아직 몰라.' }], meta: { attempts: 0, violations: [], fallback: false, ms: 0, model: this.model } });
    }
    const unseen = this.lore.knowledge.filter((n) => n.kind === '사람' && n.tier !== 'hidden' && !noteOpen(n, ctx.state)).map((n) => n.name);
    return this.write('explain', ctx, explainFallback(ctx, this.lore, gm), 2, [], (feedback) => buildExplainUser(ctx, unseen, feedback, 2, this.opts.maxChars, note), undefined, [gm]);
  }

  private async write(
    task: GmTask,
    ctx: GmContext,
    fallback: Line[],
    maxLines: number,
    outcomeForbid: readonly string[],
    userFor: (feedback: string) => string,
    reactor?: string,
    speakersOverride?: readonly string[],
    minLines?: number,
  ): Promise<GmLines> {
    const started = performance.now();
    const violations: string[] = [];
    const finish = (lines: Line[], attempts: number, usedFallback: boolean, setFlags: string[] = []): GmLines => ({
      lines,
      meta: { attempts, violations, fallback: usedFallback, ms: Math.round(performance.now() - started), model: this.model, ...(setFlags.length ? { setFlags } : {}) },
    });
    if (!this.llm) {
      violations.push('error:LLM 미연결');
      return finish(fallback, 0, true);
    }
    const system = buildSystem(ctx, this.lore);
    const { cast, sheet } = ctx.scenario;
    const speakers = speakersOverride ?? ctx.free.speakers;
    const rest = speakers.filter((s) => !(cast[s]?.style === 'speech' && cast[s]?.lore === sheet.name));
    // 대화에서는 반응하는 인물이 첫 줄을 말한다. 연출에서는 행동을 먼저 보여 주고 반응은 검사로만 요구한다.
    // 입식이 있는 인물의 대사·속마음 줄은 줄마다 face 를 가지고 온다. 화면이 그 값으로 표정을 바꾼다.
    const faced = facedSpeakers(cast, speakers);
    // 세계 밖 행동은 나레이션이 먼저 실제 동작을 그리고, 반응 인물의 줄은 검사(reactor)로 요구한다.
    const narrator = ctx.absurd && task === 'talk' ? speakers.find((s) => cast[s]?.style === 'narration') : undefined;
    const first = narrator ?? (reactor && task === 'talk' ? reactor : undefined);
    const schema = linesSchema(speakers, maxLines, this.opts.maxChars, first ? { first, ...(reactor && reactor !== first ? { second: reactor } : {}), rest: rest.length ? rest : ctx.free.speakers } : undefined, faced);
    const asked = task === 'explain' ? this.lore.knowledge.find((n) => n.id === ctx.about && n.kind === '사람') : undefined;
    const mustMention = asked ? [asked.name, ...asked.keys] : [];
    const moved = MOVE_WORD.test(ctx.text) || (task === 'narrate' && MOVE_WORD.test((ctx as NarrateContext).outcome.gist ?? ''));
    const check: CheckOptions = {
      speakers,
      maxLines,
      maxChars: this.opts.maxChars,
      cast: ctx.scenario.cast,
      lore: loreFor(this.lore, ctx.state),
      stateGuard: [...ctx.free.state_guard, ...activeFacts(ctx.scenario, ctx.state).flatMap((f) => f.state_guard)],
      ...(task === 'explain' ? {} : { spoken: ctx.state.spoken ?? {} }),
      // 장면이 '그렇게 말했는지'로 갈래를 나누는 낱말(길을 묻는 말 등)은 플레이어가 먼저 쓴 때만 인물이 말할 수 있다.
      echoOnly: [...ctx.free.echo_only, ...ctx.free.approaches.flatMap((a) => a.said?.words ?? [])],
      ...(task === 'narrate' && (ctx as NarrateContext).approach.presume ? { presume: (ctx as NarrateContext).approach.presume } : {}),
      outcomeForbid: moved ? outcomeForbid : [...outcomeForbid, ...INVENTED_TRAVEL],
      absent: absentWords(ctx),
      // 해석이 요약한 행동(deed)도 플레이어가 한 일이다. "뽀뽀"라고 쳤어도 "입을 맞췄다"가 면제된다.
      playerText: [ctx.text, ...(ctx.deed ? [ctx.deed] : []), ...(ctx.state.said ?? [])].join(' '),
      ...(ctx.deed ? { deed: ctx.deed } : {}),
      ...(minLines !== undefined ? { minLines } : {}),
      reserved: [...(ctx.interject?.upcoming ?? []).map((u) => ({ norm: normalizeKo(u), text: u, future: true })).filter((r) => r.norm.length >= 2), ...this.reservedFor(ctx.scenario, ctx.beat.id)],
      gist: task === 'narrate' ? ((ctx as NarrateContext).outcome.gist ?? '') : '',
      ...(task === 'narrate' ? { tier: (ctx as NarrateContext).roll.tier } : {}),
      playerLore: ctx.scenario.sheet.name,
      ...(reactor ? { reactor } : {}),
      ...(narrator ? { first: narrator } : {}),
      faced,
      input: ctx.text,
      keepItems: keptItems(ctx, task),
      ...(task === 'explain' && mustMention.length ? { mustMention } : {}),
    };
    let feedback = '';
    let attempt = 0;
    let best: { lines: Line[]; soft: number; sets: string[] } | null = null;
    let softTries = 0;
    let lastAttemptMs = 0;
    while (attempt <= this.opts.retries) {
      if (attempt > 0 && performance.now() - started + lastAttemptMs > this.opts.budgetMs) {
        violations.push(`budget: ${this.opts.budgetMs}ms 안에 다시 쓸 시간이 없음`);
        break;
      }
      const attemptStarted = performance.now();
      attempt += 1;
      let res: LlmResult;
      try {
        res = await this.llm.chatJson({ system, user: userFor(feedback), schema, temperature: this.opts.temperature, seed: this.seed(ctx, task, attempt), maxTokens: 600 });
      } catch (err) {
        const message = (err as Error).message;
        violations.push(`error:${message}`);
        this.emit({ task, beat: ctx.beat.id, attempt, input: ctx.text, raw: '', violations: [], llm: null, error: message });
        if (err instanceof LlmError && !err.retryable) break;
        lastAttemptMs = performance.now() - attemptStarted;
        continue;
      }
      lastAttemptMs = performance.now() - attemptStarted;
      this.model = res.model ?? this.model;
      const out = validateOutput(res.text, check);
      const state = out.violations.some((v) => v.severity === 'hard') ? { broken: [], sets: [] } : await this.checkState(task, ctx, out.lines, violations);
      out.violations.push(...state.broken.map((fact): Violation => ({ kind: 'beat', rule: 'state_check', detail: `상태를 서술로 바꾸지 마세요. 지금 사실: ${fact}`, severity: 'hard' })));
      this.emit({ task, beat: ctx.beat.id, attempt, input: ctx.text, raw: res.text, violations: out.violations, llm: res, error: null });
      if (out.violations.length === 0) return finish(this.polish(out.lines, ctx, reactor), attempt, false, state.sets);
      violations.push(...out.violations.map((v) => `${v.kind}/${v.rule}: ${v.detail}`));
      feedback = feedbackFor(out.violations);
      const hard = out.violations.filter((v) => v.severity === 'hard').length;
      if (hard === 0) {
        const soft = out.violations.length;
        if (!best || soft < best.soft) best = { lines: out.lines, soft, sets: state.sets };
        if (softTries >= this.opts.softRetries) break;
        softTries += 1;
      }
    }
    return best ? finish(this.polish(best.lines, ctx, reactor), attempt, false, best.sets) : finish(fallback, attempt, true);
  }

  /**
   * 후드 같은 상태는 엔진이 정한다. 서술이 상태를 바꿨는지 낱말 대신 뜻으로 다시 묻는다.
   * 결과나 대가에 적힌 변화와 플레이어가 직접 한 행동은 어긋남이 아니다. 플레이어가 한 행동이면 상태가 따라간다.
   */
  private async checkState(task: GmTask, ctx: GmContext, lines: readonly Line[], violations: string[]): Promise<{ broken: string[]; sets: string[] }> {
    const result = { broken: [] as string[], sets: [] as string[] };
    if (task === 'explain') return result;
    const gm = gmSpeakerOf(ctx.scenario);
    const written = lines.filter((l) => l.speaker !== gm).map((l) => l.text).join('\n');
    const narrate = task === 'narrate' ? (ctx as NarrateContext) : undefined;
    const authored = `${narrate?.outcome.gist ?? ''} ${narrate?.price?.text ?? ''}`;
    const input = ctx.deed ? `${ctx.text} ${ctx.deed}` : ctx.text;
    for (const fact of activeFacts(ctx.scenario, ctx.state)) {
      const check = fact.state_check;
      if (!check) continue;
      const about = (text: string) => check.about.some((word) => mentions(text, word));
      if (!about(written)) continue;
      // 대본의 결과·대가가 같은 변화를 정했으면 통과한다. 같은 낱말이 나온 것만으로는 허락이 아니다.
      if (about(authored) && (await this.answersYes(task, ctx, authored, check.ask, violations))) continue;
      // 판정을 받지 못한 서술은 확인되지 않은 것이니 상태를 바꿨다고 본다.
      const changed = await this.answersYes(task, ctx, written, check.ask, violations, true);
      if (!changed) continue;
      if (!about(input) || !(await this.answersYes(task, ctx, input, check.ask, violations))) result.broken.push(fact.text);
      else if (check.sets) result.sets.push(check.sets);
    }
    return result;
  }

  private async answersYes(task: GmTask, ctx: GmContext, text: string, ask: string, violations: string[], unavailable = false): Promise<boolean> {
    if (!this.llm) return unavailable;
    try {
      const res = await this.llm.chatJson({
        system: '글을 읽고 질문에 예/아니오로만 판정한다. JSON으로만 답한다.',
        user: `글:\n"""\n${text}\n"""\n질문: ${ask}`,
        schema: { type: 'object', properties: { answer: { type: 'boolean' } }, required: ['answer'] },
        temperature: 0,
        seed: this.seed(ctx, task, 97),
        maxTokens: 24,
      });
      return (JSON.parse(res.text) as { answer?: unknown }).answer === true;
    } catch (err) {
      const message = (err as Error).message;
      violations.push(`state_check_error:${message}`);
      this.emit({ task, beat: ctx.beat.id, attempt: 0, input: text, raw: '', violations: [], llm: null, error: message });
      return unavailable;
    }
  }

  /** 다시 쓰게 할 만큼은 아닌 것을 고친다: 상대 인물의 "하." 시작, 물병이라는 낱말. */
  private polish(lines: Line[], ctx: GmContext, reactor?: string): Line[] {
    const { cast, sheet } = ctx.scenario;
    const fixed = lines.map((l) => {
      const text = l.text.replaceAll('물병', '물통');
      const other = cast[l.speaker]?.style === 'speech' && cast[l.speaker]?.lore !== sheet.name;
      return { line: { ...l, text: other ? text.replace(/^하[.…!]+\s*/u, '') : text }, whole: text };
    });
    // "하."뿐인 줄은 버린다. 상대 인물의 유일한 반응이면 그대로 둔다.
    const spoken = (speaker: string) => fixed.filter((f) => f.line.speaker === speaker && f.line.text).length;
    const kept = fixed.flatMap((f) => (f.line.text ? [f.line] : f.line.speaker === reactor && spoken(f.line.speaker) === 0 ? [{ ...f.line, text: f.whole }] : []));
    return kept.length ? kept : fixed.map((f) => ({ ...f.line, text: f.whole }));
  }

  private reservedFor(scenario: Scenario, beatId: string): ReservedLine[] {
    const cached = this.reservedCache.get(beatId);
    if (cached) return cached;
    const future = new Set<string>();
    const queue = [...edgesOf(scenario.beats[beatId] ?? { id: beatId, title: '', lines: [] })];
    while (queue.length) {
      const id = queue.pop();
      if (id === undefined || id === beatId || future.has(id)) continue;
      future.add(id);
      const next = scenario.beats[id];
      if (next) queue.push(...edgesOf(next));
    }
    const reserved: ReservedLine[] = [];
    // 이 장면이 대체 줄로 쓰는 중립 줄(여러 장면이 같이 쓰는 줄)은 앞당긴 대사로 보지 않는다.
    const own = new Set<string>();
    const collect = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o.text === 'string' && typeof o.speaker === 'string') own.add(normalizeKo(o.text));
        Object.values(o).forEach(collect);
      }
    };
    collect(scenario.beats[beatId]?.free);
    for (const line of scenario.beats[beatId] ? linesOfBeat(scenario.beats[beatId]) : []) own.add(normalizeKo(line.text));
    for (const beat of Object.values(scenario.beats)) {
      if (beat.id === beatId) continue;
      for (const line of linesOfBeat(beat)) {
        const norm = normalizeKo(line.text);
        if (norm.length >= 5 && !own.has(norm)) reserved.push({ norm, text: line.text, future: future.has(beat.id) });
      }
    }
    reserved.sort((a, b) => Number(b.future) - Number(a.future));
    this.reservedCache.set(beatId, reserved);
    return reserved;
  }

  private seed(ctx: GmContext, task: GmTask, attempt: number): number {
    return seedFrom(`${ctx.state.seed}|${ctx.beat.id}|${task}|${attempt}|${ctx.text}`) % 2_147_483_647;
  }

  private emit(trace: GmTrace): void {
    this.opts.onTrace?.(trace);
  }
}
