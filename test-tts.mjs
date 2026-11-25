// 朗读降级：系统语音引擎不出声时，单词退到在线音频；失败提示只弹一次。
// 直接点界面上的喇叭按钮，走真实交互路径。node test-tts.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9387;
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
  '--user-data-dir=F:/nixiang/memo/.edge-tts',
  'file:///F:/nixiang/memo/memo.html'
], { stdio: 'ignore' });

try {
  let url;
  for (let i = 0; i < 80; i++) {
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

  // 等启动完成出词
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await ev(`(function(){
      var b=document.getElementById('boot');
      var st=document.getElementById('stage');
      return !!(b && b.classList.contains('hidden') && st && st.innerText.trim().length);
    })()`);
    if (ready) break;
    await sleep(250);
  }
  ck('页面启动完成并出词', ready);

  // 记录在线音频与提示，系统语音引擎换成"不出声"的桩
  await ev(`(function(){
    window.__audioUrls = [];
    window.__toasts = [];
    window.Audio = function(u){
      window.__audioUrls.push(u);
      this.play = function(){ return Promise.resolve(); };
    };
    window.speechSynthesis = {
      cancel: function(){},
      speak: function(){ /* 故意不触发 onstart：模拟没装英文语音 */ },
      getVoices: function(){ return []; },
      speaking: false, pending: false
    };
    // 应用的 toast 直接写 #toast 的 textContent，给这个元素加个计数钩子
    var el = document.getElementById('toast');
    var v = el.textContent;
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      get: function(){ return v; },
      set: function(x){ v = x; window.__toasts.push(String(x)); }
    });
  })()`);

  const word = await ev(`(function(){
    var st=document.getElementById('stage')||document.body;
    var lines=st.innerText.split('\\n').map(function(x){return x.trim()}).filter(Boolean);
    return lines[0]||'';
  })()`);

  // 1. 点单词喇叭：系统语音不出声 → 1.2s 后退到在线音频
  await ev(`document.querySelector('[data-action="speak"]').click()`);
  await sleep(1800);
  const urls = await ev(`window.__audioUrls.slice()`);
  ck('系统语音不出声时退回在线音频', urls.length === 1, urls);
  ck('音频地址指向有道词典', /dict\.youdao\.com\/dictvoice/.test(urls[0] || ''), urls[0]);
  ck('音频请求带上当前单词', urls[0] && urls[0].indexOf(encodeURIComponent(word)) >= 0, { word, url: urls[0] });
  ck('默认用美音（type=2）', /type=2/.test(urls[0] || ''), urls[0]);

  // 2. 揭晓后点例句喇叭：整句不走在线音频，只提示一次
  await ev(`(function(){
    var r=document.querySelectorAll('[data-action="quickRate"]');
    if(r.length) r[r.length-1].click();
  })()`);
  await sleep(400);
  const exBtn = await ev(`(function(){
    var b=document.querySelector('.ex-speak[data-text]');
    return b ? b.dataset.text : '';
  })()`);
  ck('揭晓后有例句朗读按钮', !!exBtn, exBtn);

  const before = await ev(`window.__audioUrls.length`);
  await ev(`(function(){ var b=document.querySelector('.ex-speak[data-text]'); if(b) b.click(); })()`);
  await sleep(1600);
  const after = await ev(`window.__audioUrls.length`);
  ck('整句不走向在线音频', after === before, { before, after });

  const t1 = await ev(`window.__toasts.length`);
  ck('朗读不可用时有提示', t1 >= 1, await ev(`window.__toasts.slice()`));

  // 3. 再点一次，不重复弹提示
  await ev(`(function(){ var b=document.querySelector('.ex-speak[data-text]'); if(b) b.click(); })()`);
  await sleep(1600);
  const t2 = await ev(`window.__toasts.length`);
  ck('提示只弹一次', t2 === t1, { t1, t2 });

  console.log('\n总结：通过 ' + pass + '，失败 ' + fail);
  if (fail) process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  edge.kill();
}
