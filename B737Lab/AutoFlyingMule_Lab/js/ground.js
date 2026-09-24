'use strict';
/* Ground operations: takeoff roll, rotation and liftoff, radio altitude, landing (manual and autoland), rollout, autobrake.
   FCOM 4.20.11–4.20.14 (takeoff), 4.20.21–4.20.25 (approach and landing), 14.20.5 (autobrake). */
const KT_FPS=1.688;

/* ---- runways ---- */
function oppositeRunway(id){ const m=/^RW(\d\d)([LRCB ]?)$/.exec(id); if(!m) return null; const n=((+m[1]+17)%36)+1, side=m[2]==='L'?'R':(m[2]==='R'?'L':m[2]); return 'RW'+String(n).padStart(2,'0')+side; }
function runwayInfo(apt,id){
  const A=db.airports[apt]; if(!A) return null; const r=A.runways.find(x=>x.id===id); if(!r) return null;
  const opp=A.runways.find(x=>x.id===oppositeRunway(id)); const mv=magVarAt(r,A.elevation||0);
  const hdgT=opp?bearing(r,opp):wrap360(r.course+mv);
  return {apt,id,lat:r.lat,lon:r.lon,lenFt:r.length,elev:A.elevation||0,hdgT,hdgM:wrap360(hdgT-mv),opp:opp||null};
}
/* the runway the airplane is over, if any: within 0.5 NM of the centerline and 15° of its heading */
function runwayUnder(){
  let best=null;
  for(const apt in db.airports){ const A=db.airports[apt]; if(distance(S,A)>8) continue;
    for(const r of A.runways){ const info=runwayInfo(apt,r.id); if(!info) continue; if(Math.abs(wrap180(S.hdg-info.hdgT))>15) continue;
      const p=llXY(S,info), ux=Math.sin(info.hdgT*D2R), uy=Math.cos(info.hdgT*D2R), along=(p.x*ux+p.y*uy)*6076, right=(p.x*uy-p.y*ux)*6076;
      if(Math.abs(right)<0.5*6076&&along>-1500&&along<info.lenFt+500){ const d=Math.abs(right); if(!best||d<best.d) best={info,along,right,d}; } } }
  return best;
}

/* ---- radio altitude: height above the field under the airplane ---- */
function updateField(){ S.fieldElev=groundElevAt(S); }
const raNow=()=>S.gnd?0:Math.max(0,S.alt-(S.fieldElev==null?groundElevAt(S):S.fieldElev));

/* ---- FMC data for the takeoff ---- */
function takeoffSpeeds(){
  try{ const p=e.perf, num=x=>(/^\d{2,3}$/.test(String(x||''))?+x:null);
    let v1=num(p.v1), vr=num(p.vr), v2=num(p.v2);
    if(v1==null||vr==null||v2==null){ const sug=(typeof suggestedSpeeds==='function')?suggestedSpeeds():{}; v1=v1||num(sug.v1); vr=vr||num(sug.vr); v2=v2||num(sug.v2); }
    return {v1,vr,v2}; }catch(err){ return {v1:null,vr:null,v2:null}; }
}
function takeoffN1(){
  try{ const ref=referenceN1({mode:e.perf.n1||'TO',pressureAltitude:(e.perf.takeoffPA!=null?e.perf.takeoffPA:(S.fieldElev||0)),oat:+(e.perf.oat||15),assumedTemp:e.perf.assumedTemp||''}); if(ref&&ref.available) return ref.value; }catch(err){}
  return null;
}
function thrustReductionAgl(){ try{ const n=parseInt(String(e.perf.thrReduction||'1000FT'),10); return Number.isFinite(n)?clamp(n,800,9999):1000; }catch(err){ return 1000; } }
/* the N1 limit the A/T N1 mode holds: takeoff, climb or go-around */
function n1LimitNow(){ if(S.limitMode==='TO'&&S.to&&S.to.n1) return S.to.n1; if(S.limitMode==='GA') return gaLimitN1(); return clbN1(); }

