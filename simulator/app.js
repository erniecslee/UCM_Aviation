'use strict';
const $=id=>document.getElementById(id),cfg=window.UCM_CONFIG||{},pending=new Map();
let ruleCategory='WEEKLY_OPEN',instructorWeek='';
let token='',snapshot=null,bridgeWindow=null,bridgeOrigin='',nonce=crypto.randomUUID(),readyPromise=null,busy=false;
const standalone=typeof google!=='undefined'&&google.script?.run;
const notice=(m,error=false)=>{$('notice').textContent=m;$('notice').classList.toggle('error',error);};
function connect(){
 if(standalone)return Promise.resolve();
 if(bridgeWindow)return Promise.resolve();
 if(readyPromise)return readyPromise;
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(cfg.apiUrl||''))return Promise.reject(Error('Deployment is not configured. Set the Apps Script URL in config.js.'));
 $('fallback').href=cfg.apiUrl;$('fallback').hidden=false;
 readyPromise=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{readyPromise=null;reject(Error('Connection blocked. Use the standalone portal link below.'));},20000);
  const onReady=e=>{
   if(!/^https:\/\/[a-zA-Z0-9-]+\.googleusercontent\.com$/.test(e.origin)||e.data?.channel!=='UCM_API'||e.data.type!=='ready'||e.data.nonce!==nonce)return;
   bridgeWindow=e.source;bridgeOrigin=e.origin;clearTimeout(timer);window.removeEventListener('message',onReady);$('connection').textContent='Secure connection ready.';resolve();
  };
  window.addEventListener('message',onReady);
  $('bridge').src=cfg.apiUrl+'?bridge=1&nonce='+encodeURIComponent(nonce);
 });return readyPromise;
}
window.addEventListener('message',e=>{
 if(e.source!==bridgeWindow||e.origin!==bridgeOrigin||e.data?.channel!=='UCM_API'||e.data.type!=='response')return;
 const p=pending.get(e.data.id);if(p){pending.delete(e.data.id);clearTimeout(p.timer);p.resolve(e.data.result);}
});
async function api(action,payload={}){
 if(window.UCM_DEMO)return demoApi(action,payload);
 await connect();const req={...payload,action,token};
 let result;
 if(standalone)result=await new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(()=>reject(Error('Server connection failed.'))).api(req));
 else result=await new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('Response timed out. Refresh reservations before retrying.'));},45000);pending.set(id,{resolve,timer});bridgeWindow.postMessage({channel:'UCM_API',type:'request',id,payload:req},bridgeOrigin);});
 if(!result.ok)throw Error(result.error);return result.data;
}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){notice(e.message,true);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
function central(value){
 // Interpret inputs as America/Chicago regardless of the browser's own timezone.
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw Error('Enter a date and time.');
 const want=value.replace('T',' ');let matches=[];
 for(const offset of ['-06:00','-05:00']){const candidate=value+':00'+offset,n=Date.parse(candidate),l=Domain.local(n),clock=`${String(Math.floor(l.minute/60)).padStart(2,'0')}:${String(l.minute%60).padStart(2,'0')}`;if(`${l.date} ${clock}`===want)matches.push(new Date(n).toISOString());}
 if(matches.length!==1)throw Error('That time is missing or repeated due to daylight saving time. Choose another time.');return matches[0];
}
const fmt=n=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(n));
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function record(container,title,detail,label,fn){const row=el('div',undefined,'record'),copy=el('div',title);copy.append(el('small',detail));row.append(copy);if(fn){const b=el('button',label);b.onclick=()=>run(fn);row.append(b);}container.append(row);}
function show(view){document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==view);document.querySelectorAll('[data-view]').forEach(e=>(e.classList.toggle('active',e.dataset.view===view),e.setAttribute('aria-selected',String(e.dataset.view===view)),e.tabIndex=e.dataset.view===view?0:-1));}
async function refresh(){snapshot=await api('snapshot');$('connection').textContent=window.UCM_DEMO?'Local preview only; Google Sheets is not connected.':'Connected to the reservation database.';$('login').hidden=true;$('portal').hidden=false;$('logout').hidden=false;const teacher=snapshot.user.role==='TEACHER';$('adminTab').hidden=false;$('adminContent').hidden=!teacher;$('instructorGate').hidden=teacher;render();notice(teacher?`Faculty: ${snapshot.user.name||snapshot.user.email}`:'The live schedule is open to everyone. Select an available slot to book.');$('logout').hidden=!teacher;$('facultyLogin').hidden=teacher;}
function render(){
 const sim=snapshot.simulators.find(s=>s.id==='SIM-01');if(!sim)throw Error('SIM-01 configuration missing.');
 $('modeText').textContent='Only instructor-opened slots can be booked. All other times are closed.';
 renderSlots();
 renderPublicBookings();renderLoading();renderSemesterSummary();
 if(snapshot.user.role!=='TEACHER')return;
 const availableRules=snapshot.availability.filter(r=>r.active!=='REMOVED');document.querySelectorAll('[data-rule-category]').forEach(button=>{const key=button.dataset.ruleCategory;button.querySelector('.ruleCount').textContent=availableRules.filter(r=>r.recurrence+'_'+r.kind===key).length;button.classList.toggle('active',key===ruleCategory);button.setAttribute('aria-selected',String(key===ruleCategory));button.tabIndex=key===ruleCategory?0:-1;});const visibleRules=availableRules.filter(r=>r.recurrence+'_'+r.kind===ruleCategory);const rules=$('rules');rules.replaceChildren();visibleRules.forEach(r=>record(rules,`${r.instructorEmail==='*'?'Both instructors':professorName(r.instructorEmail)} · ${r.kind} · ${r.recurrence} · ${r.active==='TRUE'?'Active':'Disabled'} · ${r.description||''}`,r.recurrence==='WEEKLY'?`${r.fromDate} to ${r.untilDate} · days ${r.days} · ${r.startTime}–${r.endTime}`:`${fmt(r.start)} — ${fmt(r.end)}`,r.active==='TRUE'?'Disable':'Enable',async()=>{await api(r.active==='TRUE'?'disableRule':'enableRule',{id:r.id});await refresh();}));
 rules.querySelectorAll('.record').forEach((row,i)=>{const button=el('button','Edit');button.onclick=()=>editAvailabilityRule(visibleRules[i]);row.append(button);const remove=el('button','Remove','removeRule');remove.onclick=()=>run(async()=>{await api('removeRule',{id:visibleRules[i].id});if($('editingRuleId').value===visibleRules[i].id)resetRuleEditor();await refresh();});row.append(remove);});
 if(!visibleRules.length)rules.append(el('p','No rules in this category.'));
 renderInstructorSessions();
 const audit=$('audit');audit.replaceChildren();snapshot.audit.forEach(a=>record(audit,`${a.action} · ${a.actor}`,`${fmt(a.at)} · ${a.entityId}`));
}

