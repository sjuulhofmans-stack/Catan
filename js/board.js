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

    return { size, tiles, vertices: [...vertices.values()], edges: [...edges.values()], bounds };
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

  function el(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function render(svg, model, { padding = 0.6 } = {}) {
    const { minX, maxX, minY, maxY } = model.bounds;
    const p = padding * model.size;
    svg.setAttribute("viewBox", `${minX - p} ${minY - p} ${maxX - minX + 2 * p} ${maxY - minY + 2 * p}`);
    svg.replaceChildren();

    const tileLayer = el("g", { id: "layer-tiles" });
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
      const label = el("text", { class: "tile-label", x: t.center.x, y: t.center.y });
      label.textContent = t.id;
      debugLayer.append(label);
    }

    for (const v of model.vertices) {
      debugLayer.append(el("circle", { class: "vertex", cx: v.x, cy: v.y, r: 0.05 * model.size, "data-vertex": v.id }));
    }

    svg.append(tileLayer, debugLayer);
  }

  return { createModel, render, assignRandomTerrain };
})();
