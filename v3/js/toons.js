'use strict';
// Cartoon pixel art for Midship Drift III: driver faces for the position bar, the
// winged START sign, smoke and sparks. Drawn from code like the rest of the art.
const Toons = (() => {
  const { canvas, rect, poly, disc, shade, text3, text3Width } = Art;

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
    return outline(c);
  }

  // ---------------------------------------------------------------- start sign
  // A signboard with feathered wings. frame 0..3 is the flap cycle.
  function startSign(frame, text = 'START') {
    const W = 120, H = 64, [c, g] = canvas(W, H);
    const lift = [-16, -6, 6, 12][frame];
    for (const side of [-1, 1]) {
      const root = side < 0 ? 34 : 86, tip = side < 0 ? 4 : 116;
      // three layers of feathers, longest at the back
      for (let k = 0; k < 3; k++) {
        const reach = 1 - k * 0.22, tx = root + (tip - root) * reach, ty = 30 + lift * reach - k * 2;
        const col = ['#e8eef7', '#ffffff', '#cfd8e6'][k];
        poly(g, [root, 24 + k * 3, tx, ty - 6, tx + side * -4, ty + 4, root, 40 - k * 2], col);
        for (let f = 1; f < 4; f++) {
          const fx = root + (tx - root) * (f / 4), fy = 32 + (ty - 32) * (f / 4);
          rect(g, Math.round(fx), Math.round(fy + 2), 1, 4, '#9aa6ba');
        }
      }
    }
    // the board
    rect(g, 30, 14, 60, 30, '#2a1a12');
    rect(g, 32, 16, 56, 26, '#d8322f');
    rect(g, 32, 16, 56, 2, '#ff6a5a');
    const tw = text3Width(text, 2);
    text3(g, text, 60 - tw / 2 + 1, 25, '#7a1010', 2);
    text3(g, text, 60 - tw / 2, 24, '#ffd23f', 2);
    // cheeky eyes on top so the sign has a face
    for (const x of [48, 66]) { disc(g, x + 3, 12, 5, '#fff'); rect(g, x + 2, 10, 3, 4, '#111'); }
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
  function blob() {
    const [c, g] = canvas(32, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const d = ((x - 15.5) / 16) ** 2 + ((y - 7.5) / 8) ** 2;
      if (d < 1) rect(g, x, y, 1, 1, `rgba(0,0,0,${(0.55 * (1 - d * d)).toFixed(2)})`);
    }
    return c;
  }

  // ---------------------------------------------------------------- big text
  // FONT3 scaled up with a drop shadow and outline: the cartoon HUD lettering.
  function bigText(g, str, x, y, col, s = 3, align = 'left') {
    const w = text3Width(str, s);
    if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
    x = Math.round(x);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [2, 2], [1, 2], [2, 1]]) text3(g, str, x + dx, y + dy, '#000', s);
    text3(g, str, x, y, col, s);
    return w;
  }

  return { face, startSign, puff, spark, blob, bigText, outline };
})();
