# Midship Drift III

A new game in the [Midship Drift](../) series. Versions [I](../v1/) and [II](../v2/)
race on long point-to-point style loops. III races on short knotted circuits that twist
back over and under themselves, so you drive across bridges over the road you were just
on. Corners are tight enough that you need to drift. It's in the spirit of the late-80s
"power slide" cabinets: cartoon racers, a winged START banner whose lamps count you down
before it flaps away, and a row of driver faces across the top of the screen on a black
chequer showing who's where, with your laps lit up under your position.

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
| Accelerate | Up, W or Z | Hold the pedal strip, bottom right |
| Brake | Down, S or X | BRK |
| Drift | Hold Accelerate and Brake together while steering (Space or Shift does both) | Slide your thumb up the pedal strip into DRIFT; slide back down to stop, still on the gas |
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

- **Championship:** two cups of five courses each, against nine cartoon rivals. Finish in
  the top three to go through to the next course. Races are four laps. Points go
  15-12-10-8-6-5-4-3-2-1. The STG boxes at the top show your trophies so far.
- **Single race:** pick any course. Best laps are saved in your browser.
- **Online race:** race up to three friends, each on their own phone or computer. One of
  you makes a room and reads out the four-letter code; the others join with it. Everyone
  picks a different driver, the host picks the course and starts. Online races are just
  the players, with no computer rivals yet. The first race after a quiet spell can take up
  to a minute to connect while the free server wakes up.
- **Garage:** pick the MR2's paint.

The faces across the top are the running order, leader on the left. Your face flashes. A
driver grins when they gain a place and scowls when they lose one.

## Courses

**Sunshine Cup**

| # | Course | What to expect |
| --- | --- | --- |
| 1 | Pretzel Park | A seaside figure-eight with one big flyover |
| 2 | Canyon Hook | A long desert sweeper that hooks back under itself |
| 3 | Trefoil Peaks | A three-leaf knot through moonlit pines, three bridges |
| 4 | Spaghetti Junction | Neon flyovers stacked three decks high |
| 5 | Lava Knot | Seven crossings over the lava fields |

**Thunder Cup**

| # | Course | What to expect |
| --- | --- | --- |
| 6 | Seaspray Stilts | Roller-coaster stilts over the open sea, crest after crest |
| 7 | Summit Switchback | Three hairpins up a steep mountain to the snowline, then a plunge down the far side |
| 8 | Tunnel Vale | Rolling farmland with two tunnels bored through the hills, one of them curved |
| 9 | Big Air Gorge | A sunset figure-eight with a gap jump right over the road below. Hit it at 110 km/h or more |
| 10 | Thunder Spiral | A spiral that climbs into a lightning storm, then flies back over itself |

Miss the jump and you fall into the gap: you are put back on the road before the ramp.

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

The Thunder Cup courses are drawn instead as a list of points, each with its own height,
joined by a smooth spline, which is how they get their hills, undulations and switchbacks.
They can also mark:

- **Hillsides.** The ground rises to meet the road wherever it runs on the ground, is
  cut away so it never covers an open road, and turns to rock on steep slopes and snow
  above the snowline.
- **Tunnels** between two points. The road gets walls, a roof and ceiling lamps, a
  concrete portal at each end, and a hill heaped over the top. The engine echoes inside.
- **Jumps** at a point: a hazard-striped kicker ramp, then a gap with no road. Inside the
  gap the road profile drops away steeply, so anything fast enough flies over it, and a
  car that comes down in the gap has fallen.

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
| `js/toons.js` | Driver faces, the START banner and lamps, smoke, sparks, newer scenery and the HUD font |
| `js/courses.js` | Themes, course outlines, drivers and paints |
| `js/track.js` | Track builder: outlines and drawn courses, curvature, banking, automatic bridges, tunnels and jumps |
| `js/gl.js` | WebGL renderer: fogged flat-colour meshes and upright sprites |
| `js/models.js` | The cartoon car models |
| `js/scene.js` | Builds the road, rails, decks, pillars, tunnels, hillsides, sea and scenery for a course |
| `js/audio.js` | WebAudio engine, gears, tyres, wind, tunnel echo, jumps, thunder and two music loops |
| `js/net.js` | Online play: server connection, clock sync and smoothing other players' cars |
| `js/game.js` | Physics, drifting, AI, camera, HUD and menus |
| `../server/` | The online relay server (Node.js), hosted on Render. See [MULTIPLAYER.md](MULTIPLAYER.md) |

### Online play

Each player's game drives its own car and sends its position to a small relay server
20 times a second; the server passes it on to the others and decides the finishing
order. [MULTIPLAYER.md](MULTIPLAYER.md) explains the design.

To try it on one computer, run the server locally and open the game in two windows:

```bash
cd server
npm install
node server.js
```

Then open `v3/index.html?server=ws://localhost:8080` (served from a local web server, not
as a file) in each window.

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

Or draw one as points, `[x, z, height]` in metres, which the road passes through in order:

```js
{
  id: 'hill', name: 'Hill Loop', theme: 'meadow', startPoint: 0, terrain: true,
  blurb: 'Up and over a hill, through a tunnel.',
  points: [[0, 0, 0], [200, 0, 4], [320, 80, 14], [300, 220, 24], [150, 260, 20], [0, 220, 10], [-80, 100, 3]],
  tunnels: [[4, 5]],                    // roofed over from point 4 to point 5
  jumps: [{ at: 1.5, gap: 24, rise: 5 }], // a kicker halfway between points 1 and 2
}
```

Keep points roughly evenly spaced (60 to 120 m apart), keep jumps on straights with room
to land, and keep tunnels and jumps away from the start line and from crossings.
