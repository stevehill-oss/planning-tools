// Racecourse builder: Ascot and Cheltenham from their layouts in js/viewer/layouts.js.
// Stated and used: Ascot's 480 m grandstand facing north over the course, its right-handed
// triangular round course of about 1.75 miles, the 2.5 furlong run-in, the straight mile,
// private boxes on Levels 2 to 6, the Village Enclosure in the centre of the track, and the
// 73 ft climb from Swinley Bottom to the post; Cheltenham's left-handed course, uphill
// finish below Cleeve Hill and the Best Mate Enclosure opposite the main grandstand.
// Modelled: floor heights, the stand section, track width, the course shape beyond what is
// stated, fence positions, the parade ring, screens and trees.
//   grandstand  a front terrace, then a stack of floors, each with a balcony, glazing and a
//               warm interior; boxes have frosted balcony screens; a cantilevered roof
//   course      turf track and white running rails round the whole course, furlong poles,
//               the winning post, an infield screen, the parade ring and lawns
//   race        play('race') sends a field past the post in the right direction for the
//               course; reduced motion shows a still field at the finish
// Module contract: see the header of stadium.js. Extra: play(name, t, still).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rowY, seatD, tierBackD, standAt } from '../layouts.js';
import { sweep, buildTier, stepsMesh, SeatField, instanced, yawFacing, hidePartitions, endCap } from '../bowl.js';
import { Crowd, fillFloor } from '../crowd.js';
import * as TX from '../textures.js';

const up = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- Horses ---------- */

/* ---------- Horses ---------- */

const COATS = ['#5a3220', '#7a4424', '#3a2418', '#8d5a34', '#2a1d16', '#9a9590', '#4a2c1c', '#6b3a20', '#1d1714', '#8a4f2a'];
const SILKS = [
  ['#b5202f', '#f4f1ea'], ['#0f3d8a', '#f2c230'], ['#0e7a4a', '#ffffff'], ['#f2c230', '#141414'], ['#6a2d8a', '#f4a6c0'],
  ['#ffffff', '#0f3d8a'], ['#e0662a', '#0e2a4a'], ['#141414', '#e8c95a'], ['#5aa0d8', '#ffffff'], ['#8a1c25', '#2a7a3a'],
];