let slotsVersion=0;
async function renderSlots(){
 if(!snapshot)return;const box=$('slots'),version=++slotsVersion;box.replaceChildren(el('p','Checking availability…'));
 try{
  const slots=await api('slots',{date:$('date').value,instructorEmail:$('instructor').value});
  if(version!==slotsVersion)return;box.replaceChildren();
  for(const slot of slots){const {start,end}=slot,duration=(Date.parse(end)-Date.parse(start))/60000,b=el('button',undefined,'slot');b.append(el('small','AVAILABLE'),el('b',new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date(start))+' – '+new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date(end))),el('span',`${duration} minute session`));
   const requestId=crypto.randomUUID();b.onclick=()=>{if(!$('registrationForm').reportValidity())return;selectedReservation={id:requestId,simulatorId:'SIM-01',start,end,studentName:$('studentName').value.trim(),studentName2:$('studentName2').value.trim(),enteredBy:$('enteredBy').value.trim(),instructorEmail:$('instructor').value,sessionType:$('sessionType').value,notes:$('notes').value.trim()};const details=$('reviewDetails');details.replaceChildren();[['Session',fmt(start)+' — '+fmt(end)],['Students',selectedReservation.studentName+' & '+selectedReservation.studentName2],['Professor',$('instructor').selectedOptions[0].text],['Training',selectedReservation.sessionType],['Entered by',selectedReservation.enteredBy],['Notes',selectedReservation.notes||'—']].forEach(([label,value])=>{const row=el('div',undefined,'reviewRow');row.append(el('small',label),el('strong',value));details.append(row);});$('reviewError').textContent='';$('bookingReview').showModal();};box.append(b);
  }
  if(!slots.length)box.append(el('p','No available fixed slots on this date. Choose another date.'));
 }catch(e){if(version===slotsVersion)box.replaceChildren(el('p',e.message));}
}
function inputTime(value){const l=Domain.local(Date.parse(value));return l.date+'T'+String(Math.floor(l.minute/60)).padStart(2,'0')+':'+String(l.minute%60).padStart(2,'0');}

