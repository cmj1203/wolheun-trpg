// 화면 상태 e2e 시험의 공용 도구. --no-llm 앱 서버를 이 프로세스 안에서 띄우고(임시 저장·기록 폴더),
// Playwright Chromium 으로 마우스를 움직여 진행한다. Playwright 는 저장소 의존성이 아니라 기계에 깔린 것을 쓴다.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server/main.ts';

const APP = join(import.meta.dir, '..');

/* eslint-disable @typescript-eslint/no-explicit-any -- Playwright 형식은 저장소에 없다. */
export type Page = any;
export type Browser = any;

/** Playwright 를 불러온다. 없으면 null(시험은 건너뛴다). */
export async function loadChromium(): Promise<{ launch: (opts?: object) => Promise<Browser> } | null> {
  // bun test 는 NODE_PATH 를 보지 않으므로 전역 설치 자리도 직접 찾아본다.
  const places = ['playwright', ...(process.env.WOLHEUN_PLAYWRIGHT ? [process.env.WOLHEUN_PLAYWRIGHT] : []), ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean).map((p) => join(p, 'playwright'))];
  for (const name of places) {
    try {
      const pw = (await import(name)) as { chromium?: { launch: (opts?: object) => Promise<Browser> } };
      if (pw.chromium) return pw.chromium;
    } catch {
      // 다음 자리
    }
  }
  console.warn('Playwright 를 찾지 못해 화면 e2e 를 건너뜁니다 (WOLHEUN_PLAYWRIGHT=<playwright 폴더> 로 알려 줄 수 있다)');
  return null;
}

export async function startApp() {
  const dir = mkdtempSync(join(tmpdir(), 'wolheun-screen-'));
  const { server } = await startServer({
    port: 0,
    llmUrl: null,
    modelKey: null,
    scenarioPath: join(APP, 'content', 'ep01_desert.yaml'),
    lorePath: join(APP, 'content', 'lore_wolheun.yaml'),
    savesDir: join(dir, 'saves'),
    atlasFile: join(dir, 'atlas.json'),
    logsDir: join(dir, 'logs'),
    llmTimeoutMs: 1000,
    feedbackFile: join(dir, 'feedback.jsonl'),
  });
  return {
    base: `http://127.0.0.1:${server.port}`,
    dir,
    stop: () => {
      server.stop(true);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const phaseOf = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as { __wolheun: { phase: string } }).__wolheun.phase);

export const waitPhase = (page: Page, phases: string[], timeout = 15_000): Promise<unknown> =>
  page.waitForFunction((ps: string[]) => ps.includes((window as unknown as { __wolheun: { phase: string } }).__wolheun.phase), phases, { timeout });

export async function openTitle(page: Page, base: string, query = 'fast=1&seed=2'): Promise<void> {
  await page.goto(`${base}/?${query}`);
  await page.waitForFunction(() => document.getElementById('title-status')?.textContent);
}

/** 대사·주사위·결말을 마우스로 넘겨 다음 입력 자리(free/choices/result)까지 간다. */
export async function clickToPrompt(page: Page, stopAt: string[] = ['free', 'choices', 'result'], guard = 200): Promise<string> {
  for (let i = 0; i < guard; i++) {
    await waitPhase(page, ['line', 'dice', 'ending', ...stopAt]);
    const p = await phaseOf(page);
    if (stopAt.includes(p)) return p;
    if (p === 'line') {
      const gm = await page.evaluate(() => !document.getElementById('gm-box')!.hidden);
      await page.click(gm ? '#gm-box' : '#dialog');
    } else if (p === 'dice') {
      await page.waitForFunction(() => document.getElementById('dice-tier')!.textContent);
      await page.click('#dice');
    } else if (p === 'ending') await page.click('#ending');
    await page.waitForTimeout(20);
  }
  throw new Error('입력 자리에 닿지 못했습니다');
}

/** 입력칸을 마우스로 눌러 글을 치고 [말하기] 를 누른다. */
export async function say(page: Page, text: string): Promise<void> {
  await page.click('#free-input');
  await page.keyboard.type(text);
  await page.click('#free-send');
}

/** 결말(result)까지 마우스로 간다. 자유 입력 자리에는 text 를, 선택지에는 첫 단추를 고른다. */
export async function playToResult(page: Page, text = '똑바로 바라본다'): Promise<void> {
  for (let i = 0; i < 80; i++) {
    const p = await clickToPrompt(page);
    if (p === 'result') return;
    if (p === 'choices') await page.click('#choices button >> nth=0');
    else await say(page, text);
  }
  throw new Error('결과 화면에 닿지 못했습니다');
}
