// 单独验证中文判分逻辑。node test-judge.mjs
import fs from 'node:fs';
const html = fs.readFileSync('index.html','utf8');
// 从最终产物里抽出判分相关函数
const names = ['sameSynonym','stripPos','meaningItems','normInput','editDist','stripMod','antonymClash','similarity','judge'];
const src = names.map(n => {
  const re = new RegExp('function\\s+' + n + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}', 'm');
  const m = html.match(re);
  if (!m) throw new Error('未找到函数 ' + n);
  return m[0];
}).join('\n');
// 同义词组是判分用到的常量，也要一起带进沙箱
const syn = html.match(/var SYN_GROUPS = \[[\s\S]*?\n\];/);
if (!syn) throw new Error('未找到 SYN_GROUPS');
const mod = new Function(syn[0] + '\n' + src + '\nreturn {judge,meaningItems,stripPos,similarity};')();
const {judge, meaningItems} = mod;

let pass=0, fail=0;
function check(meaning, input, want, note, alt){
  const r = judge(input, meaning, alt);
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

console.log('\n[6] 真机遇到的三例（真题反馈）');
check('a.迟的 ad.迟，晚', '迟到', 3, '词性分隔后"迟到"含"迟"');
check('n.田野；田；运动场', '领域', 3, '词典他义命中', ['领域','字段']);
check('a.较大的 n.专业', '主要的', 3, '词典他义命中', ['主要的','成年人']);
check('a.较大的 n.专业', '重要的', 1, '没命中也不能乱认');
check('n.田野；田；运动场', '牧场', 1, '不在 alt 里就算错');

console.log('\n[7] 输入多义项');
check('n.能力；能耐，本领', '能力，本事', 3, '逗号分隔的任一段命中即可');
check('n.能力；能耐，本领', '能力，懒惰', 3, '有一段命中就算对');
check('ad.其它，另外 a.别的', '其他', 3, '「其它/其他」按同一词处理');
check('ad.其它，另外 a.别的', '别的', 3, '词性分隔后独立义项');

console.log('\n[8] 真机反馈里的同义误判');
check('n.标志；代金券 adj.象征性的；装模作样的', '代币', 3, 'token 代币=代金券');
check('a.必不可少的，必需的', '不可或缺的', 3, 'indispensable 同义');
check('n.全体船员', '一群懂技术的人群', 1, 'crew 乱猜不能算对', ['一起工作']);
check('vt.达到(目的)；完成', '接近靠近方法途径', 1, 'accomplish 不能认成 approach', ['实现']);
check('n.闪电，闪电放电', '闪电', 3, 'lightning');

console.log('\n────────────────────────');
console.log(`通过 ${pass} / 失败 ${fail}`);
if(fail) process.exitCode = 1;
