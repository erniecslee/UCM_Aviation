// Physics/geometry helpers that don't depend on Boeing chart data.
// NOTE: runway headings from the airport dataset are TRUE; wind direction entered
// here is treated as the same frame for now (no magnetic-variation model yet).
// This is a known simplification — flagged in the UI hint text.

const HPA_PER_INHG = 33.8639;
const ISA_LAPSE_C_PER_1000FT = 1.98;

export function qnhToInHg(qnhHpa) {
  return qnhHpa / HPA_PER_INHG;
}

export function pressureAltitudeFt(fieldElevationFt, qnhHpa) {
  const inHg = qnhToInHg(qnhHpa);
  return fieldElevationFt + (29.92 - inHg) * 1000;
}

export function isaTempAt(pressureAltFt) {
  return 15 - ISA_LAPSE_C_PER_1000FT * (pressureAltFt / 1000);
}

export function isaDeviation(oatC, pressureAltFt) {
  return oatC - isaTempAt(pressureAltFt);
}

export function densityAltitudeFt(pressureAltFt, oatC) {
  return pressureAltFt + 118.8 * isaDeviation(oatC, pressureAltFt);
}

/**
 * @param windDir degrees, direction wind is coming FROM
 * @param windSpeedKt knots
 * @param runwayHeadingTrue degrees, direction the runway points (landing/takeoff heading)
 * @returns {headwindKt, crosswindKt, crosswindDir: 'L'|'R'|null}
 */
export function windComponents(windDir, windSpeedKt, runwayHeadingTrue) {
  if (windDir == null || windSpeedKt == null || runwayHeadingTrue == null) {
    return { headwindKt: null, crosswindKt: null, crosswindDir: null };
  }
  const angleRad = ((windDir - runwayHeadingTrue) * Math.PI) / 180;
  const headwindKt = windSpeedKt * Math.cos(angleRad);
  const crosswindRaw = windSpeedKt * Math.sin(angleRad);
  return {
    headwindKt: Math.round(headwindKt * 10) / 10,
    crosswindKt: Math.round(Math.abs(crosswindRaw) * 10) / 10,
    crosswindDir: crosswindRaw === 0 ? null : crosswindRaw > 0 ? "R" : "L",
  };
}

/**
 * Regulatory dispatch wind-factoring rule (14 CFR 121.195 / AC 25-7 method):
 * for a DISPATCH performance decision, use no more than 50% of a reported
 * headwind and no less than 150% of a reported tailwind — a conservative
 * margin against forecast-vs-actual wind error. The "All Engine"/"Enroute"
 * tabs use the actual reported wind directly (100%), matching real-time
 * inflight replanning rather than a dispatch release.
 */
export function dispatchFactoredHeadwindKt(headwindKt) {
  if (headwindKt == null) return null;
  return headwindKt >= 0 ? headwindKt * 0.5 : headwindKt * 1.5;
}

// --- Input-range guard rails ---
// Not performance-engine logic — just sanity bounds so a typo or wildly
// out-of-envelope entry gets a visible flag instead of silently clamping (for
// OAT/CG, which feed FCOM chart lookups that already clamp at their edges —
// see interp.js) or silently producing a physically nonsensical result (QNH/
// wind/weight, which aren't chart-axis-bound at all). Thresholds, confirmed
// with the instructor:
//  - OAT/CG: the real published axis range of the FCOM charts already loaded
//    (field/climb chart OAT axis; stab-trim chart CG axis) — not invented.
//  - QNH/wind/weight-floor: standard operational sanity bands, not FCOM
//    numbers (no such table was transcribed for this generic manual).
export const OAT_MIN_C = -40;
export const OAT_MAX_C = 50;
export const CG_MIN_PCT = 6;
export const CG_MAX_PCT = 36;
export const QNH_MIN_INHG = 28;
export const QNH_MAX_INHG = 31;
export const TAILWIND_LIMIT_KT = 15;
export const CROSSWIND_LIMIT_KT = 33;
export const WIND_SPEED_MAX_KT = 100;
// ~91,300 lb — Boeing 737-800's commonly published Operating/Basic Empty
// Weight (varies slightly by winglet/interior config; used here only as a
// sanity floor, not this specific airframe's certified BEW).
export const BASIC_EMPTY_WEIGHT_KG = 41413;

/** Returns an array of short warning strings for any input outside its guard
 * rail. Pass `null` for a field that doesn't apply (e.g. `cgPct` on the
 * landing panel, which has no CG input). */
