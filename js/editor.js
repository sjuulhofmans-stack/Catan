// Kaarteditor: een leeg hexraster waarop je zelf tegels legt.
// Losse pagina; later wordt dit ingebouwd in het spel (de kaart staat in localStorage onder STORAGE_KEY).
const Editor = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STORAGE_KEY = "hexbord-editor-map";
  const SIZE = 1;

  // Bordvormen als kolomlengtes (flat-top: kolommen van links naar rechts)
  const SHAPES = [
    { id: "basis",       name: "Basis",       columns: [3, 4, 5, 4, 3] },
    { id: "uitbreiding", name: "Uitbreiding", columns: [3, 4, 5, 6, 5, 4, 3] },
    { id: "groot",       name: "Groot",       columns: [4, 5, 6, 7, 6, 5, 4] },
    { id: "zeevaarders", name: "Zeevaarders", columns: [5, 6, 7, 8, 7, 6, 5] },
  ];
  const DEFAULT_SHAPE = "uitbreiding";

  // Richtingen van de buren (flat-top). Index i hoort bij "stand" i+1 van de zee- en haventegels:
  // stand 1 = kust boven, 2 = rechtsboven, 3 = rechtsonder, 4 = onder, 5 = linksonder, 6 = linksboven.
  const DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];

  // Tegelcatalogus.
  //   land:   6 varianten (willekeurig, scroll wisselt)
  //   coast:  12 standen: 1-6 = één kustzijde (kust1), 7-12 = twee kustzijden (kust2)
  //   harbor: 6 standen (steiger richting land)
  //   sea:    open zee, geen afbeelding (de zee eronder blijft zichtbaar)
  const HARBOR_TYPES = [
    ["algemeen", "Haven 3:1"], ["hout", "Haven hout"], ["wol", "Haven wol"],
    ["graan", "Haven graan"], ["steen", "Haven steen"], ["erts", "Haven erts"],
  ];
  const TILES = [
    ...[
      ["hout", "Hout"], ["wol", "Wol"], ["graan", "Graan"], ["steen", "Steen"], ["erts", "Erts"],
      ["goud", "Goud"], ["woestijn", "Woestijn"], ["meer", "Meer"], ["vulkaan", "Vulkaan"],
    ].map(([id, name]) => ({ id, name, kind: "land", count: 6, group: "land" })),
    { id: "zee",  name: "Open zee", kind: "sea",   count: 1,  group: "zee" },
    { id: "kust", name: "Kust",     kind: "coast", count: 12, group: "zee" },
    ...HARBOR_TYPES.map(([t, name]) => ({ id: `haven_${t}`, name, kind: "harbor", count: 6, group: "zee" })),
  ];
  const TILE = Object.fromEntries(TILES.map((t) => [t.id, t]));
  const ROTATES = (id) => TILE[id].kind === "coast" || TILE[id].kind === "harbor";

  function tileSrc(id, variant) {
    const t = TILE[id];
    if (t.kind === "land") return `assets/tiles/land/${id}_${variant}.webp`;
    if (t.kind === "coast") return variant <= 6 ? `assets/tiles/zee/kust1_${variant}.webp` : `assets/tiles/zee/kust2_${variant - 6}.webp`;
    if (t.kind === "harbor") return `assets/tiles/zee/${id}_${variant}.webp`;
    return null;
  }

  const W = 2 * SIZE * 1.004;            // zelfde maat als in board.js (geen naadjes)
  const H = Math.sqrt(3) * SIZE * 1.004;

  const $ = (id) => document.getElementById(id);
  const svg = $("ed-board");

  let shape = SHAPES.find((s) => s.id === DEFAULT_SHAPE);
  let cells = new Map();   // key -> { q, r, center, corners, g, tile }
  let placed = new Map();  // key -> { terrain, variant, auto }
  let selected = null;     // tegel-id of null
  let drag = null;         // null | "place" | "erase"
  let hoverKey = null;

  let layerCells, layerTiles, layerFx, ghost, ghostWater, hoverRing;

  // ---------- Hulpjes ----------
  function el(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  const pointsOf = (corners) => corners.map((c) => `${c.x},${c.y}`).join(" ");
  const neighborKey = (cell, i) => `${cell.q + DIRS[i][0]},${cell.r + DIRS[i][1]}`;
  const isLand = (key) => TILE[placed.get(key)?.terrain]?.kind === "land";

  // Kolommen -> axiale coördinaten, verticaal gecentreerd. Basis (3-4-5-4-3) geeft dezelfde
  // sleutels als Hex.generateHexagon(2) in het spel.
  function shapeHexes(columns) {
    const mid = (columns.length - 1) / 2;
    const out = [];
    columns.forEach((len, i) => {
      const q = i - mid;
      const start = Math.ceil(-(len - 1) / 2 - q / 2);
      for (let r = start; r < start + len; r++) out.push({ q, r, s: -q - r });
    });
    return out;
  }

  // ---------- Opslaan / laden ----------
  function serialize() {
    return {
      version: 1,
      shape: shape.id,
      columns: shape.columns,
      tiles: [...placed].map(([key, t]) => {
        const [q, r] = key.split(",").map(Number);
        return { q, r, terrain: t.terrain, variant: t.variant, ...(ROTATES(t.terrain) && !t.auto ? { auto: false } : {}) };
      }),
    };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize())); } catch { /* privémodus e.d. */ }
  }

  function load(data) {
    shape = SHAPES.find((s) => s.id === data?.shape) ?? SHAPES.find((s) => s.id === DEFAULT_SHAPE);
    placed = new Map();
    for (const t of data?.tiles ?? []) {
      const def = TILE[t.terrain];
      if (!def) continue;
      const variant = Math.min(def.count, Math.max(1, t.variant | 0 || 1));
      placed.set(`${t.q},${t.r}`, { terrain: t.terrain, variant, auto: t.auto !== false });
    }
  }

  // ---------- Rendering ----------
  function buildBoard() {
    cells = new Map();
    svg.replaceChildren();
    layerCells = el("g", { class: "ed-cells" });
    layerTiles = el("g", { class: "ed-tiles" });
    layerFx = el("g", { class: "ed-fx" });
    ghost = el("image", { class: "ed-ghost", width: W, height: H, preserveAspectRatio: "none" });
    ghost.style.display = "none";
    ghostWater = el("polygon", { class: "ed-ghost ed-water" });
    ghostWater.style.display = "none";
    hoverRing = el("polygon", { class: "ed-hover" });
    hoverRing.style.display = "none";

    const all = [];
    for (const hex of shapeHexes(shape.columns)) {
      const key = Hex.key(hex);
      const center = Hex.toPixel(hex, SIZE);
      const corners = Hex.corners(center, SIZE * 0.96);
      all.push(...Hex.corners(center, SIZE));
      const ring = Hex.distance(hex, { q: 0, r: 0, s: 0 });

      const g = el("g", { class: "ed-cell", "data-key": key, style: `--d: ${ring * 60 + Math.random() * 80}ms` });
      g.append(el("polygon", { class: "ed-slot", points: pointsOf(corners) }));
      g.append(el("polygon", { class: "ed-hit", points: pointsOf(Hex.corners(center, SIZE)) }));
      layerCells.append(g);
      cells.set(key, { ...hex, key, center, corners, g, tile: null });
    }

    // Tegels die buiten de nieuwe vorm vallen, vervallen
    let dropped = 0;
    for (const key of [...placed.keys()]) {
      if (!cells.has(key)) { placed.delete(key); dropped++; }
    }

    const p = 0.5 * SIZE;
    const xs = all.map((c) => c.x), ys = all.map((c) => c.y);
    const minX = Math.min(...xs) - p, minY = Math.min(...ys) - p;
    svg.setAttribute("viewBox", `${minX} ${minY} ${Math.max(...xs) + p - minX} ${Math.max(...ys) + p - minY}`);

    svg.append(layerCells, layerTiles, ghost, ghostWater, layerFx, hoverRing);
    for (const [key, t] of placed) {
      drawTile(key, t);
      cells.get(key).tile.style.animationDelay = `${300 + Hex.distance(cells.get(key), { q: 0, r: 0, s: 0 }) * 90}ms`;
    }

    updateSea();
    updateCounts();
    return dropped;
  }

  function drawTile(key, t, { animate = true } = {}) {
    const cell = cells.get(key);
    cell.tile?.remove();
    const src = tileSrc(t.terrain, t.variant);
    const node = src
      ? el("image", {
          href: src,
          x: cell.center.x - W / 2,
          y: cell.center.y - H / 2,
          width: W,
          height: H,
          preserveAspectRatio: "none",
        })
      : el("polygon", { class: "ed-water", points: pointsOf(Hex.corners(cell.center, SIZE)) });
    node.classList.add("ed-tile");
    node.dataset.key = key;
    if (animate) node.classList.add("drop");
    node.addEventListener("animationend", () => {
      node.classList.remove("drop", "swap");
      node.style.animationDelay = "";
    });
    layerTiles.append(node);
    cell.tile = node;
    cell.g.classList.add("filled");
  }

  function ripple(cell, cls) {
    const poly = el("polygon", { class: `ed-ripple ${cls}`, points: pointsOf(Hex.corners(cell.center, SIZE)) });
    poly.addEventListener("animationend", () => poly.remove());
    layerFx.append(poly);
  }

  // ---------- Varianten en standen ----------
  // Land: variant die niet al bij een buurtegel van hetzelfde type ligt
  function pickVariant(key, terrain) {
    const cell = cells.get(key);
    const taken = new Set();
    for (let i = 0; i < 6; i++) {
      const n = placed.get(neighborKey(cell, i));
      if (n?.terrain === terrain) taken.add(n.variant);
    }
    const free = [1, 2, 3, 4, 5, 6].filter((v) => !taken.has(v));
    const pool = free.length ? free : [1, 2, 3, 4, 5, 6];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Kust/haven: stand die naar het aangrenzende land wijst (null = geen land ernaast)
  function orient(key, terrain) {
    const cell = cells.get(key);
    const land = DIRS.map((_, i) => isLand(neighborKey(cell, i)));
    if (TILE[terrain].kind === "coast") {
      // Twee kustzijden: stand j bedekt richting j-2 en j-1 (stand 1 = linksboven + boven)
      for (let j = 1; j <= 6; j++) {
        if (land[(j + 4) % 6] && land[j - 1]) return 6 + j;
      }
    }
    const i = land.indexOf(true);
    return i >= 0 ? i + 1 : null;
  }

  function newTile(key, terrain) {
    const def = TILE[terrain];
    if (def.kind === "land") return { terrain, variant: pickVariant(key, terrain), auto: true };
    if (ROTATES(terrain)) return { terrain, variant: orient(key, terrain) ?? 1, auto: true };
    return { terrain, variant: 1, auto: true };
  }

  // Na een wijziging in het land: automatisch gedraaide kust/havens rondom bijwerken
  function reorientAround(key) {
    const cell = cells.get(key);
    for (let i = 0; i < 6; i++) {
      const nk = neighborKey(cell, i);
      const t = placed.get(nk);
      if (!t || !t.auto || !ROTATES(t.terrain)) continue;
      const v = orient(nk, t.terrain);
      if (v && v !== t.variant) setVariant(nk, v);
    }
  }

  function setVariant(key, variant) {
    const t = placed.get(key);
    t.variant = variant;
    const img = cells.get(key).tile;
    img.setAttribute("href", tileSrc(t.terrain, variant));
    img.classList.remove("swap");
    void img.getBBox(); // animatie opnieuw starten
    img.classList.add("swap");
  }

  // ---------- Tegels leggen / weghalen ----------
  function place(key) {
    if (!selected || placed.has(key)) return;
    const t = newTile(key, selected);
    placed.set(key, t);
    drawTile(key, t);
    ripple(cells.get(key), "place");
    if (TILE[t.terrain].kind === "land") reorientAround(key);
    changed();
  }

  function erase(key) {
    const cell = cells.get(key);
    const t = placed.get(key);
    if (!t) return;
    placed.delete(key);
    cell.g.classList.remove("filled");
    const node = cell.tile;
    cell.tile = null;
    if (node) {
      node.classList.remove("drop", "swap");
      node.classList.add("lift");
      node.addEventListener("animationend", () => node.remove(), { once: true });
      setTimeout(() => node.remove(), 600); // terugval als de animatie niet afgaat
    }
    ripple(cell, "erase");
    if (TILE[t.terrain].kind === "land") reorientAround(key);
    changed();
  }

  // Scrollen: land = andere variant, kust/haven = draaien (daarna niet meer automatisch)
  function cycleVariant(key, dir) {
    const t = placed.get(key);
    const count = TILE[t?.terrain]?.count ?? 1;
    if (!t || count < 2) return;
    t.auto = false;
    setVariant(key, ((t.variant - 1 + dir + count) % count) + 1);
    updateHover();
    save();
  }

  function changed() {
    save();
    updateSea();
    updateCounts();
    updateHover();
  }

  // De kust van de zee volgt alleen de gelegde landtegels
  function updateSea() {
    const tiles = [...placed].filter(([key]) => isLand(key)).map(([key]) => ({ center: cells.get(key).center }));
    Sea.setBoard(svg, { size: SIZE, tiles }, { exactRange: 8 });
    Sea.setShore(tiles.length > 0);
  }

  // ---------- Paneel ----------
  function renderShapes() {
    const wrap = $("ed-shapes");
    wrap.replaceChildren();
    for (const s of SHAPES) {
      const total = s.columns.reduce((a, b) => a + b, 0);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ed-shape" + (s.id === shape.id ? " selected" : "");
      b.innerHTML = `<span class="ed-shape-name"></span><span class="ed-shape-cols"></span><span class="ed-shape-total">${total} vakken</span>`;
      b.querySelector(".ed-shape-name").textContent = s.name;
      b.querySelector(".ed-shape-cols").textContent = s.columns.join("-");
      b.addEventListener("click", () => setShape(s.id));
      wrap.append(b);
    }
  }

  function setShape(id) {
    if (id === shape.id) return;
    shape = SHAPES.find((s) => s.id === id);
    document.body.classList.remove("ed-ready");
    const dropped = buildBoard();
    renderShapes();
    save();
    requestAnimationFrame(() => document.body.classList.add("ed-ready"));
    if (dropped) toast(`${dropped} ${dropped === 1 ? "tegel viel" : "tegels vielen"} buiten het nieuwe bord`);
  }

  // Sneltoetsen: 1-9 voor land
  const HOTKEYS = TILES.filter((t) => t.group === "land").map((t) => t.id);

  function renderPalette() {
    for (const group of ["land", "zee"]) {
      const wrap = $(`ed-palette-${group}`);
      wrap.replaceChildren();
      for (const t of TILES.filter((x) => x.group === group)) {
        const hot = HOTKEYS.indexOf(t.id) + 1;
        // Voorbeeld: kust met twee zijden, haven met de steiger naar boven
        const preview = tileSrc(t.id, t.kind === "coast" ? 8 : 1);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ed-swatch";
        b.dataset.terrain = t.id;
        b.title = hot ? `${t.name} (${hot})` : t.name;
        b.innerHTML = `
          <span class="ed-swatch-img">${preview ? `<img alt="" draggable="false" src="${preview}">` : `<span class="ed-swatch-water"></span>`}</span>
          <span class="ed-swatch-name"></span>
          ${hot ? `<span class="ed-swatch-key">${hot}</span>` : ""}
          <span class="ed-swatch-count"></span>`;
        b.querySelector(".ed-swatch-name").textContent = t.name;
        b.addEventListener("click", () => select(selected === t.id ? null : t.id));
        wrap.append(b);
      }
    }
  }

  function select(terrain) {
    selected = terrain;
    document.querySelectorAll(".ed-swatch").forEach((b) => b.classList.toggle("selected", b.dataset.terrain === terrain));
    document.body.classList.toggle("ed-has-selection", Boolean(terrain));
    updateHover();
  }

  function updateCounts() {
    const counts = {};
    for (const t of placed.values()) counts[t.terrain] = (counts[t.terrain] ?? 0) + 1;
    document.querySelectorAll(".ed-swatch").forEach((b) => {
      const n = counts[b.dataset.terrain] ?? 0;
      const c = b.querySelector(".ed-swatch-count");
      c.textContent = n || "";
      c.hidden = !n;
    });
    $("ed-count").textContent = `${placed.size} / ${cells.size}`;
  }

  // ---------- Aanwijzen: spooktegel op een leeg vak ----------
  function updateHover() {
    const cell = hoverKey && cells.get(hoverKey);
    ghost.style.display = "none";
    ghostWater.style.display = "none";
    if (!cell) { hoverRing.style.display = "none"; return; }
    const filled = placed.has(hoverKey);
    hoverRing.setAttribute("points", pointsOf(cell.corners));
    hoverRing.classList.toggle("erase", filled);
    hoverRing.classList.toggle("place", !filled && Boolean(selected));
    hoverRing.style.display = "";
    if (!selected || filled) return;

    const preview = newTile(hoverKey, selected);
    const src = tileSrc(selected, TILE[selected].kind === "land" ? 1 : preview.variant);
    if (src) {
      ghost.setAttribute("href", src);
      ghost.setAttribute("x", cell.center.x - W / 2);
      ghost.setAttribute("y", cell.center.y - H / 2);
      ghost.style.display = "";
    } else {
      ghostWater.setAttribute("points", pointsOf(Hex.corners(cell.center, SIZE)));
      ghostWater.style.display = "";
    }
  }

  // ---------- Invoer op het bord ----------
  function keyFromEvent(e) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    return target?.closest?.("[data-key]")?.dataset.key ?? null;
  }

  function applyDrag(key) {
    if (!key) return;
    if (drag === "place") place(key);
    if (drag === "erase") erase(key);
  }

  function bindBoard() {
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const key = keyFromEvent(e);
      if (!key) return;
      e.preventDefault();
      if (placed.has(key)) drag = "erase";
      else if (selected) drag = "place";
      else { nudgePalette(); return; }
      applyDrag(key);
    });

    svg.addEventListener("pointermove", (e) => {
      const key = keyFromEvent(e);
      if (key !== hoverKey) { hoverKey = key; updateHover(); }
      if (drag) applyDrag(key);
    });

    svg.addEventListener("pointerleave", () => { hoverKey = null; updateHover(); });
    window.addEventListener("pointerup", () => { drag = null; });
    window.addEventListener("blur", () => { drag = null; });

    svg.addEventListener("wheel", (e) => {
      const key = keyFromEvent(e);
      if (!key || !placed.has(key)) return;
      e.preventDefault();
      cycleVariant(key, e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    svg.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // Geklikt zonder tegel gekozen: het palet even laten oplichten
  function nudgePalette() {
    document.querySelectorAll(".ed-palette").forEach((pal) => {
      pal.classList.remove("nudge");
      void pal.offsetWidth;
      pal.classList.add("nudge");
    });
    toast("Kies eerst een tegel links");
  }

  // ---------- Acties ----------
  let clearArmed = null;
  function bindActions() {
    const clearBtn = $("ed-clear");
    clearBtn.addEventListener("click", () => {
      if (!placed.size) return;
      if (!clearArmed) {
        clearBtn.textContent = "Zeker weten?";
        clearBtn.classList.add("armed");
        clearArmed = setTimeout(disarm, 2500);
        return;
      }
      disarm();
      const keys = [...placed.keys()];
      keys.forEach((key, i) => setTimeout(() => erase(key), i * 18));
    });
    function disarm() {
      clearTimeout(clearArmed);
      clearArmed = null;
      clearBtn.textContent = "Leegmaken";
      clearBtn.classList.remove("armed");
    }

    $("ed-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kaart-${shape.id}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    $("ed-import").addEventListener("click", () => $("ed-file").click());
    $("ed-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        load(JSON.parse(await file.text()));
        document.body.classList.remove("ed-ready");
        buildBoard();
        renderShapes();
        save();
        requestAnimationFrame(() => document.body.classList.add("ed-ready"));
        toast(`Kaart geladen: ${placed.size} tegels`);
      } catch (err) {
        console.warn(err);
        toast("Dit bestand is geen geldige kaart");
      }
    });

    $("ed-fullscreen").addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", () => {
      $("ed-fullscreen").textContent = document.fullscreenElement ? "Venster" : "Fullscreen";
      Sea.resize();
    });
    window.addEventListener("resize", () => Sea.resize());

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= HOTKEYS.length) select(HOTKEYS[n - 1]);
      else if (e.key === "Escape" || e.key === "0") select(null);
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
    });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  let toastTimer;
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("visible"), 2400);
  }

  // ---------- Start ----------
  function init() {
    try { load(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { load(null); }
    Sea.init($("sea"));
    renderPalette();
    renderShapes();
    buildBoard();
    bindBoard();
    bindActions();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      Sea.resize();
      document.body.classList.add("ed-ready");
    }));
  }

  init();
  return { serialize, get map() { return serialize(); }, STORAGE_KEY, TILES };
})();
