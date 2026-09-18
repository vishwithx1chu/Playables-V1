/* cars.js — the garage roster, and the one function that actually applies a
   car to the game. car.js and game.js each own a handful of "how the car
   feels" numbers; this is the only place that knows how a specific car's
   stats turn into those numbers, so there is exactly one place to look when
   a car feels wrong, and exactly one place upgrades (Phase 3) plug into.

   Every multiplier is relative to Nightrunner, the starter car, at 1.0 on
   every axis — which is also exactly what the game already was before the
   garage existed. See docs/content-plan.md for the design behind these
   numbers; this file is where they become real. */

(function (DR) {
  'use strict';

  var ROSTER = [
    { id: 'nightrunner', name: 'Nightrunner', archetype: 'sport', cost: 0,
      color: '#c8121f', blurb: 'The one you already have.',
      stats: { speedMult: 1.00, gripMult: 1.00, slipMult: 1.00, tauMult: 1.00,
                boostPeakMult: 1.00, boostHoldMult: 1.00 } },
    { id: 'alleycat', name: 'Alleycat', archetype: 'compact', cost: 500,
      color: '#f2b705', blurb: 'Cheap, tight, forgiving.',
      stats: { speedMult: 0.92, gripMult: 0.90, slipMult: 1.00, tauMult: 1.00,
                boostPeakMult: 1.00, boostHoldMult: 1.00 } },
    { id: 'vantage', name: 'Vantage', archetype: 'sport', cost: 900,
      color: '#d8e6ee', blurb: 'A faster Nightrunner.',
      stats: { speedMult: 1.06, gripMult: 1.00, slipMult: 1.00, tauMult: 0.95,
                boostPeakMult: 1.00, boostHoldMult: 1.00 } },
    { id: 'ecliptic', name: 'Ecliptic', archetype: 'compact', cost: 1200,
      color: '#8b3dff', blurb: 'Boost-hungry.',
      stats: { speedMult: 0.95, gripMult: 0.93, slipMult: 1.00, tauMult: 1.00,
                boostPeakMult: 1.15, boostHoldMult: 1.25 } },
    { id: 'warbird', name: 'Warbird', archetype: 'muscle', cost: 1400,
      color: '#ff6a1f', blurb: 'Fast, clumsy until tamed.',
      stats: { speedMult: 1.14, gripMult: 1.12, slipMult: 1.00, tauMult: 1.08,
                boostPeakMult: 1.00, boostHoldMult: 1.00 } },
    { id: 'ironclad', name: 'Ironclad', archetype: 'muscle', cost: 1800,
      color: '#5a6472', blurb: 'The tank.',
      stats: { speedMult: 1.10, gripMult: 1.05, slipMult: 1.00, tauMult: 1.00,
                boostPeakMult: 1.00, boostHoldMult: 1.00 } },
    { id: 'specter', name: 'Specter', archetype: 'sport', cost: 2200,
      color: '#ff2f8e', blurb: 'Glass cannon.',
      stats: { speedMult: 1.04, gripMult: 1.00, slipMult: 1.12, tauMult: 0.85,
                boostPeakMult: 1.00, boostHoldMult: 1.00 } },
    { id: 'apex', name: 'Apex', archetype: 'sport', cost: null,
      color: '#ffd76a', blurb: 'Story-exclusive. Never for sale.',
      stats: { speedMult: 1.16, gripMult: 0.88, slipMult: 1.08, tauMult: 0.85,
                boostPeakMult: 1.20, boostHoldMult: 1.20 } }
  ];

  // Curated, not a free colour wheel — every swatch is picked to already fit
  // the neon palette the rest of the game uses, so a player can't land on a
  // colour that looks wrong against the road and sky.
  var PALETTE = ['#c8121f', '#ff6a1f', '#f2b705', '#7dffb0',
                 '#22e6ff', '#8b3dff', '#ff2f8e', '#eaf6ff'];

  var byId = {};
  for (var i = 0; i < ROSTER.length; i++) byId[ROSTER[i].id] = ROSTER[i];

  function roster() { return ROSTER; }
  function get(carId) { return byId[carId] || null; }
  function palette() { return PALETTE.slice(); }

  /* Stat bars for the garage. "Grip" and "Handling" are LOWER-is-better
     multipliers (a smaller turning circle, a snappier taus), so they are
     inverted here — the garage screen just draws four bars 0..1 and never
     has to know which direction is good for which stat. Range is the actual
     spread across the roster, not a guessed one, so Alleycat's grip bar is
     full only because nothing else in the garage turns tighter. */
  var STAT_KEYS = {
    speed:    { field: 'speedMult',      invert: false },
    grip:     { field: 'gripMult',       invert: true  },
    handling: { field: 'tauMult',        invert: true  },
    boost:    { field: 'boostPeakMult',  invert: false }
  };
  var RANGE = {};
  (function computeRanges() {
    for (var key in STAT_KEYS) {
      var field = STAT_KEYS[key].field, lo = Infinity, hi = -Infinity;
      for (var i = 0; i < ROSTER.length; i++) {
        var v = ROSTER[i].stats[field];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      RANGE[key] = { lo: lo, hi: hi };
    }
  })();

  function statFrac(def, key) {
    var spec = STAT_KEYS[key], r = RANGE[key];
    if (!spec || !def) return 0;
    var v = def.stats[spec.field];
    var f = r.hi > r.lo ? (v - r.lo) / (r.hi - r.lo) : 1;
    return spec.invert ? 1 - f : f;
  }

  // The only function that actually changes how the car feels. Called once
  // whenever the selected car (or its colour) changes — at boot, and any
  // time the garage saves a new choice. Upgrade tiers (Phase 3) are read
  // here too, once they exist; until then every car's upgrades are stock,
  // which multiplies everything by exactly 1.
  function applyToCar(carId) {
    var def = get(carId) || get('nightrunner');
    DR.Car.setArchetype(def.archetype);
    DR.Car.setStats(def.stats);
    DR.Car.setPalette(DR.Save.carColor(def.id) || def.color);
    if (DR.Game && DR.Game.applyCarTuning) {
      DR.Game.applyCarTuning({
        speedMult: def.stats.speedMult,
        boostPeakMult: def.stats.boostPeakMult,
        boostHoldMult: def.stats.boostHoldMult
      });
    }
  }

  DR.Cars = { roster: roster, get: get, palette: palette, applyToCar: applyToCar,
              statFrac: statFrac };
})(window.DR = window.DR || {});
