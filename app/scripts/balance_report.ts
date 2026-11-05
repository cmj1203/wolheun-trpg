// docs/research/balance.md 의 표를 만드는 실험 묶음. 시뮬레이터는 scripts/balance_sim.ts.
//
//   bun scripts/balance_report.ts                       # 판 수 기본값(본 측정 10000, 실험 5000)
//   bun scripts/balance_report.ts --games 20000 --exp 10000 --json ../docs/research/balance_data.json > out.md
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { Scenario, Tier } from '../src/engine/types.ts';
import {
  MAIN_STRATEGIES,
  PROPOSALS,
  STRATEGIES,
  endingIds,
  endingTitle,
  loadAll,
  patched,
  pct,
  simulate,
  summarize,
  tierOdds,
  wilson,
  type GameRecord,
  type LuckPolicy,
  type Summary,
} from './balance_sim.ts';

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '10000' },
    exp: { type: 'string', default: '5000' },
    json: { type: 'string' },
    only: { type: 'string', multiple: true },
  },
});
const GAMES = Number(values.games);
const EXP = Number(values.exp);
const only = new Set(values.only ?? []);
const want = (k: string) => only.size === 0 || only.has(k);

const { scenario, lore } = await loadAll();
const ENDINGS = endingIds(scenario).filter((e) => e !== 'e_quit');
const out: Record<string, unknown> = { games: GAMES, exp: EXP };
const log = (s = '') => console.log(s);

function endingRow(label: string, s: Summary, ends = ENDINGS): string {
  return `| ${label} | ${ends.map((e) => pct((s.endings[e] ?? 0) / s.games)).join(' | ')} | ${pct(s.bad / s.games)} |`;
}
function endingHead(first: string, ends = ENDINGS, extra: string[] = []): string {
  const cols = [...ends.map((e) => endingTitle(scenario, e).replace('(작은 끝)', '†')), '작은 끝 합', ...extra];
  return `| ${first} | ${cols.join(' | ')} |\n|---|${cols.map(() => '---:').join('|')}|`;
}
const ci = (k: number, n: number) => {
  const w = wilson(k, n);
  return `${pct(w.p)} (${pct(w.lo)}~${pct(w.hi)})`;
};

