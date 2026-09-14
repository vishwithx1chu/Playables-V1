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

  // Boost. Fires once per press: holding it down does nothing extra.
  var boostQueued = false;
  var boostHeld = false;
  var boostKeys = 0;
  var boostPointers = [];      // pointers that landed on the button, not the road
  var boostHitTest = null;     // set by the game, which knows the screen layout

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

  function onBoostPointer(id) {
    for (var i = 0; i < boostPointers.length; i++) if (boostPointers[i] === id) return true;
    return false;
  }

  DR.Input = {
    init: function (target) {
      var active = { passive: false };

      window.addEventListener('keydown', function (e) {
        if (e.repeat) return;
        if (isBoostKey(e)) { boostQueued = true; boostKeys++; pressedOnce = true; e.preventDefault(); }
        else if (isLeftKey(e)) { keyLeft = true; pressedOnce = true; e.preventDefault(); }
        else if (isRightKey(e)) { keyRight = true; pressedOnce = true; e.preventDefault(); }
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
        // A finger on the boost button boosts; it must not also steer.
        if (boostHitTest && boostHitTest(e.clientX, e.clientY)) {
          boostPointers.push(e.pointerId);
          boostQueued = true;
          pressedOnce = true;
          return;
        }
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

    used: function () { return pressedOnce; },

    setBoostHitTest: function (fn) { boostHitTest = fn; },

    // True once per press, then cleared — so one press is one boost.
    takeBoost: function () {
      var b = boostQueued;
      boostQueued = false;
      return b;
    },

    boostDown: function () { return boostKeys > 0 || boostPointers.length > 0; }
  };
})(window.DR = window.DR || {});
