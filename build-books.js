// 把多本词书原始 txt 解析成 books.js（共享词条池 + 分类 + 词频派生子集）。
// 构建脚本，不进成品。运行：node build-books.js
const fs = require('fs');
const path = require('path');

const RE = /^([A-Za-z][A-Za-z.'\-]*)\s*(?:\[([^\]]*)\])?\s+(.+)$/;
const POS_RE = /\s+(?:n|v|vt|vi|adj|a|ad|adv|art|prep|conj|pron|int|num|noun|verb|adjective|adverb|exclamation)\.?/;
const HAS_IPA = /[\u02c8\u02cc\u0250-\u02afːˑɑæəɪɔʊʌɛ]/;

function finish(w, ph, mean){
  w = String(w||'').trim();
  if (!/^[A-Za-z\u00c0-\u024f][A-Za-z\u00c0-\u024f.'\- ]*$/.test(w) || w.length > 24) return null;
  mean = String(mean||'').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();
  if (!mean || /^[0-9.\s]*$/.test(mean)) return null;
  return { w:w.toLowerCase(), p:String(ph||'').trim(), m:mean };
}

// ── 解析 ─────────────────────────────────────────────────
// 原始词表混着三种格式，旧格式优先以保证原有词条不丢：
//   word [ipa] 释义
//   word IPA /词性. 释义        （六级、英专）
//   word = 同义词 [ipa] 释义     （中考）
// 兜底支持逗号多拼写、全角标点、重音字符、括号变形、紧贴音标、词尾数字。
function parseLine(line){
  let s = line.replace(/^\uFEFF/,'').trim();
  if (!s) return null;
  s = s.replace(/^[*●·•\s]+/,'');
  if (/^[\u4e00-\u9fa5]/.test(s) || /^[A-Z]$/.test(s)) return null;

  const old = s.match(RE);
  if (old){
    const w = old[1].trim().replace(/\s*\([^)]*\)\s*$/,'').trim();
    let ph = (old[2]||'').trim(), mean = old[3];
    // `arbitrary ˈɑːbɪtrərɪ /adj. ...` 这种没有方括号的音标，顺手提出来
    if (!ph){
      const slash = mean.indexOf('/');
      if (slash > 0 && /^\/(n|v|vt|vi|adj|a|ad|adv|art|prep|conj|pron|int|num)\./.test(mean.slice(slash))){
        const head = mean.slice(0, slash).trim();
        if (HAS_IPA.test(head) || /^[a-z]+$/.test(head)){
          ph = head;
          mean = mean.slice(slash + 1);
        }
      }
    }
    const r = finish(w, ph, mean);
    if (r) return r;
  }

  let ph = '', wordPart = '', meanPart = '';
  const pm = s.match(/^(.+?)\s*(?:\[([^\]]*)\]|\/([^/]+)\/)\s*(.*)$/);
  if (pm && pm[4].trim()){
    wordPart = pm[1].trim();
    ph = (pm[2] || pm[3] || '').trim();
    meanPart = pm[4].trim();
  } else {
    const idx = s.search(POS_RE);
    if (idx < 0) return null;
    wordPart = s.slice(0, idx).trim();
    meanPart = s.slice(idx).trim();
  }
  if (!meanPart) return null;
  let w = wordPart.replace(/[（(][^)）]*[)）]/g,'')
                  .split(/[,，=]/)[0]
                  .replace(/[\u02c8\u02cc]/g, "'")
                  .replace(/[0-9]+$/, '')
                  .trim();
  // `authorise authorize [...]` 这类并列拼写只取第一个；
  // `à la carte` 这类重音开头的词组保留整体。
  if (!/[\u00c0-\u024f]/.test(w.charAt(0))) w = w.split(/\s+/)[0];
  return finish(w, ph, meanPart);
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
    if (!w || !/^[a-z\u00c0-\u024f][a-z\u00c0-\u024f.'\- ]*$/.test(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
  }
  return out;
}

// COCA 释义来自词典爬取，常把 "(Apple)人名；(英)阿普尔" 这类无关义项也带上。
// 按词性切段，含人名/地名/音译的整段丢弃；领域标记如 [经管] [美俚] 一并去掉。
function cleanCocaMeaning(s){
  s = String(s||'').replace(/\[[^\]]{1,12}\]/g,'');
  const parts = s.split(/((?:n|v|vt|vi|adj|a|ad|adv|art|prep|conj|pron|int|num)\.\s*)/);
  const out = [];
  for (let i=1; i<parts.length; i+=2){
    const body = parts[i+1] || '';
    if (/人名|地名|音译|姓氏/.test(body)) continue;
    if (!body.trim()) continue;
    out.push(parts[i] + body.trim());
  }
  return out.join(' ').trim();
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
    w: it.w, p:'', m: cleanCocaMeaning(it.ms.slice(0,3).join(' '))
  })).filter(e => e.m && !/^[0-9.\s]*$/.test(e.m));
}

