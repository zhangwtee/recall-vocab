// 验证英美音切换、字体大小、今日计数与真机判分反馈。node test-userfix.mjs
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9427;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),25000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const base={version:1,settings:{dailyNew:3,retention:0.9,accent:'en-US',autoSpeak:false,autoSpeakShow:false,hidePh:false,bookId:'cet4',customOn:true,dataBase:'',fontScale:1},
  cards:{},customPool:[],dailyLog:{},mistakes:[],createdAt:Date.now()};
async function reload(ms=2000){await cmd('Page.reload');await sleep(ms)}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--window-size=390,844','--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-userfix','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await sleep(1500);

  console.log('\n[1] 卡片上切换英美音');
  await ev(`localStorage.setItem('nixiang.memo.v1',${JSON.stringify(JSON.stringify(base))})`);
  await reload();
  let s=await ev(`({chip:document.querySelector('[data-action="toggleAccent"]')?.textContent,
    accent:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.accent})`);
  ck('主页有口音按钮并显示当前美音',s.chip==='美音'&&s.accent==='en-US',s);
  await ev(`document.querySelector('[data-action="toggleAccent"]').click()`);await sleep(180);
  s=await ev(`({chip:document.querySelector('[data-action="toggleAccent"]')?.textContent,
    accent:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.accent})`);
  ck('点击切到英音并写入设置',s.chip==='英音'&&s.accent==='en-GB',s);
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(160);
  s=await ev(`document.querySelector('[data-seg="accent"] button.on').dataset.val`);
  ck('设置里的口音同步',s==='en-GB',s);
  await reload();
  s=await ev(`document.querySelector('[data-action="toggleAccent"]').textContent`);
  ck('重开仍是英音',s==='英音',s);

  console.log('\n[2] 字体大小可调');
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(160);
  let before=await ev(`parseFloat(getComputedStyle(document.querySelector('.word')).fontSize)`);
  await ev(`document.querySelector('[data-seg="fontScale"] button[data-val="1.3"]').click()`);await sleep(180);
  s=await ev(`({fs:getComputedStyle(document.documentElement).getPropertyValue('--fs').trim(),
    word:parseFloat(getComputedStyle(document.querySelector('.word')).fontSize),
    saved:JSON.parse(localStorage.getItem('nixiang.memo.v1')).settings.fontScale})`);
  ck('切换到超大后 CSS 倍率变化',s.fs==='1.3',s.fs);
  ck('单词字号变大',s.word>before,{before:s.word,after:before});
  ck('字号设置已保存',s.saved===1.3,s.saved);
  await reload();
  s=await ev(`getComputedStyle(document.documentElement).getPropertyValue('--fs').trim()`);
  ck('重开后字号仍生效',s==='1.3',s);
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(160);
  await ev(`document.querySelector('[data-seg="fontScale"] button[data-val="1"]').click()`);await sleep(150);

  console.log('\n[3] 今日计数不缩水');
  await ev(`localStorage.setItem('nixiang.memo.v1',${JSON.stringify(JSON.stringify(base))})`);
  await reload();
  s=await ev(`(function(){var d=JSON.parse(localStorage.getItem('nixiang.memo.v1')).dailyLog;
    return {pill:document.getElementById('pill').textContent,intro:d[Object.keys(d)[0]].intro}})()`);
  ck('首次打开按计划显示 0 / 3',/今日 0 \/ 3/.test(s.pill)&&s.intro===3,s);
  s=await ev(`({title:document.getElementById('pill').title,
    d:JSON.parse(localStorage.getItem('nixiang.memo.v1')).dailyLog})`);
  s.plan=s.d[Object.keys(s.d)[0]].planNew;
  ck('进度条说明区分新词和复习',/新词 3 · 复习 0/.test(s.title)&&s.plan===3,s);
  await ev(`document.querySelector('[data-action="quickRate"][data-g="3"]').click();
    document.querySelector('[data-action="confirm"]').click()`);await sleep(220);
  s=await ev(`document.getElementById('pill').textContent`);
  ck('背完一个显示 1 / 3',/今日 1 \/ 3/.test(s),s);
  await reload();
  s=await ev(`(function(){var d=JSON.parse(localStorage.getItem('nixiang.memo.v1')).dailyLog;
    return {pill:document.getElementById('pill').textContent,plan:d[Object.keys(d)[0]].plan}})()`);
  ck('重开后分母仍是 3',/今日 1 \/ 3/.test(s.pill)&&s.plan===3,s);
  await ev(`document.getElementById('pill').click()`);await sleep(150);
  await ev(`(()=>{const i=document.getElementById('planInput');i.value='5';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(`document.querySelector('[data-action="savePlan"]').click()`);await sleep(250);
  s=await ev(`document.getElementById('pill').textContent`);
  ck('加量后分母变成 5',/今日 1 \/ 5/.test(s),s);

  console.log('\n[4] 真机反馈文案与词库字符');
  s=await ev(`window.WORD_POOL.filter(function(e){return /[\\uE000-\\uF8FF]/.test(e.m||'')}).length`);
  ck('词库不再含私有区乱码',s===0,s);
  s=await ev(`(function(){var e=window.WORD_POOL.find(function(x){return x.w==='lightning'});return e?e.m:''})()`);
  ck('lightning 释义干净',s==='n.闪电，闪电放电',s);
  // 把主词池里除目标词外的词都标记为已学且未到期，让今天只引入目标词
  async function onlyWord(w){
    await ev(`(()=>{var s=${JSON.stringify(base)};var now=Date.now();s.settings.fontScale=1;
      s.settings.customOn=false;s.settings.dailyNew=1;s.cards={};
      s.settings.bookId='lxy4';
      window.WORD_POOL.forEach(function(e){if(e.w==='${w}')return;
        s.cards[e.w]={w:e.w,m:e.m,state:'review',stability:10,difficulty:5,reps:3,
          lapses:0,lastReview:now,dueAt:now+10*86400000,enabled:true};});
      localStorage.setItem('nixiang.memo.v1',JSON.stringify(s))})()`);
    await reload();
  }
  await onlyWord('token');
  s=await ev(`document.querySelector('.word').textContent`);
  ck('只引入 token',s==='token',s);
  await ev(`(function(){var i=document.getElementById('typeInput');i.value='代币';
    i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action="submitInput"]').click()})()`);await sleep(180);
  s=await ev(`({v:document.querySelector('.verdict').textContent,
    cmp:document.querySelector('.compare').innerText})`);
  ck('代币判为对上',/对上了/.test(s.v),s);
  ck('答对时不显示最接近',!/最接近/.test(s.cmp),s.cmp);
  await onlyWord('crew');
  await ev(`(function(){var i=document.getElementById('typeInput');i.value='一群懂技术的人群';
    i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action="submitInput"]').click()})()`);await sleep(180);
  s=await ev(`document.querySelector('.compare').innerText`);
  ck('答错时写最接近而不是命中',/最接近/.test(s)&&!/命中/.test(s),s);

  console.log('\n────────────────────────');
  console.log('通过 '+pass+' / 失败 '+fail);
  if(fail) process.exitCode=1;
}finally{ws?.close();edge.kill()}
