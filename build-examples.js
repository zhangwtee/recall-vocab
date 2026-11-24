// 把多本例句 jsonl 去重合并成 examples.js（按词索引，每词最多2条）。
const fs = require('fs');
global.window = {};
eval(fs.readFileSync('books.js','utf8'));
const pool = new Set(window.WORD_POOL.map(w=>w.w));
const order = ['cet4','cet6','kaoyan','gaokao','zhongkao','toefl','gre'];
const ex = new Map();
for(const id of order){
  const f = 'examples/'+id+'.jsonl';
  if(!fs.existsSync(f)) continue;
  for(const ln of fs.readFileSync(f,'utf8').split(/\r?\n/)){
    if(!ln.trim()) continue;
    let o; try{ o=JSON.parse(ln); }catch(e){ continue; }
    const w = (o.word||'').toLowerCase();
    if(!pool.has(w) || ex.has(w) || !o.sentences || !o.sentences.length) continue;
    const ss = o.sentences.filter(s=>s.sentence && s.translation)
      .slice(0,2).map(s=>[s.sentence.trim(),s.translation.trim()]);
    if(ss.length) ex.set(w,ss);
  }
}
const out = '/* 例句数据 · 自动生成，勿手改 · 来源 KyleBing/english-vocabulary */\n'
  + 'window.WORD_EXAMPLES = ' + JSON.stringify([...ex]) + ';\n'
  + 'window._EX_MAP = {};\n'
  + 'window.WORD_EXAMPLES.forEach(function(e){ window._EX_MAP[e[0]]=e[1]; });\n'
  + '(function(){\n  window.getExamples = function(w){\n'
  + '    return window._EX_MAP[String(w).toLowerCase()] || null;\n'
  + '  };\n})();\n';
fs.writeFileSync('examples.js',out,'utf8');
console.log('例句词数 '+ex.size+'，examples.js '+(Buffer.byteLength(out)/1024/1024).toFixed(2)+' MB');
