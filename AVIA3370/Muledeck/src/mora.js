// Approximate "Grid MORA" (Off-Route Obstruction Clearance Altitude style)
// overlay, computed from real public elevation data -- NOT an official
// Jeppesen Grid MORA or FAA OROCA figure. Elevation source: AWS Open Data
// "Terrarium" terrain tiles (elevation-tiles-prod, derived from SRTM/GMTED,
// public domain-derived, no API key). Values are a teaching approximation
// only and must never be used for actual obstacle clearance decisions.
const Mora = (() => {
  const TILE_Z = 7; // ~0.028 deg/px at these latitudes -- plenty for a 1x1 deg cell
  const tileCache = new Map(); // "z/x/y" -> Promise<Int16Array 256*256 elevation meters>
  const cellCache = new Map(); // "lat0,lon0" -> Promise<{ft, code}>

  function lonToWorldX(lon, z) {
    return ((lon + 180) / 360) * (1 << z) * 256;
  }
  function latToWorldY(lat, z) {
    const rad = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * (1 << z) * 256;
  }

  async function getTile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (!tileCache.has(key)) {
      tileCache.set(
        key,
        (async () => {
          const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
          const resp = await fetch(url);
          if (!resp.ok) return null;
          const blob = await resp.blob();
          const bitmap = await createImageBitmap(blob);
          const c = document.createElement("canvas");
          c.width = 256;
          c.height = 256;
          const ctx = c.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          const data = ctx.getImageData(0, 0, 256, 256).data;
          const elev = new Float32Array(256 * 256);
          for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            elev[p] = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
          }
          return elev;
        })()
      );
    }
    return tileCache.get(key);
  }

  // Off-route clearance rule (FAA-OROCA-style): +1000ft over terrain/obstacle
  // below 5000ft MSL, +2000ft at/above 5000ft, then rounded UP to the next 100ft.
  function orocaFromMaxElevFt(maxElevFt) {
    const buffer = maxElevFt < 5000 ? 1000 : 2000;
    return Math.ceil((maxElevFt + buffer) / 100) * 100;
  }

  async function cellValue(lat0, lon0) {
    const key = `${lat0},${lon0}`;
    if (!cellCache.has(key)) {
      cellCache.set(
        key,
        (async () => {
          const centerLat = lat0 + 0.5;
          const centerLon = lon0 + 0.5;
          const tileX = Math.floor(lonToWorldX(centerLon, TILE_Z) / 256);
          const tileY = Math.floor(latToWorldY(centerLat, TILE_Z) / 256);
          const elev = await getTile(TILE_Z, tileX, tileY);
          if (!elev) return null;
          const originX = tileX * 256;
          const originY = tileY * 256;
          let maxM = -Infinity;
          const N = 9;
          for (let i = 0; i <= N; i++) {
            for (let j = 0; j <= N; j++) {
              const lon = lon0 + i / N;
              const lat = lat0 + j / N;
              let px = Math.round(lonToWorldX(lon, TILE_Z) - originX);
              let py = Math.round(latToWorldY(lat, TILE_Z) - originY);
              px = Math.min(255, Math.max(0, px));
              py = Math.min(255, Math.max(0, py));
              const m = elev[py * 256 + px];
              if (m > maxM) maxM = m;
            }
          }
          if (!isFinite(maxM)) return null;
          const maxFt = maxM * 3.28084;
          const orocaFt = orocaFromMaxElevFt(Math.max(0, maxFt));
          return { ft: orocaFt, code: String(Math.round(orocaFt / 100)).padStart(3, "0") };
        })()
      );
    }
    return cellCache.get(key);
  }

  return { cellValue };
})();
