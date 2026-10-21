'use strict';
// Online play: the connection to the Midship Drift relay server.
//
// It keeps a clock in step with the server's (so every player's countdown hits GO
// together), and buffers the other players' car states so they can be drawn smoothly a
// moment in the past, between two updates, instead of jumping each time one arrives.
const Net = (() => {
  // The server's address. Add ?server=ws://localhost:8080 to the page URL to use a
  // server running on this computer instead.
  const DEFAULT_SERVER = 'wss://midship-drift.onrender.com';
  const url = new URLSearchParams(location.search).get('server') || DEFAULT_SERVER;

  let ws = null, opening = null, pingTimer = null;
  let offset = 0, rtt = 0;
  const samples = [], buffers = new Map(), handlers = {};

  function on(type, fn) { handlers[type] = fn; }
  const emit = (type, m) => { if (handlers[type]) handlers[type](m); };

  // Opens the connection if needed. A free server that has gone to sleep can take up to
  // a minute to answer the first time, so the timeout is generous.
  function connect() {
    if (ws && ws.readyState === 1) return Promise.resolve();
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      let sock;
      try { sock = new WebSocket(url); } catch (e) { opening = null; reject(e); return; }
      const timer = setTimeout(() => { sock.close(); }, 75000);
      sock.onopen = () => {
        clearTimeout(timer);
        ws = sock; opening = null;
        samples.length = 0;
        for (let i = 0; i < 5; i++) setTimeout(ping, i * 150);
        pingTimer = setInterval(ping, 2000);
        resolve();
      };
      sock.onclose = () => {
        clearTimeout(timer);
        clearInterval(pingTimer);
        const wasOpen = ws === sock;
        if (wasOpen) ws = null;
        if (opening) { opening = null; reject(new Error('Could not reach the server.')); }
        if (wasOpen) emit('closed', {});
      };
      sock.onmessage = e => {
        let m;
        try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.t === 'pong') return clock(m);
        if (m.t === 'st') return store(m);
        emit(m.t, m);
      };
    });
    return opening;
  }

  function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
  function close() { if (ws) ws.close(); ws = null; buffers.clear(); }

  // ---------------------------------------------------------------- clock
  // offset ≈ server time − the local time halfway through the round trip. The estimate
  // from the quickest of the last few pings is the most trustworthy.
  function ping() { send({ t: 'ping', c: Date.now() }); }
  function clock(m) {
    const now = Date.now(), trip = now - m.c;
    samples.push({ trip, off: m.s - (m.c + now) / 2 });
    if (samples.length > 10) samples.shift();
    const best = samples.reduce((a, b) => (b.trip < a.trip ? b : a));
    offset = best.off; rtt = best.trip;
  }
  const now = () => Date.now() + offset;

  // ---------------------------------------------------------------- remote cars
  function store(m) {
    if (!buffers.has(m.id)) buffers.set(m.id, []);
    const buf = buffers.get(m.id);
    if (buf.length && m.k <= buf[buf.length - 1].k) return;
    buf.push(m);
    if (buf.length > 30) buf.shift();
  }

  // A remote car's state at server time t (ms): between the two updates either side of
  // t, or carried forward for up to 0.3 s if updates have stopped. null if none yet.
  function sample(id, t) {
    const buf = buffers.get(id);
    if (!buf || !buf.length) return null;
    if (t <= buf[0].k) return Object.assign({ stale: false }, buf[0]);
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1], b = buf[i];
      if (t >= a.k && t <= b.k) {
        const f = (t - a.k) / Math.max(1, b.k - a.k), mix = key => a[key] + (b[key] - a[key]) * f;
        return {
          s: mix('s'), d: mix('d'), h: mix('h'), phi: mix('phi'), v: mix('v'), y: mix('y'), st: mix('st'),
          dr: b.dr, b: b.b, stale: false,
        };
      }
    }
    const last = buf[buf.length - 1], ahead = Math.min(0.3, (t - last.k) / 1000);
    return Object.assign({}, last, {
      s: last.s + last.v * Math.cos(last.phi) * ahead,
      d: last.d + last.v * Math.sin(last.phi) * ahead,
      stale: t - last.k > 1500,
    });
  }

  return {
    connect, send, close, on, now, sample,
    get open() { return !!ws && ws.readyState === 1; },
    get lag() { return Math.round(rtt / 2); },
    url,
  };
})();
