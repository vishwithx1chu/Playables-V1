# Drift Run — The Circuit: content plan

This is the map every later phase gets built against — cars, upgrades,
circuits and cities — written down now so the numbers agree with each other
before any of them become code. It will change as we playtest; treat it as
the current best draft, not a locked spec.

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

Three hull archetypes (built once each in Phase 1, then reused with
different proportions, colours and stats for all eight cars — see the
[README](../README.md) for how the current car's mesh is actually built):

- **Compact** — short, tall greenhouse, tightest turning circle, lowest top
  speed. The technical-track specialist.
- **Sport** — the proportions the game already has. The all-rounder.
- **Muscle** — long, low, wide. Highest top speed, widest turning circle.
  The straight-line specialist.

| Car | Archetype | Personality | Cost | Notes |
|---|---|---|---|---|
| **Nightrunner** | Sport | The one you already have | — | Starter car, owned from the first launch |
| **Alleycat** | Compact | Cheap, tight, forgiving | 500 | First city's easy unlock |
| **Vantage** | Sport | A faster Nightrunner | 900 | The first real upgrade-or-replace choice |
| **Ecliptic** | Compact | Boost-hungry | 1200 | Fills NOS faster, best synergy with NOS upgrades |
| **Warbird** | Muscle | Fast, clumsy until tamed | 1400 | Needs Tyres before it's not a liability in corners |
| **Ironclad** | Muscle | The tank | 1800 | Best base grip of the Muscle line; forgives contact |
| **Specter** | Sport | Glass cannon | 2200 | Widest drift angle, twitchiest to catch |
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
