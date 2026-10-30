// Racecourse archetype: an illustrative grandstand and home straight, not a model of
// any real course. Race day mode:
//   grandstand  a long stand with a terrace (the premier enclosure seats near the post),
//               a glass-fronted restaurant level, a level of private boxes with balconies,
//               a covered top tier and a cantilevered roof
//   course      turf track with white running rails curving away into the distance, the
//               winning post, an infield big screen, a parade ring by the stand, tree
//               lines and gentle hills under a big sky
//   jumps       ctx.racing === 'jumps' adds birch fences on the straight
//   race        play('race') sends a field of ten horses and jockeys in silks past the
//               post with a simple procedural gallop; reduced motion shows a still field
// Module contract: see the header of stadium.js. Extra: play(name, t, still).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUTS, rowY, seatD, tierBackD, standAt } from '../layouts.js';
import { sweep, buildTier, stepsMesh, SeatField, instanced, yawFacing, hidePartitions, endCap } from '../bowl.js';
import { Crowd, fillFloor } from '../crowd.js';
import * as TX from '../textures.js';

const up = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- Horses ---------- */

const COATS = ['#5a3220', '#7a4424', '#3a2418', '#8d5a34', '#2a1d16', '#9a9590', '#4a2c1c', '#6b3a20', '#1d1714', '#8a4f2a'];
const SILKS = [
  ['#b5202f', '#f4f1ea'], ['#0f3d8a', '#f2c230'], ['#0e7a4a', '#ffffff'], ['#f2c230', '#141414'], ['#6a2d8a', '#f4a6c0'],
  ['#ffffff', '#0f3d8a'], ['#e0662a', '#0e2a4a'], ['#141414', '#e8c95a'], ['#5aa0d8', '#ffffff'], ['#8a1c25', '#2a7a3a'],
];

function horseKit(keep) {
  const nonIdx = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
  const merge = (parts) => { const g = mergeGeometries(parts.map(nonIdx)); parts.forEach((p) => p.dispose()); return keep(g); };
  return {
    body: merge([
      new THREE.SphereGeometry(1, 16, 10).scale(0.34, 0.4, 0.95).translate(0, 1.38, 0),
      new THREE.SphereGeometry(1, 12, 8).scale(0.37, 0.42, 0.45).translate(0, 1.42, -0.58),
      new THREE.SphereGeometry(1, 12, 8).scale(0.33, 0.43, 0.4).translate(0, 1.36, 0.6),
    ]),
    neck: merge([new THREE.CylinderGeometry(0.12, 0.21, 0.95, 8).translate(0, 0.47, 0)]),
    head: merge([new THREE.BoxGeometry(0.19, 0.23, 0.56).translate(0, 0, 0.2), new THREE.BoxGeometry(0.05, 0.1, 0.05).translate(0.06, 0.15, -0.02), new THREE.BoxGeometry(0.05, 0.1, 0.05).translate(-0.06, 0.15, -0.02)]),
    upper: merge([new THREE.CylinderGeometry(0.085, 0.06, 0.56, 7).translate(0, -0.28, 0)]),
    lower: merge([new THREE.CylinderGeometry(0.045, 0.04, 0.5, 6).translate(0, -0.25, 0), new THREE.CylinderGeometry(0.055, 0.06, 0.07, 8).translate(0, -0.52, 0.01)]),
    tail: merge([new THREE.ConeGeometry(0.09, 0.7, 6).translate(0, -0.35, 0)]),
    cloth: merge([new THREE.BoxGeometry(0.72, 0.3, 0.5).translate(0, 1.62, -0.02)]),
    torso: merge([new THREE.BoxGeometry(0.34, 0.22, 0.52)]),
    helmet: merge([new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.02, 0), new THREE.SphereGeometry(0.1, 8, 6).translate(0, 0, 0)]),
    arm: merge([new THREE.BoxGeometry(0.07, 0.07, 0.46).translate(0, 0, 0.23)]),
    thigh: merge([new THREE.BoxGeometry(0.1, 0.13, 0.42), new THREE.BoxGeometry(0.09, 0.3, 0.1).translate(0, -0.12, 0.18)]),
    shadow: keep(new THREE.PlaneGeometry(1.1, 2.8).rotateX(-Math.PI / 2)),
  };
}

