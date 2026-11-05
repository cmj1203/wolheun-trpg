import { evalCond, holdBefore, type CondContext } from './conditions.ts';
import { nextU32, roll2d6, seedFrom } from './dice.ts';
import { edgesOf } from './scenario.ts';
import { drawPrice, onceFlag, priceCandidates } from './prices.ts';
import { isActionText, isNoise, isQuestionText, normalizeKo, preemptedBy, splitMixed } from './text.ts';
import {
  ABILITIES,
  GameError,
  TIERS,
  TIER_LABEL,
  TRACKS,
  TENSION_MAX,
  TENSION_MIN,
  TENSION_START,
  TRACK_INFO,
  WORLD_MOVES,
  type Ability,
  type Action,
  type ApproachSpec,
  type BeatSpec,
  type ChoiceSpec,
  type Effects,
  type FactSpec,
  type FateSpec,
  type FreeSpec,
  type GameEvent,
  type GameState,
  type GmTask,
  type Hud,
  type ImprovMark,
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
  type PriceSpec,
  type PriceTag,
  type WorldMove,
  type Prompt,
  type RollResult,
  type Scenario,
  type Step,
  type Tier,
  type Track,
  type TrackChange,
  trackView,
  type TwistResult,
  type TwistSpec,
} from './types.ts';

export interface GmMeta {
  attempts: number;
  violations: string[];
  fallback: boolean;
  ms: number;
  model: string | null;
  /** 플레이어가 직접 한 행동이라 상태가 따라가야 하는 플래그. 줄을 보여 주기 전에 켠다. */
  setFlags?: string[];
}

export type TalkTone = 'plain' | 'repeat' | 'deflect';

/** 입력이 실제로 하려는 위험한 일. attack 은 한 번 묻고, 나머지는 주사위 없이 고정 줄로 받는다. */
export type InputRisk = 'attack' | 'unmask' | 'identity';

export type Interpretation =
  /** spoken: 사람에게 건넨 말이면 true, 행동을 적은 문장이면 false. 규칙 해석은 모른다. */
  | { kind: 'approach'; approach: string; item: string | null; spoken?: boolean; risk?: InputRisk; source: 'llm' | 'rule'; meta: GmMeta }
  /** to: 사람에게 건넨 말인지 아무에게도 안 한 혼잣말인지. 규칙 해석은 모른다. */
  | { kind: 'talk'; tone?: TalkTone; to?: 'person' | 'self'; risk?: InputRisk; source: 'llm' | 'rule'; meta: GmMeta }
  /** play: 플레이 방법을 묻는 말. game: 게임 자체에 대한 말의 항목 id. about: 묻는 대상의 수첩 항목 id, 답이 없는 질문이면 ABOUT_UNKNOWN. */
  | { kind: 'ask'; play?: boolean; game?: string; about?: string; source: 'llm' | 'rule'; meta: GmMeta }
  /** odd: 상황에 뜬금없는 행동. 여우가 이때만 태클한다. */
  /** bold: 상대가 지나칠 수 없는 큰 행동(몸에 닿기, 겨누기). deed: 해석이 요약한 행동 한 문장(과거형). */
  | { kind: 'improv'; stat: Ability; difficulty: number; label: string; absurd: boolean; bold: boolean; deed?: string; odd?: boolean; risk?: InputRisk; source: 'llm' | 'rule'; meta: GmMeta };

/** 아는 것 안에 답이 없는 질문(속마음, 이유, 앞일). */
export const ABOUT_UNKNOWN = 'none';

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
  /** 질문의 대상(수첩 항목 id 또는 ABOUT_UNKNOWN). */
  about?: string;
  /** 아무에게도 건네지 않은 혼잣말이다. */
  self?: boolean;
  /** 해석이 요약한 플레이어의 행동 한 문장. 검사 면제의 기준이다. */
  deed?: string;
  /** 이 세계에 없는 물건·힘을 쓰려 한 행동. 일어나지 않고, 나레이션이 실제 동작을 그리고 상대 인물이 성격대로 받아친다. */
  absurd?: boolean;
}

export interface NarrateContext extends GmContext {
  approach: ApproachSpec;
  roll: RollResult;
  outcome: Outcome;
  /** 코드가 뽑은 대가. GM 은 text 를 서술에 녹이기만 하고 효과는 엔진이 적용한다. */
  price?: PriceSpec;
  improv?: ImprovMark;
}

/** 이야기에 넣을 수 없는 입력. unknown: 아시나가 아직 모르는 이름·사실(원작 독자만 알 수 있는 것). absent: 지금 장면에 없는 사람·물건. */
export type InputScreen = { reason: 'unknown'; term: string; who?: string } | { reason: 'absent'; term: string };

