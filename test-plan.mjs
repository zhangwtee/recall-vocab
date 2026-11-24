// 验证每日新词自由设置。node test-plan.mjs
import {spawn} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9347;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),15000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--user-data-dir=F:/nixiang/memo/.edge-plan','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');await sleep(1800);
  await ev(`localStorage.removeItem('nixiang.memo.v1')`);await cmd('Page.reload');await sleep(1800);

  console.log('\n[1] 顶栏今日进度可点');
  let s=await ev(`({trigger:!!document.querySelector('#pill[data-action="openPlan"]'),
    hidden:document.getElementById('planPanel').classList.contains('hidden'),
    val:document.getElementById('planInput')?.value})`);
  ck('进度条是按钮',s.trigger===true);
  ck('面板初始隐藏',s.hidden===true);
  await ev(`document.getElementById('pill').click()`);await sleep(180);
  s=await ev(`({hidden:document.getElementById('planPanel').classList.contains('hidden'),
    val:document.getElementById('planInput').value,
    stats:[...document.querySelectorAll('.plan-stat .n')].map(x=>x.textContent)})`);
  ck('点击弹出计划面板',s.hidden===false);
  ck('显示当前新词数',s.val==='20',s.val);
  ck('三项统计齐全',s.stats.length===3,s.stats);

  console.log('\n[2] 快捷档 + 自由输入');
  await ev(`document.querySelector('[data-plan="50"]').click()`);await sleep(100);
  ck('快捷档设 50',await ev(`document.getElementById('planInput').value`)==='50');
  await ev(`(()=>{const i=document.getElementById('planInput');i.value='37';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(100);
  s=await ev(`({val:document.getElementById('planInput').value,
    anyOn:!!document.querySelector('[data-plan].on')})`);
  ck('自由输入 37',s.val==='37',s.val);
  ck('非快捷值时无高亮',s.anyOn===false,s.anyOn);

  console.log('\n[3] 非法值拦截');
  await ev(`(()=>{const i=document.getElementById('planInput');i.value='0';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(`document.querySelector('[data-action="savePlan"]').click()`);await sleep(150);
  s=await ev(`({hidden:document.getElementById('planPanel').classList.contains('hidden'),
    daily:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.dailyNew})`);
  ck('0 被拦截、面板不关',s.hidden===false);
  ck('设置未改变',s.daily===20,s.daily);

  console.log('\n[4] 保存 37 → 今日立即引入 37 个新词');
  await ev(`(()=>{const i=document.getElementById('planInput');i.value='37';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(`document.querySelector('[data-action="savePlan"]').click()`);await sleep(300);
  s=await ev(`({hidden:document.getElementById('planPanel').classList.contains('hidden'),
    daily:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.dailyNew,
    intro:(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));return s.dailyLog[Object.keys(s.dailyLog)[0]].intro})(),
    cards:Object.keys(JSON.parse(localStorage.getItem('nixiang.memo.v1')).cards).length})`);
  ck('保存后面板关闭',s.hidden===true);
  ck('设置存为 37',s.daily===37,s.daily);
  ck('今日引入 37 个',s.intro===37,s.intro);
  ck('卡片数 37',s.cards===37,s.cards);

  console.log('\n[5] 改大到 60 → 立即补 23 个');
  await ev(`document.getElementById('pill').click()`);await sleep(150);
  await ev(`(()=>{const i=document.getElementById('planInput');i.value='60';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(`document.querySelector('[data-action="savePlan"]').click()`);await sleep(300);
  s=await ev(`({intro:(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));return s.dailyLog[Object.keys(s.dailyLog)[0]].intro})(),
    cards:Object.keys(JSON.parse(localStorage.getItem('nixiang.memo.v1')).cards).length})`);
  ck('今日引入涨到 60',s.intro===60,s.intro);
  ck('卡片数 60',s.cards===60,s.cards);

  console.log('\n[6] 改小到 15 → 今天不撤回（仍 60），明天按 15');
  await ev(`document.getElementById('pill').click()`);await sleep(150);
  await ev(`(()=>{const i=document.getElementById('planInput');i.value='15';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(`document.querySelector('[data-action="savePlan"]').click()`);await sleep(300);
  s=await ev(`({daily:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.dailyNew,
    intro:(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));return s.dailyLog[Object.keys(s.dailyLog)[0]].intro})(),
    cards:Object.keys(JSON.parse(localStorage.getItem('nixiang.memo.v1')).cards).length})`);
  ck('设置存为 15',s.daily===15,s.daily);
  ck('今日不撤回仍 60',s.intro===60,s.intro);
  ck('卡片数不变 60',s.cards===60,s.cards);

  console.log('\n[7] 刷新后设置保留');
  await cmd('Page.reload');await sleep(1800);
  s=await ev(`({daily:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.dailyNew,
    pill:document.getElementById('pill').textContent})`);
  ck('刷新后仍为 15',s.daily===15,s.daily);
  ck('顶栏显示今日队列 60（改小不撤回）',s.pill.includes('60'),s.pill);

  console.log('\n[8] 设置面板也可改');
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(150);
  s=await ev(`({hasInput:!!document.getElementById('setDailyNew'),val:document.getElementById('setDailyNew')?.value})`);
  ck('常规页有数字输入',s.hasInput===true);
  ck('显示当前值 15',s.val==='15',s.val);
  await ev(`(()=>{const i=document.getElementById('setDailyNew');i.value='25';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(`document.querySelector('[data-action="saveDailyNew"]').click()`);await sleep(250);
  ck('设置面板保存生效',await ev(`JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.dailyNew`)===25);

  console.log('\n[9] 遮罩 + Esc 关闭');
  await ev(`document.querySelector('[data-action="closePanel"]').click()`);await sleep(100);
  await ev(`document.getElementById('pill').click()`);await sleep(150);
  await ev(`document.getElementById('planPanel').click()`);await sleep(100);
  ck('点遮罩关闭',await ev(`document.getElementById('planPanel').classList.contains('hidden')`)===true);
  await ev(`document.getElementById('pill').click()`);await sleep(150);
  await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(150);
  ck('Esc 关闭',await ev(`document.getElementById('planPanel').classList.contains('hidden')`)===true);

  console.log('\n────────────────────────');console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail)process.exitCode=1;
}catch(e){console.error('中断:',e.message);process.exitCode=1}finally{ws?.close();edge.kill()}
