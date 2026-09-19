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
  var curArchetype = null, curColorHex = null;

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
      buildCar('sport');
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

  // A rounded body via a lathe of small chamfer segments would look nicer
  // than a box, but the placeholder proves the pipeline (lighting, paint,
  // layout, perf) before the real per-archetype sculpting work. Real curved
  // bodywork per archetype is the next step once the design direction for
  // the actual cars is locked in.
  function buildCar(archetype) {
    var THREE = window.THREE;
    while (carGroup.children.length) carGroup.remove(carGroup.children[0]);
    bodyMats.length = 0;

    var m = archetype === 'compact' ? { l: 0.82, w: 0.95, h: 1.05 }
          : archetype === 'muscle'  ? { l: 1.16, w: 1.1,  h: 0.9  }
          : { l: 1.0, w: 1.0, h: 1.0 };

    // Physical, not Standard: clearcoat is the difference between "flat
    // colored plastic" and "wet-looking painted metal" — a second, near-
    // mirror layer on top of the base coat, exactly like real automotive
    // paint, and the main thing a glossy product render leans on.
    var bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8121f, metalness: 0.75, roughness: 0.28,
      clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.3
    });
    bodyMats.push(bodyMat);
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.78 * m.w, 0.5 * m.h, 3.7 * m.l), bodyMat);
    body.position.y = 0.46 * m.h;
    carGroup.add(body);

    var cabinMat = new THREE.MeshPhysicalMaterial({
      color: 0x0c0a16, metalness: 0.3, roughness: 0.05,
      clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.4
    });
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.32 * m.w, 0.42 * m.h, 1.62 * m.l), cabinMat);
    cabin.position.set(0, 0.86 * m.h, 0.1);
    carGroup.add(cabin);

    var wheelMat = new THREE.MeshPhysicalMaterial({ color: 0x121216, metalness: 0.3, roughness: 0.7, envMapIntensity: 0.6 });
    var wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 18);
    var wx = 0.88 * m.w, wy = 0.34, wz = 1.2 * m.l;
    [[-wx, wy, wz], [wx, wy, wz], [-wx, wy, -wz], [wx, wy, -wz]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], p[1], p[2]);
      carGroup.add(w);
    });

    var lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3c2, emissive: 0xffdd88, emissiveIntensity: 1.4 });
    var lampGeo = new THREE.BoxGeometry(0.3 * m.w, 0.12, 0.06);
    [[-0.55 * m.w, 0.5 * m.h, 1.85 * m.l], [0.55 * m.w, 0.5 * m.h, 1.85 * m.l]].forEach(function (p) {
      var lp = new THREE.Mesh(lampGeo, lampMat);
      lp.position.set(p[0], p[1], p[2]);
      carGroup.add(lp);
    });

    curArchetype = archetype;
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
    if (state.archetype && state.archetype !== curArchetype) buildCar(state.archetype);
    if (state.color) setColor(state.color);
    carGroup.rotation.y = state.yaw || 0;
    renderer.render(scene, camera);
    return true;
  }

  DR.Car3D = { show: show, render: render, available: function () { return ensureReady(); } };
})(window.DR = window.DR || {});
