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
| 8 | **Terrain** — hills and banking, visual only | Done |
| 9 | Balance & polish — difficulty measured per city with bots, payout tuning | Next |

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

- **Skill** is one number. 1.0 laps in the track's target time before
  boost and slipstream; 0.9 is ten percent slower. Measured: a skill-1.0
  rival alone on Velocity Ring laps 23.97s against 25s, the difference
  being its own boost.
- **Boost.** Each rival fills a meter (faster in corners) and fires it on
  a straight: peak 1.30x, the same shape as yours, with the same flame.
  About one boost every 8-12 seconds.
- **Slipstream, for everyone.** A car tucked in 40-460 units behind
  another, within 70 across, is pulled along up to 6% faster. It shows as
  SLIPSTREAM under your position. A rival you've just passed can hang on
  and come back; you can do the same to them.
- **Comeback pace, one way only.** A rival more than 600 behind you drives
  up to 8% harder until it's back in the fight. A rival ahead of you never
  gets help, so beating one means actually being faster.
- **Mistakes and defending.** Now and then (30% of laps; bosses 15%) a
  rival runs wide for a moment. A rival with you right on its bumper moves
  across to cover you (bosses harder).
- **Contact is solid.** Cars are boxes; an overlap is pushed out along
  whichever way is shallower. Side by side, both get shoved apart and
  knocked off line (and a car pinned against the barrier scrapes it).
  Nose to tail, the car behind stops against the one in front and drops
  to its speed: you can't drive through a car. A fast hit on a car's back
  corner spins it out (TAKEDOWN!), and a rival can do the same to you
  (KNOCKED).

**Quick Play race:** three rivals, skill 0.90 / 0.95 / 1.00. Measured with
an overtaking bot on a stock Nightrunner, using boost: 2nd, 2nd and 3rd
on the three original tracks, with up to 18 changes of position in a race.
Pay by finishing place: 120 / 90 / 70 / 50.

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

## Terrain

Hills and banking (`prepareTerrain` in `src/road.js`), and they are only a
picture: physics, walls, rivals and every rule still run on a flat plane.
Once a frame, the game builds a table of how high the ground is at each
distance ahead of the camera, and everything drawn is lifted by it. So the
road, walls, chevrons, skid marks, rivals and the car all ride the same
hill.

- **Hills**: two gentle swells per lap, the same every lap. Each track has
  its own size (Coastal Run the biggest, Underpass the flattest) and each
  city scales it (High Pass 1.5x, Neon Downtown and The Underpass 0.4x).
  The camera partly tips with the slope it's on, and the road rises at
  most 150 units or drops at most 120 relative to the car.
- **Banking**: in a bend the outside edge rides up, up to a slope of
  0.12. It's full near the car and fades out by the middle distance.
- **Fairness, tested on all six tracks**: the road ahead always sits
  higher on screen the further away it is, so a crest can never hide the
  road behind it (worst case in the tests: under 0.2px). The car never
  moves on screen (0.00px): the picture moves round it instead. The
  terrain fades back to flat at the far end of the view, so the road
  meets the fog at the horizon exactly where it did on the flat. Lookahead
  distance is unchanged on every screen shape.
- Cost: about 0.04ms a frame.

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

**The difficulty curve (`BOSS_SKILL` in `src/story.js`).** A table, one
boss skill per city: 0.93, 0.99, 1.05, 1.08, 1.11, 1.14, 1.16, 1.175,
1.18, 1.16 (the finale track is long and hard, so its number is lower). The
crew's middle car is 0.08 below the boss, and a Time Attack target is the
track's target lap x 0.98 / (boss skill - 0.05).

Rewritten after playtesting found a stock car could clear the story up to
city 7 without an upgrade. Measured with a racing bot that overtakes and
boosts on straights:

| Car | Beats the bosses of |
|---|---|
| Stock Nightrunner | Cities 1-2 (city 3 lost by 7s) |
| Nightrunner, all upgrades tier 1 | Cities 1-2 (city 3 lost by 1s) |
| Nightrunner, all tier 2 | Cities 1-5 |
| Nightrunner, all tier 3 | Cities 1-7 and 9; loses 8 by 0.2s and 10 by 1.4s |
| Warbird or Undertow, all tier 3 | All ten (the finale by 0.7s / 1.2s) |

Boss races end within a couple of seconds either way, because rivals
fight back (boost, slipstream, comeback pace). The bot is a clean driver
but not a perfect one, and a person who uses slipstream well will do
better.

**Why upgrades and better cars matter now.** Measured on Grand Circuit
(3 laps, bot, boost): a fully upgraded Nightrunner is 26% faster than
stock. Engine alone gives up to 18%, but it hits the walls without Tyres
and Transmission to handle the speed. Upgrades now close less of the gap
to the shared ceiling (tier 3 closes 62%, down from 75%), so a better car
stays better once both are maxed. That's what wins the finale.

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
