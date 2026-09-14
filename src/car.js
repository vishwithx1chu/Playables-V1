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
     MAX_DRIFT_DEG  how far round the car slews. With TURN_GAIN, this sets the
                    tightest circle the car can possibly carve.
     TURN_GAIN      how hard a given slip angle rotates the car. Raise it and
                    every corner gets easier; lower it and they all get harder.
     BUILD_TAU      seconds to lean into a drift.
     DECAY_TAU      seconds to straighten after you let go. The weight dial.
     REVERSE_TAU    seconds to flick from one drift straight into the other —
                    this is the number that decides how hard chicanes feel.
     ====================================================================== */
  var MAX_DRIFT_DEG = 38;
  var TURN_GAIN     = 1.74;
  var BUILD_TAU     = 0.34;
  var DECAY_TAU     = 0.72;
  var REVERSE_TAU   = 0.42;
  /* ====================================================================== */

  var MAX_DRIFT = MAX_DRIFT_DEG * Math.PI / 180;
  var CAR_W = 46;
  var CAR_L = 84;
  var VISUAL_YAW = 1.25;

  var bodyGrad = null, glowGrad = null;

  var Car = {
    W: CAR_W,
    L: CAR_L,
    MAX_DRIFT: MAX_DRIFT,
    x: 0, y: 0,      // world position
    h: 0,            // heading: the direction the car is travelling
    drift: 0,        // slip angle; the body points this far off the heading
    yawRate: 0,      // radians per second the car is rotating
    roadS: 0,        // how far along the track
    dev: 0,          // signed distance from the centreline, + is right

    reset: function () {
      this.x = 0; this.y = 0; this.h = 0;
      this.drift = 0; this.yawRate = 0;
      this.roadS = 0; this.dev = 0;
    },

    update: function (dt, steer, speed) {
      var target = steer * MAX_DRIFT;

      var tau;
      if (steer === 0) tau = DECAY_TAU;
      else if (this.drift * steer < 0) tau = REVERSE_TAU;
      else tau = BUILD_TAU;

      this.drift += (target - this.drift) * (1 - Math.exp(-dt / tau));

      // Slip angle turns the car. This one line is what makes a real corner
      // — and a full 180 — possible at all.
      this.yawRate = TURN_GAIN * Math.sin(this.drift);
      this.h += this.yawRate * dt;

      this.x += Math.sin(this.h) * speed * dt;
      this.y += Math.cos(this.h) * speed * dt;
    },

    // The tightest circle the car can carve. Any corner tighter than this is
    // physically undriveable, so the track must never contain one.
    minRadius: function (speed) {
      return speed / (TURN_GAIN * Math.sin(MAX_DRIFT));
    },

    // How much road the car takes up: sideways-on, it needs more of it.
    halfWidth: function () {
      return Math.abs(Math.cos(this.drift)) * CAR_W * 0.5 +
             Math.abs(Math.sin(this.drift)) * CAR_L * 0.40;
    },

    // A point on the car's body, in world terms — used to plant smoke and
    // rubber under the actual wheels.
    bodyPoint: function (lx, lyForward, out) {
      var bh = this.h + this.drift * VISUAL_YAW;
      var sn = Math.sin(bh), cs = Math.cos(bh);
      out.x = this.x + lx * cs + lyForward * sn;
      out.y = this.y - lx * sn + lyForward * cs;
      return out;
    },

    draw: function (ctx, view) {
      var p = DR.Road.project(this.x, this.y, view);
      if (!p.vis) return;
      var lean = Math.abs(this.drift) / MAX_DRIFT;
      var steer = this.drift / MAX_DRIFT;

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

      ctx.rotate(this.h + this.drift * VISUAL_YAW - view.camAngle);

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
      [-fx, fy, steer * 0.42], [fx, fy, steer * 0.42],
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
  var RIDE = 15;
  var FOOT = [
    [0, -46], [16, -41], [25, -20], [27, 13], [23, 41],
    [-23, 41], [-27, 13], [-25, -20], [-16, -41]
  ];
  var TOP = FOOT.map(function (q) { return [q[0] * 0.80, q[1] * 0.88 - RIDE]; });

  function path(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function drawBody(ctx) {
    var i;

    // Sills: the flanks between ground and roof.
    ctx.beginPath();
    for (i = 0; i < FOOT.length; i++) {
      var a = FOOT[i], b = FOOT[(i + 1) % FOOT.length];
      var c = TOP[(i + 1) % TOP.length], d = TOP[i];
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
      ctx.closePath();
    }
    ctx.fillStyle = '#241041';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(140,90,220,0.5)';
    ctx.stroke();

    // Upper surface.
    if (!bodyGrad) {
      bodyGrad = ctx.createLinearGradient(0, -46, 0, 41);
      bodyGrad.addColorStop(0.00, '#63f4ff');
      bodyGrad.addColorStop(0.38, '#2f7ce8');
      bodyGrad.addColorStop(0.78, '#8a34d6');
      bodyGrad.addColorStop(1.00, '#d63aa6');
    }
    path(ctx, TOP);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(200,252,255,0.85)';
    ctx.stroke();

    // A crease down the middle so the roof is not a flat slab.
    ctx.beginPath();
    ctx.moveTo(0, -40 - RIDE); ctx.lineTo(0, 34 - RIDE);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();

    // Glass.
    ctx.beginPath();
    ctx.moveTo(-11, -22 - RIDE); ctx.lineTo(11, -22 - RIDE);
    ctx.lineTo(14, 8 - RIDE); ctx.lineTo(-14, 8 - RIDE);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,5,18,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(130,225,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();                                   // sheen across the glass
    ctx.moveTo(-10, -20 - RIDE); ctx.lineTo(2, -20 - RIDE); ctx.lineTo(-6, -8 - RIDE);
    ctx.closePath();
    ctx.fillStyle = 'rgba(160,235,255,0.13)';
    ctx.fill();

    // Rear wing, standing above the deck.
    var wy = 36 - RIDE - 7;
    ctx.fillStyle = '#1b1030';
    ctx.fillRect(-22, wy + 5, 4, 9);
    ctx.fillRect(18, wy + 5, 4, 9);
    ctx.fillStyle = '#2a1350';
    ctx.fillRect(-27, wy, 54, 6);
    ctx.fillStyle = 'rgba(99,244,255,0.5)';
    ctx.fillRect(-27, wy, 54, 2);

    // Tail lights.
    ctx.shadowColor = '#ff2fa8'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff5cc0';
    ctx.fillRect(-19, 30 - RIDE, 12, 5);
    ctx.fillRect(7, 30 - RIDE, 12, 5);
    ctx.shadowBlur = 0;

    // Headlights.
    ctx.shadowColor = '#bff4ff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#eaffff';
    ctx.fillRect(-14, -38 - RIDE, 9, 4);
    ctx.fillRect(5, -38 - RIDE, 9, 4);
    ctx.shadowBlur = 0;
  }

  DR.Car = Car;
})(window.DR = window.DR || {});
