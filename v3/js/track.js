'use strict';
// Track builder for Midship Drift III.
//
// A course outline is a closed curve in the ground plane: either a formula, path(t), or a
// hand-drawn list of points, each with its own height, joined by a smooth spline. The
// builder resamples it into evenly spaced points, works out heading, curvature and
// banking, then looks for places where the course crosses itself. At every crossing one
// branch is lifted on a smooth hump so it clears the other as a bridge.
//
// Drawn courses can also mark tunnels and jumps between their points; see courses.js.
const Track = (() => {
  const SEG = 3;         // metres between samples
  const HALF = 8;        // half the road width
  const CLEAR = 8.5;     // how far an overpass sits above the road it crosses
  const NEAR = 20;       // horizontal distance at which two branches count as crossing
  const TAU = Math.PI * 2;

  // Closed Catmull-Rom spline through [x, z, h] points. Returns [x, z, h, p] where p is
  // the position along the point list (2.5 = halfway between points 2 and 3).
  function spline(pts) {
    const P = pts.length;
    return t => {
      const f = ((t / TAU) * P) % P, i = Math.floor(f), u = f - i;
      const p0 = pts[(i - 1 + P) % P], p1 = pts[i], p2 = pts[(i + 1) % P], p3 = pts[(i + 2) % P];
      const c = k => {
        const a = p0[k] || 0, b = p1[k] || 0, d = p2[k] || 0, e = p3[k] || 0;
        return 0.5 * (2 * b + (-a + d) * u + (2 * a - 5 * b + 4 * d - e) * u * u + (-a + 3 * b - 3 * d + e) * u * u * u);
      };
      return [c(0), c(1), c(2), f];
    };
  }

  function build(course) {
    const drawn = !!course.points, P = drawn ? course.points.length : 1;
    const path = drawn ? spline(course.points) : course.path;

    // 1. Dense outline and its arc length.
    const N = 8000, raw = [], cum = [0];
    for (let k = 0; k < N; k++) raw.push(path((k / N) * TAU));
    for (let k = 1; k <= N; k++) {
      const a = raw[k - 1], b = raw[k % N];
      cum.push(cum[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const rawLen = cum[N], scale = course.length ? course.length / rawLen : 1;
    const len = rawLen * scale, n = Math.round(len / SEG), seg = len / n, L = n * seg;

    // A drawn course can put its start line on one of its points.
    let start = course.start || 0;
    if (drawn && course.startPoint !== undefined) start = cum[Math.round((course.startPoint / P) * N) % N] / rawLen;

    // 2. Resample evenly from the start line. cp is the position along the point list.
    const xs = new Float64Array(n), zs = new Float64Array(n), rawH = new Float64Array(n), cp = new Float64Array(n);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const d = ((start + i / n) % 1) * rawLen;
      if (d < cum[k]) k = 0;
      while (cum[k + 1] < d) k++;
      const t = (d - cum[k]) / (cum[k + 1] - cum[k]), a = raw[k], b = raw[(k + 1) % N];
      xs[i] = (a[0] + (b[0] - a[0]) * t) * scale;
      zs[i] = (a[1] + (b[1] - a[1]) * t) * scale;
      if (drawn) {
        rawH[i] = a[2] + (b[2] - a[2]) * t;
        let db = b[3] - a[3];
        if (db < -P / 2) db += P;
        cp[i] = (a[3] + db * t) % P;
      }
    }
    let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += xs[i]; cz += zs[i]; }
    cx /= n; cz /= n;
    for (let i = 0; i < n; i++) { xs[i] -= cx; zs[i] -= cz; }
    if (course.mirror) for (let i = 0; i < n; i++) xs[i] = -xs[i];

    const W = i => ((i % n) + n) % n;
    // Is sample i between points a and b, going forward round the course?
    const between = (i, a, b) => { const p = cp[i], span = (b - a + P) % P; return (p - a + P) % P < span; };
    // The sample nearest to point a.
    const sampleAt = a => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const d = Math.min(Math.abs(cp[i] - a), P - Math.abs(cp[i] - a)); if (d < bd) { bd = d; best = i; } }
      return best;
    };

    // 3. Heading, right vector and curvature. Right is cross(forward, up), so a
    // positive curvature bends the road to the right.
    const fx = new Float64Array(n), fz = new Float64Array(n), k0 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const dx = xs[W(i + 1)] - xs[W(i - 1)], dz = zs[W(i + 1)] - zs[W(i - 1)], l = Math.hypot(dx, dz);
      fx[i] = dx / l; fz[i] = dz / l;
    }
    for (let i = 0; i < n; i++) {
      const dfx = fx[W(i + 1)] - fx[W(i - 1)], dfz = fz[W(i + 1)] - fz[W(i - 1)];
      k0[i] = (dfx * -fz[i] + dfz * fx[i]) / (2 * seg);
    }
    const curv = smooth(k0, 4, W);

    // 4. Base heights from the course, then bridges at the crossings.
    const base = new Float64Array(n);
    for (let i = 0; i < n; i++) base[i] = rawH[i] + (course.height ? course.height(i / n) : 0);

    const grid = new Map(), CELL = 24;
    const key = (gx, gz) => gx * 73856 + gz;
    for (let i = 0; i < n; i++) {
      const kk = key(Math.floor(xs[i] / CELL), Math.floor(zs[i] / CELL));
      if (!grid.has(kk)) grid.set(kk, []);
      grid.get(kk).push(i);
    }
    const gap = (i, j) => { const d = Math.abs(i - j); return Math.min(d, n - d); };
    function nearby(x, z, r, fn) {
      const g0 = Math.floor((x - r) / CELL), g1 = Math.floor((x + r) / CELL);
      const h0 = Math.floor((z - r) / CELL), h1 = Math.floor((z + r) / CELL);
      for (let gx = g0; gx <= g1; gx++) for (let gz = h0; gz <= h1; gz++) {
        const list = grid.get(key(gx, gz));
        if (list) for (const j of list) if (Math.hypot(xs[j] - x, zs[j] - z) < r) fn(j);
      }
    }

    // Pairs of samples that are close in the plane but far apart along the road.
    const pairs = [];
    for (let i = 0; i < n; i++) {
      nearby(xs[i], zs[i], NEAR, j => { if (j > i && gap(i, j) > 30) pairs.push([i, j]); });
    }
    // Group the pairs into crossings. Indices wrap at the start line, so a crossing
    // there can show up with its two branches either way round; keep them consistent.
    const events = [];
    for (const [i, j] of pairs) {
      let ev = null, swap = false;
      for (const e of events) {
        for (const [a, b] of e.pairs) {
          if (gap(i, a) <= 4 && gap(j, b) <= 4) { ev = e; break; }
          if (gap(i, b) <= 4 && gap(j, a) <= 4) { ev = e; swap = true; break; }
        }
        if (ev) break;
      }
      if (!ev) { ev = { pairs: [] }; events.push(ev); }
      ev.pairs.push(swap ? [j, i] : [i, j]);
    }
    // Centre (by circular mean) and half-width, in samples, of one branch of a crossing.
    const span = idx => {
      let sx = 0, sy = 0;
      for (const k of idx) { const a = (k / n) * TAU; sx += Math.cos(a); sy += Math.sin(a); }
      const c = W(Math.round((Math.atan2(sy, sx) / TAU) * n));
      return [c, Math.max(...idx.map(k => gap(k, c)))];
    };
    for (const ev of events) { ev.A = span(ev.pairs.map(p => p[0])); ev.B = span(ev.pairs.map(p => p[1])); }

    // Lift the chosen branch of each crossing until every crossing has clearance. Two
    // crossings close together can fight (one's ramp raises the other's lower road), so
    // every over/under combination is tried and the lowest one that works is kept.
    function lifted(mask) {
      const h = Float64Array.from(base), lifts = events.map(() => 0);
      const overB = events.map((ev, e) => ((mask >> e) & 1) === 1);
      for (let pass = 0; pass < 8; pass++) {
        let worst = 0;
        events.forEach((ev, e) => {
          let need = 0;
          for (const [i, j] of ev.pairs) need = Math.max(need, CLEAR - (overB[e] ? h[j] - h[i] : h[i] - h[j]));
          if (need > 0.01) { lifts[e] += need + 0.2; worst = Math.max(worst, need); }
        });
        if (worst < 0.01) return { h, ok: true, top: Math.max(...h), overB, lifts };
        const lift = new Float64Array(n);
        events.forEach((ev, e) => {
          if (lifts[e] <= 0) return;
          const [c, half] = overB[e] ? ev.B : ev.A, plateau = half + 5;
          const ramp = Math.max(18, Math.ceil((lifts[e] * 7) / seg));
          for (let d = -Math.ceil(plateau + ramp); d <= Math.ceil(plateau + ramp); d++) {
            const ad = Math.abs(d);
            const v = ad <= plateau ? lifts[e] : lifts[e] * 0.5 * (1 + Math.cos((Math.PI * (ad - plateau)) / ramp));
            const idx = W(c + d);
            lift[idx] = Math.max(lift[idx], v);
          }
        });
        for (let i = 0; i < n; i++) h[i] = base[i] + lift[i];
      }
      return { h, ok: false, top: Infinity, overB, lifts };
    }
    let pick = null;
    const combos = events.length <= 10 ? 1 << events.length : 1;
    for (let mask = 0; mask < combos; mask++) {
      const r = lifted(combos > 1 ? mask : (1 << events.length) - 1);
      if (!pick || r.top < pick.top) pick = r;
    }
    const h = pick.h;
    events.forEach((ev, e) => { ev.overB = pick.overB[e]; ev.over = ev.overB ? ev.B : ev.A; ev.lift = pick.lifts[e]; });
    // Which samples were raised into a bridge (the hillside stays down when they are).
    const raised = Uint8Array.from(h, (v, i) => (v - base[i] > 0.5 ? 1 : 0));

    // 5. Tunnels and jumps on drawn courses.
    // A jump is a ramp that kicks up `rise` metres, then `gap` metres of missing road.
    // Inside the gap the road profile drops away steeply, so anything moving fast
    // enough flies; a car that comes down inside the gap has fallen (see game.js).
    const tunnel = new Uint8Array(n), gapF = new Uint8Array(n), jumps = [];
    if (drawn) {
      for (const [a, b] of course.tunnels || []) for (let i = 0; i < n; i++) if (between(i, a, b)) tunnel[i] = 1;
      for (const j of course.jumps || []) {
        const g = sampleAt(j.at), R = Math.round(38 / seg), G = Math.round(j.gap / seg);
        for (let d = 0; d < R; d++) h[W(g - R + d)] += j.rise * ((d + 1) / R) ** 2;
        const take = h[W(g - 1)];
        for (let d = 0; d < G; d++) { h[W(g + d)] = take - 18 * Math.sin((Math.PI * d) / G); gapF[W(g + d)] = 1; }
        jumps.push({ g, G, s: g * seg });
      }
    }

    // 6. Banking leans the road into corners; slope is the climb per metre.
    const bank = smooth(Float64Array.from(curv, c => Math.max(-0.24, Math.min(0.24, c * 6))), 8, W);
    const slope = new Float64Array(n);
    for (let i = 0; i < n; i++) slope[i] = (h[W(i + 1)] - h[W(i - 1)]) / (2 * seg);
    // At a jump's lip the slope is measured from the ramp side only, and at the far edge
    // from the landing side only, so the drop in the gap doesn't round the lip off and
    // rob the car of its kick.
    for (const j of jumps) {
      for (let d = 1; d <= 2; d++) { const i = W(j.g - d); slope[i] = (h[i] - h[W(i - 1)]) / seg; }
      slope[W(j.g)] = slope[W(j.g - 1)];
      for (let d = 0; d < 2; d++) { const i = W(j.g + j.G + d); slope[i] = (h[W(i + 1)] - h[i]) / seg; }
    }

    // The lowest road (other than this stretch) within r metres of a point, or Infinity.
    function otherRoadBelow(x, z, i, r) {
      let low = Infinity;
      nearby(x, z, r, j => { if (gap(i, j) > 12) low = Math.min(low, h[j]); });
      return low;
    }

    // Everything about the road at distance s along it.
    function at(s, out = {}) {
      s = ((s % L) + L) % L;
      const f = s / seg, i = Math.floor(f) % n, j = W(i + 1), t = f - Math.floor(f);
      const lerp = (arr) => arr[i] + (arr[j] - arr[i]) * t;
      out.i = i; out.t = t;
      out.x = lerp(xs); out.z = lerp(zs); out.y = lerp(h);
      let ax = fx[i] + (fx[j] - fx[i]) * t, az = fz[i] + (fz[j] - fz[i]) * t;
      const l = Math.hypot(ax, az); ax /= l; az /= l;
      out.fx = ax; out.fz = az; out.rx = -az; out.rz = ax;
      out.k = lerp(curv); out.bank = lerp(bank); out.slope = lerp(slope);
      return out;
    }
    // The jump whose gap contains distance s, if any.
    function jumpAt(s) {
      if (!jumps.length) return null;
      const i = Math.floor((((s % L) + L) % L) / seg) % n;
      return gapF[i] ? jumps.find(j => gap(i, j.g + j.G / 2) <= j.G / 2 + 1) || null : null;
    }

    const T = {
      n, seg, L, xs, zs, h, fx, fz, curv, bank, slope, events, HALF, W, gap,
      at, otherRoadBelow, nearby, tunnel, gapF, jumps, jumpAt, raised, cp,
    };
    if (course.start !== undefined || course.startPoint !== undefined || course._picked) return T;
    // No start given: put the line on the straightest flat stretch, so the grid sits
    // well behind it and the first bridge is a little way after it.
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      let score = 0;
      for (let d = -Math.round(90 / seg); d <= Math.round(50 / seg); d++) {
        const j = W(i + d);
        score += Math.abs(curv[j]) * 400 + Math.abs(slope[j]) * 30 + (h[j] - base[j] > 0.5 ? 3 : 0);
      }
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return build(Object.assign({}, course, { start: best / n, _picked: true }));
  }

  function smooth(arr, r, W) {
    const n = arr.length, out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += arr[W(i + d)];
      out[i] = s / (2 * r + 1);
    }
    return out;
  }

  return { build, SEG, HALF, CLEAR };
})();

if (typeof module !== 'undefined') module.exports = Track;
