const fs = require('fs');
const path = require('path');
let html = fs.readFileSync('app-template.html', 'utf8');
const fsrs = fs.readFileSync('fsrs.js', 'utf8');
const words = fs.readFileSync('words.js', 'utf8');
const loader = fs.readFileSync('loader.js', 'utf8');
html = html.replace('/*__FSRS__*/', () => fsrs)
           .replace('/*__WORDS__*/', () => words)
           .replace('/*__LOADER__*/', () => loader);
fs.writeFileSync('index.html', html, 'utf8');

// 词库数据单独成文件，供部署到仓库 data/ 目录
if(!fs.existsSync('data')) fs.mkdirSync('data');
fs.copyFileSync('books.js', path.join('data','books.js'));
fs.copyFileSync('examples.js', path.join('data','examples.js'));

console.log('生成 index.html: ' + (Buffer.byteLength(html)/1024).toFixed(0) + ' KB');
console.log('生成 data/books.js + data/examples.js: ' +
  ((fs.statSync('data/books.js').size + fs.statSync('data/examples.js').size)/1024/1024).toFixed(2) + ' MB');
