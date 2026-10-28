/* B737 FMC ACARS Trainer · Company data link / AOC (FCOM 737NG 11.33) and the SAT MENU (METAR) page.
   Loaded after cpdlc.js and shares its globals. Request/report/uplink statuses follow FCOM 11.33.2-11.33.12:
   a prompt shows REQUEST > SENDING > SENT; an uplink raises "<name> UPLINK READY" and the prompt becomes LOAD (or
   ACCEPT/REJECT for TAKEOFF); a failed link replaces prompts with FAIL, VOICE, NO COMM or FULL under the heading DATALINK.
   The company-side console card at the bottom of this file plays the airline dispatcher.
   Simplifications: PERF INIT, WIND and DES FORECAST data are applied at LOAD (the EXEC/ERASE step is not modelled). */
(function(){'use strict';
const CP=window.CP,API=CPDLC.api,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NAMES={RTE:'RTE 1',ALTN:'ALTN',PERF:'PERF',TAKEOFF:'TAKEOFF',WIND:'WIND',DES:'DES FORECAST'};
const UPN={RTE:'RTE 1',ALTN:'ALTN',PERF:'PERF INIT',TAKEOFF:'TAKEOFF',WIND:'WIND',DES:'DES FORECAST'};
const AO=window.AO={st:{},up:{},log:[],auto:true,alert:'',done:{},metar:null,waiting:{},seq:1};
const ok=()=>CP.link==='READY';
const done=k=>{if(!AO.done[k]){AO.done[k]=true;API.tell();}};
const addLog=(dir,kind,sum)=>{const en={n:AO.seq++,t:API.nowMs(),dir,kind,sum,state:dir==='UP'?'NEW':'SENDING'};AO.log.unshift(en);return en;};
const later=(fn,ms)=>setTimeout(fn,ms);
const clearSoon=(kind,want)=>later(()=>{if(AO.st[kind]===want){AO.st[kind]='';API.redraw();}},5000);

/* ---------- aircraft side ---------- */
function request(kind,arg){
 if(!ok())throw Error(CP.link);
 if(AO.st[kind]==='SENDING')return;
 const p=kind==='POS'?API.posData():null;
 const sum=kind==='POS'?`POS ${p.pos} ${p.ata} ${p.alt} FUEL ${p.fuelHM}`:kind==='METAR'?'METAR REQUEST '+arg:UPN[kind]+' REQUEST';
 AO.st[kind]='SENDING';const en=addLog('DN',kind==='POS'?'POS REPORT':kind,sum);
 API.redraw();
 later(()=>{
  AO.st[kind]='SENT';en.state='SENT';done(kind==='POS'?'posRpt':kind==='METAR'?'metarReq':'reqSent');clearSoon(kind,'SENT');
  if(kind!=='POS'){if(AO.auto)later(()=>respond(kind,arg),1500);else AO.waiting[kind]=arg||true;}
  API.redraw();
 },CP.ground.ackMs);
}
async function press(kind){
 if(!ok())throw Error(CP.link);
 if(AO.up[kind]){if(kind==='TAKEOFF')return takeoff(true);return load(kind);}
 request(kind);
}
async function load(kind){
 const d=AO.up[kind];if(!d)return;
 if(kind==='RTE')await API.loadRoute({ids:d.ids,origin:d.orig,dest:d.dest});
 else apply(kind,d);
 finish(kind,UPN[kind]+(kind==='RTE'?' LOADED · REVIEW LEGS AND EXEC':' LOADED'));
 done(kind==='RTE'?'loadRte':kind==='PERF'?'perfLoad':kind==='WIND'?'windLoad':'desLoad');
}
function takeoff(accept){
 const d=AO.up.TAKEOFF;if(!d)return;
 if(accept){apply('TAKEOFF',d);finish('TAKEOFF','TAKEOFF DATA ACCEPTED');done('toAccept');}
 else{finish('TAKEOFF','TAKEOFF DATA REJECTED');done('toReject');}
}
function finish(kind,msg){
 const en=AO.log.find(x=>x.dir==='UP'&&x.kind===kind&&x.state==='NEW');if(en)en.state=kind==='TAKEOFF'&&/REJECT/.test(msg)?'REJECTED':'LOADED';
 delete AO.up[kind];AO.st[kind]='LOADED';message=msg;clearSoon(kind,'LOADED');API.redraw();
}
function apply(kind,d){
 const P=e.perf;
 if(kind==='PERF'){P.zfw=d.zfw;P.reserves=d.reserves;P.costIndex=d.costIndex;P.crzAlt=d.crzAlt;}
 else if(kind==='TAKEOFF'){P.flaps=d.flaps;P.cg=d.cg;P.vSpeedsOff=false;P.v1=d.v1;P.vr=d.vr;P.v2=d.v2;try{P.speedSignature=takeoffSignature();}catch{}}
 else if(kind==='WIND')P.crzWind=d.crzWind;
 else if(kind==='DES')P.desForecast=d;
 else if(kind==='ALTN')P.altn=d.id;
}
const label=(kind,name)=>ok()?name:'DATALINK';
function value(kind,side){
 if(!ok()){AO.done.linkBad=true;return CP.link;}
 const s=AO.st[kind],up=AO.up[kind];
 if(up){const t=kind==='TAKEOFF'?'ACCEPT':'LOAD';return side==='R'?t+'>':'<'+t;}
 if(s==='SENDING'||s==='SENT'||s==='LOADED')return s;
 return side==='R'?'REQUEST>':'<REQUEST';
}
function pgComm(){
 title('FMC COMM');
 ['RTE','ALTN','PERF','TAKEOFF','WIND','DES'].forEach((k,i)=>row(i,label(k,NAMES[k]),value(k,'L'),'','',()=>press(k)));
 const pr=!ok()?CP.link:AO.st.POS==='SENDING'?'SENDING':AO.st.POS==='SENT'?'SENT':'REPORT>';
 rows[0].rl=ok()?'POS REPORT':'DATALINK';rows[0].rv=pr;rows[0].right=()=>request('POS');
 if(AO.up.TAKEOFF){rows[3].rv='REJECT>';rows[3].right=()=>takeoff(false);}
 rows[5].rl='COMPANY';rows[5].rv='AOC LOG>';rows[5].right=()=>{go('AOC LOG');done('aocLog');};
}
function pgLog(){
 const n=AO.log.length,pages=Math.max(1,Math.ceil(n/5));title('AOC LOG',pages);
 for(let i=0;i<5;i++){const en=AO.log[pageNo*5+i];if(!en)continue;row(i,API.Zt(en.t)+' '+(en.dir==='UP'?'▲':'▼')+' '+en.kind,'<'+en.sum.slice(0,19),'',en.state);}
 if(!n)row(1,'','NO COMPANY MESSAGES');
 foot('<FMC COMM','',()=>go('FMC COMM'));
}
/* SAT MENU / METAR (simulator page behind ATC INDEX > METAR) */
function pgSat(){
 title('SAT MENU',1);
 const st=AO.st.METAR;
 row(0,'METAR',!ok()?CP.link:st==='SENDING'?'SENDING':st==='SENT'?'SENT':'<GET METAR',null,'',async()=>{
  if(!ok())throw Error(CP.link);if(st==='SENDING')return;
  let icao=scratch?take():(e.route.destination||e.scenario?.destination||e.route.origin||e.scenario?.origin||'');
  if(!/^[A-Z]{4}$/.test(icao))throw Error('INVALID ENTRY');
  request('METAR',icao);
 });
 if(AO.metar)row(1,'','<VIEW '+AO.metar.icao,'','',()=>go('METAR'));
 foot('<INDEX','PRINT >',()=>go('ATC'),()=>toast('Printing is not simulated.'));
}
function pgMetar(){
 const M=AO.metar;title('METAR');
 if(!M){row(1,'','NO METAR');foot('<SAT MENU','',()=>go('SAT MENU'));return;}
 M.lines.slice(0,5).forEach((t,i)=>row(i,i===0?API.Zt(M.t):'',t));
 foot('<SAT MENU','',()=>go('SAT MENU'));
}
CPDLC.register('FMC COMM',pgComm,'11.33.12');CPDLC.register('AOC LOG',pgLog,'11.33.12');
CPDLC.register('SAT MENU',pgSat,'11.33.1');CPDLC.register('METAR',pgMetar,'11.33.1');

/* ---------- company (dispatcher) side ---------- */
const hz=()=>{const d=new Date(API.nowMs());return String(d.getUTCDate()).padStart(2,'0')+String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0')+'Z';};
function coRoute(){
 let ids=API.routeIds().filter(id=>id!==e.route.destination);
 if(ids.length<4){const o=db.airports[e.scenario.origin],d=db.airports[e.scenario.destination];try{ids=e.trainingRoute(o,d).map(p=>p.id).filter(id=>id!==d.id&&id!==o.id);}catch{}}
 return {ids,dest:e.route.destination||e.scenario?.destination||'DEST',orig:e.route.origin||e.scenario?.origin||'ORIG'};
}
async function respond(kind,arg){
 if(kind==='METAR')return replyMetar(arg);
 if(!ok())return {ok:false,why:'Data link status is '+CP.link+'; the uplink cannot be delivered.'};
 const ground=e.aircraft.phase==='preflight',orig=e.route.origin||e.scenario?.origin;
 if(kind==='PERF'&&(!ground||!orig)){const why=!ground?'PERF INIT uplinks are available only on the ground.':'PERF INIT needs an origin airport entered on the RTE page first.';AO.log.unshift({n:AO.seq++,t:API.nowMs(),dir:'UP',kind:'PERF',sum:'NO DATA SENT',state:'NONE'});delete AO.waiting.PERF;done('perfRule');API.redraw();return {ok:false,why};}
 if(kind==='TAKEOFF'&&!ground){delete AO.waiting.TAKEOFF;API.redraw();return {ok:false,why:'TAKEOFF data is only sent on the ground.'};}
 let d;
 if(kind==='RTE'){await ensureFixes();d=coRoute();d.sum=`${d.orig}-${d.dest} ${d.ids.slice(0,3).join(' ')}${d.ids.length>3?'..':''}`;}
 else if(kind==='PERF')d={zfw:'62.4',reserves:'5.0',costIndex:'30',crzAlt:formatAltitude(35000),sum:'ZFW 62.4 RSV 5.0 CI 30'};
 else if(kind==='TAKEOFF')d={flaps:'5',cg:'18.5',v1:'138',vr:'140',v2:'145',sum:'FLAP 5 V1 138 VR 140 V2 145'};
 else if(kind==='WIND')d={crzWind:'270°/85',sum:'CRZ WIND 270/85'};
 else if(kind==='DES')d={fl240:'260/60',fl100:'240/35',sum:'FL240 260/60 FL100 240/35'};
 else if(kind==='ALTN')d={id:e.route.origin||e.scenario?.origin||'KMCI',sum:'ALTN '+(e.route.origin||e.scenario?.origin||'KMCI')};
 delete AO.waiting[kind];
 const en=addLog('UP',kind,d.sum);
 if(kind==='ALTN'){apply('ALTN',d);en.state='LOADED';AO.st.ALTN='LOADED';message='ALTN UPLINK LOADED';clearSoon('ALTN','LOADED');done('altn');API.chime();API.redraw();return {ok:true};}
 AO.up[kind]=d;AO.alert=UPN[kind]+' UPLINK READY';done('upReady');API.chime();API.redraw();return {ok:true};
}
function replyMetar(icao){
 delete AO.waiting.METAR;
 const lines=API.wrap(`${icao} ${hz()} 18008KT 10SM FEW050 SCT250 21/09 A2992 RMK AO2 SLP132 TRAINING SAMPLE NOT REAL WEATHER`);
 AO.metar={icao,lines,t:API.nowMs()};addLog('UP','METAR',icao+' METAR').state='LOADED';
 AO.alert='METAR UPLINK READY';API.chime();done('metar');
 if(page==='SAT MENU'){message='';AO.alert='';go('METAR');}else API.redraw();
 return {ok:true};
}
const ACARS_CHECK=[
 ['Requests and reports',[['reqSent','REQUEST: SENDING then SENT status'],['posRpt','POS REPORT downlink (FMC COMM)'],['linkBad','FAIL / VOICE / NO COMM / FULL replaces the prompts under DATALINK'],['aocLog','AOC LOG reviewed']]],
 ['Uplinks',[['upReady','"... UPLINK READY" message, hi/lo chime'],['loadRte','RTE 1 uplink: LOAD, then EXEC'],['perfLoad','PERF INIT uplink LOADed (on the ground)'],['perfRule','PERF INIT refused airborne / without an origin'],['toAccept','TAKEOFF data ACCEPT'],['toReject','TAKEOFF data REJECT'],['windLoad','WIND uplink LOAD'],['desLoad','DES FORECAST uplink LOAD'],['altn','ALTN uplink loads automatically (REQUEST only)']]],
 ['Weather',[['metarReq','METAR request (ATC INDEX > METAR > GET METAR)'],['metar','METAR uplink received']]]
];
const NOTES={
 RTE:'RTE 1 request or unsolicited uplink: the prompt becomes LOAD (the route goes into the MOD plan), then EXEC activates it. FCOM 11.33.7.',
 ALTN:'ALTN needs only REQUEST: data loads by itself and the scratchpad reports ALTN UPLINK LOADED. FCOM 11.33.9.',
 PERF:'PERF INIT uplink is only for the ground and after an origin is entered on RTE. Airborne, nothing is sent. FCOM 11.33.4.',
 TAKEOFF:'TAKEOFF data arrives for preview: ACCEPT keeps it, REJECT restores the previous data. FCOM 11.33.6.',
 WIND:'Cruise winds uplink: LOAD. In the real airplane EXEC/ERASE follows; this trainer applies the data at LOAD.',
 DES:'DES FORECAST needs a cruise altitude; data is stored (this trainer has no DES FORECASTS page).'
};
function build(){
 const grid=document.querySelector('#atc-console .cc-grid');if(!grid||$('ao-card'))return;
 const sel=$('cc-link');if(sel&&![...sel.options].some(o=>o.value==='FULL'))sel.add(new Option('FULL'));
 const d=document.createElement('div');d.className='cc-card cc-wide';d.id='ao-card';
 d.innerHTML=`<h3>Company (AOC) station · FCOM 11.33</h3>
  <div class="cc-note" id="ao-note">Company data link: the FMC COMM page and the REQUEST prompts on PERF INIT and TAKEOFF REF reach this station. Pick an uplink to send it unsolicited; set Data link status (FAIL, VOICE, NO COMM, FULL) in the first card.</div>
  <label class="cc-check"><input type="checkbox" id="ao-auto" checked> Answer crew requests automatically</label>
  <div class="cc-scn">${Object.keys(UPN).map(k=>`<button class="cc-s" data-ao-up="${k}"><strong>${esc(UPN[k])} uplink</strong><span>${k==='TAKEOFF'?'ACCEPT / REJECT':k==='ALTN'?'loads automatically':'LOAD'}</span></button>`).join('')}</div>
  <h4>From the aircraft (company)</h4><div id="ao-in" class="cc-inbox"></div>
  <h4>Company data link checklist <span id="ao-prog"></span></h4><div id="ao-check"></div><button id="ao-reset" class="quiet">Reset checklist</button>`;
 grid.appendChild(d);
 $('ao-auto').addEventListener('change',ev=>{AO.auto=ev.target.checked;});
 $('ao-reset').addEventListener('click',()=>{AO.done={};API.tell();});
 d.addEventListener('click',async ev=>{
  const u=ev.target.closest('[data-ao-up]');
  if(u){const k=u.dataset.aoUp;$('ao-note').textContent=NOTES[k];const r=await respond(k);if(r&&!r.ok)$('ao-note').textContent=r.why;return;}
  const r=ev.target.closest('[data-ao-reply]');
  if(r){const k=r.dataset.aoReply;const arg=AO.waiting[k];const res=await respond(k,arg===true?undefined:arg);if(res&&!res.ok)$('ao-note').textContent=res.why;}
 });
 paint();
}
function paint(){
 const inb=$('ao-in');if(!inb)return;
 inb.innerHTML=AO.log.length?AO.log.slice(0,20).map(en=>`<div class="cc-in"><span class="t">${API.Zt(en.t)}</span> <b>${en.dir==='UP'?'▲ UPLINK':'▼ DOWNLINK'}</b> ${esc(en.kind)} · ${esc(en.sum)} <em>${esc(en.state)}</em>${en.dir==='DN'&&AO.waiting[en.kind==='POS REPORT'?'':en.kind]&&en===AO.log.find(x=>x.dir==='DN'&&x.kind===en.kind)?`<div class="cc-btns"><button data-ao-reply="${en.kind}">Send uplink</button></div>`:''}</div>`).join(''):'<p class="muted">Company requests and reports from the aircraft appear here.</p>';
 let tot=0,got=0;
 $('ao-check').innerHTML=ACARS_CHECK.map(([t,items])=>`<h4>${esc(t)}</h4><ul>${items.map(([k,l])=>{tot++;if(AO.done[k])got++;return `<li class="${AO.done[k]?'done':''}"><i></i>${esc(l)}</li>`;}).join('')}</ul>`).join('');
 $('ao-prog').textContent=`${got}/${tot}`;
}
CP.listeners.push(paint);
document.addEventListener('DOMContentLoaded',build);
if(document.readyState!=='loading')build();

window.ACARS={state:AO,advisory:m=>/UPLINK (READY|LOADED)$|^(TAKEOFF DATA (ACCEPTED|REJECTED)|.* LOADED( ·.*)?)$/.test(m||''),
 preRender(){if(AO.alert&&!message){message=AO.alert;AO.alert='';}},
 label,value,press:k=>press(k),request,respond};
})();
