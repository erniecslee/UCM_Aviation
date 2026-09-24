'use strict';
/* MCP and EFIS control panels (SVG, 737NG layout) and their knob/switch handling. */
/* ---------- panel drawing helpers (shared by MCP and EFIS) ---------- */
const NS='http://www.w3.org/2000/svg', svgM=$q('#mcpsvg'), svgE=$q('#efissvg'); let CUR=svgM;
function E(tag,a,parent,text){ const e=document.createElementNS(NS,tag); for(const k in a) e.setAttribute(k,a[k]); if(text!=null) e.textContent=text; (parent||CUR).appendChild(e); return e; }
const lab=(x,y,t,sz,anchor,p,col)=>E('text',{x,y,'text-anchor':anchor||'middle','dominant-baseline':'middle',fill:col||'#f4f4f4','font-family':FS,'font-size':sz||20,'letter-spacing':1},p,t);
const SEGS={'0':'abcdef','1':'bc','2':'abdeg','3':'abcdg','4':'bcfg','5':'acdfg','6':'acdefg','7':'abc','8':'abcdefg','9':'abcdfg','-':'g','+':'gp','A':'abcefg',' ':''};
const WINS={};
function mkWin(id,x,y,w,h,n){
  E('rect',{x,y,width:w,height:h,fill:'#000',stroke:'#1a1a1a','stroke-width':2});
  const cw=(w-18)/n, ch=h-14, dw=cw*0.58, t=Math.max(3.5,ch/8.5), cells=[];
  for(let i=0;i<n;i++){
    const g=E('g',{transform:`translate(${x+10+i*cw+(cw-dw)/2},${y+7}) skewX(-7)`}), c={};
    const r=(k,rx,ry,rw,rh)=>c[k]=E('rect',{x:rx,y:ry,width:rw,height:rh,fill:'#1c1c1c'},g);
    r('a',t*.6,0,dw-t*1.2,t); r('g',t*.6,ch/2-t/2,dw-t*1.2,t); r('d',t*.6,ch-t,dw-t*1.2,t);
    r('f',0,t*.6,t,ch/2-t*1.1); r('b',dw-t,t*.6,t,ch/2-t*1.1); r('e',0,ch/2+t*.5,t,ch/2-t*1.1); r('c',dw-t,ch/2+t*.5,t,ch/2-t*1.1);
    r('p',dw/2-t/2,ch*.24,t,ch*.52); c.dp=E('rect',{x:dw+2,y:ch-t,width:t,height:t,fill:'#1c1c1c'},g); cells.push(c);
  }
  WINS[id]={cells,n,last:null};
}
function setWin(id,text){
  const W=WINS[id]; if(W.last===text) return; W.last=text;
  const chars=[], dps=[]; for(const ch of text){ if(ch==='.'){ if(!chars.length) chars.push(' '); dps[chars.length-1]=true; } else chars.push(ch); }
  const pad=W.n-chars.length; if(pad>0){ for(let i=0;i<pad;i++) chars.unshift(' '); dps.unshift(...Array(pad).fill(false)); }
  W.cells.forEach((c,i)=>{ const on=SEGS[chars[i]]||''; for(const k of 'abcdefg') c[k].setAttribute('fill',on.includes(k)?'#f2f2f2':'#1c1c1c');
    c.p.setAttribute('fill',on.includes('p')?'#f2f2f2':'#1c1c1c'); c.dp.setAttribute('fill',dps[i]?'#f2f2f2':'#1c1c1c'); });
}
const LAMPS={};
function sqBtn(x,y,w,h,label,act,ph){
  const g=E('g',{class:'hit'}); E('rect',{x,y,width:w,height:h,rx:5,fill:'#0c0c0c',stroke:ph?'#7a7a7a':'#2c2c2c','stroke-width':2,'stroke-dasharray':ph?'5 4':null},g);
  lab(x+w/2,y+h*0.40,label,label.length>6?14:16,'middle',g).setAttribute('fill',ph?'#a5a5a5':'#f4f4f4');
  LAMPS[act]=LAMPS[act]||[]; LAMPS[act].push(E('rect',{x:x+11,y:y+h-21,width:w-22,height:10,rx:2,fill:'#8b8b8b'},g));
  g.addEventListener('click',()=>press(act)); return g; }
