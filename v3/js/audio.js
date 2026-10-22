'use strict';
// Synthesised sound: engine, tyre squeal, wind, impacts, jumps, thunder, countdown beeps
// and two small original chiptune loops with drums. Nothing is sampled; everything is
// WebAudio oscillators and filtered noise. Inside a tunnel the engine echoes.
const Sound = (() => {
  let ctx = null, master, sfx, musicBus, noise, echoSend;
  let engine = null, skid = null, wind = null;
  let musicOn = true, muted = false, musicTimer = null, nextNote = 0, step = 0, tune = 0, lastGear = 0;
  const VOL = 0.6;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // everything goes through a gentle compressor, which glues the mix together
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = muted ? 0 : VOL;
    comp.connect(master); master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(comp);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.2; musicBus.connect(comp);
    // tunnel echo: a short feedback delay the engine and tyres feed into
    const delay = ctx.createDelay(1), fb = ctx.createGain(), dl = ctx.createBiquadFilter();
    delay.delayTime.value = 0.09; fb.gain.value = 0.42; dl.type = 'lowpass'; dl.frequency.value = 1800;
    echoSend = ctx.createGain(); echoSend.gain.value = 0;
    echoSend.connect(delay); delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(sfx);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---------------------------------------------------------------- engine
  function noiseSource(loop = true) {
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = loop;
    return src;
  }

  function startEngine() {
    if (!ctx || engine) return;
    // two saws a hair apart give a fat, beating note; a square an octave down adds body
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
    const lp = ctx.createBiquadFilter(), gain = ctx.createGain(), g3 = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'square';
    o2.detune.value = 9; g3.gain.value = 0.45;
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 5;
    gain.gain.value = 0;
    o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp); lp.connect(gain);
    gain.connect(sfx); gain.connect(echoSend);
    // exhaust rumble: low noise that opens up with the throttle
    const rum = noiseSource(), rlp = ctx.createBiquadFilter(), rg = ctx.createGain();
    rlp.type = 'lowpass'; rlp.frequency.value = 220; rg.gain.value = 0;
    rum.connect(rlp); rlp.connect(rg); rg.connect(sfx); rg.connect(echoSend);
    for (const o of [o1, o2, o3]) o.start();
    rum.start();

    const src = noiseSource(), bp = ctx.createBiquadFilter(), sg = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 3;
    sg.gain.value = 0;
    src.connect(bp); bp.connect(sg); sg.connect(sfx); sg.connect(echoSend); src.start();

    const wsrc = noiseSource(), wbp = ctx.createBiquadFilter(), wg = ctx.createGain();
    wbp.type = 'bandpass'; wbp.frequency.value = 700; wbp.Q.value = 0.7; wg.gain.value = 0;
    wsrc.connect(wbp); wbp.connect(wg); wg.connect(sfx); wsrc.start();

    engine = { o1, o2, o3, lp, gain, rum, rg };
    skid = { src, bp, gain: sg };
    wind = { src: wsrc, bp: wbp, gain: wg };
    lastGear = 0;
  }

  function stopEngine() {
    if (!engine) return;
    const t = ctx.currentTime;
    for (const g of [engine.gain, engine.rg, skid.gain, wind.gain]) g.gain.setTargetAtTime(0, t, 0.05);
    echoSend.gain.setTargetAtTime(0, t, 0.05);
    const e = engine, s = skid, w = wind;
    setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.o3.stop(); e.rum.stop(); s.src.stop(); w.src.stop(); } catch (_) { /* already stopped */ } }, 300);
    engine = skid = wind = null;
  }

  // rpm 0..1 within the current gear, throttle 0..1, gear number, speed 0..1
  function setEngine(rpm, throttle, gear = 0, speed = 0) {
    if (!engine) return;
    const t = ctx.currentTime, f = 42 + rpm * 160;
    engine.o1.frequency.setTargetAtTime(f, t, 0.04);
    engine.o2.frequency.setTargetAtTime(f, t, 0.04);
    engine.o3.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    engine.lp.frequency.setTargetAtTime(450 + throttle * 1500 + rpm * 700, t, 0.05);
    const level = 0.08 + throttle * 0.07;
    if (gear > lastGear) {
      // changing up: the note ducks for a moment, with a little click of the gearbox
      engine.gain.gain.cancelScheduledValues(t);
      engine.gain.gain.setValueAtTime(level * 0.35, t);
      engine.gain.gain.linearRampToValueAtTime(level, t + 0.12);
      tone(1800, 0.03, 'square', 0.03);
    } else engine.gain.gain.setTargetAtTime(level, t, 0.05);
    lastGear = gear;
    engine.rg.gain.setTargetAtTime(0.05 + throttle * 0.1, t, 0.08);
    wind.gain.gain.setTargetAtTime(speed * speed * 0.1, t, 0.2);
    wind.bp.frequency.setTargetAtTime(500 + speed * 900, t, 0.2);
  }

  function setSkid(amount) {
    if (!skid) return;
    const t = ctx.currentTime;
    skid.gain.gain.setTargetAtTime(amount * 0.16, t, 0.04);
    skid.bp.frequency.setTargetAtTime(2000 + amount * 900, t, 0.1);
  }

  // Inside a tunnel the engine and tyres echo off the walls.
  function setTunnel(on) {
    if (!ctx) return;
    echoSend.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.12);
  }

  // ---------------------------------------------------------------- effects
  function burst(dur, freq, vol, type = 'lowpass', sweepTo = 0, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when, src = noiseSource(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfx);
    src.start(t, Math.random() * 1.5); src.stop(t + dur);
  }

  function tone(freq, dur, type = 'square', vol = 0.15, when = 0, dest = sfx, slideTo = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }

  const bump = (strength = 1) => { burst(0.18, 300, 0.5 * strength); tone(70, 0.15, 'sine', 0.4 * strength); };
  const crash = () => { burst(0.45, 900, 0.7); tone(55, 0.3, 'sine', 0.5); };
  const scrape = () => burst(0.12, 3500, 0.12, 'highpass');
  const land = (strength) => { burst(0.2, 220, Math.min(0.8, 0.3 + strength)); tone(60, 0.18, 'sine', 0.4); };
  // countdown: a low beep for each red lamp, a high double beep for GO
  const beep = (high) => {
    if (high) { tone(1320, 0.5, 'square', 0.16); tone(660, 0.5, 'square', 0.08); }
    else { tone(660, 0.22, 'square', 0.16); tone(330, 0.22, 'square', 0.06); }
  };
  const blip = () => tone(990, 0.06, 'square', 0.08);
  // a turbo: rising rush of air and a quick upward sweep
  const turbo = () => { burst(0.5, 600, 0.35, 'bandpass', 4000); tone(300, 0.35, 'sawtooth', 0.06, 0, sfx, 900); };
  // leaving the ground over a crest or a jump
  const whoosh = () => burst(0.45, 2600, 0.28, 'bandpass', 500);
  // missing a jump: a crash and a cartoon falling whistle
  const fall = () => { tone(1200, 0.7, 'sine', 0.12, 0, sfx, 180); burst(0.6, 700, 0.6, 'lowpass', 0, 0.55); tone(50, 0.4, 'sine', 0.5, 0.55); };
  // thunder: a crack, then a long low roll
  const thunder = () => { burst(0.25, 3000, 0.25, 'highpass'); burst(2.6, 260, 0.9, 'lowpass', 60, 0.05); burst(1.8, 120, 0.6, 'lowpass', 0, 0.5); };
  // the crowd cheering at the start and finish
  function cheer() {
    if (!ctx) return;
    for (let k = 0; k < 4; k++) burst(1.4 + k * 0.2, 900 + k * 500, 0.12, 'bandpass', 0, k * 0.05);
  }

  // ---------------------------------------------------------------- music
  // Two loops, sixteen 16th-note steps per bar, four bars each.
  //   0: Sunshine Cup, 160 bpm, C - Am - F - G, bouncy
  //   1: Thunder Cup, 168 bpm, Em - C - D - B, driving
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const TUNES = [
    {
      bpm: 160, roots: [48, 45, 41, 43], bass: [0, 0, 12, 0, 7, 0, 12, 7],
      lead: [
        [72, 0, 76, 79, 0, 76, 72, 0, 74, 0, 76, 0, 79, 0, 84, 0],
        [81, 0, 79, 76, 0, 72, 76, 0, 81, 0, 79, 0, 76, 0, 74, 0],
        [77, 0, 81, 84, 0, 81, 77, 0, 76, 0, 77, 0, 81, 0, 79, 0],
        [79, 0, 83, 86, 0, 83, 79, 0, 77, 0, 76, 0, 74, 0, 71, 0],
      ],
    },
    {
      bpm: 168, roots: [40, 36, 38, 35], bass: [0, 12, 0, 12, 0, 12, 7, 12],
      lead: [
        [76, 0, 79, 0, 83, 0, 79, 76, 0, 74, 76, 0, 79, 0, 0, 0],
        [72, 0, 76, 0, 79, 0, 76, 72, 0, 71, 72, 0, 76, 0, 0, 0],
        [74, 0, 78, 0, 81, 0, 78, 74, 0, 76, 78, 0, 81, 0, 83, 0],
        [83, 0, 81, 0, 78, 0, 75, 0, 78, 0, 81, 0, 83, 0, 86, 0],
      ],
    },
  ];

  function drum(kind, t) {
    const when = t - ctx.currentTime;
    if (kind === 'kick') tone(150, 0.16, 'sine', 0.55, when, musicBus, 45);
    else if (kind === 'snare') {
      tone(190, 0.08, 'triangle', 0.18, when, musicBus);
      const src = noiseSource(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
      g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.connect(f); f.connect(g); g.connect(musicBus); src.start(t, Math.random()); src.stop(t + 0.15);
    } else {
      const open = kind === 'open', src = noiseSource(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = 7500;
      g.gain.setValueAtTime(open ? 0.12 : 0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.16 : 0.04));
      src.connect(f); f.connect(g); g.connect(musicBus); src.start(t, Math.random()); src.stop(t + 0.17);
    }
  }

  function schedule() {
    const T = TUNES[tune], STEP = 60 / T.bpm / 4;
    while (nextNote < ctx.currentTime + 0.12) {
      const bar = Math.floor(step / 16) % 4, s = step % 16, when = nextNote - ctx.currentTime;
      const n = T.lead[bar][s];
      if (n) {
        tone(midi(n), STEP * 1.6, 'square', 0.07, when, musicBus);
        tone(midi(n), STEP * 1.4, 'square', 0.025, when + STEP * 3, musicBus);   // slapback echo
      }
      if (s % 2 === 0) tone(midi(T.roots[bar] + T.bass[(s / 2) % 8]), STEP * 1.8, 'triangle', 0.24, when, musicBus);
      // a soft arpeggio of the chord, two octaves up
      if (s % 4 === 1) tone(midi(T.roots[bar] + 24 + [0, 7, 12, 7][(s >> 2) % 4]), STEP, 'triangle', 0.035, when, musicBus);
      if (s % 8 === 0 || s === 10) drum('kick', nextNote);
      if (s % 8 === 4) drum('snare', nextNote);
      if (s % 2 === 0) drum(s % 8 === 6 ? 'open' : 'hat', nextNote);
      if (bar === 3 && s >= 12) drum('snare', nextNote);   // fill into the next round
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

  function setTune(k) {
    if (k === tune) return;
    tune = k;
    if (musicTimer) { stopMusic(); startMusic(); }
  }

  function toggleMusic() {
    musicOn = !musicOn;
    if (musicOn) startMusic(); else stopMusic();
    return musicOn;
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ctx.currentTime, 0.02);
    return muted;
  }

  function suspend(on) {
    if (!ctx) return;
    if (on) ctx.suspend(); else ctx.resume();
  }

  return {
    init, startEngine, stopEngine, setEngine, setSkid, setTunnel, bump, crash, scrape, land, beep, blip,
    turbo, whoosh, fall, thunder, cheer, startMusic, stopMusic, setTune, toggleMusic, toggleMute, suspend,
    get musicOn() { return musicOn; }, get muted() { return muted; },
  };
})();
