const flightShell = document.getElementById('mapShell');
const flightWorld = document.getElementById('mapWorld');
const flightMain = document.querySelector('.main');
const flightHud = document.getElementById('flightHud');
const flightResults = document.getElementById('flightResults');
const altitudeInput = document.getElementById('altitudeInput');
const altitudeSlider = document.getElementById('altitudeSlider');
const exploreModeButton = document.getElementById('exploreMode');
const flightModeButton = document.getElementById('flightMode');
const quizModeButton = document.getElementById('quizMode');
const railExploreButton = document.getElementById('railExplore');
const railQuizButton = document.getElementById('railQuiz');
const dayButton = document.getElementById('dayButton');
const nightButton = document.getElementById('nightButton');
const aircraft = document.createElement('button');
aircraft.className = 'plane hidden';
aircraft.type = 'button';
aircraft.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 29 27 16 21 3 27Z" fill="#cf202e" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>';
aircraft.setAttribute('aria-label', 'Drag airplane to choose a chart location');
flightWorld.appendChild(aircraft);

const skyhavenStart = mapOld(2650, 2025);
const flightState = { mode: 'explore', x: skyhavenStart.x, y: skyhavenStart.y, altitude: 2500,
  time: 'day', ground: null, data: null, request: 0, timer: null, moving: false };
const terrainCache = new Map();
window.updateAircraftScale = () => { aircraft.style.transform = `translate(-50%,-50%) scale(${1/scale})`; };

function showMode(mode) {
  flightState.mode = mode;
  aircraft.classList.toggle('hidden', mode !== 'flight');
  closePanel();
  flightShell.classList.toggle('flight-mode', mode === 'flight');
  flightMain.classList.toggle('flight-active', mode === 'flight');
  flightMain.classList.toggle('quiz-active', mode === 'quiz');
  railExploreButton.classList.toggle('active', mode === 'explore');
  railQuizButton.classList.toggle('active', mode === 'quiz');
  for (const [button, value] of [[exploreModeButton, 'explore'], [flightModeButton, 'flight'], [quizModeButton, 'quiz']]) {
    button.classList.toggle('active', value === mode);
    button.setAttribute('aria-selected', String(value === mode));
  }
  if (mode === 'flight') {
    requestAnimationFrame(() => {
      layoutWorld();
      scale = Math.max(scale, 4);
      const visibleCenter = window.innerWidth > 850
        ? Math.max(flightShell.clientWidth * .29, (flightShell.clientWidth - 370) / 2)
        : flightShell.clientWidth * .5;
      dx = visibleCenter - flightShell.clientWidth / 2
        + (.5 - flightState.x / CHART_W) * flightWorld.clientWidth * scale;
      dy = (.5 - flightState.y / CHART_H) * flightWorld.clientHeight * scale;
      move();
      positionAircraft();
    });
    loadAirspace();
    updateFlight();
  }
  if (mode === 'quiz' && typeof renderQuiz === 'function') renderQuiz();
}
exploreModeButton.onclick = () => showMode('explore');
flightModeButton.onclick = () => showMode('flight');
quizModeButton.onclick = () => showMode('quiz');
railExploreButton.onclick = () => showMode('explore');
railQuizButton.onclick = () => showMode('quiz');

function positionAircraft() {
  aircraft.style.left = (flightState.x / CHART_W * 100) + '%';
  aircraft.style.top = (flightState.y / CHART_H * 100) + '%';
  window.updateAircraftScale();
}
function pointerToChart(event) {
  const rect = flightWorld.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(CHART_W, (event.clientX - rect.left) / rect.width * CHART_W)),
    y: Math.max(0, Math.min(CHART_H, (event.clientY - rect.top) / rect.height * CHART_H))
  };
}
function moveAircraft(event) {
  const point = pointerToChart(event);
  flightState.x = point.x;
  flightState.y = point.y;
  positionAircraft();
  flightState.ground = null;
  showFlightLoading();
  clearTimeout(flightState.timer);
  flightState.timer = setTimeout(updateFlight, 400);
}
aircraft.addEventListener('pointerdown', event => {
  if (flightState.mode !== 'flight') return;
  event.stopPropagation();
  aircraft.setPointerCapture(event.pointerId);
  aircraft.classList.add('dragging');
  flightState.moving = true;
});
aircraft.addEventListener('pointermove', event => {
  if (flightState.moving) moveAircraft(event);
});
aircraft.addEventListener('pointerup', event => {
  if (!flightState.moving) return;
  flightState.moving = false;
  aircraft.classList.remove('dragging');
  moveAircraft(event);
  clearTimeout(flightState.timer);
  updateFlight();
});
flightShell.addEventListener('click', event => {
  if (flightState.mode !== 'flight' || event.target.closest('button')) return;
  moveAircraft(event);
  clearTimeout(flightState.timer);
  updateFlight();
});

