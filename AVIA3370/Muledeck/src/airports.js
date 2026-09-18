// Airport lookup + DEP/DEST autocomplete.
const Airports = (() => {
  let list = [];
  let byIcao = new Map();

  async function init() {
    list = await Data.airports();
    byIcao = new Map(list.map((a) => [a.icao.toUpperCase(), a]));
    return list;
  }

  function get(code) {
    return byIcao.get((code || "").trim().toUpperCase());
  }

  function search(query, limit = 8) {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const starts = [];
    const contains = [];
    for (const a of list) {
      const icao = a.icao.toUpperCase();
      const hay = `${a.name} ${a.city}`.toUpperCase();
      if (icao.startsWith(q)) starts.push(a);
      else if (hay.includes(q)) contains.push(a);
      if (starts.length >= limit) break;
    }
    return starts.concat(contains).slice(0, limit);
  }

  function attachAutocomplete(inputEl, suggestEl, onSelect) {
    let hiIndex = -1;
    let current = [];

    function render(results) {
      current = results;
      hiIndex = -1;
      if (!results.length) {
        suggestEl.classList.remove("open");
        suggestEl.innerHTML = "";
        return;
      }
      suggestEl.innerHTML = results
        .map(
          (a, i) => `
        <div class="suggest-item" data-i="${i}">
          <span class="code">${a.icao}</span><span class="name">${a.name}, ${a.city} ${a.state}</span>
          ${a.hasCharts ? '<span class="charts-flag">CHARTS</span>' : ""}
        </div>`
        )
        .join("");
      suggestEl.classList.add("open");
    }

    inputEl.addEventListener("input", () => {
      render(search(inputEl.value));
    });
    inputEl.addEventListener("focus", () => {
      if (inputEl.value.trim()) render(search(inputEl.value));
    });
    inputEl.addEventListener("keydown", (e) => {
      if (!current.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        hiIndex = Math.min(hiIndex + 1, current.length - 1);
        updateHi();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        hiIndex = Math.max(hiIndex - 1, 0);
        updateHi();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const pick = current[hiIndex] ?? current[0];
        if (pick) choose(pick);
      } else if (e.key === "Escape") {
        suggestEl.classList.remove("open");
      }
    });
    document.addEventListener("click", (e) => {
      if (!suggestEl.contains(e.target) && e.target !== inputEl) {
        suggestEl.classList.remove("open");
      }
    });
    suggestEl.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".suggest-item");
      if (!item) return;
      choose(current[Number(item.dataset.i)]);
    });

    function updateHi() {
      [...suggestEl.children].forEach((el, i) => el.classList.toggle("hi", i === hiIndex));
    }
    function choose(airport) {
      inputEl.value = airport.icao;
      suggestEl.classList.remove("open");
      onSelect(airport);
    }
  }

  return { init, get, search, attachAutocomplete };
})();
