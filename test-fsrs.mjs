// node test-fsrs.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const FSRS = require('./fsrs.js');

const DAY = 86400000;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('\n[1] 新卡三档：认识 → 至少 1 天');
{
  const c = FSRS.newCard();
  FSRS.schedule(c, 3, 0);
  check('state=review', c.state === 'review');
  check('间隔 ≈ 3 天', Math.abs((c.dueAt - 0) / DAY - 3) < 0.51, (c.dueAt / DAY).toFixed(2));
  check('difficulty 在 1..10', c.difficulty >= 1 && c.difficulty <= 10, c.difficulty);
}

console.log('\n[2] 新卡不认识 → 当天重来');
{
  const c = FSRS.newCard();
  FSRS.schedule(c, 1, 0);
  check('state=learning', c.state === 'learning');
  check('1 分钟后', c.dueAt === 60000, c.dueAt);
}

console.log('\n[3] 认识次数越多，间隔越长（单调）');
{
  const c = FSRS.newCard();
  let t = 0, last = 0, mono = true;
  const seen = [];
  for (let i = 0; i < 8; i++) {
    FSRS.schedule(c, 3, t);
    const iv = (c.dueAt - t) / DAY;
    seen.push(+iv.toFixed(1));
    if (i > 0 && iv <= last) mono = false;
    last = iv;
    t = c.dueAt;
  }
  check('间隔严格递增', mono, seen.join(' → '));
  check('第 8 次超过 100 天', seen[7] > 100, seen[7]);
}

console.log('\n[4] 四档相对关系：Again < Hard < Good < Easy');
{
  const base = FSRS.newCard();
  FSRS.schedule(base, 3, 0);
  const t = base.dueAt;
  const r = {};
  for (const g of [1, 2, 3, 4]) {
    const c = Object.assign({}, base);
    FSRS.schedule(c, g, t);
    r[g] = c.dueAt - t;
  }
  check('Again 最短', r[1] < r[2], JSON.stringify(r));
  check('Hard < Good', r[2] < r[3], JSON.stringify(r));
  check('Good < Easy', r[3] < r[4], JSON.stringify(r));
}

console.log('\n[5] 遗忘会拉低稳定性');
{
  const c = FSRS.newCard();
  FSRS.schedule(c, 3, 0);
  c.dueAt = c.dueAt;
  const before = c.stability;
  // 到期后再忘一次
  FSRS.schedule(c, 1, c.lastReview + before * DAY);
  check('stability 下降', c.stability < before, before.toFixed(2) + ' → ' + c.stability.toFixed(2));
  check('lapses+1', c.lapses === 1);
  check('进入 relearning', c.state === 'relearning');
}

console.log('\n[6] 极长间隔被截断');
{
  const c = FSRS.newCard();
  c.state = 'review'; c.stability = 1e6; c.difficulty = 5; c.lastReview = 0; c.reps = 5;
  FSRS.schedule(c, 4, 400 * DAY);
  check('不超过 36500 天', (c.dueAt - 400 * DAY) / DAY <= 36500);
}

console.log('\n[7] 可提取性递减');
{
  const s = 10;
  check('t=0 → 1', Math.abs(FSRS.retrievability(0, s) - 1) < 1e-9);
  check('t=s → 0.9', Math.abs(FSRS.retrievability(s, s) - 0.9) < 1e-6);
  check('t=3s → 更低', FSRS.retrievability(30, s) < 0.9);
}

console.log('\n[8] 目标记忆率影响间隔');
{
  const c1 = FSRS.newCard(); c1.state = 'review'; c1.stability = 50; c1.difficulty = 5; c1.lastReview = 0;
  const a = Object.assign({}, c1), b = Object.assign({}, c1);
  FSRS.schedule(a, 3, 60 * DAY, { retention: 0.9 });
  FSRS.schedule(b, 3, 60 * DAY, { retention: 0.8 });
  check('0.8 的间隔更长', (b.dueAt - 60 * DAY) > (a.dueAt - 60 * DAY));
}

console.log('\n[9] 人话格式化');
{
  check('1 天', FSRS.humanizeDuration(DAY) === '1 天', FSRS.humanizeDuration(DAY));
  check('40 天', FSRS.humanizeDuration(40 * DAY) === '1.3 个月', FSRS.humanizeDuration(40 * DAY));
}

console.log('\n────────────────────────');
console.log(`通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
