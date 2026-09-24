'use strict';
/* Boot, FMC situation loading, CDU drawer, simulation loop. */

/* ---- FMC situation → simulation state ---- */
function initFromFMC(phase){
  const a=e.aircraft, r=e.active; newState();
  S.lat=a.lat; S.lon=a.lon; S.alt=a.altitude||0;
  const gs=a.speed>0?a.speed:250; S.ias=clamp(iasOf(gs,S.alt),100,340);
  const l=r.legs[r.index]; S.hdg=isPos(l)?bearing(S,l):90; S.hdgU=S.hdg;
  S.magvar=magVarAt(S,S.alt); S.mvT=0; S.holdAlt=S.alt; S.hdgHold=S.hdg; S.weightKg=fmcWeightKg()||62000; S.fuelKg=fmcFuelKg()||9000;
  const m=S.mcp;
  m.hdg=Math.round(toMag(S.hdg,S.magvar))%360;
  if(phase==='cruise'){ m.alt=Math.round(S.alt/100)*100; }
  else if(phase==='arrival'){ m.alt=3000; }
  else { const cz=altitude(e.perf.crzAlt||''); m.alt=Number.isFinite(cz)?Math.min(cz,10000):10000; }
  m.spd=clamp(Math.round(S.ias/5)*5,100,340);
  if(S.alt>=26000){ m.mach=clamp(+machOf(S.ias,S.alt).toFixed(2),0.6,0.82); m.machMode=true; }
  { const fl=phase==='takeoff'?(+e.perf.flaps||5):0; S.cfg=cfgNew(CFG.flapDetents.includes(fl)?fl:5,false); }
  S.modes.pitch='ALT HOLD'; S.modes.at='MCP SPD'; S.flapRetracted=(phase!=='takeoff');
  S.n1=req(S.ias,S.alt); S.n1cmd=S.n1; S.lever=(S.n1-30)/65;
  S.modes.roll='HDG SEL'; logInitialModes();
  if(lnavCheck()===null){ S.modes.roll='LNAV'; logInitialModes(); }
  S.epoch=Date.now(); FMCUI.now=()=>S.epoch+S.t*1000;
  EF.range=phase==='arrival'?40:80;
  $q('#sitstatus').textContent=`${e.scenario.origin} → ${e.scenario.destination} · ${phase} · ${Math.round(S.alt)} ft · ${Math.round(S.ias)} kt IAS · magnetic variation ${S.magvar>=0?'E':'W'}${Math.abs(S.magvar).toFixed(1)}°`;
}
/* ---- the airplane lined up on a runway, ready for takeoff ---- */
function initAtRunway(){
  const r=e.active; newState(); const A=db.airports[e.scenario.origin], first=r.legs.find(isPos), target=first?bearing(A,first):90;
  let best=null; for(const rw of A.runways){ const inf=runwayInfo(A.id,rw.id); if(!inf) continue; const score=Math.abs(wrap180(inf.hdgT-target))+(inf.lenFt<5000?90:0); if(!best||score<best.score) best={inf,score}; }
  let R=best.inf; { const want=$q('#sit-rwy').value||e.active.runway; if(want){ const w=runwayInfo(A.id,want); if(w) R=w; } } e.active.runway=R.id;
  S.lat=R.lat; S.lon=R.lon; S.alt=R.elev; S.fieldElev=R.elev; S.hdg=R.hdgT; S.hdgU=R.hdgT; S.gnd=true; S.ias=0; S.gs=0; S.tas=0; S.rollout=false;
  S.magvar=magVarAt(S,S.alt); S.mvT=0; S.weightKg=fmcWeightKg()||62000; S.fuelKg=fmcFuelKg()||9000; S.holdAlt=S.alt; S.hdgHold=S.hdg;
  const fl=+e.perf.flaps||5; S.cfg=cfgNew(CFG.flapDetents.includes(fl)?fl:5,true);
  const sp=takeoffSpeeds(); if(!e.perf.v1&&sp.v1){ e.perf.v1=String(sp.v1); e.perf.vr=String(sp.vr); e.perf.v2=String(sp.v2); e.perf.vSpeedsOff=false; e.perf.takeoffReference=null; }
  const m=S.mcp; m.ap=false; m.hdg=Math.round(R.hdgM)%360; m.alt=10000; m.spd=sp.v2||140; m.vs=0;
  S.modes.at='ARM'; S.modes.roll=''; S.modes.pitch=''; S.atArm=true; S.limitMode='TO';
  S.n1=26; S.n1cmd=26; S.lever=0; S.pitchA=0; logInitialModes(); S.epoch=Date.now(); FMCUI.now=()=>S.epoch+S.t*1000;
  EF.range=40;
  $q('#sitstatus').textContent=`${e.scenario.origin} runway ${R.id.replace('RW','')} · ${Math.round(R.lenFt)} ft · heading ${fmtH(R.hdgM)}°M · V1 ${sp.v1||'--'} VR ${sp.vr||'--'} V2 ${sp.v2||'--'} · push a TO/GA switch (both F/D ON)`;
}
/* ---- preflight: parked on the runway, FMC empty, nothing set ---- */
function initPreflight(){
  newState(); const A=db.airports[e.scenario.origin]; let rw=A.runways.map(r=>runwayInfo(A.id,r.id)).filter(Boolean).sort((a,b)=>b.lenFt-a.lenFt)[0]; { const want=$q('#sit-rwy').value; const w=want&&runwayInfo(A.id,want); if(w) rw=w; }
  S.rwyId=rw.id; S.lat=rw.lat; S.lon=rw.lon; S.alt=rw.elev; S.fieldElev=rw.elev; S.hdg=rw.hdgT; S.hdgU=rw.hdgT; S.gnd=true; S.ias=0; S.gs=0; S.tas=0; S.rollout=false;
  S.magvar=magVarAt(S,S.alt); S.mvT=0; S.weightKg=fmcWeightKg()||62000; S.fuelKg=fmcFuelKg()||9000; S.holdAlt=S.alt; S.hdgHold=S.hdg; S.cfg=cfgNew(0,true); S.engOn=false; S.engStart=false; S.n1=0; S.n1cmd=0;
  const m=S.mcp; m.ap=false; m.ap2=false; m.fdL=false; m.fdR=false; m.hdg=360; m.alt=10000; m.spd=100; m.vs=0;   /* boot defaults: SPD 100, HDG 360, ALT 10000 */
  S.modes.at=''; S.modes.roll=''; S.modes.pitch=''; S.atArm=false; S.limitMode='TO'; S.lever=0; S.pitchA=0;
  logInitialModes(); S.epoch=Date.now(); FMCUI.now=()=>S.epoch+S.t*1000; EF.range=40;
  $q('#sitstatus').textContent=`${e.scenario.origin} · preflight · parked on runway ${rw.id.replace('RW','')} · FMC empty: enter POS INIT, route, PERF INIT and TAKEOFF REF, set the MCP, then push TO/GA`;
}
/* ---- the preset flight plan: KMCO RW36R OSPRY1.REMIS, direct MOLIE, Q79 to FEMID, STAR FROGZ5 to LLEGG, ILS 09 at KMIA ---- */
function fullPlanAvailable(o,d){ return o==='KMCO'&&d==='KMIA'&&db.airports.KMCO&&db.airports.KMIA&&db.airways&&db.airways.Q79; }
function applyFullPlan(phase){
  const r=e.draft(); r.runway='RW36R'; r.sid='OSPRY1'; r.sidTrans=''; r.star='FROGZ5'; r.starTrans=''; r.arrivalRunway='RW09'; r.approach='I09'; r.appTrans='LLEGG';
  const aw=db.airways.Q79, i0=aw.findIndex(x=>x.id==='MOLIE'), i1=aw.findIndex(x=>x.id==='FEMID');
  const leg=(f,via)=>Object.assign(cleanLeg(f,'enroute'),via?{via}:{});
  const seq=i1<i0?aw.slice(i1,i0).reverse():aw.slice(i0+1,i1+1);
  /* continuous route: the enroute part starts at the SID end fix and ends at the first STAR fix, so the FMC joins the pieces without discontinuities */
  const sidEnd=procLegs(db.airports.KMCO,'D','OSPRY1','','RW36R').filter(l=>isPos(l)).pop(), starFirst=procLegs(db.airports.KMIA,'E','FROGZ5','','RW09').find(l=>isPos(l));
  r.legs=[].concat(sidEnd?[leg(sidEnd)]:[],[leg(aw[i0])],seq.map(f=>leg(f,'Q79')),starFirst?[leg(starFirst)]:[]);
  e.perf.crzAlt='FL270'; if(phase==='cruise') e.aircraft.altitude=27000;
  e.rebuild(db.airports); e.execute();
  /* place the airplane along the route for the chosen situation */
  const legs=e.active.legs, pos=legs.map((l,i)=>({l,i})).filter(o=>isPos(o.l)); let tot=0; const cum=[0];
  for(let k=1;k<pos.length;k++){ tot+=distance(pos[k-1].l,pos[k].l); cum.push(tot); }
  const frac=phase==='takeoff'?0.015:phase==='cruise'?0.38:phase==='arrival'?0.8:0, want=tot*frac;
  if(phase==='runway'){ e.active.index=0; return; }
  let k=1; while(k<pos.length-1&&cum[k]<want) k++;
  const a=pos[k-1].l, b=pos[k].l, f=(want-cum[k-1])/Math.max(cum[k]-cum[k-1],0.01), p={lat:a.lat+(b.lat-a.lat)*clamp(f,0,1),lon:a.lon+(b.lon-a.lon)*clamp(f,0,1)};
  Object.assign(e.aircraft,p); e.active.index=pos[k].i;
}
let loading=false;
async function loadSituation(orig,dest,phase){
  if(loading) return; loading=true; const btn=$q('#sitload'); btn.disabled=true; $q('#sitstatus').textContent='Loading navigation data…';
  try{
    const oid=airportID(orig), did=airportID(dest);
    if(oid===did) throw Error('Choose two different airports.');
    const tasks=[airport(oid),airport(did)]; if(phase!=='preflight') tasks.push(ensureFixes());
    const [o,d]=await Promise.all(tasks);
    e.newFlight(o,d,phase==='runway'?'takeoff':phase); if(phase!=='preflight'&&fullPlanAvailable(o.id,d.id)){ try{ applyFullPlan(phase); }catch(err){ console.warn('preset plan failed',err); } } sessionStarted=true; page=phase==='runway'?'TAKEOFF REF':(phase==='preflight'?'IDENT':'LEGS'); pageNo=0; clear();
    if(phase==='runway') initAtRunway(); else if(phase==='preflight') initPreflight(); else initFromFMC(phase); S.landVariant=$q('#alvar').value; render();
    msg('');
  }catch(err){ $q('#sitstatus').textContent=err.message; toast(err.message); }
  finally{ loading=false; btn.disabled=false; }
}

