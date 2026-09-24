'use strict';
/* Airplane configuration: flaps, landing gear, speed brake, autobrake — the control stand next to the thrust levers.
   Effects on the flight model are drag (extra N1 needed for level flight), placard speeds and the PFD speed-tape limits. */
const CFG=window.FMC_CONFIG;
const SB_NAMES=['DOWN','ARMED','FLT DET','UP'], SB_TARGET=[0,0,0.5,1];
const AB_POS=['RTO','OFF','1','2','3','MAX'];

function cfgNew(flapDeg,gearDown){ return {flapSel:flapDeg||0,flapPos:flapDeg||0,gearSel:gearDown?1:0,gearPos:gearDown?1:0,sbSel:0,sbPos:0,ab:'OFF',abDisarm:false,abLight:0}; }
function interpMap(map,x){ const k=Object.keys(map).map(Number).sort((a,b)=>a-b); if(x<=k[0]) return map[k[0]]; for(let i=1;i<k.length;i++){ if(x<=k[i]){ const a=k[i-1], b=k[i], f=(x-a)/(b-a); return map[a]+(map[b]-map[a])*f; } } return map[k[k.length-1]]; }

/* extra N1 (thrust) the airplane needs because of its configuration */
function configDragN1(){
  const c=S.cfg; if(!c) return 0; const v=Math.pow(Math.max(S.ias,100)/200,2);
  return (interpMap(CFG.flapDragN1,c.flapPos)+CFG.gearDragN1*c.gearPos+CFG.speedbrakeDragN1*c.sbPos)*v;
}
/* flap maneuvering speed for a flap setting: VREF40 + offset (your table); flaps 30 uses VREF30, flaps 40 VREF40 */
function maneuverSpeed(flapDeg){
  const vr=fmcVrefs(); if(!vr.v40) return null; const off=CFG.flapManeuverOffset[flapDeg]; if(off==null) return null;
  if(off==='REF30') return vr.v30||vr.v40; return vr.v40+off;
}
/* placard speed for the selected flap detent */
const vfeNow=()=>CFG.flapVFE[S.cfg.flapSel]||340;
/* low-speed limit shown as a barber pole: 86% of the maneuvering speed for the selected flap (placeholder until the FMC supplies it) */
function cfgMinSpeed(){ const m=maneuverSpeed(S.cfg.flapSel); return m?m*0.86:112+S.alt/1000*0.6; }

function configStep(dt){
  const c=S.cfg; if(!c) return;
  const dF=c.flapSel-c.flapPos; if(Math.abs(dF)>0.01) c.flapPos+=clamp(dF,-CFG.flapRateDegPerSec*dt,CFG.flapRateDegPerSec*dt);
  const dG=c.gearSel-c.gearPos; if(Math.abs(dG)>0.001) c.gearPos+=clamp(dG,-dt/(c.gearSel?CFG.gearDownSec:CFG.gearUpSec),dt/(c.gearSel?CFG.gearDownSec:CFG.gearUpSec));
  const dS=SB_TARGET[c.sbSel]-c.sbPos; if(Math.abs(dS)>0.005) c.sbPos+=clamp(dS,-dt*0.6,dt*0.6);
  if(c.abLight>0) c.abLight-=dt;
}

