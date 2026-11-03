// Bowl construction kit shared by every archetype that has a seating bowl.
//
// sweep():      sweeps a 2D profile [(d, y), ...] round a Ring to make one mesh
//               (tiers, fascias, roofs, glass, soffits, light strips).
// buildTier():  a stepped tier with aisles, half-steps, vomitories, seat slots and a
//               distant-seat "band" (one textured card per row segment).
// SeatField:    near seats as real instanced seats, far seats as the band, switched
//               around the viewer so close seats look solid and far ones cost nothing.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rowY, rowD, tierBackD, tierSlots } from './layouts.js';
import { CHAIRS } from '../data/seatmaps.js';
import { rng } from './textures.js';

/* ---------- Sweep ---------- */

// profile: [[d, y], ...]; shade: number or array per segment (vertex colour multiplier);
// color: base THREE.Color or [r,g,b]; uScale/vScale: metres per texture repeat.
// skip(segIndex) can drop segments. Returns a BufferGeometry with position, normal, uv, color.
// uRepeats: when set, u runs 0..uRepeats over the sample list (so lines of constant u
// follow the ring's radial lines, as dome ribs do) instead of following arc length.
export function sweep(ring, profile, { samples, shade = 1, color = [1, 1, 1], uScale = 4, vScale = 4, skip, flip = false, uFlip = false, uRepeats = 0 } = {}) {
  const us = uFlip ? -uScale : uScale; // uFlip makes text read left to right from inside the bowl
  const S = samples || ring.samples();
  const pos = []; const uv = []; const col = []; const idx = [];
  let vbase = 0;
  let vacc = 0;
  for (let j = 0; j < profile.length - 1; j++) {
    const [d0, y0] = profile[j]; const [d1, y1] = profile[j + 1];
    const segLen = Math.hypot(d1 - d0, y1 - y0);
    if (skip && skip(j)) { vacc += segLen; continue; }
    const sh = Array.isArray(shade) ? shade[j] ?? 1 : shade;
    const c = Array.isArray(color[0]) ? color[j] : color;
    for (let k = 0; k < S.length; k++) {
      const { i, f } = S[k];
      const p0 = ring.point(i, f, d0); const p1 = ring.point(i, f, d1);
      pos.push(p0.x, y0, p0.z, p1.x, y1, p1.z);
      if (uRepeats) { const u = (k / (S.length - 1)) * uRepeats; uv.push(u, vacc / vScale, u, (vacc + segLen) / vScale); }
      else uv.push(ring.sOf(i, f, d0) / us, vacc / vScale, ring.sOf(i, f, d1) / us, (vacc + segLen) / vScale);
      col.push(c[0] * sh, c[1] * sh, c[2] * sh, c[0] * sh, c[1] * sh, c[2] * sh);
      if (k < S.length - 1) {
        const a = vbase + k * 2; const b = a + 1; const cc = a + 2; const dd = a + 3;
        if (flip) idx.push(a, cc, b, b, cc, dd); else idx.push(a, b, cc, b, dd, cc);
      }
    }
    vbase += S.length * 2;
    vacc += segLen;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A sweep restricted to an arc range [sA, sB] (arc length at offset dRef).
export function sweepArc(ring, profile, sA, sB, dRef, opts = {}) {
  return sweep(ring, profile, { ...opts, samples: arcSamples(ring, sA, sB, dRef, opts.step || 2) });
}

// Samples [{ i, f }] from arc length sA to sB at offset dRef (sB may run past the ring
// length, it wraps), roughly every `step` metres. Ring corners get extra samples.
export function arcSamples(ring, sA, sB, dRef = 0, step = 1.5) {
  const out = [];
  const n = Math.max(2, Math.ceil((sB - sA) / step));
  for (let k = 0; k <= n; k++) out.push(ring.locate(sA + (sB - sA) * (k / n), dRef));
  return out;
}

// A flat end wall closing a tier where an arc-limited sweep stops: the profile polygon
// [(d, y), ...] standing on the radial line through ring position (i, f).
export function endCap(ring, i, f, profile, baseY = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], baseY);
  profile.forEach(([d, y]) => shape.lineTo(d, y));
  shape.lineTo(profile[profile.length - 1][0], baseY);
  const g = new THREE.ShapeGeometry(shape);
  const p = ring.point(i, f, 0);
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const d = pos.getX(k); const y = pos.getY(k);
    pos.setXYZ(k, p.x + p.nx * d, y, p.z + p.nz * d);
  }
  g.computeVertexNormals();
  return g;
}

