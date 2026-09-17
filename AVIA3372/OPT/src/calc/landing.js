// B737-800/CFM56-7B26 landing performance, from transcribed FCOM Performance
// Dispatch (landing field/climb limit weight, pp.631-636) and Performance
// Inflight (Vref/trim p.1059-1061, normal-config landing distance advisory
// pp.1115-1117) tables. See data/processed/performance/_schema.md.
//
// Known, intentional scope limits:
// - Landing field/climb limit weight (dispatch "Max LW") is only published
//   for Dry/Wet runway, antiskid operative, auto speedbrakes — contaminated
//   runway or antiskid-inoperative dispatch limits are not modeled.
// - The landing-distance advisory table is indexed by *reported braking
//   action* (DRY/GOOD/MEDIUM/POOR), not the takeoff-style contamination code.
//   Codes below WET are mapped to the nearest RCAM-style category as a
//   teaching approximation (documented per-mapping below), not a precise
//   contaminant-depth calculation — takeoff_contaminated.json has real
//   depth-based data but no landing equivalent was in scope.
// - Vapp = Vref + VREF ADD, where VREF ADD is a pilot-editable input (default
//   5kt) rather than an auto-computed wind heuristic — matches the real
//   OPT's editable "VREF ADD" field exactly.
// - Runway slope assumed 0% (not in the airport/runway dataset).
// - Brake cooling schedule assumes Category C (steel) brakes — the dataset
//   has both steel and carbon tables, but there's no brake-type selector in
//   the UI to choose between them, so this is a documented default rather
//   than a real aircraft-config lookup.

import { lookup1D, lookup2D, findBracket } from "../interp.js";
import { toAscending1D, toAscending2D } from "../tables.js";
import { isaTempAt, dispatchFactoredHeadwindKt } from "../atmos.js";

const FT_PER_M = 3.28084;

function norm2D(rowAxis, colAxis, data) {
  return toAscending2D(rowAxis, colAxis, data);
}

const RCAM_MAP = { 6: "DRY", 5: "GOOD", 4: "MEDIUM", 3: "POOR", 2: "POOR", 1: "MEDIUM", 0: "POOR" };

function vrefFor(vrefTrimData, flap, weightKg) {
  const t = vrefTrimData.vref;
  const norm = norm2D(t.row_axis, t.col_axis, t.data);
  return lookup2D(norm, weightKg / 1000, Number(flap)).value;
}

function fieldLimitWeightKg(fieldDispatch, isWet, rawFieldLengthM, headwindKt, pAltFt) {
  const block = fieldDispatch.find((b) => b.runway === (isWet ? "Wet" : "Dry") && b.antiskid === "operative");
  if (!block) return null;
  const windT = norm2D(block.wind_corrected_field_length.row_axis, block.wind_corrected_field_length.col_axis, block.wind_corrected_field_length.data);
  const correctedM = lookup2D(windT, rawFieldLengthM, headwindKt).value;
  if (correctedM == null) return null;
  const fieldT = norm2D(block.field_limit_weight.row_axis, block.field_limit_weight.col_axis, block.field_limit_weight.data);
  const kg1000 = lookup2D(fieldT, correctedM, pAltFt).value;
  return kg1000 == null ? null : kg1000 * 1000;
}

function climbLimitWeightKg(climbGoAround, oatC, pAltFt, packs, antiice) {
  const t = climbGoAround.landing_climb_limit_weight;
  const norm = norm2D(t.row_axis, t.col_axis, t.data);
  const kg1000 = lookup2D(norm, oatC, pAltFt).value;
  if (kg1000 == null) return null;
  let deltaKg = 0;
  const byCondition = Object.fromEntries(t.deltas.map((d) => [d.condition, d]));
  if (packs === "OFF") deltaKg += byCondition.packs_off.weight_kg;
  if (antiice === "ENG") deltaKg += byCondition.engine_anti_ice_on.weight_kg;
  else if (antiice === "ENG+WING") deltaKg += byCondition.engine_and_wing_anti_ice_on.weight_kg;
  return kg1000 * 1000 + deltaKg;
}

