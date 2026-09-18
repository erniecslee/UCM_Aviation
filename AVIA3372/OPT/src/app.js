import { attachAirportAutocomplete } from "./airports.js";
import {
  pressureAltitudeFt,
  densityAltitudeFt,
  resolveWindComponents,
  dispatchFactoredHeadwindKt,
  formatWind,
  parseWindGroup,
  parseTempInput,
  tempConversionLabel,
  parseQnhInput,
  qnhConversionLabel,
  qnhOwnLabel,
  parseWeightInput,
  weightConversionLabel,
  weightOwnLabel,
  kgToLb,
  qnhToInHg,
  checkInputRanges,
} from "./atmos.js";
import { takeoffPerformance, landingPerformance } from "./performance.js";
import { buildRunwaySVG } from "./rwyGraphic.js";

// ---- bottom tab switching ----
// Real OPT has 4 bottom tabs but only 2 underlying screens (Takeoff/Landing);
// "Dispatch" vs "All Engine"/"Enroute" is a MODE within each screen, not a
// separate form — mode changes which wind component feeds the calc engine
// (see dispatchFactoredHeadwindKt) and the header's mode label.
const mode = { takeoff: "dispatch", landing: "enroute" };

function applyTabVisual() {
  document.querySelectorAll(".bottom-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === activePhase && b.dataset.mode === mode[b.dataset.tab]);
  });
}

let activePhase = "takeoff";

document.querySelectorAll(".bottom-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    activePhase = btn.dataset.tab;
    mode[activePhase] = btn.dataset.mode;
    document.querySelectorAll(".opt-panel").forEach((p) => p.classList.remove("active"));
    document.getElementById(`panel-${activePhase}`).classList.add("active");
    document.getElementById(`${activePhase === "takeoff" ? "to" : "ld"}-mode-label`).textContent = btn.dataset.header;
    applyTabVisual();
  });
});
applyTabVisual();

// ---- airport autocomplete ----
const toAC = attachAirportAutocomplete({
  inputEl: document.getElementById("to-airport"),
  listEl: document.getElementById("to-airport-list"),
  runwaySelectEl: document.getElementById("to-runway"),
});
const ldAC = attachAirportAutocomplete({
  inputEl: document.getElementById("ld-airport"),
  listEl: document.getElementById("ld-airport-list"),
  runwaySelectEl: document.getElementById("ld-runway"),
});

function setText(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = val == null || val === "" ? "—" : val;
}

// ---- live OAT/QNH/WIND sub-label conversions (mirrors the real OPT: type in
// either unit, the small text below shows the other one, live as you type) ----
function wireTempField(inputId, subId) {
  const input = document.getElementById(inputId);
  const sub = document.getElementById(subId);
  const update = () => {
    const { valueC, unit } = parseTempInput(input.value);
    sub.textContent = valueC != null ? tempConversionLabel(valueC, unit) : " ";
  };
  input.addEventListener("input", update);
  update();
}

function wireQnhField(inputId, subId) {
  const input = document.getElementById(inputId);
  const sub = document.getElementById(subId);
  const update = () => {
    const { hPa, unit } = parseQnhInput(input.value);
    sub.textContent = hPa != null ? qnhConversionLabel(hPa, unit) : " ";
  };
  input.addEventListener("input", update);
  input.addEventListener("blur", () => {
    const { hPa, unit } = parseQnhInput(input.value);
    if (hPa != null) input.value = qnhOwnLabel(hPa, unit);
  });
  update();
}

function wireWindField(inputId, subId, runwayHeadingGetter) {
  const input = document.getElementById(inputId);
  const sub = document.getElementById(subId);
  const update = () => {
    const parsed = parseWindGroup(input.value);
    const heading = runwayHeadingGetter();
    if (parsed.headwindKt == null && (parsed.dir == null || heading == null)) {
      sub.textContent = " ";
      return;
    }
    sub.textContent = formatWind(resolveWindComponents(parsed, heading));
  };
  input.addEventListener("input", update);
  return update;
}