// Distant-seat band cards for seats that are not on a ring tier (a flat floor, a
// straight terrace). runs: arrays of slots in order along their row.
export function bandFromRuns(runs) {
  const band = { pos: [], uv: [], col: [], idx: [] };
  runs.forEach((run) => {
    if (run.length < 1) return;
    const vb = band.pos.length / 3;
    run.forEach((s, k) => {
      const tx = -s.nz; const tz = s.nx; // along the row
      const half = (s.w || 0.5) / 2;
      // Each seat gets its own card: front of the pan to the top of the back.
      const pts = [[-half, -0.2, 0.42], [-half, 0.2, 0.92], [half, -0.2, 0.42], [half, 0.2, 0.92]];
      pts.forEach(([a, b, y]) => {
        band.pos.push(s.x + tx * a - s.nx * -b, s.y + y, s.z + tz * a - s.nz * -b);
      });
      band.uv.push(0, 0, 0, 1, 1, 0, 1, 1);
      for (let q = 0; q < 4; q++) band.col.push(...s.color);
      const a0 = vb + k * 4;
      band.idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(band.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(band.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(band.col, 3));
  g.setIndex(band.idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- Tier ---------- */

// Builds the concrete of one tier plus its seat slots and distant-seat band.
// opts: {
//   radials       aisle radial lines ({ i, f } list, or a function of the row index); pass
//                 layouts.tierBuildOpts(L, tierId) so the seats match the seat map exactly
//   frontBase     y of the bottom of the front wall (default 0)
//   backWall      height of the wall behind the last row
//   vom           { every: n (aisles), rows: [r0, r1], straightOnly: true } or null
//   seatColor(slot) -> [r,g,b]   padded(slot) -> bool   arms(slot) -> bool
//   seed
// }
export function buildTier(ring, t, opts = {}) {
  const R = rng(opts.seed || 3);
  const frontBase = opts.frontBase ?? 0;
  const N = t.rows;

  // Profile: front wall, then tread and riser per row, then the back wall.
  const prof = [[t.d0, frontBase], [t.d0, rowY(t, 0)]];
  const shades = [0.55];
  for (let i = 0; i < N; i++) {
    prof.push([rowD(t, i + 1), rowY(t, i)]); shades.push(1.0);
    if (i < N - 1) { prof.push([rowD(t, i + 1), rowY(t, i + 1)]); shades.push(0.66); }
  }
  if (opts.backWall) { prof.push([tierBackD(t), rowY(t, N - 1) + opts.backWall]); shades.push(0.5); }
  const concrete = sweep(ring, prof, { samples: opts.samples, shade: shades, color: opts.concreteColor || [0.74, 0.74, 0.72], uScale: 3, vScale: 3 });
  // Seats, aisle half-steps and vomitories come from layouts.tierSlots(), the same function
  // the seat map uses, so a seat picked on the map is a seat in this bowl. opts.allow(point)
  // limits them to part of the ring (pair it with opts.samples so the concrete stops there).
  const gen = tierSlots(ring, t, { radials: opts.radials, vom: opts.vom, allow: opts.allow });
  const { slots, steps } = gen;
  const voms = gen.voms;
  const band = { pos: [], uv: [], col: [], idx: [] };
  const tints = []; for (let i = 0; i < N; i++) tints.push(0.94 + R() * 0.1);
  slots.forEach((slot) => {
    slot.padded = opts.padded ? !!opts.padded(slot) : false;
    slot.arms = opts.arms ? !!opts.arms(slot) : false;
    slot.color = (opts.seatColor ? opts.seatColor(slot) : [0.11, 0.15, 0.26]).map((v) => v * tints[slot.row]);
  });
  gen.pieces.forEach(({ p0, p1, w, first, dS, y }) => {
    // Band card for this run of seats: slanted from the front of the pan to the top of the back.
    const c = slots[first].color;
    const steps2 = Math.max(1, Math.ceil((p1 - p0) / 2.5));
    const vb = band.pos.length / 3;
    for (let k = 0; k <= steps2; k++) {
      const s = p0 + (p1 - p0) * (k / steps2);
      const pf = ring.at(s, dS - 0.2); const pb = ring.at(s, dS + 0.2);
      band.pos.push(pf.x, y + 0.42, pf.z, pb.x, y + 0.92, pb.z);
      const u = (s - p0) / w;
      band.uv.push(u, 0, u, 1);
      band.col.push(...c, ...c);
      if (k < steps2) { const a0 = vb + k * 2; band.idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
    }
  });

  const bandGeo = new THREE.BufferGeometry();
  bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(band.pos, 3));
  bandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(band.uv, 2));
  bandGeo.setAttribute('color', new THREE.Float32BufferAttribute(band.col, 3));
  bandGeo.setIndex(band.idx);
  bandGeo.computeVertexNormals();

  // Vomitory blocks: a concrete box with a dark tunnel mouth facing the action.
  const vomBlocks = [];
  if (opts.vom) {
    const [r0, r1] = opts.vom.rows;
    const dA = rowD(t, r0); const dB = rowD(t, r1 + 1);
    voms.forEach((r) => {
      const pm = ring.point(r.i, r.f, (dA + dB) / 2);
      vomBlocks.push({ x: pm.x, z: pm.z, nx: pm.nx, nz: pm.nz, y0: rowY(t, r0) - 0.02, y1: rowY(t, r1 + 1), depth: dB - dA, width: 2.4 });
    });
  }

  return { concrete, bandGeo, slots, steps, vomBlocks };
}

/* ---------- Instanced helpers ---------- */

const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _s = new THREE.Vector3(); const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// Yaw so that local +z faces the direction (fx, fz).
export const yawFacing = (fx, fz) => Math.atan2(fx, fz);

export function instanced(geo, mat, items, place) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  items.forEach((it, k) => { place(it, _p, _q, _s); _m.compose(_p, _q, _s); mesh.setMatrixAt(k, _m); });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function stepsMesh(steps, material) {
  const geo = new THREE.BoxGeometry(1.1, 1, 1);
  geo.translate(0, 0.5, 0);
  return instanced(geo, material, steps, (s, p, q, sc) => {
    p.set(s.x, s.y0, s.z); q.setFromAxisAngle(_up, yawFacing(-s.nx, -s.nz)); sc.set(1, Math.max(0.05, s.y1 - s.y0), s.d);
  });
}

export function vomMeshes(blocks, concreteMat, darkMat) {
  const group = new THREE.Group();
  if (!blocks.length) return group;
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const walls = instanced(box, concreteMat, blocks.flatMap((b) => [{ ...b, side: -1 }, { ...b, side: 1 }]), (b, p, q, sc) => {
    const tx = b.nz; const tz = -b.nx; // tangent
    p.set(b.x + tx * b.side * (b.width / 2 + 0.12), b.y0, b.z + tz * b.side * (b.width / 2 + 0.12));
    q.setFromAxisAngle(_up, yawFacing(-b.nx, -b.nz)); sc.set(0.24, b.y1 - b.y0 + 0.95, b.depth);
  });
  walls.castShadow = true; walls.receiveShadow = true;
  const lid = instanced(box, concreteMat, blocks, (b, p, q, sc) => {
    p.set(b.x, b.y1 - 0.25, b.z); q.setFromAxisAngle(_up, yawFacing(-b.nx, -b.nz)); sc.set(b.width + 0.48, 0.25, b.depth);
  });
  lid.receiveShadow = true;
  const mouth = new THREE.PlaneGeometry(1, 1); mouth.translate(0, 0.5, 0);
  const holes = instanced(mouth, darkMat, blocks, (b, p, q, sc) => {
    p.set(b.x - b.nx * (b.depth / 2 - 0.02), b.y0, b.z - b.nz * (b.depth / 2 - 0.02));
    q.setFromAxisAngle(_up, yawFacing(-b.nx, -b.nz)); sc.set(b.width, b.y1 - b.y0 - 0.25, 1);
  });
  // A floor inside the tunnel mouth so high viewers see a dark slot, not treads.
  const floor = new THREE.PlaneGeometry(1, 1); floor.rotateX(-Math.PI / 2);
  const floors = instanced(floor, darkMat, blocks, (b, p, q, sc) => {
    p.set(b.x, b.y0 + 0.01, b.z); q.setFromAxisAngle(_up, yawFacing(-b.nx, -b.nz)); sc.set(b.width, 1, b.depth);
  });
  group.add(walls, lid, holes, floors);
  return group;
}

/* ---------- Seat field: near instanced seats + far band ---------- */

// True-scale chairs (sizes in js/data/seatmaps.js CHAIRS, modelled): a tip-up seat with a
// backrest, or a padded one; armrests only where the venue states them. Local +z faces the
// action; the back of the backrest is at z = -depth / 2 + 0.03.
function seatGeometry(padded, arms) {
  const C = padded ? CHAIRS.padded : CHAIRS.standard; const W = C.width;
  const parts = [];
  if (padded) {
    const pan = new RoundedBoxGeometry(W, 0.11, 0.44, 1, 0.04); pan.translate(0, C.panY - 0.05, 0.02);
    const back = new RoundedBoxGeometry(W, C.backTop - C.panY, 0.11, 1, 0.04); back.rotateX(-0.16); back.translate(0, (C.panY + C.backTop) / 2, -0.18);
    parts.push(pan, back);
  } else {
    const pan = new RoundedBoxGeometry(W, 0.07, 0.4, 1, 0.025); pan.translate(0, C.panY - 0.03, 0.03);
    const back = new RoundedBoxGeometry(W, C.backTop - C.panY, 0.06, 1, 0.025); back.rotateX(-0.2); back.translate(0, (C.panY + C.backTop) / 2, -0.15);
    parts.push(pan, back);
  }
  if (arms) {
    const a = CHAIRS.armW;
    const armL = new RoundedBoxGeometry(a, 0.05, 0.38, 1, 0.02); armL.translate(-(W / 2 + a / 2 - 0.005), C.panY + 0.2, 0);
    const postL = new THREE.BoxGeometry(a * 0.7, 0.2, 0.05); postL.translate(-(W / 2 + a / 2 - 0.005), C.panY + 0.1, -0.12);
    const armR = armL.clone(); armR.translate(W + a - 0.01, 0, 0);
    const postR = postL.clone(); postR.translate(W + a - 0.01, 0, 0);
    parts.push(armL, armR, postL, postR);
  }
  const stem = new THREE.BoxGeometry(0.06, C.panY - 0.04, 0.06); stem.translate(0, (C.panY - 0.04) / 2, -0.05);
  parts.push(stem);
  // RoundedBoxGeometry is non-indexed; make everything non-indexed before merging.
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { p.deleteAttribute('uv'); return p; }));
}

export class SeatField {
  constructor({ slots, bandGeo, bandTexture, nearCapacity = 3500 }) {
    this.slots = slots;
    this.group = new THREE.Group();
    this.near = new THREE.Vector4(0, -9999, 0, 0);
    this.near2 = new THREE.Vector4(0, -9999, 0, 0); // a second viewer (compare mode)

    this.bandMat = new THREE.MeshStandardMaterial({ map: bandTexture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05 });
    const nearU = { value: this.near }; const near2U = { value: this.near2 };
    this.bandMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNear = nearU; sh.uniforms.uNear2 = near2U;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vNearW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNearW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vNearW;\nuniform vec4 uNear; uniform vec4 uNear2;')
        .replace('void main() {', 'void main() {\n if (distance(vNearW, uNear.xyz) < uNear.w || distance(vNearW, uNear2.xyz) < uNear2.w) discard;');
    };
    this.bandMat.customProgramCacheKey = () => 'seat-band';
    this.band = new THREE.Mesh(bandGeo, this.bandMat);
    this.band.receiveShadow = true;
    this.group.add(this.band);

    this.cap = nearCapacity;
    const mk = (padded, arms) => {
      const mat = new THREE.MeshStandardMaterial({ roughness: padded ? 0.75 : 0.45, metalness: 0.0 });
      const mesh = new THREE.InstancedMesh(seatGeometry(padded, arms), mat, nearCapacity);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nearCapacity * 3), 3);
      mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    // Four chair kinds: standard and padded, each with or without armrests.
    this.meshes = [mk(false, false), mk(true, false), mk(false, true), mk(true, true)];
    [this.std, this.pad] = this.meshes;
  }

  // Shows real seats within radius R of the viewer, the band elsewhere.
  // pos2 (optional): a second viewer, for the split-screen compare.
  setViewer(pos, R = 22, pos2 = null) {
    this.near.set(pos.x, pos.y, pos.z, R);
    if (pos2) this.near2.set(pos2.x, pos2.y, pos2.z, R); else this.near2.set(0, -9999, 0, 0);
    const counts = [0, 0, 0, 0];
    const col = new THREE.Color();
    const R2 = R * R;
    const within = (s, p) => { const dx = s.x - p.x; const dy = (s.y + 0.6) - p.y; const dz = s.z - p.z; return dx * dx + dy * dy + dz * dz < R2; };
    for (const s of this.slots) {
      if (!within(s, pos) && !(pos2 && within(s, pos2))) continue;
      const kind = (s.padded ? 1 : 0) + (s.arms ? 2 : 0);
      const mesh = this.meshes[kind]; const k = counts[kind];
      if (k >= this.cap) continue;
      _p.set(s.x, s.y, s.z); _q.setFromAxisAngle(_up, yawFacing(-s.nx, -s.nz)); _s.set(1, 1, 1);
      _m.compose(_p, _q, _s); mesh.setMatrixAt(k, _m);
      col.setRGB(...(s.padded ? [s.color[0] * 0.9, s.color[1] * 0.9, s.color[2] * 0.9] : s.color));
      mesh.setColorAt(k, col);
      counts[kind]++;
    }
    this.meshes.forEach((m, j) => { m.count = counts[j]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  }

  dispose() {
    this.band.geometry.dispose(); this.bandMat.dispose();
    this.meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); m.dispose?.(); });
  }
}

// Box and suite partitions near the viewer are hidden, because the seat's own room
// (js/viewer/foreground.js) supplies its walls; a venue partition could otherwise cut
// through the middle of your box.
export function hidePartitions(mesh, items, y, pos, R = 4.6) {
  if (!mesh) return;
  items.forEach((p, k) => {
    const near = pos && (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 < R * R && Math.abs(pos.y - y) < 4;
    _p.set(p.x, y, p.z); _q.setFromAxisAngle(_up, yawFacing(-p.nx, -p.nz)); _s.setScalar(near ? 0 : 1);
    _m.compose(_p, _q, _s); mesh.setMatrixAt(k, _m);
  });
  mesh.instanceMatrix.needsUpdate = true;
}