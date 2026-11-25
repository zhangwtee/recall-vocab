// 回看上一词、错义记录与混淆分析、揭晓后再拼一次。node test-revisit.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9396;
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
async function click(sel, wait = 220) { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(wait); }
const stats = `JSON.stringify((function(){var s=JSON.parse(localStorage.getItem('nixiang.memo.v1'));
  var k=Object.keys(s.dailyLog)[0]||'';return {neu:(s.dailyLog[k]||{}).neu||0,
  rev:(s.dailyLog[k]||{}).rev||0, mistakes:(s.mistakes||[]).length};})())`;

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-revisit',
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
  await ev(`localStorage.clear()`);
  await cmd('Page.reload');
  await sleep(2200);

  // ── 回看上一词 ─────────────────────────────────────────
  const firstWord = await ev(`document.querySelector('.word').textContent`);
  await ev(`(()=>{var i=document.getElementById('typeInput');i.value='完全错的意思';
    i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action="submitInput"]').click();})()`);
  await sleep(200);
  ck('写错会留下错义记录', JSON.parse(await ev(stats)).mistakes === 1);
  await click('[data-action="confirm"]');
  const secondWord = await ev(`document.querySelector('.word').textContent`);
  ck('评分后进入下一词', secondWord !== firstWord, { firstWord, secondWord });
  ck('新卡提供回看入口', !!(await ev(`document.querySelector('[data-action="backWord"]')`)));
  const beforeBack = await ev(stats);
  await click('[data-action="backWord"]');
  ck('回看显示上一个词', (await ev(`document.querySelector('.word').textContent`)) === firstWord);
  ck('回看页显示意思', !!(await ev(`(document.querySelector('.peek-mean')||{}).textContent`)));
  ck('回看页没有评分按钮', !(await ev(`document.querySelector('[data-action="quickRate"]')`)));
  ck('回看不改当日统计', (await ev(stats)) === beforeBack, { beforeBack, after: await ev(stats) });
  await click('[data-action="closePeek"]');
  ck('可以回到当前词', (await ev(`document.querySelector('.word').textContent`)) === secondWord);

  // ── 错义分析 ───────────────────────────────────────────
  await click('[data-action="settings"]');
  await click('.tab[data-tab="stats"]');
  ck('统计页有错义分析入口', !!(await ev(`document.querySelector('[data-action="openConfusion"]')`)));
  await click('[data-action="openConfusion"]', 2500);
  const confText = await ev(`document.getElementById('panel').innerText`);
  ck('分析页列出写错的意思', confText.includes('完全错的意思'), confText.slice(0, 200));
  ck('分析页给出反查线索', confText.includes('可能想的是'), confText.slice(0, 300));
  await click('[data-action="closeConfusion"]');
  await click('[data-action="closePanel"]');

  // ── 揭晓后再拼一次 ─────────────────────────────────────
  await click(`[data-action="quickRate"][data-g="3"]`);
  ck('反馈页有再拼一次入口', !!(await ev(`document.querySelector('[data-action="startDrill"]')`)));
  const beforeDrill = await ev(stats);
  await click('[data-action="startDrill"]');
  ck('拼写复盘不显示英文答案', !(await ev(`!!document.querySelector('.card .word')`)));
  ck('拼写复盘显示中文提示', !!(await ev(`(document.querySelector('.spell-prompt')||{}).textContent`)));
  await ev(`(()=>{var i=document.getElementById('drillInput');i.value=${JSON.stringify(secondWord)};
    i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action="submitDrill"]').click();})()`);
  await sleep(250);
  ck('拼写正确给出提示', (await ev(`document.querySelector('.verdict').textContent`)).includes('拼对了'));
  ck('复盘不改当日统计', (await ev(stats)) === beforeDrill);
  await click('[data-action="closeDrill"]');
  ck('复盘后回到反馈页', !!(await ev(`document.querySelector('[data-action="confirm"]')`)));

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('测试异常：', e);
  process.exitCode = 1;
} finally {
  ws?.close();
  edge.kill();
}
