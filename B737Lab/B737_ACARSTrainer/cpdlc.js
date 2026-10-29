/* B737 FMC ACARS Trainer · CPDLC / ATC data link (FCOM 737NG 11.34) — aircraft side.
   Loaded after fmc-core.js and shares its globals (row, title, foot, go, take, copy, scratch, message, e, db...).
   Page names, prompts and statuses follow FCOM 11.34.x. Ground behaviour lives in cpdlc-console.js and uses CPDLC.api. */
(function(){'use strict';
const EXT={},EXT_REF={};
const PAGES=new Set(['PDC CLEARANCE','ATC','ATC LOGON','ATC LOG','ATC UPLINK','REJECT DUE TO','VERIFY RESPONSE','ATC REQUEST','ATC REQ','VERIFY REQUEST','ATC REPORT','VERIFY REPORT','ATC SENT','POS REPORT','WHEN CAN WE','EMERGENCY','VERIFY EMERGENCY']);
const FCOM_REF=()=>({'ATC':'11.34.3','ATC LOGON':'11.34.32','ATC LOG':'11.34.29','ATC UPLINK':'11.34.36','REJECT DUE TO':'11.34.40','VERIFY RESPONSE':'11.34.42','ATC REQUEST':'11.34.11','ATC REQ':['11.34.13','11.34.15','11.34.16','11.34.18'][pageNo]||'11.34.13','VERIFY REQUEST':'11.34.21','ATC REPORT':'11.34.24','VERIFY REPORT':'11.34.26','ATC SENT':CP.view.sent&&byId(CP.view.sent)?.kind==='EMERGENCY'?'11.34.10':CP.view.sent&&byId(CP.view.sent)?.kind==='REPORT'?'11.34.28':'11.34.23','POS REPORT':'11.34.44','WHEN CAN WE':'11.34.47','EMERGENCY':'11.34.5','VERIFY EMERGENCY':'11.34.8','PDC CLEARANCE':'11.34.23'});

const blankReq=()=>({mode:'REQUEST',from:'ATC INDEX',alt:null,stepAt:'',pilotDisc:false,crzClb:false,sepVmc:false,perf:false,wx:false,speed:'',spdPerf:false,spdWx:false,offset:'',offsetAt:'',offWx:false,directTo:'',rte:'',depArr:'',heading:'',track:'',free:'',wc:{crzClb:null,climb:null,descent:null,speed:'',higher:false,lower:false,back:false}});
const blankEmer=()=>({type:'',divert:null,offset:'',descend:null,sob:'',fuel:'',free:''});
const CP=window.CP={
 link:'READY',
 ground:{id:'KUSA',fltOnFile:'TBC1234',tailOnFile:'AB-CDE',planOnFile:true,dclCapable:true,autoValidate:true,autoConnect:true,autoRoger:true,ackMs:1200,mute:false},pendMax:5,failNext:false,lastLink:'READY',
 logon:{to:'',flt:'',tail:'',maxUL:'',status:'',sentAt:0,actCtr:'',nextCtr:'',connected:false,noResponse:false,reason:''},
 ads:{off:false,contracts:[],emer:false,reports:0},
 log:[],reports:[],inbox:[],seq:1,
 view:{up:null,sent:null,rep:null,from:'ATC INDEX',repFrom:'ATC INDEX',verifyUp:null,reject:null,posSend:null,waiting:null,upPages:1},
 req:blankReq(),emer:blankEmer(),pos:{},pdc:{flt:'',atis:'',type:'B738',free:'',stand:'',planDep:'',to:''},lastSeq:null,
 alert:false,eraseArmed:false,done:{},listeners:[],lastTeach:''
};
const byId=id=>CP.log.find(x=>x.id===id);
const Zt=t=>{const d=new Date(t);return String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0')+'Z';};
const nowMs=()=>fmcNow();
const curAlt=()=>Math.round(+(e&&e.aircraft&&e.aircraft.altitude)||0);
const fmtAlt=ft=>formatAltitude(Math.round(ft),18000);
const wrap=(txt,w=24)=>{const out=[];for(const para of String(txt).toUpperCase().split('\n')){let line='';for(const word of para.split(/\s+/).filter(Boolean)){if(!line)line=word;else if((line+' '+word).length<=w)line+=' '+word;else{out.push(line);line=word;}}out.push(line);}return out.map(s=>s.slice(0,w));};
const abbr=(s,n=19)=>s.length>n?s.slice(0,n-2)+'..':s;
const joined=en=>(en.lines||[]).join(' ');
const isPendUp=en=>en.dir==='UP'&&(en.status==='NEW'||en.status==='OPEN');
const isPendDn=en=>en.dir==='DN'&&['SENDING','OPEN','DEFERRED'].includes(en.status);
const needsResp=en=>['WU','AN','R'].includes(en.resp);
const POSW={WU:'WILCO',AN:'AFFIRM',R:'ROGER'},NEGW={WU:'UNABLE',AN:'NEGATIVE'};
function tell(){for(const f of CP.listeners)try{f();}catch(err){console.error(err);}updateDU();}
function taught(k){if(!CP.done[k]){CP.done[k]=true;tell();}}
function redraw(){if(e)render();tell();}
function updateDU(){const el=document.getElementById('du-atc');if(el)el.classList.toggle('on',CP.log.some(isPendUp));}

/* ---------- sounds ---------- */
let ac=null;
let chimeAudio=null;
function beep(){try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();const t=ac.currentTime;[[1000,0],[640,.3]].forEach(([f,o])=>{const os=ac.createOscillator(),g=ac.createGain();os.type='sine';os.frequency.value=f;g.gain.setValueAtTime(.0001,t+o);g.gain.exponentialRampToValueAtTime(.3,t+o+.02);g.gain.exponentialRampToValueAtTime(.0001,t+o+.27);os.connect(g);g.connect(ac.destination);os.start(t+o);os.stop(t+o+.3);});}catch{}}
function chime(){if(CP.ground.mute)return;try{chimeAudio=chimeAudio||new Audio('boeing_chime.mp3');chimeAudio.currentTime=0;const p=chimeAudio.play();if(p&&p.catch)p.catch(beep);}catch{beep();}}

/* ---------- log ---------- */
function addEntry(o){const en={id:CP.seq++,t:nowMs(),...o};en.z=Zt(en.t);CP.log.unshift(en);return en;}
function abortPending(){for(const en of CP.log){if(isPendUp(en)||isPendDn(en))en.status='ABORTED';}CP.reports=CP.reports.filter(r=>r.state==='SENT');}

/* ---------- links / connection ---------- */
function linkCheck(){if(CP.link!=='READY')throw Error('NO COMM');if(!CP.logon.connected)throw Error('NO ATC COMM');}
function connect(){const L=CP.logon;L.connected=true;L.actCtr=CP.ground.id;L.to='';taught('connect');if(!message)message='ATC COMM ESTABLISHED';redraw();}
function notice(t,quiet){if(!quiet)chime();message=t;redraw();}
function terminate(by){const L=CP.logon;L.connected=false;L.actCtr='';L.nextCtr='';L.status='';abortPending();CP.ads.contracts=[];CP.ads.emer=false;L.noResponse=false;taught('terminate');inbox({type:'INFO',text:by==='ATC'?'CPDLC connection terminated by ATC':'Aircraft terminated the ATC connection (ATC COMM SELECT OFF)'});if(by==='ATC')notice('ATC COMM TERMINATED');else redraw();}
function inbox(o){CP.inbox.unshift({n:CP.seq++,t:nowMs(),...o});tell();}

/* ---------- downlink / uplink core ---------- */
function sendDown(o){linkCheck();if(CP.failNext){CP.failNext=false;throw Error('UNABLE TO SEND MSG');}const en=addEntry({dir:'DN',status:'SENDING',...o});setTimeout(()=>{if(en.status==='SENDING'){en.status=en.needsResp?'OPEN':'SENT';groundReceive(en);if(en.onAck)en.onAck(en);redraw();}},CP.ground.ackMs);redraw();return en;}
function deliver(spec){
 const L=CP.logon;if(!L.connected)return {ok:false,why:'No CPDLC connection. The aircraft must log on and the ground must establish the connection first.'};
 if(CP.link!=='READY')return {ok:false,why:'Data link status is '+CP.link+'; uplinks cannot be delivered.'};
 if(CP.log.filter(isPendUp).length>=CP.pendMax){message='RESPOND TO ATC UPLINKS';chime();redraw();return {ok:false,why:'The aircraft has '+CP.pendMax+' open uplinks (storage full): RESPOND TO ATC UPLINKS shows on the CDU. Answer them first.'};}
 const lines=spec.lines||wrap(spec.text);
 const en=addEntry({dir:'UP',kind:'UPLINK',status:'NEW',resp:spec.resp||'NE',lines,loadable:spec.loadable||null,noReject:!!spec.noReject,noReason:!!spec.noReason,dcl:!!spec.dcl,refId:spec.refId||null,armable:spec.armable||null,rep:spec.rep||null,dclKind:spec.dclKind||'',cond:!!spec.cond,expect:!!spec.expect,title:spec.title||''});
 if(spec.refId){const dn=byId(spec.refId);if(dn&&dn.dir==='DN'&&dn.status!=='ABORTED'){dn.reply=en.id;dn.status=spec.replyKind==='STANDBY'?'OPEN':spec.replyKind==='DEFERRED'?'DEFERRED':'RESPONSE RCVD';}}
 if(spec.rep){if(CP.reports.length>=10)inbox({type:'INFO',text:'Aircraft ATC REPORT list is full (ATC REPORT LIST FULL)'});else CP.reports.push({id:CP.seq++,upId:en.id,state:'READY',armed:false,...spec.rep});}
 CP.alert=true;chime();redraw();return {ok:true,en};
}
function groundReceive(en){
 const info={type:en.kind,enId:en.id,z:en.z,text:joined(en),needsResp:!!en.needsResp,approve:en.approve||null,isDcl:!!en.isDcl};
 inbox(info);
 if(en.isDcl&&en.freeText)setTimeout(()=>{deliver({text:'NOT ALLOWED',resp:'NE',refId:en.id});taught('notAllowed');inbox({type:'INFO',text:'Auto-reply NOT ALLOWED: free text is not permitted in a DCL request'});},1200);
 if(en.kind==='EMERGENCY'&&en.emerType&&CP.ground.autoRoger)setTimeout(()=>deliver({text:'ROGER '+en.emerType,resp:'NE',refId:en.id}),1800);
}
function respondAck(en,kind,words){
 if(kind==='STANDBY'){en.lines.push('STANDBY');en.status='OPEN';en.stbyCount=(en.stbyCount||0)+1;taught('standby');}
 else if(kind==='ACCEPT'){en.lines.push(words);en.status='ACCEPTED';taught('accept');if(en.dclKind)taught(en.dclKind);if(en.rep&&en.rep.kind==='LEVEL')taught('armAvail');}
 else{en.lines.push(...wrap(words));en.status='REJECTED';taught('reject');if(en.rejDraft&&en.rejDraft.reasons.length)taught('rejectReason');}
 inbox({type:'RESPONSE',text:'Aircraft response ('+(kind==='ACCEPT'?POSW[en.resp]:kind==='REJECT'?NEGW[en.resp]:'STANDBY')+') to: '+abbr(joined(en).split('  ')[0],40),enId:en.id,kind});
}
function respond(en,kind,reasonText){
 linkCheck();const words=kind==='ACCEPT'?POSW[en.resp]:kind==='REJECT'?(reasonText||NEGW[en.resp]):'STANDBY';
 en.sending=kind;redraw();
 setTimeout(()=>{en.sending=null;respondAck(en,kind,words);if(page==='VERIFY RESPONSE'&&CP.view.verifyUp===en.id)go('ATC UPLINK');else redraw();},CP.ground.ackMs);
}

/* ---------- FMC data ---------- */
const cpFix=async id=>{await ensureFixes();const fs=candidates(id);if(fs.length)return fs[0];const p=pilotWaypoint(id);if(p)return p;throw Error('NOT IN DATABASE');};
function parseAlt(v,{block=true,metres=true}={}){v=v.trim().toUpperCase();if(block&&v.includes('/')){const [a,b]=v.split('/').map(x=>altitude(x));if(a==null||b==null||a<1000||b<=a||b>50000)throw Error('INVALID ENTRY');return {block:true,ft:a,ft2:b,text:fmtAlt(a)+'/'+fmtAlt(b)};}
 if(metres&&/^\d{4,5}M$/.test(v))return {ft:Math.round(+v.slice(0,-1)*3.28084),text:v};
 const n=altitude(v);if(n==null||n<0||n>50000)throw Error('INVALID ENTRY');return {ft:n,text:fmtAlt(n)};}
function parseSpeed(v){v=v.trim().toUpperCase().replace(/^M/,'');if(/^\.\d{2}$/.test(v)){const m=+v;if(m<.4||m>.9)throw Error('INVALID ENTRY');return 'M'+v;}if(/^\d{3}$/.test(v)){if(+v<100||+v>400)throw Error('INVALID ENTRY');return v+'KT';}throw Error('INVALID ENTRY');}
function parseOffset(v){const m=v.trim().toUpperCase().match(/^([LR])(\d{1,2})$/);if(!m||+m[2]<1)throw Error('INVALID ENTRY');return m[1]+(+m[2]);}
async function parsePosTime(v){v=v.trim().toUpperCase().replace(/Z$/,'');if(/^([01]\d|2[0-3])[0-5]\d$/.test(v))return v+'Z';const f=await cpFix(v);return f.id;}
const hhmm=v=>/^([01]\d|2[0-3])[0-5]\d$/.test(v);
function routeIds(){const r=e.route;return r.legs.filter(l=>!l.disco&&(l.source==='enroute'||l.source==='destination')).map(l=>l.id);}
async function loadRoute(L){
 await ensureFixes();const r=e.draft();const orig=L.origin||r.origin||e.scenario?.origin,dest=L.dest||r.destination||e.scenario?.destination;
 for(const a of [orig,dest])if(a&&!db.airports[a])await airport(a);
 r.origin=orig;r.destination=dest;const enr=[];for(const id of L.ids){const f=await cpFix(id);if(id!==dest)enr.push(cleanLeg(f,'enroute'));}
 r.legs=[...r.legs.filter(l=>l.source!=='enroute'&&l.source!=='destination'),...enr,...(dest&&db.airports[dest]?[cleanLeg(db.airports[dest],'destination')]:[])];
 e.rebuild(db.airports);e.log('MOD · ATC route clearance loaded');if(!e.activated){try{e.activate();}catch{}}
}
async function loadUplink(en){
 const L=en.loadable;if(!L)throw Error('INVALID ENTRY');
 if(L.type==='direct'){const f=e.route.legs.slice(e.route.index).find(x=>!x.disco&&x.id===L.id)||await cpFix(L.id);e.direct(f);if(!e.activated){try{e.activate();}catch{}}}
 else await loadRoute(L);
 en.loaded=true;taught(en.dcl?'dclLoad':'load');
 if(page!=='ATC UPLINK')return;
 message='ROUTE LOADED · REVIEW LEGS AND EXEC';
}
const isoTemp=ft=>Math.max(-56,Math.round(15-1.98*ft/1000));
function posData(){
 const r=e.route,idx=r.index||0,legs=r.legs,P=CP.pos;
 const last=CP.lastSeq||{id:legs[idx-1]?.id||r.origin||e.scenario?.origin||'-----',t:nowMs(),alt:curAlt(),fuel:e.perf.fuel};
 const to=legs.slice(idx).find(l=>!l.disco),nxt=legs.slice(idx+1).filter(l=>!l.disco)[0];
 const est=to?enrouteEstimate([to])[0]:null,dest=legs.length?enrouteEstimate(legs.slice(idx))?.filter(Boolean).at(-1):null;
 const fuelHrs=Math.max(0,(+(e.perf.fuel||0))/5.0);
 return {pos:P.pos||last.id,ata:Zt(last.t),alt:fmtAlt(last.alt),est:P.est||to?.id||'-----',eta:P.eta?P.eta+'Z':est?fmtEta(est.eta):'----Z',next:P.next||nxt?.id||'-----',temp:isoTemp(curAlt())+'°C',wind:P.wind||'---°/---',destEta:P.destEta?P.destEta+'Z':dest?fmtEta(dest.eta):'----Z',spd:P.spd||('.'+String(Math.round(Math.min(.82,Math.max(.61,(e.aircraft.speed||440)/573))*100)).padStart(2,'0')),fuel:(+(last.fuel||0)).toFixed(1),fuelHM:String(Math.floor(fuelHrs)).padStart(2,'0')+String(Math.round((fuelHrs%1)*60)).padStart(2,'0')};
}

/* ---------- request text ---------- */
function whenLines(){const w=CP.req.wc,out=[];if(w.crzClb)out.push('WHEN CAN WE EXPECT CRUISE CLIMB TO '+w.crzClb.text);if(w.climb)out.push('WHEN CAN WE EXPECT CLIMB TO '+w.climb.text);if(w.descent)out.push('WHEN CAN WE EXPECT DESCENT TO '+w.descent.text);if(w.speed)out.push('WHEN CAN WE EXPECT '+w.speed);if(w.higher)out.push('WHEN CAN WE EXPECT HIGHER ALTITUDE');if(w.lower)out.push('WHEN CAN WE EXPECT LOWER ALTITUDE');if(w.back)out.push('WHEN CAN WE EXPECT BACK ON ROUTE');return out;}
function reqLines(){const q=CP.req,out=[];if(q.mode==='CLEARANCE')return ['REQUEST CLEARANCE'].concat(q.pdc?pdcLines(q.pdc):[]);if(q.mode==='VOICE')return ['REQUEST VOICE CONTACT'];if(q.mode==='WHENCAN')return whenLines();
 if(q.alt){const a=q.alt,cur=curAlt();let s=a.block?'REQUEST BLOCK '+a.text:q.crzClb?'REQUEST CRUISE CLIMB TO '+a.text:a.ft>cur+150?'REQUEST CLIMB TO '+a.text:a.ft<cur-150?'REQUEST DESCENT TO '+a.text:'REQUEST LEVEL '+a.text;if(q.stepAt)s+=' AT '+q.stepAt;out.push(s);if(q.pilotDisc)out.push('AT PILOT DISCRETION');if(q.sepVmc)out.push('MAINTAIN OWN SEPARATION AND VMC');if(q.perf)out.push('DUE TO AIRCRAFT PERFORMANCE');if(q.wx)out.push('DUE TO WEATHER');}
 if(q.speed){out.push('REQUEST SPEED '+q.speed);if(q.spdPerf)out.push('DUE TO AIRCRAFT PERFORMANCE');if(q.spdWx)out.push('DUE TO WEATHER');}
 if(q.offset){out.push(q.offWx?'REQUEST WEATHER DEVIATION UP TO '+q.offset+'NM OF ROUTE':'REQUEST OFFSET '+q.offset+'NM OF ROUTE'+(q.offsetAt?' AT '+q.offsetAt:''));}
 if(q.directTo)out.push('REQUEST DIRECT TO '+q.directTo);
 if(q.rte)out.push('REQUEST ROUTE CLEARANCE '+routeIds().join(' '));
 if(q.depArr)out.push('REQUEST '+q.depArr);
 if(q.heading)out.push('REQUEST HEADING '+q.heading);
 if(q.track)out.push('REQUEST GROUND TRACK '+q.track);
 return out;}
function approvalFor(q){
 if(q.mode==='CLEARANCE')return [{label:'Cleared as filed',key:'asFiled'},{label:'Full route clearance (loadable)',key:'fullRoute'},{label:'Cleared to position via route',key:'toPos'}];
 if(q.mode==='VOICE')return [{label:'CONTACT on voice',text:'CONTACT ATC ON VOICE',resp:'WU'}];
 if(q.mode==='WHENCAN')return [{label:'EXPECT ... (information only)',text:'EXPECT CLIMB TO FL390 AT '+Zt(nowMs()+20*60000),resp:'NE',expect:true}];
 const a=[],cur=curAlt();
 if(q.alt)a.push(q.alt.block?'MAINTAIN BLOCK '+q.alt.text:(q.alt.ft>cur?'CLIMB':'DESCEND')+' TO AND MAINTAIN '+q.alt.text);
 if(q.speed)a.push('MAINTAIN '+q.speed);
 if(q.offset)a.push('OFFSET '+q.offset+'NM OF ROUTE');
 const item={label:'Approve: '+a.join(' / '),text:a.join('\n'),resp:'WU'};
 if(q.directTo)return [{label:'Approve: PROCEED DIRECT TO '+q.directTo,text:'PROCEED DIRECT TO '+q.directTo,resp:'WU',loadable:{type:'direct',id:q.directTo}}];
 if(q.rte)return [{label:'Approve: route clearance (loadable)',text:'CLEARED TO '+(e.route.destination||'DEST')+' VIA '+routeIds().join(' '),resp:'WU',loadable:{type:'route',ids:routeIds()}}];
 if(q.heading)return [{label:'Approve: FLY HEADING '+q.heading,text:'FLY HEADING '+q.heading,resp:'WU'}];
 if(q.track)return [{label:'Approve: TRACK '+q.track,text:'TRACK '+q.track,resp:'WU'}];
 return a.length?[item]:[];
}
function emerLines(){const m=CP.emer,out=[m.type==='MAYDAY'?'MAYDAY MAYDAY MAYDAY':'PAN PAN PAN'],d=m.divert||{id:e.route.destination};if(d&&d.id)out.push('DIVERTING TO '+d.id+(d.id===e.route.destination||e.route.legs.some(l=>l.id===d.id)?' VIA ACTIVE ROUTE':' DIRECT'));if(m.offset)out.push('OFFSET '+m.offset+'NM OF ROUTE');if(m.descend&&curAlt()>m.descend.ft+150)out.push('DESCENDING TO '+m.descend.text);if(m.sob)out.push('SOULS ON BOARD '+m.sob);if(m.fuel)out.push('FUEL REMAINING '+m.fuel);if(m.free)out.push(m.free);return out;}

/* ---------- reports ---------- */
function repText(r){const f=CP.pos;switch(r.kind){case 'LEVEL':return ['LEVEL '+String(Math.round(r.ft/100)).padStart(3,'0')];case 'WHENCAN':return r.cannot?['CANNOT ACCEPT '+r.altText]:['CAN ACCEPT '+r.altText+' AT '+(r.time?r.time+'Z':'□□□□Z')];case 'BACK':return ['BACK ON ROUTE'];case 'CONFIRMPOS':{const p=posData();return ['POSITION '+p.pos+' '+p.ata+' '+p.alt];}default:return [];}}
function repComplete(r){if(r.kind==='WHENCAN')return r.cannot||!!r.time;return true;}
function sendReport(r,auto){
 const lines=r.kind==='FREE'?wrap(r.free||''):repText(r);if(r.free&&r.kind!=='FREE')lines.push(...wrap(r.free));
 const en=sendDown({kind:'REPORT',lines,needsResp:false,auto:!!auto,onAck:en=>{if(page==='VERIFY REPORT'&&CP.view.rep===r)go('ATC SENT');}});
 CP.view.sent=en.id;r.state='SENT';CP.reports=CP.reports.filter(x=>x!==r);
 if(r.upId){const up=byId(r.upId);if(up&&r.kind!=='LEVEL'&&isPendUp(up)){up.status=r.cannot?'REJECTED':'ACCEPTED';}}
 taught(auto?'levelAuto':r.kind==='BACK'?'backOnRoute':r.kind==='WHENCAN'?'whenCan':r.kind==='FREE'?'free':'report');return en;
}

/* ---------- ATC key ---------- */
function atcKey(){
 if(!CP.logon.connected)return 'ATC';
 const news=CP.log.filter(en=>en.dir==='UP'&&en.status==='NEW'),pend=CP.log.filter(isPendUp);
 if(news.length>1)return 'ATC LOG';
 if(news.length===1){CP.view.up=news[0].id;return 'ATC UPLINK';}
 if(pend.length===1){CP.view.up=pend[0].id;return 'ATC UPLINK';}
 if(pend.length>1)return 'ATC LOG';
 return 'ATC';
}
function preRender(){
 if(CP.alert){if(!message){message='ATC MESSAGE';CP.alert=false;}}
 if(page!=='ATC LOG')CP.eraseArmed=false;
 if(window.ACARS)ACARS.preRender();
}

/* ---------- field helper ---------- */
function field(cur,set,validate,onDelete){return async()=>{if(!scratch){if(cur&&cur!=='---')copy(cur);return;}const v=take();if(v==='DELETE'){onDelete?onDelete():set('');return;}set(await validate(v));};}
const boxes=(n=4)=>'□'.repeat(n);
const toPage=(p,n=0)=>()=>go(p,n);
const sel=(on,text)=>on?text:text+'>';

/* ---------- page builders ---------- */
function register(name,fn,ref){PAGES.add(name);EXT[name]=fn;EXT_REF[name]=ref;}
function build(p){
 if(EXT[p])return EXT[p]();
 switch(p){
  case 'ATC':return pgIndex();
  case 'PDC CLEARANCE':return pgPdc();
  case 'ATC LOGON':return pgLogon();
  case 'ATC LOG':return pgLog();
  case 'ATC UPLINK':return pgUplink();
  case 'REJECT DUE TO':return pgRejectDue();
  case 'VERIFY RESPONSE':return pgVerifyResp();
  case 'ATC REQUEST':return pgRequest();
  case 'ATC REQ':return pgReqPages();
  case 'VERIFY REQUEST':return pgVerifyReq();
  case 'ATC REPORT':return pgReportList();
  case 'VERIFY REPORT':return pgVerifyRep();
  case 'ATC SENT':return pgSent();
  case 'POS REPORT':return pgPos();
  case 'WHEN CAN WE':return pgWhen();
  case 'EMERGENCY':return pgEmer();
  case 'VERIFY EMERGENCY':return pgVerifyEmer();
 }
}
function pgIndex(){
 title('ATC INDEX');
 const L=[['EMERGENCY',()=>go('EMERGENCY')],['REQUEST',()=>{CP.req.mode='REQUEST';go('ATC REQUEST');}],['REPORT',()=>go('ATC REPORT')],['MSG LOG',()=>go('ATC LOG')],['LOGON/STATUS',()=>go('ATC LOGON')]];
 const R=[['POS REPORT',()=>go('POS REPORT')],['WHEN CAN WE',()=>{CP.req.mode='WHENCAN';go('WHEN CAN WE');}],null,['CLEARANCE',()=>go('PDC CLEARANCE')],['METAR',()=>go('SAT MENU')]];
 for(let i=0;i<5;i++)row(i,'','<'+L[i][0],'',R[i]?R[i][0]+'>':'',L[i][1],R[i]?R[i][1]:null);
 row(5,'------------------------','<PRINT LOG','','',()=>toast('Printing is not simulated.'));
}
function pgPdc(){
 const D=CP.pdc,r=e.route,fl=D.flt||CP.logon.flt||e.flightNo||'';title('PDC CLEARANCE');
 const station=D.to||CP.logon.actCtr||'';
 const dep=r.origin||e.scenario?.origin||'',dest=r.destination||e.scenario?.destination||'';
 const w=CP.view.waiting&&byId(CP.view.waiting);const sending=w&&w.status==='SENDING'&&w.isDcl;
 row(0,'FLT NO',fl,'DEPT',dep,field(fl,v=>{D.flt=v;},v=>{if(!/^[A-Z0-9]{2,8}$/.test(v))throw Error('INVALID ENTRY');return v;},()=>{D.flt='';}),()=>{if(dep)copy(dep);});
 row(1,'ATIS',D.atis,'STAND',D.stand,field(D.atis,v=>{D.atis=v;},v=>{if(!/^[A-Z]$/.test(v))throw Error('INVALID ENTRY');return v;},()=>{D.atis='';}),field(D.stand,v=>{D.stand=v;},v=>{if(!/^[A-Z0-9]{1,5}$/.test(v))throw Error('INVALID ENTRY');return v;},()=>{D.stand='';}));
 row(2,'A/C TYPE',D.type,'DEST',dest,field(D.type,v=>{D.type=v;},v=>{if(!/^[A-Z0-9-]{2,8}$/.test(v))throw Error('INVALID ENTRY');return v;},()=>{D.type='';}),()=>{if(dest)copy(dest);});
 row(3,'FREE TEXT',D.free?abbr(D.free,11):'','PLAN DEP',D.planDep?D.planDep+'Z':'',()=>{if(!scratch&&D.free){copy(D.free);return;}const v=take();D.free=v==='DELETE'?'':v;taught('pdcFree');},field(D.planDep,v=>{D.planDep=v;},v=>{v=v.replace(/Z$/,'');if(!hhmm(v))throw Error('INVALID ENTRY');return v;},()=>{D.planDep='';}));
 row(4,'','','TO ATS UNIT',station||'STATION',null,field(station,v=>{D.to=v;},v=>{if(!/^[A-Z]{4}$/.test(v))throw Error('INVALID ENTRY');return v;},()=>{D.to='';}));
 row(5,'------------------------','<MENU','',sending?'SENDING':'SEND>',()=>go('MENU'),()=>sendPdc());
}
function sendPdc(){
 const D=CP.pdc;linkCheck();if(!(D.flt||CP.logon.flt||e.flightNo))throw Error('ENTER FLT NO');if(!D.atis)throw Error('ENTER ATIS');
 CP.req=Object.assign(blankReq(),{mode:'CLEARANCE',from:'PDC',free:D.free,pdc:Object.assign({},D,{flt:D.flt||CP.logon.flt||e.flightNo,to:D.to||CP.logon.actCtr})});
 return sendRequest();
}
function pdcLines(D){const o=[];o.push('ATIS '+D.atis+(D.type?' A/C '+D.type:''));const f=[];if(D.stand)f.push('STAND '+D.stand);if(D.planDep)f.push('PLAN DEP '+D.planDep+'Z');if(f.length)o.push(f.join(' '));return o;}
function pgLogon(){
 const L=CP.logon,two=pageNo===1;title('ATC LOGON/STATUS',2);
 const ready=CP.link==='READY';
 if(!two){
  const complete=L.to&&(L.flt||e.flightNo)&&L.tail;
  const sendState=L.status==='SENT'?(L.noResponse?'RESEND>':'SENT'):L.status==='ACCEPTED'?'ACCEPTED':L.status==='REJECTED'&&L.rejSig===[L.to,L.flt||e.flightNo,L.tail].join('|')?'REJECTED':(complete&&ready?'SEND>':'');
  row(0,'LOGON TO',L.connected?'----':(L.to||boxes()),'LOGON',sendState,field(L.to,v=>{L.to=v;},v=>{if(!/^[A-Z]{4}$/.test(v))throw Error('INVALID ENTRY');return v;},()=>{L.to='';}),()=>{
   if(L.status==='ACCEPTED'||(L.status==='SENT'&&!L.noResponse))return;if(!(complete&&ready))return;sendLogon();});
  row(1,'FLT NO',L.flt||e.flightNo||boxes(7),'','',field(L.flt||e.flightNo,v=>{L.flt=v;},v=>{if(!/^[A-Z0-9]{2,8}$/.test(v))throw Error('INVALID ENTRY');return v;},()=>{L.flt='';}));
  row(2,'TAIL NO',L.tail||boxes(6),'ACT CTR',L.actCtr||'',field(L.tail,v=>{L.tail=v;},v=>{if(!/^[A-Z0-9-]{2,8}$/.test(v))throw Error('INVALID ENTRY');return v;},()=>{L.tail='';}));
  row(3,'MAX U/L DELAY',(L.maxUL||'---')+' SEC','NEXT CTR',L.nextCtr||'',field(L.maxUL,v=>{L.maxUL=v;},v=>{if(!/^\d{1,3}$/.test(v)||+v<1)throw Error('INVALID ENTRY');return String(+v);},()=>{L.maxUL='';}));
  row(4,'ATC COMM',L.connected?'<SELECT OFF':'','','',()=>{if(L.connected)terminate('AIRCRAFT');});
  row(5,'--------------','<ATC INDEX','DATA LINK',CP.link,()=>go('ATC'));
 }else{
  const tail=L.tail,state=!tail?'INOP':CP.ads.off?'OFF':CP.ads.contracts.length?'ACT':'ARM';
  row(0,'ADS ('+state+')',state==='ARM'||state==='ACT'?'<SELECT OFF':state==='OFF'?'<SELECT ARM':'',state==='ACT'?'CONTRACTS':'',state==='ACT'?String(CP.ads.contracts.length):'',()=>{if(state==='ARM'||state==='ACT'){CP.ads.off=true;CP.ads.contracts=[];CP.ads.emer=false;inbox({type:'INFO',text:'ADS selected OFF by the crew; all ADS contracts terminated'});taught('adsOff');}else if(state==='OFF'){CP.ads.off=false;taught('adsOn');}});
  row(1,'ADS EMER',state==='INOP'||state==='OFF'?'':CP.ads.emer?'<SELECT OFF':'<SELECT ON','','',()=>{if(state==='INOP'||state==='OFF')return;CP.ads.emer=!CP.ads.emer;inbox({type:'INFO',text:'ADS emergency mode '+(CP.ads.emer?'ON':'OFF')});taught('adsEmer');});
  row(5,'--------------','<ATC INDEX','DATA LINK',CP.link,()=>go('ATC'));
 }
}
function sendLogon(){
 const L=CP.logon;if(CP.link!=='READY')throw Error('NO COMM');
 L.flt=L.flt||e.flightNo;L.status='SENT';L.sentAt=nowMs();L.noResponse=false;L.reason='';taught('logon');
 inbox({type:'LOGON',text:`AFN logon request: ${L.to} · FLT ${L.flt} · TAIL ${L.tail}`,logon:{to:L.to,flt:L.flt,tail:L.tail}});
 if(window.CPDLCGround)setTimeout(()=>CPDLCGround.onLogon({to:L.to,flt:L.flt,tail:L.tail}),400);
}
function pgLog(){
 const n=CP.log.length,pages=Math.max(1,Math.ceil(n/5));title('ATC LOG',pages);taught('log');
 for(let i=0;i<5;i++){const en=CP.log[pageNo*5+i];if(!en)continue;const open=()=>{if(en.dir==='UP'){CP.view.up=en.id;go('ATC UPLINK');}else{CP.view.sent=en.id;go('ATC SENT');}};
  row(i,en.z,(en.dir==='UP'?'▲':'▼')+abbr(joined(en),20),en.status,'>',()=>{if(scratch==='DELETE'){clear();CP.log=CP.log.filter(x=>x!==en);return;}open();},open);}
 row(5,'------------------------','<ATC INDEX','',CP.eraseArmed?'CONFIRM':'ERASE LOG>',()=>go('ATC'),()=>{if(!CP.eraseArmed){CP.eraseArmed=true;return;}CP.log=CP.log.filter(x=>isPendUp(x)||isPendDn(x));CP.eraseArmed=false;});
}
function upPages(en){
 const lines=en.lines;if(lines.length<=2)return [lines];const pg=[lines.slice(0,4)];let rest=lines.slice(4);
 while(rest.length>3){pg.push(rest.slice(0,5));rest=rest.slice(5);}pg.push(rest);return pg;
}
function pgUplink(){
 const en=byId(CP.view.up);if(!en){title('ATC UPLINK');row(0,'','NO MESSAGE','','');row(5,'------------------------','<ATC INDEX','','',()=>go('ATC'));return;}
 if(message==='ATC MESSAGE')message='';
 const pg=upPages(en);title(en.z+' ATC UPLINK',pg.length);const last=pageNo===pg.length-1;
 if(en.status==='NEW'){en.status=needsResp(en)?'OPEN':'OLD';taught('viewUp');}
 if(en.expect)taught('expect');if(en.cond)taught('cond');if(pg.length>1&&last)taught('multi');
 const rel=en.refId&&byId(en.refId);
 if(pageNo===0){
  row(0,'DISPLAY','','STATUS',en.status,null,null);
  if(rel)rows[0].lv='<REQUEST',rows[0].left=()=>{CP.view.sent=rel.id;go('ATC SENT');};
  pg[0].forEach((t,i)=>row(i+1,'',t));
 }else pg[pageNo].forEach((t,i)=>row(i,'',t));
 if(!last){row(5,'---------CONTINUED---------',  '','','LOG>',null,()=>go('ATC LOG'));return;}
 const done=en.status==='ACCEPTED'||en.status==='REJECTED'||en.status==='ABORTED'||en.status==='OLD'||!needsResp(en);
 const canResp=!done&&en.status!=='ABORTED';
 if(canResp){
  row(3,'STANDBY',en.sending==='STANDBY'?'SENDING':'<SEND','','',()=>respond(en,'STANDBY'));
  if(!en.noReject&&NEGW[en.resp])row(4,'','<REJECT','','',()=>{CP.view.verifyUp=en.id;if(en.noReason||!NEGW[en.resp]){en.rejDraft={reasons:[],free:''};go('VERIFY RESPONSE');}else{en.rejDraft=en.rejDraft||{reasons:[],free:''};CP.view.reject=en.id;go('REJECT DUE TO');}});
  rows[4].rl='ACCEPT';rows[4].rv=en.sending==='ACCEPT'?'SENDING':'SEND>';rows[4].right=()=>respond(en,'ACCEPT');
 }
 if(en.loadable&&en.status!=='ABORTED'){rows[3].rv=en.loaded?'LOADED>':'LOAD>';rows[3].right=()=>loadUplink(en);}
 const hasRep=CP.reports.some(r=>r.upId===en.id);
 row(5,'------------------------','','',hasRep?'REPORT>':'LOG>',null,()=>hasRep?go('ATC REPORT'):go('ATC LOG'));
}
function pgRejectDue(){
 const en=byId(CP.view.reject);title('REJECT DUE TO');if(!en){row(5,'------------------------','<ATC INDEX','','',()=>go('ATC'));return;}
 const d=en.rejDraft,has=k=>d.reasons.includes(k),tog=k=>()=>{d.reasons=has(k)?d.reasons.filter(x=>x!==k):[...d.reasons,k];};
 row(0,'DUE TO',(has('PERF')?'':'<')+'PERFORMANCE','DUE TO',(has('WX')?'':'')+'WEATHER'+(has('WX')?'':'>'),tog('PERF'),tog('WX'));rows[0].color=d.reasons.length?'cyan':'';
 row(1,'',(has('UNLOAD')?'':'<')+'UNLOADABLE CLEARANCE','','',tog('UNLOAD'));
 row(2,'',(has('NOTCONS')?'':'<')+'NOT CONSISTENT. RESEND','','',tog('NOTCONS'));
 row(3,'FREE TEXT','<'+(d.free||''),'','',()=>{if(!scratch&&d.free){copy(d.free);return;}const v=take();d.free=v==='DELETE'?'':v;});
 row(5,'------------------------','<UPLINK','','VERIFY>',()=>go('ATC UPLINK'),()=>{CP.view.verifyUp=en.id;go('VERIFY RESPONSE');});
}
const REASON={PERF:'DUE TO AIRCRAFT PERFORMANCE',WX:'DUE TO WEATHER',UNLOAD:'UNABLE TO LOAD CLEARANCE',NOTCONS:'NOT CONSISTENT. RESEND'};
function rejectText(en){const d=en.rejDraft||{reasons:[],free:''},w=NEGW[en.resp]||'UNABLE';return [w,...d.reasons.map(k=>REASON[k]),...(d.free?[d.free]:[])];}
function pgVerifyResp(){
 const en=byId(CP.view.verifyUp);title('VERIFY RESPONSE');if(!en){row(5,'------------------------','<ATC INDEX','','',()=>go('ATC'));return;}
 const lines=rejectText(en).flatMap(t=>wrap(t));lines.slice(0,4).forEach((t,i)=>row(i,'',t));
 if(!en.noReason&&NEGW[en.resp])row(4,'','<REJECT DUE TO','','',()=>{CP.view.reject=en.id;go('REJECT DUE TO');});
 rows[4].rl='RESPONSE';rows[4].rv=en.sending==='REJECT'?'SENDING':'SEND>';rows[4].right=()=>respond(en,'REJECT',rejectText(en).join('. '));
 row(5,'------------------------','<UPLINK','','',()=>go('ATC UPLINK'));
}
function pgRequest(){
 const q=CP.req;title('ATC REQUEST');
 const entry=(key,parse,target,pageIdx)=>async()=>{if(scratch==='DELETE'){clear();q[key]=key==='alt'?null:'';return;}if(scratch){const v=take();q[key]=await parse(v);}go('ATC REQ',pageIdx);};
 row(0,'ALTITUDE','<'+(q.alt?q.alt.text:'---'),'','',entry('alt',v=>parseAlt(v),0,0));
 row(1,'SPEED','<'+(q.speed||'---'),'','',entry('speed',v=>parseSpeed(v),0,1));
 row(2,'OFFSET','<'+(q.offset||'---'),'','',entry('offset',v=>parseOffset(v),0,2));
 row(3,'','<ROUTE REQUEST','','',()=>go('ATC REQ',3));
 row(4,'','<ERASE REQUEST','','',()=>{CP.req=blankReq();});
 foot('<ATC INDEX','VERIFY>',()=>go('ATC'),()=>{q.mode='REQUEST';q.from='REQUEST';go('VERIFY REQUEST');});
}
function pgReqPages(){
 const q=CP.req;title(['ATC ALT REQUEST','ATC SPEED REQUEST','ATC OFFSET REQUEST','ATC ROUTE REQUEST'][pageNo],4);
 const tg=k=>()=>{q[k]=!q[k];};
 const verify=()=>{q.mode='REQUEST';q.from='REQUEST';go('VERIFY REQUEST');};
 const back=()=>go('ATC REQUEST');
 if(pageNo===0){
  row(0,'ALTITUDE',q.alt?q.alt.text:'---','REQUEST',sel(q.crzClb,'CRZ CLB'),field(q.alt?q.alt.text:'',v=>{q.alt=v;},v=>parseAlt(v),()=>{q.alt=null;}),tg('crzClb'));
  row(1,'STEP AT',q.stepAt||'-----','MAINTAIN OWN',sel(q.sepVmc,'SEPARATION/VMC'),field(q.stepAt,v=>{q.stepAt=v;},parsePosTime),tg('sepVmc'));
  row(2,'','','DUE TO',sel(q.perf,'PERFORMANCE'),null,tg('perf'));
  row(3,'','<AT PILOT DISC'+(q.pilotDisc?'':''),'DUE TO',sel(q.wx,'WEATHER'),tg('pilotDisc'),tg('wx'));
  if(q.pilotDisc)rows[3].lv='AT PILOT DISCRETION';
  foot('<REQUEST','VERIFY>',back,verify);
 }else if(pageNo===1){
  row(0,'SPEED',q.speed||'---','','',field(q.speed,v=>{q.speed=v;},v=>parseSpeed(v)));
  row(2,'','','DUE TO',sel(q.spdPerf,'PERFORMANCE'),null,tg('spdPerf'));
  row(3,'','','DUE TO',sel(q.spdWx,'WEATHER'),null,tg('spdWx'));
  foot('<REQUEST','VERIFY>',back,verify);
 }else if(pageNo===2){
  row(0,'OFFSET',q.offset||'---','','',field(q.offset,v=>{q.offset=v;},v=>parseOffset(v)));
  row(1,'OFFSET AT',q.offsetAt||'-----','','',field(q.offsetAt,v=>{q.offsetAt=v;},parsePosTime));
  row(3,'','','DUE TO',sel(q.offWx,'WEATHER'),null,tg('offWx'));
  foot('<REQUEST','VERIFY>',back,verify);
 }else{
  row(0,'DIRECT TO',q.directTo||'-----','','',field(q.directTo,v=>{q.directTo=v;},async v=>(await cpFix(v)).id));
  row(1,'',q.rte==='RTE 1'?'REQUEST RTE 1':'<REQUEST RTE 1','',q.rte==='RTE 2'?'REQUEST RTE 2':'REQUEST RTE 2>',()=>{q.rte=q.rte==='RTE 1'?'':(routeIds().length?'RTE 1':(()=>{throw Error('NO ROUTE');})());},()=>{throw Error('RTE 2 NOT AVAILABLE');});
  if(q.rte)rows[1].color='cyan';
  row(2,'REQUEST DEP/ARR',q.depArr||'-----','','',field(q.depArr,v=>{q.depArr=v;},v=>{if(!/^[A-Z0-9]{3,6}(\.[A-Z0-9]{1,5})?$/.test(v))throw Error('INVALID ENTRY');return v;}));
  row(3,'HEADING',q.heading||'---','GROUND TRACK',q.track||'---',field(q.heading,v=>{q.heading=v;},v=>{if(!/^\d{3}$/.test(v)||+v>360)throw Error('INVALID ENTRY');return v;}),field(q.track,v=>{q.track=v;},v=>{if(!/^\d{3}$/.test(v)||+v>360)throw Error('INVALID ENTRY');return v;}));
  foot('<REQUEST','VERIFY>',back,verify);
 }
}
function pgVerifyReq(){
 const q=CP.req,lines=reqLines().flatMap(t=>wrap(t)),free=wrap(q.free);const per=3,pages=Math.max(1,Math.ceil(lines.length/per));title('VERIFY REQUEST',pages);
 lines.slice(pageNo*per,pageNo*per+per).forEach((t,i)=>row(i,'',t));
 const last=pageNo===pages-1;const w=CP.view.waiting&&byId(CP.view.waiting);
 const origin=q.mode==='WHENCAN'?'WHEN CAN WE':q.from==='REQUEST'?'REQUEST':'ATC INDEX';
 if(last){
  row(3,'FREE TEXT','<'+(q.free||''),'','',()=>{if(!scratch&&q.free){copy(q.free);return;}const v=take();q.free=v==='DELETE'?'':v;});
  if(lines.length||q.free){row(4,'','','REQUEST',w&&w.status==='SENDING'?'SENDING':'SEND>',null,()=>sendRequest());}
 }
 foot('<'+origin,'',()=>go(origin==='REQUEST'?'ATC REQUEST':origin==='WHEN CAN WE'?'WHEN CAN WE':'ATC'));
}
function sendRequest(){
 const q=CP.req;const lines=reqLines();if(!lines.length&&!q.free)throw Error('INVALID ENTRY');
 const elems=['alt','speed','offset','directTo','rte','depArr','heading','track','perf','wx'].filter(k=>q[k]).length+(q.free?1:0);if(elems>5)throw Error('MESSAGE LIMIT EXCEEDED');
 const approve=approvalFor(q);const key=q.mode;
 const en=sendDown({kind:'REQUEST',lines:[...lines,...(q.free?wrap(q.free):[])],needsResp:true,approve,isDcl:q.mode==='CLEARANCE',freeText:!!q.free,onAck:en=>{CP.req=blankReq();if(CP.view.waiting===en.id&&(page==='VERIFY REQUEST'||page==='PDC CLEARANCE')){CP.view.sent=en.id;go('ATC SENT');}}});
 CP.view.waiting=en.id;
 taught(key==='CLEARANCE'?'dclRequest':key==='VOICE'?'voice':key==='WHENCAN'?'whenCanWe':q.alt?'reqAlt':q.speed?'reqSpeed':q.offset?'reqOffset':'reqRoute');
 if(q.speed)taught('reqSpeed');if(q.offset)taught('reqOffset');if(q.directTo||q.rte||q.depArr||q.heading||q.track)taught('reqRoute');
 if(q.perf||q.wx)taught('reqModifier');
 CP.reqSnapshot=null;return en;
}
function pgSent(){
 const en=byId(CP.view.sent);if(!en){title('ATC SENT');row(5,'------------------------','<ATC INDEX','','',()=>go('ATC'));return;}
 const t=en.kind==='EMERGENCY'?'EMERGENCY':en.kind==='REPORT'?'ATC REPORT':'ATC REQUEST';
 const lines=en.lines.flatMap(x=>wrap(x));const per=4,pages=Math.max(1,Math.ceil(lines.length/per));title(en.z+' '+t,pages);
 if(pageNo===0&&en.kind==='REQUEST'&&en.reply){const up=byId(en.reply);row(0,'',  '<UPLINK','',up?up.z:'',()=>{CP.view.up=en.reply;go('ATC UPLINK');});}
 lines.slice(pageNo*per,pageNo*per+per).forEach((x,i)=>row(i+1,'',x));
 row(5,'------------------------','<'+en.status,'','LOG>',null,()=>go('ATC LOG'));
}
function pgReportList(){
 const R=CP.reports,pages=Math.max(1,Math.ceil(R.length/5));const arm=R.some(r=>r.armed);title(arm?'ATC REPORT ARMED':'ATC REPORT',pages);
 for(let i=0;i<5;i++){const r=R[pageNo*5+i];if(!r)continue;const open=()=>{CP.view.rep=r;CP.view.repFrom='ATC REPORT';go('VERIFY REPORT');};row(i,r.armed?'ARMED':'',(r.kind==='LEVEL'?'<REPORT ':'<')+abbr(repText(r)[0],14),'','>',open,open);}

 row(0,rows[0]&&rows[0].ll||'',(rows[0]&&rows[0].lv||'').slice(0,11),'','FREE TEXT>',rows[0]&&rows[0].left,()=>{CP.view.rep={kind:'FREE',free:''};CP.view.repFrom='ATC REPORT';go('VERIFY REPORT');});
 row(1,rows[1]&&rows[1].ll||'',(rows[1]&&rows[1].lv||'').slice(0,12),'','VOICE>',rows[1]&&rows[1].left,()=>{CP.req=Object.assign(blankReq(),{mode:'VOICE',from:'ATC INDEX'});go('VERIFY REQUEST');});
 row(5,'------------------------','<INDEX','','',()=>go('ATC'));
}
function pgVerifyRep(){
 const r=CP.view.rep;title('VERIFY REPORT');
 if(!r){row(5,'------------------------','<ATC INDEX','','',()=>go('ATC'));return;}
 const from=CP.view.repFrom==='ATC REPORT'?'REPORT':'ATC INDEX';
 const freeRow=()=>row(3,'FREE TEXT','<'+(r.free||''),'','',()=>{if(!scratch&&r.free){copy(r.free);return;}const v=take();r.free=v==='DELETE'?'':v;});
 const w=CP.view.waiting&&byId(CP.view.waiting);
 if(r.kind==='FREE'){row(0,'FREE TEXT','<'+(r.free||''),'','',()=>{if(!scratch&&r.free){copy(r.free);return;}const v=take();r.free=v==='DELETE'?'':v;});
  if(r.free)row(4,'','','',w&&w.status==='SENDING'?'SENDING':'SEND>',null,()=>sendReport(r,false));}
 else{
  repText(r).forEach((t,i)=>row(i,'',t));
  if(r.kind==='WHENCAN'){
   row(1,'TIME',r.cannot?'':(r.time?r.time+'Z':boxes()+'Z'),'','',()=>{if(r.cannot)return;if(!scratch){return;}const v=take();if(v==='DELETE'){r.time='';return;}if(!hhmm(v.replace(/Z$/,'')))throw Error('INVALID ENTRY');r.time=v.replace(/Z$/,'');});
   rows[1].lv=r.cannot?'':(r.time?r.time+'Z':boxes()+'Z');
   row(2,'','<CANNOT ACCEPT'+(r.cannot?'':''),'','',()=>{r.cannot=!r.cannot;});
   if(r.cannot)rows[2].color='cyan';
  }
  freeRow();
  if(r.armable||r.kind==='LEVEL'){const up=byId(r.upId);const can=up&&up.status==='ACCEPTED';if(can||r.armed)row(4,'','','ARM',r.armed?'ARMED':'ARM>',null,()=>{if(!r.armed){r.armed=true;taught('arm');}else r.armed=false;});}
  if(repComplete(r)&&!(r.kind==='LEVEL'&&false))rows[5]={ll:'------------------------',lv:'<'+from,rl:'',rv:w&&w.status==='SENDING'?'SENDING':'SEND>',left:()=>go(from==='REPORT'?'ATC REPORT':'ATC'),right:()=>sendReport(r,false)};
 }
 if(!rows[5].left)row(5,'------------------------','<'+from,'','',()=>go(from==='REPORT'?'ATC REPORT':'ATC'));
}
function pgPos(){
 const d=posData(),P=CP.pos;title('POS REPORT');
 const wpEntry=k=>field(P[k],v=>{P[k]=v;},async v=>(await cpFix(v)).id,()=>{P[k]='';});
 const tmEntry=k=>field(P[k],v=>{P[k]=v;},v=>{v=v.replace(/Z$/,'');if(!hhmm(v))throw Error('INVALID ENTRY');return v;},()=>{P[k]='';});
 row(0,'POS',d.pos,'ALT',d.alt,wpEntry('pos'));rows[0].cl='ATA';rows[0].cv=d.ata;
 row(1,'EST',d.est,'ETA',d.eta,wpEntry('est'),tmEntry('eta'));
 row(2,'NEXT',d.next,'DEST ETA',d.destEta,wpEntry('next'),tmEntry('destEta'));
 row(3,'TEMP',d.temp,'WIND',d.wind);
 row(4,'','','POS FUEL',d.fuel);
 const w=CP.view.posSend&&byId(CP.view.posSend);
 foot('<PROGRESS',w&&w.status==='SENDING'?'SENDING':w&&w.status==='SENT'?'SENT':'REPORT>',()=>go('PROG'),()=>{const p=posData();const en=sendDown({kind:'REPORT',lines:wrap(`POSITION REPORT ${p.pos} ${p.ata} ${p.alt} TEMP ${p.temp} NEXT ${p.est} ETA ${p.eta} THEN ${p.next} DEST ETA ${p.destEta} M${p.spd} FUEL ${p.fuelHM}`),needsResp:false});CP.view.posSend=en.id;taught('posReport');});
}
function pgWhen(){
 const q=CP.req,w=q.wc;title('WHEN CAN WE EXPECT');q.mode='WHENCAN';
 const ent=k=>field(w[k]?w[k].text:'',v=>{w[k]=v;},v=>parseAlt(v,{block:false}),()=>{w[k]=null;});
 row(0,'CRZ CLB TO',w.crzClb?w.crzClb.text:'---','HIGHER ALT',w.higher?'SELECTED':'>',ent('crzClb'),()=>{w.higher=!w.higher;});
 row(1,'CLIMB TO',w.climb?w.climb.text:'---','LOWER ALT',w.lower?'SELECTED':'>',ent('climb'),()=>{w.lower=!w.lower;});
 row(2,'DESCENT TO',w.descent?w.descent.text:'---','BACK ON RTE',w.back?'SELECTED':'>',ent('descent'),()=>{w.back=!w.back;});
 row(3,'SPEED',w.speed||'---','','',field(w.speed,v=>{w.speed=v;},v=>parseSpeed(v),()=>{w.speed='';}));
 row(4,'','<ERASE WHEN CAN WE','','',()=>{CP.req=Object.assign(blankReq(),{mode:'WHENCAN'});});
 foot('<ATC INDEX','VERIFY>',()=>go('ATC'),()=>{q.mode='WHENCAN';q.from='WHEN CAN WE';go('VERIFY REQUEST');});
}
function pgEmer(){
 const m=CP.emer,sent=CP.log.find(x=>x.kind==='EMERGENCY'&&x.dir==='DN'&&x.emerType&&x.status!=='ABORTED'&&!x.cancelled);title('EMERGENCY REPORT');
 const apt=m.divert?m.divert.id:(e.route.destination||'-----');
 const fuelDefault=()=>{const h=Math.max(0,(+(e.perf.fuel||0))/5.0);return String(Math.floor(h)).padStart(2,'0')+String(Math.round((h%1)*60)).padStart(2,'0');};
 row(0,'','<MAYDAY','','PAN>',()=>{m.type='MAYDAY';go('VERIFY EMERGENCY');},()=>{m.type='PAN';go('VERIFY EMERGENCY');});
 row(1,'DIVERT TO',apt,'SOB',m.sob||'---',field(apt,v=>{m.divert=v;},async v=>cpFix(v)),field(m.sob,v=>{m.sob=v;},v=>{if(!/^\d{1,3}$/.test(v)||+v<1)throw Error('INVALID ENTRY');if(!m.fuel)m.fuel=fuelDefault();return String(+v);},()=>{m.sob='';}));
 row(2,'OFFSET',m.offset||'---','FUEL REMAINING',m.sob?(m.fuel||fuelDefault()):'',field(m.offset,v=>{m.offset=v.replace(/^([LR])/,'$1');},v=>{const o=parseOffset(v);return o;},()=>{m.offset='';}),()=>{if(!m.sob)return;if(!scratch){return;}const v=take().replace('+','');if(v==='DELETE'){m.fuel='';return;}if(!/^\d{4}$/.test(v))throw Error('INVALID ENTRY');m.fuel=v;});
 row(3,'DESCEND TO',m.descend?m.descend.text:'---','','',field(m.descend?m.descend.text:'',v=>{m.descend=v;},v=>parseAlt(v,{block:false}),()=>{m.descend=null;}));
 const any=m.type||m.divert||m.offset||m.descend||m.sob||m.fuel;
 if(sent)row(4,'','<CANCEL EMERGENCY','','',()=>{linkCheck();const en=sendDown({kind:'EMERGENCY',lines:['CANCEL EMERGENCY'],needsResp:false,cancelEmer:true});sent.cancelled=true;CP.ads.emer=false;CP.view.sent=en.id;go('ATC SENT');taught('emerCancel');});
 else if(any)row(4,'','<ERASE EMERGENCY','','',()=>{CP.emer=blankEmer();});
 foot('<ATC INDEX','VERIFY>',()=>go('ATC'),()=>{if(!m.type)throw Error('INVALID ENTRY');go('VERIFY EMERGENCY');});
}
function pgVerifyEmer(){
 const m=CP.emer;if(!m.type){title('VERIFY EMERGENCY');row(5,'------------------------','<EMERGENCY','','',()=>go('EMERGENCY'));return;}
 const lines=emerLines().flatMap(t=>wrap(t)),per=3,pages=Math.max(1,Math.ceil(lines.length/per));title('VERIFY EMERGENCY',pages);
 lines.slice(pageNo*per,pageNo*per+per).forEach((t,i)=>row(i,'',t));
 const last=pageNo===pages-1,w=CP.view.waiting&&byId(CP.view.waiting);
 if(last){row(3,'FREE TEXT','<'+(m.free||''),'','',()=>{if(!scratch&&m.free){copy(m.free);return;}const v=take();m.free=v==='DELETE'?'':v;});
  row(4,'','','',w&&w.status==='SENDING'?'SENDING':'REPORT SEND>',null,()=>sendEmergency());}
 foot('<EMERGENCY','',()=>go('EMERGENCY'));
}
function sendEmergency(){
 const m=CP.emer,type=m.type;
 const en=sendDown({kind:'EMERGENCY',lines:emerLines(),needsResp:false,emerType:type,onAck:en=>{if(page==='VERIFY EMERGENCY'){CP.view.sent=en.id;go('ATC SENT');}}});
 CP.view.waiting=en.id;
 if(type==='MAYDAY'){CP.ads.emer=true;const p=posData();setTimeout(()=>{try{sendDown({kind:'REPORT',lines:wrap(`POSITION REPORT ${p.pos} ${p.ata} ${p.alt}`),needsResp:false,auto:true});}catch{}},300);}
 taught('emergency');return en;
}

/* ---------- housekeeping ---------- */
let seqIdx;
function logonTimeout(){const L=CP.logon;if(L.status!=='SENT'||L.noResponse)return false;L.noResponse=true;if(!message)message='RE-LOGON TO ATC COMM';chime();redraw();return true;}
function reqTimeout(){const en=CP.log.filter(x=>x.dir==='DN'&&x.status==='OPEN'&&x.needsResp).pop();if(!en)return false;en.timedOut=true;notice('ATC TIMEOUT-RESEND');return true;}
function fillStorage(){let n=0;for(let i=0;i<=CP.pendMax;i++){const r=deliver({text:'EXPECT FURTHER CLEARANCE '+(i+1),resp:'R'});if(r.ok)n++;}return n;}
function tick(){
 if(typeof e==='undefined'||!e||!e.active)return;
 const idx=e.active.index;if(seqIdx!==undefined&&idx>seqIdx){const leg=e.active.legs[idx-1];if(leg&&!leg.disco)CP.lastSeq={id:leg.id,t:nowMs(),alt:curAlt(),fuel:e.perf.fuel};}seqIdx=idx;
 for(const r of CP.reports.filter(x=>x.state==='READY'&&x.armed&&x.kind==='LEVEL')){if(Math.abs(curAlt()-r.ft)<=100&&CP.logon.connected&&CP.link==='READY'){try{sendReport(r,true);}catch{}redraw();}}
 const L=CP.logon;if(L.status==='SENT'&&!L.noResponse&&nowMs()-L.sentAt>600000)logonTimeout();
 if(CP.lastLink==='READY'&&CP.link!=='READY'&&L.connected)notice('DATALINK LOST');CP.lastLink=CP.link;
 if(CP.ads.contracts.length&&!CP.ads.off){CP.ads.reports=(CP.ads.reports||0);}
}
setInterval(tick,1000);

window.CPDLC={advisory:m=>/^(ATC MESSAGE|ATC COMM|ROUTE LOADED|RE-LOGON TO|ATC TIMEOUT|RESPOND TO ATC|DATALINK LOST)/.test(m||'')||(window.ACARS&&ACARS.advisory(m)),pages:PAGES,build,register,preRender,atcKey,ref:p=>(EXT_REF[p]||FCOM_REF()[p]||'11.34.1'),state:CP,
 api:{logonTimeout,reqTimeout,fillStorage,notice,posData,loadRoute,sendDown,deliver,connect,terminate,respondGround:null,tell,redraw,taught,routeIds,byId,wrap,chime,inbox,curAlt,fmtAlt,Zt,abortPending,blankReq,nowMs}};
})();
