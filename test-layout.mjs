// 手机尺寸下的排版回归：标签不折行、判定不被挤出屏幕、操作栏与底部统计互不遮挡。
// node test-layout.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9403;
let seq = 0, ws;
const pending = new Map();

function cmd(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++seq;
    const t = setTimeout(() => rej(new Error(method + ' timeout')), 20000);
    pending.set(id, v => { clearTimeout(t); res(v); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expr) {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception && r.exceptionDetails.exception.description || 'eval error');
  return r.result.value;
}

let pass = 0, fail = 0;
function ck(name, cond, extra) {
  if (cond) { pass++; console.log('  [ok] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/74406/AppData/Local/Temp/.edge-layout',
  'file:///F:/nixiang/memo/memo.html'
], { stdio: 'ignore' });

try {
  let url;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const p = (await r.json()).find(x => x.type === 'page');
      if (p) { url = p.webSocketDebuggerUrl; break; }
    } catch {}
    await sleep(250);
  }
  ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  await cmd('Runtime.enable');
  await cmd('Page.enable');

  // 进入反馈页：随便写个错答案提交
  async function toFeedback() {
    await ev(`(function(){
      var i=document.getElementById('typeInput');
      if(!i) return;
      i.value='完全不对的答案';
      i.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
    await sleep(300);
    await ev(`(function(){
      var b=document.querySelector('[data-action="submitInput"]') ||
            document.querySelector('#actionArea button');
      if(b) b.click();
    })()`);
    await sleep(500);
  }

  for (const [w, h] of [[360, 640], [390, 844], [414, 896]]) {
    await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    // 单文件版首次加载较大，等卡片真正出现再操作，避免把加载中的空白页当成排版失败
    let tries = 0;
    while (!(await ev(`!!document.querySelector('[data-action="confirm"]')`)) && tries++ < 12) {
      await toFeedback();
      await sleep(300);
    }
    // 「回看上一词」只在有历史时出现，先过一词再回到反馈页
    if (!(await ev(`!!document.querySelector('.fbops .btn-back')`))) {
      await ev(`(function(){var b=document.querySelector('[data-action="confirm"]');if(b)b.click()})()`);
      await sleep(300);
      await toFeedback();
      await sleep(300);
    }

    const m = await ev(`(function(){
      var k=document.querySelector('.compare .k');
      var vd=document.querySelector('.verdict');
      var dock=document.getElementById('dock');
      var f=document.querySelector('footer');
      var main=document.getElementById('stage');
      if(!k||!vd||!dock||!f) return null;
      var kr=k.getBoundingClientRect(), vr=vd.getBoundingClientRect();
      var dr=dock.getBoundingClientRect(), fr=f.getBoundingClientRect();
      var bm=document.querySelector('.fbops .btn-main'), ba=document.querySelector('.fbops .btn-back');
      var mr=bm?bm.getBoundingClientRect():null, ar=ba?ba.getBoundingClientRect():null;
      var cmp=document.querySelector('.compare');
      return {
        labelH: Math.round(kr.height), labelText: k.innerText,
        labelWrap: getComputedStyle(k).whiteSpace,
        dockAfterMain: !!(dock.previousElementSibling && dock.previousElementSibling.id === 'stage'),
        dockInMain: !!dock.closest('main'),
        verdictTop: Math.round(vr.top), verdictText: vd.innerText,
        verdictGap: cmp ? Math.round(cmp.getBoundingClientRect().top - vr.bottom) : null,
        btnGap: (mr && ar) ? Math.round(mr.left - ar.right) : null,
        btnHDiff: (mr && ar) ? Math.round(Math.abs(mr.height - ar.height)) : 0,
        btnWidthDiff: (mr && ar) ? Math.round(Math.abs(mr.width - ar.width)) : 0,
        btnRadius: bm ? getComputedStyle(bm).borderTopLeftRadius : '',
        dockTop: Math.round(dr.top), dockBottom: Math.round(dr.bottom),
        footerTop: Math.round(fr.top), footerBottom: Math.round(fr.bottom),
        viewH: window.innerHeight,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        mainScrollable: main.scrollHeight > main.clientHeight
      };
    })()`);
    ck(w + '×' + h + ' 页面结构完整', !!m, m);
    if (!m) continue;
    // 3 个字在 14px 下一行约 23px，折行会接近 46px
    ck(w + '×' + h + ' 标签不折行', m.labelH < 34 && m.labelWrap === 'nowrap', m);
    ck(w + '×' + h + ' 操作栏不在滚动区内', m.dockAfterMain && !m.dockInMain, m);
    ck(w + '×' + h + ' 判定在首屏内', m.verdictTop > 0 && m.verdictTop < m.dockTop, m);
    ck(w + '×' + h + ' 判定条与对比框不粘连', m.verdictGap !== null && m.verdictGap >= 6, m);
    ck(w + '×' + h + ' 两个操作按钮留出间隙', m.btnGap !== null && m.btnGap >= 8, m);
    ck(w + '×' + h + ' 操作按钮同高且圆角在', m.btnHDiff <= 2 && m.btnRadius !== '0px', m);
    ck(w + '×' + h + ' 回看与下一词各占一半', m.btnWidthDiff <= 2, m);
    ck(w + '×' + h + ' 操作栏在统计上方', m.dockBottom <= m.footerTop + 1, m);
    ck(w + '×' + h + ' 统计在屏幕内', m.footerBottom <= m.viewH + 1, m);
    ck(w + '×' + h + ' 无横向滚动', !m.hScroll, m);
  }

  console.log('\n总结：通过 ' + pass + '，失败 ' + fail);
  if (fail) process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  edge.kill();
}
