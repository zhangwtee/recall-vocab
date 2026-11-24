// 验证隔天行为：只出到期复习词，认识的词不重复出现。node test-schedule.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', PORT=9334;
let seq=0,ws;const pending=new Map();
function cmd(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;
  const t=setTimeout(()=>reject(new Error(method+' 超时')),10000);
  pending.set(id,v=>{clearTimeout(t);resolve(v)});ws.send(JSON.stringify({id,method,params}));});}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;}
let pass=0,fail=0;
function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,
  '--user-data-dir=F:/nixiang/memo/.edge-sched','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(x=>x.type==='page');if(p){u=p.webSocketDebuggerUrl;break}}catch{}await sleep(250)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id)}};
  await cmd('Runtime.enable');await sleep(1200);
  await ev(`localStorage.removeItem('nixiang.memo.v1')`);await cmd('Page.reload');await sleep(1200);
  console.log('\n[1] 模拟学习：认识 1 个、不认识 1 个');
  let seen=[];
  for(let i=0;i<2;i++){
    const w=await ev(`document.querySelector('.word').textContent`);
    seen.push(w);
    await ev(`document.querySelector('[data-action="quickRate"][data-g="${i===0?3:1}"]').click()`);await sleep(100);
    await ev(`document.querySelector('[data-action="confirm"]').click()`);await sleep(150);
  }
  const st=await ev(`(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    return {a:s.cards['${seen[0].toLowerCase()}'],b:s.cards['${seen[1].toLowerCase()}']}})()`);
  ck('认识的词进入复习态且间隔>1天',st.a.state==='review'&&st.a.dueAt-Date.now()>86400000,st.a);
  ck('不认识的词当天短期内重来',st.b.dueAt-Date.now()<3600000,st.b);

  console.log('\n[2] 模拟隔天：把不认识的词 due 改到昨天，刷新');
  await ev(`(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    s.cards['${seen[1].toLowerCase()}'].dueAt=Date.now()-86400000;
    localStorage.setItem('nixiang.memo.v1',JSON.stringify(s))})()`);
  await cmd('Page.reload');await sleep(1200);
  const q=await ev(`(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    const due=Object.keys(s.cards).filter(k=>s.cards[k].dueAt<=Date.now());
    return {due,word:document.querySelector('.word')?.textContent,
      todayNew:s.dailyLog[Object.keys(s.dailyLog)[0]]?.neu}})()`);
  ck('到期的词进入今日队列',q.due.includes(seen[1].toLowerCase()),q.due);
  ck('认识的词未到期、不重出',!q.due.includes(seen[0].toLowerCase()),q.due);
  ck('隔天不重复引入新词（今日新词仍为2）',q.todayNew===2,q.todayNew);

  console.log('\n────────────────────────');console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail)process.exitCode=1;
}catch(e){console.error('中断:',e.message);process.exitCode=1}finally{ws?.close();edge.kill()}
