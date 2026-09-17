let inflight = null;

export async function loadAirports() {
  if (!inflight) {
    inflight = fetch("data/processed/us_airports.json").then((res) => res.json());
  }
  return inflight;
}

export function searchAirports(list, query, limit = 15) {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const scored = [];
  for (const a of list) {
    let score = -1;
    if (a.icao && a.icao === q) score = 0;
    else if (a.iata && a.iata === q) score = 1;
    else if (a.ident === q) score = 1;
    else if (a.icao && a.icao.startsWith(q)) score = 2;
    else if (a.iata && a.iata.startsWith(q)) score = 3;
    else if (a.name && a.name.toUpperCase().startsWith(q)) score = 4;
    else if (a.city && a.city.toUpperCase().startsWith(q)) score = 5;
    else if (a.name && a.name.toUpperCase().includes(q)) score = 6;
    else if (a.city && a.city.toUpperCase().includes(q)) score = 7;
    if (score >= 0) scored.push([score, a]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map((s) => s[1]);
}

export function attachAirportAutocomplete({ inputEl, listEl, runwaySelectEl, onSelect }) {
  let airports = null;
  let active = -1;

  loadAirports().then((a) => (airports = a));

  function render(results) {
    listEl.innerHTML = "";
    active = -1;
    if (!results.length) {
      listEl.classList.remove("open");
      return;
    }
    results.forEach((a, i) => {
      const div = document.createElement("div");
      div.className = "ac-item";
      div.dataset.idx = i;
      const code = a.icao || a.iata || a.ident;
      div.innerHTML = `<span class="code">${code}</span>${a.name}<span class="sub">${a.city || ""}${a.state ? ", " + a.state : ""} &middot; elev ${a.elevation_ft ?? "?"} ft &middot; ${a.runways.length} rwy end(s)</span>`;
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectAirport(a);
      });
      listEl.appendChild(div);
    });
    listEl.classList.add("open");
  }

  function selectAirport(a) {
    const icao = a.icao || a.ident;
    const iata = a.iata;
    inputEl.value = iata && iata !== icao ? `${icao}/${iata}` : icao;
    inputEl.dataset.ident = a.ident;
    listEl.classList.remove("open");
    populateRunways(a);
    if (onSelect) onSelect(a);
  }

  function populateRunways(a) {
    runwaySelectEl.innerHTML = "";
    const sorted = [...a.runways].sort((x, y) => (y.length_ft || 0) - (x.length_ft || 0));
    for (const r of sorted) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.id;
      runwaySelectEl.appendChild(opt);
    }
  }

  inputEl.addEventListener("input", () => {
    delete inputEl.dataset.ident;
    if (!airports) return;
    render(searchAirports(airports, inputEl.value));
  });

  inputEl.addEventListener("keydown", (e) => {
    const items = [...listEl.children];
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(active + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle("active", i === active));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      items.forEach((it, i) => it.classList.toggle("active", i === active));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      items[active].dispatchEvent(new Event("mousedown"));
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target !== inputEl) listEl.classList.remove("open");
  });

  return {
    getSelected: () => {
      const ident = inputEl.dataset.ident;
      if (!ident || !airports) return null;
      return airports.find((a) => a.ident === ident) || null;
    },
    getRunway: (airport, rwyId) => airport?.runways.find((r) => r.id === rwyId) || null,
  };
}
