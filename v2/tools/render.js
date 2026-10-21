// Renders every sprite in studio.html to tools/raw/ using headless Chromium.
// Usage: node render.js [filter]   (filter = substring of sprite names to render)
// Then run: python3 pixelate.py   to build drift2/assets/.
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const SS = 4;                   // supersampling: render 4x, pixelate.py scales down
const CAR_PX_PER_M = 52;        // in-game, the player's car is drawn at 1:1 at this density
const CAR_ELEV = 11;            // camera elevation for cars, degrees
const POSE_STEP = 7;            // yaw between turn frames, degrees
const SCENERY_PX_PER_M = 30;
const SCENERY_ELEV = 7;

const PAINTS = ['#d01f26', '#ecebe3', '#1d1e22', '#f2c21b', '#2f55a8', '#aab0ba', '#1f5a3a', '#f07a1a'];
const RIVALS = [
  ['gt', '#f2c12e'], ['buggy', '#e2463b'], ['muscle', '#2f6fd6'], ['gt', '#ff7a1a'], ['hatch', '#3fb06a'], ['buggy', '#22b5c9'],
  ['pickup', '#9a5cd0'], ['hatch', '#f06ab0'], ['muscle', '#2a2c33'], ['buggy', '#c9e04a'], ['pickup', '#d9d4c7'],
];
const BOARDS = [
  ["LEO'S GARAGE", '#1f4fa0', '#ffffff'], ['MIDSHIP', '#e8e8e8', '#c81e1e'], ['SURF SHACK', '#ffd23f', '#1a1a1a'],
  ['GAS 24H', '#c81e1e', '#ffffff'], ['TURBO!', '#141414', '#ffd23f'], ['SKI LIFT', '#2b6fd6', '#ffffff'],
  ['HOT COCOA', '#7a2a1a', '#ffe9c0'], ['NEON NIGHTS', '#14102a', '#ff3fa4'], ['FULL BOOST', '#ffd23f', '#14102a'],
  ['DANGER', '#ffcc00', '#141414'], ['LAVA VIEW', '#141414', '#ff7a1a'],
];
const ROCKS = ['#b8a07a', '#a8543a', '#7a8296', '#5a4a6a', '#3a3030'];

function jobs() {
  const out = [];
  const car = (name, model, color, label) => {
    for (const brake of [false, true]) for (let p = -4; p <= 4; p++) {
      out.push({ name: `${name}__${brake ? 1 : 0}_${p + 4}`, group: name, spec: { kind: 'car', model, args: [color, brake, label], yaw: -p * POSE_STEP, elev: CAR_ELEV, pxPerM: CAR_PX_PER_M, ss: SS } });
    }
  };
  for (const model of ['aw11', 'sw20', 'w30']) for (const c of PAINTS) car(`car_${model}_${c.slice(1)}`, model, c, 'LEO');
  RIVALS.forEach(([model, c], i) => car(`rival_${i}`, model, c));
  const sc = (name, model, args) => out.push({ name, group: name, spec: { kind: 'scenery', model, args, elev: SCENERY_ELEV, pxPerM: SCENERY_PX_PER_M, ss: SS } });
  for (const s of [3, 7, 11]) sc(`palm_${s}`, 'palm', [s]);
  for (const s of [2, 5, 9]) sc(`pine_${s}`, 'pine', [s, true]);
  for (const s of [1, 4]) sc(`cactus_${s}`, 'cactus', [s]);
  ROCKS.forEach((c, i) => { for (const s of [4, 8]) sc(`boulder_${c.slice(1)}_${s}`, 'boulder', [s, c]); });
  for (const s of [6, 13]) sc(`mesa_${s}`, 'mesa', [s, '#a8543a']);
  for (const s of [3, 6, 9]) sc(`ember_${s}`, 'ember', [s]);
  ['#3b2a5c', '#2c3557', '#4a2f4f'].forEach((c, i) => { for (const s of [1, 2]) sc(`building_${i}_${s}`, 'building', [s * 31 + i, c]); });
  sc('lamp_lit', 'lamp', [true]); sc('lamp_off', 'lamp', [false]);
  BOARDS.forEach((b, i) => sc(`board_${i}`, 'billboard', b));
  sc('chevL', 'chevron', [-1]); sc('chevR', 'chevron', [1]);
  sc('cone', 'cone', []);
  sc('grandstand', 'grandstand', [5]);
  sc('gantry', 'gantry', []);
  return out;
}

(async () => {
  const filter = process.argv[2] || '';
  const rawDir = path.join(__dirname, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto('file://' + path.join(__dirname, 'studio.html'));
  await page.waitForFunction(() => window.studioReady);
  const indexPath = path.join(rawDir, 'index.json');
  const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {};
  const list = jobs().filter(j => j.name.includes(filter));
  let n = 0;
  for (const j of list) {
    const r = await page.evaluate(spec => window.renderSprite(spec), j.spec);
    fs.writeFileSync(path.join(rawDir, j.name + '.png'), Buffer.from(r.url.split(',')[1], 'base64'));
    index[j.name] = { group: j.group, w: r.w, h: r.h, anchor: r.anchor, pxPerM: j.spec.pxPerM, ss: j.spec.ss, kind: j.spec.kind };
    if (++n % 50 === 0) console.log(`${n}/${list.length}`);
  }
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 1));
  console.log(`rendered ${n} sprites`);
  await browser.close();
})();
