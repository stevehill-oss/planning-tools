// End stage for concerts, shared by the stadium and the arena (scaled).
// Deck, truss towers and roof grid, an LED wall with an animated shader, side screens,
// hanging PA, a light rig with additive beams, and a small band on stage.
// L: { frontX, backX, hz, deck }. scale: 1 for stadiums, about 0.6 for arenas.

import * as THREE from 'three';
import { instanced } from '../bowl.js';
import { Crowd } from '../crowd.js';

const up = new THREE.Vector3(0, 1, 0);

const LED_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const LED_FRAG = /* glsl */`
uniform float uTime; uniform float uGain; uniform vec2 uRes; uniform float uSeed;
varying vec2 vUv;
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + t)); }
void main() {
  vec2 uv = vUv;
  float t = uTime * 0.25 + uSeed;
  // Slow flowing bands with a bright horizon line, like stage visuals.
  float w = sin(uv.x * 6.0 + t * 2.0) * 0.08 + sin(uv.x * 13.0 - t * 3.1) * 0.04;
  float band = smoothstep(0.02, 0.0, abs(uv.y - 0.45 - w)) * 1.6;
  vec3 col = mix(vec3(0.03, 0.02, 0.10), pal(0.62 + 0.1 * sin(t)) * 0.9, smoothstep(0.0, 1.0, uv.y));
  col *= 0.55 + 0.45 * sin(uv.x * 3.0 + t);
  col += pal(t * 0.2 + uv.x * 0.3) * band;
  float rays = pow(max(0.0, sin(atan(uv.y - 0.45, uv.x - 0.5) * 9.0 + t * 1.5)), 12.0) * smoothstep(0.9, 0.2, distance(uv, vec2(0.5, 0.45)));
  col += vec3(1.0, 0.85, 0.6) * rays * 0.5;
  // LED pixel grid.
  vec2 g = fract(uv * uRes);
  float px = smoothstep(0.0, 0.15, g.x) * smoothstep(0.0, 0.15, g.y) * smoothstep(1.0, 0.85, g.x) * smoothstep(1.0, 0.85, g.y);
  col *= 0.55 + 0.45 * px;
  gl_FragColor = vec4(col * uGain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const BEAM_VERT = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const BEAM_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uOpacity;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
#include <common>
#include <fog_pars_fragment>
void main() {
  float along = pow(vUv.y, 1.6);
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
  gl_FragColor = vec4(uColor * along * edge * uOpacity, 1.0);
  #include <fog_fragment>
}`;

