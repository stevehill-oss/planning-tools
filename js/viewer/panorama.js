// 360 degree seat photo viewer. Lazy-imported by js/tools/seat-viewer.js only when the
// chosen seating area has an entry in js/data/panoramas.js.
//
// An equirectangular JPEG (2:1) is drawn on the inside of a sphere. Controls match the 3D
// seat view: drag (mouse, pen, touch) to look around, with gentle inertia unless reduced
// motion is on; wheel or pinch zooms by narrowing the field of view (1x to 2.5x); arrow
// keys turn, + and - zoom, 0 or Home resets; double click resets. It renders only when
// something changed, so a still photo costs nothing.
//
// API:
//   const pano = createPanorama(host, { reducedMotion(): bool, onChange({ zoom }) })
//   await pano.load(entry)   entry from panoramaFor(); resolves true when the photo shows
//   pano.reset(); pano.zoomBy(f); pano.turn(dYawDeg, dPitchDeg); pano.zoom
//   pano.snapshotCanvas(1600) -> canvas;  pano.setActive(bool);  pano.dispose()
//
// Image orientation: the middle of the image is straight ahead at heading 0. Turning right
// moves towards the right-hand side of the image.

import * as THREE from 'three';

const BASE_FOV = 75;           // degrees, vertical, at 1x
const ZOOM_MAX = 2.5;
const PITCH_LIMIT = 85;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createPanorama(host, { reducedMotion = () => false, onChange = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  const canvas = renderer.domElement;
  canvas.className = 'rv-canvas rv-pano-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  host.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1.6, 1, 1100);
  const geo = new THREE.SphereGeometry(500, 64, 40);
  geo.scale(-1, 1, 1); // look at the inside, image the right way round
  const mat = new THREE.MeshBasicMaterial({ color: 0x0b1626 });
  scene.add(new THREE.Mesh(geo, mat));

  const look = { yaw: 0, pitch: 0, baseYaw: 0, basePitch: 0, vy: 0, vp: 0, zoom: 1 };
  const pointers = new Map(); let pinch = null; let dragging = false; let lastT = 0;
  let raf = 0; let active = true; let disposed = false; let texture = null; let loadToken = 0;

  function aim() {
    const y = THREE.MathUtils.degToRad(look.yaw); const p = THREE.MathUtils.degToRad(look.pitch);
    // Image centre faces -X; turning right faces -Z (see the header).
    camera.lookAt(-Math.cos(p) * Math.cos(y), Math.sin(p), -Math.cos(p) * Math.sin(y));
    const fov = BASE_FOV / look.zoom;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  function resize() {
    const w = host.clientWidth; const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    draw();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);

  function draw() { if (disposed) return; aim(); renderer.render(scene, camera); }

  // Inertia after a drag (skipped under reduced motion).
  function tick() {
    raf = 0;
    if (!active || disposed) return;
    if (!dragging && (Math.abs(look.vy) > 0.01 || Math.abs(look.vp) > 0.01)) {
      look.yaw += look.vy; look.pitch = clamp(look.pitch + look.vp, -PITCH_LIMIT, PITCH_LIMIT);
      look.vy *= 0.9; look.vp *= 0.9;
      draw();
      raf = requestAnimationFrame(tick);
    }
  }
  const kick = () => { if (!raf && active && !reducedMotion()) raf = requestAnimationFrame(tick); };

  function turn(dy, dp) {
    look.yaw += dy; look.pitch = clamp(look.pitch + dp, -PITCH_LIMIT, PITCH_LIMIT);
    draw();
  }
  function setZoom(z) {
    look.zoom = clamp(z, 1, ZOOM_MAX);
    draw(); onChange({ zoom: look.zoom });
  }
  function reset() {
    look.yaw = look.baseYaw; look.pitch = look.basePitch; look.vy = 0; look.vp = 0;
    setZoom(1);
  }

  /* ---------- Input ---------- */
  const degPerPx = () => camera.fov / Math.max(1, host.clientHeight);
  function onDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    look.vy = 0; look.vp = 0; dragging = true; lastT = performance.now();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: look.zoom };
    }
  }
  function onMove(e) {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x; const dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      setZoom(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d)));
      return;
    }
    const k = degPerPx();
    // Dragging pulls the photo, so dragging right turns you left.
    look.vy = -dx * k; look.vp = dy * k;
    turn(look.vy, look.vp);
    lastT = performance.now();
  }
  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      dragging = false;
      if (performance.now() - lastT > 80 || reducedMotion()) { look.vy = 0; look.vp = 0; }
      kick();
    }
  }
  function onWheel(e) {
    e.preventDefault();
    setZoom(look.zoom * Math.exp(-e.deltaY * 0.0015));
  }
  function onKey(e) {
    const step = e.shiftKey ? 15 : 5;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key in map) { e.preventDefault(); turn(...map[e.key]); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(look.zoom * 1.25); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(look.zoom / 1.25); }
    if (e.key === '0' || e.key === 'Home') { e.preventDefault(); reset(); }
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('dblclick', reset);

  /* ---------- Loading ---------- */
  // Phones often cap textures at 4096px, so a larger photo is scaled down to fit first.
  function fitImage(img) {
    const max = renderer.capabilities.maxTextureSize || 4096;
    if (img.naturalWidth <= max) return img;
    const c = document.createElement('canvas');
    c.width = max; c.height = Math.round(max * (img.naturalHeight / img.naturalWidth));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function load(entry) {
    const token = ++loadToken;
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (token !== loadToken || disposed) { resolve(false); return; }
        texture?.dispose();
        texture = new THREE.Texture(fitImage(img));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
        mat.map = texture; mat.color.set(0xffffff); mat.needsUpdate = true;
        look.baseYaw = Number(entry.heading) || 0; look.basePitch = clamp(Number(entry.pitch) || 0, -60, 60);
        reset();
        resize();
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = new URL(`../../${entry.src.replace(/^\/+/, '')}`, import.meta.url).href;
    });
  }

  function snapshotCanvas(maxW = 1600) {
    try {
      draw();
      const w = Math.min(maxW, canvas.width); const h = Math.round(w * (canvas.height / canvas.width));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(canvas, 0, 0, w, h);
      return c;
    } catch { return null; }
  }

  return {
    canvas,
    load,
    reset,
    zoomBy: (f) => setZoom(look.zoom * f),
    turn,
    get zoom() { return look.zoom; },
    snapshotCanvas,
    snapshot(maxW = 360) { const c = snapshotCanvas(maxW); try { return c ? c.toDataURL('image/jpeg', 0.78) : null; } catch { return null; } },
    setActive(on) { active = !!on; if (active) resize(); else { cancelAnimationFrame(raf); raf = 0; } },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect();
      texture?.dispose(); geo.dispose(); mat.dispose();
      renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove();
    },
  };
}