export interface GmPort {
  prepare?(ctx: Omit<GmContext, 'text'>): void;
  /** 입력이 이야기에 들어가기 전에 가린다. 걸리뮤 여우가 되돌려 보내고 판정·시간·참을성을 쓰지 않는다. */
  screen?(ctx: GmContext): InputScreen | null;
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

/** 판정 창과 결과 화면에 쓸 행동 이름. 괄호·따옴표·문장 부호를 뺀 입력 그대로이고, 길면 낱말 단위로 잘라 말줄임표를 붙인다. */
export function improvLabel(text: string): string {
  const plain = text.replace(/[()[\]{}"'“”‘’「」『』]/gu, ' ').replace(/[.!?…~,]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return '즉흥 행동';
  if ([...plain].length <= LABEL_CHARS) return plain;
  let cut = '';
  for (const word of plain.split(' ')) {
    const next = cut ? `${cut} ${word}` : word;
    if ([...next].length >= LABEL_CHARS) break;
    cut = next;
  }
  return `${cut || [...plain].slice(0, LABEL_CHARS - 1).join('')}…`;
}

/** GM 설명을 맡는 화자(cast 의 style: gm). 없으면 배경 질문도 대화로 받는다. */
export const gmSpeakerOf = (scenario: Scenario): string | undefined => Object.entries(scenario.cast).find(([, c]) => c.style === 'gm')?.[0];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type LogInput = DistributiveOmit<LogEntry, 'at' | 'playMs'>;

const LABEL_CHARS = 30;
const IDLE_CAP_MS = 3 * 60 * 1000;
const MAX_HOPS = 64;
const SAID_KEEP = 12;
/** GM 무브 ④ 시간이 감: 장면에 시간 대가가 없을 때 쓰는 줄(b02 대가 글과 같다). */
const CLOCK_FALLBACK = '해가 한 뼘 더 기울었다. 귀찌가 미지근해진다.';
const QUIT_BEAT = 'e_quit';
/** 칼 든 상대에게 맨손으로 덤빈 징조가 한 판에 한 번 나갔다. */
const DANGER_OMEN_FLAG = '징조_맨손';
/** 정체를 입 밖에 내기 전 징조가 한 판에 한 번 나갔다. */
const IDENTITY_OMEN_FLAG = '징조_정체';
const LUCK_TARGET = 7;
const LUCK_YES = /^\s*(?:(?:응|네|어|그래|써|쓴다|쓸게요?|쓸래요?|바꿔|바꿀게요?)[\s,.!…~]*)+$/u;
const LUCK_NO = /^\s*(?:(?:아니(?:요|야)?|아뇨|안 ?써|안 ?쓴다|안 ?쓸(?:게|래)?|됐어|괜찮아)[\s,.!…~]*)+$/u;
/** 경고에 하겠다고만 답한 말. "해 지는 쪽으로 간다"처럼 뒤에 할 말이 이어지면 새 입력이다. */
const YES = /^\s*(?:(?:응|어|네|예|그래|ㅇㅇ|진행|그래도|해|해요|할게요?|한다|할래요?|할 ?거야|갈래|갈게|간다|해 ?볼게|해 ?볼래|해 ?줘)[\s,.!…~]*)+$/u;
/** 경고에 안 하겠다고만 답한 말. "아니 저 잘못 없어요"처럼 뒤에 할 말이 이어지면 새 입력이다. */
const NO = /^\s*(아니(요|야)?|아뇨|ㄴㄴ|싫어|취소|됐어|안 ?해|안 ?할래|안 ?할게|그만둘래|더 ?할래|더 ?해 ?볼래)([\s,]+(안 ?해|안 ?할래|안 ?할게|됐어))?[\s.!…~]*$/u;
/** "정말 끝낼 거야?"에 끝내겠다고 답한 말. */
const QUIT_YES = /끝낼 ?(래|게|거)|끝내(줘|자|요)?\s*[.!…~]*$|그만 ?(둘|할) ?(래|게|거)/u;
/** 수첩 설명과 뒤의 고정 줄이 이만큼 이어지게 겹치면 곧 나올 얘기로 본다. */
const LOST = /(이거 맞|이게 맞|맞아\s*[?？]|맞나\s*[?？]|뭐 해야|뭘 해야|뭐해야|뭘해야|뭐 하지|뭘 하지|어떻게 해야|어떡해|어떡하지|모르겠)/u;
const ARGUED_CHARS = 12;
const PERSUADE = /설득|호소|부탁|달래|애원|미인계|결백/u;
const TALK_QUOTABLE = /^[가-힣 ,.!?…~]{4,16}$/u;
/** "여기 물 있어?", "지도를 볼 수 있어?" 처럼 있는지, 해도 되는지 묻는 입력. */
export const isPermission = (text: string): boolean => /(있어|있나|있나요|있을까|있을까요|있니|있습니까|있어요|돼|되나|되나요|될까|될까요|되니|괜찮아|괜찮을까|괜찮을까요)\s*[?？]+\s*$/u.test(text);
const RECENT_LINES = 8;
export const MAX_INPUT_CHARS = 200;
/** 원작 이름·사실을 꺼낸 플레이어에게 "웹툰 봤구나"를 이미 한 번 말했다. */
const READER_FLAG = '여우_웹툰_봤냐';

/** 받침이 있으뮤 "이", 없으뮤 "가". 한글이 아니면 "이". */
function subjectParticle(word: string): string {
  const code = word.codePointAt(word.length - 1) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return '이';
  return (code - 0xac00) % 28 === 0 ? '가' : '이';
}

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
    // 이 턴이 시작될 때 이미 경고가 나간 작은 끝. 경고가 이번 턴에 처음 나온 작은 끝은 이번 턴에 끝내지 않는다.
    const warnedBefore = new Set((this.scenario.fates ?? []).filter((f) => state.flags[`경고_${f.id}`] === true).map((f) => f.id));
    const events: GameEvent[] = [];
    if (onEvent) {
      events.push = (...items) => {
        items.forEach(onEvent);
        return Array.prototype.push.apply(events, items);
      };
    }
    // 의도 카드에 답하지 않고 다른 행동으로 넘어가면 그 카드는 끝난다. 뒤의 "응" 같은 입력이 옛 카드의 답이 되면 안 된다.
    if (state.pendingIntent && (action.type === 'choose' || action.type === 'approach' || action.type === 'interject')) {
      delete state.pendingIntent;
      this.unsay(state);
    }
    // 그만두기 확인도 같다. 답하지 않고 다른 행동으로 넘어갔으면, 뒤의 "응"이 옛 확인의 답이 되어 판을 끝내면 안 된다.
    if (state.pendingRisk && (action.type === 'choose' || action.type === 'approach' || action.type === 'luck')) delete state.pendingRisk;
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
      case 'confirm':
        await this.answerConfirm(state, beat, action.ok, events);
        break;
      case 'ask':
        await this.askGm(state, beat, action.text, events, action.scene ? this.scenario.beats[action.scene] : undefined);
        break;
    }
    this.settleFate(state, events, warnedBefore);
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
      tracks: TRACKS.map((key) => trackView(this.scenario.fates, key, state.tracks[key])),
      abilities: ABILITIES.map((key) => ({ key, value: state.abilities[key] })),
      items: state.items.map((id) => this.itemView(id)).filter((i) => !this.scenario.sheet.items.find((s) => s.id === i.id)?.hidden),
      notes: this.notesOf(state),
      trackGate: (this.scenario.sheet.reveal ?? []).filter((g) => state.flags[noteFlag(g.note)] !== true),
      tension: this.tensionOf(state),
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

  /** lines: GM 이 낸 줄(화자: 글). 사용자가 반려한 장면을 기록에서 바로 다시 보기 위해 남긴다. */
  private recordGm(state: GameState, beat: BeatSpec, task: GmTask, meta: GmMeta, lines?: readonly Line[]): void {
    this.record(state, {
      kind: 'gm',
      beat: beat.id,
      task,
      attempts: meta.attempts,
      violations: meta.violations,
      fallback: meta.fallback,
      ms: meta.ms,
      model: meta.model,
      ...(lines?.length ? { lines: lines.map((l) => `${l.speaker}: ${l.text}`) } : {}),
    });
  }

  /** 지금 조건이 참인 작은 끝. 이미 끝났으면 없다. */
  private dueFate(state: GameState): FateSpec | undefined {
    if (state.ending) return undefined;
    const ctx = this.ctx(state);
    return (this.scenario.fates ?? []).find((f) => evalCond(f.when, ctx));
  }

  /**
   * 행동 처리가 끝났을 때 작은 끝 조건이 참이면 그 비트로 간다. 행운을 묻는 동안은 답을 기다린다.
   * 불변식: 한 번의 실패로는 끝나지 않는다. 징조가 이번 턴에 처음 나온 작은 끝은 조건이 참이어도 끝내지 않고
   * 수치를 문턱 바로 위(귀찌 1·의심 9·머뭇 2)에 멈춘다. 끝은 다음 턴부터다.
   */
  private settleFate(state: GameState, events: GameEvent[], warnedBefore: ReadonlySet<string>): void {
    if (state.pendingLuck) return;
    // 효과 없는 행동(말만 한 턴 등)으로 경고선에 닿았을 때도 여기서 한 번 알린다.
    this.warnFates(state, events);
    for (let fate = this.dueFate(state); fate; fate = this.dueFate(state)) {
      if (fate.warn && !warnedBefore.has(fate.id) && this.holdAboveThreshold(state, fate)) continue;
      this.enter(state, fate.to, events, 0);
      return;
    }
  }

  /** 작은 끝 조건의 수치를 문턱 바로 위에 멈춘다. 비교식이 아니면 멈출 값이 없어 false. */
  private holdAboveThreshold(state: GameState, fate: FateSpec): boolean {
    const hold = holdBefore(fate.when);
    if (!hold) return false;
    if (hold.flag) state.flags[hold.name] = hold.value;
    else if ((TRACKS as readonly string[]).includes(hold.name)) state.tracks[hold.name as Track] = hold.value;
    else return false;
    return !evalCond(fate.when, this.ctx(state));
  }

  /**
   * 지금 상태로 길을 따라갔을 때, 플레이어가 반응할 자리(자유 입력·선택지)가 결말 전에 남아 있는가.
   * 징조(소프트 무브)는 피할 기회를 주는 것이라, 기회가 없는 길(결말 비트로만 감)에서는 내지 않는다.
   */
  private reactionAhead(state: GameState, from: string): boolean {
    let id = from;
    for (let hops = 0; hops <= MAX_HOPS; hops++) {
      const beat = this.scenario.beats[id];
      if (!beat || beat.ending) return false;
      if (beat.free || beat.choices?.length) return true;
      if (beat.next === undefined) return false;
      id = this.route(state, beat.next, beat.id);
    }
    return false;
  }

  /**
   * 작은 끝이 가까워지면 한 판에 한 번 캐릭터에게 징조가 보인다(나레이션·속마음). 징조 없이 끝나는 길은 없다.
   * heading 은 이번 턴이 끝난 뒤 있을 비트다. 그 길에 반응할 자리가 없으면 징조를 생략한다(작은 끝 자체는 그대로).
   */
  private warnFates(state: GameState, events: GameEvent[], heading = state.beat): void {
    if (state.ending) return;
    if (!this.reactionAhead(state, heading)) return;
    const ctx = this.ctx(state);
    for (const fate of this.scenario.fates ?? []) {
      const flag = `경고_${fate.id}`;
      if (!fate.warn || state.flags[flag] === true || !evalCond(fate.warn.when, ctx)) continue;
      state.flags[flag] = true;
      for (const line of fate.warn.lines) this.say(state, line, 'script', events);
    }
  }

  /** 재촉·힌트 뒤에도 그 자리라 이야기가 대신 움직인 횟수. 쏓이면 쓰러지는 작은 끝으로 간다. */
  private bumpHesitation(state: GameState, events: GameEvent[]): void {
    const v = state.flags['머뭇'];
    state.flags['머뭇'] = (typeof v === 'number' ? v : 0) + 1;
    this.warnFates(state, events);
  }

  private step(state: GameState, events: GameEvent[]): Step {
    return { events, prompt: this.prompt(state), hud: this.hud(state) };
  }

  private enter(state: GameState, beatId: string, events: GameEvent[], hops: number): void {
    if (hops > MAX_HOPS) throw new Error(`비트 연결이 끝나지 않습니다: ${beatId}`);
    let beat = this.scenario.beats[beatId];
    if (!beat) throw new Error(`없는 비트: ${beatId}`);
    // 상태가 한계에 닿았으면 다음 장면 대신 작은 끝으로 간다. 그만두기 같은 결말은 그대로 둔다.
    const fate = beat.ending ? undefined : this.dueFate(state);
    const fated = fate ? this.scenario.beats[fate.to] : undefined;
    if (fated) beat = fated;
    state.beat = beat.id;
    // 작은 끝 줄이 상대가 곁에 있는지로 갈릴 수 있게, 마지막 장면의 출연을 적어 둔다(결말 비트는 암전이라 덮어쓰지 않는다).
    if (!beat.ending && this.scenario.stage) state.flags['상대_곁'] = Object.values(beat.cast ?? {}).includes(this.scenario.stage.who);
    state.free = beat.free ? { beat: beat.id, talks: 0, rolls: 0 } : null;
    this.record(state, { kind: 'beat', beat: beat.id, title: beat.title });
    events.push(this.sceneEvent(state, beat));
    const onEnter: Effects = { ...beat.effects, tracks: { ...beat.effects?.tracks } };
    if (beat.time && onEnter.tracks) onEnter.tracks.귀찌 = (onEnter.tracks.귀찌 ?? 0) - beat.time;
    this.applyEffects(state, onEnter, events);
    // 장면 검사: 끼어드는 일은 장면 줄 앞에, 달라진 결은 장면 줄 뒤에 붙는다.
    const twist = beat.ending ? null : this.sceneCheck(state, beat, events);
    if (twist?.result === 'interrupt' && twist.spec) this.playTwist(state, twist.spec, events);
    // 플레이어가 앞 장면에서 먼저 해 버린 일을 그린 원작 줄은 되풀이하지 않는다.
    const preempted = new Set(state.preempted ?? []);
    for (const line of beat.lines) if (!preempted.has(normalizeKo(line.text))) this.say(state, line, 'script', events);
    if (twist?.result === 'altered' && twist.spec) this.playTwist(state, twist.spec, events);
    // 처음 보는 사람·장소의 한 줄은 그 장면에서 처음 보이는 순간(장면 대사) 뒤에 붙인다.
    this.openNotes(state, beat, events);
    this.sayCallback(state, beat, events);
    this.sayGuide(state, beat, events);
    if (beat.ending) {
      // 행운을 묻던 중 그만두기로 끝나면 묻던 창은 버린다. 남아 있으면 끝난 판에 행운 창이 뜬다.
      delete state.pendingLuck;
      delete state.pendingRisk;
      state.ending = beat.ending.id;
      this.record(state, { kind: 'end', ending: beat.ending.id, title: beat.ending.title });
      events.push(this.endingEvent(beat));
      return;
    }
    if (beat.free) this.gm.prepare?.({ scenario: this.scenario, beat, free: beat.free, state });
    if (beat.choices || beat.free) return;
    this.enter(state, this.route(state, beat.next, beat.id), events, hops + 1);
  }

  /** 긴장값(1~6). Mythic 카오스 팩터를 d6 에 맞춘 것. 판정 성공 -1, 실패 +1. */
  private tensionOf(state: GameState): number {
    const v = state.flags['긴장'];
    return typeof v === 'number' ? v : (this.scenario.sheet.tension ?? TENSION_START);
  }

  private bumpTension(state: GameState, tier: Tier): void {
    const delta = tier === 'hit' ? -1 : tier === 'miss' ? 1 : 0;
    if (delta === 0) return;
    state.flags['긴장'] = Math.max(TENSION_MIN, Math.min(TENSION_MAX, this.tensionOf(state) + delta));
  }

  /**
   * 장면 검사(Mythic 장면 검사를 d6 으로): 눈이 긴장값 이하면 홀수는 달라진 결(altered), 짝수는 끼어드는 일(interrupt).
   * 주사위 흐름(state.rng)은 그대로 두고 지금 값과 비트 id 로 눈을 뽑아, 시드 고정 경로가 표 유무에 흔들리지 않는다.
   * 표가 없는 장면은 검사하지 않는다(원작 대면 장면은 그대로).
   */
  private sceneCheck(state: GameState, beat: BeatSpec, events: GameEvent[]): { result: TwistResult; spec: TwistSpec | null } | null {
    if (!beat.twist) return null;
    const tension = this.tensionOf(state);
    const first = nextU32(state.rng ^ seedFrom(beat.id));
    const roll = (first.value % 6) + 1;
    const result: TwistResult = roll > tension ? 'none' : roll % 2 === 1 ? 'altered' : 'interrupt';
    const pool = result === 'altered' ? beat.twist.altered : result === 'interrupt' ? beat.twist.interrupt : [];
    const spec = pool.length ? (pool[nextU32(first.state).value % pool.length] ?? null) : null;
    this.record(state, { kind: 'twist', beat: beat.id, tension, roll, result, id: spec?.id ?? null });
    events.push({ type: 'twist', beat: beat.id, tension, roll, result, id: spec?.id ?? null });
    return { result, spec };
  }

  private playTwist(state: GameState, spec: TwistSpec, events: GameEvent[]): void {
    for (const line of spec.lines) this.say(state, line, 'script', events);
    this.applyEffects(state, spec.effects, events);
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
    this.bumpTension(state, roll.tier);
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
    const meaning = roll.tier === 'hit' ? '10 이상이면 원하는 대로 돼.' : roll.tier === 'mixed' ? '7~9는 해내지만 대가가 붙어.' : '6 이하는 실패야.';
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
    if (state.pendingIntent) {
      // 의도 카드가 떠 있는 동안 글로 답해도 받는다(자동 플레이). 다른 말을 적으면 다른 뜻으로 보고 새 입력으로 받는다.
      if (YES.test(text)) return this.answerIntent(state, beat, true, events);
      if (NO.test(text)) return this.answerIntent(state, beat, false, events);
      delete state.pendingIntent;
      this.unsay(state);
    }
    if (this.confirmQuit(state, text, events) !== null) return;
    await this.freeInputText(state, beat, free, text, events);
  }

  private async freeInputText(state: GameState, beat: BeatSpec, free: FreeSpec, whole: string, events: GameEvent[]): Promise<void> {
    const progress = state.free;
    if (!progress) throw new GameError('지금은 자유 입력을 받을 수 없습니다.');
    const mixed = splitMixed(whole);
    const text = mixed?.act ?? whole;
    if (mixed) this.answerAside(state, beat, mixed.ask, events);
    this.noteSaid(state, text);
    const ctx: GmContext = { scenario: this.scenario, beat, free, state, text };
    const reading = await this.gm.interpret(ctx);
    this.recordGm(state, beat, 'interpret', reading.meta);
    let read: Interpretation = this.addressed(reading.kind === 'ask' && !gmSpeakerOf(this.scenario) ? { kind: 'talk', source: reading.source, meta: reading.meta } : reading, free);

    if (read.kind === 'ask') {
      // 이야기 입력칸에 적은 질문은 여우가 받지 않는다. 화면이 질문 모드(GM 단추)로 안내한다.
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'ask', approach: null, item: null, source: read.source });
      this.unsay(state);
      events.push({ type: 'notice', kind: 'ask' });
      return;
    }
    if (this.bounce(state, beat, ctx, read.source, events)) {
      this.unsay(state);
      return;
    }
    const guard = this.guardRisk(state, beat, read, text, true, events);
    if (guard === 'refused') {
      this.unsay(state);
      await this.worldMove(state, beat, free, events, false);
      return;
    }
    const warned = guard === 'warned';
    if (guard === 'self') read = { kind: 'talk', to: 'self', source: read.source, meta: read.meta };

