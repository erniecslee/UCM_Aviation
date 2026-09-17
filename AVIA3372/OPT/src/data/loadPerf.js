const BASE = "data/processed/performance/";
const cache = new Map();

async function loadJson(name) {
  if (!cache.has(name)) {
    cache.set(
      name,
      fetch(BASE + name).then((r) => {
        if (!r.ok) throw new Error(`failed to load ${name}: ${r.status}`);
        return r.json();
      })
    );
  }
  return cache.get(name);
}

export async function loadTakeoffData() {
  const [
    fieldClimbDry,
    fieldClimbWet,
    adjustments,
    obstacle,
    vspeedsDry,
    vspeedsWet,
    n1AssumedTemp,
    vrefTrim,
    contaminated,
    vspeedsTo1,
    vspeedsTo2,
    n1To1To2,
  ] = await Promise.all([
    loadJson("takeoff_field_climb_dry.json"),
    loadJson("takeoff_field_climb_wet.json"),
    loadJson("takeoff_field_climb_adjustments.json"),
    loadJson("takeoff_obstacle.json"),
    loadJson("takeoff_vspeeds_dry.json"),
    loadJson("takeoff_vspeeds_wet.json"),
    loadJson("takeoff_n1_and_assumed_temp.json"),
    loadJson("landing_vref_and_trim.json"),
    loadJson("takeoff_contaminated.json"),
    loadJson("takeoff_vspeeds_to1.json"),
    loadJson("takeoff_vspeeds_to2.json"),
    loadJson("takeoff_n1_and_assumed_temp_to1_to2.json"),
  ]);
  return {
    fieldClimbDry,
    fieldClimbWet,
    adjustments,
    obstacle,
    vspeedsDry,
    vspeedsWet,
    n1AssumedTemp,
    vrefTrim,
    contaminated,
    vspeedsTo1Dry: vspeedsTo1.dry,
    vspeedsTo1Wet: vspeedsTo1.wet,
    vspeedsTo2Dry: vspeedsTo2.dry,
    vspeedsTo2Wet: vspeedsTo2.wet,
    n1To1: n1To1To2.to1,
    n1To2: n1To1To2.to2,
  };
}

export async function loadLandingData() {
  const [vrefTrim, fieldDispatch, climbGoAround] = await Promise.all([
    loadJson("landing_vref_and_trim.json"),
    loadJson("landing_field_dispatch.json"),
    loadJson("landing_climb_and_goaround.json"),
  ]);
  let distanceNormal = null;
  let distanceNonNormal = null;
  let quickTurnaround = null;
  try {
    distanceNormal = await loadJson("landing_distance_normal.json");
  } catch {
    /* not transcribed yet */
  }
  try {
    distanceNonNormal = await loadJson("landing_distance_nonnormal.json");
  } catch {
    /* not transcribed yet */
  }
  try {
    quickTurnaround = await loadJson("quick_turnaround.json");
  } catch {
    /* not transcribed yet */
  }
  return { vrefTrim, fieldDispatch, climbGoAround, distanceNormal, distanceNonNormal, quickTurnaround };
}
