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
     has to know which direction is good for which stat.

     The range each bar is drawn against is fixed and hand-picked around
     Nightrunner's stock 1.00 (which always reads as a 50%-filled bar on
     every stat), not the roster's own current min/max. Normalizing against
     the roster meant any car merely average, not worst, could still show a
     literal empty bar — six of eight cars have a perfectly ordinary stock
     boost, for instance, but only two values ever appear on that stat, so
     the other six all pinned to 0%. A fixed range also leaves headroom
     above today's best car for Phase 3's upgrade tiers to fill in, rather
     than needing every bar re-based once upgrades exist. */
  var STAT_KEYS = {
    speed:    { field: 'speedMult',      invert: false, lo: 0.70, hi: 1.30 },
    grip:     { field: 'gripMult',       invert: true,  lo: 0.75, hi: 1.25 },
    handling: { field: 'tauMult',        invert: true,  lo: 0.70, hi: 1.30 },
    boost:    { field: 'boostPeakMult',  invert: false, lo: 0.65, hi: 1.35 }
  };

  /* Upgrades converge cars toward a shared ceiling instead of applying the
     same flat percentage to everyone. A flat percentage preserves the exact
     ratio between cars forever — equal treatment, but not what "some
     difference, not too much once maxed" actually asks for. Instead, each
     tier closes part of the gap between a car's OWN stock value and a
     fixed cap per field (the same cap for every car), so a car that starts
     further behind gains more per tier than one that starts close to the
     cap already. TIER_FRACTION never reaches 1.0, so a real gap — smaller,
     not zero — still exists at tier 3. Caps sit at or beyond today's best
     roster value on every field, so an upgrade never makes a car worse. */
  var CONVERGE_CAP = {
    speedMult: 1.30, gripMult: 0.75, tauMult: 0.68,
    boostPeakMult: 1.35, boostHoldMult: 1.35
  };
  var TIER_FRACTION = [0, 0.30, 0.55, 0.75];
  var MAX_TIER = 3;

  // system -> which stat field(s) it converges, and the label/cost bucket
  // used by the Garage's upgrade screen.
  var UPGRADE_SYSTEMS = [
    { id: 'tires', name: 'TYRES', fields: ['gripMult'] },
    { id: 'engine', name: 'ENGINE', fields: ['speedMult'] },
    { id: 'transmission', name: 'TRANSMISSION', fields: ['tauMult'] },
    { id: 'nos', name: 'NOS', fields: ['boostPeakMult', 'boostHoldMult'] }
  ];
  var TIER_COST_FRACTION = [0, 0.22, 0.30, 0.40];   // incremental, per tier

  function upgradeSystems() { return UPGRADE_SYSTEMS; }

  function convergedValue(base, field, tier) {
    var cap = CONVERGE_CAP[field];
    return base + (cap - base) * TIER_FRACTION[tier || 0];
  }

  // The stats a car actually races with right now: stock numbers plus
  // whatever's been bought for it. Nothing here changes the ROSTER's own
  // stock stats.js/game.js/car.js read — a car's upgrades live entirely in
  // save.js, exactly like its colour does.
  function effectiveStats(def) {
    var out = {}, field;
    for (field in def.stats) out[field] = def.stats[field];
    for (var i = 0; i < UPGRADE_SYSTEMS.length; i++) {
      var sys = UPGRADE_SYSTEMS[i];
      var tier = DR.Save.upgradeLevel(def.id, sys.id);
      for (var j = 0; j < sys.fields.length; j++) {
        field = sys.fields[j];
        out[field] = convergedValue(def.stats[field], field, tier);
      }
    }
    return out;
  }

  // A car with no price (the starter, or a story-exclusive) still needs a
  // reference point to scale upgrade costs against — roughly where it
  // would sit if it were sold, not zero and not free.
  function refCost(def) {
    if (def.cost) return def.cost;
    return def.id === 'nightrunner' ? 600 : 2400;
  }

  // The cost to go from tier-1 to `tier` (1..3) on one system for one car.
  function tierCost(def, tier) {
    return Math.round(refCost(def) * TIER_COST_FRACTION[tier]);
  }

  function upgradeMaxed(carId, systemId) {
    return DR.Save.upgradeLevel(carId, systemId) >= MAX_TIER;
  }

  // Spends the currency and raises the tier in one step, or does nothing
  // and reports failure — the same shape as Save.buyCar, so the Garage
  // screen handles both the same way.
  function buyUpgrade(carId, systemId) {
    var def = get(carId);
    if (!def || !DR.Save.ownsCar(carId)) return false;
    var tier = DR.Save.upgradeLevel(carId, systemId);
    if (tier >= MAX_TIER) return false;
    var cost = tierCost(def, tier + 1);
    if (!DR.Save.spendCurrency(cost)) return false;
    DR.Save.setUpgradeLevel(carId, systemId, tier + 1);
    return true;
  }

  function statFrac(def, key) {
    var spec = STAT_KEYS[key];
    if (!spec || !def) return 0;
    var v = effectiveStats(def)[spec.field];
    var f = Math.max(0, Math.min(1, (v - spec.lo) / (spec.hi - spec.lo)));
    return spec.invert ? 1 - f : f;
  }

  // The only function that actually changes how the car feels. Called once
  // whenever the selected car (or its colour, or an upgrade) changes — at
  // boot, any time the garage saves a new choice, and right after a
  // purchase so the car you're about to drive matches what you just paid
  // for immediately, not on the next restart.
  function applyToCar(carId) {
    var def = get(carId) || get('nightrunner');
    var stats = effectiveStats(def);
    DR.Car.setArchetype(def.archetype);
    DR.Car.setStats(stats);
    DR.Car.setPalette(DR.Save.carColor(def.id) || def.color);
    if (DR.Game && DR.Game.applyCarTuning) {
      DR.Game.applyCarTuning({
        speedMult: stats.speedMult,
        boostPeakMult: stats.boostPeakMult,
        boostHoldMult: stats.boostHoldMult
      });
    }
  }

  DR.Cars = { roster: roster, get: get, palette: palette, applyToCar: applyToCar,
              statFrac: statFrac, upgradeSystems: upgradeSystems, tierCost: tierCost,
              upgradeMaxed: upgradeMaxed, buyUpgrade: buyUpgrade, MAX_TIER: MAX_TIER };
})(window.DR = window.DR || {});
