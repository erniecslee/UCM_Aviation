'use strict';
/* Displays: PFD, ND + VSD, engine gauges, thrust levers, and the time-history plots. */
/* ---------- canvas plumbing ---------- */
const FITS=[];
function mk(id,LW,LH){ const c=$q('#'+id), o={c,LW,LH,ctx:c.getContext('2d'),k:1};
  const fit=()=>{ const w=c.parentElement.clientWidth; if(!w)return; const d=Math.min((window.devicePixelRatio||1)*(window.STAGE_K||1),3);
    c.style.width=w+'px'; c.style.height=(w*LH/LW)+'px'; c.width=Math.round(w*d); c.height=Math.round(w*LH/LW*d); o.k=c.width/LW; };
  fit(); FITS.push(fit); new ResizeObserver(fit).observe(c.parentElement); return o; }
const T=(x,s,px,py,col,sz,al,w,mono)=>{ x.fillStyle=col; x.font=`${w||400} ${sz}px ${mono?FM:FS}`; x.textAlign=al||'left'; x.textBaseline='middle'; x.fillText(s,px,py); };
const L=(x,x1,y1,x2,y2,col,w)=>{ x.strokeStyle=col; x.lineWidth=w||1; x.beginPath(); x.moveTo(x1,y1); x.lineTo(x2,y2); x.stroke(); };
const PFDc=mk('pfd',700,754), NDc=mk('nd',800,730), SPc=mk('scope',1200,700);
function rr(x,px,py,w,h,r){ x.beginPath(); x.moveTo(px+r,py); x.arcTo(px+w,py,px+w,py+h,r); x.arcTo(px+w,py+h,px,py+h,r); x.arcTo(px,py+h,px,py,r); x.arcTo(px,py,px+w,py,r); x.closePath(); }
function barber(x,px,py,w,h){ x.save(); x.beginPath(); x.rect(px,py,w,h); x.clip(); x.fillStyle='#000'; x.fillRect(px,py,w,h); x.strokeStyle='#e5322d'; x.lineWidth=5; for(let i=-h;i<w+h;i+=11){ x.beginPath(); x.moveTo(px+i,py+h); x.lineTo(px+i+h,py); x.stroke(); } x.restore(); }

/* ---------- PFD (737 NG, per FCOM Ch.4 / Ch.10) ---------- */
function selSpdText(){ const m=S.mcp; if(S.vnavOn&&!(S.vn&&S.vn.intv)) return S.alt>=26000?'.'+String(Math.round(machOf(S.vnIas,S.alt)*1000)).padStart(3,'0'):String(S.vnIas);
  return m.machMode?'.'+String(Math.round(m.mach*100)).padStart(2,'0')+'0':String(m.spd); }
