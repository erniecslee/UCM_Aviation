'use strict';
/* Flight state, AFDS (autopilot flight director) and autothrottle logic, and the simplified energy model.
   Mode logic follows the 737NG FCOM Chapter 4 (Automatic Flight). */
let S, WIN=300, paused=false, simSpeed=1, msgT=0, followFD=true;

/* EFIS control panel state (FCOM 10.15) */
const RANGES=[5,10,20,40,80,160,320,640], MODES=['APP','VOR','MAP','PLN'];
const EF={range:80,mode:2,ctr:0,minsRef:'RADIO',minsRadio:200,minsBaro:1260,qnh:29.92,std:false,hpa:false,mtrs:false,fpv:false,vor1:0,vor2:0,
  sw:{wxr:0,sta:0,wpt:0,arpt:0,data:0,pos:0,terr:0,tfc:0}};
const baroOff=()=>EF.std?0:(EF.qnh-29.92)*1000;

/* performance placeholders that the FMC will replace step by step */
/* thrust model: N1 values come from the FCOM 737-800/CFM56-7B26 tables (fmc-n1.js), weight from the FMC */
const weightKg=()=>S.weightKg||62000;
const cfgN1=()=>configDragN1();                             /* extra N1 needed to overcome flap / gear / speedbrake drag (control stand, see config.js) */
const req=(v,alt)=>FMC_N1.levelFlightN1(weightKg(),alt,v)+cfgN1();     /* N1 needed for level flight at IAS v */
const satNow=()=>FMC_N1.isaTempC(S.alt);
const maxN1=()=>FMC_N1.maxClimbN1(S.alt,FMC_N1.tatC(S.alt,Math.max(S.mach||0.2,0.2),0));   /* max climb thrust limit (PI.30.43) */
const gaLimitN1=()=>FMC_N1.goAroundN1(Math.max(0,groundElevAt(S)),FMC_N1.isaTempC(groundElevAt(S)));   /* go-around limit (PI.30.44) */
const altInd=()=>S.alt+baroOff();
function tgtSpd(alt){ alt=alt==null?S.alt:alt; const m=S.mcp; if(S.vnavOn&&!(S.vn&&S.vn.intv)&&S.vnIas) return S.vnIas; return m.machMode?clamp(iasOfMach(m.mach,alt),100,340):m.spd; }
const clbN1=()=>maxN1();
function setMode(k,v){ if(S.modes[k]!==v){ if(k==='pitch'&&!VN_MODES.includes(v)) S.vnavOn=false; if(k==='pitch'&&(v==='MCP SPD'||v==='VNAV SPD'||v==='TO/GA')) S.tsRef=S.ias; S.modes[k]=v; S.chg[k]=S.t; S.events.push({t:S.t,kind:k,text:v}); } }
function setAT(md){ if(md==='MCP SPD'||md==='FMC SPD'){ const ee=tgtSpd()-S.ias; S.tI=clamp(S.n1-req(tgtSpd(),S.alt)-1.6*ee,-25,25);} if(md==='GA') S.gaCount=Math.max(1,S.gaCount); setMode('at',md); }
function msg(t){ const el=$q('#msg'); if(el) el.textContent=t; msgT=performance.now(); }
/* the autopilot disengage tone (assets/ap-disengage.mp3) sounds until the disengage light is reset (FCOM 4.10.18) */
const AP_TONE=new Audio('assets/ap-disengage.mp3'); AP_TONE.loop=true;
function apToneOn(){ try{ AP_TONE.currentTime=0; const p=AP_TONE.play(); if(p&&p.catch) p.catch(()=>beep(2000)); }catch(err){ beep(2000); } }
function apToneOff(){ try{ AP_TONE.pause(); AP_TONE.currentTime=0; }catch(err){} }
let AC; function beep(ms){ try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); const o=AC.createOscillator(),g=AC.createGain(); o.type='square'; o.frequency.value=780; g.gain.value=.03; o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime+ms/1000); }catch(err){} }

