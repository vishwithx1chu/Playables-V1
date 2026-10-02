/* save.js — everything that survives between visits, and nothing else.

   No accounts, no server, no personal information: just a JSON blob in
   localStorage, keyed to this game specifically. That is what the Playables
   rules actually allow, and it is also all a career mode needs — currency,
   which cars you own, how they're upgraded and coloured, which races you've
   unlocked, and your best result on each one.

   Every read and write is wrapped, because localStorage is not guaranteed to
   exist. A Playables embed can run in a sandboxed webview that blocks it
   entirely, and a private-browsing tab can throw the moment you touch it.
   Neither of those should be able to crash the game — they should just mean
   progress does not persist for that session, silently. */

(function (DR) {
  'use strict';

  var STORAGE_KEY = 'driftrun_save_v1';
  var VERSION = 1;

  function freshData() {
    return {
      version: VERSION,
      currency: 0,
      ownedCars: [],          // filled in with the starter car by init()
      selectedCar: null,
      carColors: {},          // carId -> colour string
      upgrades: {},           // carId -> { tires, engine, transmission, nos }, each a tier 0-3
      unlocked: [],           // race ids
      bestResults: {},        // race id -> { value, lowerIsBetter }
      tutorialDone: false,
      xp: 0,                  // driver experience, all time
      stars: {}               // story event id -> best stars earned, 0-3
    };
  }

  var data = freshData();
  var storageOk = true;      // false once a read or write has thrown once

  function tryStorage(fn, fallback) {
    if (!storageOk) return fallback;
    try {
      return fn();
    } catch (e) {
      // One failure is enough to stop trying — repeatedly throwing on every
      // frame-adjacent save would be its own kind of slowdown.
      storageOk = false;
      return fallback;
    }
  }

  function load() {
    var raw = tryStorage(function () { return window.localStorage.getItem(STORAGE_KEY); }, null);
    if (!raw) return;
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return;   // corrupted JSON: keep the fresh defaults rather than guess
    }
    // A version that does not match what this code expects is treated the
    // same as no save at all. Starting over beats feeding an old shape into
    // code that assumes a newer one.
    if (!parsed || parsed.version !== VERSION) return;
    data = parsed;
    // Fields added after a save was first written get their defaults, so
    // an older save keeps its progress rather than being thrown away.
    if (typeof data.xp !== 'number') data.xp = 0;
    if (!data.stars || typeof data.stars !== 'object') data.stars = {};
  }

  function persist() {
    tryStorage(function () {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    }, false);
  }

  // Called once, after the game knows what the starter car's id is. Never
  // overwrites an existing save — only fills in a car list that is empty.
  function ensureStarter(carId) {
    if (data.ownedCars.length === 0) {
      data.ownedCars.push(carId);
      data.selectedCar = carId;
      data.upgrades[carId] = { tires: 0, engine: 0, transmission: 0, nos: 0 };
      persist();
    }
  }

  function currency() { return data.currency; }
  function addCurrency(n) { data.currency = Math.max(0, data.currency + n); persist(); }
  function spendCurrency(n) {
    if (data.currency < n) return false;
    data.currency -= n;
    persist();
    return true;
  }

  function ownedCars() { return data.ownedCars.slice(); }
  function ownsCar(carId) { return data.ownedCars.indexOf(carId) !== -1; }
  function buyCar(carId, cost) {
    if (ownsCar(carId)) return true;
    if (!spendCurrency(cost)) return false;
    data.ownedCars.push(carId);
    data.upgrades[carId] = { tires: 0, engine: 0, transmission: 0, nos: 0 };
    persist();
    return true;
  }

  function selectedCar() { return data.selectedCar; }
  function selectCar(carId) { data.selectedCar = carId; persist(); }

  function carColor(carId) { return data.carColors[carId] || null; }
  function setCarColor(carId, color) { data.carColors[carId] = color; persist(); }

  function upgradeLevel(carId, system) {
    var u = data.upgrades[carId];
    return u ? (u[system] || 0) : 0;
  }
  function setUpgradeLevel(carId, system, tier) {
    if (!data.upgrades[carId]) data.upgrades[carId] = { tires: 0, engine: 0, transmission: 0, nos: 0 };
    data.upgrades[carId][system] = tier;
    persist();
  }

  function isUnlocked(raceId) { return data.unlocked.indexOf(raceId) !== -1; }
  function unlock(raceId) {
    if (!isUnlocked(raceId)) { data.unlocked.push(raceId); persist(); }
  }

  function bestResult(raceId) { return data.bestResults[raceId] || null; }
  // lowerIsBetter: true for a lap/clock time, false for a distance/score.
  function recordResult(raceId, value, lowerIsBetter) {
    var cur = data.bestResults[raceId];
    var better = !cur || (lowerIsBetter ? value < cur.value : value > cur.value);
    if (better) { data.bestResults[raceId] = { value: value, lowerIsBetter: !!lowerIsBetter }; persist(); }
    return better;
  }

  function xp() { return data.xp || 0; }
  function addXp(n) { data.xp = Math.max(0, (data.xp || 0) + n); persist(); }
  function stars(id) { return (data.stars && data.stars[id]) || 0; }
  function setStars(id, n) {
    if (!data.stars) data.stars = {};
    if (n > (data.stars[id] || 0)) { data.stars[id] = n; persist(); return true; }
    return false;
  }
  function allStars() { return data.stars || {}; }

  function tutorialDone() { return !!data.tutorialDone; }
  function setTutorialDone() { data.tutorialDone = true; persist(); }

  // For a "reset my progress" option, and for tests. A genuine wipe, right
  // down to the starter car grant — whoever calls this needs to follow it
  // with ensureStarter() again (or a reload, which does the same thing),
  // exactly like a real boot does. Left that way on purpose rather than
  // re-granting the starter here, so this stays a true reset.
  function resetAll() {
    data = freshData();
    persist();
  }

  DR.Save = {
    load: load,
    ensureStarter: ensureStarter,
    currency: currency, addCurrency: addCurrency, spendCurrency: spendCurrency,
    ownedCars: ownedCars, ownsCar: ownsCar, buyCar: buyCar,
    selectedCar: selectedCar, selectCar: selectCar,
    carColor: carColor, setCarColor: setCarColor,
    upgradeLevel: upgradeLevel, setUpgradeLevel: setUpgradeLevel,
    isUnlocked: isUnlocked, unlock: unlock,
    bestResult: bestResult, recordResult: recordResult,
    tutorialDone: tutorialDone, setTutorialDone: setTutorialDone,
    xp: xp, addXp: addXp, stars: stars, setStars: setStars, allStars: allStars,
    resetAll: resetAll,
    // Test/inspection only — never used for game logic decisions.
    _raw: function () { return data; },
    _storageOk: function () { return storageOk; }
  };
})(window.DR = window.DR || {});
