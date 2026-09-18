// B737-800/CFM56-7B26 takeoff performance, computed from transcribed FCOM
// Performance Dispatch (field/climb/obstacle limit weight, pp.609-654) and
// Performance Inflight (V-speeds, assumed-temp/%N1, stab trim, pp.1051-1180)
// tables. See data/processed/performance/_schema.md for the table shapes.
//
// Known, intentional scope limits (documented, not silently hidden):
// - Field/climb limit weight charts only exist for Flaps 5 (that's what Boeing
//   publishes for this airframe/engine combo) — other flap settings get an
//   *estimated* limit weight instead (see the FLAP/OPTIMUM comment block
//   below), never a real FCOM-chart number.
// - No tire-speed or brake-energy limit tables exist for this config in FCOM
//   (Boeing omits them when they're never limiting) — never fabricated here.
// - No obstacle survey data exists per-runway in the US airport dataset, so
//   the obstacle limit is reported as "not evaluated", not silently ignored.
// - Runway slope is assumed 0% (not in the airport/runway dataset).
// - TO-1 (24K)/TO-2 (22K) derated thrust ratings ARE modeled (V-speeds/%N1/
//   assumed-temp, transcribed from FCOM), but their field/climb limit weight
//   is an approximation — see the RTG/OPTIMUM comment block below for why.

import { lookup1D, lookup2D, findBracket } from "../interp.js";
import { toAscending1D, toAscending2D } from "../tables.js";
import { parseFraction, formatQuarter } from "../frac.js";

const MAX_STRUCTURAL_TOW_KG = 86100; // table plateau value for this 737-800W/CFM56-7B26 config, FCOM PD.30.2-30.4

const FT_PER_M = 3.28084;

function norm2D(rowAxis, colAxis, data) {
  return toAscending2D(rowAxis, colAxis, data);
}

function lookupAcrossAltBlocks(blocks, altFt, evalBlock) {
  const sorted = [...blocks].sort((a, b) => a.pressure_alt_ft - b.pressure_alt_ft);
  const xs = sorted.map((b) => b.pressure_alt_ft);
  const { lo, hi, frac, clamped } = findBracket(xs, altFt);
  const a = evalBlock(sorted[lo]);
  if (lo === hi) return { value: a.value, clamped: a.clamped || clamped, hasNulls: a.hasNulls };
  const b = evalBlock(sorted[hi]);
  const value = a.value == null || b.value == null ? a.value ?? b.value : a.value + (b.value - a.value) * frac;
  return { value, clamped: a.clamped || b.clamped || clamped, hasNulls: a.hasNulls || b.hasNulls };
}

function fieldLimitAt(blocks, altFt, fieldLengthM, oatC) {
  return lookupAcrossAltBlocks(blocks, altFt, (block) => {
    const t = norm2D(block.row_axis, block.col_axis, block.field_limit.data);
    return lookup2D(t, fieldLengthM, oatC);
  });
}

function climbLimitAt(blocks, altFt, oatC) {
  return lookupAcrossAltBlocks(blocks, altFt, (block) => {
    const t = toAscending1D(block.climb_limit.row_axis, block.climb_limit.data);
    return lookup1D(t.values, t.data, oatC);
  });
}

function correctedFieldLengthM(adjustments, rawFieldLengthM, slopePct, headwindKt, isWet) {
  const block = adjustments.field_length_corrections.find((b) => b.runway === (isWet ? "Wet" : "Dry"));
  const slopeT = norm2D(block.slope_correction.row_axis, block.slope_correction.col_axis, block.slope_correction.data);
  const afterSlope = lookup2D(slopeT, rawFieldLengthM, slopePct).value;
  const windT = norm2D(block.wind_correction.row_axis, block.wind_correction.col_axis, block.wind_correction.data);
  return lookup2D(windT, afterSlope, headwindKt).value;
}

function deltasFor(adjustments, isWet, packs, antiice) {
  const block = adjustments.field_and_climb_limit_weight_deltas.find((b) => b.runway === (isWet ? "Wet" : "Dry"));
  let fieldKg = 0;
  let climbKg = 0;
  const byCondition = Object.fromEntries(block.deltas.map((d) => [d.condition, d]));
  if (packs === "OFF") {
    fieldKg += byCondition.packs_off.field_limit_wt_kg;
    climbKg += byCondition.packs_off.climb_limit_wt_kg;
  }
  if (antiice === "ENG") {
    fieldKg += byCondition.engine_anti_ice_on.field_limit_wt_kg;
    climbKg += byCondition.engine_anti_ice_on.climb_limit_wt_kg;
  } else if (antiice === "ENG+WING") {
    const k = "engine_and_wing_anti_ice_on_optional_system";
    fieldKg += byCondition[k].field_limit_wt_kg;
    climbKg += byCondition[k].climb_limit_wt_kg;
  }
  return { fieldKg, climbKg };
}

