// "Real venue" view: Google's photorealistic 3D map of the venue, shown through Google's
// own element (Map3DElement, the <gmp-map-3d> tag). Lazy-imported by
// js/tools/seat-viewer.js the first time someone opens the Real venue view, and the Google
// script itself loads only then, never with the page.
//
// Google's terms: the imagery is only ever shown live through the official element. It is
// never cached, copied, screenshotted into "Save this view" or used in the brief. Google's
// own logo and data attribution, drawn by the element, stay visible: nothing of ours sits
// over the bottom of the map.
//
// Loading, as Google's docs describe it (checked 30/10/2026): the Maps JavaScript API
// script with libraries=maps3d, loading=async and a callback, then
// google.maps.importLibrary('maps3d'). 3D maps are on the normal "weekly" channel, so no
// alpha or beta channel is needed.
//
// Failure is always quiet: an empty key, a blocked or offline script, a refused key
// (wrong referrer, API not enabled, billing off: Google calls window.gm_authFailure) or a
// gmp-error event all end in onState('error'), and the tool shows its own calm card.
// Google's raw error text is never shown to users.
//
// API:
//   const real = createRealVenue(host, { key, reducedMotion(): bool, onState(s), onOrbit(on) })
//     onState: 'loading' | 'ready' | 'error' | 'nokey'
//   await real.show(venue)        venue from js/data/venues.js (uses venue.geo)
//   real.preset('angled' | 'above' | 'low');  real.orbit(on);  real.orbiting
//   real.setActive(bool);  real.dispose()

const CALLBACK = '__prestigeMapsReady';
const LOAD_TIMEOUT = 20000;
let loadPromise = null;
const authListeners = new Set();
let authFailed = false;

function hookAuthFailure() {
  if (window.__prestigeAuthHooked) return;
  window.__prestigeAuthHooked = true;
  const prev = window.gm_authFailure;
  window.gm_authFailure = () => {
    authFailed = true;
    authListeners.forEach((fn) => { try { fn(); } catch { /* listener gone */ } });
    if (typeof prev === 'function') prev();
  };
}