function drawPFD(){
  const x=PFDc.ctx, s=S, m=s.mcp, md=s.modes; x.setTransform(PFDc.k,0,0,PFDc.k,0,0); x.fillStyle='#050608'; x.fillRect(0,0,700,754);
  const st=81,sh=450,mid=st+sh/2, cx=311,cy=305, AX=139,AY=145,AW=344,AH=320, pk=6.6, ai=altInd();
  /* attitude indicator */
  x.save(); rr(x,AX,AY,AW,AH,30); x.clip();
  x.save(); x.translate(cx,cy); x.rotate(-s.bank*D2R); x.translate(0,s.pitchA*pk);
  x.fillStyle='#1e7bd4'; x.fillRect(-900,-900,1800,900); x.fillStyle='#8f5a1e'; x.fillRect(-900,0,1800,900); L(x,-900,0,900,0,'#fff',3);
  for(let p=-30;p<=30;p+=2.5){ if(!p)continue; const y=-p*pk, big=p%10===0, mid5=p%5===0, w=big?62:(mid5?34:18); L(x,-w,y,w,y,'#fff',2);
    if(big){ T(x,String(Math.abs(p)),-w-17,y,'#fff',15,'center',400,1); T(x,String(Math.abs(p)),w+17,y,'#fff',15,'center',400,1); } }
  x.restore();
  x.save(); x.translate(cx,cy);
  for(const a of [-60,-45,-30,-20,-10,10,20,30,45,60]){ x.save(); x.rotate(a*D2R); L(x,0,-150,0,Math.abs(a)%30===0?-136:-142,'#fff',2.5); x.restore(); }
  x.fillStyle='#fff'; x.beginPath(); x.moveTo(0,-160); x.lineTo(-9,-146); x.lineTo(9,-146); x.closePath(); x.fill();
  x.save(); x.rotate(-s.bank*D2R); x.strokeStyle='#fff'; x.lineWidth=2.5; x.beginPath(); x.moveTo(0,-148); x.lineTo(-9,-133); x.lineTo(9,-133); x.closePath(); x.stroke(); x.strokeRect(-9,-129,18,6); x.restore();
  x.restore();
  if(EF.fpv){ const fy=cy+(s.pitchA-Math.atan(s.vs/60/(s.tas*1.688))/D2R)*pk; x.strokeStyle=C.grn; x.lineWidth=2.5; x.beginPath(); x.arc(cx,fy,8,0,7); x.moveTo(cx-8,fy); x.lineTo(cx-24,fy); x.moveTo(cx+8,fy); x.lineTo(cx+24,fy); x.moveTo(cx,fy-8); x.lineTo(cx,fy-18); x.stroke(); }
  { const dtF=Math.max(0,Math.min(0.25,s.t-(s.fdTp==null?s.t:s.fdTp))); s.fdTp=s.t; const vis=s.fdShown&&!(s.flareEngaged&&s.landVariant!=='FO');
    if(vis&&!s.fdVis){ s.fdPD=0; s.fdRD=0; } s.fdVis=vis;                                   /* the bars come in from level and slide to the command */
    if(vis){ s.fdPD+=clamp(s.fdPitch-s.fdPD,-6*dtF,6*dtF); s.fdRD+=clamp(s.fdRoll-s.fdRD,-8*dtF,8*dtF); } }
  if(s.fdShown&&!(s.flareEngaged&&s.landVariant!=='FO')){ const ctr=s.flareEngaged&&s.landVariant==='FO'; const fy=ctr?cy:clamp(cy-s.fdPD*pk,AY+40,AY+AH-40), fx=ctr?cx:cx+clamp(s.fdRD*5,-80,80); L(x,cx-100,fy,cx+100,fy,C.mag,5); L(x,fx,cy-78,fx,cy+78,C.mag,5); }
  x.strokeStyle='#000'; x.lineWidth=11; x.beginPath(); x.moveTo(cx-112,cy); x.lineTo(cx-48,cy); x.lineTo(cx-48,cy+14); x.moveTo(cx+112,cy); x.lineTo(cx+48,cy); x.lineTo(cx+48,cy+14); x.stroke();
  x.strokeStyle='#fff'; x.lineWidth=6; x.stroke(); x.fillStyle='#000'; x.fillRect(cx-5,cy-5,10,10); x.strokeStyle='#fff'; x.lineWidth=2; x.strokeRect(cx-5,cy-5,10,10);
  /* ILS deviation scales: localizer at the bottom, glideslope at the right of the attitude indicator */
  { const R=navFor(), rx=R&&R.rx;
    const testing=S.autolandTestT&&S.t<S.autolandTestT&&Math.floor(S.t*4)%2===0, scaleCol=testing?C.amb:'#fff';
    if(rx&&rx.locDots!=null){ const by=AY+AH-30; for(const d of [-2,-1,1,2]){ x.strokeStyle=scaleCol; x.lineWidth=2; x.beginPath(); x.arc(cx+d*44,by,5,0,7); x.stroke(); }
      L(x,cx,by-10,cx,by+10,'#fff',2); const px=cx+rx.locDots*44; x.fillStyle=C.mag; x.beginPath(); x.moveTo(px,by-11); x.lineTo(px+9,by); x.lineTo(px,by+11); x.lineTo(px-9,by); x.closePath(); x.fill(); }
    if(rx&&rx.gsDots!=null){ const gx=AX+AW-34; for(const d of [-2,-1,1,2]){ x.strokeStyle=scaleCol; x.lineWidth=2; x.beginPath(); x.arc(gx,cy+d*40,5,0,7); x.stroke(); }
      L(x,gx-10,cy,gx+10,cy,'#fff',2); const py=cy-rx.gsDots*40; x.fillStyle=C.mag; x.beginPath(); x.moveTo(gx-11,py); x.lineTo(gx,py-9); x.lineTo(gx+11,py); x.lineTo(gx,py+9); x.closePath(); x.fill(); } }
  x.restore();
  /* FMA (A/T | roll | pitch) — engaged in large green, armed in small white */
  const chg=k=>s.t-s.chg[k]<10&&s.t>0.1;
  x.fillStyle='#5f5c5c'; x.fillRect(113,6,405,46);
  const armPitch=(S.flareArmed&&!S.flareEngaged)?'FLARE':((S.app.armed&&!S.app.gsCap)?'G/S':(S.arm.vnav?'VNAV':(vsArmed()?'V/S':''))), armRoll=(S.rolloutArmed&&md.roll!=='ROLLOUT')?'ROLLOUT':((S.app.armed&&!S.app.locCap)?'VOR/LOC':(S.arm.lnav?'LNAV':''));
  const F=[[atLabel(),atLabel()==='ARM'?'#fff':C.grn,''],[md.roll,C.grn,armRoll],[md.pitch,C.grn,armPitch]], k3=['at','roll','pitch'];
  F.forEach(([t0,col,arm],i)=>{ const t=t0||''; const bx=113+i*135; T(x,t,bx+67,arm?21:28,col,arm?19:22,'center',700); if(arm) T(x,arm,bx+67,41,'#fff',13,'center',700); if(i) L(x,bx,6,bx,52,'#fff',2);
    if(chg(k3[i])){ x.strokeStyle='#fff'; x.lineWidth=2.5; x.strokeRect(bx+3,9,129,40); } });
  /* AFDS status (ASA) */
  const fdAny=m.fdL, cmd=m.ap&&m.apCmd; const flashUp=Math.floor(performance.now()/500)%2===0;
  if(cmd){ if(S.landStat==='NO AUTOLAND') T(x,'NO AUTOLAND',cx,116,C.amb,22,'center',700); else if(S.app.locCap&&!m.ap2&&!S.landStat) T(x,'SINGLE CH',cx,116,C.amb,26,'center',700); else T(x,S.landStat||'CMD',cx,116,C.grn,28,'center',700); } else if(fdAny) T(x,'FD',cx,116,C.grn,28,'center',700);
  if(m.ap&&md.pitch==='') T(x,'CWS P',cx-88,116,C.amb,17,'right',700);
  if(m.ap&&md.roll==='') T(x,'CWS R',cx+88,116,C.amb,17,'left',700);
  T(x,'FMC',AX+6,116,'#fff',14,'left',400);
  if(chg('pitch')&&false){}
  /* speed tape */
  const sx=7,sw=93,spp=3.7, ts=tgtSpd(), a=661-s.alt*0.00245, vmax=spdLimits().vmax, vmin=cfgMinSpeed();
  x.save(); x.beginPath(); x.rect(sx,st,sw,sh); x.clip(); x.fillStyle='#625f5f'; x.fillRect(sx,st,sw,sh);
  const vI=s.gnd?Math.max(s.ias,30):s.ias;                                  /* the tape starts at 30 kt: it is parked there while the airplane is stopped */
  const ys=v=>mid-(v-vI)*spp;
  for(let v=Math.floor((vI-70)/10)*10; v<=vI+70; v+=10){ if(v<30)continue; const y=ys(v); L(x,sx+sw-16,y,sx+sw,y,'#fff',2.5); if(v%20===0) T(x,String(v),sx+8,y,'#fff',22,'left',400,1); }
  x.restore();
  /* low-speed cues: red/black bar up to the stick shaker speed; the amber minimum-maneuver bar is inhibited on takeoff until the first flap retraction or a valid VREF */
  const vsh=vmin*0.83, ldgSel=/^(15|30|40)\/\d{2,3}$/.test((typeof e!=='undefined'&&e.perf&&e.perf.landing)||''), amberOn=!s.gnd&&(s.flapRetracted||ldgSel);
  if(!s.gnd){ barber(x,sx+sw+1,st,9,Math.max(0,Math.min(sh,ys(vmax)-st))); { const y0=clamp(ys(vsh),st,st+sh); barber(x,sx+sw+1,y0,9,st+sh-y0); } }
  if(amberOn){ const y1=clamp(ys(vmin),st,st+sh), y0=clamp(ys(vsh),st,st+sh); L(x,sx+sw+13,y1,sx+sw+13,y0,C.amb,4); L(x,sx+sw+8,y1,sx+sw+13,y1,C.amb,3); }
  /* flap maneuvering + reference speeds (FCOM table) */
  const vr=fmcVrefs(), V40=vr.v40, ldg=/^(15|30|40)\/(\d{2,3})$/.exec((typeof e!=='undefined'&&e.perf&&e.perf.landing)||''), tof=(typeof e!=='undefined'&&+e.perf.flaps)||5;
  /* flap maneuvering speeds (your table): after takeoff only the takeoff flap setting and the settings below it; the landing reference speed appears once one is selected on APPROACH REF */
  if(V40){ const list=[['UP',0],['1',1],['5',5],['15',15]].filter(([n,d])=>ldg?true:d<=Math.min(tof,s.cfg.flapSel)).map(([n,d])=>[n,maneuverSpeed(d)]);
    list.forEach(([n,v])=>{ if(v==null) return; const y=ys(v); if(y<st+10||y>st+sh-10) return; L(x,sx+sw+2,y,sx+sw+18,y,C.grn,2.5); T(x,n,sx+sw+22,y,C.grn,15,'left',700); });
    if(ldg){ const v=+ldg[2], y=ys(v); if(y>=st+10&&y<=st+sh-10){ L(x,sx+sw+2,y,sx+sw+18,y,C.grn,2.5); T(x,'REF',sx+sw+22,y,C.grn,15,'left',700); } } }
  if(ldg){ T(x,ldg[1]+'/'+ldg[2],10,568,C.grn,14,'left',400,1); T(x,'VREF '+ldg[2],10,586,C.grn,13,'left',400,1); }
  /* takeoff speeds: only what was entered on TAKEOFF REF; otherwise the NO V SPD flag */
  if((s.gnd&&!s.tdT)||(s.to&&s.to.active)){ const P=(typeof e!=='undefined'&&e&&e.perf)||{}, ok=/^\d{2,3}$/.test(P.v1||'')&&/^\d{2,3}$/.test(P.vr||'')&&/^\d{2,3}$/.test(P.v2||'')&&!P.vSpeedsOff&&!s.tdT;
    if(ok){ [['V1',+P.v1],['VR',+P.vr],['V2',+P.v2]].forEach(([n,v])=>{ const y=ys(v); if(y<st+10||y>st+sh-10) return; L(x,sx+sw+2,y,sx+sw+18,y,C.grn,2.5); T(x,n,sx+sw+22,y,C.grn,15,'left',700); }); }
    else if(s.gnd){ ['NO','V','S','P','D'].forEach((c,i)=>T(x,c,122,205+i*21,C.amb,18,'center',700,1)); } }
  const by=clamp(ys(ts),st+8,st+sh-8); x.strokeStyle=C.mag; x.lineWidth=3; x.beginPath(); x.moveTo(sx+sw+2,by); x.lineTo(sx+sw+14,by-10); x.lineTo(sx+sw+30,by-10); x.lineTo(sx+sw+30,by+10); x.lineTo(sx+sw+14,by+10); x.closePath(); x.stroke();   /* selected speed bug: pointer with a rectangular tail */
  const tr=s.ias<30?0:clamp(s.acc*10,-50,50); x.strokeStyle=C.grn; x.lineWidth=3; x.beginPath(); x.moveTo(sx+sw-4,mid); x.lineTo(sx+sw-4,mid-tr*spp); x.stroke();
  x.fillStyle='#000'; x.strokeStyle='#fff'; x.lineWidth=2.5; x.beginPath(); x.moveTo(sx,mid-24); x.lineTo(sx+74,mid-24); x.lineTo(sx+90,mid); x.lineTo(sx+74,mid+24); x.lineTo(sx,mid+24); x.closePath(); x.fill(); x.stroke();
  if(s.gnd&&s.ias<30) T(x,'30',sx+64,mid,'#fff',34,'right',700,1);        /* the tape rests at 30 kt until the airspeed is alive */
  if(s.ias>=30) T(x,String(Math.round(s.ias)),sx+64,mid,(!s.gnd&&s.ias<vsh)?C.red:'#fff',34,'right',700,1);
  T(x,selSpdText(),sx+sw/2,58,C.mag,26,'center',700,1);
  T(x,s.mach>=0.4?'.'+String(Math.round(s.mach*1000)).padStart(3,'0'):'',52,st+sh+17,'#fff',22,'center',400,1);
  if(!s.gnd && amberOn && s.ias<vmin+3 && Math.floor(s.t*3)%2===0) T(x,'SPEED LOW',cx,AY+46,C.red,15,'center',700);
  /* altitude tape */
  const ax=538,aw=89,ppf=0.564;
  x.save(); x.beginPath(); x.rect(ax,st,aw,sh); x.clip(); x.fillStyle='#625f5f'; x.fillRect(ax,st,aw,sh);
  const ya=al=>mid-(al-ai)*ppf;
  for(let al=Math.floor((ai-450)/100)*100;al<=ai+450;al+=100){ const y=ya(al); L(x,ax,y,ax+(al%500===0?22:14),y,'#fff',2.5);
    if(al%200===0){ const th=Math.floor(Math.abs(al)/1000), rest=String(Math.abs(al)%1000).padStart(3,'0');
      if(al<0){ T(x,'-'+Math.abs(al),ax+26,y,'#fff',16,'left',400,1); } else if(th>0){ T(x,String(th),ax+26,y,'#fff',22,'left',400,1); T(x,rest,ax+26+(th>9?26:14),y+1,'#fff',16,'left',400,1);} else T(x,rest,ax+26,y,'#fff',17,'left',400,1); } }
  const ba=clamp(ya(m.alt),st+10,st+sh-10); x.strokeStyle=C.mag; x.lineWidth=3; x.beginPath(); x.moveTo(ax+2,ba-24); x.lineTo(ax+42,ba-24); x.lineTo(ax+42,ba+24); x.lineTo(ax+2,ba+24); x.lineTo(ax+2,ba+8); x.lineTo(ax+10,ba); x.lineTo(ax+2,ba-8); x.closePath(); x.stroke();   /* selected altitude bug: box with a notch on the tape side */
  x.restore();
  x.fillStyle='#000'; x.strokeStyle='#fff'; x.lineWidth=2.5; x.beginPath(); x.moveTo(ax+aw+4,mid-34); x.lineTo(ax+28,mid-34); x.lineTo(ax+10,mid); x.lineTo(ax+28,mid+34); x.lineTo(ax+aw+4,mid+34); x.closePath(); x.fill(); x.stroke();
  const ar=Math.round(ai/20)*20, ath=Math.floor(Math.abs(ar)/1000), ares=String(Math.abs(ar)%1000).padStart(3,'0');
  if(ath>=10) T(x,String(ath),ax+32,mid,'#fff',34,'left',700,1);
  else{ /* below 10,000 ft: a green hatched symbol stands in the ten-thousands position and the thousands digit is always shown (0 below 1000 ft) */
    x.save(); x.beginPath(); x.rect(ax+31,mid-14,15,28); x.clip(); x.strokeStyle=C.grn; x.lineWidth=2.5; for(let k=-30;k<30;k+=7){ x.beginPath(); x.moveTo(ax+31+k,mid+14); x.lineTo(ax+31+k+28,mid-14); x.stroke(); } x.restore();
    T(x,String(ath),ax+50,mid,'#fff',34,'left',700,1); }
  T(x,ares,ax+32+42,mid+2,'#fff',24,'left',700,1);
  T(x,String(m.alt),ax+aw-2,58,C.mag,26,'right',700,1);
  if(EF.mtrs){ T(x,Math.round(m.alt*0.3048)+'',ax+aw-16,32,C.mag,16,'right',400,1); T(x,'M',ax+aw-2,32,C.cyn,12,'right',700); T(x,Math.round(ai*0.3048)+'',ax+aw-16,mid-24,'#fff',15,'right',400,1); T(x,'M',ax+aw-2,mid-24,C.cyn,11,'right',700); }
  const baro=EF.std?'STD':(EF.hpa?String(Math.round(EF.qnh*33.8639))+' HPA':EF.qnh.toFixed(2)+' IN'); T(x,baro,ax+aw/2,st+sh+17,C.grn,20,'center',700,1);
  if(!EF.std&&ai>=18000){ x.strokeStyle=C.amb; x.lineWidth=3; x.strokeRect(ax+aw/2-64,st+sh+2,128,30); }      /* above the transition altitude the baro setting is boxed until STD is set */
  /* radio altitude */
  if(!s.gnd&&s.ra<2500){ const r2=Math.round(s.ra<100?s.ra:s.ra/10*10); x.fillStyle='#000'; x.fillRect(cx-34,AY+AH-96,68,26); T(x,String(r2),cx,AY+AH-83,'#fff',22,'center',700,1); }
  /* minimums */
  const mv=EF.minsRef==='RADIO'?EF.minsRadio:EF.minsBaro; if(mv>0){ T(x,EF.minsRef,ax-8,AY+AH+10,'#c9c9c9',13,'right',400); T(x,String(mv),ax-8,AY+AH+30,'#e6e6e6',24,'right',400,1); }
  /* V/S scale */
  const vx=647,vw=53; const fv=v=>{const q=Math.abs(v),sg=Math.sign(v); return sg*(q<=1000?q/1000*74.6:q<=2000?74.6+(q-1000)/1000*53.4:128+Math.min(q-2000,4000)/4000*37);};
  /* V/S scale (FCOM): tall shape with the top and bottom corners cut, thousands labelled 6 2 1, and a pointer that runs from the right-hand pivot to the reading */
  x.fillStyle='#625f5f'; x.beginPath(); x.moveTo(vx,mid-165); x.lineTo(vx+vw*0.39,mid-165); x.lineTo(vx+vw,mid-88); x.lineTo(vx+vw,mid+88); x.lineTo(vx+vw*0.39,mid+165); x.lineTo(vx,mid+165); x.lineTo(vx,mid+52); x.lineTo(vx+14,mid+44); x.lineTo(vx+14,mid-44); x.lineTo(vx,mid-52); x.closePath(); x.fill();
  for(const v of [500,1000,1500,2000,4000,6000]) for(const sg of [1,-1]){ const y=mid-fv(v*sg); L(x,vx+16,y,vx+(v%1000===0?26:20),y,'#fff',2); if(v===1000||v===2000||v===6000) T(x,String(v/1000),vx+5,y,'#fff',15,'left',400,1); }
  L(x,vx+16,mid,vx+30,mid,'#fff',2);
  if(md.pitch==='V/S'){ const y=mid-fv(m.vs); x.strokeStyle=C.mag; x.lineWidth=3; x.strokeRect(vx+30,y-5,16,10); }
  { const vy=mid-fv(clamp(s.vs,-6000,6000)); L(x,vx+vw,mid,vx+vw*0.32,vy,'#fff',3.5);
    if(Math.abs(s.vs)>=400){ const txt=String(Math.round(Math.abs(s.vs)/50)*50); T(x,txt,vx+vw-2,s.vs>0?mid-165-12:mid+165+14,'#fff',17,'right',700,1); } }
  /* heading disc */
  const hdgM=toMag(s.hdg,s.magvar), hx=311,hy=728,hr=190; x.save(); x.beginPath(); x.rect(0,538,700,190); x.clip();
  x.fillStyle='#625f5f'; x.beginPath(); x.arc(hx,hy,hr,Math.PI,2*Math.PI); x.lineTo(hx+hr,hy); x.lineTo(hx-hr,hy); x.fill();
  for(let hh=Math.ceil((hdgM-95)/5)*5;hh<=hdgM+95;hh+=5){ const an=(hh-hdgM)*D2R, sn=Math.sin(an), co=Math.cos(an), hn=wrap360(hh), l=hn%10===0?16:9;
    L(x,hx+hr*sn,hy-hr*co,hx+(hr-l)*sn,hy-(hr-l)*co,'#fff',2); if(hn%30===0){ x.save(); x.translate(hx+(hr-32)*sn,hy-(hr-32)*co); x.rotate(an); T(x,String(hn/10),0,0,'#fff',20,'center',400,1); x.restore(); } }
  const hb=wrap180(m.hdg-hdgM);
  L(x,hx,hy,hx,hy-hr,'#fff',2.5);
  if(Math.abs(hb)<=100){ const an=hb*D2R; x.setLineDash([9,7]); L(x,hx,hy,hx+hr*Math.sin(an),hy-hr*Math.cos(an),C.mag,2); x.setLineDash([]);  }
  x.restore();
  /* the selected-heading bug is drawn after the compass clip so the top of the ring cannot hide it */
  if(Math.abs(hb)<=100){ const an=hb*D2R; x.save(); x.translate(hx+hr*Math.sin(an),hy-hr*Math.cos(an)); x.rotate(an); x.strokeStyle=C.mag; x.lineWidth=3.5; x.beginPath(); x.moveTo(-14,3); x.lineTo(-14,-17); x.lineTo(0,-8); x.lineTo(14,-17); x.lineTo(14,3); x.closePath(); x.stroke(); x.restore(); }
  x.strokeStyle='#fff'; x.lineWidth=2.5; x.beginPath(); x.moveTo(hx,hy-hr-2); x.lineTo(hx-10,hy-hr-18); x.lineTo(hx+10,hy-hr-18); x.closePath(); x.stroke();
  T(x,'GS',8,612,'#fff',14,'left',700); T(x,String(Math.round(s.gs)),34,612,'#fff',22,'left',400,1); T(x,'TAS',8,638,'#fff',14,'left',700); T(x,String(Math.round(s.tas)),44,638,'#fff',22,'left',400,1);
  T(x,'SEL HDG',hx-52,742,C.mag,14,'right',700); T(x,fmtH(m.hdg),hx-8,742,C.mag,22,'center',700,1); T(x,'MAG',hx+34,742,C.mag,14,'left',700);
}

