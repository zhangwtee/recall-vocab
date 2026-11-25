// 融合市面背词 App 优点后的回归：撤销误判、手动复习、负载控制、拼写模式。
// node test-improve.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9390;
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
async function fresh() {
  await ev(`localStorage.clear()`);
  await cmd('Page.reload');
  await sleep(2200);
}
async function click(sel) { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(220); }

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-improve',
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
  await sleep(1800);
  await fresh();

  // ── 撤销误判 ───────────────────────────────────────────
  const wordBefore = await ev(`document.querySelector('.word').textContent`);
  await ev(`(()=>{var i=document.getElementById('typeInput');i.value='完全不对';
    i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action="submitInput"]').click();})()`);
  await sleep(250);
  ck('错误答案可以提交', !!(await ev(`document.querySelector('.verdict')`)));
  await click('[data-action="confirm"]');
  const afterRate = await ev(`JSON.stringify((function(){var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    var k=Object.keys(s.dailyLog)[0];return {neu:s.dailyLog[k].neu,again:s.dailyLog[k].again};})())`);
  ck('评分写入当日统计', JSON.parse(afterRate).neu === 1, afterRate);
  ck('下一张卡出现撤销入口', !!(await ev(`document.querySelector('[data-action="undoRating"]')`)));
  await click('[data-action="undoRating"]');
  const afterUndo = await ev(`JSON.stringify((function(){var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    var k=Object.keys(s.dailyLog)[0];return {neu:s.dailyLog[k].neu,again:s.dailyLog[k].again};})())`);
  ck('撤销恢复统计', JSON.parse(afterUndo).neu === 0 && JSON.parse(afterUndo).again === 0, afterUndo);
  ck('撤销后回到同一张词', (await ev(`document.querySelector('.word').textContent`)) === wordBefore);
  ck('撤销入口已收起', !(await ev(`document.querySelector('[data-action="undoRating"]')`)));

  // ── 手动复习 ───────────────────────────────────────────
  await fresh();
  await ev(`(()=>{var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));var ks=Object.keys(s.cards);
    var y=new Date();y.setDate(y.getDate()-1);y.setHours(12,0,0,0);
    for(var i=0;i<3;i++){var c=s.cards[ks[i]];c.state='review';c.lastReview=y.getTime();c.dueAt=Date.now()+5*86400000;c.reps=2;}
    localStorage.setItem('nixiang.memo.v1',JSON.stringify(s));})()`);
  await cmd('Page.reload'); await sleep(2200);
  await click('[data-action="openPlan"]');
  ck('计划面板有手动复习入口', (await ev(`document.querySelectorAll('[data-action="reviewLearned"]').length`)) === 2);
  await click('[data-action="reviewLearned"][data-days="1"]');
  ck('手动复习提示插队数量', (await ev(`document.getElementById('toast').textContent`)).indexOf('3 个词') >= 0);
  ck('插队后关闭计划面板', await ev(`document.getElementById('planPanel').classList.contains('hidden')`));
  await click('[data-action="openPlan"]');
  await click('[data-action="reviewLearned"][data-days="1"]');
  ck('重复插队不再加入相同词', (await ev(`document.getElementById('toast').textContent`)).indexOf('没有学过') >= 0);

  // ── 负载控制 ───────────────────────────────────────────
  await fresh();
  await click('[data-action="openPlan"]');
  ck('计划面板有临时减量入口', !!(await ev(`document.querySelector('[data-action="cutToday"]')`)));
  await click('[data-action="cutToday"][data-n="10"]');
  const cap = await ev(`(function(){var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    var k=Object.keys(s.dailyLog)[0];return s.dailyLog[k].cap;})()`);
  ck('当天新词上限生效', cap === 10, cap);
  await fresh();
  ck('换天不保留临时上限', (await ev(`(function(){var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    var k=Object.keys(s.dailyLog)[0];return s.dailyLog[k].cap==null;})()`)) === true);
  await click('.word');
  ck('单词档案有熟知入口', !!(await ev(`document.querySelector('[data-action="toggleFamiliar"]')`)));
  const familiarWord = await ev(`document.querySelector('.wc-word').textContent`);
  await click('[data-action="toggleFamiliar"]');
  const fam = await ev(`JSON.stringify((function(){var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
    var c=Object.values(s.cards).filter(function(c){return c.w===${JSON.stringify(familiarWord)}})[0];
    return {f:!!c.familiar,e:c.enabled};})())`);
  ck('熟知标记移出队列', JSON.parse(fam).f === true && JSON.parse(fam).e === false, fam);

  // ── 拼写模式 ───────────────────────────────────────────
  await fresh();
  ck('两种输入模式按钮都在', (await ev(`document.querySelectorAll('.mode-switch button').length`)) === 2);
  const spellWord = await ev(`document.querySelector('.word').textContent`);
  await click('[data-action="setInputMode"][data-mode="en"]');
  ck('切到拼写模式后提示变化', (await ev(`document.getElementById('typeInput').placeholder`)) === '输入英文拼写');
  await ev(`(()=>{var i=document.getElementById('typeInput');i.value=${JSON.stringify(spellWord)};
    i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action="submitInput"]').click();})()`);
  await sleep(250);
  ck('正确拼写判对', (await ev(`document.querySelector('.verdict').textContent`)).indexOf('对上了') >= 0);
  const labels = JSON.parse(await ev(`JSON.stringify([].map.call(document.querySelectorAll('.compare .k'),function(x){return x.textContent}))`));
  ck('反馈标签切换为拼写', labels[0] === '你拼的' && labels[1] === '正确', labels);
  ck('反馈标准显示英文拼写', (await ev(`document.querySelectorAll('.compare .v')[1].textContent`)) === spellWord);
  await click('[data-action="confirm"]');
  await click('[data-action="setInputMode"][data-mode="cn"]');
  ck('切回中文模式', (await ev(`document.getElementById('typeInput').placeholder`)) === '输入汉语意思');

  console.log('\n总结：通过 ' + pass + '，失败 ' + fail);
  if (fail) process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  edge.kill();
}