function horseParts(keep) {
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

function makeHorse(parts, mats, k) {
  const g = new THREE.Group();
  const coat = mats.coat[k % mats.coat.length]; const [s1, s2] = mats.silks[k % mats.silks.length];
  const rig = new THREE.Group(); g.add(rig); // bobs and pitches with the stride
  rig.add(new THREE.Mesh(parts.body, coat));
  rig.add(new THREE.Mesh(parts.cloth, mats.cloth));
  const neck = new THREE.Group(); neck.position.set(0, 1.55, 0.78); rig.add(neck);
  neck.add(new THREE.Mesh(parts.neck, coat));
  const head = new THREE.Mesh(parts.head, coat); head.position.set(0, 0.92, 0.05); head.rotation.x = 1.0; neck.add(head);
  const legs = [];
  [[0.17, 0.72, 1, 0.42], [-0.17, 0.72, 1, 0.52], [0.18, -0.68, 0, 0.0], [-0.18, -0.68, 0, 0.12]].forEach(([x, z, front, phase]) => {
    const upper = new THREE.Group(); upper.position.set(x, front ? 1.18 : 1.25, z); rig.add(upper);
    upper.add(new THREE.Mesh(parts.upper, coat));
    const knee = new THREE.Group(); knee.position.y = -0.55; upper.add(knee);
    knee.add(new THREE.Mesh(parts.lower, mats.leg));
    legs.push({ upper, knee, front, phase });
  });
  const tail = new THREE.Group(); tail.position.set(0, 1.62, -0.98); rig.add(tail);
  const tm = new THREE.Mesh(parts.tail, mats.mane); tm.rotation.x = 0.0; tail.add(tm);
  // Jockey crouched forward over the withers.
  const jock = new THREE.Group(); jock.position.set(0, 2.0, 0.12); rig.add(jock);
  const torso = new THREE.Mesh(parts.torso, s1); torso.rotation.x = -0.32; jock.add(torso);
  const helmet = new THREE.Mesh(parts.helmet, s2); helmet.position.set(0, 0.2, 0.36); jock.add(helmet);
  [-1, 1].forEach((s) => {
    const arm = new THREE.Mesh(parts.arm, s2); arm.position.set(s * 0.17, 0.05, 0.2); arm.rotation.x = 0.55; jock.add(arm);
    const th = new THREE.Mesh(parts.thigh, mats.breeches); th.position.set(s * 0.23, -0.2, 0.02); th.rotation.x = 0.25; jock.add(th);
  });
  const shadow = new THREE.Mesh(parts.shadow, mats.shadow); shadow.position.y = 0.04; shadow.renderOrder = 1; g.add(shadow);
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
  const L = ctx.layout; const ring = L.ring;
  const jumps = ctx.racing === 'jumps';
  const root = new THREE.Group(); root.name = 'racecourse';
  const disposables = []; const keep = (x) => { disposables.push(x); return x; };
  const R = TX.rng(91);
  const [sx0, sx1] = L.standX;
  const T = L.terrace; const RF = L.roof; const FL = L.floors;
  const elev = L.elevation;
  const dir = L.dir;

  const M = {
    concrete: keep(new THREE.MeshStandardMaterial({ map: keep(TX.concrete(renderer, [196, 194, 188])), vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })),
    white: keep(new THREE.MeshStandardMaterial({ color: '#f1f0ea', roughness: 0.5, side: THREE.DoubleSide })),
    cream: keep(new THREE.MeshStandardMaterial({ color: '#e6e0d2', roughness: 0.72, side: THREE.DoubleSide })),
    navy: keep(new THREE.MeshStandardMaterial({ color: '#13223a', roughness: 0.42, metalness: 0.35, side: THREE.DoubleSide })),
    roofUnder: keep(new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide })),
    steel: keep(new THREE.MeshStandardMaterial({ color: '#e9ebee', roughness: 0.32, metalness: 0.7 })),
    glass: keep(new THREE.MeshPhysicalMaterial({ color: '#9fb4c4', roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.32, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false })),
    rail: keep(new THREE.MeshStandardMaterial({ color: '#f7f7f4', roughness: 0.35 })),
    interior: keep(new THREE.MeshStandardMaterial({ color: '#3a2e25', emissive: new THREE.Color('#ffcf9a'), emissiveIntensity: 0.3, roughness: 0.8, side: THREE.DoubleSide })),
    carpet: keep(new THREE.MeshStandardMaterial({ color: '#2b3040', roughness: 1, side: THREE.DoubleSide })),
    timber: keep(new THREE.MeshStandardMaterial({ color: '#7a5a3e', roughness: 0.6, side: THREE.DoubleSide })),
    frost: keep(new THREE.MeshPhysicalMaterial({ color: '#dfe7ee', roughness: 0.35, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide })),
    cloth: keep(new THREE.MeshStandardMaterial({ color: '#f6f2e8', roughness: 0.85 })),
    lamp: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.5) })),
    dark: keep(new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.8 })),
    gold: keep(new THREE.MeshStandardMaterial({ color: '#caa252', metalness: 1, roughness: 0.3 })),
    canvas: keep(new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.75, side: THREE.DoubleSide })),
  };
  const add = (geo, mat, { cast = false, receive = true, parent = root } = {}) => {
    const m = new THREE.Mesh(keep(geo), mat); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  };
  // Drapes a geometry's vertices onto the ground (plus their own y as a lift).
  const drape = (g, lift = 0) => { const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + elev(p.getX(k), p.getZ(k)) + lift); p.needsUpdate = true; g.computeVertexNormals(); return g; };

  /* ---------- Land, hills ---------- */
  const grass = keep(TX.turf(renderer, { bands: false, base: [62, 98, 46] })); grass.repeat.set(220, 220);
  const LAND = 5200;
  const land = new THREE.PlaneGeometry(LAND, LAND, 220, 220); land.rotateX(-Math.PI / 2); land.translate(-200, 0, 900);
  {
    const pos = land.attributes.position; const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k); const z = pos.getZ(k);
      const n = 0.5 + 0.25 * Math.sin(x * 0.0041 + 1.3) * Math.cos(z * 0.0037) + 0.25 * Math.sin(x * 0.011 - z * 0.008);
      let h = elev(x, z) - 0.12;
      const far = Math.max(Math.abs(x + 200) - 1300, z - 1700, -z - 500);
      if (L.hills === 'cleeve') h += smooth(900, 3200, z) * 210 * (0.75 + 0.5 * n) + smooth(200, 1400, far) * 30 * n; // a hill behind the course (stated setting, modelled shape)
      else h += smooth(100, 1400, far) * (22 + 60 * n);
      pos.setY(k, h);
      const m = 0.82 + 0.18 * Math.sin(x * 0.013 + z * 0.009) * Math.cos(z * 0.021 - x * 0.004);
      const fa = smooth(600, 2400, Math.hypot(x + 150, z - 300));
      col.set([m * (1 - fa * 0.12), m * (1 - fa * 0.04), m * (1 - fa * 0.08)], k * 3);
    }
    land.setAttribute('color', new THREE.BufferAttribute(col, 3));
    land.computeVertexNormals();
  }
  add(land, keep(new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 0.95 })));

  /* ---------- Track, rails, furlong poles, post ---------- */
  const loop = L.loop; const W = L.trackW;
  const lS = loop.samples({ straightStep: 6, cornerSteps: 70 });
  const turf = keep(TX.turf(renderer, { bands: true, base: [82, 138, 60] }));
  const turfMat = keep(new THREE.MeshStandardMaterial({ map: turf, roughness: 0.9, side: THREE.DoubleSide }));
  add(drape(sweep(loop, [[0, 0.03], [-W, 0.03]], { samples: lS, uScale: 46, vScale: W })), turfMat);
  const railGeo = (sweepRing, samples, d) => { const oct = []; for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2; oct.push([d + Math.cos(a) * 0.055, 1.05 + Math.sin(a) * 0.055]); } return drape(sweep(sweepRing, oct, { samples })); };
  add(railGeo(loop, lS, 0.35), M.rail, { cast: true }); add(railGeo(loop, lS, -W - 0.35), M.rail, { cast: true });
  const posts = [];
  [0.35, -W - 0.35].forEach((d) => {
    const Lr = loop.length(d);
    for (let s = 0; s < Lr; s += 3) { const p = loop.at(s, d); posts.push({ x: p.x, z: p.z, far: Math.hypot(p.x + 150, p.z) > 650 }); }
  });
  // The straight mile (Ascot): a straight strip in front of the stand, running east from the post.
  if (L.straight) {
    const x0 = L.straight.x0; const x1 = loop.corners[0].t1[0] + 2;
    const strip = new THREE.PlaneGeometry(x1 - x0, W, Math.ceil((x1 - x0) / 20), 2); strip.rotateX(-Math.PI / 2); strip.translate((x0 + x1) / 2, 0.03, L.railZ + W / 2);
    add(drape(strip), turfMat);
    [L.railZ - 0.35, L.railZ + W + 0.35].forEach((z) => {
      const rg = new THREE.CylinderGeometry(0.055, 0.055, x1 - x0, 6, 1); rg.rotateZ(Math.PI / 2); rg.translate((x0 + x1) / 2, 1.05, z);
      add(drape(rg), M.rail, { cast: true });
      for (let x = x0; x < x1; x += 3) posts.push({ x, z, far: x < -650 });
    });
  }
  const postGeo = keep(new THREE.BoxGeometry(0.08, 1.06, 0.08)); postGeo.translate(0, 0.53, 0);
  const placePost = (s) => (p, P, q, sc) => { P.set(p.x, elev(p.x, p.z), p.z); q.identity(); sc.set(s, 1, s); };
  const postMesh = instanced(postGeo, M.rail, posts.filter((p) => !p.far), placePost(1)); postMesh.castShadow = true; root.add(postMesh);
  root.add(instanced(postGeo, M.rail, posts.filter((p) => p.far), placePost(1.6)));
  // Furlong poles on the stands side, measured back from the post (Ascot: 2.5 furlong
  // run-in stated, so the third pole sits on the bend).
  if (L.furlongs?.length) {
    const poleGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 10)); poleGeo.translate(0, 1.2, 0);
    const bandGeo = keep(new THREE.CylinderGeometry(0.075, 0.075, 0.4, 10)); bandGeo.translate(0, 2.0, 0);
    const red = keep(new THREE.MeshStandardMaterial({ color: '#c4202c', roughness: 0.5 }));
    const poles = L.furlongs.filter((f) => f.x > (L.straight ? L.straight.x0 : -1e9)).map((f) => ({ x: f.x, z: L.railZ - 1.2 }));
    root.add(instanced(poleGeo, M.rail, poles, placePost(1)));
    root.add(instanced(bandGeo, red, poles, placePost(1)));
  }
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
    const y0 = elev(0, z);
    add(new THREE.CylinderGeometry(0.07, 0.08, h, 10).translate(0, h / 2, 0), M.rail, { cast: true }).position.set(0, y0, z);
    const disc = add(new THREE.CircleGeometry(0.55, 28), roundelMat, { cast: true }); disc.position.set(0, y0 + h + 0.45, z);
  });

  /* ---------- Birch fences (jumps) ---------- */
  if (jumps && L.fences.length) {
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
      const board = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.3, w)), boardMat); board.position.set(dir * -0.75, 0.15, (z0 + z1) / 2); board.rotation.z = dir * 0.35; g.add(board);
      [z0 - 0.1, z1 + 0.1].forEach((z, n) => {
        const wing = new THREE.Mesh(keep(new THREE.BoxGeometry(3.4, 1.2, 0.08)), M.rail);
        wing.position.set(dir * -0.6, 0.6, z + (n ? 0.8 : -0.8)); wing.rotation.y = (n ? -0.45 : 0.45) * dir; wing.castShadow = true; g.add(wing);
      });
      g.position.set(fx, elev(fx, L.railZ + W / 2), 0); root.add(g);
    });
  }

  /* ---------- Grandstand ---------- */
  const standS = []; for (let x = sx1; x >= sx0 - 1e-6; x -= 2) standS.push(standAt(x));
  const ssw = (prof, mat, o = {}) => add(sweep(ring, prof, { samples: standS, ...o }), mat, o);
  const inStand = (p) => p.nz < -0.5 && p.x > sx0 + 0.5 && p.x < sx1 - 0.5;
  const aisles = []; for (let x = sx1; x >= sx0; x -= 11.5) aisles.push(standAt(x));
  // Front terrace: open-air steps (standing), with seats in front of the Winning Post.
  const seatedX = [-60, 50];
  const terrace = buildTier(ring, T, {
    radials: aisles, samples: standS, frontBase: 0, seed: 3, concreteColor: [1, 1, 1],
    allow: (p) => inStand(p) && p.x > seatedX[0] && p.x < seatedX[1],
    padded: () => true, seatColor: () => [0.08, 0.2, 0.14], backWall: FL[0].floorY - rowY(T, T.rows - 1) - 0.3,
  });
  add(terrace.concrete, M.concrete, { cast: true });
  root.add(stepsMesh(terrace.steps, M.cream));
  ssw([[T.d0 + 0.05, T.y0], [T.d0 + 0.05, T.y0 + 0.95]], M.glass).renderOrder = 2;
  ssw([[T.d0, T.y0 + 0.95], [T.d0 + 0.12, T.y0 + 0.95]], M.steel);
  // Floors: balcony, glazing, interior, ceiling; a fascia band between floors.
  const boxRuns = Object.values(L.sections).filter((s) => s.kind === 'rc-room' && s.style === 'box');
  const roomRuns = Object.values(L.sections).filter((s) => s.kind === 'rc-room' && s.style !== 'box');
  const boxParts = []; const balParts = []; const tables = []; const lamps = [];
  FL.forEach((F, k) => {
    const next = FL[k + 1];
    ssw([[F.frontD, F.floorY - 0.32], [F.frontD, F.floorY], [F.glassD, F.floorY]], M.cream, { cast: true });
    ssw([[F.frontD, F.floorY - 0.32], [F.backD + 0.3, F.floorY - 0.32]], M.cream);
    ssw([[F.frontD + 0.05, F.floorY], [F.frontD + 0.05, F.floorY + 1.05]], M.glass).renderOrder = 2;
    ssw([[F.frontD - 0.02, F.floorY + 1.05], [F.frontD + 0.14, F.floorY + 1.05]], M.steel);
    ssw([[F.glassD, F.floorY], [F.glassD, F.ceilY]], M.glass).renderOrder = 2;
    ssw([[F.glassD, F.floorY], [F.backD, F.floorY]], M.carpet);
    ssw([[F.backD, F.floorY], [F.backD, F.ceilY]], M.interior, { cast: true });
    ssw([[F.frontD - 0.2, F.ceilY], [F.backD, F.ceilY]], M.cream, { cast: true });
    const topY = next ? next.floorY - 0.32 : RF.y - 0.4;
    ssw([[F.frontD - 0.2, F.ceilY - 0.2], [F.frontD - 0.2, topY]], M.navy);
    ssw([[F.frontD - 0.22, F.ceilY + 0.1], [F.frontD - 0.22, F.ceilY + 0.16]], M.gold);
    // Mullions every 1.6 m on the glazing line.
    // Box partitions along the box runs on this floor; tables in the restaurants.
    boxRuns.filter((s) => s.floor === k).forEach((s) => {
      for (let x = s.x[0]; x <= s.x[1] + 1e-6; x += 5) {
        boxParts.push({ x, y: F.floorY, z: -8 - (F.glassD + F.backD) / 2, d: F.backD - F.glassD, h: F.ceilY - F.floorY });
        balParts.push({ x, y: F.floorY, z: -8 - (F.frontD + F.glassD) / 2, d: F.glassD - F.frontD });
      }
    });
    roomRuns.filter((s) => s.floor === k).forEach((s) => {
      for (let x = s.x[0] + 1.6; x < s.x[1] - 1; x += 3.4) [F.glassD + 1.1, F.glassD + 3.8].forEach((d, n) => tables.push({ x: x + n * 1.6, y: F.floorY, z: -8 - d }));
    });
    for (let x = sx0 + 2.5; x < sx1; x += 5) lamps.push({ x, y: F.ceilY - 0.02, z: -8 - F.glassD - 2.2 });
  });
  const mullX = []; for (let x = sx1 - 1.6; x > sx0; x -= 1.6) mullX.push(x);
  const mullItems = []; FL.forEach((F) => mullX.forEach((x) => mullItems.push({ x, F })));
  const mullGeo = keep(new THREE.BoxGeometry(0.08, 1, 0.12)); mullGeo.translate(0, 0.5, 0);
  root.add(instanced(mullGeo, M.navy, mullItems, ({ x, F }, P, q, sc) => { P.set(x, F.floorY, -8 - F.glassD); q.identity(); sc.set(1, F.ceilY - F.floorY, 1); }));
  const bpGeo = keep(new THREE.BoxGeometry(0.12, 1, 1)); bpGeo.translate(0, 0.5, 0);
  const boxPartMesh = instanced(bpGeo, M.timber, boxParts, (p, P, q, sc) => { P.set(p.x, p.y, p.z); q.identity(); sc.set(1, p.h, p.d); });
  root.add(boxPartMesh);
  const blGeo = keep(new THREE.BoxGeometry(0.05, 1.9, 1)); blGeo.translate(0, 0.95, 0);
  const balPartMesh = instanced(blGeo, M.frost, balParts, (p, P, q, sc) => { P.set(p.x, p.y, p.z); q.identity(); sc.set(1, 1, p.d); });
  balPartMesh.renderOrder = 2; root.add(balPartMesh);
  const tableGeo = keep(new THREE.BoxGeometry(1.5, 0.78, 0.9)); tableGeo.translate(0, 0.39, 0);
  const tableMesh = instanced(tableGeo, M.cloth, tables, (t, P, q, sc) => { P.set(t.x, t.y, t.z); q.identity(); sc.set(1, 1, 1); });
  root.add(tableMesh);
  const lampGeo = keep(new THREE.PlaneGeometry(1.4, 0.18).rotateX(Math.PI / 2));
  root.add(instanced(lampGeo, M.lamp, lamps, (l, P, q, sc) => { P.set(l.x, l.y, l.z); q.identity(); sc.set(1, 1, 1); }));

  // Roof: a cantilevered canopy with white trusses, the back facade and the end walls.
  ssw([[RF.frontD, RF.y], [RF.backD, RF.y + 0.6]], M.roofUnder, { cast: true });
  ssw([[RF.frontD, RF.y - 0.5], [RF.frontD, RF.y + 0.15], [RF.backD, RF.y + 1.0]], M.white, { cast: true });
  ssw([[RF.backD, -3], [RF.backD, RF.y + 1.0]], M.cream, { cast: true });
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
  const capProf = [[T.d0, -3], [T.d0, 1.4], [FL[0].frontD - 0.3, FL[0].floorY - 0.3]];
  FL.forEach((F) => capProf.push([F.frontD - 0.3, F.floorY - 0.3], [F.frontD - 0.3, F.ceilY + 0.6]));
  capProf.push([RF.frontD + 2, RF.y - 0.4], [RF.frontD, RF.y + 0.2], [RF.backD, RF.y + 1.0], [RF.backD, -3]);
  [sx0, sx1].forEach((x) => { const { i, f } = standAt(x); add(endCap(ring, i, f, capProf, -3), M.cream, { cast: true }); });

  /* ---------- Infield screen, parade ring, the Village, marquees ---------- */
  const sc = L.screen;
  const scrMat = keep(new THREE.MeshBasicMaterial({ map: keep(TX.raceScreen(renderer)), color: new THREE.Color(1, 1, 1) }));
  const sy = elev(sc.x, sc.z);
  const screen = add(new THREE.PlaneGeometry(sc.w, sc.h), scrMat, { receive: false }); screen.position.set(sc.x, sy + 3.2 + sc.h / 2, sc.z); screen.rotation.y = Math.PI;
  const sframe = add(new THREE.BoxGeometry(sc.w + 0.6, sc.h + 0.6, 0.5), M.dark, { cast: true }); sframe.position.set(sc.x, sy + 3.2 + sc.h / 2, sc.z + 0.3);
  [-1, 1].forEach((s) => { const leg = add(new THREE.BoxGeometry(0.4, 3.4, 0.4), M.dark, { cast: true }); leg.position.set(sc.x + s * sc.w * 0.32, sy + 1.7, sc.z + 0.3); });
  const pr = L.parade;
  const prLawn = add(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: '#5f9446', roughness: 0.9 })));
  prLawn.scale.set(pr.rx, 1, pr.rz); prLawn.position.set(pr.x, 0.03, pr.z);
  const prPts = new THREE.EllipseCurve(pr.x, pr.z, pr.rx + 1.2, pr.rz + 1.2, 0, Math.PI * 2).getPoints(64).map((p) => new THREE.Vector3(p.x, 1.0, p.y));
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(prPts, true), 128, 0.05, 6, true), M.rail, { cast: true });
  root.add(instanced(postGeo, M.rail, prPts.filter((_, k) => k % 2 === 0), (p, P, q, s2) => { P.set(p.x, 0, p.z); q.identity(); s2.set(1, 0.95, 1); }));
  // A marquee: white canvas roof on a timber deck, open to the course.
  const marquee = (x, z, w, d, faceX, faceZ) => {
    const g = new THREE.Group(); const y0 = elev(x, z);
    const deck = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 0.5, d)), M.timber); deck.position.y = 0.25; deck.receiveShadow = true; g.add(deck);
    const roofG = new THREE.CylinderGeometry(d * 0.62, d * 0.62, w, 4, 1, true, Math.PI / 4, Math.PI / 2); roofG.rotateZ(Math.PI / 2);
    const roofM = new THREE.Mesh(keep(roofG), M.canvas); roofM.position.y = 4.0 - d * 0.62 * 0.7; roofM.scale.set(1, 0.55, 1); roofM.castShadow = true; g.add(roofM);
    const postG2 = keep(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 8)); postG2.translate(0, 2.0, 0);
    for (let u = -w / 2; u <= w / 2 + 0.01; u += w / 6) [-d / 2, d / 2].forEach((v) => { const p = new THREE.Mesh(postG2, M.white); p.position.set(u, 0, v); g.add(p); });
    g.position.set(x, y0, z); g.rotation.y = Math.atan2(faceX - x, faceZ - z) - Math.PI / 2;
    root.add(g); return g;
  };
  Object.values(L.sections).filter((s) => s.kind === 'rc-infield').forEach((s) => {
    if (s.marquee) marquee(s.at[0], s.at[1], 26, 12, s.face[0], s.face[1]);
    else {
      // Village gazebos: small white pavilions behind picket fences along the straight.
      for (let k = -3; k <= 3; k++) {
        const gx = s.at[0] + k * 14; const gz = s.at[1] + 6;
        const gz0 = elev(gx, gz);
        const roofP = add(new THREE.ConeGeometry(3.4, 2.2, 4).rotateY(Math.PI / 4), M.canvas, { cast: true }); roofP.position.set(gx, gz0 + 3.6, gz);
        [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].forEach(([a, b]) => { const p = add(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6).translate(0, 1.3, 0), M.white); p.position.set(gx + a, gz0, gz + b); });
        const fence = add(new THREE.BoxGeometry(12, 0.9, 0.06).translate(0, 0.45, 0), M.white); fence.position.set(gx, gz0, gz - 4.6);
      }
    }
  });
  if (L.village) {
    // The Village Enclosure's lawn in the centre of the course (stated), drawn as a mown area.
    const v = L.village;
    const vl = add(new THREE.PlaneGeometry(v.w, v.d).rotateX(-Math.PI / 2), keep(new THREE.MeshStandardMaterial({ color: '#6aa04d', roughness: 0.9 })));
    vl.position.set(v.x, elev(v.x, v.z) + 0.04, v.z);
  }

  /* ---------- Trees ---------- */
  const trees = [];
  const clear = (x, z) => (z > -110 && z < L.farRailZ + 25 && x > sx0 - 120 && x < sx1 + 120) || (L.village && Math.abs(x - L.village.x) < L.village.w / 2 + 20 && Math.abs(z - L.village.z) < L.village.d / 2 + 20);
  const treeAt = (x, z, s = 1) => { if (clear(x, z)) return; trees.push({ x, z, r: (3.2 + R() * 3) * s, h: (5 + R() * 5) * s, c: R() }); };
  [70, 100, 150].forEach((d, n) => {
    const Lt = loop.length(d);
    for (let s = 0; s < Lt; s += 10 + R() * 16) { if (n === 1 && R() < 0.5) continue; const p = loop.at(s, d + (R() - 0.5) * 22); treeAt(p.x, p.z, n === 2 ? 1.3 : 1); }
  });
  for (let k = 0; k < 22; k++) {
    const p = loop.at(R() * loop.length(0), -60 - R() * 300);
    const n = 6 + Math.floor(R() * 14);
    for (let j = 0; j < n; j++) treeAt(p.x + (R() - 0.5) * 60, p.z + (R() - 0.5) * 40);
  }
  for (let k = 0; k < 320; k++) { const a = R() * Math.PI * 2; const rr = 1300 + R() * 900; treeAt(-150 + Math.cos(a) * rr * 1.2, 400 + Math.sin(a) * rr, 1.6); }
  for (let x = sx0 - 60; x < sx1 + 60; x += 14 + R() * 10) trees.push({ x, z: -110 - R() * 40, r: 3.5 + R() * 3, h: 6 + R() * 5, c: R() });
  for (let k = 0; k < 9; k++) trees.push({ x: pr.x + 24 + R() * 25, z: pr.z - 15 + R() * 30, r: 3.5 + R() * 2, h: 7 + R() * 4, c: R() });
  const treeGeo = keep(new THREE.IcosahedronGeometry(1, 1)); treeGeo.translate(0, 1, 0);
  const treeMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }));
  const treeMesh = instanced(treeGeo, treeMat, trees, (t, P, q, s2) => { P.set(t.x, landY(t.x, t.z) - 0.2, t.z); q.setFromAxisAngle(up, t.c * 6); s2.set(t.r, t.h * 0.55, t.r); });
  function landY(x, z) {
    const n = 0.5 + 0.25 * Math.sin(x * 0.0041 + 1.3) * Math.cos(z * 0.0037) + 0.25 * Math.sin(x * 0.011 - z * 0.008);
    const far = Math.max(Math.abs(x + 200) - 1300, z - 1700, -z - 500);
    let h = elev(x, z) - 0.12;
    if (L.hills === 'cleeve') h += smooth(900, 3200, z) * 210 * (0.75 + 0.5 * n) + smooth(200, 1400, far) * 30 * n; else h += smooth(100, 1400, far) * (22 + 60 * n);
    return h;
  }
  const tc = new THREE.Color();
  trees.forEach((t, k) => { tc.setRGB(0.035 + t.c * 0.04, 0.07 + t.c * 0.06, 0.03 + t.c * 0.02); treeMesh.setColorAt(k, tc); });
  treeMesh.instanceColor.needsUpdate = true;
  treeMesh.castShadow = true; root.add(treeMesh);

  /* ---------- Seats and crowd ---------- */
  const slots = [...terrace.slots];
  const bandGeo = keep(mergeGeometries([terrace.bandGeo]));
  terrace.bandGeo.dispose();
  const seats = new SeatField({ slots, bandGeo, bandTexture: keep(TX.seatBand(renderer)), nearCapacity: lowPower ? 900 : 2000 });
  root.add(seats.group);
  const crowd = new Crowd({ lowPower });
  slots.forEach((s) => { if (lowPower && R() < 0.35) return; crowd.add({ x: s.x, y: s.y, z: s.z, yaw: yawFacing(-s.nx, -s.nz), seated: true, angle: s.angle, palette: 'raceday' }); });
  const facing = (x, z) => Math.atan2((x * 0.5 + 4) - x, 30 - z) + (R() - 0.5) * 0.6;
  for (let i = 0; i < T.rows; i++) {
    const z = -8 - seatD(T, i); const y = rowY(T, i);
    for (let x = sx0 + 1.5; x < sx1 - 1.5; x += 0.66 + R() * 0.55) {
      if (x > seatedX[0] - 1 && x < seatedX[1] + 1) continue;
      if (R() < 0.38) continue;
      crowd.add({ x: x + (R() - 0.5) * 0.2, y, z: z + (R() - 0.5) * 0.2, yaw: facing(x, z), seated: false, palette: 'raceday' });
    }
  }
  // Lawns in front of the stand: busiest at the rail.
  L.lawns.forEach(([a, b]) => fillFloor(crowd, {
    x0: a + 2, x1: b - 2, z0: -7.0, z1: L.railZ - 0.75, spacing: lowPower ? 1.2 : 0.9, jitter: 0.34,
    face: new THREE.Vector3(10, 0, 40), palette: 'raceday', armsUp: 0.02, phones: 0.0, seed: 17,
    skip: (x, z) => (z < 2.5 && R() < 0.5) || R() < 0.12,
  }));
  // Other enclosure lawns from the layout (Windsor, Best Mate) get people too.
  Object.values(L.sections).filter((s) => s.kind === 'rc-lawn' && (s.x[0] < sx0 || s.far)).forEach((s, n) => fillFloor(crowd, {
    x0: s.x[0] + 1, x1: s.x[1] - 1, z0: s.z[0] + 0.4, z1: s.z[1] - 0.4, spacing: lowPower ? 1.2 : 0.95, jitter: 0.35,
    face: new THREE.Vector3(0, 0, (L.railZ + L.farRailZ) / 2), palette: 'raceday', armsUp: 0, phones: 0, seed: 40 + n,
    skip: () => R() < 0.25,
  }));
  // Balcony guests along every floor (hidden in the viewer's own room, which supplies its own).
  FL.forEach((F) => {
    for (let x = sx0 + 2.5; x < sx1 - 2; x += 5) {
      const n = R() < 0.25 ? 0 : 1 + Math.floor(R() * 3);
      for (let j = 0; j < n; j++) crowd.add({ x: x - 1.6 + j * 1.2 + R() * 0.3, y: F.floorY, z: -8 - F.frontD - 0.7 - R() * 1.0, yaw: (R() - 0.5) * 0.8, seated: false, palette: 'raceday', hideZone: { x, z: -8 - F.glassD, r: 4.2 } });
    }
  });
  tables.forEach((t) => {
    [-0.7, 0.7].forEach((o) => { if (R() < 0.3) return; crowd.add({ x: t.x + o * 0.4, y: t.y, z: t.z + o, yaw: o > 0 ? Math.PI : 0, seated: true, palette: 'raceday', hideZone: { x: t.x, z: t.z, r: 16 } }); });
  });
  for (let a = 0; a < Math.PI * 2; a += 0.05 + R() * 0.06) {
    if (R() < 0.3) continue;
    const rr = 1 + (2.4 + R() * 2.2) / Math.min(pr.rx, pr.rz);
    const x = pr.x + Math.cos(a) * pr.rx * rr; const z = pr.z + Math.sin(a) * pr.rz * rr;
    crowd.add({ x, y: 0, z, yaw: Math.atan2(pr.x - x, pr.z - z), seated: false, palette: 'raceday' });
  }
  if (L.village) {
    const v = L.village;
    fillFloor(crowd, { x0: v.x - v.w / 2 + 4, x1: v.x + v.w / 2 - 4, z0: v.z - v.d / 2 + 4, z1: v.z + v.d / 2 - 4, spacing: lowPower ? 2.2 : 1.6, jitter: 0.6, y: elev(v.x, v.z), face: new THREE.Vector3(v.x, 0, -10), palette: 'raceday', armsUp: 0, phones: 0, seed: 77, skip: () => R() < 0.45 });
  }
  crowd.finalize();
  root.add(crowd.group);

  /* ---------- Horses ---------- */
  const parts = horseParts(keep);
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
  // The field comes up the straight towards the post in the course's direction of running.
  const startX = -dir * 300;
  for (let k = 0; k < 10; k++) {
    const h = makeHorse(parts, mats, k);
    h.lane = L.railZ + 3.2 + k * 1.45 + (R() - 0.5) * 0.6;
    h.x0 = startX - dir * (R() * 13 + (k % 3) * 2);
    h.base = 16.6 + R() * 1.3;
    h.k = k; h.freqJ = 2.15 + R() * 0.2; h.ph = R();
    h.group.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    field.add(h.group); horses.push(h);
  }
  const paraders = [];
  for (let k = 0; k < 4; k++) {
    const h = makeHorse(parts, mats, k + 3); const a = k * 1.6 + 0.4;
    h.group.position.set(pr.x + Math.cos(a) * (pr.rx - 1.6), 0, pr.z + Math.sin(a) * (pr.rz - 1.6));
    h.group.rotation.y = -a; poseHorse(h, 0.1 * k, 0);
    h.legs.forEach((Lg) => { Lg.upper.rotation.x *= 0.35; Lg.knee.rotation.x *= 0.4; });
    h.jock.visible = false;
    root.add(h.group); paraders.push(h);
  }
  let raceStart = 0; let raceOn = false; let raceStill = false;
  const posAt = (h, e) => h.x0 + dir * (h.base * e - (0.7 / 0.35) * (Math.cos(0.35 * e + h.k) - Math.cos(h.k)));
  const finishE = 300 / 17.2;
  function placeField(e, stillPose) {
    horses.forEach((h) => {
      const x = posAt(h, e);
      let air = 0; let lift = 0;
      if (jumps) L.fences.forEach((fx) => { const u = (dir * (x - fx) + 3.2) / 6.4; if (u > 0 && u < 1) { air = Math.sin(Math.PI * u); lift = 1.15 * air; } });
      h.group.position.set(x, elev(x, h.lane) + lift, h.lane);
      h.shadow.position.y = 0.04 - lift; h.shadow.material.opacity = 0.5;
      poseHorse(h, stillPose ? h.ph : e * h.freqJ + h.ph, air);
    });
  }

  /* ---------- Behaviour ---------- */
  const tune = {
    // Golden hour: a low sun from the viewer's right, out of frame, so warm light catches
    // the runners and the rails throw long shadows along the turf.
    sun: { day: [-0.42, 0.78, 0.46], golden: [-0.96, 0.2, -0.12], night: [0.18, 1, 0.22] },
    fogScale: 0.32,
    seatLight: 0.22,
    sky: { golden: { turbidity: 6, rayleigh: 3.2, mie: 0.0025, mieG: 0.78 } },
    hemi: { golden: ['#f6c48e', '#3a3020', 0.42] },
    fog: { golden: '#e6bf98', day: '#cbd8e4' },
    exposure: { golden: 1.0 },
  };
  const ov = L.overview;
  const cx = (sx0 + sx1) / 2;
  return {
    root, crowd, seats, indoor: false, tune,
    bounds: { center: new THREE.Vector3(cx, 10, 10), radius: (sx1 - sx0) / 2 + 60 },
    overview: { position: new THREE.Vector3(...ov.position), target: new THREE.Vector3(...ov.target), minDistance: 60, maxDistance: 900 },
    setViewer(pos) {
      // Partitions and tables near the viewer (their own room replaces them).
      const zero = new THREE.Matrix4().makeScale(0, 0, 0); const m = new THREE.Matrix4();
      boxParts.forEach((p, k) => { const near = pos && Math.abs(p.x - pos.x) < 3.2 && Math.abs(pos.y - p.y - 1.4) < 2; m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(), new THREE.Vector3(1, near ? 0 : p.h, p.d)); boxPartMesh.setMatrixAt(k, near ? zero : m); });
      boxPartMesh.instanceMatrix.needsUpdate = true;
      balParts.forEach((p, k) => { const near = pos && Math.abs(p.x - pos.x) < 3.2 && Math.abs(pos.y - p.y - 1.4) < 2; m.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, p.d)); balPartMesh.setMatrixAt(k, near ? zero : m); });
      balPartMesh.instanceMatrix.needsUpdate = true;
      tables.forEach((t, k) => {
        const near = pos && Math.abs(pos.y - t.y - 1.2) < 1.5 && Math.abs(t.x - pos.x) < 15 && pos.z < -8 - 6;
        if (near) tableMesh.setMatrixAt(k, zero); else { m.makeTranslation(t.x, t.y, t.z); tableMesh.setMatrixAt(k, m); }
      });
      tableMesh.instanceMatrix.needsUpdate = true;
    },
    play(name, t, still) {
      if (name !== 'race') return false;
      raceStart = t; raceOn = true; raceStill = !!still; field.visible = true;
      if (still) placeField(finishE, true);
      return true;
    },
    get racing() { return raceOn && !raceStill; },
    setMood(m) {
      const night = m === 'night'; const golden = m === 'golden';
      M.interior.emissiveIntensity = night ? 0.9 : golden ? 0.55 : 0.28;
      M.lamp.color.setRGB(night ? 2.6 : 1.5, night ? 2.2 : 1.3, night ? 1.6 : 0.95);
      scrMat.color.setScalar(night ? 1.25 : golden ? 1.05 : 1.15);
    },
    update(t, dt, { still }) {
      crowd.update(t, { still });
      if (raceOn && !raceStill) {
        const e = t - raceStart;
        if (still) { raceStill = true; placeField(finishE, true); }
        else if (e > finishE + 14) { field.visible = false; raceOn = false; }
        else placeField(e, false);
      }
    },
    dispose() {
      seats.dispose(); crowd.dispose();
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
