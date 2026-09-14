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

      ctx.save();
      ctx.translate(p.x, p.y);

      if (!glowGrad) {
        glowGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 96);
        glowGrad.addColorStop(0.00, 'rgba(255,74,206,0.42)');
        glowGrad.addColorStop(0.45, 'rgba(140,60,255,0.16)');
        glowGrad.addColorStop(1.00, 'rgba(0,0,0,0)');
      }
      ctx.globalAlpha = 0.65 + lean * 0.35;
      ctx.fillStyle = glowGrad;
      ctx.fillRect(-96, -96, 192, 192);
      ctx.globalAlpha = 1;

      // On screen the body is turned by however far it is off the camera's
      // bearing, which is heading plus slip.
      ctx.rotate(this.h + this.drift * VISUAL_YAW - view.camAngle);

      ctx.beginPath();
      ctx.moveTo(-16, -40); ctx.lineTo(16, -40);
      ctx.lineTo(96, -330); ctx.lineTo(-96, -330);
      ctx.closePath();
      ctx.fillStyle = 'rgba(150,240,255,0.055)';
      ctx.fill();

      if (!bodyGrad) {
        bodyGrad = ctx.createLinearGradient(0, -CAR_L * 0.5, 0, CAR_L * 0.5);
        bodyGrad.addColorStop(0.00, '#4ef2ff');
        bodyGrad.addColorStop(0.45, '#2f7ce8');
        bodyGrad.addColorStop(1.00, '#c032d8');
      }
      ctx.beginPath();
      ctx.moveTo(0, -42); ctx.lineTo(14, -38); ctx.lineTo(23, -18);
      ctx.lineTo(23, 30); ctx.lineTo(18, 42); ctx.lineTo(-18, 42);
      ctx.lineTo(-23, 30); ctx.lineTo(-23, -18); ctx.lineTo(-14, -38);
      ctx.closePath();
      ctx.fillStyle = bodyGrad; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(190,250,255,0.85)'; ctx.stroke();

      ctx.fillStyle = '#1b1030'; ctx.fillRect(-26, 36, 52, 6);
      ctx.fillStyle = 'rgba(78,242,255,0.55)'; ctx.fillRect(-26, 36, 52, 2);

      ctx.beginPath();
      ctx.moveTo(-11, -14); ctx.lineTo(11, -14);
      ctx.lineTo(14, 14); ctx.lineTo(-14, 14);
      ctx.closePath();
      ctx.fillStyle = 'rgba(8,6,20,0.92)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,220,255,0.45)'; ctx.stroke();

      ctx.shadowColor = '#ff2fa8'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#ff5cc0';
      ctx.fillRect(-17, 33, 11, 5); ctx.fillRect(6, 33, 11, 5);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#d9fbff';
      ctx.fillRect(-13, -41, 8, 3); ctx.fillRect(5, -41, 8, 3);

      ctx.restore();
    }
  };

  DR.Car = Car;
})(window.DR = window.DR || {});