const professorName=email=>email==='jupp@ucmo.edu'?'David Jupp':email==='chunshihlee@ucmo.edu'?'Chun Shih Lee':email;
const clockText=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
function openBookingEditor(b){show('admin');$('editId').value=b.id;$('editStart').value=inputTime(b.start);$('editEnd').value=inputTime(b.end);$('editPanel').hidden=false;syncTimeControls();$('editPanel').scrollIntoView({behavior:'smooth',block:'center'});}
let loadingVersion=0;
async function renderLoading(){
 if(!snapshot)return;const box=$('loading'),version=++loadingVersion;
 try{const days=await api('loading',{date:$('loadDate').value});if(version!==loadingVersion)return;box.replaceChildren();updateWeekLabel();
  renderCalendarCards(days,box);
 }catch(e){box.replaceChildren(el('p',e.message));}
}

function renderCalendarCards(days,box){
 const bookedByDay=days.map(d=>[...new Map(d.cells.flatMap(c=>c.bookings||[]).map(b=>[b.id,b])).values()]);
 const spans=days.flatMap((d,i)=>[...(d.openSlots||[]),...bookedByDay[i]].map(s=>({start:Domain.local(Date.parse(s.start)).date===d.date?Domain.local(Date.parse(s.start)).minute:0,end:Domain.local(Date.parse(s.end)-1).date===d.date?Domain.local(Date.parse(s.end)-1).minute+1:1440})));
 const first=Math.min(360,...spans.map(s=>Math.floor(s.start/60)*60)),last=Math.max(1080,...spans.map(s=>Math.ceil(s.end/60)*60)),scale=0.85,height=(last-first)*scale;
 const wrap=el('div',undefined,'calendarScroll cleanCalendar'),header=el('div',undefined,'timelineHeader'),body=el('div',undefined,'timelineBody');header.append(el('div','Time','timelineCorner'));body.style.height=height+'px';
 const axis=el('div',undefined,'timeAxis');for(let m=first;m<last;m+=60){const tick=el('span',String(Math.floor(m/60)).padStart(2,'0')+':00');tick.style.top=((m-first)*scale)+'px';axis.append(tick);}body.append(axis);
 days.forEach((d,i)=>{
  const date=new Date(d.date+'T12:00:00Z'),head=el('div',undefined,'timelineDayHead');head.append(el('strong',new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(date)),el('small',new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(date)));header.append(head);
  const column=el('div',undefined,'dayTrack');column.style.height=height+'px';column.style.setProperty('--hour-height',(60*scale)+'px');
  const booked=bookedByDay[i],uniqueSlots=[...new Map((d.openSlots||[]).map(s=>[s.instructorEmail+'|'+s.start+'|'+s.end,s])).values()];
  const available=uniqueSlots.filter(s=>!booked.some(b=>Domain.overlap(Date.parse(s.start),Date.parse(s.end),Date.parse(b.start),Date.parse(b.end))));
  const dateStart=Date.parse(Domain.central(d.date,'00:00'));
  function position(card,s){const start=Math.max(Date.parse(s.start),dateStart),end=Math.min(Date.parse(s.end),dateStart+27*3600000),startMinute=Domain.local(start).date===d.date?Domain.local(start).minute:first,endLocal=Domain.local(end-1),endMinute=endLocal.date===d.date?endLocal.minute+1:last;card.style.top=((Math.max(first,startMinute)-first)*scale+4)+'px';card.style.height=Math.max(28,(Math.min(last,endMinute)-Math.max(first,startMinute))*scale-8)+'px';}
  available.forEach(s=>{const lee=s.instructorEmail==='chunshihlee@ucmo.edu',card=el('button',undefined,'slotEvent '+(lee?'eventLee':'eventJupp'));card.type='button';card.onclick=()=>openSlotBooking(s);position(card,s);card.style.left=lee?'5px':'calc(50% + 2px)';card.style.width='calc(50% - 7px)';card.setAttribute('aria-label','Available: '+professorName(s.instructorEmail)+' '+clockText(s.start)+' to '+clockText(s.end));card.append(el('strong',lee?'Lee':'Jupp'),el('small',clockText(s.start)),el('small','– '+clockText(s.end)));column.append(card);});
  booked.forEach(b=>{const card=el('button',undefined,'bookedEvent '+(b.status==='PENDING'?'pendingEvent':''));position(card,b);card.type='button';card.onclick=()=>openSessionDetails(b.id);card.title='View session details';const cardHeight=parseFloat(card.style.height);if(cardHeight<160)card.classList.add('compactBooking');if(cardHeight<85)card.classList.add('tinyBooking');card.setAttribute('aria-label',statusLabel(b)+': '+professorName(b.instructorEmail)+' '+b.studentName+' '+b.studentName2);card.append(el('span',statusLabel(b),'bookingStatus '+(b.status==='PENDING'?'pendingStatus':'confirmedStatus')),el('span',b.instructorEmail==='jupp@ucmo.edu'?'Jupp':'Lee','bookedProfessor'),el('strong',b.sessionType,'bookingCourse'),el('span',b.sessionType+' · '+(b.instructorEmail==='jupp@ucmo.edu'?'Jupp':'Lee')+(cardHeight<85?(b.status==='CONFIRMED'?' ✓':' · Pending'):''),'compactTitle'),studentNames(b),el('small',clockText(b.start)+'–'+clockText(b.end)));column.append(card);});
  body.append(column);
 });
 wrap.append(header,body);box.append(wrap,el('p','Updated '+new Date().toLocaleTimeString(),'muted'));
}
function monday(date){const d=new Date(date+'T12:00:00Z'),weekday=d.getUTCDay();d.setUTCDate(d.getUTCDate()-((weekday+6)%7));return d.toISOString().slice(0,10);}
function updateWeekLabel(){const from=$('loadDate').value,to=new Date(from+'T12:00:00Z');to.setUTCDate(to.getUTCDate()+6);const f=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});$('weekRange').textContent=f.format(new Date(from+'T12:00:00Z'))+' – '+f.format(to)+', '+to.getUTCFullYear();}
function changeWeek(offset){const d=new Date($('loadDate').value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset*7);$('loadDate').value=monday(d.toISOString().slice(0,10));updateWeekLabel();renderPublicBookings();renderLoading();}
$('logout').onclick=()=>run(async()=>{try{await api('logout');}finally{token='';snapshot=null;localStorage.removeItem(window.UCM_DEMO?'ucmDemo':'ucmGuest');$('logout').hidden=true;await startPublic();notice('Faculty signed out. Public registration is open.');}});
$('date').value=Domain.local(Date.now()).date<'2027-01-11'?'2027-01-11':Domain.local(Date.now()).date;$('date').onchange=renderSlots;
$('refresh').onclick=()=>run(refresh);document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));

