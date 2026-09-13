/* road.js — a real circuit in world space, and the camera that follows it.
   The track is no longer a strip that slides sideways: it is a line that
   genuinely turns, built by integrating curvature along its length. That is
   what makes a 180 degree hairpin possible at all. */

(function (DR) {
  'use strict';

  var HALF_W = 170;          // road is 340 units wide
  var SAMPLE = 8;            // world units between stored centreline points

  /* ---------------------------- THE CAMERA ----------------------------
     Sits CAM_BACK behind the car, turned to face the way the car is going,
     high enough that the car lands on CAR_Y. Lower CAM_BACK for a more
     dramatic angle, raise it to flatten back toward top-down. */
  var HORIZON_Y = 240;
  var CAR_Y     = 930;
  var CAM_BACK  = 520;
  var FOCAL     = 489;
  var NEAR      = 70;        // nothing closer than this can be drawn
  var LOOKAHEAD = 2600;      // world units of road drawn ahead of the car
  var K         = (CAR_Y - HORIZON_Y) * CAM_BACK;
  var SC_CAR    = FOCAL / CAM_BACK;
  /* -------------------------------------------------------------------- */

  var CHEVRON_LEAD = 900;
  var HAIRPIN_LEAD = 1300;

  /* ------------------------------ THE LAP ------------------------------
     Radius is what makes a corner hard: the car's tightest possible circle
     is speed / (TURN_GAIN * sin(MAX_DRIFT)), about 500 units. A 620 radius
     corner therefore needs ~81% of everything the car has, held the whole
     way round. Nothing here is below 620.

     Total heading change over one lap is exactly zero — every left is paid
     back by a right — so it drives like a circuit rather than a spiral. */
  var LAP = [
    { kind: 'str',  len: 520 },
    { kind: 'turn', dir:  1, r: 820, deg:  95 },   // opening sweeper
    { kind: 'str',  len: 140 },
    { kind: 'turn', dir: -1, r: 620, deg:  55 },   // chicane: nothing between
    { kind: 'turn', dir:  1, r: 620, deg:  55 },
    { kind: 'str',  len: 160 },
    { kind: 'turn', dir: -1, r: 600, deg: 180, hairpin: true },   // tightest corner
    { kind: 'str',  len: 180 },
    { kind: 'turn', dir:  1, r: 700, deg:  70 },
    { kind: 'str',  len: 120 },
    { kind: 'turn', dir:  1, r: 640, deg:  60 },   // four esses back to back:
    { kind: 'turn', dir: -1, r: 640, deg:  60 },   // three full reversals with
    { kind: 'turn', dir:  1, r: 640, deg:  60 },   // no rest anywhere in them
    { kind: 'turn', dir: -1, r: 640, deg:  60 },
    { kind: 'str',  len: 200 },
    { kind: 'turn', dir:  1, r: 900, deg: 100 },   // long committed right
    { kind: 'str',  len: 140 },
    { kind: 'turn', dir: -1, r: 640, deg: 150 },   // almost a hairpin
    { kind: 'str',  len: 160 },
    { kind: 'turn', dir:  1, r: 620, deg: 180, hairpin: true },   // hairpin the other way
    { kind: 'str',  len: 220 },
    { kind: 'turn', dir: -1, r: 760, deg: 115 },
    { kind: 'str',  len: 300 }
  ];

  var INTRO_LEN = 1100;

  // Centreline, sampled every SAMPLE units. Uniform spacing means arc length
  // converts to an array index by division — no searching.
  var cx, cy, ch, ck, baseS;
  var segs, genX, genY, genH, genS, genIndex, genT, inIntro, lapNo;

  function segLength(seg) {
    if (seg.kind === 'str') return seg.len;
    var ang = seg.deg * Math.PI / 180;
    var arc = ang * seg.r;
    var T = Math.min(150, seg.r * 0.5, arc * 0.5);
    return arc + T;
  }

  // Curvature ramps in and out so no corner arrives as a step change — the
  // same easing a real road uses, and the reason a corner can be caught.
  function segCurvature(seg, t) {
    if (seg.kind === 'str') return 0;
    var ang = seg.deg * Math.PI / 180;
    var arc = ang * seg.r;
    var T = Math.min(150, seg.r * 0.5, arc * 0.5);
    var hold = arc - T;
    var total = arc + T;
    var f;
    if (t < T) f = 0.5 - 0.5 * Math.cos(Math.PI * (t / T));
    else if (t < T + hold) f = 1;
    else f = 0.5 - 0.5 * Math.cos(Math.PI * ((total - t) / T));
    if (f < 0) f = 0;
    return seg.dir * f / seg.r;
  }

  function currentSeg() {
    return inIntro ? { kind: 'str', len: INTRO_LEN } : LAP[genIndex];
  }

  function advanceSeg() {
    if (inIntro) { inIntro = false; genIndex = 0; }
    else {
      genIndex++;
      if (genIndex >= LAP.length) { genIndex = 0; lapNo++; }
    }
    genT = 0;
    var seg = currentSeg();
    segs.push({
      s0: genS, s1: genS + segLength(seg),
      turn: seg.kind === 'turn',
      dir: seg.dir || 0,
      r: seg.r || 0,
      hairpin: !!seg.hairpin
    });
  }

  function ensure(sMax) {
    while (genS < sMax) {
      var seg = currentSeg();
      if (genT >= segLength(seg)) { advanceSeg(); seg = currentSeg(); }

      // Midpoint step: turn half, move, turn the rest. Keeps tight corners
      // the right radius instead of slowly bulging outward.
      var k = segCurvature(seg, genT + SAMPLE * 0.5);
      genH += k * SAMPLE * 0.5;
      genX += Math.sin(genH) * SAMPLE;
      genY += Math.cos(genH) * SAMPLE;
      genH += k * SAMPLE * 0.5;

      genS += SAMPLE;
      genT += SAMPLE;
      cx.push(genX); cy.push(genY); ch.push(genH); ck.push(k);
    }
  }

  function reset() {
    cx = [0]; cy = [0]; ch = [0]; ck = [0];
    baseS = 0;
    segs = [{ s0: 0, s1: INTRO_LEN, turn: false, dir: 0, r: 0, hairpin: false }];
    genX = 0; genY = 0; genH = 0; genS = 0;
    genIndex = -1; genT = 0; inIntro = true; lapNo = 0;
    ensure(9000);
  }

  function trim(sMin) {
    var drop = Math.floor((sMin - baseS) / SAMPLE);
    if (drop > 2000) {
      cx.splice(0, drop); cy.splice(0, drop); ch.splice(0, drop); ck.splice(0, drop);
      baseS += drop * SAMPLE;
    }
    while (segs.length > 2 && segs[0].s1 < sMin) segs.shift();
  }

  // ------------------------------------------------------------------ queries

  function indexAt(s) {
    var i = Math.round((s - baseS) / SAMPLE);
    if (i < 0) i = 0;
    if (i > cx.length - 1) i = cx.length - 1;
    return i;
  }

  function lengthGenerated() { return baseS + (cx.length - 1) * SAMPLE; }

  // Where the centreline is, and which way it points, at an arc length.
  var _c = { x: 0, y: 0, h: 0, k: 0 };
  function centreAt(s, out) {
    out = out || _c;
    ensure(s + SAMPLE * 4);
    var i = indexAt(s);
    out.x = cx[i]; out.y = cy[i]; out.h = ch[i]; out.k = ck[i];
    return out;
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

  function dirAt(s) { var g = segAt(s); return (g && g.turn) ? g.dir : 0; }
  function isHairpin(s) { var g = segAt(s); return !!(g && g.hairpin); }
  function radiusAt(s) { var g = segAt(s); return (g && g.turn) ? g.r : 0; }

  // Where is the car relative to the road? Walks out from a hint index, so
  // it costs a handful of comparisons however long the track gets.
  var _loc = { s: 0, dev: 0, h: 0, k: 0, i: 0, px: 0, py: 0, nx: 0, ny: 0 };
  function locate(wx, wy, hintS, out) {
    out = out || _loc;
    ensure(hintS + 600);
    var i0 = indexAt(hintS);
    var best = i0, bestD = Infinity, i, dx, dy, d;
    var lo = Math.max(0, i0 - 40), hi = Math.min(cx.length - 1, i0 + 40);
    for (i = lo; i <= hi; i++) {
      dx = wx - cx[i]; dy = wy - cy[i];
      d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    // If the answer sits on the edge of the window the hint was stale, so
    // widen the search once rather than returning something wrong.
    if (best === lo || best === hi) {
      lo = Math.max(0, i0 - 600); hi = Math.min(cx.length - 1, i0 + 600);
      for (i = lo; i <= hi; i++) {
        dx = wx - cx[i]; dy = wy - cy[i];
        d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    var h = ch[best];
    var ex = wx - cx[best], ey = wy - cy[best];
    var sn = Math.sin(h), cs = Math.cos(h);
    out.i = best;
    out.h = h;
    out.k = ck[best];
    out.px = cx[best]; out.py = cy[best];
    out.nx = cs; out.ny = -sn;            // unit normal, pointing right
    out.dev = ex * cs - ey * sn;          // + is right of the centreline
    out.s = baseS + best * SAMPLE + (ex * sn + ey * cs);
    return out;
  }

  // --------------------------------------------------------------- projection

  var _p = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
  function project(wx, wy, view, out) {
    out = out || _p;
    var dx = wx - view.camX, dy = wy - view.camY;
    var rz = dx * view.camSin + dy * view.camCos;
    out.rz = rz;
    if (rz < NEAR) { out.vis = false; return out; }
    var sc = FOCAL / rz;
    out.sc = sc;
    out.x = view.W * 0.5 + (dx * view.camCos - dy * view.camSin) * sc;
    out.y = HORIZON_Y + K / rz;
    out.vis = true;
    return out;
  }

  // ------------------------------------------------------------------ drawing

  var skyGrad = null, groundGrad = null, fogGrad = null;

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

  // The sun swings across the sky as you turn, which is most of what tells
  // you a 180 has actually turned you around.
  function drawSun(ctx, view) {
    var W = view.W;
    var sunWorld = -0.55;                       // fixed bearing in the world
    var rel = sunWorld - view.camAngle;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) > 1.5) return;            // behind you
    var cxp = W * 0.5 + Math.tan(rel) * FOCAL;
    var r = 190;

    var halo = ctx.createRadialGradient(cxp, HORIZON_Y, r * 0.3, cxp, HORIZON_Y, r * 2.4);
    halo.addColorStop(0.00, 'rgba(255,138,60,0.42)');
    halo.addColorStop(0.40, 'rgba(224,70,140,0.18)');
    halo.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-60, -60, W + 120, HORIZON_Y + 60);

    ctx.save();
    ctx.beginPath();
    ctx.rect(-60, -60, W + 120, HORIZON_Y + 60);
    ctx.clip();
    var disc = ctx.createLinearGradient(0, HORIZON_Y - r, 0, HORIZON_Y + 10);
    disc.addColorStop(0.00, '#ffd76a');
    disc.addColorStop(0.45, '#ff8a3d');
    disc.addColorStop(1.00, '#ff2f8e');
    ctx.beginPath();
    ctx.arc(cxp, HORIZON_Y, r, 0, Math.PI * 2);
    ctx.fillStyle = disc;
    ctx.fill();
    ctx.fillStyle = 'rgba(20,10,38,0.85)';
    for (var i = 0; i < 7; i++) {
      ctx.fillRect(cxp - r, HORIZON_Y - i * i * 3.4 - 8, r * 2, 3 + i * 1.5);
    }
    ctx.restore();
  }

  // A straight line on the ground stays straight on screen under this
  // projection, so each grid line costs two projections instead of twenty.
  // Lines crossing behind the camera get clipped to the near plane.
  var _sa = { x: 0, y: 0 }, _sb = { x: 0, y: 0 };
  function projectSegment(ax, ay, bx, by, view) {
    var adx = ax - view.camX, ady = ay - view.camY;
    var bdx = bx - view.camX, bdy = by - view.camY;
    var arz = adx * view.camSin + ady * view.camCos;
    var brz = bdx * view.camSin + bdy * view.camCos;
    if (arz < NEAR && brz < NEAR) return false;
    if (arz < NEAR) {
      var t = (NEAR - arz) / (brz - arz);
      adx += (bdx - adx) * t; ady += (bdy - ady) * t; arz = NEAR;
    } else if (brz < NEAR) {
      var u = (NEAR - brz) / (arz - brz);
      bdx += (adx - bdx) * u; bdy += (ady - bdy) * u; brz = NEAR;
    }
    var sa = FOCAL / arz, sb = FOCAL / brz;
    _sa.x = view.W * 0.5 + (adx * view.camCos - ady * view.camSin) * sa;
    _sa.y = HORIZON_Y + K / arz;
    _sb.x = view.W * 0.5 + (bdx * view.camCos - bdy * view.camSin) * sb;
    _sb.y = HORIZON_Y + K / brz;
    return true;
  }

  // World-anchored, so it slides and swings underneath you through a corner —
  // which is most of what tells you the car has actually turned.
  function drawGrid(ctx, view) {
    var W = view.W, G = 240, R = 3400;
    var gx0 = Math.floor((view.camX - R) / G) * G;
    var gy0 = Math.floor((view.camY - R) / G) * G;
    var g;

    ctx.strokeStyle = 'rgba(158,116,240,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (g = gx0; g <= view.camX + R; g += G) {
      if (!projectSegment(g, view.camY - R, g, view.camY + R, view)) continue;
      if ((_sa.x < -80 && _sb.x < -80) || (_sa.x > W + 80 && _sb.x > W + 80)) continue;
      ctx.moveTo(_sa.x, _sa.y); ctx.lineTo(_sb.x, _sb.y);
    }
    for (g = gy0; g <= view.camY + R; g += G) {
      if (!projectSegment(view.camX - R, g, view.camX + R, g, view)) continue;
      if ((_sa.x < -80 && _sb.x < -80) || (_sa.x > W + 80 && _sb.x > W + 80)) continue;
      ctx.moveTo(_sa.x, _sa.y); ctx.lineTo(_sb.x, _sb.y);
    }
    ctx.stroke();
  }

  // Walk the centreline and project both edges. Steps get longer with
  // distance, because far-off road is worth fewer pixels.
  // The ribbon is rebuilt every frame, so its points are pooled and reused.
  // Allocating a hundred fresh objects per frame is what turns a smooth 60
  // into periodic garbage-collection stutter.
  var ribPool = [];
  ribPool.count = 0;

  function buildRibbon(view) {
    var out = ribPool, n = 0;
    var sStart = view.carS - (CAM_BACK - NEAR) - 40;
    var sEnd = view.carS + LOOKAHEAD;
    ensure(sEnd + 200);

    var pL = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
    var pR = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
    var pC = { x: 0, y: 0, sc: 0, rz: 0, vis: false };

    var s = sStart;
    while (s <= sEnd) {
      var i = indexAt(s);
      var h = ch[i], sn = Math.sin(h), cs = Math.cos(h);
      var nx = cs, ny = -sn;                       // unit normal, pointing right
      project(cx[i] - nx * HALF_W, cy[i] - ny * HALF_W, view, pL);
      project(cx[i] + nx * HALF_W, cy[i] + ny * HALF_W, view, pR);
      project(cx[i], cy[i], view, pC);
      var e = out[n];
      if (!e) { e = out[n] = { s: 0, ok: false, lx: 0, ly: 0, rx: 0, ry: 0, sc: 0, rz: 0 }; }
      e.s = s; e.ok = pL.vis && pR.vis;
      e.lx = pL.x; e.ly = pL.y; e.rx = pR.x; e.ry = pR.y;
      e.sc = pC.sc; e.rz = pC.rz;
      n++;
      var ahead = s - view.carS;
      s += ahead < 400 ? 10 : (ahead < 1100 ? 26 : 52);
    }
    out.count = n;
    return out;
  }

  // Each piece of road is its own closed shape in one path, so a corner that
  // folds back over itself just overlaps instead of filling in its own middle.
  function quads(ctx, rib, fromL, fromR, toL, toR) {
    for (var i = 0; i < rib.count - 1; i++) {
      var a = rib[i], b = rib[i + 1];
      if (!a.ok || !b.ok) continue;
      var ax1 = a.lx + (a.rx - a.lx) * fromL, ay1 = a.ly + (a.ry - a.ly) * fromL;
      var ax2 = a.lx + (a.rx - a.lx) * fromR, ay2 = a.ly + (a.ry - a.ly) * fromR;
      var bx1 = b.lx + (b.rx - b.lx) * toL,   by1 = b.ly + (b.ry - b.ly) * toL;
      var bx2 = b.lx + (b.rx - b.lx) * toR,   by2 = b.ly + (b.ry - b.ly) * toR;
      ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2);
      ctx.lineTo(bx2, by2); ctx.lineTo(bx1, by1);
      ctx.closePath();
    }
  }

  function draw(ctx, view) {
    var rib = buildRibbon(view);

    ctx.beginPath();
    quads(ctx, rib, 0, 1, 0, 1);
    ctx.fillStyle = '#100d20';
    ctx.fill();

    drawLaneDashes(ctx, rib);

    // Edges, as a fraction of the road width so they thin out with distance
    // for free.
    var eo = 10 / (HALF_W * 2);
    ctx.beginPath(); quads(ctx, rib, -eo * 2.4, eo * 2.4, -eo * 2.4, eo * 2.4);
    ctx.fillStyle = 'rgba(34,230,255,0.13)'; ctx.fill();
    ctx.beginPath(); quads(ctx, rib, 1 - eo * 2.4, 1 + eo * 2.4, 1 - eo * 2.4, 1 + eo * 2.4);
    ctx.fillStyle = 'rgba(34,230,255,0.13)'; ctx.fill();

    // Bloom comes from stacked translucent passes rather than a canvas blur.
    var eb = eo * 5.0;
    ctx.beginPath(); quads(ctx, rib, -eb, eb, -eb, eb);
    ctx.fillStyle = 'rgba(34,230,255,0.07)'; ctx.fill();
    ctx.beginPath(); quads(ctx, rib, 1 - eb, 1 + eb, 1 - eb, 1 + eb);
    ctx.fillStyle = 'rgba(34,230,255,0.07)'; ctx.fill();

    ctx.beginPath(); quads(ctx, rib, -eo, eo, -eo, eo);
    ctx.fillStyle = '#22e6ff'; ctx.fill();
    ctx.beginPath(); quads(ctx, rib, 1 - eo, 1 + eo, 1 - eo, 1 + eo);
    ctx.fillStyle = '#22e6ff'; ctx.fill();

    var wo = 3 / (HALF_W * 2);
    ctx.beginPath(); quads(ctx, rib, -wo, wo, -wo, wo);
    ctx.fillStyle = 'rgba(240,252,255,0.92)'; ctx.fill();
    ctx.beginPath(); quads(ctx, rib, 1 - wo, 1 + wo, 1 - wo, 1 + wo);
    ctx.fillStyle = 'rgba(240,252,255,0.92)'; ctx.fill();

    return rib;
  }

  function drawLaneDashes(ctx, rib) {
    var period = 132, DASH = 66;
    var dw = 7 / (HALF_W * 2);
    ctx.beginPath();
    for (var i = 0; i < rib.count - 1; i++) {
      var a = rib[i], b = rib[i + 1];
      if (!a.ok || !b.ok || a.sc < 0.07) continue;
      var ms = (a.s + b.s) * 0.5;
      if (ms - Math.floor(ms / period) * period > DASH) continue;
      for (var k = 0; k < 2; k++) {
        var f = k === 0 ? 1 / 3 : 2 / 3;
        var ax1 = a.lx + (a.rx - a.lx) * (f - dw), ay1 = a.ly + (a.ry - a.ly) * (f - dw);
        var ax2 = a.lx + (a.rx - a.lx) * (f + dw), ay2 = a.ly + (a.ry - a.ly) * (f + dw);
        var bx1 = b.lx + (b.rx - b.lx) * (f - dw), by1 = b.ly + (b.ry - b.ly) * (f - dw);
        var bx2 = b.lx + (b.rx - b.lx) * (f + dw), by2 = b.ly + (b.ry - b.ly) * (f + dw);
        ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2);
        ctx.lineTo(bx2, by2); ctx.lineTo(bx1, by1);
        ctx.closePath();
      }
    }
    ctx.fillStyle = 'rgba(255,74,206,0.88)';
    ctx.fill();
  }

  function drawChevron(ctx, x, y, sc, dir, alpha, doubled) {
    var fade = (sc - 0.20) / 0.14;
    if (fade <= 0) return;
    if (fade > 1) fade = 1;
    var w = 16 * sc / SC_CAR, h = 14 * sc / SC_CAR;
    if (w < 1.4) return;
    ctx.globalAlpha = alpha * fade;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (var n = 0; n < (doubled ? 2 : 1); n++) {
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
    var p = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
    var sEnd = view.carS + LOOKAHEAD;
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i];
      if (!g.turn) continue;
      var len = g.s1 - g.s0;
      var lead = g.hairpin ? HAIRPIN_LEAD : CHEVRON_LEAD;
      var spacing = g.hairpin ? 86 : 104;
      var from = g.s0 - lead;
      // Where corners run straight into each other there is no approach to
      // sign, and a full run of arrows would cross the previous corner's and
      // read as a row of X's. Sign the entry only.
      var prev = segs[i - 1];
      if (prev && prev.turn && from < prev.s1) from = g.s0 - 130;
      var to = g.s0 + len * (g.hairpin ? 0.65 : 0.4);
      if (to < view.carS - 400 || from > sEnd) continue;

      for (var s = Math.ceil(from / spacing) * spacing; s <= to; s += spacing) {
        if (s < view.carS - 400 || s > sEnd) continue;
        var a = s <= g.s0 ? 1 : Math.max(0, 1 - (s - g.s0) / (len * 0.4));
        var idx = indexAt(s);
        var hh = ch[idx], nx = Math.cos(hh), ny = -Math.sin(hh);
        var off = HALF_W + 42;
        project(cx[idx] - nx * off, cy[idx] - ny * off, view, p);
        if (p.vis) drawChevron(ctx, p.x, p.y, p.sc, g.dir, a, g.hairpin);
        project(cx[idx] + nx * off, cy[idx] + ny * off, view, p);
        if (p.vis) drawChevron(ctx, p.x, p.y, p.sc, g.dir, a, g.hairpin);
      }
    }
  }

  function drawFog(ctx, view) {
    if (!fogGrad) {
      var top = HORIZON_Y - 20;
      fogGrad = ctx.createLinearGradient(0, top, 0, top + 300);
      fogGrad.addColorStop(0.00, 'rgba(104,34,92,1)');
      fogGrad.addColorStop(0.34, 'rgba(74,24,78,0.86)');
      fogGrad.addColorStop(1.00, 'rgba(34,14,48,0)');
    }
    ctx.fillStyle = fogGrad;
    ctx.fillRect(-60, HORIZON_Y - 20, view.W + 120, 300);
  }

  DR.Road = {
    HALF_W: HALF_W, SAMPLE: SAMPLE,
    HORIZON_Y: HORIZON_Y, CAR_Y: CAR_Y, CAM_BACK: CAM_BACK,
    FOCAL: FOCAL, LOOKAHEAD: LOOKAHEAD, SC_CAR: SC_CAR, NEAR: NEAR,
    reset: reset, ensure: ensure, trim: trim,
    centreAt: centreAt, locate: locate, indexAt: indexAt,
    dirAt: dirAt, isHairpin: isHairpin, radiusAt: radiusAt,
    lengthGenerated: lengthGenerated,
    project: project, buildRibbon: buildRibbon, quads: quads,
    drawBackground: drawBackground, draw: draw,
    drawChevrons: drawChevrons, drawFog: drawFog
  };
})(window.DR = window.DR || {});
