/* car.js — the drift.

   How it works now: holding a side builds a slip angle, exactly as before and
   with the same weight. What changed is what the slip angle does. It used to
   push the car sideways; now it ROTATES the car. Hold and you carve a circle;
   hold all the way through a hairpin and you come out facing the other way.
   Let go and the slip angle bleeds off, so the car keeps turning for a moment
   before it runs straight again — that lag is the weight you feel. */

(function (DR) {
  'use strict';

  /* ====================== FEEL TUNING — CHANGE THESE ======================
     MIN_RADIUS      the tightest circle the car can carve, at ANY speed. The
                     difficulty dial for the whole track; no corner may come
                     near it.
     SLIP_AT_LIMIT   how sideways the car sits when it is turning as hard as
                     it can. THIS is the drift dial. Bigger looks more like
                     drifting and nothing about the track geometry changes.
     BUILD_TAU       seconds to swing the body out into a drift.
     DECAY_TAU       seconds for the body to square itself up once you let go.
     REVERSE_TAU     seconds to swing it the other way — the chicane dial.
     GRIP_TAU        how far the PATH lags behind the BODY. This is the whole
                     difference between drifting and turning: the rear steps
                     out before the car goes anywhere, and the car carries on
                     coming round after the body has straightened. Zero here
                     and it goes back to looking like plain steering.
     ====================================================================== */
  var MIN_RADIUS      = 504;
  var SLIP_AT_LIMIT   = 52 * Math.PI / 180;
  var BUILD_TAU       = 0.34;
  var DECAY_TAU       = 0.55;
  var REVERSE_TAU     = 0.42;
  var GRIP_TAU        = 0.09;
  /* ====================================================================== */


  var CAR_W = 56;
  var CAR_L = 96;

  var bodyGrad = null, glowGrad = null;

  var Car = {
    W: CAR_W,
    L: CAR_L,
    SLIP_AT_LIMIT: SLIP_AT_LIMIT,
    x: 0, y: 0,      // world position
    h: 0,            // heading: the direction the car is actually travelling
    bodyYaw: 0,      // which way the body points, which is NOT where it is going
    cmdSlip: 0,      // how far round the body has swung
    gripSlip: 0,     // how far round the tyres have actually taken hold
    slip: 0,         // what you see: the same as cmdSlip
    yawRate: 0,

    reset: function () {
      this.x = 0; this.y = 0; this.h = 0;
      this.bodyYaw = 0; this.cmdSlip = 0; this.gripSlip = 0; this.slip = 0; this.yawRate = 0;
      this.roadS = 0; this.dev = 0;
    },

    update: function (dt, steer, speed) {
      /* Two angles, not one, and the gap between them is the drift.

         cmdSlip is how far round the BODY is — it answers your thumb almost
         at once. gripSlip is how far round the TYRES have actually taken
         hold, and it trails cmdSlip by GRIP_TAU. The car's PATH bends from
         gripSlip, never from cmdSlip.

         So flicking in swings the tail out before the car goes anywhere, and
         letting go squares the body up while the car is still coming round.
         Set GRIP_TAU to zero and both of those vanish and it is just
         steering again. */

      var target = steer * SLIP_AT_LIMIT;
      var tau;
      if (steer === 0) tau = DECAY_TAU;
      else if (this.cmdSlip * steer < 0) tau = REVERSE_TAU;
      else tau = BUILD_TAU;

      this.cmdSlip += (target - this.cmdSlip) * (1 - Math.exp(-dt / tau));
      this.gripSlip += (this.cmdSlip - this.gripSlip) * (1 - Math.exp(-dt / GRIP_TAU));

      // Only the tyres that have bitten actually turn the car.
      this.yawRate = (speed / MIN_RADIUS) * (Math.sin(this.gripSlip) / Math.sin(SLIP_AT_LIMIT));
      this.h += this.yawRate * dt;

      this.slip = this.cmdSlip;            // what you see, and what takes up road
      this.bodyYaw = this.h + this.cmdSlip;

      this.x += Math.sin(this.h) * speed * dt;
      this.y += Math.cos(this.h) * speed * dt;
    },

    // Shove the body round — used by a crash to help you recover, since slip
    // is not a thing you can set directly, only a thing the body causes.
    nudgeBody: function (radians) {
      var m = SLIP_AT_LIMIT;
      this.cmdSlip = Math.max(-m, Math.min(m, this.cmdSlip + radians));
      this.slip = this.cmdSlip;
      this.bodyYaw = this.h + this.cmdSlip;
    },

    // Scrub some of the slide off, by bringing the body back toward the way
    // the car is already travelling.
    scrubSlip: function (keep) {
      this.cmdSlip *= keep;
      this.gripSlip *= keep;
      this.slip = this.cmdSlip;
      this.bodyYaw = this.h + this.cmdSlip;
    },

    minRadius: function () { return MIN_RADIUS; },

    // How much road the car takes up: sideways-on, it needs more of it.
    halfWidth: function () {
      return Math.abs(Math.cos(this.slip)) * CAR_W * 0.5 +
             Math.abs(Math.sin(this.slip)) * CAR_L * 0.40;
    },

    // A point on the car's body, in world terms — used to plant smoke and
    // rubber under the actual wheels.
    bodyPoint: function (lx, lyForward, out) {
      var sn = Math.sin(this.bodyYaw), cs = Math.cos(this.bodyYaw);
      out.x = this.x + lx * cs + lyForward * sn;
      out.y = this.y - lx * sn + lyForward * cs;
      return out;
    },

    draw: function (ctx, view) { drawCar(ctx, view, this); }
  };

  /* ======================= THE CAR, IN ACTUAL 3D =======================
     Not a flat shape with a copy pasted above it — real geometry. Points in
     the car's own space (x across, y forward, z up), turned into the world,
     run through the same camera as the road, then every face sorted back to
     front and shaded off its own angle to the light. That is why the roof
     now reads as a roof and the flanks catch light as it turns.
     ===================================================================== */

  var VX = [], FACES = [];

  function ring(y, hw, zb, zt) {
    var i = VX.length;
    VX.push([-hw, y, zb], [hw, y, zb], [hw, y, zt], [-hw, y, zt]);
    return i;                                   // bl, br, tr, tl
  }
  function band(a, b, side, top, bottom) {
    if (bottom) FACES.push({ v: [a, a + 1, b + 1, b], m: bottom });
    FACES.push({ v: [a + 1, a + 2, b + 2, b + 1], m: side });
    if (top) FACES.push({ v: [a + 2, a + 3, b + 3, b + 2], m: top });
    FACES.push({ v: [a + 3, a, b, b + 3], m: side });
  }
  function quad(i, m) { FACES.push({ v: i, m: m }); }

  (function buildMesh() {
    // Lower body: six cross-sections from nose to tail.
    // Long, low and wide. Height had been nearly a third of the length, which
    // is a van; a sports car is closer to a fifth.
    var r0 = ring( 48, 13,  4, 10);
    var r1 = ring( 34, 24,  3, 14);
    var r2 = ring( 14, 27,  3, 17);
    var r3 = ring( -8, 27,  3, 17);
    var r4 = ring(-30, 27,  4, 16);
    var r5 = ring(-46, 22,  5, 13);
    band(r0, r1, 'body', 'hood', 'under');
    band(r1, r2, 'body', 'hood', 'under');
    band(r2, r3, 'body', 'deck', 'under');
    band(r3, r4, 'body', 'deck', 'under');
    band(r4, r5, 'body', 'deck', 'under');
    quad([r0, r0 + 1, r0 + 2, r0 + 3], 'body');       // nose
    quad([r5 + 3, r5 + 2, r5 + 1, r5], 'tailpanel');  // tail

    // Greenhouse, sitting on top. No floor: it would fight the deck.
    var c0 = ring( 13, 18, 17, 18);   // windscreen base, well forward
    var c1 = ring( -4, 16, 17, 28);   // steeply raked up to the roof
    var c2 = ring(-19, 16, 17, 27);
    var c3 = ring(-30, 18, 17, 19);
    band(c0, c1, 'glass', 'roof', null);
    band(c1, c2, 'glass', 'roof', null);
    band(c2, c3, 'glass', 'roof', null);
    quad([c0, c0 + 1, c0 + 2, c0 + 3], 'glass');      // windscreen
    quad([c3 + 3, c3 + 2, c3 + 1, c3], 'glass');      // rear screen

    // Lights, sitting just proud of the panels so they never z-fight.
    function lamp(x0, x1, y, z0, z1, m) {
      var i = VX.length;
      VX.push([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]);
      quad([i, i + 1, i + 2, i + 3], m);
    }
    lamp(-18, -8, -47.0,  8, 12, 'tail');
    lamp(  8,  18, -47.0,  8, 12, 'tail');
    lamp(-12,  -4,  48.4,  6,  9, 'head');
    lamp(  4,  12,  48.4,  6,  9, 'head');
  })();

  var MAT = {
    body:      [206,  26,  34],
    hood:      [228,  38,  42],
    deck:      [186,  20,  30],
    roof:      [214,  30,  38],
    tailpanel: [120,  14,  22],
    under:     [ 28,  10,  16],
    glass:     [ 16,  16,  34],
    tyre:      [ 16,  15,  20],
    rim:       [130, 140, 162]
  };
  var EMISSIVE = { tail: '#ff4436', head: '#eaffff' };

  // Light from above, ahead and to the left.
  var LX = -0.40, LY = 0.35, LZ = 0.85;
  (function () { var n = Math.hypot(LX, LY, LZ); LX /= n; LY /= n; LZ /= n; })();

  // Pooled so a frame allocates nothing.
  var wx = [], wy = [], wz = [], px = [], py = [], pv = [], pz = [];
  var poly = [], polyN = 0;
  function emit(vlist, mat, n) {
    var e = poly[polyN];
    if (!e) e = poly[polyN] = { v: null, m: '', d: 0 };
    // These are pooled across frames, so anything a wheel left behind last
    // frame has to be cleared or a body panel inherits it.
    e.v = vlist; e.m = mat; e.d = n; e.src = null; e.nd = undefined;
    polyN++;
  }

  function shade(rgb, nd) {
    var k = 0.32 + 0.68 * nd;
    return 'rgb(' + ((rgb[0] * k) | 0) + ',' + ((rgb[1] * k) | 0) + ',' + ((rgb[2] * k) | 0) + ')';
  }

  var wheelBuf = [];
  function drawCar(ctx, view, car) {
    var i, j, f, n;
    var b = car.bodyYaw, cb = Math.cos(b), sb = Math.sin(b);
    var lean = Math.min(1, Math.abs(car.slip) / SLIP_AT_LIMIT);

    // Ground glow and shadow first, flat on the tarmac.
    var g = DR.Road.project(car.x, car.y, view);
    if (!g.vis) return;
    var gs = g.sc / DR.Road.SC_CAR;
    ctx.save();
    ctx.translate(g.x, g.y);
    if (!glowGrad) {
      glowGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 104);
      glowGrad.addColorStop(0.00, 'rgba(255,74,206,0.40)');
      glowGrad.addColorStop(0.45, 'rgba(140,60,255,0.15)');
      glowGrad.addColorStop(1.00, 'rgba(0,0,0,0)');
    }
    ctx.scale(gs, gs);
    ctx.globalAlpha = 0.6 + lean * 0.4;
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-104, -104, 208, 208);
    ctx.globalAlpha = 1;
    ctx.rotate(car.bodyYaw - view.camAngle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 52, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    drawBoostFlame(ctx, view.boost || 0);
    ctx.restore();

    // --- every vertex into the world, then onto the screen ---
    for (i = 0; i < VX.length; i++) {
      var L = VX[i];
      wx[i] = car.x + L[0] * cb + L[1] * sb;
      wy[i] = car.y - L[0] * sb + L[1] * cb;
      wz[i] = L[2];
      var q = DR.Road.project3(wx[i], wy[i], wz[i], view, {});
      px[i] = q.x; py[i] = q.y; pv[i] = q.vis; pz[i] = q.rz;
    }

    polyN = 0;
    for (i = 0; i < FACES.length; i++) {
      f = FACES[i];
      var v = f.v, ok = true, depth = 0;
      for (j = 0; j < v.length; j++) { if (!pv[v[j]]) { ok = false; break; } depth += pz[v[j]]; }
      if (!ok) continue;
      emit(v, f.m, depth / v.length);
    }

    // --- wheels, built fresh because the fronts steer ---
    var steerAng = -Math.max(-1, Math.min(1, car.slip / SLIP_AT_LIMIT)) * 0.42;
    buildWheel(view, car, cb, sb,  29,  31, 11, steerAng);
    buildWheel(view, car, cb, sb, -29,  31, 11, steerAng);
    buildWheel(view, car, cb, sb,  30, -29, 12, 0);
    buildWheel(view, car, cb, sb, -30, -29, 12, 0);

    // --- furthest first, so nearer panels cover the ones behind ---
    var order = [];
    for (i = 0; i < polyN; i++) order.push(i);
    order.sort(function (a, c) { return poly[c].d - poly[a].d; });

    for (i = 0; i < order.length; i++) {
      var e = poly[order[i]];
      var pts = e.v, src = e.src || null;
      ctx.beginPath();
      if (src) {
        ctx.moveTo(src[0], src[1]);
        for (j = 2; j < src.length; j += 2) ctx.lineTo(src[j], src[j + 1]);
      } else {
        ctx.moveTo(px[pts[0]], py[pts[0]]);
        for (j = 1; j < pts.length; j++) ctx.lineTo(px[pts[j]], py[pts[j]]);
      }
      ctx.closePath();

      if (EMISSIVE[e.m]) {
        ctx.fillStyle = EMISSIVE[e.m];
        ctx.shadowColor = EMISSIVE[e.m];
        ctx.shadowBlur = e.m === 'tail' ? 16 : 9;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = shade(MAT[e.m] || MAT.body, e.nd !== undefined ? e.nd : faceLight(e, pts));
        ctx.fill();
        if (e.m === 'glass') {
          ctx.strokeStyle = 'rgba(150,210,255,0.22)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  // How square-on to the light a face sits, from its world-space normal.
  function faceLight(e, pts) {
    var a = pts[0], b2 = pts[1], c = pts[2];
    var ux = wx[b2] - wx[a], uy = wy[b2] - wy[a], uz = wz[b2] - wz[a];
    var vx2 = wx[c] - wx[a], vy2 = wy[c] - wy[a], vz2 = wz[c] - wz[a];
    var nx = uy * vz2 - uz * vy2, ny = uz * vx2 - ux * vz2, nz = ux * vy2 - uy * vx2;
    var len = Math.hypot(nx, ny, nz) || 1;
    var d = Math.abs((nx * LX + ny * LY + nz * LZ) / len);
    return d;
  }

  // A wheel is a short cylinder: the face you can see, plus the tread round it.
  var WN = 9;
  function buildWheel(view, car, cb, sb, ox, oy, r, steerAng) {
    var cz = r;                                  // a wheel touches the tarmac
    var halfW = 6, k, a;
    var cs = Math.cos(steerAng), sn = Math.sin(steerAng);
    var outX = [], outY = [], inX = [], inY = [], depth = 0, ok = true;
    var sideSign = ox > 0 ? 1 : -1;

    for (k = 0; k < WN; k++) {
      a = k / WN * Math.PI * 2;
      var ly = r * Math.sin(a), lz = cz + r * Math.cos(a);
      for (var e = 0; e < 2; e++) {
        var lxw = (e === 0 ? halfW : -halfW) * sideSign;
        // steering swings the wheel about its own upright
        var rx = lxw * cs - ly * sn, ry = lxw * sn + ly * cs;
        var LXc = ox + rx, LYc = oy + ry;
        var WXp = car.x + LXc * cb + LYc * sb;
        var WYp = car.y - LXc * sb + LYc * cb;
        var q = DR.Road.project3(WXp, WYp, lz, view, {});
        if (!q.vis) { ok = false; break; }
        if (e === 0) { outX.push(q.x); outY.push(q.y); depth += q.rz; }
        else { inX.push(q.x); inY.push(q.y); }
      }
      if (!ok) return;
    }
    depth /= WN;

    // tread
    for (k = 0; k < WN; k++) {
      var n2 = (k + 1) % WN;
      var e2 = poly[polyN];
      if (!e2) e2 = poly[polyN] = { v: null, m: '', d: 0 };
      e2.v = null; e2.m = 'tyre'; e2.d = depth - 1;
      e2.src = [outX[k], outY[k], outX[n2], outY[n2], inX[n2], inY[n2], inX[k], inY[k]];
      e2.nd = 0.30;
      polyN++;
    }
    // the face of the wheel
    var e3 = poly[polyN];
    if (!e3) e3 = poly[polyN] = { v: null, m: '', d: 0 };
    var src = [];
    for (k = 0; k < WN; k++) { src.push(outX[k], outY[k]); }
    e3.v = null; e3.m = 'rim'; e3.d = depth; e3.src = src; e3.nd = 0.42;
    polyN++;
  }

  // Exhaust flare while boosting.
  function drawBoostFlame(ctx, k) {
    if (k <= 0.01) return;
    var len = 34 + 46 * k;
    for (var i = 0; i < 2; i++) {
      var x = i === 0 ? -5 : 5;
      var g = ctx.createLinearGradient(0, 44, 0, 44 + len);
      g.addColorStop(0.00, 'rgba(255,246,210,' + (0.9 * k) + ')');
      g.addColorStop(0.35, 'rgba(255,150,60,' + (0.55 * k) + ')');
      g.addColorStop(1.00, 'rgba(255,60,120,0)');
      ctx.beginPath();
      ctx.moveTo(x - 7, 44);
      ctx.lineTo(x + 7, 44);
      ctx.lineTo(x + 2.5, 44 + len);
      ctx.lineTo(x - 2.5, 44 + len);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  DR.Car = Car;
})(window.DR = window.DR || {});
