// 피드백 단추 e2e(--no-llm): 앱을 띄우고 첫 자유 입력 뒤 [피드백] → 글 입력 → [보내기] 까지 화면으로 누른 뒤,
// feedback.jsonl 에 한 줄이 생기고 자동 첨부 필드가 모두 있는지 확인한다. 사진은 --shots 폴더에 창 열림·토스트 두 장.
// 사용법: bun e2e/feedback.ts [--port 18192] [--llm-port 18190] [--shots <폴더>] [--out <폴더>]
import { parseArgs } from 'node:util';
import { mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { e2eState } from './state.ts';

const APP = join(import.meta.dir, '..');
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: 'string', default: '18192' },
    'llm-port': { type: 'string', default: '18190' },
    shots: { type: 'string' },
    out: { type: 'string', default: join(APP, 'e2e', 'out') },
    seed: { type: 'string', default: '2' },
  },
});
const base = `http://127.0.0.1:${values.port}`;
mkdirSync(values.out, { recursive: true });
if (values.shots) mkdirSync(values.shots, { recursive: true });
const feedbackFile = join(values.out, 'feedback-e2e.jsonl');
await Bun.write(feedbackFile, '');

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

const runLog = join(values.out, 'run-feedback.log');
const runArgs = ['./run.sh', '--no-open', '--port', values.port, '--llm-port', values['llm-port'], '--no-llm'];
console.log(`[e2e 피드백] 시드 ${values.seed} · ${runArgs.join(' ')} · WOLHEUN_FEEDBACK=${relative(APP, feedbackFile)}`);
const state = e2eState();
const runner = Bun.spawn(runArgs, { cwd: APP, stdout: Bun.file(runLog), stderr: Bun.file(runLog), env: { ...process.env, ...state.env, WOLHEUN_FEEDBACK: feedbackFile } });

