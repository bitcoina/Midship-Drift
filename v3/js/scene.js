'use strict';
// Builds everything static for a course: one big mesh for the road, rails, bridge decks,
// pillars, ground and start gantry, plus the sprite atlas and the roadside scenery.
const Scene = (() => {
  const GROUND_Y = -0.3, RAIL_H = 0.9, RAIL_T = 0.45, DECK = 1.6;

  function rgb(hex, k = 1) {
    const n = parseInt(hex.slice(1), 16);
    return [Math.min(1, ((n >> 16) / 255) * k), Math.min(1, (((n >> 8) & 255) / 255) * k), Math.min(1, ((n & 255) / 255) * k)];
  }

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
      pineSnow: () => [2, 5, 9].map(s => [Art.pine(s, true), M * 1.5]),
      cactus: () => [[Art.cactus(), M * 1.3]],
      boulder: () => [4, 8].map(s => [Art.boulder(s, th.rock), M * 1.1]),
      boulderDark: () => [4, 8].map(s => [Art.boulder(s, '#3a3232'), M * 1.1]),
      mesa: () => [6, 13].map(s => [Art.mesa(s, th.rock), M * 3.2]),
      ember: () => [3, 6, 9].map(s => [Art.emberRock(s), M * 1.4]),
      building: () => [1, 2, 3, 4, 5, 6].map(s => [Art.building(s * 31, ['#3b2a5c', '#2c3557', '#4a2f4f'][s % 3], true), M * 3.2]),
      lamp: () => [[Art.lamp(!!th.stars || key === 'skyway'), M * 1.3]],
      billboard: () => th.boards.map(([t, bg, fg]) => [Art.billboard(t, bg, fg), M * 1.6]),
    };
    const out = {};
    for (const [kind] of th.scenery) out[kind] = kinds[kind]();
    out.grandstand = [[Art.grandstand(hash(key)), M * 1.6]];
    return out;
  }

  // ---------------------------------------------------------------- build
  function build(T, th, key) {
    const v = [];
    const tri = (a, b, c, col) => { for (const p of [a, b, c]) v.push(p[0], p[1], p[2], col[0], col[1], col[2]); };
    const quad = (a, b, c, d, col) => { tri(a, b, c, col); tri(a, c, d, col); };
    const n = T.n, H = T.HALF, W = T.W;

    // Surface point at sample i, lateral offset d (right positive), raised by up.
    const cosb = Float64Array.from(T.bank, Math.cos), sinb = Float64Array.from(T.bank, Math.sin);
    const P = (i, d, up = 0) => {
      i = W(i);
      return [T.xs[i] - T.fz[i] * d * cosb[i], T.h[i] - d * sinb[i] + up, T.zs[i] + T.fx[i] * d * cosb[i]];
    };

    const road = [rgb(th.road[0]), rgb(th.road[1])], rumble = [rgb(th.rumble[0]), rgb(th.rumble[1])];
    const lane = rgb(th.lane), rail = [rgb(th.rail[0]), rgb(th.rail[1])];
    const railDk = [rgb(th.rail[0], 0.7), rgb(th.rail[1], 0.7)];
    const slab = rgb(th.slab), slabDk = rgb(th.slab, 0.65), pillar = rgb(th.pillar), pillarDk = rgb(th.pillar, 0.72);
    const black = [0.08, 0.08, 0.1], white = [0.95, 0.95, 0.95];

    for (let i = 0; i < n; i++) {
      const j = i + 1, blk = Math.floor(i / 4) % 2, rb = Math.floor(i / 2) % 2;
      // road surface: kerb, asphalt, centre line, asphalt, kerb
      const strips = [[-H, -H + 1, rumble[rb]], [-H + 1, -0.25, road[blk]], [-0.25, 0.25, i % 6 < 3 ? lane : road[blk]], [0.25, H - 1, road[blk]], [H - 1, H, rumble[rb]]];
      if (i === 0 || i === 1) {
        for (let c = 0; c < 8; c++) {
          const d0 = -H + c * 2, d1 = d0 + 2;
          quad(P(i, d0), P(i, d1), P(j, d1), P(j, d0), (c + i) % 2 ? black : white);
        }
      } else {
        for (const [d0, d1, col] of strips) quad(P(i, d0), P(i, d1), P(j, d1), P(j, d0), col);
      }
      // crash rails on both sides: inner face, top, outer face
      for (const s of [-1, 1]) {
        const a = s * H, b = s * (H + RAIL_T), col = rail[rb], dk = railDk[rb];
        quad(P(i, a), P(j, a), P(j, a, RAIL_H), P(i, a, RAIL_H), col);
        quad(P(i, a, RAIL_H), P(j, a, RAIL_H), P(j, b, RAIL_H), P(i, b, RAIL_H), rgb(th.rail[rb], 1.15));
        quad(P(i, b), P(j, b), P(j, b, RAIL_H), P(i, b, RAIL_H), dk);
        // deck edge below the road
        if (T.h[i] > 0.4 || T.h[W(j)] > 0.4) quad(P(i, b), P(j, b), P(j, b, -DECK), P(i, b, -DECK), slab);
      }
      if (T.h[i] > 0.4 || T.h[W(j)] > 0.4) {
        const L = -(H + RAIL_T), R = H + RAIL_T;
        quad(P(i, L, -DECK), P(i, R, -DECK), P(j, R, -DECK), P(j, L, -DECK), slabDk);
      }
      // pillars every 18 m under raised road, unless another road runs underneath
      // (closer together near a crossing, so the flyover reads as a proper bridge)
      const nearCross = T.otherRoadBelow(T.xs[i], T.zs[i], i, 30) < T.h[i] - 1;
      const twin = T.h[i] > 14 ? [-4.5, 4.5] : [0];
      if (i % (nearCross ? 3 : 6) === 0 && T.h[i] > 2.4 && T.otherRoadBelow(T.xs[i], T.zs[i], i, H + 2.6 + (twin.length > 1 ? 4.5 : 0)) > T.h[i] - 1) {
        for (const off of twin) {
          const c = P(i, off), r = 1.1, top = T.h[i] - DECK - Math.abs(off * sinb[i]);
          const fx = T.fx[i], fz = T.fz[i], rx = -fz, rz = fx;
          const corner = (a, b, y) => [c[0] + fx * a + rx * b, y, c[2] + fz * a + rz * b];
          const faces = [[[-r, -r], [r, -r]], [[r, -r], [r, r]], [[r, r], [-r, r]], [[-r, r], [-r, -r]]];
          faces.forEach(([p0, p1], k) => {
            quad(corner(...p0, GROUND_Y), corner(...p1, GROUND_Y), corner(...p1, top), corner(...p0, top), k % 2 ? pillar : pillarDk);
          });
        }
      }
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

    // ground: a chequer of big tiles around the course
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, T.xs[i]); x1 = Math.max(x1, T.xs[i]); z0 = Math.min(z0, T.zs[i]); z1 = Math.max(z1, T.zs[i]); }
    const TILE = 30, M = 900, g0 = rgb(th.ground[0]), g1 = rgb(th.ground[1]);
    const gx0 = Math.floor((x0 - M) / TILE), gx1 = Math.ceil((x1 + M) / TILE), gz0 = Math.floor((z0 - M) / TILE), gz1 = Math.ceil((z1 + M) / TILE);
    for (let gx = gx0; gx < gx1; gx++) for (let gz = gz0; gz < gz1; gz++) {
      const a = gx * TILE, b = gz * TILE;
      quad([a, GROUND_Y, b], [a + TILE, GROUND_Y, b], [a + TILE, GROUND_Y, b + TILE], [a, GROUND_Y, b + TILE], (gx + gz) & 1 ? g0 : g1);
    }

    // ---------------------------------------------------------------- sprites
    const art = sceneryArt(th, key);
    const items = {};
    for (const [kind, list] of Object.entries(art)) list.forEach(([c], k) => { items[`${kind}${k}`] = c; });
    for (let f = 0; f < 4; f++) items[`sign${f}`] = Toons.startSign(f);
    items.puff = Toons.puff('#d8d8de'); items.dust = Toons.puff(Art.shade(th.ground[0], 0.1));
    items.sparkY = Toons.spark('#ffd23f'); items.sparkB = Toons.spark('#5ad1ff'); items.sparkR = Toons.spark('#ff6a2a');
    const { atlas, rects } = packAtlas(items);

    const sprites = GLR.spriteBatch(1400), rnd = Art.rng(hash(key) + 11);
    const pool = [];
    for (const [kind, weight] of th.scenery) for (let k = 0; k < weight; k++) pool.push(kind);
    const place = (kind, idx, x, z, y = GROUND_Y) => {
      const [c, mpp] = art[kind][idx], r = rects[`${kind}${idx}`];
      const natural = !['billboard', 'building', 'grandstand', 'lamp'].includes(kind);
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
      const big = kind === 'mesa' || kind === 'building';
      const off = s * (H + (big ? 18 : 4) + rnd() * (big ? 40 : 22));
      const p = P(i, off);
      if (!clearOfRoad(p[0], p[2], big ? 14 : 3.5)) continue;
      place(kind, idx, p[0], p[2]);
    }
    // a grandstand beside the start line
    {
      const p = P(-6, -(H + 16)), q = P(-6, H + 16);
      if (clearOfRoad(p[0], p[2], 10)) place('grandstand', 0, p[0], p[2]);
      if (clearOfRoad(q[0], q[2], 10)) place('grandstand', 0, q[0], q[2]);
    }

    return {
      mesh: new Float32Array(v), atlas, rects, sprites,
      far: Art.backdrop(th.far.kind, th.far.cols, hash(key) % 1000),
      near: th.near ? Art.clouds(hash(key) % 997, th.near.col) : null,
      bounds: [x0, x1, z0, z1],
    };
  }

  return { build, rgb, GROUND_Y, RAIL_H };
})();
