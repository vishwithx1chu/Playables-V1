/* rivals.js — other cars on the road.

   Rivals don't run the player's drift physics. They ride the racing line
   (the same one Practice paints on the road) at a speed worked out ahead of
   time for each track, and their bodies swing out through corners by the
   same angle a player's car would need to make that turn. So they look like
   they're drifting, and they arrive where a real drift would put them, but
   they can't spin out, hit a wall, or get stuck.

   Why not simulate them properly: a physics car that can make mistakes has
   to be taught how to recover from them, and every one of those recoveries
   is a new way for a race to feel random. A rival on rails with a
   well-shaped speed profile is predictable in the good sense — you can
   learn where it's quick and where it isn't, which is the whole point of a
   rival.

   Pace: a rival with skill 1.0 laps in exactly the track's target time (the
   same targetSecs shown on the track card). 0.9 is ten percent slower. The
   speed profile is normalised so the lap average comes out right however
   it's shaped — quick on straights, slower into corners, a short burst on
   the way out of them. */

(function (DR) {
  'use strict';

  var MOD_STRAIGHT = 1.08;    // relative pace on a straight...
  var MOD_TIGHT    = 0.90;    // ...and in the tightest corner, before normalising
  var BRAKE_LEAD   = 180;     // start easing off this far before a corner bites
  var BURST        = 0.10;    // extra pace coming out of a corner, like a boost
  var BURST_LEN    = 520;     // ...for this far down the straight
  var LANE_TAU     = 0.42;    // how quickly a rival changes lane
  var SLIP_TAU     = 0.22;    // how quickly its body swings out
  var PASS_LOOK    = 340;     // how far ahead it looks for a car to go round
  var PASS_GAP     = 26;      // side-by-side clearance it aims for
  var EDGE_MARGIN  = 12;      // how close to the barrier it will run
  var CATCHUP_GAP  = 1400;    // a rival this far behind you...
  var CATCHUP_MAX  = 0.04;    // ...gets up to this much extra pace
  var MIN_R        = 504;     // the stock car's tightest circle, for the drift angle
  var SLIP_LIMIT   = 52 * Math.PI / 180;

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

  /* ctx: { playerS, playerDev, playerHW, playerDone, clock, finishS } */
  function update(dt, ctx) {
    if (!list.length) return;
    var P = ensureProfile();
    var pace = DR.Road.tracks()[DR.Road.currentTrack()].pace;
    var L = DR.Road.lapLength();
    var i, j, r;

    for (i = 0; i < list.length; i++) {
      r = list[i];
      var idx = profIndex(r.s);
      var lapNo = Math.floor((r.s - DR.Road.INTRO_LEN) / L);
      var jitter = 1 + (hash(r.id * 31 + lapNo * 7 + 3) - 0.5) * 0.03;
      var v = pace * r.skill * P.mod[idx] * jitter * r.slow;
      if (!ctx.playerDone) {
        var gap = ctx.playerS - r.s;
        if (gap > CATCHUP_GAP) v *= 1 + Math.min(CATCHUP_MAX, (gap - CATCHUP_GAP) / 10000);
      }
      r.v = v;
      r.skin.boost = P.glow[idx] * 0.75;
      if (r.slow < 1) r.slow = Math.min(1, r.slow + dt * 0.12);
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
      }
      if (want > limit) want = limit;
      if (want < -limit) want = -limit;

      var nd = r.d + (want - r.d) * (1 - Math.exp(-dt / LANE_TAU));
      r.dd = (nd - r.d) / dt;
      r.d = nd;
      r.s += v * dt;

      // The body swings out by the angle the stock car would need to hold
      // this bend — so a rival drifts as hard as you would have to.
      DR.Road.centreAt(r.s + 60, _c);
      var sn = Math.max(-0.95, Math.min(0.95, _c.k * MIN_R * Math.sin(SLIP_LIMIT)));
      var slipT = Math.asin(sn);
      r.slip += (slipT - r.slip) * (1 - Math.exp(-dt / SLIP_TAU));

      if (!r.finished && r.s >= ctx.finishS) {
        r.finished = true;
        r.finishT = ctx.clock - (r.s - ctx.finishS) / Math.max(1, v);
      }
    }

    separate();
    place();
  }

  function laneLimit(r) {
    return Math.max(0, DR.Road.halfWidthAt(r.s) - DR.Car.halfWidthFor(r.arch, r.slip) - EDGE_MARGIN);
  }

  /* Two rivals never occupy the same bit of road: if the steering didn't
     open enough of a gap in time, they're eased apart sideways, half each —
     unless one is already against the barrier, in which case the other one
     takes the whole push. A few passes, because easing one pair apart can
     nudge a car into a third. */
  function separate() {
    for (var pass = 0; pass < 3; pass++) {
      var moved = false;
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b = list[j];
          if (Math.abs(a.s - b.s) > (DR.Car.lengthFor(a.arch) + DR.Car.lengthFor(b.arch)) * 0.45) continue;
          var need = DR.Car.halfWidthFor(a.arch, a.slip) + DR.Car.halfWidthFor(b.arch, b.slip) + 4;
          var gapD = b.d - a.d;
          if (Math.abs(gapD) >= need) continue;
          var dir = gapD >= 0 ? 1 : -1;
          var over = need - Math.abs(gapD);
          var la = laneLimit(a), lb = laneLimit(b);
          // How far each can actually move away from the other.
          var roomA = dir > 0 ? a.d + la : la - a.d;
          var roomB = dir > 0 ? lb - b.d : b.d + lb;
          var pa = Math.min(roomA, over * 0.5), pb = Math.min(roomB, over - pa);
          pa = Math.min(roomA, over - pb);
          a.d -= dir * pa; b.d += dir * pb;
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (var k = 0; k < list.length; k++) {
      var lim = laneLimit(list[k]);
      if (list[k].d > lim) list[k].d = lim;
      if (list[k].d < -lim) list[k].d = -lim;
    }
  }

  /* Rubbing with the player. Kept gentle on purpose: a bump costs a little
     speed to whoever was behind and pushes both cars apart sideways, but it
     can never cost a race the way a wall can. Returns what the game needs
     to apply to the player, or null. */
  var _hit = { shift: 0, playerBehind: false, fresh: false, x: 0, y: 0, side: 0 };
  function contact(playerS, playerDev, playerHW, playerLen, playerLimit) {
    var hitAny = false, dev = playerDev;
    _hit.shift = 0; _hit.playerBehind = false; _hit.fresh = false;
    // Two passes, with the rivals re-separated in between: shoving one
    // rival off you can push it into another, which pushes back into you.
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        var ds = r.s - playerS;
        var lenR = DR.Car.lengthFor(r.arch);
        if (Math.abs(ds) > (lenR + playerLen) * 0.45) continue;
        var hwR = DR.Car.halfWidthFor(r.arch, r.slip);
        var dd = r.d - dev;
        var need = hwR + playerHW;
        if (Math.abs(dd) >= need) continue;
        var overlap = need - Math.abs(dd);
        var side = dd >= 0 ? 1 : -1;          // rival is to the player's right
        // Split the overlap: half each, so neither car is a wall — and if
        // one of the two is already at the barrier, the other moves instead.
        var rlim = laneLimit(r);
        var roomR = side > 0 ? rlim - r.d : r.d + rlim;
        var roomP = side > 0 ? dev + playerLimit : playerLimit - dev;
        var pr = Math.min(Math.max(0, roomR), overlap * 0.5);
        var pp = Math.min(Math.max(0, roomP), overlap - pr);
        pr = Math.min(Math.max(0, roomR), overlap - pp);
        r.d += side * pr;
        dev -= side * pp;
        _hit.side = side;
        if (r.bumpCool <= 0) {
          r.bumpCool = 0.6;
          _hit.fresh = true;
          if (ds > 0) _hit.playerBehind = true;
          else r.slow = Math.min(r.slow, 0.93);
          _hit.x = (r.x + DR.Car.x) * 0.5;
          _hit.y = (r.y + DR.Car.y) * 0.5;
        }
        hitAny = true;
      }
      if (!hitAny) break;
      separate();
    }
    _hit.shift = dev - playerDev;
    if (hitAny) place();
    return hitAny ? _hit : null;
  }

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
    for (i = 0; i < pick.length; i++) {
      r = pick[i];
      DR.Car.drawRival(ctx, view, r, r.skin);
      // A name over a rival that's close enough to read, so a boss is
      // recognisably a boss and not just another car.
      DR.Road.project3(r.x, r.y, 48, view, _p);
      if (!_p.vis || _p.sc < 0.30 || _p.sc > 2.6) continue;
      var size = Math.round(Math.max(14, Math.min(26, 13 * _p.sc)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '800 ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4,2,10,0.85)';
      ctx.strokeText(r.name, _p.x, _p.y - 6);
      ctx.fillStyle = r.boss ? '#ffd76a' : '#eaf6ff';
      ctx.fillText(r.name, _p.x, _p.y - 6);
      ctx.textAlign = 'left';
    }
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
    start: start, clear: clear, all: all, update: update, contact: contact,
    position: position, standings: standings, draw: draw, lapFractions: lapFractions,
    profileFor: function (t) { return buildProfile(t); }
  };
})(window.DR = window.DR || {});