$('recurrence').onchange=()=>{$('weekly').hidden=$('recurrence').value!=='WEEKLY';$('once').hidden=$('recurrence').value!=='ONCE';};
['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach((d,i)=>{const label=el('label',d),input=el('input');input.type='checkbox';input.value=i;input.checked=i>0&&i<6;label.prepend(input);$('weekdays').append(label);});
$('ruleForm').onsubmit=e=>{e.preventDefault();run(async()=>{const rule=Object.fromEntries(new FormData(e.target));rule.simulatorId='SIM-01';rule.days=[...$('weekdays').querySelectorAll('input:checked')].map(x=>x.value).join(',');if(rule.recurrence==='ONCE'){rule.start=central(rule.start);rule.end=central(rule.end);}Domain.validateRule(rule);await api($('editingRuleId').value?'editRule':'addRule',{id:$('editingRuleId').value,rule});ruleCategory=rule.recurrence+'_'+rule.kind;resetRuleEditor();await refresh();});};
if(standalone)$('connection').textContent='Connected directly to Apps Script.';

$('loadDate').onchange=()=>{$('loadDate').value=monday($('loadDate').value);updateWeekLabel();renderLoading();renderPublicBookings();};$('previousWeek').onclick=()=>changeWeek(-1);$('nextWeek').onclick=()=>changeWeek(1);
$('closeEdit').onclick=()=>{$('editPanel').hidden=true;};
$('editForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api('editBooking',{id:$('editId').value,start:central($('editStart').value),end:central($('editEnd').value)});instructorWeek=monday($('editStart').value.slice(0,10));$('editPanel').hidden=true;await refresh();notice('Reservation updated. Unused time is now available.');});};
setInterval(()=>{if(token&&!busy&&!document.hidden)run(refresh);},60000);

$('facultyLogin').onclick=()=>show('admin');
$('instructorSignIn').onclick=()=>{if(window.UCM_DEMO){run(async()=>{const session=await api('facultySession');token=session.token;await refresh();show('admin');notice('Preview instructor access. No live Google account or Sheets connection.');});return;}const url=cfg.facultyUrl;if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url||'')){notice('Faculty portal is not configured yet.',true);return;}if(standalone)window.top.location.href=url+'?faculty=1';else window.location.assign(url+'?faculty=1');};
$('instructor').onchange=renderSlots;
async function startPublic(){
 try{const saved=JSON.parse(localStorage.getItem(window.UCM_DEMO?'ucmDemo':'ucmGuest')||'null');if(saved&&saved.until>Date.now())token=saved.token;else{const session=await api('guestSession');token=session.token;localStorage.setItem(window.UCM_DEMO?'ucmDemo':'ucmGuest',JSON.stringify({token,until:Date.now()+5*3600000}));}await refresh();}
 catch(e){localStorage.removeItem(window.UCM_DEMO?'ucmDemo':'ucmGuest');if(token&&/Session expired/.test(e.message)){token='';return startPublic();}notice(e.message,true);}
}
if(window.UCM_FACULTY){run(async()=>{const session=await api('facultySession');token=session.token;await refresh();show('admin');notice('Faculty Google account verified.');});}else startPublic();

