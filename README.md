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

On the menus the arrow keys move the selection and **Space** confirms, so the
whole game — choosing a mode, choosing a circuit, racing — works without ever
touching the mouse.

Let go to straighten out. Boost is the one extra input: the button at the
bottom of the screen, or Space / Up / W.

Note this is a deliberate departure from the original one-thumb rule in
CLAUDE.md. Steering and boosting at the same time needs a second finger on a
touchscreen.

---

## Current state: Milestone 3.0 — career mode

The game is growing from four standalone modes into a career: ten cities, a
garage of cars, upgrades, and a story running through all of it. That's a big
enough change that it's being built in phases, each one small enough to test
on its own — see [`docs/content-plan.md`](docs/content-plan.md) for the full
map of cars, upgrades, circuits and cities everything after this is built
against.

**Phase 0 — foundations.** No new gameplay yet; this is the floor everything
else stands on.

- **A save file.** [`src/save.js`](src/save.js) — currency, owned cars, their
  upgrades and colours, unlocked races, best results, all in one small local
  file with no account and no server, per the Playables rules. Every read and
  write is wrapped: if `localStorage` is unavailable or throws — a real
  possibility inside a sandboxed embed — the game falls back to memory only
  rather than crashing. A version number on the saved data means a shape it
  doesn't recognise is discarded rather than fed into code that expects
  something newer.
- **A Title screen above everything that existed before.** Three doors —
  **STORY**, **QUICK PLAY**, **GARAGE**. Quick Play leads into exactly what
  used to be the whole game — Race, Practice, Rush, Duel, all unchanged.
  Story and Garage are real, reachable rooms with nothing built in them yet;
  putting the door in now means every later phase has somewhere to open onto,
  instead of each one bolting onto a flatter menu and forcing another
  restructure later.

Checked with 24 new tests: the game boots on the title screen, every door
does what it says (including that a "coming soon" room is a dead end until
you tap back), and the save survives — a genuine page reload, corrupted JSON
sitting in storage, and storage that throws on every call all leave the game
running, tested each way separately.

**Phase 1 — the Garage.** Eight cars, three archetypes, real stats, real
colours. The full roadmap — Currency ended up shipping before Terrain (it
needed none of Terrain's track-model work, and answers the original
engagement problem more directly); Terrain still comes before AI opponents
and the real city circuits, which do need whatever track model exists — is
in [`docs/content-plan.md`](docs/content-plan.md#development-roadmap).

- **One mesh, three archetypes.** [`src/car.js`](src/car.js) used to build a
  single hand-authored car at load time. It now builds that same topology —
  same rings, same bands, same face count, so the depth-sort and shading
  code below is untouched — three times, each scaled on four independent
  axes (length, width, height, and an extra one just for the greenhouse's
  height) rather than one uniform stretch. Sport reproduces the exact
  numbers the game already shipped with; Compact comes out short with a
  tall cabin, Muscle long and low, from the same builder.
- **One set of dials, scaled per car.** `MIN_RADIUS`, `SLIP_AT_LIMIT`, the
  three drift taus in `car.js`, and `BASE_SPEED` plus the boost numbers in
  `game.js`, are now STOCK values times a car's multipliers — never edited
  per car by hand. [`src/cars.js`](src/cars.js) is the one place that knows
  how a car's stats become those numbers, which is also the one place
  upgrades (Phase 3) will plug into later.
- **A real Garage screen**, not a stub: browse all 8 cars, a live 3D preview
  in the car's actual colours turning slowly, four stat bars, and a curated
  colour palette rather than a free colour wheel — a wide-open wheel risks a
  car that clashes with the neon road and sky, which is worse for the game,
  not more expressive. Locked cars show their cost and preview normally;
  buying just calls the same `Save.buyCar` currency check the real economy
  will use in Phase 3, so nothing here needs to change when that phase adds
  a real payout.
- **Two Garage bugs, found after shipping, now fixed.** The stat bars were
  first drawn normalized against the roster's own current min/max, so any
  car merely average on a stat (not worst) could still read as a literal
  empty bar — six of eight cars share an identical stock boost value, so
  the other six all showed 0%. They now read against a fixed range centred
  on Nightrunner's stock 1.00, which always fills to ~50%, with headroom
  above today's best car for Phase 3's upgrades. Separately, the 3D preview
  overlapped the name and stat text for every car, not just big ones — the
  road camera's ground-plane perspective ties screen height straight to
  world depth, and the depth needed to draw the car this size always lands
  in the canvas's lower third. The draw is now shifted up in screen space
  after projection to clear that text, and each archetype's preview depth
  is scaled by its own size so Muscle no longer projects visibly larger
  than Compact at the same distance.
- **Tutorial got its own door on the Title screen**, next to Story and
  Garage, rather than living inside Quick Play — its home is ready for
  Phase 8 to build into.
- **A real WebGL preview.** The Garage's car is now [`src/car3d.js`](src/car3d.js),
  a genuine lit 3D scene (Three.js, vendored as a plain classic script so
  it still works when the page is opened as a local file — see the file's
  own comment) on a transparent canvas over the 2D one, with real reflective
  clearcoat paint via a procedural (hand-drawn gradient, no downloaded
  HDRI) reflection environment. The car you actually drive is untouched;
  this is the showcase preview only. After a sculpted-per-car-silhouette
  pass didn't land well, the shape settled on the original box car with its
  edges lightly rounded (a subdivided box with every vertex pulled onto a
  rounded-box surface) rather than a re-sculpted body — same proportions,
  softer corners. Falls back to the original 2D preview if WebGL is ever
  unavailable.

Measured, not just claimed: on Velocity Ring, Warbird's first lap beat
Nightrunner's despite a wider turning circle (22.85s vs 25.92s, min radius
564 vs 504) — exactly the "fast, clumsy until tamed" the car is meant to be.
Alleycat's own balance — a flat speed penalty the tighter turning circle
doesn't yet make back on a technical circuit — is a real result, and a note
for the difficulty-tuning pass in Phase 6, not a bug: first-draft numbers are
supposed to need this.

