/* B737 FMC ACARS Trainer · ATC / ground console.
   The controller side of the data link: accepts logon, establishes the CPDLC connection, sends sample uplinks that
   illustrate the AeroSim CPDLC lesson, and answers the aircraft's downlinks. Sample message wording is typical
   FANS-1/A phrasing for teaching; the CDU behaviour it drives follows FCOM 11.34. */
(function(){'use strict';
const CP=window.CP,API=CPDLC.api,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- ground logon handling ---------- */
let pendingLogon=null;
const sig=l=>[l.to,l.flt,l.tail].join('|');
window.CPDLCGround={
 onLogon(req){
  const g=CP.ground,p=[];
  if(req.to!==g.id)p.push(`LOGON TO ${req.to} is not this station (${g.id})`);
  if(!g.planOnFile)p.push('no ATC flight plan on file');
  if(g.planOnFile&&req.flt!==g.fltOnFile)p.push(`flight number ${req.flt} does not match the filed plan (${g.fltOnFile})`);
  if(g.planOnFile&&req.tail!==g.tailOnFile)p.push(`tail number ${req.tail} does not match the filed plan (${g.tailOnFile})`);
  if(!g.dclCapable)p.push('filed plan is not marked DCL capable');
  pendingLogon={req,problems:p};
  if(g.autoValidate)setTimeout(()=>p.length?rejectLogon():acceptLogon(),900);
  API.tell();
 }
};
function acceptLogon(){const L=CP.logon;if(!pendingLogon)return;pendingLogon=null;L.status='ACCEPTED';API.taught('logonAccepted');API.inbox({type:'INFO',text:'Logon ACCEPTED'});if(CP.ground.autoConnect)setTimeout(()=>{if(!L.connected&&L.status==='ACCEPTED')API.connect();},2500);API.redraw();}
function rejectLogon(){const L=CP.logon;if(!pendingLogon)return;const p=pendingLogon.problems;pendingLogon=null;L.status='REJECTED';L.rejSig=[L.to,L.flt||e.flightNo,L.tail].join('|');L.reason=p.join('; ');API.taught('logonRejected');API.inbox({type:'INFO',text:'Logon REJECTED'+(p.length?': '+p.join('; '):'')});API.redraw();}

/* ---------- scenarios (CBT lesson) ---------- */
const route=()=>{
 let ids=API.routeIds().filter(id=>id!==e.route.destination);
 if(ids.length<4){const o=db.airports[e.scenario.origin],d=db.airports[e.scenario.destination];try{ids=e.trainingRoute(o,d).map(p=>p.id).filter(id=>id!==d.id&&id!==o.id);}catch{}}
 return {ids,dest:e.route.destination||e.scenario?.destination||'DEST',orig:e.route.origin||e.scenario?.origin||'ORIG'};
};
const hhmm=min=>API.Zt(API.nowMs()+min*60000);
const SCEN=[
 {g:'Departure clearance (DCL) · at the gate',items:[
  {id:'asFiled',title:'CLEARED AS FILED',sub:'No loadable route · no altitude',
   teach:'CLEARED AS FILED with no altitude assigned has NO option to reject (REJECT is absent). Accept, then add the SID and transition manually, EXEC, and clean up discontinuities. After this, future revisions can be rejected.',
   make:()=>{const r=route();return {dcl:true,dclKind:'dclAsFiled',noReject:true,noReason:true,resp:'WU',text:`CLEARED TO ${r.dest} AS FILED.\nTHEN AS FILED.\nCLIMB VIA SID.\nSQUAWK 4521.\nDEPARTURE FREQ 124.35`};}},
  {id:'revInitial',title:'Revised initial clearance',sub:'Loadable route · LOAD then ACCEPT/REJECT',
   teach:'LOAD the route to review it on the LEGS page and the ND (dashed white = new route, magenta = previous). The Departure and Transition are NOT in the loadable route: add them yourself. REJECT carries no reason code; contact the controller by voice afterwards.',
   make:()=>{const r=route(),ids=r.ids.filter((x,i)=>i!==1);return {dcl:true,dclKind:'dclRevisedInitial',noReason:true,resp:'WU',loadable:{type:'route',ids,dest:r.dest,orig:r.orig},text:`CLEARED TO ${r.dest} VIA ROUTE CLEARANCE:\n${ids.join(' ')}\nCLIMB VIA SID. SQUAWK 4522.\nDEPARTURE FREQ 124.35`};}},
  {id:'toPos',title:'Cleared to position via route',sub:'Partial route clearance (loadable)',
   teach:'“CLEARED TO POSITION VIA ROUTE CLEARANCE” is the other loadable DCL form. Same procedure: LOAD, review, ACCEPT, add the SID, EXEC, clean up discontinuities.',
   make:()=>{const r=route(),ids=r.ids.slice(0,3);return {dcl:true,dclKind:'dclRevisedInitial',noReason:true,resp:'WU',loadable:{type:'route',ids,dest:r.dest,orig:r.orig},text:`CLEARED TO ${ids.at(-1)} VIA ROUTE CLEARANCE:\n${ids.join(' ')}\nSQUAWK 4522.\nDEPARTURE FREQ 124.35`};}},
  {id:'revised',title:'Revised clearance after pushback',sub:'Controller changed the route',
   teach:'Revisions can arrive until handoff to the tower. Review the whole clearance (the changes are flagged). Complex revisions need heads-down time: stop with the parking brake set, do not do it close to an active runway. LOAD, ACCEPT, add the SID, EXEC.',
   make:()=>{const r=route(),ids=r.ids.slice(1);return {dcl:true,dclKind:'dclRevised',noReason:true,resp:'WU',loadable:{type:'route',ids,dest:r.dest,orig:r.orig},text:`REVISED CLEARANCE.\nCHANGED: ROUTE (${r.ids[0]} REMOVED), SQUAWK 4530 (WAS 4522).\nCLEARED TO ${r.dest} VIA ROUTE CLEARANCE:\n${ids.join(' ')}`};}}
 ]},
 {g:'Enroute clearances',items:[
  {id:'climbRep',title:'CLIMB TO FL350 + REPORT LEVEL',sub:'ACCEPT → ARM report → auto-sent at level',
   teach:'Both pilots silently read every page, confer, then ACCEPT or REJECT. After ACCEPT the REPORT page offers ARM: the LEVEL report is sent automatically when the aircraft levels at FL350 (set the altitude in the console or in the Aircraft state panel). REJECT offers DUE TO PERFORMANCE.',
   make:()=>({resp:'WU',text:'CLIMB TO AND MAINTAIN FL350\nREPORT LEVEL FL350',rep:{kind:'LEVEL',ft:35000}})},
  {id:'reroute',title:'Route change (loadable)',sub:'CLEARED TO dest VIA route',
   teach:'After ACCEPT, LOAD inserts the new route into the FMS RTE for review; then EXEC. Uplinked and downlinked messages stay in the ATC LOG (▲ uplink, ▼ downlink).',
   make:()=>{const r=route(),ids=r.ids.filter((x,i)=>i!==2);return {resp:'WU',loadable:{type:'route',ids,dest:r.dest,orig:r.orig},text:`CLEARED TO ${r.dest} VIA ROUTE CLEARANCE:\n${ids.join(' ')}`};}},
  {id:'direct',title:'PROCEED DIRECT TO fix (loadable)',sub:'Direct-to loaded into LEGS',
   teach:'A direct-to clearance is loadable. LOAD creates the MOD route; review it and EXEC.',
   make:()=>{const r=route(),legs=e.route.legs.slice(e.route.index).filter(l=>!l.disco&&l.id!==e.route.destination),id=(legs[1]||legs[0]||{id:r.ids[1]||r.ids[0]}).id;return {resp:'WU',loadable:{type:'direct',id},text:`PROCEED DIRECT TO ${id}`};}},
  {id:'speed',title:'MAINTAIN M.78',sub:'Speed instruction',teach:'Simple clearance: WILCO sends ACCEPT.',make:()=>({resp:'WU',text:'MAINTAIN M.78'})},
  {id:'heading',title:'FLY HEADING 270',sub:'Heading instruction',teach:'Simple clearance: WILCO sends ACCEPT.',make:()=>({resp:'WU',text:'FLY HEADING 270'})},
  {id:'cond',title:'Conditional clearance (AT fix)',sub:'AT … CLIMB TO …',
   teach:'Conditional clearances need special attention: a common error is to miss the condition (“AT”) and climb at once. Silent read, confer, then execute only when the condition is met.',
   make:()=>{const r=route(),legs=e.route.legs.slice(e.route.index).filter(l=>!l.disco&&l.id!==e.route.destination),id=(legs[1]||legs[0]||{id:r.ids[1]}).id;return {resp:'WU',cond:true,text:`AT ${id} CLIMB TO AND MAINTAIN FL370`};}},
  {id:'long',title:'Long multi-page message',sub:'Respond only after the last page',
   teach:'CPDLC messages may be longer than one page and the response prompts appear on the LAST page only: page through the entire message before you respond or execute.',
   make:()=>({resp:'WU',text:'CLEARED TO DEVIATE AROUND WEATHER. CLIMB TO AND MAINTAIN FL370 AT PILOT DISCRETION. CROSS THE NEXT WAYPOINT AT OR ABOVE FL330. MAINTAIN M.78 UNTIL FURTHER ADVISED. IF UNABLE TO COMPLY REPORT BY VOICE. REPORT LEAVING FL350. EXPECT DIRECT ROUTING AFTER THE NEXT WAYPOINT.'})},
  {id:'contact',title:'CONTACT next unit',sub:'Frequency change',teach:'WILCO is the response; the dialog is closed on CPDLC even if a verbal response is also given.',make:()=>({resp:'WU',text:'CONTACT KZJX CENTER 132.45'})},
  {id:'stby',title:'STANDBY (from ATC)',sub:'ATC asks for time',teach:'STANDBY can be used by either ATC or the flight crew when the response will be delayed.',make:()=>({resp:'NE',text:'STANDBY'})}
 ]},
 {g:'Reports and inquiries',items:[
  {id:'whenCan',title:'WHEN CAN YOU ACCEPT FL390',sub:'Answer via ATC REPORT (CAN / CANNOT ACCEPT)',
   teach:'An inquiry such as “WHEN CAN YOU ACCEPT …” is not a clearance. Use the REPORT page: enter the time (CAN ACCEPT FL390 AT hhmmZ) or select CANNOT ACCEPT, then SEND.',
   make:()=>({resp:'NE',text:'WHEN CAN YOU ACCEPT FL390',rep:{kind:'WHENCAN',ft:39000,altText:'FL390'}})},
  {id:'back',title:'Weather deviation + REPORT BACK ON ROUTE',sub:'Report when the deviation is complete',
   teach:'ATC may ask you to report back on route after a weather deviation. When the deviation is complete select the REPORT page and send BACK ON ROUTE.',
   make:()=>({resp:'WU',text:'CLEARED TO DEVIATE UP TO 20NM LEFT OF ROUTE\nREPORT BACK ON ROUTE',rep:{kind:'BACK'}})},
  {id:'confirmPos',title:'CONFIRM POSITION',sub:'Position report on request',
   teach:'Position reports are normally automatic but ATC may request one. Also available from ATC INDEX → POS REPORT.',
   make:()=>({resp:'NE',text:'CONFIRM POSITION',rep:{kind:'CONFIRMPOS'}})},
  {id:'expect',title:'EXPECT climb (information)',sub:'Not a clearance',
   teach:'An EXPECT message is not a clearance, and neither is the reply to “WHEN CAN WE EXPECT …”. Do not climb on it.',
   make:()=>({resp:'NE',expect:true,text:`EXPECT CLIMB TO FL390 AT ${hhmm(25)}`})}
 ]}
];
const find=id=>SCEN.flatMap(g=>g.items).find(i=>i.id===id);
async function sendScenario(id,extra={}){const it=find(id);if(!it)return;try{await ensureFixes();}catch{}let spec;try{spec=it.make();}catch(err){setNote('Could not build the message: '+err.message,true);return;}
 const r=API.deliver({...spec,...extra});if(!r.ok){setNote(r.why,true);return;}CP.lastTeach=it.teach;setNote(it.teach);return r;}
function setNote(t,bad){const el=$('cc-note');if(!el)return;el.textContent=t;el.classList.toggle('bad',!!bad);}

/* ---------- responses to aircraft downlinks ---------- */
async function reply(item,kind,choice){
 const base={refId:item.enId};let r;
 if(kind==='UNABLE')r=API.deliver({...base,text:'UNABLE',resp:'NE',replyKind:'UNABLE'});
 else if(kind==='STANDBY')r=API.deliver({...base,text:'STANDBY',resp:'NE',replyKind:'STANDBY'});
 else if(kind==='DEFERRED')r=API.deliver({...base,text:'REQUEST DEFERRED',resp:'NE',replyKind:'DEFERRED'});
 else if(kind==='ROGER')r=API.deliver({...base,text:'ROGER',resp:'NE'});
 else if(kind==='APPROVE'){const a=item.approve[choice];if(a.key){const it=find(a.key==='asFiled'?'asFiled':a.key==='fullRoute'?'revInitial':'toPos');sendScenario(it.id,base);item.replied=true;API.tell();return;}
  else r=API.deliver({...base,text:a.text,resp:a.resp||'WU',loadable:a.loadable||null,expect:!!a.expect});}
 if(r&&r.ok!==false)item.replied=true;else if(r&&r.why)setNote(r.why,true);
 API.tell();
}

/* ---------- checklist (AeroSim CPDLC lesson) ---------- */
const CHECK=[
 ['Logon and connection',[['logon','AFN logon sent from LOGON/STATUS'],['logonAccepted','Logon ACCEPTED by ATC'],['connect','ATC COMM ESTABLISHED, ACT CTR shown'],['logonRejected','Logon REJECTED (wrong FLT/TAIL)'],['adsOn','ADS on/off (LOGON/STATUS 2/2)'],['adsEmer','ADS EMER selected']]],
 ['Indications and responses',[['viewUp','Uplink: •ATC, hi/lo chime, ATC MESSAGE, MSG light'],['accept','ACCEPT (WILCO/ROGER/AFFIRM)'],['reject','REJECT (UNABLE)'],['rejectReason','REJECT DUE TO reason (e.g. PERFORMANCE)'],['standby','STANDBY'],['log','ATC LOG reviewed (▲ uplink / ▼ downlink)']]],
 ['Departure clearance (DCL)',[['dclRequest','CLEARANCE request sent (no free text)'],['notAllowed','Free text in DCL request → NOT ALLOWED'],['dclAsFiled','CLEARED AS FILED accepted (no REJECT option)'],['dclRevisedInitial','Revised initial clearance accepted'],['dclLoad','DCL route LOADed into the FMS'],['dclRevised','Revised clearance after pushback accepted']]],
 ['Enroute',[['load','Enroute route/direct-to LOAD'],['armAvail','REPORT ARM available after ACCEPT'],['arm','LEVEL report ARMED'],['levelAuto','LEVEL report sent automatically at level'],['reqAlt','Altitude request (REQUEST page)'],['reqModifier','DUE TO PERFORMANCE / WEATHER modifier'],['reqSpeed','Speed request'],['reqOffset','Offset request'],['reqRoute','Route request (DIRECT TO, RTE 1, DEP/ARR…)'],['whenCan','WHEN CAN YOU ACCEPT report'],['backOnRoute','BACK ON ROUTE report'],['report','Other ATC report (e.g. CONFIRM POSITION)'],['posReport','POS REPORT sent'],['free','FREE TEXT sent'],['voice','VOICE (revert to voice) request'],['whenCanWe','WHEN CAN WE EXPECT query'],['emergency','Emergency report (MAYDAY/PAN)'],['emerCancel','CANCEL EMERGENCY']]],
 ['Best practices',[['multi','Read a multi-page message to the last page'],['expect','EXPECT message recognised as not a clearance'],['cond','Conditional clearance (AT …) handled']]],
 ['Termination',[['terminate','Connection terminated (ATC or crew)'],['transfer','Transfer to next ATC center']]]
];

/* ---------- UI ---------- */
function build(){
 const host=$('atc-console');if(!host)return;
 host.innerHTML=`
 <div class="cc-head"><div><span class="eyebrow">GROUND / ATC CONSOLE</span><h2>ATC controller station</h2></div><div id="cc-state" class="cc-state"></div></div>
 <div class="cc-grid">
  <div class="cc-card"><h3>Station &amp; data link</h3>
   <div class="cc-two"><label>ATC station ID<input id="cc-id" maxlength="4" value="${esc(CP.ground.id)}"></label><label>Data link status<select id="cc-link"><option>READY</option><option>NO COMM</option><option>VOICE</option><option>FAIL</option></select></label></div>
   <div class="cc-two"><label>Flight number on file<input id="cc-flt" value="${esc(CP.ground.fltOnFile)}"></label><label>Tail number on file<input id="cc-tail" value="${esc(CP.ground.tailOnFile)}"></label></div>
   <label class="cc-check"><input type="checkbox" id="cc-plan" checked> ATC flight plan on file</label>
   <label class="cc-check"><input type="checkbox" id="cc-dcl" checked> Plan marked DCL capable</label>
   <label class="cc-check"><input type="checkbox" id="cc-auto" checked> Validate logon automatically</label>
   <label class="cc-check"><input type="checkbox" id="cc-conn" checked> Establish CPDLC connection automatically after ACCEPT</label>
   <label class="cc-check"><input type="checkbox" id="cc-roger" checked> Auto-acknowledge emergency (ROGER MAYDAY / PAN)</label>
   <label class="cc-check"><input type="checkbox" id="cc-mute"> Mute hi/lo chime</label>
   <label>Network acknowledgement delay <span id="cc-ackv">1.2</span> s<input type="range" id="cc-ack" min="0.2" max="6" step="0.2" value="1.2"></label>
   <div class="cc-btns"><button id="cc-accept">Accept logon</button><button id="cc-reject">Reject logon</button><button id="cc-connect">Establish CPDLC connection</button><button id="cc-nores">No response to logon (10 min)</button></div>
   <div class="cc-btns"><button id="cc-term">ATC terminates connection</button></div>
   <div class="cc-two"><label>Next center<input id="cc-next" maxlength="4" placeholder="CZQX"></label><div class="cc-btns cc-end"><button id="cc-nextn">Announce</button><button id="cc-xfer">Complete transfer</button></div></div>
   <div class="cc-two"><label>Aircraft altitude (ft)<input id="cc-alt" type="number" step="100" placeholder="35000"></label><div class="cc-btns cc-end"><button id="cc-setalt">Set altitude</button></div></div>
   <div class="cc-btns"><button id="cc-ads">ADS contract request</button><button id="cc-adsx">Cancel ADS contracts</button></div>
  </div>
  <div class="cc-card cc-wide"><h3>Sample uplinks · AeroSim CPDLC lesson</h3><div id="cc-note" class="cc-note">Choose a message. The teaching point for it is shown here.</div><div id="cc-scen"></div>
   <details class="cc-custom"><summary>Compose your own uplink</summary>
    <label>Message text<textarea id="cc-ctext" rows="2" placeholder="CLIMB TO AND MAINTAIN FL330"></textarea></label>
    <div class="cc-two"><label>Response required<select id="cc-cresp"><option value="WU">WILCO / UNABLE</option><option value="AN">AFFIRM / NEGATIVE</option><option value="R">ROGER</option><option value="NE">None</option></select></label><label>Loadable direct-to fix (optional)<input id="cc-cload" placeholder="fix id"></label></div>
    <div class="cc-btns"><button id="cc-csend">Send uplink</button></div></details>
  </div>
  <div class="cc-card"><h3>From the aircraft</h3><div id="cc-inbox" class="cc-inbox"></div></div>
  <div class="cc-card"><h3>Lesson checklist <span id="cc-prog"></span></h3><div id="cc-check"></div><button id="cc-resetck" class="quiet">Reset checklist</button></div>
 </div>`;
 $('cc-link').value=CP.link;
 const g=CP.ground,on=(id,fn,ev='change')=>$(id).addEventListener(ev,fn);
 on('cc-id',ev=>{g.id=ev.target.value.toUpperCase().trim()||'KUSA';});on('cc-link',ev=>{CP.link=ev.target.value;API.redraw();});
 on('cc-flt',ev=>{g.fltOnFile=ev.target.value.toUpperCase().trim();});on('cc-tail',ev=>{g.tailOnFile=ev.target.value.toUpperCase().trim();});
 on('cc-plan',ev=>{g.planOnFile=ev.target.checked;});on('cc-dcl',ev=>{g.dclCapable=ev.target.checked;});on('cc-auto',ev=>{g.autoValidate=ev.target.checked;});on('cc-conn',ev=>{g.autoConnect=ev.target.checked;});on('cc-roger',ev=>{g.autoRoger=ev.target.checked;});on('cc-mute',ev=>{g.mute=ev.target.checked;});
 on('cc-ack',ev=>{g.ackMs=+ev.target.value*1000;$('cc-ackv').textContent=(+ev.target.value).toFixed(1);},'input');
 on('cc-accept',acceptLogon,'click');on('cc-reject',rejectLogon,'click');
 on('cc-connect',()=>{if(CP.logon.status==='ACCEPTED'&&!CP.logon.connected)API.connect();else setNote('The logon must be ACCEPTED before the connection can be established.',true);},'click');
 on('cc-nores',()=>{if(CP.logon.status==='SENT'){pendingLogon=null;CP.logon.noResponse=true;API.redraw();}else setNote('No logon is waiting for a response.',true);},'click');
 on('cc-term',()=>{if(CP.logon.connected)API.terminate('ATC');else setNote('No CPDLC connection to terminate.',true);},'click');
 on('cc-nextn',()=>{const v=$('cc-next').value.toUpperCase().trim();if(CP.logon.connected&&/^[A-Z]{4}$/.test(v)){CP.logon.nextCtr=v;API.redraw();}else setNote('Connection required and a four-letter center ID.',true);},'click');
 on('cc-xfer',()=>{const L=CP.logon;if(L.connected&&L.nextCtr){API.abortPending();L.actCtr=L.nextCtr;L.nextCtr='';CP.ground.id=L.actCtr;$('cc-id').value=L.actCtr;API.taught('transfer');API.inbox({type:'INFO',text:'Transfer of communications complete; pending messages ABORTED'});API.redraw();}else setNote('Announce a next center first.',true);},'click');
 on('cc-setalt',()=>{const v=+$('cc-alt').value;if(v>=0&&v<=50000&&$('cc-alt').value!==''){e.aircraft.altitude=v;try{syncStateInputs();}catch{}API.redraw();}},'click');
 on('cc-ads',()=>{const L=CP.logon;if(!L.connected||!L.tail||CP.ads.off){setNote('ADS needs a CPDLC connection, a tail number, and ADS armed.',true);return;}CP.ads.contracts.push({type:'periodic'});API.inbox({type:'INFO',text:'ADS periodic contract established (ADS ACT)'});API.redraw();},'click');
 on('cc-adsx',()=>{CP.ads.contracts=[];API.redraw();},'click');
 on('cc-resetck',()=>{CP.done={};API.tell();},'click');
 on('cc-csend',()=>{const t=$('cc-ctext').value.trim();if(!t)return;const f=$('cc-cload').value.toUpperCase().trim();const r=API.deliver({text:t,resp:$('cc-cresp').value,loadable:f?{type:'direct',id:f}:null});if(!r.ok)setNote(r.why,true);},'click');
 $('cc-scen').innerHTML=SCEN.map(grp=>`<h4>${esc(grp.g)}</h4><div class="cc-scn">${grp.items.map(it=>`<button class="cc-s" data-s="${it.id}"><strong>${esc(it.title)}</strong><span>${esc(it.sub)}</span></button>`).join('')}</div>`).join('');
 $('cc-scen').addEventListener('click',ev=>{const b=ev.target.closest('[data-s]');if(b)sendScenario(b.dataset.s);});
 $('cc-inbox').addEventListener('click',ev=>{const b=ev.target.closest('[data-r]');if(!b)return;const item=CP.inbox.find(x=>x.n===+b.dataset.n);if(item)reply(item,b.dataset.r,+b.dataset.c);});
 paint();
}
function paint(){
 const L=CP.logon,st=$('cc-state');if(!st)return;
 const conn=L.connected?`<b class="ok">CPDLC CONNECTED</b> · ACT CTR ${esc(L.actCtr)}${L.nextCtr?' · NEXT '+esc(L.nextCtr):''}`:L.status==='SENT'?(pendingLogon?`<b class="wait">LOGON RECEIVED</b> · ${pendingLogon.problems.length?esc(pendingLogon.problems.join('; ')):'data match the filed plan'}`:'<b class="wait">LOGON SENT</b>'):L.status==='ACCEPTED'?'<b class="wait">LOGON ACCEPTED · awaiting connection</b>':L.status==='REJECTED'?'<b class="bad">LOGON REJECTED</b>':'<b>NO CONNECTION</b> · the aircraft must log on first';
 st.innerHTML=`${conn} · link ${esc(CP.link)} · ADS ${CP.ads.off?'OFF':CP.ads.contracts.length?'ACT ('+CP.ads.contracts.length+')':'ARM'}${CP.ads.emer?' · <b class="bad">ADS EMERGENCY</b>':''}`;
 const ib=$('cc-inbox');
 ib.innerHTML=CP.inbox.length?CP.inbox.slice(0,30).map(it=>{
  const z=API.Zt(it.t);
  if(it.type==='REQUEST'){const btns=it.replied?'<em>replied</em>':`<button data-r="UNABLE" data-n="${it.n}">UNABLE</button><button data-r="STANDBY" data-n="${it.n}">STANDBY</button><button data-r="DEFERRED" data-n="${it.n}">REQUEST DEFERRED</button>${(it.approve||[]).map((a,i)=>`<button class="go" data-r="APPROVE" data-c="${i}" data-n="${it.n}">${esc(a.label)}</button>`).join('')}`;return `<div class="cc-in req"><div><span class="t">${z}</span> <b>REQUEST</b> ${esc(it.text)}</div><div class="cc-btns">${btns}</div></div>`;}
  if(it.type==='EMERGENCY'){return `<div class="cc-in emer"><div><span class="t">${z}</span> <b>EMERGENCY</b> ${esc(it.text)}</div>${CP.ground.autoRoger?'':`<div class="cc-btns">${it.replied?'<em>replied</em>':`<button data-r="ROGER" data-n="${it.n}">ROGER</button>`}</div>`}</div>`;}
  const lab={REPORT:'REPORT',RESPONSE:'RESPONSE',LOGON:'LOGON',INFO:'INFO'}[it.type]||it.type;
  return `<div class="cc-in"><span class="t">${z}</span> <b>${lab}</b> ${esc(it.text)}</div>`;}).join(''):'<p class="muted">Downlinks, responses and reports from the aircraft appear here.</p>';
 let tot=0,got=0;
 $('cc-check').innerHTML=CHECK.map(([t,items])=>`<h4>${esc(t)}</h4><ul>${items.map(([k,l])=>{tot++;if(CP.done[k])got++;return `<li class="${CP.done[k]?'done':''}"><i></i>${esc(l)}</li>`;}).join('')}</ul>`).join('');
 $('cc-prog').textContent=`${got}/${tot}`;
}
CP.listeners.push(paint);
document.addEventListener('DOMContentLoaded',build);
if(document.readyState!=='loading')build();
})();
