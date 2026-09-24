'use strict';
/* VNAV — vertical guidance from the FMC (FCOM 4.10.5–4.10.6): speed schedule, climb, cruise and descent,
   the descent path built backward from the end of the route, and top of descent.
   The FMC trainer supplies the cruise altitude, cost-index speed schedule, speed restriction and the leg constraints;
   this file turns them into pitch and thrust commands for the AFDS in afds.js. */
const FT_PER_NM=333;                          /* 3 NM per 1000 ft — the same rule the FMC trainer uses for its T/D estimate */
const VN_MODES=['VNAV SPD','VNAV PTH','VNAV ALT'];
const isVnav=()=>VN_MODES.includes(S.modes.pitch);

function fmcSched(){ try{ return econSpeedSchedule(); }catch(err){ return {climbIas:280,climbMach:0.78,crzMach:0.78,desIas:280,desMach:0.76}; } }
function crzAltFt(){ try{ const a=altitude(String(e.perf.crzAlt||'')); return Number.isFinite(a)?a:null; }catch(err){ return null; } }
function spdRestr(phase){ try{ const c=constraint(e.perf.spdRest||(phase==='DES'?'240/10000':'250/10000')); const s=+c.speed, a=+altitude(c.altitude); return {spd:Number.isFinite(s)?s:(phase==='DES'?240:250),alt:Number.isFinite(a)?a:10000}; }catch(err){ return {spd:phase==='DES'?240:250,alt:10000}; } }
/* a manual target-speed entry on the CLB / CRZ / DES page: "280/.780", ".780" or "280" */
function manualSpeed(alt){ const t=String(e.perf.targetSpeed||''); if(!t) return null; const m=t.match(/^(\d{3})?(?:\/)?(\.\d{2,3})?$/); if(!m||(!m[1]&&!m[2])) return null;
  const a=m[1]?+m[1]:null, mm=m[2]?+m[2]:null; const fromM=mm?iasOfMach(mm,alt):null; return a&&fromM?Math.min(a,fromM):(a||fromM); }
const accelHtAgl=()=>{ try{ const n=parseInt(String(e.perf.accel||'1000FT'),10); return Number.isFinite(n)?n:1000; }catch(err){ return 1000; } };
function fmcTargetIas(phase,alt,ahead){
  /* takeoff climb: V2 + 15 until the acceleration height; the FMC does not command acceleration before it */
  if(phase==='CLB'&&S.to&&S.to.v2&&raNow()<accelHtAgl()&&!S.flapRetracted) return clamp(S.to.v2+15,100,340);
  const sc=fmcSched(); let ias=manualSpeed(alt);
  if(!ias){ if(phase==='CLB') ias=Math.min(sc.climbIas,iasOfMach(sc.climbMach,alt)); else if(phase==='CRZ') ias=iasOfMach(sc.crzMach,alt); else ias=Math.min(sc.desIas,iasOfMach(sc.desMach,alt)); }
  const rs=spdRestr(phase); if(alt<rs.alt+ (phase==='DES'?300:0)) ias=Math.min(ias,rs.spd);
  for(const it of (ahead||[])){ if(it.disco||it.d>12) continue; if(it.spd) ias=Math.min(ias,it.spd); }
  return clamp(Math.round(ias),100,340);
}

