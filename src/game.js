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
  var drawnPhase = '', phaseT = 0;   // which screen was drawn last, and for how long
  /* START OVER wipes the save. Two taps, because it can't be undone: the
     first arms it and says so, the second (within a few seconds) erases. */
  var RESET_BTN = { x: 230, y: 1150, w: 260, h: 56 };
  var resetArmed = 0, resetDone = 0;

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
  var dmgSmokeT = 0;       // after a hard knock, your car smokes for a moment
  function playerColor() {
    var def = DR.Cars.get(DR.Save.selectedCar());
    return DR.Save.carColor(DR.Save.selectedCar()) || (def && def.color) || '#c8121f';
  }
  var devVel = 0, lastDev = 0;   // sideways speed across the road
  var draftMult = 1;          // slipstream: > 1 while tucked in behind a rival
  var raceDone = false, finishHold = 0, results = null, lastPos = 0;
  var lapWalls = 0, driftRun = 0, draftCool = 0, drafting = false;
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
    // A hard hit breaks bits off and leaves the car smoking.
    if (severity > 0.45) {
      DR.FX.debris(wxp, wyp, playerColor(), Math.round(3 + severity * 8), 0.5 + severity * 0.5);
      dmgSmokeT = Math.max(dmgSmokeT, 0.8 + severity * 2);
    }
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
    if (phase !== 'racing') {
      clock += dt;
      if (resetArmed > 0) resetArmed = Math.max(0, resetArmed - dt);
      if (resetDone > 0) resetDone = Math.max(0, resetDone - dt);
      sceneT += dt;
      return;
    }
    var steer = DR.Input.steer();
    var realDt = dt;

    // On the grid: the intro and the lights. Nothing moves; the only input
    // that counts is an early boost (a jump start).
    if (DR.Show.frozen()) {
      clock += dt;
      DR.Show.update(dt, { boostPressed: DR.Input.takeBoost(), kmh: 0 });
      updateCamera(dt);
      DR.FX.update(dt, DR.Car.x, DR.Car.y);
      return;
    }
    // Over the line: slow motion, the car steering itself, then results.
    if (raceDone) {
      finishHold -= dt;
      DR.Show.update(dt, { boostPressed: false, kmh: currentSpeed() * KMH });
      if (finishHold <= 0) { phase = 'done'; return; }
      dt *= 0.35;
      steer = autoSteer();
      DR.Input.takeBoost();
    }
    if (steer !== 0) hintAlpha = Math.max(0, hintAlpha - dt * 2.4);

    clock += dt;
    raceClock += dt;
    if (bumpFlash > 0) bumpFlash = Math.max(0, bumpFlash - dt / 0.5);
    if (pickPop > 0) pickPop = Math.max(0, pickPop - dt / 0.5);
    if (boostDenied > 0) boostDenied = Math.max(0, boostDenied - dt / 0.6);

    var boostFired = false;
    var pressed = raceDone ? false : DR.Input.takeBoost();
    var launch = raceDone ? null : DR.Show.update(realDt, { boostPressed: pressed, kmh: currentSpeed() * KMH });
    if (launch === 'perfect') {
      // A perfect start: a full launch, and it costs no meter.
      boostT = 0; DR.FX.boostKick(); boostFired = true;
    } else if (pressed) {
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
      driftRun += dt;
    } else {
      driftTime = 0;
      // A long, clean slide is worth something when it ends.
      if (driftRun >= 1.4 && !raceDone) {
        DR.Show.notify('DRIFT', Math.round(driftRun * 30), '#ff2f8e', driftRun.toFixed(1) + 's');
        DR.Show.count('drifts');
      }
      driftRun = 0;
    }

    collectPicks();
    if (mode === 'rush') updateRush(dt);
    if (mode === 'duel') updateDuel(dt);

    if (hitPenalty < 1) hitPenalty = Math.min(1, hitPenalty + HIT_RECOVER_PER_SEC * dt);
    // Slipstream: tucked in behind a rival, you're pulled along too.
    var draftWant = raceRivals ? DR.Rivals.draftFor(DR.Car.roadS, DR.Car.dev) : 1;
    draftMult += (draftWant - draftMult) * (1 - Math.exp(-dt / 0.35));
    if (draftCool > 0) draftCool -= dt;
    if (draftMult > 1.03 && !drafting && draftCool <= 0 && !raceDone) {
      DR.Show.notify('SLIPSTREAM', 20, '#7ce4ff');
      draftCool = 4;
    }
    drafting = draftMult > 1.03;
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
    if (done + 1 > lap && !raceDone) {
      lapTimes.push(lapTimer);
      raceTotal += lapTimer;
      lapTimer = 0;
      lap = done + 1;
      lapFlash = 1;
      lapShow();
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
    if (dmgSmokeT > 0) {
      dmgSmokeT -= dt;
      if (Math.random() < 0.45) DR.FX.smokeAt(DR.Car.x - Math.sin(DR.Car.h) * 20, DR.Car.y - Math.cos(DR.Car.h) * 20, 1, 9, 0.3, true);
    }
    DR.FX.update(dt, DR.Car.x, DR.Car.y);
    DR.Road.ensure(DR.Car.roadS + DR.Road.LOOKAHEAD + 400);
    DR.Road.trim(DR.Car.roadS - DR.Road.CAM_BACK - 900);
  }

  // A lap just ended: say so, and what it was worth.
  function lapShow() {
    var total = lapsFor(mode), t0 = lapTimes[lapTimes.length - 1];
    if (wallHitCount === lapWalls && mode !== 'practice' && mode !== 'tutorial') {
      DR.Show.notify('CLEAN LAP', 100, '#7dffb0', 'NO WALLS');
      DR.Show.count('cleanLaps');
    }
    lapWalls = wallHitCount;
    if (mode === 'practice' || mode === 'rush' || mode === 'tutorial') return;
    if (lap > total) return;                       // the finish has its own show
    var best = lapTimes.length > 1 && t0 === Math.min.apply(null, lapTimes);
    if (lap === total) DR.Show.banner('FINAL LAP', (best ? 'BEST LAP ' : 'LAST LAP ') + fmt(t0), '#ff8a3d');
    else DR.Show.banner('LAP ' + lap + ' / ' + total, (best ? 'BEST LAP ' : '') + fmt(t0), best ? '#7dffb0' : '#ffd76a');
  }

  // Steering for the car once the race is over: the same look-ahead the
  // coach uses, so the run-out after the line stays on the road.
  var _as = {};
  function autoSteer() {
    var Car = DR.Car, s2 = Car.roadS + 420;
    var c = DR.Road.centreAt(s2, _as), off = DR.Road.lineAt(s2).off;
    var rx = c.x + Math.cos(c.h) * off - Car.x, ry = c.y - Math.sin(c.h) * off - Car.y;
    var sn = Math.sin(Car.h), cs = Math.cos(Car.h);
    var ey = rx * cs - ry * sn, ex = rx * sn + ry * cs, L2 = ex * ex + ey * ey;
    var kappa = L2 > 1 ? 2 * ey / L2 : 0;
    var want = Math.asin(Math.max(-1, Math.min(1, kappa * Car.minRadius() * Math.sin(Car.SLIP_AT_LIMIT))));
    var err = want - Car.cmdSlip;
    return err > 0.05 ? 1 : (err < -0.05 ? -1 : 0);
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
    // How fast you're sliding across the road, smoothed: a drift swinging
    // you into a rival hits it harder.
    var dv = (DR.Car.dev - lastDev) / Math.max(1e-4, dt);
    if (Math.abs(dv) > 2000) dv = 0;                  // a teleport, not a slide
    devVel += (dv - devVel) * (1 - Math.exp(-dt / 0.08));
    lastDev = DR.Car.dev;
    DR.Rivals.update(dt, { playerS: DR.Car.roadS, playerDev: DR.Car.dev,
                           playerHW: DR.Car.halfWidth(), playerDone: false,
                           clock: raceClock, finishS: finishLineS() });
    // Pushed sideways along the road, but never INTO the barrier: being
    // leaned on by a rival shouldn't be able to cost you a wall hit too.
    var limit = Math.max(0, DR.Road.halfWidthAt(DR.Car.roadS) - DR.Car.halfWidth() - 2);
    var speedNow = currentSpeed();
    var slipAmt = Math.min(1, Math.abs(Math.sin(DR.Car.slip)) / Math.sin(DR.Car.SLIP_AT_LIMIT));
    // Places gained.
    var posNow = DR.Rivals.position(DR.Car.roadS, false);
    if (posNow < lastPos && !raceDone) {
      DR.Show.notify('OVERTAKE', 50 * (lastPos - posNow), '#22e6ff', 'UP TO ' + DR.Show.ordinal(posNow));
      DR.Show.count('overtakes');
    }
    lastPos = posNow;
    var hit = DR.Rivals.contact({ s: DR.Car.roadS, dev: DR.Car.dev, hw: DR.Car.halfWidth(),
                                  len: DR.Car.L, limit: limit, v: speedNow,
                                  boost: boostAmount(), slipAmt: slipAmt,
                                  slipSign: DR.Car.slip >= 0 ? 1 : -1, latV: devVel });
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
      DR.FX.shakeBy(3 + sev * 9 * Math.min(1.5, hit.power), 0.25);
      bumpFlash = 1;
      // Metal on metal: a big enough hit is a crash you can see — debris in
      // your paint, a shock ring, smoke. (A rival you spin out does its own
      // crash, in its own paint, as it goes round.)
      if (hit.shunt || hit.knock || sev > 0.55) {
        DR.FX.crash(hit.x, hit.y, playerColor(), 0.5 + sev * 0.7 * Math.min(1.5, hit.power));
        if (hit.knock) dmgSmokeT = Math.max(dmgSmokeT, 1.5);
      }
      if (hit.knock) DR.FX.hazardHit('KNOCKED', '#ff8a5c', sev, DR.Car);
      else if (hit.spun) { DR.Show.notify('TAKEDOWN', 150, '#ffd76a', hit.spun + ' SPUN OUT'); DR.Show.count('takedowns'); }
      else if (hit.shunt) { DR.Show.notify('SHUNT', 80, '#ff8a3d'); DR.Show.count('shunts'); }
    }
  }

  function finishRace() {
    if (raceDone) return;
    lapFlash = 0;
    standings = null; finishPos = 0;
    if (raceRivals) {
      standings = DR.Rivals.standings({ name: playerName(), color: '#ffd76a', time: raceClock,
                                        clock: raceClock, finishS: finishLineS() });
      for (var i = 0; i < standings.length; i++) if (standings[i].isPlayer) finishPos = i + 1;
    }
    if (storyEvent) {
      storyResult = DR.Story.resolve(storyEvent.city, storyEvent.event,
                                     { pos: raceRivals ? finishPos : 0, total: raceTotal });
      // Lost, and the car is the reason? Say so, and where to fix it.
      var have = DR.Cars.rating(DR.Save.selectedCar()), need = DR.Story.ratingNeed(storyEvent.city);
      if (!storyResult.ok && have < need) {
        storyResult.lines.push('YOUR CAR IS RATED ' + have + ' \u2014 THIS CITY WANTS ~' + need);
        storyResult.lines.push('UPGRADE IN THE GARAGE, OR EARN IN QUICK PLAY');
      } else if (!storyResult.ok) {
        storyResult.lines.push('YOUR CAR IS QUICK ENOUGH \u2014 TRY SLIPSTREAM AND BOOST');
      }
      doneAward = storyResult.award;
      // Failing puts RETRY under your thumb; clearing puts CONTINUE there.
      doneSel = storyResult.ok ? 1 : 0;
    } else {
      awardRaceCurrency();
    }
    var kind = storyEvent ? storyEvent.type : 'race';
    var ok = storyResult ? storyResult.ok : true;
    settleRewards(kind, raceRivals ? finishPos : 1, ok);
    endWithShow(raceRivals ? finishPos : 0,
                raceRivals ? DR.Show.ordinal(finishPos) + ' PLACE'
                           : (ok ? 'TARGET BEATEN' : 'OUT OF TIME'));
  }

  /* Crossing the line with the show on: FINISH, a moment of slow motion,
     then the results. With it off (tests), straight to the results. */
  function endWithShow(pos, label) {
    if (DR.Show.enabled()) {
      raceDone = true;
      finishHold = DR.Show.finishDuration();
      DR.Show.finish({ pos: pos, label: label });
    } else {
      phase = 'done';
    }
  }

  /* What the race was worth beyond the prize: style points into credits,
     XP (and any level-up), and stars on a story event. Kept in `results`
     for the results screen to count up. */
  function settleRewards(kind, pos, ok) {
    var st = DR.Show.stats();
    // Style is a bonus on top of the prize, never bigger than it.
    var styleCash = Math.min(60, Math.round(st.style / 40));
    if (styleCash) DR.Save.addCurrency(styleCash);
    var xpBase = DR.Career.xpFor(kind, pos, ok), xpStyle = Math.round(st.style / 10);
    var xp = DR.Career.addXp(xpBase + xpStyle);
    var stars = 0, starAward = null;
    if (storyEvent) {
      var margin = 0, me = null, others = [];
      if (standings) {
        for (var i = 0; i < standings.length; i++) {
          if (standings[i].isPlayer) me = standings[i]; else others.push(standings[i].time);
        }
        if (me && others.length) margin = Math.min.apply(null, others) - me.time;
      }
      var frac = timeTarget > 0 ? (timeTarget - raceTotal) / timeTarget : 0;
      stars = DR.Career.starsFor({ type: storyEvent.type, ok: ok, pos: pos, margin: margin,
                                   frac: storyEvent.type === 'time' ? frac : 0, walls: wallHitCount });
      starAward = DR.Career.awardStars('story:' + storyEvent.id, stars);
    }
    results = {
      kind: kind, pos: pos, ok: ok, styleCash: styleCash, xpBase: xpBase, xpStyle: xpStyle, xp: xp,
      stars: stars, starAward: starAward,
      stats: { style: st.style, overtakes: st.overtakes, takedowns: st.takedowns, shunts: st.shunts,
               drifts: st.drifts, cleanLaps: st.cleanLaps, topKmh: Math.round(st.topKmh), perfect: st.perfect,
               walls: wallHitCount }
    };
    return results;
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

  /* ------------------------------ RACING NAME ------------------------------
     The one thing the game asks a new player: what to call them. A racing
     name, not a sign-in — no account, no email, nothing but the name, kept
     on this device only and never sent anywhere. It comes pre-filled with a
     random one, so a single tap gets you racing; type over it if you like.
     The typing goes into a real text box laid over the canvas, because
     that's the only way to get the phone's keyboard up. */
  var NAME_BOX = { x: 60, y: 430, w: 600, h: 132 };
  var NAME_DICE_BTN = { x: 200, y: 600, w: 320, h: 64 };
  var NAME_GO_BTN = { x: 140, y: 1070, w: 440, h: 86 };
  var nameDraft = '', nameThen = 'title', nameInput = null;
  var NAME_A = ['NEON', 'GHOST', 'TURBO', 'NIGHT', 'CHROME', 'VOLT', 'RAZOR', 'NOVA', 'ROGUE', 'BLAZE',
                'STORM', 'HYPER', 'LUNAR', 'VENOM', 'FROST', 'SONIC', 'DUSK', 'RIOT'];
  var NAME_B = ['VIPER', 'FOX', 'RIDER', 'COMET', 'BLADE', 'HAWK', 'WOLF', 'JET', 'ACE', 'BOLT',
                'LYNX', 'FANG', 'PULSE', 'SPARK', 'RAVEN', 'KID', 'ROCKET', 'SHARK'];
  function randomName() {
    for (var k = 0; k < 20; k++) {
      var n = NAME_A[Math.floor(Math.random() * NAME_A.length)] + ' ' + NAME_B[Math.floor(Math.random() * NAME_B.length)];
      if (Math.random() < 0.35 && n.length <= 9) n += ' ' + (10 + Math.floor(Math.random() * 90));
      if (n.length <= DR.Save.NAME_MAX && n !== nameDraft) return n;
    }
    return 'NEON RIDER';
  }
  function playerName() { return DR.Save.playerName() || 'YOU'; }
  function openName(then) {
    nameThen = then || 'title';
    nameDraft = DR.Save.playerName() || randomName();
    if (nameInput) nameInput.value = nameDraft;
    phase = 'name';
    DR.Input.releaseAll(); DR.Input.clearTap();
  }
  function confirmName() {
    if (!DR.Save.setPlayerName(nameDraft)) { nameDraft = randomName(); DR.Save.setPlayerName(nameDraft); }
    if (nameInput) nameInput.blur();
    if (nameThen === 'tutorial') startTutorial();
    else phase = 'title';
  }
  function rollName() {
    nameDraft = randomName();
    if (nameInput) nameInput.value = nameDraft;
  }
  function makeNameInput() {
    var el = document.createElement('input');
    el.type = 'text';
    el.maxLength = DR.Save.NAME_MAX;
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.setAttribute('autocapitalize', 'characters');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('enterkeyhint', 'go');
    el.setAttribute('aria-label', 'Racing name');
    el.className = 'name-input';
    el.addEventListener('input', function () {
      var clean = DR.Save.cleanName(el.value);
      if (clean !== el.value) el.value = clean;
      nameDraft = clean;
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); confirmName(); }
    });
    document.body.appendChild(el);
    return el;
  }
  // Every frame: the box sits exactly over the name panel, at the scale
  // the playfield is drawn at, and only while the name screen is up.
  function syncNameInput() {
    if (!nameInput) return;
    var on = phase === 'name';
    if (!on) { if (nameInput.style.display !== 'none') { nameInput.blur(); nameInput.style.display = 'none'; } return; }
    var b = NAME_BOX, ip = DR.UI.outCubic(DR.UI.step(phaseT, 0.15, 0.4));
    nameInput.style.display = 'block';
    nameInput.style.left = (offX + (b.x + 30) * scale) + 'px';
    nameInput.style.top = (offY + (b.y + 28) * scale) + 'px';
    nameInput.style.width = ((b.w - 60) * scale) + 'px';
    nameInput.style.height = ((b.h - 56) * scale) + 'px';
    nameInput.style.fontSize = Math.round(54 * scale) + 'px';
    nameInput.style.opacity = String(ip);
  }
  function drawName(ctx2, v) {
    var UI = DR.UI, t = phaseT, W = v.W;
    var renaming = !!DR.Save.playerName();
    UI.header(ctx2, W, renaming ? 'CHANGE NAME' : 'WHO ARE YOU?', 'YOUR RACING NAME ON THE CIRCUIT', t);
    // A driver's licence card, in the game's style: the name goes on it.
    var p = UI.outBack(UI.step(t, 0.1, 0.45));
    ctx2.save();
    ctx2.globalAlpha *= UI.clamp01(p);
    UI.panel(ctx2, 40, 300, 640, 420, { skew: 30, fill: 'rgba(10,8,24,0.92)', stroke: 'rgba(150,196,225,0.4)', lineWidth: 2, accent: UI.C.magenta });
    UI.text(ctx2, 'CIRCUIT RACING LICENCE', W / 2, 350, { size: 18, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim });
    UI.text(ctx2, 'NAME', NAME_BOX.x + 30, NAME_BOX.y - 12, { size: 14, font: UI.SANS, weight: '900', lean: 0, color: UI.C.cyan });
    var focus = nameInput && document.activeElement === nameInput;
    UI.panel(ctx2, NAME_BOX.x, NAME_BOX.y, NAME_BOX.w, NAME_BOX.h, { skew: 18, fill: 'rgba(30,24,60,0.9)',
      stroke: focus ? UI.C.cyan : 'rgba(150,196,225,0.5)', lineWidth: focus ? 3 : 1.5,
      glow: focus ? 'rgba(34,230,255,0.4)' : null });
    if (!nameInput) UI.text(ctx2, nameDraft, W / 2, NAME_BOX.y + 86, { size: 54, align: 'center', color: '#ffffff' });
    ctx2.restore();
    drawButton(ctx2, NAME_DICE_BTN, '↻  RANDOM NAME');
    var hp = UI.step(t, 0.35, 0.4);
    UI.text(ctx2, 'TAP THE NAME TO TYPE YOUR OWN', W / 2, 700, { size: 18, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: '#ffffff', alpha: hp });
    UI.text(ctx2, 'UP TO 12 LETTERS AND NUMBERS', W / 2, 790, { size: 18, font: UI.SANS, weight: '800', lean: 0, align: 'center', color: UI.C.dim, alpha: hp });
    UI.text(ctx2, 'A NICKNAME — NOT YOUR REAL NAME', W / 2, 822, { size: 18, font: UI.SANS, weight: '800', lean: 0, align: 'center', color: UI.C.gold, alpha: hp });
    UI.text(ctx2, 'IT STAYS ON THIS DEVICE. NOTHING ELSE IS ASKED OR SENT.', W / 2, 854, { size: 15, font: UI.SANS, weight: '800', lean: 0, align: 'center', color: UI.C.dim, alpha: hp, maxW: 640 });
    var gp = UI.outCubic(UI.step(t, 0.45, 0.4));
    ctx2.save(); ctx2.globalAlpha *= gp; ctx2.translate(0, (1 - gp) * 80);
    drawButton(ctx2, NAME_GO_BTN, renaming ? 'SAVE ▸' : 'LET’S RACE ▸', { primary: true, size: 34 });
    ctx2.restore();
    if (renaming) drawButton(ctx2, BACK_BTN, '◂ BACK');
    ctx2.textAlign = 'left';
  }

  function startTutorial() {
    wrongWayT = 0;
    startRace(0, 'tutorial');
    DR.Tutorial.start();
  }
  function finishTutorial() {
    phase = 'done'; lapFlash = 0;
    DR.Save.setTutorialSeen();
    var first = !DR.Save.isUnlocked(TUTORIAL_ID);
    doneAward = first ? TUTORIAL_PAY : 0;
    if (first) { DR.Save.unlock(TUTORIAL_ID); DR.Save.addCurrency(doneAward); }
    // XP and style pay once, like the prize: replaying the lesson is
    // practice, not a way to farm.
    if (first) settleRewards('tutorial', 1, true); else results = null;
    doneSel = 1;
  }
  // Out of the tutorial, into the career: the prologue plays if it hasn't.
  function leaveTutorial() {
    DR.Input.releaseAll(); DR.Input.clearTap();
    openStory();
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
    settleRewards('solo', 1, true);
  }
  function awardRushCurrency() {
    doneAward = Math.round(Math.max(30, Math.min(150, rushScore * 0.6)));
    DR.Save.addCurrency(doneAward);
    settleRewards('solo', 1, true);
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
  /* The race HUD, arcade style: your place big in a slanted badge top left,
     lap and time under it, the gap to the cars either side of you (in
     seconds, with their names), and the map top right. Everything is a
     number or a word first; colour only helps. */
  function drawHud(ctx2, v) {
    var UI = DR.UI, x = 18, y = 18;
    var total = lapsFor(mode);
    if (raceRivals) {
      var pos = DR.Rivals.position(DR.Car.roadS, false), n = DR.Rivals.all().length + 1;
      var sw = 1 + bumpFlash * 0.06;
      UI.panel(ctx2, x, y, 236, 112, { skew: 26, fill: 'rgba(8,6,20,0.82)', stroke: pos === 1 ? UI.C.gold : 'rgba(150,196,225,0.45)', lineWidth: 2,
                                        accent: pos === 1 ? UI.C.gold : UI.C.magenta });
      ctx2.save();
      ctx2.translate(x + 74, y + 92);
      ctx2.scale(sw, sw);
      UI.text(ctx2, String(pos), 0, 0, { size: 92, align: 'center', color: pos === 1 ? UI.hotGradient(ctx2, -40, -80, 40, 0) : '#ffffff', stroke: 'rgba(4,2,10,0.9)' });
      ctx2.restore();
      UI.text(ctx2, ordinal(pos).replace(/^\d+/, ''), x + 118, y + 58, { size: 30, color: pos === 1 ? UI.C.gold : '#ffffff' });
      UI.text(ctx2, '/ ' + n, x + 120, y + 94, { size: 26, color: UI.C.dim });
      UI.text(ctx2, 'POS', x + 196, y + 30, { size: 14, font: UI.SANS, weight: '900', lean: 0, align: 'right', color: UI.C.dim });
      y += 122;
    }
    // Lap and time.
    UI.panel(ctx2, x, y, 236, 50, { skew: 14, fill: 'rgba(8,6,20,0.8)', stroke: 'rgba(150,196,225,0.35)' });
    UI.text(ctx2, 'LAP', x + 22, y + 32, { size: 15, font: UI.SANS, weight: '900', lean: 0, color: UI.C.dim });
    UI.text(ctx2, Math.min(lap, total) + '/' + total, x + 60, y + 36, { size: 28, color: lap >= total ? UI.C.orange : '#ffffff' });
    UI.text(ctx2, timing ? fmt(lapTimer) : '--.--', x + 216, y + 34, { size: 22, font: UI.MONO, weight: '800', lean: 0, align: 'right', color: UI.C.gold });
    ctx2.fillStyle = 'rgba(255,255,255,0.12)';
    ctx2.fillRect(x + 20, y + 42, 196, 3);
    ctx2.fillStyle = UI.C.cyan;
    ctx2.fillRect(x + 20, y + 42, 196 * lapProgress(), 3);
    y += 58;
    if (lapTimes.length) {
      UI.text(ctx2, 'BEST ' + fmt(Math.min.apply(null, lapTimes)), x + 22, y + 18, { size: 15, font: UI.MONO, weight: '800', lean: 0, color: UI.C.green });
      y += 26;
    }
    // Gaps to the cars either side of you.
    if (raceRivals) {
      var me = DR.Car.roadS, spd = Math.max(200, currentSpeed()), ahead = null, behind = null, rs = DR.Rivals.all();
      for (var i = 0; i < rs.length; i++) {
        var d = rs[i].s - me;
        if (d > 0 && (!ahead || d < ahead.d)) ahead = { d: d, r: rs[i] };
        if (d < 0 && (!behind || d > behind.d)) behind = { d: d, r: rs[i] };
      }
      var gy = y;
      if (ahead) {
        UI.text(ctx2, '▲ ' + ahead.r.name, x + 20, gy + 18, { size: 16, font: UI.SANS, weight: '900', lean: 0, color: '#ffffff', maxW: 130 });
        UI.text(ctx2, '-' + (ahead.d / spd).toFixed(1) + 's', x + 216, gy + 18, { size: 16, font: UI.MONO, weight: '900', lean: 0, align: 'right', color: '#ff9a7a' });
        gy += 24;
      }
      if (behind) {
        UI.text(ctx2, '▼ ' + behind.r.name, x + 20, gy + 18, { size: 16, font: UI.SANS, weight: '900', lean: 0, color: UI.C.dim, maxW: 130 });
        UI.text(ctx2, '+' + (-behind.d / spd).toFixed(1) + 's', x + 216, gy + 18, { size: 16, font: UI.MONO, weight: '900', lean: 0, align: 'right', color: UI.C.green });
      }
    }
    drawBoostButton(ctx2);
    drawMinimap(ctx2);
    // Slipstream, in words, while it's pulling you.
    if (draftMult > 1.012) {
      UI.text(ctx2, '» SLIPSTREAM «', v.W * 0.5, 64, { size: 22, align: 'center', color: '#7ce4ff', stroke: 'rgba(4,2,10,0.9)',
                                                                 alpha: Math.min(1, (draftMult - 1.012) / 0.02) });
    }
  }

  /* Speedometer, bottom right, mirroring the boost button. The number is
     the reading; the arc is the at-a-glance version of the same thing, and
     it turns orange while a boost is pushing you (with the word BOOST, so
     it's never colour alone). km/h is a display scale, not physics: the
     stock car's cruising speed reads 200. */
  var SPEEDO = { x: 606, y: 1160, r: 76 };
  var KMH = 200 / BASE_SPEED_STOCK, SPEEDO_MAX = 360;
  var shownKmh = 0;
  function drawSpeedo(ctx2) {
    // On the grid the car is held, so the needle sits at zero until GO.
    var UI = DR.UI, g = SPEEDO, kmh = DR.Show.frozen() ? 0 : currentSpeed() * KMH;
    shownKmh += (kmh - shownKmh) * 0.25;                // steady the needle
    var a0 = Math.PI * 0.75, sweep = Math.PI * 1.5;
    var f = Math.max(0, Math.min(1, shownKmh / SPEEDO_MAX));
    var boosting = boostAmount() > 0.05;
    ctx2.save();
    var bg = ctx2.createRadialGradient(g.x, g.y, 10, g.x, g.y, g.r + 6);
    bg.addColorStop(0, 'rgba(20,14,40,0.92)'); bg.addColorStop(1, 'rgba(6,4,14,0.92)');
    ctx2.beginPath(); ctx2.arc(g.x, g.y, g.r + 6, 0, Math.PI * 2);
    ctx2.fillStyle = bg; ctx2.fill();
    ctx2.lineWidth = 2; ctx2.strokeStyle = boosting ? UI.C.orange : 'rgba(150,196,225,0.4)'; ctx2.stroke();
    // Segments: lit up to the speed, cyan into magenta into orange.
    var N = 30;
    for (var i = 0; i < N; i++) {
      var a = a0 + sweep * (i + 0.15) / N, a2 = a0 + sweep * (i + 0.85) / N, lit = (i + 0.5) / N <= f;
      ctx2.beginPath();
      ctx2.arc(g.x, g.y, g.r - 6, a, a2);
      ctx2.lineWidth = 10;
      var q = i / N;
      ctx2.strokeStyle = !lit ? 'rgba(120,140,170,0.18)' : q < 0.5 ? UI.C.cyan : q < 0.8 ? UI.C.magenta : UI.C.orange;
      ctx2.stroke();
    }
    ctx2.restore();
    UI.text(ctx2, String(Math.round(shownKmh)), g.x + 2, g.y + 12, { size: 38, align: 'center', color: '#ffffff' });
    UI.text(ctx2, boosting ? 'BOOST' : 'KM/H', g.x, g.y + 38, { size: 14, font: UI.SANS, weight: '900', lean: 0, align: 'center',
                                                             color: boosting ? UI.C.orange : UI.C.dim });
    ctx2.textBaseline = 'alphabetic';
    ctx2.textAlign = 'left';
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
    ctx2.fillText('NITRO', b.x, b.y + 34);
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


  function inBox(lx, ly, b) {
    return lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h;
  }

  // Every button in the game: slanted, with its accent edge (ui.js).
  function drawButton(ctx2, b, text, o) {
    o = o || {};
    o.t = clock;
    DR.UI.button(ctx2, b, text, o);
    ctx2.textAlign = 'left';
    ctx2.textBaseline = 'alphabetic';
  }

  /* A menu card: the tiles on the title, the modes, the tracks. Slides in
     from the right with a little overshoot (enter: 0..1), glows when it's
     the one selected, and says in words whether it's selected or locked. */
  function drawCard(ctx2, b, o) {
    var UI = DR.UI, p = UI.outBack(o.enter === undefined ? 1 : o.enter);
    var dx = (1 - p) * 420;
    var bx = { x: b.x + dx, y: b.y, w: b.w, h: b.h };
    ctx2.save();
    ctx2.globalAlpha *= UI.clamp01(o.enter === undefined ? 1 : o.enter * 1.6);
    var fill;
    if (o.primary) {
      fill = ctx2.createLinearGradient(bx.x, bx.y, bx.x + bx.w, bx.y + bx.h);
      fill.addColorStop(0, o.on ? 'rgba(255,47,142,0.95)' : 'rgba(170,30,100,0.9)');
      fill.addColorStop(1, o.on ? 'rgba(255,138,61,0.95)' : 'rgba(150,70,30,0.9)');
    } else {
      fill = ctx2.createLinearGradient(bx.x, bx.y, bx.x, bx.y + bx.h);
      fill.addColorStop(0, o.on ? 'rgba(34,70,110,0.95)' : 'rgba(26,20,50,0.92)');
      fill.addColorStop(1, o.on ? 'rgba(14,34,60,0.95)' : 'rgba(10,8,22,0.92)');
    }
    UI.panel(ctx2, bx.x, bx.y, bx.w, bx.h, {
      skew: 22, fill: fill,
      stroke: o.on ? UI.C.cyan : (o.primary ? 'rgba(255,200,160,0.6)' : 'rgba(150,196,225,0.35)'),
      lineWidth: o.on ? 3 : 1.5, glow: o.on ? 'rgba(34,230,255,0.45)' : null,
      accent: o.locked ? 'rgba(140,150,170,0.6)' : (o.accent || (o.primary ? UI.C.gold : UI.C.magenta))
    });
    if (o.on && o.t !== undefined) {
      // The same light sweep as a primary button, over the selected card.
      var ph = (o.t % 3.2) / 0.9;
      if (ph < 1) {
        ctx2.save();
        UI.slant(ctx2, bx.x, bx.y, bx.w, bx.h, 22); ctx2.clip();
        var sx = bx.x - 80 + (bx.w + 160) * ph;
        var sg = ctx2.createLinearGradient(sx - 60, 0, sx + 60, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.16)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx2.fillStyle = sg; ctx2.fillRect(sx - 60, bx.y, 120, bx.h);
        ctx2.restore();
      }
    }
    if (o.draw) o.draw(bx);
    var tx = bx.x + (o.textX || 40);
    UI.text(ctx2, o.title, tx, bx.y + (o.titleY || bx.h * 0.5 + (o.sub ? -2 : 12)), {
      size: o.size || 40, color: o.locked ? 'rgba(170,180,200,0.7)' : '#ffffff',
      stroke: 'rgba(4,2,10,0.55)', maxW: o.titleW || bx.w - 200
    });
    if (o.sub) UI.text(ctx2, o.sub, tx + 4, bx.y + (o.subY || bx.h * 0.5 + 30), {
      size: 17, font: UI.SANS, weight: '800', lean: 0, color: o.primary ? 'rgba(255,240,220,0.95)' : UI.C.dim, maxW: o.subW || bx.w - 80
    });
    var tag = o.locked ? (o.lockText || 'LOCKED') : o.on ? 'TAP AGAIN \u25B8' : (o.badge || '');
    if (tag) {
      UI.text(ctx2, tag, bx.x + bx.w - 28, bx.y + (o.tagY || 36), {
        size: 16, font: UI.SANS, weight: '900', lean: 0, align: 'right',
        color: o.locked ? '#ffb24d' : o.on ? UI.C.gold : (o.badgeColor || UI.C.green)
      });
    }
    ctx2.restore();
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
  // The title's tiles: STORY big across the top, QUICK PLAY and GARAGE
  // side by side, TUTORIAL a strip underneath (same order as TITLE_ITEMS,
  // which is also the order the arrow keys step through).
  var TITLE_TILES = [
    { x: 40, y: 676, w: 640, h: 132 },
    { x: 40, y: 824, w: 314, h: 116 },
    { x: 366, y: 824, w: 314, h: 116 },
    { x: 40, y: 956, w: 640, h: 82 }
  ];
  function titleBox(i) { return TITLE_TILES[i]; }
  var TITLE_CAR_RECT = { x: 150, y: 232, w: 420, h: 398 };

  // The chips along the top of every main screen: level, stars, money.
  // Your name and level, top left of the title; tap it to change the name.
  var NAME_CHIP = { x: 20, y: 18, w: 240, h: 40 };
  function drawTopBar(ctx2, v, enter) {
    var UI = DR.UI, p = UI.outCubic(enter === undefined ? 1 : enter);
    ctx2.save();
    ctx2.globalAlpha *= p;
    ctx2.translate(0, (1 - p) * -60);
    var lv = DR.Career.info();
    UI.chip(ctx2, NAME_CHIP.x, NAME_CHIP.y, NAME_CHIP.w, 'lvl', lv.level, { frac: lv.frac, label: playerName() + '  \u270E' });
    UI.chip(ctx2, 272, 18, 130, 'star', DR.Career.totalStars().got);
    UI.chip(ctx2, 520, 18, 180, 'cr', DR.Save.currency().toLocaleString());
    ctx2.restore();
  }

  /* ------------------------------ THE LOBBY ------------------------------
     Your garage, Asphalt-style: the painted garage from Canva ("lobby") or a
     drawn one, your car turning on a lit platform in the middle, and big
     bold tiles to tap — orange for racing, white for the garage — each with
     its own icon. Everything slides in when you arrive. */
  function drawLobbyBackdrop(ctx2, v, t) {
    var UI = DR.UI, W = v.W, i;
    if (DR.Art.cover(ctx2, 'lobby', 0, 0, W, v.H, { zoom: 1.04 + 0.02 * Math.sin(clock * 0.2) })) {
      var sh = ctx2.createLinearGradient(0, 640, 0, v.H);
      sh.addColorStop(0, 'rgba(4,2,10,0)'); sh.addColorStop(1, 'rgba(4,2,10,0.85)');
      ctx2.fillStyle = sh; ctx2.fillRect(0, 640, W, v.H - 640);
      return;
    }
    // Drawn garage: a back wall of panels with neon strips, ceiling light
    // bars running away from you, and a glossy floor that reflects it all.
    var wall = ctx2.createLinearGradient(0, 0, 0, 600);
    wall.addColorStop(0, '#07060f'); wall.addColorStop(1, '#151229');
    ctx2.fillStyle = wall; ctx2.fillRect(0, 0, W, 600);
    ctx2.strokeStyle = 'rgba(150,170,220,0.08)'; ctx2.lineWidth = 2;
    for (i = 1; i < 8; i++) { ctx2.beginPath(); ctx2.moveTo(i * W / 8, 120); ctx2.lineTo(i * W / 8, 600); ctx2.stroke(); }
    // Ceiling light bars, in perspective.
    for (i = 0; i < 5; i++) {
      var yy = 40 + i * 22, half = 300 - i * 46, gl = 0.75 - i * 0.12;
      ctx2.fillStyle = 'rgba(220,240,255,' + gl.toFixed(2) + ')';
      ctx2.fillRect(W / 2 - half, yy, half * 2, 5 - i * 0.6);
    }
    // Neon strips along the wall, gently breathing.
    var br = 0.75 + 0.25 * Math.sin(clock * 1.5);
    for (i = 0; i < 2; i++) {
      var ny = 300 + i * 46, col = i ? UI.C.cyan : UI.C.magenta;
      ctx2.save();
      ctx2.shadowColor = col; ctx2.shadowBlur = 24;
      ctx2.fillStyle = col; ctx2.globalAlpha = br;
      ctx2.fillRect(0, ny, W, 4);
      ctx2.restore();
    }
    // A big wall sign: the game's mark, in neon tube.
    ctx2.save();
    ctx2.globalAlpha = 0.18;
    UI.text(ctx2, 'DR', W / 2, 260, { size: 150, align: 'center', color: UI.C.magenta });
    ctx2.restore();
    // The floor: glossy, with a perspective grid and the wall's glow in it.
    var fl = ctx2.createLinearGradient(0, 600, 0, v.H);
    fl.addColorStop(0, '#1c1733'); fl.addColorStop(0.4, '#0b0918'); fl.addColorStop(1, '#05040c');
    ctx2.fillStyle = fl; ctx2.fillRect(0, 600, W, v.H - 600);
    ctx2.strokeStyle = 'rgba(120,140,200,0.10)'; ctx2.lineWidth = 1.5;
    for (i = -8; i <= 8; i++) { ctx2.beginPath(); ctx2.moveTo(W / 2 + i * 30, 600); ctx2.lineTo(W / 2 + i * 220, v.H); ctx2.stroke(); }
    for (i = 0; i < 9; i++) { var gy = 600 + Math.pow(i / 8, 2) * (v.H - 600); ctx2.beginPath(); ctx2.moveTo(0, gy); ctx2.lineTo(W, gy); ctx2.stroke(); }
    ctx2.globalAlpha = 0.25 * br;
    ctx2.fillStyle = UI.C.magenta; ctx2.fillRect(0, 640, W, 3);
    ctx2.fillStyle = UI.C.cyan; ctx2.fillRect(0, 690, W, 2);
    ctx2.globalAlpha = 1;
  }

  // Icons for the tiles, drawn in code.
  function drawTileIcon(ctx2, kind, x, y, s, col) {
    var UI = DR.UI;
    ctx2.save();
    ctx2.translate(x, y); ctx2.scale(s, s);
    ctx2.fillStyle = col; ctx2.strokeStyle = col; ctx2.lineCap = 'round'; ctx2.lineJoin = 'round';
    if (kind === 'story') {
      UI.trophy(ctx2, 0, 0, 1.25, col);
    } else if (kind === 'quick') {
      // A chequered flag on a pole.
      ctx2.lineWidth = 6; ctx2.beginPath(); ctx2.moveTo(-34, 40); ctx2.lineTo(-34, -42); ctx2.stroke();
      for (var r = 0; r < 4; r++) for (var c = 0; c < 5; c++) {
        if ((r + c) % 2) continue;
        var wave = Math.sin(clock * 4 + c * 0.9) * 4;
        ctx2.fillRect(-31 + c * 13, -42 + r * 12 + wave, 13, 12);
      }
      ctx2.lineWidth = 2.5; ctx2.globalAlpha = 0.9;
      ctx2.beginPath(); ctx2.rect(-31, -42, 65, 48); ctx2.stroke();
    } else if (kind === 'garage') {
      // A wrench.
      ctx2.rotate(-0.8);
      ctx2.lineWidth = 14; ctx2.beginPath(); ctx2.moveTo(0, -18); ctx2.lineTo(0, 40); ctx2.stroke();
      ctx2.beginPath(); ctx2.arc(0, -30, 20, 0, Math.PI * 2); ctx2.fill();
      ctx2.globalCompositeOperation = 'destination-out';
      ctx2.fillRect(-7, -56, 14, 26);
      ctx2.globalCompositeOperation = 'source-over';
    } else if (kind === 'tutorial') {
      // A steering wheel.
      ctx2.lineWidth = 7;
      ctx2.beginPath(); ctx2.arc(0, 0, 30, 0, Math.PI * 2); ctx2.stroke();
      ctx2.beginPath(); ctx2.arc(0, 0, 8, 0, Math.PI * 2); ctx2.fill();
      ctx2.lineWidth = 6;
      ctx2.beginPath(); ctx2.moveTo(-28, 4); ctx2.lineTo(-8, 2); ctx2.moveTo(28, 4); ctx2.lineTo(8, 2); ctx2.moveTo(0, 8); ctx2.lineTo(0, 28); ctx2.stroke();
    }
    ctx2.restore();
  }

  var LOBBY_STYLE = {
    story:    { a: '#ffbe3d', b: '#ff5f1f', title: '#ffffff', sub: 'rgba(40,14,0,0.85)', icon: '#ffffff' },
    quick:    { a: '#ff9a2e', b: '#ff4a2a', title: '#ffffff', sub: 'rgba(40,10,0,0.85)', icon: '#ffffff' },
    garage:   { a: '#ffffff', b: '#d6deea', title: '#1b2340', sub: 'rgba(27,35,64,0.75)', icon: '#ff6a1f' },
    tutorial: { a: 'rgba(16,24,48,0.92)', b: 'rgba(8,12,28,0.92)', title: '#ffffff', sub: '#9fd8ff', icon: '#22e6ff' }
  };
  function drawLobbyTile(ctx2, b, id, title, sub, o) {
    var UI = DR.UI, st = LOBBY_STYLE[id], p = UI.outBack(UI.clamp01(o.enter));
    var oy = (1 - p) * 260, skew = 18;
    ctx2.save();
    ctx2.globalAlpha *= UI.clamp01(o.enter * 1.5);
    ctx2.translate(0, oy);
    var g = ctx2.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    g.addColorStop(0, st.a); g.addColorStop(1, st.b);
    UI.panel(ctx2, b.x, b.y, b.w, b.h, { skew: skew, fill: g, stroke: o.on ? '#ffffff' : 'rgba(0,0,0,0.35)', lineWidth: o.on ? 4 : 1.5,
                                         glow: o.on ? 'rgba(255,255,255,0.55)' : null });
    // Diagonal stripes on the right, Asphalt-style, and a sheen sweeping by.
    ctx2.save();
    UI.slant(ctx2, b.x, b.y, b.w, b.h, skew); ctx2.clip();
    ctx2.fillStyle = id === 'garage' ? 'rgba(255,106,31,0.10)' : 'rgba(255,255,255,0.13)';
    for (var k = 0; k < 7; k++) {
      var sx = b.x + b.w - 40 - k * 34;
      ctx2.beginPath(); ctx2.moveTo(sx, b.y + b.h); ctx2.lineTo(sx + 16, b.y + b.h); ctx2.lineTo(sx + 16 + b.h * 0.6, b.y); ctx2.lineTo(sx + b.h * 0.6, b.y); ctx2.closePath(); ctx2.fill();
    }
    var ph = ((clock + o.i * 0.7) % 4) / 1.1;
    if (ph < 1) {
      var shx = b.x - 120 + (b.w + 240) * ph;
      var sg = ctx2.createLinearGradient(shx - 70, 0, shx + 70, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.28)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2.fillStyle = sg; ctx2.fillRect(shx - 70, b.y, 140, b.h);
    }
    ctx2.restore();
    // The icon, bobbing gently, on the right.
    var big = id === 'story', isz = big ? 1.15 : id === 'tutorial' ? 0.62 : 0.8;
    drawTileIcon(ctx2, id, b.x + b.w - (big ? 100 : id === 'tutorial' ? 70 : 64), b.y + b.h / 2 + Math.sin(clock * 2 + o.i) * 3 + (id === 'quick' ? 4 : 0), isz, st.icon);
    UI.text(ctx2, title, b.x + 34, b.y + (sub ? b.h / 2 + (big ? 6 : 2) : b.h / 2 + 14), { size: o.size, color: st.title,
      stroke: id === 'garage' ? null : 'rgba(60,20,0,0.35)', maxW: b.w - (big ? 220 : 140) });
    if (sub) UI.text(ctx2, sub, b.x + 38, b.y + b.h / 2 + (big ? 40 : 32), { size: big ? 18 : 14, font: UI.SANS, weight: '900', lean: 0, color: st.sub, maxW: b.w - (big ? 220 : 120) });
    var tag = o.on ? 'TAP AGAIN ▸' : (o.badge || '');
    if (tag) {
      UI.panel(ctx2, b.x + b.w - 168, b.y - 16, 150, 30, { skew: 8, fill: o.on ? '#ffffff' : UI.C.gold });
      UI.text(ctx2, tag, b.x + b.w - 93, b.y + 5, { size: 15, align: 'center', color: '#1b2340' });
    }
    ctx2.restore();
  }

  function drawTitle(ctx2, v) {
    var UI = DR.UI, t = phaseT, i;
    drawLobbyBackdrop(ctx2, v, t);
    drawTopBar(ctx2, v, UI.step(t, 0.1, 0.4));

    // The logo slams in; an underline sweeps after it.
    var lp = UI.outBack(UI.step(t, 0, 0.55));
    UI.text(ctx2, 'DRIFT RUN', v.W * 0.5 - (1 - lp) * 500, 150, {
      size: 76, align: 'center', color: UI.hotGradient(ctx2, 160, 100, 560, 160),
      stroke: 'rgba(4,2,10,0.95)', strokeW: 10, glow: 'rgba(255,47,142,0.55)', glowBlur: 24
    });
    var up = UI.outCubic(UI.step(t, 0.35, 0.5));
    ctx2.fillStyle = UI.C.magenta; ctx2.fillRect(v.W * 0.5 - 220 * up, 166, 440 * up, 4);
    ctx2.fillStyle = UI.C.cyan; ctx2.fillRect(v.W * 0.5 - 140 * up, 174, 280 * up, 3);

    // The turntable: a lit disc with light running round its rim, and your
    // car turning on it.
    var cx = v.W * 0.5, fy = 585;
    var tp = UI.outCubic(UI.step(t, 0.2, 0.5));
    ctx2.save();
    ctx2.translate(cx, fy); ctx2.scale(tp, tp);
    var fg = ctx2.createRadialGradient(0, 0, 10, 0, 0, 280);
    fg.addColorStop(0, 'rgba(34,230,255,0.42)'); fg.addColorStop(0.55, 'rgba(255,47,142,0.16)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx2.fillStyle = fg;
    ctx2.beginPath(); ctx2.ellipse(0, 0, 300, 74, 0, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = 'rgba(10,10,24,0.85)';
    ctx2.beginPath(); ctx2.ellipse(0, 0, 236, 54, 0, 0, Math.PI * 2); ctx2.fill();
    ctx2.lineWidth = 3; ctx2.strokeStyle = 'rgba(34,230,255,0.55)';
    ctx2.beginPath(); ctx2.ellipse(0, 0, 236, 54, 0, 0, Math.PI * 2); ctx2.stroke();
    ctx2.lineWidth = 5; ctx2.strokeStyle = UI.C.magenta;
    var ra = clock * 1.1;
    ctx2.beginPath(); ctx2.ellipse(0, 0, 236, 54, 0, ra, ra + 0.9); ctx2.stroke();
    ctx2.beginPath(); ctx2.ellipse(0, 0, 236, 54, 0, ra + Math.PI, ra + Math.PI + 0.9); ctx2.stroke();
    ctx2.restore();
    var def = DR.Cars.get(DR.Save.selectedCar()) || DR.Cars.get('nightrunner');
    var col = DR.Save.carColor(def.id) || def.color;
    var drew = DR.Car3D && DR.Car3D.render({ archetype: def.archetype, color: col,
                                             yaw: clock * 0.35, rect: TITLE_CAR_RECT });
    if (!drew) drawProfileCar(ctx2, cx - 10, fy - 30, 1.5, col);
    // The car's name plate, under the platform.
    var np = UI.outCubic(UI.step(t, 0.4, 0.4));
    UI.panel(ctx2, cx - 170 - (1 - np) * 300, 622, 340, 44, { skew: 14, fill: 'rgba(8,6,20,0.82)', stroke: 'rgba(150,196,225,0.4)', accent: UI.C.magenta, alpha: np });
    UI.text(ctx2, def.name.toUpperCase(), cx - 150, 652, { size: 22, color: '#ffffff', alpha: np, maxW: 200 });
    UI.text(ctx2, 'RATING ' + DR.Cars.rating(def.id), cx + 154, 651, { size: 16, font: UI.SANS, weight: '900', lean: 0, align: 'right', color: UI.C.green, alpha: np });

    // The tiles, rising one after another.
    var here = DR.Story.currentCity(), city = DR.Story.cities()[here];
    var subs = {
      story: DR.Save.isUnlocked('scene:prologue')
        ? 'CITY ' + (here + 1) + ': ' + city.name + '  •  ' + DR.Career.totalStars().got + ' ★'
        : 'KAI’S LAST RACE  •  START YOUR CAREER',
      quick: 'RACE • RUSH • DUEL',
      garage: DR.Save.ownedCars().length + (DR.Save.ownedCars().length === 1 ? ' CAR' : ' CARS') + '  •  UPGRADE',
      tutorial: DR.Save.isUnlocked(TUTORIAL_ID) ? 'LEARN THE DRIFT AGAIN' : 'NEW? START HERE — +150 CR'
    };
    var names = { story: 'STORY', quick: 'QUICK RACE', garage: 'GARAGE', tutorial: 'TUTORIAL' };
    for (i = 0; i < TITLE_ITEMS.length; i++) {
      var it = TITLE_ITEMS[i], b = titleBox(i);
      var fresh = it.id === 'tutorial' && !DR.Save.isUnlocked(TUTORIAL_ID);
      drawLobbyTile(ctx2, b, it.id, names[it.id] || it.name, subs[it.id], {
        on: i === titleSel, enter: UI.stagger(t, i, 0.09, 0.55, 0.3), i: i,
        size: it.id === 'story' ? 56 : it.id === 'tutorial' ? 30 : 34, badge: fresh ? 'NEW' : ''
      });
    }
    drawControlsLine(ctx2, v, 1090);
    // Quiet, out of the way, and it asks twice.
    var b2 = RESET_BTN;
    drawButton(ctx2, b2, resetArmed > 0 ? 'TAP AGAIN TO ERASE' : 'START OVER', { size: 18, on: resetArmed > 0 });
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    if (resetArmed > 0 || resetDone > 0) {
      ctx2.font = '600 19px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = resetDone > 0 ? '#7dffb0' : '#ffb08a';
      ctx2.fillText(resetDone > 0 ? 'PROGRESS ERASED \u2014 A FRESH START'
                                  : 'ALL CARS, CREDITS AND STORY PROGRESS', v.W * 0.5, b2.y - 22);
    }
    ctx2.textBaseline = 'alphabetic';
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
      garagePop = { kind: 'select', t: 0 };
    } else if (def.cost !== null) {
      DR.Save.buyCar(def.id, def.cost);
      if (DR.Save.ownsCar(def.id)) {
        DR.Save.selectCar(def.id);
        garagePop = { kind: 'buy', t: 0 };
        DR.UI.confetti(90, LOGICAL_W / 2, 740, 500);
      }
    }
  }
  // The last thing bought or chosen here, for its little celebration.
  var garagePop = null, garageSwapT = 0, garageShown = -1;

  function garageBuyUpgrade(systemId) {
    var def = DR.Cars.roster()[garageSel];
    if (!DR.Save.ownsCar(def.id)) return;
    var before = DR.Cars.rating(def.id);
    if (!DR.Cars.buyUpgrade(def.id, systemId)) return;
    garagePop = { kind: 'upgrade', sys: systemId, gain: DR.Cars.rating(def.id) - before, t: 0 };
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
    var UI = DR.UI, t = phaseT;
    var def = ensureGaragePreview();
    var owned = DR.Save.ownsCar(def.id);
    var isSelected = DR.Save.selectedCar() === def.id;
    var i;
    // A different car on the turntable: its name and numbers come in fresh.
    if (garageShown !== garageSel) { garageShown = garageSel; garageSwapT = 0; }
    var sw = garageSwapT;
    if (garagePop && garagePop.t > 2) garagePop = null;

    UI.text(ctx2, 'GARAGE', v.W * 0.5, 112, { size: 46, align: 'center', color: UI.hotGradient(ctx2, 200, 70, 520, 120), stroke: 'rgba(4,2,10,0.9)',
                                             alpha: UI.outCubic(UI.step(t, 0, 0.35)) });
    UI.chip(ctx2, 532, 34, 160, 'cr', DR.Save.currency().toLocaleString());
    // How fast this car really is, as one number (cars.js): the same number
    // each city asks for on its own screen.
    var rating = DR.Cars.rating(def.id);
    UI.panel(ctx2, 552, 86, 140, 64, { skew: 14, fill: 'rgba(10,8,24,0.86)', stroke: 'rgba(125,255,176,0.5)', accent: UI.C.green });
    UI.text(ctx2, 'RATING', 578, 108, { size: 12, font: UI.SANS, weight: '900', lean: 0, color: UI.C.dim });
    UI.text(ctx2, String(rating), 672, 140, { size: 34, align: 'right', color: UI.C.green });

    // One pip per car, so browsing the roster shows where you are in it.
    var n = DR.Cars.roster().length, dotGap = 26, dx = v.W * 0.5 - (n - 1) * dotGap * 0.5;
    for (i = 0; i < n; i++) {
      var pon = i === garageSel;
      UI.slant(ctx2, dx + i * dotGap - (pon ? 10 : 6), 142, pon ? 20 : 12, 6, 3);
      ctx2.fillStyle = pon ? UI.C.cyan : DR.Save.ownsCar(DR.Cars.roster()[i].id) ? 'rgba(125,255,176,0.6)' : 'rgba(150,196,225,0.3)';
      ctx2.fill();
    }

    // The showroom: a spotlight from above and a lit disc on the floor that
    // the car turns on.
    var cone = ctx2.createLinearGradient(0, 160, 0, 640);
    cone.addColorStop(0, 'rgba(34,230,255,0.10)'); cone.addColorStop(1, 'rgba(34,230,255,0)');
    ctx2.fillStyle = cone;
    ctx2.beginPath(); ctx2.moveTo(300, 160); ctx2.lineTo(420, 160); ctx2.lineTo(640, 640); ctx2.lineTo(80, 640); ctx2.closePath(); ctx2.fill();
    var fl = ctx2.createRadialGradient(360, 590, 20, 360, 590, 280);
    fl.addColorStop(0, 'rgba(255,47,142,0.28)'); fl.addColorStop(0.6, 'rgba(34,230,255,0.10)'); fl.addColorStop(1, 'rgba(34,230,255,0)');
    ctx2.fillStyle = fl;
    ctx2.beginPath(); ctx2.ellipse(360, 590, 280, 70, 0, 0, Math.PI * 2); ctx2.fill();
    ctx2.save();
    ctx2.strokeStyle = 'rgba(34,230,255,0.45)'; ctx2.lineWidth = 2;
    ctx2.beginPath(); ctx2.ellipse(360, 590, 230, 52, 0, 0, Math.PI * 2); ctx2.stroke();
    ctx2.strokeStyle = 'rgba(255,47,142,0.5)'; ctx2.lineWidth = 3;
    var ra = clock * 0.8;
    ctx2.beginPath(); ctx2.ellipse(360, 590, 230, 52, 0, ra, ra + 1.2); ctx2.stroke();
    ctx2.beginPath(); ctx2.ellipse(360, 590, 230, 52, 0, ra + Math.PI, ra + Math.PI + 1.2); ctx2.stroke();
    ctx2.restore();

    // The car itself, turning slowly, in its real colours — a real WebGL
    // model (car3d.js) on a transparent canvas laid over this one, with the
    // hand-rolled Canvas 2D car (car.js) kept only as the fallback for a
    // device that can't do WebGL. The in-race car is untouched either way.
    _garagePreview.bodyYaw = 0.55 + Math.sin(clock * 0.45) * 0.18 + (1 - UI.outCubic(UI.step(sw, 0, 0.5))) * 1.2;
    var previewColor = DR.Save.carColor(def.id) || def.color;
    var drew3D = DR.Car3D && DR.Car3D.render({ archetype: def.archetype, color: previewColor, yaw: _garagePreview.bodyYaw, rect: null });
    if (!drew3D) {
      ctx2.save();
      ctx2.translate(0, -GARAGE_PREVIEW_SHIFT_Y);
      DR.Car.drawStatic(ctx2, v, _garagePreview);
      ctx2.restore();
    }
    drawGarageArrow(ctx2, GARAGE_LEFT_ARROW, -1);
    drawGarageArrow(ctx2, GARAGE_RIGHT_ARROW, 1);

    // Name plate, sliding in with each new car.
    var np = UI.outCubic(UI.step(sw, 0.05, 0.4));
    UI.text(ctx2, def.name, v.W * 0.5 + (1 - np) * 120, 708, { size: 46, align: 'center', color: '#ffffff', stroke: 'rgba(4,2,10,0.9)', maxW: 560, alpha: np });
    var tag = def.archetype.toUpperCase() + (isSelected ? '  •  YOUR RIDE' : owned ? '  •  OWNED' : '');
    UI.text(ctx2, tag, v.W * 0.5, 740, { size: 17, font: UI.MONO, weight: '900', lean: 0, align: 'center', color: UI.C.green, alpha: np });
    UI.text(ctx2, def.blurb, v.W * 0.5, 768, { size: 18, font: UI.SANS, weight: '700', lean: 0, align: 'center', color: 'rgba(214,232,246,0.85)', maxW: 640, alpha: np });

    // Browsing an owned car can look at either its stats or its upgrades —
    // a locked car has no upgrades to show yet, so it only ever gets the
    // stats view, and the toggle itself doesn't appear.
    if (owned) drawButton(ctx2, GARAGE_TAB_BTN, garageTab === 'stats' ? 'UPGRADES ▸' : '◂ STATS', { size: 16 });

    if (garageTab === 'upgrades' && owned) {
      drawGarageUpgrades(ctx2, def);
    } else {
      // Four stat bars, always shown relative to the rest of the roster —
      // the numbers behind them are cars.js's (stock plus any upgrades
      // already bought), this just draws whatever it says. They fill up
      // each time a car comes onto the turntable.
      var barX = 190, barW = 400, rowY = 830, rowH = 40;
      for (i = 0; i < GARAGE_STAT_ROWS.length; i++) {
        var y = rowY + i * rowH, f = DR.Cars.statFrac(def, GARAGE_STAT_ROWS[i][1]);
        var fp = UI.outCubic(UI.stagger(sw, i, 0.06, 0.5, 0.1));
        UI.text(ctx2, GARAGE_STAT_ROWS[i][0], 60, y + 14, { size: 17, font: UI.SANS, weight: '900', lean: 0, color: UI.C.dim });
        var segs = 20;
        for (var sg = 0; sg < segs; sg++) {
          var lit = (sg + 0.5) / segs <= f * fp;
          UI.slant(ctx2, barX + sg * (barW / segs), y, barW / segs - 3, 14, 4);
          ctx2.fillStyle = lit ? (isSelected ? UI.C.cyan : UI.C.green) : 'rgba(255,255,255,0.10)';
          ctx2.fill();
        }
        UI.text(ctx2, String(Math.round(f * fp * 100)), 660, y + 14, { size: 17, font: UI.MONO, weight: '900', lean: 0, align: 'right', color: '#ffffff' });
      }

      // Recolouring only makes sense for a car you actually have.
      if (owned) {
        var pal = DR.Cars.palette();
        var curColor = (DR.Save.carColor(def.id) || def.color).toLowerCase();
        for (i = 0; i < pal.length; i++) {
          var b = garageSwatchBox(i, pal.length);
          var on = pal[i].toLowerCase() === curColor;
          var bp = UI.outBack(UI.stagger(sw, i, 0.03, 0.3, 0.25));
          ctx2.save();
          ctx2.translate(b.x + b.w / 2, b.y + b.h / 2); ctx2.scale(bp, bp);
          UI.slant(ctx2, -b.w / 2, -b.h / 2, b.w, b.h, 8);
          ctx2.fillStyle = pal[i]; ctx2.fill();
          ctx2.lineWidth = on ? 3.5 : 1;
          ctx2.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.35)';
          ctx2.stroke();
          ctx2.restore();
        }
      }
    }

    var label = isSelected ? 'SELECTED ✓'
              : owned ? 'SELECT THIS CAR'
              : def.cost === null ? (def.unlock || 'STORY REWARD ONLY')
              : 'BUY — ' + def.cost + ' CR';
    var canAct = !isSelected && (owned || (def.cost !== null && DR.Save.currency() >= def.cost));
    drawButton(ctx2, GARAGE_ACTION_BTN, label, { primary: canAct, disabled: !canAct && !isSelected });

    // Just bought, just chosen: say so, big, for a moment.
    if (garagePop && garagePop.kind !== 'upgrade') {
      var gp = garagePop.t, a = UI.clamp01(1 - UI.step(gp, 1.2, 0.5)), s2 = UI.outBack(UI.step(gp, 0, 0.35));
      // Over the name plate: the 3D car's layer would hide it any higher.
      ctx2.save(); ctx2.translate(v.W / 2, 704); ctx2.scale(s2, s2);
      UI.panel(ctx2, -200, -34, 400, 64, { skew: 18, fill: UI.hotGradient(ctx2, -200, 0, 200, 0), alpha: a });
      UI.text(ctx2, garagePop.kind === 'buy' ? 'NEW CAR!' : 'SELECTED', 0, 12, { size: 34, align: 'center', color: '#ffffff', alpha: a });
      ctx2.restore();
    }

    ctx2.textAlign = 'left';
    drawButton(ctx2, BACK_BTN, '◂ BACK');
  }

  // Four rows, one per upgrade system — every car is upgradable to the same
  // max tier, at a cost scaled off its own price, so a cheap car costs less
  // to fully max than an expensive one, same as buying it in the first
  // place did. A purchase pops: the row lights up and the rating it added
  // floats off it.
  function drawGarageUpgrades(ctx2, def) {
    var UI = DR.UI;
    var systems = DR.Cars.upgradeSystems();
    for (var i = 0; i < systems.length; i++) {
      var sys = systems[i], r = garageUpgradeRowBox(i);
      var tier = DR.Save.upgradeLevel(def.id, sys.id);
      var maxed = DR.Cars.upgradeMaxed(def.id, sys.id);
      var ep = UI.outCubic(UI.stagger(garageSwapT, i, 0.06, 0.35, 0));
      var pop = garagePop && garagePop.kind === 'upgrade' && garagePop.sys === sys.id ? garagePop.t : -1;
      var glow = pop >= 0 ? 1 - UI.step(pop, 0.2, 0.8) : 0;
      ctx2.save();
      ctx2.globalAlpha *= ep;
      ctx2.translate((1 - ep) * 80, 0);
      UI.panel(ctx2, r.x, r.y, r.w, r.h, { skew: 16, fill: 'rgba(10,8,24,0.86)', stroke: glow > 0 ? 'rgba(125,255,176,' + (0.4 + 0.6 * glow).toFixed(2) + ')' : 'rgba(150,196,225,0.3)',
                                           lineWidth: glow > 0 ? 3 : 1.2, accent: maxed ? UI.C.gold : UI.C.cyan, glow: glow > 0 ? 'rgba(125,255,176,' + (0.5 * glow).toFixed(2) + ')' : null });
      UI.text(ctx2, sys.name, r.x + 30, r.y + 28, { size: 20, color: '#ffffff' });
      // Tier pips: filled for what's already bought, hollow for what isn't.
      for (var tt = 0; tt < DR.Cars.MAX_TIER; tt++) {
        var justNow = pop >= 0 && tt === tier - 1;
        var sc = justNow ? 1 + 0.6 * (1 - UI.outCubic(UI.step(pop, 0, 0.4))) : 1;
        ctx2.save(); ctx2.translate(r.x + 40 + tt * 28, r.y + 46); ctx2.scale(sc, sc);
        UI.slant(ctx2, -10, -5, 20, 10, 4);
        ctx2.fillStyle = tt < tier ? (maxed ? UI.C.gold : UI.C.green) : 'rgba(150,196,225,0.25)';
        ctx2.fill();
        ctx2.restore();
      }
      // What the next tier is worth, in the same rating the cities ask for.
      if (!maxed) {
        var gain = DR.Cars.ratingWith(def.id, sys.id) - DR.Cars.rating(def.id);
        UI.text(ctx2, gain > 0 ? '+' + gain + ' RATING' : 'HANDLING', r.x + 140, r.y + 52, { size: 15, font: UI.MONO, weight: '900', lean: 0,
                                                                                         color: gain > 0 ? UI.C.green : UI.C.dim });
      } else {
        UI.text(ctx2, 'MAXED', r.x + 140, r.y + 52, { size: 15, font: UI.MONO, weight: '900', lean: 0, color: UI.C.gold });
      }
      var b = garageUpgradeBtnBox(i);
      var cost = maxed ? 0 : DR.Cars.tierCost(def, tier + 1), afford = !maxed && DR.Save.currency() >= cost;
      UI.panel(ctx2, b.x, b.y, b.w, b.h, { skew: 12, fill: maxed ? 'rgba(255,255,255,0.05)' : afford ? UI.hotGradient(ctx2, b.x, b.y, b.x + b.w, b.y) : 'rgba(10,8,24,0.7)',
                                           stroke: maxed ? 'rgba(150,196,225,0.2)' : 'rgba(150,196,225,0.45)' });
      if (!maxed) UI.coin(ctx2, b.x + 32, b.y + b.h / 2, 10);
      UI.text(ctx2, maxed ? '✓ DONE' : cost + ' CR', b.x + b.w / 2 + (maxed ? 0 : 12), b.y + b.h / 2 + 7,
              { size: 19, font: UI.MONO, weight: '900', lean: 0, align: 'center', color: maxed ? UI.C.dim : afford ? '#ffffff' : UI.C.gold });
      if (pop >= 0 && garagePop.gain > 0) {
        var fu = UI.step(pop, 0, 1.2);
        UI.text(ctx2, '+' + garagePop.gain + ' RATING', r.x + 300, r.y + 20 - fu * 40, { size: 22, align: 'center', color: UI.C.green,
                                                                                     stroke: 'rgba(4,2,10,0.9)', alpha: 1 - fu });
      }
      ctx2.restore();
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

  /* The map. Cities sit at fixed spots (story.js, 0..1 across the map
     area), joined in order by a neon road. A tap picks a city; a second
     tap, or ENTER, goes in. */
  var MAP_AREA = { x: 24, y: 206, w: 672, h: 790 };
  var MAP_NODE_R = 30;
  var MAP_ENTER_BTN = { x: 400, y: 1170, w: 280, h: 64 };
  var MAP_STORY_BTN = { x: 40, y: 1170, w: 250, h: 64 };
  function mapNodeXY(i) {
    var m = DR.Story.mapPos(i);
    return { x: MAP_AREA.x + 40 + m[0] * (MAP_AREA.w - 80), y: MAP_AREA.y + 30 + m[1] * (MAP_AREA.h - 70) };
  }
  function storyRowBox(i) {
    var p = mapNodeXY(i), r = MAP_NODE_R + 12;
    return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
  }
  /* The city view: the city's own circuit drawn large, with a pin at each
     event's spot on it. A tap picks an event; a second tap, or START, runs
     it. */
  var CITY_AREA = { x: 40, y: 244, w: 640, h: 520 };
  var CITY_START_BTN = { x: 380, y: 1164, w: 300, h: 64 };
  var CITY_GARAGE_BTN = { x: 40, y: 1164, w: 300, h: 64 };
  var PIN_R = 28;
  function cityMapBox() {
    var sz = Math.min(CITY_AREA.w, CITY_AREA.h);
    return { x: CITY_AREA.x + (CITY_AREA.w - sz) * 0.5, y: CITY_AREA.y, w: sz, h: sz };
  }
  function pinXY(ci, ei) {
    var n = DR.Story.cities()[ci].events.length;
    var f = n === 3 ? [0.14, 0.48, 0.82][ei] : [0.10, 0.34, 0.58, 0.82][ei];
    var box = cityMapBox(), pts = DR.Road.lapOutline(DR.Story.cities()[ci].track), best = pts[0];
    for (var i = 0; i < pts.length; i++) if (Math.abs(pts[i].f - f) < Math.abs(best.f - f)) best = pts[i];
    var pad = box.w * 0.12;
    return { x: box.x + pad + best.nx * (box.w - pad * 2), y: box.y + pad + (1 - best.ny) * (box.h - pad * 2) };
  }
  function cityEventBox(i) {
    var p = pinXY(storySel, i), r = PIN_R + 12;
    return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
  }
  var SCENE_SKIP_BTN = { x: 524, y: 34, w: 156, h: 56 };
  var DONE_RETRY_BTN  = { x: 60, y: 1120, w: 280, h: 74 };
  var DONE_CONT_BTN   = { x: 380, y: 1120, w: 280, h: 74 };



  function rgbOf(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function cityEdge(i) {
    var t = DR.Story.themeFor(i);
    return (t && t.edge) || [65, 224, 255];
  }

  function drawPadlockAt(ctx2, x, y, sc, color) {
    ctx2.lineWidth = 3 * sc;
    ctx2.strokeStyle = color;
    ctx2.beginPath();
    ctx2.arc(x, y - 4 * sc, 7 * sc, Math.PI, 0);
    ctx2.stroke();
    ctx2.fillStyle = color;
    ctx2.fillRect(x - 10 * sc, y - 4 * sc, 20 * sc, 15 * sc);
  }

  /* The map. Drawn, not listed: a dark sheet with a coastline, mountains in
     the north, the ten cities joined by the road you drive between them.
     Opening it plays out like a campaign map: the sheet fades up, the road
     draws itself city to city, the cities pop in, and the panel for the
     chosen one slides up from the bottom. Every state is said in words or
     shapes as well as colour — a padlock on a locked city, a tick on a
     beaten one, "YOU" over where you are, stars as a count. */
  function quadAt(a, c, b, u) {
    var k = 1 - u;
    return { x: k * k * a.x + 2 * k * u * c.x + u * u * b.x, y: k * k * a.y + 2 * k * u * c.y + u * u * b.y };
  }
  function drawStory(ctx2, v) {
    var zk = mapZoom ? DR.UI.inOutCubic(DR.UI.clamp01(mapZoom.t / MAP_ZOOM_T)) : 0;
    if (zk > 0) {
      var zp = mapNodeXY(mapZoom.ci), zs = 1 + 3.2 * zk;
      ctx2.save();
      ctx2.translate(zp.x + (v.W / 2 - zp.x) * zk, zp.y + (v.H / 2 - zp.y) * zk);
      ctx2.scale(zs, zs);
      ctx2.translate(-zp.x, -zp.y);
    }
    drawStoryMap(ctx2, v);
    if (zk > 0) {
      ctx2.restore();
      ctx2.fillStyle = 'rgba(4,2,10,' + (0.9 * zk * zk).toFixed(3) + ')';
      ctx2.fillRect(0, 0, v.W, v.H);
      DR.UI.text(ctx2, DR.Story.cities()[mapZoom.ci].name, v.W / 2, v.H / 2 + 20, { size: 64, align: 'center',
        color: DR.UI.hotGradient(ctx2, 160, v.H / 2 - 40, 560, v.H / 2 + 20), stroke: 'rgba(4,2,10,0.9)', alpha: DR.UI.clamp01(zk * 2 - 0.6) });
    }
  }
  function drawStoryMap(ctx2, v) {
    var UI = DR.UI, t = phaseT;
    var cities = DR.Story.cities(), i, A = MAP_AREA;
    if (!mapZoom) {
      UI.header(ctx2, v.W, 'THE CIRCUIT', 'KAI’S LAST RACE', t);
      drawStoryChips(ctx2, v, UI.step(t, 0.1, 0.4));
    }

    // The sheet, fading up.
    var sp = UI.outCubic(UI.step(t, 0.05, 0.4));
    ctx2.save();
    ctx2.globalAlpha *= sp;
    UI.panel(ctx2, A.x, A.y, A.w, A.h, { skew: 0, fill: 'rgba(8,6,20,0.95)', stroke: 'rgba(150,196,225,0.3)', lineWidth: 1.5 });
    ctx2.beginPath(); ctx2.rect(A.x, A.y, A.w, A.h); ctx2.clip();
    // The painted map (Canva), when it's here: the land, the sea and the
    // mountains are in the painting; the roads and cities go on top.
    var painted = DR.Art.cover(ctx2, 'map', A.x, A.y, A.w, A.h);
    if (painted) { ctx2.fillStyle = 'rgba(4,2,10,0.25)'; ctx2.fillRect(A.x, A.y, A.w, A.h); }
    if (!painted) {
    ctx2.strokeStyle = 'rgba(120,160,220,0.06)';
    ctx2.lineWidth = 1;
    for (i = 1; i < 12; i++) {
      ctx2.beginPath(); ctx2.moveTo(A.x + i * A.w / 12, A.y); ctx2.lineTo(A.x + i * A.w / 12, A.y + A.h); ctx2.stroke();
      ctx2.beginPath(); ctx2.moveTo(A.x, A.y + i * A.h / 12); ctx2.lineTo(A.x + A.w, A.y + i * A.h / 12); ctx2.stroke();
    }
    // Sea to the south and east, with a slow swell of wave lines on it.
    ctx2.beginPath();
    ctx2.moveTo(A.x, A.y + A.h * 0.975);
    ctx2.quadraticCurveTo(A.x + A.w * 0.40, A.y + A.h * 1.0, A.x + A.w * 0.66, A.y + A.h * 0.965);
    ctx2.quadraticCurveTo(A.x + A.w * 0.97, A.y + A.h * 0.92, A.x + A.w * 0.95, A.y + A.h * 0.62);
    ctx2.quadraticCurveTo(A.x + A.w * 0.93, A.y + A.h * 0.50, A.x + A.w, A.y + A.h * 0.44);
    ctx2.lineTo(A.x + A.w, A.y + A.h); ctx2.lineTo(A.x, A.y + A.h); ctx2.closePath();
    ctx2.fillStyle = 'rgba(30,80,140,0.28)';
    ctx2.fill();
    ctx2.strokeStyle = 'rgba(125,227,255,0.35)';
    ctx2.lineWidth = 2;
    ctx2.stroke();
    ctx2.save();
    ctx2.clip();
    ctx2.strokeStyle = 'rgba(125,227,255,0.10)';
    ctx2.lineWidth = 1.5;
    for (i = 0; i < 9; i++) {
      var wy = A.y + A.h * (0.46 + i * 0.06), ph = clock * 0.6 + i;
      ctx2.beginPath();
      for (var wx = 0; wx <= A.w; wx += 24) {
        var yy = wy + Math.sin(wx * 0.03 + ph) * 3;
        if (wx) ctx2.lineTo(A.x + wx, yy); else ctx2.moveTo(A.x + wx, yy);
      }
      ctx2.stroke();
    }
    ctx2.restore();
    // Mountains in the north-west.
    ctx2.fillStyle = 'rgba(150,160,210,0.10)';
    for (i = 0; i < 7; i++) {
      var mx0 = A.x + A.w * (0.04 + i * 0.07), my0 = A.y + A.h * (0.26 + (i % 2) * 0.03);
      ctx2.beginPath(); ctx2.moveTo(mx0 - 34, my0 + 30); ctx2.lineTo(mx0, my0 - 34); ctx2.lineTo(mx0 + 34, my0 + 30); ctx2.closePath(); ctx2.fill();
    }
    }
    ctx2.restore();

    // The road between the cities, drawing itself in order. Driven
    // stretches glow, with a light running along them.
    for (i = 0; i + 1 < cities.length; i++) {
      var a = mapNodeXY(i), b = mapNodeXY(i + 1);
      var open = DR.Story.cityUnlocked(i + 1);
      var c0 = { x: (a.x + b.x) * 0.5 + (b.y - a.y) * 0.18, y: (a.y + b.y) * 0.5 - (b.x - a.x) * 0.18 };
      var rp = UI.inOutCubic(UI.step(t, 0.2 + i * 0.07, 0.22));
      if (rp <= 0) continue;
      ctx2.beginPath();
      for (var k = 0; k <= 24; k++) {
        var q = quadAt(a, c0, b, rp * k / 24);
        if (k) ctx2.lineTo(q.x, q.y); else ctx2.moveTo(q.x, q.y);
      }
      ctx2.setLineDash(open ? [] : [10, 10]);
      ctx2.lineWidth = open ? 10 : 4;
      ctx2.strokeStyle = open ? 'rgba(34,230,255,0.22)' : 'rgba(150,170,200,0.22)';
      ctx2.stroke();
      if (open) {
        ctx2.lineWidth = 3.5;
        ctx2.strokeStyle = '#22e6ff';
        ctx2.stroke();
      }
      ctx2.setLineDash([]);
      if (open && rp >= 1) {
        var lp = quadAt(a, c0, b, (clock * 0.45 + i * 0.37) % 1);
        var lg = ctx2.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, 14);
        lg.addColorStop(0, 'rgba(255,255,255,0.9)'); lg.addColorStop(0.4, 'rgba(34,230,255,0.5)'); lg.addColorStop(1, 'rgba(34,230,255,0)');
        ctx2.fillStyle = lg;
        ctx2.beginPath(); ctx2.arc(lp.x, lp.y, 14, 0, Math.PI * 2); ctx2.fill();
      }
    }

    // The cities, popping in one after another.
    var here = DR.Story.currentCity();
    for (i = 0; i < cities.length; i++) {
      var np = UI.outBack(UI.stagger(t, i, 0.07, 0.35, 0.25));
      if (np <= 0) continue;
      var p = mapNodeXY(i), st = DR.Story.cityState(i), on = i === storySel;
      var edge = cityEdge(i), r = (MAP_NODE_R + (on ? 4 : 0)) * np;
      ctx2.save();
      ctx2.globalAlpha *= UI.clamp01(np);
      if (on) {
        // A slow breathe around the chosen city — a glow, never a blink.
        var br = 0.5 + 0.5 * Math.sin(clock * 2.2);
        ctx2.beginPath();
        ctx2.arc(p.x, p.y, r + 10 + br * 4, 0, Math.PI * 2);
        ctx2.lineWidth = 3;
        ctx2.strokeStyle = 'rgba(65,224,255,' + (0.45 + 0.35 * br).toFixed(2) + ')';
        ctx2.stroke();
      }
      if (st.unlocked) {
        var halo = ctx2.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 2);
        halo.addColorStop(0, rgbOf(edge, 0.28)); halo.addColorStop(1, rgbOf(edge, 0));
        ctx2.fillStyle = halo;
        ctx2.beginPath(); ctx2.arc(p.x, p.y, r * 2, 0, Math.PI * 2); ctx2.fill();
      }
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx2.fillStyle = !st.unlocked ? 'rgba(24,22,36,0.95)' : st.bossBeaten ? rgbOf(edge, 0.35) : 'rgba(12,10,28,0.95)';
      ctx2.fill();
      ctx2.lineWidth = on ? 4 : 3;
      ctx2.strokeStyle = st.unlocked ? rgbOf(edge, 1) : 'rgba(120,130,150,0.6)';
      ctx2.stroke();
      if (!st.unlocked) drawPadlockAt(ctx2, p.x, p.y, 0.9 * np, 'rgba(160,170,190,0.9)');
      else UI.text(ctx2, st.bossBeaten ? '✓' : String(i + 1), p.x, p.y + 9, { size: 26, align: 'center', color: '#ffffff', lean: 0 });
      // Name under the city, in words; stars under that once there are any.
      UI.text(ctx2, cities[i].name, p.x, p.y + r + 22, {
        size: on ? 18 : 15, font: UI.SANS, weight: '900', lean: 0, align: 'center', stroke: 'rgba(4,2,10,0.9)', strokeW: 4,
        color: st.unlocked ? (on ? '#ffffff' : 'rgba(220,234,246,0.85)') : 'rgba(160,170,190,0.7)' });
      var cs = DR.Career.cityStars(i);
      if (st.unlocked && cs.got) {
        UI.star(ctx2, p.x - 18, p.y + r + 38, 7, true);
        UI.text(ctx2, cs.got + '/' + cs.max, p.x - 6, p.y + r + 44, { size: 13, font: UI.MONO, weight: '800', lean: 0, color: UI.C.gold, stroke: 'rgba(4,2,10,0.9)', strokeW: 3 });
      }
      // Where you are.
      if (i === here) {
        var bob = Math.sin(clock * 2.5) * 3;
        ctx2.fillStyle = UI.C.magenta;
        ctx2.beginPath();
        ctx2.moveTo(p.x, p.y - r - 8 + bob);
        ctx2.lineTo(p.x - 11, p.y - r - 26 + bob);
        ctx2.lineTo(p.x + 11, p.y - r - 26 + bob);
        ctx2.closePath();
        ctx2.fill();
        UI.text(ctx2, 'YOU', p.x, p.y - r - 32 + bob, { size: 15, align: 'center', color: UI.C.gold, stroke: 'rgba(4,2,10,0.9)', strokeW: 4 });
      }
      ctx2.restore();
    }

    if (mapZoom) return;
    // The chosen city, on a panel sliding up from the bottom.
    var c = cities[storySel], sst = DR.Story.cityState(storySel);
    var pp = UI.outCubic(UI.step(t, 0.35, 0.45)), oy = (1 - pp) * 220;
    ctx2.save();
    ctx2.globalAlpha *= pp;
    ctx2.translate(0, oy);
    UI.panel(ctx2, 24, 1008, 672, 148, { skew: 24, fill: 'rgba(10,8,24,0.94)', stroke: rgbOf(cityEdge(storySel), 0.7), lineWidth: 2,
                                         accent: sst.unlocked ? rgbOf(cityEdge(storySel), 1) : 'rgba(120,130,150,0.8)' });
    UI.text(ctx2, c.name, 52, 1050, { size: 32, color: '#ffffff', maxW: 400 });
    var line1 = !sst.unlocked ? 'LOCKED — BEAT ' + cities[storySel - 1].boss + ' FIRST'
              : 'BOSS: ' + c.boss + '  •  ' + sst.cleared + '/' + sst.total + ' CLEARED' + (sst.bossBeaten ? '  •  DONE ✓' : '');
    UI.text(ctx2, line1, 52, 1082, { size: 17, font: UI.SANS, weight: '900', lean: 0, color: UI.C.dim, maxW: 460 });
    UI.text(ctx2, sst.unlocked ? c.intro : 'KEEP FOLLOWING THE TRAIL.', 52, 1110, { size: 17, font: UI.SANS, weight: '700', lean: 0, color: 'rgba(214,232,246,0.85)', maxW: 600 });
    UI.text(ctx2, c.reward.car ? 'PRIZE: CAR' : 'PRIZE: CASH', 672, 1044, { size: 16, font: UI.MONO, weight: '900', lean: 0, align: 'right', color: c.reward.car ? UI.C.gold : UI.C.green });
    var cst = DR.Career.cityStars(storySel);
    for (i = 0; i < 3; i++) UI.star(ctx2, 580 + i * 34, 1068, 12, cst.got >= (i + 1) * cst.max / 3);
    UI.text(ctx2, cst.got + '/' + cst.max + ' ★', 672, 1098, { size: 14, font: UI.MONO, weight: '800', lean: 0, align: 'right', color: UI.C.dim });
    UI.text(ctx2, 'NEEDS ~' + DR.Story.ratingNeed(storySel) + ' RATING', 672, 1140, { size: 15, font: UI.MONO, weight: '800', lean: 0, align: 'right', color: UI.C.dim });
    ctx2.restore();

    var bp = UI.outCubic(UI.step(t, 0.5, 0.4));
    ctx2.save(); ctx2.globalAlpha *= bp; ctx2.translate(0, (1 - bp) * 80);
    drawButton(ctx2, MAP_STORY_BTN, '▶ STORY SO FAR');
    drawButton(ctx2, MAP_ENTER_BTN, sst.unlocked ? 'ENTER CITY ▸' : 'LOCKED', { primary: sst.unlocked });
    ctx2.restore();
    ctx2.textAlign = 'left';
    drawButton(ctx2, BACK_BTN, '◂ TITLE');
  }

  // Stars and credits, top right, on the story screens.
  function drawStoryChips(ctx2, v, enter) {
    var UI = DR.UI, p = UI.outCubic(enter);
    ctx2.save();
    ctx2.globalAlpha *= p;
    ctx2.translate(0, (1 - p) * -60);
    UI.chip(ctx2, 402, 34, 120, 'star', DR.Career.totalStars().got);
    UI.chip(ctx2, 532, 34, 160, 'cr', DR.Save.currency().toLocaleString());
    ctx2.restore();
  }

  function bestText(ci, ei) {
    var id = DR.Story.eventId(ci, ei), b = DR.Save.bestResult('story:' + id);
    if (!b) return '';
    var ev = DR.Story.cities()[ci].events[ei];
    return ev.type === 'race' ? 'BEST ' + ordinal(b.value) : 'BEST ' + fmt(b.value);
  }

  /* The city view. The city's own circuit drawn big, in the city's neon,
     with a pin at each place something happens: a flag for a race, a
     stopwatch for a time attack, a crown for the boss. Pick one, and the
     panel underneath says what it asks and what it pays. */
  function drawEventIcon(ctx2, type, x, y, col) {
    ctx2.fillStyle = col;
    ctx2.strokeStyle = col;
    if (type === 'race') {
      // A chequered flag.
      ctx2.fillRect(x - 10, y - 12, 2.5, 24);
      for (var q = 0; q < 6; q++) {
        if ((q + Math.floor(q / 3)) % 2) continue;
        ctx2.fillRect(x - 7 + (q % 3) * 6, y - 12 + Math.floor(q / 3) * 6, 6, 6);
      }
      ctx2.lineWidth = 1.5;
      ctx2.strokeRect(x - 7, y - 12, 18, 12);
    } else if (type === 'time') {
      ctx2.lineWidth = 3;
      ctx2.beginPath(); ctx2.arc(x, y + 2, 11, 0, Math.PI * 2); ctx2.stroke();
      ctx2.beginPath(); ctx2.moveTo(x, y + 2); ctx2.lineTo(x, y - 5); ctx2.moveTo(x, y + 2); ctx2.lineTo(x + 6, y + 4); ctx2.stroke();
      ctx2.fillRect(x - 3, y - 13, 6, 4);
    } else {
      // A crown.
      ctx2.beginPath();
      ctx2.moveTo(x - 13, y + 9); ctx2.lineTo(x - 13, y - 6); ctx2.lineTo(x - 6, y + 1);
      ctx2.lineTo(x, y - 10); ctx2.lineTo(x + 6, y + 1); ctx2.lineTo(x + 13, y - 6); ctx2.lineTo(x + 13, y + 9);
      ctx2.closePath(); ctx2.fill();
    }
  }

  function drawCity(ctx2, v) {
    var UI = DR.UI, t = phaseT;
    var ci = storySel, c = DR.Story.cities()[ci], i;
    var edge = cityEdge(ci);
    UI.header(ctx2, v.W, c.name, 'CITY ' + (ci + 1) + ' OF 10  •  BOSS: ' + c.boss, t);
    drawStoryChips(ctx2, v, UI.step(t, 0.1, 0.4));
    UI.text(ctx2, c.intro, v.W * 0.5, 222, { size: 18, font: UI.SANS, weight: '700', lean: 0, align: 'center', color: 'rgba(214,232,246,0.9)',
                                            maxW: 640, alpha: UI.step(t, 0.2, 0.3) });

    // The district: the circuit, drawing itself as a road in the city's
    // colours, a light lapping it once it's drawn.
    var box = cityMapBox(), ap = UI.outCubic(UI.step(t, 0.05, 0.35));
    ctx2.save();
    ctx2.globalAlpha *= ap;
    UI.panel(ctx2, CITY_AREA.x, CITY_AREA.y, CITY_AREA.w, CITY_AREA.h, { skew: 0, fill: 'rgba(6,4,14,0.78)', stroke: rgbOf(edge, 0.35), lineWidth: 1.5 });
    ctx2.restore();
    var pts = DR.Road.lapOutline(c.track);
    var pad = box.w * 0.12, iw = box.w - pad * 2, ih = box.h - pad * 2;
    var xy = [], len = 0;
    for (i = 0; i < pts.length; i++) {
      xy.push({ x: box.x + pad + pts[i].nx * iw, y: box.y + pad + (1 - pts[i].ny) * ih });
      if (i) len += Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y);
    }
    len += Math.hypot(xy[0].x - xy[xy.length - 1].x, xy[0].y - xy[xy.length - 1].y);
    var dp = UI.inOutCubic(UI.step(t, 0.15, 0.7));
    ctx2.beginPath();
    for (i = 0; i < xy.length; i++) { if (i) ctx2.lineTo(xy[i].x, xy[i].y); else ctx2.moveTo(xy[i].x, xy[i].y); }
    ctx2.closePath();
    ctx2.save();
    ctx2.lineJoin = 'round';
    if (dp < 1) { ctx2.setLineDash([len * dp, len]); }
    ctx2.lineWidth = 22; ctx2.strokeStyle = 'rgba(20,18,30,0.95)'; ctx2.stroke();
    ctx2.lineWidth = 26; ctx2.strokeStyle = rgbOf(edge, 0.18); ctx2.stroke();
    ctx2.lineWidth = 16; ctx2.strokeStyle = 'rgba(14,12,22,1)'; ctx2.stroke();
    ctx2.lineWidth = 2; ctx2.strokeStyle = rgbOf(edge, 0.9); ctx2.stroke();
    ctx2.restore();
    if (dp >= 1) {
      var run = (clock * 0.12) % 1, lx = xy[Math.floor(run * xy.length) % xy.length];
      var lg = ctx2.createRadialGradient(lx.x, lx.y, 0, lx.x, lx.y, 16);
      lg.addColorStop(0, 'rgba(255,255,255,0.9)'); lg.addColorStop(0.4, rgbOf(edge, 0.55)); lg.addColorStop(1, rgbOf(edge, 0));
      ctx2.fillStyle = lg; ctx2.beginPath(); ctx2.arc(lx.x, lx.y, 16, 0, Math.PI * 2); ctx2.fill();
    }
    UI.text(ctx2, 'CIRCUIT: ' + DR.Road.tracks()[c.track].name, v.W * 0.5, CITY_AREA.y + CITY_AREA.h - 12,
            { size: 15, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: rgbOf(edge, 0.85), alpha: ap });

    // The pins, dropping onto the map one by one.
    var ev = c.events;
    for (i = 0; i < ev.length; i++) {
      var pp = UI.stagger(t, i, 0.1, 0.4, 0.5);
      if (pp <= 0) continue;
      var bp = UI.outBack(pp), p0 = pinXY(ci, i), p = { x: p0.x, y: p0.y - (1 - bp) * 70 }, on = i === citySel;
      var done = DR.Story.cleared(ci, i), locked = DR.Story.eventLocked(ci, i) && !done;
      var boss = ev[i].type === 'boss';
      ctx2.save();
      ctx2.globalAlpha *= UI.clamp01(pp * 2);
      // The shadow it drops onto.
      ctx2.fillStyle = 'rgba(0,0,0,' + (0.35 * pp).toFixed(3) + ')';
      ctx2.beginPath(); ctx2.ellipse(p0.x, p0.y + PIN_R + 6, PIN_R * 0.8 * pp, 6 * pp, 0, 0, Math.PI * 2); ctx2.fill();
      if (on) {
        var br = 0.5 + 0.5 * Math.sin(clock * 2.2);
        ctx2.beginPath(); ctx2.arc(p.x, p.y, PIN_R + 9 + br * 3, 0, Math.PI * 2);
        ctx2.lineWidth = 3; ctx2.strokeStyle = 'rgba(65,224,255,' + (0.5 + 0.35 * br).toFixed(2) + ')'; ctx2.stroke();
      }
      if (boss && !locked) {
        var bg = ctx2.createRadialGradient(p.x, p.y, PIN_R * 0.5, p.x, p.y, PIN_R * 2.2);
        bg.addColorStop(0, 'rgba(255,215,106,0.35)'); bg.addColorStop(1, 'rgba(255,215,106,0)');
        ctx2.fillStyle = bg; ctx2.beginPath(); ctx2.arc(p.x, p.y, PIN_R * 2.2, 0, Math.PI * 2); ctx2.fill();
      }
      ctx2.beginPath(); ctx2.arc(p.x, p.y, PIN_R, 0, Math.PI * 2);
      ctx2.fillStyle = locked ? 'rgba(24,22,36,0.96)' : boss ? 'rgba(70,48,10,0.96)' : 'rgba(12,10,28,0.96)';
      ctx2.fill();
      ctx2.lineWidth = 3;
      ctx2.strokeStyle = locked ? 'rgba(130,140,160,0.7)' : boss ? '#ffd76a' : rgbOf(edge, 1);
      ctx2.stroke();
      if (locked) drawPadlockAt(ctx2, p.x, p.y, 0.8, 'rgba(160,170,190,0.9)');
      else drawEventIcon(ctx2, ev[i].type, p.x, p.y, boss ? '#ffd76a' : '#eaf6ff');
      if (done) {
        ctx2.beginPath(); ctx2.arc(p.x + PIN_R * 0.72, p.y - PIN_R * 0.72, 11, 0, Math.PI * 2);
        ctx2.fillStyle = '#7dffb0'; ctx2.fill();
        UI.text(ctx2, '✓', p.x + PIN_R * 0.72, p.y - PIN_R * 0.72 + 5, { size: 14, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: '#062a16' });
      }
      var below = !(p0.y > box.y + box.h * 0.5);
      var ly = below ? p.y + PIN_R + 22 : p.y - PIN_R - 10;
      UI.text(ctx2, DR.Story.placeName(ci, i), p.x, ly, { size: on ? 17 : 15, font: UI.SANS, weight: '900', lean: 0, align: 'center',
                                                          stroke: 'rgba(4,2,10,0.92)', strokeW: 4, color: on ? '#ffffff' : 'rgba(214,232,246,0.85)' });
      // Stars won here, on the other side of the pin from its name.
      var ns = DR.Save.stars('story:' + DR.Story.eventId(ci, i));
      if (!locked) {
        var sy = below ? p.y - PIN_R - 14 : p.y + PIN_R + 16;
        for (var s2 = 0; s2 < 3; s2++) UI.star(ctx2, p.x - 18 + s2 * 18, sy, 7, s2 < ns);
      }
      ctx2.restore();
    }

    // The chosen event, on a panel sliding in from the right.
    var st = DR.Story.setup(ci, citySel), selLocked = DR.Story.eventLocked(ci, citySel);
    var selBoss = ev[citySel].type === 'boss';
    var ep = UI.outCubic(UI.step(t, 0.3, 0.45)), ex = (1 - ep) * 720;
    ctx2.save();
    ctx2.globalAlpha *= ep;
    ctx2.translate(ex, 0);
    UI.panel(ctx2, 24, 776, 672, 156, { skew: 24, fill: 'rgba(10,8,24,0.94)', stroke: selBoss ? 'rgba(255,215,106,0.7)' : rgbOf(edge, 0.6), lineWidth: 2,
                                        accent: selBoss ? UI.C.gold : rgbOf(edge, 1) });
    UI.text(ctx2, st.label + '  •  ' + DR.Story.placeName(ci, citySel), 56, 816, { size: 28, color: selBoss ? UI.C.gold : '#ffffff', maxW: 480 });
    UI.text(ctx2, selLocked && selBoss ? 'CLEAR THE OTHERS FIRST' : st.requirement, 56, 850, { size: 19, font: UI.SANS, weight: '800', lean: 0, color: 'rgba(214,232,246,0.92)', maxW: 600 });
    UI.text(ctx2, st.reward, 56, 882, { size: 19, font: UI.MONO, weight: '800', lean: 0, color: UI.C.green, maxW: 600 });
    var status = DR.Story.cleared(ci, citySel) ? 'CLEARED ✓  ' + bestText(ci, citySel) : bestText(ci, citySel);
    UI.text(ctx2, status, 56, 912, { size: 16, font: UI.SANS, weight: '800', lean: 0, color: UI.C.dim });
    var ns2 = DR.Save.stars('story:' + DR.Story.eventId(ci, citySel));
    for (i = 0; i < 3; i++) UI.star(ctx2, 586 + i * 32, 808, 12, i < ns2);
    ctx2.restore();

    // Car or driving? The rating says, as a number, a bar and a word.
    var have = DR.Cars.rating(DR.Save.selectedCar()), need = DR.Story.ratingNeed(ci);
    var rp = UI.outCubic(UI.step(t, 0.4, 0.45)), car = DR.Cars.get(DR.Save.selectedCar());
    ctx2.save();
    ctx2.globalAlpha *= rp;
    ctx2.translate(-(1 - rp) * 720, 0);
    UI.panel(ctx2, 24, 950, 672, 120, { skew: 24, fill: 'rgba(10,8,24,0.9)', stroke: 'rgba(150,196,225,0.35)',
                                        accent: have >= need ? UI.C.green : UI.C.orange });
    UI.text(ctx2, 'DRIVING', 56, 984, { size: 14, font: UI.SANS, weight: '900', lean: 0, color: UI.C.dim });
    UI.text(ctx2, car ? car.name.toUpperCase() : '', 56, 1016, { size: 26, color: '#ffffff', maxW: 280 });
    UI.text(ctx2, have >= need ? 'READY' : 'UPGRADE', 664, 1016, { size: 24, align: 'right', color: have >= need ? UI.C.green : UI.C.orange });
    var lo = Math.min(have, need) - 12, hi = Math.max(have, need) + 8, bx = 56, bw = 600, by = 1036;
    ctx2.fillStyle = 'rgba(255,255,255,0.12)'; ctx2.fillRect(bx, by, bw, 10);
    ctx2.fillStyle = have >= need ? UI.C.green : UI.C.orange;
    ctx2.fillRect(bx, by, bw * UI.clamp01((have - lo) / (hi - lo)) * UI.step(t, 0.5, 0.6), 10);
    var nx = bx + bw * (need - lo) / (hi - lo);
    ctx2.fillStyle = '#ffffff'; ctx2.fillRect(nx - 1.5, by - 6, 3, 22);
    UI.text(ctx2, 'YOU ' + have, bx, by + 30, { size: 14, font: UI.MONO, weight: '800', lean: 0, color: '#ffffff' });
    UI.text(ctx2, 'BOSS NEEDS ~' + need, Math.min(bx + bw, nx + 60), by + 30, { size: 14, font: UI.MONO, weight: '800', lean: 0, align: 'right', color: UI.C.dim });
    ctx2.restore();

    var bp2 = UI.outCubic(UI.step(t, 0.5, 0.4));
    ctx2.save(); ctx2.globalAlpha *= bp2; ctx2.translate(0, (1 - bp2) * 80);
    drawButton(ctx2, CITY_GARAGE_BTN, 'GARAGE ▸');
    drawButton(ctx2, CITY_START_BTN, selLocked ? 'LOCKED' : 'START ▸', { primary: !selLocked });
    ctx2.restore();
    ctx2.textAlign = 'left';
    drawButton(ctx2, BACK_BTN, '◂ MAP');
  }

  /* ------------------------------ STORY CARDS ------------------------------
     A scene is a title, and lines revealed one tap at a time over the city
     it happens in: that city's own sky, a car on the horizon, and the words
     in a panel below. Speakers get their name in their own colour (and in
     words — never colour alone). SKIP is always there. */
  var sceneQueue = [], sceneLine = 0, sceneT = 0, sceneThen = null;
  function showScenes(list, then) {
    sceneQueue = list.slice();
    sceneLine = 0; sceneT = 0; sceneThen = then || null;
    phase = 'scene';
    DR.Input.releaseAll(); DR.Input.clearTap();
  }
  function finishScenes() {
    var f = sceneThen;
    sceneQueue = []; sceneThen = null;
    if (f) f(); else phase = 'story';
  }
  function sceneAdvance() {
    var sc = sceneQueue[0];
    if (!sc) { finishScenes(); return; }
    if (sceneLine < sc.lines.length - 1) { sceneLine++; sceneT = 0; return; }
    sceneQueue.shift(); sceneLine = 0; sceneT = 0; phaseT = 0;
    if (!sceneQueue.length) finishScenes();
  }
  function speakerColor(who) {
    var cities = DR.Story.cities();
    for (var i = 0; i < cities.length; i++) if (cities[i].boss === who) return cities[i].bossColor;
    return who === 'WRENCH' ? '#ff9a5c' : '#ffd76a';
  }
  function wrapLines(ctx2, text, maxW) {
    var words = text.split(' '), line = '', out = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx2.measureText(test).width > maxW && line) { out.push(line); line = words[i]; }
      else line = test;
    }
    if (line) out.push(line);
    return out;
  }
  /* A story scene, as a comic page. A big painted panel up top (from
     Canva: scene.<key>.<line> or scene.<key>; the code-drawn street scene
     if there's no painting), then the conversation underneath: narration
     in yellow caption boxes, speech in white bubbles pointing at the
     speaker's face. The newest line pops in; the two before it stay, so it
     reads down the page like a strip. Faces are face.<NAME> from Canva,
     or a drawn silhouette in the speaker's colour with their initial. */
  function sceneArt(sc, line) {
    if (!sc.key) return null;
    var a = 'scene.' + sc.key + '.' + (line + 1), b = 'scene.' + sc.key;
    return DR.Art.has(a) ? a : (DR.Art.has(b) ? b : null);
  }
  function drawFace(ctx2, who, x, y, r, t) {
    var UI = DR.UI, col = speakerColor(who), p = UI.outBack(UI.clamp01(t));
    ctx2.save();
    ctx2.translate(x, y); ctx2.scale(p, p);
    ctx2.beginPath(); ctx2.arc(0, 0, r, 0, Math.PI * 2); ctx2.closePath();
    ctx2.fillStyle = '#0c0a1c'; ctx2.fill();
    ctx2.save(); ctx2.clip();
    if (!DR.Art.cover(ctx2, 'face.' + who, -r, -r, r * 2, r * 2)) {
      var g = ctx2.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r * 1.2);
      g.addColorStop(0, col); g.addColorStop(1, '#0c0a1c');
      ctx2.globalAlpha = 0.55; ctx2.fillStyle = g; ctx2.fillRect(-r, -r, r * 2, r * 2); ctx2.globalAlpha = 1;
      ctx2.fillStyle = '#05040c';
      ctx2.beginPath(); ctx2.arc(0, -r * 0.18, r * 0.38, 0, Math.PI * 2); ctx2.fill();
      ctx2.beginPath(); ctx2.ellipse(0, r * 0.78, r * 0.72, r * 0.52, 0, Math.PI, 0); ctx2.fill();
      ctx2.strokeStyle = col; ctx2.lineWidth = 2; ctx2.globalAlpha = 0.8;
      ctx2.beginPath(); ctx2.arc(0, -r * 0.18, r * 0.38, Math.PI * 1.1, Math.PI * 1.9); ctx2.stroke();
      ctx2.globalAlpha = 1;
    }
    ctx2.restore();
    ctx2.lineWidth = 4; ctx2.strokeStyle = col;
    ctx2.beginPath(); ctx2.arc(0, 0, r, 0, Math.PI * 2); ctx2.stroke();
    UI.panel(ctx2, -r * 0.9, r * 0.62, r * 1.8, 26, { skew: 8, fill: col });
    UI.text(ctx2, who, 0, r * 0.62 + 19, { size: 15, align: 'center', color: '#05040c', maxW: r * 1.7 });
    ctx2.restore();
  }
  // A speech bubble: white, round-cornered, with a tail to the speaker.
  function drawBubble(ctx2, x, y, w, h, tailX, tailY, p, dim) {
    ctx2.save();
    var cx = x + w / 2, cy = y + h / 2;
    ctx2.translate(cx, cy); ctx2.scale(p, p); ctx2.translate(-cx, -cy);
    ctx2.globalAlpha *= dim ? 0.55 : 1;
    var right = tailX > cx, ex = right ? x + w : x, ty = Math.min(y + h - 18, Math.max(y + 18, cy + 6));
    function rr() {
      var r = 22;
      ctx2.beginPath();
      ctx2.moveTo(x + r, y); ctx2.lineTo(x + w - r, y); ctx2.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx2.lineTo(x + w, y + h - r); ctx2.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx2.lineTo(x + r, y + h); ctx2.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx2.lineTo(x, y + r); ctx2.quadraticCurveTo(x, y, x + r, y); ctx2.closePath();
    }
    function tail() {
      ctx2.beginPath();
      ctx2.moveTo(ex, ty - 14); ctx2.lineTo(tailX, tailY); ctx2.lineTo(ex, ty + 14); ctx2.closePath();
    }
    ctx2.lineWidth = 4; ctx2.strokeStyle = '#05040c'; ctx2.fillStyle = '#ffffff';
    tail(); ctx2.fill(); ctx2.stroke();
    rr(); ctx2.fill(); ctx2.stroke();
    // Cover the bubble's outline where the tail joins it.
    ctx2.beginPath();
    ctx2.moveTo(ex + (right ? -3 : 3), ty - 11); ctx2.lineTo(ex + (right ? 8 : -8), ty); ctx2.lineTo(ex + (right ? -3 : 3), ty + 11);
    ctx2.closePath(); ctx2.fill();
    ctx2.restore();
  }
  function drawScene(ctx2, v) {
    var UI = DR.UI, W = v.W, t = phaseT, i;
    var sc = sceneQueue[0];
    if (!sc) return;
    var line = sc.lines[sceneLine];
    // The page: the city's sky, darkened, behind everything.
    var cityId = sc.city !== undefined ? DR.Story.cities()[sc.city].id : 'portside';
    if (!DR.Art.cover(ctx2, 'sky.' + cityId, 0, 0, W, v.H, { alpha: 0.35 })) { /* drawn sky shows */ }
    ctx2.fillStyle = 'rgba(4,2,10,0.6)';
    ctx2.fillRect(0, 0, W, v.H);
    // Halftone dots, for the comic-print feel.
    ctx2.fillStyle = 'rgba(255,255,255,0.035)';
    for (var hy = 0; hy < v.H; hy += 14) for (var hx = (hy / 14 % 2) * 7; hx < W; hx += 14) ctx2.fillRect(hx, hy, 2.4, 2.4);

    // The big panel, sliding in with a slight tilt; the painting drifts.
    var pp = UI.outCubic(UI.step(t, 0, 0.5));
    var P = { x: 34, y: 116, w: 652, h: 500 };
    ctx2.save();
    ctx2.translate(W / 2, P.y + P.h / 2);
    ctx2.rotate(-0.015 + (1 - pp) * -0.06);
    ctx2.translate(-W / 2 + (1 - pp) * -520, -(P.y + P.h / 2));
    ctx2.fillStyle = '#05040c'; ctx2.fillRect(P.x - 8, P.y - 8, P.w + 16, P.h + 16);
    ctx2.fillStyle = '#f4f1e8'; ctx2.fillRect(P.x - 4, P.y - 4, P.w + 8, P.h + 8);
    var art = sceneArt(sc, sceneLine);
    var kb = (clock * 0.02) % 1;
    if (!(art && DR.Art.cover(ctx2, art, P.x, P.y, P.w, P.h, { zoom: 1.08 + 0.04 * Math.sin(clock * 0.15), fx: 0.5 + 0.12 * Math.sin(clock * 0.1), fy: 0.45 }))) {
      // Drawn fallback: a street at night with the car (and the speaker's).
      ctx2.save();
      ctx2.beginPath(); ctx2.rect(P.x, P.y, P.w, P.h); ctx2.clip();
      var g = ctx2.createLinearGradient(0, P.y, 0, P.y + P.h);
      g.addColorStop(0, '#1a0b33'); g.addColorStop(0.55, '#5b1c5a'); g.addColorStop(0.62, '#ff7a4d'); g.addColorStop(0.63, '#120a1f'); g.addColorStop(1, '#05040c');
      ctx2.fillStyle = g; ctx2.fillRect(P.x, P.y, P.w, P.h);
      ctx2.fillStyle = '#ff9a5c'; ctx2.beginPath(); ctx2.arc(W / 2, P.y + P.h * 0.6, 90, Math.PI, 0); ctx2.fill();
      for (i = 0; i < 14; i++) {
        var bw = 30 + (i * 37) % 50, bh = 60 + (i * 53) % 140, bx = P.x + i * 50 - 10;
        ctx2.fillStyle = '#0a0614'; ctx2.fillRect(bx, P.y + P.h * 0.62 - bh, bw, bh);
        ctx2.fillStyle = i % 2 ? 'rgba(255,47,142,0.7)' : 'rgba(34,230,255,0.7)';
        for (var wy = 0; wy < bh - 14; wy += 16) if ((i + wy) % 3) ctx2.fillRect(bx + 6, P.y + P.h * 0.62 - bh + 8 + wy, 4, 6);
      }
      var carCol = line.who ? speakerColor(line.who) : '#c8121f';
      drawProfileCar(ctx2, W / 2 - 60 + Math.min(1, sceneT / 0.8) * 30, P.y + P.h * 0.86, 1.3, carCol);
      ctx2.restore();
    }
    // Title caption, top-left of the panel, comic style.
    var tw = Math.min(520, 60 + sc.title.length * 26);
    UI.panel(ctx2, P.x - 14, P.y - 22, tw, 64, { skew: 0, fill: '#ffd23f', stroke: '#05040c', lineWidth: 4 });
    UI.text(ctx2, sc.title, P.x + 8, P.y + 22, { size: 32, color: '#05040c', maxW: tw - 30 });
    if (sc.sub) {
      UI.panel(ctx2, P.x + P.w - 250, P.y + P.h - 26, 260, 40, { skew: 0, fill: '#05040c', stroke: '#ffd23f', lineWidth: 3 });
      UI.text(ctx2, sc.sub, P.x + P.w - 120, P.y + P.h + 2, { size: 17, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: '#ffd23f', maxW: 240 });
    }
    ctx2.restore();

    // The conversation: the newest line and up to two before it.
    var first = Math.max(0, sceneLine - 2), y = 660;
    var rows = [];
    for (i = first; i <= sceneLine; i++) rows.push(i);
    for (var ri = 0; ri < rows.length; ri++) {
      var li = rows[ri], L = sc.lines[li], cur = li === sceneLine;
      var pop = cur ? UI.outBack(UI.clamp01(sceneT / 0.3)) : 1;
      if (!L.who) {
        // Narration: a yellow caption box.
        ctx2.font = 'italic 800 22px ' + UI.SANS;
        var nl = wrapLines(ctx2, L.text, 560);
        var nh = 24 + nl.length * 30;
        ctx2.save();
        ctx2.translate(W / 2, y + nh / 2); ctx2.scale(pop, pop); ctx2.rotate(ri % 2 ? 0.01 : -0.01); ctx2.translate(-W / 2, -(y + nh / 2));
        ctx2.globalAlpha *= cur ? 1 : 0.55;
        ctx2.fillStyle = '#ffd23f'; ctx2.fillRect(70, y, 580, nh);
        ctx2.lineWidth = 4; ctx2.strokeStyle = '#05040c'; ctx2.strokeRect(70, y, 580, nh);
        ctx2.fillStyle = '#1a1206'; ctx2.textAlign = 'left'; ctx2.textBaseline = 'alphabetic';
        for (var q = 0; q < nl.length; q++) ctx2.fillText(nl[q], 90, y + 36 + q * 30);
        ctx2.restore();
        y += nh + 18;
      } else {
        // Speech: a face on one side, the bubble beside it.
        var right = L.who !== 'WRENCH' && L.who !== 'KAI' ? true : false;
        ctx2.font = '800 22px ' + UI.SANS;
        var sl = wrapLines(ctx2, '“' + L.text + '”', 430);
        var sh = Math.max(96, 30 + sl.length * 30);
        var fx = right ? W - 92 : 92, fy = y + 50;
        var bx = right ? 60 : 180, bwid = 480;
        drawBubble(ctx2, bx, y, bwid, sh, right ? fx - 62 : fx + 62, fy + 6, pop, !cur);
        ctx2.save(); ctx2.globalAlpha *= cur ? 1 : 0.55;
        ctx2.fillStyle = '#05040c'; ctx2.textAlign = 'left'; ctx2.textBaseline = 'alphabetic';
        ctx2.font = '800 22px ' + UI.SANS;
        var pcx = bx + bwid / 2, pcy = y + sh / 2;
        ctx2.translate(pcx, pcy); ctx2.scale(pop, pop); ctx2.translate(-pcx, -pcy);
        for (var q2 = 0; q2 < sl.length; q2++) ctx2.fillText(sl[q2], bx + 26, y + 40 + q2 * 30);
        ctx2.restore();
        ctx2.save(); ctx2.globalAlpha *= cur ? 1 : 0.6;
        drawFace(ctx2, L.who, fx, fy, 56, cur ? sceneT / 0.3 : 1);
        ctx2.restore();
        y += sh + 22;
      }
    }

    var last = sceneLine === sc.lines.length - 1 && sceneQueue.length === 1;
    if (last && sc.ending) {
      UI.text(ctx2, 'THE END', W * 0.5, 1210, { size: 44, align: 'center', color: UI.C.green, stroke: 'rgba(4,2,10,0.9)' });
    } else {
      var pulse = 0.75 + 0.25 * Math.sin(clock * 3);
      UI.text(ctx2, last ? 'TAP TO CONTINUE ▸' : 'TAP FOR MORE ▸', W * 0.5, 1206, { size: 24, align: 'center', color: UI.C.gold, alpha: pulse });
    }
    var n = sc.lines.length;
    for (i = 0; i < n; i++) {
      ctx2.fillStyle = i <= sceneLine ? UI.C.cyan : 'rgba(150,196,225,0.25)';
      ctx2.fillRect(W * 0.5 - n * 11 + i * 22, 1226, 16, 4);
    }
    UI.text(ctx2, (sceneLine + 1) + ' / ' + n, W * 0.5, 1252, { size: 14, font: UI.MONO, weight: '800', lean: 0, align: 'center', color: UI.C.dim });
    ctx2.textAlign = 'left';
    drawButton(ctx2, SCENE_SKIP_BTN, 'SKIP ▸▸');
  }

  // A car side-on, from rectangles and circles: low body, cabin, two
  // wheels, a light at each end.
  function drawProfileCar(ctx2, x, y, sc, col, flip) {
    ctx2.save();
    ctx2.translate(x, y);
    ctx2.scale(flip ? -sc : sc, sc);
    ctx2.fillStyle = 'rgba(0,0,0,0.45)';
    ctx2.beginPath(); ctx2.ellipse(0, 26, 110, 10, 0, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = col;
    ctx2.beginPath();
    ctx2.moveTo(-100, 12); ctx2.lineTo(-96, -6); ctx2.lineTo(-40, -14); ctx2.lineTo(-10, -36);
    ctx2.lineTo(44, -36); ctx2.lineTo(74, -12); ctx2.lineTo(102, -6); ctx2.lineTo(104, 12);
    ctx2.closePath(); ctx2.fill();
    ctx2.fillStyle = 'rgba(10,14,24,0.85)';
    ctx2.beginPath(); ctx2.moveTo(-4, -31); ctx2.lineTo(40, -31); ctx2.lineTo(62, -13); ctx2.lineTo(-30, -13); ctx2.closePath(); ctx2.fill();
    ctx2.fillStyle = '#111';
    ctx2.beginPath(); ctx2.arc(-60, 14, 17, 0, Math.PI * 2); ctx2.fill();
    ctx2.beginPath(); ctx2.arc(66, 14, 17, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = '#555';
    ctx2.beginPath(); ctx2.arc(-60, 14, 7, 0, Math.PI * 2); ctx2.fill();
    ctx2.beginPath(); ctx2.arc(66, 14, 7, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = '#fff4c8'; ctx2.fillRect(96, -4, 8, 6);
    ctx2.fillStyle = '#ff3a3a'; ctx2.fillRect(-100, -4, 6, 6);
    ctx2.restore();
  }

  // A time attack's own read-out: the target, and how much of it is left.
  // "LEFT" and "OVER" are written out, not just coloured.
  function drawTimeHud(ctx2, v) {
    var UI = DR.UI;
    var used = timing ? raceTotal + lapTimer : 0;
    var left = timeTarget - used, over = left < 0;
    var x = 272, y = 18, w = 240;
    UI.panel(ctx2, x, y, w, 118, { skew: 20, fill: 'rgba(8,6,20,0.84)', stroke: over ? UI.C.orange : 'rgba(150,196,225,0.45)',
                                   lineWidth: 2, accent: over ? UI.C.orange : UI.C.green });
    UI.text(ctx2, 'TARGET ' + fmt(timeTarget), x + w / 2, y + 28, { size: 15, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim });
    UI.text(ctx2, (over ? '+' : '') + fmt(Math.abs(left)), x + w / 2, y + 76, { size: 44, font: UI.MONO, weight: '900', lean: 0, align: 'center',
                                                                              color: over ? '#ff8a6a' : '#ffffff' });
    UI.text(ctx2, over ? 'OVER' : 'LEFT', x + w / 2, y + 104, { size: 17, align: 'center', color: over ? '#ff8a6a' : UI.C.green });
  }

  function drawModes(ctx2, v) {
    var UI = DR.UI;
    UI.header(ctx2, v.W, 'QUICK PLAY', 'CHOOSE A MODE', phaseT);
    for (var i = 0; i < MODES.length; i++) {
      (function (m) {
        drawCard(ctx2, modeBox(i), {
          title: m.name, sub: m.blurb,
          on: i === modeSel, t: clock, enter: UI.stagger(phaseT, i, 0.07, 0.5, 0.1),
          size: 38, titleY: 60, subY: 128, subW: 540, accent: [UI.C.magenta, UI.C.cyan, UI.C.orange, UI.C.green][i],
          draw: function (bx) {
            UI.text(ctx2, m.tag, bx.x + 44, bx.y + 96, { size: 17, font: UI.MONO, weight: '800', lean: 0, color: UI.C.green });
          }
        });
      })(MODES[i]);
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
    var UI = DR.UI, tracks = DR.Road.tracks(), i;
    var modeName = { race: 'RACE', practice: 'PRACTICE', rush: 'CHECKPOINT RUSH', duel: 'DUEL' }[mode] || 'RACE';
    var sub = mode === 'practice' ? 'CHOOSE YOUR CIRCUIT'
            : mode === 'rush' ? 'CHOOSE YOUR CIRCUIT  •  BEAT THE CLOCK'
            : 'CHOOSE YOUR CIRCUIT  •  ' + lapsFor(mode) + ' LAPS';
    UI.header(ctx2, v.W, modeName, sub, phaseT);
    for (i = 0; i < tracks.length; i++) {
      (function (i) {
        var b = cardBox(i), open = trackOpen(i), tr = tracks[i];
        drawCard(ctx2, b, {
          title: tr.name, on: i === selected, t: clock, locked: !open,
          lockText: 'LOCKED', enter: UI.stagger(phaseT, i, 0.06, 0.45, 0.1),
          size: 30, textX: 160, titleY: 50, titleW: 300,
          sub: open ? tr.blurb : DR.Story.trackLockText(i), subY: 118, subW: 440,
          draw: function (bx) {
            drawOutline(ctx2, { x: bx.x + 18, y: bx.y + 8, w: 130, h: 130 }, i, null, 2);
            UI.text(ctx2, tr.tag, bx.x + 164, bx.y + 84, { size: 16, font: UI.MONO, weight: '800', lean: 0, color: UI.C.green });
            UI.text(ctx2, 'TARGET ' + tr.targetSecs + 's', bx.x + 320, bx.y + 84, { size: 16, font: UI.MONO, weight: '800', lean: 0, color: UI.C.gold });
            if (!open) drawPadlock(ctx2, bx.x + bx.w - 40, bx.y + 76);
          }
        });
      })(i);
    }
    drawControlsLine(ctx2, v, 1248);
    ctx2.textAlign = 'left';
  }

  /* ------------------------------ RESULTS ------------------------------
     One results screen for every mode, arriving in stages the way racing
     games do it: the headline slams in (with a trophy for a podium), the
     standings slide in, your numbers count up, then what it paid: the
     prize, style credits, XP filling the level bar (and LEVEL UP if it
     did), and stars popping in on a story event. A win rains confetti.
     Any tap on the way skips to the end of the show. */
  var resultsConfetti = false;
  var RESULTS_SETTLE = 2.4;   // by then every stage of the results is in
  function resultsSkippable() {
    return phase === 'done' && mode !== 'tutorial' && DR.Show.enabled() && phaseT < RESULTS_SETTLE;
  }
  function drawDone(ctx2, v) {
    if (mode === 'tutorial') { drawTutorialDone(ctx2, v); return; }
    var spec = { rows: null, lines: [] };
    if (mode === 'rush') {
      var beat = rushScore >= rushBest && rushScore > 0;
      spec.headline = 'TIME UP'; spec.headColor = '#ff8a6a';
      spec.sub = DR.Road.tracks()[DR.Road.currentTrack()].name + '  •  CHECKPOINT RUSH';
      spec.big = rushScore + ' m'; spec.bigLabel = beat ? 'NEW BEST' : 'BEST ' + rushBest + ' m';
      spec.lines = [rushGates + ' GATES  •  ' + rushLapsDone() + (rushLapsDone() === 1 ? ' LAP' : ' LAPS')];
    } else if (mode === 'duel') {
      var winner = duelTimes[1] < duelTimes[0] ? 2 : 1;
      spec.headline = 'PLAYER ' + winner + ' WINS'; spec.medal = 1;
      spec.sub = 'DUEL  •  BY ' + Math.abs(duelTimes[0] - duelTimes[1]).toFixed(2) + 's';
      spec.rows = [0, 1].map(function (i) {
        return { name: 'PLAYER ' + (i + 1), color: i ? '#7ce4ff' : '#ffd76a', label: fmt(duelTimes[i]), isPlayer: i + 1 === winner };
      });
      if (duelTimes[1] < duelTimes[0]) spec.rows.reverse();
    } else if (mode === 'time') {
      var ok = raceTotal <= timeTarget;
      spec.headline = ok ? 'TARGET BEATEN' : 'TOO SLOW'; spec.medal = ok ? 1 : 0;
      spec.headColor = ok ? null : '#ff8a6a';
      spec.sub = resultsSubtitle();
      spec.big = fmt(raceTotal); spec.bigLabel = 'TARGET ' + fmt(timeTarget);
      spec.lines = lapTimes.map(function (t, i) { return 'LAP ' + (i + 1) + '  ' + fmt(t); });
    } else if (standings) {
      var me = null, i;
      for (i = 0; i < standings.length; i++) if (standings[i].isPlayer) me = standings[i];
      spec.headline = ordinal(finishPos) + ' PLACE';
      // A medal for the podium, but last of two is a loss, not a silver.
      spec.medal = finishPos < standings.length || finishPos === 1 ? finishPos : 0;
      if (!spec.medal) spec.headColor = '#ff8a6a';
      spec.sub = resultsSubtitle();
      spec.big = fmt(me ? me.time : raceTotal);
      spec.bigLabel = lapTimes.length ? 'BEST LAP ' + fmt(Math.min.apply(null, lapTimes)) : '';
      spec.rows = standings.map(function (r) {
        var gap = r.time - me.time;
        return { name: r.name, color: r.color, isPlayer: r.isPlayer, you: r.isPlayer, boss: r.boss,
                 label: r.isPlayer ? fmt(r.time) : (r.estimated ? '~' : '') + (gap >= 0 ? '+' : '−') + Math.abs(gap).toFixed(2) };
      });
    } else {
      spec.headline = 'RACE COMPLETE'; spec.sub = resultsSubtitle(); spec.big = fmt(raceTotal);
    }
    drawResults(ctx2, v, spec);
  }

  function drawResults(ctx2, v, spec) {
    var UI = DR.UI, t = phaseT, W = v.W, i;
    if (t < 0.05 && !resultsConfetti && spec.medal === 1 && DR.Show.enabled()) {
      resultsConfetti = true;
      UI.confetti(120, W / 2, 180, 600);
    }
    if (t > 0.5) resultsConfetti = false;
    ctx2.fillStyle = 'rgba(6,4,16,0.82)';
    ctx2.fillRect(0, 0, W, v.H);
    UI.backdrop(ctx2, W, v.H, clock, spec.medal === 1 ? UI.C.gold : UI.C.cyan);

    // Headline, slamming down from big.
    var hp = UI.outBack(UI.step(t, 0, 0.45));
    var medalCol = spec.medal === 1 ? UI.C.gold : spec.medal === 2 ? UI.C.silver : spec.medal === 3 ? UI.C.bronze : null;
    if (medalCol) {
      var tp = UI.outBack(UI.step(t, 0.1, 0.5));
      ctx2.save();
      ctx2.globalAlpha = UI.clamp01(tp);
      // Light behind the trophy: rays, turning slowly.
      ctx2.globalAlpha *= 0.25;
      for (i = 0; i < 12; i++) {
        var a = clock * 0.25 + i * Math.PI / 6;
        ctx2.beginPath(); ctx2.moveTo(W / 2, 128);
        ctx2.lineTo(W / 2 + Math.cos(a - 0.07) * 180, 128 + Math.sin(a - 0.07) * 180);
        ctx2.lineTo(W / 2 + Math.cos(a + 0.07) * 180, 128 + Math.sin(a + 0.07) * 180);
        ctx2.closePath(); ctx2.fillStyle = medalCol; ctx2.fill();
      }
      ctx2.restore();
      UI.trophy(ctx2, W / 2, 128, 1.35 * (0.5 + 0.5 * tp), medalCol);
    }
    ctx2.save();
    ctx2.translate(W / 2, 244);
    var sc = 2 - hp;
    ctx2.scale(sc, sc);
    UI.text(ctx2, spec.headline, 0, 0, { size: 64, align: 'center', stroke: 'rgba(4,2,10,0.95)', strokeW: 10, maxW: 640,
      color: spec.headColor || (medalCol ? UI.hotGradient(ctx2, -220, -60, 220, 10) : '#ffffff'), alpha: UI.clamp01(hp) });
    ctx2.restore();
    UI.text(ctx2, spec.sub || '', W / 2, 282, { size: 18, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim, alpha: UI.step(t, 0.2, 0.3) });
    var y = 300;
    if (spec.big) {
      UI.text(ctx2, spec.big, W / 2, y + 52, { size: 50, font: UI.MONO, weight: '900', lean: 0, align: 'center', color: '#ffffff', alpha: UI.step(t, 0.25, 0.3) });
      if (spec.bigLabel) UI.text(ctx2, spec.bigLabel, W / 2, y + 82, { size: 18, font: UI.MONO, weight: '800', lean: 0, align: 'center', color: UI.C.green, alpha: UI.step(t, 0.3, 0.3) });
      y += 100;
    }
    // Standings, sliding in one by one.
    if (spec.rows) {
      for (i = 0; i < spec.rows.length; i++) {
        var r = spec.rows[i], rp = UI.outCubic(UI.stagger(t, i, 0.08, 0.35, 0.3));
        var ry = y + i * 54, rx = 60 + (1 - rp) * 500;
        ctx2.save();
        ctx2.globalAlpha = rp;
        UI.panel(ctx2, rx, ry, 600, 46, { skew: 16, fill: r.isPlayer ? 'rgba(40,90,130,0.9)' : 'rgba(12,9,26,0.88)',
                                          stroke: r.isPlayer ? UI.C.cyan : 'rgba(150,196,225,0.3)', lineWidth: r.isPlayer ? 2.5 : 1.2,
                                          accent: i === 0 ? UI.C.gold : i === 1 ? UI.C.silver : i === 2 ? UI.C.bronze : 'rgba(120,130,150,0.8)' });
        UI.text(ctx2, ordinal(i + 1), rx + 34, ry + 32, { size: 22, color: '#ffffff' });
        ctx2.beginPath(); ctx2.arc(rx + 112, ry + 23, 8, 0, Math.PI * 2); ctx2.fillStyle = r.color; ctx2.fill();
        UI.text(ctx2, r.name, rx + 132, ry + 32, { size: 22, color: r.isPlayer ? UI.C.gold : r.boss ? UI.C.gold : '#ffffff', maxW: 260 });
        UI.text(ctx2, r.you ? 'YOU  ' + r.label : r.label, rx + 578, ry + 31, { size: 20, font: UI.MONO, weight: '800', lean: 0, align: 'right',
                                                                                 color: r.isPlayer ? UI.C.gold : UI.C.dim });
        ctx2.restore();
      }
      y += spec.rows.length * 54 + 8;
    }
    for (i = 0; i < spec.lines.length; i++) {
      UI.text(ctx2, spec.lines[i], W / 2, y + 26 + i * 30, { size: 20, font: UI.MONO, weight: '800', lean: 0, align: 'center', color: '#ffffff', alpha: UI.stagger(t, i, 0.08, 0.3, 0.35) });
    }
    y += spec.lines.length * 30 + (spec.lines.length ? 14 : 0);

    // Your numbers, counting up.
    var R = results;
    if (R) {
      var sp = UI.step(t, 0.8, 0.8);
      var tiles = [
        ['TOP SPEED', UI.countUp(R.stats.topKmh, sp) + '', 'KM/H'],
        ['OVERTAKES', UI.countUp(R.stats.overtakes, sp) + '', ''],
        ['TAKEDOWNS', UI.countUp(R.stats.takedowns + R.stats.shunts, sp) + '', ''],
        ['STYLE', UI.countUp(R.stats.style, sp) + '', 'PTS']
      ];
      for (i = 0; i < tiles.length; i++) {
        var tx = 40 + i * 162, tpp = UI.outCubic(UI.stagger(t, i, 0.06, 0.3, 0.75));
        UI.panel(ctx2, tx, y + (1 - tpp) * 30, 150, 74, { skew: 12, fill: 'rgba(12,9,26,0.9)', stroke: 'rgba(150,196,225,0.3)', alpha: tpp });
        UI.text(ctx2, tiles[i][0], tx + 78, y + 22 + (1 - tpp) * 30, { size: 13, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim, alpha: tpp });
        UI.text(ctx2, tiles[i][1], tx + 78, y + 56 + (1 - tpp) * 30, { size: 28, align: 'center', color: '#ffffff', alpha: tpp });
      }
      y += 104;
      // What it paid.
      var pp = UI.outCubic(UI.step(t, 1.2, 0.4));
      UI.panel(ctx2, 40, y, 640, 170, { skew: 22, fill: 'rgba(12,9,26,0.92)', stroke: 'rgba(255,215,106,0.45)', accent: UI.C.gold, alpha: pp });
      ctx2.save(); ctx2.globalAlpha = pp;
      var cp = UI.step(t, 1.3, 0.8);
      UI.coin(ctx2, 84, y + 42, 16);
      UI.text(ctx2, '+' + UI.countUp(doneAward, cp) + ' CR', 110, y + 52, { size: 30, color: UI.C.gold });
      var extra = [];
      if (R.styleCash) extra.push('+' + R.styleCash + ' STYLE');
      if (R.starAward && R.starAward.cash) extra.push('+' + R.starAward.cash + ' STARS');
      if (R.xp.cash) extra.push('+' + R.xp.cash + ' LEVEL UP');
      UI.text(ctx2, extra.join('   '), 76, y + 90, { size: 17, font: UI.MONO, weight: '900', lean: 0, color: UI.C.green, maxW: 440,
                                                      alpha: UI.step(t, 1.5, 0.3) });
      // The XP bar, filling from where it was.
      var xp = R.xp, xpP = UI.step(t, 1.5, 1.0);
      var lvlShown = xpP < 1 && xp.levelsGained ? xp.before.level : xp.after.level;
      var fracNow = xp.levelsGained ? (xpP < 0.5 ? xp.before.frac + (1 - xp.before.frac) * (xpP / 0.5) : xp.after.frac * ((xpP - 0.5) / 0.5))
                                    : xp.before.frac + (xp.after.frac - xp.before.frac) * UI.outCubic(xpP);
      UI.levelBadge(ctx2, 84, y + 132, 22, xpP >= 0.5 ? xp.after.level : lvlShown);
      ctx2.fillStyle = 'rgba(255,255,255,0.14)'; ctx2.fillRect(118, y + 126, 400, 12);
      ctx2.fillStyle = UI.C.cyan; ctx2.fillRect(118, y + 126, 400 * UI.clamp01(fracNow), 12);
      UI.text(ctx2, '+' + UI.countUp(R.xp.xp, xpP) + ' XP', 530, y + 138, { size: 18, font: UI.MONO, weight: '900', lean: 0, color: UI.C.cyan });
      if (xp.levelsGained && xpP >= 0.5) {
        var lp = UI.outBack(UI.step(t, 2.0, 0.4));
        ctx2.save(); ctx2.translate(W / 2, y); ctx2.scale(lp, lp);
        UI.panel(ctx2, -150, -26, 300, 46, { skew: 14, fill: UI.hotGradient(ctx2, -150, 0, 150, 0), glow: 'rgba(255,47,142,0.5)' });
        UI.text(ctx2, 'LEVEL UP!  ' + xp.after.level, 0, 7, { size: 26, align: 'center', color: '#ffffff' });
        ctx2.restore();
      }
      ctx2.restore();
      // Stars, popping in one at a time.
      if (storyEvent) {
        for (i = 0; i < 3; i++) {
          var stp = UI.outBack(UI.step(t, 1.7 + i * 0.25, 0.35));
          var got = i < R.stars, isNew = R.starAward && i >= R.starAward.had && i < R.starAward.now;
          if (stp <= 0) continue;
          ctx2.save(); ctx2.translate(560 + i * 42, y + 44); ctx2.scale(stp, stp);
          UI.star(ctx2, 0, 0, 17, got, isNew ? '#ffe98a' : UI.C.gold);
          ctx2.restore();
        }
        UI.text(ctx2, R.stars + ' / 3 STARS', 600, y + 80, { size: 13, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim, alpha: UI.step(t, 2.2, 0.3) });
      }
      y += 184;
    }

    // The story's own lines, then the way on.
    var fp = UI.outCubic(UI.step(t, 1.9, 0.4));
    if (storyResult) {
      for (i = 0; i < storyResult.lines.length; i++) {
        UI.text(ctx2, storyResult.lines[i], W / 2, Math.min(y + 24 + i * 30, 1096) + (1 - fp) * 20, {
          size: i ? 18 : 22, font: UI.SANS, weight: '900', lean: 0, align: 'center', maxW: 640,
          color: i ? UI.C.gold : (storyResult.ok ? UI.C.green : UI.C.orange), alpha: fp });
      }
      ctx2.save(); ctx2.translate(0, (1 - fp) * 80); ctx2.globalAlpha *= fp;
      drawDoneButton(ctx2, DONE_RETRY_BTN, 'RETRY', doneSel === 0);
      drawDoneButton(ctx2, DONE_CONT_BTN, 'CONTINUE', doneSel === 1);
      ctx2.restore();
    } else {
      var pulse = 0.75 + 0.25 * Math.sin(clock * 3);
      UI.text(ctx2, 'TAP TO RACE AGAIN', W / 2, 1180, { size: 30, align: 'center', color: UI.C.gold, alpha: fp * pulse });
    }
    ctx2.textAlign = 'left';
  }

  function resultsSubtitle() {
    if (storyEvent) {
      return DR.Story.cities()[storyEvent.city].name + '  •  ' + storyEvent.label;
    }
    return DR.Road.tracks()[DR.Road.currentTrack()].name;
  }

  function drawDoneButton(ctx2, b, text, on) {
    drawButton(ctx2, b, text, { primary: on, on: false, size: 28 });
  }

  // Which room a Title door leads to. Both unbuilt rooms are still reachable
  // — they just have nothing in them yet but a name and a way back.
  function startOver() {
    DR.Save.resetAll();
    DR.Save.ensureStarter('nightrunner');
    DR.Cars.applyToCar(DR.Save.selectedCar());
    storySel = 0; citySel = 0;
  }

  function enterTitleItem(i) {
    var it = TITLE_ITEMS[i];
    if (it.id === 'quick') phase = 'modes';
    else if (it.id === 'story') openStory();
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
      if (inBox(lx, ly, NAME_CHIP)) { openName('title'); return; }
      if (inBox(lx, ly, RESET_BTN)) {
        if (resetArmed > 0) { startOver(); resetArmed = 0; resetDone = 2.5; }
        else resetArmed = 4;
        return;
      }
      resetArmed = 0;
      for (i = 0; i < TITLE_ITEMS.length; i++) {
        if (inBox(lx, ly, titleBox(i))) {
          if (titleSel === i) enterTitleItem(i);
          else titleSel = i;
          return;
        }
      }
    } else if (phase === 'name') {
      if (inBox(lx, ly, NAME_DICE_BTN)) { rollName(); return; }
      if (inBox(lx, ly, NAME_GO_BTN)) { confirmName(); return; }
      if (DR.Save.playerName() && inBox(lx, ly, BACK_BTN)) { phase = 'title'; return; }
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
      if (inBox(lx, ly, MAP_ENTER_BTN)) { zoomIntoCity(storySel); return; }
      if (inBox(lx, ly, MAP_STORY_BTN)) { replayStory(); return; }
      for (i = 0; i < DR.Story.cities().length; i++) {
        if (inBox(lx, ly, storyRowBox(i))) {
          if (storySel === i) zoomIntoCity(i);
          else storySel = i;
          return;
        }
      }
    } else if (phase === 'scene') {
      if (inBox(lx, ly, SCENE_SKIP_BTN)) { finishScenes(); return; }
      sceneAdvance();
    } else if (phase === 'city') {
      if (inBox(lx, ly, BACK_BTN)) { phase = 'story'; return; }
      if (inBox(lx, ly, CITY_GARAGE_BTN)) { openGarage('city'); return; }
      if (inBox(lx, ly, CITY_START_BTN)) { tryStoryEvent(storySel, citySel); return; }
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
    } else if (resultsSkippable()) {
      phaseT = RESULTS_SETTLE;   // first tap: skip the count-up, show it all
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

  /* Into Story: the first time, a new career starts with the prologue. */
  function openStory() {
    storySel = DR.Story.currentCity();
    var go = function () { phase = 'story'; storySel = DR.Story.currentCity(); };
    if (!DR.Save.isUnlocked('scene:prologue')) {
      DR.Save.unlock('scene:prologue');
      showScenes([DR.Story.prologue()], go);
    } else go();
  }
  // Into a city from the map: the first visit, its arrival scene plays.
  /* Into a city from the map, with the camera flying down onto it first.
     (Straight in when the presentation is switched off, as in tests.) */
  var mapZoom = null, MAP_ZOOM_T = 0.65;
  function zoomIntoCity(ci) {
    if (!DR.Story.cityUnlocked(ci) || mapZoom) return;
    if (!DR.Show.enabled()) { visitCity(ci); return; }
    storySel = ci;
    mapZoom = { ci: ci, t: 0 };
  }
  function visitCity(ci) {
    if (!DR.Story.cityUnlocked(ci)) return;
    var key = 'scene:in:' + DR.Story.cities()[ci].id;
    if (!DR.Save.isUnlocked(key)) {
      DR.Save.unlock(key);
      storySel = ci;
      showScenes([DR.Story.arrivalScene(ci)], function () { enterCity(ci); });
    } else enterCity(ci);
  }
  // Everything that's happened so far, in order: the prologue, and every
  // city's scenes up to where you are.
  function replayStory() {
    var list = [DR.Story.prologue()], n = DR.Story.cities().length;
    for (var i = 0; i < n; i++) {
      var id = DR.Story.cities()[i].id;
      if (!DR.Save.isUnlocked('scene:in:' + id)) break;      // only what you've seen
      list.push(DR.Story.arrivalScene(i));
      if (DR.Story.bossBeaten(i)) list.push(DR.Story.aftermathScene(i));
    }
    showScenes(list, function () { phase = 'story'; });
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
    var ev = storyEvent, first = storyResult && storyResult.firstClear;
    storyEvent = null; storyResult = null;
    // Beating a boss sends you to the map, where the next city has just
    // opened; anything else goes back to the city you were in. The first
    // time a boss falls, what they tell you plays first.
    var boss = ev && DR.Story.cities()[ev.city].events[ev.event].type === 'boss';
    var toMap = function () {
      storySel = Math.min(ev.city + 1, DR.Story.cities().length - 1);
      phase = 'story';
    };
    if (boss && DR.Story.bossBeaten(ev.city)) {
      if (first) {
        DR.Save.unlock('scene:out:' + DR.Story.cities()[ev.city].id);
        showScenes([DR.Story.aftermathScene(ev.city)], toMap);
      } else toMap();
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
    if (DR.Show.stage() === 'intro') {
      if (DR.Input.takeTap()) { DR.Show.skipIntro(); DR.Input.releaseAll(); }
      return;
    }
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
    camReady = false; hitCool = 0; dmgSmokeT = 0; wallHitCount = 0; draftMult = 1; devVel = 0; lastDev = 0;
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
    raceDone = false; finishHold = 0; results = null; lastPos = raceRivals ? raceRivals.length + 1 : 0;
    lapWalls = 0; driftRun = 0; draftCool = 0; drafting = false;
    beginShow();
  }

  /* What the intro card says, for whatever is about to start. */
  function beginShow() {
    var tr = DR.Road.tracks()[DR.Road.currentTrack()];
    var def = DR.Cars.get(DR.Save.selectedCar()) || DR.Cars.get('nightrunner');
    var o = { mode: mode, title: tr.name, sub: '', lines: [], boss: null,
              you: { name: playerName(), car: def.name.toUpperCase(), rating: DR.Cars.rating(def.id),
                     color: DR.Save.carColor(def.id) || def.color } };
    if (storyEvent) {
      var c = DR.Story.cities()[storyEvent.city];
      o.title = storyEvent.label + '  \u2022  ' + DR.Story.placeName(storyEvent.city, storyEvent.event);
      o.sub = c.name + '  \u2022  CITY ' + (storyEvent.city + 1) + ' OF 10';
      o.lines = [storyEvent.requirement, storyEvent.reward];
      if (storyEvent.type === 'boss') {
        var bc = c.reward.car && DR.Cars.get(c.reward.car);
        o.title = 'BOSS RACE';
        o.boss = { name: c.boss, color: c.bossColor, rank: 10 - storyEvent.city,
                   car: bc ? bc.name.toUpperCase() : 'CUSTOM ' + c.bossArch.toUpperCase(),
                   rating: DR.Story.ratingNeed(storyEvent.city),
                   quote: DR.Story.bossQuote(storyEvent.city) };
      }
    } else if (mode === 'race') {
      o.sub = 'QUICK RACE  \u2022  ' + RACE_LAPS + ' LAPS';
      o.lines = ['FINISH 1ST FOR 120 CR', 'RIVALS: ' + raceRivals.map(function (r) { return r.name; }).join('  \u2022  ')];
    } else if (mode === 'time') {
      o.sub = 'TIME ATTACK'; o.lines = ['BEAT ' + fmt(timeTarget) + ' OVER ' + timeLaps + ' LAPS'];
    } else if (mode === 'rush') {
      o.sub = 'CHECKPOINT RUSH'; o.lines = ['BEAT THE CLOCK TO EVERY GATE', 'SPIKES AND POTHOLES SLOW YOU DOWN'];
    } else if (mode === 'duel') {
      o.sub = 'DUEL  \u2022  PLAYER ' + (duelStage === 2 ? 'TWO' : 'ONE');
      o.lines = [duelStage === 2 ? 'BEAT PLAYER ONE\u2019S GHOST' : 'SET THE TIME TO BEAT', DUEL_LAPS + ' LAPS'];
    }
    DR.Show.begin(o);
  }

  // Minimap, top right. The whole lap seen from above, with you on it.
  // North-up rather than rotating, so the shape stays learnable.
  var MAP = { x: 530, y: 18, w: 170, h: 170 };
  // Practice owns the top of the screen for its guidance, so the map moves
  // down out of its way rather than the two fighting over the same corner.
  var MAP_PRACTICE = { x: 528, y: 900, w: 164, h: 164 };
  function drawMinimap(ctx2, box) {
    var m = box || MAP;
    DR.UI.panel(ctx2, m.x - 14, m.y, m.w + 20, m.h, { skew: 14, fill: 'rgba(8,6,20,0.72)', stroke: 'rgba(150,196,225,0.4)' });
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
    var UI = DR.UI, t = phaseT, W = v.W, i;
    ctx2.fillStyle = 'rgba(6,4,16,0.82)';
    ctx2.fillRect(0, 0, W, v.H);
    UI.backdrop(ctx2, W, v.H, clock, UI.C.green);
    var hp = UI.outBack(UI.step(t, 0, 0.45));
    ctx2.save(); ctx2.translate(W / 2, 250); ctx2.scale(2 - hp, 2 - hp);
    UI.text(ctx2, 'TUTORIAL DONE', 0, 0, { size: 64, align: 'center', color: UI.C.green, stroke: 'rgba(4,2,10,0.95)', strokeW: 10, maxW: 640, alpha: UI.clamp01(hp) });
    ctx2.restore();
    UI.text(ctx2, 'YOU’RE READY FOR THE STREETS', W / 2, 296, { size: 20, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim, alpha: UI.step(t, 0.2, 0.3) });
    var steps = ['HOLD THE SIDE THE ROAD TURNS TOWARD', 'LET GO AS IT STRAIGHTENS', 'DRIFTS FILL BOOST — USE IT ON STRAIGHTS'];
    for (i = 0; i < steps.length; i++) {
      var sp = UI.outCubic(UI.stagger(t, i, 0.12, 0.35, 0.3)), y = 360 + i * 100, x = 40 + (1 - sp) * 600;
      ctx2.save(); ctx2.globalAlpha = sp;
      UI.panel(ctx2, x, y, 640, 80, { skew: 18, fill: 'rgba(12,9,26,0.9)', stroke: 'rgba(150,196,225,0.35)', accent: UI.C.gold });
      UI.text(ctx2, String(i + 1), x + 50, y + 56, { size: 44, align: 'center', color: UI.C.gold });
      UI.text(ctx2, steps[i], x + 96, y + 50, { size: 22, font: UI.SANS, weight: '900', lean: 0, color: '#ffffff', maxW: 520 });
      ctx2.restore();
    }
    var pp = UI.outBack(UI.step(t, 0.8, 0.4));
    ctx2.save(); ctx2.translate(W / 2, 720); ctx2.scale(pp, pp);
    if (doneAward) {
      UI.coin(ctx2, -90, -10, 20);
      UI.text(ctx2, '+' + UI.countUp(doneAward, UI.step(t, 0.9, 0.7)) + ' CR', 10, 4, { size: 40, align: 'center', color: UI.C.gold });
    } else {
      UI.text(ctx2, 'ALREADY PAID OUT', 0, 0, { size: 26, align: 'center', color: UI.C.dim });
    }
    ctx2.restore();
    if (results) {
      UI.text(ctx2, '+' + results.xp.xp + ' XP', W / 2, 780, { size: 22, font: UI.MONO, weight: '900', lean: 0, align: 'center', color: UI.C.cyan, alpha: UI.step(t, 1.1, 0.3) });
    }
    var fp = UI.outCubic(UI.step(t, 1.2, 0.4));
    UI.text(ctx2, 'STORY MODE STARTS IN PORTSIDE', W / 2, 1060, { size: 22, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: '#ffffff', alpha: fp });
    ctx2.save(); ctx2.translate(0, (1 - fp) * 80); ctx2.globalAlpha *= fp;
    drawDoneButton(ctx2, DONE_RETRY_BTN, 'AGAIN', doneSel === 0);
    drawDoneButton(ctx2, DONE_CONT_BTN, 'TO STORY', doneSel === 1);
    ctx2.restore();
    ctx2.textAlign = 'left';
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
    var UI = DR.UI;
    var cx2 = v.W * 0.5;
    var low = rushTime < 5;
    var pulse = low ? 0.78 + 0.22 * Math.sin(clock * 12) : 1;

    UI.panel(ctx2, cx2 - 170, 18, 340, 236, { skew: 30, fill: 'rgba(8,6,20,0.8)', stroke: low ? '#ff6a5a' : 'rgba(150,196,225,0.45)',
                                               lineWidth: 2, accent: low ? '#ff6a5a' : UI.C.orange });
    UI.text(ctx2, low ? 'TIME — HURRY' : 'TIME', cx2, 50, { size: 17, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: low ? '#ff9a8a' : UI.C.dim });
    UI.text(ctx2, rushTime.toFixed(1), cx2, 134, { size: 90, font: UI.MONO, weight: '900', lean: 0, align: 'center',
                                                   color: low ? '#ff6a5a' : '#ffffff', stroke: 'rgba(4,2,10,0.9)', alpha: pulse });
    UI.text(ctx2, 'DISTANCE', cx2, 170, { size: 15, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim });
    UI.text(ctx2, rushScore + ' m', cx2, 212, { size: 40, align: 'center', color: UI.C.gold });
    if (rushBest > 0) {
      UI.text(ctx2, 'BEST ' + rushBest + ' m', cx2, 240, { size: 16, font: UI.MONO, weight: '800', lean: 0, align: 'center', color: UI.C.green });
    }
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'alphabetic';

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
    drawMinimap(ctx2);
  }

  /* Duel read-out: which player is driving, and — for player two — the gap in
     seconds. AHEAD and BEHIND are written out, because a green or red number
     on its own is exactly the sort of thing the brief says must never carry
     information alone. */
  function drawDuelHud(ctx2, v) {
    var UI = DR.UI, x = 272, y = 18, w = 240, cx2 = x + w / 2;
    var col = duelStage === 1 ? UI.C.gold : '#7ce4ff';
    UI.panel(ctx2, x, y, w, duelStage === 1 ? 76 : 134, { skew: 20, fill: 'rgba(8,6,20,0.84)', stroke: col, lineWidth: 2, accent: col });
    UI.text(ctx2, 'PLAYER ' + duelStage, cx2, y + 36, { size: 28, align: 'center', color: col });
    UI.text(ctx2, duelStage === 1 ? 'SET THE TIME — ' + DUEL_LAPS + ' LAPS' : 'TO BEAT ' + fmt(duelTimes[0]), cx2, y + 60,
            { size: 15, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim, maxW: w - 30 });
    if (duelStage === 2) {
      if (duelGap !== null) {
        var behind = duelGap > 0;
        UI.text(ctx2, (behind ? '+' : '\u2212') + Math.abs(duelGap).toFixed(2), cx2, y + 104,
                { size: 38, font: UI.MONO, weight: '900', lean: 0, align: 'center', color: behind ? '#ff8a6a' : UI.C.green });
        UI.text(ctx2, behind ? 'BEHIND' : 'AHEAD', cx2, y + 126, { size: 16, align: 'center', color: behind ? '#ff8a6a' : UI.C.green });
      } else {
        UI.text(ctx2, 'GHOST HAS FINISHED', cx2, y + 110, { size: 18, align: 'center', color: UI.C.green, maxW: w - 30 });
      }
    }
    ctx2.textAlign = 'left';
  }

  // Between the two legs. Deliberately a wall you have to tap through, so the
  // phone actually changes hands before the clock starts again.
  function drawHandoff(ctx2, v) {
    var UI = DR.UI, t = phaseT, W = v.W;
    ctx2.fillStyle = 'rgba(6,4,16,0.86)';
    ctx2.fillRect(0, 0, W, v.H);
    UI.backdrop(ctx2, W, v.H, clock, '#7ce4ff');
    var p = UI.outBack(UI.step(t, 0, 0.45));
    UI.panel(ctx2, 60 - (1 - p) * 600, 270, 600, 240, { skew: 30, fill: 'rgba(12,9,26,0.94)', stroke: UI.C.gold, lineWidth: 2.5, accent: UI.C.gold });
    UI.text(ctx2, 'PLAYER 1 SET', W / 2, 322, { size: 22, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim, alpha: p });
    UI.text(ctx2, fmt(duelTimes[0]), W / 2, 420, { size: 90, font: UI.MONO, weight: '900', lean: 0, align: 'center', color: UI.C.gold, alpha: p });
    var best = lapTimes.length ? Math.min.apply(null, lapTimes) : 0;
    UI.text(ctx2, 'BEST LAP  ' + fmt(best), W / 2, 470, { size: 22, font: UI.MONO, weight: '800', lean: 0, align: 'center', color: UI.C.green, alpha: p });
    var q = UI.outCubic(UI.step(t, 0.3, 0.4));
    UI.text(ctx2, 'PASS THE PHONE', W / 2 + (1 - q) * 200, 640, { size: 60, align: 'center', color: '#7ce4ff', stroke: 'rgba(4,2,10,0.9)', alpha: q });
    UI.text(ctx2, 'PLAYER 2 RACES PLAYER 1’S GHOST', W / 2, 690, { size: 22, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: '#ffffff', alpha: q });
    var pulse = 0.75 + 0.25 * Math.sin(clock * 3);
    UI.text(ctx2, 'TAP WHEN READY', W / 2, 860, { size: 34, align: 'center', color: UI.C.gold, alpha: UI.step(t, 0.6, 0.3) * pulse });
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
    // Mid-flight into a city: input waits until we land.
    if (mapZoom) { DR.Input.takeMenuStep(); DR.Input.takeBoost(); DR.Input.takeTap(); return; }
    // Counted presses, not held keys — a tap of an arrow that begins and ends
    // between two frames still has to move the selection.
    var st = DR.Input.takeMenuStep();
    var confirm = DR.Input.takeBoost();

    if (phase === 'name') {
      if (confirm) confirmName();
    } else if (phase === 'title') {
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
      if (confirm) zoomIntoCity(storySel);
    } else if (phase === 'scene') {
      if (confirm) sceneAdvance();
    } else if (phase === 'city') {
      var ne = DR.Story.cities()[storySel].events.length;
      if (st) citySel = ((citySel + st) % ne + ne) % ne;
      if (confirm) tryStoryEvent(storySel, citySel);
    } else if (phase === 'handoff') {
      if (confirm) startDuelLeg2();
    } else if (confirm && resultsSkippable()) {
      phaseT = RESULTS_SETTLE;
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
    if (DR.Car3D) DR.Car3D.show(phase === 'garage' || phase === 'title');
    syncNameInput();
    // A new screen: restart its entrance animations and sweep it in.
    if (phase !== drawnPhase) {
      var fromRace = drawnPhase === 'racing';
      drawnPhase = phase;
      phaseT = 0;
      garageShown = -1;
      if (!(fromRace && phase === 'done')) DR.UI.wipe();
    }
    // Same idea for the city look: worked out from what's on screen every
    // frame, so a city's colours can never leak into Quick Play.
    var themeCity = -1;
    if (phase === 'city') themeCity = storySel;
    else if (phase === 'scene' && sceneQueue[0] && sceneQueue[0].city !== undefined) themeCity = sceneQueue[0].city;
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
        phase === 'story' || phase === 'garage' || phase === 'tutorial' || phase === 'scene' || phase === 'name') {
      DR.Road.prepareTerrain(null);          // menus sit on the flat
      DR.Road.drawBackground(ctx, menuView());
      if (phase !== 'scene') DR.UI.backdrop(ctx, v.W, v.H, clock);
      if (phase === 'title') drawTitle(ctx, v);
      else if (phase === 'name') drawName(ctx, v);
      else if (phase === 'modes') { drawModes(ctx, v); drawButton(ctx, BACK_BTN, '\u25C2 TITLE'); }
      else if (phase === 'select') { drawSelect(ctx, v); drawButton(ctx, BACK_BTN, '\u25C2 MODES'); }
      else if (phase === 'garage') drawGarage(ctx, v);
      else if (phase === 'story') drawStory(ctx, v);
      else if (phase === 'city') drawCity(ctx, v);
      else if (phase === 'scene') drawScene(ctx, v);
      else if (phase === 'tutorial') drawComingSoon(ctx, v, 'TUTORIAL', 'A guided first drift. Coming soon.');
      DR.UI.drawConfetti(ctx);
      DR.UI.drawWipe(ctx, v.W, v.H);
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
    DR.FX.drawDebris(ctx, v);
    DR.FX.drawSpeedLines(ctx, v);
    DR.FX.drawBurst(ctx, v);
    DR.FX.drawBoostFx(ctx, v);
    DR.FX.drawFlash(ctx, v, rib);
    DR.FX.drawLabels(ctx, v);
    // The results panel owns the screen; the race HUD behind it is clutter.
    // While the intro card is up the HUD stays off: the card is the only
    // thing to read. It slides in with the countdown lights.
    var showStage = DR.Show.stage();
    if (phase === 'racing' && showStage !== 'intro') {
      ctx.save();
      if (showStage === 'countdown') ctx.globalAlpha = DR.UI.step(DR.Show.time(), 0, 0.4);
      if (mode === 'practice') drawPracticeHud(ctx, v);
      else if (mode === 'tutorial') drawTutorialHud(ctx, v);
      else if (mode === 'rush') drawRushHud(ctx, v);
      else { drawHud(ctx, v); if (showStage !== 'countdown') drawHint(ctx, v); }
      if (mode === 'duel') drawDuelHud(ctx, v);
      if (mode === 'time') drawTimeHud(ctx, v);
      drawSpeedo(ctx);
      ctx.restore();
    }
    if (phase === 'racing') DR.Show.draw(ctx, v.W, v.H);
    if (phase === 'handoff') drawHandoff(ctx, v);
    if (phase === 'done') drawDone(ctx, v);
    DR.UI.drawConfetti(ctx);
    DR.UI.drawWipe(ctx, v.W, v.H);

    ctx.restore();
  }

  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = FIXED;
    if (dt > 0.25) dt = 0.25;

    if (phase === 'racing') handleRaceTap();
    else updateMenu();
    phaseT += dt;
    if (mapZoom) {
      mapZoom.t += dt;
      if (mapZoom.t >= MAP_ZOOM_T || phase !== 'story') { var zc = mapZoom.ci; mapZoom = null; if (phase === 'story') visitCity(zc); }
    }
    garageSwapT += dt;
    if (garagePop) garagePop.t += dt;
    DR.UI.updateFx(dt);

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
      // Only a button while there's a car to boost: on a menu that circle
      // is empty screen, and treating a tap there as "confirm" would press
      // whatever happened to be selected.
      if (phase !== 'racing') return false;
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

    nameInput = makeNameInput();
    /* First open: a name, then straight into the tutorial. After that, the
       tutorial keeps opening the game until it's been finished once. */
    if (!DR.Save.playerName()) openName(DR.Save.tutorialSeen() ? 'title' : 'tutorial');
    else if (!DR.Save.tutorialSeen()) startTutorial();

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
    kmh: function () { return currentSpeed() * KMH; },
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
      if (kind === 'reset') return RESET_BTN;
      if (kind === 'nameChip') return NAME_CHIP;
      if (kind === 'nameDice') return NAME_DICE_BTN;
      if (kind === 'nameGo') return NAME_GO_BTN;
      if (kind === 'nameBox') return NAME_BOX;
      if (kind === 'mapEnter') return MAP_ENTER_BTN;
      if (kind === 'mapStory') return MAP_STORY_BTN;
      if (kind === 'cityStart') return CITY_START_BTN;
      if (kind === 'sceneSkip') return SCENE_SKIP_BTN;
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
    openStory: openStory,
    results: function () { return results; },
    raceDone: function () { return raceDone; },
    drawProfileCarAt: function (c, x, y, sc, col, flip) { drawProfileCar(c, x, y, sc, col, flip); },
    visitCity: visitCity,
    scene: function () { return sceneQueue[0] ? { title: sceneQueue[0].title, line: sceneLine, lines: sceneQueue[0].lines.length, left: sceneQueue.length } : null; },
    startStoryEvent: startStoryEvent,
    storySel: function () { return storySel; },
    openName: openName,
    nameDraft: function () { return nameDraft; },
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
