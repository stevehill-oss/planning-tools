// Seat Reality Viewer engine. Lazy-imported by js/tools/seat-viewer.js only when the
// tool is first shown, so three.js never loads with the page.
//
// Renderer: ACES filmic tone mapping, sRGB output, PBR materials, PMREM environment
// (sky for daytime, RoomEnvironment otherwise), one shadow-casting key light whose map is
// rendered once per mood, exponential fog for atmospheric depth, optional bloom
// (UnrealBloomPass) that the low-power path skips. DPR capped at 1.75 (1.25 on phones).
// The loop pauses when the tool is deactivated, off screen or the tab is hidden, and
// renders only on demand when nothing is animating (reduced motion).
//
// API (all methods safe to call before load() resolves):
//   const eng = await createEngine(host, opts)
//   await eng.load({ archetype, mode })          builds a venue (disposes the old one)
//   eng.setSeat(spec, { fly })                   spec from layouts.seatSpec()
//   eng.setView('seat' | 'overview')
//   eng.setLight('day' | 'golden' | 'night')
//   eng.setDensity(0..1); eng.wave(); eng.resetLook(); eng.turn(dYaw, dPitch); eng.zoomBy(f)
//   eng.setMarkers([{ id, position:[x,y,z] }]) and eng.project() -> [{ id, x, y, visible }]
//   eng.snapshot(360) -> JPEG data URL;  eng.snapshotCanvas(1600) -> canvas (for the PNG save)
//   eng.heading();  eng.setActive(bool);  eng.dispose()
//   eng.play('race') -> bool        venue actions (the racecourse sends a field past the post)
//   eng.setCompare(spec | null, { split: 0..1, stacked: bool })
//                                    split screen: your seat (first part) against a second seat
//                                    (renderer scissor, two cameras, one linked drag)
//   load() also takes variant, passed to the builder (the racecourse uses 'flat' or 'jumps').
// opts: { lowPower, reducedMotion(): bool, onCamera(heading), onFrame(stats), onFlyEnd(), onLost() }

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Lighting } from './lighting.js';
import { CameraRig } from './controls.js';
import { buildForeground } from './foreground.js';

const BUILDERS = {
  stadium: () => import('./archetypes/stadium.js'),
  arena: () => import('./archetypes/arena.js'),
  hall: () => import('./archetypes/hall.js'),
  racecourse: () => import('./archetypes/racecourse.js'),
};

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

