/* fx.js — the stuff that makes it feel like something: tire smoke, skid marks
   that stay on the road, screen shake and the edge-contact flash.
   Everything here is stored in world coordinates, so it stays stuck to the
   road and scrolls away behind you instead of floating with the camera. */

(function (DR) {
  'use strict';

  var DRIFT_THRESHOLD = 0.14;   // radians, ~8 degrees, before tires let go
  var MAX_SKIDS = 1000;
  var MAX_SMOKE = 220;

  var skids = [];
  var smoke = [];
  var labels = [];
  var shake = { mag: 0, t: 0, dur: 0.001 };
  var flash = null;

  var tmp = { x: 0, s: 0 };
  var puff = null;

  // One soft blob, drawn once into an offscreen canvas and then stamped over
  // and over. Cheaper than building a gradient per particle per frame.
  function getPuff() {
    if (puff) return puff;
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0.00, 'rgba(255,255,255,0.95)');
    rg.addColorStop(0.45, 'rgba(228,214,255,0.40)');
    rg.addColorStop(1.00, 'rgba(190,170,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    puff = c;
    return c;
  }

  function reset() {
    skids.length = 0;
    smoke.length = 0;
    labels.length = 0;
    shake.mag = 0;
    shake.t = shake.dur;
    flash = null;
  }

  // ----------------------------------------------------------------- emitting

  function emit(car, speed, dt) {
    var mag = Math.abs(car.drift);
    if (mag <= DRIFT_THRESHOLD) return;

    var intensity = Math.min(1, (mag - DRIFT_THRESHOLD) / 0.42);
    var lvl = intensity > 0.66 ? 2 : (intensity > 0.33 ? 1 : 0);

    // Rear wheels.
    for (var side = -1; side <= 1; side += 2) {
      car.wheelWorld(side * car.W * 0.46, car.L * 0.36, tmp);

      skids.push({ s: tmp.s, x: tmp.x, r: 4.4 + intensity * 2.0, lvl: lvl });

      if (Math.random() < 0.35 + intensity * 0.5) {
        smoke.push({
          s: tmp.s - Math.random() * 10,
          x: tmp.x + (Math.random() - 0.5) * 14,
          r: 8 + Math.random() * 9,
          grow: 34 + Math.random() * 30,
          vs: -(30 + Math.random() * 60),
          vx: (Math.random() - 0.5) * 70 - Math.sin(car.drift) * 40,
          life: 0,
          max: 0.55 + Math.random() * 0.5,
          peak: 0.16 + intensity * 0.30
        });
      }
    }

    if (skids.length > MAX_SKIDS) skids.splice(0, skids.length - MAX_SKIDS);
    if (smoke.length > MAX_SMOKE) smoke.splice(0, smoke.length - MAX_SMOKE);
  }

  // Contact with an edge. Deliberately a single soft fade with a cooldown in
  // front of it — never a repeating strobe.
  function hit(kind, severity, side, car) {
    var color = kind === 'INNER' ? '#a98bff'
              : kind === 'OUTER' ? '#ffae4a'
              : '#eaf2ff';
    var text = kind === 'INNER' ? 'CUT IN'
             : kind === 'OUTER' ? 'RAN WIDE'
             : 'OFF LINE';

    shake.mag = Math.max(shake.mag, 6 + severity * 16);
    shake.t = 0;
    shake.dur = 0.38;

    flash = { t: 0, dur: 0.45, side: side, color: color, strength: 0.45 + severity * 0.55 };

    labels.push({
      text: text, color: color,
      s: car.s + 60, x: car.x + side * 70,
      t: 0, dur: 1.0
    });
    if (labels.length > 4) labels.shift();
  }

  // ----------------------------------------------------------------- updating

  function update(dt, carS) {
    var i, p;

    shake.t += dt;

    if (flash) {
      flash.t += dt;
      if (flash.t >= flash.dur) flash = null;
    }

    for (i = labels.length - 1; i >= 0; i--) {
      labels[i].t += dt;
      if (labels[i].t >= labels[i].dur) labels.splice(i, 1);
    }

    for (i = smoke.length - 1; i >= 0; i--) {
      p = smoke[i];
      p.life += dt;
      p.s += p.vs * dt;
      p.x += p.vx * dt;
      p.r += p.grow * dt;
      p.vx *= 0.94;
      if (p.life >= p.max || p.s < carS - 520) smoke.splice(i, 1);
    }

    // Skid marks are pushed in order, so everything past the cut-off is at the
    // front of the list.
    var cut = 0;
    while (cut < skids.length && skids[cut].s < carS - 520) cut++;
    if (cut > 0) skids.splice(0, cut);
  }

  function shakeOffset() {
    if (shake.t >= shake.dur) return { x: 0, y: 0 };
    var k = 1 - shake.t / shake.dur;
    var amp = shake.mag * k * k;
    return {
      x: (Math.random() * 2 - 1) * amp,
      y: (Math.random() * 2 - 1) * amp
    };
  }

  // ----------------------------------------------------------------- drawing

  var SKID_ALPHA = [0.16, 0.26, 0.38];

  function drawSkids(ctx, view) {
    if (!skids.length) return;
    var i, m;
    for (var lvl = 0; lvl < 3; lvl++) {
      var opened = false;
      for (i = 0; i < skids.length; i++) {
        m = skids[i];
        if (m.lvl !== lvl) continue;
        var y = DR.Road.sy(m.s, view);
        if (y < -40 || y > view.H + 40) continue;
        if (!opened) { ctx.beginPath(); opened = true; }
        var x = DR.Road.sx(m.x, view);
        ctx.moveTo(x + m.r, y);
        ctx.arc(x, y, m.r, 0, Math.PI * 2);
      }
      if (opened) {
        ctx.fillStyle = 'rgba(6,4,14,' + SKID_ALPHA[lvl] + ')';
        ctx.fill();
      }
    }
  }

  function drawSmoke(ctx, view) {
    if (!smoke.length) return;
    var img = getPuff();
    for (var i = 0; i < smoke.length; i++) {
      var p = smoke[i];
      var y = DR.Road.sy(p.s, view);
      if (y < -80 || y > view.H + 80) continue;
      var k = p.life / p.max;
      var a = p.peak * (1 - k) * Math.min(1, k * 5);
      if (a <= 0.004) continue;
      var x = DR.Road.sx(p.x, view);
      ctx.globalAlpha = a;
      ctx.drawImage(img, x - p.r, y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawFlash(ctx, view) {
    if (!flash) return;
    var k = 1 - flash.t / flash.dur;
    k = k * k;
    var W = view.W, H = view.H;

    // Light up the edge that was actually touched, so you can see where it
    // happened and not just that it happened.
    var pts = DR.Road.buildRibbon(view);
    DR.Road.edgePath(ctx, pts, flash.side);
    ctx.globalAlpha = 0.85 * k * flash.strength;
    ctx.lineWidth = 20;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = flash.color;
    ctx.shadowColor = flash.color;
    ctx.shadowBlur = 26;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Soft border wash. Low peak alpha and a single smooth fade: no strobing.
    var a = 0.30 * k * flash.strength;
    ctx.strokeStyle = flash.color;
    ctx.globalAlpha = a;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.globalAlpha = a * 0.55;
    ctx.lineWidth = 24;
    ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.globalAlpha = a * 0.22;
    ctx.lineWidth = 34;
    ctx.strokeRect(53, 53, W - 106, H - 106);

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
      // Keep the words on screen even when the car is pinned to an edge.
      var x = Math.max(120, Math.min(view.W - 120, DR.Road.sx(l.x, view)));
      var y = Math.max(60, Math.min(view.H - 60, DR.Road.sy(l.s, view) - k * 70));
      ctx.globalAlpha = a * 0.55;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(4,2,10,0.95)';
      ctx.strokeText(l.text, x, y);
      ctx.globalAlpha = a;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  DR.FX = {
    reset: reset,
    emit: emit,
    hit: hit,
    update: update,
    shakeOffset: shakeOffset,
    drawSkids: drawSkids,
    drawSmoke: drawSmoke,
    drawFlash: drawFlash,
    drawLabels: drawLabels
  };
})(window.DR = window.DR || {});