export function createStage({ L, scale = 1, lowPower = false, keep = (x) => x, beams: beamCount = 16, palette = 'stadium' }) {
  const s = scale;
  const g = new THREE.Group(); g.name = 'stage';
  const black = keep(new THREE.MeshStandardMaterial({ color: '#0c0d10', roughness: 0.8 }));
  const truss = keep(new THREE.MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.35, metalness: 0.9 }));
  const W = L.backX - L.frontX; const H = 26 * s; const deck = L.deck;

  // Deck.
  const deckMesh = new THREE.Mesh(keep(new THREE.BoxGeometry(W, deck, L.hz * 2)), black);
  deckMesh.position.set((L.frontX + L.backX) / 2, deck / 2, 0); deckMesh.castShadow = true; deckMesh.receiveShadow = true; g.add(deckMesh);
  // Thrust platform into the crowd.
  const thrust = new THREE.Mesh(keep(new THREE.BoxGeometry(8 * s, deck, 6 * s)), black);
  thrust.position.set(L.frontX - 4 * s, deck / 2, 0); g.add(thrust);
  // Barrier.
  const barrier = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 1.2, L.hz * 2 + 4)), keep(new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.4, metalness: 0.7 })));
  barrier.position.set(L.frontX - 8.5 * s - 1.2, 0.6, 0); g.add(barrier);

  // Towers and roof grid as truss members.
  const members = [];
  const tx = [L.frontX + 1, L.backX - 1]; const tz = [-(L.hz - 0.6), L.hz - 0.6];
  const seg = (a, b, r = 0.45 * Math.max(0.6, s)) => members.push({ a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), r });
  tx.forEach((x) => tz.forEach((z) => seg([x, 0, z], [x, H, z], 0.9 * Math.max(0.6, s))));
  tx.forEach((x) => seg([x, H, tz[0]], [x, H, tz[1]]));
  tz.forEach((z) => seg([tx[0], H, z], [tx[1], H, z]));
  for (let k = 1; k < 4; k++) { const x = tx[0] + (tx[1] - tx[0]) * (k / 4); seg([x, H, tz[0]], [x, H, tz[1]], 0.3 * Math.max(0.6, s)); }
  const rigY = H - 3 * s;
  seg([tx[0] - 0.5, rigY, tz[0]], [tx[0] - 0.5, rigY, tz[1]], 0.35 * Math.max(0.6, s));
  seg([tx[0] + W * 0.45, rigY + 1, tz[0]], [tx[0] + W * 0.45, rigY + 1, tz[1]], 0.35 * Math.max(0.6, s));
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const trussMesh = instanced(box, truss, members, (m, P, q, sc) => {
    const d = m.b.clone().sub(m.a); P.copy(m.a).addScaledVector(d, 0.5); q.setFromUnitVectors(up, d.clone().normalize()); sc.set(m.r, d.length(), m.r);
  });
  trussMesh.castShadow = true; g.add(trussMesh);
  // Roof skin.
  const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(W + 2, 0.4, L.hz * 2 + 1)), black);
  roof.position.set((L.frontX + L.backX) / 2, H + 0.4, 0); roof.castShadow = true; g.add(roof);
  // Back drape behind the wall.
  const drape = new THREE.Mesh(keep(new THREE.PlaneGeometry(L.hz * 2, H)), black);
  drape.position.set(L.backX - 0.3, H / 2, 0); drape.rotation.y = -Math.PI / 2; g.add(drape);

  // LED wall and side screens.
  const ledU = { uTime: { value: 0 }, uGain: { value: 1.2 }, uRes: { value: new THREE.Vector2(96, 40) }, uSeed: { value: 0 } };
  const ledMat = keep(new THREE.ShaderMaterial({ uniforms: ledU, vertexShader: LED_VERT, fragmentShader: LED_FRAG, toneMapped: true }));
  const wallW = L.hz * 2 * 0.74; const wallH = 14 * s;
  const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(wallW, wallH)), ledMat);
  wall.position.set(L.backX - 1.4, deck + 1 + wallH / 2, 0); wall.rotation.y = -Math.PI / 2; g.add(wall);
  const sideU = { uTime: ledU.uTime, uGain: ledU.uGain, uRes: { value: new THREE.Vector2(24, 34) }, uSeed: { value: 3.0 } };
  const sideMat = keep(new THREE.ShaderMaterial({ uniforms: sideU, vertexShader: LED_VERT, fragmentShader: LED_FRAG, toneMapped: true }));
  [-1, 1].forEach((side) => {
    const scr = new THREE.Mesh(keep(new THREE.PlaneGeometry(7 * s, 10 * s)), sideMat);
    scr.position.set(L.frontX + 2, deck + 6 * s + 4 * s, side * (L.hz + 4.5 * s)); scr.rotation.y = -Math.PI / 2 + side * -0.25; g.add(scr);
    const fr = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 10.6 * s, 7.6 * s)), black);
    fr.position.copy(scr.position).add(new THREE.Vector3(0.3, 0, 0)); fr.rotation.y = side * -0.25; g.add(fr);
    // Hanging PA line array.
    for (let k = 0; k < 10; k++) {
      const cab = new THREE.Mesh(box, black);
      cab.scale.set(1.2 * s, 0.6 * s, 1.6 * s);
      cab.position.set(L.frontX + 0.6, H - 4 * s - k * 0.62 * s, side * (L.hz - 2.5 * s));
      cab.rotation.z = -0.02 * k; g.add(cab);
    }
  });

  // Light fixtures and beams.
  const beamU = [];
  const beams = new THREE.Group();
  const fixtureMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.6) }));
  const coneH = 46 * s; const coneR = 2.8 * s;
  const coneGeo = keep(new THREE.ConeGeometry(coneR, coneH, 24, 1, true)); coneGeo.translate(0, -coneH / 2, 0);
  const lensGeo = keep(new THREE.SphereGeometry(0.28 * Math.max(0.7, s), 10, 8));
  const colours = palette === 'arena' ? ['#7aa7ff', '#ff5fa2', '#ffffff', '#9b7bff'] : ['#ffffff', '#9fc4ff', '#ffd59a', '#c58bff'];
  const n = lowPower ? Math.ceil(beamCount / 2) : beamCount;
  for (let k = 0; k < n; k++) {
    const z = -L.hz + 1.5 + (2 * L.hz - 3) * (k / Math.max(1, n - 1));
    const x = k % 2 ? tx[0] - 0.5 : tx[0] + W * 0.45;
    const y = k % 2 ? rigY - 0.6 : rigY + 0.4;
    const pivot = new THREE.Group(); pivot.position.set(x, y, z);
    const u = { uColor: { value: new THREE.Color(colours[k % colours.length]) }, uOpacity: { value: 0.4 } };
    beamU.push(u);
    const mat = keep(new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsLib.fog, ...u }, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
    }));
    const cone = new THREE.Mesh(coneGeo, mat);
    const lens = new THREE.Mesh(lensGeo, fixtureMat);
    pivot.add(cone, lens);
    pivot.userData = { base: [-0.55 - (k % 3) * 0.12, (k / n - 0.5) * 0.6], k };
    pivot.rotation.order = 'YXZ';
    beams.add(pivot);
  }
  g.add(beams);

  // A small band on stage.
  const band = new Crowd({ forceNear: true });
  [[0.35, 0], [0.55, -0.32], [0.55, 0.32], [0.8, 0.15]].forEach(([fx, fz]) => {
    band.add({ x: L.frontX + W * fx * 0.6, y: deck, z: fz * L.hz, yaw: -Math.PI / 2, seated: false, cloth: '#15171c', armsUp: 0.3 });
  });
  band.finalize();
  g.add(band.group);

  // Front light on the performers.
  const wash = new THREE.SpotLight('#ffe6c8', 0, 0, 0.5, 0.7, 0);
  wash.position.set(L.frontX - 30 * s, 22 * s, 0); wash.target.position.set(L.frontX + 3, deck + 1, 0);
  g.add(wash, wash.target);

  function pose(t) {
    beams.children.forEach((p) => {
      const [bx, bz] = p.userData.base; const k = p.userData.k;
      p.rotation.y = 0;
      p.rotation.z = bx + Math.sin(t * 0.45 + k) * 0.28; // negative tilts the beam towards the crowd (-x)
      p.rotation.x = bz + Math.cos(t * 0.33 + k * 0.8) * 0.3;
    });
  }
  pose(0);

  return {
    group: g,
    setMood(m) {
      const night = m === 'night';
      ledU.uGain.value = night ? 1.3 : m === 'golden' ? 1.2 : 1.05;
      const op = night ? 0.5 : m === 'golden' ? 0.2 : 0.07;
      beamU.forEach((u) => { u.uOpacity.value = op; });
      fixtureMat.color.setScalar(night ? 3 : 1.4);
      wash.intensity = night ? 3.5 : m === 'golden' ? 1.5 : 0.4;
    },
    update(t, dt, still) {
      ledU.uTime.value = still ? 6 : t;
      band.update(t, { still, bounce: 0.6, beat: 4.2 });
      if (!still) pose(t);
    },
    dispose() { band.dispose(); },
  };
}
