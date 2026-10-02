/* ghost.js — records a run, and plays it back as a car that is not there.

   A run is stored as a handful of numbers twelve times a second: where the car
   was, which way its body pointed, how sideways it was, and how far round the
   lap it had got. Two laps of Velocity Ring is about six hundred samples, or
   roughly three and a half thousand numbers — small enough that keeping a run
   in memory costs nothing worth thinking about.

   The arc length is recorded alongside the time for one reason: it is what
   lets the gap be quoted in SECONDS rather than in metres. "Two car lengths
   behind" means nothing on a circuit; "half a second down" means everything.
   Both cars pass through the same arc lengths, so the gap is simply the
   difference between when each of them reached the same point of road. */

(function (DR) {
  'use strict';

  var RATE = 1 / 12;          // seconds between samples

  function blank() {
    return { t: [], x: [], y: [], yaw: [], slip: [], s: [], n: 0, acc: 0, total: 0 };
  }

  var rec = null;

  function start() { rec = blank(); }

  function sample(dt, car, elapsed) {
    if (!rec) return;
    rec.acc += dt;
    if (rec.n === 0 || rec.acc >= RATE) {
      rec.acc = 0;
      rec.t.push(elapsed);
      rec.x.push(car.x);
      rec.y.push(car.y);
      rec.yaw.push(car.bodyYaw);
      rec.slip.push(car.slip);
      rec.s.push(car.roadS);
      rec.n++;
    }
    rec.total = elapsed;
  }

  function finish() {
    var r = rec;
    rec = null;
    return (r && r.n > 1) ? r : null;
  }

  // Index of the last sample at or before `v`, in a sorted array.
  function before(arr, n, v) {
    var lo = 0, hi = n - 1;
    if (v <= arr[0]) return 0;
    if (v >= arr[hi]) return hi;
    while (lo < hi - 1) {
      var mid = (lo + hi) >> 1;
      if (arr[mid] <= v) lo = mid; else hi = mid;
    }
    return lo;
  }

  // Shortest way round, so a car crossing from +179 to -179 degrees does not
  // spin the long way through the whole circle between two samples.
  function lerpAngle(a, b, f) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * f;
  }

  // Where the ghost was at a given moment. `roll` is always zero: a replay has
  // no springs to rock on, and inventing some would be a lie about a run that
  // already happened.
  var _at = { x: 0, y: 0, bodyYaw: 0, slip: 0, roll: 0, done: false };
  function at(g, time, out) {
    out = out || _at;
    if (!g || g.n < 2) { out.done = true; return out; }
    if (time >= g.t[g.n - 1]) {
      out.x = g.x[g.n - 1]; out.y = g.y[g.n - 1];
      out.bodyYaw = g.yaw[g.n - 1]; out.slip = g.slip[g.n - 1];
      out.roll = 0; out.done = true;
      return out;
    }
    var i = before(g.t, g.n, time);
    var j = Math.min(g.n - 1, i + 1);
    var span = g.t[j] - g.t[i];
    var f = span > 1e-6 ? (time - g.t[i]) / span : 0;
    out.x = g.x[i] + (g.x[j] - g.x[i]) * f;
    out.y = g.y[i] + (g.y[j] - g.y[i]) * f;
    out.bodyYaw = lerpAngle(g.yaw[i], g.yaw[j], f);
    out.slip = g.slip[i] + (g.slip[j] - g.slip[i]) * f;
    out.roll = 0;
    out.done = false;
    return out;
  }

  // When the ghost reached this point of the road. Returns null past the end
  // of the recording, which is what "they had already finished" looks like.
  function timeAt(g, s) {
    if (!g || g.n < 2) return null;
    if (s > g.s[g.n - 1]) return null;
    if (s <= g.s[0]) return g.t[0];
    var i = before(g.s, g.n, s);
    var j = Math.min(g.n - 1, i + 1);
    var span = g.s[j] - g.s[i];
    var f = span > 1e-6 ? (s - g.s[i]) / span : 0;
    return g.t[i] + (g.t[j] - g.t[i]) * f;
  }

  DR.Ghost = {
    start: start, sample: sample, finish: finish,
    at: at, timeAt: timeAt, RATE: RATE
  };
})(window.DR = window.DR || {});