function distanceFromRows(rows, condCode, config, weightKg, pAltFt, headwindKt, oatC, vref, vapp, reverseOk) {
  const rcam = RCAM_MAP[condCode];
  const row = rows.find((r) => r.condition === rcam && r.config === config);
  // Some non-normal scenarios (e.g. Antiskid Inoperative, which FCOM only
  // publishes dry/MAX-MANUAL for) have a row present with entirely null
  // adjustment fields — a genuine "not applicable for this scenario" from
  // the source, not a data error, so this must fail soft rather than throw.
  if (
    !row ||
    row.wt_adj_per_5000kg == null ||
    row.alt_adj_per_1000ft == null ||
    row.wind_adj_per_10kt == null ||
    row.temp_adj_per_10c == null ||
    row.app_spd_adj_per_5kt == null ||
    row.reverse_thrust_adj == null
  ) {
    return null;
  }

  let dist = row.ref_dist_m;

  const dw = weightKg - 65000;
  dist += (Math.abs(dw) / 5000) * (dw >= 0 ? row.wt_adj_per_5000kg.above : row.wt_adj_per_5000kg.below);

  if (pAltFt <= 8000) {
    dist += (pAltFt / 1000) * row.alt_adj_per_1000ft.std;
  } else {
    dist += (8000 / 1000) * row.alt_adj_per_1000ft.std;
    dist += ((pAltFt - 8000) / 1000) * row.alt_adj_per_1000ft.high_ge_8000ft;
  }

  const hw = headwindKt ?? 0;
  dist += (Math.abs(hw) / 10) * (hw >= 0 ? row.wind_adj_per_10kt.head : row.wind_adj_per_10kt.tail);

  const isaDev = oatC - isaTempAt(pAltFt);
  dist += (Math.abs(isaDev) / 10) * (isaDev >= 0 ? row.temp_adj_per_10c.above_isa : row.temp_adj_per_10c.below_isa);

  const excessSpeed = Math.max(0, vapp - vref);
  dist += (excessSpeed / 5) * row.app_spd_adj_per_5kt;

  if (!reverseOk) dist += row.reverse_thrust_adj.one_rev;

  return Math.round(dist);
}

function landingDistanceM(distanceNormal, flap, condCode, config, weightKg, pAltFt, headwindKt, oatC, vref, vapp, reverseOk) {
  const flapTable = distanceNormal.find((f) => f.flap_setting === `FLAPS ${flap}`);
  if (!flapTable) return null;
  return distanceFromRows(flapTable.rows, condCode, config, weightKg, pAltFt, headwindKt, oatC, vref, vapp, reverseOk);
}

/** Parses the non-normal-scenario "reference_speed" field, e.g. "VREF15",
 * "VREF40 + 55", into a base flap setting (for the existing Vref table
 * lookup) plus a flat knot offset. */
function parseReferenceSpeed(text) {
  const m = String(text).match(/^VREF(\d+)\s*(?:\+\s*(\d+))?$/i);
  if (!m) return null;
  return { baseFlap: m[1], offsetKt: m[2] ? parseInt(m[2], 10) : 0 };
}

const SPEED_BUCKETS = [80, 100, 120, 140, 160, 180];
const ALT_BUCKETS = [0, 5000, 10000];
const BRAKE_EVENT_MAP = {
  maxManual: "LANDING MAX MAN",
  auto1: "LANDING AUTOBRAKE 1",
  auto2: "LANDING AUTOBRAKE 2",
  auto3: "LANDING AUTOBRAKE 3",
  maxAuto: "LANDING MAX AUTO",
};

function nearestOf(buckets, x) {
  return buckets.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best));
}