/* ---- control stand panel (SVG) ---- */
const svgS=$q('#standsvg'); const STAND={};
function standPanel(){
  CUR=svgS;
  E('rect',{x:2,y:2,width:396,height:316,rx:6,fill:'#2a2f35',stroke:'#4a525b','stroke-width':3});
  /* --- speed brake --- */
  lab(56,20,'SPEED BRAKE',12); STAND.sbY=[52,110,180,248];
  E('rect',{x:47,y:44,width:18,height:212,rx:8,fill:'#0a0c0f',stroke:'#3d4650','stroke-width':2});
  SB_NAMES.forEach((n,i)=>{ lab(90,STAND.sbY[i],n,11,'start',null,'#c9d2db'); E('line',{x1:64,y1:STAND.sbY[i],x2:84,y2:STAND.sbY[i],stroke:'#6b7682','stroke-width':2}); });
  STAND.sb=lever(56,STAND.sbY,i=>press('sb'+i),'sb');
  /* --- flaps --- */
  lab(196,20,'FLAPS',12); STAND.flY=CFG.flapDetents.map((d,i)=>48+i*29.5);
  E('rect',{x:187,y:36,width:18,height:226,rx:8,fill:'#0a0c0f',stroke:'#3d4650','stroke-width':2});
  CFG.flapDetents.forEach((d,i)=>{ lab(178,STAND.flY[i],d===0?'UP':String(d),12,'end',null,'#f4f4f4'); E('line',{x1:205,y1:STAND.flY[i],x2:214,y2:STAND.flY[i],stroke:'#6b7682','stroke-width':2}); });
  STAND.fl=lever(196,STAND.flY,i=>press('fl'+i),'fl');
  STAND.flTxt=lab(24,296,'',14,'start',null,'#39e58c');
  /* --- gear --- */
  lab(310,20,'LANDING GEAR',12); STAND.gY=[70,150];
  E('rect',{x:301,y:44,width:18,height:130,rx:8,fill:'#0a0c0f',stroke:'#3d4650','stroke-width':2});
  lab(338,70,'UP',11,'start',null,'#c9d2db'); lab(338,150,'DN',11,'start',null,'#c9d2db');
  STAND.g=lever(310,STAND.gY,i=>press('gr'+i),'g',true);
  STAND.lights=['N','L','R'].map((n,i)=>{ const cx=326+i*26; const c=E('circle',{cx,cy:198,r:9,fill:'#0f2a1a',stroke:'#2b3a30','stroke-width':2}); lab(cx,216,n,10,'middle',null,'#8b98a5'); return c; });
  STAND.grTxt=lab(352,232,'',11,'middle',null,'#c9d2db');
  /* --- autobrake --- */
  lab(290,262,'AUTO BRAKE',11); STAND.abPos=AB_POS.map((n,i)=>{ const x=222+i*30, t=lab(x,292,n,11,'middle',null,'#c9d2db'); t.style.cursor='pointer'; t.addEventListener('click',()=>press('ab'+n)); return t; });
  STAND.abLight=E('circle',{cx:384,cy:262,r:6,fill:'#3a2a0a',stroke:'#5a4514','stroke-width':1.5}); lab(372,262,'DISARM',8,'end',null,'#8b98a5');
  CUR=svgM;
}
/* a vertical lever with detents: drag or click a detent position */
function lever(cx,ys,cb,key,round){
  const g=E('g',{style:'cursor:grab',class:'hit'}); const h=round?E('circle',{cx,cy:ys[0],r:14,fill:'#cfd5db',stroke:'#1c2126','stroke-width':3},g):E('rect',{x:cx-17,y:ys[0]-11,width:34,height:22,rx:6,fill:'#cfd5db',stroke:'#1c2126','stroke-width':3},g);
  E('line',{x1:cx-9,y1:ys[0],x2:cx+9,y2:ys[0],stroke:'#5a626b','stroke-width':3},g);
  const hit=E('rect',{x:cx-40,y:Math.min(...ys)-16,width:80,height:Math.max(...ys)-Math.min(...ys)+32,fill:'transparent',style:'cursor:ns-resize',touchAction:'none'},g); let drag=false;
  const svgEl=svgS, pos=e=>{ const r=svgEl.getBoundingClientRect(); return (e.clientY-r.top)/r.height*320; };
  const nearest=y=>ys.reduce((b,v,i)=>Math.abs(v-y)<Math.abs(ys[b]-y)?i:b,0);
  hit.addEventListener('pointerdown',e=>{ drag=true; hit.setPointerCapture(e.pointerId); cb(nearest(pos(e))); });
  hit.addEventListener('pointermove',e=>{ if(drag) cb(nearest(pos(e))); }); hit.addEventListener('pointerup',()=>drag=false);
  return {h,ys,round,cx,hline:g.children[1]};
}
function setLever(L,i){ const y=L.ys[i]; if(L.round){ L.h.setAttribute('cy',y); } else L.h.setAttribute('y',y-11); L.hline.setAttribute('y1',y); L.hline.setAttribute('y2',y); }
function syncStand(){
  const c=S.cfg; if(!c) return;
  setLever(STAND.sb,c.sbSel); setLever(STAND.fl,CFG.flapDetents.indexOf(c.flapSel)); setLever(STAND.g,c.gearSel?1:0);
  const transit=Math.abs(c.flapSel-c.flapPos)>0.3;
  STAND.flTxt.textContent=(transit?'FLAPS TRANSIT ':'FLAPS ')+(Math.round(c.flapPos)===0?'UP':Math.round(c.flapPos));
  STAND.flTxt.setAttribute('fill',transit?'#f4b73a':'#39e58c');
  const down=c.gearPos>=0.999, up=c.gearPos<=0.001;
  STAND.lights.forEach(l=>l.setAttribute('fill',down?'#2fe27f':(up?'#0f2a1a':'#f0524f'))); STAND.grTxt.textContent=down?'DOWN':(up?'UP':'TRANSIT');
  STAND.abPos.forEach((t,i)=>t.setAttribute('fill',AB_POS[i]===c.ab?'#39e58c':'#c9d2db')); STAND.abPos.forEach((t,i)=>t.setAttribute('font-weight',AB_POS[i]===c.ab?'700':'400'));
  STAND.abLight.setAttribute('fill',(c.abDisarm||c.abLight>0)&&Math.floor(performance.now()/400)%2===0?'#f4b73a':'#3a2a0a');
}
/* control stand switch handling (called from press) */
function standPress(a){
  const c=S.cfg;
  if(a.startsWith('fl')){ const d=CFG.flapDetents[+a.slice(2)]; if(d!==c.flapSel){ c.flapSel=d; if(S.ias>(CFG.flapVFE[d]||340)) msg('Flap placard speed exceeded: '+d+' is limited to '+CFG.flapVFE[d]+' kt.'); } return true; }
  if(a.startsWith('gr')){ const dn=+a.slice(2)===1; if(!dn&&S.gnd){ msg('The gear lever is locked down on the ground.'); return true; } if(dn!==!!c.gearSel){ c.gearSel=dn?1:0; if(dn&&S.ias>CFG.gearVLE) msg('Gear extended above VLE ('+CFG.gearVLE+' kt).'); } return true; }
  if(a.startsWith('sb')){ c.sbSel=+a.slice(2); return true; }
  if(a.startsWith('ab')){ const p=a.slice(2); if(AB_POS.includes(p)){ if(p==='RTO'&&!S.gnd){ msg('RTO can be selected only on the ground.'); return true; } c.ab=p; c.abDisarm=false; c.abLight=(p==='OFF'?0:1.5); if(p==='OFF') c.abLight=0; } return true; }
  return false;
}
standPanel();
