(function(){
'use strict';
var DEX='https://api.dexscreener.com',GT='https://api.geckoterminal.com/api/v2';
var RUG='https://api.rugcheck.xyz/v1/tokens',HP='https://api.honeypot.is/v2/IsHoneypot',FOMO='https://api.fomoapi.io';
var LS_CFG='ar-cfg-v1',LS_RES='ar-research-v1',LS_JRNL='ar-journal-v1',LS_HOLD='ar-holders-v1',LS_WATCH='ar-watch-v1';
var EVM_CHAIN_ID={bsc:56,base:8453,ethereum:1};
function gtNet(c){return ({solana:'solana',bsc:'bsc',base:'base',ethereum:'eth'})[c]||c;}
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
 chains:{solana:true,base:true,bsc:true,ethereum:false},
 searchCache:new Map(), // q -> {ts,pairs}
 tokenCache:new Map(),   // addr -> {ts,pair}
 boosts:[],trending:[],
 safety:new Map(),ohlcv:new Map(),
 research:{},journal:[],holders:{},watch:new Set(),
 chartMode:'entries',rcAddr:null,rcPair:null,
 lastOk:0,lastErr:null,scanAt:0
};

/* ---------- storage ---------- */
function loadAll(){
 try{var c=JSON.parse(localStorage.getItem(LS_CFG)||'{}');if(c.apiKey)state.apiKey=c.apiKey;if(c.chains)state.chains=c.chains;if(c.tab)state.tab=c.tab;if(c.chartMode)state.chartMode=c.chartMode;}catch(_){}
 try{state.research=JSON.parse(localStorage.getItem(LS_RES)||'{}')||{};}catch(_){state.research={};}
 try{state.journal=JSON.parse(localStorage.getItem(LS_JRNL)||'[]')||[];}catch(_){state.journal=[];}
 try{state.holders=JSON.parse(localStorage.getItem(LS_HOLD)||'{}')||{};}catch(_){state.holders={};}
 try{var w=JSON.parse(localStorage.getItem(LS_WATCH)||'[]');state.watch=new Set(w);}catch(_){}
}
function saveCfg(){try{localStorage.setItem(LS_CFG,JSON.stringify({apiKey:state.apiKey,chains:state.chains,tab:state.tab,chartMode:state.chartMode}));}catch(_){}}
function saveRes(){try{localStorage.setItem(LS_RES,JSON.stringify(state.research));}catch(_){}}
function saveJrnl(){try{localStorage.setItem(LS_JRNL,JSON.stringify(state.journal.slice(-300)));}catch(_){}}
function saveHold(){try{localStorage.setItem(LS_HOLD,JSON.stringify(state.holders));}catch(_){}}
function saveWatch(){try{localStorage.setItem(LS_WATCH,JSON.stringify(Array.from(state.watch)));}catch(_){}}

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
  sym:(p.baseToken&&p.baseToken.symbol)||'?',name:(p.baseToken&&p.baseToken.name)||'',
  chain:normChain(p.chainId),pairAddr:String(p.pairAddress||'').toLowerCase(),
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
function fetchBoosts(){
 return fetch(DEX+'/token-boosts/top/v1').then(function(r){return r.ok?r.json():[];}).then(function(j){
  var a=Array.isArray(j)?j:[];
  state.boosts=a.map(function(x){return {addr:String(x.tokenAddress||'').toLowerCase(),chain:normChain(x.chainId),desc:x.description||'',amt:+x.totalAmount||+x.amount||0,links:(x.links||[]).map(function(l){return l.url;})};}).filter(function(x){return x.addr&&chainOk(x.chain);}).slice(0,30);
  okNow();
 }).catch(function(){errNow();});
}
function gtPools(net,path){
 return fetch(GT+'/networks/'+net+'/'+path+'?page=1').then(function(r){return r.ok?r.json():null;}).then(function(j){
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
 var reqs=[];nets.forEach(function(n){reqs.push(gtPools(n,'trending_pools'));reqs.push(gtPools(n,'new_pools'));});
 return Promise.all(reqs).then(function(res){
  var all=[],seen={};res.forEach(function(x){x.forEach(function(t){if(seen[t.addr])return;seen[t.addr]=1;all.push(t);});});
  state.trending=all;
 });
}
function fetchSafety(addr,chain){
 var c=state.safety.get(addr);if(c&&Date.now()-c.ts<300000)return Promise.resolve(c);
 var done=function(res){res.ts=Date.now();state.safety.set(addr,res);return res;};
 if(chain==='solana'){
  return fetch(RUG+'/'+addr+'/report').then(function(r){return r.ok?r.json():null;}).then(function(j){
   if(!j)return done({ok:null,reasons:['no rug data'],src:'rugcheck'});
   var risks=j.risks||[];var danger=risks.filter(function(x){return String(x.level||'').toLowerCase()==='danger';}).map(function(x){return x.name;});
   var top=(j.topHolders||[]).filter(function(h){return !h.insider&&h.pct!=null;});var topPct=top.length?top[0].pct:null;
   var lp=j.lpLockedPct!=null?j.lpLockedPct:(j.markets&&j.markets[0]&&j.markets[0].lp&&j.markets[0].lp.lpLockedPct);
   var reasons=[];if(j.rugged)reasons.push('flagged rugged');if(j.mintAuthority)reasons.push('mint not renounced');if(j.freezeAuthority)reasons.push('freeze not renounced');
   if(topPct!=null&&topPct>25)reasons.push('top holder '+topPct.toFixed(0)+'%');if(lp!=null&&lp<50)reasons.push('LP '+lp.toFixed(0)+'% locked');
   danger.forEach(function(d){reasons.push(d);});
   var ok=!j.rugged&&!j.mintAuthority&&!j.freezeAuthority&&!(topPct!=null&&topPct>35)&&!danger.length;
   recordHolders(addr,j.totalHolders);
   return done({ok:ok,norm:j.score_normalised,reasons:reasons,lpPct:lp,holders:j.totalHolders,renounced:!j.mintAuthority&&!j.freezeAuthority,topPct:topPct,src:'rugcheck'});
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
 var c=state.ohlcv.get(addr);if(c&&Date.now()-c.ts<45000)return Promise.resolve(c.rows);
 if(!pairAddr)return Promise.resolve([]);
 var net=gtNet(chain||'solana');
 return fetch(GT+'/networks/'+net+'/pools/'+pairAddr+'/ohlcv/minute?aggregate=5&limit=90&currency=usd').then(function(r){return r.ok?r.json():null;}).then(function(j){
  var rows=(j&&j.data&&j.data.attributes&&j.data.attributes.ohlcv_list)||[];rows=rows.slice().reverse();
  state.ohlcv.set(addr,{ts:Date.now(),rows:rows});return rows;
 }).catch(function(){state.ohlcv.set(addr,{ts:Date.now(),rows:[]});return [];});
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

/* ---------- SCAN render ---------- */
function scan(){
 return Promise.all([fetchBoosts(),fetchTrending()]).then(function(){
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
  var b=state.boosts.filter(function(x){return x.addr===addr;})[0];if(b&&!pp.desc)pp.desc=b.desc;
  pp._src=srcOf[addr];seen[addr]=1;pool.push(pp);
 });
 pool.forEach(function(pp){pp._a=attn(pp);pp._tags=tagThemes(pp);});
 pool.sort(function(a,b){return b._a.score-a._a.score;});
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
}
function tokenRow(pp){
 var a=pp._a||attn(pp),tags=pp._tags||tagThemes(pp);
 var tg=tags.length?tags.map(function(k){var t=THEMES.filter(function(x){return x.k===k;})[0];return '<span class="tag">'+esc(t?t.name:k)+'</span>';}).join('')
   :'<span class="tag n">'+esc(typeGuess(pp))+' &mdash; you tag it</span>';
 var src=(pp._src&&pp._src!=='boost')?'<span class="cchip">'+esc(pp._src)+'</span>':'';
 return '<button class="trow" data-addr="'+esc(pp.addr)+'" data-chain="'+esc(pp.chain)+'">'
  +(pp.img?'<img class="ava" src="'+esc(pp.img)+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">':'<span></span>')
  +'<span class="tmain"><span class="tsym">$'+esc(pp.sym)+' <span class="cchip">'+esc(pp.chain)+'</span>'+src+(pp.boosts?' <span class="cchip">boost</span>':'')+'</span>'
  +'<span class="tmeta">'+fUsd(pp.mc)+' mc &middot; '+fUsd(pp.vol.h24)+' 24h &middot; '+fAge(pp.ageMs)+' old &middot; '+fPct(+pp.pc.h1||0)+' 1h</span>'
  +'<span class="tags">'+tg+'</span></span>'
  +trajTag(a)+'</button>';
}

/* ---------- RESEARCH ---------- */
function openResearch(addr,chain){
 addr=String(addr||'').toLowerCase();
 state.rcAddr=addr;state.tab='research';syncTabs();saveCfg();
 q1('rcardHost').innerHTML='<div class="empty">pulling data&hellip;</div>';
 var c=state.tokenCache.get(addr);
 var p0=(c&&c.pair)?Promise.resolve(c.pair):dexTokens([addr]).then(function(){var c2=state.tokenCache.get(addr);return c2&&c2.pair;});
 p0.then(function(pp){
  if(!pp){q1('rcardHost').innerHTML='<div class="empty">No DexScreener data for that address on the selected chains.</div>';return;}
  state.rcPair=pp;
  return Promise.all([
   fetchSafety(addr,pp.chain),
   fetchOhlcv(addr,pp.pairAddr,pp.chain),
   fomoWatchers(addr),
   primeThemePeers(pp)
  ]).then(function(r){renderResearch(pp,r[0],r[2]);});
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
function researchOf(addr){return state.research[addr]||{type:'',meme:0,hook:'',catalysts:[],target:0,tf:'',entry:'',conviction:0};}
function catScore(cats){
 if(!cats||!cats.length)return {v:0.25,label:'no catalyst identified'};
 var now=Date.now(),soon=false,future=false;
 cats.forEach(function(c){if(!c.when)return;var t=Date.parse(c.when);if(isNaN(t))return;if(t>now&&t-now<7*864e5)soon=true;else if(t>now)future=true;});
 if(soon)return {v:1,label:'catalyst within 7 days'};
 if(future)return {v:0.6,label:'catalyst dated, >7 days out'};
 return {v:0.45,label:cats.length+' catalyst note'+(cats.length>1?'s':'')+', undated'};
}
function verdict(pp,a,sf){
 var r=researchOf(pp.addr);
 var att=a.traj==='ramping'?1:a.traj==='steady'?0.55:0.2;
 var meme=(r.meme||0)/5;
 var cs=catScore(r.catalysts);
 var safe=sf&&sf.ok===true?1:(!sf||sf.ok==null?0.55:0);
 var conv=(r.conviction||0)/5;
 var pct=Math.round(100*(0.30*att+0.28*meme+0.18*cs.v+0.12*safe+0.12*conv));
 var openHere=state.journal.some(function(j){return j.addr===pp.addr&&j.status==='open';});
 var fomo=((+pp.pc.h1||0)>=40||(+pp.pc.m5||0)>=18)&&!openHere;
 var label,cls;
 if(fomo&&pct<72){label='FOMO RISK &mdash; already running, you would be chasing';cls='fomo';}
 else if(pct>=62){label='RESEARCH says: in the buy zone (your call)';cls='go';}
 else if(pct>=42){label='WATCH &mdash; wait for the catalyst';cls='watch';}
 else{label='PASS &mdash; thin narrative for now';cls='pass';}
 return {pct:pct,label:label,cls:cls,att:att,meme:meme,cs:cs,safe:safe,conv:conv,fomo:fomo};
}
function planFrom(pp,r){
 var px=pp.priceUsd||0;var mc=pp.mc||pp.fdv||0;
 var tMult=(r.target&&mc&&r.target>mc)?r.target/mc:null;
 var m1,m2,m3;
 if(tMult){m1=(tMult-1)*0.35;m2=(tMult-1)*0.7;m3=(tMult-1);}
 else{m1=0.4;m2=1.1;m3=2.5;}
 return {px:px,lo:px*0.94,hi:px*1.05,stop:px*0.7,stopPct:30,t1:px*(1+m1),t2:px*(1+m2),t3:px*(1+m3),tMult:tMult};
}
function renderResearch(pp,sf,watchers){
 var a=attn(pp),v=verdict(pp,a,sf),r=researchOf(pp.addr),ceil=themeCeiling(pp),hr=holderRate(pp.addr);
 var tags=tagThemes(pp),tguess=typeGuess(pp);
 var lnk=[];pp.socials.forEach(function(s){if(s.url)lnk.push('<a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.type||'link')+'</a>');});
 (pp.sites||[]).slice(0,1).forEach(function(u){lnk.push('<a href="'+esc(u)+'" target="_blank" rel="noopener">site</a>');});
 lnk.push('<a href="'+esc(pp.url||('https://dexscreener.com/search?q='+pp.addr))+'" target="_blank" rel="noopener">DexScreener</a>');
 var plan=planFrom(pp,r);

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
  +kv('trajectory',a.traj.toUpperCase()+' &middot; attn '+a.score,a.traj==='ramping'?'pos':a.traj==='fading'?'neg':'')
  +(ceil?kv(ceil.theme+' peers','median peak '+fUsd(ceil.median)+', top '+fUsd(ceil.max)+' (n='+ceil.n+')'):'')
  +'</div>';
 var safeLine='<div style="margin-top:9px;font-size:12.5px;color:var(--ink-soft)"><b>Rug screen ('+esc((sf&&sf.src)||'?')+'):</b> '
  +(sf&&sf.ok===true?'passed':sf&&sf.ok===false?'FAILED &mdash; '+esc((sf.reasons||[]).join(', ')):'unverified')
  +(sf&&sf.renounced?' &middot; renounced':'')+(sf&&sf.lpPct!=null?' &middot; LP '+sf.lpPct.toFixed(0)+'%':'')+(sf&&sf.topPct!=null?' &middot; top holder '+sf.topPct.toFixed(1)+'%':'')+'</div>';
 var watchLine=watchers&&watchers.buys?'<div style="margin-top:6px;font-size:12.5px;color:var(--ink-faint)">fomo feed: '+watchers.buys+' recent buy'+(watchers.buys>1?'s':'')+(watchers.traders.length?' &mdash; '+esc(watchers.traders.slice(0,4).join(', ')):'')+' &middot; <i>info only, do not copy</i></div>':'';

 var chart=chartBlock(pp,plan);

 var form='<div class="panel"><h3>Your narrative read</h3>'
  +'<div class="formrow"><label>Is the coin useful, or is the meme strong enough to travel?</label>'
   +'<div class="seg" data-f="type">'+seg(['meme','utility','tech'],r.type)+'</div></div>'
  +'<div class="formrow"><label>Meme strength &mdash; funny / weird / relatable enough to spread?</label>'
   +'<div class="stars" data-f="meme">'+stars(r.meme)+'</div></div>'
  +'<div class="formrow"><label>Cultural hook &mdash; what big object does this attach to? (AI, GTA, a streamer, news headline&hellip;)</label>'
   +'<textarea data-f="hook" placeholder="e.g. OpenAI Jalapeno chip beats Nvidia GB300 &mdash; spicy AI-chip meme">'+esc(r.hook)+'</textarea></div>'
  +'<div class="formrow"><label>Catalysts &mdash; what specific event pushes this past its current holders?</label>'
   +'<div class="cats" data-f="cats">'+catsHtml(r.catalysts)+'</div>'
   +'<button class="btn sm" data-act="addcat" style="align-self:flex-start;margin-top:5px">+ catalyst</button></div>'
  +'<div class="formrow" style="flex-direction:row;gap:14px;flex-wrap:wrap">'
   +'<span style="display:flex;flex-direction:column;gap:5px"><label>Realistic target mcap</label><input data-f="target" type="text" inputmode="decimal" value="'+esc(r.target?String(r.target):'')+'" placeholder="e.g. 1000000" style="width:150px"></span>'
   +'<span style="display:flex;flex-direction:column;gap:5px"><label>Timeframe</label><div class="seg" data-f="tf">'+seg(['minutes','hours','days','weeks'],r.tf)+'</div></span>'
   +'<span style="display:flex;flex-direction:column;gap:5px"><label>Conviction</label><div class="stars" data-f="conviction">'+stars(r.conviction)+'</div></span></div>'
  +'<div class="formrow"><label>Entry reason (one line &mdash; you will grade this later)</label>'
   +'<textarea data-f="entry" placeholder="Why now? Which catalyst? Why is attention about to ramp?">'+esc(r.entry)+'</textarea></div>'
  +'<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="savefav">'+(state.watch.has(pp.addr)?'&#9733; watching':'&#9734; watch')+'</button>'
   +'<button class="btn pri" data-act="addjrnl">Add to journal as open position</button></div></div>';

 q1('rcardHost').innerHTML='<div class="rcard"><div class="cap">'
  +(pp.img?'<img src="'+esc(pp.img)+'" alt="" onerror="this.style.visibility=\'hidden\'">':'')
  +'<span class="nm">$'+esc(pp.sym)+'</span><span class="chain">'+esc(pp.chain)+'</span>'
  +'<span class="lnks">'+lnk.join('')+'</span></div>'
  +'<div class="body">'
  +'<div><div class="verdict '+v.cls+'">'+v.label+'</div>'
   +'<div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px">research score <b>'+v.pct+'/100</b> = attention '+Math.round(v.att*100)+' &middot; meme '+Math.round(v.meme*100)+' &middot; '+esc(v.cs.label)+' &middot; safety '+Math.round(v.safe*100)+' &middot; conviction '+Math.round(v.conv*100)+'</div></div>'
  +'<div class="panel"><h3>What the radar sees</h3>'+autoKv+safeLine+watchLine+'</div>'
  +chart
  +form
  +'</div></div>';
 hydrateChart();
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
function fitCanvas(cv){var dpr=window.devicePixelRatio||1,w=cv.clientWidth||cv.parentNode.clientWidth||600,h=cv.clientHeight||160;cv.width=Math.max(1,Math.round(w*dpr));cv.height=Math.max(1,Math.round(h*dpr));var x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);return {x:x,w:w,h:h};}
function chartBlock(pp,plan){
 var slug=chainSlug(pp.chain),canEmbed=!!(pp.pairAddr&&slug),mode=state.chartMode;if(!canEmbed)mode='entries';
 var toggle='<div class="ctoggle">'+(canEmbed?'<button data-cm="chart" aria-pressed="'+(mode==='chart')+'">DexScreener</button>':'')+'<button data-cm="entries" aria-pressed="'+(mode==='entries')+'">Candles + levels</button></div>';
 var embed=canEmbed?'<div class="chart-embed"'+(mode==='entries'?' hidden':'')+'><iframe loading="lazy" title="chart" src="https://dexscreener.com/'+slug+'/'+esc(pp.pairAddr)+'?embed=1&theme=dark&trades=0&info=0"></iframe></div>':'';
 var cand='<canvas class="candles" data-caddr="'+esc(pp.addr)+'"'+(mode==='chart'?' hidden':'')+'></canvas>';
 var note='<div style="font-size:11.5px;color:var(--ink-faint);margin-top:5px">Levels are mechanical: entry '+fPrice(plan.lo)+'&ndash;'+fPrice(plan.hi)+' &middot; stop '+fPrice(plan.stop)+' (-'+plan.stopPct+'%) &middot; targets '+fPrice(plan.t1)+' / '+fPrice(plan.t2)+' / '+fPrice(plan.t3)+(plan.tMult?' (to your '+plan.tMult.toFixed(1)+'x mcap goal)':'')+'. Not advice.</div>';
 return '<div>'+toggle+embed+cand+note+'</div>';
}
function hydrateChart(){
 var cv=document.querySelector('canvas.candles[data-caddr]');if(!cv||cv._done)return;cv._done=1;
 var pp=state.rcPair;if(!pp)return;var plan=planFrom(pp,researchOf(pp.addr));
 fetchOhlcv(pp.addr,pp.pairAddr,pp.chain).then(function(rows){drawCandles(cv,rows,plan);});
}
function drawCandles(cv,oh,plan){
 var c=fitCanvas(cv),x=c.x,w=c.w,h=c.h;x.fillStyle='#12131c';x.fillRect(0,0,w,h);
 if(!oh||oh.length<3){x.fillStyle='#cdd2df';x.font='13px "Patrick Hand",cursive';x.textAlign='left';x.fillText('candles not indexed yet (GeckoTerminal)',12,h/2);return;}
 var pad={l:8,r:104,t:12,b:18};var cur=plan&&plan.px||+oh[oh.length-1][4];
 var cLo=Infinity,cHi=-Infinity;oh.forEach(function(r){cHi=Math.max(cHi,+r[2]);cLo=Math.min(cLo,+r[3]);});
 var brk=null;for(var bi=0;bi<oh.length-2;bi++){var hh2=+oh[bi][2];if(brk==null||hh2>brk)brk=hh2;}
 var lv=[];
 if(plan&&plan.px){var g=function(v){return Math.round((v/plan.px-1)*100);};
  lv.push({v:plan.stop,c:'#f2594f',t:'STOP '+g(plan.stop)+'%',d:[4,3],hard:1});
  lv.push({v:plan.lo,c:'#46bd62',t:'entry lo',d:[2,3],hard:1});
  lv.push({v:plan.hi,c:'#46bd62',t:'entry hi',d:[2,3],hard:1});
  lv.push({v:plan.t1,c:'#5bd07a',t:'T1 +'+g(plan.t1)+'%',d:[7,4],hard:1});
  lv.push({v:plan.t2,c:'#5bd07a',t:'T2 +'+g(plan.t2)+'%',d:[7,4]});
  lv.push({v:plan.t3,c:'#5bd07a',t:'T3 +'+g(plan.t3)+'%',d:[7,4]});}
 if(brk)lv.push({v:brk,c:'#f2a63d',t:'breakout',d:[3,3],hard:1});
 var rLo=cLo,rHi=cHi;lv.forEach(function(L){if(L.hard){rLo=Math.min(rLo,L.v);rHi=Math.max(rHi,L.v);}});if(cur){rLo=Math.min(rLo,cur);rHi=Math.max(rHi,cur);}
 var pdv=(rHi-rLo)*0.07||rHi*0.03||1;rHi+=pdv;rLo=Math.max(0,rLo-pdv);
 var Y=function(v){return pad.t+(1-(v-rLo)/(rHi-rLo||1))*(h-pad.t-pad.b);};
 x.textAlign='left';x.font='9px "Patrick Hand",cursive';
 for(var gi=0;gi<=4;gi++){var gv=rLo+(rHi-rLo)*gi/4,gy=Y(gv);x.strokeStyle='rgba(205,210,223,.09)';x.setLineDash([]);x.beginPath();x.moveTo(pad.l,gy);x.lineTo(w-pad.r,gy);x.stroke();x.fillStyle='rgba(205,210,223,.4)';x.fillText(fPrice(gv),w-pad.r+5,gy-2);}
 if(plan&&plan.lo&&plan.hi){var b1=Y(plan.hi),b2=Y(plan.lo);x.fillStyle='rgba(70,185,98,.12)';x.fillRect(pad.l,Math.min(b1,b2),w-pad.r-pad.l,Math.abs(b2-b1)||1);}
 var n=oh.length,cw=(w-pad.l-pad.r)/n;
 oh.forEach(function(r,i){var o=+r[1],hh=+r[2],ll=+r[3],cl=+r[4];var up=cl>=o,col=up?'#46bd62':'#f2594f';var cx=pad.l+i*cw+cw/2;x.strokeStyle=col;x.lineWidth=1;x.setLineDash([]);x.beginPath();x.moveTo(cx,Y(hh));x.lineTo(cx,Y(ll));x.stroke();x.fillStyle=col;var bt=Y(Math.max(o,cl)),bb=Y(Math.min(o,cl));x.fillRect(cx-Math.max(1,cw*0.32),bt,Math.max(1.4,cw*0.64),Math.max(1,bb-bt));});
 x.font='10px "Patrick Hand",cursive';
 lv.forEach(function(L){if(L.v>rHi||L.v<rLo){var ey=L.v>rHi?pad.t+9:h-pad.b-3;x.fillStyle=L.c;x.textAlign='right';x.fillText(L.t+(L.v>rHi?' ↑':' ↓'),w-pad.r-3,ey);x.textAlign='left';return;}var yy=Y(L.v);x.strokeStyle=L.c;x.lineWidth=1;x.setLineDash(L.d||[]);x.beginPath();x.moveTo(pad.l,yy);x.lineTo(w-pad.r,yy);x.stroke();x.setLineDash([]);x.fillStyle=L.c;x.fillText(L.t,w-pad.r+5,yy+3.5);});
 if(cur){var yc=Y(cur);x.setLineDash([]);x.strokeStyle='#eef1f7';x.lineWidth=1.5;x.beginPath();x.moveTo(pad.l,yc);x.lineTo(w-pad.r,yc);x.stroke();x.fillStyle='#eef1f7';x.fillText('now '+fPrice(cur),w-pad.r+5,yc-3);}
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
 if(cm){state.chartMode=cm.getAttribute('data-cm')==='chart'?'chart':'entries';saveCfg();rerenderRcard();return;}
 var act=ev.target.closest('[data-act]');if(!act)return;
 var a=act.getAttribute('data-act');
 if(a==='addcat'){var r=researchOf(addr);r.catalysts=(r.catalysts||[]).concat([{when:'',what:''}]);setRes(addr,{catalysts:r.catalysts});rerenderRcard();}
 else if(a==='delcat'){var r2=researchOf(addr);r2.catalysts.splice(+act.getAttribute('data-i'),1);setRes(addr,{catalysts:r2.catalysts});rerenderRcard();}
 else if(a==='savefav'){if(state.watch.has(addr))state.watch.delete(addr);else state.watch.add(addr);saveWatch();rerenderRcard();}
 else if(a==='addjrnl'){addToJournal(pp);}
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

/* ---------- JOURNAL ---------- */
function addToJournal(pp){
 var r=researchOf(pp.addr);
 var cat=(r.catalysts||[]).filter(function(c){return c.what;}).map(function(c){return c.what+(c.when?' ('+c.when+')':'');}).join('; ');
 state.journal.push({
  id:'j_'+Date.now()+'_'+pp.addr.slice(0,5),addr:pp.addr,sym:pp.sym,chain:pp.chain,
  openTs:Date.now(),status:'open',
  entryMc:pp.mc||pp.fdv||0,entryPx:pp.priceUsd||0,
  target:r.target||0,tf:r.tf||'',type:r.type||typeGuess(pp),meme:r.meme||0,
  catalyst:cat,entryReason:r.entry||'',
  lastMc:pp.mc||pp.fdv||0
 });
 saveJrnl();state.tab='journal';syncTabs();saveCfg();renderJournal();
}
function closePosition(id){
 var j=state.journal.filter(function(x){return x.id===id;})[0];if(!j)return;
 var c=state.tokenCache.get(j.addr);var curMc=(c&&c.pair&&(c.pair.mc||c.pair.fdv))||j.lastMc||j.entryMc;
 var exitMc=prompt('Exit mcap? (current ~'+fUsd(curMc)+')',Math.round(curMc));
 if(exitMc==null)return;
 exitMc=parseFloat(String(exitMc).replace(/[^0-9.]/g,''))||curMc;
 var reason=prompt('Why are you exiting? (target hit / catalyst passed / thesis broke / stop / FOMO panic)','');
 var lesson=prompt('One lesson: was the narrative actually weak? entry too late? held too long?','');
 j.status='closed';j.exitMc=exitMc;j.exitReason=reason||'';j.lesson=lesson||'';j.closeTs=Date.now();
 j.retPct=j.entryMc?((exitMc/j.entryMc-1)*100):0;
 saveJrnl();renderJournal();
}
function markJournal(){
 var open=state.journal.filter(function(j){return j.status==='open';});
 if(!open.length)return Promise.resolve();
 return dexTokens(open.map(function(j){return j.addr;})).then(function(){
  open.forEach(function(j){var c=state.tokenCache.get(j.addr);if(c&&c.pair)j.lastMc=c.pair.mc||c.pair.fdv||j.lastMc;});
  saveJrnl();
 });
}
function renderJournal(){
 var open=state.journal.filter(function(j){return j.status==='open';});
 var closed=state.journal.filter(function(j){return j.status==='closed';});
 q1('jopen').innerHTML=open.length?open.slice().reverse().map(function(j){
  var ret=j.entryMc?((j.lastMc/j.entryMc-1)*100):0;
  return '<div class="pos-row"><div class="ph"><span class="s">$'+esc(j.sym)+'</span><span style="font-size:12px;color:var(--ink-faint)">'+esc(j.chain)+' &middot; opened '+fAgo(j.openTs)+' ago &middot; '+esc(j.tf||'no tf')+'</span>'
   +'<span class="ret '+(ret>=0?'pos':'neg')+'">'+fPct(ret)+'</span></div>'
   +'<div class="pd">entry <b>'+fUsd(j.entryMc)+'</b> &rarr; now <b>'+fUsd(j.lastMc)+'</b>'+(j.target?' &middot; target <b>'+fUsd(j.target)+'</b>':'')+(j.catalyst?' &middot; catalyst: '+esc(j.catalyst):'')+'</div>'
   +(j.entryReason?'<div class="pd">why in: '+esc(j.entryReason)+'</div>':'')
   +'<div style="margin-top:7px;display:flex;gap:8px"><button class="btn sm" data-jact="research" data-addr="'+esc(j.addr)+'" data-chain="'+esc(j.chain)+'">open research</button><button class="btn sm" data-jact="close" data-id="'+esc(j.id)+'">close position</button></div></div>';
 }).join(''):'<div class="empty">No open positions. Research a coin and add it here.</div>';

 q1('jclosed').innerHTML=closed.length?closed.slice().reverse().map(function(j){
  return '<div class="pos-row closed"><div class="ph"><span class="s">$'+esc(j.sym)+'</span><span style="font-size:12px;color:var(--ink-faint)">held '+fAge((j.closeTs||0)-(j.openTs||0))+' &middot; '+esc(j.type||'')+'</span>'
   +'<span class="ret '+((j.retPct||0)>=0?'pos':'neg')+'">'+fPct(j.retPct||0)+'</span></div>'
   +'<div class="pd">'+fUsd(j.entryMc)+' &rarr; '+fUsd(j.exitMc)+(j.exitReason?' &middot; out: '+esc(j.exitReason):'')+'</div>'
   +(j.lesson?'<div class="pd"><b>lesson:</b> '+esc(j.lesson)+'</div>':'')+'</div>';
 }).join(''):'<div class="empty">nothing closed yet</div>';

 var el=q1('jstats');
 if(!closed.length){el.innerHTML='';q1('jscope').textContent=open.length+' open';return;}
 var wins=closed.filter(function(j){return (j.retPct||0)>0;});
 var avg=closed.reduce(function(s,j){return s+(j.retPct||0);},0)/closed.length;
 var withCat=closed.filter(function(j){return j.catalyst;}),noCat=closed.filter(function(j){return !j.catalyst;});
 var ac=withCat.length?withCat.reduce(function(s,j){return s+(j.retPct||0);},0)/withCat.length:null;
 var an=noCat.length?noCat.reduce(function(s,j){return s+(j.retPct||0);},0)/noCat.length:null;
 var byType={};closed.forEach(function(j){var t=j.type||'meme';(byType[t]=byType[t]||[]).push(j.retPct||0);});
 var typeStr=Object.keys(byType).map(function(t){var arr=byType[t];return t+' '+fPct(arr.reduce(function(a,b){return a+b;},0)/arr.length);}).join(' &middot; ');
 function m(k,v,cls){return '<div class="m"><div class="k">'+k+'</div><div class="v '+(cls||'')+'">'+v+'</div></div>';}
 el.innerHTML=m('closed',closed.length)
  +m('hit rate',Math.round(100*wins.length/closed.length)+'%',wins.length*2>=closed.length?'pos':'neg')
  +m('avg / trade',fPct(avg),avg>=0?'pos':'neg')
  +m('with catalyst',ac==null?'-':fPct(ac),ac>=0?'pos':'neg')
  +m('no catalyst',an==null?'-':fPct(an),an>=0?'pos':'neg');
 q1('jscope').innerHTML=open.length+' open &middot; by type: '+typeStr;
}
function journalClick(ev){
 var b=ev.target.closest('[data-jact]');if(!b)return;
 var a=b.getAttribute('data-jact');
 if(a==='close')closePosition(b.getAttribute('data-id'));
 else if(a==='research')openResearch(b.getAttribute('data-addr'),b.getAttribute('data-chain'));
}

/* ---------- tabs / shell ---------- */
function syncTabs(){
 ['scan','research','journal'].forEach(function(t){q1('tab-'+t).hidden=state.tab!==t;});
 document.querySelectorAll('.tabs button').forEach(function(b){b.setAttribute('aria-selected',b.getAttribute('data-tab')===state.tab?'true':'false');});
 if(state.tab==='journal')renderJournal();
}
function setStatus(){
 var d=q1('dot'),s=q1('statusText');var age=state.lastOk?Date.now()-state.lastOk:Infinity;
 if(state.lastErr&&!state.lastOk){d.className='dot err';s.textContent='data source error';}
 else if(age<45000){d.className='dot live';s.textContent='live data &middot; '+fAgo(state.lastOk)+' ago';}
 else if(isFinite(age)){d.className='dot stale';s.textContent='refreshing&hellip;';}
 else {d.className='dot';s.textContent='warming up&hellip;';}
}

/* events */
document.querySelectorAll('.tabs button').forEach(function(b){b.addEventListener('click',function(){state.tab=b.getAttribute('data-tab');saveCfg();syncTabs();if(state.tab==='scan')scan();});});
document.querySelectorAll('.chip-toggle[data-chain]').forEach(function(b){b.addEventListener('click',function(){var c=b.getAttribute('data-chain');state.chains[c]=!state.chains[c];b.setAttribute('aria-pressed',state.chains[c]?'true':'false');saveCfg();state.searchCache.clear();scan();});});
q1('apiKey').addEventListener('change',function(e){state.apiKey=e.target.value.trim();saveCfg();});
q1('scanFilters').addEventListener('click',function(ev){var b=ev.target.closest('[data-sf]');if(!b)return;state._scanFilter=b.getAttribute('data-sf');renderScan();});
q1('attnList').addEventListener('click',function(ev){var r=ev.target.closest('[data-addr]');if(!r)return;openResearch(r.getAttribute('data-addr'),r.getAttribute('data-chain'));});
q1('rcardHost').addEventListener('click',rcardClick);
q1('rcardHost').addEventListener('input',rcardInput);
q1('rcardHost').addEventListener('change',rcardInput);
q1('tab-journal').addEventListener('click',journalClick);
q1('qgo').addEventListener('click',function(){doQuery(q1('q').value,'rcardHost',true);});
q1('q').addEventListener('keydown',function(e){if(e.key==='Enter')doQuery(q1('q').value,'rcardHost',true);});
q1('scanGo').addEventListener('click',function(){doQuery(q1('scanQ').value,'scanQResult',false);});
q1('scanQ').addEventListener('keydown',function(e){if(e.key==='Enter')doQuery(q1('scanQ').value,'scanQResult',false);});
q1('scanQResult').addEventListener('click',function(ev){var r=ev.target.closest('[data-addr]');if(!r)return;openResearch(r.getAttribute('data-addr'),r.getAttribute('data-chain'));});
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
q1('apiKey').value=state.apiKey;
document.querySelectorAll('.chip-toggle[data-chain]').forEach(function(b){var c=b.getAttribute('data-chain');b.setAttribute('aria-pressed',state.chains[c]?'true':'false');});
syncTabs();
scan().then(setStatus);
setInterval(function(){if(state.tab==='scan')scan().then(setStatus);setStatus();},90000);
setInterval(function(){markJournal().then(function(){if(state.tab==='journal')renderJournal();});},60000);
setInterval(setStatus,15000);
markJournal();
})();
