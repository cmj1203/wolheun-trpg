import { evalCond, type CondContext } from './conditions.ts';
import { roll2d6 } from './dice.ts';
import {
  ABILITIES,
  GameError,
  TIER_LABEL,
  TRACKS,
  TRACK_INFO,
  type Ability,
  type Action,
  type ApproachSpec,
  type BeatSpec,
  type ChoiceSpec,
  type Effects,
  type FactSpec,
  type FreeSpec,
  type GameEvent,
  type GameState,
  type GmTask,
  type Hud,
  type ItemView,
  type Line,
  type LogEntry,
  type Mod,
  type ModApplied,
  type Next,
  type NoteEntry,
  type NoteView,
  type PendingLine,
  type Outcome,
  type Prompt,
  type RollResult,
  type Scenario,
  type Step,
  type TrackChange,
} from './types.ts';

export interface GmMeta {
  attempts: number;
  violations: string[];
  fallback: boolean;
  ms: number;
  model: string | null;
}

export type TalkTone = 'plain' | 'repeat' | 'deflect';

export type Interpretation =
  | { kind: 'approach'; approach: string; item: string | null; source: 'llm' | 'rule'; meta: GmMeta }
  | { kind: 'talk'; tone?: TalkTone; source: 'llm' | 'rule'; meta: GmMeta }
  | { kind: 'ask'; source: 'llm' | 'rule'; meta: GmMeta }
  | { kind: 'improv'; stat: Ability; difficulty: number; label: string; absurd: boolean; source: 'llm' | 'rule'; meta: GmMeta };

export interface GmLines {
  lines: Line[];
  meta: GmMeta;
}

export interface GmContext {
  scenario: Scenario;
  beat: BeatSpec;
  free: FreeSpec;
  state: Readonly<GameState>;
  text: string;
  tone?: TalkTone;
  /** 대사 도중 끼어든 입력. upcoming 은 곧 나올 고정 줄이고, action 은 판정 없이 시도만 묘사할 행동이다. */
  interject?: { upcoming: string[]; action: boolean };
  /** "~있어?", "~할 수 있어?" 처럼 허락을 묻는 입력이다. */
  permission?: boolean;
}

export interface NarrateContext extends GmContext {
  approach: ApproachSpec;
  roll: RollResult;
  outcome: Outcome;
  improv?: { absurd: boolean };
}

export interface GmPort {
  prepare?(ctx: Omit<GmContext, 'text'>): void;
  interpret(ctx: GmContext): Promise<Interpretation>;
  talk(ctx: GmContext): Promise<GmLines>;
  narrate(ctx: NarrateContext): Promise<GmLines>;
  /** 배경 질문에 GM 으로 답한다. 아시나가 아는 범위만 말한다. */
  explain(ctx: GmContext): Promise<GmLines>;
  /** 뜻밖의 행동에 진행자가 덧붙이는 짧은 한마디. 없으면 건너뛴다. */
  quip?(ctx: GmContext): Promise<GmLines>;
}

/** 수첩 항목이 적혔는지 기록하는 flag 이름 */
export const noteFlag = (id: string) => `수첩:${id}`;

/** 수첩에 적힌 항목인가. 숨길 것은 if 가 참일 때만, 나머지는 after 가 없거나 그 비트에 들어간 뒤다. */
export function noteOpen(note: NoteEntry, state: Pick<GameState, 'tracks' | 'abilities' | 'flags' | 'items'>): boolean {
  const ctx: CondContext = { tracks: state.tracks, abilities: state.abilities, flags: state.flags, items: state.items };
  if (note.if !== undefined && !evalCond(note.if, ctx)) return false;
  if (note.tier === 'hidden') return note.if !== undefined;
  return !note.after?.length || state.flags[noteFlag(note.id)] === true;
}

/** 지금 참인 사실(후드, 잃은 소지품, 이미 일어난 일). GM 입력과 검증이 함께 쓴다. */
export function activeFacts(scenario: Scenario, state: Pick<GameState, 'tracks' | 'abilities' | 'flags' | 'items'>): FactSpec[] {
  const ctx: CondContext = { tracks: state.tracks, abilities: state.abilities, flags: state.flags, items: state.items };
  return scenario.facts.filter((f) => evalCond(f.if, ctx));
}

