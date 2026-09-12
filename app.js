(function(){
'use strict';
var DEX='https://api.dexscreener.com',GT='https://api.geckoterminal.com/api/v2';
// GeckoTerminal blocks browser CORS under load -> go through our cached edge proxy
function gtUrl(p){return '/api/gt?path='+encodeURIComponent(p);}
var RUG='https://api.rugcheck.xyz/v1/tokens',HP='https://api.honeypot.is/v2/IsHoneypot',FOMO='https://api.fomoapi.io';
var LS_CFG='ar-cfg-v1',LS_RES='ar-research-v1',LS_HOLD='ar-holders-v1',LS_WATCH='ar-watch-v1',LS_SCORE='ar-scores-v1',LS_THESIS='ar-thesis-v1',LS_POOL='ar-poolcache-v2',LS_JOURNAL='ar-journal-v1';
var POOL_CACHE_MAX_AGE=20*60*1000; // stale cache older than this is skipped for instant-paint, straight to skeleton
var EVM_CHAIN_ID={bsc:56,base:8453,ethereum:1};
var reduceMotion=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// GeckoTerminal free tier ~25 req/min and 429s without CORS headers -> throttle every GT call
var _gtQ=[],_gtLast=0,_gtBusy=false,GT_GAP=650;
function gtFetch(url,priority){
 return new Promise(function(resolve){var job={url:url,resolve:resolve};if(priority)_gtQ.unshift(job);else _gtQ.push(job);drainGt();});
}
function drainGt(){
 if(_gtBusy||!_gtQ.length)return;
 _gtBusy=true;
 var wait=Math.max(0,GT_GAP-(Date.now()-_gtLast));
 setTimeout(function(){
  var job=_gtQ.shift();_gtLast=Date.now();
  fetch(job.url).then(function(r){
   if(r&&r.status===429){GT_GAP=Math.min(4000,GT_GAP+900);}
   else if(r&&r.ok&&GT_GAP>650){GT_GAP=Math.max(650,GT_GAP-200);}
   job.resolve(r&&r.ok?r:{ok:false,status:r?r.status:0,json:function(){return Promise.resolve(null);}});
  },function(){job.resolve({ok:false,status:0,json:function(){return Promise.resolve(null);}});}).then(function(){_gtBusy=false;drainGt();});
 },wait);
}
function gtNet(c){return ({solana:'solana',bsc:'bsc',base:'base',ethereum:'eth'})[c]||c;}
function gtOk(c){return ['solana','bsc','base','ethereum'].indexOf(normChain(c))>=0;} // has a GeckoTerminal network (chart/trades)
function chainSlug(c){return ({solana:'solana',base:'base',bsc:'bsc',ethereum:'ethereum'})[c]||'';}
function normChain(c){c=String(c||'').toLowerCase();if(c==='eth')return'ethereum';if(c==='bnb')return'bsc';return c;}

var THEMES=[
 {k:'ai',name:'AI & chips',q:'ai',kw:['ai','gpt','openai','chatgpt','claude','gemini','grok','llm','agi','nvidia','chip','jalapeno','gb300','compute','neural','model','anthropic','deepseek']},
 {k:'gta',name:'GTA / Rockstar',q:'gta',kw:['gta','gta6','rockstar','vice city','lucia','jason','leak','take two']},
 {k:'trump',name:'Politics / Trump',q:'trump',kw:['trump','maga','potus','biden','election','tariff','vance','white house']},
 {k:'elon',name:'Elon / xAI',q:'elon',kw:['elon','musk','xai','grok','tesla','starship','optimus','mars','dogecoin']},
 {k:'stream',name:'Streamers',q:'kai',kw:['kai','cenat','speed','ishowspeed','mrbeast','adin','jynxzi','plaqueboymax','xqc','stake']},
 {k:'hood',name:'Robinhood chain',q:'robinhood',kw:['robinhood','hood','vlad','bitstamp']},
 {k:'dog',name:'Dogs',q:'dog',kw:['dog','doge','shiba','inu','bonk','wif','snek','floki','samoyed','cheems']},
 {k:'frog',name:'Frogs & classics',q:'pepe',kw:['pepe','frog','wojak','chad','brett','apu','peepo','matt furie']},
 {k:'china',name:'China virality',q:'china',kw:['china','chinese','nuli','mao','panda','wechat','ccp','labubu']},
 {k:'anime',name:'Anime / weeb',q:'anime',kw:['anime','waifu','naruto','goku','senpai','miku','vtuber']}
];

var state={
 tab:'scan',apiKey:'',
 chains:{solana:true,base:true,bsc:true,robinhood:true,ethereum:false},
 searchCache:new Map(), // q -> {ts,pairs}
 tokenCache:new Map(),   // addr -> {ts,pair}
 boosts:[],trending:[],profiles:{},tinfo:new Map(),
 safety:new Map(),ohlcv:new Map(),
 research:{},holders:{},scores:{},thesis:{},journal:[],watch:new Set(),watchMeta:new Map(),_watchBusy:false,
 compare:[], // addrs picked for side-by-side comparison, in pick order, capped at 3 — session-only
 chartMode:'entries',rcAddr:null,rcPair:null,rcInfo:null,trades:[],_tradesPoll:0,fhSound:false,
 lastOk:0,lastErr:null,scanAt:0
};

/* ---------- storage ---------- */
function loadAll(){
 try{var c=JSON.parse(localStorage.getItem(LS_CFG)||'{}');if(c.chains){state.chains=c.chains;if(state.chains.robinhood===undefined)state.chains.robinhood=true;}if(['scan','watch','research'].indexOf(c.tab)>=0)state.tab=c.tab;if(c.chartMode)state.chartMode=c.chartMode;if(c.fhSound)state.fhSound=true;}catch(_){}
 try{state.research=JSON.parse(localStorage.getItem(LS_RES)||'{}')||{};}catch(_){state.research={};}
 try{state.holders=JSON.parse(localStorage.getItem(LS_HOLD)||'{}')||{};}catch(_){state.holders={};}
 try{var w=JSON.parse(localStorage.getItem(LS_WATCH)||'[]');state.watch=new Set(w);}catch(_){}
 try{state.scores=JSON.parse(localStorage.getItem(LS_SCORE)||'{}')||{};}catch(_){state.scores={};}
 try{state.thesis=JSON.parse(localStorage.getItem(LS_THESIS)||'{}')||{};}catch(_){state.thesis={};}
 try{state.journal=JSON.parse(localStorage.getItem(LS_JOURNAL)||'[]')||[];}catch(_){state.journal=[];}
}
function saveCfg(){try{localStorage.setItem(LS_CFG,JSON.stringify({apiKey:state.apiKey,chains:state.chains,tab:state.tab,chartMode:state.chartMode,fhSound:state.fhSound}));}catch(_){}}
function saveRes(){try{localStorage.setItem(LS_RES,JSON.stringify(state.research));}catch(_){}}
function saveHold(){try{localStorage.setItem(LS_HOLD,JSON.stringify(state.holders));}catch(_){}}
function saveScores(){try{localStorage.setItem(LS_SCORE,JSON.stringify(state.scores));}catch(_){}}
function saveThesis(){try{localStorage.setItem(LS_THESIS,JSON.stringify(state.thesis));}catch(_){}}
// journal entries are never deleted from the UI (that's the point — no quietly forgetting a
// loss), so cap what we persist rather than let it grow unbounded across years of use.
function saveJournal(){try{localStorage.setItem(LS_JOURNAL,JSON.stringify(state.journal.slice(-500)));}catch(_){}}
function saveWatch(){try{localStorage.setItem(LS_WATCH,JSON.stringify(Array.from(state.watch)));}catch(_){}}
// disk cache of the last live scan, purely for a fast FIRST PAINT on reload — it is never treated
// as ground truth: attentionPool()'s hard-exclusion safety filter runs on it exactly like live data,
// and the very next scan() call (kicked off right after this paints) overwrites it with fresh data.
function saveScanCache(){
 try{
  localStorage.setItem(LS_POOL,JSON.stringify({
   ts:Date.now(),boosts:state.boosts,trending:state.trending,profiles:state.profiles,
   tokens:Array.from(state.tokenCache.entries()).slice(-200),
   safety:Array.from(state.safety.entries()).slice(-200)
  }));
 }catch(_){}
}
function loadScanCache(){
 try{
  var c=JSON.parse(localStorage.getItem(LS_POOL)||'null');
  if(!c||!c.ts||Date.now()-c.ts>POOL_CACHE_MAX_AGE)return false;
  state.boosts=c.boosts||[];state.trending=c.trending||[];state.profiles=c.profiles||{};
  (c.tokens||[]).forEach(function(kv){state.tokenCache.set(kv[0],kv[1]);});
  (c.safety||[]).forEach(function(kv){state.safety.set(kv[0],kv[1]);});
  return true;
 }catch(_){return false;}
}

/* ---------- watchlist (server-backed, per account) ---------- */
function syncWatchFromServer(){
 return fetch('/api/watchlist',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
  if(!j||!Array.isArray(j.items))return;
  state.watch=new Set();state.watchMeta=new Map();
  j.items.forEach(function(it){
   var a=String(it.addr||'').toLowerCase();if(!a)return;
   state.watch.add(a);state.watchMeta.set(a,{chain:it.chain||'',sym:it.sym||'',added:it.added_at});
  });
  saveWatch();
 }).catch(function(){});
}
/* ---------- watchlist thesis: why is this coin here, and has that reason held up ----------
   Captured automatically the moment you star a coin — no form, no friction — from whatever
   attention data is already on hand for that row. No score-fetch dependency: works from any tab. */
function recordThesis(addr){
 if(state.thesis[addr])return; // don't clobber an existing thesis by re-starring
 var c=state.tokenCache.get(addr),pp=c&&c.pair;if(!pp||!pp.mc)return;
 var a=pp._a||attn(pp);
 // snapshot whatever safety data is already on hand (screenPool / an earlier x-ray visit may
 // have already fetched it) — no new fetch triggered here, same "works from any tab, no
 // friction" rule as the rest of the thesis system. Feeds the mistake-pattern journal on exit.
 var sf=state.safety.get(addr);
 state.thesis[addr]={
  mc:pp.mc,price:pp.priceUsd||null,at:Date.now(),traj:a.traj,attn:a.score,invalidatePct:35,
  sym:pp.sym,chain:pp.chain,liq:pp.liq!=null?pp.liq:null,
  theme:(tagThemes(pp)[0]||null),
  topPct:(sf&&sf.topPct!=null)?sf.topPct:null,
  devPct:(sf&&sf.devPct!=null)?sf.devPct:null,
  bundle:!!(sf&&sf.bundle),
  renounced:(sf&&sf.renounced!=null)?sf.renounced:null,
  lpPct:(sf&&sf.lpPct!=null)?sf.lpPct:null
 };
 saveThesis();
}
// closes out the mistake-pattern journal entry for addr using whatever thesis + live price data
// we have, THEN clears the thesis. Called right before a coin leaves the watchlist — that's the
// "exit" event in this UI's model. A permanent record: journal entries are never deleted here.
function closeJournalEntry(addr){
 var t=state.thesis[addr];if(!t)return;
 var c=state.tokenCache.get(addr),pp=c&&c.pair;
 var exitMc=(pp&&pp.mc)||null;
 var pct=(exitMc&&t.mc)?(exitMc/t.mc-1)*100:null;
 var outcome=pct==null?'unknown':pct>=20?'win':pct<=-t.invalidatePct?'loss':'neutral';
 state.journal.push({
  addr:addr,sym:t.sym||(pp&&pp.sym)||'?',chain:t.chain||(pp&&pp.chain)||'',
  enteredAt:t.at,exitedAt:Date.now(),entryMc:t.mc,exitMc:exitMc,pct:pct,outcome:outcome,
  theme:t.theme,topPct:t.topPct,devPct:t.devPct,bundle:t.bundle,renounced:t.renounced,lpPct:t.lpPct,liq:t.liq
 });
 saveJournal();
}
function clearThesis(addr){if(state.thesis[addr]){delete state.thesis[addr];saveThesis();}}
function thesisStatus(addr,pp){
 var t=state.thesis[addr];if(!t||!t.mc||!pp||!pp.mc)return null;
 var pct=(pp.mc/t.mc-1)*100;
 var label,cls;
 if(pct<=-t.invalidatePct){label='thesis invalidated';cls='neg';}
 else if(pct>=20){label='thesis playing out';cls='pos';}
 else{label='holding';cls='';}
 return {pct:pct,label:label,cls:cls,at:t.at,traj:t.traj,attn:t.attn};
}
function watchToggle(addr,chain,sym){
 addr=String(addr||'').toLowerCase();if(!addr||state._watchBusy)return;
 var on=state.watch.has(addr);
 state._watchBusy=true;
 if(on){state.watch.delete(addr);state.watchMeta.delete(addr);closeJournalEntry(addr);clearThesis(addr);}
 else{state.watch.add(addr);state.watchMeta.set(addr,{chain:chain||'',sym:sym||'',added:Date.now()});recordThesis(addr);}
 saveWatch();refreshStars();if(state.tab==='watch')renderWatch();
 var req=on
  ? fetch('/api/watchlist?addr='+encodeURIComponent(addr),{method:'DELETE'})
  : fetch('/api/watchlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({addr:addr,chain:chain||'',sym:sym||''})});
 req.then(function(r){
  if(!r.ok){ // revert
   if(on){state.watch.add(addr);state.watchMeta.set(addr,{chain:chain||'',sym:sym||''});}
   else{state.watch.delete(addr);state.watchMeta.delete(addr);}
   saveWatch();refreshStars();if(state.tab==='watch')renderWatch();
   r.json().then(function(j){toast((j&&j.error)||'could not save');}).catch(function(){toast('could not save');});
  }else{ toast(on?'removed from watchlist':'saved to watchlist'); }
 }).catch(function(){toast('offline — will not sync');})
 .then(function(){state._watchBusy=false;});
}
function starBtn(addr,chain,sym){
 var on=state.watch.has(String(addr||'').toLowerCase());
 return '<span class="star'+(on?' on':'')+'" role="button" tabindex="0" data-star="'+esc(addr)+'" data-chain="'+esc(chain||'')+'" data-sym="'+esc(sym||'')+'" aria-label="'+(on?'unsave':'save')+'">'+(on?'★':'☆')+'</span>';
}
function refreshStars(){
 document.querySelectorAll('.star[data-star]').forEach(function(el){
  var on=state.watch.has(String(el.getAttribute('data-star')||'').toLowerCase());
  el.classList.toggle('on',on);el.textContent=on?'★':'☆';
 });
}
function watchClick(ev){
 var st=ev.target.closest('[data-star]');
 if(st){ev.preventDefault();ev.stopPropagation();watchToggle(st.getAttribute('data-star'),st.getAttribute('data-chain'),st.getAttribute('data-sym'));return true;}
 var cm=ev.target.closest('[data-cmp]');
 if(cm){ev.preventDefault();ev.stopPropagation();compareToggle(cm.getAttribute('data-cmp'),cm.getAttribute('data-sym'));return true;}
 return false;
}

/* ---------- side-by-side comparison (watchlist) ---------- */
function cmpBtn(addr,sym){
 addr=String(addr||'').toLowerCase();
 var on=state.compare.indexOf(addr)>=0;
 return '<span class="cmp'+(on?' on':'')+'" role="button" tabindex="0" data-cmp="'+esc(addr)+'" data-sym="'+esc(sym||'')+'" aria-label="'+(on?'remove from comparison':'add to comparison')+'" title="compare">'+(on?'&#10004;':'&#8644;')+'</span>';
}
function compareToggle(addr,sym){
 addr=String(addr||'').toLowerCase();
 var i=state.compare.indexOf(addr);
 if(i>=0){state.compare.splice(i,1);}
 else{
  if(state.compare.length>=3)state.compare.shift(); // evict the oldest pick so 3 stays the working set
  state.compare.push(addr);state._compareSym=state._compareSym||{};state._compareSym[addr]=sym||'?';
 }
 document.querySelectorAll('.cmp[data-cmp]').forEach(function(el){
  var on=state.compare.indexOf(String(el.getAttribute('data-cmp')||'').toLowerCase())>=0;
  el.classList.toggle('on',on);el.innerHTML=on?'&#10004;':'&#8644;';
 });
 renderCmpBar();
}
function renderCmpBar(){
 var bar=q1('cmpBar');if(!bar)return;
 if(!state.compare.length){bar.hidden=true;q1('cmpPanel').innerHTML='';return;}
 bar.hidden=false;
 var chips=state.compare.map(function(a){
  var sym=(state._compareSym&&state._compareSym[a])||'?';
  return '<span class="cmp-chip">$'+esc(sym)+' <b data-cmpx="'+esc(a)+'" role="button">&times;</b></span>';
 }).join('');
 q1('cmpChips').innerHTML=chips;
 q1('cmpGo').disabled=state.compare.length<2;
 q1('cmpGo').textContent='Compare '+state.compare.length+(state.compare.length===1?' coin (pick 1 more)':' coins');
}
function runCompare(){
 var addrs=state.compare.slice();
 if(addrs.length<2)return;
 var panel=q1('cmpPanel');panel.innerHTML='<div class="empty">comparing&hellip;</div>';
 dexTokens(addrs).then(function(){
  var coins=addrs.map(function(a){
   var c=state.tokenCache.get(a),pp=c&&c.pair;
   return {addr:a,pp:pp,sym:(pp&&pp.sym)||(state._compareSym&&state._compareSym[a])||'?'};
  }).filter(function(x){return x.pp;});
  if(coins.length<2){panel.innerHTML='<div class="empty">Not enough live data on the picked coins right now &mdash; try again in a moment.</div>';return;}
  return Promise.all(coins.map(function(x){return fetchSafety(x.pp.addr,x.pp.chain);})).then(function(sfs){
   var rows=coins.map(function(x,i){
    var pp=x.pp,a=attn(pp),sf=sfs[i],hr=holderRate(pp.addr),proj=buildProject(pp,state.tinfo.get(pp.addr));
    var s=longTermScore(pp,a,sf,hr,proj);
    return {sym:x.sym,chain:pp.chain,s:s};
   });
   renderCmpTable(rows);
  });
 }).catch(function(){panel.innerHTML='<div class="empty">couldn&rsquo;t load comparison data &mdash; try again.</div>';});
}
function renderCmpTable(rows){
 var panel=q1('cmpPanel');if(!panel)return;
 var n=rows.length,cols='150px repeat('+n+',1fr)';
 var factorKeys=rows[0].s.factors.map(function(f){return f.k;});
 var head='<div class="cmp-row cmp-head" style="grid-template-columns:'+cols+'"><div></div>'
  +rows.map(function(r){return '<div>$'+esc(r.sym)+' <span class="cchip">'+esc(r.chain)+'</span></div>';}).join('')+'</div>';
 var scoreRow='<div class="cmp-row" style="grid-template-columns:'+cols+'"><div><b>Overall score</b></div>'
  +rows.map(function(r){var cls=r.s.pct>=68?'pos':r.s.pct<=28?'neg':'';return '<div class="cmp-cell '+cls+'"><b>'+r.s.pct+'</b></div>';}).join('')+'</div>';
 var factorRows=factorKeys.map(function(k,fi){
  return '<div class="cmp-row" style="grid-template-columns:'+cols+'"><div>'+esc(k)+'</div>'
   +rows.map(function(r){var v=Math.round(r.s.factors[fi].v*100),cls=v>=65?'pos':v<=35?'neg':'';return '<div class="cmp-cell '+cls+'">'+v+'</div>';}).join('')+'</div>';
 }).join('');
 panel.innerHTML='<div class="panel"><h3>Side-by-side</h3><div class="cmp-table">'+head+scoreRow+factorRows+'</div>'
  +'<p class="rscore-cite">Same weighting as the Long-term research score panel on each coin&rsquo;s own x-ray. Refetches live each time you compare.</p></div>';
}
function renderWatch(){
 var host=q1('watchList');if(!host)return;
 var jp=q1('journalPanel');if(jp)jp.innerHTML=journalPanel(); // shows even with 0 currently watched — it's a record of the past, not the live list
 var addrs=Array.from(state.watch);
 q1('watchCount').textContent=addrs.length?addrs.length+' saved':'';
 var exposureEl=q1('exposureNote');
 if(!addrs.length){host.innerHTML='<div class="empty">No saved coins yet. Tap the &#9734; on any coin to keep it here.</div>';if(exposureEl)exposureEl.innerHTML='';return;}
 host.innerHTML=skelRows(Math.min(addrs.length,6));
 // ensure token data — nextPaint() guarantees the skeleton above is actually seen even when
 // every address is already warm in tokenCache and this resolves within the same tick.
 Promise.all([dexTokens(addrs),nextPaint()]).then(function(){
  var livePairs=[];
  var rows=addrs.map(function(a){
   var c=state.tokenCache.get(a),pp=c&&c.pair,meta=state.watchMeta.get(a)||{};
   var sym=(pp&&pp.sym)||meta.sym||'?';
   if(pp){
    pp._a=pp._a||attn(pp);pp._tags=pp._tags||tagThemes(pp);pp._q=pp._q||pickQuality(pp);
    recordThesis(a); // backfill: the star may have fired before this coin's data was cached
    livePairs.push(pp);
    var btn=tokenRow(pp).replace('</button>',cmpBtn(a,sym)+'</button>');
    return '<div class="wrow">'+btn+thesisLine(a,pp)+'</div>';
   }
   return '<div class="wrow"><button class="trow" data-addr="'+esc(a)+'" data-chain="'+esc(meta.chain||'')+'">'
    +'<span></span><span class="tmain"><span class="tsym">'+starBtn(a,meta.chain,meta.sym)+'$'+esc(meta.sym||'?')+' <span class="cchip">'+esc(meta.chain||'?')+'</span></span>'
    +'<span class="tmeta">no live data right now &mdash; tap to open the x-ray</span></span>'
    +'<span class="traj">&mdash;</span>'+cmpBtn(a,sym)+'</button></div>';
  }).join('');
  host.innerHTML=rows;
  if(exposureEl)exposureEl.innerHTML=exposurePanel(livePairs);
 });
}
function thesisLine(addr,pp){
 var t=state.thesis[addr];if(!t)return '';
 var s=thesisStatus(addr,pp);if(!s)return '';
 var pctStr=(s.pct>=0?'+':'')+s.pct.toFixed(0)+'%';
 return '<div class="thesis-line">Starred at '+fUsd(t.mc)+' ('+fAgo(t.at)+' ago, '+esc((t.traj||'').toLowerCase())+') &middot; now <b class="'+s.cls+'">'+pctStr+'</b> &middot; <b class="'+s.cls+'">'+esc(s.label)+'</b></div>';
}

/* ---------- mistake-pattern journal: a permanent record of what you knew at entry vs what
   actually happened, built entirely from data the thesis tracker already collects. Never a
   signal — it only ever describes YOUR past, never anyone's future. ---------- */
function journalStats(){
 var j=state.journal;if(!j.length)return null;
 var closed=j.filter(function(e){return e.pct!=null;});
 var wins=closed.filter(function(e){return e.outcome==='win';});
 var losses=closed.filter(function(e){return e.outcome==='loss';});
 function avg(arr,key){var v=arr.map(function(e){return e[key];}).filter(function(x){return x!=null;});return v.length?v.reduce(function(s,x){return s+x;},0)/v.length:null;}
 var avgLossTop=avg(losses,'topPct'),avgWinTop=avg(wins,'topPct');
 var flag=null;
 if(losses.length>=3&&avgLossTop!=null){
  var highCount=losses.filter(function(e){return e.topPct!=null&&e.topPct>40;}).length;
  if(highCount/losses.length>=0.5){
   flag='Your last '+losses.length+' losses average '+avgLossTop.toFixed(0)+'% top-holder concentration at entry'+(avgWinTop!=null?' vs '+avgWinTop.toFixed(0)+'% on wins':'')+' &mdash; you already flag this red flag, you&rsquo;re just not acting on it.';
  }
 }
 return {total:j.length,closedN:closed.length,wins:wins.length,losses:losses.length,neutral:closed.length-wins.length-losses.length,avgLossTop:avgLossTop,avgWinTop:avgWinTop,flag:flag};
}
function journalList(){
 var entries=state.journal.slice().reverse().slice(0,25);
 if(!entries.length)return '';
 return '<div class="jrows">'+entries.map(function(e){
  var cls=e.outcome==='win'?'pos':e.outcome==='loss'?'neg':'';
  var pctStr=e.pct!=null?((e.pct>=0?'+':'')+e.pct.toFixed(0)+'%'):'?';
  var themeName=e.theme?(THEMES.filter(function(t){return t.k===e.theme;})[0]||{}).name||e.theme:null;
  return '<div class="jrow"><span>$'+esc(e.sym||'?')+'</span><span class="cchip">'+esc(e.chain||'?')+'</span>'
   +'<span class="'+cls+'">'+pctStr+'</span>'
   +'<span style="color:var(--ink-faint)">'+(e.topPct!=null?'top holder '+e.topPct.toFixed(0)+'%':'top holder ?')+(themeName?' &middot; '+esc(themeName):'')+'</span>'
   +'<span style="color:var(--ink-faint)">'+fAgo(e.exitedAt)+' ago</span></div>';
 }).join('')+'</div>';
}
function journalPanel(){
 var s=journalStats();
 if(!s)return '';
 var body;
 if(s.closedN<3){
  body='<p style="font-size:12.5px;color:var(--ink-soft)">'+s.closedN+' closed position'+(s.closedN===1?'':'s')+' logged so far &mdash; your pattern builds as you close more. Every coin you un-star gets a permanent entry here: what you knew at entry, what actually happened. Nothing here gets edited or deleted.</p>';
 }else{
  body='<p style="font-size:13px;color:var(--ink-soft)"><b class="pos">'+s.wins+'</b> win'+(s.wins===1?'':'s')+' &middot; <b class="neg">'+s.losses+'</b> loss'+(s.losses===1?'':'es')+' &middot; '+s.neutral+' neutral, out of '+s.closedN+' closed positions.'
   +(s.flag?'<br><b class="neg">'+s.flag+'</b>':'')+'</p>';
 }
 return '<details class="panel journal"><summary style="cursor:pointer;font-weight:700">Your mistake-pattern journal ('+s.total+' logged)</summary>'
  +'<div style="padding-top:8px">'+body+journalList()+'</div></details>';
}
/* ---------- correlated-exposure warning: your watchlist re-read as narrative bets, not
   ticker bets ---------- */
function exposurePanel(pairs){
 var counts={};
 pairs.forEach(function(pp){(pp._tags||[]).forEach(function(k){counts[k]=(counts[k]||0)+1;});});
 var hot=Object.keys(counts).filter(function(k){return counts[k]>=2;}).sort(function(a,b){return counts[b]-counts[a];});
 if(!hot.length)return '';
 var lines=hot.map(function(k){
  var t=THEMES.filter(function(x){return x.k===k;})[0];
  return '<b>'+counts[k]+'</b> of your '+pairs.length+' watched coins are tagged <b>'+esc(t?t.name:k)+'</b>';
 });
 var covered=hot.reduce(function(s,k){return s+counts[k];},0);
 return '<div class="panel exposure"><h3>&#9888; Correlated exposure</h3><p style="font-size:12.5px;color:var(--ink-soft)">'+lines.join('; ')+' &mdash; that&rsquo;s '+covered+' tickers riding one narrative, not '+covered+' separate bets. If that narrative cools, they likely cool together.</p></div>';
}

/* ---------- profile + account menu ---------- */
function avatarUrl(seed,px){
 return 'https://api.dicebear.com/9.x/identicon/svg?seed='+encodeURIComponent(seed||'anon')+'&backgroundColor=eadfc4,f4ecd9,fdf3cf&backgroundType=solid&radius=50&size='+(px||64);
}
function accountSeed(p){p=p||state.profile||{};return (p.email||p.wallet||'anon');}
function renderAccount(){
 var p=state.profile||{};
 var seed=accountSeed(p);
 var big=avatarUrl(seed,80),sm=avatarUrl(seed,72);
 var ai=q1('avatarImg');if(ai)ai.src=sm;
 var ua=q1('umAvatar');if(ua)ua.src=big;
 var nm=q1('umName');if(nm)nm.textContent=p.name||'You';
 var sub=q1('umSub');if(sub)sub.textContent=p.email||(p.wallet?p.wallet.slice(0,6)+'…'+p.wallet.slice(-4):'')||'';
}
function loadAccount(){
 return fetch('/api/profile',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(p){
  if(p)state.profile=p;renderAccount();
 }).catch(function(){renderAccount();});
}
function toggleMenu(force){
 var m=q1('userMenu'),b=q1('avatarBtn');if(!m)return;
 var open=force!=null?force:m.hidden;
 m.hidden=!open;b.setAttribute('aria-expanded',open?'true':'false');
}
function openProfile(){
 toggleMenu(false);
 var mod=q1('pfModal');if(!mod)return;mod.hidden=false;
 q1('pfMsg').textContent='';
 var pa=q1('pfAvatar');if(pa)pa.src=avatarUrl(accountSeed(),96);
 var p=state.profile;
 if(p)fillProfileForm(p);
 fetch('/api/profile',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(pp){if(pp){state.profile=pp;fillProfileForm(pp);renderAccount();}}).catch(function(){});
}
function closeProfile(){var m=q1('pfModal');if(m)m.hidden=true;}
function fillProfileForm(p){
 var s=p.socials||{};
 q1('pfName').value=p.name||'';q1('pfBio').value=p.bio||'';
 q1('pfX').value=s.x||'';q1('pfTg').value=s.telegram||'';q1('pfSite').value=s.website||'';q1('pfGh').value=s.github||'';
 q1('profWho').textContent=p.email||(p.wallet?p.wallet.slice(0,6)+'…'+p.wallet.slice(-4):'');
 renderPfCard(p);
}
function pfLink(u,label){
 if(!u)return '';
 var href=u;
 if(/^@?[A-Za-z0-9_]{1,30}$/.test(u)){
  if(label==='X')href='https://x.com/'+u.replace(/^@/,'');
  else if(label==='TG')href='https://t.me/'+u.replace(/^@/,'');
  else if(label==='GitHub')href='https://github.com/'+u.replace(/^@/,'');
  else href='https://'+u;
 }else if(!/^https?:\/\//i.test(u)){href='https://'+u;}
 return '<a class="btn sm" href="'+esc(href)+'" target="_blank" rel="noopener nofollow">'+esc(label)+'</a>';
}
function renderPfCard(p){
 var host=q1('pfCard');if(!host)return;
 var s=p.socials||{};
 var links=[pfLink(s.x,'X'),pfLink(s.telegram,'TG'),pfLink(s.discord,'Discord'),pfLink(s.website,'Website'),pfLink(s.github,'GitHub')].filter(Boolean).join('');
 host.innerHTML='<div class="pf-card"><h3>'+esc(p.name||'Anon degen')+'</h3>'
  +(p.bio?'<div class="pf-bio">'+esc(p.bio)+'</div>':'<div class="pf-bio" style="color:var(--ink-faint)">No bio yet.</div>')
  +(links?'<div class="pf-links">'+links+'</div>':'')
  +'<div class="pf-meta">'+(p.email?esc(p.email):(p.wallet?esc(p.wallet.slice(0,6)+'…'+p.wallet.slice(-4)):'account'))+' · '+state.watch.size+' on watchlist</div></div>';
}
function submitProfile(){
 var body={name:q1('pfName').value,bio:q1('pfBio').value,socials:{x:q1('pfX').value,telegram:q1('pfTg').value,website:q1('pfSite').value,github:q1('pfGh').value}};
 var msg=q1('pfMsg');msg.style.color='var(--ink-soft)';msg.textContent='saving…';
 fetch('/api/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});}).then(function(x){
  if(x.ok){
   msg.style.color='var(--pos)';msg.textContent='saved ✓';
   var email=state.profile&&state.profile.email,wallet=state.profile&&state.profile.wallet;
   state.profile={name:x.j.name,bio:x.j.bio,socials:x.j.socials,email:email||null,wallet:wallet||null};
   renderPfCard(state.profile);renderAccount();
  }
  else{msg.style.color='var(--neg)';msg.textContent=(x.j&&x.j.error)||'could not save';}
 }).catch(function(){msg.style.color='var(--neg)';msg.textContent='could not save';});
}

/* ---------- format ---------- */
function fUsd(n){if(n==null||isNaN(n))return '-';var a=Math.abs(n);if(a>=1e9)return '$'+(n/1e9).toFixed(2)+'B';if(a>=1e6)return '$'+(n/1e6).toFixed(2)+'M';if(a>=1e3)return '$'+(n/1e3).toFixed(1)+'K';return '$'+n.toFixed(0);}
function fPrice(n){if(n==null||isNaN(n)||n===0)return '-';if(n>=1)return '$'+n.toFixed(3);if(n>=0.001)return '$'+n.toFixed(5);if(n>=1e-7)return '$'+n.toFixed(9);return '$'+n.toExponential(2);}
function fPct(n){if(n==null||isNaN(n))return '-';return (n>0?'+':'')+n.toFixed(Math.abs(n)>=100?0:1)+'%';}
function fNum(n){if(n==null||isNaN(n))return '-';var a=Math.abs(n);if(a>=1e6)return (n/1e6).toFixed(1)+'M';if(a>=1e3)return (n/1e3).toFixed(1)+'k';return ''+Math.round(n);}
function fAge(ms){if(ms==null)return '?';var m=ms/60000;if(m<90)return Math.round(m)+'m';var h=m/60;if(h<48)return h.toFixed(0)+'h';return (h/24).toFixed(0)+'d';}
function fAgo(ts){var s=(Date.now()-ts)/1000;if(s<60)return Math.round(s)+'s';if(s<3600)return Math.round(s/60)+'m';if(s<86400)return Math.round(s/3600)+'h';return Math.round(s/86400)+'d';}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];});}
function q1(s){return document.getElementById(s);}