/** Field+climb limit weight (kg) at a given OAT — reused both for the actual
 * OAT and, during assumed-temp search, for hypothetical higher "OAT"s. */
function limitWeightKgAtTemp(dataset, adjustments, altFt, fieldLengthM, oatC, isWet, packs, antiice) {
  const field = fieldLimitAt(dataset, altFt, fieldLengthM, oatC);
  const climb = climbLimitAt(dataset, altFt, oatC);
  const { fieldKg, climbKg } = deltasFor(adjustments, isWet, packs, antiice);
  const fieldTotal = field.value == null ? null : field.value * 1000 + fieldKg;
  const climbTotal = climb.value == null ? null : climb.value * 1000 + climbKg;
  const candidates = [MAX_STRUCTURAL_TOW_KG, fieldTotal, climbTotal].filter((v) => v != null);
  const value = Math.min(...candidates);
  let limitingItem = "Structural MTOW";
  if (value === fieldTotal) limitingItem = "Field length";
  else if (value === climbTotal) limitingItem = "Climb (2nd segment)";
  return { value, limitingItem, fieldTotal, climbTotal };
}

function vspeedTriple(vspeedTable, flap, weightKg) {
  const key = `flaps_${flap}`;
  const table = vspeedTable.max_takeoff_thrust_v1_vr_v2.by_flap[key];
  if (!table) return null;
  const asc = toAscending1D(table.row_axis, table.data);
  const weight1000 = weightKg / 1000;
  const { lo, hi, frac, clamped } = findBracket(asc.values, weight1000);
  const rowLo = asc.data[lo];
  const rowHi = asc.data[hi];
  if (!rowLo || !rowHi) return null;
  const vec = rowLo.map((v, i) => (v == null || rowHi[i] == null ? v ?? rowHi[i] : v + (rowHi[i] - v) * frac));
  if (vec.some((v) => v == null)) return null; // e.g. this flap/weight isn't certified/published for this rating
  return { v1: vec[0], vr: vec[1], v2: vec[2], clamped };
}

function tempAltAdjust(vspeedTable, oatC, pAltFt) {
  const t = vspeedTable.temp_press_alt_adjustment;
  const paK = pAltFt / 1000;
  const v1t = norm2D(t.row_axis, t.col_axis, t.v1_data);
  const vrt = norm2D(t.row_axis, t.col_axis, t.vr_data);
  const v2t = norm2D(t.row_axis, t.col_axis, t.v2_data);
  return {
    v1: lookup2D(v1t, oatC, paK).value ?? 0,
    vr: lookup2D(vrt, oatC, paK).value ?? 0,
    v2: lookup2D(v2t, oatC, paK).value ?? 0,
  };
}

function slopeWindV1Adjust(vspeedTable, weightKg, slopePct, headwindKt) {
  const t = vspeedTable.slope_wind_v1_adjustment;
  const weight1000 = weightKg / 1000;
  const slopeT = norm2D(t.row_axis, t.slope_col_axis, t.slope_data);
  const windT = norm2D(t.row_axis, t.wind_col_axis, t.wind_data);
  const slopeDelta = lookup2D(slopeT, weight1000, slopePct).value ?? 0;
  const windDelta = lookup2D(windT, weight1000, headwindKt).value ?? 0;
  return slopeDelta + windDelta;
}

function v1mcg(vspeedTable, oatC, pAltFt) {
  const t = vspeedTable.v1_mcg;
  const norm = norm2D(t.row_axis, t.col_axis, t.data);
  return lookup2D(norm, oatC, pAltFt).value;
}

// --- Contaminated runway (cond < WET) ---
// FCOM only publishes two contaminant-classification methods: a depth-based
// slush/standing-water table (3/6/13mm) and a reported-braking-action
// slippery-runway table (GOOD/MEDIUM/POOR). Neither maps 1:1 onto the UI's
// single 0-6 condition scale, so each condition code below is pinned to the
// FCOM scenario judged closest to it — a teaching approximation, not a
// precise contaminant-depth measurement. Documented here and surfaced via
// `limitingItem` so it's never presented as more precise than it is.
const CONTAMINATION_SCENARIOS = {
  4: { type: "slippery", key: "MEDIUM", label: "Compact Snow ≈ Medium braking" },
  3: { type: "slush", key: 13, label: "Standing Water (13mm)" },
  2: { type: "slush", key: 6, label: "Slush (6mm)" },
  1: { type: "slippery", key: "GOOD", label: "Dry Snow ≈ Good braking" },
  0: { type: "slippery", key: "POOR", label: "Wet Ice ≈ Poor braking" },
};

