const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
const checks = [];
try {
  await view.navigate('http://127.0.0.1:18196/?fast=1&seed=1');
  await view.click('#btn-new');
  let intro = false;
  for (let i = 0; i < 400; i++) {
    const state = JSON.parse(await view.evaluate(`JSON.stringify({
      intro:!document.getElementById('intro-skip').hidden,
      gm:!document.getElementById('gm-box').hidden,
      phase:window.__wolheun.phase
    })`));
    if (state.intro && state.gm && !intro) {
      intro = true;
      checks.push({ mode: '시작 안내', foxVisible: true });
      await Bun.write(new URL('./engine_fox_intro.png', import.meta.url), await view.screenshot());
    }
    if (state.phase === 'free' && !state.intro) break;
    if (state.intro) await view.click('#gm-box');
    else if (state.phase === 'line') await view.click('#dialog');
    else await Bun.sleep(30);
  }
  const story = await view.evaluate(`document.getElementById('gm-mascot').getClientRects().length===0`);
  checks.push({ mode: '이야기 자유 입력', foxHidden: story });
  await view.click('#ask-gm');
  await view.evaluate(`document.getElementById('free-input').value='저장은 어떻게 해?'`);
  await view.click('#free-send');
  let question = false;
  for (let i = 0; i < 200; i++) {
    if (await view.evaluate(`!document.getElementById('gm-box').hidden
      &&document.getElementById('gm-text').textContent.trim().length>0
      &&document.getElementById('gm-text').textContent!=='GM이 장면을 쓰는 중'`)) {
      question = true;
      break;
    }
    await Bun.sleep(30);
  }
  checks.push({ mode: '질문 모드', foxVisible: question,
    text: await view.evaluate(`document.getElementById('gm-text').textContent`) });
  await Bun.write(new URL('./engine_fox_question.png', import.meta.url), await view.screenshot());
  await Bun.write(new URL('./engine_fox_modes.json', import.meta.url), JSON.stringify(checks, null, 2));
  if (!intro || !story || !question) throw new Error('여우 표시 모드 불일치');
  console.log('ENGINE_FOX_DONE');
} finally {
  await view.close();
}
