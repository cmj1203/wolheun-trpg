export const ABILITIES = ['재치', '손재주', '매력', '체력', '교양'] as const;
export type Ability = (typeof ABILITIES)[number];

export const TRACKS = ['의심', '집착', '호감', '귀찌', '탈주', '행운'] as const;
export type Track = (typeof TRACKS)[number];

export interface TrackInfo {
  label: string;
  max: number;
  unit: string;
  desc: string;
}

export const TRACK_INFO: Record<Track, TrackInfo> = {
  의심: { label: '의심', max: 10, unit: '', desc: '그 남자가 아시나를 첩자로 의심하는 정도' },
  집착: { label: '집착', max: 10, unit: '', desc: '그 남자가 아시나에게서 눈을 떼지 못하는 정도' },
  호감: { label: '호감', max: 10, unit: '', desc: '그 남자가 아시나에게 품은 호감' },
  귀찌: { label: '귀찌 수명', max: 10, unit: '', desc: '변장 귀찌의 남은 힘. 낮아져도 변장은 풀리지 않지만 마음이 급해져 판정에 불리해진다' },
  탈주: { label: '탈주 준비도', max: 10, unit: '', desc: '탈주에 쓸 정보, 도구, 기회를 모은 정도' },
  행운: { label: '행운', max: 10, unit: '', desc: '판정 실패를 모자란 만큼 메우는 데 쓴다' },
};

export type Tier = 'hit' | 'mixed' | 'miss';
export const TIERS: readonly Tier[] = ['hit', 'mixed', 'miss'];
export const TIER_LABEL: Record<Tier, string> = { hit: '성공', mixed: '대가 있는 성공', miss: '실패' };

export type FlagValue = boolean | number | string;

export type LineStyle = 'speech' | 'thought' | 'narration' | 'gm';

