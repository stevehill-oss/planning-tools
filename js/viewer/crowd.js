// Crowd: tens of thousands of simple, believable figures as InstancedMeshes.
//
// Each figure is one merged geometry with a per-vertex "part" (clothing, skin, hair,
// trousers, arms). Per-instance attributes carry clothing, skin and hair colours and
// a params vec4 (phase, angle round the bowl, keep threshold, arms-up tendency).
// All motion (idle sway, concert bounce, arms up, the Mexican wave, density) happens in
// the vertex shader via onBeforeCompile, so the CPU never touches matrices per frame.
//
// Two levels of detail: figures within the near radius of the viewer use the detailed
// body, the rest a very light one. setViewer() re-partitions when the seat changes and
// also hides anybody standing where the viewer is.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './textures.js';

const PART = { CLOTH: 0, SKIN: 1, HAIR: 2, LEGS: 3, ARM: 4 };

function tag(geo, part) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  return g;
}

const T = (g, x, y, z) => { g.translate(x, y, z); return g; };

// Figure faces local +z. Standing: feet at y = 0. Seated: tread at y = 0, seat pan at 0.45.
function bodyGeometry({ seated, detail }) {
  const P = [];
  // Proportions tuned so a seated head centre sits at about 1.15 m above the tread and a
  // standing one at about 1.62 m, matching the camera eye heights in layouts.js.
  const hip = seated ? 0.45 : 0.9;
  const shoulder = hip + (seated ? 0.5 : 0.52);
  const headY = shoulder + 0.21;
  if (detail) {
    // Torso: tapered and flattened front to back, a little wider at the chest.
    const torso = new THREE.CylinderGeometry(0.185, 0.155, shoulder - hip, 8, 1, false); torso.scale(1, 1, 0.62);
    P.push(tag(T(torso, 0, (hip + shoulder) / 2, 0), PART.CLOTH));
    const sh = new THREE.SphereGeometry(0.195, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2); sh.scale(1.08, 0.42, 0.64);
    P.push(tag(T(sh, 0, shoulder - 0.02, 0), PART.CLOTH));
    const neck = new THREE.CylinderGeometry(0.05, 0.055, 0.12, 6, 1, false); P.push(tag(T(neck, 0, shoulder + 0.05, 0), PART.SKIN));
    const head = new THREE.SphereGeometry(0.1, 10, 7); head.scale(0.9, 1.12, 1.0);
    P.push(tag(T(head, 0, headY, 0.01), PART.SKIN));
    const hair = new THREE.SphereGeometry(0.107, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.52); hair.scale(0.93, 1.1, 1.04);
    hair.rotateX(-0.35);
    P.push(tag(T(hair, 0, headY + 0.012, -0.012), PART.HAIR));
    // Arms hang from the shoulders (part ARM so the shader can raise them).
    [-1, 1].forEach((s) => {
      const arm = new THREE.CylinderGeometry(0.05, 0.043, 0.52, 5, 1, true); arm.rotateZ(s * -0.08);
      P.push(tag(T(arm, s * 0.225, shoulder - 0.28, seated ? 0.06 : 0), PART.ARM));
      const hand = new THREE.IcosahedronGeometry(0.045, 0); P.push(tag(T(hand, s * 0.245, shoulder - 0.56, seated ? 0.08 : 0), PART.ARM));
    });
    if (seated) {
      [-1, 1].forEach((s) => {
        const thigh = new THREE.BoxGeometry(0.15, 0.14, 0.42); P.push(tag(T(thigh, s * 0.1, hip, 0.18), PART.LEGS));
        const shin = new THREE.BoxGeometry(0.12, 0.45, 0.12); P.push(tag(T(shin, s * 0.1, 0.22, 0.38), PART.LEGS));
      });
    } else {
      [-1, 1].forEach((s) => {
        const leg = new THREE.CylinderGeometry(0.08, 0.06, hip, 6); P.push(tag(T(leg, s * 0.1, hip / 2, 0), PART.LEGS));
      });
    }
  } else {
    // Far body: still a humanoid (head, neck, tapered torso, shoulders, arms, legs), in very
    // few triangles, so mid-distance crowds read as people rather than blocks.
    const torso = new THREE.CylinderGeometry(0.19, 0.15, shoulder - hip + 0.04, 6, 1, false); torso.scale(1, 1, 0.6);
    P.push(tag(T(torso, 0, (hip + shoulder) / 2, 0), PART.CLOTH));
    const sh = new THREE.CylinderGeometry(0.205, 0.19, 0.08, 6, 1, false); sh.scale(1, 1, 0.62); P.push(tag(T(sh, 0, shoulder - 0.02, 0), PART.CLOTH));
    const head = new THREE.SphereGeometry(0.105, 6, 4); head.scale(0.92, 1.12, 1); P.push(tag(T(head, 0, headY, 0.01), PART.SKIN));
    const hair = new THREE.SphereGeometry(0.11, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.5); hair.scale(0.94, 1.05, 1.02); P.push(tag(T(hair, 0, headY + 0.012, -0.012), PART.HAIR));
    [-1, 1].forEach((s) => {
      const arm = new THREE.BoxGeometry(0.075, 0.5, 0.085); P.push(tag(T(arm, s * 0.225, shoulder - 0.27, seated ? 0.05 : 0), PART.ARM));
    });
    if (!seated) {
      [-1, 1].forEach((s) => { const leg = new THREE.BoxGeometry(0.12, hip, 0.13); P.push(tag(T(leg, s * 0.09, hip / 2, 0), PART.LEGS)); });
    } else {
      const lap = new THREE.BoxGeometry(0.32, 0.13, 0.4); P.push(tag(T(lap, 0, hip, 0.17), PART.LEGS));
      const shins = new THREE.BoxGeometry(0.28, 0.42, 0.11); P.push(tag(T(shins, 0, 0.22, 0.37), PART.LEGS));
    }
  }
  const g = mergeGeometries(P);
  g.userData = { shoulder, hip };
  return g;
}