function shorten(minutes){try{const start=central($('editStart').value),end=central($('editEnd').value),next=Date.parse(end)-minutes*60000;if(next<=Date.parse(start))throw Error('End must follow start.');$('editEnd').value=inputTime(new Date(next).toISOString());syncTimeControls();}catch(e){notice(e.message,true);}}
$('shorten30').onclick=()=>shorten(30);$('shorten60').onclick=()=>shorten(60);

let selectedReservation=null;
$('dismissReview').onclick=$('backReview').onclick=()=>{$('bookingReview').close();};
$('confirmReservation').onclick=()=>run(async()=>{try{await api('book',selectedReservation);$('bookingReview').close();await refresh();show('dashboard');$('loadDate').value=monday(Domain.local(Date.parse(selectedReservation.start)).date);renderPublicBookings();renderLoading();notice('Reservation submitted. Your slot is held pending instructor confirmation.');}catch(e){$('reviewError').textContent=e.message;throw e;}});

function renderPublicBookings(){
 if(!snapshot)return;const box=$('publicBookings');box.replaceChildren();const own=new Set(snapshot.ownBookingIds||[]),from=$('loadDate').value,next=new Date(from+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+7);const until=next.toISOString().slice(0,10),q=$('bookingSearch').value.trim().toLowerCase(),prof=$('dashboardInstructor').value;
 const bookings=snapshot.bookings.filter(b=>{const date=Domain.local(Date.parse(b.start)).date;return Domain.activeBooking(b)&&Domain.overlap(Date.parse(Domain.central(from,'00:00')),Date.parse(Domain.central(until,'00:00')),Date.parse(b.start),Date.parse(b.end))&&(!prof||b.instructorEmail===prof)&&(!$('onlyMine').checked||own.has(b.id))&&(!q||[b.studentName,b.studentName2,b.enteredBy,b.sessionType,b.id,b.notes].join(' ').toLowerCase().includes(q));}).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 if(!bookings.length){box.append(el('p','No reservations match this week and your filters.','muted'));return;}
 const wrap=el('div',undefined,'scroll'),table=el('table'),head=el('tr');['Session time','Status','Students','Professor / training','Notes / entered by','Reference'].forEach(x=>head.append(el('th',x)));table.append(head);
 bookings.forEach(b=>{const row=el('tr');if(own.has(b.id))row.className='ownBooking';const time=el('td',fmt(b.start)+' — '+fmt(b.end));if(own.has(b.id))time.append(el('small','THIS BROWSER'));row.append(time,el('td',statusLabel(b)),el('td',b.studentName+' & '+(b.studentName2||'')),el('td',(b.instructorEmail==='jupp@ucmo.edu'?'David Jupp':'Chun-Shih Lee')+' / '+b.sessionType),el('td',(b.notes||'—')+' / '+(b.enteredBy||'—')),el('td',b.id));table.append(row);});wrap.append(table);box.append(wrap);
}