export async function createEngine(host, opts = {}) {
  const lowPower = !!opts.lowPower;
  const reduced = opts.reducedMotion || (() => false);
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false; // count every pass (bloom included) in the dev stats
  const dprCap = coarse ? 1.25 : 1.75;
  const dpr = () => Math.min(window.devicePixelRatio || 1, lowPower ? 1 : dprCap);
  renderer.setPixelRatio(dpr());
  const canvas = renderer.domElement;
  canvas.className = 'rv-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  host.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.08, 6000);
  // Layers: 0 the venue, 1 your seat's foreground, 2 the compare seat's foreground.
  camera.layers.enable(1);
  const camB = new THREE.PerspectiveCamera(50, 1.6, 0.08, 6000);
  camB.layers.enable(2);
  const setLayer = (obj, n) => obj.traverse((o) => o.layers.set(n));
  const lighting = new Lighting(renderer, scene, { lowPower });
  // One permanent point light for seat interiors (a box, a suite). Kept in the scene at
  // zero intensity when unused, so moving between seats never changes the light count
  // (which would force every shader to recompile).
  const seatLight = new THREE.PointLight('#ffd9ab', 0, 8, 2);
  scene.add(seatLight);

  let composer = null; let bloomPass = null; let bloomOn = false;
  function ensureComposer() {
    if (composer || lowPower) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.6, 0.5, 0.85);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(dpr());
    composer.setSize(size.x, size.y);
  }

  const state = {
    venue: null, archetype: null, mode: null, mood: 'day', density: 0.93, view: 'seat', spec: null,
    active: true, onscreen: true, docVisible: !document.hidden, dirty: true, loading: false, fg: null,
    markers: [], disposed: false, lost: false, cmp: null,
  };

  const rig = new CameraRig(camera, canvas, {
    reducedMotion: reduced,
    onChange: () => { state.dirty = true; },
    onFlyEnd: () => { state.view = 'seat'; state.venue?.setView?.('seat'); applyExposure(); opts.onFlyEnd?.(); state.dirty = true; },
  });

  /* ---------- Size ---------- */
  function resize() {
    // A hidden host (another tool showing, or the canvas detached) reports zero size; keep
    // the last good size rather than shrinking the bloom targets to nothing.
    if (!host.clientWidth || !host.clientHeight) return;
    const w = host.clientWidth; const h = host.clientHeight;
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (state.view === 'seat' && state.spec) rig.applySeat();
    if (composer) { composer.setPixelRatio(dpr()); composer.setSize(w, h); bloomPass?.setSize(w / 2, h / 2); }
    state.dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  /* ---------- Visibility ---------- */
  const io = new IntersectionObserver((es) => { state.onscreen = es.some((e) => e.isIntersecting); kick(); }, { threshold: 0.01 });
  io.observe(host);
  const onVis = () => { state.docVisible = !document.hidden; kick(); };
  document.addEventListener('visibilitychange', onVis);

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); state.lost = true; stop(); opts.onLost?.(); });

  /* ---------- Loop ---------- */
  const clock = new THREE.Clock();
  let raf = 0; let t = 0; let ema = 16; let lastStats = 0; let lastHeading = '';
  const shouldRun = () => state.active && state.onscreen && state.docVisible && !state.disposed && !state.lost;
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function kick() {
    if (shouldRun() && !raf) { clock.getDelta(); raf = requestAnimationFrame(frame); }
    if (!shouldRun()) stop();
  }

  const _size = new THREE.Vector2();
  function renderNow() {
    renderer.info.reset();
    const C = state.cmp;
    if (C && state.view === 'seat' && rig.mode === 'seat') {
      // Split screen: each seat gets its own viewport (and its own aspect), so both views
      // stay centred however the divider is dragged.
      renderer.getSize(_size); const w = _size.x; const h = _size.y;
      const s = Math.min(0.85, Math.max(0.15, C.split));
      const A = C.stacked ? [0, Math.round(h * (1 - s)), w, h - Math.round(h * (1 - s))] : [0, 0, Math.round(w * s), h];
      const Bv = C.stacked ? [0, 0, w, Math.round(h * (1 - s))] : [Math.round(w * s), 0, w - Math.round(w * s), h];
      renderer.setScissorTest(true);
      camera.aspect = A[2] / Math.max(1, A[3]); rig.applySeat(); camera.updateProjectionMatrix();
      renderer.setViewport(...A); renderer.setScissor(...A);
      renderer.render(scene, camera);
      camB.aspect = Bv[2] / Math.max(1, Bv[3]); rig.poseOther(camB, C.spec);
      renderer.setViewport(...Bv); renderer.setScissor(...Bv);
      renderer.render(scene, camB);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
      camera.aspect = w / Math.max(1, h); rig.applySeat(); camera.updateProjectionMatrix();
      return;
    }
    if (bloomOn && composer) composer.render(); else renderer.render(scene, camera);
  }

  function frame() {
    raf = 0;
    if (!shouldRun()) return;
    const dt = Math.min(0.1, clock.getDelta());
    const still = reduced();
    const animating = !still && !!state.venue;
    if (!still) t += dt;
    const moved = rig.update(dt);
    if (state.venue) {
      const t0 = performance.now();
      if (animating || state.dirty || moved || state.venue.crowd?.waving) {
        state.venue.update(t, dt, { still });
        state.fg?.update(t, still);
        renderNow();
        state.dirty = false;
        const ms = performance.now() - t0;
        ema = ema * 0.92 + ms * 0.08;
      }
    }
    // Heading for the mini-map and descriptions (only when it changed).
    const h = rig.heading();
    const key = `${h.angle.toFixed(3)}|${h.hfov.toFixed(3)}|${h.x.toFixed(1)}`;
    if (key !== lastHeading) { lastHeading = key; opts.onCamera?.(h); }
    const now = performance.now();
    if (opts.onFrame && now - lastStats > 400) {
      lastStats = now;
      opts.onFrame({ cpuMs: ema, fps: 1000 / Math.max(1, dt * 1000), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, view: state.view });
    }
    if (state.view === 'overview') opts.onProject?.(project());
    raf = requestAnimationFrame(frame);
  }

  /* ---------- Venue ---------- */
  function disposeObject(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
    });
  }

  function clearVenue() {
    if (state.fg) { scene.remove(state.fg.group); state.fg.dispose(); state.fg = null; }
    if (state.cmp?.fg) { scene.remove(state.cmp.fg.group); state.cmp.fg.dispose(); }
    state.cmp = null;
    if (state.venue) {
      scene.remove(state.venue.root);
      try { state.venue.dispose?.(); } catch (err) { console.warn('[viewer] venue dispose', err); }
      disposeObject(state.venue.root);
      state.venue = null;
    }
    renderer.renderLists.dispose();
  }

  let loadToken = 0;
  async function load({ archetype, mode, variant }) {
    const token = ++loadToken;
    state.loading = true;
    const mod = await (BUILDERS[archetype] || BUILDERS.stadium)();
    if (token !== loadToken || state.disposed) return false;
    clearVenue();
    const venue = await mod.build({ renderer, mode, lowPower, racing: variant });
    if (token !== loadToken || state.disposed) { venue.dispose?.(); disposeObject(venue.root); return false; }
    state.venue = venue; state.archetype = archetype; state.mode = mode;
    scene.add(venue.root);
    venue.crowd?.setDensity(state.density);
    applyMood();
    // Compile shaders up front so the first visible frame does not stall.
    try { await renderer.compileAsync?.(scene, camera); } catch { /* optional */ }
    state.loading = false; state.dirty = true;
    kick();
    return true;
  }

  // Indoor overviews (roof lifted off) get a little more exposure so the bowl reads clearly.
  let baseExposure = 1;
  function applyExposure() {
    const boost = state.view === 'overview' && state.venue?.indoor ? 1.7 : 1;
    renderer.toneMappingExposure = baseExposure * boost;
    state.dirty = true;
  }

  function applyMood() {
    if (!state.venue) return;
    const info = lighting.apply(state.mood, { indoor: state.venue.indoor, bounds: state.venue.bounds, tune: state.venue.tune });
    baseExposure = renderer.toneMappingExposure;
    applyExposure();
    state.venue.setMood?.(state.mood, info);
    applySeatLight();
    bloomOn = !!info.bloom && !lowPower;
    if (bloomOn) {
      ensureComposer();
      bloomPass.strength = info.bloom.strength; bloomPass.radius = info.bloom.radius; bloomPass.threshold = info.bloom.threshold;
    }
    renderer.shadowMap.needsUpdate = true;
    state.dirty = true;
  }

  // The room light of a box or restaurant matters less when daylight floods in.
  function applySeatLight() {
    // A venue can scale it (tune.seatLight), e.g. the racecourse, whose rooms face open sky.
    const k = (state.venue?.indoor ? 1 : state.mood === 'night' ? 1 : state.mood === 'golden' ? 0.6 : 0.35) * (state.venue?.tune?.seatLight ?? 1);
    seatLight.intensity = (state.seatLightBase || 0) * k;
  }

  // Moves a seat spec onto the nearest real seat in the same row, so the camera never sits in an aisle or a vomitory.
  function snap(spec) {
    const seats = state.venue?.seats;
    if (!seats || !spec.snapTier) return spec;
    const [px, py, pz] = spec.position; const eye = spec.eye ?? 1.18;
    let near = null; let bd = 16;
    for (const s of seats.slots) {
      if (s.tier !== spec.snapTier || Math.abs(s.y + eye - py) > 0.25) continue;
      const d = (s.x - px) ** 2 + (s.z - pz) ** 2;
      if (d < bd) { bd = d; near = s; }
    }
    return near ? { ...spec, position: [near.x, near.y + eye, near.z], normal: [near.nx, 0, near.nz] } : spec;
  }

  // Tells the seat field, the crowd and the venue where the viewer (and any compare seat) is.
  function applyViewers() {
    if (!state.spec) return;
    const pos = new THREE.Vector3().fromArray(state.spec.position);
    const pos2 = state.cmp ? new THREE.Vector3().fromArray(state.cmp.spec.position) : null;
    state.venue?.seats?.setViewer(pos, lowPower ? 9 : 15, pos2);
    const s = state.spec; const n = s.normal || [0, 0, -1];
    const lane = s.clearAhead ? { x: -n[0], z: -n[2], len: s.clearAhead } : null;
    state.venue?.crowd?.setViewer(pos, undefined, pos2, s.clear || 0.55, lane);
    state.venue?.setViewer?.(pos);
  }

  function setSeat(spec0, { fly = false } = {}) {
    if (!spec0) return;
    const spec = snap(spec0);
    state.spec = spec;
    applyViewers();
    if (state.fg) { scene.remove(state.fg.group); state.fg.dispose(); }
    state.fg = buildForeground(spec, { lowPower });
    setLayer(state.fg.group, 1);
    scene.add(state.fg.group);
    const L = state.fg.light;
    state.seatLightBase = L ? L.intensity : 0;
    applySeatLight();
    if (L) { seatLight.position.copy(L.position); seatLight.color.set(L.color); seatLight.distance = L.distance; }
    if (state.view === 'overview' && fly) {
      rig.flyToSeat(spec);
      state.view = rig.mode === 'flying' ? 'flying' : 'seat';
    } else {
      rig.setSeat(spec, { fly: false });
    }
    state.dirty = true; kick();
  }

  function setView(view) {
    if (!state.venue) { state.view = view; return; }
    if (view === 'overview') {
      const o = state.venue.overview;
      // Narrow (portrait) screens step the overview camera back so the whole bowl fits.
      const back = camera.aspect < 1.2 ? 1.25 / Math.max(0.55, camera.aspect) : 1;
      const pos = o.target.clone().add(o.position.clone().sub(o.target).multiplyScalar(back));
      rig.setMode('overview', { overviewPose: { position: pos, target: o.target.clone(), minDistance: o.minDistance, maxDistance: o.maxDistance * back, fov: 42 } });
      state.view = 'overview';
    } else {
      rig.setMode('seat');
      state.view = 'seat';
    }
    state.venue.setView?.(state.view);
    applyExposure();
    state.dirty = true; kick();
  }

  /* ---------- Compare (split screen) ---------- */
  function setCompare(spec0, { split = 0.5, stacked = false } = {}) {
    if (state.cmp?.fg && (!spec0 || state.cmp.key !== JSON.stringify(spec0.position))) { scene.remove(state.cmp.fg.group); state.cmp.fg.dispose(); state.cmp.fg = null; }
    if (!spec0) { state.cmp = null; applyViewers(); state.dirty = true; kick(); return; }
    const key = JSON.stringify(spec0.position);
    if (!state.cmp || state.cmp.key !== key) {
      const spec = snap(spec0);
      const fg = buildForeground(spec, { lowPower });
      setLayer(fg.group, 2);
      scene.add(fg.group);
      state.cmp = { spec, fg, key, split, stacked };
      applyViewers();
    }
    state.cmp.split = split; state.cmp.stacked = stacked;
    state.dirty = true; kick();
  }

  /* ---------- Markers (projected for HTML buttons) ---------- */
  const _v = new THREE.Vector3();
  function project() {
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    return state.markers.map((m) => {
      _v.fromArray(m.position).project(camera);
      return { id: m.id, x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, visible: _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05 };
    });
  }

  /* ---------- Snapshot ---------- */
  // Renders now and copies the frame into a 2D canvas at most maxW wide (the WebGL buffer
  // is only readable in the same task as the render, so this must stay synchronous).
  function snapshotCanvas(maxW = 1600) {
    try {
      state.venue?.update(t, 0, { still: reduced() });
      renderNow();
      const src = canvas;
      const w = Math.min(maxW, src.width); const h = Math.round(w * (src.height / src.width));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0, w, h);
      return c;
    } catch { return null; }
  }
  function snapshot(maxW = 360) {
    const c = snapshotCanvas(maxW);
    try { return c ? c.toDataURL('image/jpeg', 0.78) : null; } catch { return null; }
  }

  /* ---------- Public API ---------- */
  return {
    canvas,
    load,
    setSeat,
    setView,
    setLight(m) { state.mood = m; applyMood(); kick(); },
    setDensity(v) { state.density = v; state.venue?.crowd?.setDensity(v); state.dirty = true; kick(); },
    wave() { state.venue?.crowd?.wave(t); state.dirty = true; kick(); },
    get waving() { return !!state.venue?.crowd?.waving; },
    resetLook() { rig.reset(); state.dirty = true; kick(); },
    turn(dy, dp) { rig.turn(dy, dp); kick(); },
    zoomBy(f) { rig.setZoom(rig.zoomTarget * f); kick(); },
    get zoom() { return rig.zoomTarget; },
    heading: () => rig.heading(),
    setMarkers(list) { state.markers = list || []; },
    project,
    snapshot,
    snapshotCanvas,
    setCompare,
    get comparing() { return !!state.cmp; },
    play(name) { const ok = !!state.venue?.play?.(name, t, reduced()); state.dirty = true; kick(); return ok; },
    get racing() { return !!state.venue?.racing; },
    get view() { return state.view; },
    setActive(on) { state.active = !!on; kick(); },
    invalidate() { state.dirty = true; kick(); },
    renderOnce() { if (rig.mode === 'seat' && state.spec) { rig.zoomLevel = rig.zoomTarget; rig.applySeat(); } state.venue?.update(t, 0, { still: reduced() }); state.fg?.update(t, reduced()); renderNow(); },
    stats: () => ({ cpuMs: ema, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    _debug: { venue: () => state.venue, keyOnly() { lighting.hemi.intensity = 0; scene.environmentIntensity = 0; state.dirty = true; kick(); }, scene, renderer, camera },
    dispose() {
      state.disposed = true; stop();
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      clearVenue();
      rig.dispose();
      lighting.dispose();
      composer?.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
