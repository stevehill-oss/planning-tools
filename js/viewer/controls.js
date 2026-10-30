// Camera rig: "From your seat" head-turn controls, "Overview" orbit, and the fly
// between them.
//
// Seat mode: drag (mouse, pen, touch) turns your head with inertia inside yaw and pitch
// limits; wheel or pinch zooms the field of view like binoculars (1x to 4x); arrow keys
// turn, + and - zoom, 0 or Home resets; double click resets.
// Overview: OrbitControls, damped and limited, around the focal point.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const YAW_LIMIT = 1.3;        // radians either side of straight ahead
const PITCH_MIN = -0.75; const PITCH_MAX = 0.55;
const ZOOM_MIN = 1; const ZOOM_MAX = 4;
const BASE_HFOV = 74;         // degrees, horizontal, at 1x

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class CameraRig {
  constructor(camera, dom, { reducedMotion = () => false, onChange = () => {}, onFlyEnd = () => {} } = {}) {
    this.camera = camera; this.dom = dom; this.reduced = reducedMotion; this.onChange = onChange; this.onFlyEnd = onFlyEnd;
    this.mode = 'seat';
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.baseYaw = 0; this.basePitch = 0;
    this.yaw = 0; this.pitch = 0; this.vy = 0; this.vp = 0;
    this.zoomLevel = 1; this.zoomTarget = 1;
    this.fly = null;
    this.pointers = new Map();
    this.dragging = false;
    this.lastMove = 0;

    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true; this.orbit.dampingFactor = 0.08;
    this.orbit.enablePan = false; this.orbit.rotateSpeed = 0.6; this.orbit.zoomSpeed = 0.8;
    this.orbit.maxPolarAngle = 1.38; this.orbit.minPolarAngle = 0.25;
    this.orbit.enabled = false;
    this.orbit.addEventListener('change', () => this.onChange());

    this._down = (e) => this.onDown(e);
    this._move = (e) => this.onMove(e);
    this._up = (e) => this.onUp(e);
    this._wheel = (e) => this.onWheel(e);
    this._key = (e) => this.onKey(e);
    this._dbl = () => { if (this.mode === 'seat') this.reset(); };
    dom.addEventListener('pointerdown', this._down);
    dom.addEventListener('pointermove', this._move);
    dom.addEventListener('pointerup', this._up);
    dom.addEventListener('pointercancel', this._up);
    dom.addEventListener('pointerleave', this._up);
    dom.addEventListener('wheel', this._wheel, { passive: false });
    dom.addEventListener('keydown', this._key);
    dom.addEventListener('dblclick', this._dbl);
  }

  /* ---------- Seat placement ---------- */

  // spec: { position: [x,y,z], target: [x,y,z] }. fly: tween from the current view.
  setSeat(spec, { fly = false, keepLook = false } = {}) {
    this.pos.fromArray(spec.position); this.target.fromArray(spec.target);
    const d = this.target.clone().sub(this.pos);
    this.baseYaw = Math.atan2(d.x, d.z);
    this.basePitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    if (!keepLook) { this.yaw = 0; this.pitch = 0; this.vy = 0; this.vp = 0; }
    if (fly && !this.reduced()) {
      const endQ = this.seatQuaternion();
      this.fly = { t: 0, dur: 1.7, p0: this.camera.position.clone(), q0: this.camera.quaternion.clone(), p1: this.pos.clone(), q1: endQ, f0: this.camera.fov };
      this.orbit.enabled = false;
      this.mode = 'flying';
    } else {
      this.fly = null;
      if (this.mode !== 'overview') this.mode = 'seat';
      if (this.mode === 'seat') this.applySeat();
    }
  }

  seatQuaternion() {
    const dir = this.dirFor(this.yaw, this.pitch);
    const m = new THREE.Matrix4().lookAt(this.pos, this.pos.clone().add(dir), new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }

  dirFor(yaw, pitch) {
    const Y = this.baseYaw + yaw; const P = clamp(this.basePitch + pitch, -1.35, 1.2);
    return new THREE.Vector3(Math.sin(Y) * Math.cos(P), Math.sin(P), Math.cos(Y) * Math.cos(P));
  }

  // Places another camera at another seat, looking the same way relative to that seat's
  // straight-ahead (the split-screen compare links both views to one drag).
  poseOther(cam, spec) {
    const p = new THREE.Vector3().fromArray(spec.position); const t = new THREE.Vector3().fromArray(spec.target);
    const d = t.sub(p);
    const Y = Math.atan2(d.x, d.z) + this.yaw;
    const P = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)) + this.pitch, -1.35, 1.2);
    cam.position.copy(p);
    cam.lookAt(p.x + Math.sin(Y) * Math.cos(P), p.y + Math.sin(P), p.z + Math.cos(Y) * Math.cos(P));
    cam.fov = this.fovFor(this.zoomLevel, cam.aspect);
    cam.updateProjectionMatrix();
  }

  fovFor(zoom, aspectIn) {
    const aspect = aspectIn || this.camera.aspect || 1.6;
    const h = THREE.MathUtils.degToRad(BASE_HFOV);
    // Keep a sensible vertical field on tall screens.
    const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(aspect, 0.9));
    return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.min(v, 1.35) / 2) / zoom));
  }

  applySeat() {
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.pos.clone().add(this.dirFor(this.yaw, this.pitch)));
    const f = this.fovFor(this.zoomLevel);
    if (Math.abs(this.camera.fov - f) > 1e-3) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }
  }

  /* ---------- Modes ---------- */

  setMode(mode, { overviewPose } = {}) {
    if (mode === 'overview') {
      this.mode = 'overview';
      this.fly = null;
      this.orbit.target.copy(overviewPose?.target || this.target);
      if (overviewPose) {
        this.camera.position.copy(overviewPose.position);
        this.orbit.minDistance = overviewPose.minDistance || 30;
        this.orbit.maxDistance = overviewPose.maxDistance || 400;
      }
      this.camera.fov = overviewPose?.fov || 45; this.camera.updateProjectionMatrix();
      this.orbit.enabled = true;
      this.orbit.update();
    } else {
      this.mode = 'seat';
      this.orbit.enabled = false;
      this.applySeat();
    }
    this.onChange();
  }

  // Flies from the current camera to the seat (overview to seat). Cuts under reduced motion.
  flyToSeat(spec) {
    this.setSeat(spec, { fly: true });
    if (this.mode !== 'flying') { this.mode = 'seat'; this.orbit.enabled = false; this.applySeat(); this.onFlyEnd(); }
  }

  /* ---------- Input ---------- */

  onDown(e) {
    if (this.mode !== 'seat') return;
    this.dom.focus?.({ preventScroll: true });
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { this.dom.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    this.dragging = true; this.vy = 0; this.vp = 0;
    if (this.pointers.size === 2) this.pinch = this.pinchDist();
  }

  pinchDist() { const [a, b] = [...this.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }

  onMove(e) {
    if (this.mode !== 'seat' || !this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId);
    const dx = e.clientX - prev.x; const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      const d = this.pinchDist();
      if (this.pinch > 0) this.setZoom(this.zoomTarget * (d / this.pinch));
      this.pinch = d;
      return;
    }
    // Scene follows the pointer: radians per pixel from the current vertical field of view.
    const k = THREE.MathUtils.degToRad(this.camera.fov) / Math.max(200, this.dom.clientHeight);
    const ay = dx * k; const ap = dy * k;
    this.turn(ay, ap);
    const now = performance.now(); const dt = Math.max(8, now - (this.lastMove || now - 16)) / 1000;
    this.lastMove = now;
    this.vy = ay / dt; this.vp = ap / dt;
  }

  onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = 0;
    if (!this.pointers.size) {
      this.dragging = false;
      if (performance.now() - this.lastMove > 80 || this.reduced()) { this.vy = 0; this.vp = 0; }
    }
  }

  onWheel(e) {
    if (this.mode !== 'seat') return;
    const next = clamp(this.zoomTarget * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
    // At a zoom limit, let the page scroll instead of trapping the wheel.
    if (next === this.zoomTarget) return;
    e.preventDefault();
    this.setZoom(next);
  }

  onKey(e) {
    if (this.mode !== 'seat') return;
    const step = 0.07;
    const map = {
      ArrowLeft: () => this.turn(step, 0), ArrowRight: () => this.turn(-step, 0),
      ArrowUp: () => this.turn(0, step), ArrowDown: () => this.turn(0, -step),
      '+': () => this.setZoom(this.zoomTarget * 1.25), '=': () => this.setZoom(this.zoomTarget * 1.25),
      '-': () => this.setZoom(this.zoomTarget / 1.25), _: () => this.setZoom(this.zoomTarget / 1.25),
      0: () => this.reset(), Home: () => this.reset(),
    };
    const fn = map[e.key];
    if (fn) { e.preventDefault(); fn(); }
  }

  // Positive ay turns the view to the left (scene moves right with the pointer).
  turn(ay, ap) {
    this.yaw = clamp(this.yaw + ay, -YAW_LIMIT, YAW_LIMIT);
    this.pitch = clamp(this.pitch + ap, PITCH_MIN, PITCH_MAX);
    this.applySeat();
    this.onChange();
  }

  setZoom(z) {
    this.zoomTarget = clamp(z, ZOOM_MIN, ZOOM_MAX);
    if (this.reduced()) { this.zoomLevel = this.zoomTarget; this.applySeat(); }
    this.onChange();
  }

  reset() {
    if (this.reduced()) { this.yaw = 0; this.pitch = 0; this.zoomTarget = this.zoomLevel = 1; this.applySeat(); this.onChange(); return; }
    this.resetAnim = { t: 0, y0: this.yaw, p0: this.pitch, z0: this.zoomLevel };
    this.vy = 0; this.vp = 0;
  }

  /* ---------- Per frame ---------- */

  // Returns true when the camera moved this frame.
  update(dt) {
    let moved = false;
    if (this.mode === 'flying' && this.fly) {
      const F = this.fly;
      F.t = Math.min(1, F.t + dt / F.dur);
      const e = ease(F.t);
      const p = F.p0.clone().lerp(F.p1, e);
      p.y += Math.sin(Math.PI * e) * F.p0.distanceTo(F.p1) * 0.12;
      this.camera.position.copy(p);
      this.camera.quaternion.copy(F.q0).slerp(F.q1, e);
      const f1 = this.fovFor(this.zoomLevel);
      this.camera.fov = F.f0 + (f1 - F.f0) * e; this.camera.updateProjectionMatrix();
      if (F.t >= 1) { this.fly = null; this.mode = 'seat'; this.applySeat(); this.onFlyEnd(); }
      this.onChange();
      return true;
    }
    if (this.mode === 'overview') return this.orbit.update();
    if (this.resetAnim) {
      const R = this.resetAnim; R.t = Math.min(1, R.t + dt / 0.6); const e = ease(R.t);
      this.yaw = R.y0 * (1 - e); this.pitch = R.p0 * (1 - e); this.zoomLevel = this.zoomTarget = R.z0 + (1 - R.z0) * e;
      if (R.t >= 1) { this.resetAnim = null; this.zoomTarget = this.zoomLevel = 1; }
      this.applySeat(); this.onChange();
      return true;
    }
    if (!this.dragging && (Math.abs(this.vy) > 1e-4 || Math.abs(this.vp) > 1e-4)) {
      this.turn(this.vy * dt, this.vp * dt);
      const decay = Math.exp(-dt * 5.5);
      this.vy *= decay; this.vp *= decay;
      if (this.yaw <= -YAW_LIMIT || this.yaw >= YAW_LIMIT) this.vy = 0;
      moved = true;
    }
    if (Math.abs(this.zoomLevel - this.zoomTarget) > 1e-3) {
      this.zoomLevel += (this.zoomTarget - this.zoomLevel) * Math.min(1, dt * 9);
      this.applySeat(); this.onChange();
      moved = true;
    }
    return moved;
  }

  // Plan heading of the view (radians, atan2(z, x)) and horizontal field of view (radians).
  heading() {
    const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    const h = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect);
    return { angle: Math.atan2(d.z, d.x), hfov: h, pitch: Math.asin(clamp(d.y, -1, 1)), zoom: this.zoomLevel, x: this.camera.position.x, z: this.camera.position.z };
  }

  dispose() {
    const d = this.dom;
    d.removeEventListener('pointerdown', this._down); d.removeEventListener('pointermove', this._move);
    d.removeEventListener('pointerup', this._up); d.removeEventListener('pointercancel', this._up);
    d.removeEventListener('pointerleave', this._up); d.removeEventListener('wheel', this._wheel);
    d.removeEventListener('keydown', this._key); d.removeEventListener('dblclick', this._dbl);
    this.orbit.dispose();
  }
}
