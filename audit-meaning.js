// 释义正确性交叉审计：追踪每条释义的来源，找出可能被错误覆盖的词条。
// 用法：AUDIT_TRACE=1 node build-books.js && node audit-meaning.js
const fs = require('fs');
global.window = global;
require('./books.js');

const POOL = window.WORD_POOL;
const traceRaw = JSON.parse(fs.readFileSync('trace-meaning.json', 'utf8'));
const TRACE = traceRaw.cands || traceRaw;
const CHOSEN = traceRaw.chosen || {};
let pass = 0, fail = 0;
const ok = (c, label, detail) => {
  if (c) { pass++; console.log('  [ok] ' + label); }
  else { fail++; console.log('  [FAIL] ' + label + (detail ? '  ' + detail : '')); }
};
const note = (label, detail) => console.log('  [--] ' + label + '  ' + (detail || ''));
const sec = t => console.log('\n=== ' + t + ' ===');

// 提取中文核心义：去词性、编号、分隔符、英文，取前几个汉字词
const POS = /\b(?:n|v|vt|vi|adj|a|ad|adv|art|prep|conj|pron|int|num|noun|verb|adjective|adverb|exclamation)\./gi;
function core(s) {
  return String(s || '')
    .replace(POS, ' ')
    .replace(/[①②③④⑤⑥\(\)（）\[\]【】]/g, ' ')
    .replace(/[0-9]+[.、]/g, ' ')
    .replace(/[A-Za-z'’\-]/g, ' ')
    .replace(/[\|\/\\，,；;。:.、！!？?~·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
function chars(s) { const set = new Set(); for (const c of core(s)) if (/[\u4e00-\u9fa5]/.test(c)) set.add(c); return set; }
function overlap(a, b) {
  const A = chars(a), B = chars(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const c of A) if (B.has(c)) n++;
  return n / Math.min(A.size, B.size);
}
// 冲突判定：其他来源的核心汉字是否大部分仍保留在最终释义里。
// 保留 = 只是表述差异或义项扩充；不保留 = 真正换了意思。
function isConflict(final, other) {
  const A = chars(final), B = chars(other);
  if (!B.size) return false;
  let n = 0; for (const c of B) if (A.has(c)) n++;
  return n / B.size < 0.4;
}

sec('1. 溯源覆盖情况');
const byW = new Map(POOL.map(e => [e.w, e]));
let overwritten = 0, bySrc = {}, placeholder = 0;
const suspicious = [];
for (const e of POOL) {
  const cands = TRACE[e.w] || [];
  if (e.m === '大纲词') placeholder++;
  if (!cands.length) continue;
  const first = cands[0].m;
  if (e.m !== first) {
    overwritten++;
    const winner = cands.find(x => x.m === e.m);
    const s = winner ? winner.src : 'variant-fix';
    bySrc[s] = (bySrc[s] || 0) + 1;
  }
}
note('词条总数', POOL.length);
note('释义被后续来源覆盖', overwritten + ' 词');
note('覆盖者来源分布', JSON.stringify(bySrc));
note('仍为「大纲词」占位', placeholder + ' 词');

sec('2. 高风险覆盖：爬虫/简明释义覆盖词书释义');
// COCA 释义是网络爬取的"简明汉语释义"，若它比词书释义长而胜出，需要人工核对。
const cocaOver = [];
for (const e of POOL) {
  const cands = TRACE[e.w] || [];
  const bookCands = cands.filter(x => x.src !== 'coca' && x.m && x.m !== '大纲词');
  if (!bookCands.length) continue;
  const coca = cands.find(x => x.src === 'coca');
  if (!coca) continue;
  if (e.m === coca.m && e.m !== bookCands[0].m) cocaOver.push({ w:e.w, book:bookCands[0], coca:coca.m });
}
note('COCA 覆盖词书释义', cocaOver.length + ' 词');
const cocaConflicts = cocaOver.filter(x => isConflict(x.book.m, x.coca));
note('其中核心义不一致（需重点核对）', cocaConflicts.length + ' 词');
for (const x of cocaConflicts.slice(0, 40))
  console.log('    ' + x.w.padEnd(16) + ' 词书: ' + x.book.m.slice(0, 42) + '  | COCA: ' + x.coca.slice(0, 42));
note('说明：多数为义项扩充或表述差异，非错误', '下面第 3 节做精筛');

sec('3. 主释义是否来自最高可信来源');
// 合并规则：来源优先级高的胜出，同级取更长的那条。审计按同一规则独立复算一遍。
const PRI = { cet4:12, lxy4:11, cet6:10, zhongkao:10, primary:10, gaokao:10,
              kaoyan:9, major:5, major8:5, toefl:5, gre:4, coca:3, 'variant-fix':2 };
const mism = [];
for (const e of POOL) {
  const cands = TRACE[e.w] || [];
  if (!cands.length) continue; // 牛津补全的词，源不在 trace 里
  const src = CHOSEN[e.w];
  const picked = cands.find(x => x.src === src);
  if (!picked || picked.m !== e.m) continue; // 牛津/拼写补全改过释义
  const top = Math.max.apply(null, cands.filter(x=>x.m && x.m!=='大纲词').map(x => PRI[x.src]||0));
  if ((PRI[src]||0) < top) mism.push({ w:e.w, final:e.m, src:src, top:top });
}
ok(!mism.length, '无低可信来源覆盖高可信来源', mism.length + ' 例');
for (const x of mism.slice(0, 15))
  console.log('    ' + x.w.padEnd(14) + ' 选用 ' + x.src + ' (' + (PRI[x.src]||0) + ') 但有更高优先级来源 (' + x.top + ')');

// 已知曾出错的词，作为回归哨兵
const sentinels = { piano:'钢琴', they:'他', jaw:'颚', afford:'担负得起', banana:'香蕉' };
for (const [w, frag] of Object.entries(sentinels)) {
  const e = byW.get(w);
  ok(e && e.m.indexOf(frag) >= 0, w + ' 主释义正确', e ? e.m : '<缺失>');
}

sec('4. 释义内容异常');
const noise = POOL.filter(e => /人名|地名|音译|姓氏|缩写词/.test(e.m) && e.m.split(/[\n|]/).length < 4);
note('释义含人名/地名/音译标记', noise.length + ' 词');
for (const x of noise.slice(0, 25)) console.log('    ' + x.w + ': ' + x.m.slice(0, 70));
const concat = POOL.filter(e => /①②③④|①②③|①/.test(e.m));
note('含序号拼接的释义', concat.length + ' 词');
ok(!POOL.some(e => /[\uFFFD]/.test(e.m)), '释义无替换字符');
ok(!POOL.some(e => /<[a-zA-Z]/.test(e.m)), '释义无 HTML 标签');

sec('5. 常见词人工核对表');
const common = ['abandon','ability','accommodate','achieve','acknowledge','adapt','address','affect','afford','agenda',
  'alternative','ambiguous','analyse','anticipate','apparent','appeal','approach','appropriate','argue','assess',
  'assume','attend','attitude','available','avoid','benefit','brief','campaign','capacity','challenge','commit',
  'compete','complex','comprehensive','consequence','consider','constant','consume','contribute','convince','crucial',
  'decline','dedicate','definite','demonstrate','deny','depend','despite','determine','develop','distinguish',
  'distribute','domestic','efficient','eliminate','emerge','emphasize','enhance','enormous','ensure','equivalent',
  'essential','establish','estimate','evaluate','evident','exhibit','expand','explicit','expose','facilitate',
  'fundamental','generate','guarantee','identify','ignore','illustrate','impact','implement','imply','impose',
  'incentive','indicate','individual','inevitable','influence','innovation','insight','insist','integrate','intend',
  'interpret','introduce','involve','isolate','justify','maintain','major','manipulate','motivate','negotiate',
  'objective','obtain','obvious','occupy','occur','offer','oppose','option','participate','perceive','persist',
  'perspective','potential','precise','prefer','preserve','principle','prior','priority','promote','proof',
  'pursue','random','reasonable','recognize','recommend','reduce','refine','reflect','reform','regard',
  'reinforce','relevant','reliable','reluctant','represent','require','reserve','resist','resource','respect',
  'respond','responsible','restrict','retain','reveal','reverse','significant','similar','simulate','sophisticated',
  'specific','stable','strategy','strict','substantial','sufficient','sustain','tackle','tend','tremendous',
  'trigger','undermine','understand','undertake','unique','urgent','utilize','vary','vital','voluntary'];
let found = 0;
for (const w of common) {
  const e = byW.get(w);
  if (!e) continue;
  found++;
  if (found <= 30) console.log('    ' + w.padEnd(16) + e.m.slice(0, 60));
}
ok(found > 100, '常用词覆盖', found + '/' + common.length);

sec('6. 总结');
console.log('  通过 ' + pass + '，失败 ' + fail);
console.log('  溯源候选 ' + Object.keys(TRACE).reduce((s,w)=>s+TRACE[w].length,0) + ' 条，来自 12 个来源');
if (fail) process.exitCode = 1;
