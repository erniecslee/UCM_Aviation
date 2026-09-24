'use strict';
/* Bridge between the FMC (../B737_FMCTrainer/fmc-core.js: global `e` = Engine, `db`) and the flight simulation.
   The simulation only ever *reads* the FMC route and *writes* the airplane's position back to it. */
const LNAV_PATHS=['IF','TF','DF','CF'];
const isPos=l=>!!l&&!l.disco&&Number.isFinite(l.lat)&&Number.isFinite(l.lon);
const actRoute=()=>(typeof e!=='undefined'&&e&&e.active)?e.active:null;
const flyableLeg=l=>isPos(l)&&LNAV_PATHS.includes(l.path);

/* altitude constraint of a leg, from the CDU entry if present, else from the database: {type:'A'|'B'|'@'|'W', alt, alt2} */
function legAlt(l){
  if(!l||l.disco||l.altDel) return null;
  const parse=t=>{ const m=String(t||'').match(/^(FL\d{3}|-?\d{3,5})([AB]?)(?:(FL\d{3}|-?\d{3,5})([AB]))?$/); if(!m) return null;
    const lo=altitude(m[1]); if(lo==null) return null;
    if(m[3]){ const hi=altitude(m[3]); return {type:'W',alt:lo,alt2:hi}; }
    return {type:m[2]||'@',alt:lo}; };
  if(l.userConstraint&&l.userConstraint.altitude) return parse(l.userConstraint.altitude);
  if(!l.alt1) return null;
  const a=parseInt(l.alt1,10); if(!Number.isFinite(a)) return null;
  const d=l.altDesc;
  if(d==='+') return {type:'A',alt:a}; if(d==='-') return {type:'B',alt:a};
  if(d==='B'&&l.alt2){ const b=parseInt(l.alt2,10); return {type:'W',alt:Math.min(a,b),alt2:Math.max(a,b)}; }
  return {type:'@',alt:a};
}
function legSpeed(l){
  if(!l||l.disco) return null;
  const t=(l.userConstraint&&l.userConstraint.speed)||l.speed; if(!t) return null;
  const n=+String(t); return Number.isFinite(n)&&n>=90?n:null;
}
const fixName=l=>l?(typeof conditionalWaypointName==='function'?conditionalWaypointName(l):l.id):'';

