const cases = [
  ['01-cry', '눈물을 뚝뚝 흘리며 고개를 숙인다', false],
  ['02-silence', '입술만 깨물고 아무 말도 안 한다', false],
  ['03-plead', '전 그냥 지나가던 여행자예요, 제발요', true],
  ['04-beauty', '대륙에서 하나뿐인 미소녀니까요', true],
];
for (const [id, input, spoken] of cases) {
  const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
  try {
    await view.navigate('http://127.0.0.1:18194/?fast=1&seed=1');
    await view.click('#btn-new');
    let selected = false;
    let screenshot = false;
    let reaction = false;
    let done = false;
    for (let turn = 0; turn < 1600; turn++) {
      const state = JSON.parse(await view.evaluate(`JSON.stringify({
        phase: window.__wolheun.phase, prompt: window.__wolheun.prompt,
        text: document.getElementById("text").textContent,
        beat: document.getElementById("beat-title").textContent,
        intro: !document.getElementById("intro-skip").hidden,
        gm: !document.getElementById("gm-box").hidden,
        modelLine: !document.getElementById("gm-badge").hidden
      })`));
      if (selected && !spoken && !reaction && state.modelLine && state.phase === 'line') {
        await Bun.sleep(1000);
        await Bun.write(new URL(`./${id}-reaction.png`, import.meta.url), await view.screenshot());
        reaction = true;
      }
      if (!screenshot && state.beat === '마지막으로 남길 말인가' && state.text.replace(/^\(|\)$/g, '') === (spoken ? '하.' : '미친―! 피해야 돼!!')) {
        await Bun.sleep(1000);
        await Bun.write(new URL(`./${id}-b06.png`, import.meta.url), await view.screenshot());
        screenshot = true;
      }
      if (screenshot && state.phase === 'free' && state.prompt?.beat === 'b06_swing') {
        await Bun.write(new URL(`./${id}-lines.json`, import.meta.url), await view.evaluate('JSON.stringify(window.__wolheun.backlog, null, 2)'));
        done = true;
        break;
      }
      if (state.intro) await view.click('#intro-skip');
      else if (state.phase === 'free' && state.prompt?.beat === 'b02_people') {
        await view.evaluate('document.querySelectorAll("#approaches button").forEach(b => { if (b.textContent.includes("달려가서 길을 묻는다")) b.click(); })');
      } else if (state.phase === 'free' && state.prompt?.beat === 'b05_why' && !selected) {
        await view.evaluate(`(() => { document.getElementById("free-input").value = ${JSON.stringify(input)}; document.getElementById("say").requestSubmit(); })()`);
        selected = true;
      } else if (state.phase === 'choices') await view.click('#choices button[data-id="luck-skip"]');
      else if (state.phase === 'line') await view.click(state.gm ? '#gm-box' : '#dialog');
      else if (state.phase === 'dice') await view.click('#dice');
      else await Bun.sleep(100);
    }
    if (!done) {
      console.log(await view.evaluate('JSON.stringify({phase: window.__wolheun.phase, prompt: window.__wolheun.prompt, backlog: window.__wolheun.backlog})'));
      throw new Error(`${id}: b06 화면·줄 기록 누락`);
    }
    console.log(`${id}: b06 화면·전체 첫 줄 저장`);
  } finally {
    view.close();
  }
}
