// Foreground realism: the things right around YOUR seat that make a frame read as a
// particular ticket. Built in world space around the seat (so turning your head
// reveals them naturally) and rebuilt whenever the seat changes.
//
// Kinds (spec.foreground, from layouts.js):
//   box          inside a private box or suite: glass with frame, table edge with
//                glasses and plates, panelled walls, ceiling downlights, two guests
//   balcony      box balcony seats outside the glass: glass balustrade in front
//   suite-seats  arena suite seats out front (same as balcony)
//   premium      padded seats (handled by the seat field), nothing extra
//   pitchside    nothing extra: boards and the pitch are already close
//   upper        steep tier: the stand's own aisle handrails and the many heads below
//   floor        standing on an arena floor: two phones held up in front of you
//   ringside     a low padded barrier and the ring apron close by
//
// Return value: { group, update(t, still), dispose() }.

import * as THREE from 'three';
import { Crowd } from './crowd.js';
import { glassStreaks } from './textures.js';

const up = new THREE.Vector3(0, 1, 0);

function frame(spec) {
  // Inward direction (towards the action) from the stand normal, and the right-hand side.
  const P = new THREE.Vector3().fromArray(spec.position);
  const n = new THREE.Vector3().fromArray(spec.normal || [0, 0, -1]);
  const inward = n.clone().multiplyScalar(-1).setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(inward, up).normalize();
  return { P, inward, right };
}

// Places a mesh in the seat frame: a = along inward, b = along right, y absolute.
function at(mesh, f, a, b, y, yawExtra = 0) {
  mesh.position.copy(f.P).addScaledVector(f.inward, a).addScaledVector(f.right, b);
  mesh.position.y = y;
  mesh.rotation.y = Math.atan2(f.inward.x, f.inward.z) + yawExtra;
  return mesh;
}

function wineGlass(mat) {
  const pts = [[0, 0], [0.035, 0], [0.036, 0.004], [0.006, 0.01], [0.004, 0.09], [0.012, 0.1], [0.036, 0.13], [0.04, 0.17], [0.036, 0.21], [0.034, 0.215]];
  return new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 18), mat);
}

function flute(mat) {
  const pts = [[0, 0], [0.03, 0], [0.032, 0.004], [0.005, 0.01], [0.004, 0.1], [0.018, 0.12], [0.024, 0.2], [0.022, 0.25]];
  return new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 16), mat);
}

function bottle(mat) {
  const pts = [[0, 0], [0.042, 0], [0.044, 0.02], [0.044, 0.2], [0.03, 0.26], [0.014, 0.3], [0.014, 0.36], [0.016, 0.37], [0, 0.37]];
  return new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 16), mat);
}

