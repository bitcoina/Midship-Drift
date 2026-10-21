'use strict';
// Midship Drift III online relay.
//
// Rooms hold up to four players. Each player's game simulates its own car and sends its
// state here about 20 times a second; the server passes it straight on to everyone else
// in the room. The server owns only the room list, the shared start time and the
// finishing order. No physics runs here.
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 4, LAPS = 4, FACES = 10, COURSES = 5;
const START_DELAY = 8500;    // ms from Start to GO: flyover, then the 3-2-1 countdown
const RESULTS_WAIT = 30000;  // ms after the first finisher before stragglers are cut off
const STATE_BUDGET = 40;     // car states a player may send per second
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, which look like 1 and 0

const rooms = new Map();
const everyone = new Set();
let nextId = 1;

// Render (and a browser) can check the server is up with a plain GET.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Midship Drift server is running. ${rooms.size} room(s), ${everyone.size} player(s).\n`);
});
const wss = new WebSocketServer({ server, maxPayload: 4096 });

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
function broadcast(room, msg, except) {
  const data = JSON.stringify(msg);
  for (const p of room.players) if (p !== except && p.ws.readyState === 1) p.ws.send(data);
}
const roster = room => room.players.map(p => ({ id: p.id, face: p.face, paint: p.paint }));
function lobby(room) {
  broadcast(room, { t: 'lobby', room: room.code, host: room.host.id, course: room.course, state: room.state, players: roster(room) });
}

function newCode() {
  let code;
  do code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  while (rooms.has(code));
  return code;
}

// The face asked for if nobody else has it, otherwise the first free one.
function freeFace(others, want) {
  const taken = new Set(others.map(p => p.face));
  if (want >= 0 && want < FACES && !taken.has(want)) return want;
  for (let f = 0; f < FACES; f++) if (!taken.has(f)) return f;
  return 0;
}

function enter(me, room, face, paint) {
  me.face = freeFace(room.players, face);
  me.paint = paint;
  me.room = room;
  room.players.push(me);
  send(me.ws, { t: 'joined', room: room.code, id: me.id });
  lobby(room);
}

function leave(me) {
  const room = me.room;
  if (!room) return;
  room.players = room.players.filter(p => p !== me);
  me.room = null;
  if (!room.players.length) { clearTimeout(room.timer); rooms.delete(room.code); return; }
  if (room.host === me) room.host = room.players[0];
  broadcast(room, { t: 'left', id: me.id });
  lobby(room);
  checkFinished(room);
}

function checkFinished(room) {
  if (room.state !== 'racing') return;
  if (room.players.every(p => room.fins.has(p.id))) results(room);
  else if (room.fins.size && !room.timer) room.timer = setTimeout(() => results(room), RESULTS_WAIT);
}

// Finishing order by race time; anyone who didn't finish goes last.
function results(room) {
  clearTimeout(room.timer);
  room.timer = null;
  if (room.state !== 'racing') return;
  const here = new Set(room.players.map(p => p.id));
  const order = room.racers
    .filter(id => room.fins.has(id) || here.has(id))
    .map(id => ({ id, ...(room.fins.get(id) || { time: null, best: null }) }))
    .sort((a, b) => (a.time === null ? Infinity : a.time) - (b.time === null ? Infinity : b.time));
  room.state = 'lobby';
  broadcast(room, { t: 'results', order });
  lobby(room);
}

function handle(me, m) {
  const room = me.room;
  switch (m.t) {
    case 'ping':
      send(me.ws, { t: 'pong', c: m.c, s: Date.now() });
      break;
    case 'create': {
      leave(me);
      const r = { code: newCode(), players: [], host: me, course: 0, state: 'lobby', fins: new Map(), racers: [], timer: null };
      rooms.set(r.code, r);
      enter(me, r, m.face | 0, m.paint | 0);
      break;
    }
    case 'join': {
      const r = rooms.get(String(m.room || '').trim().toUpperCase());
      if (!r) return send(me.ws, { t: 'error', msg: 'There is no room with that code.' });
      if (r === room) return lobby(r);
      if (r.players.length >= MAX_PLAYERS) return send(me.ws, { t: 'error', msg: 'That room is full (four players).' });
      if (r.state === 'racing') return send(me.ws, { t: 'error', msg: 'That room is mid-race. Try again when it finishes.' });
      leave(me);
      enter(me, r, m.face | 0, m.paint | 0);
      break;
    }
    case 'pick':
      if (room && room.state === 'lobby') {
        me.face = freeFace(room.players.filter(p => p !== me), m.face | 0);
        me.paint = m.paint | 0;
        lobby(room);
      }
      break;
    case 'course':
      if (room && room.host === me && room.state === 'lobby') {
        room.course = Math.max(0, Math.min(COURSES - 1, m.course | 0));
        lobby(room);
      }
      break;
    case 'start':
      if (room && room.host === me && room.state === 'lobby') {
        room.state = 'racing';
        room.fins = new Map();
        room.racers = room.players.map(p => p.id);
        broadcast(room, { t: 'go', course: room.course, laps: LAPS, startAt: Date.now() + START_DELAY, players: roster(room) });
        lobby(room);
      }
      break;
    case 'st':
      // Car states are relayed untouched apart from stamping who sent them.
      if (room && room.state === 'racing' && me.budget-- > 0) { m.id = me.id; broadcast(room, m, me); }
      break;
    case 'fin':
      if (room && room.state === 'racing' && !room.fins.has(me.id) && Number.isFinite(+m.time)) {
        const f = { time: +m.time, best: Number.isFinite(+m.best) ? +m.best : null };
        room.fins.set(me.id, f);
        broadcast(room, { t: 'fin', id: me.id, ...f });
        checkFinished(room);
      }
      break;
    case 'leave':
      leave(me);
      break;
  }
}

wss.on('connection', ws => {
  const me = { id: nextId++, ws, room: null, face: 0, paint: 0, budget: STATE_BUDGET, alive: true };
  everyone.add(me);
  ws.on('pong', () => { me.alive = true; });
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (_) { return; }
    if (m && typeof m.t === 'string') handle(me, m);
  });
  ws.on('close', () => { everyone.delete(me); leave(me); });
  ws.on('error', () => {});
});

// Refill each player's message budget every second.
setInterval(() => { for (const p of everyone) p.budget = STATE_BUDGET; }, 1000);

// Drop connections that have silently died (a phone that lost signal, say).
setInterval(() => {
  for (const p of everyone) {
    if (!p.alive) { p.ws.terminate(); continue; }
    p.alive = false;
    p.ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log(`Midship Drift server listening on port ${PORT}`));