/* ---------- api ---------- */
function chainOk(c){return !!state.chains[normChain(c)];}
function parsePair(p){
 var liq=(p.liquidity&&+p.liquidity.usd)||0;
 return {
  addr:String(p.baseToken&&p.baseToken.address||'').toLowerCase(),
  addrRaw:String(p.baseToken&&p.baseToken.address||''),
  sym:(p.baseToken&&p.baseToken.symbol)||'?',name:(p.baseToken&&p.baseToken.name)||'',
  chain:normChain(p.chainId),pairAddr:String(p.pairAddress||''),
  priceUsd:+p.priceUsd||0,mc:+p.marketCap||+p.fdv||0,fdv:+p.fdv||+p.marketCap||0,liq:liq,
  vol:{m5:(p.volume&&+p.volume.m5)||0,h1:(p.volume&&+p.volume.h1)||0,h6:(p.volume&&+p.volume.h6)||0,h24:(p.volume&&+p.volume.h24)||0},
  tx:{m5:(p.txns&&p.txns.m5)||{},h1:(p.txns&&p.txns.h1)||{},h6:(p.txns&&p.txns.h6)||{},h24:(p.txns&&p.txns.h24)||{}},
  pc:p.priceChange||{},
  ageMs:p.pairCreatedAt?Date.now()-p.pairCreatedAt:null,
  socials:((p.info&&p.info.socials)||[]).map(function(s){return {type:String(s.type||'').toLowerCase(),url:s.url};}),
  sites:((p.info&&p.info.websites)||[]).map(function(w){return w.url;}),
  img:(p.info&&p.info.imageUrl)||null,
  boosts:(p.boosts&&p.boosts.active)||0,
  url:p.url||null,desc:''
 };
}
function bestByAddr(pairs){var m={};pairs.forEach(function(p){var pp=parsePair(p);if(!pp.addr)return;if(!m[pp.addr]||pp.liq>m[pp.addr].liq)m[pp.addr]=pp;});return m;}
function dexSearch(qs){
 var c=state.searchCache.get(qs);if(c&&Date.now()-c.ts<70000)return Promise.resolve(c.pairs);
 return fetch(DEX+'/latest/dex/search?q='+encodeURIComponent(qs)).then(function(r){return r.ok?r.json():{pairs:[]};}).then(function(j){
  var m=bestByAddr(j.pairs||[]);var arr=Object.keys(m).map(function(k){return m[k];});
  state.searchCache.set(qs,{ts:Date.now(),pairs:arr});okNow();return arr;
 }).catch(function(){errNow();return [];});
}
function dexTokens(addrs){
 var need=addrs.filter(function(a){var c=state.tokenCache.get(a);return !c||Date.now()-c.ts>45000;});
 if(!need.length)return Promise.resolve();
 var batches=[];for(var i=0;i<need.length;i+=25)batches.push(need.slice(i,i+25));
 return Promise.all(batches.map(function(b){
  return fetch(DEX+'/latest/dex/tokens/'+b.join(',')).then(function(r){return r.ok?r.json():{pairs:[]};}).then(function(j){
   var m=bestByAddr(j.pairs||[]);
   b.forEach(function(a){if(m[a])state.tokenCache.set(a,{ts:Date.now(),pair:m[a]});else state.tokenCache.set(a,{ts:Date.now(),pair:null});});
  }).catch(function(){});
 }));
}
function fetchProfiles(){
 return fetch(DEX+'/token-profiles/latest/v1').then(function(r){return r.ok?r.json():[];}).then(function(j){
  var a=Array.isArray(j)?j:[];
  a.forEach(function(x){
   var addr=String(x.tokenAddress||'').toLowerCase();if(!addr)return;
   state.profiles[addr]={desc:x.description||'',links:(x.links||[]).map(function(l){return {type:String(l.type||l.label||'link').toLowerCase(),url:l.url};}),cto:!!x.cto,header:x.header||null};
  });
 }).catch(function(){});
}
function fetchTokenInfo(addr,chain,urlAddr){
 var c=state.tinfo.get(addr);if(c&&Date.now()-c.ts<600000)return Promise.resolve(c.v);
 var net=gtNet(chain||'solana');
 return gtFetch(gtUrl('/networks/'+net+'/tokens/'+(urlAddr||addr)+'/info')).then(function(r){return r.ok?r.json():null;}).then(function(j){
  var at=j&&j.data&&j.data.attributes;var v=null;
  if(at)v={desc:at.description||'',x:at.twitter_handle||'',tg:at.telegram_handle||'',discord:at.discord_url||'',sites:at.websites||[],cats:at.categories||[],cg:at.coingecko_coin_id||'',gtScore:at.gt_score,img:at.image_url||null};
  state.tinfo.set(addr,{ts:Date.now(),v:v});return v;
 }).catch(function(){state.tinfo.set(addr,{ts:Date.now(),v:null});return null;});
}
function fetchBoosts(){
 return fetch(DEX+'/token-boosts/top/v1').then(function(r){return r.ok?r.json():[];}).then(function(j){
  var a=Array.isArray(j)?j:[];
  state.boosts=a.map(function(x){return {addr:String(x.tokenAddress||'').toLowerCase(),chain:normChain(x.chainId),desc:x.description||'',amt:+x.totalAmount||+x.amount||0,links:(x.links||[]).map(function(l){return l.url;})};}).filter(function(x){return x.addr&&chainOk(x.chain);}).slice(0,30);
  okNow();
 }).catch(function(){errNow();});
}
function gtPools(net,path){
 return gtFetch(gtUrl('/networks/'+net+'/'+path+'?page=1')).then(function(r){return r.ok?r.json():null;}).then(function(j){
  var d=(j&&j.data)||[];return d.slice(0,25).map(function(pool){
   var at=pool.attributes||{},rel=pool.relationships&&pool.relationships.base_token&&pool.relationships.base_token.data;
   var addr=rel?String(rel.id||'').split('_').pop().toLowerCase():'';
   return {addr:addr,chain:net==='eth'?'ethereum':net,name:at.name||'',mc:+at.market_cap_usd||+at.fdv_usd||0,vol24:(at.volume_usd&&+at.volume_usd.h24)||0,chg:at.price_change_percentage||{},created:at.pool_created_at?Date.now()-Date.parse(at.pool_created_at):null,src:path};
  }).filter(function(t){return t.addr;});
 }).catch(function(){return [];});
}
function fetchTrending(){
 var nets=[];if(state.chains.solana)nets.push('solana');if(state.chains.base)nets.push('base');if(state.chains.bsc)nets.push('bsc');
 nets=nets.slice(0,3);if(!nets.length){state.trending=[];return Promise.resolve();}
 var reqs=[];nets.forEach(function(n){reqs.push(gtPools(n,'trending_pools'));});
 reqs.push(gtPools(nets[0],'new_pools')); // one fresh-pool pull, primary chain only
 return Promise.all(reqs).then(function(res){
  var all=[],seen={};res.forEach(function(x){x.forEach(function(t){if(seen[t.addr])return;seen[t.addr]=1;all.push(t);});});
  state.trending=all;
 });
}
function fetchSafety(addr,chain,urlAddr){
 var c=state.safety.get(addr);if(c&&Date.now()-c.ts<300000)return Promise.resolve(c);
 var done=function(res){res.ts=Date.now();state.safety.set(addr,res);return res;};
 if(chain==='solana'){
  return fetch(RUG+'/'+(urlAddr||addr)+'/report').then(function(r){return r.ok?r.json():null;}).then(function(j){
   if(!j)return done({ok:null,reasons:['no rug data'],src:'rugcheck'});
   var risks=j.risks||[];var danger=risks.filter(function(x){return String(x.level||'').toLowerCase()==='danger';}).map(function(x){return x.name;});
   var allH=(j.topHolders||[]).filter(function(h){return h.pct!=null;});
   var top=allH.filter(function(h){return !h.insider;});var topPct=top.length?top[0].pct:null;
   var lp=j.lpLockedPct!=null?j.lpLockedPct:(j.markets&&j.markets[0]&&j.markets[0].lp&&j.markets[0].lp.lpLockedPct);
   // non-LP holders: drop the one obvious pool/LP entry (a single very large stake)
   var nonLp=top.filter(function(h){return h.pct<40;});
   var top5Pct=nonLp.slice(0,5).reduce(function(s,h){return s+h.pct;},0)||null;
   var creator=j.creator||(j.fileMeta&&j.fileMeta.creator)||'';
   var devH=creator?allH.filter(function(h){return String(h.address||h.owner||'')===String(creator);})[0]:null;
   var devPct=devH?devH.pct:(j.creatorBalancePct!=null?j.creatorBalancePct:null);
   // insider SUPPLY % = sum of pct across holders RugCheck flags as insider (the metric that matters, not a wallet count)
   var insiderPct=allH.filter(function(h){return h.insider;}).reduce(function(s,h){return s+(+h.pct||0);},0);
   insiderPct=insiderPct||null;
   var insiderCount=j.graphInsidersDetected||(j.insiderNetworks||[]).reduce(function(s,n){return s+(+n.activeAccounts||+n.size||0);},0)||0;
   // bundle pattern: 4+ non-LP wallets clustered at near-identical small stakes
   var cl=nonLp.slice(0,10).filter(function(h){return h.pct>=0.25&&h.pct<=5;}).map(function(h){return h.pct;});
   var bundleSuspected=false;
   if(cl.length>=4){var mn=Math.min.apply(null,cl),mx=Math.max.apply(null,cl);if(mx-mn<=0.6)bundleSuspected=true;}
   var reasons=[];if(j.rugged)reasons.push('flagged rugged');if(j.mintAuthority)reasons.push('mint not renounced');if(j.freezeAuthority)reasons.push('freeze not renounced');
   if(topPct!=null&&topPct>25)reasons.push('top holder '+topPct.toFixed(0)+'%');if(lp!=null&&lp<50)reasons.push('LP '+lp.toFixed(0)+'% locked');
   if(devPct!=null&&devPct>5)reasons.push('dev holds '+devPct.toFixed(1)+'%');
   if(insiderPct!=null&&insiderPct>20)reasons.push('insiders hold '+insiderPct.toFixed(0)+'%');
   if(bundleSuspected)reasons.push('bundle-pattern holders');
   danger.forEach(function(d){reasons.push(d);});
   var ok=!j.rugged&&!j.mintAuthority&&!j.freezeAuthority&&!(topPct!=null&&topPct>35)&&!(devPct!=null&&devPct>5)&&!(insiderPct!=null&&insiderPct>20)&&!bundleSuspected&&!danger.length;
   recordHolders(addr,j.totalHolders);
   // feed the shared, cross-user deployer reputation ledger — today's screening becomes
   // tomorrow's protection for anyone else who runs across the same deployer wallet
   if(!ok&&creator)reportDeployerFlag(creator,chain,reasons[0]||'failed safety screen');
   return done({ok:ok,norm:j.score_normalised,reasons:reasons,lpPct:lp,holders:j.totalHolders,renounced:!j.mintAuthority&&!j.freezeAuthority,topPct:topPct,top5Pct:top5Pct,devPct:devPct,insiderPct:insiderPct,insiders:insiderCount,bundle:bundleSuspected,creator:creator||null,creatorTokens:j.creatorTokens||null,src:'rugcheck'});
  }).catch(function(){return done({ok:null,reasons:['rug check failed'],src:'rugcheck'});});
 }
 var cid=EVM_CHAIN_ID[chain];if(!cid)return Promise.resolve(done({ok:null,reasons:['no safety source for '+chain],src:'none'}));
 return fetch(HP+'?address='+addr+'&chainID='+cid).then(function(r){return r.ok?r.json():null;}).then(function(j){
  if(!j)return done({ok:null,reasons:['no honeypot data'],src:'honeypot'});
  var hp=j.honeypotResult&&j.honeypotResult.isHoneypot;var sim=j.simulationResult||{};var bt=sim.buyTax,stx=sim.sellTax;
  var reasons=[];if(hp)reasons.push('honeypot');if(stx!=null&&stx>15)reasons.push('sell tax '+stx.toFixed(0)+'%');if(bt!=null&&bt>15)reasons.push('buy tax '+bt.toFixed(0)+'%');
  var hh=j.holderAnalysis&&+j.holderAnalysis.holders;if(hh)recordHolders(addr,hh);
  return done({ok:!hp&&!(stx>25)&&!(bt>25),reasons:reasons,buyTax:bt,sellTax:stx,holders:hh,src:'honeypot'});
 }).catch(function(){return done({ok:null,reasons:['honeypot check failed'],src:'honeypot'});});
}
function fetchOhlcv(addr,pairAddr,chain){
 var c=state.ohlcv.get(addr);if(c&&Date.now()-c.ts<14000)return Promise.resolve(c.rows);
 if(!pairAddr)return Promise.resolve([]);
 var net=gtNet(chain||'solana');
 return gtFetch(gtUrl('/networks/'+net+'/pools/'+pairAddr+'/ohlcv/minute?aggregate=5&limit=90&currency=usd'),true).then(function(r){return r.ok?r.json():null;}).then(function(j){
  var rows=(j&&j.data&&j.data.attributes&&j.data.attributes.ohlcv_list)||[];rows=rows.slice().reverse();
  state.ohlcv.set(addr,{ts:Date.now(),rows:rows});return rows;
 }).catch(function(){state.ohlcv.set(addr,{ts:Date.now(),rows:[]});return [];});
}
function fetchTrades(addr,pairAddr,chain){
 if(!pairAddr)return Promise.resolve(null);
 var net=gtNet(chain||'solana');
 return gtFetch(gtUrl('/networks/'+net+'/pools/'+pairAddr+'/trades?trade_volume_in_usd_greater_than=0'),true).then(function(r){return r.ok?r.json():null;}).then(function(j){
  if(!j||!j.data)return null;
  return j.data.map(function(t){var at=t.attributes||{};
   var isBuy=at.kind==='buy';
   return {id:t.id,buy:isBuy,usd:+at.volume_in_usd||0,px:+(isBuy?at.price_to_in_usd:at.price_from_in_usd)||+at.price_from_in_usd||0,ts:Date.parse(at.block_timestamp)||Date.now(),wal:String(at.tx_from_address||'').toLowerCase()};
  });
 }).catch(function(){return null;});
}
function fomoWatchers(addr){
 if(!state.apiKey)return Promise.resolve(null);
 return fetch(FOMO+'/v2/alerts',{headers:{authorization:'Bearer '+state.apiKey}}).then(function(r){return r.ok?r.json():null;}).then(function(j){
  if(!j)return null;var a=(j.alerts||[]).filter(function(x){return String(x.tokenAddress||'').toLowerCase()===addr&&x.type==='buy';});
  var names={};a.forEach(function(x){names[x.trader]=(names[x.trader]||0)+1;});
  return {buys:a.length,traders:Object.keys(names)};
 }).catch(function(){return null;});
}
function okNow(){state.lastOk=Date.now();state.lastErr=null;}
function errNow(){state.lastErr=new Error('fetch');}

