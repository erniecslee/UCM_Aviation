// Lazy-loaded, cached access to the processed FAA data files.
const Data = (() => {
  const cache = {};

  function loadJson(path) {
    if (!cache[path]) {
      cache[path] = fetch(path).then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
        return r.json();
      });
    }
    return cache[path];
  }

  return {
    airports: () => loadJson("data/processed/us_airports.json"),
    navaids: () => loadJson("data/processed/navaids.json"),
    fixes: () => loadJson("data/processed/fixes.json"),
    airways: () => loadJson("data/processed/airways.json"),
    artcc: () => loadJson("data/processed/artcc_boundaries.geojson"),
    charts: () => loadJson("data/processed/chart_index.json"),
  };
})();
