'use strict';
// Midship Drift III: physics, AI, camera, HUD and menus.
//
// Cars live in track coordinates: s is distance driven (it keeps counting past each
// lap), d is the sideways offset from the centre line, h is where the nose points and
// phi is the direction of travel, both measured from the road's heading. When h and phi
// differ the car is sliding. Drifting loosens the grip that pulls phi towards h, so the
// tail swings out and the car can turn tighter than its tyres would otherwise allow.
(() => {
  const $ = s => document.querySelector(s);
  const screen = $('#screen'), sg = screen.getContext('2d');
  const glc = document.createElement('canvas');
  const H = 224;
  let W = 400;

  const LAPS = 4, G = 30, V_TOP = 72, HALF = Track.HALF, CAR_HALF = 1.05;
  const POINTS = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1];
  const ORD = n => n + (n % 10 === 1 && n !== 11 ? 'ST' : n % 10 === 2 && n !== 12 ? 'ND' : n % 10 === 3 && n !== 13 ? 'RD' : 'TH');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------------------------------------------------------------- save data
  const SAVE_KEY = 'midship-drift-3';
  let save = { paint: 0, best: {} };
  try { save = Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (_) { /* private mode */ }
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* private mode */ } };

  if (!GLR.init(glc)) { $('#title').hidden = true; $('#nogl').hidden = false; return; }

  function resize() {
    const aspect = innerWidth / innerHeight;
    W = clamp(Math.round(H * aspect), 260, 560);
    screen.width = glc.width = W; screen.height = glc.height = H;
    sg.imageSmoothingEnabled = false;
  }
  addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- faces
  const FACES = DRIVERS.map(d => [Toons.face(d.face, 0), Toons.face(d.face, 1), Toons.face(d.face, -1)]);
  const faceURL = FACES.map(f => f[1].toDataURL());

  // ---------------------------------------------------------------- course cache
  const built = {};
  function course(idx) {
    if (!built[idx]) {
      const c = COURSES[idx], th = THEMES[c.theme], T = Track.build(c);
      built[idx] = { c, th, T, sc: Scene.build(T, th, c.id), mesh: null };
    }
    return built[idx];
  }
  const carMeshes = new Map();
  function carMesh(body, color, helmet) {
    const key = body + color + helmet;
    if (!carMeshes.has(key)) {
      const m = Models.build(body, color, helmet);
      carMeshes.set(key, { main: GLR.mesh(m.main), line: GLR.mesh(m.line) });
    }
    return carMeshes.get(key);
  }
  const shadowMesh = GLR.mesh(Models.shadow());

  // ---------------------------------------------------------------- race state
  let race = null, mode = 'title', paused = false, champ = null;
  const keys = {}, edge = {};

  function newRace(idx, opts = {}) {
    if (race && race.world && race.idx !== idx) { GLR.free(race.world); }
    const B = course(idx);
    GLR.setAtlas(B.sc.atlas);
    const world = race && race.idx === idx ? race.world : GLR.mesh(B.sc.mesh);
    const order = DRIVERS.map((d, i) => i).slice(1).sort((a, b) => DRIVERS[b].skill - DRIVERS[a].skill);
    order.splice(6, 0, 0); // Leo starts seventh, as befits the hero
    const cars = order.map((di, slot) => {
      const d = DRIVERS[di], human = di === 0 && !opts.attract;
      const color = di === 0 ? PAINTS[save.paint][1] : d.color;
      const row = Math.floor(slot / 2), side = slot % 2 ? 1 : -1;
      return {
        di, human, mesh: carMesh(d.body, color, d.face.helmet),
        s: -10 - row * 10 - (slot % 2) * 4, d: side * 3.6, v: 0, h: 0, phi: 0, steer: 0,
        y: 0, vy: 0, air: false, drift: 0, driftT: 0, boost: 0, slipVis: 0,
        skill: opts.attract && di === 0 ? 0.93 : d.skill, lane: (Math.random() - 0.5) * 3, laneT: 0,
        rubber: 1, finished: false, finishTime: 0, lapStart: 0, lapTimes: [], best: Infinity,
        pos: slot + 1, mood: 0, moodT: 0, puffT: 0, bumpT: 0, wrongT: 0, pose: null,
      };
    });
    for (const car of cars) { const i = B.T.at(car.s); car.y = i.y - car.d * Math.sin(i.bank); }
    race = {
      idx, B, T: B.T, th: B.th, world, cars, player: cars.find(c => c.di === 0), attract: !!opts.attract,
      laps: opts.attract ? 999 : LAPS, t: 0, clock: 0, introT: 0, countT: 0, goT: -1, finishT: 0,
      msgs: [], parts: [], cam: null, fogCol: Scene.rgb(B.th.fog), sky: null, lastLap: 0, gridShown: false,
    };
    race.sky = skyCanvas(B.th);
    race.signS = race.player.s + 24;
    race.cam = { a: 0, y: null };
    mode = opts.attract ? 'race' : opts.garage ? 'garage' : 'intro';
    if (opts.attract) race.goT = 999;
  }

  function msg(text, dur = 1.6, col = '#ffd23f', y = 92) { race.msgs.push({ text, t: 0, dur, col, y }); }

  // ---------------------------------------------------------------- physics
  const tA = {}, tB = {}, tC = {};

  function drivePlayer(c, dt) {
    const T = race.T, info = T.at(c.s, tA);
    const steerIn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    c.steer += (steerIn - c.steer) * Math.min(1, dt * (steerIn ? 7 : 11));
    const top = V_TOP * (c.boost > 0 ? 1.18 : 1);
    let a;
    if (keys.up) a = 27 * Math.max(0, 1 - (c.v / top) ** 2) + (c.boost > 0 ? 16 : 0);
    else a = -3 - c.v * 0.05;
    if (keys.down) a -= 42;
    if (c.v > top) a = Math.min(a, -10);
    c.v = Math.max(0, c.v + a * dt);
    c.boost = Math.max(0, c.boost - dt);

    // Tap brake or press drift while steering at speed to throw the car sideways.
    if (!c.drift && (edge.drift || (edge.down && Math.abs(c.steer) > 0.5)) && Math.abs(c.steer) > 0.3 && c.v > 18 && !c.air) {
      c.drift = Math.sign(c.steer); c.driftT = 0; c.h += c.drift * 0.14;
    }
    // On grip the nose can only turn about as fast as the tyres can follow, so the car
    // goes where it points. In a drift the nose swings freely and the tail hangs out.
    const grip = c.air ? 0.2 : 1;
    const latMax = c.air ? 1 : c.drift ? 44 : 31;
    const yawMax = c.drift ? 2.5 : Math.min(1.8, (latMax * 1.25) / Math.max(c.v, 6));
    c.h += c.steer * yawMax * Math.min(1, c.v / 10) * grip * dt;
    if (c.drift) c.h += c.drift * 0.4 * dt;
    else if (!c.air) c.h += (c.phi - c.h) * 4 * dt;
    const maxTurn = latMax / Math.max(c.v, 6);
    c.phi += clamp((c.h - c.phi) * (c.drift ? 2.2 : 10), -maxTurn, maxTurn) * dt;
    let slip = c.h - c.phi;
    if (Math.abs(slip) > 1) { c.h = c.phi + Math.sign(slip); slip = c.h - c.phi; }
    c.v -= c.v * Math.abs(Math.sin(slip)) * (c.drift ? 0.26 : 0.8) * dt;
    if (c.drift) {
      c.driftT += dt * (Math.abs(slip) > 0.22 ? 1 : 0.3);
      if (c.v < 14 || slip * c.drift < -0.05 || (Math.abs(slip) < 0.1 && c.steer * c.drift < 0.25)) endDrift(c);
    }
    integrate(c, info, dt);
  }

  function endDrift(c) {
    if (c.human && c.driftT > 0.75) {
      c.boost = Math.min(2.2, 0.5 + c.driftT * 0.55);
      msg(c.driftT > 1.8 ? 'SUPER TURBO!' : 'TURBO!', 1.1, c.driftT > 1.8 ? '#ff7a2a' : '#5ad1ff', 150);
      Sound.blip();
    }
    c.drift = 0; c.driftT = 0;
  }

  function driveAI(c, dt) {
    const T = race.T, p = race.player;
    let kmax = 0;
    for (let a = 6; a < 26 + c.v * 1.15; a += 6) kmax = Math.max(kmax, Math.abs(T.at(c.s + a, tC).k));
    if (!race.attract && !c.finished && p && !p.finished) c.rubber = clamp(1 + (p.s - c.s) / 3000, 0.93, 1.05);
    const sk = c.skill * c.rubber;
    const vt = Math.min(V_TOP * (0.86 + 0.14 * sk), Math.sqrt((41 * sk) / Math.max(kmax, 1e-4)));
    if (race.goT < 0) c.v = 0;
    else if (c.v < vt) c.v += 25 * dt * Math.max(0.25, 1 - (c.v / (V_TOP * 1.05)) ** 2);
    else c.v = Math.max(vt, c.v - 34 * dt);

    // Line: drift to the inside of the bend coming up, plus a personal lane.
    c.laneT -= dt;
    if (c.laneT < 0) { c.laneT = 2 + Math.random() * 3; c.lane = (Math.random() - 0.5) * 4; }
    let kn = 0;
    for (let a = 10; a <= 50; a += 10) kn += T.at(c.s + a, tC).k;
    let target = clamp((kn / 5) * 240 + c.lane, -HALF + 2, HALF - 2);
    for (const o of race.cars) {
      if (o === c) continue;
      const gap = o.s - c.s;
      if (gap > 0 && gap < 16 && Math.abs(o.d - target) < 2.4) {
        target = clamp(o.d + (o.d > 0 ? -2.8 : 2.8), -HALF + 1.6, HALF - 1.6);
        if (gap < 7 && Math.abs(o.d - c.d) < 2) c.v = Math.min(c.v, o.v + 1);
      }
    }
    const lat = clamp((target - c.d) * 1.6, -6, 6);
    c.phi = Math.atan2(lat, Math.max(c.v, 2));
    const info = T.at(c.s, tA);
    const want = Math.abs(info.k * c.v * c.v) > 14 ? clamp((info.k * c.v * c.v) / 70, -0.6, 0.6) : 0;
    c.slipVis += (want - c.slipVis) * Math.min(1, dt * 4);
    c.h = c.phi + c.slipVis;
    integrate(c, info, dt);
    // integrate() turns phi with the road; the AI re-aims every frame anyway.
  }

  function integrate(c, info, dt) {
    const T = race.T, k = info.k;
    const ds = (c.v * Math.cos(c.phi) * dt) / Math.max(0.3, 1 - k * c.d);
    c.d += c.v * Math.sin(c.phi) * dt;
    c.s += ds;
    c.h = wrapA(c.h - k * ds); c.phi = wrapA(c.phi - k * ds);
    if (Math.abs(c.h - c.phi) > Math.PI) c.h += c.h > c.phi ? -2 * Math.PI : 2 * Math.PI;

    // Crash rails
    const lim = HALF - CAR_HALF;
    if (Math.abs(c.d) > lim) {
      const side = Math.sign(c.d);
      c.d = side * lim;
      const into = Math.sin(c.phi) * side;
      if (into > 0) {
        const back = Math.cos(c.phi) < 0, np = Math.asin(-0.25 * Math.sin(c.phi));
        const nphi = back ? Math.PI - np : np;
        c.h = wrapA(nphi + (c.h - c.phi) * 0.4); c.phi = wrapA(nphi);
        c.v *= 1 - 0.5 * into;
        if (c.drift && into > 0.25) { c.drift = 0; c.driftT = 0; }
        if (c.human && c.bumpT <= 0) {
          if (into > 0.2) Sound.bump(Math.min(1, into * 1.5)); else Sound.scrape();
          c.bumpT = 0.25;
        }
        if (into > 0.08 && c.pose) sparks(c, side);
      }
    }

    // Vertical: a car keeps its climb rate, so a road that drops away fast throws it.
    const n = T.at(c.s, tB), ground = n.y - c.d * Math.sin(n.bank), fwd = c.v * Math.cos(c.phi);
    const roadVy = n.slope * fwd;
    if (c.air) {
      c.vy -= G * dt; c.y += c.vy * dt;
      if (c.y <= ground) {
        const hit = roadVy - c.vy;
        c.y = ground; c.vy = roadVy; c.air = false;
        if (c.human && hit > 4) Sound.land(Math.min(1, hit / 25));
        if (hit > 6) puffs(c, 4, 'dust');
      }
    } else if (roadVy < c.vy - G * dt * 1.5) {
      c.air = true; c.vy -= G * dt; c.y += c.vy * dt;
    } else { c.vy = roadVy; c.y = ground; }
  }

  function collide() {
    const cars = race.cars;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j], ds = b.s - a.s;
      if (Math.abs(ds) > 4.4 || Math.abs(b.d - a.d) > 2 || Math.abs(b.y - a.y) > 1.6) continue;
      const push = (2 - Math.abs(b.d - a.d)) / 2, side = b.d >= a.d ? 1 : -1;
      a.d -= side * push * 0.6; b.d += side * push * 0.6;
      const [back, front] = ds > 0 ? [a, b] : [b, a];
      if (Math.abs(ds) < 4.2 && back.v > front.v) {
        const ex = back.v - front.v;
        back.v -= ex * 0.6; front.v += ex * 0.35;
      }
      for (const c of [a, b]) if (c.human && c.bumpT <= 0) { Sound.bump(0.5); c.bumpT = 0.3; c.phi += side * (c === a ? -0.04 : 0.04); }
    }
  }

  // ---------------------------------------------------------------- poses
  // World position and orientation for a car, for drawing and for particles.
  function pose(c) {
    const T = race.T, i = T.at(c.s, tA), cb = Math.cos(i.bank), sb = Math.sin(i.bank);
    const ground = i.y - c.d * sb;
    const x = i.x + i.rx * c.d * cb, z = i.z + i.rz * c.d * cb, y = c.y;
    const ch = Math.cos(c.h), sh = Math.sin(c.h);
    let F = [i.fx * ch + i.rx * sh, 0, i.fz * ch + i.rz * sh];
    F[1] = c.air ? clamp(c.vy / Math.max(c.v, 8), -0.5, 0.5) : i.slope;
    let l = Math.hypot(...F); F = F.map(v => v / l);
    const U0 = [i.rx * sb, cb, i.rz * sb];
    let R = [F[1] * U0[2] - F[2] * U0[1], F[2] * U0[0] - F[0] * U0[2], F[0] * U0[1] - F[1] * U0[0]];
    l = Math.hypot(...R); R = R.map(v => v / l);
    const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
    const Lf = [-R[0], -R[1], -R[2]];
    c.pose = { x, y, z, F, U, L: Lf, ground, info: { fx: i.fx, fz: i.fz, rx: i.rx, rz: i.rz, slope: i.slope, bank: i.bank } };
    return c.pose;
  }
  const local = (p, lx, ly, lz) => [p.x + p.L[0] * lx + p.U[0] * ly + p.F[0] * lz, p.y + p.L[1] * lx + p.U[1] * ly + p.F[1] * lz, p.z + p.L[2] * lx + p.U[2] * ly + p.F[2] * lz];

  // ---------------------------------------------------------------- particles
  function puffs(c, count, kind = 'puff') {
    if (!c.pose || race.parts.length > 260) return;
    for (let k = 0; k < count; k++) {
      const side = k % 2 ? 0.85 : -0.85, p = local(c.pose, side, 0.3, -1.4);
      race.parts.push({ x: p[0], y: p[1], z: p[2], vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 3, t: 0, life: 0.5 + Math.random() * 0.3, size: 0.8, kind });
    }
  }
  function sparks(c, side) {
    if (race.parts.length > 260) return;
    for (let k = 0; k < 5; k++) {
      const p = local(c.pose, -side * 0.9, 0.5, (Math.random() - 0.3) * 3);
      race.parts.push({ x: p[0], y: p[1], z: p[2], vx: (Math.random() - 0.5) * 8, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 8, t: 0, life: 0.35, size: 0.5, kind: 'sparkY' });
    }
  }
  function turboSparks(c) {
    const col = c.driftT > 1.8 ? 'sparkR' : c.driftT > 0.75 ? 'sparkB' : 'sparkY';
    for (const side of [-0.85, 0.85]) {
      const p = local(c.pose, side, 0.15, -1.35);
      race.parts.push({ x: p[0], y: p[1], z: p[2], vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, t: 0, life: 0.22, size: 0.45, kind: col });
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    const R = race;
    R.t += dt;
    for (const m of R.msgs) m.t += dt;
    R.msgs = R.msgs.filter(m => m.t < m.dur);

    if (mode === 'garage') return;
    if (mode === 'intro') {
      R.introT += dt;
      if (R.introT > 4.2 || edge.any) { mode = 'countdown'; R.countT = 0; Sound.beep(false); }
    }
    if (mode === 'countdown') {
      const before = R.countT;
      R.countT += dt;
      for (const at of [1, 2]) if (before < at && R.countT >= at) Sound.beep(false);
      if (R.countT >= 3) { mode = 'race'; R.goT = 0; R.clock = 0; Sound.beep(true); msg('GO!', 1, '#7dff5a', 70); }
    }
    if (R.goT >= 0) R.goT += dt;

    const racing = R.goT >= 0;
    if (racing && (mode === 'race' || mode === 'finish')) R.clock += dt;
    for (const c of R.cars) {
      c.bumpT -= dt;
      if (!racing) { c.v = 0; pose(c); continue; }
      if (c.human && !c.finished) drivePlayer(c, dt); else driveAI(c, dt);
      pose(c);
      const slip = Math.abs(c.h - c.phi);
      if (!c.air && c.v > 12 && (c.human ? slip > 0.3 || c.drift : slip > 0.42)) {
        c.puffT -= dt;
        if (c.puffT < 0) { puffs(c, c.human ? 2 : 1); c.puffT = c.human ? 0.08 : 0.16; }
        if (c.human && c.drift && c.driftT > 0.3) turboSparks(c);
      }
    }
    if (racing) collide();

    // laps, positions, finishing
    const L = R.T.L;
    for (const c of R.cars) {
      const lap = Math.floor(c.s / L);
      if (lap > (c.lapsDone || 0) && c.s > 0) {
        c.lapsDone = lap;
        const lt = R.clock - c.lapStart;
        c.lapStart = R.clock;
        c.lapTimes.push(lt); c.best = Math.min(c.best, lt);
        if (!c.finished && lap >= R.laps) { c.finished = true; c.finishTime = R.clock; }
        if (c.human) {
          if (c.finished) finishRace();
          else if (lap === R.laps - 1) msg('FINAL LAP!', 2, '#ff3f6c');
          else msg(`LAP ${lap + 1}`, 1.4, '#ffd23f');
        }
      }
    }
    const order = R.cars.slice().sort((a, b) => (b.finished - a.finished) || (a.finished ? a.finishTime - b.finishTime : b.s - a.s));
    order.forEach((c, k) => {
      if (c.pos !== k + 1 && racing && R.t > 1) { c.mood = k + 1 < c.pos ? 1 : -1; c.moodT = 1.5; }
      c.pos = k + 1;
      c.moodT -= dt; if (c.moodT < 0) c.mood = 0;
    });
    R.order = order;

    const p = R.player;
    if (p && p.human && !p.finished) {
      p.wrongT = Math.cos(p.phi) < -0.2 && p.v > 4 ? p.wrongT + dt : 0;
      const top = V_TOP * (p.boost > 0 ? 1.18 : 1), gears = [0, 15, 27, 39, 52, 64, 90];
      let g = 0; while (g < gears.length - 2 && p.v > gears[g + 1]) g++;
      Sound.setEngine(clamp((p.v - gears[g]) / (gears[g + 1] - gears[g]), 0, 1) * 0.8 + p.v / top * 0.2, keys.up ? 1 : 0);
      Sound.setSkid(!p.air && p.v > 12 ? clamp((Math.abs(p.h - p.phi) - 0.12) * 2, 0, 1) : 0);
    }
    if (mode === 'finish') { R.finishT += dt; if (R.finishT > 4.5 && !R.resultsShown) showResults(); }
    if (R.attract && R.t > 70) newRace((R.idx + 1) % COURSES.length, { attract: true });

    for (const q of R.parts) {
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.kind.startsWith('spark')) q.vy -= 20 * dt; else { q.vx *= 0.96; q.vz *= 0.96; q.size += dt * 1.6; }
    }
    R.parts = R.parts.filter(q => q.t < q.life);
  }

  function finishRace() {
    const p = race.player;
    mode = 'finish'; race.finishT = 0;
    p.human = false; p.skill = 0.9; endDrift(p);
    Sound.setSkid(0);
    const key = race.B.c.id;
    if (p.best < (save.best[key] || Infinity)) { save.best[key] = p.best; persist(); }
  }

  // ---------------------------------------------------------------- camera
  function camera(dt) {
    const R = race, T = R.T, cam = R.cam;
    const p = R.player.pose || pose(R.player);
    const c = R.player, i = T.at(c.s, tA);
    const want = c.phi * 0.7 + (c.h - c.phi) * 0.15;
    cam.a += (want - cam.a) * Math.min(1, dt * 5);
    const dx = i.fx * Math.cos(cam.a) + i.rx * Math.sin(cam.a), dz = i.fz * Math.cos(cam.a) + i.rz * Math.sin(cam.a);
    const behind = T.at(c.s - 9, tB).y;
    const eyeY = Math.max(p.y + 3.6, behind + 2.6);
    cam.y = cam.y === null ? eyeY : cam.y + (eyeY - cam.y) * Math.min(1, dt * 7);
    let eye = [p.x - dx * 9.5, cam.y, p.z - dz * 9.5];
    let tgt = [p.x + dx * 8, p.y + 1.2, p.z + dz * 8];
    let fogNear = 160, fogFar = 760;

    if (mode === 'intro' || mode === 'garage') {
      const [x0, x1, z0, z1] = R.B.sc.bounds, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const rad = Math.max(x1 - x0, z1 - z0) * 0.62 + 120;
      if (mode === 'garage') {
        const a = R.t * 0.4;
        eye = [p.x + Math.sin(a) * 7.5, p.y + 2.6, p.z + Math.cos(a) * 7.5];
        tgt = [p.x, p.y + 0.8, p.z];
      } else {
        const t = R.introT, a = t * 0.3 + 0.6;
        const oe = [cx + Math.sin(a) * rad, rad * 0.5 + 40, cz + Math.cos(a) * rad], ot = [cx, 0, cz];
        const k = clamp((t - 2.2) / 1.9, 0, 1), e = k * k * (3 - 2 * k);
        eye = eye.map((v, j) => lerp(oe[j], v, e)); tgt = tgt.map((v, j) => lerp(ot[j], v, e));
        fogNear = lerp(rad * 1.2, fogNear, e); fogFar = lerp(rad * 2.6, fogFar, e);
      }
    }
    return { eye, tgt, fogNear, fogFar };
  }

  // ---------------------------------------------------------------- sky
  function skyCanvas(th) {
    const [c, g] = Art.canvas(4, 256), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.55, th.sky[1]); gr.addColorStop(0.85, th.sky[2]); gr.addColorStop(1, th.fog);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    return c;
  }

  function drawSky(view) {
    const R = race, th = R.th, sc = R.B.sc;
    const fx = view.tgt[0] - view.eye[0], fz = view.tgt[2] - view.eye[2], l = Math.hypot(fx, fz) || 1;
    const hz = GLR.project(view.eye[0] + (fx / l) * 5000, view.eye[1], view.eye[2] + (fz / l) * 5000, W, H);
    const horizon = hz ? clamp(hz[1], -40, H + 60) : H / 2;
    sg.drawImage(R.sky, 0, 0, 4, 256, 0, horizon - 256, W, 256);
    sg.fillStyle = th.fog; sg.fillRect(0, horizon - 1, W, H);
    const yaw = Math.atan2(fx, fz), scroll = ((yaw / (Math.PI * 2)) * 1024) % 512;
    if (th.stars) {
      const r = Art.rng(5);
      sg.fillStyle = '#e8ecff';
      for (let k = 0; k < 70; k++) {
        const x = ((r() * 512 - scroll * 0.5) % 512 + 512) % 512, y = horizon - 40 - r() * 140;
        for (let o = x; o < W; o += 512) sg.fillRect(Math.round(o), Math.round(y), 1, 1);
      }
    }
    if (th.sun) {
      const sx = ((th.sun.x - scroll) % 512 + 512) % 512;
      sg.fillStyle = th.sun.col;
      for (let o = sx; o < W + th.sun.r; o += 512) { sg.beginPath(); sg.arc(Math.round(o), Math.round(horizon - 96 + th.sun.y), th.sun.r, 0, Math.PI * 2); sg.fill(); }
    }
    if (sc.near) for (let x = -(((scroll * 1.4) % 512 + 512) % 512); x < W; x += 512) sg.drawImage(sc.near, Math.round(x), Math.round(horizon - 120));
    for (let x = -((scroll % 512 + 512) % 512); x < W; x += 512) sg.drawImage(sc.far, Math.round(x), Math.round(horizon - 94));
  }

  // ---------------------------------------------------------------- render
  const dyn = GLR.spriteBatch(600);
  const MAT = new Float32Array(16), SH = new Float32Array(16);

  function render(dt) {
    const R = race;
    const view = camera(dt);
    sg.clearRect(0, 0, W, H);
    GLR.begin(W, H, view.eye, view.tgt, 0.95, R.fogCol, view.fogNear, view.fogFar);
    drawSky(view);

    GLR.draw(R.world);
    GLR.drawSprites(R.B.sc.sprites);

    for (const c of R.cars) {
      const p = c.pose || pose(c);
      if (Math.hypot(p.x - view.eye[0], p.z - view.eye[2]) > view.fogFar + 20) continue;
      const i = p.info, cb = Math.cos(i.bank), sb = Math.sin(i.bank);
      const up = [i.rx * sb, cb, i.rz * sb], F = [p.F[0], i.slope, p.F[2]];
      const fl = Math.hypot(...F); F[0] /= fl; F[1] /= fl; F[2] /= fl;
      const Rr = [F[1] * up[2] - F[2] * up[1], F[2] * up[0] - F[0] * up[2], F[0] * up[1] - F[1] * up[0]];
      GLR.basis(SH, p.x, p.ground + 0.08, p.z, [-Rr[0], -Rr[1], -Rr[2]], up, F);
      GLR.draw(shadowMesh, SH);
      GLR.basis(MAT, p.x, p.y, p.z, p.L, p.U, p.F);
      GLR.draw(c.mesh.line, MAT, -1);
      GLR.draw(c.mesh.main, MAT, 1);
    }

    dyn.n = 0;
    const rects = R.B.sc.rects;
    // The winged START sign hovers just ahead of the grid, then flaps away at the green light.
    const st = R.T.at(R.signS, tC);
    let sy = st.y + 4.6 + Math.sin(R.t * 2.2) * 0.35, sx = st.x, sz = st.z;
    let frame = [0, 1, 2, 3, 2, 1][Math.floor(R.t * 7) % 6];
    if (R.goT >= 0 && !R.attract) {
      const t = R.goT;
      sy += 5 * t + 9 * t * t; sx += st.fx * 14 * t; sz += st.fz * 14 * t;
      frame = [0, 1, 2, 3, 2, 1][Math.floor(t * 22) % 6];
    }
    if (!R.attract && mode !== 'garage' && R.goT < 3.5) GLR.pushSprite(dyn, sx, sy, sz, 17, 9, rects[`sign${frame}`]);
    for (const q of R.parts) {
      const k = q.t / q.life, s = q.kind.startsWith('spark') ? q.size : q.size * (1 - k * 0.6);
      GLR.pushSprite(dyn, q.x, q.y - s / 2, q.z, s, s, rects[q.kind]);
    }
    GLR.drawSprites(dyn);

    sg.drawImage(glc, 0, 0);
    if (!R.attract && mode !== 'garage') hud();
  }

  // ---------------------------------------------------------------- HUD
  const { text3, text3Width } = Art, big = Toons.bigText;
  const fmt = t => {
    if (!isFinite(t)) return "-'--\"--";
    const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
    return `${m}'${String(s).padStart(2, '0')}"${String(c).padStart(2, '0')}`;
  };

  function hud() {
    const R = race, p = R.player, order = R.order || R.cars;
    // position bar of faces, leader on the left
    const n = order.length, fw = 24, bx = Math.round(W / 2 - (n * fw) / 2);
    sg.fillStyle = 'rgba(16,18,58,0.72)';
    sg.fillRect(bx - 4, 2, n * fw + 6, 34);
    order.forEach((c, k) => {
      const x = bx + k * fw, me = c === p;
      if (me) { sg.fillStyle = (R.t * 4) % 2 < 1.4 ? '#ffd23f' : '#ff3f6c'; sg.fillRect(x - 2, 3, fw, 26); }
      sg.drawImage(FACES[c.di][c.mood === 1 ? 1 : c.mood === -1 ? 2 : 0], x, 5);
      text3(sg, String(k + 1), x + 11 - text3Width(String(k + 1)) / 2, 29, me ? '#ffd23f' : '#ffffff');
      if (c.finished) { sg.fillStyle = '#fff'; for (let q = 0; q < 3; q++) sg.fillRect(x + 17 + (q % 2), 27 + q, 1, 1); }
    });

    // big position, lap and time
    const pos = p.pos, suf = ORD(pos).slice(String(pos).length);
    const pw = big(sg, String(pos), 8, 42, pos <= 3 ? '#ffd23f' : '#ffffff', 5);
    big(sg, suf, 10 + pw, 42, pos <= 3 ? '#ffd23f' : '#ffffff', 2);
    const lap = Math.min(R.laps, Math.max(1, (p.lapsDone || 0) + 1));
    big(sg, `LAP ${lap}/${R.laps}`, W - 8, 42, '#ffffff', 2, 'right');
    big(sg, fmt(p.finished ? p.finishTime : R.clock), W - 8, 56, '#7fe3ff', 1, 'right');
    if (isFinite(p.best)) big(sg, `BEST ${fmt(p.best)}`, W - 8, 66, '#ffd23f', 1, 'right');

    // speed
    const kmh = Math.round(p.v * 3.6);
    big(sg, String(kmh), W - 34, H - 22, p.boost > 0 ? '#5ad1ff' : '#ffffff', 3, 'right');
    big(sg, 'KM/H', W - 8, H - 16, '#ffd23f', 1, 'right');

    // drift meter
    if (p.drift || p.boost > 0) {
      const k = p.boost > 0 ? p.boost / 2.2 : clamp(p.driftT / 1.8, 0, 1);
      const col = p.boost > 0 ? '#5ad1ff' : p.driftT > 1.8 ? '#ff7a2a' : p.driftT > 0.75 ? '#5ad1ff' : '#ffd23f';
      big(sg, p.boost > 0 ? 'BOOST' : 'DRIFT', W / 2, H - 30, col, 2, 'center');
      sg.fillStyle = '#000'; sg.fillRect(W / 2 - 31, H - 15, 62, 7);
      sg.fillStyle = col; sg.fillRect(W / 2 - 30, H - 14, Math.round(60 * k), 5);
    }

    minimap();

    // countdown and messages
    if (mode === 'countdown') {
      const left = 3 - Math.floor(R.countT);
      big(sg, String(left), W / 2, 64, '#ffffff', 6, 'center');
    }
    if (mode === 'intro') {
      big(sg, R.B.c.name.toUpperCase(), W / 2, 70, '#ffd23f', 3, 'center');
      big(sg, `${R.T.events.length} BRIDGE${R.T.events.length === 1 ? '' : 'S'} - ${LAPS} LAPS`, W / 2, 92, '#ffffff', 1, 'center');
    }
    for (const m of R.msgs) {
      const pop = Math.min(1, m.t * 8), s = m.text.length > 9 ? 3 : 4;
      if (pop > 0.3) big(sg, m.text, W / 2, m.y - Math.round((1 - pop) * 6), m.col, s, 'center');
    }
    if (p.wrongT > 1 && Math.floor(R.t * 3) % 2) big(sg, 'WRONG WAY!', W / 2, 110, '#ff3f6c', 3, 'center');
    if (mode === 'finish') {
      big(sg, 'GOAL!', W / 2, 74, '#ffd23f', 6, 'center');
      big(sg, `YOU FINISHED ${ORD(p.pos)}`, W / 2, 112, '#ffffff', 2, 'center');
    }
  }

  let mapCache = null;
  function minimap() {
    const R = race, T = R.T, size = 58, [x0, x1, z0, z1] = R.B.sc.bounds;
    const sc = (size - 6) / Math.max(x1 - x0, z1 - z0), ox = 8, oy = H - size - 6;
    const mx = x => ox + 3 + (x - x0) * sc + ((size - 6) - (x1 - x0) * sc) / 2;
    const mz = z => oy + 3 + (z1 - z) * sc + ((size - 6) - (z1 - z0) * sc) / 2;
    if (!mapCache || mapCache.idx !== R.idx || mapCache.W !== W) {
      const [c, g] = Art.canvas(W, H);
      g.fillStyle = 'rgba(16,18,58,0.55)'; g.fillRect(ox, oy, size, size);
      // draw low road first, raised road on top so the crossings read
      const segs = [];
      for (let i = 0; i < T.n; i += 2) segs.push([i, T.h[i]]);
      segs.sort((a, b) => a[1] - b[1]);
      for (const [i] of segs) {
        const j = T.W(i + 2), raised = T.h[i] > 4;
        g.strokeStyle = '#000'; g.lineWidth = 4; g.beginPath(); g.moveTo(mx(T.xs[i]), mz(T.zs[i])); g.lineTo(mx(T.xs[j]), mz(T.zs[j])); g.stroke();
        g.strokeStyle = raised ? '#ffffff' : '#b9b4d6'; g.lineWidth = 2; g.beginPath(); g.moveTo(mx(T.xs[i]), mz(T.zs[i])); g.lineTo(mx(T.xs[j]), mz(T.zs[j])); g.stroke();
      }
      mapCache = { idx: R.idx, W, c };
    }
    sg.drawImage(mapCache.c, 0, 0);
    for (const c of R.cars) {
      const p = c.pose; if (!p) continue;
      sg.fillStyle = c === R.player ? '#ffd23f' : DRIVERS[c.di].color;
      const s = c === R.player ? 3 : 2;
      sg.fillRect(Math.round(mx(p.x) - s / 2), Math.round(mz(p.z) - s / 2), s, s);
    }
  }

  // ---------------------------------------------------------------- menus
  const panels = ['title', 'courses', 'garage', 'results', 'pause'];
  function show(id) {
    for (const p of panels) $('#' + p).hidden = p !== id;
    const first = id && $(`#${id} button`);
    if (first) first.focus({ preventScroll: true });
    updateTouch();
  }
  let isTouch = matchMedia('(pointer: coarse)').matches;
  function updateTouch() {
    const playing = race && !race.attract && (mode === 'race' || mode === 'countdown' || mode === 'intro') && !paused;
    $('#touch').hidden = !(isTouch && playing);
    $('#rotate').hidden = !(isTouch && playing && innerHeight > innerWidth);
  }

  function toTitle() {
    champ = null; paused = false;
    Sound.stopEngine();
    newRace(0, { attract: true });
    show('title');
  }

  function startRace(idx) {
    paused = false;
    show(null);
    newRace(idx);
    Sound.init(); Sound.startEngine(); Sound.startMusic();
  }

  function courseList() {
    const list = $('#course-list');
    list.innerHTML = '';
    COURSES.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'course';
      const best = save.best[c.id];
      b.innerHTML = `<span class="c-num">${i + 1}</span><span class="c-name"></span><canvas class="c-map" width="64" height="48" aria-hidden="true"></canvas><span class="c-blurb"></span><span class="c-best">${best ? 'Best lap ' + fmt(best) : 'No lap set yet'}</span>`;
      b.querySelector('.c-name').textContent = c.name;
      b.querySelector('.c-blurb').textContent = c.blurb;
      drawThumb(b.querySelector('canvas'), i);
      b.addEventListener('click', () => { champ = null; startRace(i); });
      list.append(b);
    });
  }
  function drawThumb(cv, idx) {
    const { T, sc } = course(idx), g = cv.getContext('2d'), [x0, x1, z0, z1] = sc.bounds;
    const s = Math.min(58 / (x1 - x0), 42 / (z1 - z0));
    const X = x => 32 + (x - (x0 + x1) / 2) * s, Z = z => 24 - (z - (z0 + z1) / 2) * s;
    const segs = [];
    for (let i = 0; i < T.n; i += 2) segs.push(i);
    segs.sort((a, b) => T.h[a] - T.h[b]);
    for (const i of segs) {
      const j = T.W(i + 2);
      g.strokeStyle = '#1b1530'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(T.xs[i]), Z(T.zs[i])); g.lineTo(X(T.xs[j]), Z(T.zs[j])); g.stroke();
      g.strokeStyle = T.h[i] > 4 ? '#ffd23f' : '#ff3f6c'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(X(T.xs[i]), Z(T.zs[i])); g.lineTo(X(T.xs[j]), Z(T.zs[j])); g.stroke();
    }
  }

  function garage() {
    newRace(0, { garage: true });
    const list = $('#paint-list');
    list.innerHTML = '';
    PAINTS.forEach(([name, col], i) => {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.setProperty('--paint', col);
      b.setAttribute('aria-label', name); b.setAttribute('aria-pressed', String(i === save.paint));
      b.addEventListener('click', () => {
        save.paint = i; persist();
        for (const el of list.children) el.setAttribute('aria-pressed', String(el === b));
        $('#paint-name').textContent = name;
        const p = race.player; p.mesh = carMesh('mr2', col, DRIVERS[0].face.helmet);
      });
      list.append(b);
    });
    $('#paint-name').textContent = PAINTS[save.paint][0];
    show('garage');
  }

  function showResults() {
    const R = race;
    R.resultsShown = true;
    Sound.stopEngine();
    // Cars still running get a finishing time from their current pace.
    const est = c => c.finished ? c.finishTime : R.clock + Math.max(0, R.laps * R.T.L - c.s) / Math.max(30, c.v);
    const rows = R.cars.slice().sort((a, b) => est(a) - est(b));
    const pos = rows.indexOf(R.player) + 1;
    if (champ) {
      rows.forEach((c, k) => { champ.points[c.di] = (champ.points[c.di] || 0) + POINTS[k]; });
    }
    $('#results-title').textContent = `${R.B.c.name}: you finished ${ORD(pos).toLowerCase()}`;
    const qualified = pos <= 3;
    $('#results-sub').textContent = champ
      ? (qualified ? (champ.round < COURSES.length - 1 ? 'Top three! On to the next course.' : 'You made it through every course!') : 'Only the top three go through. Have another go.')
      : (pos === 1 ? 'A winner! Leo does a victory doughnut.' : 'Have another go and drift harder.');
    const t = $('#results-table');
    t.innerHTML = `<thead><tr><th>POS</th><th></th><th>DRIVER</th><th>TIME</th><th>BEST LAP</th>${champ ? '<th>PTS</th>' : ''}</tr></thead>`;
    const body = document.createElement('tbody');
    rows.forEach((c, k) => {
      const tr = document.createElement('tr');
      if (c === R.player) tr.className = 'me';
      tr.innerHTML = `<td class="num">${k + 1}</td><td><img alt="" src="${faceURL[c.di]}"></td><td></td><td class="num">${fmt(est(c))}</td><td class="num">${fmt(c.best)}</td>${champ ? `<td class="num">${champ.points[c.di]}</td>` : ''}`;
      tr.children[2].textContent = DRIVERS[c.di].name;
      body.append(tr);
    });
    t.append(body);
    const acts = $('#results-actions');
    acts.innerHTML = '';
    const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); acts.append(b); };
    if (champ) {
      if (qualified && champ.round < COURSES.length - 1) add('Next course', () => { champ.round++; startRace(champ.round); });
      else if (qualified) add('Final standings', standings);
      else add('Try again', () => startRace(champ.round));
      add('Quit', toTitle);
    } else {
      add('Race again', () => startRace(R.idx));
      add('Choose course', () => { toTitle(); courseList(); show('courses'); });
      add('Title', toTitle);
    }
    show('results');
  }

  function standings() {
    const rows = DRIVERS.map((d, i) => [i, champ.points[i] || 0]).sort((a, b) => b[1] - a[1]);
    const pos = rows.findIndex(r => r[0] === 0) + 1;
    $('#results-title').textContent = pos === 1 ? 'Leo is the champion!' : `Championship: ${ORD(pos).toLowerCase()} overall`;
    $('#results-sub').textContent = 'Final points after all five courses.';
    const t = $('#results-table');
    t.innerHTML = '<thead><tr><th>POS</th><th></th><th>DRIVER</th><th>POINTS</th></tr></thead>';
    const body = document.createElement('tbody');
    rows.forEach(([di, pts], k) => {
      const tr = document.createElement('tr');
      if (di === 0) tr.className = 'me';
      tr.innerHTML = `<td class="num">${k + 1}</td><td><img alt="" src="${faceURL[di]}"></td><td></td><td class="num">${pts}</td>`;
      tr.children[2].textContent = DRIVERS[di].name;
      body.append(tr);
    });
    t.append(body);
    const acts = $('#results-actions');
    acts.innerHTML = '';
    const b = document.createElement('button'); b.textContent = 'Title'; b.addEventListener('click', toTitle); acts.append(b);
    show('results');
  }

  function setPaused(on) {
    if (!race || race.attract || mode === 'garage' || race.resultsShown) return;
    paused = on;
    Sound.suspend(on);
    show(on ? 'pause' : null);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    Sound.init();
    switch (b.dataset.action) {
      case 'champ': champ = { round: 0, points: {} }; startRace(0); break;
      case 'single': courseList(); show('courses'); break;
      case 'garage': garage(); break;
      case 'back': if (mode === 'garage') toTitle(); else show('title'); break;
      case 'resume': setPaused(false); break;
      case 'restart': setPaused(false); startRace(race.idx); break;
      case 'quit': setPaused(false); toTitle(); break;
    }
  });

  // ---------------------------------------------------------------- input
  const MAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', KeyZ: 'up', ArrowDown: 'down', KeyS: 'down', KeyX: 'down',
    Space: 'drift', ShiftLeft: 'drift', ShiftRight: 'drift',
  };
  addEventListener('keydown', e => {
    const k = MAP[e.code];
    const ingame = race && !race.attract && !paused && mode !== 'garage';
    if (k && ingame) { if (!keys[k]) edge[k] = true; keys[k] = true; edge.any = true; e.preventDefault(); }
    if ((e.code === 'KeyP' || e.code === 'Escape') && race && !race.attract) setPaused(!paused);
    if (e.code === 'KeyM') Sound.toggleMusic();
  });
  addEventListener('keyup', e => { const k = MAP[e.code]; if (k) keys[k] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (race && !race.attract && mode !== 'garage') setPaused(true); });
  for (const b of document.querySelectorAll('#touch [data-key]')) {
    const k = b.dataset.key;
    const on = e => { e.preventDefault(); if (!keys[k]) edge[k] = true; keys[k] = true; edge.any = true; b.classList.add('down'); };
    const off = e => { e.preventDefault(); keys[k] = false; b.classList.remove('down'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  }
  $('#touch-pause').addEventListener('click', () => setPaused(true));
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !isTouch) { isTouch = true; updateTouch(); } });
  addEventListener('resize', updateTouch);

  // ---------------------------------------------------------------- loop
  let last = performance.now(), acc = 0;
  const STEP = 1 / 120;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (race && !paused) {
      acc += dt;
      while (acc >= STEP) { update(STEP); for (const k in edge) edge[k] = false; acc -= STEP; }
      render(dt);
    }
    requestAnimationFrame(frame);
  }

  // test hook: lets automated checks drive the game
  window.__md3 = {
    get race() { return race; }, get mode() { return mode; }, keys, edge, startRace, newRace,
    go() { mode = 'race'; race.goT = 0; },
    // Runs the simulation flat out; control(race) is called every step to drive.
    sim(seconds, control) { for (let t = 0; t < seconds; t += STEP) { if (control) control(race); update(STEP); for (const k in edge) edge[k] = false; } },
  };

  toTitle();
  requestAnimationFrame(frame);
})();
