import { seedFrom } from '../engine/dice.ts';
import { activeFacts, gmSpeakerOf, noteOpen, type GmContext, type GmLines, type GmMeta, type GmPort, type Interpretation, type NarrateContext } from '../engine/engine.ts';
import { edgesOf, linesOfBeat, typedFallbackLines } from '../engine/scenario.ts';
import { ABILITIES, type Ability, type GmTask, type Line, type NoteEntry, type Scenario } from '../engine/types.ts';
import { LlmError, type LlmClient, type LlmResult } from './llm.ts';
import type { Lore } from './lore.ts';
import { buildQuipUser, buildExplainUser, buildInterpretUser, buildNarrateUser, buildSystem, buildTalkUser, interpretSchema, linesSchema } from './prompt.ts';
import { ITEM_RULE_MIN_SCORE, isNoise, ruleInterpret } from './rules.ts';
import { feedbackFor, mentions, normalizeKo, validateOutput, type CheckOptions, type ReservedLine, type Violation } from './validate.ts';

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

const DIFFICULTY: Record<string, number> = { 쉬움: 1, 보통: 0, 어려움: -1 };

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

/** LLM 이 없거나 실패할 때의 배경 설명. 질문에 나온 낱말로 아시나가 아는 항목을 찾는다. */
export function explainFallback(ctx: GmContext, lore: Lore, gm: string): Line[] {
  const score = (n: NoteEntry) => Math.max(0, ...n.keys.filter((k) => mentions(ctx.text, k)).map((k) => k.length));
  const best = lore.knowledge
    .filter((n) => n.tier !== 'hidden' && score(n) > 0)
    .sort((a, b) => score(b) - score(a))[0];
  if (!best) return [{ speaker: gm, text: '그건 아시나도 모른다.' }];
  if (best.after?.length && !noteOpen(best, ctx.state)) return [{ speaker: gm, text: '아시나는 아직 그런 사람을 본 적이 없다.' }];
  return [{ speaker: gm, text: `아시나는 알고 있다. ${best.text}` }];
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
    const improvByRule = (absurd: boolean, m: GmMeta): Interpretation => ({ kind: 'improv', stat: '재치', difficulty: absurd ? -1 : 0, label: '즉흥 행동', absurd, source: 'rule', meta: m });
    if (rule.kind === 'ask') return { kind: 'ask', source: 'rule', meta: meta(0, [], false) };
    if (rule.kind === 'deflect') return { kind: 'talk', tone: 'deflect', source: 'rule', meta: meta(0, [], false) };
    if (rule.kind === 'improv' && rule.absurd) return improvByRule(true, meta(0, [], false));
    if (rule.kind === 'talk' && isNoise(ctx.text)) return { kind: 'talk', source: 'rule', meta: meta(0, [], false) };
    if (rule.kind === 'approach' && rule.item !== null && rule.score >= ITEM_RULE_MIN_SCORE)
      return { kind: 'approach', approach: rule.approach, item: rule.item, source: 'rule', meta: meta(0, [], false) };
    const byRule = (attempts: number, violations: string[]): Interpretation => {
      const m = meta(attempts, violations, true);
      if (rule.kind === 'approach') return { kind: 'approach', approach: rule.approach, item: rule.item, source: 'rule', meta: m };
      return rule.kind === 'improv' ? improvByRule(rule.absurd, m) : { kind: 'talk', source: 'rule', meta: m };
    };
    if (!this.llm) return byRule(0, ['error:LLM 미연결']);

    let res: LlmResult | null = null;
    try {
      res = await this.llm.chatJson({
        system: buildSystem(ctx, this.lore),
        user: buildInterpretUser(ctx),
        schema: interpretSchema(ctx.free, ctx.state.items),
        temperature: this.opts.interpretTemperature,
        seed: this.seed(ctx, 'interpret', 1),
        maxTokens: 200,
      });
      this.model = res.model ?? this.model;
      const parsed = JSON.parse(res.text) as { approach?: unknown; item?: unknown; reason?: unknown; stat?: unknown; difficulty?: unknown; absurd?: unknown };
      const approach = typeof parsed.approach === 'string' ? parsed.approach : '';
      this.emit({ task: 'interpret', beat: ctx.beat.id, attempt: 1, input: ctx.text, raw: res.text, violations: [], llm: res, error: null });
      if (approach === 'talk') return { kind: 'talk', source: 'llm', meta: meta(1, [], false) };
      if (approach === 'ask') return { kind: 'ask', source: 'llm', meta: meta(1, [], false) };
      if (approach === 'deflect') return { kind: 'talk', tone: 'deflect', source: 'llm', meta: meta(1, [], false) };
      if (approach === 'improv') {
        const stat: Ability = ABILITIES.find((a) => a === parsed.stat) ?? '재치';
        const absurd = parsed.absurd === true;
        const label = typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim().slice(0, 20) : '즉흥 행동';
        return { kind: 'improv', stat, difficulty: DIFFICULTY[String(parsed.difficulty)] ?? 0, label, absurd, source: 'llm', meta: meta(1, [], false) };
      }
      if (!ctx.free.approaches.some((a) => a.id === approach)) throw new Error(`알 수 없는 행동 id "${approach}"`);
      const item = typeof parsed.item === 'string' && ctx.state.items.includes(parsed.item) ? parsed.item : null;
      return { kind: 'approach', approach, item, source: 'llm', meta: meta(1, [], false) };
    } catch (err) {
      const message = (err as Error).message;
      this.emit({ task: 'interpret', beat: ctx.beat.id, attempt: 1, input: ctx.text, raw: res?.text ?? '', violations: [], llm: res, error: message });
      return byRule(1, [`error:${message}`]);
    }
  }

  talk(ctx: GmContext): Promise<GmLines> {
    // 지금 장면에 없는 인물의 대체 줄은 쓰지 않는다.
    const pool = (ctx.tone === 'deflect' ? ctx.free.deflect : ctx.free.talk_fallback).filter((l) => ctx.free.speakers.includes(l.speaker));
    const picked = pool[((ctx.state.free?.talks ?? 0) + (ctx.state.said?.length ?? 0)) % Math.max(pool.length, 1)];
    const narrator = ctx.free.speakers.find((s) => ctx.scenario.cast[s]?.style === 'narration');
    const quiet: Line[] = narrator ? [{ speaker: narrator, text: '대답은 돌아오지 않았다.' }] : [];
    return this.write('talk', ctx, picked ? [picked] : quiet, this.opts.talkLines, [], (feedback) => buildTalkUser(ctx, feedback, this.opts.talkLines, this.opts.maxChars), ctx.interject?.action ? undefined : this.reactorOf(ctx));
  }

  /** 대화에서 입력에 반응해야 하는 인물. 상대 인물이 있으면 그 인물, 혼자면 속마음이다. */
  private reactorOf(ctx: GmContext): string | undefined {
    const { cast, sheet } = ctx.scenario;
    return ctx.free.speakers.find((s) => cast[s]?.style === 'speech' && cast[s]?.lore !== sheet.name) ?? ctx.free.speakers.find((s) => cast[s]?.style === 'thought');
  }

  narrate(ctx: NarrateContext): Promise<GmLines> {
    // 이 세계에 없는 물건을 꺼냈을 때는 상대 인물이 어이없어하는 한마디가 있어야 한다.
    const absurd = ctx.improv?.absurd === true;
    return this.write(
      'narrate',
      ctx,
      this.narrateFallback(ctx),
      this.opts.maxLines,
      [...(ctx.outcome.forbid ?? []), ...(absurd ? ['이상한 몸짓'] : [])],
      (feedback) => buildNarrateUser(ctx, feedback, this.opts.maxLines, this.opts.maxChars),
      absurd ? this.reactorOf(ctx) : undefined,
    );
  }

  /**
   * GM 이 끝내 못 썼을 때 쓰는 줄. 플레이어 대신 하는 말과 특정 입력을 전제로 한 줄은 빼고,
   * 이미 일어난 일(후드를 벗었다 등)과 어긋나는 줄도 뺀다. 남는 줄이 없으면 장면의 중립 줄을 쓴다.
   */
  private narrateFallback(ctx: NarrateContext): Line[] {
    const forbid = activeFacts(ctx.scenario, ctx.state).flatMap((f) => f.forbid);
    const fits = (lines: readonly Line[]) => lines.filter((l) => !forbid.some((w) => mentions(l.text, w)));
    const kept = fits(typedFallbackLines(ctx.scenario, ctx.outcome.lines));
    return kept.length ? kept : fits(ctx.free.neutral?.[ctx.roll.tier] ?? []);
  }

  quip(ctx: GmContext): Promise<GmLines> {
    const gm = gmSpeakerOf(ctx.scenario);
    if (!gm) return Promise.resolve({ lines: [], meta: { attempts: 0, violations: [], fallback: true, ms: 0, model: this.model } });
    return this.write('talk', ctx, [], 1, [], (feedback) => buildQuipUser(ctx, feedback), undefined, [gm]);
  }

  explain(ctx: GmContext): Promise<GmLines> {
    const gm = gmSpeakerOf(ctx.scenario);
    if (!gm) throw new Error('cast 에 GM 화자(style: gm)가 없습니다');
    const unseen = this.lore.knowledge.filter((n) => n.kind === '사람' && n.tier !== 'hidden' && !noteOpen(n, ctx.state)).map((n) => n.name);
    return this.write('explain', ctx, explainFallback(ctx, this.lore, gm), 2, [], (feedback) => buildExplainUser(ctx, unseen, feedback, 2, this.opts.maxChars), undefined, [gm]);
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
  ): Promise<GmLines> {
    const started = performance.now();
    const violations: string[] = [];
    const finish = (lines: Line[], attempts: number, usedFallback: boolean): GmLines => ({
      lines,
      meta: { attempts, violations, fallback: usedFallback, ms: Math.round(performance.now() - started), model: this.model },
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
    const schema = linesSchema(speakers, maxLines, this.opts.maxChars, reactor && task === 'talk' ? { first: reactor, rest: rest.length ? rest : ctx.free.speakers } : undefined);
    const check: CheckOptions = {
      speakers,
      maxLines,
      maxChars: this.opts.maxChars,
      cast: ctx.scenario.cast,
      lore: this.lore,
      sceneForbid: [...ctx.free.forbid, ...activeFacts(ctx.scenario, ctx.state).flatMap((f) => f.forbid)],
      // 장면이 '그렇게 말했는지'로 갈래를 나누는 낱말(길을 묻는 말 등)은 플레이어가 먼저 쓴 때만 인물이 말할 수 있다.
      echoOnly: [...ctx.free.echo_only, ...ctx.free.approaches.flatMap((a) => a.said?.words ?? [])],
      ...(task === 'narrate' && (ctx as NarrateContext).approach.presume ? { presume: (ctx as NarrateContext).approach.presume } : {}),
      outcomeForbid,
      playerText: [ctx.text, ...(ctx.state.said ?? [])].join(' '),
      reserved: [...(ctx.interject?.upcoming ?? []).map((u) => ({ norm: normalizeKo(u), text: u, future: true })).filter((r) => r.norm.length >= 2), ...this.reservedFor(ctx.scenario, ctx.beat.id)],
      gist: task === 'narrate' ? ((ctx as NarrateContext).outcome.gist ?? '') : '',
      playerLore: ctx.scenario.sheet.name,
      ...(reactor ? { reactor } : {}),
    };
    let feedback = '';
    let attempt = 0;
    let best: { lines: Line[]; soft: number } | null = null;
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
      this.emit({ task, beat: ctx.beat.id, attempt, input: ctx.text, raw: res.text, violations: out.violations, llm: res, error: null });
      if (out.violations.length === 0) return finish(out.lines, attempt, false);
      violations.push(...out.violations.map((v) => `${v.kind}/${v.rule}: ${v.detail}`));
      feedback = feedbackFor(out.violations);
      const hard = out.violations.filter((v) => v.severity === 'hard').length;
      if (hard === 0) {
        const soft = out.violations.length;
        if (!best || soft < best.soft) best = { lines: out.lines, soft };
        if (softTries >= this.opts.softRetries) break;
        softTries += 1;
      }
    }
    return best ? finish(best.lines, attempt, false) : finish(fallback, attempt, true);
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
