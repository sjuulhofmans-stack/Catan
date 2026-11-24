// Geanimeerde zee als achtergrond (WebGL-fragmentshader, eigen code).
// Uitgangspunt: een enorm eiland, gezien van grote hoogte, op een zeer kalme zee.
// - Oppervlak: trage deining + fijne, gladde structuur, belicht met diffuus licht,
//   hemelreflectie en een zacht zonnepad.
// - Rond het eiland (de bordtegels): ondiep turquoise water met zandbanken en golflijnen die
//   langzaam (periode ~9 s) op de kust aanrollen. Dit fadet in met Sea.setShore(1) bij de start.
// Wordt op halve resolutie gerenderd en door de browser opgeschaald: zee is zacht, dus dat
// scheelt veel rekenwerk zonder zichtbaar verschil.
const Sea = (() => {
  const RENDER_SCALE = 0.5;
  const MAX_TILES = 64;

  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;

    uniform float uTime;
    uniform vec2  uRes;
    uniform vec2  uOrigin;   // bordpunt (0,0) in canvaspixels
    uniform float uScale;    // canvaspixels per bordeenheid (1 eenheid = straal van een tegel)
    uniform float uShore;    // 0 = open zee, 1 = eiland + kust zichtbaar
    uniform vec2  uTiles[${MAX_TILES}];
    uniform int   uTileCount;
    uniform float uBoundR;   // straal van een cirkel die het hele eiland omvat

    // Hash zonder sin() (stabiel op alle GPU's)
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 grad(vec2 i) {
      float a = hash12(i) * 6.2831853;
      return vec2(cos(a), sin(a));
    }

    // Gradient noise, bereik ongeveer [-0.7, 0.7]
    float gnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      float a = dot(grad(i),                 f);
      float b = dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
      float c = dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
      float d = dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);

    // Hoogte van het wateroppervlak.
    // Het eiland is enorm en we kijken van grote hoogte: de zee is dus fijn van textuur en
    // beweegt heel traag. Gladde noise (geen scherpe toppen) houdt het rustig.
    float height(vec2 p, float t) {
      float h = 0.0;
      // zeer trage, lange deining
      h += 0.20 * sin(dot(p, vec2(0.86, 0.50)) * 2.0 + t * 0.25);
      h += 0.12 * sin(dot(p, vec2(-0.40, 0.92)) * 2.8 + t * 0.32);
      // fijne oppervlaktestructuur die nauwelijks verschuift
      vec2 q = p * 3.0 + vec2(t * 0.020, t * 0.012);
      float a = 0.3;
      for (int i = 0; i < 4; i++) {
        h += a * gnoise(q);
        q = ROT * q + vec2(t * 0.025, -t * 0.015);
        a *= 0.5;
      }
      return h;
    }

    // Afstand tot een pointy-top zeshoek met binnenstraal r
    float sdHex(vec2 p, float r) {
      p = abs(p.yx);
      const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
      p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
      p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
      return length(p) * sign(p.y);
    }

    // Afstand tot de kust van het eiland (negatief = op het eiland)
    float islandDist(vec2 bp) {
      // Ver van het eiland is de exacte afstand niet nodig (daar is het toch diep): scheelt veel rekenwerk
      float r = length(bp);
      if (r > uBoundR + 3.0) return r - uBoundR;
      float d = 1e5;
      for (int i = 0; i < ${MAX_TILES}; i++) {
        if (i >= uTileCount) break;
        d = min(d, sdHex(bp - uTiles[i], 0.866));
      }
      return d;
    }

    // Zandbanken en bodemstructuur onder ondiep water (staat stil)
    float seabed(vec2 p) {
      return gnoise(p * 1.2) + 0.5 * gnoise(p * 2.7 + 5.0) + 0.25 * gnoise(p * 6.0 + 9.0);
    }

    void main() {
      vec2 fc = gl_FragCoord.xy;
      vec2 bp = vec2(fc.x - uOrigin.x, -(fc.y - uOrigin.y)) / uScale; // bordcoördinaten
      float t = uTime;

      float d = islandDist(bp);
      float depth = mix(4.0, clamp(d, 0.0, 8.0), uShore);

      // Normaal van het oppervlak via eindige differenties (laag = kalm water)
      float e = 0.03;
      float h0 = height(bp, t);
      float hx = height(bp + vec2(e, 0.0), t);
      float hy = height(bp + vec2(0.0, e), t);
      float strength = mix(0.04, 0.09, smoothstep(0.0, 2.0, depth));
      vec3 n = normalize(vec3(-(hx - h0) / e * strength, -(hy - h0) / e * strength, 1.0));

      // Waterkleur naar diepte
      vec3 deep    = vec3(0.010, 0.080, 0.19);
      vec3 mid     = vec3(0.015, 0.250, 0.40);
      vec3 shallow = vec3(0.090, 0.600, 0.60);
      vec3 col = mix(shallow, mid, smoothstep(0.0, 1.8, depth));
      col = mix(col, deep, smoothstep(1.8, 7.0, depth));

      // Ondiep water: zandbanken schemeren door, vlak bij de kust bijna zandkleurig
      float shallowMask = (1.0 - smoothstep(0.0, 1.8, depth)) * uShore;
      col += vec3(0.10, 0.16, 0.12) * seabed(bp) * shallowMask;
      col = mix(col, vec3(0.50, 0.78, 0.70), (1.0 - smoothstep(0.0, 0.2, depth)) * 0.35 * uShore);

      // Grote vlekken (windvelden) die heel langzaam verschuiven
      float patches = gnoise(bp * 0.22 + vec2(t * 0.004, t * 0.003)) + 0.5 * gnoise(bp * 0.5 - t * 0.005);
      col *= 0.92 + 0.3 * patches;

      // Licht
      vec2 uv = fc / uRes;
      vec3 L = normalize(vec3(-0.45, -0.55, 0.70));
      vec3 V = vec3(0.0, 0.0, 1.0);
      float diff = clamp(dot(n, L), 0.0, 1.0);
      col *= 0.75 + 0.35 * diff;
      float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
      col += vec3(0.45, 0.62, 0.75) * fres;

      // Zonneschittering in een zonnepad linksboven: zacht, zonder flikkering
      vec3 H = normalize(L + V);
      float glitterZone = exp(-pow(length((uv - vec2(0.18, 0.82)) * vec2(1.0, 1.4)) / 0.45, 2.0));
      float spec = pow(clamp(dot(n, H), 0.0, 1.0), 60.0);
      col += vec3(1.0, 0.95, 0.85) * spec * (0.08 + 0.8 * glitterZone);
      col += vec3(0.10, 0.12, 0.12) * glitterZone;

      // Golven die langzaam op de kust aanrollen (periode ~9 s, ruim een tegel per 40 s)
      float w = 6.2831853 / 9.0;
      float k = 6.2831853 / 0.22;                                   // afstand tussen de golflijnen
      float bend = gnoise(bp * 1.3) * 1.2 + gnoise(bp * 3.1 + 2.0) * 0.4; // golflijnen niet perfect evenwijdig
      float wave = 0.5 + 0.5 * sin(d * k + t * w + bend * 3.0);
      float crest = smoothstep(0.82, 1.0, wave);
      float waveZone = smoothstep(0.65, 0.15, d) * smoothstep(0.0, 0.05, d);
      float breakup = smoothstep(0.25, 0.65, gnoise(bp * 4.0 + vec2(t * 0.01, 0.0)) * 0.5 + 0.5);
      float rollers = crest * waveZone * mix(0.35, 1.0, breakup);

      // Branding: zachte schuimrand die in hetzelfde ritme op en neer spoelt
      float swash = 0.5 + 0.5 * sin(t * w + bend * 3.0);
      float surfW = 0.035 + 0.035 * swash + 0.02 * (gnoise(bp * 6.0) * 0.5 + 0.5);
      float surf = 1.0 - smoothstep(0.0, surfW, d);

      float foam = clamp(surf * 0.85 + rollers * 0.55, 0.0, 1.0) * step(-0.03, d) * uShore;
      col = mix(col, vec3(0.90, 0.96, 1.0), foam);

      // Vignet
      col *= 1.0 - 0.35 * pow(length(uv - 0.5) * 1.3, 2.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  let canvas, gl, loc = {};
  let shore = 0, shoreTarget = 0;
  let origin = [0, 0], scale = 1;
  let boardSvg = null, boardModel = null;
  const tileData = new Float32Array(MAX_TILES * 2);
  let tileCount = 0;
  let boundR = 0;
  let renderScale = RENDER_SCALE;
  let perfFrames = 0, perfStart = 0, perfChecked = false;
  const startTime = performance.now();
  let lastFrame = startTime;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function init(el) {
    canvas = el;
    gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) { canvas.classList.add("no-webgl"); return; }
    try {
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // één driehoek over het scherm
      const aPos = gl.getAttribLocation(program, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      for (const name of ["uTime", "uRes", "uOrigin", "uScale", "uShore", "uTiles", "uTileCount", "uBoundR"]) {
        loc[name] = gl.getUniformLocation(program, name);
      }
    } catch (err) {
      console.warn("Zee-shader werkt niet op dit apparaat:", err);
      gl = null;
      canvas.classList.add("no-webgl");
      return;
    }

    window.addEventListener("resize", resize);
    resize();
    requestAnimationFrame(frame);
  }

  function resize() {
    if (!gl) return;
    canvas.width = Math.max(1, Math.round(innerWidth * renderScale));
    canvas.height = Math.max(1, Math.round(innerHeight * renderScale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    updateBoard();
  }

  // Koppel de zee aan het bord, zodat de kust precies langs de tegels loopt
  function setBoard(svg, model) {
    boardSvg = svg;
    boardModel = model;
    tileCount = Math.min(model.tiles.length, MAX_TILES);
    boundR = 0;
    model.tiles.slice(0, tileCount).forEach((t, i) => {
      const x = t.center.x / model.size;
      const y = t.center.y / model.size;
      tileData[i * 2] = x;
      tileData[i * 2 + 1] = y;
      boundR = Math.max(boundR, Math.hypot(x, y) + 1);
    });
    updateBoard();
  }

  function updateBoard() {
    if (!boardSvg) return;
    const m = boardSvg.getScreenCTM();
    if (!m) return;
    origin = [m.e * renderScale, (innerHeight - m.f) * renderScale];
    scale = m.a * boardModel.size * renderScale;
  }

  function setShore(on) { shoreTarget = on ? 1 : 0; }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    shore += (shoreTarget - shore) * Math.min(1, dt * 0.9); // zacht in- en uitfaden

    gl.uniform1f(loc.uTime, (now - startTime) / 1000);
    gl.uniform2f(loc.uRes, canvas.width, canvas.height);
    gl.uniform2f(loc.uOrigin, origin[0], origin[1]);
    gl.uniform1f(loc.uScale, scale);
    gl.uniform1f(loc.uShore, shore);
    gl.uniform2fv(loc.uTiles, tileData);
    gl.uniform1i(loc.uTileCount, tileCount);
    gl.uniform1f(loc.uBoundR, boundR);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    checkPerformance(now);
    requestAnimationFrame(frame);
  }

  // Eén keer na het opstarten: is de laptop te traag, render dan op lagere resolutie.
  // Alleen meten als de pagina zichtbaar is (verborgen tabbladen worden door de browser vertraagd).
  function checkPerformance(now) {
    if (perfChecked || document.visibilityState !== "visible") { perfStart = 0; return; }
    if (!perfStart) { perfStart = now; perfFrames = 0; return; }
    perfFrames++;
    const elapsed = now - perfStart;
    if (elapsed < 3000) return;
    const fps = (perfFrames * 1000) / elapsed;
    perfChecked = true;
    if (fps < 40 && fps > 5) { // < 5 fps: venster staat waarschijnlijk op de achtergrond; niet op reageren
      renderScale = 0.33;
      resize();
      console.info(`Zee: ${fps.toFixed(0)} fps, resolutie verlaagd`);
    }
  }

  return { init, setBoard, setShore, resize: updateBoard };
})();
