// Bordmodel + rendering.
// Tegels, hoekpunten (voor dorpen/steden) en randen (voor wegen) krijgen elk een id,
// zodat latere features (camera-detectie, bouwen) ernaar kunnen verwijzen.
const Board = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function createModel({ radius = 2, size = 1 } = {}) {
    const tiles = [];
    const vertices = new Map(); // pixelsleutel -> { id, x, y, tileIds }
    const edges = new Map();    // "vA|vB"      -> { id, a, b, tileIds }

    const vKey = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

    for (const hex of Hex.generateHexagon(radius)) {
      const id = Hex.key(hex);
      const center = Hex.toPixel(hex, size);
      const pts = Hex.corners(center, size);

      const vertexIds = pts.map((p) => {
        const k = vKey(p);
        if (!vertices.has(k)) vertices.set(k, { id: `v${vertices.size}`, x: p.x, y: p.y, tileIds: [] });
        const v = vertices.get(k);
        v.tileIds.push(id);
        return v.id;
      });

      const edgeIds = vertexIds.map((a, i) => {
        const b = vertexIds[(i + 1) % 6];
        const k = [a, b].sort().join("|");
        if (!edges.has(k)) edges.set(k, { id: `e${edges.size}`, a, b, tileIds: [] });
        const e = edges.get(k);
        e.tileIds.push(id);
        return e.id;
      });

      const ring = Hex.distance(hex, { q: 0, r: 0, s: 0 });
      tiles.push({ id, ...hex, ring, center, corners: pts, vertexIds, edgeIds });
    }

    // Omhullende van het bord (voor de viewBox)
    const all = tiles.flatMap((t) => t.corners);
    const bounds = {
      minX: Math.min(...all.map((p) => p.x)),
      maxX: Math.max(...all.map((p) => p.x)),
      minY: Math.min(...all.map((p) => p.y)),
      maxY: Math.max(...all.map((p) => p.y)),
    };

    const model = { size, tiles, vertices: [...vertices.values()], edges: [...edges.values()], bounds };
    model.harbors = placeHarbors(model);
    return model;
  }

  // ---------- Havens ----------
  // Kustranden (rand met maar één tegel), op hoek gesorteerd; daarvan worden er HARBOR_COUNT
  // gelijkmatig rond het eiland gekozen. Elke haven: midden van de rand + normaal naar zee.
  const HARBOR_COUNT = 9;

  function placeHarbors(model) {
    const vById = new Map(model.vertices.map((v) => [v.id, v]));
    const tById = new Map(model.tiles.map((t) => [t.id, t]));
    const coast = model.edges.filter((e) => e.tileIds.length === 1).map((e) => {
      const a = vById.get(e.a), b = vById.get(e.b), t = tById.get(e.tileIds[0]);
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      const len = Math.hypot(x - t.center.x, y - t.center.y);
      return { edgeId: e.id, tileId: t.id, x, y, nx: (x - t.center.x) / len, ny: (y - t.center.y) / len, angle: Math.atan2(y, x) };
    }).sort((p, q) => p.angle - q.angle);
    const step = coast.length / HARBOR_COUNT;
    return Array.from({ length: HARBOR_COUNT }, (_, i) => ({ id: `h${i}`, ...coast[Math.floor(i * step + step / 2) % coast.length] }));
  }

  // ---------- Terrein ----------
  // Tegelafbeeldingen: assets/tiles/land/<type>_<variant>.webp (flat-top, bijgesneden op de zeshoek).
  // Goud, meer en vulkaan zijn er al als afbeelding; die zet de mapgenerator later in.
  const TILE_PATH = "assets/tiles/land/";
  const VARIANTS = 6;
  const BASE_MIX = { hout: 4, wol: 4, graan: 4, steen: 3, erts: 3, woestijn: 1 }; // 19 tegels

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // Tijdelijk: willekeurige verdeling (de gebalanceerde mapgenerator komt later)
  function assignRandomTerrain(model, mix = BASE_MIX) {
    const bag = shuffle(Object.entries(mix).flatMap(([type, n]) => Array(n).fill(type)));
    model.tiles.forEach((t, i) => {
      t.terrain = bag[i % bag.length];
      t.variant = 1 + Math.floor(Math.random() * VARIANTS);
    });
  }

  // Nummerfiches: 2–12 zonder 7, elk getal twee keer behalve 2 en 12. Geen 6 en 8 naast elkaar.
  // Tegels zonder opbrengst (woestijn, meer, vulkaan) krijgen geen fiche.
  const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  const NO_NUMBER = new Set(["woestijn", "meer", "vulkaan"]);

  function assignNumbers(model) {
    const hot = (t) => t.number === 6 || t.number === 8;
    const neighbours = (t) => model.tiles.filter((o) => o !== t && Hex.distance(o, t) === 1);
    for (let attempt = 0; attempt < 500; attempt++) {
      const bag = shuffle([...NUMBERS]);
      let k = 0;
      model.tiles.forEach((t) => { t.number = NO_NUMBER.has(t.terrain) ? null : bag[k++ % bag.length]; });
      if (!model.tiles.some((t) => hot(t) && neighbours(t).some(hot))) return;
    }
  }

  // Waarschijnlijkheid als stipjes: 2/12 = 1 … 6/8 = 5
  const pips = (n) => 6 - Math.abs(7 - n);

  function renderToken(t) {
    const g = el("g", { class: "token", "data-tile": t.id, transform: `translate(${t.center.x} ${t.center.y})` });
    const inner = el("g", { class: "token-inner" });
    const hot = t.number === 6 || t.number === 8;
    inner.append(el("circle", { class: "token-shadow", cx: 0.025, cy: 0.04, r: 0.3 }));
    inner.append(el("circle", { class: "token-disc", r: 0.3 }));
    const num = el("text", { class: `token-num${hot ? " hot" : ""}`, x: 0, y: -0.035 });
    num.textContent = t.number;
    inner.append(num);
    const n = pips(t.number);
    for (let k = 0; k < n; k++) {
      inner.append(el("circle", { class: `token-pip${hot ? " hot" : ""}`, cx: (k - (n - 1) / 2) * 0.05, cy: 0.165, r: 0.017 }));
    }
    g.append(inner);
    return g;
  }

  function el(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  // tokenSvg (optioneel): aparte SVG met dezelfde viewBox voor de nummerfiches, zodat er een
  // lichtlaag tussen tegels en fiches kan liggen.
  function render(svg, model, { padding = 0.6, tokenSvg = null } = {}) {
    const { minX, maxX, minY, maxY } = model.bounds;
    const p = padding * model.size;
    const viewBox = `${minX - p} ${minY - p} ${maxX - minX + 2 * p} ${maxY - minY + 2 * p}`;
    svg.setAttribute("viewBox", viewBox);
    svg.replaceChildren();
    if (tokenSvg) { tokenSvg.setAttribute("viewBox", viewBox); tokenSvg.replaceChildren(); }

    const tileLayer = el("g", { id: "layer-tiles" });
    const harborLayer = el("g", { id: "layer-harbors" });

    // Steiger: houten pier vanaf de kust de zee in (de bootjes leggen ernaast aan)
    for (const h of model.harbors) {
      const s = model.size;
      const deg = (Math.atan2(h.ny, h.nx) * 180) / Math.PI;
      const g = el("g", { class: "harbor", "data-harbor": h.id, transform: `translate(${h.x} ${h.y}) rotate(${deg})` });
      g.append(el("rect", { class: "pier-post", x: 0.30 * s, y: -0.07 * s, width: 0.05 * s, height: 0.14 * s, rx: 0.01 * s }));
      g.append(el("rect", { class: "pier", x: -0.08 * s, y: -0.045 * s, width: 0.44 * s, height: 0.09 * s, rx: 0.01 * s }));
      for (let i = 0; i < 6; i++) {
        const px = (-0.04 + i * 0.065) * s;
        g.append(el("line", { class: "pier-plank", x1: px, y1: -0.045 * s, x2: px, y2: 0.045 * s }));
      }
      harborLayer.append(g);
    }
    const tokenLayer = el("g", { id: "layer-tokens" });
    const debugLayer = el("g", { id: "layer-debug", class: "debug" });

    const s = model.size;
    const w = 2 * s * 1.004;            // flat-top: breedte = 2 × straal (heel licht groter: geen naadjes)
    const h = Math.sqrt(3) * s * 1.004; // hoogte = √3 × straal

    for (const t of model.tiles) {
      const g = el("g", { class: "tile", "data-tile": t.id, style: `--ring: ${t.ring}` });
      g.append(el("polygon", { points: t.corners.map((c) => `${c.x},${c.y}`).join(" ") })); // terugval zonder afbeelding
      if (t.terrain) {
        g.dataset.terrain = t.terrain;
        g.append(el("image", {
          href: `${TILE_PATH}${t.terrain}_${t.variant}.webp`,
          x: t.center.x - w / 2,
          y: t.center.y - h / 2,
          width: w,
          height: h,
          preserveAspectRatio: "none",
        }));
      }
      tileLayer.append(g);
      if (t.number != null) {
        const tok = renderToken(t);
        tok.style.setProperty("--ring", t.ring);
        tokenLayer.append(tok);
      }
      const label = el("text", { class: "tile-label", x: t.center.x, y: t.center.y });
      label.textContent = t.id;
      debugLayer.append(label);
    }

    for (const v of model.vertices) {
      debugLayer.append(el("circle", { class: "vertex", cx: v.x, cy: v.y, r: 0.05 * model.size, "data-vertex": v.id }));
    }

    if (tokenSvg) { svg.append(harborLayer, tileLayer, debugLayer); tokenSvg.append(tokenLayer); }
    else svg.append(harborLayer, tileLayer, tokenLayer, debugLayer);
  }

  return { createModel, render, assignRandomTerrain, assignNumbers };
})();