/* ---------- ND + VSD ---------- */
function starPath(x,px,py,col){ x.strokeStyle=col; x.lineWidth=2; x.beginPath(); x.moveTo(px,py-9); x.lineTo(px+3,py-3); x.lineTo(px+9,py); x.lineTo(px+3,py+3); x.lineTo(px,py+9); x.lineTo(px-3,py+3); x.lineTo(px-9,py); x.lineTo(px-3,py-3); x.closePath(); x.stroke(); }
function altText(a){ return a>=18000?'FL'+Math.round(a/100):String(a); }
function altConstraintText(c){ if(!c) return ''; const t=c.type; if(t==='W') return altText(c.alt)+'A'+altText(c.alt2)+'B'; return altText(c.alt)+(t==='A'||t==='B'?t:''); }
/* elevation under the airplane: only airport elevations are known (no terrain database yet) */
function groundElevAt(p){ let best=0, bd=1e9; for(const id in db.airports){ const a=db.airports[id]; const d=distance(p,a); if(d<bd){ bd=d; best=a.elevation||0; } } return bd<25?best:0; }
/* runways drawn on the ND: the FMC departure runway and the arrival runway at the end of the route */
function routeRunways(){
  const out=[]; if(typeof e==='undefined'||!e) return out;
  try{ const rt=e.mod||e.active, org=e.scenario&&e.scenario.origin, dst=e.scenario&&e.scenario.destination;
    const dep=(e.active&&e.active.runway)||(e.mod&&e.mod.runway); if(dep&&org){ const i=runwayInfo(org,dep); if(i) out.push(i); }
    const legs=(rt&&rt.legs)||[]; for(let k=legs.length-1;k>=0;k--){ const l=legs[k]; if(l&&/^RW\d\d[LRC]?$/.test(l.id||'')&&dst){ const i=runwayInfo(dst,l.id); if(i) out.push(i); break; } } }catch(err){}
  return out;
}
/* PLAN mode: the map is centered on the waypoint at the top of the CDU LEGS page (NEXT PAGE / PREV PAGE steps through the route) */
let PLN_CTR=null;
function planCenterLeg(){
  try{ const r=(e.mod||e.active); if(!r) return null;
    if(page==='LEGS'){ const capacity=4, rem=r.legs.slice(r.index), plan=[]; rem.forEach(l=>{ if(l.disco){ plan.push(null); plan.push(null); } else plan.push(l); });
      let leg=null; for(let i=pageNo*capacity;i<plan.length;i++){ if(plan[i]&&isPos(plan[i])){ leg=plan[i]; break; } } if(leg) PLN_CTR=leg; }
    if(!PLN_CTR||!(r.legs.includes(PLN_CTR)||(e.active&&e.active.legs.includes(PLN_CTR)))) PLN_CTR=r.legs.slice(r.index).find(isPos)||null;
  }catch(err){}
  return PLN_CTR;
}
const planCenter=()=>{ const l=planCenterLeg(); return l?{lat:l.lat,lon:l.lon}:S; };
const planCenterName=()=>{ const l=PLN_CTR; return l?fixName(l):''; };
/* spatial index of the FMC database for the MAP switches: one-degree cells per type */
let GEO=null, GEO_LOADING=false;
function geoIndex(){
  if(GEO) return GEO;
  if(!db.fixes){ if(!GEO_LOADING&&typeof ensureFixes==='function'){ GEO_LOADING=true; ensureFixes().then(()=>{ GEO_LOADING=false; }).catch(()=>{ GEO_LOADING=false; }); } return null; }
  const g={NAVAID:{},FIX:{},AIRPORT:{}};
  for(const k in db.fixes) for(const f of db.fixes[k]){ const t=f.type; if(!g[t]) continue; if((t==='NAVAID'||t==='FIX')&&f.scope) continue; if(!Number.isFinite(f.lat)) continue; const key=Math.floor(f.lat)+','+Math.floor(f.lon); (g[t][key]||(g[t][key]=[])).push(f); }
  return (GEO=g);
}
function geoNear(grid,c,nm){
  const dl=Math.ceil(nm/60), dn=Math.min(40,Math.ceil(nm/(60*Math.max(0.2,Math.cos(c.lat*D2R))))), la=Math.floor(c.lat), lo=Math.floor(c.lon), out=[];
  for(let i=-dl;i<=dl;i++) for(let j=-dn;j<=dn;j++){ const cell=grid[(la+i)+','+(lo+j)]; if(!cell) continue; for(const f of cell){ const d=distance(c,f); if(d<=nm) out.push({id:f.id,lat:f.lat,lon:f.lon,d}); } }
  return out.sort((a,b)=>a.d-b.d);
}
function drawND(){
  const x=NDc.ctx, s=S, m=s.mcp; x.setTransform(NDc.k,0,0,NDc.k,0,0); x.fillStyle='#000'; x.fillRect(0,0,800,730);
  const pln=EF.mode===3, ctr=pln?2:EF.ctr, exp=ctr===0, vsd=ctr!==2, range=EF.range, hdgM=toMag(s.hdg,s.magvar);
  const cx=400, cy=exp?498:(ctr===1?290:365), R=exp?340:(ctr===1?215:325), sc=R/range, h=pln?0:s.hdg*D2R, arc=exp?70:180, cp=pln?planCenter():s;
  const w2s=p=>{ const o=llXY(p,cp), f=o.x*Math.sin(h)+o.y*Math.cos(h), r=o.x*Math.cos(h)-o.y*Math.sin(h); return [cx+r*sc,cy-f*sc]; };
  const a0=-Math.PI/2-arc*D2R, a1=-Math.PI/2+arc*D2R, ahead=routeAhead(40);
  x.save(); x.beginPath(); x.rect(0,0,800,vsd?536:730); x.clip();
  x.save(); x.beginPath(); if(exp){ x.moveTo(cx,cy); x.arc(cx,cy,R+40,a0,a1); x.closePath(); } else x.arc(cx,cy,R+40,0,7); x.clip();
  x.strokeStyle='#fff'; x.lineWidth=2;
  for(const f of [.25,.5,.75]){ x.beginPath(); x.arc(cx,cy,R*f,exp?a0:0,exp?a1:7); x.stroke(); }
  const hb=wrap180(m.hdg-hdgM);
  if(!pln&&s.modes.roll==='HDG SEL'){ x.setLineDash([9,7]); const an=(exp?clamp(hb,-66,66):hb)*D2R; L(x,cx,cy,cx+R*Math.sin(an),cy-R*Math.cos(an),C.mag,1.6); x.setLineDash([]); }
  if(!pln) L(x,cx,cy,cx,cy-R,'#fff',1.4);
  /* modified (not yet executed) route, dashed */
  const mod=modRouteAhead(); if(mod.length){ const o0=w2s(s); x.setLineDash([9,7]); x.strokeStyle='#fff'; x.lineWidth=2; x.beginPath(); x.moveTo(o0[0],o0[1]); mod.forEach(l=>{ const p=w2s(l); x.lineTo(p[0],p[1]); }); x.stroke(); x.setLineDash([]);
    mod.forEach(l=>{ const p=w2s(l); starPath(x,p[0],p[1],'#fff'); T(x,fixName(l),p[0]+14,p[1]-4,'#fff',16,'left',700);
      if(l.hold){ const pts=holdShape(l); x.setLineDash([9,7]); x.strokeStyle='#fff'; x.lineWidth=2; x.beginPath(); pts.forEach((q,i)=>{ const z=w2s(q); if(i) x.lineTo(z[0],z[1]); else x.moveTo(z[0],z[1]); }); x.stroke(); x.setLineDash([]); } }); }
  /* active route */
  if(ahead.length){ x.strokeStyle=C.mag; x.lineWidth=3; x.beginPath(); let pen=true; const ap=arcPoints(), o0=w2s(s);
    if(ap){ const q=w2s(ap[0]); x.moveTo(q[0],q[1]); ap.slice(1).forEach(pt=>{ const z=w2s(pt); x.lineTo(z[0],z[1]); }); }
    else if(S.legKey&&S.legStart&&ahead[0]&&ahead[0].l.path==='DF'&&S.arcDone!==undefined&&S.legKey.indexOf(ahead[0].l.id)>=0){ const q=w2s(S.legStart); x.moveTo(q[0],q[1]); }
    else x.moveTo(o0[0],o0[1]);
    ahead.forEach(it=>{ if(it.disco){ pen=false; return; } const p=w2s(it.l); if(pen) x.lineTo(p[0],p[1]); else { x.moveTo(p[0],p[1]); pen=true; } }); x.stroke(); }
  ahead.forEach(it=>{ if(it.disco||!it.l.hold) return; const pts=holdShape(it.l); x.strokeStyle=C.mag; x.lineWidth=2.5; x.beginPath(); pts.forEach((q,i)=>{ const z=w2s(q); if(i) x.lineTo(z[0],z[1]); else x.moveTo(z[0],z[1]); }); x.stroke(); });
  const dAlt=(m.alt-baroOff())-s.alt;
  if(!pln&&dAlt*s.vs>0 && Math.abs(s.vs)>200){ const r=Math.abs(dAlt)/Math.abs(s.vs)*s.gs/60*sc; if(r<R-6){ x.strokeStyle=C.grn; x.lineWidth=3.5; x.beginPath(); x.arc(cx,cy,r,-Math.PI/2-13*D2R,-Math.PI/2+13*D2R); x.stroke(); } }
  const zBase=simMinutes();
  ahead.forEach((it,k)=>{ if(it.disco) return; const l=it.l, p=w2s(l), col=k===0?C.mag:'#fff';
    starPath(x,p[0],p[1],col); T(x,fixName(l),p[0]+14,p[1]-4,col,16,'left',700);
    if(EF.sw.data){ const ct=altConstraintText(it.alt); let yy=p[1]+12; if(ct){ T(x,ct,p[0]+14,yy,col,13,'left',400,1); yy+=14; } T(x,fmtZ(zBase+it.d/Math.max(s.gs,60)*60),p[0]+14,yy,col,13,'left',400,1); } });
  /* MAP background data (FCOM 10.10): STA = navaids, WPT = waypoints not in the route (range 40 NM or less), ARPT = airports */
  if(EF.sw.sta||EF.sw.wpt||EF.sw.arpt){ const G=geoIndex(); if(G){ const onRoute=new Set(ahead.map(it=>it.l&&it.l.id)), lim=range*1.12, pt=p=>w2s(p);
    const inView=q=>{ const z=pt(q); return z[1]<cy+10&&z[1]>cy-R-60&&Math.abs(z[0]-cx)<R+60?z:null; };
    if(EF.sw.sta){ const list=geoNear(G.NAVAID,s,lim).slice(0,range>=80?60:150); for(const f of list){ const z=inView(f); if(!z) continue; x.strokeStyle=C.cyn; x.lineWidth=1.6; x.beginPath(); for(let k=0;k<6;k++){ const an=k*Math.PI/3; const px=z[0]+6*Math.cos(an), py=z[1]+6*Math.sin(an); if(k) x.lineTo(px,py); else x.moveTo(px,py); } x.closePath(); x.stroke(); x.fillStyle=C.cyn; x.fillRect(z[0]-1,z[1]-1,2,2); T(x,f.id,z[0]+10,z[1]-4,C.cyn,13,'left',700); } }
    if(EF.sw.wpt&&range<=40){ const list=geoNear(G.FIX,s,lim).filter(f=>!onRoute.has(f.id)).slice(0,120); for(const f of list){ const z=inView(f); if(!z) continue; x.strokeStyle=C.cyn; x.lineWidth=1.5; x.beginPath(); x.moveTo(z[0],z[1]-6); x.lineTo(z[0]+2,z[1]-2); x.lineTo(z[0]+6,z[1]); x.lineTo(z[0]+2,z[1]+2); x.lineTo(z[0],z[1]+6); x.lineTo(z[0]-2,z[1]+2); x.lineTo(z[0]-6,z[1]); x.lineTo(z[0]-2,z[1]-2); x.closePath(); x.stroke(); T(x,f.id,z[0]+9,z[1]-3,C.cyn,12,'left',400); } }
    if(EF.sw.arpt){ const list=geoNear(G.AIRPORT,s,lim).slice(0,range>=80?50:100); for(const f of list){ const z=inView(f); if(!z) continue; x.strokeStyle=C.cyn; x.lineWidth=2; x.beginPath(); x.arc(z[0],z[1],6,0,7); x.stroke(); T(x,f.id,z[0]+11,z[1]-3,C.cyn,13,'left',700); } } } }
  /* departure and destination runways (mini runway symbols) */
  for(const info of routeRunways()){ const a={lat:info.lat,lon:info.lon}, b=destPoint(a,info.hdgT,info.lenFt/6076), pa=w2s(a), pb=w2s(b), wpx=Math.max(10,150/6076*sc);
    x.lineCap='butt'; x.strokeStyle='#fff'; x.lineWidth=wpx+4; x.beginPath(); x.moveTo(pa[0],pa[1]); x.lineTo(pb[0],pb[1]); x.stroke();
    x.strokeStyle='#000'; x.lineWidth=wpx; x.beginPath(); x.moveTo(pa[0],pa[1]); x.lineTo(pb[0],pb[1]); x.stroke();
    x.strokeStyle='#fff'; x.lineWidth=1.5; x.setLineDash([8,6]); x.beginPath(); x.moveTo(pa[0],pa[1]); x.lineTo(pb[0],pb[1]); x.stroke(); x.setLineDash([]); }
  /* APP mode: extended runway centerline of the tuned ILS */
  if(EF.mode===0){ const rx=navFor().rx; if(rx){ const a={lat:rx.rec.lat,lon:rx.rec.lon}, b=destPoint(a,wrap360(rx.crsT+180),30), pa=w2s(a), pb=w2s(b);
      x.setLineDash([12,8]); x.strokeStyle=C.cyn; x.lineWidth=2; x.beginPath(); x.moveTo(pa[0],pa[1]); x.lineTo(pb[0],pb[1]); x.stroke(); x.setLineDash([]); } }
  /* top of descent on the route */
  { const path=buildPath(ahead), crz=crzAltFt(); if(path&&crz!=null&&S.vnPhase!=='DES'){ const dist=path.total-todDtgOf(path,crz);
      if(dist>0){ const pt=pointAlongRoute(ahead,dist); if(pt){ const p=w2s(pt); x.strokeStyle=C.grn; x.lineWidth=2.5; x.beginPath(); x.arc(p[0],p[1],7,0,7); x.stroke(); T(x,'T/D',p[0]+12,p[1]+4,C.grn,14,'left',700); } } } }
  x.restore();
  T(x,String(range/2),cx+(R/2)*Math.sin(-40*D2R)-(exp?16:-2),cy-(R/2)*Math.cos(40*D2R)+(exp?0:-4),'#fff',18,'center',400,1);
  x.strokeStyle='#fff'; x.lineWidth=2.5; x.beginPath(); x.arc(cx,cy,R,exp?a0:0,exp?a1:7); x.stroke();
  const span=exp?72:180;
  if(!pln) for(let hh=Math.ceil((hdgM-span)/5)*5;hh<=hdgM+span;hh+=5){ const an=(hh-hdgM)*D2R, sn=Math.sin(an), co=Math.cos(an), hn=wrap360(hh), l=hn%10===0?16:8;
    L(x,cx+R*sn,cy-R*co,cx+(R-l)*sn,cy-(R-l)*co,'#fff',2);
    if(hn%30===0){ x.save(); x.translate(cx+(R-32)*sn,cy-(R-32)*co); x.rotate(an); T(x,String(hn/10),0,0,'#fff',20,'center',400,1); x.restore(); } }
  const bb=(exp?clamp(hb,-66,66):hb)*D2R; if(!pln){ x.save(); x.translate(cx+R*Math.sin(bb),cy-R*Math.cos(bb)); x.rotate(bb); x.strokeStyle=C.mag; x.lineWidth=3; x.beginPath(); x.moveTo(-11,4); x.lineTo(-11,-14); x.lineTo(0,-6); x.lineTo(11,-14); x.lineTo(11,4); x.closePath(); x.stroke(); x.restore();
  x.strokeStyle='#fff'; x.lineWidth=2.5; x.beginPath(); x.moveTo(cx,cy-R-1); x.lineTo(cx-8,cy-R-16); x.lineTo(cx+8,cy-R-16); x.closePath(); x.stroke();
  x.strokeStyle='#fff'; x.lineWidth=3; x.beginPath(); x.moveTo(cx,cy-34); x.lineTo(cx+22,cy+8); x.lineTo(cx-22,cy+8); x.closePath(); x.stroke(); }
  else { const ap=w2s(s); x.save(); x.translate(ap[0],ap[1]); x.rotate(s.hdg*D2R); x.strokeStyle='#fff'; x.lineWidth=3; x.beginPath(); x.moveTo(0,-20); x.lineTo(13,12); x.lineTo(-13,12); x.closePath(); x.stroke(); x.restore(); T(x,'N',cx,cy-R-14,'#fff',22,'center',700); }
  x.restore();
  /* readouts */
  T(x,'GS',14,20,'#fff',12,'left'); T(x,String(Math.round(s.gs)),34,20,'#fff',20,'left',400,1); T(x,'TAS',14,44,'#fff',12,'left'); T(x,String(Math.round(s.tas)),44,44,'#fff',20,'left',400,1);
  if(!pln){ T(x,'HDG',296,22,C.grn,17,'left',700); x.strokeStyle='#fff'; x.lineWidth=2; x.strokeRect(344,6,72,34); T(x,fmtH(hdgM),380,24,'#fff',24,'center',400,1); T(x,'MAG',426,22,C.grn,17,'left',700); }
  else { T(x,'PLAN',296,22,C.grn,17,'left',700); const cf=planCenterName(); if(cf) T(x,cf,380,24,'#fff',22,'left',700); }
  if(s.wind&&s.wind.spd>0){ T(x,String(Math.round(s.wind.dir)).padStart(3,'0')+'°/'+Math.round(s.wind.spd),14,72,'#fff',18,'left',400,1);
    const ang=(toTrue(s.wind.dir,s.magvar)+180-(pln?0:s.hdg))*D2R; x.save(); x.translate(30,104); x.rotate(ang); x.strokeStyle='#fff'; x.lineWidth=2.5; x.beginPath(); x.moveTo(0,-15); x.lineTo(0,15); x.moveTo(-6,-7); x.lineTo(0,-15); x.lineTo(6,-7); x.stroke(); x.restore(); }
  if(!pln&&s.gs>30){ const tb=wrap180(s.trk-s.hdg)*D2R, tbc=exp?clamp(tb,-66*D2R,66*D2R):tb; x.save(); x.translate(cx+(R)*Math.sin(tbc),cy-(R)*Math.cos(tbc)); x.rotate(tbc); x.fillStyle='#fff'; x.beginPath(); x.moveTo(0,-2); x.lineTo(-7,12); x.lineTo(7,12); x.closePath(); x.fill(); x.restore(); }
  x.strokeStyle='#fff'; x.strokeRect(150,54,66,44); T(x,'RANGE',183,66,'#fff',12,'center'); T(x,String(range),183,86,'#fff',20,'center',400,1);
  if(EF.mode===0){ const R=navFor(), rx=R.rx; const t=(a,b,col)=>T(x,a,14,b,col,15,'left',700);
    if(R.ils){ t('ILS '+R.id,118,C.grn); T(x,fmtFreq(R.act)+'  '+R.ils.ident,14,138,'#fff',15,'left',400,1); T(x,'RWY '+R.ils.rwy.replace('RW','')+'  CRS '+fmtH(R.ils.crs)+'°',14,158,'#fff',14,'left',400,1);
      if(rx) T(x,'DME '+rx.dist.toFixed(1),14,178,'#fff',15,'left',400,1); }
    else t('ILS '+R.id+'  NO SIGNAL',118,C.amb); }
  const nxt=ahead.find(it=>!it.disco);
  if(nxt&&!pln){ T(x,fixName(nxt.l),786,20,C.mag,20,'right',700); T(x,fmtZ(zBase+nxt.d/Math.max(s.gs,60)*60).replace('Z','.0z'),786,44,'#fff',17,'right',400,1); T(x,nxt.d.toFixed(1)+'NM',786,66,'#fff',17,'right',400,1); }
  const ov=[['ARPT',EF.sw.arpt],['WPT',EF.sw.wpt],['STA',EF.sw.sta],['WX-A',EF.sw.wxr],['TERR',EF.sw.terr],['TFC',EF.sw.tfc]].filter(o=>o[1]); const bottom=vsd?(exp?470:500):640; ov.forEach((o,i)=>T(x,o[0],14,bottom-i*24-30,C.cyn,15,'left',700));
  const vt=(n,v,px,al)=>{ if(v===1) T(x,'OFF',px,bottom+10,'#fff',15,al,700); else { const RR=NAVR[n-1]; T(x,(v===0?'VOR ':'ADF ')+n,px,bottom-14,C.grn,17,al,700);
      if(v===0&&RR&&RR.ils&&RR.rx){ T(x,RR.ils.ident+'  '+fmtFreq(RR.act),px,bottom+6,'#fff',14,al,400,1); T(x,'DME '+RR.rx.dist.toFixed(1),px,bottom+24,'#fff',13,al,400); }
      else if(v===0&&RR){ T(x,fmtFreq(RR.act),px,bottom+6,'#fff',14,al,400,1); T(x,'DME ---',px,bottom+24,'#fff',13,al,400); }
      else { T(x,'------',px,bottom+6,'#fff',14,al,400,1); T(x,'DME ---',px,bottom+24,'#fff',13,al,400); } } };
  vt(1,EF.vor1===0?0:(EF.vor1===1?1:2),14,'left'); vt(2,EF.vor2===0?0:(EF.vor2===1?1:2),786,'right');
  if(!vsd) return;
  L(x,0,538,800,538,'#fff',3);
  /* VSD */
  const PX=22,PW=96,X0=140,XW=640,Y0=574,YH=122;
  const consts=ahead.filter(it=>!it.disco&&it.alt);
  let mx=Math.max(s.alt,m.alt,...consts.map(it=>it.alt.type==='W'?it.alt.alt2:it.alt.alt))+800; const ymax=[6000,10000,15000,20000,26000,32000,40000,46000,52000].find(v=>v>=mx)||52000;
  const yy=al=>Y0+YH-clamp(al,0,ymax)/ymax*YH, xx=d=>X0+d/range*XW, step=ymax<=10000?2000:ymax<=20000?5000:ymax<=32000?8000:10000;
  x.fillStyle='#b5b5b5'; x.fillRect(PX,Y0-6,PW,YH+12);
  for(let al=0;al<=ymax;al+=step){ L(x,PX+PW-10,yy(al),PX+PW,yy(al),'#000',2); T(x,String(al),PX+PW-14,yy(al),'#000',16,'right',400,1); }
  T(x,String(m.alt),PX+PW-6,556,C.mag,20,'right',400,1);
  for(let i=0;i<=4;i++){ const d=range*i/4; L(x,xx(d),Y0+YH+2,xx(d),Y0+YH+10,'#fff',2); T(x,String(Math.round(d)),xx(d),Y0+YH+24,'#fff',16,'center',400,1); }
  x.save(); x.beginPath(); x.rect(PX+PW,Y0-6,800-PX-PW,YH+14); x.clip();
  /* field elevation only (no terrain database yet) */
  const ge=groundElevAt(s); x.setLineDash([6,5]); x.strokeStyle=C.grn; x.lineWidth=2.5; x.beginPath(); x.moveTo(PX+PW,yy(ge)); x.lineTo(800,yy(ge)); x.stroke(); x.setLineDash([]);
  x.setLineDash([10,7]); L(x,PX+PW,yy(m.alt),800,yy(m.alt),C.mag,2); x.setLineDash([]);
  ahead.forEach((it,k)=>{ if(it.disco) return; const X=xx(it.d); if(X<PX+PW+4||X>800) return; const col=k===0?C.mag:'#fff';
    x.setLineDash([9,8]); L(x,X,Y0-2,X,Y0+YH,col,2); x.setLineDash([]); T(x,fixName(it.l),X,Y0-12,col,15,'center',700);
    if(it.alt){ const c=it.alt, lo=c.alt, hi=c.type==='W'?c.alt2:null; x.strokeStyle='#fff'; x.lineWidth=2.5;
      const glyph=(type,al)=>{ const Y=yy(al); x.beginPath(); if(type==='A'){ x.moveTo(X-8,Y+8); x.lineTo(X+8,Y+8); x.moveTo(X-8,Y+8); x.lineTo(X,Y-6); x.lineTo(X+8,Y+8); } else if(type==='B'){ x.moveTo(X-8,Y-8); x.lineTo(X+8,Y-8); x.moveTo(X-8,Y-8); x.lineTo(X,Y+6); x.lineTo(X+8,Y-8); } else { x.moveTo(X-8,Y-8); x.lineTo(X+8,Y-8); x.lineTo(X-8,Y+8); x.lineTo(X+8,Y+8); x.closePath(); } x.stroke(); };
      if(c.type==='W'){ glyph('A',lo); glyph('B',hi); } else glyph(c.type,lo);
      T(x,altConstraintText(c),X+12,yy(hi||lo)-14,'#fff',14,'left',400,1); } });
  { const path=buildPath(ahead), crz=crzAltFt(); if(path){ x.strokeStyle=C.mag; x.lineWidth=2.5; x.beginPath();
      if(s.vnPhase!=='DES'&&crz!=null){
        /* predicted profile: climb to the cruise altitude, level to the top of descent, then the descent path */
        const dTD=Math.max(0,path.total-todDtgOf(path,crz)), rate=Math.max(1800,(s.vnPhase==='CLB'&&s.vs>500)?s.vs:0), dToc=s.alt<crz-100?Math.min(dTD,(crz-s.alt)/rate*Math.max(s.gs,150)/60):0;
        x.moveTo(xx(0),yy(s.alt)); x.lineTo(xx(dToc),yy(crz)); x.lineTo(xx(dTD),yy(crz));
        for(let i=0;i<=80;i++){ const d=dTD+(range-dTD)*i/80; if(d<dTD) continue; const dtg=path.total-d; if(dtg<0) break; x.lineTo(xx(d),yy(Math.min(pathAltAt(path,dtg),crz))); }
      } else { let started=false;
        for(let i=0;i<=80;i++){ const d=range*i/80, dtg=path.total-d; if(dtg<0) break; const al=pathAltAt(path,dtg); if(crz!=null&&al>crz+5&&!started) continue; const px=xx(d), py=yy(Math.min(al,crz!=null?crz:al)); if(!started){ x.moveTo(px,py); started=true; } else x.lineTo(px,py); } }
      x.stroke(); } }
  const aR=s.alt+s.vs*(range/Math.max(s.gs,60)*60); L(x,X0+30,yy(s.alt),xx(range),yy(aR),'#fff',2.5);
  x.restore();
  const ay=yy(s.alt); x.fillStyle='#000'; x.strokeStyle='#fff'; x.lineWidth=2.5; x.beginPath(); x.moveTo(X0+34,ay); x.lineTo(X0-8,ay-13); x.lineTo(X0-8,ay+13); x.closePath(); x.fill(); x.stroke();
}

