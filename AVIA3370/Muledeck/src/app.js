(async function () {
  const depInput = document.getElementById("dep-input");
  const destInput = document.getElementById("dest-input");
  const altnInput = document.getElementById("altn-input");
  const depSuggest = document.getElementById("dep-suggest");
  const destSuggest = document.getElementById("dest-suggest");
  const altnSuggest = document.getElementById("altn-suggest");
  const routeInput = document.getElementById("route-input");
  const plotBtn = document.getElementById("plot-btn");
  const statusMsg = document.getElementById("status-msg");
  const swapBtn = document.getElementById("swap-btn");
  const cycleLabel = document.getElementById("cycle-label");

  const togDep = document.getElementById("tog-dep");
  const togDest = document.getElementById("tog-dest");
  const togAltn = document.getElementById("tog-altn");
  const toggles = { dep: togDep, dest: togDest, altn: togAltn };
  const procTabs = [...document.querySelectorAll(".proc-tab")];
  const procList = document.getElementById("proc-list");
  const mapEl = document.getElementById("map");
  const chartViewer = document.getElementById("chart-viewer");
  const chartFrame = document.getElementById("chart-viewer-frame");
  const chartTitle = document.getElementById("chart-viewer-title");
  const chartClose = document.getElementById("chart-viewer-close");
  const chartZoomIn = document.getElementById("chart-zoom-in");
  const chartZoomOut = document.getElementById("chart-zoom-out");
  const chartZoomLabel = document.getElementById("chart-zoom-label");
  const chartRotate = document.getElementById("chart-rotate");
  const chartReset = document.getElementById("chart-reset");

  const state = {
    dep: null,
    dest: null,
    altn: null,
    activeAptSide: "dep", // "dep" | "dest" | "altn"
    activeProc: "TAXI",
    chartIndex: null,
  };

  setStatus("Loading FAA data…");
  MapView.init("map");
  await Promise.all([Airports.init(), Route.init()]);
  state.chartIndex = await Data.charts();
  cycleLabel.textContent = `d-TPP cycle ${state.chartIndex.cycle} (effective ${state.chartIndex.effective.trim()})`;
  setStatus("Ready. Enter departure, destination, and a route.", "ok");

  Airports.attachAutocomplete(depInput, depSuggest, (a) => {
    state.dep = a;
    togDep.querySelector(".apt-toggle-code").textContent = a.icao;
    if (state.activeAptSide === "dep") renderProcList();
    MapView.centerOn(a.lat, a.lon, 10);
  });
  Airports.attachAutocomplete(destInput, destSuggest, (a) => {
    state.dest = a;
    togDest.querySelector(".apt-toggle-code").textContent = a.icao;
    if (state.activeAptSide === "dest") renderProcList();
  });
  Airports.attachAutocomplete(altnInput, altnSuggest, (a) => {
    state.altn = a;
    togAltn.querySelector(".apt-toggle-code").textContent = a.icao;
    if (state.activeAptSide === "altn") renderProcList();
    MapView.showAlternate(a);
  });

  swapBtn.addEventListener("click", () => {
    const dv = depInput.value;
    depInput.value = destInput.value;
    destInput.value = dv;
    const dObj = state.dep;
    state.dep = state.dest;
    state.dest = dObj;
    togDep.querySelector(".apt-toggle-code").textContent = state.dep ? state.dep.icao : "—";
    togDest.querySelector(".apt-toggle-code").textContent = state.dest ? state.dest.icao : "—";
    renderProcList();
  });

  plotBtn.addEventListener("click", plotRoute);
  routeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") plotRoute();
  });

  function plotRoute() {
    const depCode = depInput.value.trim();
    const destCode = destInput.value.trim();
    if (!depCode || !destCode) {
      setStatus("Enter both a departure and destination airport.", "error");
      return;
    }
    const parsed = Route.parse(depCode, destCode, routeInput.value);
    if (parsed.errors.length) {
      setStatus(parsed.errors.join("  •  "), "error");
    } else {
      setStatus(`Plotted ${parsed.points.length} waypoints, ${parsed.legs.length} legs.`, "ok");
    }
    if (parsed.points.length) MapView.showRoute(parsed);
  }

  togDep.addEventListener("click", () => setAptSide("dep"));
  togDest.addEventListener("click", () => setAptSide("dest"));
  togAltn.addEventListener("click", () => setAptSide("altn"));
  function setAptSide(side) {
    state.activeAptSide = side;
    for (const [key, btn] of Object.entries(toggles)) btn.classList.toggle("active", key === side);
    renderProcList();
  }

  for (const tab of procTabs) {
    tab.addEventListener("click", () => {
      procTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.activeProc = tab.dataset.proc;
      renderProcList();
    });
  }

  function renderProcList() {
    const airport = state[state.activeAptSide];
    if (!airport) {
      procList.innerHTML = '<div class="proc-empty">Select an airport above.</div>';
      return;
    }
    const entry = state.chartIndex.airports[airport.icao];
    if (!entry) {
      procList.innerHTML = `<div class="proc-empty">No published procedures found for ${airport.icao}.</div>`;
      return;
    }
    const items = entry[state.activeProc] || [];
    if (!items.length) {
      procList.innerHTML = `<div class="proc-empty">No ${state.activeProc} charts for ${airport.icao}.</div>`;
      return;
    }
    procList.innerHTML = items
      .map(
        (it, i) => `
      <div class="proc-item" data-i="${i}">
        <svg class="p-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h6M9 17h6"/></svg>
        <span class="p-name">${escapeHtml(it.name)}</span>
      </div>`
      )
      .join("");
    [...procList.children].forEach((el, i) => {
      el.addEventListener("click", () => openChart(airport, items[i]));
    });
  }

  const chartView = { zoom: 1, rotation: 0 };
  const CHART_ZOOM_MIN = 0.5;
  const CHART_ZOOM_MAX = 3;

  function applyChartTransform() {
    // At 90/270 deg swap the iframe's layout size so the rotated page
    // fills the stage exactly (no grey side bands).
    const stage = chartFrame.parentElement;
    if (chartView.rotation % 180 !== 0 && stage.clientWidth) {
      chartFrame.style.width = stage.clientHeight + "px";
      chartFrame.style.height = stage.clientWidth + "px";
    } else {
      chartFrame.style.width = "";
      chartFrame.style.height = "";
    }
    chartFrame.style.transform = `rotate(${chartView.rotation}deg) scale(${chartView.zoom})`;
    chartZoomLabel.textContent = `${Math.round(chartView.zoom * 100)}%`;
  }
  window.addEventListener("resize", () => { if (!chartViewer.hidden) applyChartTransform(); });
  function resetChartTransform() {
    chartView.zoom = 1;
    chartView.rotation = 0;
    applyChartTransform();
  }
  chartZoomIn.addEventListener("click", () => {
    chartView.zoom = Math.min(CHART_ZOOM_MAX, +(chartView.zoom + 0.25).toFixed(2));
    applyChartTransform();
  });
  chartZoomOut.addEventListener("click", () => {
    chartView.zoom = Math.max(CHART_ZOOM_MIN, +(chartView.zoom - 0.25).toFixed(2));
    applyChartTransform();
  });
  chartRotate.addEventListener("click", () => {
    chartView.rotation = (chartView.rotation + 90) % 360;
    applyChartTransform();
  });
  chartReset.addEventListener("click", resetChartTransform);

  function openChart(airport, item) {
    [...procList.children].forEach((el) => el.classList.remove("selected"));
    const idx = state.chartIndex.airports[airport.icao][state.activeProc].indexOf(item);
    if (procList.children[idx]) procList.children[idx].classList.add("selected");
    chartTitle.textContent = `${airport.icao} — ${item.name}`;
    // Trims the browser's native PDF viewer down to just the page --
    // no toolbar/sidebar/thumbnails chrome (Chrome/Chromium honors these
    // open-parameters; strip the fragment for a full PDF.js/Adobe-style UI).
    // Zoom/rotate are done ourselves (CSS transform on the iframe, below)
    // since there's no open-parameter for rotation and this stays reliable
    // across browsers regardless of the embedded viewer's own feature set.
    chartFrame.src = state.chartIndex.pdfBaseUrl + item.pdf + "#toolbar=0&navpanes=0&statusbar=0&view=FitH";
    resetChartTransform();
    // The chart takes over the map's spot; the side panel (with the rest of
    // the procedure list) stays visible so switching charts is one click.
    mapEl.hidden = true;
    chartViewer.hidden = false;
  }
  function closeChart() {
    chartViewer.hidden = true;
    chartFrame.src = "about:blank";
    mapEl.hidden = false;
    MapView.invalidateSize(); // Leaflet needs this after its container was display:none
  }
  chartClose.addEventListener("click", closeChart);

  function setStatus(msg, kind) {
    statusMsg.textContent = msg;
    statusMsg.className = "status-msg" + (kind ? ` ${kind}` : "");
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  renderProcList();
})();