function wireWeightField(inputId, subId) {
  const input = document.getElementById(inputId);
  const sub = document.getElementById(subId);
  const update = () => {
    const { valueKg, unit } = parseWeightInput(input.value);
    sub.textContent = valueKg != null ? weightConversionLabel(valueKg, unit) : " ";
  };
  input.addEventListener("input", update);
  input.addEventListener("blur", () => {
    const { valueKg, unit } = parseWeightInput(input.value);
    if (valueKg != null) input.value = weightOwnLabel(valueKg, unit);
  });
  update();
}

wireTempField("to-oat", "to-oat-sub");
wireTempField("ld-oat", "ld-oat-sub");
wireQnhField("to-qnh", "to-qnh-sub");
wireQnhField("ld-qnh", "ld-qnh-sub");
wireWeightField("to-weight", "to-weight-sub");
wireWeightField("ld-weight", "ld-weight-sub");
const updateToWindSub = wireWindField("to-wind", "to-wind-sub", () => toAC.getRunway(toAC.getSelected(), document.getElementById("to-runway").value)?.heading_deg_true ?? null);
const updateLdWindSub = wireWindField("ld-wind", "ld-wind-sub", () => ldAC.getRunway(ldAC.getSelected(), document.getElementById("ld-runway").value)?.heading_deg_true ?? null);
document.getElementById("to-runway").addEventListener("change", updateToWindSub);
document.getElementById("ld-runway").addEventListener("change", updateLdWindSub);

// ---- "Calculation in Progress" overlay, mirrors the real OPT's async feel ----
async function runWithCalcOverlay(work) {
  const overlay = document.getElementById("calc-overlay");
  const bar = document.getElementById("calc-bar-fill");
  overlay.hidden = false;
  bar.style.width = "0%";
  requestAnimationFrame(() => {
    bar.style.width = "85%";
  });
  const minDelay = new Promise((r) => setTimeout(r, 650));
  const [result] = await Promise.all([work(), minDelay]);
  bar.style.width = "100%";
  await new Promise((r) => setTimeout(r, 120));
  overlay.hidden = true;
  return result;
}

// ---- runway graphic toggles (redraw from last-known data) ----
let lastToGraphic = null;
let lastLdGraphic = null;

function renderGraphic(containerId, data) {
  const el = document.getElementById(containerId);
  if (!data) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = buildRunwaySVG(data);
}

document.getElementById("to-graphic-toggle").addEventListener("change", (e) => {
  const box = document.getElementById("to-rwy-graphic");
  box.hidden = !e.target.checked;
  if (e.target.checked) renderGraphic("to-rwy-graphic", lastToGraphic);
});
document.getElementById("ld-graphic-toggle").addEventListener("change", (e) => {
  const box = document.getElementById("ld-rwy-graphic");
  box.hidden = !e.target.checked;
  if (e.target.checked) renderGraphic("ld-rwy-graphic", lastLdGraphic);
});

