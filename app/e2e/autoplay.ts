import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { ResultSummary } from '../src/engine/summary.ts';
import { watchNetwork } from './netwatch.ts';
import { FALLBACK_INPUT, ROUTES } from './routes.ts';

const APP = join(import.meta.dir, '..');
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    model: { type: 'string', default: '' },
    route: { type: 'string', default: '1' },
    seed: { type: 'string' },
    port: { type: 'string', default: '18181' },
    'llm-port': { type: 'string', default: '18180' },
    shots: { type: 'string' },
    out: { type: 'string', default: join(APP, 'e2e', 'out') },
    'no-llm': { type: 'boolean', default: false },
  },
});
const noLlm = values['no-llm'] === true;
const route = ROUTES[values.route];
if (!route) {
  console.error(`알 수 없는 갈래: ${values.route} (1~5)`);
  process.exit(2);
}
const seed = values.seed ?? String(route.seed);
const base = `http://127.0.0.1:${values.port}`;
mkdirSync(values.out, { recursive: true });
if (values.shots) mkdirSync(values.shots, { recursive: true });

const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  console.log(`${ok ? '  통과' : '  실패'} · ${message}`);
  if (!ok) failures.push(message);
};

async function waitUntil<T>(probe: () => Promise<T | null>, timeoutMs: number, label: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe().catch(() => null);
    if (value !== null) return value;
    await Bun.sleep(100);
  }
  throw new Error(`${label}: ${timeoutMs}ms 안에 끝나지 않았습니다`);
}

/** 불러오기 창이 열리기 직전의 CPU 상태. 지연이 나면 기계가 바빴는지 숫자로 남기려는 것이다. */
async function cpuSnapshot(): Promise<string> {
  const top = await Bun.$`top -l 1 -n 0`.quiet().nothrow().text();
  const usage = top.split('\n').find((l) => l.startsWith('CPU usage'))?.replace('CPU usage: ', '') ?? '측정 못 함';
  const load = (await Bun.$`sysctl -n vm.loadavg`.quiet().nothrow().text()).trim();
  return `${usage} · 부하 ${load}`;
}

let loadDialogMs = -1;
let cpuBeforeLoad = '';

const runLog = join(values.out, `run-${values.route}.log`);
const runArgs = ['./run.sh', '--no-open', '--port', values.port, '--llm-port', values['llm-port'], ...(values.model ? ['--model', values.model] : []), ...(noLlm ? ['--no-llm'] : [])];
console.log(`[e2e ${values.route}] ${route.title} · 시드 ${seed} · ${runArgs.join(' ')}`);
const started = Date.now();
const runner = Bun.spawn(runArgs, { cwd: APP, stdout: Bun.file(runLog), stderr: Bun.file(runLog) });