function lookupGrouped(table, groupField, groupValue, rowX, colX) {
  const group = table?.groups.find((g) => g[groupField] === groupValue);
  if (!group) return { value: null };
  return lookup2D(norm2D(group.row_axis, group.col_axis, group.data), rowX, colX);
}

function fieldLengthTempAdjM(tempAdjTable, scenario, oatC) {
  const diff = oatC - 4;
  let aboveRate, belowRate;
  if (scenario.type === "slush") {
    aboveRate = tempAdjTable.above_4c;
    belowRate = tempAdjTable.below_4c;
  } else {
    const p = scenario.key.toLowerCase();
    aboveRate = tempAdjTable[`${p}_above_4c`];
    belowRate = tempAdjTable[`${p}_below_4c`];
  }
  const rate = diff >= 0 ? aboveRate : belowRate;
  return (Math.abs(diff) / 5) * rate;
}

function computeContaminated({ contaminatedData, scenario, dryLimitKg, rawFieldLengthM, pAltFt, oatC, weightKg, rev }) {
  const scenarioTable = scenario.type === "slush" ? contaminatedData.slush_standing_water_takeoff : contaminatedData.slippery_runway_takeoff;
  const table = rev === "ONE INOP" ? scenarioTable.no_reverse_thrust : scenarioTable.maximum_reverse_thrust;
  const groupField = scenario.type === "slush" ? "slush_depth_mm" : "braking_action";

  const weightAdj = lookupGrouped(table.weight_adjustment_1000kg, groupField, scenario.key, dryLimitKg / 1000, pAltFt);
  const contamWeightKg = weightAdj.value != null ? dryLimitKg + weightAdj.value * 1000 : null;

  const adjustedFieldLengthM = rawFieldLengthM + fieldLengthTempAdjM(table.field_length_temp_adj_per_5c, scenario, oatC);
  const v1mcgWeight = lookupGrouped(table.v1_mcg_limit_weight_1000kg, groupField, scenario.key, adjustedFieldLengthM, pAltFt);
  const v1mcgWeightKg = v1mcgWeight.value != null ? v1mcgWeight.value * 1000 : null;

  let limitWeightKg = null;
  let limitingItem = null;
  let v1mcgLimited = false;
  if (v1mcgWeightKg != null && (contamWeightKg == null || v1mcgWeightKg < contamWeightKg)) {
    limitWeightKg = v1mcgWeightKg;
    limitingItem = `${scenario.label} (V1-MCG)`;
    v1mcgLimited = true;
  } else if (contamWeightKg != null) {
    limitWeightKg = contamWeightKg;
    limitingItem = `${scenario.label} (weight)`;
  }

  const v1Adj = lookupGrouped(table.v1_adjustment_kias, groupField, scenario.key, weightKg / 1000, pAltFt);

  return {
    limitWeightKg: limitWeightKg != null ? Math.round(limitWeightKg) : null,
    limitingItem,
    v1mcgLimited,
    v1AdjKt: v1Adj.value,
  };
}

function stabTrim(vrefTrimData, flap, weightKg, cgPct) {
  const group = ["1", "5"].includes(String(flap)) ? "Flaps 1 and 5" : "Flaps 10, 15 and 25";
  const table = vrefTrimData.stab_trim.find((t) => t.flap_group === group);
  if (!table) return null;
  const asc = toAscending2D(table.row_axis, table.col_axis, table.data.map((row) => row.map(parseFraction)));
  const { value } = lookup2D(asc, weightKg / 1000, cgPct);
  return formatQuarter(value);
}

// Vref40 at the current TOW is shown on the real tool's takeoff card as a
// quick-reference speed for an immediate return-to-land scenario — not part
// of the takeoff calculation itself, just a convenience lookup against the
// same landing Vref table used on the Landing panel.
function vref40At(vrefTrimData, weightKg) {
  const t = vrefTrimData.vref;
  const norm = norm2D(t.row_axis, t.col_axis, t.data);
  return lookup2D(norm, weightKg / 1000, 40).value;
}

function n1Full(n1Data, oatC, pAltFt, packs) {
  const t = norm2D(n1Data.takeoff_pct_n1.row_axis, n1Data.takeoff_pct_n1.col_axis, n1Data.takeoff_pct_n1.data);
  let n1 = lookup2D(t, oatC, pAltFt).value;
  if (packs === "OFF" && n1 != null) {
    const asc = toAscending1D(n1Data.packs_off_adjustment.row_axis, n1Data.packs_off_adjustment.data);
    n1 += lookup1D(asc.values, asc.data, pAltFt).value ?? 0;
  }
  return n1;
}

function maxAssumedTemp(n1Data, oatC, pAltFt) {
  const t = n1Data.max_assumed_temp;
  const norm = norm2D(t.row_axis, t.col_axis, t.data);
  return lookup2D(norm, oatC, pAltFt).value;
}

