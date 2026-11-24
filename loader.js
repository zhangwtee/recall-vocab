/* 远程词库加载器 · 多源自动切换 + IndexedDB 缓存 · 零依赖 */
(function(){
'use strict';
var DB='nixiang.memo.assets.v1', STORE='kv';

function idbOpen(cb){
  var req;
  try{ req=indexedDB.open(DB,1); }catch(e){ cb(null); return; }
  req.onupgradeneeded=function(){ try{ req.result.createObjectStore(STORE); }catch(e){} };
  req.onsuccess=function(){ cb(req.result); };
  req.onerror=function(){ cb(null); };
}
function idbGet(k,cb){
  idbOpen(function(db){
    if(!db){ cb(null); return; }
    try{
      var r=db.transaction(STORE,'readonly').objectStore(STORE).get(k);
      r.onsuccess=function(){ cb(r.result||null); };
      r.onerror=function(){ cb(null); };
    }catch(e){ cb(null); }
  });
}
function idbSet(k,v,cb){
  idbOpen(function(db){
    if(!db){ cb&&cb(); return; }
    try{
      var tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(v,k);
      tx.oncomplete=function(){ cb&&cb(); };
      tx.onerror=function(){ cb&&cb(); };
    }catch(e){ cb&&cb(); }
  });
}
function idbDel(k,cb){
  idbOpen(function(db){
    if(!db){ cb&&cb(); return; }
    try{
      var tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(k);
      tx.oncomplete=function(){ cb&&cb(); };
      tx.onerror=function(){ cb&&cb(); };
    }catch(e){ cb&&cb(); }
  });
}
function exec(text){
  try{ Function(text)(); return true; }catch(e){ return false; }
}

// 取文本：fetch → XHR（同源/本地）→ script 标签（无 CORS 也能执行）
function getText(url,cb){
  var settled=false;
  function once(t){ if(!settled){ settled=true; cb(t||null); } }
  try{
    fetch(url,{cache:'no-store'}).then(function(r){ return r.ok?r.text():Promise.reject(); })
      .then(once).catch(function(){ xhrText(url,once); });
  }catch(e){ xhrText(url,once); }
}
function xhrText(url,cb){
  try{
    var x=new XMLHttpRequest();
    x.open('GET',url,true); x.timeout=9000;
    x.onload=function(){ cb((x.status===200||x.status===0)?x.responseText:null); };
    x.onerror=function(){ cb(null); }; x.ontimeout=function(){ cb(null); };
    x.send();
  }catch(e){ cb(null); }
}
function loadUrl(url,check,cb){
  var finished=false, timer=setTimeout(function(){ done(false,null); },12000);
  function done(ok,text){
    if(finished) return; finished=true; clearTimeout(timer); cb(ok,text);
  }
  getText(url,function(text){
    if(text && exec(text) && check()) done(true,text);
    else scriptLoad(url,check,done);
  });
}
function scriptLoad(url,check,cb){
  var s=document.createElement('script'), finished=false;
  var timer=setTimeout(function(){ finish(false); },12000);
  function finish(ok){
    if(finished) return; finished=true; clearTimeout(timer);
    s.onload=s.onerror=null;
    if(s.parentNode) s.parentNode.removeChild(s);
    cb(ok,null);
  }
  s.onload=function(){ finish(!!check()); };
  s.onerror=function(){ finish(false); };
  s.src=url; s.async=true;
  document.head.appendChild(s);
}

function customBase(){
  try{
    var s=JSON.parse(localStorage.getItem('nixiang.memo.v1')||'{}');
    return String((s.settings&&s.settings.dataBase)||'').trim().replace(/\/+$/,'');
  }catch(e){ return ''; }
}
function defaultBases(){
  return [
    './data',
    'https://cdn.jsdelivr.net/gh/zhangwtee/recall-vocab@main/data',
    'https://gitee.com/z_w_t/recall-vocab/raw/main/data',
    'https://raw.githubusercontent.com/zhangwtee/recall-vocab/main/data'
  ];
}
function loadAsset(file,check,cb){
  var bases=[], custom=customBase();
  if(custom) bases.push(custom);
  bases=bases.concat(defaultBases());
  var i=0;
  function next(){
    if(i>=bases.length){ cb(null,null); return; }
    var base=bases[i++];
    loadUrl(base+'/'+file,check,function(ok,text){
      if(ok) cb(base,text); else next();
    });
  }
  next();
}

function checkBooks(){ return !!(window.WORD_POOL && window.WORD_BOOKS && window.WORD_CATS); }
function checkExamples(){ return typeof window.getExamples==='function'; }

function runCache(done){
  idbGet('books',function(bt){
    idbGet('examples',function(et){
      var okB=bt?exec(bt):false, okE=et?exec(et):false;
      done(okB,okE,'本地缓存');
    });
  });
}
function runRemote(done){
  loadAsset('books.js',checkBooks,function(base,bt){
    var src=base||'远程';
    loadAsset('examples.js',checkExamples,function(base2,et){
      if(base) idbSet('books',bt);
      if(base2) idbSet('examples',et);
      done(checkBooks(),checkExamples(),src);
    });
  });
}

window.__memoDataStatus={loaded:false,source:'',books:false,examples:false};
window.__memoLoadData=function(force,cb){
  if(typeof force==='function'){ cb=force; force=false; }
  function finish(okB,okE,source){
    window.__memoDataStatus={loaded:!!(okB||okE),source:source,books:!!okB,examples:!!okE};
    cb&&cb(window.__memoDataStatus);
  }
  if(force){ idbDel('books',function(){ idbDel('examples',function(){ runRemote(finish); }); }); return; }
  runCache(function(okB,okE,src){
    if(okB||okE){ finish(okB,okE,src); }
    else runRemote(finish);
  });
};
})();
