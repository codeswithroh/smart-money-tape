(function(){
'use strict';
var DEX='https://api.dexscreener.com',GT='https://api.geckoterminal.com/api/v2';
// GeckoTerminal blocks browser CORS under load -> go through our cached edge proxy
function gtUrl(p){return '/api/gt?path='+encodeURIComponent(p);}
var RUG='https://api.rugcheck.xyz/v1/tokens',HP='https://api.honeypot.is/v2/IsHoneypot',FOMO='https://api.fomoapi.io';
var LS_CFG='ar-cfg-v1',LS_RES='ar-research-v1',LS_HOLD='ar-holders-v1',LS_WATCH='ar-watch-v1';
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
 research:{},holders:{},watch:new Set(),watchMeta:new Map(),_watchBusy:false,
 chartMode:'entries',rcAddr:null,rcPair:null,rcInfo:null,trades:[],_tradesPoll:0,fhSound:false,
 lastOk:0,lastErr:null,scanAt:0
};

/* ---------- storage ---------- */
function loadAll(){
 try{var c=JSON.parse(localStorage.getItem(LS_CFG)||'{}');if(c.chains){state.chains=c.chains;if(state.chains.robinhood===undefined)state.chains.robinhood=true;}if(['scan','watch','research'].indexOf(c.tab)>=0)state.tab=c.tab;if(c.chartMode)state.chartMode=c.chartMode;if(c.fhSound)state.fhSound=true;}catch(_){}
 try{state.research=JSON.parse(localStorage.getItem(LS_RES)||'{}')||{};}catch(_){state.research={};}
 try{state.holders=JSON.parse(localStorage.getItem(LS_HOLD)||'{}')||{};}catch(_){state.holders={};}
 try{var w=JSON.parse(localStorage.getItem(LS_WATCH)||'[]');state.watch=new Set(w);}catch(_){}
}
function saveCfg(){try{localStorage.setItem(LS_CFG,JSON.stringify({apiKey:state.apiKey,chains:state.chains,tab:state.tab,chartMode:state.chartMode,fhSound:state.fhSound}));}catch(_){}}
function saveRes(){try{localStorage.setItem(LS_RES,JSON.stringify(state.research));}catch(_){}}
function saveHold(){try{localStorage.setItem(LS_HOLD,JSON.stringify(state.holders));}catch(_){}}
function saveWatch(){try{localStorage.setItem(LS_WATCH,JSON.stringify(Array.from(state.watch)));}catch(_){}}

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
function watchToggle(addr,chain,sym){
 addr=String(addr||'').toLowerCase();if(!addr||state._watchBusy)return;
 var on=state.watch.has(addr);
 state._watchBusy=true;
 if(on){state.watch.delete(addr);state.watchMeta.delete(addr);}
 else{state.watch.add(addr);state.watchMeta.set(addr,{chain:chain||'',sym:sym||'',added:Date.now()});}
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
 return false;
}
function renderWatch(){
 var host=q1('watchList');if(!host)return;
 var addrs=Array.from(state.watch);
 q1('watchCount').textContent=addrs.length?addrs.length+' saved':'';
 if(!addrs.length){host.innerHTML='<div class="empty">No saved coins yet. Tap the &#9734; on any coin to keep it here.</div>';return;}
 // ensure token data
 dexTokens(addrs).then(function(){
  var rows=addrs.map(function(a){
   var c=state.tokenCache.get(a),pp=c&&c.pair,meta=state.watchMeta.get(a)||{};
   if(pp){pp._a=pp._a||attn(pp);pp._tags=pp._tags||tagThemes(pp);pp._q=pp._q||pickQuality(pp);return tokenRow(pp);}
   return '<button class="trow" data-addr="'+esc(a)+'" data-chain="'+esc(meta.chain||'')+'">'
    +'<span></span><span class="tmain"><span class="tsym">'+starBtn(a,meta.chain,meta.sym)+'$'+esc(meta.sym||'?')+' <span class="cchip">'+esc(meta.chain||'?')+'</span></span>'
    +'<span class="tmeta">no live data right now &mdash; tap to open the x-ray</span></span>'
    +'<span class="traj">&mdash;</span></button>';
  }).join('');
  host.innerHTML=rows;
 });
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
   return done({ok:ok,norm:j.score_normalised,reasons:reasons,lpPct:lp,holders:j.totalHolders,renounced:!j.mintAuthority&&!j.freezeAuthority,topPct:topPct,top5Pct:top5Pct,devPct:devPct,insiderPct:insiderPct,insiders:insiderCount,bundle:bundleSuspected,src:'rugcheck'});
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
function survivalPanel(pp){
 var s=survivalStage(pp);
 if(!s)return '';
 var zones=['#a5301c','#a5301c','#c9762c','#c9762c','#2f7c4d','#2f7c4d'];
 var stops=SURVIVAL_CURVE.map(function(r,i){return {pct:i/(SURVIVAL_CURVE.length-1)*100,col:zones[i]};});
 var grad='linear-gradient(90deg,'+stops.map(function(z){return z.col+' '+z.pct.toFixed(0)+'%';}).join(',')+')';
 var headline=s.sourced
  ?'<b>'+fAge(pp.ageMs)+' old.</b> Roughly <b>'+s.survivePct+'%</b> of Pump.fun launches are still trading at this age or older &mdash; '+s.note+'.'
  :'<b>'+fAge(pp.ageMs)+' old.</b> Age-based die-off is a Pump.fun-specific stat; treat this chain\'s curve as directional only, not sourced to that number.';
 return '<div class="panel"><h3>Survival odds</h3>'
  +'<div class="surv-gauge"><div class="surv-track" style="background:'+grad+'"><i class="surv-mark" style="left:'+Math.round(s.frac*100)+'%"></i></div>'
  +'<div class="surv-labels"><span>launch</span><span>1d</span><span>3d</span><span>1wk</span><span>2wk</span><span>90d+</span></div></div>'
  +'<p style="font-size:12.5px;color:var(--ink-soft);margin-top:8px">'+headline+'</p>'
  +'<p style="font-size:11px;color:var(--ink-faint);margin-top:5px">Base rate from cohort studies of 800k&ndash;18.6M Pump.fun launches (CoinGecko Research; arXiv 2607.02823; arXiv 2512.11850) &mdash; describes what already happened to that population, not what this coin will do.</p>'
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
  return dexTokens(addrs).then(function(){renderScan();});
 });
}
function attentionPool(){
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
 pool.forEach(function(pp){
  pp._a=attn(pp);pp._tags=tagThemes(pp);pp._q=pickQuality(pp);
  pp._rank=pp._a.score+(pp._q.pumpfun?8:0)-((pp._q.notes.indexOf('non-Pump launchpad')>=0)?6:0);
  var sf=state.safety.get(pp.addr);if(sf&&sf.bundle)pp._rank-=25;
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
 q1('scanFilters').innerHTML=chips.map(function(c){return '<button class="chip-toggle" data-sf="'+c[0]+'" aria-pressed="'+(cur===c[0])+'">'+esc(c[1])+'</button>';}).join('');
 var shown=pool.filter(function(pp){
  if(cur==='all')return true;if(cur==='boost')return pp.boosts;if(cur==='fresh')return pp.ageMs!=null&&pp.ageMs<864e5;
  return pp._tags.indexOf(cur)>=0;
 });
 q1('attnList').innerHTML=shown.length?shown.slice(0,40).map(function(pp){return tokenRow(pp);}).join(''):'<div class="empty">nothing here right now &mdash; try another filter or widen chains</div>';
 renderTicker();renderBoard();renderIdeas();
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
 q1('rcardHost').innerHTML='<div class="empty">pulling data&hellip;</div>';
 var c=state.tokenCache.get(addr);
 var p0=(c&&c.pair)?Promise.resolve(c.pair):dexTokens([addr]).then(function(){var c2=state.tokenCache.get(addr);return c2&&c2.pair;});
 p0.then(function(pp){
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
  +firehosePanel()
  +radarTile(rax)
  +chart
  +'<div class="panel"><h3>What the radar sees</h3>'+autoKv+safeLine+watchLine+'</div>'
  +bundlePanel(pp,sf)
  +survivalPanel(pp)
  +projPanel
  +checklistPanel(pp,proj)
  +tradesPanel()
  +form
  +'</div></div>';
 mountChart();
 startFirehose();
 renderTrades();
 var rc=document.querySelector('canvas.radar-cv');if(rc)drawRadar(rc,state._radarAxes||rax);
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
/* ---------- FIREHOSE (github-style contribution grid of trades) ---------- */
var GH_COLS=52,GH_ROWS=7;
var fh={buys:[],streak:0,streakSide:0,biggest:null,flow:[],ac:null};
function firehosePanel(){
 return '<div class="firehose">'
  +'<div class="fh-stats">'
   +'<div class="s"><div class="k">buy pressure</div><div class="v g" id="fhBP">--</div></div>'
   +'<div class="s"><div class="k">streak</div><div class="v h" id="fhST">--</div></div>'
   +'<div class="s"><div class="k">biggest buy</div><div class="v" id="fhBIG">--</div></div>'
   +'<div class="s"><div class="k">trades / 5m</div><div class="v" id="fhFLOW">--</div></div>'
  +'</div>'
  +'<div class="gh-wrap">'
   +'<div class="gh-head"><span id="fhHint">every square = one trade &middot; newest bottom-right</span>'
   +'<span class="gh-leg">small<i></i><i></i><i></i><i></i>big &nbsp;<b class="lg">&#9632;buy</b> <b class="ls">&#9632;sell</b></span>'
   +'<button class="fh-sound" id="fhSound" aria-pressed="'+(state.fhSound?'true':'false')+'">'+(state.fhSound?'&#128266;':'&#128263;')+'</button></div>'
   +'<div class="gh-grid" id="ghGrid"></div>'
  +'</div>'
  +'<div class="fh-duel"><i class="g" id="fhG" style="width:50%"></i><i class="r" id="fhR" style="width:50%"></i><span class="seam" id="fhSeam" style="left:50%"></span><span class="pc l" id="fhPL">50</span><span class="pc rr" id="fhPR">50</span></div>'
  +'</div>';
}
function fhReset(){fh.buys=[];fh.streak=0;fh.streakSide=0;fh.biggest=null;fh.flow=[];}
function startFirehose(){if(!state.trades.length)fhReset();renderGrid();feedFirehose();}
function stopFirehose(){}
function ghLevel(usd){return usd>=2000?4:usd>=500?3:usd>=80?2:1;}
function renderGrid(freshIds){
 var el=q1('ghGrid');if(!el)return;
 var N=GH_COLS*GH_ROWS;
 var BUY=['#0e4429','#006d32','#26a641','#39d353'],SELL=['#5c1a14','#8a241b','#c62f22','#ff5c4d'];
 var tr=state.trades.slice(0,N).slice().reverse(); // oldest -> newest
 var pad=N-tr.length,cells=[];
 for(var i=0;i<pad;i++)cells.push('<i></i>');
 tr.forEach(function(t,ix){
  var lv=ghLevel(t.usd),pal=t.buy?BUY:SELL;
  var isNew=freshIds&&freshIds.indexOf(t.id)>=0&&!reduceMotion;
  cells.push('<i class="'+(ix===tr.length-1?'now':'')+(isNew?' now':'')+'" style="background:'+pal[lv-1]+'" title="'+(t.buy?'BUY ':'SELL ')+fUsd(t.usd)+' &middot; '+fAgo(t.ts)+' ago"></i>');
 });
 el.innerHTML=cells.join('');
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
 renderGrid(seed?null:(fresh||[]).map(function(t){return t.id;}));
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
  +'<div class="tfeed" id="tradesFeed"><div style="padding:14px;color:#6b7180;font-size:12px">waiting for prints&hellip;</div></div></div>';
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
 });
}
function startTrades(){
 clearInterval(state._tradesPoll);state.trades=[];_pumpN=0;
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
 var cf=t.getAttribute('data-cf');
 if(cf){var i=+t.closest('.cat').getAttribute('data-i');var r=researchOf(addr);r.catalysts[i]=r.catalysts[i]||{};r.catalysts[i][cf]=t.value;setRes(addr,{catalysts:r.catalysts});}
}
var _rerenderT=0;
function rerenderRcard(){clearTimeout(_rerenderT);_rerenderT=setTimeout(function(){
 var pp=state.rcPair;if(!pp)return;renderResearch(pp,state.safety.get(pp.addr),null);
},60);}

/* ---------- HOT BOARD ---------- */
function renderBoard(){
 var el=q1('board');if(!el)return;
 var pool=(state._pool||[]).filter(function(pp){return pp._a;});
 if(!pool.length){el.innerHTML='<div class="empty">reading the tape&hellip;</div>';return;}
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
scan().then(setStatus);
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