/* descent path, built backward from the end of the route: [{dtg, alt}] with dtg = distance to go (0 at the end) */
function buildPath(ahead){
  const items=ahead.filter(it=>!it.disco); if(!items.length) return null;
  const total=items[items.length-1].d, dest=e&&e.route&&db.airports[e.route.destination], elev=dest?dest.elevation||0:0;
  const last=items[items.length-1]; let altN=last.alt?last.alt.alt:elev; const pts=[{dtg:0,alt:altN}]; let prevD=last.d;
  for(let k=items.length-2;k>=0;k--){ const it=items[k], dd=prevD-it.d; let a=altN+dd*FT_PER_NM; const c=it.alt;
    if(c){ if(c.type==='@') a=c.alt; else if(c.type==='A') a=Math.max(a,c.alt); else if(c.type==='B') a=Math.min(a,c.alt); else if(c.type==='W') a=clamp(a,c.alt,c.alt2); }
    pts.push({dtg:total-it.d,alt:a}); altN=a; prevD=it.d; }
  return {pts,total};
}
function pathAltAt(path,dtg){
  const p=path.pts; if(dtg<=p[0].dtg) return p[0].alt;
  for(let i=1;i<p.length;i++){ if(dtg<=p[i].dtg){ const a=p[i-1], b=p[i], f=(dtg-a.dtg)/((b.dtg-a.dtg)||1); return a.alt+(b.alt-a.alt)*f; } }
  const l=p[p.length-1]; return l.alt+(dtg-l.dtg)*FT_PER_NM;
}
/* distance to go at which the path meets the cruise altitude */
function todDtgOf(path,crz){
  const p=path.pts; if(p[0].alt>=crz) return 0;
  for(let i=1;i<p.length;i++){ if(p[i].alt>=crz){ const a=p[i-1], b=p[i], f=(crz-a.alt)/((b.alt-a.alt)||1); return a.dtg+(b.dtg-a.dtg)*f; } }
  const l=p[p.length-1]; return l.dtg+(crz-l.alt)/FT_PER_NM;
}
/* FMC T/D estimate for the CDU pages: distance from the airplane, null once the descent has started */
function todEstimate(){
  if(typeof S==='undefined'||!S||typeof e==='undefined'||!e||!e.active) return undefined;
  const ahead=routeAhead(60), path=buildPath(ahead), crz=crzAltFt(); if(!path||crz==null) return null;
  const dist=path.total-todDtgOf(path,crz); if(dist<=0||S.vnPhase==='DES') return null;
  return {dtg:dist,eta:new Date(S.epoch+S.t*1000+dist/Math.max(S.gs,60)*3600000)};
}