/* ---- LNAV guidance --------------------------------------------------------------------------------------------- */
function nextFlyable(r,i){ const q=r.legs[i+1]; return isPos(q)&&LNAV_PATHS.includes(q.path)?q:null; }
function prevFix(r,i){ for(let k=i-1;k>=0;k--){ const q=r.legs[k]; if(q.disco) return null; if(isPos(q)) return q; } return null; }
/* returns null when there is no active route, {end:reason} when LNAV cannot continue, or the geometry of the active leg */
function lnavGuide(){
  const r=actRoute(); if(!r) return null;
  const l=r.legs[r.index];
  if(!l) return {end:'END OF ROUTE'};
  if(l.disco) return {end:'ROUTE DISCONTINUITY'};
  if(!flyableLeg(l)) return {end:'MANUAL LEG '+fixName(l)+' ('+l.path+')'};
  if(S.hold&&!(S.hold.id===l.id&&S.hold.idx===r.index&&l.hold)) S.hold=null;
  if(S.hold){ const g=holdGuide(r,l); if(g) return g; }
  const prev=(l.path==='TF'||l.path==='CF')?prevFix(r,r.index):null;
  const key=[r.index,l.id,l.path,r.direct?1:0,prev?prev.id:''].join('|');
  if(S.legKey!==key){ S.legKey=key; S.legStart=prev?{lat:prev.lat,lon:prev.lon}:{lat:S.lat,lon:S.lon}; S.arcStart=S.legStart; S.arcDone=false;
    S.legArc=(!prev&&l.path==='DF'&&!S.gnd)?dfArc(S.legStart,S.hdg,l,S.tas):null; }
  const nx=nextFlyable(r,r.index); let lead=0.6;
  /* a direct-to starts with a turn: an arc tangent to the present heading, then the straight line to the fix */
  if(S.legArc&&!S.arcDone){
    const A=S.legArc, p0=llXY(S,S.arcStart), th=Math.atan2(p0.y-A.C.y,p0.x-A.C.x), md=a=>((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const swept=A.sgn>0?md(A.ths-th):md(th-A.ths), rho=Math.hypot(p0.x-A.C.x,p0.y-A.C.y);
    if(swept>=A.sweep-0.03&&swept<=A.sweep+Math.PI){ S.arcDone=true; S.legStart=destPoint(S.arcStart,wrap360(Math.atan2(A.T.x,A.T.y)/D2R),Math.hypot(A.T.x,A.T.y)); }
    else{ const course=A.sgn>0?wrap360(Math.atan2(Math.sin(th),-Math.cos(th))/D2R):wrap360(Math.atan2(-Math.sin(th),Math.cos(th))/D2R);
      return {leg:l,r,course,along:0,L:1e3,xtkR:A.sgn*(A.R-rho),lead:0.6,toGo:distance(S,l),dist:distance(S,l),arc:true}; }
  }
  const st=S.legStart, u=llXY(l,st), L=Math.hypot(u.x,u.y)||0.001, ux=u.x/L, uy=u.y/L, p=llXY(S,st);
  const along=p.x*ux+p.y*uy, xtkR=-(ux*p.y-uy*p.x), course=wrap360(Math.atan2(u.x,u.y)/D2R);
  if(nx){ const c2=bearing(l,nx), dl=Math.abs(wrap180(c2-course)); const R=S.tas*S.tas/(68626*Math.tan(25*D2R)); lead=Math.max(0.6,R*Math.tan(dl*D2R/2)+0.2); }
  return {leg:l,r,course,along,L,xtkR,lead,toGo:L-along,dist:distance(S,l)};
}
/* geometry of the direct-to turn (local NM frame at the start point): circle of the 25° bank turn radius, tangent to the heading, and the tangent line to the fix */
function dfArc(st,hdg0,l,tas){
  const W=llXY(l,st), course=wrap360(Math.atan2(W.x,W.y)/D2R), dev=wrap180(course-hdg0); if(Math.abs(dev)<3) return null;
  const R=Math.max(0.5,tas*tas/(68626*Math.tan(25*D2R))), sgn=dev>0?1:-1, h=hdg0*D2R, C={x:sgn*R*Math.cos(h),y:-sgn*R*Math.sin(h)};
  const d=Math.hypot(W.x-C.x,W.y-C.y); if(d<=R*1.02) return null;
  const phi=Math.atan2(W.y-C.y,W.x-C.x), al=Math.acos(R/d); let T=null;
  for(const th of [phi+al,phi-al]){ const Tp={x:C.x+R*Math.cos(th),y:C.y+R*Math.sin(th)}, v=sgn>0?{x:Math.sin(th),y:-Math.cos(th)}:{x:-Math.sin(th),y:Math.cos(th)}; if(v.x*(W.x-Tp.x)+v.y*(W.y-Tp.y)>0){ T=Tp; T.th=th; break; } }
  if(!T) return null; const md=a=>((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI), ths=Math.atan2(-C.y,-C.x), sweep=sgn>0?md(ths-T.th):md(T.th-ths);
  return {C,R,sgn,ths,sweep,T};
}
/* points (lat/lon) of the direct-to turn still ahead, for the ND */
function arcPoints(){
  const A=S.legArc; if(!A||S.arcDone||!S.arcStart) return null; const pts=[], n=20;
  for(let i=0;i<=n;i++){ const th=A.ths+(-A.sgn)*A.sweep*i/n, x=A.C.x+A.R*Math.cos(th), y=A.C.y+A.R*Math.sin(th); pts.push(destPoint(S.arcStart,wrap360(Math.atan2(x,y)/D2R),Math.hypot(x,y))); }
  return pts;
}
/* advance to the next leg; returns false if the next leg cannot be flown by LNAV */
function sequenceLeg(){
  const r=actRoute(), l=r.legs[r.index];
  if(l&&l.hold&&!l.hold.exit&&!(S.hold&&S.hold.id===l.id)){ startHold(r,l); return true; }
  r.index++; e.log('Sequenced '+(l?l.id:'')); if(typeof render==='function') render();
  const n=r.legs[r.index]; return !!n&&flyableLeg(n);
}

/* ---- route helpers for the displays ---------------------------------------------------------------------------- */
/* list of legs from the active one on, with cumulative distance from the airplane */
function routeAhead(maxCount){
  const r=actRoute(); if(!r) return [];
  const out=[]; let d=0, px=S;
  for(let i=r.index;i<r.legs.length&&out.length<(maxCount||40);i++){
    const l=r.legs[i]; if(l.disco){ px=null; out.push({i,l,disco:true,d:d}); continue; }
    if(!isPos(l)) continue;
    if(px) d+=distance(px,l); px=l;
    out.push({i,l,d,alt:legAlt(l),spd:legSpeed(l)});
  }
  return out;
}
function modRouteAhead(){ if(!(typeof e!=='undefined'&&e&&e.mod)) return []; const r=e.mod; return r.legs.slice(r.index).filter(isPos); }

/* write the airplane state back to the FMC so its pages (PROG, LEGS, VNAV …) use the real position */
function syncToFMC(){
  if(typeof e==='undefined'||!e||!e.aircraft) return;
  const a=e.aircraft; a.lat=S.lat; a.lon=S.lon; a.altitude=Math.round(S.alt); a.speed=Math.round(S.gs);
}

/* landing reference speeds from the FMC performance data (FCOM table via the trainer's referenceVref) */
function fmcVrefs(){
  try{ if(typeof e==='undefined'||!e) return {}; const w=approachWeight(); if(w==null||w==='') return {};
    const g=f=>{ const v=referenceVref(w,f); return v==null?null:v; };
    return {v40:g(40),v30:g(30),v15:g(15)}; }catch(err){ return {}; }
}

/* the position `dist` NM ahead along the active route (for the T/D symbol) */
function pointAlongRoute(ahead,dist){
  let prev={lat:S.lat,lon:S.lon,d:0}, broken=false;
  for(const it of ahead){
    if(it.disco){ broken=true; continue; }
    if(broken){ prev={lat:it.l.lat,lon:it.l.lon,d:it.d}; broken=false; if(it.d>=dist) return null; continue; }
    if(it.d>=dist){ const f=(dist-prev.d)/((it.d-prev.d)||1); return {lat:prev.lat+(it.l.lat-prev.lat)*f,lon:prev.lon+(it.l.lon-prev.lon)*f}; }
    prev={lat:it.l.lat,lon:it.l.lon,d:it.d};
  }
  return null;
}

/* gross weight from the FMC PERF INIT data (thousands of lb) in kg */
function fmcWeightKg(){ try{ const w=grossWeight(); const n=w==null?NaN:+w; return Number.isFinite(n)&&n>0?n*453.59237:null; }catch(err){ return null; } }

/* fuel on board from the FMC PERF INIT entry (1000 lb) in kg, or null */
function fmcFuelKg(){ try{ if(e.perf.fuel==='') return null; const f=+e.perf.fuel; return Number.isFinite(f)?f*453.59237:null; }catch(err){ return null; } }

/* ---- holding pattern (FMC HOLD page data: inbound course, turn direction, leg time or distance) -------------------------
   The pattern is flown over the ground: two 25°-bank half circles joined by two legs, entered as direct, parallel or teardrop
   by the airplane's heading when it reaches the fix (70° / 110° sectors). EXIT HOLD (after EXEC) leaves at the fix. */
const holdR=tas=>Math.max(0.6,tas*tas/(68626*Math.tan(25*D2R)));
const hVec=h=>({x:Math.sin(h*D2R),y:Math.cos(h*D2R)}), hRight=h=>({x:Math.cos(h*D2R),y:-Math.sin(h*D2R)});
function segLine(p,h,len){ const u=hVec(h); return {k:'L',p0:{x:p.x,y:p.y},h,len,end:{x:p.x+u.x*len,y:p.y+u.y*len}}; }
function segArc(p,h,sgn,sweepDeg,r){ const rv=hRight(h), C={x:p.x+sgn*r*rv.x,y:p.y+sgn*r*rv.y}, ths=Math.atan2(p.y-C.y,p.x-C.x), sw=sweepDeg*D2R, te=ths-sgn*sw;
  return {k:'A',C,r,sgn,ths,sweep:sw,end:{x:C.x+r*Math.cos(te),y:C.y+r*Math.sin(te)}}; }
function holdCycle(H){ const {C,sgn,Ld,r}=H, F={x:0,y:0}, t1=segArc(F,C,sgn,180,r), out=segLine(t1.end,wrap360(C+180),Ld), t2=segArc(out.end,wrap360(C+180),sgn,180,r), inb=segLine(t2.end,C,Ld); return [t1,out,t2,inb]; }
function holdEntryType(H,hdg){ let r=wrap360(hdg-H.C); if(H.sgn<0) r=wrap360(360-r); return (r<=110||r>=290)?'DIRECT':(r<180?'TEARDROP':'PARALLEL'); }
function holdEntrySegs(H,type){
  const F={x:0,y:0}, C=H.C, sgn=H.sgn, Ld=H.Ld, r=H.r, inb=segLine({x:-hVec(C).x*Ld,y:-hVec(C).y*Ld},C,Ld);
  if(type==='PARALLEL'){ const o=segLine(F,wrap360(C+180),Ld); return [o,segArc(o.end,wrap360(C+180),-sgn,180,r),inb]; }
  if(type==='TEARDROP'){ const h1=wrap360(C+180-sgn*30), o=segLine(F,h1,Ld); return [o,segArc(o.end,h1,sgn,wrap360(sgn*(C-h1)),r),inb]; }
  return [];
}
function startHold(r,l){
  const h=l.hold, tas=Math.max(S.tas,150), gs=Math.max(S.gs,150);
  const H={C:wrap360(h.course),sgn:h.turn==='L'?-1:1,Ld:h.distance?h.distance:(h.time||1)*gs/60,r:holdR(tas)}, type=holdEntryType(H,S.trk);
  S.hold={id:l.id,idx:r.index,F:{lat:l.lat,lon:l.lon},H,type,segs:holdEntrySegs(H,type).concat(holdCycle(H)),si:0};
  msg('Holding at '+l.id+': '+type.toLowerCase()+' entry, inbound course '+String(H.C).padStart(3,'0')+'°, '+(H.sgn>0?'right':'left')+' turns. EXIT HOLD on the HOLD page, then EXEC, leaves the pattern at the fix.');
}
function holdGuide(r,l){
  const S_=S.hold, md=a=>((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI); const p=llXY(S,S_.F);
  for(let guard=0;guard<6;guard++){
    if(S_.si>=S_.segs.length){
      if(l.hold&&l.hold.exit){ S.hold=null; S.legKey=''; sequenceLeg(); return lnavGuide(); }
      S_.segs=S_.segs.concat(holdCycle(S_.H)); }
    const sg=S_.segs[S_.si], dist=distance(S,l);
    if(sg.k==='L'){ const u=hVec(sg.h), rv=hRight(sg.h), dx=p.x-sg.p0.x, dy=p.y-sg.p0.y, along=dx*u.x+dy*u.y, xtk=dx*rv.x+dy*rv.y;
      if(along>=sg.len-0.05){ S_.si++; continue; }
      return {leg:l,r,course:sg.h,along,L:sg.len,xtkR:xtk,lead:0.6,toGo:999,dist,hold:true}; }
    const th=Math.atan2(p.y-sg.C.y,p.x-sg.C.x), swept=sg.sgn>0?md(sg.ths-th):md(th-sg.ths), rho=Math.hypot(p.x-sg.C.x,p.y-sg.C.y);
    if(swept>=sg.sweep-0.03&&swept<=sg.sweep+Math.PI){ S_.si++; continue; }
    const course=sg.sgn>0?wrap360(Math.atan2(Math.sin(th),-Math.cos(th))/D2R):wrap360(Math.atan2(-Math.sin(th),Math.cos(th))/D2R);
    return {leg:l,r,course,along:0,L:1e3,xtkR:sg.sgn*(sg.r-rho),lead:0.6,toGo:999,dist,hold:true};
  }
  return null;
}
/* lat/lon polyline of the racetrack of a hold leg, for the ND */
function holdShape(l){
  let H, F={lat:l.lat,lon:l.lon};
  if(S.hold&&S.hold.id===l.id) H=S.hold.H; else { const h=l.hold; H={C:wrap360(h.course),sgn:h.turn==='L'?-1:1,Ld:h.distance?h.distance:(h.time||1)*230/60,r:holdR(230)}; }
  const pts=[]; holdCycle(H).forEach(sg=>{ if(sg.k==='L'){ pts.push(sg.p0,sg.end); } else { for(let i=0;i<=14;i++){ const th=sg.ths-sg.sgn*sg.sweep*i/14; pts.push({x:sg.C.x+sg.r*Math.cos(th),y:sg.C.y+sg.r*Math.sin(th)}); } } });
  return pts.map(q=>destPoint(F,wrap360(Math.atan2(q.x,q.y)/D2R),Math.hypot(q.x,q.y)));
}
