import type { ResultSummary } from '../src/engine/summary.ts';
import type { Action, ChoiceView, GameEvent, Hud, Prompt, Step, Track, TrackChange, TrackView } from '../src/engine/types.ts';

type LineEvent = Extract<GameEvent, { type: 'line' }>;
type RollEvent = Extract<GameEvent, { type: 'roll' }>;
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
  cast: Record<string, CastRef>;
}

interface Health {
  llm: { enabled: boolean; ok: boolean; model: string | null };
  model: { key: string; label: string; license: string } | null;
}

interface SavedView {
  scene: SceneEvent | null;
  line: LineEvent | null;
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
  diceNote: byId('dice-note'),
  ending: byId('ending'),
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
  resultChecks: byId('result-checks'),
  resultDecisions: byId('result-decisions'),
  resultTracks: byId('result-tracks'),
  resultStats: byId('result-stats'),
  slotsDialog: byId<HTMLDialogElement>('slots'),
  slotsTitle: byId('slots-title'),
  slotsList: byId('slots-list'),
  logDialog: byId<HTMLDialogElement>('log'),
  logList: byId('log-list'),
  toast: byId('toast'),
  mascot: byId('gm-mascot'),
  gmBox: byId('gm-box'),
  gmText: byId('gm-text'),
  gmMore: byId('gm-more'),
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
  view: { scene: null as SceneEvent | null, line: null as LineEvent | null },
  spriteOf: {} as Record<string, string>,
  faces: {} as Record<string, string>,
  remaining: [] as GameEvent[],
  hud: null as Hud | null,
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
  },
});

