// Representative examples in this Kansas City Sectional excerpt. Coordinates
// for named airports and NAVAIDs were checked against FAA NASR 2026-09-03.
const legendExamples = [
  {id:'classbline',name:'Solid blue line · Class B',code:'Kansas City boundary',category:'AIRSPACE',px:523,py:84,w:105,h:32,page:26,priority:true,
    desc:'The heavy solid blue line is a Class B lateral boundary. The nearby blue sector numbers give the floor and ceiling for that part of Class B.',tip:'First find the line, then read the altitude pair in the sector you are actually over. A blue line alone does not give the vertical limits.',question:'Which altitude label applies on your side of the line?'},
  {id:'airway',name:'Blue airway line',code:'V502',category:'AIRWAYS',px:1330,py:435,w:120,h:42,page:28,
    desc:'The blue line labeled V502 is a low-altitude Federal airway. The route designator identifies an airway based on navigation aids.',tip:'An airway line is a route depiction, not a Class B or Class D boundary.',question:'Which label names this airway?'},
  {id:'abandoned',name:'Circle with an X · abandoned airport',code:'Near Hillside',category:'AIRPORT',px:1108,py:1845,w:58,h:58,page:23,priority:true,
    desc:'A magenta circle with a diagonal X marks an abandoned airport. It is retained as a visual landmark or to avoid confusion with a nearby usable airport.',tip:'Do not confuse this crossed circle with the separately charted Hillside (63K) airport nearby.',question:'Would you plan to land at the crossed-circle location?'},
  {id:'private',name:'Private-use airport',code:'Robbins · (Pvt)',category:'AIRPORT',px:2320,py:1610,w:45,h:45,page:23,
    desc:'The circled R and “(Pvt)” marking identify Robbins as a private-use landing facility. A charted private strip is not automatically available to the public.',tip:'Read the private-use notation beside the airport name; it is separate from the surrounding airspace.',question:'Does the charted airport symbol grant public landing permission?'},
  {id:'newcentury',name:'Towered airport runway pattern',code:'New Century · IXD',category:'AIRPORT',px:422,py:1893,w:60,h:65,page:23,
    desc:'The blue airport symbol and runway pattern show New Century AirCenter as a towered airport with recognizable runway orientation.',tip:'The runway sketch helps identify the airport visually; check the chart data for frequencies and runway length.',question:'Which part shows tower status, and which part shows runway orientation?'},
  {id:'excelsior',name:'Non-towered airport symbol',code:'Excelsior Springs · 3EX',category:'AIRPORT',px:1852,py:577,w:48,h:48,page:23,
    desc:'This magenta airport symbol is another example of a civil airport without an operating control tower.',tip:'Compare its magenta color with the blue symbols at KMCI and New Century.',question:'What does magenta tell you before you read the airport data?'},
  {id:'vortac',name:'VORTAC navigation aid',code:'Napoleon · ANX',category:'RADIO NAVIGATION',px:1987,py:1214,w:65,h:65,page:25,
    desc:'A VORTAC combines VOR azimuth guidance with TACAN distance information. The charted identifier and frequency belong to this navigation aid.',tip:'Trace the associated compass rose and read the frequency box; this is distinct from an airport symbol.',question:'Which data identify the navigation aid?'},
  {id:'classdline',name:'Class D boundary',code:'Whiteman surface area',category:'AIRSPACE',px:2910,py:1903,w:84,h:32,page:27,
    desc:'A dashed blue boundary outlines Class D airspace around Whiteman AFB. The boundary gives the lateral limit; use the nearby ceiling value for the vertical limit.',tip:'Follow the complete dashed line before judging whether a point is inside.',question:'Does crossing the line alone tell you the airspace ceiling?'},
  {id:'classdceil',name:'Class D ceiling label',code:'34 · Whiteman',category:'AIRSPACE',px:3333,py:2195,w:76,h:72,page:27,
    desc:'The blue “34” is the Class D ceiling in hundreds of feet MSL: 3,400 ft MSL. The dashed blue boundary identifies the associated area.',tip:'FAA Class D ceiling numbers omit the last two zeros. A minus sign would mean “to but not including” the stated altitude.',question:'What altitude does 34 represent?'},
  {id:'classevignette',name:'Class E transition area',code:'Magenta vignette · 700 AGL',category:'AIRSPACE',px:2500,py:1815,w:95,h:34,page:27,
    desc:'The feathered magenta band marks a change in the floor of Class E airspace. On the shaded side, the common floor is 700 ft AGL.',tip:'The vignette is a lateral boundary of an airspace floor, not an airport or a cloud symbol.',question:'Which side of the feathered band has the 700 ft AGL Class E floor?'},
  {id:'modec',name:'Mode C / ADS-B Out ring',code:'30 NM boundary',category:'AIRSPACE',px:1950,py:1470,w:70,h:220,page:30,
    desc:'This labeled magenta line depicts the 30 NM Mode C and ADS-B Out requirement area associated with Kansas City Class B.',tip:'It is an equipment requirement boundary, not the Class B lateral boundary itself.',question:'Can this ring extend outside Class B airspace?'},
  {id:'tac',name:'Terminal Area Chart boundary',code:'TAC',category:'CHART REFERENCE',px:2017,py:1050,w:60,h:132,page:34,
    desc:'The TAC boundary marks the area covered by a more detailed Terminal Area Chart. Use that chart for finer local detail.',tip:'A TAC boundary indicates chart coverage; it does not by itself define airspace.',question:'What source gives more detail inside this boundary?'},
  {id:'mef',name:'Maximum Elevation Figure',code:'22 · 2,200 ft MSL',category:'TERRAIN & OBSTRUCTIONS',px:1650,py:1047,w:76,h:82,page:33,
    desc:'The large blue 22 is a Maximum Elevation Figure for this quadrangle: 2,200 ft MSL after FAA rounding and allowance rules.',tip:'A MEF is a terrain/obstruction reference for the quadrangle. It is not an airspace floor or a safe cruising altitude by itself.',question:'Does 22 mean 2,200 ft AGL or MSL?'},
  {id:'obstruction',name:'Tower / obstruction symbol',code:'1,298 (406)',category:'TERRAIN & OBSTRUCTIONS',px:2600,py:1618,w:70,h:82,page:33,priority:true,
    desc:'The blue obstacle symbol identifies a charted obstruction. The larger figure is its top elevation in feet MSL; the parenthesized figure is its height in feet AGL.',tip:'Compare the obstruction with nearby terrain and your planned route and altitude.',question:'Which number gives height above ground?'},
  {id:'groupobstruction',name:'Grouped obstructions',code:'Near Weston',category:'TERRAIN & OBSTRUCTIONS',px:257,py:275,w:72,h:55,page:33,
    desc:'The multiple blue obstruction points identify a group of nearby obstructions. Its adjacent elevation data refer to the charted group.',tip:'The FAA legend uses multiple peaks for a group and a single peak for one obstruction.',question:'How can you distinguish one obstruction from a group?'},
  {id:'awos',name:'Airport weather broadcast',code:'AWOS-3PT · 119.575',category:'AIRPORT DATA',px:2500,py:1893,w:300,h:35,page:24,
    desc:'AWOS-3PT is an automated airport weather reporting system. The frequency shown beside it is the charted broadcast frequency.',tip:'This weather frequency is not the same as the traffic advisory frequency.',question:'Where would you look for local automated weather?'},
  {id:'ctaf',name:'CTAF frequency',code:'123.0 · Skyhaven',category:'AIRPORT DATA',px:2622,py:1954,w:92,h:34,page:24,
    desc:'The circled C identifies the Common Traffic Advisory Frequency listed in Skyhaven’s airport data. Pilots use the charted frequency for traffic advisories.',tip:'Confirm the current frequency in current FAA publications before a real flight.',question:'Which frequency in this data group is the CTAF?'},
  {id:'elevation',name:'Airport elevation',code:'798 ft · Skyhaven',category:'AIRPORT DATA',px:2404,py:1954,w:70,h:34,page:24,
    desc:'The 798 figure in Skyhaven’s airport data is the published airport elevation in feet MSL.',tip:'Do not confuse airport elevation with a nearby obstruction top or airspace ceiling.',question:'What vertical reference is used for airport elevation?'},
  {id:'rightpattern',name:'Right traffic pattern note',code:'RP 14, 19',category:'AIRPORT DATA',px:2430,py:1984,w:155,h:30,page:24,
    desc:'“RP 14, 19” means right traffic is specified for runways 14 and 19. Other runways are not covered by this note.',tip:'The runway numbers following RP identify exactly which traffic patterns use right turns.',question:'Which runways use right traffic here?'},
  {id:'runwaylength',name:'Longest runway length',code:'42 · Skyhaven',category:'AIRPORT DATA',px:2483,py:1954,w:54,h:34,page:24,
    desc:'The charted 42 states the longest runway length in hundreds of feet: about 4,200 ft. Usable length can be less.',tip:'Runway length in airport data is a separate item from airport elevation.',question:'How many feet does 42 represent?'},
  {id:'citytint',name:'Populated place tint',code:'Kansas City',category:'CULTURE',px:1450,py:1450,w:100,h:70,page:35,
    desc:'Yellow tint marks a populated place on the sectional. It helps with visual orientation but is not an airspace boundary.',tip:'Check the nearby airspace lines separately from the city shading.',question:'Does yellow city tint define controlled airspace?'}
];
for (const item of legendExamples) {
  const cropX=Math.max(0,Math.min(3230,Math.round(item.px-120)));
  const cropY=Math.max(0,Math.min(2788,Math.round(item.py-55)));
  const f={id:item.id,name:item.name,code:item.code,category:item.category,
    x:item.px/35.5,y:item.py/29,markW:item.w,markH:item.h,cropX,cropY,sourcePage:item.page,
    desc:item.desc,tip:item.tip,question:item.question,
    steps:['Find the exact chart symbol or marking','Read the adjacent data or boundary','Use the FAA legend to check its meaning'],extra:!item.priority};
  features.push(f);
  addHotspot(f);
}
const priorities=['classbline','classdline','obstruction','groupobstruction','abandoned','airway'];
features.sort((a,b)=>{const ai=priorities.indexOf(a.id),bi=priorities.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi)});
document.getElementById('legendCount').textContent=`${features.length} representative chart examples · FAA Chart Users’ Guide pp. 23–35`;
renderList();
