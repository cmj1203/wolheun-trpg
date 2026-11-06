import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ABILITIES, TRACKS, type GameState, type Scenario } from './types.ts';

export class SaveError extends Error {
  override name = 'SaveError';
}

export interface SaveMeta {
  slot: string;
  savedAt: number;
  scenario: string;
  beat: string;
  beatTitle: string;
  playMs: number;
  ended: boolean;
}

interface SaveFile {
  v: 1;
  meta: SaveMeta;
  state: GameState;
  /** 화면이 보내 온 저장 순간의 모습(장면, 보이던 대사, 남은 사건, 대사 기록). 엔진은 내용을 해석하지 않는다. */
  view?: unknown;
}

const SLOT_RE = /^[a-z0-9_-]{1,32}$/;

function slotPath(dir: string, slot: string): string {
  if (!SLOT_RE.test(slot)) throw new SaveError(`저장 칸 이름은 영문 소문자, 숫자, -, _ 로 32자까지입니다: ${slot}`);
  return join(dir, `${slot}.json`);
}

export function assertState(scenario: Scenario, value: unknown): GameState {
  const s = value as Partial<GameState> | null;
  const fail = (why: string): never => {
    throw new SaveError(`저장 파일이 올바르지 않습니다: ${why}`);
  };
  if (!s || typeof s !== 'object') return fail('상태 없음');
  if (s.v !== 1) return fail(`버전 ${String(s.v)}`);
  if (s.scenario !== scenario.id) return fail(`다른 시나리오(${String(s.scenario)})`);
  if (typeof s.beat !== 'string' || !scenario.beats[s.beat]) return fail(`없는 비트 ${String(s.beat)}`);
  if (typeof s.rng !== 'number' || typeof s.seed !== 'number') return fail('난수 상태 없음');
  // 행운이 생기기 전의 저장도 불러올 수 있게 한다.
  if (s.tracks && s.tracks.행운 === undefined) s.tracks.행운 = 0;
  // 45차 전 저장의 능력치 체력은 근력이다. 새 상태는 당시 기록에 없으므로 시작값으로 받는다.
  const legacyAbilities: Record<string, number> | undefined = s.abilities;
  if (legacyAbilities && legacyAbilities.근력 === undefined && typeof legacyAbilities.체력 === 'number') {
    legacyAbilities.근력 = legacyAbilities.체력;
    delete legacyAbilities.체력;
  }
  for (const key of ['체력', '정신력'] as const) {
    if (s.tracks && s.tracks[key] === undefined) s.tracks[key] = scenario.sheet.tracks[key];
  }
  for (const t of TRACKS) if (typeof s.tracks?.[t] !== 'number') return fail(`수치 ${t} 없음`);
  for (const a of ABILITIES) if (typeof s.abilities?.[a] !== 'number') return fail(`능력치 ${a} 없음`);
  if (!s.flags || typeof s.flags !== 'object' || Array.isArray(s.flags)) return fail('플래그');
  if (!Array.isArray(s.items) || !s.items.every((i) => typeof i === 'string')) return fail('소지품 목록');
  if (!Array.isArray(s.log)) return fail('플레이 기록');
  for (const entry of s.log) {
    if (entry.kind === 'check' && String(entry.roll.stat) === '체력') entry.roll.stat = '근력';
  }
  if (typeof s.playMs !== 'number' || typeof s.startedAt !== 'number') return fail('플레이 시간');
  const beat = scenario.beats[s.beat];
  if (beat?.free && (!s.free || s.free.beat !== s.beat)) return fail('자유 입력 진행 상태');
  return { ...(s as GameState), recent: Array.isArray(s.recent) ? s.recent : [] };
}

export async function writeSave(dir: string, slot: string, scenario: Scenario, state: GameState, now = Date.now(), view?: unknown): Promise<SaveMeta> {
  const path = slotPath(dir, slot);
  await mkdir(dir, { recursive: true });
  const meta: SaveMeta = {
    slot,
    savedAt: now,
    scenario: scenario.id,
    beat: state.beat,
    beatTitle: scenario.beats[state.beat]?.title ?? state.beat,
    playMs: state.playMs,
    ended: state.ending !== null,
  };
  const file: SaveFile = view === undefined ? { v: 1, meta, state } : { v: 1, meta, state, view };
  await Bun.write(path, JSON.stringify(file, null, 1));
  return meta;
}

export async function readSave(dir: string, slot: string, scenario: Scenario): Promise<GameState> {
  const file = Bun.file(slotPath(dir, slot));
  if (!(await file.exists())) throw new SaveError(`저장 칸이 비어 있습니다: ${slot}`);
  let parsed: unknown;
  try {
    parsed = await file.json();
  } catch {
    throw new SaveError(`저장 파일을 읽을 수 없습니다: ${slot}`);
  }
  const data = parsed as Partial<SaveFile>;
  if (data.v !== 1) throw new SaveError(`지원하지 않는 저장 형식입니다: ${slot}`);
  return assertState(scenario, data.state);
}

export async function readSaveView(dir: string, slot: string): Promise<unknown> {
  const file = Bun.file(slotPath(dir, slot));
  if (!(await file.exists())) return null;
  try {
    return ((await file.json()) as Partial<SaveFile>).view ?? null;
  } catch {
    return null;
  }
}

export async function listSaves(dir: string): Promise<SaveMeta[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const metas: SaveMeta[] = [];
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    try {
      const data = (await Bun.file(join(dir, name)).json()) as Partial<SaveFile>;
      if (data.v === 1 && data.meta) metas.push(data.meta);
    } catch {
      continue;
    }
  }
  return metas;
}