const TRACK_ICON: Record<string, string> = {
  의심: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  집착: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 1 0-5.6l2.8-2.8a4 4 0 0 1 5.6 5.6l-1.4 1.4"/><path d="M14 10a4 4 0 0 1 0 5.6l-2.8 2.8a4 4 0 0 1-5.6-5.6l1.4-1.4"/></svg>',
  호감: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  귀찌: '<svg viewBox="0 0 24 24"><path d="M12 3v4"/><circle cx="12" cy="10" r="3"/><path d="M12 13l-3 5h6z"/></svg>',
  탈주: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>',
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
  if (phase !== 'free') ui.freeInput.placeholder = '말하거나 행동하기';
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
  return new Promise((resolve) => {
    let shown = 0;
    const done = () => {
      window.clearInterval(timer);
      target.textContent = text;
      finishTyping = null;
      resolve();
    };
    const timer = window.setInterval(() => {
      shown += 1;
      target.textContent = chars.slice(0, shown).join('');
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
  if (game.bgRef) void paint(ui.bg, game.bgRef, 'cover');
  if (game.cgRef) {
    void paint(ui.cgBlur, game.cgRef, 'cover');
    void paint(ui.cgArt, game.cgRef, game.cgRef.fit ?? 'contain');
  }
});

function setScene(ev: SceneEvent): void {
  ui.beatTitle.textContent = ev.title;
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
    if (sprite) ui.slots[slot].querySelector('img')?.setAttribute('src', sprite.url);
  }
  game.faces[speaker] = face;
}

function swapSprite(castKey: string, sprite: string): void {
  game.spriteOf[castKey] = sprite;
  if (game.view.scene) game.view.scene = { ...game.view.scene, sprites: { ...game.spriteOf } };
  const ref = asset('sprites', sprite);
  if (!ref) return;
  for (const slot of SLOT_NAMES) if (game.cast[slot] === castKey) ui.slots[slot].querySelector('img')?.setAttribute('src', ref.url);
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
  }
  await typeText(target, text);
  more.hidden = false;
  await waitAdvance();
  ui.echo.hidden = true;
}

function showEcho(text: string): void {
  ui.echo.textContent = text;
  ui.echo.hidden = false;
  game.backlog.push({ who: '아시나(입력)', text, by: 'script' });
}

async function showRoll(ev: RollEvent): Promise<void> {
  mascot(null);
  setPhase('dice');
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
  ui.diceNote.textContent =
    ev.tier === 'hit' ? '10 이상 · 원하는 대로 된다' : ev.tier === 'mixed' ? '7~9 · 해내지만 대가가 따른다' : '6 이하 · 실패해도 이야기는 이어진다';
  game.backlog.push({ who: '판정', text: `${ev.label}: ${ui.diceFormula.textContent} → ${ev.tierLabel}`, by: 'script' });
  await waitAdvance();
  ui.dice.hidden = true;
  setPhase('story');
}

function trackText(t: { value: number; max: number; unit: string }): string {
  return t.unit ? `${t.value}${t.unit}` : `${t.value} / ${t.max}`;
}

function trackRow(t: TrackView): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'track';
  li.dataset.track = t.key;
  li.dataset.max = String(t.max);
  li.dataset.unit = t.unit;
  li.title = t.desc;
  li.innerHTML = TRACK_ICON[t.key] ?? '';
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
      li.textContent = item.name;
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

async function play(events: GameEvent[], gen: number): Promise<boolean> {
  let rest = events.slice();
  for (;;) {
    if (gen !== game.gen) return false;
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
        game.view = { scene: ev, line: game.view.line };
        setScene(ev);
        renderClock();
        break;
      case 'line':
        game.view.line = ev;
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
  ui.sfx.classList.remove('go');
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
  if (p.aim === '') mascot(null);
  else {
    // 장면 목표는 위쪽 GM 말상자에 띄워, 아래 입력칸과 겹치지 않게 한다.
    mascot('neutral');
    ui.gmMore.hidden = true;
    ui.gmText.replaceChildren(span('gm-aim-label', '아시나가 바라는 것'), p.aim);
  }
  ui.freeInput.placeholder = p.example ? `예: ${p.example}` : '말하거나 행동하기';
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
  const current = await play(step.events, gen);
  if (!current) return;
  settle();
}

/** 이야기가 입력 자리까지 왔다. 밀린 입력이 있으면 그 자리에서 바로 처리한다. */
function settle(): void {
  const latest = game.latest;
  if (!latest) return;
  renderHud(latest.hud);
  renderPrompt(latest.prompt);
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
      if (game.inputs.length) {
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
  const gen = game.gen;
  const previous = game.prompt;
  ui.choices.hidden = true;
  ui.free.hidden = true;
  if (action.type === 'free') showWaiting();
  else setPhase('story');
  try {
    const ok = await runStream(action, gen);
    if (!ok) return;
    game.busy = false;
    settle();
  } catch (err) {
    if (gen !== game.gen) return;
    game.busy = false;
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
  game.view = { scene: null, line: null };
  game.remaining = [];
  game.inputs = [];
  game.live = null;
  game.skipWait = false;
  game.after = [];
  game.latest = null;
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
  void (async () => {
    renderHud(step.hud);
    setPhase('story');
    if (view.scene) {
      game.view = { scene: view.scene, line: null };
      setScene(view.scene);
      for (const [speaker, face] of Object.entries(view.faces ?? {})) setFace(speaker, face);
    }
    if (view.line) {
      game.view.line = view.line;
      await showLine(view.line, view.remaining.length ? 'wait' : 'still');
    }
    game.latest = { prompt: step.prompt, hud: step.hud };
    if (!(await play(view.remaining, gen))) return;
    settle();
  })();
}

async function newGame(): Promise<void> {
  const seed = params.get('seed');
  const body = seed === null ? {} : { seed: /^\d+$/.test(seed) ? Number(seed) : seed };
  const data = await api<{ session: string; step: Step }>('/api/new', body);
  startSession(data.session, data.step);
}

function cell(text: string, className = ''): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

async function showResult(): Promise<void> {
  mascot(null);
  if (!game.session) return;
  const r = await api<ResultSummary>(`/api/result?session=${encodeURIComponent(game.session)}`);
  ui.resultEpisode.textContent = r.episode;
  ui.resultTitle.textContent = r.ending?.title ?? '이야기의 끝';
  ui.resultSummary.textContent = r.ending?.summary ?? '';
  ui.resultHook.textContent = r.ending?.nextHook ?? '';
  ui.resultChecks.replaceChildren(
    ...r.checks.map((c) => {
      const tr = document.createElement('tr');
      const mods = c.mods.reduce((sum, m) => sum + m.value, 0);
      tr.append(
        cell(c.beatTitle),
        cell(`${c.label} (${c.stat} ${signed(c.statValue)}${mods ? `, 보정 ${signed(mods)}` : ''})`),
        cell(`주사위 ${c.dice[0] + c.dice[1]} + 수치 ${c.statValue + mods} = ${c.total} / 목표 10`),
        cell(c.tierLabel, `tier-${c.tier}`),
      );
      return tr;
    }),
  );
  ui.resultDecisions.replaceChildren(
    ...r.decisions.map((d) => {
      const li = document.createElement('li');
      li.append(`${d.text} `, small(`${d.beatTitle} · ${d.detail}`));
      return li;
    }),
  );
  ui.resultTracks.replaceChildren(...r.tracks.map(trackRow));
  const stats: [string, string][] = [
    ['플레이 시간', formatTime(r.playMs)],
    ['판정', `${r.checks.length}회`],
    ['선택과 입력', `${r.decisions.length}회`],
    ['로컬 GM', `호출 ${r.gm.calls}회 · 다시 생성 ${r.gm.retries}회 · 작가 대사로 대체 ${r.gm.fallbacks}회`],
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
  setPhase('result');
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
  const view: SavedView = { scene: game.view.scene, line: game.view.line, remaining: [...unread, ...game.remaining], backlog: game.backlog, faces: { ...game.faces } };
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
  nodes: { key: string; col: number; row: number; ending: boolean; label: string | null; onPath: boolean; hint: number }[];
  edges: { from: string; to: string; seen: boolean; onPath: boolean }[];
}

/** 서버가 준 칸을 그린다. 안 가 본 칸은 서버가 이름을 주지 않아 ??? 로만 그릴 수 있다. */
async function openAtlas(): Promise<void> {
  const view = await api<AtlasView>('/api/atlas');
  const at = (col: number, row: number) => ({ x: ((col + 0.5) / view.cols) * 100, y: ((row + 0.5) / view.rows) * 100 });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'atlas-lines');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  const place = new Map(view.nodes.map((n) => [n.key, at(n.col, n.row)]));
  for (const e of view.edges) {
    const a = place.get(e.from);
    const b = place.get(e.to);
    if (!a || !b) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(a.x));
    line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x));
    line.setAttribute('y2', String(b.y));
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.setAttribute('class', e.onPath ? 'on-path' : e.seen ? 'seen' : 'unseen');
    svg.append(line);
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
      if (n.hint > 0) cell.dataset.hint = String(n.hint);
      cell.addEventListener('click', () => void showHint(cell, n.key));
    }
    return cell;
  });
  ui.atlasMap.replaceChildren(svg, ...cells);
  byId('atlas-hint').hidden = true;
  ui.atlasDialog.showModal();
}

async function showHint(cell: HTMLElement, key: string): Promise<void> {
  const hint = await api<{ level: number; text: string }>('/api/atlas/hint', { key });
  cell.dataset.hint = String(hint.level);
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
byId('btn-home').addEventListener('click', goTitle);
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