// ---- TAKEOFF ----
document.getElementById("to-calc").addEventListener("click", async () => {
  const airport = toAC.getSelected();
  const rwyId = document.getElementById("to-runway").value;
  const runway = airport ? toAC.getRunway(airport, rwyId) : null;

  const windParsed = parseWindGroup(document.getElementById("to-wind").value);
  const { valueC: oat } = parseTempInput(document.getElementById("to-oat").value);
  const { hPa: qnh } = parseQnhInput(document.getElementById("to-qnh").value);
  const { valueKg: weight } = parseWeightInput(document.getElementById("to-weight").value);
  // FLAP=OPTIMUM is resolved inside computeTakeoff (searches Flaps 5/10/15/25
  // ascending for the lowest legal one) — passed straight through here.
  const flap = document.getElementById("to-flap").value;
  const cg = parseFloat(document.getElementById("to-cg").value);
  const cond = parseInt(document.getElementById("to-cond").value, 10);
  const packs = document.getElementById("to-packs").value;
  const antiice = document.getElementById("to-antiice").value;
  const atm = document.getElementById("to-atm").value;
  const rev = document.getElementById("to-rev").value;
  const rtg = document.getElementById("to-rtg").value;

  const results = document.getElementById("to-results");
  const hint = document.getElementById("to-hint");
  if (!airport || !runway) {
    results.hidden = false;
    hint.closest("details").open = true;
    hint.textContent = "Select an airport and runway first.";
    return;
  }
  if (oat == null || qnh == null) {
    results.hidden = false;
    hint.closest("details").open = true;
    hint.textContent = 'OAT / QNH format not recognized — use something like "15C", "59F", "1013", or "29.92".';
    return;
  }

  const pAlt = pressureAltitudeFt(airport.elevation_ft ?? 0, qnh);
  const dAlt = densityAltitudeFt(pAlt, oat);
  const wind = resolveWindComponents(windParsed, runway.heading_deg_true);
  const rangeWarnings = checkInputRanges({
    oatC: oat,
    cgPct: cg,
    qnhInHg: qnhToInHg(qnh),
    windDir: windParsed.dir,
    windSpeedKt: windParsed.speedKt,
    headwindKt: wind.headwindKt,
    crosswindKt: wind.crosswindKt,
    weightKg: weight,
  });
  const isDispatch = mode.takeoff === "dispatch";
  const usedHeadwindKt = isDispatch ? dispatchFactoredHeadwindKt(wind.headwindKt ?? 0) : wind.headwindKt ?? 0;

  const perf = await runWithCalcOverlay(() =>
    takeoffPerformance({
      runway,
      oatC: oat,
      pAltFt: pAlt,
      weightKg: weight,
      flap,
      cond,
      packs,
      antiice,
      headwindKt: usedHeadwindKt,
      cgPct: cg,
      atm,
      rev,
      rtg,
    })
  );

  results.hidden = false;
  document.getElementById("to-exceed-banner").hidden = !perf.overweight;
  const toRangeBanner = document.getElementById("to-range-banner");
  toRangeBanner.hidden = rangeWarnings.length === 0;
  toRangeBanner.textContent = rangeWarnings.join("\n");
  setText("out-flap", perf.flap ?? flap);
  setText("out-accelht", "1000 ft AGL*");
  setText("out-trim", perf.trim);
  setText("out-rwyintx", runway ? `${rwyId}/ALL` : null);
  setText("out-mtow-actual", weight ? `${Math.round(kgToLb(weight))} lb` : null);
  const n1Label = { TO: "D-TO (26K)", "TO-1": "D-TO1 (24K)", "TO-2": "D-TO2 (22K)" }[perf.rating] ?? "%N1";
  setText("out-n1label", n1Label);
  setText("out-n1only", perf.n1Pct != null ? `${perf.n1Pct}` : null);
  setText("out-seltemp", perf.selTemp != null ? `${perf.selTemp}°C` : perf.n1Pct != null ? "FULL" : null);
  setText("out-v1", perf.v1 != null ? `${perf.v1} kt` : null);
  setText("out-vr", perf.vr != null ? `${perf.vr} kt` : null);
  setText("out-v2", perf.v2 != null ? `${perf.v2} kt` : null);
  setText("out-vref40", perf.vref40 != null ? `${perf.vref40} kt` : null);

  const ratingTag = { TO: "26K", "TO-1": "24K", "TO-2": "22K" }[perf.rating] ?? perf.rating ?? "";
  document.getElementById("to-watermark").textContent = `${ratingTag} ${perf.selTemp != null ? `ATM ${perf.selTemp}°C` : "FULL"}`.trim();

  lastToGraphic = {
    lengthFt: runway.length_ft,
    windDir: windParsed.dir,
    windSpeedKt: windParsed.speedKt,
    runwayHeadingTrue: runway.heading_deg_true,
  };
  if (!document.getElementById("to-graphic-toggle").checked) {
    document.getElementById("to-rwy-graphic").hidden = true;
  } else {
    renderGraphic("to-rwy-graphic", lastToGraphic);
  }

  const flapNote = flap === "OPTIMUM" ? `FLAP=OPTIMUM resolved to Flap ${perf.flap} (lowest flap setting legal at this weight).` : "";
  const windNote = isDispatch
    ? `Dispatch wind factoring applied (50% headwind / 150% tailwind credit): used ${usedHeadwindKt.toFixed(1)} kt vs reported ${(wind.headwindKt ?? 0).toFixed(1)} kt.`
    : "All Engine mode: using reported wind directly (no dispatch factoring).";
  const warnings = perf.warnings || [];
  hint.textContent = `ACCEL HT is a standard 1000ft AGL assumption (no obstacle survey data to compute an obstacle-driven value). Pressure Alt ${Math.round(pAlt)} ft · Density Alt ${Math.round(dAlt)} ft · TORA ${runway.length_ft} ft. ${flapNote} ${windNote} ${warnings.join(" ")}`;
});

