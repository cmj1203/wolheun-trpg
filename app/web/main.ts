import type { ResultSummary } from '../src/engine/summary.ts';
import type { Action, ChoiceView, GameEvent, Hud, Prompt, Step, Track, TrackChange, TrackView } from '../src/engine/types.ts';

type LineEvent = Extract<GameEvent, { type: 'line' }>;
type RollEvent = Extract<GameEvent, { type: 'roll' }>;
type PriceEvent = Extract<GameEvent, { type: 'price' }>;
type TwistEvent = Extract<GameEvent, { type: 'twist' }>;
type ReviseEvent = Extract<GameEvent, { type: 'revise' }>;
type SceneEvent = Extract<GameEvent, { type: 'scene' }>;
type EndingEvent = Extract<GameEvent, { type: 'ending' }>;
type FreePrompt = Extract<Prompt, { type: 'free' }>;
type SlotName = 'left' | 'center' | 'right';
type Phase = 'title' | 'story' | 'line' | 'dice' | 'ending' | 'choices' | 'free' | 'thinking' | 'result';

interface AssetRef {
  label: string;
  url: string;
  placeholder: boolean;
  crop?: [number, number, number, number];
  fit?: 'cover' | 'contain';
}

interface CastRef {
  display: string;
  style: string;
  sprite: string | null;
  lore: string | null;
}

interface Manifest {
  titleLogo: string | null;
  credit: string;
  title: string;
  episode: string;
  rating: string;
  source: string;
  backgrounds: Record<string, AssetRef>;
  sprites: Record<string, AssetRef>;
  cgs: Record<string, AssetRef>;
  items: Record<string, string>;
  cutins: { crit: string | null; miss: string | null };
  cast: Record<string, CastRef>;
}

interface Health {
  llm: { enabled: boolean; ok: boolean; model: string | null };
  model: { key: string; label: string; license: string } | null;
}

interface SavedView {
  scene: SceneEvent | null;
  line: LineEvent | null;
  /** 아래 대사창에 남아 있던 마지막 인물·내레이션 줄. line 이 여우 줄이면 둘이 다르다. */
  dialog?: LineEvent | null;
  remaining: GameEvent[];
  backlog: { who: string; text: string; by: 'script' | 'gm' }[];
  faces?: Record<string, string>;
}

interface SaveMeta {
  slot: string;
  savedAt: number;
  beatTitle: string;
  playMs: number;
  ended: boolean;
}

const params = new URLSearchParams(location.search);
const FAST = params.get('fast') === '1';
const TYPE_MS = FAST ? 0 : 26;
const WAIT_AFTER_MS = 150;
const SLOT_NAMES: readonly SlotName[] = ['left', 'center', 'right'];
const SAVE_SLOTS = ['slot1', 'slot2', 'slot3'] as const;

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`화면 요소 #${id} 가 없습니다`);
  return node as T;
}

const ui = {
  stage: byId('stage'),
  bg: byId('bg'),
  bgNext: byId('bg-next'),
  cg: byId('cg'),
  cgArt: byId('cg-art'),
  cgBlur: byId('cg-blur'),
  slots: { left: byId('slot-left'), center: byId('slot-center'), right: byId('slot-right') } as Record<SlotName, HTMLElement>,
  flash: byId('flash'),
  sfx: byId('sfx'),
  tempBadge: byId('temp-badge'),
  episode: byId('episode'),
  beatTitle: byId('beat-title'),
  gmStatus: byId('gm-status'),
  tracks: byId('tracks'),
  tracksHead: byId('tracks-head'),
  abilities: byId('abilities'),
  items: byId('items'),
  choices: byId('choices'),
  free: byId('free'),
  say: byId<HTMLFormElement>('say'),
  clock: byId('clock'),
  tension: byId('tension'),
  atlasDialog: byId<HTMLDialogElement>('atlas'),
  atlasMap: byId('atlas-map'),
  freePrompt: byId('free-prompt'),
  freeInput: byId<HTMLInputElement>('free-input'),
  freeMeta: byId('free-meta'),
  approaches: byId('approaches'),
  thinking: byId('thinking'),
  dialog: byId('dialog'),
  name: byId('name'),
  gmBadge: byId('gm-badge'),
  echo: byId('echo'),
  text: byId('text'),
  more: byId('more'),
  dice: byId('dice'),
  dieA: byId('die-a'),
  dieB: byId('die-b'),
  diceLabel: byId('dice-label'),
  diceFormula: byId('dice-formula'),
  diceTier: byId('dice-tier'),
  cutin: byId<HTMLImageElement>('cutin'),
  diceNote: byId('dice-note'),
  priceLine: byId('price-line'),
  twistLine: byId('twist-line'),
  twistText: byId('twist-text'),
  priceTag: byId('price-tag'),
  priceText: byId('price-text'),
  ending: byId('ending'),
  endingKicker: byId('ending-kicker'),
  endingTitle: byId('ending-title'),
  endingSummary: byId('ending-summary'),
  title: byId('title'),
  titleSub: byId('title-sub'),
  titleStatus: byId('title-status'),
  result: byId('result'),
  resultEpisode: byId('result-episode'),
  resultTitle: byId('result-title'),
  resultSummary: byId('result-summary'),
  resultHook: byId('result-hook'),
  resultReplay: byId('result-replay'),
  resultTracks: byId('result-tracks'),
  resultStats: byId('result-stats'),
  resultMore: byId('result-more'),
  resultCredit: byId('result-credit'),
  slotsDialog: byId<HTMLDialogElement>('slots'),
  slotsTitle: byId('slots-title'),
  slotsList: byId('slots-list'),
  logDialog: byId<HTMLDialogElement>('log'),
  logList: byId('log-list'),
  toast: byId('toast'),
  freeSend: byId<HTMLButtonElement>('free-send'),
  askGm: byId<HTMLButtonElement>('ask-gm'),
  confirm: byId<HTMLDialogElement>('confirm'),
  confirmText: byId('confirm-text'),
  confirmOk: byId<HTMLButtonElement>('confirm-ok'),
  confirmNo: byId<HTMLButtonElement>('confirm-no'),
  feedbackOpen: byId<HTMLButtonElement>('feedback-open'),
  feedbackResult: byId<HTMLButtonElement>('btn-feedback-result'),
  feedback: byId<HTMLDialogElement>('feedback'),
  feedbackForm: byId<HTMLFormElement>('feedback-form'),
  feedbackText: byId<HTMLTextAreaElement>('feedback-text'),
  feedbackClose: byId<HTMLButtonElement>('feedback-close'),
  feedbackSend: byId<HTMLButtonElement>('feedback-send'),
  mascot: byId('gm-mascot'),
  gmBox: byId('gm-box'),
  gmText: byId('gm-text'),
  gmMore: byId('gm-more'),
  gmHint: byId('gm-hint'),
  freeAim: byId('free-aim'),
  freeAimText: byId('free-aim-text'),
  notesDialog: byId<HTMLDialogElement>('notes'),
  notesList: byId('notes-list'),
};

const game = {
  phase: 'title' as Phase,
  gen: 0,
  session: null as string | null,
  manifest: null as Manifest | null,
  prompt: null as Prompt | null,
  busy: false,
  /** 보냈지만 아직 처리하지 않은 입력. 보낸 순서대로 처리한다. */
  inputs: [] as string[],
  /** 질문 모드(GM 단추). 켜져 있으면 입력은 이야기가 아니라 여우에게 묻는 말이다. 한 번 묻고 나면 꺼진다. */
  askMode: false,
  /** 질문 모드의 답을 보여 주는 중이다. 이때 새 질문이 오면 앞 답을 끝내고 바로 새 답으로 간다. */
  answering: false,
  /** 이야기 중간에 열린 그만두기 확인 창의 답을 기다린다. */
  onConfirm: null as ((ok: boolean) => void) | null,
  /** 바쁜 동안 받아 둔 질문. 응답이 끝나면 먼저 묻는다. */
  asks: [] as string[],
  /** 서버 응답을 받는 중이면 다음 요청을 보내지 않는다. */
  streaming: false,
  /** 글자가 찍히던 줄에 끼어들었으면 그 줄은 기다리지 않고 넘어간다. */
  skipWait: false,
  latest: null as { prompt: Prompt; hud: Hud } | null,
  /** 받아 둔 응답. 서버가 끝냈으면 플레이어가 읽는 중에도 저장할 수 있고, 아직 안 나온 줄은 저장에 함께 적는다. */
  live: null as { queue: ActMessage[]; ended: () => boolean } | null,
  /** 끼어들기 답이 끝난 뒤 이어질 줄. 저장할 때 함께 적는다. */
  after: [] as GameEvent[],
  bgRef: null as AssetRef | null,
  cgRef: null as AssetRef | null,
  cast: { left: null, center: null, right: null } as Record<SlotName, string | null>,
  backlog: [] as { who: string; text: string; by: 'script' | 'gm' }[],
  view: { scene: null as SceneEvent | null, line: null as LineEvent | null, dialog: null as LineEvent | null },
  spriteOf: {} as Record<string, string>,
  faces: {} as Record<string, string>,
  remaining: [] as GameEvent[],
  hud: null as Hud | null,
  /** 아래 대사창에 남아 있는 줄의 화자. 입력 자리에서 입식 밝기를 이름표와 맞춘다. */
  dialogSpeaker: '',
  /** 넘기는 방법은 첫 여우 줄에만 보여 준다. */
  foxSeen: false,
};

