// 验证单词记忆档案。node test-wordinfo.mjs
import {spawn} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9342;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m)),10000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--user-data-dir=F:/nixiang/memo/.edge-wi','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{let u;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
await cmd('Runtime.enable');await sleep(2000);await ev(`localStorage.removeItem('nixiang.memo.v1')`);await cmd('Page.reload');await sleep(2000);
console.log('\n[1] 点单词打开记忆档案');
await ev(`document.querySelector('[data-action="wordInfo"]').click()`);await sleep(150);
let s=await ev(`({open:!document.getElementById('wordPanel').classList.contains('hidden'),
  cells:document.querySelectorAll('.wc-cell').length,
  text:document.getElementById('wordCard').textContent})`);
ck('档案面板打开',s.open===true);
ck('显示 6 项记忆指标',s.cells===6,s.cells);
ck('含稳定性/难度/复习次数',['记忆稳定性','难度','复习次数','遗忘次数','当前状态','此刻记得'].every(k=>s.text.includes(k)));
console.log('\n[2] 关闭档案');
await ev(`document.querySelector('[data-action="closeWordInfo"]').click()`);await sleep(100);
s=await ev(`({open:!document.getElementById('wordPanel').classList.contains('hidden')})`);
ck('关闭成功',s.open===false);
console.log('\n────────────────────────');console.log(`通过 ${pass} / 失败 ${fail}`);
if(fail)process.exitCode=1;
}catch(e){console.error('中断:',e.message);process.exitCode=1}finally{ws?.close();edge.kill()}
