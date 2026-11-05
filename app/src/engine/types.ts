export const ABILITIES = ['재치', '손재주', '매력', '체력', '교양'] as const;
export type Ability = (typeof ABILITIES)[number];

export const TRACKS = ['의심', '집착', '호감', '귀찌', '탈주', '행운'] as const;
export type Track = (typeof TRACKS)[number];

export interface TrackInfo {
  label: string;
  max: number;
  unit: string;
  desc: string;
  /** 조각 시계로 그리는 수치. progress 는 차오르면 끝(의심), countdown 은 바닥나면 끝(귀찌). */
  clock?: 'progress' | 'countdown';
}

export const TRACK_INFO: Record<Track, TrackInfo> = {
  의심: { label: '의심', max: 10, unit: '', desc: '그 남자가 아시나를 첩자로 의심하는 정도', clock: 'progress' },
  집착: { label: '집착', max: 10, unit: '', desc: '그 남자가 아시나에게서 눈을 떼지 못하는 정도' },
  호감: { label: '호감', max: 10, unit: '', desc: '그 남자가 아시나에게 품은 호감' },
  귀찌: { label: '귀찌 수명', max: 8, unit: '', clock: 'countdown', desc: '변장 귀찌의 남은 힘. 0이 되면 변장이 풀려 은발이 드러나고, 낮아질수록 마음이 급해져 판정에 불리해진다' },
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
  /** LLM 없이 배경 질문에 답할 때 여우가 하는 말 */
  say?: string;
  /** 숨길 것은 이 조건이 참이 된 뒤에만 수첩에 적힌다. */
  if?: string;
}

