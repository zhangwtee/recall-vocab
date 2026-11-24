// 词库数据体检：检查结构完整性、一致性、内容质量与来源溯源。
// 运行：node audit-data.js（可重复运行，不修改任何数据）
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0, warn = 0;
const failures = [];
const P = s => console.log(s);
function ok(cond, label, detail){
  P((cond ? '  [OK] ' : '  [!!] ') + label + (detail ? '  ' + detail : ''));
  if(cond) pass++; else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); }
}
function note(label, detail){ warn++; P('  [--] ' + label + (detail ? '  ' + detail : '')); }
function section(t){ P('\n=== ' + t + ' ==='); }
function load(file){
  global.window = global;
  vm.runInThisContext(fs.readFileSync(file,'utf8'), { filename:file });
}

// ── 1. 文件与部署同步 ─────────────────────────────────────
section('1. 文件与部署同步');
const files = ['books.js','examples.js','liuxiaoyan.js','words.js',
               'data/books.js','data/examples.js','index.html','loader.js'];
for(const f of files) ok(fs.existsSync(f), f + ' 存在');
if(files.every(f => fs.existsSync(f))){
  ok(fs.readFileSync('books.js').equals(fs.readFileSync('data/books.js')),
     'data/books.js 与源 books.js 字节一致');
  ok(fs.readFileSync('examples.js').equals(fs.readFileSync('data/examples.js')),
     'data/examples.js 与源 examples.js 字节一致');
  const html = fs.readFileSync('index.html','utf8');
  ok(html.indexOf('window.WORD_POOL = [') < 0, 'index.html 未内嵌完整词库');
  ok(html.indexOf('window.CET4_WORDS = [') >= 0, 'index.html 保留内置兜底词表');
  for(const ph of ['/*__FSRS__*/','/*__WORDS__*/','/*__BOOKS__*/','/*__EXAMPLES__*/','/*__LOADER__*/'])
    ok(html.indexOf(ph) < 0, '构建占位符已替换: ' + ph);
  const loader = fs.readFileSync('loader.js','utf8');
  ok(loader.indexOf("loadAsset('books.js'") >= 0 &&
     loader.indexOf("loadAsset('examples.js'") >= 0 &&
     loader.indexOf("'./data'") >= 0,
     '加载器从 ./data 取 books.js 与 examples.js');
}

// ── 2. 数据文件可解析 ─────────────────────────────────────
section('2. 数据文件可解析');
for(const f of ['books.js','examples.js','liuxiaoyan.js','words.js']){
  try{ load(f); ok(true, f + ' 语法与执行正常'); }
  catch(e){ ok(false, f + ' 加载失败', e.message); }
}

const pool = global.WORD_POOL || [];
const books = global.WORD_BOOKS || [];
const cats  = global.WORD_CATS  || [];
const exArr = global.WORD_EXAMPLES || [];
const exMap = global._EX_MAP || {};
const lxy   = global.LXY_WORDS || [];
const lxyEx = global.LXY_EXAMPLES || {};
const byW   = new Map(pool.map(e => [e.w, e]));