let semesterVersion=0;
async function renderSemesterSummary(){
 const version=++semesterVersion;
 try{const data=await api('semesterSummary');if(version!==semesterVersion)return;
 $('semesterPeriod').textContent=data.fromDate+' – '+data.toDate+' · One row per week. Select a week to view its schedule.';
 const metrics=$('dashboardMetrics');metrics.replaceChildren();[['Reservations',String(data.reservations)],['Reserved hours',(data.bookedMinutes/60).toFixed(1)+'h'],['Semester capacity',(data.capacityMinutes/60).toFixed(1)+'h'],['Semester loading',data.capacityMinutes?Math.round(data.bookedMinutes/data.capacityMinutes*100)+'%':'—']].forEach(([label,value])=>{const card=el('div',undefined,'metric');card.append(el('small',label),el('strong',value));metrics.append(card);});
 const box=$('semesterSummaryTable');box.replaceChildren();const wrap=el('div',undefined,'scroll'),table=el('table'),head=el('tr');['Week','Dates','Reserved hours','Capacity','Loading','Sessions'].forEach(x=>head.append(el('th',x)));table.append(head);
 data.weeks.forEach(w=>{const row=el('tr'),cell=el('td'),button=el('button','Week '+w.week,'weekLink');button.onclick=()=>{$('loadDate').value=w.weekStart;updateWeekLabel();renderLoading();renderPublicBookings();$('dashboard').scrollIntoView({behavior:'smooth',block:'start'});};cell.append(button);row.append(cell,el('td',w.fromDate+' – '+w.toDate),el('td',(w.bookedMinutes/60).toFixed(1)+'h'),el('td',(w.capacityMinutes/60).toFixed(1)+'h'),el('td',w.capacityMinutes?Math.round(w.bookedMinutes/w.capacityMinutes*100)+'%':'—'),el('td',String(w.reservations)));table.append(row);});wrap.append(table);box.append(wrap);
 }catch(e){$('semesterSummaryTable').replaceChildren(el('p',e.message));}
}
$('bookingSearch').oninput=renderPublicBookings;$('dashboardInstructor').onchange=renderPublicBookings;$('onlyMine').onchange=renderPublicBookings;

document.querySelectorAll('[data-view][role=tab]').forEach((tab,i)=>tab.addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('[data-view][role=tab]')];let index=i;if(e.key==='ArrowRight')index=(i+1)%tabs.length;else if(e.key==='ArrowLeft')index=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')index=0;else if(e.key==='End')index=tabs.length-1;else return;e.preventDefault();show(tabs[index].dataset.view);tabs[index].focus();}));

if(window.UCM_DEMO)$('instructorSignIn').textContent='Preview Instructor Console';

function studentNames(b){const names=el('div',undefined,'bookedStudents');[b.studentName,b.studentName2].filter(Boolean).forEach(name=>names.append(el('span',name,'studentLine')));return names;}
let selectedCalendarSlot=null;
function focusCalendar(){show('dashboard');$('dashboard').scrollIntoView({behavior:'smooth',block:'start'});notice('Select an available Lee or Jupp slot in the calendar.');}
function openSlotBooking(slot){if(busy)return;selectedCalendarSlot={...slot,id:crypto.randomUUID()};$('instructor').value=slot.instructorEmail;$('selectedSlotDetails').textContent=professorName(slot.instructorEmail)+' · '+fmt(slot.start)+' – '+clockText(slot.end);$('slotBookingError').textContent='';$('slotBooking').showModal();$('studentName').focus();}
$('closeSlotBooking').onclick=$('cancelSlotBooking').onclick=()=>{$('slotBooking').close();};
$('registrationForm').onsubmit=e=>{e.preventDefault();if(!selectedCalendarSlot)return;run(async()=>{try{const slot=selectedCalendarSlot;await api('book',{id:slot.id,simulatorId:'SIM-01',start:slot.start,end:slot.end,instructorEmail:slot.instructorEmail,studentName:$('studentName').value.trim(),studentName2:$('studentName2').value.trim(),enteredBy:$('enteredBy').value.trim(),sessionType:$('sessionType').value,notes:$('notes').value.trim()});$('slotBooking').close();$('registrationForm').reset();selectedCalendarSlot=null;await refresh();notice('Reservation submitted. Your slot is held pending instructor confirmation.');}catch(error){$('slotBookingError').textContent=error.message;await renderLoading();throw error;}});};