/* ---------- Palettes ---------- */

const SKIN = ['#f1c7a6', '#e0ac8a', '#c98e69', '#a8714f', '#7d5038', '#5a3826', '#ecc2a0', '#d39d7a'];
const HAIR = ['#1b1512', '#2c1f17', '#3d2a1c', '#5a3e28', '#8b6a44', '#b89466', '#6e6e6e', '#c9c4bc', '#1a1a1a'];
export const PALETTES = {
  // Everyday mixed clothing: the default for any crowd that names no palette.
  neutral: ['#121418', '#1f2633', '#2a2f3a', '#3a3f4a', '#5c6670', '#c9ccd1', '#e9e4da', '#4a3b2f', '#6b5b4a', '#2d3e55', '#7a2f2f', '#2f5a4a', '#8a8f96'],
  // Home and away colours: Tottenham Hotspur Stadium's football mode only.
  football: ['#f4f4f2', '#0f1d3a', '#1a2a55', '#f4f4f2', '#0f1d3a', '#2a2f3a', '#3a3f4a', '#8a1c25', '#5c6670', '#c9ccd1', '#1f3d6b', '#121418', '#6b5b4a'],
  away: ['#b5202f', '#f4f4f2', '#8a1c25', '#b5202f', '#121418', '#2a2f3a'],
  concert: ['#121418', '#1c1f26', '#2a2f3a', '#0f1d3a', '#3a3f4a', '#5c6670', '#f4f4f2', '#8a1c25', '#2d6fe0', '#c79a55', '#6b5b4a', '#262626', '#7a2f5a'],
  smart: ['#121418', '#1f2633', '#2a2f3a', '#0f1d3a', '#3a3f4a', '#e9e4da', '#5c6670', '#4a3b2f', '#7a2f2f', '#2d3e55'],
  // Race day: dark and grey suits, with dresses in summer colours.
  raceday: ['#1f2633', '#2a2f3a', '#121418', '#3a4556', '#5c6670', '#1f2633', '#e9e4da', '#c84a5a', '#e7a4b8', '#7fb3d5', '#e8c95a', '#5aa37a', '#f4f1ea', '#9b6fb5', '#d9774a'],
  black: ['#0d0e10', '#141517', '#101114'],
};

const hex = (h) => new THREE.Color(h);

/* ---------- Crowd ---------- */

export class Crowd {
  // opts: { lowPower, forceNear }
  constructor({ lowPower = false, forceNear = false } = {}) {
    this.lowPower = lowPower;
    this.forceNear = forceNear; // small groups (players, guests): always the detailed body
    this.items = [];
    this.group = new THREE.Group();
    this.group.name = 'crowd';
    this.uniforms = {
      uTime: { value: 0 }, uDensity: { value: 1 }, uWave: { value: -10 }, uWaveOn: { value: 0 },
      uIdle: { value: 1 }, uBounce: { value: 0 }, uBeat: { value: 2.2 },
    };
    this.waveStart = -1;
  }