/* ---------- gauges & throttle ---------- */
const g1=$q('#g1').getContext('2d'), g2=$q('#g2').getContext('2d');
function gauge(x,lab){ const s=S; x.setTransform(2,0,0,2,0,0); x.fillStyle='#000'; x.fillRect(0,0,100,100);
  /* N1 display per FCOM: a lower half dial 0 (3 o'clock) through the bottom to 10 (9 o'clock), gray sector up to the actual N1, needle, redline,
     reference N1 (gray digits and bug), and the actual N1 in a box */
  const cx=44,cy=50,r=34, ang=v=>clamp(v,0,110)/100*Math.PI, P=(v,rad)=>[cx+rad*Math.cos(ang(v)),cy+rad*Math.sin(ang(v))];
  const n=clamp(s.n1,0,110);
  x.fillStyle='#808080'; x.beginPath(); x.moveTo(cx,cy); x.arc(cx,cy,r-1,0,ang(n),false); x.closePath(); x.fill();
  x.strokeStyle='#fff'; x.lineWidth=1.5; x.beginPath(); x.arc(cx,cy,r,0,ang(100),false); x.stroke();
  for(let v=0;v<=100;v+=10){ const a1=P(v,r), a2=P(v,r-(v%20===0?7:4)); L(x,a1[0],a1[1],a2[0],a2[1],'#fff',1);
    if(v%20===0){ const q=P(v,r-13); T(x,String(v/10),q[0],q[1],'#fff',8,'center',400,1); } }
  { const a1=P(104,r+1), a2=P(104,r-7); L(x,a1[0],a1[1],a2[0],a2[1],C.red,2.5); }
  const ref=n1LimitNow(); { const q=P(ref,r+4), an=ang(ref); x.save(); x.translate(q[0],q[1]); x.rotate(an+Math.PI); x.fillStyle='#aab'; x.beginPath(); x.moveTo(0,0); x.lineTo(-6,-3.5); x.lineTo(-6,3.5); x.closePath(); x.fill(); x.restore(); }
  { const q=P(n,r); L(x,cx,cy,q[0],q[1],'#fff',1.6); }
  T(x,ref.toFixed(1),96,9,'#a9a9a9',12,'right',400,1);
  x.fillStyle='#000'; x.strokeStyle='#fff'; x.lineWidth=1.3; x.fillRect(46,14,50,22); x.strokeRect(46,14,50,22);
  T(x,s.n1.toFixed(1),93,25,'#fff',17,'right',700,1);
  T(x,'N1',80,86,'#9aa',9,'center',400); }
