import { Engine } from '../../app/src/engine/engine.ts';
import { writeSave } from '../../app/src/engine/save.ts';
import { FakeGm, loadDesert } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const rows = await Bun.file(new URL('./engine_model.json', import.meta.url)).json();
const only = process.argv.find(arg => arg.startsWith('--only='))?.split('=')[1]?.split(',').map(Number);
const checkFile = new URL('./engine_screen_checks.json', import.meta.url);
const checks = await Bun.file(checkFile).exists() ? await Bun.file(checkFile).json() : [];
const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
try {
  for (const row of rows) {
    if (only && !only.includes(row.i)) continue;
    if (checks.some(check => check.i === row.i)) continue;
    const opening = new Engine({ ...scenario, start: row.beat }, new FakeGm(), () => 0, false)
      .newGame(row.i + 1, `faces59-${row.i - 1}`);
    const maleIndex = row.events.findIndex(e => e.type === 'line' && e.speaker === '남자' && e.by === 'gm');
    const scene = structuredClone([...opening.step.events, ...row.events.slice(0, maleIndex)].findLast(e => e.type === 'scene'));
    if (!scene || !row.male) throw new Error(`${row.i}: 장면 또는 모델 줄 없음`);
    for (const event of row.events.slice(0, maleIndex)) {
      if (event.type === 'sprite') scene.sprites[event.cast] = event.sprite;
    }
    await writeSave('/tmp/laneC4/saves', 'slot1', scenario, row.after, Date.now(), {
      scene, line: row.male, dialog: row.male,
      remaining: row.events.slice(maleIndex + 1), backlog: [],
      faces: { 베히다트: row.male.face }, changes: [],
    });
    await view.navigate('http://127.0.0.1:18194/?fast=1');
    await view.evaluate(`(async()=>{
      if(!document.getElementById('title-status').textContent)await new Promise(resolve=>{
        const observer=new MutationObserver(()=>{if(document.getElementById('title-status').textContent){observer.disconnect();resolve(true);}});
        observer.observe(document.getElementById('title-status'),{childList:true,subtree:true,characterData:true});
      });
      await document.fonts.ready;
      const logo=document.getElementById('title-logo');if(logo.src)await logo.decode();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    })()`);
    await view.click('#btn-continue');
    await view.evaluate(`new Promise((resolve,reject)=>{
      const ready=()=>{const b=document.querySelector('[data-slot="slot1"]');return b&&!b.disabled&&b.getClientRects().length;};
      if(ready()){resolve(true);return;}
      const observer=new MutationObserver(()=>{if(ready()){observer.disconnect();clearTimeout(timer);resolve(true);}});
      const timer=setTimeout(()=>{observer.disconnect();reject(new Error('저장 목록 표시 시간 초과'));},10000);
      observer.observe(document.getElementById('slots'),{childList:true,subtree:true,attributes:true});
    })`);
    await view.click('[data-slot="slot1"]');
    let restored = false;
    for (let turn = 0; turn < 200; turn++) {
      if (await view.evaluate(`document.getElementById('text').textContent === ${JSON.stringify(row.male.text)}`)) {
        restored = true;
        break;
      }
      await Bun.sleep(30);
    }
    if (!restored) throw new Error(`${row.i}: 저장 화면 복원 실패`);
    await Bun.sleep(850);
    const file = `engine_input_${String(row.i).padStart(2, '0')}.png`;
    await Bun.write(new URL(`./${file}`, import.meta.url), await view.screenshot());
    const check = JSON.parse(await view.evaluate(`JSON.stringify({
      text:document.getElementById('text').textContent,
      foxHidden:document.getElementById('gm-mascot').getClientRects().length===0,
      gmBoxHidden:document.getElementById('gm-box').hidden,
      badgeHidden:document.getElementById('gm-badge').hidden,
      resultHidden:document.getElementById('result').hidden,
      cgActive:document.getElementById('stage').classList.contains('cg-on'),
      images:[...document.querySelectorAll('#slot-right img')].map(img=>({src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth,visible:img.getClientRects().length>0,opacity:Number(getComputedStyle(img).opacity)})),
      viewport:{width:innerWidth,height:innerHeight}
    })`));
    const expected = `behidat_${row.male.face}.png`;
    if (!check.images.some(img => img.complete && img.width > 0 && img.visible && img.opacity > 0.8 && img.src.endsWith(expected))) throw new Error(`${row.i}: 실제 표정 이미지 불일치`);
    if (!check.resultHidden || check.cgActive) throw new Error(`${row.i}: 결과 또는 CG가 표정 줄을 덮음`);
    if (!check.foxHidden || !check.gmBoxHidden || !check.badgeHidden) throw new Error(`${row.i}: 이야기 중 여우 또는 GM 배지 노출`);
    if (row.i === 4) {
      const nextMale = row.lines.filter(line => line.speaker === '남자')[1];
      const sequence = [];
      let reached = false;
      for (let turn = 0; turn < 60; turn++) {
        const current = JSON.parse(await view.evaluate(`JSON.stringify({
          phase:window.__wolheun.phase,text:document.getElementById('text').textContent,
          images:[...document.querySelectorAll('#slot-right img')].map(img=>img.getAttribute('src'))
        })`));
        sequence.push(current);
        if (nextMale && current.text === nextMale.text) {
          await Bun.sleep(650);
          const images = await view.evaluate(`[...document.querySelectorAll('#slot-right img')].map(img=>img.getAttribute('src'))`);
          if (!images.some(src => src.endsWith(`behidat_${nextMale.face}.png`))) throw new Error('다음 감정 줄 표정 전환 실패');
          await Bun.write(new URL('./engine_input_04_next_face.png', import.meta.url), await view.screenshot());
          reached = true;
          break;
        }
        if (current.phase === 'line') await view.click('#dialog');
        else await Bun.sleep(30);
      }
      if (!reached) throw new Error('두 번째 남자 반응 줄 미도달');
      check.sequence = sequence;
    }
    checks.push({ i: row.i, file, face: row.male.face, ...check });
    await Bun.write(checkFile, JSON.stringify(checks, null, 2));
    console.log(`화면 ${row.i}: ${row.male.face}`);
  }
  console.log('ENGINE_CAPTURE_DONE');
} catch (error) {
  await Bun.write(new URL('./engine_capture_failure.json', import.meta.url), await view.evaluate(`JSON.stringify({
    phase:window.__wolheun.phase,body:document.body.innerText,slots:document.getElementById('slots').open,
    buttons:[...document.querySelectorAll('[data-slot]')].map(b=>({slot:b.dataset.slot,disabled:b.disabled,rects:b.getClientRects().length}))
  },null,2)`));
  await Bun.write(new URL('./engine_capture_failure.png', import.meta.url), await view.screenshot());
  throw error;
} finally {
  await view.close();
}
