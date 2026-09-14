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

## Current state: Milestone 2.2

There is still no score, no grading and no damage — a run never ends, and
those are later milestones. What is in:

- **Three circuits to choose from**, each built to a stated lap time: a clean
  lap is **25 seconds** on Velocity Ring, **32** on Harbour Maze and **40** on
  Grand Circuit. Then a **three lap race** with a results screen: total, each
  lap, and the quickest of them called out.
- Every circuit is a genuine closed loop — it comes back to its own starting
  point, not just its starting heading.
- **Barriers you can see and hit.** A solid wall stands along both edges of
  the road, and a crash now lights the wall up where you struck it, throws
  real sparks that fall and lie on the tarmac behind you, rocks the car on its
  springs and shoves it back off the wall over about a fifth of a second.
- A real **circuit**, not a scrolling strip. The track is a line that genuinely
  turns through the world, so a corner is a corner: it has a radius, and you
  come out of it pointing somewhere new.
- **A full 180-degree hairpin on every lap**, driven as one continuous held
  drift all the way round.
- **Back-to-back corner changes** with no straight between them, flicking the
  car from one side to the other.
- Between 45% and 73% of a lap is spent in a corner, depending on the circuit.
- The road is **452 units wide on the straights and up to 553 through the
  corners** — the tighter the corner, the more tarmac it gets, opening and
  closing smoothly, and staying open across a direction change instead of
  nipping in between two corners that meet.
- Hitting a wall helps you recover instead of trapping you. See below.
- The lap returns to exactly the heading it started on, so it drives like a
  circuit rather than a spiral.
- Low, close chase camera turning to follow the car, over a world-anchored
  ground grid, under a sun and stars fixed in the world — all of which sweep
  across as you turn, which is what lets you feel that a hairpin really has
  turned you around.
- **Minimap** top right, showing the lap's shape and where you are on it.
- Hitting a wall costs **10% of your speed**, won back over one second.
- **Boost is earned, not free.** A meter round the boost button; a press
  spends about a third of it. It fills two ways: by drifting, where an
  unbroken slide pays better the longer you hold it, and by collecting the
  pickups on the road. Each circuit has a **fixed, hand-placed set** — four
  plus one big one on the Ring, five plus one on the Maze, six plus one on the
  Grand — and the same set comes round every lap, from lap one.
- **A big slide costs speed.** Being sideways scrubs up to about 13% off, so
  drifting hard for fuel is a real trade against a clean quick line.
- **Boost**: one press gives **40% more speed on the very next frame**, holds
  there for a second, eases down to 30% over the second after that, and then
  bleeds the last of it away over three more. Bottom-centre button on touch and
  mouse, Space / Up / W on the keyboard.
- **Boost also squares the car up.** Lighting it mid-drift takes 15% of the
  angle off at once, and the car then straightens **half again as fast as
  normal** — but only while you are *not* holding a side. Hold one and the
  drift stays: holding is you asking for it.
- **Lap timer**: running time for the lap you are on, plus the last three
  completed laps with the quickest of them called out.
- **Lap counter** with a progress bar. One lap is the whole corner sequence
  once: 25, 32 or 40 seconds of driving depending on which circuit you picked.
- The car is **real 3D geometry**, not a flat shape: cross-sections from nose
  to tail plus a greenhouse on top, four cylindrical wheels that sit on the
  tarmac and steer with the drift, every face depth-sorted and lit from its
  own angle to the light.
- Chevrons ahead of every corner; doubled red-orange ones for the hairpins.
- Edge contact, with screen shake, sparks, a glowing patch of barrier, an edge
  flash and a word telling you which mistake you made — but no health lost and
  the run never ends.
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
5. **The hairpin.** One a lap, signed with doubled red-orange chevrons bolted
   to the barrier. Hold the whole way round — do not let go in the middle.
6. **The esses.** Corners with nothing between them. This is where the
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
var SLIP_AT_LIMIT = 52;    // degrees sideways at full lock — the drift dial
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
var BASE_HW      = 226;      // half width on a straight
var CORNER_EXTRA = 52;       // how much wider the tightest corner gets
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

## How a circuit gets its lap time

