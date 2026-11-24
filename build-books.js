// 把多本词书原始 txt 解析成 books.js（共享词条池 + 分类 + 词频派生子集）。
// 构建脚本，不进成品。运行：node build-books.js
const fs = require('fs');
const path = require('path');

const RE = /^([A-Za-z][A-Za-z.'\-]*)\s*(?:\[([^\]]*)\])?\s+(.+)$/;

// ── 解析 ─────────────────────────────────────────────────
function parseLine(line){
  let s = line.replace(/^\uFEFF/,'').trim();
  if (!s) return null;
  s = s.replace(/^[*●·•\s]+/,'');
  if (/^[\u4e00-\u9fa5]/.test(s) || /^[A-Z]$/.test(s)) return null;
  const m = s.match(RE);
  if (!m) return null;
  let w = m[1].trim().replace(/\s*\([^)]*\)\s*$/,'').trim();
  if (!/^[A-Za-z][A-Za-z.'\- ]*$/.test(w) || w.length > 24) return null;
  const ph = (m[2]||'').trim();
  let mean = m[3].trim().replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();
  if (!mean || /^[0-9.\s]*$/.test(mean)) return null;
  return { w:w.toLowerCase(), p:ph, m:mean };
}

function parseBook(file){
  const txt = fs.readFileSync(path.join('raw',file),'utf8');
  const map = new Map();
  for (const ln of txt.split(/\r?\n/)){
    const r = parseLine(ln);
    if (!r) continue;
    if (!map.has(r.w)) map.set(r.w,{w:r.w,p:r.p,m:[]});
    const e = map.get(r.w);
    if (r.p && !e.p) e.p = r.p;
    if (!e.m.includes(r.m)) e.m.push(r.m);
  }
  return [...map.values()].map(e => ({
    w:e.w, p:e.p,
    m: e.m.length>1 ? e.m.slice(0,4).map((x,i)=>'①②③④'[i]+x).join(' ') : e.m[0]
  }));
}

// 纯单词表（无释义），返回小写词数组
function parseBare(file){
  const txt = fs.readFileSync(path.join('raw',file),'utf8');
  const out = [], seen = new Set();
  for (const ln of txt.split(/\r?\n/)){
    const w = ln.replace(/^\uFEFF/,'').trim().toLowerCase();
    if (!w || !/^[a-z][a-z.'\- ]*$/.test(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
  }
  return out;
}

// COCA 带释义数据：词频顺序，一行词一行释义，分隔线切块
let cocaRank = new Map();
function parseCoca(){
  const txt = fs.readFileSync('raw/COCA_with_translation.txt','utf8');
  const rank = new Map(); let r = 0;
  let cur = null; const items = [];
  for (const ln of txt.split(/\r?\n/)){
    const s = ln.trim();
    if (s.startsWith('————')) { if (cur) items.push(cur); cur = null; continue; }
    if (!s) continue;
    if (/^[A-Za-z][A-Za-z .'-]*$/.test(s) && s.length < 30 && !/^(vt|vi|n|v|a|ad|adv|conj|prep|pron|art|int|num)\./.test(s)){
      if (cur) items.push(cur);
      cur = { w:s.toLowerCase(), ms:[] };
    } else if (cur) cur.ms.push(s);
  }
  if (cur) items.push(cur);
  // 同一个词会按词性出现多次，只保留第一次（词频最高、释义最全）
  const uniq = [];
  const seen = new Set();
  for (const it of items){
    if (seen.has(it.w)) continue;
    seen.add(it.w);
    rank.set(it.w, r++);
    uniq.push(it);
  }
  cocaRank = rank;
  return uniq.map(it => ({
    w: it.w, p:'', m: it.ms.slice(0,3).join(' ')
  })).filter(e => e.m && !/^[0-9.\s]*$/.test(e.m));
}

// ── 建词条池 ─────────────────────────────────────────────
const POOL = new Map(); // w -> {w,p,m,f,tip,ex}
function put(e){
  const k = e.w.toLowerCase();
  const cur = POOL.get(k);
  const f = cocaRank.has(k) ? cocaRank.get(k) : 99999;
  if (!cur){
    const o = { w:k, p:e.p||'', m:e.m||'', f };
    if(e.tip) o.tip = e.tip;
    if(e.ex) o.ex = e.ex;
    POOL.set(k, o);
  } else {
    if (!cur.p && e.p) cur.p = e.p;
    if ((!cur.m || cur.m.length < (e.m||'').length)) cur.m = e.m || cur.m;
    if (e.tip && !cur.tip) cur.tip = e.tip;
    if (e.ex && !cur.ex) cur.ex = e.ex;
    if (f < cur.f) cur.f = f;
  }
  return k;
}

// ── 词书清单 ─────────────────────────────────────────────
// cat 分类；desc 说明；src 词源；mode 排序方式（freq=按词频，alpha=按字母，orig=原顺序）
const BOOK_DEFS = [
  // 大学 · 四级
  { id:'cet4',      cat:'大学', group:'四级', name:'四级大全',        desc:'收录四级考纲词汇，适合系统备考', file:'CET4_edited.txt', mode:'alpha' },
  { id:'cet4core',  cat:'大学', group:'四级', name:'四级核心1500词',  desc:'按使用频率精选，优先掌握高频词', from:'cet4', n:1500, mode:'freq' },
  { id:'cet4high',  cat:'大学', group:'四级', name:'四级高频700词',   desc:'真题高频词，短期提分首选', from:'cet4', n:700, mode:'freq' },
  { id:'cet4urgent',cat:'大学', group:'四级', name:'四级应急500词',   desc:'考前冲刺，只背最常考的', from:'cet4', n:500, mode:'freq' },
  { id:'lxy4',      cat:'大学', group:'四级', name:'刘晓艳四级核心词', desc:'《你还在背单词吗》核心词条，含书中助记与真题例句', src:'liuxiaoyan', mode:'orig' },
  // 大学 · 六级
  { id:'cet6',      cat:'大学', group:'六级', name:'六级大全',        desc:'六级考纲词汇，全面覆盖', file:'CET6_edited.txt', mode:'alpha' },
  { id:'cet6core',  cat:'大学', group:'六级', name:'六级核心1500词',  desc:'按频率精选六级核心词', from:'cet6', n:1500, mode:'freq' },
  { id:'cet6high',  cat:'大学', group:'六级', name:'六级高频700词',   desc:'六级常考高频词', from:'cet6', n:700, mode:'freq' },
  { id:'cet6star',  cat:'大学', group:'六级', name:'六级星标1726词',  desc:'星标重点词，精简高效', bare:'英语六级词汇（星标，1726）.txt', mode:'freq' },
  // 大学 · 考研
  { id:'kaoyan',    cat:'大学', group:'考研', name:'考研大纲词汇',    desc:'考研英语大纲词汇，系统复习', file:'NPEE_Wordlist.txt', mode:'alpha' },
  { id:'kaoyancore',cat:'大学', group:'考研', name:'考研核心3000词',  desc:'真题高频核心词，优先突破', from:'kaoyan', n:3000, mode:'freq' },
  // 大学 · 英专
  { id:'major',     cat:'大学', group:'英专', name:'专四专八词汇',    desc:'英语专业四八级词汇', file:'英语专业四八级词汇表.txt', mode:'alpha' },
  { id:'major8',    cat:'大学', group:'英专', name:'专八星标词汇',    desc:'专八高频星标词', file:'英语专业星标八级词汇.txt', mode:'alpha' },
  // 大学 · 专升本（借四级核心）
  { id:'zhuansheng',cat:'大学', group:'专升本', name:'专升本核心词',  desc:'专升本常考核心词汇', from:'cet4', n:2000, mode:'freq' },
  // 留学
  { id:'toefl',     cat:'留学', group:'托福', name:'托福词汇',        desc:'TOEFL 考试词汇', file:'TOEFL_abridged.txt', mode:'alpha' },
  { id:'gre',       cat:'留学', group:'GRE',  name:'GRE词汇',         desc:'GRE 考试词汇', file:'GRE_8000_Words.txt', mode:'alpha' },
  { id:'grecore',   cat:'留学', group:'GRE',  name:'GRE核心3000',     desc:'剔除基础词后的 GRE 核心', file:'GRE_delete_CET4+6+TOEFL.txt', mode:'alpha' },
  // 高中 / 初中 / 小学
  { id:'gaokao',    cat:'高中', group:'高考', name:'高考词汇',        desc:'高中英语考纲词汇', bare:'Highschool_edited.txt', mode:'alpha' },
  { id:'zhongkao',  cat:'初中', group:'中考', name:'中考词汇',        desc:'初中英语考纲词汇', file:'中考英语词汇表.txt', mode:'alpha' },
  { id:'primary',   cat:'小学', group:'小学', name:'小学词汇',        desc:'小学英语大纲词汇', bare:'小学英语大纲词汇.txt', mode:'alpha' },
  // 综合 · COCA 词频分级
  { id:'coca1000',  cat:'综合', group:'COCA', name:'COCA 高频1000',   desc:'英语母语最常用1000词', from:'coca', n:1000, mode:'freq' },
  { id:'coca3000',  cat:'综合', group:'COCA', name:'COCA 高频3000',   desc:'覆盖日常交流大部分用词', from:'coca', n:3000, mode:'freq' },
  { id:'coca5000',  cat:'综合', group:'COCA', name:'COCA 高频5000',   desc:'进阶常用词，阅读更顺畅', from:'coca', n:5000, mode:'freq' },
  { id:'coca10000', cat:'综合', group:'COCA', name:'COCA 高频10000',  desc:'大规模扩充词汇量', from:'coca', n:10000, mode:'freq' }
];

// ── 主流程 ───────────────────────────────────────────────
const cocaWords = parseCoca();
console.log('COCA 词条 '+cocaWords.length+'，词频序号 '+cocaRank.size);

const byId = {};
// 先解析 file 型词书
for (const d of BOOK_DEFS){
  if (!d.file) continue;
  const arr = parseBook(d.file);
  const keys = arr.map(put);
  byId[d.id] = keys;
  console.log(d.name+': '+keys.length+' 词');
}
// COCA 整库
byId.coca = cocaWords.map(put);
// 刘晓艳四级核心词：按原书顺序，词条自带助记与例句
{
  global.window = {};
  eval(fs.readFileSync('liuxiaoyan.js','utf8'));
  const keys = [];
  for(const e of global.window.LXY_WORDS){
    if(!e.m) continue;
    keys.push(put(e));
  }
  byId.lxy4 = keys;
  console.log('刘晓艳四级核心词: '+keys.length+' 词');
}
// bare 型：用已入池的词回填释义
for (const d of BOOK_DEFS){
  if (!d.bare) continue;
  const keys = [];
  for (const w of parseBare(d.bare)){
    if (POOL.has(w)) keys.push(w);       // 池里有释义才收
    else put({w, p:'', m:'大纲词'});      // 查不到释义的给占位，避免空卡
    if (!keys.includes(w)) keys.push(w);
  }
  byId[d.id] = keys;
  console.log(d.name+': '+keys.length+' 词');
}

// 派生子集：按词频排序取前 n；跳过超基础词（the/be/and 这类不用背）；
// 没词频的排最后，池里有的才收。
function derive(src, n, skipBasic){
  const arr = byId[src].slice().filter(w=>!skipBasic || POOL.get(w).f >= BASIC_SKIP);
  arr.sort((a,b)=>{
    const fa = POOL.get(a).f, fb = POOL.get(b).f;
    if (fa!==fb) return fa-fb;
    return a.localeCompare(b);
  });
  return arr.slice(0,n);
}
const BASIC_SKIP = 400; // COCA 前 400 是 the/be/of 等功能词，不必作为"高频词"来背
for (const d of BOOK_DEFS){
  if (!d.from) continue;
  byId[d.id] = derive(d.from, d.n, d.from!=='coca');
  console.log(d.name+': '+byId[d.id].length+' 词（源自 '+d.from+'，按词频）');
}

// 输出：pool 数组 + 词书（只存索引）+ 分类
const poolArr = [...POOL.values()];
const idxOf = new Map(poolArr.map((e,i)=>[e.w,i]));
const cats = [];
const catMap = new Map();
for (const d of BOOK_DEFS){
  if (!catMap.has(d.cat)){ catMap.set(d.cat,[]); cats.push({name:d.cat, groups:[]}); }
  const cat = cats.find(c=>c.name===d.cat);
  let g = cat.groups.find(x=>x.name===d.group);
  if (!g){ g={name:d.group, books:[]}; cat.groups.push(g); }
  g.books.push(d.id);
}
const books = BOOK_DEFS.map(d=>({
  id:d.id, name:d.name, cat:d.cat, group:d.group, desc:d.desc||'',
  idx: byId[d.id].map(w=>idxOf.get(w))
}));

const out = '/* 多词书数据 · 自动生成，勿手改 */\n'
  + 'window.WORD_POOL = ' + JSON.stringify(poolArr) + ';\n'
  + 'window.WORD_CATS = ' + JSON.stringify(cats) + ';\n'
  + 'window.WORD_BOOKS = ' + JSON.stringify(books) + ';\n'
  + '(function(){\n'
  + '  var P = window.WORD_POOL;\n'
  + '  window.WORD_BOOKS.forEach(function(b){\n'
  + '    Object.defineProperty(b, "words", { get:function(){\n'
  + '      if(!b._w) b._w = b.idx.map(function(i){ return P[i]; });\n'
  + '      return b._w;\n'
  + '    }});\n'
  + '  });\n'
  + '})();\n';
fs.writeFileSync('books.js',out,'utf8');
console.log('\n词条池 '+poolArr.length+' 唯一词，'+books.length+' 本词书，'+cats.length+' 个分类');
console.log('生成 books.js: '+(Buffer.byteLength(out)/1024/1024).toFixed(2)+' MB');
