// Telefoonkant: verbindt met de bordpagina en stuurt dobbelverzoeken.
const PREFIX = "hexbord-";
const $ = (id) => document.getElementById(id);

let peer = null;
let conn = null;
let mySide = null;

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
      mySide = msg.side;
      $("side").textContent = msg.side;
      $("step-join").hidden = true;
      $("step-joined").hidden = false;
      if (msg.started) enableRoll();
      break;
    case "full":
      setStatus("Deze room is al vol.");
      showJoin();
      break;
    case "start":
      enableRoll();
      break;
    case "rolled":
      $("last-roll").textContent = `${msg.name ?? "Worp"}: ${msg.d1} + ${msg.d2} = ${msg.d1 + msg.d2}`;
      break;
  }
}

function enableRoll() {
  $("wait-msg").textContent = "Het spel is begonnen!";
  $("btn-roll").disabled = false;
}

$("btn-roll").addEventListener("click", () => {
  if (!conn?.open) return;
  conn.send({ type: "roll" });
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