const QH=284, LH_=64;
(function(){ const sc=$q('#scale'); [[30,'IDLE'],[60,'60'],[93,'CLB'],[95,'TO/GA']].forEach(([n,t],i)=>{ const f=(n-30)/65, y=(QH-18-LH_)-f*(QH-42-LH_)+LH_/2; const el=document.createElement('span'); el.textContent=t; el.style.top=y+'px'; if(i%2) el.className='r'; sc.appendChild(el); }); })();
function syncThr(){ const s=S; const y=(QH-18-LH_)-s.lever*(QH-42-LH_); ['#lva','#lvb'].forEach(q=>$q(q).style.top=y+'px');
  $q('#atS').textContent=atLabel()||'OFF'; $q('#n1c').textContent=s.n1cmd.toFixed(1)+' %'; $q('#lvS').textContent=Math.round(s.lever*100)+' %'; $q('#fuelS').textContent=(s.fuelKg/453.59237).toFixed(1)+' k lb'; $q('#engstart').hidden=s.engOn||!s.gnd;
  gauge(g1,'N1 · 1'); gauge(g2,'N1 · 2'); }
(function(){ const tr=$q('#track'); let drag=false;
  const mv=e=>{ const r=tr.getBoundingClientRect(); const yy=e.clientY-r.top-LH_/2; S.lever=clamp(1-(yy-24)/(QH-42-LH_),0,1);
    S.lvHeld=true; if(!S.atArm||['ARM','THR HLD','OFF',''].includes(S.modes.at)) S.lvHeld=false; };
  tr.addEventListener('pointerdown',e=>{
    if(e.target.dataset.atd!==undefined){ atDisc('A/T disengage switch pushed — A/T disconnected and the ARM switch returned to OFF.'); return; }
    if(e.target.dataset.toga!==undefined){ press('toga'); return; }
    if(e.target.classList.contains('lv')||e.target===tr){ drag=true; tr.setPointerCapture(e.pointerId); mv(e);} });
  tr.addEventListener('pointermove',e=>{ if(drag) mv(e); }); const rel=()=>{ drag=false; S.lvHeld=false; }; tr.addEventListener('pointerup',rel); tr.addEventListener('pointercancel',rel); })();

