// 单词刚出现时自动朗读：出词读一次、重复渲染不读、设置可关闭、自动失败不弹提示。
// node test-autospeak.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9393;
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
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
let pass = 0, fail = 0;
function ck(name, cond, extra) {
  if (cond) { pass++; console.log('  [ok] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
async function reload() {
  await cmd('Page.reload');
  for (let i = 0; i < 40; i++) {
    const ready = await ev(`!!document.querySelector('.word')`);
    if (ready) return;
    await sleep(250);
  }
}
async function click(sel) { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(220); }

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-autospeak',
  '--allow-file-access-from-files',
  'file:///F:/nixiang/memo/index.html'
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
  await cmd('Page.enable');

  // 在应用加载前替换语音引擎，记录每次朗读与在线音频
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){
      var fail = sessionStorage.getItem('__failSpeech')==='1';
      window.__speakLog=[]; window.__audioLog=[]; window.__toastLog=[];
      window.SpeechSynthesisUtterance=function(t){this.text=t;this.lang='';this.rate=1};
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
        cancel:function(){},
        speak:function(u){ if(fail || sessionStorage.getItem('__blockFirst')==='1') return;
          window.__speakLog.push(String(u.text));
          setTimeout(function(){ if(u.onstart) u.onstart(); },0); },
        getVoices:function(){ return []; }, speaking:false, pending:false
      }});
      window.Audio=function(u){ window.__audioLog.push(String(u));
        this.play=function(){ return fail ? Promise.reject(new Error('blocked')) : Promise.resolve(); }; };
      document.addEventListener('DOMContentLoaded',function(){
        var el=document.getElementById('toast'), v=el.textContent;
        Object.defineProperty(el,'textContent',{configurable:true,
          get:function(){return v}, set:function(x){v=x;window.__toastLog.push(String(x))}});
      });
    })()`
  });

  await ev(`localStorage.clear()`);
  await reload();
  const word1 = await ev(`document.querySelector('.word').textContent`);
  const log1 = JSON.parse(await ev(`JSON.stringify(window.__speakLog)`));
  ck('新词刚出现就朗读一次', log1.length === 1 && log1[0] === word1, { word1, log1 });
  await sleep(1500);
  ck('重复渲染不会反复朗读', (await ev(`window.__speakLog.length`)) === 1);

  // 揭晓反馈不重读；确认后下一词读一遍
  await click(`[data-action="quickRate"][data-g="3"]`);
  ck('揭晓反馈不触发出现时朗读', (await ev(`window.__speakLog.length`)) === 1);
  await click('[data-action="confirm"]');
  const word2 = await ev(`document.querySelector('.word').textContent`);
  const log2 = JSON.parse(await ev(`JSON.stringify(window.__speakLog)`));
  ck('切到下一词会朗读新词', log2.length === 2 && log2[1] === word2, { word2, log2 });

  // 设置关掉后不再自动读
  await click('[data-action="settings"]');
  await click('[data-seg="autoSpeakShow"] button[data-val="0"]');
  await click('[data-action="closePanel"]');
  await click(`[data-action="quickRate"][data-g="3"]`);
  await click('[data-action="confirm"]');
  ck('关掉设置后出词不朗读', (await ev(`window.__speakLog.length`)) === 2);

  // 再打开，恢复朗读
  await click('[data-action="settings"]');
  await click('[data-seg="autoSpeakShow"] button[data-val="1"]');
  await click('[data-action="closePanel"]');
  await click(`[data-action="quickRate"][data-g="3"]`);
  await click('[data-action="confirm"]');
  ck('重新打开后出词继续朗读', (await ev(`window.__speakLog.length`)) === 3);

  // 自动朗读失败时静默；手动点喇叭才提示
  await ev(`sessionStorage.setItem('__failSpeech','1'); window.__toastLog.length=0`);
  await ev(`localStorage.setItem('nixiang.memo.v1', JSON.stringify((function(){
    var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    s.settings.autoSpeakShow=true; s.settings.autoSpeak=false; return s;})()))`);
  await reload();
  await sleep(1600);
  const autoToasts = await ev(`window.__toastLog.slice()`);
  ck('自动朗读失败不弹提示', !autoToasts.some(x => /朗读/.test(x)), autoToasts);
  ck('自动朗读仍会尝试在线音频', (await ev(`window.__audioLog.length`)) >= 1);
  await click('[data-action="speak"]');
  await sleep(1500);
  const allToasts = await ev(`window.__toastLog.slice()`);
  ck('手动点喇叭仍会提示不可用', allToasts.some(x => /朗读/.test(x)), allToasts);

  // 首次朗读被浏览器拦掉时，第一次碰屏幕补读当前词
  await ev(`sessionStorage.removeItem('__failSpeech'); sessionStorage.setItem('__blockFirst','1')`);
  await reload();
  const blockedWord = await ev(`document.querySelector('.word').textContent`);
  ck('首次朗读被拦时暂不出声', (await ev(`window.__speakLog.length`)) === 0);
  await ev(`sessionStorage.removeItem('__blockFirst')`);
  await ev(`document.getElementById('typeInput').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
  await sleep(200);
  const retried = JSON.parse(await ev(`JSON.stringify(window.__speakLog)`));
  ck('第一次碰屏幕补读当前词', retried.length === 1 && retried[0] === blockedWord, { blockedWord, retried });

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('测试异常：', e);
  process.exitCode = 1;
} finally {
  ws?.close();
  edge.kill();
}
