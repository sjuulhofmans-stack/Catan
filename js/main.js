// Opstart van de bordpagina: menu -> instellingen -> lobby -> spel.
const $ = (id) => document.getElementById(id);

// ---------- Bord (wordt meteen getekend, maar blijft verborgen tot de start) ----------
const model = Board.createModel({ radius: 2, size: 1 });
Board.render($("board"), model);
window.board = model; // handig om in de console te bekijken

// Zee-achtergrond, met de kust langs de tegels
Sea.init($("sea"));
Sea.setBoard($("board"), model);

// ---------- Spelinstellingen ----------
let gameConfig = null;

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Spelersvakken vullen; hoeken zonder speler worden verborgen
function applyConfig(config) {
  gameConfig = config;
  window.gameConfig = config; // handig in de console
  document.querySelectorAll(".player-panel").forEach((panel) => {
    const player = config.players.find((p) => p.seat === panel.dataset.seat);
    panel.hidden = !player;
    if (!player) return;
    panel.style.setProperty("--player-color", player.color);
    panel.innerHTML = `
      <div class="player-name"></div>
      <div class="player-body">
        <span class="player-points">0 / ${config.targetPoints} punten</span>
        ${config.timer.enabled ? `<span class="player-timer">⏱ ${formatTime(config.timer.seconds)}</span>` : ""}
      </div>
    `;
    panel.querySelector(".player-name").textContent = player.name;
  });
}

// ---------- Schermen ----------
const screens = { menu: $("screen-menu"), settings: $("screen-settings"), lobby: $("screen-lobby") };

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.classList.toggle("hidden", key !== name);
}

// ---------- Spel starten ----------
let gameStarted = false;
let autoStartTimer = null;

function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  clearTimeout(autoStartTimer);
  $("test-controls").hidden = withPhones; // testbord: knop onderin
  resetTurns();
  Lobby.markStarted();
  broadcastState();
  showScreen(null); // menu/lobby faden uit
  setTimeout(() => {
    $("table").classList.remove("hidden");
    document.body.classList.add("game-started"); // start de tegel-animaties
    Sea.resize();
    Sea.setShore(true); // ondiep water + branding rond het eiland
  }, 800);
}

// ---------- Menu ----------
let withPhones = true;

function openSettings(phones) {
  withPhones = phones;
  $("btn-settings-next").textContent = phones ? "Verder naar lobby" : "Start testbord";
  Settings.render();
  showScreen("settings");
}

$("btn-new").addEventListener("click", () => openSettings(true));
$("btn-solo").addEventListener("click", () => openSettings(false));

// ---------- Instellingen ----------
Settings.mount();
$("btn-settings-back").addEventListener("click", () => showScreen("menu"));
$("btn-settings-next").addEventListener("click", () => {
  applyConfig(Settings.getConfig());
  if (withPhones) openLobby();
  else startGame();
});

// ---------- Lobby ----------
function openLobby() {
  showScreen("lobby");
  $("room-code").textContent = "····";
  $("qr").replaceChildren();
  $("lobby-status").textContent = "Room wordt aangemaakt…";
  renderSlots(Lobby.getSlots());

  Lobby.open({
    onRoom(code) {
      const url = new URL(`controller.html?room=${code}`, location.href).href;
      $("room-code").textContent = code;
      $("join-url").textContent = url.split("?")[0];
      $("qr").replaceChildren();
      if (typeof QRCode !== "undefined") {
        new QRCode($("qr"), { text: url, width: 512, height: 512, correctLevel: QRCode.CorrectLevel.M });
      }
      $("lobby-status").textContent = location.protocol === "file:"
        ? "Let op: lokaal geopend. Telefoons kunnen alleen joinen via de GitHub Pages-versie."
        : "";
    },
    onSlots: renderSlots,
    onMessage: handleMessage,
    onStatus: (text) => { $("lobby-status").textContent = text; },
  });
}

function renderSlots(slots) {
  const joined = Object.values(slots).filter(Boolean).length;
  for (const side of Lobby.SIDES) {
    const li = $(`slot-${side}`);
    li.classList.toggle("joined", slots[side]);
    li.querySelector(".slot-state").textContent = slots[side] ? "verbonden ✓" : "wachten…";
  }
  $("btn-start").disabled = joined === 0;

  if (gameStarted) { broadcastState(); return; } // telefoon die tijdens het spel (opnieuw) joint
  clearTimeout(autoStartTimer);
  if (joined === Lobby.SIDES.length) {
    $("lobby-status").textContent = "Iedereen is er! Het spel start…";
    autoStartTimer = setTimeout(startGame, 2000);
  } else if (joined > 0) {
    $("lobby-status").textContent = "";
  }
}

$("btn-start").addEventListener("click", startGame);
$("btn-back").addEventListener("click", () => {
  clearTimeout(autoStartTimer);
  Lobby.close();
  showScreen("settings");
});

