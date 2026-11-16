import { evalCond, holdBefore, type CondContext } from './conditions.ts';
import { nextU32, roll2d6, seedFrom } from './dice.ts';
import { cgLineProblem, edgesOf, facesPerson, hasCharacter } from './scenario.ts';
import { drawPrice, hasInlineCost, onceFlag, priceCandidates } from './prices.ts';
import { assertedSpeech, discloses, isActionText, isNoise, isQuestionText, normalizeKo, parseStoryInput, preemptedBy, type StoryInput } from './text.ts';
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
  trackTone,
  WORLD_MOVES,
  type Ability,
  type Action,
  type ApproachSpec,
  type BeatSpec,
  type ChoiceSpec,
  type ChangePart,
  type Effects,
  type FactSpec,
  type FateSpec,
  type FreeSpec,
  type GoalSpec,
  type GameEvent,
  type ViewpointObserver,
  type ViewpointObservation,
  type ViewpointOptions,
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
  type Tiered,
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

export interface ImprovPlan {
  stat: Ability;
  difficulty: number;
  label: string;
  absurd: boolean;
  bold: boolean;
  deed?: string;
  target?: string;
  odd?: boolean;
  risk?: InputRisk;
  source: 'llm' | 'rule';
  meta: GmMeta;
}

/** GM 질문의 원문 관계와 이를 뒷받침하는 공개 근거. about는 별도 후보일 뿐이다. */
export interface Inquiry {
  question: string;
  subject: string;
  relation: string;
  answerType: string;
  evidence: { source: string; quote: string }[];
}

export type Interpretation =
  /** spoken: 사람에게 건넨 말이면 true, 행동을 적은 문장이면 false. 규칙 해석은 모른다. */
  /** scope: 원문이 후보 성취의 일부만 했을 때 실제로 한 부분. */
  | { kind: 'approach'; approach: string; item: string | null; spoken?: boolean; risk?: InputRisk; scope?: string; source: 'llm' | 'rule'; meta: GmMeta }
  /** to: 사람에게 건넨 말인지 아무에게도 안 한 혼잣말인지. 규칙 해석은 모른다. */
  /** shown: 말이 아니라 몸이 먼저 드러난 입력(눈물, 주저앉음). 판정 없이 곁의 사람이 그 모습을 보고 반응한다. */
  | { kind: 'talk'; tone?: TalkTone; to?: 'person' | 'self'; shown?: boolean; risk?: InputRisk; source: 'llm' | 'rule'; meta: GmMeta }
  /** play: 플레이 방법을 묻는 말. game: 게임 자체에 대한 말의 항목 id. about: 묻는 대상의 수첩 항목 id, 답이 없는 질문이면 ABOUT_UNKNOWN. */
  | { kind: 'ask'; play?: boolean; game?: string; about?: string; inquiry?: Inquiry | null; source: 'llm' | 'rule'; meta: GmMeta }
  /** odd: 상황에 뜬금없는 행동. 여우가 이때만 태클한다. */
  /** bold: 상대가 지나칠 수 없는 큰 행동(몸에 닿기, 겨누기). deed: 해석이 요약한 행동 한 문장(과거형). */
  /** 아무것도 시도하지 않는 입력. 판정 없이 장면이 흘러간다. */
  | { kind: 'idle'; source: 'rule' | 'llm'; meta: GmMeta }
  | ({ kind: 'improv' } & ImprovPlan)
  /** typed: 제안이 원문에서 확인한 부분 그대로다(검수 typed). 그런 작은 행동은 확인 없이 바로 굴린다. */
  | { kind: 'clarify'; message: string; proposal?: ImprovPlan; typed?: boolean; source: 'llm' | 'rule'; meta: GmMeta };

/** 아는 것 안에 답이 없는 질문(속마음, 이유, 앞일). */
export const ABOUT_UNKNOWN = 'none';

export interface GmLines {
  lines: Line[];
  meta: GmMeta;
}

export interface GmContext {
  scenario: Scenario;
  beat: BeatSpec;
  free: Pick<FreeSpec, 'situation' | 'goal' | 'speakers' | 'must_not' | 'state_guard' | 'echo_only' | 'talk_fallback' | 'deflect' | 'approaches' | 'goals' | 'neutral'>;
  state: Readonly<GameState>;
  text: string;
  displayed?: Extract<GameEvent, { type: 'line' }>;
  question?: boolean;
  /** 이야기 입력의 명시적인 말·행동 경계. GM 질문과 선택지 반응에는 없다. */
  input?: StoryInput;
  /** 말 없는 반응 뒤 장면을 진행한다. 상대의 짧은 한 줄만 받는다. */
  reaction?: boolean;
  /** reaction 의 입력이 몸 반응이 아니라 상대에게 건넨 말이다. */
  spoken?: boolean;
  tone?: TalkTone;
  /** 입력이 말이 아니라 몸이 먼저 드러난 모습이다. */
  shown?: boolean;
  /** upcoming은 뒤 고정 줄이다. action은 완료할 수 없는 시도로 묘사할 때만 참이다. 단순 동작 존재는 acted다. */
  interject?: { upcoming: string[]; action: boolean };
  /** "~있어?", "~할 수 있어?" 처럼 허락을 묻는 입력이다. */
  permission?: boolean;
  /** 질문의 대상(수첩 항목 id 또는 ABOUT_UNKNOWN). */
  about?: string;
  /** null은 관계 검수 실패가 이미 확인됐다는 뜻이다. 다시 호출하지 않는다. */
  inquiry?: Inquiry | null;
  /** 아무에게도 건네지 않은 혼잣말이다. */
  self?: boolean;
  /** 해석이 요약한 플레이어의 행동 한 문장. 검사 면제의 기준이다. */
  deed?: string;
  /** 이 세계에 없는 물건·힘을 쓰려 한 행동. 일어나지 않고, 나레이션이 실제 동작을 그리고 상대 인물이 성격대로 받아친다. */
  absurd?: boolean;
  /** 지금 상황과 동떨어진 딴짓(모래 먹기, 춤). 실제로 일어나지만 아무것도 시도하지 않으니 판정·보상 없이 아시나가 성격대로 반응한다. */
  odd?: boolean;
  /** reaction 의 입력이 감정·몸 반응이 아니라 아시나가 한 행동(선택지·행동 입력)이다. */
  acted?: boolean;
}

export interface NarrateContext extends GmContext {
  approach: ApproachSpec;
  roll: RollResult;
  outcome: Outcome;
  /** 코드가 뽑은 대가. GM 은 text 를 서술에 녹이기만 하고 효과는 엔진이 적용한다. */
  price?: PriceSpec;
  /** 기본 대실패의 실제 추가 한 칸. 실패 효과·선택 비용 뒤의 수치다. */
  fumble?: TrackChange;
  improv?: ImprovMark;
  /** 성공 서술이 확정할 수 있는 성취의 상한(목표 문구, 일부만 한 행동이면 그 부분). */
  bound?: string;
  /** 이번 판정으로 적용될 수치 변화(결과·대가·대실패 합). 서술은 이와 어긋나면 안 된다(체력이 줄었는데 다치지 않았다고 쓰지 않는다). */
  applied?: Partial<Record<Track, number>>;
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

/** 수첩 또는 원작 설명 장면에서 여는 수치. flag 공개 전에는 해당 수치의 시간·대가도 멈춘다. */
export function closedTrackGates(scenario: Scenario, state: Pick<GameState, 'flags'>) {
  return (scenario.sheet.reveal ?? []).filter((g) => state.flags[g.flag ?? noteFlag(g.note ?? '')] !== true);
}

/** 수첩에 적힌 항목인가. 숨길 것은 if 가 참일 때만, 나머지는 after 가 없거나 그 비트에 들어간 뒤다. */
export function noteOpen(note: NoteEntry, state: Pick<GameState, 'tracks' | 'abilities' | 'flags' | 'items'>): boolean {
  const ctx: CondContext = { tracks: state.tracks, abilities: state.abilities, flags: state.flags, items: state.items };
  if (note.if !== undefined && !evalCond(note.if, ctx)) return false;
  if (note.tier === 'hidden') return note.if !== undefined;
  return !note.after?.length || state.flags[noteFlag(note.id)] === true;
}

/** 지금 참인 사실(후드, 잃은 소지품, 이미 일어난 일). GM 입력과 검증이 함께 쓴다. */
export function goalAchieved(goal: Pick<GoalSpec, 'effects'>, state: Pick<GameState, 'flags'>): boolean {
  const flags = Object.entries(goal.effects?.flags ?? {});
  return flags.some(([, value]) => value === true) && flags.every(([key, value]) => state.flags[key] === value);
}

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
const CLOCK_FALLBACK = '해가 한 뼘 더 기울었다.';
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
/** 상대가 앞에 있을 때 이 긴장값 이상이면 판정 없는 턴의 주인공 기본 표정을 경계(wary)로 둔다. */
const WARY_TENSION = 2;
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
  /** 이번 턴이 시작될 때 이미 징조가 나간 작은 끝(act 가 복제한 상태마다). 엔진 하나를 여러 세션이 함께 쓰니 상태에 묶는다. */
  private readonly warnedAtTurn = new WeakMap<GameState, ReadonlySet<string>>();
  /** 이번 턴 판정이 성공(대가 있는 성공 포함)했다. 성공의 대가로 바로 작은 끝에 들어가지 않고 문턱 바로 위에 멈춘다. */
  private readonly succeededAtTurn = new WeakSet<GameState>();
  private readonly viewpointObservers = new WeakMap<GameState, ViewpointObserver>();
  private readonly observations = new WeakMap<GameEvent, ViewpointObservation>();

  private eventQueue(state: GameState, onEvent?: (event: GameEvent) => void, observer?: ViewpointObserver): GameEvent[] {
    const events: GameEvent[] = [];
    if (observer) this.viewpointObservers.set(state, observer);
    if (onEvent || observer) events.push = (...items) => {
      for (const event of items) {
        const observation = this.observations.get(event);
        if (observation) observer?.(observation);
        onEvent?.(event);
      }
      return Array.prototype.push.apply(events, items);
    };
    return events;
  }

  private observe(state: GameState, event: GameEvent, source: ViewpointObservation['source'] = 'fresh'): void {
    if (!this.viewpointObservers.has(state) || (event.type !== 'scene' && event.type !== 'line')) return;
    const { log, ...rest } = state;
    const length = log.length;
    this.observations.set(event, {
      event, source, state: structuredClone(rest), logLength: length,
      readLog: () => structuredClone(log.slice(0, length)),
    });
  }

  private metaSpeaker(speaker: string): boolean {
    const cast = this.scenario.cast[speaker];
    return cast?.style === 'gm' || (!cast && speaker === 'GM');
  }

  constructor(
    readonly scenario: Scenario,
    private readonly gm: GmPort,
    private readonly clock: () => number = Date.now,
    /** 실패 직후 행운을 물을지. 끄면 그냥 실패로 잇는다. */
    private readonly luckPrompt: boolean = false,
  ) {}

