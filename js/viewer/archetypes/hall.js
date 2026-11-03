// Concert hall builder: the Royal Albert Hall from its layout in js/viewer/layouts.js.
// Stated and used: an ellipse 67 x 56 m inside, a 41 m dome, the Arena, Stalls, Loggia,
// Grand Tier and Second Tier boxes, Rausing Circle, Choir and Gallery, and acoustic
// diffusers hung below the ceiling. Tier depths, heights, box widths and the stage are
// modelled. Orchestra mode:
//   floor     the Arena: arcs of seats facing the stage on a parquet floor
//   lower     the Stalls, a raked tier all the way round; behind the stage, the Choir
//   boxes     three tiers of boxes (Loggia, Grand Tier, Second Tier) with velvet parapets
//   circle    the Rausing Circle above the boxes, with a velvet parapet and brass rail
//   gallery   the standing Gallery behind a balustrade, under a colonnade
//   ceiling   a ribbed dome with a glazed crown and the diffusers (lifted for the overview)
//   stage     a curved platform with risers, an orchestra and a conductor, and a plain
//             panelled screen above the Choir (the research does not describe it)
// Module contract: see the header of stadium.js.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rowY, rowD, tierBackD, tierBuildOpts, hallArc as hallArcL, hallBoxes as hallBoxesL, hallFloorRows as hallFloorRowsL, stageFrontX as stageFrontXL, HA_PARAPET as PH, hallRake, hallRowR, hallColumns as hallColumnsL } from '../layouts.js';
import { sweep, buildTier, stepsMesh, SeatField, instanced, yawFacing, arcSamples, endCap, bandFromRuns } from '../bowl.js';
import { Crowd } from '../crowd.js';
import { seatStyleFor } from '../seatplan.js';
import * as TX from '../textures.js';

const up = new THREE.Vector3(0, 1, 0);
const RED = [0.42, 0.07, 0.08];

