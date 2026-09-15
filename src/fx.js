/* fx.js — tire smoke, skid marks, screen shake and the edge-contact flash.
   Everything is stored at a world position, so rubber and smoke stay planted
   on the tarmac and sweep past correctly even as the camera rotates through
   a corner. */

(function (DR) {
  'use strict';

  var DRIFT_THRESHOLD = 0.14;
  var MAX_SKIDS = 1100;
  var MAX_SMOKE = 320;
  var CULL = 1500;             // world units from the car before we forget it

  var skids = [], smoke = [], labels = [];
  var shake = { mag: 0, t: 0, dur: 0.001 };
  var flash = null;
  var kick = 1e9;          // seconds since boost fired
  var burst = [];          // sparks thrown off a collected pickup
  var sparks = [];         // real sparks off the barrier, with height
  var wallHitList = [];    // recent impacts, so the barrier can glow where you hit it
  var MAX_SPARKS = 220;
  var SPARK_G = 900;       // gravity on a spark, world units per second squared

  var tmp = { x: 0, y: 0 };
  var puff = null;

  var motionScale = 1;
  try {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionScale = mq.matches ? 0.25 : 1;
    if (mq.addEventListener) {
      mq.addEventListener('change', function (e) { motionScale = e.matches ? 0.25 : 1; });
    }
  } catch (e) { /* older browser: keep the full shake */ }

  function getPuff() {
    if (puff) return puff;
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0.00, 'rgba(255,255,255,0.95)');
    rg.addColorStop(0.45, 'rgba(228,214,255,0.40)');
    rg.addColorStop(1.00, 'rgba(190,170,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    puff = c; return c;
  }

  function boostKick() { kick = 0; }

  function pickupBurst() {
    for (var i = 0; i < 16; i++) {
      var a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 260;
      burst.push({ a: a, r: 10, v: sp, life: 0, max: 0.45 + Math.random() * 0.25 });
    }
    if (burst.length > 64) burst.splice(0, burst.length - 64);
  }

  function reset() {
    kick = 1e9; burst.length = 0;
    skids.length = 0; smoke.length = 0; labels.length = 0;
    sparks.length = 0; wallHitList.length = 0;
    shake.mag = 0; shake.t = shake.dur; flash = null;
  }

  /* Barrier sparks. Stored in world coordinates WITH a height, so they arc up
     off the wall, fall, and stay put on the tarmac as you drive past them —
     which is what sells the crash as something that happened in the world
     rather than a flash over the screen.
     (dx, dy) is roughly which way the spray is thrown: back along the car and
     in off the wall. */
  function wallSparks(x, y, dx, dy, n, power) {
    for (var i = 0; i < n; i++) {
      var spread = (Math.random() - 0.5) * 1.5;
      var cs = Math.cos(spread), sn = Math.sin(spread);
      var sp = (90 + Math.random() * 320) * power;
      sparks.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        z: 8 + Math.random() * 16,
        vx: (dx * cs - dy * sn) * sp,
        vy: (dx * sn + dy * cs) * sp,
        vz: (70 + Math.random() * 250) * power,
        life: 0, max: 0.35 + Math.random() * 0.6,
        hot: Math.random()
      });
    }
    if (sparks.length > MAX_SPARKS) sparks.splice(0, sparks.length - MAX_SPARKS);
  }

  // Lights up the stretch of barrier that was struck. road.js reads this.
  function wallHit(s, side) {
    wallHitList.push({ s: s, side: side, t: 0, dur: 0.75 });
    if (wallHitList.length > 6) wallHitList.shift();
  }
  function wallHits() { return wallHitList; }

  function emit(car, speed, dt) {
    var mag = Math.abs(car.slip);
    if (mag <= DRIFT_THRESHOLD) return;

    // Scaled against how sideways the car can actually get, so a proper drift
    // smokes properly instead of topping out early.
    var intensity = Math.min(1, (mag - DRIFT_THRESHOLD) / (car.SLIP_AT_LIMIT - DRIFT_THRESHOLD));
    var lvl = intensity > 0.66 ? 2 : (intensity > 0.33 ? 1 : 0);

    for (var side = -1; side <= 1; side += 2) {
      car.bodyPoint(side * car.W * 0.46, -car.L * 0.36, tmp);
      skids.push({ x: tmp.x, y: tmp.y, r: 4.4 + intensity * 2.0, lvl: lvl });

      if (Math.random() < 0.30 + intensity * 0.95) {
        var a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 70;
        smoke.push({
          x: tmp.x + (Math.random() - 0.5) * 14,
          y: tmp.y + (Math.random() - 0.5) * 14,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          r: 8 + Math.random() * 9,
          grow: 34 + Math.random() * 30,
          life: 0, max: 0.55 + Math.random() * 0.5,
          peak: 0.14 + intensity * 0.38
        });
      }
    }

    if (skids.length > MAX_SKIDS) skids.splice(0, skids.length - MAX_SKIDS);
    if (smoke.length > MAX_SMOKE) smoke.splice(0, smoke.length - MAX_SMOKE);
  }

  function hit(kind, severity, side, car) {
    var color = kind === 'INNER' ? '#a98bff'
              : kind === 'OUTER' ? '#ffae4a'
              : '#eaf2ff';
    var text = kind === 'INNER' ? 'CUT IN'
             : kind === 'OUTER' ? 'RAN WIDE'
             : 'OFF LINE';

    shake.mag = Math.max(shake.mag, 6 + severity * 16);
    shake.t = 0; shake.dur = 0.38;
    flash = { t: 0, dur: 0.45, side: side, color: color, strength: 0.45 + severity * 0.55 };

    var lp = { x: 0, y: 0 };
    car.bodyPoint(side * 90, 40, lp);
    labels.push({ text: text, color: color, x: lp.x, y: lp.y, t: 0, dur: 1.0 });
    if (labels.length > 4) labels.shift();
  }

  // A hazard is not a wall: no edge flash, no direction, but the same shake
  // and the same word, because the word is what tells you WHAT hit you.
  function hazardHit(text, color, severity, car) {
    shake.mag = Math.max(shake.mag, 5 + severity * 14);
    shake.t = 0; shake.dur = 0.34;
    var lp = { x: 0, y: 0 };
    car.bodyPoint(0, 40, lp);
    labels.push({ text: text, color: color, x: lp.x, y: lp.y, t: 0, dur: 1.1 });
    if (labels.length > 4) labels.shift();
  }

  function update(dt, carX, carY) {
    var i, p, dx, dy;
    shake.t += dt;
    if (kick < 1e9) kick += dt;
    for (i = burst.length - 1; i >= 0; i--) {
      burst[i].life += dt;
      burst[i].r += burst[i].v * dt;
      burst[i].v *= 0.93;
      if (burst[i].life >= burst[i].max) burst.splice(i, 1);
    }

    if (flash) { flash.t += dt; if (flash.t >= flash.dur) flash = null; }

    for (i = wallHitList.length - 1; i >= 0; i--) {
      wallHitList[i].t += dt;
      if (wallHitList[i].t >= wallHitList[i].dur) wallHitList.splice(i, 1);
    }

    for (i = sparks.length - 1; i >= 0; i--) {
      var sp = sparks[i];
      sp.life += dt;
      sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.z += sp.vz * dt;
      sp.vz -= SPARK_G * dt;
      sp.vx *= 0.97; sp.vy *= 0.97;
      // Skitters along the tarmac instead of sinking through it.
      if (sp.z < 1.5) { sp.z = 1.5; sp.vz = Math.abs(sp.vz) * 0.34; sp.vx *= 0.7; sp.vy *= 0.7; }
      dx = sp.x - carX; dy = sp.y - carY;
      if (sp.life >= sp.max || dx * dx + dy * dy > CULL * CULL) sparks.splice(i, 1);
    }

    for (i = labels.length - 1; i >= 0; i--) {
      labels[i].t += dt;
      if (labels[i].t >= labels[i].dur) labels.splice(i, 1);
    }

    for (i = smoke.length - 1; i >= 0; i--) {
      p = smoke[i];
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.r += p.grow * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      dx = p.x - carX; dy = p.y - carY;
      if (p.life >= p.max || dx * dx + dy * dy > CULL * CULL) smoke.splice(i, 1);
    }

    // Skid marks are laid down in order, so the stale ones bunch at the front.
    var cut = 0;
    while (cut < skids.length) {
      dx = skids[cut].x - carX; dy = skids[cut].y - carY;
      if (dx * dx + dy * dy <= CULL * CULL) break;
      cut++;
    }
    if (cut > 0) skids.splice(0, cut);
  }

  function shakeOffset() {
    if (shake.t >= shake.dur) return { x: 0, y: 0 };
    var k = 1 - shake.t / shake.dur;
    var amp = shake.mag * k * k * motionScale;
    return { x: (Math.random() * 2 - 1) * amp, y: (Math.random() * 2 - 1) * amp };
  }

  var SKID_ALPHA = [0.16, 0.26, 0.38];
  var _q = { x: 0, y: 0, sc: 0, rz: 0, vis: false };

  function drawSkids(ctx, view) {
    if (!skids.length) return;
    var unit = DR.Road.SC_CAR;
    for (var lvl = 0; lvl < 3; lvl++) {
      var opened = false;
      for (var i = 0; i < skids.length; i++) {
        var m = skids[i];
        if (m.lvl !== lvl) continue;
        DR.Road.project(m.x, m.y, view, _q);
        if (!_q.vis || _q.y < -40 || _q.y > view.H + 40) continue;
        if (_q.x < -60 || _q.x > view.W + 60) continue;
        var r = m.r * _q.sc / unit;
        if (r < 0.4) continue;
        if (!opened) { ctx.beginPath(); opened = true; }
        ctx.moveTo(_q.x + r, _q.y);
        ctx.arc(_q.x, _q.y, r, 0, Math.PI * 2);
      }
      if (opened) {
        ctx.fillStyle = 'rgba(6,4,14,' + SKID_ALPHA[lvl] + ')';
        ctx.fill();
      }
    }
  }

  function drawSmoke(ctx, view) {
    if (!smoke.length) return;
    var img = getPuff(), unit = DR.Road.SC_CAR;
    for (var i = 0; i < smoke.length; i++) {
      var p = smoke[i];
      DR.Road.project(p.x, p.y, view, _q);
      if (!_q.vis || _q.y < -80 || _q.y > view.H + 80) continue;
      var k = p.life / p.max;
      var a = p.peak * (1 - k) * Math.min(1, k * 5);
      if (a <= 0.004) continue;
      var r = p.r * _q.sc / unit;
      if (r < 0.5) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(img, _q.x - r, _q.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawFlash(ctx, view, rib) {
    if (!flash) return;
    var k = 1 - flash.t / flash.dur;
    k = k * k;
    var W = view.W, H = view.H;

    // Light up the edge that was actually touched.
    if (rib) {
      var sd = flash.side;
      ctx.beginPath();
      DR.Road.quads(ctx, rib, sd, -26, sd, 26, 2.2);
      ctx.globalAlpha = 0.85 * k * flash.strength;
      ctx.fillStyle = flash.color;
      ctx.fill();
      ctx.beginPath();
      DR.Road.quads(ctx, rib, sd, -52, sd, 52, 2.2);
      ctx.globalAlpha = 0.30 * k * flash.strength;
      ctx.fill();
    }

    // Soft border wash: one smooth fade, low peak, never a strobe.
    var a = 0.22 * k * flash.strength;
    ctx.strokeStyle = flash.color;
    ctx.globalAlpha = a;        ctx.lineWidth = 12; ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.globalAlpha = a * 0.55; ctx.lineWidth = 24; ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.globalAlpha = a * 0.22; ctx.lineWidth = 34; ctx.strokeRect(53, 53, W - 106, H - 106);
    ctx.globalAlpha = 1;
  }

  // Speed lines while boosting: streaks pulled out from the vanishing point,
  // strongest at the edges of the frame where peripheral motion reads.
  var lineSeed = null;
  function drawSpeedLines(ctx, view) {
    // Always a little, because the car is never slow; a lot while boosting.
    var amount = 0.20 + 0.80 * (view.boost || 0);
    if (!lineSeed) {
      lineSeed = [];
      var sd = 7717;
      for (var i = 0; i < 44; i++) {
        sd = (sd * 1103515245 + 12345) & 0x7fffffff;
        var a = (sd / 0x7fffffff) * Math.PI * 2;
        sd = (sd * 1103515245 + 12345) & 0x7fffffff;
        lineSeed.push({ a: a, r: 0.30 + (sd / 0x7fffffff) * 0.68 });
      }
    }
    var cx = view.W * 0.5, cy = DR.Road.HORIZON_Y + 150;
    var R = Math.max(view.W, view.H);
    ctx.lineCap = 'round';
    for (var j = 0; j < lineSeed.length; j++) {
      var L = lineSeed[j];
      var d0 = L.r * R, d1 = d0 + (110 + 330 * amount);
      var sn = Math.sin(L.a), cs = Math.cos(L.a);
      ctx.globalAlpha = 0.52 * amount * L.r;
      ctx.lineWidth = 2 + 4 * amount;
      ctx.strokeStyle = '#dff3ff';
      ctx.beginPath();
      ctx.moveTo(cx + cs * d0, cy + sn * d0);
      ctx.lineTo(cx + cs * d1, cy + sn * d1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // The shove when boost fires, and the tunnel-vision while it lasts.
  function drawBoostFx(ctx, view) {
    var W = view.W, H = view.H, b = view.boost || 0;

    if (b > 0.01) {
      // Corners darken, which reads as the world narrowing around you.
      var vg = ctx.createRadialGradient(W * 0.5, H * 0.55, H * 0.22, W * 0.5, H * 0.55, H * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(6,2,14,' + (0.52 * b) + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    if (kick < 0.45) {
      var k = 1 - kick / 0.45;
      var rad = 60 + (1 - k) * H * 0.95;
      ctx.globalAlpha = k * k * 0.55;
      ctx.lineWidth = 6 + 26 * k;
      ctx.strokeStyle = '#ffd9a0';
      ctx.beginPath();
      ctx.arc(W * 0.5, DR.Road.CAR_Y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Sparks off a pickup, thrown from where the car is.
  function drawBurst(ctx, view) {
    if (!burst.length) return;
    var cx = view.W * 0.5, cy = DR.Road.CAR_Y;
    for (var i = 0; i < burst.length; i++) {
      var p = burst[i], k = 1 - p.life / p.max;
      ctx.globalAlpha = k;
      ctx.fillStyle = i % 3 === 0 ? '#fff3cf' : '#ffb24d';
      var x = cx + Math.cos(p.a) * p.r, y = cy + Math.sin(p.a) * p.r * 0.55;
      var sz = 2 + 4 * k;
      ctx.fillRect(x - sz * 0.5, y - sz * 0.5, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  // Streaks rather than dots: each spark is drawn from where it was a moment
  // ago to where it is now, so a fast one reads as a line of light.
  var _s1 = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
  var _s2 = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
  function drawSparks(ctx, view) {
    if (!sparks.length) return;
    ctx.lineCap = 'round';
    for (var i = 0; i < sparks.length; i++) {
      var p = sparks[i], k = 1 - p.life / p.max;
      DR.Road.project3(p.x, p.y, p.z, view, _s1);
      if (!_s1.vis) continue;
      DR.Road.project3(p.x - p.vx * 0.022, p.y - p.vy * 0.022,
                       Math.max(0, p.z - p.vz * 0.022), view, _s2);
      var w = Math.max(1, 3.4 * _s1.sc / DR.Road.SC_CAR);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.strokeStyle = p.hot > 0.55 ? '#fff6d8' : (p.hot > 0.22 ? '#ffc247' : '#ff7a3d');
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(_s2.vis ? _s2.x : _s1.x, _s2.vis ? _s2.y : _s1.y);
      ctx.lineTo(_s1.x, _s1.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // The words matter: colour alone must never be the only way to tell the two
  // mistakes apart.
  function drawLabels(ctx, view) {
    if (!labels.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      var k = l.t / l.dur;
      var a = Math.min(1, (1 - k) * 2.2);
      DR.Road.project(l.x, l.y, view, _q);
      var x = _q.vis ? _q.x : view.W * 0.5;
      var y = _q.vis ? _q.y : view.H * 0.6;
      x = Math.max(120, Math.min(view.W - 120, x));
      y = Math.max(DR.Road.HORIZON_Y + 40, Math.min(view.H - 60, y - k * 70));
      ctx.globalAlpha = a * 0.55;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(4,2,10,0.95)';
      ctx.strokeText(l.text, x, y);
      ctx.globalAlpha = a;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  DR.FX = {
    reset: reset, emit: emit, hit: hit, hazardHit: hazardHit, update: update,
    shakeOffset: shakeOffset,
    drawSkids: drawSkids, drawSmoke: drawSmoke,
    drawFlash: drawFlash, drawLabels: drawLabels, drawSpeedLines: drawSpeedLines,
    drawBoostFx: drawBoostFx, drawBurst: drawBurst, drawSparks: drawSparks,
    wallSparks: wallSparks, wallHit: wallHit, wallHits: wallHits,
    boostKick: boostKick, pickupBurst: pickupBurst
  };
})(window.DR = window.DR || {});