function minAssumedTemp(n1Data, pAltFt) {
  const asc = toAscending1D(n1Data.min_assumed_temp.row_axis, n1Data.min_assumed_temp.data);
  return lookup1D(asc.values, asc.data, pAltFt).value;
}

function n1AtAssumedTemp(n1Data, assumedTempC, pAltFt, oatC, packs) {
  const t = n1Data.pct_n1_by_assumed_temp;
  const norm = norm2D(t.row_axis, t.col_axis, t.data);
  let n1 = lookup2D(norm, assumedTempC, pAltFt).value;
  if (n1 == null) return null;
  const deltaT = assumedTempC - oatC;
  const adjT = n1Data.pct_n1_temp_difference_adjustment;
  const adjNorm = norm2D(adjT.row_axis, adjT.col_axis, adjT.data);
  const adj = lookup2D(adjNorm, deltaT, oatC).value ?? 0;
  n1 -= adj;
  if (packs === "OFF") n1 += t.packs_off_delta_pctn1;
  return n1;
}

function solveAssumedTemp({ n1Data, dataset, adjustments, altFt, fieldLengthM, oatC, isWet, packs, antiice, actualTOWkg, fieldRatio = 1, climbRatio = 1 }) {
  const maxT = maxAssumedTemp(n1Data, oatC, altFt);
  if (maxT == null || maxT <= oatC) return { assumedTempC: null, mode: "FULL" };

  const limitAt = (t) => {
    const r = limitWeightKgAtTemp(dataset, adjustments, altFt, fieldLengthM, t, isWet, packs, antiice);
    if (fieldRatio === 1 && climbRatio === 1) return r.value;
    const sf = r.fieldTotal != null ? r.fieldTotal * fieldRatio : null;
    const sc = r.climbTotal != null ? r.climbTotal * climbRatio : null;
    const cands = [MAX_STRUCTURAL_TOW_KG, sf, sc].filter((v) => v != null);
    return cands.length ? Math.min(...cands) : null;
  };

  if (limitAt(maxT) >= actualTOWkg) {
    var solved = maxT;
  } else if (limitAt(oatC) < actualTOWkg) {
    return { assumedTempC: null, mode: "OVERWEIGHT" };
  } else {
    let lo = oatC;
    let hi = maxT;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (limitAt(mid) >= actualTOWkg) lo = mid;
      else hi = mid;
    }
    solved = lo;
  }

  const minT = minAssumedTemp(n1Data, altFt);
  if (minT != null && solved < minT) return { assumedTempC: null, mode: "FULL" };
  return { assumedTempC: solved, mode: "FLEX" };
}

// --- Thrust-rating (RTG) selection: OPTIMUM / TO / TO-1 / TO-2 ---
// FCOM publishes full field/climb-limit-weight charts (vs. field length,
// altitude, temperature) only for full rated (TO/26K) thrust — confirmed
// against two independent Boeing FCOMs (this project's generic manual and a
// Ryanair rev.30 manual), both of which list exactly one "Takeoff Field &
// Climb Limit Weights" table per runway condition with no derate variant.
// Boeing's own OPT computes the derated (TO-1/TO-2) field/climb limit weight
// from an internal aero/engine performance model that isn't published
// anywhere in either manual, so it can't be reproduced here from generic
// data. A first version of this ignored runway length entirely for TO-1/
// TO-2 (bounding legality only by the rating's own published V-speed table
// weight range), which meant a derate could look "legal" on any runway,
// including ones far too short to actually support a reduced-thrust
// takeoff — wrong, and caught by inspection. Instead, TO-1/TO-2's
// field/climb-limited weight is now *estimated* by scaling TO's own real,
// runway/altitude/temperature-specific field+climb limit weight (from the
// actual field/climb chart) down by the ratio of rated thrust (24000/26000
// for TO-1, 22000/26000 for TO-2) — a standard rough performance-engineering
// approximation (required field length for a given weight scales roughly
// with available thrust), not an FCOM-published number. That scaled
// estimate is combined with the rating's own published V-speed table weight
// range and structural MTOW, taking the most restrictive of the three. The
// Assumed Temperature Method (ATM) search for TO-1/TO-2 similarly isn't a true
// weight-specific bisection like TO's (no field/climb-vs-temperature curve
// exists for the derates) — it uses that rating's own published
// maximum-assumed-temperature ceiling whenever the (scaled-estimate) weight
// is legal, which matches the real OPT's D-TO1/D-TO2 cards showing a SEL
// TEMP. All of this is surfaced via warnings; the TO/26K number remains the
// only fully rigorous, FCOM-chart-backed dispatch-legal weight in this tool.
const RATING_LABELS = { TO: "TO (26K)", "TO-1": "TO-1 (24K)", "TO-2": "TO-2 (22K)" };
const DERATE_THRUST_RATIO = { "TO-1": 24000 / 26000, "TO-2": 22000 / 26000 };

