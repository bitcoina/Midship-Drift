"""Paint the scrolling horizon panoramas for each course theme.

Every panorama tiles seamlessly left to right (all noise is periodic in x), is lit
from the left, fades into haze near the horizon and is posterized with ordered
dithering for a 16-bit look. Writes drift2/assets/bg_<theme>.png (horizon layer) and
bg_<theme>_clouds.png where the theme has a cloud layer.

Usage: python3 backdrops.py
"""
import os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
TW, TH = 768, 160          # horizon layer tile
CW, CH = 768, 110          # cloud layer tile
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def noise1(rng, n, period, octaves=4, rough=0.5):
    """Periodic fractal value noise sampled at n points."""
    x = np.arange(n) / n
    out = np.zeros(n)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = period * 2 ** o
        vals = rng.random(cells)
        f = x * cells
        i = np.floor(f).astype(int)
        t = f - i
        t = t * t * (3 - 2 * t)
        out += amp * (vals[i % cells] * (1 - t) + vals[(i + 1) % cells] * t)
        total += amp
        amp *= rough
    return out / total


def noise2(rng, w, h, cells=24):
    """Periodic-in-x 2D value noise in 0..1."""
    cy = max(2, int(cells * h / w))
    grid = rng.random((cy + 2, cells))
    xs, ys = np.arange(w) / w * cells, np.arange(h) / h * cy
    xi, yi = np.floor(xs).astype(int), np.floor(ys).astype(int)
    tx, ty = xs - xi, ys - yi
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a = grid[yi][:, xi % cells]
    b = grid[yi][:, (xi + 1) % cells]
    c = grid[yi + 1][:, xi % cells]
    d = grid[yi + 1][:, (xi + 1) % cells]
    top = a * (1 - tx) + b * tx
    bot = c * (1 - tx) + d * tx
    return top * (1 - ty[:, None]) + bot * ty[:, None]


def smooth_slope(heights, k=9):
    """Slope of the ridge line, averaged so shading follows faces rather than single columns."""
    kernel = np.ones(k) / k
    padded = np.concatenate([heights[-k:], heights, heights[:k]])
    sm = np.convolve(padded, kernel, mode='same')[k:-k]
    return (np.roll(sm, -1) - np.roll(sm, 1)) / 2


def fbm2(rng, w, h, base=16):
    """Multi-octave periodic 2D noise: rock texture with detail at several scales."""
    out, amp, total = np.zeros((h, w)), 1.0, 0.0
    for o in range(4):
        out += amp * noise2(rng, w, h, base * 2 ** o)
        total += amp
        amp *= 0.55
    return out / total


def ridge_layer(img, alpha, heights, colour, haze, light=0.9, tex=None, slope_gain=6.0):
    """Fill below a ridge line, shading by slope (lit from the left) and fading to haze."""
    h, w = alpha.shape
    ys = np.arange(h)[:, None]
    top = heights[None, :]
    mask = ys >= top
    slope = smooth_slope(heights)
    below = np.maximum(0, ys - top)
    # ridge lighting near the crest, fading into 2D rock facets further down
    lit = 1 + slope[None, :] * slope_gain / 10 * light * np.exp(-below / 22)
    if tex is not None:
        gx = (np.roll(tex, -1, axis=1) - np.roll(tex, 1, axis=1)) * 40
        lit = lit + np.clip(gx, -1, 1) * (1 - np.exp(-below / 22)) * 0.18 + (tex - 0.5) * 0.25
    shade = np.clip(lit, 0.55, 1.35)
    col = colour[None, None, :] * shade[:, :, None]
    fade = np.clip((ys - (h - 45)) / 45, 0, 1)[:, :, None] * 0.55
    col = col * (1 - fade) + haze[None, None, :] * fade
    img[mask] = col[mask]
    alpha[mask] = 255