/* ---------- holder tracking ---------- */
function recordHolders(addr,n){
 if(!addr||!n||isNaN(n))return;
 var arr=state.holders[addr]||[];
 if(arr.length&&Date.now()-arr[arr.length-1].ts<180000)return;
 arr.push({ts:Date.now(),n:+n});if(arr.length>24)arr=arr.slice(-24);
 state.holders[addr]=arr;saveHold();
}
function holderRate(addr){
 var arr=state.holders[addr]||[];if(arr.length<2)return null;
 var a=arr[0],b=arr[arr.length-1];var hrs=(b.ts-a.ts)/3600000;if(hrs<0.05)return null;
 return {perHr:(b.n-a.n)/hrs,now:b.n,span:hrs};
}

/* ---------- narrative tagging ---------- */
function kwHit(hay,kw){
 if(kw.length<=3)return new RegExp('(^|[^a-z0-9])'+kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)','i').test(hay);
 return hay.indexOf(kw)>=0;
}
function tagThemes(pp){
 var hay=((pp.sym||'')+' '+(pp.name||'')+' '+(pp.desc||'')+' '+(pp.socials||[]).map(function(s){return s.url;}).join(' ')+' '+(pp.sites||[]).join(' ')).toLowerCase();
 var hits=[];
 THEMES.forEach(function(t){for(var i=0;i<t.kw.length;i++){if(kwHit(hay,t.kw[i])){hits.push(t.k);break;}}});
 return hits;
}
function typeGuess(pp){
 var hay=((pp.name||'')+' '+(pp.desc||'')+' '+(pp.sites||[]).join(' ')).toLowerCase();
 var util=/\b(protocol|staking|stake|app|platform|tool|dashboard|dex|swap|launchpad|utility|revenue|buyback|dao|governance|yield|vault|bridge|wallet|terminal|bot|infra|node)\b/.test(hay);
 var tech=/\b(ai|model|inference|chip|compute|gpu|llm|agent|neural|training|dataset|open source|sdk|api)\b/.test(hay);
 if(util&&pp.sites&&pp.sites.length)return 'utility';
 if(tech)return 'tech';
 return 'meme';
}

/* ---------- attention scoring ---------- */
function attn(pp){
 var t1=pp.tx.h1||{},t24=pp.tx.h24||{};
 var b1=+t1.buys||0,s1=+t1.sells||0,b24=+t24.buys||0,s24=+t24.sells||0;
 var skew1=(b1+s1)?b1/(b1+s1):.5,skew24=(b24+s24)?b24/(b24+s24):.5;
 var accel=pp.vol.h1>0?(pp.vol.m5*12)/pp.vol.h1:(pp.vol.m5>0?2:1);
 var ch=pp.pc||{};
 var slope=(+ch.m5||0)*0.5+(+ch.h1||0)*0.3+(+ch.h6||0)*0.2;
 var traj='steady';
 if(accel>=1.25&&skew1>=0.53&&slope>-2)traj='ramping';
 else if(accel<0.7||skew1<0.42||(+ch.h1||0)<-18)traj='fading';
 var score=30+38*(Math.min(3,accel)-1)+34*((skew1-0.5)/0.3)+slope*0.35;
 var hr=holderRate(pp.addr);if(hr&&hr.perHr>0)score+=Math.min(15,hr.perHr/6);
 if(pp.boosts)score+=6;
 return {b1:b1,s1:s1,skew1:skew1,skew24:skew24,accel:accel,slope:slope,traj:traj,score:Math.max(0,Math.min(100,Math.round(score)))};
}
function trajTag(a){return '<span class="traj '+a.traj+'">'+a.traj.toUpperCase()+'<small>attn '+a.score+'</small></span>';}
/* ---------- pick-quality gates (why a coin is worth your attention) ---------- */
var MIN_MC=7000,MIN_LIQ=5000;
function pumpFun(pp){return pp.chain==='solana'&&/pump$/i.test(pp.addrRaw||pp.addr||'');}
/* ---------- deployer reputation ledger (server-backed, shared across every user) ----------
   Every hard-excluded deployer wallet from anyone's screening feeds one shared Supabase table
   (api/intel.js -> deployer_flags), so a wallet flagged from someone else's session an hour ago
   already shows up here. Fire-and-forget on write; a real lookup on every x-ray open. */
function reportDeployerFlag(addr,chain,reason){
 try{fetch('/api/intel?kind=deployer_flag',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({addr:addr,chain:chain||'',reason:reason})}).catch(function(){});}catch(_){}
}
function deployerRepPanel(sf){
 if(!sf||!sf.creator)return Promise.resolve('');
 return fetch('/api/intel?kind=deployer&addr='+encodeURIComponent(sf.creator)).then(function(r){return r.ok?r.json():null;}).then(function(j){
  var f=j&&j.flag;
  if(!f||!f.flag_count)return '';
  return '<div class="panel"><h3>&#9888; Deployer reputation (shared history)</h3>'
   +'<p style="font-size:12.5px;color:var(--ink-soft)">This deployer wallet has been flagged <b class="neg">'+f.flag_count+' time'+(f.flag_count>1?'s':'')+'</b> across everyone&rsquo;s screenings on this tool, not just this coin: '+esc((f.reasons||[]).join(', ')||'failed safety screen')+'. First seen '+fAgo(Date.parse(f.first_flagged_at))+' ago.</p>'
   +'</div>';
 }).catch(function(){return '';});
}
/* ---------- narrative half-life corpus (server-backed, grows across every coin x-rayed) ----------
   Every x-ray open silently logs {theme, age, attention score} to a shared table. Once enough
   samples exist for a theme, buckets them by age and shows where THIS coin sits on the curve —
   descriptive placement against past pattern, never a forecast. Thin at first; grows on its own. */
var PULSE_BUCKETS=[0,1,3,7,14,30];
function reportPulse(theme,pp,a){
 if(!theme||pp.ageMs==null)return;
 try{fetch('/api/intel?kind=pulse',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({theme:theme,addr:pp.addr,chain:pp.chain,sym:pp.sym,ageDays:pp.ageMs/864e5,attnScore:a.score,mc:pp.mc||null})}).catch(function(){});}catch(_){}
}
function narrativePulsePanel(theme,pp,a){
 if(!theme)return Promise.resolve('');
 return fetch('/api/intel?kind=pulse&theme='+encodeURIComponent(theme)).then(function(r){return r.ok?r.json():null;}).then(function(j){
  var rows=(j&&j.rows)||[];
  if(rows.length<15)return '<div class="panel"><h3>Narrative half-life</h3><p style="font-size:12.5px;color:var(--ink-soft)">Only '+rows.length+' logged sample'+(rows.length===1?'':'s')+' for this narrative so far &mdash; this builds up across every coin anyone x-rays. Check back as more data comes in.</p></div>';
  var buckets=PULSE_BUCKETS.map(function(d,i){
   var hi=PULSE_BUCKETS[i+1]!=null?PULSE_BUCKETS[i+1]:Infinity;
   var vals=rows.filter(function(r){return r.age_days>=d&&r.age_days<hi&&r.attn_score!=null;}).map(function(r){return r.attn_score;}).sort(function(a2,b2){return a2-b2;});
   var med=vals.length?vals[Math.floor(vals.length/2)]:null;
   return {d:d,med:med,n:vals.length};
  });
  var curDays=pp.ageMs/864e5;
  var curBucketIdx=0;for(var i=0;i<PULSE_BUCKETS.length;i++)if(curDays>=PULSE_BUCKETS[i])curBucketIdx=i;
  var mx=Math.max.apply(null,buckets.map(function(b){return b.med||0;}))||1;
  var bars=buckets.map(function(b,i){
   var h=b.med!=null?Math.max(4,Math.round(b.med/mx*60)):2;
   return '<div class="hlbar'+(i===curBucketIdx?' cur':'')+'"><i style="height:'+h+'px"></i><span>'+(b.d===0?'launch':b.d+'d+')+'</span></div>';
  }).join('');
  return '<div class="panel"><h3>Narrative half-life</h3>'
   +'<p style="font-size:12.5px;color:var(--ink-soft)">Median attention score by age, across '+rows.length+' logged coins in this narrative &mdash; not this coin&rsquo;s own history, the category&rsquo;s. This coin is '+curDays.toFixed(1)+' day'+(curDays>=2||curDays<1?'s':'')+' in (highlighted bucket). Descriptive pattern, not a forecast.</p>'
   +'<div class="hlbars">'+bars+'</div>'
   +'</div>';
 }).catch(function(){return '';});
}
/* ---------- cross-coin wallet sightings (server-backed) ----------
   Every x-ray logs its visible early-buyer wallets (already pulled for the live trade tape, no
   new fetch) to a shared table, then checks whether any of THIS coin's wallets have shown up
   early on other tracked launches before — a documented pattern, stated as fact, never a signal. */