window.WIND=window.WIND||{dir:0,spd:0};      /* wind FROM (degrees magnetic) and speed (kt), the same at every altitude; kept across situations */
function newState(){
  apToneOff();
  S={ctl:{roll:0,pitch:0},manVs:null,to:null,arm:{lnav:false,vnav:false},limitMode:'CLB',landVariant:'FO',ap2Armed:false,flareArmed:false,flareEngaged:false,rolloutArmed:false,landStat:'',rollout:false,brakePedal:false,fieldElev:null,ra:0,atOffT:null,stopped:false,crashed:false,tdT:0,fdShown:true,cfg:cfgNew(0,false),gnd:false,weightKg:62000,t:0,lat:39.2976,lon:-94.7139,alt:3000,ias:220,hdg:90,hdgU:90,bank:0,vs:0,vsCmd:0,lever:0,tI:0,pI:0,holdAlt:3000,hdgHold:90,cwsLevel:false,hdgDir:0,gaPhase:0,gaCount:0,acqAlt:0,
    app:{armed:false,locCap:false,gsCap:false,nav:null},navT:-9,vnavOn:false,vn:{intv:false},vnPhase:'CLB',vnIas:0,legKey:'',legStart:null,holdWarned:false,guide:null,magvar:0,mvT:-99,wind:window.WIND,engOn:true,engStart:false,fuelKg:9000,ffKgh:0,fuelT:0,hold:null,epoch:Date.now(),
    mcp:{spd:250,hdg:90,alt:3000,vs:0,ap:true,apCmd:true,which:'A',fdL:true,fdR:true,machMode:false,mach:0.78,bank:25,crsL:165,crsR:165,discBar:false,ap2:false},atArm:true,master:'A',
    apLight:false,atLight:false,
    modes:{at:'MCP SPD',roll:'HDG SEL',pitch:'ALT HOLD'},chg:{at:-99,roll:-99,pitch:-99},events:[],hist:[],
    acc:0,gs:0,tas:0,trk:90,mach:0,fdPitch:0,fdRoll:0,odo:0,n1:50,n1cmd:50,pitchA:0,lastSample:-9,wheel:0};
  S.magvar=magVarAt(S,S.alt);
  return S;
}
function logInitialModes(){ S.events=[]; for(const k of ['at','roll','pitch']) S.events.push({t:S.t,kind:k,text:S.modes[k]}); }

/* ---- LNAV engagement check (FCOM 4.10.13) ---- */
function lnavCheck(){
  const g=lnavGuide(); if(!g) return 'There is no active FMC route.'; if(g.end) return 'L NAV cannot engage: '+g.end.toLowerCase()+'.';
  if(Math.abs(g.xtkR)<=3) return null;
  if(Math.abs(wrap180(S.hdg-g.course))<=90&&g.along<g.L) return null;
  return 'L NAV cannot engage: outside 3 NM of the route and not on an intercept course of 90° or less.';
}

/* ---- command speed limiting and reversion (FCOM 4.20.42-43): Vmo/Mmo, flap and gear placards, minimum speed (about 1.3 Vs) ---- */
function spdLimits(){ const c=S.cfg; let vmax=Math.min(vfeNow(),0.82*(661-S.alt*0.00245)/(1+S.alt/1000*0.019),340); if(c&&c.gearPos>0.02) vmax=Math.min(vmax,CFG.gearVLE); return {vmax,vmin:cfgMinSpeed()}; }
function limitSpeed(ts,act){
  const s=S, m=s.mcp, L=spdLimits(), vmax=L.vmax, vmin=L.vmin; let out=ts; s.spdSym='';
  const vmoOnly=vmax>=Math.min(340,0.82*(661-s.alt*0.00245)/(1+s.alt/1000*0.019))-0.5;    /* the limit is Vmo/Mmo, not a flap or gear placard */
  /* overspeed: the commanded speed can equal but not exceed the limit; it is held slightly below */
  if(ts>vmax-2){ out=vmax-2; s.spdSym='over'; }
  /* underspeed: latched until a speed 15 kt above minimum is selected; actual speed at or slightly below minimum also triggers it until 5 kt above */
  if(ts<vmin) s.underCmd=true; else if(ts>=vmin+15) s.underCmd=false;
  if(s.ias<=vmin+2) s.underAct=true; else if(s.ias>=vmin+5) s.underAct=false;
  if(s.gnd){ s.underCmd=false; s.underAct=false; }
  const under=s.underCmd||s.underAct; if(under){ out=Math.max(out,vmin+5); s.spdSym='under'; }
  if(!act||s.gnd||s.ra<50) return out;
  const p=s.modes.pitch, at=s.modes.at, atSpeed=['MCP SPD','FMC SPD'].includes(at), afdsSpeedMode=['MCP SPD','VNAV SPD'].includes(p);
  /* placard limit reversion */
  if(s.spdSym==='over'&&s.ias>=vmax-6){
    if(s.atArm&&!atSpeed&&!afdsSpeedMode&&p!==''&&['N1','ARM','GA','IDLE'].includes(at)){ setAT('MCP SPD'); msg('Speed limit: the A/T reverts to SPEED and holds slightly below the limit.'); }
    const idleN1=30+s.alt/1000*0.4+1.5;
    if(vmoOnly&&p==='V/S'&&(s.atArm?(atSpeed&&(s.n1<=idleN1+3||s.ias>=vmax)):true)){ setMode('pitch','MCP SPD'); msg('Vmo/Mmo: V/S reverts to LVL CHG.'); }   /* A/T unavailable: the AFDS takes over speed control */
  }
  /* minimum speed reversion (not with the A/T off in ALT HOLD or after G/S capture, and not in a VNAV PTH level segment) */
  if(under&&s.ias<=vmin+2&&!(s.app.gsCap)&&!(!s.atArm&&p==='ALT HOLD')&&!(s.cfg.flapPos>12.5&&(p==='V/S'||p==='VNAV PTH'))){
    if(p==='V/S'||(p===''&&m.ap)){ setMode('pitch','MCP SPD'); msg('Minimum speed: V/S reverts to LVL CHG.'); }
    else if(p==='VNAV PTH'&&Math.abs(s.vs)>200){ setMode('pitch','MCP SPD'); msg('Minimum speed: VNAV PTH reverts to LVL CHG.'); }
  }
  return out;
}