// ---------- Beurten + timer ----------
// Een beurt heeft twee fasen:
//   "roll"   -> knop "Dobbelen"
//   "rolled" -> na 5 s knop "Beurt eindigen"; daarna is de volgende speler (met de klok mee) aan de beurt
// De timer start bij het dobbelen en blijft op 0:00 staan tot de beurt eindigt.
// Het bord is de baas over de fase; telefoons volgen via "state"-berichten.
const CLOCKWISE = ["tl", "tr", "br", "bl"];
const END_TURN_LOCK_MS = 5000;
let turnOrder = [];
let turnIndex = 0;
let phase = "roll";
let lockUntil = 0;
let turnEndsAt = 0;
let timerTick = null;

function resetTurns() {
  turnOrder = CLOCKWISE.filter((seat) => gameConfig?.players.some((p) => p.seat === seat));
  turnIndex = 0;
  phase = "roll";
  lockUntil = 0;
  stopTimer();
  highlightTurn();
}

function currentPlayer() {
  const seat = turnOrder[turnIndex];
  return gameConfig?.players.find((p) => p.seat === seat);
}

function highlightTurn() {
  const seat = gameStarted ? turnOrder[turnIndex] : null;
  document.querySelectorAll(".player-panel").forEach((panel) => {
    panel.classList.toggle("active-turn", panel.dataset.seat === seat);
    panel.classList.remove("time-up");
  });
}

function broadcastState() {
  const p = currentPlayer();
  Lobby.broadcast({
    type: "state",
    phase,
    player: p ? { name: p.name, color: p.color } : null,
    lockMs: Math.max(0, lockUntil - Date.now()),
  });
  renderTestControls();
}

// ---------- Testbord: dezelfde knop als op de telefoon, onderin het scherm ----------
let testCountdown = null;

function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}

function renderTestControls() {
  clearTimeout(testCountdown);
  if ($("test-controls").hidden) return;
  const btn = $("btn-test-action");
  const p = currentPlayer();
  $("test-turn").textContent = p ? `${p.name} is aan de beurt` : "";
  btn.style.background = p ? p.color : "";
  btn.style.color = p ? textOn(p.color) : "";

  const left = Math.ceil((lockUntil - Date.now()) / 1000);
  if (phase === "roll") {
    btn.textContent = "Dobbelen";
    btn.disabled = false;
  } else if (left > 0) {
    btn.textContent = `Beurt eindigen (${left})`;
    btn.disabled = true;
    testCountdown = setTimeout(renderTestControls, 200);
  } else {
    btn.textContent = "Beurt eindigen";
    btn.disabled = false;
  }
}

$("btn-test-action").addEventListener("click", (e) => {
  mainAction();
  e.currentTarget.blur(); // zodat spatie niet ook nog de knop indrukt
});

function endTurn() {
  if (!gameStarted || phase !== "rolled" || Date.now() < lockUntil) return;
  stopTimer();
  turnIndex = (turnIndex + 1) % turnOrder.length;
  phase = "roll";
  highlightTurn(); // later: animatie "volgende speler is aan de beurt"
  broadcastState();
}

function startTimer() {
  stopTimer();
  turnEndsAt = Date.now() + gameConfig.timer.seconds * 1000;
  updateTimer();
  timerTick = setInterval(updateTimer, 200);
}

function stopTimer() {
  clearInterval(timerTick);
  timerTick = null;
  // Alle timers terug naar de ingestelde tijd
  document.querySelectorAll(".player-timer").forEach((el) => {
    el.textContent = `⏱ ${formatTime(gameConfig?.timer.seconds ?? 0)}`;
  });
}

function updateTimer() {
  const panel = document.querySelector(`.player-panel[data-seat="${turnOrder[turnIndex]}"]`);
  const timerEl = panel?.querySelector(".player-timer");
  if (!timerEl) return;
  const left = Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000));
  timerEl.textContent = `⏱ ${formatTime(left)}`;
  if (left === 0) {
    clearInterval(timerTick);
    timerTick = null;
    panel.classList.add("time-up");
  }
}

// ---------- Dobbelen ----------
function roll() {
  if (!gameStarted || phase !== "roll") return;
  // Het bord bepaalt de uitslag; de 3D-stenen worden zo gegooid dat ze daarop landen
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  const player = currentPlayer();
  const resultText = `${player ? player.name : "Worp"}: ${d1} + ${d2} = ${d1 + d2}`;
  phase = "rolled";
  lockUntil = Date.now() + END_TURN_LOCK_MS;
  if (gameConfig.timer.enabled) startTimer();
  broadcastState();
  if (!throwDice(player, [d1, d2], () => showToast(resultText))) showToast(resultText);
}

// ---------- Dobbelstenen (3D, js/dice-roller.js) ----------
// Formaat: een steen is ongeveer 0,42 tegelbreedte. Ze worden gegooid vanuit de hoek van de speler
// en landen binnen het bord. Zonder internet/three.js valt het terug op alleen de tekst.
const DIE_SIZE_IN_TILES = 0.42;
const LAND_RADIUS = 3.0; // in tegelstralen vanaf het midden: ruim binnen het eiland
const SEAT_DIR = { tl: [-1, -1], tr: [1, -1], bl: [-1, 1], br: [1, 1] };
let diceRoller = null;

