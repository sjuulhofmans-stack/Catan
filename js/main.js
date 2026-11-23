// Opstart van de bordpagina.
const PLAYERS = [
  { name: "Speler 1", color: "#e63946" },
  { name: "Speler 2", color: "#457bff" },
  { name: "Speler 3", color: "#f4a261" },
  { name: "Speler 4", color: "#2a9d8f" },
];

const model = Board.createModel({ radius: 2, size: 1 });
Board.render(document.getElementById("board"), model);
window.board = model; // handig om in de console te bekijken

// Spelersvakken vullen
document.querySelectorAll(".player-panel").forEach((panel) => {
  const player = PLAYERS[Number(panel.dataset.player)];
  panel.style.setProperty("--player-color", player.color);
  panel.innerHTML = `
    <div class="player-name">${player.name}</div>
    <div class="player-body">grondstoffen / punten</div>
  `;
});

// Fullscreen
const fsButton = document.getElementById("btn-fullscreen");
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch((err) => console.warn("Fullscreen geweigerd:", err));
}
fsButton.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  const on = Boolean(document.fullscreenElement);
  document.body.classList.toggle("is-fullscreen", on);
  fsButton.textContent = on ? "Venster" : "Fullscreen";
});

// Debuglaag (coördinaten + hoekpunten)
function toggleDebug() {
  document.body.classList.toggle("show-debug");
}
document.getElementById("btn-debug").addEventListener("click", toggleDebug);

// Sneltoetsen: F = fullscreen, D = debug
document.addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") toggleFullscreen();
  if (e.key === "d" || e.key === "D") toggleDebug();
});

// Knoppen tonen bij muisbeweging in fullscreen
let mouseTimer;
document.addEventListener("mousemove", () => {
  document.body.classList.add("mouse-active");
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(() => document.body.classList.remove("mouse-active"), 2000);
});

console.log(`Bord: ${model.tiles.length} tegels, ${model.vertices.length} hoekpunten, ${model.edges.length} randen`);
