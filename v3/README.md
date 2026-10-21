# Midship Drift III

A new game in the [Midship Drift](../) series. Versions [I](../v1/) and [II](../v2/)
race on long point-to-point style loops. III races on short knotted circuits that twist
back over and under themselves, so you drive across bridges over the road you were just
on. Corners are tight enough that you need to drift. It's in the spirit of the late-80s
"power slide" cabinets: cartoon racers, a winged START sign that flaps away when the race
begins, and a row of driver faces across the top of the screen showing who's where.

The star car is Leo's Mk3 MR2 roadster, roof down, with Leo in the yellow helmet.

Everything is original. The track, cars and scenery are drawn from code when the game
loads; the pixel-art scenery is shared with Midship Drift I. Music and sound are
synthesised. No names, logos, tracks, characters or artwork are taken from any existing
game.

## Play

Open `v3/index.html` in a browser. It needs no build step and no server, so
double-clicking the file works. It needs WebGL, which every current browser has.

| Action | Keys | Touch |
| --- | --- | --- |
| Steer | Left / Right, or A / D | Arrow buttons, bottom left |
| Accelerate | Up, W or Z | GAS |
| Brake | Down, S or X | BRK |
| Drift | Hold Accelerate and Brake together while steering (Space or Shift does both) | Hold DRIFT |
| Pause | P or Esc | II |
| Music on/off | M | |

### Drifting

On grip the MR2 goes where it points, but a tight corner at full speed will push it wide.
To drift, steer into the bend and **hold the accelerator and brake together**. The tail
swings out and the car can turn much tighter without losing much speed. While both are
held the brake doesn't slow you, it just holds the slide. Steer to swing the nose in or
out.

**Let go of either pedal to come out of the drift.** The tyres grip again and the car
straightens up to point straight down the road, so there's no need to steer the other
way to catch it. If you slide into a wall the drift ends; let go and press
again to start a new one.

Hold a drift for long enough and the sparks under the car change colour. Let go on blue
sparks for a **TURBO**, or on orange sparks for a **SUPER TURBO**.

### Racing

- **Championship:** five courses in a row against nine cartoon rivals. Finish in the top
  three to go through to the next one. Races are four laps. Points go 15-12-10-8-6-5-4-3-2-1.
- **Single race:** pick any course. Best laps are saved in your browser.
- **Garage:** pick the MR2's paint.

The faces across the top are the running order, leader on the left. Your face flashes. A
driver grins when they gain a place and scowls when they lose one.

## Courses

| # | Course | Bridges | What to expect |
| --- | --- | --- | --- |
| 1 | Pretzel Park | 1 | A seaside figure-eight with one big flyover |
| 2 | Canyon Hook | 1 | A long desert sweeper that hooks back under itself |
| 3 | Trefoil Peaks | 3 | A three-leaf knot through moonlit pines |
| 4 | Spaghetti Junction | 6 | Neon flyovers stacked three decks high |
| 5 | Lava Knot | 7 | Seven crossings over the lava fields |

## How it works

Earlier versions draw the road as a strip of segments projected one after another, which
can't show a road crossing over itself. III builds the whole circuit as real 3D geometry
and draws it with a small WebGL renderer, using a depth buffer so bridges, pillars and
the roads underneath sort themselves out. It renders to a low-resolution canvas (224 px
tall) and scales up with nearest-neighbour filtering for the chunky look.

**Tracks.** A course is just a closed outline in the ground plane, such as a figure-eight
or a trefoil knot. The builder resamples it every 3 m, works out heading, curvature and
banking, then finds every place where the outline crosses itself. At each crossing it
lifts one branch on a smooth hump until it clears the other by 8.5 m. A course author
draws the shape and the bridges appear on their own. Pillars go under every raised
stretch, except where they would land on another road. The start line goes on the
straightest stretch of the course.

**Cars** live in track coordinates: distance along the road, sideways offset, where the
nose points and which way the car is actually travelling. When the last two differ the
car is sliding. On grip, the steering sets how fast the car turns, and the car follows
part of each bend by itself, so the steering only has to do the rest. Rubbing a rail
slows you down. Drifting loosens the grip that pulls the direction of travel back into
line with the nose. Cars keep their climb rate, so a hump taken fast throws you into the
air.

**Cars and drivers** are low-poly models built from tapered boxes, octagonal wheels and
big helmeted heads, with a black outline from a fattened back-face copy of each part.

| File | Contents |
| --- | --- |
| `js/art.js` | Pixel-art scenery, backdrops and the tiny font (shared with Midship Drift I) |
| `js/toons.js` | Driver faces, the winged START sign, smoke and sparks |
| `js/courses.js` | Themes, course outlines, drivers and paints |
| `js/track.js` | Track builder: resampling, curvature, banking and automatic bridges |
| `js/gl.js` | WebGL renderer: fogged flat-colour meshes and upright sprites |
| `js/models.js` | The cartoon car models |
| `js/scene.js` | Builds the road, rails, decks, pillars, ground and scenery for a course |
| `js/audio.js` | WebAudio engine note, tyre squeal, impacts and the music loop |
| `js/game.js` | Physics, drifting, AI, camera, HUD and menus |

### Adding a course

Add an entry to `COURSES` in `js/courses.js`:

```js
{
  id: 'bow', name: 'Bow Tie', theme: 'coast', length: 1600,
  blurb: 'Two loops and a crossover.',
  path: t => [Math.sin(t) * 1.5, Math.sin(2 * t)],   // any closed curve, t from 0 to 2pi
  height: u => 3 * Math.sin(u * Math.PI * 4) ** 2,   // optional hills, u = lap fraction
}
```

The outline is scaled to `length` metres. Keep the tightest bends wider than about 25 m.
The builder decides which branch goes over at each crossing, keeping bridges as low as it can.
