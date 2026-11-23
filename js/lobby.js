// Lobby aan de bordkant: opent een PeerJS-room en beheert de telefoon-slots.
// De bordpagina is de "host"; telefoons verbinden met peer-id PREFIX + roomcode.
const Lobby = (() => {
  const PREFIX = "hexbord-";
  const SIDES = ["links", "rechts"];
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // zonder I en O (verwarring met 1/0)

  let peer = null;
  let handlers = {};
  let started = false;
  const slots = Object.fromEntries(SIDES.map((s) => [s, null]));

  function randomCode() {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return code;
  }

  function open(h) {
    handlers = h;
    started = false;
    if (typeof Peer === "undefined") {
      handlers.onStatus("PeerJS kon niet laden. Is er internet?");
      return;
    }
    createPeer();
  }

  function createPeer() {
    const code = randomCode();
    peer = new Peer(PREFIX + code);
    peer.on("open", () => handlers.onRoom(code));
    peer.on("connection", onConnection);
    peer.on("disconnected", () => { if (peer && !peer.destroyed) peer.reconnect(); });
    peer.on("error", (err) => {
      if (err.type === "unavailable-id") { peer.destroy(); createPeer(); return; } // code bezet: nieuwe
      handlers.onStatus(`Verbindingsfout: ${err.type}`);
    });
  }

  function onConnection(conn) {
    conn.on("open", () => {
      const side = SIDES.find((s) => !slots[s]);
      if (!side) {
        conn.send({ type: "full" });
        setTimeout(() => conn.close(), 500);
        return;
      }
      conn.side = side;
      slots[side] = conn;
      conn.send({ type: "welcome", side, started });
      handlers.onSlots(getSlots());
    });
    conn.on("data", (msg) => { if (conn.side) handlers.onMessage(conn.side, msg); });
    conn.on("close", () => {
      if (conn.side && slots[conn.side] === conn) {
        slots[conn.side] = null;
        handlers.onSlots(getSlots());
      }
    });
  }

  function getSlots() {
    return Object.fromEntries(SIDES.map((s) => [s, Boolean(slots[s])]));
  }

  function broadcast(msg) {
    for (const conn of Object.values(slots)) if (conn && conn.open) conn.send(msg);
  }

  function markStarted() {
    started = true;
    broadcast({ type: "start" });
  }

  function close() {
    for (const s of SIDES) { slots[s]?.close(); slots[s] = null; }
    peer?.destroy();
    peer = null;
  }

  return { SIDES, open, close, broadcast, markStarted, getSlots };
})();
