'use strict';
// Low-poly cartoon cars, built from tapered boxes, octagonal wheels and big helmeted
// heads. Every part also gets a slightly fattened black copy whose back faces are drawn
// first, which gives each car a thick cartoon outline.
//
// Model space: +x is the car's left, +y up, +z forward, metres, origin on the ground
// between the wheels.
const Models = (() => {
  const LIGHT = (() => { const l = [-0.35, 0.85, 0.45], m = Math.hypot(...l); return l.map(v => v / m); })();
  const OUT = 0.05;

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function builder() {
    const main = [], line = [];
    // Adds a triangle facing away from `inside`, shaded by its normal.
    function tri(arr, a, b, c, col, inside, lit) {
      let n = cross(sub(b, a), sub(c, a));
      const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (dot(n, sub(mid, inside)) < 0) { const t = b; b = c; c = t; n = n.map(v => -v); }
      const l = Math.hypot(...n) || 1;
      const k = lit ? 0.58 + 0.5 * Math.max(0, dot(n, LIGHT) / l) : 1;
      for (const p of [a, b, c]) arr.push(p[0], p[1], p[2], Math.min(1, col[0] * k), Math.min(1, col[1] * k), Math.min(1, col[2] * k));
    }
    function quad(arr, a, b, c, d, col, inside, lit) { tri(arr, a, b, c, col, inside, lit); tri(arr, a, c, d, col, inside, lit); }

    // A hexahedron from 8 corners, indexed by bits: 1 = +x, 2 = +y, 4 = +z.
    function hexa(corners, hex, outline = true) {
      const col = rgb(hex), cen = [0, 1, 2].map(k => corners.reduce((s, p) => s + p[k], 0) / 8);
      const faces = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];
      for (const f of faces) quad(main, ...f.map(i => corners[i]), col, cen, true);
      if (outline) {
        const fat = corners.map((p, i) => [p[0] + (i & 1 ? OUT : -OUT), p[1] + (i & 2 ? OUT : -OUT), p[2] + (i & 4 ? OUT : -OUT)]);
        for (const f of faces) quad(line, ...f.map(i => fat[i]), [0, 0, 0], cen, false);
      }
    }
    // Box with optional taper: top is shrunk by tx (sideways) and its z range replaced by tz.
    function box(x0, x1, y0, y1, z0, z1, hex, o = {}) {
      const c = [];
      for (let i = 0; i < 8; i++) {
        const top = i & 2;
        let x = i & 1 ? x1 : x0, z = i & 4 ? z1 : z0;
        if (top && o.tx) x += i & 1 ? -o.tx : o.tx;
        if (top && o.tz) z = i & 4 ? o.tz[1] : o.tz[0];
        let y = top ? y1 : y0;
        if (top && o.frontTop !== undefined && i & 4) y = o.frontTop;
        if (top && o.backTop !== undefined && !(i & 4)) y = o.backTop;
        c.push([x, y, z]);
      }
      hexa(c, hex, o.outline !== false);
    }
    // Wheel: octagonal cylinder along x, centred on (x, y, z).
    function wheel(x, y, z, r, w, hex = '#1e1e22', hub = '#c8ccd4') {
      const N = 8, ring = (rr, xx) => Array.from({ length: N }, (_, k) => {
        const a = (k / N) * Math.PI * 2 + Math.PI / N;
        return [xx, y + Math.sin(a) * rr, z + Math.cos(a) * rr];
      });
      const parts = (rr, half, col, arr, lit) => {
        const A = ring(rr, x - half), B = ring(rr, x + half), cen = [x, y, z];
        for (let k = 0; k < N; k++) {
          const j = (k + 1) % N;
          quad(arr, A[k], A[j], B[j], B[k], col, cen, lit);
          tri(arr, [x - half, y, z], A[k], A[j], col, cen, lit);
          tri(arr, [x + half, y, z], B[k], B[j], col, cen, lit);
        }
      };
      parts(r, w / 2, rgb(hex), main, true);
      parts(r + OUT, w / 2 + OUT, [0, 0, 0], line, false);
      parts(r * 0.5, w / 2 + 0.02, rgb(hub), main, true);
    }
    // Low-poly ball for heads and helmets.
    function ball(cx, cy, cz, r, hex, sy = 1) {
      const R = 5, S = 8, pts = [];
      for (let i = 0; i <= R; i++) {
        const row = [], phi = (i / R) * Math.PI;
        for (let k = 0; k < S; k++) {
          const th = (k / S) * Math.PI * 2;
          row.push([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)]);
        }
        pts.push(row);
      }
      const emit = (rr, col, arr, lit) => {
        const P = (i, k) => { const p = pts[i][k % S]; return [cx + p[0] * rr, cy + p[1] * rr * sy, cz + p[2] * rr]; };
        const cen = [cx, cy, cz];
        for (let i = 0; i < R; i++) for (let k = 0; k < S; k++) {
          if (i > 0) tri(arr, P(i, k), P(i, k + 1), P(i + 1, k), col, cen, lit);
          if (i < R - 1) tri(arr, P(i, k + 1), P(i + 1, k + 1), P(i + 1, k), col, cen, lit);
        }
      };
      emit(r, rgb(hex), main, true);
      emit(r + OUT, [0, 0, 0], line, false);
    }
    // Driver: helmet ball, a dark visor band facing forward, shoulders below.
    function driver(x, y, z, helmet, size = 1) {
      box(x - 0.3 * size, x + 0.3 * size, y - 0.55 * size, y - 0.2 * size, z - 0.22, z + 0.12, '#f4f4f4');
      ball(x, y, z, 0.32 * size, helmet, 1.05);
      box(x - 0.24 * size, x + 0.24 * size, y - 0.06 * size, y + 0.08 * size, z + 0.12 * size, z + 0.3 * size, '#18202c', { outline: false });
      box(x - 0.2 * size, x + 0.2 * size, y - 0.03 * size, y + 0.02 * size, z + 0.29 * size, z + 0.31 * size, '#6ab0ff', { outline: false });
    }
    function lights(w, y, zf, zb, round) {
      for (const s of [-1, 1]) {
        box(s * w - 0.18, s * w + 0.18, y, y + 0.14, zb - 0.04, zb + 0.02, '#ff2a2a', { outline: false });
        if (round !== false) box(s * w - 0.16, s * w + 0.16, y, y + 0.14, zf - 0.02, zf + 0.04, '#fff3b0', { outline: false });
      }
    }
    return { main, line, box, wheel, ball, driver, lights };
  }

  const BODIES = {
    // Leo's Mk3 MR2 roadster: short overhangs, rounded nose, open top, twin roll hoops.
    mr2(b, col, helmet) {
      const dk = Art.shade(col, -0.25);
      b.box(-0.9, 0.9, 0.28, 0.82, -1.95, 1.95, col, { tx: 0.06, frontTop: 0.66, tz: [-1.9, 1.7] });
      b.box(-0.82, 0.82, 0.82, 0.98, -1.85, -0.55, col, { tx: 0.08, tz: [-1.75, -0.6] });
      b.box(-0.8, 0.8, 0.66, 0.84, 0.6, 1.75, col, { tx: 0.1, frontTop: 0.7 });
      b.box(-0.72, 0.72, 0.8, 0.86, -0.55, 0.62, '#1a1a1e', { outline: false });
      b.box(-0.74, 0.74, 0.82, 1.32, 0.56, 0.66, '#9fd2ff', { tz: [0.36, 0.48] });
      for (const s of [-1, 1]) b.box(s * 0.4 - 0.2, s * 0.4 + 0.2, 0.98, 1.3, -0.62, -0.52, dk);
      b.box(-0.92, 0.92, 0.28, 0.42, -1.98, -1.6, '#26272c');
      b.lights(0.62, 0.6, 1.9, -1.98);
      b.box(-0.24, 0.24, 0.46, 0.6, -2.0, -1.97, '#ffffff', { outline: false });
      b.driver(-0.38, 1.26, -0.1, helmet);
      for (const [x, z] of [[0.86, 1.25], [-0.86, 1.25], [0.86, -1.25], [-0.86, -1.25]]) b.wheel(x, 0.42, z, 0.42, 0.34);
    },
    // Long bonnet, chrome blower, fat rear tyres.
    hotrod(b, col, helmet) {
      b.box(-0.78, 0.78, 0.35, 0.86, -1.9, 2.1, col, { tx: 0.08, frontTop: 0.78 });
      b.box(-0.3, 0.3, 0.86, 1.2, 0.6, 1.4, '#d8dce4', { tx: 0.06 });
      b.box(-0.22, 0.22, 1.2, 1.32, 0.7, 1.3, '#555a66');
      b.box(-0.7, 0.7, 0.8, 0.88, -1.4, 0.2, '#1a1a1e', { outline: false });
      b.box(-0.66, 0.66, 0.84, 1.2, 0.18, 0.28, '#9fd2ff', { tz: [0.06, 0.16] });
      b.lights(0.55, 0.6, 2.1, -1.9);
      b.driver(0, 1.28, -0.7, helmet);
      b.wheel(0.86, 0.38, 1.4, 0.38, 0.28); b.wheel(-0.86, 0.38, 1.4, 0.38, 0.28);
      b.wheel(0.92, 0.55, -1.25, 0.55, 0.5); b.wheel(-0.92, 0.55, -1.25, 0.55, 0.5);
    },
    // Round little bubble car with the driver's head poking out of the sunroof.
    bubble(b, col, helmet) {
      b.box(-0.85, 0.85, 0.3, 1.0, -1.45, 1.45, col, { tx: 0.06, frontTop: 0.85 });
      b.box(-0.78, 0.78, 1.0, 1.45, -1.1, 0.5, col, { tx: 0.18, tz: [-0.9, 0.2] });
      b.box(-0.74, 0.74, 1.0, 1.4, 0.48, 0.58, '#9fd2ff', { tz: [0.18, 0.28], tx: 0.14 });
      b.lights(0.55, 0.7, 1.45, -1.45);
      b.driver(0, 1.78, -0.35, helmet, 1.1);
      for (const [x, z] of [[0.82, 0.95], [-0.82, 0.95], [0.82, -0.95], [-0.82, -0.95]]) b.wheel(x, 0.4, z, 0.4, 0.3);
    },
    // Open-top jeep-ish truck with a roll bar over the load bed.
    truck(b, col, helmet) {
      const dk = Art.shade(col, -0.3);
      b.box(-0.95, 0.95, 0.45, 1.05, -2.0, 2.0, col, { tx: 0.04 });
      b.box(-0.9, 0.9, 1.0, 1.08, -1.9, -0.6, '#3a2a1e', { outline: false });
      b.box(-0.85, 0.85, 1.05, 1.08, -0.5, 0.6, '#1a1a1e', { outline: false });
      b.box(-0.88, 0.88, 1.05, 1.5, 0.6, 0.7, '#9fd2ff', { tz: [0.5, 0.6] });
      for (const s of [-1, 1]) b.box(s * 0.82 - 0.07, s * 0.82 + 0.07, 1.05, 1.85, -0.75, -0.62, dk);
      b.box(-0.89, 0.89, 1.75, 1.88, -0.75, -0.62, dk);
      b.box(-0.98, 0.98, 0.45, 0.62, 1.95, 2.12, '#c8ccd4');
      b.lights(0.62, 0.8, 2.02, -2.02);
      b.driver(-0.4, 1.55, -0.05, helmet, 1.05);
      for (const [x, z] of [[0.95, 1.3], [-0.95, 1.3], [0.95, -1.3], [-0.95, -1.3]]) b.wheel(x, 0.5, z, 0.5, 0.42);
    },
    // Dune buggy: a low tub, a roll cage and wheels out in the open.
    buggy(b, col, helmet) {
      b.box(-0.65, 0.65, 0.35, 0.8, -1.4, 1.5, col, { tx: 0.05, frontTop: 0.62, tz: [-1.3, 1.2] });
      b.box(-0.55, 0.55, 0.78, 0.84, -1.0, 0.6, '#1a1a1e', { outline: false });
      for (const s of [-1, 1]) {
        b.box(s * 0.55 - 0.05, s * 0.55 + 0.05, 0.8, 1.7, -0.75, -0.65, '#e8e8e8');
        b.box(s * 0.55 - 0.05, s * 0.55 + 0.05, 1.62, 1.7, -0.7, 0.45, '#e8e8e8');
        b.box(s * 0.55 - 0.05, s * 0.55 + 0.05, 0.8, 1.7, 0.4, 0.5, '#e8e8e8', { tz: [0.3, 0.4] });
      }
      b.box(-0.6, 0.6, 1.62, 1.7, -0.75, -0.65, '#e8e8e8');
      b.box(-0.35, 0.35, 0.8, 1.05, -1.4, -0.95, '#555a66');
      b.lights(0.4, 0.55, 1.5, -1.42);
      b.driver(0, 1.25, -0.25, helmet);
      for (const [x, z] of [[0.95, 1.15], [-0.95, 1.15], [0.98, -1.05], [-0.98, -1.05]]) b.wheel(x, 0.5, z, 0.5, 0.4);
    },
    // Eighties wedge supercar with the targa roof off.
    wedge(b, col, helmet) {
      b.box(-0.95, 0.95, 0.25, 0.85, -2.0, 2.0, col, { tx: 0.08, frontTop: 0.45 });
      b.box(-0.85, 0.85, 0.85, 1.0, -1.95, -0.6, col, { tx: 0.1 });
      b.box(-0.92, 0.92, 1.0, 1.08, -2.0, -1.7, Art.shade(col, -0.3));
      b.box(-0.75, 0.75, 0.72, 0.8, -0.6, 0.5, '#1a1a1e', { outline: false });
      b.box(-0.78, 0.78, 0.6, 1.1, 0.45, 0.6, '#9fd2ff', { tz: [-0.05, 0.1] });
      b.lights(0.7, 0.55, 2.0, -2.0);
      b.driver(-0.36, 1.12, -0.25, helmet);
      for (const [x, z] of [[0.9, 1.3], [-0.9, 1.3], [0.92, -1.3], [-0.92, -1.3]]) b.wheel(x, 0.4, z, 0.4, 0.36);
    },
    // Open-wheel racer: cigar body, nose cone and wings.
    formula(b, col, helmet) {
      b.box(-0.42, 0.42, 0.22, 0.7, -1.6, 0.8, col, { tx: 0.08 });
      b.box(-0.3, 0.3, 0.22, 0.52, 0.8, 2.2, col, { tx: 0.08, frontTop: 0.34 });
      b.box(-0.95, 0.95, 0.18, 0.26, 1.95, 2.3, '#e8e8e8');
      b.box(-0.85, 0.85, 1.0, 1.08, -2.0, -1.6, '#e8e8e8');
      for (const s of [-1, 1]) b.box(s * 0.6 - 0.04, s * 0.6 + 0.04, 0.6, 1.0, -1.95, -1.65, '#2a2a2a');
      b.box(-0.6, 0.6, 0.25, 0.6, -0.8, 0.3, Art.shade(col, -0.2), { tx: 0.1 });
      b.lights(0.3, 0.4, 0, -1.62, false);
      b.driver(0, 0.98, -0.1, helmet, 0.95);
      b.wheel(0.88, 0.42, 1.4, 0.42, 0.34); b.wheel(-0.88, 0.42, 1.4, 0.42, 0.34);
      b.wheel(0.9, 0.48, -1.2, 0.48, 0.46); b.wheel(-0.9, 0.48, -1.2, 0.48, 0.46);
    },
  };

  function build(body, color, helmet) {
    const b = builder();
    BODIES[body](b, color, helmet);
    return { main: new Float32Array(b.main), line: new Float32Array(b.line) };
  }

  // A flat dark octagon for the shadow under a car.
  function shadow() {
    const out = [], N = 10;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      for (const [x, z] of [[0, 0], [Math.cos(a0) * 1.15, Math.sin(a0) * 2.3], [Math.cos(a1) * 1.15, Math.sin(a1) * 2.3]]) {
        out.push(x, 0, z, 0.08, 0.08, 0.1);
      }
    }
    return new Float32Array(out);
  }

  return { build, shadow, BODIES: Object.keys(BODIES) };
})();