// --- Flap selection: OPTIMUM / 1 / 5 / 10 / 15 / 25 ---
// Same root cause as the RTG/derate gap above, confirmed against the same
// two FCOMs: the published Field & Climb Limit Weight chart exists for
// Flaps 5 only — no separate chart for 1/10/15/25. The real OPT computes
// every flap's limit weight from Boeing's internal aero database; that data
// isn't in any FCOM available to this tool. Instead, a non-5 flap's
// field-limited and climb-limited weight is *estimated* by scaling the real
// Flap 5 numbers using the ratio of that flap's own published VR/V2 to
// Flap 5's VR/V2 at the same weight, squared — field length for a given
// weight scales roughly with V^2 (kinematics), and V2/climb margin move
// together closely enough to use the same proxy for the climb side. This is
// a rough performance-engineering approximation, not an FCOM number, always
// surfaced via warnings. Higher flap gives a lower VR/V2 (more lift at lower
// speed) so the ratio is >1, correctly estimating a *higher* field-limited
// weight — i.e. more weight allowed on a short runway at higher flap, which
// is the real, physical effect this feature exists to let students observe.
// FLAP OPTIMUM searches ascending (5, 10, 15, 25) and picks the lowest flap
// that's legal at the actual weight, matching real practice of using the
// lowest flap that still works (better climb/less drag/quieter) unless a
// short runway forces a higher one. Flap 1 is excluded — though the FCOM
// publishes V-speed data for it, it isn't a flap setting actually used for
// takeoff in practice (confirmed by the instructor), so it's left out of
// both this search and the manual FLAP selector rather than offering a
// technically-computable but operationally-wrong option.
const FLAP_ORDER = ["5", "10", "15", "25"];

function flapFieldClimbRatios(vspeedTable, weightKg, flap) {
  if (flap === "5") return { fieldRatio: 1, climbRatio: 1 };
  const t5 = vspeedTriple(vspeedTable, "5", weightKg);
  const tF = vspeedTriple(vspeedTable, flap, weightKg);
  if (!t5 || !tF || !t5.vr || !t5.v2 || !tF.vr || !tF.v2) return { fieldRatio: null, climbRatio: null };
  return {
    fieldRatio: (t5.vr / tF.vr) ** 2,
    climbRatio: (t5.v2 / tF.v2) ** 2,
  };
}

// The row-axis's nominal max weight isn't always usable — some flap/rating
// combos (e.g. TO-1 at Flap 10) publish null V1/VR/V2 cells for their
// heaviest rows, because that combination genuinely isn't certified that
// heavy. Scan for the highest weight whose V1/VR/V2 are all actually
// published, not just the row axis's printed extent.
function vspeedTableMaxWeightKg(vspeedTable, flap) {
  const key = `flaps_${flap}`;
  const table = vspeedTable?.max_takeoff_thrust_v1_vr_v2?.by_flap?.[key];
  if (!table || !table.row_axis?.values?.length) return null;
  let maxUsableKg = null;
  table.row_axis.values.forEach((w1000, i) => {
    const row = table.data[i];
    if (row && row.every((v) => v != null) && (maxUsableKg == null || w1000 > maxUsableKg)) {
      maxUsableKg = w1000;
    }
  });
  return maxUsableKg != null ? maxUsableKg * 1000 : null;
}