  newGame(seed: number, session: string, observer?: ViewpointObserver): { state: GameState; step: Step } {
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
      said: [],
      free: null,
      recent: [],
      ending: null,
      startedAt: now,
      playMs: 0,
      lastActiveAt: now,
      log: [],
    };
    this.record(state, { kind: 'start', seed: state.seed });
    const events = this.eventQueue(state, undefined, observer);
    this.enter(state, this.scenario.start, events, 0);
    return { state, step: this.step(state, events) };
  }

  resume(state: GameState, observer?: ViewpointObserver): Step {
    const beat = this.beatOf(state);
    const events = this.eventQueue(state, undefined, observer);
    const scene = this.sceneEvent(state, beat);
    // 저장된 권위 상태를 과거 각 줄의 상태 증거로 재구성한 것처럼 취급하지 않는다.
    this.observe(state, scene, 'resume');
    events.push(scene, ...beat.lines.filter((l) => !l.if || evalCond(l.if, this.ctx(state))).map((l) => this.lineEvent(this.resolveCgLine(l, state), 'script')));
    if (state.ending && beat.ending) events.push(this.endingEvent(beat));
    // 답을 기다리던 확인 창은 다시 띄운다. 안 띄우면 보이지 않는 창에 뒤의 "응"이 답이 된다.
    if (!state.ending && state.pendingIntent) events.push(this.intentEvent(state.pendingIntent));
    else if (!state.ending && state.pendingRisk) {
      // 처음 띄운 창의 글. 그 글을 적어 두기 전의 저장이면 그만두기 말의 경고 글을 쓴다.
      const warn = state.pendingRisk.warn ?? (this.scenario.risky ?? []).find((r) => r.quit)?.warn;
      if (warn) events.push({ type: 'confirm', kind: 'quit', text: warn });
    }
    if (beat.free && state.free) this.gm.prepare?.({ scenario: this.scenario, beat, free: beat.free, state });
    return this.step(state, events);
  }

  async act(prev: GameState, action: Action, onEvent?: (event: GameEvent) => void, viewpoint?: ViewpointOptions): Promise<{ state: GameState; step: Step }> {
    if (prev.ending && action.type !== 'interject' && action.type !== 'ask') throw new GameError('이미 끝난 이야기입니다. 결과 화면을 확인하세요.');
    const state = structuredClone(prev);
    if (action.type !== 'ask') this.tick(state);
    const beat = this.beatOf(state);
    // 이 턴이 시작될 때 이미 경고가 나간 작은 끝. 경고가 이번 턴에 처음 나온 작은 끝은 이번 턴에 끝내지 않는다.
    const warnedBefore = new Set((this.scenario.fates ?? []).filter((f) => state.flags[`경고_${f.id}`] === true).map((f) => f.id));
    this.warnedAtTurn.set(state, warnedBefore);
    const events = this.eventQueue(state, onEvent, viewpoint?.observer);
    // 의도 카드에 답하지 않고 다른 행동으로 넘어가면 그 카드는 끝난다. 뒤의 "응" 같은 입력이 옛 카드의 답이 되면 안 된다.
    if (state.pendingIntent && (action.type === 'choose' || action.type === 'approach' || action.type === 'interject')) this.dropIntent(state);
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
        if (viewpoint?.question) {
          const question = viewpoint.question;
          const projected = structuredClone(question.state);
          const prefix = projected.log.length;
          await this.askGm(projected, this.beatOf(projected), action.text, events, undefined, question.line);
          state.log.push(...projected.log.slice(prefix));
          if (projected.pendingRisk?.quit) {
            this.dropIntent(state);
            state.pendingRisk = projected.pendingRisk;
          }
        } else {
          await this.askGm(state, beat, action.text, events, this.sceneOf(action.scene));
        }
        break;
    }
    if (events.some((e) => e.type === 'notice' && e.kind === 'rewrite')) return { state: prev, step: this.step(prev, events) };
    // 확인 대기·거절은 시간과 운명을 포함해 pending 외에는 아무것도 소비하지 않는다.
    if (events.some((e) => e.type === 'confirm' && e.kind === 'intent') ||
      (prev.pendingIntent && !state.pendingIntent && state.log.length === prev.log.length)) {
      const held = structuredClone(prev);
      if (state.pendingIntent) held.pendingIntent = state.pendingIntent;
      else delete held.pendingIntent;
      if (state.pendingRisk) held.pendingRisk = state.pendingRisk;
      else delete held.pendingRisk;
      return { state: held, step: this.step(held, events) };
    }
    if (action.type !== 'ask') this.settleFate(state, events, warnedBefore);
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
      items: state.items.map((id) => this.itemView(id, state)).filter((i) => !this.scenario.sheet.items.find((s) => s.id === i.id)?.hidden),
      notes: this.notesOf(state),
      trackGate: closedTrackGates(this.scenario, state),
      tension: this.tensionOf(state),
      playMs: state.playMs,
    };
  }

  private notesOf(state: GameState): NoteView[] {
    const notes: NoteView[] = (this.scenario.notes ?? []).filter((n) => noteOpen(n, state)).map((n) => ({ id: n.id, kind: n.kind, name: n.name, text: n.text }));
    for (const id of state.items) {
      const item = this.scenario.sheet.items.find((i) => i.id === id);
      if (item && !item.hidden) notes.push({ id: `item:${id}`, kind: '소지품', name: item.name, text: this.itemView(id, state).desc });
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
    if (state.flags['후속_시작'] !== true && state.flags['체력_쓰러짐'] === true && this.scenario.sheet.collapseTo) {
      return { id: 'body_captured', when: 'flag:체력_쓰러짐', to: this.scenario.sheet.collapseTo };
    }
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
      if (fate.warn && (!warnedBefore.has(fate.id) || this.succeededAtTurn.has(state)) && this.holdAboveThreshold(state, fate)) continue;
      this.enter(state, fate.to, events, 0);
      return;
    }
  }

  /**
   * 장면에 들어가며 갈 작은 끝. settleFate 와 같은 불변식(한 번의 실패로는 끝나지 않는다)을 지킨다:
   * 판정 실패가 다음 장면으로 넘어가는 길이어도, 징조가 이번 턴에 처음 나온 작은 끝은 수치를 문턱 바로 위에 멈추고 장면으로 간다.
   */
  private fateOnEnter(state: GameState): FateSpec | undefined {
    const warnedBefore = this.warnedAtTurn.get(state);
    for (let fate = this.dueFate(state); fate; fate = this.dueFate(state)) {
      if (fate.warn && ((warnedBefore && !warnedBefore.has(fate.id)) || this.succeededAtTurn.has(state)) && this.holdAboveThreshold(state, fate)) continue;
      return fate;
    }
    return undefined;
  }

  /**
   * 이번 턴에 끝내지 않을 작은 끝(징조가 이번 턴 처음이거나 판정이 성공한 턴)의 문턱을 수치가 넘지 않게 적용 순간에 멈춘다.
   * 나중에 되돌리면 화면에는 문턱을 넘은 변화(의심 9→10)가 나간 뒤라 보이는 변화와 실제 값이 어긋난다.
   */
  private heldTo(state: GameState, key: Track, to: number): number {
    const warnedBefore = this.warnedAtTurn.get(state);
    if (!warnedBefore || state.ending) return to;
    for (const fate of this.scenario.fates ?? []) {
      if (!fate.warn || (warnedBefore.has(fate.id) && !this.succeededAtTurn.has(state))) continue;
      const hold = holdBefore(fate.when);
      if (!hold || hold.flag || hold.name !== key) continue;
      if (evalCond(fate.when, { ...this.ctx(state), tracks: { ...state.tracks, [key]: to } })) return hold.value;
    }
    return to;
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
    // 귀찌 결말 정책은 보류. 정식 결말 직전의 체력 포획·첩자 문턱만 먼저 정산한다.
    const terminalFate = beat.ending && !beat.ending.bad && beat.ending.id !== 'quit'
      ? state.flags['후속_시작'] !== true && state.flags['체력_쓰러짐'] === true && this.scenario.sheet.collapseTo
        ? { to: this.scenario.sheet.collapseTo }
        : this.scenario.fates?.find((f) => f.id === 'spy_cut' && evalCond(f.when, this.ctx(state)) && !(this.succeededAtTurn.has(state) && this.holdAboveThreshold(state, f)))
      : undefined;
    const fate = beat.ending ? terminalFate : this.fateOnEnter(state);
    const fated = fate ? this.scenario.beats[fate.to] : undefined;
    if (fated) beat = fated;
    state.beat = beat.id;
    // 작은 끝 줄이 상대가 곁에 있는지로 갈릴 수 있게, 마지막 장면의 출연을 적어 둔다(결말 비트는 암전이라 덮어쓰지 않는다).
    if (!beat.ending && this.scenario.stage) state.flags['상대_곁'] = hasCharacter(this.scenario, beat, this.scenario.stage.who);
    state.free = beat.free ? { beat: beat.id, talks: 0, rolls: 0, turns: 0 } : null;
    this.record(state, { kind: 'beat', beat: beat.id, title: beat.title });
    const opening: GameEvent[] = [];
    const scene = this.sceneEvent(state, beat);
    this.observe(state, scene);
    opening.push(scene);
    const onEnter: Effects = { ...beat.effects, tracks: { ...beat.effects?.tracks } };
    if (beat.threat && state.flags[`위협_${beat.threat}`] !== true) {
      onEnter.tracks = { ...onEnter.tracks, 정신력: (onEnter.tracks?.정신력 ?? 0) - 1 };
      onEnter.flags = { ...onEnter.flags, [`위협_${beat.threat}`]: true };
    }
    if (beat.time && onEnter.tracks) onEnter.tracks.귀찌 = (onEnter.tracks.귀찌 ?? 0) - beat.time;
    // 들어서며 일어나는 변화를 먼저 그린다. 앞 장면에서 나온 줄은 되풀이하지 않는다.
    for (const line of beat.lead ?? []) if (!state.spoken?.[line.speaker]?.includes(line.text)) this.say(state, line, 'script', opening);
    this.applyEffects(state, onEnter, opening);
    const lastLead = opening.findLast((event) => event.type === 'line' && !this.metaSpeaker(event.speaker));
    this.observe(state, lastLead ?? scene);
    events.push(...opening);
    // 장면 검사: 끼어드는 일은 장면 줄 앞에, 달라진 결은 장면 줄 뒤에 붙는다.
    const twist = beat.ending ? null : this.sceneCheck(state, beat, events);
    if (twist?.result === 'interrupt' && twist.spec) this.playTwist(state, twist.spec, events);
    // 플레이어가 앞 장면에서 먼저 해 버린 일을 그린 원작 줄은 되풀이하지 않는다.
    const preempted = new Set(state.preempted ?? []);
    for (const line of beat.lines) {
      const hero = this.scenario.cast[line.speaker]?.lore === this.scenario.sheet.name;
      if (!hero || !preempted.has(normalizeKo(line.text))) this.say(state, line, 'script', events);
    }
    if (twist?.result === 'altered' && twist.spec) this.playTwist(state, twist.spec, events);
    // 처음 보는 사람·장소의 한 줄은 그 장면에서 처음 보이는 순간(장면 대사) 뒤에 붙인다.
    this.openNotes(state, beat, events);
    this.sayCallback(state, beat, events);
    this.sayGuide(state, beat, events);
    if (beat.ending) {
      // 행운을 묻던 중 그만두기로 끝나면 묻던 창은 버린다. 남아 있으면 끝난 판에 행운 창이 뜬다.
      delete state.pendingLuck;
      delete state.pendingRisk;
      delete state.pendingIntent;
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
    const delta = tier === 'hit' || tier === 'crit' ? -1 : tier === 'miss' || tier === 'fumble' ? 1 : 0;
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
      if (roll.tier === 'fumble') this.bumpTension(state, roll.tier);
      const outcome = this.outcomeOf(choice.outcomes, roll.tier);
      const fumble = roll.tier === 'fumble' && !choice.outcomes.fumble
        ? this.fumbleChange(state, [outcome.effects]) : undefined;
      for (const line of outcome.lines) this.say(state, line, 'script', events);
      this.applyEffects(state, outcome.effects, events);
      if (fumble) this.applyEffects(state, { tracks: { [fumble.key]: fumble.to - fumble.from } }, events);
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
    if (state.tracks.체력 <= 1 && stat === '근력') applied.push({ label: '지친 몸', value: -1 });
    if (state.flags['정신력_충격'] === true) {
      applied.push({ label: '겁에 질림', value: -2 });
      delete state.flags['정신력_충격'];
    } else if (state.tracks.정신력 <= 1 && (stat === '매력' || stat === '재치')) {
      applied.push({ label: '흔들리는 마음', value: -1 });
    }
    const { roll, rng } = roll2d6(state.rng, label, stat, state.abilities[stat], applied);
    state.rng = rng;
    if (roll.tier !== 'fumble') this.bumpTension(state, roll.tier);
    if (state.free?.beat === beat.id) {
      this.progressTurns(state);
      state.free.rolls += 1;
    }
    this.record(state, { kind: 'check', beat: beat.id, roll });
    const hero = this.heroFace(beat, roll.tier);
    events.push({ type: 'roll', ...roll, tierLabel: TIER_LABEL[roll.tier], ...(hero ? { hero } : {}) });
    return roll;
  }

  /**
   * 판정 결과에는 주인공 줄이 없어 입식 표정을 아무도 정하지 않는다(저장본의 smile 이 칼 앞에서도 남았다).
   * 상황 규칙: (대)성공은 해낸 뒤의 능청(smug), 대가 있는 성공은 치른 대가 앞의 경계(wary),
   * 실패는 상대가 있으면 겁(scared), 혼자면 당황(flustered). 뒤에 오는 주인공 줄의 face 가 있으면 그것이 덮는다.
   */
  private heroFace(beat: BeatSpec, tier: RollResult['tier']): { speaker: string; face: string } | undefined {
    return this.hero(tier === 'hit' || tier === 'crit' ? 'smug' : tier === 'mixed' ? 'wary' : facesPerson(this.scenario, beat) ? 'scared' : 'flustered');
  }

  private hero(face: string): { speaker: string; face: string } | undefined {
    const entry = Object.entries(this.scenario.cast).find(([, c]) => c.style === 'speech' && c.lore === this.scenario.sheet.name);
    if (!entry) return undefined;
    return face === 'neutral' || entry[1].faces?.includes(face) ? { speaker: entry[0], face } : undefined;
  }

  /**
   * 해석이 끝난 입력을 화면에 알린다. as: 되짚기 줄이 말인지 행동인지(acted 와 같은 분류, 가만히 있기는 행동).
   * hero: 판정이 없는 턴의 주인공 기본 표정. 이 비트의 직전 판정이 실패·대가면 그 표정(scared/flustered/wary)을 잇고,
   * 아니면 상대가 앞에 있고 긴장이 2 이상인 위협 장면은 경계(wary, 원작 1화 칼 장면 — docs/lead_check59/faces_survey.md), 그 밖은 neutral.
   */
  private heard(state: GameState, beat: BeatSpec, read: Interpretation, text: string, events: GameEvent[]): void {
    const input = parseStoryInput(text);
    const as = input.kind === 'valid' && input.action && input.speech ? 'mixed'
      : read.kind === 'idle' || this.acted(read, text) ? 'action' : 'speech';
    const last = state.log.findLast((e): e is Extract<LogEntry, { kind: 'check' }> => e.kind === 'check' && e.beat === beat.id)?.roll.tier;
    const hero = last === 'miss' || last === 'fumble' || last === 'mixed' ? this.heroFace(beat, last)
      : this.hero(facesPerson(this.scenario, beat) && this.tensionOf(state) >= WARY_TENSION ? 'wary' : 'neutral');
    events.push({ type: 'heard', as, ...(hero ? { hero } : {}) });
  }

  /** 규칙은 먼저 설명하지 않는다. 등급이 처음 나온 직후에 그 숫자로 한 줄만 말한다. */
  private explainTier(state: GameState, roll: RollResult, events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    const flag = `설명_${roll.tier}`;
    if (!gm || state.flags[flag] === true) return;
    const sum = `${roll.dice[0]}+${roll.dice[1]}에 ${roll.stat} ${roll.statValue >= 0 ? '+' : ''}${roll.statValue}${roll.mods.length ? ', 보정까지' : ''}, 합 ${roll.total}.`;
    const meaning = roll.tier === 'crit' ? '6이 둘이면 대성공, 좋은 수치 변화가 한 칸 더 커져.' : roll.tier === 'fumble' ? '1이 둘이면 대실패야. 실패에 실제 불이익 한 칸이 더 붙어.' : roll.tier === 'hit' ? '10 이상이면 원하는 대로 돼.' : roll.tier === 'mixed' ? '7~9는 해내지만 대가가 붙어.' : '6 이하는 실패야.';
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
      this.dropIntent(state);
    }
    if (this.confirmQuit(state, text, events) !== null) return;
    await this.freeInputText(state, beat, free, text, events);
  }

  private async freeInputText(state: GameState, beat: BeatSpec, free: FreeSpec, whole: string, events: GameEvent[]): Promise<void> {
    const progress = state.free;
    if (!progress) throw new GameError('지금은 자유 입력을 받을 수 없습니다.');
    const text = whole;
    const newly: string[] = [];
    const input = parseStoryInput(text);
    const ctx: GmContext = { scenario: this.scenario, beat, free, state, text, input, acted: input.kind === 'valid' && Boolean(input.action), spoken: input.kind === 'valid' && Boolean(input.speech) };
    const read0 = await this.storyReading(ctx, events);
    if (!read0) return;
    // 되묻는 해석의 범위 제안이 원문에서 확인한 부분 그대로(작은 행동)라면 확인할 것이 없다. 그 범위로 바로 굴린다.
    // 확인 창은 큰 행동(bold: 몸에 닿기·무기 등)에만 남는다(resume90 6차).
    const reading: Interpretation = read0.kind === 'clarify' && read0.typed === true && read0.proposal && !read0.proposal.bold ? { ...read0.proposal, kind: 'improv' } : read0;
    if (this.planInput(state, beat, free, reading, text, events)) return;
    this.recordGm(state, beat, 'interpret', reading.meta);
    let read: Interpretation = reading.kind === 'ask' && !gmSpeakerOf(this.scenario) ? { kind: 'talk', source: reading.source, meta: reading.meta } : reading;
    this.heard(state, beat, read, text, events);

    if (this.bounce(state, beat, ctx, read.source, events)) {
      return;
    }
    if (read.kind === 'ask') {
      // 이야기 입력칸에 적은 질문은 여우가 받지 않는다. 화면이 질문 모드(GM 단추)로 안내한다.
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'ask', approach: null, item: null, source: read.source });
      events.push({ type: 'notice', kind: 'ask' });
      return;
    }
    const guard = this.guardRisk(state, beat, read, text, true, events);
    if (guard === 'refused') {
      await this.worldMove(state, beat, free, events, false);
      return;
    }
    const warned = guard === 'warned';
    if (guard === 'self') read = { kind: 'talk', to: 'self', source: read.source, meta: read.meta };

    if (read.kind === 'idle') {
      await this.letSceneFlow(state, beat, free, text, read.source, events);
      return;
    }
    if (!(read.kind === 'talk' && (read.to === 'self' || read.shown))) newly.push(...this.noteSaid(state, assertedSpeech(text, read.kind === 'talk' || (read.kind === 'approach' && read.spoken === true))));
    if (read.kind === 'talk') {
      const self = read.to === 'self';
      const person = !self && !read.shown && !isNoise(text);
      if (person) {
        state.flags['말함'] = true;
        this.noteHeard(state, beat, text, this.acted(read, text));
      }
      if (!person && free.idle?.threat && progress.talks >= 1) {
        await this.letSceneFlow(state, beat, free, text, read.source, events, !self && !read.shown);
        return;
      }
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'talk', approach: null, item: null, source: read.source });
      const key = text.replace(/[\s.,!?…~]/g, '');
      const repeated = key === progress.lastInput;
      progress.lastInput = key;
      progress.talks += repeated ? 2 : 1;
      const tone: TalkTone = read.tone === 'deflect' ? 'deflect' : repeated ? 'repeat' : 'plain';
      const reply = await this.gm.talk({ ...ctx, tone, ...(self ? { self } : {}), ...(read.shown ? { shown: true } : {}) });
      this.recordGm(state, beat, 'talk', reply.meta, reply.lines);
      this.followGm(state, reply.meta, events);
      for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
      // 상대에게 건넨 말은 무시도·시간 끌기로 대신 소비하지 않는다. 다만 장면에 들을 사람이 없으면(멀리 있는 사람에게 외침)
      // 아무도 받지 않는 말이라, 거듭되면 장면의 무브(재촉·시간·머뭇)가 일어난다.
      if (!person || !this.listenerIn(free)) await this.worldMove(state, beat, free, events);
      return;
    }
    await this.applyReading(state, beat, free, read, text, events, warned, { identity: guard === 'identity', flags: newly });
  }

  /** 분류기는 뜻을 읽고, 말·행동은 입력 경계가 정한다. 다시 적기 안내는 턴을 쓰지 않는다. */
  private async storyReading(ctx: GmContext, events: GameEvent[]): Promise<Interpretation | null> {
    const input = ctx.input ?? parseStoryInput(ctx.text);
    if (input.kind === 'invalid') {
      this.say(ctx.state, { speaker: gmSpeakerOf(this.scenario) ?? 'GM', text: input.message }, 'script', events);
      events.push({ type: 'notice', kind: 'rewrite' });
      return null;
    }
    const read = await this.gm.interpret({ ...ctx, input });
    if (!input.explicit && isActionText(ctx.text) && (read.kind === 'improv' || read.kind === 'clarify' || read.kind === 'idle' || (read.kind === 'approach' && read.spoken !== true) || (read.kind === 'talk' && (read.risk === 'unmask' || read.risk === 'attack')))) {
      this.say(ctx.state, { speaker: gmSpeakerOf(this.scenario) ?? 'GM', text: `행동은 ( ) 안에 적어 줘! 예: (${ctx.text})` }, 'script', events);
      events.push({ type: 'notice', kind: 'rewrite' });
      return null;
    }
    switch (read.kind) {
      case 'clarify':
        return read;
      case 'approach': {
        const { risk, ...approach } = read;
        return { ...approach, spoken: Boolean(input.speech), ...((input.action || risk === 'identity') && risk ? { risk } : {}) };
      }
      case 'improv':
        return input.action ? read : { kind: 'talk', to: 'person', source: read.source, meta: read.meta };
      case 'idle':
        if (input.action && !input.speech) return read;
        return { kind: 'talk', to: 'person', source: read.source, meta: read.meta };
      case 'ask':
        if (!input.action) return read;
        return { kind: 'talk', to: 'person', shown: !input.speech, source: read.source, meta: read.meta };
      case 'talk': {
        return { kind: 'talk', to: input.speech ? 'person' : read.to ?? 'person', ...(read.tone ? { tone: read.tone } : {}), ...(read.risk && (input.action || read.risk === 'identity') ? { risk: read.risk } : {}), ...(!input.speech ? { shown: true } : {}), source: read.source, meta: read.meta };
      }
    }
  }

  /**
   * 질문 모드(GM 단추). 여우가 말하는 유일한 자리다: 플레이 방법, 규칙, 수첫 안의 배경, "이거 맞아?", 허락.
   * 이야기 밖 말이라 입력 기록(said)·판정·참을성을 쓰지 않는다. "그만할래" 는 확인 창으로 간다.
   */
  private async askGm(state: GameState, stateBeat: BeatSpec, raw: string, events: GameEvent[], scene?: BeatSpec, displayed?: Extract<GameEvent, { type: 'line' }>): Promise<void> {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT_CHARS);
    if (!text) throw new GameError('여우에게 물을 말을 입력해 주세요.');
    if (!gmSpeakerOf(this.scenario)) throw new GameError('이 시나리오에는 진행자가 없습니다.');
    // 대사가 흐르는 중에 물으면 서버는 이미 앞 자리에 가 있다. 화면에 보이는 장면을 기준으로 답한다.
    const beat = scene ?? stateBeat;
    const current = beat.free ?? beat.conversation;
    const free: GmContext['free'] = current ? { ...current, approaches: 'approaches' in current ? current.approaches : [] } : {
      situation: beat.situation ?? beat.title, goal: '', speakers: [...new Set(Object.values(beat.cast ?? {}).filter((speaker): speaker is string => typeof speaker === 'string'))],
      must_not: [], state_guard: [], echo_only: [], talk_fallback: [], deflect: [], approaches: [],
    };
    events.push({ type: 'echo', text });
    events.push({ type: 'heard', as: 'speech' });
    if (this.confirmQuit(state, text, events) !== null) return;
    const ctx: GmContext = { scenario: this.scenario, beat, free, state, text, question: true, ...(displayed ? { displayed } : {}) };
    if (this.bounce(state, beat, ctx, 'rule', events)) return;
    const reading = await this.gm.interpret(ctx);
    this.recordGm(state, beat, 'interpret', reading.meta);
    if (reading.kind === 'ask' && reading.game !== undefined) {
      this.sayGame(state, beat, reading.game, text, reading.source, events);
      return;
    }
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'ask', approach: null, item: null, source: reading.source });
    if (reading.kind === 'ask' && reading.play) {
      this.sayHowToPlay(state, { ...free, approaches: free.approaches }, events);
      return;
    }
    const about = reading.kind === 'ask' && reading.about !== undefined ? { about: reading.about } : {};
    const reply = await this.gm.explain({ ...ctx, ...about, ...(reading.kind === 'ask' && reading.inquiry !== undefined ? { inquiry: reading.inquiry } : {}), ...(isPermission(text) ? { permission: true } : {}) });
    this.recordGm(state, beat, 'explain', reply.meta, reply.lines);
    for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
  }

  /** 플레이 방법을 묻는 말에 여우가 답한다(질문 모드). 입력칸이 있으면 지금 할 수 있는 수도 알려 준다. */
  private sayHowToPlay(state: GameState, free: Pick<FreeSpec, 'approaches'>, events: GameEvent[]): void {
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

  /** 게임 자체에 대한 말에 여우가 고정 줄로 답한다(질문 모드). 이야기 속 말이 아니니 판정도 시간도 들지 않는다. */
  private sayGame(state: GameState, beat: BeatSpec, id: string, text: string, source: 'llm' | 'rule', events: GameEvent[]): void {
    const gm = gmSpeakerOf(this.scenario);
    const help = this.scenario.gameHelp?.find((h) => h.id === id);
    if (!gm || !help) throw new Error(`없는 게임 항목: ${id}`);
    const helpTrack = help.track;
    if (helpTrack && closedTrackGates(this.scenario, state).some((g) => g.tracks.includes(helpTrack))) {
      this.say(state, { speaker: gm, text: '그건 아직 몰라.' }, 'script', events);
      return;
    }
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
  private guardRisk(state: GameState, beat: BeatSpec, read: Interpretation, text: string, canRoll: boolean, events: GameEvent[]): 'refused' | 'warned' | 'self' | 'identity' | 'go' {
    if (read.kind === 'ask' || read.kind === 'idle' || read.kind === 'clarify' || (read.kind === 'talk' && read.to === 'self')) return 'go';
    const risk = read.risk ?? (this.scenario.identity && discloses(text, this.scenario.identity.words) ? 'identity' : undefined);
    if (!risk) return 'go';
    // 이 세계에 없는 물건·힘은 일어나지 않으니 위험도 없다(총을 쏘는 시늘에 맨손 징조를 내지 않는다).
    if (read.kind === 'improv' && read.absurd) return 'go';
    if (risk === 'identity') {
      const identity = this.scenario.identity;
      if (!identity || !discloses(text, identity.words)) return 'go';
      if (state.flags[IDENTITY_OMEN_FLAG] !== true) {
        state.flags[IDENTITY_OMEN_FLAG] = true;
        for (const line of identity.omen) this.say(state, line, 'script', events);
      }
      // 들을 사람이 없으면 혼잇말로 흐른다. 있으면 큰 행동: 수치와 플래그를 바꾸고 인물이 성격대로 받는다(facts 신분_노출).
      if (!hasCharacter(this.scenario, beat, identity.with)) return 'self';
      // 굴리기 전에 의도 카드로 묻는 큰 행동이면 대가는 "그래"라고 답한 뒤에 붙인다("다른 뜻"이면 아무 대가 없이 다시 적는다).
      if (canRoll && read.kind === 'improv' && read.bold && read.deed) return 'identity';
      this.applyEffects(state, identity.effects, events);
      return 'go';
    }
    if (risk !== 'attack') {
      const refuse = this.scenario.refuse?.find((r) => r.id === risk && !r.unless.includes(beat.id));
      if (!refuse || isQuestionText(text)) return 'go';
      this.record(state, { kind: 'input', beat: beat.id, text, result: 'talk', approach: null, item: null, source: read.source });
      for (const line of refuse.lines) this.say(state, line, 'script', events);
      return 'refused';
    }
    const danger = this.scenario.danger;
    if (read.kind === 'talk' || !canRoll || !danger || isPermission(text) || !hasCharacter(this.scenario, beat, danger.with)) return 'go';
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
    if (!text) return [];
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

  /** 답하지 않은 의도 카드를 버린다. 카드에 걸린 입력도 이야기에 들어가지 않았다. */
  private dropIntent(state: GameState): void {
    const pending = state.pendingIntent;
    if (!pending) return;
    delete state.pendingIntent;
    // 새 계약의 카드는 발화·플래그를 아직 기록하지 않았다. 아래 정리는 옛 저장 카드만 필요하다.
    if (pending.target !== undefined) return;
    const said = assertedSpeech(pending.text);
    if (said && state.said?.at(-1) === said) state.said = state.said.slice(0, -1);
    for (const flag of pending.flags ?? []) delete state.flags[flag];
  }

  private intentEvent(pending: NonNullable<GameState['pendingIntent']>): GameEvent {
    // 되묻는 고정 줄(message)은 확인 창에 넣지 않는다. '이 범위로 시도할까?'와 부딪친다(resume90 6차).
    return { type: 'confirm', kind: 'intent', text: pending.message ? `이번에 성공하면: ${pending.deed}\n이 범위로 시도할까?` : `${pending.deed} — 이렇게 하는 거야?`, yes: '그래', no: '다른 뜻' };
  }

  /** 굴리기 전 목표와 독립 비용을 확정한다. 모르는 지속 목표를 local로 추측하지 않는다. */
  private planInput(state: GameState, beat: BeatSpec, free: FreeSpec, read: Interpretation, text: string, events: GameEvent[]): boolean {
    if (read.kind !== 'clarify' && read.kind !== 'improv') return false;
    if (read.kind === 'improv' && (read.absurd || (read.odd && !read.bold && !read.risk))) return false;
    const plan = read.kind === 'clarify' ? read.proposal : read;
    const problem = plan ? this.planProblem(state, free, plan) : read.kind === 'clarify' ? read.message : '';
    if (!plan || problem) {
      this.say(state, { speaker: gmSpeakerOf(this.scenario) ?? 'GM', text: problem || '이번에 이루려는 일을 다시 적어 줘.' }, 'script', events);
      events.push({ type: 'notice', kind: 'rewrite' });
      return true;
    }
    if (read.kind === 'clarify' || plan.bold) {
      state.pendingIntent = {
        text, deed: plan.deed ?? '', target: plan.target, stat: plan.stat, difficulty: plan.difficulty,
        bold: plan.bold, source: plan.source, ...(plan.risk ? { risk: plan.risk } : {}),
        ...(read.kind === 'clarify' ? { message: read.message } : {}),
      };
      events.push(this.intentEvent(state.pendingIntent));
      return true;
    }
    return false;
  }

  private planProblem(state: GameState, free: FreeSpec, plan: Pick<ImprovPlan, 'target' | 'deed' | 'bold'> & { risk?: InputRisk }, technique = this.improvOutcomes(free, plan.bold, plan.risk === 'attack').mixed): string | undefined {
    if (!plan.target || !plan.deed) return '행동의 성공 목표를 확인하지 못했어. 이루려는 일을 다시 적어 줘.';
    const goal = plan.target === 'local' ? undefined : free.goals?.[plan.target];
    if (plan.target !== 'local' && (!goal || (goal.if && !evalCond(goal.if, this.ctx(state))))) return '지금 이 장면에서 그 목표의 후속 상태를 처리할 수 없어. 다른 목표를 적어 줘.';
    if (goal && goalAchieved(goal, state)) return '그 목표는 이미 이뤘어. 지금 새로 이루려는 일이 있다면 다시 적어 줘.';
    const outcome = goal ? { ...technique, price: goal.price } : technique;
    const costContext = { ...this.ctx(state), lockedTracks: closedTrackGates(this.scenario, state).filter(g => g.flag !== undefined).flatMap(g => g.tracks) };
    if (hasInlineCost(technique.effects)) {
      if ((outcome.price?.length ?? free.prices?.filter(p => p.weight === 'soft').length ?? 0) > 0) return '이 행동의 비용이 중복 지정되어 있어 지금은 굴릴 수 없어.';
      return hasInlineCost(technique.effects, costContext) ? undefined : '지금은 이 목표를 유지하면서 낼 수 있는 독립 비용이 없어. 다른 행동을 골라 줘.';
    }
    const prices = priceCandidates(free, outcome, 'mixed', costContext, state.flags, [], undefined, Boolean(assertedSpeech(plan.deed)), true);
    if (!prices.length) return '지금은 이 목표를 유지하면서 낼 수 있는 독립 비용이 없어. 다른 행동을 골라 줘.';
    return undefined;
  }

  /** 화면이 보낸 장면 이름. 시나리오에 없는 이름(__proto__ 같은 것 포함)이면 없다. */
  private sceneOf(id: string | null | undefined): BeatSpec | undefined {
    return id && Object.hasOwn(this.scenario.beats, id) ? this.scenario.beats[id] : undefined;
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
    this.record(state, { kind: 'input', beat: beat.id, text: ctx.text, result: ctx.question ? 'ask' : 'bounced', approach: null, item: null, source });
    let text: string;
    if (hit.reason === 'unknown') {
      const first = state.flags[READER_FLAG] !== true;
      if (!state.ending) state.flags[READER_FLAG] = true;
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
    return facesPerson(this.scenario, beat);
  }

  /**
   * 이 세계에 없는 물건·힘을 쓰려 한 행동(absurd)과 상황과 동떨어진 딴짓(odd). 판정·수치·다음 비트 없이 나레이션이 실제 동작을 세계의 말로 그리고
   * 상대 인물이 성격대로 받아친다(혼자면 나레이션·속마음). 여우는 말하지 않는다. 말 걸기와 같이 셈해 거듭하면 세계가 움직인다.
   * 인물의 기억(heard)에는 해석이 세계의 말로 요약한 동작(deed)만 남긴다 — 세계 밖 낱말은 뒤 장면 프롬프트에 들어가지 않는다.
   */
  private async absurdAct(state: GameState, beat: BeatSpec, free: FreeSpec, read: Interpretation & { kind: 'improv' }, text: string, events: GameEvent[]): Promise<void> {
    const progress = state.free;
    if (!progress) throw new Error(`${beat.id}: 자유 입력 진행 상태가 없습니다`);
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'talk', approach: null, item: null, source: read.source });
    const self = !this.facing(beat);
    if (!self) this.noteHeard(state, beat, read.deed ?? '품을 더듬었지만 잡히는 것이 없었다', true);
    const input = parseStoryInput(text);
    if (!self && input.kind === 'valid' && input.explicit && input.speech) this.noteHeard(state, beat, input.speech, false);
    progress.lastInput = text.replace(/[\s.,!?…~]/g, '');
    if (!read.absurd) progress.talks += 1;
    const ctx: GmContext = { scenario: this.scenario, beat, free, state, text, input, acted: true, spoken: input.kind === 'valid' && Boolean(input.speech), ...(read.absurd ? { absurd: true } : { odd: true }), ...(self ? { self } : {}), ...(read.deed ? { deed: read.deed } : {}) };
    const reply = await this.gm.talk(ctx);
    this.recordGm(state, beat, 'talk', reply.meta, reply.lines);
    if (!read.absurd) this.followGm(state, reply.meta, events);
    for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
    if (!read.absurd) await this.worldMove(state, beat, free, events);
  }

  private noteHeard(state: GameState, beat: BeatSpec, text: string, action: boolean): void {
    if (!this.facing(beat)) return;
    const input = parseStoryInput(text);
    const heard = input.kind === 'valid' && input.explicit
      ? [...(input.action ? [{ text: input.action, action: true }] : []), ...(input.speech ? [{ text: input.speech, action: false }] : [])]
      : [{ text, action }];
    state.heard = [...(state.heard ?? []), ...heard].slice(-SAID_KEEP);
    const spoken = assertedSpeech(text, !action);
    if (heard.some((h) => !h.action) && spoken) {
      state.flags[`말함_${beat.id}`] = true;
      this.noteTalked(state, text);
    }
  }

  /**
   * 되받기 플래그(말_상인 등)는 게임이 확정한 주장(고른 접근법·대본 경로의 플래그)으로만 선다.
   * 자유 입력 원문 낱말이나 모델이 짐작한 주장으로는 세우지 않는다(리드 결정, resume90 3차 5번).
   */
  /** 대사 도중 끼어든 입력. 이야기 자리는 그대로 두고 답한 뒤, 뒤의 고정 줄 가운데 이 입력으로 어긋나게 된 줄을 뺀다. */
  private async interject(state: GameState, stateBeat: BeatSpec, action: Extract<Action, { type: 'interject' }>, events: GameEvent[]): Promise<void> {
    const raw = action.text.replace(/\s+/g, ' ').trim().slice(0, MAX_INPUT_CHARS);
    if (!raw) throw new GameError('행동이나 대사를 입력해 주세요.');
    const scene = this.sceneOf(action.scene) ?? stateBeat;
    const lastShown = action.shown.at(-1)?.speaker;
    const toFox = lastShown !== undefined && this.scenario.cast[lastShown]?.style === 'gm';
    if (toFox) {
      events.push({ type: 'echo', text: raw }, { type: 'notice', kind: 'ask' });
      return;
    }
    if (scene.conversation) {
      if (scene.id !== stateBeat.id || state.pendingLuck || state.ending || action.pending.length > 0) throw new GameError('현재 장면의 대사를 다 읽은 뒤 입력해 주세요.');
      const conversation = scene.conversation;
      const input = parseStoryInput(raw);
      // 다른 장에서 다른 사람에게 했던 말과 비공개 궁정 대화를 이 응답자의 기억으로 주지 않는다.
      const listeners = new Set(conversation.speakers.filter((key) => this.scenario.cast[key]?.style === 'speech').map((key) => this.scenario.cast[key]?.lore));
      const heard = state.log.flatMap((entry) => {
        if (entry.kind !== 'input' || entry.result !== 'talk') return [];
        const previous = this.scenario.beats[entry.beat]?.conversation;
        if (!previous?.speakers.some((key) => this.scenario.cast[key]?.style === 'speech' && listeners.has(this.scenario.cast[key]?.lore))) return [];
        const prior = parseStoryInput(entry.text);
        return prior.kind === 'valid' ? [
          ...(prior.action ? [{ text: prior.action, action: true }] : []),
          ...(prior.speech ? [{ text: prior.speech, action: false }] : []),
        ] : [];
      }).slice(-SAID_KEEP);
      const ctx: GmContext = {
        scenario: this.scenario, beat: scene, free: { ...conversation, approaches: [] },
        state: { ...state, heard, recent: [] }, text: raw, input, acted: input.kind === 'valid' && Boolean(input.action),
        spoken: input.kind === 'valid' && Boolean(input.speech),
        interject: { upcoming: [], action: false },
      };
      events.push({ type: 'echo', text: raw });
      if (this.confirmQuit(state, raw, events) !== null) return;
      const read = await this.storyReading(ctx, events);
      if (!read) return;
      if (this.bounce(state, scene, ctx, read.source, events)) {
        events.push({ type: 'notice', kind: 'rewrite' });
        return;
      }
      // 이 자리는 인물과의 대화다. 세계 질문은 그 인물이 받고, 게임 조작 질문만 질문 모드로 보낸다.
      if (read.kind === 'ask' && (read.game !== undefined || read.play)) {
        events.push({ type: 'notice', kind: 'ask' });
        return;
      }
      if (read.kind === 'clarify' || read.kind === 'approach' ||
        (read.kind === 'improv' && !read.absurd && !read.odd && read.target !== 'local') ||
        ('risk' in read && read.risk !== undefined)) {
        this.say(state, { speaker: gmSpeakerOf(this.scenario) ?? 'GM', text: read.kind === 'clarify' ? read.message : '이 자리에서는 지속되는 결과를 확정할 수 없어. 지금 할 말이나 즉각적인 몸짓으로 범위를 다시 적어 줘.' }, 'script', events);
        events.push({ type: 'notice', kind: 'rewrite' });
        return;
      }
      const reply = await this.gm.talk({
        ...ctx, ...(input.kind === 'valid' && !input.speech ? { shown: true } : {}),
        tone: read.kind === 'talk' ? read.tone ?? 'plain' : 'plain',
        ...(read.kind === 'improv' ? { absurd: read.absurd, odd: read.odd, deed: read.deed } : {}),
      });
      if (reply.meta.fallback || reply.lines.length === 0) throw new GameError('대화 응답을 만들지 못했습니다. 다시 입력하거나 계속을 골라 주세요.');
      if (reply.lines.some((line) => !conversation.speakers.includes(line.speaker))) throw new GameError('현재 대화에 없는 화자의 응답입니다.');
      this.recordGm(state, scene, 'interpret', read.meta);
      this.record(state, { kind: 'input', beat: scene.id, text: raw, result: 'talk', approach: null, item: null, source: read.source });
      this.heard(state, scene, read, raw, events);
      if (input.kind === 'valid' && input.speech) this.noteSaid(state, input.speech);
      this.noteHeard(state, scene, raw, input.kind === 'valid' && Boolean(input.action));
      this.recordGm(state, scene, 'talk', reply.meta, reply.lines);
      for (const line of reply.lines) this.say(state, { ...line, cg: conversation.cg }, 'gm', events);
      events.push({ type: 'revise', drop: [], jump: true });
      this.enter(state, this.route(state, conversation.next, scene.id), events, 0);
      return;
    }
    // 화면이 서버보다 뒤에 있을 수 있다. 보이는 장면의 설정을 먼저 쓴다.
    const free = scene.free ?? stateBeat.free ?? this.lastFree(state);
    if (!free) throw new GameError('지금은 말할 수 없습니다.');
    events.push({ type: 'echo', text: raw });
    const quit = this.confirmQuit(state, raw, events);
    if (quit !== null) {
      if (quit === 'quit') events.push({ type: 'revise', drop: action.pending.map((p) => p.i), jump: true });
      return;
    }
    if (state.ending) {
      // 결말 줄이 흐르는 중에 끼어든 말. 인물이 말로 받기만 하고 판(수치·플래그·선택 기록)은 그대로 둔다.
      const input = parseStoryInput(raw);
      const ctx: GmContext = { scenario: this.scenario, beat: scene, free, state, text: raw, input, interject: { upcoming: action.pending.map((p) => p.text), action: input.kind === 'valid' && Boolean(input.action) } };
      if (!(await this.storyReading(ctx, events))) return;
      const reply = await this.gm.talk({ ...ctx, tone: 'plain' });
      this.recordGm(state, scene, 'talk', reply.meta, reply.lines);
      for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
      return;
    }
    const text = raw;
    const canRoll = !state.pendingLuck && !state.ending && stateBeat.free && state.free && scene.id === stateBeat.id;
    const newly: string[] = [];
    const onStage = new Set<string>(Object.values(scene.cast ?? {}).filter((c): c is string => typeof c === 'string'));
    const speakers = free.speakers.filter((s) => this.scenario.cast[s]?.style !== 'speech' || onStage.has(s));
    const shownState: GameState = { ...state, recent: action.shown.slice(-RECENT_LINES) };
    const input = parseStoryInput(text);
    const ctx: GmContext = { scenario: this.scenario, beat: scene, free: { ...free, speakers, situation: scene.situation ?? free.situation }, state: shownState, text, input, acted: input.kind === 'valid' && Boolean(input.action), spoken: input.kind === 'valid' && Boolean(input.speech), interject: { upcoming: action.pending.map((p) => p.text), action: false } };
    const reading = await this.storyReading(ctx, events);
    if (!reading) return;
    if (!canRoll && (reading.kind === 'clarify' || (reading.kind === 'improv' && !reading.absurd && !reading.odd))) {
      this.say(state, { speaker: gmSpeakerOf(this.scenario) ?? 'GM', text: '지금은 새 행동을 판정할 수 없어. 진행 중인 대사나 판정을 마친 뒤 다시 적어 줘.' }, 'script', events);
      events.push({ type: 'notice', kind: 'rewrite' });
      return;
    }
    if (this.planInput(state, scene, free, reading, text, events)) {
      if (state.pendingIntent) state.pendingIntent.pendingLines = action.pending.map(p => p.i);
      return;
    }
    this.recordGm(state, scene, 'interpret', reading.meta);
    let read: Interpretation = reading;
    this.heard(state, scene, read, text, events);
    if (read.kind === 'ask') {
      // 이야기 입력칸에 적은 질문은 여우가 받지 않는다. 화면이 질문 모드(GM 단추)로 안내하고 남은 줄은 그대로 이어진다.
      this.record(state, { kind: 'input', beat: scene.id, text, result: 'ask', approach: null, item: null, source: read.source });
      events.push({ type: 'notice', kind: 'ask' });
      return;
    }
    const big = read.kind === 'approach' || read.kind === 'improv';
    const guard = this.guardRisk(state, scene, read, text, Boolean(canRoll), events);
    if (guard === 'refused') {
      return;
    }
    const warned = guard === 'warned';
    if (guard === 'self') read = { kind: 'talk', to: 'self', source: read.source, meta: read.meta };
    if (read.kind === 'idle') {
      // 대사가 흐르는 중이면 아무 일 없이 그 대사가 이어진다.
      this.record(state, { kind: 'input', beat: scene.id, text, result: 'idle', approach: null, item: null, source: read.source });
      this.revisePending(state, action.pending, newly, events);
      return;
    }
    if (!toFox && !(read.kind === 'talk' && (read.to === 'self' || read.shown))) newly.push(...this.noteSaid(state, assertedSpeech(text, read.kind === 'talk' || (read.kind === 'approach' && read.spoken === true))));
    if (big && canRoll && stateBeat.free) {
      events.push({ type: 'revise', drop: action.pending.map((p) => p.i), jump: true });
      await this.applyReading(state, stateBeat, stateBeat.free, read, text, events, warned, { identity: guard === 'identity', flags: newly });
      return;
    }

    this.record(state, { kind: 'input', beat: scene.id, text, result: 'talk', approach: null, item: null, source: read.source });
    const self = read.kind === 'talk' && read.to === 'self';
    const shown = read.kind === 'talk' && read.shown === true;
    const noise = isNoise(text);
    if (!big && !toFox && !self && !shown && !noise && state.flags['말함'] !== true) {
      state.flags['말함'] = true;
      newly.push('말함');
    }
    this.revisePending(state, action.pending, newly, events);
    if (!toFox && !self && !shown && !noise) this.noteHeard(state, scene, text, this.acted(read, text));
    const said = state.said ?? [];
    const repeated = said.length >= 2 && said.at(-2)?.replace(/[\s.,!?…~]/g, '') === text.replace(/[\s.,!?…~]/g, '');
    const reply = await this.gm.talk({ ...ctx, ...(shown ? { shown } : {}), tone: repeated ? 'repeat' : 'plain', interject: { upcoming: ctx.interject?.upcoming ?? [], action: big }, ...(self ? { self } : {}) });
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
    if (free.stall_idle && free.idle) {
      for (const line of free.idle.lines) {
        if (!state.spoken?.[line.speaker]?.includes(line.text)) this.say(state, line, 'script', events);
      }
      this.applyEffects(state, free.idle.effects, events, true);
      if (this.route(state, free.next ?? beat.next, beat.id) === beat.id) await this.stallWithoutAttempt(state, beat, free, events);
      else await this.leaveOutcome(state, beat, free, undefined, events);
      return;
    }
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
    this.dropIntent(state);
    // 그만두기 말의 기본 경고와 다른 글(질문 모드의 답)일 때만 적어 둔다. 불러온 뒤 같은 창을 다시 띄우는 데 쓴다.
    const plain = (this.scenario.risky ?? []).find((r) => r.quit)?.warn;
    state.pendingRisk = { text, quit: true, ...(warn !== plain ? { warn } : {}) };
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

  private movesLine(state: GameState, free: Pick<FreeSpec, 'approaches'>): string {
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
    // 화면이 보낸 조건식이다. 읽을 수 없는 식이면 그 줄은 건드리지 않는다.
    const holds = (cond: string, ctx: CondContext): boolean | null => {
      try {
        return evalCond(cond, ctx);
      } catch {
        return null;
      }
    };
    const drop = pending.filter((p) => p.if !== undefined && holds(p.if, now) === false && holds(p.if, before) === true).map((p) => p.i);
    if (drop.length) events.push({ type: 'revise', drop, jump: false });
  }

  /** 입력이 대사가 아니라 행동을 적은 문장인가. 행동은 인물이 인용하지 않는다. */
  private acted(read: Interpretation, text: string): boolean {
    const input = parseStoryInput(text);
    if (input.kind === 'valid' && input.explicit) return Boolean(input.action);
    if (read.kind === 'talk') return read.shown === true;
    if (read.kind === 'approach' && read.spoken !== undefined) return !read.spoken;
    return read.kind === 'improv' || isActionText(text) || (read.kind === 'approach' && read.spoken === false);
  }

  /** intent: 의도 카드로 물을 때 카드에 함께 걸어 둘 것(미룬 정체 대가, 이 입력이 세운 플래그). */
  private async applyReading(state: GameState, beat: BeatSpec, free: FreeSpec, read: Interpretation, text: string, events: GameEvent[], warned = false, intent: { identity?: boolean; flags?: string[] } = {}): Promise<void> {
    if (read.kind === 'ask' || read.kind === 'talk' || read.kind === 'idle' || read.kind === 'clarify') return;
    if (state.free) state.free.spoken = (read.kind === 'approach' && read.spoken === true) || assertedSpeech(text).length > 0;
    const named = this.mentionedItem(text);
    if (named && !state.items.includes(named.id)) throw new GameError(`${named.name} 없음`);
    // 딴짓(odd)은 살아남거나 벗어나려는 시도가 아니라 결과가 불확실하지 않다. 큰 행동(bold)·위험한 행동은 그대로 굴린다.
    if (read.kind === 'improv' && (read.absurd || (read.odd === true && !read.bold && read.risk === undefined))) {
      await this.absurdAct(state, beat, free, read, text, events);
      return;
    }
    if (read.kind === 'improv') {
      if (intent.identity && this.scenario.identity) this.applyEffects(state, this.scenario.identity.effects, events);
      await this.improvRoll(state, beat, free, read, text, events, warned);
      return;
    }

    let approach = this.approachOf(free, read.approach);
    if (approach.item !== undefined && !state.items.includes(approach.item)) throw new GameError('그 행동에 필요한 소지품이 없습니다.');
    // 원문이 후보의 일부만 했으면 그 부분을 판정 범위로 들고 간다(행운 확인을 거쳐도 유지).
    if (state.free) {
      if (read.scope) state.free.scope = read.scope;
      else delete state.free.scope;
    }
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
    if (state.free) state.free.spoken = approach.examples.some((s) => assertedSpeech(s).length > 0);
    if (state.free) delete state.free.scope;
    await this.resolve(state, beat, free, approach, null, events);
  }

  private async resolve(state: GameState, beat: BeatSpec, free: FreeSpec, approach: ApproachSpec, text: string | null, events: GameEvent[], extra: ModApplied[] = [], improv?: ImprovMark): Promise<void> {
    if (!approach.goal && goalAchieved(approach.outcomes.hit, state)) {
      this.say(state, { speaker: gmSpeakerOf(this.scenario) ?? 'GM', text: '그 목표는 이미 이뤘어. 지금 새로 이루려는 일이 있다면 다시 적어 줘.' }, 'script', events);
      events.push({ type: 'notice', kind: 'rewrite' });
      return;
    }
    if (approach.goal) {
      const problem = this.planProblem(state, free, { target: approach.goal, deed: free.goals?.[approach.goal]?.text, bold: false }, approach.outcomes.mixed);
      if (problem) {
        this.say(state, { speaker: gmSpeakerOf(this.scenario) ?? 'GM', text: problem }, 'script', events);
        events.push({ type: 'notice', kind: 'rewrite' });
        return;
      }
    }
    const tension = this.tensionOf(state);
    const roll = this.roll(state, beat, approach.stat, approach.label, approach.mods, events, extra);
    const check = state.log.findLast((entry) => entry.kind === 'check');
    if (check?.kind === 'check' && improv) check.improv = { ...improv };
    if (roll.tier !== 'fumble') this.applyEffects(state, this.beforeOf(approach, text), events);
    if ((roll.tier === 'miss' || roll.tier === 'fumble') && this.askLuck(state, beat, approach, text, roll, tension, events, improv)) return;
    if (roll.tier === 'fumble') {
      this.bumpTension(state, roll.tier);
      this.applyEffects(state, this.beforeOf(approach, text), events);
    }
    await this.finishResolve(state, beat, free, approach, text, roll, events, improv);
  }

  /**
   * 판정 전 효과. 서술 검사(state_check)가 플레이어의 실제 행동으로만 켜는 플래그(후드_벗음 등)는 단추(대본 줄이 그 행동을 보여 줌)일 때만 미리 켠다.
   * 직접 적은 입력이면 그 행동을 했는지는 서술 검사가 정한다. 하지 않은 행동이 보이는 줄 없이 상태에 들어가지 않는다.
   */
  private beforeOf(approach: ApproachSpec, text: string | null): Effects | undefined {
    const before = approach.before;
    if (text === null || !before?.flags) return before;
    const observed = new Set(this.scenario.facts.flatMap((f) => (f.state_check?.sets ? [f.state_check.sets] : [])));
    return { ...before, flags: Object.fromEntries(Object.entries(before.flags).filter(([flag]) => !observed.has(flag))) };
  }

  /** 실패 직후 행운을 쓸지 묻는다. 모자라면 그렇다고만 말하고 넘어간다. */
  private askLuck(state: GameState, beat: BeatSpec, approach: ApproachSpec, text: string | null, roll: RollResult, tension: number, events: GameEvent[], improv?: ImprovMark): boolean {
    const have = state.tracks.행운;
    if (!this.luckPrompt || have <= 0 || state.tracks.정신력 === 0) return false;
    const need = roll.tier === 'fumble' ? Math.max(1, LUCK_TARGET - roll.total) : LUCK_TARGET - roll.total;
    if (need > have) return false;
    state.pendingLuck = { beat: beat.id, approach: approach.id, label: approach.label, stat: approach.stat, text, need, tension, ...(improv ? { improv } : {}) };
    // 규칙 목소리는 화면이 낸다: 행운 창(prompt luck)이 필요한 점수와 남은 점수를 보인다.
    return true;
  }

  private async answerLuck(state: GameState, use: boolean, events: GameEvent[]): Promise<void> {
    const pending = state.pendingLuck;
    if (!pending) throw new GameError('지금은 행운을 쓸 수 없습니다.');
    if (use && pending.approach === 'improv' && !pending.improv?.target) throw new GameError('옛 저장의 이 즉흥 판정에는 성공 목표가 없어 행운으로 바꿀 수 없습니다. 행운을 쓰지 않고 기존 실패를 마무리해 주세요.');
    delete state.pendingLuck;
    // 행운 창에 답했으면(단추든 글이든) 그 전에 띄운 그만두기 확인은 끝난다.
    delete state.pendingRisk;
    const beat = this.scenario.beats[pending.beat];
    const free = beat?.free;
    if (!beat || !free) throw new Error(`없는 비트: ${pending.beat}`);
    const approach =
      free.approaches.find((a) => a.id === pending.approach) ?? this.improvSpec(free, pending.label, pending.stat, pending.improv?.bold === true, pending.improv?.attack === true);
    const check = [...state.log].reverse().find((e) => e.kind === 'check');
    if (check?.kind !== 'check') throw new Error('판정 기록이 없습니다');
    const deferredFumble = check.roll.tier === 'fumble';
    if (use) {
      check.roll = { ...check.roll, total: deferredFumble ? Math.max(LUCK_TARGET, check.roll.total) : LUCK_TARGET, tier: 'mixed', luck: pending.need, ...(deferredFumble ? { rescuedFrom: 'fumble' } : {}) };
      // 실패로 올린 긴장을 판정 전 값으로 되돌린다. 7~9 는 긴장을 바꾸지 않는다.
      if (pending.tension !== undefined) state.flags['긴장'] = pending.tension;
      this.applyEffects(state, { tracks: { 행운: -pending.need } }, events);
      if (deferredFumble) {
        const parts: ChangePart[] = [
          { text: `${TIER_LABEL.fumble} → ${TIER_LABEL.mixed}`, tone: 'good' },
          { text: `행운 ${pending.need} 사용 · 합계 ${check.roll.total}`, tone: 'warm' },
        ];
        events.push({ type: 'change', parts });
        this.record(state, { kind: 'change', parts });
      } else {
        // 실패를 행운으로 올린 결과도 화면에 등급으로 보인다. 뒤에 붙는 대가가 아슬아슬한 성공의 대가임을 알 수 있다.
        const parts: ChangePart[] = [{ text: `${TIER_LABEL.miss} → ${TIER_LABEL.mixed}`, tone: 'good' }];
        events.push({ type: 'change', parts });
        this.record(state, { kind: 'change', parts });
      }
    }
    if (deferredFumble) {
      if (!use) this.bumpTension(state, 'fumble');
      this.applyEffects(state, this.beforeOf(approach, pending.text), events);
    }
    await this.finishResolve(state, beat, free, approach, pending.text, check.roll, events, pending.improv);
  }

  /** 즉흥 행동 판정. 의도 카드를 거친 뒤에도 같은 길로 굴린다. */
  private async improvRoll(state: GameState, beat: BeatSpec, free: FreeSpec, read: Pick<ImprovPlan, 'stat' | 'difficulty' | 'bold' | 'deed' | 'target' | 'source' | 'risk'>, text: string, events: GameEvent[], warned: boolean): Promise<void> {
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'improv', approach: null, item: this.mentionedItem(text)?.id ?? null, source: read.source });
    this.noteHeard(state, beat, text, true);
    const attack = read.bold && read.risk === 'attack';
    const spec = this.improvSpec(free, improvLabel(text), read.stat, read.bold, attack);
    const extra = [...(read.difficulty === 0 ? [] : [{ label: read.difficulty > 0 ? '쉬운 행동' : '어려운 행동', value: read.difficulty }]), ...(warned ? [] : this.remembered(state, beat, text))];
    this.markPressingOn(state, text, warned);
    await this.resolve(state, beat, free, spec, text, events, extra, { absurd: false, bold: read.bold, ...(attack ? { attack } : {}), target: read.target, ...(read.deed ? { deed: read.deed } : {}) });
  }

  /** 의도 카드의 답. 그래면 묻기 전 해석대로 굴리고, 다른 뜻이면 그 입력을 지우고 아무 대가 없이 다시 적게 한다. */
  private async answerIntent(state: GameState, beat: BeatSpec, ok: boolean, events: GameEvent[]): Promise<void> {
    const pending = state.pendingIntent;
    if (!pending) throw new GameError('지금은 확인할 것이 없습니다.');
    if (!ok) {
      this.dropIntent(state);
      return;
    }
    if (!beat.free || !state.free || state.free.beat !== beat.id) throw new GameError('지금은 자유 입력을 받을 수 없습니다.');
    if (!pending.target) throw new GameError('옛 의도 카드에는 성공 목표가 없습니다. 다른 뜻을 누른 뒤 행동을 다시 적어 주세요.');
    const read: Interpretation & { kind: 'improv' } = { kind: 'improv', ...pending, bold: pending.bold ?? false, absurd: false, label: pending.deed, meta: { attempts: 0, violations: [], fallback: false, ms: 0, model: null } };
    const problem = this.planProblem(state, beat.free, read);
    if (problem) throw new GameError(problem);
    delete state.pendingIntent;
    const guard = this.guardRisk(state, beat, read, pending.text, true, events);
    if (guard === 'refused') return;
    this.noteSaid(state, assertedSpeech(pending.text));
    this.heard(state, beat, read, pending.text, events);
    if (pending.pendingLines) events.push({ type: 'revise', drop: pending.pendingLines, jump: true });
    await this.applyReading(state, beat, beat.free, read, pending.text, events, guard === 'warned', { identity: guard === 'identity' || pending.identity });
  }

  /** 큰 행동은 반응과 수치가 큰 묶음, 상대를 해치려는 큰 행동은 경계가 커지는 묶음을 쓴다(찌른 상대의 호감이 오르지 않는다). */
  private improvOutcomes(free: FreeSpec, bold: boolean, attack: boolean): Tiered<Outcome> {
    if (bold && attack && free.improv_attack) return free.improv_attack;
    return bold && free.improv_bold ? free.improv_bold : free.improv;
  }

  private improvSpec(free: FreeSpec, label: string, stat: Ability, bold = false, attack = false): ApproachSpec {
    // 즉흥 행동은 어느 행동도 아니므로, 이 장면 행동들이 전제하는 낱말(피했다 등)을 입력 없이 쓸 수 없다.
    const presume = free.approaches.flatMap((a) => a.presume ?? []);
    // 상대가 지나칠 수 없는 큰 행동은 반응과 수치가 큰 결과 묶음을 쓴다.
    const outcomes = this.improvOutcomes(free, bold, attack);
    const before = bold && attack && free.improv_attack ? free.improv_attack_before : undefined;
    return { id: 'improv', label, stat, hint: '', examples: [], keywords: [], outcomes, ...(before ? { before } : {}), ...(presume.length ? { presume } : {}) };
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
        if (this.scenario.cast[line.speaker]?.lore !== this.scenario.sheet.name) continue;
        const norm = normalizeKo(line.text);
        if (preemptedBy(norm, deed)) found.add(norm);
      }
      queue.push(...edgesOf(next));
    }
    if (found.size) state.preempted = [...found];
  }

  /** 별도 대성공 결과가 없으면 성공의 좋은 변화만 키우고, 좋은 변화가 없으면 정신력을 회복한다. */
  private outcomeOf(outcomes: Tiered<Outcome>, tier: Tier, recoverSpirit = false): Outcome {
    if (tier === 'fumble') return outcomes.fumble ?? outcomes.miss;
    if (tier !== 'crit') return outcomes[tier];
    if (outcomes.crit) return outcomes.crit;
    const hit = outcomes.hit;
    const tracks = { ...hit.effects?.tracks };
    let improved = false;
    for (const key of TRACKS) {
      const delta = tracks[key] ?? 0;
      const good = key === '의심' || key === '집착' ? delta < 0 : delta > 0;
      if (good) {
        tracks[key] = delta + Math.sign(delta);
        improved = true;
      }
    }
    // 45차 성공 회복은 유지하되, 좋은 효과가 없을 때의 +1과 중복하지 않는다.
    if (!improved || recoverSpirit) tracks.정신력 = (tracks.정신력 ?? 0) + 1;
    return { ...hit, effects: { ...hit.effects, tracks } };
  }

  /** 실패 효과와 비용을 순서대로 적용한 뒤 실제 남는 불이익만 고른다. */
  private fumbleChange(state: GameState, effects: (Effects | undefined)[]): TrackChange | undefined {
    const projected = structuredClone(state);
    const projectedEvents: GameEvent[] = [];
    for (const effect of effects) this.applyEffects(projected, effect, projectedEvents, true);
    const locked = new Set(closedTrackGates(this.scenario, projected).filter(g => g.flag !== undefined).flatMap(g => g.tracks));
    for (const key of TRACKS) {
      if (locked.has(key)) continue;
      const bad = key === '의심' || key === '집착' ? 1 : -1;
      if (!effects.some(effect => (effect?.tracks?.[key] ?? 0) * bad > 0)) continue;
      const from = projected.tracks[key], to = from + bad;
      if (to >= 0 && to <= TRACK_INFO[key].max) return { key, from, to };
    }
    for (const key of ['정신력', '체력'] as const) {
      const from = projected.tracks[key];
      if (!locked.has(key) && from > 0) return { key, from, to: from - 1 };
    }
    return undefined;
  }

  private async finishResolve(state: GameState, beat: BeatSpec, free: FreeSpec, approach: ApproachSpec, text: string | null, roll: RollResult, events: GameEvent[], improv?: ImprovMark): Promise<void> {
    const target = improv?.target ?? approach.goal;
    const goal = target && target !== 'local' ? free.goals?.[target] : undefined;
    const outcome = structuredClone(this.outcomeOf(approach.outcomes, roll.tier, true));
    const failed = roll.tier === 'miss' || roll.tier === 'fumble';
    if (!failed) this.succeededAtTurn.add(state);
    if (!failed && goal) {
      this.applyEffects(state, goal.effects, events, true);
      outcome.next = this.route(state, goal.next, beat.id);
      outcome.price = goal.price;
      if (improv) {
        outcome.gist = [goal.text, ...(hasInlineCost(outcome.effects) && outcome.gist ? [outcome.gist] : [])].join(' ');
        outcome.lines = [];
        delete outcome.state_guard;
        // 기법의 보너스와 사전에 합의한 인라인 비용은 그대로 한 번 적용한다.
      }
    } else if (!failed && improv?.deed) outcome.gist = [improv.deed, ...(hasInlineCost(outcome.effects) && outcome.gist ? [outcome.gist] : [])].join(' ');
    if (roll.tier === 'crit') {
      const parts: ChangePart[] = [{ text: TIER_LABEL.crit, tone: 'good' }];
      events.push({ type: 'change', parts });
      this.record(state, { kind: 'change', parts });
    }
    if (approach.said && (text === null || approach.said.words.some((w) => assertedSpeech(text).replace(/\s+/g, '').includes(w.replace(/\s+/g, ''))))) state.flags[approach.said.flag] = true;
    const progress = state.free;
    if (!progress) throw new Error(`${beat.id}: 자유 입력 진행 상태가 없습니다`);
    const item = approach.item ? this.scenario.sheet.items.find((i) => i.id === approach.item) : text ? this.mentionedItem(text) : undefined;
    const price = this.pickPrice(state, free, outcome, roll.tier, progress.prices ?? [], item, target !== undefined && roll.tier === 'mixed');
    if (price) progress.prices = [...(progress.prices ?? []), price.id];
    // 정상 실패와 같은 피해 중복 제거를 먼저 하고, 대실패는 그 뒤 한 칸만 더한다.
    const effects = { ...outcome.effects, tracks: { ...outcome.effects?.tracks } };
    const priceEffects = { ...price?.effects, tracks: { ...price?.effects?.tracks } };
    if (failed && approach.risky && (roll.tier !== 'fumble' || !approach.outcomes.fumble)) {
      for (const harm of price?.weight === 'hard' ? [effects, priceEffects] : [effects]) {
        for (const key of ['체력', '정신력'] as const) {
          if ((harm.tracks[key] ?? 0) < 0) harm.tracks[key] = -2;
        }
      }
    }
    for (const key of ['체력', '정신력'] as const) {
      const cost = priceEffects.tracks[key] ?? 0;
      const harm = effects.tracks[key] ?? 0;
      if (cost < 0 && harm < 0) effects.tracks[key] = Math.min(cost, harm) - cost;
    }
    const fumble = roll.tier === 'fumble' && !approach.outcomes.fumble ? this.fumbleChange(state, [effects, priceEffects]) : undefined;
    // 한 행동에 같은 인물의 말 반응은 한 번만 보인다. 서술이 이미 상대의 대사를 냈으면 다음 장면 전 반응(silentReaction)을 부르지 않는다.
    const spokenBy = (lines: readonly Line[]) => lines.some((line) => this.scenario.cast[line.speaker]?.style === 'speech' && this.scenario.cast[line.speaker]?.lore !== this.scenario.sheet.name);
    let reacted = false;
    if (text === null) {
      for (const line of outcome.lines) this.say(state, line, 'script', events);
      if (price) this.say(state, { speaker: '나레이션', text: price.text }, 'script', events);
    } else {
      const scope = improv ? undefined : progress.scope;
      const bound = improv?.deed ?? scope ?? goal?.text ?? outcome.gist;
      const applied: Partial<Record<Track, number>> = {};
      for (const part of [effects.tracks, priceEffects.tracks, fumble ? { [fumble.key]: fumble.to - fumble.from } : {}]) {
        for (const [key, delta] of Object.entries(part ?? {})) if (delta) applied[key as Track] = (applied[key as Track] ?? 0) + delta;
      }
      if (roll.tier === 'hit') applied.정신력 = (applied.정신력 ?? 0) + 1;
      const reply = await this.gm.narrate({ scenario: this.scenario, beat, free, state, text, approach, roll, outcome, ...(price ? { price } : {}), ...(fumble ? { fumble } : {}), ...(improv ? { improv } : {}), ...(improv?.deed ? { deed: improv.deed } : scope ? { deed: scope } : {}), ...(bound ? { bound } : {}), ...(Object.keys(applied).length ? { applied } : {}) });
      if (improv?.deed && !failed) this.preempt(state, beat, improv.deed);
      this.recordGm(state, beat, 'narrate', reply.meta, reply.lines);
      this.followGm(state, reply.meta, events);
      // 사건 CG는 서술과 그 그림의 인물에게만 이어진다. 다른 인물의 표정 반응을 덮지 않는다.
      const visual = outcome.lines.find(l => l.cg);
      const owner = visual ? (this.scenario.cast[visual.speaker]?.lore ?? visual.speaker) : undefined;
      reacted = spokenBy(reply.lines);
      for (const line of reply.lines) {
        const samePerson = (this.scenario.cast[line.speaker]?.lore ?? line.speaker) === owner;
        this.say(state, visual?.cg && (!line.face || samePerson) ? { ...line, cg: visual.cg } : line, reply.meta.fallback ? 'script' : 'gm', events);
      }
      if (price && reply.meta.fallback) this.say(state, { speaker: '나레이션', text: price.text }, 'script', events);
    }
    if (price) {
      this.record(state, { kind: 'price', beat: beat.id, id: price.id, tag: price.tag, text: price.text });
      events.push({ type: 'price', id: price.id, tag: price.tag, text: price.text });
    }
    this.applyEffects(state, effects, events, true);
    if (price) this.applyEffects(state, priceEffects, events, true);
    if (fumble) this.applyEffects(state, { tracks: { [fumble.key]: fumble.to - fumble.from } }, events, true);
    if (roll.tier === 'hit') this.applyEffects(state, { tracks: { 정신력: 1 } }, events, true);
    if (state.flags['위험_강행'] === true) {
      delete state.flags['위험_강행'];
      if (failed) state.flags['위험_실패'] = true;
    }
    delete progress.scope;
    await this.leaveOutcome(state, beat, free, outcome.next, events, reacted);
  }

  /** 구형 저장의 진행 소비는 보존하고 실제 판정 횟수는 현재 방문의 check 기록으로 분리한다. */
  private progressTurns(state: GameState): number {
    const progress = state.free;
    if (!progress) throw new Error(`${state.beat}: 자유 입력 진행 상태가 없습니다`);
    if (progress.turns === undefined) {
      progress.turns = progress.rolls;
      const entered = state.log.findLastIndex((entry) => entry.kind === 'beat' && entry.beat === progress.beat);
      progress.rolls = state.log.slice(entered + 1).filter((entry) => entry.kind === 'check' && entry.beat === progress.beat).length;
    }
    return progress.turns;
  }

  /** 결과가 나온 뒤 이 장면에 남을지 다음 비트로 갈지 정한다. */
  private async leaveOutcome(state: GameState, beat: BeatSpec, free: FreeSpec, next: Outcome['next'], events: GameEvent[], reacted = false): Promise<void> {
    const progress = state.free;
    if (!progress) throw new Error(`${beat.id}: 자유 입력 진행 상태가 없습니다`);
    progress.turns = this.progressTurns(state) + 1;
    const finished = next === undefined && (progress.turns >= free.turns || (free.until !== undefined && evalCond(free.until, this.ctx(state))));
    // 징조는 효과가 다 반영된 뒤, 실제로 갈 비트를 알고 한 번만 낸다.
    const heading = next !== undefined ? this.route(state, next, beat.id) : finished ? this.route(state, free.next ?? beat.next, beat.id) : beat.id;
    this.warnFates(state, events, heading);
    if (heading !== beat.id) {
      if (heading === 'b06_swing' && state.flags['말함_b05_why'] !== true && !reacted) {
        const input = state.log.findLast((entry) => entry.kind === 'input' || entry.kind === 'choice');
        // 고른 선택지와 판정한 행동은 감정·몸 반응이 아니라 행동이다. 남자는 그 행동(가방에 손을 넣음 등)을 받는다.
        const spoken = input?.kind === 'input' && (input.result === 'talk' || (input.result === 'approach' && state.free?.spoken === true));
        const acted = !spoken && (input?.kind === 'choice' || (input?.kind === 'input' && (input.result === 'approach' || input.result === 'improv')));
        await this.silentReaction(state, beat, free, input && 'text' in input ? input.text : '', events, spoken, acted);
      }
      this.enter(state, heading, events, 0);
    }
  }

  /** 이 장면에서 플레이어의 말을 듣고 대답할 인물(주인공이 아닌 말하는 인물)이 있는가. */
  private listenerIn(free: FreeSpec): boolean {
    return free.speakers.some((s) => this.scenario.cast[s]?.style === 'speech' && this.scenario.cast[s]?.lore !== this.scenario.sheet.name);
  }

  private async silentReaction(state: GameState, beat: BeatSpec, free: FreeSpec, text: string, events: GameEvent[], spoken = false, acted = false): Promise<void> {
    const speaker = free.speakers.find((s) => this.scenario.cast[s]?.style === 'speech' && this.scenario.cast[s]?.lore !== this.scenario.sheet.name);
    if (!speaker) return;
    const reply = await this.gm.talk({ scenario: this.scenario, beat, free: { ...free, speakers: [speaker] }, state, text, reaction: true, ...(spoken ? { spoken: true } : acted ? { acted: true } : {}) });
    this.recordGm(state, beat, 'talk', reply.meta, reply.lines);
    for (const line of reply.lines) this.say(state, line, reply.meta.fallback ? 'script' : 'gm', events);
  }

  /** 아무것도 시도하지 않은 입력. 주사위를 굴리지 않고 장면이 흘러간다. */
  private async letSceneFlow(state: GameState, beat: BeatSpec, free: FreeSpec, text: string, source: Interpretation['source'], events: GameEvent[], spoken = false): Promise<void> {
    this.record(state, { kind: 'input', beat: beat.id, text, result: 'idle', approach: null, item: null, source });
    const progress = state.free;
    if (!progress) throw new Error(`${beat.id}: 자유 입력 진행 상태가 없습니다`);
    if (!free.idle?.threat && free.nudge?.length && !progress.nudged) {
      progress.moves = [...(progress.moves ?? []), 'threat'];
      this.makeMove(state, free, 'threat', events);
      return;
    }
    if (free.idle?.threat) await this.silentReaction(state, beat, free, text, events, spoken);
    for (const line of free.idle?.lines ?? free.neutral?.miss ?? []) {
      if (!state.spoken?.[line.speaker]?.includes(line.text)) this.say(state, line, 'script', events);
    }
    this.applyEffects(state, free.idle?.effects, events, true);
    if (this.route(state, free.next ?? beat.next, beat.id) === beat.id) {
      await this.stallWithoutAttempt(state, beat, free, events);
      return;
    }
    await this.leaveOutcome(state, beat, free, undefined, events, free.idle?.threat === true);
  }

  /**
   * 시도해야만 넘어가는 장면(다음이 자기 자신)에서 아무것도 시도하지 않은 입력. 같은 물음을 다시 걸지 않고, 시도의 성공도 주지 않는다.
   * 굴리지 않고 장면의 압박 줄(press)을 보인 뒤 기본 접근법의 '실패' 결과(대본 줄·효과·다음 장면)로 흘러간다.
   * 목표 성취 효과(성공 때의 탈주 등)는 붙지 않는다. 그 장면이 실패해도 넘어가도록 쓰여 있을 때만 이 길을 쓴다.
   */
  private async stallWithoutAttempt(state: GameState, beat: BeatSpec, free: FreeSpec, events: GameEvent[]): Promise<void> {
    const miss = this.approachOf(free, free.default_approach).outcomes.miss;
    const next = miss.next !== undefined ? this.route(state, miss.next, beat.id) : beat.id;
    if (next === beat.id) {
      await this.leaveOutcome(state, beat, free, undefined, events);
      return;
    }
    for (const line of free.press) {
      if (!state.spoken?.[line.speaker]?.includes(line.text)) this.say(state, line, 'script', events);
    }
    for (const line of miss.lines) this.say(state, line, 'script', events);
    this.applyEffects(state, miss.effects, events, true);
    await this.leaveOutcome(state, beat, free, miss.next, events);
  }

  private mentionedItem(text: string): Scenario['sheet']['items'][number] | undefined {
    const input = parseStoryInput(text);
    const words = input.kind === 'valid' ? `${input.action} ${input.speech}` : text;
    return this.scenario.sheet.items.find((item) => {
      const noun = item.name.split(' ').at(-1) ?? item.name;
      return new RegExp(`(?:^|\\s)${noun}(?=을|를|으로|로|에|의|이|가|은|는|도|만|처럼|\\s|$)`).test(words);
    });
  }

  private pickPrice(state: GameState, free: FreeSpec, outcome: Outcome, tier: Tier, used: readonly string[], item?: Scenario['sheet']['items'][number], actualCost = false): PriceSpec | null {
    const costContext = { ...this.ctx(state), lockedTracks: closedTrackGates(this.scenario, state).filter(g => g.flag !== undefined).flatMap(g => g.tracks) };
    const candidates = priceCandidates(free, outcome, tier, costContext, state.flags, used, item, state.free?.spoken === true, actualCost);
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
    const gates = closedTrackGates(this.scenario, state);
    const hidden = new Set(gates.flatMap((g) => g.tracks));
    const locked = new Set(gates.filter((g) => g.flag !== undefined).flatMap((g) => g.tracks));
    const itemChanges: ChangePart[] = this.scenario.sheet.items.filter((item) => state.items.includes(item.id)).flatMap((item) =>
      (item.states ?? []).filter((s) => state.flags[s.flag] !== true && effects.flags?.[s.flag] === true).map((s) => ({ text: `${item.name} ${s.label}`, tone: 'bad' as const })));
    const changes: TrackChange[] = [];
    for (const key of TRACKS) {
      const delta = effects.tracks?.[key];
      if (!delta || locked.has(key)) continue;
      const from = state.tracks[key];
      const to = this.heldTo(state, key, Math.max(0, Math.min(TRACK_INFO[key].max, from + delta)));
      // 한 판정의 결과와 대가는 한 번의 타격이다. 이 턴에 처음 0이 된 뒤에는 다음 타격까지 버틴다.
      if (key === '체력' && from === 0 && delta < 0 && !events.some((e) => e.type === 'tracks' && e.changes.some((c) => c.key === '체력' && c.from > 0))) {
        state.flags['체력_쓰러짐'] = true;
      }
      if (key === '정신력' && from > 0 && to === 0) state.flags['정신력_충격'] = true;
      if (to !== from) {
        state.tracks[key] = to;
        changes.push({ key, from, to });
      }
    }
    Object.assign(state.flags, effects.flags ?? {});
    for (const gate of gates) {
      if (gate.flag && state.flags[gate.flag] === true) {
        events.push({ type: 'change', parts: gate.tracks.map((key) => ({ text: `새 수치: ${TRACK_INFO[key].label}`, tone: 'warm' })) });
      }
    }
    const gained = (effects.gain ?? []).filter((id) => !state.items.includes(id));
    const removed = new Set(effects.lose ?? []);
    for (const item of this.scenario.sheet.items) {
      if (item.container && removed.has(item.container.item) && !evalCond(item.container.unless, this.ctx(state))) removed.add(item.id);
    }
    const lost = [...removed].filter((id) => state.items.includes(id));
    state.items = state.items.filter((id) => !lost.includes(id)).concat(gained);
    for (const [cast, sprite] of Object.entries(this.spritesOf(state))) {
      if (spritesBefore[cast] !== sprite) events.push({ type: 'sprite', cast, sprite });
    }
    if (changes.length) {
      events.push({ type: 'tracks', changes });
      this.record(state, { kind: 'tracks', changes });
    }
    if (gained.length || lost.length) events.push({ type: 'items', gained: gained.map((id) => this.itemView(id)), lost: lost.map((id) => this.itemView(id)) });
    const parts: ChangePart[] = [
      ...changes.filter((c) => !hidden.has(c.key)).map((c) => {
        const diff = c.to - c.from;
        return { text: `${TRACK_INFO[c.key].label} ${diff > 0 ? '+' : ''}${diff}`, tone: trackTone(c.key, diff) };
      }),
      ...itemChanges,
      ...gained.map((id) => ({ text: `${this.itemView(id).name} 얻음`, tone: 'good' as const })),
      ...lost.map((id) => ({ text: `${this.itemView(id).name} 잃음`, tone: 'bad' as const })),
    ];
    if (parts.length) {
      if (effects.reason) parts.push({ text: effects.reason, tone: 'warm' });
      events.push({ type: 'change', parts });
      this.record(state, { kind: 'change', parts });
    }
    if (!quiet) this.warnFates(state, events);
  }

  private say(state: GameState, raw: Line, by: 'script' | 'gm', events: GameEvent[]): void {
    if (raw.if !== undefined && !evalCond(raw.if, this.ctx(state))) return;
    const cgProblem = cgLineProblem(this.scenario, raw);
    if (cgProblem) throw new GameError(cgProblem);
    const cast = this.scenario.cast[raw.speaker];
    const meta = this.metaSpeaker(raw.speaker);
    const audience = this.beatOf(state).perspective === 'audience';
    if (!meta && !audience && by === 'gm' && cast?.style === 'speech' && cast.lore !== this.scenario.sheet.name && (state.spoken?.[raw.speaker] ?? []).some((text) => normalizeKo(text) === normalizeKo(raw.text))) return;
    const line = this.resolveCgLine(raw, state);
    const event = this.lineEvent(line, by);
    if (!meta && !audience) {
      state.recent = [...state.recent, { speaker: line.speaker, text: line.text }].slice(-RECENT_LINES);
      state.spoken = { ...state.spoken, [line.speaker]: [...(state.spoken?.[line.speaker] ?? []), line.text] };
      if (by === 'script' && cast?.style === 'speech' && cast.lore === this.scenario.sheet.name) state.flags[`말함_${state.beat}`] = true;
    }
    const changes: GameEvent[] = [];
    if (raw.sets) this.applyEffects(state, { flags: { [raw.sets]: true } }, changes, true);
    if (raw.effects) this.applyEffects(state, raw.effects, changes, true);
    if (!meta) this.observe(state, event);
    events.push(event, ...changes);
  }

  private resolveCgLine(line: Line, state: GameState): Line {
    const alt = line.cg ? this.scenario.cgs[line.cg]?.alt : undefined;
    return alt && evalCond(alt.if, this.ctx(state)) ? { ...line, cg: alt.id } : line;
  }

  private itemView(id: string, state?: GameState): ItemView {
    const item = this.scenario.sheet.items.find((i) => i.id === id);
    const desc = [item?.desc ?? '', ...(item?.states ?? []).filter((s) => state?.flags[s.flag] === true).map((s) => s.desc)].join(' ');
    return { id, name: item?.name ?? id, desc };
  }

  private spritesOf(state: GameState): Record<string, string> {
    const ctx = this.ctx(state);
    const out: Record<string, string> = {};
    for (const [key, cast] of Object.entries(this.scenario.cast)) {
      if (cast.sprite_alt && evalCond(cast.sprite_alt.if, ctx)) out[key] = cast.sprite_alt.sprite;
      const sprite = out[key] ?? cast.sprite;
      const alt = sprite ? this.scenario.sprites[sprite]?.alt : undefined;
      if (sprite && alt) out[key] = evalCond(alt.if, ctx) ? alt.id : sprite;
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
      text: line.text.replace(/(?<![0-9_./\\])\.{3,}(?![A-Za-z0-9_./\\])/g, '…'),
      by,
      ...(line.if !== undefined ? { if: line.if } : {}),
      ...(line.fx ? { fx: line.fx } : {}),
      ...(line.sfx ? { sfx: line.sfx } : {}),
      ...(line.face ? { face: line.face } : {}),
      ...(line.cg ? { cg: line.cg } : {}),
      ...(line.cg_from ? { cg_from: line.cg_from } : {}),
    };
  }

  private endingEvent(beat: BeatSpec): GameEvent {
    const e = beat.ending;
    if (!e) throw new Error(`${beat.id}: 결말 비트가 아닙니다`);
    return { type: 'ending', id: e.id, title: e.title, summary: e.summary, nextHook: e.next_hook, bad: e.bad === true };
  }
}