/** 지식 세 칸: 누구나 아는 것, 아시나가 아는 것, 숨길 것. GM 프롬프트와 인물 수첩이 같은 칸을 따른다. */
export type NoteTier = 'common' | 'asina' | 'hidden';
export const NOTE_KINDS = ['사람', '장소', '세계'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface NoteEntry {
  id: string;
  tier: NoteTier;
  kind: NoteKind;
  name: string;
  text: string;
  /** 배경 질문을 이 항목으로 받을 때 쓰는 낱말 */
  keys: string[];
  /** 이 비트 중 하나에 처음 들어가면 수첩에 적힌다. 없으면 처음부터 적혀 있다. */
  after?: string[];
  /** 처음 적힐 때 GM 이 덧붙이는 한 줄 */
  intro?: string;
  /** 숨길 것은 이 조건이 참이 된 뒤에만 수첩에 적힌다. */
  if?: string;
}

export interface Line {
  speaker: string;
  text: string;
  fx?: string;
  sfx?: string;
  face?: string;
  cg?: string;
  /** 이 조건이 참일 때만 나오는 대사(예: 미소녀라고 말한 판에서만 나오는 원작 대사) */
  if?: string;
  /** 플레이어의 특정 말·몸짓을 전제로 하는 줄. 직접 입력한 판에서 GM 이 실패하면 대신 쓰지 않는다. */
  tie?: boolean;
}

/** GM 입력에 넣는 지금까지의 사실. 조건이 참이면 text 를 알려 주고 forbid 표현을 막는다(예: 이미 벗은 후드를 다시 벗는 장면). */
export interface FactSpec {
  if: string;
  text: string;
  forbid: string[];
}

export interface Effects {
  tracks?: Partial<Record<Track, number>>;
  flags?: Record<string, FlagValue>;
  gain?: string[];
  lose?: string[];
}

export interface Route {
  if?: string;
  to: string;
}
export type Next = string | Route[];

/** 판정 결과 하나. gist 는 GM 이 반드시 연출할 줄거리 요지, lines 는 작가가 쓴 대사(버튼 선택이나 GM 실패 때 그대로 쓴다). */
export interface Outcome {
  gist?: string;
  lines: Line[];
  effects?: Effects;
  next?: Next;
  forbid?: string[];
}

export interface Mod {
  if: string;
  value: number;
  label: string;
}

export interface CheckSpec {
  stat: Ability;
  label: string;
  mods?: Mod[];
}

export interface ChoiceSpec {
  id: string;
  text: string;
  if?: string;
  check?: CheckSpec;
  outcomes?: Record<Tier, Outcome>;
  lines?: Line[];
  effects?: Effects;
  next?: Next;
}

/** 자유 입력 비트에서 플레이어 행동을 묶는 접근 방식. GM 이 입력을 이 중 하나로 해석하고 코드가 판정한다. */
export interface ApproachSpec {
  id: string;
  label: string;
  stat: Ability;
  hint: string;
  item?: string;
  examples: string[];
  keywords: string[];
  mods?: Mod[];
  /** 주사위 뒤, 서술 앞에 적용하는 효과(예: 후드를 벗는 순간 입식 교체). */
  before?: Effects;
  /** 플레이어가 이 낱말 중 하나를 실제로 썼거나 버튼을 눌렀을 때만 켜는 플래그(예: 미소녀라고 말했다). */
  said?: { flag: string; words: string[] };
  /** 이 행동을 전제하는 낱말. 입력에 이 중 하나도 없으면 GM 서술에 쓸 수 없다(예: 달려든 판에 '피했다'). */
  presume?: string[];
  outcomes: Record<Tier, Outcome>;
}

/** 자유 입력 비트. turns 와 until 로 여러 턴에 걸친 계획(예: 감옥 탈옥)을 표현한다. */
export interface FreeSpec {
  prompt: string;
  /** 자유 입력 칸 위에 띄우는 장면 목표(이야기 문장) */
  aim?: string;
  situation: string;
  goal: string;
  speakers: string[];
  must_not: string[];
  forbid: string[];
  echo_only: string[];
  /** 판정 없는 말을 이만큼 받으면 재촉하고, 넘기면 인물이 먼저 움직여 기본 접근으로 판정한다. */
  patience: number;
  talk_fallback: Line[];
  press: Line[];
  /** 힌트 뒤에도 같은 자리면 이야기를 미는 장면 사건. */
  nudge?: Line[];
  /** 15세 이용가에 맞지 않는 입력을 인물 반응으로 돌릴 때 GM 이 실패하면 쓰는 대사. */
  deflect: Line[];
  /** 직접 입력한 판에서 GM 이 실패하고, 판정 대사가 모두 특정 입력을 전제로 할 때 쓰는 중립 줄 */
  neutral?: Record<Tier, Line[]>;
  /** 목록에 없는 행동의 판정 결과. 능력치와 난이도는 GM 이 고른다. */
  improv: Record<Tier, Outcome>;
  turns: number;
  until?: string;
  default_approach: string;
  approaches: ApproachSpec[];
  next?: Next;
}

export interface EndingSpec {
  id: string;
  title: string;
  summary: string;
  next_hook: string;
}

export interface CastSlots {
  left?: string | null;
  center?: string | null;
  right?: string | null;
}

/** 뒤 장면에 들어갈 때 인물이 되받는 줄. flag 는 플레이어가 지어낸 말이나 놓친 단서다. words 가 있으면 그 말을 하면 플래그가 선다. */
export interface CallbackSpec {
  flag: string;
  after: string[];
  line: Line;
  words?: string[];
}

export interface AtlasNodeSpec {
  id: string;
  col: number;
  row: number;
  /** 이 비트 가운데 하나를 지나면 가 본 칸이다. */
  beats: string[];
  ending?: boolean;
  /** 안 가 본 칸을 누르면 여우가 말하는 힌트 두 단계. */
  hints?: string[];
}

export interface ForeshadowSpec {
  id: string;
  at: string;
  say: string;
  words: string[];
  beats: string[];
}

export interface RiskySpec {
  words: string[];
  warn: string;
  /** 이 인물이 장면에 있을 때만 묻는다. */
  with?: string;
  /** 데모가 끝나는 입력이다. */
  quit?: boolean;
}

export interface BeatSpec {
  id: string;
  title: string;
  cut?: string;
  bg?: string;
  cast?: CastSlots;
  /** 이 장면에 자유 입력이 없을 때 끼어들기 GM 이 쓸 상황 설명과 금지어. */
  situation?: string;
  forbid?: string[];
  time?: number;
  effects?: Effects;
  lines: Line[];
  choices?: ChoiceSpec[];
  free?: FreeSpec;
  next?: Next;
  ending?: EndingSpec;
}

export interface CastSpec {
  display: string;
  style: LineStyle;
  sprite?: string;
  /** 조건이 참이면 sprite 대신 쓰는 입식 */
  sprite_alt?: { if: string; sprite: string };
  lore?: string;
}

export interface ItemSpec {
  id: string;
  name: string;
  desc: string;
  hidden?: boolean;
}

export type Crop = [number, number, number, number];

export interface AssetSpec {
  label: string;
  file?: string;
  placeholder?: string;
  crop?: Crop;
  fit?: 'cover' | 'contain';
  /** 조건이 참이면 대신 쓰는 그림 id(예: 후드를 쓴 판의 CG) */
  alt?: { if: string; id: string };
}

export interface Scenario {
  id: string;
  title: string;
  episode: string;
  source: string;
  rating: string;
  start: string;
  callbacks?: CallbackSpec[];
  /** 여우가 짚어 두는 것. 뒤에서 입력에 쓰면 보정과 칭찬을 준다. */
  foreshadow?: ForeshadowSpec[];
  /** 큰 결단 앞에서 여우가 가진 것을 정리해 주는 장면. */
  council?: string[];
  /** 이야기 분기 맵의 칸과 잇는 선. */
  atlas?: { nodes: AtlasNodeSpec[]; edges: [string, string][] };
  /** 크게 틀어지거나 끝나는 입력. 여우가 알리고 한 번 묻는다. */
  risky?: RiskySpec[];
  sheet: {
    name: string;
    abilities: Record<Ability, number>;
    tracks: Record<Track, number>;
    items: ItemSpec[];
    /** 이 수첩 항목이 적히기 전에는 수치 패널에서 tracks 를 숨긴다(예: 남자를 만나기 전의 의심·집착·호감). */
    reveal?: { note: string; tracks: Track[] }[];
  };
  cast: Record<string, CastSpec>;
  backgrounds: Record<string, AssetSpec>;
  sprites: Record<string, AssetSpec>;
  cgs: Record<string, AssetSpec>;
  beats: Record<string, BeatSpec>;
  /** 인물 수첩 항목. 서버가 lore 의 knowledge 로 채운다. */
  notes?: NoteEntry[];
  facts: FactSpec[];
}

export interface ModApplied {
  label: string;
  value: number;
}

export interface RollResult {
  label: string;
  stat: Ability;
  statValue: number;
  mods: ModApplied[];
  dice: [number, number];
  total: number;
  tier: Tier;
}

export interface TrackChange {
  key: Track;
  from: number;
  to: number;
}

interface LogBase {
  at: number;
  playMs: number;
}

export type LogEntry =
  | (LogBase & { kind: 'start'; seed: number })
  | (LogBase & { kind: 'beat'; beat: string; title: string })
  | (LogBase & { kind: 'choice'; beat: string; choice: string; text: string })
  | (LogBase & { kind: 'input'; beat: string; text: string; result: 'approach' | 'talk' | 'improv' | 'ask'; approach: string | null; item: string | null; source: 'llm' | 'rule' })
  | (LogBase & { kind: 'check'; beat: string; roll: RollResult })
  | (LogBase & { kind: 'gm'; beat: string; task: GmTask; attempts: number; violations: string[]; fallback: boolean; ms: number; model: string | null })
  | (LogBase & { kind: 'tracks'; changes: TrackChange[] })
  | (LogBase & { kind: 'save' | 'load'; slot: string })
  | (LogBase & { kind: 'end'; ending: string; title: string });

export type GmTask = 'interpret' | 'talk' | 'narrate' | 'explain';

export interface FreeProgress {
  beat: string;
  talks: number;
  /** 뜻이 약한 설득을 이미 한 번 되물었다. */
  asked?: boolean;
  /** 여우 힌트를 이미 주었다. */
  hinted?: boolean;
  /** 장면 사건으로 이미 밀었다. */
  nudged?: boolean;
  rolls: number;
  lastInput?: string;
}

export interface GameState {
  v: 1;
  scenario: string;
  session: string;
  seed: number;
  rng: number;
  beat: string;
  tracks: Record<Track, number>;
  abilities: Record<Ability, number>;
  items: string[];
  flags: Record<string, FlagValue>;
  free: FreeProgress | null;
  /** 플레이어가 지금까지 입력한 말과 행동. GM 입력과 전제 검사에 쓴다. */
  said?: string[];
  /** 여우 한마디를 마지막으로 한 때의 said 길이. 연달아 나오지 않게 한다. */
  quipAt?: number;
  /** 실패 직후 행운을 쓸지 묻는 중인 판정. */
  pendingLuck?: { beat: string; approach: string; label: string; stat: Ability; text: string | null; improv?: { absurd: boolean }; need: number };
  /** 여우가 결과를 알리고 답을 기다리는 입력. */
  pendingRisk?: { text: string; quit: boolean };
  /** 연속 실패에 안심 줄을 이미 준 판정 수. */
  comfortAt?: number;
  /** 인물이 나중에 되받을 플레이어의 말(판정 없는 대화). */
  talked?: string;
  recent: Line[];
  ending: string | null;
  startedAt: number;
  playMs: number;
  lastActiveAt: number;
  log: LogEntry[];
}

export interface ItemView {
  id: string;
  name: string;
  desc: string;
}

export type GameEvent =
  | { type: 'scene'; beat: string; title: string; bg: string | null; cast: { left: string | null; center: string | null; right: string | null }; sprites: Record<string, string> }
  | { type: 'sprite'; cast: string; sprite: string }
  | { type: 'line'; speaker: string; display: string; style: LineStyle; text: string; fx?: string; sfx?: string; face?: string; cg?: string; by: 'script' | 'gm'; if?: string }
  | { type: 'echo'; text: string }
  | { type: 'revise'; drop: number[]; jump: boolean }
  | ({ type: 'roll'; tierLabel: string } & RollResult)
  | { type: 'tracks'; changes: TrackChange[] }
  | { type: 'items'; gained: ItemView[]; lost: ItemView[] }
  | { type: 'note'; id: string; name: string }
  | { type: 'ending'; id: string; title: string; summary: string; nextHook: string };

export interface ChoiceView {
  id: string;
  text: string;
  check?: { stat: Ability; statValue: number; label: string };
}

export interface ApproachView {
  id: string;
  label: string;
  stat: Ability;
  statValue: number;
  locked: boolean;
}

export type Prompt =
  | { type: 'choices'; options: ChoiceView[] }
  | { type: 'free'; beat: string; placeholder: string; aim: string; example: string; approaches: ApproachView[]; rollsLeft: number }
  | { type: 'luck'; need: number; have: number }
  | { type: 'end' };

export interface TrackView {
  key: Track;
  label: string;
  value: number;
  max: number;
  unit: string;
  desc: string;
}

export interface Hud {
  scenarioTitle: string;
  episode: string;
  beatTitle: string;
  tracks: TrackView[];
  abilities: { key: Ability; value: number }[];
  items: ItemView[];
  notes: NoteView[];
  /** 아직 보이지 않는 수치. note 가 적히면 화면이 바로 연다. */
  trackGate: { note: string; tracks: Track[] }[];
  playMs: number;
}

export interface NoteView {
  id: string;
  kind: NoteKind | '소지품';
  name: string;
  text: string;
}

export interface Step {
  events: GameEvent[];
  prompt: Prompt;
  hud: Hud;
}

export type Action =
  | { type: 'choose'; id: string }
  | { type: 'free'; text: string }
  | { type: 'approach'; id: string }
  | { type: 'luck'; use: boolean }
  | { type: 'interject'; text: string; scene: string | null; shown: { speaker: string; text: string }[]; pending: PendingLine[] };

/** 끼어든 순간 화면에 아직 나오지 않은 고정 줄. i 는 화면이 들고 있는 남은 사건 목록의 자리다. */
export interface PendingLine {
  i: number;
  text: string;
  if?: string;
}

export class GameError extends Error {
  override name = 'GameError';
}
