'use strict';
/* VHF NAV radios and ILS (localizer + glideslope): tuning, reception, and the APP mode logic of the AFDS
   (FCOM 4.10.15–4.10.16, 4.20.7). ILS data (frequency, course, antenna positions, glidepath angle) come from the
   FAA CIFP file that the FMC database was built from: ../B737_FMCTrainer/data/nav-ils.js */
const NAVR=[{id:1,act:108.10,stby:110.50,rx:null},{id:2,act:108.10,stby:110.50,rx:null}];
let ILS_LIST=null;
function ilsList(){
  if(ILS_LIST) return ILS_LIST; ILS_LIST=[]; if(typeof NAV_ILS==='undefined') return ILS_LIST;
  const elev={}; db.index.forEach(a=>elev[a.id]=a.elevation||0);
  for(const ap in NAV_ILS.ils) for(const r of NAV_ILS.ils[ap]) ILS_LIST.push(Object.assign({apt:ap,elev:elev[ap]||0},r));
  return ILS_LIST;
}
const ilsBand=f=>f>=108.0&&f<=111.95&&Math.round(f*20)%2===0;      /* ILS/LOC channels: odd tenths (108.10, 108.15 …) */
function ilsFor(freq,near){
  let best=null,bd=1e9; for(const r of ilsList()){ if(Math.abs(r.freq-freq)>0.006) continue; const d=distance(near,r); if(d<bd&&d<120){ bd=d; best=r; } }
  return best;
}
function fmtFreq(f){ return f.toFixed(2); }
function tuneStep(n,which,dir){ const R=NAVR[n]; let f=Math.round(R.stby*100); const step=which==='mhz'?100:5; f+=dir*step;
  if(f<10800) f=11795; if(f>11795) f=10800; R.stby=f/100; }
function tuneSwap(n){ const R=NAVR[n]; const t=R.act; R.act=R.stby; R.stby=t; }

/* ILS solution for one receiver: lateral and vertical position relative to the beams */
function ilsSolve(R){
  const r=R.ils; if(!r) return null;
  const crsT=wrap360(r.crs+(r.decl||0)), p=llXY(S,r), brgFrom=wrap360(Math.atan2(p.x,p.y)/D2R), back=wrap360(crsT+180);
  const offs=wrap180(brgFrom-back), dist=Math.hypot(p.x,p.y), devRight=-offs;      /* + : airplane is right of the centerline */
  const halfW=(r.locWidth||3.5)/2, dotDeg=halfW/2.5;
  const locValid=dist<=25&&Math.abs(offs)<=35;
  const out={rec:r,crsT,dist,offs,devRight,locValid,locDots:locValid?clamp(-devRight/dotDeg,-2.5,2.5):null,dotDeg,xtkNm:dist*Math.sin(devRight*D2R)};
  if(r.gsLat!=null){
    const g={lat:r.gsLat,lon:r.gsLon}, pg=llXY(S,g), gd=Math.hypot(pg.x,pg.y), gft=gd*6076, alt=altInd();
    const theta=Math.atan2(alt-r.elev,Math.max(gft,1))/D2R, ang=r.gsAngle||3;
    out.gsDist=gd; out.gsValid=locValid&&Math.abs(offs)<=10&&gd<=25; out.gsDots=out.gsValid?clamp(-(theta-ang)/0.28,-2.5,2.5):null; out.gsDev=theta-ang; out.gsAng=ang;
    out.beamAlt=r.elev+gft*Math.tan(ang*D2R);
  }
  return out;
}
/* refresh both receivers (called about twice a second) */
function navUpdate(){
  NAVR[1].act=NAVR[0].act; NAVR[1].stby=NAVR[0].stby;               /* NAV 2 follows NAV 1 (one tuning panel) */
  for(const R of NAVR){ const t=ilsBand(R.act)?ilsFor(R.act,S):null; R.ils=t; R.rx=t?ilsSolve(R):null; }
  try{ lnavGuide(); }catch(err){}                                    /* keeps the leg geometry (start point, direct-to arc) current for the ND */
}
/* which receiver feeds the A/P and the captain's displays: NAV 1 (A), NAV 2 for B */
const navFor=()=>NAVR[(S.mcp.which==='B'&&S.mcp.ap)?1:0];

