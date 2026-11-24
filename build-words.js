// 把 cet4-raw.txt 解析成 words.js。离线脚本，只在构建时运行一次。
const fs = require('fs');
const lines = fs.readFileSync('cet4-raw.txt', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
const re = /^([A-Za-z][A-Za-z.'\-]*)\s*(?:\[([^\]]*)\])?\s*(.+)$/;
const map = new Map();
for (const raw of lines) {
  const s = raw.trim();
  if (!s || /^[A-Z]$/.test(s)) continue;
  if (/[\u4e00-\u9fa5]/.test(s[0])) continue;
  const m = s.match(re);
  if (!m) continue;
  const word = m[1];
  const ph = (m[2] || '').trim();
  const mean = m[3].trim();
  const key = word.toLowerCase();
  if (!map.has(key)) map.set(key, { w: word, p: ph, m: [] });
  const ent = map.get(key);
  if (ph && !ent.p) ent.p = ph;
  if (!ent.m.includes(mean)) ent.m.push(mean);
}
const words = [...map.values()].map(e => ({
  w: e.w,
  p: e.p,
  m: e.m.length > 1 ? e.m.map((x, i) => '①②③④⑤⑥'[i] + x).join(' ') : e.m[0]
}));
words.sort((a, b) => a.w.toLowerCase().localeCompare(b.w.toLowerCase()));
const out = '/* CET-4 大纲词汇 ' + words.length + ' 条 · 自动生成，勿手改 */\n'
  + 'window.CET4_WORDS = ' + JSON.stringify(words) + ';\n';
fs.writeFileSync('words.js', out, 'utf8');
console.log('生成 words.js：' + words.length + ' 词，' + (out.length / 1024).toFixed(0) + ' KB');
console.log('示例：', JSON.stringify(words.slice(0, 2)));
