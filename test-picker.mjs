// 验证首页快捷选书面板。node test-picker.mjs
import {spawn} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9345;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),15000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-picker','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');await sleep(1800);
  await ev(`localStorage.removeItem('nixiang.memo.v1')`);await cmd('Page.reload');await sleep(1800);

  console.log('\n[1] 首页顶栏书名可点');
  let s=await ev(`({hasTrigger:!!document.querySelector('[data-action="openBookPicker"]'),
    label:document.getElementById('bookLabel').textContent,
    pickerHidden:document.getElementById('bookPicker').classList.contains('hidden')})`);
  ck('顶栏有选书按钮',s.hasTrigger===true);
  ck('显示当前词书名',s.label==='四级大全',s.label);
  ck('面板初始隐藏',s.pickerHidden===true);

  console.log('\n[2] 点书名弹出选书面板');
  await ev(`document.querySelector('[data-action="openBookPicker"]').click()`);await sleep(200);
  s=await ev(`({hidden:document.getElementById('bookPicker').classList.contains('hidden'),
    cur:document.getElementById('bpCurrent').textContent,
    cat:document.querySelector('#bookPicker [data-cat].on')?.textContent,
    books:document.querySelectorAll('#bookPicker [data-book]').length,
    hasSearch:!!document.querySelector('#bookPicker [data-role="bookSearch"]')})`);
  ck('面板弹出',s.hidden===false);
  ck('显示当前词书',s.cur.includes('四级大全'),s.cur);
  ck('定位到大学分类',s.cat==='大学',s.cat);
  ck('列出词书',s.books===13,s.books);
  ck('有搜索框',s.hasSearch===true);

  console.log('\n[3] 面板内搜索（焦点保持）');
  await ev(`(()=>{const i=document.querySelector('#bookPicker [data-role="bookSearch"]');i.focus();i.value='六级';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(150);
  s=await ev(`({names:[...document.querySelectorAll('#bookPicker .bn')].map(x=>x.textContent),
    focus:document.activeElement?.dataset?.role,
    val:document.querySelector('#bookPicker [data-role="bookSearch"]').value})`);
  ck('搜出六级词书',s.names.length===4&&s.names.every(n=>n.includes('六级')),s.names);
  ck('搜索焦点保持',s.focus==='bookSearch',s.focus);
  ck('搜索词保留',s.val==='六级',s.val);

  console.log('\n[4] 分类切换');
  await ev(`document.querySelector('#bookPicker [data-cat="综合"]').click()`);await sleep(150);
  s=await ev(`({cat:document.querySelector('#bookPicker [data-cat].on')?.textContent,
    val:document.querySelector('#bookPicker [data-role="bookSearch"]').value,
    books:document.querySelectorAll('#bookPicker [data-book]').length})`);
  ck('切到综合分类',s.cat==='综合',s.cat);
  ck('清空搜索词',s.val==='',s.val);
  ck('综合有 4 本',s.books===4,s.books);

  console.log('\n[5] 选词书 → 自动关闭 → 顶栏更新 → 出词');
  await ev(`document.querySelector('#bookPicker [data-book="coca1000"]').click()`);await sleep(250);
  s=await ev(`({hidden:document.getElementById('bookPicker').classList.contains('hidden'),
    id:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.bookId,
    label:document.getElementById('bookLabel').textContent,
    word:document.querySelector('.word').textContent})`);
  ck('选完自动关闭',s.hidden===true);
  ck('词书已切换',s.id==='coca1000',s.id);
  ck('顶栏同步更新',s.label==='COCA 高频1000',s.label);
  ck('正常出词',!!s.word,s.word);

  console.log('\n[6] 遮罩点击 + Esc 关闭');
  await ev(`document.querySelector('[data-action="openBookPicker"]').click()`);await sleep(150);
  await ev(`document.getElementById('bookPicker').click()`);await sleep(120);
  ck('点遮罩关闭',await ev(`document.getElementById('bookPicker').classList.contains('hidden')`)===true);
  await ev(`document.querySelector('[data-action="openBookPicker"]').click()`);await sleep(150);
  await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(150);
  ck('Esc 关闭',await ev(`document.getElementById('bookPicker').classList.contains('hidden')`)===true);

  console.log('\n[7] 设置面板词库仍共用同一网格');
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(150);
  await ev(`document.querySelector('[data-tab="words"]').click()`);await sleep(150);
  s=await ev(`({hosts:document.querySelectorAll('[data-role="bookGridHost"]').length,
    searches:document.querySelectorAll('[data-role="bookSearch"]').length,
    books:document.querySelectorAll('#sheetBody [data-book]').length})`);
  ck('设置面板网格正常',s.books>0,s.books);
  ck('两处搜索框同步存在',s.searches===2,s.searches);

  console.log('\n────────────────────────');console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail)process.exitCode=1;
}catch(e){console.error('中断:',e.message);process.exitCode=1}finally{ws?.close();edge.kill()}
