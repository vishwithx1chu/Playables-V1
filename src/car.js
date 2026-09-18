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
  /* The numbers below this line are the STOCK values — Nightrunner, the
     starter car, at no upgrades. Every other car in the garage is these five
     numbers times a multiplier (see cars.js), so the physics never has two
     sources of truth: one set of dials, scaled per car and per upgrade tier. */
  var MIN_RADIUS_STOCK      = 504;
  var SLIP_AT_LIMIT_STOCK   = 52 * Math.PI / 180;
  var BUILD_TAU_STOCK       = 0.34;
  var DECAY_TAU_STOCK       = 0.55;
  var REVERSE_TAU_STOCK     = 0.42;
  var GRIP_TAU        = 0.09;   // not varied per car yet — see setStats below

  var MIN_RADIUS      = MIN_RADIUS_STOCK;
  var SLIP_AT_LIMIT   = SLIP_AT_LIMIT_STOCK;
  var BUILD_TAU       = BUILD_TAU_STOCK;
  var DECAY_TAU       = DECAY_TAU_STOCK;
  var REVERSE_TAU     = REVERSE_TAU_STOCK;
  /* ====================================================================== */

  // Applied once when a car is selected (cars.js is the only caller). Every
  // multiplier defaults to 1, so calling this with {} reproduces the stock
  // car exactly — which is what lets Nightrunner be pixel-for-pixel what the
  // game already was before the garage existed.
  function setStats(m) {
    m = m || {};
    MIN_RADIUS    = MIN_RADIUS_STOCK    * (m.gripMult || 1);
    SLIP_AT_LIMIT = SLIP_AT_LIMIT_STOCK * (m.slipMult || 1);
    BUILD_TAU     = BUILD_TAU_STOCK     * (m.tauMult  || 1);
    DECAY_TAU     = DECAY_TAU_STOCK     * (m.tauMult  || 1);
    REVERSE_TAU   = REVERSE_TAU_STOCK   * (m.tauMult  || 1);
    Car.SLIP_AT_LIMIT = SLIP_AT_LIMIT;
  }

  var CAR_W_STOCK = 56, CAR_L_STOCK = 96;
  var CAR_W = CAR_W_STOCK;
  var CAR_L = CAR_L_STOCK;

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
    roll: 0,         // how far the body is rocked over — a crash, not a bank
    rollV: 0,

    reset: function () {
      this.x = 0; this.y = 0; this.h = 0;
      this.bodyYaw = 0; this.cmdSlip = 0; this.gripSlip = 0; this.slip = 0; this.yawRate = 0;
      this.roll = 0; this.rollV = 0;
      this.roadS = 0; this.dev = 0;
    },

    // `straighten` scales how fast the body squares itself up when you are
    // not holding a side. 1 is normal; boost passes more than 1.
    update: function (dt, steer, speed, straighten) {
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
      // Only the letting-go case is spedable. Holding a side is you asking
      // for the drift, and nothing should take it away from you.
      if (steer === 0) tau = DECAY_TAU / (straighten > 0 ? straighten : 1);
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

      // The body rocks on its springs after a knock and settles in about half
      // a second — a damped spring, so it overshoots once instead of snapping
      // back, which is what makes an impact look like it had weight.
      this.rollV += (-ROLL_K * this.roll - ROLL_C * this.rollV) * dt;
      this.roll += this.rollV * dt;
      if (this.roll > 0.22) { this.roll = 0.22; this.rollV = 0; }
      if (this.roll < -0.22) { this.roll = -0.22; this.rollV = 0; }
    },

    // A knock from the side: the barrier hitting the car, seen on the car.
    jolt: function (amount) {
      this.rollV += amount;
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

  /* Three cars, one topology. Every archetype is built by the same sequence
     of rings, bands and lamps — same face count, same depth-sort and shading
     code below untouched — but each ring's own y/half-width/height is scaled
     by FOUR independent numbers (length, width, height, and an extra boost
     just for the greenhouse's height), rather than one uniform stretch. That
     is what lets "short with a tall cabin" and "long and low" both come out
     of the same builder instead of one shape squashed two different ways.

     SPORT is the multiplier {1,1,1,1} — every number below is exactly what
     the single hand-authored car used to be, so Sport is pixel-identical to
     the car this game shipped with before the garage existed. */
  var ARCHETYPES = {
    compact: { length: 0.80, width: 0.94, height: 1.05, cabin: 1.16,
               track: 0.90, wheelbase: 0.80, wheelR: 0.93 },
    sport:   { length: 1.00, width: 1.00, height: 1.00, cabin: 1.00,
               track: 1.00, wheelbase: 1.00, wheelR: 1.00 },
    muscle:  { length: 1.18, width: 1.12, height: 0.88, cabin: 0.90,
               track: 1.12, wheelbase: 1.18, wheelR: 1.06 }
  };

  // The lower body (nose to tail) and the greenhouse, as (y, half-width,
  // z-bottom, z-top) — the exact arguments the old fixed buildMesh() used to
  // pass to ring() by hand. Keeping them as data is what makes scaling them
  // per archetype possible.
  var BODY_RINGS  = [[ 48, 13,  4, 10], [ 34, 24,  3, 14], [ 14, 27,  3, 17],
                      [ -8, 27,  3, 17], [-30, 27,  4, 16], [-46, 22,  5, 13]];
  var CABIN_RINGS = [[ 13, 18, 17, 18], [ -4, 16, 17, 28],
                      [-19, 16, 17, 27], [-30, 18, 17, 19]];
  // [x0, x1, y, z0, z1] — the stock lamp positions, scaled the same way.
  var TAIL_LAMPS = [[-18, -8, -47.0, 8, 12], [8, 18, -47.0, 8, 12]];
  var HEAD_LAMPS = [[-12, -4, 48.4, 6, 9], [4, 12, 48.4, 6, 9]];

  function buildMesh(m) {
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
    function quad(i, mat) { FACES.push({ v: i, m: mat }); }

    var r = [], i;
    for (i = 0; i < BODY_RINGS.length; i++) {
      var b = BODY_RINGS[i];
      r.push(ring(b[0] * m.length, b[1] * m.width, b[2] * m.height, b[3] * m.height));
    }
    for (i = 0; i < 5; i++) band(r[i], r[i + 1], 'body', i < 2 ? 'hood' : 'deck', 'under');
    quad([r[0], r[0] + 1, r[0] + 2, r[0] + 3], 'body');           // nose
    quad([r[5] + 3, r[5] + 2, r[5] + 1, r[5]], 'tailpanel');      // tail

    // The greenhouse's height gets the cabin multiplier on TOP of the
    // general height one — that extra knob is what makes a tall, stubby
    // cabin look genuinely different from a long, raked one instead of the
    // whole car just being uniformly taller.
    var c = [];
    for (i = 0; i < CABIN_RINGS.length; i++) {
      var g = CABIN_RINGS[i];
      c.push(ring(g[0] * m.length, g[1] * m.width, g[2] * m.height, g[3] * m.height * m.cabin));
    }
    for (i = 0; i < 3; i++) band(c[i], c[i + 1], 'glass', 'roof', null);
    quad([c[0], c[0] + 1, c[0] + 2, c[0] + 3], 'glass');          // windscreen
    quad([c[3] + 3, c[3] + 2, c[3] + 1, c[3]], 'glass');          // rear screen

    // Lights, sitting just proud of the panels so they never z-fight.
    function lamp(spec, mat) {
      var x0 = spec[0] * m.width, x1 = spec[1] * m.width, y = spec[2] * m.length;
      var z0 = spec[3] * m.height, z1 = spec[4] * m.height;
      var i2 = VX.length;
      VX.push([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]);
      quad([i2, i2 + 1, i2 + 2, i2 + 3], mat);
    }
    for (i = 0; i < TAIL_LAMPS.length; i++) lamp(TAIL_LAMPS[i], 'tail');
    for (i = 0; i < HEAD_LAMPS.length; i++) lamp(HEAD_LAMPS[i], 'head');

    return { VX: VX, FACES: FACES };
  }

  var MESHES = {};
  for (var _arch in ARCHETYPES) MESHES[_arch] = buildMesh(ARCHETYPES[_arch]);

  var VX = MESHES.sport.VX, FACES = MESHES.sport.FACES;
  var WHEEL = { frontX: 29, frontY: 31, frontR: 11, rearX: 30, rearY: -29, rearR: 12 };
  var curArchetype = 'sport';

  // Swaps the mesh, the wheel mounts and the collision box to a named
  // archetype. Sport reproduces the stock numbers exactly.
  function setArchetype(name) {
    var m = ARCHETYPES[name] || ARCHETYPES.sport;
    curArchetype = ARCHETYPES[name] ? name : 'sport';
    var mesh = MESHES[curArchetype];
    VX = mesh.VX; FACES = mesh.FACES;
    WHEEL.frontX = 29 * m.track;      WHEEL.rearX = 30 * m.track;
    WHEEL.frontY = 31 * m.wheelbase;  WHEEL.rearY = -29 * m.wheelbase;
    WHEEL.frontR = 11 * m.wheelR;     WHEEL.rearR = 12 * m.wheelR;
    CAR_W = CAR_W_STOCK * m.width;
    CAR_L = CAR_L_STOCK * m.length;
    Car.W = CAR_W; Car.L = CAR_L;
  }

  // Every paint colour is one base (the body) plus a fixed offset — the exact
  // difference between the stock red's panels, so setPalette with the stock
  // red reproduces the stock car's colours exactly. under/glass/tyre/rim are
  // not paint and never change with the car's colour.
  var PAINT_DELTA = {
    body:      [  0,   0,   0],
    hood:      [ 22,  12,   8],
    deck:      [-20,  -6,  -4],
    roof:      [  8,   4,   4],
    tailpanel: [-86, -12, -12]
  };
  var STOCK_BODY = [206, 26, 34];

  function clamp255(n) { return n < 0 ? 0 : (n > 255 ? 255 : n | 0); }

  var MAT = {
    under:     [ 28,  10,  16],
    glass:     [ 16,  16,  34],
    tyre:      [ 16,  15,  20],
    rim:       [130, 140, 162]
  };
  for (var _pk in PAINT_DELTA) MAT[_pk] = STOCK_BODY.slice();

  // A car's whole paint job from one base colour — a hex string or an
  // [r,g,b] array. Called whenever the selected car or its colour changes.
  function setPalette(base) {
    var rgb = typeof base === 'string' ? hexToRgb(base) : base;
    for (var k in PAINT_DELTA) {
      var d = PAINT_DELTA[k];
      MAT[k] = [clamp255(rgb[0] + d[0]), clamp255(rgb[1] + d[1]), clamp255(rgb[2] + d[2])];
    }
  }
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    var n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

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
  var ROLL_K = 260;   // spring, about two and a half rocks a second
  var ROLL_C = 9;     // damping, so it settles rather than wobbles on

  /* A ghost is the same car in a different coat. Painting it with its own
     copy of the mesh would mean two models to keep in step, so instead the
     whole draw takes a `skin`: swap the palette, drop the alpha, and skip the
     neon glow and the exhaust flame, because a replay is not really there and
     should not light the road it is passing over. */
  var GHOST_MAT = {
    body:      [ 70, 190, 220],
    hood:      [ 96, 214, 240],
    deck:      [ 58, 168, 200],
    roof:      [ 84, 200, 230],
    tailpanel: [ 40, 120, 150],
    under:     [ 16,  50,  66],
    glass:     [ 20,  60,  84],
    tyre:      [ 24,  56,  70],
    rim:       [140, 200, 220]
  };
  var GHOST_EMISSIVE = { tail: '#9ff0ff', head: '#eaffff' };
  var GHOST_SKIN = { alpha: 0.42, mat: GHOST_MAT, emissive: GHOST_EMISSIVE, bare: true };

  function drawCar(ctx, view, car, skin) {
    var i, j, f, n;
    var b = car.bodyYaw, cb = Math.cos(b), sb = Math.sin(b);
    var lean = Math.min(1, Math.abs(car.slip) / SLIP_AT_LIMIT);
    var MATS = (skin && skin.mat) || MAT;
    var EMIT = (skin && skin.emissive) || EMISSIVE;

    // Ground glow and shadow first, flat on the tarmac.
    var g = DR.Road.project(car.x, car.y, view);
    if (!g.vis) return;
    var gs = g.sc / DR.Road.SC_CAR;
    if (skin && skin.alpha !== undefined) ctx.globalAlpha = skin.alpha;
    if (skin && skin.bare) { drawGhostShadow(ctx, g, gs, car, view); }
    else {
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
    }

    // --- every vertex into the world, then onto the screen ---
    var cr = Math.cos(car.roll), sr = Math.sin(car.roll);
    var lift = Math.abs(car.roll) * 26;   // keeps the low corner out of the tarmac
    for (i = 0; i < VX.length; i++) {
      var L = VX[i];
      // Rocked over about the car's own nose-to-tail axis before it goes
      // anywhere near the world, so the roll rides along with the heading.
      var rx = L[0] * cr - L[2] * sr;
      var rz2 = L[0] * sr + L[2] * cr + lift;
      wx[i] = car.x + rx * cb + L[1] * sb;
      wy[i] = car.y - rx * sb + L[1] * cb;
      wz[i] = rz2;
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
    buildWheel(view, car, cb, sb,  WHEEL.frontX, WHEEL.frontY, WHEEL.frontR, steerAng);
    buildWheel(view, car, cb, sb, -WHEEL.frontX, WHEEL.frontY, WHEEL.frontR, steerAng);
    buildWheel(view, car, cb, sb,  WHEEL.rearX,  WHEEL.rearY,  WHEEL.rearR, 0);
    buildWheel(view, car, cb, sb, -WHEEL.rearX,  WHEEL.rearY,  WHEEL.rearR, 0);

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

      if (EMIT[e.m]) {
        ctx.fillStyle = EMIT[e.m];
        ctx.shadowColor = EMIT[e.m];
        ctx.shadowBlur = e.m === 'tail' ? 16 : 9;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = shade(MATS[e.m] || MATS.body, e.nd !== undefined ? e.nd : faceLight(e, pts));
        ctx.fill();
        if (e.m === 'glass') {
          ctx.strokeStyle = 'rgba(150,210,255,0.22)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    if (skin && skin.alpha !== undefined) ctx.globalAlpha = 1;
  }

  // Just enough shadow that the ghost sits ON the road rather than hovering
  // over it — no neon, because it is not really there.
  function drawGhostShadow(ctx, g, gs, car, view) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.scale(gs, gs);
    ctx.rotate(car.bodyYaw - view.camAngle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 50, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fill();
    ctx.restore();
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

  // A ghost is not a Car — it has no physics — but it draws like one.
  Car.drawGhost = function (ctx, view, g) { drawCar(ctx, view, g, GHOST_SKIN); };
  // Same trick for the garage preview: a plain {x,y,bodyYaw,slip,roll} object,
  // drawn in the car's real colours rather than the ghost's.
  Car.drawStatic = function (ctx, view, obj) { drawCar(ctx, view, obj); };

  // The garage's interface onto all of the above. cars.js is the only
  // intended caller — it works out the numbers, this just applies them.
  Car.setArchetype = setArchetype;
  Car.setStats = setStats;
  Car.setPalette = setPalette;
  Car.archetype = function () { return curArchetype; };

  DR.Car = Car;
})(window.DR = window.DR || {});
