/* ui.js — the look. Every screen is drawn from these few pieces, so the
   whole game speaks one visual language: slanted panels, heavy italic
   type, neon edges, and things that arrive with a little overshoot
   rather than just appearing.

   The language is borrowed from arcade racers (the Asphalt and Need for
   Speed family): parallelogram buttons with a light sweeping across,
   chips for money and level, banners that slam in, numbers that count
   up. Everything is drawn in code — no images, no downloaded fonts. The
   display face is the heaviest system sans there is, leaned over by a
   skew transform to read as italic.

   Two rules from CLAUDE.md shape all of it: nothing flashes or strobes
   (motion is slides, fades and gentle pulses), and nothing says anything
   with colour alone (every state also has a word, number or shape). */

(function (DR) {
  'use strict';

  var C = {
    ink: '#07050f',
    panel: 'rgba(12,9,26,0.88)',
    panelHi: 'rgba(30,20,60,0.94)',
    cyan: '#22e6ff', magenta: '#ff2f8e', gold: '#ffd76a', orange: '#ff8a3d',
    white: '#f2f8ff', dim: 'rgba(196,214,236,0.78)', faint: 'rgba(160,184,214,0.45)',
    green: '#7dffb0', red: '#ff5a6a', silver: '#d8e2ee', bronze: '#e0a060'
  };
  var DISPLAY = '"Arial Black", "Segoe UI Black", "Helvetica Neue", system-ui, -apple-system, sans-serif';
  var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var LEAN = -0.2;           // the italic lean of display type

  /* ------------------------------ easing ------------------------------ */
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function outCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
  function inOutCubic(t) { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function outBack(t) { t = clamp01(t); var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function outExpo(t) { t = clamp01(t); return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  // Progress of one step of an animation: starts at `delay`, lasts `dur`.
  function step(t, delay, dur) { return clamp01((t - delay) / dur); }
  // Item i of a list arriving one after another.
  function stagger(t, i, gap, dur, delay) { return step(t, (delay || 0) + i * gap, dur); }
  function countUp(value, p) { return Math.round(value * outCubic(p)); }

  /* ------------------------------ shapes ------------------------------ */
  // A parallelogram leaning right: the shape of every panel and button.
  function slant(ctx, x, y, w, h, k) {
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - k, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  /* o: { skew, fill, stroke, lineWidth, accent (a stripe of colour down the
          left edge), glow (a soft outer glow colour), alpha } */
  function panel(ctx, x, y, w, h, o) {
    o = o || {};
    var k = o.skew === undefined ? Math.min(18, h * 0.3) : o.skew;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    slant(ctx, x, y, w, h, k);
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || 18; }
    ctx.fillStyle = o.fill || C.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (o.stroke) {
      ctx.lineWidth = o.lineWidth || 1.5;
      ctx.strokeStyle = o.stroke;
      ctx.stroke();
    }
    if (o.accent) {
      slant(ctx, x, y, Math.max(8, k * 0.55 + 6), h, k);
      ctx.fillStyle = o.accent;
      ctx.fill();
    }
    ctx.restore();
  }

  /* A button. o: { primary (the one thing you're meant to press: a hot
     magenta-to-orange fill), on (selected), disabled, t (a clock, for the
     light sweep), sub (a small second line), size } */
  function button(ctx, b, label, o) {
    o = o || {};
    var k = Math.min(16, b.h * 0.3);
    ctx.save();
    var g;
    if (o.disabled) {
      slant(ctx, b.x, b.y, b.w, b.h, k);
      ctx.fillStyle = 'rgba(30,28,44,0.85)';
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(140,150,170,0.35)'; ctx.stroke();
    } else if (o.primary) {
      g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      g.addColorStop(0, '#ff2f8e'); g.addColorStop(1, '#ff8a3d');
      slant(ctx, b.x, b.y, b.w, b.h, k);
      ctx.shadowColor = 'rgba(255,60,140,0.55)'; ctx.shadowBlur = 16;
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, o.on ? 'rgba(40,80,120,0.95)' : 'rgba(28,22,52,0.92)');
      g.addColorStop(1, o.on ? 'rgba(18,40,70,0.95)' : 'rgba(12,9,26,0.92)');
      slant(ctx, b.x, b.y, b.w, b.h, k);
      if (o.on) { ctx.shadowColor = 'rgba(34,230,255,0.5)'; ctx.shadowBlur = 14; }
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = o.on ? 2.5 : 1.5;
      ctx.strokeStyle = o.on ? C.cyan : 'rgba(150,196,225,0.42)';
      ctx.stroke();
      // A cut of accent down the leading edge.
      slant(ctx, b.x, b.y, k * 0.6 + 7, b.h, k);
      ctx.fillStyle = o.on ? C.cyan : 'rgba(255,47,142,0.8)';
      ctx.fill();
    }
    // Light sweeping across, now and then: the "press me" of racing menus.
    if (!o.disabled && (o.primary || o.on) && o.t !== undefined) {
      var ph = (o.t % 3.2) / 0.9;
      if (ph < 1) {
        ctx.save();
        slant(ctx, b.x, b.y, b.w, b.h, k);
        ctx.clip();
        var sx = b.x - 60 + (b.w + 120) * ph;
        var sg = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)');
        sg.addColorStop(0.5, 'rgba(255,255,255,0.28)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(sx - 40, b.y, 80, b.h);
        ctx.restore();
      }
    }
    var size = o.size || Math.min(28, Math.round(b.h * 0.42));
    var ty = b.y + b.h * 0.5 + (o.sub ? -8 : 1);
    text(ctx, label, b.x + b.w * 0.5, ty, {
      size: size, align: 'center', baseline: 'middle',
      color: o.disabled ? 'rgba(170,180,200,0.6)' : (o.primary ? '#ffffff' : (o.on ? C.gold : C.white)),
      maxW: b.w - 36
    });
    if (o.sub) {
      text(ctx, o.sub, b.x + b.w * 0.5, ty + size * 0.5 + 12, {
        size: 15, font: SANS, weight: '700', align: 'center', baseline: 'middle', lean: 0,
        color: o.primary ? 'rgba(255,255,255,0.85)' : C.dim, maxW: b.w - 30
      });
    }
    ctx.restore();
  }

  /* Display type. o: { size, color (or a gradient), align, baseline, weight,
     font, lean (skew; 0 for upright), stroke (outline colour), strokeW,
     glow, maxW (shrink to fit), alpha } */
  function text(ctx, str, x, y, o) {
    o = o || {};
    var size = o.size || 32;
    var font = o.font || DISPLAY, weight = o.weight || '900';
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.font = weight + ' ' + size + 'px ' + font;
    if (o.maxW) {
      while (size > 10 && ctx.measureText(str).width > o.maxW) {
        size -= 2; ctx.font = weight + ' ' + size + 'px ' + font;
      }
    }
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    ctx.translate(x, y);
    var lean = o.lean === undefined ? LEAN : o.lean;
    if (lean) ctx.transform(1, 0, lean, 1, 0, 0);
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.strokeW || Math.max(4, size * 0.14);
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(str, 0, 0);
    }
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || 18; }
    ctx.fillStyle = o.color || C.white;
    ctx.fillText(str, 0, 0);
    ctx.restore();
    return size;
  }

  // A hot gradient for headline type.
  function hotGradient(ctx, x0, y0, x1, y1) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#ffe08a'); g.addColorStop(0.45, '#ff8a3d'); g.addColorStop(1, '#ff2f8e');
    return g;
  }
  function coolGradient(ctx, x0, y0, x1, y1) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#f2fbff'); g.addColorStop(1, '#7ce4ff');
    return g;
  }

  /* ------------------------------ icons ------------------------------ */
  function star(ctx, x, y, r, filled, color) {
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = color || C.gold;
      ctx.shadowColor = color || C.gold; ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.strokeStyle = filled ? 'rgba(90,50,0,0.6)' : 'rgba(190,210,235,0.55)';
    ctx.stroke();
    ctx.restore();
  }

  function coin(ctx, x, y, r) {
    ctx.save();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#fff2b0'); g.addColorStop(1, '#e0a020');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,70,0,0.8)'; ctx.stroke();
    ctx.font = '900 ' + Math.round(r * 0.9) + 'px ' + SANS;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(110,60,0,0.9)';
    ctx.fillText('C', x, y + 1);
    ctx.restore();
  }

  function trophy(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    var g = ctx.createLinearGradient(-30, -40, 30, 40);
    g.addColorStop(0, '#fff6c8'); g.addColorStop(0.5, color || C.gold); g.addColorStop(1, '#b07a10');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-26, -38); ctx.lineTo(26, -38); ctx.lineTo(22, -6);
    ctx.quadraticCurveTo(0, 16, -22, -6); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = g;
    ctx.beginPath(); ctx.arc(-28, -24, 10, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(28, -24, 10, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
    ctx.fillRect(-5, 6, 10, 16);
    ctx.fillRect(-18, 22, 36, 8);
    ctx.fillRect(-24, 30, 48, 8);
    ctx.restore();
  }

  // A hexagon badge with a number in it: the driver level.
  function levelBadge(ctx, x, y, r, level) {
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 6 + i * Math.PI / 3;
      if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    var g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#3a2a7a'); g.addColorStop(1, '#170f36');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = C.cyan; ctx.stroke();
    ctx.restore();
    text(ctx, String(level), x, y + 1, { size: Math.round(r * 0.9), align: 'center', baseline: 'middle', lean: 0 });
  }

  /* Chips: money, level and stars, the always-there top bar of a racing
     game's menus. */
  function chip(ctx, x, y, w, kind, value, extra) {
    panel(ctx, x, y, w, 40, { skew: 12, fill: 'rgba(10,8,24,0.82)', stroke: 'rgba(150,196,225,0.35)' });
    if (kind === 'cr') {
      coin(ctx, x + 26, y + 20, 12);
      text(ctx, String(value), x + w - 18, y + 28, { size: 20, font: MONO, weight: '800', align: 'right', lean: 0, color: C.gold });
    } else if (kind === 'star') {
      star(ctx, x + 26, y + 20, 12, true);
      text(ctx, String(value), x + w - 18, y + 28, { size: 20, font: MONO, weight: '800', align: 'right', lean: 0, color: C.white });
    } else if (kind === 'lvl') {
      levelBadge(ctx, x + 24, y + 20, 17, value);
      // XP to the next level, as a bar and as words.
      var f = extra ? extra.frac : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 50, y + 25, w - 70, 7);
      ctx.fillStyle = C.cyan;
      ctx.fillRect(x + 50, y + 25, (w - 70) * f, 7);
      text(ctx, 'DRIVER LEVEL', x + 50, y + 18, { size: 12, font: SANS, weight: '800', lean: 0, color: C.dim });
    }
  }

  /* ---------------------------- confetti ---------------------------- */
  // Paper, not light: pieces tumble and fall, so a win feels like a win
  // without anything flashing.
  var bits = [];
  var PAL = ['#ff2f8e', '#22e6ff', '#ffd76a', '#7dffb0', '#ff8a3d', '#b98bff'];
  function confetti(n, x, y, spread) {
    for (var i = 0; i < n; i++) {
      bits.push({
        x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 360, vy: -240 - Math.random() * 380,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10,
        w: 8 + Math.random() * 8, h: 5 + Math.random() * 5,
        c: PAL[i % PAL.length], life: 3 + Math.random() * 1.5, t: 0
      });
    }
    if (bits.length > 400) bits.splice(0, bits.length - 400);
  }
  function updateFx(dt) {
    for (var i = bits.length - 1; i >= 0; i--) {
      var p = bits[i];
      p.t += dt; p.vy += 520 * dt; p.vx *= Math.pow(0.4, dt);
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.t > p.life || p.y > 1400) bits.splice(i, 1);
    }
    if (wipeT < WIPE_DUR) wipeT += dt;
  }
  function drawConfetti(ctx) {
    for (var i = 0; i < bits.length; i++) {
      var p = bits[i];
      ctx.save();
      ctx.globalAlpha = Math.min(1, (p.life - p.t) / 0.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.scale(1, Math.abs(Math.cos(p.r * 1.3)) * 0.8 + 0.2);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }
  function clearFx() { bits.length = 0; }

  /* ------------------------------ wipe ------------------------------ */
  // Changing screen: a slanted band of dark with a neon edge sweeps off
  // the new screen. A slide, never a flash.
  var WIPE_DUR = 0.42, wipeT = 1;
  function wipe() { wipeT = 0; }
  function drawWipe(ctx, W, H) {
    if (wipeT >= WIPE_DUR) return;
    var p = inOutCubic(wipeT / WIPE_DUR);
    var edge = -200 + (W + 520) * p;         // the leading edge moves right
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(edge, 0); ctx.lineTo(W + 400, 0); ctx.lineTo(W + 400, H); ctx.lineTo(edge - 260, H); ctx.closePath();
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(edge, 0); ctx.lineTo(edge - 260, H);
    ctx.lineWidth = 6; ctx.strokeStyle = C.magenta; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(edge + 14, 0); ctx.lineTo(edge - 246, H);
    ctx.lineWidth = 3; ctx.strokeStyle = C.cyan; ctx.stroke();
    ctx.restore();
  }

  /* --------------------------- menu backdrop --------------------------- */
  // Menus sit over the game's own sky, darkened, with slow diagonal
  // streaks of light drifting across: something alive behind the buttons.
  function backdrop(ctx, W, H, t, tint) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(6,4,16,0.30)');
    g.addColorStop(0.5, 'rgba(6,4,16,0.55)');
    g.addColorStop(1, 'rgba(6,4,16,0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = tint || C.cyan;
    ctx.lineWidth = 2;
    for (var i = 0; i < 7; i++) {
      var off = ((t * (40 + i * 9) + i * 170) % (W + 600)) - 300;
      ctx.beginPath();
      ctx.moveTo(off, 0); ctx.lineTo(off - 300, H);
      ctx.stroke();
    }
    ctx.restore();
    // Vignette.
    var vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // A heading bar across the top of a screen: title, and a thin line.
  function header(ctx, W, title, sub, t) {
    var p = outCubic(step(t, 0, 0.45));
    text(ctx, title, W / 2 - (1 - p) * 60, 132, { size: 50, align: 'center', color: hotGradient(ctx, 0, 90, W, 140), stroke: 'rgba(4,2,10,0.9)', alpha: p });
    if (sub) text(ctx, sub, W / 2 + (1 - p) * 60, 168, { size: 18, font: SANS, weight: '800', align: 'center', color: C.dim, lean: 0, alpha: p });
    ctx.save();
    ctx.globalAlpha = p;
    var lw = 240 * p;
    ctx.fillStyle = C.magenta; ctx.fillRect(W / 2 - lw, 182, lw * 2, 3);
    ctx.fillStyle = C.cyan; ctx.fillRect(W / 2 - lw * 0.5, 188, lw, 2);
    ctx.restore();
  }

  DR.UI = {
    C: C, DISPLAY: DISPLAY, SANS: SANS, MONO: MONO,
    clamp01: clamp01, outCubic: outCubic, inOutCubic: inOutCubic, outBack: outBack, outExpo: outExpo,
    step: step, stagger: stagger, countUp: countUp,
    slant: slant, panel: panel, button: button, text: text,
    hotGradient: hotGradient, coolGradient: coolGradient,
    star: star, coin: coin, trophy: trophy, levelBadge: levelBadge, chip: chip,
    confetti: confetti, updateFx: updateFx, drawConfetti: drawConfetti, clearFx: clearFx,
    wipe: wipe, drawWipe: drawWipe, backdrop: backdrop, header: header
  };
})(window.DR = window.DR || {});