/** 속마음은 이름표 대신 괄호로 보인다. 이미 괄호가 있으면 걸치지 않는다. */
const shownText = (style: string, text: string) => (style === 'thought' && !/^\(.*\)$/s.test(text.trim()) ? `(${text})` : text);

const GM_FACES = ['neutral', 'smile', 'thinking', 'surprised'] as const;
type GmFace = (typeof GM_FACES)[number];

/** GM 이 말하거나 답을 쓰는 동안만 대사창 옆에 사막여우를 띄운다. */
function mascot(face: GmFace | null): void {
  if (face === null) {
    ui.gmBox.hidden = true;
    ui.stage.dataset.gm = '0';
    return;
  }
  const ref = asset('sprites', face === 'neutral' ? 'gm' : `gm_${face}`) ?? asset('sprites', 'gm');
  const img = ui.mascot.querySelector('img');
  if (img && ref && img.getAttribute('src') !== ref.url) img.setAttribute('src', ref.url);
  ui.mascot.dataset.face = face;
  ui.mascot.hidden = ref === null;
  ui.gmBox.hidden = false;
}

Object.defineProperty(window, '__wolheun', {
  value: {
    get phase() {
      return game.phase;
    },
    get prompt() {
      return game.prompt;
    },
    get session() {
      return game.session;
    },
    get backlog() {
      return game.backlog;
    },
    /** 인물별 지금 표정(화면 점검용). */
    get faces() {
      return { ...game.faces };
    },
  },
});

const TRACK_ICON: Record<string, string> = {
  의심: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  집착: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 1 0-5.6l2.8-2.8a4 4 0 0 1 5.6 5.6l-1.4 1.4"/><path d="M14 10a4 4 0 0 1 0 5.6l-2.8 2.8a4 4 0 0 1-5.6-5.6l1.4-1.4"/></svg>',
  호감: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  귀찌: '<svg viewBox="0 0 24 24"><path d="M12 3v4"/><circle cx="12" cy="10" r="3"/><path d="M12 13l-3 5h6z"/></svg>',
  탈주: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>',
  행운: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1-5.5-3-5.5 3 1.2-6.1-4.5-4.2 6.1-.8z"/></svg>',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const formatTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
};

function span(className: string, text: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

function small(text: string): HTMLElement {
  const node = document.createElement('small');
  node.textContent = text;
  return node;
}

function setPhase(phase: Phase): void {
  game.phase = phase;
  ui.stage.dataset.phase = phase;
  ui.say.hidden = phase === 'title' || phase === 'ending' || phase === 'result';
  if (phase !== 'free') setStoryPlaceholder('말하거나 행동하기');
}

let toastTimer = 0;
function toast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    ui.toast.hidden = true;
  }, 2800);
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `요청이 실패했습니다 (${res.status})`);
  return data;
}

let resolveAdvance: (() => void) | null = null;
let finishTyping: (() => void) | null = null;

function waitAdvance(): Promise<void> {
  if (game.skipWait) {
    game.skipWait = false;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    resolveAdvance = resolve;
  });
}

function advance(): void {
  if (finishTyping) {
    finishTyping();
    return;
  }
  const resolve = resolveAdvance;
  resolveAdvance = null;
  resolve?.();
}

function typeText(target: HTMLElement, text: string): Promise<void> {
  if (TYPE_MS === 0) {
    target.textContent = text;
    return Promise.resolve();
  }
  const chars = [...text];
  target.textContent = '';
  // 아직 안 찍힌 글자도 자리를 차지해, 찍히는 중에 줄바꿈과 상자 높이가 바뀌지 않는다.
  target.dataset.rest = text;
  return new Promise((resolve) => {
    let shown = 0;
    const done = () => {
      window.clearInterval(timer);
      target.textContent = text;
      delete target.dataset.rest;
      finishTyping = null;
      resolve();
    };
    const timer = window.setInterval(() => {
      shown += 1;
      target.textContent = chars.slice(0, shown).join('');
      target.dataset.rest = chars.slice(shown).join('');
      if (shown >= chars.length) done();
    }, TYPE_MS);
    finishTyping = done;
  });
}

function asset(kind: 'backgrounds' | 'sprites', id: string | null): AssetRef | null {
  if (!id || !game.manifest) return null;
  return game.manifest[kind][id] ?? null;
}

const imageSizes = new Map<string, Promise<{ w: number; h: number }>>();

function naturalSize(url: string): Promise<{ w: number; h: number }> {
  let size = imageSizes.get(url);
  if (!size) {
    size = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error(`그림을 불러오지 못했습니다: ${url}`));
      img.src = url;
    });
    imageSizes.set(url, size);
  }
  return size;
}

async function paint(el: HTMLElement, ref: AssetRef, fit: 'cover' | 'contain'): Promise<void> {
  el.style.backgroundImage = `url("${ref.url}")`;
  el.style.backgroundRepeat = 'no-repeat';
  if (ref.placeholder) {
    el.style.backgroundSize = fit;
    el.style.backgroundPosition = 'center';
    return;
  }
  const { w, h } = await naturalSize(ref.url);
  const [cx, cy, cw, ch] = ref.crop ?? [0, 0, w, h];
  const width = el.clientWidth;
  const height = el.clientHeight;
  const scale = fit === 'cover' ? Math.max(width / cw, height / ch) : Math.min(width / cw, height / ch);
  el.style.backgroundSize = `${w * scale}px ${h * scale}px`;
  el.style.backgroundPosition = `${(width - cw * scale) / 2 - cx * scale}px ${(height - ch * scale) / 2 - cy * scale}px`;
}

function crossfade(ref: AssetRef): void {
  game.bgRef = ref;
  void paint(ui.bgNext, ref, 'cover').then(() => {
    ui.bgNext.style.opacity = '1';
    window.setTimeout(
      () => {
        if (game.bgRef !== ref) return;
        void paint(ui.bg, ref, 'cover').then(() => {
          ui.bgNext.style.opacity = '0';
        });
      },
      FAST ? 0 : 700,
    );
  });
}

function showCg(id: string | undefined): void {
  const ref = id ? (game.manifest?.cgs[id] ?? null) : null;
  game.cgRef = ref;
  ui.stage.classList.toggle('cg-on', ref !== null);
  ui.cg.classList.toggle('on', ref !== null);
  ui.cg.classList.toggle('full', ref?.fit === 'cover');
  if (!ref) return;
  void paint(ui.cgBlur, ref, 'cover');
  void paint(ui.cgArt, ref, ref.fit ?? 'contain');
}

window.addEventListener('resize', () => {
  updateResultMore();
  if (game.bgRef) void paint(ui.bg, game.bgRef, 'cover');
  if (game.cgRef) {
    void paint(ui.cgBlur, game.cgRef, 'cover');
    void paint(ui.cgArt, game.cgRef, game.cgRef.fit ?? 'contain');
  }
});

function setScene(ev: SceneEvent): void {
  ui.beatTitle.textContent = ev.title;
  ui.priceLine.hidden = true;
  ui.twistLine.hidden = true;
  showCg(undefined);
  const bg = asset('backgrounds', ev.bg);
  if (bg && bg !== game.bgRef) crossfade(bg);
  const temporary = new Set<string>();
  if (bg?.placeholder && ev.bg !== 'blackout') temporary.add('임시 배경');
  game.spriteOf = { ...ev.sprites };
  game.faces = {};
  for (const slot of SLOT_NAMES) {
    const key = ev.cast[slot];
    game.cast[slot] = key;
    const el = ui.slots[slot];
    const sprite = asset('sprites', key ? (game.spriteOf[key] ?? game.manifest?.cast[key]?.sprite ?? null) : null);
    if (!key || !sprite) {
      el.classList.remove('on', 'dim', 'speaking');
      el.replaceChildren();
      el.dataset.key = '';
      continue;
    }
    if (sprite.placeholder) temporary.add('임시 입식');
    if (el.dataset.key !== key) {
      const img = document.createElement('img');
      img.src = sprite.url;
      img.alt = sprite.label;
      el.replaceChildren(img);
      el.dataset.key = key;
    } else {
      el.querySelector('img')?.setAttribute('src', sprite.url);
    }
    el.classList.add('on');
    el.classList.remove('dim', 'speaking');
  }
  ui.tempBadge.hidden = temporary.size === 0;
  ui.tempBadge.textContent = [...temporary].join(' · ');
}

