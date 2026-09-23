/* career.js — the long game around the races: a driver level that grows
   with everything you do, and stars on every story event.

   Racing games keep you coming back with more than the next race: a level
   bar that's always nearly full, stars to go back for, and a little
   reward every time either moves. This is that, kept small:

   - XP for every finished event, more for finishing higher, plus your
     style points from the race (overtakes, takedowns, a perfect start...).
   - Levels get a little further apart as you go; each one pays credits.
   - Three stars per story event: one for clearing it, two for doing it
     well, three for doing it brilliantly. Each new star pays 10 CR, and
     the totals show on the map.

   All of it together (style, level-ups, stars) adds about 30% on top of
   the story's own prizes over a full career — enough to feel, not so much
   that upgrades come early and the cities go soft. */

(function (DR) {
  'use strict';

  function need(level) { return 150 + 60 * (level - 1); }   // XP from level L to L+1

  function levelInfo(xp) {
    var level = 1, rest = xp;
    while (rest >= need(level)) { rest -= need(level); level++; }
    return { level: level, into: rest, need: need(level), frac: rest / need(level) };
  }

  function info() { return levelInfo(DR.Save.xp()); }

  function levelReward(level) { return 15 + 5 * level; }

  // Adds XP; returns what happened, for the results screen to show.
  function addXp(n) {
    var before = info();
    DR.Save.addXp(n);
    var after = info();
    var gained = after.level - before.level, cash = 0;
    for (var L = before.level + 1; L <= after.level; L++) cash += levelReward(L);
    if (cash) DR.Save.addCurrency(cash);
    return { xp: n, before: before, after: after, levelsGained: gained, cash: cash };
  }

  // XP for an event, before style points.
  function xpFor(kind, pos, ok) {
    if (kind === 'race') return [150, 110, 80, 60][Math.max(1, Math.min(4, pos)) - 1];
    if (kind === 'boss') return ok ? 260 : 70;
    if (kind === 'time') return ok ? 120 : 45;
    if (kind === 'solo') return 90;
    if (kind === 'tutorial') return 100;
    return 60;
  }

  /* Stars for a story event. r: { type, ok, pos, need, margin (seconds
     ahead of the next car, or under the target), frac (share under the
     target, time attacks), walls } */
  function starsFor(r) {
    if (!r.ok) return 0;
    if (r.type === 'time') return r.frac >= 0.06 ? 3 : r.frac >= 0.03 ? 2 : 1;
    if (r.type === 'boss') return (r.walls === 0 && r.margin >= 0) ? 3 : r.margin >= 2 ? 2 : 1;
    // A race.
    if (r.pos !== 1) return 1;
    return (r.margin >= 1.5 && r.walls <= 1) ? 3 : 2;
  }
  var STAR_PAY = 10;

  // Records stars; returns how many are new (and pays for them).
  function awardStars(id, n) {
    var had = DR.Save.stars(id);
    if (n <= had) return { had: had, now: had, fresh: 0, cash: 0 };
    DR.Save.setStars(id, n);
    var cash = (n - had) * STAR_PAY;
    DR.Save.addCurrency(cash);
    return { had: had, now: n, fresh: n - had, cash: cash };
  }

  function cityStars(ci) {
    var ev = DR.Story.cities()[ci].events, got = 0;
    for (var i = 0; i < ev.length; i++) got += DR.Save.stars('story:' + DR.Story.eventId(ci, i));
    return { got: got, max: ev.length * 3 };
  }
  function totalStars() {
    var got = 0, max = 0, n = DR.Story.cities().length;
    for (var i = 0; i < n; i++) { var c = cityStars(i); got += c.got; max += c.max; }
    return { got: got, max: max };
  }

  DR.Career = {
    info: info, levelInfo: levelInfo, addXp: addXp, xpFor: xpFor, levelReward: levelReward,
    starsFor: starsFor, awardStars: awardStars, cityStars: cityStars, totalStars: totalStars,
    STAR_PAY: STAR_PAY
  };
})(window.DR = window.DR || {});
