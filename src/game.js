/* game.js — sets everything up, runs the loop, drives the camera, and owns
   the one rule that keeps the game fair on every screen shape. */

(function (DR) {
  'use strict';

  /* Responsive fairness: the game is always drawn into this fixed rectangle,
     scaled to fit and centred, so every player sees exactly the same road
     ahead. Spare screen becomes black bars, never extra road. */
  var LOGICAL_W = 720;
  var LOGICAL_H = 1280;

  /* ------------------------------- SPEED -------------------------------
     BASE_SPEED is the cruising speed. Boost multiplies it on the envelope
     below; pressing again restarts that envelope from the top.

     The car's grip is derived from whatever the speed currently is (see
     MIN_RADIUS in car.js), so boosting into a corner never makes it
     impossible — it just gives you less time to get it right. */
  // STOCK is Nightrunner, at no upgrades — the numbers this game already
  // shipped with. Every other car in the garage (and every upgrade tier, once
  // Phase 3 exists) is these multiplied, applied once by applyCarTuning
  // below, never hand-edited per car — one set of dials, scaled.
  var BASE_SPEED_STOCK = 808;      // was 898, down 10%
  var BASE_SPEED = BASE_SPEED_STOCK;

  /* The boost envelope, in four parts: it lands on 40% instantly, holds there
     for a second, eases down to 30% over the next second, and then bleeds the
     last of it away over three. The step down to 30% is the point — a single
     long fade reads as one event, while a shove that settles into a shorter
     push reads as two, so the boost has a peak you can feel it come off. */
  var BOOST_PEAK_STOCK = 1.40;     // 40% faster the very frame you press it
  var BOOST_STEP_RATIO = 0.75;     // the eased-down step is always this much
                                    // of the peak's excess over 1 — so a car
                                    // with a bigger peak also gets a bigger
                                    // step, and the shape never inverts
  var BOOST_HOLD_STOCK = 1.0;      // seconds held at the full peak
  var BOOST_PEAK = BOOST_PEAK_STOCK;
  var BOOST_HOLD = BOOST_HOLD_STOCK;
  var BOOST_STEP = 1 + (BOOST_PEAK - 1) * BOOST_STEP_RATIO;
  var BOOST_DROP = 1.0;      // ... over this long
  var BOOST_FADE = 3.0;      // and back to normal over this long again

  // cars.js's only way to change how a car actually drives. Every multiplier
  // defaults to 1, so calling this with {} reproduces the stock numbers
  // exactly.
  function applyCarTuning(m) {
    m = m || {};
    BASE_SPEED = BASE_SPEED_STOCK * (m.speedMult || 1);
    BOOST_PEAK = 1 + (BOOST_PEAK_STOCK - 1) * (m.boostPeakMult || 1);
    BOOST_STEP = 1 + (BOOST_PEAK - 1) * BOOST_STEP_RATIO;
    BOOST_HOLD = BOOST_HOLD_STOCK * (m.boostHoldMult || 1);
  }

  /* Boost also squares the car up. Lighting it mid-drift takes a little angle
     off at once and then straightens half again as fast as normal — but only
     while you are NOT holding a side, because holding one is you asking for
     the drift. So boost out of a corner and the car snaps into line for the
     straight; boost while still holding and it stays sideways. */
  var BOOST_STRAIGHTEN = 1.5;   // decay rate multiplier at full boost
  var BOOST_SLIP_SCRUB = 0.85;  // angle kept when the boost fires

  /* ------------------------------ BOOST FUEL ----------------------------
     Boost is no longer free. The meter fills two ways: by drifting, where a
     longer unbroken slide pays better and better, and by running over the
     pickups scattered down the road. Their positions change every lap, so
     the fastest line changes with them. */
  var BOOST_COST      = 0.34;   // a full meter is just under three boosts
  var FILL_BASE       = 0.070;  // per second at full slip, right after turn-in
  var FILL_RAMP       = 0.055;  // extra per second of unbroken drift...
  var FILL_RAMP_CAP   = 3.0;    // ...up to this many seconds
  var FILL_PICKUP     = 0.18;
  var DRIFT_MIN       = 0.18;   // radians of slip before it counts as drifting
  /* --------------------------------------------------------------------- */

  /* Sideways costs you. Without this, drifting is free and the fuel meter has
     no decision in it: you would simply drift everywhere. Now a big slide
     earns boost faster but bleeds speed while it lasts, so how hard to lean on
     it is a real choice — and two laps driven differently take different
     times. */
  var SLIP_DRAG = 0.185;

  // Every wall costs 10% of your speed, and it takes a second to win back.
  var HIT_LOSS = 0.10;
  var HIT_RECOVER_PER_SEC = 0.10;
  var HIT_FLOOR = 0.55;      // repeated hits cannot bring you to a crawl
  /* --------------------------------------------------------------------- */

  /* --------------------------- CHECKPOINT RUSH ---------------------------
     A clock that only ever runs down, and gates that wind it back up. The
     bonus shrinks every lap while the road gets busier, so a run always ends
     — the question is only how far you got, and distance IS the score.

     The bonus is deliberately tuned just either side of the time it takes to
     reach the next gate: drive it perfectly early on and you gain a second or
     two, and by the fourth lap nothing you do keeps up. */
  var RUSH_START      = 25;    // seconds on the clock at the off
  var RUSH_BONUS      = 4.8;   // seconds the first gate gives you...
  var RUSH_BONUS_DROP = 0.30;  // ...less this much for every gate since
  var RUSH_BONUS_MIN  = 2.0;
  var RUSH_CLEAN      = 2.0;   // extra for reaching it without a scratch
  var RUSH_CLEAN_DROP = 0.12;
  var RUSH_CLEAN_MIN  = 1.2;
  /* The decay is counted in GATES PASSED, not laps. Counting laps had the
     same fault as counting gates per lap did: a lap of Grand Circuit takes 60%
     longer than one of Velocity Ring, so the bonus faded 60% more slowly on it
     and a run there lasted 154 seconds against the Ring's 98. Per gate, every
     circuit decays at the same rate in the only currency the mode has. */
  var SPIKE_SLOW      = 0.5;   // spikes halve your speed...
  var SPIKE_SECS      = 3.0;   // ...for this long
  var PIT_LOSS        = 0.12;  // a pothole costs this much speed, like a wall

  var doneAward = 0;   // credits just earned, for the results screen to show

  /* -------------------------------- RIVALS --------------------------------
     A Quick Play race is you against three rivals (rivals.js). Their skill
     is a fraction of the track's target lap pace: 1.0 laps in exactly the
     target time printed on the track card. The spread is wide on purpose —
     a new player can beat the slowest, and the fastest needs a clean race
     from a stock car, less so from an upgraded one. That gap closing as you
     upgrade is the point of upgrading. */
  var QUICK_RIVALS = [
    { name: 'VOLT',    color: '#22e6ff', arch: 'compact', skill: 0.90, bias: -30 },
    { name: 'ONYX',    color: '#8b3dff', arch: 'sport',   skill: 0.95, bias:  30 },
    { name: 'SCARLET', color: '#ff2f8e', arch: 'muscle',  skill: 1.00, bias:   0 }
  ];
  var POS_PAY = [120, 90, 70, 50];     // Quick Play race payout by finishing place
  var raceClock = 0;      // seconds since the lights, shared by every car
  var raceRivals = null;  // the field for the current race, or null
  var standings = null;   // results table, filled when the player finishes
  var finishPos = 0;
  var bumpFlash = 0;

  var rushTime = 0, rushScore = 0, rushBest = 0;
  var cpIndex = 0, cpClean = true, cpFlash = 0, cpFlashText = '';
  var spikeT = 0, rushGates = 0;

  var BOOST_BTN = { x: 360, y: 1168, r: 72 };
  var BACK_BTN = { x: 40, y: 34, w: 156, h: 56 };      // track screen -> modes
  var EXIT_BTN = { x: 40, y: 1184, w: 176, h: 58 };    // practice -> menu
  var RACE_LAPS = 3;
  var DUEL_LAPS = 2;     // two each, so passing the phone is not a punishment

  /* ------------------------------- DUEL --------------------------------
     Pass and play. Player one drives, and every twelfth of a second their car
     is written down. Player two then drives the same two laps with that
     recording alongside them, and a gap in SECONDS — not in car lengths —
     because both cars pass through the same points of road, and the honest
     question is who got there first. */
  var duelStage = 1;         // 1 = setting the time, 2 = chasing it
  var duelGhost = null;      // player one's run
  var duelTimes = [0, 0];
  var duelElapsed = 0;       // seconds since this player's start line
  var duelGap = null;        // + means player two is behind
  var _ghostPos = { x: 0, y: 0, bodyYaw: 0, slip: 0, roll: 0, done: false };

  function lapsFor(m) { return m === 'duel' ? DUEL_LAPS : m === 'time' ? timeLaps : RACE_LAPS; }

  /* 'modes' -> 'select' -> 'racing' -> 'done' -> back to 'modes'.
     A mode decides what the race is FOR; the track screen is the same either
     way, so the two screens stack rather than each mode owning its own. */
  var MODES = [
    { id: 'race',     name: 'RACE',     tag: '3 LAPS  •  3 RIVALS',
      blurb: 'Three laps against three rivals. Win for the big pay.' },
    { id: 'practice', name: 'PRACTICE', tag: 'NO CLOCK',
      blurb: 'The ideal line painted on the road, and when to hold.' },
    { id: 'rush',     name: 'CHECKPOINT RUSH', tag: 'SURVIVE',
      blurb: 'Beat the clock to each gate. Spikes and potholes.' },
    { id: 'duel',     name: 'DUEL',     tag: '2 PLAYERS',
      blurb: 'Two laps each. Player two races player one\u2019s ghost.' }
  ];
  var mode = 'race';
  var modeSel = 0;

  /* The screen the game opens on now sits ABOVE 'modes': three doors — Story,
     Quick Play, Garage — with Quick Play leading into exactly what used to be
     the whole game. Story and Garage are placeholders until their own phases
     land; the point of building this now is that every later screen has
     somewhere to hang, rather than bolting each one onto a flatter menu and
     restructuring again later.

     'title' -> 'modes' -> 'select' -> 'racing' -> 'done' -> back to 'modes',
     with 'story' and 'garage' as dead-end rooms off 'title' for now. */
  var TITLE_ITEMS = [
    { id: 'story',    name: 'STORY',      ready: true },
    { id: 'quick',    name: 'QUICK PLAY', ready: true },
    { id: 'garage',   name: 'GARAGE',     ready: true },
    { id: 'tutorial', name: 'TUTORIAL',   ready: true }
  ];
  var titleSel = 1;   // Quick Play — the default door

  /* --------------------------------- STORY --------------------------------
     'title' -> 'story' (the ten cities) -> 'city' (one city's events) ->
     'racing' -> 'done' -> back to 'city'. The data and the rules (what
     clears what, what it pays, what it unlocks) all live in story.js; this
     file only draws the screens and runs the races it describes. */
  var storySel = 0;          // highlighted city on the map
  var citySel = 0;           // highlighted event inside a city
  var storyEvent = null;     // Story.setup() for the event being raced
  var storyResult = null;    // Story.resolve() for the results screen
  var timeLaps = 2, timeTarget = 0;   // a time attack's length and target
  var doneSel = 1;           // story results: 0 = retry, 1 = continue
  var garageReturn = 'title';

  /* --------------------------------- GARAGE -------------------------------
     Browsing is cheap, buying is not: setArchetype/setPalette touch shared
     module state in car.js (the mesh and paint arrays), so they are only
     called when the highlighted car or its colour actually changes — never
     once a frame — matching the same no-allocation care the race loop uses
     everywhere else. */
  var garageSel = 0;
  var garagePreviewFor = null, garagePreviewColor = null;
  var _garagePreview = { x: 0, y: 320, h: 0, bodyYaw: 0.6, slip: 0, roll: 0 };
  // Measured, not guessed: at this preview depth the projected car's lowest
  // pixel lands as far down as logical y~907 across the archetype range and
  // the animated turntable angle, which reaches into the stat bars (they
  // start at y=802). Shifting the draw up by this many pixels clears the
  // name/tag/blurb block (which starts at y=705) with margin to spare.
  var GARAGE_PREVIEW_SHIFT_Y = 250;

  function rosterIndexOf(carId) {
    var r = DR.Cars.roster();
    for (var i = 0; i < r.length; i++) if (r[i].id === carId) return i;
    return 0;
  }

  // Applies whichever car is highlighted to the shared mesh/paint state, but
  // only when something actually changed since the last frame.
  function ensureGaragePreview() {
    var def = DR.Cars.roster()[garageSel];
    var color = DR.Save.carColor(def.id) || def.color;
    if (garagePreviewFor === def.id && garagePreviewColor === color) return def;
    DR.Car.setArchetype(def.archetype);
    DR.Car.setPalette(color);
    // Push a bigger archetype further back (and a smaller one closer) so
    // every car's preview reads as roughly the same size on screen — a
    // fixed distance made Muscle project large enough to run into the
    // stat bars below it.
    _garagePreview.y = 320 * DR.Car.archetypeScale(def.archetype);
    garagePreviewFor = def.id;
    garagePreviewColor = color;
    return def;
  }

  var phase = 'title';
  var selected = 2;
  var raceTotal = 0;
  var FIXED = 1 / 60;    // physics rate, so the feel never changes with framerate

  var CAM_TAU  = 0.22;   // how lazily the camera swings round to follow you
  var CAM_LEAN = 52;     // how far it leans into a drift

  var canvas, ctx;
  var scale = 1, offX = 0, offY = 0, dpr = 1;
  var camAngle = 0, camX = 0, camY = 0, camReady = false;
  var last = 0, acc = 0;
  var hintAlpha = 1;
  var hitCool = 0;
  var draftMult = 1;          // slipstream: > 1 while tucked in behind a rival
  var wallHitCount = 0;       // every wall hit this run; the tutorial grades on it
  var lastWallSide = 0;       // and which side of the road the last one was on
  var lap = 1, lapFlash = 0;
  var boostT = 1e9;          // seconds since the boost was pressed
  var lapTimer = 0;          // seconds into the current lap
  var timing = false;        // false until the start line is crossed
  var lapTimes = [];         // completed laps, newest last
  var hitPenalty = 1;        // speed multiplier lost to walls, climbing back to 1
  var meter = 0.55;          // boost in the tank, 0..1
  var driftTime = 0;         // how long the current unbroken drift has run
  var clock = 0;             // running seconds, for animating pickups
  var pickPop = 0;           // brief swell when one is collected
  var boostDenied = 0;       // flashes the meter when you press with none left

  function resize() {
    var vw = Math.max(1, window.innerWidth);
    var vh = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    scale = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    offX = (vw - LOGICAL_W * scale) * 0.5;
    offY = (vh - LOGICAL_H * scale) * 0.5;
    // Nothing about the run is touched here, so resizing mid-drift is safe.
  }

  function boostMult() {
    if (boostT < BOOST_HOLD) return BOOST_PEAK;            // full, from frame one
    var t = boostT - BOOST_HOLD;
    if (t < BOOST_DROP) return BOOST_PEAK + (BOOST_STEP - BOOST_PEAK) * (t / BOOST_DROP);
    t -= BOOST_DROP;
    if (t < BOOST_FADE) return BOOST_STEP + (1 - BOOST_STEP) * (t / BOOST_FADE);
    return 1;
  }

  function boostAmount() { return (boostMult() - 1) / (BOOST_PEAK - 1); }

  function slipDrag() {
    var sn = Math.sin(DR.Car.slip);
    return 1 - SLIP_DRAG * sn * sn;
  }

  function spikeMult() { return spikeT > 0 ? SPIKE_SLOW : 1; }

  function currentSpeed() {
    var pace = mode === 'tutorial' ? DR.Tutorial.pace() : 1;
    return BASE_SPEED * pace * boostMult() * hitPenalty * slipDrag() * spikeMult() * draftMult;
  }

  // Where the next gate is, in world arc length.
  function cpWorldS(n) {
    return DR.Road.INTRO_LEN + n * (DR.Road.lapLength() / DR.Road.cpCount());
  }
  function rushLapsDone() {
    return Math.floor(cpIndex / DR.Road.cpCount());
  }

  function view() {
    return {
      W: LOGICAL_W, H: LOGICAL_H,
      carY: DR.Road.CAR_Y,
      carS: DR.Car.roadS,
      camX: camX, camY: camY,
      camAngle: camAngle,
      camSin: Math.sin(camAngle), camCos: Math.cos(camAngle),
      boost: boostAmount()
    };
  }

  function updateCamera(dt) {
    var target = DR.Car.h;
    if (!camReady) { camAngle = target; camReady = true; }
    camAngle += (target - camAngle) * (1 - Math.exp(-dt / CAM_TAU));

    var f = Math.exp(0);   // camera sits CAM_BACK behind, along its own bearing
    var sn = Math.sin(camAngle), cs = Math.cos(camAngle);
    var lean = Math.sin(DR.Car.slip) * CAM_LEAN;
    camX = DR.Car.x - sn * DR.Road.CAM_BACK + cs * lean;
    camY = DR.Car.y - cs * DR.Road.CAM_BACK - sn * lean;
  }

  /* Hitting the barrier. The car is still held on the road — nothing ends a
     run yet — but it is no longer a silent clamp: the wall lights up where
     you struck it, sparks come off the contact point and stay lying on the
     tarmac behind you, the body rocks on its springs, and the car is pushed
     back off the wall over about a fifth of a second instead of being
     teleported clear. All of that is so the crash and the recovery are things
     you watch happen, not things you infer from the speed dropping. */
  var rebound = 0, rbNX = 0, rbNY = 0;   // push off the wall, world units/sec
  var REBOUND_TAU = 0.16;
  var scrapeT = 0;

  function checkEdges(dt) {
    hitCool = Math.max(0, hitCool - dt);

    var loc = DR.Road.locate(DR.Car.x, DR.Car.y, DR.Car.roadS);
    DR.Car.roadS = loc.s;
    DR.Car.dev = loc.dev;

    var limit = loc.hw - DR.Car.halfWidth();
    if (Math.abs(loc.dev) <= limit) { scrapeT = 0; return; }

    var side = loc.dev > 0 ? 1 : -1;
    var excess = Math.abs(loc.dev) - limit;
    // Push straight back onto the road, keeping the along-track position.
    DR.Car.x -= loc.nx * side * excess;
    DR.Car.y -= loc.ny * side * excess;
    DR.Car.dev = side * limit;

    // Where the car is touching the barrier, and which way the debris flies:
    // back along the car, and in off the wall.
    var wallOff = loc.hw + DR.Road.WALL_OFF;
    var wxp = loc.px + loc.nx * side * wallOff;
    var wyp = loc.py + loc.ny * side * wallOff;
    var dx = -Math.sin(DR.Car.h) * 0.75 - loc.nx * side * 0.65;
    var dy = -Math.cos(DR.Car.h) * 0.75 - loc.ny * side * 0.65;
    var dn = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= dn; dy /= dn;

    // Grinding along the wall throws a thin, continuous shower, so a long
    // scrape looks different from a single knock.
    scrapeT += dt;
    if (scrapeT >= 0.03) {
      scrapeT = 0;
      DR.FX.wallSparks(wxp, wyp, dx, dy, 3, 0.5);
    }

    if (hitCool > 0) return;

    // Which mistake was it? The inside of a bend is the side it turns toward,
    // so hitting that edge means you cut in and the other means you ran wide.
    var dir = DR.Road.dirAt(loc.s);
    var kind = dir === 0 ? 'OFFLINE' : (side === dir ? 'INNER' : 'OUTER');
    // How hard: the worse of how sideways the car was and how fast it was
    // actually closing on the wall, so a straight-on shunt registers too.
    var approach = excess / Math.max(dt, 1e-4);
    var severity = Math.min(1, Math.max(Math.abs(Math.sin(DR.Car.slip)) * BASE_SPEED / 320,
                                        approach / 420));

    DR.FX.hit(kind, Math.max(0.35, severity), side, DR.Car);
    DR.FX.wallHit(loc.s, side);
    DR.FX.wallSparks(wxp, wyp, dx, dy, 16 + Math.round(severity * 16), 0.9 + severity * 0.6);
    DR.Car.jolt(-side * (2.4 + severity * 3.4));
    rebound = 130 + severity * 220;
    rbNX = -loc.nx * side; rbNY = -loc.ny * side;
    hitCool = 0.45;
    wallHitCount++; lastWallSide = side;

    // A crash should push you toward the correction you actually needed.
    // Running wide means you were not turning ENOUGH, so bleeding the drift
    // off — which is what used to happen — guaranteed you scraped the rest of
    // the corner and could never get back. Nudge it further into the corner
    // instead, starting from wherever it already is.
    // Every wall costs speed, and it takes a second to get it back.
    hitPenalty = Math.max(HIT_FLOOR, hitPenalty * (1 - HIT_LOSS));

    if (kind === 'OUTER') {
      DR.Car.nudgeBody(dir * DR.Car.SLIP_AT_LIMIT * 0.22);
    } else {
      // Cutting in, or sliding about on a straight: here you WERE turning too
      // much, so scrubbing off some slide is the right correction.
      DR.Car.scrubSlip(0.55);
    }
  }

  function update(dt) {
    if (phase !== 'racing') { clock += dt; return; }
    var steer = DR.Input.steer();
    if (steer !== 0) hintAlpha = Math.max(0, hintAlpha - dt * 2.4);

    clock += dt;
    raceClock += dt;
    if (bumpFlash > 0) bumpFlash = Math.max(0, bumpFlash - dt / 0.5);
    if (pickPop > 0) pickPop = Math.max(0, pickPop - dt / 0.5);
    if (boostDenied > 0) boostDenied = Math.max(0, boostDenied - dt / 0.6);

    var boostFired = false;
    if (DR.Input.takeBoost()) {
      if (meter >= BOOST_COST) {
        meter -= BOOST_COST; boostT = 0; DR.FX.boostKick(); boostFired = true;
        // A shove forward takes some of the sideways out of it straight away.
        DR.Car.scrubSlip(BOOST_SLIP_SCRUB);
      } else boostDenied = 1;
    }
    if (boostT < 1e9) boostT += dt;

    // Drifting earns boost, and the longer you hold a slide the better it pays.
    var slipMag = Math.abs(DR.Car.slip);
    if (slipMag > DRIFT_MIN) {
      driftTime = Math.min(FILL_RAMP_CAP, driftTime + dt);
      var slipFrac = Math.min(1, (slipMag - DRIFT_MIN) / (DR.Car.SLIP_AT_LIMIT - DRIFT_MIN));
      meter = Math.min(1, meter + (FILL_BASE + FILL_RAMP * driftTime) * slipFrac * dt);
    } else {
      driftTime = 0;
    }

    collectPicks();
    if (mode === 'rush') updateRush(dt);
    if (mode === 'duel') updateDuel(dt);

    if (hitPenalty < 1) hitPenalty = Math.min(1, hitPenalty + HIT_RECOVER_PER_SEC * dt);
    // Slipstream: tucked in behind a rival, you're pulled along too.
    var draftWant = raceRivals ? DR.Rivals.draftFor(DR.Car.roadS, DR.Car.dev) : 1;
    draftMult += (draftWant - draftMult) * (1 - Math.exp(-dt / 0.35));
    var speed = currentSpeed();
    // Eased off with the boost rather than switched off at the end of it, so
    // there is no moment where the car suddenly stops squaring up.
    var straighten = steer === 0 ? 1 + (BOOST_STRAIGHTEN - 1) * boostAmount() : 1;
    DR.Car.update(dt, steer, speed, straighten);

    // The push off the barrier, spent over a fifth of a second rather than
    // all at once, so you can see the car come back off the wall.
    if (rebound > 0.5) {
      DR.Car.x += rbNX * rebound * dt;
      DR.Car.y += rbNY * rebound * dt;
      rebound *= Math.exp(-dt / REBOUND_TAU);
    } else rebound = 0;

    checkEdges(dt);
    updateRivals(dt);
    updateCamera(dt);

    // Laps. One lap is the whole corner sequence once; the start line is the
    // end of the run-up.
    // The clock starts at the start line, so the run-up is not part of lap 1.
    if (!timing && DR.Car.roadS >= DR.Road.INTRO_LEN) { timing = true; lapTimer = 0; }
    if (timing) lapTimer += dt;

    var done = Math.floor(Math.max(0, DR.Car.roadS - DR.Road.INTRO_LEN) / DR.Road.lapLength());
    if (done + 1 > lap) {
      lapTimes.push(lapTimer);
      raceTotal += lapTimer;
      lapTimer = 0;
      lap = done + 1;
      lapFlash = 1;
      // Only a race has a last lap. Practice runs until you leave; Rush runs
      // until the clock beats you.
      if (mode === 'race' && lapTimes.length >= RACE_LAPS) { finishRace(); }
      if (mode === 'time' && lapTimes.length >= timeLaps) { finishRace(); }
      if (mode === 'duel' && lapTimes.length >= DUEL_LAPS) { finishDuelLeg(); }
    }
    if (lapFlash > 0) lapFlash = Math.max(0, lapFlash - dt / 1.6);

    if (mode === 'tutorial') {
      tutorialRescue(dt);
      var tr = DR.Tutorial.update(dt, { s: DR.Car.roadS, steer: steer, speed: speed,
                                        walls: wallHitCount, wallSide: lastWallSide,
                                        meter: meter, boosted: boostFired });
      if (tr.fillMeter && meter < 1) meter = Math.min(1, meter + dt * 0.9);
      if (tr.finished) finishTutorial();
    }

    DR.FX.emit(DR.Car, speed, dt);
    DR.FX.update(dt, DR.Car.x, DR.Car.y);
    DR.Road.ensure(DR.Car.roadS + DR.Road.LOOKAHEAD + 400);
    DR.Road.trim(DR.Car.roadS - DR.Road.CAM_BACK - 900);
  }

  function updateDuel(dt) {
    if (!timing) return;                 // the run-up is nobody's time
    duelElapsed += dt;
    if (duelStage === 1) {
      DR.Ghost.sample(dt, DR.Car, duelElapsed);
      return;
    }
    // Chasing: how long the ghost took to reach the point of road we are on.
    var was = DR.Ghost.timeAt(duelGhost, DR.Car.roadS);
    duelGap = (was === null) ? null : duelElapsed - was;
  }

  /* Currency, as a starting point (docs/content-plan.md). AI races and boss
     races don't exist yet (Phase 4/5), so Quick Play is the only place
     currency is earned right now — graded on how well you did, but never
     zero, so a rough run still pays for the next attempt. First real
     numbers; expect these to move once Phase 5 makes a city's real
     difficulty measurable instead of guessed. */
  function awardRaceCurrency() {
    if (raceRivals && finishPos) {
      doneAward = POS_PAY[Math.min(POS_PAY.length, finishPos) - 1];
    } else {
      var target = DR.Road.tracks()[DR.Road.currentTrack()].targetSecs * RACE_LAPS;
      var ratio = target / Math.max(1, raceTotal);
      doneAward = Math.round(Math.max(40, Math.min(130, 80 * ratio)));
    }
    DR.Save.addCurrency(doneAward);
  }

  function finishLineS() { return DR.Road.INTRO_LEN + lapsFor(mode) * DR.Road.lapLength(); }

  function updateRivals(dt) {
    if (!raceRivals) return;
    DR.Rivals.update(dt, { playerS: DR.Car.roadS, playerDev: DR.Car.dev,
                           playerHW: DR.Car.halfWidth(), playerDone: false,
                           clock: raceClock, finishS: finishLineS() });
    // Pushed sideways along the road, but never INTO the barrier: being
    // leaned on by a rival shouldn't be able to cost you a wall hit too.
    var limit = Math.max(0, DR.Road.halfWidthAt(DR.Car.roadS) - DR.Car.halfWidth() - 2);
    var speedNow = currentSpeed();
    var hit = DR.Rivals.contact({ s: DR.Car.roadS, dev: DR.Car.dev, hw: DR.Car.halfWidth(),
                                  len: DR.Car.L, limit: limit, v: speedNow });
    if (!hit) return;
    var c = DR.Road.centreAt(DR.Car.roadS);
    var nx = Math.cos(c.h), ny = -Math.sin(c.h);      // across the road, to the right
    var fx = Math.sin(c.h), fy = Math.cos(c.h);       // along it
    var nd = Math.max(-limit, Math.min(limit, DR.Car.dev + hit.shiftD));
    var shift = nd - DR.Car.dev;
    DR.Car.x += nx * shift + fx * hit.shiftS;
    DR.Car.y += ny * shift + fy * hit.shiftS;
    DR.Car.dev = nd;
    // Contact costs speed: running into the back of a car drops you to its
    // pace, a rub costs a little, a knock costs more.
    if (hit.cap < 1) hitPenalty = Math.max(HIT_FLOOR, Math.min(hitPenalty, hit.cap * hitPenalty));
    if (hit.pinned && hit.fresh) hitPenalty = Math.max(HIT_FLOOR, Math.min(hitPenalty, 0.97 * hitPenalty));
    if (hit.knock) DR.Car.nudgeBody(hit.knock);
    if (hit.fresh) {
      var sev = hit.severity;
      DR.Car.jolt(-hit.side * (1.5 + sev * 3));
      DR.FX.wallSparks(hit.x, hit.y, -nx * hit.side, -ny * hit.side, 8 + Math.round(sev * 14), 0.6 + sev * 0.6);
      DR.FX.shakeBy(3 + sev * 9, 0.25);
      bumpFlash = 1;
      if (hit.knock) DR.FX.hazardHit('KNOCKED', '#ff8a5c', sev, DR.Car);
      else if (hit.spun) DR.FX.hazardHit('TAKEDOWN!', '#ffd76a', sev, DR.Car);
      else if (hit.kind === 'rear' && sev > 0.45) DR.FX.hazardHit('BLOCKED', '#eaf2ff', sev, DR.Car);
    }
  }

  function finishRace() {
    phase = 'done'; lapFlash = 0;
    standings = null; finishPos = 0;
    if (raceRivals) {
      standings = DR.Rivals.standings({ name: 'YOU', color: '#ffd76a', time: raceClock,
                                        clock: raceClock, finishS: finishLineS() });
      for (var i = 0; i < standings.length; i++) if (standings[i].isPlayer) finishPos = i + 1;
    }
    if (storyEvent) {
      storyResult = DR.Story.resolve(storyEvent.city, storyEvent.event,
                                     { pos: raceRivals ? finishPos : 0, total: raceTotal });
      doneAward = storyResult.award;
      // Failing puts RETRY under your thumb; clearing puts CONTINUE there.
      doneSel = storyResult.ok ? 1 : 0;
    } else {
      awardRaceCurrency();
    }
  }

  /* The tutorial: Velocity Ring, the gentlest track, with the racing line
     painted and a coach (src/tutorial.js) on top. No laps to count — it
     ends when both lessons are done. The first finish pays a little, and
     the title stops pointing new players at it. */
  var TUTORIAL_ID = 'tutorial:done';
  var TUTORIAL_PAY = 150;
  /* Held flat out at tutorial pace, a car can spin right round and end up
     driving back the way it came. A beginner shouldn't have to work out how
     to turn round; after a moment facing the wrong way the car is set back
     on the middle of the road, pointing forward, and the coach says so. */
  var wrongWayT = 0;
  function tutorialRescue(dt) {
    var c = DR.Road.centreAt(DR.Car.roadS);
    var dh = DR.Car.h - c.h;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    wrongWayT = Math.abs(dh) > 1.75 ? wrongWayT + dt : 0;
    if (wrongWayT < 0.8) return;
    wrongWayT = 0;
    var car = DR.Car;
    car.x = c.x; car.y = c.y; car.h = c.h; car.bodyYaw = c.h;
    car.cmdSlip = 0; car.gripSlip = 0; car.slip = 0; car.yawRate = 0;
    car.roll = 0; car.rollV = 0; car.dev = 0;
    rebound = 0; camReady = false;
    DR.Tutorial.rescued();
  }

  function startTutorial() {
    wrongWayT = 0;
    startRace(0, 'tutorial');
    DR.Tutorial.start();
  }
  function finishTutorial() {
    phase = 'done'; lapFlash = 0;
    var first = !DR.Save.isUnlocked(TUTORIAL_ID);
    doneAward = first ? TUTORIAL_PAY : 0;
    if (first) { DR.Save.unlock(TUTORIAL_ID); DR.Save.addCurrency(doneAward); }
    doneSel = 1;
  }
  function leaveTutorial() {
    phase = 'story'; storySel = DR.Story.currentCity();
    DR.Input.releaseAll(); DR.Input.clearTap();
  }

  function startStoryEvent(ci, ei) {
    var st = DR.Story.setup(ci, ei);
    storySel = ci; citySel = ei;
    if (st.mode === 'time') { timeLaps = st.laps; timeTarget = st.target; }
    startRace(st.track, st.mode, false, { rivals: st.rivals, story: st });
  }
  function awardDuelCurrency() {
    var target = DR.Road.tracks()[DR.Road.currentTrack()].targetSecs * DUEL_LAPS;
    var winTime = Math.min(duelTimes[0], duelTimes[1]);
    var ratio = target / Math.max(1, winTime);
    doneAward = Math.round(Math.max(35, Math.min(110, 70 * ratio)));
    DR.Save.addCurrency(doneAward);
  }
  function awardRushCurrency() {
    doneAward = Math.round(Math.max(30, Math.min(150, rushScore * 0.6)));
    DR.Save.addCurrency(doneAward);
  }

  function finishDuelLeg() {
    lapFlash = 0;
    if (duelStage === 1) {
      duelTimes[0] = raceTotal;
      duelGhost = DR.Ghost.finish();
      phase = 'handoff';
    } else {
      duelTimes[1] = raceTotal;
      phase = 'done';
      awardDuelCurrency();
    }
  }

  // Player two's leg: same track, same everything, but the ghost stays.
  function startDuelLeg2() {
    duelStage = 2;
    duelElapsed = 0;
    duelGap = null;
    var keep = duelGhost;
    startRace(selected, 'duel', true);
    duelGhost = keep;
    duelStage = 2;
  }

  function updateRush(dt) {
    if (spikeT > 0) spikeT = Math.max(0, spikeT - dt);
    if (cpFlash > 0) cpFlash = Math.max(0, cpFlash - dt / 1.6);

    // Distance IS the score, so it never falls and never needs explaining.
    var travelled = Math.max(0, DR.Car.roadS - DR.Road.INTRO_LEN);
    rushScore = Math.floor(travelled / 10);

    DR.Road.ensureHazards(DR.Car.roadS + DR.Road.LOOKAHEAD);
    DR.Road.trimHazards(DR.Car.roadS - 500);
    hitHazards();

    // Gates.
    while (DR.Car.roadS >= cpWorldS(cpIndex)) {
      var bonus = Math.max(RUSH_BONUS_MIN, RUSH_BONUS - cpIndex * RUSH_BONUS_DROP);
      var extra = cpClean ? Math.max(RUSH_CLEAN_MIN, RUSH_CLEAN - cpIndex * RUSH_CLEAN_DROP) : 0;
      rushTime += bonus + extra;
      cpFlash = 1;
      cpFlashText = '+' + (bonus + extra).toFixed(1) + 's' + (cpClean ? '  CLEAN' : '');
      cpClean = true;
      cpIndex++;
      rushGates++;
    }

    rushTime -= dt;
    if (rushTime <= 0) {
      rushTime = 0;
      if (rushScore > rushBest) rushBest = rushScore;
      phase = 'done';
      awardRushCurrency();
    }
  }

  // Did we drive over a spike strip or into a pothole?
  function hitHazards() {
    var list = DR.Road.hazards();
    var hw = DR.Road.halfWidthAt(DR.Car.roadS);
    var carFrac = DR.Car.halfWidth() / hw;
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h.hit) continue;
      if (Math.abs(h.s - DR.Car.roadS) > h.len * 0.5 + 24) continue;
      var lat = DR.Car.dev / hw;
      if (Math.abs(lat - h.lat) > h.halfW + carFrac) continue;

      h.hit = true;
      cpClean = false;
      var side = h.lat >= lat ? 1 : -1;
      if (h.spike) {
        spikeT = SPIKE_SECS;
        DR.FX.hazardHit('SPIKED', '#dfe6f2', 0.9, DR.Car);
        DR.FX.wallSparks(DR.Car.x, DR.Car.y,
                         -Math.sin(DR.Car.h), -Math.cos(DR.Car.h), 22, 1.1);
      } else {
        hitPenalty = Math.max(HIT_FLOOR, hitPenalty * (1 - PIT_LOSS));
        DR.Car.jolt(side * 3.4);
        DR.FX.hazardHit('POTHOLE', '#ffb24d', 0.6, DR.Car);
      }
    }
  }

  // m:ss.hh under a minute drops the minutes, because a lap is about half one.
  function fmt(t) {
    if (!(t >= 0)) return '--.--';
    var m = Math.floor(t / 60);
    var rest = t - m * 60;
    var ss = rest < 10 ? '0' + rest.toFixed(2) : rest.toFixed(2);
    return m > 0 ? m + ':' + ss : rest.toFixed(2);
  }

  function lapProgress() {
    var d = DR.Car.roadS - DR.Road.INTRO_LEN;
    if (d < 0) return 0;
    var L = DR.Road.lapLength();
    return (d - Math.floor(d / L) * L) / L;
  }

  // Lap read-out. Deliberately small and quiet: this milestone is still about
  // the driving, not the scoreboard.
  function drawHud(ctx2, v) {
    var x = 40, y = 50, i;
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx2.textAlign = 'left';
    ctx2.textBaseline = 'top';

    ctx2.font = '700 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.85)';
    ctx2.fillText('LAP', x, y);

    ctx2.font = '800 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.lineWidth = 6;
    ctx2.strokeStyle = 'rgba(4,2,10,0.85)';
    var total = lapsFor(mode);
    ctx2.strokeText(Math.min(lap, total) + '/' + total, x, y + 22);
    ctx2.fillStyle = '#eaf6ff';
    ctx2.fillText(Math.min(lap, total) + '/' + total, x, y + 22);

    var bw = 200, bh = 7, by = y + 88;
    ctx2.fillStyle = 'rgba(255,255,255,0.13)';
    ctx2.fillRect(x, by, bw, bh);
    ctx2.fillStyle = '#22e6ff';
    ctx2.fillRect(x, by, bw * lapProgress(), bh);

    // Running time for the lap you are on.
    ctx2.font = '700 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.8)';
    ctx2.fillText('THIS LAP', x, y + 108);
    ctx2.font = '700 38px ' + MONO;
    ctx2.lineWidth = 5;
    ctx2.strokeStyle = 'rgba(4,2,10,0.85)';
    ctx2.strokeText(timing ? fmt(lapTimer) : '--.--', x, y + 130);
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText(timing ? fmt(lapTimer) : '--.--', x, y + 130);

    // The last three, newest at the top. The quickest of them is called out,
    // so the list says something rather than just listing.
    if (lapTimes.length) {
      var best = Math.min.apply(null, lapTimes);
      ctx2.font = '700 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = 'rgba(150,196,225,0.8)';
      ctx2.fillText('LAST LAPS', x, y + 182);

      for (i = 0; i < lapTimes.length; i++) {
        var idx = lapTimes.length - 1 - i;          // newest first
        var t = lapTimes[idx];
        var row = y + 206 + i * 28;
        var isBest = t === best && lapTimes.length > 1;

        ctx2.font = '600 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx2.fillStyle = 'rgba(150,196,225,0.65)';
        ctx2.fillText('L' + (lap - 1 - i), x, row + 3);   // row 0 is the lap just finished

        ctx2.font = '700 24px ' + MONO;
        ctx2.fillStyle = isBest ? '#7dffb0' : 'rgba(228,242,252,0.92)';
        ctx2.fillText(fmt(t), x + 46, row);

        if (isBest) {
          ctx2.font = '700 16px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
          ctx2.fillStyle = '#7dffb0';
          ctx2.fillText('BEST', x + 162, row + 6);
        }
      }
    }

    drawBoostButton(ctx2);
    drawMinimap(ctx2);
    if (raceRivals) drawPosition(ctx2, v);

    // Crossing the line: one soft swell, no strobe.
    if (lapFlash > 0) {
      var k = Math.sin(Math.PI * Math.min(1, lapFlash));
      ctx2.globalAlpha = k;
      ctx2.textAlign = 'center';
      ctx2.font = '800 60px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.lineWidth = 8;
      ctx2.strokeStyle = 'rgba(4,2,10,0.85)';
      ctx2.strokeText('LAP ' + (lap - 1), v.W * 0.5, v.H * 0.26);
      ctx2.fillStyle = '#ffd76a';
      ctx2.fillText('LAP ' + (lap - 1), v.W * 0.5, v.H * 0.26);
      if (lapTimes.length) {
        ctx2.font = '700 46px ' + MONO;
        ctx2.strokeText(fmt(lapTimes[lapTimes.length - 1]), v.W * 0.5, v.H * 0.26 + 66);
        ctx2.fillStyle = '#eaf6ff';
        ctx2.fillText(fmt(lapTimes[lapTimes.length - 1]), v.W * 0.5, v.H * 0.26 + 66);
      }
      ctx2.globalAlpha = 1;
      ctx2.textAlign = 'left';
    }
  }

  // The button doubles as the boost read-out: the ring drains through the two
  // seconds of boost and refills as the car eases back to normal.
  function drawBoostButton(ctx2) {
    var b = BOOST_BTN, amt = boostAmount();
    var live = boostT < BOOST_HOLD + BOOST_DROP + BOOST_FADE;
    var ready = meter >= BOOST_COST;
    var i;

    ctx2.beginPath();
    ctx2.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx2.fillStyle = live ? 'rgba(255,120,40,0.22)'
                          : (ready ? 'rgba(60,220,255,0.10)' : 'rgba(255,255,255,0.05)');
    ctx2.fill();
    ctx2.lineWidth = 3;
    ctx2.strokeStyle = live ? 'rgba(255,170,80,0.9)'
                            : (ready ? 'rgba(120,235,255,0.75)' : 'rgba(150,170,190,0.35)');
    ctx2.stroke();

    // The ring IS the fuel gauge. Ticks mark each boost you can afford.
    var rr = b.r - 9;
    ctx2.beginPath();
    ctx2.arc(b.x, b.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * meter);
    ctx2.lineWidth = 9;
    ctx2.lineCap = 'butt';
    ctx2.strokeStyle = boostDenied > 0
      ? 'rgba(255,90,80,' + (0.55 + 0.45 * boostDenied) + ')'
      : (ready ? '#41e0ff' : 'rgba(120,180,210,0.55)');
    ctx2.stroke();

    for (i = 1; i * BOOST_COST < 1.0; i++) {
      var a = -Math.PI / 2 + Math.PI * 2 * (i * BOOST_COST);
      ctx2.beginPath();
      ctx2.moveTo(b.x + Math.cos(a) * (rr - 6), b.y + Math.sin(a) * (rr - 6));
      ctx2.lineTo(b.x + Math.cos(a) * (rr + 6), b.y + Math.sin(a) * (rr + 6));
      ctx2.lineWidth = 2.5;
      ctx2.strokeStyle = 'rgba(6,10,20,0.85)';
      ctx2.stroke();
    }

    // While boosting, a second arc drains through the two seconds of shove.
    if (amt > 0.001) {
      ctx2.beginPath();
      ctx2.arc(b.x, b.y, b.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * amt);
      ctx2.lineWidth = 5;
      ctx2.strokeStyle = '#ffb24d';
      ctx2.stroke();
    }

    var pop = 1 + pickPop * 0.18;
    ctx2.save();
    ctx2.translate(b.x, b.y);
    ctx2.scale(pop, pop);
    ctx2.beginPath();
    ctx2.moveTo(-20, 12); ctx2.lineTo(0, -14); ctx2.lineTo(20, 12);
    ctx2.lineWidth = 6;
    ctx2.lineJoin = 'round';
    ctx2.lineCap = 'round';
    ctx2.strokeStyle = live ? '#fff0d0' : (ready ? '#dff8ff' : 'rgba(190,210,225,0.5)');
    ctx2.stroke();
    ctx2.restore();

    ctx2.textAlign = 'center';
    ctx2.font = '700 19px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = live ? 'rgba(255,220,170,0.95)' : (ready ? 'rgba(190,240,255,0.9)' : 'rgba(170,190,205,0.6)');
    ctx2.fillText('BOOST', b.x, b.y + 34);
    ctx2.textAlign = 'left';
  }

  // Draws a lap's shape into a box. Used by both the minimap and the cards
  // on the track-select screen, so they can never disagree.
  function drawOutline(ctx2, box, which, dotAt, thick) {
    var pts = DR.Road.lapOutline(which), i;
    var pad = box.w * 0.12, iw = box.w - pad * 2, ih = box.h - pad * 2;
    function mx(p) { return box.x + pad + p.nx * iw; }
    function my(p) { return box.y + pad + (1 - p.ny) * ih; }

    ctx2.beginPath();
    ctx2.moveTo(mx(pts[0]), my(pts[0]));
    for (i = 1; i < pts.length; i++) ctx2.lineTo(mx(pts[i]), my(pts[i]));
    ctx2.lineJoin = 'round';
    ctx2.lineCap = 'round';
    ctx2.lineWidth = thick + 3;
    ctx2.strokeStyle = 'rgba(34,230,255,0.28)';
    ctx2.stroke();
    ctx2.lineWidth = thick;
    ctx2.strokeStyle = '#22e6ff';
    ctx2.stroke();

    ctx2.beginPath();
    ctx2.arc(mx(pts[0]), my(pts[0]), thick + 1.5, 0, Math.PI * 2);
    ctx2.fillStyle = 'rgba(255,255,255,0.9)';
    ctx2.fill();

    if (dotAt !== undefined && dotAt !== null) {
      var best = pts[0];
      for (i = 0; i < pts.length; i++) {
        if (Math.abs(pts[i].f - dotAt) < Math.abs(best.f - dotAt)) best = pts[i];
      }
      ctx2.beginPath();
      ctx2.arc(mx(best), my(best), thick + 4, 0, Math.PI * 2);
      ctx2.fillStyle = '#ff4b3a';
      ctx2.shadowColor = '#ff4b3a';
      ctx2.shadowBlur = 12;
      ctx2.fill();
      ctx2.shadowBlur = 0;
    }
  }

  // Six circuits now, so the cards are compact: a small map on the left,
  // name, character and target lap on the right.
  var CARD_H = 146, CARD_PITCH = 160;
  function cardBox(i) { return { x: 48, y: 244 + i * CARD_PITCH, w: 624, h: CARD_H }; }
  function trackOpen(i) { return DR.Story.trackUnlocked(i); }
  // Centred on the screen rather than pinned to the top, so the list looks
  // deliberate whether it holds two modes or five.
  var MODE_H = 156, MODE_GAP = 30;
  function modeBox(i) {
    var pitch = MODE_H + MODE_GAP;
    var top = 660 - (MODES.length * pitch - MODE_GAP) * 0.5;
    return { x: 64, y: top + i * pitch, w: 592, h: MODE_H };
  }

  // Draw text at the biggest size that still fits `maxW`, down to a floor.
  function fitText(ctx2, text, x, y, maxW, size, weight, family) {
    var px2 = size;
    while (px2 > 18) {
      ctx2.font = weight + ' ' + px2 + 'px ' + family;
      if (ctx2.measureText(text).width <= maxW) break;
      px2 -= 2;
    }
    ctx2.fillText(text, x, y);
  }

  function inBox(lx, ly, b) {
    return lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h;
  }

  function drawButton(ctx2, b, text) {
    ctx2.fillStyle = 'rgba(10,8,24,0.62)';
    ctx2.fillRect(b.x, b.y, b.w, b.h);
    ctx2.lineWidth = 1.5;
    ctx2.strokeStyle = 'rgba(150,196,225,0.40)';
    ctx2.strokeRect(b.x, b.y, b.w, b.h);
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.font = '700 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(214,234,248,0.92)';
    ctx2.fillText(text, b.x + b.w * 0.5, b.y + b.h * 0.5 + 1);
    ctx2.textAlign = 'left';
    ctx2.textBaseline = 'alphabetic';
  }

  // One quiet line naming both ways in. Someone on a laptop has no way to
  // guess that the arrow keys work, and someone on a phone has no keyboard to
  // be confused by — so saying both costs nothing and answers the question.
  function drawControlsLine(ctx2, v, y) {
    ctx2.textAlign = 'center';
    ctx2.font = '600 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.62)';
    ctx2.fillText('TAP    \u2022    or  \u2190 \u2192  and  SPACE', v.W * 0.5, y);
    ctx2.textAlign = 'left';
  }

  // Same pitch/centring math as modeBox, generalised over how many rows there
  // are — Title has 3, Modes has 4, and neither should have to know the other
  // exists.
  function vBoxAt(i, count, rowH, gap) {
    var pitch = rowH + gap;
    var top = 660 - (count * pitch - gap) * 0.5;
    return { x: 64, y: top + i * pitch, w: 592, h: rowH };
  }

  var TITLE_ROW_H = 150, TITLE_GAP = 34;
  function titleBox(i) { return vBoxAt(i, TITLE_ITEMS.length, TITLE_ROW_H, TITLE_GAP); }

  function drawTitle(ctx2, v) {
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 78px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('DRIFT RUN', v.W * 0.5, 190);
    ctx2.font = '700 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,214,236,0.8)';
    ctx2.fillText('THE CIRCUIT', v.W * 0.5, 232);

    for (var i = 0; i < TITLE_ITEMS.length; i++) {
      var it = TITLE_ITEMS[i], b = titleBox(i), on = i === titleSel;
      ctx2.globalAlpha = it.ready ? 1 : 0.55;
      ctx2.fillStyle = on ? 'rgba(34,120,150,0.28)' : 'rgba(10,8,24,0.55)';
      ctx2.fillRect(b.x, b.y, b.w, b.h);
      ctx2.lineWidth = on ? 3 : 1.5;
      ctx2.strokeStyle = on ? '#41e0ff' : 'rgba(150,196,225,0.35)';
      ctx2.strokeRect(b.x, b.y, b.w, b.h);

      ctx2.textAlign = 'left';
      ctx2.fillStyle = on ? '#eaf6ff' : 'rgba(226,240,250,0.8)';
      fitText(ctx2, it.name, b.x + 30, b.y + b.h * 0.5 + 14, 340, 46, '800',
              'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');

      ctx2.textAlign = 'right';
      ctx2.font = '700 21px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      if (!it.ready) {
        ctx2.fillStyle = 'rgba(190,214,235,0.5)';
        ctx2.fillText('COMING SOON', b.x + b.w - 26, b.y + b.h * 0.5 + 7);
      } else {
        var fresh = it.id === 'tutorial' && !DR.Save.isUnlocked(TUTORIAL_ID);
        ctx2.fillStyle = on || fresh ? '#ffd76a' : 'rgba(190,214,235,0.45)';
        ctx2.fillText(on ? 'TAP AGAIN ▸' : (fresh ? 'NEW? START HERE' : 'TAP TO SELECT'),
                      b.x + b.w - 26, b.y + b.h * 0.5 + 7);
      }
      ctx2.globalAlpha = 1;
    }
    drawControlsLine(ctx2, v, titleBox(TITLE_ITEMS.length - 1).y + TITLE_ROW_H + 62);
    ctx2.textAlign = 'left';
  }

  // A dead end with a name on it: STORY and GARAGE lead here until their own
  // phases build them out for real. One function for both, since right now
  // the only thing that differs is the heading.
  var GARAGE_LEFT_ARROW  = { x:  10, y: 260, w: 90, h: 380 };
  var GARAGE_RIGHT_ARROW = { x: 620, y: 260, w: 90, h: 380 };
  var GARAGE_ACTION_BTN  = { x: 110, y: 1140, w: 500, h: 64 };
  var GARAGE_TAB_BTN     = { x: 260, y: 786, w: 200, h: 34 };
  var garageTab = 'stats';   // 'stats' | 'upgrades' — reset whenever the browsed car changes
  function garageSwatchBox(i, n) {
    var sz = 48, gap = 14, total = n * sz + (n - 1) * gap;
    var left = (LOGICAL_W - total) * 0.5;
    return { x: left + i * (sz + gap), y: 1030, w: sz, h: sz };
  }
  function garageUpgradeRowBox(i) { return { x: 40, y: 830 + i * 72, w: 640, h: 64 }; }
  function garageUpgradeBtnBox(i) {
    var r = garageUpgradeRowBox(i);
    return { x: r.x + r.w - 190, y: r.y + 8, w: 190, h: 48 };
  }

  function garageStep(dir) {
    var n = DR.Cars.roster().length;
    garageSel = ((garageSel + dir) % n + n) % n;
    garageTab = 'stats';
  }

  // Buying just calls Save.buyCar honestly — it fails quietly if currency is
  // short, which right now it always is except for the starter car. That is
  // deliberate: this code does not need to change when Phase 3 gives races a
  // payout, it will simply start working.
  function garageAction() {
    var def = DR.Cars.roster()[garageSel];
    if (DR.Save.selectedCar() === def.id) return;
    if (DR.Save.ownsCar(def.id)) {
      DR.Save.selectCar(def.id);
    } else if (def.cost !== null) {
      DR.Save.buyCar(def.id, def.cost);
      if (DR.Save.ownsCar(def.id)) DR.Save.selectCar(def.id);
    }
  }

  function garageBuyUpgrade(systemId) {
    var def = DR.Cars.roster()[garageSel];
    if (!DR.Save.ownsCar(def.id)) return;
    if (!DR.Cars.buyUpgrade(def.id, systemId)) return;
    // Only refreshes the shared physics state if the car being upgraded is
    // the one actually selected to race — browsing another owned car's
    // upgrades shouldn't touch what's currently loaded into car.js/game.js.
    if (DR.Save.selectedCar() === def.id) DR.Cars.applyToCar(def.id);
  }

  function garagePickColor(color) {
    var def = DR.Cars.roster()[garageSel];
    if (!DR.Save.ownsCar(def.id)) return;
    DR.Save.setCarColor(def.id, color);
    garagePreviewFor = null;   // ensureGaragePreview re-applies it next frame
  }

  function drawGarageArrow(ctx2, b, dir) {
    var cx = b.x + b.w * 0.5, cy = b.y + b.h * 0.5, s = 22;
    ctx2.globalAlpha = 0.55;
    ctx2.beginPath();
    ctx2.moveTo(cx - s * 0.5 * dir, cy - s);
    ctx2.lineTo(cx + s * 0.5 * dir, cy);
    ctx2.lineTo(cx - s * 0.5 * dir, cy + s);
    ctx2.lineWidth = 6; ctx2.lineJoin = 'round'; ctx2.lineCap = 'round';
    ctx2.strokeStyle = '#eaf6ff';
    ctx2.stroke();
    ctx2.globalAlpha = 1;
  }

  var GARAGE_STAT_ROWS = [['SPEED', 'speed'], ['GRIP', 'grip'],
                           ['HANDLING', 'handling'], ['BOOST', 'boost']];

  function drawGarage(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var def = ensureGaragePreview();
    var owned = DR.Save.ownsCar(def.id);
    var isSelected = DR.Save.selectedCar() === def.id;
    var i;

    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('GARAGE', v.W * 0.5, 118);

    ctx2.textAlign = 'right';
    ctx2.font = '700 22px ' + MONO;
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText(DR.Save.currency().toLocaleString() + ' CR', v.W - 24, 44);
    ctx2.textAlign = 'center';

    // One dot per car, so browsing the roster shows its own progress.
    var n = DR.Cars.roster().length, dotGap = 22, dx = v.W * 0.5 - (n - 1) * dotGap * 0.5;
    for (i = 0; i < n; i++) {
      ctx2.beginPath();
      ctx2.arc(dx + i * dotGap, 150, i === garageSel ? 5 : 3.5, 0, Math.PI * 2);
      ctx2.fillStyle = i === garageSel ? '#41e0ff' : 'rgba(150,196,225,0.35)';
      ctx2.fill();
    }

    // The car itself, turning slowly, in its real colours — a real WebGL
    // model (car3d.js) on a transparent canvas laid over this one, with the
    // hand-rolled Canvas 2D car (car.js) kept only as the fallback for a
    // device that can't do WebGL. The in-race car is untouched either way.
    _garagePreview.bodyYaw = 0.55 + Math.sin(clock * 0.45) * 0.18;
    var previewColor = DR.Save.carColor(def.id) || def.color;
    var drew3D = DR.Car3D && DR.Car3D.render({ archetype: def.archetype, color: previewColor, yaw: _garagePreview.bodyYaw });
    if (!drew3D) {
      ctx2.save();
      ctx2.translate(0, -GARAGE_PREVIEW_SHIFT_Y);
      DR.Car.drawStatic(ctx2, v, _garagePreview);
      ctx2.restore();
    }
    drawGarageArrow(ctx2, GARAGE_LEFT_ARROW, -1);
    drawGarageArrow(ctx2, GARAGE_RIGHT_ARROW, 1);

    ctx2.font = '800 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#eaf6ff';
    fitText(ctx2, def.name, v.W * 0.5, 705, 560, 44, '800',
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');

    ctx2.font = '700 20px ' + MONO;
    ctx2.fillStyle = '#7dffb0';
    ctx2.fillText(def.archetype.toUpperCase(), v.W * 0.5, 738);

    ctx2.font = '500 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,206,226,0.85)';
    ctx2.fillText(def.blurb, v.W * 0.5, 768);

    // Browsing an owned car can look at either its stats or its upgrades —
    // a locked car has no upgrades to show yet, so it only ever gets the
    // stats view, and the toggle itself doesn't appear.
    if (owned) drawButton(ctx2, GARAGE_TAB_BTN, garageTab === 'stats' ? 'UPGRADES ▸' : '◂ STATS');

    if (garageTab === 'upgrades' && owned) {
      drawGarageUpgrades(ctx2, def);
    } else {
      // Four stat bars, always shown relative to the rest of the roster —
      // the numbers behind them are cars.js's (stock plus any upgrades
      // already bought), this just draws whatever it says.
      var barX = 180, barW = 420, rowY = 830, rowH = 40;
      ctx2.textAlign = 'left';
      for (i = 0; i < GARAGE_STAT_ROWS.length; i++) {
        var y = rowY + i * rowH;
        ctx2.font = '700 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx2.fillStyle = 'rgba(180,206,226,0.85)';
        ctx2.fillText(GARAGE_STAT_ROWS[i][0], 60, y + 14);
        ctx2.fillStyle = 'rgba(255,255,255,0.12)';
        ctx2.fillRect(barX, y, barW, 10);
        ctx2.fillStyle = isSelected ? '#41e0ff' : '#7dffb0';
        ctx2.fillRect(barX, y, barW * DR.Cars.statFrac(def, GARAGE_STAT_ROWS[i][1]), 10);
      }

      // Recolouring only makes sense for a car you actually have.
      if (owned) {
        var pal = DR.Cars.palette();
        var curColor = (DR.Save.carColor(def.id) || def.color).toLowerCase();
        for (i = 0; i < pal.length; i++) {
          var b = garageSwatchBox(i, pal.length);
          var on = pal[i].toLowerCase() === curColor;
          ctx2.fillStyle = pal[i];
          ctx2.fillRect(b.x, b.y, b.w, b.h);
          ctx2.lineWidth = on ? 3 : 1;
          ctx2.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.35)';
          ctx2.strokeRect(b.x, b.y, b.w, b.h);
        }
      }
    }

    var label = isSelected ? 'SELECTED'
              : owned ? 'TAP TO SELECT'
              : def.cost === null ? (def.unlock || 'STORY REWARD ONLY')
              : 'LOCKED — ' + def.cost + ' CR';
    drawButton(ctx2, GARAGE_ACTION_BTN, label);

    ctx2.textAlign = 'left';
    drawButton(ctx2, BACK_BTN, '◂ BACK');
  }

  // Four rows, one per upgrade system — every car is upgradable to the same
  // max tier, at a cost scaled off its own price, so a cheap car costs less
  // to fully max than an expensive one, same as buying it in the first
  // place did.
  function drawGarageUpgrades(ctx2, def) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var systems = DR.Cars.upgradeSystems();
    for (var i = 0; i < systems.length; i++) {
      var sys = systems[i], r = garageUpgradeRowBox(i);
      var tier = DR.Save.upgradeLevel(def.id, sys.id);
      var maxed = DR.Cars.upgradeMaxed(def.id, sys.id);

      ctx2.textAlign = 'left';
      ctx2.font = '700 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = 'rgba(226,240,250,0.92)';
      ctx2.fillText(sys.name, r.x, r.y + 26);

      // Tier pips: filled dots for what's already bought, hollow for what
      // isn't — the same "progress at a glance" idea as the roster dots.
      for (var t = 0; t < DR.Cars.MAX_TIER; t++) {
        ctx2.beginPath();
        ctx2.arc(r.x + 10 + t * 22, r.y + 48, 6, 0, Math.PI * 2);
        ctx2.fillStyle = t < tier ? '#7dffb0' : 'rgba(150,196,225,0.30)';
        ctx2.fill();
      }

      var b = garageUpgradeBtnBox(i);
      var btnLabel = maxed ? 'MAXED' : DR.Cars.tierCost(def, tier + 1) + ' CR';
      ctx2.fillStyle = maxed ? 'rgba(255,255,255,0.06)' : 'rgba(10,8,24,0.62)';
      ctx2.fillRect(b.x, b.y, b.w, b.h);
      ctx2.lineWidth = 1.5;
      ctx2.strokeStyle = maxed ? 'rgba(150,196,225,0.20)' : 'rgba(150,196,225,0.40)';
      ctx2.strokeRect(b.x, b.y, b.w, b.h);
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.font = '700 20px ' + MONO;
      ctx2.fillStyle = maxed ? 'rgba(190,214,235,0.5)' : '#ffd76a';
      ctx2.fillText(btnLabel, b.x + b.w * 0.5, b.y + b.h * 0.5 + 1);
      ctx2.textBaseline = 'alphabetic';
    }
  }

  function drawComingSoon(ctx2, v, heading, blurb) {
    // Below the horizon and the sun's halo (which sits centred on it), on the
    // plain grid, so the text never fights the artwork behind it.
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 56px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText(heading, v.W * 0.5, 720);
    ctx2.font = '600 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,214,236,0.85)';
    ctx2.fillText(blurb, v.W * 0.5, 766);
    ctx2.textAlign = 'left';
    drawButton(ctx2, BACK_BTN, '◂ BACK');
  }

  // ---------------------------------------------------------------- STORY UI

  function storyRowBox(i) { return { x: 40, y: 214 + i * 100, w: 640, h: 90 }; }
  function cityEventBox(i) { return { x: 40, y: 336 + i * 162, w: 640, h: 148 }; }
  var CITY_GARAGE_BTN = { x: 40, y: 1164, w: 300, h: 64 };
  var DONE_RETRY_BTN  = { x: 60, y: 1120, w: 280, h: 74 };
  var DONE_CONT_BTN   = { x: 380, y: 1120, w: 280, h: 74 };

  // Words wrapped to a width, for the one or two lines of city flavour.
  function wrapText(ctx2, text, x, y, maxW, lineH) {
    var words = text.split(' '), line = '', n = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx2.measureText(test).width > maxW && line) {
        ctx2.fillText(line, x, y + n * lineH); n++; line = words[i];
      } else line = test;
    }
    if (line) ctx2.fillText(line, x, y + n * lineH);
  }

  function drawCurrency(ctx2, v) {
    ctx2.textAlign = 'right';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '700 22px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText(DR.Save.currency().toLocaleString() + ' CR', v.W - 24, 44);
  }

  /* The map: all ten cities in order. Every row says in words whether it's
     open, how much of it is cleared, and what its boss pays — so the state
     of the championship is readable without knowing what the colours mean. */
  function drawStory(ctx2, v) {
    var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    var cities = DR.Story.cities(), i;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 52px ' + SANS;
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('THE CIRCUIT', v.W * 0.5, 146);
    ctx2.font = '700 22px ' + SANS;
    ctx2.fillStyle = 'rgba(180,214,236,0.85)';
    ctx2.fillText('TEN CITIES  •  TEN BOSSES  •  ONE CHAMPION', v.W * 0.5, 186);

    for (i = 0; i < cities.length; i++) {
      var c = cities[i], b = storyRowBox(i), st = DR.Story.cityState(i), on = i === storySel;
      ctx2.globalAlpha = st.unlocked ? 1 : 0.5;
      ctx2.fillStyle = on ? 'rgba(34,120,150,0.30)' : 'rgba(10,8,24,0.62)';
      ctx2.fillRect(b.x, b.y, b.w, b.h);
      ctx2.lineWidth = on ? 3 : 1.5;
      ctx2.strokeStyle = on ? '#41e0ff' : 'rgba(150,196,225,0.32)';
      ctx2.strokeRect(b.x, b.y, b.w, b.h);

      ctx2.textAlign = 'center';
      ctx2.font = '800 34px ' + SANS;
      ctx2.fillStyle = st.bossBeaten ? '#7dffb0' : '#eaf6ff';
      ctx2.fillText(String(i + 1), b.x + 36, b.y + 58);

      ctx2.textAlign = 'left';
      ctx2.fillStyle = on ? '#eaf6ff' : 'rgba(226,240,250,0.9)';
      fitText(ctx2, c.name, b.x + 76, b.y + 42, 330, 30, '800', SANS);
      ctx2.font = '600 18px ' + SANS;
      ctx2.fillStyle = 'rgba(180,206,226,0.85)';
      var sub = !st.unlocked ? 'LOCKED — BEAT ' + cities[i - 1].boss
              : st.bossBeaten ? 'BOSS BEATEN  •  ' + st.cleared + '/' + st.total + ' CLEARED'
              : 'BOSS: ' + c.boss + '  •  ' + st.cleared + '/' + st.total + ' CLEARED';
      ctx2.fillText(sub, b.x + 76, b.y + 72);

      ctx2.textAlign = 'right';
      ctx2.font = '700 17px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx2.fillStyle = c.reward.car ? '#ffd76a' : 'rgba(125,255,176,0.9)';
      ctx2.fillText(c.reward.car ? 'PRIZE: CAR' : 'PRIZE: CASH', b.x + b.w - 20, b.y + 38);
      ctx2.font = '700 18px ' + SANS;
      ctx2.fillStyle = st.bossBeaten ? '#7dffb0' : (st.unlocked ? (on ? '#ffd76a' : 'rgba(190,214,235,0.6)') : 'rgba(190,214,235,0.5)');
      ctx2.fillText(st.bossBeaten ? 'DONE ✓' : (!st.unlocked ? 'LOCKED' : (on ? 'TAP AGAIN ▸' : 'OPEN')),
                    b.x + b.w - 20, b.y + 70);
      ctx2.globalAlpha = 1;
    }
    drawCurrency(ctx2, v);
    ctx2.textAlign = 'left';
    drawButton(ctx2, BACK_BTN, '◂ TITLE');
  }

  function bestText(ci, ei) {
    var id = DR.Story.eventId(ci, ei), b = DR.Save.bestResult('story:' + id);
    if (!b) return '';
    var ev = DR.Story.cities()[ci].events[ei];
    return ev.type === 'race' ? 'BEST ' + ordinal(b.value) : 'BEST ' + fmt(b.value);
  }

  function drawCity(ctx2, v) {
    var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var ci = storySel, c = DR.Story.cities()[ci], i;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '700 18px ' + SANS;
    ctx2.fillStyle = 'rgba(180,214,236,0.8)';
    ctx2.fillText('CITY ' + (ci + 1) + ' OF 10', v.W * 0.5, 118);
    ctx2.fillStyle = '#ffd76a';
    fitText(ctx2, c.name, v.W * 0.5, 170, 600, 54, '800', SANS);
    ctx2.font = '700 22px ' + SANS;
    ctx2.fillStyle = '#eaf6ff';
    ctx2.fillText('BOSS: ' + c.boss, v.W * 0.5, 206);
    ctx2.font = '500 21px ' + SANS;
    ctx2.fillStyle = 'rgba(190,214,235,0.9)';
    wrapText(ctx2, c.intro, v.W * 0.5, 242, 620, 27);
    ctx2.font = '600 18px ' + SANS;
    ctx2.fillStyle = 'rgba(125,255,176,0.85)';
    ctx2.fillText('RECOMMENDED: ' + c.spec, v.W * 0.5, 312);

    var ev = c.events;
    for (i = 0; i < ev.length; i++) {
      var b = cityEventBox(i), st = DR.Story.setup(ci, i), on = i === citySel;
      var locked = DR.Story.eventLocked(ci, i), done = DR.Story.cleared(ci, i);
      var boss = ev[i].type === 'boss';
      ctx2.globalAlpha = locked ? 0.5 : 1;
      ctx2.fillStyle = on ? 'rgba(34,120,150,0.30)' : (boss ? 'rgba(60,40,10,0.55)' : 'rgba(10,8,24,0.62)');
      ctx2.fillRect(b.x, b.y, b.w, b.h);
      ctx2.lineWidth = on ? 3 : 1.5;
      ctx2.strokeStyle = on ? '#41e0ff' : (boss ? 'rgba(255,215,106,0.55)' : 'rgba(150,196,225,0.32)');
      ctx2.strokeRect(b.x, b.y, b.w, b.h);

      ctx2.textAlign = 'left';
      ctx2.font = '800 30px ' + SANS;
      ctx2.fillStyle = boss ? '#ffd76a' : '#eaf6ff';
      ctx2.fillText(st.label, b.x + 24, b.y + 44);
      ctx2.font = '600 20px ' + SANS;
      ctx2.fillStyle = 'rgba(200,222,240,0.92)';
      ctx2.fillText(st.requirement, b.x + 24, b.y + 82);
      ctx2.font = '700 19px ' + MONO;
      ctx2.fillStyle = '#7dffb0';
      ctx2.fillText(st.reward, b.x + 24, b.y + 118);

      ctx2.textAlign = 'right';
      ctx2.font = '800 20px ' + SANS;
      var status = done ? 'CLEARED ✓' : locked ? 'LOCKED' : on ? 'TAP AGAIN ▸' : 'TAP TO SELECT';
      ctx2.fillStyle = done ? '#7dffb0' : locked ? 'rgba(190,214,235,0.6)' : (on ? '#ffd76a' : 'rgba(190,214,235,0.6)');
      ctx2.fillText(status, b.x + b.w - 22, b.y + 44);
      ctx2.font = '600 17px ' + SANS;
      ctx2.fillStyle = 'rgba(190,214,235,0.75)';
      if (locked && boss) ctx2.fillText('CLEAR THE OTHERS FIRST', b.x + b.w - 22, b.y + 82);
      else ctx2.fillText(bestText(ci, i), b.x + b.w - 22, b.y + 82);
      ctx2.globalAlpha = 1;
    }

    // What you're driving, and where to go to make it quicker.
    var car = DR.Cars.get(DR.Save.selectedCar());
    ctx2.textAlign = 'left';
    ctx2.font = '600 19px ' + SANS;
    ctx2.fillStyle = 'rgba(180,206,226,0.85)';
    ctx2.fillText('CIRCUIT: ' + DR.Road.tracks()[c.track].name, 40, 1000);
    ctx2.fillText('DRIVING: ' + (car ? car.name.toUpperCase() : ''), 40, 1030);
    drawButton(ctx2, CITY_GARAGE_BTN, 'GARAGE ▸');
    drawCurrency(ctx2, v);
    ctx2.textAlign = 'left';
    drawButton(ctx2, BACK_BTN, '◂ MAP');
  }

  // A time attack's own read-out: the target, and how much of it is left.
  // "LEFT" and "OVER" are written out, not just coloured.
  function drawTimeHud(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var used = timing ? raceTotal + lapTimer : 0;
    var left = timeTarget - used;
    var cx2 = v.W * 0.5;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '700 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.85)';
    ctx2.fillText('TARGET ' + fmt(timeTarget), cx2, 70);
    ctx2.font = '800 50px ' + MONO;
    ctx2.lineWidth = 7;
    ctx2.strokeStyle = 'rgba(4,2,10,0.88)';
    var txt = left >= 0 ? fmt(left) : '+' + fmt(-left);
    ctx2.strokeText(txt, cx2, 124);
    ctx2.fillStyle = left >= 0 ? '#eaf6ff' : '#ff8a6a';
    ctx2.fillText(txt, cx2, 124);
    ctx2.font = '800 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = left >= 0 ? '#7dffb0' : '#ff8a6a';
    ctx2.fillText(left >= 0 ? 'LEFT' : 'OVER', cx2, 148);
    ctx2.textAlign = 'left';
  }

  function drawTimeDone(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    var ok = raceTotal <= timeTarget;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 64px ' + SANS;
    ctx2.fillStyle = ok ? '#ffd76a' : '#eaf6ff';
    ctx2.fillText(ok ? 'TARGET BEATEN' : 'TOO SLOW', v.W * 0.5, 280);
    ctx2.font = '700 24px ' + SANS;
    ctx2.fillStyle = 'rgba(180,214,236,0.9)';
    ctx2.fillText(resultsSubtitle(), v.W * 0.5, 322);
    ctx2.font = '800 80px ' + MONO;
    ctx2.fillStyle = '#eaf6ff';
    ctx2.fillText(fmt(raceTotal), v.W * 0.5, 430);
    ctx2.font = '700 26px ' + MONO;
    ctx2.fillStyle = ok ? '#7dffb0' : '#ff8a6a';
    ctx2.fillText('TARGET ' + fmt(timeTarget), v.W * 0.5, 474);
    for (var i = 0; i < lapTimes.length; i++) {
      ctx2.font = '700 26px ' + MONO;
      ctx2.fillStyle = 'rgba(228,242,252,0.9)';
      ctx2.fillText('LAP ' + (i + 1) + '   ' + fmt(lapTimes[i]), v.W * 0.5, 540 + i * 40);
    }
    drawResultsFooter(ctx2, v, 560 + lapTimes.length * 40 + 30);
  }

  function drawModes(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 74px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('DRIFT RUN', v.W * 0.5, 180);
    ctx2.font = '700 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,214,236,0.9)';
    ctx2.fillText('CHOOSE A MODE', v.W * 0.5, 226);

    for (var i = 0; i < MODES.length; i++) {
      var b = modeBox(i), on = i === modeSel;
      ctx2.fillStyle = on ? 'rgba(34,120,150,0.28)' : 'rgba(10,8,24,0.55)';
      ctx2.fillRect(b.x, b.y, b.w, b.h);
      ctx2.lineWidth = on ? 3 : 1.5;
      ctx2.strokeStyle = on ? '#41e0ff' : 'rgba(150,196,225,0.35)';
      ctx2.strokeRect(b.x, b.y, b.w, b.h);

      ctx2.textAlign = 'left';
      // Shrunk to fit rather than trusting every mode name to be short. The
      // first long one, CHECKPOINT RUSH, ran straight through its own
      // "TAP TO SELECT" label.
      ctx2.fillStyle = on ? '#eaf6ff' : 'rgba(226,240,250,0.8)';
      fitText(ctx2, MODES[i].name, b.x + 30, b.y + 58, 358, 40, '800', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');

      ctx2.font = '700 20px ' + MONO;
      ctx2.fillStyle = on ? '#7dffb0' : 'rgba(125,255,176,0.55)';
      ctx2.fillText(MODES[i].tag, b.x + 30, b.y + 92);

      ctx2.font = '500 21px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = 'rgba(180,206,226,0.85)';
      ctx2.fillText(MODES[i].blurb, b.x + 30, b.y + 126);

      ctx2.textAlign = 'right';
      ctx2.font = '700 21px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = on ? '#ffd76a' : 'rgba(190,214,235,0.45)';
      ctx2.fillText(on ? 'TAP AGAIN \u25B8' : 'TAP TO SELECT', b.x + b.w - 26, b.y + 58);
    }
    drawControlsLine(ctx2, v, modeBox(MODES.length - 1).y + MODE_H + 62);
    ctx2.textAlign = 'left';
  }

  // A locked card says so with a shape and words, never just by being dim.
  function drawPadlock(ctx2, x, y) {
    ctx2.lineWidth = 4;
    ctx2.strokeStyle = '#ffb24d';
    ctx2.beginPath();
    ctx2.arc(x, y - 6, 11, Math.PI, 0);
    ctx2.stroke();
    ctx2.fillStyle = '#ffb24d';
    ctx2.fillRect(x - 16, y - 6, 32, 24);
  }

  function drawSelect(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var tracks = DR.Road.tracks(), i;

    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 74px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('DRIFT RUN', v.W * 0.5, 168);
    ctx2.font = '700 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,214,236,0.9)';
    var sub = mode === 'practice' ? 'CHOOSE YOUR CIRCUIT'
            : mode === 'rush' ? 'CHOOSE YOUR CIRCUIT  \u2022  BEAT THE CLOCK'
            : 'CHOOSE YOUR CIRCUIT  \u2022  ' + lapsFor(mode) + ' LAPS';
    ctx2.fillText(sub, v.W * 0.5, 212);

    for (i = 0; i < tracks.length; i++) {
      var b = cardBox(i), on = i === selected, open = trackOpen(i);
      ctx2.globalAlpha = open ? 1 : 0.55;
      ctx2.fillStyle = on ? 'rgba(34,120,150,0.28)' : 'rgba(10,8,24,0.55)';
      ctx2.fillRect(b.x, b.y, b.w, b.h);
      ctx2.lineWidth = on ? 3 : 1.5;
      ctx2.strokeStyle = on ? '#41e0ff' : 'rgba(150,196,225,0.35)';
      ctx2.strokeRect(b.x, b.y, b.w, b.h);

      drawOutline(ctx2, { x: b.x + 10, y: b.y + 10, w: 126, h: 126 }, i, null, 2);

      var tx = b.x + 152;
      ctx2.textAlign = 'left';
      ctx2.fillStyle = on ? '#eaf6ff' : 'rgba(226,240,250,0.8)';
      fitText(ctx2, tracks[i].name, tx, b.y + 46, 300, 30, '800',
              'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');

      // What a clean lap here is worth, so the circuits read as different
      // lengths rather than just different shapes.
      ctx2.font = '700 19px ' + MONO;
      ctx2.fillStyle = on ? '#7dffb0' : 'rgba(125,255,176,0.6)';
      ctx2.fillText(tracks[i].tag, tx, b.y + 82);
      ctx2.fillStyle = on ? 'rgba(255,215,106,0.9)' : 'rgba(190,214,235,0.5)';
      ctx2.fillText('TARGET ' + tracks[i].targetSecs + 's', tx + 150, b.y + 82);

      ctx2.fillStyle = open ? 'rgba(180,206,226,0.85)' : '#ffb24d';
      fitText(ctx2, open ? tracks[i].blurb : DR.Story.trackLockText(i), tx, b.y + 120, 450, 21, '600',
              'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');

      ctx2.textAlign = 'right';
      ctx2.font = '700 19px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      if (!open) {
        drawPadlock(ctx2, b.x + b.w - 34, b.y + 40);
      } else {
        ctx2.fillStyle = on ? '#ffd76a' : 'rgba(190,214,235,0.5)';
        ctx2.fillText(on ? 'TAP AGAIN \u25B8' : 'TAP', b.x + b.w - 18, b.y + 46);
      }
      ctx2.globalAlpha = 1;
    }
    drawControlsLine(ctx2, v, 1248);
    ctx2.textAlign = 'left';
  }

  function drawRushDone(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx2.fillStyle = 'rgba(6,4,16,0.78)';
    ctx2.fillRect(0, 0, v.W, v.H);

    ctx2.textAlign = 'center';
    ctx2.font = '800 62px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ff6a5a';
    ctx2.fillText('TIME UP', v.W * 0.5, 320);

    ctx2.font = '700 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,214,236,0.9)';
    ctx2.fillText(DR.Road.tracks()[DR.Road.currentTrack()].name, v.W * 0.5, 364);

    ctx2.font = '700 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.85)';
    ctx2.fillText('DISTANCE', v.W * 0.5, 448);
    ctx2.font = '800 96px ' + MONO;
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText(rushScore + ' m', v.W * 0.5, 540);

    var beat = rushScore >= rushBest && rushScore > 0;
    ctx2.font = '700 28px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = beat ? '#7dffb0' : 'rgba(190,214,235,0.85)';
    ctx2.fillText(beat ? 'NEW BEST' : 'BEST  ' + rushBest + ' m', v.W * 0.5, 592);

    ctx2.font = '700 26px ' + MONO;
    ctx2.fillStyle = 'rgba(228,242,252,0.9)';
    ctx2.fillText(rushGates + ' GATES', v.W * 0.5, 664);
    ctx2.fillText(rushLapsDone() + (rushLapsDone() === 1 ? ' LAP' : ' LAPS'), v.W * 0.5, 706);

    ctx2.font = '700 26px ' + MONO;
    ctx2.fillStyle = '#7dffb0';
    ctx2.fillText('+' + doneAward + ' CR', v.W * 0.5, 776);

    ctx2.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('TAP TO GO AGAIN', v.W * 0.5, 860);
    ctx2.textAlign = 'left';
  }

  function drawDone(ctx2, v) {
    if (mode === 'tutorial') { drawTutorialDone(ctx2, v); return; }
    if (mode === 'rush') { drawRushDone(ctx2, v); return; }
    if (mode === 'duel') { drawDuelDone(ctx2, v); return; }
    if (mode === 'time') {
      ctx2.fillStyle = 'rgba(6,4,16,0.78)';
      ctx2.fillRect(0, 0, v.W, v.H);
      drawTimeDone(ctx2, v);
      return;
    }
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx2.fillStyle = 'rgba(6,4,16,0.74)';
    ctx2.fillRect(0, 0, v.W, v.H);

    if (standings) { drawStandings(ctx2, v); return; }

    ctx2.textAlign = 'center';
    ctx2.font = '800 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('RACE COMPLETE', v.W * 0.5, 300);

    ctx2.font = '700 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,214,236,0.9)';
    ctx2.fillText(DR.Road.tracks()[DR.Road.currentTrack()].name, v.W * 0.5, 344);

    ctx2.font = '700 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.85)';
    ctx2.fillText('TOTAL', v.W * 0.5, 420);
    ctx2.font = '800 86px ' + MONO;
    ctx2.fillStyle = '#eaf6ff';
    ctx2.fillText(fmt(raceTotal), v.W * 0.5, 500);

    var best = lapTimes.length ? Math.min.apply(null, lapTimes) : 0;
    for (var i = 0; i < lapTimes.length; i++) {
      var y = 600 + i * 62, isBest = lapTimes[i] === best;
      ctx2.textAlign = 'right';
      ctx2.font = '700 28px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = 'rgba(150,196,225,0.8)';
      ctx2.fillText('LAP ' + (i + 1), v.W * 0.5 - 24, y);
      ctx2.textAlign = 'left';
      ctx2.font = '700 34px ' + MONO;
      ctx2.fillStyle = isBest ? '#7dffb0' : 'rgba(228,242,252,0.92)';
      ctx2.fillText(fmt(lapTimes[i]), v.W * 0.5 + 8, y);
      if (isBest) {
        ctx2.font = '700 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx2.fillStyle = '#7dffb0';
        ctx2.fillText('BEST', v.W * 0.5 + 176, y);
      }
    }

    ctx2.textAlign = 'center';
    ctx2.font = '700 26px ' + MONO;
    ctx2.fillStyle = '#7dffb0';
    ctx2.fillText('+' + doneAward + ' CR', v.W * 0.5, 820);

    ctx2.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('TAP TO RACE AGAIN', v.W * 0.5, 880);
    ctx2.textAlign = 'left';
  }

  /* A race against rivals ends on where you finished, then the whole field.
     Rival times are shown as a gap to yours, which is the number that
     actually means something; a rival still out on track when you crossed
     the line is marked as an estimate rather than pretending it's final. */
  function drawStandings(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var cx2 = v.W * 0.5, i, me = null;
    for (i = 0; i < standings.length; i++) if (standings[i].isPlayer) me = standings[i];

    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 70px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = finishPos === 1 ? '#ffd76a' : '#eaf6ff';
    ctx2.fillText(ordinal(finishPos) + ' PLACE', cx2, 270);
    ctx2.font = '700 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,214,236,0.9)';
    ctx2.fillText(resultsSubtitle(), cx2, 312);

    ctx2.font = '800 52px ' + MONO;
    ctx2.fillStyle = '#eaf6ff';
    ctx2.fillText(fmt(raceTotal), cx2, 388);
    if (lapTimes.length) {
      ctx2.font = '700 22px ' + MONO;
      ctx2.fillStyle = '#7dffb0';
      ctx2.fillText('BEST LAP  ' + fmt(Math.min.apply(null, lapTimes)), cx2, 424);
    }

    var top = 470, rowH = 62, x0 = 70, w = v.W - 140;
    for (i = 0; i < standings.length; i++) {
      var r = standings[i], y = top + i * rowH;
      ctx2.fillStyle = r.isPlayer ? 'rgba(34,120,150,0.30)' : 'rgba(10,8,24,0.55)';
      ctx2.fillRect(x0, y, w, rowH - 8);
      if (r.isPlayer) {
        ctx2.lineWidth = 2;
        ctx2.strokeStyle = '#41e0ff';
        ctx2.strokeRect(x0, y, w, rowH - 8);
      }
      var mid = y + (rowH - 8) * 0.5 + 9;
      ctx2.textAlign = 'left';
      ctx2.font = '800 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = 'rgba(190,214,235,0.9)';
      ctx2.fillText(ordinal(i + 1), x0 + 18, mid);
      ctx2.beginPath();
      ctx2.arc(x0 + 104, mid - 9, 9, 0, Math.PI * 2);
      ctx2.fillStyle = r.color;
      ctx2.fill();
      ctx2.font = '800 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = r.isPlayer ? '#eaf6ff' : (r.boss ? '#ffd76a' : 'rgba(226,240,250,0.85)');
      ctx2.fillText(r.name, x0 + 126, mid);
      ctx2.textAlign = 'right';
      ctx2.font = '700 24px ' + MONO;
      var gap = r.time - me.time;
      var label = r.isPlayer ? 'YOU'
                : (r.estimated ? '~' : '') + (gap >= 0 ? '+' : '−') + Math.abs(gap).toFixed(2);
      ctx2.fillStyle = r.isPlayer ? '#ffd76a' : (gap >= 0 ? 'rgba(190,214,235,0.85)' : '#ff9a7a');
      ctx2.fillText(label, x0 + w - 18, mid);
    }

    ctx2.textAlign = 'center';
    var below = top + standings.length * rowH + 40;
    drawResultsFooter(ctx2, v, below);
    ctx2.textAlign = 'left';
  }

  function resultsSubtitle() {
    if (storyEvent) {
      return DR.Story.cities()[storyEvent.city].name + '  •  ' + storyEvent.label;
    }
    return DR.Road.tracks()[DR.Road.currentTrack()].name;
  }

  // Currency earned, and the way back in. Story mode adds its own lines
  // (cleared or not, a car won, a city opened) through the same footer, so
  // every results screen reads the same way.
  function drawResultsFooter(ctx2, v, y) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.textAlign = 'center';
    if (storyResult) {
      for (var i = 0; i < storyResult.lines.length; i++) {
        var first = i === 0;
        ctx2.font = (first ? '800 28px ' : '700 24px ') + SANS;
        ctx2.fillStyle = first ? (storyResult.ok ? '#7dffb0' : '#ffb24d') : '#ffd76a';
        fitText(ctx2, storyResult.lines[i], v.W * 0.5, y + i * 38, 640, first ? 28 : 24,
                first ? '800' : '700', SANS);
      }
      y += storyResult.lines.length * 38 + 16;
    }
    ctx2.font = '700 28px ' + MONO;
    ctx2.fillStyle = '#7dffb0';
    ctx2.fillText('+' + doneAward + ' CR', v.W * 0.5, y);
    if (storyResult) {
      drawDoneButton(ctx2, DONE_RETRY_BTN, 'RETRY', doneSel === 0);
      drawDoneButton(ctx2, DONE_CONT_BTN, 'CONTINUE', doneSel === 1);
      return;
    }
    ctx2.font = '700 30px ' + SANS;
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('TAP TO RACE AGAIN', v.W * 0.5, Math.max(y + 70, 880));
  }

  function drawDoneButton(ctx2, b, text, on) {
    ctx2.fillStyle = on ? 'rgba(34,120,150,0.40)' : 'rgba(10,8,24,0.70)';
    ctx2.fillRect(b.x, b.y, b.w, b.h);
    ctx2.lineWidth = on ? 3 : 1.5;
    ctx2.strokeStyle = on ? '#41e0ff' : 'rgba(150,196,225,0.40)';
    ctx2.strokeRect(b.x, b.y, b.w, b.h);
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.font = '800 28px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = on ? '#ffd76a' : 'rgba(214,234,248,0.9)';
    ctx2.fillText(text, b.x + b.w * 0.5, b.y + b.h * 0.5 + 1);
    ctx2.textBaseline = 'alphabetic';
  }

  // Which room a Title door leads to. Both unbuilt rooms are still reachable
  // — they just have nothing in them yet but a name and a way back.
  function enterTitleItem(i) {
    var it = TITLE_ITEMS[i];
    if (it.id === 'quick') phase = 'modes';
    else if (it.id === 'story') { phase = 'story'; storySel = DR.Story.currentCity(); }
    else if (it.id === 'garage') {
      garageReturn = 'title';
      garageSel = rosterIndexOf(DR.Save.selectedCar());
      garagePreviewFor = null;   // force a re-check: a race may have left
                                  // car.js's shared mesh/paint state on a
                                  // different car than whatever this cache
                                  // last remembered
      phase = 'garage';
    }
    else if (it.id === 'tutorial') startTutorial();
  }

  // Menu presses. The boost button owns its own, so this only runs off-race.
  function handleMenuTap() {
    var t = DR.Input.takeTap();
    if (!t) return;
    var lx = (t.x - offX) / scale, ly = (t.y - offY) / scale;
    var i, b;
    if (phase === 'title') {
      for (i = 0; i < TITLE_ITEMS.length; i++) {
        if (inBox(lx, ly, titleBox(i))) {
          if (titleSel === i) enterTitleItem(i);
          else titleSel = i;
          return;
        }
      }
    } else if (phase === 'modes') {
      if (inBox(lx, ly, BACK_BTN)) { phase = 'title'; return; }
      for (i = 0; i < MODES.length; i++) {
        if (inBox(lx, ly, modeBox(i))) {
          if (modeSel === i) { mode = MODES[i].id; phase = 'select'; }
          else modeSel = i;
          return;
        }
      }
    } else if (phase === 'garage') {
      if (inBox(lx, ly, BACK_BTN)) { phase = garageReturn; return; }
      if (inBox(lx, ly, GARAGE_LEFT_ARROW)) { garageStep(-1); return; }
      if (inBox(lx, ly, GARAGE_RIGHT_ARROW)) { garageStep(1); return; }
      if (inBox(lx, ly, GARAGE_ACTION_BTN)) { garageAction(); return; }
      var ownedNow = DR.Save.ownsCar(DR.Cars.roster()[garageSel].id);
      if (ownedNow && inBox(lx, ly, GARAGE_TAB_BTN)) {
        garageTab = garageTab === 'stats' ? 'upgrades' : 'stats';
        return;
      }
      if (ownedNow && garageTab === 'upgrades') {
        var systems = DR.Cars.upgradeSystems();
        for (i = 0; i < systems.length; i++) {
          if (inBox(lx, ly, garageUpgradeBtnBox(i))) { garageBuyUpgrade(systems[i].id); return; }
        }
        return;
      }
      var pal = DR.Cars.palette();
      for (i = 0; i < pal.length; i++) {
        if (inBox(lx, ly, garageSwatchBox(i, pal.length))) { garagePickColor(pal[i]); return; }
      }
    } else if (phase === 'story') {
      if (inBox(lx, ly, BACK_BTN)) { phase = 'title'; return; }
      for (i = 0; i < DR.Story.cities().length; i++) {
        if (inBox(lx, ly, storyRowBox(i))) {
          if (storySel === i) enterCity(i);
          else storySel = i;
          return;
        }
      }
    } else if (phase === 'city') {
      if (inBox(lx, ly, BACK_BTN)) { phase = 'story'; return; }
      if (inBox(lx, ly, CITY_GARAGE_BTN)) { openGarage('city'); return; }
      var evs = DR.Story.cities()[storySel].events;
      for (i = 0; i < evs.length; i++) {
        if (inBox(lx, ly, cityEventBox(i))) {
          if (citySel === i) tryStoryEvent(storySel, i);
          else citySel = i;
          return;
        }
      }
    } else if (phase === 'tutorial') {
      if (inBox(lx, ly, BACK_BTN)) { phase = 'title'; return; }
    } else if (phase === 'select') {
      if (inBox(lx, ly, BACK_BTN)) { phase = 'modes'; return; }
      for (i = 0; i < DR.Road.tracks().length; i++) {
        b = cardBox(i);
        if (inBox(lx, ly, b)) {
          if (selected === i) { if (trackOpen(i)) startRace(i); }
          else selected = i;
          return;
        }
      }
    } else if (phase === 'handoff') {
      startDuelLeg2();
    } else if (phase === 'done' && mode === 'tutorial') {
      if (inBox(lx, ly, DONE_RETRY_BTN)) { startTutorial(); return; }
      leaveTutorial();
      return;
    } else if (phase === 'done') {
      if (storyEvent) {
        // Story results have two real choices, so they get two buttons; a
        // tap anywhere else just continues.
        if (inBox(lx, ly, DONE_RETRY_BTN)) { retryStoryEvent(); return; }
        leaveStoryResults();
        return;
      }
      // Going again should be one tap, not three. Back to the tracks, with
      // the mode you were already playing still chosen.
      phase = 'select';
    }
  }

  function enterCity(ci) {
    if (!DR.Story.cityUnlocked(ci)) return;
    storySel = ci;
    // Land on the first thing still to do, so returning to a city puts
    // the next event under your thumb.
    var ev = DR.Story.cities()[ci].events;
    citySel = 0;
    for (var i = 0; i < ev.length; i++) {
      if (!DR.Story.cleared(ci, i) && !DR.Story.eventLocked(ci, i)) { citySel = i; break; }
    }
    phase = 'city';
  }

  function tryStoryEvent(ci, ei) {
    if (DR.Story.eventLocked(ci, ei)) return;
    startStoryEvent(ci, ei);
  }

  function retryStoryEvent() {
    var ev = storyEvent;
    startStoryEvent(ev.city, ev.event);
  }

  function leaveStoryResults() {
    var ev = storyEvent;
    storyEvent = null; storyResult = null;
    // Beating a boss sends you to the map, where the next city has just
    // opened; anything else goes back to the city you were in.
    var boss = ev && DR.Story.cities()[ev.city].events[ev.event].type === 'boss';
    if (boss && DR.Story.bossBeaten(ev.city) && ev.city + 1 < DR.Story.cities().length) {
      storySel = ev.city + 1;
      phase = 'story';
    } else {
      enterCity(ev ? ev.city : storySel);
    }
    DR.Input.releaseAll(); DR.Input.clearTap();
  }

  function openGarage(from) {
    garageReturn = from;
    garageSel = rosterIndexOf(DR.Save.selectedCar());
    garagePreviewFor = null;
    garageTab = 'stats';
    phase = 'garage';
  }

  // Practice never ends on its own, so it needs a way out. Handled here
  // rather than in updateMenu, because the menu loop does not run mid-race.
  function handleRaceTap() {
    if (mode !== 'practice' && mode !== 'tutorial') { DR.Input.clearTap(); return; }
    var t = DR.Input.takeTap();
    if (!t) return;
    var lx = (t.x - offX) / scale, ly = (t.y - offY) / scale;
    if (inBox(lx, ly, EXIT_BTN)) {
      phase = mode === 'tutorial' ? 'title' : 'modes';
      DR.Input.releaseAll();
    }
  }

  function startRace(i, m, keepDuel, opts) {
    if (m) mode = m;
    selected = i;
    // Whatever was being held to get here is not a steering input, and any
    // arrow presses queued for the menu are not for the road.
    DR.Input.releaseAll();
    DR.Input.clearTap();
    DR.Road.setTrack(i);
    // Whichever car the garage has selected, not whatever a previous race
    // happened to leave the physics constants set to.
    DR.Cars.applyToCar(DR.Save.selectedCar());
    DR.Car.reset(); DR.FX.reset();
    camReady = false; hitCool = 0; wallHitCount = 0; draftMult = 1;
    lap = 1; lapFlash = 0; boostT = 1e9;
    lapTimer = 0; timing = false; lapTimes.length = 0;
    hitPenalty = 1; meter = 0.55; driftTime = 0; pickPop = 0; boostDenied = 0;
    rebound = 0; scrapeT = 0;
    rushTime = RUSH_START; rushScore = 0; cpIndex = 0; cpClean = true;
    cpFlash = 0; spikeT = 0; rushGates = 0;
    DR.Road.resetHazards();

    if (mode === 'duel' && !keepDuel) {
      duelStage = 1; duelGhost = null; duelTimes = [0, 0];
      duelElapsed = 0; duelGap = null;
      DR.Ghost.start();
    }
    raceTotal = 0; hintAlpha = 1;
    raceClock = 0; standings = null; finishPos = 0; bumpFlash = 0;
    storyEvent = (opts && opts.story) || null;
    storyResult = null;
    raceRivals = mode === 'race' ? ((opts && opts.rivals) || QUICK_RIVALS) : null;
    if (raceRivals && raceRivals.length) DR.Rivals.start(raceRivals);
    else { raceRivals = null; DR.Rivals.clear(); }
    phase = 'racing';
  }

  // Minimap, top right. The whole lap seen from above, with you on it.
  // North-up rather than rotating, so the shape stays learnable.
  var MAP = { x: 528, y: 50, w: 164, h: 164 };
  // Practice owns the top of the screen for its guidance, so the map moves
  // down out of its way rather than the two fighting over the same corner.
  var MAP_PRACTICE = { x: 528, y: 900, w: 164, h: 164 };
  function drawMinimap(ctx2, box) {
    var m = box || MAP;
    ctx2.fillStyle = 'rgba(10,6,22,0.55)';
    ctx2.fillRect(m.x, m.y, m.w, m.h);
    ctx2.lineWidth = 1.5;
    ctx2.strokeStyle = 'rgba(150,196,225,0.35)';
    ctx2.strokeRect(m.x, m.y, m.w, m.h);
    if (raceRivals) drawRivalDots(ctx2, m);
    drawOutline(ctx2, m, undefined, lapProgress(), 2);
  }

  // Rivals on the minimap, as smaller dots in their own colours, drawn
  // under the track line so your own (bigger, red) dot always reads on top.
  var _fracs = [];
  function drawRivalDots(ctx2, m) {
    var pts = DR.Road.lapOutline(), i, j;
    var pad = m.w * 0.12, iw = m.w - pad * 2, ih = m.h - pad * 2;
    DR.Rivals.lapFractions(_fracs);
    for (i = 0; i < _fracs.length; i++) {
      var f = _fracs[i].f, best = pts[0];
      for (j = 0; j < pts.length; j++) {
        if (Math.abs(pts[j].f - f) < Math.abs(best.f - f)) best = pts[j];
      }
      ctx2.beginPath();
      ctx2.arc(m.x + pad + best.nx * iw, m.y + pad + (1 - best.ny) * ih, 5, 0, Math.PI * 2);
      ctx2.fillStyle = _fracs[i].color;
      ctx2.fill();
      ctx2.lineWidth = 1.5;
      ctx2.strokeStyle = 'rgba(4,2,10,0.9)';
      ctx2.stroke();
    }
  }

  function ordinal(n) {
    return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH');
  }

  // Your place in the race, top centre. Written as a word ("2ND"), never
  // just a colour, and it gets a brief swell when someone leans on you.
  function drawPosition(ctx2, v) {
    var pos = DR.Rivals.position(DR.Car.roadS, false);
    var total = DR.Rivals.all().length + 1;
    var cx2 = v.W * 0.5;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '700 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.85)';
    ctx2.fillText('POSITION', cx2, 70);
    var sz = 58 + Math.round(bumpFlash * 8);
    ctx2.font = '800 ' + sz + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.lineWidth = 7;
    ctx2.strokeStyle = 'rgba(4,2,10,0.88)';
    var txt = ordinal(pos) + ' / ' + total;
    ctx2.strokeText(txt, cx2, 130);
    ctx2.fillStyle = pos === 1 ? '#ffd76a' : '#eaf6ff';
    ctx2.fillText(txt, cx2, 130);
    // Being towed along is worth knowing: it's what sets up a pass.
    if (draftMult > 1.012) {
      ctx2.globalAlpha = Math.min(1, (draftMult - 1.012) / 0.02);
      ctx2.font = '800 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.lineWidth = 5;
      ctx2.strokeText('\u00BB SLIPSTREAM \u00AB', cx2, 164);
      ctx2.fillStyle = '#7ce4ff';
      ctx2.fillText('\u00BB SLIPSTREAM \u00AB', cx2, 164);
      ctx2.globalAlpha = 1;
    }
    ctx2.textAlign = 'left';
  }

  // Did we just run over a pickup?
  function collectPicks() {
    var list = DR.Road.picks();
    DR.Road.ensurePicks(DR.Car.roadS + DR.Road.LOOKAHEAD);
    DR.Road.trimPicks(DR.Car.roadS - 400);
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      if (k.taken) continue;
      if (Math.abs(k.s - DR.Car.roadS) > 70) continue;
      var lateral = k.lat * DR.Road.halfWidthAt(k.s);
      if (Math.abs(DR.Car.dev - lateral) > 86) continue;
      k.taken = true;
      meter = Math.min(1, meter + (k.val || FILL_PICKUP));
      pickPop = 1;
      DR.FX.pickupBurst();
    }
  }

  function drawTutorialHud(ctx2, v) {
    DR.Tutorial.draw(ctx2, v, { byKey: DR.Input.lastDevice() === 'key', boostBtn: BOOST_BTN });
    drawBoostButton(ctx2);
    drawButton(ctx2, EXIT_BTN, '\u25C2 MENU');
  }

  function drawTutorialDone(ctx2, v) {
    var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx2.fillStyle = 'rgba(6,4,16,0.80)';
    ctx2.fillRect(0, 0, v.W, v.H);
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 60px ' + SANS;
    ctx2.fillStyle = '#7dffb0';
    ctx2.fillText('TUTORIAL DONE', v.W * 0.5, 300);
    var steps = [
      ['1', 'HOLD THE SIDE THE ROAD TURNS TOWARD'],
      ['2', 'LET GO AS IT STRAIGHTENS'],
      ['3', 'DRIFTS FILL BOOST \u2014 USE IT ON STRAIGHTS']
    ];
    for (var i = 0; i < steps.length; i++) {
      var y = 420 + i * 96;
      ctx2.beginPath();
      ctx2.arc(96, y - 10, 26, 0, Math.PI * 2);
      ctx2.fillStyle = 'rgba(255,215,106,0.18)';
      ctx2.fill();
      ctx2.lineWidth = 3;
      ctx2.strokeStyle = '#ffd76a';
      ctx2.stroke();
      ctx2.font = '800 28px ' + SANS;
      ctx2.fillStyle = '#ffd76a';
      ctx2.fillText(steps[i][0], 96, y);
      ctx2.textAlign = 'left';
      fitText(ctx2, steps[i][1], 146, y, 540, 24, '800', SANS);
      ctx2.textAlign = 'center';
    }
    ctx2.font = '700 30px ' + MONO;
    ctx2.fillStyle = '#7dffb0';
    ctx2.fillText(doneAward ? '+' + doneAward + ' CR' : 'ALREADY PAID OUT', v.W * 0.5, 800);
    ctx2.font = '700 24px ' + SANS;
    ctx2.fillStyle = 'rgba(190,214,235,0.9)';
    ctx2.fillText('STORY MODE STARTS IN PORTSIDE', v.W * 0.5, 1060);
    drawDoneButton(ctx2, DONE_RETRY_BTN, 'AGAIN', doneSel === 0);
    drawDoneButton(ctx2, DONE_CONT_BTN, 'TO STORY', doneSel === 1);
  }

  /* Practice read-out. The line on the road says WHERE; this says WHAT TO DO
     and HOW FAR OFF you are — and it says it in words and a bar, never in
     colour alone, because which way to hold is the one thing here a player
     cannot afford to misread. */
  function drawPracticeHud(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var info = DR.Road.lineAt(DR.Car.roadS);
    var err = DR.Car.dev - info.off;
    var zone = info.zone;

    var cx2 = v.W * 0.5, top = 82;
    var label = zone === 0 ? 'RELEASE' : (zone < 0 ? 'HOLD LEFT' : 'HOLD RIGHT');
    var tint = zone === 0 ? '#7dffb0' : '#ffd76a';

    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.font = '800 50px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.lineWidth = 8;
    ctx2.strokeStyle = 'rgba(4,2,10,0.9)';
    ctx2.strokeText(label, cx2, top);
    ctx2.fillStyle = tint;
    ctx2.fillText(label, cx2, top);

    // A pair of arrows either side, filled on the side you should be holding.
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var ax = cx2 + sgn * 232, lit = zone === sgn;
      ctx2.globalAlpha = lit ? 1 : 0.22;
      ctx2.beginPath();
      ctx2.moveTo(ax - 26 * sgn, top - 26);
      ctx2.lineTo(ax + 26 * sgn, top);
      ctx2.lineTo(ax - 26 * sgn, top + 26);
      ctx2.closePath();
      ctx2.fillStyle = lit ? '#ffd76a' : 'rgba(180,206,226,0.9)';
      ctx2.fill();
      ctx2.globalAlpha = 1;
    }

    // How far off the line, as a bar that fills from the middle outward.
    var bw = 420, bh = 12, bx = cx2 - bw * 0.5, by = top + 58;
    ctx2.fillStyle = 'rgba(255,255,255,0.12)';
    ctx2.fillRect(bx, by, bw, bh);
    ctx2.fillStyle = 'rgba(255,255,255,0.45)';
    ctx2.fillRect(cx2 - 1, by - 4, 2, bh + 8);
    var span = Math.max(40, info.hw);
    var f = Math.max(-1, Math.min(1, err / span));
    var good = Math.abs(err) < 26;
    ctx2.fillStyle = good ? '#7dffb0' : '#41e0ff';
    if (f >= 0) ctx2.fillRect(cx2, by, f * bw * 0.5, bh);
    else ctx2.fillRect(cx2 + f * bw * 0.5, by, -f * bw * 0.5, bh);

    ctx2.font = '700 20px ' + MONO;
    ctx2.fillStyle = good ? '#7dffb0' : 'rgba(190,214,235,0.9)';
    ctx2.fillText(good ? 'ON THE LINE' : (Math.abs(err)).toFixed(0) + ' OFF', cx2, by + 34);

    // Lap time is still worth seeing — it is how you tell whether the line is
    // doing anything for you.
    ctx2.textAlign = 'left';
    ctx2.textBaseline = 'top';
    ctx2.font = '700 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.8)';
    ctx2.fillText('THIS LAP', 40, 986);
    ctx2.font = '700 38px ' + MONO;
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText(timing ? fmt(lapTimer) : '--.--', 40, 1014);
    if (lapTimes.length) {
      var best = Math.min.apply(null, lapTimes);
      ctx2.font = '700 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = 'rgba(150,196,225,0.8)';
      ctx2.fillText('BEST', 260, 986);
      ctx2.font = '700 38px ' + MONO;
      ctx2.fillStyle = '#7dffb0';
      ctx2.fillText(fmt(best), 260, 1014);
    }
    ctx2.textBaseline = 'alphabetic';

    drawBoostButton(ctx2);
    drawMinimap(ctx2, MAP_PRACTICE);
    drawButton(ctx2, EXIT_BTN, '\u25C2 MENU');
  }

  /* Rush read-out. The clock is the whole mode, so it is the biggest thing on
     the screen and it turns red AND starts pulsing under five seconds — never
     colour on its own. */
  function drawRushHud(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var cx2 = v.W * 0.5;
    var low = rushTime < 5;
    var pulse = low ? 0.78 + 0.22 * Math.sin(clock * 12) : 1;

    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '700 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.85)';
    ctx2.fillText('TIME', cx2, 62);

    ctx2.globalAlpha = pulse;
    ctx2.font = '800 96px ' + MONO;
    ctx2.lineWidth = 10;
    ctx2.strokeStyle = 'rgba(4,2,10,0.9)';
    ctx2.strokeText(rushTime.toFixed(1), cx2, 148);
    ctx2.fillStyle = low ? '#ff6a5a' : '#eaf6ff';
    ctx2.fillText(rushTime.toFixed(1), cx2, 148);
    ctx2.globalAlpha = 1;

    ctx2.font = '700 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(150,196,225,0.8)';
    ctx2.fillText('DISTANCE', cx2, 190);
    ctx2.font = '800 46px ' + MONO;
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText(rushScore + ' m', cx2, 236);

    if (rushBest > 0) {
      ctx2.font = '700 20px ' + MONO;
      ctx2.fillStyle = 'rgba(125,255,176,0.85)';
      ctx2.fillText('BEST ' + rushBest + ' m', cx2, 268);
    }

    // Gate bonus, swelling and fading.
    if (cpFlash > 0) {
      var k = Math.sin(Math.PI * Math.min(1, cpFlash));
      ctx2.globalAlpha = k;
      ctx2.font = '800 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.lineWidth = 7;
      ctx2.strokeStyle = 'rgba(4,2,10,0.85)';
      ctx2.strokeText(cpFlashText, cx2, 330);
      ctx2.fillStyle = '#7dffb0';
      ctx2.fillText(cpFlashText, cx2, 330);
      ctx2.globalAlpha = 1;
    }

    // Spiked: a countdown bar, so it is obvious WHY the car went slow and for
    // how much longer. A speed drop with no cause reads as a bug.
    if (spikeT > 0) {
      // Low enough to clear the SPIKED label that floats over the car itself,
      // which says the same thing in the same instant.
      var bw = 300, bh = 16, bx = cx2 - bw * 0.5, by = 1022;
      ctx2.fillStyle = 'rgba(10,6,22,0.7)';
      ctx2.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
      ctx2.fillStyle = 'rgba(255,255,255,0.15)';
      ctx2.fillRect(bx, by, bw, bh);
      ctx2.fillStyle = '#ff6a5a';
      ctx2.fillRect(bx, by, bw * (spikeT / SPIKE_SECS), bh);
      ctx2.font = '700 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = '#ffd9d2';
      ctx2.fillText('SPIKED \u2014 HALF SPEED', cx2, by - 14);
    }

    ctx2.textAlign = 'left';
    drawBoostButton(ctx2);
    drawMinimap(ctx2, MAP_PRACTICE);
  }

  /* Duel read-out: which player is driving, and — for player two — the gap in
     seconds. AHEAD and BEHIND are written out, because a green or red number
     on its own is exactly the sort of thing the brief says must never carry
     information alone. */
  function drawDuelHud(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var cx2 = v.W * 0.5;

    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';
    ctx2.font = '800 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.lineWidth = 6;
    ctx2.strokeStyle = 'rgba(4,2,10,0.85)';
    ctx2.strokeText('PLAYER ' + duelStage, cx2, 54);
    ctx2.fillStyle = duelStage === 1 ? '#ffd76a' : '#7ce4ff';
    ctx2.fillText('PLAYER ' + duelStage, cx2, 54);

    if (duelStage === 1) {
      ctx2.font = '600 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = 'rgba(180,206,226,0.85)';
      ctx2.fillText('SET THE TIME  \u2014  ' + DUEL_LAPS + ' LAPS', cx2, 84);
    } else {
      ctx2.font = '600 20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = 'rgba(180,206,226,0.85)';
      ctx2.fillText('TO BEAT  ' + fmt(duelTimes[0]), cx2, 84);

      if (duelGap !== null) {
        var behind = duelGap > 0;
        var word = behind ? 'BEHIND' : 'AHEAD';
        var mag = Math.abs(duelGap);
        ctx2.font = '800 60px ' + MONO;
        ctx2.lineWidth = 8;
        ctx2.strokeStyle = 'rgba(4,2,10,0.9)';
        ctx2.strokeText((behind ? '+' : '\u2212') + mag.toFixed(2), cx2, 152);
        ctx2.fillStyle = behind ? '#ff8a6a' : '#7dffb0';
        ctx2.fillText((behind ? '+' : '\u2212') + mag.toFixed(2), cx2, 152);
        ctx2.font = '700 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx2.fillText(word, cx2, 184);
      } else {
        ctx2.font = '700 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx2.fillStyle = '#7dffb0';
        ctx2.fillText('GHOST HAS FINISHED', cx2, 152);
      }
    }
    ctx2.textAlign = 'left';
  }

  // Between the two legs. Deliberately a wall you have to tap through, so the
  // phone actually changes hands before the clock starts again.
  function drawHandoff(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx2.fillStyle = 'rgba(6,4,16,0.86)';
    ctx2.fillRect(0, 0, v.W, v.H);

    ctx2.textAlign = 'center';
    ctx2.font = '700 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,214,236,0.9)';
    ctx2.fillText('PLAYER 1', v.W * 0.5, 340);

    ctx2.font = '800 96px ' + MONO;
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText(fmt(duelTimes[0]), v.W * 0.5, 434);

    var best = lapTimes.length ? Math.min.apply(null, lapTimes) : 0;
    ctx2.font = '700 24px ' + MONO;
    ctx2.fillStyle = 'rgba(190,214,235,0.85)';
    ctx2.fillText('BEST LAP  ' + fmt(best), v.W * 0.5, 480);

    ctx2.font = '800 54px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#7ce4ff';
    ctx2.fillText('PASS THE PHONE', v.W * 0.5, 610);

    ctx2.font = '600 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = 'rgba(180,206,226,0.9)';
    ctx2.fillText('Player 2 races Player 1\u2019s ghost', v.W * 0.5, 656);

    ctx2.font = '700 32px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('TAP WHEN READY', v.W * 0.5, 800);
    ctx2.textAlign = 'left';
  }

  function drawDuelDone(ctx2, v) {
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx2.fillStyle = 'rgba(6,4,16,0.80)';
    ctx2.fillRect(0, 0, v.W, v.H);

    var p1 = duelTimes[0], p2 = duelTimes[1];
    var winner = p2 < p1 ? 2 : 1;
    var margin = Math.abs(p1 - p2);

    ctx2.textAlign = 'center';
    ctx2.font = '800 66px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = winner === 1 ? '#ffd76a' : '#7ce4ff';
    ctx2.fillText('PLAYER ' + winner + ' WINS', v.W * 0.5, 320);

    ctx2.font = '700 28px ' + MONO;
    ctx2.fillStyle = 'rgba(190,214,235,0.9)';
    ctx2.fillText('BY ' + margin.toFixed(2) + 's', v.W * 0.5, 368);

    for (var i = 0; i < 2; i++) {
      var y = 470 + i * 96, won = (i + 1) === winner;
      ctx2.textAlign = 'right';
      ctx2.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = won ? '#eaf6ff' : 'rgba(150,196,225,0.75)';
      ctx2.fillText('PLAYER ' + (i + 1), v.W * 0.5 - 28, y);
      ctx2.textAlign = 'left';
      ctx2.font = '800 48px ' + MONO;
      ctx2.fillStyle = won ? (winner === 1 ? '#ffd76a' : '#7ce4ff') : 'rgba(228,242,252,0.8)';
      ctx2.fillText(fmt(duelTimes[i]), v.W * 0.5 + 8, y);
    }

    ctx2.textAlign = 'center';
    ctx2.font = '700 26px ' + MONO;
    ctx2.fillStyle = '#7dffb0';
    ctx2.fillText('+' + doneAward + ' CR', v.W * 0.5, 780);

    ctx2.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('TAP TO GO AGAIN', v.W * 0.5, 850);
    ctx2.textAlign = 'left';
  }

  function drawHint(ctx2, v) {
    if (hintAlpha <= 0.01) return;
    ctx2.globalAlpha = hintAlpha;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.lineWidth = 6;
    ctx2.strokeStyle = 'rgba(4,2,10,0.9)';
    var byKey = DR.Input.lastDevice() === 'key';
    var head = byKey ? 'HOLD \u2190 OR \u2192' : 'HOLD LEFT OR RIGHT SIDE';
    ctx2.strokeText(head, v.W * 0.5, v.H - 790);
    ctx2.fillStyle = '#dff6ff';
    ctx2.fillText(head, v.W * 0.5, v.H - 790);
    ctx2.font = '600 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.strokeText('hold all the way through a corner', v.W * 0.5, v.H - 752);
    ctx2.fillStyle = 'rgba(190,214,235,0.9)';
    ctx2.fillText('hold all the way through a corner', v.W * 0.5, v.H - 752);
    ctx2.globalAlpha = 1;
  }

  var menuV = null;
  function menuView() {
    if (!menuV) {
      menuV = { W: LOGICAL_W, H: LOGICAL_H, carY: DR.Road.CAR_Y, carS: 0,
                camX: 0, camY: 0, camAngle: 0, camSin: 0, camCos: 1, boost: 0 };
    }
    return menuV;
  }

  // Off-race input: steer to change track, boost to confirm, tap anywhere.
  function updateMenu() {
    // Counted presses, not held keys — a tap of an arrow that begins and ends
    // between two frames still has to move the selection.
    var st = DR.Input.takeMenuStep();
    var confirm = DR.Input.takeBoost();

    if (phase === 'title') {
      if (st) {
        titleSel = ((titleSel + st) % TITLE_ITEMS.length + TITLE_ITEMS.length) % TITLE_ITEMS.length;
      }
      if (confirm) enterTitleItem(titleSel);
    } else if (phase === 'modes') {
      if (st) {
        modeSel = ((modeSel + st) % MODES.length + MODES.length) % MODES.length;
      }
      if (confirm) { mode = MODES[modeSel].id; phase = 'select'; }
    } else if (phase === 'select') {
      if (st) {
        var n = DR.Road.tracks().length;
        selected = ((selected + st) % n + n) % n;
      }
      if (confirm && trackOpen(selected)) startRace(selected);
    } else if (phase === 'garage') {
      if (st) garageStep(st);
      if (confirm) garageAction();
    } else if (phase === 'story') {
      if (st) {
        var nc = DR.Story.cities().length;
        storySel = ((storySel + st) % nc + nc) % nc;
      }
      if (confirm) enterCity(storySel);
    } else if (phase === 'city') {
      var ne = DR.Story.cities()[storySel].events.length;
      if (st) citySel = ((citySel + st) % ne + ne) % ne;
      if (confirm) tryStoryEvent(storySel, citySel);
    } else if (phase === 'handoff') {
      if (confirm) startDuelLeg2();
    } else if (phase === 'done' && mode === 'tutorial') {
      if (st) doneSel = st < 0 ? 0 : 1;
      if (confirm) { if (doneSel === 0) startTutorial(); else leaveTutorial(); }
    } else if (phase === 'done') {
      if (storyEvent) {
        if (st) doneSel = st < 0 ? 0 : 1;
        if (confirm) { if (doneSel === 0) retryStoryEvent(); else leaveStoryResults(); }
      } else if (confirm) startRace(selected);
    }
    handleMenuTap();
  }

  function draw() {
    var v = view();
    var sh = DR.FX.shakeOffset();

    // Checked every frame rather than at each phase-transition call site, so
    // there is exactly one place that can ever get this out of sync with
    // what's on screen — leaving the WebGL layer showing (or hidden) behind
    // is a whole class of bug this avoids for free.
    if (DR.Car3D) DR.Car3D.show(phase === 'garage');
    // Same idea for the city look: worked out from what's on screen every
    // frame, so a city's colours can never leak into Quick Play.
    var themeCity = -1;
    if (phase === 'city') themeCity = storySel;
    else if (storyEvent && (phase === 'racing' || phase === 'done')) themeCity = storyEvent.city;
    DR.Road.setTheme(themeCity >= 0 ? DR.Story.themeFor(themeCity) : null);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.clip();
    ctx.translate(sh.x, sh.y);

    if (phase === 'title' || phase === 'modes' || phase === 'select' || phase === 'city' ||
        phase === 'story' || phase === 'garage' || phase === 'tutorial') {
      DR.Road.prepareTerrain(null);          // menus sit on the flat
      DR.Road.drawBackground(ctx, menuView());
      if (phase === 'title') drawTitle(ctx, v);
      else if (phase === 'modes') { drawModes(ctx, v); drawButton(ctx, BACK_BTN, '\u25C2 TITLE'); }
      else if (phase === 'select') { drawSelect(ctx, v); drawButton(ctx, BACK_BTN, '\u25C2 MODES'); }
      else if (phase === 'garage') drawGarage(ctx, v);
      else if (phase === 'story') drawStory(ctx, v);
      else if (phase === 'city') drawCity(ctx, v);
      else if (phase === 'tutorial') drawComingSoon(ctx, v, 'TUTORIAL', 'A guided first drift. Coming soon.');
      ctx.restore();
      return;
    }

    // Hills and banking for this frame: a picture only, see road.js.
    DR.Road.prepareTerrain(v, DR.Car.roadS, DR.Car.x, DR.Car.y);
    DR.Road.drawBackground(ctx, v);
    var rib = DR.Road.draw(ctx, v);
    DR.FX.drawSkids(ctx, v);
    // Over the skid marks, or your own rubber hides the advice.
    if (mode === 'practice' || mode === 'tutorial') DR.Road.drawRacingLine(ctx, rib, v, clock);
    if (mode === 'rush') {
      DR.Road.drawCheckpoints(ctx, rib, v, cpWorldS(cpIndex));
      DR.Road.drawHazards(ctx, rib, v, clock);
    }
    DR.Road.drawChevrons(ctx, v);
    DR.Road.drawFog(ctx, v);
    DR.Road.drawPicks(ctx, v, clock);
    DR.FX.drawSmoke(ctx, v);
    if (mode === 'duel' && duelStage === 2 && duelGhost) {
      DR.Ghost.at(duelGhost, duelElapsed, _ghostPos);
      if (!_ghostPos.done) DR.Car.drawGhost(ctx, v, _ghostPos);
    }
    if (raceRivals) DR.Rivals.draw(ctx, v, DR.Car.roadS, 'ahead');
    DR.Car.draw(ctx, v);
    if (raceRivals) DR.Rivals.draw(ctx, v, DR.Car.roadS, 'behind');
    DR.FX.drawSparks(ctx, v);
    DR.FX.drawSpeedLines(ctx, v);
    DR.FX.drawBurst(ctx, v);
    DR.FX.drawBoostFx(ctx, v);
    DR.FX.drawFlash(ctx, v, rib);
    DR.FX.drawLabels(ctx, v);
    // The results panel owns the screen; the race HUD behind it is clutter.
    if (phase === 'racing') {
      if (mode === 'practice') drawPracticeHud(ctx, v);
      else if (mode === 'tutorial') drawTutorialHud(ctx, v);
      else if (mode === 'rush') drawRushHud(ctx, v);
      else { drawHud(ctx, v); drawHint(ctx, v); }
      if (mode === 'duel') drawDuelHud(ctx, v);
      if (mode === 'time') drawTimeHud(ctx, v);
    }
    if (phase === 'handoff') drawHandoff(ctx, v);
    if (phase === 'done') drawDone(ctx, v);

    ctx.restore();
  }

  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = FIXED;
    if (dt > 0.25) dt = 0.25;

    if (phase === 'racing') handleRaceTap();
    else updateMenu();

    acc += dt;
    var steps = 0;
    while (acc >= FIXED && steps < 5) { update(FIXED); acc -= FIXED; steps++; }
    if (steps === 5) acc = 0;

    draw();
    requestAnimationFrame(frame);
  }

  function start() {
    canvas = document.getElementById('stage');
    ctx = canvas.getContext('2d', { alpha: false });

    DR.Road.reset();
    DR.Car.reset();
    DR.FX.reset();
    // Loaded before anything else touches it. The starter car's id is fixed
    // ahead of the garage existing for real, so Phase 1's car data lines up
    // with whatever a returning player's save already has in it.
    DR.Save.load();
    DR.Save.ensureStarter('nightrunner');
    DR.Cars.applyToCar(DR.Save.selectedCar());
    DR.Input.init(canvas);
    // The button is positioned in playfield units, so the hit test has to undo
    // the letterboxing to find out where a real finger landed.
    DR.Input.setBoostHitTest(function (clientX, clientY) {
      var lx = (clientX - offX) / scale, ly = (clientY - offY) / scale;
      var dx = lx - BOOST_BTN.x, dy = ly - BOOST_BTN.y;
      return dx * dx + dy * dy <= BOOST_BTN.r * BOOST_BTN.r;
    });
    // Reaching for the MENU button must not drift the car on the way.
    DR.Input.setUiHitTest(function (clientX, clientY) {
      if (phase !== 'racing' || (mode !== 'practice' && mode !== 'tutorial')) return false;
      var lx = (clientX - offX) / scale, ly = (clientY - offY) / scale;
      return inBox(lx, ly, EXIT_BTN);
    });
    camReady = false;

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

    last = performance.now();
    requestAnimationFrame(frame);
  }

  // Exposed so the drift can be measured and tuned from outside the game.
  DR.Game = {
    view: view,
    // The same letterbox numbers the 2D canvas draws through, in CSS pixels
    // (not device pixels) — so anything positioned in a second, overlaid
    // canvas (the Garage's WebGL preview) lines up with the logical 720x1280
    // playfield exactly, on any aspect ratio, without duplicating resize().
    viewportRect: function () { return { scale: scale, offX: offX, offY: offY }; },
    // Getters, not snapshots — BASE_SPEED changes per car (see
    // applyCarTuning), and a plain number copied in at export time would go
    // stale the first time a test or the garage switched cars.
    get SPEED() { return BASE_SPEED; },
    get BASE_SPEED() { return BASE_SPEED; },
    applyCarTuning: applyCarTuning,
    speed: currentSpeed,
    hitPenalty: function () { return hitPenalty; },
    draft: function () { return draftMult; },
    boostAmount: boostAmount,
    meter: function () { return meter; },
    setMeter: function (v) { meter = v; },
    BOOST_COST: BOOST_COST,
    lapTimes: function () { return lapTimes.slice(); },
    lapTimer: function () { return lapTimer; },
    timing: function () { return timing; },
    boostButton: BOOST_BTN,
    LOGICAL_W: LOGICAL_W,
    LOGICAL_H: LOGICAL_H,
    camAngle: function () { return camAngle; },
    lap: function () { return lap; },
    lapProgress: lapProgress,
    phase: function () { return phase; },
    mode: function () { return mode; },
    rush: function () {
      return { time: rushTime, score: rushScore, best: rushBest,
               gates: rushGates, laps: rushLapsDone(), spiked: spikeT };
    },
    setRushTime: function (t) { rushTime = t; },
    duel: function () {
      return { stage: duelStage, times: duelTimes.slice(), gap: duelGap,
               ghost: duelGhost ? duelGhost.n : 0, elapsed: duelElapsed };
    },
    startDuelLeg2: startDuelLeg2,
    // Where a given menu card actually is, so a test can tap the real thing
    // instead of a hard-coded guess that goes stale the moment a layout moves.
    uiBox: function (kind, i) {
      if (kind === 'mode') return modeBox(i);
      if (kind === 'track') return cardBox(i);
      if (kind === 'title') return titleBox(i);
      if (kind === 'back') return BACK_BTN;
      if (kind === 'exit') return EXIT_BTN;
      if (kind === 'garageLeft') return GARAGE_LEFT_ARROW;
      if (kind === 'garageRight') return GARAGE_RIGHT_ARROW;
      if (kind === 'garageAction') return GARAGE_ACTION_BTN;
      if (kind === 'garageSwatch') return garageSwatchBox(i, DR.Cars.palette().length);
      if (kind === 'garageTab') return GARAGE_TAB_BTN;
      if (kind === 'storyRow') return storyRowBox(i);
      if (kind === 'cityEvent') return cityEventBox(i);
      if (kind === 'cityGarage') return CITY_GARAGE_BTN;
      if (kind === 'doneRetry') return DONE_RETRY_BTN;
      if (kind === 'doneContinue') return DONE_CONT_BTN;
      if (kind === 'garageUpgrade') return garageUpgradeBtnBox(i);
      return null;
    },
    garageSel: function () { return garageSel; },
    garageTab: function () { return garageTab; },
    // Runs the simulation forward without drawing — for tests that need to
    // drive whole races in milliseconds rather than minutes.
    step: function (dt) { update(dt || FIXED); },
    standings: function () { return standings; },
    toStory: function () { phase = 'story'; storySel = DR.Story.currentCity(); DR.Input.releaseAll(); DR.Input.clearTap(); },
    enterCity: enterCity,
    startStoryEvent: startStoryEvent,
    storySel: function () { return storySel; },
    citySel: function () { return citySel; },
    storyEvent: function () { return storyEvent; },
    storyResult: function () { return storyResult; },
    doneSel: function () { return doneSel; },
    selected: function () { return selected; },
    startTutorial: startTutorial,
    wallHits: function () { return wallHitCount; },
    garageReturn: function () { return garageReturn; },
    finishPos: function () { return finishPos; },
    doneAward: function () { return doneAward; },
    raceClock: function () { return raceClock; },
    setMode: function (m) { mode = m; },
    modes: function () { return MODES; },
    modeSel: function () { return modeSel; },
    titleItems: function () { return TITLE_ITEMS; },
    titleSel: function () { return titleSel; },
    startRace: startRace,
    RACE_LAPS: RACE_LAPS,
    raceTotal: function () { return raceTotal; },
    toTitle: function () { phase = 'title'; DR.Input.releaseAll(); DR.Input.clearTap(); },
    toSelect: function () { phase = 'select'; DR.Input.releaseAll(); DR.Input.clearTap(); },
    toModes: function () { phase = 'modes'; DR.Input.releaseAll(); DR.Input.clearTap(); },
    toGarage: function () {
      garageReturn = 'title';
      garageSel = rosterIndexOf(DR.Save.selectedCar());
      garagePreviewFor = null;
      garageTab = 'stats';
      phase = 'garage'; DR.Input.releaseAll(); DR.Input.clearTap();
    },
    restart: function () {
      DR.Road.reset(); DR.Car.reset(); DR.FX.reset();
      camReady = false; hitCool = 0; lap = 1; lapFlash = 0; boostT = 1e9;
      lapTimer = 0; timing = false; lapTimes.length = 0; hitPenalty = 1;
      meter = 0.55; driftTime = 0; clock = 0; pickPop = 0; boostDenied = 0;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window.DR = window.DR || {});
