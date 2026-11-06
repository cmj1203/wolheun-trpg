const view = new Bun.WebView({ width: 1440, height: 1040, headless: true });
try {
  const panels = [];
  for (const id of ['01-cry', '02-silence', '03-plead', '04-beauty']) {
    const bytes = await Bun.file(new URL(`./${id}-b06.png`, import.meta.url)).arrayBuffer();
    panels.push(`<figure style="margin:0"><figcaption>${id}</figcaption><img style="width:720px;height:500px;object-fit:contain" src="data:image/png;base64,${Buffer.from(bytes).toString('base64')}"></figure>`);
  }
  await view.navigate('about:blank');
  const html = `<body style="margin:0;background:#222;color:white;display:grid;grid-template-columns:720px 720px">${panels.join('')}</body>`;
  await view.evaluate(`(() => { document.documentElement.innerHTML = ${JSON.stringify(html)}; return true; })()`);
  await Bun.sleep(300);
  await Bun.write(new URL('./contact-sheet.png', import.meta.url), await view.screenshot());
} finally {
  view.close();
}
