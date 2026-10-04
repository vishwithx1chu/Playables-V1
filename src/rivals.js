/* rivals.js — other cars on the road.

   Rivals don't run the player's drift physics. They ride the racing line
   (the same one Practice paints on the road) at a speed worked out ahead of
   time for each track, and their bodies swing out through corners by the
   same angle a player's car would need to make that turn. So they look like
   they're drifting, and they arrive where a real drift would put them.

   What makes a race a race, on top of that:
   - Boost. Each rival fills a meter (faster through corners, like a drift
     does for you) and fires it on a straight, with the same flame you get.
   - Slipstream. Any car tucked in close behind another is pulled along a
     little faster. That goes for you too, so a pass is something you can
     set up, and a rival you've just passed can hang on and come back.
   - Comeback pace. A rival that falls well behind you drives a little
     harder until it's back in the fight. Only ever one way: a rival AHEAD
     of you never gets help, so beating one always means actually being
     faster than it.
   - Mistakes. Now and then a rival runs wide out of a corner and loses a
     moment: a chance to pounce.
   - Defending. A rival with you right on its bumper moves across to cover
     the inside.
   - Contact. Cars are solid, both ways round: see contact() below.

   Pace: a rival with skill 1.0 laps in exactly the track's target time (the
   same targetSecs shown on the track card) before boost and slipstream,
   which it earns on top. 0.9 is ten percent slower. The speed profile is
   normalised so the lap average comes out right however it's shaped. */

