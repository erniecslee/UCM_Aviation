/* B737 FMC ACARS Trainer · Company data link / AOC (FCOM 737NG 11.33) and the SAT MENU (METAR) page.
   Loaded after cpdlc.js and shares its globals. Request/report/uplink statuses follow FCOM 11.33.2-11.33.12:
   a prompt shows REQUEST > SENDING > SENT; an uplink raises "<name> UPLINK READY" and the prompt becomes LOAD (or
   ACCEPT/REJECT for TAKEOFF); a failed link replaces prompts with FAIL, VOICE, NO COMM or FULL under the heading DATALINK.
   The company-side console card at the bottom of this file plays the airline dispatcher.
   LOAD on PERF INIT, PERF LIMITS, CRZ WIND and DES FORECASTS puts the data in the FMC for viewing with the EXEC light and an ERASE prompt (FCOM 11.33.9);
   ROUTE and CRZ WIND show an UPLINK LOADING phase with the keys locked, and holding DEL for 1 second suspends it (11.33.5).
   FMC data link messages follow FCOM 11.60.25-30. Simplifications: CRZ WIND is the single cruise wind of TAKEOFF REF 2/2, not RTE DATA waypoint winds;
   SUPP NAV DATA has no page of its own; the real accept/reject downlinks are shown in the AOC LOG only. */