function statusLabel(b){return b.status==='CONFIRMED'?'Confirmed':b.status==='PENDING'?'Pending confirmation':'Cancelled';}
function resetRuleEditor(){$('editingRuleId').value='';$('saveRule').textContent='Save rule / generate slots';$('cancelRuleEdit').hidden=true;}
function editAvailabilityRule(rule){$('editingRuleId').value=rule.id;const form=$('ruleForm');for(const [key,value] of Object.entries(rule)){const field=form.elements.namedItem(key);if(field&&key!=='days')field.value=['start','end'].includes(key)&&value?inputTime(value):value;}form.querySelectorAll('#weekdays input').forEach(x=>x.checked=String(rule.days).split(',').includes(x.value));$('recurrence').onchange();syncTimeControls();$('saveRule').textContent='Save changes';$('cancelRuleEdit').hidden=false;form.scrollIntoView({behavior:'smooth',block:'center'});}
$('cancelRuleEdit').onclick=resetRuleEditor;

function openSessionDetails(id){const b=snapshot.bookings.find(x=>x.id===id);if(!b)return;const box=$('sessionDetailsBody');box.replaceChildren();[['Status',statusLabel(b)],['Professor',professorName(b.instructorEmail)],['Session',b.sessionType],['Time',fmt(b.start)+' – '+fmt(b.end)],['Student 1',b.studentName],['Student 2',b.studentName2],['Entered by',b.enteredBy],['Notes',b.notes||'—']].forEach(([label,value])=>{const row=el('div',undefined,'reviewRow');row.append(el('small',label),el('strong',value));box.append(row);});$('sessionDetails').showModal();}
$('closeSessionDetails').onclick=()=>$('sessionDetails').close();

