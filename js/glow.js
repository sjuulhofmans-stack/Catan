// Lichtlaag na een worp: een korte dans over het hele bord in de kleuren van de gegooide tegel,
// die eindigt op de tegel(s) met het gegooide getal, gevolgd door een finale op die tegel(s).
// Canvas boven de tegels en onder de fiches, met mix-blend-mode: screen (licht telt op bij de tegel).
// Dimmen van de rest gebeurt via CSS-klassen op de SVG (een zwarte laag doet niets bij screen).
const Glow = (() => {
  const S3 = Math.sqrt(3);
  const DUR = { dance: 2300, finale: 2100, out: 650, seven: 1300 };

  // ---------- helpers ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const backOut = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const angDiff = (a, b) => ((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---------- thema's per tegeltype ----------
  const THEMES = {
    wol:   { dance: "golf",    a: [124, 255, 107], b: [255, 255, 255], core: [246, 255, 240], particle: "puff" },
    hout:  { dance: "spoor",   a: [38, 201, 104],  b: [255, 179, 71],  core: [255, 236, 190], particle: "leaf" },
    graan: { dance: "spiraal", a: [255, 197, 49],  b: [255, 242, 168], core: [255, 251, 235], particle: "mote" },
    erts:  { dance: "bliksem", a: [155, 107, 255], b: [127, 227, 255], core: [255, 255, 255], particle: "shard" },
    steen: { dance: "golf",    a: [255, 106, 61],  b: [255, 196, 138], core: [255, 240, 225], particle: "ember" },
    goud:  { dance: "spiraal", a: [255, 214, 90],  b: [255, 160, 40],  core: [255, 250, 220], particle: "mote" },
  };
  const themeOf = (t) => THEMES[t.terrain] || THEMES.steen;

  let canvas, ctx, boardSvg, tokenSvg, model;
  let tiles = [];
  let seq = null;
  let raf = 0;
  let last = 0;
  let dpr = 1;
  const parts = [];

  function init(canvasEl, svgEl, tokenSvgEl, boardModel) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    boardSvg = svgEl;
    tokenSvg = tokenSvgEl;
    model = boardModel;
    tiles = model.tiles.map((t, i) => ({
      i, src: t, id: t.id, x: t.center.x / model.size, y: t.center.y / model.size,
      ring: t.ring, angle: Math.atan2(t.center.y, t.center.x), nb: [],
    }));
    tiles.forEach((a) => tiles.forEach((b) => { if (a !== b && dist(a, b) < 1.8) a.nb.push(b); }));
    addEventListener("resize", resize);
    resize();
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  // bordeenheden (1 = tegelstraal) -> canvaspixels, via de schermmatrix van de bord-SVG
  function setBoardTransform() {
    const m = boardSvg.getScreenCTM();
    const r = canvas.getBoundingClientRect();
    if (!m) return false;
    if (Math.round(r.width * dpr) !== canvas.width || Math.round(r.height * dpr) !== canvas.height) resize();
    const s = model.size;
    ctx.setTransform(m.a * s * dpr, 0, 0, m.d * s * dpr, (m.e - r.left) * dpr, (m.f - r.top) * dpr);
    return true;
  }

  function pathTo(from, to) {
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const c = queue.shift();
      if (c === to) break;
      for (const n of shuffle([...c.nb])) if (!prev.has(n)) { prev.set(n, c); queue.push(n); }
    }
    const p = [];
    for (let c = to; c; c = prev.get(c)) p.unshift(c);
    return p;
  }
  const nearest = (t, targets) => Math.min(...targets.map((g) => dist(t, g)));

  // ---------- dansen ----------
  // at(s, u, I, M): u = 0..1 binnen de dans. I = lichtsterkte per tegel, M = "witheet" (kuif van de golf).
  const DANCES = {
    // Weide: golf met schuimkop rolt over het eiland en trekt zich als kring samen op de tegel
    golf: {
      prep: () => ({ dir: Math.random() < 0.5 ? 1 : -1, tilt: rnd(0.5, 1.1) }),
      at(s, u, I, M) {
        const { dir, tilt } = s.prep;
        const w = smooth(0.5, 0.66, u);
        const v = easeInOut(clamp(u / 0.62));
        const bx = dir * lerp(-6.5, 6.5, v);
        const R = lerp(5.6, 0, easeIn(clamp((u - 0.52) / 0.48)));
        for (const t of tiles) {
          const dx = (t.x - bx - tilt * Math.sin(t.y * 0.8 + v * 7)) * dir;
          const sweep = Math.exp(-((dx / 1.35) ** 2)) + (dx < 0 ? 0.28 * Math.exp(dx / 2.2) : 0);
          const d = nearest(t, s.targets);
          const ring = Math.exp(-(((d - R) / 0.95) ** 2));
          I[t.i] = Math.max(sweep * (1 - w), ring * w);
          M[t.i] = Math.max(Math.exp(-((dx / 0.55) ** 2)) * (1 - w), Math.exp(-(((d - R) / 0.45) ** 2)) * w);
        }
      },
    },

    // Bos: een vuurvliegje springt van tegel naar tegel en landt op de tegel
    spoor: {
      prep(s) {
        const first = s.targets[0];
        const far = tiles.filter((t) => t.ring === 2 && dist(t, first) > 3.2);
        let cur = pick(far.length ? far : tiles);
        const path = [cur];
        for (let k = 0; k < 7; k++) {
          const opts = cur.nb.filter((n) => !path.includes(n) && !s.targets.includes(n));
          if (!opts.length) break;
          cur = pick(opts);
          path.push(cur);
        }
        for (const tg of s.targets) path.push(...pathTo(path[path.length - 1], tg).slice(1));
        const times = path.map((_, k) => 0.03 + 0.87 * (k / Math.max(1, path.length - 1)));
        return { path, times, head: { x: path[0].x, y: path[0].y } };
      },
      at(s, u, I, M) {
        const { path, times } = s.prep;
        let k = 0;
        while (k < path.length - 1 && times[k + 1] <= u) k++;
        const head = path[k];
        path.forEach((t, j) => {
          const tv = times[j];
          if (u < tv) return;
          const v = s.targets.includes(t) ? 1 : Math.exp(-(u - tv) / 0.13);
          I[t.i] = Math.max(I[t.i], v);
          M[t.i] = Math.max(M[t.i], Math.exp(-(((u - tv) / 0.05) ** 2)));
        });
        for (const n of head.nb) I[n.i] = Math.max(I[n.i], 0.16);
        if (k < path.length - 1) {
          const f = easeInOut(clamp((u - times[k]) / (times[k + 1] - times[k])));
          const a = path[k], b = path[k + 1];
          s.prep.head = { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) - Math.sin(f * Math.PI) * 0.45 };
        } else s.prep.head = { x: head.x, y: head.y };
      },
      extra(s) {
        const h = s.prep.head, th = s.th;
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 0.55);
        g.addColorStop(0, rgba(th.core, 1));
        g.addColorStop(0.18, rgba(th.b, 0.9));
        g.addColorStop(1, rgba(th.b, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(h.x, h.y, 0.55, 0, 7); ctx.fill();
        if (Math.random() < 0.8) spawn({ ...th, particle: "spark" }, h.x + rnd(-0.08, 0.08), h.y + rnd(-0.08, 0.08), false);
      },
    },

    // Graan: gouden spiraalarm draait twee keer rond en zakt in op de tegel
    spiraal: {
      prep: () => ({ th0: rnd(0, Math.PI * 2), turns: 2 }),
      at(s, u, I, M) {
        const { th0, turns } = s.prep;
        const theta = th0 + Math.PI * 2 * turns * easeOut(u);
        const c = smooth(0.6, 0.94, u);
        for (const t of tiles) {
          let arm, crest;
          if (t.ring === 0) { arm = 0.35 + 0.35 * Math.sin(u * Math.PI * 8); crest = 0; }
          else {
            const d = angDiff(t.angle, theta - 0.95 * t.ring);
            const d2 = angDiff(t.angle, theta + Math.PI - 0.95 * t.ring);
            arm = Math.max(Math.exp(-((d / 0.55) ** 2)), 0.55 * Math.exp(-((d2 / 0.5) ** 2)));
            crest = Math.exp(-((d / 0.22) ** 2));
          }
          const conv = Math.exp(-((nearest(t, s.targets) / 0.8) ** 2));
          I[t.i] = arm * (1 - c) + conv * c;
          M[t.i] = crest * (1 - c) + conv * c * 0.6;
        }
      },
      extra(s, u) {
        const { th0, turns } = s.prep;
        const theta = th0 + Math.PI * 2 * turns * easeOut(u);
        const a = (1 - smooth(0.6, 0.94, u)) * 0.8;
        if (a < 0.02) return;
        ctx.save();
        ctx.globalAlpha = a;
        for (let k = 0; k < 2; k++) {
          const ang = theta + k * Math.PI;
          const g = ctx.createLinearGradient(0, 0, Math.cos(ang) * 4.6, Math.sin(ang) * 4.6);
          g.addColorStop(0, rgba(s.th.core, 0.5));
          g.addColorStop(1, rgba(s.th.a, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, 4.6, ang - 0.16, ang + 0.16);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      },
    },

    // Erts: ontladingen over losse tegels, steeds dichterbij, tot een laatste inslag
    bliksem: {
      prep(s) {
        const tgt = s.targets[0];
        const bolts = [];
        const N = 6;
        for (let k = 0; k < N; k++) {
          const t = 0.05 + 0.66 * Math.pow(k / (N - 1), 0.9);
          let cur = pick(tiles.filter((x) => !s.targets.includes(x)));
          const path = [cur];
          const len = 2 + Math.floor(Math.random() * 3);
          for (let j = 0; j < len; j++) {
            const opts = cur.nb.filter((n) => !path.includes(n) && !s.targets.includes(n));
            if (!opts.length) break;
            opts.sort((a, b) => dist(a, tgt) - dist(b, tgt));
            cur = Math.random() < k / N ? opts[0] : pick(opts);
            path.push(cur);
          }
          bolts.push({ t, path });
        }
        s.targets.forEach((tg, j) => {
          const far = tiles.filter((x) => dist(x, tg) > 3.3);
          bolts.push({ t: 0.8 + j * 0.06, path: pathTo(pick(far.length ? far : tiles), tg), final: true });
        });
        return { bolts };
      },
      at(s, u, I, M) {
        const r = (u * 11) % 5.5;
        for (const t of tiles) I[t.i] = 0.15 * Math.exp(-(((Math.hypot(t.x, t.y) - r) / 0.8) ** 2));
        for (const b of s.prep.bolts) {
          if (u < b.t) continue;
          const age = u - b.t;
          b.path.forEach((t, j) => {
            const end = b.final && j === b.path.length - 1;
            const flick = age < 0.06 ? (Math.random() < 0.7 ? 1 : 0.35) : 1;
            const v = end ? 1 : Math.exp(-age / 0.07) * flick;
            I[t.i] = Math.max(I[t.i], v);
            M[t.i] = Math.max(M[t.i], end ? Math.exp(-age / 0.12) : Math.exp(-age / 0.03));
          });
        }
      },
      extra(s, u) {
        for (const b of s.prep.bolts) {
          const age = u - b.t, life = b.final ? 0.16 : 0.09;
          if (age < 0 || age > life || b.path.length < 2) continue;
          const pts = [];
          for (let j = 0; j < b.path.length - 1; j++) {
            const a = b.path[j], c = b.path[j + 1];
            const nx = -(c.y - a.y) / S3, ny = (c.x - a.x) / S3;
            for (let k = 0; k < 5; k++) {
              const f = k / 5, off = k === 0 ? 0 : rnd(-0.22, 0.22);
              pts.push([lerp(a.x, c.x, f) + nx * off, lerp(a.y, c.y, f) + ny * off]);
            }
          }
          const lastT = b.path[b.path.length - 1];
          pts.push([lastT.x, lastT.y]);
          const fade = 1 - age / life;
          for (const [lw, al, col] of [[0.22, 0.22, s.th.a], [0.09, 0.6, s.th.b], [0.03, 1, s.th.core]]) {
            ctx.globalAlpha = al * fade;
            ctx.lineWidth = lw * (b.final ? 1.5 : 1);
            ctx.strokeStyle = rgba(col, 1);
            ctx.beginPath();
            pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          if (age < 0.02) for (let k = 0; k < 6; k++) spawn(s.th, lastT.x, lastT.y, true);
        }
      },
    },
  };

  // ---------- deeltjes ----------
  function edgePoint(t) {
    const k = Math.floor(Math.random() * 6), f = Math.random();
    const a1 = (k * Math.PI) / 3, a2 = ((k + 1) * Math.PI) / 3;
    return [t.x + 0.94 * lerp(Math.cos(a1), Math.cos(a2), f), t.y + 0.94 * lerp(Math.sin(a1), Math.sin(a2), f)];
  }
  function spawn(th, x, y, burst, cx, cy) {
    if (parts.length > 500) return;
    let ang = rnd(0, Math.PI * 2);
    if (cx !== undefined) ang = Math.atan2(y - cy, x - cx) + rnd(-0.4, 0.4);
    const sp = burst ? rnd(0.7, 2.2) : rnd(0.05, 0.35);
    const life = burst ? rnd(0.7, 1.4) : rnd(0.6, 1.2);
    parts.push({
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life, max: life,
      size: rnd(0.035, 0.085), rot: rnd(0, 6.28), vr: rnd(-6, 6),
      col: Math.random() < 0.5 ? th.a : th.b, core: th.core, shape: th.particle,
    });
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      const drag = Math.pow(0.25, dt);
      p.vx *= drag; p.vy *= drag;
      if (p.shape === "puff") p.vy -= 0.35 * dt;
      else if (p.shape === "leaf") { p.vy += 0.9 * dt; p.vx += Math.sin(p.life * 7) * 1.2 * dt; }
      else if (p.shape === "mote") p.vy -= 0.6 * dt;
      else if (p.shape === "ember") { p.vy -= 0.5 * dt; p.vx += rnd(-0.3, 0.3) * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  function drawParts() {
    for (const p of parts) {
      const a = clamp(p.life / p.max) * (p.shape === "ember" ? rnd(0.6, 1) : 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(p.col, 1);
      ctx.beginPath();
      if (p.shape === "puff") { ctx.fillStyle = rgba(mix(p.col, [255, 255, 255], 0.6), 0.75); ctx.arc(0, 0, p.size * 1.3, 0, 7); }
      else if (p.shape === "leaf") ctx.ellipse(0, 0, p.size * 1.3, p.size * 0.5, 0, 0, 7);
      else if (p.shape === "mote") { const s = p.size * 0.7; ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, 0); }
      else if (p.shape === "shard") { const s = p.size * 1.2; ctx.moveTo(0, -s); ctx.lineTo(s * 0.35, s * 0.6); ctx.lineTo(-s * 0.35, s * 0.6); }
      else if (p.shape === "spark") { ctx.fillStyle = rgba(p.core, 1); ctx.arc(0, 0, p.size * 0.45, 0, 7); }
      else ctx.arc(0, 0, p.size * 0.6, 0, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- tekenen ----------
  function hexPath(x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  function glowHex(t, I, M, th, now, boost) {
    const ang = now * 0.0012 + t.x * 0.7 + t.y * 0.3;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const A = mix(th.a, th.core, M * 0.75), B = mix(th.b, th.core, M * 0.75);
    const rg = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 1);
    rg.addColorStop(0, rgba(th.a, 0.06 * I));
    rg.addColorStop(0.7, rgba(th.a, 0.16 * I));
    rg.addColorStop(1, rgba(th.b, 0.3 * I));
    hexPath(t.x, t.y, 0.95);
    ctx.fillStyle = rg;
    ctx.fill();
    const g = ctx.createLinearGradient(t.x - ca, t.y - sa, t.x + ca, t.y + sa);
    g.addColorStop(0, rgba(A, 1));
    g.addColorStop(0.5, rgba(B, 1));
    g.addColorStop(1, rgba(A, 1));
    ctx.strokeStyle = g;
    ctx.lineJoin = "round";
    const w = boost ? 1.6 : 1;
    for (const [lw, al] of [[0.32, 0.12], [0.15, 0.3], [0.065, 0.8]]) {
      ctx.globalAlpha = al * I;
      ctx.lineWidth = lw * w;
      hexPath(t.x, t.y, 0.93);
      ctx.stroke();
    }
    ctx.globalAlpha = I * (0.3 + 0.7 * M);
    ctx.lineWidth = 0.024 * w;
    ctx.strokeStyle = rgba(th.core, 1);
    hexPath(t.x, t.y, 0.93);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---------- SVG-kant: dimmen + fiche laten opspringen ----------
  function setDim(on, targets = []) {
    const ids = new Set(targets.map((t) => t.id));
    boardSvg.querySelectorAll(".tile").forEach((g) => g.classList.toggle("dimmed", on && !ids.has(g.dataset.tile)));
    tokenSvg.querySelectorAll(".token").forEach((g) => g.querySelector(".token-inner").classList.toggle("dimmed", on && !ids.has(g.dataset.tile)));
  }
  function setTokenScale(t, sc) {
    const inner = tokenSvg.querySelector(`.token[data-tile="${t.id}"] .token-inner`);
    if (inner) inner.style.transform = sc === 1 ? "" : `scale(${sc})`;
  }

  // ---------- afspelen ----------
  // sum: gegooid getal. onDone wordt aangeroepen als alles weer rustig is.
  function play(sum, { onDone } = {}) {
    stop();
    if (!canvas) return;
    const targets = tiles.filter((t) => t.src.number === sum);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = { t0: performance.now(), targets, burst: false, onDone, lastI: new Float32Array(tiles.length), dimmed: false };
    if (!targets.length) {
      s.seven = true;
      s.dur = { dance: DUR.seven, finale: 0, out: 0 };
    } else {
      s.th = themeOf(targets[0].src);
      s.dance = DANCES[s.th.dance];
      s.dur = { dance: reduce ? 0 : DUR.dance, finale: DUR.finale, out: DUR.out };
      s.prep = s.dance.prep ? s.dance.prep(s) : {};
    }
    seq = s;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (seq) { seq.targets.forEach((t) => setTokenScale(t, 1)); }
    seq = null;
    parts.length = 0;
    if (boardSvg) setDim(false);
    if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  function phaseOf(s, el) {
    let acc = 0;
    for (const p of ["dance", "finale", "out"]) { const d = s.dur[p]; if (el < acc + d) return [p, (el - acc) / d]; acc += d; }
    return ["done", 1];
  }

  const I = [], M = [];

  function frame(now) {
    const s = seq;
    if (!s) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const [ph, p] = phaseOf(s, now - s.t0);
    if (ph === "done") { const cb = s.onDone; stop(); cb && cb(); return; }
    raf = requestAnimationFrame(frame);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!setBoardTransform()) return;

    // 7: geen opbrengst, het bord dimt kort
    if (s.seven) {
      const want = p > 0.1 && p < 0.7;
      if (want !== s.dimmed) { s.dimmed = want; setDim(want); }
      return;
    }

    for (let i = 0; i < tiles.length; i++) { I[i] = 0; M[i] = 0; }
    const isT = new Set(s.targets);
    const inFinale = ph === "finale" || ph === "out";
    if (ph === "dance") {
      s.dance.at(s, p, I, M);
      for (let i = 0; i < tiles.length; i++) s.lastI[i] = I[i];
    } else {
      const f = ph === "finale" ? p : 1, o = ph === "out" ? p : 0;
      for (const t of tiles) {
        if (isT.has(t)) { I[t.i] = 1 - o; M[t.i] = (0.9 * Math.exp(-f * 5) + 0.15 + 0.1 * Math.sin(now * 0.012)) * (1 - o); }
        else I[t.i] = s.lastI[t.i] * Math.exp(-f * 7) * (1 - o);
      }
      const wantDim = ph === "finale" && p < 0.92;
      if (wantDim !== s.dimmed) { s.dimmed = wantDim; setDim(wantDim, s.targets); }
    }

    ctx.globalCompositeOperation = "lighter";
    for (const t of tiles) {
      if (I[t.i] < 0.01) continue;
      const own = inFinale && isT.has(t);
      glowHex(t, I[t.i], M[t.i], own ? themeOf(t.src) : s.th, now, own);
    }

    if (ph === "dance") {
      if (s.dance.extra) s.dance.extra(s, p);
      for (const t of tiles) if (I[t.i] > 0.55 && Math.random() < I[t.i] * 0.3) { const [x, y] = edgePoint(t); spawn(s.th, x, y, false); }
    }

    if (inFinale) {
      const f = ph === "finale" ? p : 1, o = ph === "out" ? p : 0;
      const secs = ph === "finale" ? (p * s.dur.finale) / 1000 : 9;
      for (const t of s.targets) {
        const th = themeOf(t.src);
        if (!s.burst) for (let n = 0; n < 46; n++) { const [x, y] = edgePoint(t); spawn(th, x, y, true, t.x, t.y); }
        if (ph === "finale" && Math.random() < 0.6) { const [x, y] = edgePoint(t); spawn(th, x, y, false); }
        // uitdijende ringen
        for (let r = 0; r < 3; r++) {
          const age = (secs - r * 0.22) / 0.8;
          if (age < 0 || age > 1) continue;
          ctx.globalAlpha = (1 - age) ** 2 * 0.9;
          ctx.lineWidth = 0.07 * (1 - age) + 0.015;
          ctx.strokeStyle = rgba(mix(th.b, th.core, 0.4), 1);
          hexPath(t.x, t.y, 0.95 + 2.3 * easeOut(age));
          ctx.stroke();
        }
        // flitsende hoekpunten (daar staan later de dorpen)
        ctx.globalAlpha = 1;
        for (let c = 0; c < 6; c++) {
          const a = (c * Math.PI) / 3;
          const x = t.x + 0.93 * Math.cos(a), y = t.y + 0.93 * Math.sin(a);
          const fl = (0.55 + 0.45 * Math.sin(now * 0.009 + c * 1.1)) * (1 - o);
          const g = ctx.createRadialGradient(x, y, 0, x, y, 0.22);
          g.addColorStop(0, rgba(th.core, fl));
          g.addColorStop(1, rgba(th.a, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, 0.22, 0, 7); ctx.fill();
        }
        // fiche springt op, met een halo eronder
        const pop = f < 0.22 ? 1 + 0.6 * backOut(f / 0.22) : 1.6 - 0.25 * smooth(0.22, 0.5, f);
        const sc = lerp(pop, 1, easeInOut(o));
        setTokenScale(t, sc);
        const halo = (0.75 + 0.25 * Math.sin(now * 0.008)) * (1 - o);
        const R = 0.3 * sc;
        const hg = ctx.createRadialGradient(t.x, t.y, R * 0.5, t.x, t.y, R * 2.8);
        hg.addColorStop(0, rgba(th.core, 0.9 * halo));
        hg.addColorStop(0.35, rgba(th.a, 0.55 * halo));
        hg.addColorStop(1, rgba(th.a, 0));
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(t.x, t.y, R * 2.8, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      s.burst = true;
    }

    updateParts(dt);
    drawParts();
    ctx.globalCompositeOperation = "source-over";
  }

  return { init, play, stop, THEMES };
})();
