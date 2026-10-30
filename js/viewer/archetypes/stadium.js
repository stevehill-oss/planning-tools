// Stadium archetype: an illustrative modern bowl, not a model of any real venue.
//
// ARCHETYPE MODULE CONTRACT (part 2 adds hall.js and racecourse.js the same way):
//   export async function build(ctx) -> venue
//   ctx:   { renderer, mode, lowPower }
//   venue: {
//     root: THREE.Object3D,            added to the scene by the engine
//     crowd: Crowd | null,             engine forwards density, wave and viewer
//     seats: SeatField | null,         engine calls setViewer() on seat change
//     indoor: boolean,                 picks the indoor or outdoor mood presets
//     bounds: { center: Vector3, radius }   for the shadow camera
//     overview: { position, target, minDistance, maxDistance }
//     setMood(mood, info)              info = Lighting.apply() result (flood, house, bloom)
//     update(t, dt, { still })         per frame; keep it light
//     setViewer(pos)        optional   called on every seat change (hide clutter near you)
//     setView(view)         optional   'seat' or 'overview' (the arena lifts its roof off)
//     dispose()                        free anything not reachable from root
//   }
//   Static geometry should castShadow/receiveShadow; the engine renders the shadow map
//   once per mood, so nothing that moves should cast shadows.

import * as THREE from 'three';
import { LAYOUTS, rowY, tierBackD } from '../layouts.js';
import { hidePartitions, sweep, buildTier, stepsMesh, vomMeshes, SeatField, instanced, yawFacing } from '../bowl.js';
import { Crowd, fillFloor } from '../crowd.js';
import * as TX from '../textures.js';
import { createStage } from './stage.js';

const up = new THREE.Vector3(0, 1, 0);