/** Reference brake energy per brake (millions of ft-lb) for a given weight/
 * OAT/pressure-alt/brakes-on-speed — the FCOM table's columns are a compound
 * "speed x altitude" bucket (not two independent numeric axes), so the
 * nearest bucket is picked directly rather than interpolated, same as a
 * human reading the chart would. */
function referenceBrakeEnergy(refTable, weightKg, oatC, pAltFt, brakesOnSpeedKt) {
  const speed = nearestOf(SPEED_BUCKETS, brakesOnSpeedKt);
  const alt = nearestOf(ALT_BUCKETS, pAltFt);
  const colLabel = `${speed}kt_${alt / 1000}k`;
  const groups = [...refTable.groups].sort((a, b) => a.weight_1000kg - b.weight_1000kg);
  const perGroup = groups.map((g) => {
    const colIdx = g.col_axis.values.indexOf(colLabel);
    if (colIdx === -1) return null;
    const colData = g.data.map((row) => row[colIdx]);
    const asc = toAscending1D(g.row_axis, colData);
    return lookup1D(asc.values, asc.data, oatC).value;
  });
  const weights = groups.map((g) => g.weight_1000kg);
  const { lo, hi, frac } = findBracket(weights, weightKg / 1000);
  const a = perGroup[lo];
  const b = perGroup[hi];
  if (a == null || b == null) return a ?? b ?? null;
  return a + (b - a) * frac;
}

/** Adjusted brake energy per brake: nearest of the 9 published reference-
 * energy columns (10-90 million ft-lb) for the actual event/reverse-thrust
 * config — "nearest", not interpolated, per the table's own instructions. */
function adjustedBrakeEnergy(adjTable, referenceEnergyMft, eventLabel, reverseOk) {
  const block = reverseOk ? adjTable.two_engine_detent_reverse_thrust : adjTable.no_reverse_thrust;
  const row = block.row_axis.values.indexOf(eventLabel);
  if (row === -1 || referenceEnergyMft == null) return null;
  const cols = adjTable.input_reference_energy_millions_ft_lb;
  let bestIdx = 0;
  for (let i = 1; i < cols.length; i++) {
    if (Math.abs(cols[i] - referenceEnergyMft) < Math.abs(cols[bestIdx] - referenceEnergyMft)) bestIdx = i;
  }
  return block.data[row][bestIdx];
}

/** Banded lookup: energy bands are unequal-width categories (not a uniform
 * axis), so this picks the first band whose numeric threshold is >= the
 * adjusted energy, matching how the FCOM chart itself is read. */
function coolingTimeForEnergy(coolingTable, adjustedEnergyMft) {
  if (adjustedEnergyMft == null) return { groundMin: null, inflightMin: null };
  const bands = coolingTable.event_adjusted_brake_energy_bands_millions_ft_lb;
  let idx = bands.length - 1;
  for (let i = 0; i < bands.length; i++) {
    const parsed = parseFloat(String(bands[i]).replace(/[^\d.]/g, ""));
    if (!Number.isNaN(parsed) && adjustedEnergyMft <= parsed) {
      idx = i;
      break;
    }
  }
  return { groundMin: coolingTable.ground_cooling_time_min[idx], inflightMin: coolingTable.inflight_gear_down_cooling_time_min[idx] };
}

function brakeCoolingByConfig(quickTurnaround, weightKg, oatC, pAltFt, brakesOnSpeedKt, reverseOk) {
  if (!quickTurnaround) return null;
  const sched = quickTurnaround.brake_cooling_schedule;
  const refEnergy = referenceBrakeEnergy(sched.reference_brake_energy_per_brake, weightKg, oatC, pAltFt, brakesOnSpeedKt);
  const coolingTable = sched.cooling_time_steel_category_c; // documented default — see file header
  return Object.entries(BRAKE_EVENT_MAP).map(([key, eventLabel]) => {
    const adjEnergy = adjustedBrakeEnergy(sched.adjusted_brake_energy_per_brake, refEnergy, eventLabel, reverseOk);
    const { groundMin, inflightMin } = coolingTimeForEnergy(coolingTable, adjEnergy);
    return { key, groundMin, inflightMin };
  });
}

