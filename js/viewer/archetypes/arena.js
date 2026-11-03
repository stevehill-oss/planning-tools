// Arena builder: The Arena London, AO Arena and Co-op Live, each from its own layout in
// js/viewer/layouts.js (block numbers, levels and stage end from the research; bowl size,
// rows and heights modelled). Lower tier, a band of front seats with glass suites behind,
// a steep upper tier,
// a dark roof with rigging, a centre-hung screen cluster, and two modes:
//   concert  end stage at +x with LED wall, light rig and beams, standing floor crowd
//   boxing   a lit ring at the centre with ropes, posts and an overhead ring light,
//            ringside seats on the floor
// Module contract: see the header of stadium.js.

import * as THREE from 'three';
import { rowY, tierBackD, tierBuildOpts } from '../layouts.js';
import { seatStyleFor } from '../seatplan.js';
import { hidePartitions, sweep, buildTier, stepsMesh, vomMeshes, SeatField, instanced, yawFacing, arcSamples } from '../bowl.js';
import { Crowd, fillFloor } from '../crowd.js';
import * as TX from '../textures.js';
import { createStage } from './stage.js';

const up = new THREE.Vector3(0, 1, 0);

export async function build(ctx) {
  const { renderer, mode, lowPower } = ctx;
  const L = ctx.layout;
  const ring = L.ring;
  const boxing = mode === 'boxing';
  const root = new THREE.Group(); root.name = 'arena';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const R = TX.rng(77);

  /* ---------- Materials ---------- */
  const M = {
    concrete: keep(new THREE.MeshStandardMaterial({ map: keep(TX.concrete(renderer, [120, 120, 124])), vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })),
    fascia: keep(new THREE.MeshStandardMaterial({ color: '#0d1420', roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide })),
    dark: keep(new THREE.MeshStandardMaterial({ color: '#141619', roughness: 1, side: THREE.DoubleSide })),
    roof: keep(new THREE.MeshStandardMaterial({ color: '#0a0b0e', roughness: 0.95, side: THREE.DoubleSide })),
    wall: keep(new THREE.MeshStandardMaterial({ color: '#15181e', roughness: 0.9, side: THREE.DoubleSide })),
    truss: keep(new THREE.MeshStandardMaterial({ color: '#2e3238', roughness: 0.45, metalness: 0.85 })),
    glass: keep(new THREE.MeshPhysicalMaterial({ color: '#a9bccd', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, envMapIntensity: 1.1, side: THREE.DoubleSide, depthWrite: false })),
    suite: keep(new THREE.MeshStandardMaterial({ color: '#3a2e25', emissive: new THREE.Color('#ffcf9a'), emissiveIntensity: 0.35, roughness: 0.8, side: THREE.DoubleSide })),
    carpet: keep(new THREE.MeshStandardMaterial({ color: '#23262f', roughness: 1, side: THREE.DoubleSide })),
    step: keep(new THREE.MeshStandardMaterial({ color: '#8d8f93', roughness: 0.9 })),
    rail: keep(new THREE.MeshStandardMaterial({ color: '#c3c8cf', roughness: 0.3, metalness: 0.9 })),
    lamp: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2) })),
  };

  /* ---------- Floor ---------- */
  const fw = (ring.hx + 2) * 2; const fh = (ring.hz + 2) * 2;
  const floorTex = keep(TX.arenaFloor(renderer)); floorTex.repeat.set(10, 7);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(fw + 80, fh + 80)), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.1 })));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);

  /* ---------- Tiers ---------- */
  // Aisles at the block edges of js/data/seatmaps.js, so these are the seat map's seats.
  const opt = (id) => tierBuildOpts(L, id);
  const radials = opt('upper').radials(0);
  const lt = L.tiers.lower; const ut = L.tiers.upper; const S = L.suite;
  const seatCol = [0.11, 0.09, 0.12];
  // Padded only where a product's seat type says so (stated); no armrests are stated here.
  const style = seatStyleFor(L.venueId, mode);
  const padded = (s) => style(s).padded; const arms = (s) => style(s).arms;
  const lower = buildTier(ring, lt, { ...opt('lower'), seed: 3, frontBase: 0, padded, arms, seatColor: (s) => (padded(s) ? [0.07, 0.07, 0.08] : seatCol) });
  const lowerMesh = new THREE.Mesh(lower.concrete, M.concrete); lowerMesh.castShadow = true; lowerMesh.receiveShadow = true; root.add(lowerMesh);
  root.add(stepsMesh(lower.steps, M.step));
  root.add(vomMeshes(lower.vomBlocks, M.concrete, M.dark));

  // LED ribbon on the lower front wall.
  const ribbonTex = keep(TX.ledBoards(renderer, boxing ? 'boxing' : 'concert'));
  const ribbonMat = keep(new THREE.MeshBasicMaterial({ map: ribbonTex, color: new THREE.Color(1, 1, 1) }));
  root.add(new THREE.Mesh(keep(sweep(ring, [[lt.d0 - 0.03, 0.15], [lt.d0 - 0.03, lt.y0 - 0.1]], { uScale: 40, vScale: lt.y0 - 0.25, uFlip: true })), ribbonMat));

  const suiteSeats = L.tiers.band;
  const suites = buildTier(ring, suiteSeats, { ...opt('band'), seed: 6, frontBase: rowY(lt, lt.rows - 1), padded, arms, seatColor: () => [0.18, 0.15, 0.13] });
  const suitesMesh = new THREE.Mesh(suites.concrete, M.concrete); suitesMesh.castShadow = true; suitesMesh.receiveShadow = true; root.add(suitesMesh);
  root.add(new THREE.Mesh(keep(sweep(ring, [[S.glassD, S.seatY[1]], [S.glassD, S.floorY], [S.backD, S.floorY]])), M.carpet));
  const sg = new THREE.Mesh(keep(sweep(ring, [[S.glassD, S.floorY], [S.glassD, S.glassTop]])), M.glass); sg.renderOrder = 2; root.add(sg);
  const sr = new THREE.Mesh(keep(sweep(ring, [[S.d0 + 0.05, S.seatY[0]], [S.d0 + 0.05, S.seatY[0] + 0.9]])), M.glass); sr.renderOrder = 2; root.add(sr);
  root.add(new THREE.Mesh(keep(sweep(ring, [[S.backD, S.floorY], [S.backD, S.glassTop + 0.2]])), M.suite));
  root.add(new THREE.Mesh(keep(sweep(ring, [[S.glassD - 0.2, S.glassTop + 0.15], [S.backD, S.glassTop + 0.15]])), M.carpet));
  const parts = []; const Lg = ring.length(S.glassD);
  for (let s = 0; s < Lg; s += 4.6) parts.push(ring.at(s, (S.glassD + S.backD) / 2));
  const partGeo = keep(new THREE.BoxGeometry(0.1, S.glassTop - S.floorY, S.backD - S.glassD)); partGeo.translate(0, (S.glassTop - S.floorY) / 2, 0);
  const partitions = parts;
  const partMesh = instanced(partGeo, keep(new THREE.MeshStandardMaterial({ color: '#4a3526', roughness: 0.6 })), parts, (p, P, q, sc) => { P.set(p.x, S.floorY, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)); sc.set(1, 1, 1); });
  root.add(partMesh);
  const partY = S.floorY;

  const terraces = L.terraces || [];
  const upper = buildTier(ring, ut, { ...opt('upper'), seed: 8, frontBase: S.glassTop + 0.15, backWall: terraces.length ? 0.6 : L.roofY - rowY(ut, ut.rows - 1), padded, arms, seatColor: () => seatCol });
  const upperMesh = new THREE.Mesh(upper.concrete, M.concrete); upperMesh.castShadow = true; upperMesh.receiveShadow = true; root.add(upperMesh);
  root.add(stepsMesh(upper.steps, M.step));
  root.add(vomMeshes(upper.vomBlocks, M.concrete, M.dark));
  root.add(new THREE.Mesh(keep(sweep(ring, [[ut.d0, S.glassTop + 0.15], [S.glassD + 0.6, S.glassTop + 0.15]])), M.fascia));
  const ribbon2 = new THREE.Mesh(keep(sweep(ring, [[ut.d0 - 0.03, S.glassTop + 0.3], [ut.d0 - 0.03, ut.y0 - 0.1]], { uScale: 50, vScale: ut.y0 - 0.1 - (S.glassTop + 0.3), uFlip: true })), ribbonMat);
  root.add(ribbon2);
  const ur = new THREE.Mesh(keep(sweep(ring, [[ut.d0 + 0.1, ut.y0], [ut.d0 + 0.1, ut.y0 + 1.0]])), M.glass); ur.renderOrder = 2; root.add(ur);
  const railItems = radials.map((r) => {
    const a = ring.point(r.i, r.f, ut.d0 + 0.6); const b = ring.point(r.i, r.f, tierBackD(ut) - 0.4);
    return { a: new THREE.Vector3(a.x, rowY(ut, 0) + 0.95, a.z), b: new THREE.Vector3(b.x, rowY(ut, ut.rows - 1) + 0.95, b.z) };
  });
  root.add(instanced(keep(new THREE.CylinderGeometry(0.025, 0.025, 1, 6)), M.rail, railItems, (r, P, q, sc) => {
    const d = r.b.clone().sub(r.a); P.copy(r.a).addScaledVector(d, 0.5); q.setFromUnitVectors(up, d.clone().normalize()); sc.set(1, d.length(), 1);
  }));

  /* ---------- Level 4 terraces (Co-op Live: lounges on the north and south sides, stated) ---------- */
  if (terraces.length) {
    const topY = rowY(ut, ut.rows - 1) + 0.5; const tD = tierBackD(ut) + 0.3;
    const Lr = ring.length(0);
    // Back wall to the roof everywhere except the terrace arcs, where a glazed lounge sits instead.
    const arcs = terraces.map((t) => t.arc).sort((a, b) => a[0] - b[0]);
    const gaps = []; let cur = arcs[arcs.length - 1][1] - Lr;
    arcs.forEach((a) => { gaps.push([cur, a[0]]); cur = a[1]; });
    gaps.forEach(([a, b]) => { if (b - a > 1) root.add(new THREE.Mesh(keep(sweep(ring, [[tierBackD(ut), rowY(ut, ut.rows - 1)], [tierBackD(ut), L.roofY]], { samples: arcSamples(ring, a, b, 0, 2) })), M.wall)); });
    terraces.forEach((t) => {
      const S2 = arcSamples(ring, t.arc[0], t.arc[1], 0, 1.5);
      const sw = (prof, mat) => { const m = new THREE.Mesh(keep(sweep(ring, prof, { samples: S2 })), mat); m.receiveShadow = true; root.add(m); return m; };
      sw([[tierBackD(ut) - 0.1, rowY(ut, ut.rows - 1)], [tierBackD(ut) - 0.1, topY], [tD + 5.5, topY]], M.carpet);
      sw([[tD + 0.05, topY], [tD + 0.05, topY + 1.05]], M.glass).renderOrder = 2;
      sw([[tD + 3.6, topY], [tD + 3.6, L.roofY]], M.glass).renderOrder = 2;
      sw([[tD + 5.5, topY], [tD + 5.5, L.roofY]], M.suite);
    });
  }

  /* ---------- Roof, walls, rigging ---------- */
  const outerD = tierBackD(ut) + (terraces.length ? 6.2 : 0.6);
  const roofGroup = new THREE.Group(); roofGroup.name = 'arena-roof';
  const extent = { x: ring.hx + outerD + 2, z: ring.hz + outerD + 2 };
  const roof = new THREE.Mesh(keep(new THREE.PlaneGeometry(extent.x * 2, extent.z * 2)), M.roof);
  roof.rotation.x = Math.PI / 2; roof.position.y = L.roofY; roofGroup.add(roof);
  root.add(new THREE.Mesh(keep(sweep(ring, [[outerD, 0], [outerD, L.roofY]])), M.wall));
  // Rigging grid under the roof.
  const beams = [];
  const gy = L.roofY - 2.2;
  for (let x = -extent.x + 6; x < extent.x - 4; x += 7) beams.push({ a: new THREE.Vector3(x, gy, -extent.z + 8), b: new THREE.Vector3(x, gy, extent.z - 8), r: 0.5 });
  for (let z = -extent.z + 8; z < extent.z - 6; z += 9) beams.push({ a: new THREE.Vector3(-extent.x + 6, gy - 0.6, z), b: new THREE.Vector3(extent.x - 6, gy - 0.6, z), r: 0.35 });
  const beamGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const rig = instanced(beamGeo, M.truss, beams, (m, P, q, sc) => { const d = m.b.clone().sub(m.a); P.copy(m.a).addScaledVector(d, 0.5); q.setFromUnitVectors(up, d.clone().normalize()); sc.set(m.r, d.length(), m.r); });
  rig.castShadow = true; roofGroup.add(rig);
  // House lights on the grid.
  const lamps = [];
  for (let x = -extent.x + 9.5; x < extent.x - 6; x += 7) for (let z = -extent.z + 12.5; z < extent.z - 8; z += 9) lamps.push({ x, z });
  const lampGeo = keep(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12));
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.4, 2.2) }));
  roofGroup.add(instanced(lampGeo, lampMat, lamps, (l, P, q, sc) => { P.set(l.x, gy - 1.1, l.z); q.identity(); sc.set(1, 1, 1); }));
  const glarePos = new Float32Array(lamps.length * 3); lamps.forEach((l, k) => glarePos.set([l.x, gy - 1.35, l.z], k * 3));
  const glareGeo = keep(new THREE.BufferGeometry()); glareGeo.setAttribute('position', new THREE.BufferAttribute(glarePos, 3));
  const glareMat = keep(new THREE.PointsMaterial({ map: keep(TX.glow(64)), size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.55, 1.45) }));
  const glare = new THREE.Points(glareGeo, glareMat); roofGroup.add(glare);
  root.add(roofGroup);

  // Centre-hung screen cluster.
  const scrTex = keep(TX.bigScreen(renderer, boxing ? 'concert' : 'concert'));
  const scrMat = keep(new THREE.MeshBasicMaterial({ map: scrTex, color: new THREE.Color(1.1, 1.1, 1.1) }));
  const hung = new THREE.Group();
  const hw = 5.2; const hd = 3.4; const hh = 4.4;
  [[0, hd, 0, hw * 2], [0, -hd, Math.PI, hw * 2], [hw, 0, Math.PI / 2, hd * 2], [-hw, 0, -Math.PI / 2, hd * 2]].forEach(([x, z, ry, w]) => {
    const p = new THREE.Mesh(keep(new THREE.PlaneGeometry(w * 0.96, hh)), scrMat); p.position.set(x, 0, z); p.rotation.y = ry; hung.add(p);
  });
  const hb = new THREE.Mesh(keep(new THREE.BoxGeometry(hw * 2 - 0.1, hh + 0.6, hd * 2 - 0.1)), M.fascia); hung.add(hb);
  const hring = new THREE.Mesh(keep(new THREE.BoxGeometry(hw * 2 + 0.4, 0.5, hd * 2 + 0.4)), ribbonMat); hring.position.y = -hh / 2 - 0.5; hung.add(hring);
  hung.position.set(0, boxing ? 21 : 28, 0); hung.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.add(hung);
  // Cables to the roof.
  [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].forEach(([x, z]) => {
    const c = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, L.roofY - hung.position.y, 4)), M.truss);
    c.position.set(x, (L.roofY + hung.position.y) / 2, z); root.add(c);
  });

  /* ---------- Mode staging ---------- */
  let stage = null; let ringLight = null; let ringPanelMat = null; let fighters = null;
  const crowd = new Crowd({ lowPower });
  const floorChairs = [];
  if (!boxing) {
    stage = createStage({ L: L.stage, scale: 0.62, lowPower, keep, beams: 12, palette: 'arena' });
    root.add(stage.group);
    fillFloor(crowd, {
      x0: -L.floor.hx + 5, x1: L.stage.frontX - 7, z0: -L.floor.hz + 2.5, z1: L.floor.hz - 2.5, spacing: lowPower ? 0.9 : 0.62,
      face: new THREE.Vector3(L.stage.backX, 0, 0), palette: 'concert', armsUp: 0.25, phones: 0.09, seed: 12,
      skip: (x, z) => Math.abs(x + 16) < 2.5 && Math.abs(z) < 3,
    });
    // Mixing desk riser.
    const desk = new THREE.Mesh(keep(new THREE.BoxGeometry(4, 1.1, 5)), M.dark); desk.position.set(-16, 0.55, 0); root.add(desk);
  } else {
    const r3 = L.ring3; const h = r3.half; const deck = r3.deck;
    const ringG = new THREE.Group();
    const base = new THREE.Mesh(keep(new THREE.BoxGeometry(r3.apron * 2 - 1.2, deck, r3.apron * 2 - 1.2)), keep(new THREE.MeshStandardMaterial({ color: '#0f1d33', roughness: 0.6 })));
    base.position.y = deck / 2; base.castShadow = true; base.receiveShadow = true; ringG.add(base);
    const canvasTop = new THREE.Mesh(keep(new THREE.PlaneGeometry(r3.apron * 2 - 1.2, r3.apron * 2 - 1.2)), keep(new THREE.MeshStandardMaterial({ map: keep(TX.ringCanvas(renderer)), roughness: 0.85 })));
    canvasTop.rotation.x = -Math.PI / 2; canvasTop.position.y = deck + 0.01; canvasTop.receiveShadow = true; ringG.add(canvasTop);
    const postGeo = keep(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 10));
    const padGeo = keep(new THREE.BoxGeometry(0.28, 1.2, 0.28));
    const padCols = ['#b5202f', '#f4f4f2', '#2d6fe0', '#f4f4f2'];
    [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(([x, z], k) => {
      const p = new THREE.Mesh(postGeo, M.rail); p.position.set(x, deck + 0.8, z); ringG.add(p);
      const pad = new THREE.Mesh(padGeo, keep(new THREE.MeshStandardMaterial({ color: padCols[k], roughness: 0.6 }))); pad.position.set(x * 0.985, deck + 0.85, z * 0.985); pad.rotation.y = Math.PI / 4; ringG.add(pad);
    });
    const ropeMat = keep(new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.5 }));
    const ropeRed = keep(new THREE.MeshStandardMaterial({ color: '#b5202f', roughness: 0.5 }));
    const ropeGeo = keep(new THREE.CylinderGeometry(0.028, 0.028, h * 2, 8));
    [0.45, 0.8, 1.15, 1.48].forEach((y, k) => {
      [[0, -h, 0], [0, h, 0], [-h, 0, 1], [h, 0, 1]].forEach(([x, z, along]) => {
        const r = new THREE.Mesh(ropeGeo, k === 3 ? ropeRed : ropeMat);
        r.position.set(x, deck + y, z); r.rotation.set(0, 0, Math.PI / 2); if (along) r.rotation.set(Math.PI / 2, 0, 0);
        ringG.add(r);
      });
    });
    ringG.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(ringG);
    // Overhead ring light: square truss with a bright panel and a spotlight.
    const lr = new THREE.Group();
    const frameGeo = keep(new THREE.BoxGeometry(10, 0.5, 0.5));
    [[0, -5, 0], [0, 5, 0], [-5, 0, 1], [5, 0, 1]].forEach(([x, z, rot]) => { const b = new THREE.Mesh(frameGeo, M.truss); b.position.set(x, 0, z); if (rot) b.rotation.y = Math.PI / 2; lr.add(b); });
    ringPanelMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) }));
    const panelGeo = keep(new THREE.PlaneGeometry(1.6, 1.6));
    [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -3.6], [0, 3.6], [-3.6, 0], [3.6, 0]].forEach(([x, z]) => { const p = new THREE.Mesh(panelGeo, ringPanelMat); p.rotation.x = Math.PI / 2; p.position.set(x, -0.3, z); lr.add(p); });
    lr.position.y = 9.5; root.add(lr);
    ringLight = new THREE.SpotLight('#fff6ea', 0, 0, 0.62, 0.45, 0);
    ringLight.position.set(0, 9.2, 0); ringLight.target.position.set(0, 0, 0);
    root.add(ringLight, ringLight.target);
    // Fighters and referee.
    fighters = new Crowd({ forceNear: true });
    fighters.add({ x: -1.2, y: deck, z: 0.3, yaw: Math.PI / 2, seated: false, cloth: '#c98e69' });
    fighters.add({ x: 1.2, y: deck, z: -0.3, yaw: -Math.PI / 2, seated: false, cloth: '#7d5038' });
    fighters.add({ x: 0.2, y: deck, z: 2.0, yaw: Math.PI, seated: false, cloth: '#f4f4f2' });
    fighters.finalize(); root.add(fighters.group);
    // Ringside floor seating: rows of chairs on all four sides.
    const fx = L.floor.hx - 2; const fz = L.floor.hz - 2;
    for (let row = 0; row < 40; row++) {
      const dist = r3.apron + 2.2 + row * 1.0;
      if (dist > Math.max(fx, fz)) break;
      for (let side = 0; side < 4; side++) {
        const lenHalf = dist + 0.5;
        for (let u = -lenHalf; u <= lenHalf; u += 0.6) {
          let x; let z;
          if (side === 0) { x = u; z = -dist; } else if (side === 1) { x = u; z = dist; } else if (side === 2) { x = -dist; z = u; } else { x = dist; z = u; }
          if (Math.abs(x) > fx || Math.abs(z) > fz) continue;
          if (side >= 2 && Math.abs(z) > dist - 0.5) continue; // corners belong to the long sides
          if (side === 1 && row === 0) continue; // press and judges tables
          const nx = side === 2 ? -1 : side === 3 ? 1 : 0; const nz = side === 0 ? -1 : side === 1 ? 1 : 0;
          floorChairs.push({ x, z, nx, nz });
          crowd.add({ x, y: 0, z, yaw: yawFacing(-x, -z), seated: true, palette: 'smart', angle: Math.atan2(z, x) });
        }
      }
    }
    const chairGeo = keep(new THREE.BoxGeometry(0.46, 0.08, 0.44)); chairGeo.translate(0, 0.44, 0);
    root.add(instanced(chairGeo, keep(new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.6 })), floorChairs, (c, P, q, sc) => { P.set(c.x, 0, c.z); q.setFromAxisAngle(up, yawFacing(-c.nx, -c.nz)); sc.set(1, 1, 1); }));
    const tbl = new THREE.Mesh(keep(new THREE.BoxGeometry(9, 0.8, 0.8)), keep(new THREE.MeshStandardMaterial({ color: '#0f1d33', roughness: 0.5 })));
    tbl.position.set(0, 0.4, r3.apron + 2.2); root.add(tbl);
  }

  /* ---------- Seats and bowl crowd ---------- */
  const slots = [...lower.slots, ...suites.slots, ...upper.slots];
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const bandGeo = keep(mergeGeometries([lower.bandGeo, suites.bandGeo, upper.bandGeo]));
  [lower.bandGeo, suites.bandGeo, upper.bandGeo].forEach((g) => g.dispose());
  const seats = new SeatField({ slots, bandGeo, bandTexture: keep(TX.seatBand(renderer)), nearCapacity: lowPower ? 1200 : 3000 });
  root.add(seats.group);
  slots.forEach((s) => {
    if (!boxing && s.x > L.stage.frontX + 1 && Math.abs(s.z) < 40) return; // behind the stage: not sold
    if (lowPower && R() < 0.35) return;
    const kv = R();
    crowd.add({ x: s.x, y: s.y, z: s.z, yaw: yawFacing(-s.nx, -s.nz), seated: true, angle: s.angle, palette: s.padded || s.tier === 'band' ? 'smart' : 'concert', keep: s.tier === 'band' ? kv * 1.5 : kv, armsUp: !boxing && R() < 0.1 ? 0.5 : 0 });
  });
  crowd.finalize();
  root.add(crowd.group);

  let view = 'seat';
  const venue = {
    root, crowd, seats, indoor: true,
    setViewer: (pos) => hidePartitions(partMesh, partitions, partY, pos),
    bounds: { center: new THREE.Vector3(0, 10, 0), radius: 78 },
    overview: { position: new THREE.Vector3(...L.overview.position), target: new THREE.Vector3(boxing ? 0 : 6, 0, 0), minDistance: 40, maxDistance: 260 },
    // Overview lifts the roof off (a cutaway), seat view puts it back.
    setView(v) { view = v; roofGroup.visible = v !== 'overview'; roof.visible = v !== 'overview'; },
    setMood(m, info) {
      const house = info.house ?? 1;
      lampMat.color.setScalar(0.3 + house * 2.4);
      glareMat.opacity = Math.min(1, house * 1.2); glare.visible = house > 0.2;
      M.suite.emissiveIntensity = m === 'night' ? 0.55 : 0.35;
      ribbonMat.color.setScalar(m === 'night' ? 1.35 : 1.0);
      scrMat.color.setScalar(m === 'night' ? 1.5 : 1.1);
      if (ringLight) ringLight.intensity = m === 'night' ? 9 : m === 'golden' ? 5 : 2.5;
      if (ringPanelMat) ringPanelMat.color.setScalar(m === 'night' ? 1.9 : 1.5);
      stage?.setMood(m);
    },
    update(t, dt, { still }) {
      crowd.update(t, { still, bounce: boxing ? 0 : 1, beat: 4.2 });
      fighters?.update(t, { still });
      if (!still) ribbonTex.offset.x = (t * 0.01) % 1;
      stage?.update(t, dt, still);
    },
    dispose() {
      seats.dispose(); crowd.dispose(); fighters?.dispose(); stage?.dispose();
      disposables.forEach((d) => d.dispose?.());
    },
  };
  void view;
  return venue;
}