// ───── 1. 본 측정 ─────
const main: Record<string, Summary> = {};
const mainRecs: Record<string, GameRecord[]> = {};
if (want('main')) {
  for (const id of [...MAIN_STRATEGIES, 'bold', 'chat']) {
    const recs = await simulate(STRATEGIES[id]!, GAMES, { scenario, lore });
    mainRecs[id] = recs;
    main[id] = summarize(scenario, recs);
  }
  {
    const recs = await simulate(STRATEGIES.attack!, GAMES, { scenario, lore, gm: 'attack-llm' });
    mainRecs['attack-llm'] = recs;
    main['attack-llm'] = summarize(scenario, recs);
  }
  out.main = main;
  const label: Record<string, string> = { ...Object.fromEntries(Object.values(STRATEGIES).map((s) => [s.id, s.label])), 'attack-llm': '공격(LLM 공격 해석 가정, 보조)' };
  const order = [...MAIN_STRATEGIES, 'bold', 'chat', 'attack-llm'];

  log(`## 1. 결말 분포 (전략마다 ${GAMES}판)`);
  log();
  log(endingHead('전략'));
  for (const id of order) log(endingRow(label[id]!, main[id]!));
  log();
  log('95% 윌슨 구간(본 전략 4개):');
  log();
  log(`| 결말 | ${MAIN_STRATEGIES.map((id) => label[id]).join(' | ')} |\n|---|${MAIN_STRATEGIES.map(() => '---:').join('|')}|`);
  for (const e of ENDINGS) log(`| ${endingTitle(scenario, e)} | ${MAIN_STRATEGIES.map((id) => ci(main[id]!.endings[e] ?? 0, GAMES)).join(' | ')} |`);
  log();

  log('## 2. 판정 성공률·행운·길이');
  log();
  log('| 전략 | 판정/판 | 행운 전 성공 | 대가 | 실패 | 행운 뒤 실패 | 행운 쓴 판정 | 행운 모자란 실패 | 남은 행운 평균 | 행운 0 판 | 행운 ≤3 판 | 비트/판 | 행동/판 | 말(talk)/판 | 장면 사건 발생률 |');
  log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const id of order) {
    const s = main[id]!;
    const r = Math.max(1, s.rolls);
    log(
      `| ${label[id]} | ${s.rollsMean.toFixed(2)} | ${pct(s.raw.hit / r)} | ${pct(s.raw.mixed / r)} | ${pct(s.raw.miss / r)} | ${pct(s.final.miss / r)} | ${pct(s.luckUsedRolls / r)} | ${pct(s.luckShort / r)} | ${s.luckEndMean.toFixed(2)} | ${pct(s.luckZero / s.games)} | ${pct(s.luckLow / s.games)} | ${s.beatsMean.toFixed(2)} | ${s.actsMean.toFixed(2)} | ${s.talksMean.toFixed(2)} | ${pct(s.twistRate)} (${s.twistBeats}) |`,
    );
  }
  log();

  log('## 3. 긴장·귀찌·의심·집착 곡선 (비트 진입 때 평균, 그 비트를 지난 판만)');
  const beatsOrder = ['b02_people', 'b05_why', 'b06_swing', 'b08_gaze', 'b09_verdict', 'r2_bind', 'r3_dusk', 'r4_prove', 'r5_claim'];
  for (const id of order) {
    const s = main[id]!;
    log();
    log(`**${label[id]}**`);
    log();
    log('| 비트 | 지난 판 | 긴장 | 귀찌 | 의심 | 집착 | 행운 |\n|---|---:|---:|---:|---:|---:|---:|');
    for (const b of beatsOrder) {
      const v = s.byBeat[b];
      if (!v) continue;
      log(`| ${b} | ${pct(v.n / s.games)} | ${v.tension.toFixed(2)} | ${v.귀찌.toFixed(2)} | ${v.의심.toFixed(2)} | ${v.집착.toFixed(2)} | ${v.행운.toFixed(2)} |`);
    }
  }
  log();
  log('판정 순서별(k 번째 판정 직전) 긴장·귀찌 평균:');
  log();
  log(`| k | ${order.map((id) => label[id]).join(' | ')} |\n|---:|${order.map(() => '---').join('|')}|`);
  for (let k = 1; k <= 5; k++)
    log(`| ${k} | ${order.map((id) => {
      const v = main[id]!.byRoll[k - 1];
      return v ? `${v.tension.toFixed(2)} / ${v.귀찌.toFixed(2)} (${pct(v.n / GAMES, 0)})` : '–';
    }).join(' | ')} |`);
  log();
  log('끝났을 때 귀찌 분포:');
  log();
  log(`| 전략 | ${[...Array(9).keys()].map((k) => `귀찌 ${k}`).join(' | ')} |\n|---|${[...Array(9).keys()].map(() => '---:').join('|')}|`);
  for (const id of order) log(`| ${label[id]} | ${main[id]!.earringEnd.map((k) => pct(k / GAMES)).join(' | ')} |`);
  log();
  log('징조(경고)가 나온 판:');
  log();
  log(`| 전략 | ${(scenario.fates ?? []).map((f) => f.id).join(' | ')} |\n|---|${(scenario.fates ?? []).map(() => '---:').join('|')}|`);
  for (const id of order) log(`| ${label[id]} | ${(scenario.fates ?? []).map((f) => pct((main[id]!.warned[f.id] ?? 0) / GAMES)).join(' | ')} |`);
  log();
  log(`문턱 멈춤(로그 없이 수치가 문턱 위로 멈춘 횟수): ${order.map((id) => `${label[id]} ${main[id]!.holds}`).join(', ')}`);
  log();

  // 접근별 실제 등급
  log('## 4. 접근별 판정 등급 (무작위 전략, 행운 전)');
  log();
  log('| 장면/접근 | 판정 수 | 성공 | 대가 | 실패 |\n|---|---:|---:|---:|---:|');
  const by = main.random!.byApproach;
  for (const [k, v] of Object.entries(by).sort()) log(`| ${k} | ${v.n} | ${pct(v.hit / v.n)} | ${pct(v.mixed / v.n)} | ${pct(v.miss / v.n)} |`);
  log();
  log('공격 전략 입력이 실제로 굴린 접근(규칙 해석):');
  log();
  const ab = main.attack!.byApproach;
  log('| 장면/접근 | 판정 수 |\n|---|---:|');
  for (const [k, v] of Object.entries(ab).sort()) log(`| ${k} | ${v.n} |`);
  log();

  // 대가 뽑기와 다음 주사위
  log('## 5. 대가 뽑기와 다음 판정 첫 주사위');
  log();
  const pairs = Object.values(mainRecs).flatMap((rs) => rs.flatMap((g) => g.priceThenDie));
  const byPrice: Record<string, number[]> = {};
  for (const p of pairs) (byPrice[`${p.beat}/${p.id}`] ??= [0, 0, 0, 0, 0, 0])[p.die - 1]! += 1;
  log(`대가가 뽑힌 뒤 처음 굴린 판정의 첫 주사위 눈 분포 (모든 전략 합 ${pairs.length}쌍, 200쌍 넘는 대가만). 대가가 주사위와 따로 놀면 눈마다 16.7%·평균 3.50 이어야 한다.`);
  log();
  log('| 장면/대가 | 쌍 | 1 | 2 | 3 | 4 | 5 | 6 | 평균 눈 | 홀수 눈 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const priceTable: Record<string, { n: number; mean: number; odd: number }> = {};
  for (const [k, v] of Object.entries(byPrice).sort()) {
    const n = v.reduce((a, b) => a + b, 0);
    if (n < 200) continue;
    const mean = v.reduce((a, b, i) => a + b * (i + 1), 0) / n;
    const odd = (v[0]! + v[2]! + v[4]!) / n;
    priceTable[k] = { n, mean, odd };
    log(`| ${k} | ${n} | ${v.map((x) => pct(x / n, 0)).join(' | ')} | ${mean.toFixed(2)} | ${pct(odd, 0)} |`);
  }
  out.priceThenDie = priceTable;
  log();
  log('가정 실험: 대가를 뽑은 뒤 주사위 흐름을 한 칸 넘겼을 때(엔진은 그대로, 시뮬레이터가 상태만 넘김):');
  log();
  log(endingHead('전략 · 대가 뽑기'));
  const decoupled: Record<string, Summary> = {};
  for (const id of ['safe', 'random', 'bold'] as const) {
    const s = summarize(scenario, await simulate(STRATEGIES[id]!, GAMES, { scenario, lore, decouplePrice: true }));
    decoupled[id] = s;
    log(endingRow(`${STRATEGIES[id]!.label} · 지금`, main[id]!));
    log(endingRow(`${STRATEGIES[id]!.label} · 따로 뽑음`, s));
  }
  out.decoupled = decoupled;
  log();
}

