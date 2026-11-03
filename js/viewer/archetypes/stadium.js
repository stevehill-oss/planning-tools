// Stadium builder: Tottenham Hotspur Stadium at true scale from js/viewer/layouts.js.
// Stated in the research and used here: 105 x 68 m pitch inside a 114.58 x 79.84 m grass
// area, a single-tier South Stand raked at 34 degrees, multi-tier North, East and West
// stands raked at up to 35 degrees, Levels 1 to 5, a roof held by a compression ring with
// cables, the players' tunnel and home dugout on the West side (Tunnel Club). Everything
// else (row counts, tier heights, roof height, screens, boards) is modelled.
//
// ARCHETYPE MODULE CONTRACT (every builder in this folder follows it):
//   export async function build(ctx) -> venue
//   ctx:   { renderer, mode, lowPower, layout, quality }
//   venue: {
//     root, crowd, seats, indoor, bounds: { center, radius }, overview: { position, target, minDistance, maxDistance },
//     setMood(mood, info), update(t, dt, { still }), setViewer(pos)?, setView(view)?, play(name)?, dispose()
//   }
//   Static geometry should castShadow/receiveShadow; the engine renders the shadow map once
//   per mood, so nothing that moves should cast shadows.

import * as THREE from 'three';
import { rowY, tierBackD, tierBuildOpts } from '../layouts.js';
import { seatStyleFor } from '../seatplan.js';
import { hidePartitions, sweep, buildTier, stepsMesh, vomMeshes, SeatField, instanced, yawFacing, arcSamples, endCap } from '../bowl.js';
import { Crowd, fillFloor } from '../crowd.js';
import * as TX from '../textures.js';
import { createStage } from './stage.js';

const up = new THREE.Vector3(0, 1, 0);

