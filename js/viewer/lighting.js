// Lighting moods: Day, Golden hour, Night (outdoor) and House lights, Warm wash,
// Show lighting (indoor, same ids). One key light casts shadows; its shadow map is
// rendered once per mood because the venue structure never moves.
//
// apply() returns the bloom settings for the mood so the engine can switch the
// post-processing on or off.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { skyGradient } from './textures.js';

export const MOOD_LABELS = {
  outdoor: { day: 'Day', golden: 'Golden hour', night: 'Night' },
  indoor: { day: 'House lights', golden: 'Warm wash', night: 'Show lighting' },
};

const OUTDOOR = {
  day: {
    sun: [-0.32, 0.64, -0.7], keyColor: '#fff3e2', key: 4.4, hemiSky: '#c4d7f2', hemiGround: '#4f5a3c', hemi: 0.42,
    exposure: 0.6, env: 0.48, fog: '#c9d5e2', fogDensity: 0.0012,
    sky: { turbidity: 5, rayleigh: 1.4, mie: 0.004, mieG: 0.8 }, bloom: null, flood: 0.0,
  },
  golden: {
    sun: [0.78, 0.15, -0.6], keyColor: '#ffb36e', key: 4.6, hemiSky: '#f3c69a', hemiGround: '#3b3122', hemi: 0.32,
    exposure: 0.66, env: 0.42, fog: '#e2b48c', fogDensity: 0.0017,
    sky: { turbidity: 8, rayleigh: 2.6, mie: 0.006, mieG: 0.88 }, bloom: { strength: 0.35, radius: 0.5, threshold: 0.9 }, flood: 0.55,
  },
  night: {
    sun: [0.18, 1, 0.22], keyColor: '#eef2ff', key: 2.7, hemiSky: '#2a3654', hemiGround: '#0d0f12', hemi: 0.45,
    exposure: 0.95, env: 0.22, fog: '#1b2436', fogDensity: 0.0024,
    sky: null, bloom: { strength: 0.75, radius: 0.55, threshold: 0.8 }, flood: 1.0,
  },
};

const INDOOR = {
  day: { sun: [0.2, 1, 0.35], keyColor: '#fff6ea', key: 2.0, hemiSky: '#e6e9f0', hemiGround: '#2a2a2a', hemi: 0.75, exposure: 0.95, env: 0.55, fog: '#14171d', fogDensity: 0.0035, bloom: { strength: 0.25, radius: 0.4, threshold: 0.92 }, house: 1.0 },
  golden: { sun: [0.3, 1, 0.2], keyColor: '#ffc68c', key: 1.25, hemiSky: '#f0c49a', hemiGround: '#1d1712', hemi: 0.4, exposure: 0.95, env: 0.35, fog: '#1d1712', fogDensity: 0.004, bloom: { strength: 0.45, radius: 0.5, threshold: 0.86 }, house: 0.55 },
  night: { sun: [0.1, 1, 0.3], keyColor: '#9fb2ff', key: 0.28, hemiSky: '#20283d', hemiGround: '#050505', hemi: 0.22, exposure: 1.05, env: 0.12, fog: '#0b0e16', fogDensity: 0.0055, bloom: { strength: 0.62, radius: 0.5, threshold: 0.82 }, house: 0.08 },
};

export class Lighting {
  constructor(renderer, scene, { lowPower = false } = {}) {
    this.renderer = renderer; this.scene = scene; this.lowPower = lowPower;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.group = new THREE.Group(); this.group.name = 'lighting';
    scene.add(this.group);

    this.key = new THREE.DirectionalLight('#ffffff', 3);
    this.key.castShadow = true;
    const sm = lowPower ? 1024 : 2048;
    this.key.shadow.mapSize.set(sm, sm);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.06;
    this.key.shadow.radius = 3;
    this.group.add(this.key, this.key.target);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 0.6);
    this.group.add(this.hemi);

    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    this.sky.material.fog = false;
    this.group.add(this.sky);