function roundBtn(cx,cy,act,r,ph){ const g=E('g',{class:'hit'}); E('circle',{cx,cy,r:r||36,fill:'none',stroke:'#f4f4f4','stroke-width':3,'stroke-dasharray':ph?'6 5':null},g); const c=E('circle',{cx,cy,r:13,fill:'#111',stroke:'#444','stroke-width':2},g); E('circle',{cx,cy,r:(r||36)+6,fill:'transparent'},g); LAMPS[act]=[c]; g.addEventListener('click',()=>press(act)); return g; }
const KNOBS={};
function knobShape(cx,cy,r,k,opt){
  opt=opt||{}; const g=E('g',{}); E('circle',{cx,cy,r:r+2,fill:'#101010'},g);
  const rot=E('g',{},g);
  E('circle',{cx,cy,r,fill:opt.fill||'#cfcfcf',stroke:'#2e2e2e','stroke-width':3},rot); E('circle',{cx,cy,r:r-1,fill:'none',stroke:'#7a7a7a','stroke-width':6,'stroke-dasharray':'2.4 3.6'},rot);
  E('circle',{cx,cy,r:r*0.62,fill:'#b8b8b8',stroke:'#555','stroke-width':1.5},rot);
  E('line',{x1:cx,y1:cy,x2:cx,y2:cy-r+3,stroke:'#111','stroke-width':opt.pw||5,'stroke-linecap':'round'},rot);
  const hit=E('circle',{cx,cy,r:r+(opt.pad==null?8:opt.pad),fill:'transparent',class:'knobhit'},g); hit.dataset.k=k;
  return KNOBS[k]={g,rot,cx,cy,hit,ang:0};
}
function spinKnob(k,deg){ const K=KNOBS[k]; K.ang+=deg; K.rot.setAttribute('transform',`rotate(${K.ang} ${K.cx} ${K.cy})`); }
function arcs(cx,cy,r,a0,a1){ const p=a=>[cx+r*Math.sin(a*D2R),cy-r*Math.cos(a*D2R)]; const [x0,y0]=p(a0),[x1,y1]=p(a1); return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`; }

/* ---------- MCP layout (737NG) ---------- */
E('rect',{x:28,y:28,width:1744,height:326,fill:'#6c6c6c',stroke:'#3a3a3a','stroke-width':5});
/* left course */
lab(156,81,'COURSE'); mkWin('crsL',88,100,137,44,3);
knobShape(137,213,32,'crsL'); E('path',{d:arcs(137,213,52,-155,-25),fill:'none',stroke:'#f4f4f4','stroke-width':3}); E('path',{d:arcs(137,213,52,25,155),fill:'none',stroke:'#f4f4f4','stroke-width':3});
E('circle',{cx:221,cy:201,r:16,fill:'#0a0a0a'}); const maL=lab(221,201,'MA',13,'middle',null,'#555');
/* F/D toggles */
const FDL=[];
function fdToggle(cx,which){ lab(cx+2,246,'F/D',18); lab(cx+2,266,'ON',16); lab(cx,338,'OFF',16);
  const g=E('g',{class:'hit'}); E('rect',{x:cx-38,y:285,width:64,height:40,fill:'#dcdcdc',stroke:'#222','stroke-width':2},g); E('rect',{x:cx-38,y:290,width:14,height:30,fill:'#222'},g);
  const lv=E('rect',{x:cx-12,y:290,width:16,height:30,rx:5,fill:'#8b8b8b',stroke:'#222','stroke-width':2},g); E('rect',{x:cx-60,y:270,width:100,height:78,fill:'transparent'},g);
  g.addEventListener('click',()=>press(which)); FDL.push(lv); }
fdToggle(220,'fdL');
/* A/T ARM */
lab(312,80,'A/T',24); lab(312,103,'ARM',17); const atLamp=E('rect',{x:292,y:113,width:40,height:12,rx:5,fill:'#222'});
const atSw=(function(){ const g=E('g',{class:'hit'}); E('circle',{cx:312,cy:163,r:36,fill:'none',stroke:'#f4f4f4','stroke-width':3},g); E('circle',{cx:312,cy:163,r:22,fill:'#2b2b2b'},g);
  const lv=E('line',{x1:312,y1:163,x2:312,y2:132,stroke:'#dcdcdc','stroke-width':11,'stroke-linecap':'round'},g); E('circle',{cx:312,cy:163,r:44,fill:'transparent'},g);
  g.addEventListener('click',()=>press('atarm')); return lv; })();
lab(312,215,'OFF',17);
/* IAS/MACH */
lab(492,81,'IAS/MACH'); mkWin('spd',413,100,156,44,5);
lab(418,158,'C/O',17); roundBtn(418,207,'co');
roundBtn(596,207,'spdintv',36,0); lab(657,232,'SPD',17); lab(657,252,'INTV',17);
E('polyline',{points:'448,186 484,152 508,152',fill:'none',stroke:'#f4f4f4','stroke-width':3}); E('line',{x1:508,y1:152,x2:508,y2:197,stroke:'#f4f4f4','stroke-width':3});
E('line',{x1:548,y1:268,x2:588,y2:288,stroke:'#f4f4f4','stroke-width':3}); E('line',{x1:468,y1:268,x2:426,y2:292,stroke:'#f4f4f4','stroke-width':3});
knobShape(508,241,44,'spd');
sqBtn(275,266,68,68,'N1','n1'); sqBtn(351,266,68,68,'SPEED','spd'); sqBtn(596,266,68,68,'LVL CHG','lvl'); sqBtn(596,82,62,66,'V NAV','vnav');
/* HEADING (inner knob = heading select, outer ring = bank angle) */
lab(756,81,'HEADING'); mkWin('hdg',687,100,138,44,3);
lab(689,174,'10',17); lab(822,174,'30',17);
[-58,-29,0,29,58].forEach(a=>{ const r=a*D2R; E('line',{x1:755+50*Math.sin(r),y1:210-50*Math.cos(r),x2:755+64*Math.sin(r),y2:210-64*Math.cos(r),stroke:'#f4f4f4','stroke-width':3}); });
const bankRing=(function(){ const g=E('g',{class:'hit'}); E('circle',{cx:755,cy:210,r:43,fill:'#8e8e8e',stroke:'#1e1e1e','stroke-width':3},g); E('circle',{cx:755,cy:210,r:41,fill:'none',stroke:'#5a5a5a','stroke-width':5,'stroke-dasharray':'2.4 3.6'},g);
  const p=E('line',{x1:755,y1:210,x2:755,y2:171,stroke:'#f4f4f4','stroke-width':6,'stroke-linecap':'round'},g);
  g.addEventListener('click',()=>press('bank')); g.addEventListener('wheel',e=>{ e.preventDefault(); press(e.deltaY<0?'bankUp':'bankDn'); },{passive:false}); return p; })();
knobShape(755,210,26,'hdg',{fill:'#d8d8d8',pad:2});
sqBtn(843,82,68,66,'L NAV','lnav'); sqBtn(843,175,68,66,'VOR LOC','vorloc',1); sqBtn(723,266,68,68,'HDG SEL','hdgsel'); sqBtn(843,266,68,68,'APP','app');
/* ALTITUDE */
lab(1018,81,'ALTITUDE'); mkWin('alt',940,100,155,44,5);
knobShape(1015,211,40,'alt'); E('path',{d:arcs(1015,211,58,-150,-30),fill:'none',stroke:'#f4f4f4','stroke-width':3});
roundBtn(1111,207,'altintv',36,0); lab(1168,232,'ALT',17); lab(1168,252,'INTV',17);
sqBtn(982,266,68,68,'ALT HLD','alth'); sqBtn(1078,266,68,68,'V/S','vs');
/* VERT SPEED */
lab(1200,81,'VERT SPEED'); mkWin('vs',1122,100,156,44,5);
E('line',{x1:1148,y1:300,x2:1203,y2:300,stroke:'#f4f4f4','stroke-width':3});
const vsRidges=[];
(function(){ const g=E('g',{}); E('rect',{x:1208,y:171,width:42,height:184,rx:6,fill:'#d8d8d8',stroke:'#2a2a2a','stroke-width':3},g);
  const cp=E('clipPath',{id:'wclip'},g); E('rect',{x:1210,y:173,width:38,height:180},cp);
  const rid=E('g',{'clip-path':'url(#wclip)'},g); for(let i=0;i<20;i++) vsRidges.push(E('rect',{x:1210,y:173+i*11,width:38,height:6,fill:'#8c8c8c'},rid));
  const hit=E('rect',{x:1200,y:165,width:58,height:196,fill:'transparent',class:'knobhit'},g); hit.dataset.k='vs'; hit.dataset.wheel='1'; })();
E('line',{x1:1270,y1:192,x2:1270,y2:308,stroke:'#f4f4f4','stroke-width':3}); E('polygon',{points:'1270,190 1262,206 1278,206',fill:'#f4f4f4'}); E('polygon',{points:'1270,310 1262,294 1278,294',fill:'#f4f4f4'});
lab(1272,177,'DN',17); lab(1272,326,'UP',17);
/* A/P ENGAGE */
lab(1428,81,'A/P ENGAGE'); E('polyline',{points:'1332,90 1362,76 1372,76',fill:'none',stroke:'#f4f4f4','stroke-width':3}); E('polyline',{points:'1524,90 1494,76 1484,76',fill:'none',stroke:'#f4f4f4','stroke-width':3});
lab(1376,101,'A',17); lab(1478,101,'B',17);
sqBtn(1341,108,72,70,'CMD','cmdA'); sqBtn(1445,108,72,70,'CMD','cmdB'); sqBtn(1341,192,72,70,'CWS','cwsA'); sqBtn(1445,192,72,70,'CWS','cwsB');
lab(1428,280,'DISENGAGE',18);
const discBar=(function(){ const g=E('g',{class:'hit'}); const d=E('defs',{},g); const pt=E('pattern',{id:'hazard',width:16,height:16,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'},d); E('rect',{width:16,height:16,fill:'#f2c200'},pt); E('rect',{width:8,height:16,fill:'#161616'},pt);
  const r=E('rect',{x:1338,y:297,width:180,height:60,rx:5,fill:'#dcdcdc',stroke:'#222','stroke-width':3},g); const y=E('rect',{x:1346,y:305,width:164,height:14,fill:'url(#hazard)',opacity:0},g); E('rect',{x:1346,y:305,width:164,height:50,rx:4,fill:'none',stroke:'#8a8a8a','stroke-width':3},g);
  g.addEventListener('click',()=>press('discBar')); return {r,y}; })();
/* right course */
lab(1640,81,'COURSE'); mkWin('crsR',1571,100,138,44,3);
knobShape(1640,213,32,'crsR'); E('path',{d:arcs(1640,213,52,-155,-25),fill:'none',stroke:'#f4f4f4','stroke-width':3}); E('path',{d:arcs(1640,213,52,25,155),fill:'none',stroke:'#f4f4f4','stroke-width':3});
E('circle',{cx:1576,cy:201,r:16,fill:'#0a0a0a'}); const maR=lab(1576,201,'MA',13,'middle',null,'#555'); fdToggle(1576,'fdR');

/* ---------- EFIS control panel (FCOM 10.15) ---------- */
CUR=svgE;
E('rect',{x:2,y:2,width:396,height:286,rx:6,fill:'#6c6c6c',stroke:'#3a3a3a','stroke-width':4});
lab(64,30,'RADIO',12); lab(100,16,'MINS',12); lab(136,30,'BARO',12);
const minsRing=(function(){ const g=E('g',{class:'hit'}); E('circle',{cx:100,cy:66,r:31,fill:'#8e8e8e',stroke:'#1e1e1e','stroke-width':2},g); const p=E('line',{x1:100,y1:66,x2:100,y2:39,stroke:'#f4f4f4','stroke-width':5,'stroke-linecap':'round'},g);
  g.addEventListener('click',()=>press('minsRef')); return p; })();
knobShape(100,66,21,'mins',{pw:3,pad:0}); (function(){ const g=E('g',{class:'hit'}); E('circle',{cx:100,cy:66,r:11,fill:'#0a0a0a'},g); lab(100,66,'RST',7,'middle',g); g.addEventListener('click',()=>press('minsRst')); })();
function rocker(cx,cy,label,act){ lab(cx,cy-30,label,13); const g=E('g',{class:'hit'}); E('rect',{x:cx-16,y:cy-15,width:32,height:30,rx:4,fill:'#141414',stroke:'#000'},g); const k=E('rect',{x:cx-9,y:cy-11,width:18,height:12,rx:3,fill:'#6a6a6a'},g); g.addEventListener('click',()=>press(act)); return k; }
const fpvK=rocker(180,66,'FPV','fpv'), mtrsK=rocker(222,66,'MTRS','mtrs');
lab(268,30,'IN',12); lab(304,16,'BARO',12); lab(340,30,'HPA',12);
const baroRing=(function(){ const g=E('g',{class:'hit'}); E('circle',{cx:304,cy:66,r:31,fill:'#8e8e8e',stroke:'#1e1e1e','stroke-width':2},g); const p=E('line',{x1:304,y1:66,x2:304,y2:39,stroke:'#f4f4f4','stroke-width':5,'stroke-linecap':'round'},g);
  g.addEventListener('click',()=>press('baroUnit')); return p; })();
knobShape(304,66,21,'baro',{pw:3,pad:0}); (function(){ const g=E('g',{class:'hit'}); E('circle',{cx:304,cy:66,r:11,fill:'#0a0a0a'},g); lab(304,66,'STD',7,'middle',g); g.addEventListener('click',()=>press('std')); })();
/* VOR/ADF switches */
const vorSw=[];
function vorSwitch(cx,n){ lab(cx-4,138,'VOR '+n,11); lab(cx-4,206,'ADF '+n,11); lab(cx+30,170,'OFF',11);
  const g=E('g',{class:'hit'}); E('rect',{x:cx-14,y:148,width:20,height:48,rx:9,fill:'#dcdcdc',stroke:'#222','stroke-width':2},g); const k=E('rect',{x:cx-11,y:152,width:14,height:14,rx:4,fill:'#5a5a5a'},g);
  g.addEventListener('click',()=>press('vor'+n)); vorSw.push(k); }
vorSwitch(40,1); vorSwitch(362,2);
/* mode selector */
lab(88,128,'APP',12); lab(118,116,'VOR',12); lab(148,116,'MAP',12); lab(178,128,'PLN',12);
const modeK=knobShape(133,166,25,'mode',{pw:5,pad:14}); modeK.hit.classList.replace('knobhit','hit'); modeK.hit.addEventListener('click',e=>{ const r=modeK.hit.getBoundingClientRect(); press(e.clientX>r.left+r.width/2?'modeUp':'modeDn'); }); modeK.hit.addEventListener('wheel',e=>{ e.preventDefault(); press(e.deltaY<0?'modeUp':'modeDn'); },{passive:false});
(function(){ const g=E('g',{class:'hit'}); E('circle',{cx:133,cy:166,r:11,fill:'#0a0a0a'},g); lab(133,166,'CTR',7,'middle',g); g.addEventListener('click',()=>press('ctr')); })();
/* range selector */
const rngPos=i=>-128+i*(256/7);
RANGES.forEach((v,i)=>{ const a=rngPos(i)*D2R; lab(266+52*Math.sin(a),168-52*Math.cos(a)+(i===0?6:0),String(v),12); });
const rangeK=knobShape(266,168,25,'range',{pw:5,pad:14}); rangeK.hit.classList.replace('knobhit','hit'); rangeK.hit.addEventListener('click',e=>{ const r=rangeK.hit.getBoundingClientRect(); press(e.clientX>r.left+r.width/2?'rngUp':'rngDn'); }); rangeK.hit.addEventListener('wheel',e=>{ e.preventDefault(); press(e.deltaY<0?'rngUp':'rngDn'); },{passive:false});
(function(){ const g=E('g',{class:'hit'}); E('circle',{cx:266,cy:168,r:11,fill:'#0a0a0a'},g); lab(266,168,'TFC',7,'middle',g); g.addEventListener('click',()=>press('sw_tfc')); })();
/* MAP switches */
const EFB={};
['wxr','sta','wpt','arpt','data','pos','terr'].forEach((k,i)=>{ const x=14+i*54, g=E('g',{class:'hit'}); E('rect',{x,y:238,width:48,height:34,rx:3,fill:'#0c0c0c',stroke:'#000','stroke-width':2},g); lab(x+24,251,k.toUpperCase(),11,'middle',g); EFB[k]=E('rect',{x:x+8,y:262,width:32,height:5,rx:1,fill:'#333'},g); g.addEventListener('click',()=>press('sw_'+k)); });
CUR=svgM;

navPanel(0); CUR=svgM;
$$q('.knobhit').forEach(h=>{ const k=h.dataset.k; if(!(k in KN)&&!['vs','mins','baro','n1m','n1k','n2m','n2k'].includes(k)) return; let a0=null,y0=null,acc=0;
  const cxy=()=>{ const r=h.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2]; };
  h.addEventListener('wheel',e=>{ e.preventDefault(); bump(k,e.deltaY<0?1:-1,e.shiftKey); },{passive:false});
  h.addEventListener('pointerdown',e=>{ h.setPointerCapture(e.pointerId); const [cx,cy]=cxy(); a0=Math.atan2(e.clientY-cy,e.clientX-cx)/D2R; y0=e.clientY; acc=0; });
  h.addEventListener('pointermove',e=>{ if(a0==null) return;
    if(h.dataset.wheel){ acc+=y0-e.clientY; y0=e.clientY; const n=Math.trunc(acc/7); if(n){ acc-=n*7; bump(k,Math.sign(n),e.shiftKey); } return; }
    const [cx,cy]=cxy(); const a=Math.atan2(e.clientY-cy,e.clientX-cx)/D2R; acc+=wrap180(a-a0); a0=a; const n=Math.trunc(acc/16); if(n){ acc-=n*16; bump(k,Math.sign(n),e.shiftKey); } });
  h.addEventListener('pointerup',()=>{a0=null;}); });
function fmtVS(v){ return (v>=0?'+':'-')+String(Math.abs(v)).padStart(4,'0'); }
function syncMCP(){
  const m=S.mcp, md=S.modes, LIT='#43ff8f', OFFC='#8b8b8b', fdOn=m.fdL||m.fdR;
  { const base=(S.vnavOn&&!(S.vn&&S.vn.intv))?'':(m.machMode?'.'+String(Math.round(m.mach*100)).padStart(2,'0')+'0':String(m.spd));
    const sym=S.spdSym==='over'?'8':(S.spdSym==='under'?'A':''), fl=Math.floor(performance.now()/400)%2===0;   /* flashing limit symbol in the IAS/MACH window */
    setWin('spd',sym&&fl?(base===''?sym:sym+base.padStart(base.startsWith('.')?4:3)):base); }
  setWin('nav1a',fmtFreq(NAVR[0].act)); setWin('nav1s',fmtFreq(NAVR[0].stby));
  setWin('hdg',fmtH(m.hdg)); setWin('alt',String(m.alt)); setWin('vs',md.pitch==='V/S'?fmtVS(m.vs):''); setWin('crsL',fmtH(m.crsL)); setWin('crsR',fmtH(m.crsR));
  const on={app:S.app.armed||(S.app.locCap&&!S.app.gsCap),vnav:isVnav(),n1:md.at==='N1',spd:md.at==='MCP SPD',lvl:md.pitch==='MCP SPD',vs:md.pitch==='V/S',alth:md.pitch==='ALT HOLD'&&Math.abs(m.alt-baroOff()-S.holdAlt)>20,
    hdgsel:md.roll==='HDG SEL',lnav:md.roll==='LNAV',cmdA:m.ap&&m.apCmd&&(m.which==='A'||m.ap2)||(S.ap2Armed&&m.which==='B'),cmdB:m.ap&&m.apCmd&&(m.which==='B'||m.ap2)||(S.ap2Armed&&m.which==='A'),cwsA:m.ap&&!m.apCmd&&m.which==='A',cwsB:m.ap&&!m.apCmd&&m.which==='B'};
  for(const k in on) LAMPS[k].forEach(l=>l.setAttribute('fill',on[k]?LIT:OFFC));
  atSw.setAttribute('y2',S.atArm?132:194); atLamp.setAttribute('fill',S.atArm?LIT:'#222'); atSw.setAttribute('stroke',S.atArm?'#f4f4f4':'#b5b5b5');
  LAMPS.co[0].setAttribute('fill',m.machMode?'#2a5a3a':'#111');
  FDL[0].setAttribute('y',m.fdL?290:302); FDL[1].setAttribute('y',m.fdR?290:302);
  maL.setAttribute('fill',fdOn&&S.master==='A'&&m.fdL?'#fff':'#555'); maR.setAttribute('fill',fdOn&&S.master==='B'&&m.fdR?'#fff':'#555');
  const flash=Math.floor(S.t*2+performance.now()/500)%2===0;
  discBar.r.setAttribute('fill',(S.apLight&&flash)?'#ff4a44':'#dcdcdc'); discBar.y.setAttribute('opacity',m.discBar?1:0);
  bankRing.setAttribute('transform',`rotate(${(m.bank-20)/5*29} 755 210)`);
  vsRidges.forEach((r,i)=>r.setAttribute('y',173+((i*11+(S.wheel||0)*4)%220+220)%220-20));
  /* EFIS */
  minsRing.setAttribute('transform',`rotate(${EF.minsRef==='RADIO'?-36:36} 100 66)`); baroRing.setAttribute('transform',`rotate(${EF.hpa?36:-36} 304 66)`);
  fpvK.setAttribute('y',EF.fpv?60:70); mtrsK.setAttribute('y',EF.mtrs?60:70);
  vorSw[0].setAttribute('y',[152,166,180][EF.vor1]); vorSw[1].setAttribute('y',[152,166,180][EF.vor2]);
  modeK.rot.setAttribute('transform',`rotate(${[-50,-17,17,50][EF.mode]} 133 166)`); rangeK.rot.setAttribute('transform',`rotate(${rngPos(RANGES.indexOf(EF.range))} 266 168)`);
  for(const k in EFB) EFB[k].setAttribute('fill',EF.sw[k]?LIT:'#333');
  $q('#aplt').classList.toggle('on',S.apLight&&flash); $q('#atlt').classList.toggle('on',S.atLight&&flash);
  $q('#ndhint').textContent=['MAP · expanded + VSD','MAP · center + VSD','MAP · center'][EF.ctr]+' · range '+EF.range+' NM';
}

/* ---------- VHF NAV tuning panels (FCOM 10.x "VHF Navigation Control", aft electronic panel) ---------- */
function navPanel(idx){
  const n=idx+1; CUR=$q('#nav'+n+'svg');
  E('rect',{x:2,y:2,width:396,height:196,rx:6,fill:'#6c6c6c',stroke:'#3a3a3a','stroke-width':4});
  lab(105,24,'ACTIVE',20); lab(297,24,'STANDBY',20); lab(207,42,'TFR',13);
  mkWin('nav'+n+'a',30,38,150,52,5); mkWin('nav'+n+'s',222,38,150,52,5);
  (function(){ const g=E('g',{class:'hit'}); E('rect',{x:186,y:54,width:42,height:34,rx:6,fill:'#0c0c0c',stroke:'#2c2c2c','stroke-width':2},g);
    E('polygon',{points:'194,71 204,63 204,68 210,68 210,63 220,71 210,79 210,74 204,74 204,79',fill:'#f4f4f4'},g); g.addEventListener('click',()=>tuneSwap(idx)); })();
  ['N','A','V'].forEach((c,i)=>lab(24,108+i*22,c,17));
  lab(60,108,'NAV '+n,15,'start');
  (function(){ const g=E('g',{class:'hit'}); E('circle',{cx:120,cy:150,r:24,fill:'#050505',stroke:'#3d3d3d','stroke-width':3},g); lab(120,116,'TEST',14,'middle');
    g.addEventListener('click',()=>msg('NAV TEST is not simulated.')); })();
  knobShape(318,132,50,'n'+n+'m',{pw:0,pad:0}); knobShape(318,132,30,'n'+n+'k',{fill:'#dedede',pw:4,pad:0});
  lab(318,190,'MHz  ·  50 kHz',11);
}
