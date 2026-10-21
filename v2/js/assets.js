'use strict';
// Loads the pre-rendered sprite sheets listed in assets/manifest.js (written by
// tools/pixelate.py) and cuts car sheets into per-pose canvases on demand.
const Assets = (() => {
  const M = window.DRIFT_SPRITES;
  const images = {};
  const carCache = {};

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load assets/' + file));
      img.src = 'assets/' + file;
    });
  }

  async function load(onProgress) {
    const files = [
      ...Object.values(M.cars).map(c => c.file),
      ...Object.values(M.scenery).map(s => s.file),
      ...['coast', 'canyon', 'alpine', 'skyway', 'volcano'].map(t => `bg_${t}.png`),
      'bg_coast_clouds.png', 'bg_skyway_clouds.png',
    ];
    let done = 0;
    await Promise.all(files.map(f => loadImage(f).then(img => {
      images[f] = img;
      if (onProgress) onProgress(++done / files.length);
    })));
  }

  // { rows: [normal poses[], braking poses[]], fw, fh, ax, ay, pxPerM }
  function car(key) {
    if (carCache[key]) return carCache[key];
    const meta = M.cars[key], sheet = images[meta.file];
    const rows = [];
    for (let r = 0; r < meta.rows; r++) {
      const row = [];
      for (let c = 0; c < meta.cols; c++) {
        const cv = document.createElement('canvas');
        cv.width = meta.fw; cv.height = meta.fh;
        cv.getContext('2d').drawImage(sheet, c * meta.fw, r * meta.fh, meta.fw, meta.fh, 0, 0, meta.fw, meta.fh);
        row.push(cv);
      }
      rows.push(row);
    }
    return (carCache[key] = { rows, fw: meta.fw, fh: meta.fh, ax: meta.ax, ay: meta.ay, pxPerM: meta.pxPerM });
  }

  function scenery(name) {
    const meta = M.scenery[name];
    if (!meta) throw new Error('Unknown sprite ' + name);
    return { img: images[meta.file], w: meta.w, h: meta.h, ax: meta.ax, ay: meta.ay, pxPerM: meta.pxPerM };
  }

  const image = file => images[file];
  const playerKey = (model, color) => `car_${model}_${color.slice(1).toLowerCase()}`;

  return { load, car, scenery, image, playerKey, manifest: M };
})();
