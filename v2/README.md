# Midship Drift II

Version 2 of [Midship Drift](../v1/), with pre-rendered sprites in place of the
code-drawn pixel boxes.

An arcade sprite-scaling racer in the spirit of the late-80s "super scaler" cabinets:
roller-coaster roads on stilts, crests you can fly off, and a pack of rivals.
The star car is Leo's MR2.

Everything is original. The sprites were made the way many 16-bit games made theirs:
3D models built in code were rendered from the game's camera angle, then shrunk,
posterized and outlined into pixel-art sprite sheets. The horizon panoramas are painted
procedurally. Music and sound are synthesised. No names, logos, tracks, characters or
artwork are taken from any existing game.

## Play

Open `v2/index.html` in a browser. It needs no build step and no server, so
double-clicking the file works.

| Action | Keys | Touch |
| --- | --- | --- |
| Steer | Left / Right, or A / D | Arrow buttons, bottom left |
| Accelerate | Up, W or Z | GAS |
| Brake | Down, S or X | BRK |
| Pause | P or Esc | II |
| Music on/off | M | |

- **Championship:** five courses in a row. Finish in the top three to go through to the
  next one. Races are four laps. Points go 15-12-10-8-6-5-4-3-2-1.
- **Single race:** pick any course. Best laps are saved in your browser.
- **Garage:** choose the MR2 generation (Mk1 AW11, Mk2 SW20 or Mk3 roadster) and the
  paint colour. The number plate reads LEO.

On elevated sections the crash rails keep you on the road but scrub speed. On the
ground, running wide onto the verge slows you down and hitting scenery hurts.

## Courses

| # | Course | What to expect |
| --- | --- | --- |
| 1 | Coastline Sprint | Rolling hills, palms, a causeway over the bay |
| 2 | Red Canyon | Steep blind crests and a trestle over the river |
| 3 | Alpine Night | Moonlit switchbacks and a viaduct over a frozen lake |
| 4 | Sky Highway | Almost all elevated, with big drops between towers |
| 5 | Lava Ridge | Black rock and the longest bridge, over lava |

## How it works

The road is a loop of 200-unit segments. Each segment has a curve value, a road height
and a ground height. Each frame the next 280 segments are projected to a low-resolution
canvas (224 px tall, width follows the window) and painted from back to front. Painting
far to near, rather than the usual near to far with clipping, is what lets the road float
above the ground on pillars while scenery, cars and the ground underneath stay correctly
layered. The low-res canvas is then scaled up with nearest-neighbour filtering for the
chunky look.

Cars are sprites, scaled by distance. Each car has nine poses from hard left to hard
right, plus a second set with the brake lights on. Vertical motion is real: a car keeps its climb rate from one frame to the next,
so if the road drops away faster than gravity pulls the car down, it leaves the road.

| File | Contents |
| --- | --- |
| `assets/` | Generated sprite sheets, panoramas and `manifest.js` (layout and anchors) |
| `js/assets.js` | Loads the sprite sheets and cuts car sheets into pose frames |
| `js/sprites.js` | Small drawing helpers (sun, shadows, pixel font) |
| `js/tracks.js` | Themes, course layouts and rival drivers |
| `js/audio.js` | WebAudio engine note, tyre squeal, impacts and the music loop |
| `js/game.js` | Track builder, physics, AI, renderer, HUD and menus |

### Adding a course

Add an entry to `COURSES` in `js/tracks.js`. Sections are `[length, curve, road, ground]`:

```js
[60, 3, 24]       // 60 segments, firm right bend, climbing to height 24
[50, 0, 40, 0]    // straight that climbs to 40 on pillars while the ground stays at 0
{ jump: 6 }       // a kicker that throws you into the air at speed
```

Heights are in hundreds of world units. The builder eases every change in and out and
closes the loop for you.

## Regenerating the sprites

The `tools/` folder holds the sprite pipeline. You need Node, Python 3 with Pillow and
NumPy, and Playwright's Chromium.

```bash
cd v2/tools
npm install                 # three.js for the model studio
node render.js              # renders every model to tools/raw/ (about 700 images)
python3 pixelate.py         # shrinks, posterizes and outlines into ../assets/
python3 backdrops.py        # paints the horizon panoramas into ../assets/
```

- `studio.html` has the 3D models: the three MR2 generations, the rival cars and all the
  roadside objects. Open it in a browser to tinker; `window.renderSprite(spec)` renders one.
- `render.js` lists every sprite to render: paints, poses, camera angles and pixel density.
  Pass a name filter to re-render a subset, for example `node render.js car_aw11`.
- To add a paint colour, add it to `PAINTS` in `render.js` and `js/game.js`, then re-run
  the first two steps.
