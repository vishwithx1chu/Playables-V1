/* road.js — the track: where the road centre is, and how it is drawn.
   The whole track is one number in, one number out: give it a distance and it
   tells you how far the road centre has slid sideways at that distance. */

(function (DR) {
  'use strict';

  var STEP = 8;              // world units between stored centre samples
  var HALF_W = 170;          // road is 340 units wide
  var CHEVRON_LEAD = 640;    // ~1.5 seconds of warning before a curve starts

  // A curve is a smooth sideways slide: the centre line's slope ramps 0 -> amp
  // -> 0 across the curve, which is exactly how a real road spirals in and out.
  // amp is peak sideways slope. The drift angle needed to hold the centre is
  // asin(amp), so amp 0.30 asks for ~17 degrees and 0.46 asks for ~27.
  var PATTERN = [
    { kind: 'straight', len: 760 },
    { kind: 'curve', len: 880, dir:  1, amp: 0.30 },
    { kind: 'straight', len: 720 },
    { kind: 'curve', len: 880, dir: -1, amp: 0.32 },
    { kind: 'straight', len: 700 },
    { kind: 'curve', len: 940, dir:  1, amp: 0.44 },
    { kind: 'straight', len: 700 },
    { kind: 'curve', len: 940, dir: -1, amp: 0.46 }
  ];

  var INTRO_LEN = 1400;      // gentle run-up so the first curve is never a surprise

  var samples, baseS, segs, genS, genX, genIndex, genSegS, inIntro;

  // ---------------------------------------------------------------- generation

  function currentSeg() {
    return inIntro ? { kind: 'straight', len: INTRO_LEN } : PATTERN[genIndex];
  }

  function advanceSeg() {
    if (inIntro) { inIntro = false; genIndex = 0; }
    else genIndex = (genIndex + 1) % PATTERN.length;
    genSegS = 0;
    var seg = currentSeg();
    segs.push({
      s0: genS, s1: genS + seg.len,
      kind: seg.kind, dir: seg.dir || 0, amp: seg.amp || 0
    });
  }

  function ensure(sMax) {
    while (genS < sMax) {
      var seg = currentSeg();
      if (genSegS >= seg.len) { advanceSeg(); seg = currentSeg(); }
      var slope = 0;
      if (seg.kind === 'curve') {
        var ramp = Math.sin(Math.PI * (genSegS / seg.len));
        slope = seg.amp * seg.dir * ramp * ramp;
      }
      genX += slope * STEP;
      genS += STEP;
      genSegS += STEP;
      samples.push(genX);
    }
  }

  function reset() {
    samples = [0];
    baseS = 0;
    segs = [{ s0: 0, s1: INTRO_LEN, kind: 'straight', dir: 0, amp: 0 }];
    genS = 0;
    genX = 0;
    genIndex = -1;
    genSegS = 0;
    inIntro = true;
    ensure(4000);
  }

  // Drop track we have already driven past, so a long session cannot grow
  // memory forever.
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

  // +1 = road bends right, -1 = bends left, 0 = straight.
  function dirAt(s) {
    var g = segAt(s);
    return (g && g.kind === 'curve') ? g.dir : 0;
  }

  // ------------------------------------------------------------------ drawing

  function sx(worldX, view) { return (worldX - view.camX) + view.W * 0.5; }
  function sy(s, view) { return view.carY - (s - view.carS); }

  var skyGrad = null, asphaltGrad = null, fogGrad = null;

  function drawBackground(ctx, view) {
    var W = view.W, H = view.H;
    if (!skyGrad) {
      skyGrad = ctx.createLinearGradient(0, -60, 0, H);
      skyGrad.addColorStop(0.00, '#3a1247');
      skyGrad.addColorStop(0.10, '#2c0f3d');
      skyGrad.addColorStop(0.26, '#150a22');
      skyGrad.addColorStop(1.00, '#07050e');
    }
    // Oversized: the screen shake moves everything, and this must never
    // expose the letterbox colour at the playfield edge.
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-60, -60, W + 120, H + 120);

    drawGroundGrid(ctx, view);
  }

  // Faint grid outside the road. It scrolls, so there is a sense of speed even
  // where there is no asphalt.
  function drawGroundGrid(ctx, view) {
    var W = view.W, H = view.H, s, x;
    ctx.lineWidth = 1;

    ctx.strokeStyle = 'rgba(214,86,214,0.075)';
    ctx.beginPath();
    var stepS = 130;
    var s0 = Math.floor(view.sBot / stepS) * stepS;
    for (s = s0; s <= view.sTop; s += stepS) {
      var y = sy(s, view);
      if (y < -60 || y > H + 60) continue;
      ctx.moveTo(-60, y);
      ctx.lineTo(W + 60, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(90,214,255,0.055)';
    ctx.beginPath();
    var stepX = 90;
    var xLeft = view.camX - W * 0.5 - 60;
    var xRight = view.camX + W * 0.5 + 60;
    var wx = Math.floor(xLeft / stepX) * stepX;
    for (; wx <= xRight; wx += stepX) {
      x = sx(wx, view);
      ctx.moveTo(x, -60);
      ctx.lineTo(x, H + 60);
    }
    ctx.stroke();
  }

  // Build the list of screen points down the road once per frame; every other
  // road drawing step reuses it.
  function buildRibbon(view) {
    var pts = [];
    var RS = 12;
    for (var s = view.sBot; s <= view.sTop + RS; s += RS) {
      var cx = centerAt(s);
      pts.push({ s: s, cx: cx, x: sx(cx, view), y: sy(s, view) });
    }
    return pts;
  }

  function edgePath(ctx, pts, sign) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x + sign * HALF_W, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x + sign * HALF_W, pts[i].y);
    }
  }

  function draw(ctx, view) {
    ensure(view.sTop + 96);
    var pts = buildRibbon(view);
    var i;

    // Asphalt.
    if (!asphaltGrad) {
      asphaltGrad = ctx.createLinearGradient(0, 0, 0, view.H);
      asphaltGrad.addColorStop(0, '#0b0a18');
      asphaltGrad.addColorStop(1, '#16132a');
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x - HALF_W, pts[0].y);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x - HALF_W, pts[i].y);
    for (i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x + HALF_W, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = asphaltGrad;
    ctx.fill();

    drawLaneDashes(ctx, view);

    // Edges: wide soft halo, bright core, then a thin white line. The white
    // line is what guarantees contrast against the near-black asphalt.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var side = -1; side <= 1; side += 2) {
      edgePath(ctx, pts, side);
      ctx.lineWidth = 18;
      ctx.strokeStyle = 'rgba(34,230,255,0.16)';
      ctx.stroke();

      edgePath(ctx, pts, side);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#22e6ff';
      ctx.shadowColor = '#22e6ff';
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;

      edgePath(ctx, pts, side);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = 'rgba(240,252,255,0.9)';
      ctx.stroke();
    }
  }

  function drawLaneDashes(ctx, view) {
    var DASH = 62, GAP = 66, period = DASH + GAP;
    var offs = [-HALF_W / 3, HALF_W / 3];
    var s0 = Math.floor(view.sBot / period) * period;

    ctx.lineWidth = 5;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(255,74,206,0.85)';
    ctx.shadowColor = '#ff4ace';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (var ds = s0; ds < view.sTop; ds += period) {
      var a = Math.max(ds, view.sBot);
      var b = Math.min(ds + DASH, view.sTop);
      if (b <= a) continue;
      for (var k = 0; k < 2; k++) {
        var o = offs[k];
        ctx.moveTo(sx(centerAt(a) + o, view), sy(a, view));
        var mid = (a + b) * 0.5;
        ctx.lineTo(sx(centerAt(mid) + o, view), sy(mid, view));
        ctx.lineTo(sx(centerAt(b) + o, view), sy(b, view));
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Warning chevrons: both roadsides, pointing the way the road is about to go.
  function drawChevron(ctx, x, y, dir, alpha) {
    var w = 15, h = 13;
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x - w * dir, y - h);
    ctx.lineTo(x + w * dir, y);
    ctx.lineTo(x - w * dir, y + h);
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255,150,40,0.20)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - w * dir, y - h);
    ctx.lineTo(x + w * dir, y);
    ctx.lineTo(x - w * dir, y + h);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffb24d';
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  function drawChevrons(ctx, view) {
    var SP = 92;
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (g.kind !== 'curve') continue;

      var len = g.s1 - g.s0;
      var from = g.s0 - CHEVRON_LEAD;
      var to = g.s0 + len * 0.28;
      if (to < view.sBot || from > view.sTop) continue;

      var start = Math.ceil(from / SP) * SP;
      for (var s = start; s <= to; s += SP) {
        if (s < view.sBot || s > view.sTop) continue;
        // Full strength on approach, fading out once the curve is under way.
        var a = s <= g.s0 ? 1 : Math.max(0, 1 - (s - g.s0) / (len * 0.28));
        var cx = centerAt(s);
        var y = sy(s, view);
        drawChevron(ctx, sx(cx - HALF_W - 36, view), y, g.dir, a);
        drawChevron(ctx, sx(cx + HALF_W + 36, view), y, g.dir, a);
      }
    }
  }

  // Distance haze, so the road dissolves into the horizon instead of ending
  // at a hard line.
  function drawFog(ctx, view) {
    if (!fogGrad) {
      fogGrad = ctx.createLinearGradient(0, -60, 0, 430);
      fogGrad.addColorStop(0.00, 'rgba(31,13,50,1)');
      fogGrad.addColorStop(0.42, 'rgba(31,13,50,0.72)');
      fogGrad.addColorStop(1.00, 'rgba(31,13,50,0)');
    }
    ctx.fillStyle = fogGrad;
    ctx.fillRect(-60, -60, view.W + 120, 490);

    // Purple-to-orange horizon bloom, painted over the haze rather than under
    // it, so distant light glows through the murk instead of being buried.
    var W = view.W;
    var glow = ctx.createRadialGradient(W * 0.5, 10, 10, W * 0.5, 10, 470);
    glow.addColorStop(0.00, 'rgba(255,150,66,0.50)');
    glow.addColorStop(0.30, 'rgba(240,96,110,0.22)');
    glow.addColorStop(0.62, 'rgba(178,60,190,0.12)');
    glow.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-60, -60, W + 120, 540);
  }

  DR.Road = {
    HALF_W: HALF_W,
    STEP: STEP,
    reset: reset,
    ensure: ensure,
    trim: trim,
    centerAt: centerAt,
    dirAt: dirAt,
    buildRibbon: buildRibbon,
    edgePath: edgePath,
    drawBackground: drawBackground,
    draw: draw,
    drawChevrons: drawChevrons,
    drawFog: drawFog,
    sx: sx,
    sy: sy
  };
})(window.DR = window.DR || {});
