// The supplied FAA legend is displayed intact. A mapped ID opens an example
// verified in this chart crop; null means that no example has been verified.
const legendCatalogData = [
  ['Airports', [
    ['Non-towered airport','krcm'],['Towered airport','kmci'],['Hard-surface runway pattern','newcentury'],
    ['Airport with runways over 8,069 ft','kmci'],['Open dot in runway symbol',null],['Seaplane base',null],
    ['Private-use airport','private'],['Military airport','whiteman'],['Selected heliport',null],
    ['Unverified airport',null],['Abandoned paved airport','abandoned'],['Ultralight flight park','ultralight'],
    ['Fuel availability ticks',null],['Rotating airport beacon',null]
  ]],
  ['Airport data', [
    ['Airport name and location identifier','krcm'],['Airport elevation','elevation'],
    ['Longest runway length','runwaylength'],['Right traffic pattern','rightpattern'],
    ['Control tower frequency','kmci'],['CTAF frequency','ctaf'],['ATIS',null],
    ['AWOS / ASOS weather frequency','awos'],['UNICOM',null],['VFR advisory frequency',null],
    ['FSS notation',null],['No SVFR notation',null],['Airport of Entry',null],
    ['Runway lighting codes',null],['Part-time tower star',null]
  ]],
  ['Airspace and traffic', [
    ['Class B boundary','classbline'],['Class C boundary',null],['Class D boundary','classdline'],
    ['Class D ceiling','classdceil'],['Class E surface boundary',null],['Class E 700 ft AGL vignette','classevignette'],
    ['Class E 1,200 ft AGL vignette',null],['Class E MSL floor label',null],
    ['Class G surface area label',null],['Federal airway and mileage','airway'],
    ['RNAV T-route',null],['RNAV waypoint',null],['Mode C / ADS-B Out ring','modec'],
    ['Terminal Area Chart limit','tac'],['Special airport traffic area',null],
    ['Prohibited, restricted or warning area',null],['Alert area or MOA',null],
    ['ADIZ',null],['National Security Area',null],['Terminal Radar Service Area',null],
    ['Military training route',null]
  ]],
  ['Communication and navigation', [
    ['Flight Service Station communication box',null],['Remote frequency box',null],
    ['Receive-only frequency',null],['HIWAS / ASOS / AWOS symbols',null],
    ['VOR',null],['VOR-DME',null],['VORTAC','vortac'],['DME only',null],
    ['NDB',null],['NDB-DME',null],['Other radio facility',null]
  ]],
  ['Obstructions, miscellaneous and terrain', [
    ['Single obstruction','obstruction'],['Group obstruction','groupobstruction'],
    ['Lighted obstruction',null],['Wind turbine',null],['Wind turbine farm',null],
    ['Obstruction under construction',null],['Maximum Elevation Figure','mef'],
    ['Aerobatic practice area',null],['Glider or ultralight activity area','glider'],
    ['Parachute jumping area',null],['Stadium',null],['Space launch activity area',null],
    ['Marine light',null],['Isogonic line',null],['VFR waypoint',null],
    ['Power transmission line',null],['Aerial cable',null],['Lookout tower',null],
    ['Mountain pass',null],['Populated place tint','citytint']
  ]]
];
const legendDialog=document.getElementById('legendDialog');
const legendCatalog=document.getElementById('legendCatalog');
for(const [section,items] of legendCatalogData){
  const heading=document.createElement('h3');heading.textContent=section;legendCatalog.appendChild(heading);
  for(const [label,id] of items){
    const node=document.createElement(id?'button':'div');
    if(id){node.type='button';node.innerHTML=`${label}<small>Show highlighted chart example ↗</small>`;
      node.onclick=()=>{legendDialog.classList.remove('open');showMode('explore');select(id,true)};
    }else{node.className='ref-only';node.innerHTML=`${label}<small>Reference only · no verified marker in this chart excerpt</small>`;}
    legendCatalog.appendChild(node);
  }
}
document.getElementById('openLegendReference').onclick=()=>legendDialog.classList.add('open');
document.getElementById('closeLegendReference').onclick=()=>legendDialog.classList.remove('open');
document.getElementById('legendImageWrap').onclick=e=>e.currentTarget.classList.toggle('zoomed');
legendDialog.addEventListener('click',e=>{if(e.target===legendDialog)legendDialog.classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')legendDialog.classList.remove('open')});