let view: Bun.WebView | null = null;
try {
  await waitUntil(async () => ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok ? true : null), 120_000, 'run.sh 로 앱 띄우기');
  const w = new Bun.WebView({ width: 1440, height: 810 });
  view = w;
  const shot = async (name: string) => {
    if (!values.shots) return;
    await Bun.write(join(values.shots, name), await w.screenshot());
  };
  const evalJson = async <T>(expr: string): Promise<T> => JSON.parse(await w.evaluate(`JSON.stringify(${expr})`)) as T;
  const phase = () => evalJson<string | null>('window.__wolheun ? window.__wolheun.phase : null');
  const waitPhase = (targets: string[]) =>
    waitUntil(async () => {
      const p = await phase();
      return p && targets.includes(p) ? p : null;
    }, 60_000, `화면 단계 ${targets.join('/')}`);

  await w.navigate(`${base}/?fast=1&seed=${values.seed}`);
  await waitUntil(async () => ((await w.evaluate('document.getElementById("title-status").textContent')) ? true : null), 20_000, '타이틀 화면');
  await w.click('#btn-new');

  // 첫 자유 입력 자리까지 줄을 넘긴 뒤 말 한 줄을 넣고, 다시 자유 입력 자리가 오면 피드백을 보낸다(마지막 입력이 붙는지 보려고).
  let typed = false;
  let asked = false;
  const askState = () => evalJson<{ on: boolean; pressed: string; label: string; inField: boolean; face: string }>(
    `(() => { const b = document.getElementById('ask-gm'); return { on: b.classList.contains('is-on'), pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'), inField: b.parentElement === document.getElementById('free-input').parentElement, face: b.querySelector('img').getAttribute('src') ?? '' }; })()`,
  );
  // 도입부 대사 중에 질문해도 답이 바로 나오고, 남은 도입부 줄이 사라지지 않는다.
  let openingAsked = false;
  for (let guard = 0; guard < 200; guard++) {
    const p = await waitPhase(['line', 'dice', 'free', 'choices']);
    if (p === 'line' && !openingAsked) {
      openingAsked = true;
      await w.click('#ask-gm');
      await w.evaluate(`(() => { const i = document.getElementById('free-input'); i.value = '크롬웰이 어디야?'; document.getElementById('say').requestSubmit(); })()`);
      await waitUntil(async () => ((await evalJson<boolean>('!document.getElementById("gm-box").hidden && !!document.getElementById("gm-text").textContent')) ? true : null), 10_000, '도입부 대사 중 질문의 답');
      continue;
    }
    if (p === 'line') {
      await w.click((await evalJson<boolean>('document.getElementById("gm-box").hidden')) ? '#dialog' : '#gm-box');
      continue;
    }
    if (p === 'dice') {
      await waitUntil(async () => ((await w.evaluate('document.getElementById("dice-tier").textContent')) ? true : null), 10_000, '주사위 결과');
      await w.click('#dice');
      continue;
    }
    if (p === 'choices') {
      await w.click('#choices button[data-id="luck-skip"]');
      continue;
    }
    if (!asked) {
      asked = true;
      const opening = await evalJson<string[]>('window.__wolheun.backlog.map((b) => b.text)');
      check(['그렇게 남대륙의 크라차로 가기 위해 사막을 횡단하던 중이었다―', '길을 헤맨 지 벌써 일주일째야…'].every((t) => opening.some((o) => o.includes(t))), '도입부 대사 중에 질문해도 남은 줄이 모두 나왔다');
      const off = await askState();
      check(off.inField && off.face.includes('gm_neutral') && off.label === 'GM에게 묻기', '입력창 안에 여우 얼굴 버튼이 있고 이름이 그대로다');
      await w.click('#ask-gm');
      const on = await askState();
      check(on.on && on.pressed === 'true', '버튼을 누르면 질문 모드가 켜지고 버튼에 보인다');
      await w.click('#ask-gm');
      const backOff = await askState();
      check(!backOff.on && backOff.pressed === 'false', '다시 누르면 질문 모드가 꺼진다');
      await w.click('#ask-gm');
      await w.evaluate(`(() => { const i = document.getElementById('free-input'); i.value = '지금 뭘 해야 돼?'; document.getElementById('say').requestSubmit(); })()`);
      await waitUntil(async () => ((await evalJson<boolean>('!document.getElementById("gm-box").hidden && !!document.getElementById("gm-text").textContent')) ? true : null), 10_000, '질문 답');
      check(!(await askState()).on, '질문을 보내면 여우가 답하고 질문 모드가 꺼진다');

      // 연속 질문: 앞 답이 떠 있는 동안 새 질문을 보내면 앞 답을 넘기지 않아도 새 답이 바로 나온다. 사이에 이야기 줄이 끼지 않고 수치도 그대로다.
      const before = await evalJson<{ beat: string; hud: string; dialog: string }>(`({ beat: window.__wolheun.prompt.beat, hud: document.getElementById('hud').textContent, dialog: document.getElementById('text').textContent })`);
      for (const question of ['어떻게 하는 거야?', '크롬웰이 어디야?']) {
        const seen = await evalJson<number>('window.__wolheun.backlog.length');
        await w.click('#ask-gm');
        await w.evaluate(`(() => { const i = document.getElementById('free-input'); i.value = ${JSON.stringify(question)}; document.getElementById('say').requestSubmit(); })()`);
        const added = await waitUntil(async () => {
          const lines = await evalJson<{ who: string; text: string }[]>(`window.__wolheun.backlog.slice(${seen})`);
          const shown = await evalJson<string>('document.getElementById("gm-text").textContent');
          return lines.length > 0 && lines.some((l) => l.text === shown) ? lines : null;
        }, 10_000, `앞 답을 넘기지 않은 새 답(${question})`);
        check(added.every((l) => l.who === 'GM' || l.who.endsWith('(입력)')), `연속 질문 '${question}' 의 답이 넘기지 않아도 나오고 이야기 줄이 끼지 않는다`);
      }
      const after = await evalJson<{ beat: string; hud: string; dialog: string }>(`({ beat: window.__wolheun.prompt.beat, hud: document.getElementById('hud').textContent, dialog: document.getElementById('text').textContent })`);
      check(after.beat === before.beat && after.hud === before.hud && after.dialog === before.dialog, '연속 질문 뒤 비트, 수치, 대사창이 그대로다');
      continue;
    }
    if (!typed) {
      typed = true;
      await w.evaluate(`(() => { const i = document.getElementById('free-input'); i.value = '저기요, 잠깐만요'; document.getElementById('say').requestSubmit(); })()`);
      console.log('  자유 입력: 저기요, 잠깐만요');
      continue;
    }
    break;
  }
  const beat = await evalJson<string>('window.__wolheun.prompt.beat');
  check(typed, `자유 입력을 한 번 넣은 뒤 다시 자유 입력 자리(${beat})에 섰다`);

  await w.click('#feedback-open');
  await waitUntil(async () => ((await evalJson<boolean>('document.getElementById("feedback").open')) ? true : null), 5_000, '피드백 창');
  check(await evalJson<boolean>('document.getElementById("gm-box").hidden'), '피드백 창이 열려도 여우 말풍선은 숨겨져 있다');
  check(!(await evalJson<boolean>('document.getElementById("ask-gm").classList.contains("is-on")')), '피드백 창은 질문 모드를 켜지 않는다');
  await shot('feedback_open.png');

  await w.click('#feedback-send');
  check(await evalJson<boolean>('document.getElementById("feedback").open'), '빈 글로 [보내기]를 눌러도 창이 그대로다');
  check((await Bun.file(feedbackFile).text()).trim() === '', '빈 글은 feedback.jsonl 에 남지 않는다');

  const text = '여우가 설명을 너무 길게 해요';
  await w.evaluate(`(() => { const t = document.getElementById('feedback-text'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await w.click('#feedback-send');
  await waitUntil(async () => ((await evalJson<boolean>('document.getElementById("feedback").open')) ? null : true), 5_000, '피드백 창 닫힘');
  const toastText = await waitUntil(async () => {
    const hidden = await evalJson<boolean>('document.getElementById("toast").hidden');
    return hidden ? null : await evalJson<string>('document.getElementById("toast").textContent');
  }, 5_000, '토스트');
  check(toastText === '피드백을 보냈어', `토스트 글: ${toastText}`);
  await shot('feedback_toast.png');

  const lines = (await Bun.file(feedbackFile).text()).split('\n').filter(Boolean);
  check(lines.length === 1, `feedback.jsonl 에 줄 ${lines.length}개(기대 1)`);
  const record = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
  check(record.text === text, `적은 글이 그대로 남았다: ${String(record.text)}`);
  const top = ['id', 'receivedAt', 'version', 'at', 'session', 'beatTitle', 'recent', 'tracks', 'askMode', 'window', 'game'];
  const missingTop = top.filter((k) => !(k in record));
  check(missingTop.length === 0, `자동 첨부 필드(화면): ${missingTop.length === 0 ? top.join(', ') : `없음 → ${missingTop.join(', ')}`}`);
  const game = (record.game ?? {}) as Record<string, unknown>;
  const gameKeys = ['seed', 'beat', 'beatTitle', 'lastInput', 'tracks', 'flags'];
  const missingGame = gameKeys.filter((k) => !(k in game));
  check(missingGame.length === 0, `자동 첨부 필드(서버 판 상태): ${missingGame.length === 0 ? gameKeys.join(', ') : `없음 → ${missingGame.join(', ')}`}`);
  check(typeof record.session === 'string' && record.session.length > 0, `세션 id: ${String(record.session)}`);
  check(game.beat === beat, `비트 id ${String(game.beat)} = 화면 ${beat}`);
  check(game.lastInput === '저기요, 잠깐만요', `마지막 입력: ${String(game.lastInput)}`);
  const recent = Array.isArray(record.recent) ? (record.recent as { speaker: string; text: string }[]) : [];
  check(recent.length > 0 && recent.length <= 6 && recent.every((r) => typeof r.speaker === 'string' && typeof r.text === 'string'), `최근 줄 ${recent.length}개(화자·글)`);
  check(record.askMode === false, '질문 모드 여부 false');
  const win = record.window as { width?: number; height?: number } | undefined;
  check(win?.width === 1440 && win?.height === 810, `창 크기 ${win?.width}×${win?.height}`);
  check(typeof record.version === 'string' || record.version === null, `앱 버전: ${String(record.version)}`);
  const tracks = (game.tracks ?? {}) as Record<string, number>;
  check(['의심', '귀찌', '집착', '탈주'].every((k) => typeof tracks[k] === 'number'), `수치: ${JSON.stringify(tracks)}`);
  console.log(`  예시 줄: ${lines[0]?.slice(0, 600)}`);

  const fill = (draft: string) => w.evaluate(`(() => { const t = document.getElementById('feedback-text'); t.value = ${JSON.stringify(draft)}; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const isOpen = () => evalJson<boolean>('document.getElementById("feedback").open');
  const saved = async () => (await Bun.file(feedbackFile).text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
  const savedCount = (count: number) => waitUntil(async () => ((await saved()).length === count ? true : null), 5_000, `feedback.jsonl ${count}줄`);

  // 보내는 중 창을 닫고 다시 열어 새 글을 쓰면, 먼저 보낸 요청이 끝나도 새 글이 닫히거나 지워지지 않는다. 요청을 붙잡아 순서를 고정한다.
  await w.evaluate(`(() => {
    const real = window.fetch;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    window.__releaseFeedback = () => { release(); window.fetch = real; };
    window.fetch = async (url, init) => { if (String(url).includes('/feedback')) await gate; return real(url, init); };
  })()`);
  await w.click('#feedback-open');
  await fill('먼저 보낸 글');
  await w.click('#feedback-send');
  await w.click('#feedback-close');
  check(!(await isOpen()), '보내는 중에 창을 닫았다');
  await w.click('#feedback-open');
  const newDraft = '다시 열어 새로 쓰는 글';
  await fill(newDraft);
  await w.evaluate('window.__releaseFeedback()');
  await savedCount(2);
  await waitUntil(async () => ((await evalJson<boolean>('document.getElementById("feedback-send").disabled')) ? null : true), 5_000, '보내기 단추 복귀');
  check(await isOpen(), '먼저 보낸 요청이 끝나도 새 글 창이 열려 있다');
  check((await evalJson<string>('document.getElementById("feedback-text").value')) === newDraft, '새로 쓰던 글이 그대로다');
  check((await saved())[1]?.text === '먼저 보낸 글', '먼저 보낸 글이 파일에 들어갔다');
  await w.click('#feedback-send');
  await savedCount(3);
  await waitUntil(async () => ((await isOpen()) ? null : true), 5_000, '새 글 보낸 뒤 창 닫힘');
  check((await saved())[2]?.text === newDraft, '새 글도 파일에 들어갔다');

  // 결과 화면에서 보낸 글이 파일에 들어간다.
  await w.evaluate(`(() => { const i = document.getElementById('free-input'); i.value = '그만할래'; document.getElementById('say').requestSubmit(); })()`);
  await waitUntil(async () => ((await evalJson<boolean>('document.getElementById("confirm").open')) ? true : null), 10_000, '그만두기 확인 창');
  await w.click('#confirm-ok');
  for (let guard = 0; guard < 100; guard++) {
    const p = await waitPhase(['line', 'dice', 'ending', 'result', 'choices']);
    if (p === 'result') break;
    if (p === 'line') await w.click((await evalJson<boolean>('document.getElementById("gm-box").hidden')) ? '#dialog' : '#gm-box');
    else if (p === 'dice') await w.click('#dice');
    else if (p === 'ending') await w.click('#ending');
    else await w.click('#choices button[data-id="luck-skip"]');
  }
  await shot('result_buttons.png');
  await w.click('#btn-feedback-result');
  await waitUntil(async () => ((await isOpen()) ? true : null), 5_000, '결과 화면 피드백 창');
  await shot('result_feedback_open.png');
  const endingNote = '결말 화면에서 보내는 글';
  await fill(endingNote);
  await w.click('#feedback-send');
  await savedCount(4);
  await waitUntil(async () => ((await isOpen()) ? null : true), 5_000, '결과 화면 피드백 창 닫힘');
  const fromResult = (await saved())[3] ?? {};
  check(fromResult.text === endingNote, `결과 화면에서 보낸 글이 파일에 들어갔다: ${String(fromResult.text)}`);
  const endingGame = (fromResult.game ?? {}) as Record<string, unknown>;
  check(endingGame.beat === 'e_quit', `결과 화면 판 상태의 비트: ${String(endingGame.beat)}`);
  check((await phase()) === 'result', '보낸 뒤에도 결과 화면에 머문다');
} catch (err) {
  failures.push((err as Error).message);
  console.error(`[e2e 피드백] 오류: ${(err as Error).message}`);
  if (view && values.shots) await Bun.write(join(values.shots, '99_feedback_error.png'), await view.screenshot()).catch(() => undefined);
} finally {
  view?.close?.();
  runner.kill('SIGINT');
  await runner.exited;
  state.remove();
}

console.log(failures.length === 0 ? '[e2e 피드백] 통과' : `[e2e 피드백] 실패 ${failures.length}건`);
process.exit(failures.length === 0 ? 0 : 1);
