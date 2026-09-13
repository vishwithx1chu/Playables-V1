# Drift Run

A one-thumb neon drift game for YouTube Playables. Plain HTML5 Canvas and
vanilla JavaScript — no build step, no packages, and no downloaded art,
fonts or sound of any kind. Everything you see is drawn in code.

Design brief and house rules live in [CLAUDE.md](CLAUDE.md).

---

## How to play it

Double-click `index.html`. That is the whole install.

It runs straight off the file system in any modern browser — there is no
server to start and it never touches the internet.

**Controls — one mechanic, three devices:**

| Device   | Do this                                  |
|----------|------------------------------------------|
| Phone    | Press and **hold** the left or right half of the screen |
| Mouse    | Click and **hold** the left or right half |
| Keyboard | Hold **←** or **→**                       |

Let go to straighten out. That is every input the game has.

---

## Current state: Milestone 1.1

Milestone 1 answers one question and nothing else: **does the drift feel
good?** There is deliberately no score, no grading, no damage, no timer, no
menu and no results screen — those are later milestones.

What is in:

- Chase camera sitting behind and above the car, so the road recedes to a
  horizon and you can read the depth. The car still sits in the lower third.
- Curves both ways with straights between them, repeating forever, plus a
  long **hairpin** once a lap that swings the road one and a half times its
  own width — and swaps direction every lap so it never becomes routine
- Amber warning chevrons ~1.7 seconds ahead of every curve; the hairpin gets
  doubled red-orange chevrons much earlier
- The full drift mechanic, with weight and momentum
- Edge contact detected, with screen shake, an edge flash and a word telling
  you which mistake you made — but no health lost and the run never ends
- Tire smoke while drifting, and skid marks that stay on the road
- Constant speed
- Same amount of road visible on every screen shape, from 9:32 to 32:9

---

## What to look for when you test

The point of this milestone is feel, so drive it and answer these:

1. **Does the car feel heavy, or floaty?** Hold a direction, then let go.
   It should keep sliding for a beat before it straightens.
2. **Can you hold the middle of a curve?** Start your hold as the chevrons
   go past, and let go before the curve ends.
3. **Do you get enough warning?** A crash should always feel like your fault.
4. **Are the two mistakes clear?** Run wide and you hit the outer edge
   (amber, "RAN WIDE"); cut in and you hit the inner edge (violet, "CUT IN").
5. **The hairpin.** Once a lap, doubled red-orange chevrons warn you well in
   advance. It needs a near-maximum drift held for about two seconds. It
   should feel like the hardest thing on the track but never impossible.
6. **Does it work on your phone?** One thumb, either side.

---

## Changing how the drift feels

The four numbers that decide the whole feel are at the top of
[`src/car.js`](src/car.js), on their own, with comments:

```js
var MAX_DRIFT_DEG = 38;    // how far round the car slews
var BUILD_TAU     = 0.30;  // seconds to lean into a drift
var DECAY_TAU     = 0.55;  // seconds to straighten after you let go
var REVERSE_TAU   = 0.34;  // seconds to flick from one drift to the other
```

`DECAY_TAU` is the momentum dial. Raise it and the car feels heavier and
slides longer; lower it and the car snaps back like a switch.

Track shape is the `PATTERN` list near the top of
[`src/road.js`](src/road.js). Each curve's `amp` is its peak sideways slope,
and the drift angle needed to hold the centre through it is `asin(amp)` — so
`amp` must stay comfortably under `sin(MAX_DRIFT_DEG)` or the corner becomes
undriveable. The hairpin is the one that sits closest to that ceiling.

The camera is the block marked `THE CAMERA` at the top of
[`src/road.js`](src/road.js). Lower `CAM_BACK` for a more dramatic, lower
angle; raise it to flatten back toward the old top-down view.

---

## Files

```
index.html      the page: one canvas, five scripts
style.css       stops the page scrolling, zooming or selecting text
src/input.js    touch, mouse and keyboard  ->  one number: -1, 0 or +1
src/road.js     the track, and how the road is drawn
src/car.js      the drift physics and the car
src/fx.js       smoke, skid marks, screen shake, edge flash
src/game.js     the loop, and the responsive fairness rule
```

---

## A limit worth knowing about

The track is stored as *how far the road centre has slid sideways at a given
distance* — a sideways slide, not a rotation. Your only control is a sideways
slide rate, and it caps at `sin(MAX_DRIFT_DEG)`.

That means a **literal 180-degree U-turn cannot exist in this model**: it
would need the road centre to slide sideways infinitely fast. The hairpin is
the sharpest corner the model can express and still be driveable. A real
U-turn would need the road stored as a heading that curves through world
space, and a camera that rotates with the car — a different game to steer,
and a decision to take deliberately rather than by accident.

## Two rules the code is built around

**Responsive fairness.** The game is always drawn into a fixed 720 × 1280
rectangle that is scaled to fit and centred, so every player sees exactly
4800 world units of road ahead no matter what they are playing on. Spare
screen becomes black bars, never extra road. A tall phone must not be able
to see further ahead than a wide monitor.

**No external anything.** No CDNs, no analytics, no image or audio files, no
fonts fetched from the web, no network calls at all. The game boots in about
20 milliseconds against a 5-second Playables budget.