  // item: { x, y, z, yaw, seated, angle, palette, cloth (hex, optional), armsUp (0..1), phone (bool), keep (0..1 optional) }
  add(item) { this.items.push(item); }

  material(seated, shoulder) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.0 });
    const U = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uShoulder: { value: shoulder }, uSeated: { value: seated ? 1 : 0 } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aPart;
attribute vec3 iCloth; attribute vec3 iSkin; attribute vec3 iHair; attribute vec4 iP;
uniform float uTime, uDensity, uWave, uWaveOn, uIdle, uBounce, uBeat, uShoulder, uSeated;
varying vec3 vPC;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float keep = step(iP.z, uDensity);
float wv = 0.0;
if (uWaveOn > 0.5) { float da = atan(sin(iP.y - uWave), cos(iP.y - uWave)); wv = exp(-da * da / 0.03); }
float arms = max(wv, iP.w * (0.55 + 0.45 * sin(uTime * uBeat + iP.x * 6.2832)));
if (aPart > 3.5) {
  float th = arms * 3.0;
  float ly = transformed.y - uShoulder; float lz = transformed.z;
  transformed.y = uShoulder + ly * cos(th) + lz * sin(th);
  transformed.z = -ly * sin(th) + lz * cos(th);
  transformed.x *= mix(1.0, 0.8, arms);
}
float upper = step(uSeated * 0.5 + 0.2, transformed.y);
transformed.y += wv * 0.55 * uSeated * upper;
transformed.y += uIdle * upper * sin(uTime * 1.6 + iP.x * 6.2832) * 0.012;
transformed.x += uIdle * sin(uTime * 0.8 + iP.x * 12.0) * 0.03 * (transformed.y / 1.7);
// Idle head turns: now and then a figure looks to one side (the head and hair only).
if (aPart > 0.5 && aPart < 2.5 && transformed.y > uShoulder + 0.06) {
  float look = uIdle * 0.45 * smoothstep(0.6, 1.0, sin(uTime * 0.21 + iP.x * 40.0));
  float cs = cos(look); float sn = sin(look);
  vec2 hz = vec2(transformed.x, transformed.z);
  transformed.x = hz.x * cs - hz.y * sn; transformed.z = hz.x * sn + hz.y * cs;
}
transformed.y += uBounce * (1.0 - uSeated) * abs(sin(uTime * uBeat * 0.5 + iP.x * 3.14)) * 0.07;
transformed *= keep;
vec3 trousers = iCloth * 0.22 + vec3(0.035, 0.04, 0.05);
vPC = aPart < 0.5 ? iCloth : aPart < 1.5 ? iSkin : aPart < 2.5 ? iHair : aPart < 3.5 ? trousers : iCloth * 0.92;
if (aPart > 3.5 && position.y < uShoulder - 0.52) vPC = iSkin;
// Raised bodies catch the light, so the wave reads even from the far side of a bowl.
vPC = mix(vPC, vPC * 1.5 + 0.1, wv * 0.7);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPC;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPC;');
    };
    mat.customProgramCacheKey = () => `crowd-${seated ? 's' : 't'}`;
    return mat;
  }

  // Builds the meshes. Call once after all add() calls.
  finalize() {
    const R = rng(21);
    const N = this.items.length;
    this.N = N;
    this.mat = new Float32Array(N * 16);
    this.cloth = new Float32Array(N * 3); this.skin = new Float32Array(N * 3); this.hair = new Float32Array(N * 3); this.params = new Float32Array(N * 4);
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);
    const palCache = {};
    this.items.forEach((it, k) => {
      const pk = PALETTES[it.palette] ? it.palette : 'neutral';
      const pal = palCache[pk] || (palCache[pk] = PALETTES[pk].map(hex));
      const h = 0.9 + R() * 0.2;
      const wdt = 0.9 + R() * 0.2;
      p.set(it.x, it.y, it.z); q.setFromAxisAngle(up, it.yaw + (R() - 0.5) * 0.35); s.set(wdt, h, wdt);
      m.compose(p, q, s); m.toArray(this.mat, k * 16);
      const c = it.cloth ? hex(it.cloth) : pal[Math.floor(R() * pal.length)]; const v = it.cloth ? 1 : 0.85 + R() * 0.3;
      this.cloth.set([c.r * v, c.g * v, c.b * v], k * 3);
      const sk = hex(SKIN[Math.floor(R() * SKIN.length)]); this.skin.set([sk.r, sk.g, sk.b], k * 3);
      const hr = hex(HAIR[Math.floor(R() * HAIR.length)]); this.hair.set([hr.r, hr.g, hr.b], k * 3);
      this.params.set([R(), it.angle ?? Math.atan2(it.z, it.x), it.keep ?? R(), it.armsUp ?? 0], k * 4);
    });

    // Four meshes: seated/standing x near/far. Near meshes are capped.
    this.meshes = {};
    const nearCap = this.lowPower ? 600 : 1800;
    ['s', 't'].forEach((posture) => {
      const seated = posture === 's';
      const total = this.items.filter((it) => !!it.seated === seated).length;
      if (!total) return;
      ['n', 'f'].forEach((lod) => {
        const geo = bodyGeometry({ seated, detail: lod === 'n' });
        const cap = lod === 'n' ? (this.forceNear ? total : Math.min(nearCap, total)) : total;
        const mesh = new THREE.InstancedMesh(geo, this.material(seated, geo.userData.shoulder), cap);
        mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true;
        mesh.userData.cap = cap;
        mesh.userData.attrs = {
          iCloth: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3),
          iSkin: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3),
          iHair: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3),
          iP: new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4),
        };
        Object.entries(mesh.userData.attrs).forEach(([k, a]) => geo.setAttribute(k, a));
        this.meshes[posture + lod] = mesh;
        this.group.add(mesh);
      });
    });

    // Raised phone screens (standing crowds only).
    const phoners = this.items.map((it, k) => (it.phone ? k : -1)).filter((k) => k >= 0);
    if (phoners.length) {
      const pg = new THREE.PlaneGeometry(0.075, 0.14);
      const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.9), toneMapped: true });
      const phones = new THREE.InstancedMesh(pg, pm, phoners.length);
      phones.frustumCulled = false;
      this.phoneIdx = phoners;
      this.phones = phones;
      this.group.add(phones);
    }
    this.partition(null);
  }

  // Splits instances into near and far around pos, and hides anyone within the viewer's space.
  partition(pos, nearR = 16, clearR = 0.55, pos2 = null) {
    const counts = {};
    Object.keys(this.meshes).forEach((k) => { counts[k] = 0; });
    const R2 = nearR * nearR; const C2 = clearR * clearR;
    const views = [pos, pos2].filter(Boolean);
    for (let k = 0; k < this.N; k++) {
      const it = this.items[k];
      let lod = this.forceNear ? 'n' : 'f'; let calmArms = false; let mine = false;
      if (!this.forceNear) for (const v of views) {
        const dx = it.x - v.x; const dz = it.z - v.z; const dy = it.y + 1 - v.y;
        const dh = dx * dx + dz * dz;
        if (dh < C2 && Math.abs(dy) < 1.6) { mine = true; break; } // the viewer's own spot
        if (dh + dy * dy < R2) lod = 'n';
        if (dh < 6.25) calmArms = true; // no raised arm right across your face
      }
      if (mine) continue;
      // lane { x, z, len } (standing viewers only): people step aside in a narrow wedge in
      // front of the viewer, so a standing view sees between shoulders instead of a back.
      if (this.lane && !this.forceNear) {
        const L = this.lane; const v = views[0];
        const dx = it.x - v.x; const dz = it.z - v.z;
        const ahead = dx * L.x + dz * L.z; const side = Math.abs(dx * L.z - dz * L.x);
        if (ahead > 0 && ahead < L.len && side < 0.45 + ahead * 0.14 && Math.abs(it.y + 1 - v.y) < 2) continue;
      }
      // hideZone { x, z, r }: hidden while a viewer is inside that zone (the room the
      // viewer's own foreground rebuilds, such as their box or restaurant).
      const hz = it.hideZone;
      if (hz && views.some((v) => (v.x - hz.x) ** 2 + (v.z - hz.z) ** 2 < hz.r * hz.r && Math.abs(v.y - it.y - 1.2) < 2.5)) continue;
      let key = (it.seated ? 's' : 't') + lod;
      let mesh = this.meshes[key];
      if (counts[key] >= mesh.userData.cap) { key = key[0] + 'f'; mesh = this.meshes[key]; }
      const n = counts[key]++;
      mesh.instanceMatrix.array.set(this.mat.subarray(k * 16, k * 16 + 16), n * 16);
      const a = mesh.userData.attrs;
      a.iCloth.array.set(this.cloth.subarray(k * 3, k * 3 + 3), n * 3);
      a.iSkin.array.set(this.skin.subarray(k * 3, k * 3 + 3), n * 3);
      a.iHair.array.set(this.hair.subarray(k * 3, k * 3 + 3), n * 3);
      a.iP.array.set(this.params.subarray(k * 4, k * 4 + 4), n * 4);
      if (calmArms) a.iP.array[n * 4 + 3] = 0;
    }
    Object.entries(this.meshes).forEach(([key, mesh]) => {
      mesh.count = counts[key];
      mesh.instanceMatrix.needsUpdate = true;
      Object.values(mesh.userData.attrs).forEach((a) => { a.needsUpdate = true; });
    });
    if (this.phones) {
      // Phones held up just above head height; any right in front of the viewer's face are hidden.
      const m = new THREE.Matrix4(); const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      const q = new THREE.Quaternion(); const up = new THREE.Vector3(0, 1, 0); const one = new THREE.Vector3(1, 1, 1); const p = new THREE.Vector3();
      this.phoneIdx.forEach((k, n) => {
        const it = this.items[k];
        const near = views.some((v) => ((it.x - v.x) ** 2 + (it.z - v.z) ** 2) < 1.0);
        if (near) { this.phones.setMatrixAt(n, zero); return; }
        p.set(it.x + Math.sin(it.yaw) * 0.35, it.y + 1.95, it.z + Math.cos(it.yaw) * 0.35);
        m.compose(p, q.setFromAxisAngle(up, it.yaw + Math.PI), one);
        this.phones.setMatrixAt(n, m);
      });
      this.phones.instanceMatrix.needsUpdate = true;
    }
  }

  setViewer(pos, nearR, pos2 = null, clearR = 0.55, lane = null) { this.lane = lane; this.partition(pos, nearR ?? (this.lowPower ? 7 : 12), clearR, pos2); }

  setDensity(v) {
    this.uniforms.uDensity.value = v;
    if (this.phones) this.phones.visible = v > 0.2;
  }

  // Starts one lap of the wave.
  wave(now) { this.waveStart = now; this.uniforms.uWaveOn.value = 1; }

  // still: true freezes all motion (reduced motion or paused).
  update(t, { still = false, bounce = 0, beat = 2.2 } = {}) {
    const U = this.uniforms;
    U.uTime.value = still ? 0 : t;
    U.uIdle.value = still ? 0 : 1;
    U.uBounce.value = still ? 0 : bounce;
    U.uBeat.value = beat;
    if (this.waveStart >= 0) {
      const e = t - this.waveStart;
      const lap = 14;
      if (e > lap * 1.15 || still) { this.waveStart = -1; U.uWaveOn.value = 0; U.uWave.value = -10; }
      else U.uWave.value = -Math.PI + (e / lap) * Math.PI * 2.3;
    }
  }

  get waving() { return this.waveStart >= 0; }

  dispose() {
    Object.values(this.meshes || {}).forEach((m) => { m.geometry.dispose(); m.material.dispose(); m.dispose?.(); });
    if (this.phones) { this.phones.geometry.dispose(); this.phones.material.dispose(); }
  }
}

// Helper to fill a rectangle of floor with a standing crowd facing a point.
export function fillFloor(crowd, { x0, x1, z0, z1, spacing = 0.62, jitter = 0.3, face, y = 0, palette = 'concert', armsUp = 0.25, phones = 0.08, seed = 4, skip }) {
  const R = rng(seed);
  // Staggered rows plus jitter so a floor crowd never reads as a grid.
  let rowN = 0;
  for (let x = x0; x <= x1; x += spacing * 0.87, rowN++) {
    for (let z = z0 + (rowN % 2) * spacing * 0.5; z <= z1; z += spacing * (0.85 + R() * 0.3)) {
      const px = x + (R() - 0.5) * jitter * 2; const pz = z + (R() - 0.5) * jitter * 2;
      if (skip && skip(px, pz)) continue;
      const yaw = Math.atan2(face.x - px, face.z - pz);
      crowd.add({ x: px, y, z: pz, yaw, seated: false, palette, armsUp: R() < armsUp ? 0.6 + R() * 0.4 : 0, phone: R() < phones, angle: Math.atan2(pz, px) });
    }
  }
}