function highlight(speaker: string): void {
  const ref = game.manifest?.cast[speaker];
  const someoneSpeaks = ref !== undefined && ref.style !== 'narration';
  for (const slot of SLOT_NAMES) {
    const el = ui.slots[slot];
    const key = game.cast[slot];
    if (!key || !el.classList.contains('on')) continue;
    const slotLore = game.manifest?.cast[key]?.lore ?? key;
    const active = someoneSpeaks && (ref?.lore ?? speaker) === slotLore;
    el.classList.toggle('speaking', active);
    el.classList.toggle('dim', someoneSpeaks && !active);
  }
}

function setFace(speaker: string, face: string): void {
  const cast = game.manifest?.cast;
  if (!cast) return;
  const lore = cast[speaker]?.lore ?? speaker;
  for (const slot of SLOT_NAMES) {
    const key = game.cast[slot];
    if (!key || (cast[key]?.lore ?? key) !== lore) continue;
    const base = game.spriteOf[key] ?? cast[key]?.sprite;
    const sprite = base ? asset('sprites', face === 'neutral' ? base : `${base}_${face}`) : null;
    if (sprite) morphSprite(ui.slots[slot], sprite.url);
  }
  // 인물 기준으로 기억한다(속마음 줄도 아시나 입식을 바꾼다). 화자 기준이면 저장 뒤 불러올 때 순서가 뒤집힐 수 있다.
  game.faces[lore] = face;
}

/** 자유 입력 턴 시작: 등장 인물 표정을 neutral 로 되돌린다. 직전 대본 표정이 GM 줄에 남지 않고, 이번 GM 줄이 적은 face 만 적용된다. 대본 블록 안에서는 표정이 다음 지정까지 이어진다. */
function resetFaces(): void {
  game.faces = {};
  for (const slot of SLOT_NAMES) {
    const key = game.cast[slot];
    if (key) setFace(key, 'neutral');
  }
}

/** 같은 인물의 그림만 바뀔 때(표정, 후드 벗음) 새 그림을 위에 갹고 투명도로 갈아킼다. 장면 전환·등장·튀장은 이 길을 타지 않는다. */
const FACE_FADE_MS = 150;
function morphSprite(el: HTMLElement, url: string): void {
  const cur = el.querySelector<HTMLImageElement>('img:not(.leaving)');
  if (!cur || cur.getAttribute('src') === url) return;
  for (const old of el.querySelectorAll('img.leaving')) old.remove();
  const next = document.createElement('img');
  next.src = url;
  next.alt = cur.alt;
  cur.classList.add('leaving');
  el.append(next);
  const timing = { duration: FACE_FADE_MS, easing: 'ease', fill: 'forwards' as const };
  next.animate([{ opacity: 0 }, { opacity: 1 }], timing);
  cur.animate([{ opacity: 1 }, { opacity: 0 }], timing).finished.then(
    () => cur.remove(),
    () => cur.remove(),
  );
}

function swapSprite(castKey: string, sprite: string): void {
  game.spriteOf[castKey] = sprite;
  if (game.view.scene) game.view.scene = { ...game.view.scene, sprites: { ...game.spriteOf } };
  const ref = asset('sprites', sprite);
  if (!ref) return;
  for (const slot of SLOT_NAMES) if (game.cast[slot] === castKey) morphSprite(ui.slots[slot], ref.url);
}

function replay(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

async function showLine(ev: LineEvent, restore: 'no' | 'wait' | 'still' = 'no'): Promise<void> {
  setPhase('line');
  const who = ev.style === 'narration' ? '' : ev.display;
  const text = shownText(ev.style, ev.text);
  const gm = ev.style === 'gm';
  // GM 줄은 아래 인물 대사창이 아니라 위쪽 GM 말상자에 띄운다.
  const target = gm ? ui.gmText : ui.text;
  const more = gm ? ui.gmMore : ui.more;
  if (gm) mascot(GM_FACES.find((f) => f === ev.face) ?? (ev.by === 'gm' ? 'smile' : 'neutral'));
  else {
    mascot(null);
    game.dialogSpeaker = ev.speaker;
    ui.dialog.dataset.style = ev.style;
    ui.name.textContent = who;
    ui.name.hidden = who === '';
    ui.gmBadge.hidden = ev.by !== 'gm';
  }
  ui.stage.dataset.gm = gm ? '1' : '0';
  highlight(ev.speaker);
  if (ev.face && !gm) setFace(ev.speaker, ev.face);
  showCg(ev.cg);
  more.hidden = true;
  if (restore === 'still') {
    target.textContent = text;
    return;
  }
  if (restore === 'no') {
    if (ev.sfx) {
      ui.sfx.textContent = ev.sfx;
      replay(ui.sfx, 'go');
    }
    if (ev.fx === 'flash') replay(ui.flash, 'go');
    if (ev.fx === 'shake') replay(ui.stage, 'shake');
    game.backlog.push({ who: who || '내레이션', text, by: ev.by });
    if (gm && !game.foxSeen) {
      game.foxSeen = true;
      ui.gmHint.hidden = false;
    }
  }
  await typeText(target, text);
  more.hidden = false;
  await waitAdvance();
  ui.gmHint.hidden = true;
  ui.echo.hidden = true;
}

function showEcho(text: string): void {
  ui.echo.textContent = text;
  ui.echo.hidden = false;
  game.backlog.push({ who: '아시나(입력)', text, by: 'script' });
}

/** 규칙 목소리는 화면이 낸다. 그만두기 확인은 여우 말풍선이 아니라 창으로 묻고, 답은 confirm 액션으로 보낸다. */
function showConfirm(text: string, yes = '끝낸다', no = '계속한다'): void {
  ui.confirmText.textContent = text;
  ui.confirmOk.textContent = yes;
  ui.confirmNo.textContent = no;
  if (!ui.confirm.open) ui.confirm.showModal();
}

function answerConfirm(ok: boolean): void {
  if (ui.confirm.open) ui.confirm.close();
  if (game.onConfirm) {
    const answer = game.onConfirm;
    game.onConfirm = null;
    answer(ok);
    return;
  }
  void act({ type: 'confirm', ok });
}

/** 피드백 창. 질문 모드·이야기 입력과 무관한 별도 상태다. 빈 글은 보내지 않고, 보내면 판 상태를 자동으로 덧붙여 POST /feedback 으로 보낸다. */
let feedbackDraft = 0;

function openFeedback(): void {
  if (ui.feedback.open) return;
  feedbackDraft += 1;
  ui.feedbackText.value = '';
  ui.feedback.showModal();
  ui.feedbackText.focus();
}

function closeFeedback(): void {
  if (ui.feedback.open) ui.feedback.close();
}

async function sendFeedback(): Promise<void> {
  const text = ui.feedbackText.value.trim();
  if (!text) {
    ui.feedbackText.focus();
    return;
  }
  const payload = {
    text,
    at: new Date().toISOString(),
    session: game.session,
    beatTitle: game.hud?.beatTitle ?? null,
    recent: game.backlog.slice(-6).map((b) => ({ speaker: b.who, text: b.text })),
    tracks: Object.fromEntries((game.hud?.tracks ?? []).map((t) => [t.key, t.value])),
    askMode: game.askMode,
    window: { width: window.innerWidth, height: window.innerHeight },
    page: location.pathname + location.search,
  };
  const draft = feedbackDraft;
  ui.feedbackSend.disabled = true;
  try {
    await api<{ ok: true; id: string }>('/feedback', payload);
    // 보내는 동안 창을 닫고 다시 열었으면 새로 쓰는 글이니 닫지 않는다.
    if (draft === feedbackDraft) closeFeedback();
    toast('피드백을 보냈어');
  } catch (err) {
    toast((err as Error).message);
  } finally {
    ui.feedbackSend.disabled = false;
  }
}

/** 이야기 입력칸의 안내 글. 질문 모드가 켜져 있는 동안에는 저장만 해 두고 끔 때 되돌린다. */
let askSavedPlaceholder = '';
function setStoryPlaceholder(text: string): void {
  if (game.askMode) askSavedPlaceholder = text;
  else ui.freeInput.placeholder = text;
}

/** 질문 모드 켜고 끄기. 입력칸의 안내 글과 단추 글이 바뀝니다. */
function setAskMode(on: boolean): void {
  const wasOn = game.askMode;
  game.askMode = on;
  ui.askGm.classList.toggle('is-on', on);
  ui.say.classList.toggle('ask', on);
  ui.askGm.setAttribute('aria-pressed', on ? 'true' : 'false');
  ui.freeSend.textContent = on ? '묻기' : '말하기';
  if (on) {
    // 켜기 전 안내 글을 저장해 두었다가 끌 때 되돌린다.
    if (!wasOn) askSavedPlaceholder = ui.freeInput.placeholder;
    ui.freeInput.placeholder = '🦊 GM에게 묻기';
    ui.freeInput.focus();
  } else if (wasOn) ui.freeInput.placeholder = askSavedPlaceholder;
}

const TWIST_LABEL: Record<TwistEvent['result'], string> = { none: '그대로', altered: '달라진 결', interrupt: '끼어드는 일' };

/** 장면 검사는 규칙 목소리라 화면이 낸다: 긴장·눈·결과 한 줄. 다음 장면이나 판정까지 남는다. */
function showTwist(ev: TwistEvent): void {
  const text = `긴장 ${ev.tension} · 주사위 ${ev.roll} → ${TWIST_LABEL[ev.result]}`;
  ui.twistText.textContent = text;
  ui.twistLine.dataset.result = ev.result;
  ui.twistLine.hidden = false;
  game.backlog.push({ who: '장면 검사', text, by: 'script' });
}

function showPrice(ev: PriceEvent): void {
  ui.priceTag.textContent = ev.tag;
  ui.priceText.textContent = ev.text;
  ui.priceLine.hidden = false;
  game.backlog.push({ who: '대가', text: `${ev.tag} — ${ev.text}`, by: 'script' });
}

/** 판정 결과 컯인: 연출만 있고 주사위를 누르는 일을 막지 않는다. */
const CUTIN_MS = 800;
const CRIT_TOTAL = 12;
function showCutin(kind: 'crit' | 'miss'): void {
  const url = game.manifest?.cutins[kind];
  if (!url) return;
  for (const running of ui.cutin.getAnimations()) running.cancel();
  ui.cutin.src = url;
  ui.cutin.hidden = false;
  const hide = () => {
    if (ui.cutin.getAnimations().length === 0) ui.cutin.hidden = true;
  };
  ui.cutin.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: CUTIN_MS, easing: 'ease' }).finished.then(hide, hide);
}