export function checkInputRanges({ oatC, cgPct, qnhInHg, windDir, windSpeedKt, headwindKt, crosswindKt, weightKg }) {
  const warnings = [];
  if (oatC != null && (oatC < OAT_MIN_C || oatC > OAT_MAX_C)) {
    warnings.push(`OAT OUT OF CHART RANGE (${OAT_MIN_C}°C to ${OAT_MAX_C}°C)`);
  }
  if (cgPct != null && (cgPct < CG_MIN_PCT || cgPct > CG_MAX_PCT)) {
    warnings.push(`CG OUT OF CHART RANGE (${CG_MIN_PCT}% to ${CG_MAX_PCT}% MAC)`);
  }
  if (qnhInHg != null && (qnhInHg < QNH_MIN_INHG || qnhInHg > QNH_MAX_INHG)) {
    warnings.push(`QNH OUT OF RANGE (${QNH_MIN_INHG.toFixed(2)}–${QNH_MAX_INHG.toFixed(2)} inHg)`);
  }
  if (windDir != null && (windDir < 0 || windDir > 360)) {
    warnings.push("WIND DIRECTION INVALID (0–360°)");
  }
  if (windSpeedKt != null && windSpeedKt > WIND_SPEED_MAX_KT) {
    warnings.push(`REPORTED WIND SPEED UNREALISTIC (>${WIND_SPEED_MAX_KT} kt)`);
  }
  if (headwindKt != null && headwindKt < -TAILWIND_LIMIT_KT) {
    warnings.push(`TAILWIND EXCEEDS LIMIT (>${TAILWIND_LIMIT_KT} kt)`);
  }
  if (crosswindKt != null && crosswindKt > CROSSWIND_LIMIT_KT) {
    warnings.push(`CROSSWIND EXCEEDS LIMIT (>${CROSSWIND_LIMIT_KT} kt)`);
  }
  if (weightKg != null && weightKg < BASIC_EMPTY_WEIGHT_KG) {
    warnings.push(`WEIGHT BELOW BASIC EMPTY WEIGHT (~${Math.round(kgToLb(BASIC_EMPTY_WEIGHT_KG)).toLocaleString()} lb)`);
  }
  return warnings;
}

export function formatWind({ headwindKt, crosswindKt, crosswindDir }) {
  if (headwindKt == null) return "—";
  const hw = headwindKt >= 0 ? `HW ${headwindKt.toFixed(1)}` : `TW ${Math.abs(headwindKt).toFixed(1)}`;
  const xw = crosswindKt ? `  XW ${crosswindKt.toFixed(1)}${crosswindDir || ""}` : "";
  return `${hw} kt${xw}`;
}

/** Free-text WIND entry, two accepted forms:
 *  - METAR-style "DIR/SPEED" (e.g. "030/20"), as flown/typed by the pilot —
 *    matches the source Excel's WIND field (e.g. "320/8") rather than
 *    separate direction/speed boxes. Resolved against the runway heading.
 *  - A plain signed number (e.g. "10", "-10") entered directly as the
 *    headwind/tailwind component in knots — positive is headwind, negative
 *    is tailwind — for when the component is already known and there's no
 *    need to work it out from a reported direction/speed. No crosswind or
 *    runway heading involved in this form (crosswindKt is 0).
 * Returns `{dir, speedKt}` for the first form or `{headwindKt, crosswindKt}`
 * for the second; unset fields are null. Feed the result to
 * `resolveWindComponents` rather than branching on which form was used. */
export function parseWindGroup(text) {
  if (!text) return { dir: null, speedKt: null, headwindKt: null, crosswindKt: null };
  const trimmed = String(text).trim();
  const group = trimmed.match(/^(\d{1,3})\s*\/\s*(\d{1,3}(?:\.\d+)?)$/);
  if (group) return { dir: parseFloat(group[1]), speedKt: parseFloat(group[2]), headwindKt: null, crosswindKt: null };
  const component = trimmed.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (component) return { dir: null, speedKt: null, headwindKt: parseFloat(component[1]), crosswindKt: 0 };
  return { dir: null, speedKt: null, headwindKt: null, crosswindKt: null };
}

/** Combines a `parseWindGroup` result with the runway heading into
 * {headwindKt, crosswindKt, crosswindDir} — a direct headwind-component
 * entry bypasses `windComponents`/the runway heading entirely (there's no
 * direction to resolve), while a DIR/SPEED entry is resolved as before. */
export function resolveWindComponents(parsedWind, runwayHeadingTrue) {
  if (parsedWind.headwindKt != null) {
    return { headwindKt: parsedWind.headwindKt, crosswindKt: parsedWind.crosswindKt ?? 0, crosswindDir: null };
  }
  return windComponents(parsedWind.dir, parsedWind.speedKt, runwayHeadingTrue);
}

