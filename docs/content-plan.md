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
| 9 | Balance & polish — car rating, what each city needs, payout tuning, START OVER | Done |

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
- **Contact is solid, and it cuts both ways.** Cars are boxes; an
  overlap is pushed out along whichever way is shallower. You can't drive
  through a car: run into its back and you stop against it. But the car
  in front doesn't shrug it off either: its tail is knocked sideways away
  from the side you hit, it fishtails, loses a little speed and stops
  defending while it's shaken (about a second). Side by side, both get
  shoved apart, and a car pinned against the barrier scrapes it. A fast
  hit on a car's back corner spins it out (TAKEDOWN!), and a rival can do
  the same to you (KNOCKED).
- **How hard you hit.** Impact power is 1 for a plain bump, plus up to 0.9
  on boost and up to 1.2 while drifting (your whole car is swinging
  sideways into them, and that sideways speed adds to the shove).
  Measured: a rear hit on boost throws the car ahead about 3x as far as a
  plain bump, costs you one small speed loss instead of being held to its
  pace, and you get through. A drift into a rival shoves it about 2.7x as
  hard as a rub (SHUNT!). Drifting and boosting together can spin it.

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

## The story: Kai's Last Race

**A new career, and a revenge story.** Kai, your older brother, was the
fastest driver the Circuit had ever seen. The night he raced Apex for the
championship, his steering locked on the final corner and he never came
home. The league called it an accident. You find his car in a scrapyard
with the steering cut on purpose, rebuild it (the Nightrunner, the car
you start with, was Kai's), and set out to race your way to Apex and
prove what happened.

Written for a general 13+ audience: what happened to Kai is said plainly
but never shown. The story is told in short cards (`drawScene` in
`src/game.js`, text in `src/story.js`), one line per tap, always
skippable, drawn over the city it happens in.

**When the cards play**
- Going into Story for the first time: the prologue ("A NEW CAREER").
- Entering a city for the first time: its arrival (who runs it, and a line
  from its boss).
- Beating a boss for the first time: what they tell you, then the map
  with the next city open.
- STORY SO FAR on the map replays everything you've seen, in order.

**The trail, city by city**

| City | What you learn |
|---|---|
| Portside | Kai's car went through the docks for a refit; a mechanic called Wrench did it, paid in cash |
| Sundown Strip | Wrench was flashing cash, headed for the Old Quarter |
| Old Quarter | A ledger: steering parts for Kai's car, paid by APEX RACING |
| Coastal Run | Kai was the only driver Apex feared |
| Steel District | Apex hired Wrench after the final and hid him in the Underpass |
| Neon Downtown | The race footage was wiped on the champion's orders, but Vertex kept a copy showing someone at Kai's car |
| High Pass | Glacier, the race marshal, saw Wrench at Kai's car and will say so on the record |
| The Underpass | Wrench confesses: Apex ordered it. He'll testify if Apex loses in front of everyone |
| Skyline Ave | Win the final and the evidence goes up on every screen |
| The Circuit | You win; the evidence plays; Apex is arrested; Kai's name goes back to the top. THE END |

**The map.** A drawn map, not a list: the ten cities on a dark sheet with
a coastline and mountains, joined in order by the road between them.
Driven stretches glow, locked ones are dashed; locked cities show a
padlock, beaten ones a tick, and YOU marks where you are. Tap a city to
see it underneath (boss, progress, prize, rating needed), tap again or
ENTER CITY to go in. Arrow keys and space work too.

**The city view.** The city's own circuit drawn large in its colours,
with a pin at each event's named place (THE DOCKS, CRANE ROAD, FENDER'S
YARD...): a flag for a race, a stopwatch for a time attack, a crown for
the boss. Tap a pin to see what it asks and pays; tap again or START.

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

**Car rating.** One number for how fast a car really is (`rating` in
`src/cars.js`): 100 is a stock Nightrunner, 120 laps about 20% quicker.
Fitted to measured laps (the racing bot, boosting, all three original
tracks) across every car at several upgrade levels; it predicts all of
them to within 2%. Speed is most of it, but speed the car can't handle is
wasted: past what the Tyres and Transmission can hold, extra Engine counts
for much less. So Tyres and Transmission show "HANDLING" in the Garage
until there's speed for them to unlock, then a rating gain. Every upgrade
button shows what it adds.

| Car | Stock | Tier 1 | Tier 2 | Tier 3 | Cost to max |
|---|---|---|---|---|---|
| Nightrunner | 100 | 109 | 116 | 122 | 1,824 |
| Warbird | 106 | 114 | 120 | 126 | 4,256 |
| Foundry (boss) | 112 | 118 | 123 | 128 | 5,776 |
| Undertow (boss) | 115 | 120 | 124 | 127 | 7,296 |
| Apex (boss) | 119 | 123 | 126 | 129 | 9,120 |

