// 验证词条修正、备份码、慢速朗读与音源、错词重练。node test-next.mjs
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9431;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),25000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const LS='nixiang.memo.v1';
function todayKeyJS(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function mk(over={}){
  return Object.assign({version:1,
    settings:{dailyNew:1,retention:0.9,accent:'en-US',autoSpeak:false,autoSpeakShow:false,
      hidePh:false,bookId:'cet4',customOn:true,dataBase:'',fontScale:1,voiceSource:'auto'},
    cards:{},customPool:[],dailyLog:{},mistakes:[],overrides:{},createdAt:Date.now()},over);
}
async function load(s){
  await ev(`localStorage.setItem('${LS}',${JSON.stringify(JSON.stringify(s))})`);
  await cmd('Page.reload');await sleep(1900);
  await ev(`window.confirm=function(){return true}`);
}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--window-size=390,844','--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-next','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await ev(`window.confirm=function(){return true}`);
  await sleep(1400);

  console.log('\n[1] 词条自助修正');
  const w1={w:'zetaalpha',p:'',m:'n.错误的原释义',alt:[]};
  const st1=mk({customPool:[w1],cards:{zetaalpha:{w:'zetaalpha',p:'',m:'n.错误的原释义',alt:null,
    state:'new',stability:0,difficulty:0,reps:0,lapses:0,dueAt:Date.now()-1000,
    lastReview:0,enabled:true,addedAt:Date.now(),note:''}}});
  await load(st1);
  await ev(`document.querySelector('[data-action="quickRate"][data-g="2"]').click()`);await sleep(160);
  await ev(`document.querySelector('[data-action="wordInfo"]').click()`);await sleep(160);
  let s=await ev(`({mean:document.getElementById('meanInput').value,
    hasAlt:!!document.getElementById('altInput')})`);
  ck('档案里有释义修正框',s.mean==='n.错误的原释义'&&s.hasAlt,s);
  await ev(`document.getElementById('meanInput').value='n.真正的意思';
    document.getElementById('altInput').value='另一个意思；第三个意思';
    document.querySelector('[data-action="saveMeaning"]').click()`);await sleep(180);
  s=await ev(`(function(){var d=JSON.parse(localStorage.getItem('${LS}'));
    return {o:d.overrides.zetaalpha,m:d.cards.zetaalpha.m,alt:d.cards.zetaalpha.alt,
      shown:document.querySelector('.wc-mean').textContent}})()`);
  ck('修正写入覆盖记录与卡片',s.o&&s.o.m==='n.真正的意思'&&s.m==='n.真正的意思',s);
  ck('补充义项按分号拆开',s.alt.length===2&&s.alt[1]==='第三个意思',s.alt);
  ck('档案立即显示修正后的释义',s.shown==='n.真正的意思',s.shown);
  await ev(`document.querySelector('[data-action="closeWordInfo"]').click()`);
  // 确认后撤销，让同一个词回到未作答状态，卡片上的修正仍保留
  await ev(`document.querySelector('[data-action="confirm"]').click()`);await sleep(150);
  await ev(`document.querySelector('[data-action="undoRating"]').click()`);await sleep(150);
  await ev(`(function(){var i=document.getElementById('typeInput');i.value='真正的意思';
    i.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('[data-action="submitInput"]').click()})()`);await sleep(180);
  s=await ev(`document.querySelector('.verdict').textContent`);
  ck('判分按修正后的释义',/对上了/.test(s),s);
  await ev(`document.querySelector('[data-action="wordInfo"]').click()`);await sleep(140);
  await ev(`document.querySelector('[data-action="resetMeaning"]').click()`);await sleep(160);
  s=await ev(`(function(){var d=JSON.parse(localStorage.getItem('${LS}'));
    return {o:d.overrides.zetaalpha,m:d.cards.zetaalpha.m}})()`);
  ck('恢复原释义清除覆盖',!s.o&&s.m==='n.错误的原释义',s);

  console.log('\n[2] 文本备份码');
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(160);
  await ev(`document.querySelector('.tab[data-tab="data"]').click()`);await sleep(160);
  await ev(`document.querySelector('[data-action="makeBackupCode"]').click()`);await sleep(140);
  s=await ev(`document.getElementById('backupCode').value.slice(0,9)`);
  ck('生成带版本头的备份码',s==='NIXIANG1.',s);
  s=await ev(`(function(){var v=document.getElementById('backupCode').value;
    var bin=atob(v.slice(9)),b=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(b)).cards.zetaalpha.m})()`);
  ck('备份码含中文且可解码',s==='n.错误的原释义',s);
  console.log('   ... 清空内存中的卡片');
  await ev(`(function(){var s=JSON.parse(localStorage.getItem('${LS}'));s.cards={};
    localStorage.setItem('${LS}',JSON.stringify(s));return 1})()`);
  console.log('   ... 粘贴并恢复');
  await ev(`document.getElementById('restoreCode').value=document.getElementById('backupCode').value;
    document.querySelector('[data-action="restoreBackupCode"]').click();1`);await sleep(220);
  console.log('   ... 检查恢复结果');
  s=await ev(`Object.prototype.hasOwnProperty.call(JSON.parse(localStorage.getItem('${LS}')).cards,'zetaalpha')`);
  ck('粘贴备份码恢复卡片',s===true,s);
  await ev(`document.getElementById('restoreCode').value='not-a-code';
    document.querySelector('[data-action="restoreBackupCode"]').click()`);await sleep(120);
  s=await ev(`document.getElementById('toast').textContent`);
  ck('非法备份码给出提示',/不是有效的备份码/.test(s),s);

  console.log('\n[3] 慢速朗读与音源');
  await ev(`document.querySelector('.tab[data-tab="general"]').click()`);await sleep(140);
  s=await ev(`!!document.querySelector('[data-seg="voiceSource"]')`);
  ck('设置里有发音音源选项',s,s);
  await ev(`document.querySelector('[data-seg="voiceSource"] button[data-val="online"]').click()`);await sleep(140);
  s=await ev(`JSON.parse(localStorage.getItem('${LS}')).settings.voiceSource`);
  ck('音源切换已保存',s==='online',s);
  await ev(`document.querySelector('[data-action="closePanel"]').click()`);await sleep(140);
  await ev(`window.__toasts=[];window.__toastObs=new MutationObserver(function(ms){
      ms.forEach(function(m){
        if(m.type==='characterData') window.__toasts.push(m.target.nodeValue||'');
        for(var i=0;i<m.addedNodes.length;i++)
          window.__toasts.push(m.addedNodes[i].nodeValue||m.addedNodes[i].textContent||'');
      })
    });window.__toastObs.observe(document.getElementById('toast'),
      {childList:true,subtree:true,characterData:true});
    document.querySelector('.speak').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
  await sleep(560);
  s=await ev(`window.__toasts`);
  ck('长按触发慢速朗读',s.some(function(x){return /慢速朗读/.test(x)}),s);
  await ev(`document.querySelector('.speak').dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
    document.getElementById('toast').textContent='';
    document.querySelector('.speak').click()`);await sleep(120);
  s=await ev(`document.getElementById('toast').textContent`);
  ck('长按后不再重复朗读',!/慢速朗读/.test(s),s);
  await ev(`document.querySelector('.speak').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    document.querySelector('.speak').dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
    document.getElementById('toast').textContent='';
    document.querySelector('.speak').click()`);await sleep(150);
  s=await ev(`document.getElementById('toast').textContent`);
  ck('短按不进入慢速模式',!/慢速朗读/.test(s),s);

  console.log('\n[4] 错词重练');
  const st4=mk({customPool:[],settings:Object.assign(mk().settings,{customOn:false,dailyNew:1}),
    cards:{zetaalpha:{w:'zetaalpha',p:'',m:'n.真正的意思',alt:null,state:'new',stability:0,
      difficulty:0,reps:0,lapses:0,dueAt:Date.now()+86400000,lastReview:0,enabled:true,
      addedAt:Date.now(),note:''}},
    mistakes:[{w:'zetaalpha',input:'写错了',m:'n.真正的意思',alt:null,v:'wrong',t:Date.now()}]});
  await load(st4);
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(140);
  await ev(`document.querySelector('.tab[data-tab="stats"]').click()`);await sleep(140);
  await ev(`document.querySelector('[data-action="openConfusion"]').click()`);await sleep(140);
  s=await ev(`document.querySelector('[data-action="startMistakeDrill"]').textContent`);
  ck('错义分析提供重练入口',/再练一遍/.test(s),s);
  await ev(`document.querySelector('[data-action="startMistakeDrill"]').click()`);await sleep(220);
  s=await ev(`({w:document.querySelector('.word')?.textContent,
    n:JSON.parse(localStorage.getItem('${LS}')).mistakes.length,
    panel:document.getElementById('panel').className})`);
  ck('重练从错词开始',s.w==='zetaalpha'&&s.n===1,s);
  ck('进入重练时收起面板',/hidden/.test(s.panel),s.panel);
  await ev(`document.querySelector('[data-action="quickRate"][data-g="3"]').click();
    document.querySelector('[data-action="confirm"]').click()`);await sleep(180);
  s=await ev(`({w:document.querySelector('.word')?.textContent,
    n:JSON.parse(localStorage.getItem('${LS}')).mistakes.length})`);
  ck('第一次答对还留在清单',s.w==='zetaalpha'&&s.n===1,s);
  await ev(`document.querySelector('[data-action="quickRate"][data-g="3"]').click();
    document.querySelector('[data-action="confirm"]').click()`);await sleep(180);
  s=await ev(`JSON.parse(localStorage.getItem('${LS}')).mistakes.length`);
  ck('连续答对两次移出错义清单',s===0,s);

  console.log('\n[5] 新词进度不混入复习');
  const k5=todayKeyJS();
  const st5=mk({customPool:[],
    settings:Object.assign(mk().settings,{customOn:false,dailyNew:3}),
    cards:{reviewword:{w:'reviewword',p:'',m:'n.复习词',alt:null,state:'review',
      stability:5,difficulty:5,reps:2,lapses:0,dueAt:Date.now()-2000,
      lastReview:Date.now()-86400000,enabled:true,addedAt:Date.now()-86400000,note:''}},
    dailyLog:{[k5]:{neu:3,intro:3,rev:0,again:0,hard:0,good:3,plan:4,planNew:3,planRev:1}}});
  await load(st5);
  s=await ev(`({pill:document.getElementById('pill').textContent,
    title:document.getElementById('pill').title,
    bar:document.getElementById('barFill').style.width})`);
  ck('分母只算新词不算复习',/新词 3 \/ 3/.test(s.pill),s);
  ck('标题里复习单独说明',/复习 0 个/.test(s.title)&&/计划 1 个/.test(s.title),s.title);
  ck('进度条按新词算满',s.bar==='100%',s.bar);
  await ev(`document.getElementById('pill').click()`);await sleep(160);
  s=await ev(`document.getElementById('planBreak').textContent`);
  ck('计划面板说明两组分开计',/不含复习/.test(s)&&/两组分开计/.test(s),s);

  console.log('\n总计 '+pass+' 通过 / '+fail+' 失败');
  if(fail) process.exitCode=1;
}finally{ws?.close();edge.kill()}