    if (read.kind === 'talk') {
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'talk', approach: null, item: null, source: read.source });
      const self = read.to === 'self';
      if (!self && !isNoise(text)) {
        state.flags['말함'] = true;
        this.noteHeard(state, beat, text, isActionText(text));
      }
      const key = text.replace(/[\s.,!?…~]/g, '');
      const repeated = key === progress.lastInput;
      progress.lastInput = key;
      progress.talks += repeated ? 2 : 1;
      const tone: TalkTone = read.tone === 'deflect' ? 'deflect' : repeated ? 'repeat' : 'plain';
      const reply = await this.gm.talk({ ...ctx, tone, ...(self ? { self } : {}) });
      this.recordGm(state, beat, 'talk', reply.meta, reply.lines);
      this.followGm(state, reply.meta, events);
      for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
      await this.worldMove(state, beat, free, events);
      return;
    }
    await this.applyReading(state, beat, free, read, text, events, warned);
  }

  /** 사람이 멀리 있는 장면에서 그 사람에게 건넨 말은 다가가 말을 거는 판정이다. */
  private addressed(read: Interpretation, free: FreeSpec): Interpretation {
    // 위험한 말(신분 노출 등)은 접근법으로 바꾸지 않고 risk 관문이 먼저 받는다(b02 addressed: run 이 identity 를 삼키던 것).
    if (read.kind !== 'talk' || read.to !== 'person' || read.tone === 'deflect' || read.risk !== undefined || !free.addressed) return read;
    return { kind: 'approach', approach: free.addressed, item: null, spoken: true, source: read.source, meta: read.meta };
  }

  /**
   * 질문 모드(GM 단추). 여우가 말하는 유일한 자리다: 플레이 방법, 규칙, 수첫 안의 배경, "이거 맞아?", 허락.
   * 이야기 밖 말이라 입력 기록(said)·판정·참을성을 쓰지 않는다. "그만할래" 는 확인 창으로 간다.
   */
  private async askGm(state: GameState, stateBeat: BeatSpec, raw: string, events: GameEvent[], scene?: BeatSpec): Promise<void> {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT_CHARS);
    if (!text) throw new GameError('여우에게 물을 말을 입력해 주세요.');
    if (!gmSpeakerOf(this.scenario)) throw new GameError('이 시나리오에는 진행자가 없습니다.');
    const free = stateBeat.free ?? this.lastFree(state);
    if (!free) throw new GameError('지금은 물을 수 없습니다.');
    // 대사가 흐르는 중에 물으면 서버는 이미 앞 자리에 가 있다. 화면에 보이는 장면을 기준으로 답한다.
    const beat = scene ?? stateBeat;
    events.push({ type: 'echo', text });
    if (this.confirmQuit(state, text, events) !== null) return;
    if (this.reassure(state, beat, free, text, events)) return;
    const ctx: GmContext = { scenario: this.scenario, beat, free, state, text };
    const reading = await this.gm.interpret(ctx);
    this.recordGm(state, beat, 'interpret', reading.meta);
    if (reading.kind === 'ask' && reading.game !== undefined) {
      this.sayGame(state, beat, reading.game, text, reading.source, events);
      return;
    }
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'ask', approach: null, item: null, source: reading.source });
    if (reading.kind === 'ask' && reading.play) {
      this.sayHowToPlay(state, free, events);
      return;
    }
    const about = reading.kind === 'ask' && reading.about !== undefined ? { about: reading.about } : {};
    const reply = await this.gm.explain({ ...ctx, ...about, ...(isPermission(text) ? { permission: true } : {}) });
    this.recordGm(state, beat, 'explain', reply.meta, reply.lines);
    for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
  }

  /** 플레이 방법을 묻는 말에 여우가 답한다(질문 모드). 입력칸이 있으면 지금 할 수 있는 수도 알려 준다. */
  private sayHowToPlay(state: GameState, free: FreeSpec, events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    if (!gm) return;
    const progress = state.free;
    if (!progress) {
      this.say(state, { speaker: gm, text: '대사는 눌러서 넘기면 돼. 입력칸이 뜨면 아시나가 할 말이나 행동을 적으면 되고, 잘되고 못되고는 주사위가 정해.' }, 'script', events);
      return;
    }
    progress.hinted = true;
    this.say(state, { speaker: gm, text: '아시나가 할 말이나 행동을 그대로 적으면 돼. 잘되고 못되고는 주사위가 정해.' }, 'script', events);
    this.say(state, { speaker: gm, text: this.movesLine(state, free) }, 'script', events);
  }

  /** 질문과 행동이 섞인 입력의 질문을 여우가 한 줄로 받는다. */
  /** 행동에 붙여 적은 질문은 이야기 안에서 답하지 않는다. 행동만 받고 질문은 질문 모드로 안내한다. */
  private answerAside(state: GameState, beat: BeatSpec, ask: string, events: GameEvent[]): void {
    if (!gmSpeakerOf(this.scenario)) return;
    this.record(state, { kind: 'input', beat: beat.id, text: ask, result: 'ask', approach: null, item: null, source: 'rule' });
    events.push({ type: 'notice', kind: 'ask' });
  }

  /** 게임 자체에 대한 말에 여우가 고정 줄로 답한다(질문 모드). 이야기 속 말이 아니니 판정도 시간도 들지 않는다. */
  private sayGame(state: GameState, beat: BeatSpec, id: string, text: string, source: 'llm' | 'rule', events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    const help = this.scenario.gameHelp?.find((h) => h.id === id);
    if (!gm || !help) throw new Error(`없는 게임 항목: ${id}`);
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'game', approach: null, item: null, source });
    if (id === 'quit') {
      this.askQuit(state, text, help.say, events);
      return;
    }
    const value = help.track === undefined ? undefined : state.tracks[help.track];
    const now = value === undefined ? '' : ` 지금은 ${value}${[2, 4, 5, 9].includes(value) ? '야' : '이야'}.`;
    this.say(state, { speaker: gm, text: `${help.say}${now}` }, 'script', events);
  }

  /**
   * 해석이 위험하다고 본 입력을 거른다. 칼 앞에서 몸으로 덤비는 입력은 입력마다 한 번 묻고,
   * 정체를 드러내는 입력은 일어나지 않는 일이니 주사위 없이 고정 줄로 받는다.
   */
  private guardRisk(state: GameState, beat: BeatSpec, read: Interpretation, text: string, canRoll: boolean, events: GameEvent[]): 'refused' | 'warned' | 'self' | 'go' {
    if (read.kind === 'ask' || !read.risk) return 'go';
    // 이 세계에 없는 물건·힘은 일어나지 않으니 위험도 없다(총을 쏘는 시늘에 맨손 징조를 내지 않는다).
    if (read.kind === 'improv' && read.absurd) return 'go';
    if (read.risk === 'identity') {
      const identity = this.scenario.identity;
      if (!identity || isQuestionText(text)) return 'go';
      if (state.flags[IDENTITY_OMEN_FLAG] !== true) {
        state.flags[IDENTITY_OMEN_FLAG] = true;
        for (const line of identity.omen) this.say(state, line, 'script', events);
      }
      // 들을 사람이 없으면 혼잇말로 흐른다. 있으면 큰 행동: 수치와 플래그를 바꾸고 인물이 성격대로 받는다(facts 신분_노출).
      if (!Object.values(beat.cast ?? {}).includes(identity.with)) return 'self';
      this.applyEffects(state, identity.effects, events);
      return 'go';
    }
    if (read.risk !== 'attack') {
      const refuse = this.scenario.refuse?.find((r) => r.id === read.risk && !r.unless.includes(beat.id));
      if (!refuse || isQuestionText(text)) return 'go';
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'talk', approach: null, item: null, source: read.source });
      for (const line of refuse.lines) this.say(state, line, 'script', events);
      return 'refused';
    }
    const danger = this.scenario.danger;
    if (read.kind === 'talk' || !canRoll || !danger || isPermission(text) || !Object.values(beat.cast ?? {}).includes(danger.with)) return 'go';
    // 되묻지 않는다. 징조 한 줄(한 판 한 번) 뒤 바로 굴리고, 경고를 거친 입력으로 보아 칭찬과 보정 없이 받는다.
    const plain = text.replace(/\s+/g, '');
    if (!state.warned?.includes(plain)) state.warned = [...(state.warned ?? []), plain];
    if (state.flags[DANGER_OMEN_FLAG] !== true) {
      state.flags[DANGER_OMEN_FLAG] = true;
      for (const line of danger.omen) this.say(state, line, 'script', events);
    }
    return 'warned';
  }

  /** 입력을 쌓아 두고, 그 말로 갈래가 나뉘는 플래그(길을 물었다, 미소녀라고 했다)를 세운다. 새로 세운 플래그를 돌려준다. */
  private noteSaid(state: GameState, text: string): string[] {
    state.said = [...(state.said ?? []), text].slice(-SAID_KEEP);
    const plain = text.replace(/\s+/g, '');
    const newly: string[] = [];
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

  /** 여우에게 물은 말은 이야기 속 말이 아니다. 방금 쌓은 입력을 도로 뺀다. */
  private unsay(state: GameState): void {
    state.said = state.said?.slice(0, -1);
  }

  /**
   * 아직 모르는 이름·사실이나 지금 장면에 없는 것을 꺼낸 입력은 이야기에 넣지 않고 여우가 게임 밖 말로 되돌려 보낸다.
   * GM 이 입력을 고쳐 쓰지 않고, 판정·시간·참을성을 쓰지 않으며, 기록에만 'bounced' 로 남는다.
   * 여우 말: 첫 문장은 걸린 이유, 둘째는 "~로 다시 적어 봐". 원작 이름·사실은 한 플레이에 한 번만 "웹툰 봤구나"를 앞세운다.
   * 같은 입력이 두 번 걸리뮤 예시 한 줄을 덧붙인다.
   */
  private bounce(state: GameState, beat: BeatSpec, ctx: GmContext, source: 'llm' | 'rule', events: GameEvent[]): boolean {
    const gm = gmSpeakerOf(this.scenario);
    const hit = gm ? this.gm.screen?.(ctx) : null;
    if (!gm || !hit) return false;
    const progress = state.free;
    const key = ctx.text.replace(/[\s.,!?…~]/g, '');
    const again = progress?.lastBounce === key;
    if (progress) progress.lastBounce = key;
    this.record(state, { kind: 'input', beat: beat.id, text: ctx.text, result: 'bounced', approach: null, item: null, source });
    let text: string;
    if (hit.reason === 'unknown') {
      const first = state.flags[READER_FLAG] !== true;
      state.flags[READER_FLAG] = true;
      const why = hit.who ? `아시나는 아직 ${hit.who} 이름을 몰라.` : '아시나는 아직 그걸 몰라.';
      const redo = hit.who ? '이름 없이 다시 적어 봐.' : '지금 아는 것만으로 다시 적어 봐.';
      const example = again ? (hit.who ? " '당신 누구야?'처럼." : " '저 사람은 왜 저래?'처럼.") : '';
      text = `${first ? '너 이 웹툰 봤구나? 그런데 ' : ''}${why} ${redo}${example}`;
    } else {
      text = `지금 여기엔 ${hit.term}${subjectParticle(hit.term)} 없어. 보이는 것으로 다시 적어 봐.${again ? " '주변을 둘러본다'처럼." : ''}`;
    }
    this.say(state, { speaker: gm, text }, 'script', events);
    return true;
  }

  /** 상대 인물이 있는 장면에서 한 말과 행동만 인물이 안다. 되받기, 작전 회의, 인물 프롬프트가 이 기록을 쓴다. */
  /** 이 장면에 아시나 말고 말하는 인물이 있는가. */
  private facing(beat: BeatSpec): boolean {
    return Object.values(beat.cast ?? {}).some((key) => {
      const cast = key ? this.scenario.cast[key] : undefined;
      return cast?.style === 'speech' && cast.lore !== this.scenario.sheet.name;
    });
  }

  /**
   * 이 세계에 없는 물건·힘을 쓰려 한 행동(absurd). 판정·수치·다음 비트 없이 나레이션이 실제 동작을 세계의 말로 그리고
   * 상대 인물이 성격대로 받아친다(혼자면 나레이션·속마음). 여우는 말하지 않는다. 말 걸기와 같이 셈해 거듭하면 세계가 움직인다.
   * 인물의 기억(heard)에는 해석이 세계의 말로 요약한 동작(deed)만 남긴다 — 세계 밖 낱말은 뒤 장면 프롬프트에 들어가지 않는다.
   */
  private async absurdAct(state: GameState, beat: BeatSpec, free: FreeSpec, read: Interpretation & { kind: 'improv' }, text: string, events: GameEvent[]): Promise<void> {
    const progress = state.free;
    if (!progress) throw new Error(`${beat.id}: 자유 입력 진행 상태가 없습니다`);
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'talk', approach: null, item: null, source: read.source });
    const self = !this.facing(beat);
    if (!self) this.noteHeard(state, beat, read.deed ?? '품을 더듬었지만 잡히는 것이 없었다', true);
    progress.lastInput = text.replace(/[\s.,!?…~]/g, '');
    progress.talks += 1;
    const ctx: GmContext = { scenario: this.scenario, beat, free, state, text, absurd: true, ...(self ? { self } : {}), ...(read.deed ? { deed: read.deed } : {}) };
    const reply = await this.gm.talk(ctx);
    this.recordGm(state, beat, 'talk', reply.meta, reply.lines);
    this.followGm(state, reply.meta, events);
    for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
    await this.worldMove(state, beat, free, events);
  }

  private noteHeard(state: GameState, beat: BeatSpec, text: string, action: boolean): void {
    if (!this.facing(beat)) return;
    state.heard = [...(state.heard ?? []), { text, action }].slice(-SAID_KEEP);
    const plain = text.replace(/\s+/g, '');
    for (const spec of this.scenario.callbacks ?? []) {
      if (spec.words?.some((w) => plain.includes(w.replace(/\s+/g, '')))) state.flags[spec.flag] = true;
    }
    if (!action) this.noteTalked(state, text);
  }

  /** 대사 도중 끼어든 입력. 이야기 자리는 그대로 두고 답한 뒤, 뒤의 고정 줄 가운데 이 입력으로 어긋나게 된 줄을 뺀다. */
  private async interject(state: GameState, stateBeat: BeatSpec, action: Extract<Action, { type: 'interject' }>, events: GameEvent[]): Promise<void> {
    const raw = action.text.replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT_CHARS);
    if (!raw) throw new GameError('행동이나 대사를 입력해 주세요.');
    const scene = (action.scene && this.scenario.beats[action.scene]) || stateBeat;
    // 화면이 서버보다 뒤에 있을 수 있다. 보이는 장면의 설정을 먼저 쓴다.
    const free = scene.free ?? stateBeat.free ?? this.lastFree(state);
    if (!free) throw new GameError('지금은 말할 수 없습니다.');
    events.push({ type: 'echo', text: raw });
    const quit = this.confirmQuit(state, raw, events);
    if (quit !== null) {
      if (quit === 'quit') events.push({ type: 'revise', drop: action.pending.map((p) => p.i), jump: true });
      return;
    }
    const whole = raw;
    const mixed = splitMixed(whole);
    const text = mixed?.act ?? whole;
    const gmName = gmSpeakerOf(this.scenario);
    const lastShown = action.shown.at(-1)?.speaker;
    // 여우가 말하는 중에 끼어든 말은 앞에 있는 인물에게 한 말이 아니다.
    const toFox = lastShown !== undefined && this.scenario.cast[lastShown]?.style === 'gm';
    if (mixed) this.answerAside(state, scene, mixed.ask, events);
    const canRoll = !state.pendingLuck && !state.ending && stateBeat.free && state.free && scene.id === stateBeat.id;
    const newly = this.noteSaid(state, text);
    const onStage = new Set<string>(Object.values(scene.cast ?? {}).filter((c): c is string => typeof c === 'string'));
    const speakers = free.speakers.filter((s) => this.scenario.cast[s]?.style !== 'speech' || onStage.has(s));
    const shownState: GameState = { ...state, recent: action.shown.slice(-RECENT_LINES) };
    const ctx: GmContext = { scenario: this.scenario, beat: scene, free: { ...free, speakers, situation: scene.situation ?? free.situation }, state: shownState, text, interject: { upcoming: action.pending.map((p) => p.text), action: false } };
    const reading = await this.gm.interpret(ctx);
    this.recordGm(state, scene, 'interpret', reading.meta);
    let read: Interpretation = this.addressed(
      reading.kind === 'ask' && !gmName ? { kind: 'talk', source: reading.source, meta: reading.meta }
      : reading.kind === 'talk' && reading.to !== 'self' && toFox && gmName && isQuestionText(text) && !isNoise(text) ? { kind: 'ask', source: reading.source, meta: reading.meta }
      : reading,
      free,
    );
    if (read.kind === 'ask') {
      // 이야기 입력칸에 적은 질문은 여우가 받지 않는다. 화면이 질문 모드(GM 단추)로 안내하고 남은 줄은 그대로 이어진다.
      this.record(state, { kind: 'input', beat: scene.id, text, result: 'ask', approach: null, item: null, source: read.source });
      this.unsay(state);
      this.revisePending(state, action.pending, newly, events);
      events.push({ type: 'notice', kind: 'ask' });
      return;
    }
    const big = read.kind === 'approach' || read.kind === 'improv';
    const guard = this.guardRisk(state, scene, read, text, Boolean(canRoll), events);
    if (guard === 'refused') {
      this.unsay(state);
      this.revisePending(state, action.pending, newly, events);
      return;
    }
    const warned = guard === 'warned';
    if (guard === 'self') read = { kind: 'talk', to: 'self', source: read.source, meta: read.meta };
    if (big && canRoll && stateBeat.free) {
      events.push({ type: 'revise', drop: action.pending.map((p) => p.i), jump: true });
      await this.applyReading(state, stateBeat, stateBeat.free, read, text, events, warned);
      return;
    }

    this.record(state, { kind: 'input', beat: scene.id, text, result: 'talk', approach: null, item: null, source: read.source });
    const self = read.kind === 'talk' && read.to === 'self';
    const noise = isNoise(text);
    if (!big && !toFox && !self && !noise && state.flags['말함'] !== true) {
      state.flags['말함'] = true;
      newly.push('말함');
    }
    this.revisePending(state, action.pending, newly, events);
    if (toFox && !big) this.unsay(state);
    else if (!toFox && !self && !noise) this.noteHeard(state, scene, text, this.acted(read, text));
    const said = state.said ?? [];
    const repeated = said.length >= 2 && said.at(-2)?.replace(/[\s.,!?…~]/g, '') === text.replace(/[\s.,!?…~]/g, '');
    const reply = await this.gm.talk({ ...ctx, tone: repeated ? 'repeat' : 'plain', interject: { upcoming: ctx.interject?.upcoming ?? [], action: big }, ...(self ? { self } : {}) });
    this.recordGm(state, scene, 'talk', reply.meta, reply.lines);
    this.followGm(state, reply.meta, events);
    for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
    const tries = state.log.filter((e) => e.kind === 'input' && e.beat === scene.id && e.result === 'talk').length;
    const press = free.press[tries % free.press.length];
    if (tries >= free.patience && press && speakers.includes(press.speaker)) this.say(state, press, 'script', events);
  }

  /**
   * GM 무브 표. 같은 자리에서 말만 거듭해 patience 에 닿으면 여우 힌트 대신 세계가 먼저 움직인다. 한 턴에 하나, 한 종류는 장면마다 한 번:
   * ① 위협의 징조(nudge) → ② 상대가 압박(press, 없으면 상대행동 대가) → ③ 대가 붙은 기회(offer, 없으면 건너뜀) → ④ 시간이 감(시간 대가).
   * ①·②·④은 머뭇을 하나씩 쌓는다. ④ 뒤에는 세계가 대신 정한다(hard): 머뭇이 찼으면 쓰러지는 작은 끝, 아니면 기본 행동으로 판정이 굴러간다.
   * 할 수 있는 수를 알려 주는 건 질문 모드에서만 한다.
   */
  private async worldMove(state: GameState, beat: BeatSpec, free: FreeSpec, events: GameEvent[], hard = true): Promise<void> {
    const progress = state.free;
    if (!progress || progress.talks < free.patience) return;
    const done = progress.moves ?? [];
    const move = WORLD_MOVES.find((m) => !done.includes(m) && this.canMove(state, free, m));
    if (move) {
      progress.moves = [...done, move];
      this.makeMove(state, free, move, events);
      if (move !== 'clock') return;
    }
    if (!hard) return;
    if (!move) this.bumpHesitation(state, events);
    // 머뭇이 쓰러지는 문턱에 닿았으면 기본 접근법을 풀지 않고 바로 작은 끝으로 간다(판정 성공 직후 쓰러지는 이음새를 막는다).
    if (this.dueFate(state)) return;
    await this.resolve(state, beat, free, this.approachOf(free, free.default_approach), null, events);
  }

  private canMove(state: GameState, free: FreeSpec, move: WorldMove): boolean {
    if (move === 'threat') return (free.nudge?.length ?? 0) > 0;
    if (move === 'press') return free.press.length > 0 || this.movePrices(state, free, '상대행동').length > 0;
    if (move === 'offer') return free.offer !== undefined;
    return true;
  }

  /** 무브에 쓸 수 있는 이 장면의 가벼운 대가(아직 안 나온 것). */
  private movePrices(state: GameState, free: FreeSpec, tag: PriceTag): PriceSpec[] {
    const ctx = this.ctx(state);
    const used = state.free?.prices ?? [];
    return (free.prices ?? []).filter((p) => p.tag === tag && p.weight === 'soft' && !used.includes(p.id) && (p.if === undefined || evalCond(p.if, ctx)) && !(p.once && state.flags[onceFlag(p.id)] === true));
  }

  private sayPrice(state: GameState, price: PriceSpec, events: GameEvent[]): void {
    const progress = state.free;
    if (progress) progress.prices = [...(progress.prices ?? []), price.id];
    if (price.once) state.flags[onceFlag(price.id)] = true;
    this.record(state, { kind: 'price', beat: state.beat, id: price.id, tag: price.tag, text: price.text });
    this.say(state, { speaker: '나레이션', text: price.text }, 'script', events);
    this.applyEffects(state, price.effects, events);
  }

  private makeMove(state: GameState, free: FreeSpec, move: WorldMove, events: GameEvent[]): void {
    const progress = state.free;
    if (move === 'threat') {
      if (progress) progress.nudged = true;
      for (const line of free.nudge ?? []) this.say(state, line, 'script', events);
      this.bumpHesitation(state, events);
      this.applyEffects(state, { tracks: { 귀찌: -1 } }, events);
      return;
    }
    if (move === 'press') {
      const press = free.press[(progress?.talks ?? 0) % Math.max(free.press.length, 1)];
      if (press) this.say(state, press, 'script', events);
      else {
        const price = drawPrice(this.movePrices(state, free, '상대행동'), state.rng).price;
        if (price) this.sayPrice(state, price, events);
      }
      this.bumpHesitation(state, events);
      return;
    }
    if (move === 'offer') {
      for (const line of free.offer?.lines ?? []) this.say(state, line, 'script', events);
      this.applyEffects(state, free.offer?.effects, events);
      return;
    }
    const price = drawPrice(this.movePrices(state, free, '시간'), state.rng).price;
    if (price) this.sayPrice(state, price, events);
    else {
      this.say(state, { speaker: '나레이션', text: CLOCK_FALLBACK }, 'script', events);
      this.applyEffects(state, { tracks: { 귀찌: -1 } }, events);
    }
    this.bumpHesitation(state, events);
  }

  /**
   * 게임을 끝내는 입력은 화면이 확인 창으로 묻는다(규칙 목소리는 UI). 여우는 말하지 않는다.
   * 창이 떠 있는 동안 글로 답해도 받는다(자동 플레이). 'asked' 는 창을 띄웠거나 닫은 것, 'quit' 은 끝낸 것, null 은 보통 입력이다.
   */
  private confirmQuit(state: GameState, text: string, events: GameEvent[]): 'asked' | 'quit' | null {
    // 이미 끝난 판(결말 줄이 흐르는 중 끼어든 말)은 그만둘 것이 없다. 묻지도, 결말을 바꾸지도 않는다.
    if (state.ending) return null;
    const pending = state.pendingRisk;
    delete state.pendingRisk;
    if (pending && (YES.test(text) || QUIT_YES.test(text))) {
      this.enter(state, QUIT_BEAT, events, 0);
      return 'quit';
    }
    if (pending && NO.test(text)) return 'asked';
    const plain = text.replace(/\s+/g, '');
    const spec = (this.scenario.risky ?? []).find((r) => r.quit && r.words.some((w) => plain.includes(w.replace(/\s+/g, ''))));
    if (!spec) return null;
    this.askQuit(state, text, spec.warn, events);
    return 'asked';
  }

  private askQuit(state: GameState, text: string, warn: string, events: GameEvent[]): void {
    // 확인 창은 하나다. 떠 있던 의도 카드는 그만두기 확인이 대신하고, 창의 답은 그만두기에 간다.
    if (state.pendingIntent) {
      delete state.pendingIntent;
      this.unsay(state);
    }
    state.pendingRisk = { text, quit: true };
    events.push({ type: 'confirm', kind: 'quit', text: warn });
  }

  /** 확인 창의 답. 의도 카드면 그 답으로, 그만두기면 끝낼 때 그만두는 끝으로 간다. 아니면 아무 말 없이 이야기로 돌아간다. */
  private async answerConfirm(state: GameState, beat: BeatSpec, ok: boolean, events: GameEvent[]): Promise<void> {
    if (state.pendingIntent) return this.answerIntent(state, beat, ok, events);
    const pending = state.pendingRisk;
    if (!pending) throw new GameError('지금은 확인할 것이 없습니다.');
    delete state.pendingRisk;
    if (ok) this.enter(state, QUIT_BEAT, events, 0);
  }

  /** "이거 맞아?", "뭐 해야 돼?" 에는 안심 한 줄과 지금 할 수 있는 것을 준다(질문 모드). */
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
    return `${moves.join(', ')} 같은 수가 있어.`;
  }

  /** 여우가 짚어 둔 것을 입력에 쓰면 보정을 준다. 이야기 화면에 여우 줄은 내지 않는다. */
  private remembered(state: GameState, beat: BeatSpec, text: string): ModApplied[] {
    const gm = gmSpeakerOf(this.scenario);
    if (isQuestionText(text)) return [];
    const plain = text.replace(/\s+/g, '');
    const hit = (this.scenario.foreshadow ?? []).find((f) => state.flags[`짚음_${f.id}`] === true && state.flags[`씀_${f.id}`] !== true && f.beats.includes(beat.id) && f.words.some((w) => plain.includes(w)));
    if (!hit && gm && this.scenario.council?.includes(beat.id) && state.flags['작전_회의'] === true && state.flags['계획_씀'] !== true) {
      // 소지품은 "지도"처럼 줄여 불러도 된다.
      const names = this.scenario.sheet.items.filter((i) => !i.hidden && state.items.includes(i.id)).map((i) => i.name.split(' ').at(-1) ?? i.name);
      const usedItem = names.some((n) => plain.includes(n));
      const claimed = (this.scenario.callbacks ?? []).some((c) => state.flags[c.flag] === true && c.words?.some((w) => plain.includes(w.replace(/\s+/g, ''))));
      const used = claimed || usedItem || (state.talked !== undefined && plain.includes(state.talked.replace(/\s+/g, '')));
      if (used) {
        state.flags['계획_씀'] = true;
        return [{ label: '계획', value: 1 }];
      }
    }
    if (!hit || !gm) return [];
    state.flags[`씀_${hit.id}`] = true;
    return [{ label: '기억해 둔 것', value: 1 }];
  }

  /** 플레이어가 지어낸 말(상인이라고 했다 등) 가운데 가장 최근 입력. */
  private inventedClaim(state: GameState): string | undefined {
    const words = (this.scenario.callbacks ?? []).flatMap((c) => c.words ?? []).map((w) => w.replace(/\s+/g, ''));
    return state.heard?.findLast((h) => !h.action && words.some((w) => h.text.replace(/\s+/g, '').includes(w)))?.text;
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

  /** 첫 입력 직전의 안내. 여우가 짚어 두는 것은 이야기 중 메타 귀띔이라 줄로 내지 않고 플래그만 세운다(뒤 장면 복선 회수는 그대로). */
  private sayGuide(state: GameState, beat: BeatSpec, events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    if (!gm) return;
    for (const f of this.scenario.foreshadow ?? []) {
      if (f.at === beat.id) state.flags[`짚음_${f.id}`] = true;
    }
    if (beat.free && this.scenario.council?.includes(beat.id) && state.flags['작전_회의'] !== true) {
      // 18차: 여우가 가진 것·알아낸 것·네가 한 말을 읽어 주던 두 줄은 뺀다(수첩·가방에 있는 정보 되풀이). 플래그만 세워 '가진 것을 쓰면 보정 +1' 은 그대로.
      state.flags['작전_회의'] = true;
    }
    // 19-C: 처음 입력칸이 떠도 여우가 적는 법을 말하지 않는다. 입력칸의 안내 글과 질문 모드가 맡는다.
    if (beat.free && state.flags['안내_입력'] !== true) state.flags['안내_입력'] = true;
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

  /** 입력이 대사가 아니라 행동을 적은 문장인가. 행동은 인물이 인용하지 않는다. */
  private acted(read: Interpretation, text: string): boolean {
    return read.kind === 'improv' || isActionText(text) || (read.kind === 'approach' && read.spoken === false);
  }

  private async applyReading(state: GameState, beat: BeatSpec, free: FreeSpec, read: Interpretation, text: string, events: GameEvent[], warned = false): Promise<void> {
    if (read.kind === 'ask' || read.kind === 'talk') return;
    if (read.kind === 'improv' && read.absurd) {
      await this.absurdAct(state, beat, free, read, text, events);
      return;
    }
    if (read.kind === 'improv') {
      // 큰 행동은 굴리기 전에 해석이 맞는지 화면 카드로 묻는다(여우가 아니라 규칙 목소리). 이미 경고를 받고 밀고 나간 입력은 다시 묻지 않는다.
      if (read.bold && read.deed && !warned) {
        state.pendingIntent = { text, deed: read.deed, stat: read.stat, difficulty: read.difficulty, source: read.source };
        events.push({ type: 'confirm', kind: 'intent', text: `${read.deed} — 이렇게 하는 거야?`, yes: '그래', no: '다른 뜻' });
        return;
      }
      await this.improvRoll(state, beat, free, { stat: read.stat, difficulty: read.difficulty, bold: read.bold, source: read.source, ...(read.deed ? { deed: read.deed } : {}) }, text, events, warned);
      return;
    }

    let approach = this.approachOf(free, read.approach);
    if (approach.item !== undefined && !state.items.includes(approach.item)) approach = this.approachOf(free, free.default_approach);
    const item = read.item !== null && state.items.includes(read.item) ? read.item : null;
    // 뜻이 약한 설득도 되묻지 않고 그대로 굴린다. 구체적인 말이면 '입력한 말' 보정만 붙는다.
    const persuade = approach.stat === '매력' || PERSUADE.test(`${approach.label} ${approach.hint}`);
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'approach', approach: approach.id, item, source: read.source });
    this.noteHeard(state, beat, text, this.acted(read, text));
    this.markPressingOn(state, text, warned);
    const argued = !warned && persuade && [...text.replace(/\s+/g, '')].length >= ARGUED_CHARS;
    const remembered = warned ? [] : this.remembered(state, beat, text);
    const extra: ModApplied[] = [...(argued ? [{ label: '입력한 말', value: 1 }] : []), ...remembered];
    if (extra.length) {
      await this.resolve(state, beat, free, approach, text, events, extra);
      return;
    }
    await this.resolve(state, beat, free, approach, text, events);
  }

  /** 칼 앞 경고에 "응" 하고 강행한 행동이다. 이 판정이 실패하고 행운으로 메우지 않으면 작은 끝으로 간다. */
  private markPressingOn(state: GameState, text: string, warned: boolean): void {
    if (warned && state.warned?.includes(text.replace(/\s+/g, ''))) state.flags['위험_강행'] = true;
  }

  private async approachButton(state: GameState, beat: BeatSpec, id: string, events: GameEvent[]): Promise<void> {
    const free = beat.free;
    // 행운을 묻는 동안 새로 굴리면 행운이 그 판정이 아닌 새 판정을 고친다.
    if (!free || !state.free || state.pendingLuck) throw new GameError('지금은 행동을 고를 수 없습니다.');
    const approach = free.approaches.find((a) => a.id === id);
    if (!approach) throw new GameError(`없는 행동입니다: ${id}`);
    if (approach.item !== undefined && !state.items.includes(approach.item)) throw new GameError('그 행동에 필요한 소지품이 없습니다.');
    this.record(state, { kind: 'choice', beat: beat.id, choice: `approach:${approach.id}`, text: approach.label });
    await this.resolve(state, beat, free, approach, null, events);
  }

  private async resolve(state: GameState, beat: BeatSpec, free: FreeSpec, approach: ApproachSpec, text: string | null, events: GameEvent[], extra: ModApplied[] = [], improv?: ImprovMark): Promise<void> {
    const tension = this.tensionOf(state);
    const roll = this.roll(state, beat, approach.stat, approach.label, approach.mods, events, extra);
    this.applyEffects(state, approach.before, events);
    if (roll.tier === 'miss' && this.askLuck(state, beat, approach, text, roll, tension, events, improv)) return;
    await this.finishResolve(state, beat, free, approach, text, roll, events, improv);
  }

  /** 실패 직후 행운을 쓸지 묻는다. 모자라면 그렇다고만 말하고 넘어간다. */
  private askLuck(state: GameState, beat: BeatSpec, approach: ApproachSpec, text: string | null, roll: RollResult, tension: number, events: GameEvent[], improv?: ImprovMark): boolean {
    const have = state.tracks.행운;
    if (!this.luckPrompt || have <= 0) return false;
    const need = LUCK_TARGET - roll.total;
    if (need > have) return false;
    state.pendingLuck = { beat: beat.id, approach: approach.id, label: approach.label, stat: approach.stat, text, need, tension, ...(improv ? { improv } : {}) };
    // 규칙 목소리는 화면이 낸다: 행운 창(prompt luck)이 필요한 점수와 남은 점수를 보인다.
    return true;
  }

  private async answerLuck(state: GameState, use: boolean, events: GameEvent[]): Promise<void> {
    const pending = state.pendingLuck;
    if (!pending) throw new GameError('지금은 행운을 쓸 수 없습니다.');
    delete state.pendingLuck;
    const beat = this.scenario.beats[pending.beat];
    const free = beat?.free;
    if (!beat || !free) throw new Error(`없는 비트: ${pending.beat}`);
    const approach =
      free.approaches.find((a) => a.id === pending.approach) ?? this.improvSpec(free, pending.label, pending.stat, pending.improv?.bold === true);
    const check = [...state.log].reverse().find((e) => e.kind === 'check');
    if (check?.kind !== 'check') throw new Error('판정 기록이 없습니다');
    if (use) {
      check.roll = { ...check.roll, total: LUCK_TARGET, tier: 'mixed', luck: pending.need };
      // 실패로 올린 긴장을 판정 전 값으로 되돌린다. 7~9 는 긴장을 바꾸지 않는다.
      if (pending.tension !== undefined) state.flags['긴장'] = pending.tension;
      this.applyEffects(state, { tracks: { 행운: -pending.need } }, events);
    }
    await this.finishResolve(state, beat, free, approach, pending.text, check.roll, events, pending.improv);
  }

  /** 즉흥 행동 판정. 의도 카드를 거친 뒤에도 같은 길로 굴린다. */
  private async improvRoll(state: GameState, beat: BeatSpec, free: FreeSpec, read: { stat: Ability; difficulty: number; bold: boolean; deed?: string; source: 'llm' | 'rule' }, text: string, events: GameEvent[], warned: boolean): Promise<void> {
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'improv', approach: null, item: null, source: read.source });
    this.noteHeard(state, beat, text, true);
    const spec = this.improvSpec(free, improvLabel(text), read.stat, read.bold);
    const extra = [...(read.difficulty === 0 ? [] : [{ label: read.difficulty > 0 ? '쉬운 행동' : '어려운 행동', value: read.difficulty }]), ...(warned ? [] : this.remembered(state, beat, text))];
    this.markPressingOn(state, text, warned);
    await this.resolve(state, beat, free, spec, text, events, extra, { absurd: false, bold: read.bold, ...(read.deed ? { deed: read.deed } : {}) });
  }

  /** 의도 카드의 답. 그래면 묻기 전 해석대로 굴리고, 다른 뜻이면 그 입력을 지우고 아무 대가 없이 다시 적게 한다. */
  private async answerIntent(state: GameState, beat: BeatSpec, ok: boolean, events: GameEvent[]): Promise<void> {
    const pending = state.pendingIntent;
    if (!pending) throw new GameError('지금은 확인할 것이 없습니다.');
    delete state.pendingIntent;
    if (!ok) {
      this.unsay(state);
      return;
    }
    if (!beat.free || !state.free || state.free.beat !== beat.id) throw new GameError('지금은 자유 입력을 받을 수 없습니다.');
    await this.improvRoll(state, beat, beat.free, { stat: pending.stat, difficulty: pending.difficulty, bold: true, deed: pending.deed, source: pending.source }, pending.text, events, false);
  }

  private improvSpec(free: FreeSpec, label: string, stat: Ability, bold = false): ApproachSpec {
    // 즉흥 행동은 어느 행동도 아니므로, 이 장면 행동들이 전제하는 낱말(피했다 등)을 입력 없이 쓸 수 없다.
    const presume = free.approaches.flatMap((a) => a.presume ?? []);
    // 상대가 지나칠 수 없는 큰 행동은 반응과 수치가 큰 결과 묶음을 쓴다.
    const outcomes = bold && free.improv_bold ? free.improv_bold : free.improv;
    return { id: 'improv', label, stat, hint: '', examples: [], keywords: [], outcomes, ...(presume.length ? { presume } : {}) };
  }

  /** 플레이어가 먼저 해 버린 일과 같은 다음 장면의 원작 줄을 적어 둔다. 그 장면에 가면 이 줄만 건너뛴다. */
  private preempt(state: GameState, beat: BeatSpec, deed: string): void {
    const seen = new Set<string>([beat.id]);
    const queue = [...edgesOf(beat)];
    const found = new Set(state.preempted ?? []);
    while (queue.length) {
      const id = queue.pop();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      const next = this.scenario.beats[id];
      if (!next) continue;
      for (const line of next.lines) {
        const norm = normalizeKo(line.text);
        if (preemptedBy(norm, deed)) found.add(norm);
      }
      queue.push(...edgesOf(next));
    }
    if (found.size) state.preempted = [...found];
  }

  private async finishResolve(state: GameState, beat: BeatSpec, free: FreeSpec, approach: ApproachSpec, text: string | null, roll: RollResult, events: GameEvent[], improv?: ImprovMark): Promise<void> {
    const outcome = approach.outcomes[roll.tier];
    if (approach.said && (text === null || approach.said.words.some((w) => text.replace(/\s+/g, '').includes(w.replace(/\s+/g, ''))))) state.flags[approach.said.flag] = true;
    const progress = state.free;
    if (!progress) throw new Error(`${beat.id}: 자유 입력 진행 상태가 없습니다`);
    const price = this.pickPrice(state, free, outcome, roll.tier, progress.prices ?? []);
    if (price) progress.prices = [...(progress.prices ?? []), price.id];
    if (text === null) {
      for (const line of outcome.lines) this.say(state, line, 'script', events);
      if (price) this.say(state, { speaker: '나레이션', text: price.text }, 'script', events);
    } else {
      const reply = await this.gm.narrate({ scenario: this.scenario, beat, free, state, text, approach, roll, outcome, ...(price ? { price } : {}), ...(improv ? { improv } : {}), ...(improv?.deed ? { deed: improv.deed } : {}) });
      if (improv?.deed) this.preempt(state, beat, improv.deed);
      this.recordGm(state, beat, 'narrate', reply.meta, reply.lines);
      this.followGm(state, reply.meta, events);
      const cg = reply.meta.fallback ? undefined : outcome.lines.find((l) => l.cg)?.cg;
      for (const line of reply.lines) this.say(state, cg ? { ...line, cg } : line, reply.meta.fallback ? 'script' : 'gm', events);
      if (price && reply.meta.fallback) this.say(state, { speaker: '나레이션', text: price.text }, 'script', events);
    }
    if (price) {
      this.record(state, { kind: 'price', beat: beat.id, id: price.id, tag: price.tag, text: price.text });
      events.push({ type: 'price', id: price.id, tag: price.tag, text: price.text });
    }
    this.applyEffects(state, outcome.effects, events, true);
    if (price) this.applyEffects(state, price.effects, events, true);
    if (state.flags['위험_강행'] === true) {
      delete state.flags['위험_강행'];
      if (roll.tier === 'miss') state.flags['위험_실패'] = true;
    }
    progress.rolls += 1;
    const finished = outcome.next === undefined && (progress.rolls >= free.turns || (free.until !== undefined && evalCond(free.until, this.ctx(state))));
    // 징조는 효과가 다 반영된 뒤, 실제로 갈 비트를 알고 한 번만 낸다.
    const heading = outcome.next !== undefined ? this.route(state, outcome.next, beat.id) : finished ? this.route(state, free.next ?? beat.next, beat.id) : beat.id;
    this.warnFates(state, events, heading);
    if (heading !== beat.id) this.enter(state, heading, events, 0);
  }

  private pickPrice(state: GameState, free: FreeSpec, outcome: Outcome, tier: Tier, used: readonly string[]): PriceSpec | null {
    const candidates = priceCandidates(free, outcome, tier, this.ctx(state), state.flags, used);
    // 주사위 흐름(state.rng)은 그대로 두고 지금 값만 씨앗으로 쓴다. 시드 고정 경로 테스트가 대가 표 유무에 흔들리지 않는다.
    const drawn = drawPrice(candidates, state.rng);
    if (drawn.price?.once) state.flags[onceFlag(drawn.price.id)] = true;
    return drawn.price;
  }

  /** quiet: 징조(warnFates)는 부른 쪽이 갈 비트를 알고 따로 낸다. */
  /** 플레이어가 직접 한 행동이라 상태가 따라가는 경우다. 줄을 보여 주기 전에 켜서 입식도 함께 바뀐다. */
  private followGm(state: GameState, meta: GmMeta, events: GameEvent[]): void {
    if (meta.setFlags?.length) this.applyEffects(state, { flags: Object.fromEntries(meta.setFlags.map((flag) => [flag, true])) }, events, true);
  }

  private applyEffects(state: GameState, effects: Effects | undefined, events: GameEvent[], quiet = false): void {
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
    if (earring && state.flags['설명_귀찌'] !== true) {
      state.flags['설명_귀찌'] = true;
      const narrator = Object.entries(this.scenario.cast).find(([, c]) => c.style === 'narration')?.[0];
      if (narrator) this.say(state, { speaker: narrator, text: '귀찌가 뜨겁게 달아올랐다. 변장이 버틸 시간이 줄고 있다.' }, 'script', events);
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
    if (!quiet) this.warnFates(state, events);
  }

  private say(state: GameState, raw: Line, by: 'script' | 'gm', events: GameEvent[]): void {
    if (raw.if !== undefined && !evalCond(raw.if, this.ctx(state))) return;
    const alt = raw.cg ? this.scenario.cgs[raw.cg]?.alt : undefined;
    const line = alt && evalCond(alt.if, this.ctx(state)) ? { ...raw, cg: alt.id } : raw;
    events.push(this.lineEvent(line, by));
    state.recent = [...state.recent, { speaker: line.speaker, text: line.text }].slice(-RECENT_LINES);
    state.spoken = { ...state.spoken, [line.speaker]: [...(state.spoken?.[line.speaker] ?? []), line.text] };
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
    return { type: 'ending', id: e.id, title: e.title, summary: e.summary, nextHook: e.next_hook, bad: e.bad === true };
  }
}
