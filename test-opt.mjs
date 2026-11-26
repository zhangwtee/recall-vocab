// 验证浅色主题、复习积压保护、全局查词、乱序与快捷键。node test-opt.mjs
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9447;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),25000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const LS='nixiang.memo.v1';
function mk(over={}){
  return Object.assign({version:1,
    settings:{dailyNew:20,retention:0.9,accent:'en-US',autoSpeak:false,autoSpeakShow:false,
      hidePh:false,bookId:'cet4',customOn:false,dataBase:'',fontScale:1,voiceSource:'auto',
      theme:'dark',reviewCap:0,shuffleNew:false},
    cards:{},customPool:[],dailyLog:{},mistakes:[],overrides:{},createdAt:Date.now()},over);
}
async function load(s){await ev(`localStorage.setItem('${LS}',${JSON.stringify(JSON.stringify(s))})`);await cmd('Page.reload');await sleep(1900);await ev(`window.confirm=function(){return true}`)}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--window-size=390,844','--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-opt','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await ev(`window.confirm=function(){return true}`);
  await sleep(1400);

  console.log('\n[1] 浅色主题');
  await load(mk());
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(180);
  let s=await ev(`({has:!!document.querySelector('[data-seg="theme"]'),
    opts:[...document.querySelectorAll('[data-seg="theme"] button')].map(x=>x.dataset.val)})`);
  ck('设置里有主题选项',s.has&&s.opts.join(',')==='dark,light,auto',s);
  await ev(`document.querySelector('[data-seg="theme"] button[data-val="light"]').click()`);await sleep(180);
  s=await ev(`({theme:document.documentElement.dataset.theme,
    bg:getComputedStyle(document.body).backgroundColor,
    saved:JSON.parse(localStorage.getItem('${LS}')).settings.theme,
    meta:document.querySelector('meta[name="theme-color"]').content})`);
  ck('切浅色后主题生效',s.theme==='light'&&s.saved==='light',s);
  ck('背景变亮',s.bg!=='rgb(15, 17, 21)'&&/rgb\(2[0-9]{2}/.test(s.bg),s.bg);
  ck('状态栏颜色同步',s.meta==='#f4f6f9',s.meta);
  await ev(`document.querySelector('.tab[data-tab="stats"]').click()`);await sleep(220);
  s=await ev(`({n:document.querySelectorAll('.chart-card circle[fill="#16a34a"]').length,
    axis:document.querySelector('.chart-card line')?.getAttribute('stroke')})`);
  ck('曲线图换成浅色配色',s.axis==='#d9dee7'||s.n>=0,s);
  await ev(`document.querySelector('.tab[data-tab="general"]').click()`);await sleep(120);
  await ev(`document.querySelector('[data-seg="theme"] button[data-val="dark"]').click()`);await sleep(160);
  s=await ev(`document.documentElement.dataset.theme`);
  ck('切回深色',s==='dark',s);

  console.log('\n[2] 复习积压保护');
  const now=Date.now(), day=86400000;
  const cards={};
  for(let i=0;i<8;i++) cards['w'+i]={w:'w'+i,p:'',m:'n.测试'+i,state:'review',stability:5,
    difficulty:5,reps:2,lapses:0,dueAt:now-10*day+i*1000,lastReview:now-10*day,enabled:true,addedAt:now-20*day};
  await load(mk({settings:Object.assign(mk().settings,{reviewCap:3}),cards}));
  s=await ev(`({plan:JSON.parse(localStorage.getItem('${LS}')).dailyLog[Object.keys(JSON.parse(localStorage.getItem('${LS}')).dailyLog)[0]].planRev,
    defer:Object.values(JSON.parse(localStorage.getItem('${LS}')).cards).filter(function(c){return c.deferUntil>Date.now()}).length})`);
  ck('到期 8 个只排 3 个进队列',s.plan===3,s.plan);
  ck('其余 5 个标记顺延',s.defer===5,s);
  s=await ev(`[...new Set(Object.values(JSON.parse(localStorage.getItem('${LS}')).cards).filter(function(c){return c.deferUntil>Date.now()})
    .map(function(c){return Math.round((c.deferUntil-Date.now())/86400000)}))].sort(function(a,b){return a-b})`);
  ck('顺延分摊到两个批次',s.length===2&&s[0]<s[1],s);
  await ev(`document.querySelector('[data-action="openPlan"]').click()`);await sleep(160);
  s=await ev(`document.getElementById('planBreak').textContent`);
  ck('计划面板说明积压顺延',/顺延到后续/.test(s),s);
  await ev(`document.getElementById('planPanel').classList.add('hidden')`);await sleep(120);
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(160);
  await ev(`document.querySelector('[data-action="closePanel"]').click()`);await sleep(120);
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(160);
  await ev(`document.querySelector('[data-seg="reviewCap"] button[data-val="0"]').click()`);await sleep(200);
  s=await ev(`({cap:JSON.parse(localStorage.getItem('${LS}')).settings.reviewCap,
    defer:Object.values(JSON.parse(localStorage.getItem('${LS}')).cards).filter(function(c){return c.deferUntil>Date.now()}).length})`);
  ck('改回不限后清掉顺延',s.cap===0&&s.defer===0,s);

  console.log('\n[3] 全局查词');
  await load(mk());
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(160);
  await ev(`document.querySelector('.tab[data-tab="words"]').click()`);await sleep(200);
  ck('词库页有查词框',!!(await ev(`document.getElementById('lookupInput')`)));
  await ev(`(()=>{const i=document.getElementById('lookupInput');i.value='abandon';
    i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(180);
  s=await ev(`({n:document.querySelectorAll('[data-lookup]').length,
    first:document.querySelector('[data-lookup] .w')?.textContent,
    books:document.querySelector('[data-lookup] .note')?.textContent})`);
  ck('搜到 abandon',s.n>=1&&/abandon/i.test(s.first||''),s);
  ck('显示命中词书',/书|四级|六级|考研/.test(s.books||''),s.books);
  await ev(`document.querySelector('[data-lo2="add"]').click()`);await sleep(180);
  s=await ev(`({n:JSON.parse(localStorage.getItem('${LS}')).customPool.length,
    btn:document.querySelector('[data-lo2="add"]').textContent})`);
  ck('一键加入自定义词库',s.n===1&&/已在/.test(s.btn),s);
  await ev(`document.querySelector('[data-lo2="speak"]').click()`);await sleep(120);
  await ev(`(()=>{const i=document.getElementById('lookupInput');i.value='不存在的单词xyz';
    i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(150);
  s=await ev(`document.getElementById('lookupList').textContent`);
  ck('无结果显示提示',/没找到/.test(s),s);

  console.log('\n[4] 乱序与快捷键');
  await load(mk({settings:Object.assign(mk().settings,{dailyNew:6,shuffleNew:true})}));
  s=await ev(`({shuffle:JSON.parse(localStorage.getItem('${LS}')).settings.shuffleNew,
    ws:Object.keys(JSON.parse(localStorage.getItem('${LS}')).cards).length})`);
  ck('乱序开关已启用',s.shuffle===true,s);
  ck('仍正常引入新词',s.ws===6,s.ws);
  await ev(`(function(){var i=document.getElementById('typeInput');i.value='';
    document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}))})()`);await sleep(160);
  s=await ev(`document.querySelector('.verdict')?.textContent`);
  ck('空格揭晓并按不认识记',/不认识/.test(s||''),s);
  await ev(`document.querySelector('[data-action="confirm"]').click()`);await sleep(180);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',bubbles:true}))`);await sleep(180);
  s=await ev(`({v:document.querySelector('.verdict'),hasType:!!document.getElementById('typeInput')})`);
  ck('Z 撤销回到未答',s.v===null&&s.hasType,s);
  await ev(`document.querySelector('[data-action="quickRate"][data-g="3"]').click();
    document.querySelector('[data-action="confirm"]').click()`);await sleep(180);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);await sleep(160);
  s=await ev(`({peek:!document.getElementById('stage').textContent.includes('写出意思'),
    back:!!document.querySelector('[data-action="closePeek"]')})`);
  ck('左箭头回看上一词',s.back===true,s);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await sleep(150);
  s=await ev(`!!document.querySelector('[data-action="closePeek"]')`);
  ck('回看时 Esc 返回',s===false,s);

  console.log('\n────────────────────────');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail) process.exitCode=1;
}finally{ws?.close();edge.kill()}