let view: Bun.WebView | null = null;
try {
  const health = await waitUntil(
    async () => {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
      return res.ok ? ((await res.json()) as { llm: { ok: boolean; model: string | null }; model: { key: string; label: string } | null }) : null;
    },
    400_000,
    'run.sh 로 앱 띄우기',
  );
  const bootMs = Date.now() - started;
  check(noLlm || health.llm.ok, `run.sh 하나로 ${noLlm ? '앱이' : 'LLM 서버와 앱이'} 떴다 (${Math.round(bootMs / 1000)}초, 모델 ${noLlm ? '없음(--no-llm)' : (health.model?.label ?? health.llm.model)})`);
  const pidsPath = join(APP, 'logs', `run-${values.port}.pids`);
  const pids = await waitUntil(
    async () => {
      const file = Bun.file(pidsPath);
      return (await file.exists()) ? (await file.text()).trim().split('\n').map(Number) : null;
    },
    30_000,
    'run.sh 의 프로세스 목록',
  );
  check(pids.length === (noLlm ? 1 : 2), `run.sh 가 띄운 프로세스 ${pids.length}개(${noLlm ? '앱' : 'LLM 서버, 앱'})`);
  const net = watchNetwork(pids);

  const w = new Bun.WebView({ width: 1440, height: 810 });
  view = w;
  const shot = async (name: string) => {
    if (!values.shots) return;
    await Bun.write(join(values.shots, name), await w.screenshot());
  };
  const phase = async () => JSON.parse(await w.evaluate('JSON.stringify(window.__wolheun ? window.__wolheun.phase : null)')) as string | null;
  const waitPhase = (targets: string[], timeoutMs = 240_000) =>
    waitUntil(async () => {
      const p = await phase();
      return p && targets.includes(p) ? p : null;
    }, timeoutMs, `화면 단계 ${targets.join('/')}`);

  await w.navigate(`${base}/?fast=1&seed=${seed}`);
  await waitUntil(async () => ((await w.evaluate('document.getElementById("title-status").textContent')) ? true : null), 20_000, '타이틀 화면');
  await shot('01_title.png');
  await w.click('#btn-new');

  const taken = new Set<string>();
  const once = async (key: string, name: string) => {
    if (taken.has(key)) return;
    taken.add(key);
    await shot(name);
  };
  const inputs = structuredClone(route.inputs);
  let savedAndLoaded = false;
  let gmLines = 0;
  for (let guard = 0; guard < 400; guard++) {
    const p = await waitPhase(['line', 'dice', 'ending', 'free', 'result', 'choices']);
    if (p === 'result') break;
    if (p === 'choices') {
      await w.click('#choices button[data-id="luck-skip"]');
      continue;
    }
    if (p === 'line') {
      const isGm = JSON.parse(await w.evaluate('JSON.stringify(!document.getElementById("gm-badge").hidden)')) as boolean;
      if (isGm) {
        gmLines += 1;
        if (!taken.has('gm')) await Bun.sleep(600);
        await once('gm', '07_gm_reply.png');
      }
      await once('line', '02_story.png');
      await w.click(JSON.parse(await w.evaluate('JSON.stringify(document.getElementById("gm-box").hidden)')) ? '#dialog' : '#gm-box');
    } else if (p === 'dice') {
      await waitUntil(async () => ((await w.evaluate('document.getElementById("dice-tier").textContent')) ? true : null), 10_000, '주사위 결과');
      await once('dice', '04_dice.png');
      await w.click('#dice');
    } else if (p === 'ending') {
      await once('ending', '09_ending.png');
      await w.click('#ending');
    } else if (p === 'free') {
      const beatKey = JSON.parse(await w.evaluate('JSON.stringify(window.__wolheun.prompt.beat)')) as string;
      await once('free', '05_free_input.png');
      if (taken.has('dice') && !taken.has('log')) {
        await w.click('#btn-log');
        await waitUntil(async () => ((await w.evaluate('document.getElementById("log").open')) ? true : null), 5_000, '대사 기록 창');
        await once('log', '11_backlog.png');
        await w.evaluate('document.getElementById("log").close()');
      }
      if (beatKey === route.saveLoadAt && !savedAndLoaded) {
        await w.click('#btn-save');
        await waitUntil(async () => ((await w.evaluate('document.getElementById("slots").open')) ? true : null), 5_000, '저장 창');
        await shot('08_save.png');
        await w.click('#slots-list button[data-slot="slot1"]');
        await waitUntil(async () => ((await w.evaluate('document.getElementById("toast").hidden')) ? null : true), 5_000, '저장 알림');
        await w.navigate(`${base}/?fast=1&seed=${seed}`);
        await waitUntil(async () => ((await w.evaluate('document.getElementById("title-status").textContent')) ? true : null), 20_000, '타이틀 다시 열기');
        cpuBeforeLoad = await cpuSnapshot();
        const loadStarted = Date.now();
        await w.click('#btn-continue');
        try {
          await waitUntil(async () => ((await w.evaluate('document.getElementById("slots").open')) ? true : null), 5_000, '불러오기 창');
          loadDialogMs = Date.now() - loadStarted;
        } finally {
          console.log(`  불러오기 창 열림: ${loadDialogMs < 0 ? '5000ms 안에 안 열림' : `${loadDialogMs}ms`} · 누르기 직전 CPU ${cpuBeforeLoad}`);
        }
        await w.click('#slots-list button[data-slot="slot1"]');
        savedAndLoaded = true;
        continue;
      }
      const text = inputs[beatKey]?.shift() ?? FALLBACK_INPUT;
      await w.evaluate(`(() => { const i = document.getElementById('free-input'); i.value = ${JSON.stringify(text)}; document.getElementById('say').requestSubmit(); })()`);
      console.log(`  자유 입력(${beatKey}): ${text}`);
      if (!taken.has('thinking') && (await phase()) === 'thinking') await once('thinking', '06_gm_thinking.png');
    }
  }
  await waitPhase(['result']);
  await Bun.sleep(300);
  await shot('10_result.png');

  const session = JSON.parse(await w.evaluate('JSON.stringify(window.__wolheun.session)')) as string;
  const result = (await (await fetch(`${base}/api/result?session=${session}`)).json()) as ResultSummary;
  const logEntries = (await Bun.file(join(APP, 'logs', `${session}.jsonl`)).text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { kind: string; ending?: string });
  const logKinds = new Set(logEntries.map((e) => e.kind));
  const endingId = logEntries.find((e) => e.kind === 'end')?.ending ?? null;
  const report = await net.stop();
  const sandboxProbe = await Bun.$`sandbox-exec -f ${join(APP, 'config', 'offline.sb')} curl -sS -m 5 -o /dev/null https://example.com`.quiet().nothrow();

  console.log(`[e2e ${values.route}] 결말: ${result.ending?.title ?? '없음'} · 판정 ${result.checks.length}회 · 선택/입력 ${result.decisions.length}회 · GM 호출 ${result.gm.calls}회(다시 생성 ${result.gm.retries}, 대체 ${result.gm.fallbacks}) · 플레이 ${Math.round(result.playMs / 1000)}초`);
  check(result.ending !== null, `슬라이스를 끝까지 통과해 결말 '${result.ending?.title ?? '-'}'에 닿았다`);
  check(endingId === route.ending, `이 갈래의 결말 id 는 ${route.ending}이다 (받은 값 ${endingId})`);
  check(result.checks.length >= 2, `판정이 2회 이상 있었다 (${result.checks.length}회)`);
  check(result.decisions.filter((d) => d.kind === 'input').length >= 2, '자유 입력이 2회 이상 GM 을 거쳤다');
  if (noLlm) console.log('  건너뜀 · --no-llm 이라 로컬 GM 대사 검사를 하지 않았다');
  else check(result.gm.calls >= 2 && gmLines >= 1, `로컬 GM 이 실제로 대사를 썼다 (GM 대사 ${gmLines}줄)`);
  if (route.saveLoadAt) check(savedAndLoaded && logKinds.has('load'), '저장한 뒤 새로 열어 불러오고 이어서 끝까지 갔다');
  check(report.samples > 3 && report.external.length === 0, `실행 내내 외부 네트워크 연결이 없었다 (lsof 표본 ${report.samples}회, 외부 연결 ${report.external.length}건)`);
  check(report.publicListeners.length === 0, '열린 포트는 모두 127.0.0.1 이었다');
  check(sandboxProbe.exitCode !== 0, `샌드박스 안에서는 외부 접속이 막힌다 (curl 종료 코드 ${sandboxProbe.exitCode})`);

  await Bun.write(
    join(values.out, `autoplay-${values.route}.json`),
    `${JSON.stringify({ route: values.route, title: route.title, seed, model: health.model, bootMs, wallMs: Date.now() - started, result, gmLines, savedAndLoaded, loadDialogMs, cpuBeforeLoad, net: report, sandboxProbeExit: sandboxProbe.exitCode, failures }, null, 2)}\n`,
  );
} catch (err) {
  failures.push((err as Error).message);
  console.error(`[e2e ${values.route}] 오류: ${(err as Error).message}`);
  if (view && values.shots) await Bun.write(join(values.shots, '99_error.png'), await view.screenshot()).catch(() => undefined);
} finally {
  view?.close?.();
  runner.kill('SIGINT');
  await runner.exited;
}

console.log(failures.length === 0 ? `[e2e ${values.route}] 통과` : `[e2e ${values.route}] 실패 ${failures.length}건`);
process.exit(failures.length === 0 ? 0 : 1);
