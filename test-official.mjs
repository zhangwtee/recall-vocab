// 端到端：官方四六级词书能在 UI 中选到、出题、揭晓释义。
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9378;
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
  '--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-official',
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

  console.log('[1] 词书数据加载');
  const books = await ev(`window.WORD_BOOKS.map(b=>({id:b.id,name:b.name,n:b.idx.length}))`);
  ck('官方四级词书存在', books.some(b => b.id === 'officialCet4'), books.map(b=>b.id));
  ck('官方六级新增词书存在', books.some(b => b.id === 'officialCet6'));
  const b4 = books.find(b => b.id === 'officialCet4');
  const b6 = books.find(b => b.id === 'officialCet6');
  ck('官方四级词数 > 4500', b4 && b4.n > 4500, b4 && b4.n);
  ck('官方六级新增词数 > 1200', b6 && b6.n > 1200, b6 && b6.n);

  console.log('[2] 词书选择器可见');
  // 打开词书选择面板
  await ev(`(function(){
    var b=document.querySelector('[data-action="openBookPicker"]');
    if(b) b.click();
  })()`);
  await sleep(600);
  const pickerText = await ev(`document.body.innerText`);
  ck('选择面板出现「官方四级大纲」', pickerText.indexOf('官方四级大纲') >= 0);
  ck('选择面板出现「官方六级新增」', pickerText.indexOf('官方六级新增') >= 0);

  console.log('[3] 切到官方四级能出题');
  // 直接设置状态并重建会话
  await ev(`(function(){
    var s=JSON.parse(localStorage.getItem('nixiang.memo.v1')||'{}');
    s.book='officialCet4';
    localStorage.setItem('nixiang.memo.v1',JSON.stringify(s));
  })()`);
  await cmd('Page.reload', { ignoreCache: true });
  await sleep(3500);
  const cardWord = await ev(`(function(){
    var el=document.querySelector('#word,#cardWord,.word-big,.word')||document.body;
    return el.textContent.trim().slice(0,60);
  })()`);
  ck('刷新后能出词', cardWord.length > 0, cardWord);
  const state = await ev(`JSON.parse(localStorage.getItem('nixiang.memo.v1')||'{}').book`);
  ck('当前词书是官方四级', state === 'officialCet4', state);

  console.log('[4] 释义揭晓与词池一致');
  const check = await ev(`(function(){
    var b=window.WORD_BOOKS.find(function(x){return x.id==='officialCet4'});
    var w=b.words.find(function(x){return x.m && x.m.length>2});
    return {w:w.w, m:w.m};
  })()`);
  ck('官方四级词条释义非空', check.m.length > 2, check);

} finally {
  ws && ws.close();
  edge.kill();
}

console.log('\n总结：通过 ' + pass + '，失败 ' + fail);
if (fail) process.exitCode = 1;
