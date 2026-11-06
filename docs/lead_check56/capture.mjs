// 1440 PC 화면에서 실제 진행 버튼을 눌러 b02~b07 발화를 보존한다.
const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
const captured = new Set();
const wanted = new Map([
  ['저건…', 'b02-people'],
  ['그저 길을 물어봤을 뿐이었다.', 'b03-question'],
  ['억울해…', 'b04-aloud'],
  ['예쁘고 아름다운 걸 지키는 건 당연한 일이니까…', 'b05-beauty'],
  ['웃기는 여자군.', 'b06-man'],
  ['남는 것은 살아남는 자와 죽는 자.', 'b07-rule'],
]);
try {
  await view.navigate('http://127.0.0.1:18194/?fast=1&seed=1');
  await view.click('#btn-new');
  for (let turn = 0; turn < 800; turn++) {
    const s = JSON.parse(await view.evaluate(`JSON.stringify({
      phase:window.__wolheun.phase, prompt:window.__wolheun.prompt,
      text:document.getElementById('text').textContent,
      intro:!document.getElementById('intro-skip').hidden,
      gm:!document.getElementById('gm-box').hidden,
      beat:document.getElementById('beat-title').textContent
    })`));
    const name = wanted.get(s.text);
    if (name && !captured.has(name)) {
      await Bun.sleep(1000);
      await Bun.write(new URL(`./${name}.png`, import.meta.url), await view.screenshot());
      captured.add(name);
    }
    if (s.beat === '반칙' && !captured.has('b07-rule')) {
      await Bun.sleep(1000);
      await Bun.write(new URL('./b07-rule.png', import.meta.url), await view.screenshot());
      captured.add('b07-rule');
    }
    if (s.phase === 'free' && s.prompt?.beat === 'b08_gaze') break;
    if (s.intro) await view.click('#intro-skip');
    else if (s.phase === 'free') {
      const label = s.prompt?.beat === 'b02_people' ? '달려가서 길을 묻는다'
        : s.prompt?.beat === 'b05_why' ? '미모' : '피한다';
      const clicked = await view.evaluate(`(() => {
        const buttons=[...document.querySelectorAll('#approaches button')];
        const b=buttons.find(b=>b.textContent.includes(${JSON.stringify(label)})) ?? buttons[0];
        if(b){b.click();return true;}return false;
      })()`);
      if (!clicked) throw new Error(`입력 단추 없음: ${JSON.stringify(s)}`);
    } else if (s.phase === 'choices') await view.click('#choices button[data-id="luck-skip"]');
    else if (s.phase === 'line') await view.click(s.gm ? '#gm-box' : '#dialog');
    else if (s.phase === 'dice') await view.click('#dice');
    else await Bun.sleep(60);
  }
  await Bun.write(new URL('./backlog.json', import.meta.url), await view.evaluate('JSON.stringify(window.__wolheun.backlog,null,2)'));
  console.log(JSON.stringify({ captured: [...captured] }));
  if (captured.size !== 6) throw new Error('필수 장면 캡처 부족');
} finally {
  await view.close();
}
