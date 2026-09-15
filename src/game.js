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
  var BASE_SPEED = 808;      // was 898, down 10%

  /* The boost envelope, in four parts: it lands on 40% instantly, holds there
     for a second, eases down to 30% over the next second, and then bleeds the
     last of it away over three. The step down to 30% is the point — a single
     long fade reads as one event, while a shove that settles into a shorter
     push reads as two, so the boost has a peak you can feel it come off. */
  var BOOST_PEAK = 1.40;     // 40% faster the very frame you press it
  var BOOST_HOLD = 1.0;      // seconds held at the full 40%
  var BOOST_STEP = 1.30;     // then eased down to 30% ...
  var BOOST_DROP = 1.0;      // ... over this long
  var BOOST_FADE = 3.0;      // and back to normal over this long again

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
  var RUSH_BONUS      = 4.8;   // seconds a gate gives you on lap one...
  var RUSH_BONUS_DROP = 0.8;   // ...less this much per lap survived
  var RUSH_BONUS_MIN  = 2.0;
  var RUSH_CLEAN      = 2.0;   // extra for reaching it without a scratch
  var RUSH_CLEAN_DROP = 0.2;
  var RUSH_CLEAN_MIN  = 1.2;
  var SPIKE_SLOW      = 0.5;   // spikes halve your speed...
  var SPIKE_SECS      = 3.0;   // ...for this long
  var PIT_LOSS        = 0.12;  // a pothole costs this much speed, like a wall

  var rushTime = 0, rushScore = 0, rushBest = 0;
  var cpIndex = 0, cpClean = true, cpFlash = 0, cpFlashText = '';
  var spikeT = 0, rushGates = 0;

  var BOOST_BTN = { x: 360, y: 1168, r: 72 };
  var BACK_BTN = { x: 40, y: 34, w: 156, h: 56 };      // track screen -> modes
  var EXIT_BTN = { x: 40, y: 1184, w: 176, h: 58 };    // practice -> menu
  var RACE_LAPS = 3;

  /* 'modes' -> 'select' -> 'racing' -> 'done' -> back to 'modes'.
     A mode decides what the race is FOR; the track screen is the same either
     way, so the two screens stack rather than each mode owning its own. */
  var MODES = [
    { id: 'race',     name: 'RACE',     tag: '3 LAPS',
      blurb: 'Three laps. Best lap called out at the end.' },
    { id: 'practice', name: 'PRACTICE', tag: 'NO CLOCK',
      blurb: 'The ideal line painted on the road, and when to hold.' },
    { id: 'rush',     name: 'CHECKPOINT RUSH', tag: 'SURVIVE',
      blurb: 'Beat the clock to each gate. Spikes and potholes.' }
  ];
  var mode = 'race';
  var modeSel = 0;

  var phase = 'modes';
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
    return BASE_SPEED * boostMult() * hitPenalty * slipDrag() * spikeMult();
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
    if (pickPop > 0) pickPop = Math.max(0, pickPop - dt / 0.5);
    if (boostDenied > 0) boostDenied = Math.max(0, boostDenied - dt / 0.6);

    if (DR.Input.takeBoost()) {
      if (meter >= BOOST_COST) {
        meter -= BOOST_COST; boostT = 0; DR.FX.boostKick();
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

    if (hitPenalty < 1) hitPenalty = Math.min(1, hitPenalty + HIT_RECOVER_PER_SEC * dt);
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
      if (mode === 'race' && lapTimes.length >= RACE_LAPS) { phase = 'done'; lapFlash = 0; }
    }
    if (lapFlash > 0) lapFlash = Math.max(0, lapFlash - dt / 1.6);

    DR.FX.emit(DR.Car, speed, dt);
    DR.FX.update(dt, DR.Car.x, DR.Car.y);
    DR.Road.ensure(DR.Car.roadS + DR.Road.LOOKAHEAD + 400);
    DR.Road.trim(DR.Car.roadS - DR.Road.CAM_BACK - 900);
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
      var laps = rushLapsDone();
      var bonus = Math.max(RUSH_BONUS_MIN, RUSH_BONUS - laps * RUSH_BONUS_DROP);
      var extra = cpClean ? Math.max(RUSH_CLEAN_MIN, RUSH_CLEAN - laps * RUSH_CLEAN_DROP) : 0;
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
    ctx2.strokeText(Math.min(lap, RACE_LAPS) + '/' + RACE_LAPS, x, y + 22);
    ctx2.fillStyle = '#eaf6ff';
    ctx2.fillText(Math.min(lap, RACE_LAPS) + '/' + RACE_LAPS, x, y + 22);

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

  function cardBox(i) { return { x: 64, y: 322 + i * 300, w: 592, h: 268 }; }
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
      ctx2.font = '800 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = on ? '#eaf6ff' : 'rgba(226,240,250,0.8)';
      ctx2.fillText(MODES[i].name, b.x + 30, b.y + 58);

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
    ctx2.textAlign = 'left';
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
    ctx2.fillText('CHOOSE YOUR CIRCUIT  \u2022  ' + RACE_LAPS + ' LAPS', v.W * 0.5, 212);

    for (i = 0; i < tracks.length; i++) {
      var b = cardBox(i), on = i === selected;
      ctx2.fillStyle = on ? 'rgba(34,120,150,0.28)' : 'rgba(10,8,24,0.55)';
      ctx2.fillRect(b.x, b.y, b.w, b.h);
      ctx2.lineWidth = on ? 3 : 1.5;
      ctx2.strokeStyle = on ? '#41e0ff' : 'rgba(150,196,225,0.35)';
      ctx2.strokeRect(b.x, b.y, b.w, b.h);

      drawOutline(ctx2, { x: b.x + 14, y: b.y + 14, w: 240, h: 240 }, i, null, 2.5);

      ctx2.textAlign = 'left';
      ctx2.font = '800 33px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = on ? '#eaf6ff' : 'rgba(226,240,250,0.8)';
      ctx2.fillText(tracks[i].name, b.x + 274, b.y + 74);

      ctx2.font = '700 20px ' + MONO;
      ctx2.fillStyle = on ? '#7dffb0' : 'rgba(125,255,176,0.6)';
      ctx2.fillText(tracks[i].tag, b.x + 274, b.y + 114);

      // What a clean lap here is worth, so the three circuits read as three
      // different lengths rather than three different shapes.
      ctx2.font = '700 20px ' + MONO;
      ctx2.fillStyle = on ? 'rgba(255,215,106,0.9)' : 'rgba(190,214,235,0.5)';
      ctx2.fillText('TARGET LAP  ' + tracks[i].targetSecs + 's', b.x + 402, b.y + 114);

      ctx2.font = '500 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = 'rgba(180,206,226,0.85)';
      ctx2.fillText(tracks[i].blurb, b.x + 274, b.y + 158);

      ctx2.font = '700 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx2.fillStyle = on ? '#ffd76a' : 'rgba(190,214,235,0.5)';
      ctx2.fillText(on ? 'TAP AGAIN TO RACE' : 'TAP TO SELECT', b.x + 274, b.y + 214);
    }
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

    ctx2.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('TAP TO GO AGAIN', v.W * 0.5, 860);
    ctx2.textAlign = 'left';
  }

  function drawDone(ctx2, v) {
    if (mode === 'rush') { drawRushDone(ctx2, v); return; }
    var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx2.fillStyle = 'rgba(6,4,16,0.74)';
    ctx2.fillRect(0, 0, v.W, v.H);

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
    ctx2.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.fillStyle = '#ffd76a';
    ctx2.fillText('TAP TO RACE AGAIN', v.W * 0.5, 880);
    ctx2.textAlign = 'left';
  }

  // Menu presses. The boost button owns its own, so this only runs off-race.
  function handleMenuTap() {
    var t = DR.Input.takeTap();
    if (!t) return;
    var lx = (t.x - offX) / scale, ly = (t.y - offY) / scale;
    var i, b;
    if (phase === 'modes') {
      for (i = 0; i < MODES.length; i++) {
        if (inBox(lx, ly, modeBox(i))) {
          if (modeSel === i) { mode = MODES[i].id; phase = 'select'; }
          else modeSel = i;
          return;
        }
      }
    } else if (phase === 'select') {
      if (inBox(lx, ly, BACK_BTN)) { phase = 'modes'; return; }
      for (i = 0; i < DR.Road.tracks().length; i++) {
        b = cardBox(i);
        if (inBox(lx, ly, b)) {
          if (selected === i) startRace(i);
          else selected = i;
          return;
        }
      }
    } else if (phase === 'done') {
      // Going again should be one tap, not three. Back to the tracks, with
      // the mode you were already playing still chosen.
      phase = 'select';
    }
  }

  // Practice never ends on its own, so it needs a way out. Handled here
  // rather than in updateMenu, because the menu loop does not run mid-race.
  function handleRaceTap() {
    if (mode !== 'practice') { DR.Input.clearTap(); return; }
    var t = DR.Input.takeTap();
    if (!t) return;
    var lx = (t.x - offX) / scale, ly = (t.y - offY) / scale;
    if (inBox(lx, ly, EXIT_BTN)) { phase = 'modes'; DR.Input.releaseAll(); }
  }

  function startRace(i, m) {
    if (m) mode = m;
    selected = i;
    // Whatever was being held to get here is not a steering input.
    DR.Input.releaseAll();
    DR.Input.clearTap();
    DR.Road.setTrack(i);
    DR.Car.reset(); DR.FX.reset();
    camReady = false; hitCool = 0;
    lap = 1; lapFlash = 0; boostT = 1e9;
    lapTimer = 0; timing = false; lapTimes.length = 0;
    hitPenalty = 1; meter = 0.55; driftTime = 0; pickPop = 0; boostDenied = 0;
    rebound = 0; scrapeT = 0;
    rushTime = RUSH_START; rushScore = 0; cpIndex = 0; cpClean = true;
    cpFlash = 0; spikeT = 0; rushGates = 0;
    DR.Road.resetHazards();
    raceTotal = 0; hintAlpha = 1;
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
    drawOutline(ctx2, m, undefined, lapProgress(), 2);
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

  function drawHint(ctx2, v) {
    if (hintAlpha <= 0.01) return;
    ctx2.globalAlpha = hintAlpha;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.lineWidth = 6;
    ctx2.strokeStyle = 'rgba(4,2,10,0.9)';
    ctx2.strokeText('HOLD LEFT OR RIGHT SIDE', v.W * 0.5, v.H - 790);
    ctx2.fillStyle = '#dff6ff';
    ctx2.fillText('HOLD LEFT OR RIGHT SIDE', v.W * 0.5, v.H - 790);
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
  var lastSteer = 0;
  function updateMenu() {
    // Keyboard only: see Input.steerKeys. A finger or mouse on a menu is
    // tapping a card, and must not also count as steering.
    var st = DR.Input.steerKeys();
    var confirm = DR.Input.takeBoost();

    if (phase === 'modes') {
      if (st !== 0 && lastSteer === 0) {
        modeSel = (modeSel + (st > 0 ? 1 : MODES.length - 1)) % MODES.length;
      }
      if (confirm) { mode = MODES[modeSel].id; phase = 'select'; }
    } else if (phase === 'select') {
      if (st !== 0 && lastSteer === 0) {
        var n = DR.Road.tracks().length;
        selected = (selected + (st > 0 ? 1 : n - 1)) % n;
      }
      if (confirm) startRace(selected);
    } else if (phase === 'done') {
      if (confirm) startRace(selected);
    }
    lastSteer = st;
    handleMenuTap();
  }

  function draw() {
    var v = view();
    var sh = DR.FX.shakeOffset();

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

    if (phase === 'modes' || phase === 'select') {
      DR.Road.drawBackground(ctx, menuView());
      if (phase === 'modes') drawModes(ctx, v);
      else { drawSelect(ctx, v); drawButton(ctx, BACK_BTN, '\u25C2 MODES'); }
      ctx.restore();
      return;
    }

    DR.Road.drawBackground(ctx, v);
    var rib = DR.Road.draw(ctx, v);
    DR.FX.drawSkids(ctx, v);
    // Over the skid marks, or your own rubber hides the advice.
    if (mode === 'practice') DR.Road.drawRacingLine(ctx, rib, v, clock);
    if (mode === 'rush') {
      DR.Road.drawCheckpoints(ctx, rib, v, cpWorldS(cpIndex));
      DR.Road.drawHazards(ctx, rib, v, clock);
    }
    DR.Road.drawChevrons(ctx, v);
    DR.Road.drawFog(ctx, v);
    DR.Road.drawPicks(ctx, v, clock);
    DR.FX.drawSmoke(ctx, v);
    DR.Car.draw(ctx, v);
    DR.FX.drawSparks(ctx, v);
    DR.FX.drawSpeedLines(ctx, v);
    DR.FX.drawBurst(ctx, v);
    DR.FX.drawBoostFx(ctx, v);
    DR.FX.drawFlash(ctx, v, rib);
    DR.FX.drawLabels(ctx, v);
    // The results panel owns the screen; the race HUD behind it is clutter.
    if (phase === 'racing') {
      if (mode === 'practice') drawPracticeHud(ctx, v);
      else if (mode === 'rush') drawRushHud(ctx, v);
      else { drawHud(ctx, v); drawHint(ctx, v); }
    }
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
      if (phase !== 'racing' || mode !== 'practice') return false;
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
    SPEED: BASE_SPEED,
    BASE_SPEED: BASE_SPEED,
    speed: currentSpeed,
    hitPenalty: function () { return hitPenalty; },
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
    // Where a given menu card actually is, so a test can tap the real thing
    // instead of a hard-coded guess that goes stale the moment a layout moves.
    uiBox: function (kind, i) {
      if (kind === 'mode') return modeBox(i);
      if (kind === 'track') return cardBox(i);
      if (kind === 'back') return BACK_BTN;
      if (kind === 'exit') return EXIT_BTN;
      return null;
    },
    setMode: function (m) { mode = m; },
    modes: function () { return MODES; },
    startRace: startRace,
    RACE_LAPS: RACE_LAPS,
    raceTotal: function () { return raceTotal; },
    toSelect: function () { phase = 'select'; DR.Input.releaseAll(); DR.Input.clearTap(); },
    toModes: function () { phase = 'modes'; DR.Input.releaseAll(); DR.Input.clearTap(); },
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