/* ---------- time history ---------- */
let curX=null;
$q('#scope').addEventListener('pointermove',e=>{ const r=e.currentTarget.getBoundingClientRect(); curX=(e.clientX-r.left)/r.width*1200; });
$q('#scope').addEventListener('pointerleave',()=>curX=null);
const STR=[
 {lab:'ALTITUDE',u:'ft',h:120,g:o=>o.alt,t:o=>o.mAlt,tl:'MCP',span:300,f:v=>String(Math.round(v/10)*10),fill:1},
 {lab:'IAS',u:'kt',h:100,g:o=>o.ias,t:o=>o.mSpd,tl:'MCP',span:20,f:v=>v.toFixed(0)},
 {lab:'V/S',u:'fpm',h:100,g:o=>o.vs,t:o=>o.vsCmd,tl:'A/P CMD',span:1200,f:v=>String(Math.round(v/10)*10),zero:1},
 {lab:'N1',u:'%',h:100,g:o=>o.n1,t:o=>o.n1c,tl:'CMD',fixed:[20,100],f:v=>v.toFixed(1)},
 {lab:'HEADING',u:'°',h:100,g:o=>o.hdgU,t:o=>o.hBug,tl:'MCP',span:30,f:v=>String(Math.round(wrap360(v))).padStart(3,'0')}
];
const KCOL={at:'#f4b73a',roll:'#41d3ea',pitch:'#39e58c'};
function drawScope(){
  const x=SPc.ctx, s=S; x.setTransform(SPc.k,0,0,SPc.k,0,0); x.fillStyle='#05080b'; x.fillRect(0,0,1200,700);
  const X0=78,PW=1200-78-150,t1=s.t,t0=t1-WIN,tx=t=>X0+(t-t0)/WIN*PW;
  [['at','A/T'],['roll','ROLL'],['pitch','PITCH']].forEach(([k,lab],i)=>{ const y=6+i*22; T(x,lab,X0-8,y+9,'#7a8a9b',10,'right',400);
    const ev=s.events.filter(e=>e.kind===k);
    ev.forEach((e,j)=>{ const ta=e.t,tb=j+1<ev.length?ev[j+1].t:t1; if(tb<t0||ta>t1)return; const xa=tx(Math.max(ta,t0)),xb=tx(tb),wd=xb-xa;
      x.fillStyle='#10202a'; x.fillRect(xa+.5,y,Math.max(wd-1,0),18); x.fillStyle=KCOL[k]; x.fillRect(xa+.5,y,2,18);
      const txt=e.text==='OFF'?'—':(e.text||'CWS'), col=(e.text==='OFF')?'#5d6b79':(e.text===''?C.amb:KCOL[k]); x.font=`700 11px ${FS}`; if(wd>x.measureText(txt).width+14) T(x,txt,xa+8,y+9,col,11,'left',700); }); });
  let y=82;
  s.events.forEach(e=>{ if(e.t<=0||e.t<t0)return; x.setLineDash([3,4]); L(x,tx(e.t),72,tx(e.t),700-42,KCOL[e.kind]+'55',1); x.setLineDash([]); });
  const vis=s.hist.filter(o=>o.t>=t0-1);
  const tc=curX!=null&&curX>=X0&&curX<=X0+PW?t0+(curX-X0)/PW*WIN:null;
  let near=null; if(tc!=null&&vis.length){ near=vis.reduce((a,b)=>Math.abs(b.t-tc)<Math.abs(a.t-tc)?b:a); }
  const cur=near||s.hist[s.hist.length-1];
  STR.forEach(st=>{
    const ys0=y,h=st.h; let lo,hi;
    if(st.fixed){[lo,hi]=st.fixed;} else { lo=1e9;hi=-1e9; vis.forEach(o=>{ for(const v of [st.g(o),st.t(o)]){ if(v<lo)lo=v; if(v>hi)hi=v; } }); if(lo>hi){lo=0;hi=1;}
      if(st.zero){ lo=Math.min(lo,0); hi=Math.max(hi,0);} if(hi-lo<st.span){ const c=(hi+lo)/2; lo=c-st.span/2; hi=c+st.span/2; } const pd=(hi-lo)*0.1; lo-=pd; hi+=pd; }
    const yv=v=>ys0+h-(v-lo)/(hi-lo)*h;
    x.fillStyle='#0a1016'; x.fillRect(X0,ys0,PW,h);
    for(let i=0;i<=3;i++){ const v=lo+(hi-lo)*i/3, yy=yv(v); L(x,X0,yy,X0+PW,yy,'#16212b',1); T(x,st.f(v),X0-8,yy,'#5d6b79',10,'right',400,1); }
    for(let tt=Math.ceil(t0/(WIN/10))*(WIN/10);tt<=t1;tt+=WIN/10) L(x,tx(tt),ys0,tx(tt),ys0+h,'#111a23',1);
    if(st.zero) L(x,X0,yv(0),X0+PW,yv(0),'#33404d',1);
    x.save(); x.beginPath(); x.rect(X0,ys0,PW,h); x.clip();
    if(vis.length>1){
      if(st.fill){ x.beginPath(); x.moveTo(tx(vis[0].t),ys0+h); vis.forEach(o=>x.lineTo(tx(o.t),yv(st.g(o)))); x.lineTo(tx(vis[vis.length-1].t),ys0+h); x.closePath(); x.fillStyle='rgba(57,229,140,.08)'; x.fill(); }
      x.setLineDash([5,4]); x.strokeStyle=C.mag; x.lineWidth=1.5; x.beginPath(); vis.forEach((o,i)=>{ const p=tx(o.t),q=yv(st.t(o)); i?x.lineTo(p,q):x.moveTo(p,q); }); x.stroke(); x.setLineDash([]);
      x.strokeStyle='#39e58c'; x.lineWidth=2; x.beginPath(); vis.forEach((o,i)=>{ const p=tx(o.t),q=yv(st.g(o)); i?x.lineTo(p,q):x.moveTo(p,q); }); x.stroke();
      const l=vis[vis.length-1]; x.fillStyle='#39e58c'; x.beginPath(); x.arc(tx(l.t),yv(st.g(l)),3.5,0,7); x.fill(); }
    if(tc!=null) L(x,curX,ys0,curX,ys0+h,'#ffffff66',1);
    x.restore(); x.strokeStyle='#1f2b37'; x.strokeRect(X0+.5,ys0+.5,PW,h);
    const rx=X0+PW+14; T(x,st.lab+' ('+st.u+')',rx,ys0+11,'#7a8a9b',10,'left',400);
    if(cur){ T(x,st.f(st.g(cur)),rx,ys0+36,'#39e58c',22,'left',700,1); T(x,st.tl+' '+st.f(st.t(cur)),rx,ys0+58,C.mag,12,'left',400,1); }
    y+=h+14; });
  const base=y-14+16;
  for(let tt=Math.ceil(t0/(WIN/10))*(WIN/10);tt<=t1+0.01;tt+=WIN/10){ if(tt<0)continue; T(x,Math.abs(tt-t1)<0.5?'now':Math.round(tt-t1)+'s',tx(tt),base,'#5d6b79',10,'center',400,1); }
  if(tc!=null) T(x,'T+'+Math.round(tc)+'s',curX,base+14,'#fff',11,'center',700,1);
}