/* EXEC: a direct-to (or any new active leg) takes the airplane's position at that moment as its start */
{ const ex0=Engine.prototype.execute; Engine.prototype.execute=function(){ const r=ex0.apply(this,arguments); try{ if(r!==false&&S.gnd&&!S.tdT&&!(S.to&&S.to.active)&&S.ias<1&&this.active&&this.active.legs.length) this.active.index=0;   /* parked before takeoff: the active leg is the first leg of the route (a new SID starts the route) */
    S.legKey=''; lnavGuide(); }catch(err){} return r; }; }

/* ---- CDU drawer ---- */
/* the CDU is scaled to the window height so it never needs scrolling */
function fitCdu(){ const h=$('cdu-host'), d=$q('#cdu-drawer'); if(!h||!d) return; h.style.transform='none'; h.style.height=''; h.style.width=''; d.style.width='';
  const head=d.querySelector('.dh').offsetHeight+8, note=d.querySelector('.cdu-note'), noteH=note?note.offsetHeight+12:0, nat=h.scrollHeight||1, natW=h.scrollWidth||1, k=Math.min(1,(innerHeight-head-noteH-36)/nat);
  h.style.width=natW+'px'; h.style.transformOrigin='top left'; h.style.transform=`scale(${k})`; h.style.height=Math.ceil(nat*k)+'px'; d.style.width=Math.min(600,Math.ceil(natW*k)+36)+'px'; }
