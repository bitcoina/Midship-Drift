'use strict';
// Themes, courses and drivers for Midship Drift III.
//
// A course is a closed outline, path(t) for t in [0, 2pi), scaled to `length` metres.
// Wherever the outline crosses itself the track builder lifts one branch into a bridge,
// so a figure-eight gets one flyover and a trefoil gets three. Optional extras:
//   height(u)  base road height in metres at lap fraction u (0 = start line)
//   start      fraction of the outline for the start line (default: the straightest bit)
//   mirror     run the outline the other way round
// Thunder Cup courses are drawn as points instead; see the note above them.

// Colours and scenery are shared with the earlier games.
const THEMES = {
  coast: {
    sky: ['#2f6fd0', '#79b4ee', '#d9effb'], fog: '#cfe7f6',
    ground: ['#79c45a', '#6cb64d'], under: ['#2d86c8', '#287bbb'],
    road: ['#6b6c75', '#65666f'], rumble: ['#f0f0f0', '#d8322f'], lane: '#f4f4f4',
    rail: ['#e2e5ea', '#d8322f'], slab: '#7c808c', pillar: '#c9ccd4',
    far: { kind: 'hills', cols: ['#6aa3c0', '#89bccf'] }, near: { kind: 'clouds', col: '#ffffff' },
    sun: { x: 300, y: 30, r: 12, col: '#fff6c8' },
    scenery: [['palm', 6], ['boulder', 1], ['billboard', 1]], gap: 4, underScenery: false,
    rock: '#b8a07a', boards: [["LEO'S GARAGE", '#1f4fa0', '#ffffff'], ['MIDSHIP', '#e8e8e8', '#c81e1e'], ['SURF SHACK', '#ffd23f', '#1a1a1a']],
  },
  canyon: {
    sky: ['#e3672a', '#f4a95c', '#fde3b0'], fog: '#f6d2a0',
    ground: ['#d9844c', '#cd7842'], under: ['#3f93b9', '#3889ae'],
    road: ['#7a6158', '#735a52'], rumble: ['#f4f4f4', '#2a2a2a'], lane: '#f4e9c8',
    rail: ['#f0e6d2', '#2a2a2a'], slab: '#8a6a58', pillar: '#c79a76',
    far: { kind: 'mesas', cols: ['#b04a2c', '#c4603a'] }, near: null,
    sun: { x: 90, y: 46, r: 16, col: '#fff1b8' },
    scenery: [['cactus', 5], ['boulder', 3], ['mesa', 1], ['billboard', 1]], gap: 5, underScenery: false,
    rock: '#a8543a', boards: [['GAS 24H', '#c81e1e', '#ffffff'], ['TURBO!', '#141414', '#ffd23f'], ["LEO'S GARAGE", '#1f4fa0', '#ffffff']],
  },
  alpine: {
    sky: ['#04071a', '#121d48', '#34427a'], fog: '#26315c', stars: true,
    ground: ['#e3ebf7', '#d3deee'], under: ['#9fbfe6', '#94b5dd'],
    road: ['#3d4352', '#383e4c'], rumble: ['#ffffff', '#2b6fd6'], lane: '#e8eefc',
    rail: ['#cdd6e6', '#2b6fd6'], slab: '#4a5266', pillar: '#7c869c',
    far: { kind: 'mountains', cols: ['#26365f', '#dfe8fb'] }, near: null,
    sun: { x: 320, y: 26, r: 9, col: '#f4f1de' },
    scenery: [['pineSnow', 6], ['lamp', 2], ['billboard', 1]], gap: 4, underScenery: false,
    rock: '#7a8296', boards: [['SKI LIFT', '#2b6fd6', '#ffffff'], ['HOT COCOA', '#7a2a1a', '#ffe9c0'], ['MIDSHIP', '#e8e8e8', '#c81e1e']],
  },
  skyway: {
    sky: ['#2a0f55', '#9a3a8c', '#ff9d6a'], fog: '#c06a8c',
    ground: ['#2b2542', '#27213b'], under: ['#2b2542', '#27213b'],
    road: ['#4b4b59', '#454553'], rumble: ['#ff3fa4', '#ffffff'], lane: '#ffe4f2',
    rail: ['#f2e6ff', '#ff3fa4'], slab: '#3a3448', pillar: '#6c6280',
    far: { kind: 'city', cols: ['#3b2160', '#ffd27a'] }, near: { kind: 'clouds', col: '#e98ab0' },
    sun: { x: 192, y: 84, r: 22, col: '#ffcf7a' },
    scenery: [['building', 6], ['lamp', 2], ['billboard', 1]], gap: 3, underScenery: true,
    rock: '#5a4a6a', boards: [['NEON NIGHTS', '#14102a', '#ff3fa4'], ["LEO'S GARAGE", '#1f4fa0', '#ffffff'], ['FULL BOOST', '#ffd23f', '#14102a']],
  },
  volcano: {
    sky: ['#140404', '#4e1208', '#b8391a'], fog: '#6e2412',
    ground: ['#2d2424', '#261e1e'], under: ['#ff6a1a', '#f2520f'],
    road: ['#3b3535', '#363030'], rumble: ['#ffcc00', '#222222'], lane: '#ffcc00',
    rail: ['#ffcc00', '#222222'], slab: '#2a2224', pillar: '#4a3c3c',
    far: { kind: 'volcano', cols: ['#3a2020'] }, near: null,
    sun: null,
    scenery: [['ember', 4], ['boulderDark', 3], ['billboard', 1]], gap: 4, underScenery: false,
    rock: '#3a3030', boards: [['DANGER', '#ffcc00', '#141414'], ['LAVA VIEW', '#141414', '#ff7a1a'], ['MIDSHIP', '#e8e8e8', '#c81e1e']],
  },

  // ---- Thunder Cup themes. water: the ground is sea; snowline: hillside above this
  // height turns white; storm: rain and lightning.
  sea: {
    sky: ['#1f78d6', '#74bdf0', '#d4effb'], fog: '#c3e5f6', water: true,
    ground: ['#1b6cc0', '#2277cb'],
    road: ['#787a84', '#72747e'], rumble: ['#ffffff', '#ff7a1a'], lane: '#ffffff',
    rail: ['#ffffff', '#1f9be0'], slab: '#d8d1bf', pillar: '#efe8d6',
    far: { kind: 'hills', cols: ['#3f9a86', '#6cb89e'] }, near: { kind: 'clouds', col: '#ffffff' },
    sun: { x: 380, y: 26, r: 13, col: '#fff7cf' },
    scenery: [['boat', 3], ['buoy', 3], ['islet', 2]], gap: 6,
    rock: '#9a8a70', boards: [['SURF SHACK', '#ffd23f', '#1a1a1a'], ["LEO'S GARAGE", '#1f4fa0', '#ffffff']],
  },
  peak: {
    sky: ['#1d4fb8', '#5f9fe6', '#d8ecfb'], fog: '#cbe2f5', snowline: 44,
    ground: ['#5ea84c', '#54a043'], cliff: '#8c8577',
    road: ['#5d5f68', '#585a63'], rumble: ['#ffffff', '#d8322f'], lane: '#ffffff',
    rail: ['#f2f2f2', '#d8322f'], slab: '#8c8577', pillar: '#a8a296',
    far: { kind: 'mountains', cols: ['#4a6fa8', '#f4f8ff'] }, near: { kind: 'clouds', col: '#ffffff' },
    sun: { x: 120, y: 22, r: 11, col: '#fffbe0' },
    scenery: [['pine', 7], ['boulder', 2], ['billboard', 1]], gap: 3,
    rock: '#8c8577', boards: [['SUMMIT 1KM', '#2b6fd6', '#ffffff'], ['HOT COCOA', '#7a2a1a', '#ffe9c0'], ['MIDSHIP', '#e8e8e8', '#c81e1e']],
  },
  meadow: {
    sky: ['#3d8fe0', '#8fcaf4', '#e6f5fb'], fog: '#d6eef8',
    ground: ['#7cc44f', '#71ba45'], cliff: '#9c7a52',
    road: ['#6c6d76', '#666770'], rumble: ['#ffffff', '#2f9d45'], lane: '#f4f4f4',
    rail: ['#ffffff', '#2f9d45'], slab: '#9c8f7a', pillar: '#c9c0ad',
    far: { kind: 'hills', cols: ['#5f9f6a', '#8cc08a'] }, near: { kind: 'clouds', col: '#ffffff' },
    sun: { x: 300, y: 24, r: 12, col: '#fff6c8' },
    scenery: [['pine', 4], ['sheep', 3], ['barn', 1], ['billboard', 1]], gap: 4,
    rock: '#8a7a64', boards: [['FARM SHOP', '#c81e1e', '#ffffff'], ["LEO'S GARAGE", '#1f4fa0', '#ffffff'], ['TUNNEL', '#ffd23f', '#1a1a1a']],
  },
  dusk: {
    sky: ['#3a1e6e', '#c0507a', '#ffb07a'], fog: '#e3907c',
    ground: ['#c8804e', '#bd7546'],
    road: ['#6e5a5a', '#685454'], rumble: ['#ffd23f', '#3a1e6e'], lane: '#ffe9b8',
    rail: ['#ffd23f', '#3a1e6e'], slab: '#7a5a50', pillar: '#a8745a',
    far: { kind: 'mesas', cols: ['#7a3448', '#94405a'] }, near: null,
    sun: { x: 250, y: 64, r: 20, col: '#ffe08a' },
    scenery: [['cactus', 4], ['mesa', 2], ['boulder', 2], ['billboard', 1]], gap: 4,
    rock: '#a05a44', boards: [['BIG AIR!', '#ffd23f', '#c81e1e'], ['TURBO!', '#141414', '#ffd23f'], ['MIDSHIP', '#e8e8e8', '#c81e1e']],
  },
  storm: {
    sky: ['#0d0b1c', '#2a2648', '#4a4670'], fog: '#3a3658', stars: false, storm: true,
    ground: ['#2c3a30', '#27342b'],
    road: ['#3c3f4a', '#383b45'], rumble: ['#ffffff', '#7a5cff'], lane: '#d8d4ff',
    rail: ['#d8d4ff', '#7a5cff'], slab: '#3a3a4a', pillar: '#5a5a6e',
    far: { kind: 'mountains', cols: ['#1c1a34', '#5a5880'] }, near: { kind: 'clouds', col: '#4a4670' },
    sun: null,
    scenery: [['pineDark', 5], ['lamp', 2], ['billboard', 1]], gap: 4,
    rock: '#4a4a5a', boards: [['THUNDER', '#141414', '#ffd23f'], ['NEON NIGHTS', '#14102a', '#ff3fa4'], ['MIDSHIP', '#e8e8e8', '#c81e1e']],
  },
};