// Start changes suggest a three-hour window; the end stays editable.
const ruleFields=$('ruleForm').elements;
ruleFields.namedItem('start').addEventListener('input',()=>{const start=ruleFields.namedItem('start').value;if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(start))return;const end=new Date(Date.parse(start+':00Z')+3*3600000);if(Number.isFinite(+end))ruleFields.namedItem('end').value=end.toISOString().slice(0,16);syncTimeControls();});
ruleFields.namedItem('startTime').addEventListener('input',()=>{const start=ruleFields.namedItem('startTime').value;if(!/^\d\d:\d\d$/.test(start))return;const [h,m]=start.split(':').map(Number),end=(h*60+m+180)%1440;ruleFields.namedItem('endTime').value=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');syncTimeControls();});

// Explicit quarter-hour menus avoid native pickers listing every minute.
const timeControls=[];
function syncTimeControls(){timeControls.forEach(({input,date,select})=>{const value=input.value,time=date?value.slice(11,16):value;if(date)date.value=value.slice(0,10);if(time&&!Array.from(select.options).some(o=>o.value===time)){select.add(new Option(time+' (existing)',time));}select.value=time||'';});}
document.querySelectorAll('input[type="time"],input[type="datetime-local"]').forEach(input=>{
 const dated=input.type==='datetime-local',wrap=el('span',undefined,'quarterTimeControl'),date=dated?el('input'):null,select=el('select');input.type='hidden';input.removeAttribute('required');
 if(date){date.type='date';date.setAttribute('aria-label','Date for '+(input.id||input.name));wrap.append(date);}
 select.setAttribute('aria-label','Time for '+(input.id||input.name));select.add(new Option('Select time',''));for(let m=0;m<1440;m+=15){const value=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');select.add(new Option(value,value));}wrap.append(select);input.after(wrap);timeControls.push({input,date,select});
 const update=()=>{input.value=date?(date.value&&select.value?date.value+'T'+select.value:''):select.value;input.dispatchEvent(new Event('input',{bubbles:true}));};select.onchange=update;if(date)date.onchange=update;
});
syncTimeControls();


function selectRuleCategory(key){ruleCategory=key;if(snapshot)render();}
document.querySelectorAll('[data-rule-category]').forEach((button,i)=>{button.onclick=()=>selectRuleCategory(button.dataset.ruleCategory);button.addEventListener('keydown',event=>{const buttons=[...document.querySelectorAll('[data-rule-category]')];let index=i;if(event.key==='ArrowRight')index=(i+1)%buttons.length;else if(event.key==='ArrowLeft')index=(i+buttons.length-1)%buttons.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=buttons.length-1;else return;event.preventDefault();selectRuleCategory(buttons[index].dataset.ruleCategory);buttons[index].focus();});});

function sessionWeeks(){const sim=snapshot.simulators.find(s=>s.id==='SIM-01'),weeks=[];for(let date=monday(sim.termStart);date<=sim.termEnd;){const end=new Date(date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);const next=end.toISOString().slice(0,10),last=new Date(end);last.setUTCDate(last.getUTCDate()-1);weeks.push({start:date,next,first:date<sim.termStart?sim.termStart:date,last:last.toISOString().slice(0,10)>sim.termEnd?sim.termEnd:last.toISOString().slice(0,10)});date=next;}return weeks;}
function sessionsInWeek(week){const from=Date.parse(Domain.central(week.first,'00:00')),after=new Date(week.last+'T12:00:00Z');after.setUTCDate(after.getUTCDate()+1);const to=Date.parse(Domain.central(after.toISOString().slice(0,10),'00:00'));return snapshot.bookings.filter(b=>b.simulatorId==='SIM-01'&&Domain.overlap(from,to,Date.parse(b.start),Date.parse(b.end))).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));}
function renderInstructorSessions(){
 const weeks=sessionWeeks();if(!weeks.length)return;
 if(!weeks.some(w=>w.start===instructorWeek)){const today=monday(Domain.local(Date.now()).date);instructorWeek=today<weeks[0].start?weeks[0].start:today>weeks[weeks.length-1].start?weeks[weeks.length-1].start:today;}
 const select=$('instructorWeek');select.replaceChildren();const labelDate=date=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
 weeks.forEach((week,i)=>{const count=sessionsInWeek(week).length;select.add(new Option('Week '+(i+1)+' · '+labelDate(week.first)+' – '+labelDate(week.last)+' · '+count+' session'+(count===1?'':'s'),week.start));});select.value=instructorWeek;
 const index=weeks.findIndex(w=>w.start===instructorWeek),week=weeks[index],list=sessionsInWeek(week);$('instructorWeekSummary').textContent=week.first+' – '+week.last+' · '+list.length+' session'+(list.length===1?'':'s')+' · Includes pending, confirmed and cancelled reservations.';
 $('instructorPreviousWeek').style.visibility=index===0?'hidden':'visible';$('instructorNextWeek').style.visibility=index===weeks.length-1?'hidden':'visible';
 const all=$('allBookings');all.replaceChildren();if(!list.length)all.append(el('p','No sessions scheduled for this week.','muted'));
 list.forEach(b=>{const editable=Domain.activeBooking(b)&&Date.parse(b.end)>Date.now();record(all,`${fmt(b.start)} — ${fmt(b.end)} · ${b.studentName} & ${b.studentName2||''}`,`${statusLabel(b)} · ${professorName(b.instructorEmail)} · ${b.sessionType||''} · Entered by: ${b.enteredBy||''} · Notes: ${b.notes||'—'} · ${b.id}`,editable?'Cancel':null,editable?async()=>{if(!confirm('Cancel this reservation?'))return;await api('cancel',{id:b.id});await refresh();}:null);const row=all.lastElementChild;
 if(b.status==='PENDING'&&editable){const button=el('button','Confirm','primary confirmBooking');button.onclick=()=>run(async()=>{await api('confirmBooking',{id:b.id});await refresh();notice('Session confirmed. Dashboard has been updated.');});row.append(button);}
 if(editable){const button=el('button','Adjust time');button.onclick=()=>openBookingEditor(b);row.append(button);}else if(b.status==='CANCELLED')row.classList.add('cancelledSession');
 });
}
function changeInstructorWeek(offset){if(!snapshot)return;const weeks=sessionWeeks(),index=weeks.findIndex(w=>w.start===instructorWeek),next=index+offset;if(next<0||next>=weeks.length)return;instructorWeek=weeks[next].start;renderInstructorSessions();}
$('instructorWeek').onchange=()=>{instructorWeek=$('instructorWeek').value;renderInstructorSessions();};$('instructorPreviousWeek').onclick=()=>changeInstructorWeek(-1);$('instructorNextWeek').onclick=()=>changeInstructorWeek(1);