/* ---- takeoff ---- */
function takeoffStart(){
  const m=S.mcp; if(!S.engOn||S.n1<20){ msg('The engines are not running: push Quick ENG Start first.'); return; }
  if(!(m.fdL&&m.fdR)){ msg('TO/GA takeoff needs both F/D switches ON.'); return; }
  const rwSel=e.active&&e.active.runway; if(S.gnd&&S.ias<1&&rwSel&&rwSel!==S.rwyId&&e.scenario){ const R=runwayInfo(e.scenario.origin,rwSel); if(R){ S.rwyId=R.id; S.lat=R.lat; S.lon=R.lon; S.alt=R.elev; S.fieldElev=R.elev; S.hdg=R.hdgT; S.hdgU=R.hdgT; S.hdgHold=R.hdgT; msg('Lined up on runway '+R.id.replace('RW','')+' (the FMC departure runway).'); } }
  { const P=e.perf; if(!(/^\d{2,3}$/.test(P.v1||'')&&/^\d{2,3}$/.test(P.vr||'')&&/^\d{2,3}$/.test(P.v2||''))||P.vSpeedsOff){ msg('NO V SPD: set VSPDS ON and enter V1, VR and V2 on TAKEOFF REF before takeoff.'); return; } }
  const sp=takeoffSpeeds(); if(sp.vr==null){ msg('Takeoff speeds (V1, VR, V2) are not available: complete FMC PERF INIT and TAKEOFF REF first.'); return; }
  S.to={active:true,v1:sp.v1,vr:sp.vr,v2:sp.v2,t0:S.t,n1:takeoffN1()||FMC_N1.goAroundN1(S.fieldElev||0,15)};
  S.limitMode='TO'; S.gaPhase=0; S.hdgDir=0; S.stopped=false; S.flapRetracted=false;
  setMode('pitch','TO/GA'); setMode('roll','HDG SEL'); S.vnavOn=false;
  if(S.atArm) setAT('N1'); else msg('A/T is OFF: set takeoff thrust with the thrust levers.');
  S.cfg.abDisarm=false;
}
/* takeoff-mode events after liftoff: LNAV at 50 ft, VNAV at 400 ft, THR HLD, A/T ARM at 800 ft, automatic thrust reduction */
function takeoffAir(ra){
  const s=S; if(!s.to||!s.to.active) return;
  if(s.arm.lnav&&ra>=50){ s.arm.lnav=false; const why=lnavCheck(); if(!why) setMode('roll','LNAV'); else msg(why); }
  if(s.arm.vnav&&ra>=400){ s.arm.vnav=false; vnavPress(); }
  if(s.modes.at==='THR HLD'&&ra>=800) setMode('at','ARM');
  if(s.limitMode==='TO'&&ra>=thrustReductionAgl()&&s.atArm){ s.limitMode='CLB'; if(['ARM','THR HLD'].includes(s.modes.at)) setAT('N1'); }
  if(ra>400&&s.modes.pitch!=='TO/GA'&&s.to.active) s.to.active=false;         /* another pitch mode above 400 ft ends the takeoff mode */
}

