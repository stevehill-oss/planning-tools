// Matterport-style viewing modes for the Seat Reality Viewer engine (js/viewer/engine.js).
// Pure three.js helpers, no DOM beyond the canvas they listen on.
//
//   PlanView      top-down orthographic plan. World x runs left to right, world z top to
//                 bottom (the mini-map and layouts.planFrame use the same convention), so
//                 layouts.worldToPlan(planFit(...)) lines up with this camera when zoom = 1
//                 and pan = 0. Drag pans, wheel or pinch zooms, arrows pan, + and - zoom.
//   Hotspots      Move mode: circular rings at neighbouring seats (decoration; the clickable
//                 buttons are HTML, positioned by the engine's worldToScreen()).
//   MeasureLayer  a straight line between two points with end dots, drawn over everything.
//   PhotoAccumulator  holds the camera still and averages many jittered frames (sub-pixel
//                 anti-aliasing, soft shadows from a jittered key light and, from a seat, a
//                 small aperture for depth of field) into a high resolution still.

import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Plan ---------- */

export class PlanView {
  constructor(dom, { onChange = () => {} } = {}) {
    this.dom = dom; this.onChange = onChange;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000);
    this.camera.up.set(0, 0, -1);
    this.camera.layers.enable(1);
    this.frame = { x0: -50, z0: -50, w: 100, h: 100, cx: 0, cz: 0 };
    this.zoom = 1; this.panX = 0; this.panZ = 0; this.active = false;
    this.pointers = new Map(); this.pinch = 0;
    this._down = (e) => { if (!this.active) return; this.dom.focus?.({ preventScroll: true }); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { this.dom.setPointerCapture(e.pointerId); } catch { /* not capturable */ } if (this.pointers.size === 2) this.pinch = this.pinchDist(); };
    this._move = (e) => {
      if (!this.active || !this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId); const dx = e.clientX - prev.x; const dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) { const d = this.pinchDist(); if (this.pinch > 0) this.setZoom(this.zoom * (d / this.pinch)); this.pinch = d; return; }
      const s = this.scale(); this.panX -= dx / s; this.panZ -= dy / s; this.clampPan(); this.apply();
    };
    this._up = (e) => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch = 0; };
    this._wheel = (e) => { if (!this.active) return; const z = clamp(this.zoom * Math.exp(-e.deltaY * 0.0015), 1, 8); if (z === this.zoom) return; e.preventDefault(); this.setZoom(z); };
    this._key = (e) => {
      if (!this.active) return;
      const step = 40 / this.scale();
      const map = { ArrowLeft: () => { this.panX -= step; }, ArrowRight: () => { this.panX += step; }, ArrowUp: () => { this.panZ -= step; }, ArrowDown: () => { this.panZ += step; }, '+': () => this.setZoom(this.zoom * 1.25), '=': () => this.setZoom(this.zoom * 1.25), '-': () => this.setZoom(this.zoom / 1.25), 0: () => this.reset(), Home: () => this.reset() };
      const fn = map[e.key]; if (!fn) return; e.preventDefault(); fn(); this.clampPan(); this.apply();
    };
    dom.addEventListener('pointerdown', this._down); dom.addEventListener('pointermove', this._move);
    dom.addEventListener('pointerup', this._up); dom.addEventListener('pointercancel', this._up);
    dom.addEventListener('wheel', this._wheel, { passive: false }); dom.addEventListener('keydown', this._key);
  }
  pinchDist() { const [a, b] = [...this.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
  setFrame(frame) { this.frame = frame; this.reset(); }
  reset() { this.zoom = 1; this.panX = 0; this.panZ = 0; this.apply(); }
  setZoom(z) { this.zoom = clamp(z, 1, 8); this.clampPan(); this.apply(); }
  clampPan() { const f = this.frame; this.panX = clamp(this.panX, -f.w / 2, f.w / 2); this.panZ = clamp(this.panZ, -f.h / 2, f.h / 2); }
  // Pixels per metre, as layouts.planFit gives for the same box.
  scale() { const w = this.dom.clientWidth || 1; const h = this.dom.clientHeight || 1; return Math.min(w / this.frame.w, h / this.frame.h) * this.zoom; }
  apply() {
    const w = this.dom.clientWidth || 1; const h = this.dom.clientHeight || 1; const s = this.scale();
    const cx = this.frame.cx + this.panX; const cz = this.frame.cz + this.panZ;
    const c = this.camera;
    c.left = -w / 2 / s; c.right = w / 2 / s; c.top = h / 2 / s; c.bottom = -h / 2 / s;
    c.position.set(cx, 900, cz); c.lookAt(cx, 0, cz); c.updateProjectionMatrix();
    this.onChange();
  }
  // The fit object layouts.worldToPlan() and planToWorld() take, for this camera right now.
  fit() { return { scale: this.scale(), cx: this.frame.cx + this.panX, cz: this.frame.cz + this.panZ, width: this.dom.clientWidth, height: this.dom.clientHeight }; }
  dispose() {
    const d = this.dom;
    d.removeEventListener('pointerdown', this._down); d.removeEventListener('pointermove', this._move);
    d.removeEventListener('pointerup', this._up); d.removeEventListener('pointercancel', this._up);
    d.removeEventListener('wheel', this._wheel); d.removeEventListener('keydown', this._key);
  }
}

/* ---------- Move hotspots (rings on the floor) ---------- */

export class Hotspots {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'hotspots'; this.group.userData.noAO = true;
    this.ringGeo = new THREE.RingGeometry(0.2, 0.3, 40); this.ringGeo.rotateX(-Math.PI / 2);
    this.discGeo = new THREE.CircleGeometry(0.2, 40); this.discGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.discMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.group.visible = false;
    scene.add(this.group);
  }
  // list: [{ floor: [x, y, z] }]. The ring sits just above the seat pan (or the floor of a
  // box, a terrace or a lawn), like a scan point on a floor.
  set(list) {
    this.group.clear();
    (list || []).forEach((h) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.ringGeo, this.ringMat), new THREE.Mesh(this.discGeo, this.discMat));
      g.position.set(h.floor[0], h.floor[1] + 0.5, h.floor[2]);
      g.renderOrder = 6;
      this.group.add(g);
    });
    this.group.visible = !!(list && list.length);
  }
  pulse(t) { const k = 1 + Math.sin(t * 2.4) * 0.06; this.group.children.forEach((g) => g.scale.setScalar(k)); }
  dispose() { this.group.removeFromParent(); this.ringGeo.dispose(); this.discGeo.dispose(); this.ringMat.dispose(); this.discMat.dispose(); }
}

