// 验证来源显示、记忆率重排、自定义词库管理与统计词单。node test-fixes.mjs
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9415;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),25000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const base={version:1,settings:{dailyNew:20,retention:0.9,accent:'en-US',autoSpeak:false,autoSpeakShow:false,hidePh:false,bookId:'cet4',customOn:true,dataBase:''},cards:{},customPool:[],dailyLog:{},mistakes:[],createdAt:Date.now()};
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--window-size=390,844','--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-fixes','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await sleep(1800);

  console.log('\n[1] 目标记忆率改变后重排已学词');
  await ev(`(()=>{var s=${JSON.stringify(base)};var now=Date.now();
    s.cards.zztest={w:'zztest',m:'测试',state:'review',stability:10,difficulty:5,
      dueAt:now+10*86400000,lastReview:now-5*86400000,reps:3,lapses:0,enabled:true};
    localStorage.setItem('nixiang.memo.v1',JSON.stringify(s))})()`);
  await cmd('Page.reload');await sleep(2200);
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(160);
  await ev(`document.querySelector('[data-seg="retention"] button[data-val="0.95"]').click()`);await sleep(350);
  let s=await ev(`(()=>{var s=JSON.parse(localStorage.getItem('nixiang.memo.v1')),c=s.cards.zztest;
    return {r:s.settings.retention,due:c.dueAt,expect:c.lastReview+FSRS.intervalFromStability(10,0.95)*86400000,
      toast:document.getElementById('toast').textContent}})()`);
  ck('记忆率已保存',s.r===0.95,s.r);
  ck('已学词按新记忆率重排',s.due===s.expect,s);
  ck('提示重排数量',/重排 1 个已学词/.test(s.toast),s.toast);
  const due95=s.due;
  await ev(`document.querySelector('[data-seg="retention"] button[data-val="0.85"]').click()`);await sleep(350);
  s=await ev(`(()=>{var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    return {due:s.cards.zztest.dueAt,expect:s.cards.zztest.lastReview+FSRS.intervalFromStability(10,0.85)*86400000}})()`);
  ck('调低记忆率会推后到期',s.due===s.expect&&s.due>due95,s);

  console.log('\n[2] 自定义词库搜索与单条删除');
  await ev(`(()=>{var s=${JSON.stringify(base)};var now=Date.now();
    s.customPool=[{w:'applecustom',p:'',m:'苹果'},{w:'bananacustom',p:'',m:'香蕉'}];
    s.cards.learnedone={w:'learnedone',m:'学过',state:'review',stability:4,difficulty:5,
      dueAt:now+4*86400000,lastReview:now,reps:2,lapses:0,enabled:true};
    localStorage.setItem('nixiang.memo.v1',JSON.stringify(s))})()`);
  await cmd('Page.reload');await sleep(2200);
  await ev(`document.querySelector('[data-action="settings"]').click();document.querySelector('.tab[data-tab="words"]').click()`);await sleep(250);
  s=await ev(`({list:document.getElementById('wlist').innerText,
    learned:document.getElementById('learnedList').innerText})`);
  ck('自定义列表只显示自定义词',/applecustom/.test(s.list)&&/bananacustom/.test(s.list)&&!/learnedone/.test(s.list),s);
  ck('已学词另列展示',/learnedone/.test(s.learned),s.learned);
  await ev(`(()=>{var i=document.getElementById('wsearch');i.value='banana';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(160);
  s=await ev(`document.getElementById('wlist').innerText`);
  ck('搜索按自定义词过滤',/bananacustom/.test(s)&&!/applecustom/.test(s),s);
  await ev(`document.querySelector('#wlist [data-wo="delCustom"]').click()`);await sleep(350);
  s=await ev(`(()=>{var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    return {pool:s.customPool.map(function(w){return w.w}),list:document.getElementById('wlist').innerText}})()`);
  ck('单条删除生效',s.pool.length===1&&s.pool[0]==='applecustom',s.pool);
  ck('删除后列表跟着更新',/applecustom/.test(s.list)&&!/bananacustom/.test(s.list),s.list);

  console.log('\n[3] 统计图表点开词单');
  await ev(`(()=>{var s=${JSON.stringify(base)};var now=Date.now();
    ['curvea','curveb'].forEach(function(w,i){
      s.cards[w]={w:w,m:'词'+i,state:'review',stability:1,difficulty:5,
        dueAt:now+i*86400000,lastReview:now-(i?0.5:2)*86400000,reps:2,lapses:0,enabled:true};});
    s.dailyLog[new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0')]={neu:2,intro:2,rev:0,again:0,hard:0,good:2};
    localStorage.setItem('nixiang.memo.v1',JSON.stringify(s))})()`);
  await cmd('Page.reload');await sleep(2200);
  await ev(`document.querySelector('[data-action="settings"]').click();document.querySelector('.tab[data-tab="stats"]').click()`);await sleep(260);
  await ev(`document.querySelector('.stat[data-set="learned"]').click()`);await sleep(160);
  s=await ev(`({open:!document.getElementById('wordSetPanel').classList.contains('hidden'),
    title:document.getElementById('wsTitle').textContent,n:document.querySelectorAll('#wsList .witem').length})`);
  ck('统计数字可点开词单',s.open&&s.n===2,s);
  ck('标题带词数',/学过的词（2）/.test(s.title),s.title);
  await ev(`document.querySelector('[data-action="closeWordSet"]').click()`);await sleep(120);
  await ev(`document.querySelector('.bar-row[data-set="bucket"]').click()`);await sleep(160);
  s=await ev(`document.getElementById('wsTitle').textContent`);
  ck('记忆强度行可点开',/记忆强度/.test(s),s);
  await ev(`document.querySelector('[data-action="closeWordSet"]').click()`);await sleep(120);
  await ev(`document.querySelector('rect[data-set="future"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);await sleep(160);
  s=await ev(`document.getElementById('wsTitle').textContent`);
  ck('未来复习柱可点开',/待复习/.test(s),s);
  await ev(`document.querySelector('[data-action="closeWordSet"]').click()`);await sleep(120);
  await ev(`document.querySelector('circle[data-set="curve"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);await sleep(160);
  s=await ev(`document.getElementById('wsTitle').textContent`);
  ck('遗忘曲线点可点开',/遗忘曲线上的词/.test(s),s);
  await ev(`document.querySelector('[data-action="closeWordSet"]').click()`);await sleep(120);
  await ev(`(()=>{var cs=[...document.querySelectorAll('.hm-cell[data-date]')];
    var c=cs.find(function(x){return +x.dataset.n>0});if(c)c.click();return !!c})()`);await sleep(160);
  s=await ev(`({btn:!!document.querySelector('#hmDetail button[data-action="openWordSet"]'),
    detail:document.getElementById('hmDetail').textContent})`);
  ck('日历详情带查看词单按钮',s.btn,s);
  await ev(`document.querySelector('#hmDetail button[data-action="openWordSet"]').click()`);await sleep(160);
  s=await ev(`document.getElementById('wsTitle').textContent`);
  ck('日历词单带日期',/学习过/.test(s),s);

  console.log('\n[4] 单文件版来源显示');
  await cmd('Page.navigate',{url:'file:///F:/nixiang/memo/memo.html'});await sleep(2800);
  await ev(`document.querySelector('[data-action="settings"]').click();document.querySelector('.tab[data-tab="data"]').click()`);await sleep(200);
  s=await ev(`({standalone:window.__memoStandalone===true,
    text:document.getElementById('sheetBody').innerText,
    input:!!document.getElementById('dataBaseInput'),
    save:!!document.querySelector('[data-action="saveDataBase"]'),
    source:window.__memoDataStatus&&window.__memoDataStatus.source})`);
  ck('标记为单文件版',s.standalone,s);
  ck('来源显示内置（本文件）',/内置（本文件）/.test(s.text),s.text);
  ck('隐藏自定义词库 URL',s.input===false&&s.save===false,s);
  ck('保留内置来源标记',s.source==='内置',s.source);
  console.log('\n────────────────────────');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail) process.exitCode=1;
}finally{ws?.close();edge.kill()}
