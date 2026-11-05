import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type Browser, loadChromium, openTitle, phaseOf, playToResult, startApp } from './screen_harness.ts';

const chromium = await loadChromium();
let app: Awaited<ReturnType<typeof startApp>>;
let browser: Browser;
beforeAll(async () => {
  app = await startApp();
  if (chromium) browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  app?.stop();
});

describe.skipIf(!chromium)('화면 e2e', () => {
  test('타이틀부터 결과까지 마우스로 간다', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
    await openTitle(page, app.base);
    await page.click('#btn-new');
    await playToResult(page);
    expect(await phaseOf(page)).toBe('result');
  }, 60_000);
});
