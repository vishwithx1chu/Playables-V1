/* art.js — the painted art (made in Canva), loaded only when it exists.

   Every picture has a name ("lobby", "sky.portside", "scene.prologue.1",
   "face.FENDER", "car.nightrunner"...). assets/manifest.js lists which
   ones are actually in the repo; this loads them lazily, a screen's worth
   at a time, so the game is still playable in seconds. Anything missing,
   or still loading, just isn't drawn: the code-drawn art underneath stays,
   so the game never shows a hole or an error. */

(function (DR) {
  'use strict';

  var files = (DR.ArtManifest && DR.ArtManifest.files) || {};   // name -> path
  var cache = {};                                                // name -> { img, ok }

  function has(name) { return !!files[name]; }

  function load(name) {
    if (!files[name] || cache[name]) return;
    var img = new Image();
    var rec = { img: img, ok: false };
    cache[name] = rec;
    img.onload = function () { rec.ok = true; };
    img.onerror = function () { rec.ok = false; rec.failed = true; };
    img.src = files[name];
  }

  // The picture, if it's here and ready; otherwise null (draw the fallback).
  function get(name) {
    if (!files[name]) return null;
    var rec = cache[name];
    if (!rec) { load(name); return null; }
    return rec.ok ? rec.img : null;
  }

  // Start loading everything whose name begins with a prefix ("sky.",
  // "scene.prologue"), ahead of the screen that needs it.
  function preload(prefix) {
    for (var k in files) if (files.hasOwnProperty(k) && k.indexOf(prefix) === 0) load(k);
  }

  /* Draw a picture to fill a box, cropped to keep its shape ("cover"),
     with an optional slow drift (Ken Burns) for a living still. Returns
     false if the picture isn't ready, so the caller draws its fallback. */
  function cover(ctx, name, x, y, w, h, o) {
    var img = get(name);
    if (!img) return false;
    o = o || {};
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var zoom = o.zoom || 1;
    var s = Math.max(w / iw, h / ih) * zoom;
    var dw = iw * s, dh = ih * s;
    var fx = o.fx === undefined ? 0.5 : o.fx, fy = o.fy === undefined ? 0.5 : o.fy;
    var dx = x + (w - dw) * fx, dy = y + (h - dh) * fy;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }

  // Draw a cut-out (transparent PNG) centred on a point, at a given width.
  function sprite(ctx, name, cx, cy, w, o) {
    var img = get(name);
    if (!img) return false;
    o = o || {};
    var h = w * img.naturalHeight / img.naturalWidth;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (o.flip) { ctx.translate(cx, cy); ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, -h / 2, w, h); }
    else ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
    return true;
  }

  DR.Art = { has: has, get: get, preload: preload, cover: cover, sprite: sprite,
             names: function () { return Object.keys(files); } };
})(window.DR = window.DR || {});
