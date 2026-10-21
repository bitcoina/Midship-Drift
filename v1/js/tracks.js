'use strict';
// Themes and courses for Midship Drift.
//
// A course is a list of sections. Each section is [length, curve, road, ground]:
//   length  segments (one segment is 200 world units; ~60 segments/second flat out)
//   curve   bend strength, negative = left. 2 is gentle, 4 is firm, 6 is a hairpin.
//   road    road height to ease toward by the end of the section, in hundreds of units
//   ground  ground height under the road; omit to sit on the ground. When the ground is
//           lower than the road, the road is carried on pillars with crash rails.
// {jump: h} adds a short kicker that rises h and drops back, enough to fly at speed.
// Courses end wherever they like; the builder eases them back to level to close the loop.

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

const COURSES = [
  {
    id: 'coast', name: 'Coastline Sprint', theme: 'coast', blurb: 'Rolling seaside hills and a causeway over the bay.',
    sections: [
      [70, 0, 0],
      [50, 2, 0], [40, 0, 14], [60, -3, 22], [40, 0, 8],
      { jump: 6 },
      [60, 3, 0], [50, 0, -8], [40, -2, 4],
      [50, 0, 24, 0], [70, 3, 24, 0], [40, 0, 14, 0], [60, -3, 18, 0], [40, 0, 0],
      [60, 4, 26], [40, 0, 34], [60, -4, 14], [30, 0, 4],
      { jump: 5 },
      [60, 3, 0], [50, -3, 12], [60, 2, 0], [50, -4, 0], [60, 0, 0],
    ],
  },
  {
    id: 'canyon', name: 'Red Canyon', theme: 'canyon', blurb: 'Steep crests, blind drops and a trestle across the river.',
    sections: [
      [70, 0, 0],
      [40, 3, 18], [30, 0, 36], [40, 0, 6],
      { jump: 8 },
      [60, -4, 0], [50, 3, 22], [40, 0, -4], [50, -5, -4], [40, 0, 26],
      [30, 0, 4],
      [50, 2, 30, 0], [60, -3, 30, 0], [40, 0, 40, 0], [30, 0, 22, 0], [50, 4, 22, 0], [40, 0, 0],
      { jump: 7 },
      [60, -3, 16], [40, 0, 34], [40, 3, 6], [50, -4, 0], [60, 2, 0], [60, 0, 0],
    ],
  },
  {
    id: 'alpine', name: 'Alpine Night', theme: 'alpine', blurb: 'Moonlit switchbacks and a frozen-lake viaduct.',
    sections: [
      [70, 0, 0],
      [50, -4, 10], [50, 4, 24], [40, 0, 40], [50, -5, 46], [40, 0, 30],
      [50, 5, 34], [40, 0, 18], { jump: 6 }, [40, -3, 8],
      [40, 0, 26, 0], [70, -4, 30, 0], [50, 0, 18, 0], [60, 5, 26, 0], [40, 0, 8, 0], [30, 0, 0],
      [50, -3, 14], [40, 3, 0], [50, -6, -6], [40, 0, 10], [60, 4, 0], [60, 0, 0],
    ],
  },
  {
    id: 'skyway', name: 'Sky Highway', theme: 'skyway', blurb: 'Elevated expressway at dusk with big drops between towers.',
    sections: [
      [70, 0, 0],
      [60, 0, 40, 0], [60, 3, 50, 0], [30, 0, 56, 0], [40, 0, 24, 0],
      [60, -4, 30, 0], [40, 0, 46, 0], [24, 0, 16, 0], [60, 4, 22, 0],
      [40, -2, 50, 0], [50, -5, 52, 0], [30, 0, 30, 0], [30, 0, 44, 0], [24, 0, 12, 0],
      [60, 3, 18, 0], [40, 0, 0],
      { jump: 6 }, [60, -3, 0], [60, 0, 0],
    ],
  },
  {
    id: 'volcano', name: 'Lava Ridge', theme: 'volcano', blurb: 'Black rock, lava fields and the longest bridge of all.',
    sections: [
      [70, 0, 0],
      [50, 4, 16], [40, 0, 30], [40, -5, 10], { jump: 8 },
      [30, 0, 30, 0], [70, -4, 36, 0], [40, 0, 50, 0], [30, 0, 22, 0], [60, 5, 30, 0], [30, 0, 42, 0], [24, 0, 14, 0],
      [50, -5, 14, 0], [40, 0, 0],
      [40, 3, 20], [30, 0, 40], [30, 0, 8], { jump: 7 },
      [50, -6, 0], [40, 4, 12], [50, -3, 0], [60, 0, 0],
    ],
  },
];

const RIVALS = [
  { name: 'KENJI', model: 'gt', color: '#f2c12e', skill: 0.97 },
  { name: 'RUBY', model: 'buggy', color: '#e2463b', skill: 0.95 },
  { name: 'MAX', model: 'muscle', color: '#2f6fd6', skill: 0.94 },
  { name: 'SOFIA', model: 'gt', color: '#ff7a1a', skill: 0.93 },
  { name: 'OLGA', model: 'hatch', color: '#3fb06a', skill: 0.92 },
  { name: 'BRUNO', model: 'buggy', color: '#22b5c9', skill: 0.91 },
  { name: 'DEX', model: 'pickup', color: '#9a5cd0', skill: 0.90 },
  { name: 'TAMI', model: 'hatch', color: '#f06ab0', skill: 0.89 },
  { name: 'ZED', model: 'muscle', color: '#2a2c33', skill: 0.88 },
  { name: 'NINA', model: 'buggy', color: '#c9e04a', skill: 0.87 },
  { name: 'OTTO', model: 'pickup', color: '#d9d4c7', skill: 0.86 },
];