export async function build(ctx) {
  const { renderer, mode, lowPower } = ctx;
  const L = ctx.layout;
  const ring = L.ring; const T = L.tiers;
  const root = new THREE.Group(); root.name = 'stadium';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const R = TX.rng(42);
  const concert = mode === 'concert';
  const nfl = mode === 'nfl';
  // Football only in football mode: no pitch markings, goals, boards, kits or players in any
  // other mode.
  const football = !concert && !nfl;
  const [multi, south] = L.stands;
  const angleOf = (p) => Math.abs(Math.atan2(p.nz, p.nx));
  const inSouth = (p) => angleOf(p) >= Math.PI * 0.75;
  const inMulti = (p) => !inSouth(p);
  const mS = arcSamples(ring, multi.arc[0], multi.arc[1], 0, 2.2);
  const sS = arcSamples(ring, south.arc[0], south.arc[1], 0, 2.2);

  /* ---------- Materials (physically based) ---------- */
  const concreteTex = keep(TX.concrete(renderer, [158, 158, 154]));
  const M = {
    concrete: keep(new THREE.MeshStandardMaterial({ map: concreteTex, vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })),
    fascia: keep(new THREE.MeshStandardMaterial({ color: '#101b2c', roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide })),
    dark: keep(new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 1, side: THREE.DoubleSide })),
    steel: keep(new THREE.MeshStandardMaterial({ color: '#d5d9de', roughness: 0.34, metalness: 0.9 })),
    steelDark: keep(new THREE.MeshStandardMaterial({ color: '#3b4048', roughness: 0.5, metalness: 0.8 })),
    roofUnder: keep(new THREE.MeshStandardMaterial({ color: '#8d949c', roughness: 0.42, metalness: 0.55, side: THREE.DoubleSide })),
    roofTop: keep(new THREE.MeshStandardMaterial({ map: keep(TX.roofPanels(renderer)), color: '#ffffff', roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide })),
    roofClear: keep(new THREE.MeshPhysicalMaterial({ color: '#eef3f7', roughness: 0.25, metalness: 0.0, transmission: 0, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })),
    glass: keep(new THREE.MeshPhysicalMaterial({ color: '#a9bccd', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false })),
    loungeGlass: keep(new THREE.MeshPhysicalMaterial({ color: '#7f95a8', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.55, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false })),
    rail: keep(new THREE.MeshStandardMaterial({ color: '#c3c8cf', roughness: 0.3, metalness: 0.9 })),
    interior: keep(new THREE.MeshStandardMaterial({ color: '#3a2e25', emissive: new THREE.Color('#ffcf9a'), emissiveIntensity: 0.25, roughness: 0.8, side: THREE.DoubleSide })),
    carpet: keep(new THREE.MeshStandardMaterial({ color: '#2b2f3c', roughness: 1, side: THREE.DoubleSide })),
    flood: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) })),
    step: keep(new THREE.MeshStandardMaterial({ color: '#a7a8a3', roughness: 0.9 })),
    white: keep(new THREE.MeshStandardMaterial({ color: '#f5f5f2', roughness: 0.4 })),
    cladding: keep(new THREE.MeshStandardMaterial({ color: '#cfd6dd', roughness: 0.32, metalness: 0.7, side: THREE.DoubleSide })),
  };

  /* ---------- Ground and pitch ---------- */
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(900, 900)), keep(new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 1 })));
  ground.rotation.x = -Math.PI / 2; ground.position.y = nfl ? L.nfl.level - 0.05 : -0.05; ground.receiveShadow = true;
  root.add(ground);
  const pw = ring.hx * 2 + 1; const ph = ring.hz * 2 + 1;
  if (nfl) {
    // Stated: the grass slides away under the South Stand and the NFL field sits 1.6 m
    // below it, on an artificial surface.
    const fieldTex = keep(TX.nflField(renderer, { w: pw, h: ph, N: L.nfl }));
    const field = new THREE.Mesh(keep(new THREE.PlaneGeometry(pw, ph)), keep(new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.78, metalness: 0 })));
    field.rotation.x = -Math.PI / 2; field.position.y = L.nfl.level; field.receiveShadow = true;
    root.add(field);
  } else {
    const pitchTex = keep(TX.pitch(renderer, { w: pw, h: ph }));
    const pitch = new THREE.Mesh(keep(new THREE.PlaneGeometry(pw, ph)), keep(new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95, metalness: 0 })));
    pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true;
    root.add(pitch);
  }

  /* ---------- Tiers ---------- */
  // Aisles sit at the block edges of js/data/seatmaps.js (layouts.tierBuildOpts), so every
  // seat here is the seat of the same number on the seat map.
  const opt = (id) => tierBuildOpts(L, id);
  const radM = opt('l5').radials(0).filter((r) => inMulti(ring.point(r.i, r.f, 1)));
  const radS = opt('s1').radials(0).filter((r) => inSouth(ring.point(r.i, r.f, 1)));
  const style = seatStyleFor(L.venueId, mode);
  const padded = (s) => style(s).padded; const arms = (s) => style(s).arms;
  const navy = [0.06, 0.09, 0.19];
  const slotsAll = []; const bands = [];
  const addTier = (t, opts) => {
    const res = buildTier(ring, t, { seed: 5 + bands.length * 3, ...opts });
    const mesh = new THREE.Mesh(keep(res.concrete), M.concrete); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    root.add(stepsMesh(res.steps, M.step));
    if (res.vomBlocks.length) root.add(vomMeshes(res.vomBlocks, keep(M.concrete.clone()), M.dark));
    slotsAll.push(...res.slots); bands.push(res.bandGeo);
    return res;
  };
  const { l1, l2, l4, l5, s1 } = T;
  const lounge = L.lounge; const suites = L.suites;
  // Level 1 all round the multi-tier stands; Levels 2 and 3 padded club rows; Level 4 the
  // two rows in front of the suites; Level 5 the steep upper tier.
  // Vomitories sit away from the middle rows, so a default seat is not beside a tunnel mouth.
  // Padded seats only where a product's seat type says so (stated); no armrests are stated here.
  addTier(l1, { ...opt('l1'), samples: mS, frontBase: 0, padded, arms, seatColor: () => navy });
  addTier(l2, { ...opt('l2'), samples: mS, frontBase: rowY(l1, l1.rows - 1), padded, arms, seatColor: () => [0.13, 0.13, 0.15] });
  addTier(l4, { ...opt('l4'), samples: mS, frontBase: lounge.top, padded, arms, seatColor: () => [0.2, 0.17, 0.15] });
  addTier(l5, { ...opt('l5'), samples: mS, frontBase: suites.top, backWall: 2.2, padded, arms, seatColor: () => navy });
  // South Stand: the single tier, with rail seats in its front rows.
  const southRes = addTier(s1, { ...opt('s1'), samples: sS, frontBase: 0, backWall: 2.4, padded, arms, seatColor: () => navy });

  const swM = (prof, mat, o = {}) => { const m = new THREE.Mesh(keep(sweep(ring, prof, { samples: mS, ...o })), mat); m.receiveShadow = true; if (o.cast) m.castShadow = true; root.add(m); return m; };
  const swS = (prof, mat, o = {}) => { const m = new THREE.Mesh(keep(sweep(ring, prof, { samples: sS, ...o })), mat); m.receiveShadow = true; if (o.cast) m.castShadow = true; root.add(m); return m; };
  // Front walls (down to the lowered field for NFL, with the pit edge in front).
  const wallBase = nfl ? L.nfl.level - 0.05 : 0;
  swM([[l1.d0 - 0.02, wallBase], [l1.d0 - 0.02, l1.y0]], M.fascia);
  swS([[s1.d0 - 0.02, wallBase], [s1.d0 - 0.02, s1.y0]], M.fascia);
  if (nfl) {
    const rim = (sw) => sw([[0, L.nfl.level - 0.05], [0, 0], [l1.d0, 0]], M.concrete);
    rim(swM); rim(swS);
  }
  // Safe-standing rails (900 mm, stated) along the front rows of the South Stand.
  const railRows = [1, 3, 5, 7, 9];
  railRows.forEach((i) => swS([[s1.d0 + i * s1.depth + 0.04, rowY(s1, i) + 0.88], [s1.d0 + i * s1.depth + 0.1, rowY(s1, i) + 0.9]], M.rail));

  // LED ribbon on the Level 2 fascia and on the Level 5 fascia.
  const ribbonTex = keep(TX.ledBoards(renderer, concert ? 'concert' : nfl ? 'nfl' : 'football'));
  const ribbonMat = keep(new THREE.MeshBasicMaterial({ map: ribbonTex, color: new THREE.Color(0.85, 0.85, 0.85) }));
  const f1y0 = rowY(l1, l1.rows - 1) + 0.6; const f1y1 = l2.y0 - 0.15;
  swM([[l2.d0 - 0.03, f1y0], [l2.d0 - 0.03, f1y1]], ribbonMat, { uScale: 60, vScale: f1y1 - f1y0, uFlip: true });
  swM([[l2.d0 - 0.4, rowY(l1, l1.rows - 1)], [l2.d0 - 0.4, f1y0], [l2.d0, f1y0]], M.fascia);
  const f5y0 = suites.top + 0.2; const f5y1 = l5.y0 - 0.1;
  swM([[l5.d0 - 0.03, f5y0], [l5.d0 - 0.03, f5y1]], ribbonMat, { uScale: 60, vScale: f5y1 - f5y0, uFlip: true });

  // Level 2 and 3 lounges: glazed two-storey frontage with a mid floor, warm interior.
  swM([[lounge.glassD, lounge.floorY], [lounge.glassD, lounge.top]], M.loungeGlass).renderOrder = 2;
  swM([[lounge.glassD - 0.02, lounge.floorY + 1.8], [lounge.glassD + 0.25, lounge.floorY + 1.8]], M.fascia);
  swM([[lounge.backD, lounge.floorY], [lounge.backD, lounge.top]], M.interior);
  swM([[lounge.glassD, lounge.floorY], [lounge.backD, lounge.floorY]], M.carpet);
  swM([[lounge.glassD - 0.3, lounge.top], [lounge.backD, lounge.top]], M.fascia, { cast: true });
  // Level 4 suites behind the two balcony rows.
  swM([[suites.glassD, rowY(l4, 1)], [suites.glassD, suites.floorY], [suites.backD, suites.floorY]], M.carpet);
  const sg = swM([[suites.glassD, suites.floorY], [suites.glassD, suites.top]], M.glass); sg.renderOrder = 2;
  swM([[l4.d0 + 0.05, l4.y0], [l4.d0 + 0.05, l4.y0 + 0.9]], M.glass).renderOrder = 2;
  swM([[suites.backD, suites.floorY], [suites.backD, suites.top + 0.2]], M.interior);
  swM([[suites.glassD - 0.2, suites.top + 0.12], [suites.backD, suites.top + 0.12]], M.carpet, { cast: true });
  swM([[l5.d0, suites.top + 0.15], [suites.glassD + 0.5, suites.top + 0.15]], M.fascia);
  // Suite partitions, hidden near the viewer (their own room supplies the walls).
  const partitions = [];
  const Lg = ring.length(suites.glassD);
  for (let s = 0; s < Lg; s += L.bands.suites.pitch) { const p = ring.at(s, (suites.glassD + suites.backD) / 2); if (inMulti(p)) partitions.push(p); }
  const partGeo = keep(new THREE.BoxGeometry(0.1, suites.top - suites.floorY, suites.backD - suites.glassD)); partGeo.translate(0, (suites.top - suites.floorY) / 2, 0);
  const partMesh = instanced(partGeo, keep(new THREE.MeshStandardMaterial({ color: '#4a3526', roughness: 0.6 })), partitions, (p, P, q, sc) => {
    P.set(p.x, suites.floorY, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)); sc.set(1, 1, 1);
  });
  root.add(partMesh);
  const lampGeo = keep(new THREE.PlaneGeometry(0.5, 0.12)); const lamps = [];
  for (let s = 2.6; s < Lg; s += 2.6) { const p = ring.at(s, suites.glassD + 1.5); if (inMulti(p)) lamps.push({ p, y: suites.top + 0.1 }); }
  const Ll = ring.length(lounge.glassD);
  for (let s = 1.8; s < Ll; s += 3.2) { const p = ring.at(s, lounge.glassD + 2); if (inMulti(p)) { lamps.push({ p, y: lounge.top - 0.05 }, { p, y: lounge.floorY + 1.75 }); } }
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.3) }));
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  root.add(instanced(lampGeo, lampMat, lamps, ({ p, y }, P, q, sc) => { P.set(p.x, y, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)).multiply(flat); sc.set(1, 1, 1); }));

  // Aisle handrails down the steep tiers.
  const railItems = [];
  [[l5, radM], [s1, radS]].forEach(([t, rads]) => rads.forEach((r) => {
    const a = ring.point(r.i, r.f, t.d0 + 0.6); const b = ring.point(r.i, r.f, tierBackD(t) - 0.4);
    railItems.push({ a: new THREE.Vector3(a.x, rowY(t, 0) + 0.95, a.z), b: new THREE.Vector3(b.x, rowY(t, t.rows - 1) + 0.95, b.z) });
  }));
  const railGeo = keep(new THREE.CylinderGeometry(0.025, 0.025, 1, 6));
  root.add(instanced(railGeo, M.rail, railItems, (r, P, q, sc) => { const d = r.b.clone().sub(r.a); P.copy(r.a).addScaledVector(d, 0.5); q.setFromUnitVectors(up, d.clone().normalize()); sc.set(1, d.length(), 1); }));

  // Where the single-tier South Stand meets the multi-tier stands: closing walls.
  const multiProfile = [[l1.d0, 0], [l1.d0, rowY(l1, 0)], [tierBackD(l1), rowY(l1, l1.rows - 1)], [l2.d0, l2.y0], [tierBackD(l2), rowY(l2, l2.rows - 1)], [lounge.backD, lounge.top], [l5.d0, l5.y0], [tierBackD(l5), rowY(l5, l5.rows - 1) + 2.2], [multi.backD, rowY(l5, l5.rows - 1) + 2.2], [multi.backD, 0]];
  const southProfile = [[s1.d0, 0], [s1.d0, s1.y0], [tierBackD(s1), rowY(s1, s1.rows - 1)], [tierBackD(s1), rowY(s1, s1.rows - 1) + 2.4], [south.backD, rowY(s1, s1.rows - 1) + 2.4], [south.backD, 0]];
  [south.arc[0], south.arc[1]].forEach((s) => {
    const { i, f } = ring.locate(s, 0);
    const a = new THREE.Mesh(keep(endCap(ring, i, f, multiProfile, 0)), M.concrete); a.castShadow = true; a.receiveShadow = true; root.add(a);
    const b = new THREE.Mesh(keep(endCap(ring, i, f, southProfile, 0)), M.concrete); b.castShadow = true; root.add(b);
  });

  /* ---------- Roof: compression ring, cables, translucent leading edge ---------- */
  const RF = L.roof;
  // Everything above the stands sits in roofG, lifted off for the overview (a cutaway).
  const roofG = new THREE.Group(); roofG.name = 'roof'; root.add(roofG);
  const roofFor = (st, S) => {
    const back = st.backD; const topY = RF.backY;
    const yAt = (d) => RF.frontY + (topY - RF.frontY) * ((d - RF.frontD) / (back - RF.frontD));
    const clearFrom = 12;
    const sw = (prof, mat, o = {}) => { const m = new THREE.Mesh(keep(sweep(ring, prof, { samples: S, ...o })), mat); m.receiveShadow = true; if (o.cast) m.castShadow = true; (o.parent || root).add(m); return m; };
    sw([[back, topY], [clearFrom, yAt(clearFrom)]], M.roofUnder, { uScale: 8, vScale: 8, cast: true, parent: roofG });
    sw([[clearFrom, yAt(clearFrom)], [RF.frontD, RF.frontY]], M.roofClear, { cast: true, parent: roofG }).renderOrder = 3;
    sw([[RF.frontD, RF.frontY], [RF.frontD, RF.frontY + 1.2], [back, topY + 3.2]], M.roofTop, { uScale: 8, vScale: 40, parent: roofG });
    // Back cladding and the outer facade up to the stated 48 m overall height (modelled shape).
    const topRow = st.id === 'south' ? rowY(s1, s1.rows - 1) : rowY(l5, l5.rows - 1);
    sw([[back, topRow], [back, topY]], M.fascia);
    sw([[back + 2.5, 0], [back + 2.5, topY + 4.0], [back + 1.0, topY + 6.5], [back - 3, topY + 3.6]], M.cladding, { cast: true, shade: [1, 0.85, 0.7] });
    return yAt;
  };
  roofFor(multi, mS); roofFor(south, sS);
  // Compression ring at the back of the roof, and the cable net out to the leading edge.
  const compD = Math.max(multi.backD, south.backD) - 1.5;
  const compGeo = keep(sweep(ring, [[compD - 0.6, RF.backY + 2.6], [compD + 0.6, RF.backY + 2.6], [compD + 0.6, RF.backY + 3.6], [compD - 0.6, RF.backY + 3.6], [compD - 0.6, RF.backY + 2.6]], { samples: ring.samples({ straightStep: 4, cornerSteps: 16 }) }));
  const comp = new THREE.Mesh(compGeo, M.steel); comp.castShadow = true; roofG.add(comp);
  const cables = [];
  ring.samples({ straightStep: 6, cornerSteps: 6 }).slice(0, -1).forEach(({ i, f }) => {
    const pb = ring.point(i, f, compD - 1); const pf = ring.point(i, f, RF.frontD + 0.6);
    cables.push({ a: new THREE.Vector3(pb.x, RF.backY - 0.6, pb.z), b: new THREE.Vector3(pf.x, RF.frontY - 0.4, pf.z), r: 0.07 });
  });
  // Tension ring along the leading edge.
  const tens = new THREE.Mesh(keep(sweep(ring, [[RF.frontD + 0.2, RF.frontY - 0.6], [RF.frontD + 0.2, RF.frontY + 0.1]], { samples: ring.samples({ straightStep: 4, cornerSteps: 16 }) })), M.steelDark); roofG.add(tens);
  const cableGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 5));
  const cableMesh = instanced(cableGeo, M.steel, cables, (c, P, q, sc) => { const d = c.b.clone().sub(c.a); P.copy(c.a).addScaledVector(d, 0.5); q.setFromUnitVectors(up, d.clone().normalize()); sc.set(c.r, d.length(), c.r); });
  cableMesh.castShadow = true; roofG.add(cableMesh);
  // Floodlight strip along the leading edge, with fixtures and glare points.
  const fullS = ring.samples({ straightStep: 4, cornerSteps: 16 });
  roofG.add(new THREE.Mesh(keep(sweep(ring, [[RF.frontD + 0.3, RF.frontY - 0.75], [RF.frontD + 2.4, RF.frontY - 0.7]], { samples: fullS })), M.flood));
  const fixtures = []; const Lf = ring.length(RF.frontD + 1.2);
  for (let s = 0; s < Lf; s += 3.2) fixtures.push(ring.at(s, RF.frontD + 1.2));
  const fixGeo = keep(new THREE.BoxGeometry(0.9, 0.5, 0.7));
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6);
  roofG.add(instanced(fixGeo, M.steelDark, fixtures, (p, P, q, sc) => { P.set(p.x, RF.frontY - 1.05, p.z); q.setFromAxisAngle(up, yawFacing(-p.nx, -p.nz)).multiply(tilt); sc.set(1, 1, 1); }));
  const glarePos = new Float32Array(fixtures.length * 3);
  fixtures.forEach((p, k) => glarePos.set([p.x - p.nx * 0.4, RF.frontY - 1.3, p.z - p.nz * 0.4], k * 3));
  const glareGeo = keep(new THREE.BufferGeometry()); glareGeo.setAttribute('position', new THREE.BufferAttribute(glarePos, 3));
  const glareMat = keep(new THREE.PointsMaterial({ map: keep(TX.glow(64)), size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2, 2, 2.1) }));
  const glare = new THREE.Points(glareGeo, glareMat); roofG.add(glare);

  /* ---------- NFL: goalposts on the end lines and team area benches ---------- */
  if (nfl) {
    // NFL rulebook (design standard): crossbar 10 ft above the ground, uprights 18 ft 6 in
    // apart and 35 ft above the crossbar, posts on the end lines. Offset base post, padded.
    const N = L.nfl; const ft = 0.3048; const y0 = N.level;
    const gpMat = keep(new THREE.MeshStandardMaterial({ color: '#e8c42a', roughness: 0.45, metalness: 0.25 }));
    const padMat = keep(new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 0.85 }));
    const tube = (r, len) => keep(new THREE.CylinderGeometry(r, r, len, 12));
    const barY = y0 + 10 * ft; const half = (18.5 * ft) / 2; const upH = 35 * ft; const back = 1.8;
    [-1, 1].forEach((sd) => {
      const g = new THREE.Group(); const xe = sd * N.hx;
      const base = new THREE.Mesh(tube(0.16, barY - y0 - 0.6), gpMat); base.position.set(xe + sd * back, y0 + (barY - y0 - 0.6) / 2, 0); g.add(base);
      const pad = new THREE.Mesh(tube(0.3, 2.0), padMat); pad.position.set(xe + sd * back, y0 + 1.0, 0); g.add(pad);
      const neck = new THREE.Mesh(tube(0.12, back), gpMat); neck.rotation.z = Math.PI / 2; neck.position.set(xe + sd * back / 2, barY - 0.6, 0); g.add(neck);
      const rise = new THREE.Mesh(tube(0.12, 0.6), gpMat); rise.position.set(xe, barY - 0.3, 0); g.add(rise);
      const bar = new THREE.Mesh(tube(0.1, 2 * half), gpMat); bar.rotation.x = Math.PI / 2; bar.position.set(xe, barY, 0); g.add(bar);
      [-half, half].forEach((z) => { const u = new THREE.Mesh(tube(0.06, upH), gpMat); u.position.set(xe, barY + upH / 2, z); g.add(u); });
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      root.add(g);
    });
    // Team area benches behind each sideline, at least 30 ft back (rulebook); length modelled.
    const benchMat = keep(new THREE.MeshStandardMaterial({ color: '#3a414c', roughness: 0.6, metalness: 0.2 }));
    const benchGeo = keep(new THREE.BoxGeometry(24, 0.5, 0.6)); benchGeo.translate(0, 0.25, 0);
    [-1, 1].forEach((sd) => { const b = new THREE.Mesh(benchGeo, benchMat); b.position.set(0, y0, sd * (N.hz + 30 * ft + 0.8)); b.castShadow = true; root.add(b); });
  }

  /* ---------- Pitch furniture (football mode only) ---------- */
  let ledMat = null; let ledTex = null;
  if (football) {
    ledTex = keep(TX.ledBoards(renderer, 'football'));
    ledMat = keep(new THREE.MeshBasicMaterial({ map: ledTex, color: new THREE.Color(1, 1, 1) }));
    const dB = -3.2;
    root.add(new THREE.Mesh(keep(sweep(ring, [[dB, 0.05], [dB + 0.12, 0.95]], { uScale: 34, vScale: 0.9, uFlip: true })), ledMat));
    const boardBack = new THREE.Mesh(keep(sweep(ring, [[dB + 0.1, 0], [dB + 0.25, 0], [dB + 0.25, 0.97], [dB + 0.13, 0.97]])), M.fascia);
    boardBack.castShadow = true; root.add(boardBack);
    // Goals with nets (7.32 x 2.44 m, the Laws of the Game).
    const netTex = keep(TX.net(renderer)); netTex.repeat.set(30, 10);
    const netMat = keep(new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }));
    const postGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 2.44, 12));
    const barGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 7.44, 12));
    const depth = 2.0;
    const backNet = keep(new THREE.PlaneGeometry(7.32, 2.0)); const topNet = keep(new THREE.PlaneGeometry(depth, 7.32)); const sideNet = keep(new THREE.PlaneGeometry(depth, 2.44));
    [-1, 1].forEach((sd) => {
      const g = new THREE.Group(); const x = sd * L.pitch.hx;
      [-3.66, 3.66].forEach((z) => { const p = new THREE.Mesh(postGeo, M.white); p.position.set(x, 1.22, z); p.castShadow = true; g.add(p); });
      const bar = new THREE.Mesh(barGeo, M.white); bar.rotation.x = Math.PI / 2; bar.position.set(x, 2.44, 0); bar.castShadow = true; g.add(bar);
      const back = new THREE.Mesh(backNet, netMat); back.position.set(x + sd * depth, 1.0, 0); back.rotation.y = Math.PI / 2;
      const topN = new THREE.Mesh(topNet, netMat); topN.rotation.x = -Math.PI / 2; topN.position.set(x + sd * depth / 2, 2.3, 0); topN.rotation.z = sd * 0.07;
      [-3.66, 3.66].forEach((z) => { const sN = new THREE.Mesh(sideNet, netMat); sN.position.set(x + sd * depth / 2, 1.2, z); g.add(sN); });
      g.add(back, topN); root.add(g);
    });
    const flagPole = keep(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6)); const flagGeo = keep(new THREE.PlaneGeometry(0.4, 0.3));
    const flagMat = keep(new THREE.MeshStandardMaterial({ color: '#f2c230', side: THREE.DoubleSide }));
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
      const p = new THREE.Mesh(flagPole, M.white); p.position.set(sx * L.pitch.hx, 0.75, sz * L.pitch.hz); root.add(p);
      const fl = new THREE.Mesh(flagGeo, flagMat); fl.position.set(sx * L.pitch.hx + 0.2, 1.35, sz * L.pitch.hz); root.add(fl);
    });
    // Players' tunnel and the two dugouts on the West side (-z), home dugout at +x (stated
    // side; exact positions modelled).
    const zFront = -(ring.hz + l1.d0);
    const tunnelMouth = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.2, 2.6)), M.dark); tunnelMouth.position.set(0, 1.3, zFront + 0.03); root.add(tunnelMouth);
    const canopy = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.55, 1.55, 5.0, 20, 1, true, -Math.PI / 2, Math.PI)), keep(new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.88 })));
    canopy.rotation.set(-Math.PI / 2, 0, 0); canopy.position.set(0, 0.1, zFront + 2.5); canopy.castShadow = true; root.add(canopy);
    const dugMat = keep(new THREE.MeshPhysicalMaterial({ color: '#4d5f73', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.22, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false }));
    const dugSeat = keep(new THREE.MeshStandardMaterial({ color: '#1c2333', roughness: 0.6 }));
    const dugFrame = keep(new THREE.MeshStandardMaterial({ color: '#20252d', roughness: 0.4, metalness: 0.7 }));
    const shellGeo = keep(new THREE.CylinderGeometry(1.45, 1.45, 9, 16, 1, true, Math.PI / 2, Math.PI / 2));
    const postG = keep(new THREE.BoxGeometry(0.06, 2.0, 0.06)); const baseG = keep(new THREE.BoxGeometry(9, 0.2, 2.2)); const seatG = keep(new THREE.BoxGeometry(0.75, 0.55, 0.6));
    [L.dugouts.home, L.dugouts.away].forEach((x) => {
      const g = new THREE.Group();
      const shell = new THREE.Mesh(shellGeo, dugMat); shell.rotation.set(0, 0, Math.PI / 2); shell.position.set(0, 0.2, 0.6); g.add(shell);
      [-4.5, 4.5].forEach((ex) => [0.55, -1.2].forEach((ez) => { const e = new THREE.Mesh(postG, dugFrame); e.position.set(ex, 1.0, ez); g.add(e); }));
      const base = new THREE.Mesh(baseG, M.fascia); base.position.set(0, 0.1, -0.2); g.add(base);
      for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(seatG, dugSeat); s.position.set(-4 + k, 0.5, -0.6); g.add(s); }
      g.position.set(x, 0, -L.pitch.hz - 2.4); root.add(g);
    });
  }

  // Big screens hung from the roof in two corners (generic, modelled).
  const scrTex = keep(TX.bigScreen(renderer, concert ? 'concert' : nfl ? 'nfl' : 'football'));
  const scrMat = keep(new THREE.MeshBasicMaterial({ map: scrTex, color: new THREE.Color(1.1, 1.1, 1.1) }));
  [3, 7].forEach((seg) => {
    const p = ring.point(seg, 0.5, 4);
    const g = new THREE.Group();
    const scr = new THREE.Mesh(keep(new THREE.PlaneGeometry(16, 9)), scrMat);
    const frameM = new THREE.Mesh(keep(new THREE.BoxGeometry(16.6, 9.6, 0.8)), M.steelDark); frameM.position.z = -0.42;
    g.add(scr, frameM);
    g.position.set(p.x, RF.frontY - 7.5, p.z); g.rotation.y = yawFacing(-p.nx, -p.nz); g.rotateX(0.14);
    roofG.add(g);
  });

  /* ---------- Concert staging ---------- */
  let stage = null;
  if (concert) {
    const floorTex = keep(TX.floorPanels(renderer)); floorTex.repeat.set(22, 14);
    const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(L.pitch.hx * 2 + 6, L.pitch.hz * 2 + 6)), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 })));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true; root.add(floor);
    stage = createStage({ L: L.stage, scale: 1, lowPower, keep });
    root.add(stage.group);
  }

  /* ---------- Seats and crowd ---------- */
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const bandGeo = keep(mergeGeometries(bands));
  bands.forEach((g) => g.dispose());
  const seats = new SeatField({ slots: slotsAll, bandGeo, bandTexture: keep(TX.seatBand(renderer)), nearCapacity: lowPower ? 1200 : 3600 });
  root.add(seats.group);
  void southRes;

  const crowd = new Crowd({ lowPower });
  const awayArc = (s) => s.x > ring.ax - 2 && s.z > ring.az - 2 && s.tier === 'l1';
  slotsAll.forEach((s) => {
    if (concert && s.x > ring.hx - 6 && Math.abs(s.z) < ring.hz + 8) return; // behind the stage: not sold
    const keepV = R();
    if (lowPower && R() < 0.35) return;
    const smart = s.tier === 'l2' || s.tier === 'l4';
    const pal = concert ? 'concert' : smart ? 'smart' : nfl ? 'neutral' : awayArc(s) ? 'away' : 'football';
    crowd.add({ x: s.x, y: s.y, z: s.z, yaw: yawFacing(-s.nx, -s.nz), seated: true, angle: s.angle, palette: pal, keep: s.tier === 'l4' ? keepV * 1.6 : keepV, armsUp: concert && R() < 0.12 ? 0.5 : 0 });
  });
  if (concert) {
    const st = L.stage;
    fillFloor(crowd, {
      x0: -L.pitch.hx + 8, x1: st.frontX - 3, z0: -L.pitch.hz + 2, z1: L.pitch.hz - 2, spacing: lowPower ? 0.95 : 0.7,
      face: new THREE.Vector3(st.backX, 0, 0), palette: 'concert', armsUp: 0.22, phones: 0.07, seed: 31,
      skip: (x, z) => (Math.abs(x + 6) < 3 && Math.abs(z) < 4) || (x > st.frontX - 6 && Math.abs(z) < 4),
    });
  }
  crowd.finalize();
  root.add(crowd.group);

  /* ---------- Players and ball (football mode only) ---------- */
  let team = null; let ball = null; const playerHome = [];
  if (football) {
    team = new Crowd({ forceNear: true });
    const form = [[-50, 0], [-36, -20], [-38, -7], [-38, 7], [-36, 20], [-20, -14], [-22, 0], [-20, 14], [-6, -22], [-4, 0], [-6, 22]];
    form.forEach(([x, z], k) => { playerHome.push([x * 0.9 + 4, z]); team.add({ x: x * 0.9 + 4, y: 0, z, yaw: Math.PI / 2, seated: false, cloth: k === 0 ? '#2fa84f' : '#f4f4f2' }); });
    form.forEach(([x, z], k) => { playerHome.push([-x * 0.9 - 2, -z + 1.5]); team.add({ x: -x * 0.9 - 2, y: 0, z: -z, yaw: -Math.PI / 2, seated: false, cloth: k === 0 ? '#f2c230' : '#b5202f' }); });
    playerHome.push([6, 10]); team.add({ x: 6, y: 0, z: 10, yaw: 0, seated: false, cloth: '#121418' });
    team.finalize(); root.add(team.group);
    ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 16, 12)), M.white); root.add(ball);
  }

  const m4 = new THREE.Matrix4(); const qq = new THREE.Quaternion(); const pp = new THREE.Vector3(); const ss = new THREE.Vector3(1, 1, 1);
  function updatePlayers(t, still) {
    if (!team) return;
    const mesh = team.meshes.tn; const Tt = still ? 0 : t;
    const flow = Math.sin(Tt * 0.08) * 14; const lat = Math.sin(Tt * 0.13) * 9;
    const bx = flow + Math.sin(Tt * 0.5) * 6; const bz = lat + Math.cos(Tt * 0.37) * 5;
    playerHome.forEach(([hx, hz], k) => {
      const follow = k === 0 || k === 11 ? 0.15 : 0.55;
      const x = hx + flow * follow + Math.sin(Tt * 0.6 + k) * 1.2;
      const z = hz + lat * follow * 0.6 + Math.cos(Tt * 0.5 + k * 1.7) * 1.2;
      pp.set(x, 0, z); qq.setFromAxisAngle(up, Math.atan2(bx - x, bz - z)); m4.compose(pp, qq, ss); mesh.setMatrixAt(k, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    ball.position.set(bx, 0.11 + Math.abs(Math.sin(Tt * 1.7)) * 0.25 * (still ? 0 : 1), bz); ball.rotation.x = Tt * 3;
  }
  updatePlayers(0, true);

  const ov = L.overview;
  return {
    root, crowd, seats, indoor: false,
    setViewer: (pos) => hidePartitions(partMesh, partitions, suites.floorY, pos),
    setView(v) { roofG.visible = v !== 'overview'; },
    bounds: { center: new THREE.Vector3(0, 16, 0), radius: 135 },
    overview: { position: new THREE.Vector3(...ov.position), target: new THREE.Vector3(concert ? 10 : 0, 0, 6), minDistance: 70, maxDistance: 380 },
    setMood(m, info) {
      const flood = info.flood ?? 0;
      M.flood.color.setScalar(0.5 + flood * 3.5).multiply(new THREE.Color('#f4f7ff'));
      glare.visible = flood > 0.3; glareMat.color.setScalar(1.2 + flood * 1.6); glareMat.opacity = Math.min(1, flood);
      const night = m === 'night';
      M.interior.emissiveIntensity = night ? 0.9 : m === 'golden' ? 0.5 : 0.22;
      lampMat.color.setRGB(night ? 2.6 : 1.4, night ? 2.1 : 1.15, night ? 1.5 : 0.8);
      ribbonMat.color.setScalar(night ? 1.3 : 0.95);
      ledMat?.color.setScalar(night ? 1.35 : 1.0);
      scrMat.color.setScalar(night ? 1.4 : 1.05);
      stage?.setMood(m);
    },
    update(t, dt, { still }) {
      crowd.update(t, { still, bounce: concert ? 1 : 0, beat: concert ? 4.2 : 2.2 });
      team?.update(t, { still });
      updatePlayers(t, still);
      if (!still) { if (ledTex) ledTex.offset.x = (t * 0.012) % 1; ribbonTex.offset.x = (-t * 0.006) % 1; }
      stage?.update(t, dt, still);
    },
    dispose() {
      seats.dispose(); crowd.dispose(); team?.dispose(); stage?.dispose();
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