function setDrawer(open){ const d=$q('#cdu-drawer'); d.classList.toggle('open',open); $q('#cdu-tab').hidden=open; FMCUI.keyboard=open; if(open){ render(); fitCdu(); setTimeout(fitCdu,50); } }
addEventListener('resize',()=>{ if($q('#cdu-drawer').classList.contains('open')) fitCdu(); });

/* ---- FMC display hook: keep the FMC aware of the airplane, refresh the CDU when it is visible ---- */
FMCUI.afterRender=function(){ /* the Lab needs nothing extra after a CDU redraw */ };
FMCUI.todEstimate=todEstimate; /* the VNAV key opens the page for the phase of flight: CLB, CRZ or DES */
FMCUI.vnavPage=()=>{ if(S.gnd) return 'CLB'; if(S.vnavOn&&S.vnPhase) return S.vnPhase; const crz=crzAltFt(), ai=altInd(); if(crz==null) return 'CLB'; if(ai<crz-150) return S.vs<-500?'DES':'CLB'; return (S.vs<-500&&S.mcp.alt<ai-100)?'DES':'CRZ'; };
/* DES NOW: VNAV enters the descent phase at once (-1000 fpm until the path is intercepted); the MCP altitude must be below the airplane */
FMCUI.desNow=()=>{ if(S.gnd) return 'NOT ON GROUND'; if(!isVnav()) return 'VNAV NOT ENGAGED'; if(S.mcp.alt>=altInd()-100) return 'SET MCP ALT BELOW'; S.vnPhase='DES'; S.vnNow=true; S.vnAltHold=false; msg('DES NOW: VNAV descent at -1000 fpm until the descent path is intercepted.'); return null; };
FMCUI.inHold=idx=>!!(S.hold&&S.hold.idx===idx); FMCUI.actualN1=()=>S.n1; FMCUI.altNow=()=>S.alt;
let cduT=0;

