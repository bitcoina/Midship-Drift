'use strict';
// Cartoon pixel art for Midship Drift III: driver faces for the position bar, the
// winged START banner and its lamps, smoke and sparks, the newer scenery (boats, buoys,
// islets, sheep, a barn) and the arcade HUD font. Drawn from code like the rest of the art.
const Toons = (() => {
  const { canvas, rect, poly, disc, shade } = Art;

  // Draws a 1px black outline around everything opaque on a canvas.
  function outline(c) {
    const g = c.getContext('2d'), w = c.width, h = c.height;
    const src = g.getImageData(0, 0, w, h), out = g.createImageData(w, h);
    const a = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src.data[(y * w + x) * 4 + 3] > 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (a(x, y)) { for (let k = 0; k < 4; k++) out.data[i + k] = src.data[i + k]; }
      else if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) out.data[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- faces
  // 22x22 head-and-shoulders portraits. mood: 0 normal, 1 happy, -1 cross.
  function face(f, mood = 0) {
    const [c, g] = canvas(22, 22), skin = f.skin, hair = f.hair, dk = shade(skin, -0.22);
    // shoulders in the driver's colours
    rect(g, 3, 19, 16, 3, f.helmet); rect(g, 9, 19, 4, 3, '#f4f4f4');
    // back hair
    if (f.style === 'bob') rect(g, 4, 5, 14, 12, hair);
    if (f.style === 'afro') { disc(g, 11, 9, 9, hair); }
    if (f.style === 'pony') { rect(g, 15, 8, 4, 9, hair); rect(g, 17, 14, 3, 4, hair); }
    if (f.style === 'bun') { disc(g, 11, 3, 3, hair); }
    // head
    rect(g, 6, 4, 10, 14, skin); rect(g, 5, 6, 12, 10, skin);
    rect(g, 4, 9, 1, 4, skin); rect(g, 17, 9, 1, 4, skin);
    rect(g, 6, 16, 10, 2, dk);
    // hair on top
    switch (f.style) {
      case 'spiky':
        rect(g, 5, 3, 12, 4, hair);
        for (let x = 5; x < 17; x += 3) poly(g, [x, 4, x + 1.5, 0, x + 3, 4], hair);
        break;
      case 'bob': rect(g, 5, 3, 12, 4, hair); rect(g, 5, 5, 2, 7, hair); rect(g, 15, 5, 2, 7, hair); break;
      case 'afro': rect(g, 5, 3, 12, 3, hair); break;
      case 'pony': rect(g, 5, 3, 12, 3, hair); rect(g, 5, 5, 3, 2, hair); break;
      case 'bun': rect(g, 5, 4, 12, 3, hair); break;
      case 'mohawk': rect(g, 9, 0, 4, 6, hair); rect(g, 10, 0, 2, 1, shade(hair, 0.3)); break;
      case 'cap':
        rect(g, 5, 2, 12, 4, f.helmet); rect(g, 13, 5, 6, 2, shade(f.helmet, -0.25));
        rect(g, 9, 3, 2, 2, '#ffd23f');
        break;
      case 'bald':
        rect(g, 4, 7, 2, 3, hair); rect(g, 16, 7, 2, 3, hair);
        rect(g, 8, 5, 2, 1, shade(skin, 0.25));
        break;
    }
    // eyes
    if (f.extra === 'shades') {
      rect(g, 6, 9, 10, 3, '#111'); rect(g, 7, 9, 2, 1, '#6a8fb0'); rect(g, 13, 9, 2, 1, '#6a8fb0');
    } else {
      const ey = mood === 1 ? 10 : 9;
      if (mood === 1) { rect(g, 7, ey, 3, 1, '#111'); rect(g, 12, ey, 3, 1, '#111'); }
      else {
        rect(g, 7, ey, 3, 3, '#fff'); rect(g, 12, ey, 3, 3, '#fff');
        rect(g, 8, ey + 1, 2, 2, '#111'); rect(g, 13, ey + 1, 2, 2, '#111');
      }
      if (mood === -1) { rect(g, 7, ey - 1, 3, 1, '#111'); rect(g, 12, ey - 1, 3, 1, '#111'); }
      if (f.extra === 'glasses') {
        for (const x of [6, 11]) { rect(g, x, 8, 5, 1, '#222'); rect(g, x, 12, 5, 1, '#222'); rect(g, x, 8, 1, 5, '#222'); rect(g, x + 4, 8, 1, 5, '#222'); }
        rect(g, 10, 9, 1, 1, '#222');
      }
    }
    // nose and cheeks
    rect(g, 10, 12, 2, 2, dk);
    if (f.extra === 'freckles') { rect(g, 7, 13, 1, 1, dk); rect(g, 8, 14, 1, 1, dk); rect(g, 14, 13, 1, 1, dk); rect(g, 13, 14, 1, 1, dk); }
    if (f.extra === 'blush') { rect(g, 6, 13, 2, 1, '#f08a9a'); rect(g, 14, 13, 2, 1, '#f08a9a'); }
    // mouth
    const m = mood === 1 ? 'grin' : mood === -1 ? 'cross' : f.mouth;
    if (m === 'grin') { rect(g, 8, 15, 6, 2, '#7a1e1e'); rect(g, 8, 15, 6, 1, '#fff'); }
    else if (m === 'smile') { rect(g, 8, 15, 6, 1, '#7a1e1e'); rect(g, 7, 14, 1, 1, '#7a1e1e'); rect(g, 14, 14, 1, 1, '#7a1e1e'); }
    else if (m === 'fangs') { rect(g, 8, 15, 6, 2, '#7a1e1e'); rect(g, 8, 15, 1, 1, '#fff'); rect(g, 13, 15, 1, 1, '#fff'); }
    else if (m === 'o') { rect(g, 10, 15, 2, 2, '#7a1e1e'); }
    else if (m === 'cross') { rect(g, 8, 16, 6, 1, '#7a1e1e'); rect(g, 7, 17, 1, 1, '#7a1e1e'); rect(g, 14, 17, 1, 1, '#7a1e1e'); }
    if (f.extra === 'moustache') { rect(g, 7, 14, 8, 1, hair === '#d9d9d9' ? '#bdbdbd' : hair); rect(g, 6, 15, 2, 1, hair === '#d9d9d9' ? '#bdbdbd' : hair); rect(g, 14, 15, 2, 1, hair === '#d9d9d9' ? '#bdbdbd' : hair); }
    if (f.extra === 'beard') { rect(g, 5, 13, 12, 5, hair); rect(g, 8, 15, 6, 1, '#7a1e1e'); }
    // hands on a steering wheel, in front of the chest
    rect(g, 5, 19, 12, 1, '#2a2a30'); rect(g, 4, 18, 2, 2, '#2a2a30'); rect(g, 16, 18, 2, 2, '#2a2a30');
    rect(g, 10, 20, 2, 2, '#2a2a30');
    for (const x of [3, 15]) { rect(g, x, 17, 4, 3, '#f4f4f4'); rect(g, x, 19, 4, 1, '#c8c8d0'); }
    return outline(c);
  }

  // ---------------------------------------------------------------- particles
  function puff(shadeCol) {
    const [c, g] = canvas(16, 16);
    disc(g, 8, 9, 6, shadeCol); disc(g, 6, 7, 4, shade(shadeCol, 0.15)); disc(g, 10, 6, 3, shade(shadeCol, 0.25));
    return c;
  }
  function spark(col) {
    const [c, g] = canvas(6, 6);
    rect(g, 2, 0, 2, 6, col); rect(g, 0, 2, 6, 2, col); rect(g, 2, 2, 2, 2, '#fff');
    return c;
  }

  // ---------------------------------------------------------------- start banner
  // The big START banner drawn across the screen for the countdown: italic letters on a
  // red board, cheeky eyes on top, feathered wings each side. frame 0..3 flaps them.
  function startBanner(frame) {
    const W = 232, H = 72, [c, g] = canvas(W, H);
    const lift = [-18, -7, 6, 13][frame];
    for (const side of [-1, 1]) {
      const root = side < 0 ? 58 : W - 58, tip = side < 0 ? 4 : W - 4;
      for (let k = 0; k < 3; k++) {
        const reach = 1 - k * 0.2, tx = root + (tip - root) * reach, ty = 34 + lift * reach - k * 3;
        poly(g, [root, 24 + k * 4, tx, ty - 8, tx + side * -6, ty + 5, root, 50 - k * 3], ['#e8eef7', '#ffffff', '#cfd8e6'][k]);
        for (let f = 1; f < 5; f++) {
          const fx = root + (tx - root) * (f / 5), fy = 37 + (ty - 37) * (f / 5);
          rect(g, Math.round(fx), Math.round(fy + 2), 1, 5, '#9aa6ba');
        }
      }
    }
    rect(g, 54, 16, 124, 44, '#2a1a12');
    rect(g, 56, 18, 120, 40, '#d8322f');
    rect(g, 56, 18, 120, 3, '#ff6a5a'); rect(g, 56, 55, 120, 3, '#9a1a14');
    text(g, 'START', W / 2, 27, '#ffe14a', { s: 4, italic: true, align: 'center', shadow: '#7a1010' });
    for (const x of [92, 128]) { disc(g, x + 4, 12, 6, '#ffffff'); rect(g, x + 3, 10, 3, 5, '#111'); }
    return outline(c);
  }

  // ---------------------------------------------------------------- start lights
  // The winged lamp bar that hangs under the START sign. `lit` lamps are on: three red
  // for the countdown, then the fourth, blue, for GO.
  function startLights(lit) {
    const [c, g] = canvas(96, 22);
    for (const side of [-1, 1]) {
      const root = side < 0 ? 22 : 74, tip = side < 0 ? 2 : 94;
      poly(g, [root, 5, tip, 2, tip + side * -6, 12, root, 16], '#ffffff');
      for (let f = 1; f < 3; f++) rect(g, Math.round(root + (tip - root) * f / 3), 8, 1, 5, '#9aa6ba');
    }
    rect(g, 20, 3, 56, 16, '#1a1a22'); rect(g, 20, 3, 56, 2, '#3a3a48');
    for (let k = 0; k < 4; k++) {
      const x = 28 + k * 13, on = k < lit;
      const col = k === 3 ? (on ? '#4fb8ff' : '#14304a') : (on ? '#ff2a2a' : '#4a1212');
      disc(g, x, 11, 5, col);
      if (on) rect(g, x - 2, 8, 2, 2, '#ffffff');
    }
    return outline(c);
  }

  // ---------------------------------------------------------------- scenery
  function tint(c, k, hex) {
    const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), n = parseInt(hex.slice(1), 16);
    const t = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (let i = 0; i < img.data.length; i += 4) for (let ch = 0; ch < 3; ch++) img.data[i + ch] = img.data[i + ch] * k + t[ch] * (1 - k);
    g.putImageData(img, 0, 0);
    return c;
  }
  function boat(seed) {
    const [c, g] = canvas(44, 46), hull = ['#e23b3b', '#2f6fd6', '#f2c12e'][seed % 3];
    poly(g, [2, 34, 42, 34, 36, 42, 8, 42], hull); rect(g, 4, 34, 36, 2, '#ffffff');
    rect(g, 21, 4, 2, 30, '#5a4a3a');
    poly(g, [23, 5, 23, 31, 40, 31], '#ffffff'); poly(g, [21, 9, 21, 31, 6, 31], '#f1ecdc');
    if (seed % 2) rect(g, 23, 18, 12, 3, hull);
    rect(g, 0, 43, 44, 2, '#d6efff');
    return outline(c);
  }
  function buoy(col) {
    const [c, g] = canvas(16, 24);
    poly(g, [8, 2, 13, 18, 3, 18], col); rect(g, 5, 10, 6, 3, '#ffffff');
    rect(g, 7, 0, 2, 3, '#ffe066'); rect(g, 1, 18, 14, 3, '#2a2a30'); rect(g, 0, 21, 16, 2, '#d6efff');
    return outline(c);
  }
  function islet(seed) {
    const r = Art.rng(seed), [c, g] = canvas(84, 76);
    poly(g, [4, 74, 14, 58, 34, 50, 56, 52, 74, 60, 82, 74], '#e8d49a');
    poly(g, [14, 70, 22, 54, 40, 46, 58, 50, 70, 62, 74, 70], '#8a7a66');
    poly(g, [22, 70, 30, 56, 44, 50, 52, 56, 46, 70], '#a69680');
    const palm = Art.palm(seed * 3 + 1);
    g.drawImage(palm, 20 + Math.floor(r() * 16), 0, 34, 63);
    rect(g, 0, 73, 84, 3, '#d6efff');
    return outline(c);
  }
  function sheep(seed) {
    const [c, g] = canvas(28, 20);
    for (const [x, y, rr] of [[10, 8, 5], [16, 7, 5], [20, 10, 4], [8, 11, 4], [14, 11, 5]]) disc(g, x, y, rr, '#f4f4f0');
    rect(g, 7, 15, 2, 4, '#2a2a2a'); rect(g, 17, 15, 2, 4, '#2a2a2a');
    if (seed % 2) { rect(g, 22, 6, 5, 5, '#2a2a2a'); rect(g, 25, 7, 1, 1, '#fff'); }
    else { rect(g, 1, 6, 5, 5, '#2a2a2a'); rect(g, 2, 7, 1, 1, '#fff'); }
    return outline(c);
  }
  function barn() {
    const [c, g] = canvas(72, 58);
    rect(g, 6, 24, 60, 32, '#c8322a'); rect(g, 6, 24, 60, 2, '#e05a4a');
    poly(g, [2, 26, 36, 4, 70, 26], '#5a3a2a'); poly(g, [36, 4, 70, 26, 36, 26], '#4a2e20');
    rect(g, 26, 34, 20, 22, '#f2ead8'); rect(g, 28, 36, 16, 20, '#7a2a1a');
    for (let k = 0; k < 2; k++) { rect(g, 28 + k * 8, 36, 8, 1, '#f2ead8'); }
    poly(g, [28, 36, 44, 56, 42, 56, 28, 38], '#f2ead8'); poly(g, [44, 36, 28, 56, 30, 56, 44, 38], '#f2ead8');
    rect(g, 32, 14, 8, 8, '#f2ead8'); rect(g, 33, 15, 6, 6, '#3a2a20');
    return outline(c);
  }

  // ---------------------------------------------------------------- arcade font
  // A 5x7 pixel font for the HUD, drawn with a black outline and an optional italic
  // slant. Each glyph is seven rows of five bits, left pixel = 16.
  const FONT5 = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
    D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
    3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
    6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12],
    ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0],
    '-': [0, 0, 0, 31, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4], "'": [4, 4, 8, 0, 0, 0, 0],
    '"': [10, 10, 20, 0, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16], '?': [14, 17, 1, 2, 4, 0, 4],
  };
  const textWidth = (str, s = 1) => (str.length * 6 - 1) * s;
  function glyphs(g, str, x, y, col, s, italic) {
    g.fillStyle = col;
    for (let k = 0; k < str.length; k++) {
      const rows = FONT5[str[k]] || FONT5['?'];
      for (let r = 0; r < 7; r++) {
        const lean = italic ? Math.round(((6 - r) * s) / 3) : 0;
        for (let b = 0; b < 5; b++) if (rows[r] & (16 >> b)) g.fillRect(x + (k * 6 + b) * s + lean, y + r * s, s, s);
      }
    }
  }
  // opts: s scale, align 'left' | 'center' | 'right', italic, shadow (drop shadow colour)
  function text(g, str, x, y, col, opts = {}) {
    const s = opts.s || 1, w = textWidth(str, s) + (opts.italic ? 2 * s : 0);
    if (opts.align === 'center') x -= w / 2; else if (opts.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    if (opts.shadow) glyphs(g, str, x + s, y + s, opts.shadow, s, opts.italic);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) glyphs(g, str, x + dx, y + dy, '#000', s, opts.italic);
    glyphs(g, str, x, y, col, s, opts.italic);
    return w;
  }

  return {
    face, startBanner, startLights, puff, spark, outline, tint,
    boat, buoy, islet, sheep, barn, text, textWidth,
  };
})();
