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
| Keyboard | Hold **←** or **→**, **Space** to boost   |

Let go to straighten out. Boost is the one extra input: the button at the
bottom of the screen, or Space / Up / W.

Note this is a deliberate departure from the original one-thumb rule in
CLAUDE.md. Steering and boosting at the same time needs a second finger on a
touchscreen.

---

## Current state: Milestone 1.8

Milestone 1 answers one question and nothing else: **does the drift feel
good?** There is deliberately no score, no grading, no damage, no timer, no
menu and no results screen — those are later milestones.

What is in:

- A real **circuit**, not a scrolling strip. The track is a line that genuinely
  turns through the world, so a corner is a corner: it has a radius, and you
  come out of it pointing somewhere new.
- **Two full 180-degree hairpins per lap**, turning opposite ways, driven as
  one continuous held drift all the way round.
- **Four back-to-back esses** with no straight between them: three direction
  changes in a row, flicking the car from one side to the other.
- 85% of the lap is spent in a corner. The longest straight is 520 units.
- The road is **380 units wide on the straights and up to 460 through the
  corners** — the tighter the corner, the more tarmac it gets, opening and
  closing smoothly, and staying open across a direction change instead of
  nipping in between two corners that meet.
- Hitting a wall now helps you recover instead of trapping you. See below.
- The lap returns to exactly the heading it started on, so it drives like a
  circuit rather than a spiral.
- Low, close chase camera turning to follow the car, over a world-anchored
  ground grid, under a sun and stars fixed in the world — all of which sweep
  across as you turn, which is what lets you feel that a hairpin really has
  turned you around.
- **Minimap** top right, showing the lap's shape and where you are on it.
- Hitting a wall costs **10% of your speed**, won back over one second.
- **Boost**: one press gives 25% more speed instantly — full on the very next
  frame — held for one and a half seconds, then eased back over three. Unlimited presses.
  Bottom-centre button on touch and mouse, Space / Up / W on the keyboard.
- **Lap timer**: running time for the lap you are on, plus the last three
  completed laps with the quickest of them called out.
- **Lap counter** with a progress bar. One lap is the whole corner sequence
  once, about 35 seconds of driving.
- The car is an original low, wide, red mid-engine shape drawn in code:
  footprint on the tarmac, raised body over it, four wheels that steer with
  the drift, glass, side intakes, engine slats, quad tail lights and exhaust
  flare while boosting.
- Chevrons ahead of every corner; doubled red-orange ones for the hairpins.
- Edge contact detected, with screen shake, an edge flash and a word telling
  you which mistake you made — but no health lost and the run never ends.
- Tire smoke while drifting, and skid marks that stay on the tarmac.
- Constant speed.
- Same amount of road visible on every screen shape, from 9:32 to 32:9.

## What to look for when you test

The point of this milestone is feel, so drive it and answer these:

1. **Does the car feel heavy, or floaty?** Hold a direction, then let go.
   It should keep sliding for a beat before it straightens.
2. **Can you hold the middle of a curve?** Start your hold as the chevrons
   go past, and let go before the curve ends.
3. **Do you get enough warning?** A crash should always feel like your fault.
4. **Are the two mistakes clear?** Run wide and you hit the outer edge
   (amber, "RAN WIDE"); cut in and you hit the inner edge (violet, "CUT IN").
5. **The hairpins.** Two a lap, opposite ways, signed with doubled red-orange
   chevrons. Hold the whole way round — do not let go in the middle.
6. **The esses.** Four corners with nothing between them. This is where the
   0.42-second flick time bites; if they feel impossible rather than hard,
   that is the number to change.
7. **Look further ahead than feels natural.** Testing showed the same driver
   goes from 33 contacts to 2 purely by looking further up the road. If that
   does not come across while playing, the telegraphing needs work.
8. **Does it work on your phone?** One thumb, either side.

---

## How the drift works

There are **two angles**, and the gap between them is the whole thing.

- `cmdSlip` is how far round the **body** has swung. It answers your thumb
  almost at once.
- `gripSlip` is how far round the **tyres have actually taken hold**. It
  trails the body by `GRIP_TAU`.

The car's path bends from `gripSlip`, never from `cmdSlip`. So flicking in
swings the tail out *before* the car goes anywhere, and letting go squares the
body up while the car is *still coming round*. Set `GRIP_TAU` to zero and both
of those disappear and it goes straight back to looking like plain steering.

Measured at the shipped settings: a quarter of a second after turn-in the body
is 31 degrees sideways while the path has only bent 5 degrees. Let go
mid-corner and the path comes round another 33 degrees while the body actually
rotates back.

### The cost, measured

That lag is not free. It is the difference between drifting and turning, and
it is also the hardest thing about driving the car. Contacts in 30 seconds for
the same test driver, changing nothing but `GRIP_TAU`:

| GRIP_TAU | 0.00 | 0.06 | 0.12 | 0.20 |
|---|---|---|---|---|
| contacts | 16 | 21 | 25 | 28 |

Zero reproduces the old model exactly. The game ships at **0.09**. If it ever
feels uncontrollable rather than loose, that is the one number to lower.

## Changing how it feels

Top of [`src/car.js`](src/car.js):

```js
var MIN_RADIUS    = 504;   // tightest circle the car can carve, at any speed
var SLIP_AT_LIMIT = 58;    // degrees sideways at full lock — the drift dial
var BUILD_TAU     = 0.34;  // seconds to swing the body out
var DECAY_TAU     = 0.55;  // seconds for it to square itself up
var REVERSE_TAU   = 0.42;  // seconds to flick the other way
var GRIP_TAU      = 0.09;  // how far the path lags the body — drift vs turning
```

