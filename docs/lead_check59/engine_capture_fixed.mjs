const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
const checks = [];
try {
  await view.navigate('http://127.0.0.1:18196/?fast=1&seed=1');
  await view.click('#btn-new');
  for (let turn = 0; turn < 800; turn++) {
    const s = JSON.parse(await view.evaluate(`JSON.stringify({
      phase:window.__wolheun.phase,prompt:window.__wolheun.prompt,
      text:document.getElementById('text').textContent,
      intro:!document.getElementById('intro-skip').hidden,
      gm:!document.getElementById('gm-box').hidden
    })`));
    if (s.text === '그리고 현재.' || s.text === '억울해…') {
      await Bun.sleep(s.text === '억울해…' ? 650 : 150);
      const geometry = await view.evaluate(`JSON.stringify([...document.querySelectorAll('.delta')].map(d=>{
        const a=d.getBoundingClientRect(),h=document.querySelector('.hud').getBoundingClientRect();
        const range=document.createRange();range.selectNodeContents(d.parentElement.firstChild);
        const n=range.getBoundingClientRect();
        return {text:d.textContent,inside:a.left>=h.left&&a.right<=h.right,
          overlap:a.left<n.right&&a.right>n.left&&a.top<n.bottom&&a.bottom>n.top,
          left:a.left,right:a.right,numberRight:n.right};
      }))`);
      checks.push({ ...s, geometry: JSON.parse(geometry) });
      const name = s.text === '억울해…' ? 'b04_after' : 'b04_cause';
      await Bun.write(new URL(`./engine_${name}.png`, import.meta.url), await view.screenshot());
      if (name === 'b04_after') break;
    }
    if (s.intro) await view.click('#gm-box');
    else if (s.phase === 'free') await view.click('#approaches button[data-id="run"]');
    else if (s.phase === 'line') await view.click(s.gm ? '#gm-box' : '#dialog');
    else if (s.phase === 'dice') await view.click('#dice');
    else if (s.phase === 'choices') await view.click('#choices button[data-id="luck-skip"]');
    else await Bun.sleep(30);
  }
  await Bun.write(new URL('./engine_fixed_screen_checks.json', import.meta.url), JSON.stringify(checks, null, 2));
  if (!checks.some(s => s.text === '억울해…')) throw new Error('b04 화면 미도달');
  if (checks.some(s => s.geometry.some(g => !g.inside || g.overlap))) throw new Error('변화 숫자 겹침 또는 판 밖');
  console.log('CAPTURE59_FIXED_DONE');
} finally {
  await view.close();
}
