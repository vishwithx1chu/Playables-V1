/* fx.js — tire smoke, skid marks, screen shake and the edge-contact flash.
   Everything is stored at a world position, so rubber and smoke stay planted
   on the tarmac and sweep past correctly even as the camera rotates through
   a corner. */

(function (DR) {
  'use strict';

  var DRIFT_THRESHOLD = 0.14;
  var MAX_SKIDS = 1100;
  var MAX_SMOKE = 230;
  var CULL = 1500;             // world units from the car before we forget it

  var skids = [], smoke = [], labels = [];
  var shake = { mag: 0, t: 0, dur: 0.001 };
  var flash = null;

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

  function reset() {
    skids.length = 0; smoke.length = 0; labels.length = 0;
    shake.mag = 0; shake.t = shake.dur; flash = null;
  }

  function emit(car, speed, dt) {
    var mag = Math.abs(car.drift);
    if (mag <= DRIFT_THRESHOLD) return;

    var intensity = Math.min(1, (mag - DRIFT_THRESHOLD) / 0.42);
    var lvl = intensity > 0.66 ? 2 : (intensity > 0.33 ? 1 : 0);

    for (var side = -1; side <= 1; side += 2) {
      car.bodyPoint(side * car.W * 0.46, -car.L * 0.36, tmp);
      skids.push({ x: tmp.x, y: tmp.y, r: 4.4 + intensity * 2.0, lvl: lvl });

      if (Math.random() < 0.35 + intensity * 0.5) {
        var a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 70;
        smoke.push({
          x: tmp.x + (Math.random() - 0.5) * 14,
          y: tmp.y + (Math.random() - 0.5) * 14,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          r: 8 + Math.random() * 9,
          grow: 34 + Math.random() * 30,
          life: 0, max: 0.55 + Math.random() * 0.5,
          peak: 0.16 + intensity * 0.30
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

  function update(dt, carX, carY) {
    var i, p, dx, dy;
    shake.t += dt;

    if (flash) { flash.t += dt; if (flash.t >= flash.dur) flash = null; }

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
      DR.Road.quads(ctx, rib, sd, -26, sd, 26);
      ctx.globalAlpha = 0.85 * k * flash.strength;
      ctx.fillStyle = flash.color;
      ctx.fill();
      ctx.beginPath();
      DR.Road.quads(ctx, rib, sd, -52, sd, 52);
      ctx.globalAlpha = 0.30 * k * flash.strength;
      ctx.fill();
    }

    // Soft border wash: one smooth fade, low peak, never a strobe.
    var a = 0.30 * k * flash.strength;
    ctx.strokeStyle = flash.color;
    ctx.globalAlpha = a;        ctx.lineWidth = 12; ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.globalAlpha = a * 0.55; ctx.lineWidth = 24; ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.globalAlpha = a * 0.22; ctx.lineWidth = 34; ctx.strokeRect(53, 53, W - 106, H - 106);
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
    reset: reset, emit: emit, hit: hit, update: update,
    shakeOffset: shakeOffset,
    drawSkids: drawSkids, drawSmoke: drawSmoke,
    drawFlash: drawFlash, drawLabels: drawLabels
  };
})(window.DR = window.DR || {});
