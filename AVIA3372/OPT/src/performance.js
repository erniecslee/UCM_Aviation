// B737-800 performance engine entry points, backed by transcribed FCOM tables
// (see src/calc/takeoff.js and src/calc/landing.js).

import { loadTakeoffData, loadLandingData } from "./data/loadPerf.js";
import { computeTakeoff } from "./calc/takeoff.js";
import { computeLanding } from "./calc/landing.js";

let takeoffDataPromise = null;
function getTakeoffData() {
  if (!takeoffDataPromise) takeoffDataPromise = loadTakeoffData();
  return takeoffDataPromise;
}

let landingDataPromise = null;
function getLandingData() {
  if (!landingDataPromise) landingDataPromise = loadLandingData();
  return landingDataPromise;
}

export async function takeoffPerformance(inputs) {
  const data = await getTakeoffData();
  return computeTakeoff(data, inputs);
}

export async function landingPerformance(inputs) {
  const data = await getLandingData();
  return computeLanding(data, inputs);
}
