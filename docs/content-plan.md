# Drift Run — The Circuit: content plan

This is the map every later phase gets built against — cars, upgrades,
circuits and cities — written down now so the numbers agree with each other
before any of them become code. It will change as we playtest; treat it as
the current best draft, not a locked spec.

## Development roadmap

Rewritten after the first three phases shipped, because the scope grew a
lot along the way: a real WebGL garage preview, boss-car rewards for six
of the ten cities, a distinct look per city, a tutorial with its own door,
and hills and banking on the tracks. The old order was written before any
of that existed.

| Phase | What it is | Status |
|---|---|---|
| 1 | Foundations — the save file, the Title screen | Done |
| 2 | Garage — 8 cars, real stats, colours, a WebGL preview | Done |
| 3 | Currency & upgrades — Quick Play payouts, 4 upgrade systems | Done |
| 4 | **Rivals** — AI cars on track, race position, bumping, pay by finishing place | Done |
| 5 | **Story mode** — 10 cities, their events, unlocks, boss races, boss-car rewards, and a distinct look for every city | Done |
| 6 | **Tutorial** — a guided run that shows which side to press, how long to hold, and when to let go | Done |
| 7 | **New circuits** — Coastal Run, Underpass and the finale lap | Done |
| 8 | **Terrain** — hills and banking, visual only | Next |
| 9 | Balance & polish — difficulty measured per city with bots, payout tuning | Planned |

**Why this order.**

- **Rivals come first** because Story mode is mostly races against other
  cars, and boss races are a rival with a name. Nothing in Story can be
  built until there is something on the road to race.
- **City looks are part of Story mode, not their own phase.** A city's
  look is a colour set for the sky, sun, ground and neon, which is small
  work on its own and only matters once cities exist.
- **Tutorial after Story**, because the tutorial is the front door to Story
  mode. A new player's path is Tutorial, then City 1.
- **New circuits after Story.** Every city can run on one of the three
  existing tracks, recoloured, from day one; new layouts swap in later
  without changing how any city is built.
- **Terrain late, and visual only.** Hills that change the physics or hide
  the road ahead would break the "a crash must never feel unfair" rule.
  Kept as a pure visual layer, it can't break anything that has already
  shipped, so there's no reason to hold other phases for it.

## Rivals

Rival cars (`src/rivals.js`) don't run the player's drift physics. They
follow the racing line (the same one Practice paints) at a speed worked out
for each track in advance, and their bodies swing out through corners by
the angle a real car would need there, so they look like they're drifting.
They can't spin, crash or get stuck, which makes them predictable in a
useful way: you can learn where a rival is quick and where it isn't.

- **Skill** is one number. 1.0 laps in exactly the track's target time
  (the one on the track card); 0.9 is ten percent slower. Measured, not
  just claimed: a skill-1.0 rival lapped Velocity Ring in 24.8–25.3s
  against a 25s target, and a skill-0.9 rival 27.5s against 27.8s
  expected. The small spread is deliberate: each lap gets a ±1.5% wobble,
  so the running order can shift.
- **Speed profile**: faster on straights, easing off before corners, and a
  short burst out of each corner (with a visible exhaust flame). It's
  scaled so the average over the lap lands exactly on the target.
- **Traffic**: a rival that comes up behind a car goes round it on
  whichever side has more room. Rivals never overlap each other; bumping
  the player pushes both cars apart sideways and slows whoever ran into
  the back of the other a little. A bump never pushes you into the wall.
- **Catch-up, one direction only**: a rival more than about 1,400 units
  behind you gets up to 4% extra pace, so races don't turn empty. A rival
  ahead of you never gets help, so beating one always means actually
  being faster than it.

**Quick Play race:** three rivals, skill 0.86 / 0.91 / 0.96. Measured
with the racing-line bot on a stock Nightrunner: without using boost it
finishes 2nd on every track; using boost well, it wins every one. So a
new player can beat the slowest rival and a good one can win. Pay by
finishing place: 120 / 90 / 70 / 50.