// Every non-normal scenario publishes only 3 braking configs, and which 3
// depends on reported braking action: DRY/GOOD get AUTOBRAKE 2 (no 3 or 1
// published), MEDIUM/POOR get AUTOBRAKE 3 instead — matches the FCOM pages
// exactly, not a simplification.
function nonNormalConfigsFor(condCode) {
  const rcam = RCAM_MAP[condCode];
  const auto = rcam === "DRY" || rcam === "GOOD" ? "AUTOBRAKE 2" : "AUTOBRAKE 3";
  return [
    { key: "maxManual", label: "MAX MANUAL", config: "MAX MANUAL" },
    { key: "auto", label: auto, config: auto },
    { key: "maxAuto", label: "MAX AUTO", config: "AUTOBRAKE MAX" },
  ];
}

export async function computeLanding(data, inputs) {
  const { runway, oatC, pAltFt, weightKg, flap, cond, ab, headwindKt, rev, packs, antiice, nnc, vrefAddKt } = inputs;

  const out = {
    ready: true,
    vref: null,
    vapp: null,
    limitWeightKg: null,
    limitingItem: null,
    landingDistanceM: null,
    warnings: [],
  };

  const nncActive = nnc && nnc !== "NONE";
  const nncScenario = nncActive ? data.distanceNonNormal?.find((s) => s.scenario === nnc) : null;

  let vref;
  if (nncScenario) {
    const refSpeed = parseReferenceSpeed(nncScenario.reference_speed);
    if (!refSpeed) {
      out.warnings.push(`Could not parse reference speed "${nncScenario.reference_speed}" for this NNC scenario.`);
      vref = vrefFor(data.vrefTrim, flap, weightKg);
    } else {
      const base = vrefFor(data.vrefTrim, refSpeed.baseFlap, weightKg);
      vref = base != null ? base + refSpeed.offsetKt : null;
      out.warnings.push(
        `NNC "${nnc}" active (FCOM ${nncScenario.source?.page}${nncScenario.source_qrh ? ` / QRH ${nncScenario.source_qrh.page}` : ""}): reference speed = ${nncScenario.reference_speed}. Dispatch Max LW below still reflects the normal (non-failure) landing climb/field limit — FCOM does not publish separate dispatch limit-weight tables for non-normal configurations.`
      );
    }
  } else {
    vref = vrefFor(data.vrefTrim, flap, weightKg);
  }
  out.vref = vref != null ? Math.round(vref) : null;
  const addl = vrefAddKt ?? 5;
  out.vapp = vref != null ? Math.round(vref + addl) : null;
  out.vrefAddKt = addl;

  const isWet = cond === 5;
  if (cond < 5) {
    out.warnings.push("Landing dispatch field/climb limit weight is only published for Dry/Wet runway — not available for this condition.");
  } else {
    const rawFieldLengthM = (runway.length_ft ?? 0) / FT_PER_M;
    const fieldKg = fieldLimitWeightKg(data.fieldDispatch, isWet, rawFieldLengthM, headwindKt ?? 0, pAltFt);
    const climbKg = climbLimitWeightKg(data.climbGoAround, oatC, pAltFt, packs, antiice);
    const candidates = [fieldKg, climbKg].filter((v) => v != null);
    if (candidates.length) {
      out.limitWeightKg = Math.round(Math.min(...candidates));
      out.limitingItem = out.limitWeightKg === Math.round(fieldKg ?? Infinity) ? "Field length" : "Climb (missed approach)";
    }
  }

  if (nncScenario && vref != null) {
    const configs = nonNormalConfigsFor(cond);
    out.allBrakeDistancesM = configs.map(({ key, label, config }) => ({
      key,
      label,
      distanceM: distanceFromRows(nncScenario.rows, cond, config, weightKg, pAltFt, headwindKt ?? 0, oatC, vref, out.vapp ?? vref, rev === "ALL OP"),
    }));
    const primaryMap = { MANUAL: "maxManual", MAX: "maxAuto" };
    const primaryKey = primaryMap[ab] ?? "auto";
    out.landingDistanceM = out.allBrakeDistancesM.find((r) => r.key === primaryKey)?.distanceM ?? out.allBrakeDistancesM[0]?.distanceM ?? null;
    out.warnings.push(
      `Runway condition mapped to reported braking action "${RCAM_MAP[cond]}" (approximation below WET). This scenario only publishes MAX MANUAL / ${configs[1].label} / MAX AUTO — no AUTOBRAKE 1 row exists for non-normal configurations.`
    );
  } else if (nncActive && !nncScenario) {
    out.warnings.push(`NNC scenario "${nnc}" not found in the non-normal landing distance dataset.`);
  } else if (data.distanceNormal && vref != null) {
    // "ALL" (the real OPT's default BRKS value) shows every config in
    // allBrakeDistancesM below; AUTOBRAKE 3 is just the fallback used for the
    // single "primary" distance (runway-graphic stop marker, margin note).
    const configMap = { ALL: "AUTOBRAKE 3", "1": "AUTOBRAKE 1", "2": "AUTOBRAKE 2", "3": "AUTOBRAKE 3", MAX: "AUTOBRAKE MAX", MANUAL: "MAX MANUAL" };
    const config = configMap[ab] ?? ab;
    const dist = landingDistanceM(
      data.distanceNormal,
      flap,
      cond,
      config,
      weightKg,
      pAltFt,
      headwindKt ?? 0,
      oatC,
      vref,
      out.vapp ?? vref,
      rev === "ALL OP"
    );
    out.landingDistanceM = dist;
    if (dist == null) out.warnings.push(`No landing-distance row for Flaps ${flap} / ${config} at this condition.`);
    out.warnings.push(`Runway condition mapped to reported braking action "${RCAM_MAP[cond]}" (approximation below WET — no contaminant-depth landing data in the dataset).`);

    // The real OPT's "LDG Enroute" screen shows the landing distance for
    // every autobrake setting side by side (MAX MANUAL / 1 / 2 / 3 / MAX
    // AUTO) rather than just the one selected in BRKS, so the pilot can
    // compare margins at a glance — reuse the same per-row computation for
    // each configuration.
    const allConfigs = [
      { key: "maxManual", label: "MAX MANUAL", config: "MAX MANUAL" },
      { key: "auto1", label: "AUTO 1", config: "AUTOBRAKE 1" },
      { key: "auto2", label: "AUTO 2", config: "AUTOBRAKE 2" },
      { key: "auto3", label: "AUTO 3", config: "AUTOBRAKE 3" },
      { key: "maxAuto", label: "MAX AUTO", config: "AUTOBRAKE MAX" },
    ];
    out.allBrakeDistancesM = allConfigs.map(({ key, label, config: cfg }) => ({
      key,
      label,
      distanceM: landingDistanceM(data.distanceNormal, flap, cond, cfg, weightKg, pAltFt, headwindKt ?? 0, oatC, vref, out.vapp ?? vref, rev === "ALL OP"),
    }));
  } else if (!data.distanceNormal) {
    out.warnings.push("Landing-distance data file not loaded.");
  }

  if (vref != null && data.quickTurnaround) {
    const brakesOnSpeedKt = vref - (dispatchFactoredHeadwindKt(headwindKt ?? 0) ?? 0);
    out.brakeCooling = brakeCoolingByConfig(data.quickTurnaround, weightKg, oatC, pAltFt, brakesOnSpeedKt, rev === "ALL OP");
    out.warnings.push("Brake cooling schedule assumes Category C (steel) brakes — no brake-type selector in this tool.");
  }

  return out;
}