function reportWalletSightings(pp,wals){
 if(!wals||!wals.length)return;
 try{fetch('/api/intel?kind=sightings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({addr:pp.addr,chain:pp.chain,sym:pp.sym,mc:pp.mc||null,wals:wals})}).catch(function(){});}catch(_){}
}
function walletSightingsPanel(pp,wals){
 if(!wals||!wals.length)return Promise.resolve('');
 return fetch('/api/intel?kind=sightings&wals='+encodeURIComponent(wals.join(','))+'&addr='+encodeURIComponent(pp.addr)).then(function(r){return r.ok?r.json():null;}).then(function(j){
  var s=(j&&j.sightings)||[];
  if(!s.length)return '';
  var byWal={};s.forEach(function(x){(byWal[x.wal]=byWal[x.wal]||[]).push(x);});
  var wallets=Object.keys(byWal).sort(function(a,b){return byWal[b].length-byWal[a].length;}).slice(0,5);
  var rows=wallets.map(function(w){
   var hits=byWal[w],syms=hits.slice(0,4).map(function(h){return '$'+esc(h.sym||'?');}).join(', ');
   return '<div class="wtrow"><span>'+esc(walShort(w))+'</span><span style="color:var(--ink-faint)">early on '+hits.length+' other tracked coin'+(hits.length>1?'s':'')+': '+syms+'</span></div>';
  }).join('');
  return '<div class="panel"><h3>Cross-coin wallet sightings</h3>'
   +'<p style="font-size:12.5px;color:var(--ink-soft)">'+wallets.length+' of this coin&rsquo;s early buyer'+(wallets.length>1?'s':'')+' also bought early on other coins tracked by this tool. Fact, not a signal &mdash; being early elsewhere isn&rsquo;t good or bad on its own.</p>'
   +'<div class="wtrows">'+rows+'</div>'
   +'</div>';
 }).catch(function(){return '';});
}
/* ---------- bonding-curve graduation radar ----------
   Pump.fun-style tokens trade on an internal bonding curve until they cross a market-cap
   threshold (commonly documented around $69k), at which point liquidity migrates to a real AMM
   pool (Raydium/PumpSwap) — a genuine structural discontinuity, not a smooth continuation.
   This tool has no direct read on the bonding-curve program's own reserve state (that needs a
   Solana RPC call this stack doesn't make) — it only has DexScreener's market cap, so the
   progress bar below is an honest approximation, explicitly labeled as one. */
var GRAD_THRESHOLD_USD=69000;
function graduationPanel(pp){
 if(!(pp.chain==='solana'&&pumpFun(pp)))return '';
 var mc=pp.mc||0;
 if(mc>=GRAD_THRESHOLD_USD*1.15){
  return '<div class="panel"><h3>Bonding-curve graduation</h3><p style="font-size:12.5px;color:var(--ink-soft)">Already well past the commonly-cited ~'+fUsd(GRAD_THRESHOLD_USD)+' Pump.fun graduation mark &mdash; this is very likely trading on a real AMM pool now, not the bonding curve itself.</p></div>';
 }
 var pct=Math.max(1,Math.min(100,Math.round(mc/GRAD_THRESHOLD_USD*100)));
 var remaining=Math.max(0,GRAD_THRESHOLD_USD-mc);
 var cls=pct>=85?'watch':pct<25?'neg':'';
 return '<div class="panel"><h3>Bonding-curve graduation</h3>'
  +'<p style="font-size:12.5px;color:var(--ink-soft)">Approaching the market cap where Pump.fun bonding-curve launches historically migrate to a real AMM pool. At that migration, liquidity resets into a brand-new pool &mdash; a real structural break in depth (and often price), not a smooth continuation of the curve.</p>'
  +'<div class="grad-bar"><i class="'+cls+'" style="width:'+pct+'%"></i></div>'
  +'<p style="font-size:12px;color:var(--ink-soft);margin-top:6px">'+fUsd(mc)+' of ~'+fUsd(GRAD_THRESHOLD_USD)+' ('+pct+'%) &mdash; roughly '+fUsd(remaining)+' of market-cap growth left at this rate of approximation.</p>'
  +'<p style="font-size:11px;color:var(--ink-faint);margin-top:8px">Approximate: reads DexScreener&rsquo;s market cap, not the bonding-curve program&rsquo;s own on-chain reserve state, and the real threshold has varied historically. Directional, not exact — and not a timing signal.</p>'
  +'</div>';
}
/* ---------- copycat cohort ranking ----------
   Clusters live DexScreener search results by shared name/ticker keywords to answer "of every
   coin riding this exact meme right now, where does THIS one rank" — in a copycat wave, at most
   one usually survives, so the cohort-relative rank matters more than any single coin's own
   numbers. Fetched async (a live search), never blocks the rest of the x-ray render. */
function coreNameTokens(s){
 return String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
  .filter(function(w){return w.length>=3&&!/^(coin|token|the|inu|sol|eth|bsc|base|pump|meme|coins|tokens|official|new|v2)$/.test(w);});
}
function cohortPanel(pp){
 var toks=coreNameTokens(pp.name||pp.sym);
 if(!toks.length)return Promise.resolve('');
 return dexSearch(toks[0]).then(function(pairs){
  var self=pp.addr;
  var cohort=pairs.filter(function(x){
   if(!chainOk(x.chain))return false;
   if(x.addr===self)return true;
   var xt=coreNameTokens(x.name||x.sym);
   return toks.some(function(t){return xt.indexOf(t)>=0;});
  });
  var byAddr={};cohort.forEach(function(x){if(!byAddr[x.addr]||(x.liq||0)>(byAddr[x.addr].liq||0))byAddr[x.addr]=x;});
  if(!byAddr[self])byAddr[self]=pp; // guarantee self is present even if the search paginated it out
  var arr=Object.keys(byAddr).map(function(k){return byAddr[k];});
  if(arr.length<2)return ''; // no real cohort — don't force a comparison that isn't there
  arr.sort(function(a,b){return (b.liq||0)-(a.liq||0);});
  var rank=arr.map(function(x){return x.addr;}).indexOf(self)+1;
  var rows=arr.slice(0,6).map(function(x,i){
   var isSelf=x.addr===self;
   return '<div class="chrow'+(isSelf?' me':'')+'"><span>#'+(i+1)+'</span><span>$'+esc(x.sym)+(isSelf?' <i>(this one)</i>':'')+'</span><span class="cchip">'+esc(x.chain)+'</span><span style="color:var(--ink-faint)">'+fUsd(x.liq)+' liq</span><span style="color:var(--ink-faint)">'+fAge(x.ageMs)+' old</span></div>';
  }).join('');
  return '<div class="panel"><h3>Copycat cohort</h3>'
   +'<p style="font-size:12.5px;color:var(--ink-soft)">'+arr.length+' live coin'+(arr.length>1?'s':'')+' share a name keyword with $'+esc(pp.sym)+' right now. In a copycat wave at most one usually survives &mdash; by liquidity, this one ranks <b>#'+rank+' of '+arr.length+'</b> in its own cohort.</p>'
   +'<div class="chrows">'+rows+'</div>'
   +'<p style="font-size:11px;color:var(--ink-faint);margin-top:8px">Matched on shared name keywords via a live DexScreener search, not a verified relationship &mdash; some matches may be coincidental, and a real original can still rank low right after a fresh copy launches.</p>'
   +'</div>';
 }).catch(function(){return '';});
}

/* ---------- survival curve (pattern-in-the-chaos: base-rate death odds by age) ----------
   Sourced from published launch-cohort studies, not a prediction model:
   - CoinGecko, "Average Lifespan of Pump.fun Memecoins Is Less Than a Day" (2026)
   - arXiv 2607.02823, Pump.fun Graduation Regime Windows: Survival Analysis of 832,941 Token Launches (2026)
   - arXiv 2512.11850, The Memecoin Phenomenon: An In-Depth Study of Solana's Blockchain Trends
   Step function, not interpolation: each row is "% of launches from these studies that were still
   trading past this age." We show whichever bucket a coin has already cleared. */
var SURVIVAL_CURVE=[
 {days:0, survivePct:100, note:'just launched — the highest-mortality window there is'},
 {days:1, survivePct:19.6, note:'past day one — ~80% of Pump.fun launches are already dead by here'},
 {days:3, survivePct:15.5, note:'past 3 days — clears the worst of the cohort, still early'},
 {days:7, survivePct:12.1, note:'past a week — under 1 in 8 launches make it this far'},
 {days:14,survivePct:9.6, note:'past two weeks — rare air for a fresh memecoin'},
 {days:90,survivePct:5.0, note:'past 90 days — only ~5% of Pump.fun launches ever get here'}
];
function survivalStage(pp){
 if(pp.ageMs==null)return null;
 var days=pp.ageMs/864e5;
 var row=SURVIVAL_CURVE[0];
 for(var i=0;i<SURVIVAL_CURVE.length;i++){if(days>=SURVIVAL_CURVE[i].days)row=SURVIVAL_CURVE[i];}
 var idx=SURVIVAL_CURVE.indexOf(row);
 var frac=idx/(SURVIVAL_CURVE.length-1); // 0..1 position for the gauge marker
 var sourced=pp.chain==='solana'&&pumpFun(pp);
 return {days:days,survivePct:row.survivePct,note:row.note,frac:frac,sourced:sourced,bucketDays:row.days};
}
/* ---------- long-term research score: THIS coin's own signals, not the cohort's age -----------
   Five weighted factors, each grounded in a specific published finding:
   - Holder safety (32%): concentration/bundle/renounce/LP. MemeTrans + MELT research measured the
     holder-concentration signal ~64% stronger than the trader/volume signal on a risk-adjusted
     basis, so it carries the single biggest weight here.
   - Liquidity depth (20%): thin liquidity vs mc is what lets a small wallet move price violently
     and makes an exit hard; a Pump.fun-graduated pool with healthy liq/mc is a different animal
     from a curve that barely cleared the bonding threshold.
   - Organic holder growth (18%): steady accumulation over an hour beats a single volume spike.
   - Volume authenticity (15%): balanced buy/sell flow and a sane vol/mc ratio; the 98.6%
     pump-or-rug figure from Pump.fun cohort studies is disproportionately the lopsided, wash-y
     side of that ratio.
   - Project surface (15%): a real description + socials + catalysts is the closest public proxy
     for "something exists here besides the chart." */
function fHolderSafety(sf){
 if(!sf)return {v:0.5,note:'rug-check data unavailable'};
 // a fetch failure/rate-limit/not-yet-indexed coin gets constructed client-side as a same-shaped
 // sf object with every field null and ok:null (see fetchSafety's 'no rug data' branches) — that
 // is NOT the same thing as "checked, no flags found", and must never be scored as clean. Real
 // case that shipped this bug: a coin with 80% single-wallet concentration scored ~50-70/100
 // because RugCheck's fetch had failed and the empty placeholder read as a perfect holder-safety
 // factor (32% of the total score) instead of "unknown".
 var hasData=sf.topPct!=null||sf.devPct!=null||sf.insiderPct!=null||sf.bundle||sf.renounced!=null||sf.lpPct!=null||sf.ok===true||sf.ok===false;
 if(!hasData)return {v:0.5,note:(sf.reasons&&sf.reasons[0])||'safety check unavailable — verify manually'};
 var v=1,notes=[];
 if(sf.topPct!=null){notes.push('top holder '+sf.topPct.toFixed(1)+'%');v-=Math.max(0,sf.topPct-8)/40;}
 if(sf.devPct!=null){notes.push('dev '+sf.devPct.toFixed(1)+'%');v-=Math.min(0.3,sf.devPct/12);}
 if(sf.insiderPct!=null){notes.push('insiders '+sf.insiderPct.toFixed(0)+'%');v-=Math.min(0.3,sf.insiderPct/70);}
 if(sf.bundle){notes.push('bundle pattern');v-=0.35;}
 if(sf.renounced===false){notes.push('not renounced');v-=0.15;}
 if(sf.lpPct!=null&&sf.lpPct<50){notes.push('LP '+Math.round(sf.lpPct)+'% locked');v-=0.15;}
 if(sf.ok===false)v=Math.min(v,0.15);
 return {v:Math.max(0,Math.min(1,v)),note:notes.length?notes.join(' &middot; '):'no rug-check flags'};
}
function fLiquidity(pp){
 if(!pp.liq||!pp.mc)return {v:0.3,note:'liquidity/mc unavailable'};
 var ratio=pp.liq/pp.mc,v=Math.min(1,ratio/0.12);
 if(pp.liq<5000)v=Math.min(v,0.15);
 return {v:v,note:fUsd(pp.liq)+' liq &middot; '+(ratio*100).toFixed(1)+'% of mc'};
}
function fGrowth(hr){
 if(hr&&hr.perHr!=null)return {v:Math.max(0,Math.min(1,(hr.perHr+10)/60)),note:(hr.perHr>=0?'+':'')+Math.round(hr.perHr)+' holders/hr'};
 return {v:0.35,note:'holder trend still tracking'};
}
function fVolume(pp,a){
 var v=1,notes=[];
 var skewDist=Math.abs(a.skew1-0.5);
 if(skewDist>0.35){v-=0.3;notes.push('lopsided buy/sell');}
 var vmc=pp.mc?(pp.vol.h24||0)/pp.mc:0;
 if(vmc>6){v-=0.35;notes.push('vol/mc '+vmc.toFixed(1)+'x &mdash; wash-trade risk');}
 else if(vmc<0.02){v-=0.2;notes.push('vol/mc thin &mdash; low real interest');}
 else notes.push('vol/mc '+vmc.toFixed(2)+'x');
 return {v:Math.max(0,Math.min(1,v)),note:notes.join(' &middot; ')};
}
function fProject(proj){return {v:(proj.surface||0)/4,note:proj.surface+'/4 surface (desc/site/socials/cats)'};}
function longTermScore(pp,a,sf,hr,proj){
 var H=fHolderSafety(sf),L=fLiquidity(pp),G=fGrowth(hr),V=fVolume(pp,a),P=fProject(proj);
 var pct=Math.round(100*(0.32*H.v+0.20*L.v+0.18*G.v+0.15*V.v+0.15*P.v));
 // a pool with next to no liquidity can't be exited, full stop — no combination of the other
 // four factors is allowed to read that as anything but high risk (real case: a coin with $0.08
 // of liquidity scored 34-70 before this, purely from the non-liquidity factors landing fine)
 if(pp.liq!=null&&pp.liq<500)pct=Math.min(pct,20);
 var label,cls;
 if(pct>=68){label='BUILT TO LAST';cls='pos';}
 else if(pct>=48){label='HAS SOME LEGS';cls='';}
 else if(pct>=28){label='SPECULATIVE';cls='watch';}
 else{label='HIGH RUG RISK';cls='neg';}
 return {pct:pct,label:label,cls:cls,factors:[
  {k:'Holder safety',v:H.v,note:H.note},
  {k:'Liquidity depth',v:L.v,note:L.note},
  {k:'Organic growth',v:G.v,note:G.note},
  {k:'Volume authenticity',v:V.v,note:V.note},
  {k:'Project surface',v:P.v,note:P.note},
 ]};
}
/* ---------- score history: is this coin's fundamentals improving or decaying, not just a snapshot ----------
   Same client-side pattern as holder-rate tracking: a capped, deduped local history per address.
   Min 10-minute spacing keeps it a trend across visits, not noise from re-rendering the same scan. */
function recordScore(addr,pct){
 if(!addr||pct==null)return;
 var arr=state.scores[addr]||[];
 if(arr.length&&Date.now()-arr[arr.length-1].ts<600000)return;
 arr.push({ts:Date.now(),v:pct});if(arr.length>60)arr=arr.slice(-60);
 state.scores[addr]=arr;saveScores();
}
function scoreTrend(addr){
 var arr=state.scores[addr]||[];if(arr.length<2)return null;
 var first=arr[0],last=arr[arr.length-1];
 return {from:first.v,to:last.v,delta:last.v-first.v,spanMs:last.ts-first.ts,points:arr};
}
function scoreTrendHtml(addr){
 var t=scoreTrend(addr);
 if(!t)return '<p class="rscore-age">Trend builds as you revisit this coin &mdash; only one scan recorded so far.</p>';
 var arrow=t.delta>0?'&#9650;':t.delta<0?'&#9660;':'&#8213;';
 var cls=t.delta>0?'pos':t.delta<0?'neg':'';
 var mins=Math.round(t.spanMs/60000);
 var span=mins<60?mins+'m':(mins/60).toFixed(1)+'h';
 var bars=t.points.map(function(p){return '<i style="height:'+Math.max(8,Math.round(p.v))+'%" class="'+(p.v>=68?'pos':p.v<=28?'neg':'')+'"></i>';}).join('');
 return '<div class="score-trend"><div class="score-trend-bars">'+bars+'</div>'
  +'<p class="rscore-age"><span class="'+cls+'">'+arrow+' '+(t.delta>0?'+':'')+t.delta+'</span> vs '+span+' ago (was '+t.from+'/100) &mdash; tracked from your own visits to this coin.</p></div>';
}
function researchScorePanel(pp,a,sf,hr,proj){
 var s=longTermScore(pp,a,sf,hr,proj);
 recordScore(pp.addr,s.pct);
 var surv=survivalStage(pp);
 var ringCol=s.cls==='neg'?'var(--neg)':s.cls==='watch'?'var(--hot)':'var(--pos)';
 var deg=(s.pct*3.6).toFixed(0);
 var ring='conic-gradient('+ringCol+' 0deg '+deg+'deg,rgba(44,53,80,.14) '+deg+'deg 360deg)';
 var rows=s.factors.map(function(f){
  var pct=Math.round(f.v*100),cls=pct>=65?'pos':pct<=35?'neg':'';
  return '<div class="rfrow"><div class="rfhead"><span>'+esc(f.k)+'</span><b class="'+cls+'">'+pct+'</b></div>'
   +'<div class="rfbar"><i class="'+cls+'" style="width:'+pct+'%"></i></div>'
   +'<p class="rfnote">'+f.note+'</p></div>';
 }).join('');
 var ageLine=surv?('<p class="rscore-age">'+fAge(pp.ageMs)+' old'+(surv.sourced?' &mdash; '+surv.survivePct+'% of Pump.fun launches are still trading at this age or older (context, not part of the score).':'.')+'</p>'):'';
 return '<div class="panel rscore"><h3>Long-term research score</h3>'
  +'<div class="rscore-top"><div class="score-ring" style="background:'+ring+'"><div class="score-ring-inner"><b>'+s.pct+'</b><span>/100</span></div></div>'
  +'<div class="rscore-verdict"><div class="rscore-label '+s.cls+'">'+s.label+'</div>'
  +'<p class="rscore-sub">Weighted from this coin&rsquo;s own holder concentration, liquidity depth, holder growth, volume authenticity and project surface &mdash; not its age.</p>'
  +ageLine+'</div></div>'
  +'<div class="rfactors">'+rows+'</div>'
  +scoreTrendHtml(pp.addr)
  +'<p class="rscore-cite">Weights informed by published research: holder-concentration signal measured ~64% stronger than trader/volume signal (MemeTrans/MELT); Pump.fun cohort base rates from CoinGecko Research, arXiv 2607.02823 and arXiv 2512.11850. A heuristic score from public on-chain data &mdash; not financial advice.</p>'
  +'</div>';
}
/* ---------- exit-liquidity depth curve + sizing calculator ----------
   The one number every dashboard skips: not "how much liquidity is in the pool" but "what does
   it actually cost ME to get out at size X". Approximated as a balanced constant-product AMM —
   average price impact of a trade of size x against a pool with combined liquidity L is
   x / (L/2 + x), the standard xy=k approximation when only the total USD liquidity is known
   (no exact reserve split). Concentrated-liquidity (CLMM) pools with lopsided ranges can differ
   from this meaningfully — called out explicitly rather than presented as exact. */
/* ---------- quick stats grid — GMGN-style: every important number visible above the fold,
   no scrolling into the long panels below just to see the basics. Each tile is one fact with a
   plain-language tooltip, same data the long panels use, just surfaced first. ---------- */
function qsTile(label,value,cls,tip){
 return '<div class="qst'+(cls?' '+cls:'')+'" title="'+esc(tip||'')+'"><div class="qst-v">'+value+'</div><div class="qst-l">'+esc(label)+'</div></div>';
}
function quickStatsGrid(pp,a,sf,hr,proj){
 var s=longTermScore(pp,a,sf,hr,proj);
 var tiles=[];
 tiles.push(qsTile('Score',s.pct+'/100',s.cls,'Overall research score out of 100. Weighted from this coin\'s holder safety, liquidity depth, holder growth, volume authenticity and project surface.'));
 tiles.push(qsTile('Liquidity',fUsd(pp.liq),pp.liq==null?'':pp.liq<500?'neg':pp.liq<5000?'watch':'pos','Total value sitting in the trading pool right now. This is what actually backs your ability to exit a position.'));
 if(sf&&sf.topPct!=null)tiles.push(qsTile('Top holder',sf.topPct.toFixed(1)+'%',sf.topPct>35?'neg':sf.topPct>15?'watch':'pos','The single largest holder wallet\'s share of total supply, excluding the pool itself.'));
 if(sf&&sf.devPct!=null)tiles.push(qsTile('Dev holds',sf.devPct.toFixed(1)+'%',sf.devPct>10?'neg':sf.devPct>3?'watch':'pos','How much of the supply the deployer wallet itself still holds right now.'));
 if(sf&&sf.lpPct!=null)tiles.push(qsTile('LP locked',sf.lpPct.toFixed(0)+'%',sf.lpPct<50?'neg':'pos','Share of the liquidity pool that is locked. Locked liquidity cannot be pulled out by the team.'));
 if(sf&&sf.insiderPct!=null&&sf.insiderPct>0)tiles.push(qsTile('Insiders',sf.insiderPct.toFixed(0)+'%',sf.insiderPct>20?'neg':'watch','Combined supply share held by wallets flagged as insiders.'));
 tiles.push(qsTile('Bundle',sf&&sf.bundle?'yes':'no',sf&&sf.bundle?'neg':'pos','Whether several wallets bought in near identical amounts right at launch, a common sign of a coordinated snipe rather than organic buying.'));
 tiles.push(qsTile('Renounced',sf&&sf.renounced===true?'yes':sf&&sf.renounced===false?'no':'?',sf&&sf.renounced===false?'neg':sf&&sf.renounced===true?'pos':'','Whether the deployer has given up mint and freeze authority over the token.'));
 var exitImp=exitImpactPct(5000,pp.liq);
 if(exitImp!=null)tiles.push(qsTile('Exit $5k',exitImp.toFixed(1)+'%',exitImp>=25?'neg':exitImp>=8?'watch':'pos','Estimated price impact of exiting a $5,000 position right now, at this pool\'s current depth. An estimate, not a guarantee.'));
 tiles.push(qsTile('Age',fAge(pp.ageMs),'','Time since this trading pair was created on-chain.'));
 return '<div class="qsg">'+tiles.join('')+'</div>';
}
function exitImpactPct(sizeUsd,liqUsd){
 if(!liqUsd||liqUsd<=0||!sizeUsd||sizeUsd<=0)return null;
 var half=liqUsd/2;
 return sizeUsd/(half+sizeUsd)*100;
}
function exitLiquidityPanel(pp){
 var liq=pp.liq;
 if(!liq)return '<div class="panel"><h3>Exit-liquidity sizing</h3><p style="font-size:12.5px;color:var(--ink-soft)">No pool liquidity figure available yet for this coin.</p></div>';
 var sizes=[500,5000,25000,100000];
 var rows=sizes.map(function(x){
  var imp=exitImpactPct(x,liq);
  var net=x*(1-imp/100);
  var cls=imp>=25?'neg':imp>=8?'watch':'pos';
  return '<div class="exd-row"><span>'+fUsd(x)+' exit</span><span class="'+cls+'">~'+imp.toFixed(1)+'% impact</span><span style="color:var(--ink-faint)">net ~'+fUsd(net)+'</span></div>';
 }).join('');
 return '<div class="panel exd">'
  +'<h3>Exit-liquidity sizing</h3>'
  +'<p style="font-size:12.5px;color:var(--ink-soft);margin-bottom:8px">Not the flat liquidity number &mdash; the estimated cost of actually exiting a position at this pool&rsquo;s current depth ('+fUsd(liq)+' total). Modeled as a balanced constant-product pool; a concentrated-liquidity (CLMM) pool with a lopsided range can behave differently. Math only, not a recommendation of size or timing.</p>'
  +'<div class="exd-table">'+rows+'</div>'
  +'<div class="exd-calc"><label for="exitCalcInput">Your size ($)</label><input id="exitCalcInput" type="text" inputmode="decimal" placeholder="e.g. 2000" data-f="exitsize"><span id="exitCalcOut" class="exd-out">&nbsp;</span></div>'
  +'</div>';
}
function exitCalcUpdate(val){
 var out=q1('exitCalcOut'),pp=state.rcPair;if(!out||!pp)return;
 var x=parseFloat(String(val||'').replace(/[^0-9.]/g,''));
 if(!x||isNaN(x)||!pp.liq){out.innerHTML='&nbsp;';return;}
 var imp=exitImpactPct(x,pp.liq),net=x*(1-imp/100);
 var cls=imp>=25?'neg':imp>=8?'watch':'pos';
 out.innerHTML='&asymp; <b class="'+cls+'">'+imp.toFixed(1)+'%</b> impact &middot; net &asymp; '+fUsd(net);
}

/* ---------- narrative comps: how does THIS coin's story/structure rhyme with a real mega-runner ----------
   Every figure below is a real, sourced milestone for that coin (launch date, ATH market cap, days
   launch-to-ATH). Matching is on narrative tag + launch mechanism + chain family, not price action —
   this is "closest archetype," never a price prediction. These five are the tiny survivor population;
   the panel says so explicitly so it never reads as "this will do what X did." */
var REFERENCE_COMPS=[
 {key:'pepe',name:'PEPE',theme:'frog',chainFam:'evm',fairLaunch:true,launched:'Apr 2023',athMc:1.6e9,daysToAth:21,
  note:'stealth fair launch &mdash; no presale, LP burnt, contract renounced. Became the template pump.fun-style fair launches copy.',
  src:'CoinGecko / CoinMarketCap'},
 {key:'wif',name:'dogwifhat (WIF)',theme:'dog',chainFam:'solana',fairLaunch:true,launched:'Nov 2023',athMc:2.2e9,daysToAth:132,
  note:'pure narrative, no utility &mdash; a literal photo of a dog in a hat. ATH hit on a Binance listing announcement.',
  src:'CoinMarketCap Academy'},
 {key:'bonk',name:'BONK',theme:'dog',chainFam:'solana',fairLaunch:true,launched:'Dec 2022',athMc:4.06e9,daysToAth:700,
  note:'50% of supply airdropped free to the Solana community &mdash; distribution did the work marketing usually does.',
  src:'CoinMarketCap / Decrypt'},
 {key:'shib',name:'Shiba Inu (SHIB)',theme:'dog',chainFam:'evm',fairLaunch:false,launched:'Aug 2020',athMc:42.25e9,daysToAth:453,
  note:'built a real ecosystem (ShibaSwap) around the meme before its 2021 peak &mdash; added utility after launch, not before.',
  src:'CoinMarketCap'},
 {key:'doge',name:'Dogecoin (DOGE)',theme:'dog',chainFam:'own-chain',fairLaunch:true,launched:'Dec 2013',athMc:88e9,daysToAth:2711,
  note:'took nearly 8 years and an Elon-driven mania to peak &mdash; proof a meme with staying power is measured in years, not weeks.',
  src:'CoinMarketCap'},
];
function fairLaunchLikely(sf){
 if(!sf||sf.src!=='rugcheck')return null;
 return sf.renounced===true&&(sf.devPct==null||sf.devPct<3)&&(sf.topPct==null||sf.topPct<15)&&!sf.bundle;
}
function chainFamily(chain){
 if(chain==='solana')return 'solana';
 if(chain==='ethereum'||chain==='base'||chain==='bsc'||chain==='arbitrum'||chain==='polygon')return 'evm';
 return 'other';
}
function bestComp(tags,pp,sf){
 var fl=fairLaunchLikely(sf),fam=chainFamily(pp.chain);
 var scored=REFERENCE_COMPS.map(function(c){
  var s=0;
  if(tags.indexOf(c.theme)>=0)s+=0.55;
  if(fam===c.chainFam)s+=0.25;
  if(fl!=null&&fl===c.fairLaunch)s+=0.20;
  return {c:c,s:s};
 });
 scored.sort(function(x,y){return y.s-x.s;});
 return scored[0].s>=0.5?scored[0]:null;
}
function compPanel(pp,sf,tags){
 var m=bestComp(tags,pp,sf);
 if(!m){
  return '<div class="panel"><h3>Narrative comp</h3>'
   +'<p style="font-size:12.5px;color:var(--ink-soft)">No strong match against the reference set below. Dog and frog metas dominate the mega-runners on record &mdash; a coin outside those narratives needs its own catalyst; it doesn&rsquo;t inherit one from a legend.</p>'
   +'<p style="font-size:11px;color:var(--ink-faint);margin-top:6px">Reference set: PEPE, WIF, BONK, SHIB, DOGE &mdash; sourced milestones, not a prediction model.</p></div>';
 }
 var c=m.c;
 var ageDays=pp.ageMs!=null?pp.ageMs/864e5:null;
 var stageLine=ageDays!=null
  ?'This coin is <b>'+fAge(pp.ageMs)+'</b> in. '+esc(c.name)+' took <b>'+c.daysToAth+' days</b> from launch to its '+fUsd(c.athMc)+' peak.'
  :'';
 return '<div class="panel"><h3>Narrative comp</h3>'
  +'<div class="kv">'
  +kv('closest archetype',esc(c.name))
  +kv('shared traits',(tags.indexOf(c.theme)>=0?esc(c.theme)+' narrative':'')+((fairLaunchLikely(sf)===c.fairLaunch)?' &middot; '+(c.fairLaunch?'fair launch':'insider-allocated launch'):'')+(chainFamily(pp.chain)===c.chainFam?' &middot; '+esc(c.chainFam):''))
  +kv(esc(c.name)+' launched',esc(c.launched))
  +kv(esc(c.name)+' ATH mc',fUsd(c.athMc)+' ('+c.daysToAth+'d from launch)')
  +'</div>'
  +'<p style="font-size:12.5px;color:var(--ink-soft);margin-top:9px">'+c.note+'</p>'
  +(stageLine?'<p style="font-size:12.5px;color:var(--ink-soft);margin-top:6px">'+stageLine+'</p>':'')
  +'<p style="font-size:11px;color:var(--ink-faint);margin-top:8px">Matched on narrative + launch structure, not price action. '+esc(c.name)+' is a survivor &mdash; most coins in its own cohort went to zero, per the research cited above. Source: '+c.src+'.</p>'
  +'</div>';
}
/* ---------- deployer history: does this creator wallet have a track record ----------
   RugCheck's report carries creatorTokens — every other mint the same wallet deployed, with the
   market cap it reached and when. That's a real, checkable "has this wallet done this before"
   signal, not a guess. Market cap crossing a Pump.fun-graduation-ish $50k line is used as a rough
   traction proxy since we don't have a rugged/not-rugged flag per historical launch. */
function deployerPanel(sf){
 if(!sf||sf.src!=='rugcheck'||!sf.creator)return '';
 var toks=sf.creatorTokens||[];
 var short=sf.creator.slice(0,4)+'&hellip;'+sf.creator.slice(-4);
 if(!toks.length){
  return '<div class="panel"><h3>Deployer history</h3>'
   +'<p style="font-size:12.5px;color:var(--ink-soft)">First known launch from <span style="font-family:\'Share Tech Mono\',monospace">'+short+'</span> &mdash; no track record yet, good or bad.</p></div>';
 }
 var graduated=toks.filter(function(t){return (t.marketCap||0)>=50000;}).length;
 var verdict,cls;
 if(toks.length>=5&&graduated/toks.length<0.2){verdict='Prolific low-traction deployer &mdash; '+toks.length+' other tokens, only '+graduated+' ever cleared $50k mc. Treat this creator as a red flag.';cls='neg';}
 else if(graduated>=2){verdict='Has landed real traction before &mdash; '+graduated+' of '+toks.length+' other launches cleared $50k mc.';cls='pos';}
 else{verdict=toks.length+' other launch'+(toks.length>1?'es':'')+' from this wallet, mostly low-traction so far.';cls='watch';}
 var rows=toks.slice(0,6).map(function(t){
  var age=t.createdAt?fAge(Date.now()-Date.parse(t.createdAt)):'?';
  var mint=String(t.mint||'');
  return '<div class="cmp-row" style="grid-template-columns:1fr 90px 80px"><div style="font-family:\'Share Tech Mono\',monospace;font-size:11.5px">'+esc(mint.slice(0,4))+'&hellip;'+esc(mint.slice(-4))+'</div><div>'+fUsd(t.marketCap)+'</div><div>'+age+' old</div></div>';
 }).join('');
 return '<div class="panel"><h3>Deployer history</h3>'
  +'<p style="font-size:12.5px;color:var(--ink-soft)"><b class="'+cls+'">'+verdict+'</b></p>'
  +'<div class="cmp-table" style="margin-top:8px">'+rows+'</div>'
  +'<p style="font-size:11px;color:var(--ink-faint);margin-top:8px">Deployer wallet <span style="font-family:\'Share Tech Mono\',monospace">'+short+'</span> &middot; source: RugCheck creatorTokens. Market cap is a traction proxy, not a rug confirmation &mdash; still eyeball holder behavior yourself.</p>'
  +'</div>';
}
function pickQuality(pp){
 var notes=[],ageMin=pp.ageMs!=null?pp.ageMs/60000:null,pf=pumpFun(pp);
 var mcOk=!pp.mc||pp.mc>=MIN_MC,liqOk=!pp.liq||pp.liq>=MIN_LIQ;
 if(!mcOk)notes.push('mc under $'+(MIN_MC/1000)+'k');
 if(!liqOk)notes.push('liq under $'+(MIN_LIQ/1000)+'k');
 if(pf)notes.push('Pump.fun launch');
 else if(pp.chain==='solana')notes.push('non-Pump launchpad');
 var sf=state.safety.get(pp.addr);
 if(sf&&sf.bundle)notes.push('bundle-pattern holders');
 if(sf&&sf.devPct!=null&&sf.devPct>5)notes.push('dev holds '+sf.devPct.toFixed(0)+'%');
 return {pumpfun:pf,mcOk:mcOk,liqOk:liqOk,ageMin:ageMin,tradeable:mcOk&&liqOk&&!(sf&&sf.bundle),notes:notes};
}

/* ---------- SCAN render ---------- */
function scan(){
 return Promise.all([fetchBoosts(),fetchTrending(),fetchProfiles()]).then(function(){
  var addrs=state.boosts.map(function(b){return b.addr;}).concat(state.trending.map(function(t){return t.addr;})).filter(Boolean);
  return dexTokens(addrs);
 }).then(function(){
  // screen every candidate BEFORE it ever renders — a coin that fails a real check never
  // gets a chance to look attractive first. Capped batch so this stays quick on a big pool.
  return screenPool(rawPool());
 }).then(function(){renderScan();saveScanCache();});
}
function rawPool(){
 var seen={},pool=[],srcOf={};
 state.boosts.forEach(function(b){srcOf[b.addr]='boost';});
 state.trending.forEach(function(t){if(!srcOf[t.addr])srcOf[t.addr]=t.src==='new_pools'?'new':'trending';});
 Object.keys(srcOf).forEach(function(addr){
  if(seen[addr])return;var c=state.tokenCache.get(addr);var pp=c&&c.pair;if(!pp||!chainOk(pp.chain))return;
  if(pp.mc&&pp.mc>80000000)return;
  if(pp.mc&&pp.mc<MIN_MC)return;           // video: min mcap floor, skip dead sub-7k tokens
  if(pp.liq&&pp.liq<MIN_LIQ)return;        // needs real liquidity to be tradeable
  var b=state.boosts.filter(function(x){return x.addr===addr;})[0];if(b&&!pp.desc)pp.desc=b.desc;
  pp._src=srcOf[addr];seen[addr]=1;pool.push(pp);
 });
 return pool;
}
// pre-fetch a real rug/safety check for every candidate that doesn't already have a fresh one,
// so the hard-exclusion filter in attentionPool() has real data to work with before first paint.
function screenPool(pool){
 var need=pool.filter(function(pp){var c=state.safety.get(pp.addr);return !c||Date.now()-c.ts>300000;}).slice(0,40);
 if(!need.length)return Promise.resolve(pool);
 return Promise.all(need.map(function(pp){return fetchSafety(pp.addr,pp.chain).catch(function(){return null;});})).then(function(){return pool;});
}
// a coin that actively FAILS a real check never gets shown by default — not de-ranked, excluded.
// sf===undefined (not screened yet, or no safety source exists for that chain) still passes:
// we can't penalize a coin for a check we were never able to run.
function failsSafety(pp){
 var sf=state.safety.get(pp.addr);
 if(!sf)return false;
 if(sf.ok===false)return true;
 if(sf.honeypot===true)return true;
 if(sf.bundle===true)return true;
 if(sf.renounced===false&&sf.devPct!=null&&sf.devPct>15)return true;
 return false;
}
function attentionPool(){
 state._screenedOut=0;
 var pool=rawPool().filter(function(pp){
  if(failsSafety(pp)){state._screenedOut++;return false;}
  return true;
 });
 pool.forEach(function(pp){
  pp._a=attn(pp);pp._tags=tagThemes(pp);pp._q=pickQuality(pp);
  pp._rank=pp._a.score+(pp._q.pumpfun?8:0)-((pp._q.notes.indexOf('non-Pump launchpad')>=0)?6:0);
 });
 pool.sort(function(a,b){return b._rank-a._rank;});
 return pool;
}
function renderScan(){
 var pool=attentionPool();
 state._pool=pool;
 // filter chips: All, Boosted, Fresh, + each theme present
 var present={};pool.forEach(function(pp){pp._tags.forEach(function(k){present[k]=(present[k]||0)+1;});});
 var chips=[['all','All ('+pool.length+')']];
 chips.push(['boost','Boosted ('+pool.filter(function(p){return p.boosts;}).length+')']);
 chips.push(['fresh','Fresh <24h ('+pool.filter(function(p){return p.ageMs!=null&&p.ageMs<864e5;}).length+')']);
 THEMES.forEach(function(t){if(present[t.k])chips.push([t.k,t.name+' ('+present[t.k]+')']);});
 var cur=state._scanFilter||'all';
 var note=q1('screenNote');
 if(note){
  if(state._screenedOut>0){note.hidden=false;note.style.display='';note.innerHTML='&#128737; screened out <b>'+state._screenedOut+'</b> coin'+(state._screenedOut>1?'s':'')+' that failed a real rug/safety check before showing you this list &mdash; honeypot, bundle pattern, or unrenounced with heavy dev holdings.';}
  else{note.hidden=true;note.style.display='none';}
 }
 q1('scanFilters').innerHTML=chips.map(function(c){return '<button class="chip-toggle" data-sf="'+c[0]+'" aria-pressed="'+(cur===c[0])+'">'+esc(c[1])+'</button>';}).join('');
 var shown=pool.filter(function(pp){
  if(cur==='all')return true;if(cur==='boost')return pp.boosts;if(cur==='fresh')return pp.ageMs!=null&&pp.ageMs<864e5;
  return pp._tags.indexOf(cur)>=0;
 });
 q1('attnList').innerHTML=shown.length?shown.slice(0,40).map(function(pp){return tokenRow(pp);}).join(''):'<div class="empty">nothing here right now &mdash; try another filter or widen chains</div>';
 renderTicker();renderBoard();renderIdeas();
}
// shadcn's Skeleton primitive (a muted block, animate-pulse) composed into this app's own
// row/card shapes — same idea as <Skeleton className="h-4 w-1/2" />, just vanilla markup since
// there's no component runtime here.
var SKEL_ROW='<div class="skrow"><span class="skel ava"></span><span class="skcol"><span class="skel"></span><span class="skel"></span></span><span class="skel traj"></span></div>';
function skelRows(n){var out='';for(var i=0;i<n;i++)out+=SKEL_ROW;return out;}
// guarantees at least one real paint has happened before the caller moves on — without this,
// a promise chain that resolves from an already-warm cache (same coin re-opened, watchlist
// re-rendering right after a scan) can run entirely as microtasks with no paint in between,
// so a skeleton set right before it never actually reaches the screen.
function nextPaint(){return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});}
/* ---------- at-a-glance safety icon row (GMGN-style: see the risk without opening the x-ray) ----------
   Reads whatever's already in state.safety (screenPool prefetches it for every board candidate) —
   no new fetch. Each badge carries a plain-language title tooltip, no dashes or jargon, so the
   icon alone teaches what it means the first time someone hovers it. */