function setAltitude(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  flightState.altitude = Math.max(0, Math.min(18000, Math.round(parsed / 100) * 100));
  altitudeInput.value = flightState.altitude;
  altitudeSlider.value = flightState.altitude;
  updateFlight(false);
}
altitudeInput.addEventListener('change', event => setAltitude(event.target.value));
altitudeSlider.addEventListener('input', event => setAltitude(event.target.value));
function setTime(value) {
  flightState.time = value;
  for (const [button, mode] of [[dayButton, 'day'], [nightButton, 'night']]) {
    button.classList.toggle('active', mode === value);
    button.setAttribute('aria-pressed', String(mode === value));
  }
  updateFlight(false);
}
dayButton.onclick = () => setTime('day');
nightButton.onclick = () => setTime('night');

async function loadAirspace() {
  if (flightState.data) return;
  try {
    const response = await fetch('airspace.json?v=8');
    if (!response.ok) throw new Error('FAA airspace data unavailable');
    flightState.data = await response.json();
    updateFlight();
  } catch {
    flightResults.innerHTML = '<div class="hud-kicker">AIRSPACE LOOKUP</div><div class="airspace-name">Data unavailable</div><p class="airspace-detail">Reload the page to try again.</p>';
  }
}

function chartToLatLon(x, y) {
  ({x,y}=oldFromMap(x,y));
  const rad = Math.PI / 180;
  const phi1 = 38.66666666666666 * rad, phi2 = 33.33333333333334 * rad;
  const phi0 = 38.16666666666666 * rad, lon0 = -93.43333333333334 * rad;
  const n = Math.log(Math.cos(phi1) / Math.cos(phi2)) /
    Math.log(Math.tan(Math.PI / 4 + phi2 / 2) / Math.tan(Math.PI / 4 + phi1 / 2));
  const F = Math.cos(phi1) * Math.pow(Math.tan(Math.PI / 4 + phi1 / 2), n) / n;
  const rho0 = 6378137 * F / Math.pow(Math.tan(Math.PI / 4 + phi0 / 2), n);
  const east = (x + 5700) * 42.3350956776 - 385537.3948084932;
  const north = 235436.9468379455 - (y + 1900) * 42.3353579961;
  const rho = Math.hypot(east, rho0 - north);
  return { lat: (2 * Math.atan(Math.pow(6378137 * F / rho, 1 / n)) - Math.PI / 2) / rad,
    lon: (lon0 + Math.atan2(east, rho0 - north) / n) / rad };
}

function insideRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function insideAirspace(record, x, y) {
  let inside = false;
  for (const ring of record.rings) if (insideRing(ring, x, y)) inside = !inside;
  return inside;
}
function limits(record, ground) {
  const lowerValue = Number(record.lower[0]);
  const floor = record.lower[1] === 'MSL' ? lowerValue : ground + lowerValue;
  const upperValue = Number(record.upper[0]);
  const ceiling = upperValue < 0 ? 18000 : upperValue;
  return {floor, ceiling};
}
function classify(ground) {
  const altitude = flightState.altitude;
  if (altitude < ground) return {code: 'GROUND', label: 'Below terrain', detail: 'Raise the selected altitude above local terrain.'};
  if (altitude >= 18000) return {code: 'A', label: 'Class A', detail: 'Class A begins at 18,000 ft MSL.'};
  const matches = flightState.data.records.filter(record => insideAirspace(record, flightState.x, flightState.y))
    .map(record => ({record, ...limits(record, ground)}))
    .filter(item => altitude >= item.floor && altitude < item.ceiling);
  matches.sort((a, b) => 'BCDE'.indexOf(a.record.class) - 'BCDE'.indexOf(b.record.class) || a.floor - b.floor);
  if (matches.length) {
    const hit = matches[0];
    const floorText = hit.record.lower[1] === 'MSL' ? `${Number(hit.record.lower[0]).toLocaleString()} ft MSL` :
      Number(hit.record.lower[0]) ? `${Number(hit.record.lower[0]).toLocaleString()} ft AGL` : 'surface';
    const ceilingText = hit.ceiling === 18000 ? 'below 18,000 ft MSL' : `to ${hit.ceiling.toLocaleString()} ft MSL`;
    return {code: hit.record.class, label: `Class ${hit.record.class}`,
      detail: `${hit.record.sector ? hit.record.sector + ' · ' : ''}${floorText} ${ceilingText}`,
      record: hit.record, floor: hit.floor, ceiling: hit.ceiling};
  }
  const higherE = flightState.data.records.filter(record => record.class === 'E' && insideAirspace(record, flightState.x, flightState.y))
    .map(record => limits(record, ground).floor);
  const nextFloor = higherE.length ? Math.min(...higherE) : ground + 1200;
  return {code: 'G', label: 'Class G', detail: `Below the local Class E floor (${Math.round(nextFloor).toLocaleString()} ft MSL)`};
}

