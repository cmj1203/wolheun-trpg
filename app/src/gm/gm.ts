import { seedFrom } from '../engine/dice.ts';
import { evalCond } from '../engine/conditions.ts';
import { ABOUT_UNKNOWN, activeFacts, gmSpeakerOf, noteOpen, type GmContext, type GmLines, type GmMeta, type GmPort, type Inquiry, type InputRisk, type InputScreen, type Interpretation, type NarrateContext } from '../engine/engine.ts';
import { edgesOf, facesPerson, hasCharacter, linesOfBeat, typedFallbackLines } from '../engine/scenario.ts';
import { actClauses, discloses, hasQuestionMark, isAboutSelf, isActionText, isAsking, isLinkedAct, isNoAttempt, isNoise, isPlainQuestion, isPolite, isRefusedClause, isSpokenText, parseStoryInput, readInput } from '../engine/text.ts';
import { ABILITIES, GameError, type Ability, type GmTask, type Line, type NoteEntry, type Scenario, type Tier } from '../engine/types.ts';
import { ContextBudgetError, LlmError, type LlmClient, type LlmResult } from './llm.ts';
import { FORBIDDEN_GROUPS, loreFor, spoilersFor, type Lore } from './lore.ts';
import { ATTEMPT_CHECK_SYSTEM, presumeGuard, buildChangesUser, buildChangeUser, buildQuipUser, CHANGE_SYSTEM, changesSchema, GRAMMAR_SYSTEM, SHOWN_CHANGE, OBSERVE_CHANGE, GESTURE_CHANGE, buildExplainUser, buildInterpretSystem, buildInterpretUser, buildNarrateUser, buildSystem, buildTalkUser, changeSchema, INPUT_KINDS, LOOK_CHANGE, NO_CHANGE, YIELD_CHANGE, interpretSchema, linesSchema, questionFacts, type InputKind, type WriteLimits } from './prompt.ts';
import { ruleInterpret } from './rules.ts';
import { facedSpeakers, feedbackFor, forbiddenIn, forbiddenTermIn, mentions, normalizeKo, validateOutput, type CheckOptions, type ReservedLine, type Violation } from './validate.ts';

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
const LORE_OR_PERSON: readonly InputKind[] = ['lore', 'person'];
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
const AHEAD_LIMIT = 8;

/** 플레이어가 이번 판에 실제로 한 말과 행동. 검사 면제의 기준이다. */
const playerTextOf = (ctx: GmContext) => [ctx.text, ...(ctx.deed ? [ctx.deed] : []), ...(ctx.state.said ?? [])].join(' ');
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

/**
 * 대체 줄 하나를 고른다. 화자가 이번 판에 아직 하지 않은 줄 가운데서 turn 으로 돌리고,
 * 모두 한 말이면 침묵·행동 경로로 돌린다.
 */
function pickFallback<T extends Line>(pool: readonly T[], spoken: Readonly<Record<string, readonly string[]>> | undefined, turn: number): T | undefined {
  const lastSaid = (l: T) => (spoken?.[l.speaker] ?? []).findLastIndex((t) => normalizeKo(t) === normalizeKo(l.text));
  const fresh = pool.filter((l) => lastSaid(l) < 0);
  if (fresh.length) return fresh[turn % fresh.length];
  return undefined;
}

/** 질문에 나온 낱말로 아시나가 아는 항목을 찾는다. */
function noteMentioned(text: string, lore: Lore): NoteEntry | undefined {
  const score = (n: NoteEntry) => Math.max(0, ...n.keys.filter((k) => mentions(text, k)).map((k) => k.length));
  return lore.knowledge.filter((n) => n.tier !== 'hidden' && score(n) > 0).sort((a, b) => score(b) - score(a))[0];
}

/** LLM 이 없거나 실패할 때의 배경 설명. */
export function explainFallback(_ctx: GmContext, _lore: Lore, gm: string): Line[] {
  return [{ speaker: gm, text: '그건 아직 몰라.' }];
}

/** 이번 결과로 잃기로 정해지지 않은 소지품의 짧은 이름. */
function keptItems(ctx: GmContext, task: GmTask): string[] {
  const narration = task === 'narrate' ? (ctx as NarrateContext) : undefined;
  const lose = [...(narration?.outcome.effects?.lose ?? []), ...(narration?.price?.effects?.lose ?? [])];
  return ctx.scenario.sheet.items.filter((i) => !i.hidden && ctx.state.items.includes(i.id) && !lose.includes(i.id)).map((i) => i.name.split(' ').at(-1) ?? i.name);
}