function evaluateToRating({ n1Data, dataset, adjustments, altFt, fieldLengthM, oatC, isWet, packs, antiice, weightKg, atmPolicy, flap, vspeedTable }) {
  const lim = limitWeightKgAtTemp(dataset, adjustments, altFt, fieldLengthM, oatC, isWet, packs, antiice);
  const { fieldRatio, climbRatio } = flapFieldClimbRatios(vspeedTable, weightKg, flap);
  const warnings = [];
  let limitWeightKg;
  let limitingItem;

  if (flap === "5") {
    limitWeightKg = lim.value != null ? Math.round(lim.value) : null;
    limitingItem = lim.limitingItem;
  } else if (fieldRatio != null) {
    const scaledField = lim.fieldTotal != null ? lim.fieldTotal * fieldRatio : null;
    const scaledClimb = lim.climbTotal != null ? lim.climbTotal * climbRatio : null;
    const candidates = [
      { v: MAX_STRUCTURAL_TOW_KG, label: "Structural MTOW" },
      { v: scaledField, label: `Field length (Flap ${flap} V-speed-scaled estimate — no FCOM Flap ${flap} chart)` },
      { v: scaledClimb, label: `Climb, 2nd segment (Flap ${flap} V-speed-scaled estimate — no FCOM Flap ${flap} chart)` },
    ].filter((c) => c.v != null);
    const best = candidates.length ? candidates.reduce((a, b) => (b.v < a.v ? b : a)) : null;
    limitWeightKg = best ? Math.round(best.v) : null;
    limitingItem = best?.label ?? null;
    warnings.push(
      `No FCOM field/climb-limit-weight chart is published for Flap ${flap} — limit weight is estimated by scaling the Flap 5 chart using each flap's own published V-speeds as a proxy for the field-length/climb-margin change (a rough performance-engineering approximation, not an FCOM number).`
    );
  } else {
    limitWeightKg = null;
    limitingItem = null;
    warnings.push(`No V-speed data available to estimate a Flap ${flap} limit weight at this weight.`);
  }

  let selTemp = null;
  let n1Pct = null;

  const assumed =
    atmPolicy === "MAX"
      ? { assumedTempC: null, mode: "FULL" }
      : solveAssumedTemp({
          n1Data,
          dataset,
          adjustments,
          altFt,
          fieldLengthM,
          oatC,
          isWet,
          packs,
          antiice,
          actualTOWkg: weightKg,
          fieldRatio: fieldRatio ?? 1,
          climbRatio: climbRatio ?? 1,
        });

  if (assumed.mode === "OVERWEIGHT") {
    warnings.push("Actual TOW exceeds the field/climb limit weight even at full rated thrust and actual OAT.");
    n1Pct = n1Full(n1Data, oatC, altFt, packs);
  } else if (assumed.mode === "FLEX") {
    selTemp = Math.round(assumed.assumedTempC);
    n1Pct = n1AtAssumedTemp(n1Data, assumed.assumedTempC, altFt, oatC, packs);
  } else {
    n1Pct = n1Full(n1Data, oatC, altFt, packs);
  }
  if (n1Pct != null) n1Pct = Math.round(n1Pct * 10) / 10;

  return {
    limitWeightKg,
    limitingItem,
    selTemp,
    n1Pct,
    legal: limitWeightKg != null && weightKg <= limitWeightKg,
    warnings,
  };
}

function evaluateDerateRating({ n1Data, vspeedTable, altFt, oatC, packs, weightKg, flap, atmPolicy, ratingKey, toFieldTotalKg, toClimbTotalKg }) {
  const envelopeKg = vspeedTableMaxWeightKg(vspeedTable, flap);
  const ratio = DERATE_THRUST_RATIO[ratingKey];
  const { fieldRatio, climbRatio } = flapFieldClimbRatios(vspeedTable, weightKg, flap);
  const scaledFieldKg = toFieldTotalKg != null && fieldRatio != null ? toFieldTotalKg * ratio * fieldRatio : null;
  const scaledClimbKg = toClimbTotalKg != null && climbRatio != null ? toClimbTotalKg * ratio * climbRatio : null;

  const candidates = [
    { v: MAX_STRUCTURAL_TOW_KG, label: "Structural MTOW" },
    { v: envelopeKg, label: "Published V-speed weight range (envelope cap)" },
    { v: scaledFieldKg, label: "Field length (thrust-ratio & flap-scaled estimate — no FCOM derate chart)" },
    { v: scaledClimbKg, label: "Climb, 2nd segment (thrust-ratio & flap-scaled estimate — no FCOM derate chart)" },
  ].filter((c) => c.v != null);
  const best = candidates.length ? candidates.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const limitWeightKg = best ? Math.round(best.v) : null;
  const legal = limitWeightKg != null && weightKg <= limitWeightKg;

  const warnings = [
    "No FCOM field/climb-limit-weight chart is published for this derate — limit weight is estimated by scaling TO(26K)'s real, runway-specific field/climb chart down by the rating's thrust ratio (and, for a non-Flap-5 setting, further by a V-speed-based flap ratio) — a rough performance-engineering approximation, not an FCOM number. The Assumed Temperature Method (ATM) shown uses this rating's own published maximum-assumed-temperature ceiling rather than a weight-specific solve (see code comment above evaluateDerateRating).",
  ];
  if (limitWeightKg != null && weightKg > limitWeightKg) {
    warnings.push(`Actual TOW exceeds the estimated limit weight for this rating (max ${limitWeightKg} kg).`);
  }

  let selTemp = null;
  if (atmPolicy !== "MAX" && legal) {
    const maxT = maxAssumedTemp(n1Data, oatC, altFt);
    const minT = minAssumedTemp(n1Data, altFt);
    if (maxT != null && maxT > oatC && (minT == null || maxT >= minT)) {
      selTemp = Math.round(maxT);
    }
  }

  let n1Pct = selTemp != null ? n1AtAssumedTemp(n1Data, selTemp, altFt, oatC, packs) : n1Full(n1Data, oatC, altFt, packs);
  if (n1Pct != null) n1Pct = Math.round(n1Pct * 10) / 10;

  return {
    limitWeightKg,
    limitingItem: best?.label ?? null,
    selTemp,
    n1Pct,
    legal,
    warnings,
  };
}

