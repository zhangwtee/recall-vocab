// 用 Edge 无头浏览器 + CDP 验收四条标准。node test-app.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const URL = 'file:///F:/nixiang/memo/index.html';

let seq = 0, ws;
function cmd(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => reject(new Error(method + ' 超时')), 10000);
    pending.set(id, v => { clearTimeout(timer); resolve(v); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const pending = new Map();
ws = null;

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await r.json();
      const page = targets.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Edge 未启动');
}
async function evaluate(expr) {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('JS 异常: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:/nixiang/memo/.edge-test',
  '--allow-file-access-from-files', URL
], { stdio: 'ignore' });

try {
  const wsUrl = await connect();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); }
  };
  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await sleep(1500);
  // 每次测试从干净状态开始
  await evaluate(`localStorage.removeItem('nixiang.memo.v1')`);
  await cmd('Page.reload');
  await sleep(1200);
  console.log('\n[1] 首次打开：干净状态，只出词、不显示释义');
  let s = await evaluate(`({
    word: document.querySelector('.word')?.textContent,
    hasMeaning: !!document.querySelector('.meaning'),
    hasInput: !!document.getElementById('typeInput'),
    rates: document.querySelectorAll('[data-action="quickRate"]').length,
    pill: document.getElementById('pill').textContent,
    words: window.CET4_WORDS.length
  })`);
  check('词库 4540 词已内联', s.words === 4540, s.words);
  check('屏幕出现单词', !!s.word && s.word.length > 0, s.word);
  check('出词时无释义', s.hasMeaning === false);
  check('输入框存在', s.hasInput === true);
  check('三档按钮存在', s.rates === 3, s.rates);

  console.log('\n[2] 主动回忆流程：选档位 → 反馈 → 进入下一词');
  const before = s.word;
  s = await evaluate(`({
    labels: [...document.querySelectorAll('[data-action="quickRate"] b')].map(x=>x.textContent),
    previews: [...document.querySelectorAll('[data-action="quickRate"] small')].map(x=>x.textContent)
  })`);
  check('三档：不认识/模糊/认识', JSON.stringify(s.labels) === '["不认识","模糊","认识"]', s.labels);
  check('每档显示下次间隔', s.previews.length === 3 && s.previews.every(x => !!x), s.previews);
  await evaluate(`document.querySelector('[data-action="quickRate"][data-g="3"]').click()`);
  await sleep(150);
  await evaluate(`document.querySelector('[data-action="confirm"]').click()`);
  await sleep(250);
  s = await evaluate(`({ word: document.querySelector('.word')?.textContent, pill: document.getElementById('pill').textContent, stat: document.getElementById('statNew').textContent })`);
  check('评分后进入下一词', s.word !== before, { before, after: s.word });
  check('今日新词计数 +1', /新词 1/.test(s.stat), s.stat);

  console.log('\n[3] 进度持久化：刷新后不重复、只出该复习的');
  const learned = await evaluate(`Object.keys(JSON.parse(localStorage.getItem('nixiang.memo.v1')).cards).length`);
  await cmd('Page.reload');
  await sleep(1500);
  s = await evaluate(`({
    cards: Object.keys(JSON.parse(localStorage.getItem('nixiang.memo.v1')).cards).length,
    word: document.querySelector('.word')?.textContent,
    stat: document.getElementById('statNew').textContent
  })`);
  check('刷新后已学词数不变', s.cards === learned, { learned, after: s.cards });
  check('今日新词计数保留', /新词 1/.test(s.stat), s.stat);

  console.log('\n[4] 备份导出/导入：进度一致');
  const backup = await evaluate(`localStorage.getItem('nixiang.memo.v1')`);
  const cardsBefore = await evaluate(`Object.keys(JSON.parse(localStorage.getItem('nixiang.memo.v1')).cards).length`);
  await evaluate(`localStorage.setItem('nixiang.memo.v1', JSON.stringify({version:1,settings:{},cards:{},customPool:[],dailyLog:{}}))`);
  await sleep(100);
  const wiped = await evaluate(`Object.keys(JSON.parse(localStorage.getItem('nixiang.memo.v1')).cards).length`);
  check('模拟清空后进度为 0', wiped === 0, wiped);
  await evaluate(`localStorage.setItem('nixiang.memo.v1', ${JSON.stringify(backup)})`);
  await cmd('Page.reload');
  await sleep(1500);
  const cardsAfter = await evaluate(`Object.keys(JSON.parse(localStorage.getItem('nixiang.memo.v1')).cards).length`);
  check('导入备份后进度恢复', cardsAfter === cardsBefore, { cardsBefore, cardsAfter });

  console.log('\n[5] 自定义词表导入 + 发音接口');
  await evaluate(`document.querySelector('[data-action="settings"]').click()`);
  await sleep(150);
  await evaluate(`document.querySelector('[data-tab="words"]').click()`);
  await sleep(150);
  s = await evaluate(`({ hasTextarea: !!document.getElementById('importText'),
    bookCount: document.querySelectorAll('[data-book]').length,
    customSeg: !!document.querySelector('[data-seg="customOn"]') })`);
  check('词库面板含导入框', s.hasTextarea === true);
  check('词书列表可切换', s.bookCount >= 10, s.bookCount);
  check('自定义词库开关存在', s.customSeg === true);
  const tts = await evaluate(`({ speech: 'speechSynthesis' in window, lang: document.documentElement.lang })`);
  check('TTS 接口可用', tts.speech === true);

  console.log('\n────────────────────────');
  console.log(`通过 ${pass} / 失败 ${fail}`);
  if (fail) process.exitCode = 1;
} catch (e) {
  console.error('验收中断:', e.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  edge.kill();
}