/* ---- loop ---- */
let last=performance.now();
function frame(now){
  const rdt=Math.min((now-last)/1000,0.1); last=now;
  if(!paused){ let sim=rdt*simSpeed; while(sim>1e-6){ const d=Math.min(0.1,sim); step(d); sim-=d; } }
  syncToFMC();
  syncMCP(); syncStand(); syncThr(); if(window.updColumn&&$q('#col-drawer').classList.contains('open')) updColumn(); drawPFD(); drawND(); if($q('#scope-drawer').classList.contains('open')) drawScope();
  const t=Math.floor(S.t), mm=String(Math.floor(t/60)).padStart(2,'0'), ss=String(t%60).padStart(2,'0'); $q('#clk').textContent='T+'+mm+':'+ss;
  if(msgT&&performance.now()-msgT>9000){ $q('#msg').textContent=''; msgT=0; }
  if($q('#cdu-drawer').classList.contains('open')&&now-cduT>1000){ cduT=now; try{ render(); }catch(err){} }
  requestAnimationFrame(frame);
}

function bar(id,arr,cur,fn,fmt){ const el=$q(id); arr.forEach(v=>{ const b=document.createElement('button'); b.textContent=fmt?fmt(v):v; b.onclick=()=>{fn(v); [...el.children].forEach(c=>c.classList.toggle('on',c===b));}; if(v===cur) b.classList.add('on'); el.appendChild(b); }); }
bar('#win',[120,300,600],300,v=>WIN=v,v=>v/60+' min');
$q('#sitload').onclick=()=>loadSituation($q('#sit-o').value,$q('#sit-d').value,$q('#sit-p').value);
$q('#pp').onclick=()=>{ paused=!paused; $q('#pp').textContent=paused?'▶ Resume':'❚❚ Pause'; $q('#pp').classList.toggle('on',paused); };
$$q('[data-sp]').forEach(b=>b.onclick=()=>{ simSpeed=+b.dataset.sp; $$q('[data-sp]').forEach(c=>c.classList.toggle('on',c===b)); });
$q('#cdu-tab').onclick=()=>setDrawer(true); $q('#cdu-close').onclick=()=>setDrawer(false);
document.addEventListener('keydown',ev=>{ if(ev.key==='Escape'&&$q('#cdu-drawer').classList.contains('open')&&!ev.target.closest('.cdu-shell')) setDrawer(false); });
$q('#aplt').onclick=()=>{ S.apLight=false; apToneOff(); }; $q('#atlt').onclick=()=>{ S.atLight=false; };
$q('#apsw').onclick=()=>{ if(S.mcp.ap){ apDisc(); msg('A/P disengage switch pushed. Push again to silence the warning.'); } else { S.apLight=false; apToneOff(); } };
$q('#engstart').onclick=()=>{ if(!S.gnd||S.engOn) return; if(S.fuelKg<=0){ msg('There is no fuel on board: enter it on PERF INIT.'); return; } S.engOn=true; S.engStart=true; S.limitMode='TO'; msg('Both engines are starting: idle in about 25 seconds.'); };
{ const wd=$q('#wdir'), ws=$q('#wspd'); const upd=()=>{ let d=parseInt(wd.value,10), v=parseInt(ws.value,10); d=Number.isFinite(d)?((d%360)+360)%360:0; v=Number.isFinite(v)?clamp(v,0,80):0; WIND.dir=d; WIND.spd=v; wd.value=String(d).padStart(3,'0'); ws.value=String(v); };
  wd.onchange=upd; ws.onchange=upd; wd.addEventListener('keydown',ev=>{ if(ev.key==='Enter') upd(); }); ws.addEventListener('keydown',ev=>{ if(ev.key==='Enter') upd(); }); }