/* ---- APP mode: arming, localizer capture, glideslope capture ---- */
function appPress(){
  const R=navFor();
  if(S.app.armed||S.app.locCap){ /* second push: deselect while not yet captured */
    if(!S.app.gsCap){ S.app={armed:false,locCap:false,gsCap:false,nav:null}; if(S.modes.roll==='VOR/LOC') { setMode('roll','HDG SEL'); S.hdgDir=0; } if(S.modes.pitch==='G/S') setMode('pitch','ALT HOLD'); msg('APP deselected.'); }
    else msg('APP cannot be deselected after localizer and glideslope capture. Push a TO/GA switch for a go-around.');
    return; }
  if(!ilsBand(R.act)){ msg('APP needs an ILS frequency in the NAV ACTIVE window (108.10 – 111.95 MHz, odd tenths).'); return; }
  if(!R.ils){ msg('No ILS transmits on '+fmtFreq(R.act)+' near the airplane. Check the frequency.'); return; }
  S.app={armed:true,locCap:false,gsCap:false,nav:R.id-1};
  msg('APP armed: '+R.ils.ident+' '+fmtFreq(R.ils.freq)+' runway '+R.ils.rwy.replace('RW','')+'. The localizer captures on an intercept heading (HDG SEL or LNAV), then the glideslope.');
}
/* returns {hdgCmdTrue?,vc?} overrides for this step */
function appGuide(dt,act){
  const A=S.app; if(!A.armed&&!A.locCap) return null;
  const R=NAVR[A.nav==null?0:A.nav], rx=R.rx; if(!rx){ return null; }
  const out={};
  if(!A.locCap){
    if(rx.locValid){ const trk=wrap180(S.trk-rx.crsT), closing=(rx.devRight>0)?(trk<0):(trk>0);   /* moving toward the centerline? */
      const dTrk=Math.abs(trk), Rt=S.tas*S.tas/(68626*Math.tan(25*D2R)), turnDist=Rt*(1-Math.cos(dTrk*D2R)), halfDot=rx.dotDeg*0.5;
      const near=Math.abs(rx.xtkNm)<=Math.max(turnDist*1.05,rx.dist*Math.tan(halfDot*D2R));
      if(dTrk<=90&&closing&&near&&(S.modes.roll==='HDG SEL'||S.modes.roll==='LNAV'||S.modes.roll==='')){ A.locCap=true; setMode('roll','VOR/LOC'); msg('Localizer captured: VOR/LOC.'); } }
  }
  if(A.locCap){
    if(!rx.locValid){ msg('Localizer signal lost — roll mode reverts to CWS R.'); setMode('roll',''); A.locCap=false; A.armed=false; return null; }
    const gsFps=Math.max(S.gs*1.688,60), xtkFt=rx.xtkNm*6076, corr=Math.asin(clamp(xtkFt/(20*gsFps),-1,1))/D2R;
    out.hdgCmd=trkToHdg(wrap360(rx.crsT-clamp(corr,-30,30)));
    if(S.modes.roll!=='VOR/LOC') setMode('roll','VOR/LOC');
  }
  /* glideslope: armed, localizer captured, beam valid, and within 2/5 dot */
  if(A.locCap&&!A.gsCap&&rx.gsValid&&Math.abs(rx.gsDots)<=0.4&&S.modes.pitch!=='G/S'){
    A.gsCap=true; setMode('pitch','G/S'); S.vnavOn=false; if(S.atArm) setAT('MCP SPD'); A.armed=false; msg('Glideslope captured: G/S.'); }
  if(A.gsCap&&rx.gsValid){
    const gsFps=Math.max(S.gs*1.688,60), beamVS=-Math.tan((rx.gsAng||3)*D2R)*gsFps*60;
    out.vc=clamp(beamVS+6*(rx.beamAlt-altInd()),-1500,300);
  }
  return out;
}
