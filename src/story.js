/* story.js — The Circuit: ten cities, their events, and what winning them
   unlocks.

   A city is one circuit, recoloured and dressed as somewhere, run by a boss
   and their crew. Each city holds 3-4 events:

     RACE         three laps against three of the boss's crew. Finish in the
                  place the event asks for (top 3 early on, only a win
                  later) to clear it.
     TIME ATTACK  you alone against a target time over two or three laps.
     BOSS         one on one against the boss, three laps, and only a win
                  counts. The boss race stays locked until every other event
                  in the city is cleared.

   Beating a boss opens the next city. Six bosses hand over their own car
   when you beat them; the other four pay a big cash prize instead — the
   four whose cities already point you at buying a specific car from the
   Garage (see docs/content-plan.md for why it's split that way).

   Difficulty rises by a fixed step per city, in the same currency rivals
   already use: skill, where 1.0 laps in exactly the track's target time.
   So "city 6 is harder than city 5" is a number you can read off, not a
   guess — and the numbers are first drafts, to be tuned once real people
   play them. */

(function (DR) {
  'use strict';

  // Track indices into road.js. Until the three new circuits exist
  // (Coastal Run, Underpass, The Circuit), their cities run on the closest
  // existing layout in character — see the content plan's kit table.
  var RING = 0, MAZE = 1, GRAND = 2, COAST = 3, UNDER = 4, FINALE = 5;

  /* Colours for each city, as overrides of road.js's DEFAULT_THEME. Only
     decoration changes; the road stays near-black and the edges stay a
     bright neon, so the road-versus-edge contrast rule holds everywhere. */
  var THEMES = {
    portside: {
      id: 'portside',
      sky: ['#050b14', '#0d1d2e', '#1d3a4c', '#3d6470'],
      stars: 0.35,
      sunDisc: ['#f4e3b0', '#d9a860', '#a8654a'], sunHalo: ['rgba(220,190,130,0.30)', 'rgba(120,150,170,0.14)'],
      sunR: 170, sunBands: false,
      ground: ['#0e1a22', '#081016', '#04080c'],
      grid: 'rgba(90,180,190,0.14)', road: '#0b1016',
      edge: [63, 224, 208], dash: 'rgba(255,170,60,0.85)',
      wallFace: '#14242e', wallUpper: '#1d3440', wallSkirt: '#070d12', wallStripe: 'rgba(255,170,60,0.26)',
      fog: ['rgba(70,100,112,1)', 'rgba(52,78,90,0.9)', 'rgba(20,32,40,0)'],
      horizon: { kind: 'city', count: 46, minH: 22, maxH: 90, color: '#0a141c', far: '#122330',
                 window: 'rgba(255,190,90,0.7)', seed: 101 }
    },
    sundown: {
      id: 'sundown',
      sky: ['#1a0b1e', '#4a1a2e', '#b33e22', '#ff9a3c'],
      stars: 0.2,
      sunDisc: ['#fff1b0', '#ffb347', '#ff5a36'], sunHalo: ['rgba(255,170,70,0.50)', 'rgba(255,90,60,0.22)'],
      sunR: 240,
      ground: ['#2a1410', '#170b08', '#0a0504'],
      grid: 'rgba(255,150,80,0.16)', road: '#140c0a',
      edge: [255, 178, 77], dash: 'rgba(255,90,54,0.88)',
      wallFace: '#3a1a14', wallUpper: '#52261a', wallSkirt: '#120806', wallStripe: 'rgba(255,90,54,0.30)',
      fog: ['rgba(150,70,40,1)', 'rgba(110,45,30,0.85)', 'rgba(40,16,12,0)'],
      horizon: { kind: 'mountains', count: 16, minH: 40, maxH: 120, color: '#2a0f14', far: '#4a1a1c', seed: 202 }
    },
    oldquarter: {
      id: 'oldquarter',
      sky: ['#120a06', '#2e1c0e', '#5c3814', '#a86a26'],
      stars: 0.5,
      sunDisc: ['#ffe1a0', '#ffb040', '#e07020'], sunHalo: ['rgba(255,176,64,0.36)', 'rgba(200,110,30,0.16)'],
      sunR: 150, sunBands: false,
      ground: ['#1c1208', '#100a05', '#070402'],
      grid: 'rgba(255,190,90,0.12)', road: '#110c08',
      edge: [255, 207, 106], dash: 'rgba(255,140,58,0.85)',
      wallFace: '#2a1c10', wallUpper: '#3c2816', wallSkirt: '#0c0804', wallStripe: 'rgba(255,207,106,0.22)',
      fog: ['rgba(120,80,40,1)', 'rgba(90,58,28,0.85)', 'rgba(30,20,10,0)'],
      horizon: { kind: 'city', count: 60, minH: 30, maxH: 110, color: '#140c06', far: '#24160c',
                 window: 'rgba(255,200,110,0.85)', seed: 303 }
    },
    coastal: {
      id: 'coastal',
      sky: ['#02060f', '#08183a', '#16407a', '#3b82c0'],
      stars: 1,
      sunDisc: ['#f4fbff', '#cfe8ff', '#8fb8e8'], sunHalo: ['rgba(190,225,255,0.30)', 'rgba(80,140,220,0.14)'],
      sunR: 110, sunBands: false,
      ground: ['#061426', '#030b16', '#01050a'],
      grid: 'rgba(120,200,255,0.16)', road: '#060b14',
      edge: [125, 227, 255], dash: 'rgba(60,134,255,0.88)',
      wallFace: '#0e1e36', wallUpper: '#16304e', wallSkirt: '#040a14', wallStripe: 'rgba(125,227,255,0.22)',
      fog: ['rgba(40,90,140,1)', 'rgba(28,66,110,0.85)', 'rgba(8,20,40,0)'],
      horizon: { kind: 'mountains', count: 14, minH: 50, maxH: 150, color: '#030a18', far: '#0a1a34', seed: 404 }
    },
    steel: {
      id: 'steel',
      sky: ['#0b0b0e', '#211f24', '#43342f', '#7a4a2a'],
      stars: 0.15,
      sunDisc: ['#ffcf80', '#ff7a1a', '#c0341a'], sunHalo: ['rgba(255,122,26,0.36)', 'rgba(160,60,30,0.18)'],
      sunR: 190,
      ground: ['#161416', '#0c0b0c', '#050505'],
      grid: 'rgba(255,140,60,0.15)', road: '#0f0e10',
      edge: [255, 122, 26], dash: 'rgba(232,232,240,0.75)',
      wallFace: '#26222a', wallUpper: '#36303a', wallSkirt: '#0a090b', wallStripe: 'rgba(255,122,26,0.28)',
      fog: ['rgba(100,80,70,1)', 'rgba(70,56,50,0.88)', 'rgba(24,20,20,0)'],
      horizon: { kind: 'city', count: 40, minH: 40, maxH: 150, color: '#0c0a0c', far: '#1c181a',
                 window: 'rgba(255,120,40,0.8)', seed: 505 }
    },
    downtown: {
      id: 'downtown',
      sky: ['#10031e', '#2a0846', '#651274', '#c01f78'],
      stars: 0.6,
      sunDisc: ['#ffd1f0', '#ff5ad8', '#b020c0'], sunHalo: ['rgba(255,90,216,0.40)', 'rgba(140,40,200,0.20)'],
      sunR: 200,
      ground: ['#1a0826', '#0e0418', '#06020c'],
      grid: 'rgba(255,90,216,0.18)', road: '#0f0818',
      edge: [255, 47, 216], dash: 'rgba(34,230,255,0.88)',
      wallFace: '#2a0f3e', wallUpper: '#3c1656', wallSkirt: '#0e0418', wallStripe: 'rgba(34,230,255,0.28)',
      fog: ['rgba(120,30,110,1)', 'rgba(86,20,90,0.86)', 'rgba(30,8,40,0)'],
      horizon: { kind: 'city', count: 80, minH: 60, maxH: 210, color: '#0c0414', far: '#1e0a2c',
                 window: 'rgba(120,240,255,0.85)', seed: 606 }
    },
    highpass: {
      id: 'highpass',
      sky: ['#0a0d1c', '#222844', '#4c5478', '#9aa4c6'],
      stars: 0.9,
      sunDisc: ['#f6f2ff', '#cfc6f0', '#9a8ed0'], sunHalo: ['rgba(220,210,255,0.30)', 'rgba(150,140,210,0.14)'],
      sunR: 130, sunBands: false,
      ground: ['#161a28', '#0c0f18', '#05070c'],
      grid: 'rgba(185,199,255,0.14)', road: '#0c0e16',
      edge: [185, 199, 255], dash: 'rgba(255,255,255,0.6)',
      wallFace: '#1e2236', wallUpper: '#2c3250', wallSkirt: '#080a12', wallStripe: 'rgba(185,199,255,0.20)',
      fog: ['rgba(150,160,190,1)', 'rgba(110,118,150,0.88)', 'rgba(36,40,56,0)'],
      horizon: { kind: 'mountains', count: 18, minH: 70, maxH: 220, color: '#141828', far: '#343c5c', seed: 707 }
    },
    underpass: {
      id: 'underpass',
      sky: ['#010204', '#05080f', '#0c1522', '#182a3c'],
      stars: 0.1,
      sunDisc: ['#c8fff0', '#60f0c0', '#20a080'], sunHalo: ['rgba(60,255,176,0.22)', 'rgba(20,120,100,0.12)'],
      sunR: 120, sunBands: false,
      ground: ['#081018', '#04080c', '#010204'],
      grid: 'rgba(60,255,176,0.12)', road: '#070a0e',
      edge: [60, 255, 176], dash: 'rgba(60,255,176,0.7)',
      wallFace: '#0e1a22', wallUpper: '#162632', wallSkirt: '#04080a', wallStripe: 'rgba(60,255,176,0.22)',
      fog: ['rgba(30,60,70,1)', 'rgba(20,44,52,0.9)', 'rgba(6,14,18,0)'],
      horizon: { kind: 'city', count: 70, minH: 50, maxH: 170, color: '#03060a', far: '#0a1420',
                 window: 'rgba(60,255,176,0.6)', seed: 808 }
    },
    skyline: {
      id: 'skyline',
      sky: ['#090514', '#20103c', '#4a1f6e', '#d18a3a'],
      stars: 0.7,
      sunDisc: ['#fff0c0', '#ffd76a', '#e08a30'], sunHalo: ['rgba(255,215,106,0.40)', 'rgba(180,120,255,0.18)'],
      sunR: 220,
      ground: ['#180e28', '#0e0818', '#06040c'],
      grid: 'rgba(179,136,255,0.18)', road: '#0e0a18',
      edge: [255, 215, 106], dash: 'rgba(179,136,255,0.88)',
      wallFace: '#241640', wallUpper: '#342058', wallSkirt: '#0c0618', wallStripe: 'rgba(255,215,106,0.24)',
      fog: ['rgba(110,60,120,1)', 'rgba(80,40,96,0.86)', 'rgba(28,14,40,0)'],
      horizon: { kind: 'city', count: 90, minH: 80, maxH: 260, color: '#0a0616', far: '#1c1034',
                 window: 'rgba(255,215,106,0.85)', seed: 909 }
    },
    circuit: {
      id: 'circuit',
      edge: [255, 215, 106], dash: 'rgba(255,74,206,0.9)',
      wallStripe: 'rgba(255,215,106,0.30)',
      horizon: { kind: 'city', count: 70, minH: 40, maxH: 200, color: '#0e0620', far: '#221040',
                 window: 'rgba(255,74,206,0.8)', seed: 1010 }
    }
  };

  /* The ten cities. `events` lists what's in each; the numbers that make
     one harder than the next are derived from the city's index below, so
     the whole difficulty curve lives in a handful of lines. */
  var CITIES = [
    { id: 'portside', name: 'PORTSIDE', track: MAZE, boss: 'FENDER', bossColor: '#3fa9f5', bossArch: 'sport',
      reward: { car: 'harbormaster' }, crew: ['DECKHAND', 'BILGE', 'RUST'],
      intro: 'Fog off the water, cranes in the dark. Fender runs the docks.',
      spec: 'Your starter car is enough.',
      events: [{ type: 'race', need: 3 }, { type: 'time', laps: 2 }, { type: 'boss' }] },
    { id: 'sundown', name: 'SUNDOWN STRIP', track: RING, boss: 'MIRAGE', bossColor: '#ffb347', bossArch: 'compact',
      reward: { cash: true }, crew: ['DUNE', 'SCORCH', 'HAZE'],
      intro: 'Desert dusk and long straights. Mirage is never where you think.',
      spec: 'Alleycat, or Tyres tier 1.',
      events: [{ type: 'race', need: 3 }, { type: 'race', need: 2 }, { type: 'time', laps: 2 }, { type: 'boss' }] },
    { id: 'oldquarter', name: 'OLD QUARTER', track: UNDER, boss: 'CUTLASS', bossColor: '#ffcf6a', bossArch: 'compact',
      reward: { cash: true }, crew: ['COBBLE', 'LANTERN', 'ALLEY'],
      intro: 'Cobbles and sodium lamps. Cutlass knows every corner blind.',
      spec: 'A Compact car, or Tyres tier 2.',
      events: [{ type: 'race', need: 3 }, { type: 'time', laps: 2 }, { type: 'time', laps: 3 }, { type: 'boss' }] },
    { id: 'coastal', name: 'COASTAL RUN', track: COAST, boss: 'RIPTIDE', bossColor: '#1de9b6', bossArch: 'sport',
      reward: { car: 'riptide' }, crew: ['SWELL', 'CURRENT', 'SPRAY'],
      intro: 'Cliffs, ocean, and a road that never stops curving.',
      spec: 'Engine tier 1.',
      events: [{ type: 'race', need: 2 }, { type: 'time', laps: 2 }, { type: 'boss' }] },
    { id: 'steel', name: 'STEEL DISTRICT', track: GRAND, boss: 'FOUNDRY', bossColor: '#ff5a36', bossArch: 'muscle',
      reward: { car: 'foundry' }, crew: ['RIVET', 'SLAG', 'ANVIL'],
      intro: 'Sparks and steam. Foundry drives like the furnaces never close.',
      spec: 'Transmission tier 1-2.',
      events: [{ type: 'race', need: 2 }, { type: 'race', need: 1 }, { type: 'time', laps: 2 }, { type: 'boss' }] },
    { id: 'downtown', name: 'NEON DOWNTOWN', track: MAZE, boss: 'VERTEX', bossColor: '#ff2fd8', bossArch: 'muscle',
      reward: { cash: true }, crew: ['PIXEL', 'STROBE', 'GRID'],
      intro: 'A canyon of neon towers. Vertex owns every one of them.',
      spec: 'A Muscle car, or Tyres tier 2-3.',
      events: [{ type: 'race', need: 2 }, { type: 'time', laps: 2 }, { type: 'time', laps: 3 }, { type: 'boss' }] },
    { id: 'highpass', name: 'HIGH PASS', track: RING, boss: 'GLACIER', bossColor: '#bfefff', bossArch: 'compact',
      reward: { car: 'glacier' }, crew: ['FROST', 'SUMMIT', 'THAW'],
      intro: 'Mountain dusk, thin cold air. Glacier doesn’t slide. Ever.',
      spec: 'Engine tier 2 and a Muscle car.',
      events: [{ type: 'race', need: 2 }, { type: 'race', need: 1 }, { type: 'time', laps: 2 }, { type: 'boss' }] },
    { id: 'underpass', name: 'THE UNDERPASS', track: UNDER, boss: 'UNDERTOW', bossColor: '#2a5cff', bossArch: 'sport',
      reward: { car: 'undertow' }, crew: ['DRAIN', 'ECHO', 'SLICK'],
      intro: 'Wet concrete under the city. Undertow pulls you under.',
      spec: 'Transmission tier 2-3.',
      events: [{ type: 'race', need: 1 }, { type: 'time', laps: 2 }, { type: 'boss' }] },
    { id: 'skyline', name: 'SKYLINE AVE', track: COAST, boss: 'HALO', bossColor: '#ffd76a', bossArch: 'muscle',
      reward: { cash: true }, crew: ['SPIRE', 'BEACON', 'AURA'],
      intro: 'The bridge, the tallest skyline, and Halo waiting at the top.',
      spec: 'NOS tier 2-3, Ironclad or Warbird.',
      events: [{ type: 'race', need: 1 }, { type: 'race', need: 1 }, { type: 'time', laps: 2 }, { type: 'boss' }] },
    { id: 'circuit', name: 'THE CIRCUIT', track: FINALE, boss: 'APEX', bossColor: '#ffd76a', bossArch: 'sport',
      reward: { car: 'apex' }, crew: ['ACE', 'MAVERICK', 'LEGEND'],
      intro: 'Every city, one lap. Apex is the one everyone measures themselves against.',
      spec: 'Your best car, fully upgraded.',
      events: [{ type: 'race', need: 1 }, { type: 'time', laps: 3 }, { type: 'boss' }] }
  ];

  // ---- The difficulty curve, in one place ------------------------------
  function crewSkill(d)  { return 0.80 + 0.028 * d; }    // middle of the field
  function bossSkill(d)  { return 0.88 + 0.030 * d; }    // city 1 .88, city 10 1.15
  // Time attack: the target is the track's own target lap time, times the
  // lap count, times this — generous in city 1, beyond a stock car by 10.
  function timeFactor(d, laps) { return (1.17 - 0.028 * d) * (laps >= 3 ? 0.99 : 1); }

  // ---- Payouts ----------------------------------------------------------
  function racePay(d)  { return 60 + 12 * d; }
  function timePay(d)  { return 50 + 10 * d; }
  function bossCash(d) { return 300 + 45 * d; }
  function bossCarCash(d) { return 100 + 15 * d; }
  function bossReplay(d) { return 90 + 15 * d; }
  var POS_MULT = [1, 0.75, 0.55, 0.4];

  var CREW_COLORS = [['#22e6ff', '#8b3dff', '#ff2f8e'], ['#7dffb0', '#ffb24d', '#ff5a36'],
                     ['#eaf6ff', '#41e0ff', '#ffd76a']];
  var CREW_ARCH = ['compact', 'sport', 'muscle'];

  function eventId(ci, ei) { return CITIES[ci].id + '-' + (ei + 1); }

  function cleared(ci, ei) { return DR.Save.isUnlocked('story:' + eventId(ci, ei)); }
  function bossIndex(ci) {
    var ev = CITIES[ci].events;
    for (var i = 0; i < ev.length; i++) if (ev[i].type === 'boss') return i;
    return ev.length - 1;
  }
  function bossBeaten(ci) { return cleared(ci, bossIndex(ci)); }
  function cityUnlocked(ci) { return ci === 0 || bossBeaten(ci - 1); }
  function bossUnlocked(ci) {
    var ev = CITIES[ci].events;
    for (var i = 0; i < ev.length; i++) if (ev[i].type !== 'boss' && !cleared(ci, i)) return false;
    return true;
  }
  function eventLocked(ci, ei) {
    if (!cityUnlocked(ci)) return true;
    return CITIES[ci].events[ei].type === 'boss' && !bossUnlocked(ci);
  }

  function cityState(ci) {
    var ev = CITIES[ci].events, done = 0;
    for (var i = 0; i < ev.length; i++) if (cleared(ci, i)) done++;
    return { unlocked: cityUnlocked(ci), cleared: done, total: ev.length, bossBeaten: bossBeaten(ci) };
  }

  // How far along the whole championship is: the first city with its boss
  // still standing. Everything before it is done.
  function currentCity() {
    for (var i = 0; i < CITIES.length; i++) if (!bossBeaten(i)) return i;
    return CITIES.length - 1;
  }

  function fmt(t) {
    var m = Math.floor(t / 60), rest = t - m * 60;
    var ss = rest < 10 ? '0' + rest.toFixed(2) : rest.toFixed(2);
    return m > 0 ? m + ':' + ss : rest.toFixed(2);
  }
  function ordinal(n) { return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'); }

  /* Everything the game needs to run one event: which track, which mode,
     how many laps, who's on the grid, what counts as clearing it, and the
     words that go on the event card. */
  function setup(ci, ei) {
    var c = CITIES[ci], e = c.events[ei], d = ci;
    var tr = DR.Road.tracks()[c.track];
    var out = { city: ci, event: ei, id: eventId(ci, ei), type: e.type, track: c.track,
                laps: 3, rivals: null, target: 0, need: 1 };
    if (e.type === 'race') {
      var mid = crewSkill(d), cols = CREW_COLORS[ci % CREW_COLORS.length];
      // A city's second race is a little quicker than its first.
      var extra = 0;
      for (var q = 0; q < ei; q++) if (c.events[q].type === 'race') extra += 0.015;
      out.rivals = [];
      for (var i = 0; i < 3; i++) {
        out.rivals.push({ name: c.crew[i], color: cols[i], arch: CREW_ARCH[(i + ci) % 3],
                          skill: mid + extra + (i - 1) * 0.04, bias: [-35, 35, 0][i] });
      }
      out.mode = 'race';
      out.need = e.need;
      out.label = 'RACE';
      out.requirement = e.need === 1 ? 'WIN THE RACE' : 'FINISH TOP ' + e.need;
      out.reward = '+' + racePay(d) + ' CR TO WIN';
    } else if (e.type === 'time') {
      out.mode = 'time';
      out.laps = e.laps;
      out.target = Math.round(tr.targetSecs * e.laps * timeFactor(d, e.laps) * 100) / 100;
      out.label = 'TIME ATTACK';
      out.requirement = 'BEAT ' + fmt(out.target) + ' OVER ' + e.laps + ' LAPS';
      out.reward = '+' + timePay(d) + ' CR';
    } else {
      out.mode = 'race';
      out.need = 1;
      var arch = c.bossArch;
      if (c.reward.car && DR.Cars.get(c.reward.car)) arch = DR.Cars.get(c.reward.car).archetype;
      out.rivals = [{ name: c.boss, color: c.bossColor, arch: arch, skill: bossSkill(d), bias: 0, boss: true }];
      out.label = 'BOSS';
      out.requirement = 'BEAT ' + c.boss + ' ONE ON ONE';
      if (c.reward.car) {
        var car = DR.Cars.get(c.reward.car);
        out.reward = 'WIN ' + (car ? car.name.toUpperCase() : 'THEIR CAR') + ' + ' + bossCarCash(d) + ' CR';
      } else {
        out.reward = '+' + bossCash(d) + ' CR';
      }
    }
    return out;
  }

  /* Settle an event. result: { pos, total } — pos is the finishing place
     for a race (0 for a time attack), total is your time. Pays out, marks
     the event cleared the first time, hands over a boss's car, and returns
     the lines the results screen should read out. */
  function resolve(ci, ei, result) {
    var c = CITIES[ci], e = c.events[ei], d = ci, st = setup(ci, ei);
    var was = cleared(ci, ei);
    var ok, award = 0, lines = [], carWon = null, cityOpened = null;

    if (e.type === 'time') {
      ok = result.total <= st.target;
      award = ok ? timePay(d) : Math.round(timePay(d) * 0.3);
      if (ok && !was) award += Math.round(timePay(d) * 0.5);
      var delta = result.total - st.target;
      lines.push(ok ? 'TARGET BEATEN BY ' + Math.abs(delta).toFixed(2) + 's'
                    : 'MISSED THE TARGET BY ' + delta.toFixed(2) + 's');
      DR.Save.recordResult('story:' + st.id, result.total, true);
    } else if (e.type === 'race') {
      ok = result.pos >= 1 && result.pos <= e.need;
      award = Math.round(racePay(d) * POS_MULT[Math.min(4, result.pos) - 1]);
      if (ok && !was) award += Math.round(racePay(d) * 0.5);
      lines.push(ok ? 'CLEARED — ' + ordinal(result.pos) + ' PLACE'
                    : ordinal(result.pos) + ' ISN’T ENOUGH — ' + st.requirement);
      DR.Save.recordResult('story:' + st.id, result.pos, true);
    } else {
      ok = result.pos === 1;
      if (ok && !was) {
        if (c.reward.car) {
          DR.Save.buyCar(c.reward.car, 0);
          carWon = DR.Cars.get(c.reward.car);
          award = bossCarCash(d);
        } else {
          award = bossCash(d);
        }
      } else if (ok) {
        award = bossReplay(d);
      } else {
        award = 30 + 5 * d;
      }
      lines.push(ok ? c.boss + ' IS BEATEN' : c.boss + ' TAKES IT — TRY AGAIN');
      if (ok) DR.Save.recordResult('story:' + st.id, result.total, true);
    }

    if (ok && !was) {
      DR.Save.unlock('story:' + st.id);
      if (e.type === 'boss' && ci + 1 < CITIES.length) cityOpened = CITIES[ci + 1];
    }
    if (carWon) {
      lines.push(carWon.name.toUpperCase() + ' IS NOW IN YOUR GARAGE');
      lines.push('DRIVE IT, OR KEEP UPGRADING YOURS');
    }
    if (cityOpened) lines.push('NEXT CITY OPEN: ' + cityOpened.name);
    else if (ok && !was && e.type !== 'boss' && bossUnlocked(ci)) lines.push(c.boss + ' WILL SEE YOU NOW');
    if (ok && !was && e.type === 'boss' && ci === CITIES.length - 1) lines.push('YOU ARE THE CIRCUIT CHAMPION');

    DR.Save.addCurrency(award);
    return { ok: ok, firstClear: ok && !was, award: award, lines: lines,
             carWon: carWon, cityOpened: cityOpened };
  }

  function themeFor(ci) { return THEMES[CITIES[ci].id] || null; }

  /* Quick Play's circuits. The first three are always open; each story
     circuit opens once Story reaches the first city that races on it, so
     a new track is something you find, then get to practise. */
  function trackCity(t) {
    for (var i = 0; i < CITIES.length; i++) if (CITIES[i].track === t) return i;
    return -1;
  }
  function trackUnlocked(t) {
    if (t <= GRAND) return true;
    var ci = trackCity(t);
    return ci < 0 || cityUnlocked(ci);
  }
  function trackLockText(t) {
    var ci = trackCity(t);
    return ci < 0 ? '' : 'REACH ' + CITIES[ci].name + ' IN STORY';
  }

  DR.Story = {
    cities: function () { return CITIES; },
    cityState: cityState, cityUnlocked: cityUnlocked, bossUnlocked: bossUnlocked,
    bossBeaten: bossBeaten, cleared: cleared, eventLocked: eventLocked,
    currentCity: currentCity, setup: setup, resolve: resolve, themeFor: themeFor,
    eventId: eventId, bossIndex: bossIndex,
    trackUnlocked: trackUnlocked, trackLockText: trackLockText, trackCity: trackCity,
    // Exposed so tests and the balance pass can read the curve directly.
    curve: { crewSkill: crewSkill, bossSkill: bossSkill, timeFactor: timeFactor }
  };
})(window.DR = window.DR || {});