function sfBadges(pp){
 var sf=state.safety.get(pp.addr);
 if(!sf)return '';
 var out=[];
 if(sf.topPct!=null){
  var c1=sf.topPct>35?'neg':sf.topPct>15?'watch':'pos';
  out.push('<span class="sfic '+c1+'" title="Top holder wallet owns '+sf.topPct.toFixed(1)+'% of supply. Above 15% is worth watching, above 35% is a real concentration risk.">&#128081;'+sf.topPct.toFixed(0)+'%</span>');
 }
 if(sf.devPct!=null){
  var c2=sf.devPct>10?'neg':sf.devPct>3?'watch':'pos';
  out.push('<span class="sfic '+c2+'" title="The deployer wallet holds '+sf.devPct.toFixed(1)+'% of supply. A dev with a large stake can dump on holders at any time.">&#128100;'+sf.devPct.toFixed(0)+'%</span>');
 }
 if(sf.lpPct!=null){
  var c3=sf.lpPct<50?'neg':'pos';
  out.push('<span class="sfic '+c3+'" title="'+sf.lpPct.toFixed(0)+'% of the liquidity pool is locked. Locked liquidity cannot be pulled out by the team.">&#128274;'+sf.lpPct.toFixed(0)+'%</span>');
 }
 if(sf.insiderPct!=null&&sf.insiderPct>0){
  var c4=sf.insiderPct>20?'neg':'watch';
  out.push('<span class="sfic '+c4+'" title="Wallets flagged as insiders hold '+sf.insiderPct.toFixed(0)+'% of supply combined.">&#128373;'+sf.insiderPct.toFixed(0)+'%</span>');
 }
 if(sf.bundle)out.push('<span class="sfic neg" title="Several wallets bought in near identical amounts right at launch. A common sign of a coordinated snipe, not organic buying.">&#127873;bundle</span>');
 if(sf.renounced===true)out.push('<span class="sfic pos" title="Mint and freeze authority are renounced. The team can no longer mint new supply or freeze wallets.">&#9989;renounced</span>');
 return out.length?'<span class="sficrow">'+out.join('')+'</span>':'';
}
function tokenRow(pp){
 var a=pp._a||attn(pp),tags=pp._tags||tagThemes(pp);
 var tg=tags.length?tags.map(function(k){var t=THEMES.filter(function(x){return x.k===k;})[0];return '<span class="tag">'+esc(t?t.name:k)+'</span>';}).join('')
   :'<span class="tag n">'+esc(typeGuess(pp))+' &mdash; you tag it</span>';
 var src=(pp._src&&pp._src!=='boost')?'<span class="cchip">'+esc(pp._src)+'</span>':'';
 var q=pp._q||pickQuality(pp);
 var pf=q.pumpfun?'<span class="cchip pf">pump.fun</span>':'';
 var warn=(!q.mcOk||!q.liqOk||(state.safety.get(pp.addr)||{}).bundle)?'<span class="cchip warn">&#9888;</span>':'';
 return '<button class="trow" data-addr="'+esc(pp.addr)+'" data-chain="'+esc(pp.chain)+'">'
  +(pp.img?'<img class="ava" src="'+esc(pp.img)+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">':'<span></span>')
  +'<span class="tmain"><span class="tsym">'+starBtn(pp.addr,pp.chain,pp.sym)+'$'+esc(pp.sym)+' <span class="cchip">'+esc(pp.chain)+'</span>'+pf+src+(pp.boosts?' <span class="cchip">boost</span>':'')+warn+'</span>'
  +'<span class="tmeta">'+fUsd(pp.mc)+' mc &middot; '+fUsd(pp.vol.h24)+' 24h &middot; '+fAge(pp.ageMs)+' old &middot; '+fPct(+pp.pc.h1||0)+' 1h</span>'
  +sfBadges(pp)
  +'<span class="tags">'+tg+'</span></span>'
  +trajTag(a)+'</button>';
}

/* ---------- RESEARCH ---------- */
function setUrl(addr,chain){
 try{
  if(addr){var q='?coin='+encodeURIComponent(addr)+(chain?'&chain='+encodeURIComponent(chain):'');
   if(location.search!==q)history.pushState({coin:addr},'',q);}
  else if(location.search)history.replaceState(null,'',location.pathname);
 }catch(_){}
}
function openResearch(addr,chain,fromUrl){
 addr=String(addr||'').toLowerCase();
 state.rcAddr=addr;state.tab='research';syncTabs();saveCfg();
 if(!fromUrl)setUrl(addr,chain);
 q1('rcardHost').innerHTML=skelCard();
 var c=state.tokenCache.get(addr);
 var p0=(c&&c.pair)?Promise.resolve(c.pair):dexTokens([addr]).then(function(){var c2=state.tokenCache.get(addr);return c2&&c2.pair;});
 // when addr is already fully cached (re-opening a coin, coming from the board/watchlist),
 // every promise below resolves on the same microtask tick with no real network wait in
 // between — nextPaint() forces one real frame so the skeleton we just set is actually seen
 // instead of being overwritten before the browser ever draws it.
 Promise.all([p0,nextPaint()]).then(function(r){
  var pp=r[0];
  if(!pp){q1('rcardHost').innerHTML='<div class="empty">No DexScreener data for that address on the selected chains.</div>';return;}
  state.rcPair=pp;
  var raw=pp.addrRaw||addr;
  return Promise.all([
   fetchSafety(addr,pp.chain,raw),
   fetchOhlcv(addr,pp.pairAddr,pp.chain),
   fomoWatchers(addr),
   primeThemePeers(pp),
   fetchTokenInfo(addr,pp.chain,raw)
  ]).then(function(r){state.rcInfo=r[4];renderResearch(pp,r[0],r[2],r[4]);startTrades();});
 });
}
function skelCard(){
 return '<div class="skcard"><span class="skel big"></span><span class="skel" style="width:70%"></span>'
  +'<span class="skel chart"></span><span class="skel" style="width:90%"></span><span class="skel" style="width:60%"></span></div>';
}
function primeThemePeers(pp){
 var tags=tagThemes(pp);if(!tags.length)return Promise.resolve();
 var t=THEMES.filter(function(x){return x.k===tags[0];})[0];
 return t?dexSearch(t.q):Promise.resolve();
}
function themeCeiling(pp){
 var tags=tagThemes(pp);if(!tags.length)return null;
 var t=THEMES.filter(function(x){return x.k===tags[0];})[0];if(!t)return null;
 var c=state.searchCache.get(t.q);if(!c)return null;
 var mcs=c.pairs.filter(function(x){return chainOk(x.chain)&&x.mc>50000;}).map(function(x){return x.mc;}).sort(function(a,b){return a-b;});
 if(mcs.length<3)return null;
 var med=mcs[Math.floor(mcs.length/2)],mx=mcs[mcs.length-1];
 return {theme:t.name,median:med,max:mx,n:mcs.length};
}
function xHandle(url){var m=String(url||'').match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,20})(?:\/|$|\?)/i);if(!m)return null;var h=m[1].toLowerCase();if(['i','intent','share','home','search','hashtag','status'].indexOf(h)>=0)return null;return m[1];}
function buildProject(pp,tinfo){
 var prof=state.profiles[pp.addr]||{};
 var desc=(tinfo&&tinfo.desc)||prof.desc||pp.desc||'';
 var sites=[];(pp.sites||[]).forEach(function(u){sites.push(u);});
 if(tinfo&&tinfo.sites)tinfo.sites.forEach(function(u){if(sites.indexOf(u)<0)sites.push(u);});
 (prof.links||[]).forEach(function(l){if(l.type==='website'&&l.url&&sites.indexOf(l.url)<0)sites.push(l.url);});
 var x=null,xUrl=null,tg=null,discord=null;
 if(tinfo&&tinfo.x){x=tinfo.x;xUrl='https://x.com/'+tinfo.x;}
 if(tinfo&&tinfo.tg)tg='https://t.me/'+tinfo.tg;
 if(tinfo&&tinfo.discord)discord=tinfo.discord;
 pp.socials.concat((prof.links||[])).forEach(function(s){
  var u=s.url,ty=s.type;
  if((ty==='twitter'||ty==='x'||/(?:x|twitter)\.com/i.test(u))&&!x){var h=xHandle(u);if(h){x=h;xUrl='https://x.com/'+h;}else if(!xUrl){xUrl=u;}}
  if((ty==='telegram'||/t\.me/i.test(u))&&!tg)tg=u;
  if((ty==='discord'||/discord\.(gg|com)/i.test(u))&&!discord)discord=u;
 });
 // website URLs may actually be x links
 var realSites=[];sites.forEach(function(u){if(/(?:x|twitter)\.com/i.test(u)){if(!x){var h=xHandle(u);if(h){x=h;xUrl='https://x.com/'+h;}}}else if(/t\.me/i.test(u)){if(!tg)tg=u;}else realSites.push(u);});
 var cats=(tinfo&&tinfo.cats)||[];
 var surface=[!!desc,realSites.length>0,!!xUrl,!!tg].filter(Boolean).length;
 return {desc:desc,sites:realSites,x:x,xUrl:xUrl,tg:tg,discord:discord,cats:cats,cto:!!prof.cto,cg:(tinfo&&tinfo.cg)||'',gtScore:tinfo&&tinfo.gtScore,surface:surface};
}
function researchOf(addr){return state.research[addr]||{type:'',meme:0,hook:'',catalysts:[],target:0,tf:'',entry:'',conviction:0};}
function catScore(cats){
 if(!cats||!cats.length)return {v:0.25,label:'no catalyst identified'};
 var now=Date.now(),soon=false,future=false;
 cats.forEach(function(c){if(!c.when)return;var t=Date.parse(c.when);if(isNaN(t))return;if(t>now&&t-now<7*864e5)soon=true;else if(t>now)future=true;});
 if(soon)return {v:1,label:'catalyst within 7 days'};
 if(future)return {v:0.6,label:'catalyst dated, >7 days out'};
 return {v:0.45,label:cats.length+' catalyst note'+(cats.length>1?'s':'')+', undated'};
}
function verdict(pp,a,sf,surface){
 var r=researchOf(pp.addr);
 var att=a.traj==='ramping'?1:a.traj==='steady'?0.55:0.2;
 var meme=(r.meme||0)/5;
 var cs=catScore(r.catalysts);
 var safe=sf&&sf.ok===true?1:(!sf||sf.ok==null?0.55:0);
 var conv=(r.conviction||0)/5;
 var prj=surface==null?0.5:surface/4;
 // weights: holder/safety signal outweighs raw momentum (research: holder-concentration signal
 // measured ~64% stronger than trader/volume signal on a risk-adjusted basis), so safety carries
 // double its old weight instead of chasing whatever is pumping right now.
 var pct=Math.round(100*(0.22*att+0.22*meme+0.14*cs.v+0.22*safe+0.10*conv+0.10*prj));
 var fomo=((+pp.pc.h1||0)>=45||(+pp.pc.m5||0)>=20);
 var label,cls;
 if(fomo&&pct<74){label='YOU&rsquo;D BE EXIT LIQUIDITY &#128128;';cls='fomo';}
 else if(pct>=62){label='WE&rsquo;RE SO BACK &#128640;';cls='go';}
 else if(pct>=42){label='LOWKEY WATCHING &#128064;';cls='watch';}
 else{label='IT&rsquo;S GIVING NOTHING &#128164;';cls='pass';}
 return {pct:pct,label:label,cls:cls,att:att,meme:meme,cs:cs,safe:safe,conv:conv,fomo:fomo};
}
function launchShape(pp){
 if(pp.ageMs==null||pp.ageMs>8*3600e3)return null; // only meaningful while we still hold the launch candles
 var oc=state.ohlcv.get(pp.addr),rows=(oc&&oc.rows)||[];
 if(rows.length<4)return null;
 var first=rows[0],o=+first[1],h=+first[2];
 if(!o||!h)return null;
 var pump=(h-o)/o*100;
 // did price ever pull back >15% off that early high in the next 4 candles before continuing?
 var lowAfter=Math.min.apply(null,rows.slice(1,5).map(function(r){return +r[3]||h;}));
 var pullback=(h-lowAfter)/h*100;
 if(pump>=120&&pullback<15)return {bundleish:true,pump:pump};
 return {bundleish:false,pump:pump};
}
function bundlePanel(pp,sf){
 if(pp.chain!=='solana')return '<div class="panel"><h3>Bundle &amp; insider check</h3><p style="font-size:12.5px;color:var(--ink-faint)">Wallet-level bundle detection runs on Solana only (RugCheck). For '+esc(pp.chain)+', lean on the rug screen above and the manual checklist below.</p></div>';
 var ls=launchShape(pp);
 var rows=[];
 var flag=function(bad,txt){return '<div class="bchk '+(bad?'bad':'ok')+'">'+(bad?'&#9888; ':'&#10003; ')+txt+'</div>';};
 if(sf&&sf.src==='rugcheck'){
  rows.push(flag(sf.devPct!=null&&sf.devPct>5, sf.devPct!=null?('dev holds '+sf.devPct.toFixed(1)+'%'+(sf.devPct>5?' (want &le;5%)':'')):'dev holding not surfaced'));
  rows.push(flag(sf.top5Pct!=null&&sf.top5Pct>25, sf.top5Pct!=null?('top 5 non-LP wallets hold '+sf.top5Pct.toFixed(0)+'%'+(sf.top5Pct>25?' (want &le;25%)':'')):'top-holder spread not surfaced'));
  rows.push(flag(sf.insiderPct!=null&&sf.insiderPct>20, sf.insiderPct!=null?('insiders hold '+sf.insiderPct.toFixed(0)+'% of supply'+(sf.insiderPct>20?' (want &le;20%)':'')+(sf.insiders?' &middot; '+sf.insiders+' linked wallets':'')):'insider supply not flagged'));
  rows.push(flag(!!sf.bundle, sf.bundle?'holders clustered at near-identical small stakes &mdash; looks bundled':'no obvious bundle cluster in top holders'));
  rows.push(flag(sf.lpPct!=null&&sf.lpPct<50, 'LP '+(sf.lpPct!=null?sf.lpPct.toFixed(0)+'% locked/burned':'lock status unknown')));
 } else {
  rows.push('<div class="bchk">RugCheck data unavailable right now &mdash; retry in a moment.</div>');
 }
 if(ls)rows.push(flag(ls.bundleish,'launch candle '+(ls.pump>0?'+':'')+ls.pump.toFixed(0)+'% '+(ls.bundleish?'straight up with no pullback &mdash; classic bundle-launch shape':'with normal staggered follow-through')));
 var verdict=(sf&&(sf.bundle||(sf.devPct>5)||(sf.insiderPct>20)||(sf.top5Pct>25)))||(ls&&ls.bundleish)
  ?'<b class="neg">Treat as bundled / insider-heavy until proven otherwise.</b> Cross-check holder SOL balances + funding times yourself (see checklist).'
  :'<b class="pos">No bundle red flags in the automated checks.</b> Still eyeball holder balances + funding times before you buy.';
 return '<div class="panel"><h3>Bundle &amp; insider check</h3><div class="bchks">'+rows.join('')+'</div>'
  +'<p style="font-size:12.5px;color:var(--ink-soft);margin-top:8px">'+verdict+'</p></div>';
}
function checklistPanel(pp,proj){
 var xq=encodeURIComponent('$'+pp.sym);
 var holdersUrl=pp.url?(pp.url.split('?')[0]):'https://dexscreener.com/'+pp.chain+'/'+pp.addr;
 var items=[
  ['Holder balances', 'Open the holders tab. Top 5 non-LP wallets should hold <b>varied</b> SOL amounts (5, 3, 1, 4.7&hellip;). Four wallets at 0.1 / 0.1 / 0.1 / 0.1 = bundle &rarr; skip.'],
  ['Holder funding times', 'Same 5 wallets: funding ages should be <b>mixed</b> (6d, 22d, 3y, 2d). All &ldquo;25 min ago&rdquo; = bundle &rarr; skip.'],
  ['Community, not tweet/profile', 'Tweet coin (a tweet tied to a coin) and profile coin (blue-avatar &ldquo;launching a project&rdquo;) are 99% LARP. You want a real community with people actually talking.'],
  ['Community page', 'CA in the bio/description, a <b>pinned</b> post with CA + narrative from the admin, and real humans in &ldquo;Latest&rdquo; &mdash; not link spam / drainers. Missing any of the three &rarr; red flag.'],
  ['Entry discipline', 'Best entries are a <b>40&ndash;50% dip from ATH</b> on a clean coin. A 10% dip (40k&rarr;36k) usually is not enough to pull in dip buyers.'],
  ['Never marry the bag', 'Below your average and not bouncing &rarr; you&rsquo;re out. No &ldquo;maybe it comes back&rdquo;.'],
  ['Port size', 'Under 0.1 SOL, fees eat you &mdash; go earn more first. Sizing: 0.1 port &rarr; ~0.05 new / 0.07 stretch; 0.5 &rarr; 0.1 / 0.2; 1 &rarr; 0.25 / 0.4; 5 &rarr; 1 / 1.5.'],
  ['Default to distrust', 'Assume every coin is a scam until it passes <i>every</i> check. Narrative reading is a daily-reps skill, not a filter.']
 ];
 return '<details class="panel" style="padding:0"><summary style="padding:12px 14px;cursor:pointer;font-weight:700">Before you ape &mdash; manual checklist <span style="font-weight:400;color:var(--ink-faint)">(the stuff no API can check for you)</span></summary>'
  +'<div style="padding:0 14px 14px">'
  +'<div class="proj-links" style="margin:4px 0 10px"><a class="btn sm" href="'+esc(holdersUrl)+'" target="_blank" rel="noopener">holders on DexScreener</a>'
  +'<a class="btn sm" href="https://x.com/search?q='+xq+'&f=live" target="_blank" rel="noopener">$'+esc(pp.sym)+' on X (Latest)</a>'
  +(proj.x?'<a class="btn sm" href="'+esc(proj.xUrl)+'" target="_blank" rel="noopener">@'+esc(proj.x)+'</a>':'')+'</div>'
  +'<ol class="chklist">'+items.map(function(it){return '<li><b>'+it[0]+'.</b> '+it[1]+'</li>';}).join('')+'</ol>'
  +'<p style="font-size:11.5px;color:var(--ink-faint);margin-top:8px">Source: trader workflow notes. Not financial advice &mdash; this is a research aid, do your own checks.</p>'
  +'</div></details>';
}
function planFrom(pp,r){
 var px=pp.priceUsd||0;var mc=pp.mc||pp.fdv||0;
 var tMult=(r.target&&mc&&r.target>mc)?r.target/mc:null;
 var m1,m2,m3;
 if(tMult){m1=(tMult-1)*0.35;m2=(tMult-1)*0.7;m3=(tMult-1);}
 else{m1=0.4;m2=1.1;m3=2.5;}
 return {px:px,lo:px*0.94,hi:px*1.05,stop:px*0.7,stopPct:30,t1:px*(1+m1),t2:px*(1+m2),t3:px*(1+m3),tMult:tMult};
}
function renderResearch(pp,sf,watchers,tinfo){
 if(tinfo===undefined)tinfo=state.rcInfo;
 var r=researchOf(pp.addr),ceil=themeCeiling(pp),hr=holderRate(pp.addr);
 var tags=tagThemes(pp),tguess=typeGuess(pp);
 var proj=buildProject(pp,tinfo);
 var a=attn(pp),v=verdict(pp,a,sf,proj.surface);
 var lnk=[];
 if(proj.xUrl)lnk.push('<a href="'+esc(proj.xUrl)+'" target="_blank" rel="noopener">'+(proj.x?'@'+esc(proj.x):'X')+'</a>');
 if(proj.tg)lnk.push('<a href="'+esc(proj.tg)+'" target="_blank" rel="noopener">Telegram</a>');
 if(proj.sites[0])lnk.push('<a href="'+esc(proj.sites[0])+'" target="_blank" rel="noopener">site</a>');
 lnk.push('<a href="'+esc(pp.url||('https://dexscreener.com/search?q='+pp.addr))+'" target="_blank" rel="noopener">DexScreener</a>');
 var plan=planFrom(pp,r);
 var projPanel=projectPanel(pp,proj);
 var rax=radarAxes(pp,a,sf,proj,hr);state._radarAxes=rax;

 var autoKv='<div class="kv">'
  +kv('narrative tags',tags.length?tags.map(function(k){var t=THEMES.filter(function(x){return x.k===k;})[0];return t?t.name:k;}).join(', '):'none detected')
  +kv('type (guess)',tguess)
  +kv('market cap',fUsd(pp.mc))
  +kv('liquidity',fUsd(pp.liq))
  +kv('age',fAge(pp.ageMs))
  +kv('24h volume',fUsd(pp.vol.h24))
  +kv('vol acceleration',a.accel.toFixed(2)+'x',a.accel>=1.25?'pos':a.accel<0.8?'neg':'')
  +kv('buy pressure 1h',Math.round(a.skew1*100)+'% ('+a.b1+'/'+a.s1+')',a.skew1>=0.55?'pos':a.skew1<0.45?'neg':'')
  +kv('price 1h / 6h',fPct(+pp.pc.h1||0)+' / '+fPct(+pp.pc.h6||0))
  +kv('holders',hr?fNum(hr.now)+'  ('+ (hr.perHr>=0?'+':'') +Math.round(hr.perHr)+'/hr)':(sf&&sf.holders?fNum(sf.holders)+' (tracking...)':'tracking...'),hr&&hr.perHr>0?'pos':'')
  +kv('boosted',pp.boosts?'yes ('+pp.boosts+')':'no')
  +(pp.chain==='solana'?kv('launchpad',pumpFun(pp)?'Pump.fun':'not Pump.fun &mdash; 99% of other SOL launchpads are dead/scam',pumpFun(pp)?'pos':'neg'):'')
  +kv('pick gates',(pp.mc&&pp.mc<MIN_MC?'mc &lt;$'+(MIN_MC/1000)+'k ':'')+(pp.liq&&pp.liq<MIN_LIQ?'liq &lt;$'+(MIN_LIQ/1000)+'k ':'')+((pp.mc>=MIN_MC||!pp.mc)&&(pp.liq>=MIN_LIQ||!pp.liq)?'mc + liq OK':'') ,((pp.mc&&pp.mc<MIN_MC)||(pp.liq&&pp.liq<MIN_LIQ))?'neg':'pos')
  +kv('trajectory',a.traj.toUpperCase()+' &middot; attn '+a.score,a.traj==='ramping'?'pos':a.traj==='fading'?'neg':'')
  +kv('project surface',proj.surface+'/4 '+(proj.surface>=3?'(desc + site + socials)':proj.surface===0?'(bare &mdash; no story surface)':'(partial)'),proj.surface>=3?'pos':proj.surface===0?'neg':'')
  +(proj.cg?kv('coingecko','listed'+(proj.gtScore?' &middot; GT score '+Math.round(proj.gtScore):''),'pos'):'')
  +(ceil?kv(ceil.theme+' peers','median peak '+fUsd(ceil.median)+', top '+fUsd(ceil.max)+' (n='+ceil.n+')'):'')
  +'</div>';
 var safeLine='<div style="margin-top:9px;font-size:12.5px;color:var(--ink-soft)"><b>Rug screen ('+esc((sf&&sf.src)||'?')+'):</b> '
  +(sf&&sf.ok===true?'passed':sf&&sf.ok===false?'FAILED &mdash; '+esc((sf.reasons||[]).join(', ')):'unverified')
  +(sf&&sf.renounced?' &middot; renounced':'')+(sf&&sf.lpPct!=null?' &middot; LP '+sf.lpPct.toFixed(0)+'%':'')+(sf&&sf.topPct!=null?' &middot; top holder '+sf.topPct.toFixed(1)+'%':'')
  +(sf&&sf.devPct!=null?' &middot; dev '+sf.devPct.toFixed(1)+'%':'')+(sf&&sf.insiderPct?' &middot; insiders '+sf.insiderPct.toFixed(0)+'%':'')+(sf&&sf.bundle?' &middot; <b class="neg">bundle pattern</b>':'')+'</div>';
 var watchLine=watchers&&watchers.buys?'<div style="margin-top:6px;font-size:12.5px;color:var(--ink-faint)">fomo feed: '+watchers.buys+' recent buy'+(watchers.buys>1?'s':'')+(watchers.traders.length?' &mdash; '+esc(watchers.traders.slice(0,4).join(', ')):'')+' &middot; <i>info only, do not copy</i></div>':'';

 var chart=chartBlock(pp,plan);

 var form='<details class="collapsed-form"'+(r.meme||r.hook||(r.catalysts&&r.catalysts.length)?' open':'')+'><summary>add your own read (optional &mdash; nudges the score)</summary><div class="panel" style="margin-top:8px">'
  +'<div class="formrow"><label>Meme strength &mdash; funny / weird / relatable enough to spread?</label>'
   +'<div class="stars" data-f="meme">'+stars(r.meme)+'</div></div>'
  +'<div class="formrow"><label>Cultural hook &mdash; what big thing does this attach to? (AI, GTA, a streamer, news&hellip;)</label>'
   +'<textarea data-f="hook" placeholder="e.g. OpenAI Jalapeno chip beats Nvidia GB300">'+esc(r.hook)+'</textarea></div>'
  +'<div class="formrow"><label>Catalysts &mdash; what event pushes this past current holders?</label>'
   +'<div class="cats" data-f="cats">'+catsHtml(r.catalysts)+'</div>'
   +'<button class="btn sm" data-act="addcat" style="align-self:flex-start;margin-top:5px">+ catalyst</button></div>'
  +'<div class="formrow" style="flex-direction:row;gap:14px;flex-wrap:wrap">'
   +'<span style="display:flex;flex-direction:column;gap:5px"><label>Realistic target mcap</label><input data-f="target" type="text" inputmode="decimal" value="'+esc(r.target?String(r.target):'')+'" placeholder="1000000" style="width:150px"></span>'
   +'<span style="display:flex;flex-direction:column;gap:5px"><label>Conviction</label><div class="stars" data-f="conviction">'+stars(r.conviction)+'</div></span></div>'
  +'</div></details>';

 q1('rcardHost').innerHTML='<div class="rcard"><div class="cap">'
  +(pp.img?'<img src="'+esc(pp.img)+'" alt="" onerror="this.style.visibility=\'hidden\'">':'')
  +'<span class="nm">$'+esc(pp.sym)+'</span><span class="chain">'+esc(pp.chain)+'</span>'
  +(proj.x?'<a class="xh" href="'+esc(proj.xUrl)+'" target="_blank" rel="noopener">@'+esc(proj.x)+'</a>':'')
  +'<span class="lnks">'+lnk.join('')+'</span></div>'
  +(gtOk(pp.chain)?'':'<div class="rc-banner"><b>&#9888; '+esc(pp.chain)+' chain &mdash; slow data.</b> The network is congested and there\'s no fast indexer for it, so the chart and trade feed load slowly and can read a little stale. The attention score, holders, socials and project info are unaffected.</div>')
  +'<div class="body">'
  +'<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><div class="verdict '+v.cls+'">'+v.label+'</div>'
   +'<button class="btn" data-act="savefav">'+(state.watch.has(pp.addr)?'&#9733; on watchlist':'&#9734; watchlist')+'</button>'
   +'<button class="btn pri" data-act="flex">&#128248; flex $'+esc(pp.sym)+'</button></div>'
  +'<div style="font-size:12px;color:var(--ink-soft)">score <b>'+v.pct+'/100</b> &middot; attention '+Math.round(v.att*100)+' &middot; safety '+Math.round(v.safe*100)+' &middot; project '+proj.surface+'/4'+(v.meme?' &middot; your meme '+Math.round(v.meme*100):'')+'</div>'
  +quickStatsGrid(pp,a,sf,hr,proj)
  +firehosePanel()
  +radarTile(rax)
  +chart
  +'<div class="panel"><h3>What the radar sees</h3>'+autoKv+safeLine+watchLine+'</div>'
  +bundlePanel(pp,sf)
  +deployerPanel(sf)
  +'<div id="deployerRepPanel"></div>'
  +researchScorePanel(pp,a,sf,hr,proj)
  +exitLiquidityPanel(pp)
  +graduationPanel(pp)
  +'<div id="cohortPanel"></div>'
  +'<div id="pulsePanel"></div>'
  +compPanel(pp,sf,tags)
  +projPanel
  +checklistPanel(pp,proj)
  +tradesPanel()
  +form
  +'</div></div>';
 mountChart();
 startFirehose();
 renderTrades();
 var rc=document.querySelector('canvas.radar-cv');if(rc)drawRadar(rc,state._radarAxes||rax);
 // async, never blocks the rest of the card — and each guarded against a stale write if the
 // user has already navigated to a different coin by the time its fetch resolves.
 cohortPanel(pp).then(function(html){if(state.rcAddr===pp.addr){var el=q1('cohortPanel');if(el)el.innerHTML=html;}});
 deployerRepPanel(sf).then(function(html){if(state.rcAddr===pp.addr){var el=q1('deployerRepPanel');if(el)el.innerHTML=html;}});
 if(tags[0]){
  reportPulse(tags[0],pp,a); // fire-and-forget: this x-ray becomes a data point for everyone's future curve
  narrativePulsePanel(tags[0],pp,a).then(function(html){if(state.rcAddr===pp.addr){var el=q1('pulsePanel');if(el)el.innerHTML=html;}});
 }
}
function projectPanel(pp,proj){
 var lines=[];
 var links=[];
 if(proj.xUrl)links.push('<a class="btn sm" href="'+esc(proj.xUrl)+'" target="_blank" rel="noopener">'+(proj.x?'@'+esc(proj.x):'X / Twitter')+'</a>');
 links.push('<a class="btn sm" href="https://x.com/search?q='+encodeURIComponent('$'+pp.sym)+'&f=live" target="_blank" rel="noopener">search $'+esc(pp.sym)+' on X</a>');
 if(proj.tg)links.push('<a class="btn sm" href="'+esc(proj.tg)+'" target="_blank" rel="noopener">Telegram</a>');
 if(proj.discord)links.push('<a class="btn sm" href="'+esc(proj.discord)+'" target="_blank" rel="noopener">Discord</a>');
 proj.sites.slice(0,2).forEach(function(u){links.push('<a class="btn sm" href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(u.replace(/^https?:\/\//,'').replace(/\/$/,'').slice(0,28))+'</a>');});
 var badges=[];
 if(proj.cto)badges.push('<span class="tag">community takeover</span>');
 (proj.cats||[]).slice(0,5).forEach(function(c){badges.push('<span class="tag n">'+esc(c)+'</span>');});
 var d=proj.desc||'';
 var descHtml=d?'<p class="proj-desc'+(d.length>420?' clamp':'')+'">'+esc(d)+'</p>'+(d.length>420?'<button class="btn sm" data-act="moredesc">read more</button>':'')
   :'<p class="proj-desc" style="color:var(--ink-faint)">No project description published anywhere public yet. For a fresh coin that is normal &mdash; but it also means the story lives only on X. Read the replies before you trust it.</p>';
 return '<div class="panel proj"><h3>The project</h3>'
  +descHtml
  +(badges.length?'<div class="tags" style="margin:8px 0">'+badges.join('')+'</div>':'')
  +'<div class="proj-links">'+links.join('')+'</div>'
  +'<div style="font-size:11.5px;color:var(--ink-faint);margin-top:7px">Sources: GeckoTerminal token info, DexScreener profile'+(proj.cto?', flagged community-takeover':'')+'. Always read what people are actually saying on X, not just the bio.</div>'
  +'</div>';
}
function kv(k,v,cls){return '<div><div class="k">'+esc(k)+'</div><div class="v'+(cls?' '+cls:'')+'">'+v+'</div></div>';}
function seg(opts,cur){return opts.map(function(o){return '<button data-v="'+o+'" aria-pressed="'+(cur===o)+'">'+o+'</button>';}).join('');}
function stars(n){n=+n||0;var s='';for(var i=1;i<=5;i++)s+='<span class="'+(i<=n?'on':'')+'" data-v="'+i+'">&#9733;</span>';return s;}
function catsHtml(cats){cats=cats||[];if(!cats.length)return '<div style="font-size:12px;color:var(--ink-faint)">none yet</div>';
 return cats.map(function(c,i){var soon=c.when&&Date.parse(c.when)>Date.now()&&Date.parse(c.when)-Date.now()<7*864e5;
  return '<div class="cat'+(soon?' soon':'')+'" data-i="'+i+'"><input type="date" data-cf="when" value="'+esc(c.when||'')+'"><input type="text" data-cf="what" value="'+esc(c.what||'')+'" placeholder="dev drop / listing / stream / leak"><button class="btn sm" data-act="delcat" data-i="'+i+'">&times;</button></div>';
 }).join('');
}

/* ---------- chart (ported) ---------- */
function fitCanvas(cv){var dpr=window.devicePixelRatio||1,w=cv.clientWidth||cv.parentNode.clientWidth||600,h=cv.clientHeight||160;var pw=Math.max(1,Math.round(w*dpr)),ph=Math.max(1,Math.round(h*dpr));if(cv.width!==pw||cv.height!==ph){cv.width=pw;cv.height=ph;}var x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);return {x:x,w:w,h:h};}
function chartBlock(pp,plan){
 var net=gtNet(pp.chain),hasGT=gtOk(pp.chain),canEmbed=!!(pp.pairAddr&&hasGT),mode=state.chartMode;if(!canEmbed)mode='entries';
 if(!hasGT){
  // GeckoTerminal has no network for this chain (e.g. robinhood) -> use the DexScreener embed, the only source that indexes it
  var dsBase=pp.url||('https://dexscreener.com/'+esc(pp.chain)+'/'+esc(pp.pairAddr));
  var dsSrc=pp.pairAddr?dsBase.split('?')[0]+'?embed=1&theme=dark&info=0&trades=0':'';
  return '<div>'
   +(dsSrc?'<div class="chart-embed"><iframe loading="lazy" title="chart" src="'+esc(dsSrc)+'"></iframe></div>'
        :'<div class="lwchart" style="display:flex;align-items:center;justify-content:center;color:#8a8a76;font-family:\'Share Tech Mono\',monospace;font-size:12px;padding:20px">no chart source for this token</div>')
   +'<div class="lwchart-note">DexScreener chart ('+esc(pp.chain)+') &middot; mechanical levels: entry '+fPrice(plan.lo)+'&ndash;'+fPrice(plan.hi)+', stop '+fPrice(plan.stop)+' (-'+plan.stopPct+'%), targets '+fPrice(plan.t1)+' / '+fPrice(plan.t2)+' / '+fPrice(plan.t3)+'. Not advice.</div></div>';
 }
 var toggle='<div class="ctoggle"><button data-cm="entries" aria-pressed="'+(mode==='entries')+'">TradingView + levels</button>'+(canEmbed?'<button data-cm="chart" aria-pressed="'+(mode==='chart')+'">Full toolbar</button>':'')+'</div>';
 var embSrc=canEmbed?'https://www.geckoterminal.com/'+net+'/pools/'+esc(pp.pairAddr)+'?embed=1&info=0&swaps=0&grayscale=0&light_chart=0&resolution=15m':'';
 var embed=canEmbed?'<div class="chart-embed"'+(mode==='entries'?' hidden':'')+'><iframe loading="lazy" title="chart" src="'+(mode==='chart'?embSrc:'')+'" data-embsrc="'+embSrc+'"></iframe></div>':'';
 var cand='<div class="lwchart" data-caddr="'+esc(pp.addr)+'"'+(mode==='chart'?' hidden':'')+'></div>';
 var note='<div class="lwchart-note">TradingView Lightweight Charts &middot; GeckoTerminal 5m data &middot; entry '+fPrice(plan.lo)+'&ndash;'+fPrice(plan.hi)+', stop '+fPrice(plan.stop)+' (-'+plan.stopPct+'%), targets '+fPrice(plan.t1)+' / '+fPrice(plan.t2)+' / '+fPrice(plan.t3)+(plan.tMult?' (to your '+plan.tMult.toFixed(1)+'x goal)':'')+'. Not advice.</div>';
 return '<div>'+toggle+embed+cand+note+'</div>';
}
/* ---------- ATTENTION RADAR hex ---------- */
function radarAxes(pp,a,sf,proj,hr){
 return [
  {label:'BUY',full:'buy pressure',v:a.skew1},
  {label:'VOL',full:'volume acceleration',v:Math.min(1,(a.accel||1)/2)},
  {label:'HOLD',full:'holder growth',v:hr?Math.min(1,Math.max(0,(hr.perHr||0)/150)):0.12},
  {label:'SAFE',full:'safety',v:sf&&sf.ok===true?1:(!sf||sf.ok==null?0.5:0)},
  {label:'PROJ',full:'project surface',v:(proj.surface||0)/4},
  {label:'AGE',full:'freshness',v:pp.ageMs!=null?Math.max(0.05,Math.pow(0.5,(pp.ageMs/864e5)/3)):0.3}
 ];
}
function drawRadar(cv,axes){
 var c=fitCanvas(cv),x=c.x,w=c.w,h=c.h;
 x.fillStyle='#08090d';x.fillRect(0,0,w,h);
 var cx=w/2,cy=h/2,R=Math.min(w,h)/2-40,n=axes.length;
 var pt=function(i,rr){var ang=-Math.PI/2+i/n*Math.PI*2;return [cx+Math.cos(ang)*rr,cy+Math.sin(ang)*rr,ang];};
 for(var ring=1;ring<=4;ring++){
  x.beginPath();for(var i=0;i<=n;i++){var q=pt(i%n,R*ring/4);i?x.lineTo(q[0],q[1]):x.moveTo(q[0],q[1]);}
  x.strokeStyle='rgba(205,210,223,.09)';x.lineWidth=1;x.stroke();
 }
 x.font='9px "Share Tech Mono",monospace';
 axes.forEach(function(a2,i){var q=pt(i,R);
  x.strokeStyle='rgba(205,210,223,.09)';x.beginPath();x.moveTo(cx,cy);x.lineTo(q[0],q[1]);x.stroke();
  var l=pt(i,R+13);x.fillStyle='#6b7180';
  x.textAlign=Math.abs(Math.cos(l[2]))<0.35?'center':(Math.cos(l[2])>0?'left':'right');
  x.fillText(a2.label,l[0],l[1]+3);
 });
 x.beginPath();axes.forEach(function(a2,i){var q=pt(i,R*Math.max(0.04,Math.min(1,a2.v)));i?x.lineTo(q[0],q[1]):x.moveTo(q[0],q[1]);});x.closePath();
 var gr=x.createRadialGradient(cx,cy,4,cx,cy,R);
 gr.addColorStop(0,'rgba(77,217,122,.45)');gr.addColorStop(1,'rgba(255,150,54,.10)');
 x.fillStyle=gr;x.fill();
 x.strokeStyle='#4dd97a';x.lineWidth=2;x.stroke();
 axes.forEach(function(a2,i){var q=pt(i,R*Math.max(0.04,Math.min(1,a2.v)));x.beginPath();x.arc(q[0],q[1],2.6,0,7);x.fillStyle='#ffdf6b';x.fill();});
}
function radarTile(axes){
 var strong=axes.filter(function(a2){return a2.v>=0.6;}),weak=axes.filter(function(a2){return a2.v<0.3;});
 var chips=axes.map(function(a2){var p=Math.round(a2.v*100);var cl=p>=60?'g':p<=30?'r':'';return '<div class="rc"><span>'+esc(a2.full||a2.label)+'</span><b class="'+cl+'">'+p+'</b></div>';}).join('');
 var s;
 if(strong.length&&weak.length)s='Strong on <b>'+strong.map(function(a2){return a2.full;}).join(', ')+'</b>. Thin on <b>'+weak.map(function(a2){return a2.full;}).join(', ')+'</b>.';
 else if(strong.length)s='Broad strength: <b>'+strong.map(function(a2){return a2.full;}).join(', ')+'</b>.';
 else if(weak.length)s='Weak shape &mdash; thin on <b>'+weak.map(function(a2){return a2.full;}).join(', ')+'</b>.';
 else s='Balanced &mdash; nothing standing out yet.';
 return '<div class="radar-tile"><canvas class="radar-cv"></canvas>'
  +'<div class="rl"><div class="rl-h">ATTENTION PROFILE</div>'
  +'<div class="rc-grid">'+chips+'</div>'
  +'<p class="rl-s">'+s+'</p></div></div>';
}
/* ---------- FIREHOSE ----------
   Was a GitHub-style contribution grid of colored squares — looked busy, told users nothing at
   a glance (real feedback: "clients can't understand anything from this"). Replaced with a
   buy/sell volume timeline: one bar per minute, green rising above the line for buy $, red
   falling below it for sell $, taller = bigger. That's the actual question a trader has looking
   at live flow — "when did buying happen, when did selling happen, how big" — answered as a
   shape you read in one glance instead of a grid you have to hover cell-by-cell to decode. */
var FH_WINDOW_MIN=20;
var fh={buys:[],streak:0,streakSide:0,biggest:null,flow:[],ac:null};
function firehosePanel(){
 return '<div class="firehose">'
  +'<div class="fh-stats">'
   +'<div class="s"><div class="k">buy pressure</div><div class="v g" id="fhBP">--</div></div>'
   +'<div class="s"><div class="k">streak</div><div class="v h" id="fhST">--</div></div>'
   +'<div class="s"><div class="k">biggest buy</div><div class="v" id="fhBIG">--</div></div>'
   +'<div class="s"><div class="k">trades / 5m</div><div class="v" id="fhFLOW">--</div></div>'
  +'</div>'
  +'<div class="tl-wrap">'
   +'<div class="tl-head"><span id="fhHint">buy/sell volume, last '+FH_WINDOW_MIN+' minutes &mdash; green up = bought, red down = sold, taller = bigger</span>'
   +'<button class="fh-sound" id="fhSound" aria-pressed="'+(state.fhSound?'true':'false')+'">'+(state.fhSound?'&#128266;':'&#128263;')+'</button></div>'
   +'<div class="tl-grid" id="fhTimeline"></div>'
  +'</div>'
  +'<div class="fh-duel"><i class="g" id="fhG" style="width:50%"></i><i class="r" id="fhR" style="width:50%"></i><span class="seam" id="fhSeam" style="left:50%"></span><span class="pc l" id="fhPL">50</span><span class="pc rr" id="fhPR">50</span></div>'
  +'</div>';
}
function fhReset(){fh.buys=[];fh.streak=0;fh.streakSide=0;fh.biggest=null;fh.flow=[];}
function startFirehose(){if(!state.trades.length)fhReset();renderTimeline();feedFirehose();}
function stopFirehose(){}
function renderTimeline(){
 var el=q1('fhTimeline');if(!el)return;
 var n=FH_WINDOW_MIN,bucketMs=60000,now=Date.now();
 var buckets=[];for(var i=n-1;i>=0;i--)buckets.push({buy:0,sell:0});
 state.trades.forEach(function(t){
  var age=now-t.ts;if(age<0||age>=n*bucketMs)return;
  var idx=n-1-Math.floor(age/bucketMs);if(idx<0||idx>=n)return;
  if(t.buy)buckets[idx].buy+=t.usd;else buckets[idx].sell+=t.usd;
 });
 var mx=Math.max.apply(null,buckets.map(function(b){return Math.max(b.buy,b.sell);}))||1;
 el.innerHTML=buckets.map(function(b,i){
  var bh=b.buy?Math.max(2,Math.round(b.buy/mx*44)):0,sh=b.sell?Math.max(2,Math.round(b.sell/mx*44)):0;
  var mAgo=n-1-i;
  var tip=(mAgo===0?'this minute':mAgo+'m ago')+': '+fUsd(b.buy)+' bought, '+fUsd(b.sell)+' sold';
  return '<div class="tlcol" title="'+esc(tip)+'"><i class="tlbuy" style="height:'+bh+'px"></i><i class="tlsell" style="height:'+sh+'px"></i></div>';
 }).join('');
}
function fhCtx(){if(!fh.ac){try{fh.ac=new (window.AudioContext||window.webkitAudioContext)();}catch(_){fh.ac=null;}}return fh.ac;}
function fhBlip(usd,buy){
 if(!state.fhSound)return;var ac=fhCtx();if(!ac)return;
 var o=ac.createOscillator(),g=ac.createGain();
 var big=usd>=1000;
 o.type=big?'triangle':'sine';
 var base=buy?(big?520:340):(big?200:150);
 o.frequency.setValueAtTime(base,ac.currentTime);
 if(big)o.frequency.exponentialRampToValueAtTime(base*1.9,ac.currentTime+0.12);
 g.gain.setValueAtTime(0.0001,ac.currentTime);
 g.gain.exponentialRampToValueAtTime(big?0.16:0.05,ac.currentTime+0.01);
 g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+(big?0.35:0.14));
 o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+0.4);
}
function feedFirehose(fresh){
 var seed=!fresh||!fresh.length;
 (fresh||[]).forEach(function(t){
  fh.buys.push(t.buy?1:0);if(fh.buys.length>40)fh.buys.shift();
  if(t.buy){if(fh.streakSide===1)fh.streak++;else{fh.streakSide=1;fh.streak=1;}}
  else{if(fh.streakSide===-1)fh.streak++;else{fh.streakSide=-1;fh.streak=1;}}
  if(t.buy&&(!fh.biggest||t.usd>fh.biggest.usd))fh.biggest=t;
  fh.flow.push(t.ts);
  fhBlip(t.usd,t.buy);
 });
 if(seed){
  fh.buys=state.trades.slice(0,40).map(function(t){return t.buy?1:0;});
  var bb=state.trades.filter(function(t){return t.buy;}).sort(function(a,b){return b.usd-a.usd;})[0];fh.biggest=bb||null;
  fh.flow=state.trades.map(function(t){return t.ts;});
 }
 fh.flow=fh.flow.filter(function(ts){return Date.now()-ts<300000;});
 renderTimeline();
 var bp=fh.buys.length?Math.round(fh.buys.reduce(function(a,b){return a+b;},0)/fh.buys.length*100):50;
 var bpEl=q1('fhBP'),stEl=q1('fhST'),bgEl=q1('fhBIG'),flEl=q1('fhFLOW'),hintEl=q1('fhHint');
 var g=q1('fhG'),rr=q1('fhR'),seam=q1('fhSeam'),pl=q1('fhPL'),pr=q1('fhPR');
 if(bpEl){bpEl.textContent=bp+'%';bpEl.className='v '+(bp>=55?'g':bp<=45?'r':'');}
 if(g){g.style.width=bp+'%';rr.style.width=(100-bp)+'%';seam.style.left=bp+'%';pl.textContent=bp;pr.textContent=100-bp;}
 if(stEl){stEl.textContent=fh.streak+(fh.streakSide===1?'G':'R')+(fh.streak>=5?'*':'');stEl.className='v '+(fh.streakSide===1?'g':'r');}
 if(bgEl)bgEl.textContent=fh.biggest?fUsd(fh.biggest.usd).replace('$',''):'--';
 if(flEl)flEl.textContent=fh.flow.length;
 if(hintEl&&fresh&&fresh.length){var last=fresh[fresh.length-1];hintEl.textContent=(last.buy?'BUY ':'SELL ')+fUsd(last.usd)+(last.usd>=1000?' WHALE':'')+' just landed';}
}
function tradesPanel(){
 return '<div class="trades"><h3><span class="pulse"></span>The tape &middot; <span id="tradeRate" style="color:#8a8a76">&hellip;</span></h3>'
  +'<div class="tfeed" id="tradesFeed"><div style="padding:14px;color:#6b7180;font-size:12px">waiting for prints&hellip;</div></div></div>'
  +'<div id="washPanel">'+washTradingPanel()+'</div>'
  +'<div id="sightingsPanel"></div>';
}
/* ---------- wash-trading fingerprint ----------
   Reads real wallet-level buy/sell attribution off the live trade tape (t.wal, from
   GeckoTerminal's tx_from_address — already fetched for the tape, no new data source) instead
   of stopping at an aggregate volume number. Three concrete patterns, not a vibe score:
   self-trade loops (a wallet both buying and selling repeatedly in the same window), scripted
   cadence (near-identical time gaps between one wallet's trades), and volume concentrated in
   a tiny wallet set. Refreshes every trade-poll tick since the tape is what feeds it. */