// ---- LANDING ----
document.getElementById("ld-calc").addEventListener("click", async () => {
  const airport = ldAC.getSelected();
  const rwyId = document.getElementById("ld-runway").value;
  const runway = airport ? ldAC.getRunway(airport, rwyId) : null;

  const windParsed = parseWindGroup(document.getElementById("ld-wind").value);
  const { valueC: oat } = parseTempInput(document.getElementById("ld-oat").value);
  const { hPa: qnh } = parseQnhInput(document.getElementById("ld-qnh").value);
  const { valueKg: weight } = parseWeightInput(document.getElementById("ld-weight").value);
  const flap = document.getElementById("ld-flap").value;
  const cond = parseInt(document.getElementById("ld-cond").value, 10);
  const ab = document.getElementById("ld-ab").value;
  const rev = document.getElementById("ld-rev").value;
  const packs = document.getElementById("ld-packs").value;
  const antiice = document.getElementById("ld-antiice").value;
  const nnc = document.getElementById("ld-nnc").value;
  const vrefAddKt = parseFloat(document.getElementById("ld-vrefadd").value);

  const results = document.getElementById("ld-results");
  const hint = document.getElementById("ld-hint");
  if (!airport || !runway) {
    results.hidden = false;
    hint.closest("details").open = true;
    hint.textContent = "Select an airport and runway first.";
    return;
  }
  if (oat == null || qnh == null) {
    results.hidden = false;
    hint.closest("details").open = true;
    hint.textContent = 'OAT / QNH format not recognized — use something like "15C", "59F", "1013", or "29.92".';
    return;
  }

  const pAlt = pressureAltitudeFt(airport.elevation_ft ?? 0, qnh);
  const wind = resolveWindComponents(windParsed, runway.heading_deg_true);
  const rangeWarnings = checkInputRanges({
    oatC: oat,
    cgPct: null,
    qnhInHg: qnhToInHg(qnh),
    windDir: windParsed.dir,
    windSpeedKt: windParsed.speedKt,
    headwindKt: wind.headwindKt,
    crosswindKt: wind.crosswindKt,
    weightKg: weight,
  });
  const isDispatch = mode.landing === "dispatch";
  const usedHeadwindKt = isDispatch ? dispatchFactoredHeadwindKt(wind.headwindKt ?? 0) : wind.headwindKt ?? 0;

  const perf = await runWithCalcOverlay(() =>
    landingPerformance({
      runway,
      oatC: oat,
      pAltFt: pAlt,
      weightKg: weight,
      flap,
      cond,
      ab,
      rev,
      packs,
      antiice,
      nnc,
      vrefAddKt,
      headwindKt: usedHeadwindKt,
    })
  );

  results.hidden = false;
  const ldRangeBanner = document.getElementById("ld-range-banner");
  ldRangeBanner.hidden = rangeWarnings.length === 0;
  ldRangeBanner.textContent = rangeWarnings.join("\n");
  document.getElementById("out-brk-heading").textContent =
    nnc !== "NONE" ? `Landing Distance — NNC: ${nnc}` : "Operational Landing Distance:";
  setText("out-ldgwt-header", weight ? `${Math.round(kgToLb(weight))} LB` : null);
  setText("out-vref-flap", flap);
  setText("out-vref-add", perf.vrefAddKt != null ? `${perf.vrefAddKt}` : null);
  setText("out-vapp-big", perf.vapp != null ? `${perf.vapp}` : null);

  const lda = runway.length_ft ?? null;
  setText("out-lda", lda != null ? `${Math.round(lda)} ft` : null);

  const landingDistFt = perf.landingDistanceM != null ? perf.landingDistanceM / 0.3048 : null;
  const brakeRows = perf.allBrakeDistancesM || [];
  for (let i = 0; i < 5; i++) {
    const row = brakeRows[i];
    const rowEl = document.getElementById(`out-brk-value-${i}`).closest(".ldg-row");
    if (!row) {
      rowEl.hidden = true;
      continue;
    }
    rowEl.hidden = false;
    rowEl.classList.toggle("amber", row.label.startsWith("AUTO") && !row.label.startsWith("MAX"));
    setText(`out-brk-label-${i}`, row.label);
    const ft = row.distanceM != null ? row.distanceM / 0.3048 : null;
    setText(`out-brk-value-${i}`, ft != null ? `${Math.round(ft)} ft` : null);
  }

  const coolKeys = ["maxManual", "auto1", "auto2", "auto3", "maxAuto"];
  const coolLabels = { maxManual: "MAX MANUAL", auto1: "AUTO 1", auto2: "AUTO 2", auto3: "AUTO 3", maxAuto: "MAX AUTO" };
  for (let i = 0; i < 5; i++) {
    const key = coolKeys[i];
    const row = (perf.brakeCooling || []).find((r) => r.key === key);
    const rowEl = document.getElementById(`out-cool-label-${i}`).closest(".ldg-cool-row");
    if (!row) {
      rowEl.hidden = true;
      continue;
    }
    rowEl.hidden = false;
    const needsCooling = typeof row.groundMin === "number" || typeof row.inflightMin === "number";
    rowEl.classList.toggle("amber", needsCooling);
    setText(`out-cool-label-${i}`, coolLabels[key]);
    setText(`out-cool-ground-${i}`, row.groundMin != null ? `${row.groundMin}${typeof row.groundMin === "number" ? " min" : ""}` : null);
    setText(`out-cool-inflight-${i}`, row.inflightMin != null ? `${row.inflightMin}${typeof row.inflightMin === "number" ? " min" : ""}` : null);
  }

  lastLdGraphic = {
    lengthFt: runway.length_ft,
    windDir: windParsed.dir,
    windSpeedKt: windParsed.speedKt,
    runwayHeadingTrue: runway.heading_deg_true,
    markerFt: landingDistFt,
    markerLabel: landingDistFt != null ? `Stop ${Math.round(landingDistFt)} ft` : null,
  };
  if (!document.getElementById("ld-graphic-toggle").checked) {
    document.getElementById("ld-rwy-graphic").hidden = true;
  } else {
    renderGraphic("ld-rwy-graphic", lastLdGraphic);
  }

  const marginNote =
    lda != null && landingDistFt != null ? `LDA ${Math.round(lda)} ft · margin ${Math.round(lda - landingDistFt)} ft.` : "";
  const windNote = isDispatch
    ? `Dispatch wind factoring applied (50% headwind / 150% tailwind credit): used ${usedHeadwindKt.toFixed(1)} kt vs reported ${(wind.headwindKt ?? 0).toFixed(1)} kt.`
    : "Enroute mode: using reported wind directly (no dispatch factoring).";
  hint.textContent = `${marginNote} ${windNote} ${(perf.warnings || []).join(" ")}`;
});