export function buildForeground(spec, { lowPower = false } = {}) {
  const group = new THREE.Group(); group.name = 'foreground';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  let guests = null; let light = null;
  const extraCrowds = [];
  const f = frame(spec);
  const kind = spec.foreground;

  if (kind === 'box' || kind === 'restaurant') {
    const restaurant = kind === 'restaurant';
    const floorY = spec.floorY ?? spec.position[1] - 1.2;
    const ceilY = spec.ceilY ?? floorY + 3;
    const g = spec.glassDist ?? 1.2; // distance from camera to the glass line
    const halfW = restaurant ? 13 : (spec.boxHalfW ?? 3.6);
    const deep = g + (restaurant ? 7.5 : 3.6); // back wall distance behind the glass

    const wood = keep(new THREE.MeshStandardMaterial({ color: '#5a3f2b', roughness: 0.55, metalness: 0.0 }));
    const wall = keep(new THREE.MeshStandardMaterial({ color: '#d9d2c5', roughness: 0.9 }));
    const carpet = keep(new THREE.MeshStandardMaterial({ color: '#2a2f3d', roughness: 1 }));
    const metal = keep(new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.35, metalness: 0.8 }));
    const cloth = keep(new THREE.MeshStandardMaterial({ color: '#fbf5ea', roughness: 0.85 }));
    const china = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 }));
    const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.32, envMapIntensity: 1.6, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
    const wine = keep(new THREE.MeshPhysicalMaterial({ color: '#5e0f1b', roughness: 0.15, transparent: true, opacity: 0.85 }));
    const bottleMat = keep(new THREE.MeshPhysicalMaterial({ color: '#1f3a26', roughness: 0.18, metalness: 0.1, clearcoat: 1 }));
    const lamp = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.7) }));
    const reflMat = keep(new THREE.MeshBasicMaterial({ map: keep(glassStreaks()), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));

    // Side partitions, back wall, ceiling, floor.
    const sideGeo = keep(new THREE.BoxGeometry(0.12, ceilY - floorY, deep + 0.4));
    if (!restaurant) [-1, 1].forEach((s) => {
      const m = at(new THREE.Mesh(sideGeo, wood), f, g - (deep + 0.4) / 2 + 0.2, s * halfW, floorY + (ceilY - floorY) / 2);
      m.receiveShadow = true; group.add(m);
    });
    const back = at(new THREE.Mesh(keep(new THREE.PlaneGeometry(halfW * 2, ceilY - floorY)), wall), f, g - deep, 0, floorY + (ceilY - floorY) / 2);
    group.add(back);
    const ceil = at(new THREE.Mesh(keep(new THREE.PlaneGeometry(halfW * 2, deep)), wall), f, g - deep / 2, 0, ceilY);
    ceil.rotateX(Math.PI / 2); group.add(ceil);
    const floor = at(new THREE.Mesh(keep(new THREE.PlaneGeometry(halfW * 2, deep)), carpet), f, g - deep / 2, 0, floorY + 0.01);
    floor.rotateX(-Math.PI / 2); floor.receiveShadow = true; group.add(floor);
    // Downlights.
    const dl = keep(new THREE.CircleGeometry(0.07, 16));
    const dlCols = restaurant ? [-10.8, -8.4, -6, -3.6, -1.2, 1.2, 3.6, 6, 8.4, 10.8] : [-1.2, 1.2].map((v) => v * Math.min(1, halfW / 2.4));
    for (let i = 0; i < (restaurant ? 4 : 3); i++) dlCols.forEach((j) => {
      const m = at(new THREE.Mesh(dl, lamp), f, g - 0.8 - i * 1.2, j, ceilY - 0.01); m.rotateX(Math.PI / 2); group.add(m);
    });
    // Glass frame: mullions and a low transom at the glass line, with soft reflections.
    const mull = keep(new THREE.BoxGeometry(0.07, ceilY - floorY, 0.1));
    const mulls = restaurant ? Array.from({ length: 17 }, (_, k) => -12.8 + k * 1.6) : [-halfW + 0.05, -1.5, 1.5, halfW - 0.05].filter((b, k, a) => k === 0 || k === a.length - 1 || Math.abs(b) < halfW - 0.4);
    mulls.forEach((b) => group.add(at(new THREE.Mesh(mull, metal), f, g, b, floorY + (ceilY - floorY) / 2)));
    const tran = keep(new THREE.BoxGeometry(halfW * 2, 0.06, 0.08));
    group.add(at(new THREE.Mesh(tran, metal), f, g, 0, floorY + 1.05));
    group.add(at(new THREE.Mesh(tran, metal), f, g, 0, floorY + 0.04));
    const refl = at(new THREE.Mesh(keep(new THREE.PlaneGeometry(halfW * 2, ceilY - floorY)), reflMat), f, g - 0.02, 0, floorY + (ceilY - floorY) / 2);
    refl.rotateY(Math.PI); group.add(refl);
    const paneMat = keep(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.03, transparent: true, opacity: 0.04, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide }));
    const pane = at(new THREE.Mesh(keep(new THREE.PlaneGeometry(halfW * 2, ceilY - floorY)), paneMat), f, g - 0.03, 0, floorY + (ceilY - floorY) / 2);
    group.add(pane);

    // Dining table between you and the glass, with its edge at the bottom of the frame.
    const tableY = floorY + 0.76;
    const tA = restaurant ? 0.55 : Math.max(0.55, g - 1.2); const tDepth = 0.9;
    if (restaurant) {
      // Other tables along the window and behind, each with a cloth, glasses and diners.
      const others = [[g - 0.75, -3.6], [g - 0.75, 3.8], [g - 0.75, -7.4], [g - 0.75, 7.6], [g - 0.75, -11], [g - 0.75, 11]];
      if (g > 2.6) others.push([g - 0.75, 0]);
      others.push([-1.6, -3.4], [-1.6, 3.6], [-1.6, -7.2], [-1.6, 7.4]);
      const tGeo = keep(new THREE.BoxGeometry(1.6, 0.04, 0.9)); const sGeo = keep(new THREE.BoxGeometry(1.6, 0.3, 0.02));
      const diners = new Crowd({ forceNear: true });
      others.forEach(([a, b], k) => {
        group.add(at(new THREE.Mesh(tGeo, cloth), f, a, b, tableY));
        group.add(at(new THREE.Mesh(sGeo, cloth), f, a - 0.45, b, tableY - 0.16));
        [-0.4, 0.4].forEach((o) => { const wg = at(wineGlass(glassMat), f, a + 0.15, b + o, tableY + 0.02); keep(wg.geometry); group.add(wg); });
        // Two diners facing each other across the table (window side diners face the room).
        [[a - 0.75, b + 0.15, 0], [a + 0.75, b - 0.15, Math.PI]].forEach(([da, db, turn], n) => {
          if ((k + n) % 3 === 2 || b === 0) return; // the window table straight ahead is free, so the view stays open
          const p = new THREE.Vector3().copy(f.P).addScaledVector(f.inward, da).addScaledVector(f.right, db);
          diners.add({ x: p.x, y: floorY, z: p.z, yaw: Math.atan2(f.inward.x, f.inward.z) + turn + (n ? 0.3 : -0.2), seated: true, palette: 'raceday' });
        });
      });
      diners.finalize(); group.add(diners.group);
      extraCrowds.push(diners);
    }
    const top = at(new THREE.Mesh(keep(new THREE.BoxGeometry(3.2, 0.04, tDepth)), cloth), f, tA + tDepth / 2 - 0.05, 0, tableY);
    top.receiveShadow = true; group.add(top);
    const skirt = at(new THREE.Mesh(keep(new THREE.BoxGeometry(3.2, 0.3, 0.02)), cloth), f, tA - 0.04, 0, tableY - 0.16);
    group.add(skirt);
    // Place settings.
    const plate = keep(new THREE.CylinderGeometry(0.14, 0.12, 0.015, 28));
    const settings = [-0.95, 0, 0.95];
    settings.forEach((b, k) => {
      group.add(at(new THREE.Mesh(plate, china), f, tA + 0.2, b, tableY + 0.03));
      const wg = at(wineGlass(glassMat), f, tA + 0.42, b + 0.22, tableY + 0.02); keep(wg.geometry); group.add(wg);
      const wl = at(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.022, 0.035, 14)), wine), f, tA + 0.42, b + 0.22, tableY + 0.02 + 0.13); group.add(wl);
      if (k !== 1) { const fl = at(flute(glassMat), f, tA + 0.5, b + 0.36, tableY + 0.02); keep(fl.geometry); group.add(fl); }
      const knife = at(new THREE.Mesh(keep(new THREE.BoxGeometry(0.015, 0.004, 0.2)), metal), f, tA + 0.2, b + 0.19, tableY + 0.025); group.add(knife);
      const fork = at(new THREE.Mesh(keep(new THREE.BoxGeometry(0.02, 0.004, 0.18)), metal), f, tA + 0.2, b - 0.19, tableY + 0.025); group.add(fork);
    });
    const bt = at(bottle(bottleMat), f, tA + 0.62, -0.45, tableY + 0.02); keep(bt.geometry); group.add(bt);

    // Two guests at the table, one each side of you.
    guests = new Crowd({ forceNear: true });
    [[-2.0, tA + 0.75], [2.05, tA + 0.55]].forEach(([b, a]) => {
      const p = new THREE.Vector3().copy(f.P).addScaledVector(f.inward, a).addScaledVector(f.right, b);
      const yaw = Math.atan2(f.inward.x, f.inward.z) + (b < 0 ? 0.5 : -0.45);
      guests.add({ x: p.x, y: floorY, z: p.z, yaw, seated: true, palette: 'smart' });
    });
    guests.finalize();
    group.add(guests.group);
    // Warm light over the table (the engine owns one permanent point light and moves it here).
    light = { position: new THREE.Vector3().copy(f.P).addScaledVector(f.inward, tA + 0.3).setY(ceilY - 0.25), color: '#ffd29c', intensity: 4.5, distance: 8 };
  }

  if ((kind === 'balcony' || kind === 'suite-seats' || kind === 'race-balcony') && spec.railDist != null) {
    // A slim metal top rail on the venue's glass balustrade in front of you.
    const rail = keep(new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.3, metalness: 0.9 }));
    const top = at(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.022, 0.022, 7, 10)), rail), f, spec.railDist, 0, spec.railY);
    top.rotateZ(Math.PI / 2); group.add(top);
  }

  if (kind === 'race-balcony') {
    // A timber ledge on the glass rail with two flutes of champagne, the neighbouring
    // balcony screens, and two guests on balcony chairs either side of you.
    const halfW = spec.boxHalfW ?? 2.4;
    const timber = keep(new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.45 }));
    const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, transparent: true, opacity: 0.35, envMapIntensity: 1.6, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
    const fizz = keep(new THREE.MeshPhysicalMaterial({ color: '#f1d98a', roughness: 0.1, transparent: true, opacity: 0.8, emissive: new THREE.Color('#5a4410'), emissiveIntensity: 0.25 }));
    const frost = keep(new THREE.MeshPhysicalMaterial({ color: '#dfe7ee', roughness: 0.35, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    const ledge = at(new THREE.Mesh(keep(new THREE.BoxGeometry(halfW * 2, 0.04, 0.22)), timber), f, spec.railDist - 0.02, 0, spec.railY + 0.03);
    ledge.receiveShadow = true; group.add(ledge);
    [[-0.95, 0.02], [-0.78, -0.03]].forEach(([b, da]) => {
      const fl = at(flute(glassMat), f, spec.railDist + da, b, spec.railY + 0.05); keep(fl.geometry); group.add(fl);
      group.add(at(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.021, 0.016, 0.1, 14)), fizz), f, spec.railDist + da, b, spec.railY + 0.05 + 0.16));
    });
    [-1, 1].forEach((s) => {
      const scr = at(new THREE.Mesh(keep(new THREE.PlaneGeometry(spec.railDist + 2.2, 1.9)), frost), f, spec.railDist / 2 - 0.9, s * halfW, spec.floorY + 0.95);
      scr.rotateY(Math.PI / 2); group.add(scr);
    });
    guests = new Crowd({ forceNear: true });
    [[-1.05, 0.35], [1.1, 0.2]].forEach(([b, a]) => {
      const p = new THREE.Vector3().copy(f.P).addScaledVector(f.inward, a).addScaledVector(f.right, b);
      guests.add({ x: p.x, y: spec.floorY, z: p.z, yaw: Math.atan2(f.inward.x, f.inward.z) + (b < 0 ? 0.35 : -0.4), seated: false, palette: 'raceday' });
    });
    guests.finalize(); group.add(guests.group);
  }

  if (kind === 'hall-box') {
    // Inside a hall box: velvet curtains at the back, a programme and a flute on the
    // parapet cushion, a side table with an ice bucket, and a warm sconce light.
    const floorY = spec.floorY; const ceilY = spec.ceilY;
    const back = spec.parapetDist - spec.boxDepth;
    const halfW = spec.boxHalf ?? 1.6;
    const velvet = keep(new THREE.MeshStandardMaterial({ color: '#6a1418', roughness: 0.95 }));
    const gold = keep(new THREE.MeshStandardMaterial({ color: '#caa252', roughness: 0.3, metalness: 1 }));
    const paper = keep(new THREE.MeshStandardMaterial({ color: '#f1ead8', roughness: 0.8 }));
    const glassMat = keep(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, transparent: true, opacity: 0.35, envMapIntensity: 1.6, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
    const fizz = keep(new THREE.MeshPhysicalMaterial({ color: '#f1d98a', roughness: 0.1, transparent: true, opacity: 0.8 }));
    const metal = keep(new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.2, metalness: 1 }));
    const fold = keep(new THREE.CylinderGeometry(0.07, 0.07, ceilY - floorY - 0.1, 8));
    [-1, 1].forEach((s) => {
      for (let k = 0; k < 6; k++) {
        const m = at(new THREE.Mesh(fold, velvet), f, back + 0.14 + (k % 2) * 0.05, s * (halfW - 0.12 - k * 0.12), floorY + (ceilY - floorY) / 2);
        group.add(m);
      }
    });
    const rod = at(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02, 0.02, halfW * 2, 8)), gold), f, back + 0.16, 0, ceilY - 0.12);
    rod.rotateZ(Math.PI / 2); group.add(rod);
    const prog = at(new THREE.Mesh(keep(new THREE.BoxGeometry(0.21, 0.012, 0.3)), paper), f, spec.parapetDist + 0.08, 0.38, spec.parapetY + 0.012, 0.25);
    group.add(prog);
    const fl = at(flute(glassMat), f, spec.parapetDist + 0.06, -0.95, spec.parapetY + 0.005); keep(fl.geometry); group.add(fl);
    group.add(at(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.021, 0.016, 0.1, 14)), fizz), f, spec.parapetDist + 0.06, -0.95, spec.parapetY + 0.165));
    // Side table at the back corner with an ice bucket and a bottle.
    const tbl = at(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20)), keep(new THREE.MeshStandardMaterial({ color: '#3d2416', roughness: 0.4 }))), f, back + 0.6, -halfW + 0.45, floorY + 0.75);
    group.add(tbl);
    group.add(at(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 0.74, 8)), gold), f, back + 0.6, -halfW + 0.45, floorY + 0.37));
    const bucket = at(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.11, 0.09, 0.22, 18, 1, true)), metal), f, back + 0.6, -halfW + 0.45, floorY + 0.88);
    group.add(bucket);
    const bt = at(bottle(keep(new THREE.MeshPhysicalMaterial({ color: '#1f3a26', roughness: 0.18, clearcoat: 1 }))), f, back + 0.6, -halfW + 0.45, floorY + 0.8);
    bt.rotateX(0.25); keep(bt.geometry); group.add(bt);
    light = { position: new THREE.Vector3().copy(f.P).addScaledVector(f.inward, back + 0.3).setY(floorY + 2.0), color: '#ffcf9a', intensity: 3.2, distance: 6 };
  }
  if (kind === 'floor') {
    const body = keep(new THREE.MeshStandardMaterial({ color: '#111317', roughness: 0.4, metalness: 0.3 }));
    const screen = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.6, 1.8) }));
    const skin = keep(new THREE.MeshStandardMaterial({ color: '#c99a78', roughness: 0.7 }));
    [[2.2, -0.55, 0.38], [3.4, 0.7, 0.3]].forEach(([a, b, lift]) => {
      const g = new THREE.Group();
      const ph = new THREE.Mesh(keep(new THREE.BoxGeometry(0.08, 0.16, 0.01)), body);
      const sc = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.07, 0.145)), screen); sc.position.z = -0.006; sc.rotation.y = Math.PI;
      const hand = new THREE.Mesh(keep(new THREE.BoxGeometry(0.09, 0.06, 0.05)), skin); hand.position.set(0, -0.08, 0.02);
      const arm = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 8)), skin); arm.position.set(0.02, -0.33, 0.06); arm.rotation.x = 0.3;
      g.add(ph, sc, hand, arm);
      at(g, f, a, b, f.P.y + lift);
      g.rotateX(-0.12);
      group.add(g);
    });
  }

  if (kind === 'ringside') {
    const pad = keep(new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.7 }));
    const barrier = at(new THREE.Mesh(keep(new THREE.BoxGeometry(14, 0.9, 0.25)), pad), f, 1.15 + (spec.rowIndex || 0) * 1.9, 0, 0.45);
    group.add(barrier);
  }

  // Every prop sits under the venue's own roof or ceiling, so every prop receives shadow
  // (otherwise the key light reaches plates and cloths straight through a box ceiling).
  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

  return {
    group,
    light,
    update(t, still) { guests?.update(t, { still }); extraCrowds.forEach((c) => c.update(t, { still })); },
    dispose() { disposables.forEach((d) => d.dispose?.()); guests?.dispose(); extraCrowds.forEach((c) => c.dispose()); },
  };
}
