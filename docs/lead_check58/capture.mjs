const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
const captured = new Set();
const checks = [];
let asked = false;
const wanted = new Map([
  ['억울해…', 'b04_after'],
  ['그리고 현재.', 'b04_cause'],
  ['하. 웃기는 여자군.', 'voice_after'],
]);
const out = new URL('./', import.meta.url);
async function snapshot(name) {
  await Bun.write(new URL(`${name}.png`, out), await view.screenshot());
  captured.add(name);
}
try {
  await view.navigate('http://127.0.0.1:18194/?fast=1&seed=1');
  await view.click('#btn-new');
  for (let turn = 0; turn < 1200; turn++) {
    const s = JSON.parse(await view.evaluate(`JSON.stringify({
      phase:window.__wolheun.phase, prompt:window.__wolheun.prompt,
      text:document.getElementById('text').textContent,
      intro:!document.getElementById('intro-skip').hidden,
      gm:!document.getElementById('gm-box').hidden,
      gmText:document.getElementById('gm-text').textContent,
      beat:document.getElementById('beat-title').textContent,
      changes:document.getElementById('changes').textContent,
      earringVisible:[...document.querySelectorAll('[data-track="귀찌"]')].some(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none'),
      badge:document.getElementById('gm-badge').hidden,
      by:window.__wolheun.backlog.at(-1)?.by,
      mental:document.querySelector('[data-track="정신력"] .value')?.textContent,
      deltas:[...document.querySelectorAll('.delta')].map(d=>{
        const a=d.getBoundingClientRect(),b=d.parentElement.querySelector('.value').getBoundingClientRect();
        return {text:d.textContent,overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};
      })
    })`));
    if (s.intro && s.gmText.includes('체력·정신력이 오르내리고') && !captured.has('intro_after')) await snapshot('intro_after');
    const name = wanted.get(s.text);
    if (name && !captured.has(name)) {
      checks.push({ name, ...s });
      if (name === 'b04_after') await Bun.sleep(1000);
      await snapshot(name);
    }
    if (s.deltas.length && !captured.has('delta_after')) {
      checks.push({ name: 'delta_after', ...s });
      await snapshot('delta_after');
    }
    if (s.changes && !captured.has('change_cause_after')) {
      checks.push({ name: 'change_cause_after', ...s });
      await snapshot('change_cause_after');
    }
    if (s.phase === 'line' && !s.gm && s.by === 'gm' && !captured.has('character_badge_after')) {
      checks.push({ name: 'character_badge_after', ...s });
      await snapshot('character_badge_after');
    }
    if (s.phase === 'free' && s.prompt?.beat === 'b05_why' && !captured.has('notes_after')) {
      await view.click('#btn-notes');
      await snapshot('notes_after');
      await view.click('#notes-close');
    }
    if (s.phase === 'ending' || s.phase === 'result') break;
    if (s.intro) await view.click('#gm-box');
    else if (s.phase === 'free') {
      if (s.prompt?.beat === 'b05_why' && !asked) {
        asked = true;
        await view.evaluate(`document.getElementById('free-input').value='어째서 내 목에 칼을 댔어요?'`);
        await view.click('#free-send');
        continue;
      }
      const id = s.prompt?.beat === 'b02_people' ? 'run'
        : s.prompt?.beat === 'b05_why' ? 'beauty'
        : s.prompt?.beat === 'b06_swing' ? 'dodge' : null;
      const clicked = await view.evaluate(`(() => {
        const b=[...document.querySelectorAll('#approaches button')].find(b=>${id ? `b.dataset.id===${JSON.stringify(id)}` : 'true'});
        if(b){b.click();return true;} return false;
      })()`);
      if (!clicked) throw new Error(`접근법 없음: ${JSON.stringify(s)}`);
    } else if (s.phase === 'choices') await view.click('#choices button[data-id="luck-skip"]');
    else if (s.phase === 'line') await view.click(s.gm ? '#gm-box' : '#dialog');
    else if (s.phase === 'dice') await view.click('#dice');
    else await Bun.sleep(40);
  }
  await snapshot('ending_after');
  await Bun.write(new URL('screen_checks.json', out), JSON.stringify(checks, null, 2));
  await Bun.write(new URL('backlog.json', out), await view.evaluate('JSON.stringify(window.__wolheun.backlog,null,2)'));
  console.log(JSON.stringify({ captured: [...captured], phase: await view.evaluate('window.__wolheun.phase') }));
  if (!captured.has('b04_after') || !captured.has('intro_after') || !captured.has('notes_after')) throw new Error('필수 화면 캡처 부족');
} finally {
  await view.close();
}