export async function computeTakeoff(data, inputs) {
  const { runway, oatC, pAltFt, weightKg, cond, packs, antiice, headwindKt, cgPct, atm, rev, rtg } = inputs;
  let flap = inputs.flap;
  const isWet = cond === 5;
  const isContaminated = cond < 5;
  const dataset = isWet ? data.fieldClimbWet : data.fieldClimbDry;
  let vspeedTable = isWet ? data.vspeedsWet : data.vspeedsDry;
  const rawFieldLengthM = (runway.length_ft ?? 0) / FT_PER_M;
  const slopePct = 0; // not in the airport/runway dataset — documented limitation

  const out = {
    ready: true,
    v1: null,
    vr: null,
    v2: null,
    flap,
    trim: null,
    selTemp: null,
    n1Pct: null,
    limitWeightKg: null,
    limitingItem: null,
    mfraFt: null,
    vref40: null,
    rating: "TO",
    ratingLabel: RATING_LABELS.TO,
    overweight: false,
    warnings: [],
  };

  let contam = null;
  if (isContaminated) {
    if (rtg && rtg !== "TO" && rtg !== "OPTIMUM") {
      out.warnings.push("Contaminated-runway performance is only modeled at full rated (TO/26K) thrust — RTG forced to TO.");
    }
    if (flap === "OPTIMUM") {
      flap = "5"; // no contaminated-runway data exists to scale by flap either — same forced-default pattern as RTG above
      out.flap = flap;
    }
    if (flap !== "5") {
      out.warnings.push("Contaminated-runway data is indexed from the Flaps 5 dry field/obstacle limit weight — select Flaps 5 to see a limit weight.");
    } else {
      const scenario = CONTAMINATION_SCENARIOS[cond];
      const dryCorrectedM = correctedFieldLengthM(data.adjustments, rawFieldLengthM, slopePct, headwindKt, false);
      const dryLim = limitWeightKgAtTemp(data.fieldClimbDry, data.adjustments, pAltFt, dryCorrectedM, oatC, false, packs, antiice);
      if (dryLim.value == null) {
        out.warnings.push("Could not establish a dry field/obstacle limit weight baseline for this contaminated-runway calculation.");
      } else {
        contam = computeContaminated({
          contaminatedData: data.contaminated,
          scenario,
          dryLimitKg: dryLim.value,
          rawFieldLengthM,
          pAltFt,
          oatC,
          weightKg,
          rev,
        });
        out.limitWeightKg = contam.limitWeightKg;
        out.limitingItem = contam.limitingItem;
        out.overweight = contam.limitWeightKg != null && weightKg > contam.limitWeightKg;
        out.warnings.push(
          `Contaminated runway mapped to FCOM scenario "${scenario.label}" (teaching approximation, not a measured contaminant depth). The Assumed Temperature Method (ATM) is not computed for contaminated runways — full rated thrust only.`
        );
        out.n1Pct = n1Full(data.n1AssumedTemp, oatC, pAltFt, packs);
        if (out.n1Pct != null) out.n1Pct = Math.round(out.n1Pct * 10) / 10;
      }
    }
  } else {
    const correctedM = correctedFieldLengthM(data.adjustments, rawFieldLengthM, slopePct, headwindKt, isWet);
    // Independent of `flap` — the FCOM field/climb chart is inherently a
    // Flaps-5 chart, so this is available to scale both the derates and
    // non-5 flaps from, regardless of what's actually selected/tried below.
    const toLim = limitWeightKgAtTemp(dataset, data.adjustments, pAltFt, correctedM, oatC, isWet, packs, antiice);

    const ratingInputs = {
      TO: { vspeedTable: isWet ? data.vspeedsWet : data.vspeedsDry, n1Data: data.n1AssumedTemp },
      "TO-1": { vspeedTable: isWet ? data.vspeedsTo1Wet : data.vspeedsTo1Dry, n1Data: data.n1To1 },
      "TO-2": { vspeedTable: isWet ? data.vspeedsTo2Wet : data.vspeedsTo2Dry, n1Data: data.n1To2 },
    };

    const evalRating = (key, forFlap) => {
      const ri = ratingInputs[key];
      if (key === "TO") {
        return evaluateToRating({
          n1Data: ri.n1Data,
          dataset,
          adjustments: data.adjustments,
          altFt: pAltFt,
          fieldLengthM: correctedM,
          oatC,
          isWet,
          packs,
          antiice,
          weightKg,
          atmPolicy: atm,
          flap: forFlap,
          vspeedTable: ri.vspeedTable,
        });
      }
      return evaluateDerateRating({
        n1Data: ri.n1Data,
        vspeedTable: ri.vspeedTable,
        altFt: pAltFt,
        oatC,
        packs,
        weightKg,
        flap: forFlap,
        atmPolicy: atm,
        ratingKey: key,
        toFieldTotalKg: toLim.fieldTotal,
        toClimbTotalKg: toLim.climbTotal,
      });
    };

    const requestedRtg = rtg || "TO";
    // Resolves RTG (fixed or OPTIMUM-searched across TO/TO-1/TO-2) for one
    // specific flap setting — reused both for a fixed flap and, below, once
    // per candidate in the FLAP OPTIMUM search, so the two OPTIMUM axes
    // (RTG, FLAP) compose without duplicating the rating-search logic.
    const resolveForFlap = (forFlap) => {
      let chosenKey;
      let chosen;
      if (requestedRtg === "OPTIMUM") {
        const results = ["TO-2", "TO-1", "TO"].map((key) => ({ key, res: evalRating(key, forFlap) }));
        const legalOnes = results.filter((r) => r.res.legal && r.res.n1Pct != null);
        const pick = legalOnes.length
          ? legalOnes.reduce((best, r) => (r.res.n1Pct < best.res.n1Pct ? r : best))
          : results.find((r) => r.key === "TO");
        chosenKey = pick.key;
        chosen = pick.res;
      } else {
        chosenKey = requestedRtg;
        chosen = evalRating(chosenKey, forFlap);
      }
      return { chosenKey, chosen };
    };

    let resolvedFlap;
    let chosenKey;
    let chosen;
    if (flap === "OPTIMUM") {
      const attempts = FLAP_ORDER.map((f) => ({ flap: f, ...resolveForFlap(f) }));
      const legalOnes = attempts.filter((a) => a.chosen.legal);
      const pick = legalOnes.length ? legalOnes[0] : attempts[attempts.length - 1];
      resolvedFlap = pick.flap;
      chosenKey = pick.chosenKey;
      chosen = pick.chosen;
    } else {
      resolvedFlap = flap;
      ({ chosenKey, chosen } = resolveForFlap(flap));
    }

    flap = resolvedFlap;
    out.flap = resolvedFlap;
    out.rating = chosenKey;
    out.ratingLabel = RATING_LABELS[chosenKey];
    out.limitWeightKg = chosen.limitWeightKg;
    out.limitingItem = chosen.limitingItem;
    out.selTemp = chosen.selTemp;
    out.n1Pct = chosen.n1Pct;
    out.overweight = chosen.limitWeightKg != null && !chosen.legal;
    out.warnings.push(...chosen.warnings);
    vspeedTable = ratingInputs[chosenKey].vspeedTable;
  }

  out.warnings.push("Obstacle limit weight not evaluated — no surveyed obstacle data exists for this airport in the dataset.");
  out.warnings.push("Tire-speed and brake-energy limits are not published for this 737-800/CFM56-7B26 configuration in FCOM (non-limiting for this airframe) — not modeled.");

  const base = vspeedTriple(vspeedTable, flap, weightKg);
  if (base) {
    const ta = tempAltAdjust(vspeedTable, oatC, pAltFt);
    let v1 = base.v1 + ta.v1;
    const vr = base.vr + ta.vr;
    const v2 = base.v2 + ta.v2;
    const mcg = v1mcg(vspeedTable, oatC, pAltFt);

    if (isContaminated && contam) {
      // Per FCOM procedure: if weight-limited by V1(MCG), V1 is simply set to
      // V1(MCG); otherwise apply the contaminant-specific V1 adjustment on top
      // of the dry-runway baseline instead of the dry slope/wind correction.
      if (contam.v1mcgLimited && mcg != null) {
        v1 = mcg;
      } else if (contam.v1AdjKt != null) {
        v1 += contam.v1AdjKt;
      }
    } else {
      v1 += slopeWindV1Adjust(vspeedTable, weightKg, slopePct, headwindKt);
    }

    if (mcg != null) v1 = Math.max(v1, mcg);
    v1 = Math.min(v1, vr);
    out.v1 = Math.round(v1);
    out.vr = Math.round(vr);
    out.v2 = Math.round(v2);
  } else {
    out.warnings.push(`No V-speed table for Flaps ${flap} at this weight.`);
  }

  out.trim = stabTrim(data.vrefTrim, flap, weightKg, cgPct);
  const v40 = vref40At(data.vrefTrim, weightKg);
  out.vref40 = v40 != null ? Math.round(v40) : null;

  return out;
}
