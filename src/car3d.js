/* car3d.js — the Garage's real WebGL car preview.

   Stage 1 of moving car visuals off the hand-rolled Canvas 2D renderer:
   ONLY this showcase preview uses it. The car you actually drive still goes
   through car.js's drawCar, unchanged — matching the road's custom
   perspective camera (FOCAL/HORIZON_Y/CAM_LIFT in road.js) is a separate,
   harder problem for a later milestone, and nothing about drift feel or
   in-race performance should be at risk just to make the Garage look good.

   THREE comes from a vendored, MIT-licensed build (lib/three.min.js),
   loaded as a plain classic script by index.html so it also works when the
   page is opened as a local file:// URL — a code library, not game
   content, so it doesn't touch the "own all rights to every asset" rule
   the way a downloaded model or texture would. Everything this file
   builds is procedural: primitive geometry and a hand-drawn gradient for
   the reflection environment, no imported meshes or images. */

(function (DR) {
  'use strict';

  var canvas = null, renderer = null, scene = null, camera = null;
  var carGroup = null, bodyMats = [], failed = false;
  var curCarId = null, curColorHex = null;

  // Where the preview sits, in the same logical 720x1280 units everything
  // else in the Garage is laid out in. Clear of the dots row above (y=150)
  // and the name/stat block below (starts y=705).
  var RECT = { x: 90, y: 172, w: 540, h: 512 };

  function ensureReady() {
    if (renderer || failed) return !failed;
    if (!window.THREE) return false;
    var THREE = window.THREE;
    try {
      canvas = document.createElement('canvas');
      canvas.id = 'stage3d';
      canvas.style.position = 'fixed';
      canvas.style.display = 'none';
      canvas.style.pointerEvents = 'none';
      document.body.appendChild(canvas);

      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(26, 1, 0.5, 40);
      camera.position.set(1.7, 1.95, 6.7);
      camera.lookAt(0.35, 0.5, 0);

      var key = new THREE.DirectionalLight(0xfff2e0, 2.0);
      key.position.set(3, 5, 4);
      scene.add(key);
      var fill = new THREE.DirectionalLight(0x8fbfff, 0.55);
      fill.position.set(-4, 2, -1);
      scene.add(fill);
      var rimA = new THREE.PointLight(0xff3fd0, 3.2, 14, 2);
      rimA.position.set(-2.4, 1.3, -3.2);
      scene.add(rimA);
      var rimB = new THREE.PointLight(0x2fe4ff, 2.4, 14, 2);
      rimB.position.set(2.6, 1.0, -3.6);
      scene.add(rimB);
      scene.add(new THREE.AmbientLight(0x38304a, 0.9));
      scene.environment = buildEnvironment(THREE, renderer);

      carGroup = new THREE.Group();
      scene.add(carGroup);
      buildCar('nightrunner');
      setColor('#c8121f');

      return true;
    } catch (e) {
      // No WebGL (an old device, or a locked-down Playables webview) — the
      // Garage falls back to the existing 2D preview. That fallback is
      // Card.js's job, not this file's; this just has to fail quietly.
      failed = true;
      return false;
    }
  }

  // What actually reads as "real" in a glossy product render is the paint
  // reflecting its surroundings, not the mesh detail — so this builds a
  // small procedural "studio" gradient (a canvas gradient, hand-drawn like
  // every other texture in this game, not a downloaded HDRI) and bakes it
  // into a reflection environment with Three's PMREM generator. The car's
  // clearcoat paint mirrors this once, at load, not per frame.
  function buildEnvironment(THREE, gl) {
    var c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    var g2 = c.getContext('2d');
    var grad = g2.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#fdf6e6');   // bright soft-box overhead
    grad.addColorStop(0.16, '#d9e2f2');
    grad.addColorStop(0.40, '#454a63');
    grad.addColorStop(0.52, '#241f36');
    grad.addColorStop(0.68, '#ff3fd0');   // a low magenta softbox band —
    grad.addColorStop(0.74, '#7a2f66');   // ties the reflection to the
    grad.addColorStop(0.86, '#15111f');   // game's own neon palette
    grad.addColorStop(1.00, '#05040a');
    g2.fillStyle = grad;
    g2.fillRect(0, 0, 4, 256);

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    var pmrem = new THREE.PMREMGenerator(gl);
    var target = pmrem.fromEquirectangular(tex);
    tex.dispose();
    pmrem.dispose();
    return target.texture;
  }

  // Every cross-section is a "squircle" — a superellipse, rounder than a
  // rectangle and boxier than an ellipse — rather than a true rounded-rect
  // with explicit corner arcs. One exponent gives a convincing rounded
  // panel shape with far less code, and because every ring shares its
  // vertices with its neighbours (both around the ring and along the car's
  // length), Three's computeVertexNormals produces genuinely smooth,
  // curved-looking shading — the thing a box, however well lit, can't do.
  // A higher exponent (closer to a true rectangle) is what makes Ironclad
  // read as armored and boxy next to everything else's rounder panels.
  function squirclePoint(hw, midY, halfH, t, exp) {
    var ct = Math.cos(t), st = Math.sin(t);
    var ex = Math.sign(ct) * Math.pow(Math.abs(ct), exp) * hw;
    var ey = midY + Math.sign(st) * Math.pow(Math.abs(st), exp) * halfH;
    return [ex, ey];
  }

  // sections: [{z, hw, y0, y1}, ...] from one end of the car to the other.
  // Builds a capped loft: a ring of `segs` points per section, smoothly
  // shaded, with a small fan closing off each end.
  function loftGeometry(THREE, sections, segs, exp) {
    exp = exp || 0.55;
    var positions = [], indices = [];
    var rings = sections.map(function (s) {
      var midY = (s.y0 + s.y1) * 0.5, halfH = (s.y1 - s.y0) * 0.5;
      var base = positions.length / 3;
      for (var i = 0; i < segs; i++) {
        var t = (i / segs) * Math.PI * 2;
        var p = squirclePoint(s.hw, midY, halfH, t, exp);
        positions.push(p[0], p[1], s.z);
      }
      return base;
    });
    for (var r = 0; r < rings.length - 1; r++) {
      for (var i = 0; i < segs; i++) {
        var i2 = (i + 1) % segs;
        var a = rings[r] + i, b = rings[r] + i2, c = rings[r + 1] + i2, d = rings[r + 1] + i;
        indices.push(a, b, d, b, c, d);
      }
    }
    // End caps: a centre point per end, fanned to that ring.
    function cap(ringIndex, z, flip) {
      var centre = positions.length / 3;
      positions.push(0, sections[ringIndex].y0 * 0.5 + sections[ringIndex].y1 * 0.5, z);
      for (var i = 0; i < segs; i++) {
        var i2 = (i + 1) % segs;
        var a = rings[ringIndex] + i, b = rings[ringIndex] + i2;
        if (flip) indices.push(centre, b, a); else indices.push(centre, a, b);
      }
    }
    cap(0, sections[0].z, true);
    cap(sections.length - 1, sections[sections.length - 1].z, false);

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Eight hand-authored silhouettes, one per car — not one shape reused
  // with a size multiplier. "Compact/Sport/Muscle" is car.js's physics
  // vocabulary; visually, a rally hatch and a stripped track car can both
  // be a "sport" archetype and still need to look nothing alike. Every
  // section list runs nose (+z) to tail (-z). Each entry also carries its
  // own wheel placement and radius, since a tank rides higher and wider
  // than a track car, not just "the same wheel, scaled."
  var PROFILES = {
    // Nightrunner — the all-rounder every other silhouette is judged against.
    sport: {
      body: [
        { z: 1.95, hw: 0.10, y0: 0.30, y1: 0.34 }, { z: 1.75, hw: 0.45, y0: 0.24, y1: 0.42 },
        { z: 1.35, hw: 0.80, y0: 0.20, y1: 0.46 }, { z: 0.85, hw: 0.86, y0: 0.19, y1: 0.48 },
        { z: 0.35, hw: 0.84, y0: 0.19, y1: 0.50 }, { z: -0.15, hw: 0.84, y0: 0.19, y1: 0.50 },
        { z: -0.65, hw: 0.85, y0: 0.19, y1: 0.49 }, { z: -1.05, hw: 0.87, y0: 0.19, y1: 0.47 },
        { z: -1.55, hw: 0.62, y0: 0.22, y1: 0.40 }, { z: -1.90, hw: 0.12, y0: 0.28, y1: 0.34 }
      ],
      cabin: [
        { z: 0.60, hw: 0.68, y0: 0.48, y1: 0.55 }, { z: 0.15, hw: 0.72, y0: 0.55, y1: 0.86 },
        { z: -0.25, hw: 0.72, y0: 0.58, y1: 0.88 }, { z: -0.65, hw: 0.66, y0: 0.52, y1: 0.78 },
        { z: -0.95, hw: 0.52, y0: 0.48, y1: 0.58 }
      ],
      wheel: { r: 0.24, w: 0.22, rimR: 0.14, x: 0.78, front: 1.25, rear: -1.25 }
    },
    // Vantage — a grand tourer: nose and tail both stretched, a long low
    // roofline instead of Nightrunner's cab-back cabin.
    gt: {
      body: [
        { z: 2.15, hw: 0.09, y0: 0.28, y1: 0.32 }, { z: 1.90, hw: 0.42, y0: 0.22, y1: 0.40 },
        { z: 1.40, hw: 0.78, y0: 0.19, y1: 0.44 }, { z: 0.80, hw: 0.84, y0: 0.18, y1: 0.46 },
        { z: 0.20, hw: 0.82, y0: 0.18, y1: 0.48 }, { z: -0.40, hw: 0.82, y0: 0.18, y1: 0.48 },
        { z: -1.00, hw: 0.83, y0: 0.18, y1: 0.46 }, { z: -1.50, hw: 0.85, y0: 0.19, y1: 0.44 },
        { z: -2.00, hw: 0.58, y0: 0.21, y1: 0.38 }, { z: -2.35, hw: 0.10, y0: 0.26, y1: 0.32 }
      ],
      cabin: [
        { z: 0.45, hw: 0.62, y0: 0.46, y1: 0.52 }, { z: 0.00, hw: 0.66, y0: 0.52, y1: 0.76 },
        { z: -0.55, hw: 0.66, y0: 0.53, y1: 0.78 }, { z: -1.10, hw: 0.60, y0: 0.50, y1: 0.68 },
        { z: -1.50, hw: 0.46, y0: 0.46, y1: 0.52 }
      ],
      wheel: { r: 0.25, w: 0.22, rimR: 0.15, x: 0.80, front: 1.45, rear: -1.55 }
    },
    // Alleycat / Ecliptic — a short, tall-cabin hot hatch: the greenhouse
    // runs almost nose to tail, and the tail is cut off blunt, not tapered.
    hatch: {
      body: [
        { z: 1.55, hw: 0.10, y0: 0.30, y1: 0.36 }, { z: 1.35, hw: 0.50, y0: 0.22, y1: 0.46 },
        { z: 1.00, hw: 0.80, y0: 0.19, y1: 0.50 }, { z: 0.55, hw: 0.85, y0: 0.18, y1: 0.52 },
        { z: 0.05, hw: 0.84, y0: 0.18, y1: 0.54 }, { z: -0.55, hw: 0.84, y0: 0.18, y1: 0.54 },
        { z: -1.05, hw: 0.82, y0: 0.19, y1: 0.50 }, { z: -1.35, hw: 0.78, y0: 0.20, y1: 0.48 }
      ],
      cabin: [
        { z: 0.85, hw: 0.66, y0: 0.50, y1: 0.58 }, { z: 0.40, hw: 0.72, y0: 0.58, y1: 0.92 },
        { z: -0.20, hw: 0.72, y0: 0.60, y1: 0.94 }, { z: -0.80, hw: 0.70, y0: 0.58, y1: 0.88 },
        { z: -1.20, hw: 0.62, y0: 0.52, y1: 0.66 }
      ],
      wheel: { r: 0.23, w: 0.22, rimR: 0.13, x: 0.76, front: 1.05, rear: -1.10 }
    },
    // Warbird — American muscle: a long flat hood, cabin pushed well back,
    // wide haunches over the rear wheels, short deck.
    muscle: {
      body: [
        { z: 2.10, hw: 0.12, y0: 0.26, y1: 0.32 }, { z: 1.85, hw: 0.50, y0: 0.20, y1: 0.38 },
        { z: 1.35, hw: 0.85, y0: 0.17, y1: 0.42 }, { z: 0.75, hw: 0.92, y0: 0.16, y1: 0.44 },
        { z: 0.05, hw: 0.90, y0: 0.16, y1: 0.46 }, { z: -0.60, hw: 0.90, y0: 0.16, y1: 0.46 },
        { z: -1.15, hw: 0.92, y0: 0.16, y1: 0.44 }, { z: -1.65, hw: 0.65, y0: 0.19, y1: 0.38 },
        { z: -2.00, hw: 0.14, y0: 0.24, y1: 0.32 }
      ],
      cabin: [
        { z: -0.10, hw: 0.70, y0: 0.44, y1: 0.50 }, { z: -0.55, hw: 0.74, y0: 0.50, y1: 0.76 },
        { z: -0.95, hw: 0.72, y0: 0.52, y1: 0.74 }, { z: -1.35, hw: 0.60, y0: 0.46, y1: 0.56 }
      ],
      wheel: { r: 0.26, w: 0.26, rimR: 0.16, x: 0.84, front: 1.05, rear: -1.15 }
    },
    // Ironclad — the tank: a higher, boxier exponent (less rounded), taller
    // ride height and a taller, flatter cabin than anything else here.
    tank: {
      exp: 0.85,
      body: [
        { z: 1.90, hw: 0.20, y0: 0.34, y1: 0.42 }, { z: 1.65, hw: 0.60, y0: 0.26, y1: 0.50 },
        { z: 1.20, hw: 0.90, y0: 0.24, y1: 0.56 }, { z: 0.60, hw: 0.94, y0: 0.23, y1: 0.58 },
        { z: 0.00, hw: 0.92, y0: 0.23, y1: 0.60 }, { z: -0.60, hw: 0.92, y0: 0.23, y1: 0.60 },
        { z: -1.20, hw: 0.94, y0: 0.24, y1: 0.56 }, { z: -1.65, hw: 0.68, y0: 0.27, y1: 0.48 },
        { z: -1.90, hw: 0.22, y0: 0.32, y1: 0.42 }
      ],
      cabin: [
        { z: 0.50, hw: 0.74, y0: 0.56, y1: 0.64 }, { z: 0.05, hw: 0.78, y0: 0.64, y1: 0.98 },
        { z: -0.50, hw: 0.78, y0: 0.66, y1: 1.00 }, { z: -1.00, hw: 0.74, y0: 0.60, y1: 0.88 },
        { z: -1.35, hw: 0.62, y0: 0.54, y1: 0.66 }
      ],
      wheel: { r: 0.30, w: 0.28, rimR: 0.17, x: 0.86, front: 0.75, rear: -0.75 }
    },
    // Specter — the glass cannon: barely off the ground, a small aero
    // screen instead of a full greenhouse, built to carry a big rear wing.
    track: {
      body: [
        { z: 2.00, hw: 0.08, y0: 0.16, y1: 0.19 }, { z: 1.75, hw: 0.40, y0: 0.14, y1: 0.24 },
        { z: 1.30, hw: 0.78, y0: 0.12, y1: 0.28 }, { z: 0.70, hw: 0.86, y0: 0.11, y1: 0.30 },
        { z: 0.10, hw: 0.84, y0: 0.11, y1: 0.31 }, { z: -0.55, hw: 0.84, y0: 0.11, y1: 0.31 },
        { z: -1.10, hw: 0.86, y0: 0.12, y1: 0.29 }, { z: -1.60, hw: 0.60, y0: 0.14, y1: 0.24 },
        { z: -1.95, hw: 0.10, y0: 0.17, y1: 0.20 }
      ],
      cabin: [
        { z: 0.35, hw: 0.50, y0: 0.30, y1: 0.34 }, { z: 0.00, hw: 0.54, y0: 0.34, y1: 0.50 },
        { z: -0.35, hw: 0.52, y0: 0.34, y1: 0.48 }, { z: -0.65, hw: 0.42, y0: 0.30, y1: 0.36 }
      ],
      wheel: { r: 0.22, w: 0.20, rimR: 0.15, x: 0.80, front: 1.10, rear: -1.20 },
      extra: function (group, THREE, mat) { addWing(group, THREE, mat, -1.55, 0.62, 0.52, 0.30, 0.06); }
    },
    // Apex — the finale hybrid: low and aggressive like Specter, but with
    // Warbird's sense of length; a small integrated lip, not a big wing.
    hyper: {
      body: [
        { z: 2.05, hw: 0.09, y0: 0.20, y1: 0.24 }, { z: 1.80, hw: 0.42, y0: 0.16, y1: 0.32 },
        { z: 1.30, hw: 0.82, y0: 0.14, y1: 0.38 }, { z: 0.70, hw: 0.90, y0: 0.13, y1: 0.40 },
        { z: 0.10, hw: 0.88, y0: 0.13, y1: 0.41 }, { z: -0.60, hw: 0.88, y0: 0.13, y1: 0.41 },
        { z: -1.20, hw: 0.90, y0: 0.14, y1: 0.39 }, { z: -1.80, hw: 0.62, y0: 0.16, y1: 0.32 },
        { z: -2.15, hw: 0.11, y0: 0.19, y1: 0.24 }
      ],
      cabin: [
        { z: 0.55, hw: 0.58, y0: 0.40, y1: 0.46 }, { z: 0.10, hw: 0.62, y0: 0.46, y1: 0.66 },
        { z: -0.35, hw: 0.60, y0: 0.47, y1: 0.64 }, { z: -0.75, hw: 0.50, y0: 0.42, y1: 0.48 }
      ],
      wheel: { r: 0.25, w: 0.24, rimR: 0.15, x: 0.82, front: 1.05, rear: -1.30 },
      extra: function (group, THREE, mat) { addWing(group, THREE, mat, -1.85, 0.50, 0.44, 0.16, 0.04); }
    }
  };

  // Ecliptic reuses Alleycat's hatch body (both compact hatchbacks) but
  // adds the hood scoop and wing that make it read as "boost-hungry"
  // rather than "cheap and tight" — the two Compact cars sharing a shell
  // the way real economy/hot-hatch trims do.
  var CAR_VISUALS = {
    nightrunner: 'sport', vantage: 'gt', alleycat: 'hatch', warbird: 'muscle',
    ironclad: 'tank', specter: 'track', apex: 'hyper',
    ecliptic: { base: 'hatch', extra: function (group, THREE, mat) {
      addScoop(group, THREE, mat, 0.75, 0.30, 0.10);
      addWing(group, THREE, mat, -1.45, 0.58, 0.16, 0.20, 0.05);
    } }
  };
  var ARCHETYPE_FALLBACK = { compact: 'hatch', muscle: 'muscle', sport: 'sport' };

  function addWing(group, THREE, mat, z, halfSpan, standHeight, chord, thick) {
    var standGeo = new THREE.CylinderGeometry(0.02, 0.02, standHeight, 6);
    var planeGeo = new THREE.BoxGeometry(halfSpan * 2, thick, chord);
    [-1, 1].forEach(function (side) {
      var stand = new THREE.Mesh(standGeo, mat);
      stand.position.set(side * halfSpan * 0.7, standHeight * 0.5 + 0.30, z);
      group.add(stand);
    });
    var plane = new THREE.Mesh(planeGeo, mat);
    plane.position.set(0, standHeight + 0.30, z);
    group.add(plane);
  }

  function addScoop(group, THREE, mat, z, w, h) {
    var scoop = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.34), mat);
    scoop.position.set(0, 0.50 + h * 0.5, z);
    group.add(scoop);
  }

  function buildCar(carId) {
    var THREE = window.THREE;
    while (carGroup.children.length) carGroup.remove(carGroup.children[0]);
    bodyMats.length = 0;

    var entry = CAR_VISUALS[carId];
    var extra = null;
    if (typeof entry === 'object' && entry) { extra = entry.extra; entry = entry.base; }
    if (!entry) {
      var def = DR.Cars && DR.Cars.get ? DR.Cars.get(carId) : null;
      entry = ARCHETYPE_FALLBACK[def && def.archetype] || 'sport';
    }
    var p = PROFILES[entry] || PROFILES.sport;

    // Physical, not Standard: clearcoat is the difference between "flat
    // colored plastic" and "wet-looking painted metal" — a second, near-
    // mirror layer on top of the base coat, exactly like real automotive
    // paint, and the main thing a glossy product render leans on.
    var bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8121f, metalness: 0.75, roughness: 0.28,
      clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.3
    });
    bodyMats.push(bodyMat);
    var body = new THREE.Mesh(loftGeometry(THREE, p.body, 20, p.exp), bodyMat);
    carGroup.add(body);

    var cabinMat = new THREE.MeshPhysicalMaterial({
      color: 0x0c0a16, metalness: 0.3, roughness: 0.05,
      clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.4
    });
    var cabin = new THREE.Mesh(loftGeometry(THREE, p.cabin, 16, p.exp), cabinMat);
    carGroup.add(cabin);

    var wheelMat = new THREE.MeshPhysicalMaterial({ color: 0x121216, metalness: 0.3, roughness: 0.7, envMapIntensity: 0.6 });
    var rimMat = new THREE.MeshPhysicalMaterial({ color: 0xb9c2d4, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.2 });
    var wh = p.wheel;
    var wheelGeo = new THREE.CylinderGeometry(wh.r, wh.r, wh.w, 20);
    var rimGeo = new THREE.CylinderGeometry(wh.rimR, wh.rimR, wh.w + 0.02, 6);
    [[-wh.x, wh.r, wh.front], [wh.x, wh.r, wh.front], [-wh.x, wh.r, wh.rear], [wh.x, wh.r, wh.rear]].forEach(function (pos) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(pos[0], pos[1], pos[2]);
      carGroup.add(w);
      var rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(pos[0], pos[1], pos[2]);
      carGroup.add(rim);
    });

    // Lamps derive their position from the body's own nose/tail sections
    // rather than a fixed offset, so every silhouette's lights sit right
    // on its own nose and tail instead of needing hand tuning per car.
    var nose = p.body[1], tail = p.body[p.body.length - 2];
    var lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3c2, emissive: 0xffdd88, emissiveIntensity: 1.4 });
    var lampGeo = new THREE.BoxGeometry(nose.hw * 0.34, nose.y1 * 0.22, 0.06);
    [-1, 1].forEach(function (side) {
      var lp = new THREE.Mesh(lampGeo, lampMat);
      lp.position.set(side * nose.hw * 0.6, nose.y1 * 0.8, nose.z + 0.05);
      carGroup.add(lp);
    });
    var tailMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 1.6 });
    var tailGeo = new THREE.BoxGeometry(tail.hw * 0.28, tail.y1 * 0.22, 0.05);
    [-1, 1].forEach(function (side) {
      var tl = new THREE.Mesh(tailGeo, tailMat);
      tl.position.set(side * tail.hw * 0.55, tail.y1 * 0.75, tail.z - 0.05);
      carGroup.add(tl);
    });

    if (extra) extra(carGroup, THREE, bodyMat);

    curCarId = carId;
  }

  function setColor(hex) {
    if (curColorHex === hex) return;
    curColorHex = hex;
    for (var i = 0; i < bodyMats.length; i++) bodyMats[i].color.set(hex);
  }

  function layout() {
    if (!DR.Game || !DR.Game.viewportRect) return;
    var g = DR.Game.viewportRect();
    var left = g.offX + RECT.x * g.scale, top = g.offY + RECT.y * g.scale;
    var w = RECT.w * g.scale, h = RECT.h * g.scale;
    canvas.style.left = left + 'px';
    canvas.style.top = top + 'px';
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function show(visible) {
    if (!ensureReady()) return false;
    canvas.style.display = visible ? 'block' : 'none';
    if (visible) layout();
    return true;
  }

  function render(state) {
    if (failed || !renderer || canvas.style.display === 'none') return false;
    layout();
    if (state.id && state.id !== curCarId) buildCar(state.id);
    if (state.color) setColor(state.color);
    carGroup.rotation.y = state.yaw || 0;
    renderer.render(scene, camera);
    return true;
  }

  DR.Car3D = { show: show, render: render, available: function () { return ensureReady(); } };
})(window.DR = window.DR || {});
