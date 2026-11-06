import { Engine } from '../../app/src/engine/engine.ts';
import { writeSave } from '../../app/src/engine/save.ts';
import { FakeGm, loadDesert } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const engine = new Engine({ ...scenario, start: 'r3_night' }, new FakeGm(), () => 0, false);
const { state, step } = engine.newGame(2, 'night58');
await writeSave('/tmp/laneC3/saves', 'slot1', scenario, state, Date.now(),
  { scene: step.events.find((e) => e.type === 'scene'), line: null, dialog: null, remaining: step.events, backlog: [], faces: {}, changes: [] });
const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
const captured = [];
try {
  await view.navigate('http://127.0.0.1:18194/?fast=1');
  await view.click('#btn-continue');
  await view.click('[data-slot="slot1"]');
  for (let i = 0; i < 300; i++) {
    const s = JSON.parse(await view.evaluate(`JSON.stringify({
      phase:window.__wolheun.phase, text:document.getElementById('text').textContent
    })`));
    const name = s.text === '하. 웃기는 여자군.' ? 'night_voice_after'
      : s.text === '……' ? 'night_silence_after' : null;
    if (name && !captured.includes(name)) {
      await Bun.sleep(1000);
      await Bun.write(new URL(`./${name}.png`, import.meta.url), await view.screenshot());
      captured.push(name);
    }
    if (captured.length === 2) break;
    if (s.phase === 'line') await view.click('#dialog');
    else await Bun.sleep(40);
  }
  if (captured.length !== 2) throw new Error('밤 갈래의 두 반응 캡처 부족');
  console.log(JSON.stringify(captured));
} finally {
  await view.close();
}
