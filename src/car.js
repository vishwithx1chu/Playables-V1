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
  var SLIP_AT_LIMIT   = 58 * Math.PI / 180;
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

    draw: function (ctx, view) {
      var p = DR.Road.project(this.x, this.y, view);
      if (!p.vis) return;
      var lean = Math.min(1, Math.abs(this.slip) / SLIP_AT_LIMIT);
      // Opposite lock: in a drift the front wheels point AWAY from the turn,
      // which is one of the most recognisable things about the real thing.
      var steer = -Math.max(-1, Math.min(1, this.slip / SLIP_AT_LIMIT));

      ctx.save();
      ctx.translate(p.x, p.y);

      // Neon spill on the tarmac underneath, brighter the harder it slides.
      if (!glowGrad) {
        glowGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 104);
        glowGrad.addColorStop(0.00, 'rgba(255,74,206,0.44)');
        glowGrad.addColorStop(0.45, 'rgba(140,60,255,0.17)');
        glowGrad.addColorStop(1.00, 'rgba(0,0,0,0)');
      }
      ctx.globalAlpha = 0.65 + lean * 0.35;
      ctx.fillStyle = glowGrad;
      ctx.fillRect(-104, -104, 208, 208);
      ctx.globalAlpha = 1;

      ctx.rotate(this.bodyYaw - view.camAngle);

      // Headlight wash thrown up the road.
      ctx.beginPath();
      ctx.moveTo(-18, -44); ctx.lineTo(18, -44);
      ctx.lineTo(110, -360); ctx.lineTo(-110, -360);
      ctx.closePath();
      ctx.fillStyle = 'rgba(150,240,255,0.05)';
      ctx.fill();

      // Shadow on the ground.
      ctx.beginPath();
      ctx.ellipse(0, 6, 34, 50, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fill();

      drawBoostFlame(ctx, view.boost || 0);
      drawWheels(ctx, steer);
      drawBody(ctx);

      ctx.restore();
    }
  };

  // Four wheels sitting on the tarmac. The fronts turn with the drift, which
  // is a small thing that does a lot of work at this camera angle.
  function drawWheels(ctx, steer) {
    var fx = 27, rx = 29, fy = -25, ry = 27;
    var wheels = [
      [-fx, fy, steer * 0.55], [fx, fy, steer * 0.55],
      [-rx, ry, 0], [rx, ry, 0]
    ];
    for (var i = 0; i < 4; i++) {
      var w = wheels[i];
      ctx.save();
      ctx.translate(w[0], w[1]);
      ctx.rotate(w[2]);
      ctx.fillStyle = '#08060f';
      ctx.fillRect(-6, -13, 12, 26);
      ctx.fillStyle = 'rgba(120,160,200,0.30)';   // rim catching the light
      ctx.fillRect(-6, -4, 12, 3);
      ctx.fillStyle = 'rgba(255,74,206,0.22)';    // neon bleeding onto rubber
      ctx.fillRect(-6, 10, 12, 3);
      ctx.restore();
    }
  }

  // The body is drawn as a footprint on the ground plus the same shape lifted
  // by RIDE, with the gap between them filled in. That gap is what reads as
  // the car having height, which matters now the camera sits low.
  var RIDE = 26;
  var FOOT = [
    [0, -50], [13, -46], [21, -31], [23, -9], [28, 10], [28, 31], [23, 45],
    [-23, 45], [-28, 31], [-28, 10], [-23, -9], [-21, -31], [-13, -46]
  ];
  var TOP = FOOT.map(function (q) { return [q[0] * 0.80, q[1] * 0.90 - RIDE]; });

  function path(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawBody(ctx) {
    var i, n = FOOT.length;

    // Flanks. At this camera height the rear one is a big part of what you
    // see, so it gets its own treatment below.
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var a = FOOT[i], b = FOOT[(i + 1) % n];
      var c = TOP[(i + 1) % n], d = TOP[i];
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
      ctx.closePath();
    }
    ctx.fillStyle = '#7d0f18';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,140,140,0.28)';
    ctx.stroke();

    // The rear face, square on to the camera.
    ctx.beginPath();
    ctx.moveTo(FOOT[6][0], FOOT[6][1]); ctx.lineTo(FOOT[7][0], FOOT[7][1]);
    ctx.lineTo(TOP[7][0], TOP[7][1]);   ctx.lineTo(TOP[6][0], TOP[6][1]);
    ctx.closePath();
    ctx.fillStyle = '#9c1420';
    ctx.fill();

    // Upper body.
    if (!bodyGrad) {
      bodyGrad = ctx.createLinearGradient(0, -50, 0, 45);
      bodyGrad.addColorStop(0.00, '#ff6a5c');
      bodyGrad.addColorStop(0.30, '#f0231f');
      bodyGrad.addColorStop(0.72, '#c9101c');
      bodyGrad.addColorStop(1.00, '#8e0c18');
    }
    path(ctx, TOP);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,190,180,0.75)';
    ctx.stroke();

    // Highlight down the shoulder line.
    ctx.beginPath();
    ctx.moveTo(-14, -30 - RIDE); ctx.lineTo(-16, 24 - RIDE);
    ctx.moveTo(14, -30 - RIDE);  ctx.lineTo(16, 24 - RIDE);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255,225,215,0.28)';
    ctx.stroke();

    // Side intakes, which is most of what says "mid-engine".
    ctx.fillStyle = 'rgba(20,6,10,0.75)';
    ctx.fillRect(-21, 2 - RIDE, 5, 14);
    ctx.fillRect(16, 2 - RIDE, 5, 14);

    // Glass.
    ctx.beginPath();
    ctx.moveTo(-10, -24 - RIDE); ctx.lineTo(10, -24 - RIDE);
    ctx.lineTo(14, 4 - RIDE); ctx.lineTo(-14, 4 - RIDE);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,8,20,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,220,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, -22 - RIDE); ctx.lineTo(2, -22 - RIDE); ctx.lineTo(-5, -10 - RIDE);
    ctx.closePath();
    ctx.fillStyle = 'rgba(200,235,255,0.16)';
    ctx.fill();

    // Engine deck slats behind the cabin.
    ctx.strokeStyle = 'rgba(30,8,12,0.7)';
    ctx.lineWidth = 1.6;
    for (i = 0; i < 4; i++) {
      var yy = 12 - RIDE + i * 5;
      ctx.beginPath(); ctx.moveTo(-13, yy); ctx.lineTo(13, yy); ctx.stroke();
    }

    // Ducktail spoiler.
    ctx.fillStyle = '#5e0b13';
    ctx.fillRect(-21, 34 - RIDE, 42, 5);
    ctx.fillStyle = 'rgba(255,170,160,0.35)';
    ctx.fillRect(-21, 34 - RIDE, 42, 1.6);

    // Twin round tail lights, on the rear face.
    var ty = (FOOT[6][1] + TOP[6][1]) * 0.5;
    ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff5638';
    for (i = 0; i < 4; i++) {
      var tx = [-18, -9.5, 9.5, 18][i];
      ctx.beginPath(); ctx.arc(tx, ty, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Quad exhausts.
    ctx.fillStyle = '#2a2028';
    ctx.fillRect(-8, 42 - RIDE * 0.4, 6, 4);
    ctx.fillRect(2, 42 - RIDE * 0.4, 6, 4);

    // Headlights.
    ctx.shadowColor = '#dff4ff'; ctx.shadowBlur = 9;
    ctx.fillStyle = '#f2ffff';
    ctx.fillRect(-15, -40 - RIDE, 8, 3.5);
    ctx.fillRect(7, -40 - RIDE, 8, 3.5);
    ctx.shadowBlur = 0;
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