**Phase 3 — currency & upgrades.** `save.js`'s currency and upgrade
functions, built in Phase 0 but unused until now, do real work: Quick Play
pays out on a graded curve (better than the track's target time, or more
Rush distance, pays more; a rough run is never worth zero) since AI races
and boss races don't exist to pay out yet, and the Garage's stats view gets
an UPGRADES tab — four systems (Tyres/Engine/Transmission/NOS), three
tiers each, every car upgradable to the same max.

- **Convergence, not a flat percentage.** Each tier closes part (30% / 55%
  / 75%, never 100%) of the gap between a car's own stock value and a
  fixed cap shared by every car on that stat — so a cheap car gains more
  per tier than an expensive one already close to the cap, closing the
  distance between them without erasing it. Verified by measurement, not
  just claimed: buying one Engine tier moves Alleycat's speed stat bar by
  19 percentage points against Specter's 13, from the identical purchase.
  The full design is in
  [`docs/content-plan.md`](docs/content-plan.md#the-upgrades).
- **Cost scales off the car's own price** (or a reference value for the
  starter and story-exclusive cars), so maxing every system on a cheap car
  is a realistic goal and maxing every car is not — matching "you need a
  different car for this city."
- Upgrades belong to the car being *upgraded*, not necessarily the one
  selected to race: buying a tier only touches the shared physics state
  (`car.js`/`game.js`) immediately if you're upgrading the car you'd
  actually drive next.

