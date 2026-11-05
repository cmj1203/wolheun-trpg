// 플레이어 입력 분류 평가: docs/research/input_corpus.jsonl 의 입력을 지금 규칙 경로(--no-llm, LocalGm(null))로
// 엔진에 그대로 넣고, 어떤 처리로 갔는지 보고 기대와 다른 입력을 표로 뽑는다. src 는 읽기만 한다.
//
//   bun scripts/input_eval.ts                       # 요약과 틀린 입력 표(마크다운)를 표준 출력에
//   bun scripts/input_eval.ts --all                 # 맞은 입력까지 모두 표로
//   bun scripts/input_eval.ts --corpus <경로>        # 다른 자료로
//
// 자료 한 줄: {"id","text","kind","scene","expect":[...],"note"?}
//   kind  : 행동 | 건넨말 | 혼잣말 | 게임질문 | 세계밖
//   scene : alone(b02_people, 곁에 아무도 없음) | facing(b05_why, 칼 든 남자 앞)
//   expect: 받아들일 처리 이름들(아래 HANDLING).
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { ROUTES } from '../e2e/routes.ts';
import { Engine, type GmContext, type GmLines, type GmPort, type InputScreen, type Interpretation, type NarrateContext } from '../src/engine/engine.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent, GameState } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { ruleInterpret } from '../src/gm/rules.ts';

const APP = join(import.meta.dir, '..');
const ROOT = join(APP, '..');

/** 엔진이 입력을 받은 결과를 화면에서 보이는 처리로 나눈 이름. */
export const HANDLING = {
  판정: '주사위를 굴린다(접근법 또는 즉흥 행동)',
  확인카드: '굴리기 전 의도 확인 카드(칼 앞 맨손 행동 등)',
  대꾸: '판정 없이 앞사람(또는 대체 줄)이 말로 받는다',
  혼잣말: '아무에게도 건네지 않은 말로 받는다(속마음·바람에 흩어짐)',
  질문안내: '이야기에 넣지 않고 질문 모드(GM 단추)로 안내한다',
  세계밖: '이 세계에 없는 물건·힘으로 보고 일어나지 않은 일로 그린다',
  거절: '등급에 맞지 않는 입력으로 보고 비껴 받는다',
  되돌림: '아직 모르는 이름·없는 것으로 보고 여우가 다시 적게 한다',
  그만확인: '게임을 끝낼지 묻는 확인 창',
  정체: '정체를 밝히는 말로 보고 징조·의심을 붙인다',
  오류: '엔진이 입력을 받지 못했다',
} as const;
export type Handling = keyof typeof HANDLING;

/** 기대에 '판정'이 있으면 굴리기 전 확인 카드도 같은 길로 본다. */
const SAME_ROAD: Partial<Record<Handling, Handling[]>> = { 판정: ['확인카드'] };

export const KINDS = ['행동', '건넨말', '혼잣말', '게임질문', '세계밖'] as const;
export type Kind = (typeof KINDS)[number];
export const SCENES = { alone: 'b02_people', facing: 'b05_why' } as const;
export type Scene = keyof typeof SCENES;

export interface Case {
  id: string;
  text: string;
  kind: Kind;
  scene: Scene;
  expect: Handling[];
  note?: string;
}

export interface Outcome {
  got: Handling;
  /** ruleInterpret 의 결과(엔진 앞단을 거치기 전 규칙 해석). */
  rule: string;
  /** GM 이 엔진에 돌려준 해석. 엔진이 해석 전에 끝냈으면 '-'. */
  reading: string;
}

/** LocalGm 을 감싸 엔진이 무엇을 불렀는지 적는다. 동작은 그대로 넘긴다. */
class Spy implements GmPort {
  screened: InputScreen | null = null;
  reading: Interpretation | null = null;
  talks: GmContext[] = [];

  constructor(private readonly inner: LocalGm) {}

  reset(): void {
    this.screened = null;
    this.reading = null;
    this.talks = [];
  }

  prepare(ctx: Omit<GmContext, 'text'>): void {
    this.inner.prepare(ctx);
  }

  screen(ctx: GmContext): InputScreen | null {
    this.screened = this.inner.screen(ctx);
    return this.screened;
  }

  async interpret(ctx: GmContext): Promise<Interpretation> {
    this.reading = await this.inner.interpret(ctx);
    return this.reading;
  }

  talk(ctx: GmContext): Promise<GmLines> {
    this.talks.push(ctx);
    return this.inner.talk(ctx);
  }

  narrate(ctx: NarrateContext): Promise<GmLines> {
    return this.inner.narrate(ctx);
  }

  explain(ctx: GmContext): Promise<GmLines> {
    return this.inner.explain(ctx);
  }
}

