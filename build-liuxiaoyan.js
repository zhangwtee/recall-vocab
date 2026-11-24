// 把刘晓艳《英语四级·你还在背单词吗》开源整理数据解析成统一词条。
// 数据来源：gityuanbao/Owenwoow 的公开项目 site/data/lessons/*.json（AI 生成的书外例句）。
// 运行：node build-liuxiaoyan.js → liuxiaoyan.js
const fs = require('fs');
const path = require('path');

const DIR = path.join('raw','liuxiaoyan');
function sensesText(senses){
  if(!senses || !senses.length) return '';
  return senses.map(function(s){
    return (s.pos||'') + String(s.mean||'').replace(/\[\[|\]\]/g,'');
  }).join(' ').replace(/\s+/g,' ').trim();
}
function clean(s){ return String(s||'').replace(/\[\[|\]\]/g,'').replace(/\s+/g,' ').trim(); }

const entries = [];
const seen = new Set();
for(const f of fs.readdirSync(DIR).filter(x=>/^u\d+-l\d+\.json$/.test(x)).sort()){
  const j = JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8'));
  for(const g of (j.groups||[])){
    for(const e of (g.entries||[])){
      const w = String(e.word||'').trim().toLowerCase();
      if(!w || !/^[a-z][a-z.'\- ]*$/.test(w) || seen.has(w)) continue;
      seen.add(w);
      let p = '', m = '';
      for(const pr of (e.prons||[])){
        if(pr.ipa && !p) p = String(pr.ipa).replace(/^\/|\/$/g,'');
        const t = sensesText(pr.senses);
        if(t && m.length < t.length) m = t;
      }
      const tip = clean(e.tip && e.tip.text);
      let ex = null;
      if(e.ex && e.ex.en && e.ex.zh) ex = [clean(e.ex.en), clean(e.ex.zh)];
      entries.push({ w, p, m, tip, ex, lesson:j.id, group:g.title||'' });
    }
  }
}

// 例句：主词条真题例句优先并入 examples 映射
const exMap = {};
for(const e of entries) if(e.ex) exMap[e.w] = [e.ex];

const out = '/* 刘晓艳四级核心词 · 自动生成，勿手改 · 词条来自公开开源整理，例句 AI 生成 */\n'
  + 'window.LXY_WORDS = ' + JSON.stringify(entries) + ';\n'
  + 'window.LXY_EXAMPLES = ' + JSON.stringify(exMap) + ';\n';
fs.writeFileSync('liuxiaoyan.js',out,'utf8');
console.log('词条 '+entries.length+'，带助记 '+entries.filter(e=>e.tip).length+'，带例句 '+entries.filter(e=>e.ex).length);
console.log('生成 liuxiaoyan.js: '+(Buffer.byteLength(out)/1024).toFixed(0)+' KB');
