// Bootjes op de zee (2D-canvas tussen de zee en het bord, eigen code).
// Maximaal MAX_BOATS tegelijk. Een boot komt van de zijkant van het scherm, vaart om het eiland
// heen naar een vrije haven, legt aan naast de steiger, laadt/lost even en vaart achteruit weg.
// Daarna soms door naar een andere haven, anders terug naar de zijkant.
// Alles wordt in bordcoördinaten gerekend (1 = straal van een tegel) en per frame via de
// schermmatrix van de SVG omgezet, zodat het altijd klopt met het bord (ook na resize/fullscreen).
const Boats = (() => {
  const MAX_BOATS = 5;
  const COAST_R = 4.95;      // vaarcirkel om het eiland (kust ligt binnen ~4,36)
  const CLEAR_R = 4.55;      // een rechte lijn die dichter bij het midden komt, gaat via de vaarcirkel
  const ARC_STEP = (15 * Math.PI) / 180;
  const WAKE_LIFE = 4.5;     // seconden dat het kielzog zichtbaar blijft
  const COLORS = [
    { hull: "#7a4a2a", deck: "#c89a62", accent: "#b23a2e" },
    { hull: "#24384f", deck: "#d8cfb8", accent: "#e0a030" },
    { hull: "#f2efe6", deck: "#b98d5a", accent: "#2f6fa3" },
    { hull: "#3c5a3a", deck: "#cdb88a", accent: "#e8e2d0" },
    { hull: "#8a2f2a", deck: "#d9c49a", accent: "#2b2b2b" },
  ];
  const CRATE_COLORS = ["#a8743f", "#c9a24a", "#7f8f9a", "#9b5a3c", "#6f8a4a"];

  let canvas, ctx, svg, model;
  let boats = [];
  let running = false, raf = 0, last = 0, nextSpawn = 0, clock = 0;
  const reserved = new Set(); // havens waar een boot naartoe vaart of ligt

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function init(el, boardSvg, boardModel) {
    canvas = el;
    ctx = canvas.getContext("2d");
    svg = boardSvg;
    model = boardModel;
    window.addEventListener("resize", resize);
    resize();
  }

  function resize() {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }

  function start() {
    if (running || !canvas) return;
    running = true;
    boats = [];
    reserved.clear();
    nextSpawn = clock + 3.5; // eerst de tegels laten verschijnen
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    boats = [];
    reserved.clear();
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ---------- Geometrie ----------
  function screenBox() {
    const m = svg.getScreenCTM();
    if (!m || !m.a) return null;
    return { m, x0: -m.e / m.a, x1: (innerWidth - m.e) / m.a, y0: -m.f / m.d, y1: (innerHeight - m.f) / m.d };
  }

  // Punt net buiten beeld, in richting `angle` vanaf het midden
  function offscreen(angle) {
    const b = screenBox();
    const pad = 0.6;
    const x0 = (b ? b.x0 : -9) - pad, x1 = (b ? b.x1 : 9) + pad;
    const y0 = (b ? b.y0 : -5) - pad, y1 = (b ? b.y1 : 5) + pad;
    const c = Math.cos(angle), s = Math.sin(angle);
    let t = Infinity;
    if (c > 1e-6) t = Math.min(t, x1 / c);
    if (c < -1e-6) t = Math.min(t, x0 / c);
    if (s > 1e-6) t = Math.min(t, y1 / s);
    if (s < -1e-6) t = Math.min(t, y0 / s);
    return { x: c * t, y: s * t };
  }

  function segDist(p, q) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const t = Math.max(0, Math.min(1, -(p.x * dx + p.y * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x + t * dx, p.y + t * dy);
  }

  // Vaarroute van p naar q zonder over het eiland te gaan: zo nodig via een boog om het eiland
  function route(p, q, r) {
    if (segDist(p, q) >= CLEAR_R) return [p, q];
    const a0 = Math.atan2(p.y, p.x);
    const d = wrap(Math.atan2(q.y, q.x) - a0);
    const n = Math.max(2, Math.ceil(Math.abs(d) / ARC_STEP));
    const pts = [p];
    for (let i = 1; i < n; i++) {
      const a = a0 + (d * i) / n;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    pts.push(q);
    return pts;
  }

  // Catmull-Rom door de punten, als polylijn met afgelegde afstand
  function spline(points) {
    const P = [points[0], ...points, points[points.length - 1]];
    const out = [];
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const steps = Math.max(4, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 0.08));
      for (let j = 0; j < steps; j++) {
        const t = j / steps, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    out.push(points[points.length - 1]);
    let len = 0;
    out[0].s = 0;
    for (let i = 1; i < out.length; i++) {
      len += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
      out[i].s = len;
    }
    return { pts: out, len };
  }

  function sample(path, s) {
    const pts = path.pts;
    let i = 1;
    while (i < pts.length - 1 && pts[i].s < s) i++;
    const a = pts[i - 1], b = pts[i];
    const t = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dir: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  // ---------- Havens ----------
  function dockInfo(h, side) {
    const tx = -h.ny * side, ty = h.nx * side; // zijwaarts langs de kust, naast de steiger
    const at = (n, t) => ({ x: h.x + h.nx * n + tx * t, y: h.y + h.ny * n + ty * t });
    return {
      approach: at(1.0, 0.16),
      dock: at(0.33, 0.16),
      backOut: [at(0.55, 0.24), at(0.85, 0.5)],
      heading: Math.atan2(-h.ny, -h.nx),
    };
  }

  // Vrije haven, bij voorkeur aan de kant waar de boot vandaan komt
  function chooseHarbor(from, exclude) {
    const free = model.harbors.filter((h) => !reserved.has(h.id) && h.id !== exclude);
    if (!free.length) return null;
    const a = Math.atan2(from.y, from.x);
    const weights = free.map((h) => 1.3 + Math.cos(wrap(h.angle - a)));
    let r = Math.random() * weights.reduce((x, y) => x + y, 0);
    for (let i = 0; i < free.length; i++) if ((r -= weights[i]) <= 0) return free[i];
    return free[free.length - 1];
  }

  // ---------- Boten ----------
  function spawn() {
    const sideAngle = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.45, 0.45); // vanaf links of rechts
    const start = offscreen(sideAngle);
    const harbor = chooseHarbor(start);
    if (!harbor) return;
    const kind = pick(["vracht", "vracht", "zeil", "visser"]);
    const boat = {
      kind,
      colors: pick(COLORS),
      crates: Array.from({ length: 6 }, () => pick(CRATE_COLORS)),
      cargo: kind === "vracht" ? Math.floor(rand(0, 5)) : 0,
      len: kind === "zeil" ? 0.36 : kind === "visser" ? 0.38 : 0.46,
      cruise: rand(0.28, 0.4),
      lane: COAST_R + rand(0, 0.3), // eigen vaarbaan, zodat boten niet over elkaar varen
      x: start.x, y: start.y, heading: sideAngle + Math.PI,
      visits: 0,
      wake: [], wakeTimer: 0,
      bob: rand(0, 10),
      legs: [],
    };
    sailToHarbor(boat, start, harbor, false);
    boats.push(boat);
  }

  function sailToHarbor(boat, from, harbor, fromStop) {
    reserved.add(harbor.id);
    boat.harbor = harbor;
    boat.side = Math.random() < 0.5 ? 1 : -1;
    const d = dockInfo(harbor, boat.side);
    const pts = route(from, d.approach, boat.lane);
    boat.legs.push({ path: spline([...pts, d.dock]), easeIn: fromStop, easeOut: true, speed: boat.cruise });
    boat.legs.push({ wait: rand(5, 10), heading: d.heading });
    boat.legs.push({ path: spline([d.dock, ...d.backOut]), reverse: true, easeIn: true, easeOut: true, speed: 0.09 });
    boat.legs.push({ then: "depart" });
  }

  // Na het wegvaren: naar een andere haven of terug naar de zijkant
  function depart(boat) {
    const h = boat.harbor;
    const from = dockInfo(h, boat.side).backOut[1];
    reserved.delete(h.id);
    boat.visits++;
    const next = boat.visits < 3 && Math.random() < 0.45 ? chooseHarbor(from, h.id) : null;
    if (next) {
      sailToHarbor(boat, from, next, true);
      return;
    }
    boat.harbor = null;
    const exitAngle = (h.x >= 0 ? 0 : Math.PI) + rand(-0.4, 0.4);
    const end = offscreen(exitAngle);
    boat.legs.push({ path: spline(route(from, end, boat.lane)), easeIn: true, speed: boat.cruise });
    boat.legs.push({ then: "gone" });
  }

  function update(boat, dt) {
    const leg = boat.legs[0];
    if (!leg) return false;
    let moving = 0;

    if (leg.then) {
      boat.legs.shift();
      if (leg.then === "gone") return false;
      depart(boat);
      return true;
    }

    if (leg.wait !== undefined) {
      // Aangemeerd: laden of lossen
      leg.t = (leg.t || 0) + dt;
      if (boat.kind === "vracht") {
        const half = leg.wait / 2;
        if (leg.t < half) boat.cargo = Math.max(0, Math.min(boat.cargo, Math.ceil((1 - leg.t / half) * 6) - 1));
        else {
          leg.load ??= Math.floor(rand(2, 7));
          boat.cargo = Math.min(leg.load, Math.floor(((leg.t - half) / half) * (leg.load + 1)));
        }
      }
      boat.heading += wrap(leg.heading - boat.heading) * Math.min(1, dt * 2);
      if (leg.t >= leg.wait) boat.legs.shift();
    } else {
      const { path } = leg;
      leg.s = leg.s || 0;
      let v = leg.speed;
      if (leg.easeOut) v *= Math.max(0.1, Math.min(1, Math.sqrt((path.len - leg.s) / 0.9)));
      if (leg.easeIn) v *= Math.max(0.15, Math.min(1, Math.sqrt((leg.s + 0.02) / 0.5)));
      leg.s = Math.min(path.len, leg.s + v * dt);
      const p = sample(path, leg.s);
      boat.x = p.x;
      boat.y = p.y;
      const target = leg.reverse ? p.dir + Math.PI : p.dir;
      const turn = wrap(target - boat.heading);
      const maxTurn = 1.4 * dt;
      boat.heading += Math.max(-maxTurn, Math.min(maxTurn, turn * Math.min(1, dt * 4)));
      moving = leg.reverse ? 0 : v;
      if (leg.s >= path.len) boat.legs.shift();
    }

    // Kielzog: punten achter de boot die uitwaaieren en vervagen
    boat.wake.forEach((w) => (w.age += dt));
    while (boat.wake.length && boat.wake[0].age > WAKE_LIFE) boat.wake.shift();
    boat.wakeTimer -= dt;
    if (moving > 0.03 && boat.wakeTimer <= 0) {
      boat.wakeTimer = 0.12;
      const back = boat.len * 0.48;
      boat.wake.push({
        x: boat.x - Math.cos(boat.heading) * back,
        y: boat.y - Math.sin(boat.heading) * back,
        h: boat.heading, age: 0, strength: Math.min(1, moving / 0.3),
      });
    }
    return true;
  }

  // ---------- Tekenen ----------
  function drawWake(boat) {
    const pts = boat.wake;
    if (pts.length < 2) return;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const spread = (w) => 0.05 + w.age * 0.07;
        const pa = { x: a.x - Math.sin(a.h) * spread(a) * side, y: a.y + Math.cos(a.h) * spread(a) * side };
        const pb = { x: b.x - Math.sin(b.h) * spread(b) * side, y: b.y + Math.cos(b.h) * spread(b) * side };
        const alpha = (1 - b.age / WAKE_LIFE) * 0.42 * b.strength;
        ctx.strokeStyle = `rgba(235,248,255,${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.024 + b.age * 0.008;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }
    // Schuimspoor recht achter de boot
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const alpha = Math.max(0, 1 - b.age / (WAKE_LIFE * 0.45)) * 0.35 * b.strength;
      if (alpha <= 0) continue;
      ctx.strokeStyle = `rgba(220,240,250,${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.06 + b.age * 0.025;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // Romp met puntige boeg (lokaal: x vooruit, y opzij, in bordeenheden)
  function hullPath(L, W) {
    ctx.beginPath();
    ctx.moveTo(L / 2, 0);
    ctx.bezierCurveTo(L * 0.3, -W * 0.55, -L * 0.1, -W / 2, -L / 2, -W * 0.42);
    ctx.lineTo(-L / 2, W * 0.42);
    ctx.bezierCurveTo(-L * 0.1, W / 2, L * 0.3, W * 0.55, L / 2, 0);
    ctx.closePath();
  }

  function drawBoat(boat) {
    const L = boat.len, W = L * (boat.kind === "zeil" ? 0.36 : 0.34);
    const c = boat.colors;
    const sway = Math.sin(clock * 1.3 + boat.bob) * 0.025;

    ctx.save();
    ctx.translate(boat.x, boat.y);
    ctx.rotate(boat.heading + sway);

    // Schaduw op het water
    ctx.save();
    ctx.translate(0.02, 0.03);
    hullPath(L * 1.02, W * 1.05);
    ctx.fillStyle = "rgba(0,20,40,0.28)";
    ctx.fill();
    ctx.restore();

    hullPath(L, W);
    ctx.fillStyle = c.hull;
    ctx.fill();
    ctx.lineWidth = 0.008;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
    hullPath(L * 0.84, W * 0.72);
    ctx.fillStyle = c.deck;
    ctx.fill();

    if (boat.kind === "vracht") {
      // Stuurhut achterop, kisten op het dek
      ctx.fillStyle = c.accent;
      ctx.fillRect(-L * 0.42, -W * 0.26, L * 0.16, W * 0.52);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(-L * 0.30, -W * 0.18, L * 0.03, W * 0.36);
      const s = W * 0.26;
      for (let i = 0; i < boat.cargo; i++) {
        const col = i % 3, row = Math.floor(i / 3);
        ctx.fillStyle = boat.crates[i];
        ctx.fillRect(-L * 0.2 + col * s * 1.12, (row ? 0.02 : -s - 0.002), s, s);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 0.005;
        ctx.strokeRect(-L * 0.2 + col * s * 1.12, (row ? 0.02 : -s - 0.002), s, s);
      }
    } else if (boat.kind === "visser") {
      ctx.fillStyle = "#e9e4d6";
      ctx.fillRect(-L * 0.1, -W * 0.22, L * 0.22, W * 0.44);
      ctx.fillStyle = c.accent;
      ctx.fillRect(-L * 0.1, -W * 0.22, L * 0.22, W * 0.1);
      ctx.strokeStyle = "#5a4630";
      ctx.lineWidth = 0.008;
      ctx.beginPath();
      ctx.moveTo(-L * 0.15, 0);
      ctx.lineTo(-L * 0.45, -W * 0.55); // giek met net
      ctx.stroke();
    } else {
      // Zeilboot: bol zeil dat met de wind mee staat
      ctx.save();
      ctx.rotate(-0.35);
      ctx.beginPath();
      ctx.moveTo(L * 0.12, 0);
      ctx.quadraticCurveTo(-L * 0.08, W * 0.75, -L * 0.36, 0.004);
      ctx.lineTo(L * 0.12, 0);
      ctx.fillStyle = "#f7f4ec";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 0.005;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#4a3a2a";
      ctx.beginPath();
      ctx.arc(L * 0.12, 0, 0.016, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;

    if (clock >= nextSpawn) {
      if (boats.length < MAX_BOATS) spawn();
      nextSpawn = clock + rand(4, 12);
    }
    boats = boats.filter((b) => update(b, dt));

    const dpr = canvas.width / Math.max(1, innerWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const m = svg.getScreenCTM();
    if (m) {
      ctx.setTransform(m.a * dpr, 0, 0, m.d * dpr, m.e * dpr, m.f * dpr);
      for (const b of boats) drawWake(b); // lijndiktes in bordeenheden
      for (const b of boats) drawBoat(b);
    }
    raf = requestAnimationFrame(frame);
  }

  return { init, start, stop };
})();