const S = Math.sin, C = Math.cos;

const COURSES = [
  {
    id: 'pretzel', name: 'Pretzel Park', theme: 'coast', length: 1400,
    blurb: 'A seaside figure-eight with one big flyover.',
    path: t => [C(t) * 1.3, S(t) * C(t)],
    height: u => 2.5 * S(u * Math.PI * 6) ** 2,
  },
  {
    id: 'hook', name: 'Canyon Hook', theme: 'canyon', length: 1500,
    blurb: 'A long desert sweeper that hooks back under itself.',
    path: t => { const r = 0.45 + C(t); return [r * C(t), r * S(t)]; },
    height: u => 4 * S(u * Math.PI * 2) ** 2,
  },
  {
    id: 'trefoil', name: 'Trefoil Peaks', theme: 'alpine', length: 1700,
    blurb: 'A three-leaf knot through the moonlit pines. Three bridges.',
    path: t => [S(t) + 2 * S(2 * t), C(t) - 2 * C(2 * t)],
  },
  {
    id: 'spaghetti', name: 'Spaghetti Junction', theme: 'skyway', length: 1800,
    blurb: 'Neon flyovers stacked three decks high.',
    path: t => { const r = 0.3 + C(2 * t); return [r * C(t) * 1.3, r * S(t)]; },
    height: () => 10,
  },
  {
    id: 'lava', name: 'Lava Knot', theme: 'volcano', length: 2400,
    blurb: 'Seven crossings over the lava fields. Hold on tight.',
    path: t => [S(2 * t) * 1.5, C(3 * t)],
  },

  // ---- Thunder Cup: drawn courses. Each point is [x, z, height] in metres; the road
  // passes through them on a smooth spline. Extras:
  //   startPoint  which point the start line sits on
  //   terrain     the road runs over hillsides that rise and fall with it
  //   tunnels     [from point, to point] pairs: the road is roofed over between them
  //   jumps       { at: point, gap: metres, rise: metres }: a kicker ramp, then a gap
  {
    id: 'stilts', name: 'Seaspray Stilts', theme: 'sea', startPoint: 4,
    blurb: 'Roller-coaster stilts over the open sea. Keep it pinned over the crests.',
    points: [[0, 0, 9], [120, 0, 10], [240, 10, 15], [350, 40, 9], [430, 110, 17], [450, 200, 10], [400, 280, 18],
      [310, 310, 10], [220, 280, 17], [170, 200, 12], [140, 100, 20], [110, -20, 24], [60, -120, 15], [-40, -170, 20],
      [-150, -150, 11], [-240, -80, 18], [-260, 30, 10], [-200, 120, 17], [-100, 110, 9], [-40, 40, 13]],
  },
  {
    id: 'summit', name: 'Summit Switchback', theme: 'peak', startPoint: 0, terrain: true,
    blurb: 'Three hairpins up a steep mountain, then a flat-out plunge down the far side.',
    points: [[0, 0, 0], [150, 0, 0], [260, 20, 3], [330, 80, 8], [300, 140, 14], [180, 150, 22], [90, 160, 28],
      [30, 190, 31], [40, 240, 33], [110, 250, 38], [220, 255, 45], [300, 270, 48], [300, 320, 50], [220, 335, 55],
      [120, 340, 60], [40, 350, 62], [-60, 330, 58], [-150, 280, 48], [-200, 190, 36], [-210, 90, 22], [-170, 10, 10],
      [-100, -30, 3], [-40, -15, 0]],
  },
  {
    id: 'vale', name: 'Tunnel Vale', theme: 'meadow', startPoint: 0, terrain: true,
    blurb: 'Rolling farmland with two tunnels bored through the hills.',
    points: [[0, 0, 2], [140, 0, 4], [260, -20, 8], [360, -70, 10], [430, -150, 8], [450, -260, 4], [400, -350, 6],
      [300, -390, 12], [190, -380, 8], [100, -330, 3], [20, -300, 6], [-80, -310, 10], [-170, -260, 9], [-220, -170, 6],
      [-230, -70, 2], [-170, 0, 4], [-80, 20, 3]],
    tunnels: [[2, 4], [10, 13]],
  },
  {
    id: 'gorge', name: 'Big Air Gorge', theme: 'dusk', startPoint: 0,
    blurb: 'A sunset figure-eight with a gap jump right over the road below.',
    points: [[-150, -330, 2], [0, -360, 2], [150, -330, 3], [240, -240, 4], [230, -130, 4], [130, -60, 3], [0, 0, 2],
      [-130, 60, 4], [-230, 130, 8], [-250, 250, 12], [-170, 350, 16], [0, 380, 18], [170, 350, 20], [250, 250, 22],
      [230, 130, 22], [130, 65, 22], [0, 0, 22], [-130, -60, 14], [-230, -130, 8], [-250, -240, 4]],
    jumps: [{ at: 15.6, gap: 26, rise: 5 }],
  },
  {
    id: 'spiral', name: 'Thunder Spiral', theme: 'storm', startPoint: 0,
    blurb: 'Climb a spiral into the storm clouds, then fly back down over it.',
    points: (() => {
      const p = [[0, 0, 4], [140, 0, 5], [250, 25, 7]];
      // A spiral that tightens and climbs one and a half turns round (250, 250).
      for (let k = 0; k <= 16; k++) {
        const f = k / 16, a = -Math.PI / 2 + 0.35 + f * 1.444 * Math.PI * 2, r = 210 - 110 * f;
        p.push([250 + C(a) * r, 250 + S(a) * r, 9 + 33 * f]);
      }
      return p.concat([[110, 350, 40], [-20, 330, 32], [-150, 280, 24], [-250, 190, 16], [-260, 80, 9], [-190, 10, 5], [-90, -10, 4]]);
    })(),
  },
];