def finish(img, alpha, levels=6):
    """Ordered-dither posterize, keep hard alpha."""
    h, w = alpha.shape
    th = np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w][:, :, None]
    q = np.floor(np.clip(img, 0, 255) / 255 * (levels * 4) + th) / (levels * 4) * 255
    out = np.dstack([np.clip(q, 0, 255), alpha]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def hills(rng):
    img, a = np.zeros((TH, TW, 3)), np.zeros((TH, TW))
    haze = hexrgb('#cfe7f6')
    ridge_layer(img, a, 70 + noise1(rng, TW, 3, 4) * 55, hexrgb('#78a9c6'), haze)
    ridge_layer(img, a, 108 + noise1(rng, TW, 5, 4) * 34, hexrgb('#5f97a8'), haze)
    ridge_layer(img, a, 132 + noise1(rng, TW, 9, 3) * 18, hexrgb('#4f8a6e'), haze)
    return finish(img, a)


def mountains(rng):
    img, a = np.zeros((TH, TW, 3)), np.zeros((TH, TW))
    haze = hexrgb('#26315c')
    tex = fbm2(rng, TW, TH, 24)
    ridged = 1 - np.abs(noise1(rng, TW, 6, 5, 0.5) * 2 - 1)
    hgt = 125 - ridged ** 1.5 * 95 - noise1(rng, TW, 3, 3) * 15
    ridge_layer(img, a, hgt, hexrgb('#3a4c80'), haze, tex=tex, slope_gain=9)
    ys = np.arange(TH)[:, None]
    snow = (ys >= hgt[None, :]) & (ys < hgt[None, :] + 10 + tex * 22) & (ys < 70 + tex * 16)
    slope = smooth_slope(hgt, 5)[None, :]
    snowcol = np.where((slope > 0)[:, :, None], hexrgb('#f2f6ff'), hexrgb('#a9b8e0'))
    img[snow] = np.broadcast_to(snowcol, img.shape)[snow]
    ridge_layer(img, a, 118 + noise1(rng, TW, 12, 5, 0.6) * 26, hexrgb('#1c2a4c'), haze, tex=tex)
    # forest edge: little pointed tree tops along the nearest ridge
    base = 138 + noise1(rng, TW, 7, 3) * 8
    for x in range(0, TW, 3):
        th = 6 + int(rng.random() * 7)
        for dy in range(th):
            half = dy // 3
            for dx in range(-half, half + 1):
                xx, yy = (x + dx) % TW, int(base[x]) - th + dy
                if 0 <= yy < TH:
                    img[yy, xx] = hexrgb('#132038') * (1.1 if dx < 0 else 0.85)
                    a[yy, xx] = 255
        ridge_layer(img, a, base, hexrgb('#132038'), haze)
    return finish(img, a, 7)


def mesas(rng):
    img, a = np.zeros((TH, TW, 3)), np.zeros((TH, TW))
    haze = hexrgb('#f6d2a0')
    tex = fbm2(rng, TW, TH, 24)
    ridge_layer(img, a, 105 + noise1(rng, TW, 4, 4) * 30, hexrgb('#d7a07a'), haze, tex=tex)
    hgt = np.full(TW, float(TH))
    for _ in range(9):
        x0, w, top = rng.random() * TW, 40 + rng.random() * 120, 30 + rng.random() * 60
        for x in range(TW):
            d = min(abs(x - x0), TW - abs(x - x0))
            edge = w / 2 - d
            if edge > 0:
                hgt[x] = min(hgt[x], top + max(0, 8 - edge) * 3.5)
    img2, a2 = np.zeros_like(img), np.zeros_like(a)
    ridge_layer(img2, a2, hgt, hexrgb('#c4603a'), haze, tex=tex, slope_gain=3)
    ys = np.arange(TH)[:, None]
    strata = ((ys + (tex * 4).astype(int)) // 7) % 2 == 0
    img2[strata & (a2 > 0)] *= 0.86
    m = a2 > 0
    img[m], a[m] = img2[m], 255
    ridge_layer(img, a, 140 + noise1(rng, TW, 10, 4) * 12, hexrgb('#b8704a'), haze, tex=tex)
    return finish(img, a)


def city(rng):
    img, a = np.zeros((TH, TW, 3)), np.zeros((TH, TW))
    haze = hexrgb('#c06a8c')
    for layer, (col, lit, count) in enumerate([('#5a3a78', 0.25, 50), ('#3b2160', 0.45, 46)]):
        base = hexrgb(col)
        for _ in range(count):
            x0, w = int(rng.random() * TW), 10 + int(rng.random() * 30)
            top = int(20 + rng.random() * 90) + layer * 22
            shade = 0.85 + rng.random() * 0.3
            for x in range(x0, x0 + w):
                xx = x % TW
                edge = 1.12 if x - x0 < 2 else 0.8 if x0 + w - x < 3 else 1
                for y in range(top, TH):
                    fade = max(0, (y - (TH - 50)) / 50) * 0.5
                    img[y, xx] = base * shade * edge * (1 - fade) + haze * fade
                    a[y, xx] = 255
            for y in range(top + 3, TH - 6, 4):
                for x in range(x0 + 2, x0 + w - 2, 3):
                    if rng.random() < lit:
                        img[y:y + 2, x % TW] = hexrgb('#ffd27a') if rng.random() < 0.8 else hexrgb('#9fe8ff')
            if rng.random() < 0.2:
                ax = (x0 + w // 2) % TW
                img[top - 9:top, ax] = (130, 130, 140)
                a[top - 9:top, ax] = 255
                img[top - 10, ax], a[top - 10, ax] = (255, 60, 60), 255
    return finish(img, a, 8)


def volcano(rng):
    img, a = np.zeros((TH, TW, 3)), np.zeros((TH, TW))
    haze = hexrgb('#6e2412')
    tex = fbm2(rng, TW, TH, 24)
    ridge_layer(img, a, 118 + noise1(rng, TW, 5, 5) * 26, hexrgb('#4a2622'), haze, tex=tex)
    xs = np.arange(TW)
    hgt = np.full(TW, float(TH))
    for cx, top, half, crater in [(200, 24, 210, 18), (560, 62, 140, 11)]:
        d = np.minimum(np.abs(xs - cx), TW - np.abs(xs - cx))
        cone = np.where(d < crater, top, top + (d - crater) / (half - crater) * (TH - top))
        cone = cone + noise1(rng, TW, 30, 3) * 6
        hgt = np.minimum(hgt, cone)
    img2, a2 = np.zeros_like(img), np.zeros_like(a)
    ridge_layer(img2, a2, hgt, hexrgb('#3d2424'), haze, tex=tex, slope_gain=4)
    m = a2 > 0
    img[m], a[m] = img2[m], 255
    for cx, top, crater in [(200, 24, 18), (560, 62, 11)]:
        for k in range(5):
            x = cx - crater + 3 + k * crater * 0.45
            for y in range(top, TH - 10):
                x += (rng.random() - 0.47) * 1.6
                glow = 1 - (y - top) / (TH - top)
                c = hexrgb('#ffb02e') * glow + hexrgb('#ff4a10') * (1 - glow)
                img[y, int(x) % TW] = c
                img[y, int(x + 1) % TW] = c * 0.8
        img[top - 2:top + 2, (cx - crater) % TW:(cx + crater) % TW] = hexrgb('#ff8a2a')
        # smoke plume
        for k in range(14):
            py, px = top - 6 - k * 4.5, cx + k * k * 0.35 + rng.random() * 4
            r = 5 + k * 1.3
            yy, xx = np.ogrid[:TH, :TW]
            blob = ((xx - px) ** 2 + ((yy - py) * 1.4) ** 2) < r * r
            blob &= a < 255
            img[blob] = hexrgb('#5a3a36') * (1.1 - k * 0.02)
            a[blob] = 255
    return finish(img, a, 7)


def clouds(rng, colour):
    img, a = np.zeros((CH, CW, 3)), np.zeros((CH, CW))
    base = hexrgb(colour)
    yy, xx = np.ogrid[:CH, :CW]
    for _ in range(11):
        cx, cy = rng.random() * CW, 18 + rng.random() * 70
        for _ in range(7):
            px, py = cx + (rng.random() - 0.5) * 70, cy + (rng.random() - 0.5) * 12
            r = 8 + rng.random() * 14
            for off in (-CW, 0, CW):
                d = ((xx - px - off) ** 2 + ((yy - py) * 1.6) ** 2)
                blob = d < r * r
                light = np.clip(1.05 - (yy - (py - r * 0.6)) / (r * 2.2) * 0.35, 0.72, 1.08)
                col = base[None, None, :] * np.broadcast_to(light, (CH, CW))[:, :, None]
                img[blob] = col[blob]
                a[blob] = 255
    return finish(img, a, 8)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = {'coast': hills, 'alpine': mountains, 'canyon': mesas, 'skyway': city, 'volcano': volcano}
    for i, (name, fn) in enumerate(jobs.items()):
        fn(np.random.default_rng(100 + i)).save(os.path.join(OUT, f'bg_{name}.png'), optimize=True)
    clouds(np.random.default_rng(7), '#ffffff').save(os.path.join(OUT, 'bg_coast_clouds.png'), optimize=True)
    clouds(np.random.default_rng(9), '#e98ab0').save(os.path.join(OUT, 'bg_skyway_clouds.png'), optimize=True)
    print('backdrops written')


if __name__ == '__main__':
    main()
