// 验证统一界面：写中文→判分；不写→选档位。node test-unified.mjs
import {spawn} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9338;
let seq=0,ws;const pending=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),10000);pending.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--user-data-dir=F:/nixiang/memo/.edge-uni','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(x=>x.type==='page');if(p){u=p.webSocketDebuggerUrl;break}}catch{}await sleep(250)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id)}};
  await cmd('Runtime.enable');await sleep(1200);
  await ev(`localStorage.removeItem('nixiang.memo.v1')`);await cmd('Page.reload');await sleep(1200);

  console.log('\n[1] 同一张卡：输入框 + 三档按钮并存');
  let s=await ev(`({hasInput:!!document.getElementById('typeInput'),
    quickRates:document.querySelectorAll('[data-action="quickRate"]').length,
    hasReveal:!!document.querySelector('[data-action="reveal"]'),
    hasModeSeg:!!document.querySelector('[data-seg="mode"]')})`);
  ck('有输入框',s.hasInput===true);
  ck('有三档按钮',s.quickRates===3,s.quickRates);
  ck('无独立揭晓按钮',s.hasReveal===false);
  ck('设置里无模式切换',s.hasModeSeg===false);

  console.log('\n[2] 输入内容后：切换成「提交判分」，三档按钮消失');
  // 用当前词释义的开头作为输入，保证判对
  const front=await ev(`(()=>{const w=document.querySelector('.word').textContent;
    const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    const m=s.cards[w.toLowerCase()].m;const g=(m.match(/[一-龥]{2,}/)||[''])[0].slice(0,3);return g})()`);
  await ev(`(()=>{const i=document.getElementById('typeInput');i.value=${JSON.stringify(front)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(120);
  s=await ev(`({hasSubmit:!!document.querySelector('[data-action="submitInput"]'),
    quickRates:document.querySelectorAll('[data-action="quickRate"]').length})`);
  ck('出现提交判分按钮',s.hasSubmit===true);
  ck('三档按钮隐藏',s.quickRates===0,s.quickRates);

  console.log('\n[3] 提交 → 自动判分 → 反馈');
  const before=await ev(`document.querySelector('.word').textContent`);
  await ev(`document.querySelector('[data-action="submitInput"]').click()`);await sleep(200);
  s=await ev(`({verdict:document.querySelector('.verdict')?.textContent,
    good:(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));return s.dailyLog[Object.keys(s.dailyLog)[0]].good})()})`);
  ck('显示判定',s.verdict==='✓ 对上了',s.verdict);
  await ev(`document.querySelector('[data-action="confirm"]').click()`);await sleep(200);
  s=await ev(`({word:document.querySelector('.word').textContent})`);
  ck('进入下一词',s.word!==before);

  console.log('\n[4] 不写字直接选档位 → 按所选评分');
  const w2=await ev(`document.querySelector('.word').textContent`);
  await ev(`document.querySelector('[data-action="quickRate"][data-g="2"]').click()`);await sleep(200);
  s=await ev(`({verdict:document.querySelector('.verdict')?.textContent,
    hasForceGood:!!document.querySelector('[data-action="forceGood"]'),
    hasCompare:!!document.querySelector('.compare')})`);
  ck('反馈显示「已记：模糊」',s.verdict==='已记：模糊',s.verdict);
  ck('自评后无「算认识」纠错口',s.hasForceGood===false);
  ck('仍显示标准释义对比',s.hasCompare===true);
  // 确认前检查尚未记账
  const hardBefore=await ev(`(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));return s.dailyLog[Object.keys(s.dailyLog)[0]].hard})()`);
  await ev(`document.querySelector('[data-action="confirm"]').click()`);await sleep(200);
  const hardAfter=await ev(`(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));return s.dailyLog[Object.keys(s.dailyLog)[0]].hard})()`);
  ck('确认后才记入 hard',hardAfter===hardBefore+1,{hardBefore,hardAfter});

  console.log('\n[5] 清空输入后：三档按钮恢复');
  await ev(`(()=>{const i=document.getElementById('typeInput');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(120);
  s=await ev(`({quickRates:document.querySelectorAll('[data-action="quickRate"]').length,hasSubmit:!!document.querySelector('[data-action="submitInput"]')})`);
  ck('三档按钮恢复',s.quickRates===3,s.quickRates);
  ck('提交按钮消失',s.hasSubmit===false);

  console.log('\n[6] 键盘：数字键选档 / 回车提交');
  await ev(`document.body.focus()`);
  await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'3',code:'Digit3',text:'3',windowsVirtualKeyCode:51});
  await sleep(200);
  s=await ev(`({verdict:document.querySelector('.verdict')?.textContent})`);
  ck('数字键 3 选中「认识」',s.verdict==='已记：认识',s.verdict);
  await ev(`document.querySelector('[data-action="confirm"]').click()`);await sleep(200);
  await ev(`(()=>{const i=document.getElementById('typeInput');i.value='放弃';i.dispatchEvent(new Event('input',{bubbles:true}));i.focus()})()`);await sleep(100);
  await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await sleep(200);
  s=await ev(`({verdict:document.querySelector('.verdict')?.textContent})`);
  ck('回车提交输入',!!s.verdict&&s.verdict!=='已记：认识',s.verdict);

  console.log('\n────────────────────────');console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail)process.exitCode=1;
}catch(e){console.error('中断:',e.message);process.exitCode=1}finally{ws?.close();edge.kill()}