/* ---- ground roll ---- */
function groundStep(dt){
  const s=S, to=s.to, c=s.cfg, wKg=weightKg();
  const n1to=(to&&to.n1)||95;
  let a=(s.n1-25)/(n1to-25)*(4.8-0.011*s.ias)*clamp(62000/wKg,0.7,1.3);        /* kt/s from thrust */
  a=Math.max(a,0); if(s.gs>1) a-=0.25;                                           /* rolling resistance */
  if(!to&&!s.rollout&&s.n1<40&&s.gs<3) a=0;                                     /* parked: brakes set at idle thrust */
  const hw=windComp(s.hdg).head;                                                 /* the airplane accelerates over the ground; airspeed = ground speed + headwind */
  let dec=0;
  if(s.rollout&&!to){
    const A=CFG.autobrakeDecel[c.ab]||0, spd=(c.sbPos>0.9?CFG.groundSpoilerDecel:0)/KT_FPS;
    if(s.brakePedal){ dec=8/KT_FPS; if(A&&!c.abDisarm){ c.abDisarm=true; } }
    else if(A&&!c.abDisarm&&s.lever<0.05){ dec=Math.max(A/KT_FPS,spd); }       /* autobrake holds the selected deceleration */
    else dec=spd+0.3/KT_FPS*1.0;
    if(A&&!c.abDisarm&&s.lever>=0.05&&s.t-s.tdT>3){ c.abDisarm=true; }           /* thrust levers advanced: autobrake disarms */
  }
  const dec2=dec*1;
  s.gs=Math.max(0,s.gs+(a-dec2)*dt); if(s.rollout&&s.gs<0.5) s.gs=0;
  s.ias=(s.gs<0.5&&!(to&&to.active))?0:Math.max(0,s.gs+hw); s.tas=s.ias; s.trk=s.hdg; s.mach=s.ias/661;
  xyMove(s,s.gs/3600*dt*Math.sin(s.hdg*D2R),s.gs/3600*dt*Math.cos(s.hdg*D2R)); s.odo+=s.gs/3600*dt;
  s.bank=0; s.vs=0; s.vsCmd=0; s.fdRoll=0; s.acc=(a-dec2);
  if(s.fieldElev!=null) s.alt=s.fieldElev;
  if(to&&to.active){
    s.fdPitch=s.ias<60?-10:15; const want=(s.ias>=to.vr)&&(followFD||s.ctl.pitch>0.15);
    if(want||s.pitchA>0.5) s.pitchA+=clamp((want?15:0)-s.pitchA,-3*dt,3*dt);
    if(s.ias>=84&&s.modes.at==='N1'&&s.atArm) setMode('at','THR HLD');
    if(!to.v1called&&to.v1&&s.ias>=to.v1){ to.v1called=true; playSfx('v1'); }
    if(s.ias>=to.vr&&s.pitchA>=8){ s.gnd=false; s.rollout=false; to.lift=s.t; s.vs=250; s.pI=1500; s.alt=(s.fieldElev||s.alt)+1; msg('Liftoff. Gear up when a positive rate of climb is established.'); }
    return;
  }
  if(s.rollout){ s.pitchA+=clamp(0-s.pitchA,-2.5*dt,2.5*dt);
    if(!s.stopped&&s.gs<=0){ s.stopped=true; s.rollout=false; c.abLight=0; msg('The airplane has stopped on the runway. '+(s.report||'')+' Load a new situation to fly again.'); } }
}

/* ---- touchdown ---- */
function touchdown(){
  const s=S, vs=s.vs, c=s.cfg, m0=s.mcp;
  s.tdVs=vs; s.gnd=true; s.rollout=true; s.tdT=s.t; s.pitchA=Math.max(s.pitchA,2); s.vs=0; s.bank=0; if(s.fieldElev!=null) s.alt=s.fieldElev;
  const u=runwayUnder(); s.tdInfo=u;
  if(u){ const k=Math.abs(wrap180(s.hdg-u.info.hdgT)); s.hdg=u.info.hdgT; }
  if(c.gearPos<0.99){ s.crashed=true; msg('Gear-up landing: not a survivable landing.'); return; }
  let txt='Touchdown'+(u?' on '+u.info.id.replace('RW','runway ')+' '+Math.round(u.along)+' ft from the threshold, '+Math.abs(Math.round(u.right))+' ft '+(u.right<0?'left':'right')+' of the centerline':' with no runway under the airplane')+', '+Math.round(Math.abs(vs))+' fpm.';
  if(Math.abs(vs)>600) txt+=' Hard landing.';
  if(S.wind.spd>0){ const wc=windComp(s.hdg); txt+=' Wind '+String(Math.round(S.wind.dir)).padStart(3,'0')+'°/'+Math.round(S.wind.spd)+' kt: '+(wc.head>=0?'headwind ':'tailwind ')+Math.round(Math.abs(wc.head))+', crosswind '+Math.round(Math.abs(wc.cross))+' kt from the '+(wc.cross>=0?'right':'left')+'.'; }
  msg(txt); s.report=txt; const st=$q('#sitstatus'); if(st) st.textContent=txt;
  if(c.sbSel===1) c.sbSel=3;                                   /* speed brake armed: ground spoilers deploy */
  s.atOffT=s.t+2;                                               /* the A/T disengages about 2 seconds after touchdown */
  if(s.flareEngaged&&s.landVariant==='FO'&&m0.ap&&m0.ap2) setMode('roll','ROLLOUT');
  s.flareEngaged=false;
}

