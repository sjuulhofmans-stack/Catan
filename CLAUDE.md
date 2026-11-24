# Projectinstructies: De kolonisten van Gennep (AR-bordspel met beamer)

## Concept
Een webapp die een speelbord van zeshoeken via een **beamer op een tafel projecteert**. We spelen fysiek met vrienden en leiden het spel zelf: de app dwingt geen regels af, maar ondersteunt en visualiseert. Het thema is eigen (grondstoffen, handelen, bouwen op een hexbord) met een eigen naam, stijl en tegels. Geen kopie van een bestaand spel: geen bestaande namen, art of kaarten overnemen.

## Platform
- Pure **HTML/CSS/JavaScript**, zonder build-stap, gehost als **openbare GitHub Pages-site**.
- Scripts als gewone `<script>`-tags (geen ES-modules), zodat `index.html` ook lokaal via dubbelklik werkt.
- Twee soorten pagina's:
  - `index.html`: het bord (laptop aan beamer, fullscreen).
  - `controller.html`: de telefoon (joinen via QR-code/roomcode).
- Verbinding bord en telefoons: **WebRTC via PeerJS** (geen eigen server nodig). Firebase als alternatief als dat hapert.

## Einddoel (later)
1. Animaties voor wie er aan de beurt is.
2. Virtuele dobbelstenen die over het geprojecteerde bord rollen.
3. Twee telefoons (links en rechts van de tafel) als dobbelknop.
4. Lobby: knop, bord toont roomcode + QR, telefoons joinen.
5. Eigen tegelafbeeldingen voor de hexagons.
6. Mapgenerator die een gebalanceerd bord legt.
7. Veel sfeer en animaties ("het bord moet leven").
8. Camera-detectie van post-its (dorpen/steden) op hoekpunten van het grid, met kalibratie camera ↔ projectie (homografie).

## Fasen
- **Fase 1 (klaar zodra afgevinkt):** fullscreen-knop, hexgrid 3-4-5-4-3 (19 tegels), bord schaalt altijd volledig in beeld, 4 spelersvakken in de hoeken, hexcoördinaten (axiaal/cube) met geadresseerde hoekpunten en randen.
- Volgende fasen bepaalt de gebruiker stap voor stap.

## Werkwijze
- Kleine stappen (vibecoden); na elke stap test de gebruiker en geeft feedback.
- Stijl volgt later; nu functioneel en netjes.
- De gebruiker heeft redelijk wat ervaring: geen basisuitleg, wel kort wat er waarom gebouwd is.
- Communiceer in het **Nederlands**.
- **Cache-busting:** lokale CSS/JS worden geladen met `?v=N` in `index.html` en `controller.html`. Bij elke push die CSS/JS wijzigt: N overal ophogen (GitHub Pages cachet 10 min).
- Achtergrond is een geanimeerde zee (`js/sea.js`); `body` blijft zwart als terugval.
- **Knoppen zijn nooit doorzichtig**, ook niet uitgeschakeld (massief grijs i.p.v. `opacity`). Zie het blok onderaan `css/style.css` en `css/controller.css`.

## Structuur
- `index.html`: bordpagina
- `css/style.css`: layout en stijl
- `js/hex.js`: hexwiskunde (axiaal, pointy-top)
- `js/board.js`: bordmodel (tegels, hoekpunten, randen) + SVG-rendering
- `js/sea.js`: zee-achtergrond. Gebruikerswens: **zeer kalme zee**, het eiland is enorm en van grote hoogte gezien; golven rollen langzaam (≈9 s periode) op de kust aan. Geen snelle bewegingen, geen caustics/flikkering. (WebGL-shader op halve resolutie, valt terug op 0.33 bij < 40 fps). Kust volgt de tegels via `Sea.setBoard(svg, model)`; `Sea.setShore(true/false)` fadet lagune + branding in/uit. Gemeten ~7,6 ms/frame op Intel Iris Xe.
- `js/lobby.js`: PeerJS-host op het bord; slots `links`/`rechts` (peer-id `hexbord-<CODE>`)
- `js/settings.js`: instellingen (2–4 spelers, hoeken `tl/tr/bl/br`, namen, kleuren wit/blauw/rood/oranje uniek, timer per beurt, 10–30 punten). Bij 2 spelers altijd diagonaal (tl+br of tr+bl). Bewaard in localStorage; `Settings.getConfig()` levert de spelconfig.
- `js/main.js`: schermen (menu → instellingen → lobby → spel), fade-in, fullscreen, debugtoggle
- `controller.html` + `js/controller.js` + `css/controller.css`: telefoonpagina
- Berichten: telefoon→bord `roll`/`endTurn`; bord→telefoon `welcome`/`full`/`state` (`phase` roll|rolled, `player`, `lockMs`). Het bord is de baas over worp en fase.
- Beurt: fase `roll` (knop "Dobbelen") → worp, timer start, 5 s slot → fase `rolled` (knop "Beurt eindigen") → volgende speler met de klok mee (tl→tr→br→bl). Spatie op het bord = de telefoonknop. Animatie "volgende speler" komt later (`endTurn()` in main.js).