/* ---------- Show spacing: dimension lines round the chosen seat ---------- */

// lines: [{ a: [x,y,z], b: [x,y,z] }]. Drawn over everything, with end ticks, in the
// champagne of the measure line; thickness follows the camera so they stay readable.
export class SpacingLayer {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'spacing'; this.group.userData.noAO = true; this.group.visible = false;
    this.mat = new THREE.MeshBasicMaterial({ color: '#f3d9a4', depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, toneMapped: false });
    this.lineGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.tickGeo = new THREE.SphereGeometry(1, 12, 8);
    this.lines = [];
    scene.add(this.group);
  }
  set(lines) {
    this.group.clear(); this.lines = lines || [];
    this.group.visible = this.lines.length > 0;
    this.lines.forEach((l) => {
      const A = new THREE.Vector3().fromArray(l.a); const B = new THREE.Vector3().fromArray(l.b); const d = B.clone().sub(A);
      const line = new THREE.Mesh(this.lineGeo, this.mat);
      line.position.copy(A).addScaledVector(d, 0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      line.userData = { len: Math.max(0.001, d.length()) };
      const ta = new THREE.Mesh(this.tickGeo, this.mat); ta.position.copy(A);
      const tb = new THREE.Mesh(this.tickGeo, this.mat); tb.position.copy(B);
      [line, ta, tb].forEach((m) => { m.renderOrder = 998; m.layers.enableAll(); this.group.add(m); });
    });
  }
  // r: line radius in metres (from the camera distance).
  size(r) {
    this.group.children.forEach((m) => {
      if (m.geometry === this.lineGeo) m.scale.set(r, m.userData.len, r); else m.scale.setScalar(r * 2.4);
    });
  }
  dispose() { this.group.removeFromParent(); this.lineGeo.dispose(); this.tickGeo.dispose(); this.mat.dispose(); }
}

