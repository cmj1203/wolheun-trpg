const task = await taskSpace(16);
const page = task.page('p1');
const directory = '/Users/choeminju/월흔_trpg/docs/lead_check59c';
const { writeFile, copyFile } = await import('node:fs/promises');
await page.reload();
await page.waitForFunction(() => document.getElementById('title-status')?.textContent, undefined, { timeout: 10000 });
await page.click('loc=css:#btn-continue');
await page.waitForSelector('loc=css:[data-slot=slot1]', { state: 'visible', timeout: 10000 });
await page.click('loc=css:[data-slot=slot1]');
await page.waitForFunction(() => document.getElementById('text')?.textContent.endsWith('옷감을 베어 갔다.'), undefined, { timeout: 15000 });
await page.waitForFunction(() => ['slot-left', 'slot-right'].every(id => {
  const slot = document.getElementById(id);
  return Number(getComputedStyle(slot).opacity) > .99 && Array.from(slot.querySelectorAll('img')).some(image =>
    image.complete && image.naturalWidth > 0 && Number(getComputedStyle(image).opacity) > .99);
}), undefined, { timeout: 10000 });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
const result = await page.evaluate(() => ({
  text: document.getElementById('text').textContent,
  width: innerWidth, height: innerHeight,
  mindHidden: document.getElementById('tracks-head').hidden,
  mind: Array.from(document.querySelectorAll('#tracks .track'))
    .filter(element => ['의심', '집착', '호감'].includes(element.dataset.track))
    .map(element => ({ key: element.dataset.track, text: element.textContent, visible: element.getClientRects().length > 0 })),
}));
if (result.width !== 1440 || result.mindHidden || result.mind.filter(track => track.visible).length !== 3)
  throw new Error('결과 서술 화면의 마음 HUD가 보이지 않습니다');
await page.screenshot({ path: `${directory}/reaction_07_result.png` });
await page.click('loc=css:#dialog');
await page.waitForFunction(() => document.getElementById('text')?.textContent === '감히 내 몸에 손을 대다니.', undefined, { timeout: 10000 });
await page.waitForFunction(() => Array.from(document.querySelectorAll('#slot-right img')).some(image =>
  image.src.endsWith('behidat_menacing.png') && image.complete && image.naturalWidth > 0 && Number(getComputedStyle(image).opacity) > .99),
undefined, { timeout: 10000 });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
const reaction = await page.evaluate(async () => {
  const manifest = await (await fetch('/api/manifest')).json();
  const images = Array.from(document.querySelectorAll('#slot-right img')).map(image => ({
    src: image.src, opacity: Number(getComputedStyle(image).opacity),
    complete: image.complete, width: image.naturalWidth, visible: image.getClientRects().length > 0,
  }));
  const spriteKeys = Object.entries(manifest.sprites).filter(([, sprite]) => images.some(image =>
    image.visible && image.opacity > .99 && new URL(sprite.url, location.href).href === image.src)).map(([key]) => key);
  return {
    text: document.getElementById('text').textContent, width: innerWidth, height: innerHeight,
    spriteKeys, images, mindHidden: document.getElementById('tracks-head').hidden,
    resultHidden: document.getElementById('result').hidden,
    cg: document.getElementById('stage').classList.contains('cg-on'),
  };
});
if (!reaction.spriteKeys.includes('man_menacing') || reaction.mindHidden || !reaction.resultHidden || reaction.cg)
  throw new Error('7번 최종 표정 또는 마음 HUD 표시 불일치');
await page.screenshot({ path: `${directory}/face_menacing.png` });
await copyFile(`${directory}/face_menacing.png`, `${directory}/reaction_07.png`);
await writeFile(`${directory}/screen_checks.json`, JSON.stringify({ result, reaction }, null, 2), 'utf8');
console.log(JSON.stringify({ result, reaction }));
console.log('CAPTURE_DONE');
