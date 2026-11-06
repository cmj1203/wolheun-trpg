import { chromium } from '/Users/choeminju/mobile-test/node_modules/playwright/index.mjs';
import { copyFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:18195';
const rows = await Bun.file(`${import.meta.dir}/cases.json`).json();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const report = [];
const selected = process.argv[2] ? rows.filter((row) => row.id === process.argv[2]) : rows;

async function settle(page, expected) {
  for (let count = 0; count < 180; count++) {
    const phase = await page.evaluate(() => window.__wolheun?.phase);
    if (expected && phase === 'line') {
      const text = await page.locator('#changes').textContent();
      if (expected.every((line) => text.includes(line))) {
        await page.waitForFunction(() => !document.querySelector('#text').hasAttribute('data-rest'));
        return;
      }
    }
    if (['free', 'choices', 'ending', 'result'].includes(phase)) return;
    if (phase === 'line') await page.locator('#text').click({ force: true });
    if (phase === 'dice') await page.locator('#dice').click({ force: true });
    await page.waitForTimeout(35);
  }
  throw new Error('화면 진행이 입력 자리에서 멈추지 않음');
}

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const row of selected) {
      await copyFile(`/tmp/lane44/srv/${row.id}.json`, '/tmp/lane44/srv/saves/slot1.json');
      await page.goto(base);
      await page.locator('#btn-continue').click();
      await page.locator('[data-slot="slot1"]').click();
      await settle(page);
      const response = page.waitForResponse((r) => r.url().endsWith('/api/act'));
      await page.locator('#free-input').fill(row.text);
      await page.locator('#free-send').click();
      const stream = (await (await response).text()).trim().split('\n').map((s) => JSON.parse(s));
      await settle(page, row.id === 'map-miss' ? row.lines : undefined);
      const displayed = await page.locator('#changes').innerText();
      for (const line of row.lines) if (!displayed.includes(line)) throw new Error(`${row.id}: 변화 줄 누락 ${line}`);
      const actualRoll = stream.flatMap((m) => m.event?.type === 'roll' ? [m.event] : [])[0];
      const actualCost = stream.flatMap((m) => m.event?.type === 'price' ? [m.event.id] : [])[0] ?? '없음';
      if (actualRoll?.tier !== row.tier || actualCost !== row.cost) throw new Error(`${row.id}: 고정 결과 불일치`);
      const metrics = await page.locator('#changes').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, screenHeight: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      if (metrics.overflow || metrics.bottom > metrics.screenHeight) throw new Error(`${row.id}: 변화 줄 화면 밖 ${JSON.stringify(metrics)}`);
      const screenshot = `${import.meta.dir}/${row.id}-${width}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      let restored = false;
      if (row.id === 'bag-miss') {
        const before = displayed;
        await page.locator('#btn-save').click();
        await page.locator('[data-slot="slot2"]').click();
        await page.reload();
        await page.locator('#btn-continue').click();
        await page.locator('[data-slot="slot2"]').click();
        await settle(page);
        if (await page.locator('#changes').innerText() !== before) throw new Error('저장 복원 변화 줄 불일치');
        restored = true;
        await page.screenshot({ path: `${import.meta.dir}/restore-${width}.png`, fullPage: true });
        await page.locator('#btn-log').click();
        if (!(await page.locator('#log-list').innerText()).includes('마법 가방 잃음')) throw new Error('기록에 소지품 손실 누락');
        await page.screenshot({ path: `${import.meta.dir}/log-${width}.png`, fullPage: true });
        await page.locator('#log-close').click();
      }
      report.push({ id: row.id, width, result: actualRoll.tier, cost: actualCost, displayed, metrics, restored, screenshot });
      console.log(`화면 확인 ${row.id} ${width}`);
    }
    if (errors.length) throw new Error(`브라우저 오류: ${errors.join(' / ')}`);
    await context.close();
  }
  const previous = process.argv[2] ? await Bun.file(`${import.meta.dir}/browser-results.json`).json() : [];
  await Bun.write(`${import.meta.dir}/browser-results.json`, JSON.stringify([...previous.filter((row) => row.id !== process.argv[2]), ...report], null, 2));
} finally {
  await browser.close();
}