$q('#follow').onchange=ev=>{ followFD=ev.target.checked; };

/* ---- boot ---- */
newState(); logInitialModes();
e=new Engine(db); mountCDU($('cdu-host')); FMCUI.keyboard=false;
$('airports').innerHTML=db.index.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
requestAnimationFrame(frame);
loadSituation('KMCO','KMIA','cruise');

$q('#ilschart').onclick=()=>{ const t=$q('#ilstable'); if(!t.hidden){ t.hidden=true; return; }
  const ids=[...new Set([e.route.origin,e.route.destination].filter(Boolean))]; const rows=[];
  for(const id of ids){ const L=(NAV_ILS.ils[id]||[]); rows.push('<b>'+id+'</b> '+(L.length?'':'— no ILS in the database')); for(const r of L) rows.push(`&nbsp;&nbsp;RW${r.rwy.replace('RW','')} · ${r.ident} · ${fmtFreq(r.freq)} · CRS ${fmtH(r.crs)}° · cat ${r.cat==='0'?'LOC':r.cat}`); }
  t.innerHTML=rows.join('<br>'); t.hidden=false; };

/* ---- control column drawer ---- */
function setColumn(open){ $q('#col-drawer').classList.toggle('open',open); $q('#col-tab').hidden=open; COLKEYS=open; if(!open){ S.ctl.roll=0; S.ctl.pitch=0; } }
let COLKEYS=false; const KEYSDOWN={};
$q('#col-btn').onclick=()=>setColumn(!$q('#col-drawer').classList.contains('open')); $q('#col-tab').onclick=()=>setColumn(true); $q('#col-close').onclick=()=>setColumn(false);
(function(){
  const svg=$q('#colsvg'), NSs='http://www.w3.org/2000/svg';
  const mk2=(t,a,par)=>{ const el=document.createElementNS(NSs,t); for(const k in a) el.setAttribute(k,a[k]); (par||svg).appendChild(el); return el; };
  const tx=(x,y,t,o)=>{ const el=mk2('text',Object.assign({x,y,fill:'#9aa7b4','font-size':9,'text-anchor':'middle','letter-spacing':'.06em'},o||{})); el.textContent=t; return el; };
  tx(0,-70,'PUSH · nose down',{'font-size':8}); tx(0,84,'PULL · nose up',{'font-size':8});
  tx(-88,-10,'ROLL',{'font-size':8}); tx(88,-10,'ROLL',{'font-size':8});
  const yoke=mk2('g',{});
  /* the 737 yoke: two horn grips joined by a U, a center hub on the column */
  const U='M-62 -30 C-72 22 -56 48 -22 48 L22 48 C56 48 72 22 62 -30';
  mk2('path',{d:U,fill:'none',stroke:'#8b98a5','stroke-width':20,'stroke-linecap':'round'},yoke); mk2('path',{d:U,fill:'none',stroke:'#14171a','stroke-width':16,'stroke-linecap':'round'},yoke);
  [[-62,-30,-50,-56],[62,-30,50,-56]].forEach(([x1,y1,x2,y2])=>{ mk2('line',{x1,y1,x2,y2,stroke:'#8b98a5','stroke-width':24,'stroke-linecap':'round'},yoke); mk2('line',{x1,y1,x2,y2,stroke:'#14171a','stroke-width':20,'stroke-linecap':'round'},yoke); });
  mk2('rect',{x:-26,y:-6,width:52,height:52,rx:9,fill:'#0f1215',stroke:'#8b98a5','stroke-width':2},yoke);
  tx(0,20,'BOEING',{fill:'#c9d2db','font-size':7,'font-style':'italic','font-weight':700}).setAttribute('transform','');  yoke.appendChild(svg.lastChild); tx(0,30,'737',{fill:'#c9d2db','font-size':8,'font-style':'italic','font-weight':700}); yoke.appendChild(svg.lastChild);
  const apb=mk2('circle',{cx:52,cy:-46,r:6.5,fill:'#e0362f',stroke:'#7a1c18','stroke-width':1.5,style:'cursor:pointer'},yoke);
  const lbl=tx(112,-52,'A/P DISENGAGE',{'font-size':7,fill:'#c9d2db'}); mk2('line',{x1:64,y1:-50,x2:84,y2:-52,stroke:'#c9d2db','stroke-width':.8});
  apb.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); $q('#apsw').click(); });
  let drag=false; const upd=()=>{ const c=S.ctl; yoke.setAttribute('transform',`translate(0 ${10+c.pitch*12}) rotate(${c.roll*85}) scale(${1+c.pitch*0.14})`);
    $q('#colread').textContent=`ROLL ${(c.roll*100).toFixed(0)}%   PITCH ${c.pitch>=0?'PULL':'PUSH'} ${Math.abs(c.pitch*100).toFixed(0)}%${S.brakePedal?'   BRAKES':''}`; };
  const set=(ev)=>{ const r=svg.getBoundingClientRect(); const x=((ev.clientX-r.left)/r.width-0.5)/0.32, y=((ev.clientY-r.top)/r.height-0.5)/0.32; const sh=v=>Math.sign(v)*Math.pow(Math.min(1,Math.abs(v)),1.3); S.ctl.roll=sh(clamp(x,-1,1)); S.ctl.pitch=sh(clamp(y,-1,1));   /* drag down = pull = nose up */ };
  svg.addEventListener('pointerdown',ev=>{ drag=true; svg.setPointerCapture(ev.pointerId); set(ev); }); svg.addEventListener('pointermove',ev=>{ if(drag) set(ev); });
  const rel=()=>{ drag=false; S.ctl.roll=0; S.ctl.pitch=0; }; svg.addEventListener('pointerup',rel); svg.addEventListener('pointercancel',rel);
  document.addEventListener('keydown',ev=>{ if(!COLKEYS) return; const k=ev.key; if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)) return; ev.preventDefault(); KEYSDOWN[k]=1; keyCtl(); });
  document.addEventListener('keyup',ev=>{ if(!COLKEYS) return; delete KEYSDOWN[ev.key]; keyCtl(); });
  function keyCtl(){ S.ctl.roll=(KEYSDOWN.ArrowRight?0.7:0)-(KEYSDOWN.ArrowLeft?0.7:0); S.ctl.pitch=(KEYSDOWN.ArrowDown?0.7:0)-(KEYSDOWN.ArrowUp?0.7:0); }
  /* the floating panel can be dragged by its title so it never has to cover the PFD */
  const dr=$q('#col-drawer'), hd=dr.querySelector('.dh'); let mv=null;
  hd.addEventListener('pointerdown',ev=>{ if(ev.target.closest('button')) return; const r=dr.getBoundingClientRect(); mv=[ev.clientX-r.left,ev.clientY-r.top]; hd.setPointerCapture(ev.pointerId); });
  hd.addEventListener('pointermove',ev=>{ if(!mv) return; dr.style.left=clamp(ev.clientX-mv[0],0,innerWidth-dr.offsetWidth)+'px'; dr.style.top=clamp(ev.clientY-mv[1],0,innerHeight-dr.offsetHeight)+'px'; dr.style.right='auto'; });
  hd.addEventListener('pointerup',()=>mv=null);
  window.updColumn=upd;
})();
const brk=$q('#brakebtn'); const brkOn=v=>{ S.brakePedal=v; brk.classList.toggle('on',v); };
brk.addEventListener('pointerdown',ev=>{ brk.setPointerCapture(ev.pointerId); brkOn(true); }); brk.addEventListener('pointerup',()=>brkOn(false)); brk.addEventListener('pointercancel',()=>brkOn(false));
$q('#alvar').onchange=ev=>{ S.landVariant=ev.target.value; S.landStat=''; };