/* ---------- Measure ---------- */

export class MeasureLayer {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'measure'; this.group.userData.noAO = true; this.group.visible = false;
    const mat = new THREE.MeshBasicMaterial({ color: '#e8c27a', depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
    this.mat = mat;
    this.lineGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    this.dotGeo = new THREE.SphereGeometry(1, 20, 14);
    this.line = new THREE.Mesh(this.lineGeo, mat); this.a = new THREE.Mesh(this.dotGeo, mat); this.b = new THREE.Mesh(this.dotGeo, mat);
    [this.line, this.a, this.b].forEach((m) => { m.renderOrder = 999; m.layers.enableAll(); this.group.add(m); });
    this.b.visible = false; this.line.visible = false;
    scene.add(this.group);
  }
  // pa, pb: [x, y, z] or null. size: rough metres per pixel near the points, so the line
  // and dots stay readable from a seat and from above.
  set(pa, pb, size = 0.05) {
    this.group.visible = !!pa;
    if (!pa) return;
    const r = Math.max(0.03, size * 3);
    this.a.position.fromArray(pa); this.a.scale.setScalar(r * 2.2);
    this.b.visible = !!pb; this.line.visible = !!pb;
    if (!pb) return;
    this.b.position.fromArray(pb); this.b.scale.setScalar(r * 2.2);
    const A = new THREE.Vector3().fromArray(pa); const B = new THREE.Vector3().fromArray(pb); const d = B.clone().sub(A);
    this.line.position.copy(A).addScaledVector(d, 0.5);
    this.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    this.line.scale.set(r, Math.max(0.001, d.length()), r);
  }
  dispose() { this.group.removeFromParent(); this.lineGeo.dispose(); this.dotGeo.dispose(); this.mat.dispose(); }
}

/* ---------- Photo mode: progressive accumulation ---------- */

const ACCUM_FRAG = /* glsl */`
uniform sampler2D tPrev; uniform sampler2D tNew; uniform float weight; varying vec2 vUv;
void main() { gl_FragColor = mix(texture2D(tPrev, vUv), texture2D(tNew, vUv), weight); }`;
// Display: exposure, the same ACES filmic curve three.js uses, then the sRGB transfer.
const SHOW_FRAG = /* glsl */`
uniform sampler2D tAccum; uniform float exposure; varying vec2 vUv;
vec3 pceFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 pceAces(vec3 c) {
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= exposure / 0.6; c = I * c; c = pceFit(c); c = O * c; return clamp(c, 0.0, 1.0);
}
vec3 pceSRGB(vec3 c) { return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(vec3(0.0031308), c)); }
void main() { vec3 c = texture2D(tAccum, vUv).rgb; gl_FragColor = vec4(pceSRGB(pceAces(c)), 1.0); }`;
const QUAD_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Halton low-discrepancy sequence for the sub-pixel and aperture samples.
function halton(i, b) { let f = 1; let r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

export class PhotoAccumulator {
  constructor(renderer) {
    this.renderer = renderer;
    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.accumMat = new THREE.ShaderMaterial({ uniforms: { tPrev: { value: null }, tNew: { value: null }, weight: { value: 1 } }, vertexShader: QUAD_VERT, fragmentShader: ACCUM_FRAG, depthTest: false, depthWrite: false });
    this.showMat = new THREE.ShaderMaterial({ uniforms: { tAccum: { value: null }, exposure: { value: 1 } }, vertexShader: QUAD_VERT, fragmentShader: SHOW_FRAG, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(this.quadGeo, this.accumMat); this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.rt = []; this.k = 0; this.total = 0; this.active = false; this.size = [0, 0];
  }
  // opts: { width, height, samples, camera, scene, light, lightBase (Vector3), soft (metres of
  // key light jitter), dof: { focus, aperture } | null }
  start(opts) {
    this.stop(false);
    const { width, height } = opts;
    const mk = () => new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    this.rt = [mk(), mk()];
    this.frameRT = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: true });
    this.size = [width, height]; this.k = 0; this.total = opts.samples; this.opts = opts; this.active = true;
    const cam = opts.camera; this.cam = cam;
    this.base = { pos: cam.position.clone(), quat: cam.quaternion.clone() };
    this.lightBase = opts.light ? opts.light.position.clone() : null;
  }
  // Renders one more jittered sample. Returns true while more remain.
  step() {
    if (!this.active || this.k >= this.total) return false;
    const R = this.renderer; const o = this.opts; const cam = this.cam; const [W, H] = this.size; const k = this.k;
    const jx = halton(k + 1, 2) - 0.5; const jy = halton(k + 1, 3) - 0.5;
    let ox = jx; let oy = jy;
    cam.position.copy(this.base.pos); cam.quaternion.copy(this.base.quat);
    if (o.dof && cam.isPerspectiveCamera) {
      // Thin-lens aperture: move the eye on a small disc and shift the view so the focus
      // plane stays put, which blurs what is nearer or further than it.
      const a = 2 * Math.PI * halton(k + 1, 5); const r = Math.sqrt(halton(k + 1, 7)) * o.dof.aperture;
      const dx = Math.cos(a) * r; const dy = Math.sin(a) * r;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      cam.position.addScaledVector(right, dx).addScaledVector(up, dy);
      const pxPerM = (H / 2) / (o.dof.focus * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      ox += -dx * pxPerM; oy += dy * pxPerM;
    }
    cam.setViewOffset(W, H, ox, oy, W, H);
    cam.updateMatrixWorld();
    if (o.light && this.lightBase && o.soft) {
      const a = 2 * Math.PI * halton(k + 1, 11); const r = Math.sqrt(halton(k + 1, 13)) * o.soft;
      o.light.position.copy(this.lightBase).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      o.light.updateMatrixWorld();
      R.shadowMap.needsUpdate = true;
    }
    R.setRenderTarget(this.frameRT); R.clear(); R.render(o.scene, cam);
    const src = this.rt[k % 2]; const dst = this.rt[(k + 1) % 2];
    this.quad.material = this.accumMat;
    this.accumMat.uniforms.tPrev.value = src.texture; this.accumMat.uniforms.tNew.value = this.frameRT.texture; this.accumMat.uniforms.weight.value = 1 / (k + 1);
    R.setRenderTarget(dst); R.render(this.quadScene, this.quadCam);
    R.setRenderTarget(null);
    this.k++;
    return this.k < this.total;
  }
  get texture() { return this.k ? this.rt[this.k % 2].texture : null; }
  get progress() { return this.total ? this.k / this.total : 0; }
  // Draws the current result to the screen (or a target), tone mapped like the live view.
  show(exposure, target = null) {
    if (!this.texture) return;
    const R = this.renderer;
    this.quad.material = this.showMat; this.showMat.uniforms.tAccum.value = this.texture; this.showMat.uniforms.exposure.value = exposure;
    R.setRenderTarget(target); R.render(this.quadScene, this.quadCam); R.setRenderTarget(null);
  }
  // The finished still as a 2D canvas at full resolution.
  toCanvas(exposure) {
    const [W, H] = this.size; if (!W || !this.texture) return null;
    const R = this.renderer;
    const out = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.show(exposure, out);
    const px = new Uint8Array(W * H * 4);
    R.readRenderTargetPixels(out, 0, 0, W, H, px);
    out.dispose();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    return c;
  }
  // Puts the camera and the light back as they were.
  stop(restore = true) {
    if (restore && this.cam && this.base) { this.cam.clearViewOffset(); this.cam.position.copy(this.base.pos); this.cam.quaternion.copy(this.base.quat); this.cam.updateMatrixWorld(); }
    if (restore && this.opts?.light && this.lightBase) { this.opts.light.position.copy(this.lightBase); this.renderer.shadowMap.needsUpdate = true; }
    this.rt.forEach((t) => t.dispose()); this.rt = []; this.frameRT?.dispose(); this.frameRT = null;
    this.active = false; this.k = 0;
  }
  dispose() { this.stop(); this.quadGeo.dispose(); this.accumMat.dispose(); this.showMat.dispose(); }
}
