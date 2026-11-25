// 端到端：单文件版 memo.html 在断网（DNS 全部拦截）状态下可用、能背词、进度能存。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9382;
let seq = 0, ws;
const pending = new Map();

function cmd(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++seq;
    const t = setTimeout(() => rej(new Error(method + ' timeout')), 20000);
    pending.set(id, v => { clearTimeout(t); res(v); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expr) {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval error');
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
  '--user-data-dir=F:/nixiang/memo/.edge-single',
  // 模拟断网：任何域名都解析失败，确保页面没有偷联网
  '--host-resolver-rules=MAP * ~NOTFOUND',
  'file:///F:/nixiang/memo/memo.html'
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
  await sleep(3000);

  console.log('[1] 断网状态下词库是否已内联');
  const pool = await ev(`window.WORD_POOL ? window.WORD_POOL.length : -1`);
  const books = await ev(`window.WORD_BOOKS ? window.WORD_BOOKS.map(b=>b.id) : []`);
  const hasEx = await ev(`typeof window.getExamples === 'function'`);
  ck('词池已内联（>20000）', pool > 20000, pool);
  ck('词书 26 本', books.length === 26, books.length);
  ck('例句函数可用', hasEx === true, hasEx);

  console.log('[2] 启动遮罩是否消失、卡片是否出词');
  const bootHidden = await ev(`document.getElementById('boot').classList.contains('hidden')`);
  const word = await ev(`(function(){var e=document.getElementById('word')||document.querySelector('.word');return e?e.textContent.trim():'';})()`);
  ck('启动遮罩已隐藏', bootHidden === true, bootHidden);
  ck('出现单词卡', word.length > 0, word);

  console.log('[3] 本地存储可写（进度能不能存）');
  const lsOk = await ev(`(function(){try{localStorage.setItem('__probe','1');var v=localStorage.getItem('__probe');localStorage.removeItem('__probe');return v==='1';}catch(e){return false;}})()`);
  ck('localStorage 可用', lsOk === true, lsOk);

  console.log('[4] 答题后进度落盘、刷新后仍在');
  await ev(`(function(){
    var s=JSON.parse(localStorage.getItem('nixiang.memo.v1')||'{}');
    s.version=1; s.settings=s.settings||{}; s.settings.bookId='cet4';
    s.cards=s.cards||{}; s.dailyLog=s.dailyLog||{};
    localStorage.setItem('nixiang.memo.v1', JSON.stringify(s));
  })()`);
  await cmd('Page.reload', { ignoreCache: true });
  await sleep(3000);
  const before = await ev(`(function(){
    var b=document.querySelectorAll('[data-action="quickRate"]');
    if(b.length) b[b.length-1].click();
    return b.length;
  })()`);
  await sleep(1200);
  const savedCards = await ev(`(function(){
    var s=JSON.parse(localStorage.getItem('nixiang.memo.v1')||'{}');
    return Object.keys(s.cards||{}).length;
  })()`);
  ck('答题按钮存在', before > 0, before);
  ck('答题后卡片已写入本地', savedCards > 0, savedCards);

  const st = await ev(`window.__memoDataStatus`);
  ck('数据来源标记为内置', st && st.source === '内置', st);

  const warn = await ev(`!!document.getElementById('lsWarn')`);
  ck('存储可用时不显示警告条', warn === false, warn);
  const toastTxt = await ev(`document.body.innerText.indexOf('词库已更新')`);
  ck('不误报“词库已更新”', toastTxt < 0, toastTxt);

} finally {
  ws && ws.close();
  edge.kill();
}

console.log('\n总结：通过 ' + pass + '，失败 ' + fail);
if (fail) process.exitCode = 1;