// ───── 6. 장면별 선택 실험 ─────
function staticTable(s: Scenario): void {
  log('정적 표: 시작 능력치로 굴릴 때 등급 확률과 기대 수치 변화(보정·대가·행운 빼고):');
  log();
  log('| 장면 | 접근 | 능력치 | 성공 | 대가 | 실패 | E[Δ의심] | E[Δ집착] | E[Δ귀찌] | 갈래 플래그 |\n|---|---|---|---:|---:|---:|---:|---:|---:|---|');
  for (const [bid, b] of Object.entries(s.beats)) {
    if (!b.free) continue;
    for (const a of b.free.approaches) {
      const odds = tierOdds(s.sheet.abilities[a.stat]);
      const e = (t: '의심' | '집착' | '귀찌') => (['hit', 'mixed', 'miss'] as Tier[]).reduce((n, tier) => n + odds[tier] * (a.outcomes[tier].effects?.tracks?.[t] ?? 0), 0);
      const flags = (['hit', 'mixed', 'miss'] as Tier[])
        .map((tier) => {
          const f = Object.keys(a.outcomes[tier].effects?.flags ?? {}).filter((k) => ['도주', '거래', '신분'].includes(k));
          return f.length ? `${tier}:${f.join(',')}` : '';
        })
        .filter(Boolean)
        .join(' ');
      log(`| ${bid} | ${a.id} ${a.label}${a.item ? ` (${a.item})` : ''} | ${a.stat} ${s.sheet.abilities[a.stat]} | ${pct(odds.hit)} | ${pct(odds.mixed)} | ${pct(odds.miss)} | ${e('의심').toFixed(2)} | ${e('집착').toFixed(2)} | ${e('귀찌').toFixed(2)} | ${flags} |`);
    }
  }
  log();
}

