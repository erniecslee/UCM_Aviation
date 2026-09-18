// ICAO flight-plan route-string parser: WAYPOINT AIRWAY WAYPOINT AIRWAY ...
// (DCT segments and bare waypoints are direct legs). Resolves idents
// against real FAA navaids/fixes/airports and traces real airway
// point sequences between two named points on that airway.
const Route = (() => {
  let navaidsById = new Map();
  let fixesById = new Map();
  let airwaysById = new Map(); // id -> [variant, ...] (location may differ)

  async function init() {
    const [navaids, fixes, airways] = await Promise.all([
      Data.navaids(),
      Data.fixes(),
      Data.airways(),
    ]);
    navaidsById = new Map(navaids.map((n) => [n.id.toUpperCase(), n]));
    fixesById = new Map();
    for (const f of fixes) {
      const k = f.id.toUpperCase();
      if (!fixesById.has(k)) fixesById.set(k, f);
    }
    airwaysById = new Map();
    for (const a of airways) {
      const k = a.id.toUpperCase();
      if (!airwaysById.has(k)) airwaysById.set(k, []);
      airwaysById.get(k).push(a);
    }
  }

  function resolvePoint(ident) {
    const id = ident.toUpperCase();
    const airport = Airports.get(id);
    if (airport) return { id, lat: airport.lat, lon: airport.lon, kind: "airport" };
    const nav = navaidsById.get(id);
    if (nav) return { id, lat: nav.lat, lon: nav.lon, kind: "navaid", navType: nav.type };
    const fix = fixesById.get(id);
    if (fix) return { id, lat: fix.lat, lon: fix.lon, kind: "fix" };
    return null;
  }

  function tracePoints(airway, fromId, toId) {
    const pts = airway.points;
    const fromIdx = pts.findIndex((p) => p.id.toUpperCase() === fromId);
    const toIdx = pts.findIndex((p) => p.id.toUpperCase() === toId);
    if (fromIdx === -1 || toIdx === -1) return null;
    const slice =
      fromIdx <= toIdx ? pts.slice(fromIdx, toIdx + 1) : pts.slice(toIdx, fromIdx + 1).reverse();
    return slice;
  }

  /**
   * @returns {{points: Array, legs: Array, errors: string[]}}
   * points: [{id, lat, lon, kind, viaAirway}], dep/dest always included.
   * legs: [{airway: string|null, from, to}] one per drawn segment (for map airway highlighting).
   */
  function parse(depIcao, destIcao, routeString) {
    const errors = [];
    const dep = Airports.get(depIcao);
    const dest = Airports.get(destIcao);
    if (!dep) errors.push(`Unknown departure airport: ${depIcao || "(none)"}`);
    if (!dest) errors.push(`Unknown destination airport: ${destIcao || "(none)"}`);
    if (!dep || !dest) return { points: [], legs: [], errors };

    const points = [{ id: dep.icao, lat: dep.lat, lon: dep.lon, kind: "airport" }];
    const legs = [];
    const tokens = routeString
      .trim()
      .toUpperCase()
      .split(/\s+/)
      .filter((t) => t && t !== "DCT");

    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      const cur = points[points.length - 1];
      const variants = airwaysById.get(tok);
      if (variants && i + 1 < tokens.length) {
        const nextTok = tokens[i + 1];
        const aw = variants.find(
          (a) =>
            a.points.some((p) => p.id.toUpperCase() === cur.id) &&
            a.points.some((p) => p.id.toUpperCase() === nextTok)
        );
        if (aw) {
          const traced = tracePoints(aw, cur.id, nextTok);
          for (const p of traced.slice(1)) {
            points.push({ id: p.id, lat: p.lat, lon: p.lon, kind: "fix", viaAirway: tok });
          }
          legs.push({ airway: tok, from: cur.id, to: nextTok });
          i += 2;
          continue;
        }
        errors.push(`Could not trace airway ${tok} from ${cur.id} to ${nextTok}`);
      }
      const loc = resolvePoint(tok);
      if (loc) {
        points.push(loc);
        legs.push({ airway: null, from: cur.id, to: loc.id });
      } else {
        errors.push(`Unknown waypoint: ${tok}`);
      }
      i++;
    }

    const last = points[points.length - 1];
    if (last.id !== dest.icao) {
      points.push({ id: dest.icao, lat: dest.lat, lon: dest.lon, kind: "airport" });
      legs.push({ airway: null, from: last.id, to: dest.icao });
    }

    return { points, legs, errors };
  }

  return { init, parse, resolvePoint };
})();
