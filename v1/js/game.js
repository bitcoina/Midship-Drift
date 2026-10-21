'use strict';
// Midship Drift: a sprite-scaling arcade racer.
//
// The road is a loop of short segments, each with a curve and a road/ground height.
// Every frame the segments ahead are projected to the screen and painted back to
// front, which lets the road float above the ground on pillars, with scenery and
// cars layered correctly around it.
(() => {
  // ---------------------------------------------------------------- constants
  const H = 224, HALF_H = H / 2, UNIT = 192;          // UNIT: horizontal projection scale
  let W = 384, HALF_W = W / 2;                          // width follows the window's aspect
  const SEG = 200, ROAD = 1000, RUMBLE = 3, LANES = 3;
  const CAM_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
  const CAM_H = 950, PLAYER_Z = Math.round(CAM_H * CAM_DEPTH * 1.3);   // car sits a little above the bottom edge
  const DRAW = 280, FOG_DENSITY = 2.6;
  const MAX_SPEED = SEG * 60;                            // 290 km/h on the dial
  const ACCEL = MAX_SPEED / 4.2, BRAKE = -MAX_SPEED * 1.1, DECEL = -MAX_SPEED / 6;
  const OFFROAD_DECEL = -MAX_SPEED / 1.4, OFFROAD_LIMIT = MAX_SPEED / 3.4;
  const CENTRIFUGAL = 0.25, GRAVITY = 24000;
  const CAR_W = Math.round(72 * PLAYER_Z / (CAM_DEPTH * UNIT));   // player car draws at exactly 1:1 pixels
  const CAR_X = CAR_W / ROAD, CAR_LEN = 420;
  const SLAB = 260, RAIL_H = 150, RAIL_X = 1.12, RAIL_LIMIT = 0.9;
  const LAPS = 4, START_SEG = 40, GRID = 12;
  const LOW_GEAR_TOP = 0.42;
  const POINTS = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0, 0];
  const SCENERY_SCALE = 12;

  const PAINTS = [
    ['Super Red', '#d01f26'], ['Super White', '#ecebe3'], ['Black', '#1d1e22'], ['Sunburst Yellow', '#f2c21b'],
    ['Blue Mica', '#2f55a8'], ['Silver', '#aab0ba'], ['Forest Green', '#1f5a3a'], ['Orange', '#f07a1a'],
  ];
  const GENS = [
    ['aw11', 'MK1 AW11', '1984-89 wedge'],
    ['sw20', 'MK2 SW20', '1989-99 coupe'],
    ['w30', 'MK3 ZZW30', '1999-07 roadster'],
  ];

  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- settings
  const STORE_KEY = 'midship-drift.v1';
  const settings = (() => {
    const base = { model: 'aw11', color: '#d01f26', best: {} };
    try { return Object.assign(base, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (_) { return base; }
  })();
  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (_) { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIn = (a, b, p) => a + (b - a) * p * p;
  const easeInOut = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
  const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

  function fmtTime(t) {
    if (!isFinite(t)) return "-'--\"--";
    const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
    return `${m}'${String(s).padStart(2, '0')}"${String(c).padStart(2, '0')}`;
  }
  const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'ST' : n % 10 === 2 && n !== 12 ? 'ND' : n % 10 === 3 && n !== 13 ? 'RD' : 'TH');

  const rgbCache = new Map();
  function hexRgb(hex) {
    let v = rgbCache.get(hex);
    if (!v) { const n = parseInt(hex.slice(1), 16); v = [n >> 16, (n >> 8) & 255, n & 255]; rgbCache.set(hex, v); }
    return v;
  }
  const fogCache = new Map();
  function fogged(hex, level) {
    if (level <= 0) return hex;
    const key = hex + state.theme.fog + level;
    let s = fogCache.get(key);
    if (!s) {
      const a = hexRgb(hex), b = hexRgb(state.theme.fog), t = level / 16;
      s = `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
      fogCache.set(key, s);
    }
    return s;
  }
  const FOG = new Uint8Array(DRAW + 1);
  for (let k = 0; k <= DRAW; k++) FOG[k] = Math.min(14, Math.round(16 * (1 - Math.exp(-Math.pow(k / DRAW, 2) * FOG_DENSITY))));

  // ---------------------------------------------------------------- track building
  const trackCache = {};
  function buildTrack(course) {
    if (trackCache[course.id]) return trackCache[course.id];
    const segs = [];
    const lastY = () => (segs.length ? segs[segs.length - 1].y2 : 0);
    const lastG = () => (segs.length ? segs[segs.length - 1].g2 : 0);
    function push(curve, y, g) {
      const i = segs.length;
      segs.push({ i, curve, y1: lastY(), y2: y, g1: lastG(), g2: Math.min(g, y), sprites: [], cars: [], checker: false });
    }
    function section(n, curve, h, gd) {
      const sy = lastY(), sg = lastG(), ey = h * 100, eg = (gd === undefined ? h : gd) * 100;
      const enter = Math.max(1, Math.round(n * 0.25)), leave = enter, hold = Math.max(0, n - enter * 2), total = enter + hold + leave;
      for (let k = 0; k < total; k++) {
        const c = k < enter ? easeIn(0, curve, k / enter) : k < enter + hold ? curve : easeInOut(curve, 0, (k - enter - hold) / leave);
        const p = (k + 1) / total;
        push(c, easeInOut(sy, ey, p), easeInOut(sg, eg, p));
      }
    }
    for (const s of course.sections) {
      if (s.jump) {
        const h = lastY() / 100;
        section(10, 0, h + s.jump);
        section(10, 0, h);
      } else section(...s);
    }
    if (lastY() !== 0 || lastG() !== 0) section(40, 0, 0, 0);
    for (const s of segs) s.lifted = s.y1 - s.g1 > 150 || s.y2 - s.g2 > 150;
    segs[START_SEG].checker = segs[START_SEG + 1].checker = true;
    const track = { segs, N: segs.length, L: segs.length * SEG, startZ: START_SEG * SEG, course };
    decorate(track, THEMES[course.theme], themeAssets(course.theme));
    trackCache[course.id] = track;
    return track;
  }

  function decorate(track, theme, A) {
    const r = Art.rng(hash(track.course.id)), { segs, N } = track;
    const add = (i, list, x) => {
      const spr = list[Math.floor(r() * list.length)];
      segs[((i % N) + N) % N].sprites.push({ ...spr, x });
    };
    const weights = theme.scenery, total = weights.reduce((a, w) => a + w[1], 0);
    const pick = () => { let v = r() * total; for (const [k, w] of weights) { if ((v -= w) < 0) return k; } return weights[0][0]; };
    const nearStart = i => i > START_SEG - 8 && i < START_SEG + 18;

    for (let i = 0; i < N; i += theme.gap) {
      if (nearStart(i)) continue;
      const lifted = segs[i].lifted;
      if (lifted && !theme.underScenery) continue;
      for (const side of [-1, 1]) {
        if (r() > 0.7) continue;
        const kind = pick();
        if (kind === 'billboard' && lifted) continue;
        const far = kind === 'mesa' || kind === 'building';
        const dist = lifted ? 1.6 + r() * 4 : far ? 2.4 + r() * 3 : 1.35 + r() * 2.4;
        add(i + Math.floor(r() * theme.gap), A[kind], side * dist);
      }
    }
    for (let i = 0; i < N; i += 5) {
      const s = segs[i];
      if (!s.lifted && Math.abs(s.curve) >= 3 && !nearStart(i)) add(i, s.curve > 0 ? A.chevR : A.chevL, s.curve > 0 ? -1.3 : 1.3);
    }
    for (let i = 70, side = 1; i < N - 20; i += 90, side = -side) {
      if (!segs[i].lifted && !nearStart(i)) add(i, A.billboard, side * 1.5);
    }
    segs[START_SEG].sprites.push({ ...A.gantry[0], x: 0, onRoad: true });
    for (let i = START_SEG - 6; i < START_SEG + 16; i += 11) {
      add(i, A.grandstand, -2.6);
      add(i + 5, A.grandstand, 2.6);
    }
    for (let i = START_SEG - 4; i < START_SEG + 18; i += 4) {
      add(i, A.cone, -1.25); add(i, A.cone, 1.25);
    }
  }

  // ---------------------------------------------------------------- theme assets
  const assetCache = {};
  function themeAssets(key) {
    if (assetCache[key]) return assetCache[key];
    const th = THEMES[key];
    const mk = (img, scale, cw, solid = true) => ({ img, w: img.width * scale, cw, solid });
    const S = SCENERY_SCALE;
    const A = {
      palm: [3, 7, 11].map(s => mk(Art.palm(s), S * 1.2, 0.14)),
      pineSnow: [2, 5, 9].map(s => mk(Art.pine(s, true), S * 1.3, 0.25)),
      cactus: [mk(Art.cactus(), S * 1.1, 0.16)],
      boulder: [4, 8].map(s => mk(Art.boulder(s, th.rock), S, 0.45)),
      boulderDark: [4, 8].map(s => mk(Art.boulder(s, '#3a3232'), S, 0.45)),
      mesa: [6, 13].map(s => mk(Art.mesa(s, th.rock), S * 2.2, 1.6)),
      ember: [3, 6, 9].map(s => mk(Art.emberRock(s), S * 1.2, 0.45)),
      building: [1, 2, 3, 4, 5, 6].map(s => mk(Art.building(s * 31, ['#3b2a5c', '#2c3557', '#4a2f4f'][s % 3], true), S * 2.6, 1.2)),
      lamp: [mk(Art.lamp(th.stars || key === 'skyway'), S * 1.1, 0.06)],
      billboard: th.boards.map(([t, bg, fg]) => mk(Art.billboard(t, bg, fg), S * 1.3, 0.75)),
      chevL: [mk(Art.chevron(-1), S, 0.1)],
      chevR: [mk(Art.chevron(1), S, 0.1)],
      cone: [mk(Art.cone(), S * 0.8, 0.05, false)],
      grandstand: [mk(Art.grandstand(hash(key)), S * 1.15, 2)],
      gantry: [mk(Art.gantry(), (RAIL_X * 2.15 * ROAD) / 240, 0, false)],
      far: Art.backdrop(th.far.kind, th.far.cols, hash(key) % 1000),
      near: th.near ? Art.clouds(hash(key) % 997, th.near.col) : null,
      stars: [],
    };
    if (th.stars) {
      const r = Art.rng(77);
      for (let i = 0; i < 90; i++) A.stars.push([r() * 520, r() * 100, r()]);
    }
    assetCache[key] = A;
    return A;
  }

  // ---------------------------------------------------------------- canvases
  const screen = document.getElementById('screen');
  const sctx = screen.getContext('2d');
  const scene = document.createElement('canvas');
  const g = scene.getContext('2d');
  let view = { scale: 1, x: 0, y: 0, w: 0, h: 0, dpr: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.floor(window.innerWidth * dpr), ch = Math.floor(window.innerHeight * dpr);
    screen.width = cw; screen.height = ch;
    W = clamp(Math.round((H * cw / ch) / 2) * 2, 300, 520);
    HALF_W = W / 2;
    scene.width = W; scene.height = H;
    g.imageSmoothingEnabled = false;
    const scale = Math.min(cw / W, ch / H);
    view = { scale, w: W * scale, h: H * scale, x: (cw - W * scale) / 2, y: (ch - H * scale) / 2, dpr };
    skyGradKey = '';
    const portrait = window.innerHeight > window.innerWidth && isTouch;
    ui.rotate.hidden = !portrait;
  }

  // ---------------------------------------------------------------- state
  const state = {
    mode: 'title', attract: true, paused: false,
    courseIdx: 0, track: null, theme: THEMES.coast, A: null,
    cars: [], player: null,
    countdown: 0, lastCount: 0, raceTime: 0, finishTimer: 0, finishOrder: [],
    camX: 0, camY: CAM_H, camZ: 0, skyOffset: 0, shake: 0,
    msg: null, particles: [], champ: null, playerScreen: { x: 0, y: 0, w: 0 },
    gear: 0, scrapeCooldown: 0, flash: 0,
  };

  let rivalFrames = null;
  function playerFrames() {
    return Art.carFrames(settings.model, settings.color, 'LEO');
  }

  const segAt = z => state.track.segs[Math.floor(z / SEG) % state.track.N];
  const wrapZ = z => { const L = state.track.L; return ((z % L) + L) % L; };
  const wrapDist = d => { const L = state.track.L; return ((((d % L) + L * 1.5) % L) - L / 2); };
  function roadYAt(z) { const s = segAt(z), p = (z % SEG) / SEG; return lerp(s.y1, s.y2, p); }
  function groundYAt(z) { const s = segAt(z), p = (z % SEG) / SEG; return lerp(s.g1, s.g2, p); }
  function progress(c) {
    const { L, startZ } = state.track;
    let rel = ((c.z - startZ) % L + L) % L;
    if (!c.armed && rel > L * 0.6) rel -= L;
    return c.lap * L + rel;
  }

  function newRace(courseIdx, attract) {
    const course = COURSES[courseIdx];
    state.courseIdx = courseIdx;
    state.attract = attract;
    state.theme = THEMES[course.theme];
    state.A = themeAssets(course.theme);
    state.track = buildTrack(course);
    for (const s of state.track.segs) s.cars.length = 0;
    if (!rivalFrames) rivalFrames = RIVALS.map(r => Art.carFrames(r.model, r.color));

    const diff = attract ? 0.93 : 0.94 + 0.014 * courseIdx;
    const order = RIVALS.map((r, i) => ({ ...r, frames: rivalFrames[i] }));
    order.push({ name: 'LEO', model: settings.model, color: settings.color, frames: playerFrames(), isPlayer: true, skill: 1 });

    const { startZ } = state.track;
    state.cars = order.map((d, k) => {
      const row = Math.floor(k / 2), x = k % 2 ? 0.42 : -0.42;
      const z = startZ - SEG * 2 - row * SEG * 3;
      return {
        name: d.name, model: d.model, color: d.color, frames: d.frames, isPlayer: !!d.isPlayer,
        z, x, lane: x, laneTimer: 2 + Math.random() * 4, speed: 0, top: MAX_SPEED * d.skill * diff,
        alt: 0, vy: 0, air: false, grounded: true, airTime: 0, lap: 0, armed: true, finished: false, finishTime: 0,
        lapStart: 0, bestLap: Infinity, lastLap: 0, steer: 0, pose: 0, seg: null, auto: attract,
      };
    });
    state.player = state.cars[state.cars.length - 1];
    for (const c of state.cars) c.alt = roadYAt(c.z);
    state.countdown = attract ? 0 : 3.999;
    state.lastCount = 4;
    state.raceTime = 0;
    state.finishTimer = 0;
    state.finishOrder = [];
    state.particles.length = 0;
    state.camX = state.player.x * ROAD;
    state.camY = state.player.alt + CAM_H;
    state.camZ = wrapZ(state.player.z - PLAYER_Z);
    state.msg = attract ? null : { text: course.name.toUpperCase(), sub: `${LAPS} LAPS`, t: 2.5 };
    state.gear = 0;
    state.mode = 'race';
    state.paused = false;
    if (!attract) { Sound.startEngine(); Sound.startMusic(); } else Sound.stopEngine();
  }

  // ---------------------------------------------------------------- input
  const keys = { left: false, right: false, up: false, down: false };
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', KeyZ: 'up', ArrowDown: 'down', KeyS: 'down', KeyX: 'down',
  };
  const isTouch = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  window.addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    const racing = state.mode === 'race' && !state.attract && !state.paused;
    if (k && racing) { keys[k] = true; e.preventDefault(); return; }
    if ((e.code === 'Escape' || e.code === 'KeyP') && state.mode === 'race' && !state.attract) { togglePause(); e.preventDefault(); return; }
    if (e.code === 'KeyM') { Sound.toggleMusic(); return; }
    if (!racing && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) { moveFocus(e.code === 'ArrowDown' ? 1 : -1); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state.mode === 'race' && !state.attract && !state.paused) togglePause(); });

  // ---------------------------------------------------------------- update
  function update(dt) {
    if (state.mode !== 'race' || state.paused) return;
    const { player } = state;

    if (state.countdown > 0) {
      state.countdown -= dt;
      const n = Math.ceil(state.countdown);
      if (n !== state.lastCount) {
        state.lastCount = n;
        if (n > 0) { Sound.beep(false); state.msg = { text: String(n), t: 0.9, big: true }; }
        else { Sound.beep(true); state.msg = { text: 'GO!', t: 1, big: true }; }
      }
    } else state.raceTime += dt;

    for (const s of state.track.segs) if (s.cars.length) s.cars.length = 0;
    for (const c of state.cars) {
      if (c.isPlayer) updatePlayer(c, dt); else updateAI(c, dt);
    }
    collide(dt);
    for (const c of state.cars) {
      c.seg = segAt(c.z);
      c.seg.cars.push(c);
    }

    // camera
    state.camZ = wrapZ(player.z - PLAYER_Z);
    state.camX += (player.x * ROAD - state.camX) * Math.min(1, dt * 10);
    state.camY += (player.alt + CAM_H - state.camY) * Math.min(1, dt * 9);
    state.camY = clamp(state.camY, player.alt + CAM_H * 0.6, player.alt + CAM_H * 1.35);
    state.camY = Math.max(state.camY, roadYAt(state.camZ) + 320);
    state.skyOffset += player.seg.curve * (player.speed * dt / SEG) * 0.0025;

    if (state.msg && (state.msg.t -= dt) <= 0) state.msg = null;
    state.shake = Math.max(0, state.shake - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.scrapeCooldown -= dt;

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    if (state.finishTimer > 0 && (state.finishTimer -= dt) <= 0) showResults();
  }

  function spawn(n, x, y, col, opts = {}) {
    for (let i = 0; i < n; i++) {
      state.particles.push({
        x: x + (Math.random() - 0.5) * (opts.spread || 8), y,
        vx: (Math.random() - 0.5) * (opts.vx || 30), vy: -(opts.vy || 20) * Math.random(),
        g: opts.g || 0, life: (opts.life || 0.5) * (0.5 + Math.random() * 0.5), max: opts.life || 0.5,
        col, size: opts.size || 2,
      });
    }
  }

  // Cars follow the road while grounded; if the road falls away faster than gravity
  // can pull them down (a crest taken at speed), they leave it and fly.
  function vertical(c, dt) {
    // vy still holds last frame's climb rate, so a car cresting a rise keeps going up.
    const ry = roadYAt(c.z), slope = (c.seg.y2 - c.seg.y1) / SEG;
    c.alt += c.vy * dt;
    c.vy -= GRAVITY * dt;
    if (c.alt <= ry) {
      const impact = c.vy - slope * c.speed;
      const wasHigh = !c.grounded && c.airTime > 0.25;
      c.alt = ry;
      c.grounded = true;
      c.vy = slope * c.speed;
      if (wasHigh && impact < -2500) {
        c.vy -= impact * 0.25;
        c.grounded = false;
        if (c.isPlayer && !state.attract) {
          const strength = Math.min(1, -impact / 9000);
          Sound.land(strength);
          state.shake = Math.max(state.shake, 0.15 + strength * 0.3);
          const ps = state.playerScreen;
          spawn(10, ps.x, ps.y, '#ffd27a', { spread: ps.w, vx: 120, vy: 60, g: 200, life: 0.4 });
          c.speed *= 0.97;
        }
      }
      c.airTime = 0;
    } else {
      c.grounded = false;
      c.airTime = (c.airTime || 0) + dt;
    }
    c.air = !c.grounded && c.alt - ry > 30;
  }

  function advance(c, dz) {
    const { L, startZ } = state.track;
    const before = ((c.z - startZ) % L + L) % L;
    c.z = wrapZ(c.z + dz);
    const after = ((c.z - startZ) % L + L) % L;
    if (after > L * 0.4 && after < L * 0.6) c.armed = true;
    if (c.armed && dz > 0 && after < before && before > L * 0.5) {
      c.armed = false;
      c.lap++;
      onLap(c);
    }
  }

  function onLap(c) {
    if (c.lap > 1) {
      c.lastLap = state.raceTime - c.lapStart;
      c.bestLap = Math.min(c.bestLap, c.lastLap);
    }
    c.lapStart = state.raceTime;
    if (state.attract) return;
    if (c.lap > LAPS && !c.finished) {
      c.finished = true;
      c.finishTime = state.raceTime;
      state.finishOrder.push(c);
      if (c.isPlayer) {
        c.auto = true;
        state.finishTimer = 3.5;
        const pos = state.finishOrder.length;
        state.msg = { text: 'FINISH!', sub: ordinal(pos) + ' PLACE', t: 3.5, big: true };
        Sound.beep(true);
      }
    }
    if (!c.isPlayer || c.finished) return;
    const course = COURSES[state.courseIdx];
    let sub = c.lap > 1 ? 'LAP ' + fmtTime(c.lastLap) : '';
    if (c.lap > 1 && c.lastLap < (settings.best[course.id] || Infinity)) {
      settings.best[course.id] = c.lastLap;
      saveSettings();
      sub = 'BEST LAP ' + fmtTime(c.lastLap);
    }
    if (c.lap === LAPS) state.msg = { text: 'FINAL LAP', sub, t: 2.2 };
    else if (c.lap > 1) state.msg = { text: 'LAP ' + c.lap, sub, t: 2 };
  }

  function lookAheadCurve(seg, from, to) {
    const { segs, N } = state.track;
    let sum = 0;
    for (let k = from; k < to; k++) sum += segs[(seg.i + k) % N].curve;
    return sum / (to - from);
  }

  function blockingCar(c, range) {
    let best = null, bestDz = range;
    for (const o of state.cars) {
      if (o === c) continue;
      const dz = wrapDist(o.z - c.z);
      if (dz > 0 && dz < bestDz && Math.abs(o.x - c.x) < CAR_X * 1.3) { best = o; bestDz = dz; }
    }
    return best ? { car: best, dz: bestDz } : null;
  }

  function updatePlayer(p, dt) {
    p.seg = segAt(p.z);
    const seg = p.seg, sp = p.speed / MAX_SPEED, dx = dt * 2 * sp;
    let steerIn, throttle, brake;
    if (p.auto) {
      const need = sp * seg.curve * CENTRIFUGAL;
      let target = clamp(lookAheadCurve(seg, 2, 16) * 0.08, -0.4, 0.4);
      const block = blockingCar(p, SEG * 8);
      if (block) target = block.car.x > 0 ? block.car.x - 0.6 : block.car.x + 0.6;
      steerIn = clamp(need + (target - p.x) * 2.5, -1, 1);
      throttle = Math.abs(need) < 0.95 || sp < 0.6 ? 1 : 0;
      brake = 0;
    } else {
      steerIn = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
      throttle = keys.up ? 1 : 0;
      brake = keys.down ? 1 : 0;
    }
    const racing = state.countdown <= 0;
    p.steer += (steerIn - p.steer) * Math.min(1, dt * (p.auto ? 6 : 9));

    if (racing) {
      p.x += p.steer * dx * (p.air ? 0.35 : 1);
      p.x -= dx * sp * seg.curve * CENTRIFUGAL;
      if (!p.air) {
        if (throttle) p.speed += ACCEL * dt * (1.15 - 0.6 * sp);
        else if (brake) p.speed += BRAKE * dt;
        else p.speed += DECEL * dt;
      } else p.speed -= p.speed * 0.02 * dt;
    }

    const ps = state.playerScreen;
    if (seg.lifted) {
      if (Math.abs(p.x) > 1.25) { p.speed *= 0.3; Sound.crash(); state.shake = 0.6; }
      if (Math.abs(p.x) > RAIL_LIMIT) {
        p.x = Math.sign(p.x) * RAIL_LIMIT;
        p.speed -= p.speed * dt * 1.4;
        if (sp > 0.2) {
          spawn(2, ps.x + Math.sign(p.x) * ps.w * 0.45, ps.y - ps.w * 0.2, Math.random() < 0.5 ? '#fff3a0' : '#ffb02e', { vx: 160, vy: 80, g: 300, life: 0.3, size: 1 });
          if (state.scrapeCooldown <= 0) { Sound.scrape(); state.scrapeCooldown = 0.12; }
          state.shake = Math.max(state.shake, 0.08);
        }
      }
    } else if (Math.abs(p.x) > 1.05 && !p.air) {
      if (p.speed > OFFROAD_LIMIT) p.speed += OFFROAD_DECEL * dt;
      if (sp > 0.1) {
        spawn(1, ps.x + (Math.random() - 0.5) * ps.w, ps.y, state.theme.ground[0], { vx: 40, vy: 50, g: 120, life: 0.5, size: 3 });
        state.shake = Math.max(state.shake, 0.05);
      }
    }
    p.x = clamp(p.x, -3.2, 3.2);

    // scenery collisions
    if (!seg.lifted && !p.air && Math.abs(p.x) > 1) {
      for (const s of [seg, state.track.segs[(seg.i + 1) % state.track.N]]) {
        for (const spr of s.sprites) {
          if (!spr.solid || spr.onRoad) continue;
          if (Math.abs(p.x - spr.x) < (CAR_X + spr.cw) / 2) {
            p.speed = Math.min(p.speed, MAX_SPEED * 0.12);
            p.x += Math.sign(p.x) * -0.25;
            Sound.crash();
            state.shake = 0.5;
            state.flash = 0.12;
            spawn(14, ps.x, ps.y - ps.w * 0.3, '#ffffff', { spread: ps.w, vx: 160, vy: 120, g: 260, life: 0.6, size: 2 });
          }
        }
      }
    }

    p.speed = clamp(p.speed, 0, MAX_SPEED);
    advance(p, p.speed * dt);
    p.seg = segAt(p.z);
    vertical(p, dt);

    const drifting = !p.air && sp > 0.55 && Math.abs(seg.curve) > 2.5 && Math.abs(p.steer) > 0.5 && Math.sign(p.steer) === Math.sign(seg.curve);
    p.pose = clamp(Math.round(p.steer * 1.3 + (drifting ? Math.sign(p.steer) * 0.8 : 0)), -2, 2);
    if (drifting && Math.random() < 0.7) {
      spawn(1, ps.x + (Math.random() < 0.5 ? -1 : 1) * ps.w * 0.32, ps.y, 'rgba(235,235,235,0.7)', { vx: 30, vy: 25, life: 0.6, size: 4 });
    }

    // gearbox (automatic, two speeds) and engine note
    const gear = sp < LOW_GEAR_TOP - 0.02 ? 0 : sp > LOW_GEAR_TOP + 0.02 ? 1 : state.gear;
    if (gear !== state.gear && !state.attract) Sound.blip();
    state.gear = gear;
    if (!state.attract) {
      let rpm = gear === 0 ? sp / LOW_GEAR_TOP : (sp - 0.25) / 0.75;
      if (!racing || p.air) rpm = Math.max(rpm, throttle ? 0.85 : 0.1);
      Sound.setEngine(clamp(rpm, 0.05, 1), throttle);
      Sound.setSkid(drifting ? 0.6 + Math.random() * 0.2 : brake && sp > 0.3 ? 0.4 : 0);
    }
  }

  function updateAI(c, dt) {
    c.seg = segAt(c.z);
    const seg = c.seg, p = state.player;
    let target = c.top * (1 - Math.min(0.22, Math.abs(seg.curve) * 0.03));
    if (!state.attract && !p.finished) {
      const gap = progress(c) - progress(p);
      if (gap > SEG * 30) target *= 0.93;
      else if (gap < -SEG * 45) target *= 1.06;
    }
    if (state.countdown > 0) target = 0;

    if ((c.laneTimer -= dt) <= 0) {
      c.lane = [-0.55, 0, 0.55][Math.floor(Math.random() * 3)];
      c.laneTimer = 3 + Math.random() * 4;
    }
    let desired = c.lane;
    const block = blockingCar(c, SEG * 10);
    if (block) {
      const o = block.car;
      desired = o.x > 0.1 ? o.x - 0.62 : o.x < -0.1 ? o.x + 0.62 : (c.x >= o.x ? 0.62 : -0.62);
      if (block.dz < SEG * 2.5) target = Math.min(target, o.speed * 0.98);
    }
    desired = clamp(desired, -0.78, 0.78);

    if (!c.air) {
      if (c.speed < target) c.speed = Math.min(target, c.speed + ACCEL * 0.9 * dt * (1.15 - 0.6 * c.speed / MAX_SPEED));
      else c.speed = Math.max(target, c.speed + DECEL * 1.5 * dt);
    }
    const move = clamp(desired - c.x, -1, 1) * dt * 1.1 * Math.min(1, c.speed / (MAX_SPEED * 0.3));
    c.x += move;
    c.pose = clamp(Math.round(seg.curve * 0.3 + move * 60), -2, 2);
    advance(c, c.speed * dt);
    c.seg = segAt(c.z);
    vertical(c, dt);
  }

  function collide() {
    const p = state.player;
    for (const c of state.cars) {
      if (c === p) continue;
      if (Math.abs(c.alt - p.alt) > 220 || Math.abs(c.x - p.x) > CAR_X * 0.92) continue;
      const dz = wrapDist(c.z - p.z);
      if (dz > 0 && dz < CAR_LEN && p.speed > c.speed) {
        p.speed = c.speed * 0.9;
        p.z = wrapZ(c.z - CAR_LEN);
        p.x += (p.x >= c.x ? 1 : -1) * 0.05;
        c.x -= (p.x >= c.x ? 1 : -1) * 0.04;
        if (!state.attract) { Sound.bump(0.8); state.shake = Math.max(state.shake, 0.25); }
      } else if (dz < 0 && dz > -CAR_LEN && c.speed > p.speed) {
        c.speed = p.speed * 0.92;
        c.z = wrapZ(p.z - CAR_LEN);
        p.speed = Math.min(MAX_SPEED, p.speed + 300);
        if (!state.attract) { Sound.bump(0.5); state.shake = Math.max(state.shake, 0.15); }
      }
    }
  }

  // ---------------------------------------------------------------- render
  const PX = new Float32Array(DRAW + 2), PY = new Float32Array(DRAW + 2), PG = new Float32Array(DRAW + 2);
  const PW = new Float32Array(DRAW + 2), PS = new Float32Array(DRAW + 2), PZ = new Float32Array(DRAW + 2);
  let skyGrad = null, skyGradKey = '';

  function quad(x1, y1, x2, y2, x3, y3, x4, y4, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4);
    g.closePath();
    g.fill();
  }

  function drawBackground() {
    const th = state.theme, A = state.A;
    const key = th.sky.join() + W;
    if (key !== skyGradKey) {
      skyGrad = g.createLinearGradient(0, 0, 0, HALF_H + 4);
      skyGrad.addColorStop(0, th.sky[0]); skyGrad.addColorStop(0.55, th.sky[1]); skyGrad.addColorStop(1, th.sky[2]);
      skyGradKey = key;
    }
    g.fillStyle = skyGrad;
    g.fillRect(0, 0, W, HALF_H + 4);

    const t = performance.now() / 1000;
    for (const [x, y, b] of A.stars) {
      const sx = ((x - state.skyOffset * 120) % 520 + 520) % 520;
      if (sx > W) continue;
      g.fillStyle = (b + Math.sin(t * 2 + x)) > 1.2 ? '#ffffff' : '#8ea0d8';
      g.fillRect(Math.floor(sx), Math.floor(y), 1, 1);
    }
    if (th.sun) {
      const sx = ((th.sun.x - state.skyOffset * 200) % (W + 120) + W + 120) % (W + 120) - 60;
      Art.disc(g, sx, th.sun.y, th.sun.r + 3, 'rgba(255,240,200,0.25)');
      Art.disc(g, sx, th.sun.y, th.sun.r, th.sun.col);
    }
    const tile = (img, offset, y) => {
      const iw = img.width;
      let x = -(((offset % iw) + iw) % iw);
      for (; x < W; x += iw) g.drawImage(img, Math.floor(x), Math.floor(y));
    };
    if (A.near && th.near.kind === 'clouds') tile(A.near, state.skyOffset * 260, 6);
    tile(A.far, state.skyOffset * 140, HALF_H + 4 - A.far.height);
    g.fillStyle = fogged(th.ground[0], 14);
    g.fillRect(0, HALF_H, W, HALF_H);
  }

  // Distant sprites fade toward the fog colour like the road does, in a few cached steps.
  const fogImgCache = new Map();
  function fogImg(img, level) {
    const q = level < 6 ? 0 : Math.min(3, Math.floor((level - 3) / 3));
    if (!q) return img;
    let entry = fogImgCache.get(img);
    if (!entry || entry.fog !== state.theme.fog) { entry = { fog: state.theme.fog, v: [] }; fogImgCache.set(img, entry); }
    if (!entry.v[q]) {
      const [c, cg] = Art.canvas(img.width, img.height);
      cg.drawImage(img, 0, 0);
      cg.globalCompositeOperation = 'source-atop';
      cg.globalAlpha = q * 0.27;
      cg.fillStyle = state.theme.fog;
      cg.fillRect(0, 0, c.width, c.height);
      entry.v[q] = c;
    }
    return entry.v[q];
  }

  function drawSprite(spr, k) {
    const sc = PS[k];
    const w = sc * spr.w * UNIT, h = w * spr.img.height / spr.img.width;
    const x = PX[k] + sc * spr.x * ROAD * UNIT - w / 2;
    const base = spr.onRoad ? PY[k] : PG[k];
    if (x > W || x + w < 0 || base - h > H || w < 0.6) return;
    g.drawImage(fogImg(spr.img, FOG[k]), Math.round(x), Math.round(base - h), Math.round(w) || 1, Math.round(h) || 1);
  }

  function drawCar(c, k) {
    const zr = PZ[k] + ((c.z % SEG) / SEG) * SEG;
    const pct = (c.z % SEG) / SEG;
    let sc, cx, roadY;
    if (c.isPlayer) {
      sc = CAM_DEPTH / PLAYER_Z;
    } else {
      if (zr <= 40) return;
      sc = CAM_DEPTH / zr;
    }
    cx = lerp(PX[k], PX[k + 1], pct) + sc * c.x * ROAD * UNIT;
    roadY = HALF_H - sc * (roadYAt(c.z) - state.camY) * HALF_H;
    const w = sc * CAR_W * UNIT, h = w * Art.CAR_H / Art.CAR_W;
    let cy = HALF_H - sc * (c.alt - state.camY) * HALF_H;
    if (cx + w < 0 || cx - w > W || cy - h > H) return;
    if (c.isPlayer && !c.air && c.speed > MAX_SPEED * 0.25 && !reducedMotion) {
      const offroad = Math.abs(c.x) > 1.05 && !c.seg.lifted;
      if (Math.random() < (offroad ? 0.6 : 0.25)) cy -= offroad ? 2 : 1;
    }
    const shW = w * (c.air ? 0.8 : 0.94);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(Math.round(cx - shW / 2), Math.round(roadY - Math.max(1, w * 0.05)), Math.round(shW), Math.max(1, Math.round(w * 0.07)));
    g.drawImage(c.isPlayer ? c.frames[c.pose + 2] : fogImg(c.frames[c.pose + 2], FOG[k]), Math.round(cx - w / 2), Math.round(cy - h * 42 / 44), Math.round(w), Math.round(h));
    if (c.isPlayer) state.playerScreen = { x: cx, y: cy, w };
  }

  function renderScene() {
    const { track, theme } = state, { segs, N } = track;
    const camZ = state.camZ, camX = state.camX, camY = state.camY;
    const base = segAt(camZ), basePct = (camZ % SEG) / SEG;

    drawBackground();

    let x = 0, dx = -(base.curve * basePct);
    for (let k = 0; k <= DRAW; k++) {
      const s = segs[(base.i + k) % N];
      const zr = (base.i + k) * SEG - camZ;
      const sc = zr > 1 ? CAM_DEPTH / zr : 0;
      PZ[k] = zr;
      PS[k] = sc;
      PX[k] = HALF_W + sc * (x - camX) * UNIT;
      PY[k] = HALF_H - sc * (s.y1 - camY) * HALF_H;
      PG[k] = HALF_H - sc * (s.g1 - camY) * HALF_H;
      PW[k] = sc * ROAD * UNIT;
      x += dx;
      dx += s.curve;
    }

    for (let k = DRAW - 1; k >= 0; k--) {
      if (PZ[k] <= 1) continue;
      const s = segs[(base.i + k) % N], f = FOG[k], alt = Math.floor(s.i / RUMBLE) % 2;
      const x1 = PX[k], y1 = PY[k], w1 = PW[k], x2 = PX[k + 1], y2 = PY[k + 1], w2 = PW[k + 1];
      const lifted = s.lifted;

      // ground band (sea/lava/water under bridges)
      const gTop = PG[k + 1], gBot = PG[k];
      if (gBot > gTop && gTop < H) {
        g.fillStyle = fogged((lifted ? theme.under : theme.ground)[alt], f);
        g.fillRect(0, Math.floor(gTop), W, Math.ceil(gBot - gTop) + 1);
      }

      if (lifted) {
        const sl1 = PS[k] * SLAB * HALF_H, sl2 = PS[k + 1] * SLAB * HALF_H;
        if (s.i % 8 === 0) {
          const pw = Math.max(1, PS[k] * 170 * UNIT), top = y1 + sl1 * 0.5, bot = PG[k];
          if (bot > top) {
            for (const side of [-0.72, 0.72]) {
              const px = x1 + side * w1;
              g.fillStyle = fogged(theme.pillar, f);
              g.fillRect(Math.round(px - pw / 2), Math.round(top), Math.ceil(pw), Math.ceil(bot - top));
              g.fillStyle = fogged(Art.shade(theme.pillar, -0.3), f);
              g.fillRect(Math.round(px + pw * 0.15), Math.round(top), Math.ceil(pw * 0.35), Math.ceil(bot - top));
            }
            g.fillStyle = fogged(Art.shade(theme.slab, -0.2), f);
            g.fillRect(Math.round(x1 - w1 * 0.95), Math.round(y1 + sl1 * 0.6), Math.round(w1 * 1.9), Math.ceil(sl1 * 0.9));
          }
        }
        quad(x1 - w1 * RAIL_X, y1 + sl1, x1 + w1 * RAIL_X, y1 + sl1, x2 + w2 * RAIL_X, y2 + sl2, x2 - w2 * RAIL_X, y2 + sl2, fogged(theme.slab, f));
      }

      if (y2 < y1 + 0.01) {
        const rw = lifted ? RAIL_X : 1.12;
        // far edge pulled up a pixel so the next segment fully covers the anti-aliased seam
        quad(x1 - w1 * rw, y1, x1 + w1 * rw, y1, x2 + w2 * rw, y2 - 1, x2 - w2 * rw, y2 - 1, fogged(theme.rumble[alt], f));
        quad(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2 - 1, x2 - w2, y2 - 1, fogged(theme.road[alt], f));
        if (s.checker) {
          const cols = 10;
          for (let row = 0; row < 2; row++) {
            const ya = lerp(y1, y2, row / 2), yb = lerp(y1, y2, (row + 1) / 2);
            const xa = lerp(x1, x2, row / 2), xb = lerp(x1, x2, (row + 1) / 2), wa = lerp(w1, w2, row / 2), wb = lerp(w1, w2, (row + 1) / 2);
            for (let c = 0; c < cols; c++) {
              if ((c + row) % 2) continue;
              const u1 = -1 + (2 * c) / cols, u2 = -1 + (2 * (c + 1)) / cols;
              quad(xa + wa * u1, ya, xa + wa * u2, ya, xb + wb * u2, yb, xb + wb * u1, yb, fogged('#f4f4f4', f));
            }
          }
        } else if (alt && w1 > 6) {
          const l1 = w1 * 0.025, l2 = w2 * 0.025;
          for (let lane = 1; lane < LANES; lane++) {
            const u = -1 + (2 * lane) / LANES;
            quad(x1 + w1 * u - l1, y1, x1 + w1 * u + l1, y1, x2 + w2 * u + l2, y2, x2 + w2 * u - l2, y2, fogged(theme.lane, f));
          }
        }
      }

      if (lifted) {
        const r1 = PS[k] * RAIL_H * HALF_H, r2 = PS[k + 1] * RAIL_H * HALF_H, col = fogged(theme.rail[alt], f);
        quad(x1 - w1 * RAIL_X, y1, x2 - w2 * RAIL_X, y2, x2 - w2 * RAIL_X, y2 - r2, x1 - w1 * RAIL_X, y1 - r1, col);
        quad(x1 + w1 * RAIL_X, y1, x2 + w2 * RAIL_X, y2, x2 + w2 * RAIL_X, y2 - r2, x1 + w1 * RAIL_X, y1 - r1, col);
      }

      for (const spr of s.sprites) drawSprite(spr, k);
      if (s.cars.length) {
        if (s.cars.length > 1) s.cars.sort((a, b) => b.z - a.z);
        for (const c of s.cars) drawCar(c, k);
      }
    }

    for (const p of state.particles) {
      g.globalAlpha = clamp(p.life / p.max, 0, 1);
      g.fillStyle = p.col;
      g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    g.globalAlpha = 1;
    if (state.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${state.flash * 3})`;
      g.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- HUD
  const FONT = '"Press Start 2P", ui-monospace, Menlo, Consolas, monospace';
  function text(str, x, y, size, col, align = 'left') {
    const s = view.scale;
    sctx.font = `${Math.round(size * s)}px ${FONT}`;
    sctx.textAlign = align;
    sctx.textBaseline = 'top';
    const px = view.x + x * s, py = view.y + y * s, off = Math.max(1, Math.round(s * Math.max(1, size / 7)));
    sctx.fillStyle = '#000';
    sctx.fillText(str, px + off, py + off);
    sctx.fillStyle = col;
    sctx.fillText(str, px, py);
  }
  function box(x, y, w, h, col) {
    const s = view.scale;
    sctx.fillStyle = col;
    sctx.fillRect(view.x + x * s, view.y + y * s, w * s, h * s);
  }

  function standings() {
    return [...state.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return progress(b) - progress(a);
    });
  }

  function drawHUD() {
    const p = state.player;
    if (state.attract) return;
    const order = standings(), pos = order.indexOf(p) + 1;

    text('TIME', 8, 8, 6, '#ffd23f');
    text(fmtTime(state.raceTime), 8, 17, 8, '#ffffff');
    text(`LAP ${clamp(p.lap, 1, LAPS)}/${LAPS}`, 8, 30, 6, '#7fe3ff');
    const best = settings.best[COURSES[state.courseIdx].id];
    if (best) text('BEST ' + fmtTime(best), 8, 40, 5, '#c9c9d6');

    text('POS', W - 8, 8, 6, '#ffd23f', 'right');
    text(ordinal(pos), W - 8, 17, 14, pos <= 3 ? '#7dff8a' : '#ffffff', 'right');
    text(`OF ${GRID}`, W - 8, 34, 5, '#c9c9d6', 'right');

    // speed, gear and rev bar (raised on touch screens to clear the on-screen pedals)
    const by0 = H - (isTouch ? 60 : 0);
    const kmh = Math.round((p.speed / MAX_SPEED) * 290);
    text(String(kmh).padStart(3, ' '), 8, by0 - 26, 12, '#ffffff');
    text('KM/H', 48, by0 - 20, 6, '#ffd23f');
    const sp = p.speed / MAX_SPEED, rpm = clamp(state.gear === 0 ? sp / LOW_GEAR_TOP : (sp - 0.25) / 0.75, 0, 1);
    for (let i = 0; i < 14; i++) {
      const on = i / 14 < rpm;
      const col = i < 8 ? '#4be36a' : i < 11 ? '#ffd23f' : '#ff4a3a';
      box(8 + i * 5, by0 - 10, 4, 4, on ? col : 'rgba(255,255,255,0.15)');
    }
    box(84, by0 - 27, 15, 21, 'rgba(0,0,0,0.45)');
    text(state.gear ? 'H' : 'L', 88, by0 - 22, 8, state.gear ? '#ff9a3a' : '#7fe3ff');

    // race progress strip
    const bw = 100, bx = isTouch ? HALF_W - bw / 2 : W - 110, by = isTouch ? 44 : H - 12, L = state.track.L * LAPS;
    box(bx, by, bw, 3, 'rgba(255,255,255,0.25)');
    for (const c of state.cars) {
      const t = clamp((progress(c) - state.track.L) / L, 0, 1);
      box(bx + t * (bw - 2), c.isPlayer ? by - 4 : by - 2, 2, c.isPlayer ? 11 : 7, c.isPlayer ? '#ffffff' : c.color);
    }
    text('START', bx, by - 12, 4, '#c9c9d6');
    text('FINISH', bx + bw, by - 12, 4, '#c9c9d6', 'right');

    if (state.msg) {
      const m = state.msg, blink = m.big || Math.floor(m.t * 6) % 2 === 0 || m.t < 1.2;
      if (blink) text(m.text, HALF_W, m.big ? HALF_H - 44 : 52, m.big ? 22 : 12, m.big ? '#ffd23f' : '#ffffff', 'center');
      if (m.sub) text(m.sub, HALF_W, m.big ? HALF_H - 14 : 70, 7, '#7fe3ff', 'center');
    }
    if (state.paused) {
      box(0, 0, W, H, 'rgba(10,8,30,0.35)');
    }
  }

  function present() {
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = '#05040d';
    sctx.fillRect(0, 0, screen.width, screen.height);
    let sx = 0, sy = 0;
    if (state.shake > 0 && !reducedMotion) {
      sx = (Math.random() - 0.5) * 4 * view.scale * Math.min(1, state.shake * 3);
      sy = (Math.random() - 0.5) * 4 * view.scale * Math.min(1, state.shake * 3);
    }
    sctx.drawImage(scene, Math.round(view.x + sx), Math.round(view.y + sy), Math.round(view.w), Math.round(view.h));
    drawHUD();
  }

  // ---------------------------------------------------------------- UI flow
  const $ = id => document.getElementById(id);
  const ui = {
    root: $('ui'), title: $('title'), courses: $('courses'), garage: $('garage'), results: $('results'), pause: $('pause'),
    courseList: $('course-list'), coursesTitle: $('courses-title'), genList: $('gen-list'), paintList: $('paint-list'),
    preview: $('car-preview'), resultsTitle: $('results-title'), resultsSub: $('results-sub'), resultsTable: $('results-table'),
    resultsActions: $('results-actions'), touch: $('touch'), rotate: $('rotate'), paintName: $('paint-name'),
  };
  const panels = ['title', 'courses', 'garage', 'results', 'pause'];

  function show(name) {
    for (const p of panels) ui[p].hidden = p !== name;
    ui.root.hidden = !name;
    ui.touch.hidden = !(isTouch && !name && state.mode === 'race' && !state.attract);
    if (name) {
      const first = ui[name].querySelector('button:not([disabled])');
      if (first) first.focus({ preventScroll: true });
    }
  }

  function moveFocus(dir) {
    const panel = panels.map(p => ui[p]).find(p => !p.hidden);
    if (!panel) return;
    const btns = [...panel.querySelectorAll('button:not([disabled])')];
    const i = btns.indexOf(document.activeElement);
    const next = btns[(i + dir + btns.length) % btns.length];
    if (next) next.focus();
  }

  function goTitle() {
    Sound.stopEngine();
    Sound.stopMusic();
    state.champ = null;
    newRace(Math.floor(Math.random() * COURSES.length), true);
    show('title');
  }

  function startRace(idx) {
    Sound.init();
    for (const k in keys) keys[k] = false;
    newRace(idx, false);
    show(null);
  }

  function togglePause() {
    state.paused = !state.paused;
    Sound.suspend(state.paused);
    show(state.paused ? 'pause' : null);
  }

  function courseButton(c, i, locked) {
    const b = document.createElement('button');
    b.className = 'course';
    b.disabled = locked;
    const best = settings.best[c.id];
    b.innerHTML = `<span class="c-num">${i + 1}</span><span class="c-name">${c.name}</span><span class="c-blurb">${c.blurb}</span><span class="c-best">${best ? 'Best lap ' + fmtTime(best) : 'No lap set yet'}</span>`;
    b.addEventListener('click', () => startRace(i));
    return b;
  }

  function showCourses() {
    ui.courseList.replaceChildren(...COURSES.map((c, i) => courseButton(c, i, false)));
    show('courses');
  }

  function startChampionship() {
    state.champ = { round: 0, points: Object.fromEntries([...RIVALS.map(r => [r.name, 0]), ['LEO', 0]]), before: null };
    state.champ.before = { ...state.champ.points };
    startRace(0);
  }

  function showResults() {
    const order = standings();
    const pos = order.indexOf(state.player) + 1;
    const champ = state.champ;
    Sound.stopEngine();
    state.mode = 'results';

    if (champ) {
      champ.before = { ...champ.points };
      order.forEach((c, i) => { champ.points[c.name] += POINTS[i]; });
    }
    const rows = order.map((c, i) => {
      const remaining = Math.max(0, state.track.L * (LAPS + 1) - progress(c));
      const time = c.finished ? fmtTime(c.finishTime) : '~' + fmtTime(state.raceTime + remaining / Math.max(c.speed, c.top * 0.8));
      const pts = champ ? `<td class="num">+${POINTS[i]}</td><td class="num">${champ.points[c.name]}</td>` : `<td class="num">${fmtTime(c.bestLap)}</td>`;
      return `<tr class="${c.isPlayer ? 'me' : ''}"><td class="num">${i + 1}</td><td><i style="background:${c.color}"></i>${c.name}</td><td class="num">${time}</td>${pts}</tr>`;
    }).join('');
    const head = champ ? '<th>Pts</th><th>Total</th>' : '<th>Best lap</th>';
    ui.resultsTable.innerHTML = `<thead><tr><th>Pos</th><th>Driver</th><th>Time</th>${head}</tr></thead><tbody>${rows}</tbody>`;

    const course = COURSES[state.courseIdx];
    const actions = [];
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); actions.push(b); };
    if (champ) {
      const qualified = pos <= 3;
      if (qualified && champ.round < COURSES.length - 1) {
        ui.resultsTitle.textContent = `${ordinal(pos)} at ${course.name}`;
        ui.resultsSub.textContent = 'Through to the next round.';
        btn(`Next: ${COURSES[champ.round + 1].name}`, () => { champ.round++; startRace(champ.round); });
      } else if (qualified) {
        const final = Object.entries(champ.points).sort((a, b) => b[1] - a[1]);
        const champPos = final.findIndex(e => e[0] === 'LEO') + 1;
        ui.resultsTitle.textContent = champPos === 1 ? 'Champion!' : `Championship: ${ordinal(champPos)}`;
        ui.resultsSub.textContent = `All five courses done. Leo scored ${champ.points.LEO} points.`;
        btn('Back to title', goTitle);
      } else {
        ui.resultsTitle.textContent = `${ordinal(pos)} at ${course.name}`;
        ui.resultsSub.textContent = 'Finish in the top three to go through. Points from this attempt are dropped if you retry.';
        btn('Retry race', () => { champ.points = { ...champ.before }; startRace(champ.round); });
        btn('Quit to title', goTitle);
      }
    } else {
      ui.resultsTitle.textContent = `${ordinal(pos)} at ${course.name}`;
      ui.resultsSub.textContent = `Best lap ${fmtTime(state.player.bestLap)}`;
      btn('Race again', () => startRace(state.courseIdx));
      btn('Choose course', showCourses);
      btn('Back to title', goTitle);
    }
    ui.resultsActions.replaceChildren(...actions);
    show('results');
  }

  // garage
  function drawPreview() {
    const frames = playerFrames(), pctx = ui.preview.getContext('2d');
    const t = Math.floor(performance.now() / 700) % 4;
    pctx.clearRect(0, 0, 72, 44);
    pctx.drawImage(frames[[2, 1, 2, 3][t]], 0, 0);
  }
  let previewTimer = null;
  function showGarage() {
    ui.genList.replaceChildren(...GENS.map(([id, name, years]) => {
      const b = document.createElement('button');
      b.className = 'gen';
      b.setAttribute('aria-pressed', String(settings.model === id));
      b.innerHTML = `<span>${name}</span><small>${years}</small>`;
      b.addEventListener('click', () => { settings.model = id; saveSettings(); showGarage(); });
      return b;
    }));
    ui.paintList.replaceChildren(...PAINTS.map(([name, hex]) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.setProperty('--paint', hex);
      b.title = name;
      b.setAttribute('aria-label', name);
      b.setAttribute('aria-pressed', String(settings.color === hex));
      b.addEventListener('click', () => { settings.color = hex; saveSettings(); showGarage(); });
      return b;
    }));
    const paint = PAINTS.find(p => p[1] === settings.color);
    ui.paintName.textContent = paint ? paint[0] : 'Custom';
    drawPreview();
    clearInterval(previewTimer);
    previewTimer = setInterval(drawPreview, 700);
    if (ui.garage.hidden) show('garage');
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    Sound.init();
    const a = b.dataset.action;
    if (a === 'champ') startChampionship();
    else if (a === 'single') showCourses();
    else if (a === 'garage') showGarage();
    else if (a === 'back') { clearInterval(previewTimer); show('title'); }
    else if (a === 'resume') togglePause();
    else if (a === 'restart') { state.paused = false; Sound.suspend(false); if (state.champ) state.champ.points = { ...state.champ.before }; startRace(state.courseIdx); }
    else if (a === 'quit') { state.paused = false; Sound.suspend(false); goTitle(); }
  });

  // touch controls
  for (const b of ui.touch.querySelectorAll('[data-key]')) {
    const k = b.dataset.key;
    const on = e => { e.preventDefault(); keys[k] = true; b.classList.add('down'); };
    const off = e => { e.preventDefault(); keys[k] = false; b.classList.remove('down'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  }
  $('touch-pause').addEventListener('click', () => { if (state.mode === 'race' && !state.attract) togglePause(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'race' && !state.attract && !state.paused) togglePause();
  });

  // ---------------------------------------------------------------- main loop
  const STEP = 1 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    if (state.track) renderScene();
    present();
    requestAnimationFrame(frame);
  }

  if (isTouch) document.querySelector('#title .hint').textContent = 'Hold your phone sideways. Steer bottom left, pedals bottom right.';
  window.addEventListener('resize', resize);
  resize();
  goTitle();
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.load) document.fonts.load('8px "Press Start 2P"').catch(() => {});

  // test hook for automated checks
  window.__drift = { state, startRace, keys, showResults };
})();