function diceGeometry() {
  const m = $("board").getScreenCTM();
  if (!m || !innerWidth) return null;
  const view = innerWidth / (DIE_SIZE_IN_TILES * Math.sqrt(3) * m.a); // wereldbreedte van het scherm, 1 = steen
  return { view, landR: (LAND_RADIUS * m.a * view) / innerWidth };
}

function updateDiceView() {
  const g = diceGeometry();
  if (diceRoller && g) diceRoller.setView(g.view);
}
window.addEventListener("resize", updateDiceView);

function throwDice(player, values, onLanded) {
  if (!diceRoller && window.DiceRoller) {
    try {
      diceRoller = new window.DiceRoller($("dice-layer"));
      updateDiceView();
    } catch (err) {
      console.warn("Dobbelstenen konden niet starten:", err);
      return false;
    }
  }
  const g = diceGeometry();
  if (!diceRoller || !g) return false;
  const [sx, sz] = SEAT_DIR[player?.seat] ?? [0, 1];
  const from = Math.atan2(sz * diceRoller.hz, sx * diceRoller.hx); // richting van het midden naar de hoek
  diceRoller.onResult = onLanded;
  diceRoller.roll(values, { from, landR: g.landR });
  return true;
}

// Eén knop: dobbelen, of (na 5 s) beurt eindigen
function mainAction() {
  if (phase === "roll") roll();
  else endTurn();
}

// ---------- Berichten van telefoons ----------
function handleMessage(side, msg) {
  if (msg.type === "roll") roll();
  if (msg.type === "endTurn") endTurn();
}

let toastTimer;
function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

// ---------- Fullscreen ----------
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch((err) => console.warn("Fullscreen geweigerd:", err));
}
document.querySelectorAll(".btn-fullscreen").forEach((b) => b.addEventListener("click", toggleFullscreen));
document.addEventListener("fullscreenchange", () => {
  const on = Boolean(document.fullscreenElement);
  document.body.classList.toggle("is-fullscreen", on);
  document.querySelectorAll(".btn-fullscreen").forEach((b) => (b.textContent = on ? "Venster" : "Fullscreen"));
});

// ---------- Debuglaag + sneltoetsen ----------
const toggleDebug = () => document.body.classList.toggle("show-debug");
$("btn-debug").addEventListener("click", toggleDebug);

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, select, textarea")) return; // niet tijdens typen (bijv. een naam met een f)
  if (e.key === "f" || e.key === "F") toggleFullscreen();
  if (e.key === "d" || e.key === "D") toggleDebug();
  if (e.key === " " && gameStarted) { e.preventDefault(); mainAction(); } // spatie = telefoonknop
});

// ---------- Zijmenu: opent als de muis de linkerrand raakt ----------
const sideMenu = $("side-menu");
const EDGE_PX = 8;
let menuCloseTimer;

function setSideMenu(open) {
  clearTimeout(menuCloseTimer);
  sideMenu.classList.toggle("open", open);
}

document.addEventListener("mousemove", (e) => {
  if (gameStarted && e.clientX <= EDGE_PX) setSideMenu(true);
});
sideMenu.addEventListener("mouseenter", () => clearTimeout(menuCloseTimer));
sideMenu.addEventListener("mouseleave", () => {
  menuCloseTimer = setTimeout(() => setSideMenu(false), 400);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  setSideMenu(false);
  setConfirmHome(false);
});

// Terug naar het hoofdmenu: eerst bevestigen
const confirmHome = $("confirm-home");

function setConfirmHome(open) {
  confirmHome.classList.toggle("hidden", !open);
  if (open) $("btn-confirm-cancel").focus(); // veilige keuze heeft de focus
}

$("btn-home").addEventListener("click", () => {
  setSideMenu(false);
  setConfirmHome(true);
});
$("btn-confirm-cancel").addEventListener("click", () => setConfirmHome(false));
confirmHome.addEventListener("click", (e) => { if (e.target === confirmHome) setConfirmHome(false); });
$("btn-confirm-home").addEventListener("click", () => {
  setConfirmHome(false);
  goToMainMenu();
});

// Spel stoppen en telefoons loskoppelen
function goToMainMenu() {
  gameStarted = false;
  resetTurns();
  Sea.setShore(false);
  diceRoller?.hide();
  Lobby.close();
  $("table").classList.add("hidden");
  setTimeout(() => {
    document.body.classList.remove("game-started", "show-debug"); // zodat de fade-in volgende keer opnieuw speelt
    showScreen("menu");
  }, 1000);
}

console.log(`Bord: ${model.tiles.length} tegels, ${model.vertices.length} hoekpunten, ${model.edges.length} randen`);