export async function build(ctx) {
  const { renderer, mode, lowPower } = ctx;
  const L = LAYOUTS.stadium;
  const ring = L.ring;
  const root = new THREE.Group(); root.name = 'stadium';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const R = TX.rng(42);
  const concert = mode === 'concert';

  /* ---------- Materials ---------- */
  const concreteTex = keep(TX.concrete(renderer));
  const M = {
    concrete: keep(new THREE.MeshStandardMaterial({ map: concreteTex, vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide })),
    fascia: keep(new THREE.MeshStandardMaterial({ color: '#0f1d33', roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide })),
    dark: keep(new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 1, side: THREE.DoubleSide })),
    steel: keep(new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.38, metalness: 0.85 })),
    steelDark: keep(new THREE.MeshStandardMaterial({ color: '#3b4048', roughness: 0.5, metalness: 0.8 })),
    roofUnder: keep(new THREE.MeshStandardMaterial({ color: '#545a63', roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide })),
    roofTop: keep(new THREE.MeshStandardMaterial({ map: keep(TX.roofPanels(renderer)), color: '#ffffff', roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide })),
    roofClear: keep(new THREE.MeshStandardMaterial({ color: '#e8eef4', roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })),
    glass: keep(new THREE.MeshPhysicalMaterial({ color: '#a9bccd', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, envMapIntensity: 1.1, side: THREE.DoubleSide, depthWrite: false })),
    rail: keep(new THREE.MeshStandardMaterial({ color: '#c3c8cf', roughness: 0.3, metalness: 0.9 })),
    boxInterior: keep(new THREE.MeshStandardMaterial({ color: '#3a2e25', emissive: new THREE.Color('#ffcf9a'), emissiveIntensity: 0.25, roughness: 0.8, side: THREE.DoubleSide })),
    carpet: keep(new THREE.MeshStandardMaterial({ color: '#2b2f3c', roughness: 1, side: THREE.DoubleSide })),
    flood: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) })),
    step: keep(new THREE.MeshStandardMaterial({ color: '#a7a8a3', roughness: 0.9 })),
    white: keep(new THREE.MeshStandardMaterial({ color: '#f5f5f2', roughness: 0.4 })),
  };

  /* ---------- Ground and pitch ---------- */
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(600, 600)), keep(new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 1 })));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
  root.add(ground);

  const pw = ring.hx * 2 + 4; const ph = ring.hz * 2 + 4;
  const pitchTex = keep(TX.pitch(renderer, { w: pw, h: ph }));
  const pitch = new THREE.Mesh(keep(new THREE.PlaneGeometry(pw, ph)), keep(new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95, metalness: 0 })));
  pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true;
  root.add(pitch);

  /* ---------- Lower tier ---------- */
  const radials = ring.radials({ straightEvery: 8.5, cornerSplits: 3 });
  const navy = [0.07, 0.1, 0.2];
  const inPremium = (s) => s.z < -30 && Math.abs(s.x) < 24 && s.row >= 4 && s.row <= 16;
  const lower = buildTier(ring, L.tiers.lower, {
    radials, seed: 5, frontBase: 0,
    vom: { every: 2, rows: [8, 10] },
    padded: inPremium,
    seatColor: (s) => (inPremium(s) ? [0.16, 0.16, 0.18] : navy),
  });
  const lowerMesh = new THREE.Mesh(lower.concrete, M.concrete); lowerMesh.castShadow = true; lowerMesh.receiveShadow = true;
  root.add(lowerMesh);
  root.add(stepsMesh(lower.steps, M.step));
  root.add(vomMeshes(lower.vomBlocks, keep(M.concrete.clone()), M.dark));

  // Front wall fascia (painted).
  const lt = L.tiers.lower;
  const front = new THREE.Mesh(keep(sweep(ring, [[lt.d0 - 0.02, 0], [lt.d0 - 0.02, lt.y0]])), M.fascia);
  front.receiveShadow = true; root.add(front);

  /* ---------- Hospitality level: balcony seats, glass boxes ---------- */
  const B = L.box;
  const balcony = { id: 'balcony', d0: B.d0, rows: 2, depth: 1.0, y0: B.balconyY[0], rise: B.balconyY[1] - B.balconyY[0], curve: 0 };
  const bal = buildTier(ring, balcony, {
    radials, seed: 9, frontBase: rowY(lt, lt.rows - 1), padded: () => true, seatColor: () => [0.2, 0.17, 0.15],
  });
  const balMesh = new THREE.Mesh(bal.concrete, M.concrete); balMesh.castShadow = true; balMesh.receiveShadow = true;
  root.add(balMesh);
  // Step up into the box, box floor, glass, interior backdrop, ceiling.
  root.add(new THREE.Mesh(keep(sweep(ring, [[B.glassD, B.balconyY[1]], [B.glassD, B.floorY], [B.backD, B.floorY]], { shade: [0.6, 0.8] })), M.carpet));
  const glass = new THREE.Mesh(keep(sweep(ring, [[B.glassD, B.floorY], [B.glassD, B.glassTop]])), M.glass);
  glass.renderOrder = 2; root.add(glass);
  const balRail = new THREE.Mesh(keep(sweep(ring, [[B.d0 + 0.05, B.balconyY[0]], [B.d0 + 0.05, B.balconyY[0] + 0.9]])), M.glass);
  balRail.renderOrder = 2; root.add(balRail);
  root.add(new THREE.Mesh(keep(sweep(ring, [[B.backD, B.floorY], [B.backD, B.glassTop + 0.2]])), M.boxInterior));
  root.add(new THREE.Mesh(keep(sweep(ring, [[B.glassD - 0.2, B.glassTop + 0.15], [B.backD, B.glassTop + 0.15]])), M.carpet));
  // Box partitions every few metres along the ring.
  const partitions = [];
  const Lg = ring.length(B.glassD);
  for (let s = 0; s < Lg; s += 5.2) partitions.push(ring.at(s, (B.glassD + B.backD) / 2));
  const partGeo = keep(new THREE.BoxGeometry(0.1, B.glassTop - B.floorY, B.backD - B.glassD)); partGeo.translate(0, (B.glassTop - B.floorY) / 2, 0);
  const partMesh = instanced(partGeo, keep(new THREE.MeshStandardMaterial({ color: '#4a3526', roughness: 0.6 })), partitions, (p, P, q, sc) => {
    P.set(p.x, B.floorY, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)); sc.set(1, 1, 1);
  });
  root.add(partMesh);
  const partY = B.floorY;
  // Warm interior glow points (reads as lit boxes from across the stadium).
  const lampGeo = keep(new THREE.PlaneGeometry(0.5, 0.12));
  const lamps = [];
  for (let s = 2.6; s < Lg; s += 2.6) lamps.push(ring.at(s, B.glassD + 1.5));
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.3) }));
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  root.add(instanced(lampGeo, lampMat, lamps, (p, P, q, sc) => {
    P.set(p.x, B.glassTop + 0.13, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)).multiply(flat); sc.set(1, 1, 1);
  }));

  /* ---------- Upper tier ---------- */
  const ut = L.tiers.upper;
  const upper = buildTier(ring, ut, {
    radials, seed: 13, frontBase: B.glassTop + 0.15, backWall: 8,
    vom: { every: 3, rows: [6, 8] }, seatColor: () => navy,
  });
  const upperMesh = new THREE.Mesh(upper.concrete, M.concrete); upperMesh.castShadow = true; upperMesh.receiveShadow = true;
  root.add(upperMesh);
  root.add(stepsMesh(upper.steps, M.step));
  root.add(vomMeshes(upper.vomBlocks, M.concrete, M.dark));
  // Soffit under the upper front (over the box glass) and a fascia LED ribbon.
  root.add(new THREE.Mesh(keep(sweep(ring, [[ut.d0, B.glassTop + 0.15], [B.glassD + 0.6, B.glassTop + 0.15]])), M.fascia));
  const ribbonTex = keep(TX.ledBoards(renderer, concert ? 'concert' : 'football'));
  const ribbonMat = keep(new THREE.MeshBasicMaterial({ map: ribbonTex, color: new THREE.Color(0.85, 0.85, 0.85) }));
  const ribbon = new THREE.Mesh(keep(sweep(ring, [[ut.d0 - 0.03, B.glassTop + 0.35], [ut.d0 - 0.03, ut.y0 - 0.1]], { uScale: 60, vScale: (ut.y0 - 0.1) - (B.glassTop + 0.35), uFlip: true })), ribbonMat);
  root.add(ribbon);
  const upRail = new THREE.Mesh(keep(sweep(ring, [[ut.d0 + 0.1, ut.y0], [ut.d0 + 0.1, ut.y0 + 1.0]])), M.glass);
  upRail.renderOrder = 2; root.add(upRail);
  // Aisle handrails down the steep upper tier.
  const railItems = radials.map((r) => {
    const a = ring.point(r.i, r.f, ut.d0 + 0.6); const b = ring.point(r.i, r.f, tierBackD(ut) - 0.4);
    return { a: new THREE.Vector3(a.x, rowY(ut, 0) + 0.95, a.z), b: new THREE.Vector3(b.x, rowY(ut, ut.rows - 1) + 0.95, b.z) };
  });
  const railGeo = keep(new THREE.CylinderGeometry(0.025, 0.025, 1, 6));
  root.add(instanced(railGeo, M.rail, railItems, (r, P, q, sc) => {
    const d = r.b.clone().sub(r.a); P.copy(r.a).addScaledVector(d, 0.5); q.setFromUnitVectors(up, d.clone().normalize()); sc.set(1, d.length(), 1);
  }));

  /* ---------- Roof ---------- */
  const RF = L.roof;
  const clearFrom = 9;
  const yAt = (d) => RF.frontY + (RF.backY - RF.frontY) * ((d - RF.frontD) / (RF.backD - RF.frontD));
  const underOpaque = new THREE.Mesh(keep(sweep(ring, [[RF.backD, RF.backY], [clearFrom, yAt(clearFrom)]], { uScale: 8, vScale: 8 })), M.roofUnder);
  underOpaque.castShadow = true; underOpaque.receiveShadow = true; root.add(underOpaque);
  const clear = new THREE.Mesh(keep(sweep(ring, [[clearFrom, yAt(clearFrom)], [RF.frontD, RF.frontY]])), M.roofClear);
  clear.castShadow = true; root.add(clear);
  root.add(new THREE.Mesh(keep(sweep(ring, [[RF.frontD, RF.frontY], [RF.frontD, RF.frontY + 1.3], [RF.backD, RF.backY + RF.depthBack]], { shade: [0.9, 1], uScale: 8, vScale: 40 })), M.roofTop));
  // Back cladding from the top of the upper tier to the roof, and the outer facade.
  root.add(new THREE.Mesh(keep(sweep(ring, [[RF.backD, rowY(ut, ut.rows - 1)], [RF.backD, RF.backY + RF.depthBack]])), M.fascia));
  const facadeMat = keep(new THREE.MeshStandardMaterial({ color: '#1d2a3c', roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }));
  const facade = new THREE.Mesh(keep(sweep(ring, [[RF.backD + 2, 0], [RF.backD + 2, RF.backY + RF.depthBack], [RF.backD - 0.5, RF.backY + RF.depthBack]], { shade: [1, 0.8] })), facadeMat);
  facade.castShadow = true; facade.receiveShadow = true; root.add(facade);
  // Rafters (trusses) under the roof: a top chord, bottom chord and lacing per radial.
  const rafterPts = ring.samples({ straightStep: 7.5, cornerSteps: 6 }).slice(0, -1);
  const chords = [];
  rafterPts.forEach(({ i, f }) => {
    const pb = ring.point(i, f, RF.backD - 0.5); const pf = ring.point(i, f, RF.frontD + 0.4);
    const top0 = new THREE.Vector3(pb.x, RF.backY - 0.05, pb.z); const top1 = new THREE.Vector3(pf.x, RF.frontY - 0.05, pf.z);
    const bot0 = new THREE.Vector3(pb.x, RF.backY - 2.6, pb.z); const bot1 = new THREE.Vector3(pf.x, RF.frontY - 0.7, pf.z);
    chords.push({ a: top0, b: top1, r: 0.18 }, { a: bot0, b: bot1, r: 0.16 });
    const n = 7;
    for (let k = 0; k < n; k++) {
      const u0 = k / n; const u1 = (k + 1) / n;
      const t0 = top0.clone().lerp(top1, u0); const b1 = bot0.clone().lerp(bot1, u1);
      chords.push({ a: t0, b: b1, r: 0.08 });
      chords.push({ a: b1, b: top0.clone().lerp(top1, u1), r: 0.08 });
    }
  });
  const chordGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const chordMesh = instanced(chordGeo, M.steel, chords, (c, P, q, sc) => {
    const d = c.b.clone().sub(c.a); P.copy(c.a).addScaledVector(d, 0.5); q.setFromUnitVectors(up, d.clone().normalize()); sc.set(c.r, d.length(), c.r);
  });
  chordMesh.castShadow = true; root.add(chordMesh);
  // Floodlight strip along the leading edge, with fixtures and glare points.
  const floodStrip = new THREE.Mesh(keep(sweep(ring, [[RF.frontD + 0.3, RF.frontY - 0.25], [RF.frontD + 2.4, RF.frontY - 0.2]])), M.flood);
  root.add(floodStrip);
  const fixtures = [];
  const Lf = ring.length(RF.frontD + 1.2);
  for (let s = 0; s < Lf; s += 3.2) fixtures.push(ring.at(s, RF.frontD + 1.2));
  const fixGeo = keep(new THREE.BoxGeometry(0.9, 0.5, 0.7));
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6);
  root.add(instanced(fixGeo, M.steelDark, fixtures, (p, P, q, sc) => {
    P.set(p.x, RF.frontY - 0.55, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)).multiply(tilt); sc.set(1, 1, 1);
  }));
  const glarePos = new Float32Array(fixtures.length * 3);
  fixtures.forEach((p, k) => glarePos.set([p.x - p.nx * 0.4, RF.frontY - 0.8, p.z - p.nz * 0.4], k * 3));
  const glareGeo = keep(new THREE.BufferGeometry()); glareGeo.setAttribute('position', new THREE.BufferAttribute(glarePos, 3));
  const glareMat = keep(new THREE.PointsMaterial({ map: keep(TX.glow(64)), size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2, 2, 2.1) }));
  const glare = new THREE.Points(glareGeo, glareMat); root.add(glare);

  /* ---------- Pitch furniture (football) ---------- */
  let ledMat = null; let ledTex = null;
  if (!concert) {
    // LED advertising boards around the pitch.
    ledTex = keep(TX.ledBoards(renderer));
    ledMat = keep(new THREE.MeshBasicMaterial({ map: ledTex, color: new THREE.Color(1, 1, 1) }));
    const dB = -4.2;
    const boards = new THREE.Mesh(keep(sweep(ring, [[dB, 0.05], [dB + 0.12, 0.95]], { uScale: 34, vScale: 0.9, uFlip: true })), ledMat);
    root.add(boards);
    const boardBack = new THREE.Mesh(keep(sweep(ring, [[dB + 0.1, 0], [dB + 0.25, 0], [dB + 0.25, 0.97], [dB + 0.13, 0.97]])), M.fascia);
    boardBack.castShadow = true; root.add(boardBack);

    // Goals with nets.
    const netTex = keep(TX.net(renderer));
    netTex.repeat.set(30, 10);
    const netMat = keep(new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }));
    const postGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 2.44, 12));
    const barGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 7.44, 12));
    const depth = 2.0;
    const backNet = keep(new THREE.PlaneGeometry(7.32, 2.0)); const topNet = keep(new THREE.PlaneGeometry(depth, 7.32)); const sideNet = keep(new THREE.PlaneGeometry(depth, 2.44));
    [-1, 1].forEach((side) => {
      const g = new THREE.Group();
      const x = side * L.pitch.hx;
      [-3.66, 3.66].forEach((z) => { const p = new THREE.Mesh(postGeo, M.white); p.position.set(x, 1.22, z); p.castShadow = true; g.add(p); });
      const bar = new THREE.Mesh(barGeo, M.white); bar.rotation.x = Math.PI / 2; bar.position.set(x, 2.44, 0); bar.castShadow = true; g.add(bar);
      const back = new THREE.Mesh(backNet, netMat); back.position.set(x + side * depth, 1.0, 0); back.rotation.y = Math.PI / 2;
      const topN = new THREE.Mesh(topNet, netMat); topN.rotation.x = -Math.PI / 2; topN.position.set(x + side * depth / 2, 2.3, 0); topN.rotation.z = side * 0.07;
      [-3.66, 3.66].forEach((z) => { const sN = new THREE.Mesh(sideNet, netMat); sN.position.set(x + side * depth / 2, 1.2, z); g.add(sN); });
      g.add(back, topN);
      root.add(g);
    });
    // Corner flags.
    const flagPole = keep(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6)); const flagGeo = keep(new THREE.PlaneGeometry(0.4, 0.3));
    const flagMat = keep(new THREE.MeshStandardMaterial({ color: '#f2c230', side: THREE.DoubleSide }));
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
      const p = new THREE.Mesh(flagPole, M.white); p.position.set(sx * L.pitch.hx, 0.75, sz * L.pitch.hz); root.add(p);
      const fl = new THREE.Mesh(flagGeo, flagMat); fl.position.set(sx * L.pitch.hx + 0.2, 1.35, sz * L.pitch.hz); root.add(fl);
    });

    // Tunnel with an extendable canopy, and two dugouts on the main (-z) side.
    const zFront = -(ring.hz + lt.d0);
    const tunnelMouth = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.2, 2.6)), M.dark);
    tunnelMouth.position.set(0, 1.3, zFront + 0.03); root.add(tunnelMouth);
    const canopyGeo = keep(new THREE.CylinderGeometry(1.55, 1.55, 5.5, 20, 1, true, -Math.PI / 2, Math.PI));
    const canopy = new THREE.Mesh(canopyGeo, keep(new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.88 })));
    canopy.rotation.set(-Math.PI / 2, 0, 0);
    canopy.position.set(0, 0.1, zFront + 2.75);
    canopy.castShadow = true; root.add(canopy);
    // Dugouts: a tinted quarter shell over a padded bench, open to the pitch.
    const dugMat = keep(new THREE.MeshPhysicalMaterial({ color: '#6f8297', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    const dugSeat = keep(new THREE.MeshStandardMaterial({ color: '#1c2333', roughness: 0.6 }));
    const dugFrame = keep(new THREE.MeshStandardMaterial({ color: '#20252d', roughness: 0.4, metalness: 0.7 }));
    const shellGeo = keep(new THREE.CylinderGeometry(1.8, 1.8, 9, 16, 1, true, Math.PI / 2, Math.PI / 2));
    const postG = keep(new THREE.BoxGeometry(0.06, 2.0, 0.06)); const baseG = keep(new THREE.BoxGeometry(9, 0.2, 2.2)); const seatG = keep(new THREE.BoxGeometry(0.75, 0.55, 0.6));
    [-11, 11].forEach((x) => {
      const g = new THREE.Group();
      // Quarter cylinder: back wall curving over into a roof, axis along the touchline.
      const shell = new THREE.Mesh(shellGeo, dugMat);
      shell.rotation.set(0, 0, Math.PI / 2); shell.position.set(0, 0.2, 0.6); g.add(shell);
      [-4.5, 4.5].forEach((ex) => [0.55, -1.2].forEach((ez) => { const e = new THREE.Mesh(postG, dugFrame); e.position.set(ex, 1.0, ez); g.add(e); }));
      const base = new THREE.Mesh(baseG, M.fascia); base.position.set(0, 0.1, -0.2); g.add(base);
      for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(seatG, dugSeat); s.position.set(-4 + k, 0.5, -0.6); g.add(s); }
      g.position.set(x, 0, -L.pitch.hz - 2.6);
      root.add(g);
    });

    // Corner big screens hanging from the roof edge.
    const scrTex = keep(TX.bigScreen(renderer, 'football'));
    const scrMat = keep(new THREE.MeshBasicMaterial({ map: scrTex, color: new THREE.Color(1.1, 1.1, 1.1) }));
    [1, 5].forEach((seg) => {
      const p = ring.point(seg, 0.5, 2.5);
      const g = new THREE.Group();
      const scr = new THREE.Mesh(keep(new THREE.PlaneGeometry(12, 6.75)), scrMat);
      const frameM = new THREE.Mesh(keep(new THREE.BoxGeometry(12.6, 7.3, 0.6)), M.steelDark); frameM.position.z = -0.32;
      g.add(scr, frameM);
      g.position.set(p.x, RF.frontY - 5.2, p.z);
      g.rotation.y = yawFacing(-p.nx, -p.nz);
      g.rotateX(0.12);
      root.add(g);
    });
  }

  /* ---------- Concert staging ---------- */
  let stage = null;
  if (concert) {
    const floorTex = keep(TX.floorPanels(renderer));
    floorTex.repeat.set(22, 14);
    const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(L.pitch.hx * 2 + 6, L.pitch.hz * 2 + 6)), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 })));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true; root.add(floor);
    stage = createStage({ L: L.stage, scale: 1, lowPower, keep });
    root.add(stage.group);
  }

  /* ---------- Seats and crowd ---------- */
  const slots = [...lower.slots, ...bal.slots, ...upper.slots];
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const bandGeo = keep(mergeGeometries([lower.bandGeo, bal.bandGeo, upper.bandGeo]));
  [lower.bandGeo, bal.bandGeo, upper.bandGeo].forEach((g) => g.dispose());
  const seats = new SeatField({ slots, bandGeo, bandTexture: keep(TX.seatBand(renderer)), nearCapacity: lowPower ? 1200 : 3500 });
  root.add(seats.group);

  const crowd = new Crowd({ lowPower });
  const awayArc = (s) => s.x > 40 && s.z > 12 && s.tier !== 'balcony';
  slots.forEach((s) => {
    if (concert && s.x > ring.hx - 4 && Math.abs(s.z) < ring.hz + 30) return; // seats behind the stage are not sold
    const keepV = R();
    if (lowPower && R() < 0.35) return;
    const pal = concert ? 'concert' : s.tier === 'balcony' || s.padded ? 'smart' : awayArc(s) ? 'away' : 'football';
    crowd.add({ x: s.x, y: s.y, z: s.z, yaw: yawFacing(-s.nx, -s.nz), seated: true, angle: s.angle, palette: pal, keep: s.tier === 'balcony' ? keepV * 1.6 : keepV, armsUp: concert && R() < 0.12 ? 0.5 : 0 });
  });
  if (concert) {
    const st = L.stage;
    fillFloor(crowd, {
      x0: -L.pitch.hx + 8, x1: st.frontX - 3, z0: -L.pitch.hz + 2, z1: L.pitch.hz - 2, spacing: lowPower ? 0.95 : 0.7,
      face: new THREE.Vector3(st.backX, 0, 0), palette: 'concert', armsUp: 0.22, phones: 0.07, seed: 31,
      skip: (x, z) => (Math.abs(x + 6) < 3 && Math.abs(z) < 4) || (x > st.frontX - 6 && Math.abs(z) < 4), // mixing desk and a pit gap
    });
  }
  crowd.finalize();
  root.add(crowd.group);

  /* ---------- Players and ball (football) ---------- */
  let team = null; let ball = null; const playerHome = [];
  if (!concert) {
    team = new Crowd({ forceNear: true });
    const form = [[-50, 0], [-36, -20], [-38, -7], [-38, 7], [-36, 20], [-20, -14], [-22, 0], [-20, 14], [-6, -22], [-4, 0], [-6, 22]];
    form.forEach(([x, z], k) => { playerHome.push([x * 0.9 + 4, z]); team.add({ x: x * 0.9 + 4, y: 0, z, yaw: Math.PI / 2, seated: false, cloth: k === 0 ? '#2fa84f' : '#f4f4f2' }); });
    form.forEach(([x, z], k) => { playerHome.push([-x * 0.9 - 2, -z + 1.5]); team.add({ x: -x * 0.9 - 2, y: 0, z: -z, yaw: -Math.PI / 2, seated: false, cloth: k === 0 ? '#f2c230' : '#b5202f' }); });
    playerHome.push([6, 10]); team.add({ x: 6, y: 0, z: 10, yaw: 0, seated: false, cloth: '#121418' });
    team.finalize();
    root.add(team.group);
    ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 16, 12)), M.white);
    root.add(ball);
  }

  /* ---------- Behaviour ---------- */
  const m4 = new THREE.Matrix4(); const qq = new THREE.Quaternion(); const pp = new THREE.Vector3(); const ss = new THREE.Vector3(1, 1, 1);
  function updatePlayers(t, still) {
    if (!team) return;
    const mesh = team.meshes.tn;
    const T = still ? 0 : t;
    // Play drifts slowly up and down the pitch; each player follows with their own lag.
    const flow = Math.sin(T * 0.08) * 14; const lat = Math.sin(T * 0.13) * 9;
    const bx = flow + Math.sin(T * 0.5) * 6; const bz = lat + Math.cos(T * 0.37) * 5;
    playerHome.forEach(([hx, hz], k) => {
      const isKeeper = k === 0 || k === 11;
      const follow = isKeeper ? 0.15 : 0.55;
      const x = hx + flow * follow + Math.sin(T * 0.6 + k) * 1.2;
      const z = hz + lat * follow * 0.6 + Math.cos(T * 0.5 + k * 1.7) * 1.2;
      const yaw = Math.atan2(bx - x, bz - z);
      pp.set(x, 0, z); qq.setFromAxisAngle(up, yaw); m4.compose(pp, qq, ss);
      mesh.setMatrixAt(k, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    ball.position.set(bx, 0.11 + Math.abs(Math.sin(T * 1.7)) * 0.25 * (still ? 0 : 1), bz);
    ball.rotation.x = T * 3;
  }
  updatePlayers(0, true);

  return {
    root,
    crowd,
    seats,
    indoor: false,
    setViewer: (pos) => hidePartitions(partMesh, partitions, partY, pos),
    bounds: { center: new THREE.Vector3(0, 12, 0), radius: 112 },
    overview: { position: new THREE.Vector3(-34, 182, 104), target: new THREE.Vector3(concert ? 10 : 0, 0, 6), minDistance: 60, maxDistance: 300 },
    setMood(m, info) {
      const flood = info.flood ?? 0;
      M.flood.color.setScalar(0.5 + flood * 3.5).multiply(new THREE.Color('#f4f7ff'));
      glare.visible = flood > 0.3;
      glareMat.color.setScalar(1.2 + flood * 1.6);
      glareMat.opacity = Math.min(1, flood);
      const night = m === 'night';
      M.boxInterior.emissiveIntensity = night ? 0.9 : m === 'golden' ? 0.5 : 0.22;
      lampMat.color.setRGB(night ? 2.6 : 1.4, night ? 2.1 : 1.15, night ? 1.5 : 0.8);
      ribbonMat.color.setScalar(night ? 1.3 : 0.95);
      ledMat?.color.setScalar(night ? 1.35 : 1.0);
      stage?.setMood(m);
    },
    update(t, dt, { still }) {
      crowd.update(t, { still, bounce: concert ? 1 : 0, beat: concert ? 4.2 : 2.2 });
      team?.update(t, { still });
      updatePlayers(t, still);
      if (!still) {
        if (ledTex) ledTex.offset.x = (t * 0.012) % 1;
        ribbonTex.offset.x = (-t * 0.006) % 1;
      }
      stage?.update(t, dt, still);
    },
    dispose() {
      seats.dispose(); crowd.dispose(); team?.dispose(); stage?.dispose();
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