// ── 建词条池 ─────────────────────────────────────────────
// 原始词表里有 OCR/字体编码错位的音标符号，入库前统一规范化。
// 含中文或私有区字符的音标视为无效，让后续来源（如标准 IPA）有机会填入。
const PH_FIX = {
  '\u222B':'ʃ',  // ∫ → ʃ
  '\u04D9':'ə',  // ә → ə
  '\u201A':'ˌ',  // ‚ → ˌ
  '\u03B5':'e',  // ε → e
  '\u0454':'e',  // є → e
  '\uF067':'ɡ',  // Wingdings 残留 → ɡ
  '\uF063':'k'   // Wingdings 残留 → k
};
function cleanPh(p){
  if(!p) return '';
  let s = String(p);
  for(const k in PH_FIX) s = s.split(k).join(PH_FIX[k]);
  if(/[\u4e00-\u9fa5\uF000-\uF0FF]/.test(s)) return '';
  return s.replace(/^[,\s]+|[,\s]+$/g,'').trim();
}
const POOL = new Map(); // w -> {w,p,m,f,tip,ex}
// 可选溯源：AUDIT_TRACE=1 时记录每个词的每条候选释义来自哪个源，
// 供 audit-meaning.js 判断是否有正确释义被合并逻辑覆盖。
const TRACE = process.env.AUDIT_TRACE === '1';
const TRACE_LOG = {};
let currentSrc = '';
// 合并释义不能按长度选：考试词书简洁但准确，英专/GRE 有 OCR 错字，
// COCA 是词典爬虫。按来源可信度优先，同级才比长度。
const SRC_PRI = {
  cet4:12, lxy4:11, cet6:10, zhongkao:10, primary:10, gaokao:10,
  kaoyan:9, major:5, major8:5, toefl:5, gre:4, coca:3, 'variant-fix':2
};
const SRC_OF = new Map();
function put(e){
  const k = e.w.toLowerCase();
  if (TRACE) (TRACE_LOG[k] = TRACE_LOG[k] || []).push({ src:currentSrc, m:e.m||'' });
  const cur = POOL.get(k);
  const f = cocaRank.has(k) ? cocaRank.get(k) : 99999;
  if (!cur){
    const o = { w:k, p:cleanPh(e.p), m:e.m||'', f };
    if(e.tip) o.tip = e.tip;
    if(e.ex) o.ex = e.ex;
    POOL.set(k, o);
    SRC_OF.set(k, currentSrc);
  } else {
    if (!cur.p && e.p) cur.p = cleanPh(e.p);
    const pri = SRC_PRI[currentSrc] || 0, oldPri = SRC_PRI[SRC_OF.get(k)] || 0;
    if (!cur.m || cur.m === '大纲词' || pri > oldPri || (pri === oldPri && cur.m.length < (e.m||'').length)){
      cur.m = e.m || cur.m;
      SRC_OF.set(k, currentSrc);
    }
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
  // 教育部《全国大学英语四、六级考试大纲（2016 修订版）》官方词表：
  // 从官方 PDF 提取，保留 ★ 分级；官方表只有词形，释义复用词池。
  { id:'officialCet4',cat:'大学', group:'四级', name:'官方四级大纲(2016)', desc:'教育部2016版考纲四级词目，不带★部分', bare:'official-cet4.txt', mode:'freq' },
  { id:'cet4',      cat:'大学', group:'四级', name:'四级大全',        desc:'收录四级考纲词汇，适合系统备考', file:'CET4_edited.txt', mode:'alpha' },
  { id:'cet4core',  cat:'大学', group:'四级', name:'四级核心1500词',  desc:'按使用频率精选，优先掌握高频词', from:'cet4', n:1500, mode:'freq' },
  { id:'cet4high',  cat:'大学', group:'四级', name:'四级高频700词',   desc:'真题高频词，短期提分首选', from:'cet4', n:700, mode:'freq' },
  { id:'cet4urgent',cat:'大学', group:'四级', name:'四级应急500词',   desc:'考前冲刺，只背最常考的', from:'cet4', n:500, mode:'freq' },
  { id:'lxy4',      cat:'大学', group:'四级', name:'刘晓艳四级核心词', desc:'《你还在背单词吗》核心词条，含书中助记与真题例句', src:'liuxiaoyan', mode:'orig' },
  // 大学 · 六级
  { id:'officialCet6',cat:'大学', group:'六级', name:'官方六级新增(2016)', desc:'教育部2016版考纲带★词目，六级比四级多出的部分', bare:'official-cet6.txt', mode:'freq' },
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
  currentSrc = d.id;
  const arr = parseBook(d.file);
  const keys = arr.map(put);
  byId[d.id] = keys;
  console.log(d.name+': '+keys.length+' 词');
}
// COCA 整库
currentSrc = 'coca';
byId.coca = cocaWords.map(put);
// 刘晓艳四级核心词：按原书顺序，词条自带助记与例句
{
  currentSrc = 'lxy4';
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
  currentSrc = d.id;
  const keys = [];
  for (const w of parseBare(d.bare)){
    if (POOL.has(w)) keys.push(w);       // 池里有释义才收
    else put({w, p:'', m:'大纲词'});      // 查不到释义的给占位，避免空卡
    if (!keys.includes(w)) keys.push(w);
  }
  byId[d.id] = keys;
  console.log(d.name+': '+keys.length+' 词');
}

// 英美拼写变体：词表里给的是英式拼写，词池里只有美式词条时曾填「大纲词」占位。
// 按常见拼写差异生成候选，命中真实释义则继承，避免假释义。
function usCandidates(w){
  const out = [];
  function add(x){ if(x && x !== w && out.indexOf(x) < 0) out.push(x); }
  if(/our$/.test(w)) add(w.replace(/our$/,'or'));
  if(/our/.test(w)) add(w.replace(/our/,'or'));
  if(/isation$/.test(w)) add(w.replace(/isation$/,'ization'));
  else if(/ise$/.test(w)) add(w.replace(/ise$/,'ize'));
  if(/yse$/.test(w)) add(w.replace(/yse$/,'yze'));
  if(/re$/.test(w)) add(w.replace(/re$/,'er'));
  if(/ce$/.test(w)) add(w.replace(/ce$/,'se'));
  if(w.indexOf('ae') >= 0) add(w.replace(/ae/,'e'));
  if(w.indexOf('oeu') >= 0) add(w.replace(/oeu/,'eu'));
  else if(w.indexOf('oe') >= 0) add(w.replace(/oe/,'e'));
  if(/ll/.test(w)) add(w.replace(/ll(er|ing|ed|ery)$/,'l$1'));
  if(/l(er|ing|ed|ful)$/.test(w) && !/ll/.test(w)) add(w.replace(/l(er|ing|ed|ful)$/,'ll$1'));
  if(/^fulfil$/.test(w)) add('fulfill');
  if(/gh/.test(w)) add(w.replace(/gh/,''));
  return out;
}
let fixedVar = 0;
currentSrc = 'variant-fix';
for (const [w,e] of POOL){
  if (e.m !== '大纲词') continue;
  for (const c of usCandidates(w)){
    const src = POOL.get(c);
    if (src && src.m && src.m !== '大纲词'){
      e.m = src.m;
      if (!e.p && src.p) e.p = src.p;
      fixedVar++;
      break;
    }
  }
}
console.log('英美拼写补释义 '+fixedVar+' 词');

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

// ── 牛津高阶参考释义 ─────────────────────────────────────
// OALD8 精简数据只对部分词有条目，且原文是繁体；作为参考字段附上，不覆盖主释义。
const T2S = {
  '體':'体','態':'态','國':'国','學':'学','實':'实','價':'价','觀':'观','點':'点','網':'网','頁':'页',
  '車':'车','馬':'马','鳥':'鸟','魚':'鱼','龍':'龙','鳳':'凤','裝':'装','飾':'饰','醫':'医','藥':'药',
  '術':'术','語':'语','詞':'词','說':'说','話':'话','義':'义','錢':'钱','銀':'银','鐵':'铁','銅':'铜',
  '鋼':'钢','鐘':'钟','靜':'静','順':'顺','須':'须','頭':'头','頸':'颈','頻':'频','類':'类','願':'愿',
  '顧':'顾','飯':'饭','飲':'饮','飽':'饱','餓':'饿','館':'馆','駕':'驾','騎':'骑','驗':'验','鬥':'斗',
  '鬧':'闹','鮮':'鲜','雞':'鸡','鳴':'鸣','鴨':'鸭','鵝':'鹅','麗':'丽','麥':'麦','黨':'党','齊':'齐',
  '齒':'齿','龜':'龟','會':'会','個':'个','來':'来','傳':'传','動':'动','員':'员','聲':'声','報':'报',
  '嚴':'严','將':'将','當':'当','餘':'余','庫':'库','門':'门','問':'问','間':'间','無':'无','與':'与',
  '麼':'么','樣':'样','種':'种','積':'积','歡':'欢','萬':'万','數':'数','斷':'断','舊':'旧','舉':'举',
  '選':'选','級':'级','細':'细','織':'织','續':'续','總':'总','聯':'联','聽':'听','寫':'写','寧':'宁',
  '寶':'宝','審':'审','寬':'宽','層':'层','屬':'属','灣':'湾','畫':'画','異':'异','靈':'灵','幾':'几',
  '亞':'亚','親':'亲','貴':'贵','買':'买','賣':'卖','質':'质','費':'费','資':'资','賽':'赛','贊':'赞',
  '軍':'军','農':'农','遊':'游','運':'运','適':'适','遲':'迟','邊':'边','鄉':'乡','鄭':'郑','醜':'丑',
  '釋':'释','錄':'录','錯':'错','銷':'销','讀':'读','變':'变','讓':'让','驚':'惊','際':'际','隨':'随',
  '難':'难','雲':'云','電':'电','霧':'雾','韓':'韩','嬰':'婴','職':'职','聯':'联','臥':'卧','舖':'铺',
  '兒':'儿','線':'线','綠':'绿','紅':'红','黃':'黄','藍':'蓝','練':'练','紀':'纪','約':'约','納':'纳',
  '縱':'纵','稅':'税','稱':'称','衝':'冲','準':'准','慣':'惯','憂':'忧','嚴':'严','費':'费','學':'学'
};
function toSimplified(s){
  return String(s||'').replace(/[^\x00-\x7f]/g, ch => T2S[ch] || ch);
}
let refCount = 0;
{
  const f = 'raw/OALD8_abridged_edited.txt';
  if (fs.existsSync(f)) {
    const ref = new Map();
    for (const ln of fs.readFileSync(f,'utf8').split(/\r?\n/)){
      const m = ln.trim().match(/^([A-Za-z][A-Za-z'\- ]*)\s*(?:\[([^\]]*)\])?\s+(noun|verb|adjective|adverb|exclamation|article|preposition|conjunction|pronoun)\s+(.+)$/i);
      if (!m) continue;
      const w = m[1].trim().toLowerCase();
      if (!ref.has(w)) ref.set(w, { p:(m[2]||'').trim(), pos:m[3].toLowerCase(), m:toSimplified(m[4].trim()) });
    }
    for (const [w,e] of POOL){
      const r = ref.get(w);
      if (r){ e.ref = r; refCount++; }
    }
  }
}
console.log('牛津高阶参考释义 '+refCount+' 词');

// 「大纲词」是 bare 型词书在词池查不到释义时塞的占位文本，背到它等于没背。
// 有牛津参考的用参考补上；补不了的从词池和各词书剔除，宁缺毋滥。
const drop = new Set();
let filled = 0;
for (const [w,e] of POOL){
  if (e.m !== '大纲词') continue;
  if (e.ref && e.ref.m){
    e.m = e.ref.m;
    if (!e.p && e.ref.p) e.p = e.ref.p;
    filled++;
  } else drop.add(w);
}
if (drop.size){
  for (const w of drop) POOL.delete(w);
  for (const d of BOOK_DEFS) byId[d.id] = (byId[d.id]||[]).filter(w=>!drop.has(w));
}
console.log('占位释义：牛津补全 '+filled+' 词，剔除无释义 '+drop.size+' 词');

// ── 常用义前置 ───────────────────────────────────────────
// 只处理人工核校过的同形异义词：原词书按词性或义项先后排列，把日常更常用的义项放到了后面。
// 每项给出「应排首位义项」的特征子串；调整只在能定位到完整义项块时进行，块内文字一字不改。
const SENSE_FIRST = {
  well:   '好',      // ad.好（原 n.井 在前）
  march:  '行军',    // vi.行军（原 n.三月 在前）
  miss:   '未看到',  // vt.想念/未看到（原 n.小姐 在前）
  pick:   '拾',      // vt.拾摘（原 n.镐 在前）
  pitch:  '投',      // vt.投掷（原 n.沥青 在前）
  swallow:'吞',      // vt.吞下（原 n.燕子 在前）
  sound:  '声音',    // n.声音（原 a.健康的 在前）
  spring: '春天',    // n.春天（原 vi.跳跃 在前）
  shed:   '棚',      // n.棚屋——但 vt.流出也常用，见下
  rock:   '岩',      // n.岩石（原 vt.摇动 在前）
  tear:   '眼泪',    // n.眼泪（两义都常用，眼泪更基础）
  used:   '过去常常' // vi.过去常常（原 a.旧的 在前）
};
// shed 两义都常见，不调整
delete SENSE_FIRST.shed;
// tear 两义都很常用，不做强改
delete SENSE_FIRST.tear;

// 义项块切分：按 ①②③ 编号切；无编号时按词性切换切。
function splitSenses(m){
  const circled = m.split(/(?=[①②③④⑤⑥])/).filter(Boolean);
  if (circled.length > 1) return circled;
  // 按词性标记切（vt./vi./n./a./ad.），每段带上词性标记
  const parts = [];
  const re = /(?:^|[\s；;])((?:vt|vi|n|adj|adv|a|ad|int|prep|conj|pron|num)\.)/g;
  let last = 0, mm;
  while ((mm = re.exec(m))){
    const at = mm.index + mm[0].indexOf(mm[1]);
    if (at > last) parts.push(m.slice(last, at).trim());
    last = at;
  }
  parts.push(m.slice(last).trim());
  return parts.filter(Boolean);
}
let senseFixed = 0;
for (const [w, key] of Object.entries(SENSE_FIRST)){
  const e = POOL.get(w);
  if (!e || !e.m || e.m.indexOf(key) < 0) continue;
  const parts = splitSenses(e.m);
  if (parts.length < 2) continue;
  const hit = parts.findIndex(p => p.indexOf(key) >= 0);
  if (hit <= 0) continue; // 已经在首位或没找到
  const front = parts[hit];
  const hasNum = /^[①-⑨]/.test(front);
  // 换到首位：去掉原编号，统一用 ① 标记首块，其余保持原编号
  const cleaned = parts.map(p => p.replace(/^[①-⑨]\s*/, ''));
  cleaned.unshift(cleaned.splice(hit, 1)[0]);
  e.m = hasNum
    ? '①' + cleaned[0] + ' ' + cleaned.slice(1).map((p,i)=>'②' + p).join(' ')
    : cleaned.join(' ');
  senseFixed++;
}
console.log('常用义前置 '+senseFixed+' 词');

// ── 词典义项补充（alt）────────────────────────────────────
// 考试词表释义偏简：field 只写"n.田野；田；运动场"，用户答"领域"其实是对的，却会被判错。
// 从词典里挑出与主释义不重叠的常见义项存进 alt：判分时认可，揭晓页标为"别的义项"。
// 主释义保持不动，避免自动改写引入新错误。
function parseDictSenses(){
  const txt = fs.readFileSync('raw/COCA_with_translation.txt','utf8');
  const map = new Map(); let cur = null, rank = 0;
  const flush = () => { if (cur && !map.has(cur.w)) { cur.rank = rank++; map.set(cur.w, cur); } cur = null; };
  for (const ln of txt.split(/\r?\n/)){
    const s = ln.trim();
    if (s.startsWith('————')) { flush(); continue; }
    if (!s) continue;
    if (/^[A-Za-z][A-Za-z .'-]*$/.test(s) && s.length < 30 &&
        !/^(vt|vi|n|v|a|ad|adv|conj|prep|pron|art|int|num)\./.test(s)){
      flush(); cur = { w: s.toLowerCase(), blocks: [] };
    } else if (cur) cur.blocks.push(s);
  }
  flush();
  const POS_SPLIT = /((?:n|v|vt|vi|adj|a|ad|adv|art|prep|conj|pron|int|num)\.\s*)/;
  for (const it of map.values()){
    it.words = [];
    for (const raw of it.blocks.slice(0, 3)){
      const parts = raw.split(POS_SPLIT);
      for (let i = 1; i < parts.length; i += 2){
        const body = (parts[i+1] || '').replace(/\[[^\]]{1,12}\]/g,'');
        if (/人名|地名|音译|姓氏/.test(body)) continue;
        for (const w of body.split(/[；;，,、\/]/)){
          const t = w.trim();
          if (!/^[\u4e00-\u9fa5]{2,4}$/.test(t)) continue;
          if (it.words.indexOf(t) < 0) it.words.push(t);
        }
      }
    }
  }
  return map;
}
// 比对重合时忽略"的/地/得/了/着"这类虚词，否则"主要的"会被"较大的"里的"的"挡住
const ALT_IGNORE = /[的地得了着]/g;
const DICT = parseDictSenses();
// 词典本身也会漏义项（view 只给"观察；视野；意见；风景"，没有"观点"），
// 这里放人工补充：有就整条覆盖，不再混入词典结果，避免又掺回不相干的义项。
const SENSE_EXTRA = fs.existsSync('raw/sense-extra.json')
  ? JSON.parse(fs.readFileSync('raw/sense-extra.json', 'utf8')) : {};
let altAdded = 0, altManual = 0;
const usedChars = m => new Set(String(m || '').replace(ALT_IGNORE,'').match(/[\u4e00-\u9fa5]/g) || []);
for (const e of POOL.values()){
  const manual = Array.isArray(SENSE_EXTRA[e.w]) ? SENSE_EXTRA[e.w] : null;
  const d = DICT.get(e.w);
  if (!manual && (!d || !d.words.length || d.rank > 6000)) continue;
  const used = usedChars(e.m);
  const out = [];
  const take = w => {
    if (out.length >= 2) return;
    const t = String(w).trim();
    if (!/^[\u4e00-\u9fa5]{2,4}$/.test(t)) return;
    for (const ch of t.replace(ALT_IGNORE,'')) if (used.has(ch)) return;
    out.push(t);
    for (const ch of t.replace(ALT_IGNORE,'')) used.add(ch);
  };
  if (manual){
    manual.forEach(take);
    if (out.length){ e.alt = out; altAdded++; altManual++; }
    continue;
  }
  d.words.forEach(take);
  if (out.length){ e.alt = out; altAdded++; }
}
console.log('补充他义 '+altAdded+' 词（其中人工 '+altManual+' 词）');

if (TRACE) fs.writeFileSync('trace-meaning.json', JSON.stringify({cands:TRACE_LOG, chosen:Object.fromEntries(SRC_OF)}));
// 词书内的词按 COCA 词频升序排列：常用词先学。
// the/be/and 这类超基础功能词不必背，挪到末尾；无词频的排最后按字母序兜底。
// 刘晓艳词书按原书课次编排是它的用途所在，保留原顺序。
for (const d of BOOK_DEFS){
  if (d.id === 'lxy4') continue;
  const arr = byId[d.id] || [];
  arr.sort((a,b)=>{
    const fa = POOL.get(a).f, fb = POOL.get(b).f;
    const na = fa >= 99999, nb = fb >= 99999;
    if (na !== nb) return na ? 1 : -1;
    if (na) return a.localeCompare(b);
    const ba = fa < BASIC_SKIP, bb = fb < BASIC_SKIP;
    if (ba !== bb) return ba ? 1 : -1;
    if (fa !== fb) return fa - fb;
    return a.localeCompare(b);
  });
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
