const out = new URL('./', import.meta.url);
for (const path of ['run', 'watch', 'avoid']) {
  const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
  try {
    await view.navigate('http://127.0.0.1:18194/?fast=1&seed=1');
    await view.click('#btn-new');
    let selected = false;
    let question = false;
    let blade = false;
    for (let turn = 0; turn < 1000; turn++) {
      const state = JSON.parse(await view.evaluate(`JSON.stringify({
        phase: window.__wolheun?.phase,
        text: document.getElementById("text").textContent,
        intro: !document.getElementById("intro-skip").hidden,
        gm: !document.getElementById("gm-box").hidden
      })`));
      if (state.text === '혹시 크라차까지 가는 길을 아시나요?' && !question) {
        await Bun.sleep(1000);
        await Bun.write(new URL(`${path}-question.png`, out), await view.screenshot());
        question = true;
      }
      if (question && state.text === '마지막으로 할 말은 있나?') {
        await Bun.sleep(1000);
        await Bun.write(new URL(`${path}-blade.png`, out), await view.screenshot());
        await Bun.write(new URL(`${path}-lines.json`, out), await view.evaluate('JSON.stringify(window.__wolheun.backlog, null, 2)'));
        blade = true;
        break;
      }
      if (state.intro) await view.click('#intro-skip');
      else if (state.phase === 'free' && !selected) {
        const labels = { run: '달려가서 길을 묻는다', watch: '모래 언덕 뒤에서 먼저 살핀다', avoid: '몰래 돌아서 피해 간다' };
        if (path === 'run') {
          await view.evaluate(`document.querySelectorAll("#approaches button").forEach(b => { if (b.textContent.includes(${JSON.stringify(labels[path])})) b.click(); })`);
        } else {
          await view.evaluate(`(() => { document.getElementById("free-input").value = ${JSON.stringify(labels[path])}; document.getElementById("say").requestSubmit(); })()`);
        }
        selected = true;
      } else if (state.phase === 'choices') await view.click('#choices button[data-id="luck-skip"]');
      else if (state.phase === 'line') await view.click(state.gm ? '#gm-box' : '#dialog');
      else if (state.phase === 'dice') await view.click('#dice');
      else {
        await Bun.sleep(100);
      }
    }
    if (!question || !blade) {
      console.log(await view.evaluate('JSON.stringify({phase: window.__wolheun.phase, prompt: window.__wolheun.prompt, backlog: window.__wolheun.backlog})'));
      throw new Error(`${path}: 질문/칼 캡처 누락`);
    }
    console.log(`${path}: 질문·칼 화면 저장`);
  } finally {
    view.close();
  }
}