// ── 3. 词条池 ─────────────────────────────────────────────
section('3. 词条池结构');
ok(pool.length > 20000, '词条池规模', pool.length + ' 词');
const wordRe = /^[a-z\u00c0-\u024f][a-z\u00c0-\u024f.'\- ]*$/;  // 含 café/entrée 等英语借词
const badW = [], badM = [], badF = [], badPh = [], dupW = [], seen = new Set();
for(const [i,e] of pool.entries()){
  if(!e || typeof e.w !== 'string' || !wordRe.test(e.w) || e.w.length > 24)
    badW.push(i + ':' + JSON.stringify(e && e.w));
  if(!e.m || typeof e.m !== 'string' || !e.m.trim() || /^[0-9.\s]*$/.test(e.m))
    badM.push(i + ':' + e.w);
  if(typeof e.f !== 'number' || !isFinite(e.f) || e.f < 0) badF.push(i + ':' + e.w);
  if(e.p && /[\u4e00-\u9fa5]/.test(e.p)) badPh.push(e.w);
  if(seen.has(e.w)) dupW.push(e.w);
  seen.add(e.w);
}
ok(!badW.length, '单词字段合法', badW.slice(0,5).join(','));
ok(!badM.length, '释义非空且非纯数字', badM.slice(0,5).join(','));
ok(!badF.length, '词频数值有效', badF.slice(0,5).join(','));
ok(!badPh.length, '音标不含中文字符', badPh.slice(0,5).join(','));
ok(!dupW.length, '词池无重复单词', dupW.slice(0,5).join(','));
const weirdM = pool.filter(e => /[\uFFFD]/.test(e.m) || /<[a-zA-Z]/.test(e.m));
ok(!weirdM.length, '无乱码/HTML标签释义', weirdM.slice(0,3).map(e=>e.w+':'+e.m.slice(0,40)).join(' | '));
const longM = pool.filter(e => e.m.length > 300);
if(longM.length) note('超长释义（短语搭配多，非错误）', longM.length + ' 条，最长 ' + Math.max.apply(null, longM.map(e=>e.m.length)) + ' 字');
const badPhChar = pool.filter(e => e.p && /[\u222B\u04D9\u201A\u03B5\u0454\uF000-\uF0FF\u4e00-\u9fa5]/.test(e.p));
ok(!badPhChar.length, '音标无 OCR/字体错位字符', badPhChar.slice(0,5).map(e=>e.w+':'+e.p).join(' | '));
const counts = {
  '带音标': pool.filter(e=>e.p).length,
  '带释义': pool.filter(e=>e.m).length,
  '带书中助记': pool.filter(e=>e.tip).length,
  '带词库例句': pool.filter(e=>e.ex).length
};
P('  字段覆盖：' + Object.entries(counts).map(([k,v])=>k+' '+v).join('，'));

// ── 4. 词书结构 ───────────────────────────────────────────
section('4. 词书结构');
ok(books.length === 26, '词书数量', books.length + ' 本');
const ids = new Set(), dupId = [];
for(const b of books){ if(ids.has(b.id)) dupId.push(b.id); ids.add(b.id); }
ok(!dupId.length, '词书 id 唯一', dupId.join(','));
ok(ids.has('cet4'), '默认词书 cet4 存在');
const badIdx = [], dupIdx = [], badGetter = [], emptyBook = [];
for(const b of books){
  const ix = b.idx || [];
  if(!ix.length) emptyBook.push(b.id);
  if(ix.some(i => !Number.isInteger(i) || i < 0 || i >= pool.length)) badIdx.push(b.id);
  if(new Set(ix).size !== ix.length) dupIdx.push(b.id);
  if(!b.words || b.words.length !== ix.length || b.words.some((w,i)=>w !== pool[ix[i]])) badGetter.push(b.id);
}
ok(!badIdx.length, '所有索引落在词池范围内', badIdx.join(','));
ok(!dupIdx.length, '书内无重复索引', dupIdx.join(','));
ok(!badGetter.length, 'words 展开与 idx 一致', badGetter.join(','));
ok(!emptyBook.length, '无空词书', emptyBook.join(','));
const catBooks = new Set();
for(const c of cats) for(const g of (c.groups||[])) for(const id of (g.books||[])) catBooks.add(id);
const unlisted = books.map(b=>b.id).filter(id=>!catBooks.has(id));
const orphan = [...catBooks].filter(id=>!ids.has(id));
ok(!unlisted.length, '每本书都在分类中登记', unlisted.join(','));
ok(!orphan.length, '分类中无不存在的书', orphan.join(','));
P('  分类：' + cats.map(c=>c.name+'('+c.groups.reduce((s,g)=>s+g.books.length,0)+')').join(' '));
P('  词数：' + books.map(b=>b.id+'='+b.idx.length).join(' '));

// ── 5. 派生子集 ───────────────────────────────────────────
section('5. 派生子集');
function wordsOf(id){ const b = books.find(x=>x.id===id); return b ? b.idx.map(i=>pool[i].w) : []; }
const fOf = w => byW.get(w).f;
const deriveDefs = [
  ['cet4core','cet4',1500], ['cet4high','cet4',700], ['cet4urgent','cet4',500],
  ['zhuansheng','cet4',2000], ['cet6core','cet6',1500], ['cet6high','cet6',700],
  ['kaoyancore','kaoyan',3000]
];
for(const [id,parent,n] of deriveDefs){
  const arr = wordsOf(id), par = new Set(wordsOf(parent));
  ok(arr.length > 0 && arr.length <= n, id + ' 数量合规', arr.length + '/' + n);
  ok(arr.every(w=>par.has(w)), id + ' 全部来自 ' + parent);
  ok(new Set(arr).size === arr.length, id + ' 无重复词');
}
const cocaIds = ['coca1000','coca3000','coca5000','coca10000'];
const cocaSets = cocaIds.map(id=>new Set(wordsOf(id)));
for(let i=0;i<cocaIds.length;i++){
  const arr = wordsOf(cocaIds[i]);
  // 超基础功能词后置，其余按词频升序：分两段分别检查非递减
  let sorted = true;
  for(let j=1;j<arr.length;j++){
    const a = fOf(arr[j-1]), b2 = fOf(arr[j]);
    if(a >= 400 && a < 99999 && b2 >= 400 && b2 < 99999 && a > b2) sorted = false;
    if(a >= 99999 && b2 < 99999) sorted = false;
  }
  ok(sorted, cocaIds[i] + ' 按常用度升序（基础词后置）');
  if(i) ok([...cocaSets[i-1]].every(w=>cocaSets[i].has(w)), cocaIds[i] + ' 包含 ' + cocaIds[i-1]);
}
const basic = ['the','be','and','of','a','to','in','is','you','that','it','he','was','for','on','are','as','with','his','they','at','this'];
for(const id of ['cet4core','cet4high','cet4urgent','kaoyancore','cet6core','cet6high','cet6star'])
  ok(!wordsOf(id).some(w=>basic.includes(w)), id + ' 未混入超基础功能词');

// ── 6. 释义占位与异常 ─────────────────────────────────────
section('6. 释义占位与异常');
const ph = pool.filter(e=>e.m === '大纲词');
ok(ph.length <= 80, '占位释义已压到低位', ph.length + ' 条');
for(const id of ['gaokao','zhongkao','primary','cet6star']){
  const arr = wordsOf(id), n = arr.filter(w=>byW.get(w).m === '大纲词').length;
  note(id + ' 占位释义占比', n + '/' + arr.length);
}

// ── 7. 例句库 ─────────────────────────────────────────────
section('7. 例句库');
ok(exArr.length > 10000, '例句库规模', exArr.length + ' 词');
const badEx = [], dupEx = [], exSeen = new Set();
for(const [w,sents] of exArr){
  if(!byW.has(w)) badEx.push('不在池:'+w);
  if(!Array.isArray(sents) || !sents.length) badEx.push('空:'+w);
  else for(const s of sents)
    if(!Array.isArray(s) || s.length !== 2 || !s[0] || !s[1]) badEx.push('结构:'+w);
  if(exSeen.has(w)) dupEx.push(w);
  exSeen.add(w);
}
ok(!badEx.length, '例句结构与词引用有效', badEx.slice(0,5).join(','));
ok(!dupEx.length, '例句词无重复', dupEx.slice(0,5).join(','));
ok(typeof global.getExamples === 'function', 'getExamples 接口可用');
if(pool.length){
  const w = pool[0].w, r = global.getExamples(w);
  ok(r === null || Array.isArray(r), '接口返回类型正确', w + ' → ' + JSON.stringify(r));
}

// ── 8. 刘晓艳词书溯源 ─────────────────────────────────────
section('8. 刘晓艳词书溯源');
const dir = 'raw/liuxiaoyan';
const srcFiles = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(x=>/^u\d+-l\d+\.json$/.test(x)).sort() : [];
ok(srcFiles.length === 40, '原始课次文件数', srcFiles.length);
const srcMap = new Map();
let rawTotal = 0;
for(const f of srcFiles){
  const j = JSON.parse(fs.readFileSync(dir+'/'+f,'utf8'));
  for(const g of (j.groups||[])) for(const e of (g.entries||[])){
    rawTotal++;
    const w = String(e.word||'').trim().toLowerCase();
    if(w && /^[a-z][a-z.'\- ]*$/.test(w) && !srcMap.has(w)) srcMap.set(w,e);
  }
}
ok(rawTotal >= 2300, '原始词条总数', rawTotal);
ok(lxy.length === srcMap.size, 'LXY_WORDS 与原始去重词数一致', lxy.length + '/' + srcMap.size);
const mism = [];
for(const e of lxy){
  const s = srcMap.get(e.w);
  if(!s){ mism.push('源缺失:'+e.w); continue; }
  const pr = (s.prons||[]).find(x=>x.ipa);
  const p = pr ? String(pr.ipa).replace(/^\/|\/$/g,'') : '';
  if(e.p !== p) mism.push('音标:'+e.w);
  const senses = (s.prons||[]).map(x=>(x.senses||[]).map(y=>(y.pos||'')+String(y.mean||'').replace(/\[\[|\]\]/g,'')).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean).sort((a,b)=>b.length-a.length);
  if(e.m !== (senses[0]||'')) mism.push('释义:'+e.w);
}
ok(!mism.length, 'LXY_WORDS 字段与源文件逐条一致', mism.slice(0,5).join(','));
const lxyBook = books.find(b=>b.id==='lxy4');
const seq = lxyBook ? lxyBook.idx.map(i=>pool[i].w) : [];
const expected = lxy.filter(e=>e.m).map(e=>e.w);
ok(JSON.stringify(seq) === JSON.stringify(expected), 'lxy4 词序与原书课次一致', seq.length + '/' + expected.length);
const lxyTip = lxy.filter(e=>e.tip).length, poolTip = pool.filter(e=>e.tip).length;
ok(poolTip === lxyTip, '书中助记全部并入词池', poolTip + '/' + lxyTip);
const exKeys = Object.keys(lxyEx);
// 词池里 ex 存单条 [en,zh]，LXY_EXAMPLES 存的是 [ [en,zh] ]，比较首条即可
const missingEx = exKeys.filter(w=>!byW.has(w) || !byW.get(w).ex ||
  JSON.stringify(byW.get(w).ex) !== JSON.stringify(lxyEx[w][0]));
ok(!missingEx.length, '书中例句全部并入词池', missingEx.slice(0,5).join(','));

// ── 8b. 官方四六级词书溯源 ────────────────────────────────
section('8b. 官方四六级词书溯源（教育部2016修订版）');
function readOfficial(f){
  if(!fs.existsSync('raw/'+f)) return [];
  return fs.readFileSync('raw/'+f,'utf8').split(/\r?\n/).map(x=>x.trim().toLowerCase()).filter(Boolean);
}
const off4 = readOfficial('official-cet4.txt'), off6 = readOfficial('official-cet6.txt');
ok(off4.length > 5000, '官方四级词形表规模', off4.length);
ok(off6.length > 1200, '官方六级新增词形表规模', off6.length);
ok(!off4.some(w=>off6.indexOf(w)>=0), '官方四级与六级新增无交叉');
const offBook = id => { const b = books.find(x=>x.id===id); return b ? b.idx.map(i=>pool[i].w) : []; };
const ob4 = offBook('officialCet4'), ob6 = offBook('officialCet6');
ok(ob4.length > 4500 && ob4.length <= off4.length, '官方四级词书规模', ob4.length + '/' + off4.length);
ok(ob6.length > 1200 && ob6.length <= off6.length, '官方六级新增词书规模', ob6.length + '/' + off6.length);
const ob4Src = ob4.filter(w=>off4.indexOf(w)<0), ob6Src = ob6.filter(w=>off6.indexOf(w)<0);
ok(!ob4Src.length && !ob6Src.length, '官方词书全部词形来自官方 PDF', ob4Src.concat(ob6Src).slice(0,5).join(','));
ok(!ob4.some(w=>ob6.indexOf(w)>=0), '两本官方词书无重复词形');
const obEmpty = ob4.concat(ob6).filter(w=>!byW.get(w) || !byW.get(w).m || byW.get(w).m==='大纲词');
ok(!obEmpty.length, '官方词书无空释义或占位', obEmpty.slice(0,5).join(','));

// ── 9. 内容抽样 ───────────────────────────────────────────
section('9. 常见词释义抽样（供人工核对）');
for(const w of ['abandon','ability','absolute','absorb','abstract','academic','accelerate','access','accommodate','accompany','achieve','adapt']){
  const e = byW.get(w);
  P('  ' + w.padEnd(12) + (e ? (e.p ? '['+e.p+'] ' : '') + e.m.slice(0,90) : '<缺失>'));
}

// ── 10. 解析回归与权威参考 ────────────────────────────────
section('10. 解析回归与权威参考');
// 旧解析器能收、新解析器一度丢掉的常见词，以及新补回的漏词
const must = ['bike','mom','exam','fridge','arbitrary','continual','courtesy',
              'authorise','axe','adapter','civilisation','entrée','armour','traveller'];
const miss = must.filter(w=>!byW.has(w) || !byW.get(w).m || byW.get(w).m === '大纲词');
ok(!miss.length, '回归词与新增词释义完整', miss.join(','));
const refN = pool.filter(e=>e.ref && e.ref.m).length;
ok(refN > 1000, '牛津高阶参考释义已并入', refN + ' 词');
const refTrad = pool.filter(e=>e.ref && /[體態國學實價觀點網頁車馬鳥魚龍鳳裝飾醫藥]/.test(e.ref.m));
ok(!refTrad.length, '参考释义繁体字已转简体', refTrad.slice(0,3).map(e=>e.w).join(','));

// ── 11. 义项顺序：常用义在前 ──────────────────────────────
section('11. 义项顺序（常用义在前）');
// 人工核校过的同形异义词，最常用义必须排首位
const senseFirst = {
  well:'好', march:'行军', miss:'未看到', pick:'拾', pitch:'投',
  swallow:'吞', sound:'声音', spring:'春天', rock:'岩', used:'过去常常'
};
for(const [w,key] of Object.entries(senseFirst)){
  const e = byW.get(w);
  const first = e ? e.m.split(/[①-⑨]/).filter(Boolean)[0] || e.m : '';
  ok(e && first.indexOf(key) >= 0, w + ' 常用义「'+key+'」在首位', first.slice(0,24));
}

// ── 12. 词序：常用词在前 ──────────────────────────────────
section('12. 词序（常用词在前）');
const BASIC_SKIP = 400;
for(const b of books){
  const ws = b.words;
  if(b.id === 'lxy4'){
    ok(ws[0].w === 'space', '刘晓艳词书保留原书课次首词', ws[0].w);
    continue;
  }
  // 超基础功能词（the/be/and）必须排在后段，不占开头
  ok(ws[0].f >= BASIC_SKIP || ws[0].f >= 99999,
     b.id + ' 首词不是超基础功能词', ws[0].w + '(' + ws[0].f + ')');
  // 前 100 词中，有词频的部分必须按 COCA 顺序非递减
  let prev = 0, bad = '';
  for(const e of ws.slice(0,100)){
    if(e.f >= 99999) continue;
    if(e.f < prev){ bad = e.w + '(' + e.f + ')<' + prev; break; }
    prev = e.f;
  }
  ok(!bad, b.id + ' 前 100 词按常用度升序', bad);
}

// ── 总结 ──────────────────────────────────────────────────
section('总结');
P('通过 ' + pass + ' 项，失败 ' + fail + ' 项，提示 ' + warn + ' 项');
if(fail){
  P('失败项：');
  failures.forEach((f,i)=>P('  ' + (i+1) + '. ' + f));
  process.exitCode = 1;
}