## Tutorial

A coach riding along (`src/tutorial.js`), not a screen of instructions. It
runs on Velocity Ring at 55% of race speed, with the racing line painted.

- **Lesson 1, corners.** The half of the screen to press lights up with a
  thumb (or an arrow key, if you've been using the keyboard) and the words
  HOLD LEFT / HOLD RIGHT. Mid-corner it says EASE OFF when you're turning
  too tight, and LET GO once the road straightens. A bar shows how much of
  the corner is left. Nail three corners to move on.
- **Lesson 2, boost.** The meter is filled for you; a ring and an arrow
  point at the BOOST button, and it says WAIT FOR A STRAIGHT until there
  is one. Then it shows a drift filling the meter back up.
- **Grading is on the result**, not the exact rhythm of your thumb: a
  corner passes if you held the right side, didn't touch a wall, and
  stayed near the line. Otherwise it says which mistake it was: MISSED
  THAT ONE, OTHER SIDE, RAN WIDE, CUT IN, or ALMOST (a scrape on an
  otherwise good corner). A wall hit is judged the moment it happens.
- **The cues come from a driver that is known to get round cleanly**: the
  same look-ahead the test bots use, smoothed so the words change at a
  human pace (about 2-3 changes a second, never a flash).
- **You can't get stuck.** If a spin leaves you facing the wrong way, the
  car is put back on the road pointing forward and the coach says BACK ON
  TRACK.
- **Pays 150 CR the first time**, once. Finishing sends you to Story.
  Until you've done it, the title screen's TUTORIAL row reads "NEW? START
  HERE".

**Why 55% speed, and why holding solid is wrong.** The first version told
you to hold for the whole of the racing line's corner zone. A bot doing
exactly that crashed constantly: on long sweepers, holding flat out turns
too hard. Good drivers hold and ease off. A simulated player who does what
the screen says, 0.2-0.3s late, crashed at full race speed but finishes in
30-55 seconds at 55%, in every car tried (Nightrunner, Alleycat, Warbird,
Ironclad, Specter).

## The story

**You start with nothing but a car and a reputation to make.** The Circuit
is an underground night-racing league that runs across ten cities. Each city
is run by a boss — a name, a car, a signature line through their home track —
and the only way through is to out-drive their crew, then beat them
outright. Win, and the city opens the way to the next. Lose enough races and
you're just out a night's earnings; there's always another shot.

The championship ends in **The Circuit** itself — a finale lap built from
pieces of every city before it — against **Apex**, the racer everyone else
in the league measures themselves against. Beating Apex doesn't just end the
game: it's the only way to unlock Apex's own car, which is never for sale.

That's the whole story — enough to give ten cities and ten bosses a reason to
exist, without a wall of text between the player and the wheel.

## The cars

Three hull archetypes, built once each (`src/car.js`) and reused with
different hand-tuned proportions, colours and stats for all eight cars. Each
archetype scales the SAME topology on four independent axes — length, width,
height, and an extra boost just for the greenhouse's height — rather than
uniformly stretching one shape, which is what lets "short with a tall cabin"
and "long and low" both come out of one mesh:

- **Compact** — short, tall greenhouse, tightest turning circle, lowest top
  speed. The technical-track specialist.
- **Sport** — the proportions the game already had. The all-rounder.
- **Muscle** — long, low, wide. Highest top speed, widest turning circle.
  The straight-line specialist.

Every stat below is a multiplier on Nightrunner's numbers (1.00 across the
board) — see `src/cars.js`. Measured, not just claimed: on Velocity Ring's
long straights, Warbird's first lap beat Nightrunner's despite a wider
turning circle (22.85s vs 25.92s, min radius 564 vs 504) — exactly the "fast,
clumsy until tamed" it's meant to be.

