// Real captures for the Seat Reality Viewer: one manifest for every kind of real imagery.
// It ships EMPTY. When a capture exists for the chosen spot, the viewer offers
// "Real capture" beside the 3D model (the model always stays as the fallback).
//
// KEYS, most specific first (ids from js/data/venues.js; old area ids are resolved through
// AREA_ALIASES before the lookup, so key entries by the current ids):
//   '<venue id>/<area id>/<block>'   one published block, for example 'ao-arena/level-1-seats/104'
//   '<venue id>/<area id>/<mode id>' one event layout, for example 'the-arena-london/floor/boxing'
//   '<venue id>/<area id>'           the whole area
//
// KINDS (every entry also has credit, takenOn DD/MM/YYYY and permission; permission is a
// private note of where the capture came from and is never shown):
//
// 1. 360 photo, an equirectangular JPEG (2:1) taken at seated eye height:
//      { kind: 'photo360', src: 'assets/360/<venue>/<area>.jpg', heading: 0, pitch: 0 }
//    heading turns the first view right in degrees (negative turns left); pitch looks up.
//    Older entries in js/data/panoramas.js are read here too, as photo360 entries.
//
// 2. Gaussian splat scan (.spz, .ply, .splat or .ksplat), for example from a phone scan app:
//      { kind: 'splat', src: 'assets/captures/<venue>/<area>.spz',
//        camera: { position: [x, y, z], lookAt: [x, y, z], up: [0, 1, 0] },
//        rotation: [x, y, z, w], scale: 1, alphaThreshold: 5 }
//    camera is in the scan's own coordinates: put position where a seated guest's eyes are
//    and lookAt on the stage, pitch or winning post. rotation (a quaternion) and scale fix
//    a scan that comes in tilted or at the wrong size. The renderer is the library named
//    in SPLAT_LIB below, loaded from cdn.jsdelivr.net only when such an entry is opened.
//
// 3. Matterport tour of a hospitality lounge, by its model id (the part after m= in the
//    share link): { kind: 'matterport', model: 'AbCdEfGh123', start: '' }
//    Embedded only when an entry exists, with Matterport's own branding and links hidden
//    where its embed options allow.
//
// Only captures made by Prestige Corporate Events, or supplied with written permission, go
// here. Never copy scans, photos or tours from other sites, and never present a render of
// our own model as a capture.

import { PANORAMAS } from './panoramas.js';

export const CAPTURES = {
};

// The splat renderer (checked 02/11/2026): GaussianSplats3D by Mark Kellogg, version 0.4.7.
// Its module build imports only the bare specifier 'three' (no addons), which the page's
// import map points at the vendored three.js r169; its declared peer range is three
// 0.160.0 or later. It reads .ply, .splat, .ksplat and .spz.
export const SPLAT_LIB = {
  name: '@mkkellogg/gaussian-splats-3d',
  version: '0.4.7',
  url: 'https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.7/build/gaussian-splats-3d.module.js',
};

export const CAPTURE_LABEL = { photo360: '360 photo', splat: '3D scan', matterport: 'Lounge tour' };

const KINDS = ['photo360', 'splat', 'matterport'];
const valid = (e) => e && KINDS.includes(e.kind) && (e.kind === 'matterport' ? /^[A-Za-z0-9]{6,20}$/.test(String(e.model || '')) : !!e.src);

// The capture for a spot, or null. Older panorama entries count as 360 photos.
export function captureFor(venueId, areaId, { mode = null, block = null } = {}) {
  if (!venueId || !areaId) return null;
  const keys = [block ? `${venueId}/${areaId}/${block}` : null, mode ? `${venueId}/${areaId}/${mode}` : null, `${venueId}/${areaId}`].filter(Boolean);
  for (const k of keys) {
    const e = CAPTURES[k];
    if (valid(e)) return { ...e, key: k };
    const p = PANORAMAS[k];
    if (p?.src) return { kind: 'photo360', ...p, key: k };
  }
  return null;
}

// The Matterport embed address for an entry (never a link: shown only inside the viewer).
export function matterportSrc(e) {
  const q = new URLSearchParams({ m: e.model, play: '1', qs: '1', brand: '0', help: '0', mls: '1', title: '0' });
  if (e.start) q.set('ss', String(e.start));
  return `https://my.matterport.com/show/?${q}`;
}