export async function build(ctx) {
  const { renderer, lowPower } = ctx;
  const L = ctx.layout; const ring = L.ring;
  const hallArc = (d) => hallArcL(L, d); const hallBoxes = (b) => hallBoxesL(L, b);
  const hallFloorRows = () => hallFloorRowsL(L); const stageFrontX = (z) => stageFrontXL(L, z); const hallColumns = () => hallColumnsL(L);
  const root = new THREE.Group(); root.name = 'hall';
  const disposables = []; const keep = (x) => { disposables.push(x); return x; };
  const R = TX.rng(61);
  const lt = L.tiers.lower; const ct = L.tiers.circle; const G = L.gallery; const D = L.dome; const ST = L.stage;
  const [cx, cz] = ST.conductor;

  /* ---------- Materials ---------- */
  const M = {
    tier: keep(new THREE.MeshStandardMaterial({ map: keep(TX.concrete(renderer, [104, 44, 40])), vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })),
    velvet: keep(new THREE.MeshStandardMaterial({ color: '#7d1b20', roughness: 0.9, side: THREE.DoubleSide })),
    velvetDark: keep(new THREE.MeshStandardMaterial({ color: '#4f1015', roughness: 0.95, side: THREE.DoubleSide })),
    gold: keep(new THREE.MeshStandardMaterial({ color: '#caa252', roughness: 0.3, metalness: 1, side: THREE.DoubleSide })),
    cream: keep(new THREE.MeshStandardMaterial({ color: '#d6c4a2', roughness: 0.8, side: THREE.DoubleSide })),
    stone: keep(new THREE.MeshStandardMaterial({ color: '#9c8064', roughness: 0.85, side: THREE.DoubleSide })),
    wood: keep(new THREE.MeshStandardMaterial({ color: '#4a2c1a', roughness: 0.55, side: THREE.DoubleSide })),
    boxBack: keep(new THREE.MeshStandardMaterial({ color: '#5c1d1d', emissive: new THREE.Color('#ffb070'), emissiveIntensity: 0.1, roughness: 0.9, side: THREE.DoubleSide })),
    carpet: keep(new THREE.MeshStandardMaterial({ color: '#5a1517', roughness: 1, side: THREE.DoubleSide })),
    dark: keep(new THREE.MeshStandardMaterial({ color: '#1a1412', roughness: 1, side: THREE.DoubleSide })),
    step: keep(new THREE.MeshStandardMaterial({ color: '#6b2a26', roughness: 0.9 })),
    pipe: keep(new THREE.MeshStandardMaterial({ color: '#b9ad92', roughness: 0.34, metalness: 1 })),
    black: keep(new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.55, metalness: 0.15 })),
    instrument: keep(new THREE.MeshStandardMaterial({ color: '#7a3a16', roughness: 0.35, metalness: 0.05 })),
    brass: keep(new THREE.MeshStandardMaterial({ color: '#d9b25a', roughness: 0.25, metalness: 1 })),
    copper: keep(new THREE.MeshStandardMaterial({ color: '#b8743f', roughness: 0.3, metalness: 1 })),
    lamp: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.1) })),
  };
  const add = (geo, mat, { cast = false, receive = true, parent = root } = {}) => {
    const m = new THREE.Mesh(keep(geo), mat); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  };

  /* ---------- Floor and stage ---------- */
  const parq = keep(TX.parquet(renderer)); parq.repeat.set(0.4, 0.4);
  const floorMat = keep(new THREE.MeshStandardMaterial({ map: parq, roughness: 0.5, metalness: 0.05 }));
  // The floor is cut to the hall's outline, and an outer wall closes the hall for the overview.
  const outline = new THREE.Shape(); const Lw = ring.length(G.backD + 0.3);
  for (let s = 0; s < Lw; s += 1) { const p = ring.at(s, G.backD + 0.3); if (s === 0) outline.moveTo(p.x, -p.z); else outline.lineTo(p.x, -p.z); }
  const floorGeo = new THREE.ShapeGeometry(outline); floorGeo.rotateX(-Math.PI / 2);
  add(floorGeo, floorMat);
  add(sweep(ring, [[G.backD + 0.3, 0], [G.backD + 0.3, D.springY + 0.4]], { samples: ring.samples({ straightStep: 3, cornerSteps: 30 }) }), keep(new THREE.MeshStandardMaterial({ color: '#2a1c16', roughness: 0.9, side: THREE.DoubleSide })));

  const stagePts = []; const Ls = ring.length(-0.05);
  for (let s = 0; s < Ls; s += 0.4) { const p = ring.at(s, -0.05); if (p.x > stageFrontX(p.z)) stagePts.push([p.x, p.z]); }
  const zA = stagePts[stagePts.length - 1][1]; const zB = stagePts[0][1];
  const stageShape = new THREE.Shape();
  stageShape.moveTo(stagePts[0][0], stagePts[0][1]);
  stagePts.forEach(([x, z]) => stageShape.lineTo(x, z));
  for (let k = 1; k <= 20; k++) { const z = zA + (zB - zA) * (k / 20); stageShape.lineTo(stageFrontX(z), z); }
  const deckGeo = new THREE.ExtrudeGeometry(stageShape, { depth: ST.deck, bevelEnabled: false, curveSegments: 4 });
  deckGeo.rotateX(Math.PI / 2); deckGeo.translate(0, ST.deck, 0);
  const stageTex = keep(TX.parquet(renderer, [150, 104, 62])); stageTex.repeat.set(0.35, 0.35);
  const stageMat = keep(new THREE.MeshStandardMaterial({ map: stageTex, roughness: 0.45, side: THREE.DoubleSide }));
  // Extrude groups: 0 = top and bottom (parquet), 1 = the curved sides (plain stained wood).
  add(deckGeo, [stageMat, M.wood], { cast: true });

  // Risers: stepped arcs behind the strings, centred on the conductor.
  const riser = (r0, h) => {
    const a = 1.15; const r1 = 8.3;
    const sh = new THREE.Shape(); sh.absarc(cx, cz, r1, -a, a, false); sh.absarc(cx, cz, r0, a, -a, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 28 });
    g.rotateX(Math.PI / 2); g.translate(0, ST.deck + h, 0);
    return g;
  };
  [[5.0, 0.22], [6.2, 0.44], [7.4, 0.66]].forEach(([r0, h]) => add(riser(r0, h), [stageMat, M.wood], { cast: true }));
  const riserH = (r) => (r >= 7.4 ? 0.66 : r >= 6.2 ? 0.44 : r >= 5.0 ? 0.22 : 0);

  /* ---------- Lower tier (runs all the way round; behind the stage it is choir seating) ---------- */
  const fullS = ring.samples({ straightStep: 2, cornerSteps: 34 });
  // Aisles at the section edges of js/data/seatmaps.js, so these are the seat map's seats.
  // Armrests as the Hall states them: none in the Stalls, fixed in the Choir and Circle.
  const style = seatStyleFor(L.venueId, ctx.mode);
  const arms = (s) => style(s).arms; const padded = (s) => style(s).padded;
  const B1 = L.boxes[0]; const B2 = L.boxes[L.boxes.length - 1];
  const lower = buildTier(ring, lt, {
    ...tierBuildOpts(L, 'lower'), seed: 4, frontBase: 0, samples: fullS, concreteColor: [1, 1, 1],
    backWall: B1.floorY - 0.35 - rowY(lt, lt.rows - 1),
    padded, arms, seatColor: () => RED,
  });
  add(lower.concrete, M.tier, { cast: true });
  root.add(stepsMesh(lower.steps, M.step));
  add(sweep(ring, [[lt.d0 - 0.02, 0], [lt.d0 - 0.02, lt.y0]], { samples: fullS }), M.wood);
  add(sweep(ring, [[lt.d0 - 0.05, lt.y0 - 0.08], [lt.d0 - 0.05, lt.y0 + 0.02]], { samples: fullS }), M.gold);

  /* ---------- Floor seats (the stalls) ---------- */
  const floorRows = hallFloorRows();
  floorRows.forEach((row) => row.forEach((s) => { s.padded = false; s.arms = true; s.color = RED.map((v) => v * (0.95 + R() * 0.1)); }));
  const floorSlots = floorRows.flat();
  // Low risers under each raked row, cut to the row's own extent.
  const riserGeos = [];
  floorRows.forEach((row) => {
    const k = row[0].row; const h = hallRake(k); if (h <= 0) return;
    const r = hallRowR(k); const phis = row.map((s) => s.phi);
    const a0 = Math.PI - Math.max(...phis) - 0.03; const a1 = Math.PI - Math.min(...phis) + 0.03;
    const sh = new THREE.Shape(); sh.absarc(cx, cz, r + 0.5, a0, a1, false); sh.absarc(cx, cz, r - 0.45, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 40 });
    g.rotateX(Math.PI / 2); g.translate(0, h, 0);
    riserGeos.push(g);
  });
  if (riserGeos.length) { add(mergeGeometries(riserGeos), floorMat); riserGeos.forEach((g) => g.dispose()); }

  /* ---------- Box tiers ---------- */
  const boxPeople = []; const boxChairs = []; const sconces = [];
  function boxTier(b) {
    const [sA, sB] = hallArc(b.frontD);
    const S = arcSamples(ring, sA, sB, b.frontD, 0.7);
    const fd = b.frontD; const bd = b.backD; const fy = b.floorY;
    const sw = (prof, mat, o) => add(sweep(ring, prof, { samples: S, ...o }), mat, o);
    sw([[fd, fy - 0.35], [fd, fy + PH]], M.velvet);
    sw([[fd - 0.07, fy + PH], [fd + 0.24, fy + PH]], M.velvetDark);
    sw([[fd - 0.085, fy + PH - 0.05], [fd - 0.085, fy + PH + 0.04]], M.gold);
    sw([[fd - 0.03, fy - 0.37], [fd - 0.03, fy - 0.22]], M.gold);
    sw([[fd, fy - 0.35], [bd + 0.3, fy - 0.35]], M.cream);
    sw([[fd, fy], [bd, fy]], M.carpet);
    sw([[bd, fy], [bd, b.ceilY]], M.boxBack);
    sw([[fd + 0.05, b.ceilY], [bd + 0.3, b.ceilY]], M.cream, { cast: true });
    const { parts, centres } = hallBoxes(b);
    const h = b.ceilY - fy + 0.35;
    const partGeo = keep(new THREE.BoxGeometry(0.12, h, bd - fd)); partGeo.translate(0, h / 2, 0);
    root.add(instanced(partGeo, M.velvetDark, parts, (c, P, q, sc) => {
      const p = ring.point(c.i, c.f, (fd + bd) / 2); P.set(p.x, fy - 0.35, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)); sc.set(1, 1, 1);
    }));
    const pilGeo = keep(new THREE.BoxGeometry(0.26, h, 0.16)); pilGeo.translate(0, h / 2, 0);
    root.add(instanced(pilGeo, M.cream, parts, (c, P, q, sc) => {
      const p = ring.point(c.i, c.f, fd - 0.07); P.set(p.x, fy - 0.35, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)); sc.set(1, 1, 1);
    }));
    const capGeo = keep(new THREE.BoxGeometry(0.34, 0.14, 0.22));
    root.add(instanced(capGeo, M.gold, parts, (c, P, q, sc) => {
      const p = ring.point(c.i, c.f, fd - 0.08); P.set(p.x, b.ceilY - 0.12, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)); sc.set(1, 1, 1);
    }));
    // People and chairs: three gilt chairs at the parapet and three behind; most boxes are in use.
    centres.forEach((c) => {
      const used = R() > 0.12;
      const count = used ? 2 + Math.floor(R() * 4) : 0;
      const spots = [[0.45, 0], [0.45, -0.8], [0.45, 0.8], [1.4, -0.4], [1.4, 0.8], [1.4, -1.0]];
      spots.forEach(([dd, off], k) => {
        const p = ring.point(c.i, c.f, fd + dd);
        const x = p.x + p.nz * off; const z = p.z - p.nx * off;
        if (k < 5) boxChairs.push({ x, y: fy, z, nx: p.nx, nz: p.nz });
        if (k < count) boxPeople.push({ x, y: fy, z, yaw: yawFacing(-p.nx, -p.nz), seated: true, palette: 'smart', angle: Math.atan2(z, x) });
      });
      const pb = ring.point(c.i, c.f, bd - 0.04);
      sconces.push({ x: pb.x, y: fy + 1.95, z: pb.z, nx: pb.nx, nz: pb.nz });
    });
    // Close the two ends of the tier against the organ.
    [sA, sB].forEach((s) => {
      const { i, f } = ring.locate(s, fd);
      add(endCap(ring, i, f, [[fd, fy - 0.35], [fd, b.ceilY + 0.3], [bd + 0.3, b.ceilY + 0.3], [bd + 0.3, fy - 0.35]], fy - 0.35), M.cream);
    });
  }
  L.boxes.forEach(boxTier);
  void B2;

  // Box chairs (red seat and back) and the warm sconces at the back of each box.
  // Gilt box chairs: a velvet seat and a padded oval-topped back on a slim gilded frame.
  const backShape = new THREE.Shape(); backShape.moveTo(-0.19, 0); backShape.lineTo(0.19, 0); backShape.lineTo(0.2, 0.26); backShape.quadraticCurveTo(0.18, 0.4, 0, 0.42); backShape.quadraticCurveTo(-0.18, 0.4, -0.2, 0.26); backShape.lineTo(-0.19, 0);
  const backGeo = new THREE.ExtrudeGeometry(backShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 8 });
  backGeo.rotateX(-0.12); backGeo.translate(0, 0.52, -0.22);
  const seatGeo = new THREE.BoxGeometry(0.44, 0.07, 0.42).translate(0, 0.46, 0.0);
  const nonIdx = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
  const chairGeo = keep(mergeGeometries([seatGeo, backGeo].map(nonIdx))); seatGeo.dispose(); backGeo.dispose();
  const frameParts = [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]].map(([x, z]) => new THREE.CylinderGeometry(0.014, 0.012, 0.44, 6).translate(x, 0.22, z));
  frameParts.push(new THREE.BoxGeometry(0.46, 0.03, 0.03).translate(0, 0.43, 0.21));
  const frameGeo = keep(mergeGeometries(frameParts.map(nonIdx))); frameParts.forEach((g) => g.dispose());
  const placeChair = (c, P, q, sc) => { P.set(c.x, c.y, c.z); q.setFromAxisAngle(up, yawFacing(-c.nx, -c.nz)); sc.set(1, 1, 1); };
  root.add(instanced(chairGeo, M.velvet, boxChairs, placeChair));
  root.add(instanced(frameGeo, M.gold, boxChairs, placeChair));
  root.add(instanced(keep(new THREE.PlaneGeometry(0.2, 0.3)), M.lamp, sconces, (c, P, q, sc) => { P.set(c.x, c.y, c.z); q.setFromAxisAngle(up, yawFacing(-c.nx, -c.nz)); sc.set(1, 1, 1); }));
  const glowPos = new Float32Array(sconces.length * 3);
  sconces.forEach((c, k) => glowPos.set([c.x - c.nx * 0.08, c.y, c.z - c.nz * 0.08], k * 3));
  const glowGeo = keep(new THREE.BufferGeometry()); glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  const glowMat = keep(new THREE.PointsMaterial({ map: keep(TX.glow(64)), size: 1.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.4, 0.95, 0.55) }));
  root.add(new THREE.Points(glowGeo, glowMat));

  /* ---------- Circle ---------- */
  const [cA, cB] = hallArc(ct.d0);
  const cS = arcSamples(ring, cA, cB, ct.d0, 0.7);
  const circle = buildTier(ring, ct, {
    ...tierBuildOpts(L, 'circle'), samples: cS,
    frontBase: B2.ceilY, backWall: G.floorY - rowY(ct, ct.rows - 1), padded, arms, seatColor: () => RED, seed: 8, concreteColor: [1, 1, 1],
  });
  add(circle.concrete, M.tier, { cast: true });
  root.add(stepsMesh(circle.steps, M.step));
  const csw = (prof, mat) => add(sweep(ring, prof, { samples: cS }), mat);
  csw([[ct.d0 - 0.02, B2.ceilY], [ct.d0 - 0.02, ct.y0]], M.cream);
  csw([[ct.d0 - 0.04, ct.y0], [ct.d0 - 0.04, ct.y0 + 0.72]], M.velvet);
  csw([[ct.d0 - 0.11, ct.y0 + 0.72], [ct.d0 + 0.18, ct.y0 + 0.72]], M.velvetDark);
  csw([[ct.d0 - 0.12, ct.y0 + 0.67], [ct.d0 - 0.12, ct.y0 + 0.77]], M.gold);
  csw([[ct.d0 - 0.05, ct.y0 - 0.12], [ct.d0 - 0.05, ct.y0 - 0.02]], M.gold);
  const cprof = [[ct.d0, B2.ceilY], [ct.d0, rowY(ct, 0) + 0.72]];
  for (let i = 0; i < ct.rows; i++) { cprof.push([rowD(ct, i + 1), rowY(ct, i)]); if (i < ct.rows - 1) cprof.push([rowD(ct, i + 1), rowY(ct, i + 1)]); }
  cprof.push([tierBackD(ct), G.floorY]);
  [cA, cB].forEach((s) => { const { i, f } = ring.locate(s, ct.d0); add(endCap(ring, i, f, cprof, B2.ceilY), M.cream); });

  /* ---------- Gallery and colonnade (all the way round) ---------- */
  const gsw = (prof, mat, o) => add(sweep(ring, prof, { samples: fullS, ...o }), mat);
  gsw([[G.d0, G.floorY], [G.backD, G.floorY]], M.carpet);
  // Balustrade: a low plinth, turned balusters and a moulded timber handrail.
  gsw([[G.d0 + 0.04, G.floorY - 0.45], [G.d0 + 0.04, G.floorY + 0.12], [G.d0 + 0.2, G.floorY + 0.12]], M.cream);
  gsw([[G.d0 - 0.06, G.floorY + 0.9], [G.d0 - 0.06, G.floorY + 1.0], [G.d0 + 0.22, G.floorY + 1.02], [G.d0 + 0.22, G.floorY + 0.9]], M.wood);
  {
    const bal = []; const Lb = ring.length(G.d0 + 0.08);
    for (let s = 0.08; s < Lb; s += 0.15) bal.push(ring.at(s, G.d0 + 0.08));
    const prof = [[0, 0], [0.038, 0], [0.038, 0.05], [0.022, 0.09], [0.026, 0.2], [0.042, 0.38], [0.03, 0.5], [0.019, 0.62], [0.03, 0.7], [0.034, 0.78], [0, 0.78]];
    const balGeo = keep(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 7));
    root.add(instanced(balGeo, M.cream, bal, (p, P, q, sc) => { P.set(p.x, G.floorY + 0.12, p.z); q.identity(); sc.set(1, 1, 1); }));
  }
  gsw([[G.d0 - 0.01, G.floorY - 0.45], [G.d0 - 0.01, G.floorY - 0.3]], M.gold);
  gsw([[G.backD, G.floorY], [G.backD, G.colTop + 0.4]], M.stone);
  const ceilingGroup = new THREE.Group(); ceilingGroup.name = 'ceiling';
  root.add(ceilingGroup);
  add(sweep(ring, [[G.colD - 0.35, G.colTop], [G.backD, G.colTop]], { samples: fullS }), M.cream);
  add(sweep(ring, [[G.colD - 0.36, G.colTop - 0.05], [G.colD - 0.36, G.colTop + 0.6]], { samples: fullS }), M.cream);
  add(sweep(ring, [[G.colD - 0.38, G.colTop + 0.22], [G.colD - 0.38, G.colTop + 0.32]], { samples: fullS }), M.gold);
  add(sweep(ring, [[G.colD - 0.36, G.colTop + 0.6], [D.springD, D.springY]], { samples: fullS }), M.stone, { parent: ceilingGroup });
  const cols = []; const colsAt = hallColumns();
  for (let k = 0; k < colsAt.n; k++) cols.push(ring.at((k + 0.5) * colsAt.step, G.colD));
  const colH = G.colTop - G.floorY;
  const colGeo = keep(new THREE.CylinderGeometry(0.2, 0.23, colH, 12)); colGeo.translate(0, colH / 2, 0);
  root.add(instanced(colGeo, M.cream, cols, (p, P, q, sc) => { P.set(p.x, G.floorY, p.z); q.identity(); sc.set(1, 1, 1); }));
  const capG = keep(new THREE.CylinderGeometry(0.32, 0.22, 0.28, 12));
  root.add(instanced(capG, M.gold, cols, (p, P, q, sc) => { P.set(p.x, G.colTop - 0.14, p.z); q.identity(); sc.set(1, 1, 1); }));

  /* ---------- Screen above the choir ---------- */
  // The research does not describe what stands above the choir, so this is a plain
  // panelled timber screen with pilasters (modelled), not a portrait of anything real.
  const q0 = L.organ / (Math.PI / 2);
  const oD = B1.frontD + 0.6;
  const oA = ring.sOf(1, 1 - q0, oD); const oB = ring.sOf(3, q0, oD);
  const oS = arcSamples(ring, oA, oB, oD, 0.5);
  const osw = (prof, mat) => add(sweep(ring, prof, { samples: oS }), mat);
  osw([[oD + 0.4, B1.floorY - 0.4], [oD + 0.4, G.floorY - 0.4]], M.wood);
  osw([[oD - 0.3, B1.floorY - 0.35], [oD + 0.4, B1.floorY - 0.35]], M.wood);
  [B1.ceilY, B2.floorY + 1.2, B2.ceilY].forEach((y) => { osw([[oD + 0.38, y - 0.08], [oD + 0.38, y + 0.08]], M.gold); osw([[oD + 0.12, y + 0.08], [oD + 0.4, y + 0.08]], M.cream); });
  osw([[oD + 0.4, G.floorY - 0.4], [G.d0, G.floorY - 0.4]], M.wood);
  const caseT = []; const Lo = oB - oA;
  for (let k = 0; k <= 12; k++) { const s = oA + (Lo * k) / 12; const { i, f } = ring.locate(s, oD); caseT.push(ring.point(i, f, oD + 0.25)); }
  const pilH = G.floorY - B1.floorY;
  const ctGeo = keep(new THREE.BoxGeometry(0.42, pilH, 0.3)); ctGeo.translate(0, pilH / 2, 0);
  root.add(instanced(ctGeo, M.cream, caseT, (p, P, q, sc) => { P.set(p.x, B1.floorY - 0.4, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)); sc.set(1, 1, 1); }));

  /* ---------- Dome, crown and lantern ---------- */
  const domeS = ring.samples({ straightStep: 2, cornerSteps: 40 });
  const prof = (t0, t1, n) => { const out = []; for (let k = 0; k <= n; k++) { const th = t0 + (t1 - t0) * (k / n); out.push([D.topD + (D.springD - D.topD) * Math.cos(th), D.springY + (D.apexY - D.springY) * Math.sin(th)]); } return out; };
  const plaster = keep(TX.dome(renderer, 'plaster'));
  const domeMat = keep(new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color('#000000'), emissiveMap: plaster }));
  const glazed = keep(TX.dome(renderer, 'glazed'));
  const crownMat = keep(new THREE.MeshStandardMaterial({ map: glazed, roughness: 0.4, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveMap: glazed, emissiveIntensity: 0.3 }));
  add(sweep(ring, prof(0, 1.05, 16), { samples: domeS, uRepeats: 64, vScale: 10 }), domeMat, { parent: ceilingGroup });
  add(sweep(ring, prof(1.05, Math.PI / 2, 8), { samples: domeS, uRepeats: 64, vScale: 4 }), crownMat, { parent: ceilingGroup });
  add(sweep(ring, [[D.topD, D.apexY], [-(ring.hz - 0.05), D.apexY + 0.5]], { samples: domeS }), crownMat, { parent: ceilingGroup });
  const plug = add(new THREE.PlaneGeometry(2 * (ring.hx - ring.hz) + 0.6, 0.8), crownMat, { parent: ceilingGroup }); plug.rotation.x = Math.PI / 2; plug.position.y = D.apexY + 0.5;

  // Suspended acoustic diffusers (stated: fibreglass discs hung below the ceiling since
  // 1969), scattered under the dome. Their number and hanging height are modelled.
  const domeY = (x, z) => {
    const d = ring.dOf(x, z);
    if (d < D.topD) return D.apexY;
    const c = Math.min(1, (d - D.topD) / (D.springD - D.topD));
    return D.springY + (D.apexY - D.springY) * Math.sin(Math.acos(c));
  };
  const diff = []; let tries = 0;
  const dX = ring.hx + 7; const dZ = ring.hz + 7;
  while (diff.length < 96 && tries++ < 8000) {
    const x = (R() * 2 - 1) * dX; const z = (R() * 2 - 1) * dZ;
    if ((x / (dX + 0.5)) ** 2 + (z / (dZ + 0.5)) ** 2 > 1) continue;
    const rad = 0.95 + R() * 0.75;
    if (diff.some((d) => (d.x - x) ** 2 + (d.z - z) ** 2 < (d.r + rad + 0.4) ** 2)) continue;
    diff.push({ x, z, r: rad, y: D.springY + 1.2 + R() * 1.5 - Math.hypot(x / dX, z / dZ) * 0.6 });
  }
  const capParts = [new THREE.SphereGeometry(1, 20, 5, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), new THREE.CircleGeometry(0.93, 20).rotateX(-Math.PI / 2)];
  capParts[0].scale(1 / 0.93, 0.36 / 0.63, 1 / 0.93); capParts[0].translate(0, 0.36 * 0.368 / 0.63, 0);
  capParts[1].scale(1 / 0.93, 1, 1 / 0.93);
  const capGeo2 = keep(mergeGeometries(capParts.map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; })));
  capParts.forEach((g) => g.dispose());
  const diffMat = keep(new THREE.MeshStandardMaterial({ color: '#cbc3b5', roughness: 0.55, side: THREE.DoubleSide, emissive: new THREE.Color('#000000') }));
  const diffMesh = instanced(capGeo2, diffMat, diff, (d, P, q, sc) => { P.set(d.x, d.y, d.z); q.setFromAxisAngle(up, d.x); sc.set(d.r, 1, d.r); });
  diffMesh.castShadow = true; ceilingGroup.add(diffMesh);
  const cable = new Float32Array(diff.length * 6);
  diff.forEach((d, k) => cable.set([d.x, d.y + 0.05, d.z, d.x, domeY(d.x, d.z), d.z], k * 6));
  const cableGeo = keep(new THREE.BufferGeometry()); cableGeo.setAttribute('position', new THREE.BufferAttribute(cable, 3));
  ceilingGroup.add(new THREE.LineSegments(cableGeo, keep(new THREE.LineBasicMaterial({ color: '#2b2622', transparent: true, opacity: 0.55 }))));

  /* ---------- Orchestra ---------- */
  const orch = new Crowd({ forceNear: true });
  const chairs = []; const stands = []; const cellos = []; const basses = []; const violins = []; const bells = []; const drums = [];
  const toC = (x, z) => { const dx = cx - x; const dz = cz - z; const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  const rowsO = [
    { r: 2.1, a: 1.1, n: 8 }, { r: 3.2, a: 1.18, n: 12 }, { r: 4.3, a: 1.2, n: 14 },
    { r: 5.5, a: 1.0, n: 12 }, { r: 6.7, a: 0.95, n: 12 }, { r: 7.9, a: 0.75, n: 9 },
  ];
  rowsO.forEach((row, ri) => {
    for (let k = 0; k < row.n; k++) {
      const phi = -row.a + 2 * row.a * ((k + 0.5) / row.n);
      if (ri === 5 && Math.abs(phi) < 0.42) continue; // timpani go here
      const x = cx + row.r * Math.cos(phi); const z = cz + row.r * Math.sin(phi);
      const y = ST.deck + riserH(row.r);
      const [fx, fz] = toC(x, z);
      const yaw = Math.atan2(fx, fz);
      chairs.push({ x, y, z, yaw });
      orch.add({ x, y, z, yaw, seated: true, cloth: R() < 0.12 ? '#26272b' : '#0f1012' });
      const cello = (ri <= 1 && phi > 0.3) || (ri === 2 && phi > 0.6);
      if (cello) cellos.push({ x: x + fx * 0.36, y: y + 0.18, z: z + fz * 0.36, yaw });
      else if (ri <= 2) violins.push({ x: x + fx * 0.1 - fz * 0.14, y: y + 1.0, z: z + fz * 0.1 + fx * 0.14, yaw });
      if (ri === 4) bells.push({ x: x + fx * 0.32, y: y + 0.9, z: z + fz * 0.32, yaw });
      if (ri >= 3 || k % 2 === 0) stands.push({ x: x + fx * 0.62, y, z: z + fz * 0.62, yaw: yaw + Math.PI });
    }
  });
  // Double basses, standing on the right of the conductor.
  [[4.6, 1.3], [5.6, 1.33], [6.6, 1.35], [7.5, 1.3]].forEach(([r, phi]) => {
    const x = cx + r * Math.cos(phi); const z = cz + r * Math.sin(phi); const y = ST.deck + riserH(r);
    const [fx, fz] = toC(x, z); const yaw = Math.atan2(fx, fz);
    orch.add({ x, y, z, yaw, seated: false, cloth: '#0f1012' });
    basses.push({ x: x + fx * 0.38, y: y + 0.08, z: z + fz * 0.38, yaw });
  });
  // Timpani and the timpanist.
  [-0.32, -0.11, 0.11, 0.32].forEach((phi) => {
    const r = 7.6; const x = cx + r * Math.cos(phi); const z = cz + r * Math.sin(phi);
    drums.push({ x, y: ST.deck + riserH(r), z, s: 0.32 + Math.abs(phi) * 0.15 });
  });
  { const r = 8.5; const x = cx + r; orch.add({ x, y: ST.deck + riserH(r), z: cz, yaw: -Math.PI / 2, seated: false, cloth: '#0f1012' }); }
  // Harp, on the left.
  const harpShape = new THREE.Shape(); harpShape.moveTo(0, 0); harpShape.lineTo(0.12, 1.75); harpShape.quadraticCurveTo(0.45, 1.85, 0.7, 1.45); harpShape.lineTo(0.5, 0.25); harpShape.lineTo(0.08, 0); harpShape.lineTo(0, 0);
  const hole = new THREE.Path(); hole.moveTo(0.16, 0.25); hole.lineTo(0.22, 1.55); hole.quadraticCurveTo(0.45, 1.62, 0.6, 1.42); hole.lineTo(0.44, 0.3); hole.lineTo(0.16, 0.25); harpShape.holes.push(hole);
  const harpGeo = new THREE.ExtrudeGeometry(harpShape, { depth: 0.06, bevelEnabled: false });
  const harp = add(harpGeo, M.brass, { cast: true });
  { const phi = -1.3; const r = 4.1; harp.position.set(cx + r * Math.cos(phi), ST.deck + riserH(r), cz + r * Math.sin(phi)); harp.rotation.y = 0.9; }
  // Conductor on the podium.
  const podium = add(new THREE.BoxGeometry(1.0, 0.28, 1.0), M.black, { cast: true }); podium.position.set(cx, ST.deck + 0.14, cz);
  orch.add({ x: cx, y: ST.deck + 0.28, z: cz, yaw: Math.PI / 2, seated: false, cloth: '#0b0b0d', armsUp: 0.75 });
  orch.finalize(); root.add(orch.group);

  const oChair = [new THREE.BoxGeometry(0.42, 0.05, 0.4).translate(0, 0.46, 0.02), new THREE.BoxGeometry(0.42, 0.36, 0.04).translate(0, 0.68, -0.19)];
  root.add(instanced(keep(mergeGeometries(oChair)), M.black, chairs, (c, P, q, sc) => { P.set(c.x, c.y, c.z); q.setFromAxisAngle(up, c.yaw); sc.set(1, 1, 1); }));
  oChair.forEach((g) => g.dispose());
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.45);
  const standParts = [new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5).translate(0, 0.5, 0), new THREE.BoxGeometry(0.5, 0.34, 0.015).applyQuaternion(tilt).translate(0, 1.05, 0)];
  root.add(instanced(keep(mergeGeometries(standParts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }))), M.black, stands, (c, P, q, sc) => { P.set(c.x, c.y, c.z); q.setFromAxisAngle(up, c.yaw); sc.set(1, 1, 1); }));
  standParts.forEach((g) => g.dispose());
  const body = (w, h, dpt, neck) => {
    const parts = [new THREE.SphereGeometry(1, 12, 10).scale(w, h, dpt).translate(0, h, 0), new THREE.BoxGeometry(0.035, neck, 0.035).translate(0, 2 * h + neck / 2 - 0.05, 0)];
    const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { p.deleteAttribute('uv'); return p; }));
    parts.forEach((p) => p.dispose());
    g.rotateX(-0.22);
    return keep(g);
  };
  const place = (c, P, q, sc) => { P.set(c.x, c.y, c.z); q.setFromAxisAngle(up, c.yaw); sc.set(1, 1, 1); };
  root.add(instanced(body(0.19, 0.3, 0.09, 0.5), M.instrument, cellos, place));
  root.add(instanced(body(0.3, 0.5, 0.13, 0.85), M.instrument, basses, place));
  const vGeo = keep(new THREE.SphereGeometry(1, 8, 6).scale(0.08, 0.035, 0.18));
  root.add(instanced(vGeo, M.instrument, violins, place));
  const bellGeo = keep(new THREE.CylinderGeometry(0.07, 0.02, 0.26, 10).rotateX(-1.1));
  root.add(instanced(bellGeo, M.brass, bells, place));
  const kettle = keep(new THREE.LatheGeometry([[0, 0.3], [0.2, 0.32], [0.33, 0.45], [0.36, 0.62], [0.37, 0.7]].map(([x, y]) => new THREE.Vector2(x, y)), 18));
  root.add(instanced(kettle, M.copper, drums, (c, P, q, sc) => { P.set(c.x, c.y, c.z); q.identity(); sc.set(c.s / 0.37, 1, c.s / 0.37); }));
  const headGeo = keep(new THREE.CircleGeometry(0.37, 18).rotateX(-Math.PI / 2).translate(0, 0.705, 0));
  root.add(instanced(headGeo, M.cream, drums, (c, P, q, sc) => { P.set(c.x, c.y, c.z); q.identity(); sc.set(c.s / 0.37, 1, c.s / 0.37); }));

  /* ---------- Lighting ---------- */
  const spots = [[-6, 21, -7, cx + 3, 1.6, -1.5], [-6, 21, 7, cx + 3, 1.6, 1.5], [0, 24, 0, cx + 4.5, 1.6, 0], [-4, 15, 0, ring.hx + 6, 12, 0]].map(([x, y, z, tx, ty, tz]) => {
    const s = new THREE.SpotLight('#ffd6a0', 0, 0, 0.4, 0.75, 0);
    s.position.set(x, y, z); s.target.position.set(tx, ty, tz);
    root.add(s, s.target);
    return s;
  });
  spots[3].angle = 0.55; spots[3].color.set('#ffcf98');

  /* ---------- Seats and audience ---------- */
  const slots = [...lower.slots, ...floorSlots, ...circle.slots];
  const bandGeo = keep(mergeGeometries([lower.bandGeo, circle.bandGeo, bandFromRuns(floorRows)]));
  [lower.bandGeo, circle.bandGeo].forEach((g) => g.dispose());
  const seats = new SeatField({ slots, bandGeo, bandTexture: keep(TX.seatBand(renderer)), nearCapacity: lowPower ? 1200 : 3000 });
  root.add(seats.group);

  const crowd = new Crowd({ lowPower });
  slots.forEach((s) => {
    if (lowPower && R() < 0.35) return;
    crowd.add({ x: s.x, y: s.y, z: s.z, yaw: yawFacing(-s.nx, -s.nz), seated: true, angle: s.angle, palette: 'smart' });
  });
  boxPeople.forEach((p) => crowd.add({ ...p, keep: R() * 0.8 }));
  // Standing gallery, two loose rows along the balustrade.
  const Lg = ring.length(G.d0 + 0.5);
  for (let s = 0; s < Lg; s += 0.55 + R() * 0.5) {
    const p = ring.at(s, G.d0 + 0.45 + R() * 0.2);
    if (R() < 0.3) continue;
    crowd.add({ x: p.x, y: G.floorY, z: p.z, yaw: yawFacing(-p.nx, -p.nz) + (R() - 0.5) * 0.5, seated: false, palette: 'smart', angle: Math.atan2(p.z, p.x) });
    if (R() < 0.45) { const p2 = ring.at(s + 0.3, G.d0 + 1.25 + R() * 0.5); crowd.add({ x: p2.x, y: G.floorY, z: p2.z, yaw: yawFacing(-p2.nx, -p2.nz), seated: false, palette: 'smart', angle: Math.atan2(p2.z, p2.x) }); }
  }
  crowd.finalize();
  root.add(crowd.group);

  /* ---------- Behaviour ---------- */
  return {
    root, crowd, seats, indoor: true,
    bounds: { center: new THREE.Vector3(0, 14, 0), radius: 46 },
    overview: { position: new THREE.Vector3(...L.overview.position), target: new THREE.Vector3(...L.overview.target), minDistance: 24, maxDistance: 160 },
    // The overview lifts the dome off (a cutaway); the seat view puts it back.
    setView(v) { ceilingGroup.visible = v !== 'overview'; },
    setMood(m, info) {
      const house = info.house ?? 1;
      const night = m === 'night'; const golden = m === 'golden';
      const stageI = night ? 4.2 : golden ? 3.0 : 2.0;
      spots.slice(0, 3).forEach((s) => { s.intensity = stageI; s.color.set(night ? '#ffd2a0' : '#ffe2bd'); });
      spots[3].intensity = night ? 2.4 : golden ? 1.8 : 1.0;
      M.lamp.color.setRGB(0.6 + house * 1.7, 0.45 + house * 1.3, 0.3 + house * 0.85);
      glowMat.opacity = 0.35 + house * 0.65;
      M.boxBack.emissiveIntensity = night ? 0.05 : golden ? 0.14 : 0.1;
      // Show lighting washes the dome and the diffusers in a deep colour, as concert halls often do.
      domeMat.emissive.set(night ? '#3b2a8a' : golden ? '#6a3a14' : '#000000');
      domeMat.emissiveIntensity = night ? 0.55 : golden ? 0.25 : 0;
      crownMat.emissiveIntensity = night ? 0.06 : golden ? 0.18 : 0.42;
      diffMat.emissive.set(night ? '#2a1d66' : golden ? '#3a2410' : '#000000');
      diffMat.emissiveIntensity = night ? 0.6 : 0.3;
    },
    update(t, dt, { still }) {
      crowd.update(t, { still });
      orch.update(t, { still, beat: 2.3 });
    },
    dispose() {
      seats.dispose(); crowd.dispose(); orch.dispose();
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
