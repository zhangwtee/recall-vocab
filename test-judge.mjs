// 单独验证中文判分逻辑。node test-judge.mjs
import fs from 'node:fs';
const html = fs.readFileSync('index.html','utf8');
// 从最终产物里抽出判分相关函数
const names = ['stripPos','meaningItems','normInput','editDist','similarity','judge'];
const src = names.map(n => {
  const re = new RegExp('function\\s+' + n + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}', 'm');
  const m = html.match(re);
  if (!m) throw new Error('未找到函数 ' + n);
  return m[0];
}).join('\n');
const mod = new Function(src + '\nreturn {judge,meaningItems,stripPos,similarity};')();
const {judge, meaningItems} = mod;

let pass=0, fail=0;
function check(meaning, input, want, note){
  const r = judge(input, meaning);
  const ok = r.g === want;
  if(ok) pass++; else fail++;
  console.log((ok?'  ok   ':'  FAIL ')+JSON.stringify(input)+' → '+JSON.stringify(meaning)
    +'  得 '+r.g+'('+r.verdict+','+r.score.toFixed(2)+')'+(note?'  '+note:''));
}

console.log('\n[1] 精确与近似输入');
check('a.外部的，外面的', '外部的', 3);
check('a.外部的，外面的', '外面的', 3);
check('a.外部的，外面的', '外部', 3);
check('a.外部的，外面的', '外面', 3);
check('vt.丢弃；放弃，抛弃', '丢弃', 3);
check('vt.丢弃；放弃，抛弃', '放弃', 3);
check('vt.丢弃；放弃，抛弃', '抛弃', 3);
check('n.能力；能耐，本领', '能力', 3);
check('n.能力；能耐，本领', '能耐', 3);

console.log('\n[2] 错别字/语序容差');
check('n.情况；事实；病例', '情况', 3);
check('n.情况；事实；病例', '病情', 2, '部分字重合');
check('ad.完全地；绝对地', '完全的', 3, '近形');
check('v.吸收；使专心', '专心', 3);

console.log('\n[3] 明显错误');
check('a.外部的，外面的', '内部的', 1);
check('n.能力；能耐，本领', '懒惰', 1);
check('vt.丢弃；放弃，抛弃', '获得', 1);
check('n.事故；意外', '成功', 1);

console.log('\n[4] 多义项合并词（①②③）');
check('①n.箱子；盒(子) ②n.情况', '箱子', 3);
check('①n.箱子；盒(子) ②n.情况', '情况', 3);

console.log('\n[5] 释义清洗');
console.log('  义项:', JSON.stringify(meaningItems('①n.箱子；盒(子) ②n.情况')));
console.log('  义项:', JSON.stringify(meaningItems('(缩)上午，午前')));

console.log('\n────────────────────────');
console.log(`通过 ${pass} / 失败 ${fail}`);
if(fail) process.exitCode = 1;
