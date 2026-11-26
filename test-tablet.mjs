// 验证手机/平板/宽屏断点下卡片、按钮、面板都不被裁切。node test-tablet.mjs
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9419;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),25000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--window-size=1180,820','--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-tablettest','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');
  await sleep(1800);

  async function measure(w,h){
    await cmd('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
    await ev(`localStorage.clear()`);
    await cmd('Page.reload');await sleep(2300);
    let tries=0;
    while(!(await ev(`!!document.querySelector('[data-action="quickRate"]')`))&&tries++<12){await sleep(300)}
    await ev(`document.querySelector('[data-action="quickRate"][data-g="2"]').click()`);await sleep(300);
    return await ev(`(function(){
      var c=document.querySelector('.card'),dock=document.getElementById('dock'),
        main=document.getElementById('stage'),btn=document.querySelector('[data-action="confirm"]');
      if(!c||!dock||!btn) return null;
      var cr=c.getBoundingClientRect(),dr=dock.getBoundingClientRect(),br=btn.getBoundingClientRect();
      return {cardW:Math.round(cr.width),cardH:Math.round(cr.height),
        cardIn:cr.left>=0&&cr.right<=window.innerWidth+1,
        btnIn:br.top>=0&&br.bottom<=window.innerHeight+1,
        btnBelowCard:br.top>=cr.bottom-1,
        hScroll:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
        mainScroll:main.scrollHeight>main.clientHeight+1,
        wordSize:parseFloat(getComputedStyle(document.querySelector('.word')).fontSize),
        vh:window.innerHeight}})()`);
  }

  console.log('\n[1] 手机断点保持原样');
  let s=await measure(390,844);
  ck('手机卡片不被撑大',s&&s.cardW<=520,s);
  ck('手机无横向滚动',s&&s.hScroll===false,s);
  ck('手机底部按钮在屏内',s&&s.btnIn,s);

  console.log('\n[2] 平板竖屏 768×1024');
  s=await measure(768,1024);
  ck('卡片随屏变宽',s&&s.cardW>=640&&s.cardW<=720,s);
  ck('没有横向滚动',s&&s.hScroll===false,s);
  ck('卡片完整在屏内',s&&s.cardIn,s);
  ck('单词字号放大',s&&s.wordSize>=52,s&&s.wordSize);

  console.log('\n[3] 平板横屏 1024×768');
  s=await measure(1024,768);
  ck('卡片随屏变宽',s&&s.cardW>=640,s);
  ck('没有横向滚动',s&&s.hScroll===false,s);
  ck('反馈内容一屏可见',s&&s.mainScroll===false&&s.btnIn,s);
  ck('按钮在卡片下方',s&&s.btnBelowCard,s);

  console.log('\n[4] 大屏 1180×820');
  s=await measure(1180,820);
  ck('卡片不无限拉伸',s&&s.cardW>=640&&s.cardW<=780,s);
  ck('没有横向滚动',s&&s.hScroll===false,s);
  ck('按钮在屏内',s&&s.btnIn,s);

  console.log('\n[5] 设置面板不溢出');
  await cmd('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:true});
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(600);
  s=await ev(`(function(){var sh=document.querySelector('.sheet'),r=sh.getBoundingClientRect(),
    body=document.getElementById('sheetBody');
    return {w:Math.round(r.width),in:r.left>=0&&r.right<=window.innerWidth+1,
      scroll:body.scrollHeight>body.clientHeight,
      hScroll:document.documentElement.scrollWidth>document.documentElement.clientWidth+1}})()`);
  ck('抽屉宽度合理',s&&s.w>=520&&s.w<=640,s);
  ck('抽屉在屏内',s&&s.in,s);
  ck('页面没有横向滚动',s&&s.hScroll===false,s);
  console.log('\n────────────────────────');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail) process.exitCode=1;
}finally{ws?.close();edge.kill()}