function describeReading(r: Interpretation | null): string {
  if (!r) return '-';
  const parts: string[] = [r.kind];
  if (r.kind === 'approach') parts.push(r.approach);
  if (r.kind === 'talk') parts.push(r.to ?? '대상없음', ...(r.tone ? [r.tone] : []));
  if (r.kind === 'ask') parts.push(r.game ? `game=${r.game}` : r.about ? `about=${r.about}` : r.play ? 'play' : '대상없음');
  if (r.kind === 'improv') parts.push(r.absurd ? 'absurd' : 'plain');
  if ('risk' in r && r.risk) parts.push(`risk=${r.risk}`);
  return parts.join(' ');
}

function classify(spy: Spy, events: GameEvent[], logBefore: number, state: GameState): Handling {
  const confirm = events.find((e) => e.type === 'confirm');
  if (confirm?.type === 'confirm' && confirm.kind === 'quit') return '그만확인';
  if (spy.screened) return '되돌림';
  if (events.some((e) => e.type === 'notice' && e.kind === 'ask')) return '질문안내';
  const fresh = state.log.slice(logBefore);
  if (fresh.some((l) => l.kind === 'input' && l.result === 'game')) return '질문안내';
  if (confirm?.type === 'confirm' && confirm.kind === 'intent') return '확인카드';
  if (events.some((e) => e.type === 'roll')) return '판정';
  const r = spy.reading;
  if (r?.kind === 'talk' && r.risk === 'identity' && state.flags['신분_노출'] === true) return '정체';
  const said = spy.talks.at(-1);
  if (said?.absurd) return '세계밖';
  if (r?.kind === 'talk' && r.tone === 'deflect') return '거절';
  if (said?.self) return '혼잣말';
  if (said) return '대꾸';
  if (r?.kind === 'improv' && r.absurd) return '세계밖';
  if (r && 'risk' in r && r.risk === 'identity') return '정체';
  if (r?.kind === 'talk' && r.risk === 'unmask') return '대꾸';
  return '오류';
}

export async function loadCorpus(path: string): Promise<Case[]> {
  const lines = (await readFile(path, 'utf8')).split('\n').map((l) => l.trim()).filter(Boolean);
  const cases = lines.map((l, i) => {
    const c = JSON.parse(l) as Case;
    const where = `${path}:${i + 1}`;
    if (!c.id || !c.text) throw new Error(`${where}: id·text 가 없다`);
    if (!KINDS.includes(c.kind)) throw new Error(`${where}: 모르는 종류 ${c.kind}`);
    if (!(c.scene in SCENES)) throw new Error(`${where}: 모르는 장면 ${c.scene}`);
    if (!c.expect?.length || c.expect.some((h) => !(h in HANDLING))) throw new Error(`${where}: 모르는 기대 처리 ${JSON.stringify(c.expect)}`);
    return c;
  });
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`id 가 겹친다: ${c.id}`);
    ids.add(c.id);
  }
  return cases;
}

/** 저장소 글(문서·대본·시험·자동 플레이)에 이미 같은 말이 있는 입력. 한글·숫자만 남겨 맞춘다. */
export async function knownInputs(cases: readonly Case[], skip: string): Promise<Map<string, string>> {
  const norm = (s: string) => s.replace(/[^\p{Script=Hangul}\p{N}]/gu, '');
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const name of await readdir(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(dir, name);
      const s = await stat(p);
      if (s.isDirectory()) await walk(p);
      else if (/\.(md|txt|ya?ml|ts|json|jsonl)$/.test(name) && p !== skip && s.size < 5_000_000) files.push(p);
    }
  };
  for (const d of ['docs', 'app', 'app_next']) await walk(join(ROOT, d)).catch(() => undefined);
  const texts = await Promise.all(files.map(async (f) => ({ f, t: norm(await readFile(f, 'utf8')) })));
  const hits = new Map<string, string>();
  for (const c of cases) {
    const n = norm(c.text);
    if (n.length < 2) continue;
    const found = texts.find((x) => x.t.includes(n));
    if (found) hits.set(c.id, relative(ROOT, found.f));
  }
  return hits;
}

async function baseStates(engine: Engine): Promise<Record<Scene, GameState>> {
  // 갈래 3(seed 1)의 입력으로 b02_people 을 지나 b05_why 까지 간다.
  const route = ROUTES['3'];
  if (!route) throw new Error('갈래 3 이 없다');
  const out: Partial<Record<Scene, GameState>> = {};
  let { state, step } = engine.newGame(route.seed, 'input-eval');
  const queue = structuredClone(route.inputs);
  for (let turn = 0; step.prompt.type === 'free' && turn < 10; turn++) {
    const beat = step.prompt.beat;
    for (const [scene, id] of Object.entries(SCENES) as [Scene, string][]) if (beat === id && !out[scene]) out[scene] = structuredClone(state);
    if (out.alone && out.facing) break;
    const text = queue[beat]?.shift();
    if (!text) throw new Error(`${beat} 에 넣을 갈래 입력이 없다`);
    ({ state, step } = await engine.act(state, { type: 'free', text }));
  }
  if (!out.alone || !out.facing) throw new Error('평가할 장면에 닿지 못했다');
  return out as Record<Scene, GameState>;
}

