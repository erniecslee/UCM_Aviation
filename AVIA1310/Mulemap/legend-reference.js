// The supplied FAA legend is displayed intact. A mapped ID opens an example
// verified in this chart; null means no on-map example has been mapped.
const legendCatalogData = [
  ['Airports', [
    ['Non-towered airport','krcm'],['Towered airport','kmci'],['Other than hard-surfaced runways','softsurface'],['Hard-surface runway pattern','newcentury'],
    ['Airport with runways over 8,069 ft','runwaysover8069'],['Open dot in runway symbol','opendot'],['Seaplane base','seaplane'],
    ['Private-use airport','private'],['Military airport','whiteman'],['Selected heliport','heliport'],
    ['Unverified airport',null],['Abandoned paved airport','abandoned'],['Ultralight flight park','ultralight'],
    ['Fuel availability ticks','fuelticks'],['Rotating airport beacon','beacon']
  ]],
  ['Airport data', [
    ['Airport name and location identifier','airportidentifier'],['Airport elevation','elevation'],
    ['Longest runway length','runwaylength'],['Right traffic pattern','rightpattern'],
    ['Control tower frequency','ojctower'],['CTAF frequency','ctaf'],['ATIS','ojcatis'],
    ['AWOS / ASOS weather frequency','awos'],['UNICOM','ojcunicom'],['VFR advisory frequency',null],
    ['FSS notation','fssbox'],['No SVFR notation',null],['Airport of Entry',null],
    ['Runway lighting codes','ojclighting'],['Part-time tower star','ojcparttime']
  ]],
  ['Airspace and traffic', [
    ['Class B boundary','classbline'],['Class C boundary','classcboundary'],['Class C altitude label','classc'],['Class D boundary','classdline'],
    ['Class D ceiling','classdceil'],['Class E surface boundary',null],['Class E 700 ft AGL vignette','classevignette'],
    ['Class E 1,200 ft AGL vignette',null],['Class E MSL floor label',null],
    ['Class G surface area label',null],['Federal airway and mileage','airway'],
    ['RNAV T-route',null],['RNAV waypoint',null],['Mode C / ADS-B Out ring','modec'],
    ['Terminal Area Chart limit','tac'],['Special airport traffic area',null],
    ['Prohibited, restricted or warning area',null],['Alert area',null],['Military Operations Area (MOA)','moa'],
    ['ADIZ',null],['National Security Area',null],['Terminal Radar Service Area',null],
    ['Military training route',null]
  ]],
  ['Communication and navigation', [
    ['Flight Service Station communication box','fssbox'],['Remote frequency box','fssbox'],
    ['Receive-only frequency','fssbox'],['HIWAS / ASOS / AWOS symbols','awos'],
    ['VOR',null],['VOR-DME','bqsvordme'],['VORTAC','vortac'],['DME only','dmeonly'],
    ['NDB',null],['NDB-DME',null],['Other radio facility',null]
  ]],
  ['Obstructions, miscellaneous and terrain', [
    ['Single obstruction','obstruction'],['Group obstruction','groupobstruction'],
    ['Lighted obstruction',null],['Wind turbine',null],['Wind turbine farm',null],
    ['Obstruction under construction',null],['Maximum Elevation Figure','mef'],
    ['Aerobatic practice area',null],['Glider or ultralight activity area','glider'],
    ['Parachute jumping area','parachute'],['Stadium','stadium'],['Space launch activity area',null],
    ['Marine light',null],['Isogonic line',null],['VFR checkpoint flag',null],['VFR waypoint',null],
    ['Power transmission line',null],['UAS infrastructure caution',null],['Aerial cable',null],['Lookout tower',null],
    ['Mountain pass',null],['Populated place tint','citytint']
  ]]
];
const legendDialog=document.getElementById('legendDialog');
const legendCatalog=document.getElementById('legendCatalog');
const placeholderId=label=>'pending-'+label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const pendingCardCopy={
  'Unverified airport':['The charted U identifies an unverified airport. Treat its published status and physical condition cautiously.','Confirm current airport information before relying on the facility.'],
  'VFR advisory frequency':['A VFR advisory frequency provides airport advisory information where full-time ATIS is unavailable.','Read the associated airport data carefully because the advisory frequency may differ from CTAF.'],
  'No SVFR notation':['NO SVFR means fixed-wing special VFR operations are prohibited at the identified airport.','The notation applies to the named airport and must be read with its airport data.'],
  'Airport of Entry':['AOE identifies an Airport of Entry for customs purposes.','Confirm current customs availability and advance-notice requirements before arrival.'],
  'Class E surface boundary':['A dashed magenta line encloses Class E airspace that begins at the surface.','Follow the entire dashed magenta boundary and check any effective-time note.'],
  'Class E 1,200 ft AGL vignette':['The blue-tinted vignette depicts Class E airspace beginning at 1,200 ft AGL.','The shaded side determines where the 1,200-foot Class E floor applies.'],
  'Class E MSL floor label':['A boxed MSL value identifies a Class E floor higher than 700 ft above the surface.','Read the printed value as an MSL altitude and trace the associated boundary.'],
  'Class G surface area label':['CLASS G identifies an area where Class G extends upward from the surface as charted.','Check the surrounding Class E boundaries before applying the label to a position.'],
  'RNAV T-route':['A blue T-route is a low-altitude RNAV route with named waypoints and route numbers.','Read its published altitude and navigation requirements from current FAA sources.'],
  'RNAV waypoint':['The four-point waypoint symbol identifies an RNAV waypoint by its five-letter name.','Use the exact waypoint name and do not confuse it with a nearby navaid.'],
  'Special airport traffic area':['This boundary identifies a Special Airport Traffic Area with locally published operating rules.','Consult the cited FAA rule or Chart Supplement before entering.'],
  'Prohibited, restricted or warning area':['The blue-hatched boundary identifies special-use airspace; its letter-number label identifies the specific area.','Check current status, altitude limits and times of use before flight.'],
  'Alert area':['An Alert Area identifies extensive pilot training or unusual aerial activity.','Pilots remain responsible for collision avoidance and should check current activity.'],
  'ADIZ':['The ADIZ boundary marks an Air Defense Identification Zone with identification and flight-plan requirements.','Review current interception and ADIZ procedures before crossing.'],
  'National Security Area':['A National Security Area requests pilots to avoid flight for national-security reasons.','Comply with any temporary prohibition issued by NOTAM.'],
  'Terminal Radar Service Area':['A TRSA boundary depicts an area where participating pilots may receive additional radar services.','Participation rules differ from Class B, C and D airspace.'],
  'Military training route':['An IR or VR route identifies a military training route; the number and line show the route designation and course.','Check current route activity and crossing traffic before flight.'],
  'VOR':['The blue hexagonal compass symbol identifies a VHF Omnidirectional Range station.','Read the nearby name, identifier and frequency box together.'],
  'NDB':['The magenta dotted compass rose identifies a Non-Directional Beacon.','Confirm the facility name and frequency in current navigation data.'],
  'NDB-DME':['An NDB-DME combines the NDB symbol with a DME square.','The paired symbols indicate bearing and distance services at the same facility.'],
  'Other radio facility':['The small blue circular symbol identifies another radio facility such as an FSS outlet or RCO.','Use its adjacent label to determine the service provided.'],
  'Lighted obstruction':['Small radiating marks identify an obstruction equipped with high-intensity lighting.','Read the adjacent MSL elevation and AGL height separately.'],
  'Wind turbine':['The wind-turbine symbol marks a charted turbine obstruction.','Consider both the turbine height and nearby terrain.'],
  'Wind turbine farm':['A dashed boundary with turbine symbols identifies a wind-turbine farm.','The boundary outlines a group of turbine obstructions rather than one point.'],
  'Obstruction under construction':['UC beside an obstruction means its position and elevation are unverified or under construction.','Use current NOTAMs and obstruction data because the charted details may change.'],
  'Aerobatic practice area':['The magenta A symbol identifies an aerobatic practice area.','Consult the Chart Supplement for operating details and activity times.'],
  'Space launch activity area':['The rocket symbol identifies a space-launch activity area.','Review the Chart Supplement and current notices before operating nearby.'],
  'Marine light':['A solid blue dot identifies a marine light used as a visual reference.','Treat it as a landmark rather than an aviation navigation aid.'],
  'Isogonic line':['An isogonic line connects points of equal magnetic variation and includes the chart-year value.','Use current chart information when converting between true and magnetic direction.'],
  'VFR checkpoint flag':['The magenta flag marks a named VFR reporting checkpoint emphasized for traffic control.','Use the charted name used by ATC when reporting your position.'],
  'VFR waypoint':['A magenta flag with a five-letter identifier marks a VFR waypoint.','Use the published latitude and longitude and the exact waypoint identifier.'],
  'Power transmission line':['The tower-and-line symbol depicts a power transmission line.','Treat the line and towers as visual landmarks and potential obstructions.'],
  'UAS infrastructure caution':['The caution note highlights infrastructure where UAS operations may be approved above critical facilities.','Check NOTAMs and remain alert near the depicted infrastructure.'],
  'Aerial cable':['A dashed line between tower symbols depicts an aerial cable.','Allow clearance for the cable span as well as its supporting structures.'],
  'Lookout tower':['The lookout-tower symbol includes the elevation at the tower base.','Distinguish the base elevation from the tower height and surrounding terrain.'],
  'Mountain pass':['The curved pass symbol and elevation identify a named mountain pass.','The symbol does not guarantee safe clearance or recommend a route through the pass.']
};
function ensurePlaceholder(label,section){
  const id=placeholderId(label);let f=features.find(x=>x.id===id);if(f)return f;
  const n=features.filter(x=>x.placeholder).length;
  const copy=pendingCardCopy[label]||['This FAA legend item can be mapped to a verified example on the sectional.','Confirm the exact symbol and its surrounding chart context before publishing.'];
  f={id,name:label,code:'Developer placement',category:section.toUpperCase(),x:38+(n%5)*2,y:38+Math.floor(n/5)*2,markW:62,markH:62,sourcePage:35,placeholder:true,extra:true,
    desc:copy[0],tip:copy[1],question:`Can you identify the exact ${label.toLowerCase()} on this chart?`,steps:['Find the exact chart symbol or marking','Read its nearby label or boundary','Confirm the meaning in the FAA Chart Users’ Guide']};
  features.push(f);addHotspot(f);renderList(document.getElementById('search').value);return f;
}
for(const [section,items] of legendCatalogData)for(const [label,id] of items){if(!id&&savedDevLayout()[placeholderId(label)])ensurePlaceholder(label,section)}
window.renderLegendCatalog=function(){
  legendCatalog.innerHTML='';
  for(const [section,items] of legendCatalogData){
    const heading=document.createElement('h3');heading.textContent=section;legendCatalog.appendChild(heading);
    for(const [label,mappedId] of items){
      const pending=placeholderId(label),f=features.find(x=>x.id===(mappedId||pending)),id=mappedId||(f?.id),isNA=!!f?.na;
      const node=document.createElement(id||devMode?'button':'div');
      if(id&&!isNA){node.type='button';node.innerHTML=`${label}<small>${mappedId?'Show highlighted chart example ↗':'Developer marker · adjust on chart ↗'}</small>`;node.onclick=()=>{legendDialog.classList.remove('open');showMode('explore');devMode?selectDev(id,true):select(id,true)}}
      else if(devMode&&!mappedId){node.type='button';node.innerHTML=`${label}<small>${isNA?'N/A · No example mapped':'Create developer circle ↗'}</small>`;node.onclick=()=>{const created=ensurePlaceholder(label,section);legendDialog.classList.remove('open');showMode('explore');selectDev(created.id,true)}}
      else{node.className='ref-only';node.innerHTML=`${label}<small>${isNA?'No example mapped':'Study in FAA legend · no map example mapped'}</small>`}
      legendCatalog.appendChild(node);
    }
  }
};
window.renderLegendCatalog();
document.getElementById('openLegendReference').onclick=()=>legendDialog.classList.add('open');
document.getElementById('closeLegendReference').onclick=()=>legendDialog.classList.remove('open');
document.getElementById('legendImageWrap').onclick=e=>e.currentTarget.classList.toggle('zoomed');
legendDialog.addEventListener('click',e=>{if(e.target===legendDialog)legendDialog.classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')legendDialog.classList.remove('open')});
