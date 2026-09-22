/* tutorial.js — the guided first run. A coach riding along, not a screen of
   instructions: it watches the road ahead and tells you, at the moment it
   matters, which side to press, how long to keep holding, and when to let
   go. Then it grades the corner you just drove and says what to fix.

   Two lessons, both taught by doing:
     1. CORNERS — nail three corners (hold the right side for most of the
        corner, let go as it straightens, stay off the walls).
     2. BOOST   — the meter is topped up, you fire it, then you watch a drift
        fill it back up.

   The timing comes straight from the racing line's own advice
   (Road.holdWindow), the same numbers Practice paints on the road, so the
   coach and the painted line can never disagree. game.js owns the car and
   the meter; this file only reads them and asks for things. */

(function (DR) {
  'use strict';

  var NEED = 3;              // corners to nail before the boost lesson
  var RELEASE_WINDOW = 0.35; // seconds after the corner to grade the let-go
  var READY_T = 1.5;         // seconds ahead a corner is announced
  var REFILL = 0.18;         // meter a drift must win back to finish lesson 2
  var PREVIEW = 500;         // how far ahead the coach aims, world units
  var DEAD = 0.1;            // slack before the coach changes its mind
  var COACH_TAU = 0.06;      // smoothing on the coach's advice, seconds
  var OFF_BAND = 0.62;       // share of the half-width you may stray off the line
  var PACE = 0.55;           // tutorial speed vs a race: time to read and react

  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  var stage = 'corners';     // corners | boost | refill | complete
  var nailed = 0, attempts = 0;
  var cur = null;            // the corner being graded
  var lastStart = -1e9;      // start of the last graded corner
  var verdict = null;        // { text, sub, good, t }
  var stageT = 0;            // seconds since the stage began
  var refillFrom = 0, refillFrac = 0;
  var clock = 0;
  var ema = 0;               // the coach's thumb, smoothed: -1 .. +1
  var advise = 0;            // what the screen says to hold: -1, 0, +1
  var display = { mode: 'straight', dir: 0, hold: 0, ready: 0, holding: false, nextIn: 99,
                  boostNow: false };

  function start() {
    stage = 'corners'; nailed = 0; attempts = 0; cur = null; lastStart = -1e9;
    verdict = null; stageT = 0; refillFrom = 0; refillFrac = 0; clock = 0;
    ema = 0; advise = 0;
  }

  function sideWord(dir) { return dir < 0 ? 'LEFT' : 'RIGHT'; }

  /* What a good driver's thumb would be doing right now: aim at a point on
     the racing line a little way ahead, work out how sideways the car needs
     to be to get there, and hold until it is. The same pursuit the test
     bots drive with, so "do what the coach says" is a line that is known to
     get round cleanly, in any car (it reads the car's own turning circle). */
  var _c = {};
  function coachSteer() {
    var Car = DR.Car, Road = DR.Road;
    var s = Car.roadS + PREVIEW;
    var c = Road.centreAt(s, _c);
    var off = Road.lineAt(s).off;
    var rx = c.x + Math.cos(c.h) * off - Car.x;
    var ry = c.y - Math.sin(c.h) * off - Car.y;
    var sn = Math.sin(Car.h), cs = Math.cos(Car.h);
    var ey = rx * cs - ry * sn, ex = rx * sn + ry * cs;
    var L2 = ex * ex + ey * ey;
    var kappa = L2 > 1 ? 2 * ey / L2 : 0;
    var want = Math.asin(Math.max(-1, Math.min(1, kappa * Car.minRadius() * Math.sin(Car.SLIP_AT_LIMIT))));
    var err = want - Car.cmdSlip;
    return err > DEAD ? 1 : (err < -DEAD ? -1 : 0);
  }

  // Signed distance off the racing line at the car: + is toward the OUTSIDE
  // of a corner turning `dir` (running wide), - is cutting in.
  function wideness(dir) {
    var info = DR.Road.lineAt(DR.Car.roadS);
    return -(DR.Car.dev - info.off) * dir;
  }

  function grade(c, walls, wallSide) {
    attempts++;
    var hw = DR.Road.halfWidthAt(DR.Car.roadS);
    var hitWall = walls > c.walls;
    var v;
    // Judged on what happened, not on the exact rhythm of the thumb: there
    // are many good ways through a corner, and holding solid all the way
    // round is usually NOT one of them on a long sweeper.
    // The inside wall is on the side the corner turns toward. Judged from
    // the corner being taught, not the bend under the car, so a hit in the
    // run-in before the road starts turning still gets a real answer.
    var wide = hitWall ? wallSide === -c.dir : c.wide > OFF_BAND * hw;
    var tight = hitWall ? wallSide === c.dir : c.tight > OFF_BAND * hw;
    if (c.held < 0.12 && c.wrong < 0.12) {
      // Worded about the corner just gone, so it can't be mistaken for the
      // live cue above it, which may already be pointing the other way.
      v = { text: 'MISSED THAT ONE', sub: 'IT NEEDED A HOLD ON THE ' + sideWord(c.dir), good: false };
    } else if (c.wrong > c.held * 2 && (hitWall || wide || tight)) {
      v = { text: 'OTHER SIDE', sub: 'HOLD THE SIDE THE ROAD TURNS TOWARD', good: false };
    } else if (wide) {
      v = { text: 'RAN WIDE', sub: 'HOLD SOONER, OR HOLD LONGER', good: false };
    } else if (tight) {
      v = { text: 'CUT IN', sub: 'EASE OFF SOONER \u2014 LET GO A LITTLE', good: false };
    } else if (hitWall) {
      v = { text: 'ALMOST', sub: 'GOOD \u2014 JUST MISS THE WALL', good: false };
    } else {
      nailed++;
      v = { text: 'NICE!', sub: nailed < NEED ? (NEED - nailed) + ' MORE' : 'CORNERS: DONE', good: true };
    }
    // Only lesson 1 gets a verdict on screen; after that the coach still
    // points at corners but stays quiet about how you took them.
    if (stage === 'corners') { v.t = 0; verdict = v; }
  }

  /* Once a frame, while the tutorial is on the road.
     g: { s, steer, speed, walls (running wall-hit count), wallSide (-1/+1,
          which side of the road the last hit was on), meter, boosted
          (fired this frame) }
     Returns { fillMeter, finished }. */
  var _res = { fillMeter: false, finished: false };
  function nextWindow(s) {
    var w = DR.Road.holdWindow(s, 4000);
    // The run-up borrows the end of the lap's advice; there is no corner on
    // it to teach, so skip anything that starts before the road does.
    if (w && w.start < 100) w = DR.Road.holdWindow(Math.max(s, w.end) + 1, 4000);
    return w;
  }
  function update(dt, g) {
    clock += dt; stageT += dt;
    if (verdict) verdict.t += dt;
    _res.fillMeter = false; _res.finished = false;

    var w = nextWindow(g.s);
    var speed = Math.max(60, g.speed);

    // The coach's advice, smoothed and with a gap between "hold" and "let
    // go" so the words on screen change at a human pace, never flicker.
    var k = 1 - Math.exp(-dt / COACH_TAU);
    ema += (coachSteer() - ema) * k;
    if (advise === 0) { if (Math.abs(ema) > 0.55) advise = ema > 0 ? 1 : -1; }
    else if (ema * advise < 0.2) advise = Math.abs(ema) > 0.55 ? (ema > 0 ? 1 : -1) : 0;

    // Grade the corner you were in once the let-go has had its chance, or
    // straight away if the next corner is already starting (esses).
    if (cur) {
      if (g.walls > cur.walls && g.s < cur.end) {
        // Hitting the wall IS the verdict; say so while it's happening.
        lastStart = cur.start;
        grade(cur, g.walls, g.wallSide);
        cur = null;
      } else if (g.s < cur.end) {
        cur.total += dt;
        if (g.steer === cur.dir) cur.held += dt;
        else if (g.steer === -cur.dir) cur.wrong += dt;
        var wd = wideness(cur.dir);
        if (wd > cur.wide) cur.wide = wd;
        if (-wd > cur.tight) cur.tight = -wd;
      } else {
        cur.after += dt;
        if (g.steer !== cur.dir) cur.released = true;
        var nextBegun = w && w.start > cur.start + 1 && g.s >= w.start;
        if (cur.after >= RELEASE_WINDOW || nextBegun) {
          lastStart = cur.start;
          grade(cur, g.walls, g.wallSide);
          cur = null;
        }
      }
    }
    if (!cur && w && g.s >= w.start - 1 && g.s < w.end && Math.abs(w.start - lastStart) > 1) {
      cur = { dir: w.dir, start: w.start, end: w.end, held: 0, total: 0, wrong: 0,
              wide: 0, tight: 0, after: 0, released: false, walls: g.walls };
    }

    // What the screen should be saying right now.
    display.holding = g.steer !== 0;
    var inCorner = w && g.s >= w.start && g.s < w.end;
    display.hold = inCorner ? (w.end - g.s) / Math.max(1, w.end - w.start) : 0;
    display.nextIn = w ? (w.start - g.s) / speed : 99;
    // A good moment to boost: straight road under you and no corner for a
    // second.
    display.boostNow = !inCorner && DR.Road.dirAt(g.s) === 0 && display.nextIn > 1.0;
    if (advise !== 0) {
      display.mode = 'hold'; display.dir = advise;
    } else if (g.steer !== 0) {
      // Holding when the coach wouldn't: mid-corner that's easing off, on a
      // straight it's letting go.
      display.mode = inCorner ? 'ease' : 'letgo'; display.dir = g.steer;
    } else if (inCorner) {
      display.mode = 'wait'; display.dir = w.dir;
    } else if (w && display.nextIn < READY_T) {
      display.mode = 'ready'; display.dir = w.dir;
      display.ready = Math.max(0, display.nextIn);
    } else {
      display.mode = 'straight'; display.dir = 0;
    }

    // Lessons.
    if (stage === 'corners' && nailed >= NEED && (!verdict || verdict.t > 1.2)) {
      stage = 'boost'; stageT = 0; verdict = null;
    }
    if (stage === 'boost') {
      if (g.boosted) { stage = 'refill'; stageT = 0; refillFrom = g.meter; }
      else _res.fillMeter = true;
    } else if (stage === 'refill') {
      refillFrac = Math.max(0, Math.min(1, (g.meter - refillFrom) / REFILL));
      if (refillFrac >= 1 && stageT > 1.5) { stage = 'complete'; stageT = 0; }
    } else if (stage === 'complete') {
      if (stageT > 1.4) _res.finished = true;
    }
    return _res;
  }

  /* ------------------------------ drawing ------------------------------ */

  function outlined(ctx, text, x, y, size, weight, fill) {
    ctx.font = (weight || '800') + ' ' + size + 'px ' + FONT;
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.strokeStyle = 'rgba(4,2,10,0.9)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function arrow(ctx, x, y, dir, size, fill) {
    ctx.beginPath();
    ctx.moveTo(x - dir * size * 0.5, y - size * 0.7);
    ctx.lineTo(x + dir * size * 0.6, y);
    ctx.lineTo(x - dir * size * 0.5, y + size * 0.7);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4,2,10,0.85)';
    ctx.stroke();
  }

  // The half of the screen to press, lit, with a thumb (or a key) on it.
  // A slow, gentle breathe rather than a blink: never a flash.
  var PANEL_TOP = 430, PANEL_BOT = 1060, ICON_Y = 900;
  function drawSide(ctx, v, dir, strength, byKey, ready, holdingIt) {
    var x0 = dir < 0 ? 0 : v.W * 0.5, w = v.W * 0.5;
    var breathe = 0.5 + 0.5 * Math.sin(clock * Math.PI * 1.2);
    ctx.fillStyle = 'rgba(255,215,106,' + (strength * (0.12 + 0.04 * breathe)).toFixed(3) + ')';
    ctx.fillRect(x0, PANEL_TOP, w, PANEL_BOT - PANEL_TOP);
    ctx.fillStyle = 'rgba(255,215,106,' + (0.55 * strength).toFixed(3) + ')';
    ctx.fillRect(dir < 0 ? v.W * 0.5 - 3 : v.W * 0.5, PANEL_TOP, 3, PANEL_BOT - PANEL_TOP);

    var cx = x0 + w * 0.5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (byKey) {
      var k = 96;
      ctx.fillStyle = holdingIt ? 'rgba(255,215,106,0.9)' : 'rgba(18,14,34,0.88)';
      ctx.fillRect(cx - k / 2, ICON_Y - k / 2, k, k);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffd76a';
      ctx.strokeRect(cx - k / 2, ICON_Y - k / 2, k, k);
      arrow(ctx, cx, ICON_Y, dir, 38, holdingIt ? '#1a1024' : '#ffd76a');
    } else {
      ctx.beginPath();
      ctx.arc(cx, ICON_Y, 40, 0, Math.PI * 2);
      ctx.fillStyle = holdingIt ? 'rgba(255,215,106,0.9)' : 'rgba(18,14,34,0.8)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffd76a';
      ctx.stroke();
      arrow(ctx, cx, ICON_Y, dir, 30, holdingIt ? '#1a1024' : '#ffd76a');
    }
    // Before the corner, a ring closes in on the thumb and lands exactly as
    // it is time to press: the timing, shown rather than counted.
    if (ready !== null) {
      var r = 48 + 190 * Math.min(1, ready / READY_T);
      ctx.beginPath();
      ctx.arc(cx, ICON_Y, r, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,215,106,0.8)';
      ctx.stroke();
    }
    outlined(ctx, byKey ? (dir < 0 ? 'HOLD ←' : 'HOLD →') : 'HOLD HERE',
             cx, ICON_Y + 86, 30, '800', '#ffd76a');
  }

  // The hold meter: full as the corner starts, empty where you let go.
  function drawMeter(ctx, v, frac, label, y) {
    var bw = 440, bh = 20, bx = v.W * 0.5 - bw / 2;
    ctx.fillStyle = 'rgba(10,6,22,0.7)';
    ctx.fillRect(bx - 4, y - 4, bw + 8, bh + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, y, bw, bh);
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(bx, y, bw * Math.max(0, Math.min(1, frac)), bh);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlined(ctx, label, v.W * 0.5, y + bh + 26, 22, '700', 'rgba(214,234,248,0.95)');
  }

  function drawPips(ctx, v, y) {
    var gap = 44, x0 = v.W * 0.5 - gap * (NEED - 1) / 2 - 40;
    for (var i = 0; i < NEED; i++) {
      ctx.beginPath();
      ctx.arc(x0 + i * gap, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = i < nailed ? '#7dffb0' : 'rgba(10,6,22,0.7)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = i < nailed ? '#7dffb0' : 'rgba(190,214,235,0.6)';
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // The count in words too — the filled dots are not the only signal.
    outlined(ctx, Math.min(nailed, NEED) + ' / ' + NEED, x0 + NEED * gap - 8, y + 1, 24, '800', '#eaf6ff');
  }

  /* g: { byKey, boostBtn: {x,y,r}, meter, cost } */
  function draw(ctx, v, g) {
    var cx = v.W * 0.5, d = display;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var lesson = stage === 'corners' ? 'LESSON 1 OF 2 · CORNERS' : 'LESSON 2 OF 2 · BOOST';
    outlined(ctx, 'TUTORIAL', cx, 58, 22, '700', 'rgba(150,196,225,0.95)');
    outlined(ctx, lesson, cx, 96, 30, '800', '#eaf6ff');
    if (stage === 'corners') drawPips(ctx, v, 142);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var lit = stage === 'corners' ? 1 : 0.6;
    var cornerBar = d.hold > 0;
    if (stage === 'complete') {
      outlined(ctx, 'YOU’RE READY', cx, 300, 64, '800', '#7dffb0');
    } else if (d.mode === 'hold') {
      outlined(ctx, 'HOLD ' + sideWord(d.dir), cx, 222, 58, '800', '#ffd76a');
      drawSide(ctx, v, d.dir, lit, g.byKey, null, d.holding);
    } else if (d.mode === 'ease') {
      outlined(ctx, 'EASE OFF', cx, 222, 58, '800', '#7dffb0');
      outlined(ctx, 'LET GO FOR A MOMENT', cx, 272, 22, '700', 'rgba(214,234,248,0.95)');
      cornerBar = false;
    } else if (d.mode === 'letgo') {
      outlined(ctx, 'LET GO', cx, 222, 64, '800', '#7dffb0');
      outlined(ctx, 'THE ROAD IS STRAIGHT', cx, 272, 22, '700', 'rgba(214,234,248,0.95)');
    } else if (d.mode === 'wait') {
      outlined(ctx, 'NICE AND WIDE', cx, 222, 44, '800', '#eaf6ff');
      outlined(ctx, 'HOLD ' + sideWord(d.dir) + ' AGAIN WHEN IT SAYS', cx, 272, 22, '700', 'rgba(214,234,248,0.95)');
      cornerBar = false;
    } else if (d.mode === 'ready') {
      outlined(ctx, 'GET READY', cx, 222, 50, '800', '#eaf6ff');
      outlined(ctx, 'CORNER COMING — PRESS WHEN THE RING CLOSES', cx, 272, 22, '700', 'rgba(214,234,248,0.95)');
      drawSide(ctx, v, d.dir, lit * 0.6, g.byKey, d.ready, d.holding);
    } else if (stage === 'corners' || stage === 'refill') {
      outlined(ctx, 'HANDS OFF', cx, 222, 44, '800', 'rgba(214,234,248,0.9)');
      outlined(ctx, 'STRAIGHT ROAD — NO NEED TO PRESS', cx, 272, 22, '700', 'rgba(190,214,235,0.9)');
    }
    // How much of this corner is left, so you can feel where it ends.
    if (cornerBar && stage !== 'complete') drawMeter(ctx, v, d.hold, 'CORNER LEFT', 262);

    if (verdict && verdict.t < 1.8) {
      var a = Math.min(1, (1.8 - verdict.t) / 0.4);
      ctx.globalAlpha = a;
      outlined(ctx, verdict.text, cx, 372, verdict.good ? 60 : 46, '800', verdict.good ? '#7dffb0' : '#ffb08a');
      outlined(ctx, verdict.sub, cx, 418, 22, '700', 'rgba(228,242,252,0.95)');
      ctx.globalAlpha = 1;
    }

    if (stage === 'boost') {
      var b = g.boostBtn;
      var clear = d.boostNow;
      outlined(ctx, 'YOUR BOOST IS FULL', cx, 340, 40, '800', '#41e0ff');
      outlined(ctx, clear ? (g.byKey ? 'PRESS SPACE OR ↑ NOW' : 'TAP BOOST NOW')
                          : 'WAIT FOR A STRAIGHT, THEN BOOST',
               cx, 388, 26, '700', '#eaf6ff');
      // A ring round the real button, and an arrow down to it.
      var breathe = 0.5 + 0.5 * Math.sin(clock * Math.PI * 1.2);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 16 + 6 * breathe, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(65,224,255,0.9)';
      ctx.stroke();
      ctx.save();
      ctx.translate(b.x, b.y - b.r - 58);
      ctx.rotate(Math.PI / 2);
      arrow(ctx, 0, 0, 1, 34, '#41e0ff');
      ctx.restore();
    } else if (stage === 'refill') {
      outlined(ctx, 'DRIFTING REFILLS IT', cx, 340, 40, '800', '#41e0ff');
      drawMeter(ctx, v, refillFrac, 'DRIFT THROUGH A CORNER TO FILL THIS', 380);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  DR.Tutorial = {
    NEED: NEED,
    rescued: function () {
      cur = null;
      verdict = { text: 'BACK ON TRACK', sub: 'HOLDING TOO LONG SPINS YOU ROUND \u2014 LET GO SOONER',
                  good: false, t: 0 };
    },
    pace: function () { return PACE; },
    setPace: function (p) { PACE = p; },   // for tests and tuning
    tune: function (o) {
      if (o.preview !== undefined) PREVIEW = o.preview;
      if (o.dead !== undefined) DEAD = o.dead;
      if (o.tau !== undefined) COACH_TAU = o.tau;
    },
    start: start,
    update: update,
    draw: draw,
    state: function () {
      return { stage: stage, nailed: nailed, attempts: attempts,
               verdict: verdict ? verdict.text : null, display: display.mode, dir: display.dir,
               boostNow: display.boostNow };
    }
  };
})(window.DR = window.DR || {});
