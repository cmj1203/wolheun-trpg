const asina = ['neutral', 'smile', 'surprised', 'wary', 'flustered', 'scared', 'indignant', 'smug', 'tired'];
const behidat = ['neutral', 'smile', 'surprised', 'wary', 'sneer', 'dumbfounded', 'menacing', 'intrigued'];
const all = [
  ...asina.map(face => ({ who: '아시나', face, file: `assets/ep01/gen/asina/asina_${face}.png` })),
  ...asina.map(face => ({ who: '아시나 후드', face, file: `assets/ep01/gen/hood/asina_hood_${face}.png` })),
  ...behidat.map(face => ({ who: '베히다트', face, file: `assets/sprites/pilot/behidat_${face}.png` })),
];
const added = all.filter(item => item.who === '베히다트'
  ? ['sneer', 'dumbfounded', 'menacing', 'intrigued'].includes(item.face)
  : ['flustered', 'scared', 'indignant', 'smug', 'tired'].includes(item.face));
const server = Bun.serve({
  hostname: '127.0.0.1', port: 18195,
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === '/') return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><title>표정 모음</title><body></body></html>', { headers: { 'content-type': 'text/html' } });
    const index = Number(path.slice(1));
    const item = all[index];
    return item && Number.isInteger(index) ? new Response(Bun.file(item.file)) : new Response('', { status: 404 });
  },
});
const view = new Bun.WebView({ width: 1440, height: 1000, headless: true });
try {
  for (const [name, items, columns, height, title] of [
    ['engine_faces_sheet', added, 5, 1000, '새 표정 14개 · 아시나 일반 5 · 후드 5 · 베히다트 4'],
    ['engine_faces_all', all, 9, 760, '연결된 표정 26개 · 아시나 일반 9 · 후드 9 · 베히다트 8'],
  ]) {
    await view.navigate(`http://127.0.0.1:${server.port}/`);
    await view.evaluate(`(async()=>{
      document.head.insertAdjacentHTML('beforeend', '<style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#202024;color:#f4efdf;font:16px system-ui}h1{margin:0 0 14px;font-size:23px}main{display:grid;grid-template-columns:repeat(${columns},1fr);gap:10px}figure{margin:0;background:#303039;text-align:center;padding:9px;border:1px solid #57545c}canvas{display:block;width:100%;height:${columns === 5 ? 245 : 168}px}figcaption{font-size:15px;line-height:1.5}small{color:#c6bec9}</style>');
      document.body.innerHTML='<h1>${title}</h1><main></main>';
      const items=${JSON.stringify(items.map(item => ({ ...item, index: all.indexOf(item) })))};
      for(const item of items){
        const img=new Image();img.src='/'+item.index;await img.decode();
        const source=document.createElement('canvas');source.width=img.width;source.height=img.height;
        const context=source.getContext('2d');context.drawImage(img,0,0);
        const pixels=context.getImageData(0,0,img.width,img.height).data;
        let left=img.width,right=0,top=img.height,bottom=0;
        for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){
          if(pixels[(y*img.width+x)*4+3]<128)continue;
          left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
        const width=Math.min(440,(right-left)*0.85),headHeight=(bottom-top)*0.28;
        const figure=document.createElement('figure'),canvas=document.createElement('canvas');
        canvas.width=360;canvas.height=300;
        canvas.getContext('2d').drawImage(img,(left+right-width)/2,Math.max(0,top-8),width,headHeight,0,0,360,300);
        const caption=document.createElement('figcaption');
        caption.textContent=item.who+' · '+item.face;
        figure.append(canvas,caption);document.querySelector('main').append(figure);
      }
      return document.querySelectorAll('canvas').length;
    })()`);
    await Bun.write(new URL(`./${name}.png`, import.meta.url), await view.screenshot());
    console.log(`${name}: ${items.length}개, CSS 1440×1000`);
  }
  console.log('ENGINE_SHEET_DONE');
} finally {
  await view.close();
  server.stop(true);
}
