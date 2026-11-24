// 验证分类词书选择器。node test-books.mjs
import {spawn} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9343;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),15000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--user-data-dir=F:/nixiang/memo/.edge-books','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');await sleep(1800);
  await ev(`localStorage.removeItem('nixiang.memo.v1')`);await cmd('Page.reload');await sleep(1800);

  console.log('\n[1] 词书数据：分类 + 词条池');
  let s=await ev(`({pool:window.WORD_POOL.length,books:window.WORD_BOOKS.length,
    cats:window.WORD_CATS.map(c=>c.name),
    total:window.WORD_BOOKS.reduce((s,b)=>s+b.words.length,0)})`);
  ck('词条池 2 万+',s.pool>20000,s.pool);
  ck('词书 20+ 本',s.books>=20,s.books);
  ck('6 大分类',JSON.stringify(s.cats)===JSON.stringify(['大学','留学','高中','初中','小学','综合']),s.cats);
  ck('词条总量 7 万+',s.total>70000,s.total);

  console.log('\n[2] 打开词库面板：分类标签 + 分组');
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(150);
  await ev(`document.querySelector('[data-tab="words"]').click()`);await sleep(200);
  s=await ev(`({tabs:[...document.querySelectorAll('#sheetBody [data-cat]')].map(x=>x.textContent),
    on:document.querySelector('#sheetBody [data-cat].on')?.textContent,
    groups:[...document.querySelectorAll('#sheetBody .book-group-t')].map(x=>x.textContent),
    items:document.querySelectorAll('#sheetBody [data-book]').length,
    hasSearch:!!document.querySelector('#sheetBody [data-role="bookSearch"]')})`);
  ck('分类标签 6 个',s.tabs.length===6,s.tabs);
  ck('默认大学分类',s.on==='大学',s.on);
  ck('大学下有 5 个分组',s.groups.length===5,s.groups);
  ck('显示词书卡片',s.items>=10,s.items);
  ck('有搜索框',s.hasSearch===true);

  console.log('\n[3] 分类切换');
  await ev(`document.querySelector('#sheetBody [data-cat="综合"]').click()`);await sleep(150);
  s=await ev(`({on:document.querySelector('#sheetBody [data-cat].on')?.textContent,
    names:[...document.querySelectorAll('#sheetBody .book-item .bn')].map(x=>x.textContent)})`);
  ck('切到综合分类',s.on==='综合',s.on);
  ck('显示 COCA 词书',s.names.some(n=>n.includes('COCA')),s.names);
  ck('综合分类只有 4 本',s.names.length===4,s.names);

  console.log('\n[4] 词书搜索');
  await ev(`(()=>{const i=document.querySelector('#sheetBody [data-role="bookSearch"]');i.focus();i.value='高频';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(200);
  s=await ev(`({names:[...document.querySelectorAll('#sheetBody .book-item .bn')].map(x=>x.textContent),
    focus:document.activeElement?.dataset?.role})`);
  ck('搜出高频相关词书',s.names.length>=2&&s.names.every(n=>n.includes('高频')),s.names);
  ck('搜索后保持焦点',s.focus==='bookSearch',s.focus);

  console.log('\n[5] 切换词书并学习');
  await ev(`document.querySelector('#sheetBody [data-cat="大学"]').click()`);await sleep(150);
  await ev(`document.querySelector('#sheetBody [data-book="cet4high"]').click()`);await sleep(250);
  s=await ev(`({id:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.bookId,
    label:document.getElementById('bookLabel').textContent,
    word:document.querySelector('.word').textContent,
    cat:document.querySelector('#sheetBody [data-cat].on')?.textContent})`);
  ck('切到四级高频700',s.id==='cet4high',s.id);
  ck('顶栏显示书名',s.label==='四级高频700词',s.label);
  ck('自动跳回大学分类',s.cat==='大学',s.cat);
  ck('出词正常',!!s.word,s.word);

  console.log('\n[6] 新词书词库结构正确');
  s=await ev(`(()=>{const b=window.WORD_BOOKS.find(x=>x.id==='cet4high');
    return {len:b.words.length,first:b.words[0].w,hasMeaning:!!b.words[0].m,
      allIdx:b.idx.every(i=>Number.isInteger(i)&&i>=0&&i<window.WORD_POOL.length)}})()`);
  ck('高频700 词数正确',s.len===700,s.len);
  ck('词条有释义',s.hasMeaning===true);
  ck('索引全部有效',s.allIdx===true);

  console.log('\n────────────────────────');console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail)process.exitCode=1;
}catch(e){console.error('中断:',e.message);process.exitCode=1}finally{ws?.close();edge.kill()}