function washTradingSignals(){
 var trades=state.trades||[];
 if(trades.length<8)return null;
 var byWal={};
 trades.forEach(function(t){if(!t.wal)return;(byWal[t.wal]=byWal[t.wal]||[]).push(t);});
 var wallets=Object.keys(byWal);
 if(!wallets.length)return null;
 var selfLoop=[];
 wallets.forEach(function(w){
  var ts=byWal[w],buys=ts.filter(function(t){return t.buy;}).length,sells=ts.length-buys;
  if(buys>=2&&sells>=2)selfLoop.push({wal:w,buys:buys,sells:sells,n:ts.length});
 });
 selfLoop.sort(function(a,b){return b.n-a.n;});
 var cadence=[];
 wallets.forEach(function(w){
  var ts=byWal[w].slice().sort(function(a,b){return a.ts-b.ts;});
  if(ts.length<3)return;
  var deltas=[];for(var i=1;i<ts.length;i++)deltas.push(ts[i].ts-ts[i-1].ts);
  var mean=deltas.reduce(function(s,d){return s+d;},0)/deltas.length;
  if(mean<=0)return;
  var variance=deltas.reduce(function(s,d){return s+(d-mean)*(d-mean);},0)/deltas.length;
  var cv=Math.sqrt(variance)/mean;
  if(cv<0.18)cadence.push({wal:w,n:ts.length,cv:cv});
 });
 cadence.sort(function(a,b){return b.n-a.n;});
 var byCount=wallets.slice().sort(function(a,b){return byWal[b].length-byWal[a].length;});
 var top3=byCount.slice(0,3);
 var topShare=top3.reduce(function(s,w){return s+byWal[w].length;},0)/trades.length;
 return {sample:trades.length,uniqueWallets:wallets.length,selfLoop:selfLoop,cadence:cadence,topShare:topShare};
}
function washTradingPanel(){
 var s=washTradingSignals();
 if(!s)return '<div class="panel"><h3>Wash-trading fingerprint</h3><p style="font-size:12.5px;color:var(--ink-soft)">Not enough of the live trade tape has loaded yet to fingerprint anything &mdash; check back once the tape above has more prints.</p></div>';
 var flags=[];
 if(s.selfLoop.length)flags.push(s.selfLoop.length+' wallet'+(s.selfLoop.length>1?'s':'')+' bought <b>and</b> sold repeatedly in this sample (self-trade loop pattern)');
 if(s.cadence.length)flags.push(s.cadence.length+' wallet'+(s.cadence.length>1?'s':'')+' trading at near-identical time intervals (scripted-cadence pattern)');
 if(s.topShare>=0.5)flags.push('top 3 wallets account for '+Math.round(s.topShare*100)+'% of trades in this sample &mdash; volume concentrated in very few hands');
 var verdict=flags.length?'<b class="neg">Wash-trading pattern signals present in this sample.</b>':'<b class="pos">No wash-trading pattern flagged in this sample.</b>';
 var walRows=s.selfLoop.slice(0,4).map(function(w){return '<div class="wtrow"><span>'+esc(walShort(w.wal))+'</span><span style="color:var(--ink-faint)">'+w.buys+' buys / '+w.sells+' sells</span></div>';}).join('');
 return '<div class="panel"><h3>Wash-trading fingerprint</h3>'
  +'<p style="font-size:12.5px;color:var(--ink-soft)">Reads wallet-level buy/sell attribution straight off the live trade tape ('+s.sample+' recent trades, '+s.uniqueWallets+' unique wallets) &mdash; not the aggregate volume number. '+verdict+'</p>'
  +(flags.length?'<ul style="font-size:12px;color:var(--ink-soft);margin:6px 0 0;padding-left:18px">'+flags.map(function(f){return '<li>'+f+'</li>';}).join('')+'</ul>':'')
  +(walRows?'<div class="wtrows" style="margin-top:8px">'+walRows+'</div>':'')
  +'<p style="font-size:11px;color:var(--ink-faint);margin-top:8px">Heuristic on a limited live sample &mdash; a clean read here is not proof of clean volume, and a flagged wallet alone is not proof of manipulation. Cross-check with the manual checklist above.</p>'
  +'</div>';
}
function walShort(w){return w?w.slice(0,4)+'…'+w.slice(-3):'?';}
function renderTrades(fresh){
 var f=q1('tradesFeed'),rt=q1('tradeRate');if(!f)return;
 var tr=state.trades.slice(0,30);
 if(!tr.length){f.innerHTML='<div style="padding:14px;color:#6b7180;font-size:12px">no recent trades on this pool</div>';return;}
 var mx=Math.max.apply(null,tr.map(function(t){return t.usd;}))||1;
 f.innerHTML=tr.map(function(t,i){
  var pct=Math.max(4,Math.round(t.usd/mx*100));
  return '<div class="trd '+(t.buy?'b':'s')+(fresh&&fresh.indexOf(t.id)>=0?' fresh':'')+'"><span class="side">'+(t.buy?'BUY':'SELL')+'</span>'
   +'<span class="szwrap"><span class="szbar" style="width:'+pct+'%"></span><b>'+fUsd(t.usd)+'</b></span>'
   +'<span class="px">'+fPrice(t.px)+'</span><span class="wal">'+esc(walShort(t.wal))+' &middot; '+fAgo(t.ts)+'</span></div>';
 }).join('');
 if(rt){var recent=tr.filter(function(t){return Date.now()-t.ts<300000;});var b=recent.filter(function(t){return t.buy;}).length;rt.textContent=recent.length+' in 5m &middot; '+Math.round(recent.length?b/recent.length*100:50)+'% buys';}
 var wp=q1('washPanel');if(wp)wp.innerHTML=washTradingPanel();
}
var _pumpN=0;
function pumpTrades(){
 var pp=state.rcPair;if(!pp)return;
 if((_pumpN++%2)===1)fetchOhlcv(pp.addr,pp.pairAddr,pp.chain).then(lwApply); // refresh chart bars
 fetchTrades(pp.addr,pp.pairAddr,pp.chain).then(function(list){
  if(list==null){state._trFail=(state._trFail||0)+1;if(state._trFail>=2&&!state.trades.length){var f=q1('tradesFeed');if(f)f.innerHTML='<div style="padding:14px;color:#6b7180;font-size:12px">live feed catching its breath (GeckoTerminal rate limit) &mdash; retrying&hellip;</div>';}return;}
  state._trFail=0;
  if(!list.length){if(!state.trades.length)renderTrades();return;}
  var known={};state.trades.forEach(function(t){known[t.id]=1;});
  var freshTrades=list.filter(function(t){return !known[t.id];});
  var freshIds=freshTrades.map(function(t){return t.id;});
  var merged=list.concat(state.trades.filter(function(t){return list.every(function(n){return n.id!==t.id;});}));
  merged.sort(function(a,b){return b.ts-a.ts;});
  var firstFill=!state.trades.length;
  state.trades=merged.slice(0,120);
  renderTrades(reduceMotion?[]:freshIds.slice(0,8));
  if(firstFill)feedFirehose();
  else feedFirehose(freshTrades.sort(function(a,b){return a.ts-b.ts;}));
  // once a real sample of the tape has loaded, log its wallets to the shared sightings table
  // and check whether any have shown up early elsewhere — once per coin, not every poll tick.
  if(!state._sightingsSent&&state.trades.length>=8){
   state._sightingsSent=true;
   var wals=Array.from(new Set(state.trades.map(function(t){return t.wal;}).filter(Boolean))).slice(0,40);
   if(wals.length){
    reportWalletSightings(pp,wals);
    walletSightingsPanel(pp,wals).then(function(html){if(state.rcAddr===pp.addr){var el=q1('sightingsPanel');if(el)el.innerHTML=html;}});
   }
  }
 });
}
function startTrades(){
 clearInterval(state._tradesPoll);state.trades=[];_pumpN=0;state._sightingsSent=false;
 var pp=state.rcPair;
 if(pp&&!gtOk(pp.chain)){
  var f=q1('tradesFeed');if(f)f.innerHTML='<div style="padding:14px;color:#6b7180;font-size:12px">The streaming trade feed isn\'t available on '+esc(pp.chain)+' (no GeckoTerminal index). The DexScreener chart above shows this pair\'s live candles &amp; trades. Everything else on this card is live.</div>';
  var r=q1('tradeRate');if(r)r.textContent='see chart';
  return;
 }
 pumpTrades();
 state._tradesPoll=setInterval(pumpTrades,8000);
}
function stopTrades(){clearInterval(state._tradesPoll);state._tradesPoll=0;}
/* ---------- TradingView Lightweight Charts ---------- */
var _lw=null,_lwCandle=null,_lwVol=null,_lwAddr=null,_lwLines=[],_lwRO=null;
function stopChart(){
 if(_lwRO){try{_lwRO.disconnect();}catch(_){}_lwRO=null;}
 if(_lw){try{_lw.remove();}catch(_){}}
 _lw=_lwCandle=_lwVol=null;_lwAddr=null;_lwLines=[];
}
function mountChart(){
 stopChart();
 var pp=state.rcPair;if(!pp)return;
 var el=document.querySelector('.lwchart[data-caddr]');if(!el)return;
 if(typeof LightweightCharts==='undefined'){el.innerHTML='<div style="padding:20px;color:#8a8a76;font-family:\'Share Tech Mono\',monospace;font-size:12px">chart library failed to load &mdash; check connection</div>';return;}
 _lwAddr=pp.addr;
 _lw=LightweightCharts.createChart(el,{
  width:el.clientWidth||600,height:el.clientHeight||360,
  layout:{background:{type:'solid',color:'#12131c'},textColor:'#9aa0ad',fontFamily:'"Share Tech Mono", monospace',fontSize:10},
  grid:{vertLines:{color:'rgba(205,210,223,.05)'},horzLines:{color:'rgba(205,210,223,.05)'}},
  rightPriceScale:{borderColor:'rgba(205,210,223,.14)',scaleMargins:{top:0.08,bottom:0.22}},
  timeScale:{borderColor:'rgba(205,210,223,.14)',timeVisible:true,secondsVisible:false},
  crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{color:'rgba(242,166,61,.5)',labelBackgroundColor:'#cf3a26'},horzLine:{color:'rgba(242,166,61,.5)',labelBackgroundColor:'#cf3a26'}},
  handleScroll:true,handleScale:true,
  localization:{priceFormatter:function(p){return fPrice(p).replace('$','');}}
 });
 _lwCandle=_lw.addCandlestickSeries({upColor:'#46bd62',downColor:'#f2594f',borderUpColor:'#46bd62',borderDownColor:'#f2594f',wickUpColor:'#46bd62',wickDownColor:'#f2594f',priceFormat:{type:'custom',minMove:1e-12,formatter:function(p){return fPrice(p).replace('$','');}}});
 _lwVol=_lw.addHistogramSeries({priceScaleId:'vol',priceFormat:{type:'volume'},color:'rgba(120,130,150,.35)'});
 _lw.priceScale('vol').applyOptions({scaleMargins:{top:0.82,bottom:0},visible:false});
 if(window.ResizeObserver){_lwRO=new ResizeObserver(function(){if(_lw&&el.clientWidth)_lw.applyOptions({width:el.clientWidth,height:el.clientHeight});});_lwRO.observe(el);}
 lwApply();
 fetchOhlcv(pp.addr,pp.pairAddr,pp.chain).then(lwApply);
}
function lwApply(){
 if(!_lwCandle||!_lwAddr)return;
 var pp=state.rcPair;if(!pp||pp.addr!==_lwAddr)return;
 var oc=state.ohlcv.get(pp.addr),rows=(oc&&oc.rows)||[];
 if(!rows.length)return;
 var bars=[],vol=[],seen={};
 rows.forEach(function(r){var t=Math.floor(+r[0]);if(!t||seen[t])return;seen[t]=1;
  var o=+r[1],hi=+r[2],lo=+r[3],cl=+r[4];
  bars.push({time:t,open:o,high:hi,low:lo,close:cl});
  vol.push({time:t,value:+r[5]||0,color:cl>=o?'rgba(70,185,98,.4)':'rgba(242,89,79,.4)'});
 });
 bars.sort(function(a,b){return a.time-b.time;});vol.sort(function(a,b){return a.time-b.time;});
 try{_lwCandle.setData(bars);_lwVol.setData(vol);}catch(_){return;}
 var plan=planFrom(pp,researchOf(pp.addr));
 _lwLines.forEach(function(l){try{_lwCandle.removePriceLine(l);}catch(_){}});_lwLines=[];
 function line(price,color,title,solid){if(!price||!isFinite(price))return;_lwLines.push(_lwCandle.createPriceLine({price:price,color:color,lineWidth:1,lineStyle:solid?LightweightCharts.LineStyle.Solid:LightweightCharts.LineStyle.Dashed,axisLabelVisible:true,title:title}));}
 line(plan.stop,'#f2594f','STOP');
 line(plan.lo,'#46bd62','ENTRY');line(plan.hi,'#46bd62','');
 line(plan.t1,'#5bd07a','T1');line(plan.t2,'#5bd07a','T2');line(plan.t3,'#5bd07a','T3');
 _lw.timeScale().fitContent();
}