    this.nightTex = skyGradient('#03060d', '#0b1426', '#22304a');
    this.night = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.MeshBasicMaterial({ map: this.nightTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.group.add(this.night);

    this.envRT = null;
    this.roomEnv = new RoomEnvironment();
    this.roomRT = this.pmrem.fromScene(this.roomEnv, 0.04);
  }

  // bounds: { center: Vector3, radius } for the shadow camera. indoor: bool.
  // tune (optional, from the venue): { sun: { mood: [x,y,z] }, fogScale, exposure: { mood: k }, fog: { mood: '#hex' } }
  // lets an archetype aim the sun at its own layout (a racecourse wants a low sun across
  // the course at golden hour) without changing the shared presets.
  apply(mood, { indoor = false, bounds, tune = null }) {
    const P0 = (indoor ? INDOOR : OUTDOOR)[mood] || (indoor ? INDOOR.day : OUTDOOR.day);
    const P = { ...P0 };
    if (tune?.sun?.[mood]) P.sun = tune.sun[mood];
    if (tune?.fogScale) P.fogDensity = P0.fogDensity * tune.fogScale;
    if (tune?.exposure?.[mood]) P.exposure = P0.exposure * tune.exposure[mood];
    if (tune?.fog?.[mood]) P.fog = tune.fog[mood];
    if (tune?.sky?.[mood] && P.sky) P.sky = { ...P.sky, ...tune.sky[mood] };
    if (tune?.hemi?.[mood]) [P.hemiSky, P.hemiGround, P.hemi] = tune.hemi[mood];
    this.preset = P;
    const r = this.renderer; const s = this.scene;
    r.toneMappingExposure = P.exposure;

    const dir = new THREE.Vector3(...P.sun).normalize();
    const c = bounds.center; const R = bounds.radius;
    this.key.position.copy(c).addScaledVector(dir, R * 1.6);
    this.key.target.position.copy(c);
    this.key.color.set(P.keyColor); this.key.intensity = P.key;
    const cam = this.key.shadow.camera;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 1; cam.far = R * 3.4;
    cam.updateProjectionMatrix();
    this.key.shadow.needsUpdate = true;

    this.hemi.color.set(P.hemiSky); this.hemi.groundColor.set(P.hemiGround); this.hemi.intensity = P.hemi;
    s.fog = new THREE.FogExp2(P.fog, P.fogDensity);

    // Sky and environment.
    if (this.envRT && this.envRT !== this.roomRT) { this.envRT.dispose(); }
    this.envRT = null;
    if (!indoor && P.sky) {
      this.sky.visible = true; this.night.visible = false;
      const u = this.sky.material.uniforms;
      u.turbidity.value = P.sky.turbidity; u.rayleigh.value = P.sky.rayleigh;
      u.mieCoefficient.value = P.sky.mie; u.mieDirectionalG.value = P.sky.mieG;
      u.sunPosition.value.copy(dir);
      // Environment from the sky alone (quick, and matches the light).
      const envScene = new THREE.Scene();
      const skyCopy = new Sky(); skyCopy.scale.setScalar(1000);
      Object.keys(u).forEach((k) => { if (skyCopy.material.uniforms[k]) skyCopy.material.uniforms[k].value = u[k].value?.clone ? u[k].value.clone() : u[k].value; });
      envScene.add(skyCopy);
      this.envRT = this.pmrem.fromScene(envScene, 0.02);
      skyCopy.geometry.dispose(); skyCopy.material.dispose();
      s.environment = this.envRT.texture;
      s.background = null;
    } else {
      this.sky.visible = false;
      this.night.visible = !indoor;
      s.environment = this.roomRT.texture;
      s.background = indoor ? new THREE.Color('#07090d') : null;
    }
    s.environmentIntensity = P.env;
    return { bloom: P.bloom, flood: P.flood ?? 0, house: P.house ?? 1, preset: P };
  }

  dispose() {
    if (this.envRT && this.envRT !== this.roomRT) this.envRT.dispose();
    this.roomRT.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose(); this.sky.material.dispose();
    this.night.geometry.dispose(); this.night.material.dispose(); this.nightTex.dispose();
    this.key.shadow.map?.dispose();
    this.roomEnv.traverse?.((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
}
