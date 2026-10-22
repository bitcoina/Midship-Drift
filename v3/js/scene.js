'use strict';
// Builds everything static for a course: one big mesh for the road, rails, bridge decks,
// pillars, tunnels, hillsides, ground or sea and the start gantry, plus the sprite atlas
// and the roadside scenery.
const Scene = (() => {
  const GROUND_Y = -0.3, RAIL_H = 0.9, RAIL_T = 0.45, DECK = 1.6;
  const ROOF = 7.6, WALL = 5.6;   // tunnel roof and wall heights above the road
  const LIGHT = (() => { const l = [-0.4, 0.8, 0.45], m = Math.hypot(...l); return l.map(x => x / m); })();

  function rgb(hex, k = 1) {
    const n = parseInt(hex.slice(1), 16);
    return [Math.min(1, ((n >> 16) / 255) * k), Math.min(1, (((n >> 8) & 255) / 255) * k), Math.min(1, ((n & 255) / 255) * k)];
  }
  const mul = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

  function hash(str) { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

  // ---------------------------------------------------------------- atlas
  // Shelf-packs canvases into one texture; returns uv rects keyed by name.
  function packAtlas(items) {
    const W = 1024, PAD = 2, rects = {};
    let x = 0, y = 0, row = 0;
    const sorted = Object.entries(items).sort((a, b) => b[1].height - a[1].height);
    for (const [, c] of sorted) {
      if (x + c.width + PAD > W) { x = 0; y += row + PAD; row = 0; }
      c._x = x; c._y = y; x += c.width + PAD; row = Math.max(row, c.height);
    }
    const H = 1 << Math.ceil(Math.log2(y + row + PAD));
    const [atlas, g] = Art.canvas(W, H);
    for (const [name, c] of sorted) {
      g.drawImage(c, c._x, c._y);
      rects[name] = { u0: c._x / W, v0: c._y / H, u1: (c._x + c.width) / W, v1: (c._y + c.height) / H, w: c.width, h: c.height };
    }
    return { atlas, rects };
  }

  // Scenery kinds from the theme lists, with a size in metres per pixel.
  function sceneryArt(th, key) {
    const M = 0.085;
    const kinds = {
      palm: () => [3, 7, 11].map(s => [Art.palm(s), M * 1.3]),
      pine: () => [2, 5, 9].map(s => [Art.pine(s, false), M * 1.5]),
      pineSnow: () => [2, 5, 9].map(s => [Art.pine(s, true), M * 1.5]),
      pineDark: () => [2, 5, 9].map(s => [Toons.tint(Art.pine(s, false), 0.55, '#3a3a6a'), M * 1.6]),
      cactus: () => [[Art.cactus(), M * 1.3]],
      boulder: () => [4, 8].map(s => [Art.boulder(s, th.rock), M * 1.1]),
      boulderDark: () => [4, 8].map(s => [Art.boulder(s, '#3a3232'), M * 1.1]),
      mesa: () => [6, 13].map(s => [Art.mesa(s, th.rock), M * 3.2]),
      ember: () => [3, 6, 9].map(s => [Art.emberRock(s), M * 1.4]),
      building: () => [1, 2, 3, 4, 5, 6].map(s => [Art.building(s * 31, ['#3b2a5c', '#2c3557', '#4a2f4f'][s % 3], true), M * 3.2]),
      lamp: () => [[Art.lamp(!!th.stars || !!th.storm || key === 'skyway'), M * 1.3]],
      billboard: () => th.boards.map(([t, bg, fg]) => [Art.billboard(t, bg, fg), M * 1.6]),
      boat: () => [1, 2, 3].map(s => [Toons.boat(s), M * 1.4]),
      buoy: () => [[Toons.buoy('#ff5a2a'), M * 1.1], [Toons.buoy('#ffd23f'), M * 1.1]],
      islet: () => [1, 2].map(s => [Toons.islet(s), M * 1.8]),
      sheep: () => [1, 2].map(s => [Toons.sheep(s), M * 0.9]),
      barn: () => [[Toons.barn(), M * 1.7]],
    };
    const out = {};
    for (const [kind] of th.scenery) out[kind] = kinds[kind]();
    out.grandstand = [[Art.grandstand(hash(key)), M * 1.6]];
    out.jump = [[Art.billboard('JUMP!', '#ffd23f', '#c81e1e'), M * 1.7]];
    out.tunnelSign = [[Art.billboard('TUNNEL', '#141414', '#ffd23f'), M * 1.5]];
    return out;
  }

  // ---------------------------------------------------------------- hillsides
  // Where a course has terrain, the ground rises to meet the road wherever the road runs
  // on the ground, is cut back so it never covers an open road, and is heaped up over
  // tunnels so they look bored through hills. Bridges and jump gaps are left alone.
  function makeTerrain(T, x0, x1, z0, z1) {
    const CELL = 6, MARGIN = 150, H = T.HALF;
    const ox = Math.floor((x0 - MARGIN) / 30) * 30, oz = Math.floor((z0 - MARGIN) / 30) * 30;
    const nx = Math.ceil((x1 + MARGIN - ox) / 30) * 5, nz = Math.ceil((z1 + MARGIN - oz) / 30) * 5;
    const hts = new Float32Array((nx + 1) * (nz + 1));
    const low = Float64Array.from(T.h, (h, i) => h - Math.abs(H * Math.sin(T.bank[i])) - 0.35);
    for (let gz = 0; gz <= nz; gz++) for (let gx = 0; gx <= nx; gx++) {
      const x = ox + gx * CELL, z = oz + gz * CELL;
      let fill = GROUND_Y, cap = Infinity;
      T.nearby(x, z, 140, j => {
        if (T.gapF[j]) return;
        const dist = Math.hypot(T.xs[j] - x, T.zs[j] - z);
        if (T.tunnel[j]) {
          // a hill over the tunnel: it sits on the tunnel's roof and rises away from it
          const e = dist - H - 1.7;
          fill = Math.max(fill, e < 14 ? T.h[j] + 8.9 + Math.min(7, 0.5 * Math.max(0, e)) : T.h[j] + 15.9 - 0.55 * (e - 14));
          return;
        }
        if (T.raised[j]) return;
        fill = Math.max(fill, low[j] - 0.6 * Math.max(0, dist - H - 3));
        cap = Math.min(cap, low[j] + 0.9 * Math.max(0, dist - H - 1.5));
      });
      hts[gz * (nx + 1) + gx] = Math.max(GROUND_Y, Math.min(fill, cap));
    }
    const at = (x, z) => {
      const fx = (x - ox) / CELL, fz = (z - oz) / CELL;
      if (fx < 0 || fz < 0 || fx >= nx || fz >= nz) return GROUND_Y;
      const gx = Math.floor(fx), gz = Math.floor(fz), tx = fx - gx, tz = fz - gz, w = nx + 1;
      const a = hts[gz * w + gx], b = hts[gz * w + gx + 1], c = hts[(gz + 1) * w + gx], d = hts[(gz + 1) * w + gx + 1];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    };
    return { ox, oz, nx, nz, CELL, hts, at, x1: ox + nx * CELL, z1: oz + nz * CELL };
  }

  // ---------------------------------------------------------------- build
  function build(T, th, key, course = {}) {
    const v = [];
    const tri = (a, b, c, col) => { for (const p of [a, b, c]) v.push(p[0], p[1], p[2], col[0], col[1], col[2]); };
    const quad = (a, b, c, d, col) => { tri(a, b, c, col); tri(a, c, d, col); };
    const n = T.n, H = T.HALF, W = T.W, WT = H + RAIL_T;
    const rnd = Art.rng(hash(key) + 11);

    // Surface point at sample i, lateral offset d (right positive), raised by up.
    const cosb = Float64Array.from(T.bank, Math.cos), sinb = Float64Array.from(T.bank, Math.sin);
    const P = (i, d, up = 0) => {
      i = W(i);
      return [T.xs[i] - T.fz[i] * d * cosb[i], T.h[i] - d * sinb[i] + up, T.zs[i] + T.fx[i] * d * cosb[i]];
    };
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, T.xs[i]); x1 = Math.max(x1, T.xs[i]); z0 = Math.min(z0, T.zs[i]); z1 = Math.max(z1, T.zs[i]); }
    const terrain = course.terrain ? makeTerrain(T, x0, x1, z0, z1) : null;
    const groundAt = terrain ? terrain.at : () => GROUND_Y;

    const road = [rgb(th.road[0]), rgb(th.road[1])], rumble = [rgb(th.rumble[0]), rgb(th.rumble[1])];
    const lane = rgb(th.lane), rail = [rgb(th.rail[0]), rgb(th.rail[1])];
    const railDk = [rgb(th.rail[0], 0.7), rgb(th.rail[1], 0.7)];
    const slab = rgb(th.slab), slabDk = rgb(th.slab, 0.65), pillar = rgb(th.pillar), pillarDk = rgb(th.pillar, 0.72);
    const black = [0.08, 0.08, 0.1], white = [0.95, 0.95, 0.95], hazard = [rgb('#ffd23f'), [0.1, 0.1, 0.12]];
    const foam = [0.9, 0.96, 1];

    // Cross-section, left to right, as [lateral offset, height above the road].
    const INNER = [[-WT, 0], [-WT, WALL], [-H + 2.2, ROOF], [H - 2.2, ROOF], [WT, WALL], [WT, 0]];
    const OUTER = [[-WT - 1.2, -0.6], [-WT - 1.2, WALL + 0.9], [-H + 1.4, ROOF + 1.3], [H - 1.4, ROOF + 1.3], [WT + 1.2, WALL + 0.9], [WT + 1.2, -0.6]];
    const wallLo = rgb('#3a3640'), wallHi = rgb('#5a5562'), roofC = rgb('#2c2a33'), stripe = rgb('#d9b23a'), lampC = rgb('#fff3b8');
    const shellC = rgb(th.cliff || th.rock), shellTop = rgb(th.ground[0], 0.9);

    // How far ahead of sample i the next jump gap starts (for the ramp's hazard stripes).
    const toGap = new Int32Array(n).fill(1e9);
    for (const j of T.jumps) for (let d = 1; d <= Math.round(38 / T.seg); d++) toGap[W(j.g - d)] = d;

    for (let i = 0; i < n; i++) {
      const j = i + 1, blk = Math.floor(i / 4) % 2, rb = Math.floor(i / 2) % 2;
      const inT = T.tunnel[i], dim = inT ? 0.55 : 1;
      if (T.gapF[i]) continue;
      // road surface: kerb, gritty asphalt, centre line, asphalt, kerb
      if (i === 0 || i === 1) {
        for (let c = 0; c < 8; c++) {
          const d0 = -H + c * 2, d1 = d0 + 2;
          quad(P(i, d0), P(i, d1), P(j, d1), P(j, d0), (c + i) % 2 ? black : white);
        }
      } else if (toGap[i] <= 12) {
        // the kicker ramp is striped in hazard yellow and black
        quad(P(i, -H), P(i, H), P(j, H), P(j, -H), hazard[i % 2]);
      } else {
        const asphalt = () => mul(road[blk], (0.95 + rnd() * 0.1) * dim);
        const strips = [[-H, -H + 1, mul(rumble[rb], dim)], [-H + 1, -4, asphalt()], [-4, -0.25, asphalt()],
          [-0.25, 0.25, i % 6 < 3 ? mul(lane, dim) : asphalt()], [0.25, 4, asphalt()], [4, H - 1, asphalt()], [H - 1, H, mul(rumble[rb], dim)]];
        for (const [d0, d1, col] of strips) quad(P(i, d0), P(i, d1), P(j, d1), P(j, d0), col);
      }
      // crash rails on both sides: inner face, top, outer face
      for (const s of [-1, 1]) {
        const a = s * H, b = s * WT, col = mul(rail[rb], dim), dk = mul(railDk[rb], dim);
        quad(P(i, a), P(j, a), P(j, a, RAIL_H), P(i, a, RAIL_H), col);
        quad(P(i, a, RAIL_H), P(j, a, RAIL_H), P(j, b, RAIL_H), P(i, b, RAIL_H), mul(rgb(th.rail[rb], 1.15), dim));
        quad(P(i, b), P(j, b), P(j, b, RAIL_H), P(i, b, RAIL_H), dk);
        // deck edge below the road
        if (T.h[i] > 0.4 || T.h[W(j)] > 0.4) quad(P(i, b), P(j, b), P(j, b, -DECK), P(i, b, -DECK), slab);
      }
      if (T.h[i] > 0.4 || T.h[W(j)] > 0.4) quad(P(i, -WT, -DECK), P(i, WT, -DECK), P(j, WT, -DECK), P(j, -WT, -DECK), slabDk);
      // the cut ends of the deck either side of a jump gap
      if (T.gapF[W(j)]) quad(P(j, -WT), P(j, WT), P(j, WT, -DECK), P(j, -WT, -DECK), slabDk);
      if (T.gapF[W(i - 1)]) quad(P(i, -WT), P(i, WT), P(i, WT, -DECK), P(i, -WT, -DECK), slabDk);

      if (inT) tunnelSegment(i);

      // pillars every 18 m under raised road, unless another road runs underneath
      // (closer together near a crossing, so the flyover reads as a proper bridge)
      const nearCross = T.otherRoadBelow(T.xs[i], T.zs[i], i, 30) < T.h[i] - 1;
      const twin = T.h[i] > 14 ? [-4.5, 4.5] : [0];
      if (!inT && i % (nearCross ? 3 : 6) === 0 && T.h[i] > 2.4 && T.otherRoadBelow(T.xs[i], T.zs[i], i, H + 2.6 + (twin.length > 1 ? 4.5 : 0)) > T.h[i] - 1) {
        for (const off of twin) {
          const c = P(i, off), top = T.h[i] - DECK - Math.abs(off * sinb[i]), foot = groundAt(c[0], c[2]);
          if (top - foot < 1) continue;
          box(c, T.fx[i], T.fz[i], 1.1, foot, top - 0.6, pillar, pillarDk);
          box(c, T.fx[i], T.fz[i], 1.5, top - 0.6, top, mul(pillar, 1.1), pillarDk);
          if (th.water) ring(c[0], c[2], 2.2, foam);
        }
      }
    }

    // An upright square column of half-width r, faces lit and shaded alternately.
    function box(c, fx, fz, r, y0, y1, lit, dark) {
      const rx = -fz, rz = fx;
      const corner = (a, b, y) => [c[0] + fx * a + rx * b, y, c[2] + fz * a + rz * b];
      const faces = [[[-r, -r], [r, -r]], [[r, -r], [r, r]], [[r, r], [-r, r]], [[-r, r], [-r, -r]]];
      faces.forEach(([p0, p1], k) => quad(corner(...p0, y0), corner(...p1, y0), corner(...p1, y1), corner(...p0, y1), k % 2 ? lit : dark));
      quad(corner(-r, -r, y1), corner(r, -r, y1), corner(r, r, y1), corner(-r, r, y1), lit);
    }
    // A flat ring on the water, for foam round a pillar.
    function ring(x, z, r, col) {
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2, y = GROUND_Y + 0.08;
        quad([x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r],
          [x + Math.cos(a1) * (r + 1.2), y, z + Math.sin(a1) * (r + 1.2)], [x + Math.cos(a0) * (r + 1.2), y, z + Math.sin(a0) * (r + 1.2)], col);
      }
    }

    // ---------------------------------------------------------------- tunnels
    function tunnelSegment(i) {
      const j = i + 1;
      for (let k = 0; k < INNER.length - 1; k++) {
        const [d0, u0] = INNER[k], [d1, u1] = INNER[k + 1];
        const col = k === 2 ? roofC : k === 1 || k === 3 ? wallLo : wallHi;
        if (k === 0 || k === 4) {
          // walls: dark skirting, a yellow stripe, then the upper wall
          const side = k === 0 ? -WT : WT, top = WALL;
          quad(P(i, side, 0), P(j, side, 0), P(j, side, 1.2), P(i, side, 1.2), wallLo);
          quad(P(i, side, 1.2), P(j, side, 1.2), P(j, side, 1.6), P(i, side, 1.6), i % 2 ? stripe : wallLo);
          quad(P(i, side, 1.6), P(j, side, 1.6), P(j, side, top), P(i, side, top), wallHi);
        } else quad(P(i, d0, u0), P(j, d0, u0), P(j, d1, u1), P(i, d1, u1), col);
      }
      for (let k = 0; k < OUTER.length - 1; k++) {
        const [d0, u0] = OUTER[k], [d1, u1] = OUTER[k + 1];
        quad(P(i, d0, u0), P(j, d0, u0), P(j, d1, u1), P(i, d1, u1), k === 2 ? shellTop : mul(shellC, k % 2 ? 1 : 0.8));
      }
      if (i % 4 === 0) {
        const a = P(i, -0.9, ROOF - 0.05), b = P(i, 0.9, ROOF - 0.05), c = P(j, 0.9, ROOF - 0.05), d = P(j, -0.9, ROOF - 0.05);
        quad(a, b, lerp3(b, c, 0.5), lerp3(a, d, 0.5), lampC);
      }
    }
    // Portals: a concrete face with a hazard-striped lintel at each end of a tunnel.
    for (let i = 0; i < n; i++) {
      const enter = T.tunnel[i] && !T.tunnel[W(i - 1)], leave = !T.tunnel[i] && T.tunnel[W(i - 1)];
      if (!enter && !leave) continue;
      const face = rgb('#c9c3b5'), faceDk = rgb('#9e988b'), F = 11, E = WT + 4;
      const Q = (d, u) => P(i, d, u);
      quad(Q(-E, -1), Q(-WT, -1), Q(-WT, F), Q(-E, F), face);
      quad(Q(WT, -1), Q(E, -1), Q(E, F), Q(WT, F), face);
      quad(Q(-WT, ROOF), Q(WT, ROOF), Q(WT, F), Q(-WT, F), face);
      tri(Q(-WT, WALL), Q(-H + 2.2, ROOF), Q(-WT, ROOF), face);
      tri(Q(WT, WALL), Q(WT, ROOF), Q(H - 2.2, ROOF), face);
      for (let s = 0; s < 12; s++) {
        const d0 = -E + (s * 2 * E) / 12, d1 = d0 + (2 * E) / 12;
        quad(Q(d0, F - 2.2), Q(d1, F - 2.2), Q(d1, F - 1.2), Q(d0, F - 1.2), hazard[s % 2]);
      }
      // a coping stone along the top, given some depth
      const back = (d, u) => { const p = P(i, d, u), dir = enter ? -1 : 1; return [p[0] + T.fx[W(i)] * dir * 1.5, p[1], p[2] + T.fz[W(i)] * dir * 1.5]; };
      quad(Q(-E, F), Q(E, F), back(E, F), back(-E, F), faceDk);
    }

    // start gantry: two posts and a chequered beam
    {
      const i = 0, top = 9;
      for (const s of [-1, 1]) {
        const c = P(i, s * (H + 1.4)), fx = T.fx[i], fz = T.fz[i], rx = -fz, rz = fx, r = 0.5;
        const corner = (a, b, y) => [c[0] + fx * a + rx * b, y, c[2] + fz * a + rz * b];
        const faces = [[[-r, -r], [r, -r]], [[r, -r], [r, r]], [[r, r], [-r, r]], [[-r, r], [-r, -r]]];
        faces.forEach(([p0, p1], k) => quad(corner(...p0, c[1] - DECK), corner(...p1, c[1] - DECK), corner(...p1, c[1] + top + 2), corner(...p0, c[1] + top + 2), k % 2 ? [0.85, 0.86, 0.9] : [0.6, 0.62, 0.68]));
      }
      const cols = 12;
      for (let c = 0; c < cols; c++) for (let rI = 0; rI < 2; rI++) {
        const d0 = -(H + 1.4) + (c * 2 * (H + 1.4)) / cols, d1 = d0 + (2 * (H + 1.4)) / cols;
        const y0 = P(i, 0)[1] + top + rI, y1 = y0 + 1;
        const a = P(i, d0), b = P(i, d1);
        const col = (c + rI) % 2 ? black : white;
        quad([a[0], y0, a[2]], [b[0], y0, b[2]], [b[0], y1, b[2]], [a[0], y1, a[2]], col);
      }
    }

    // ---------------------------------------------------------------- ground
    // Big chequered tiles, or sea with flecks of wave, out to the horizon. Where there are
    // hillsides they are a finer mesh, shaded by slope, with snow up high.
    const TILE = 30, M = 900, g0 = rgb(th.ground[0]), g1 = rgb(th.ground[1]);
    const gx0 = Math.floor((x0 - M) / TILE), gx1 = Math.ceil((x1 + M) / TILE), gz0 = Math.floor((z0 - M) / TILE), gz1 = Math.ceil((z1 + M) / TILE);
    const wave = mul(g1, 1.35);
    for (let gx = gx0; gx < gx1; gx++) for (let gz = gz0; gz < gz1; gz++) {
      const a = gx * TILE, b = gz * TILE;
      if (terrain && a >= terrain.ox && b >= terrain.oz && a + TILE <= terrain.x1 && b + TILE <= terrain.z1) continue;
      quad([a, GROUND_Y, b], [a + TILE, GROUND_Y, b], [a + TILE, GROUND_Y, b + TILE], [a, GROUND_Y, b + TILE], (gx + gz) & 1 ? g0 : g1);
      if (th.water && rnd() < 0.7) {
        const wx = a + 4 + rnd() * 18, wz = b + 4 + rnd() * 24, y = GROUND_Y + 0.05;
        quad([wx, y, wz], [wx + 7, y, wz], [wx + 7, y, wz + 0.7], [wx, y, wz + 0.7], wave);
      }
    }
    if (terrain) {
      const { ox, oz, nx, nz, CELL, hts } = terrain, w = nx + 1;
      const snow = [rgb('#eef3f9'), rgb('#e1e8f2')], cliff = rgb(th.cliff || th.rock);
      for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
        const a = hts[gz * w + gx], b = hts[gz * w + gx + 1], c = hts[(gz + 1) * w + gx], d = hts[(gz + 1) * w + gx + 1];
        const X = ox + gx * CELL, Z = oz + gz * CELL;
        // Leave a hole where a tunnel runs (the tunnel's own shell fills it). Splitting by
        // the nearest road sample puts the edge of the hole exactly at the portal.
        let near = -1, nd = WT + 2.5;
        T.nearby(X + CELL / 2, Z + CELL / 2, nd, j => { const dd = Math.hypot(T.xs[j] - X - CELL / 2, T.zs[j] - Z - CELL / 2); if (dd < nd) { nd = dd; near = j; } });
        if (near >= 0 && T.tunnel[near]) continue;
        // normal from the two diagonals, for shading
        const sx = (b + d - a - c) / (2 * CELL), sz = (c + d - a - b) / (2 * CELL), nl = Math.hypot(sx, 1, sz);
        const lit = 0.72 + 0.4 * Math.max(0, (-sx * LIGHT[0] + LIGHT[1] - sz * LIGHT[2]) / nl);
        const avg = (a + b + c + d) / 4, steep = Math.hypot(sx, sz);
        const check = (Math.floor(gx / 3) + Math.floor(gz / 3)) & 1;
        let col = check ? g0 : g1;
        if (th.snowline && avg > th.snowline - (check ? 0 : 3)) col = snow[check];
        else if (steep > 0.9) col = cliff;
        quad([X, a, Z], [X + CELL, b, Z], [X + CELL, d, Z + CELL], [X, c, Z + CELL], mul(col, lit));
      }
    }

    // ---------------------------------------------------------------- sprites
    const art = sceneryArt(th, key);
    const items = {};
    for (const [kind, list] of Object.entries(art)) list.forEach(([c], k) => { items[`${kind}${k}`] = c; });
    items.puff = Toons.puff('#d8d8de'); items.dust = Toons.puff(Art.shade(th.ground[0], 0.1));
    items.splash = Toons.puff('#e8f6ff');
    items.sparkY = Toons.spark('#ffd23f'); items.sparkB = Toons.spark('#5ad1ff'); items.sparkR = Toons.spark('#ff6a2a');
    items.rain = Toons.spark('#9fb4ff');
    const { atlas, rects } = packAtlas(items);

    const sprites = GLR.spriteBatch(1600);
    const pool = [];
    for (const [kind, weight] of th.scenery) for (let k = 0; k < weight; k++) pool.push(kind);
    const place = (kind, idx, x, z, y = groundAt(x, z)) => {
      const [c, mpp] = art[kind][idx], r = rects[`${kind}${idx}`];
      const natural = !['billboard', 'building', 'grandstand', 'lamp', 'jump', 'tunnelSign', 'barn', 'boat'].includes(kind);
      GLR.pushSprite(sprites, x, y, z, c.width * mpp, c.height * mpp, r, natural && rnd() < 0.5);
    };
    const clearOfRoad = (x, z, margin) => {
      let ok = true;
      T.nearby(x, z, H + margin, () => { ok = false; });
      return ok;
    };
    const step = Math.max(2, th.gap || 4);
    for (let i = 0; i < n; i += step) for (const s of [-1, 1]) {
      if (rnd() < 0.35) continue;
      const kind = pool[Math.floor(rnd() * pool.length)], list = art[kind], idx = Math.floor(rnd() * list.length);
      const big = kind === 'mesa' || kind === 'building' || kind === 'islet' || kind === 'barn';
      const far = th.water ? 25 + rnd() * 70 : big ? 18 + rnd() * 40 : 4 + rnd() * 22;
      const p = P(i, s * (H + far));
      if (!clearOfRoad(p[0], p[2], big ? 14 : 3.5)) continue;
      place(kind, idx, p[0], p[2]);
    }
    // a grandstand beside the start line
    for (const side of [-1, 1]) {
      const p = P(-6, side * (H + 16));
      if (clearOfRoad(p[0], p[2], 10)) place('grandstand', 0, p[0], p[2]);
    }
    // a JUMP! banner hung over the road before each jump, TUNNEL boards before each tunnel
    for (const j of T.jumps) {
      const p = P(j.g - 14, 0);
      place('jump', 0, p[0], p[2], p[1] + 5.6);
    }
    for (let i = 0; i < n; i++) if (T.tunnel[i] && !T.tunnel[W(i - 1)]) {
      const p = P(i - 20, -(H + 4));
      if (clearOfRoad(p[0], p[2], 3)) place('tunnelSign', 0, p[0], p[2]);
    }

    return {
      mesh: new Float32Array(v), atlas, rects, sprites, groundAt,
      far: Art.backdrop(th.far.kind, th.far.cols, hash(key) % 1000),
      near: th.near ? Art.clouds(hash(key) % 997, th.near.col) : null,
      bounds: [x0, x1, z0, z1],
    };
  }

  return { build, rgb, GROUND_Y, RAIL_H };
})();