Each circuit is written as a list of straights and corners, the way a track
map reads. On its own that list does not close: walk it and you come back to
the heading you started on but a long way from the starting point, which is
why early maps looked like rally stages rather than circuits. Two things fix
that, both in `closedLap` in [`src/road.js`](src/road.js).

**Closing it.** Stretching and shrinking the straights can move the finish
point anywhere in the plane — two unknowns, two equations. Rather than loading
the whole correction onto two straights, it is spread across every straight in
the smallest total change that shuts the loop, so the layout keeps its
character.

**Making it take the right number of seconds.** The same pass also aims at a
target length. The length pull is strong in the early passes and fades out, so
the last passes are free to concentrate on closing. Then one uniform scale
lands it exactly on the target — and scaling a closed loop leaves it closed, so
that final step costs nothing. It scales the corner radii too, which is why a
test checks every circuit against the tightest circle the car can carve.

The target itself comes from `targetSecs x pace` on each track. `pace` is how
many world units a clean lap actually covers per second, **measured from a
driven lap rather than guessed** — 869, 858 and 868 for the three circuits.
Driven cleanly with no wall contact the three now come out at **25.0, 32.0 and
40.0 seconds**. Change anything that affects how fast a lap is driven — the
boost envelope most of all — and these three numbers have to be re-measured,
or the stated lap times quietly stop being true.

## Where lap-to-lap variety comes from

The complaint was that once you know the track every lap comes out the same.
Three things now pull against each other, and the balance you strike changes
the time:

1. **Drifting earns boost but costs speed.** Lean on it for fuel and you are
   slower through the corner; drive the tight line and you arrive with an
   empty meter.
2. **The pickups make you choose a line.** They alternate sides, so collecting
   the lot means weaving across the road; the big one sits on the inside of the
   hairpin exit, where the car is still sliding wide, so taking it means giving
   up the easy line out of the slowest corner on the track. They are fixed per
   circuit and identical every lap, so which ones are worth the detour is
   something you learn rather than something that happens to you.
3. **Boost is finite**, so when you spend it matters.

Measured over four laps by the same test driver, the spread went from 2.9% to
**8.6%** — laps between 22.4 and 28.1 seconds.

## Speed and boost

`BASE_SPEED`, and the four boost numbers, are at the top of
[`src/game.js`](src/game.js).

Cruising speed is 808 and boost takes it to 1131 — 40% more, from the very
next frame — then 1050 a second later, back to 808 five seconds after the
press.

The envelope has a step in it rather than one long fade, and that is the
point. A single fade reads as one event; a shove that settles into a shorter
push reads as two, so you feel the peak come off instead of just noticing, at
some point, that you are slow again.

Boost is also a **steering** input, not only a speed one. Press it and the car
takes 15% of its drift angle off at once and then straightens half again as
fast as normal — but only while you are not holding a side. So boost on the
exit of a corner and the car snaps into line for the straight; boost while
still holding and it stays sideways and just goes faster. Both are useful, and
choosing between them is the decision the change adds.

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

## The barriers

There is a solid wall down both edges now — 66 units tall, sitting 6 units
outside the painted line, so the car's outer edge stops a hair short of the
wall face. It is built from the same ribbon of road the tarmac is drawn from:
each panel is a vertical quad standing on the road edge. Raising a point does
not move it sideways on screen under this projection, so a panel's top edge is
just its foot's x with the y lifted by the wall height times the scale — no
second projection needed, which is why a wall on both sides of the road costs
almost nothing.

Walls are painted **before** the road surface. Where the circuit folds back
over itself in a hairpin, that makes the near tarmac cover the distant
barrier, instead of a barrier hanging in mid-air over the road in front of you.

The warning chevrons are now bolted to the barrier face rather than lying flat
on the ground beside it, the way real circuit signage is — flat on the ground
they would simply be hidden behind the wall.

### Two things the walls broke, and the fixes

**A wedge torn out of the road.** Sideways-on next to an edge, the road beside
the camera is wider than the near plane is deep, so one edge of a slice can
fall behind the near plane with the other still well in front. Throwing the
whole slice away — which is what the code did — tore a wedge out of the road
and the barrier right next to you, every single time you got properly
sideways. The offending edge is now slid along the cross-section to the near
plane instead, and the slice remembers where its edge points ended up so the
lane markings still land in the right place.