/** 지금 장면에 없는 인물을 가리키는 말. */
function absentWords(ctx: GmContext): readonly string[] {
  const stage = ctx.scenario.stage;
  if (!stage || stage.near.includes(ctx.beat.id) || ctx.free.speakers.includes(stage.who) || hasCharacter(ctx.scenario, ctx.beat, stage.who)) return [];
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
    const system = buildSystem({ ...ctx, text: '' }, loreFor(this.lore, ctx.state));
    void this.llm.warm(system).catch(() => undefined);
  }

  async interpret(inputCtx: GmContext): Promise<Interpretation> {
    const input = inputCtx.input;
    const explicitAction = input?.kind === 'valid' && Boolean(input.action);
    // 괄호로 적은 행동은 모델 없는 말·물음 지름길이 먹지 않는다. 항상 해석 호출로 간다(입력 종류로 가른다).
    const typedAction = input?.kind === 'valid' && input.explicit === true && Boolean(input.action);
    const ctx = inputCtx;
    const visibleLore = loreFor(this.lore, ctx.state);
    const started = performance.now();
    const meta = (attempts: number, violations: string[], fallback: boolean): GmMeta => ({
      attempts,
      violations,
      fallback,
      ms: Math.round(performance.now() - started),
      model: this.model,
    });
    const rule = ruleInterpret(ctx.free, input?.kind === 'valid' && input.action && !input.speech ? input.action : ctx.text, ctx.state.items, visibleLore);
    const improvByRule = (absurd: boolean, m: GmMeta): Interpretation => ({ kind: 'improv', stat: '재치', difficulty: absurd ? -1 : 0, label: '즉흥 행동', absurd, bold: false, odd: absurd, source: 'rule', meta: m });
    const askByRule = (m: GmMeta): Interpretation => {
      const help = ctx.scenario.gameHelp?.find((h) => mentions(ctx.text, h.name));
      if (help) return { kind: 'ask', game: help.id, source: 'rule', meta: m };
      const note = noteMentioned(ctx.text, visibleLore);
      return { kind: 'ask', ...(note ? { about: note.id } : {}), source: 'rule', meta: m };
    };
    if (rule.kind === 'ask' && !rule.why && !typedAction) return askByRule(meta(0, [], false));
    if (rule.kind === 'deflect' && !typedAction) return { kind: 'talk', tone: 'deflect', source: 'rule', meta: meta(0, [], false) };
    // 귀찌나 변장을 풀려는 행동은 뜻이 분명하니 모델 없이 받는다. 정체를 밝히는 말은 잡아떼는 말과 낱말이 같아 모델이 가른다.
    const wordRisk: InputRisk | undefined = isAsking(ctx.text)
      ? undefined
      : (ctx.scenario.refuse?.find((r) => r.words.some((w) => mentions(ctx.text, w)))?.id ??
        (ctx.scenario.identity && discloses(ctx.text, ctx.scenario.identity.words) ? 'identity' : undefined));
    if (wordRisk === 'unmask') return { kind: 'talk', risk: wordRisk, source: 'rule', meta: meta(0, [], false) };
    if (rule.kind === 'improv' && rule.absurd && !isAsking(ctx.text)) return improvByRule(true, meta(0, [], false));
    if (rule.kind === 'talk' && isNoise(ctx.text) && !typedAction) return { kind: 'talk', source: 'rule', meta: meta(0, [], false) };
    const byRule = (attempts: number, violations: string[]): Interpretation => {
      const m = meta(attempts, violations, true);
      const risk = wordRisk ? { risk: wordRisk } : {};
      if (rule.kind === 'ask') return askByRule(m);
      if ((explicitAction || isActionText(ctx.text)) && rule.kind !== 'idle') return { kind: 'clarify', message: '행동의 성공 목표를 확인하지 못했어. 이루려는 일을 다시 적거나 선택지를 골라 줘.', source: 'rule', meta: m };
      if (rule.kind === 'approach') return { kind: 'approach', approach: rule.approach, item: rule.item, spoken: rule.spoken, ...risk, source: 'rule', meta: m };
      if (rule.kind === 'improv') return { ...improvByRule(rule.absurd, m), ...risk } as Interpretation;
      if (rule.kind === 'idle') return { kind: 'idle', source: 'rule', meta: m };
      // 모델 없이는 문장 꼴로 말의 방향을 나눈다(docs/lead_check33). 판정을 부르지 않는 쪽만 쓰고, 나머지는 곁에 사람이 있는지로 가른다.
      if (isAsking(ctx.text) && ctx.scenario.gameHelp?.some((h) => mentions(ctx.text, h.name))) return askByRule(m);
      const form = readInput(ctx.text, { selfNames: [ctx.scenario.sheet.name], outsideWords: this.lore.forbidden.modern }).kind;
      if (form === 'question') return askByRule(m);
      if (form === 'self') return { kind: 'talk', to: 'self', ...risk, source: 'rule', meta: m };
      if (form === 'speech') return { kind: 'talk', to: 'person', ...risk, source: 'rule', meta: m };
      if (isPolite(ctx.text) || isSpokenText(ctx.text)) return { kind: 'talk', to: 'person', ...risk, source: 'rule', meta: m };
      if (facesPerson(ctx.scenario, ctx.beat)) return { kind: 'talk', ...risk, source: 'rule', meta: m };
      if (isAsking(ctx.text)) return askByRule(m);
      return { kind: 'talk', to: 'self', ...risk, source: 'rule', meta: m };
    };
    if (!this.llm) return byRule(0, ['error:LLM 미연결']);

    let res = null as LlmResult | null;
    try {
      const llm = this.llm;
      const help = (ctx.scenario.gameHelp ?? []).map((h) => h.id);
      // '그건 내가 답할 게 아니야'는 모델이 고르는 항목이 아니다. 항목을 두 번 고르고도 것이 없을 때만 거기로 떨어진다.
      const choices = help.filter((h) => h !== HELP_OTHER);
      const read = async (only?: readonly InputKind[], readingCtx: GmContext = ctx) => {
        const out = await llm.chatJson({
          system: buildInterpretSystem(readingCtx, visibleLore),
          user: buildInterpretUser(readingCtx, visibleLore, only),
          schema: interpretSchema(readingCtx.free, ctx.state.items, visibleLore, choices, only ?? INPUT_KINDS, readingCtx.question),
          temperature: this.opts.interpretTemperature,
          seed: this.seed(ctx, 'interpret', only ? 2 : 1),
          maxTokens: 320,
          reserveContext: true,
        });
        this.model = out.model ?? this.model;
        res = out;
        return JSON.parse(out.text) as { kind?: unknown; about?: unknown; risk?: unknown; approach?: unknown; item?: unknown; reason?: unknown; label?: unknown; stat?: unknown; difficulty?: unknown; odd?: unknown; absurd?: unknown; bold?: unknown; deed?: unknown; target?: unknown; scope?: unknown };
      };
      let parsed = await read();
      const speechForm = !explicitAction && (input?.kind === 'valid' ? Boolean(input.speech) : readInput(ctx.text).kind === 'speech');
      if (parsed.kind === 'person' && isActionText(ctx.text) && !speechForm) {
        parsed = await read(['person', 'action', 'idle']);
      }
      // 물음 꼴이어도 답을 바라지 않는 탄식이나 자문이면 혼잣말이다. 답을 구하는 물음인지 다시 가린다.
      // 존댓말 물음은 앞사람에게 건넨 말이다. 자기 자신을 묻는 말은 앞에 사람이 있어도 진행자에게 묻는 말이다.
      // 자기 자신을 두고 물음표까지 찍은 말은 답을 바라는 물음이다.
      if (!explicitAction && parsed.kind === 'self' && isAsking(ctx.text)) parsed = await read(hasQuestionMark(ctx.text) && isAboutSelf(ctx.text) ? QUESTION_KINDS : [...QUESTION_KINDS, 'self']);
      // 그만하고 싶다는 말은 아시나의 푸념과 꼴이 같다. 혼잣말로 읽었으면 게임에 건넨 말인지 한 번 더 가린다.
      else if (!explicitAction && parsed.kind === 'self') parsed = await read(SELF_OR_GAME);
      else if (!explicitAction && parsed.kind === 'person' && isPlainQuestion(ctx.text) && !isPolite(ctx.text)) {
        // 앞에 사람이 있으면 자기를 두고 하는 물음도 따지는 말일 수 있어("내가 뭘 잘못했는데?") 상대에게 한 말을 고를 수 있게 둔다.
        const askOnly = isAboutSelf(ctx.text) && !facesPerson(ctx.scenario, ctx.beat);
        parsed = await read(askOnly ? QUESTION_KINDS : [...QUESTION_KINDS, 'person']);
      }
      // 몸이 하는 일로 읽었어도 행동을 적은 문장 꼴이 아니고 고를 접근법도 없으면 말일 수 있다("배에서 꼬르륵 소리 나"). 판정 전에 다시 가린다.
      else if (parsed.kind === 'action' && parsed.approach === 'none' && !speechForm && !isActionText(ctx.text) && !isSpokenText(ctx.text)) parsed = await read(['action', 'self', 'person']);
      // 존댓말 물음은 사람이 있으면 그 사람에게 건넨 말일 수 있다. 세계를 묻는 말인지 상대에게 묻는 말인지 다시 가린다.
      if (parsed.kind === 'lore' && isPolite(ctx.text) && this.reactorOf(ctx) !== undefined) parsed = await read(LORE_OR_PERSON);
      // 세계 물음인데 답할 항목을 못 골랐으면 게임 자체를 묻는 말인지 한 번 더 가린다.
      if (!ctx.question && parsed.kind === 'lore' && (parsed.about === ABOUT_UNKNOWN || typeof parsed.about !== 'string')) parsed = await read(LORE_OR_GAME);
      // 게임 질문이라고 읽고 항목을 못 골랐으면 항목만 다시 고르게 한다.
      if (parsed.kind === 'game' && !choices.includes(String(parsed.about))) parsed = await read(['game']);
      // 행동으로 읽었어도 문장이 그대로 있겠다는 꼴이면 판정 전에 다시 가린다.
      const stayForm = isNoAttempt(ctx.text);
      if (parsed.kind === 'action' && stayForm) parsed = await read(['action', 'idle']);
      // 처음 보는 표현은 꼴로 못 가린다. 동작마다 뒤에 달라지는 것을 물어, 달라지는 동작이 하나도 없으면 시도가 아니다. 그대로 있는 꼴에 시선만 움직인 것도 같다.
      // 같은 동작도 능동적 압박 아래 태도를 유지하려는 시도일 수 있다. 낱말 일치로 고르거나 물리적 변화만으로 지우지 않는다.
      let attempted = false;
      if (parsed.kind === 'action' || (parsed.kind === 'person' && typeof parsed.approach === 'string' && parsed.approach !== 'none')) {
        const clauses = actClauses(ctx.text);
        const linked = isLinkedAct(ctx.text);
        const out = await llm.chatJson({
          system: CHANGE_SYSTEM,
          user: [
            linked ? buildChangesUser(clauses) : buildChangeUser(ctx.text),
            `현재 상황: ${ctx.free.situation}`,
            '현재 상대의 능동적 압박과 입력에 드러난 의도를 함께 읽는다. 압박 아래 일부러 태도를 유지해 상대 판단에 맞서는 도전은 남에게 보이려는 몸짓일 수 있다. 상대에게 설명을 묻는 발화 자체는 설득이 아니다. 입력에 없는 결백 입증·판단 변경 목적을 보태지 않는다. 물음 형식만으로 실제 요구·설득 시도를 지우지도 않는다.',
          ].join('\n'),
          schema: linked ? changesSchema(clauses.length) : changeSchema(),
          temperature: this.opts.interpretTemperature,
          seed: this.seed(ctx, 'interpret', 3),
          maxTokens: linked ? 80 : 40,
          reserveContext: true,
        });
        const answer = JSON.parse(out.text) as { change?: string; changes?: string[] };
        const changes = (linked ? (answer.changes ?? []) : [answer.change ?? '']).filter((_, i) => !isRefusedClause(clauses[i] ?? ''));
        attempted = changes.some((c) => c !== NO_CHANGE && c !== YIELD_CHANGE && c !== SHOWN_CHANGE &&
          c !== OBSERVE_CHANGE && c !== GESTURE_CHANGE && !(stayForm && c === LOOK_CHANGE));
        if (!attempted) {
          res = out;
          // 무시도가 확인된 발화는 목표를 다시 고르지 않고 수신자만 분류한다.
          if (input?.kind === 'valid' && input.speech && changes.length > 0 && changes.every(c => c === NO_CHANGE)) {
            parsed = await read([...QUESTION_KINDS, 'person', 'self', 'idle'], {
              ...ctx, free: { ...ctx.free, goal: '', goals: {}, approaches: [] },
            });
          } else {
            parsed = { kind: input?.kind === 'valid' && (input.speech || changes.some((c) => c === OBSERVE_CHANGE || c === GESTURE_CHANGE)) ? 'person' : 'idle' };
          }
        }
      }
      const kind = parsed.kind === 'action' && !attempted && !explicitAction && isSpokenText(ctx.text) ? 'person' : INPUT_KINDS.find((k) => k === parsed.kind);
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
        if (ctx.question) {
          const inquiry = await this.readInquiry(ctx, visibleLore, about);
          return { kind: 'ask', about: inquiry?.evidence.length ? about : ABOUT_UNKNOWN, inquiry: inquiry ?? null, source: 'llm',
            meta: inquiry ? done : meta(1, ['question_relation: 공개 근거 검수에 실패했습니다.'], true) };
        }
        // 수첩 항목이 아니라 게임 항목을 골랐으면 게임 질문이다.
        if (help.includes(about) && !visibleLore.knowledge.some((note) => note.id === about && note.tier !== 'hidden')) return { kind: 'ask', game: about, source: 'llm', meta: done };
        const note = visibleLore.knowledge.find((entry) => entry.id === about && entry.tier !== 'hidden');
        return { kind: 'ask', about: note?.id ?? ABOUT_UNKNOWN, source: 'llm', meta: done };
      }
      if (kind === 'bad') return { kind: 'talk', tone: 'deflect', source: 'llm', meta: done };
      // 몸이 먼저 드러난 입력은 판정 없이 곁의 사람이 보고 반응한다. 곁에 사람이 없으면 그대로 흘러간다.
      if (kind === 'idle') return { kind: 'idle', source: 'llm', meta: done };
      const found = kind === 'self' ? undefined : RISKS.find((r) => r === parsed.risk);
      const risk = found ? { risk: found } : {};
      const stat: Ability = ABILITIES.find((a) => a === parsed.stat) ?? '재치';
      const absurd = parsed.absurd === true;
      const deed = typeof parsed.deed === 'string' ? parsed.deed.trim() : '';
      const target = typeof parsed.target === 'string' ? parsed.target : '';
      const bold = parsed.bold === true && this.reactorOf(ctx) !== undefined && ctx.scenario.cast[this.reactorOf(ctx) ?? '']?.style === 'speech';
      const label = typeof parsed.label === 'string' ? parsed.label.trim() : '';
      const validLabel = label.length > 0 && label.length <= 32 && !/[\r\n]/u.test(label) && label !== parsed.reason;
      const plan = { stat, difficulty: DIFFICULTY[String(parsed.difficulty)] ?? 0, label: validLabel ? label : '즉흥 행동', absurd, bold, deed, target, ...risk, source: 'llm' as const, meta: done };
      // 원문이 후보 성취의 일부만 했으면 그 부분만 굴리고, 서술도 그 범위를 넘지 않는다.
      let narrowed: string | undefined;
      if (attempted && parsed.absurd !== true && parsed.odd !== true) {
        const selected = ctx.free.approaches.find(entry => entry.id === approach);
        const goal = ctx.free.goals?.[target] ?? (selected?.goal ? ctx.free.goals?.[selected.goal] : undefined);
        const auditErrors: string[] = [];
        let supported = false;
        try {
          const audit = await llm.chatJson({
            system: ATTEMPT_CHECK_SYSTEM,
            user: JSON.stringify({
              input: { original: ctx.text, action: input?.kind === 'valid' ? input.action : '', speech: input?.kind === 'valid' ? input.speech : '' },
              situation: ctx.free.situation,
              candidate: { reason: parsed.reason, deed, approach: selected ? { label: selected.label, hint: selected.hint, goal: selected.goal ? ctx.free.goals?.[selected.goal]?.text ?? null : null } : null, goal: goal?.text ?? null },
            }),
            schema: { type: 'object', additionalProperties: false, required: ['supported', 'partial', 'typed'], properties: { supported: { type: 'boolean' }, partial: { type: 'boolean' }, typed: { type: 'string', maxLength: 60 } } },
            temperature: 0, seed: this.seed(ctx, 'interpret', 5), maxTokens: 120, reserveContext: true,
          });
          const result = JSON.parse(audit.text) as { supported?: unknown; partial?: unknown; typed?: unknown };
          supported = result.supported === true;
          const typed = typeof result.typed === 'string' ? result.typed.trim() : '';
          if (supported && result.partial === true && typed.length > 0 && typed.length <= 60 && !this.unsafeDeed(ctx, typed)) narrowed = typed;
        } catch (error) {
          if (error instanceof ContextBudgetError) throw error;
          if (!(error instanceof Error)) throw error;
          auditErrors.push(`input_fidelity_error: ${error.message}`);
        }
        // 이미 되묻는(scope=clarify) 해석은 검수를 범위 제안에만 쓴다. 검수 실패가 되묻는 줄을 바꾸지 않는다.
        if (!supported && parsed.scope !== 'clarify') return { kind: 'clarify', message: '입력한 행동과 성공 목표가 맞는지 확인하지 못했어. 이루려는 일을 다시 적어 줘.', source: 'llm', meta: meta(1, ['input_fidelity: 원문과 후보의 역할·성취를 확인하지 못했습니다.', ...auditErrors], false) };
        if (narrowed) plan.deed = narrowed;
      }
      if (kind === 'action') {
        // 세계 밖·비판정 입력은 목표를 만들거나 범위를 줄이는 판정을 하지 않는다.
        if (absurd || (parsed.odd === true && !bold && !found)) return { kind: 'improv', ...plan, odd: true };
        const goal = target === 'local' ? undefined : ctx.free.goals?.[target];
        const supported = target === 'local' || (goal && (!goal.if || evalCond(goal.if, ctx.state)));
        const safe = deed.length > 0 && deed.length <= 60 && !this.unsafeDeed(ctx, deed);
        // 모델이 쓴 물음은 화면에 내지 않는다(화면 선택지·목표를 읽어 주거나 여우 말투가 아닐 수 있다). 고정 줄만 보인다.
        // 범위 제안은 검수가 원문에서 확인한 부분(narrowed)으로만 만든다. 후보 목표 문구나 시도 없는 말로는 만들지 않는다.
        if (parsed.scope === 'clarify') {
          return {
            kind: 'clarify', message: '그 목표를 이루려면 우선 어떤 행동을 할까?',
            ...(attempted && narrowed && validLabel && supported ? { proposal: { ...plan, deed: narrowed }, typed: true } : {}), source: 'llm', meta: done,
          };
        }
        if (parsed.scope !== 'ready' || !supported || ((!known || parsed.bold === true) && !safe)) return { kind: 'clarify', message: '행동의 성공 목표를 확인하지 못했어. 이루려는 일을 다시 적어 줘.', source: 'llm', meta: done };
      }
      // 세계 밖 시도와 큰 신체 행동은 목적이 접근법과 같아도 실제 동작·결과를 보존한다.
      if (known && kind !== 'self' && !(kind === 'action' && (parsed.absurd === true || parsed.bold === true))) {
        const item = typeof parsed.item === 'string' && ctx.state.items.includes(parsed.item) ? parsed.item : null;
        return { kind: 'approach', approach, item, spoken: kind === 'person' || (input?.kind === 'valid' && Boolean(input.speech)), ...risk, ...(narrowed ? { scope: narrowed } : {}), source: 'llm', meta: done };
      }
      // 건넨 말을 인용·서술한 문장은 몸의 시도로 바꾸지 않는다.
      if (kind === 'action') {
        return { kind: 'improv', ...plan, odd: false };
      }
      return { kind: 'talk', to: kind === 'self' ? 'self' : 'person', ...risk, source: 'llm', meta: done };
    } catch (err) {
      const message = (err as Error).message;
      this.emit({ task: 'interpret', beat: ctx.beat.id, attempt: 1, input: ctx.text, raw: res?.text ?? '', violations: [], llm: res, error: message });
      if (err instanceof ContextBudgetError) throw new GameError(err.message);
      if (err instanceof GameError) throw err;
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
    const spoiler = spoilersFor(this.lore, ctx.state).find((t) => forbiddenTermIn('spoilers', ctx.text, t, this.lore));
    if (spoiler) {
      const hiddenPerson = this.lore.knowledge.some((n) => n.kind === '사람' && !noteOpen(n, ctx.state) && n.keys.includes(spoiler));
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
    const pool: Line[] = said.reaction
      ? ['……', '…뭐?', '왜지?'].map((text) => ({ speaker: this.reactorOf(said) ?? said.free.speakers[0] ?? '남자', text, face: 'neutral' }))
      : (said.tone === 'deflect' ? said.free.deflect : said.free.talk_fallback).filter((l) => said.free.speakers.includes(l.speaker));
    // 전에는 talks + said.length 로 돌렸는데, 둘이 한 턴에 같이 하나씩 늘어 두 줄짜리 묶음에서 늘 같은 줄만 나왔다.
    const picked = pickFallback(pool, said.state.spoken, said.state.free?.talks ?? 0);
    const narrator = said.free.speakers.find((s) => said.scenario.cast[s]?.style === 'narration');
    const quiet: Line[] = narrator ? [{ speaker: narrator, text: said.interject?.action ? '그럴 겨를은 없었다.' : ctx.self ? '말은 사막 바람에 흩어졌다.' : '대답은 돌아오지 않았다.' }] : [];
    // 뜻을 읽을 수 없는 입력은 모델에 넘기면 없는 말을 지어낸다.
    if (isNoise(ctx.text)) return Promise.resolve({ lines: picked ? [picked] : quiet, meta: { attempts: 0, violations: [], fallback: true, ms: 0, model: this.model } });
    // 세계 밖 물건을 꺼낸 행동은 "이상한 몸짓" 같은 얼버무리 말을 막고, 상대가 있으면 그 인물의 반응 줄이 있어야 한다.
    const guards = said.absurd || said.odd ? ['이상한 몸짓'] : [];
    // 혼자 한 세계 밖 행동은 속마음이 받는다. 상대가 있으면 그 인물이 받는다(첫 줄은 write 가 나레이션으로 고정).
    // 혼잣말은 앞사람이 듣고 대꾸하지 않는다고 프롬프트에 시키므로 상대의 줄을 요구하지 않는다.
    const thought = said.free.speakers.find((s) => said.scenario.cast[s]?.style === 'thought');
    const reactor = said.interject?.action ? undefined : said.self ? (said.absurd || said.odd ? thought : undefined) : this.reactorOf(said);
    // 끝까지 위반하면(입력 낱말을 그대로 쓰는 등) 대체 줄도 세계 밖 행동의 틀(나레이션 동작 한 줄 → 반응 한 줄)을 지킨다.
    // 딴짓은 실제로 일어난 일이라 해석이 요약한 동작(deed)을 그대로 그린다.
    // 세계 밖 행동은 일어나지 않는다. 그 행동을 나레이션으로 그리지 않고 상대(혼자면 속마음)의 받아넘기는 한마디만 쓴다.
    const absurdFloor: Line[] = !narrator || said.absurd ? [] : said.odd && said.deed ? [{ speaker: narrator, text: said.deed.endsWith('.') ? said.deed : `${said.deed}.` }] : [];
    // 혼잣말에 대본의 대체 줄을 내면 입력을 무시하고 대본을 이어 가는 것처럼 보인다. 말이 흩어지는 한 줄로 받는다.
    const unanswered = ctx.self && quiet.length ? quiet : picked ? [picked] : quiet;
    const fallback = absurdFloor.length ? [...absurdFloor, ...(picked ? [picked] : [])] : unanswered;
    const maxLines = said.reaction ? 1 : this.opts.talkLines;
    return this.write('talk', said, fallback, maxLines, guards, (feedback) => buildTalkUser(said, feedback, maxLines, this.opts.maxChars, this.limitsOf(said)), reactor, said.absurd && reactor ? [reactor] : undefined);
  }

  /** 대화에서 입력에 반응해야 하는 인물. 상대 인물이 있으면 그 인물, 혼자면 속마음이다. */
  private reactorOf(ctx: GmContext): string | undefined {
    const { cast, sheet } = ctx.scenario;
    return ctx.free.speakers.find((s) => cast[s]?.style === 'speech' && cast[s]?.lore !== sheet.name) ?? ctx.free.speakers.find((s) => cast[s]?.style === 'thought');
  }

  async narrate(raw: NarrateContext): Promise<GmLines> {
    if ([raw.deed, raw.improv?.deed].some(deed => deed !== undefined && this.unsafeDeed(raw, deed))) {
      throw new GameError('검증되지 않은 행동 요약은 성취로 서술할 수 없어.');
    }
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
      (feedback) => buildNarrateUser(ctx, feedback, this.opts.maxLines, this.opts.maxChars, this.limitsOf(ctx)),
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
    // deed의 안전성은 판정 전에 검증한다. 성공 뒤 성취를 지우지 않는다.
    const deed = ctx.improv?.deed;
    const improvised = deed ? this.improvFallback(ctx, deed) : [];
    if (improvised.length) return improvised;
    const kept = fits(typedFallbackLines(ctx.scenario, ctx.outcome.lines));
    return kept.length ? kept : fits(ctx.free.neutral?.[ctx.roll.tier === 'crit' ? 'hit' : ctx.roll.tier === 'fumble' ? 'miss' : ctx.roll.tier] ?? []);
  }

  /** 검사 없이 화면에 낼 요약에 금지어(바깥 이야기·현대 물건·현실 지명·스포일러·등급)나 변장 노출 말이 들었는가. */
  private unsafeDeed(ctx: GmContext, deed: string): boolean {
    const lore = loreFor(this.lore, ctx.state);
    return FORBIDDEN_GROUPS.some((g) => lore.forbidden[g].some((t) => forbiddenTermIn(g, deed, t, lore))) || lore.exposure.some((t) => forbiddenIn(deed, t));
  }

  /** (행동 요약 내레이션) + (상대 인물의 성격에 맞는 등급별 반응 한 줄). 상대가 없으면 중립 줄을 잇는다. */
  private improvFallback(ctx: NarrateContext, deed: string): Line[] {
    const { cast } = ctx.scenario;
    const narrator = ctx.free.speakers.find((s) => cast[s]?.style === 'narration');
    const sentence = /[.!?…]$/u.test(deed) ? deed : `${deed}.`;
    const result = ctx.outcome.gist === deed ? undefined : ctx.outcome.gist;
    const lines: Line[] = narrator
      ? [...(ctx.roll.tier !== 'miss' && ctx.roll.tier !== 'fumble' ? [{ speaker: narrator, text: sentence }] : [{ speaker: narrator, text: '시도는 뜻대로 이루어지지 않았다.' }]),
        ...(result ? [{ speaker: narrator, text: result }] : [])]
      : [];
    const reactor = this.reactorOf(ctx);
    const who = reactor ? cast[reactor] : undefined;
    const pool = who?.style === 'speech' && who.lore ? this.lore.characters[who.lore]?.reactions?.[ctx.roll.tier === 'crit' ? 'hit' : ctx.roll.tier === 'fumble' ? 'miss' : ctx.roll.tier] : undefined;
    if (reactor && pool?.length) {
      // 이번 판에 이미 한 말은 남은 게 있는 동안 고르지 않는다.
      const said = new Set((ctx.state.spoken?.[reactor] ?? []).map(normalizeKo));
      const fresh = pool.filter((p) => !said.has(normalizeKo(p.text)));
      const from = fresh;
      const pick = from[seedFrom(`${ctx.state.seed}|${ctx.beat.id}|${ctx.text}`) % from.length];
      if (pick) lines.push({ speaker: reactor, text: pick.text, face: pick.face });
      else {
        const authored = typedFallbackLines(ctx.scenario, ctx.outcome.lines).find(line => line.speaker === reactor);
        const last = authored ?? pool[0];
        if (last) lines.push('speaker' in last ? last : { speaker: reactor, text: last.text, face: last.face });
      }
    } else {
      lines.push(...(ctx.free.neutral?.[ctx.roll.tier === 'crit' ? 'hit' : ctx.roll.tier === 'fumble' ? 'miss' : ctx.roll.tier] ?? []));
    }
    return lines;
  }

  quip(ctx: GmContext): Promise<GmLines> {
    const gm = gmSpeakerOf(ctx.scenario);
    if (!gm) return Promise.resolve({ lines: [], meta: { attempts: 0, violations: [], fallback: true, ms: 0, model: this.model } });
    const unsaid = QUIP_UNSAID.filter((w) => !mentions(ctx.text, w));
    // 생성이 실패해도 뜰금없는 행동에 여우 한 줄은 나온다. 설정 사전의 짧은 감탄 가운데 시드로 고른다.
    const pick = pickFallback(this.lore.gmQuips.map((text) => ({ speaker: gm, text })), ctx.state.spoken, seedFrom(`${ctx.state.seed}|${ctx.beat.id}|${ctx.text}`))?.text;
    return this.write('talk', ctx, pick ? [{ speaker: gm, text: pick }] : [], 1, unsaid, (feedback) => buildQuipUser(ctx, feedback), undefined, [gm]);
  }

  private async readInquiry(ctx: GmContext, lore: Lore, candidate?: string): Promise<Inquiry | undefined> {
    if (!this.llm) return undefined;
    const evidence = questionFacts(ctx, lore);
    try {
      const result = await this.llm.chatJson({
        system: '원문 질문이 요구하는 주체(subject), 관계(relation), 답의 종류(answerType)를 먼저 읽고 공개 evidence로 답할 수 있는지 판정한다. candidate는 근거 후보일 뿐 질문을 바꿀 권한이 없다. 공개된 이름이 있어도 요구한 관계의 답이 아니면 쓰지 않는다. 현재 위치/목적지, 국가/도시, 화면 대화의 뜻/주인공의 청취 여부를 구분한다. scene.perspective의 실제 값과 현장 배치·확인된 표시 줄만 사용하고 관객 지식을 주인공 기억으로 승격하지 않는다. 근거가 부족하면 answerable=false, evidence=[]다. 답할 수 있으면 원문 관계를 직접 뒷받침하는 evidence의 source와 정확한 원문 quote만 지정한다. 숨은 정보·뒤 줄을 추측하거나 근거를 만들어 내지 않는다. JSON으로만 답한다.',
        user: JSON.stringify({ question: ctx.text, candidate, evidence }),
        schema: {
          type: 'object', additionalProperties: false, required: ['subject', 'relation', 'answerType', 'answerable', 'evidence'],
          properties: {
            subject: { type: 'string' }, relation: { type: 'string' }, answerType: { type: 'string' },
            answerable: { type: 'boolean' },
            evidence: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['source', 'quote'], properties: { source: { type: 'string' }, quote: { type: 'string' } } } },
          },
        },
        temperature: 0, seed: this.seed(ctx, 'interpret', 96), maxTokens: 400, reserveContext: true,
      });
      this.emit({ task: 'interpret', beat: ctx.beat.id, attempt: 0, input: ctx.text, raw: result.text, violations: [], llm: result, error: null });
      const value: unknown = JSON.parse(result.text);
      if (!value || typeof value !== 'object' || !('subject' in value) || typeof value.subject !== 'string' || !value.subject.trim()
        || !('relation' in value) || typeof value.relation !== 'string' || !value.relation.trim()
        || !('answerType' in value) || typeof value.answerType !== 'string' || !value.answerType.trim()
        || !('answerable' in value) || !('evidence' in value) || !Array.isArray(value.evidence)) return undefined;
      const sources: Inquiry['evidence'] = [];
      for (const raw of value.evidence) {
        const item: unknown = raw;
        if (!item || typeof item !== 'object' || !('source' in item) || typeof item.source !== 'string'
          || !('quote' in item) || typeof item.quote !== 'string' || !item.quote.trim()
          || !evidence[item.source]?.includes(item.quote)) return undefined;
        sources.push({ source: item.source, quote: item.quote });
      }
      const inquiry = { question: ctx.text, subject: value.subject, relation: value.relation, answerType: value.answerType, evidence: value.answerable === true ? sources : [] };
      return inquiry;
    } catch (err) {
      this.emit({ task: 'interpret', beat: ctx.beat.id, attempt: 0, input: ctx.text, raw: '', violations: [], llm: null, error: err instanceof Error ? err.message : String(err) });
      if (err instanceof ContextBudgetError) throw new GameError(err.message);
      return undefined;
    }
  }

  async explain(raw: GmContext): Promise<GmLines> {
    const visibleLore = loreFor(this.lore, raw.state);
    const available = questionFacts(raw, visibleLore);
    const held = raw.inquiry;
    const inquiry = held === null ? undefined : held?.question === raw.text && held.evidence.every(item => item.quote.trim() && available[item.source]?.includes(item.quote))
      ? held : await this.readInquiry(raw, visibleLore, raw.about);
    const ctx = { ...raw, inquiry };
    const gm = gmSpeakerOf(ctx.scenario);
    if (!gm) throw new Error('cast 에 GM 화자(style: gm)가 없습니다');
    const note = visibleLore.knowledge.find((n) => n.id === ctx.about && n.tier !== 'hidden');
    if (!inquiry?.evidence.length) {
      return { lines: explainFallback(ctx, this.lore, gm), meta: { attempts: 0, violations: [], fallback: !inquiry, ms: 0, model: this.model } };
    }
    const unseen = this.lore.knowledge.filter((n) => n.kind === '사람' && n.tier !== 'hidden' && !noteOpen(n, ctx.state)).map((n) => n.name);
    return this.write('explain', ctx, explainFallback(ctx, this.lore, gm), 2, [], (feedback) => buildExplainUser(ctx, unseen, feedback, 2, this.opts.maxChars, note), undefined, [gm]);
  }

  private async write(
    task: GmTask,
    ctx: GmContext | NarrateContext,
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
    const visibleLore = loreFor(this.lore, ctx.state);
    const system = buildSystem(ctx, visibleLore);
    const maxChars = ctx.reaction ? Math.min(this.opts.maxChars, 40) : this.opts.maxChars;
    const { cast, sheet } = ctx.scenario;
    const speakers = speakersOverride ?? ctx.free.speakers;
    const rest = speakers.filter((s) => !(cast[s]?.style === 'speech' && cast[s]?.lore === sheet.name));
    // 대화에서는 반응하는 인물이 첫 줄을 말한다. 연출에서는 행동을 먼저 보여 주고 반응은 검사로만 요구한다.
    // 입식이 있는 인물의 대사·속마음 줄은 줄마다 face 를 가지고 온다. 화면이 그 값으로 표정을 바꾼다.
    const faced = facedSpeakers(cast, speakers);
    // 세계 밖 행동과 먼저 드러난 몸 상태는 나레이션이 먼저 그 모습을 그리고, 반응 인물의 줄은 검사(reactor)로 요구한다.
    const narrator = (ctx.odd || ctx.shown) && task === 'talk' ? speakers.find((s) => cast[s]?.style === 'narration') : undefined;
    const first = narrator ?? (reactor && task === 'talk' ? reactor : undefined);
    const schema = linesSchema(speakers, maxLines, maxChars, first ? { first, ...(reactor && reactor !== first ? { second: reactor } : {}), rest: rest.length ? rest : ctx.free.speakers } : undefined, cast);
    const moved = MOVE_WORD.test(ctx.text) || (task === 'narrate' && MOVE_WORD.test((ctx as NarrateContext).outcome.gist ?? ''));
    const check: CheckOptions = {
      speakers,
      maxLines,
      maxChars,
      cast: ctx.scenario.cast,
      lore: visibleLore,
      stateGuard: [...ctx.free.state_guard, ...activeFacts(ctx.scenario, ctx.state).flatMap((f) => f.state_guard),
        ...(ctx.state.flags['귀찌_변장_설명'] === true ? [] : ['변색 마법', '본모습', '은발', '변장 귀찌']),
        ...(ctx.state.flags['귀찌_설명'] === true ? [] : ['귀찌 수명', '귀찌가 뜨겁', '귀찌가 식']),
        ...(!ctx.state.flags['신분_노출'] ? ['웰든', '대공가', '공녀'] : [])],
      ...(task === 'explain' ? {} : { spoken: ctx.state.spoken ?? {} }),
      // 장면이 '그렇게 말했는지'로 갈래를 나누는 낱말(길을 묻는 말 등)은 플레이어가 먼저 쓴 때만 인물이 말할 수 있다.
      echoOnly: this.unsaidWords(ctx),
      ...(task === 'narrate' && presumeGuard(ctx as NarrateContext) ? { presume: (ctx as NarrateContext).approach.presume ?? [] } : {}),
      outcomeForbid: moved ? outcomeForbid : [...outcomeForbid, ...INVENTED_TRAVEL],
      absent: absentWords(ctx),
      // 해석이 요약한 행동(deed)도 플레이어가 한 일이다. "뽀뽀"라고 쳤어도 "입을 맞췄다"가 면제된다.
      playerText: playerTextOf(ctx),
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
    };
    let feedback = '';
    let attempt = 0;
    const hardRetries = 'improv' in ctx && ctx.improv?.bold && reactor && cast[reactor]?.style === 'speech' ? 2 : 0;
    let hardPending = false;
    let best: { lines: Line[]; soft: number; sets: string[] } | null = null;
    let softTries = 0;
    let lastAttemptMs = 0;
    while (attempt <= this.opts.retries || (hardPending && attempt <= hardRetries)) {
      if (attempt > 0 && performance.now() - started + lastAttemptMs > this.opts.budgetMs && !(hardPending && attempt <= hardRetries)) {
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
      if (task === 'explain' && !out.violations.some(v => v.severity === 'hard')) {
        const facts = questionFacts(ctx, visibleLore);
        const supported = ctx.inquiry?.evidence.map(item => ({ ...item, context: facts[item.source] }));
        if (!ctx.inquiry || !(await this.answersYes(task, ctx, out.lines.map(line => line.text).join('\n'),
          `원문 질문 ${JSON.stringify(ctx.text)}의 주체·관계·답 종류 ${JSON.stringify(ctx.inquiry)}에 직접 답하며, 공개 근거 ${JSON.stringify(supported)}가 답의 모든 사실을 직접 뒷받침하는가? 후보 note의 주제에 맞는지만 보지 않는다. 현재 위치와 목적지, 국가와 도시, 화면에서 본 대화와 주인공의 동석·청취를 구분한다. 관객 시점만으로 주인공이 들었다고 단정하면 아니오다. 근거 부족을 인정하는 답은 허용한다.`, violations))) {
          out.violations.push({ kind: 'beat', rule: 'question_relation', detail: '원래 질문의 주체·관계·답 종류에 공개 근거로 답해야 합니다. 근거가 없으면 모른다고 답하세요.', severity: 'hard' });
        }
      }
      if (task === 'talk' && ctx.beat.conversation && !out.violations.some((v) => v.severity === 'hard')) {
        out.violations.push(...await this.checkGrounding(ctx, out.lines));
      }
      if (ctx.reaction && !out.violations.some((v) => v.severity === 'hard')) {
        for (const line of out.lines) {
          const rule = this.lore.characters[cast[line.speaker]?.lore ?? '']?.reactionCheck;
          if (rule && await this.answersYes(task, ctx, line.text, rule, violations, true)) {
            out.violations.push({ kind: 'lore', rule: 'reaction_style', detail: ctx.spoken ? '설명 독백·상황 해설·긴 문장 대신 아시나가 한 말에 짧게 답하세요.' : '설명 독백·상황 해설·긴 문장 대신 눈앞의 감정이나 몸 반응에 짧게 답하세요.', severity: 'hard' });
          } else if (rule && !(await this.answersYes(task, ctx, `플레이어 입력: ${ctx.text}\n남자의 대사: ${line.text}`,
            // 건넨 말을 몸 반응 질문으로 가리면 말을 제대로 받은 줄도 '드러난 몸 반응이 없다'며 거절해 대체 줄로 떨어진다(59d 11번).
            ctx.spoken
              ? '남자의 대사가 아시나가 한 말의 구체적인 내용을 받는가? 그 말에 대한 되물음·명령·비웃음·관심이면 예다. 단순 감탄·침묵만 있거나, 입력에 없는 눈빛·행동을 지어내거나, 앞 장면의 질문을 되묻는 무관한 말이면 아니오다.'
              : ctx.acted
                ? '남자의 대사가 아시나가 한 행동(입력)을 구체적으로 받는가? 그 행동이나 꺼낸 물건에 대한 경계·명령·비웃음·질문이면 예다. 단순 감탄·침묵만 있거나, 입력에 없는 말·감정을 지어내거나, 앞 장면의 질문을 되묻는 무관한 말이면 아니오다.'
                : '남자의 대사가 입력에 실제로 드러난 감정·몸 반응을 구체적으로 받는가? 울음·떨림·굳음·탈진 등 그 모습에 대한 질문이나 명령, 비웃음이면 예다. 단순 감탄·침묵만 있거나, 입력에 없는 눈빛·말·행동을 지어내거나, 앞 장면의 질문을 되묻는 무관한 말이면 아니오다.', violations))) {
            out.violations.push({ kind: 'beat', rule: 'reaction_response', detail: ctx.spoken
              ? `아시나가 한 말 "${ctx.text}"의 내용을 짚어 짧게 받아 주세요. 감탄만 하거나 입력에 없는 말을 전제하지 마세요.`
              : ctx.acted
                ? `아시나가 한 행동 "${ctx.text}"을 짚어 짧게 받아 주세요. 감탄만 하거나 입력에 없는 말·감정을 전제하지 마세요.`
                : `입력 "${ctx.text}"에 실제 드러난 감정·몸 반응을 짧게 받아 주세요. 감탄만 하거나 입력에 없는 말을 전제하지 마세요.`, severity: 'hard' });
          }
        }
      }
      if (!out.violations.some((v) => v.severity === 'hard')) {
        const grammar = await this.checkGrammar(task, ctx, out.lines);
        out.violations.push(...grammar.violations);
        out.lines = grammar.lines;
      }
      const state = out.violations.some((v) => v.severity === 'hard') ? { broken: [], sets: [] } : await this.checkState(task, ctx, out.lines, violations);
      out.violations.push(...state.broken.map((fact): Violation => ({ kind: 'beat', rule: 'state_check', detail: `상태를 서술로 바꾸지 마세요. 지금 사실: ${fact}`, severity: 'hard' })));
      // 다음 재생성의 예산에는 생성뿐 아니라 문법·반응·상태 검수 시간도 포함한다.
      lastAttemptMs = performance.now() - attemptStarted;
      this.emit({ task, beat: ctx.beat.id, attempt, input: ctx.text, raw: res.text, violations: out.violations, llm: res, error: null });
      if (out.violations.length === 0) return finish(this.polish(out.lines, ctx, reactor), attempt, false, state.sets);
      violations.push(...out.violations.map((v) => `${v.kind}/${v.rule}: ${v.detail}`));
      feedback = feedbackFor(out.violations);
      const hard = out.violations.filter((v) => v.severity === 'hard').length;
      hardPending = hard > 0;
      if (hard === 0) {
        const soft = out.violations.length;
        if (!best || soft < best.soft) best = { lines: out.lines, soft, sets: state.sets };
        if (softTries >= this.opts.softRetries) break;
        softTries += 1;
      }
    }
    return best ? finish(this.polish(best.lines, ctx, reactor), attempt, false, best.sets) : finish(fallback, attempt, true);
  }

  /** 생성문 전체를 검수한다. 오류는 치환하지 않고 기존 재생성 경로로 돌린다. */
  private async checkGrounding(ctx: GmContext, lines: readonly Line[]): Promise<Violation[]> {
    const problem = (detail: string): Violation[] => [{ kind: 'lore', rule: 'grounding', detail, severity: 'hard' }];
    if (!this.llm) return problem('주장의 근거를 확인하지 못했습니다.');
    const lore = loreFor(this.lore, ctx.state);
    const evidence = Object.fromEntries([
      ['situation', ctx.free.situation], ['input', ctx.text],
      ...activeFacts(ctx.scenario, ctx.state).map((fact, index) => [`fact${index}`, fact.text]),
      ...lore.knowledge.filter((note) => note.tier !== 'hidden').map((note) => [`note:${note.id}`, note.text]),
      ...ctx.state.recent.map((line, index) => [`recent${index}`, `${line.speaker}: ${line.text}`]),
      ...ctx.free.speakers.flatMap((speaker) => {
        const who = lore.characters[ctx.scenario.cast[speaker]?.lore ?? ''];
        return who ? [[`character:${speaker}`, [who.look, who.personality, ...who.values].join('\n')]] : [];
      }),
    ]);
    try {
      const res = await this.llm.chatJson({
        system: '대화의 주장을 검수한다. 문장마다 모든 주장을 text로 명시하고 근거의 소유자를 판정한다. kind는 눈앞의 관찰 observation, 화자 자신의 실행 의사 intention, 주관임이 드러나는 의견 opinion, 외부 세계의 사실 world다. 시제와 특정 낱말로 분류하지 않는다. 규칙·의무·관습·인과·보장은 현재형이거나 NPC가 말해도 외부 사실이다. 사실 주장을 개인 의견으로 위장해 허용하지 않는다. world는 evidence의 어느 항목이 그 주장을 직접 뒷받침하는지 source와 정확한 quote를 지정한다. 인물 가치관은 그 인물의 태도 근거이지 세계 전체의 규칙 근거가 아니다. 비슷한 상황을 일반화하거나 근거에 없는 규칙을 만들면 supported=false, source=none이다. 정본의 현재 공개 정보·인물 설정은 지정된 근거 안에서 허용한다. 관찰·자신의 의사·주관 의견은 인물의 현재 반응으로 허용한다. 이때 출처가 없으면 source=none,quote=""다. 인용할 때는 어느 kind든 evidence 원문을 그대로 쓰며 candidate를 evidence처럼 인용하지 않는다. 숨은 사실·타인의 결정·세계 규칙을 개인 반응으로 바꾸지 않는다. 각 line 번호의 claims를 JSON으로 답한다.',
        user: JSON.stringify({ evidence, lines: lines.map(({ speaker, text }, line) => ({ line, speaker, text })) }),
        schema: { type: 'object', additionalProperties: false, required: ['assessments'], properties: { assessments: { type: 'array', minItems: lines.length, maxItems: lines.length, items: {
          type: 'object', additionalProperties: false, required: ['line', 'claims'], properties: {
            line: { type: 'integer', minimum: 0, maximum: lines.length - 1 },
            claims: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['text', 'kind', 'supported', 'source', 'quote'], properties: {
              text: { type: 'string', minLength: 1, maxLength: 200 },
              kind: { type: 'string', enum: ['observation', 'intention', 'opinion', 'world'] },
              supported: { type: 'boolean' }, source: { type: 'string', enum: ['none', ...Object.keys(evidence)] }, quote: { type: 'string', maxLength: 200 },
            } } },
          },
        } } } },
        temperature: 0, seed: this.seed(ctx, 'talk', 96), maxTokens: 500,
      });
      const parsed = JSON.parse(res.text) as { assessments?: { line?: number; claims?: { text?: string; kind?: string; supported?: boolean; source?: string; quote?: string }[] }[] };
      const assessments = parsed.assessments;
      if (!Array.isArray(assessments) || assessments.length !== lines.length || new Set(assessments.map((item) => item.line)).size !== lines.length) return problem('문장별 주장 검수가 완전하지 않습니다.');
      const citations: { claim: string; evidence: string }[] = [];
      for (const item of assessments) {
        if (!Number.isInteger(item.line) || item.line === undefined || item.line < 0 || item.line >= lines.length || !Array.isArray(item.claims) || !item.claims.length) return problem('문장별 주장 검수가 올바르지 않습니다.');
        for (const claim of item.claims) {
          if (!claim.text?.trim() || !['observation', 'intention', 'opinion', 'world'].includes(claim.kind ?? '') || claim.supported !== true) return problem('현재 관찰·자기 의사·주관 의견과 외부 사실을 구분하세요. 근거 없는 세계 사실을 만들지 마세요.');
          if (claim.source !== 'none' && (!claim.source || !claim.quote || !evidence[claim.source]?.includes(claim.quote))) return problem('인용 근거는 현재 공개 evidence에 실제 있는 원문이어야 합니다. 생성 대사를 근거로 인용하지 마세요.');
          if (claim.kind === 'world') {
            if (!claim.source || claim.source === 'none' || !claim.quote) return problem('외부 사실은 현재 공개된 정본 근거가 있는 내용만 말하세요.');
            citations.push({ claim: claim.text, evidence: claim.quote });
          }
        }
      }
      if (citations.length) {
        const audit = await this.llm.chatJson({
          system: '인용한 근거가 주장을 직접 뒷받침하는지 검수한다. 이야기의 그럴듯함이나 앞선 판정은 고려하지 않는다. 각 evidence만 참이라고 할 때 claim을 사실로 말할 수 있어야 supported=true다. 주제·장소·인물이 같거나 가치관이 비슷한 것만으로는 지지하지 않는다. 원문에 없는 규칙·의무·인과·미래 보장을 덧붙이면 false다. 입력 순서대로 supported 배열을 답한다.',
          user: JSON.stringify({ citations }),
          schema: { type: 'object', additionalProperties: false, required: ['supported'], properties: { supported: { type: 'array', minItems: citations.length, maxItems: citations.length, items: { type: 'boolean' } } } },
          temperature: 0, seed: this.seed(ctx, 'talk', 95), maxTokens: 100,
        });
        const result = JSON.parse(audit.text) as { supported?: unknown };
        if (!Array.isArray(result.supported) || result.supported.length !== citations.length || result.supported.some((supported) => supported !== true)) return problem('인용한 정본 근거가 그 주장을 직접 뒷받침하지 않습니다. 그럴듯한 세계 규칙이나 인과를 추가하지 마세요.');
      }
      return [];
    } catch (error) {
      return problem(`주장 근거 검수 오류: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 문법 교정 가운데 원문 시점·주어·문장 끝을 지키는 것만 적용한다. */
  private async checkGrammar(task: GmTask, ctx: GmContext | NarrateContext, lines: Line[]): Promise<{ violations: Violation[]; lines: Line[] }> {
    const problem = (detail: string) => ({ violations: [{ kind: 'format', rule: 'grammar', detail, severity: 'hard' } as Violation], lines });
    if (!this.llm) return problem('문법 검수에 연결하지 못했습니다.');
    try {
      const input = ctx.input ?? parseStoryInput(ctx.text);
      const res = await this.llm.chatJson({
        system: GRAMMAR_SYSTEM,
        user: JSON.stringify({
          context: {
            task, goal: ctx.free.goal,
            scene: ctx.beat.title, situation: ctx.free.situation, perspective: ctx.beat.perspective ?? 'protagonist',
            resolution: task === 'narrate' && 'roll' in ctx ? {
              action: ctx.approach.label, tier: ctx.roll.tier, gist: ctx.outcome.gist ?? '',
              deed: ctx.improv?.deed ?? ctx.deed ?? null,
              price: ctx.price?.text ?? null, fumble: ctx.fumble ?? null,
            } : null,
            evidence: {
              facts: activeFacts(ctx.scenario, ctx.state).map(fact => fact.text),
              recent: ctx.state.recent.slice(-4).map(({ speaker, text }) => ({ speaker, text })),
              displayed: ctx.displayed ? { speaker: ctx.displayed.speaker, text: ctx.displayed.text } : null,
              ...(task === 'explain' ? { question: ctx.inquiry ?? null, knowledge: questionFacts(ctx, loreFor(this.lore, ctx.state)) } : {}),
            },
            player: { name: ctx.scenario.sheet.name, original: ctx.text, action: input.kind === 'valid' ? input.action : '', speech: input.kind === 'valid' ? input.speech : '' },
            speakers: lines.map(({ speaker }) => ({ speaker, display: ctx.scenario.cast[speaker]?.display, style: ctx.scenario.cast[speaker]?.style, lore: ctx.scenario.cast[speaker]?.lore })),
          },
          lines: lines.map(({ speaker, text }) => ({ speaker, text })),
        }),
        schema: { type: 'object', additionalProperties: false, properties: { lines: { type: 'array', minItems: lines.length, maxItems: lines.length, items: { type: 'object', additionalProperties: false, properties: { original: { type: 'string' }, corrected: { type: 'string' } }, required: ['original', 'corrected'] } } }, required: ['lines'] },
        temperature: 0,
        seed: this.seed(ctx, 'talk', 98),
        // 생성 상한 600토큰의 원문과 교열문을 함께 반환한다.
        maxTokens: 1200,
      });
      const review: unknown = JSON.parse(res.text);
      if (!review || typeof review !== 'object' || !('lines' in review) || !Array.isArray(review.lines) || review.lines.length !== lines.length) {
        return problem('문법 검수 응답 형식이 잘못되어 검수하지 못했습니다.');
      }
      const fixed: Line[] = [];
      const rewrites: string[] = [];
      for (let i = 0; i < lines.length; i += 1) {
        const entry: unknown = review.lines[i];
        const line = lines[i];
        if (!line || !entry || typeof entry !== 'object' || !('original' in entry) || entry.original !== line.text || !('corrected' in entry) || typeof entry.corrected !== 'string' || !entry.corrected.trim()) {
          return problem('문법 검수 응답이 원문과 대응하지 않아 검수하지 못했습니다.');
        }
        // 시점·주어를 바꾸거나 빼거나 마침표를 덧붙인 교정은 교정이 아니라 버리고 원문을 둔다(위반·재생성 사유가 아니다).
        // 맞춤법·띄어쓰기 수준의 작은 교정은 바로 적용한다. 문장을 고쳐 쓰는 큰 교정만 지금처럼 다시 쓰게 한다.
        const kind = correctionKind(line.text, entry.corrected, ctx.scenario.sheet.name);
        fixed.push(kind === 'small' ? { ...line, text: entry.corrected.trim() } : line);
        if (kind === 'rewrite') rewrites.push(`${line.text} → ${entry.corrected}`);
      }
      if (rewrites.length) return problem(`문법 교열에서 차이가 발견되었습니다: ${rewrites.join(' / ')}. 문법·활용·호응·뜻을 바로잡아 다시 쓰되 입력의 말·행동과 인물의 성격·말투는 지키세요.`);
      return { violations: [], lines: fixed };
    } catch (err) {
      if (!(err instanceof Error)) throw err;
      return problem(`문법 검수 실패: ${err.message}`);
    }
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
      const named = (text: string) => !check.subject || check.subject.some((word) => mentions(text, word));
      if (!about(written) || !named(written)) continue;
      // 대본의 결과·대가가 같은 변화를 정했으면 통과한다. 같은 낱말이 나온 것만으로는 허락이 아니다.
      if (about(authored) && (await this.answersYes(task, ctx, authored, check.ask, violations))) continue;
      // 판정을 받지 못한 서술은 확인되지 않은 것이니 상태를 바꿨다고 본다.
      const changed = await this.answersYes(task, ctx, written, check.ask, violations, true);
      if (!changed) continue;
      if (!about(input) || !named(input) || !(await this.answersYes(task, ctx, input, check.ask, violations))) result.broken.push(fact.text);
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
        ...(task === 'explain' ? { reserveContext: true } : {}),
      });
      return (JSON.parse(res.text) as { answer?: unknown }).answer === true;
    } catch (err) {
      const message = (err as Error).message;
      violations.push(`state_check_error:${message}`);
      this.emit({ task, beat: ctx.beat.id, attempt: 0, input: text, raw: '', violations: [], llm: null, error: message });
      if (err instanceof ContextBudgetError) throw new GameError(err.message);
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

  /** 한 갈래(said.words)의 낱말은 같은 뜻이다. 플레이어가 그중 하나를 쓰면 그 갈래의 다른 낱말도 되받을 수 있다. */
  private unsaidWords(ctx: GmContext): string[] {
    const playerText = playerTextOf(ctx);
    const open = ctx.free.approaches.flatMap((a) => {
      const words = a.said?.words ?? [];
      return words.some((w) => mentions(playerText, w)) ? [] : words;
    });
    return [...ctx.free.echo_only, ...open];
  }

  /** 다음 장면에 그대로 나올 고정 줄 중 모델이 쓰기 쉬운 것: 바로 다음 장면 인물의 줄과, 인물 절의 원작 대사 예에 실린 줄. */
  private aheadOf(ctx: GmContext): string[] {
    const { scenario, free, beat } = ctx;
    const speakers = free.speakers.filter((s) => scenario.cast[s]?.style === 'speech' && scenario.cast[s]?.lore !== scenario.sheet.name);
    const samples = speakers.flatMap((s) => this.lore.characters[scenario.cast[s]?.lore ?? '']?.samples.speech ?? []).map(normalizeKo);
    const next = new Set(
      edgesOf(beat).flatMap((id) => {
        const target = scenario.beats[id];
        return target ? linesOfBeat(target).filter((l) => speakers.includes(l.speaker)).map((l) => normalizeKo(l.text)) : [];
      }),
    );
    const ahead = this.reservedFor(scenario, beat.id).filter((r) => r.future && (next.has(r.norm) || samples.some((s) => s.includes(r.norm))));
    return [...new Set(ahead.map((r) => r.text))].slice(0, AHEAD_LIMIT);
  }

  private limitsOf(ctx: GmContext): WriteLimits {
    const playerText = playerTextOf(ctx);
    return { ahead: this.aheadOf(ctx), unsaid: this.unsaidWords(ctx).filter((w) => !mentions(playerText, w)) };
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

/**
 * 교열 답의 종류. same: 차이 없음. invalid: 시점(주인공 이름 등장)·주어(은/는/이/가로 끝난 어절)를 바꾸거나 빼거나 마침표를 덧붙인 것 — 버린다.
 * small: 띄어쓰기만 다르거나 글자 몇 개 차이(맞춤법·조사) — 바로 적용한다. rewrite: 문장을 고쳐 쓴 것 — 다시 쓰게 한다.
 */
export function correctionKind(original: string, corrected: string, hero: string): 'same' | 'invalid' | 'small' | 'rewrite' {
  const o = original.trim();
  const c = corrected.trim();
  if (o === c) return 'same';
  const flat = (text: string) => text.replace(/\s+/g, '');
  if (flat(o) === flat(c)) return 'small';
  if (/\.\.$/u.test(c) && !/\.\.$/u.test(o)) return 'invalid';
  const count = (text: string) => (hero ? text.split(hero).length - 1 : 0);
  if (count(c) > count(o)) return 'invalid';
  const bare = (word: string) => word.replace(/[^\p{L}\p{N}]+/gu, '');
  const words = c.split(/\s+/).map(bare);
  const subjects = o.split(/\s+/).map(bare).filter((word) => /[은는이가]$/u.test(word));
  if (!subjects.every((subject) => words.some((word) => editDistance(word, subject) <= 1))) return 'invalid';
  return editDistance(flat(o), flat(c)) <= Math.max(2, Math.ceil([...flat(o)].length / 10)) ? 'small' : 'rewrite';
}
function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length] ?? 0;
}