async function showRoll(ev: RollEvent): Promise<void> {
  mascot(null);
  setPhase('dice');
  ui.priceLine.hidden = true;
  ui.twistLine.hidden = true;
  ui.dice.hidden = false;
  delete ui.dice.dataset.tier;
  ui.diceLabel.textContent = `${ev.label} · ${ev.stat} 판정`;
  ui.diceFormula.textContent = '';
  ui.diceTier.textContent = '';
  ui.diceNote.textContent = '';
  for (const die of [ui.dieA, ui.dieB]) {
    die.classList.remove('landed');
    die.classList.add('rolling');
  }
  const until = performance.now() + (FAST ? 120 : 1100);
  while (performance.now() < until) {
    ui.dieA.dataset.face = String(1 + Math.floor(Math.random() * 6));
    ui.dieB.dataset.face = String(1 + Math.floor(Math.random() * 6));
    await sleep(70);
  }
  ui.dieA.dataset.face = String(ev.dice[0]);
  ui.dieB.dataset.face = String(ev.dice[1]);
  for (const die of [ui.dieA, ui.dieB]) {
    die.classList.remove('rolling');
    die.classList.add('landed');
  }
  const mods = ev.mods.map((m) => ` ${signed(m.value)}(${m.label})`).join('');
  ui.diceFormula.textContent = `${ev.dice[0]} + ${ev.dice[1]} ${signed(ev.statValue)}(${ev.stat})${mods} = ${ev.total} / 목표 10`;
  ui.diceTier.textContent = ev.tierLabel;
  ui.dice.dataset.tier = ev.tier;
  if (ev.total >= CRIT_TOTAL) showCutin('crit');
  else if (ev.tier === 'miss') showCutin('miss');
  ui.diceNote.textContent =
    ev.tier === 'hit' ? '10 이상 · 원하는 대로 된다' : ev.tier === 'mixed' ? '7~9 · 해내지만 대가가 따른다' : '6 이하 · 실패';
  game.backlog.push({ who: '판정', text: `${ev.label}: ${ui.diceFormula.textContent} → ${ev.tierLabel}`, by: 'script' });
  await waitAdvance();
  ui.dice.hidden = true;
  setPhase('story');
}

