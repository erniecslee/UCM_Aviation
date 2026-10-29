/* Pure scheduling rules; shared with the Node test suite. */
var Domain = (() => {
  const zone = 'America/Chicago';
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),localCache=new Map();
  function fail(message) { throw new Error(message); }
  function instant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{3})?)?(Z|[+-]\d\d:\d\d)$/.test(value)) fail('Use an ISO timestamp with an explicit UTC offset.');
    const n = Date.parse(value); if (!Number.isFinite(n)) fail('Invalid timestamp.'); return n;
  }
  function overlap(a,b,c,d) { return a < d && c < b; }
  function local(n) {
    const key=Math.floor(n/60000);if(localCache.has(key))return localCache.get(key);
    const p = Object.fromEntries(formatter.formatToParts(new Date(n)).map(x=>[x.type,x.value]));
    const value={date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute),day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday)};if(localCache.size>20000)localCache.clear();localCache.set(key,value);return value;
  }
  function clock(v) { if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail('Use HH:mm.'); return Number(v.slice(0,2))*60+Number(v.slice(3)); }
  function validateRule(r) {
    if (!['OPEN','BLOCK'].includes(r.kind) || !['ONCE','WEEKLY'].includes(r.recurrence)) fail('Invalid availability rule.');
    if(r.recurrence==='ONCE') { if(instant(r.start)%60000||instant(r.end)%60000)fail('Use whole-minute rule boundaries.'); if(instant(r.end)<=instant(r.start)) fail('End must follow start.'); }
    else {
      if(!/^\d{4}-\d\d-\d\d$/.test(r.fromDate)||!/^\d{4}-\d\d-\d\d$/.test(r.untilDate)||r.fromDate>r.untilDate) fail('Invalid inclusive date range.');
      if(!/^[0-6](,[0-6])*$/.test(String(r.days))) fail('Select weekdays (0=Sunday).');
      if(clock(r.endTime)<=clock(r.startTime)) fail('Weekly rules must end on the same day.');
    }
    return r;
  }
  function matches(r,n) {
    if(r.recurrence==='ONCE') return n>=instant(r.start)&&n<instant(r.end);
    const l=local(n);
    return l.date>=r.fromDate&&l.date<=r.untilDate&&String(r.days).split(',').includes(String(l.day))&&l.minute>=clock(r.startTime)&&l.minute<clock(r.endTime);
  }
  function isOpen(sim,rules,start,end,instructorEmail) {
    if(sim.termStart&&local(start).date<sim.termStart||sim.termEnd&&local(end-1).date>sim.termEnd)return false;
    const active=rules.filter(r=>r.simulatorId===sim.id&&String(r.active)==='TRUE'&&(!r.instructorEmail||r.instructorEmail==='*'||r.instructorEmail===instructorEmail)).map(validateRule);
    // Booking boundaries and every segment are minute aligned. BLOCK always wins.
    for(let t=start;t<end;t+=60000) {
      if(active.some(r=>r.kind==='BLOCK'&&matches(r,t))) return false;
      if(!active.some(r=>r.kind==='OPEN'&&matches(r,t))) return false;
    }
    return true;
  }

  function central(date,time){
    const want=date+' '+time,matches=[];
    for(const offset of ['-06:00','-05:00']){const value=date+'T'+time+':00'+offset,n=instant(value),l=local(n),hm=String(Math.floor(l.minute/60)).padStart(2,'0')+':'+String(l.minute%60).padStart(2,'0');if(l.date+' '+hm===want)matches.push(new Date(n).toISOString());}
    if(matches.length!==1)fail('Invalid or ambiguous local time.');return matches[0];
  }
  function fixedSlots(sim,rules,date,instructorEmail){
    const windows=[];
    rules.filter(r=>r.simulatorId===sim.id&&r.active==='TRUE'&&r.kind==='OPEN'&&(!r.instructorEmail||r.instructorEmail==='*'||r.instructorEmail===instructorEmail)).forEach(r=>{
      validateRule(r);
      if(r.recurrence==='ONCE')windows.push([instant(r.start),instant(r.end)]);
      else {const n=instant(central(date,r.startTime));if(matches(r,n))windows.push([n,instant(central(date,r.endTime))]);}
    });
    const result=new Map(),length=180*60000;
    for(const [a,b] of windows){
      // Jump to the requested date even when a one-time rule spans a whole term.
      const dayStart=instant(central(date,'00:00')),first=Math.max(0,Math.floor((dayStart-a)/length));
      for(let n=a+first*length;n+length<=b&&local(n).date<=date;n+=length)if(local(n).date===date){const start=new Date(n).toISOString(),end=new Date(n+length).toISOString();result.set(start+'|'+end,{start,end});}
    }
    return [...result.values()].sort((a,b)=>a.start.localeCompare(b.start));
  }

  function activeBooking(b){return ['PENDING','CONFIRMED'].includes(b.status);}
  function semesterSummary(sim,rules,bookings,instructors){
    const first=sim.termStart,last=sim.termEnd,a=new Date(first+'T12:00:00Z'),z=new Date(last+'T12:00:00Z');
    if(!Number.isFinite(+a)||!Number.isFinite(+z)||z<a||(z-a)>370*86400000)fail('Invalid semester dates.');
    const addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
    const monday=addDays(first,-((a.getUTCDay()+6)%7)),endExclusive=addDays(last,1),weeks=[];
    const confirmed=bookings.filter(b=>activeBooking(b)&&b.simulatorId===sim.id);
    function capacity(date){
      const intervals=instructors.flatMap(email=>fixedSlots(sim,rules,date,email).filter(s=>isOpen(sim,rules,instant(s.start),instant(s.end),email)).map(s=>[instant(s.start),instant(s.end)])).sort((x,y)=>x[0]-y[0]);
      let sum=0,start=null,end=null;for(const [a,b] of intervals){if(start===null){start=a;end=b;}else if(a<=end)end=Math.max(end,b);else{sum+=end-start;start=a;end=b;}}if(start!==null)sum+=end-start;return sum/60000;
    }
    const termStart=instant(central(first,'00:00')),termEnd=instant(central(endExclusive,'00:00'));
    for(let weekStart=monday;weekStart<=last;weekStart=addDays(weekStart,7)){
      const from=weekStart<first?first:weekStart,next=addDays(weekStart,7),to=next>endExclusive?endExclusive:next,start=instant(central(from,'00:00')),end=instant(central(to,'00:00'));let open=0;
      for(let date=from;date<to;date=addDays(date,1))open+=capacity(date);
      const booked=confirmed.reduce((n,b)=>n+Math.max(0,Math.min(end,instant(b.end))-Math.max(start,instant(b.start)))/60000,0);
      const count=confirmed.filter(b=>instant(b.start)<end&&instant(b.end)>termStart&&Math.max(termStart,instant(b.start))>=start).length;
      weeks.push({week:weeks.length+1,weekStart,fromDate:from,toDate:addDays(to,-1),capacityMinutes:open,bookedMinutes:booked,reservations:count});
    }
    return {fromDate:first,toDate:last,weeks,capacityMinutes:weeks.reduce((n,w)=>n+w.capacityMinutes,0),bookedMinutes:weeks.reduce((n,w)=>n+w.bookedMinutes,0),reservations:confirmed.filter(b=>overlap(termStart,termEnd,instant(b.start),instant(b.end))).length};
  }
  function check(sim,rules,bookings,user,startValue,endValue,now) {
    if(!sim||String(sim.active)!=='TRUE'||sim.mode!=='CONTROLLED') fail('Simulator unavailable.');
    const start=instant(startValue),end=instant(endValue),slot=15;
    if(!Number.isInteger(slot)||slot<15||slot>240) fail('Invalid simulator slot configuration.');
    if(start%60000||end%60000||local(start).minute%slot||end<=start||(end-start)%(slot*60000)||(end-start)>Number(sim.maxMinutes)*60000) fail('Invalid duration or slot boundary.');
    if(start<=now||end>now+Number(sim.horizonDays)*86400000) fail('Outside booking horizon.');
    if(!isOpen(sim,rules,start,end,user.instructorEmail)) fail('This time is not open for booking.');
    if(bookings.some(b=>activeBooking(b)&&(b.simulatorId===sim.id||b.email===user.email)&&overlap(start,end,instant(b.start),instant(b.end)))) fail('Booking conflict. Refresh and choose another time.');
    return {start:new Date(start).toISOString(),end:new Date(end).toISOString()};
  }
  return {instant,overlap,local,validateRule,isOpen,central,fixedSlots,semesterSummary,activeBooking,check};
})();
if(typeof module!=='undefined') module.exports=Domain;
