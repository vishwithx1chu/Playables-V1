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
| 1 | Garage — 8 cars, real stats, colours | **Current** |
| 2 | Terrain — hills and banking, visual first | Planned |
| 3 | Currency & upgrades | Planned |
| 4 | AI opponents | Planned |
| 5 | Story structure — cities, gating, boss races | Planned |
| 6 | Narrative & difficulty tuning | Planned |
| 7 | Quick Play & flow polish | Planned |
| 8 | Tutorial overhaul — its home on the Title screen exists since Phase 1 | Planned |

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

Every car can be recoloured for free once owned (Phase 1). Upgrades belong to
the car, not the account (see below) — switching cars means starting that
car's upgrade tree over, which is what makes "you need a different car for
this city" a real sentence instead of a suggestion.

## The upgrades

Four systems, three purchasable tiers each (tier 0 is stock). Each tier's
cost is roughly 15-25% of the car's own price, rising per tier.

| System | What it touches | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| **Tyres** | `MIN_RADIUS` (tighter turning circle) | −5% | −10% | −15% |
| **Engine** | `BASE_SPEED` | +4% | +8% | +12% |
| **Transmission** (incl. steering) | `BUILD_TAU` / `DECAY_TAU` / `REVERSE_TAU` (how fast the car answers a hold, a release, a reversal) | −8% | −15% | −22% |
| **NOS** | boost peak and hold duration | +3% / +10% | +6% / +20% | +10% / +30% |

These map directly onto constants that already exist in `car.js` and
`game.js` — nothing here invents new physics, it scales what's already
tuned and measured.

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

| # | City | Kit | Theme | Boss | Recommended spec |
|---|---|---|---|---|---|
| 1 | Portside | A | Foggy harbour, industrial night | Fender | Starter car is enough |
| 2 | Sundown Strip | B | Desert dusk, orange horizon | Mirage | Alleycat or Tyres T1 |
| 3 | Old Quarter | E | Cobbled downtown, sodium-lamp warmth | Cutlass | A Compact car, or Tyres T2 |
| 4 | Coastal Run | D | Cliffside ocean night, cool blues | Riptide | Engine T1 |
| 5 | Steel District | C | Industrial, sparks and steam | Foundry | Transmission T1-2 |
| 6 | Neon Downtown | A (harder) | Dense skyscraper neon canyon | Vertex | A Muscle car, or Tyres T2-3 |
| 7 | High Pass | B (harder) | Mountain dusk, thin cold fog | Glacier | Engine T2, a Muscle car |
| 8 | The Underpass | E (harder) | Wet-road night, reflections | Undertow | Transmission T2-3 |
| 9 | Skyline Ave | D (harder) | Bridge crossing, tallest skyline | Halo | NOS T2-3, Ironclad or Warbird |
| 10 | The Circuit | F | Every theme, mixed | **Apex** | Best available car and upgrades |

"Recommended spec" is guidance shown on the city map, not a hard lock —
exact thresholds get tuned once AI opponents exist and we can actually
measure a city's real difficulty (Phase 5), rather than guessed here.

## Currency, as a starting point

| Race type | Payout |
|---|---|
| AI race | 80-120 |
| Time Attack | 60-100 |
| Boss race | 250-400 |

| Purchase | Cost |
|---|---|
| Upgrade tier | 150-300, rising per tier and per car price |
| A new car | 600-1000, rising up to Specter |

Roughly 2-4 replays per upgrade, 6-10 per new car. First real numbers, to be
adjusted once Phase 2 makes them play out for real.