(function (DR) {
  'use strict';

  var MOD_STRAIGHT = 1.08;    // relative pace on a straight...
  var MOD_TIGHT    = 0.90;    // ...and in the tightest corner, before normalising
  var BRAKE_LEAD   = 180;     // start easing off this far before a corner bites
  var BURST        = 0.10;    // extra pace coming out of a corner
  var BURST_LEN    = 520;     // ...for this far down the straight
  var LANE_TAU     = 0.42;    // how quickly a rival changes lane
  var SLIP_TAU     = 0.22;    // how quickly its body swings out
  var PASS_LOOK    = 340;     // how far ahead it looks for a car to go round
  var PASS_GAP     = 26;      // side-by-side clearance it aims for
  var EDGE_MARGIN  = 12;      // how close to the barrier it will run
  var CATCHUP_GAP  = 600;     // a rival this far behind you...
  var CATCHUP_RAMP = 10000;   // ...gets extra pace growing over this distance...
  var CATCHUP_MAX  = 0.08;    // ...up to this much
  var MIN_R        = 504;     // the stock car's tightest circle, for the drift angle
  var SLIP_LIMIT   = 52 * Math.PI / 180;

  // Boost: the same shape as yours, a touch softer.
  var RB_PEAK = 1.30, RB_STEP = 1.12;
  var RB_HOLD = 0.9, RB_DROP = 0.8, RB_FADE = 2.0;
  var RB_FILL = 0.07;         // meter per second on a straight...
  var RB_FILL_CORNER = 0.07;  // ...plus this much more in a full corner
  // Slipstream.
  var DRAFT_NEAR = 40, DRAFT_FAR = 460, DRAFT_W = 70, DRAFT_GAIN = 0.06;
  // Defending.
  var BLOCK_NEAR = 60, BLOCK_FAR = 320, BLOCK = 0.28, BLOCK_BOSS = 0.45;
  // Mistakes.
  var MISTAKE_CHANCE = 0.3, MISTAKE_CHANCE_BOSS = 0.15, MISTAKE_T = 0.9;
  // Contact.
  var SPIN_T = 1.4;           // how long a spun rival is out of it
  var SPIN_CLOSING = 40;      // closing speed a rear-quarter hit needs to spin a car

  var list = [];
  var profile = null, profileTrack = -1;
  var _c = { x: 0, y: 0, h: 0, k: 0 };

  function hash(n) {
    var x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
    return x - Math.floor(x);
  }

  /* One speed multiplier per sample of the lap, plus how hard the exhaust
     should be lit there. Normalised by the HARMONIC mean, not the plain
     one: a lap's time is the sum of distance over speed, so that's the
     average that has to come out at exactly 1 for the lap time to land on
     target. */
  function buildProfile(t) {
    var P = DR.Road.lapPath(t), n = P.n, step = P.step, i, j;
    var lead = Math.max(1, Math.round(BRAKE_LEAD / step));
    var KT = 1 / 600;
    var mod = new Array(n), glow = new Array(n);
    for (i = 0; i < n; i++) {
      var km = 0;
      for (j = 0; j <= lead; j++) {
        var kk = Math.abs(P.k[(i + j) % n]);
        if (kk > km) km = kk;
      }
      var c = Math.min(1, km / KT);
      mod[i] = MOD_STRAIGHT - (MOD_STRAIGHT - MOD_TIGHT) * c;
      glow[i] = 0;
    }
    var burstN = Math.max(1, Math.round(BURST_LEN / step));
    for (i = 0; i < n; i++) {
      var prev = Math.abs(P.k[(i - 1 + n) % n]), cur = Math.abs(P.k[i]);
      if (!(prev > 1e-7 && cur < 1e-7)) continue;     // a corner ends here
      var len = 0;
      while (len < n && Math.abs(P.k[(i + len) % n]) < 1e-7) len++;
      if (len * step < 600) continue;                 // too short to bother
      for (j = 0; j < Math.min(burstN, len); j++) {
        var q = (i + j) % n, amt = 1 - j / burstN;
        mod[q] += BURST * amt;
        glow[q] = Math.max(glow[q], amt);
      }
    }
    var inv = 0;
    for (i = 0; i < n; i++) inv += 1 / mod[i];
    var H = n / inv;
    for (i = 0; i < n; i++) mod[i] /= H;
    return { mod: mod, glow: glow, n: n, step: step, len: P.len };
  }

  function ensureProfile() {
    var t = DR.Road.currentTrack();
    if (profileTrack !== t || !profile) { profile = buildProfile(t); profileTrack = t; }
    return profile;
  }

  function profIndex(s) {
    var P = profile;
    var u = (s - DR.Road.INTRO_LEN) / P.step;
    u = u - Math.floor(u / P.n) * P.n;
    return Math.floor(u) % P.n;
  }

  // The grid, ahead of the player: two by two, the player last.
  var GRID = [[360, -85], [360, 85], [190, -85], [190, 85], [530, -85], [530, 85]];

  /* defs: [{ name, color, arch, skill, bias }]. bias is a small permanent
     lane preference, so three rivals on one racing line don't collapse into
     a single file. */
  function start(defs) {
    ensureProfile();
    list = [];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i], g = GRID[i % GRID.length];
      list.push({
        id: i, name: d.name, color: d.color, arch: d.arch || 'sport',
        skill: d.skill || 1, bias: d.bias || 0, boss: !!d.boss,
        skin: DR.Car.makeSkin(d.color, d.arch || 'sport'),
        s: g[0], d: g[1], v: 0, dd: 0,
        x: 0, y: 0, h: 0, slip: 0, bodyYaw: 0, roll: 0,
        slow: 1, bumpCool: 0,
        meter: hash(i * 13 + 5) * 0.6, boostT: 1e9, boosts: 0,
        draft: 1, kickD: 0,
        wobT: 0, wobAmp: 0, spinT: 0, spinDir: 0, spins: 0, stunT: 0, shunts: 0, smokeT: 0,
        mistLap: -99, mistS: -1, mistT: 0, mistDir: 0,
        finished: false, finishT: 0
      });
    }
    place();
  }

  function clear() { list = []; }
  function all() { return list; }

  function place() {
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      DR.Road.centreAt(r.s, _c);
      var h = _c.h;
      r.x = _c.x + Math.cos(h) * r.d;
      r.y = _c.y - Math.sin(h) * r.d;
      r.h = h + Math.atan2(r.dd, Math.max(1, r.v));
      r.bodyYaw = r.h + r.slip;
    }
  }

  function boostMult(r) {
    var t = r.boostT;
    if (t < RB_HOLD) return RB_PEAK;
    t -= RB_HOLD;
    if (t < RB_DROP) return RB_PEAK + (RB_STEP - RB_PEAK) * (t / RB_DROP);
    t -= RB_DROP;
    if (t < RB_FADE) return RB_STEP + (1 - RB_STEP) * (t / RB_FADE);
    return 1;
  }

  // How much a car at (s, d) is pulled along by whatever it's tucked in
  // behind. `self` is left out, so a rival doesn't draft itself.
  function draftAt(s, d, self, playerS, playerDev) {
    var best = 0, i, o, ds;
    function consider(os, od) {
      ds = os - s;
      if (ds < DRAFT_NEAR || ds > DRAFT_FAR || Math.abs(od - d) > DRAFT_W) return;
      var f = 1 - (ds - DRAFT_NEAR) / (DRAFT_FAR - DRAFT_NEAR);
      if (f > best) best = f;
    }
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (o === self || o.spinT > 0) continue;
      consider(o.s, o.d);
    }
    if (playerS !== undefined) consider(playerS, playerDev);
    return 1 + DRAFT_GAIN * best;
  }

  /* ctx: { playerS, playerDev, playerHW, playerDone, clock, finishS } */
  function update(dt, ctx) {
    if (!list.length) return;
    var P = ensureProfile();
    var pace = DR.Road.tracks()[DR.Road.currentTrack()].pace;
    var L = DR.Road.lapLength();
    var i, j, r;
    var kd = Math.exp(-dt / 0.25);

    for (i = 0; i < list.length; i++) {
      r = list[i];
      var idx = profIndex(r.s);
      var lapNo = Math.floor((r.s - DR.Road.INTRO_LEN) / L);
      var jitter = 1 + (hash(r.id * 31 + lapNo * 7 + 3) - 0.5) * 0.03;

      // Boost: fill, and fire it down a straight.
      var kHere = Math.abs(DR.Road.centreAt(r.s, _c).k);
      r.meter = Math.min(1, r.meter + dt * (RB_FILL + RB_FILL_CORNER * Math.min(1, kHere * 600)));
      if (r.boostT < 1e9) r.boostT += dt;
      if (r.stunT > 0) r.stunT = Math.max(0, r.stunT - dt);
      if (r.meter >= 1 && r.spinT <= 0 && r.stunT <= 0 && r.s > DR.Road.INTRO_LEN &&
          DR.Road.dirAt(r.s + 60) === 0 && DR.Road.dirAt(r.s + 500) === 0) {
        r.meter = 0; r.boostT = 0; r.boosts++;
      }
      var bm = boostMult(r);

      // A mistake, now and then: once a lap at most, somewhere random.
      if (lapNo !== r.mistLap) {
        r.mistLap = lapNo;
        var chance = r.boss ? MISTAKE_CHANCE_BOSS : MISTAKE_CHANCE;
        r.mistS = hash(r.id * 17 + lapNo * 5 + 11) < chance
          ? DR.Road.INTRO_LEN + (lapNo + 0.1 + 0.8 * hash(r.id * 7 + lapNo * 3)) * L : -1;
      }
      if (r.mistS > 0 && r.s >= r.mistS) {
        r.mistS = -1; r.mistT = MISTAKE_T;
        var dirHere = DR.Road.dirAt(r.s);
        r.mistDir = dirHere ? -dirHere : (hash(r.id + lapNo) < 0.5 ? -1 : 1);
      }
      var mist = 1;
      if (r.mistT > 0) { r.mistT = Math.max(0, r.mistT - dt); mist = 0.86; }

      r.draft = draftAt(r.s, r.d, r, ctx.playerDone ? undefined : ctx.playerS, ctx.playerDev);
      var v = pace * r.skill * P.mod[idx] * jitter * r.slow * bm * r.draft * mist;
      if (!ctx.playerDone) {
        var gap = ctx.playerS - r.s;
        if (gap > CATCHUP_GAP) v *= 1 + Math.min(CATCHUP_MAX, (gap - CATCHUP_GAP) / CATCHUP_RAMP * CATCHUP_MAX * 6);
      }
      if (r.spinT > 0) {
        r.spinT = Math.max(0, r.spinT - dt);
        v *= 0.45 + 0.55 * (1 - r.spinT / SPIN_T);
      }
      r.v = v;
      r.skin.boost = Math.max(P.glow[idx] * 0.75, (bm - 1) / (RB_PEAK - 1));
      if (r.slow < 1) r.slow = Math.min(1, r.slow + dt * 0.15);
      if (r.bumpCool > 0) r.bumpCool = Math.max(0, r.bumpCool - dt);

      // Where it wants to be across the road: on the line, nudged by its own
      // lane preference, and moved aside for anything in its way.
      var hwR = DR.Car.halfWidthFor(r.arch, r.slip);
      var roadHW = DR.Road.halfWidthAt(r.s);
      var limit = Math.max(0, roadHW - hwR - EDGE_MARGIN);
      var want = DR.Road.lineAt(r.s + v * 0.3).off + r.bias;

      var nearest = PASS_LOOK, blocker = null, blockHW = 0;
      // The player...
      var ds = ctx.playerS - r.s;
      if (ds > 0 && ds < nearest && Math.abs(ctx.playerDev - want) < ctx.playerHW + hwR + PASS_GAP) {
        nearest = ds; blocker = ctx.playerDev; blockHW = ctx.playerHW;
      }
      // ...and every other rival.
      for (j = 0; j < list.length; j++) {
        if (j === i) continue;
        var o = list[j];
        ds = o.s - r.s;
        if (ds <= 0 || ds >= nearest) continue;
        var ohw = DR.Car.halfWidthFor(o.arch, o.slip);
        if (Math.abs(o.d - want) < ohw + hwR + PASS_GAP) {
          nearest = ds; blocker = o.d; blockHW = ohw;
        }
      }
      if (blocker !== null) {
        var clear2 = blockHW + hwR + PASS_GAP + 6;
        var left = blocker - clear2, right = blocker + clear2;
        var leftOk = left >= -limit, rightOk = right <= limit;
        if (leftOk && rightOk) want = Math.abs(left - want) < Math.abs(right - want) ? left : right;
        else if (leftOk) want = left;
        else if (rightOk) want = right;
      } else if (!ctx.playerDone && r.stunT <= 0) {
        // Nobody to get round: if you're right on its bumper, cover you —
        // unless it's still shaken from a hit, which is your opening.
        var behind = r.s - ctx.playerS;
        if (behind > BLOCK_NEAR && behind < BLOCK_FAR) {
          want += (ctx.playerDev - want) * (r.boss ? BLOCK_BOSS : BLOCK);
        }
      }
      if (r.mistT > 0) want += r.mistDir * 90 * (r.mistT / MISTAKE_T);
      if (want > limit) want = limit;
      if (want < -limit) want = -limit;

      // A spinning car isn't steering; it just slides where it was knocked.
      // Shaken by a hit, it's slow to get back on line.
      var tau = r.stunT > 0 ? LANE_TAU * 3 : LANE_TAU;
      var nd = r.spinT > 0 ? r.d : r.d + (want - r.d) * (1 - Math.exp(-dt / tau));
      nd += r.kickD * dt;
      r.kickD *= kd;
      if (nd > limit + EDGE_MARGIN) { nd = limit + EDGE_MARGIN; scrape(r, 1); }
      if (nd < -limit - EDGE_MARGIN) { nd = -limit - EDGE_MARGIN; scrape(r, -1); }
      r.dd = (nd - r.d) / dt;
      r.d = nd;
      r.s += v * dt;

      // The body swings out by the angle the stock car would need to hold
      // this bend, plus any wobble or spin a knock has given it.
      DR.Road.centreAt(r.s + 60, _c);
      var sn = Math.max(-0.95, Math.min(0.95, _c.k * MIN_R * Math.sin(SLIP_LIMIT)));
      var slipT = Math.asin(sn);
      if (r.wobT > 0) {
        r.wobT = Math.max(0, r.wobT - dt);
        slipT += r.wobAmp * Math.sin(r.wobT * 18) * (r.wobT / 0.6);
      }
      if (r.spinT > 0) {
        // Spun right round: a full turn, fast at first and slowing as the
        // tyres bite, laying rubber and smoke the whole way.
        var ph = 1 - r.spinT / SPIN_T;
        var ease = 1 - Math.pow(1 - ph, 2.4);
        slipT = r.spinDir * Math.PI * 2 * ease;
        r.slip = slipT;
        if (Math.random() < 0.7 && DR.FX && DR.FX.skidAt) {
          var bx = Math.sin(r.h + slipT), by = Math.cos(r.h + slipT);
          DR.FX.skidAt(r.x - bx * 22 + by * 14, r.y - by * 22 - bx * 14, 5);
          DR.FX.skidAt(r.x - bx * 22 - by * 14, r.y - by * 22 + bx * 14, 5);
        }
        if (Math.random() < 0.55 && DR.FX && DR.FX.smokeAt) DR.FX.smokeAt(r.x, r.y, 1, 12, 0.35, false);
        if (r.spinT - dt <= 0) r.slip = 0;    // a whole turn is facing forward again
      } else {
        r.slip += (slipT - r.slip) * (1 - Math.exp(-dt / SLIP_TAU));
      }

      // Knocked about: dark smoke from the bodywork for a while after.
      if (r.smokeT > 0) {
        r.smokeT -= dt;
        if (Math.random() < 0.35 && DR.FX && DR.FX.smokeAt) DR.FX.smokeAt(r.x, r.y, 1, 9, 0.28, true);
      }

      if (!r.finished && r.s >= ctx.finishS) {
        r.finished = true;
        r.finishT = ctx.clock - (r.s - ctx.finishS) / Math.max(1, v);
      }
    }

    separate();
    place();
  }

  // Pushed into the barrier: sparks, and it costs speed.
  function scrape(r, side) {
    if (r.bumpCool > 0.3) return;
    r.slow = Math.min(r.slow, 0.9);
    r.kickD = 0;
    DR.Road.centreAt(r.s, _c);
    var nx = Math.cos(_c.h), ny = -Math.sin(_c.h);
    if (DR.FX && DR.FX.wallSparks) {
      DR.FX.wallSparks(r.x + nx * side * 30, r.y + ny * side * 30, nx * side, ny * side, 10, 0.8);
    }
    r.bumpCool = Math.max(r.bumpCool, 0.4);
  }

  function laneLimit(r) {
    return Math.max(0, DR.Road.halfWidthAt(r.s) - DR.Car.halfWidthFor(r.arch, r.slip) - EDGE_MARGIN);
  }

  /* Contact. Cars are solid boxes on the road (length along it, width
     across it), and an overlap is pushed out along whichever way is
     shallower:
     - SIDE by side: both are shoved apart sideways and knocked off line a
       little. If one of them has the barrier right beside it, the other
       one takes the whole push, and the pinned one scrapes the wall.
     - NOSE to TAIL: the car behind is stopped dead against the one in
       front and has to drop to its speed. You can't drive through a car,
       and you can't drive through one that's defending either.
     - A fast hit on a car's back corner spins it out. That works both ways
       round: rivals can do it to you. */
  function halfLen(arch) { return DR.Car.lengthFor(arch) * 0.45; }

  function separate() {
    for (var pass = 0; pass < 3; pass++) {
      var moved = false;
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b = list[j];
          var ox = halfLen(a.arch) + halfLen(b.arch) - Math.abs(a.s - b.s);
          if (ox <= 0) continue;
          var need = DR.Car.halfWidthFor(a.arch, a.slip) + DR.Car.halfWidthFor(b.arch, b.slip) + 4;
          var gapD = b.d - a.d;
          var oy = need - Math.abs(gapD);
          if (oy <= 0) continue;
          moved = true;
          if (oy <= ox * 0.8) {
            var dir = gapD >= 0 ? 1 : -1;
            var la = laneLimit(a), lb = laneLimit(b);
            var roomA = dir > 0 ? a.d + la : la - a.d;
            var roomB = dir > 0 ? lb - b.d : b.d + lb;
            var pa = Math.min(Math.max(0, roomA), oy * 0.5), pb = Math.min(Math.max(0, roomB), oy - pa);
            pa = Math.min(Math.max(0, roomA), oy - pb);
            a.d -= dir * pa; b.d += dir * pb;
            if (pass === 0 && a.bumpCool <= 0 && b.bumpCool <= 0) {
              a.kickD = -dir * 60; b.kickD = dir * 60;
              wobble(a, 0.12); wobble(b, 0.12);
              a.slow = Math.min(a.slow, 0.97); b.slow = Math.min(b.slow, 0.97);
              a.bumpCool = b.bumpCool = 0.5;
            }
          } else {
            // The one behind stops against the one in front.
            var back = a.s < b.s ? a : b, front = back === a ? b : a;
            back.s = front.s - (halfLen(a.arch) + halfLen(b.arch));
            if (back.v > front.v) back.slow = Math.min(back.slow, (front.v / back.v) * 0.99 * back.slow);
            if (pass === 0 && front.bumpCool <= 0) {
              // The one in front gets its tail knocked about too.
              var off = front.d - back.d;
              front.kickD = (off >= 0 ? 1 : -1) * 70;
              wobble(front, 0.18);
              front.stunT = Math.max(front.stunT, 0.6);
              front.bumpCool = 0.5;
            }
          }
        }
      }
      if (!moved) break;
    }
    for (var k = 0; k < list.length; k++) {
      var lim = laneLimit(list[k]) + EDGE_MARGIN;
      if (list[k].d > lim) list[k].d = lim;
      if (list[k].d < -lim) list[k].d = -lim;
    }
  }

  function wobble(r, amp) {
    if (r.spinT > 0) return;
    r.wobAmp = r.wobT > 0 ? Math.max(r.wobAmp, amp) : amp;
    r.wobT = 0.6;
  }

  function spin(r, dir) {
    r.spinT = SPIN_T; r.spinDir = dir; r.spins++;
    r.slow = Math.min(r.slow, 0.8);
    r.boostT = 1e9;
    r.smokeT = 4;
    if (DR.FX && DR.FX.crash) DR.FX.crash(r.x, r.y, r.color, 1.1);
    if (DR.FX && DR.FX.labelAt) DR.FX.labelAt('SPUN OUT', '#ffd76a', r.x, r.y, 1.2);
  }

  /* Contact with the player. p: { s, dev, hw, len, limit, v, boost,
     slipAmt, slipSign, latV } — where you are, how wide and long your car is,
     how far you can move across before the barrier, how fast you're going,
     how much boost is on (0..1), how sideways you are (0..1, and which
     way), and how fast you're sliding across the road. Returns what the game should do
     to your car, or null:
       shiftD  sideways shove        shiftS  pushed back along the road
       cap     most of your current speed you can keep (1 = no loss)
       knock   a shove to the body's angle (a rival hitting your back corner)
       fresh   a new impact this frame (for sparks, shake, words)
       kind    'side' | 'rear' (you ran into it) | 'rammed' (it ran into you)
       severity 0..1, x/y where, side which side it was on */
  var _hit = { shiftD: 0, shiftS: 0, cap: 1, knock: 0, fresh: false, kind: '', severity: 0,
               x: 0, y: 0, side: 0, spun: null, pinned: false, shunt: false, power: 1 };
  function contact(p) {
    var hitAny = false, dev = p.dev, pullS = 0;
    _hit.shiftD = 0; _hit.shiftS = 0; _hit.cap = 1; _hit.knock = 0; _hit.fresh = false;
    _hit.kind = ''; _hit.severity = 0; _hit.spun = null; _hit.pinned = false;
    var hlP = p.len * 0.45;
    /* How hard you hit. Boosting, you're a battering ram; drifting, your
       whole car is swinging sideways into them. Both together is the
       biggest hit in the game. 1 is a plain bump, up to about 3. */
    var power = 1 + 0.9 * (p.boost || 0) + 1.2 * (p.slipAmt || 0);
    _hit.power = power; _hit.shunt = false;
    // Two passes, with the rivals re-separated in between: shoving one
    // rival off you can push it into another, which pushes back into you.
    for (var pass = 0; pass < 2; pass++) {
      var any = false;
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        var ds = r.s - (p.s + pullS);
        var hlR = halfLen(r.arch);
        var ox = hlR + hlP - Math.abs(ds);
        if (ox <= 0) continue;
        var hwR = DR.Car.halfWidthFor(r.arch, r.slip);
        var dd = r.d - dev;
        var oy = hwR + p.hw - Math.abs(dd);
        if (oy <= 0) continue;
        any = hitAny = true;
        var side = dd >= 0 ? 1 : -1;          // the rival is on your right
        var fresh = r.bumpCool <= 0;
        var closing = p.v - r.v;              // + you're catching it
        // How fast you're sliding across INTO it (a drift swinging you
        // sideways): that's extra punch on top of the hit itself.
        var sweep = Math.max(0, (p.latV || 0) * side);
        _hit.side = side;
        _hit.x = (r.x + DR.Car.x) * 0.5;
        _hit.y = (r.y + DR.Car.y) * 0.5;

        if (oy <= ox * 0.8) {
          // Side by side: split the shove, unless one of you is on the wall.
          var rlim = laneLimit(r) + EDGE_MARGIN;
          var roomR = side > 0 ? rlim - r.d : r.d + rlim;
          var roomP = side > 0 ? dev + p.limit : p.limit - dev;
          var pr = Math.min(Math.max(0, roomR), oy * 0.5);
          var pp = Math.min(Math.max(0, roomP), oy - pr);
          pr = Math.min(Math.max(0, roomR), oy - pp);
          r.d += side * pr;
          dev -= side * pp;
          if (pr + pp < oy - 0.5) _hit.pinned = true;
          if (roomR <= 0.5 && fresh) scrape(r, side);
          if (fresh) {
            var sev = Math.min(1, oy / 24 + Math.abs(closing) / 300);
            _hit.kind = 'side'; _hit.fresh = true;
            _hit.severity = Math.max(_hit.severity, sev);
            r.bumpCool = 0.5;
            if ((ds > hlR * 0.35 && closing > SPIN_CLOSING / power) ||
                (power >= 2.2 && sev > 0.5)) {
              // Your nose into its back corner, faster than it — or a big
              // drifting, boosting broadside: it goes round.
              spin(r, -side);
              r.kickD = side * Math.min(380, 90 * power);
              _hit.spun = r.name;
              _hit.cap = Math.min(_hit.cap, p.boost > 0.3 ? 0.98 : 0.94);
            } else if (ds < -hlP * 0.35 && -closing > SPIN_CLOSING) {
              // Its nose into YOUR back corner: you get knocked sideways.
              _hit.knock = side * 0.42;
              _hit.cap = Math.min(_hit.cap, 0.88);
              r.slow = Math.min(r.slow, 0.95);
            } else {
              // Shoved away from you: harder the harder you hit.
              r.kickD = side * Math.min(420, (80 + 70 * sev) * power + sweep * 0.8);
              wobble(r, Math.min(0.45, (0.1 + 0.15 * sev) * power));
              r.slow = Math.min(r.slow, 1 - 0.03 * power);
              r.stunT = Math.max(r.stunT, 0.6 * power);
              if (power >= 1.7) { _hit.shunt = true; r.shunts++; }
              _hit.cap = Math.min(_hit.cap, p.boost > 0.3 ? 0.99 : 0.97);
            }
          }
        } else if (ds > 0) {
          // You've run into the back of it. You can't drive through it —
          // but it doesn't shrug you off either: its tail is knocked
          // sideways, away from the side you hit, it fishtails, loses a
          // little speed and stops defending for a moment. On boost you
          // shove it right out of the way and keep most of your speed.
          pullS -= ox;
          if (p.boost > 0.3) {
            // On boost you're not held to its speed: the hit costs you a
            // little once, and it's shoved aside rather than you stopped.
            if (fresh) _hit.cap = Math.min(_hit.cap, 0.95);
          } else if (closing > 0) {
            _hit.cap = Math.min(_hit.cap, (r.v / Math.max(1, p.v)) * 0.98);
          }
          r.s += 2 * power;                    // a shove forward
          if (fresh) {
            var offSide = Math.abs(dd) > 6 ? (dd > 0 ? 1 : -1) : (p.slipSign || 1);
            var cl = Math.max(0, closing);
            if (sweep > 40) offSide = side;     // a drift sweeps it the way you're sliding
            r.kickD = offSide * Math.min(420, (70 + cl * 0.6) * power + sweep * 0.8);
            wobble(r, Math.min(0.5, (0.14 + cl / 400) * power));
            r.slow = Math.min(r.slow, 1 - 0.04 * power);
            r.stunT = Math.max(r.stunT, 0.8 * power);
            if (power >= 1.8 && Math.abs(dd) > 18 && cl > 50) {
              spin(r, -offSide);
              _hit.spun = r.name;
            } else if (power >= 1.7) { _hit.shunt = true; r.shunts++; }
            _hit.kind = 'rear'; _hit.fresh = true;
            _hit.severity = Math.max(_hit.severity, Math.min(1, (0.25 + cl / 250) * Math.min(1.6, power)));
            r.bumpCool = 0.5;
          }
        } else {
          // It's run into the back of you: it stops against you.
          r.s = p.s + pullS - (hlR + hlP);
          if (r.v > p.v) r.slow = Math.min(r.slow, (p.v / Math.max(1, r.v)) * 0.97 * r.slow);
          if (fresh) {
            _hit.kind = 'rammed'; _hit.fresh = true;
            _hit.severity = Math.max(_hit.severity, Math.min(1, 0.2 + Math.max(0, -closing) / 250));
            // Rammed hard, your tail gets knocked about too.
            if (-closing > 40) _hit.knock = (dd > 0 ? -1 : 1) * Math.min(0.3, -closing / 400);
            wobble(r, 0.1);
            r.bumpCool = 0.5;
          }
        }
      }
      if (!any) break;
      separate();
    }
    _hit.shiftD = dev - p.dev;
    _hit.shiftS = pullS;
    if (hitAny) place();
    return hitAny ? _hit : null;
  }

  // Your slipstream: how much the cars ahead of you are pulling you along.
  function draftFor(playerS, playerDev) { return draftAt(playerS, playerDev, null); }

  /* Where the player stands right now. Anyone who has finished ranks by
     when; everyone still out there ranks by how far round they are. */
  function position(playerS, playerDone) {
    var p = 1;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (playerDone) { if (r.finished) p++; }
      else if (r.finished || r.s > playerS) p++;
    }
    return p;
  }

  /* The full results table once the player crosses the line. A rival still
     out on the road gets an honest estimate — its remaining distance at its
     own average pace — rather than a blank. */
  function standings(player) {
    var pace = DR.Road.tracks()[DR.Road.currentTrack()].pace;
    var rows = [{ name: player.name, color: player.color, isPlayer: true,
                  time: player.time, estimated: false }];
    for (var i = 0; i < list.length; i++) {
      var r = list[i], t, est = false;
      if (r.finished) t = r.finishT;
      else {
        t = player.clock + Math.max(0, player.finishS - r.s) / (pace * r.skill);
        est = true;
      }
      rows.push({ name: r.name, color: r.color, isPlayer: false, boss: r.boss,
                  time: t, estimated: est });
    }
    rows.sort(function (a, b) { return a.time - b.time; });
    return rows;
  }

  /* Drawn in two passes around the player — the ones ahead of you before
     your car, the ones behind you after — so whoever is nearer the camera
     is always painted on top. */
  var _p = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
  function draw(ctx, view, playerS, which) {
    if (!list.length) return;
    var pick = [], i, r;
    for (i = 0; i < list.length; i++) {
      r = list[i];
      if (r.s < playerS - DR.Road.CAM_BACK + 20) continue;
      if (r.s > playerS + DR.Road.LOOKAHEAD) continue;
      if ((which === 'ahead') !== (r.s > playerS)) continue;
      pick.push(r);
    }
    pick.sort(function (a, b) { return b.s - a.s; });
    var tags = [];
    for (i = 0; i < pick.length; i++) {
      r = pick[i];
      DR.Car.drawRival(ctx, view, r, r.skin);
      DR.Road.project3(r.x, r.y, 48, view, _p);
      if (_p.vis && _p.sc >= 0.30 && _p.sc <= 2.6) tags.push({ r: r, x: _p.x, y: _p.y, sc: _p.sc });
    }
    // A name over a rival that's close enough to read, so a boss is
    // recognisably a boss and not just another car. Nearest first, and a
    // name that would overlap one already written is left off rather than
    // printed on top of it — two names mashed together read as neither.
    tags.sort(function (a, b) { return b.sc - a.sc; });
    var boxes = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (i = 0; i < tags.length; i++) {
      var t = tags[i];
      var size = Math.round(Math.max(14, Math.min(26, 13 * t.sc)));
      ctx.font = '800 ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      var w = ctx.measureText(t.r.name).width + 8, x0 = t.x - w * 0.5, y0 = t.y - 6 - size;
      var clash = false;
      for (var q = 0; q < boxes.length; q++) {
        var bx = boxes[q];
        if (x0 < bx.x + bx.w && x0 + w > bx.x && y0 < bx.y + bx.h && y0 + size + 4 > bx.y) { clash = true; break; }
      }
      if (clash) continue;
      boxes.push({ x: x0, y: y0, w: w, h: size + 4 });
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4,2,10,0.85)';
      ctx.strokeText(t.r.name, t.x, t.y - 6);
      ctx.fillStyle = t.r.boss ? '#ffd76a' : '#eaf6ff';
      ctx.fillText(t.r.name, t.x, t.y - 6);
    }
    ctx.textAlign = 'left';
  }

  // For the minimap: where each rival is round the lap, 0..1.
  function lapFractions(out) {
    out = out || [];
    out.length = 0;
    var L = DR.Road.lapLength();
    for (var i = 0; i < list.length; i++) {
      var d = list[i].s - DR.Road.INTRO_LEN;
      if (d < 0) d += L;
      out.push({ f: (d - Math.floor(d / L) * L) / L, color: list[i].color });
    }
    return out;
  }

  DR.Rivals = {
    start: start, clear: clear, all: all, update: update, contact: contact, draftFor: draftFor,
    position: position, standings: standings, draw: draw, lapFractions: lapFractions,
    profileFor: function (t) { return buildProfile(t); }
  };
})(window.DR = window.DR || {});