| Car | Archetype | Personality | Cost | Speed | Grip | Handling | Boost |
|---|---|---|---|---|---|---|---|
| **Nightrunner** | Sport | The one you already have | — (starter) | 1.00 | 1.00 | 1.00 | 1.00 |
| **Alleycat** | Compact | Cheap, tight, forgiving | 500 | 0.92 | 0.90 | 1.00 | 1.00 |
| **Vantage** | Sport | A faster Nightrunner | 900 | 1.06 | 1.00 | 0.95 | 1.00 |
| **Ecliptic** | Compact | Boost-hungry | 1200 | 0.95 | 0.93 | 1.00 | 1.15 / 1.25 hold |
| **Warbird** | Muscle | Fast, clumsy until tamed | 1400 | 1.14 | 1.12 | 1.08 | 1.00 |
| **Ironclad** | Muscle | The tank | 1800 | 1.10 | 1.05 | 1.00 | 1.00 |
| **Specter** | Sport | Glass cannon | 2200 | 1.04 | 1.00 | 0.85 | 1.00 |

Grip and Handling are lower-is-better (a smaller turning circle, a snappier
response), which the garage's stat bars invert so every bar simply reads
"more filled is better."
| **Apex** | Sport/Muscle hybrid | The best all-round spec in the game | *story reward only* | Never for sale — beating the final boss is the only way in |

Every car can be recoloured for free once owned (Phase 1), previewed as a
real lit 3D model in the Garage (`src/car3d.js`, a WebGL layer over the
2D game — the car you actually drive is untouched). Upgrades belong to
the car, not the account (see below) — switching cars means starting that
car's upgrade tree over, which is what makes "you need a different car for
this city" a real sentence instead of a suggestion.

