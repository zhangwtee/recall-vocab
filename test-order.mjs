// 验证「常用词先学」：新词按词书顺序引入、刷新不重复、刘晓艳保留原书课次
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9371;
const KEY = 'nixiang.memo.v1';
let seq = 0, ws;
const pending = new Map();

function cmd(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++seq;
    const t = setTimeout(() => rej(new Error(method + ' timeout')), 15000);
    pending.set(id, v => { clearTimeout(t); res(v); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expr) {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

let pass = 0, fail = 0;
function ck(name, cond, extra) {
  if (cond) { pass++; console.log('  [ok] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-order',
  'file:///F:/nixiang/memo/index.html'
], { stdio: 'ignore' });

try {
  let url;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const p = (await r.json()).find(x => x.type === 'page');
      if (p) { url = p.webSocketDebuggerUrl; break; }
    } catch {}
    await sleep(250);
  }
  ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  await cmd('Runtime.enable');
  await sleep(3500);

  // 干净状态：四级词书，每天 5 个新词
  await ev(`(function(){
    localStorage.removeItem('${KEY}');
    var s={version:1,settings:{dailyNew:5,retention:0.9,accent:'en-US',autoSpeak:false,
      hidePh:false,bookId:'cet4',customOn:false,dataBase:''},cards:{},customPool:[],
      dailyLog:{},createdAt:Date.now()};
    localStorage.setItem('${KEY}',JSON.stringify(s));
  })()`);
  await cmd('Page.reload');
  await sleep(3500);

  const expect = await ev(`window.WORD_BOOKS.find(function(b){return b.id==='cet4'}).words.slice(0,5).map(function(x){return x.w})`);
  const first = await ev(`document.querySelector('.word').textContent`);
  console.log('=== 1. 首词与词书顺序一致 ===');
  ck('首词是词书第一个（高频词）', first === expect[0], { first, expect: expect[0] });

  console.log('=== 2. 当天引入的 5 个词 ===');
  for (let i = 0; i < 5; i++) {
    await ev(`(function(){var b=document.querySelector('[data-action=quickRate]');if(b)b.click();})()`);
    await sleep(150);
    // 评分后进入反馈页，需点「下一个」继续
    const nextBtn = await ev(`(function(){var b=document.querySelector('[data-action=next]');if(b){b.click();return true}return false})()`);
    if (nextBtn) await sleep(200);
  }
  const got = await ev(`(function(){
    var s=JSON.parse(localStorage.getItem('${KEY}'));
    return Object.keys(s.cards).sort(function(a,b){return s.cards[a].addedAt-s.cards[b].addedAt});
  })()`);
  ck('引入词 = 词书前 5 个', JSON.stringify(got.slice().sort()) === JSON.stringify(expect.slice().sort()), { got, expect });

  console.log('=== 3. 刷新后不重复引入 ===');
  await cmd('Page.reload');
  await sleep(3500);
  const after = await ev(`(function(){
    var s=JSON.parse(localStorage.getItem('${KEY}'));
    return Object.keys(s.cards);
  })()`);
  ck('刷新后仍是同样 5 个词', JSON.stringify(after.slice().sort()) === JSON.stringify(expect.slice().sort()), { after });

  console.log('=== 4. 次日继续引入后续词 ===');
  await ev(`(function(){
    var s=JSON.parse(localStorage.getItem('${KEY}'));
    var d=new Date(); d.setDate(d.getDate()+1);
    var k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    s.dailyLog={}; localStorage.setItem('${KEY}',JSON.stringify(s));
  })()`);
  await cmd('Page.reload');
  await sleep(3500);
  const next5 = await ev(`(function(){
    var s=JSON.parse(localStorage.getItem('${KEY}'));
    return Object.keys(s.cards).sort();
  })()`);
  const expect10 = await ev(`window.WORD_BOOKS.find(function(b){return b.id==='cet4'}).words.slice(0,10).map(function(x){return x.w})`);
  ck('累计 10 个词且是前 10 个', JSON.stringify(next5.sort()) === JSON.stringify(expect10.slice().sort()), { got: next5, expect: expect10 });

  console.log('=== 5. 刘晓艳词书保留原书课次 ===');
  await ev(`(function(){
    var s=JSON.parse(localStorage.getItem('${KEY}'));
    s.settings.bookId='lxy4'; s.cards={}; s.dailyLog={};
    localStorage.setItem('${KEY}',JSON.stringify(s));
  })()`);
  await cmd('Page.reload');
  await sleep(3500);
  const lxyFirst = await ev(`document.querySelector('.word').textContent`);
  const lxyExpect = await ev(`window.WORD_BOOKS.find(function(b){return b.id==='lxy4'}).words[0].w`);
  ck('首词是原书第一课的词', lxyFirst === lxyExpect, { lxyFirst, lxyExpect });

  console.log(`\n总结：通过 ${pass}，失败 ${fail}`);
  if (fail) process.exitCode = 1;
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  edge.kill();
}
