// 生成完全自包含的单文件版本 memo.html：词库、例句全部内联，不联网也能用。
// 用途：直接发到手机上，用浏览器打开即可，无需部署、无需配置。
const fs = require('fs');

let html = fs.readFileSync('app-template.html', 'utf8');
const fsrs = fs.readFileSync('fsrs.js', 'utf8');
const words = fs.readFileSync('words.js', 'utf8');
const books = fs.readFileSync('books.js', 'utf8');
const examples = fs.readFileSync('examples.js', 'utf8');

// 防止数据里出现 </script> 提前闭合标签
function safe(js) { return js.replace(/<\/script/gi, '<\\/script'); }

// 单文件版不加载远程：__memoLoadData 直接返回内置词库状态
const stub = [
  '/* 单文件版加载器：词库与例句已内联在本文件中，不走网络 */',
  '(function(){',
  '  var st={loaded:true,source:"内置",books:true,examples:true};',
  '  window.__memoStandalone=true;',
  '  window.__memoDataStatus=st;',
  '  window.__memoLoadData=function(force,cb){',
  '    if(typeof force==="function"){ cb=force; force=false; }',
  '    if(force && typeof toast==="function") toast("词库已内置于本文件，无需联网更新");',
  '    if(cb) setTimeout(function(){ cb(st); },0);',
  '  };',
  '})();'
].join('\n');

html = html
  .replace('/*__FSRS__*/', () => fsrs)
  .replace('/*__WORDS__*/', () => words)
  .replace('/*__LOADER__*/', () => safe(books) + '\n' + safe(examples) + '\n' + stub)
  // 启动文案改成单文件版的说明
  .replace('正在加载词库…', '正在加载词库…')
  .replace('首次使用需联网获取，之后离线可用', '词库已内置于本文件，无需联网')
  // 单文件版标题
  .replace(/<title>([^<]*)<\/title>/, '<title>背单词 · 离线单文件版</title>');

fs.writeFileSync('memo.html', html, 'utf8');

const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
console.log('生成 memo.html: ' + mb + ' MB（自带 ' +
  (books.match(/"w":/g) || []).length + ' 个词池条目、' +
  (examples.match(/\[\"/g) || []).length + ' 条例句索引，无需联网）');