function trackText(t: { value: number; max: number; unit: string }): string {
  return t.unit ? `${t.value}${t.unit}` : `${t.value} / ${t.max}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 켜진 칸 수를 맞춘다. 차오르는 시계는 찬 만큼, 줄어드는 시계는 남은 만큼이 켜져 있다. 값이 징조 문턱 안이면 시계 전체가 위험 색이 된다. */
function setClockFace(face: Element, value: number): void {
  face.querySelectorAll('.seg').forEach((seg, i) => seg.classList.toggle('on', i < value));
  const el = face as HTMLElement | SVGElement;
  const warnAt = Number(el.dataset.warnAt ?? 'NaN');
  const danger = Number.isFinite(warnAt) && (el.dataset.kind === 'progress' ? value >= warnAt : value <= warnAt);
  face.classList.toggle('danger', danger);
}

/**
 * Blades 식 조각 시계. 칸 수는 max, 위 가운데에서 시계 방향으로 채운다.
 * warn 칸은 작은 끝의 징조 문턱 안쪽(차오름: warnAt 번째 칸부터, 줄어듦: 마지막 warnAt 칸).
 */
function clockFace(t: TrackView): SVGSVGElement {
  const n = t.max;
  const c = 16;
  const r = 14;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.classList.add('clock-face');
  svg.dataset.kind = t.clock?.kind ?? '';
  const warnAt = t.clock?.warnAt;
  if (warnAt !== undefined) svg.dataset.warnAt = String(warnAt);
  for (let i = 0; i < n; i++) {
    const a0 = ((-90 + (360 / n) * i) * Math.PI) / 180;
    const a1 = ((-90 + (360 / n) * (i + 1)) * Math.PI) / 180;
    const seg = document.createElementNS(SVG_NS, 'path');
    seg.setAttribute('d', `M${c} ${c} L${(c + r * Math.cos(a0)).toFixed(2)} ${(c + r * Math.sin(a0)).toFixed(2)} A${r} ${r} 0 0 1 ${(c + r * Math.cos(a1)).toFixed(2)} ${(c + r * Math.sin(a1)).toFixed(2)} Z`);
    seg.classList.add('seg');
    const danger = warnAt !== undefined && (t.clock?.kind === 'progress' ? i + 1 >= warnAt : i < warnAt);
    if (danger) seg.classList.add('warn');
    svg.append(seg);
  }
  setClockFace(svg, t.value);
  return svg;
}

function trackRow(t: TrackView): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'track';
  li.dataset.track = t.key;
  li.dataset.max = String(t.max);
  li.dataset.unit = t.unit;
  li.title = t.desc;
  li.innerHTML = TRACK_ICON[t.key] ?? '';
  if (t.clock) {
    li.classList.add('is-clock', t.clock.kind);
    li.append(span('label', t.label), span('value', trackText(t)), clockFace(t));
    return li;
  }
  const bar = document.createElement('span');
  bar.className = 'bar';
  const fill = document.createElement('i');
  fill.style.setProperty('--v', String(t.value / t.max));
  bar.append(fill);
  li.append(span('label', t.label), span('value', trackText(t)), bar);
  return li;
}

function tone(key: string, diff: number): string {
  if (key === '의심') return diff > 0 ? 'bad' : 'good';
  if (key === '귀찌') return diff < 0 ? 'bad' : 'good';
  if (key === '탈주') return diff > 0 ? 'good' : 'bad';
  return 'warm';
}

function applyTrackChanges(changes: TrackChange[]): void {
  for (const c of changes) {
    const row = ui.tracks.querySelector<HTMLElement>(`[data-track="${c.key}"]`);
    if (!row) continue;
    const max = Number(row.dataset.max ?? '10');
    row.querySelector<HTMLElement>('.bar i')?.style.setProperty('--v', String(c.to / max));
    const face = row.querySelector('.clock-face');
    if (face) setClockFace(face, c.to);
    const value = row.querySelector('.value');
    if (value) value.textContent = trackText({ value: c.to, max, unit: row.dataset.unit ?? '' });
    const diff = c.to - c.from;
    const delta = span(`delta ${tone(c.key, diff)}`, signed(diff));
    row.append(delta);
    window.setTimeout(() => delta.remove(), 1500);
    replay(row, 'pulse');
  }
}

/** 남자를 만나기 전에는 그 남자의 마음(의심·집착·호감)을 숨긴다. */
function applyGate(gates: Hud['trackGate']): void {
  const hidden = new Set(gates.flatMap((g) => g.tracks));
  ui.tracksHead.hidden = hidden.has('의심');
  for (const li of ui.tracks.querySelectorAll<HTMLElement>('.track')) li.style.display = hidden.has(li.dataset.track as Track) ? 'none' : '';
}

/** 남은 시간을 위쪽에 보여 준다. 해의 위치는 장면 배경, 귀찌는 수치 그대로다. */
function renderClock(earring?: number): void {
  const bg = game.view.scene?.bg ?? '';
  const when = bg === 'desert_dusk' ? '해 질 녘' : bg === 'desert_night' ? '밤' : '한낮';
  const value = earring ?? game.hud?.tracks.find((v) => v.key === '귀찌')?.value;
  ui.clock.hidden = value === undefined || !game.view.scene;
  ui.clock.textContent = `${when} · 귀찌 ${value ?? ''}`;
  ui.tension.hidden = !game.hud || !game.view.scene;
  ui.tension.textContent = `긴장 ${game.hud?.tension ?? ''}`;
  ui.tension.title = '장면이 시작될 때 주사위가 이 값 이하면 장면이 달라진다. 판정 성공 -1, 실패 +1.';
}

function renderHud(hud: Hud): void {
  queueMicrotask(() => renderClock());
  game.hud = hud;
  ui.episode.textContent = hud.episode;
  ui.beatTitle.textContent = hud.beatTitle;
  ui.tracks.replaceChildren(...hud.tracks.map(trackRow));
  applyGate(hud.trackGate);
  ui.abilities.replaceChildren(
    ...hud.abilities.map((a) => {
      const li = document.createElement('li');
      const value = document.createElement('b');
      value.textContent = signed(a.value);
      li.append(value, a.key);
      return li;
    }),
  );
  ui.items.replaceChildren(
    ...hud.items.map((item) => {
      const li = document.createElement('li');
      const url = game.manifest?.items[item.id];
      if (url) {
        const art = document.createElement('img');
        art.src = url;
        art.alt = '';
        li.append(art);
      }
      li.append(item.name);
      li.title = item.desc;
      return li;
    }),
  );
}

async function showEnding(ev: EndingEvent): Promise<void> {
  mascot(null);
  setPhase('ending');
  showCg(undefined);
  ui.sfx.classList.remove('go');
  ui.endingKicker.textContent = ev.bad ? '작은 끝' : '결말';
  ui.ending.classList.toggle('bad', ev.bad);
  ui.endingTitle.textContent = ev.title;
  ui.endingSummary.textContent = ev.summary;
  ui.ending.hidden = false;
  await waitAdvance();
  ui.ending.hidden = true;
  setPhase('story');
}

/** 플레이어가 끼어들면 남은 줄을 멈추고 GM 답을 먼저 보여 준 뒤, 고쳐진 남은 줄을 돌려준다. */
async function interject(rest: GameEvent[], gen: number): Promise<GameEvent[]> {
  const text = game.inputs.shift() ?? '';
  const pending = rest.flatMap((ev, i) => (ev.type === 'line' ? [{ i, text: ev.text, ...(ev.if !== undefined ? { if: ev.if } : {}) }] : []));
  const shown = game.backlog.slice(-12).map((b) => ({ speaker: b.who, text: b.text }));
  let left = rest;
  const silent: GameEvent[] = [];
  const outer = game.after;
  game.after = [...left, ...outer];
  const ok = await runStream({ type: 'interject', text, scene: game.view.scene?.beat ?? null, shown, pending }, gen, (ev) => {
    if (ev.jump) {
      silent.push(...left.filter((e) => e.type !== 'line'));
      left = [];
    } else {
      const drop = new Set(ev.drop);
      left = left.filter((_, i) => !drop.has(i));
    }
    game.after = [...left, ...outer];
  }, silent);
  game.after = outer;
  return ok ? left : [];
}

/** 이야기 줄이 흐르는 중에 온 질문에 답하고 남은 줄로 돌아온다. 그만두기를 물었으면 답을 받을 때까지 이야기를 멈춘다. */
async function askAside(rest: GameEvent[], gen: number): Promise<GameEvent[]> {
  const text = game.asks.shift() ?? '';
  const outer = game.after;
  game.after = [...rest, ...outer];
  game.answering = true;
  let ok = await runStream({ type: 'ask', text, scene: game.view.scene?.beat ?? null }, gen);
  game.answering = false;
  let left = rest;
  if (ok && ui.confirm.open) {
    const quit = await new Promise<boolean>((resolve) => {
      game.onConfirm = resolve;
    });
    ok = await runStream({ type: 'confirm', ok: quit }, gen);
    if (quit) left = [];
  }
  game.after = outer;
  return ok ? left : [];
}

async function play(events: GameEvent[], gen: number): Promise<boolean> {
  let rest = events.slice();
  for (;;) {
    if (gen !== game.gen) return false;
    if (game.asks.length && !game.streaming && !game.answering) {
      rest = await askAside(rest, gen);
      continue;
    }
    if (game.inputs.length && !game.streaming) {
      rest = await interject(rest, gen);
      continue;
    }
    const ev = rest.shift();
    if (!ev) break;
    game.remaining = [...rest, ...game.after];
    switch (ev.type) {
      case 'revise':
        break;
      case 'scene':
        // 새 장면에 대사가 없으면 화면에는 앞 장면의 마지막 줄이 남는다. 저장도 그 줄을 기억한다.
        game.view = { scene: ev, line: game.view.line, dialog: game.view.dialog };
        setScene(ev);
        renderClock();
        break;
      case 'line':
        // 새 질문이 기다리면 앞 답의 남은 줄은 화면에 올리지 않고 기록에만 남긴다.
        if (game.answering && game.asks.length) {
          game.backlog.push({ who: ev.display, text: shownText(ev.style, ev.text), by: ev.by });
          break;
        }
        game.view.line = ev;
        if (ev.style !== 'gm') game.view.dialog = ev;
        await showLine(ev);
        break;
      case 'echo':
        showEcho(ev.text);
        break;
      case 'roll':
        await showRoll(ev);
        break;
      case 'sprite':
        swapSprite(ev.cast, ev.sprite);
        break;
      case 'tracks':
        applyTrackChanges(ev.changes);
        renderClock(ev.changes.find((c) => c.key === '귀찌')?.to);
        break;
      case 'price':
        showPrice(ev);
        break;
      case 'twist':
        showTwist(ev);
        break;
      case 'confirm':
        showConfirm(ev.text, ev.yes, ev.no);
        break;
      case 'notice':
        toast('질문은 오른쪽 🦊 GM 단추로 물어 봐.');
        break;
      case 'items':
        for (const item of ev.gained) toast(`얻음: ${item.name}`);
        for (const item of ev.lost) toast(`잃음: ${item.name}`);
        break;
      case 'note':
        toast(`수첩에 적었다 · ${ev.name}`);
        if (game.hud?.trackGate.some((g) => g.note === ev.id)) {
          game.hud = { ...game.hud, trackGate: game.hud.trackGate.filter((g) => g.note !== ev.id) };
          applyGate(game.hud.trackGate);
        }
        break;
      case 'ending':
        await showEnding(ev);
        break;
    }
  }
  return gen === game.gen;
}

function renderChoices(options: ChoiceView[]): void {
  mascot(null);
  highlight(game.dialogSpeaker);
  ui.sfx.classList.remove('go');
  ui.more.hidden = true;
  ui.choices.replaceChildren(
    ...options.map((o, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice';
      button.dataset.id = o.id;
      button.append(span('num', String(i + 1)), span('text', o.text));
      if (o.check) button.append(span('tag', `${o.check.stat} ${signed(o.check.statValue)} · 판정`));
      button.addEventListener('click', () => void act({ type: 'choose', id: o.id }));
      return button;
    }),
  );
  ui.choices.hidden = false;
  setPhase('choices');
}

function renderFree(p: FreePrompt): void {
  ui.sfx.classList.remove('go');
  ui.more.hidden = true;
  ui.free.classList.remove('busy');
  ui.thinking.hidden = true;
  ui.freePrompt.textContent = p.placeholder;
  ui.freeAim.hidden = true;
  ui.stage.dataset.gm = '0';
  // 장면 목표(aim)는 화면에 띄우지 않는다. 안내는 입력칸 위 prompt 한 줄과 접근법 단추가 전부다(18차).
  mascot(null);
  highlight(game.dialogSpeaker);
  setStoryPlaceholder(p.example ? `예: ${p.example}` : '말하거나 행동하기');
  ui.freeMeta.textContent = '';
  ui.approaches.replaceChildren(
    ...p.approaches.map((a) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = a.id;
      button.disabled = a.locked;
      button.append(a.label, small(`${a.stat} ${signed(a.statValue)}`));
      button.addEventListener('click', () => void act({ type: 'approach', id: a.id }));
      return button;
    }),
  );
  ui.free.hidden = false;
  setPhase('free');
  ui.freeInput.focus({ preventScroll: true });
}

/** 실패 직후 행운을 쓸지 고른다. 입력칸에 쳐도 된다. */
function renderLuck(need: number): void {
  const make = (id: string, label: string, use: boolean) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.dataset.id = id;
    button.append(span('text', label));
    button.addEventListener('click', () => void act({ type: 'luck', use }));
    return button;
  };
  ui.choices.replaceChildren(make('luck-use', `행운 ${need} 쓰기`, true), make('luck-skip', '그대로 간다', false));
  ui.more.hidden = true;
  ui.gmMore.hidden = true;
  ui.choices.hidden = false;
  setPhase('choices');
}

function renderPrompt(prompt: Prompt): void {
  game.prompt = prompt;
  if (prompt.type === 'choices') renderChoices(prompt.options);
  else if (prompt.type === 'luck') renderLuck(prompt.need);
  else if (prompt.type === 'free') renderFree(prompt);
  else void showResult();
}

async function runStep(step: Step, hudFirst = false): Promise<void> {
  const gen = game.gen;
  if (hudFirst) renderHud(step.hud);
  setPhase('story');
  game.latest = { prompt: step.prompt, hud: step.hud };
  game.busy = true;
  const current = await play(step.events, gen);
  if (!current) return;
  game.busy = false;
  settle();
}

/** 이야기가 입력 자리까지 왔다. 밀린 입력이 있으면 그 자리에서 바로 처리한다. */
function settle(): void {
  const latest = game.latest;
  if (!latest) return;
  renderHud(latest.hud);
  renderPrompt(latest.prompt);
  const ask = game.asks.shift();
  if (ask !== undefined) {
    void act({ type: 'ask', text: ask });
    return;
  }
  const text = game.inputs.shift();
  if (text === undefined) return;
  if (latest.prompt.type === 'free' || latest.prompt.type === 'luck') void act({ type: 'free', text });
  else if (latest.prompt.type === 'choices') void act({ type: 'interject', text, scene: game.view.scene?.beat ?? null, shown: [], pending: [] });
  else game.inputs = [];
}

type ActMessage = { event: GameEvent } | { done: { prompt: Prompt; hud: Hud } } | { error: string };

/** 응답 본문은 오는 대로 끝까지 받아 큐에 담고, 화면은 자기 속도로 하나씩 꺼낸다. 천천히 읽으면 브라우저가 요청을 취소로 표시한다. */
function actStream(session: string, action: Action): { next(): Promise<IteratorResult<ActMessage, undefined>> } {
  const queue: ActMessage[] = [];
  let finished = false;
  game.live = { queue, ended: () => finished };
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };
  void (async () => {
    try {
      const res = await fetch('/api/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session, action }) });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `요청이 실패했습니다 (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line) queue.push(JSON.parse(line) as ActMessage);
        notify();
      }
    } catch (err) {
      failure = err as Error;
    } finally {
      finished = true;
      notify();
    }
  })();
  return {
    async next() {
      for (;;) {
        const value = queue.shift();
        if (value !== undefined) return { value, done: false };
        if (failure) throw failure;
        if (finished) return { value: undefined, done: true };
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    },
  };
}