/* ---- the VNAV controller: called once per step while a VNAV pitch mode is active -------------------------------- */
function vnavGuide(dt){
  const s=S, m=s.mcp, ai=altInd(), crz=crzAltFt(), ahead=routeAhead(60), path=buildPath(ahead);
  const out={vc:s.vs,ts:s.ias,at:null,label:s.modes.pitch};
  if(crz==null){ setMode('pitch','ALT HOLD'); s.holdAlt=s.alt; msg('VNAV disengaged: no cruise altitude. Enter one on PERF INIT or the CRZ page.'); return null; }
  const total=path?path.total:0, dtgNow=total;
  let phase=s.vnPhase||'CLB';
  const spdHold=(ts)=>{ const ee=s.ias-(s.tsRef==null?ts:s.tsRef); s.pI=clamp(s.pI+25*ee*dt,-5000,4500); const v=clamp(s.pI+350*ee,-5000,4500); return (s.ias>ts+3&&!['N1','GA','THR HLD'].includes(s.modes.at))?Math.min(v,-500):v; };
  const mcpTop=m.alt, todDtg=path?todDtgOf(path,crz):0, toTod=path?total-todDtg:1e9;
  /* which phase are we in? */
  if(phase!=='DES'){
    if(mcpTop<ai-100 && (ai>crz+150 || toTod<=0)) phase='DES';
    else if(ai<crz-150 && mcpTop>ai+100) phase='CLB';
    else if(ai>=crz-150 && phase==='CLB' && Math.abs(ai-crz)<=150) phase='CRZ';
  } else { if(mcpTop>ai+100 && ai<crz-150) phase='CLB'; }
  s.vnPhase=phase; if(phase!=='DES') s.vnEarly=false; else if(s.vnEarly&&path&&(ai-Math.max(pathAltAt(path,total),mcpTop))<=100) s.vnEarly=false;
  const ts=s.vn&&s.vn.intv?tgtSpdMcp():fmcTargetIas(phase,ai,ahead); out.ts=ts; s.vnIas=ts;
  if(phase==='CLB'){
    /* ceiling: MCP altitude, cruise altitude and the next "at or below / at" constraint that is still above us */
    let tgt=Math.min(crz,mcpTop), why=tgt===mcpTop&&mcpTop<crz?'MCP':'CRZ';
    for(const it of ahead){ if(it.disco||!it.alt) continue; if(it.d>toTod) continue; const c=it.alt; const cap=(c.type==='B'||c.type==='@')?c.alt:(c.type==='W'?c.alt2:null); if(cap!=null&&cap>=ai-50&&cap<tgt){ tgt=cap; why='CON'; } }
    if(mcpTop<=ai+50){ tgt=ai; why='MCP'; }
    /* level at the MCP altitude in VNAV ALT: a higher MCP altitude does not resume the climb; ALT INTV does */
    if(s.vnAltHold&&(mcpTop<=ai-100||Math.abs(ai-s.vnHoldAlt)>200)) s.vnAltHold=false;
    if(s.vnAltHold){ tgt=s.vnHoldAlt; why='MCP'; }
    const d=tgt-ai, leveled=Math.abs(d)<25&&Math.abs(s.vs)<300, capturing=leveled||Math.abs(d)<Math.max(Math.abs(s.vs)/5.5,80);
    if(leveled&&why==='MCP'&&!s.vnAltHold){ s.vnAltHold=true; s.vnHoldAlt=tgt; }
    if(capturing){ out.vc=clamp(d*6,-3000,3000); out.label=(why==='MCP')?'VNAV ALT':'VNAV PTH'; if(leveled&&why==='CRZ') s.vnPhase='CRZ'; }
    else { out.vc=spdHold(ts); out.label='VNAV SPD'; }
    out.at=capturing?'FMC SPD':'N1';
  } else if(phase==='CRZ'){
    out.vc=clamp((crz-ai)*6,-2000,2000); out.label='VNAV PTH'; out.at='FMC SPD';
  } else { /* DES */
    const pathAlt=path?pathAltAt(path,dtgNow):ai, rsD=spdRestr('DES'); let tgt=Math.max(pathAlt,mcpTop);
    if(s.ias>rsD.spd+10&&ai>=rsD.alt-60&&ai<=rsD.alt+400) tgt=Math.max(tgt,rsD.alt);      /* no descent below the speed restriction altitude until the speed is at or below the limit + 10 kt */
    const err=ai-tgt;
    if(s.vnNow&&err>=-100) s.vnNow=false;
    const floorHit=(tgt===mcpTop&&pathAlt<=mcpTop);
    const pathVS=-FT_PER_NM*Math.max(s.gs,60)/60;
    if(floorHit&&Math.abs(err)<Math.max(Math.abs(s.vs)/5.5,80)){ out.vc=clamp(-err*6,-3000,3000); out.label='VNAV ALT'; out.at='FMC SPD'; }
    else if(s.vnNow&&err<-100){ out.vc=-1000; out.label='VNAV PTH'; out.at='FMC SPD'; }     /* DES NOW: -1000 fpm until the path comes down to the airplane */
    else if(s.vnEarly&&err>100){ out.vc=-1000; out.label='VNAV PTH'; out.at='FMC SPD'; }
    else if(err>250){ out.vc=spdHold(ts); out.label='VNAV SPD'; out.at='IDLE'; }
    else{ /* on or below the path: idle unless the speed decays (then FMC SPD holds it) — with hysteresis so the FMA does not chatter */
      if(s.ias<ts-6) s.vnHold=true; else if(s.ias>ts+10) s.vnHold=false;
      out.at=s.vnHold?'FMC SPD':'IDLE'; out.label='VNAV PTH';
      out.vc=err<-100?0:clamp(pathVS+(tgt-ai)*8,-4000,500); }
    if(floorHit&&Math.abs(err)<25&&Math.abs(s.vs)<250){ out.vc=0; out.label='VNAV ALT'; out.at='FMC SPD'; }
  }
  if(s.vn&&s.vn.intv&&out.at==='FMC SPD') out.at='MCP SPD';     /* speed intervention: the speed window is open, the A/T follows the MCP speed */
  if(out.label!==s.modes.pitch) setMode('pitch',out.label);
  if(s.atArm && out.at && !['THR HLD','OFF'].includes(s.modes.at) && s.modes.at!==out.at) setAT(out.at);
  return out;
}
const tgtSpdMcp=()=>{ const m=S.mcp; return m.machMode?clamp(iasOfMach(m.mach,S.alt),100,340):m.spd; };

