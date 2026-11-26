// 验证例句标签位置、打卡日历点格子、遗忘曲线随真实数据变化。node test-ui.mjs
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9413;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),25000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--window-size=390,844','--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-uitest','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await sleep(1800);
  await ev(`localStorage.clear()`);await cmd('Page.reload');await sleep(2400);

  console.log('\n[1] 例句标签放进框里');
  await ev(`document.querySelector('[data-action="quickRate"][data-g="3"]').click()`);await sleep(200);
  let s=await ev(`(()=>{var t=document.querySelector('.ex-title'),row=document.querySelector('.ex-row'),
    box=document.querySelector('.examples');
    if(!t||!row) return null;
    var a=t.getBoundingClientRect(),b=row.getBoundingClientRect();
    return {inRow:row.contains(t),inBox:box.contains(t),directChild:t.parentElement===box,
      text:t.textContent,x:a.x-b.x,y:a.y-b.y,right:b.right-a.right,
      enInRow:!!row.querySelector('.ex-en span:last-of-type')}})()`);
  ck('标签在第一个例句框内',s&&s.inRow===true,s);
  ck('标签不再单独占一行',s&&s.directChild===false,s);
  ck('标签文字正确',s&&s.text==='例句',s&&s.text);
  ck('标签靠框的左上角',s&&s.x>=0&&s.x<20&&s.y>=0&&s.y<20,s);
  ck('英文与标签同一行',s&&s.y<20,s);
  await ev(`document.querySelector('[data-action="confirm"]').click()`);await sleep(250);

  console.log('\n[2] 日历点格子看日期');
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(180);
  await ev(`document.querySelector('.tab[data-tab="stats"]').click()`);await sleep(280);
  s=await ev(`(()=>{var c=document.querySelector('.hm-grid .hm-cell[data-date]');
    return {tag:c?.tagName,act:c?.dataset.action,date:c?.dataset.date,
      detail:document.getElementById('hmDetail')?.textContent}})()`);
  ck('格子是可点按钮',s.tag==='BUTTON'&&s.act==='heatCell',s);
  ck('格子带日期',/^\d{4}-\d{2}-\d{2}$/.test(s.date||''),s.date);
  ck('有日期详情区域',/点任意格子/.test(s.detail||''),s.detail);
  await ev(`document.querySelectorAll('.hm-grid .hm-cell[data-date]')[10].click()`);await sleep(150);
  s=await ev(`({detail:document.getElementById('hmDetail').textContent,
    sel:document.querySelectorAll('.hm-grid .hm-cell.sel').length})`);
  ck('点后显示日期与星期',/^\d{4}-\d{2}-\d{2}（周[日一二三四五六]）/.test(s.detail),s.detail);
  ck('点后只有一个选中格',s.sel===1,s);
  const first=s.detail;
  await ev(`document.querySelectorAll('.hm-grid .hm-cell[data-date]')[11].click()`);await sleep(150);
  s=await ev(`({detail:document.getElementById('hmDetail').textContent,
    sel:document.querySelectorAll('.hm-grid .hm-cell.sel').length})`);
  ck('换一格详情会变',s.detail!==first,{first,now:s.detail});
  ck('选中格不会累加',s.sel===1,s);

  console.log('\n[3] 遗忘曲线用真实数据');
  s=await ev(`({n:document.querySelectorAll('.chart-card circle[fill="#4ade80"]').length,
    sub:document.querySelectorAll('.chart-sub')[0].textContent})`);
  ck('评过分后出现绿色数据点',s.n>=1,s);
  ck('说明提到你的词',/绿点是你/.test(s.sub),s.sub);
  // 注入两个已知 elapsed/S，检查点的位置是否跟着数据走
  await ev(`(()=>{var st=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    var ks=Object.keys(st.cards).slice(0,2),now=Date.now();
    ks.forEach(function(k,i){st.cards[k].stability=1;
      st.cards[k].lastReview=now-(i===0?2:0.5)*86400000;
      st.cards[k].reps=2;});
    localStorage.setItem('nixiang.memo.v1',JSON.stringify(st))})()`);
  await cmd('Page.reload');await sleep(2300);
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(180);
  await ev(`document.querySelector('.tab[data-tab="stats"]').click()`);await sleep(300);
  s=await ev(`({xs:[...document.querySelectorAll('.chart-card circle[fill="#4ade80"]')].map(function(c){return +c.getAttribute('cx')}),
    sub:document.querySelectorAll('.chart-sub')[0].textContent})`);
  ck('两组不同记忆状态画出两个点',s.xs.length>=2,s.xs);
  ck('2×S 的点落在横轴 2/3 处',s.xs.some(x=>Math.abs(x-216.7)<12),s.xs);
  ck('0.5×S 的点落在横轴 1/6 处',s.xs.some(x=>Math.abs(x-79.7)<12),s.xs);
  console.log('\n────────────────────────');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail) process.exitCode=1;
}finally{ws?.close();edge.kill()}
