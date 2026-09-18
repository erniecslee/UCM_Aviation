// Leaflet map: hypsometric (green-lowland/brown-mountain) terrain base in
// an EFB-ish style, toggleable nationwide reference layers (waypoints /
// airways / airports / FIR-equivalent ARTCC boundaries / an approximate
// Grid-MORA-style altitude grid), always-labeled points/lines, and the
// plotted route with its waypoints + an optional alternate airport.
const MapView = (() => {
  let map;
  let routeLayer, waypointLayer, altnLayer, artccLayer;
  let networkAirports, networkWaypoints, networkAirways, moraLayer;
  let terrainTile, plainTile, refTile;
  const canvas = () => L.canvas({ padding: 0.3 });

  // Below these zoom levels a nationwide layer would just be visual noise
  // (and, for waypoints, tens of thousands of DOM/canvas ops) -- same
  // declutter-by-scale idea real sectional/enroute charts use.
  const ZOOM_GATE = { airports: 6, waypoints: 8, airways: 6, mora: 7 };
  const FIX_LABEL_ZOOM = 9; // fixes are dense -- only label once zoomed in further than the dot gate
  const MORA_MAX_CELLS = 200; // safety cap: skip (not spam-fetch) if the view spans too much

  const layerState = { terrain: true, waypoints: false, airways: false, airports: false, artcc: true, mora: false };
  let redrawTimer = null;

  function init(containerId) {
    map = L.map(containerId, { zoomControl: true }).setView([39.5, -98.35], 5);

    // A clean physical/hypsometric relief -- terrain color only, no roads,
    // trails, cities or other VFR-sectional-style clutter (that's what
    // OpenTopoMap gave us and the user explicitly didn't want).
    terrainTile = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Terrain: Esri, USGS, NOAA", maxNativeZoom: 8, maxZoom: 13 }
    );
    plainTile = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri", maxZoom: 13 }
    );
    refTile = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri", maxZoom: 13, opacity: 0.85 }
    );
    terrainTile.addTo(map);

    routeLayer = L.layerGroup().addTo(map);
    waypointLayer = L.layerGroup().addTo(map);
    altnLayer = L.layerGroup().addTo(map);
    artccLayer = L.layerGroup().addTo(map);
    networkAirports = L.layerGroup();
    networkWaypoints = L.layerGroup();
    networkAirways = L.layerGroup();
    moraLayer = L.layerGroup();

    loadArtcc();
    addLayerControl();

    map.on("moveend zoomend", scheduleNetworkRedraw);
    return map;
  }

  function addLayerControl() {
    const Control = L.Control.extend({
      options: { position: "topright" },
      onAdd() {
        const div = L.DomUtil.create("div", "layer-control");
        div.innerHTML = `
          <div class="lc-title">MAP LAYERS</div>
          <label><input type="checkbox" data-layer="terrain" checked> Terrain</label>
          <label><input type="checkbox" data-layer="artcc" checked> FIR Boundary</label>
          <label><input type="checkbox" data-layer="airports"> Airports</label>
          <label><input type="checkbox" data-layer="waypoints"> Waypoints</label>
          <label><input type="checkbox" data-layer="airways"> Airways</label>
          <label title="Approximate off-route clearance grid, computed from public elevation data -- not an official Jeppesen Grid MORA or FAA OROCA figure."><input type="checkbox" data-layer="mora"> Grid MORA (approx.)</label>
        `;
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        div.querySelectorAll("input").forEach((cb) => {
          cb.addEventListener("change", () => setLayer(cb.dataset.layer, cb.checked));
        });
        return div;
      },
    });
    map.addControl(new Control());
  }

  function setLayer(name, on) {
    layerState[name] = on;
    if (name === "terrain") {
      map.removeLayer(on ? plainTile : terrainTile);
      map.removeLayer(refTile);
      map.addLayer(on ? terrainTile : plainTile);
      if (!on) map.addLayer(refTile); // OpenTopoMap already carries labels/roads; the plain basemap needs the reference overlay
      return;
    }
    if (name === "artcc") {
      on ? map.addLayer(artccLayer) : map.removeLayer(artccLayer);
      return;
    }
    const layer = { airports: networkAirports, waypoints: networkWaypoints, airways: networkAirways, mora: moraLayer }[name];
    if (on) {
      map.addLayer(layer);
      redrawNetworkLayer(name);
    } else {
      map.removeLayer(layer);
    }
  }

  function scheduleNetworkRedraw() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(() => {
      if (layerState.airports) redrawNetworkLayer("airports");
      if (layerState.waypoints) redrawNetworkLayer("waypoints");
      if (layerState.airways) redrawNetworkLayer("airways");
      if (layerState.mora) redrawNetworkLayer("mora");
    }, 150);
  }

  async function redrawNetworkLayer(name) {
    const zoom = map.getZoom();
    const layer = { airports: networkAirports, waypoints: networkWaypoints, airways: networkAirways, mora: moraLayer }[name];
    if (zoom < ZOOM_GATE[name]) {
      layer.clearLayers();
      return;
    }
    const bounds = map.getBounds().pad(0.15);
    if (name === "airports") return drawAirports(bounds);
    if (name === "waypoints") return drawWaypoints(bounds, zoom);
    if (name === "airways") return drawAirways(bounds);
    if (name === "mora") return drawMora(bounds);
  }

  function label(text, opts = {}) {
    return { permanent: true, direction: "right", offset: [5, 0], className: "net-label", opacity: 0.95, ...opts };
  }

  async function drawAirports(bounds) {
    const airports = await Data.airports();
    networkAirports.clearLayers();
    const renderer = canvas();
    for (const a of airports) {
      if (!bounds.contains([a.lat, a.lon])) continue;
      L.circleMarker([a.lat, a.lon], {
        renderer, radius: a.hasCharts ? 3.5 : 2.5,
        color: "#1a1a1a", weight: 1, fillOpacity: 0.95, fillColor: a.hasCharts ? "#CF202E" : "#F5A623",
      })
        .bindTooltip(a.icao, label({ direction: "top", offset: [0, -4] }))
        .addTo(networkAirports);
    }
  }

  async function drawWaypoints(bounds, zoom) {
    const [fixes, navaids] = await Promise.all([Data.fixes(), Data.navaids()]);
    networkWaypoints.clearLayers();
    const showFixLabels = zoom >= FIX_LABEL_ZOOM;
    for (const f of fixes) {
      if (!bounds.contains([f.lat, f.lon])) continue;
      const m = L.marker([f.lat, f.lon], { icon: fixIcon }).addTo(networkWaypoints);
      if (showFixLabels) m.bindTooltip(f.id, label());
    }
    for (const n of navaids) {
      if (!bounds.contains([n.lat, n.lon])) continue;
      L.marker([n.lat, n.lon], { icon: navaidIcon })
        .bindTooltip(`${n.id} (${n.type}${n.freq ? " " + n.freq : ""})`, label())
        .addTo(networkWaypoints);
    }
  }

  // Standard aviation symbology: fixes/intersections as a triangle, navaids
  // (VOR/VORTAC/NDB) as a hexagon -- distinct shapes at a glance, same as
  // a real enroute chart's legend, rather than plain generic dots.
  const fixIcon = L.divIcon({
    className: "", iconSize: [11, 11], iconAnchor: [5.5, 5.5],
    html: '<svg width="11" height="11" viewBox="0 0 24 24"><polygon points="12,3 22,20 2,20" fill="#1a1a1a" stroke="#ffffff" stroke-width="1.5"/></svg>',
  });
  const navaidIcon = L.divIcon({
    className: "", iconSize: [15, 15], iconAnchor: [7.5, 7.5],
    html: '<svg width="15" height="15" viewBox="0 0 24 24"><polygon points="12,2 20,7 20,17 12,22 4,17 4,7" fill="#4B8BE0" stroke="#0B3C8C" stroke-width="1.6"/></svg>',
  });

  async function drawAirways(bounds) {
    const airways = await Data.airways();
    networkAirways.clearLayers();
    const renderer = canvas();
    for (const aw of airways) {
      const hit = aw.segments.some(
        (s) => bounds.contains([s.fromLat, s.fromLon]) || bounds.contains([s.toLat, s.toLon])
      );
      if (!hit) continue;
      const latlngs = aw.points.map((p) => [p.lat, p.lon]);
      L.polyline(latlngs, { renderer, color: "#7A4FBE", weight: 1.2, opacity: 0.85 })
        .bindTooltip(aw.id, label({ direction: "center", permanent: true, className: "net-label net-label-awy" }))
        .addTo(networkAirways);
    }
  }

  async function drawMora(bounds) {
    moraLayer.clearLayers();
    const lat0 = Math.floor(bounds.getSouth());
    const lat1 = Math.ceil(bounds.getNorth());
    const lon0 = Math.floor(bounds.getWest());
    const lon1 = Math.ceil(bounds.getEast());
    const cells = [];
    for (let la = lat0; la < lat1; la++) {
      for (let lo = lon0; lo < lon1; lo++) cells.push([la, lo]);
    }
    if (cells.length > MORA_MAX_CELLS) return; // zoom in further -- same declutter-by-scale idea as the other layers

    const gridStyle = { color: "#3a3a3a", weight: 0.6, opacity: 0.5, dashArray: "2,3", interactive: false };
    for (let la = lat0; la <= lat1; la++) L.polyline([[la, lon0], [la, lon1]], gridStyle).addTo(moraLayer);
    for (let lo = lon0; lo <= lon1; lo++) L.polyline([[lat0, lo], [lat1, lo]], gridStyle).addTo(moraLayer);

    for (const [la, lo] of cells) {
      const result = await Mora.cellValue(la, lo);
      if (!result) continue;
      L.marker([la + 0.5, lo + 0.5], {
        icon: L.divIcon({ className: "mora-cell", html: result.code, iconSize: null, iconAnchor: [14, 8] }),
        interactive: false,
      }).addTo(moraLayer);
    }
  }

  async function loadArtcc() {
    const fc = await Data.artcc();
    const low = { ...fc, features: fc.features.filter((f) => f.properties.altitude === "LOW") };
    L.geoJSON(low, { style: { color: "#5B6779", weight: 1.4, fillOpacity: 0, dashArray: "4,5" } }).addTo(artccLayer);
    for (const f of low.features) {
      const layer = L.geoJSON(f.geometry);
      const center = layer.getBounds().getCenter();
      L.marker(center, {
        icon: L.divIcon({
          className: "artcc-label",
          html: `${f.properties.id}<span class="artcc-sub">${f.properties.label}</span>`,
          iconSize: [140, 28],
        }),
        interactive: false,
      }).addTo(artccLayer);
    }
  }

  function wpIcon(kind) {
    const shapes = {
      airport: { size: 10, html: '<div style="width:10px;height:10px;background:#CF202E;border-radius:2px;transform:rotate(45deg);border:1.5px solid #1a1a1a;"></div>' },
      navaid: { size: 12, html: '<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #0B3C8C;"></div>' },
      fix: { size: 8, html: '<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid #1a1a1a;"></div>' },
    };
    const s = shapes[kind] || shapes.fix;
    return L.divIcon({ className: "", html: s.html, iconSize: [s.size, s.size], iconAnchor: [s.size / 2, s.size / 2] });
  }

  function showRoute(parsed) {
    routeLayer.clearLayers();
    waypointLayer.clearLayers();
    if (!parsed.points.length) return;

    const latlngs = parsed.points.map((p) => [p.lat, p.lon]);
    L.polyline(latlngs, { color: "#CF202E", weight: 3, dashArray: "10,6" }).addTo(routeLayer);

    for (const leg of parsed.legs) {
      if (!leg.airway) continue;
      const a = parsed.points.find((p) => p.id === leg.from);
      const b = parsed.points.find((p) => p.id === leg.to);
      if (!a || !b) continue;
      const mid = [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2];
      L.marker(mid, {
        icon: L.divIcon({ className: "wp-label", html: leg.airway, iconSize: null }),
        interactive: false,
      }).addTo(routeLayer);
    }

    for (const p of parsed.points) {
      L.marker([p.lat, p.lon], { icon: wpIcon(p.kind) }).addTo(waypointLayer);
      const labelClass = p.kind === "airport" ? "apt-label" : "wp-label";
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({ className: labelClass, html: p.id, iconSize: null, iconAnchor: [-8, 8] }),
        interactive: false,
      }).addTo(waypointLayer);
    }

    map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60] });
  }

  function showAlternate(airport) {
    altnLayer.clearLayers();
    if (!airport) return;
    L.marker([airport.lat, airport.lon], {
      icon: L.divIcon({
        className: "",
        html: '<div style="width:10px;height:10px;border:2px dashed #A7A9AC;border-radius:2px;transform:rotate(45deg);"></div>',
        iconSize: [10, 10], iconAnchor: [5, 5],
      }),
    }).addTo(altnLayer);
    L.marker([airport.lat, airport.lon], {
      icon: L.divIcon({ className: "altn-label", html: `ALTN ${airport.icao}`, iconSize: null, iconAnchor: [-8, 8] }),
      interactive: false,
    }).addTo(altnLayer);
  }

  function centerOn(lat, lon, zoom = 10) {
    map.setView([lat, lon], zoom);
  }

  function invalidateSize() {
    map.invalidateSize();
  }

  return { init, showRoute, showAlternate, centerOn, invalidateSize };
})();
