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
//   await eng.load({ venueId, mode, variant })   builds a venue from its layout (disposes the old one)
//   eng.setQuality('standard' | 'high')          High adds ambient occlusion (GTAO) and a higher
//                                                pixel ratio; adaptive pixel ratio and an automatic
//                                                fall back to Standard keep slow devices smooth
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
// Matterport-style modes (js/viewer/modes.js):
//   eng.setView('plan')                          top-down orthographic plan (eng.plan is the
//                                                PlanView: .camera, .fit() for layouts.worldToPlan)
//   eng.setSeat(spec, { glide: true })           Move: eased step to a nearby seat with a short
//                                                cross-fade (a cut under reduced motion)
//   eng.setHotspots([{ floor:[x,y,z] }] | null)  rings on the floor for Move
//   eng.worldToScreen([x,y,z]) -> { x, y, visible }  in canvas pixels, for the active camera
//   eng.pick(clientX, clientY) -> { p:[x,y,z], label, kind } | null   measuring: snaps to a
//                                                named point (stage, ring, markings, rails) or a seat
//   eng.setMeasure(a | null, b | null)           draws the measured line
//   eng.startPhoto({ samples, scale }), eng.stopPhoto(), eng.photoCanvas()   Photo mode
// opts: { lowPower, quality, fixedQuality, reducedMotion(): bool, onCamera(heading), onFrame(stats), onFlyEnd(), onGlideEnd(),
//         onDrawn(), onPhoto({ progress, done }), onLost(), onQuality(q, why) }

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { layoutFor, planFrame, measurePoints } from './layouts.js';
import { Lighting } from './lighting.js';
import { CameraRig } from './controls.js';
import { buildForeground } from './foreground.js';
import { PlanView, Hotspots, MeasureLayer, SpacingLayer, PhotoAccumulator } from './modes.js';

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
  let quality = lowPower ? 'standard' : (opts.quality === 'high' ? 'high' : 'standard');
  const fixedQuality = !!opts.fixedQuality;
  // Adaptive pixel ratio: dprScale drops when frames are slow and recovers when they are fast.
  let dprScale = 1;
  const dprCap = () => (lowPower ? 1 : quality === 'high' ? (coarse ? 1.5 : 2) : (coarse ? 1.25 : 1.5));
  const dpr = () => Math.max(0.6, Math.min(window.devicePixelRatio || 1, dprCap()) * dprScale);
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
  lighting.sky.userData.noAO = true; lighting.night.userData.noAO = true;
  // One permanent point light for seat interiors (a box, a suite). Kept in the scene at
  // zero intensity when unused, so moving between seats never changes the light count
  // (which would force every shader to recompile).
  const seatLight = new THREE.PointLight('#ffd9ab', 0, 8, 2);
  scene.add(seatLight);

  let composer = null; let bloomPass = null; let bloomOn = false; let gtaoPass = null; let smaaPass = null;
  const msaa = renderer.capabilities.isWebGL2;
  function ensureComposer() {
    if (composer || lowPower) return;
    const size = renderer.getSize(new THREE.Vector2());
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa ? 4 : 0 }));
    composer.addPass(new RenderPass(scene, camera));
    // Ground-truth ambient occlusion on High, at half resolution. Crowds, glass, the sky and
    // anything flagged userData.noAO are left out of its depth and normal pass.
    gtaoPass = new GTAOPass(scene, camera, Math.max(2, size.x / 2), Math.max(2, size.y / 2));
    gtaoPass.blendIntensity = 0.85;
    gtaoPass.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.2, thickness: 1.6, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
    gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    const baseHide = gtaoPass.overrideVisibility.bind(gtaoPass);
    gtaoPass.overrideVisibility = function hide() {
      baseHide();
      this.scene.traverse((o) => {
        if (o.userData.noAO) o.visible = false;
        else if (o.isMesh && !Array.isArray(o.material) && o.material?.transparent) o.visible = false;
      });
    };
    composer.addPass(gtaoPass);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.6, 0.5, 0.85);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    // Where multisampled targets are not available, SMAA after tone mapping.
    if (!msaa) { smaaPass = new SMAAPass(size.x, size.y); composer.addPass(smaaPass); }
    composer.setPixelRatio(dpr());
    composer.setSize(size.x, size.y);
    sizeGtao();
  }
  function sizeGtao() {
    if (!gtaoPass) return;
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    gtaoPass.setSize(Math.max(2, Math.round(s.x / 2)), Math.max(2, Math.round(s.y / 2)));
  }
  const useComposer = () => !!composer && (bloomOn || quality === 'high');
  function applyPasses() {
    if (quality === 'high' && !lowPower) ensureComposer();
    if (!composer) return;
    gtaoPass.enabled = quality === 'high';
    bloomPass.enabled = bloomOn;
  }

  const state = {
    venue: null, archetype: null, mode: null, mood: 'day', density: 0.93, view: 'seat', spec: null,
    active: true, onscreen: true, docVisible: !document.hidden, dirty: true, loading: false, fg: null,
    markers: [], disposed: false, lost: false, cmp: null, venueId: null, photo: false,
  };

  const rig = new CameraRig(camera, canvas, {
    reducedMotion: reduced,
    onChange: () => { state.dirty = true; },
    onFlyEnd: (kind) => {
      state.view = 'seat'; state.venue?.setView?.('seat'); applyExposure(); state.dirty = true;
      if (kind === 'glide') opts.onGlideEnd?.(); else opts.onFlyEnd?.();
    },
  });

  // Plan camera, Move rings, the measuring line and the photo accumulator.
  const plan = new PlanView(canvas, { onChange: () => { state.dirty = true; } });
  const hot = new Hotspots(scene);
  const meas = new MeasureLayer(scene);
  let measPts = [null, null];
  // Show spacing: dimension lines round the chosen seat (js/viewer/seatplan.js spacingLines).
  const spacing = new SpacingLayer(scene);
  let spacingAt = null;
  const photo = new PhotoAccumulator(renderer);
  const activeCam = () => (state.view === 'plan' ? plan.camera : camera);
  // Cross-fade layer for Move: a copy of the last frame that fades out over the glide.
  const xfade = document.createElement('canvas');
  xfade.setAttribute('aria-hidden', 'true');
  Object.assign(xfade.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', opacity: '0', transition: 'opacity 420ms ease-out' });
  host.append(xfade);

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
    if (state.view === 'plan') plan.apply();
    if (composer) { composer.setPixelRatio(dpr()); composer.setSize(w, h); bloomPass?.setSize(w / 2, h / 2); sizeGtao(); }
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
    if (state.view === 'plan') {
      // Haze is distance based; from 900 m up it would wash the plan out.
      const d = scene.fog?.density; if (scene.fog) scene.fog.density = 0;
      renderer.render(scene, plan.camera);
      if (scene.fog) scene.fog.density = d;
      return;
    }
    if (useComposer()) composer.render(); else renderer.render(scene, camera);
  }

  // Keeps the measuring line a readable width from wherever it is seen.
  function sizeMeasure() {
    if (!measPts[0]) return;
    const cam = activeCam(); const h = Math.max(1, canvas.clientHeight);
    let mpp;
    if (cam.isOrthographicCamera) mpp = (cam.top - cam.bottom) / h;
    else { const mid = new THREE.Vector3().fromArray(measPts[1] || measPts[0]); mpp = (2 * cam.position.distanceTo(mid) * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / h; }
    meas.set(measPts[0], measPts[1], mpp);
  }
  function sizeSpacing() {
    if (!spacingAt) return;
    const cam = activeCam(); const h = Math.max(1, canvas.clientHeight);
    const mpp = cam.isOrthographicCamera ? (cam.top - cam.bottom) / h : (2 * cam.position.distanceTo(spacingAt) * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / h;
    spacing.size(Math.max(0.0025, mpp * 1.1));
  }

  // Photo mode: a few samples per frame within a time budget, shown as they converge.
  function photoFrame() {
    let more = photo.k < photo.total;
    if (more) {
      const t0 = performance.now();
      do { more = photo.step(); } while (more && performance.now() - t0 < 22);
      photo.show(renderer.toneMappingExposure);
      opts.onPhoto?.({ progress: photo.progress, done: !more, samples: photo.k, total: photo.total });
    } else if (state.dirty) photo.show(renderer.toneMappingExposure);
    state.dirty = false;
  }

  function frame() {
    raf = 0;
    if (!shouldRun()) return;
    const dt = Math.min(0.1, clock.getDelta());
    const still = reduced();
    const animating = !still && !!state.venue;
    if (!still) t += dt;
    if (state.photo) { photoFrame(); raf = requestAnimationFrame(frame); return; }
    const moved = rig.update(dt);
    if (state.venue) {
      const t0 = performance.now();
      if (animating || state.dirty || moved || state.venue.crowd?.waving) {
        state.venue.update(t, dt, { still });
        state.fg?.update(t, still);
        if (hot.group.visible && !still) hot.pulse(t);
        sizeMeasure(); sizeSpacing();
        renderNow();
        opts.onDrawn?.();
        state.dirty = false;
        const ms = performance.now() - t0;
        ema = ema * 0.92 + ms * 0.08;
      }
    }
    // Heading for the mini-map and descriptions (only when it changed).
    adapt(performance.now(), animating);
    const h = rig.heading();
    const key = `${h.angle.toFixed(3)}|${h.hfov.toFixed(3)}|${h.x.toFixed(1)}`;
    if (key !== lastHeading) { lastHeading = key; opts.onCamera?.(h); }
    const now = performance.now();
    if (opts.onFrame && now - lastStats > 400) {
      lastStats = now;
      opts.onFrame({ cpuMs: ema, fps: 1000 / Math.max(1, dt * 1000), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, view: state.view });
    }
    if (state.view === 'overview' || state.view === 'plan') opts.onProject?.(project());
    raf = requestAnimationFrame(frame);
  }

  // Adaptive quality: when frames run slow for two seconds the pixel ratio steps down; if it
  // is already low on High, the engine falls back to Standard and says so. Fast frames for
  // five seconds step the pixel ratio back up. Off when the quality is fixed (dev pages).
  let wallLast = 0; let wallEma = 16; let slowFor = 0; let fastFor = 0;
  function adapt(now, continuous) {
    if (fixedQuality || !continuous) { wallLast = 0; return; }
    if (!wallLast) { wallLast = now; return; }
    const ms = now - wallLast; wallLast = now;
    if (ms > 1000) return;
    wallEma = wallEma * 0.9 + ms * 0.1;
    if (wallEma > 34) { slowFor += ms; fastFor = 0; } else if (wallEma < 20) { fastFor += ms; slowFor = 0; } else { slowFor = 0; fastFor = 0; }
    if (slowFor > 2000) {
      slowFor = 0;
      if (dprScale > 0.75) { dprScale = Math.max(0.7, dprScale - 0.15); resize(); }
      else if (quality === 'high') { quality = 'standard'; dprScale = 1; applyPasses(); resize(); opts.onQuality?.('standard', 'auto'); }
    }
    if (fastFor > 5000 && dprScale < 1) { fastFor = 0; dprScale = Math.min(1, dprScale + 0.1); resize(); }
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
  async function load({ venueId, mode, variant }) {
    const token = ++loadToken;
    state.loading = true;
    const layout = layoutFor(venueId);
    const archetype = layout?.archetype || 'stadium';
    const mod = await (BUILDERS[archetype] || BUILDERS.stadium)();
    if (token !== loadToken || state.disposed) return false;
    clearVenue();
    const venue = await mod.build({ renderer, mode, lowPower, racing: variant, layout, quality });
    if (venue.crowd?.group) venue.crowd.group.userData.noAO = true;
    if (token !== loadToken || state.disposed) { venue.dispose?.(); disposeObject(venue.root); return false; }
    state.venue = venue; state.archetype = archetype; state.mode = mode; state.venueId = venueId;
    scene.add(venue.root);
    hot.set(null); measPts = [null, null]; meas.set(null); spacing.set(null); spacingAt = null;
    const fr = planFrame(venueId, mode); if (fr) plan.setFrame(fr);
    if (state.view === 'plan') venue.setView?.('overview');
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
    const boost = (state.view === 'overview' || state.view === 'plan') && state.venue?.indoor ? 1.7 : 1;
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
    applyPasses();
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

  // Copies the frame on screen into the cross-fade layer and fades it out (Move).
  function crossFade() {
    try {
      renderNow();
      xfade.width = canvas.width; xfade.height = canvas.height;
      xfade.getContext('2d').drawImage(canvas, 0, 0);
      xfade.style.transition = 'none'; xfade.style.opacity = '1';
      requestAnimationFrame(() => requestAnimationFrame(() => { xfade.style.transition = 'opacity 420ms ease-out'; xfade.style.opacity = '0'; }));
    } catch { xfade.style.opacity = '0'; }
  }

  function setSeat(spec0, { fly = false, glide = false } = {}) {
    if (!spec0) return;
    const spec = snap(spec0);
    const gliding = glide && state.view === 'seat' && rig.mode === 'seat' && !reduced() && !!state.spec;
    if (gliding) crossFade();
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
    if ((state.view === 'overview' || state.view === 'plan') && fly) {
      if (state.view === 'plan') { plan.active = false; state.view = 'overview'; camera.position.copy(plan.camera.position); camera.lookAt(plan.camera.position.x, 0, plan.camera.position.z - 1); camera.position.y = 260; }
      rig.flyToSeat(spec);
      state.view = rig.mode === 'flying' ? 'flying' : 'seat';
    } else if (gliding) {
      rig.setSeat(spec, { fly: true, glide: true, keepLook: true });
    } else {
      rig.setSeat(spec, { fly: false, keepLook: glide });
    }
    state.dirty = true; kick();
  }

  function setView(view) {
    if (!state.venue) { state.view = view; return; }
    plan.active = view === 'plan';
    if (view === 'plan') {
      rig.orbit.enabled = false; rig.mode = 'plan';
      state.view = 'plan';
      plan.apply();
      state.venue.setView?.('overview');
      applyExposure();
      state.dirty = true; kick();
      return;
    }
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
  function worldToScreen(p) {
    const w = canvas.clientWidth; const h = canvas.clientHeight; const cam = activeCam();
    cam.updateMatrixWorld();
    _v.fromArray(p).project(cam);
    return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, visible: _v.z > -1 && _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05 };
  }
  function project() {
    return state.markers.map((m) => ({ id: m.id, ...worldToScreen(m.position) }));
  }

  /* ---------- Measure: snap a tap to a named point or a seat ---------- */
  function pick(clientX, clientY) {
    if (!state.venue) return null;
    const r = canvas.getBoundingClientRect(); const x = clientX - r.left; const y = clientY - r.top;
    let best = null; let bd = 34 * 34;
    measurePoints(state.venueId, state.mode).forEach((m) => {
      const s = worldToScreen(m.p); if (!s.visible) return;
      const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = { p: m.p, label: m.label, kind: 'point' }; }
    });
    if (best) return best;
    bd = 22 * 22;
    const L = layoutFor(state.venueId); const slots = state.venue.seats?.slots || [];
    const cam = activeCam(); cam.updateMatrixWorld();
    const w = canvas.clientWidth; const h = canvas.clientHeight; let hit = null;
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k]; _v.set(s.x, s.y + 0.45, s.z).project(cam);
      if (_v.z <= -1 || _v.z >= 1) continue;
      const sx = (_v.x * 0.5 + 0.5) * w; const sy = (-_v.y * 0.5 + 0.5) * h;
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      // Prefer the nearer seat when two project close together.
      if (d < bd || (hit && d < bd + 16 && _v.z < hit.z)) { bd = Math.min(bd, d); hit = { s, z: _v.z }; }
    }
    if (!hit) return null;
    const tl = L?.tiers?.[hit.s.tier]?.label;
    return { p: [hit.s.x, hit.s.y + 0.45, hit.s.z], label: tl ? `A seat on ${tl}, row ${hit.s.row + 1} (row modelled)` : 'A seat', kind: 'seat' };
  }

  /* ---------- Photo mode ---------- */
  function startPhoto({ samples = 48, scale = 2 } = {}) {
    if (!state.venue) return false;
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    const k = Math.min(scale, 4096 / Math.max(1, db.x), 4096 / Math.max(1, db.y));
    const W = Math.max(2, Math.round(db.x * k)); const H = Math.max(2, Math.round(db.y * k));
    const cam = activeCam();
    state.venue.update(t, 0, { still: true });
    hot.group.visible = false; meas.group.visible = false; spacing.group.visible = false; xfade.style.opacity = '0';
    const seat = state.view === 'seat' && rig.mode === 'seat' && state.spec;
    const focus = seat ? camera.position.distanceTo(new THREE.Vector3().fromArray(state.spec.target)) : 0;
    photo.start({
      width: W, height: H, samples, camera: cam, scene,
      light: lighting.key, soft: lighting.key.position.distanceTo(lighting.key.target.position) * 0.02,
      // A 3 mm aperture radius: close rails and heads soften, the action stays sharp.
      dof: seat && focus > 4 ? { focus, aperture: 0.003 } : null,
    });
    state.photo = true; state.dirty = true; kick();
    return true;
  }
  function stopPhoto() {
    if (!state.photo) return;
    photo.stop(); state.photo = false;
    hot.group.visible = hot.group.children.length > 0; spacing.group.visible = !!spacingAt; sizeMeasure();
    if (state.view === 'plan') plan.apply(); else if (rig.mode === 'seat') rig.applySeat();
    state.dirty = true; kick();
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
    setQuality(q) { if (lowPower) return; quality = q === 'high' ? 'high' : 'standard'; dprScale = 1; slowFor = 0; applyPasses(); resize(); state.dirty = true; kick(); },
    get quality() { return quality; },
    get pixelRatio() { return dpr(); },
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
    worldToScreen,
    plan,
    get activeCamera() { return activeCam(); },
    setHotspots(list) { hot.set(list); state.dirty = true; kick(); },
    pick,
    setMeasure(a, b) { measPts = [a || null, b || null]; if (!a) meas.set(null); else sizeMeasure(); state.dirty = true; kick(); },
    // lines: [{ a:[x,y,z], b:[x,y,z] }] or null. Labels are HTML, placed with worldToScreen.
    setSpacing(lines) {
      spacing.set(lines || null);
      spacingAt = lines?.length ? new THREE.Vector3().fromArray(lines[0].a) : null;
      sizeSpacing(); state.dirty = true; kick();
    },
    startPhoto,
    stopPhoto,
    get photoActive() { return state.photo; },
    photoCanvas() { return photo.toCanvas(renderer.toneMappingExposure); },
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
      plan.dispose(); hot.dispose(); meas.dispose(); spacing.dispose(); photo.dispose(); xfade.remove();
      lighting.dispose();
      composer?.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