**Half the screen going cyan.** Road markings are a fixed width in *world*
units, so a metre of neon a few metres from the lens is hundreds of pixels
across. Fine head-on, where it is off the side of the screen; not fine
sideways-on, where the edge line swings across the view. Past a scale ceiling
a marking's world width is now wound down in step with the magnification, so
it holds a steady width on screen. Because the scaling starts at exactly 1 at
the ceiling there is no visible seam.

## What happens when you hit a wall

You can now see it happen. The stretch of barrier you struck glows for
three quarters of a second, sparks come off the contact point — thrown back
along the car and in off the wall, with real height, so they arc up, fall,
skitter and stay lying on the tarmac as you drive past them — the body rocks
on its springs and settles over about half a second, and the car is pushed
back off the wall over roughly a fifth of a second rather than being teleported
clear. Grinding along a wall throws a thin continuous shower for as long as you
stay on it, so a long scrape looks different from a single knock.

Underneath, a crash nudges you toward the correction you actually needed, which
is not the same in both directions:

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

## The tap that would not start a race

Worth writing down, because the test suite had a check for exactly this and
it passed the whole time the game was broken.

A press does two things on the menu: it sets a tap for the card under your
finger, and — because the left and right halves of the screen are the steering
control — it also reads as steering. `updateMenu` acted on the steering first,
so pressing a card moved the selection OFF that card, and the tap that arrived
a moment later could only ever select it again. "Tap again to race" could
never match. The race never started.

The automated test missed it for two reasons at once. Playwright's `click()`
presses and releases inside a single frame, so the pointer was already gone by
the time the game looked at it; and the test clicked the exact centre of the
card, which on a 720-wide playfield is the exact centre of the screen — the one
x where the left/right split is ambiguous. A human tap is neither: it holds for
a tenth of a second, and it lands off-centre.

Two fixes. Menus now read `Input.steerKeys()`, which is keyboard only, because
on a menu a press is a tap on a card and nothing else. And starting a race
calls `Input.releaseAll()`, so the finger that pressed "race" does not also
throw the car into a drift before the player has seen the road. The regression
test now presses, waits, and releases, off-centre — like a thumb.

## Camera

The block marked `THE CAMERA` at the top of [`src/road.js`](src/road.js).
`CAM_BACK` is how far behind the car it sits — smaller is closer. `HORIZON_Y`
is how high the horizon sits on screen, which is really the camera's tilt:
a bigger number means a lower, more level camera and more sky.

## The car is a real 3D model

It used to be a cheat: a flat outline with a copy of itself shifted upward and
the gap filled in. That is why it looked like cardboard once the camera came
down — it never foreshortened, and the "roof" was just the floor plan moved up
the screen.

It is now genuine 3D. Points are defined in the car's own space (x across,
y forward, z up), turned into the world by the body's heading, and run through
the same camera as the road — which now understands height, not just ground.
Every face is sorted back to front so nearer panels cover further ones, and
shaded by the angle between its own normal and the light.

The model itself is a set of cross-sections from nose to tail, a greenhouse on
top with a raked screen, and four wheels built as short cylinders that sit on
the road and steer with the drift.

It is authored rather than downloaded, and that is not a compromise we chose:
the published page blocks all external files and the Playables rules forbid
external assets, so a downloaded model could not load in the thing you are
actually playing. Geometry in code is the only kind of 3D that ships here.

## Files

```
index.html      the page: one canvas, five scripts
style.css       stops the page scrolling, zooming or selecting text
src/input.js    touch, mouse and keyboard  ->  one number: -1, 0 or +1
src/road.js     the track, and how the road is drawn
src/car.js      the drift physics and the car
src/fx.js       smoke, skid marks, screen shake, edge flash, crash sparks
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
2600 world units of road ahead no matter what they are playing on. Spare
screen becomes black bars, never extra road. A tall phone must not be able
to see further ahead than a wide monitor.

**No external anything.** No CDNs, no analytics, no image or audio files, no
fonts fetched from the web, no network calls at all. The game boots in about
20 milliseconds against a 5-second Playables budget.
