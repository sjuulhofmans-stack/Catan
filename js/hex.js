// Hexwiskunde: axiale coördinaten (q, r), pointy-top, s = -q - r.
// Referentie: https://www.redblobgames.com/grids/hexagons/
const Hex = (() => {
  const SQRT3 = Math.sqrt(3);

  // Alle hexen binnen een straal rond (0,0). Straal 2 geeft rijen 3-4-5-4-3.
  function generateHexagon(radius) {
    const hexes = [];
    for (let r = -radius; r <= radius; r++) {
      for (let q = -radius; q <= radius; q++) {
        const s = -q - r;
        if (Math.abs(s) <= radius) hexes.push({ q, r, s });
      }
    }
    return hexes;
  }

  function toPixel({ q, r }, size) {
    return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
  }

  // Hoek i: 0 = rechtsboven, met de klok mee (SVG-y wijst omlaag).
  function corners(center, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      pts.push({ x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) });
    }
    return pts;
  }

  function distance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
  }

  const key = (h) => `${h.q},${h.r}`;

  return { SQRT3, generateHexagon, toPixel, corners, distance, key };
})();