/* ---------- research form events ---------- */
function setRes(addr,patch){var r=researchOf(addr);Object.keys(patch).forEach(function(k){r[k]=patch[k];});r.ts=Date.now();state.research[addr]=r;saveRes();}
function rcardClick(ev){
 var pp=state.rcPair;if(!pp)return;var addr=pp.addr;
 var seg=ev.target.closest('.seg [data-v]');
 if(seg){var f=seg.parentNode.getAttribute('data-f');var patch={};patch[f]=seg.getAttribute('data-v');setRes(addr,patch);rerenderRcard();return;}
 var st=ev.target.closest('.stars [data-v]');
 if(st){var f2=st.parentNode.getAttribute('data-f');var patch2={};patch2[f2]=+st.getAttribute('data-v');setRes(addr,patch2);rerenderRcard();return;}
 var cm=ev.target.closest('[data-cm]');
 if(cm){var m=cm.getAttribute('data-cm')==='chart'?'chart':'entries';state.chartMode=m;saveCfg();
  var box=cm.closest('.ctoggle').parentNode;
  box.querySelectorAll('[data-cm]').forEach(function(b){b.setAttribute('aria-pressed',b.getAttribute('data-cm')===m?'true':'false');});
  var emb=box.querySelector('.chart-embed'),cvv=box.querySelector('.lwchart'),ifr=box.querySelector('.chart-embed iframe');
  if(m==='chart'){if(ifr&&!ifr.getAttribute('src'))ifr.setAttribute('src',ifr.getAttribute('data-embsrc')||'');if(emb)emb.hidden=false;if(cvv)cvv.hidden=true;}
  else{if(emb)emb.hidden=true;if(cvv){cvv.hidden=false;if(!_lw)mountChart();else if(_lw&&cvv.clientWidth)_lw.applyOptions({width:cvv.clientWidth,height:cvv.clientHeight});}}
  return;}
 var act=ev.target.closest('[data-act]');if(!act)return;
 var a=act.getAttribute('data-act');
 if(a==='addcat'){var r=researchOf(addr);r.catalysts=(r.catalysts||[]).concat([{when:'',what:''}]);setRes(addr,{catalysts:r.catalysts});rerenderRcard();}
 else if(a==='delcat'){var r2=researchOf(addr);r2.catalysts.splice(+act.getAttribute('data-i'),1);setRes(addr,{catalysts:r2.catalysts});rerenderRcard();}
 else if(a==='moredesc'){var d=act.previousElementSibling;if(d)d.classList.remove('clamp');act.remove();return;}
 else if(a==='savefav'){watchToggle(addr,pp.chain,pp.sym);rerenderRcard();}
 else if(a==='flex'){flexCoin(pp);}
}
function rcardInput(ev){
 var pp=state.rcPair;if(!pp)return;var addr=pp.addr;var t=ev.target;
 var f=t.getAttribute('data-f');
 if(f==='hook'||f==='entry'){setRes(addr,f==='hook'?{hook:t.value}:{entry:t.value});return;}
 if(f==='target'){var n=parseFloat(String(t.value).replace(/[^0-9.]/g,''));setRes(addr,{target:isNaN(n)?0:n});return;}
 if(f==='exitsize'){exitCalcUpdate(t.value);return;} // pure client-side math, no rerender/refetch needed
 var cf=t.getAttribute('data-cf');
 if(cf){var i=+t.closest('.cat').getAttribute('data-i');var r=researchOf(addr);r.catalysts[i]=r.catalysts[i]||{};r.catalysts[i][cf]=t.value;setRes(addr,{catalysts:r.catalysts});}
}
var _rerenderT=0;
function rerenderRcard(){clearTimeout(_rerenderT);_rerenderT=setTimeout(function(){
 var pp=state.rcPair;if(!pp)return;renderResearch(pp,state.safety.get(pp.addr),null);
},60);}

