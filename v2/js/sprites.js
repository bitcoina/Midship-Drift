'use strict';
// Procedural pixel art for Midship Drift. Every sprite and backdrop is drawn from
// code when the game loads, so there are no image files and no borrowed artwork.
const Art = (() => {
  // 3x5 pixel font: each glyph is five rows of three bits (left pixel = 4).
  const FONT3 = {
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
    E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
    I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
    M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
    Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
    U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
    Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
    0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
    4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 6, 5, 2], 7: [7, 1, 2, 2, 2],
    8: [2, 5, 2, 5, 2], 9: [2, 5, 3, 1, 6],
    '!': [2, 2, 2, 0, 2], "'": [2, 2, 0, 0, 0], '-': [0, 0, 7, 0, 0], '.': [0, 0, 0, 0, 2],
    ' ': [0, 0, 0, 0, 0],
  };

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
  }

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, gr = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; gr *= 1 + f; b *= 1 + f; }
    else { r += (255 - r) * f; gr += (255 - gr) * f; b += (255 - b) * f; }
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(gr) << 8) | Math.round(b)).toString(16).slice(1);
  }

  function rect(g, x, y, w, h, col) {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  }

  // Scanline polygon fill: keeps edges hard so sprites stay crisp pixel art.
  function poly(g, pts, col) {
    g.fillStyle = col;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) { minY = Math.min(minY, pts[i]); maxY = Math.max(maxY, pts[i]); }
    const n = pts.length;
    for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
      const cy = y + 0.5, xs = [];
      for (let i = 0; i < n; i += 2) {
        const x1 = pts[i], y1 = pts[i + 1], j = (i + 2) % n, x2 = pts[j], y2 = pts[j + 1];
        if ((y1 <= cy && y2 > cy) || (y2 <= cy && y1 > cy)) xs.push(x1 + (cy - y1) * (x2 - x1) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.round(xs[k]), b = Math.round(xs[k + 1]);
        if (b > a) g.fillRect(a, y, b - a, 1);
      }
    }
  }

  function disc(g, cx, cy, r, col) {
    g.fillStyle = col;
    for (let y = -r; y < r; y++) {
      const half = Math.round(Math.sqrt(r * r - (y + 0.5) * (y + 0.5)));
      g.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1);
    }
  }

  function text3(g, str, x, y, col, s = 1) {
    g.fillStyle = col;
    for (let i = 0; i < str.length; i++) {
      const glyph = FONT3[str[i].toUpperCase()] || FONT3[' '];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 3; c++) {
          if ((glyph[r] >> (2 - c)) & 1) g.fillRect(x + (i * 4 + c) * s, y + r * s, s, s);
        }
      }
    }
  }
  const text3Width = (str, s = 1) => (str.length * 4 - 1) * s;

  // ---------------------------------------------------------------- cars
  // Cars are seen from behind on a 72x44 canvas. `t` is the turn pose from -2
  // (hard left) to 2 (hard right): the cabin slides toward the turn and the
  // flank on the outside of the turn comes into view.
  const CAR_W = 72, CAR_H = 44;
  const GLASS = '#17212c', GLASS_HI = '#4d6f8f';

  function tyres(g, y = 30, h = 11, xs = [9, 52], w = 11) {
    for (const x of xs) {
      rect(g, x, y, w, h, '#121214');
      for (let yy = y + 1; yy < y + h; yy += 2) rect(g, x + 1, yy, w - 2, 1, '#27272c');
    }
  }

  function flank(g, t, top, bottom, col) {
    if (!t) return;
    const w = Math.abs(t) * 2 + 1;
    if (t < 0) poly(g, [66, top, 66 + w, top + 2, 66 + w, bottom - 1, 66, bottom], col);
    else poly(g, [6, top, 6 - w, top + 2, 6 - w, bottom - 1, 6, bottom], col);
  }

  function plate(g, x, y, label) {
    rect(g, x, y, 15, 7, '#ecebe2');
    rect(g, x, y, 15, 1, '#b9b8ae');
    text3(g, label, x + 2, y + 1, '#1c2a6b');
  }

  const MODELS = {
    // First-generation MR2 (AW11): crisp wedge, upright rear glass, full-width lamp band.
    aw11(g, c, t, label = 'LEO') {
      const o = t * 2, d = shade(c, -0.3), l = shade(c, 0.35);
      tyres(g);
      flank(g, t, 12, 34, d);
      rect(g, 6, 29, 60, 7, '#1d1d22'); rect(g, 6, 29, 60, 1, '#34343c');
      poly(g, [17 + o, 11, 55 + o, 11, 49 + o, 2, 23 + o, 2], c);
      rect(g, 23 + o, 2, 26, 1, l);
      poly(g, [21 + o, 11, 51 + o, 11, 46 + o, 4, 26 + o, 4], GLASS);
      rect(g, 27 + o, 5, 7, 1, GLASS_HI);
      rect(g, 6, 13, 60, 16, c); rect(g, 6, 13, 60, 1, l); rect(g, 6, 28, 60, 1, d);
      rect(g, 7, 10, 58, 3, d); rect(g, 7, 10, 58, 1, l);
      rect(g, 7, 16, 58, 6, '#121214');
      rect(g, 8, 17, 15, 4, '#c8161b'); rect(g, 49, 17, 15, 4, '#c8161b');
      rect(g, 8, 17, 15, 1, '#ff5a4e'); rect(g, 49, 17, 15, 1, '#ff5a4e');
      rect(g, 19, 17, 4, 4, '#f29a1e'); rect(g, 49, 17, 4, 4, '#f29a1e');
      rect(g, 25, 18, 22, 2, '#2b2b31');
      plate(g, 29, 22, label);
      rect(g, 55, 34, 4, 2, '#9a9aa2');
    },
    // Second-generation MR2 (SW20): rounded shoulders, rear wing, round lamp clusters.
    sw20(g, c, t, label = 'LEO') {
      const o = t * 2, d = shade(c, -0.3), dk = shade(c, -0.55), l = shade(c, 0.35);
      tyres(g);
      flank(g, t, 13, 34, d);
      rect(g, 8, 31, 56, 4, '#18181c');
      poly(g, [18 + o, 13, 54 + o, 13, 48 + o, 3, 24 + o, 3], c);
      rect(g, 24 + o, 3, 24, 1, l);
      poly(g, [21 + o, 13, 51 + o, 13, 46 + o, 5, 26 + o, 5], GLASS);
      rect(g, 27 + o, 6, 6, 1, GLASS_HI);
      rect(g, 6, 15, 60, 17, c); rect(g, 7, 14, 58, 1, c); rect(g, 9, 13, 54, 1, l);
      rect(g, 6, 31, 60, 1, d);
      rect(g, 10, 8, 52, 2, d); rect(g, 10, 8, 52, 1, l);
      rect(g, 15, 10, 2, 4, dk); rect(g, 55, 10, 2, 4, dk);
      rect(g, 8, 17, 20, 7, '#6e0b10'); rect(g, 44, 17, 20, 7, '#6e0b10');
      for (const x of [10, 19, 46, 55]) {
        rect(g, x, 18, 7, 5, '#e01d24'); rect(g, x + 1, 18, 3, 1, '#ff8a7e');
      }
      plate(g, 29, 24, label);
      rect(g, 12, 33, 4, 2, '#9a9aa2'); rect(g, 56, 33, 4, 2, '#9a9aa2');
    },
    // Third-generation roadster (ZZW30): open cockpit, twin hoops, small round lamps.
    w30(g, c, t, label = 'LEO') {
      const o = t * 2, d = shade(c, -0.3), l = shade(c, 0.35);
      tyres(g);
      flank(g, t, 13, 34, d);
      rect(g, 8, 31, 56, 4, '#18181c');
      poly(g, [16 + o, 14, 56 + o, 14, 52 + o, 6, 20 + o, 6], '#2b3b4b');
      rect(g, 20 + o, 6, 32, 1, '#111');
      rect(g, 16 + o, 11, 40, 3, '#202026');
      rect(g, 22 + o, 7, 9, 6, '#1b1b1f'); rect(g, 41 + o, 7, 9, 6, '#1b1b1f');
      rect(g, 22 + o, 7, 9, 1, '#5a5a62'); rect(g, 41 + o, 7, 9, 1, '#5a5a62');
      rect(g, 6, 14, 60, 18, c); rect(g, 8, 13, 56, 1, l);
      rect(g, 6, 31, 60, 1, d);
      rect(g, 8, 17, 11, 7, '#8e1016'); rect(g, 53, 17, 11, 7, '#8e1016');
      rect(g, 10, 18, 7, 5, '#ff3b30'); rect(g, 55, 18, 7, 5, '#ff3b30');
      rect(g, 11, 18, 3, 1, '#ffa09a'); rect(g, 56, 18, 3, 1, '#ffa09a');
      rect(g, 24, 19, 24, 2, d);
      plate(g, 29, 24, label);
      rect(g, 33, 33, 6, 2, '#9a9aa2');
    },
    // Rival machines (generic, invented designs).
    buggy(g, c, t) {
      const o = t * 2, d = shade(c, -0.35);
      tyres(g, 20, 21, [4, 52], 16);
      rect(g, 17, 25, 38, 7, '#2d2d33');
      rect(g, 23, 17, 26, 10, '#5b5d66'); rect(g, 23, 17, 26, 1, '#8a8c96');
      for (let x = 25; x < 48; x += 4) rect(g, x, 19, 2, 6, '#43454d');
      rect(g, 26, 10, 3, 8, '#a5a7b0'); rect(g, 43, 10, 3, 8, '#a5a7b0');
      rect(g, 18 + o, 2, 3, 24, c); rect(g, 51 + o, 2, 3, 24, c); rect(g, 18 + o, 2, 36, 3, c);
      rect(g, 18 + o, 2, 36, 1, shade(c, 0.4));
      rect(g, 30 + o, 6, 12, 10, d); rect(g, 31 + o, 6, 10, 9, '#f4f4f0');
      rect(g, 31 + o, 6, 10, 2, c);
      rect(g, 17, 27, 5, 3, '#ff2a2a'); rect(g, 50, 27, 5, 3, '#ff2a2a');
      rect(g, 20, 33, 5, 6, '#1a1a1a'); rect(g, 47, 33, 5, 6, '#1a1a1a');
    },
    hatch(g, c, t) {
      const o = t * 2, d = shade(c, -0.3), l = shade(c, 0.35);
      tyres(g, 31, 10);
      flank(g, t, 8, 34, d);
      poly(g, [9 + o, 10, 63 + o, 10, 59 + o, 2, 13 + o, 2], c);
      rect(g, 13 + o, 2, 46, 1, l);
      poly(g, [13 + o, 10, 59 + o, 10, 56 + o, 4, 16 + o, 4], GLASS);
      rect(g, 18 + o, 5, 9, 1, GLASS_HI);
      rect(g, 7, 10, 58, 22, c); rect(g, 7, 10, 58, 1, l);
      rect(g, 8, 12, 6, 13, '#cf1d1d'); rect(g, 58, 12, 6, 13, '#cf1d1d');
      rect(g, 8, 20, 6, 3, '#f0a020'); rect(g, 58, 20, 6, 3, '#f0a020');
      rect(g, 16, 13, 40, 1, d);
      plate(g, 29, 21, 'RVL');
      rect(g, 6, 30, 60, 6, '#1d1d22');
      rect(g, 54, 35, 4, 2, '#9a9aa2');
    },
    muscle(g, c, t) {
      const o = t * 2, d = shade(c, -0.3), l = shade(c, 0.35);
      tyres(g, 29, 12, [7, 51], 14);
      flank(g, t, 14, 33, d);
      poly(g, [18 + o, 16, 54 + o, 16, 48 + o, 6, 24 + o, 6], c);
      poly(g, [21 + o, 16, 51 + o, 16, 46 + o, 8, 26 + o, 8], GLASS);
      rect(g, 4, 15, 64, 17, c); rect(g, 4, 15, 64, 1, l);
      rect(g, 4, 13, 64, 2, d);
      rect(g, 6, 19, 60, 5, '#4a0608');
      for (let x = 7; x < 65; x += 6) rect(g, x, 20, 5, 3, '#e3222a');
      rect(g, 31, 6, 3, 26, '#efefe6'); rect(g, 38, 6, 3, 26, '#efefe6');
      plate(g, 29, 25, 'V8');
      rect(g, 4, 31, 64, 4, '#b8bcc4'); rect(g, 4, 31, 64, 1, '#e4e7ec');
      rect(g, 10, 35, 5, 2, '#9a9aa2'); rect(g, 57, 35, 5, 2, '#9a9aa2');
    },
    gt(g, c, t) {
      const o = t * 2, d = shade(c, -0.3), dk = shade(c, -0.6), l = shade(c, 0.35);
      tyres(g, 29, 12, [6, 52], 14);
      flank(g, t, 15, 33, d);
      poly(g, [22 + o, 18, 50 + o, 18, 46 + o, 10, 26 + o, 10], c);
      poly(g, [25 + o, 18, 47 + o, 18, 44 + o, 12, 28 + o, 12], GLASS);
      rect(g, 3, 17, 66, 15, c); rect(g, 3, 17, 66, 1, l);
      rect(g, 6, 21, 18, 2, '#ff3333'); rect(g, 48, 21, 18, 2, '#ff3333');
      rect(g, 26, 22, 20, 7, dk);
      for (let x = 28; x < 45; x += 4) rect(g, x, 23, 2, 6, '#0d0d10');
      rect(g, 3, 30, 66, 5, '#141417');
      rect(g, 20, 7, 2, 11, '#222'); rect(g, 50, 7, 2, 11, '#222');
      rect(g, 3, 4, 66, 4, d); rect(g, 3, 4, 66, 1, l);
      rect(g, 3, 4, 2, 9, dk); rect(g, 67, 4, 2, 9, dk);
      rect(g, 31, 33, 4, 2, '#9a9aa2'); rect(g, 37, 33, 4, 2, '#9a9aa2');
    },
    pickup(g, c, t) {
      const o = t * 2, d = shade(c, -0.3), l = shade(c, 0.35);
      tyres(g, 31, 10, [7, 52], 13);
      flank(g, t, 6, 34, d);
      poly(g, [14 + o, 16, 58 + o, 16, 55 + o, 2, 17 + o, 2], c);
      rect(g, 17 + o, 2, 38, 1, l);
      rect(g, 22 + o, 5, 28, 8, GLASS); rect(g, 24 + o, 6, 6, 1, GLASS_HI);
      rect(g, 5, 15, 62, 17, c); rect(g, 5, 15, 62, 1, l);
      rect(g, 10, 18, 52, 1, d); rect(g, 10, 27, 52, 1, d);
      rect(g, 5, 16, 5, 11, '#cf1d1d'); rect(g, 62, 16, 5, 11, '#cf1d1d');
      plate(g, 29, 20, 'TOW');
      rect(g, 4, 31, 64, 5, '#aeb2ba'); rect(g, 4, 31, 64, 1, '#dfe2e8');
    },
  };

  function carFrames(model, color, label) {
    const frames = [];
    for (let t = -2; t <= 2; t++) {
      const [c, g] = canvas(CAR_W, CAR_H);
      MODELS[model](g, color, t, label);
      frames.push(c);
    }
    return frames;
  }

  // ---------------------------------------------------------------- scenery
  function palm(seed) {
    const r = rng(seed), [c, g] = canvas(56, 104);
    const lean = r() < 0.5 ? -1 : 1, segs = 16;
    let tx = 26, ty = 100;
    for (let i = 0; i < segs; i++) {
      const x = 25 + Math.round(Math.sin((i / segs) * 1.5) * 9 * lean), y = 100 - i * 5;
      rect(g, x, y - 5, 6, 5, i % 2 ? '#8a5a2b' : '#6b431e');
      rect(g, x, y - 5, 2, 5, i % 2 ? '#a06c38' : '#7d5226');
      tx = x + 3; ty = y - 6;
    }
    const greens = ['#2f8f3a', '#3faa47', '#1f6f2b'];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + r() * 0.3;
      const reach = 16 + r() * 8;
      for (let s = 0; s < reach; s++) {
        const px = tx + Math.cos(a) * s * 1.2, py = ty + Math.sin(a) * s * 0.55 + s * s * 0.035;
        rect(g, Math.round(px) - 1, Math.round(py), 3, 2, greens[(s + k) % 3]);
      }
    }
    rect(g, tx - 3, ty + 1, 3, 3, '#5a3a1a'); rect(g, tx + 1, ty + 2, 3, 3, '#4a2e12');
    return c;
  }

  function pine(seed, snow) {
    const r = rng(seed), [c, g] = canvas(44, 88);
    rect(g, 20, 76, 5, 12, '#4a3020');
    const tiers = 5;
    for (let k = 0; k < tiers; k++) {
      const top = 4 + k * 13, bot = top + 22, w = 8 + k * 3.6 + r() * 2;
      poly(g, [22, top, 22 - w, bot, 22 + w, bot], '#1d5a32');
      poly(g, [22, top, 22 - w, bot, 22, bot], '#2a7442');
      if (snow) {
        poly(g, [22, top, 22 - w * 0.35, top + 8, 22 + w * 0.35, top + 8], '#eef4ff');
        rect(g, Math.round(22 - w), bot - 2, Math.round(w * 2), 2, '#dfe9fb');
      }
    }
    return c;
  }

  function cactus() {
    const [c, g] = canvas(34, 60), G = '#2f8a3a', L = '#4fb05a', D = '#1f6a2a';
    rect(g, 14, 6, 7, 54, G); rect(g, 15, 6, 2, 54, L); rect(g, 19, 6, 2, 54, D);
    rect(g, 15, 4, 5, 2, G);
    rect(g, 4, 20, 6, 16, G); rect(g, 5, 20, 2, 16, L); rect(g, 4, 32, 12, 5, G);
    rect(g, 25, 12, 6, 18, G); rect(g, 26, 12, 2, 18, L); rect(g, 19, 26, 12, 5, G);
    return c;
  }

  function boulder(seed, col) {
    const r = rng(seed), [c, g] = canvas(52, 36);
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      pts.push(26 + Math.cos(a) * (22 + r() * 3), 34 + Math.sin(a) * (24 + r() * 8));
    }
    poly(g, pts, col);
    poly(g, pts.map((v, i) => (i % 2 ? v + 4 : v + 6)), shade(col, -0.3));
    poly(g, [10, 30, 22, 10, 28, 12, 18, 30], shade(col, 0.25));
    return c;
  }

  function mesa(seed, col) {
    const r = rng(seed), [c, g] = canvas(96, 84);
    poly(g, [8, 84, 14, 22, 24, 8, 72, 8, 82, 24, 90, 84], col);
    poly(g, [56, 8, 72, 8, 82, 24, 90, 84, 60, 84], shade(col, -0.25));
    for (let y = 18; y < 84; y += 9 + Math.floor(r() * 5)) rect(g, 12, y, 76, 2, shade(col, -0.15));
    rect(g, 24, 8, 48, 2, shade(col, 0.2));
    return c;
  }

  function emberRock(seed) {
    const r = rng(seed), [c, g] = canvas(48, 40);
    poly(g, [2, 40, 8, 14, 20, 4, 34, 6, 44, 18, 46, 40], '#2a2224');
    poly(g, [26, 6, 34, 6, 44, 18, 46, 40, 30, 40], '#1d1718');
    for (let k = 0; k < 6; k++) {
      let x = 10 + r() * 28, y = 12 + r() * 20;
      for (let s = 0; s < 6; s++) {
        rect(g, Math.round(x), Math.round(y), 2, 1, s % 2 ? '#ff7a1a' : '#ffb02e');
        x += r() * 3 - 1; y += 1;
      }
    }
    return c;
  }

  function billboard(text, bg, fg) {
    const w = Math.max(68, text3Width(text, 2) + 16), [c, g] = canvas(w, 50);
    rect(g, 12, 30, 3, 20, '#5a5a62'); rect(g, w - 15, 30, 3, 20, '#5a5a62');
    rect(g, 2, 2, w - 4, 30, '#1a1a1e'); rect(g, 4, 4, w - 8, 26, bg);
    text3(g, text, Math.round(w / 2 - text3Width(text, 2) / 2), 12, fg, 2);
    rect(g, 4, 4, w - 8, 1, shade(bg, 0.3));
    return c;
  }

  function chevron(dir) {
    const [c, g] = canvas(32, 34);
    rect(g, 15, 22, 3, 12, '#6a6a72');
    rect(g, 2, 2, 28, 21, '#1a1a1e'); rect(g, 3, 3, 26, 19, '#f5c518');
    for (const off of [5, 14]) {
      const pts = dir > 0
        ? [off, 6, off + 6, 6, off + 12, 12, off + 6, 18, off, 18, off + 6, 12]
        : [32 - off, 6, 26 - off, 6, 20 - off, 12, 26 - off, 18, 32 - off, 18, 26 - off, 12];
      poly(g, pts, '#141414');
    }
    return c;
  }

  function cone() {
    const [c, g] = canvas(14, 18);
    poly(g, [5, 1, 9, 1, 12, 15, 2, 15], '#ff6a13');
    rect(g, 4, 6, 6, 2, '#f4f4f4'); rect(g, 3, 10, 8, 2, '#f4f4f4');
    rect(g, 1, 15, 12, 3, '#2a2a2a');
    return c;
  }

  function lamp(lit) {
    const [c, g] = canvas(20, 84);
    rect(g, 8, 8, 3, 76, '#5a6070'); rect(g, 8, 8, 1, 76, '#7a8090');
    rect(g, 8, 6, 10, 2, '#5a6070');
    rect(g, 13, 8, 6, 2, lit ? '#fff4c0' : '#c8c8c8');
    if (lit) { rect(g, 12, 10, 8, 2, 'rgba(255,240,170,0.45)'); rect(g, 11, 12, 10, 2, 'rgba(255,240,170,0.2)'); }
    rect(g, 6, 80, 7, 4, '#3a3e48');
    return c;
  }

  function building(seed, col, lit) {
    const r = rng(seed), w = 40 + Math.floor(r() * 4) * 8, h = 90 + Math.floor(r() * 6) * 14;
    const [c, g] = canvas(w, h);
    rect(g, 0, 6, w, h - 6, col);
    rect(g, w - 8, 6, 8, h - 6, shade(col, -0.25));
    rect(g, 0, 6, w, 2, shade(col, 0.2));
    rect(g, Math.floor(w / 2) - 1, 0, 2, 6, '#888');
    if (lit) rect(g, Math.floor(w / 2) - 1, 0, 2, 1, '#ff3b3b');
    for (let y = 12; y < h - 8; y += 7) {
      for (let x = 4; x < w - 10; x += 6) {
        const on = r() < (lit ? 0.55 : 0.2);
        rect(g, x, y, 3, 4, on ? (lit ? (r() < 0.8 ? '#ffd27a' : '#9fe8ff') : '#9ab8d0') : shade(col, -0.4));
      }
    }
    return c;
  }

  function grandstand(seed) {
    const r = rng(seed), [c, g] = canvas(128, 52);
    rect(g, 0, 4, 128, 4, '#c23b3b'); rect(g, 0, 4, 128, 1, '#e86060');
    for (let x = 4; x < 128; x += 30) rect(g, x, 8, 2, 14, '#777');
    for (let row = 0; row < 6; row++) {
      const y = 14 + row * 6;
      rect(g, row * 2, y + 4, 128 - row * 4, 2, '#8a8f99');
      for (let x = row * 2 + 1; x < 127 - row * 2; x += 2) {
        const hue = ['#f4d35e', '#ee964b', '#f95738', '#4ea8de', '#f4f4f4', '#7bd389'][Math.floor(r() * 6)];
        rect(g, x, y + 1, 1, 3, hue); rect(g, x, y, 1, 1, '#e8c39e');
      }
    }
    rect(g, 0, 50, 128, 2, '#555');
    return c;
  }

  function gantry() {
    const [c, g] = canvas(240, 100);
    for (const x of [0, 228]) { rect(g, x, 16, 12, 84, '#d8dbe2'); rect(g, x + 8, 16, 4, 84, '#9aa0aa'); }
    rect(g, 0, 6, 240, 28, '#16161a');
    for (let x = 0; x < 240; x += 6) {
      rect(g, x, 6, 3, 3, '#f4f4f4'); rect(g, x + 3, 9, 3, 3, '#f4f4f4');
      rect(g, x, 28, 3, 3, '#f4f4f4'); rect(g, x + 3, 31, 3, 3, '#f4f4f4');
    }
    const txt = 'MIDSHIP DRIFT';
    text3(g, txt, 120 - text3Width(txt, 3) / 2, 13, '#ffd23f', 3);
    return c;
  }

  // ---------------------------------------------------------------- backdrops
  // Backdrops are 512px wide and tile seamlessly: shapes are built from
  // whole-period sine sums or wrapped placements.
  const BG_W = 512;

  function ridge(g, h, base, amp, freqs, seed, col) {
    const r = rng(seed), waves = freqs.map(f => [f, r() * Math.PI * 2, r() * 0.6 + 0.4]);
    for (let x = 0; x < BG_W; x++) {
      let y = 0;
      for (const [f, p, a] of waves) y += Math.sin((x / BG_W) * Math.PI * 2 * f + p) * a / f;
      const top = Math.round(base - y * amp);
      rect(g, x, top, 1, h - top, col);
    }
  }

  function wrapPlace(w, fn) {
    fn(0); fn(-BG_W); fn(BG_W);
  }

  function backdrop(kind, cols, seed) {
    const H = 96, [c, g] = canvas(BG_W, H), r = rng(seed);
    if (kind === 'hills') {
      ridge(g, H, 62, 16, [2, 3, 5], seed, cols[0]);
      ridge(g, H, 78, 8, [3, 7, 11], seed + 1, cols[1]);
    } else if (kind === 'mountains') {
      ridge(g, H, 44, 30, [2, 5, 9, 17], seed, cols[0]);
      // snowcaps: repaint the top few pixels of each column
      const img = g.getImageData(0, 0, BG_W, H);
      for (let x = 0; x < BG_W; x++) {
        let top = 0;
        while (top < H && img.data[(top * BG_W + x) * 4 + 3] === 0) top++;
        if (top < 40) rect(g, x, top, 1, Math.max(2, Math.round((40 - top) * 0.6)), cols[1]);
      }
      ridge(g, H, 76, 10, [4, 9, 13], seed + 2, shade(cols[0], -0.3));
    } else if (kind === 'mesas') {
      ridge(g, H, 84, 4, [3, 8], seed, shade(cols[1], -0.2));
      for (let k = 0; k < 7; k++) {
        const x0 = Math.floor(r() * BG_W), w = 30 + r() * 60, top = 30 + r() * 34;
        wrapPlace(BG_W, dx => {
          poly(g, [x0 + dx, H, x0 + dx + 6, top + 4, x0 + dx + 10, top, x0 + dx + w - 10, top, x0 + dx + w - 6, top + 4, x0 + dx + w, H], cols[k % 2]);
          rect(g, x0 + dx + 10, top + 10, w - 20, 2, shade(cols[k % 2], -0.2));
        });
      }
    } else if (kind === 'city') {
      for (let k = 0; k < 46; k++) {
        const x0 = Math.floor(r() * BG_W), w = 10 + Math.floor(r() * 22), top = 28 + Math.floor(r() * 50);
        const col = k % 3 ? cols[0] : shade(cols[0], 0.12);
        wrapPlace(BG_W, dx => {
          rect(g, x0 + dx, top, w, H - top, col);
          for (let y = top + 3; y < H - 2; y += 4) {
            for (let x = x0 + dx + 2; x < x0 + dx + w - 2; x += 3) {
              if (((x * 7 + y * 13 + k) % 5) === 0) rect(g, x, y, 1, 2, cols[1]);
            }
          }
          if (k % 7 === 0) { rect(g, x0 + dx + Math.floor(w / 2), top - 8, 1, 8, '#888'); rect(g, x0 + dx + Math.floor(w / 2), top - 8, 1, 1, '#ff4040'); }
        });
      }
    } else if (kind === 'volcano') {
      ridge(g, H, 80, 6, [3, 7], seed, shade(cols[0], -0.3));
      for (const x0 of [120, 380]) {
        const big = x0 === 120;
        const top = big ? 18 : 40, half = big ? 110 : 70, crater = big ? 14 : 9;
        poly(g, [x0 - half, H, x0 - crater, top, x0 + crater, top, x0 + half, H], cols[0]);
        poly(g, [x0, top, x0 + crater, top, x0 + half, H, x0 + 20, H], shade(cols[0], -0.25));
        for (let k = 0; k < 4; k++) {
          let x = x0 - crater + 4 + k * (crater / 2), y = top;
          while (y < H - 4) { rect(g, Math.round(x), y, 2, 3, k % 2 ? '#ff6a1a' : '#ffb02e'); x += (r() - 0.45) * 3; y += 3; }
        }
        rect(g, x0 - crater, top - 2, crater * 2, 3, '#ff8a2a');
      }
    }
    return c;
  }

  function clouds(seed, col) {
    const [c, g] = canvas(BG_W, 64), r = rng(seed);
    for (let k = 0; k < 9; k++) {
      const x0 = Math.floor(r() * BG_W), y0 = 10 + Math.floor(r() * 40), n = 4 + Math.floor(r() * 5);
      wrapPlace(BG_W, dx => {
        for (let i = 0; i < n; i++) {
          const w = 14 + (i % 3) * 8;
          rect(g, x0 + dx + i * 7, y0 - (i % 2) * 3, w, 6 + (i % 2) * 3, col);
        }
        rect(g, x0 + dx - 4, y0 + 5, n * 7 + 18, 3, shade(col, -0.08));
      });
    }
    return c;
  }

  return {
    CAR_W, CAR_H, FONT3, canvas, rng, shade, rect, poly, disc, text3, text3Width,
    carFrames, palm, pine, cactus, boulder, mesa, emberRock, billboard, chevron, cone, lamp,
    building, grandstand, gantry, backdrop, clouds, MODELS,
  };
})();
