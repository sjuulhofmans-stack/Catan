// Instellingenpagina: aantal spelers, plaatsen, namen, kleuren, timer en puntendoel.
// Regels worden afgedwongen door de bediening zelf, zodat de instellingen altijd geldig zijn:
// - kleuren zijn uniek (een gekozen kleur wisselt met wie hem had)
// - bij 2 spelers zitten ze altijd schuin tegenover elkaar
const Settings = (() => {
  const COLORS = [
    { id: "wit", label: "Wit", hex: "#f1f1f1" },
    { id: "blauw", label: "Blauw", hex: "#2f6fff" },
    { id: "rood", label: "Rood", hex: "#e63946" },
    { id: "oranje", label: "Oranje", hex: "#ff8c1a" },
  ];
  const SEATS = [
    { id: "tl", label: "Linksboven" },
    { id: "tr", label: "Rechtsboven" },
    { id: "bl", label: "Linksonder" },
    { id: "br", label: "Rechtsonder" },
  ];
  const OPPOSITE = { tl: "br", br: "tl", tr: "bl", bl: "tr" };
  const DEFAULT_ACTIVE = { 2: ["tl", "br"], 3: ["tl", "tr", "br"], 4: ["tl", "tr", "bl", "br"] };
  const POINTS_MIN = 10;
  const POINTS_MAX = 30;
  const STORAGE_KEY = "hexbord-settings";

  const $ = (id) => document.getElementById(id);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const colorById = (id) => COLORS.find((c) => c.id === id);

  function defaults() {
    return {
      playerCount: 4,
      seats: {
        tl: { active: true, name: "", color: "rood" },
        tr: { active: true, name: "", color: "blauw" },
        bl: { active: true, name: "", color: "wit" },
        br: { active: true, name: "", color: "oranje" },
      },
      timer: { enabled: false, seconds: 120 },
      targetPoints: POINTS_MIN,
    };
  }

  // Vorige instellingen terughalen (alleen als ze nog geldig zijn)
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const seats = s && s.seats && SEATS.map((x) => s.seats[x.id]);
      const colorsOk = seats && seats.every((x) => x && colorById(x.color)) &&
        new Set(seats.map((x) => x.color)).size === COLORS.length;
      const activeCount = seats && seats.filter((x) => x.active).length;
      if (colorsOk && [2, 3, 4].includes(s.playerCount) && activeCount === s.playerCount && s.timer) {
        if (s.playerCount === 2 && !SEATS.every((x) => s.seats[x.id].active === s.seats[OPPOSITE[x.id]].active)) {
          return defaults();
        }
        s.targetPoints = clamp(Number(s.targetPoints) || POINTS_MIN, POINTS_MIN, POINTS_MAX);
        return s;
      }
    } catch { /* geen of kapotte opslag */ }
    return defaults();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* opslag geblokkeerd */ }
  }

  let state = load();

  // ---------- Acties ----------
  function setCount(n) {
    state.playerCount = n;
    for (const seat of SEATS) state.seats[seat.id].active = DEFAULT_ACTIVE[n].includes(seat.id);
    render();
  }

  function sitAt(seatId) { // 2 spelers: kies een diagonaal paar
    for (const seat of SEATS) state.seats[seat.id].active = seat.id === seatId || seat.id === OPPOSITE[seatId];
    render();
  }

  function makeEmpty(seatId) { // 3 spelers: deze hoek blijft leeg
    for (const seat of SEATS) state.seats[seat.id].active = seat.id !== seatId;
    render();
  }

  function setColor(seatId, colorId) {
    const other = SEATS.find((s) => state.seats[s.id].color === colorId);
    if (other) state.seats[other.id].color = state.seats[seatId].color; // wisselen
    state.seats[seatId].color = colorId;
    render();
  }

  // ---------- Weergave ----------
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function renderSeats() {
    for (const seat of SEATS) {
      const el = document.querySelector(`.seat[data-seat="${seat.id}"]`);
      const s = state.seats[seat.id];
      const color = colorById(s.color);
      el.classList.toggle("active", s.active);
      el.style.setProperty("--seat-color", color.hex);

      let action = "";
      if (state.playerCount === 2 && !s.active) action = `<button type="button" class="seat-action" data-action="sit">Hier zitten</button>`;
      if (state.playerCount === 3 && s.active) action = `<button type="button" class="seat-action" data-action="empty">Leeg maken</button>`;

      el.innerHTML = `
        <div class="seat-head"><span class="seat-pos">${seat.label}</span>${action}</div>
        ${s.active ? `
          <input class="seat-name" type="text" maxlength="16" placeholder="Naam (${color.label})" value="${escapeHtml(s.name)}">
          <div class="swatches">
            ${COLORS.map((c) => `<button type="button" class="swatch${c.id === s.color ? " selected" : ""}"
              data-color="${c.id}" style="--c:${c.hex}" title="${c.label}" aria-label="${c.label}"></button>`).join("")}
          </div>` : `<p class="seat-empty">Leeg</p>`}
      `;
    }

    $("seat-hint").textContent = {
      2: "Bij 2 spelers zitten jullie altijd schuin tegenover elkaar. Kies 'Hier zitten' om het paar te wisselen.",
      3: "Kies met 'Leeg maken' welke hoek vrij blijft.",
      4: "",
    }[state.playerCount];
  }

  function render() {
    document.querySelectorAll("#player-count button").forEach((b) =>
      b.classList.toggle("selected", Number(b.dataset.count) === state.playerCount));
    renderSeats();
    $("timer-on").checked = state.timer.enabled;
    $("timer-seconds").value = String(state.timer.seconds);
    $("timer-seconds").disabled = !state.timer.enabled;
    $("target-points").value = String(state.targetPoints);
    $("target-points-value").textContent = state.targetPoints;
  }

  // ---------- Koppelen ----------
  function mount() {
    document.querySelectorAll("#player-count button").forEach((b) =>
      b.addEventListener("click", () => setCount(Number(b.dataset.count))));

    const map = $("seat-map");
    map.addEventListener("click", (e) => {
      const seatEl = e.target.closest(".seat");
      if (!seatEl) return;
      const seatId = seatEl.dataset.seat;
      const action = e.target.closest("[data-action]")?.dataset.action;
      const colorId = e.target.closest("[data-color]")?.dataset.color;
      if (action === "sit") sitAt(seatId);
      if (action === "empty") makeEmpty(seatId);
      if (colorId) setColor(seatId, colorId);
    });
    map.addEventListener("input", (e) => {
      if (!e.target.classList.contains("seat-name")) return;
      state.seats[e.target.closest(".seat").dataset.seat].name = e.target.value; // geen render: focus blijft
    });

    $("timer-on").addEventListener("change", (e) => { state.timer.enabled = e.target.checked; render(); });
    $("timer-seconds").addEventListener("change", (e) => { state.timer.seconds = Number(e.target.value); });
    $("target-points").addEventListener("input", (e) => {
      state.targetPoints = clamp(Number(e.target.value), POINTS_MIN, POINTS_MAX);
      $("target-points-value").textContent = state.targetPoints;
    });

    render();
  }

  // Wat het spel nodig heeft
  function getConfig() {
    save();
    return {
      players: SEATS.filter((s) => state.seats[s.id].active).map((s) => {
        const st = state.seats[s.id];
        const c = colorById(st.color);
        return { seat: s.id, name: st.name.trim() || c.label, colorId: c.id, color: c.hex };
      }),
      timer: { ...state.timer },
      targetPoints: clamp(state.targetPoints, POINTS_MIN, POINTS_MAX),
    };
  }

  return { mount, render, getConfig, COLORS, SEATS };
})();
