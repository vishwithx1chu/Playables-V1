/* car.js — the drift. This is the whole game, so the numbers that decide how
   it feels are at the very top, on their own, easy to change. */

(function (DR) {
  'use strict';

  /* ====================== FEEL TUNING — CHANGE THESE ======================
     MAX_DRIFT_DEG  how far the car can slew round. Bigger = slides harder.
     BUILD_TAU      seconds to lean into a drift. Bigger = heavier to start.
     DECAY_TAU      seconds to straighten after you let go. Bigger = more
                    momentum; this is the number that makes the car feel like
                    it weighs something instead of snapping back.
     REVERSE_TAU    seconds to swap from one drift straight into the other.
     ====================================================================== */
  var MAX_DRIFT_DEG = 38;
  var BUILD_TAU     = 0.34;
  var DECAY_TAU     = 0.72;
  var REVERSE_TAU   = 0.42;
  /* ====================================================================== */

  var MAX_DRIFT = MAX_DRIFT_DEG * Math.PI / 180;
  var CAR_W = 46;
  var CAR_L = 84;
  var VISUAL_YAW = 1.15;   // exaggerate the angle slightly so it reads at speed

  var bodyGrad = null, glowGrad = null;

  var Car = {
    W: CAR_W,
    L: CAR_L,
    x: 0,        // world position across the road
    s: 0,        // distance travelled
    drift: 0,    // drift angle in radians, + = sliding right
    lat: 0,      // current sideways speed, units per second

    reset: function () {
      this.x = 0;
      this.s = 0;
      this.drift = 0;
      this.lat = 0;
    },

    update: function (dt, steer, speed) {
      var target = steer * MAX_DRIFT;

      // Three different time constants are what give the car weight: leaning
      // in, letting go, and flicking the other way all take different effort.
      var tau;
      if (steer === 0) tau = DECAY_TAU;
      else if (this.drift * steer < 0) tau = REVERSE_TAU;
      else tau = BUILD_TAU;

      this.drift += (target - this.drift) * (1 - Math.exp(-dt / tau));

      // Slide sideways in proportion to how far round the car is slewed.
      this.lat = Math.sin(this.drift) * speed;
      this.x += this.lat * dt;
      this.s += speed * dt;
    },

    // A car sideways-on takes up more road than one pointing straight ahead.
    halfWidth: function () {
      return Math.abs(Math.cos(this.drift)) * CAR_W * 0.5 +
             Math.abs(Math.sin(this.drift)) * CAR_L * 0.40;
    },

    // Where a given corner of the car is in world terms, used for smoke and
    // skid marks so they come off the actual wheels.
    wheelWorld: function (lx, ly, out) {
      var c = Math.cos(this.drift * VISUAL_YAW);
      var sn = Math.sin(this.drift * VISUAL_YAW);
      out.x = this.x + (lx * c - ly * sn);
      out.s = this.s - (lx * sn + ly * c);
      return out;
    },

    draw: function (ctx, view) {
      var p = DR.Road.project(this.s, this.x, view);
      var x = p.x;
      var y = p.y;
      var yaw = this.drift * VISUAL_YAW;
      var lean = Math.abs(this.drift) / MAX_DRIFT;

      ctx.save();
      ctx.translate(x, y);

      // Ground glow under the car, brighter the harder it is sliding.
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

      ctx.rotate(yaw);

      // Headlight wash ahead of the car.
      ctx.beginPath();
      ctx.moveTo(-16, -40);
      ctx.lineTo(16, -40);
      ctx.lineTo(96, -330);
      ctx.lineTo(-96, -330);
      ctx.closePath();
      ctx.fillStyle = 'rgba(150,240,255,0.055)';
      ctx.fill();

      // Body.
      if (!bodyGrad) {
        bodyGrad = ctx.createLinearGradient(0, -CAR_L * 0.5, 0, CAR_L * 0.5);
        bodyGrad.addColorStop(0.00, '#4ef2ff');
        bodyGrad.addColorStop(0.45, '#2f7ce8');
        bodyGrad.addColorStop(1.00, '#c032d8');
      }
      ctx.beginPath();
      ctx.moveTo(0, -42);
      ctx.lineTo(14, -38);
      ctx.lineTo(23, -18);
      ctx.lineTo(23, 30);
      ctx.lineTo(18, 42);
      ctx.lineTo(-18, 42);
      ctx.lineTo(-23, 30);
      ctx.lineTo(-23, -18);
      ctx.lineTo(-14, -38);
      ctx.closePath();
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(190,250,255,0.85)';
      ctx.stroke();

      // Rear wing.
      ctx.fillStyle = '#1b1030';
      ctx.fillRect(-26, 36, 52, 6);
      ctx.fillStyle = 'rgba(78,242,255,0.55)';
      ctx.fillRect(-26, 36, 52, 2);

      // Cockpit.
      ctx.beginPath();
      ctx.moveTo(-11, -14);
      ctx.lineTo(11, -14);
      ctx.lineTo(14, 14);
      ctx.lineTo(-14, 14);
      ctx.closePath();
      ctx.fillStyle = 'rgba(8,6,20,0.92)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(120,220,255,0.45)';
      ctx.stroke();

      // Tail lights.
      ctx.shadowColor = '#ff2fa8';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ff5cc0';
      ctx.fillRect(-17, 33, 11, 5);
      ctx.fillRect(6, 33, 11, 5);
      ctx.shadowBlur = 0;

      // Head lights.
      ctx.fillStyle = '#d9fbff';
      ctx.fillRect(-13, -41, 8, 3);
      ctx.fillRect(5, -41, 8, 3);

      ctx.restore();
    }
  };

  DR.Car = Car;
})(window.DR = window.DR || {});
