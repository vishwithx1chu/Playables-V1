/* road.js — the track, and the camera that looks at it.
   The track itself is still one number in, one number out: give it a distance
   and it says how far the road centre has slid sideways there. What changed in
   Milestone 1.1 is the camera: instead of looking straight down, it now sits
   behind and above the car, so the road recedes toward a horizon. */

(function (DR) {
  'use strict';

  var STEP = 8;              // world units between stored centre samples
  var HALF_W = 170;          // road is 340 units wide
  var CHEVRON_LEAD = 800;    // ~1.7 seconds of warning before a curve
  var HAIRPIN_LEAD = 1150;   // the big one gets warned about much earlier

  /* ---------------------------- THE CAMERA ----------------------------
     It sits CAM_BACK behind the car and high enough that the car lands at
     CAR_Y on screen. Everything further away shrinks toward HORIZON_Y,
     which is what gives the picture depth. Drop CAM_BACK for a more
     dramatic, lower camera; raise it to flatten back toward top-down. */
  var HORIZON_Y = 240;
  var CAR_Y     = 930;       // car still sits in the lower third (930/1280)
  var CAM_BACK  = 520;
  var FOCAL     = 489;       // sets how wide the road reads at the car
  var LOOKAHEAD = 4800;      // world units of road drawn ahead of the car
  var K         = (CAR_Y - HORIZON_Y) * CAM_BACK;   // camera height x focal
  var SC_CAR    = FOCAL / CAM_BACK;                 // projection scale at the car
  /* -------------------------------------------------------------------- */

  // Peak sideways slope of a curve. The drift angle needed to hold the centre
  // is asin(amp), so 0.36 asks for ~21 degrees and 0.56 asks for ~34 — against
  // a 38 degree maximum. The hairpin is deliberately near the limit.
  var PATTERN = [
    { kind: 'straight', len: 720 },
    { kind: 'curve', len: 900, dir:  1, amp: 0.36 },
    { kind: 'straight', len: 680 },
    { kind: 'curve', len: 900, dir: -1, amp: 0.38 },
    { kind: 'straight', len: 660 },
    { kind: 'curve', len: 960, dir:  1, amp: 0.50 },
    { kind: 'straight', len: 640 },
    { kind: 'curve', len: 960, dir: -1, amp: 0.52 },
    { kind: 'straight', len: 880 },
    // The hairpin: holds peak slope through the middle instead of easing
    // straight back out, so it is a long committed slide, not a flick.
    { kind: 'curve', len: 1250, dir: 1, amp: 0.56, hairpin: true },
    { kind: 'straight', len: 940 }
  ];

  var INTRO_LEN = 1500;

  var samples, baseS, segs, genS, genX, genIndex, genSegS, inIntro, lap;

  // ---------------------------------------------------------------- generation

  function currentSeg() {
    return inIntro ? { kind: 'straight', len: INTRO_LEN } : PATTERN[genIndex];
  }

  function advanceSeg() {
    if (inIntro) { inIntro = false; genIndex = 0; }
    else {
      genIndex = genIndex + 1;
      if (genIndex >= PATTERN.length) { genIndex = 0; lap++; }
    }
    genSegS = 0;
    var seg = currentSeg();
    // The hairpin swaps direction every lap, so it never becomes muscle memory.
    var dir = seg.dir || 0;
    if (seg.hairpin && (lap % 2 === 1)) dir = -dir;
    segs.push({
      s0: genS, s1: genS + seg.len,
      kind: seg.kind, dir: dir, amp: seg.amp || 0,
      hairpin: !!seg.hairpin
    });
  }

  function slopeAt(seg, rec, t) {
    if (seg.kind !== 'curve') return 0;
    var f;
    if (seg.hairpin) {
      // Ramp in, HOLD, ramp out. The exit ramp is the generous one: a heavy
      // car needs room to unwind, and every hairpin crash in testing was a
      // driver still drifting after the road had already straightened.
      var ramp = 0.30;
      if (t < ramp) f = 0.5 - 0.5 * Math.cos(Math.PI * (t / ramp));
      else if (t > 1 - ramp) f = 0.5 - 0.5 * Math.cos(Math.PI * ((1 - t) / ramp));
      else f = 1;
    } else {
      var b = Math.sin(Math.PI * t);
      f = b * b;
    }
    return seg.amp * rec.dir * f;
  }

  function ensure(sMax) {
    while (genS < sMax) {
      var seg = currentSeg();
      if (genSegS >= seg.len) { advanceSeg(); seg = currentSeg(); }
      var rec = segs[segs.length - 1];
      genX += slopeAt(seg, rec, genSegS / seg.len) * STEP;
      genS += STEP;
      genSegS += STEP;
      samples.push(genX);
    }
  }

  function reset() {
    samples = [0];
    baseS = 0;
    segs = [{ s0: 0, s1: INTRO_LEN, kind: 'straight', dir: 0, amp: 0, hairpin: false }];
    genS = 0;
    genX = 0;
    genIndex = -1;
    genSegS = 0;
    inIntro = true;
    lap = 0;
    ensure(6000);
  }

  function trim(sMin) {
    var drop = Math.floor((sMin - baseS) / STEP);
    if (drop > 1500) {
      samples.splice(0, drop);
      baseS += drop * STEP;
    }
    while (segs.length > 2 && segs[0].s1 < sMin) segs.shift();
  }

  // ------------------------------------------------------------------ queries

  function centerAt(s) {
    ensure(s + STEP * 3);
    var f = (s - baseS) / STEP;
    if (f <= 0) return samples[0];
    var i = Math.floor(f);
    if (i >= samples.length - 1) return samples[samples.length - 1];
    var a = samples[i];
    return a + (samples[i + 1] - a) * (f - i);
  }

  function segAt(s) {
    var lo = 0, hi = segs.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (s < segs[mid].s0) hi = mid - 1;
      else if (s >= segs[mid].s1) lo = mid + 1;
      else return segs[mid];
    }
    return null;
  }

  function dirAt(s) {
    var g = segAt(s);
    return (g && g.kind === 'curve') ? g.dir : 0;
  }

  function isHairpin(s) {
    var g = segAt(s);
    return !!(g && g.hairpin);
  }

  // --------------------------------------------------------------- projection

  // Where a point on the ground lands on screen, and how much it has shrunk.
  // Written into a shared object so the particle loops allocate nothing.
  var _p = { x: 0, y: 0, sc: 0 };
  function project(s, worldX, view, out) {
    out = out || _p;
    var dz = (s - view.carS) + CAM_BACK;
    if (dz < 10) dz = 10;
    var sc = FOCAL / dz;
    out.sc = sc;
    out.x = view.W * 0.5 + (worldX - view.camX) * sc;
    out.y = HORIZON_Y + K / dz;
    return out;
  }

  // Nearest bit of road the camera can actually see, just off the bottom edge.
  function nearS(carS, H) {
    return carS - CAM_BACK + K / (H + 60 - HORIZON_Y);
  }

  // ------------------------------------------------------------------ drawing

  var skyGrad = null, groundGrad = null, asphaltGrad = null, fogGrad = null;

  function drawBackground(ctx, view) {
    var W = view.W, H = view.H;

    if (!skyGrad) {
      skyGrad = ctx.createLinearGradient(0, -60, 0, HORIZON_Y);
      skyGrad.addColorStop(0.00, '#140a26');
      skyGrad.addColorStop(0.45, '#2d1046');
      skyGrad.addColorStop(0.80, '#5c1a55');
      skyGrad.addColorStop(1.00, '#8d2a4e');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-60, -60, W + 120, HORIZON_Y + 60);

    drawSun(ctx, view);

    if (!groundGrad) {
      groundGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, H + 60);
      groundGrad.addColorStop(0.00, '#1a0c2c');
      groundGrad.addColorStop(0.35, '#0d0719');
      groundGrad.addColorStop(1.00, '#06040e');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(-60, HORIZON_Y, W + 120, H + 120 - HORIZON_Y);

    drawGrid(ctx, view);
  }

  // The sun sits on the vanishing point and drifts a touch as you steer, so it
  // reads as something out there rather than something stuck to the glass.
  function drawSun(ctx, view) {
    var W = view.W;
    var cx = W * 0.5 - view.camX * 0.02;
    var r = 190;

    var halo = ctx.createRadialGradient(cx, HORIZON_Y, r * 0.3, cx, HORIZON_Y, r * 2.4);
    halo.addColorStop(0.00, 'rgba(255,138,60,0.42)');
    halo.addColorStop(0.40, 'rgba(224,70,140,0.18)');
    halo.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-60, -60, W + 120, HORIZON_Y + 60);

    ctx.save();
    ctx.beginPath();
    ctx.rect(-60, -60, W + 120, HORIZON_Y + 60);   // sun never spills onto the road
    ctx.clip();

    var disc = ctx.createLinearGradient(0, HORIZON_Y - r, 0, HORIZON_Y + 10);
    disc.addColorStop(0.00, '#ffd76a');
    disc.addColorStop(0.45, '#ff8a3d');
    disc.addColorStop(1.00, '#ff2f8e');
    ctx.beginPath();
    ctx.arc(cx, HORIZON_Y, r, 0, Math.PI * 2);
    ctx.fillStyle = disc;
    ctx.fill();

    // Slit bands: wider apart towards the bottom, the way the genre draws it.
    ctx.fillStyle = 'rgba(20,10,38,0.85)';
    for (var i = 0; i < 7; i++) {
      var yy = HORIZON_Y - i * i * 3.4 - 8;
      var hh = 3 + i * 1.5;
      ctx.fillRect(cx - r, yy, r * 2, hh);
    }
    ctx.restore();
  }

  // Perspective grid: every line of constant world-x runs to the vanishing
  // point, which is what sells the depth outside the road.
  function drawGrid(ctx, view) {
    var W = view.W, H = view.H;
    var vpX = W * 0.5, vpY = HORIZON_Y;
    var i, p;

    // Lines across, at fixed distances, bunching up as they recede.
    ctx.strokeStyle = 'rgba(214,86,214,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var stepS = 200;
    var s0 = Math.ceil((view.carS - CAM_BACK) / stepS) * stepS;
    for (var s = s0; s < view.carS + LOOKAHEAD; s += stepS) {
      p = project(s, view.camX, view);
      if (p.y > H + 60 || p.y < HORIZON_Y + 2) continue;
      ctx.moveTo(-60, p.y);
      ctx.lineTo(W + 60, p.y);
    }
    ctx.stroke();

    // Lines running away from you, converging on the vanishing point.
    ctx.strokeStyle = 'rgba(90,214,255,0.09)';
    ctx.beginPath();
    var stepX = 220;
    var nS = nearS(view.carS, H);
    var near = project(nS, view.camX, view);
    var spanNear = (W * 0.5 + 260) / near.sc;
    var wx0 = Math.floor((view.camX - spanNear) / stepX) * stepX;
    for (var wx = wx0; wx <= view.camX + spanNear; wx += stepX) {
      var nx = W * 0.5 + (wx - view.camX) * near.sc;
      ctx.moveTo(nx, H + 60);
      ctx.lineTo(vpX, vpY);
    }
    ctx.stroke();
  }

  // Slices sampled evenly down the SCREEN rather than evenly along the road,
  // so the far distance does not eat all the work for a few pixels.
  function buildRibbon(view) {
    var pts = [];
    var farY = HORIZON_Y + K / (CAM_BACK + LOOKAHEAD);
    var sy = view.H + 60;
    while (sy > farY) {
      var dz = K / (sy - HORIZON_Y);
      var s = view.carS - CAM_BACK + dz;
      var sc = FOCAL / dz;
      var cx = centerAt(s);
      pts.push({
        s: s, sc: sc, y: sy,
        x: view.W * 0.5 + (cx - view.camX) * sc,
        hw: HALF_W * sc
      });
      sy -= 9;
    }
    return pts;
  }

  // A band running along one edge of the road, thinning with distance.
  function edgeStrip(ctx, pts, sign, wCar) {
    var i, p, w, x;
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      w = Math.max(0.7, wCar * p.sc / SC_CAR);
      x = p.x + sign * p.hw;
      if (i === 0) ctx.moveTo(x - w * 0.5, p.y);
      else ctx.lineTo(x - w * 0.5, p.y);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      p = pts[i];
      w = Math.max(0.7, wCar * p.sc / SC_CAR);
      x = p.x + sign * p.hw;
      ctx.lineTo(x + w * 0.5, p.y);
    }
    ctx.closePath();
  }

  function draw(ctx, view) {
    ensure(view.sTop + 200);
    var pts = buildRibbon(view);
    var i;

    if (!asphaltGrad) {
      asphaltGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, view.H);
      asphaltGrad.addColorStop(0, '#0e0b1e');
      asphaltGrad.addColorStop(1, '#17142c');
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x - pts[0].hw, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x - pts[i].hw, pts[i].y);
    for (i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x + pts[i].hw, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = asphaltGrad;
    ctx.fill();

    drawLaneDashes(ctx, pts);

    for (var side = -1; side <= 1; side += 2) {
      edgeStrip(ctx, pts, side, 20);
      ctx.fillStyle = 'rgba(34,230,255,0.14)';
      ctx.fill();

      edgeStrip(ctx, pts, side, 7);
      ctx.fillStyle = '#22e6ff';
      ctx.shadowColor = '#22e6ff';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;

      edgeStrip(ctx, pts, side, 2.2);
      ctx.fillStyle = 'rgba(240,252,255,0.92)';
      ctx.fill();
    }

    return pts;
  }

  function drawLaneDashes(ctx, pts) {
    var period = 128, DASH = 62;
    var offs = [-HALF_W / 3, HALF_W / 3];
    var i, k;
    ctx.beginPath();
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (a.sc < 0.07) continue;                 // too far to read; the haze takes over
      var ms = (a.s + b.s) * 0.5;
      if (ms - Math.floor(ms / period) * period > DASH) continue;
      var wa = Math.max(0.8, 6 * a.sc / SC_CAR);
      var wb = Math.max(0.8, 6 * b.sc / SC_CAR);
      for (k = 0; k < 2; k++) {
        var xa = a.x + offs[k] * a.sc;
        var xb = b.x + offs[k] * b.sc;
        ctx.moveTo(xa - wa * 0.5, a.y);
        ctx.lineTo(xa + wa * 0.5, a.y);
        ctx.lineTo(xb + wb * 0.5, b.y);
        ctx.lineTo(xb - wb * 0.5, b.y);
        ctx.closePath();
      }
    }
    ctx.fillStyle = 'rgba(255,74,206,0.88)';
    ctx.shadowColor = '#ff4ace';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawChevron(ctx, x, y, sc, dir, alpha, doubled) {
    // Far off, chevrons collapse to a few pixels and bunch into noise. Fade
    // them in with distance instead of cutting them off, so nothing pops. The
    // window sits beyond the 1150-unit warning lead, so no needed warning is
    // ever withheld — they are simply faint before they matter.
    var fade = (sc - 0.22) / 0.14;
    if (fade <= 0) return;
    if (fade > 1) fade = 1;
    alpha *= fade;

    var w = 16 * sc / SC_CAR, h = 14 * sc / SC_CAR;
    if (w < 1.5) return;
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    var passes = doubled ? 2 : 1;
    for (var n = 0; n < passes; n++) {
      var off = n * 13 * sc / SC_CAR * -dir;
      ctx.beginPath();
      ctx.moveTo(x - w * dir + off, y - h);
      ctx.lineTo(x + w * dir + off, y);
      ctx.lineTo(x - w * dir + off, y + h);
      ctx.lineWidth = Math.max(1, 12 * sc / SC_CAR);
      ctx.strokeStyle = doubled ? 'rgba(255,90,60,0.22)' : 'rgba(255,150,40,0.20)';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - w * dir + off, y - h);
      ctx.lineTo(x + w * dir + off, y);
      ctx.lineTo(x - w * dir + off, y + h);
      ctx.lineWidth = Math.max(1, 5 * sc / SC_CAR);
      ctx.strokeStyle = doubled ? '#ff7a45' : '#ffb24d';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawChevrons(ctx, view) {
    var p = { x: 0, y: 0, sc: 0 };
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (g.kind !== 'curve') continue;

      var len = g.s1 - g.s0;
      var lead = g.hairpin ? HAIRPIN_LEAD : CHEVRON_LEAD;
      var spacing = g.hairpin ? 78 : 96;
      var from = g.s0 - lead;
      var to = g.s0 + len * (g.hairpin ? 0.55 : 0.28);
      if (to < view.sBot || from > view.sTop) continue;

      var start = Math.ceil(from / spacing) * spacing;
      for (var s = start; s <= to; s += spacing) {
        if (s < view.sBot || s > view.sTop) continue;
        var a = s <= g.s0 ? 1 : Math.max(0, 1 - (s - g.s0) / (len * 0.28));
        var cx = centerAt(s);
        project(s, cx - HALF_W - 40, view, p);
        drawChevron(ctx, p.x, p.y, p.sc, g.dir, a, g.hairpin);
        project(s, cx + HALF_W + 40, view, p);
        drawChevron(ctx, p.x, p.y, p.sc, g.dir, a, g.hairpin);
      }
    }
  }

  // Haze where the road meets the horizon, so nothing ends on a hard line.
  function drawFog(ctx, view) {
    if (!fogGrad) {
      var top = HORIZON_Y - 20;
      var farY = HORIZON_Y + K / (CAM_BACK + LOOKAHEAD);   // where the road stops
      var span = (farY - top) + 210;
      var atFar = (farY - top) / span;
      fogGrad = ctx.createLinearGradient(0, top, 0, top + span);
      fogGrad.addColorStop(0.00, 'rgba(104,34,92,1)');
      fogGrad.addColorStop(atFar, 'rgba(74,24,78,0.92)');  // road end, all but gone
      fogGrad.addColorStop(1.00, 'rgba(34,14,48,0)');
      fogGrad.__span = span;
    }
    ctx.fillStyle = fogGrad;
    ctx.fillRect(-60, HORIZON_Y - 20, view.W + 120, fogGrad.__span);
  }

  DR.Road = {
    HALF_W: HALF_W,
    STEP: STEP,
    HORIZON_Y: HORIZON_Y,
    CAR_Y: CAR_Y,
    CAM_BACK: CAM_BACK,
    LOOKAHEAD: LOOKAHEAD,
    SC_CAR: SC_CAR,
    reset: reset,
    ensure: ensure,
    trim: trim,
    centerAt: centerAt,
    dirAt: dirAt,
    isHairpin: isHairpin,
    project: project,
    nearS: nearS,
    buildRibbon: buildRibbon,
    edgeStrip: edgeStrip,
    drawBackground: drawBackground,
    draw: draw,
    drawChevrons: drawChevrons,
    drawFog: drawFog
  };
})(window.DR = window.DR || {});