export function loadGoogleMaps(key) {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;
  hookAuthFailure();
  loadPromise = new Promise((resolve, reject) => {
    let settled = false;
    const fail = (why) => { if (settled) return; settled = true; loadPromise = null; reject(new Error(why)); };
    const timer = setTimeout(() => fail('timeout'), LOAD_TIMEOUT);
    // Kept defined even after a timeout, so a late script never calls a missing function.
    window[CALLBACK] = () => {
      clearTimeout(timer);
      if (settled) return;
      if (!window.google?.maps?.importLibrary) { fail('no-library'); return; }
      settled = true; resolve(window.google.maps);
    };
    const q = new URLSearchParams({ key, v: 'weekly', libraries: 'maps3d', loading: 'async', callback: CALLBACK, language: 'en-GB', region: 'GB' });
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${q}`;
    s.async = true;
    s.onerror = () => { clearTimeout(timer); s.remove(); fail('script'); };
    document.head.append(s);
  });
  return loadPromise;
}

const PRESETS = {
  angled: (g) => ({ tilt: g.tilt, range: g.range }),
  above: (g) => ({ tilt: 12, range: g.range * 1.5 }),
  low: (g) => ({ tilt: Math.min(78, g.tilt + 14), range: g.range * 0.62 }),
};
const ORBIT_MS = 80000; // one slow lap

export function createRealVenue(host, { key = '', reducedMotion = () => false, onState = () => {}, onOrbit = () => {} } = {}) {
  let map = null; let lib = null; let geo = null; let venueName = '';
  let state = 'idle'; let active = true; let wantOrbit = !reducedMotion(); let orbiting = false;
  let disposed = false; let steadyOnce = false;

  const setState = (s) => { if (state === s || disposed) return; state = s; onState(s); };
  const fail = () => { stopOrbit(); setState('error'); };
  const onAuth = () => fail();
  authListeners.add(onAuth);

  const centre = () => ({ lat: geo.lat, lng: geo.lng, altitude: 0 });

  function camera(extra = {}) {
    return { center: centre(), range: geo.range, tilt: geo.tilt, heading: geo.heading || 0, ...extra };
  }

  function startOrbit() {
    if (!map || reducedMotion() || !active || state !== 'ready') return;
    try {
      map.flyCameraAround({
        camera: { center: map.center || centre(), range: map.range ?? geo.range, tilt: map.tilt ?? geo.tilt, heading: map.heading ?? 0 },
        durationMillis: ORBIT_MS, repeatCount: Infinity,
      });
      orbiting = true; onOrbit(true);
    } catch { orbiting = false; onOrbit(false); }
  }
  function stopOrbit() {
    if (orbiting) { try { map?.stopCameraAnimation(); } catch { /* nothing running */ } }
    if (orbiting) { orbiting = false; onOrbit(false); }
  }

  // Any drag, wheel or key on the map hands control to the visitor and stops the orbit.
  const userTookOver = () => { if (orbiting) { wantOrbit = false; stopOrbit(); } };
  host.addEventListener('pointerdown', userTookOver, true);
  host.addEventListener('wheel', userTookOver, { capture: true, passive: true });
  host.addEventListener('keydown', userTookOver, true);

  async function create() {
    if (!key) { setState('nokey'); return false; }
    if (authFailed) { setState('error'); return false; }
    setState('loading');
    try {
      const maps = await loadGoogleMaps(key);
      lib = await maps.importLibrary('maps3d');
    } catch { fail(); return false; }
    if (disposed || authFailed) { if (authFailed) fail(); return false; }
    try {
      const opts = {
        ...camera(),
        mode: lib.MapMode?.SATELLITE || 'SATELLITE', // satellite has no map labels over the venue
        defaultUIHidden: true,                       // our own buttons sit outside the map
        description: `Live photorealistic 3D map of ${venueName}, seen from above`,
      };
      if (lib.GestureHandling?.COOPERATIVE) opts.gestureHandling = lib.GestureHandling.COOPERATIVE; // page scroll keeps working
      map = new lib.Map3DElement(opts);
    } catch { fail(); return false; }
    map.classList.add('rv__gmap');
    map.addEventListener('gmp-error', fail);
    // Clicking a place would open Google's place card; the venue name is shown by us instead.
    map.addEventListener('gmp-click', (e) => { try { e.preventDefault(); } catch { /* not cancellable */ } });
    map.addEventListener('gmp-steadychange', (e) => {
      if (!e.isSteady || steadyOnce || state === 'error') return;
      steadyOnce = true; setState('ready');
      if (wantOrbit) startOrbit();
    });
    host.append(map);
    return true;
  }

  async function show(venue) {
    if (!venue?.geo) { fail(); return; }
    geo = venue.geo; venueName = venue.name;
    if (!map) { await create(); return; }
    if (state === 'error') return;
    stopOrbit();
    try {
      Object.assign(map, camera());
      map.description = `Live photorealistic 3D map of ${venueName}, seen from above`;
    } catch { fail(); return; }
    wantOrbit = !reducedMotion();
    if (wantOrbit) setTimeout(startOrbit, 600);
  }

  function preset(name) {
    if (!map || !geo || state !== 'ready') return;
    const p = (PRESETS[name] || PRESETS.angled)(geo);
    wantOrbit = false; stopOrbit();
    try {
      map.flyCameraTo({ endCamera: { center: centre(), heading: map.heading ?? 0, ...p }, durationMillis: reducedMotion() ? 0 : 2200 });
    } catch { /* camera stays where it is */ }
  }

  return {
    show,
    preset,
    orbit(on) { wantOrbit = !!on && !reducedMotion(); if (wantOrbit) startOrbit(); else stopOrbit(); },
    get orbiting() { return orbiting; },
    get state() { return state; },
    setActive(on) {
      active = !!on;
      if (!active) { const keep = wantOrbit; stopOrbit(); wantOrbit = keep; } else if (wantOrbit) startOrbit();
    },
    dispose() {
      disposed = true; stopOrbit(); authListeners.delete(onAuth);
      host.removeEventListener('pointerdown', userTookOver, true);
      host.removeEventListener('wheel', userTookOver, true);
      host.removeEventListener('keydown', userTookOver, true);
      map?.remove(); map = null;
    },
  };
}
