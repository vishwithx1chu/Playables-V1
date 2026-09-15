/* input.js — turns touch, mouse and keyboard into ONE number.
   steer() returns -1 (drift left), 0 (straighten) or +1 (drift right).
   Nothing else in the game knows or cares which device the player used. */

(function (DR) {
  'use strict';

  var keyLeft = false;
  var keyRight = false;

  // Held pointers, oldest first. The most recent one wins, so sliding a thumb
  // from one side to the other reverses the drift without lifting off.
  var pointers = [];

  var pressedOnce = false;
  var lastDevice = '';         // 'key' or 'pointer' — only to word the hints

  /* Menus count key PRESSES; the road reads the key being HELD.

     They cannot be the same thing. The road samples once a frame, which is
     right for a drift — what matters is whether the key is down now. A menu
     sampled the same way misses any press that starts and ends between two
     frames, and a quick tap of an arrow key does exactly that. So presses are
     queued here and read once, the way the boost button already worked. */
  var menuSteps = 0;

  // Boost. Fires once per press: holding it down does nothing extra.
  var boostQueued = false;
  var boostHeld = false;
  var boostKeys = 0;
  var boostPointers = [];      // pointers that landed on the button, not the road
  var boostHitTest = null;     // set by the game, which knows the screen layout
  var uiHitTest = null;        // buttons that are buttons, not road
  var tap = null;              // last press, for menus; read once then cleared

  function sideFromClientX(clientX) {
    return clientX < window.innerWidth * 0.5 ? -1 : 1;
  }

  function removePointer(id) {
    for (var i = pointers.length - 1; i >= 0; i--) {
      if (pointers[i].id === id) pointers.splice(i, 1);
    }
  }

  function addPointer(id, clientX) {
    removePointer(id);
    pointers.push({ id: id, side: sideFromClientX(clientX) });
    pressedOnce = true;
  }

  function movePointer(id, clientX) {
    for (var i = 0; i < pointers.length; i++) {
      if (pointers[i].id === id) {
        pointers[i].side = sideFromClientX(clientX);
        return;
      }
    }
  }

  function isLeftKey(e) {
    return e.key === 'ArrowLeft' || e.code === 'ArrowLeft' || e.code === 'KeyA';
  }

  function isRightKey(e) {
    return e.key === 'ArrowRight' || e.code === 'ArrowRight' || e.code === 'KeyD';
  }

  function isBoostKey(e) {
    return e.code === 'Space' || e.key === ' ' ||
           e.key === 'ArrowUp' || e.code === 'ArrowUp' || e.code === 'KeyW';
  }

  function grabFocus(target) {
    try {
      if (window.focus) window.focus();
      if (target && target.focus) target.focus({ preventScroll: true });
    } catch (err) { /* a browser that will not hand it over is not fatal */ }
  }

  function onBoostPointer(id) {
    for (var i = 0; i < boostPointers.length; i++) if (boostPointers[i] === id) return true;
    return false;
  }

  DR.Input = {
    init: function (target) {
      var active = { passive: false };
      grabFocus(target);

      window.addEventListener('keydown', function (e) {
        if (e.repeat) return;
        if (isBoostKey(e)) { boostQueued = true; boostKeys++; pressedOnce = true; lastDevice = 'key'; e.preventDefault(); }
        else if (isLeftKey(e)) { keyLeft = true; menuSteps -= 1; pressedOnce = true; lastDevice = 'key'; e.preventDefault(); }
        else if (isRightKey(e)) { keyRight = true; menuSteps += 1; pressedOnce = true; lastDevice = 'key'; e.preventDefault(); }
      }, active);

      window.addEventListener('keyup', function (e) {
        if (isBoostKey(e)) boostKeys = Math.max(0, boostKeys - 1);
        else if (isLeftKey(e)) keyLeft = false;
        else if (isRightKey(e)) keyRight = false;
      });

      // Losing focus mid-hold must not leave the car locked in a drift.
      window.addEventListener('blur', function () {
        keyLeft = keyRight = false;
        boostKeys = 0;
        pointers.length = 0;
        boostPointers.length = 0;
      });

      target.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        /* Taking the keyboard.

           preventDefault on a pointerdown stops the browser doing what it
           normally would, and one of those things is moving focus. Inside an
           iframe — which is exactly where this game is played on the web —
           that meant clicking the car never focused the frame, so every arrow
           key and every space went to the page BEHIND the game and the whole
           keyboard appeared dead on a laptop. Asking for focus explicitly is
           the fix; preventScroll stops the host page jumping when we do. */
        grabFocus(target);
        lastDevice = 'pointer';
        tap = { x: e.clientX, y: e.clientY };
        // A finger on the boost button boosts; it must not also steer.
        if (boostHitTest && boostHitTest(e.clientX, e.clientY)) {
          boostPointers.push(e.pointerId);
          boostQueued = true;
          pressedOnce = true;
          return;
        }
        // An on-screen button is pressed, not steered. Without this, reaching
        // for one throws the car into a drift on the way.
        if (uiHitTest && uiHitTest(e.clientX, e.clientY)) return;
        addPointer(e.pointerId, e.clientX);
      }, active);

      target.addEventListener('pointermove', function (e) {
        if (onBoostPointer(e.pointerId)) return;
        movePointer(e.pointerId, e.clientX);
      }, active);

      // Listen on window for release: a thumb can drift off the canvas.
      function release(e) {
        for (var i = boostPointers.length - 1; i >= 0; i--) {
          if (boostPointers[i] === e.pointerId) boostPointers.splice(i, 1);
        }
        removePointer(e.pointerId);
      }
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);

      target.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    },

    steer: function () {
      if (pointers.length) return pointers[pointers.length - 1].side;
      if (keyLeft && !keyRight) return -1;
      if (keyRight && !keyLeft) return 1;
      return 0;
    },

    // Steering from the KEYBOARD only. Menus use this, because on a menu a
    // press is a tap on a card, not a request to drift — and treating it as
    // both meant a press moved the selection off the card you were tapping.
    steerKeys: function () {
      if (keyLeft && !keyRight) return -1;
      if (keyRight && !keyLeft) return 1;
      return 0;
    },

    // Forget everything currently held. Called when a race starts, so the
    // finger that pressed "race" does not also throw the car into a drift
    // before the player has even seen the road.
    releaseAll: function () {
      pointers.length = 0;
      boostPointers.length = 0;
      boostQueued = false;
      menuSteps = 0;
    },

    used: function () { return pressedOnce; },
    lastDevice: function () { return lastDevice; },

    // Arrow presses since this was last asked, then cleared.
    takeMenuStep: function () { var v = menuSteps; menuSteps = 0; return v; },

    setBoostHitTest: function (fn) { boostHitTest = fn; },
    setUiHitTest: function (fn) { uiHitTest = fn; },

    // One press, read once. Menus use this; the road does not.
    takeTap: function () { var t = tap; tap = null; return t; },
    clearTap: function () { tap = null; },

    // True once per press, then cleared — so one press is one boost.
    takeBoost: function () {
      var b = boostQueued;
      boostQueued = false;
      return b;
    },

    boostDown: function () { return boostKeys > 0 || boostPointers.length > 0; }
  };
})(window.DR = window.DR || {});
