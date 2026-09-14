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
     BASE_SPEED is the cruising speed. Boost multiplies it for BOOST_HOLD
     seconds, then eases back over BOOST_FADE. Unlimited presses; pressing
     again restarts the two seconds.

     The car's grip is derived from whatever the speed currently is (see
     MIN_RADIUS in car.js), so boosting into a corner never makes it
     impossible — it just gives you less time to get it right. */
  var BASE_SPEED = 898;      // was 718, up 25%
  var BOOST_MULT = 1.35;     // 35% faster while boosting, applied instantly
  var BOOST_HOLD = 1.5;      // seconds at full boost
  var BOOST_FADE = 3.0;      // seconds easing back to normal

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

  var BOOST_BTN = { x: 360, y: 1168, r: 72 };
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
    if (boostT >= BOOST_HOLD + BOOST_FADE) return 1;
    if (boostT < BOOST_HOLD) return BOOST_MULT;   // full, from the first frame
    return BOOST_MULT - (BOOST_MULT - 1) * ((boostT - BOOST_HOLD) / BOOST_FADE);
  }

  function boostAmount() { return (boostMult() - 1) / (BOOST_MULT - 1); }

  function slipDrag() {
    var sn = Math.sin(DR.Car.slip);
    return 1 - SLIP_DRAG * sn * sn;
  }

  function currentSpeed() { return BASE_SPEED * boostMult() * hitPenalty * slipDrag(); }

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

  // Contact with an edge: shake, flash, and the car is held on the road.
  // No health, no score, no run ending — that is a later milestone.
  function checkEdges(dt) {
    hitCool = Math.max(0, hitCool - dt);

    var loc = DR.Road.locate(DR.Car.x, DR.Car.y, DR.Car.roadS);
    DR.Car.roadS = loc.s;
    DR.Car.dev = loc.dev;

    var limit = loc.hw - DR.Car.halfWidth();
    if (Math.abs(loc.dev) <= limit) return;

    var side = loc.dev > 0 ? 1 : -1;
    var excess = Math.abs(loc.dev) - limit;
    // Push straight back onto the road, keeping the along-track position.
    DR.Car.x -= loc.nx * side * excess;
    DR.Car.y -= loc.ny * side * excess;
    DR.Car.dev = side * limit;

    if (hitCool > 0) return;

    // Which mistake was it? The inside of a bend is the side it turns toward,
    // so hitting that edge means you cut in and the other means you ran wide.
    var dir = DR.Road.dirAt(loc.s);
    var kind = dir === 0 ? 'OFFLINE' : (side === dir ? 'INNER' : 'OUTER');
    var severity = Math.min(1, Math.abs(Math.sin(DR.Car.slip)) * BASE_SPEED / 320);

    DR.FX.hit(kind, Math.max(0.35, severity), side, DR.Car);
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
    var steer = DR.Input.steer();
    if (steer !== 0) hintAlpha = Math.max(0, hintAlpha - dt * 2.4);

    clock += dt;
    if (pickPop > 0) pickPop = Math.max(0, pickPop - dt / 0.5);
    if (boostDenied > 0) boostDenied = Math.max(0, boostDenied - dt / 0.6);

    if (DR.Input.takeBoost()) {
      if (meter >= BOOST_COST) { meter -= BOOST_COST; boostT = 0; DR.FX.boostKick(); }
      else boostDenied = 1;
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

    if (hitPenalty < 1) hitPenalty = Math.min(1, hitPenalty + HIT_RECOVER_PER_SEC * dt);
    var speed = currentSpeed();
    DR.Car.update(dt, steer, speed);
    checkEdges(dt);
    updateCamera(dt);

    // Laps. One lap is the whole corner sequence once; the start line is the
    // end of the run-up.
    // The clock starts at the start line, so the run-up is not part of lap 1.
    if (!timing && DR.Car.roadS >= DR.Road.INTRO_LEN) { timing = true; lapTimer = 0; }
    if (timing) lapTimer += dt;

    var done = Math.floor(Math.max(0, DR.Car.roadS - DR.Road.INTRO_LEN) / DR.Road.lapLength());
    if (done + 1 > lap) {
      lap = done + 1;
      lapFlash = 1;
      lapTimes.push(lapTimer);
      if (lapTimes.length > 3) lapTimes.shift();
      lapTimer = 0;
    }
    if (lapFlash > 0) lapFlash = Math.max(0, lapFlash - dt / 1.6);

    DR.FX.emit(DR.Car, speed, dt);
    DR.FX.update(dt, DR.Car.x, DR.Car.y);
    DR.Road.ensure(DR.Car.roadS + DR.Road.LOOKAHEAD + 400);
    DR.Road.trim(DR.Car.roadS - DR.Road.CAM_BACK - 900);
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

    ctx2.font = '800 52px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.lineWidth = 6;
    ctx2.strokeStyle = 'rgba(4,2,10,0.85)';
    ctx2.strokeText(String(lap), x, y + 22);
    ctx2.fillStyle = '#eaf6ff';
    ctx2.fillText(String(lap), x, y + 22);

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
    var live = boostT < BOOST_HOLD + BOOST_FADE;
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

  // Minimap, top right. The whole lap seen from above, with you on it.
  // North-up rather than rotating, so the shape stays learnable.
  var MAP = { x: 528, y: 50, w: 164, h: 164 };
  function drawMinimap(ctx2) {
    var pts = DR.Road.lapOutline(), i, p2;
    var pad = 16, iw = MAP.w - pad * 2, ih = MAP.h - pad * 2;

    ctx2.fillStyle = 'rgba(10,6,22,0.55)';
    ctx2.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
    ctx2.lineWidth = 1.5;
    ctx2.strokeStyle = 'rgba(150,196,225,0.35)';
    ctx2.strokeRect(MAP.x, MAP.y, MAP.w, MAP.h);

    function mx(p) { return MAP.x + pad + p.nx * iw; }
    function my(p) { return MAP.y + pad + (1 - p.ny) * ih; }

    ctx2.beginPath();
    ctx2.moveTo(mx(pts[0]), my(pts[0]));
    for (i = 1; i < pts.length; i++) ctx2.lineTo(mx(pts[i]), my(pts[i]));
    ctx2.lineWidth = 5;
    ctx2.lineJoin = 'round';
    ctx2.lineCap = 'round';
    ctx2.strokeStyle = 'rgba(34,230,255,0.30)';
    ctx2.stroke();
    ctx2.lineWidth = 2;
    ctx2.strokeStyle = '#22e6ff';
    ctx2.stroke();

    // Start line.
    ctx2.fillStyle = 'rgba(255,255,255,0.85)';
    ctx2.beginPath();
    ctx2.arc(mx(pts[0]), my(pts[0]), 3.5, 0, Math.PI * 2);
    ctx2.fill();

    // You.
    var f = lapProgress(), best = pts[0];
    for (i = 0; i < pts.length; i++) if (Math.abs(pts[i].f - f) < Math.abs(best.f - f)) best = pts[i];
    ctx2.beginPath();
    ctx2.arc(mx(best), my(best), 6.5, 0, Math.PI * 2);
    ctx2.fillStyle = '#ff4b3a';
    ctx2.shadowColor = '#ff4b3a';
    ctx2.shadowBlur = 12;
    ctx2.fill();
    ctx2.shadowBlur = 0;
    ctx2.strokeStyle = 'rgba(255,225,215,0.9)';
    ctx2.lineWidth = 1.5;
    ctx2.stroke();
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

    DR.Road.drawBackground(ctx, v);
    var rib = DR.Road.draw(ctx, v);
    DR.FX.drawSkids(ctx, v);
    DR.Road.drawChevrons(ctx, v);
    DR.Road.drawFog(ctx, v);
    DR.Road.drawPicks(ctx, v, clock);
    DR.FX.drawSmoke(ctx, v);
    DR.Car.draw(ctx, v);
    DR.FX.drawSpeedLines(ctx, v);
    DR.FX.drawBurst(ctx, v);
    DR.FX.drawBoostFx(ctx, v);
    DR.FX.drawFlash(ctx, v, rib);
    DR.FX.drawLabels(ctx, v);
    drawHud(ctx, v);
    drawHint(ctx, v);

    ctx.restore();
  }

  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = FIXED;
    if (dt > 0.25) dt = 0.25;

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