export async function evaluate(cases: readonly Case[]): Promise<Map<string, Outcome>> {
  const lore = await loadLore(join(APP, 'content', 'lore_wolheun.yaml'));
  const scenario = withNotes(await loadScenario(join(APP, 'content', 'ep01_desert.yaml')), lore);
  const spy = new Spy(new LocalGm(null, lore));
  const engine = new Engine(scenario, spy);
  const bases = await baseStates(engine);
  const out = new Map<string, Outcome>();
  for (const c of cases) {
    const base = bases[c.scene];
    const free = scenario.beats[SCENES[c.scene]]?.free;
    if (!free) throw new Error(`${SCENES[c.scene]} 에 자유 입력이 없다`);
    const r = ruleInterpret(free, c.text, base.items, lore);
    const rule = r.kind === 'approach' ? `approach ${r.approach}(${r.score})` : r.kind === 'ask' ? `ask${r.why ? ' why' : ''}` : r.kind === 'improv' ? `improv${r.absurd ? ' absurd' : ''}` : r.kind;
    spy.reset();
    let got: Handling;
    try {
      const prev = structuredClone(base);
      const { state, step } = await engine.act(prev, { type: 'free', text: c.text });
      got = classify(spy, step.events, base.log.length, state);
    } catch {
      got = '오류';
    }
    out.set(c.id, { got, rule, reading: describeReading(spy.reading) });
  }
  return out;
}

export const isRight = (c: Case, o: Outcome): boolean => c.expect.some((h) => h === o.got || (SAME_ROAD[h] ?? []).includes(o.got));

const cell = (s: string) => s.replace(/\|/g, '\\|');

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { corpus: { type: 'string', default: join(ROOT, 'docs', 'research', 'input_corpus.jsonl') }, all: { type: 'boolean', default: false } },
  });
  const path = values.corpus;
  const cases = await loadCorpus(path);
  const known = await knownInputs(cases, path);
  const results = await evaluate(cases);
  const rows = cases.map((c) => ({ c, o: results.get(c.id) as Outcome })).map((x) => ({ ...x, ok: isRight(x.c, x.o) }));

  const out: string[] = [];
  out.push(`# 입력 분류 평가 (규칙 경로, --no-llm)`, '', `자료: ${relative(ROOT, path)} · 입력 ${cases.length}개`, '');
  if (known.size) {
    out.push(`## 저장소 글에 이미 있는 입력 ${known.size}개`, '', '| id | 입력 | 나온 곳 |', '|---|---|---|');
    for (const [id, f] of known) out.push(`| ${id} | ${cell(cases.find((c) => c.id === id)?.text ?? '')} | ${f} |`);
    out.push('');
  }
  out.push('## 종류별', '', '| 종류 | 장면 | 입력 | 맞음 | 틀림 | 맞은 비율 |', '|---|---|---|---|---|---|');
  for (const kind of KINDS) {
    for (const scene of Object.keys(SCENES) as Scene[]) {
      const sub = rows.filter((r) => r.c.kind === kind && r.c.scene === scene);
      if (!sub.length) continue;
      const ok = sub.filter((r) => r.ok).length;
      out.push(`| ${kind} | ${scene} | ${sub.length} | ${ok} | ${sub.length - ok} | ${Math.round((ok / sub.length) * 100)}% |`);
    }
  }
  const okAll = rows.filter((r) => r.ok).length;
  out.push(`| 전체 | | ${rows.length} | ${okAll} | ${rows.length - okAll} | ${Math.round((okAll / rows.length) * 100)}% |`, '');

  out.push('## 종류 × 실제 처리', '', `| 종류 | ${Object.keys(HANDLING).join(' | ')} |`, `|---|${Object.keys(HANDLING).map(() => '---').join('|')}|`);
  for (const kind of KINDS) {
    const sub = rows.filter((r) => r.c.kind === kind);
    out.push(`| ${kind} | ${(Object.keys(HANDLING) as Handling[]).map((h) => sub.filter((r) => r.o.got === h).length || '').join(' | ')} |`);
  }
  out.push('');

  const shown = values.all ? rows : rows.filter((r) => !r.ok);
  out.push(values.all ? '## 모든 입력' : '## 틀린 입력', '', '| id | 종류 | 장면 | 입력 | 기대 | 실제 | 규칙 해석 | GM 해석 | 맞음 |', '|---|---|---|---|---|---|---|---|---|');
  for (const { c, o, ok } of shown) out.push(`| ${c.id} | ${c.kind} | ${c.scene} | ${cell(c.text)} | ${c.expect.join('/')} | ${o.got} | ${cell(o.rule)} | ${cell(o.reading)} | ${ok ? 'O' : 'X'} |`);
  console.log(out.join('\n'));
}

if (import.meta.main) await main();
