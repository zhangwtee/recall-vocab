// 远程词库加载器验收：本地源 / IndexedDB 缓存 / 离线可用 / 自定义源回退
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9341;
let seq=0,ws;const pending=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),15000);pending.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}

const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,'--user-data-dir=F:/nixiang/memo/.edge-loader',
  '--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(x=>x.type==='page');if(p){u=p.webSocketDebuggerUrl;break}}catch{}await sleep(250)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id)}};
  await cmd('Runtime.enable');await cmd('Page.enable');await sleep(1000);

  // 干净状态：清掉进度与词库缓存
  await ev(`localStorage.removeItem('nixiang.memo.v1')`);
  await ev(`new Promise(r=>{var q=indexedDB.deleteDatabase('nixiang.memo.assets.v1');q.onsuccess=q.onerror=q.onblocked=r})`);
  await cmd('Page.reload');
  await sleep(3500);

  console.log('\n[1] 首次加载：本地 data/ 源');
  let s=await ev(`({
    status: window.__memoDataStatus,
    books: (window.WORD_BOOKS||[]).length,
    pool: (window.WORD_POOL||[]).length,
    cats: (window.WORD_CATS||[]).length,
    examples: typeof getExamples==='function',
    bootHidden: document.getElementById('boot').classList.contains('hidden'),
    word: document.querySelector('.word')?.textContent
  })`);
  ck('加载状态 books=true',s.status.books,s.status);
  ck('词书 26 本',s.books===26,s.books);
  ck('词池 21819 词',s.pool===21819,s.pool);
  ck('分类 6 类',s.cats===6,s.cats);
  ck('例句接口就绪',s.examples,s.examples);
  ck('启动遮罩已隐藏',s.bootHidden,s.bootHidden);
  ck('已出词',!!s.word,s.word);

  console.log('\n[2] 缓存写入');
  let cached=await ev(`new Promise(r=>{
    var q=indexedDB.open('nixiang.memo.assets.v1',1);
    q.onsuccess=function(){var db=q.result;var t=db.transaction('kv','readonly').objectStore('kv');
      var a=t.get('books'),b=t.get('examples');
      a.onsuccess=function(){b.onsuccess=function(){r({books:!!a.result,examples:!!b.result,blen:(a.result||'').length,elen:(b.result||'').length})}};
      b.onerror=function(){r({books:!!a.result,examples:false})};
    };q.onerror=function(){r({books:false,examples:false})};
  })`);
  ck('books 已缓存',cached.books,cached);
  ck('examples 已缓存',cached.examples,cached);
  ck('缓存内容非空',cached.blen>1000000&&cached.elen>1000000,{blen:cached.blen,elen:cached.elen});

  console.log('\n[3] 断网刷新：从缓存离线启动');
  await cmd('Network.enable');
  await cmd('Network.setBlockedURLs',{urls:['*://*/*']});
  await cmd('Page.reload');
  await sleep(3000);
  let off=await ev(`({
    status: window.__memoDataStatus,
    books:(window.WORD_BOOKS||[]).length,
    pool:(window.WORD_POOL||[]).length,
    word:document.querySelector('.word')?.textContent,
    bootHidden:document.getElementById('boot').classList.contains('hidden')
  })`);
  ck('离线状态来自缓存',off.status.source==='本地缓存',off.status);
  ck('离线词书 26 本',off.books===26,off.books);
  ck('离线词池完整',off.pool===21819,off.pool);
  ck('离线可出词',!!off.word,off.word);
  ck('离线遮罩隐藏',off.bootHidden,off.bootHidden);
  await cmd('Network.setBlockedURLs',{urls:[]});

  console.log('\n[4] 自定义源失效时回退到官方源');
  await ev(`(function(){var s=JSON.parse(localStorage.getItem('nixiang.memo.v1')||'{}');
    s.settings=s.settings||{};s.settings.dataBase='https://invalid.example.invalid/nope';
    localStorage.setItem('nixiang.memo.v1',JSON.stringify(s));})()`);
  await cmd('Page.reload');
  await sleep(3500);
  let fb=await ev(`({status:window.__memoDataStatus,books:(window.WORD_BOOKS||[]).length})`);
  ck('坏源后仍加载到词书',fb.books===26,fb);

  console.log('\n────────────────────────');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  process.exitCode=fail?1:0;
}catch(err){ console.error('中断:',err); process.exitCode=1; }
finally{ try{ws&&ws.close()}catch{}; edge.kill(); }
