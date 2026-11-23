// Opstart van de bordpagina: menu -> instellingen -> lobby -> spel.
const $ = (id) => document.getElementById(id);

// ---------- Bord (wordt meteen getekend, maar blijft verborgen tot de start) ----------
const model = Board.createModel({ radius: 2, size: 1 });
Board.render($("board"), model);
window.board = model; // handig om in de console te bekijken

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
  Lobby.markStarted();
  showScreen(null); // menu/lobby faden uit
  setTimeout(() => {
    $("table").classList.remove("hidden");
    document.body.classList.add("game-started"); // start de tegel-animaties
  }, 800);
}

// ---------- Menu ----------
let withPhones = true;

function openSettings(phones) {
  withPhones = phones;
  $("btn-settings-next").textContent = phones ? "Verder naar lobby" : "Start spel";
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

  if (gameStarted) return;
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

// ---------- Berichten van telefoons ----------
function handleMessage(side, msg) {
  if (msg.type === "roll" && gameStarted) {
    // Tijdelijk: simpele uitslag. De rollende dobbelstenen komen in een latere stap.
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    showToast(`${side === "links" ? "Links" : "Rechts"} gooit ${d1} + ${d2} = ${d1 + d2}`);
    Lobby.broadcast({ type: "rolled", side, d1, d2 });
  }
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
  Lobby.close();
  $("table").classList.add("hidden");
  setTimeout(() => {
    document.body.classList.remove("game-started", "show-debug"); // zodat de fade-in volgende keer opnieuw speelt
    showScreen("menu");
  }, 1000);
}

console.log(`Bord: ${model.tiles.length} tegels, ${model.vertices.length} hoekpunten, ${model.edges.length} randen`);