/* ---- fuel: burn from N1 and density, weight follows; the FMC fuel quantity is updated ---- */
function fuelStep(dt){
  const s=S;
  if(!s.engOn){ s.ffKgh=0; if(s.gnd&&!s.tdT&&typeof fmcWeightKg==='function'){ s.weightKg=fmcWeightKg()||62000; const f=fmcFuelKg(); if(f!=null) s.fuelKg=f; } return; }
  const x=clamp((s.n1-26)/69,0,1), altf=1-0.62*Math.min(Math.max(s.alt,0),40000)/40000, perEng=s.n1<5?0:(350+2650*Math.pow(x,1.8))*altf;
  s.ffKgh=2*perEng; const b=Math.min(s.fuelKg,s.ffKgh*dt/3600); s.fuelKg-=b; s.weightKg-=b;
  if(s.fuelKg<=0&&!s.fuelOutMsg){ s.fuelOutMsg=true; msg('Fuel exhausted: both engines have flamed out.'); }
  if(s.t-s.fuelT>5){ s.fuelT=s.t; try{ e.perf.fuel=(s.fuelKg/453.59237).toFixed(1); }catch(err){} }
}

/* ---- thrust: autothrottle modes and engine spool (shared by the ground and the air) ---- */
function thrustLaw(dt,ts){
  const s=S, am=s.modes.at, idle=s.gnd?26:30+Math.min(s.alt,40000)/1000*0.4; let n1c;   /* flight idle N1 rises with altitude */
  if(am==='MCP SPD'||am==='FMC SPD'){ const ee=ts-s.ias; s.tI=clamp(s.tI+0.03*ee*dt,-25,25); n1c=clamp(req(ts,s.alt)+s.tI+(ee<0?4:1.6)*ee,idle,n1LimitNow()); }
  else if(am==='N1'){ n1c=n1LimitNow(); }
  else if(am==='IDLE'){ n1c=idle; }
  else if(am==='GA'){ const gl=gaLimitN1(); n1c=s.gaCount>=2?gl:clamp(gl-12,idle,gl); }
  else n1c=idle+(s.lever*(95-idle));          /* ARM, THR HLD, OFF: the thrust levers set the thrust */
  s.n1cmd=n1c;
  if(['MCP SPD','FMC SPD','N1','IDLE','GA'].includes(am)){
    if(s.lvHeld){ n1c=idle+s.lever*(95-idle); }                                  /* the pilot's hand overrides the A/T servo while holding the levers */
    else { const tl=(n1c-idle)/(95-idle); s.lever+=clamp(tl-s.lever,-0.4*dt,0.4*dt); }   /* A/T back-drives the levers to the commanded thrust */
  }
  if(!s.engOn||s.fuelKg<=0) n1c=0;
  s.n1cmd=n1c;
  const rate=(s.engStart&&s.n1<idle-0.5)?1.2:6; if(s.engStart&&s.n1>=idle-0.5) s.engStart=false;   /* Quick ENG Start: the engines spool up to idle in about 25 s */
  s.n1+=clamp((n1c-s.n1)/3,-rate,rate)*dt;
}