/** 입식 표정. GM 이 쓰는 인물 대사·속마음 줄은 줄마다 이 중 하나를 적는다. 나레이션·GM 여우 줄에는 없다. */
export const FACES = ['neutral', 'smile', 'surprised', 'wary'] as const;
export type Face = (typeof FACES)[number];
export function isFace(v: unknown): v is Face {
  return typeof v === 'string' && (FACES as readonly string[]).includes(v);
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

/** 즉흥 행동에 붙는 표시. absurd: 이 세계에 없는 물건·힘. bold: 상대가 지나칠 수 없는 큰 행동. deed: 해석이 요약한 행동 한 문장(과거형). */
export interface ImprovMark {
  absurd: boolean;
  bold: boolean;
  deed?: string;
}

/** GM 입력에 넣는 지금까지의 사실. 조건이 참이면 text 를 알려 주고 state_guard 표현을 막는다(예: 이미 벗은 후드를 다시 벗는 장면). */
export interface FactSpec {
  if: string;
  text: string;
  /** 엔진이 정한 상태와 어긋나는 표현. 플레이어가 먼저 한 행동이면 막지 않는다. */
  state_guard: string[];
  /** 서술이 이 상태를 바꿨는지 뜻으로 다시 묻는다. about 낱말이 글에 있을 때만 묻고, sets 는 플레이어가 직접 한 행동일 때 켜는 플래그다. */
  state_check?: { about: string[]; ask: string; sets?: string };
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

export const PRICE_TAGS = ['수치', '소지품', '자리', '상대행동', '시간'] as const;
export type PriceTag = (typeof PRICE_TAGS)[number];
/** soft 는 7~9 와 6- 모두, hard 는 6- 에만. soft 는 성공을 뒤집지 않는다(next·lose 없음, 플래그·탈주를 되돌리지 않음 — 로더가 검사). */
export type PriceWeight = 'soft' | 'hard';

/** 판정 결과에 붙는 대가. text 는 허구에 남는 한 줄(GM 이 서술에 녹인다), effects 는 코드가 적용한다. */
export interface PriceSpec {
  id: string;
  tag: PriceTag;
  weight: PriceWeight;
  text: string;
  effects?: Effects;
  /** 상태 조건. 거짓이면 후보에서 빠진다. */
  if?: string;
  /** 한 판에 한 번만. */
  once?: boolean;
}

/** 판정 결과 하나. gist 는 GM 이 반드시 연출할 줄거리 요지, lines 는 작가가 쓴 대사(버튼 선택이나 GM 실패 때 그대로 쓴다). */
export interface Outcome {
  gist?: string;
  lines: Line[];
  effects?: Effects;
  next?: Next;
  /** 이 결과에서 뽑을 대가 후보(비트 prices 의 id). 없으면 비트 표 전체에서 뽑는다. hit 에는 쓰지 않는다. */
  price?: string[];
  /** 이 결과에서 엔진 상태와 어긋나는 표현(예: 실패인데 칼을 거둠). */
  state_guard?: string[];
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
  /** 엔진이 정한 상태와 어긋나는 표현(예: 아직 묶이지 않았는데 묶였다고 쓰기). 이름·사실은 설정 사전의 숨긴 항목이, 다음 장면 앞당김은 reserved_line 검사가 맡는다. */
  state_guard: string[];
  echo_only: string[];
  /** 판정 없는 말을 이만큼 받으면 재촉하고, 넘기면 인물이 먼저 움직여 기본 접근으로 판정한다. */
  patience: number;
  talk_fallback: Line[];
  press: Line[];
  /** GM 무브 ① 위협의 징조: 말만 거듭해 patience 에 닿으면 이야기를 미는 장면 사건. */
  nudge?: Line[];
  /** GM 무브 ③ 대가 붙은 기회: 세계가 길을 하나 내민다. 없으면 건너뛴다. */
  offer?: { lines: Line[]; effects?: Effects };
  /** 15세 이용가에 맞지 않는 입력을 인물 반응으로 돌릴 때 GM 이 실패하면 쓰는 대사. */
  deflect: Line[];
  /** 직접 입력한 판에서 GM 이 실패하고, 판정 대사가 모두 특정 입력을 전제로 할 때 쓰는 중립 줄 */
  neutral?: Record<Tier, Line[]>;
  /** 목록에 없는 행동의 판정 결과. 능력치와 난이도는 GM 이 고른다. */
  improv: Record<Tier, Outcome>;
  /** 상대가 지나칠 수 없는 큰 즉흥 행동(몸에 닿기, 겨누기)의 판정 결과. 반응과 수치가 improv 보다 크다. 없으면 improv 를 쓴다. */
  improv_bold?: Record<Tier, Outcome>;
  /** 장면별 대가 표. 7~9 는 soft 중 하나, 6- 는 hard 우선 하나를 시드 난수로 뽑는다. */
  prices?: PriceSpec[];
  turns: number;
  until?: string;
  default_approach: string;
  /** 사람은 멀리 있어 대화가 안 되는 장면에서, 그 사람에게 건넨 말을 받는 접근. */
  addressed?: string;
  approaches: ApproachSpec[];
  next?: Next;
}

export interface EndingSpec {
  id: string;
  title: string;
  summary: string;
  next_hook: string;
  /** 상태가 한계에 닿아 들어온 작은 끝. 결과 화면에 '마지막 갈림길에서 다시' 단추가 붙는다. */
  bad?: boolean;
}

/**
 * 상태가 한계에 닿으면 다음 비트 대신 들어가는 작은 끝. warn 은 한 판에 한 번 캐릭터에게 일어나는 징조(나레이션·속마음 줄)다.
 * 여우가 결과 이름을 대며 알리지 않는다(DW "Show signs of an approaching threat").
 */
export interface FateSpec {
  id: string;
  when: string;
  to: string;
  warn?: { when: string; lines: Line[] };
}

/** 징조 줄에 쓰면 안 되는 낱말. 결과 이름·규칙 용어를 대면 징조가 아니라 훈수다. */
export const OMEN_BAN = /끝|은발|쓰러|판정|보정|주사위/u;

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

/** 여우가 짚어 둔 것. 화면에 줄로 내보내지 않고 `at` 비트에서 플래그만 세운 뒤, `beats` 에서 `words` 를 쓰면 보정을 주는 복선이다. */
export interface ForeshadowSpec {
  id: string;
  at: string;
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

/** 일어나지 않게 정해 둔 행동. 주사위 없이 고정 줄로 받는다. unless 장면에서는 평소대로 해석한다. */
export interface RefuseSpec {
  id: 'unmask' | 'identity';
  words: string[];
  unless: string[];
  lines: Line[];
}

/** 게임 자체에 대한 질문의 고정 답. id 'quit' 은 그만두기 확인으로 간다. */
export interface GameHelp {
  id: string;
  name: string;
  say: string;
  /** 답 끝에 지금 값을 덧붙일 수치. */
  track?: Track;
}

/** 장면 검사에서 뽑히는 사건 하나(작가가 미리 썼다). altered 는 장면 줄 뒤에 덧붙는 다른 결, interrupt 는 장면 줄 앞에 끼어드는 따로 일어난 일. */
export interface TwistSpec {
  id: string;
  lines: Line[];
  effects?: Effects;
}

/** 긴장값의 범위와 시작값. Mythic 카오스 팩터를 d6 에 맞춘 것. */
export const TENSION_MIN = 1;
export const TENSION_MAX = 6;
export const TENSION_START = 3;

export interface BeatSpec {
  id: string;
  title: string;
  cut?: string;
  bg?: string;
  cast?: CastSlots;
  /** 이 장면에 자유 입력이 없을 때 끼어들기 GM 이 쓸 상황 설명. */
  situation?: string;
  time?: number;
  effects?: Effects;
  /** 장면 검사: 장면 시작 때 d6 이 긴장값 이하면 홀수는 altered, 짝수는 interrupt 에서 하나를 뽑는다. */
  twist?: { altered: TwistSpec[]; interrupt: TwistSpec[] };
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
  file?: string;
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
  refuse?: RefuseSpec[];
  /** 입력 해석이 attack 으로 읽은 행동을 이 인물 앞에서 할 때, 되묻지 않고 판정 앞에 한 번 보이는 징조(속마음). */
  danger?: { with: string; omen: Line[] };
  /**
   * 정체를 밝히는 입력(words 로도 잌는다). 막지 않는다(play to find out). 말이 나가기 전 징조 한 줄(한 판 한 번).
   * with 인물이 장면에 있으면 큰 행동으로 effects(의심, 신분_노출)를 받고, 없으면 혼잇말로 흐른다.
   */
  identity?: { with: string; words: string[]; omen: Line[]; effects: Effects };
  gameHelp?: GameHelp[];
  /** 상태 조건으로 들어가는 작은 끝. 순서대로 보고 먼저 참인 것 하나로 간다. */
  fates?: FateSpec[];
  /** 장면에 없는 인물을 모델 줄이 쓰지 못하게 하는 낱말. met 플래그 전에는 unseen 도 막는다. near 장면은 멀리 보이는 곳이라 막지 않는다. */
  stage?: { who: string; met: string; near: string[]; unseen: string[]; gone: string[] };
  sheet: {
    name: string;
    abilities: Record<Ability, number>;
    tracks: Record<Track, number>;
    items: ItemSpec[];
    /** 이 수첩 항목이 적히기 전에는 수치 패널에서 tracks 를 숨긴다(예: 남자를 만나기 전의 의심·집착·호감). */
    reveal?: { note: string; tracks: Track[] }[];
    /** 시작 긴장값(1~6). 없으면 TENSION_START. */
    tension?: number;
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
  /** 이 판정에 쓴 행운 */
  luck?: number;
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
  | (LogBase & { kind: 'input'; beat: string; text: string; result: 'approach' | 'talk' | 'improv' | 'ask' | 'game' | 'bounced'; approach: string | null; item: string | null; source: 'llm' | 'rule' })
  | (LogBase & { kind: 'check'; beat: string; roll: RollResult })
  | (LogBase & { kind: 'price'; beat: string; id: string; tag: PriceTag; text: string })
  | (LogBase & { kind: 'twist'; beat: string; tension: number; roll: number; result: TwistResult; id: string | null })
  | (LogBase & { kind: 'gm'; beat: string; task: GmTask; attempts: number; violations: string[]; fallback: boolean; ms: number; model: string | null; lines?: string[] })
  | (LogBase & { kind: 'tracks'; changes: TrackChange[] })
  | (LogBase & { kind: 'save' | 'load'; slot: string })
  | (LogBase & { kind: 'end'; ending: string; title: string });

export type GmTask = 'interpret' | 'talk' | 'narrate' | 'explain';

/** 막혔을 때 세계가 먼저 움직이는 방식(GM 무브 표). 이 순서로 한 턴에 하나씩. */
export const WORLD_MOVES = ['threat', 'press', 'offer', 'clock'] as const;
export type WorldMove = (typeof WORLD_MOVES)[number];

export interface FreeProgress {
  beat: string;
  talks: number;
  /** 여우 힌트를 이미 주었다. */
  hinted?: boolean;
  /** 장면 사건으로 이미 밀었다. */
  nudged?: boolean;
  /** 이 장면에서 이미 낸 GM 무브(한 종류에 한 번). */
  moves?: WorldMove[];
  rolls: number;
  /** 이 장면에서 이미 뽑힌 대가 id(같은 대가가 연달아 나오지 않게). */
  prices?: string[];
  lastInput?: string;
  /** 바로 앞에 여우가 되돌려 보낸 입력(같은 입력이 두 번 걸리뮤 예시를 덧붙인다). */
  lastBounce?: string;
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
  pendingLuck?: { beat: string; approach: string; label: string; stat: Ability; text: string | null; improv?: ImprovMark; need: number; /** 판정 전 긴장값. 행운을 쓰면 이 값으로 되돌린다. 이 필드가 없던 저장은 되돌리지 않는다. */ tension?: number };
  /** 플레이어가 먼저 해 버린 뒤 장면의 원작 줄(정규화한 글). 그 장면에 가면 이 줄만 건너뛴다. */
  preempted?: string[];
  /** 여우가 결과를 알리고 답을 기다리는 입력. */
  pendingRisk?: { text: string; quit: boolean };
  /** 큰 즉흥 행동의 해석이 맞는지 카드로 묻고 답을 기다리는 입력. 그래면 이 해석대로 굴리고, 다른 뜻이면 지우고 다시 적게 한다. */
  pendingIntent?: { text: string; deed: string; stat: Ability; difficulty: number; source: 'llm' | 'rule' };
  /** 연속 실패에 안심 줄을 이미 준 판정 수. */
  /** 인물이 나중에 되받을 플레이어의 말(판정 없는 대화). */
  talked?: string;
  /** 상대 인물 앞에서 한 말과 행동. 되받기, 작전 회의, 인물 프롬프트가 쓴다. 여우에게 물은 말은 들어가지 않는다. */
  heard?: { text: string; action: boolean }[];
  /** 위험 경고를 이미 거친 입력(공백 뺀 글). 같은 입력은 다시 묻지 않는다. */
  warned?: string[];
  recent: Line[];
  /** 이번 판에 화면에 나온 줄(화자별). GM 이 같은 인물의 같은 말을 되풀이하지 못하게 한다. */
  spoken?: Record<string, string[]>;
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
  | { type: 'price'; id: string; tag: PriceTag; text: string }
  /** 장면 검사 결과. 화면이 긴장·눈·결과를 그대로 보여 준다(여우는 말하지 않는다). */
  | { type: 'twist'; beat: string; tension: number; roll: number; result: TwistResult; id: string | null }
  /** 규칙 목소리는 화면이 낸다. 여우가 말하지 않고 확인 창으로 묻는다. 답은 confirm 액션. */
  /** intent: 큰 행동의 해석 확인 카드. yes/no 는 단추 글(없으면 그만두기 창 기본). */
  | { type: 'confirm'; kind: 'quit' | 'intent'; text: string; yes?: string; no?: string }
  /** 화면이 글로 내는 안내. ask: 이야기 입력칸에 적은 질문은 여우가 받지 않으니 GM 단추(질문 모드)로. */
  | { type: 'notice'; kind: 'ask' }
  | { type: 'items'; gained: ItemView[]; lost: ItemView[] }
  | { type: 'note'; id: string; name: string }
  | { type: 'ending'; id: string; title: string; summary: string; nextHook: string; bad: boolean };

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
  /** 조각 시계. warnAt 은 fates 의 징조 문턱(progress 는 이 값부터, countdown 은 이 값 이하가 위험 칸). */
  clock?: { kind: 'progress' | 'countdown'; warnAt?: number };
}

/** 조각 시계 수치는 fates 의 징조 문턱(`귀찌 <= 2`, `의심 >= 7`)을 위험 칸 경계로 화면에 넘긴다. 문턱의 출처는 시나리오 하나다. */
export function trackView(fates: readonly FateSpec[] | undefined, key: Track, value: number): TrackView {
  const { clock, ...info } = TRACK_INFO[key];
  if (!clock) return { key, ...info, value };
  const re = new RegExp(`^${key}\\s*(<=|>=)\\s*(\\d+)$`);
  for (const fate of fates ?? []) {
    const m = fate.warn?.when.trim().match(re);
    if (m) return { key, ...info, value, clock: { kind: clock, warnAt: Number(m[2]) } };
  }
  return { key, ...info, value, clock: { kind: clock } };
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
  /** 긴장값(1~6). 판정 성공 -1, 실패 +1. */
  tension: number;
  playMs: number;
}

export type TwistResult = 'none' | 'altered' | 'interrupt';

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
  | { type: 'interject'; text: string; scene: string | null; shown: { speaker: string; text: string }[]; pending: PendingLine[] }
  /** 확인 창의 답. */
  | { type: 'confirm'; ok: boolean }
  /** 질문 모드(GM 단추): 여우에게 묻는다. 이야기 밖 말이라 판정·시간·참을성을 쓰지 않고, 여우 화자 줄은 여기서만 나온다. */
  | { type: 'ask'; text: string; scene?: string | null };

/** 끼어든 순간 화면에 아직 나오지 않은 고정 줄. i 는 화면이 들고 있는 남은 사건 목록의 자리다. */
export interface PendingLine {
  i: number;
  text: string;
  if?: string;
}

export class GameError extends Error {
  override name = 'GameError';
}