/* ---- fit the fixed stage to the window (no scrolling) ---- */
function fitStage(){ const k=Math.min(innerWidth/1600,innerHeight/1000); window.STAGE_K=k; const st=$q('#stage'); st.style.transform=`translate(${(innerWidth-1600*k)/2}px,${(innerHeight-1000*k)/2}px) scale(${k})`; FITS.forEach(f=>f()); }
addEventListener('resize',fitStage); fitStage();
/* ---- time history drawer ---- */
function setScope(open){ $q('#scope-drawer').classList.toggle('open',open); $q('#scope-tab').hidden=open; if(open) setTimeout(()=>FITS.forEach(f=>f()),250); }
$q('#scope-tab').onclick=()=>setScope(true); $q('#scope-close').onclick=()=>setScope(false);

/* runway choice: filled from the runways of the FROM airport; only used by the runway and preflight situations */
async function fillRunways(){
  const sel=$q('#sit-rwy'), id=($q('#sit-o').value||'').trim().toUpperCase(); let list=[];
  try{ if(id.length>=3){ const oid=airportID(id); const a=await airport(oid); list=(a&&a.runways||[]).map(r=>r.id); } }catch(err){}
  const keep=sel.value; sel.innerHTML='<option value="">Runway: auto</option>'+list.sort().map(r=>`<option value="${r}">Runway ${r.replace('RW','')}</option>`).join(''); if(list.includes(keep)) sel.value=keep; }
{ const po=$q('#sit-p'), upd=()=>{ $q('#sit-rwy').hidden=!['runway','preflight'].includes(po.value); }; po.addEventListener('change',upd); upd();
  $q('#sit-o').addEventListener('change',fillRunways); $q('#sit-o').addEventListener('blur',fillRunways); setTimeout(fillRunways,1500); }