/** OAT entered as e.g. "15", "15C", "59F" — defaults to Celsius with no
 * suffix. Returns the value in Celsius plus the original unit for the
 * live conversion sub-label (mirrors the real OPT's C/F auto-conversion). */
export function parseTempInput(text) {
  if (!text) return { valueC: null, unit: null };
  const m = String(text).trim().match(/^(-?\d+(?:\.\d+)?)\s*([CFcf])?$/);
  if (!m) return { valueC: null, unit: null };
  const raw = parseFloat(m[1]);
  const unit = (m[2] || "C").toUpperCase();
  const valueC = unit === "F" ? ((raw - 32) * 5) / 9 : raw;
  return { valueC, unit };
}

export function tempConversionLabel(valueC, unit) {
  if (valueC == null) return "";
  if (unit === "F") return `${Math.round(valueC * 10) / 10} C`;
  return `${Math.round(((valueC * 9) / 5 + 32) * 10) / 10} F`;
}

/** QNH entered as hPa (e.g. "1013") or inHg, either as a decimal ("30.10")
 * or as the 4-digit shorthand pilots actually say/type on a Kollsman window
 * or ATIS ("2992" meaning 29.92) — auto-detected by magnitude and format,
 * same convention altimeter settings use in practice. hPa realistically
 * runs ~870-1085; inHg runs ~25.5-32.0 (or "2550"-"3200" as the shorthand),
 * and those ranges never overlap so the split is unambiguous. */
export function parseQnhInput(text) {
  if (!text) return { hPa: null, unit: null };
  const raw = parseFloat(text);
  if (Number.isNaN(raw)) return { hPa: null, unit: null };
  const hasDecimal = String(text).includes(".");
  if (hasDecimal) {
    if (raw < 100) return { hPa: raw * HPA_PER_INHG, unit: "inHg" };
    return { hPa: raw, unit: "hPa" };
  }
  if (raw >= 2500 && raw <= 3300) return { hPa: (raw / 100) * HPA_PER_INHG, unit: "inHg" };
  return { hPa: raw, unit: "hPa" };
}

export function qnhConversionLabel(hPa, unit) {
  if (hPa == null) return "";
  if (unit === "inHg") return `${Math.round(hPa * 10) / 10} hPa`;
  return `${Math.round(qnhToInHg(hPa) * 100) / 100} in Hg`;
}

/** How the QNH field should re-display itself after the pilot finishes
 * typing (on blur) — the value in whichever unit was actually entered, with
 * the unit spelled out, so "2992" becomes "29.92 inHg" right in the box
 * instead of only in the small conversion sub-label. */
export function qnhOwnLabel(hPa, unit) {
  if (hPa == null) return "";
  if (unit === "inHg") return `${(Math.round(qnhToInHg(hPa) * 100) / 100).toFixed(2)} inHg`;
  return `${Math.round(hPa)} hPa`;
}

const KG_PER_LB = 0.45359237;

/** Weight entered as e.g. "143300", "143.3", "120", "65000 KG" — defaults to
 * LB with no suffix, since this tool is for US-trained students (the source
 * Excel's own CONFIG!C31 toggle defaults US ops to LBS too). A number under
 * 1000 is shorthand for thousands (typed "120" -> 120,000 lb), matching how
 * dispatch weights are commonly spoken/written in "1000 LB" units. */
export function parseWeightInput(text) {
  if (!text) return { valueKg: null, unit: null };
  const m = String(text).trim().match(/^(\d+(?:\.\d+)?)\s*(KG|KGS|LB|LBS)?$/i);
  if (!m) return { valueKg: null, unit: null };
  let raw = parseFloat(m[1]);
  if (raw < 1000) raw *= 1000;
  const unit = (m[2] || "LB").toUpperCase().startsWith("KG") ? "KG" : "LB";
  const valueKg = unit === "LB" ? raw * KG_PER_LB : raw;
  return { valueKg, unit };
}

export function kgToLb(kg) {
  return kg / KG_PER_LB;
}

export function weightConversionLabel(valueKg, unit) {
  if (valueKg == null) return "";
  if (unit === "LB") return `${Math.round(valueKg)} kg`;
  return `${Math.round(valueKg / KG_PER_LB)} lb`;
}

/** How the weight field should re-display itself after the pilot finishes
 * typing (on blur) — the resolved value (post thousands-shorthand) in
 * whichever unit was actually entered, with the unit spelled out inline,
 * matching how OAT already shows "15C" right in the box. */
export function weightOwnLabel(valueKg, unit) {
  if (valueKg == null) return "";
  if (unit === "LB") return `${Math.round(kgToLb(valueKg))} lb`;
  return `${Math.round(valueKg)} kg`;
}
