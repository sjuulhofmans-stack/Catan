// Kaarteditor: een leeg hexraster waarop je zelf tegels legt.
// Losse pagina; later wordt dit ingebouwd in het spel (de kaart staat in localStorage onder STORAGE_KEY).
const Editor = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STORAGE_KEY = "hexbord-editor-map";
  const TILE_PATH = "assets/tiles/land/";
  const VARIANTS = 6;
  const SIZE = 1;

  // Bordvormen als kolomlengtes (flat-top: kolommen van links naar rechts)
  const SHAPES = [
    { id: "basis",       name: "Basis",       columns: [3, 4, 5, 4, 3] },
    { id: "uitbreiding", name: "Uitbreiding", columns: [3, 4, 5, 6, 5, 4, 3] },
    { id: "groot",       name: "Groot",       columns: [4, 5, 6, 7, 6, 5, 4] },
    { id: "zeevaarders", name: "Zeevaarders", columns: [5, 6, 7, 8, 7, 6, 5] },
  ];
  const DEFAULT_SHAPE = "uitbreiding";

  const TERRAINS = [
    { id: "hout",     name: "Hout" },
    { id: "wol",      name: "Wol" },
    { id: "graan",    name: "Graan" },
    { id: "steen",    name: "Steen" },
    { id: "erts",     name: "Erts" },
    { id: "goud",     name: "Goud" },
    { id: "woestijn", name: "Woestijn" },
    { id: "meer",     name: "Meer" },
    { id: "vulkaan",  name: "Vulkaan" },
  ];

  const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const W = 2 * SIZE * 1.004;            // zelfde maat als in board.js (geen naadjes)
  const H = Math.sqrt(3) * SIZE * 1.004;

  const $ = (id) => document.getElementById(id);
  const svg = $("ed-board");

  let shape = SHAPES.find((s) => s.id === DEFAULT_SHAPE);
  let cells = new Map();   // key -> { q, r, center, corners, g }
  let placed = new Map();  // key -> { terrain, variant }
  let selected = null;     // terrain-id of null
  let drag = null;         // null | "place" | "erase"
  let hoverKey = null;

  let layerCells, layerTiles, layerFx, ghost, hoverRing;

  // ---------- Hulpjes ----------
  function el(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  const tileSrc = (terrain, variant) => `${TILE_PATH}${terrain}_${variant}.webp`;
  const pointsOf = (corners) => corners.map((c) => `${c.x},${c.y}`).join(" ");

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
        return { q, r, terrain: t.terrain, variant: t.variant };
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
      if (!TERRAINS.some((x) => x.id === t.terrain)) continue;
      const variant = Math.min(VARIANTS, Math.max(1, t.variant | 0 || 1));
      placed.set(`${t.q},${t.r}`, { terrain: t.terrain, variant });
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
    hoverRing = el("polygon", { class: "ed-hover" });
    hoverRing.style.display = "none";

    const all = [];
    const hexes = shapeHexes(shape.columns);
    for (const hex of hexes) {
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

    svg.append(layerCells, layerTiles, ghost, layerFx, hoverRing);
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
    const img = el("image", {
      class: "ed-tile",
      href: tileSrc(t.terrain, t.variant),
      x: cell.center.x - W / 2,
      y: cell.center.y - H / 2,
      width: W,
      height: H,
      preserveAspectRatio: "none",
      "data-key": key,
    });
    if (animate) img.classList.add("drop");
    img.addEventListener("animationend", () => {
      img.classList.remove("drop", "swap");
      img.style.animationDelay = "";
    });
    layerTiles.append(img);
    cell.tile = img;
    cell.g.classList.add("filled");
  }

  function ripple(cell, cls) {
    const poly = el("polygon", { class: `ed-ripple ${cls}`, points: pointsOf(Hex.corners(cell.center, SIZE)) });
    poly.addEventListener("animationend", () => poly.remove());
    layerFx.append(poly);
  }

  // ---------- Tegels leggen / weghalen ----------
  // Variant kiezen die niet al bij een buurtegel van hetzelfde type ligt
  function pickVariant(key, terrain) {
    const cell = cells.get(key);
    const taken = new Set();
    for (const [dq, dr] of NEIGHBORS) {
      const n = placed.get(`${cell.q + dq},${cell.r + dr}`);
      if (n?.terrain === terrain) taken.add(n.variant);
    }
    const free = [];
    for (let v = 1; v <= VARIANTS; v++) if (!taken.has(v)) free.push(v);
    const pool = free.length ? free : [1, 2, 3, 4, 5, 6];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function place(key) {
    if (!selected || placed.has(key)) return;
    const t = { terrain: selected, variant: pickVariant(key, selected) };
    placed.set(key, t);
    drawTile(key, t);
    ripple(cells.get(key), "place");
    changed();
  }

  function erase(key) {
    const cell = cells.get(key);
    if (!placed.has(key)) return;
    placed.delete(key);
    cell.g.classList.remove("filled");
    const img = cell.tile;
    cell.tile = null;
    if (img) {
      img.classList.remove("drop", "swap");
      img.classList.add("lift");
      img.addEventListener("animationend", () => img.remove(), { once: true });
      setTimeout(() => img.remove(), 600); // terugval als de animatie niet afgaat
    }
    ripple(cell, "erase");
    changed();
  }

  function cycleVariant(key, dir) {
    const t = placed.get(key);
    if (!t) return;
    t.variant = ((t.variant - 1 + dir + VARIANTS) % VARIANTS) + 1;
    const img = cells.get(key).tile;
    img.setAttribute("href", tileSrc(t.terrain, t.variant));
    img.classList.remove("swap");
    void img.getBBox(); // animatie opnieuw starten
    img.classList.add("swap");
    save();
  }

  function changed() {
    save();
    updateSea();
    updateCounts();
    updateHover();
  }

  // De kust van de zee volgt alleen de gelegde tegels
  function updateSea() {
    const tiles = [...placed.keys()].map((key) => ({ center: cells.get(key).center }));
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

  function renderPalette() {
    const wrap = $("ed-palette");
    wrap.replaceChildren();
    TERRAINS.forEach((t, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ed-swatch";
      b.dataset.terrain = t.id;
      b.title = `${t.name} (${i + 1})`;
      b.innerHTML = `
        <span class="ed-swatch-img"><img alt="" draggable="false" src="${tileSrc(t.id, 1)}"></span>
        <span class="ed-swatch-name">${t.name}</span>
        <span class="ed-swatch-key">${i + 1}</span>
        <span class="ed-swatch-count"></span>`;
      b.addEventListener("click", () => select(selected === t.id ? null : t.id));
      wrap.append(b);
    });
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
    if (!cell) { ghost.style.display = "none"; hoverRing.style.display = "none"; return; }
    const filled = placed.has(hoverKey);
    hoverRing.setAttribute("points", pointsOf(cell.corners));
    hoverRing.classList.toggle("erase", filled);
    hoverRing.classList.toggle("place", !filled && Boolean(selected));
    hoverRing.style.display = "";
    if (selected && !filled) {
      ghost.setAttribute("href", tileSrc(selected, 1));
      ghost.setAttribute("x", cell.center.x - W / 2);
      ghost.setAttribute("y", cell.center.y - H / 2);
      ghost.style.display = "";
    } else {
      ghost.style.display = "none";
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
    const pal = $("ed-palette");
    pal.classList.remove("nudge");
    void pal.offsetWidth;
    pal.classList.add("nudge");
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
      if (n >= 1 && n <= TERRAINS.length) select(TERRAINS[n - 1].id);
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
  return { serialize, get map() { return serialize(); }, STORAGE_KEY };
})();
