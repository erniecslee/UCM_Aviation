const GUIDE = 'https://aeronav.faa.gov/user_guide/cug-complete_20260709.pdf';
const AIM = 'https://www.faa.gov/air_traffic/publications/aim_html/chap3_section_1.html';
const CHART = 'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr/';
const q = (kind, question, options, answer, explanation, source, featureId) => ({kind,question,options,answer,explanation,source,featureId});
const quizQuestions = [
  q('CHART SYMBOL','What does the magenta airport symbol at Skyhaven (KRCM) tell you?',['It has a control tower','It is a non-towered airport','It is a Class B airport','It is a VOR'],1,'FAA sectional charts use magenta for airports without an operating control tower.',GUIDE+'#page=23','krcm'),
  q('CHART SYMBOL','What does the blue airport symbol at KMCI indicate?',['A towered airport','A private airport','A Class G airport','A restricted area'],0,'Blue identifies an airport with a control tower. The airport symbol and surrounding airspace must be read separately.',GUIDE+'#page=23','kmci'),
  q('CHART SYMBOL','On the Kansas City chart, what does the Class B label 80 / 30 mean?',['80,000 to 30,000 ft MSL','8,000 ft ceiling and 3,000 ft floor MSL','8,000 ft AGL to 3,000 ft AGL','80 NM radius and 30 NM inner ring'],1,'Class B altitude labels omit the last two zeros and are expressed in feet MSL.',GUIDE+'#page=16','classb'),
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
let quizIndex = 0, quizScore = 0, quizAnswered = false;
const quizBoard = document.getElementById('quizBoard');
function renderQuiz() {
  if (quizIndex >= quizQuestions.length) {
    quizBoard.innerHTML = `<div class="quiz-wrap"><div class="quiz-card"><div class="quiz-kind">QUIZ COMPLETE</div><h3>You scored ${quizScore} / ${quizQuestions.length}</h3><p>Return to the map to review symbols, or try the questions again.</p><button class="quiz-next" id="quizRestart">Try again</button></div></div>`;
    document.getElementById('quizRestart').onclick = () => { quizIndex = 0; quizScore = 0; quizAnswered = false; renderQuiz(); };
    return;
  }
  const item = quizQuestions[quizIndex], feature = features.find(f => f.id === item.featureId);
  const crop = feature ? `<div class="quiz-crop" role="img" aria-label="Wider chart context near ${feature.name}"></div>` : '';
  quizBoard.innerHTML = `<div class="quiz-wrap"><div class="quiz-top"><h2>Quick quiz</h2><span>Question ${quizIndex+1} of ${quizQuestions.length} · ${quizScore} correct</span></div><div class="quiz-progress"><i style="width:${quizIndex/quizQuestions.length*100}%"></i></div><div class="quiz-card"><div class="quiz-kind">${item.kind}</div><h3>${item.question}</h3>${crop}<div class="choices">${item.options.map((option,index)=>`<button type="button" data-answer="${index}">${String.fromCharCode(65+index)}. ${option}</button>`).join('')}</div><div id="quizFeedback"></div></div></div>`;
  if (feature) {
    const chartCrop=quizBoard.querySelector('.quiz-crop');
    const sourceWidth=1050;
    const scale=chartCrop.clientWidth/sourceWidth;
    const focusX=Math.max(sourceWidth/2,Math.min(3550-sourceWidth/2,feature.x*35.5+(feature.id==='kmci'?80:0)));
    const sourceHeight=chartCrop.clientHeight/scale;
    const focusY=Math.max(sourceHeight/2,Math.min(2900-sourceHeight/2,feature.y*29));
    chartCrop.style.backgroundSize=`${3550*scale}px ${2900*scale}px`;
    chartCrop.style.backgroundPosition=`${chartCrop.clientWidth/2-focusX*scale}px ${chartCrop.clientHeight/2-focusY*scale}px`;
  }
  quizBoard.querySelectorAll('[data-answer]').forEach(button => button.onclick = () => answerQuiz(Number(button.dataset.answer)));
}
function answerQuiz(choice) {
  if (quizAnswered) return;
  quizAnswered = true;
  const item = quizQuestions[quizIndex];
  const correct = choice === item.answer;
  if (correct) quizScore++;
  quizBoard.querySelectorAll('[data-answer]').forEach(button => {
    const index = Number(button.dataset.answer);
    button.disabled = true;
    if (index === item.answer) button.classList.add('correct');
    else if (index === choice) button.classList.add('wrong');
  });
  document.getElementById('quizFeedback').innerHTML = `<div class="quiz-feedback"><b>${correct ? 'Correct' : 'Not quite'}</b>${item.explanation}<br><a href="${item.source}" target="_blank" rel="noopener">Check FAA source ↗</a></div><button class="quiz-next" id="quizNext">${quizIndex+1 === quizQuestions.length ? 'See results' : 'Next question'} →</button>`;
  document.getElementById('quizNext').onclick = () => { quizIndex++; quizAnswered = false; renderQuiz(); quizBoard.scrollTop = 0; };
}