/* pressing the VNAV switch */
function vnavPress(){
  if(S.gnd){ S.arm.vnav=!S.arm.vnav; msg(S.arm.vnav?'VNAV armed: it engages at 400 ft RA.':'VNAV disarmed.'); return; }
  if(isVnav()){ setMode('pitch','ALT HOLD'); S.holdAlt=S.alt; pitchAt('speed'); msg('VNAV deselected: ALT HOLD.'); return; }
  if(typeof perfComplete==='function'&&!perfComplete()){ msg('VNAV unavailable: complete PERF INIT first (ZFW, fuel, reserves, cost index, cruise altitude).'); return; }
  if(!actRoute()||!actRoute().legs.some(l=>isPos(l))){ msg('VNAV unavailable: there is no active route.'); return; }
  if(crzAltFt()==null){ msg('VNAV unavailable: enter a cruise altitude on PERF INIT or the CRZ page.'); return; }
  S.vn={intv:false}; S.vnAltHold=false; S.pI=S.vs; const ai=altInd(), crz=crzAltFt();
  { const ph=buildPath(routeAhead(60)), pastTod=ph&&(ph.total-todDtgOf(ph,crz))<=0;
    S.vnPhase=(S.mcp.alt<ai-100&&(ai>crz+150||pastTod))?'DES':(ai<crz-150?'CLB':(ai>crz+150?'DES':'CRZ')); }
  setMode('pitch','VNAV SPD'); S.vnavOn=true;
  if(S.atArm) setAT(S.vnPhase==='CLB'?'N1':(S.vnPhase==='DES'?'IDLE':'FMC SPD')); else msg('A/T is OFF — VNAV holds speed with pitch, but you must set thrust yourself.');
}
function spdIntvPress(){
  if(!isVnav()){ msg('SPD INTV works only while VNAV is engaged.'); return; }
  S.vn.intv=!S.vn.intv;
  if(S.vn.intv){ const t=S.vnIas||Math.round(S.ias), m=S.mcp; if(m.machMode) m.mach=clamp(+machOf(t,S.alt).toFixed(2),0.6,0.82); else m.spd=clamp(t,100,340); msg('Speed intervention: the IAS/MACH window is open. Set the speed you want; press SPD INTV again to return to the FMC speed.'); }
  else msg('FMC speed restored. The IAS/MACH window is blank.');
}

/* pressing the ALT INTV switch (FCOM 4.10.10-4.10.11) */
function altIntvPress(){
  if(!isVnav()){ msg('ALT INTV works only while VNAV is engaged.'); return; }
  const m=S.mcp, ai=altInd(), crz=crzAltFt(), cons=routeAhead(60).filter(it=>!it.disco&&it.alt);
  const setCrz=a=>{ e.perf.crzAlt=formatAltitude(a); };
  if(S.vnAltHold){ if(m.alt>ai+100){ S.vnAltHold=false; msg('ALT INTV: the VNAV climb resumes toward the MCP altitude.'); } else msg('ALT INTV: set the MCP altitude above the present altitude first.'); return; }
  if(S.vnPhase==='CLB'){
    const c=cons.filter(it=>it.alt.alt<m.alt).sort((a,b)=>a.alt.alt-b.alt.alt)[0];
    if(c){ c.l.altDel=true; msg('ALT INTV: the '+fixName(c.l)+' altitude constraint is deleted.'); }
    else if(crz!=null&&m.alt>crz){ setCrz(m.alt); msg('ALT INTV: cruise altitude reset to '+formatAltitude(m.alt)+'.'); }
    else msg('ALT INTV: there is no altitude constraint below the MCP altitude.');
  } else if(S.vnPhase==='CRZ'){
    if(crz!=null&&m.alt>crz+50){ setCrz(m.alt); S.vnPhase='CLB'; msg('ALT INTV: cruise climb to '+formatAltitude(m.alt)+'.'); }
    else if(m.alt<ai-100){ S.vnEarly=true; S.vnPhase='DES'; msg('ALT INTV: early descent, -1000 fpm to the path or the MCP altitude.'); }
    else msg('ALT INTV: set the MCP altitude above or below the current cruise altitude first.');
  } else {
    const c=cons.filter(it=>it.alt.alt>m.alt).sort((a,b)=>b.alt.alt-a.alt.alt)[0];
    if(c){ c.l.altDel=true; msg('ALT INTV: the '+fixName(c.l)+' altitude constraint is deleted.'); if(!cons.some(it=>it!==c&&it.alt.alt>m.alt)) msg('ALT INTV: all constraints above the MCP altitude are deleted: VNAV SPD descent.'); }
    else msg('ALT INTV: there is no altitude constraint above the MCP altitude.');
  }
}