function makeHorse(kit, mats, k) {
  const g = new THREE.Group();
  const coat = mats.coat[k % mats.coat.length]; const [s1, s2] = mats.silks[k % mats.silks.length];
  const rig = new THREE.Group(); g.add(rig); // bobs and pitches with the stride
  rig.add(new THREE.Mesh(kit.body, coat));
  rig.add(new THREE.Mesh(kit.cloth, mats.cloth));
  const neck = new THREE.Group(); neck.position.set(0, 1.55, 0.78); rig.add(neck);
  neck.add(new THREE.Mesh(kit.neck, coat));
  const head = new THREE.Mesh(kit.head, coat); head.position.set(0, 0.92, 0.05); head.rotation.x = 1.0; neck.add(head);
  const legs = [];
  [[0.17, 0.72, 1, 0.42], [-0.17, 0.72, 1, 0.52], [0.18, -0.68, 0, 0.0], [-0.18, -0.68, 0, 0.12]].forEach(([x, z, front, phase]) => {
    const upper = new THREE.Group(); upper.position.set(x, front ? 1.18 : 1.25, z); rig.add(upper);
    upper.add(new THREE.Mesh(kit.upper, coat));
    const knee = new THREE.Group(); knee.position.y = -0.55; upper.add(knee);
    knee.add(new THREE.Mesh(kit.lower, mats.leg));
    legs.push({ upper, knee, front, phase });
  });
  const tail = new THREE.Group(); tail.position.set(0, 1.62, -0.98); rig.add(tail);
  const tm = new THREE.Mesh(kit.tail, mats.mane); tm.rotation.x = 0.0; tail.add(tm);
  // Jockey crouched forward over the withers.
  const jock = new THREE.Group(); jock.position.set(0, 2.0, 0.12); rig.add(jock);
  const torso = new THREE.Mesh(kit.torso, s1); torso.rotation.x = -0.32; jock.add(torso);
  const helmet = new THREE.Mesh(kit.helmet, s2); helmet.position.set(0, 0.2, 0.36); jock.add(helmet);
  [-1, 1].forEach((s) => {
    const arm = new THREE.Mesh(kit.arm, s2); arm.position.set(s * 0.17, 0.05, 0.2); arm.rotation.x = 0.55; jock.add(arm);
    const th = new THREE.Mesh(kit.thigh, mats.breeches); th.position.set(s * 0.23, -0.2, 0.02); th.rotation.x = 0.25; jock.add(th);
  });
  const shadow = new THREE.Mesh(kit.shadow, mats.shadow); shadow.position.y = 0.04; shadow.renderOrder = 1; g.add(shadow);
  g.rotation.y = Math.PI / 2; // run along +x
  return { group: g, rig, neck, tail, legs, shadow, jock };
}

// One stride of a gallop. p: stride phase in cycles. air: 0..1 tuck for a jump.
function poseHorse(h, p, air = 0) {
  const TAU = Math.PI * 2;
  h.legs.forEach((L) => {
    const a = TAU * (p + L.phase);
    const swing = 0.6 * Math.sin(a);
    const bend = Math.max(0, Math.sin(a - 1.2)) * (L.front ? 1.25 : 0.9);
    L.upper.rotation.x = -swing * (1 - air) + (L.front ? -1.0 : 0.7) * air;
    L.knee.rotation.x = (L.front ? bend : -bend) * (1 - air) + (L.front ? 1.7 : -1.2) * air;
  });
  h.rig.position.y = 0.07 * Math.sin(TAU * p + 0.6);
  h.rig.rotation.x = 0.045 * Math.sin(TAU * p + 2.2) - air * 0.12;
  h.neck.rotation.x = 0.78 + 0.14 * Math.sin(TAU * p + 1.4);
  h.tail.rotation.x = 0.9 + 0.12 * Math.sin(TAU * p * 2);
}

/* ---------- Build ---------- */