**Boss cars.** Six of the ten city bosses hand you their own car when you
beat them; the other four pay a large currency bonus instead of a car —
see the cities table below for which is which. The split isn't arbitrary:
the four cash cities are exactly the ones that already recommend buying a
*specific* purchasable car (Alleycat, a Compact, a Muscle car, Ironclad/
Warbird) — cash lets you afford the car the city is already pointing you
toward, rather than handing you a second, redundant one. The six car
cities only ever recommend a generic upgrade tier, so a new car is the
more interesting reward there. This adds five new boss-exclusive cars
(Fender's, Riptide's, Foundry's, Glacier's, Undertow's) on top of Apex,
bringing the eventual full roster to 13 — cheap to add, since each one
reuses one of the three archetypes and just needs its own stats, blurb,
colour and (per Stage 1's WebGL work) its own silhouette. All six are built
(Phase 5). You can't buy them: the garage shows the boss to beat instead of
a price.

| Car | Archetype | From | Speed | Grip | Handling | Boost peak / hold |
|---|---|---|---|---|---|---|
| **Harbormaster** | Sport | Fender, Portside | 1.04 | 0.96 | 0.95 | 1.05 / 1.10 |
| **Riptide** | Sport | Riptide, Coastal Run | 1.09 | 0.97 | 0.92 | 1.08 / 1.15 |
| **Foundry** | Muscle | Foundry, Steel District | 1.17 | 1.05 | 1.00 | 1.00 / 1.10 |
| **Glacier** | Compact | Glacier, High Pass | 1.07 | 0.84 | 0.90 | 1.10 / 1.15 |
| **Undertow** | Sport | Undertow, The Underpass | 1.13 | 0.93 | 0.86 | 1.12 / 1.20 |
| **Apex** | Sport | Apex, The Circuit | 1.16 | 0.88 | 0.85 | 1.20 / 1.20 |

Each boss races in the car they hand over, so you've already seen what it
can do before you get it.

## The upgrades

Four systems, three purchasable tiers each (tier 0 is stock), implemented in
`src/cars.js`. Every car is upgradable to the same max tier on every system.

| System | What it touches |
|---|---|
| **Tyres** | `MIN_RADIUS` (tighter turning circle) — grip |
| **Engine** | `BASE_SPEED` — speed |
| **Transmission** (incl. steering) | `BUILD_TAU` / `DECAY_TAU` / `REVERSE_TAU` — handling |
| **NOS** | boost peak and hold duration |

**Convergence, not a flat percentage.** An early draft gave every car the
same +X% per tier, but that preserves the exact ratio between cars forever
— equal treatment, not what "some difference between cars, but not too
much once maxed" actually asks for. Instead, each tier closes part of the
gap between a car's own stock value and a fixed cap shared by every car on
that stat (speed 1.30, grip 0.75, handling 0.68, boost peak/hold 1.35 —
all at or beyond today's best roster value, so an upgrade never makes a
car worse). The fraction of that gap closed per tier is 30% / 55% / 75% —
never reaching 100%, so a real gap, just a smaller one, still exists at
tier 3. A car that starts further behind gains more per tier in absolute
terms than one that starts close to the cap already, which is what lets a
cheap car's full upgrade tree meaningfully close the distance to an
expensive one without erasing the reason to want the expensive one too.

**Cost** scales off the car's own price (or a reference value for the
starter and story-exclusive cars): tier 1/2/3 cost 22%/30%/40% of that
price, incremental per tier. Maxing all four systems on a 500cr car costs
roughly 1,840cr total; on a 2,200cr car, roughly 8,100cr — matching "you
need a different car for this city," since fully upgrading a cheap car is
realistic, fully upgrading every car is not.

## The circuits

Five "kits" (distinct corner layouts), each reused by two cities with a
different environment, hazard density and AI difficulty — plus one unique
finale layout. This is the single biggest lever on how much content this
plan actually costs to build: 6 layouts total, not 30.

| Kit | Based on | Character |
|---|---|---|
| **A** | Harbour Maze (exists) | Technical, barely a straight on it |
| **B** | Velocity Ring (exists) | Fast, flowing, long sweepers |
| **C** | Grand Circuit (exists) | Balanced — hairpin, esses, four big corners |
| **D** | Coastal Run (Phase 7) | All sweepers, no hairpin: 11 corners, 64% of the lap turning, 30s |
| **E** | Underpass (Phase 7) | City blocks: 90-degree corners, a chicane and a 170-degree hairpin, 30s |
| **F** | The Circuit (Phase 7) | A piece of every circuit in story order: ring sweeper, maze esses, the hairpin, cliff curves, city blocks, 45s |

The three new circuits follow the same rules as the first three (no corner
tighter than the car can hold, a lap that closes, a length set by its target
time), and the test suite checks all six. The rivals needed no retuning:
skill 1.0 lapped each new track within 1% of its target time.

**In Quick Play**, the first three circuits are always open. Each new one
opens once Story reaches the first city that races on it (Underpass with
Old Quarter, Coastal Run with Coastal Run, The Circuit with the finale).
Until then its card is shown with a padlock and says which city opens it.

## The cities

Each city runs 3-4 events: 1-2 races against the city's crew of three,
1-2 Time Attacks, and one boss race. A Time Attack is you alone on the
city's track, 2 or 3 laps, against a target time (simpler than the Rush
engine first planned here, and it teaches the lines the boss will use).
The boss stays locked until every other event in the city is cleared;
beating the boss opens the next city. Every city has its own colours:
sky, sun, ground, neon, walls, fog, and a skyline or mountain ridge on
the horizon (`THEMES` in `src/story.js`).

Old Quarter and The Underpass race on Underpass, Coastal Run and Skyline
Ave on Coastal Run, and The Circuit on its own finale lap. Re-measured with
the bot after the move: the curve kept its shape (a stock Nightrunner still
beats the bosses of cities 1-6 and loses 7-10; maxed cars win all ten).

