// 58·58b·56차 드라이버를 바탕으로 실제 UI만 진행한다.
const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
const out = new URL('./', import.meta.url);
const states = [];
const photos = [];
const taken = new Set();
const previousFile = Bun.file(new URL('screen_checks.json', out));
const previous = await previousFile.exists() ? (await previousFile.json()).photos : [];
const previousNames = new Map(previous.map(p => [p.key, p.name]));
const actions = [];
const targets = new Set([
  '꿈에도 몰랐다. 거대한 태양 아래,', '고국이 아닌 낯선 땅에서',
  '죽음을 맞이하게 될 줄은―', '하아…', '저건…',
  '정말이지 난', '혹시 크라차까지 가는 길을 아시나요?',
  '그저 길을 물어봤을 뿐이었다.', '그리고 현재.', '억울해…',
  '왜냐하면 저는…', '대륙에서 하나뿐인,', '미소녀니까요.',
  '예쁘고 아름다운 걸 지키는 건 당연한 일이니까…',
  '하.', '웃기는 여자군.', '그게…', '마지막으로 남길 말인가?',
  '남는 것은 살아남는 자와 죽는 자.',
]);
let number = previous.length;
let usedInput = false;
async function shot(key, state) {
  if (taken.has(key)) return;
  taken.add(key);
  await Bun.sleep(1000);
  const name = previousNames.get(key) || `${String(++number).padStart(3, '0')}_${key}.png`;
  await Bun.write(new URL(name, out), await view.screenshot());
  photos.push({ name, key, turn: states.length - 1, text: state?.text, beat: state?.beat });
}
try {
  await view.navigate('http://127.0.0.1:18191/?fast=1&seed=1');
  await Bun.sleep(900);
  await view.evaluate(`(() => {
    window.__bundleErrors=[];
    window.addEventListener('error',e=>window.__bundleErrors.push({kind:'error',message:e.message||e.target?.src||'resource'}),true);
    window.addEventListener('unhandledrejection',e=>window.__bundleErrors.push({kind:'rejection',message:String(e.reason)}));
    const old=console.error;
    console.error=(...args)=>{window.__bundleErrors.push({kind:'console',message:args.map(String).join(' ')});old(...args);};
  })()`);
  await shot('title');
  states.push({turn:-1,phase:'title',visible:await view.evaluate('document.body.innerText')});
  await view.click('#btn-new');
  for (let turn = 0; turn < 1000; turn++) {
    await Bun.sleep(90);
    const s = JSON.parse(await view.evaluate(`JSON.stringify({
      phase:window.__wolheun.phase,prompt:window.__wolheun.prompt,
      text:document.getElementById('text').textContent,
      intro:!document.getElementById('intro-skip').hidden,
      gm:!document.getElementById('gm-box').hidden,
      gmText:document.getElementById('gm-text').textContent,
      beat:document.getElementById('beat-title').textContent,
      changes:document.getElementById('changes').innerText,
      visible:document.body.innerText,
      by:window.__wolheun.backlog.at(-1)?.by,
      badge:!document.getElementById('gm-badge').hidden,
      faces:window.__wolheun.faces,
      images:[...document.images].filter(i=>i.getClientRects().length&&getComputedStyle(i).visibility!=='hidden'&&getComputedStyle(i).opacity!=='0'&&i.getAttribute('src')).map(i=>({id:i.id,src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0})),
      background:[...document.querySelectorAll('[style*="background"]')].map(e=>({id:e.id,bg:e.style.backgroundImage})),
      deltas:[...document.querySelectorAll('.delta')].filter(d=>d.getClientRects().length).map(d=>{
        const a=d.getBoundingClientRect(),h=document.querySelector('.hud').getBoundingClientRect();
        const range=document.createRange();range.selectNodeContents(d.parentElement.firstChild);
        const n=range.getBoundingClientRect();
        return {text:d.textContent,inside:a.left>=h.left&&a.right<=h.right,overlap:a.left<n.right&&a.right>n.left&&a.top<n.bottom&&a.bottom>n.top};
      }),
      approaches:[...document.querySelectorAll('#approaches button')].map(b=>({id:b.dataset.id,text:b.innerText})),
      choices:[...document.querySelectorAll('#choices button')].map(b=>({id:b.dataset.id,text:b.innerText})),
      errors:window.__bundleErrors
    })`));
    states.push({ turn, ...s });
    if (s.intro) await shot(`intro_${taken.has('intro_1') ? [...taken].filter(k=>k.startsWith('intro_')).length+1 : 1}`, s);
    if (!s.intro && s.text) {
      if (targets.has(s.text)) await shot(`line_${[...targets].indexOf(s.text)+1}`, s);
      if (s.phase === 'line') await shot(`beat_${s.beat.replace(/[^가-힣a-zA-Z0-9]/g,'')}`, s);
      const cg = s.background.find(b=>b.bg.includes('cg_'));
      if (cg) await shot(`cg_${cg.bg.match(/cg_[a-z_]+/)?.[0]}`, s);
    }
    if (!s.intro && !s.text) {
      const cg = s.background.find(b=>b.bg.includes('cg_'));
      if (cg) await shot(`cg_empty_${cg.bg.match(/cg_[a-z_]+/)?.[0]}`, s);
    }
    if (s.changes) await shot(`change_${s.text==='그리고 현재.'?'cause':s.text==='억울해…'?'after':s.beat.replace(/[^가-힣a-zA-Z0-9]/g,'')}`, s);
    if (s.deltas.length) await shot('delta', s);
    if (s.phase === 'free') {
      await shot(`free_${s.prompt.beat}`, s);
      if (s.prompt.beat === 'b05_why' && !taken.has('notes')) {
        await view.click('#btn-notes');
        await shot('notes', s);
        states.push({turn, overlay:'notes',visible:await view.evaluate('document.body.innerText')});
        await view.click('#notes-close');
      }
    }
    if (s.phase === 'dice') await shot(`dice_${s.prompt?.beat||s.beat.replace(/[^가-힣a-zA-Z0-9]/g,'')}`, s);
    if (s.phase === 'ending' || s.phase === 'result') {
      await shot('ending', s);
      break;
    }
    if (s.intro) await view.click('#gm-box');
    else if (s.phase === 'line') await view.click(s.gm ? '#gm-box' : '#dialog');
    else if (s.phase === 'dice') await view.click('#dice');
    else if (s.phase === 'choices') {
      const id = s.choices.some(c=>c.id==='luck-skip')?'luck-skip':s.choices[0]?.id;
      if (!id) throw new Error(`선택지 없음 ${s.beat}`);
      await view.click(`#choices button[data-id="${id}"]`);
    } else if (s.phase === 'free') {
      if (s.prompt.beat === 'b08_gaze' && !usedInput) {
        usedInput = true;
        actions.push({turn,kind:'input',beat:s.prompt.beat,text:'가만히 있는다'});
        await view.evaluate(`document.getElementById('free-input').value='가만히 있는다'`);
        await view.click('#free-send');
      } else {
        const preferred = s.prompt.beat==='b02_people'?'run':s.prompt.beat==='b05_why'?'beauty':s.prompt.beat==='b06_swing'?'dodge':null;
        const id=s.approaches.find(a=>a.id===preferred)?.id||s.approaches[0]?.id;
        if(!id) throw new Error(`접근법 없음 ${s.prompt.beat}`);
        actions.push({turn,kind:'approach',beat:s.prompt.beat,id});
        await view.click(`#approaches button[data-id="${id}"]`);
      }
    }
  }
  await Bun.write(new URL('backlog.json',out),await view.evaluate('JSON.stringify(window.__wolheun.backlog,null,2)'));
  await Bun.write(new URL('screen_checks.json',out),JSON.stringify({states,photos,actions},null,2));
  const last=states.at(-1);
  console.log(JSON.stringify({phase:last.phase,beat:last.beat,photos:photos.length,turns:states.length,usedInput}));
  if(!['ending','result'].includes(last.phase)) throw new Error('결말 미도달');
} finally {
  await view.close();
}