/* ---------- HOT BOARD ---------- */
var SKEL_BC='<div class="skbc"><span class="skel"></span><span class="skel"></span><span class="skel"></span></div>';
function skelBoard(n){var out='';for(var i=0;i<n;i++)out+=SKEL_BC;return out;}
function renderBoard(){
 var el=q1('board');if(!el)return;
 var pool=(state._pool||[]).filter(function(pp){return pp._a;});
 if(!pool.length){el.innerHTML=skelBoard(6);return;}
 var top=pool.slice(0,6);
 var medals=['🥇','🥈','🥉','4','5','6'];
 var mx=Math.max.apply(null,top.map(function(p){return p._a.score;}))||1;
 el.innerHTML=top.map(function(pp,i){
  var a=pp._a,ch=+pp.pc.h1||0,q=pp._q||pickQuality(pp);
  var pf=q.pumpfun?' <span class="cchip pf">pump.fun</span>':'';
  var wr=(!q.mcOk||!q.liqOk||(state.safety.get(pp.addr)||{}).bundle)?' <span class="cchip warn">&#9888;</span>':'';
  return '<button class="bc'+(i===0?' r1':'')+'" data-addr="'+esc(pp.addr)+'" data-chain="'+esc(pp.chain)+'">'
   +'<span class="rank">'+medals[i]+'</span>'
   +'<div class="bsym">'+starBtn(pp.addr,pp.chain,pp.sym)+'$'+esc(pp.sym)+' <span class="cchip">'+esc(pp.chain)+'</span>'+pf+wr+'</div>'
   +'<div class="bmeta">'+fUsd(pp.mc)+' mc &middot; <span class="'+(ch>0?'up':ch<0?'dn':'')+'">'+fPct(ch)+' 1h</span> &middot; '+fAge(pp.ageMs)+'</div>'
   +sfBadges(pp)
   +'<div class="battn"><span class="traj-mini '+a.traj+'">'+a.traj.toUpperCase()+'</span><span class="bar"><i style="width:'+Math.round(a.score/mx*100)+'%"></i></span><b>'+a.score+'</b></div>'
   +'</button>';
 }).join('')
 +'<div class="board-note">Filtered to &ge;$'+(MIN_MC/1000)+'k mc &amp; &ge;$'+(MIN_LIQ/1000)+'k liq &middot; Pump.fun launches ranked up, other Solana launchpads down &middot; &#9888; = failed a gate or bundle-pattern holders. This is attention, not a buy &mdash; run the checklist on the card.</div>';
}
/* ---------- MINT AN IDEA ---------- */
var IDEA_BANK={
 ai:{adj:['neural','turbo','quantum','sentient'],words:['grok','gpt','agent','llm','prompt','vector','gradient','tensor','synapse','oracle','daemon'],
  hooks:['the AI that trades its own bag','on-chain intelligence, off-chain vibes','your model has a wallet now','agentic liquidity, zero prompts','skynet but the terminal is green']},
 gta:{adj:['wanted','vice','5-star'],words:['lucia','heist','rockstar','trailer','sixth','payphone','getaway','armored'],
  hooks:['the trailer dropped, so did we','5 stars and climbing','vice city runs on this','leaked, minted, mooned']},
 trump:{adj:['tremendous','patriot','47th'],words:['maga','eagle','tariff','potus','freedom','liberty','landslide'],
  hooks:['tremendous gains, everybody says so','the deal of the century','red candle? never heard of her','we are going to win so much']},
 elon:{adj:['interplanetary','recursive','420'],words:['grok','xai','doge','mars','optimus','starship','neural','tunnel'],
  hooks:['tweeted into existence','to mars, then to the moon','xai but you actually own it','concerning. bullish.']},
 stream:{adj:['clipped','viral','no-cap'],words:['kai','speed','rizz','stream','chat','clip','pog','dub'],
  hooks:['chat is this real','clipped and shipped','the stream told me to','one W away from valhalla']},
 hood:{adj:['listed','retail','commission-free'],words:['hood','vlad','ticker','retail','app','bell'],
  hooks:['the first meme on retail rails','your grandma can buy this','commission-free, conviction-heavy']},
 dog:{adj:['very','good','loyal'],words:['inu','shiba','bonk','woof','paw','fetch','floki','samo'],
  hooks:['good boy, great chart','fetch the liquidity','every dog has its pump','wags on green days only']},
 frog:{adj:['rare','feels','swamp'],words:['pepe','wojak','chad','kek','ribbit','lily','bog','apu'],
  hooks:['feels good man','back from the swamp, richer','rare and getting rarer','2016 energy, 2026 chart']},
 china:{adj:['lucky','jade','88'],words:['panda','dragon','mao','red','fortune','lantern','koi'],
  hooks:['8 is lucky, 88 is luckier','minted in the group chat','the great wall of green candles']},
 anime:{adj:['based','sakura','9000'],words:['waifu','senpai','chad','sword','otaku','ki','arc','filler'],
  hooks:['notice me senpai','power level over 9000','the filler arc is over','plot armor for your portfolio']}
};
var IDEA_PRE=['turbo','mega','based','giga','hyper','micro','ultra','super','wojak'];
var IDEA_SUF=['inu','pepe','fi','ai','69','420','coin','dao','god','max','world'];
function titleCase(s){return s.replace(/\b\w/g,function(c){return c.toUpperCase();});}
function poolWords(){
 var w={};(state._pool||[]).forEach(function(pp){
  ((pp.sym||'')+' '+(pp.name||'')).toLowerCase().replace(/[^a-z ]/g,' ').split(/\s+/).forEach(function(t){
   if(t.length>=3&&t.length<=10&&!/^(the|and|for|inu|usd|sol|eth|bsc|base|coin|token|pump|meme|moon|pool)$/.test(t))w[t]=(w[t]||0)+1;
  });
 });
 return Object.keys(w).sort(function(a,b){return w[b]-w[a];}).slice(0,20);
}
function hotThemes(){
 var c={};(state._pool||[]).forEach(function(pp){(pp._tags||[]).forEach(function(k){c[k]=(c[k]||0)+1;});});
 var ks=Object.keys(IDEA_BANK).sort(function(a,b){return (c[b]||0)-(c[a]||0);});
 return ks.map(function(k){return {k:k,n:c[k]||0,name:(THEMES.filter(function(t){return t.k===k;})[0]||{}).name||k};});
}
function pick(a){return a[Math.floor(Math.random()*a.length)];}
function mkTicker(name){
 var parts=name.replace(/[^A-Za-z0-9 ]/g,'').split(/(?=[A-Z])|\s+/).filter(Boolean);
 var t;
 if(parts.length>=2)t=parts.map(function(p){return p[0];}).join('')+parts[0].slice(1,3);
 else t=name.replace(/[^A-Za-z0-9]/g,'').slice(0,5);
 t=t.toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(t.length<3)t=(t+name.toUpperCase().replace(/[^A-Z0-9]/g,'')).slice(0,4);
 return t.slice(0,6)||'MEME';
}
function genIdea(themes,pw){
 var hot=themes.filter(function(t){return t.n>0;});
 var th=pick(hot.length?hot.slice(0,4):themes.slice(0,4));
 var bank=IDEA_BANK[th.k];
 var core=(Math.random()<0.45&&pw.length)?pick(pw):pick(bank.words);
 core=core.replace(/[^a-z0-9]/gi,'');
 var name,r=Math.random();
 if(r<0.28)name=titleCase(pick(IDEA_PRE)+core);
 else if(r<0.55)name=titleCase(core)+titleCase(pick(IDEA_SUF));
 else if(r<0.8)name=titleCase(pick(bank.adj).replace(/[^a-z0-9]/gi,''))+titleCase(core);
 else name=titleCase(core)+' '+titleCase(pick(bank.words));
 name=name.replace(/\s+/g,Math.random()<0.5?'':' ').slice(0,22);
 var tk=mkTicker(name);
 var oneliner;
 function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
 if(Math.random()<0.6)oneliner=cap(pick(bank.hooks))+'.';
 else{
  var tmpls=[
   'The first '+th.name.toLowerCase()+' coin that actually '+pick(['ships','delivers','travels','pumps on catalyst','survives the dip'])+'.',
   name+': '+pick(bank.adj)+' energy, '+pick(['parabolic','irresponsible','diamond','textbook'])+' chart.',
   'If the '+th.name.toLowerCase()+' narrative had a ticker, it would be $'+tk+'.',
   'What happens when '+pick(bank.words)+' meets '+pick(pw.length?pw:bank.words)+'. Nobody asked. Everybody aped.'
  ];
  oneliner=pick(tmpls);
 }
 return {name:name,ticker:tk,one:oneliner,theme:th.name};
}
function renderIdeas(){
 var el=q1('ideaBox');if(!el)return;
 if(!(state._pool&&state._pool.length)){el.innerHTML='<div class="empty">reading the narratives&hellip;</div>';return;}
 var themes=hotThemes(),pw=poolWords();
 var top=themes.filter(function(t){return t.n>0;}).slice(0,5);
 var hb='<div class="hotbar"><b>hot narratives:</b> '+(top.length?top.map(function(t,i){return '<span class="hn'+(i===0?' hot':'')+'">'+esc(t.name)+' &middot; '+t.n+'</span>';}).join(''):'<span class="hn">quiet right now</span>')+'</div>';
 var ideas=[],tries=0,seen={};
 while(ideas.length<3&&tries++<40){var g=genIdea(themes,pw);if(seen[g.name.toLowerCase()])continue;seen[g.name.toLowerCase()]=1;ideas.push(g);}
 el.innerHTML=hb+'<div class="ideas">'+ideas.map(function(g){
  return '<div class="idea"><div class="in">'+esc(g.name)+' <span class="it">$'+esc(g.ticker)+'</span></div>'
   +'<div class="ith">rides: '+esc(g.theme)+'</div>'
   +'<div class="io">'+esc(g.one)+'</div>'
   +'<button class="icopy" data-idea="'+esc(g.name+' ($'+g.ticker+') — '+g.one)+'">copy concept</button></div>';
 }).join('')+'</div>';
}
/* ---------- FLEX CARD (shareable) ---------- */
function drawFlex(cv,draw){
 var W=1080,H=1350,dpr=1;cv.width=W;cv.height=H;var x=cv.getContext('2d');
 // paper
 x.fillStyle='#f4ecd9';x.fillRect(0,0,W,H);
 x.strokeStyle='rgba(110,100,70,.18)';x.lineWidth=2;
 for(var gy=90;gy<H;gy+=54){x.beginPath();x.moveTo(0,gy);x.lineTo(W,gy);x.stroke();}
 x.strokeStyle='rgba(207,58,38,.35)';x.beginPath();x.moveTo(70,0);x.lineTo(70,H);x.stroke();
 x.strokeStyle='#2c3550';x.lineWidth=6;x.strokeRect(24,24,W-48,H-48);
 draw(x,W,H);
 x.fillStyle='#8a8a76';x.font='26px Caveat, cursive';x.textAlign='right';
 x.fillText('made on attention radar · not financial advice',W-60,H-54);
}
function flexCoin(pp){
 var v,a,sc;try{a=attn(pp);var sf=state.safety.get(pp.addr);var proj=buildProject(pp,state.rcInfo);v=verdict(pp,a,sf,proj.surface);}catch(_){a={traj:'steady',score:0};v={pct:0,label:'',cls:'pass'};}
 var oc=state.ohlcv.get(pp.addr),oh=(oc&&oc.rows)||[];
 var cv=document.createElement('canvas');
 drawFlex(cv,function(x,W,H){
  x.textAlign='left';
  x.fillStyle='#cf3a26';x.font='700 130px Caveat, cursive';
  x.fillText('$'+pp.sym,110,220);
  x.fillStyle='#565d70';x.font='40px "Patrick Hand", cursive';
  x.fillText(pp.chain+'  ·  '+fUsd(pp.mc)+' mc  ·  '+fAge(pp.ageMs)+' old',112,280);
  // verdict
  var vc={go:'#2f7c4d',watch:'#d9822b',pass:'#8a8a76',fomo:'#a5301c'}[v.cls]||'#2c3550';
  x.fillStyle=vc;x.font='700 84px Caveat, cursive';
  x.fillText(String(v.label).replace(/&[a-z]+;/g,'').replace(/&#\d+;/g,''),110,400);
  // hex attention radar (top-right)
  try{
   var sf2=state.safety.get(pp.addr),proj2=buildProject(pp,state.rcInfo),hr2=holderRate(pp.addr);
   var rax2=radarAxes(pp,a,sf2,proj2,hr2);
   var rcx=W-250,rcy=345,rR=140,rn=rax2.length;
   var rpt=function(i,rr){var ang=-Math.PI/2+i/rn*Math.PI*2;return [rcx+Math.cos(ang)*rr,rcy+Math.sin(ang)*rr,ang];};
   for(var rr1=1;rr1<=4;rr1++){x.beginPath();for(var ri=0;ri<=rn;ri++){var q=rpt(ri%rn,rR*rr1/4);ri?x.lineTo(q[0],q[1]):x.moveTo(q[0],q[1]);}x.strokeStyle='rgba(44,53,80,.18)';x.lineWidth=1.5;x.stroke();}
   x.font='20px "Patrick Hand", cursive';x.fillStyle='#8a8a76';
   rax2.forEach(function(a3,i){var l=rpt(i,rR+18);x.textAlign=Math.abs(Math.cos(l[2]))<0.35?'center':(Math.cos(l[2])>0?'left':'right');x.fillText(a3.label,l[0],l[1]+6);});
   x.beginPath();rax2.forEach(function(a3,i){var q=rpt(i,rR*Math.max(0.05,Math.min(1,a3.v)));i?x.lineTo(q[0],q[1]):x.moveTo(q[0],q[1]);});x.closePath();
   x.fillStyle='rgba(207,58,38,.22)';x.fill();x.strokeStyle='#cf3a26';x.lineWidth=4;x.stroke();
   rax2.forEach(function(a3,i){var q=rpt(i,rR*Math.max(0.05,Math.min(1,a3.v)));x.beginPath();x.arc(q[0],q[1],6,0,7);x.fillStyle='#d9822b';x.fill();});
   x.textAlign='left';
  }catch(_){}
  // sparkline
  var sx=110,sy=560,sw=W-190,sh=290;
  x.fillStyle='#12131c';x.fillRect(sx,sy,sw,sh);
  if(oh.length>2){
   var lo=Infinity,hi=-Infinity;oh.forEach(function(r){hi=Math.max(hi,+r[2]);lo=Math.min(lo,+r[3]);});
   var pad=(hi-lo)*0.1||hi*0.05||1;hi+=pad;lo-=pad;
   var n=oh.length,cw=sw/n;
   oh.forEach(function(r,i){var o=+r[1],cl=+r[4];var up=cl>=o;x.fillStyle=up?'#46bd62':'#f2594f';
    var yO=sy+sh-((o-lo)/(hi-lo))*sh,yC=sy+sh-((cl-lo)/(hi-lo))*sh;
    var top=Math.min(yO,yC),bh=Math.max(2,Math.abs(yO-yC));
    x.fillRect(sx+i*cw+cw*0.2,top,Math.max(1.5,cw*0.6),bh);
   });
  } else { x.fillStyle='#6b7180';x.font='30px "Patrick Hand",cursive';x.fillText('chart indexing…',sx+24,sy+sh/2); }
  // stat chips
  var rows=[
   ['attention',a.score+' / 100 · '+a.traj.toUpperCase()],
   ['buy pressure 1h',Math.round(a.skew1*100)+'%'],
   ['1h / 6h',fPct(+pp.pc.h1||0)+'  /  '+fPct(+pp.pc.h6||0)],
   ['radar score',v.pct+' / 100']
  ];
  x.font='40px "Patrick Hand", cursive';
  rows.forEach(function(rw,i){var yy=930+i*74;
   x.fillStyle='#8a8a76';x.fillText(rw[0],112,yy);
   x.fillStyle='#2c3550';x.textAlign='right';x.fillText(rw[1],W-160,yy);x.textAlign='left';
  });
 });
 exportCanvas(cv,'radar-'+pp.sym+'.png');
}
function flexBoard(){
 var pool=(state._pool||[]).filter(function(pp){return pp._a;}).slice(0,6);
 if(!pool.length)return;
 var cv=document.createElement('canvas');
 drawFlex(cv,function(x,W,H){
  x.textAlign='left';x.fillStyle='#cf3a26';x.font='700 96px Caveat, cursive';
  x.fillText('HOT RIGHT NOW',110,190);
  x.fillStyle='#565d70';x.font='34px "Patrick Hand", cursive';
  x.fillText(new Date().toLocaleString(),112,240);
  var medals=['1','2','3','4','5','6'];
  pool.forEach(function(pp,i){var yy=340+i*150;
   x.fillStyle='#2c3550';x.font='700 70px Caveat, cursive';x.fillText(medals[i],110,yy+18);
   x.fillStyle='#cf3a26';x.font='700 68px Caveat, cursive';x.fillText('$'+pp.sym,200,yy+16);
   x.fillStyle='#565d70';x.font='32px "Patrick Hand", cursive';
   x.fillText(pp.chain+' · '+fUsd(pp.mc)+' · '+fPct(+pp.pc.h1||0)+' 1h',204,yy+58);
   x.fillStyle='#d9822b';x.font='700 46px Caveat, cursive';x.textAlign='right';
   x.fillText('attn '+pp._a.score+' · '+pp._a.traj.toUpperCase(),W-140,yy+30);x.textAlign='left';
  });
 });
 exportCanvas(cv,'radar-hot-board.png');
}
function exportCanvas(cv,name){
 cv.toBlob(function(blob){
  if(!blob)return;
  var url=URL.createObjectURL(blob);
  try{
   if(navigator.clipboard&&window.ClipboardItem){
    navigator.clipboard.write([new ClipboardItem({'image/png':blob})]).then(function(){toast('flex card copied — paste it anywhere 📋');},function(){toast('flex card opened in a new tab');});
   }
  }catch(_){}
  var w=window.open(url,'_blank');
  var a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},20000);
 },'image/png');
}
var _toastT=0;
function toast(msg){
 var t=q1('toast');
 if(!t){t=document.createElement('div');t.id='toast';t.style.cssText='position:fixed;left:50%;bottom:60px;transform:translateX(-50%);background:#2c3550;color:#f4ecd9;padding:10px 18px;border-radius:10px 6px 12px 6px;font-size:14px;z-index:20;box-shadow:3px 3px 0 rgba(0,0,0,.2)';document.body.appendChild(t);}
 t.textContent=msg;t.style.opacity='1';
 clearTimeout(_toastT);_toastT=setTimeout(function(){t.style.opacity='0';t.style.transition='opacity .5s';},2600);
}

/* ---------- tabs / shell ---------- */
function syncTabs(){
 ['scan','watch','research'].forEach(function(t){var el=q1('tab-'+t);if(el)el.hidden=state.tab!==t;});
 document.querySelectorAll('.tabs button').forEach(function(b){b.setAttribute('aria-selected',b.getAttribute('data-tab')===state.tab?'true':'false');});
 if(state.tab==='watch')renderWatch();
 if(state.tab!=='research'){stopChart();stopTrades();stopFirehose();}
}
function renderTicker(){
 var tr=q1('tickerTrack');if(!tr)return;
 var pool=state._pool||[];
 if(!pool.length){tr.innerHTML='<span class="tk-item">loading attention feed&hellip;</span>';return;}
 var items=pool.slice(0,26).map(function(pp){
  var ch=+pp.pc.h1||0,cls=ch>0?'up':ch<0?'dn':'';
  var rmp=pp._a&&pp._a.traj==='ramping'?'<span class="rmp"> ~ramping</span>':'';
  return '<span class="tk-item" data-addr="'+esc(pp.addr)+'" data-chain="'+esc(pp.chain)+'"><b>$'+esc(pp.sym)+'</b> <span class="'+cls+'">'+fPct(ch)+'</span> '+fUsd(pp.mc)+rmp+'</span>';
 }).join('');
 tr.innerHTML=items+items;
}
function setStatus(){
 var d=q1('dot'),s=q1('statusText');var age=state.lastOk?Date.now()-state.lastOk:Infinity;
 if(state.lastErr&&!state.lastOk){d.className='dot err';s.textContent='data source error';}
 else if(age<45000){d.className='dot live';s.textContent='live data · '+fAgo(state.lastOk)+' ago';}
 else if(isFinite(age)){d.className='dot stale';s.textContent='refreshing…';}
 else {d.className='dot';s.textContent='warming up…';}
}

/* morty-bot banner */
(function(){
 var bb=q1('botbar');if(!bb)return;
 try{if(localStorage.getItem('ar-botbar-dismissed')==='1')return;}catch(_){}
 bb.hidden=false;
 var x=q1('botbarX');if(x)x.addEventListener('click',function(){bb.hidden=true;try{localStorage.setItem('ar-botbar-dismissed','1');}catch(_){}});
})();

/* events */
document.querySelectorAll('.tabs button').forEach(function(b){b.addEventListener('click',function(){state.tab=b.getAttribute('data-tab');saveCfg();syncTabs();if(state.tab==='scan'){setUrl(null);scan();}});});
window.addEventListener('popstate',function(){
 var c=new URLSearchParams(location.search).get('coin');
 if(c)openResearch(c,new URLSearchParams(location.search).get('chain')||'',true);
 else{state.tab='scan';saveCfg();syncTabs();}
});
document.querySelectorAll('.chip-toggle[data-chain]').forEach(function(b){b.addEventListener('click',function(){var c=b.getAttribute('data-chain');state.chains[c]=!state.chains[c];b.setAttribute('aria-pressed',state.chains[c]?'true':'false');saveCfg();state.searchCache.clear();scan();});});
q1('tickerTrack').addEventListener('click',function(ev){var t=ev.target.closest('[data-addr]');if(!t)return;openResearch(t.getAttribute('data-addr'),t.getAttribute('data-chain'));});
q1('avatarBtn').addEventListener('click',function(ev){ev.stopPropagation();toggleMenu();});
q1('umProfile').addEventListener('click',openProfile);
q1('pfClose').addEventListener('click',closeProfile);
q1('pfBackdrop').addEventListener('click',closeProfile);
document.addEventListener('click',function(ev){var m=q1('userMenu');if(m&&!m.hidden&&!ev.target.closest('.usermenu-wrap'))toggleMenu(false);});
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'){toggleMenu(false);closeProfile();}});
q1('scanFilters').addEventListener('click',function(ev){var b=ev.target.closest('[data-sf]');if(!b)return;state._scanFilter=b.getAttribute('data-sf');renderScan();});
q1('attnList').addEventListener('click',function(ev){if(watchClick(ev))return;var r=ev.target.closest('[data-addr]');if(!r)return;openResearch(r.getAttribute('data-addr'),r.getAttribute('data-chain'));});
q1('rcardHost').addEventListener('click',rcardClick);
q1('rcardHost').addEventListener('input',rcardInput);
q1('rcardHost').addEventListener('change',rcardInput);
q1('rcardHost').addEventListener('click',function(ev){var s=ev.target.closest('#fhSound');if(!s)return;state.fhSound=!state.fhSound;saveCfg();fhCtx();s.setAttribute('aria-pressed',state.fhSound?'true':'false');s.innerHTML=state.fhSound?'&#128266;':'&#128263;';});
q1('board').addEventListener('click',function(ev){if(watchClick(ev))return;var b=ev.target.closest('[data-addr]');if(!b)return;openResearch(b.getAttribute('data-addr'),b.getAttribute('data-chain'));});
q1('watchList').addEventListener('click',function(ev){if(watchClick(ev))return;var b=ev.target.closest('[data-addr]');if(!b)return;openResearch(b.getAttribute('data-addr'),b.getAttribute('data-chain'));});
if(q1('cmpGo'))q1('cmpGo').addEventListener('click',runCompare);
if(q1('cmpClear'))q1('cmpClear').addEventListener('click',function(){state.compare=[];document.querySelectorAll('.cmp.on').forEach(function(el){el.classList.remove('on');el.innerHTML='&#8644;';});renderCmpBar();});
if(q1('cmpChips'))q1('cmpChips').addEventListener('click',function(ev){var x=ev.target.closest('[data-cmpx]');if(!x)return;compareToggle(x.getAttribute('data-cmpx'));});
q1('pfSave').addEventListener('click',submitProfile);
q1("flexBoard").addEventListener("click",flexBoard);
q1("ideaRoll").addEventListener("click",renderIdeas);
q1("ideaBox").addEventListener("click",function(ev){var b=ev.target.closest("[data-idea]");if(!b)return;try{navigator.clipboard.writeText(b.getAttribute("data-idea"));toast("concept copied");}catch(_){}});
q1('qgo').addEventListener('click',function(){doQuery(q1('q').value,'rcardHost',true);});
q1('q').addEventListener('keydown',function(e){if(e.key==='Enter')doQuery(q1('q').value,'rcardHost',true);});
q1('scanGo').addEventListener('click',function(){doQuery(q1('scanQ').value,'scanQResult',false);});
q1('scanQ').addEventListener('keydown',function(e){if(e.key==='Enter')doQuery(q1('scanQ').value,'scanQResult',false);});
q1('scanQResult').addEventListener('click',function(ev){if(watchClick(ev))return;var r=ev.target.closest('[data-addr]');if(!r)return;openResearch(r.getAttribute('data-addr'),r.getAttribute('data-chain'));});
function doQuery(v,hostId,gotoResearch){
 v=String(v||'').trim();if(!v)return;var host=q1(hostId);
 if(/^0x[0-9a-f]{40}$/i.test(v)||/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)){openResearch(v.toLowerCase(),'');return;}
 host.innerHTML='<div class="empty">searching&hellip;</div>';
 dexSearch(v).then(function(pairs){
  var list=pairs.filter(function(p){return chainOk(p.chain);}).sort(function(a,b){return b.vol.h24-a.vol.h24;}).slice(0,10);
  if(!list.length){host.innerHTML='<div class="empty">No coin found for &ldquo;'+esc(v)+'&rdquo; on your chains. If the meme is real but has no coin yet, that can be the early edge &mdash; watch for one to launch.</div>';return;}
  if(list.length===1&&gotoResearch){openResearch(list[0].addr,list[0].chain);return;}
  list.forEach(function(pp){pp._a=attn(pp);pp._tags=tagThemes(pp);});
  host.innerHTML='<div class="rows" style="margin-bottom:10px">'+list.map(function(pp){return tokenRow(pp);}).join('')+'</div>';
 });
}

/* init */
loadAll();
document.querySelectorAll('.chip-toggle[data-chain]').forEach(function(b){var c=b.getAttribute('data-chain');b.setAttribute('aria-pressed',state.chains[c]?'true':'false');});
syncTabs();
renderTicker();
renderAccount();
// instant first paint: hydrate the last live scan from disk and render it immediately (same
// hard-exclusion safety filter runs on it as on live data), then kick off the real scan() right
// behind it — when that resolves it re-renders with fresh data and overwrites the cache note.
if(loadScanCache()&&rawPool().length){
 renderScan();
 var cn=q1('screenNote');
 if(cn)cn.insertAdjacentHTML('afterend','<div class="cachenote" id="cacheNote">showing cached data &mdash; refreshing live&hellip;</div>');
} else {
 q1('attnList').innerHTML=skelRows(6);
 q1('board').innerHTML=skelBoard(6);
}
scan().then(function(){var cn=q1('cacheNote');if(cn)cn.remove();}).then(setStatus);
// pull the account (avatar/menu) + watchlist (authoritative)
loadAccount();
syncWatchFromServer().then(function(){refreshStars();if(state.tab==='watch')renderWatch();});
// deep link: ?coin=<addr>&chain=<chain> reopens that coin on load / refresh
(function(){var q=new URLSearchParams(location.search),c=q.get('coin');
 if(c&&/^(0x[0-9a-f]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/i.test(c))openResearch(c,q.get('chain')||'',true);
})();
// keep the ticker refreshed from the latest pool even between scans, and re-scan on any tab
setInterval(function(){if(state._pool){renderTicker();renderBoard();}},30000);
setInterval(function(){if(state._pool&&state.tab==='scan')renderIdeas();},120000);
setInterval(function(){scan().then(setStatus);},90000);
setInterval(setStatus,15000);
})();