/* ---- one simulation step ---- */
function step(dt){
  const s=S, m=s.mcp, ctl=s.ctl;
  s.t+=dt; configStep(dt); fuelStep(dt);
  if(s.t-s.mvT>2){ s.mvT=s.t; s.magvar=magVarAt(s,s.alt); }
  s.fieldElev=groundElevAt(s);
  const mv=s.magvar, prevAlt=s.alt;
  if(s.atOffT&&s.t>=s.atOffT){ s.atOffT=null; s.atArm=false; setMode('at','OFF'); }
  /* the control column overrides a CMD autopilot (FCOM 4.20.2: column or wheel force override) */
  if(m.ap&&m.apCmd&&(Math.abs(ctl.roll)>0.5||Math.abs(ctl.pitch)>0.5)){ apDisc('A/P disengaged: control column force.'); }
  const manualRoll=Math.abs(ctl.roll)>0.04&&!(m.ap&&m.apCmd), manualPitch=Math.abs(ctl.pitch)>0.04&&!(m.ap&&m.apCmd);
  /* the flight director bars retract at 50 ft RA on an ILS approach unless the autoland flare is engaged (FCOM 4.20.3) */
  const fdBars=(m.fdL||m.fdR)&&!(s.app.gsCap&&raNow()<=50&&!s.flareEngaged&&!(m.ap&&m.ap2));
  const act=m.ap||(fdBars&&followFD);
  s.fdShown=m.fdL&&fdBars&&!(s.gnd&&!(s.to&&s.to.active));      /* on the ground the bars appear only after TO/GA */
  /* ---------------- ground ---------------- */
  if(s.gnd){
    s.mach=s.ias/661; if(s.t-s.navT>0.5){ s.navT=s.t; navUpdate(); }
    thrustLaw(dt,s.ias);
    if(s.rollout&&s.modes.at==='IDLE') { /* A/T retard ends at idle */ }
    groundStep(dt);
    if(s.t-s.lastSample>=0.5){ s.lastSample=s.t; s.hist.push({t:s.t,alt:altInd(),ias:s.ias,vs:0,vsCmd:0,n1:s.n1,n1c:s.n1cmd,hdgU:s.hdgU,hBug:s.hdgU+wrap180(toTrue(m.hdg,mv)-s.hdg),mAlt:m.alt,mSpd:tgtSpd()}); if(s.hist.length>2400) s.hist.shift(); }
    return;
  }
  /* ---------------- airborne ---------------- */
  const ra=raNow(); s.ra=ra;
  s.tas=tasOf(s.ias,s.alt); s.mach=s.tas/sonic(s.alt);
  if(!m.machMode && prevAlt<26000 && s.alt>=26000){ m.mach=clamp(+machOf(m.spd,s.alt).toFixed(2),0.6,0.82); m.machMode=true; }
  else if(m.machMode && prevAlt>=26000 && s.alt<26000){ m.spd=clamp(Math.round(tgtSpd(prevAlt)),100,340); m.machMode=false; }
  if(s.t-s.navT>0.5){ s.navT=s.t; navUpdate(); }
  takeoffAir(ra); landingLogic(dt); autocalls(ra);
  const ag=act?appGuide(dt,act):null;
  let vnG=null; if(act&&s.vnavOn&&isVnav()) vnG=vnavGuide(dt);
  let ts=vnG?vnG.ts:tgtSpd();
  if(s.to&&s.to.active&&s.modes.pitch==='TO/GA') ts=m.spd+20;      /* takeoff: MCP speed (normally V2) + 20 kt */
  ts=limitSpeed(ts,act);
  /* lateral */
  let hdgCmd=null, bankCmd=0, lim=m.bank; s.guide=null;
  if(s.to&&s.to.active&&ra<400) lim=Math.min(lim,8);                 /* bank limit 8° below 400 ft in the takeoff mode */
  if(act){
    const rm=s.modes.roll;
    if(ag&&ag.hdgCmd!=null){ lim=30; hdgCmd=ag.hdgCmd; }
    else if(rm==='LNAV'){
      const g=lnavGuide();
      if(!g||g.end){ setMode('roll',''); msg('LNAV disengaged'+(g&&g.end?': '+g.end.toLowerCase():'')+'. Roll mode is CWS R.'); }
      else{ lim=30; s.guide=g; hdgCmd=g.heading?g.course:trkToHdg(wrap360(g.course-clamp(g.xtkR*15,-45,45)));
        if(g.toGo<g.lead){ if(!sequenceLeg()){ const r=actRoute(), n=r&&r.legs[r.index]; setMode('roll',''); msg('LNAV disengaged at the end of the flyable route'+(n?' ('+(n.disco?'discontinuity':fixName(n))+')':'')+'. Roll mode is CWS R.'); } }
      }
    } else if(rm==='HDG SEL'){ hdgCmd=toTrue(m.hdg,mv); }
    if(s.modes.roll===''&&!(ag&&ag.hdgCmd!=null)){ if(Math.abs(s.bank)<=6){ if(!s.cwsLevel){ s.hdgHold=s.hdg; s.cwsLevel=true; } hdgCmd=s.hdgHold; } else { s.cwsLevel=false; bankCmd=s.bank; } }
    else s.cwsLevel=false;
    if(hdgCmd!=null){ let err=wrap180(hdgCmd-s.hdg);
      if(s.hdgDir && s.modes.roll==='HDG SEL' && Math.abs(err)>1){ const de=s.hdgDir>0?wrap360(hdgCmd-s.hdg):-wrap360(s.hdg-hdgCmd); if(Math.abs(de)>180) err=de; else s.hdgDir=0; }   /* the turn follows the knob direction; the shorter way when the knob moved less than 180 */
      bankCmd=clamp(err*1.3,-lim,lim); }
  }
  if(manualRoll){ bankCmd=ctl.roll*30; s.cwsLevel=false; }                  /* pilot input: the wheel commands the bank */
  else if(!act) bankCmd=Math.abs(s.bank)<=6?0:s.bank;                        /* nobody flying the roll axis: wings level, or hold a steeper bank */
  s.bank+=clamp((bankCmd-s.bank),-5,5)*dt; s.fdRoll=bankCmd-s.bank;
  const hr=1091*Math.tan(s.bank*D2R)/s.tas; s.hdg=wrap360(s.hdg+hr*dt); s.hdgU+=hr*dt;
  const wv=windVec(), vx=s.tas*Math.sin(s.hdg*D2R)+wv.e, vy=s.tas*Math.cos(s.hdg*D2R)+wv.n;
  s.gs=Math.hypot(vx,vy); s.trk=wrap360(Math.atan2(vx,vy)/D2R);
  xyMove(s,vx/3600*dt,vy/3600*dt); s.odo+=s.gs/3600*dt;
  /* vertical: the pitch speed reference moves to the target at 2 kt/s, so a large speed error does not command a dive */
  if(s.tsRef==null) s.tsRef=s.ias; s.tsRef+=clamp(ts-s.tsRef,-2*dt,2*dt);
  let vc=s.vs; const spdHold=()=>{ const ee=s.ias-s.tsRef; s.pI=clamp(s.pI+25*ee*dt,-5000,4500); const v=clamp(s.pI+350*ee,-5000,4500); return s.ias>ts+3?Math.min(v,-500):v; };   /* decelerating: no climb, at least 500 fpm down */
  if(s.flareEngaged&&m.ap){ vc=flareVs(ra); }
  else if(ag&&ag.vc!=null){ vc=ag.vc; }
  else if(vnG){ vc=vnG.vc; }
  else if(act){
    let p=s.modes.pitch;
    if(p==='V/S'||p==='MCP SPD'||p===''||p==='TO/GA'){
      const d=(m.alt-baroOff())-s.alt;
      if(d*s.vs>0 && Math.abs(d)<Math.max(Math.abs(s.vs)/5.5,80)){ s.holdAlt=m.alt-baroOff(); s.acqAlt=m.alt; setMode('pitch','ALT ACQ'); p='ALT ACQ'; if(s.to) s.to.active=false;
        if(s.atArm && ['ARM','N1','GA','IDLE','THR HLD'].includes(s.modes.at)) setAT('MCP SPD'); }
    }
    if(p==='V/S') vc=m.vs;
    else if(p==='MCP SPD') vc=spdHold();
    else if(p==='TO/GA'){ if(s.gaPhase===0){ vc=2600; if(s.vs>1900){ s.gaPhase=1; s.pI=s.vs; s.tsRef=s.ias; } } else vc=spdHold(); }
    else if(p==='ALT ACQ'||p==='ALT HOLD'){ const d=s.holdAlt-s.alt; vc=clamp(d*6,-3000,3000);
      if(p==='ALT ACQ'){ if(Math.abs(d)<25&&Math.abs(s.vs)<250) setMode('pitch','ALT HOLD');
        else if(Math.abs(m.alt-s.acqAlt)>100){ m.vs=clamp(Math.round(s.vs/100)*100,-7900,6000); setMode('pitch','V/S'); if(s.atArm&&['N1','IDLE'].includes(s.modes.at)) setAT('MCP SPD'); } } }
  }
  if(manualPitch){ if(s.manVs==null) s.manVs=s.vs; s.manVs=clamp(s.manVs+ctl.pitch*1500*dt,-6000,5000); vc=s.manVs; s.pI=s.vs; }
  else s.manVs=null;
  s.vsCmd=vc; s.fdPitch=clamp((vc-s.vs)/300,-12,12);
  const tau=s.flareEngaged?1.2:(manualPitch?1.8:3.5);
  s.vs+=clamp((vc-s.vs)/tau,-1500,1500)*dt; s.alt+=s.vs/60*dt;
  const gam=s.vs/60/(s.tas*1.688);
  s.pitchA=Math.atan(gam)/D2R+clamp(2.5+(250-s.ias)*0.04,0,10);
  /* touchdown */
  if(s.alt-(s.fieldElev==null?0:s.fieldElev)<=0&&s.vs<0&&s.fieldElev!=null&&s.t>3){ touchdown(); return; }
  /* thrust */
  thrustLaw(dt,ts);
  const a=0.07*(1-0.45*clamp(s.alt/35000,0,1.15))*(s.n1-req(s.ias,s.alt))-19.08*gam;   /* thrust effect per N1 % falls with altitude */
  s.acc+=(a-s.acc)*Math.min(1,dt/1.5); s.ias=clamp(s.ias+a*dt,60,360);
  if(s.t-s.lastSample>=0.5){ s.lastSample=s.t;
    s.hist.push({t:s.t,alt:altInd(),ias:s.ias,vs:s.vs,vsCmd:vc,n1:s.n1,n1c:s.n1cmd,hdgU:s.hdgU,hBug:s.hdgU+wrap180(toTrue(m.hdg,mv)-s.hdg),mAlt:m.alt,mSpd:ts});
    if(s.hist.length>2400) s.hist.shift(); }
}
/* reserved: wind is not simulated yet (constant-zero wind, interface in place for the next round) */
function windVec(){ const w=S.wind, d=(toTrue(w.dir,S.magvar)+180)*D2R; return {e:w.spd*Math.sin(d),n:w.spd*Math.cos(d)}; }
/* wind components along and across a heading (true): head + tail, cross + from the right */
function windComp(hdgT){ const wv=windVec(), h=hdgT*D2R; return {head:-(wv.e*Math.sin(h)+wv.n*Math.cos(h)),cross:-(wv.e*Math.cos(h)-wv.n*Math.sin(h))}; }
/* heading that produces a wanted ground track in this wind (wind correction angle) */
function trkToHdg(trk){ const w=S.wind; if(!w||!w.spd||S.tas<50) return trk; const wv=windVec(), t=trk*D2R, wr=wv.e*Math.cos(t)-wv.n*Math.sin(t);   /* wind toward the right of the track */
  return wrap360(trk-Math.asin(clamp(wr/S.tas,-0.7,0.7))/D2R); }