/** 결과 화면과 주사위에 나오는 즉흥 행동 이름. 플레이어 입력을 짧게 줄인다. */
/** 판정 창에 쓸 짧은 행동 이름. 괄호·따옴표·말줄임 없이, 길면 끝의 두 어절(서술어 쪽)만 쓴다. */
export function improvLabel(text: string): string {
  const plain = text.replace(/[()[\]{}"'“”‘’「」『』]/gu, ' ').replace(/[.!?…~,]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return '즉흥 행동';
  if ([...plain].length <= 14) return plain;
  const words = plain.split(' ');
  const two = words.slice(-2).join(' ');
  return [...two].length <= 14 ? two : (words.at(-1) ?? '즉흥 행동');
}

/** GM 설명을 맡는 화자(cast 의 style: gm). 없으면 배경 질문도 대화로 받는다. */
export const gmSpeakerOf = (scenario: Scenario): string | undefined => Object.entries(scenario.cast).find(([, c]) => c.style === 'gm')?.[0];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type LogInput = DistributiveOmit<LogEntry, 'at' | 'playMs'>;

const IDLE_CAP_MS = 3 * 60 * 1000;
const MAX_HOPS = 64;
const SAID_KEEP = 12;
const QUIP_GAP = 3;
const HINT_AFTER = 2;
const NUDGE_AFTER = 1;
const QUIT_BEAT = 'e_quit';
const LUCK_TARGET = 7;
const LUCK_YES = /^\s*(응|네|어|그래|쓴다|쓸게|쓸래|바꿔|바꿀게)/u;
const LUCK_NO = /^\s*(아니|안 써|안 쓴다|안 쓸|됐어|괜찮아)/u;
const YES = /^\s*(응|어|네|예|그래|해|할게|한다|할래|갈래|간다|ㅇㅇ|진행|그래도)/u;
const LOST = /(이거 맞|이게 맞|맞아\s*[?？]|맞나\s*[?？]|뭐 해야|뭘 해야|뭐해야|뭘해야|뭐 하지|뭘 하지|어떻게 해야|어떡해|어떡하지|모르겠)/u;
const ARGUED_CHARS = 12;
const PERSUADE = /설득|호소|부탁|달래|애원|미인계|결백/u;
const VAGUE = /^\s*(설득|부탁|호소|애원|사정|변명)(을|이라도)?\s*(한다|해|해요|할게|하기|해 본다|해본다)?[.!…]*\s*$/u;
const TALK_QUOTABLE = /^[가-힣 ,.!?…~]{4,16}$/u;
/** "여기 물 있어?", "지도를 볼 수 있어?" 처럼 있는지, 해도 되는지 묻는 입력. */
export const isPermission = (text: string): boolean => /(있어|있나|있나요|있을까|있을까요|있니|있습니까|있어요|돼|되나|되나요|될까|될까요|되니|괜찮아|괜찮을까|괜찮을까요)\s*[?？]+\s*$/u.test(text);
const RECENT_LINES = 8;
export const MAX_INPUT_CHARS = 200;

export class Engine {
  constructor(
    readonly scenario: Scenario,
    private readonly gm: GmPort,
    private readonly clock: () => number = Date.now,
    /** 실패 직후 행운을 물을지. 끄면 그냥 실패로 잇는다. */
    private readonly luckPrompt: boolean = false,
  ) {}

  newGame(seed: number, session: string): { state: GameState; step: Step } {
    const now = this.clock();
    const sheet = this.scenario.sheet;
    const state: GameState = {
      v: 1,
      scenario: this.scenario.id,
      session,
      seed: seed >>> 0,
      rng: seed >>> 0,
      beat: this.scenario.start,
      tracks: { ...sheet.tracks },
      abilities: { ...sheet.abilities },
      items: sheet.items.map((i) => i.id),
      flags: {},
      free: null,
      recent: [],
      ending: null,
      startedAt: now,
      playMs: 0,
      lastActiveAt: now,
      log: [],
    };
    this.record(state, { kind: 'start', seed: state.seed });
    const events: GameEvent[] = [];
    this.enter(state, this.scenario.start, events, 0);
    return { state, step: this.step(state, events) };
  }

  resume(state: GameState): Step {
    const beat = this.beatOf(state);
    const events: GameEvent[] = [this.sceneEvent(state, beat), ...beat.lines.map((l) => this.lineEvent(l, 'script'))];
    if (state.ending && beat.ending) events.push(this.endingEvent(beat));
    if (beat.free && state.free) this.gm.prepare?.({ scenario: this.scenario, beat, free: beat.free, state });
    return this.step(state, events);
  }

  async act(prev: GameState, action: Action, onEvent?: (event: GameEvent) => void): Promise<{ state: GameState; step: Step }> {
    if (prev.ending && action.type !== 'interject') throw new GameError('이미 끝난 이야기입니다. 결과 화면을 확인하세요.');
    const state = structuredClone(prev);
    this.tick(state);
    const beat = this.beatOf(state);
    const events: GameEvent[] = [];
    if (onEvent) {
      events.push = (...items) => {
        items.forEach(onEvent);
        return Array.prototype.push.apply(events, items);
      };
    }
    switch (action.type) {
      case 'choose':
        this.choose(state, beat, action.id, events);
        break;
      case 'approach':
        await this.approachButton(state, beat, action.id, events);
        break;
      case 'luck':
        await this.answerLuck(state, action.use, events);
        break;
      case 'free':
        if (state.pendingLuck) {
          // 묻는 창에 입력해도 창은 그대로다. 쓴다/안 쓴다만 답으로 받고 나머지는 대화로 받는다.
          if (LUCK_YES.test(action.text)) await this.answerLuck(state, true, events);
          else if (LUCK_NO.test(action.text)) await this.answerLuck(state, false, events);
          else await this.interject(state, beat, { type: 'interject', text: action.text, scene: beat.id, shown: state.recent.slice(-RECENT_LINES), pending: [] }, events);
          break;
        }
        await this.freeInput(state, beat, action.text, events);
        break;
      case 'interject':
        await this.interject(state, beat, action, events);
        break;
    }
    this.cheer(state, events);
    return { state, step: this.step(state, events) };
  }

  noteSlot(prev: GameState, kind: 'save' | 'load', slot: string): GameState {
    const state = structuredClone(prev);
    if (kind === 'load') state.lastActiveAt = this.clock();
    else this.tick(state);
    this.record(state, { kind, slot });
    return state;
  }

  prompt(state: GameState): Prompt {
    if (state.pendingLuck) return { type: 'luck', need: state.pendingLuck.need, have: state.tracks.행운 };
    if (state.ending) return { type: 'end' };
    const beat = this.beatOf(state);
    if (beat.free && state.free) {
      const free = beat.free;
      return {
        type: 'free',
        beat: beat.id,
        placeholder: free.prompt,
        aim: free.aim ?? '',
        example: free.approaches.find((a) => a.examples.length > 0 && (a.item === undefined || state.items.includes(a.item)))?.examples[0] ?? '',
        approaches: free.approaches.map((a) => ({
          id: a.id,
          label: a.label,
          stat: a.stat,
          statValue: state.abilities[a.stat],
          locked: a.item !== undefined && !state.items.includes(a.item),
        })),
        rollsLeft: Math.max(0, free.turns - state.free.rolls),
      };
    }
    if (beat.choices) {
      return {
        type: 'choices',
        options: this.visibleChoices(state, beat).map((c) => ({
          id: c.id,
          text: c.text,
          ...(c.check ? { check: { stat: c.check.stat, statValue: state.abilities[c.check.stat], label: c.check.label } } : {}),
        })),
      };
    }
    throw new Error(`${beat.id}: 플레이어 입력을 기다리는 비트가 아닙니다`);
  }

  hud(state: GameState): Hud {
    const beat = this.beatOf(state);
    return {
      scenarioTitle: this.scenario.title,
      episode: this.scenario.episode,
      beatTitle: beat.title,
      tracks: TRACKS.map((key) => ({ key, ...TRACK_INFO[key], value: state.tracks[key] })),
      abilities: ABILITIES.map((key) => ({ key, value: state.abilities[key] })),
      items: state.items.map((id) => this.itemView(id)).filter((i) => !this.scenario.sheet.items.find((s) => s.id === i.id)?.hidden),
      notes: this.notesOf(state),
      trackGate: (this.scenario.sheet.reveal ?? []).filter((g) => state.flags[noteFlag(g.note)] !== true),
      playMs: state.playMs,
    };
  }

  private notesOf(state: GameState): NoteView[] {
    const notes: NoteView[] = (this.scenario.notes ?? []).filter((n) => noteOpen(n, state)).map((n) => ({ id: n.id, kind: n.kind, name: n.name, text: n.text }));
    for (const id of state.items) {
      const item = this.scenario.sheet.items.find((i) => i.id === id);
      if (item && !item.hidden) notes.push({ id: `item:${id}`, kind: '소지품', name: item.name, text: item.desc });
    }
    return notes;
  }

  /** 비트에 처음 들어갈 때 수첩에 적고, 처음 본 사람·장소에 대해 아시나가 알 만한 한 줄을 GM 이 덧붙인다. */
  private openNotes(state: GameState, beat: BeatSpec, events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    for (const note of this.scenario.notes ?? []) {
      if (note.tier === 'hidden' || !note.after?.includes(beat.id) || state.flags[noteFlag(note.id)] === true) continue;
      state.flags[noteFlag(note.id)] = true;
      if (note.intro && gm) this.say(state, { speaker: gm, text: note.intro }, 'script', events);
      events.push({ type: 'note', id: note.id, name: note.name });
    }
  }

  private beatOf(state: GameState): BeatSpec {
    const beat = this.scenario.beats[state.beat];
    if (!beat) throw new Error(`없는 비트: ${state.beat}`);
    return beat;
  }

  private ctx(state: GameState): CondContext {
    return { tracks: state.tracks, abilities: state.abilities, flags: state.flags, items: state.items };
  }

  private tick(state: GameState): void {
    const now = this.clock();
    state.playMs += Math.max(0, Math.min(now - state.lastActiveAt, IDLE_CAP_MS));
    state.lastActiveAt = now;
  }

  private record(state: GameState, entry: LogInput): void {
    state.log.push({ ...entry, at: this.clock(), playMs: state.playMs } as LogEntry);
  }

  private recordGm(state: GameState, beat: BeatSpec, task: GmTask, meta: GmMeta): void {
    this.record(state, { kind: 'gm', beat: beat.id, task, attempts: meta.attempts, violations: meta.violations, fallback: meta.fallback, ms: meta.ms, model: meta.model });
  }

  private step(state: GameState, events: GameEvent[]): Step {
    return { events, prompt: this.prompt(state), hud: this.hud(state) };
  }

  private enter(state: GameState, beatId: string, events: GameEvent[], hops: number): void {
    if (hops > MAX_HOPS) throw new Error(`비트 연결이 끝나지 않습니다: ${beatId}`);
    const beat = this.scenario.beats[beatId];
    if (!beat) throw new Error(`없는 비트: ${beatId}`);
    state.beat = beat.id;
    state.free = beat.free ? { beat: beat.id, talks: 0, rolls: 0 } : null;
    this.record(state, { kind: 'beat', beat: beat.id, title: beat.title });
    events.push(this.sceneEvent(state, beat));
    const onEnter: Effects = { ...beat.effects, tracks: { ...beat.effects?.tracks } };
    if (beat.time && onEnter.tracks) onEnter.tracks.귀찌 = (onEnter.tracks.귀찌 ?? 0) - beat.time;
    this.applyEffects(state, onEnter, events);
    for (const line of beat.lines) this.say(state, line, 'script', events);
    // 처음 보는 사람·장소의 한 줄은 그 장면에서 처음 보이는 순간(장면 대사) 뒤에 붙인다.
    this.openNotes(state, beat, events);
    this.sayCallback(state, beat, events);
    this.sayGuide(state, beat, events);
    if (beat.ending) {
      state.ending = beat.ending.id;
      this.record(state, { kind: 'end', ending: beat.ending.id, title: beat.ending.title });
      events.push(this.endingEvent(beat));
      return;
    }
    if (beat.free) this.gm.prepare?.({ scenario: this.scenario, beat, free: beat.free, state });
    if (beat.choices || beat.free) return;
    this.enter(state, this.route(state, beat.next, beat.id), events, hops + 1);
  }

  private route(state: GameState, next: Next | undefined, from: string): string {
    if (next === undefined) throw new Error(`${from}: 다음 비트가 없습니다`);
    if (typeof next === 'string') return next;
    const ctx = this.ctx(state);
    const hit = next.find((r) => r.if === undefined || evalCond(r.if, ctx));
    if (!hit) throw new Error(`${from}: 조건에 맞는 다음 비트가 없습니다`);
    return hit.to;
  }

  private visibleChoices(state: GameState, beat: BeatSpec): ChoiceSpec[] {
    const ctx = this.ctx(state);
    return (beat.choices ?? []).filter((c) => c.if === undefined || evalCond(c.if, ctx));
  }

  private choose(state: GameState, beat: BeatSpec, id: string, events: GameEvent[]): void {
    if (!beat.choices) throw new GameError('지금은 선택지를 고를 수 없습니다.');
    const choice = this.visibleChoices(state, beat).find((c) => c.id === id);
    if (!choice) throw new GameError(`고를 수 없는 선택지입니다: ${id}`);
    this.record(state, { kind: 'choice', beat: beat.id, choice: choice.id, text: choice.text });
    let next = choice.next ?? beat.next;
    if (choice.check && choice.outcomes) {
      const roll = this.roll(state, beat, choice.check.stat, choice.check.label, choice.check.mods, events);
      this.explainTier(state, roll, events);
      const outcome = choice.outcomes[roll.tier];
      for (const line of outcome.lines) this.say(state, line, 'script', events);
      this.applyEffects(state, outcome.effects, events);
      next = outcome.next ?? next;
    } else {
      for (const line of choice.lines ?? []) this.say(state, line, 'script', events);
      this.applyEffects(state, choice.effects, events);
    }
    this.enter(state, this.route(state, next, beat.id), events, 0);
  }

  private roll(state: GameState, beat: BeatSpec, stat: Ability, label: string, mods: Mod[] | undefined, events: GameEvent[], extra: ModApplied[] = []): RollResult {
    const ctx = this.ctx(state);
    const applied = [...(mods ?? []).filter((m) => evalCond(m.if, ctx)).map((m) => ({ label: m.label, value: m.value })), ...extra];
    const { roll, rng } = roll2d6(state.rng, label, stat, state.abilities[stat], applied);
    state.rng = rng;
    this.record(state, { kind: 'check', beat: beat.id, roll });
    events.push({ type: 'roll', ...roll, tierLabel: TIER_LABEL[roll.tier] });
    return roll;
  }

  /** 규칙은 먼저 설명하지 않는다. 등급이 처음 나온 직후에 그 숫자로 한 줄만 말한다. */
  private explainTier(state: GameState, roll: RollResult, events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    const flag = `설명_${roll.tier}`;
    if (!gm || state.flags[flag] === true) return;
    const sum = `${roll.dice[0]}+${roll.dice[1]}에 ${roll.stat} ${roll.statValue >= 0 ? '+' : ''}${roll.statValue}${roll.mods.length ? ', 보정까지' : ''}, 합 ${roll.total}.`;
    const meaning = roll.tier === 'hit' ? '10 이상이면 원하는 대로 돼.' : roll.tier === 'mixed' ? '7~9는 해내지만 대가가 붙어.' : '6 이하는 실패야. 그래도 이야기는 이어져.';
    state.flags[flag] = true;
    this.say(state, { speaker: gm, text: `${sum} ${meaning}` }, 'script', events);
  }

  private approachOf(free: FreeSpec, id: string): ApproachSpec {
    const approach = free.approaches.find((a) => a.id === id);
    if (!approach) throw new Error(`없는 접근: ${id}`);
    return approach;
  }

  private async freeInput(state: GameState, beat: BeatSpec, raw: string, events: GameEvent[]): Promise<void> {
    const free = beat.free;
    const progress = state.free;
    if (!free || !progress) throw new GameError('지금은 자유 입력을 받을 수 없습니다.');
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT_CHARS);
    if (!text) throw new GameError('행동이나 대사를 입력해 주세요.');
    events.push({ type: 'echo', text });
    const confirmed = this.confirmRisk(state, beat, text, events);
    if (confirmed === 'asked' || confirmed === 'quit') return;
    if (confirmed) return this.freeInputText(state, beat, free, confirmed, events);
    if (this.reassure(state, beat, free, text, events)) return;
    await this.freeInputText(state, beat, free, text, events);
  }

  private async freeInputText(state: GameState, beat: BeatSpec, free: FreeSpec, text: string, events: GameEvent[]): Promise<void> {
    const progress = state.free;
    if (!progress) throw new GameError('지금은 자유 입력을 받을 수 없습니다.');
    this.noteSaid(state, text);
    const ctx: GmContext = { scenario: this.scenario, beat, free, state, text };
    if (isPermission(text) && gmSpeakerOf(this.scenario)) {
      await this.answerPermission(state, beat, ctx, text, events);
      this.hintIfStuck(state, beat, free, events);
      return;
    }
    const reading = await this.gm.interpret(ctx);
    this.recordGm(state, beat, 'interpret', reading.meta);
    const read: Interpretation = reading.kind === 'ask' && !gmSpeakerOf(this.scenario) ? { kind: 'talk', source: reading.source, meta: reading.meta } : reading;

    if (read.kind === 'ask') {
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'ask', approach: null, item: null, source: read.source });
      const reply = await this.gm.explain(ctx);
      this.recordGm(state, beat, 'explain', reply.meta);
      for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
      return;
    }

    if (read.kind === 'talk') {
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'talk', approach: null, item: null, source: read.source });
      state.flags['말함'] = true;
      this.noteTalked(state, text);
      if (read.tone === 'deflect') await this.quip(state, beat, ctx, events);
      const key = text.replace(/[\s.,!?…~]/g, '');
      const repeated = key === progress.lastInput;
      progress.lastInput = key;
      progress.talks += repeated ? 2 : 1;
      const tone: TalkTone = read.tone === 'deflect' ? 'deflect' : repeated ? 'repeat' : 'plain';
      const reply = await this.gm.talk({ ...ctx, tone });
      this.recordGm(state, beat, 'talk', reply.meta);
      for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
      this.hintIfStuck(state, beat, free, events);
      if (progress.talks < free.patience) return;
      const press = free.press[progress.talks % free.press.length];
      if (press) this.say(state, press, 'script', events);
      if (progress.talks > free.patience) await this.resolve(state, beat, free, this.approachOf(free, free.default_approach), null, events);
      return;
    }
    await this.applyReading(state, beat, free, read, text, events);
  }

  /** 입력을 쌓아 두고, 그 말로 갈래가 나뉘는 플래그(길을 물었다, 미소녀라고 했다)를 세운다. 새로 세운 플래그를 돌려준다. */
  private noteSaid(state: GameState, text: string): string[] {
    state.said = [...(state.said ?? []), text].slice(-SAID_KEEP);
    const plain = text.replace(/\s+/g, '');
    const newly: string[] = [];
    for (const spec of this.scenario.callbacks ?? []) {
      if (spec.words?.some((w) => plain.includes(w.replace(/\s+/g, '')))) state.flags[spec.flag] = true;
    }
    for (const beat of Object.values(this.scenario.beats)) {
      for (const approach of beat.free?.approaches ?? []) {
        const said = approach.said;
        if (!said?.words.some((w) => plain.includes(w.replace(/\s+/g, '')))) continue;
        for (const flag of [said.flag, `이미_${said.flag}`]) {
          if (state.flags[flag] !== true) newly.push(flag);
          state.flags[flag] = true;
        }
      }
    }
    return newly;
  }

  /** 대사 도중 끼어든 입력. 이야기 자리는 그대로 두고 답한 뒤, 뒤의 고정 줄 가운데 이 입력으로 어긋나게 된 줄을 뺀다. */
  private async interject(state: GameState, stateBeat: BeatSpec, action: Extract<Action, { type: 'interject' }>, events: GameEvent[]): Promise<void> {
    const text = action.text.replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT_CHARS);
    if (!text) throw new GameError('행동이나 대사를 입력해 주세요.');
    const scene = (action.scene && this.scenario.beats[action.scene]) || stateBeat;
    // 화면이 서버보다 뒤에 있을 수 있다. 보이는 장면의 설정을 먼저 쓴다.
    const free = scene.free ?? stateBeat.free ?? this.lastFree(state);
    if (!free) throw new GameError('지금은 말할 수 없습니다.');
    events.push({ type: 'echo', text });
    const risk = this.confirmRisk(state, scene, text, events);
    if (risk === 'quit' || risk === 'asked') {
      if (risk === 'quit') events.push({ type: 'revise', drop: action.pending.map((p) => p.i), jump: true });
      return;
    }
    if (risk === null && stateBeat.free && this.reassure(state, scene, free, text, events)) return;
    const newly = this.noteSaid(state, text);
    const onStage = new Set<string>(Object.values(scene.cast ?? {}).filter((c): c is string => typeof c === 'string'));
    const speakers = free.speakers.filter((s) => this.scenario.cast[s]?.style !== 'speech' || onStage.has(s));
    const shownState: GameState = { ...state, recent: action.shown.slice(-RECENT_LINES) };
    const ctx: GmContext = { scenario: this.scenario, beat: scene, free: { ...free, speakers, situation: scene.situation ?? free.situation, forbid: [...free.forbid, ...(scene.forbid ?? [])] }, state: shownState, text, interject: { upcoming: action.pending.map((p) => p.text), action: false } };
    const reading = await this.gm.interpret(ctx);
    this.recordGm(state, scene, 'interpret', reading.meta);
    const read: Interpretation = reading.kind === 'ask' && !gmSpeakerOf(this.scenario) ? { kind: 'talk', source: reading.source, meta: reading.meta } : reading;
    const big = read.kind === 'approach' || read.kind === 'improv';
    const permission = isPermission(text) && gmSpeakerOf(this.scenario) !== undefined;

    // 지금 보이는 장면에 판정이 있으면 남은 줄을 건너뛰고 바로 그 판정으로 간다.
    if (permission) {
      this.revisePending(state, action.pending, newly, events);
      await this.answerPermission(state, scene, ctx, text, events);
      return;
    }
    if (big && !state.pendingLuck && !state.ending && stateBeat.free && state.free && scene.id === stateBeat.id) {
      events.push({ type: 'revise', drop: action.pending.map((p) => p.i), jump: true });
      await this.applyReading(state, stateBeat, stateBeat.free, read, text, events);
      return;
    }

    if (read.kind === 'ask') {
      this.record(state, { kind: 'input', beat: scene.id, text, result: 'ask', approach: null, item: null, source: read.source });
      this.revisePending(state, action.pending, newly, events);
      const reply = await this.gm.explain(ctx);
      this.recordGm(state, scene, 'explain', reply.meta);
      for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
      return;
    }

    this.record(state, { kind: 'input', beat: scene.id, text, result: 'talk', approach: null, item: null, source: read.source });
    if (!big && state.flags['말함'] !== true) {
      state.flags['말함'] = true;
      newly.push('말함');
    }
    this.revisePending(state, action.pending, newly, events);
    if (!big) this.noteTalked(state, text);
    if (big || (read.kind === 'talk' && read.tone === 'deflect')) await this.quip(state, scene, ctx, events);
    const said = state.said ?? [];
    const repeated = said.length >= 2 && said.at(-2)?.replace(/[\s.,!?…~]/g, '') === text.replace(/[\s.,!?…~]/g, '');
    const reply = await this.gm.talk({ ...ctx, tone: repeated ? 'repeat' : 'plain', interject: { upcoming: ctx.interject?.upcoming ?? [], action: big } });
    this.recordGm(state, scene, 'talk', reply.meta);
    for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
    const tries = state.log.filter((e) => e.kind === 'input' && e.beat === scene.id && e.result === 'talk').length;
    const press = free.press[tries % free.press.length];
    if (tries >= free.patience && press && speakers.includes(press.speaker)) this.say(state, press, 'script', events);
  }

  private async answerPermission(state: GameState, beat: BeatSpec, ctx: GmContext, text: string, events: GameEvent[]): Promise<void> {
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'ask', approach: null, item: null, source: 'rule' });
    const reply = await this.gm.explain({ ...ctx, permission: true });
    this.recordGm(state, beat, 'explain', reply.meta);
    for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
  }

  /** 여우 한마디. 연달아 나오면 질리므로 입력 QUIP_GAP 번에 한 번까지만 한다. */
  private async quip(state: GameState, beat: BeatSpec, ctx: GmContext, events: GameEvent[]): Promise<void> {
    if (!this.gm.quip) return;
    const count = state.said?.length ?? 0;
    if (state.quipAt !== undefined && count - state.quipAt < QUIP_GAP) return;
    const reply = await this.gm.quip(ctx);
    this.recordGm(state, beat, 'talk', reply.meta);
    if (reply.meta.fallback || !reply.lines.length) return;
    state.quipAt = count;
    for (const line of reply.lines) this.say(state, { ...line, face: 'smile' }, 'gm', events);
  }

  /** 같은 자리에서 말만 거듭하면 여우가 할 수 있는 것을 한 줄로 알려 준다. 장면마다 한 번. */
  private hintIfStuck(state: GameState, beat: BeatSpec, free: FreeSpec, events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    const progress = state.free;
    const asks = state.log.filter((e) => e.kind === 'input' && e.beat === beat.id && (e.result === 'talk' || e.result === 'ask')).length;
    if (!gm || !progress) return;
    if (progress.hinted && !progress.nudged && asks >= HINT_AFTER + NUDGE_AFTER && free.nudge?.length) {
      // 힌트를 줘도 그 자리면 사건으로 민다.
      progress.nudged = true;
      for (const line of free.nudge) this.say(state, line, 'script', events);
      this.applyEffects(state, { tracks: { 귀찌: -1 } }, events);
      return;
    }
    if (progress.hinted || asks < HINT_AFTER) return;
    progress.hinted = true;
    this.say(state, { speaker: gm, text: this.movesLine(state, free) }, 'script', events);
  }

  /** 크게 틀어질 입력은 한 번 묻는다. 답을 받으면 원래 입력을 돌려준다. */
  private confirmRisk(state: GameState, beat: BeatSpec, text: string, events: GameEvent[]): string | 'asked' | 'quit' | null {
    const gm = gmSpeakerOf(this.scenario);
    if (!gm) return null;
    const pending = state.pendingRisk;
    delete state.pendingRisk;
    if (pending && YES.test(text)) {
      if (pending.quit) {
        this.enter(state, QUIT_BEAT, events, 0);
        return 'quit';
      }
      return pending.text;
    }
    const plain = text.replace(/\s+/g, '');
    const onStage = new Set<unknown>(Object.values(beat.cast ?? {}));
    const spec = (this.scenario.risky ?? []).find((r) => (r.with === undefined || onStage.has(r.with)) && r.words.some((w) => plain.includes(w.replace(/\s+/g, ''))));
    if (!spec) return null;
    const flag = `경고_${spec.warn.slice(0, 12)}`;
    if (state.flags[flag] === true && !spec.quit) return null;
    state.flags[flag] = true;
    state.pendingRisk = { text, quit: spec.quit === true };
    this.say(state, { speaker: gm, text: spec.warn }, 'script', events);
    return 'asked';
  }

  /** "이거 맞아?", "뭐 해야 돼?" 에는 안심 한 줄과 지금 할 수 있는 것을 준다. */
  private reassure(state: GameState, beat: BeatSpec, free: FreeSpec, text: string, events: GameEvent[]): boolean {
    const gm = gmSpeakerOf(this.scenario);
    if (!gm || !LOST.test(text)) return false;
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'ask', approach: null, item: null, source: 'rule' });
    this.say(state, { speaker: gm, text: `잘 가고 있어. ${this.movesLine(state, free)}` }, 'script', events);
    if (state.free) state.free.hinted = true;
    return true;
  }

  private movesLine(state: GameState, free: FreeSpec): string {
    const moves = free.approaches.filter((a) => a.item === undefined || state.items.includes(a.item)).slice(0, 2).map((a) => `"${a.label}"`);
    return `${free.aim ?? free.goal} ${moves.join(', ')} 같은 수가 있어.`;
  }

  /** 여우가 짚어 둔 것을 입력에 쓰면 보정을 주고 칭찬한다. */
  private remembered(state: GameState, beat: BeatSpec, text: string, events: GameEvent[]): ModApplied[] {
    const gm = gmSpeakerOf(this.scenario);
    const plain = text.replace(/\s+/g, '');
    const hit = (this.scenario.foreshadow ?? []).find((f) => state.flags[`짚음_${f.id}`] === true && state.flags[`씀_${f.id}`] !== true && f.beats.includes(beat.id) && f.words.some((w) => plain.includes(w)));
    if (!hit && gm && this.scenario.council?.includes(beat.id) && state.flags['작전_회의'] === true && state.flags['계획_씀'] !== true) {
      const names = [...this.scenario.sheet.items.filter((i) => !i.hidden && state.items.includes(i.id)).map((i) => i.name), ...this.notesOf(state).filter((n) => n.kind !== '소지품').map((n) => n.name)];
      const used = names.some((n) => plain.includes(n.split(' ').at(-1) ?? n)) || (state.talked !== undefined && plain.includes(state.talked.replace(/\s+/g, '')));
      if (used) {
        state.flags['계획_씀'] = true;
        this.say(state, { speaker: gm, text: '가진 걸 제대로 쓰네. 보정 +1이야.' }, 'script', events);
        return [{ label: '계획', value: 1 }];
      }
    }
    if (!hit || !gm) return [];
    state.flags[`씀_${hit.id}`] = true;
    this.say(state, { speaker: gm, text: '그걸 기억하고 있었네! 보정 +1이야.' }, 'script', events);
    return [{ label: '기억해 둔 것', value: 1 }];
  }

  /** 처음 두 번의 실패는 여우가 편을 들고, 연속 실패에는 안심과 할 일을 한 줄씩 준다. */
  private cheer(state: GameState, events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    if (!gm || state.ending || state.pendingLuck) return;
    const checks = state.log.flatMap((e) => (e.kind === 'check' ? [e.roll.tier] : []));
    if (checks.length === 0 || (state.comfortAt ?? 0) >= checks.length) return;
    state.comfortAt = checks.length;
    const beat = this.beatOf(state);
    if (checks.at(-1) === 'miss' && checks.at(-2) === 'miss' && beat.free) {
      this.say(state, { speaker: gm, text: `두 번 연속이면 주사위 탓이야. ${this.movesLine(state, beat.free)}` }, 'script', events);
    }
  }

  private noteTalked(state: GameState, text: string): void {
    if (TALK_QUOTABLE.test(text)) state.talked = text;
  }

  /** 장면에 들어갈 때 놓친 단서나 플레이어가 지어낸 말을 인물이 한 번 되받는다. 장면마다 한 줄까지만. */
  private sayCallback(state: GameState, beat: BeatSpec, events: GameEvent[]): void {
    const speakers = new Set(Object.values(beat.cast ?? {}));
    for (const spec of this.scenario.callbacks ?? []) {
      const used = `되받음_${spec.flag}`;
      if (!spec.after.includes(beat.id) || state.flags[used] === true || !speakers.has(spec.line.speaker)) continue;
      const talked = spec.flag === '아무말' ? state.talked : undefined;
      if (spec.flag === '아무말' ? !talked : state.flags[spec.flag] !== true) continue;
      state.flags[used] = true;
      this.say(state, { ...spec.line, text: spec.line.text.replace('{said}', talked ?? '') }, 'script', events);
      return;
    }
  }

  /** 첫 입력 직전의 안내와, 여우가 짚어 두는 것. */
  private sayGuide(state: GameState, beat: BeatSpec, events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    if (!gm) return;
    for (const f of this.scenario.foreshadow ?? []) {
      if (f.at !== beat.id || state.flags[`짚음_${f.id}`] === true) continue;
      state.flags[`짚음_${f.id}`] = true;
      this.say(state, { speaker: gm, text: f.say }, 'script', events);
    }
    if (beat.free && this.scenario.council?.includes(beat.id) && state.flags['작전_회의'] !== true) {
      state.flags['작전_회의'] = true;
      const items = this.scenario.sheet.items.filter((i) => !i.hidden && state.items.includes(i.id)).map((i) => i.name);
      const known = this.notesOf(state).filter((n) => n.kind !== '소지품').slice(-3).map((n) => n.name);
      const parts = [`가진 것: ${items.join(', ') || '없음'}`, ...(known.length ? [`알아낸 것: ${known.join(', ')}`] : []), ...(state.talked ? [`네가 한 말: "${state.talked}"`] : [])];
      this.say(state, { speaker: gm, text: parts.join(' / ') }, 'script', events);
      this.say(state, { speaker: gm, text: '이걸 쓸 계획이 있으면 적어 봐. 그냥 움직여도 돼.' }, 'script', events);
    }
    if (beat.free && state.flags['안내_입력'] !== true) {
      state.flags['안내_입력'] = true;
      this.say(state, { speaker: gm, text: '아시나 말투로 적어도 되고, 행동으로 적어도 돼.' }, 'script', events);
    }
  }

  private lastFree(state: GameState): FreeSpec | undefined {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const entry = state.log[i];
      const free = entry?.kind === 'beat' ? this.scenario.beats[entry.beat]?.free : undefined;
      if (free) return free;
    }
    return Object.values(this.scenario.beats).find((b) => b.free)?.free;
  }

  /** 이번 입력으로 세운 플래그 때문에 조건이 깨진 뒤쪽 고정 줄만 뺀다. 원래부터 조건이 다른 줄은 건드리지 않는다. */
  private revisePending(state: GameState, pending: readonly PendingLine[], newly: readonly string[], events: GameEvent[]): void {
    if (!newly.length) return;
    const now = this.ctx(state);
    const flags = { ...state.flags };
    for (const flag of newly) delete flags[flag];
    const before = { ...now, flags };
    const drop = pending.filter((p) => p.if !== undefined && !evalCond(p.if, now) && evalCond(p.if, before)).map((p) => p.i);
    if (drop.length) events.push({ type: 'revise', drop, jump: false });
  }

  private async applyReading(state: GameState, beat: BeatSpec, free: FreeSpec, read: Interpretation, text: string, events: GameEvent[]): Promise<void> {
    if (read.kind === 'ask' || read.kind === 'talk') return;
    if (read.kind === 'improv') {
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'improv', approach: null, item: null, source: read.source });
      await this.quip(state, beat, { scenario: this.scenario, beat, free, state, text }, events);
      const spec = this.improvSpec(free, improvLabel(text), read.stat);
      const extra = [...(read.difficulty === 0 ? [] : [{ label: read.difficulty > 0 ? '쉬운 행동' : '어려운 행동', value: read.difficulty }]), ...this.remembered(state, beat, text, events)];
      await this.resolve(state, beat, free, spec, text, events, extra, { absurd: read.absurd });
      return;
    }

    let approach = this.approachOf(free, read.approach);
    if (approach.item !== undefined && !state.items.includes(approach.item)) approach = this.approachOf(free, free.default_approach);
    const item = read.item !== null && state.items.includes(read.item) ? read.item : null;
    const persuade = approach.stat === '매력' || PERSUADE.test(`${approach.label} ${approach.hint}`);
    const gmName = gmSpeakerOf(this.scenario);
    if (persuade && gmName && state.free && !state.free.asked && VAGUE.test(text)) {
      // 뜻이 약한 설득은 판정 전에 한 번만 무슨 말인지 묻는다.
      state.free.asked = true;
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'talk', approach: approach.id, item, source: read.source });
      this.say(state, { speaker: gmName, text: '뭐라고 말할 건데?' }, 'script', events);
      return;
    }
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'approach', approach: approach.id, item, source: read.source });
    const argued = persuade && [...text.replace(/\s+/g, '')].length >= ARGUED_CHARS;
    const remembered = this.remembered(state, beat, text, events);
    const extra: ModApplied[] = [...(argued ? [{ label: '입력한 말', value: 1 }] : []), ...remembered];
    if (extra.length) {
      await this.resolve(state, beat, free, approach, text, events, extra);
      return;
    }
    await this.resolve(state, beat, free, approach, text, events);
  }

  private async approachButton(state: GameState, beat: BeatSpec, id: string, events: GameEvent[]): Promise<void> {
    const free = beat.free;
    if (!free || !state.free) throw new GameError('지금은 행동을 고를 수 없습니다.');
    const approach = free.approaches.find((a) => a.id === id);
    if (!approach) throw new GameError(`없는 행동입니다: ${id}`);
    if (approach.item !== undefined && !state.items.includes(approach.item)) throw new GameError('그 행동에 필요한 소지품이 없습니다.');
    this.record(state, { kind: 'choice', beat: beat.id, choice: `approach:${approach.id}`, text: approach.label });
    await this.resolve(state, beat, free, approach, null, events);
  }

  private async resolve(state: GameState, beat: BeatSpec, free: FreeSpec, approach: ApproachSpec, text: string | null, events: GameEvent[], extra: ModApplied[] = [], improv?: { absurd: boolean }): Promise<void> {
    const roll = this.roll(state, beat, approach.stat, approach.label, approach.mods, events, extra);
    this.applyEffects(state, approach.before, events);
    this.explainTier(state, roll, events);
    if (roll.tier === 'miss' && this.askLuck(state, beat, approach, text, roll, events, improv)) return;
    await this.finishResolve(state, beat, free, approach, text, roll, events, improv);
  }

  /** 실패 직후 행운을 쓸지 묻는다. 모자라면 그렇다고만 말하고 넘어간다. */
  private askLuck(state: GameState, beat: BeatSpec, approach: ApproachSpec, text: string | null, roll: RollResult, events: GameEvent[], improv?: { absurd: boolean }): boolean {
    const gm = gmSpeakerOf(this.scenario);
    const have = state.tracks.행운;
    if (!this.luckPrompt || !gm || have <= 0) return false;
    const need = LUCK_TARGET - roll.total;
    if (need > have) {
      this.say(state, { speaker: gm, text: `행운이 ${need - have} 모자라.` }, 'script', events);
      return false;
    }
    state.pendingLuck = { beat: beat.id, approach: approach.id, label: approach.label, stat: approach.stat, text, need, ...(improv ? { improv } : {}) };
    const first = state.flags['설명_행운'] !== true;
    state.flags['설명_행운'] = true;
    const ask = `행운 ${need}로 성공으로 바꿀까? 대가는 붙어.`;
    this.say(state, { speaker: gm, text: first ? `남은 행운 ${have}. 모자란 ${need}만큼 메울 수 있어. ${ask}` : ask }, 'script', events);
    return true;
  }

  private async answerLuck(state: GameState, use: boolean, events: GameEvent[]): Promise<void> {
    const pending = state.pendingLuck;
    if (!pending) throw new GameError('지금은 행운을 쓸 수 없습니다.');
    delete state.pendingLuck;
    const beat = this.scenario.beats[pending.beat];
    const free = beat?.free;
    if (!beat || !free) throw new Error(`없는 비트: ${pending.beat}`);
    const approach = free.approaches.find((a) => a.id === pending.approach) ?? this.improvSpec(free, pending.label, pending.stat);
    const check = [...state.log].reverse().find((e) => e.kind === 'check');
    if (check?.kind !== 'check') throw new Error('판정 기록이 없습니다');
    if (use) {
      check.roll = { ...check.roll, total: LUCK_TARGET, tier: 'mixed' };
      this.applyEffects(state, { tracks: { 행운: -pending.need } }, events);
      const gm = gmSpeakerOf(this.scenario);
      if (gm) this.say(state, { speaker: gm, text: `행운 ${pending.need}를 썼어. 남은 건 ${state.tracks.행운}.` }, 'script', events);
    }
    await this.finishResolve(state, beat, free, approach, pending.text, check.roll, events, pending.improv);
  }

  private improvSpec(free: FreeSpec, label: string, stat: Ability): ApproachSpec {
    // 즉흥 행동은 어느 행동도 아니므로, 이 장면 행동들이 전제하는 낱말(피했다 등)을 입력 없이 쓸 수 없다.
    const presume = free.approaches.flatMap((a) => a.presume ?? []);
    return { id: 'improv', label, stat, hint: '', examples: [], keywords: [], outcomes: free.improv, ...(presume.length ? { presume } : {}) };
  }

  private async finishResolve(state: GameState, beat: BeatSpec, free: FreeSpec, approach: ApproachSpec, text: string | null, roll: RollResult, events: GameEvent[], improv?: { absurd: boolean }): Promise<void> {
    const outcome = approach.outcomes[roll.tier];
    if (approach.said && (text === null || approach.said.words.some((w) => text.replace(/\s+/g, '').includes(w.replace(/\s+/g, ''))))) state.flags[approach.said.flag] = true;
    if (text === null) {
      for (const line of outcome.lines) this.say(state, line, 'script', events);
    } else {
      const reply = await this.gm.narrate({ scenario: this.scenario, beat, free, state, text, approach, roll, outcome, ...(improv ? { improv } : {}) });
      this.recordGm(state, beat, 'narrate', reply.meta);
      const cg = reply.meta.fallback ? undefined : outcome.lines.find((l) => l.cg)?.cg;
      for (const line of reply.lines) this.say(state, cg ? { ...line, cg } : line, reply.meta.fallback ? 'script' : 'gm', events);
    }
    this.applyEffects(state, outcome.effects, events);
    // 처음 두 번의 실패는 결과 바로 뒤에서 여우가 편을 든다.
    const gmName = gmSpeakerOf(this.scenario);
    if (roll.tier === 'miss' && gmName) {
      const misses = state.log.filter((e) => e.kind === 'check' && e.roll.tier === 'miss').length;
      if (misses <= 2) this.say(state, { speaker: gmName, text: misses === 1 ? '괜찮아, 이런 판이 더 기억에 남아.' : '이번 건 주사위가 나빴어. 네 편이야.' }, 'script', events);
    }
    const progress = state.free;
    if (!progress) throw new Error(`${beat.id}: 자유 입력 진행 상태가 없습니다`);
    progress.rolls += 1;
    if (outcome.next !== undefined) {
      this.enter(state, this.route(state, outcome.next, beat.id), events, 0);
      return;
    }
    const finished = progress.rolls >= free.turns || (free.until !== undefined && evalCond(free.until, this.ctx(state)));
    if (finished) this.enter(state, this.route(state, free.next ?? beat.next, beat.id), events, 0);
  }

  private applyEffects(state: GameState, effects: Effects | undefined, events: GameEvent[]): void {
    if (!effects) return;
    const spritesBefore = this.spritesOf(state);
    const changes: TrackChange[] = [];
    for (const key of TRACKS) {
      const delta = effects.tracks?.[key];
      if (!delta) continue;
      const from = state.tracks[key];
      const to = Math.max(0, Math.min(TRACK_INFO[key].max, from + delta));
      if (to !== from) {
        state.tracks[key] = to;
        changes.push({ key, from, to });
      }
    }
    Object.assign(state.flags, effects.flags ?? {});
    const earring = changes.find((c) => c.key === '귀찌');
    const gmName = gmSpeakerOf(this.scenario);
    if (earring && gmName && state.flags['설명_귀찌'] !== true) {
      state.flags['설명_귀찌'] = true;
      const narrator = Object.entries(this.scenario.cast).find(([, c]) => c.style === 'narration')?.[0];
      if (narrator) this.say(state, { speaker: narrator, text: '귀찌가 뜨겁게 달아올랐다. 변장이 버틸 시간이 줄고 있다.' }, 'script', events);
      this.say(state, { speaker: gmName, text: `귀찌 수명이 ${earring.to}로 줄었어. 3 이하면 손이 떨려서 판정에 -1이야.` }, 'script', events);
    }
    for (const [cast, sprite] of Object.entries(this.spritesOf(state))) {
      if (spritesBefore[cast] !== sprite) events.push({ type: 'sprite', cast, sprite });
    }
    const gained = (effects.gain ?? []).filter((id) => !state.items.includes(id));
    const lost = (effects.lose ?? []).filter((id) => state.items.includes(id));
    state.items = state.items.filter((id) => !lost.includes(id)).concat(gained);
    if (changes.length) {
      events.push({ type: 'tracks', changes });
      this.record(state, { kind: 'tracks', changes });
    }
    if (gained.length || lost.length) events.push({ type: 'items', gained: gained.map((id) => this.itemView(id)), lost: lost.map((id) => this.itemView(id)) });
  }

  private say(state: GameState, raw: Line, by: 'script' | 'gm', events: GameEvent[]): void {
    if (raw.if !== undefined && !evalCond(raw.if, this.ctx(state))) return;
    const alt = raw.cg ? this.scenario.cgs[raw.cg]?.alt : undefined;
    const line = alt && evalCond(alt.if, this.ctx(state)) ? { ...raw, cg: alt.id } : raw;
    events.push(this.lineEvent(line, by));
    state.recent = [...state.recent, { speaker: line.speaker, text: line.text }].slice(-RECENT_LINES);
  }

  private itemView(id: string): ItemView {
    const item = this.scenario.sheet.items.find((i) => i.id === id);
    return { id, name: item?.name ?? id, desc: item?.desc ?? '' };
  }

  private spritesOf(state: GameState): Record<string, string> {
    const ctx = this.ctx(state);
    const out: Record<string, string> = {};
    for (const [key, cast] of Object.entries(this.scenario.cast)) {
      if (cast.sprite_alt && evalCond(cast.sprite_alt.if, ctx)) out[key] = cast.sprite_alt.sprite;
    }
    return out;
  }

  private sceneEvent(state: GameState, beat: BeatSpec): GameEvent {
    return {
      type: 'scene',
      beat: beat.id,
      title: beat.title,
      bg: beat.bg ?? null,
      cast: { left: beat.cast?.left ?? null, center: beat.cast?.center ?? null, right: beat.cast?.right ?? null },
      sprites: this.spritesOf(state),
    };
  }

  private lineEvent(line: Line, by: 'script' | 'gm'): GameEvent {
    const cast = this.scenario.cast[line.speaker];
    return {
      type: 'line',
      speaker: line.speaker,
      display: cast?.display ?? line.speaker,
      style: cast?.style ?? 'speech',
      text: line.text,
      by,
      ...(line.if !== undefined ? { if: line.if } : {}),
      ...(line.fx ? { fx: line.fx } : {}),
      ...(line.sfx ? { sfx: line.sfx } : {}),
      ...(line.face ? { face: line.face } : {}),
      ...(line.cg ? { cg: line.cg } : {}),
    };
  }

  private endingEvent(beat: BeatSpec): GameEvent {
    const e = beat.ending;
    if (!e) throw new Error(`${beat.id}: 결말 비트가 아닙니다`);
    return { type: 'ending', id: e.id, title: e.title, summary: e.summary, nextHook: e.next_hook };
  }
}