// Two championships of five courses each.
const CUPS = [
  { name: 'Sunshine Cup', courses: [0, 1, 2, 3, 4], blurb: 'The original five knots and flyovers.' },
  { name: 'Thunder Cup', courses: [5, 6, 7, 8, 9], blurb: 'Sea stilts, a mountain, tunnels, a big jump and a storm.' },
];

// Ten cartoon racers. Faces are drawn from these specs; body is the car shape.
const DRIVERS = [
  { name: 'LEO', body: 'mr2', color: '#d8322f', skill: 1,
    face: { skin: '#f2c49b', hair: '#6b3d1e', style: 'spiky', mouth: 'grin', extra: 'freckles', helmet: '#ffd23f' } },
  { name: 'RUSTY', body: 'hotrod', color: '#e8772e', skill: 0.97,
    face: { skin: '#e9b48e', hair: '#d9d9d9', style: 'bald', mouth: 'smile', extra: 'moustache', helmet: '#8a5a2b' } },
  { name: 'MEI', body: 'bubble', color: '#f06ab0', skill: 0.95,
    face: { skin: '#f6d2b0', hair: '#1a1a22', style: 'bob', mouth: 'smile', extra: 'blush', helmet: '#ffffff' } },
  { name: 'BIG TONY', body: 'truck', color: '#3fa34d', skill: 0.94,
    face: { skin: '#c98e62', hair: '#2a1a12', style: 'bald', mouth: 'grin', extra: 'beard', helmet: '#2a2a2a' } },
  { name: 'ZIGGY', body: 'buggy', color: '#b8e03a', skill: 0.93,
    face: { skin: '#f2c49b', hair: '#9b3fd6', style: 'mohawk', mouth: 'fangs', extra: null, helmet: '#9b3fd6' } },
  { name: 'DR VOLT', body: 'wedge', color: '#2ec4d6', skill: 0.92,
    face: { skin: '#f6d2b0', hair: '#f4f4f4', style: 'afro', mouth: 'o', extra: 'glasses', helmet: '#f4f4f4' } },
  { name: 'LOLA', body: 'formula', color: '#e23b3b', skill: 0.91,
    face: { skin: '#8d5a3b', hair: '#ffd23f', style: 'pony', mouth: 'smile', extra: null, helmet: '#e23b3b' } },
  { name: 'KAI', body: 'wedge', color: '#2f6fd6', skill: 0.9,
    face: { skin: '#d9a77c', hair: '#1a1a22', style: 'spiky', mouth: 'smile', extra: 'shades', helmet: '#2f6fd6' } },
  { name: 'GRANNY G', body: 'bubble', color: '#a98be0', skill: 0.89,
    face: { skin: '#f2c9a8', hair: '#c8c8d0', style: 'bun', mouth: 'smile', extra: 'glasses', helmet: '#a98be0' } },
  { name: 'BARON', body: 'formula', color: '#7a1e2a', skill: 0.88,
    face: { skin: '#f2c49b', hair: '#3a2a1a', style: 'cap', mouth: 'smile', extra: 'moustache', helmet: '#7a1e2a' } },
];

const PAINTS = [
  ['Super red', '#d8322f'], ['Super white', '#eeeeee'], ['Midnight blue', '#22357a'],
  ['Sunburst yellow', '#f2c12e'], ['Electric lime', '#8ad62e'], ['Black', '#26272c'],
];
