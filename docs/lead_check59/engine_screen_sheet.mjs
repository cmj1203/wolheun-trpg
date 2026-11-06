const rows = await Bun.file(new URL('./engine_model.json', import.meta.url)).json();
const server = Bun.serve({
  hostname: '127.0.0.1', port: 18195,
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === '/data') return Response.json(rows.map(row => ({
      i: row.i, text: row.text, face: row.male.face,
    })));
    if (path === '/') return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8">
      <style>*{box-sizing:border-box}body{margin:0;padding:14px;background:#202024;color:#f4efdf;font:15px system-ui}h1{font-size:22px;margin:0 0 12px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}figure{margin:0;background:#303039;padding:6px}img{width:100%;display:block}figcaption{padding:5px 0;line-height:1.4;min-height:45px}</style>
      <h1>실제 26B 반응 화면 12개 · PC 1440</h1><main></main><script>
      (async()=>{const rows=await fetch('/data').then(r=>r.json());for(const row of rows){
        const figure=document.createElement('figure'),img=new Image(),caption=document.createElement('figcaption');
        img.src='/'+row.i;await img.decode();caption.textContent=row.i+'. '+row.face+' · '+row.text;
        figure.append(img,caption);document.querySelector('main').append(figure);
      }await document.fonts.ready;document.body.dataset.ready='1';})();</script></html>`, { headers: { 'content-type': 'text/html' } });
    const index = Number(path.slice(1));
    return rows.some(row => row.i === index)
      ? new Response(Bun.file(new URL(`./engine_input_${String(index).padStart(2, '0')}.png`, import.meta.url)))
      : new Response('', { status: 404 });
  },
});
const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
try {
  await view.navigate(`http://127.0.0.1:${server.port}/`);
  await view.evaluate(`new Promise(resolve=>{
    if(document.body.dataset.ready==='1'){resolve(true);return;}
    const observer=new MutationObserver(()=>{if(document.body.dataset.ready==='1'){observer.disconnect();resolve(true);}});
    observer.observe(document.body,{attributes:true});
  })`);
  await Bun.write(new URL('./engine_screens_sheet.png', import.meta.url), await view.screenshot());
  console.log('ENGINE_SCREENS_SHEET_DONE');
} finally {
  await view.close();
  server.stop(true);
}