`GRIP_TAU` decides how much this looks like drifting. `SLIP_AT_LIMIT` decides
how sideways it gets. `REVERSE_TAU` is the chicane dial. `MIN_RADIUS` is the
difficulty dial for the whole track: it is the tightest circle the car can
carve at **any** speed, because the turn rate is derived from the current
speed. Every corner is checked against it by a test.

## Changing the circuit

The lap is the `LAP` list near the top of [`src/road.js`](src/road.js), written
the way a track map reads — a straight of so many units, then a corner of so
many degrees at such a radius.

Road width is the gentlest difficulty dial there is: it changes how much room
you have to be wrong in without touching a single corner. Three numbers at the
top of [`src/road.js`](src/road.js) control it:

```js
var BASE_HW      = 190;      // half width on a straight
var CORNER_EXTRA = 40;       // how much wider the tightest corner gets
var TIGHTEST_K   = 1 / 600;  // what counts as "tightest"
```

Corners widen in proportion to how tight they are, so the hardest corners get
the most help and easy sweepers get almost none.

The width is worked out in two passes: a rolling **maximum** of that figure
over 240 units either side, then a blur over the result. The maximum is the
important one — where two opposite corners meet, the curvature passes through
zero for an instant, and anything that averages instead of maximising gets
dragged down by exactly the dip it is meant to fill, nipping the road in
between the two corners. The blur then takes the corners off it so the width
glides rather than steps.

**For harder levels later, this is the dial to turn.** Narrowing `CORNER_EXTRA`
toward zero makes the whole circuit harder without changing a single corner's
shape, which means difficulty tiers can reuse the same track.

**The one rule: no corner's radius may go near 503.** A corner at exactly that
radius needs 100% of the car's turning for its whole length, which leaves
nothing to correct a mistake with and makes it feel unfair rather than hard.
The tightest corner on the track is 600, which asks for about 84%. There is a
test that fails if any corner ever breaks this rule.

Two more things worth knowing:

- Corner **radius** is the difficulty, not the angle. A 180 at radius 900 is
  easy; a 60-degree corner at radius 600 is hard.
- The lap's left and right degrees are made to cancel out, so the track comes
  back to the heading it started on.

## Speed and boost

`BASE_SPEED`, and the four boost numbers, are at the top of
[`src/game.js`](src/game.js).

Cruising speed is 624 and boost takes it to 718.

The important part is not the boost itself, it is what had to change to make
it safe. The car's turn rate is worked out from whatever the speed currently
is, so that the tightest circle it can carve stays fixed at `MIN_RADIUS`
however fast it is going. Without that, boost would push the tightest circle
well past the 600-unit corners and boosting into a hairpin would simply throw
you off the road.

With it, boost costs you **time** instead: same geometry, 15% less of it.
That is the risk, and it is a fair one.

Speed is also the strongest difficulty lever in the game, because the car's
reaction times are fixed in seconds — at a higher speed you cover more ground
while a drift builds. Going from 567 to 624 took a well-anticipating test
driver from 2 edge contacts in 30 seconds to 9. If that turns out to be too
much, `CORNER_EXTRA` in [`src/road.js`](src/road.js) is the offset: it hands
back margin in exactly the corners where speed costs it, without touching the
corners themselves or the speed.

## What happens when you hit a wall

A crash nudges you toward the correction you actually needed, which is not
the same in both directions:

- **Ran wide** (hit the outer edge) means you were not turning *enough*. The
  crash now turns the car a little further into the corner, starting from
  however much it was already steering. Before, it bled the steering off,
  which made the problem worse and meant one mistake scraped the rest of the
  corner. Measured on a hairpin: recovery went from 3.66 seconds and seven
  contacts down to 1.46 seconds and two.
- **Cut in** (hit the inner edge) means you were turning *too much*, so here
  the crash does bleed some steering off — that is the right correction, and
  this case is unchanged.

There is still no health and the run still never ends; that is a later
milestone. The point of this is only that a mistake should be recoverable.

## Camera

The block marked `THE CAMERA` at the top of [`src/road.js`](src/road.js).
`CAM_BACK` is how far behind the car it sits — smaller is closer. `HORIZON_Y`
is how high the horizon sits on screen, which is really the camera's tilt:
a bigger number means a lower, more level camera and more sky.

## A note on car artwork

Everything in the game is drawn in code, including the car. That is not only
the rights rule in CLAUDE.md — downloaded artwork physically cannot work
here. The published page blocks all external images, and the Playables rules
forbid external assets and network calls, so a fetched image would simply
fail to load in the thing you are actually playing. If we ever want richer
artwork, the route is a hand-drawn vector car in code, not a downloaded one.

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

## Why the road model was replaced

The old track was stored as *how far the road centre had slid sideways* — a
sideways slide, not a rotation. That model could not represent a U-turn at all:
it would have needed the centre to slide sideways infinitely fast.

Milestone 1.2 replaced it. The centreline is now integrated from curvature in
world space, so the road genuinely turns, and the car has a heading in that
same world. A 180 is now just a corner with 180 degrees in it.

The cost of that change was the control model: holding used to mean "slide
sideways", and now means "rotate". Everything about the weight and timing of a
drift was kept, but the thing being steered is different underneath.

## Two rules the code is built around

**Responsive fairness.** The game is always drawn into a fixed 720 × 1280
rectangle that is scaled to fit and centred, so every player sees exactly
4800 world units of road ahead no matter what they are playing on. Spare
screen becomes black bars, never extra road. A tall phone must not be able
to see further ahead than a wide monitor.

**No external anything.** No CDNs, no analytics, no image or audio files, no
fonts fetched from the web, no network calls at all. The game boots in about
20 milliseconds against a 5-second Playables budget.