**Phase 4 — rivals.** Quick Play's RACE now has three AI cars on the grid
([`src/rivals.js`](src/rivals.js)): VOLT, ONYX and SCARLET. They follow the
racing line at a pace worked out per track, swing out through corners like
they're drifting, pass each other on the roomier side, and bump you apart
sideways (never into a wall). A rival that falls far behind gets a little
help; one ahead of you never does. You see your place on screen, a
standings table at the end, and you're paid by finishing place. Measured:
a clean driver without boost finishes 2nd; with good boost use, 1st. The
details are in
[`docs/content-plan.md`](docs/content-plan.md#rivals).

**Phase 5 — story mode.** The STORY door opens a map of ten cities
([`src/story.js`](src/story.js)). Each city has 3-4 events: races against
its crew of three, Time Attacks (you alone against a target time), and a
boss race that stays locked until the rest of the city is cleared. Beat
the boss and the next city opens; six bosses hand over their own car
(five new boss-only cars plus Apex, 13 cars in all), the other four pay a
big cash prize. Every city has its own colours and a skyline or mountain
ridge on the horizon. Opponents get quicker and targets tighter city by
city; measured with a bot, a stock Nightrunner gets through about six
cities before it needs upgrades, and a maxed car wins everything. The
curve, payouts and boss cars are in
[`docs/content-plan.md`](docs/content-plan.md#the-cities).

To test it: open the game, tap STORY, tap PORTSIDE, then the first event.
Finish in the top 3 to clear it; clear the Time Attack; then FENDER's boss
race unlocks. Beat Fender and the Harbormaster is in your garage and
Sundown Strip is open on the map.

**Phase 6 — tutorial.** The TUTORIAL door is real
([`src/tutorial.js`](src/tutorial.js)). A coach rides along on Velocity
Ring at just over half race speed: it lights up the half of the screen to
press, says HOLD / EASE OFF / LET GO as you go, and grades each corner
(NICE!, RAN WIDE, CUT IN...). After three good corners it teaches boost.
It pays 150 CR the first time and then sends you to Story. Details in
[`docs/content-plan.md`](docs/content-plan.md#tutorial).

To test it: on the title, tap TUTORIAL twice. Do what the screen says.

**Phase 7 — new circuits.** Three new tracks in
[`src/road.js`](src/road.js): **Coastal Run** (all long sweepers),
**Underpass** (city blocks and a hairpin) and **The Circuit** (the finale,
a piece of every other track). Five story cities moved onto them. In Quick
Play the new tracks start locked, with a padlock and "REACH ... IN STORY",
and open as Story gets there. The track screen now fits six compact cards.

To test it: Quick Play → Race. The bottom three cards are locked on a new
save. Clear Portside and Sundown Strip in Story and Underpass opens.

## Current state, before career mode: Milestone 2.5

Four modes, picked from the screen the game opens on:

- **RACE** — three laps, results screen, best lap called out.
- **PRACTICE** — no clock. The ideal line painted on the road.
- **CHECKPOINT RUSH** — a clock that only runs down, gates that wind it back
  up, spike strips and potholes. Distance is the score.
- **DUEL** — two players, two laps each, pass the phone.

## Duel

Player one drives two laps. Every twelfth of a second their car is written
down — where it was, which way the body pointed, how sideways it was, and how
far round the lap it had got. Player two then drives the same two laps with
that recording alongside them as a translucent cyan car, and a gap in seconds.
Lowest total wins.

Two laps rather than three because the phone has to change hands: three each
on Grand Circuit would be four minutes of sitting and watching. Two on
Velocity Ring is under two minutes for both players.

**The gap is quoted in seconds, and that is why the arc length is recorded.**
"Two car lengths behind" means nothing on a circuit. Both cars pass through the
same points of road, so the honest question is who reached each point first —
and the recording is searched by position to answer it. The read-out also says
AHEAD or BEHIND in words, because a green or red number on its own is exactly
the sort of thing the brief says must never carry information by itself.

### Checked by driving it twice, identically

The only way to know a gap is measured rather than guessed is to race a run
against a copy of itself and see zero:

| | Result |
|---|---|
| Player one, driving the racing line | 54.78s, 658 samples recorded |
| Sample rate | 12.0 a second |
| Player two, driving **exactly** the same | 54.78s |
| **Worst gap over 3285 readings** | **0.000s** |

Then the same thing with player two driving down the middle of the road
instead: 51.85s against 54.78s, and the gap climbed steadily rather than
jumping about — which is what it should do when one driver is genuinely slower.

A ghost costs about 3,500 numbers for a two-lap run, so keeping one in memory
is not worth thinking about. It draws with the same 3D car model as the player,
handed a different palette and a lower alpha — a second copy of the mesh would
have been two models to keep in step. It gets a plain shadow and no neon glow
or exhaust flame, because it is not really there and should not light the road
it passes over.

## Previously: Milestone 2.4

Three modes now, picked from a screen the game opens on:

- **RACE** — three laps, results screen, best lap called out.
- **PRACTICE** — no clock. The ideal line painted on the road, with a read-out
  saying hold left, hold right, or release.
- **CHECKPOINT RUSH** — a clock that only runs down and gates that wind it back
  up. Distance is the score. Spike strips and potholes on the road.

## Checkpoint Rush

The clock starts at 25 seconds. Every gate adds time — more if you reached it
without a scratch — and the bonus shrinks each lap while the road gets busier,
so a run always ends. The question is only how far you got, which is why
**distance is the score**: it never falls, and it needs no explaining.

**Gates are a fixed distance apart, not a fixed count per lap.** A quarter of
Velocity Ring is six seconds and a quarter of Grand Circuit is ten, so counting
them per lap would have made the same clock generous on one circuit and brutal
on another. Spaced by distance and rounded to a whole number per lap, every
gate lands about six seconds from the last on all three — 4, 5 and 7 a lap —
and they still come back to the start line.

### The hazards, and the two rules they obey

- **Spike strip** — half speed for three seconds, with a countdown bar and the
  word SPIKED, because a car that goes slow for no visible reason reads as a
  bug rather than a punishment.
- **Pothole** — a jolt and a 12% speed loss, the same cost as a wall.

Both rules are non-negotiable, and both come from the brief's hardest line —
a crash must never feel unavoidable:

1. **A hazard never spans the road.** The widest takes 34% of the width, so
   there is always a line through. The worst one can do is take your line away,
   never your lap.
2. **A hazard never sits in a tight corner.** Nothing is placed anywhere
   tighter than a 900-unit radius, and never in a hairpin. On a hairpin you are
   already using all the road; something dropped in there is not difficulty, it
   is a coin toss.

Every one also carries a warning marker 820 units up the road, standing at the
hazard's own position across the tarmac — so it tells you which side to be on,
not just that something is coming. The marker's shape says which hazard it is,
so the two are never told apart by colour alone.

Hazard positions come from a hash of the lap number, so every run meets the
same hazards in the same places. That is what makes comparing two scores mean
anything.

### The bonus decays per GATE, not per lap

This is the same mistake as counting gates per lap, made a second time in a
different place, and the first measurement of all three circuits is what caught
it. A lap of Grand Circuit takes 60% longer than one of Velocity Ring, so a
bonus that faded per lap faded 60% more slowly there — and a run that lasted 98
seconds on the Ring ran to **154** on the Grand. Counting the decay in gates
passed instead makes every circuit decay at the same rate in the only currency
the mode actually has.

| Circuit | Was | Now | Distance | Gates | Laps |
|---|---|---|---|---|---|
| Velocity Ring | 98s | **77s** | 6496 m | 12 | 3 |
| Harbour Maze | 119s | **80s** | 7018 m | 13 | 2 |
| Grand Circuit | 154s | **87s** | 7354 m | 15 | 2 |

A 56-second spread became a 10-second one. Measured with the test driver
following the racing line, which is a better driver than a person will be, so
a real session should land under these. `RUSH_START` and `RUSH_BONUS_DROP` at
the top of [`src/game.js`](src/game.js) are the two dials if they want
shortening further.

## Previously: Milestone 2.3

**Modes.** The game now opens on a mode picker. Two so far:

- **RACE** — three laps, results screen, best lap called out. What was there before.
- **PRACTICE** — no clock pressure, no finish. The ideal line is painted on the
  road, with arrows crawling along it, and a read-out at the top telling you
  whether to be holding left, holding right, or off the controls entirely —
  plus how far off the line you currently are.

## The racing line

The line is built from anchors rather than solved for: run wide on the way in,
clip the inside at the apex, run wide again on the way out. A solver that
genuinely minimises cornering over a closed loop needs far more passes than a
lap this long can afford, and a line you can explain in one sentence is worth
more here than an optimal one nobody can reason about.

The one wrinkle is corners that arrive back to back. There is no room to run
wide between them and no driver would try — you cut straight from one apex to
the next — so a wide anchor is only placed where there is real straight to put
it on.

**Then it is made driveable, which is the part that matters.** Anchors say
where a good line wants to go; they know nothing about how hard the car can
turn, and swinging the full width of the road in the length of a corner entry
asks for a radius no car here can hold. The first version demanded radii of
83, 196 and 257 units on the three circuits — against a car that cannot turn
tighter than 504. So the line's own radius is measured, and wherever it is
tighter than 620 the line is eased: a point pulled toward the middle of its
neighbours where the offset is changing too fast, and moved away from the
centre of the turn where it is sitting at a constant offset on the inside of a
bend that is simply tight. Those are two different faults with two different
cures, and the second one is easy to miss — at a constant offset the first cure
does nothing at all, because the point is already exactly where the middle of
its neighbours is.

The correction is smoothed, not the line. Nudging single samples is itself a
kink, and blurring the whole line every pass would wash the apexes away over
hundreds of passes.

### Is it actually the fast way round?

Worth checking rather than assuming, so the test driver was pointed at it:

| Circuit | Down the middle | Following the line | Gain |
|---|---|---|---|
| Velocity Ring | 24.98s | **23.67s** | −1.31s (5.2%) |
| Harbour Maze | 32.02s | **29.98s** | −2.04s (6.4%) |
| Grand Circuit | 40.00s | **38.03s** | −1.97s (4.9%) |

Zero wall contacts either way, and the line-following driver held to within 8
to 10 units of the line all lap. So the line is not decoration: it is genuinely
the quick way round, and quick enough that mastering it beats the target time
each circuit was built around.

Two numbers in [`src/road.js`](src/road.js) shape the advice, and both come
straight out of the drift model rather than out of taste:

```js
var LINE_LEAD    = 280;   // start holding this far BEFORE the bend
var LINE_RELEASE = 240;   // and let go this far before it ends
```

The first exists because the slide takes time to build; the second because the
car carries on coming round after the body has squared up. They are the two
things the game is hardest to learn without being told, which is most of what
Practice is for.

## Previously: Milestone 2.2

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

## The keyboard that did not work in a frame

The keys were wired up correctly the whole time, and a test that loaded the
page directly passed. On a laptop, playing the published page, none of them
did anything.

The published game runs in an **iframe**, and keys only reach an iframe that
has focus. Clicking the game should hand it that focus — except `pointerdown`
calls `preventDefault()`, which is what stops a drag from selecting text and
a long press from popping up a menu, and it also suppresses the browser's
default focus change. So clicking the car never focused the frame, and every
arrow key and every space went to the page behind the game.

Reproduced by serving the game into a real iframe and checking
`document.activeElement` after a click: still `BODY`. The fix is to ask for
focus explicitly on pointerdown, and to give the canvas a `tabindex` so it can
take it. Now the frame has focus from the moment it loads, and the keyboard
works before any click at all.

### And a second one, found while testing the first

A quick tap of an arrow key on a menu did nothing. The road samples the keys
once a frame — right for a drift, where what matters is whether the key is
down *now* — but a menu sampled the same way misses any press that starts and
ends between two frames, which is what a quick tap is. Menu presses are now
counted as they arrive and read once, the way boost already worked.

This is the same shape of bug as the tap that would not start a race, below:
something that reads the state of an input, where it should be reading the
event.

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
index.html      the page: one canvas, the scripts below plus lib/three.min.js
docs/content-plan.md   the map for career mode: cars, upgrades, circuits, cities
src/save.js     the save file: currency, cars, upgrades, unlocks, best results
style.css       stops the page scrolling, zooming or selecting text
src/input.js    touch, mouse and keyboard  ->  one number: -1, 0 or +1
src/road.js     the track, and how the road is drawn
src/car.js      the drift physics and the car
src/cars.js     the 13 cars, their stats, and the upgrade maths
src/rivals.js   the AI cars: pace, lines, passing, bumping, standings
src/story.js    the ten cities, their events, colours, pay and unlocks
src/tutorial.js the tutorial coach: cues, corner grading, the boost lesson
src/car3d.js    the lit WebGL car in the Garage
src/ghost.js    records a run, and plays it back as a car that is not there
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
