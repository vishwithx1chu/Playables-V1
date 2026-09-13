/* game.js — sets everything up, runs the loop, and owns the one rule that
   keeps the game fair on every screen shape. */

(function (DR) {
  'use strict';

  /* Responsive fairness: the game is always drawn into this fixed rectangle,
     scaled to fit and centred. Everybody sees exactly the same amount of road
     ahead, whatever their screen. Spare space becomes black bars, never extra
     road. */
  var LOGICAL_W = 720;
  var LOGICAL_H = 1280;

  // Where the car lands on screen and how far it can see are the camera's to
  // decide now — see the camera block at the top of road.js.
  var SPEED = 480;       // constant for now; the speed system is a later milestone

  var FIXED = 1 / 60;    // physics runs at a fixed rate so the feel never
                         // changes between a slow phone and a fast monitor

  var canvas, ctx;
  var scale = 1, offX = 0, offY = 0, dpr = 1;
  var camX = 0, camReady = false;
  var last = 0, acc = 0;
  var hintAlpha = 1;
  var hitCool = 0;

  function resize() {
    var vw = Math.max(1, window.innerWidth);
    var vh = Math.max(1, window.innerHeight);

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';

    scale = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    offX = (vw - LOGICAL_W * scale) * 0.5;
    offY = (vh - LOGICAL_H * scale) * 0.5;
    // Nothing about the run is touched here, so resizing mid-drift is safe.
  }

  function view() {
    return {
      W: LOGICAL_W,
      H: LOGICAL_H,
      carY: DR.Road.CAR_Y,
      carS: DR.Car.s,
      camX: camX,
      sTop: DR.Car.s + DR.Road.LOOKAHEAD,
      sBot: DR.Road.nearS(DR.Car.s, LOGICAL_H)
    };
  }

  // Contact with an edge: shake and flash, and the car is held on the road.
  // No health, no score, no run ending — that is a later milestone.
  function checkEdges(dt) {
    hitCool = Math.max(0, hitCool - dt);

    var cx = DR.Road.centerAt(DR.Car.s);
    var limit = DR.Road.HALF_W - DR.Car.halfWidth();
    var dev = DR.Car.x - cx;
    if (Math.abs(dev) <= limit) return;

    var side = dev > 0 ? 1 : -1;
    DR.Car.x = cx + side * limit;

    if (hitCool > 0) return;

    // Which mistake was it? On a bend, the inside of the turn is the side the
    // road is bending towards, so hitting that edge means you cut in, and
    // hitting the other one means you ran wide.
    var dir = DR.Road.dirAt(DR.Car.s);
    var kind = dir === 0 ? 'OFFLINE' : (side === dir ? 'INNER' : 'OUTER');
    var severity = Math.min(1, Math.abs(DR.Car.lat) / 250);

    DR.FX.hit(kind, Math.max(0.35, severity), side, DR.Car);
    hitCool = 0.45;
    DR.Car.drift *= 0.42;   // scrubbing the wall kills some of the slide
  }

  function update(dt) {
    var steer = DR.Input.steer();
    if (steer !== 0) hintAlpha = Math.max(0, hintAlpha - dt * 2.4);

    DR.Car.update(dt, steer, SPEED);

    // Camera sits between the car and the road ahead, so a hard bend stays
    // framed instead of sliding out of shot, plus a small lean into the drift.
    var target = DR.Car.x * 0.60 +
                 DR.Road.centerAt(DR.Car.s + 620) * 0.40 +
                 Math.sin(DR.Car.drift) * 40;
    if (!camReady) { camX = target; camReady = true; }
    camX += (target - camX) * (1 - Math.exp(-dt / 0.18));

    checkEdges(dt);

    DR.FX.emit(DR.Car, SPEED, dt);
    DR.FX.update(dt, DR.Car.s);
    DR.Road.trim(DR.Car.s - DR.Road.CAM_BACK - 600);
  }

  function drawHint(ctx2, v) {
    if (hintAlpha <= 0.01) return;
    ctx2.globalAlpha = hintAlpha;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';

    ctx2.font = '700 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.lineWidth = 6;
    ctx2.strokeStyle = 'rgba(4,2,10,0.9)';
    ctx2.strokeText('HOLD LEFT OR RIGHT SIDE', v.W * 0.5, v.H - 108);
    ctx2.fillStyle = '#dff6ff';
    ctx2.fillText('HOLD LEFT OR RIGHT SIDE', v.W * 0.5, v.H - 108);

    ctx2.font = '600 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx2.strokeText('or hold the arrow keys', v.W * 0.5, v.H - 70);
    ctx2.fillStyle = 'rgba(190,214,235,0.9)';
    ctx2.fillText('or hold the arrow keys', v.W * 0.5, v.H - 70);

    ctx2.globalAlpha = 1;
  }

  function draw() {
    var v = view();
    var sh = DR.FX.shakeOffset();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // Clip to the playfield: the bars stay bars even while the screen shakes.
    ctx.beginPath();
    ctx.rect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.clip();
    ctx.translate(sh.x, sh.y);

    DR.Road.drawBackground(ctx, v);
    DR.Road.draw(ctx, v);
    DR.FX.drawSkids(ctx, v);
    DR.Road.drawChevrons(ctx, v);
    DR.Road.drawFog(ctx, v);
    DR.FX.drawSmoke(ctx, v);
    DR.Car.draw(ctx, v);
    DR.FX.drawFlash(ctx, v);
    DR.FX.drawLabels(ctx, v);
    drawHint(ctx, v);

    ctx.restore();
  }

  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = FIXED;
    if (dt > 0.25) dt = 0.25;   // tab was in the background; do not fast-forward

    acc += dt;
    var steps = 0;
    while (acc >= FIXED && steps < 5) {
      update(FIXED);
      acc -= FIXED;
      steps++;
    }
    if (steps === 5) acc = 0;

    draw();
    requestAnimationFrame(frame);
  }

  function start() {
    canvas = document.getElementById('stage');
    ctx = canvas.getContext('2d', { alpha: false });

    DR.Road.reset();
    DR.Car.reset();
    DR.FX.reset();
    DR.Input.init(canvas);

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
    }

    last = performance.now();
    requestAnimationFrame(frame);
  }

  // Exposed so the drift can be measured and tuned from outside the game.
  DR.Game = {
    view: view,
    camX: function () { return camX; },
    SPEED: SPEED,
    LOGICAL_W: LOGICAL_W,
    LOGICAL_H: LOGICAL_H,
    LOOKAHEAD: DR.Road.LOOKAHEAD
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window.DR = window.DR || {});
