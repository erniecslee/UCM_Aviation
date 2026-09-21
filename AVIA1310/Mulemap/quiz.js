const GUIDE = 'https://aeronav.faa.gov/user_guide/cug-complete_20260709.pdf';
const AIM = 'https://www.faa.gov/air_traffic/publications/aim_html/chap3_section_1.html';
const CHART = 'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr/';
const q = (kind, question, options, answer, explanation, source, featureId) => ({kind,question,options,answer,explanation,source,featureId});
const quizQuestions = [
  q('CHART SYMBOL','What does the magenta airport symbol at Skyhaven (KRCM) tell you?',['It has a control tower','It is a non-towered airport','It is a Class B airport','It is a VOR'],1,'FAA sectional charts use magenta for airports without an operating control tower.',GUIDE+'#page=23','krcm'),
  q('CHART SYMBOL','What does the blue airport symbol at KMCI indicate?',['A towered airport','A private airport','A Class G airport','A restricted area'],0,'Blue identifies an airport with a control tower. The airport symbol and surrounding airspace must be read separately.',GUIDE+'#page=23','kmci'),
  q('CHART SYMBOL','On the Kansas City chart, what does the Class B label 80 / 24 mean?',['80,000 to 24,000 ft MSL','8,000 ft ceiling and 2,400 ft floor MSL','8,000 ft AGL to 2,400 ft AGL','80 NM radius and 24 NM inner ring'],1,'Class B altitude labels omit the last two zeros and are expressed in feet MSL.',GUIDE+'#page=16','classb'),
  q('CHART SYMBOL','What does AFB in Whiteman AFB stand for?',['Airspace Flight Boundary','Air Force Base','Airport Frequency Box','Automated Flight Broadcast'],1,'AFB denotes Air Force Base. Do not infer nearby airspace entry rules from the airport name alone.',GUIDE+'#page=23','whiteman'),
  q('CHART SYMBOL','The blue symbol for Kansas City Downtown (KMKC) tells you which fact first?',['The runway is at least 8,000 ft','The airport has a control tower','Class B begins at the surface everywhere nearby','It is a military field'],1,'The airport symbol color identifies tower status. Read runway and airspace information from their own chart entries.',GUIDE+'#page=23','kmkc'),
  q('CHART READING','When reading a Class B sector, which two things must you check before comparing altitude?',['Airport fuel and runway length','Horizontal position and sector floor/ceiling','Magnetic variation and CTAF','Surface wind and visibility'],1,'Each Class B sector has its own lateral boundaries and floor/ceiling. The nearby label does not describe the entire terminal area.',GUIDE+'#page=16','classb'),
  q('CHART READING','What are the charted Class B floor and ceiling values referenced to?',['AGL','Pressure altitude','MSL','Height above the airport'],2,'Charted Class B altitude limits are in feet MSL unless specifically noted otherwise.',GUIDE+'#page=16','classb'),
  q('CHART READING','How is the lateral boundary of Class B airspace depicted on a sectional?',['Solid blue line','Dashed magenta line','Solid green line','Brown contour line'],0,'The FAA chart legend depicts Class B boundaries with solid blue lines.',GUIDE+'#page=26'),
  q('CHART READING','How is Class D airspace typically outlined on a sectional?',['Solid blue line','Dashed blue line','Solid magenta line','Gray shading'],1,'Class D boundaries are shown by dashed blue lines on sectionals.',GUIDE+'#page=27'),
  q('CHART READING','How is Class E airspace beginning at the surface typically outlined?',['Dashed magenta line','Solid blue line','Dashed blue line','Black runway symbol'],0,'A dashed magenta line depicts a Class E surface area.',GUIDE+'#page=27'),
  q('CHART READING','What does a magenta vignette indicate at its feathered edge?',['Class B from the surface','Class E beginning at 700 ft AGL','Class D to 2,500 ft AGL','A prohibited area'],1,'The magenta vignette depicts the transition to Class E beginning at 700 ft AGL on the shaded side.',GUIDE+'#page=27'),
  q('CLASSIC LEGEND','What does a heavy solid blue line around Kansas City identify?',['A Class B lateral boundary','A Class D boundary','A river','A runway centerline'],0,'The heavy solid blue line outlines a Class B sector. Read that sector’s blue floor and ceiling separately.',GUIDE+'#page=26','classbline'),
  q('CLASSIC LEGEND','What does a magenta circle crossed by an X depict?',['A towered airport','A VOR','An abandoned airport','A parachute jumping area'],2,'The FAA legend uses a crossed magenta circle for an abandoned airport retained as a landmark.',GUIDE+'#page=23','abandoned'),
  q('CLASSIC LEGEND','Beside a blue obstruction symbol, what does 1,298 (406) mean?',['1,298 ft AGL; 406 ft MSL','1,298 ft MSL top; 406 ft AGL height','1,298 ft runway; 406 ft elevation','1,298 ft airspace ceiling; 406 ft floor'],1,'The first figure is the obstacle top in feet MSL; the parenthesized figure is its height above the ground.',GUIDE+'#page=33','obstruction'),
  q('CLASSIC LEGEND','How does the FAA chart show a group of obstructions?',['Multiple blue obstruction peaks','A crossed magenta circle','A solid blue Class B line','A magenta Class E vignette'],0,'Multiple blue peaks depict a grouped obstruction; a single blue peak depicts one obstruction.',GUIDE+'#page=33','groupobstruction'),
  q('CLASSIC LEGEND','What is the large blue 22 in its chart quadrangle?',['Class B floor at 2,200 ft','A 22 NM radius','A Maximum Elevation Figure of 2,200 ft MSL','Runway 22'],2,'A Maximum Elevation Figure is expressed in hundreds of feet MSL for its quadrangle.',GUIDE+'#page=33','mef'),
  q('CLASSIC LEGEND','What does the magenta Class C marking near Springfield–Branson identify?',['A Class C airspace area','A military route','A Class B ceiling','An abandoned airport'],0,'The Class C label and magenta boundary identify controlled airspace with sector-specific vertical limits.',GUIDE+'#page=26','classc'),
  q('CLASSIC LEGEND','What does Truman B MOA identify on the sectional?',['A Military Operations Area','A private airport','A weather station','A VOR test facility'],0,'MOA is a Military Operations Area; consult the charted special-use information for its limits and schedule.',GUIDE+'#page=30','moa'),
  q('CLASSIC LEGEND','What does the circled H near Bartlesville depict?',['A selected heliport','An unverified airport','A VOR-DME','A prohibited area'],0,'The FAA sectional legend uses a circled H for a selected heliport.',GUIDE+'#page=23','heliport'),
  q('CHART SYMBOL','What does the open dot inside the KMCI runway symbol mark?',['Approximate location of a navigation aid','A closed runway','A fuel pump','A helipad'],0,'An open dot inside a hard-surfaced runway pattern gives the approximate VOR, VOR-DME, DME or VORTAC location.',GUIDE+'#page=23','opendot'),
  q('CHART SYMBOL','What landing facility does the magenta anchor at Grand Glaize identify?',['A seaplane base','A heliport','A private paved runway','A VOR'],0,'The anchor symbol identifies a seaplane base.',GUIDE+'#page=23','seaplane'),
  q('CHART SYMBOL','What do the short ticks around the Miami County airport symbol indicate?',['Fuel availability','Class D airspace','An ATIS broadcast','A restricted area'],0,'Fuel availability is indicated by ticks around the basic airport symbol; check the Chart Supplement for details.',GUIDE+'#page=23','fuelticks'),
  q('CHART SYMBOL','What does the star above Lawrence Smith Memorial airport depict?',['A rotating airport beacon','A part-time tower','A VOR frequency','A fuel limitation'],0,'The star above an airport symbol depicts a rotating beacon operating from sunset to sunrise.',GUIDE+'#page=23','beacon'),
  q('AIRPORT DATA','At Johnson County Executive, which frequency is charted for the control tower?',['119.35','126.0','122.95','115.35'],1,'CT 126.0 is the tower frequency in the OJC airport data.',GUIDE+'#page=24','ojctower'),
  q('AIRPORT DATA','At Johnson County Executive, which frequency is ATIS?',['119.35','126.0','122.95','122.1R'],0,'The airport data explicitly labels ATIS 119.35.',GUIDE+'#page=24','ojcatis'),
  q('AIRPORT DATA','At Johnson County Executive, which charted frequency is UNICOM?',['115.35','119.35','126.0','122.95'],3,'The 122.95 airport data entry is UNICOM, separate from CT and ATIS.',GUIDE+'#page=24','ojcunicom'),
  q('AIRPORT DATA','What does the star immediately after CT 126.0 at OJC mean?',['Part-time tower operation','A rotating beacon','A seaplane base','Fuel available'],0,'A star following the tower frequency indicates part-time tower operation.',GUIDE+'#page=24','ojcparttime'),
  q('AIRPORT DATA','What does *L beside the OJC elevation and runway data mean?',['Runway lighting limitations exist','Lighting is always off','It is an uncontrolled airport','It is a heliport'],0,'The *L notation indicates lighting limitations; consult the Chart Supplement for details.',GUIDE+'#page=24','ojclighting'),
  q('RADIO NAVIGATION','What type of facility is the blue symbol at Braymer (BQS)?',['VOR-DME','NDB','Airport weather station','Seaplane base'],0,'The Braymer chart symbol is a VOR-DME navigation aid.',GUIDE+'#page=25','bqsvordme'),
  q('RADIO NAVIGATION','Which frequency and channel identify Braymer BQS?',['115.35 and Ch 100','113.25 and Ch 79','119.35 and Ch 100','122.1R and Ch 79'],0,'The Braymer navigation box shows 115.35, channel 100 and BQS.',GUIDE+'#page=25','bqsfreq'),
  q('COMMUNICATION','What does the R in Butler 122.1R indicate?',['Receive only','Radar required','Restricted area','Right traffic'],0,'R denotes receive only in the Flight Service remote frequency notation.',GUIDE+'#page=25','fssbox'),
  q('RADIO NAVIGATION','What does the plain blue square near Robinson represent?',['DME only','VORTAC','NDB','Airport beacon'],0,'A plain square is the FAA sectional symbol for a DME-only facility. The nearby box identifies RBA, channel 19 and 108.2.',GUIDE+'#page=25','dmeonly'),
  q('AIRSPACE','What does the magenta feathering around Marshall show?',['Class C airspace','Class E beginning at 700 ft AGL','A MOA','A TAC boundary'],1,'The feathered magenta vignette marks Class E beginning at 700 ft AGL on the shaded side; it is not Class C.',GUIDE+'#page=27','marshallvignette'),
  q('AIRPORT SYMBOL','What does an open magenta airport circle indicate?',['A non-towered airport with other than hard-surfaced runways','A towered paved airport','An abandoned airport','A seaplane base'],0,'The open circle depicts other than hard-surfaced runways; magenta indicates an airport without an operating control tower.',GUIDE+'#page=23','softsurface'),
  q('AIRSPACE','What does 53 / SFC mean in the highlighted Class C sector?',['5,300 ft MSL ceiling; surface floor','5,300 ft AGL ceiling; surface floor','530 ft MSL ceiling; surface floor','53,000 ft MSL ceiling; no floor'],0,'Class C altitude pairs are read as ceiling over floor in hundreds of feet MSL. Here, 53/SFC means a 5,300 ft MSL ceiling and a surface floor.',AIM,'classc'),
  q('CHART SYMBOL','What activity does the magenta parachute near Noah’s Ark depict?',['Parachute jumping','Glider operations','Military training','Hang gliding'],0,'The parachute symbol marks charted parachute-jumping activity.',GUIDE+'#page=35','parachute'),
  q('CHART SYMBOL','What does the magenta diamond labeled STADIUMS near Kansas City depict?',['A stadium landmark','A VOR','A Class B boundary','A military route'],0,'The diamond is a charted stadium landmark.',GUIDE+'#page=35','stadium'),
  q('CHART READING','Which star refers to a rotating beacon rather than tower hours?',['The star above an airport symbol','The star after a CT frequency','The star before an L lighting code','The star in a Class D ceiling box'],0,'A star above an airport symbol indicates a rotating beacon; a star after the tower frequency indicates part-time tower operation.',GUIDE+'#page=23','beacon'),
  q('LOCAL AIRSPACE','At 5,000 ft MSL directly over KMCI, which airspace is shown?',['Class B','Class C','Class D','Class G'],0,'The KMCI area is within the Kansas City Class B core. Check the current sector limits before any real flight.',CHART,'kmci'),
  q('LOCAL AIRSPACE','At 2,500 ft MSL over Skyhaven (KRCM), which controlled airspace is expected?',['Class B','Class C','Class D','Class E'],3,'Skyhaven lies under a Class E transition area. At 2,500 ft MSL, the airplane is above its Class E floor.',CHART,'krcm'),
  q('VFR MINIMUMS','In Class B airspace, what is the basic VFR flight visibility?',['1 statute mile','2 statute miles','3 statute miles','5 statute miles'],2,'Basic VFR in Class B requires 3 statute miles of flight visibility.',AIM),
  q('VFR MINIMUMS','In Class B airspace, what is the basic VFR cloud clearance?',['Clear of clouds','500 below, 1,000 above, 2,000 horizontal','1,000 below, 1,000 above, 1 SM horizontal','500 ft from any cloud'],0,'The basic VFR cloud clearance in Class B is clear of clouds.',AIM),
  q('VFR MINIMUMS','Below 10,000 ft MSL in Class C, what is the basic VFR flight visibility?',['1 statute mile','2 statute miles','3 statute miles','5 statute miles'],2,'Class C requires 3 statute miles below 10,000 ft MSL.',AIM),
  q('VFR MINIMUMS','In Class D below 10,000 ft MSL, what cloud clearance applies?',['Clear of clouds','500 below, 1,000 above, 2,000 horizontal','1,000 below, 1,000 above, 1 SM horizontal','500 below, 500 above, 1,000 horizontal'],1,'Class D uses the standard 500 ft below, 1,000 ft above, 2,000 ft horizontal distances.',AIM),
  q('VFR MINIMUMS','In Class E below 10,000 ft MSL, what is the basic VFR flight visibility?',['1 statute mile','2 statute miles','3 statute miles','5 statute miles'],2,'Class E below 10,000 ft MSL requires 3 statute miles.',AIM),
  q('VFR MINIMUMS','In Class E at or above 10,000 ft MSL, what is the basic VFR flight visibility?',['1 statute mile','3 statute miles','5 statute miles','10 statute miles'],2,'At or above 10,000 ft MSL, Class E requires 5 statute miles.',AIM),
  q('VFR MINIMUMS','In Class E at or above 10,000 ft MSL, what cloud clearance applies?',['Clear of clouds','500 below, 1,000 above, 2,000 horizontal','1,000 below, 1,000 above, 1 statute mile horizontal','2,000 below, 2,000 above, 2 statute miles horizontal'],2,'The higher-altitude Class E minimum is 1,000 ft below, 1,000 ft above, and 1 statute mile horizontally.',AIM),
  q('VFR MINIMUMS','During the day, at or below 1,200 ft AGL in Class G, what is the fixed-wing visibility minimum?',['1 statute mile','2 statute miles','3 statute miles','5 statute miles'],0,'Daytime Class G at or below 1,200 ft AGL requires 1 statute mile for fixed-wing aircraft.',AIM),
  q('VFR MINIMUMS','During the day, at or below 1,200 ft AGL in Class G, what cloud clearance applies?',['Clear of clouds','500 below, 1,000 above, 2,000 horizontal','1,000 below, 1,000 above, 1 SM horizontal','1,000 ft from clouds'],0,'The basic daytime Class G cloud rule at or below 1,200 ft AGL is clear of clouds.',AIM),
  q('VFR MINIMUMS','At night, at or below 1,200 ft AGL in Class G, what is the usual fixed-wing visibility minimum?',['1 statute mile','2 statute miles','3 statute miles','5 statute miles'],2,'Nighttime Class G at or below 1,200 ft AGL generally requires 3 statute miles; narrow regulatory exceptions are beyond this introductory quiz.',AIM),
  q('VFR MINIMUMS','During the day, above 1,200 ft AGL but below 10,000 ft MSL in Class G, what is the visibility minimum?',['1 statute mile','2 statute miles','3 statute miles','5 statute miles'],0,'Daytime Class G above 1,200 ft AGL and below 10,000 ft MSL requires 1 statute mile.',AIM),
  q('VFR MINIMUMS','In Class G at or above 10,000 ft MSL, what is the basic visibility minimum?',['1 statute mile','3 statute miles','5 statute miles','10 statute miles'],2,'At or above 10,000 ft MSL, Class G requires 5 statute miles.',AIM)
];
const QUIZ_ROUND_SIZE=10;
const quizNoFocus=new Set(['ojctower','ojcatis','ojcunicom','bqsfreq','beacon','ojcparttime']);
let quizRemaining=[],quizRound=[],quizIndex=0,quizScore=0,quizAnswered=false,quizRoundNumber=0;
const quizBoard = document.getElementById('quizBoard');
function shuffled(values){const copy=[...values];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
function startQuizCycle(){quizRemaining=shuffled(quizQuestions.map((_,index)=>index));quizRoundNumber=0;startQuizRound()}
function startQuizRound(){quizRoundNumber++;quizRound=quizRemaining.splice(0,Math.min(QUIZ_ROUND_SIZE,quizRemaining.length)).map(index=>quizQuestions[index]);quizIndex=0;quizScore=0;quizAnswered=false;renderQuiz();quizBoard.scrollTop=0}
function renderQuiz() {
  if(!quizRound.length){startQuizCycle();return}
  if (quizIndex >= quizRound.length) {
    const exhausted=quizRemaining.length===0,nextCount=Math.min(QUIZ_ROUND_SIZE,quizRemaining.length);
    quizBoard.innerHTML = `<div class="quiz-wrap"><div class="quiz-top"><h2>Quick quiz</h2><span>Total Question Bank: ${quizQuestions.length}</span></div><div class="quiz-card"><div class="quiz-kind">ROUND ${quizRoundNumber} COMPLETE</div><h3>You scored ${quizScore} / ${quizRound.length}</h3><p>${exhausted?'Out of questions — start from the beginning.':`${quizRemaining.length} unseen questions remain. Shuffle ${nextCount} new question${nextCount===1?'':'s'} for the next round.`}</p><button class="quiz-next" id="quizRestart">${exhausted?'Start from beginning':'Shuffle next '+nextCount}</button></div></div>`;
    document.getElementById('quizRestart').onclick = exhausted?startQuizCycle:startQuizRound;
    return;
  }
  const item = quizRound[quizIndex], feature = features.find(f => f.id === item.featureId);
  const crop = feature ? `<div class="quiz-crop" role="img" aria-label="Wider chart context near ${feature.name}"></div>` : '';
  quizBoard.innerHTML = `<div class="quiz-wrap"><div class="quiz-top"><h2>Quick quiz</h2><span>Total Question Bank: ${quizQuestions.length} · Round ${quizRoundNumber} · Question ${quizIndex+1} of ${quizRound.length} · ${quizScore} correct</span></div><div class="quiz-progress"><i style="width:${quizIndex/quizRound.length*100}%"></i></div><div class="quiz-card"><div class="quiz-kind">${item.kind}</div><h3>${item.question}</h3>${crop}<div class="choices">${item.options.map((option,index)=>`<button type="button" data-answer="${index}">${String.fromCharCode(65+index)}. ${option}</button>`).join('')}</div><div id="quizFeedback"></div></div></div>`;
  if (feature) {
    const chartCrop=quizBoard.querySelector('.quiz-crop');
    const sourceWidth=feature.id==='classb'?760:1050;
    const scale=chartCrop.clientWidth/sourceWidth;
    const targetX=(feature.markerX??feature.x)*CHART_W/100,targetY=(feature.markerY??feature.y)*CHART_H/100;
    const focusX=Math.max(sourceWidth/2,Math.min(CHART_W-sourceWidth/2,targetX));
    const sourceHeight=chartCrop.clientHeight/scale;
    const focusY=Math.max(sourceHeight/2,Math.min(CHART_H-sourceHeight/2,targetY));
    chartCrop.style.backgroundSize=`${CHART_W*scale}px ${CHART_H*scale}px`;
    chartCrop.style.backgroundPosition=`${chartCrop.clientWidth/2-focusX*scale}px ${chartCrop.clientHeight/2-focusY*scale}px`;
    if(!quizNoFocus.has(item.featureId)){
      const target=document.createElement('span');target.className='quiz-focus '+(feature.shape||'circle');target.setAttribute('aria-hidden','true');
      target.style.left=(chartCrop.clientWidth/2+(targetX-focusX)*scale)+'px';
      target.style.top=(chartCrop.clientHeight/2+(targetY-focusY)*scale)+'px';
      const focusSize=feature.id==='whiteman'?{w:48,h:26}:feature.id==='marshallvignette'?{w:58,h:34}:{w:feature.markW,h:feature.markH};
      target.style.width=Math.max(30,focusSize.w*scale+8)+'px';
      target.style.height=Math.max(26,focusSize.h*scale+8)+'px';
      if(feature.shape==='arrow')target.textContent='➜';
      chartCrop.appendChild(target);
    }
  }
  quizBoard.querySelectorAll('[data-answer]').forEach(button => button.onclick = () => answerQuiz(Number(button.dataset.answer)));
}
function answerQuiz(choice) {
  if (quizAnswered) return;
  quizAnswered = true;
  const item = quizRound[quizIndex];
  const correct = choice === item.answer;
  if (correct) quizScore++;
  quizBoard.querySelectorAll('[data-answer]').forEach(button => {
    const index = Number(button.dataset.answer);
    button.disabled = true;
    if (index === item.answer) button.classList.add('correct');
    else if (index === choice) button.classList.add('wrong');
  });
  document.getElementById('quizFeedback').innerHTML = `<div class="quiz-feedback"><b>${correct ? 'Correct' : 'Not quite'}</b>${item.explanation}<br><a href="${item.source}" target="_blank" rel="noopener">Check FAA source ↗</a></div><button class="quiz-next" id="quizNext">${quizIndex+1 === quizRound.length ? 'See round score' : 'Next question'} →</button>`;
  document.getElementById('quizNext').onclick = () => { quizIndex++; quizAnswered = false; renderQuiz(); quizBoard.scrollTop = 0; };
}
