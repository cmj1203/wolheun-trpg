import { Engine } from '../../app/src/engine/engine.ts';
import { writeSave } from '../../app/src/engine/save.ts';
import { FakeGm, loadDesert } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const records = [];
for (const [slot, flags] of [
  ['slot2', { 귀찌_변장_설명: true }],
  ['slot3', { 귀찌_변장_설명: true, 귀찌_설명: true }],
]) {
  const engine = new Engine({ ...scenario, start: 'b05_why' }, new FakeGm(), () => 0, false);
  const { state, step } = engine.newGame(2, slot);
  Object.assign(state.flags, flags);
  state.tracks.귀찌 = 7;
  const scene = step.events.findLast((e) => e.type === 'scene');
  const line = step.events.findLast((e) => e.type === 'line');
  await writeSave('/tmp/laneC3/saves', slot, scenario, state, Date.now(),
    { scene, line, dialog: line, remaining: [], backlog: [], faces: {}, changes: [] });
}
for (const [slot, name] of [['slot2', 'reveal3'], ['slot3', 'reveal4']]) {
  const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
  try {
    await view.navigate('http://127.0.0.1:18194/?fast=1');
    await view.click('#btn-continue');
    await view.click(`[data-slot="${slot}"]`);
    for (let i = 0; i < 300; i++) {
      if (await view.evaluate(`window.__wolheun.phase==='free'`)) break;
      await Bun.sleep(40);
    }
    await Bun.sleep(1000);
    await Bun.write(new URL(`./${name}_hud.png`, import.meta.url), await view.screenshot());
    await view.click('#btn-notes');
    await Bun.write(new URL(`./${name}_notes.png`, import.meta.url), await view.screenshot());
    records.push({
      name,
      ...(JSON.parse(await view.evaluate(`JSON.stringify({
        notes:document.getElementById('notes').textContent,
        earringVisible:[...document.querySelectorAll('[data-track="귀찌"]')].some(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none'),
        value:document.querySelector('[data-track="귀찌"] .value')?.textContent
      })`))),
    });
    await view.click('#notes-close');
    if (name === 'reveal4') {
      await view.click('#ask-gm');
      await view.evaluate(`document.getElementById('free-input').value='귀찌 수명이 뭐야?'`);
      await view.click('#free-send');
      for (let i = 0; i < 2000; i++) {
        const text = await view.evaluate(`document.getElementById('gm-text').textContent`);
        if (text.includes('일주일') && await view.evaluate(`window.__wolheun.phase==='line'`)) break;
        await Bun.sleep(40);
      }
      await Bun.write(new URL('./reveal4_help.png', import.meta.url), await view.screenshot());
    }
  } finally {
    await view.close();
  }
}
await Bun.write(new URL('./reveal_checks.json', import.meta.url), JSON.stringify(records, null, 2));
console.log('REVEAL58_DONE');