function gmThinking(): void {
  mascot('thinking');
  ui.gmMore.hidden = true;
  ui.gmText.replaceChildren(span('waiting', 'GM이 장면을 쓰는 중'), span('dots', ''));
}

function showWaiting(): void {
  setPhase('thinking');
  gmThinking();
  ui.stage.dataset.gm = '1';
}

/** 행동 하나를 서버에 보내고 오는 사건을 재생한다. 그 사이 입력이 들어오면 응답을 끝까지 받은 뒤 처리해 순서가 꼬이지 않게 한다. */
async function runStream(action: Action, gen: number, onRevise?: (ev: ReviseEvent) => void, silent?: GameEvent[]): Promise<boolean> {
  const session = game.session;
  if (!session) return false;
  const stream = actStream(session, action);
  if (action.type === 'free') resetFaces();
  const held: GameEvent[] = [];
  // 앞 입력에 대한 답은 다 보여 주고 다음 입력을 받는다. 이야기 줄은 다음 입력이 끊을 수 있다.
  let answerFirst = action.type === 'interject';
  game.streaming = true;
  try {
    for (;;) {
      const pending = stream.next();
      const quick = await Promise.race([pending, sleep(WAIT_AFTER_MS).then(() => null)]);
      if (gen !== game.gen) return false;
      if (quick === null) showWaiting();
      const item = quick ?? (await pending);
      if (gen !== game.gen) return false;
      if (item.done) break;
      const message = item.value;
      if ('error' in message) throw new Error(message.error);
      if ('done' in message) {
        game.latest = message.done;
        continue;
      }
      if (message.event.type === 'revise') {
        onRevise?.(message.event);
        if (message.event.jump) answerFirst = false;
        if (silent?.length && !(await play(silent.splice(0), gen))) return false;
        continue;
      }
      if (game.inputs.length || (game.asks.length && !game.answering)) {
        held.push(message.event);
        continue;
      }
      if (!(await play([message.event], gen))) return false;
    }
    // 밀린 입력은 앞 입력의 답을 다 보여 준 뒤에 처리한다.
    game.streaming = answerFirst;
    return await play(held, gen);
  } finally {
    game.streaming = false;
  }
}

async function act(action: Action): Promise<void> {
  if (game.busy || !game.session) return;
  game.busy = true;
  game.answering = action.type === 'ask';
  const gen = game.gen;
  const previous = game.prompt;
  ui.choices.hidden = true;
  ui.free.hidden = true;
  if (action.type === 'free' || action.type === 'ask') showWaiting();
  else setPhase('story');
  try {
    const ok = await runStream(action, gen);
    if (!ok) return;
    game.busy = false;
    game.answering = false;
    settle();
  } catch (err) {
    if (gen !== game.gen) return;
    game.busy = false;
    game.answering = false;
    ui.text.textContent = '';
    toast((err as Error).message);
    if (previous) renderPrompt(previous);
  }
}

function resetStage(): void {
  game.gen += 1;
  finishTyping?.();
  const pending = resolveAdvance;
  resolveAdvance = null;
  pending?.();
  for (const node of [ui.choices, ui.free, ui.dice, ui.ending, ui.echo]) node.hidden = true;
  ui.text.textContent = '';
  ui.name.hidden = true;
  ui.gmBadge.hidden = true;
  mascot(null);
  showCg(undefined);
  game.busy = false;
  game.answering = false;
  game.onConfirm = null;
  game.asks = [];
  game.view = { scene: null, line: null, dialog: null };
  game.remaining = [];
  game.inputs = [];
  game.live = null;
  game.skipWait = false;
  game.after = [];
  game.latest = null;
  game.dialogSpeaker = '';
  ui.freeInput.value = '';
}

function startSession(session: string, step: Step): void {
  resetStage();
  game.session = session;
  game.backlog = [];
  game.bgRef = null;
  ui.title.hidden = true;
  ui.result.hidden = true;
  void runStep(step, true);
}

function restoreSession(session: string, step: Step, view: SavedView): void {
  resetStage();
  game.session = session;
  game.backlog = view.backlog.slice();
  game.bgRef = null;
  ui.title.hidden = true;
  ui.result.hidden = true;
  const gen = game.gen;
  game.busy = true;
  void (async () => {
    renderHud(step.hud);
    setPhase('story');
    if (view.scene) {
      game.view = { scene: view.scene, line: null, dialog: null };
      setScene(view.scene);
      for (const [speaker, face] of Object.entries(view.faces ?? {})) setFace(speaker, face);
    }
    // 마지막 줄이 여우 줄이면 대사창의 화자·마지막 대사를 먼저 되살리고 그 위에 여우 줄을 얹는다.
    if (view.dialog && view.dialog !== view.line && view.line?.style === 'gm') {
      game.view.dialog = view.dialog;
      await showLine(view.dialog, 'still');
    }
    if (view.line) {
      game.view.line = view.line;
      if (view.line.style !== 'gm') game.view.dialog = view.line;
      await showLine(view.line, view.remaining.length ? 'wait' : 'still');
    }
    game.latest = { prompt: step.prompt, hud: step.hud };
    if (!(await play(view.remaining, gen))) return;
    game.busy = false;
    settle();
  })();
}