**Convergence, not a flat percentage.** An early draft gave every car the
same +X% per tier, but that preserves the exact ratio between cars forever
— equal treatment, not what "some difference between cars, but not too
much once maxed" actually asks for. Instead, each tier closes part of the
gap between a car's own stock value and a fixed cap shared by every car on
that stat (speed 1.30, grip 0.75, handling 0.68, boost peak/hold 1.35 —
all at or beyond today's best roster value, so an upgrade never makes a
car worse). The fraction of that gap closed per tier is 25% / 45% / 62% —
never reaching 100%, so a real gap, just a smaller one, still exists at
tier 3. A car that starts further behind gains more per tier in absolute
terms than one that starts close to the cap already, which is what lets a
cheap car's full upgrade tree meaningfully close the distance to an
expensive one without erasing the reason to want the expensive one too.

**Cost** scales off the car's own price (or a reference value for the
starter and story-exclusive cars): tier 1/2/3 cost 18%/25%/33% of that
price, incremental per tier (cut from 22/30/40% in Phase 9, so the story
pays for the cars it asks for). Maxing all four systems on a 500cr car costs
roughly 1,520cr total; on a 2,200cr car, roughly 6,700cr — matching "you
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
Ave on Coastal Run, and The Circuit on its own finale lap.

| # | City | Kit | Theme | Boss | Rating needed | Recommended | Reward |
|---|---|---|---|---|---|---|---|
| 1 | Portside | A | Foggy harbour, industrial night | Fender | 98 | Starter car | Fender's car |
| 2 | Sundown Strip | B | Desert dusk, orange horizon | Mirage | 100 | Starter car, driven well | Cash |
| 3 | Old Quarter | E | Cobbled downtown, sodium-lamp warmth | Cutlass | 109 | Tier 1 everywhere | Cash |
| 4 | Coastal Run | D | Cliffside ocean night, cool blues | Riptide | 113 | Tier 1 everywhere, Engine and Tyres T2 | Riptide's car |
| 5 | Steel District | C | Industrial, sparks and steam | Foundry | 116 | Tier 2 everywhere | Foundry's car |
| 6 | Neon Downtown | A (harder) | Dense skyscraper neon canyon | Vertex | 118 | Tier 2 everywhere, or Foundry T1 | Cash |
| 7 | High Pass | B (harder) | Mountain dusk, thin cold fog | Glacier | 119 | Maxed starter, or Foundry T1-2 | Glacier's car |
| 8 | The Underpass | E (harder) | Wet-road night, reflections | Undertow | 123 | Foundry T2, or another boss car upgraded | Undertow's car |
| 9 | Skyline Ave | D (harder) | Bridge crossing, tallest skyline | Halo | 123 | Foundry T2 or better | Cash |
| 10 | The Circuit | F | Every theme, mixed | **Apex** | 124 | Foundry T2, or any boss car well upgraded | Apex's car |

The rating needed and the recommendation are shown on the city screen
(with your own car's rating next to them), not a hard lock.

**The difficulty curve (`BOSS_SKILL` in `src/story.js`).** A table, one
boss skill per city: 0.93, 0.99, 1.05, 1.08, 1.11, 1.14, 1.16, 1.175,
1.18, 1.16 (the finale track is long and hard, so its number is lower). The
crew's middle car is 0.08 below the boss, and a Time Attack target is the
track's target lap x 0.98 / (boss skill - 0.05).

Rewritten after playtesting found a stock car could clear the story up to
city 7 without an upgrade. Measured with a racing bot that overtakes and
boosts on straights, with the Phase 9 contact rules (rating in brackets):

| Car | Beats the bosses of |
|---|---|
| Stock Nightrunner (100) | Cities 1-2 (city 3 lost by 7.7s) |
| Nightrunner, all upgrades tier 1 (109) | Cities 1-3 (city 4 lost by 1.1s) |
| Nightrunner, all tier 2 (116) | Cities 1-5 and 7 (6 lost by 0.5s, 8 by 0.9s) |
| Nightrunner, all tier 3 (122) | Cities 1-7 and 9 (8 lost by 0.1s, 10 by 0.5s) |
| Foundry, all tier 2 (123) | All ten (the finale by 0.5s) |
| Foundry, all tier 3 (128) | All ten (the finale by 1.4s) |

The rating each city needs (`RATING_NEED`) is read off this table. Boss
races end within a couple of seconds either way, because rivals fight
back (boost, slipstream, comeback pace). The bot is a clean driver but
not a perfect one; a person who uses slipstream and boost hits well will
do better.

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
| Race | (60 + 15·d) × 1 / 0.75 / 0.55 / 0.4 by place, +50% the first time you clear it |
| Time Attack | 50 + 13·d if you beat the target (+50% the first time), 30% of that if you miss |
| Boss, car city | The car + (100 + 15·d) |
| Boss, cash city | 300 + 45·d |
| Boss, replayed | 90 + 15·d |
| Boss, lost | 30 + 5·d |

"Target time" is each track's existing `targetSecs`, scaled to the lap
count.

| Purchase | Cost |
|---|---|
| Upgrade tier | 18% / 25% / 33% of the car's price, per tier (see above) |
| A new car | 500-2200, per the roster table above |

**Checked in Phase 9.** Winning every event first time earns about 7,600
CR over the story. The test suite walks the story and, before every boss,
checks that some car you already own could reach that city's rating with
what you've earned so far (the cheapest mix of tiers, found by trying
them all). It holds for all ten cities. The tight spots are cities 8-10,
where the efficient path is to move to Foundry (free from city 5) and
upgrade it rather than keep maxing the starter.