/* ---- landing: second autopilot, FLARE armed, A/T retard, flare, ROLLOUT (FCOM 4.20.21–4.20.25) ---- */
function landingLogic(dt){
  const s=S, m=s.mcp, ra=raNow(), A=s.app; s.ra=ra;
  /* the second autopilot couples after LOC and G/S capture, below 1500 ft RA */
  if(A.locCap&&A.gsCap&&s.ap2Armed&&!m.ap2&&ra<1500&&ra>=800-0){ m.ap2=true; s.ap2Armed=false; s.flareArmed=true; s.rolloutArmed=(s.landVariant==='FO'); s.autolandTestT=s.t+3; msg(''); }
  else if(A.locCap&&A.gsCap&&s.ap2Armed&&!m.ap2&&ra<800){ s.ap2Armed=false; msg('The second autopilot was not engaged by 800 ft RA: single-channel approach, no autoland.'); }
  if(m.ap2&&!s.flareArmed&&ra<350){ apDisc('FLARE was not armed by 350 ft RA: both autopilots disengaged.'); }
  if(s.landVariant==='FO'&&m.ap2&&ra<520&&!s.landStat) s.landStat='LAND 3';
  if(s.landVariant==='FO'&&!m.ap2&&A.gsCap&&ra<520&&!s.landStat&&s.autolandNeeded) s.landStat='NO AUTOLAND';
  if(m.ap&&m.ap2&&s.flareArmed&&ra<=50&&!s.flareEngaged){ s.flareEngaged=true; setMode('pitch','FLARE'); }
  if(s.flareEngaged&&ra<=27&&s.atArm&&['MCP SPD','FMC SPD'].includes(s.modes.at)) setMode('at','IDLE');
  if(s.flareEngaged&&s.landVariant==='FO'&&ra<=2&&s.modes.roll!=='ROLLOUT') setMode('roll','ROLLOUT');
}
const flareVs=ra=>-((Math.max(ra,0)+3)/4.0)*60;      /* exponential flare, time constant 4 s; touchdown at about -45 fpm */

/* ---- audio callouts (assets/autocall): radio-altitude calls on approach, minimums, V1 ---- */
const SFX={}; const SFX_FILES={ra2500:'2500ft',ra1000:'1000ft',ra500:'500ft',ra100:'100-boeing-gpws',ra50:'50-boeing-gpws',ra40:'40-boeing-gpws',ra30:'30-boeing-gpws',ra20:'20-boeing-gpws',ra10:'10-boeing-gpws',appmin:'appmin',min:'min',v1:'v1'};
function playSfx(k){ try{ if(typeof simSpeed!=='undefined'&&simSpeed>4) return; const f=SFX_FILES[k]; if(!f) return; const a=SFX[k]||(SFX[k]=new Audio('assets/autocall/'+f+'.mp3')); a.currentTime=0; const p=a.play(); if(p&&p.catch) p.catch(()=>{}); }catch(err){} }
/* thresholds are called once when the airplane descends through them with the landing gear or landing flaps selected */
function autocalls(ra){
  const s=S, prev=s.raPrev==null?ra:s.raPrev; s.raPrev=ra; if(!s.calls) s.calls={};
  const cfg=s.cfg, appr=cfg.gearSel===1||cfg.flapSel>=15;
  if(ra>2600) s.calls={};
  if(!appr||s.vs>-100) return;
  for(const [h,k] of [[2500,'ra2500'],[1000,'ra1000'],[500,'ra500'],[100,'ra100'],[50,'ra50'],[40,'ra40'],[30,'ra30'],[20,'ra20'],[10,'ra10']]){
    if(prev>h&&ra<=h&&!s.calls[k]){ s.calls[k]=1; playSfx(k); } }
  /* minimums: the reference selected on the EFIS (radio or barometric) */
  const mv=EF.minsRef==='RADIO'?EF.minsRadio:EF.minsBaro, cur=EF.minsRef==='RADIO'?ra:altInd();
  if(mv>0){ if(cur>mv+150) { s.calls.appmin=0; s.calls.min=0; }
    if(cur<=mv+100&&cur>mv&&!s.calls.appmin&&!s.calls.min){ s.calls.appmin=1; playSfx('appmin'); }
    if(cur<=mv&&!s.calls.min){ s.calls.min=1; s.calls.appmin=1; playSfx('min'); } }
}
