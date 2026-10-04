/* show.js — the presentation around a race: everything that makes a race
   feel like an event rather than a physics test.

     INTRO      a card naming the event, where it is and what it asks; a boss
                gets a head-to-head VS card instead, the way a rival's
                profile comes up before a Blacklist race.
     COUNTDOWN  three red lights, one a second, then green: GO. Everyone
                waits on the grid. Hit BOOST in the moment after GO for a
                PERFECT START; hit it before and it's a jump start (no
                launch this time, no other penalty).
     DURING     a feed of what you just did, each worth style points:
                OVERTAKE, TAKEDOWN, SHUNT, SLIPSTREAM, DRIFT, CLEAN LAP...
                and banners across the middle: LAP 2, FINAL LAP, BEST LAP.
     FINISH     FINISH slams in with your place, the world drops into slow
                motion for a moment, then the results.

   Style points turn into credits and XP on the results screen, so driving
   with a bit of flair pays. Nothing here flashes: slams scale in and fade,
   lights change one at a time, the GO burst is rings of colour expanding
   outward and fading.

   game.js owns the race; this file owns how it's shown. It's told what
   happened (notify, lapDone, finish) and asked two things: is the race
   frozen (intro or countdown), and did a launch just happen. */

(function (DR) {
  'use strict';

  var enabled = true;        // tests switch this off to skip straight to racing
  var stage = 'idle';        // idle | intro | countdown | race | finish
  var t = 0;                 // seconds in the current stage
  var info = null;           // what the intro card says
  var INTRO_T = 1.8, BOSS_T = 2.8, COUNT_T = 3.0, LAUNCH_WIN = 0.4, FINISH_T = 1.9;
  var jumped = false, launched = false, launchT = 0;
  var feed = [];             // { text, pts, color, t }
  var banners = [];          // { text, sub, color, t, dur }
  var stats = null;
  var finishInfo = null;

  function resetStats() {
    stats = { style: 0, overtakes: 0, takedowns: 0, shunts: 0, drifts: 0, cleanLaps: 0,
              topKmh: 0, perfect: false };
  }
  resetStats();

  /* Start the show for a race. o: { mode, title, sub, lines: [...],
     boss: { name, color, car, rating, quote } | null, you: { car, rating } }.
     Practice and the tutorial skip straight to driving. */
  function begin(o) {
    info = o; feed = []; banners = []; resetStats(); finishInfo = null;
    jumped = false; launched = false; launchT = 0;
    if (!enabled || o.mode === 'practice' || o.mode === 'tutorial') { stage = 'race'; t = 0; return; }
    stage = 'intro'; t = 0;
  }

  function frozen() { return stage === 'intro' || stage === 'countdown'; }
  function introDuration() { return info && info.boss ? BOSS_T : INTRO_T; }

  // Tap during the intro skips to the lights.
  function skipIntro() { if (stage === 'intro') { stage = 'countdown'; t = 0; } }

  /* Once a frame. g: { boostPressed, kmh }. Returns 'perfect' on the frame
     a perfect start fires, else null. */
  function update(dt, g) {
    t += dt;
    var out = null;
    if (stage === 'intro' && t >= introDuration()) { stage = 'countdown'; t = 0; }
    else if (stage === 'countdown') {
      if (g.boostPressed && !jumped) {
        jumped = true;
        notify('JUMP START', 0, '#ffb24d', 'TOO EARLY — NO LAUNCH');
      }
      if (t >= COUNT_T) { stage = 'race'; t = 0; launchT = 0; }
    } else if (stage === 'race') {
      launchT += dt;
      if (!launched && !jumped && g.boostPressed && launchT <= LAUNCH_WIN) {
        launched = true; stats.perfect = true;
        notify('PERFECT START', 100, '#7dffb0');
        out = 'perfect';
      }
    } else if (stage === 'finish' && t >= FINISH_T) { stage = 'idle'; }
    if (g.kmh > stats.topKmh) stats.topKmh = g.kmh;
    for (var i = feed.length - 1; i >= 0; i--) { feed[i].t += dt; if (feed[i].t > 2.6) feed.splice(i, 1); }
    for (i = banners.length - 1; i >= 0; i--) { banners[i].t += dt; if (banners[i].t > banners[i].dur) banners.splice(i, 1); }
    return out;
  }

  // In the first moment after GO, is a boost press a launch? (So the game
  // knows not to spend meter on it.)
  function launchWindow() { return stage === 'race' && !launched && !jumped && launchT <= LAUNCH_WIN; }

  function notify(text, pts, color, sub) {
    if (pts) stats.style += pts;
    // Same thing twice in a row just adds up, rather than stacking.
    var top = feed[feed.length - 1];
    if (top && top.text === text && top.t < 1.2) { top.pts += pts; top.t = 0; top.n = (top.n || 1) + 1; return; }
    feed.push({ text: text, pts: pts, color: color || '#22e6ff', sub: sub || '', t: 0 });
    if (feed.length > 4) feed.shift();
  }
  function count(kind) { stats[kind]++; }

  function banner(text, sub, color, dur) {
    banners.push({ text: text, sub: sub || '', color: color || '#ffd76a', t: 0, dur: dur || 1.7 });
    if (banners.length > 2) banners.shift();
  }

  function finish(o) {
    finishInfo = o;              // { pos, total, label }
    stage = 'finish'; t = 0;
    feed = [];
    if (o.pos === 1) DR.UI.confetti(90, 360, 260, 520);
  }
  function finishing() { return stage === 'finish'; }
  function finishDuration() { return FINISH_T; }

  /* ------------------------------ drawing ------------------------------ */
  var UI = null;

  function drawIntro(ctx, W, H) {
    var d = introDuration(), p = UI.outCubic(UI.step(t, 0, 0.35)), out = UI.step(t, d - 0.3, 0.3);
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.fillStyle = 'rgba(6,4,16,' + (0.55 * p).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    if (info.boss) drawVersus(ctx, W, H, p);
    else {
      // A slanted band across the middle with the event on it.
      var y = 440, bx = -40 + (1 - p) * -700;
      UI.panel(ctx, bx, y, W + 80, 250, { skew: 60, fill: 'rgba(12,9,26,0.94)', stroke: UI.C.magenta, lineWidth: 3, accent: UI.C.magenta });
      UI.text(ctx, info.sub || '', W / 2, y + 58, { size: 20, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.cyan, alpha: p });
      UI.text(ctx, info.title || '', W / 2, y + 124, { size: 56, align: 'center', color: UI.hotGradient(ctx, 100, y + 80, 620, y + 130), stroke: 'rgba(4,2,10,0.9)', maxW: W - 80, alpha: p });
      var lines = info.lines || [];
      for (var i = 0; i < lines.length; i++) {
        var lp = UI.outCubic(UI.step(t, 0.25 + i * 0.12, 0.3));
        UI.text(ctx, lines[i], W / 2 + (1 - lp) * 80, y + 168 + i * 30, { size: 20, font: UI.SANS, weight: '800', lean: 0, align: 'center', color: '#ffffff', alpha: lp });
      }
    }
    UI.text(ctx, 'TAP TO SKIP', W / 2, H - 70, { size: 16, font: UI.SANS, weight: '800', lean: 0, align: 'center', color: UI.C.dim, alpha: p });
    ctx.restore();
  }

  // You on the left, the boss on the right, VS between: a Blacklist-style
  // head to head.
  function drawVersus(ctx, W, H, p) {
    var b = info.boss, you = info.you;
    var yTop = 250, h = 420;
    var lx = -W * (1 - UI.outBack(UI.step(t, 0, 0.5)));
    var rx = W * (1 - UI.outBack(UI.step(t, 0.12, 0.5)));
    // Your card.
    UI.panel(ctx, 30 + lx, yTop, 330, h, { skew: 40, fill: 'rgba(14,20,40,0.95)', stroke: UI.C.cyan, lineWidth: 3, accent: UI.C.cyan });
    UI.text(ctx, 'YOU', 190 + lx, yTop + 36, { size: 18, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.cyan });
    UI.text(ctx, you.name || 'YOU', 190 + lx, yTop + 80, { size: 44, align: 'center', color: '#ffffff', stroke: 'rgba(4,2,10,0.9)', maxW: 280 });
    DR.Game.drawProfileCarAt(ctx, 190 + lx, yTop + 200, 1.05, you.color);
    UI.text(ctx, you.car, 190 + lx, yTop + 300, { size: 24, align: 'center', color: UI.C.white, maxW: 270 });
    UI.text(ctx, 'RATING ' + you.rating, 190 + lx, yTop + 336, { size: 18, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.green });
    // Their card.
    UI.panel(ctx, W - 360 + rx, yTop, 330, h, { skew: 40, fill: 'rgba(40,14,24,0.95)', stroke: b.color, lineWidth: 3, accent: b.color });
    UI.text(ctx, (b.rank ? '#' + b.rank + '  ' : '') + 'BOSS', W - 195 + rx, yTop + 36, { size: 18, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: b.color });
    UI.text(ctx, b.name, W - 195 + rx, yTop + 80, { size: 44, align: 'center', color: '#ffffff', stroke: 'rgba(4,2,10,0.9)', maxW: 280 });
    DR.Game.drawProfileCarAt(ctx, W - 195 + rx, yTop + 200, 1.05, b.color, true);
    UI.text(ctx, b.car, W - 195 + rx, yTop + 300, { size: 24, align: 'center', color: UI.C.white, maxW: 270 });
    UI.text(ctx, 'RATING ' + b.rating, W - 195 + rx, yTop + 336, { size: 18, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.gold });
    // VS in the middle, landing last.
    var vp = UI.outBack(UI.step(t, 0.45, 0.35));
    if (vp > 0) {
      ctx.save();
      ctx.translate(W / 2, yTop + h / 2);
      ctx.scale(0.4 + vp * 0.6, 0.4 + vp * 0.6);
      UI.text(ctx, 'VS', 0, 26, { size: 96, align: 'center', color: UI.hotGradient(ctx, -60, -40, 60, 40), stroke: 'rgba(4,2,10,0.95)', strokeW: 12, glow: 'rgba(255,47,142,0.6)' });
      ctx.restore();
    }
    // The boss's line, and what it's for.
    var qp = UI.outCubic(UI.step(t, 0.7, 0.4));
    UI.panel(ctx, 40, yTop + h + 30, W - 80, 110, { skew: 24, fill: 'rgba(10,8,22,0.92)', stroke: 'rgba(150,196,225,0.35)', alpha: qp });
    UI.text(ctx, b.name, 80, yTop + h + 70, { size: 18, font: UI.SANS, weight: '900', lean: 0, color: b.color, alpha: qp });
    UI.text(ctx, '“' + b.quote + '”', 80, yTop + h + 104, { size: 21, font: UI.SANS, weight: '700', color: '#ffffff', maxW: W - 160, alpha: qp });
    UI.text(ctx, info.title || 'BOSS RACE', W / 2, 180, { size: 44, align: 'center', color: UI.hotGradient(ctx, 100, 140, 620, 190), stroke: 'rgba(4,2,10,0.9)', alpha: p });
    UI.text(ctx, info.sub || '', W / 2, 214, { size: 18, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.dim, alpha: p });
  }

  // Three lights come on one a second; then all go green and GO bursts out
  // in expanding rings (no flash: rings grow and fade).
  function drawCountdown(ctx, W, H) {
    var n = Math.floor(t);                  // 0, 1, 2 lights lit
    var cy = 330, gap = 96, r = 32;
    var go = stage === 'race';
    var pp = UI.outCubic(UI.step(t, 0, 0.3));
    UI.panel(ctx, W / 2 - 190, cy - 56, 380, 112, { skew: 26, fill: 'rgba(8,6,18,0.92)', stroke: 'rgba(150,196,225,0.4)', alpha: go ? 1 - UI.step(launchT, 0.5, 0.4) : pp });
    for (var i = 0; i < 3; i++) {
      var x = W / 2 + (i - 1) * gap;
      var lit = go || t >= i;
      ctx.save();
      if (go) ctx.globalAlpha = 1 - UI.step(launchT, 0.5, 0.4);
      ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = go ? '#3dff8a' : (lit ? '#ff3344' : 'rgba(60,20,30,0.9)');
      if (go || lit) { ctx.shadowColor = go ? '#3dff8a' : '#ff3344'; ctx.shadowBlur = 26; }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,16,0.9)'; ctx.stroke();
      ctx.restore();
    }
    // The big numeral for the second you're in.
    if (!go) {
      var k = t - n, num = String(3 - n);
      var sc = 1.6 - UI.outCubic(Math.min(1, k * 2.2)) * 0.6;
      ctx.save();
      ctx.translate(W / 2, 560);
      ctx.scale(sc, sc);
      UI.text(ctx, num, 0, 60, { size: 170, align: 'center', color: '#ffffff', stroke: 'rgba(4,2,10,0.9)', strokeW: 14,
                                 glow: 'rgba(255,51,68,0.6)', glowBlur: 30, alpha: 1 - UI.step(k, 0.7, 0.3) });
      ctx.restore();
      UI.text(ctx, 'HIT BOOST ON GREEN FOR A PERFECT START', W / 2, 760, { size: 17, font: UI.SANS, weight: '900', lean: 0, align: 'center', color: UI.C.gold, alpha: pp });
    } else {
      var gp = UI.step(launchT, 0, 0.9);
      if (gp < 1) {
        for (var j = 0; j < 3; j++) {
          var rp = UI.clamp01(gp * 1.3 - j * 0.15);
          ctx.beginPath(); ctx.arc(W / 2, 560, 60 + rp * 420, 0, Math.PI * 2);
          ctx.lineWidth = 10 * (1 - rp); ctx.strokeStyle = 'rgba(61,255,138,' + (0.6 * (1 - rp)).toFixed(3) + ')'; ctx.stroke();
        }
        ctx.save();
        ctx.translate(W / 2, 560);
        var s2 = 0.7 + UI.outBack(Math.min(1, gp * 3)) * 0.5;
        ctx.scale(s2, s2);
        UI.text(ctx, 'GO!', 0, 50, { size: 150, align: 'center', color: UI.hotGradient(ctx, -120, -60, 120, 60), stroke: 'rgba(4,2,10,0.95)', strokeW: 14,
                                    glow: 'rgba(61,255,138,0.6)', glowBlur: 30, alpha: 1 - UI.step(gp, 0.6, 0.4) });
        ctx.restore();
      }
    }
  }

  // The feed: what you just did, sliding in on the left, worth points.
  function drawFeed(ctx, W, H) {
    for (var i = 0; i < feed.length; i++) {
      var f = feed[i], k = feed.length - 1 - i;
      var pin = UI.outBack(UI.step(f.t, 0, 0.3)), out = UI.step(f.t, 2.1, 0.5);
      var x = -300 * (1 - pin) - out * 60 + 18, y = 470 + k * 58;
      ctx.save();
      ctx.globalAlpha = 1 - out;
      UI.panel(ctx, x, y, 290, 50, { skew: 16, fill: 'rgba(8,6,20,0.86)', stroke: f.color, lineWidth: 2, accent: f.color });
      UI.text(ctx, f.text + (f.n > 1 ? ' x' + f.n : ''), x + 30, y + 33, { size: 22, color: '#ffffff', maxW: f.pts ? 170 : 240 });
      if (f.pts) UI.text(ctx, '+' + f.pts, x + 272, y + 33, { size: 20, font: UI.MONO, weight: '900', lean: 0, align: 'right', color: f.color });
      if (f.sub) UI.text(ctx, f.sub, x + 30, y + 64, { size: 14, font: UI.SANS, weight: '800', lean: 0, color: UI.C.dim });
      ctx.restore();
    }
  }

  function drawBanners(ctx, W, H) {
    for (var i = 0; i < banners.length; i++) {
      var b = banners[i];
      var pin = UI.outCubic(UI.step(b.t, 0, 0.3)), out = UI.step(b.t, b.dur - 0.35, 0.35);
      var y = 300 + i * 120;
      ctx.save();
      ctx.globalAlpha = 1 - out;
      var w = W + 100, x = -50 + (1 - pin) * W + out * -W;
      UI.panel(ctx, x, y - 52, w, 88, { skew: 40, fill: 'rgba(8,6,20,0.78)', stroke: b.color, lineWidth: 2 });
      UI.text(ctx, b.text, W / 2 + (1 - pin) * 200, y + 6, { size: 52, align: 'center', color: b.color, stroke: 'rgba(4,2,10,0.9)' });
      if (b.sub) UI.text(ctx, b.sub, W / 2, y + 30, { size: 18, font: UI.MONO, weight: '900', lean: 0, align: 'center', color: '#ffffff' });
      ctx.restore();
    }
  }

  function ordinal(n) { return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'); }

  function drawFinish(ctx, W, H) {
    var p = UI.outBack(UI.step(t, 0, 0.45)), out = UI.step(t, FINISH_T - 0.35, 0.35);
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.fillStyle = 'rgba(6,4,16,' + (0.35 * UI.step(t, 0, 0.3)).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    // A chequered band.
    var by = 420, sq = 26;
    ctx.save();
    ctx.translate((1 - p) * -W, 0);
    for (var x = -sq; x < W + sq; x += sq) {
      for (var r = 0; r < 2; r++) {
        ctx.fillStyle = ((x / sq + r) & 1) ? 'rgba(255,255,255,0.9)' : 'rgba(10,8,20,0.9)';
        ctx.fillRect(x, by + r * sq, sq, sq);
        ctx.fillRect(x, by + 150 + r * sq, sq, sq);
      }
    }
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, by + 110);
    var sc = 2.2 - p * 1.2;
    ctx.scale(sc, sc);
    UI.text(ctx, 'FINISH', 0, 16, { size: 84, align: 'center', color: UI.hotGradient(ctx, -200, -50, 200, 50), stroke: 'rgba(4,2,10,0.95)', strokeW: 12, alpha: UI.clamp01(p) });
    ctx.restore();
    if (finishInfo && finishInfo.label) {
      var lp = UI.outBack(UI.step(t, 0.35, 0.4));
      ctx.save();
      ctx.translate(W / 2, by + 280);
      ctx.scale(0.5 + lp * 0.5, 0.5 + lp * 0.5);
      UI.text(ctx, finishInfo.label, 0, 20, { size: 64, align: 'center', color: finishInfo.pos === 1 ? UI.C.gold : '#ffffff', stroke: 'rgba(4,2,10,0.95)', strokeW: 10, alpha: UI.clamp01(lp) });
      ctx.restore();
    }
    ctx.restore();
  }

  function draw(ctx, W, H) {
    UI = DR.UI;
    if (!info) return;
    if (stage === 'intro') { drawIntro(ctx, W, H); return; }
    if (stage === 'countdown' || (stage === 'race' && launchT < 1.2 && enabled && info.mode !== 'practice' && info.mode !== 'tutorial')) drawCountdown(ctx, W, H);
    if (stage === 'race' || stage === 'countdown') { drawBanners(ctx, W, H); drawFeed(ctx, W, H); }
    if (stage === 'finish') drawFinish(ctx, W, H);
  }

  DR.Show = {
    setEnabled: function (on) { enabled = !!on; },
    enabled: function () { return enabled; },
    begin: begin, frozen: frozen, skipIntro: skipIntro, update: update, launchWindow: launchWindow,
    notify: notify, count: count, banner: banner, finish: finish, finishing: finishing,
    finishDuration: finishDuration, draw: draw, ordinal: ordinal,
    stage: function () { return stage; },
    stats: function () { return stats; },
    time: function () { return t; }   // seconds into the current stage
  };
})(window.DR = window.DR || {});