async function newGame(): Promise<void> {
  const seed = params.get('seed');
  const body = seed === null ? {} : { seed: /^\d+$/.test(seed) ? Number(seed) : seed };
  const data = await api<{ session: string; step: Step }>('/api/new', body);
  startSession(data.session, data.step);
}

function replayRow(e: ResultSummary['replay'][number]): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `replay-${e.kind}`;
  if (e.kind === 'decision') {
    li.append(`${e.text} `, small(e.detail));
  } else if (e.kind === 'price') {
    li.append(span('price-label', '대가'), span('', `${e.tag} — ${e.text}`));
  } else {
    const mods = e.mods.reduce((sum, m) => sum + m.value, 0);
    li.append(
      span('', `${e.label} (${e.stat} ${signed(e.statValue)}${mods ? `, 보정 ${signed(mods)}` : ''})`),
      span('replay-dice', `주사위 ${e.dice[0]}·${e.dice[1]} + 수치 ${e.statValue + mods}${e.luck ? ` + 행운 ${e.luck}` : ''} = ${e.total} / 목표 10`),
      span(`replay-tier tier-${e.tier}`, e.tierLabel),
    );
  }
  return li;
}

/** 일어난 순서대로 놓고, 장면이 바뀔 때마다 장면 이름을 한 줄 넣는다. */
function replayRows(replay: ResultSummary['replay']): HTMLLIElement[] {
  const rows: HTMLLIElement[] = [];
  let scene: string | null = null;
  for (const e of replay) {
    if (e.beatTitle !== scene) {
      scene = e.beatTitle;
      const head = document.createElement('li');
      head.className = 'replay-scene';
      head.textContent = scene;
      rows.push(head);
    }
    rows.push(replayRow(e));
  }
  return rows;
}

async function showResult(): Promise<void> {
  mascot(null);
  if (!game.session) return;
  const r = await api<ResultSummary & { fork: boolean }>(`/api/result?session=${encodeURIComponent(game.session)}`);
  // 작은 끝은 마지막 갈림길(자동 저장)에서 다시 할 수 있고, 큰 갈래 끝은 지금처럼 다시 하기만 보인다.
  const bad = r.ending?.bad === true;
  const forkBtn = byId<HTMLButtonElement>('btn-fork');
  forkBtn.hidden = !bad;
  forkBtn.disabled = !r.fork;
  byId('btn-again').textContent = bad ? '처음부터' : '다시 하기';
  ui.result.classList.toggle('bad', bad);
  ui.resultEpisode.textContent = r.episode;
  ui.resultTitle.textContent = r.ending?.title ?? '이야기의 끝';
  ui.resultSummary.textContent = r.ending?.summary ?? '';
  ui.resultHook.textContent = r.ending?.nextHook ?? '';
  ui.resultReplay.replaceChildren(...replayRows(r.replay));
  ui.resultTracks.replaceChildren(...r.tracks.map(trackRow));
  const stats: [string, string][] = [
    ['플레이 시간', formatTime(r.playMs)],
    ['판정', `${r.checks.length}회`],
    ['선택과 입력', `${r.decisions.length}회`],
  ];
  ui.resultStats.replaceChildren(
    ...stats.map(([key, value]) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = key;
      li.append(b, ` ${value}`);
      return li;
    }),
  );
  ui.result.hidden = false;
  updateResultMore();
  setPhase('result');
}

/** 결과 화면 아래에 더 볼 글이 남았을 때만 표시를 띄운다. 마지막 줄이 보이면 남은 것은 여백뿐이다. */
function updateResultMore(): void {
  ui.resultMore.hidden = ui.resultCredit.getBoundingClientRect().bottom <= ui.result.getBoundingClientRect().bottom;
}

async function openSlots(mode: 'save' | 'load'): Promise<void> {
  ui.slotsTitle.textContent = mode === 'save' ? '저장할 칸을 고르세요' : '불러올 칸을 고르세요';
  const { saves } = await api<{ saves: SaveMeta[] }>('/api/saves');
  ui.slotsList.replaceChildren(
    ...SAVE_SLOTS.map((slot, i) => {
      const meta = saves.find((s) => s.slot === slot);
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.slot = slot;
      button.append(
        `${i + 1}번 칸 · ${meta ? meta.beatTitle : '비어 있음'}`,
        small(meta ? `${new Date(meta.savedAt).toLocaleString('ko-KR')} · 플레이 ${formatTime(meta.playMs)}` : '저장된 내용 없음'),
      );
      button.disabled = mode === 'load' ? !meta : !game.session || (game.live !== null && !game.live.ended());
      button.addEventListener('click', () => void (mode === 'save' ? saveTo(slot) : loadFrom(slot)));
      li.append(button);
      return li;
    }),
  );
  ui.slotsDialog.showModal();
}

async function saveTo(slot: string): Promise<void> {
  const unread = (game.live?.queue ?? []).flatMap((m) => ('event' in m && m.event.type !== 'revise' ? [m.event] : []));
  const view: SavedView = { scene: game.view.scene, line: game.view.line, dialog: game.view.dialog, remaining: [...unread, ...game.remaining], backlog: game.backlog, faces: { ...game.faces } };
  const { meta } = await api<{ meta: SaveMeta }>('/api/save', { session: game.session, slot, view });
  ui.slotsDialog.close();
  toast(`'${meta.beatTitle}' 장면을 저장했습니다`);
}

async function loadFrom(slot: string): Promise<void> {
  ui.slotsDialog.close();
  const data = await api<{ session: string; step: Step; view: SavedView | null }>('/api/load', { slot });
  if (data.view?.scene) restoreSession(data.session, data.step, data.view);
  else startSession(data.session, data.step);
  toast('저장한 장면을 불러왔습니다');
}

function openNotes(): void {
  const notes = game.hud?.notes ?? [];
  const kinds = [...new Set(notes.map((n) => n.kind))];
  ui.notesList.replaceChildren(
    ...kinds.map((kind) => {
      const section = document.createElement('section');
      const h = document.createElement('h3');
      h.textContent = kind;
      const list = document.createElement('ul');
      list.append(
        ...notes
          .filter((n) => n.kind === kind)
          .map((n) => {
            const li = document.createElement('li');
            li.append(span('note-name', n.name), span('note-text', n.text));
            return li;
          }),
      );
      section.append(h, list);
      return section;
    }),
  );
  ui.notesDialog.showModal();
}

function openLog(): void {
  ui.logList.replaceChildren(
    ...game.backlog.map((line) => {
      const li = document.createElement('li');
      li.append(span('who', line.who), line.text);
      return li;
    }),
  );
  ui.logDialog.showModal();
  ui.logList.scrollTop = ui.logList.scrollHeight;
}

interface AtlasView {
  cols: number;
  rows: number;
  nodes: { key: string; col: number; row: number; ending: boolean; label: string | null; onPath: boolean }[];
  edges: { from: string; to: string; seen: boolean; onPath: boolean }[];
  /** 작은 끝. 도달한 것만 제목이 있다. */
  fates: { key: string; reached: boolean; label: string | null }[];
}

/** 지도 선. 곧은 선은 옆 칸을 스치므로, 줄을 바꾸는 구간은 칸이 없는 열 경계(gapX)로만 지나간다. 좌표는 지도 크기의 백분율이다. */
function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, gapX: number): string {
  if (a.x === b.x || a.y === b.y) return `M${a.x} ${a.y}L${b.x} ${b.y}`;
  const cornerX = 0.8;
  const cornerY = Math.sign(b.y - a.y) * 1.8;
  return `M${a.x} ${a.y}H${gapX - cornerX}Q${gapX} ${a.y} ${gapX} ${a.y + cornerY}V${b.y - cornerY}Q${gapX} ${b.y} ${gapX + cornerX} ${b.y}H${b.x}`;
}