export async function build(ctx) {
  const { renderer, lowPower } = ctx;
  const L = LAYOUTS.racecourse; const ring = L.ring; const track = L.trackRing;
  const jumps = ctx.racing === 'jumps';
  const root = new THREE.Group(); root.name = 'racecourse';
  const disposables = []; const keep = (x) => { disposables.push(x); return x; };
  const R = TX.rng(91);
  const [sx0, sx1] = L.standX;
  const T = L.terrace; const B = L.box; const RS = L.rest; const TP = L.top; const RF = L.roof;

  const M = {
    concrete: keep(new THREE.MeshStandardMaterial({ map: keep(TX.concrete(renderer, [196, 194, 188])), vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })),
    white: keep(new THREE.MeshStandardMaterial({ color: '#f1f0ea', roughness: 0.5, side: THREE.DoubleSide })),
    cream: keep(new THREE.MeshStandardMaterial({ color: '#e6e0d2', roughness: 0.75, side: THREE.DoubleSide })),
    navy: keep(new THREE.MeshStandardMaterial({ color: '#13223a', roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide })),
    roofUnder: keep(new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide })),
    steel: keep(new THREE.MeshStandardMaterial({ color: '#e9ebee', roughness: 0.35, metalness: 0.6 })),
    glass: keep(new THREE.MeshPhysicalMaterial({ color: '#9fb4c4', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, envMapIntensity: 1.3, side: THREE.DoubleSide, depthWrite: false })),
    rail: keep(new THREE.MeshStandardMaterial({ color: '#f7f7f4', roughness: 0.35 })),
    interior: keep(new THREE.MeshStandardMaterial({ color: '#3a2e25', emissive: new THREE.Color('#ffcf9a'), emissiveIntensity: 0.3, roughness: 0.8, side: THREE.DoubleSide })),
    carpet: keep(new THREE.MeshStandardMaterial({ color: '#2b3040', roughness: 1, side: THREE.DoubleSide })),
    timber: keep(new THREE.MeshStandardMaterial({ color: '#7a5a3e', roughness: 0.6, side: THREE.DoubleSide })),
    frost: keep(new THREE.MeshPhysicalMaterial({ color: '#dfe7ee', roughness: 0.35, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide })),
    cloth: keep(new THREE.MeshStandardMaterial({ color: '#f6f2e8', roughness: 0.85 })),
    lamp: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.5) })),
    dark: keep(new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 })),
  };
  const add = (geo, mat, { cast = false, receive = true, parent = root } = {}) => {
    const m = new THREE.Mesh(keep(geo), mat); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  };

  /* ---------- Land: flat course, gentle hills beyond ---------- */
  const grass = keep(TX.turf(renderer, { bands: false, base: [62, 98, 46] })); grass.repeat.set(170, 170);
  const land = new THREE.PlaneGeometry(3800, 3800, 150, 150); land.rotateX(-Math.PI / 2); land.translate(0, -0.03, 200);
  {
    const pos = land.attributes.position; const col = new Float32Array(pos.count * 3);
    const [tcx, tcz] = [L.track.cx, L.track.cz];
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k); const z = pos.getZ(k);
      const r = Math.hypot((x - tcx) / 1.15, z - tcz);
      const n = 0.5 + 0.25 * Math.sin(x * 0.0041 + 1.3) * Math.cos(z * 0.0037) + 0.25 * Math.sin(x * 0.011 - z * 0.008);
      const h = smooth(820, 1650, r) * (28 + 70 * n) + smooth(500, 900, r) * 4 * Math.sin(x * 0.02) * Math.cos(z * 0.017);
      pos.setY(k, -0.03 + h);
      const m = 0.82 + 0.18 * Math.sin(x * 0.013 + z * 0.009) * Math.cos(z * 0.021 - x * 0.004);
      const far = smooth(700, 1600, r);
      col.set([m * (1 - far * 0.15), m * (1 - far * 0.05), m * (1 - far * 0.1)], k * 3);
    }
    land.setAttribute('color', new THREE.BufferAttribute(col, 3));
    land.computeVertexNormals();
  }
  add(land, keep(new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 0.95 })));

  /* ---------- Track and rails ---------- */
  const tS = track.samples({ straightStep: 5, cornerSteps: 60 });
  const turf = keep(TX.turf(renderer, { bands: true, base: [82, 138, 60] }));
  const trackGeo = sweep(track, [[0, 0], [-L.track.width, 0]], { samples: tS, uScale: 46, vScale: L.track.width });
  trackGeo.translate(L.track.cx, 0.02, L.track.cz);
  add(trackGeo, keep(new THREE.MeshStandardMaterial({ map: turf, roughness: 0.9, side: THREE.DoubleSide })));
  const railTop = (d) => { const oct = []; for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2; oct.push([d + Math.cos(a) * 0.055, 1.05 + Math.sin(a) * 0.055]); } const g = sweep(track, oct, { samples: tS }); g.translate(L.track.cx, 0, L.track.cz); return g; };
  add(railTop(0.35), M.rail, { cast: true }); add(railTop(-L.track.width - 0.35), M.rail, { cast: true });
  const posts = [];
  [0.35, -L.track.width - 0.35].forEach((d) => {
    const Lr = track.length(d);
    for (let s = 0; s < Lr; s += 3) { const p = track.at(s, d); const x = p.x + L.track.cx; const z = p.z + L.track.cz; posts.push({ x, z, far: Math.hypot(x, z) > 600 }); }
  });
  const postGeo = keep(new THREE.BoxGeometry(0.08, 1.06, 0.08)); postGeo.translate(0, 0.53, 0);
  const postMesh = instanced(postGeo, M.rail, posts.filter((p) => !p.far), (p, P, q, sc) => { P.set(p.x, 0, p.z); q.identity(); sc.set(1, 1, 1); });
  postMesh.castShadow = true; root.add(postMesh);
  root.add(instanced(postGeo, M.rail, posts.filter((p) => p.far), (p, P, q, sc) => { P.set(p.x, 0, p.z); q.identity(); sc.set(1.5, 1, 1.5); }));

  // Winning post on the stands-side rail, with the judge's mirror post across the track.
  const roundel = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c4202c'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 26, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return keep(t);
  })();
  const roundelMat = keep(new THREE.MeshStandardMaterial({ map: roundel, roughness: 0.5, side: THREE.DoubleSide }));
  [[L.railZ - 0.6, 4.2], [L.farRailZ + 0.7, 3.6]].forEach(([z, h]) => {
    add(new THREE.CylinderGeometry(0.07, 0.08, h, 10).translate(0, h / 2, 0), M.rail, { cast: true }).position.set(L.postX, 0, z);
    const disc = add(new THREE.CircleGeometry(0.55, 28), roundelMat, { cast: true }); disc.position.set(L.postX, h + 0.45, z);
  });

  /* ---------- Birch fences (jumps) ---------- */
  if (jumps) {
    const brush = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); const r = TX.rng(5);
      g.fillStyle = '#4a3a24'; g.fillRect(0, 0, 256, 128);
      for (let k = 0; k < 1400; k++) { const x = r() * 256; const v = 50 + r() * 60; g.strokeStyle = `rgb(${v + 20},${v + 8},${v - 18})`; g.lineWidth = 1 + r(); g.beginPath(); g.moveTo(x, 128); g.lineTo(x + (r() - 0.5) * 14, r() * 30); g.stroke(); }
      g.fillStyle = 'rgba(70,110,40,0.35)'; g.fillRect(0, 0, 256, 22);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(8, 1); return keep(t);
    })();
    const brushMat = keep(new THREE.MeshStandardMaterial({ map: brush, roughness: 1 }));
    const boardMat = keep(new THREE.MeshStandardMaterial({ color: '#e8742a', roughness: 0.6 }));
    L.fences.forEach((fx) => {
      const g = new THREE.Group();
      const z0 = L.railZ + 1.6; const z1 = L.farRailZ - 1.6; const w = z1 - z0;
      const body = new THREE.Mesh(keep(new THREE.BoxGeometry(1.1, 1.35, w)), brushMat); body.position.set(0, 0.68, (z0 + z1) / 2); body.castShadow = true; g.add(body);
      const board = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.3, w)), boardMat); board.position.set(-0.75, 0.15, (z0 + z1) / 2); board.rotation.z = 0.35; g.add(board);
      [z0 - 0.1, z1 + 0.1].forEach((z, n) => {
        const wing = new THREE.Mesh(keep(new THREE.BoxGeometry(3.4, 1.2, 0.08)), M.rail);
        wing.position.set(-0.6, 0.6, z + (n ? 0.8 : -0.8)); wing.rotation.y = n ? -0.45 : 0.45; wing.castShadow = true; g.add(wing);
      });
      g.position.x = fx; root.add(g);
    });
  }

  /* ---------- Grandstand ---------- */
  const standS = []; for (let x = sx1; x >= sx0 - 1e-6; x -= 2) standS.push(standAt(x));
  const ssw = (prof, mat, o = {}) => add(sweep(ring, prof, { samples: standS, ...o }), mat, o);
  const inStand = (p) => p.nz < -0.5 && p.x > sx0 + 0.5 && p.x < sx1 - 0.5;
  const aisles = []; for (let x = sx1; x >= sx0; x -= 11.5) aisles.push(standAt(x));
  // Terrace: open-air steps along the front; seats only in the premier enclosure near the post.
  const terrace = buildTier(ring, T, {
    radials: aisles, samples: standS, frontBase: 0, seed: 3, concreteColor: [1, 1, 1],
    allow: (p) => inStand(p) && p.x > L.premierX[0] && p.x < L.premierX[1],
    padded: () => true, seatColor: () => [0.08, 0.2, 0.14], backWall: RS.floorY - rowY(T, T.rows - 1),
  });
  add(terrace.concrete, M.concrete, { cast: true });
  root.add(stepsMesh(terrace.steps, M.cream));
  // Low glass rail along the front of the terrace, and dividing rails round the enclosure.
  ssw([[T.d0 + 0.05, T.y0], [T.d0 + 0.05, T.y0 + 0.95]], M.glass).renderOrder = 2;
  ssw([[T.d0, T.y0 + 0.95], [T.d0 + 0.12, T.y0 + 0.95]], M.steel);
  [L.premierX[0] - 0.5, L.premierX[1] + 0.5].forEach((x) => {
    const p = add(new THREE.BoxGeometry(0.06, 1.0, tierBackD(T) - T.d0), M.glass); p.renderOrder = 2;
    p.position.set(x, rowY(T, 5) + 0.5, -8 - (T.d0 + tierBackD(T)) / 2); p.rotation.x = -Math.atan2(rowY(T, 9) - rowY(T, 0), tierBackD(T) - T.d0);
  });
  // Restaurant level: floor, glass front, warm interior, ceiling.
  ssw([[tierBackD(T), RS.floorY], [RS.backD, RS.floorY]], M.carpet);
  ssw([[RS.glassD, RS.floorY], [RS.glassD, RS.ceilY]], M.glass).renderOrder = 2;
  ssw([[RS.backD, RS.floorY], [RS.backD, RS.ceilY]], M.interior, { cast: true });
  ssw([[RS.glassD - 0.4, RS.ceilY], [RS.backD, RS.ceilY]], M.cream, { cast: true });
  const mullions = []; for (let x = sx1 - 1.6; x > sx0; x -= 1.6) mullions.push(x);
  const mullGeo = keep(new THREE.BoxGeometry(0.08, RS.ceilY - RS.floorY, 0.12)); mullGeo.translate(0, (RS.ceilY - RS.floorY) / 2, 0);
  root.add(instanced(mullGeo, M.navy, mullions, (x, P, q, sc) => { P.set(x, RS.floorY, -8 - RS.glassD); q.identity(); sc.set(1, 1, 1); }));
  // Restaurant tables and diners (hidden near a viewer who is inside, whose own room replaces them).
  const tables = [];
  for (let x = sx1 - 3; x > sx0 + 2; x -= 3.4) [RS.glassD + 1.1, RS.glassD + 3.6].forEach((d) => tables.push({ x: x + (d > 12 ? 1.6 : 0), z: -8 - d }));
  const tableGeo = keep(new THREE.BoxGeometry(1.5, 0.78, 0.9)); tableGeo.translate(0, 0.39, 0);
  const tableMesh = instanced(tableGeo, M.cloth, tables, (t, P, q, sc) => { P.set(t.x, RS.floorY, t.z); q.identity(); sc.set(1, 1, 1); });
  root.add(tableMesh);

  // Box level: balconies with glass rails and frosted dividers, glass doors, warm rooms.
  ssw([[B.frontD, B.floorY - 0.3], [B.frontD, B.floorY], [B.backD, B.floorY]], M.cream, { cast: true });
  ssw([[B.frontD, B.floorY - 0.3], [RS.glassD - 0.4, B.floorY - 0.3], [RS.glassD - 0.4, RS.ceilY]], M.cream);
  ssw([[B.frontD + 0.05, B.floorY], [B.frontD + 0.05, B.floorY + 1.05]], M.glass).renderOrder = 2;
  ssw([[B.frontD - 0.02, B.floorY + 1.05], [B.frontD + 0.14, B.floorY + 1.05]], M.steel);
  ssw([[B.glassD, B.floorY], [B.glassD, B.ceilY]], M.glass).renderOrder = 2;
  ssw([[B.backD, B.floorY], [B.backD, B.ceilY]], M.interior, { cast: true });
  ssw([[B.frontD - 0.2, B.ceilY], [B.backD, B.ceilY]], M.cream, { cast: true });
  ssw([[B.frontD - 0.2, B.ceilY - 0.25], [B.frontD - 0.2, TP.y0]], M.navy);
  ssw([[B.frontD - 0.22, B.ceilY + 0.1], [B.frontD - 0.22, B.ceilY + 0.16]], keep(new THREE.MeshStandardMaterial({ color: '#caa252', metalness: 1, roughness: 0.3 })));
  const boxParts = []; const balParts = [];
  for (let x = sx0; x <= sx1 + 1e-6; x += B.pitch) {
    boxParts.push({ x, z: -8 - (B.glassD + B.backD) / 2, nx: 0, nz: -1 });
    balParts.push({ x, z: -8 - (B.frontD + B.glassD) / 2, nx: 0, nz: -1 });
  }
  const bpGeo = keep(new THREE.BoxGeometry(0.12, B.ceilY - B.floorY, B.backD - B.glassD)); bpGeo.translate(0, (B.ceilY - B.floorY) / 2, 0);
  const boxPartMesh = instanced(bpGeo, M.timber, boxParts, (p, P, q, sc) => { P.set(p.x, B.floorY, p.z); q.identity(); sc.set(1, 1, 1); });
  root.add(boxPartMesh);
  const blGeo = keep(new THREE.BoxGeometry(0.05, 1.9, B.glassD - B.frontD)); blGeo.translate(0, 0.95, 0);
  const balPartMesh = instanced(blGeo, M.frost, balParts, (p, P, q, sc) => { P.set(p.x, B.floorY, p.z); q.identity(); sc.set(1, 1, 1); });
  balPartMesh.renderOrder = 2; root.add(balPartMesh);
  const lamps = []; for (let x = sx0 + B.pitch / 2; x < sx1; x += B.pitch) lamps.push({ x, y: B.ceilY - 0.02, z: -8 - B.glassD - 2.2 }, { x: x + 1.7, y: RS.ceilY - 0.02, z: -8 - RS.glassD - 2.5 });
  const lampGeo = keep(new THREE.PlaneGeometry(1.4, 0.18).rotateX(Math.PI / 2));
  root.add(instanced(lampGeo, M.lamp, lamps, (l, P, q, sc) => { P.set(l.x, l.y, l.z); q.identity(); sc.set(1, 1, 1); }));

  // Top tier: covered seats above the boxes.
  const top = buildTier(ring, TP, {
    radials: aisles, samples: standS, frontBase: B.ceilY, seed: 7, concreteColor: [1, 1, 1], allow: inStand,
    seatColor: () => [0.07, 0.24, 0.16], backWall: RF.y - rowY(TP, TP.rows - 1),
  });
  add(top.concrete, M.concrete, { cast: true });
  root.add(stepsMesh(top.steps, M.cream));
  ssw([[TP.d0 + 0.05, TP.y0], [TP.d0 + 0.05, TP.y0 + 1.0]], M.glass).renderOrder = 2;
  ssw([[TP.d0 - 0.02, TP.y0 + 1.0], [TP.d0 + 0.12, TP.y0 + 1.0]], M.steel);

  // Roof: a cantilevered canopy with white trusses, and the back facade.
  ssw([[RF.frontD, RF.y], [RF.backD, RF.y + 0.6]], M.roofUnder, { cast: true });
  ssw([[RF.frontD, RF.y - 0.5], [RF.frontD, RF.y + 0.15], [RF.backD, RF.y + 1.0]], M.white, { cast: true });
  ssw([[RF.backD, 0], [RF.backD, RF.y + 1.0]], M.cream, { cast: true });
  const truss = [];
  for (let x = sx0 + 5; x < sx1; x += 10) {
    const a = new THREE.Vector3(x, RF.y + 0.55, -8 - RF.backD); const b = new THREE.Vector3(x, RF.y - 0.05, -8 - RF.frontD - 0.4);
    const c = new THREE.Vector3(x, RF.y - 2.6, -8 - RF.backD);
    truss.push({ a, b, r: 0.22 }, { a: c, b, r: 0.18 });
    for (let k = 1; k < 6; k++) { const u = k / 6; truss.push({ a: a.clone().lerp(b, u), b: c.clone().lerp(b, u), r: 0.07 }); }
  }
  const tGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const trussMesh = instanced(tGeo, M.steel, truss, (m, P, q, sc) => { const d = m.b.clone().sub(m.a); P.copy(m.a).addScaledVector(d, 0.5); q.setFromUnitVectors(up, d.clone().normalize()); sc.set(m.r, d.length(), m.r); });
  trussMesh.castShadow = true; root.add(trussMesh);
  // End walls.
  const capProf = [[T.d0, 0], [T.d0, 1.4], [B.frontD - 0.3, B.floorY - 0.3], [B.frontD - 0.3, TP.y0 + 1.2], [RF.frontD + 2, RF.y - 0.4], [RF.frontD, RF.y + 0.2], [RF.backD, RF.y + 1.0], [RF.backD, 0]];
  [sx0, sx1].forEach((x) => { const { i, f } = standAt(x); add(endCap(ring, i, f, capProf, 0), M.cream, { cast: true }); });

  /* ---------- Infield: big screen, parade ring ---------- */
  const sc = L.screen;
  const scrMat = keep(new THREE.MeshBasicMaterial({ map: keep(TX.raceScreen(renderer)), color: new THREE.Color(1, 1, 1) }));
  const screen = add(new THREE.PlaneGeometry(sc.w, sc.h), scrMat, { receive: false }); screen.position.set(sc.x, 3.2 + sc.h / 2, sc.z); screen.rotation.y = Math.PI;
  const sframe = add(new THREE.BoxGeometry(sc.w + 0.6, sc.h + 0.6, 0.5), M.dark, { cast: true }); sframe.position.set(sc.x, 3.2 + sc.h / 2, sc.z + 0.3);
  [-1, 1].forEach((s) => { const leg = add(new THREE.BoxGeometry(0.4, 3.4, 0.4), M.dark, { cast: true }); leg.position.set(sc.x + s * sc.w * 0.32, 1.7, sc.z + 0.3); });
  // Parade ring: an oval of white rail round a lawn, beside the stand.
  const pr = L.parade;
  const prLawn = add(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: '#5f9446', roughness: 0.9 })));
  prLawn.scale.set(pr.rx, 1, pr.rz); prLawn.position.set(pr.x, 0.01, pr.z);
  const prCurve = new THREE.EllipseCurve(pr.x, pr.z, pr.rx + 1.2, pr.rz + 1.2, 0, Math.PI * 2);
  const prPts = prCurve.getPoints(64).map((p) => new THREE.Vector3(p.x, 1.0, p.y));
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(prPts, true), 128, 0.05, 6, true), M.rail, { cast: true });
  root.add(instanced(postGeo, M.rail, prPts.filter((_, k) => k % 2 === 0), (p, P, q, s2) => { P.set(p.x, 0, p.z); q.identity(); s2.set(1, 0.95, 1); }));
  const prPath = add(new THREE.RingGeometry(0.97, 1.0, 64).rotateX(-Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: '#c9b48c', roughness: 1 })));
  prPath.scale.set(pr.rx + 0.4, 1, pr.rz + 0.4); prPath.position.set(pr.x, 0.02, pr.z);

  /* ---------- Trees ---------- */
  const trees = [];
  const treeAt = (x, z, s = 1) => { if (z < 70 && x > -560 && x < 700 && z > -80) return; trees.push({ x, z, r: (3.2 + R() * 3) * s, h: (5 + R() * 5) * s, c: R() }); };
  [60, 85, 130].forEach((d, n) => {
    const Lt = track.length(d);
    for (let s = 0; s < Lt; s += 9 + R() * 14) { if (n === 1 && R() < 0.5) continue; const p = track.at(s, d + (R() - 0.5) * 18); treeAt(p.x + L.track.cx, p.z + L.track.cz, n === 2 ? 1.3 : 1); }
  });
  for (let k = 0; k < 18; k++) {
    const cxk = L.track.cx + (R() - 0.5) * 900; const czk = L.track.cz + (R() - 0.5) * 300;
    const n = 6 + Math.floor(R() * 14);
    for (let j = 0; j < n; j++) treeAt(cxk + (R() - 0.5) * 60, czk + (R() - 0.5) * 40);
  }
  for (let k = 0; k < 260; k++) { const a = R() * Math.PI * 2; const rr = 900 + R() * 700; treeAt(L.track.cx + Math.cos(a) * rr * 1.1, L.track.cz + Math.sin(a) * rr, 1.5); }
  // Trees behind the stand and round the parade ring frame the near view.
  for (let x = -260; x < 260; x += 14 + R() * 10) trees.push({ x, z: -50 - R() * 30, r: 3.5 + R() * 3, h: 6 + R() * 5, c: R() });
  for (let k = 0; k < 9; k++) trees.push({ x: pr.x + 20 + R() * 25, z: pr.z - 15 + R() * 30, r: 3.5 + R() * 2, h: 7 + R() * 4, c: R() });
  const treeGeo = keep(new THREE.IcosahedronGeometry(1, 1)); treeGeo.translate(0, 1, 0);
  const treeMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }));
  const treeMesh = instanced(treeGeo, treeMat, trees, (t, P, q, s2) => { P.set(t.x, -0.2, t.z); q.setFromAxisAngle(up, t.c * 6); s2.set(t.r, t.h * 0.55, t.r); });
  const tc = new THREE.Color();
  trees.forEach((t, k) => { tc.setRGB(0.035 + t.c * 0.04, 0.07 + t.c * 0.06, 0.03 + t.c * 0.02); treeMesh.setColorAt(k, tc); });
  treeMesh.instanceColor.needsUpdate = true;
  treeMesh.castShadow = true; root.add(treeMesh);

  /* ---------- Seats and crowd ---------- */
  const slots = [...terrace.slots, ...top.slots];
  const bandGeo = keep(mergeGeometries([terrace.bandGeo, top.bandGeo]));
  [terrace.bandGeo, top.bandGeo].forEach((g) => g.dispose());
  const seats = new SeatField({ slots, bandGeo, bandTexture: keep(TX.seatBand(renderer)), nearCapacity: lowPower ? 900 : 2000 });
  root.add(seats.group);
  const crowd = new Crowd({ lowPower });
  slots.forEach((s) => {
    if (lowPower && R() < 0.35) return;
    crowd.add({ x: s.x, y: s.y, z: s.z, yaw: yawFacing(-s.nx, -s.nz), seated: true, angle: s.angle, palette: 'raceday' });
  });
  const facing = (x, z) => Math.atan2((x * 0.5 + 4) - x, 30 - z) + (R() - 0.5) * 0.6;
  // Standing on the terrace steps outside the enclosure.
  for (let i = 0; i < T.rows; i++) {
    const z = -8 - seatD(T, i); const y = rowY(T, i);
    for (let x = sx0 + 1.5; x < sx1 - 1.5; x += 0.62 + R() * 0.5) {
      if (x > L.premierX[0] - 1 && x < L.premierX[1] + 1) continue;
      if (R() < 0.35) continue;
      crowd.add({ x: x + (R() - 0.5) * 0.2, y, z: z + (R() - 0.5) * 0.2, yaw: facing(x, z), seated: false, palette: 'raceday' });
    }
  }
  // The lawn: busiest at the rail, thinner towards the stand.
  fillFloor(crowd, {
    x0: sx0 + 2, x1: sx1 + 26, z0: -7.0, z1: L.railZ - 0.75, spacing: lowPower ? 1.15 : 0.82, jitter: 0.32,
    face: new THREE.Vector3(10, 0, 40), palette: 'raceday', armsUp: 0.02, phones: 0.0, seed: 17,
    // Thinner near the stand, and a quieter lawn in front of the premier enclosure.
    skip: (x, z) => (z < 2.5 && R() < 0.45) || (Math.abs(x - 44) < 2.5) || (Math.abs(x + 96) < 2.5)
      || (x > L.premierX[0] && x < L.premierX[1] && R() < (z < 5 ? 0.75 : 0.4)),
  });
  // Balcony guests (none on the three boxes the private-box seats use, which supply their own).
  const box0 = Math.round((-18 - sx0) / B.pitch - 0.5);
  for (let k = 0; sx0 + B.pitch * (k + 0.5) < sx1; k++) {
    if (Math.abs(k - box0) <= 1) continue;
    const xc = sx0 + B.pitch * (k + 0.5); const n = R() < 0.2 ? 0 : 1 + Math.floor(R() * 4);
    for (let j = 0; j < n; j++) crowd.add({ x: xc - 1.8 + j * 1.2 + R() * 0.3, y: B.floorY, z: -8 - B.frontD - 0.7 - R() * 1.2, yaw: Math.PI * 0 + (R() - 0.5) * 0.8, seated: false, palette: 'raceday', hideZone: { x: xc, z: -8 - 12, r: B.pitch / 2 } });
  }
  // Diners in the restaurant.
  tables.forEach((t) => {
    [-0.7, 0.7].forEach((o) => { if (R() < 0.25) return; crowd.add({ x: t.x + o * 0.4, y: RS.floorY, z: t.z + o, yaw: o > 0 ? Math.PI : 0, seated: true, palette: 'raceday', hideZone: { x: t.x, z: t.z, r: 15 } }); });
  });
  // Around the parade ring.
  const Lp = 2 * Math.PI;
  for (let a = 0; a < Lp; a += 0.05 + R() * 0.06) {
    if (R() < 0.3) continue;
    const rr = 1 + (2.4 + R() * 2.2) / Math.min(pr.rx, pr.rz);
    const x = pr.x + Math.cos(a) * pr.rx * rr; const z = pr.z + Math.sin(a) * pr.rz * rr;
    crowd.add({ x, y: 0, z, yaw: Math.atan2(pr.x - x, pr.z - z), seated: false, palette: 'raceday' });
  }
  crowd.finalize();
  root.add(crowd.group);

  /* ---------- Horses ---------- */
  const kit = horseKit(keep);
  const shadowTex = keep(TX.glow(64));
  const mats = {
    coat: COATS.map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.05 }))),
    leg: keep(new THREE.MeshStandardMaterial({ color: '#241812', roughness: 0.5 })),
    mane: keep(new THREE.MeshStandardMaterial({ color: '#18110d', roughness: 0.8 })),
    cloth: M.cloth,
    breeches: keep(new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.7 })),
    silks: SILKS.map(([a, b]) => [keep(new THREE.MeshStandardMaterial({ color: a, roughness: 0.38, metalness: 0.05 })), keep(new THREE.MeshStandardMaterial({ color: b, roughness: 0.38 }))]),
    shadow: keep(new THREE.MeshBasicMaterial({ color: '#000000', map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false })),
  };
  const field = new THREE.Group(); field.visible = false; root.add(field);
  const horses = [];
  for (let k = 0; k < 10; k++) {
    const h = makeHorse(kit, mats, k);
    h.lane = 15.2 + k * 1.45 + (R() - 0.5) * 0.6;
    h.x0 = -172 - R() * 13 - (k % 3) * 2;
    h.base = 16.6 + R() * 1.3;
    h.k = k; h.freqJ = 2.15 + R() * 0.2; h.ph = R();
    field.add(h.group); horses.push(h);
  }
  // A few horses walking round the parade ring with their lads (static, for scale and story).
  const paraders = [];
  for (let k = 0; k < 4; k++) {
    const h = makeHorse(kit, mats, k + 3); const a = k * 1.6 + 0.4;
    h.group.position.set(pr.x + Math.cos(a) * (pr.rx - 1.6), 0, pr.z + Math.sin(a) * (pr.rz - 1.6));
    h.group.rotation.y = -a; poseHorse(h, 0.1 * k, 0);
    h.legs.forEach((Lg) => { Lg.upper.rotation.x *= 0.35; Lg.knee.rotation.x *= 0.4; });
    h.jock.visible = false;
    root.add(h.group); paraders.push(h);
  }

  let raceStart = 0; let raceOn = false; let raceStill = false;
  const posAt = (h, e) => h.x0 + h.base * e - (0.7 / 0.35) * (Math.cos(0.35 * e + h.k) - Math.cos(h.k));
  function placeField(e, stillPose) {
    horses.forEach((h) => {
      const x = posAt(h, e);
      let air = 0; let lift = 0;
      if (jumps) L.fences.forEach((fx) => { const u = (x - fx + 3.2) / 6.4; if (u > 0 && u < 1) { air = Math.sin(Math.PI * u); lift = 1.15 * air; } });
      h.group.position.set(x, lift, h.lane);
      h.shadow.position.y = 0.04 - lift; h.shadow.material.opacity = 0.5;
      poseHorse(h, stillPose ? h.ph : e * h.freqJ + h.ph, air);
    });
  }

  /* ---------- Behaviour ---------- */
  const tune = {
    // Golden hour: a low sun from your right (-x, a touch behind the stand), out of frame, so warm
    // light catches the runners' heads and near flanks and the rails throw long shadows along the turf.
    sun: { day: [-0.42, 0.78, 0.46], golden: [-0.96, 0.2, -0.12], night: [0.18, 1, 0.22] },
    fogScale: 0.42,
    seatLight: 0.22,
    sky: { golden: { turbidity: 6, rayleigh: 3.2, mie: 0.0025, mieG: 0.78 } },
    hemi: { golden: ['#f6c48e', '#3a3020', 0.42] },
    fog: { golden: '#e6bf98', day: '#cbd8e4' },
    exposure: { golden: 1.0 },
  };
  return {
    root, crowd, seats, indoor: false, tune,
    bounds: { center: new THREE.Vector3(-20, 8, 6), radius: 150 },
    overview: { position: new THREE.Vector3(-150, 120, 210), target: new THREE.Vector3(-15, 4, 4), minDistance: 60, maxDistance: 520 },
    setViewer(pos) {
      hidePartitions(boxPartMesh, boxParts, B.floorY, pos, 3.2);
      hidePartitions(balPartMesh, balParts, B.floorY, pos, 3.2);
      // Restaurant tables round a viewer inside the restaurant: their own room replaces them.
      const inside = pos && Math.abs(pos.y - RS.floorY - 1.2) < 1.5 && pos.z < -8 - RS.glassD;
      const m = new THREE.Matrix4(); const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      tables.forEach((t, k) => {
        const near = inside && Math.abs(t.x - pos.x) < 15;
        if (near) tableMesh.setMatrixAt(k, zero); else { m.makeTranslation(t.x, RS.floorY, t.z); tableMesh.setMatrixAt(k, m); }
      });
      tableMesh.instanceMatrix.needsUpdate = true;
    },
    // name 'race': start a race now (t), or show a still field at the finish (still).
    play(name, t, still) {
      if (name !== 'race') return false;
      raceStart = t; raceOn = true; raceStill = !!still; field.visible = true;
      if (still) placeField(10.4, true);
      return true;
    },
    get racing() { return raceOn && !raceStill; },
    setMood(m, info) {
      const night = m === 'night'; const golden = m === 'golden';
      M.interior.emissiveIntensity = night ? 0.9 : golden ? 0.55 : 0.28;
      M.lamp.color.setRGB(night ? 2.6 : 1.5, night ? 2.2 : 1.3, night ? 1.6 : 0.95);
      scrMat.color.setScalar(night ? 1.25 : golden ? 1.05 : 1.15);
      void info;
    },
    update(t, dt, { still }) {
      crowd.update(t, { still });
      if (raceOn && !raceStill) {
        const e = still ? 10.4 : t - raceStart;
        if (still) { raceStill = true; placeField(10.4, true); }
        else if (e > 30) { field.visible = false; raceOn = false; }
        else placeField(e, false);
      }
    },
    dispose() {
      seats.dispose(); crowd.dispose();
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