| # | City | Kit | Theme | Boss | Recommended spec | Reward |
|---|---|---|---|---|---|---|
| 1 | Portside | A | Foggy harbour, industrial night | Fender | Starter car is enough | Fender's car |
| 2 | Sundown Strip | B | Desert dusk, orange horizon | Mirage | Alleycat or Tyres T1 | Cash |
| 3 | Old Quarter | E | Cobbled downtown, sodium-lamp warmth | Cutlass | A Compact car, or Tyres T2 | Cash |
| 4 | Coastal Run | D | Cliffside ocean night, cool blues | Riptide | Engine T1 | Riptide's car |
| 5 | Steel District | C | Industrial, sparks and steam | Foundry | Transmission T1-2 | Foundry's car |
| 6 | Neon Downtown | A (harder) | Dense skyscraper neon canyon | Vertex | A Muscle car, or Tyres T2-3 | Cash |
| 7 | High Pass | B (harder) | Mountain dusk, thin cold fog | Glacier | Engine T2, a Muscle car | Glacier's car |
| 8 | The Underpass | E (harder) | Wet-road night, reflections | Undertow | Transmission T2-3 | Undertow's car |
| 9 | Skyline Ave | D (harder) | Bridge crossing, tallest skyline | Halo | NOS T2-3, Ironclad or Warbird | Cash |
| 10 | The Circuit | F | Every theme, mixed | **Apex** | Best available car and upgrades | Apex's car |

"Recommended spec" is guidance shown on the city screen, not a hard lock.

**The difficulty curve (Phase 5, `curve` in `src/story.js`).** For city
number d (0-9): the crew's middle car has skill 0.80 + 0.028·d, the boss
0.88 + 0.03·d, and a Time Attack target is the track's target time ×
(1.17 − 0.028·d), 1% tighter again over 3 laps. Measured with the
racing-line bot, boosting on straights:

- **Stock Nightrunner** (no upgrades): beats the bosses of cities 1-6, by
  13.7s down to 0.2s; loses cities 7-10. Passes Time Attacks through city
  8. So the back half of the story needs a better car or upgrades, which
  is the point.
- **Maxed Nightrunner or maxed Warbird**: wins everything, beating Apex by
  7.2s / 9.7s. Nothing in the story needs a specific car.

The bot is a clean driver, not a perfect one; a human still drifts,
hits walls and misses boosts, so these margins are an upper bound.

## Currency

Quick Play pays on a graded curve: better than the track's target time (or,
for Rush, more distance) pays more, but a rough run is never worth zero, so
a bad attempt still funds the next one. A race against rivals pays by
finishing place instead.

| Mode | Formula | Floor | Ceiling |
|---|---|---|---|
| Race vs rivals | 120 / 90 / 70 / 50 by place | 50 | 120 |
| Lap race, solo | 80 × (target time ÷ your total) | 40 | 130 |
| Duel | 70 × (target time ÷ winner's total) | 35 | 110 |
| Rush | 0.6 × distance (m) | 30 | 150 |

Story pays more, and more in later cities (d = city number, 0-9):

| Story event | Pays |
|---|---|
| Race | (60 + 12·d) × 1 / 0.75 / 0.55 / 0.4 by place, +50% the first time you clear it |
| Time Attack | 50 + 10·d if you beat the target (+50% the first time), 30% of that if you miss |
| Boss, car city | The car + (100 + 15·d) |
| Boss, cash city | 300 + 45·d |
| Boss, replayed | 90 + 15·d |
| Boss, lost | 30 + 5·d |

"Target time" is each track's existing `targetSecs`, scaled to the lap
count.

| Purchase | Cost |
|---|---|
| Upgrade tier | 22% / 30% / 40% of the car's price, per tier (see above) |
| A new car | 500-2200, per the roster table above |

Probably too generous: first-clear payouts alone add up to about 2,700 CR
by the end of city 5 (7,000 over the whole story), more than the roughly
2,200 CR it costs to max every system on a Nightrunner. To be checked with
real play in Phase 9.