if (want('choice')) {
  log(`## 6. 장면별 선택 실험 (무작위 전략에 한 장면만 고정, 접근마다 ${EXP}판, 그 장면에 닿은 판만 집계)`);
  log();
  staticTable(scenario);
  const choice: Record<string, Record<string, { reached: number; endings: Record<string, number>; bad: number }>> = {};
  const show = ['e_road', 'e_deal', 'e_value', 'e_spy', 'e_curious', 'e_survivor', 'x_unmasked', 'x_spy_cut'];
  log(endingHead('장면/고정 접근', show, ['닿은 판']));
  for (const [bid, b] of Object.entries(scenario.beats)) {
    if (!b.free) continue;
    choice[bid] = {};
    for (const a of b.free.approaches) {
      const recs = await simulate(STRATEGIES.random!, EXP, { scenario, lore, force: { beat: bid, approach: a.id } });
      const reached = recs.filter((g) => g.beats.includes(bid) && g.rolls.some((r) => r.beat === bid));
      const s = summarize(scenario, reached);
      choice[bid][a.id] = { reached: reached.length, endings: s.endings, bad: s.bad };
      log(`| ${bid}/${a.id} | ${show.map((e) => pct((s.endings[e] ?? 0) / Math.max(1, s.games))).join(' | ')} | ${pct(s.bad / Math.max(1, s.games))} | ${reached.length} |`);
    }
  }
  out.choice = choice;
  log();
}

// ───── 7. 행운 정책 ─────
if (want('luck')) {
  log(`## 7. 행운 정책 실험 (${EXP}판씩)`);
  log();
  log(endingHead('전략 · 행운'));
  const luck: Record<string, Summary> = {};
  for (const id of ['safe', 'random', 'bold'] as const)
    for (const policy of ['always', 'never'] as LuckPolicy[]) {
      const s = summarize(scenario, await simulate(STRATEGIES[id]!, EXP, { scenario, lore, luck: policy }));
      luck[`${id}:${policy}`] = s;
      log(endingRow(`${STRATEGIES[id]!.label} · ${policy === 'always' ? '늘 씀' : '안 씀'}`, s));
    }
  out.luck = luck;
  log();
}

// ───── 8. 조정안 전후 ─────
if (want('proposals') && Object.keys(PROPOSALS).length) {
  log(`## 8. 조정안 전후 (전략마다 ${GAMES}판, 같은 시드)`);
  const sets: [string, string[]][] = [['지금', []], ...Object.keys(PROPOSALS).map((id) => [id, [id]] as [string, string[]]), ['추천 묶음(P1+P2+P3+P4)', ['P1', 'P2', 'P3', 'P4']]];
  const res: Record<string, Record<string, Summary>> = {};
  for (const [name, ids] of sets) {
    const s = ids.length ? patched(scenario, ids) : scenario;
    res[name] = {};
    for (const id of [...MAIN_STRATEGIES, 'bold', 'chat']) res[name][id] = summarize(s, await simulate(STRATEGIES[id]!, GAMES, { scenario: s, lore }));
  }
  for (const id of [...MAIN_STRATEGIES, 'bold', 'chat']) {
    log();
    log(`**${STRATEGIES[id]!.label}**`);
    log();
    log(endingHead('조정', ENDINGS, ['판정/판', '비트/판', '남은 행운']));
    for (const [name] of sets) {
      const s = res[name]![id]!;
      log(`${endingRow(name, s)} ${s.rollsMean.toFixed(2)} | ${s.beatsMean.toFixed(2)} | ${s.luckEndMean.toFixed(2)} |`);
    }
  }
  out.proposals = res;
  log();
}

if (values.json) await writeFile(values.json, JSON.stringify(out, null, 1));