function atLabel(){ const a=S.modes.at;
  if(a==='IDLE') return S.lever>0.03?'RETARD':'ARM';
  return {'MCP SPD':'MCP SPD','FMC SPD':'FMC SPD','N1':'N1','GA':'GA','THR HLD':'THR HLD','ARM':'ARM','OFF':''}[a]; }
const vsArmed=()=>S.modes.pitch==='ALT HOLD'&&Math.abs(S.mcp.alt-baroOff()-S.holdAlt)>100;

/* ---- MCP switch logic ---- */
const KN={spd:{min:100,max:340,step:1,big:10},hdg:{min:0,max:359,step:1,big:10,wrap:1},alt:{min:0,max:50000,step:100,big:1000},crsL:{min:0,max:359,step:1,big:10,wrap:1},crsR:{min:0,max:359,step:1,big:10,wrap:1}};
function bump(k,dir,big){
  const m=S.mcp;
  if(k==='vs'){
    if(S.modes.pitch!=='V/S'){ if(vsArmed()){ m.vs=0; setMode('pitch','V/S'); pitchAt('speed'); } else { msg('The V/S window is blank until V/S mode is engaged — press V/S first.'); return; } }
    const cv=m.vs, stp=(Math.abs(cv)>=1000&&!(cv===1000&&dir<0)&&!(cv===-1000&&dir>0))?100:50, nv=cv+dir*(big?500:stp), q=Math.abs(nv)<1000?50:100;
    m.vs=clamp(Math.round(nv/q)*q,-7900,6000); S.wheel+=dir; return; }
  if(k==='mins'){ if(EF.minsRef==='RADIO') EF.minsRadio=clamp(EF.minsRadio+dir*(big?100:10),0,2500); else EF.minsBaro=clamp(EF.minsBaro+dir*(big?100:10),-1000,15000); spinKnob('mins',dir*12); return; }
  if(k==='baro'){ if(EF.hpa) EF.qnh=clamp(+(EF.qnh+dir*0.02953*(big?10:1)).toFixed(3),28.0,31.0); else EF.qnh=clamp(+(EF.qnh+dir*(big?0.1:0.01)).toFixed(2),28.0,31.0); EF.std=false; spinKnob('baro',dir*12); return; }
  if(/^n[12][mk]$/.test(k)){ tuneStep(+k[1]-1,k[2]==='m'?'mhz':'khz',dir); spinKnob(k,dir*(k[2]==='m'?12:20)); return; }
  const c=KN[k];
  if(k==='spd'&&m.machMode){ m.mach=clamp(+(m.mach+dir*(big?0.05:0.01)).toFixed(2),0.6,0.82); spinKnob('spd',dir*14); return; }
  const v=m[k]+dir*(big?c.big:c.step); m[k]=c.wrap?wrap360(v):clamp(v,c.min,c.max);
  if(k==='hdg'&&S.modes.roll==='HDG SEL') S.hdgDir=dir;
  spinKnob(k,dir*({spd:14,hdg:6,alt:10,crsL:6,crsR:6}[k]));
}
function apDisc(reason){ const m=S.mcp; if(!m.ap) return; m.ap=false; m.ap2=false; S.ap2Armed=false; S.flareArmed=false; S.rolloutArmed=false; S.apLight=true; apToneOn(); if(reason) msg(reason); }
function atDisc(reason){ if(S.modes.at==='OFF'&&!S.atArm){ S.atLight=false; return; } S.atArm=false; setMode('at','OFF'); S.atLight=true; beep(1000); if(reason) msg(reason); }
function pitchAt(kind){ if(!S.atArm) return; if(kind==='speed'){ if(['ARM','N1','GA','IDLE','FMC SPD'].includes(S.modes.at)) setAT('MCP SPD'); } }
function press(a){
  const m=S.mcp;
  switch(a){
    case 'atarm': if(S.atArm) atDisc(); else { S.atArm=true; if(S.modes.at==='OFF') setMode('at','ARM'); } break;
    case 'n1': if(!S.atArm){msg('A/T is OFF — set the A/T ARM switch to ARM first.');break;} if(S.modes.at==='N1') setMode('at','ARM'); else setAT('N1'); break;
    case 'spd': if(!S.atArm){msg('A/T is OFF — set the A/T ARM switch to ARM first.');break;} if(S.modes.at==='MCP SPD') setMode('at','ARM'); else setAT('MCP SPD'); break;
    case 'co': if(m.machMode){ m.spd=clamp(Math.round(tgtSpd()),100,340); m.machMode=false; } else { m.mach=clamp(+machOf(tgtSpd(),S.alt).toFixed(2),0.6,0.82); m.machMode=true; } break;
    case 'lvl':
      if(S.app.gsCap){ msg('LVL CHG is inhibited after glideslope capture.'); break; }
      if(Math.abs(m.alt-baroOff()-S.alt)<250){msg('LVL CHG inhibited: select an MCP altitude at least 250 ft away from the airplane.');break;}
      if(S.modes.pitch==='ALT HOLD'&&!vsArmed()){msg('LVL CHG is inhibited until a new MCP altitude is selected.');break;}
      if(!['MCP SPD','FMC SPD'].includes(S.modes.at)){ if(m.machMode) m.mach=clamp(+machOf(S.ias,S.alt).toFixed(2),0.6,0.82); else m.spd=clamp(Math.round(S.ias),100,340); }
      S.pI=S.vs; setMode('pitch','MCP SPD');
      if(S.atArm) setAT(m.alt-baroOff()>S.alt?'N1':'IDLE'); else msg('A/T is OFF — LVL CHG holds speed with pitch, but you must set thrust yourself.'); break;
    case 'vs':
      if(S.app.gsCap){ msg('V/S is inhibited after glideslope capture.'); break; }
      if(S.modes.pitch==='ALT HOLD'&&!vsArmed()){msg('V/S is inhibited: ALT HOLD is holding the selected MCP altitude. Select a new MCP altitude first.');break;}
      m.vs=clamp(Math.round(S.vs/100)*100,-7900,6000); setMode('pitch','V/S'); pitchAt('speed'); break;
    case 'alth': if(S.app.gsCap){ msg('ALT HOLD is inhibited after glideslope capture.'); break; } S.holdAlt=S.alt; setMode('pitch','ALT HOLD'); pitchAt('speed'); break;
    case 'hdgsel': if(S.app.gsCap){ msg('HDG SEL is inhibited after localizer and glideslope capture.'); break; } S.hdgDir=0; setMode('roll','HDG SEL'); break;
    case 'lnav': { if(S.gnd){ S.arm.lnav=!S.arm.lnav; msg(S.arm.lnav?'LNAV armed: it engages at 50 ft RA.':'LNAV disarmed.'); break; } if(S.app.gsCap){ msg('L NAV is inhibited after localizer and glideslope capture.'); break; } const why=lnavCheck(); if(why){ msg(why); break; } setMode('roll','LNAV'); break; }
    case 'bank': { const L=[10,15,20,25,30]; m.bank=L[(L.indexOf(m.bank)+1)%L.length]; break; }
    case 'bankUp': m.bank=Math.min(30,m.bank+5); break; case 'bankDn': m.bank=Math.max(10,m.bank-5); break;
    case 'cmdA': case 'cmdB': { const w=a==='cmdA'?'A':'B', idx=w==='A'?0:1;
      if(m.discBar){ S.apLight=true; beep(600); msg('A/P cannot engage: the DISENGAGE bar is down. Lift it up first.'); break; }
      if(S.gnd){ msg('The autopilot cannot be engaged on the ground.'); break; }
      const appOn=S.app.armed||S.app.locCap||S.app.gsCap;
      if(m.ap&&m.apCmd&&(m.which===w||(m.ap2))){ apDisc('A/P disengaged.'); break; }
      if(m.ap&&m.apCmd&&m.which!==w&&appOn){
        if(raNow()<800){ msg('The second autopilot cannot be engaged below 800 ft RA.'); break; }
        const R1=NAVR[m.which==='A'?0:1], R2=NAVR[idx]; if(Math.abs(R1.act-R2.act)>0.006){ msg('Tune the second NAV receiver to the same ILS frequency first.'); break; }
        S.ap2Armed=true; msg('Second autopilot armed: it engages after LOC and G/S capture, below 1500 ft RA.'); break; }
      if(S.to&&S.to.active){ if(raNow()<400){ msg('The autopilot cannot engage below 400 ft RA in the takeoff mode.'); break; }
        S.to.active=false; setMode('pitch','MCP SPD'); m.spd=clamp(m.spd+20,100,340); S.pI=S.vs; if(S.modes.roll==='') setMode('roll','HDG SEL'); if(S.atArm&&S.modes.at==='THR HLD') setMode('at','ARM'); }
      S.apLight=false; apToneOff(); m.ap=true; m.apCmd=true; m.which=w; S.master=w; break; }
    case 'cwsA': case 'cwsB': { if(m.discBar){ S.apLight=true; beep(600); msg('A/P cannot engage: the DISENGAGE bar is down.'); break; }
      m.ap=true; m.apCmd=false; m.which=a==='cwsA'?'A':'B'; setMode('pitch',''); setMode('roll',''); S.cwsLevel=false; break; }
    case 'fdL': m.fdL=!m.fdL; if(m.fdL&&!m.ap&&!m.fdR) S.master='A'; break;
    case 'fdR': m.fdR=!m.fdR; if(m.fdR&&!m.ap&&!m.fdL) S.master='B'; break;
    case 'discBar': m.discBar=!m.discBar; if(m.discBar){ if(m.ap){ apDisc(); } msg('DISENGAGE bar down: A/P cannot engage.'); } else msg('DISENGAGE bar up: A/P engagement enabled.'); break;
    case 'toga': togaPress(); break;
    case 'minsRef': EF.minsRef=EF.minsRef==='RADIO'?'BARO':'RADIO'; break;
    case 'minsRst': EF.minsRef==='RADIO'?EF.minsRadio=0:EF.minsBaro=0; break;
    case 'fpv': EF.fpv=!EF.fpv; break; case 'mtrs': EF.mtrs=!EF.mtrs; break;
    case 'baroUnit': EF.hpa=!EF.hpa; break; case 'std': EF.std=!EF.std; break;
    case 'vor1': EF.vor1=(EF.vor1+1)%3; break; case 'vor2': EF.vor2=(EF.vor2+1)%3; break;
    case 'modeUp': case 'modeDn': { const n=clamp(EF.mode+(a==='modeUp'?1:-1),0,3); if(n!==2&&n!==0&&n!==EF.mode) msg(MODES[n]+' mode is not active yet. MAP and APP are available.'); else EF.mode=n; break; }
    case 'ctr': EF.ctr=(EF.ctr+1)%3; break;
    case 'rngUp': case 'rngDn': { const i=clamp(RANGES.indexOf(EF.range)+(a==='rngUp'?1:-1),0,7); EF.range=RANGES[i]; break; }
    case 'vnav': vnavPress(); break;
    case 'spdintv': spdIntvPress(); break;
    case 'altintv': altIntvPress(); break;
    case 'app': appPress(); break;
    case 'ph': case 'vorloc': msg('VOR LOC is not active yet — use APP for an ILS.'); break;
    default: if(standPress(a)) break; if(a.startsWith('sw_')){ const k=a.slice(3); EF.sw[k]^=1; } }
}
function togaPress(){
  const m=S.mcp;
  if(S.gnd){ if(S.rollout){ msg('TO/GA is not available on the landing roll.'); return; } takeoffStart(); return; }
  if(S.modes.pitch==='TO/GA'&&!S.to){ S.gaCount=2; setAT('GA'); S.limitMode='GA'; msg('Second TO/GA push: full go-around thrust.'); return; }
  if(S.to&&S.to.active) return;
  const agl=raNow();
  if(agl>2000&&!S.app.gsCap){ msg('TO/GA (go-around) is not available: above 2000 ft AGL with flaps up and no G/S captured.'); return; }
  const dual=m.ap&&m.ap2;
  S.app={armed:false,locCap:false,gsCap:false,nav:null}; S.flareArmed=false; S.flareEngaged=false; S.ap2Armed=false; S.landStat='';
  if(m.ap&&!dual) apDisc('TO/GA pushed with a single A/P engaged: the A/P disengaged, F/D remains.');
  m.fdL=true; m.fdR=true;
  S.gaCount=1; S.gaPhase=0; S.atArm=true; S.limitMode='GA'; setAT('GA'); setMode('pitch','TO/GA'); setMode('roll',''); S.cwsLevel=false; S.to=null;
}

const simMinutes=()=>((S.epoch+S.t*1000)/60000)%1440;
