'use strict';
// Synthesised sound: engine, tyre squeal, impacts, countdown beeps and a small
// original chiptune loop. Nothing is sampled; everything is WebAudio oscillators.
const Sound = (() => {
  let ctx = null, master, sfx, musicBus, noise;
  let engine = null, skid = null;
  let musicOn = true, muted = false, musicTimer = null, nextNote = 0, step = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function startEngine() {
    if (!ctx || engine) return;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), gain = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square';
    o1.frequency.value = 50; o2.frequency.value = 25;
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 4;
    gain.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(gain); gain.connect(sfx);
    o1.start(); o2.start();

    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), sg = ctx.createGain();
    src.buffer = noise; src.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 3;
    sg.gain.value = 0;
    src.connect(bp); bp.connect(sg); sg.connect(sfx); src.start();

    engine = { o1, o2, lp, gain };
    skid = { src, bp, gain: sg };
  }

  function stopEngine() {
    if (!engine) return;
    const t = ctx.currentTime;
    engine.gain.gain.setTargetAtTime(0, t, 0.05);
    skid.gain.gain.setTargetAtTime(0, t, 0.05);
    const e = engine, s = skid;
    setTimeout(() => { try { e.o1.stop(); e.o2.stop(); s.src.stop(); } catch (_) { /* already stopped */ } }, 300);
    engine = skid = null;
  }

  // rpm 0..1 within the current gear, throttle 0..1
  function setEngine(rpm, throttle) {
    if (!engine) return;
    const t = ctx.currentTime, f = 38 + rpm * 150;
    engine.o1.frequency.setTargetAtTime(f, t, 0.04);
    engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    engine.lp.frequency.setTargetAtTime(500 + throttle * 1400 + rpm * 600, t, 0.05);
    engine.gain.gain.setTargetAtTime(0.09 + throttle * 0.07, t, 0.05);
  }

  function setSkid(amount) {
    if (!skid) return;
    const t = ctx.currentTime;
    skid.gain.gain.setTargetAtTime(amount * 0.16, t, 0.04);
    skid.bp.frequency.setTargetAtTime(2000 + amount * 900, t, 0.1);
  }

  function burst(dur, freq, vol, type = 'lowpass') {
    if (!ctx) return;
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + dur);
  }

  function tone(freq, dur, type = 'square', vol = 0.15, when = 0, dest = sfx) {
    if (!ctx) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }

  const bump = (strength = 1) => { burst(0.18, 300, 0.5 * strength); tone(70, 0.15, 'sine', 0.4 * strength); };
  const crash = () => { burst(0.45, 900, 0.7); tone(55, 0.3, 'sine', 0.5); };
  const scrape = () => burst(0.12, 3500, 0.12, 'highpass');
  const land = (strength) => { burst(0.2, 220, Math.min(0.8, 0.3 + strength)); tone(60, 0.18, 'sine', 0.4); };
  const beep = (high) => tone(high ? 1320 : 660, high ? 0.5 : 0.22, 'square', 0.18);
  const blip = () => tone(990, 0.06, 'square', 0.08);

  // ---------------------------------------------------------------- music
  // 150 bpm, sixteen 16th-note steps per bar, four bars: Am - F - G - E.
  const STEP = 60 / 150 / 4;
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const LEAD = [
    [69, 0, 72, 0, 76, 0, 74, 72, 0, 69, 0, 72, 74, 0, 72, 0],
    [72, 0, 69, 0, 65, 0, 69, 72, 0, 77, 0, 76, 74, 0, 72, 0],
    [71, 0, 74, 0, 79, 0, 77, 76, 0, 74, 0, 71, 74, 0, 76, 0],
    [76, 0, 80, 0, 83, 0, 80, 0, 76, 0, 74, 0, 71, 0, 68, 0],
  ];
  const ROOTS = [45, 41, 43, 40];
  const BASS = [0, 0, 12, 0, 7, 0, 12, 7];

  function schedule() {
    while (nextNote < ctx.currentTime + 0.12) {
      const bar = Math.floor(step / 16) % 4, s = step % 16, when = nextNote - ctx.currentTime;
      const n = LEAD[bar][s];
      if (n) tone(midi(n), STEP * 1.6, 'square', 0.07, when, musicBus);
      if (s % 2 === 0) tone(midi(ROOTS[bar] + BASS[(s / 2) % 8]), STEP * 1.8, 'triangle', 0.22, when, musicBus);
      if (s % 4 === 0) tone(s % 8 === 0 ? 110 : 90, 0.09, 'sine', 0.3, when, musicBus);
      if (s % 4 === 2) {
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = nextNote;
        src.buffer = noise; f.type = 'highpass'; f.frequency.value = 7000;
        g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        src.connect(f); f.connect(g); g.connect(musicBus); src.start(t, Math.random() * 0.5); src.stop(t + 0.06);
      }
      nextNote += STEP;
      step++;
    }
  }

  function startMusic() {
    if (!ctx || !musicOn || musicTimer) return;
    nextNote = ctx.currentTime + 0.05; step = 0;
    musicTimer = setInterval(schedule, 25);
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
  }

  function toggleMusic() {
    musicOn = !musicOn;
    if (musicOn) startMusic(); else stopMusic();
    return musicOn;
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.02);
    return muted;
  }

  function suspend(on) {
    if (!ctx) return;
    if (on) ctx.suspend(); else ctx.resume();
  }

  return {
    init, startEngine, stopEngine, setEngine, setSkid, bump, crash, scrape, land, beep, blip,
    startMusic, stopMusic, toggleMusic, toggleMute, suspend,
    get musicOn() { return musicOn; }, get muted() { return muted; },
  };
})();
