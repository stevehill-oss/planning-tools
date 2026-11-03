// Real 360 degree seat photos for the Seat Reality Viewer.
//
// Since 02/11/2026 every kind of real capture (360 photos, splat scans, Matterport lounge
// tours) goes in js/data/captures.js. Entries here still work: captures.js reads them as
// 360 photos. New photos can go in either file.
//
// Each entry is keyed "<venue id>/<area id>" (all event modes) or
// "<venue id>/<area id>/<mode id>" (one mode only, checked first). Ids come from
// js/data/venues.js. When an area has a photo, the seat view opens on the photo, with a
// toggle back to the 3D model and the credit line "Photo: <credit>, <takenOn>".
//
// Only real photos taken by Prestige Corporate Events or supplied with written permission
// go here. Never use photos copied from the web, and never a render of our own 3D model.
//
// Fields:
//   src         path from the site root: assets/360/<venue id>/<area id>.jpg
//               (equirectangular JPEG, 2:1, for example 6000x3000 or smaller, under about 3 MB)
//   credit      who took it, as it should appear on screen, for example 'Prestige Corporate Events'
//   takenOn     date taken, DD/MM/YYYY
//   permission  where the photo came from and the permission to use it (not shown on screen)
//   heading     optional, degrees to turn right from the photo's centre so the first view
//               faces the action (0 = the middle of the image, negative turns left)
//   pitch       optional, degrees up (positive) or down (negative) for the first view
//
// Area ids are the real product and seating-area ids in VENUE_AREAS (js/data/venues.js),
// for example tunnel-club, grand-tier-box, the-vista. Older ids (premium-lounge and so on)
// are resolved through AREA_ALIASES before this lookup, so key entries by the new ids.
//
// Example (copy, then change every value):
//   'tottenham-hotspur-stadium/tunnel-club': {
//     src: 'assets/360/tottenham-hotspur-stadium/tunnel-club.jpg',
//     credit: 'Prestige Corporate Events',
//     takenOn: '14/03/2027',
//     permission: 'Taken by Steve Hill on a site visit, venue permission by email 01/03/2027',
//     heading: 0,
//   },

export const PANORAMAS = {
};

export function panoramaFor(venueId, areaId, modeId) {
  return PANORAMAS[`${venueId}/${areaId}/${modeId}`] || PANORAMAS[`${venueId}/${areaId}`] || null;
}
