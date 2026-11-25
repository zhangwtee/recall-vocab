// 验证词书切换 + 统计图表。node test-features.mjs
import {spawn} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9340;
let seq=0,ws;const pending=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),10000);pending.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-feat','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(x=>x.type==='page');if(p){u=p.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id)}};
  await cmd('Runtime.enable');await sleep(2000);
  await ev(`localStorage.removeItem('nixiang.memo.v1')`);await cmd('Page.reload');await sleep(2000);

  console.log('\n[1] 词书数据内置');
  let s=await ev(`({books:window.WORD_BOOKS.length,total:window.WORD_BOOKS.reduce((s,b)=>s+b.words.length,0),
    names:window.WORD_BOOKS.map(b=>b.name),
    label:document.getElementById('bookLabel').textContent})`);
  ck('内置 20+ 本词书',s.books>=20,s.books);
  ck('总词条 7 万+',s.total>70000,s.total);
  ck('包含主流词书',['四级大全','六级大全','考研大纲词汇','托福词汇','GRE词汇','专四专八词汇','中考词汇','高考词汇','小学词汇'].every(n=>s.names.includes(n)),s.names);
  ck('默认四级大全',s.label==='四级大全',s.label);

  console.log('\n[2] 词书切换');
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(150);
  await ev(`document.querySelector('[data-tab="words"]').click()`);await sleep(150);
  s=await ev(`({items:document.querySelectorAll('[data-book]').length,
    on:document.querySelector('[data-book].on')?.dataset.book})`);
  ck('大学分类 16 项',s.items===16,s.items);
  ck('当前选中四级大全',s.on==='cet4',s.on);
  await ev(`document.querySelector('[data-cat="留学"]').click()`);await sleep(150);
  await ev(`document.querySelector('[data-book="gre"]').click()`);await sleep(250);
  s=await ev(`({id:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.bookId,
    label:document.getElementById('bookLabel').textContent,
    word:document.querySelector('.word').textContent})`);
  ck('切换到 GRE',s.id==='gre',s.id);
  ck('顶栏显示 GRE 词汇',s.label==='GRE词汇',s.label);
  ck('新词来自 GRE',!!s.word,s.word);

  console.log('\n[3] 学几个词后统计面板');
  for(let i=0;i<3;i++){
    await ev(`document.querySelector('[data-action="quickRate"][data-g="3"]').click()`);await sleep(100);
    await ev(`document.querySelector('[data-action="confirm"]').click()`);await sleep(120);
  }
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(150);
  await ev(`document.querySelector('[data-tab="stats"]').click()`);await sleep(250);
  s=await ev(`({cards:[...document.querySelectorAll('.stat .n')].map(x=>x.textContent),
    svgCount:document.querySelectorAll('.chart-card svg').length,
    polyline:document.querySelectorAll('.chart-card polyline').length,
    rects:document.querySelectorAll('.chart-card rect').length,
    recent:document.querySelectorAll('.chart-card div').length})`);
  ck('四项统计数字',s.cards.length===4,s.cards);
  ck('学过词数=3',s.cards[0]==='3',s.cards);
  ck('图表 SVG 存在（遗忘曲线/柱状/词汇环）',s.svgCount>=2,s.svgCount);
  ck('遗忘曲线折线存在',s.polyline===1,s.polyline);
  ck('未来复习量柱子存在',s.rects>=14,s.rects);

  console.log('\n[4] 记忆强度分布');
  s=await ev(`(()=>{const bars=[...document.querySelectorAll('.chart-card')][1];
    return {hasBars:!!bars,text:bars?.textContent.includes('0.85')}})()`);
  ck('分布图存在',s.hasBars===true);
  ck('分档标签正确',s.text===true);

  console.log('\n────────────────────────');console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail)process.exitCode=1;
}catch(e){console.error('中断:',e.message);process.exitCode=1}finally{ws?.close();edge.kill()}
