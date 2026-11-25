// 释义端到端自洽：词库里每条释义作为输入，判分不能把它判成「不认识」。
// 同时验证卡片揭晓后显示的释义与词池一致。node test-meaning-e2e.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const html = fs.readFileSync('index.html','utf8');
const names = ['stripPos','meaningItems','normInput','editDist','stripMod','antonymClash','similarity','judge'];
const src = names.map(n => {
  const re = new RegExp('function\\s+' + n + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}', 'm');
  const m = html.match(re);
  if (!m) throw new Error('未找到函数 ' + n);
  return m[0];
}).join('\n');
const { judge, meaningItems } = new Function(src + '\nreturn {judge,meaningItems};')();

let pass=0, fail=0;
const ok=(c,l,d)=>{ if(c){pass++;} else {fail++; console.log('  FAIL '+l+(d?'  '+d:''));} };

console.log('\n[1] 全词池自洽判分');
global.window = global;
require('./books.js');
const pool = window.WORD_POOL;
const bad = [];
for (const e of pool){
  if (!e.m || e.m === '大纲词') continue;
  const items = meaningItems(e.m);
  // 取释义中第一个可判分的义项，模拟用户输入
  const input = items && items.length ? items[0] : e.m;
  const r = judge(input, e.m);
  if (r.g < 2) bad.push({ w:e.w, m:e.m.slice(0,50), input:String(input).slice(0,30), g:r.g, s:r.score.toFixed(2) });
}
ok(bad.length < pool.length * 0.01, '自洽判分失败率低于 1%', bad.length + '/' + pool.length);
for (const x of bad.slice(0,25))
  console.log('    '+x.w.padEnd(16)+' 输入 '+x.input+' → '+x.g+'('+x.s+')  释义 '+x.m);

console.log('\n[2] 已知错误词判分哨兵');
const byW = new Map(pool.map(e=>[e.w,e]));
const sentinels = { piano:'钢琴', they:'他(她)们', jaw:'颚', afford:'担负得起', banana:'香蕉' };
for (const [w, frag] of Object.entries(sentinels)){
  const e = byW.get(w);
  ok(e && judge(frag, e.m).g >= 2, w+' 输入正确义项判过', e ? e.m : '<缺失>');
}
const wrong = { piano:'轻柔的', they:'商店', jaw:'颗' };
for (const [w, frag] of Object.entries(wrong)){
  const e = byW.get(w);
  const r = judge(frag, e.m);
  ok(r.g <= 2, w+' 错误义项不再得满分', frag+' → '+r.g);
}

console.log('\n[3] 卡片显示与词池一致（Edge 端到端）');
const { spawn } = await import('node:child_process');
const { setTimeout: sleep } = await import('node:timers/promises');
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT=9371;
let ws, seq=0; const pending=new Map();
function cmd(m,x={}){ return new Promise((res,rej)=>{ const id=++seq,t=setTimeout(()=>rej(new Error(m+' timeout')),15000); pending.set(id,v=>{clearTimeout(t);res(v)}); ws.send(JSON.stringify({id,method:m,params:x})); }); }
async function ev(e){ const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; }
const edge=spawn(EDGE,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-meaning', 'file:///F:/nixiang/memo/index.html'],{stdio:'ignore'});
try{
  let url;
  for(let i=0;i<60;i++){ try{ const r=await fetch('http://127.0.0.1:'+PORT+'/json/list'); const p=(await r.json()).find(x=>x.type==='page'); if(p){url=p.webSocketDebuggerUrl;break;} }catch{} await sleep(250); }
  if(!url) throw new Error('Edge 未启动');
  ws=new WebSocket(url); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{ const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);} };
  await cmd('Runtime.enable'); await sleep(3500);
  for (const w of ['piano','they','jaw']){
    const target = byW.get(w);
    await ev(`(function(){
      var s={version:1,settings:{dailyNew:20,retention:0.9,accent:"en-US",autoSpeak:false,hidePh:false,bookId:"cet4",customOn:false,dataBase:""},cards:{},customPool:[],dailyLog:{},createdAt:Date.now()};
      var e=window.WORD_POOL.find(function(x){return x.w==="${w}"});
      s.cards["${w}"]={w:e.w,p:e.p,m:e.m,state:"new",stability:0,difficulty:0,dueAt:0,reps:0,lapses:0,enabled:true,addedAt:Date.now(),note:""};
      localStorage.setItem("nixiang.memo.v1",JSON.stringify(s));
    })()`);
    await cmd('Page.reload'); await sleep(3000);
    const word = await ev(`document.querySelector(".word").textContent`);
    await ev(`(function(){var b=document.querySelector("[data-action=quickRate]");if(b)b.click();})()`);
    await sleep(350);
    const shown = await ev(`(function(){var c=document.querySelector(".compare");return c?c.textContent:""})()`);
    ok(word === w, w+' 卡片单词正确', word);
    ok(shown.indexOf(target.m.slice(0,6)) >= 0, w+' 揭晓释义与词池一致', 'UI='+shown.slice(0,60)+' 词库='+target.m.slice(0,60));
  }
}catch(e){ fail++; console.log('  FAIL Edge 端到端: '+e.message); }
finally{ try{ws&&ws.close()}catch{}; edge.kill(); }

console.log('\n总结：通过 '+pass+'，失败 '+fail);
if(fail) process.exitCode=1;
