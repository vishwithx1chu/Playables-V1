/* road.js — a real circuit in world space, and the camera that follows it.
   The track is no longer a strip that slides sideways: it is a line that
   genuinely turns, built by integrating curvature along its length. That is
   what makes a 180 degree hairpin possible at all. */

(function (DR) {
  'use strict';

  var BASE_HW = 226;         // straights: road is 452 units wide
  var CORNER_EXTRA = 52;     // corners widen by up to this much per side
  var TIGHTEST_K = 1 / 600;  // curvature of the tightest corner on the track
  var WIDEN_WIN = 30;        // smoothing window, in samples either side (240 units)
  var WALL_OFF = 6;          // barrier face, just outside the painted edge
  var WALL_H   = 66;         // and this tall — comfortably over the car's roofline
  var HALF_W = BASE_HW;      // kept for anything asking for the nominal width
  var SAMPLE = 8;            // world units between stored centreline points

  /* ---------------------------- THE CAMERA ----------------------------
     Sits CAM_BACK behind the car, turned to face the way the car is going,
     high enough that the car lands on CAR_Y. Lower CAM_BACK for a more
     dramatic angle, raise it to flatten back toward top-down. */
  // Tilt is really HORIZON_Y: the further down the screen the horizon sits,
  // the more level — and so the lower — the camera is. About 38 degrees now,
  // down from 47. Going much lower costs forward visibility fast, because a
  // level camera squashes the road ahead into a thin band.
  // Useful identity: the car sits FOCAL x tan(tilt) below the horizon. So at a
  // fixed low tilt, a longer FOCAL buys back sky, a bigger car and a wider
  // road all at once — it only costs field of view to the sides.
  var HORIZON_Y = 574;       // 32 degree tilt, zoomed right in
  var CAR_Y     = 880;
  var CAM_BACK  = 280;       // right up behind the car
  var FOCAL     = 489;
  // Nothing closer than this can be drawn. It has to be SMALL: sideways-on at
  // the edge of the road, the tarmac beside the camera runs a long way back
  // past it, and a near plane set generously just clipped that away and left
  // the road looking like it stopped a car's length behind you.
  var NEAR      = 34;
  var LOOKAHEAD = 2600;      // world units of road drawn ahead of the car
  var K         = (CAR_Y - HORIZON_Y) * CAM_BACK;
  var SC_CAR    = FOCAL / CAM_BACK;
  /* -------------------------------------------------------------------- */

  var CHEVRON_LEAD = 1100;
  var HAIRPIN_LEAD = 1595;

  /* ----------------------------- THE TRACKS -----------------------------
     Three layouts in the character of the real circuit archetypes: one fast
     and flowing, one tight and technical, one balanced. Not traced from any
     particular circuit — real ones are full of corners far tighter than this
     car can physically carve, so a faithful copy would simply be undriveable.

     Two rules every layout obeys: no corner radius anywhere near MIN_RADIUS
     (504, the tightest circle the car can hold), and the left and right
     degrees cancel exactly, so a lap comes back to the heading it started on
     and the thing drives like a circuit rather than a spiral. */
  var TRACKS = [
    { name: 'VELOCITY RING', blurb: 'Long straights, fast sweepers', tag: 'FAST',
      targetSecs: 25, pace: 856, picks: 4, lap: [
      { kind:'str', len:1600 },
      { kind:'turn', dir: 1, r:1000, deg: 90 },
      { kind:'str', len:1300 },
      { kind:'turn', dir:-1, r:1100, deg: 60 },
      { kind:'str', len: 900 },
      { kind:'turn', dir: 1, r: 640, deg:170, hairpin:true },
      { kind:'str', len:1200 },
      { kind:'turn', dir:-1, r:1000, deg: 60 },
      { kind:'str', len: 800 },
      { kind:'turn', dir: 1, r: 950, deg: 90 },
      { kind:'str', len:1100 },
      { kind:'turn', dir:-1, r: 900, deg: 55 },
      { kind:'turn', dir: 1, r:1050, deg: 55 },
      { kind:'turn', dir: 1, r: 760, deg: 45 },
      { kind:'turn', dir:-1, r: 760, deg: 45 },
      { kind:'str', len: 900 },
      { kind:'turn', dir: 1, r: 980, deg: 90 },
      { kind:'str', len: 800 },
      { kind:'turn', dir:-1, r: 950, deg: 50 },
      { kind:'str', len: 700 },
      { kind:'turn', dir: 1, r:1000, deg: 90 },
      { kind:'str', len:1000 }
    ]},
    { name: 'HARBOUR MAZE', blurb: 'Barely a straight on it', tag: 'TECHNICAL',
      targetSecs: 32, pace: 852, picks: 5, lap: [
      { kind:'str', len: 400 },
      { kind:'turn', dir: 1, r: 640, deg: 90 },
      { kind:'str', len: 250 },
      { kind:'turn', dir:-1, r: 620, deg: 60 },
      { kind:'str', len: 200 },
      { kind:'turn', dir: 1, r: 600, deg:170, hairpin:true },
      { kind:'str', len: 300 },
      { kind:'turn', dir: 1, r: 680, deg: 55 },
      { kind:'turn', dir:-1, r: 680, deg: 55 },
      { kind:'str', len: 220 },
      { kind:'turn', dir: 1, r: 620, deg: 55 },
      { kind:'str', len: 260 },
      { kind:'turn', dir: 1, r: 660, deg: 50 },
      { kind:'turn', dir:-1, r: 660, deg: 50 },
      { kind:'turn', dir: 1, r: 660, deg: 50 },
      { kind:'str', len: 240 },
      { kind:'turn', dir:-1, r: 700, deg: 45 },
      { kind:'str', len: 280 },
      { kind:'turn', dir: 1, r: 640, deg: 60 },
      { kind:'str', len: 200 },
      { kind:'turn', dir:-1, r: 620, deg: 55 },
      { kind:'turn', dir: 1, r: 620, deg: 55 },
      { kind:'str', len: 300 },
      { kind:'turn', dir: 1, r: 700, deg: 40 },
      { kind:'str', len: 260 },
      { kind:'turn', dir:-1, r: 680, deg: 40 },
      { kind:'str', len: 240 },
      { kind:'turn', dir: 1, r: 660, deg: 40 },
      { kind:'str', len: 420 }
    ]},
    { name: 'GRAND CIRCUIT', blurb: 'Four big corners, hairpin, esses', tag: 'BALANCED',
      targetSecs: 40, pace: 860, picks: 6, lap: [
      { kind:'str', len: 900 },
      { kind:'turn', dir: 1, r: 820, deg: 90 },
      { kind:'str', len: 500 },
      { kind:'turn', dir:-1, r: 700, deg: 60 },
      { kind:'str', len: 350 },
      { kind:'turn', dir: 1, r: 620, deg:175, hairpin:true },
      { kind:'str', len: 600 },
      { kind:'turn', dir:-1, r: 760, deg: 60 },
      { kind:'str', len: 400 },
      { kind:'turn', dir: 1, r: 880, deg: 90 },
      { kind:'str', len: 550 },
      { kind:'turn', dir: 1, r: 660, deg: 55 },
      { kind:'turn', dir:-1, r: 660, deg: 55 },
      { kind:'turn', dir: 1, r: 660, deg: 55 },
      { kind:'str', len: 350 },
      { kind:'turn', dir:-1, r: 720, deg: 55 },
      { kind:'str', len: 500 },
      { kind:'turn', dir: 1, r: 900, deg: 90 },
      { kind:'str', len: 450 },
      { kind:'turn', dir:-1, r: 700, deg: 55 },
      { kind:'turn', dir: 1, r: 840, deg: 90 },
      { kind:'str', len: 600 },
      { kind:'turn', dir: 1, r: 700, deg: 50 },
      { kind:'turn', dir:-1, r: 750, deg: 50 },
      { kind:'str', len: 500 }
    ]}
  ];

  /* A lap that comes back to its starting heading still does not come back to
     its starting POINT, which is why the maps looked like rally stages rather
     than circuits. Closing it is a two-unknown problem: walk the lap, measure
     how far the end misses the start, then stretch or shrink the straights
     until the miss cancels — spread across EVERY straight, in the smallest
     change that does the job, so the layout keeps its character.

     The same pass also aims for a target LENGTH, because a lap is supposed to
     take a set number of seconds. Length pulls hard in the early passes and
     fades out, so the last passes are free to concentrate on shutting the
     loop; landing a hair off the target time beats leaving a visible gap.

     The final step is a uniform scale onto the exact target. Scaling a closed
     loop leaves it closed, so this costs nothing — but it scales the corner
     radii too, which is why the result is checked against the car's tightest
     possible circle afterwards. Solved once per track and cached. */
  /* `pace` is how many world units a clean lap covers per second — measured
     from a real driven lap, not guessed. targetSecs x pace is the length the
     solver aims for, which is how "this circuit should take 25 seconds" turns
     into an actual circuit. */
  var _closed = {};
  function closedLap(t) {
    if (_closed[t]) return _closed[t];
    var def = TRACKS[t].lap, i;
    var targetLen = TRACKS[t].targetSecs ? TRACKS[t].targetSecs * TRACKS[t].pace : 0;

    function walk(lens, radii) {
      var h = 0, x = 0, y = 0, straights = [], STEP = 8;
      for (var j = 0; j < def.length; j++) {
        var seg = def[j];
        if (seg.kind === 'str') {
          straights.push({ i: j, s: Math.sin(h), c: Math.cos(h) });
          x += Math.sin(h) * lens[j]; y += Math.cos(h) * lens[j];
        } else {
          var sg = radii ? { kind: 'turn', dir: seg.dir, r: radii[j], deg: seg.deg } : seg;
          var total = segLength(sg);
          for (var u = 0; u < total; u += STEP) {
            var k = segCurvature(sg, u + STEP * 0.5);
            h += k * STEP * 0.5;
            x += Math.sin(h) * STEP; y += Math.cos(h) * STEP;
            h += k * STEP * 0.5;
          }
        }
      }
      return { x: x, y: y, straights: straights };
    }

    var lens = [];
    for (i = 0; i < def.length; i++) lens[i] = def[i].kind === 'str' ? def[i].len : 0;

    var turnLen = 0;
    for (i = 0; i < def.length; i++) if (def[i].kind === 'turn') turnLen += segLength(def[i]);

    var PASSES = 40;
    for (var pass = 0; pass < PASSES; pass++) {
      var anneal = Math.max(0, 1 - pass / (PASSES * 0.6));
      if (targetLen && anneal > 0) {
        var straightNow = 0;
        for (i = 0; i < lens.length; i++) straightNow += lens[i];
        var want = targetLen - turnLen;
        if (straightNow > 1 && want > 0) {
          var kk = 1 + (want / straightNow - 1) * anneal;
          for (i = 0; i < lens.length; i++) {
            if (def[i].kind === 'str') lens[i] = Math.max(130, lens[i] * kk);
          }
        }
      }

      var w = walk(lens);
      if (Math.sqrt(w.x * w.x + w.y * w.y) < 0.5) break;
      var ss = 0, sc = 0, cc = 0, A;
      for (i = 0; i < w.straights.length; i++) {
        A = w.straights[i]; ss += A.s * A.s; sc += A.s * A.c; cc += A.c * A.c;
      }
      var det = ss * cc - sc * sc;
      if (Math.abs(det) < 1e-6) break;
      var u2 = (-w.x * cc + w.y * sc) / det;
      var v2 = (-w.y * ss + w.x * sc) / det;
      for (i = 0; i < w.straights.length; i++) {
        A = w.straights[i];
        lens[A.i] = Math.max(130, lens[A.i] + A.s * u2 + A.c * v2);
      }
    }

    var out = [];
    for (i = 0; i < def.length; i++) {
      out[i] = def[i].kind === 'str'
        ? { kind: 'str', len: lens[i] }
        : { kind: 'turn', dir: def[i].dir, r: def[i].r, deg: def[i].deg, hairpin: !!def[i].hairpin };
    }

    if (targetLen) {
      var now = 0;
      for (i = 0; i < out.length; i++) now += segLength(out[i]);
      var s2 = targetLen / now;
      for (i = 0; i < out.length; i++) {
        if (out[i].kind === 'str') out[i].len *= s2; else out[i].r *= s2;
      }
    }

    _closed[t] = out;
    return out;
  }

  var curTrack = 2;
  function LAP() { return closedLap(curTrack); }
  function trackList() { return TRACKS; }
  function currentTrack() { return curTrack; }
  function setTrack(i) {
    curTrack = Math.max(0, Math.min(TRACKS.length - 1, i | 0));
    _lapLen = 0;
    reset();
  }

  var INTRO_LEN = 1100;      // run-up before the start line

  // One lap is the whole LAP list once. Computed on demand, then remembered.
  var _lapLen = 0;
  function lapLength() {
    if (!_lapLen) { var L = LAP(); for (var i = 0; i < L.length; i++) _lapLen += segLength(L[i]); }
    return _lapLen;
  }

  // One lap's shape, walked once and cached, for the minimap. Normalised into
  // a unit box with the arc length kept alongside so a car can be placed on it.
  var _outline = {};
  function lapOutline(which) {
    var t = (which === undefined) ? curTrack : which;
    if (_outline[t]) return _outline[t];
    var lapDef = closedLap(t);
    var pts = [], x = 0, y = 0, h = 0, s = 0, STEP = 30;
    for (var i = 0; i < lapDef.length; i++) {
      var seg = lapDef[i], len = segLength(seg);
      // NOT `t`: that is the track index this result gets cached under, and
      // reusing it here quietly cached every outline under a distance instead,
      // so the minimap rebuilt the whole lap on every single frame.
      for (var u = 0; u < len; u += STEP) {
        var k = segCurvature(seg, u + STEP * 0.5);
        h += k * STEP * 0.5;
        x += Math.sin(h) * STEP; y += Math.cos(h) * STEP;
        h += k * STEP * 0.5;
        s += STEP;
        pts.push({ x: x, y: y, s: s });
      }
    }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, j;
    for (j = 0; j < pts.length; j++) {
      if (pts[j].x < minX) minX = pts[j].x;
      if (pts[j].x > maxX) maxX = pts[j].x;
      if (pts[j].y < minY) minY = pts[j].y;
      if (pts[j].y > maxY) maxY = pts[j].y;
    }
    var span = Math.max(maxX - minX, maxY - minY) || 1;
    var total = s;
    for (j = 0; j < pts.length; j++) {
      pts[j].nx = (pts[j].x - (minX + maxX) / 2) / span + 0.5;
      pts[j].ny = (pts[j].y - (minY + maxY) / 2) / span + 0.5;
      pts[j].f = pts[j].s / total;
    }
    _outline[t] = pts;
    return pts;
  }

  /* Boost pickups. There is now a fixed, hand-placed set per circuit — four
     plus a big one on the Ring, five plus one on the Maze, six plus one on the
     Grand — and the same set comes round every lap from lap one. Scattering
     them randomly made boost something that happened TO you; a fixed set makes
     their positions part of the racing line, so learning where they are is
     worth something. */
  var PICK_SMALL = 0.20, PICK_BIG = 0.55;
  var picks = [], pickGenLap = 0, pickIdx = 0;

  // Where each corner and straight sits along one lap, measured in arc length
  // from the start line. Built once per track.
  var _segTable = {};
  function lapSegTable(t) {
    if (_segTable[t]) return _segTable[t];
    var L = closedLap(t), tab = [], s = 0;
    for (var i = 0; i < L.length; i++) {
      var len = segLength(L[i]);
      tab.push({ s0: s, s1: s + len, len: len,
                 turn: L[i].kind === 'turn', dir: L[i].dir || 0,
                 r: L[i].r || 0, hairpin: !!L[i].hairpin });
      s += len;
    }
    tab.total = s;
    _segTable[t] = tab;
    return tab;
  }

  var _plan = {};
  function pickPlan(t) {
    if (_plan[t]) return _plan[t];
    var tab = lapSegTable(t), L = tab.total;
    var n = TRACKS[t].picks || 5;
    var list = [], i, j;

    function segAtLap(s) {
      s = s - Math.floor(s / L) * L;
      for (var q = 0; q < tab.length; q++) if (s >= tab[q].s0 && s < tab[q].s1) return tab[q];
      return tab[tab.length - 1];
    }

    // Spread evenly round the lap, then slid to the straightest spot nearby.
    // A pickup buried mid-corner is not a choice — you are already using all
    // the road. On a straight, crossing for it costs you your entry line.
    for (i = 0; i < n; i++) {
      var want = L * (i + 0.5) / n;
      var win = L / (3 * n), best = want, bestK = 1e9;
      for (j = -win; j <= win; j += 30) {
        var g = segAtLap(want + j);
        var k = g.turn ? 1 / g.r : 0;
        if (k < bestK - 1e-9) { bestK = k; best = want + j; }
      }
      // Alternating sides, so collecting the lot means weaving across the road.
      list.push({ s: (best % L + L) % L, lat: (i % 2 ? 1 : -1) * 0.58,
                  val: PICK_SMALL, big: false });
    }

    // The big one guards the hairpin exit, on the inside, where the car is
    // still sliding wide. Taking it means giving up the easy line out of the
    // slowest corner on the track — which is the point.
    var hp = null;
    for (i = 0; i < tab.length; i++) if (tab[i].hairpin) { hp = tab[i]; break; }
    if (!hp) {
      hp = tab[0];
      for (i = 0; i < tab.length; i++) if (!tab[i].turn && tab[i].len > hp.len) hp = tab[i];
    }
    var bigS = (hp.s1 + 320) % L;

    // The big one is placed by the corner it guards, so it can land on top of
    // an evenly-spread small one. Two pickups you collect in the same instant
    // read as one, so shove the small one clear.
    var SEP = 700;
    for (i = 0; i < list.length; i++) {
      var d = list[i].s - bigS;
      if (d > L * 0.5) d -= L; else if (d < -L * 0.5) d += L;
      if (Math.abs(d) < SEP) {
        list[i].s = ((bigS + (d < 0 ? -SEP : SEP)) % L + L) % L;
      }
    }
    list.push({ s: bigS, lat: 0.82 * (hp.dir || 1), val: PICK_BIG, big: true });

    list.sort(function (a, b) { return a.s - b.s; });
    _plan[t] = list;
    return list;
  }

  function ensurePicks(sMax) {
    var plan = pickPlan(curTrack), L = lapLength(), i;
    while (INTRO_LEN + pickGenLap * L <= sMax) {
      var base = INTRO_LEN + pickGenLap * L;
      for (i = 0; i < plan.length; i++) {
        picks.push({ s: base + plan[i].s, lat: plan[i].lat, val: plan[i].val,
                     big: plan[i].big, taken: false, id: pickIdx++ });
      }
      pickGenLap++;
    }
  }

  function trimPicks(sMin) {
    while (picks.length && picks[0].s < sMin) picks.shift();
  }

  function pickList() { return picks; }

  function resetPicks() { picks = []; pickGenLap = 0; pickIdx = 0; }

  // A pickup floats above the tarmac, bobbing and turning.
  function drawPicks(ctx, view, time) {
    ensurePicks(view.carS + LOOKAHEAD);
    var p = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
    for (var i = 0; i < picks.length; i++) {
      var k = picks[i];
      if (k.taken) continue;
      if (k.s < view.carS - 200 || k.s > view.carS + LOOKAHEAD) continue;
      var idx = indexAt(k.s);
      var hh = ch[idx], nx = Math.cos(hh), ny = -Math.sin(hh);
      var off = k.lat * widthAtIndex(idx);
      var bob = 34 + Math.sin(time * 2.6 + k.id) * 9;
      project3(cx[idx] + nx * off, cy[idx] + ny * off, bob, view, p);
      if (!p.vis) continue;
      var r = 34 * p.sc;
      if (r < 2.5) continue;

      // A beam up from the tarmac, so it is obvious from a long way back.
      var gp = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
      project3(cx[idx] + nx * off, cy[idx] + ny * off, 0, view, gp);
      if (gp.vis) {
        var bw = Math.max(2, 15 * p.sc);
        var bg = ctx.createLinearGradient(0, gp.y, 0, p.y - r);
        bg.addColorStop(0, k.big ? 'rgba(255,123,224,0.00)' : 'rgba(255,178,77,0.00)');
        bg.addColorStop(1, k.big ? 'rgba(255,168,238,0.40)' : 'rgba(255,215,106,0.38)');
        ctx.fillStyle = bg;
        ctx.fillRect(gp.x - bw * 0.5, p.y - r, bw, gp.y - (p.y - r));
      }

      var spin = time * 2.2 + k.id;
      ctx.save();
      ctx.translate(p.x, p.y);

      ctx.globalAlpha = k.big ? 0.42 : 0.30;
      ctx.beginPath();
      ctx.arc(0, 0, r * (k.big ? 2.0 : 1.5), 0, Math.PI * 2);
      ctx.fillStyle = k.big ? '#ff7be0' : '#ffb24d';
      ctx.fill();
      ctx.globalAlpha = 1;
      if (k.big) { ctx.scale(1.35, 1.35); }

      // A chevron that turns on the spot, squashed to fake the rotation.
      ctx.scale(Math.max(0.22, Math.abs(Math.cos(spin))), 1);
      ctx.beginPath();
      ctx.moveTo(-r * 0.62, r * 0.42);
      ctx.lineTo(0, -r * 0.52);
      ctx.lineTo(r * 0.62, r * 0.42);
      ctx.lineTo(0, r * 0.06);
      ctx.closePath();
      ctx.fillStyle = k.big ? '#ffa8ee' : '#ffd76a';
      ctx.strokeStyle = k.big ? '#ffe6fb' : '#fff3cf';
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Centreline, sampled every SAMPLE units. Uniform spacing means arc length
  // converts to an array index by division — no searching.
  var cx, cy, ch, ck, chw, cmx, hwFilled, mxFilled, baseS;
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
    return inIntro ? { kind: 'str', len: INTRO_LEN } : LAP()[genIndex];
  }

  // `carry` is however far the last sample overshot the end of the previous
  // segment. Throwing it away used to cost up to 8 units of arc per segment,
  // which over a lap of thirty segments walked the circuit a hundred units
  // off its own start. Carrying it forward keeps the loop shut.
  function advanceSeg(carry) {
    carry = carry || 0;
    if (inIntro) { inIntro = false; genIndex = 0; }
    else {
      genIndex++;
      if (genIndex >= LAP().length) { genIndex = 0; lapNo++; }
    }
    genT = carry;
    var seg = currentSeg();
    segs.push({
      s0: genS - carry, s1: genS - carry + segLength(seg),
      turn: seg.kind === 'turn',
      dir: seg.dir || 0,
      r: seg.r || 0,
      hairpin: !!seg.hairpin
    });
  }

  function ensure(sMax) {
    while (genS < sMax) {
      var seg = currentSeg();
      if (genT >= segLength(seg)) { advanceSeg(genT - segLength(seg)); seg = currentSeg(); }

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

  // Width is built in two passes. First a rolling MAXIMUM, which is what
  // stops the road nipping in where two opposite corners meet: curvature
  // passes through zero there for an instant, and an average gets dragged
  // down by exactly the dip it is supposed to fill. Then a blur over the
  // maximum, which takes the corners off it so the width glides.
  var BLUR_WIN = 16;

  var KER = null, KSUM = 0;
  function kernel() {
    if (KER) return KER;
    KER = [];
    for (var t = -BLUR_WIN; t <= BLUR_WIN; t++) {
      var w = 0.5 + 0.5 * Math.cos(Math.PI * t / (BLUR_WIN + 1));
      KER.push(w); KSUM += w;
    }
    return KER;
  }

  function rawWidth(i) {
    return BASE_HW + CORNER_EXTRA * Math.min(1, Math.abs(ck[i]) / TIGHTEST_K);
  }

  // Each pass lags the one before it, because each needs to see both sides of
  // the point it is filling in. Geometry always runs far enough ahead of both.
  function ensureWidths() {
    var lastMax = ck.length - 1 - WIDEN_WIN;
    var i, t, j;
    while (mxFilled <= lastMax) {
      i = mxFilled;
      var m = 0;
      for (j = Math.max(0, i - WIDEN_WIN); j <= Math.min(ck.length - 1, i + WIDEN_WIN); j++) {
        var r = rawWidth(j);
        if (r > m) m = r;
      }
      cmx[i] = m;
      mxFilled++;
    }

    var K = kernel();
    var lastBlur = mxFilled - 1 - BLUR_WIN;
    while (hwFilled <= lastBlur) {
      i = hwFilled;
      var acc = 0, wsum = 0;
      for (t = -BLUR_WIN; t <= BLUR_WIN; t++) {
        j = i + t;
        if (j < 0 || j >= mxFilled) continue;
        var w2 = K[t + BLUR_WIN];
        acc += cmx[j] * w2; wsum += w2;
      }
      chw[i] = wsum > 0 ? acc / wsum : BASE_HW;
      hwFilled++;
    }
  }

  function widthAtIndex(i) {
    ensureWidths();
    var w = chw[i];
    return w === undefined ? BASE_HW : w;
  }

  function reset() {
    cx = [0]; cy = [0]; ch = [0]; ck = [0]; chw = []; cmx = [];
    hwFilled = 0; mxFilled = 0;
    baseS = 0;
    segs = [{ s0: 0, s1: INTRO_LEN, turn: false, dir: 0, r: 0, hairpin: false }];
    genX = 0; genY = 0; genH = 0; genS = 0;
    genIndex = -1; genT = 0; inIntro = true; lapNo = 0;
    resetPicks();
    ensure(9000);
  }

  function trim(sMin) {
    var drop = Math.floor((sMin - baseS) / SAMPLE);
    if (drop > 2000) {
      cx.splice(0, drop); cy.splice(0, drop); ch.splice(0, drop); ck.splice(0, drop);
      chw.splice(0, drop); cmx.splice(0, drop);
      hwFilled = Math.max(0, hwFilled - drop);
      mxFilled = Math.max(0, mxFilled - drop);
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

  function halfWidthAt(s) { ensure(s + SAMPLE * (4 + WIDEN_WIN + BLUR_WIN)); return widthAtIndex(indexAt(s)); }

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
  var _loc = { s: 0, dev: 0, h: 0, k: 0, i: 0, hw: 0, px: 0, py: 0, nx: 0, ny: 0 };
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
    out.hw = widthAtIndex(best);
    out.px = cx[best]; out.py = cy[best];
    out.nx = cs; out.ny = -sn;            // unit normal, pointing right
    out.dev = ex * cs - ey * sn;          // + is right of the centreline
    out.s = baseS + best * SAMPLE + (ex * sn + ey * cs);
    return out;
  }

  // --------------------------------------------------------------- projection

  var CAM_LIFT = K / FOCAL;      // how high the camera rides above the tarmac

  var _p = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
  function project(wx, wy, view, out) { return project3(wx, wy, 0, view, out); }

  // Same projection, but a point may now be ABOVE the ground. Everything the
  // camera sees is this far below it: (CAM_LIFT - height).
  function project3(wx, wy, wz, view, out) {
    out = out || _p;
    var dx = wx - view.camX, dy = wy - view.camY;
    var rz = dx * view.camSin + dy * view.camCos;
    out.rz = rz;
    if (rz < NEAR) { out.vis = false; return out; }
    var sc = FOCAL / rz;
    out.sc = sc;
    out.x = view.W * 0.5 + (dx * view.camCos - dy * view.camSin) * sc;
    out.y = HORIZON_Y + (CAM_LIFT - wz) * sc;
    out.vis = true;
    return out;
  }

  // ------------------------------------------------------------------ drawing

  var skyGrad = null, groundGrad = null, fogGrad = null;

  var stars = null;
  function makeStars() {
    if (stars) return stars;
    stars = [];
    var seed = 20260914;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    for (var i = 0; i < 150; i++) {
      stars.push({
        bearing: rnd() * Math.PI * 2,
        y: 18 + rnd() * rnd() * (HORIZON_Y - 46),   // clustered up high
        r: 0.7 + rnd() * 1.5,
        a: 0.25 + rnd() * 0.6
      });
    }
    return stars;
  }

  function drawStars(ctx, view) {
    var st = makeStars(), W = view.W;
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < st.length; i++) {
      var s2 = st[i];
      var rel = s2.bearing - view.camAngle;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      if (Math.abs(rel) > 1.15) continue;
      var x = W * 0.5 + Math.tan(rel) * FOCAL;
      if (x < -20 || x > W + 20) continue;
      // fade out near the horizon so they do not sit on the skyline
      var f = Math.min(1, (HORIZON_Y - s2.y) / 90);
      ctx.globalAlpha = s2.a * f;
      ctx.fillRect(x - s2.r, s2.y - s2.r, s2.r * 2, s2.r * 2);
    }
    ctx.globalAlpha = 1;
  }

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

    drawStars(ctx, view);
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
    var r = 210;

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
    var W = view.W, G = 200, R = 3400;
    var gx0 = Math.floor((view.camX - R) / G) * G;
    var gy0 = Math.floor((view.camY - R) / G) * G;
    var g;

    ctx.strokeStyle = 'rgba(168,124,248,0.20)';
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
  var NEARC = NEAR + 0.5;

  // Slide a lateral offset in toward the road's centre, just far enough that
  // the point sits in front of the near plane. Already in front: unchanged.
  function clampOff(off, rzC, rzN) {
    if (rzC + rzN * off >= NEARC) return off;
    if (Math.abs(rzN) < 1e-6) return off;
    var o = (NEARC - rzC) / rzN;
    if (off > 0) return o < off ? Math.max(0, o) : off;
    return o > off ? Math.min(0, o) : off;
  }

  function buildRibbon(view) {
    var out = ribPool, n = 0;
    var sStart = view.carS - CAM_BACK - 110;
    var sEnd = view.carS + LOOKAHEAD;
    ensure(sEnd + 200 + (WIDEN_WIN + BLUR_WIN) * SAMPLE);

    var pL = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
    var pR = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
    var pC = { x: 0, y: 0, sc: 0, rz: 0, vis: false };
    var pA = { x: 0, y: 0, sc: 0, rz: 0, vis: false };

    var s = sStart;
    while (s <= sEnd) {
      var i = indexAt(s);
      var h = ch[i], sn = Math.sin(h), cs = Math.cos(h);
      var nx = cs, ny = -sn;                       // unit normal, pointing right
      var hw = widthAtIndex(i);

      // How far in front of the camera this slice of road is, and how that
      // changes as you move across it. Right beside the camera the road is
      // wider than the near plane is deep, so while you are sideways-on ONE
      // edge can fall behind it with the other still well in front.
      var rzC = (cx[i] - view.camX) * view.camSin + (cy[i] - view.camY) * view.camCos;
      var rzN = nx * view.camSin + ny * view.camCos;

      var e = out[n];
      if (!e) {
        e = out[n] = { s: 0, ok: false, lx: 0, ly: 0, rx: 0, ry: 0, sc: 0, rz: 0, hw: 0,
                       oL: 0, oR: 0,
                       okW: false, wlx: 0, wly: 0, wlsc: 0, wrx: 0, wry: 0, wrsc: 0 };
      }
      e.s = s; e.hw = hw; e.rz = rzC;

      if (rzC < NEARC) {
        e.ok = false; e.okW = false; e.sc = 0;
      } else {
        // Throwing the whole slice away when one edge went behind the near
        // plane tore a wedge out of the road and the barrier right next to
        // you, every time you got properly sideways. Slide the offending edge
        // in to the near plane instead, and remember where it ended up so the
        // markings still land in the right place.
        var oL = clampOff(-hw, rzC, rzN), oR = clampOff(hw, rzC, rzN);
        e.oL = oL; e.oR = oR;
        project(cx[i] + nx * oL, cy[i] + ny * oL, view, pL);
        project(cx[i] + nx * oR, cy[i] + ny * oR, view, pR);
        project(cx[i], cy[i], view, pC);
        e.ok = pL.vis && pR.vis;
        e.lx = pL.x; e.ly = pL.y; e.rx = pR.x; e.ry = pR.y;
        e.sc = pC.sc; e.rz = pC.rz;

        // The foot of each barrier. Its top is the same world point lifted by
        // WALL_H, and lifting a point does not move it sideways on screen, so
        // the top is just (x, y - WALL_H * sc) — no second projection needed.
        var wo = hw + WALL_OFF;
        var wL = clampOff(-wo, rzC, rzN), wR = clampOff(wo, rzC, rzN);
        project(cx[i] + nx * wL, cy[i] + ny * wL, view, pA);
        var okL = pA.vis; e.wlx = pA.x; e.wly = pA.y; e.wlsc = pA.sc;
        project(cx[i] + nx * wR, cy[i] + ny * wR, view, pA);
        e.okW = okL && pA.vis; e.wrx = pA.x; e.wry = pA.y; e.wrsc = pA.sc;
      }
      n++;
      var ahead = s - view.carS;
      s += ahead < 400 ? 10 : (ahead < 1100 ? 26 : 52);
    }
    out.count = n;
    return out;
  }

  // Each piece of road is its own closed shape in one path, so a corner that
  // folds back over itself just overlaps instead of filling in its own middle.
  // A band down the road, described in WORLD units so it keeps its real width
  // wherever the road is wide or narrow. Each edge of the band is given as
  // (k, c): k is -1 at the left edge, 0 at the centre, +1 at the right edge,
  // and c is a fixed offset in world units on top of that. So the white line
  // is (-1, -3) to (-1, +3): three units either side of the left edge, always.
  function quads(ctx, rib, kA, cA, kB, cB, maxSc, clampSc) {
    for (var i = 0; i < rib.count - 1; i++) {
      var a = rib[i], b = rib[i + 1];
      if (!a.ok || !b.ok) continue;
      // Right under the camera the road is magnified enormously, so anything
      // drawn as an overlay there swamps the screen. Callers that only want
      // the readable part pass a scale ceiling.
      if (maxSc && a.sc > maxSc) continue;
      // A gentler version of the same guard, for markings that must not just
      // stop: past clampSc the band's world width is wound down in step with
      // the magnification, so it holds a steady width on screen instead of
      // growing into a wedge. No hard edge, because the scaling starts at 1.
      var ka = 1, kb = 1;
      if (clampSc) {
        if (a.sc > clampSc) ka = clampSc / a.sc;
        if (b.sc > clampSc) kb = clampSc / b.sc;
      }
      // Fractions along the stored edge points, which are not always the road
      // edges themselves — see the near-plane slide in buildRibbon.
      var aw = a.oR - a.oL, bw = b.oR - b.oL;
      var fa1 = (kA * a.hw + cA * ka - a.oL) / aw, fa2 = (kB * a.hw + cB * ka - a.oL) / aw;
      var fb1 = (kA * b.hw + cA * kb - b.oL) / bw, fb2 = (kB * b.hw + cB * kb - b.oL) / bw;
      var ax1 = a.lx + (a.rx - a.lx) * fa1, ay1 = a.ly + (a.ry - a.ly) * fa1;
      var ax2 = a.lx + (a.rx - a.lx) * fa2, ay2 = a.ly + (a.ry - a.ly) * fa2;
      var bx1 = b.lx + (b.rx - b.lx) * fb1, by1 = b.ly + (b.ry - b.ly) * fb1;
      var bx2 = b.lx + (b.rx - b.lx) * fb2, by2 = b.ly + (b.ry - b.ly) * fb2;
      ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2);
      ctx.lineTo(bx2, by2); ctx.lineTo(bx1, by1);
      ctx.closePath();
    }
  }

  /* --------------------------------- WALLS ---------------------------------
     A solid barrier down both edges, so a crash is something you can SEE
     yourself hit rather than an invisible stop. Each panel is a vertical
     quad standing on the ribbon's wall foot; because raising a point does
     not move it sideways on screen, the top edge is the foot's x with its y
     lifted by WALL_H * scale.

     Walls are painted BEFORE the road surface. On a hairpin, where the far
     side of the circuit folds back over the near side, that makes the near
     tarmac cover the distant barrier instead of the barrier hanging in
     mid-air over the road in front of you. */

  // A horizontal band of the barrier, given as fractions of its height:
  // 0 is the tarmac, 1 is the top rail. sFrom/sTo limit it to a stretch of
  // road, which is how an impact lights up only the panels you hit.
  function wallStrip(ctx, rib, side, f0, f1, sFrom, sTo) {
    for (var i = 0; i < rib.count - 1; i++) {
      var a = rib[i], b = rib[i + 1];
      if (!a.okW || !b.okW) continue;
      if (sFrom !== undefined && (b.s < sFrom || a.s > sTo)) continue;
      var ax, ay, asc, bx, by, bsc;
      if (side < 0) { ax = a.wlx; ay = a.wly; asc = a.wlsc; bx = b.wlx; by = b.wly; bsc = b.wlsc; }
      else          { ax = a.wrx; ay = a.wry; asc = a.wrsc; bx = b.wrx; by = b.wry; bsc = b.wrsc; }
      var ah = WALL_H * asc, bh = WALL_H * bsc;
      ctx.moveTo(ax, ay - ah * f0);
      ctx.lineTo(ax, ay - ah * f1);
      ctx.lineTo(bx, by - bh * f1);
      ctx.lineTo(bx, by - bh * f0);
      ctx.closePath();
    }
  }

  // Alternate panels, so the barrier streams past at speed instead of
  // reading as one long smear.
  function wallStripes(ctx, rib, side, f0, f1) {
    var BLOCK = 240;
    for (var i = 0; i < rib.count - 1; i++) {
      var a = rib[i], b = rib[i + 1];
      if (!a.okW || !b.okW) continue;
      var ms = (a.s + b.s) * 0.5;
      if (Math.floor(ms / BLOCK) % 2) continue;
      var ax, ay, asc, bx, by, bsc;
      if (side < 0) { ax = a.wlx; ay = a.wly; asc = a.wlsc; bx = b.wlx; by = b.wly; bsc = b.wlsc; }
      else          { ax = a.wrx; ay = a.wry; asc = a.wrsc; bx = b.wrx; by = b.wry; bsc = b.wrsc; }
      var ah = WALL_H * asc, bh = WALL_H * bsc;
      ctx.moveTo(ax, ay - ah * f0);
      ctx.lineTo(ax, ay - ah * f1);
      ctx.lineTo(bx, by - bh * f1);
      ctx.lineTo(bx, by - bh * f0);
      ctx.closePath();
    }
  }

  function drawWalls(ctx, rib) {
    var side;
    for (side = -1; side <= 1; side += 2) {
      // Solid face. It has to sit clearly lighter than the ground behind it,
      // or a wall in the dark is just more dark — and then a crash still has
      // nothing visible to hit.
      ctx.beginPath(); wallStrip(ctx, rib, side, 0, 1);
      ctx.fillStyle = '#241541'; ctx.fill();
      ctx.beginPath(); wallStrip(ctx, rib, side, 0.42, 1);
      ctx.fillStyle = '#35205e'; ctx.fill();
      // A dark skirt along the bottom so the barrier looks planted on the
      // tarmac rather than floating over it.
      ctx.beginPath(); wallStrip(ctx, rib, side, 0, 0.16);
      ctx.fillStyle = '#0e0820'; ctx.fill();

      ctx.beginPath(); wallStripes(ctx, rib, side, 0.20, 0.82);
      ctx.fillStyle = 'rgba(255,74,206,0.32)'; ctx.fill();

      // Neon top rail, with a soft spill above and below it.
      ctx.beginPath(); wallStrip(ctx, rib, side, 0.62, 1.28);
      ctx.fillStyle = 'rgba(34,230,255,0.10)'; ctx.fill();
      ctx.beginPath(); wallStrip(ctx, rib, side, 0.86, 1.02);
      ctx.fillStyle = '#22e6ff'; ctx.fill();
      ctx.beginPath(); wallStrip(ctx, rib, side, 0.93, 0.99);
      ctx.fillStyle = 'rgba(240,252,255,0.9)'; ctx.fill();
    }

    // Where the car just hit, the barrier is left glowing for a moment, so
    // you can look back and see exactly where it went wrong.
    var hits = (DR.FX && DR.FX.wallHits) ? DR.FX.wallHits() : null;
    if (!hits || !hits.length) return;
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      var k = 1 - h.t / h.dur;
      if (k <= 0) continue;
      var span = 150 + 260 * (1 - k);
      ctx.globalAlpha = k * 0.85;
      ctx.beginPath();
      wallStrip(ctx, rib, h.side, 0, 1.05, h.s - span, h.s + span);
      ctx.fillStyle = '#ff7a45'; ctx.fill();
      ctx.globalAlpha = k;
      ctx.beginPath();
      wallStrip(ctx, rib, h.side, 0.80, 1.06, h.s - span * 0.6, h.s + span * 0.6);
      ctx.fillStyle = '#ffe7c4'; ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Scale ceiling for road markings. Beyond it a marking holds a fixed width
  // on screen (EDGE_MAX_SC x its world width in pixels) rather than growing
  // with the magnification. The bottom of the screen on a straight sits at
  // about 4, so at 3.2 normal driving barely notices; what it stops is the
  // half-screen wedge of cyan you got by ending up sideways against an edge.
  var EDGE_MAX_SC = 3.2;

  function draw(ctx, view) {
    var rib = buildRibbon(view);

    drawWalls(ctx, rib);

    ctx.beginPath();
    quads(ctx, rib, -1, 0, 1, 0);
    ctx.fillStyle = '#100d20';
    ctx.fill();

    drawLaneDashes(ctx, rib);

    // Neon spill, then the bright core, then a thin white line for contrast.
    // Everything here is a fixed width in WORLD units, so a metre of neon a
    // few metres from the lens is hundreds of pixels across. Capped, or
    // getting sideways next to an edge paints half the screen cyan.
    for (var side = -1; side <= 1; side += 2) {
      ctx.beginPath(); quads(ctx, rib, side, -50, side, 50, 0, EDGE_MAX_SC);
      ctx.fillStyle = 'rgba(34,230,255,0.07)'; ctx.fill();
      ctx.beginPath(); quads(ctx, rib, side, -24, side, 24, 0, EDGE_MAX_SC);
      ctx.fillStyle = 'rgba(34,230,255,0.13)'; ctx.fill();
      ctx.beginPath(); quads(ctx, rib, side, -10, side, 10, 0, EDGE_MAX_SC);
      ctx.fillStyle = '#22e6ff'; ctx.fill();
      ctx.beginPath(); quads(ctx, rib, side, -3, side, 3, 0, EDGE_MAX_SC);
      ctx.fillStyle = 'rgba(240,252,255,0.92)'; ctx.fill();
    }

    return rib;
  }

  function drawLaneDashes(ctx, rib) {
    var period = 132, DASH = 66;
    ctx.beginPath();
    for (var i = 0; i < rib.count - 1; i++) {
      var a = rib[i], b = rib[i + 1];
      if (!a.ok || !b.ok || a.sc < 0.07) continue;
      var ms = (a.s + b.s) * 0.5;
      if (ms - Math.floor(ms / period) * period > DASH) continue;
      var ka = a.sc > EDGE_MAX_SC ? EDGE_MAX_SC / a.sc : 1;
      var kb = b.sc > EDGE_MAX_SC ? EDGE_MAX_SC / b.sc : 1;
      for (var k = 0; k < 2; k++) {
        var kk = k === 0 ? -1 / 3 : 1 / 3;
        var aw = a.oR - a.oL, bw = b.oR - b.oL;
        var fa1 = (kk * a.hw - 7 * ka - a.oL) / aw, fa2 = (kk * a.hw + 7 * ka - a.oL) / aw;
        var fb1 = (kk * b.hw - 7 * kb - b.oL) / bw, fb2 = (kk * b.hw + 7 * kb - b.oL) / bw;
        var ax1 = a.lx + (a.rx - a.lx) * fa1, ay1 = a.ly + (a.ry - a.ly) * fa1;
        var ax2 = a.lx + (a.rx - a.lx) * fa2, ay2 = a.ly + (a.ry - a.ly) * fa2;
        var bx1 = b.lx + (b.rx - b.lx) * fb1, by1 = b.ly + (b.ry - b.ly) * fb1;
        var bx2 = b.lx + (b.rx - b.lx) * fb2, by2 = b.ly + (b.ry - b.ly) * fb2;
        ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2);
        ctx.lineTo(bx2, by2); ctx.lineTo(bx1, by1);
        ctx.closePath();
      }
    }
    ctx.fillStyle = 'rgba(255,74,206,0.88)';
    ctx.fill();
  }

  function drawChevron(ctx, x, y, sc, dir, alpha, doubled) {
    var fade = (sc - 0.17) / 0.13;
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
        // Bolted to the face of the barrier, the way real circuit signage is.
        // Flat on the ground they would simply be hidden behind the wall.
        var off = widthAtIndex(idx) + WALL_OFF - 1;
        var sz = WALL_H * 0.62;
        project3(cx[idx] - nx * off, cy[idx] - ny * off, sz, view, p);
        if (p.vis) drawChevron(ctx, p.x, p.y, p.sc, g.dir, a, g.hairpin);
        project3(cx[idx] + nx * off, cy[idx] + ny * off, sz, view, p);
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
    HALF_W: HALF_W, BASE_HW: BASE_HW, halfWidthAt: halfWidthAt, SAMPLE: SAMPLE,
    HORIZON_Y: HORIZON_Y, CAR_Y: CAR_Y, CAM_BACK: CAM_BACK,
    FOCAL: FOCAL, LOOKAHEAD: LOOKAHEAD, SC_CAR: SC_CAR, NEAR: NEAR,
    reset: reset, ensure: ensure, trim: trim,
    centreAt: centreAt, locate: locate, indexAt: indexAt,
    dirAt: dirAt, isHairpin: isHairpin, radiusAt: radiusAt,
    lengthGenerated: lengthGenerated,
    lapLength: lapLength, INTRO_LEN: INTRO_LEN, lapOutline: lapOutline,
    tracks: trackList, setTrack: setTrack, currentTrack: currentTrack,
    picks: pickList, ensurePicks: ensurePicks, trimPicks: trimPicks, drawPicks: drawPicks,
    project: project, project3: project3, CAM_LIFT: CAM_LIFT,
    buildRibbon: buildRibbon, quads: quads, drawWalls: drawWalls,
    WALL_H: WALL_H, WALL_OFF: WALL_OFF,
    drawBackground: drawBackground, draw: draw,
    drawChevrons: drawChevrons, drawFog: drawFog
  };
})(window.DR = window.DR || {});
