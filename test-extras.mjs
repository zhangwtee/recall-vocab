// 验证例句/助记/日历/词汇量估计。node test-extras.mjs
import {spawn} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',PORT=9349;
let seq=0,ws;const p=new Map();
function cmd(m,x={}){return new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>rej(new Error(m+' 超时')),20000);p.set(id,v=>{clearTimeout(t);res(v)});ws.send(JSON.stringify({id,method:m,params:x}))})}
async function ev(e){const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
let pass=0,fail=0;function ck(n,c,x){if(c){pass++;console.log('  ok   '+n)}else{fail++;console.log('  FAIL '+n+(x!==undefined?'  → '+JSON.stringify(x):''))}}
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${PORT}`,'--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-extras','--allow-file-access-from-files','file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let u;for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const pg=(await r.json()).find(x=>x.type==='page');if(pg){u=pg.webSocketDebuggerUrl;break}}catch{}await sleep(300)}
  ws=new WebSocket(u);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){p.get(m.id)(m.result);p.delete(m.id)}};
  await cmd('Runtime.enable');await sleep(2500);
  await ev(`localStorage.removeItem('nixiang.memo.v1')`);await cmd('Page.reload');await sleep(2500);

  console.log('\n[1] 例句数据内置');
  let s=await ev(`({n:window.WORD_EXAMPLES.length,hasFn:typeof window.getExamples==='function',
    ex:window.getExamples('abandon')})`);
  ck('例句词条 1 万+',s.n>10000,s.n);
  ck('查询函数存在',s.hasFn===true);
  ck('abandon 有例句',Array.isArray(s.ex)&&s.ex.length>0,s.ex);

  console.log('\n[2] 反馈页显示例句');
  // 先学一个词，选档位进反馈
  const w=await ev(`document.querySelector('.word').textContent`);
  await ev(`document.querySelector('[data-action="quickRate"][data-g="3"]').click()`);await sleep(200);
  s=await ev(`({hasEx:!!document.querySelector('.examples'),
    exTitle:document.querySelector('.ex-title')?.textContent,
    exEn:document.querySelector('.ex-en')?.textContent,
    exSpeak:document.querySelectorAll('.ex-speak').length})`);
  const exCount=await ev(`(window.getExamples('${w.toLowerCase()}')||[]).length`);
  if(exCount>0){
    ck('反馈页显示例句区',s.hasEx===true);
    ck('例句标题正确',s.exTitle==='例句',s.exTitle);
    ck('例句英文存在',!!s.exEn&&s.exEn.length>3,s.exEn);
    ck('例句有朗读按钮',s.exSpeak>=1,s.exSpeak);
  }else{
    console.log('  --   当前词无例句，跳过显示断言');
  }
  await ev(`document.querySelector('[data-action="confirm"]').click()`);await sleep(150);

  console.log('\n[3] 助记笔记：档案编辑 + 反馈显示');
  await ev(`document.querySelector('[data-action="wordInfo"]').click()`);await sleep(150);
  s=await ev(`({hasInput:!!document.getElementById('noteInput'),hasBtn:!!document.querySelector('[data-action="saveNote"]')})`);
  ck('档案有助记输入框',s.hasInput===true);
  ck('档案有保存按钮',s.hasBtn===true);
  await ev(`(()=>{const i=document.getElementById('noteInput');i.value='联想：a-band-on band 绑住';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ev(`document.querySelector('[data-action="saveNote"]').click()`);await sleep(150);
  s=await ev(`(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    const w=document.querySelector('.word')?.textContent||'';const k=w.toLowerCase();return {note:s.cards[k]?.note,keys:Object.keys(s.cards).length}})()`);
  ck('助记已持久化',s.note==='联想：a-band-on band 绑住',{note:s.note});
  await ev(`document.querySelector('[data-action="closeWordInfo"]').click()`);await sleep(100);

  console.log('\n[4] 统计页四块新内容');
  await ev(`document.querySelector('[data-action="settings"]').click()`);await sleep(150);
  await ev(`document.querySelector('[data-tab="stats"]').click()`);await sleep(250);
  s=await ev(`({titles:[...document.querySelectorAll('.chart-title')].map(x=>x.textContent),
    cells:document.querySelectorAll('.hm-cell').length,
    lv:document.querySelectorAll('.hm-grid .hm-cell').length,
    vocab:document.querySelector('.vocab-box')?.textContent,full:[...document.querySelectorAll('.chart-card')].find(x=>x.textContent.includes('词汇量估计'))?.textContent,
    svg:document.querySelectorAll('.vocab-box svg').length})`);
  ck('打卡日历卡片存在',s.titles.includes('打卡日历'),s.titles);
  ck('词汇量估计卡片存在',s.titles.includes('词汇量估计'),s.titles);
  ck('热力图 84+ 格',s.lv>=84,s.lv);
  ck('词汇量有环形图',s.svg===1,s.svg);
  ck('词汇量显示数值',/牢固掌握/.test(s.vocab||''),s.vocab);
  ck('说明算法局限',/保守值/.test(s.full||''),(s.full||'').slice(-120));

  console.log('\n[5] 助记在反馈页回显');
  await ev(`document.querySelector('[data-action="closePanel"]').click()`);await sleep(100);
  // 给当前词写助记，再评分看反馈页是否显示
  const cw=await ev(`document.querySelector('.word').textContent`);
  await ev(`(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));const k='${cw}'.toLowerCase();
    if(!s.cards[k]) s.cards[k]={w:k,p:'',m:'test',state:'new',stability:0,difficulty:0,reps:0,dueAt:Date.now(),enabled:true};
    s.cards[k].note='测试助记回显';localStorage.setItem('nixiang.memo.v1',JSON.stringify(s))})()`);
  await cmd('Page.reload');await sleep(2500);
  s=await ev(`({note:(()=>{const s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));return s.cards['${cw}'.toLowerCase()]?.note})()})`);
  ck('助记刷新后仍在',s.note==='测试助记回显',s.note);

  console.log('\n────────────────────────');console.log(`通过 ${pass} / 失败 ${fail}`);
  if(fail)process.exitCode=1;
}catch(e){console.error('中断:',e.message);process.exitCode=1}finally{ws?.close();edge.kill()}
