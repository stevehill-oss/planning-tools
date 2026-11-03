// Gaussian splat scan viewer for "Real capture" (js/data/captures.js, kind 'splat').
// Loads the pinned library (SPLAT_LIB in captures.js) from cdn.jsdelivr.net only the first
// time a splat entry is opened. The library imports the bare specifier 'three', which the
// page's import map resolves to the vendored three.js r169, so no second copy of three.js
// is fetched. Its own renderer, canvas and orbit controls live inside `host`.
//
// API: const v = createSplatView(host, { reducedMotion })
//      await v.load(entry) -> true | false     v.setActive(bool)     v.dispose()
//      v.snapshotCanvas(maxW) -> canvas | null  v.canvas

import { SPLAT_LIB } from '../data/captures.js';

let libPromise = null;
const loadLib = () => (libPromise ||= import(/* @vite-ignore */ SPLAT_LIB.url).catch((e) => { libPromise = null; throw e; }));

export function createSplatView(host, { reducedMotion = () => false } = {}) {
  let viewer = null; let lib = null; let active = false; let src = '';
  const api = {
    canvas: null,
    get loaded() { return !!viewer; },
    async load(entry) {
      try { lib = await loadLib(); } catch (err) { console.warn('[viewer] splat library could not load', err); return false; }
      if (viewer && src === entry.src) return true;
      await api.disposeViewer();
      const cam = entry.camera || {};
      try {
        viewer = new lib.Viewer({
          rootElement: host,
          selfDrivenMode: true, useBuiltInControls: true,
          sharedMemoryForWorkers: false, gpuAcceleratedSort: false,
          dynamicScene: false, antialiased: true,
          cameraUp: cam.up || [0, 1, 0],
          initialCameraPosition: cam.position || [0, 1.2, 3],
          initialCameraLookAt: cam.lookAt || [0, 1, 0],
          sceneRevealMode: lib.SceneRevealMode?.Instant ?? 2,
          logLevel: lib.LogLevel?.None ?? 0,
          sphericalHarmonicsDegree: 0,
        });
        await viewer.addSplatScene(entry.src, {
          showLoadingUI: false, progressiveLoad: false,
          splatAlphaRemovalThreshold: entry.alphaThreshold ?? 5,
          ...(entry.rotation ? { rotation: entry.rotation } : {}),
          ...(entry.scale ? { scale: [entry.scale, entry.scale, entry.scale] } : {}),
          ...(entry.format != null ? { format: entry.format } : {}),
        });
        src = entry.src;
        api.canvas = host.querySelector('canvas');
        if (api.canvas) { api.canvas.tabIndex = 0; api.canvas.classList.add('rv-canvas'); }
        if (viewer.controls && reducedMotion()) viewer.controls.enableDamping = false;
        viewer.start();
        if (!active) viewer.stop?.();
        return true;
      } catch (err) {
        console.warn('[viewer] splat scan could not load', err);
        await api.disposeViewer();
        return false;
      }
    },
    setActive(on) {
      active = !!on;
      if (!viewer) return;
      try { if (active) viewer.start(); else viewer.stop?.(); } catch { /* already in that state */ }
    },
    snapshotCanvas(maxW = 1600) {
      if (!viewer) return null;
      try {
        viewer.forceRenderNextFrame?.(); viewer.update?.(); viewer.render?.();
        const c0 = api.canvas; if (!c0) return null;
        const w = Math.min(maxW, c0.width); const h = Math.round(w * (c0.height / c0.width));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(c0, 0, 0, w, h);
        return c;
      } catch { return null; }
    },
    async disposeViewer() {
      const v = viewer; viewer = null; src = ''; api.canvas = null;
      if (v) { try { await v.dispose(); } catch { /* best effort */ } }
      host.innerHTML = '';
    },
    dispose() { active = false; api.disposeViewer(); },
  };
  return api;
}