function minima(code, altitude, agl, time) {
  if (code === 'A' || code === 'GROUND') return {visibility: 'N/A', clouds: 'N/A'};
  if (code === 'B') return {visibility: '3 SM', clouds: 'Clear of clouds'};
  if (code === 'C' || code === 'D' || code === 'E' && altitude < 10000)
    return {visibility: '3 SM', clouds: '500 ft below · 1,000 ft above · 2,000 ft horizontal'};
  if (code === 'E') return {visibility: '5 SM', clouds: '1,000 ft below · 1,000 ft above · 1 SM horizontal'};
  if (agl <= 1200) return time === 'day'
    ? {visibility: '1 SM', clouds: 'Clear of clouds'}
    : {visibility: '3 SM', clouds: '500 ft below · 1,000 ft above · 2,000 ft horizontal'};
  if (altitude >= 10000) return {visibility: '5 SM', clouds: '1,000 ft below · 1,000 ft above · 1 SM horizontal'};
  return {visibility: time === 'day' ? '1 SM' : '3 SM', clouds: '500 ft below · 1,000 ft above · 2,000 ft horizontal'};
}

function showFlightLoading() {
  if (flightState.mode !== 'flight') return;
  flightHud.classList.add('loading');
  flightResults.innerHTML = '<div class="hud-kicker">AIRSPACE LOOKUP</div><div class="airspace-name">Checking terrain…</div><p class="airspace-detail">Matching this position and MSL altitude.</p>';
}
function renderFlight(ground) {
  if (flightState.mode !== 'flight' || !flightState.data) return;
  const result = classify(ground);
  const agl = Math.round(flightState.altitude - ground);
  const weather = minima(result.code, flightState.altitude, agl, flightState.time);
  const coords = chartToLatLon(flightState.x, flightState.y);
  const boundaryNote = result.floor != null &&
    (Math.abs(flightState.altitude - result.floor) <= 100 || Math.abs(flightState.altitude - result.ceiling) <= 100)
    ? 'Near a vertical boundary: verify the published limit.' : '';
  flightHud.classList.remove('loading');
  flightResults.innerHTML = `<div class="hud-kicker">CURRENT CLASS AIRSPACE</div>
    <div class="airspace-name">${result.label}</div><p class="airspace-detail">${result.detail}</p>
    <div class="minimum-grid"><div class="minimum"><b>Min. flight visibility</b><strong>${weather.visibility}</strong></div>
    <div class="minimum"><b>Cloud clearance</b><strong class="cloud">${weather.clouds}</strong></div></div>
    <p class="hud-note">Aircraft: ${flightState.altitude.toLocaleString()} ft MSL · ${agl.toLocaleString()} ft AGL<br>
    Terrain: ~${Math.round(ground).toLocaleString()} ft MSL · ${coords.lat.toFixed(3)}°N, ${Math.abs(coords.lon).toFixed(3)}°W<br>
    Basic VFR minimums for a fixed-wing aircraft (${flightState.time}). ${boundaryNote}</p>`;
}

async function updateFlight(fetchTerrain = true) {
  if (flightState.mode !== 'flight' || !flightState.data) return;
  if (!fetchTerrain && flightState.ground != null) return renderFlight(flightState.ground);
  const coords = chartToLatLon(flightState.x, flightState.y);
  const cacheKey = coords.lat.toFixed(4) + ',' + coords.lon.toFixed(4);
  if (terrainCache.has(cacheKey)) {
    flightState.ground = terrainCache.get(cacheKey);
    return renderFlight(flightState.ground);
  }
  const request = ++flightState.request;
  showFlightLoading();
  try {
    const url = new URL('https://epqs.nationalmap.gov/v1/json');
    url.search = new URLSearchParams({x: coords.lon.toFixed(6), y: coords.lat.toFixed(6), units: 'Feet', output: 'json'});
    const response = await fetch(url);
    if (!response.ok) throw new Error('Terrain service unavailable');
    const json = await response.json();
    const ground = Number(json.value);
    if (!Number.isFinite(ground) || ground < -1000) throw new Error('Terrain elevation unavailable');
    terrainCache.set(cacheKey, ground);
    if (request !== flightState.request) return;
    flightState.ground = ground;
    renderFlight(ground);
  } catch {
    if (request !== flightState.request) return;
    flightResults.innerHTML = '<div class="hud-kicker">AIRSPACE LOOKUP</div><div class="airspace-name">Terrain unavailable</div><p class="airspace-detail">The Class E/G floor depends on local ground elevation. Try again when the USGS terrain service is available.</p>';
  }
}
positionAircraft();
