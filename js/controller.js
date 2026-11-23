// Telefoonkant: één grote knop. Het bord bepaalt de fase en stuurt "state"-berichten:
//   phase "roll"   -> knop "Dobbelen"
//   phase "rolled" -> knop "Beurt eindigen", pas actief na lockMs (5 s)
const PREFIX = "hexbord-";
const $ = (id) => document.getElementById(id);

let peer = null;
let conn = null;
let ui = { phase: "waiting", player: null, unlockAt: 0 };
let countdownTimer = null;

function setStatus(text) { $("status").textContent = text; }

function showJoin() {
  $("step-join").hidden = false;
  $("step-joined").hidden = true;
  $("btn-join").disabled = false;
}

function join() {
  const code = $("code").value.trim().toUpperCase();
  if (code.length !== 4) { setStatus("Vul een code van 4 letters in."); return; }
  if (typeof Peer === "undefined") { setStatus("PeerJS kon niet laden. Is er internet?"); return; }

  setStatus("Verbinden…");
  $("btn-join").disabled = true;
  peer?.destroy();
  peer = new Peer();

  peer.on("open", () => {
    conn = peer.connect(PREFIX + code, { reliable: true });
    conn.on("open", () => setStatus("Verbonden"));
    conn.on("data", onMessage);
    conn.on("close", () => { setStatus("Verbinding verbroken."); showJoin(); });
  });

  peer.on("error", (err) => {
    setStatus(err.type === "peer-unavailable" ? "Room niet gevonden. Klopt de code?" : `Fout: ${err.type}`);
    showJoin();
  });

  keepScreenAwake();
}

function onMessage(msg) {
  switch (msg.type) {
    case "welcome":
      $("side").textContent = msg.side;
      $("step-join").hidden = true;
      $("step-joined").hidden = false;
      setStatus("");
      break;
    case "full":
      setStatus("Deze room is al vol.");
      showJoin();
      break;
    case "state":
      ui = { phase: msg.phase, player: msg.player, unlockAt: Date.now() + (msg.lockMs || 0) };
      renderAction();
      break;
  }
}

// Donkere of lichte tekst, afhankelijk van de spelerskleur
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}

function renderAction() {
  clearTimeout(countdownTimer);
  const btn = $("btn-action");
  const p = ui.player;

  $("turn-label").textContent = p ? `${p.name} is aan de beurt` : "Wachten tot het spel start…";
  btn.style.background = p ? p.color : "";
  btn.style.color = p ? textOn(p.color) : "";

  if (ui.phase === "roll") {
    btn.textContent = "Dobbelen";
    btn.disabled = false;
  } else if (ui.phase === "rolled") {
    const left = Math.ceil((ui.unlockAt - Date.now()) / 1000);
    if (left > 0) {
      btn.textContent = `Beurt eindigen (${left})`;
      btn.disabled = true;
      countdownTimer = setTimeout(renderAction, 200);
    } else {
      btn.textContent = "Beurt eindigen";
      btn.disabled = false;
    }
  } else {
    btn.textContent = "Wachten…";
    btn.disabled = true;
  }
}

$("btn-action").addEventListener("click", () => {
  if (!conn?.open) return;
  if (ui.phase === "roll") conn.send({ type: "roll" });
  else if (ui.phase === "rolled") conn.send({ type: "endTurn" });
  $("btn-action").disabled = true; // wacht op de nieuwe status van het bord
  navigator.vibrate?.(40);
});

// Scherm niet laten uitgaan tijdens het spel
async function keepScreenAwake() {
  try { await navigator.wakeLock?.request("screen"); } catch { /* niet ondersteund: geen probleem */ }
}

$("btn-join").addEventListener("click", join);
$("code").addEventListener("keydown", (e) => { if (e.key === "Enter") join(); });

// Code uit de QR-link: meteen joinen
const roomFromUrl = new URLSearchParams(location.search).get("room");
if (roomFromUrl) {
  $("code").value = roomFromUrl;
  join();
}