(function(){'use strict';
const CP=window.CP,API=CPDLC.api,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NAMES={RTE:'RTE 1',ALTN:'ALTN',PERF:'PERF',TAKEOFF:'TAKEOFF',WIND:'WIND',DES:'DES FORECAST',LIMITS:'PERF LIMITS',NAV:'SUPP NAV'};
const UPN={RTE:'RTE 1',ALTN:'ALTN',PERF:'PERF INIT',TAKEOFF:'TAKEOFF',WIND:'WIND',DES:'DES FORECAST',LIMITS:'PERF LIMITS',NAV:'SUPP NAV'};
const REPN={POS:'POS REPORT',LIMREP:'PERF LIM REPORT',NAVREP:'SUPP NAV REPORT',PROGREP:'PROGRESS REPORT'};
const READY_MSG={RTE:'ROUTE 1 UPLINK READY',PERF:'PERF INIT UPLINK READY',WIND:'CRZ WIND UPLINK READY',DES:'FORECASTS UPLINK READY',LIMITS:'PERF LIMITS UPLINK READY'};
const LOADING_MSG={RTE:'ROUTE 1 UPLINK LOADING',WIND:'CRZ WIND UPLINK LOADING'};
const INVALID_MSG={RTE:'INVALID ROUTE UPLINK',PERF:'INVALID PERF INIT UPLINK',WIND:'INVALID CRZ WIND UPLINK',DES:'INVALID FORECASTS UPLINK',LIMITS:'INVALID LIMITS UPLINK',NAV:'INVALID NAV DATA UPLINK',ALTN:'INVALID ALTN DEST UPLINK',TAKEOFF:'INVALID TAKEOFF UPLINK'};
const PARTIAL_MSG={RTE:'PARTIAL ROUTE 1 UPLINK',PERF:'PARTIAL PERF INIT UPLINK',DES:'PARTIAL FORECASTS UPLINK',LIMITS:'PARTIAL LIMITS UPLINK',NAV:'PARTIAL NAV DATA UPLINK',ALTN:'PARTIAL ALTN DEST UPLINK'};
const FIELDS={PERF:['zfw','reserves','costIndex','crzAlt'],WIND:['crzWind'],DES:['desForecast'],LIMITS:['minCLB','maxCLB','minCRZ','maxCRZ','minDES','maxDES','rtaTolerance']};
const LOAD_MS=2500;
const AO=window.AO={st:{},up:{},mod:{},log:[],auto:true,alert:'',done:{},metar:null,waiting:{},seq:1,loading:null,rteMod:false,toMem:[],toSig:'',failNext:false,q:'OK',timer:0};
const ok=()=>CP.link==='READY';
const done=k=>{if(!AO.done[k]){AO.done[k]=true;API.tell();}};
const addLog=(dir,kind,sum)=>{const en={n:AO.seq++,t:API.nowMs(),dir,kind,sum,state:dir==='UP'?'NEW':'SENDING'};AO.log.unshift(en);return en;};
const later=(fn,ms)=>setTimeout(fn,ms);
const clearSoon=(kind,want,ms=5000)=>later(()=>{if(AO.st[kind]===want){AO.st[kind]='';API.redraw();}},ms);

/* ---------- aircraft side ---------- */
function request(kind,arg){
 if(!ok())throw Error(CP.link);
 if(AO.st[kind]==='SENDING')return;
 if(AO.failNext){AO.failNext=false;message='RESEND MESSAGE';done('resend');API.redraw();return;}
 const rep=!!REPN[kind];
 const p=kind==='POS'?API.posData():null;
 const sum=kind==='POS'?`POS ${p.pos} ${p.ata} ${p.alt} FUEL ${p.fuelHM}`:kind==='METAR'?'METAR REQUEST '+arg:rep?REPN[kind]:UPN[kind]+' REQUEST';
 AO.st[kind]='SENDING';const en=addLog('DN',rep?REPN[kind]:kind,sum);
 API.redraw();
 later(()=>{
  AO.st[kind]='SENT';en.state='SENT';done(kind==='POS'?'posRpt':kind==='METAR'?'metarReq':rep?'report':'reqSent');clearSoon(kind,'SENT',rep?3000:5000);
  if(!rep){if(AO.auto)later(()=>respond(kind,arg),1500);else AO.waiting[kind]=arg||true;}
  API.redraw();
 },CP.ground.ackMs);
}
async function press(kind){
 if(!ok())throw Error(CP.link);
 if(AO.loading)return;
 if(AO.up[kind]){if(kind==='TAKEOFF')return takeoff(true);return load(kind);}
 request(kind);
}
async function load(kind){
 const d=AO.up[kind];if(!d||AO.loading)return;
 if(LOADING_MSG[kind]){AO.loading={kind};message=LOADING_MSG[kind];API.redraw();AO.timer=later(()=>{commit(kind);},LOAD_MS);return;}
 await commit(kind);
}
const crzFt=()=>{const m=String(e.perf.crzAlt||'').match(/(\d+)/);if(!m)return '-----';return /^FL/i.test(e.perf.crzAlt)?String(+m[1]*100):m[1];};
const snap=kind=>{const o={};(FIELDS[kind]||[]).forEach(f=>{o[f]=e.perf[f];});return o;};
const restore=(kind,o)=>{Object.keys(o||{}).forEach(f=>{e.perf[f]=o[f];});};
async function commit(kind){
 const d=AO.up[kind];AO.loading=null;if(!d){API.redraw();return;}
 let msg;
 if(kind==='RTE'){
  await API.loadRoute({ids:d.partial?d.ids.slice(0,Math.ceil(d.ids.length/2)):d.ids,origin:d.orig,dest:d.dest});
  AO.rteMod=true;msg=d.partial?PARTIAL_MSG.RTE:'ROUTE 1 DATA UPLINK';
  addLog('DN','ACCEPT','ROUTE 1 LOAD ACCEPT').state='SENT';
 }else{
  const prev=snap(kind);apply(kind,d,d.partial);
  msg=d.partial?PARTIAL_MSG[kind]:kind==='PERF'?'PERF INIT UPLINK':kind==='WIND'?'CRZ WIND '+crzFt()+' UPLINK':kind==='DES'?'DESCENT FORECASTS UPLINK':'PERF LIMITS UPLINK';
  AO.mod[kind]={prev,d,msg};
 }
 const en=AO.log.find(x=>x.dir==='UP'&&x.kind===kind&&x.state==='NEW');if(en)en.state='LOADED';
 delete AO.up[kind];AO.st[kind]='LOADED';message=msg;clearSoon(kind,'LOADED');
 done(kind==='RTE'?'loadRte':kind==='PERF'?'perfLoad':kind==='WIND'?'windLoad':kind==='DES'?'desLoad':'limLoad');
 API.redraw();
}
function takeoff(accept){
 const d=AO.up.TAKEOFF;if(!d)return;
 if(accept){apply('TAKEOFF',d);finish('TAKEOFF','TAKEOFF DATA ACCEPTED','LOADED');done('toAccept');}
 else{finish('TAKEOFF','TAKEOFF DATA REJECTED','REJECTED');done('toReject');}
}
function finish(kind,msg,state){
 const en=AO.log.find(x=>x.dir==='UP'&&x.kind===kind&&x.state==='NEW');if(en)en.state=state;
 addLog('DN',/REJECT/.test(msg)?'REJECT':'ACCEPT',UPN[kind]+(/REJECT/.test(msg)?' REJECT':' ACCEPT')).state='SENT';
 delete AO.up[kind];AO.st[kind]=state;message='';try{toast(msg);}catch{}clearSoon(kind,state);API.redraw();
}
/* EXEC accepts every loaded data uplink, ERASE restores the previous data (FCOM 11.33.9) */
function exec(){
 let any=false;
 for(const k of Object.keys(AO.mod)){const m=AO.mod[k];addLog('DN','ACCEPT',UPN[k]+' EXEC ACCEPT').state='SENT';if(message===m.msg)message='';delete AO.mod[k];any=true;done('execData');}
 if(AO.rteMod&&e.execPending){addLog('DN','ACCEPT','ROUTE 1 EXEC ACCEPT').state='SENT';AO.rteMod=false;}
 return any;
}
function erase(){
 for(const k of Object.keys(AO.mod)){const m=AO.mod[k];restore(k,m.prev);addLog('DN','REJECT',UPN[k]+' ERASE REJECT').state='SENT';if(message===m.msg)message='';delete AO.mod[k];AO.st[k]='';done('eraseData');}
 API.redraw();
}
/* long DEL (1 s): suspend an uplink that is loading, or put loaded data back in the ready-to-load state (FCOM 11.33.5) */
function suspend(){
 if(AO.loading){const k=AO.loading.kind;clearTimeout(AO.timer);AO.loading=null;message=READY_MSG[k]||'';done('longDel');return true;}
 const k=Object.keys(AO.mod).pop();
 if(k){const m=AO.mod[k];restore(k,m.prev);AO.up[k]=m.d;delete AO.mod[k];AO.st[k]='';message=READY_MSG[k]||'';done('longDel');return true;}
 return false;
}
function apply(kind,d,partial){
 const P=e.perf;
 if(kind==='PERF'){P.zfw=d.zfw;P.reserves=d.reserves;if(!partial){P.costIndex=d.costIndex;P.crzAlt=d.crzAlt;}}
 else if(kind==='TAKEOFF'){P.flaps=d.flaps;P.cg=d.cg;P.vSpeedsOff=false;P.v1=d.v1;P.vr=d.vr;P.v2=d.v2;try{P.speedSignature=takeoffSignature();}catch{}}
 else if(kind==='WIND')P.crzWind=d.crzWind;
 else if(kind==='DES')P.desForecast=partial?{fl240:d.fl240}:d;
 else if(kind==='LIMITS'){['minCLB','maxCLB','minCRZ','maxCRZ','minDES','maxDES','rtaTolerance'].forEach((f,i)=>{if(!partial||i<2)P[f]=d[f];});}
 else if(kind==='NAV')P.suppNav=d.count;
 else if(kind==='ALTN')P.altn=d.id;
}
/* TAKEOFF data for several runways is kept in memory; it is offered when the RTE runway / TAKEOFF REF intersection matches (11.33 / 11.60.26) */
const rwy=()=>String(e.route.runway||'').toUpperCase();
function takeoffCheck(){
 if(!AO.toMem.length||AO.up.TAKEOFF)return;
 const R=rwy(),I=String(e.perf.intersect||'').toUpperCase(),sig=R+'/'+I;
 if(!R||sig===AO.toSig)return;
 const m=AO.toMem.find(x=>x.rwy===R&&x.int===I);
 AO.toSig=sig;if(!m)return;
 if(m.ok){AO.up.TAKEOFF=m.d;message='TAKEOFF DATA LOADED';done('toMatch');}
 else{message='INVALID TAKEOFF '+R+'/'+(I||'---');done('toInvalid');}
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
 title('FMC COMM',2);
 if(pageNo===0){
  ['RTE','ALTN','PERF','TAKEOFF','WIND'].forEach((k,i)=>row(i,label(k,NAMES[k]),value(k,'L'),'','',()=>press(k)));
  const pr=!ok()?CP.link:AO.st.POS==='SENDING'?'SENDING':AO.st.POS==='SENT'?'SENT':'REPORT>';
  rows[0].rl=ok()?'POS REPORT':'DATALINK';rows[0].rv=pr;rows[0].right=()=>request('POS');
  if(AO.up.TAKEOFF){rows[3].rv='REJECT>';rows[3].right=()=>takeoff(false);}
 }else{
  row(0,label('DES','DES FORECAST'),value('DES','L'),ok()?'VIEW':'DATALINK',ok()?'FORECASTS>':CP.link,()=>press('DES'),()=>go('DES FORECASTS'));
  row(1,label('LIMITS','PERF LIMITS'),value('LIMITS','L'),ok()?'PERF LIM':'DATALINK',ok()?(AO.st.LIMREP||'REPORT>'):CP.link,()=>press('LIMITS'),()=>request('LIMREP'));
  row(2,label('NAV','SUPP NAV'),value('NAV','L'),ok()?'SUPP NAV':'DATALINK',ok()?(AO.st.NAVREP||'REPORT>'):CP.link,()=>press('NAV'),()=>request('NAVREP'));
  row(3,ok()?'PROGRESS':'DATALINK',ok()?(AO.st.PROGREP||'<REPORT'):CP.link,ok()?'WEATHER':'DATALINK',ok()?(AO.st.METAR==='SENDING'||AO.st.METAR==='SENT'?AO.st.METAR:'REQUEST>'):CP.link,()=>request('PROGREP'),()=>request('METAR',e.route.destination||e.scenario?.destination||e.route.origin||''));
 }
 foot('<INDEX','AOC LOG>',()=>go('INDEX'),()=>{go('AOC LOG');done('aocLog');});
}
function pgLog(){
 const n=AO.log.length,pages=Math.max(1,Math.ceil(n/5));title('AOC LOG',pages);
 for(let i=0;i<5;i++){const en=AO.log[pageNo*5+i];if(!en)continue;row(i,API.Zt(en.t)+' '+(en.dir==='UP'?'▲':'▼')+' '+en.kind,'<'+en.sum.slice(0,19),'',en.state);}
 if(!n)row(1,'','NO COMPANY MESSAGES');
 foot('<FMC COMM','',()=>go('FMC COMM'));
}
function pgDes(){
 title('DES FORECASTS',1);const F=e.perf.desForecast;
 row(0,'TRANS LVL','FL'+String(Math.round((+e.perf.transAlt||18000)/100)),'CABIN RATE','--- FPM');
 row(1,'ALT   WIND','FL240  '+(F&&F.fl240?F.fl240:'---/--'),'','');
 row(2,'','FL100  '+(F&&F.fl100?F.fl100:'---/--'),'','');
 row(4,label('DES','DES FORECAST'),value('DES','L'),'','',()=>press('DES'));
 foot('<INDEX','',()=>go('INDEX'));
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
CPDLC.register('FMC COMM',pgComm,'11.33.12');CPDLC.register('AOC LOG',pgLog,'11.33.12');CPDLC.register('DES FORECASTS',pgDes,'11.33.9');
CPDLC.register('SAT MENU',pgSat,'11.33.1');CPDLC.register('METAR',pgMetar,'11.33.1');

/* ---------- company (dispatcher) side ---------- */
const hz=()=>{const d=new Date(API.nowMs());return String(d.getUTCDate()).padStart(2,'0')+String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0')+'Z';};
function coRoute(){
 let ids=API.routeIds().filter(id=>id!==e.route.destination);
 if(ids.length<4){const o=db.airports[e.scenario.origin],d=db.airports[e.scenario.destination];try{ids=e.trainingRoute(o,d).map(p=>p.id).filter(id=>id!==d.id&&id!==o.id);}catch{}}
 return {ids,dest:e.route.destination||e.scenario?.destination||'DEST',orig:e.route.origin||e.scenario?.origin||'ORIG'};
}
function takeoffMem(){
 const R=rwy()||'09L';
 return [
  {rwy:R,int:'',ok:true,d:{flaps:'5',cg:'18.5',v1:'138',vr:'140',v2:'145',sum:`RWY ${R} FLAP 5 V1 138 VR 140 V2 145`}},
  {rwy:R,int:'A3',ok:true,d:{flaps:'5',cg:'18.5',v1:'135',vr:'137',v2:'142',sum:`RWY ${R}/A3 FLAP 5 V1 135`}},
  {rwy:R,int:'B2',ok:false},
  {rwy:R==='36L'?'18R':'36L',int:'',ok:true,d:{flaps:'5',cg:'18.5',v1:'139',vr:'141',v2:'146',sum:'OTHER RWY FLAP 5 V1 139'}}
 ];
}
async function respond(kind,arg){
 if(kind==='METAR')return replyMetar(arg);
 if(!ok())return {ok:false,why:'Data link status is '+CP.link+'; the uplink cannot be delivered.'};
 const ground=e.aircraft.phase==='preflight',orig=e.route.origin||e.scenario?.origin;
 if(kind==='PERF'&&(!ground||!orig)){const why=!ground?'PERF INIT uplinks are available only on the ground.':'PERF INIT needs an origin airport entered on the RTE page first.';AO.log.unshift({n:AO.seq++,t:API.nowMs(),dir:'UP',kind:'PERF',sum:'NO DATA SENT',state:'NONE'});delete AO.waiting.PERF;done('perfRule');API.redraw();return {ok:false,why};}
 if(kind==='TAKEOFF'&&!ground){delete AO.waiting.TAKEOFF;API.redraw();return {ok:false,why:'TAKEOFF data is only sent on the ground.'};}
 delete AO.waiting[kind];
 if(AO.q==='INVALID'){addLog('UP',kind,UPN[kind]+' (BAD DATA)').state='INVALID';AO.alert=INVALID_MSG[kind];API.chime();done('invalidUp');API.redraw();return {ok:true};}
 const partial=AO.q==='PARTIAL'&&PARTIAL_MSG[kind];
 let d;
 if(kind==='RTE'){await ensureFixes();d=coRoute();d.sum=`${d.orig}-${d.dest} ${d.ids.slice(0,3).join(' ')}${d.ids.length>3?'..':''}`;}
 else if(kind==='PERF')d={zfw:'62.4',reserves:'5.0',costIndex:'30',crzAlt:formatAltitude(35000),sum:'ZFW 62.4 RSV 5.0 CI 30'};
 else if(kind==='TAKEOFF'){AO.toMem=takeoffMem();AO.toSig='';const en0=addLog('UP','TAKEOFF',AO.toMem.length+' RUNWAY SETS');en0.state='STORED';AO.alert='TAKEOFF DATA UPLINK';API.chime();done('toUplink');API.redraw();return {ok:true};}
 else if(kind==='WIND')d={crzWind:'270°/85',sum:'CRZ WIND 270/85'};
 else if(kind==='DES')d={fl240:'260/60',fl100:'240/35',sum:'FL240 260/60 FL100 240/35'};
 else if(kind==='LIMITS')d={minCLB:'250/.620',maxCLB:'330/.780',minCRZ:'250/.700',maxCRZ:'340/.790',minDES:'250/.700',maxDES:'340/.790',rtaTolerance:'30',sum:'CLB 250/.620-330/.780 RTA TOL 30'};
 else if(kind==='NAV')d={count:12,sum:'12 SUPP NAV WAYPOINTS'};
 else if(kind==='ALTN')d={id:e.route.origin||e.scenario?.origin||'KMCI',sum:'ALTN '+(e.route.origin||e.scenario?.origin||'KMCI')};
 if(partial){d.partial=true;done('partialUp');}
 const en=addLog('UP',kind,d.sum);
 if(kind==='ALTN'||kind==='NAV'){
  const run=()=>{AO.loading=null;apply(kind,d,partial);en.state='LOADED';AO.st[kind]='LOADED';message=partial?PARTIAL_MSG[kind]:kind==='ALTN'?'ALTN DEST UPLINK':'NAV DATA UPLINK';clearSoon(kind,'LOADED');done(kind==='ALTN'?'altn':'navLoad');API.chime();API.redraw();};
  if(kind==='NAV'){AO.loading={kind:'NAV'};message='NAV DATA LOADING';API.redraw();AO.timer=later(run,LOAD_MS);}else run();
  return {ok:true};
 }
 AO.up[kind]=d;AO.alert=READY_MSG[kind];done('upReady');API.chime();API.redraw();return {ok:true};
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
 ['LOAD, EXEC and ERASE (11.33.9)',[['execData','EXEC accepts loaded PERF INIT / LIMITS / CRZ WIND / FORECASTS data'],['eraseData','ERASE restores the previous data'],['longDel','Long DEL (1 s) suspends an uplink or puts loaded data back to LOAD']]],
 ['Takeoff data (11.33 / 11.60)',[['toUplink','TAKEOFF DATA UPLINK stored for several runways'],['toMatch','TAKEOFF DATA LOADED when RTE runway / intersection matches'],['toInvalid','INVALID TAKEOFF for a performance-limited intersection']]],
 ['Data problems and alerts (11.60)',[['invalidUp','INVALID ... UPLINK for bad data'],['partialUp','PARTIAL ... UPLINK for incomplete data'],['resend','RESEND MESSAGE when the downlink cannot be delivered'],['report','Reports: REPORT status highlighted for 3 seconds']]],
 ['Weather',[['metarReq','METAR request (ATC INDEX > METAR > GET METAR)'],['metar','METAR uplink received']]]
];
const NOTES={
 RTE:'RTE 1 request or unsolicited uplink: the prompt becomes LOAD (the route goes into the MOD plan), then EXEC activates it. FCOM 11.33.7.',
 ALTN:'ALTN needs only REQUEST: data loads by itself and the scratchpad reports ALTN DEST UPLINK. FCOM 11.33.10.',
 PERF:'PERF INIT uplink is only for the ground and after an origin is entered on RTE. Airborne, nothing is sent. FCOM 11.33.4.',
 TAKEOFF:'TAKEOFF DATA UPLINK stores data for four runway/intersection sets (the RTE runway and A3 are good, B2 is performance limited). Enter the intersection on TAKEOFF REF 1/2 to get TAKEOFF DATA LOADED, ACCEPT or REJECT, or INVALID TAKEOFF. FCOM 11.33.6.',
 WIND:'CRZ WIND uplink: LOAD shows UPLINK LOADING (keys locked for a moment; hold DEL 1 s to suspend), then EXEC or ERASE. FCOM 11.33.9.',
 DES:'DES FORECAST uplink: LOAD, then EXEC or ERASE; the winds show on DES FORECASTS (FMC COMM page 2). FCOM 11.33.9.',
 LIMITS:'PERF LIMITS uplink: LOAD, then EXEC or ERASE (PERF INIT 2/2 shows the speeds). FCOM 11.33.9.',
 NAV:'SUPP NAV needs only REQUEST: NAV DATA LOADING, then NAV DATA UPLINK. FCOM 11.33.10.'
};
function build(){
 const grid=document.querySelector('#atc-console .cc-grid');if(!grid||$('ao-card'))return;
 const sel=$('cc-link');if(sel&&![...sel.options].some(o=>o.value==='FULL'))sel.add(new Option('FULL'));
 const d=document.createElement('div');d.className='cc-card cc-wide';d.id='ao-card';
 d.innerHTML=`<h3>Company (AOC) station · FCOM 11.33</h3>
  <div class="cc-note" id="ao-note">Company data link: the FMC COMM page and the REQUEST prompts on PERF INIT and TAKEOFF REF reach this station. Pick an uplink to send it unsolicited; set Data link status (FAIL, VOICE, NO COMM, FULL) in the first card.</div>
  <label class="cc-check"><input type="checkbox" id="ao-auto" checked> Answer crew requests automatically</label>
  <div class="cc-two"><label>Uplink data quality<select id="ao-q"><option value="OK">Good data</option><option value="PARTIAL">Partial (PARTIAL ... UPLINK)</option><option value="INVALID">Bad (INVALID ... UPLINK)</option></select></label>
  <label class="cc-check"><input type="checkbox" id="ao-fail"> Next company downlink fails (RESEND MESSAGE)</label></div>
  <div class="cc-scn">${Object.keys(UPN).map(k=>`<button class="cc-s" data-ao-up="${k}"><strong>${esc(UPN[k])} uplink</strong><span>${k==='TAKEOFF'?'ACCEPT / REJECT':(k==='ALTN'||k==='NAV')?'loads automatically':'LOAD'}</span></button>`).join('')}</div>
  <h4>FMC alerting messages (FCOM 11.60.31-34)</h4>
  <div class="cc-btns"><button id="al-logon">Logon: no reply (RE-LOGON TO ATC COMM)</button><button id="al-req">ATC downlink: no reply (ATC TIMEOUT-RESEND)</button><button id="al-full">Fill ATC uplink storage (RESPOND TO ATC UPLINKS)</button><label class="cc-check"><input type="checkbox" id="al-fail"> Next ATC downlink fails (UNABLE TO SEND MSG)</label></div>
  <h4>From the aircraft (company)</h4><div id="ao-in" class="cc-inbox"></div>
  <h4>Company data link checklist <span id="ao-prog"></span></h4><div id="ao-check"></div><button id="ao-reset" class="quiet">Reset checklist</button>`;
 grid.appendChild(d);
 $('ao-auto').addEventListener('change',ev=>{AO.auto=ev.target.checked;});
 $('ao-q').addEventListener('change',ev=>{AO.q=ev.target.value;});
 $('ao-fail').addEventListener('change',ev=>{AO.failNext=ev.target.checked;});
 $('al-fail').addEventListener('change',ev=>{CP.failNext=ev.target.checked;});
 $('al-logon').addEventListener('click',()=>{if(!API.logonTimeout())$('ao-note').textContent='Send an ATC logon first; the alert needs a logon that is still waiting.';});
 $('al-req').addEventListener('click',()=>{if(!API.reqTimeout())$('ao-note').textContent='No ATC downlink is waiting for a reply.';});
 $('al-full').addEventListener('click',()=>{if(!CP.logon.connected)$('ao-note').textContent='Needs a CPDLC connection first.';else{const n=API.fillStorage();$('ao-note').textContent=n+' uplinks stored, the next one was refused.';}});
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
 const du=$('du-acars');if(du)du.classList.toggle('on',Object.keys(AO.up).length>0||Object.keys(AO.mod).length>0);
 const inb=$('ao-in');if(!inb)return;
 inb.innerHTML=AO.log.length?AO.log.slice(0,20).map(en=>`<div class="cc-in"><span class="t">${API.Zt(en.t)}</span> <b>${en.dir==='UP'?'▲ UPLINK':'▼ DOWNLINK'}</b> ${esc(en.kind)} · ${esc(en.sum)} <em>${esc(en.state)}</em>${en.dir==='DN'&&AO.waiting[en.kind==='POS REPORT'?'':en.kind]&&en===AO.log.find(x=>x.dir==='DN'&&x.kind===en.kind)?`<div class="cc-btns"><button data-ao-reply="${en.kind}">Send uplink</button></div>`:''}</div>`).join(''):'<p class="muted">Company requests and reports from the aircraft appear here.</p>';
 let tot=0,got=0;
 $('ao-check').innerHTML=ACARS_CHECK.map(([t,items])=>`<h4>${esc(t)}</h4><ul>${items.map(([k,l])=>{tot++;if(AO.done[k])got++;return `<li class="${AO.done[k]?'done':''}"><i></i>${esc(l)}</li>`;}).join('')}</ul>`).join('');
 $('ao-prog').textContent=`${got}/${tot}`;
}
CP.listeners.push(paint);
document.addEventListener('DOMContentLoaded',build);
if(document.readyState!=='loading')build();

const ADV=/UPLINK( READY| LOADING)?$|^NAV DATA LOADING$|^TAKEOFF DATA (LOADED|ACCEPTED|REJECTED)$|^INVALID TAKEOFF |^RESEND MESSAGE$/;
window.ACARS={state:AO,advisory:m=>ADV.test(m||''),
 preRender(){if(AO.alert&&!message){message=AO.alert;AO.alert='';}},
 postBuild(){
  takeoffCheck();
  if(page==='TAKEOFF REF'&&pageNo===0&&AO.up.TAKEOFF&&rows[3]){rows[3].rl='TAKEOFF DATA';rows[3].rv='REJECT>';rows[3].right=()=>takeoff(false);}
  if(!Object.keys(AO.mod).length)return;
  const r=rows[5];
  if(r&&r.lv==='<INDEX'&&['PERF INIT','TAKEOFF REF','RTE DATA','DES FORECASTS','FMC COMM'].includes(page)){r.lv='<ERASE';r.left=()=>erase();}
 },
 pending:()=>Object.keys(AO.mod).length>0,exec,suspend,locked:()=>!!AO.loading,
 label,value,press:k=>press(k),request,respond};
})();
