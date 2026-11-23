// Geanimeerde zee als achtergrond (WebGL-fragmentshader, eigen code).
// - Golven: lange deining + scherpe kabbeling (gradient noise), belicht met diffuus licht,
//   hemelreflectie en zonneschittering.
// - Rond het eiland (de bordtegels): ondiep turquoise water, lichtnetten (caustics) en
//   schuimgolven die op de kust aanrollen. Dit fadet in met Sea.setShore(1) bij de start.
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

    // Hoogte van het wateroppervlak
    float height(vec2 p, float t) {
      float h = 0.0;
      // lange deining uit twee richtingen
      h += 0.30 * sin(dot(p, vec2(0.86, 0.50)) * 1.3 + t * 0.9);
      h += 0.18 * sin(dot(p, vec2(-0.40, 0.92)) * 2.1 + t * 1.3);
      // kabbeling met scherpe toppen
      vec2 q = p * 1.4 + vec2(t * 0.12, t * 0.07);
      float a = 0.35;
      for (int i = 0; i < 5; i++) {
        h += a * (1.0 - abs(gnoise(q)) * 2.0) * 0.6;
        q = ROT * q + vec2(t * 0.15, -t * 0.10);
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
      float d = 1e5;
      for (int i = 0; i < ${MAX_TILES}; i++) {
        if (i >= uTileCount) break;
        d = min(d, sdHex(bp - uTiles[i], 0.866));
      }
      return d;
    }

    // Lichtnetten op de bodem van ondiep water
    float caustics(vec2 p, float t) {
      vec2 q = p * 2.2;
      float a  = gnoise(q + vec2(t * 0.35, t * 0.20));
      float b  = gnoise(q * 1.25 + vec2(-t * 0.30, t * 0.27) + 7.3);
      float a2 = gnoise(q * 1.9 + vec2(t * 0.50, -t * 0.30) + 3.1);
      float b2 = gnoise(q * 2.3 + vec2(-t * 0.42, -t * 0.36) + 11.7);
      float c = 1.0 - smoothstep(0.0, 0.12, abs(a - b));
      c += 0.6 * (1.0 - smoothstep(0.0, 0.10, abs(a2 - b2)));
      return c;
    }

    void main() {
      vec2 fc = gl_FragCoord.xy;
      vec2 bp = vec2(fc.x - uOrigin.x, -(fc.y - uOrigin.y)) / uScale; // bordcoördinaten
      float t = uTime;

      float d = islandDist(bp);
      float depth = mix(4.0, clamp(d, 0.0, 8.0), uShore);

      // Normaal van het oppervlak via eindige differenties
      float e = 0.03;
      float h0 = height(bp, t);
      float hx = height(bp + vec2(e, 0.0), t);
      float hy = height(bp + vec2(0.0, e), t);
      float strength = mix(0.10, 0.22, smoothstep(0.0, 3.0, depth)); // ondiep water is vlakker
      vec3 n = normalize(vec3(-(hx - h0) / e * strength, -(hy - h0) / e * strength, 1.0));

      // Waterkleur naar diepte
      vec3 deep    = vec3(0.010, 0.080, 0.19);
      vec3 mid     = vec3(0.015, 0.250, 0.40);
      vec3 shallow = vec3(0.090, 0.600, 0.60);
      vec3 col = mix(shallow, mid, smoothstep(0.0, 2.4, depth));
      col = mix(col, deep, smoothstep(2.4, 7.5, depth));

      // Grote, langzaam schuivende vlekken (windvelden) voor variatie op afstand
      float patches = gnoise(bp * 0.22 + vec2(t * 0.015, t * 0.01)) + 0.5 * gnoise(bp * 0.5 - t * 0.02);
      col *= 0.9 + 0.35 * patches;

      // Licht
      vec2 uv = fc / uRes;
      vec3 L = normalize(vec3(-0.45, -0.55, 0.70));
      vec3 V = vec3(0.0, 0.0, 1.0);
      float diff = clamp(dot(n, L), 0.0, 1.0);
      col *= 0.7 + 0.45 * diff;
      float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
      col += vec3(0.45, 0.62, 0.75) * fres * 1.2;                 // hemelreflectie op hellingen

      // Zonneschittering: geconcentreerd in een "zonnepad" linksboven, zoals op luchtfoto's
      vec3 H = normalize(L + V);
      float glitterZone = exp(-pow(length((uv - vec2(0.18, 0.82)) * vec2(1.0, 1.4)) / 0.45, 2.0));
      float spec = pow(clamp(dot(n, H), 0.0, 1.0), 90.0);
      col += vec3(1.0, 0.95, 0.85) * spec * (0.15 + 1.3 * glitterZone);
      col += vec3(0.10, 0.12, 0.12) * glitterZone;                // zacht zonlicht op het water

      // Caustics in ondiep water
      float shallowMask = (1.0 - smoothstep(0.0, 2.2, depth)) * uShore;
      col += vec3(0.55, 0.95, 0.90) * caustics(bp + n.xy * 0.4, t) * shallowMask * 0.4;

      // Schuim: branding langs de kust + gebroken golven die aanrollen
      float fn  = gnoise(bp * 5.0  + vec2(t * 0.3, -t * 0.2)) * 0.5 + 0.5;
      float fn2 = gnoise(bp * 12.0 - vec2(t * 0.5,  t * 0.4)) * 0.5 + 0.5;
      float surf = 1.0 - smoothstep(0.0, 0.12 + 0.14 * fn, d);              // witte branding
      float band = 0.5 + 0.5 * sin(d * 14.0 + t * 2.0 + fn * 4.0);
      float bandMask = 1.0 - smoothstep(0.05, 0.6, d);
      float rollers = smoothstep(0.75, 1.0, band) * bandMask * smoothstep(0.4, 0.7, fn2);
      float foam = clamp(surf * (0.6 + 0.4 * fn2) + rollers * 0.8, 0.0, 1.0) * step(-0.03, d) * uShore;
      // een paar grotere schuimkoppen op open zee
      float cap = smoothstep(0.8, 1.0, h0) * smoothstep(0.55, 0.85, fn) * smoothstep(1.5, 3.5, depth) * 0.35;
      foam = max(foam, cap);
      col = mix(col, vec3(0.90, 0.96, 1.0), foam * 0.9);

      // Vignet
      col *=1.0 - 0.35 * pow(length(uv - 0.5) * 1.3, 2.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  let canvas, gl, loc = {};
  let shore = 0, shoreTarget = 0;
  let origin = [0, 0], scale = 1;
  let boardSvg = null, boardModel = null;
  const tileData = new Float32Array(MAX_TILES * 2);
  let tileCount = 0;
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

      for (const name of ["uTime", "uRes", "uOrigin", "uScale", "uShore", "uTiles", "uTileCount"]) {
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
    canvas.width = Math.max(1, Math.round(innerWidth * RENDER_SCALE));
    canvas.height = Math.max(1, Math.round(innerHeight * RENDER_SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
    updateBoard();
  }

  // Koppel de zee aan het bord, zodat de kust precies langs de tegels loopt
  function setBoard(svg, model) {
    boardSvg = svg;
    boardModel = model;
    tileCount = Math.min(model.tiles.length, MAX_TILES);
    model.tiles.slice(0, tileCount).forEach((t, i) => {
      tileData[i * 2] = t.center.x / model.size;
      tileData[i * 2 + 1] = t.center.y / model.size;
    });
    updateBoard();
  }

  function updateBoard() {
    if (!boardSvg) return;
    const m = boardSvg.getScreenCTM();
    if (!m) return;
    origin = [m.e * RENDER_SCALE, (innerHeight - m.f) * RENDER_SCALE];
    scale = m.a * boardModel.size * RENDER_SCALE;
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    requestAnimationFrame(frame);
  }

  return { init, setBoard, setShore, resize: updateBoard };
})();
