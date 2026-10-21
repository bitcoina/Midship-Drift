'use strict';
// Themes, courses and drivers for Midship Drift III.
//
// A course is a closed outline, path(t) for t in [0, 2pi), scaled to `length` metres.
// Wherever the outline crosses itself the track builder lifts one branch into a bridge,
// so a figure-eight gets one flyover and a trefoil gets three. Optional extras:
//   height(u)  base road height in metres at lap fraction u (0 = start line)
//   start      fraction of the outline for the start line (default: the straightest bit)
//   mirror     run the outline the other way round

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
