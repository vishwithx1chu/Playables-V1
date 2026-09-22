# Drift Run — The Circuit: content plan

This is the map every later phase gets built against — cars, upgrades,
circuits and cities — written down now so the numbers agree with each other
before any of them become code. It will change as we playtest; treat it as
the current best draft, not a locked spec.

## Development roadmap

Each phase is built, tested and shown before the next one starts. Terrain
was inserted after Garage and before Currency: both AI opponents (which
follow the racing line) and the real city circuits get built against
whatever track model exists, so hills and banking need to exist before
either of those, not be retrofitted after.

| Phase | What it is | Status |
|---|---|---|
| 0 | Foundations — the save file, the Title screen | Done |
| 1 | Garage — 8 cars, real stats, colours, a real WebGL preview | Done |
| 3 | Currency & upgrades | **Current** |
| 2 | Terrain — hills and banking, visual first | Planned |
| 4 | AI opponents | Planned |
| 5 | Story structure — cities, gating, boss races | Planned |
| 6 | Narrative & difficulty tuning | Planned |
| 7 | Quick Play & flow polish | Planned |
| 8 | Tutorial overhaul — its home on the Title screen exists since Phase 1 | Planned |

Currency & upgrades moved ahead of Terrain: it builds entirely on the
Garage and save.js's existing (until now unused) currency/upgrade
functions, needs none of Terrain's track-model work, and is the more
direct answer to the original "15-20 minute engagement" problem this whole
plan exists to solve. Terrain still comes before AI opponents and the real
city circuits, for the reason originally given — both get built against
whatever track model exists.

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
colour and (per Stage 1's WebGL work) its own silhouette. Not built yet:
these five don't have stats or a boss fight to award them in until Phase 5
gives the game actual city races to win them from.

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
| **D** | *New* — "Coastal Run" | Long cliffside curves, closer in character to B |
| **E** | *New* — "Underpass" | Tight, urban, closer in character to A |
| **F** | *New* — "The Circuit" (finale only) | One lap built from motifs of every city before it |

## The cities

Each city runs 3-4 races: 1-2 AI races, 1-2 Time Attacks (Rush's engine —
clock, gates, hazards — aimed at a target time instead of survival), and one
boss race to open the next city.

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

"Recommended spec" is guidance shown on the city map, not a hard lock —
exact thresholds get tuned once AI opponents exist and we can actually
measure a city's real difficulty (Phase 5), rather than guessed here.

## Currency, implemented in Quick Play

AI races and boss races don't exist yet (Phase 4/5), so Quick Play — the
only place currency can be earned today — pays out on a graded curve
instead of the flat numbers first guessed here: better than the track's
target time (or, for Rush, more distance) pays more, but a rough run is
never worth zero, so a bad attempt still funds the next one.

| Mode | Formula | Floor | Ceiling |
|---|---|---|---|
| Lap race | 80 × (target time ÷ your total) | 40 | 130 |
| Duel | 70 × (target time ÷ winner's total) | 35 | 110 |
| Rush | 0.6 × distance (m) | 30 | 150 |

"Target time" is each track's existing `targetSecs`, scaled to the mode's
lap count. Once AI races and boss races exist (Phase 4/5), those get their
own payout — likely close to the 80-120 / 250-400 first guessed here — and
this table gets a row added, not replaced.

| Purchase | Cost |
|---|---|
| Upgrade tier | 22% / 30% / 40% of the car's price, per tier (see above) |
| A new car | 500-2200, per the roster table above |

First real numbers, expect these to move once Phase 5 makes a city's real
difficulty measurable instead of guessed.