/** 서버가 준 칸을 그린다. 안 가 본 칸은 서버가 이름을 주지 않아 ??? 로만 그릴 수 있다. */
async function openAtlas(): Promise<void> {
  const view = await api<AtlasView>('/api/atlas');
  const at = (col: number, row: number) => ({ x: ((col + 0.5) / view.cols) * 100, y: ((row + 0.5) / view.rows) * 100 });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'atlas-lines');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  const place = new Map(view.nodes.map((n) => [n.key, n]));
  // 겹치는 구간에서 진한 선이 위로 오게 옇은 선부터 그린다.
  const weight = (e: AtlasView['edges'][number]) => (e.onPath ? 2 : e.seen ? 1 : 0);
  for (const e of [...view.edges].sort((p, q) => weight(p) - weight(q))) {
    const from = place.get(e.from);
    const to = place.get(e.to);
    if (!from || !to) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edgePath(at(from.col, from.row), at(to.col, to.row), ((from.col + 1) / view.cols) * 100));
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.setAttribute('class', e.onPath ? 'on-path' : e.seen ? 'seen' : 'unseen');
    svg.append(path);
  }
  const cells = view.nodes.map((n) => {
    const p = at(n.col, n.row);
    const cell = document.createElement('div');
    cell.className = `atlas-node${n.ending ? ' atlas-ending' : ''}${n.label === null ? ' unseen' : ''}${n.onPath ? ' on-path' : ''}`;
    cell.style.left = `${p.x}%`;
    cell.style.top = `${p.y}%`;
    cell.textContent = n.label ?? '???';
    if (n.label === null) {
      cell.dataset.key = n.key;
      cell.addEventListener('click', () => void showHint(cell, n.key));
    }
    return cell;
  });
  ui.atlasMap.replaceChildren(svg, ...cells);
  // 작은 끝은 칸이 아니라 지도 아래 작은 점 줄이다. 도달한 것만 제목이 붙고, 나머지는 민 점으로만 보인다.
  const fates = byId('atlas-fates');
  fates.hidden = view.fates.length === 0;
  fates.replaceChildren(
    span('atlas-fates-label', '작은 끝'),
    ...view.fates.map((f) => {
      const dot = document.createElement('span');
      dot.className = `atlas-fate${f.reached ? ' reached' : ''}`;
      dot.textContent = f.label ?? '';
      return dot;
    }),
  );
  byId('atlas-hint').hidden = true;
  ui.toast.hidden = true;
  ui.atlasDialog.showModal();
}

async function showHint(cell: HTMLElement, key: string): Promise<void> {
  const hint = await api<{ text: string }>('/api/atlas/hint', { key });
  for (const other of ui.atlasMap.querySelectorAll('.hinted')) other.classList.remove('hinted');
  cell.classList.add('hinted');
  byId('atlas-hint-text').textContent = hint.text;
  const fox = asset('sprites', 'gm_smile');
  if (fox?.url) byId<HTMLImageElement>('atlas-hint-img').src = fox.url;
  byId('atlas-hint').hidden = false;
}

function goTitle(): void {
  resetStage();
  game.session = null;
  ui.result.hidden = true;
  ui.title.hidden = false;
  setPhase('title');
}

async function boot(): Promise<void> {
  const [manifest, health] = await Promise.all([api<Manifest>('/api/manifest'), api<Health>('/api/health').catch(() => null)]);
  game.manifest = manifest;
  const askFace = manifest.sprites['gm'];
  if (askFace) byId<HTMLImageElement>('ask-gm-face').src = askFace.url;
  for (const url of [manifest.cutins.crit, manifest.cutins.miss]) if (url) new Image().src = url;
  for (const sprite of Object.values(manifest.sprites)) new Image().src = sprite.url;
  ui.titleSub.textContent = `${manifest.episode} — ${manifest.title}`;
  for (const node of document.querySelectorAll('.credit-line')) node.textContent = manifest.credit;
  if (manifest.titleLogo) {
    const logo = byId<HTMLImageElement>('title-logo');
    logo.src = manifest.titleLogo;
    logo.hidden = false;
    byId('title-text').hidden = true;
  }
  ui.episode.textContent = manifest.episode;
  const ok = health?.llm.ok === true;
  const label = health?.model?.label ?? health?.llm.model ?? '로컬 모델';
  ui.gmStatus.dataset.ok = ok ? '1' : '0';
  ui.gmStatus.textContent = ok ? '로컬 GM' : '로컬 GM 꺼짐';
  ui.gmStatus.title = ok ? label : '';
  ui.titleStatus.textContent = ok ? '로컬 GM 연결됨 · 오프라인' : '로컬 GM이 꺼져 있어 작가가 쓴 대사로만 진행합니다';
  setPhase('title');
}

const run = (fn: () => Promise<void>) => () => {
  fn().catch((err: unknown) => toast((err as Error).message));
};

byId('btn-new').addEventListener('click', run(newGame));
byId('btn-map').addEventListener('click', run(openAtlas));
byId('btn-map-result').addEventListener('click', run(openAtlas));
byId('atlas-close').addEventListener('click', () => ui.atlasDialog.close());
byId('atlas-new').addEventListener('click', run(async () => {
  ui.atlasDialog.close();
  await newGame();
}));
byId('btn-atlas-clear').addEventListener('click', run(async () => {
  await api('/api/atlas/reset', {});
  toast('기록을 지웠습니다');
}));
byId('btn-continue').addEventListener('click', run(() => openSlots('load')));
byId('btn-again').addEventListener('click', run(newGame));
byId('btn-fork').addEventListener('click', run(() => loadFrom('auto_fork')));
byId('btn-home').addEventListener('click', goTitle);
ui.result.addEventListener('scroll', updateResultMore);
byId('result-down').addEventListener('click', () => {
  ui.result.scrollTop = ui.result.scrollHeight;
});
byId('btn-save').addEventListener('click', run(() => openSlots('save')));
byId('btn-load').addEventListener('click', run(() => openSlots('load')));
byId('btn-log').addEventListener('click', openLog);
byId('btn-notes').addEventListener('click', openNotes);
byId('notes-close').addEventListener('click', () => ui.notesDialog.close());
byId('slots-close').addEventListener('click', () => ui.slotsDialog.close());
byId('log-close').addEventListener('click', () => ui.logDialog.close());
ui.dialog.addEventListener('click', advance);
ui.gmBox.addEventListener('click', advance);
ui.free.addEventListener('click', (event) => event.stopPropagation());
ui.askGm.addEventListener('click', (event) => {
  event.stopPropagation();
  setAskMode(!game.askMode);
});
ui.feedbackOpen.addEventListener('click', (event) => {
  event.stopPropagation();
  openFeedback();
});
ui.feedbackResult.addEventListener('click', openFeedback);
ui.feedbackClose.addEventListener('click', closeFeedback);
ui.feedbackForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void sendFeedback();
});
ui.feedback.addEventListener('click', (event) => event.stopPropagation());
ui.confirmOk.addEventListener('click', () => answerConfirm(true));
ui.confirmNo.addEventListener('click', () => answerConfirm(false));
// Esc 로 닫아도 '계속한다' 로 보낸다. 엔진이 답을 기다리는 상태를 남기지 않기 위해서다.
ui.confirm.addEventListener('cancel', (event) => {
  event.preventDefault();
  answerConfirm(false);
});
ui.dice.addEventListener('click', advance);
ui.ending.addEventListener('click', advance);
ui.say.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = ui.freeInput.value.trim();
  if (!text) {
    advance();
    return;
  }
  ui.freeInput.value = '';
  if (game.askMode) {
    // 질문 모드: 이야기 밖 말. 떠 있는 줄을 넘겨 바로 답하고, 이야기는 그 뒤 남은 줄로 돌아온다.
    setAskMode(false);
    if (game.busy) {
      game.asks.push(text);
      if (game.phase === 'line') {
        if (finishTyping) {
          game.skipWait = true;
          finishTyping();
        } else advance();
      }
      return;
    }
    void act({ type: 'ask', text });
    return;
  }
  if ((game.phase === 'free' || game.prompt?.type === 'luck') && (game.phase === 'free' || game.phase === 'choices') && !game.busy) {
    void act({ type: 'free', text });
    return;
  }
  game.inputs.push(text);
  // 글자가 찍히는 중이면 그 줄을 다 보여 주고, 기다리는 중이면 바로 넘어가 입력을 처리한다.
  if (finishTyping) {
    game.skipWait = true;
    finishTyping();
  } else advance();
});
ui.freeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
  if (event.key === 'Escape') ui.freeInput.blur();
});
document.addEventListener('keydown', (event) => {
  if (ui.slotsDialog.open || ui.logDialog.open || ui.notesDialog.open || ui.atlasDialog.open || event.target === ui.freeInput) return;
  // 칸을 누르지 않아도 글자를 치면 입력칸으로 들어간다. 스페이스와 엔터는 대사 넘기기로 남긴다.
  if (!ui.say.hidden && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key.length === 1 || event.key === 'Process') && event.key !== ' ' && !(game.phase === 'choices' && /^[1-9]$/.test(event.key))) {
    ui.freeInput.focus({ preventScroll: true });
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    advance();
    return;
  }
  if (game.phase === 'choices' && /^[1-9]$/.test(event.key)) {
    ui.choices.querySelectorAll('button')[Number(event.key) - 1]?.click();
  }
});
window.addEventListener('unhandledrejection', (event) => toast(String((event.reason as Error)?.message ?? event.reason)));

void boot().catch((err: unknown) => toast((err as Error).message));
