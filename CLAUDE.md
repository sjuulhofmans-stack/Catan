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
- **Fase 1 (klaar):** fullscreen-knop, hexgrid 3-4-5-4-3 (19 tegels), bord schaalt altijd volledig in beeld, 4 spelersvakken in de hoeken, hexcoördinaten (axiaal/cube) met geadresseerde hoekpunten en randen.
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
- `js/hex.js`: hexwiskunde (axiaal, **flat-top**, want de tegelafbeeldingen zijn flat-top; bord = kolommen 3-4-5-4-3)
- `js/board.js`: bordmodel (tegels, hoekpunten, randen) + SVG-rendering. Tegels als `<image>` uit `assets/tiles/land/<type>_<1-6>.webp`. `assignRandomTerrain()` is tijdelijk (mix hout4 wol4 graan4 steen3 erts3 woestijn1); mapgenerator volgt.
- `assets/tiles/land/`: 9 types × 6 varianten (hout, wol, graan, steen, erts, goud, woestijn, meer, vulkaan), 512 px WebP, bijgesneden op de zeshoek. Bron: `Hex tegels/NIeuwe tegels.zip` van de gebruiker (eigen ontwerp; zip staat in .gitignore, 817 MB). In de zip zitten ook zee-, haven- en visgrondtegels (nog niet gebruikt) en per tegel losse lagen (ondergrond/elementen).
- `Hex tegels/Tegels internet/`: plaatjes van internet (originele art van een bestaand spel). **Niet gebruiken of publiceren** (staat in .gitignore).
- `js/sea.js`: zee-achtergrond. Gebruikerswens: **zeer kalme zee**, het eiland is enorm en van grote hoogte gezien; golven rollen rustig (≈5 s periode) op de kust aan; open zee beweegt rustig maar zichtbaar (gebruiker vond ≈9 s te traag). Geen snelle bewegingen, geen caustics/flikkering. (WebGL-shader op halve resolutie, valt terug op 0.33 bij < 40 fps). Kust volgt de tegels via `Sea.setBoard(svg, model)`; `Sea.setShore(true/false)` fadet lagune + branding in/uit. Gemeten ~7,6 ms/frame op Intel Iris Xe.
- Zee iets levendiger gemaakt op verzoek (snellere deining, windvlagen die als rimpelvelden over het water trekken).
- Havens: `model.harbors` (9 stuks, gelijkmatig over de kustranden verdeeld in `board.js`, met midden + normaal naar zee), getekend als houten steiger (`#layer-harbors`). Types per haven volgen later (mapgenerator).
- `js/boats.js`: canvas `#boats` tussen zee en bord. Max 5 bootjes (vracht/zeil/visser) komen van links/rechts, varen via een cirkel om het eiland naar een vrije haven, leggen naast de steiger aan, laden/lossen 5–10 s, varen achteruit weg; soms door naar een andere haven, anders terug naar de zijkant. Kielzog per boot. `Boats.start()`/`stop()` vanuit main.js.
- `js/dice-roller.js`: 3D-dobbelanimatie (three.js + cannon-es via esm.sh, **ES-module**, de enige uitzondering; werkt alleen online). Kopie van de door de gebruiker aangeleverde `Dobbelstenen/code/dice.js` (origineel niet aanpassen) met `roll(force, {from, landR})`: gooien vanuit de hoek van de speler, landen binnen het bord. Aangestuurd door `throwDice()` in main.js; het bord bepaalt de uitslag, de stenen landen daarop. Zonder three.js: alleen tekstuitslag.
- Nummerfiches: `Board.assignNumbers()` (2–12 zonder 7, geen 6/8 naast elkaar; woestijn/meer/vulkaan geen fiche), getekend in een aparte `<svg id="tokens">` boven de lichtlaag.
- `js/glow.js`: lichtlaag na een worp (`<canvas id="glow">`, `mix-blend-mode: screen`, tussen tegels en fiches). Volgorde in main.js (`afterRoll`): 3D-stenen landen → 0,7 s liggen → wegvagen (`.dice-layer.vanish`) → `Glow.play(som)`: dans ≈2,3 s over het hele bord in de stijl van de gegooide tegel → finale op alle tegels met dat getal (eigen kleur, ringen, fiche springt op, rest dimt via `.tile.dimmed`). Dansen per type: wol = kudde-golf (groen/wit), hout = vuurvliegspoor (groen/amber), graan = zonnespiraal (goud), erts = bliksemader (violet/ijsblauw), steen = golf in oranje. 7 = bord dimt kort. Ontwerp-artifact: https://claude.ai/artifact/Jq22dEZhi8BrnUZBu2cGzA
- `Dobbelstenen/`: assets van de gebruiker (GLB-modellen, textures, originele dice.js).
- `js/lobby.js`: PeerJS-host op het bord; slots `links`/`rechts` (peer-id `hexbord-<CODE>`)
- `js/settings.js`: instellingen (2–4 spelers, hoeken `tl/tr/bl/br`, namen, kleuren wit/blauw/rood/oranje uniek, timer per beurt, 10–30 punten). Bij 2 spelers altijd diagonaal (tl+br of tr+bl). Bewaard in localStorage; `Settings.getConfig()` levert de spelconfig.
- `js/main.js`: schermen (menu → instellingen → lobby → spel), fade-in, fullscreen, debugtoggle
- `editor.html` + `js/editor.js` + `css/editor.css`: kaarteditor (losse pagina, knop "Kaarteditor" in het menu; later inbouwen). Leeg hexraster in bordvormen als kolomlengtes (Basis 3-4-5-4-3, Uitbreiding 3-4-5-6-5-4-3 standaard, Groot 4-5-6-7-6-5-4, Zeevaarders 5-6-7-8-7-6-5). Tegel kiezen in het palet → klik/sleep op leeg vak legt, klik op tegel haalt weg, scroll = variant. Kaart in localStorage `hexbord-editor-map` (`{version, shape, columns, tiles:[{q,r,terrain,variant}]}`), export/import als JSON. Zee volgt alleen gelegde tegels via `Sea.setBoard(svg, model, {exactRange: 8})` (8 voorkomt een cirkelnaad bij een los eiland; het spel gebruikt de snelle standaard 3). Max. 64 landtegels (shaderlimiet). Zee-palet: `zee` (open zee, geen afbeelding), `kust` (variant 1-6 = één kustzijde, 7-12 = twee), `haven_<algemeen|hout|wol|graan|steen|erts>` (6 standen). Stand i = kust/steiger richting `DIRS[i-1]` (1 boven, met de klok mee); kust2-stand j = richtingen j-2 en j-1. Kust/havens draaien automatisch naar aangrenzend land (`auto`), scrollen zet `auto: false`. Alleen landtegels tellen mee voor de shaderkust.
- `assets/tiles/zee/`: `kust1_<1-6>`, `kust2_<1-6>`, `haven_<type>_<1-6>` (512 px WebP, zelfde uitsnede 24,157–2024,1891 als land). Visgronden uit de zip zijn overlays (geen hele tegel) en nog niet gebruikt.
- `controller.html` + `js/controller.js` + `css/controller.css`: telefoonpagina
- Berichten: telefoon→bord `roll`/`endTurn`; bord→telefoon `welcome`/`full`/`state` (`phase` roll|rolled, `player`, `lockMs`). Het bord is de baas over worp en fase.
- Beurt: fase `roll` (knop "Dobbelen") → worp, timer start, 5 s slot → fase `rolled` (knop "Beurt eindigen") → volgende speler met de klok mee (tl→tr→br→bl). Spatie op het bord = de telefoonknop. Animatie "volgende speler" komt later (`endTurn()` in main.js).
