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

  DR.Input = {
    init: function (target) {
      var active = { passive: false };

      window.addEventListener('keydown', function (e) {
        if (e.repeat) return;
        if (isLeftKey(e)) { keyLeft = true; pressedOnce = true; e.preventDefault(); }
        else if (isRightKey(e)) { keyRight = true; pressedOnce = true; e.preventDefault(); }
      }, active);

      window.addEventListener('keyup', function (e) {
        if (isLeftKey(e)) keyLeft = false;
        else if (isRightKey(e)) keyRight = false;
      });

      // Losing focus mid-hold must not leave the car locked in a drift.
      window.addEventListener('blur', function () {
        keyLeft = keyRight = false;
        pointers.length = 0;
      });

      target.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        addPointer(e.pointerId, e.clientX);
      }, active);

      target.addEventListener('pointermove', function (e) {
        movePointer(e.pointerId, e.clientX);
      }, active);

      // Listen on window for release: a thumb can drift off the canvas.
      window.addEventListener('pointerup', function (e) { removePointer(e.pointerId); });
      window.addEventListener('pointercancel', function (e) { removePointer(e.pointerId); });

      target.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    },

    steer: function () {
      if (pointers.length) return pointers[pointers.length - 1].side;
      if (keyLeft && !keyRight) return -1;
      if (keyRight && !keyLeft) return 1;
      return 0;
    },

    used: function () { return pressedOnce; }
  };
})(window.DR = window.DR || {});
