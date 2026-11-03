// Seat Reality Viewer (tool id reality-viewer). Owned by the viewer agents.
//
// Builds the DOM around the 3D stage and lazy-imports js/viewer/engine.js (three.js) the
// first time the tool is shown. Until the first frame is ready a poster shows
// (assets/poster-<archetype>.jpg, gradient fallback). Without WebGL, the poster stays and a
// plain-words description of the seat replaces the 3D view.
//
// Venues, products and their facts come from js/data/venues.js (rebuilt 02/11/2026 from the
// research). Geometry, the seat camera and the seat numbers come from js/viewer/layouts.js.
//
// Hash params (all written back with ctx.setParams so shared links reopen the exact seat):
//   venue, mode, day (racecourses), area, place (stand or side), block (where published),
//   row (front | middle | back | a row number), pos (left | centre | right | 0..100 along),
//   light, view (seat | move | overview | plan | real), compare (second area of the split
//   screen), crowd (when not full), src=model (when a real capture exists but the model is
//   chosen), event (an event type id, used only when no mode is given: event=nfl opens the
//   NFL layout at Tottenham Hotspur Stadium).
// Old links: area ids from before 02/11/2026 (premium-lounge, private-box, upper-tier and
// so on) resolve through AREA_ALIASES in venues.js. view=dollhouse is read as overview.
//
// Exact seats (seat map, 02/11/2026): seat=<number> with block=<block id> and row=<row
// label> reopens one exact seat of js/viewer/seatplan.js (as on a ticket), box=<number>
// one box. Without seat=, row and pos keep their older meaning (row number, position along).
// The seat map (js/viewer/seatmap-view.js) sits beside the 3D view on wide screens and
// swaps with it on phones; "Show spacing" draws the seat's dimensions in 3D.
//
// Mode bar (Matterport style, under the picture): Seat view (look round 360 degrees),
// Move (rings on nearby seats; select one to glide there), Dollhouse (the whole venue from
// outside, roof off, with hotspots), Plan (top-down plan), Measure (two points, straight
// line in metres, modelled), Photo (a still that refines itself, saved as a PNG) and Real
// venue (Google's live 3D map).
//
// Real imagery, layered on top of the 3D model (which always stays as the fallback):
// - view=real: "Real venue", Google's photorealistic 3D map (js/viewer/real-venue.js),
//   loaded only when opened and only when js/config.js has a key.
// - Real captures from js/data/captures.js (360 photos, splat scans, Matterport lounge
//   tours), offered as "Real capture" beside the model in Seat view when one exists.

import { segmented, select, range, actionBar, el, icon } from '../ui.js';
import { html, raw, reducedMotion } from '../core.js';
import {
  VENUES, MODES, VENUE_FACTS, venueById, areasFor, areaName, includesFor, whereFor, daysFor, defaultDay,
  dayLabel, standardAreaFor, hospitalityAreasFor, otherSpacesFor, resolveAreaId,
} from '../data/venues.js';
import { seatSpec, seatChoices, seatNumbers, hasLayout, describeSeat, defaultAreaFor, moveTargets, measurePoints, planToWorld, ROW_KEYS, POS_KEYS, DESIGN } from '../viewer/layouts.js';
import { seatMap, seatRef, seatWords as seatAddress, refStatus, findSeat, nearestSeat, neighbour, specForSeat, boxSpot, seatFacts, spacingLines } from '../viewer/seatplan.js';
import { SeatMapView } from '../viewer/seatmap-view.js';
// "See this on our website": verified pages only, UTM tagged, new tab (js/data/prestige-links.js).
import { productLink, outLinkHtml, siteProductName } from '../data/prestige-links.js';
import { captureFor, CAPTURE_LABEL, matterportSrc } from '../data/captures.js';
import { GOOGLE_MAPS_KEY } from '../config.js';

const ARCH_LABEL = { stadium: 'Stadium', arena: 'Arena', hall: 'Concert hall', racecourse: 'Racecourse' };
const EVENT_FOR = { 'stadium:football': 'football', 'stadium:nfl': 'nfl', 'stadium:concert': 'stadium-concert', 'arena:concert': 'arena-concert', 'arena:boxing': 'boxing', 'hall:orchestra': 'orchestra', 'racecourse:racing': 'horse-racing' };
// An event type in a link (event=) picks the layout when no mode is given.
const MODE_FOR_EVENT = { football: 'football', nfl: 'nfl', 'stadium-concert': 'concert', 'arena-concert': 'concert', boxing: 'boxing', darts: 'concert', comedy: 'concert', orchestra: 'orchestra', theatre: 'orchestra', 'horse-racing': 'racing' };
const MODE_WORDS = { concert: 'a concert', orchestra: 'an orchestral concert', racing: 'a race day', football: 'football', nfl: 'an NFL game', boxing: 'boxing' };
const FLOOR_WORD = { 'stadium:football': 'the pitch', 'stadium:nfl': 'the field', 'stadium:concert': 'the floor', arena: 'the floor', hall: 'the Arena floor', racecourse: 'the track at the post' };
// The mode bar. view buttons change the camera; tool buttons switch a tool on and off.
const MODEBAR = [
  { id: 'seat', label: 'Seat view', short: 'Seat', icon: 'eye', kind: 'view', tip: 'Look round from your seat' },
  { id: 'move', label: 'Move', short: 'Move', icon: 'steps', kind: 'view', tip: 'Step to a nearby seat' },
  { id: 'overview', label: 'Dollhouse', short: 'Doll\u00ADhouse', icon: 'cube', kind: 'view', tip: 'The whole venue from outside' },
  { id: 'plan', label: 'Plan', short: 'Plan', icon: 'plan', kind: 'view', tip: 'A top-down plan' },
  { id: 'measure', label: 'Measure', short: 'Measure', icon: 'ruler', kind: 'tool', tip: 'Measure between two points' },
  { id: 'photo', label: 'Photo', short: 'Photo', icon: 'camera', kind: 'tool', tip: 'Make a clean still to save' },
  { id: 'real', label: 'Real venue', short: 'Real venue', icon: 'pin', kind: 'view', tip: 'The building on a live 3D map' },
];
// Where a fact comes from, in plain words (sources are never links).
function sourceName(src = '') {
  const s = String(src);
  if (/populous\.com/.test(s)) return 'the architect, Populous';
  if (/wikidata\.org/.test(s)) return 'Wikidata';
  if (/wikipedia\.org/.test(s)) return 'Wikipedia';
  if (/operations\.nfl\.com/.test(s)) return 'the NFL rulebook';
  if (/sportinglife\.com/.test(s)) return 'a racing media course guide';
  if (/^\//.test(s)) return 'our venue page';
  if (/tottenhamhotspur|ao-arena\.com|cooplive\.com|royalalberthall\.com|ascot\.com|thejockeyclub\.co\.uk|venue-facts\.json/.test(s)) return 'the venue';
  return 'published sources';
}
const FACT_BADGE = { stated: ['Stated', 'badge--ok'], derived: ['Modelled', ''], standard: ['Design standard', ''], measured: ['Measured', 'badge--ok'] };
const LIGHTS = {
  outdoor: [{ value: 'day', label: 'Day', icon: 'sun' }, { value: 'golden', label: 'Golden hour', icon: 'sunset' }, { value: 'night', label: 'Night', icon: 'moon' }],
  indoor: [{ value: 'day', label: 'House lights', icon: 'sun' }, { value: 'golden', label: 'Warm wash', icon: 'sunset' }, { value: 'night', label: 'Show lighting', icon: 'moon' }],
};
const LIGHT_WORDS = { outdoor: { day: 'in daylight', golden: 'at golden hour', night: 'at night under floodlights' }, indoor: { day: 'with the house lights up', golden: 'under a warm wash', night: 'under show lighting' } };
const CROWD = [{ value: 'light', label: 'Quiet', d: 0.45 }, { value: 'busy', label: 'Busy', d: 0.75 }, { value: 'full', label: 'Full', d: 0.93 }];
const isOutdoor = (arch) => arch === 'stadium' || arch === 'racecourse';
const QKEY = 'pce-viewer-quality';

function lowPowerDevice() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  return !!(navigator.connection?.saveData) || (coarse && cores <= 4) || mem <= 3;
}
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}
let webglOk = null;
const webglReady = () => (webglOk === null ? (webglOk = hasWebGL()) : webglOk);
const devMode = () => /viewerdev/.test(location.search) || /[?&]dev=1/.test(location.hash);
// Dev pages can pin the quality (viewerq=high or standard), which also stops the adaptation.
const pinnedQuality = () => { const m = /[?&]viewerq=(high|standard)/.exec(location.search); return m ? m[1] : null; };
function storedQuality() { try { return localStorage.getItem(QKEY); } catch { return null; } }
function storeQuality(q) { try { localStorage.setItem(QKEY, q); } catch { /* storage unavailable */ } }
function defaultQuality() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return !coarse && (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'standard';
}
const round = (v, k = 0) => (v == null ? null : Math.round(v * 10 ** k) / 10 ** k);

export function mount(root, ctx) {
  /* ---------- State ---------- */
  const st = {
    venue: VENUES[0].id, mode: null, day: null, area: null, place: null, block: null, row: 'middle', pos: 'centre',
    light: null, view: 'seat', compare: null, crowd: 'full', src: 'photo', tool: null,
    quality: pinnedQuality() || storedQuality() || defaultQuality(),
    // Exact seat on the seat map: index into seatMap(venue, mode, day).seats, and the map it
    // belongs to. box: index into that map's boxes. pane: what a phone shows (map or view).
    seatK: null, seatKey: '', box: null, spacing: false, pane: 'view', mapLevel: null,
  };
  const lowPower = lowPowerDevice();
  if (lowPower) st.quality = 'standard';
  let engine = null; let enginePromise = null; let active = false; let built = ''; let firstFrame = false;
  let pano = null; let panoPromise = null; let panoSrc = ''; let panoShown = false;
  let splat = null; let splatPromise = null; let capShown = '';
  // Measure: two points { p:[x,y,z], label }; next tap sets 'a' or 'b'.
  const meas = { a: null, b: null, next: 'b' };
  let real = null; let realPromise = null; let realVenue = '';
  let headingTimer = 0; let lastHeading = null; let split = 0.5;
  const venue = () => venueById(st.venue) || VENUES[0];
  const arch = () => venue().archetype;
  const modes = () => MODES[arch()] || [];
  const days = () => daysFor(st.venue);
  const opts = () => ({ mode: st.mode, day: st.day });
  const areas = () => areasFor(st.venue, opts());
  const area = () => areas().find((a) => a.id === st.area) || areas()[0];
  const name = (a) => areaName(a, st.mode, st.day);
  const modeLabel = () => modes().find((m) => m.id === st.mode)?.label || '';
  const lightSet = () => (isOutdoor(arch()) ? LIGHTS.outdoor : LIGHTS.indoor);
  const choices = () => seatChoices(st.venue, st.mode, st.area, st.place);
  const seat = () => ({ place: st.place, block: st.block, row: st.row, pos: st.pos });
  const mapKey = () => `${st.venue}:${st.mode}:${st.day || ''}`;
  const curMap = () => (hasLayout(st.venue) && st.mode ? seatMap(st.venue, st.mode, st.day) : null);
  const exactK = () => { const M = curMap(); return M && st.seatK != null && st.seatKey === mapKey() && st.seatK < M.seats.n ? st.seatK : null; };
  const legacySpec = () => seatSpec(st.venue, st.mode, st.area, seat());
  const spec = () => { const k = exactK(); return k != null ? specForSeat(curMap(), k) : legacySpec(); };
  const standardArea = () => standardAreaFor(st.venue, opts());
  const floorWord = () => FLOOR_WORD[`${arch()}:${st.mode}`] || FLOOR_WORD[arch()] || 'the floor';
  const lower = (s) => (/^[A-Z]{2,}$/.test(s) ? s : s.toLowerCase()); // keeps NFL in capitals
  const eventWords = () => `${lower(modeLabel())}${days().length ? `, ${dayLabel(st.venue, st.day)}` : ''}`;

  function defaults(keepLight = false) {
    if (!modes().some((m) => m.id === st.mode)) st.mode = modes()[0]?.id || null;
    if (days().length && !days().some((d) => d.id === st.day)) st.day = defaultDay(st.venue);
    if (!days().length) st.day = null;
    const rid = resolveAreaId(st.venue, st.area, opts());
    st.area = rid && areas().some((a) => a.id === rid) ? rid : (areas().some((a) => a.id === defaultAreaFor(st.venue)) ? defaultAreaFor(st.venue) : (hospitalityAreasFor(st.venue, opts())[0] || areas()[0])?.id);
    const ch = choices();
    if (!ch?.places.some((p) => p.id === st.place)) st.place = ch?.places[0]?.id || null;
    const ch2 = choices();
    if (ch2?.blocks.length) { if (!ch2.blocks.includes(String(st.block))) st.block = ch2.blocks[Math.floor((ch2.blocks.length - 1) / 2)]; } else st.block = null;
    const n = ch2?.rows.kind === 'numbered' ? ch2.rows.n : 0;
    const rk = Number(st.row);
    if (!ROW_KEYS.includes(st.row) && !(n && rk >= 1 && rk <= n)) st.row = 'middle';
    if (ch2?.rows.kind !== 'numbered' && !ROW_KEYS.includes(st.row)) st.row = 'middle';
    const pk = Number(st.pos);
    if (!POS_KEYS.includes(st.pos) && !(Number.isFinite(pk) && pk >= 0 && pk <= 100)) st.pos = 'centre';
    if (!keepLight || !st.light) st.light = isOutdoor(arch()) && st.mode !== 'concert' ? 'day' : 'night';
    if (st.compare) { const c = resolveAreaId(st.venue, st.compare, opts()); st.compare = c && areas().some((a) => a.id === c) && c !== st.area ? c : null; }
  }

  /* ---------- DOM ---------- */
  root.innerHTML = '';
  const tool = el(html`<div class="rv">
    <header class="tool__head rv__head">
      <p class="eyebrow">${raw(icon('eye'))} Seat Reality Viewer</p>
      <h2>See the view from your seat</h2>
      <p>Pick a venue and an event, then choose your exact seat on the seat map, or type in the block, row and seat from your ticket, and look around from it. See the seat's size and spacing, and compare it with a standard ticket in one tap.</p>
    </header>
    <div class="rv__pickers">
      <div class="field rv__venue">
        <label class="field__label" for="rv-venue">Venue</label>
        <div class="rv__venue-wrap"><span class="rv__venue-icon" aria-hidden="true"></span><select class="select" id="rv-venue"></select></div>
      </div>
      <div class="field rv__mode"><span class="field__label" id="rv-mode-l">Event</span><div class="rv__mode-slot"></div></div>
      <div class="field rv__day" hidden><span class="field__label" id="rv-day-l">Raceday</span><div class="rv__day-slot"></div></div>
    </div>
    <div class="rv__areas"></div>
    <div class="rv__panes" role="group" aria-label="Show on screen">
      <button type="button" class="rv__pane-btn" data-pane="map" aria-pressed="false">${raw(icon('map'))}<span>Seat map</span></button>
      <button type="button" class="rv__pane-btn" data-pane="view" aria-pressed="true">${raw(icon('eye'))}<span>3D view</span></button>
    </div>
    <div class="rv__duo" data-pane="view">
      <section class="rv__seatmap on-ink" aria-labelledby="rv-sm-h">
        <div class="sm__head"><h3 id="rv-sm-h">${raw(icon('map'))}<span>Seat map</span></h3><div class="sm__level"></div></div>
        <div class="sm__host"></div>
        <div class="sm__zoom" role="group" aria-label="Zoom the seat map">
          <button type="button" class="rv__icon-btn" data-sm="out" aria-label="Zoom the seat map out">${raw(icon('minus'))}</button>
          <button type="button" class="rv__icon-btn" data-sm="in" aria-label="Zoom the seat map in">${raw(icon('plus'))}</button>
          <button type="button" class="rv__icon-btn" data-sm="reset" aria-label="Show the whole venue">${raw(icon('maximize'))}</button>
        </div>
        <div class="sm__legend"></div>
      </section>
        <div class="rv__stage on-ink" data-state="idle">
          <div class="rv__viewport">
            <div class="rv__poster" aria-hidden="true"><img alt="" width="1280" height="720" decoding="async" hidden></div>
            <div class="rv__canvas-host"></div>
            <div class="rv__pano-host"></div>
            <div class="rv__splat-host"></div>
            <div class="rv__tour-host" hidden></div>
            <div class="rv__real" hidden data-state="idle">
              <div class="rv__real-map"></div>
              <div class="rv__real-loading" role="status" aria-live="polite"><span class="rv__spinner" aria-hidden="true"></span><span>Loading the live map</span></div>
              <div class="rv__real-empty"></div>
            </div>
            <div class="rv__markers" hidden></div>
            <div class="rv__hotspots" hidden role="group" aria-label="Places you can move to"></div>
            <div class="rv__dims" hidden aria-hidden="true"></div>
            <div class="rv__fade" aria-hidden="true"></div>
            <div class="rv__loading" role="status" aria-live="polite"><span class="rv__spinner" aria-hidden="true"></span><span class="rv__loading-text">Preparing your view</span></div>
            <div class="rv__fallback" hidden></div>
            <section class="rv__panel rv__measure" hidden aria-labelledby="rv-meas-h">
              <div class="rv__panel-head"><h3 id="rv-meas-h">${raw(icon('ruler'))}Measure</h3><button type="button" class="rv__icon-btn" data-act="tool-off" aria-label="Close Measure">${raw(icon('x'))}</button></div>
              <p class="rv__panel-hint">Tap a seat, the stage, the ring, a marking or a rail, or choose points here.</p>
              <div class="rv__meas-pts"></div>
              <p class="rv__meas-out" aria-live="polite"></p>
            </section>
            <section class="rv__panel rv__photo" hidden aria-labelledby="rv-photo-h">
              <div class="rv__panel-head"><h3 id="rv-photo-h">${raw(icon('camera'))}Photo</h3><button type="button" class="rv__icon-btn" data-act="tool-off" aria-label="Close Photo">${raw(icon('x'))}</button></div>
              <p class="rv__panel-hint">Hold still: the picture sharpens as frames add up.</p>
              <div class="rv__photo-bar" aria-hidden="true"><span></span></div>
              <p class="rv__photo-out" role="status" aria-live="polite"></p>
              <button type="button" class="btn btn--gold btn--sm" data-act="photo-save" disabled>${raw(icon('download'))}<span>Save as PNG</span></button>
            </section>
            <div class="rv__corner">
              <div class="rv__zoom" role="group" aria-label="Zoom">
                <button type="button" class="rv__icon-btn" data-act="zoom-out" aria-label="Zoom out">${raw(icon('minus'))}</button>
                <span class="rv__zoom-level" aria-live="polite">1x</span>
                <button type="button" class="rv__icon-btn" data-act="zoom-in" aria-label="Zoom in">${raw(icon('plus'))}</button>
                <button type="button" class="rv__icon-btn" data-act="reset" aria-label="Reset the view">${raw(icon('rotate'))}</button>
              </div>
            </div>
            <div class="rv__split" hidden>
              <p class="rv__split-label rv__split-label--a"><span class="badge badge--gold">Your choice</span><span class="rv__split-name"></span></p>
              <p class="rv__split-label rv__split-label--b"><span class="badge">Standard ticket</span><span class="rv__split-name"></span></p>
              <div class="rv__divider" role="separator" tabindex="0" aria-valuemin="15" aria-valuemax="85" aria-valuenow="50" aria-label="Divider between the two views. Use the arrow keys to move it."><span class="rv__divider-grip" aria-hidden="true">${raw(icon('compare'))}</span></div>
            </div>
            <p class="rv__caption">${raw(icon('info'))}<span class="rv__cap-body"><span class="rv__cap-text">Illustrative model built from published dimensions, not an exact rendering.</span><span class="rv__hint"> Drag to look around.</span><span class="rv__soon" hidden>Real 360 photo from this area coming soon.</span></span></p>
            <div class="rv__dev" hidden></div>
          </div>
          <nav class="rv__modebar" aria-label="Viewing mode">${raw(MODEBAR.map((m) => html`<button type="button" class="rv__mode-btn" data-mode="${m.id}" data-kind="${m.kind}" aria-pressed="false" title="${m.tip}">${raw(icon(m.icon))}<span>${m.short}</span></button>`).join(''))}</nav>
          <div class="rv__toolbar rv__toolbar--tools" role="toolbar" aria-label="View settings">
            <div class="rv__src-slot" hidden></div>
            <div class="rv__real-tools" hidden>
              <button type="button" class="btn btn--ghost-ink btn--sm rv__orbit" data-act="orbit" aria-pressed="false">${raw(icon('pause'))}<span>Pause the orbit</span></button>
              <div class="rv__presets" role="group" aria-label="Camera angle">
                <button type="button" class="btn btn--ghost-ink btn--sm" data-act="preset" data-preset="angled">Angled</button>
                <button type="button" class="btn btn--ghost-ink btn--sm" data-act="preset" data-preset="above">From above</button>
                <button type="button" class="btn btn--ghost-ink btn--sm" data-act="preset" data-preset="low">Closer</button>
              </div>
              <p class="rv__real-note">Live map imagery from Google. It shows the building, not your seat, and was not taken on an event day.</p>
            </div>
            <div class="rv__light-slot"></div>
            <div class="rv__crowd-slot"></div>
            <div class="rv__quality-slot"></div>
            <button type="button" class="btn btn--ghost-ink btn--sm rv__spacing" data-act="spacing" aria-pressed="false">${raw(icon('ruler'))}<span>Show spacing</span></button>
            <button type="button" class="btn btn--ghost-ink btn--sm rv__wave" data-act="wave">${raw(icon('wave'))}<span>Start a wave</span></button>
            <button type="button" class="btn btn--ghost-ink btn--sm btn--icon rv__fs" data-act="fullscreen" aria-label="Full screen">${raw(icon('maximize'))}</button>
          </div>
        </div>
    </div>
    <div class="rv__layout">
      <div class="rv__main">
        <section class="card rv__diff" hidden aria-live="polite" aria-label="How the two seats compare"></section>
        <div class="rv__below">
          <section class="card rv__seat" aria-labelledby="rv-seat-h">
            <div class="rv__seat-head">
              <h3 id="rv-seat-h">Find my seat</h3>
              <button type="button" class="btn btn--ghost btn--sm rv__compare" data-act="compare">${raw(icon('compare'))}<span>Compare with a standard ticket</span></button>
            </div>
            <div class="rv__find-slot"></div>
            <div class="rv__seat-grid">
              <div class="rv__place-slot"></div>
              <div class="rv__block-slot"></div>
              <div class="rv__row-slot"></div>
              <div class="rv__pos-slot"></div>
            </div>
          </section>
        </div>
        <section class="card rv__nums" aria-labelledby="rv-nums-h" aria-live="polite"></section>
      </div>
      <aside class="rv__info" aria-label="About this seating area"></aside>
    </div>
  </div>`);
  root.append(tool);

  const $ = (s) => tool.querySelector(s);
  const stage = $('.rv__stage'); const host = $('.rv__canvas-host'); const poster = $('.rv__poster');
  const posterImg = poster.querySelector('img');
  const loadingText = $('.rv__loading-text');
  const fallback = $('.rv__fallback'); const markersEl = $('.rv__markers'); const fade = $('.rv__fade');
  const info = $('.rv__info'); const areasEl = $('.rv__areas'); const devEl = $('.rv__dev');
  const zoomLevelEl = $('.rv__zoom-level'); const numsEl = $('.rv__nums');
  const splitEl = $('.rv__split'); const divider = $('.rv__divider'); const diffEl = $('.rv__diff');
  const viewport = $('.rv__viewport');
  const sel = $('#rv-venue');
  const panoHost = $('.rv__pano-host'); const realEl = $('.rv__real'); const realMap = $('.rv__real-map');
  const realEmpty = $('.rv__real-empty'); const realTools = $('.rv__real-tools'); const orbitBtn = $('.rv__orbit');
  const srcSlot = $('.rv__src-slot'); const capText = $('.rv__cap-text'); const soonEl = $('.rv__soon');
  const modebar = $('.rv__modebar'); const hotEl = $('.rv__hotspots'); const measureEl = $('.rv__measure'); const photoEl = $('.rv__photo');
  const splatHost = $('.rv__splat-host'); const tourEl = $('.rv__tour-host');
  const photoSaveBtn = photoEl.querySelector('[data-act="photo-save"]');

  const groups = {};
  VENUES.forEach((v) => { (groups[v.archetype] ||= []).push(v); });
  sel.innerHTML = Object.entries(groups).map(([a, list]) => html`<optgroup label="${ARCH_LABEL[a] || a}">${raw(list.map((v) => html`<option value="${v.id}">${v.name.includes(v.city) ? v.name : `${v.name}, ${v.city}`}</option>`).join(''))}</optgroup>`).join('');
  sel.addEventListener('change', () => {
    const prevArch = arch(); st.venue = sel.value; st.area = null; st.place = null; st.block = null; st.row = 'middle'; st.pos = 'centre'; st.seatK = null; st.box = null;
    if (prevArch !== arch()) st.mode = null;
    defaults(prevArch === arch()); closeCompare(); render();
  });

  let modeCtl = null; let viewCtl = null; let lightCtl = null; let crowdCtl = null; let dayCtl = null; let qualityCtl = null;

  /* ---------- Mode bar ---------- */
  // viewCtl.set() repaints the bar from st.view (kept as an object so older calls still work).
  viewCtl = { set: () => paintModebar() };
  function paintModebar() {
    modebar.querySelectorAll('.rv__mode-btn').forEach((b) => {
      const id = b.dataset.mode; const on = b.dataset.kind === 'tool' ? st.tool === id : st.view === id;
      b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-on', on);
    });
  }
  function setViewMode(v) {
    if (v !== 'seat' && v !== 'move' && comparing()) closeCompare();
    if (st.tool === 'photo') setTool(null);
    if (v === 'real' && st.tool) setTool(null);
    st.view = v; applyView(); sync(); paintModebar();
  }
  modebar.addEventListener('click', (e) => {
    const b = e.target.closest('.rv__mode-btn'); if (!b) return;
    if (b.dataset.kind === 'tool') setTool(st.tool === b.dataset.mode ? null : b.dataset.mode);
    else setViewMode(b.dataset.mode);
  });
  // Left and right arrows move along the bar; Home and End jump to its ends.
  modebar.addEventListener('keydown', (e) => {
    const btns = [...modebar.querySelectorAll('.rv__mode-btn')]; const k = btns.indexOf(document.activeElement);
    if (k < 0) return;
    const to = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: btns.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault(); btns[(to + btns.length) % btns.length].focus();
  });

  const srcCtl = segmented({
    label: 'Show', ink: true, value: st.src,
    options: [{ value: 'photo', label: 'Real capture', icon: 'camera' }, { value: 'model', label: '3D model', icon: 'layers' }],
    onChange: (v) => { st.src = v; paintPhoto(); paintHotspots(); sync(); },
  });
  srcSlot.append(srcCtl.el);

  crowdCtl = segmented({ label: 'Crowd', ink: true, value: st.crowd, options: CROWD.map((c) => ({ value: c.value, label: c.label })), onChange: (v) => { if (st.tool === 'photo') setTool(null); st.crowd = v; engine?.setDensity(CROWD.find((c) => c.value === v).d); sync(); } });
  crowdCtl.el.classList.add('rv__crowd');
  $('.rv__crowd-slot').append(crowdCtl.el);

  qualityCtl = segmented({
    label: 'Quality', ink: true, value: st.quality,
    options: [{ value: 'standard', label: 'Standard' }, { value: 'high', label: 'High' }],
    onChange: (v) => { st.quality = v; storeQuality(v); engine?.setQuality(v); },
  });
  qualityCtl.el.classList.add('rv__quality');
  if (lowPower) $('.rv__quality-slot').hidden = true;
  $('.rv__quality-slot').append(qualityCtl.el);

  function buildModeCtl() {
    const slot = $('.rv__mode-slot'); slot.innerHTML = '';
    modeCtl = segmented({ label: 'Event', value: st.mode, options: modes().map((m) => ({ value: m.id, label: m.label })), onChange: (v) => { carrySeat(() => { st.mode = v; }); st.light = isOutdoor(arch()) && v !== 'concert' ? 'day' : 'night'; closeCompare(); defaults(true); render(); } });
    modeCtl.el.setAttribute('aria-labelledby', 'rv-mode-l');
    slot.append(modeCtl.el);
  }
  function buildDayCtl() {
    const wrap = $('.rv__day'); const slot = $('.rv__day-slot'); slot.innerHTML = '';
    wrap.hidden = !days().length;
    if (!days().length) return;
    dayCtl = segmented({ label: 'Raceday', value: st.day, options: days().map((d) => ({ value: d.id, label: d.label })), onChange: (v) => { st.day = v; st.box = null; closeCompare(); defaults(true); render(); } });
    dayCtl.el.setAttribute('aria-labelledby', 'rv-day-l');
    slot.append(dayCtl.el);
  }
  function buildLightCtl() {
    const slot = $('.rv__light-slot'); slot.innerHTML = '';
    lightCtl = segmented({ label: 'Lighting', ink: true, value: st.light, options: lightSet(), onChange: (v) => { if (st.tool === 'photo') setTool(null); st.light = v; engine?.setLight(v); updateAria(); sync(); } });
    lightCtl.el.classList.add('rv__light');
    slot.append(lightCtl.el);
  }

  /* ---------- Seat picker ---------- */
  let rowTimer = 0;
  function buildSeatPicker() {
    const ch = choices();
    const placeSlot = $('.rv__place-slot'); const blockSlot = $('.rv__block-slot'); const rowSlot = $('.rv__row-slot'); const posSlot = $('.rv__pos-slot');
    [placeSlot, blockSlot, rowSlot, posSlot].forEach((s) => { s.innerHTML = ''; });
    if (!ch) return;
    // Stand or side, where an area has more than one.
    if (ch.places.length > 1) {
      const f = el(html`<div class="field"><span class="field__label">Stand or side</span></div>`);
      f.append(segmented({ label: 'Stand or side', value: st.place, options: ch.places.map((p) => ({ value: p.id, label: p.label })), onChange: (v) => { st.place = v; st.block = null; st.seatK = null; st.box = null; defaults(true); buildSeatPicker(); moveSeat(); renderMap(); } }).el);
      placeSlot.append(f);
    } else if (ch.place) {
      placeSlot.append(el(html`<div class="field"><span class="field__label">Where</span><p class="rv__static">${ch.place.label}</p></div>`));
    }
    buildFind();
    // Seats in a tier are chosen on the seat map or with Find my seat; the older block, row
    // and position controls stay for places without numbered seats (boxes, rooms, lawns).
    const exactArea = !!curMap()?.seats.n && (ch.section?.kind === 'tier' || ch.section?.kind === 'hall-floor');
    if (exactArea) return;
    // Block, only where the venue publishes block numbers.
    if (ch.blocks.length > 1) {
      blockSlot.append(select({ label: 'Block (published numbers)', value: st.block, options: ch.blocks.map((b) => ({ value: b, label: `Block ${b}` })), onChange: (v) => { st.block = v; st.seatK = null; moveSeat(); renderMap(); } }).el);
    } else if (ch.blocks.length === 1) {
      blockSlot.append(el(html`<div class="field"><span class="field__label">Block</span><p class="rv__static">Block ${ch.blocks[0]}</p></div>`));
    }
    // Row: numbered rows on a tier, or the spots in a box, balcony or floor.
    if (ch.rows.kind === 'numbered') {
      const n = ch.rows.n;
      const cur = ROW_KEYS.includes(st.row) ? (st.row === 'front' ? 1 : st.row === 'back' ? n : Math.floor((n - 1) / 2) + 1) : Number(st.row);
      const r = range({
        label: 'Row', min: 1, max: n, step: 1, value: cur, ticks: ['Front', 'Back'], hint: 'Row numbering is modelled',
        format: (v) => `Row ${v} of ${n}`,
        onChange: (v) => { st.row = String(v); st.seatK = null; clearTimeout(rowTimer); rowTimer = setTimeout(() => moveSeat({ quiet: true }), 60); },
      });
      rowSlot.append(r.el);
    } else if (ch.rows.kind === 'spots') {
      const f = el(html`<div class="field"><span class="field__label">Your spot</span></div>`);
      f.append(segmented({ label: 'Your spot', value: ROW_KEYS.includes(st.row) ? st.row : 'middle', options: ch.rows.options.map(([v, l]) => ({ value: v, label: l })), onChange: (v) => { st.row = v; st.seatK = null; moveSeat(); renderMap(); } }).el);
      rowSlot.append(f);
    }
    // Position along the row, the block or the run of boxes.
    if (ch.posAlong) {
      const cur = POS_KEYS.includes(st.pos) ? ({ left: 15, centre: 50, right: 85 })[st.pos] : Number(st.pos);
      const words = ch.section.kind === 'hall-box' || ch.section.kind === 'room' || ch.section.kind === 'rc-room' ? 'Along the stand' : ch.blocks.length ? 'Along the block' : 'Along the row';
      posSlot.append(range({
        label: words, min: 0, max: 100, step: 1, value: cur, ticks: ['Left', 'Right'],
        format: (v) => (v <= 8 ? 'Left end' : v >= 92 ? 'Right end' : Math.abs(v - 50) <= 4 ? 'Centre' : v < 50 ? 'Left of centre' : 'Right of centre'),
        onChange: (v) => { st.pos = String(v); st.seatK = null; st.box = null; clearTimeout(rowTimer); rowTimer = setTimeout(() => { moveSeat({ quiet: true }); renderMap(); }, 60); },
      }).el);
    }
  }

  /* ---------- Find my seat ---------- */
  const STATUS_LABEL = { stated: 'stated', measured: 'measured', standard: 'design standard', modelled: 'modelled', convention: 'numbering stated, count modelled', unpublished: 'not published' };
  const tagHtml = (s) => html`<span class="rv__tag${s === 'stated' || s === 'measured' ? ' is-stated' : s === 'standard' ? ' is-std' : ''}">${STATUS_LABEL[s] || s}</span>`;
  function buildFind() {
    const slot = $('.rv__find-slot');
    const M = curMap(); if (!M) { slot.innerHTML = ''; slot.dataset.map = ''; return; }
    const k = exactK(); const ref = k != null ? seatRef(M, k) : null;
    // Same venue and event: keep the form (and the keyboard focus and message in it), just
    // show the current seat or box in its fields.
    if (slot.dataset.map === mapKey() && slot.firstElementChild) {
      const f = slot.firstElementChild; const set = (n, v) => { const i = f.querySelector(`[name="${n}"]`); if (i && document.activeElement !== i) i.value = v; };
      if (ref) { const b = M.blocks[M.seats.blk[k]]; set('block', b.floor ? 'Arena' : b.short); set('row', ref.row); set('seat', ref.seat); }
      const bx = st.box != null ? M.boxes[st.box] : null;
      if (bx) { set('lvl', bx.level); set('box', bx.number || ''); }
      return;
    }
    slot.innerHTML = ''; slot.dataset.map = mapKey();
    const form = el(html`<form class="rv__find" novalidate aria-describedby="rv-find-note"></form>`);
    if (M.seats.n) {
      const opts0 = M.blocks.filter((b) => !b.floor).map((b) => b.short);
      const uniq = [...new Set(opts0)];
      form.append(el(html`<div class="rv__find-row">
        <div class="field"><label class="field__label" for="rv-f-block">${M.arch === 'hall' ? 'Section' : 'Block'}</label><input class="input" id="rv-f-block" name="block" list="rv-f-blocks" autocomplete="off" inputmode="text" value="${ref ? (M.blocks[M.seats.blk[k]].floor ? 'Arena' : M.blocks[M.seats.blk[k]].short) : ''}"><datalist id="rv-f-blocks">${raw(uniq.slice(0, 400).map((b) => html`<option value="${b}"></option>`).join(''))}</datalist></div>
        <div class="field"><label class="field__label" for="rv-f-row">Row</label><input class="input" id="rv-f-row" name="row" autocomplete="off" value="${ref ? ref.row : ''}"></div>
        <div class="field"><label class="field__label" for="rv-f-seat">Seat</label><input class="input" id="rv-f-seat" name="seat" inputmode="numeric" autocomplete="off" value="${ref ? ref.seat : ''}"></div>
        <button type="submit" class="btn btn--gold rv__find-go">${raw(icon('target'))}<span>Find</span></button>
      </div>`));
    }
    if (M.boxes.length) {
      const lv = [...new Map(M.boxes.map((b) => [b.level, b.levelLabel])).entries()];
      const cur = st.box != null ? M.boxes[st.box] : null;
      form.append(el(html`<div class="rv__find-row rv__find-row--box">
        <div class="field"><label class="field__label" for="rv-f-lvl">Boxes on</label><select class="select" id="rv-f-lvl" name="lvl">${raw(lv.map(([id, label]) => html`<option value="${id}"${cur?.level === id ? ' selected' : ''}>${label}</option>`).join(''))}</select></div>
        <div class="field"><label class="field__label" for="rv-f-box">Box</label><input class="input" id="rv-f-box" name="box" inputmode="numeric" autocomplete="off" value="${cur ? cur.number : ''}"></div>
        <button type="submit" class="btn btn--ghost rv__find-box" name="go" value="box">${raw(icon('target'))}<span>Find box</span></button>
      </div>`));
    }
    const note = M.data.blockNote || '';
    form.append(el(html`<p class="rv__find-note fine-print" id="rv-find-note" aria-live="polite">${note}</p>`));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form); const out = form.querySelector('.rv__find-note');
      const wantBox = e.submitter?.value === 'box' || (!M.seats.n && M.boxes.length);
      if (wantBox) {
        const n = String(fd.get('box') || '').trim(); const lvl = fd.get('lvl');
        const j = M.boxes.findIndex((b) => b.level === lvl && b.number === n);
        if (j < 0) { out.textContent = n ? `We could not find Box ${n} on that level in this model. ${M.boxes.find((b) => b.level === lvl)?.numStatus === 'stated' ? '' : 'Box numbers here are not published, so ours count from the right.'}` : 'Type a box number first.'; return; }
        pickBox(j); out.textContent = `${M.boxes[j].label}, ${M.boxes[j].levelLabel}. ${M.boxes[j].numStatus === 'stated' ? 'The number is stated by the venue; its place along the stand is modelled.' : 'Its place along the stand is modelled.'}`;
        return;
      }
      const r = findSeat(M, fd.get('block'), fd.get('row'), fd.get('seat'));
      if (r.k < 0) { out.textContent = r.note; return; }
      pickSeat(r.k);
      const s = refStatus(M, r.k);
      const caveat = s.block === 'stated' && s.row === 'stated' ? 'Seat numbers are modelled, so the exact seat may differ on the day.' : 'Some of this numbering is ours (modelled), so it may not match your ticket.';
      out.textContent = `${r.exact ? 'Found' : 'Closest in our model'}: ${seatAddress(M, r.k)}. ${r.note ? `${r.note} ` : ''}${caveat}`;
    });
    slot.append(form);
  }

  /* ---------- Area cards ---------- */
  function whereLine(a) {
    const w = whereFor(a, st.day);
    return [w.enclosure, w.stand, w.level, w.block, w.side].filter(Boolean).join(', ') || (w.note || '').split('.')[0];
  }
  function buildAreas() {
    areasEl.innerHTML = '';
    const list = areas();
    [['hospitality', 'Hospitality'], ['standard', 'Standard tickets']].forEach(([kind, title]) => {
      const items = list.filter((a) => a.kind === kind);
      if (!items.length) return;
      const g = el(html`<div class="rv__area-group" role="group" aria-label="${title}"><p class="rv__label">${title}</p><div class="rv__area-row"></div></div>`);
      const row = g.querySelector('.rv__area-row');
      items.forEach((a) => {
        const b = el(html`<button type="button" class="option-card rv__area" data-area="${a.id}" aria-pressed="false">
          <span class="option-card__label">${name(a)}</span>
          <span class="option-card__desc">${whereLine(a)}</span>
        </button>`);
        b.addEventListener('click', () => selectArea(a.id));
        row.append(b);
      });
      areasEl.append(g);
    });
    paintAreas();
  }
  function paintAreas() {
    areasEl.querySelectorAll('.rv__area').forEach((b) => {
      const on = b.dataset.area === st.area; b.setAttribute('aria-pressed', String(on));
      if (on && active) b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }

  /* ---------- Info panel ---------- */
  function renderInfo() {
    const a = area(); if (!a) { info.innerHTML = ''; return; }
    const v = venue(); const std = a.kind === 'standard';
    const w = whereFor(a, st.day); const inc = includesFor(a, st.day);
    const chipsW = [['Enclosure', w.enclosure], ['Stand', w.stand], ['Level', w.level], ['Block', w.block], ['Side', w.side]].filter(([, x]) => x);
    const facts = (VENUE_FACTS[st.venue] || []).filter((f) => !f.modes || f.modes.includes(st.mode));
    const others = otherSpacesFor(st.venue, st.day);
    // An exact seat outside this area's section (a level our research names no product for).
    const kx = exactK(); const Mx = curMap();
    const outside = kx != null && Mx.seats.area[kx] !== Mx.areaIndex.get(a.id);
    const lvlX = outside ? Mx.blocks[Mx.seats.blk[kx]].levelLabel : '';
    info.innerHTML = html`
      <div class="card rv__card">
        ${raw(outside ? html`<p class="callout rv__outside">${raw(icon('info'))}<span>${Mx.seats.area[kx] >= 0 ? `On our map your seat also falls in ${Mx.areas[Mx.seats.area[kx]].name}.` : `Your seat is on ${lvlX}, where our research places no product for this event.`} This card shows ${name(a)}.</span></p>` : '')}
        <div class="rv__card-head">
          <span class="badge ${std ? '' : 'badge--gold'}">${std ? 'Standard ticket' : 'Hospitality'}</span>
          <h3>${name(a)}</h3>
          <p class="muted">${v.name}, ${eventWords()}</p>
        </div>
        ${raw(chipsW.length ? html`<div class="rv__chips" aria-label="Where it is">${raw(chipsW.map(([k, x]) => html`<span class="chip rv__pchip"><span class="rv__pchip-k">${k}</span><span>${x}</span></span>`).join(''))}</div>` : '')}
        ${raw(w.note ? html`<p>${w.note}</p>` : '')}
        <p class="rv__kv"><span class="rv__label">Seat type</span><span>${a.seatType || 'Not published'}</span></p>
        ${raw(a.view ? html`<blockquote class="rv__quote"><p>“${a.view}”</p><footer>What the venue says about the view</footer></blockquote>` : '')}
        <div>
          <p class="rv__label">Listed by the venue</p>
          ${raw(inc.length ? html`<ul class="tick-list">${raw(inc.map((i) => html`<li>${raw(icon('check'))}<span>${i}</span></li>`).join(''))}</ul>` : html`<p class="muted">The venue does not list inclusions for this ${days().length ? 'raceday' : 'event'} in our research. A specialist can confirm what is included.</p>`)}
          ${raw(std ? '' : '<p class="fine-print">Packages change by event. A specialist confirms seats and inclusions.</p>')}
        </div>
        ${raw(a.modelled ? html`<div class="callout">${raw(icon('info'))}<span><strong>In this model:</strong> ${a.modelled}</span></div>` : '')}
        <div class="rv__handoff"></div>
        <div class="rv__actions"></div>
        <details class="rv__how">
          <summary>How this model was built</summary>
          <p class="rv__label">From published sources</p>
          <ul class="rv__facts">${raw(facts.map((f) => { const [b, c] = FACT_BADGE[f.kind] || FACT_BADGE.derived; return html`<li><span class="badge ${c}">${b}</span><span>${f.text} <span class="rv__src">Source: ${sourceName(f.src)}${f.kind === 'derived' ? ', worked out by us' : ''}.</span></span></li>`; }).join(''))}</ul>
          <p class="rv__label">Modelled where nothing is published</p>
          <ul class="rv__facts">
            <li><span class="badge">Design standard</span><span>Rows ${Math.round(DESIGN.tread * 1000)} mm deep and seats at ${500} mm centres, the FIFA minimums, unless a venue figure exists. <span class="rv__src">Source: FIFA stadium guidance.</span></span></li>
            <li><span class="badge">Design standard</span><span>Each riser set so the sightline clears the head in front by ${Math.round(DESIGN.c * 1000)} mm (the FIFA preferred C-value), never steeper than ${DESIGN.maxRake} degrees (the UK maximum the architect Populous quotes). <span class="rv__src">Source: FIFA stadium guidance and the architect, Populous.</span></span></li>
            <li><span class="badge badge--warn">Modelled</span><span>Seated eye height ${DESIGN.eye} m above the floor of the row, standing ${DESIGN.standEye} m. No readable source publishes these.</span></li>
            <li><span class="badge badge--warn">Modelled</span><span>Row counts, block widths, tier heights and anything marked "modelled" on this page.</span></li>
          </ul>
        </details>
        ${raw(others.length ? html`<div class="rv__others"><p class="rv__label">Also at this venue (no seat view in the model)</p><ul>${raw(others.map((o) => html`<li><strong>${o.name}</strong> <span class="muted">${o.where}</span></li>`).join(''))}</ul></div>` : '')}
      </div>`;
    const hand = info.querySelector('.rv__handoff');
    const hb = el(html`<button type="button" class="btn btn--ink btn--block">${raw(icon('scale'))}<span>${std ? 'Is hospitality worth it?' : 'Is this worth the upgrade?'}</span>${raw(icon('arrow-right'))}</button>`);
    hb.addEventListener('click', () => {
      const src = std ? hospitalityAreasFor(st.venue, opts())[0] : a;
      ctx.navigate('vip-worth', { event: EVENT_FOR[`${arch()}:${st.mode}`], inc: (src?.inc || []).filter((x) => x !== 'seat' || !std) });
    });
    hand.append(hb);
    const bar = actionBar({
      onBrief: () => {
        const thumb = st.view === 'real' ? null : photoOn() ? capThumb() : engine && firstFrame ? engine.snapshot(360) : null;
        ctx.brief.add({ tool: 'reality-viewer', title: `${name(a)}, ${v.name}`, subtitle: `${eventWords()}, ${seatWords()}`, lines: summaryLines(), params: params(), ...(thumb ? { thumb } : {}) });
      },
      onShare: () => ctx.share.send({ title: `${name(a)} at ${v.name}`, text: `The view from ${name(a)} at ${v.name} (a model built from published dimensions)`, url: ctx.shareUrl(params()) }),
      onEnquire: () => ctx.openEnquiry({ tool: 'reality-viewer', event: EVENT_FOR[`${arch()}:${st.mode}`], summary: `I am interested in ${name(a)} at ${v.name} (${eventWords()}).`, lines: summaryLines() }),
      extra: [{ label: 'Save this view', icon: 'download', run: saveView }],
    });
    info.querySelector('.rv__actions').append(bar.el);
  }

  function seatWords() {
    const k = exactK(); if (k != null) return seatAddress(curMap(), k);
    if (st.box != null && curMap()?.boxes[st.box]) { const b = curMap().boxes[st.box]; return `${b.label}, ${b.levelLabel}`; }
    const sp = spec(); const ch = choices();
    const bits = [];
    if (ch?.place && ch.places.length > 1) bits.push(ch.place.label);
    if (sp?.block) bits.push(`Block ${sp.block}`);
    if (sp?.rowLabel) bits.push(sp.rowLabel.toLowerCase());
    else if (ch?.rows.kind === 'spots') bits.push((ch.rows.options.find(([k]) => k === st.row) || ch.rows.options[1])[1].toLowerCase());
    return bits.join(', ') || 'seat';
  }

  function summaryLines() {
    const a = area(); const n = seatNumbers(spec());
    const lines = [
      `Venue: ${venue().name}`, `Event: ${eventWords()}`, `Area: ${name(a)} (${a.kind === 'hospitality' ? 'hospitality' : 'standard ticket'})`,
      `Seat: ${seatWords()}`,
    ];
    const inc = includesFor(a, st.day);
    if (inc.length) lines.push(`Listed by the venue: ${inc.join(', ')}`);
    if (n) lines.push(`Modelled: about ${Math.round(n.distance)} m from ${n.poiLabel}, eyes ${round(n.eyeHeight, 1)} m above ${n.floorWord || floorWord()}`);
    lines.push(photoOn() ? `View shown is a real ${CAPTURE_LABEL[photoEntry().kind].toLowerCase()} from this area (${photoEntry().credit}, ${photoEntry().takenOn}).` : 'View shown is a model built from published dimensions and UK design guidance, not a survey.');
    return lines;
  }

  /* ---------- Your seat in numbers ---------- */
  function cGrade(c) {
    if (c == null) return '';
    const mm = Math.round(c * 1000);
    if (mm >= 120) return 'at or above the FIFA optimal 120 mm (design standard)';
    if (mm >= 90) return 'meets the FIFA preferred 90 mm (design standard)';
    if (mm >= 60) return 'meets the FIFA minimum 60 mm (design standard)';
    if (mm >= 0) return 'below the 60 mm minimum (design standard): a tall head in front may clip the nearest edge of the action';
    return 'below zero: heads in front cut into the nearest edge of the action';
  }
  // The seat panel: address with its numbering status, the product, true-scale sizes and
  // the view numbers, each with its label and a plain-words source.
  function renderSeatPanel(M, k, sp) {
    const ref = seatRef(M, k); const s = refStatus(M, k); const b = M.blocks[M.seats.blk[k]];
    const a = area(); const mai = M.seats.area[k]; const mapArea = mai >= 0 ? M.areas[mai] : null;
    const product = mapArea && mapArea.id === a?.id ? name(a) : mapArea ? mapArea.name : `${b.levelLabel} (no product is placed here in our research)`;
    const pw = M.data.products?.[mapArea?.id || a?.id];
    const linkArea = mapArea?.id || a?.id;
    const link = linkArea && (mapArea?.kind || a?.kind) === 'hospitality'
      ? productLink(st.venue, linkArea, { mode: st.mode, day: st.day, tool: 'reality-viewer', name: siteProductName(st.venue, linkArea) || product })
      : null;
    const facts = seatFacts(M, k, sp);
    const part = (label, value, status) => html`<div class="rv__addr-part"><span class="rv__addr-k">${label}</span><strong>${value}</strong>${raw(tagHtml(status))}</div>`;
    numsEl.innerHTML = html`
      <div class="rv__nums-head"><h3 id="rv-nums-h">Your seat</h3><span class="badge">Model, not a survey</span></div>
      <div class="rv__addr">
        ${raw(b.floor ? part('Area', 'Arena', 'modelled') : part(M.arch === 'hall' && !/^\d/.test(b.id) ? 'Section' : 'Block', b.short, s.block))}
        ${raw(part('Row', ref.row, s.row))}
        ${raw(part('Seat', ref.seat, s.seat))}
      </div>
      <p class="rv__addr-where"><strong>${product}</strong>${raw(pw ? html`. ${pw.words} ${raw(tagHtml(pw.status))} <span class="rv__src">Source: ${pw.source}.</span>` : html`${b.levelLabel && b.levelLabel !== product ? `, ${b.levelLabel}` : ''}${b.stand ? `, ${b.stand}` : ''}`)}</p>
      ${raw(link ? html`<p class="rv__site-link">${raw(outLinkHtml(link, { cls: 'btn btn--ghost btn--sm', iconSvg: icon('external') }))}</p>` : '')}
      <dl class="rv__facts">${raw(facts.map((f) => html`<div class="rv__fact"><dt>${f.label}</dt><dd><span class="rv__fact-v${String(f.value).length > 22 ? ' is-long' : ''}">${f.value}</span> ${raw(tagHtml(f.status))}</dd>${raw(f.note || f.source ? html`<p class="rv__fact-note">${f.note}${raw(f.source ? html` <span class="rv__src">Source: ${f.source}.</span>` : '')}</p>` : '')}</div>`).join(''))}</dl>
      <p class="fine-print">${[M.data.rows?.note, M.data.seats?.note].filter(Boolean).join(' ')} The seat map and the 3D view use the same modelled seats. Sizes are not published by any of these venues, so chairs are drawn to UK and FIFA design standards.</p>`;
  }

  function renderNumbers() {
    const sp = spec(); const n = seatNumbers(sp);
    if (!n) { numsEl.hidden = true; return; }
    numsEl.hidden = false;
    const k = exactK();
    if (k != null) { renderSeatPanel(curMap(), k, sp); return; }
    // Every figure carries its label: all of these come from the model.
    const cell = (k, v, sub = '') => html`<div class="rv__num"><dt>${k}</dt><dd>${raw(v)} <span class="rv__tag">modelled</span></dd>${raw(sub ? html`<span class="rv__num-sub">${sub}</span>` : '')}</div>`;
    const offWords = n.off == null ? '' : `${Math.round(n.off)}°`;
    const bx = st.box != null ? curMap()?.boxes[st.box] : null;
    numsEl.innerHTML = html`
      <div class="rv__nums-head"><h3 id="rv-nums-h">${bx ? 'Your box in numbers' : 'Your seat in numbers'}</h3><span class="badge">Modelled</span></div>
      ${raw(bx ? html`<div class="rv__addr">${raw(html`<div class="rv__addr-part"><span class="rv__addr-k">Box</span><strong>${bx.number || ''}</strong>${raw(tagHtml(bx.numStatus === 'stated' ? 'stated' : 'unpublished'))}</div><div class="rv__addr-part"><span class="rv__addr-k">Level</span><strong>${bx.levelLabel}</strong>${raw(tagHtml(curMap().arch === 'racecourse' ? 'stated' : 'stated'))}</div><div class="rv__addr-part"><span class="rv__addr-k">Place along the stand</span><strong>${Math.round(bx.pos)}%</strong>${raw(tagHtml('modelled'))}</div>`)}</div>${raw(bx.note ? html`<p class="fine-print">${bx.note}</p>` : '')}` : '')}
      <dl class="rv__nums-grid">
        ${raw(cell(`Distance to ${n.poiLabel}`, html`${Math.round(n.distance)}<small> m</small>`, 'Straight line from your eyes'))}
        ${raw(cell(`Eye height above ${n.floorWord || floorWord()}`, html`${round(n.eyeHeight, 1)}<small> m</small>`))}
        ${raw(cell('Looking down at it', html`${Math.max(0, Math.round(n.down))}<small>°</small>`, n.down < 1 ? 'About level' : ''))}
        ${raw(cell(`Off-centre: round from ${n.offLabel}`, offWords, n.off != null && n.off > 120 ? 'Behind it' : ''))}
        ${raw(n.c == null ? html`<div class="rv__num"><dt>Sightline C-value</dt><dd><span class="rv__na">Not applicable</span></dd><span class="rv__num-sub">${n.cNote}</span></div>` : cell('Sightline C-value', html`${Math.round(n.c * 1000)}<small> mm</small>`, `${n.cNote}; ${cGrade(n.c)}`))}
        ${raw(n.rake != null ? cell('Rake of your row', html`${Math.round(n.rake)}<small>°</small>`, `UK maximum ${DESIGN.maxRake}° (design standard)`) : '')}
      </dl>
      <p class="fine-print">Modelled from published dimensions and UK design guidance, not a survey. Real rows, rakes and sightlines at ${venue().name} may differ.</p>`;
  }

  // Saves the current view as a PNG with a small branded caption strip underneath.
  function saveView() {
    if (st.view === 'real') { ctx.toast('The live map cannot be saved as a picture. Switch to Seat view to save one.', { tone: 'info' }); return; }
    if (st.tool === 'photo' && engine?.photoActive) { savePhoto(); return; }
    const photo = photoOn() ? photoEntry() : null;
    if (photo?.kind === 'matterport') { ctx.toast('The lounge tour cannot be saved as a picture. Switch to the 3D model to save one.', { tone: 'info' }); return; }
    if (!photo && (!engine || !firstFrame)) return;
    downloadShot(photo ? capCanvas(1600) : engine.snapshotCanvas(1600), photo, 'view');
  }
  function savePhoto() {
    if (!engine?.photoActive) return;
    downloadShot(engine.photoCanvas(), null, 'photo');
  }
  function downloadShot(shot, photo, kind) {
    if (!shot) { ctx.toast('Could not save the view on this device', { tone: 'warn' }); return; }
    const W = shot.width; const strip = Math.max(64, Math.round(W * 0.062));
    const c = document.createElement('canvas'); c.width = W; c.height = shot.height + strip;
    const g = c.getContext('2d');
    g.drawImage(shot, 0, 0);
    g.fillStyle = '#07111F'; g.fillRect(0, shot.height, W, strip);
    g.fillStyle = '#D8AE68'; g.fillRect(0, shot.height, W, Math.max(2, Math.round(strip * 0.04)));
    const pad = Math.round(strip * 0.42); const mid = shot.height + strip / 2;
    g.textBaseline = 'middle';
    g.fillStyle = '#E8D6B3'; g.font = `700 ${Math.round(strip * 0.3)}px "League Spartan", Arial, sans-serif`;
    g.fillText('Prestige Corporate Events', pad, mid - strip * 0.15);
    const a = area(); const cmpArea = comparing() ? areas().find((x) => x.id === st.compare) : null;
    const where = cmpArea
      ? `${venue().name}: ${name(a)} ${splitWords().a}, ${name(cmpArea)} ${splitWords().b}`
      : `${venue().name}: ${name(a)}, ${seatWords()}`;
    g.fillStyle = '#FFFFFF'; g.font = `500 ${Math.round(strip * 0.22)}px Poppins, Arial, sans-serif`;
    g.fillText(where, pad, mid + strip * 0.2, W - pad * 2 - strip * (photo ? 7 : 4.2));
    g.textAlign = 'right'; g.fillStyle = 'rgba(232,214,179,0.85)'; g.font = `500 ${Math.round(strip * 0.22)}px Poppins, Arial, sans-serif`;
    g.fillText(photo ? `${photo.kind === 'photo360' ? 'Photo' : 'Capture'}: ${photo.credit}, ${photo.takenOn}` : 'Illustrative model', W - pad, mid);
    const done = (blob) => {
      if (!blob) { ctx.toast('Could not save the view on this device', { tone: 'warn' }); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `prestige-${kind}-${st.venue}-${st.area}.png`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      ctx.toast(kind === 'photo' ? `Photo saved as a PNG (${shot.width} x ${shot.height} pixels)` : 'View saved as a PNG', { tone: 'ok' });
    };
    try { c.toBlob(done, 'image/png'); } catch { done(null); }
  }

  /* ---------- Seat map (js/viewer/seatmap-view.js) ---------- */
  const duo = $('.rv__duo'); const smEl = $('.rv__seatmap'); const smHost = $('.sm__host');
  let mapView = null; let mapShown = ''; let lastYou = null;
  const phoneWide = () => window.matchMedia('(max-width: 1023px)').matches;
  function currentSel() {
    const M = curMap(); if (!M) return null;
    const k = exactK(); if (k != null) return { kind: 'seat', k };
    if (st.box != null && M.boxes[st.box]) return { kind: 'box', idx: st.box };
    const zi = M.zones.findIndex((z) => z.area === st.area && (!st.place || z.place === st.place));
    return zi >= 0 ? { kind: 'zone', idx: zi } : null;
  }
  function renderMap() {
    const M = curMap();
    smEl.hidden = !M;
    if (!M) { mapShown = ''; return; }
    if (!mapView) mapView = new SeatMapView(smHost, { onPick: onMapPick, onCursor: () => {} });
    const sel = currentSel();
    if (mapShown !== mapKey()) {
      mapShown = mapKey();
      mapView.setMap(M, { level: null, selection: sel });
      buildLevelSelect(M); buildLegend(M);
    } else mapView.setSelection(sel, { reveal: true });
    const lv = $('.sm__level select'); if (lv && mapView.level !== lv.value) lv.value = mapView.level;
    paintYou();
  }
  function buildLevelSelect(M) {
    const slot = $('.sm__level'); slot.innerHTML = '';
    const overlap = M.arch === 'hall' || M.arch === 'racecourse';
    const opts0 = [...(overlap ? [] : [{ value: 'all', label: 'All levels' }]), ...M.levels.map((l) => ({ value: l.id, label: l.label }))];
    if (opts0.length < 2) return;
    const s = select({ label: 'Level', value: mapView.level, options: opts0, onChange: (v) => { mapView.setLevel(v); } });
    s.el.classList.add('sm__level-field');
    slot.append(s.el);
  }
  function buildLegend(M) {
    const box = $('.sm__legend');
    const sw = (c, label, cls = '') => html`<li><span class="sm__sw${cls}" style="--sw:${c}"></span>${label}</li>`;
    const prods = [];
    M.areas.forEach((a, i) => { const c = mapView.tint.get(i); if (c && (M.seats.area.includes(i) || M.boxes.some((b) => b.ai === i) || M.zones.some((z) => z.ai === i))) prods.push(sw(c, a.name)); });
    box.innerHTML = html`<ul class="sm__keys">${raw(sw('#e8c27a', 'Your seat', ' is-you'))}${raw(M.seats.n ? sw('#b9c6d8', 'Seat (zoom in to see each one)') : '')}${raw(M.access.length ? sw('#4f9cff', 'Wheelchair place (as published)', ' is-dot') : '')}${raw(prods.join(''))}</ul>
      <p class="sm__note">Drawn by us from the 3D model, not the venue's own plan. Seats are shown neutrally; hospitality areas are tinted by product. Drag to move, wheel or pinch to zoom, or Tab in and use the arrow keys.</p>`;
  }
  function paintYou(h = lastHeading) {
    if (!mapView) return;
    const sp = spec(); if (!sp) return;
    let ang = Math.atan2(sp.target[2] - sp.position[2], sp.target[0] - sp.position[0]); let half = 0.5;
    if (h && seatLike()) { ang = h.angle; half = Math.min(1.2, h.hfov / 2); }
    if (lastYou && Math.abs(lastYou.angle - ang) < 0.02 && Math.abs(lastYou.half - half) < 0.02) return;
    lastYou = { angle: ang, half };
    mapView.setYou(exactK() != null ? lastYou : null);
  }
  function onMapPick(sel) {
    const M = curMap(); if (!M || !sel) return;
    if (sel.kind === 'seat') pickSeat(sel.k);
    else if (sel.kind === 'box') pickBox(sel.idx);
    else if (sel.kind === 'zone') { const z = M.zones[sel.idx]; st.seatK = null; st.box = null; selectArea(z.area, { place: z.place }); mapView.setSelection(sel); if (phoneWide()) setPane('view'); }
  }
  // Picks one exact seat: its area and stand follow the seat, and the 3D view flies there.
  function pickSeat(k, { glide = false } = {}) {
    const M = curMap(); if (!M || k == null || k < 0) return;
    const S = M.seats; const ai = S.area[k]; const pl = S.place[k] >= 0 ? M.places[S.place[k]] : null;
    const areaId = ai >= 0 ? M.areas[ai].id : (areas().some((a) => a.id === st.area) ? st.area : standardArea()?.id);
    if (st.view === 'real') { st.view = 'seat'; applyView(); }
    const changed = areaId !== st.area;
    if (st.compare && areaId === st.compare) { st.compare = null; engine?.setCompare(null); }
    st.area = areaId; st.place = pl && pl.area === areaId ? pl.place : null;
    const b = M.blocks[S.blk[k]]; st.block = b.floor ? null : b.id;
    if (pl?.section?.kind === 'room') st.row = 'front';
    defaults(true);
    st.seatK = k; st.seatKey = mapKey(); st.box = null;
    if (changed) { paintAreas(); paintCompare(); paintPhoto(); }
    buildSeatPicker();
    const wasOverview = st.view === 'overview' || st.view === 'plan';
    moveSeat({ fly: wasOverview, glide: glide || st.view === 'move' });
    if (wasOverview && (reducedMotion() || !engine)) { st.view = 'seat'; viewCtl.set('seat'); applyView(); }
    mapView?.setSelection({ kind: 'seat', k }, { reveal: true });
    if (phoneWide() && st.pane === 'map') setPane('view');
  }
  // Keeps your exact seat when the event changes (the stands are the same for every event).
  function carrySeat(change) {
    const k = exactK(); const ref = k != null ? seatRef(curMap(), k) : null;
    change(); st.box = null; st.seatK = null;
    const M2 = ref ? curMap() : null; if (!M2) return;
    const r = findSeat(M2, ref.block, ref.row, ref.seat);
    if (r.k < 0 || !r.exact) return;
    const ai = M2.seats.area[r.k]; const pl = M2.seats.place[r.k] >= 0 ? M2.places[M2.seats.place[r.k]] : null;
    if (ai >= 0) { st.area = M2.areas[ai].id; st.place = pl && pl.area === st.area ? pl.place : null; }
    st.seatK = r.k; st.seatKey = mapKey();
  }
  function pickBox(j) {
    const M = curMap(); const bx = M?.boxes[j]; if (!bx) return;
    const sp = boxSpot(M, bx);
    if (st.view === 'real') { st.view = 'seat'; applyView(); }
    const changed = sp.area !== st.area;
    st.area = sp.area; st.place = sp.place; st.pos = sp.pos; st.block = null;
    if (!ROW_KEYS.includes(st.row)) st.row = 'front';
    defaults(true);
    st.seatK = null; st.box = j;
    if (changed) { paintAreas(); paintCompare(); paintPhoto(); }
    buildSeatPicker();
    const wasOverview = st.view === 'overview' || st.view === 'plan';
    moveSeat({ fly: wasOverview });
    if (wasOverview && (reducedMotion() || !engine)) { st.view = 'seat'; viewCtl.set('seat'); applyView(); }
    mapView?.setSelection({ kind: 'box', idx: j }, { reveal: true });
    if (phoneWide() && st.pane === 'map') setPane('view');
  }
  // After a change made with the older controls (area cards, spots, sliders), name the exact
  // seat or box the camera now sits at, so the map, the panel and the link all agree.
  function resolveExact() {
    const M = curMap(); if (!M) { st.seatK = null; st.box = null; return; }
    if (exactK() != null) { st.box = null; return; }
    st.seatK = null;
    const ch = choices(); const kind = ch?.section?.kind; const sp = legacySpec(); if (!sp) return;
    if (M.seats.n && (kind === 'tier' || kind === 'hall-floor' || (kind === 'room' && st.row !== 'back'))) {
      st.box = null;
      const tierId = kind === 'hall-floor' ? 'floor' : sp.tierId;
      const k = nearestSeat(M, sp.position[0], sp.position[1] - (sp.eye ?? DESIGN.eye), sp.position[2], tierId);
      if (k >= 0) { st.seatK = k; st.seatKey = mapKey(); }
      return;
    }
    if (kind === 'hall-box' || (kind === 'rc-room' && ch.section.style === 'box')) {
      const pos = POS_KEYS.includes(st.pos) ? ({ left: 15, centre: 50, right: 85 })[st.pos] : Number(st.pos);
      let best = null; let bd = Infinity;
      M.boxes.forEach((b, j) => { if (b.area !== st.area || b.place !== ch.place?.id) return; const d = Math.abs(b.pos - pos); if (d < bd) { bd = d; best = j; } });
      if (st.box == null || M.boxes[st.box]?.area !== st.area || M.boxes[st.box]?.place !== ch.place?.id) st.box = best;
      return;
    }
    st.box = null;
  }
  function setPane(p) {
    st.pane = p; duo.dataset.pane = p;
    tool.querySelectorAll('.rv__pane-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pane === p)));
    if (p === 'map') { mapView?.resize(); mapView?.focus(); }
    engine?.setActive(engineShouldRun());
  }
  tool.querySelector('.rv__panes').addEventListener('click', (e) => { const b = e.target.closest('.rv__pane-btn'); if (b) setPane(b.dataset.pane); });
  if (devMode() && new URLSearchParams(location.search).get('pane') === 'map') setPane('map');
  smEl.querySelector('.sm__zoom').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sm]'); if (!b || !mapView) return;
    if (b.dataset.sm === 'in') mapView.zoomBy(1.6); else if (b.dataset.sm === 'out') mapView.zoomBy(1 / 1.6); else mapView.reset();
  });

  /* ---------- Show spacing: dimension lines in 3D round your seat ---------- */
  const dimsEl = $('.rv__dims'); const spacingBtn = $('.rv__spacing'); let dimLines = [];
  function paintSpacing() {
    const k = exactK();
    spacingBtn.setAttribute('aria-pressed', String(st.spacing)); spacingBtn.classList.toggle('is-on', st.spacing);
    const on = st.spacing && k != null && !!engine && firstFrame && st.view !== 'real' && !photoOn() && st.tool !== 'photo';
    if (!on) { engine?.setSpacing(null); dimsEl.hidden = true; dimsEl.innerHTML = ''; dimLines = []; return; }
    dimLines = spacingLines(curMap(), k);
    engine.setSpacing(dimLines);
    dimsEl.innerHTML = dimLines.map((l, i) => html`<span class="rv__dim" data-i="${i}">${l.label} <em>${l.tag}</em></span>`).join('');
    dimsEl.hidden = false; placeDims();
  }
  function placeDims() {
    if (dimsEl.hidden || !engine) return;
    dimsEl.querySelectorAll('.rv__dim').forEach((s) => {
      const l = dimLines[Number(s.dataset.i)]; if (!l) return;
      const p = engine.worldToScreen(l.at);
      s.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      s.classList.toggle('is-off', !p.visible);
    });
  }
  function toggleSpacing() {
    if (exactK() == null) { st.spacing = false; paintSpacing(); ctx.toast('Spacing is drawn round seats in the stands. Choose a seat on the seat map first.', { tone: 'info' }); return; }
    st.spacing = !st.spacing;
    paintSpacing();
    // Look down at your seat and the row in front, so the lines are in view (the seat view
    // stops about 70 degrees below level).
    if (st.spacing && st.view === 'seat' && engine) { const h = engine.heading(); engine.turn(0, -1.05 - (h?.pitch || 0)); }
    updateAria();
  }

  /* ---------- Engine ---------- */
  function setStageState(s, text) { stage.dataset.state = s; if (text) loadingText.textContent = text; }

  function showPoster() {
    const src = new URL(`../../assets/poster-${arch()}.jpg`, import.meta.url).href;
    posterImg.hidden = true;
    poster.dataset.arch = arch();
    const img = new Image();
    img.onload = () => { posterImg.src = img.src; posterImg.hidden = false; };
    img.onerror = () => { /* gradient fallback stays */ };
    img.src = src;
  }

  function showFallback(reason) {
    const a = area(); const sp = spec();
    fallback.hidden = false;
    fallback.innerHTML = html`<div class="rv__fallback-card">
      <p class="eyebrow">${reason === 'model' ? 'Model in preparation' : '3D view unavailable'}</p>
      <h3>${name(a)} at ${venue().name}</h3>
      <p>${whereLine(a)}.${sp ? ` From here you are ${describeSeat(sp)}.` : ''}</p>
      <p class="fine-print">${reason === 'model' ? 'The 3D model for this venue is being prepared. The seat details on this page still apply.' : 'This device or browser cannot show 3D graphics, so here is the view in words instead.'}</p>
    </div>`;
    setStageState(reason === 'model' ? 'model' : 'fallback');
  }

  async function ensureEngine() {
    if (engine) return engine;
    if (enginePromise) return enginePromise;
    if (!hasWebGL()) { showFallback('webgl'); return null; }
    setStageState('loading', 'Preparing your view');
    enginePromise = import('../viewer/engine.js').then(async ({ createEngine }) => {
      const e = await createEngine(host, {
        lowPower,
        quality: st.quality,
        fixedQuality: !!pinnedQuality(),
        reducedMotion,
        onCamera: (h) => { lastHeading = h; paintYou(h); scheduleAria(); zoomLevelEl.textContent = `${Math.round(h.zoom * 10) / 10}x`; },
        onFlyEnd: () => { st.view = 'seat'; viewCtl.set('seat'); markersEl.hidden = true; stage.classList.remove('is-overview', 'is-plan'); updateAria(); paintPhoto(); sync(); },
        onGlideEnd: () => { paintHotspots(); updateAria(); },
        onDrawn: () => { placeHotspots(); placeDims(); },
        onPhoto: (p) => paintPhotoProgress(p),
        onProject: (pts) => paintMarkers(pts),
        onFrame: devMode() ? (s) => { devEl.hidden = false; devEl.textContent = `frame ${s.cpuMs.toFixed(1)} ms cpu | ${Math.round(s.fps)} fps | ${s.calls} calls | ${(s.tris / 1e6).toFixed(2)}M tris | ${s.view} | ${e?.quality} @${e?.pixelRatio?.toFixed(2)}`; } : null,
        onLost: () => showFallback('webgl'),
        onQuality: (q) => { st.quality = q; qualityCtl.set(q); ctx.toast('Switched to Standard quality to keep the view smooth on this device', { tone: 'info' }); },
      });
      e.canvas.addEventListener('pointerdown', () => stage.classList.add('is-used'), { once: true });
      e.canvas.addEventListener('keydown', scheduleAria);
      e.canvas.addEventListener('pointerup', scheduleAria);
      // Measure: a tap (not a drag) picks the nearest seat or named point.
      let down = null;
      e.canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
      e.canvas.addEventListener('pointerup', (ev) => {
        if (!down || (st.tool !== 'measure' && st.view !== 'plan')) { down = null; return; }
        const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y); down = null;
        if (moved > 6) return;
        if (st.tool === 'measure') measureTap(ev.clientX, ev.clientY); else planTap(ev.clientX, ev.clientY);
      });
      engine = e;
      return e;
    }).catch((err) => {
      console.warn('[viewer] 3D engine failed to start, showing the description instead', err);
      showFallback('webgl');
      return null;
    });
    return enginePromise;
  }

  // Builds (or rebuilds) the scene when the venue or mode changes, then places the seat.
  async function buildScene() {
    const variant = venue().racing || '';
    const key = `${st.venue}:${st.mode}`;
    if (!hasLayout(st.venue)) { engine?.setActive(false); showFallback('model'); built = key; return; }
    fallback.hidden = true;
    const e = await ensureEngine();
    if (!e) return;
    if (built !== key) {
      setStageState(firstFrame ? 'switching' : 'loading', firstFrame ? `Setting up ${venue().name}` : 'Preparing your view');
      built = key;
      e.setActive(false);
      const ok = await e.load({ venueId: st.venue, mode: st.mode, variant: variant || undefined });
      if (!ok || built !== key) return;
      e.setDensity(CROWD.find((c) => c.value === st.crowd).d);
      e.setLight(st.light);
      setMarkers();
      e.setSeat(spec());
      if (st.view !== 'seat' && st.view !== 'real') applyView(true);
      e.setActive(engineShouldRun());
      requestAnimationFrame(() => requestAnimationFrame(() => { firstFrame = true; setStageState('ready'); applyCompare(); paintHotspots(); if (st.tool === 'measure') renderMeasure(); updateAria(); }));
    } else {
      setMarkers();
      e.setActive(engineShouldRun());
    }
  }
  const engineShouldRun = () => active && st.view !== 'real' && !photoOn() && !(st.pane === 'map' && phoneWide());
  // Plan: a tap on the 3D plan picks the nearest seat under it (within 1.5 m).
  function planTap(cx, cy) {
    const M = curMap(); if (!M || !engine) return;
    const r = engine.canvas.getBoundingClientRect(); const w = planToWorld(engine.plan.fit(), cx - r.left, cy - r.top);
    if (M.seats.n) {
      const k = nearestSeat(M, w.x, null, w.z);
      if (k >= 0 && Math.hypot(M.seats.x[k] - w.x, M.seats.z[k] - w.z) < 1.5) { pickSeat(k); return; }
    }
    let best = -1; let bd = 16;
    M.boxes.forEach((b, j) => { const d = (b.cx - w.x) ** 2 + (b.cz - w.z) ** 2; if (d < bd) { bd = d; best = j; } });
    if (best >= 0) pickBox(best);
  }
  const seatLike = () => st.view === 'seat' || st.view === 'move';
  const engineView = () => ({ move: 'seat', overview: 'overview', plan: 'plan' })[st.view] || 'seat';
  const lift = ([x, y, z], h = 2.2) => [x, y + h, z];
  // Dollhouse and Plan hotspots: one per area, plus one per published block (standard
  // areas claim their blocks first, so a block always opens its plain seating area).
  let markerData = [];
  function markerList() {
    const list = [];
    areas().forEach((a) => { const s = seatSpec(st.venue, st.mode, a.id, {}); if (s) list.push({ id: a.id, area: a.id, label: name(a), kind: a.kind, position: lift(s.position) }); });
    const seen = new Set();
    [...areas()].sort((x, y) => (x.kind === 'standard' ? 0 : 1) - (y.kind === 'standard' ? 0 : 1)).forEach((a) => {
      (seatChoices(st.venue, st.mode, a.id, null)?.places || []).forEach((p) => {
        const ch = seatChoices(st.venue, st.mode, a.id, p.id);
        if (!ch || ch.blocks.length < 2) return;
        ch.blocks.forEach((b) => {
          if (seen.has(b)) return; seen.add(b);
          const s = seatSpec(st.venue, st.mode, a.id, { place: p.id, block: b, row: 'middle', pos: '50' });
          if (s) list.push({ id: `blk-${a.id}-${p.id}-${b}`, area: a.id, place: p.id, block: b, label: `Block ${b}`, kind: 'block', position: lift(s.position, 1.2) });
        });
      });
    });
    // Every other block whose number the venue publishes (from the seat map).
    const M = curMap();
    (M?.blocks || []).forEach((rec) => {
      if (rec.status === 'modelled' || rec.floor || seen.has(rec.id)) return; seen.add(rec.id);
      const row = rec.rowList[Math.floor(rec.rowList.length / 2)]; const k = row?.seats[Math.floor(row.seats.length / 2)]; if (k == null) return;
      const ai = M.seats.area[k];
      list.push({ id: `blk-map-${rec.id}`, area: ai >= 0 ? M.areas[ai].id : st.area, block: rec.id, label: rec.label, kind: 'block', position: [M.seats.x[k], M.seats.y[k] + 1.2 + DESIGN.eye, M.seats.z[k]] });
    });
    return list;
  }
  function setMarkers() {
    if (!engine) return;
    markerData = markerList();
    engine.setMarkers(markerData.map((m) => ({ id: m.id, position: m.position })));
    buildMarkers();
  }

  function moveSeat({ fly = false, quiet = false, glide = false } = {}) {
    resolveExact();
    sync();
    renderNumbers();
    if (!quiet) renderInfo(); else paintInfoSeat();
    if (st.tool === 'photo') setTool(null);
    if (!engine || !firstFrame) { paintYou(); renderMap(); return; }
    const sp = spec();
    if (!sp) return;
    if (fly && (st.view === 'overview' || st.view === 'plan')) { engine.setSeat(sp, { fly: true }); markersEl.hidden = true; renderMap(); paintSpacing(); return; }
    if (st.view === 'move') {
      // Move: glide to the new seat; the rings come back when the glide ends.
      engine.setSeat(sp, { glide: true });
      if (reducedMotion() || quiet) paintHotspots(); else { hotEl.hidden = true; engine.setHotspots(null); setTimeout(() => { if (hotEl.hidden && st.view === 'move') paintHotspots(); }, 1600); }
      updateAria(); paintYou(); paintMapZone(); paintSpacing(); if (st.tool === 'measure') renderMeasure();
      return;
    }
    if (st.tool === 'measure') renderMeasure();
    if (!reducedMotion() && st.view === 'seat' && !quiet) {
      fade.classList.add('is-on');
      setTimeout(() => { engine.setSeat(sp); requestAnimationFrame(() => fade.classList.remove('is-on')); updateAria(); paintSpacing(); }, 160);
    } else { engine.setSeat(sp); updateAria(); }
    paintYou(); paintMapZone(); paintSpacing();
  }
  // Light update while a slider is dragged (the card itself stays as it is).
  function paintInfoSeat() { renderDiff(); }
  function paintMapZone() { renderMap(); }

  // spot: optional { place, block } (a block hotspot in the Dollhouse or Plan).
  function selectArea(id, spot = {}) {
    if (!areas().some((a) => a.id === id)) return;
    if (st.view === 'real') { st.view = 'seat'; viewCtl.set('seat'); applyView(); }
    const wasOverview = st.view === 'overview' || st.view === 'plan';
    if (st.compare && id === st.compare) { st.compare = null; engine?.setCompare(null); }
    st.area = id; st.place = spot.place || null; st.block = spot.block || null; st.row = 'middle'; st.pos = spot.block ? '50' : 'centre';
    st.seatK = null; st.box = null;
    defaults(true);
    paintAreas();
    buildSeatPicker();
    moveSeat({ fly: wasOverview });
    renderMap();
    if (wasOverview && (reducedMotion() || !engine)) { st.view = 'seat'; viewCtl.set('seat'); applyView(); }
    paintCompare();
    paintPhoto();
    if (st.view === 'move') paintHotspots();
  }

  function applyView(force) {
    const isReal = st.view === 'real';
    stage.classList.toggle('is-real', isReal);
    paintModebar();
    if (isReal) {
      markersEl.hidden = true; stage.classList.remove('is-overview', 'is-plan', 'is-move');
      engine?.setActive(false);
      enterReal(); paintPhoto(); paintHotspots();
      return;
    }
    leaveReal(); paintPhoto();
    if (!engine || !firstFrame && !force) return;
    engine.setView(engineView());
    engine.setActive(engineShouldRun());
    const ov = st.view === 'overview' || st.view === 'plan';
    markersEl.hidden = !ov;
    stage.classList.toggle('is-overview', st.view === 'overview');
    stage.classList.toggle('is-plan', st.view === 'plan');
    stage.classList.toggle('is-move', st.view === 'move');
    paintHotspots();
    paintSpacing();
    updateAria();
  }

  /* ---------- Move: rings on nearby seats ---------- */
  let hotTargets = [];
  function paintHotspots() {
    const on = st.view === 'move' && !!engine && firstFrame && !photoOn() && st.tool !== 'photo';
    if (!on) { hotEl.hidden = true; hotEl.innerHTML = ''; hotTargets = []; engine?.setHotspots(null); return; }
    const others = moveTargets(st.venue, st.mode, st.area, seat(), areas().map((a) => ({ id: a.id, label: name(a) })));
    hotTargets = (exactK() != null ? [...exactTargets(), ...others.filter((t) => t.id.startsWith('area-'))] : others).slice(0, 9);
    engine.setHotspots(hotTargets);
    hotEl.innerHTML = '';
    hotTargets.forEach((h, k) => {
      const b = el(html`<button type="button" class="rv__hot" data-k="${k}" aria-label="Move to ${h.label}"><span class="rv__hot-ring" aria-hidden="true"></span><span class="rv__hot-label">${h.label}</span></button>`);
      b.addEventListener('click', () => goHot(h));
      hotEl.append(b);
    });
    hotEl.hidden = false;
    placeHotspots();
  }
  function placeHotspots() {
    if (hotEl.hidden || !engine) return;
    hotEl.querySelectorAll('.rv__hot').forEach((b) => {
      const h = hotTargets[Number(b.dataset.k)]; if (!h) return;
      const s = engine.worldToScreen([h.floor[0], h.floor[1] + 0.5, h.floor[2]]);
      b.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      b.classList.toggle('is-off', !s.visible);
    });
  }
  // Move targets round an exact seat: three rows forward and back, six seats along, and the
  // next block across each aisle, all real seats of the seat map.
  function exactTargets() {
    const M = curMap(); const k = exactK(); const out = [];
    const add = (id, label, k2) => {
      if (k2 == null || k2 === k || out.some((o) => o.seat.k === k2)) return;
      const sp = specForSeat(M, k2); out.push({ id, label, seat: { k: k2 }, floor: [sp.position[0], sp.position[1] - sp.eye, sp.position[2]], position: sp.position });
    };
    const walk = (from, dir, n) => { let x = from; for (let i = 0; i < n; i++) { const y = neighbour(M, x, dir); if (y === x) break; x = y; } return x; };
    const ref = (kk) => seatRef(M, kk);
    const f = walk(k, 'front', 3); add('row-front', `Row ${ref(f).row}`, f);
    const bk = walk(k, 'back', 3); add('row-back', `Row ${ref(bk).row}`, bk);
    const l = walk(k, 'prev', 6); add('left', `Seat ${ref(l).seat}`, l);
    const r = walk(k, 'next', 6); add('right', `Seat ${ref(r).seat}`, r);
    const b = M.blocks[M.seats.blk[k]]; const row = b.rowList[M.seats.rib[k]];
    [['prev', row.seats[0]], ['next', row.seats[row.seats.length - 1]]].forEach(([dir, end]) => {
      const x = neighbour(M, end, dir);
      if (M.seats.blk[x] === M.seats.blk[k]) return;
      add(`block-${dir}`, M.blocks[M.seats.blk[x]].label, walk(x, dir, 3));
    });
    return out;
  }
  function goHot(h) {
    const s = h.seat;
    if (s.k != null) { pickSeat(s.k, { glide: true }); engine?.canvas.focus({ preventScroll: true }); return; }
    st.seatK = null; st.box = null;
    if (s.area !== st.area) {
      st.area = s.area; st.place = s.place || null; st.block = s.block || null; st.row = s.row || 'middle'; st.pos = s.pos || 'centre';
      defaults(true); paintAreas(); renderMap(); paintCompare();
    } else {
      st.place = s.place ?? st.place; st.block = s.block ?? st.block; st.row = s.row ?? st.row; st.pos = s.pos ?? st.pos;
      defaults(true);
    }
    buildSeatPicker();
    moveSeat({ glide: true });
    engine?.canvas.focus({ preventScroll: true }); // the ring buttons are rebuilt after the glide
  }

  /* ---------- Tools: Measure and Photo ---------- */
  function setTool(t) {
    const prev = st.tool;
    if (prev === 'photo' && t !== 'photo') engine?.stopPhoto();
    st.tool = t;
    if (t && st.view === 'real') { st.view = 'seat'; applyView(); }
    if (t && comparing()) closeCompare();
    measureEl.hidden = t !== 'measure'; photoEl.hidden = t !== 'photo';
    stage.classList.toggle('is-measure', t === 'measure'); stage.classList.toggle('is-photo-mode', t === 'photo');
    if (t === 'measure') { if (!meas.a) meas.a = yourEyes(); renderMeasure(); } else engine?.setMeasure(null);
    paintPhoto();
    paintSpacing();
    if (t === 'photo') startPhoto();
    paintHotspots(); paintModebar(); updateAria();
  }
  const yourEyes = () => { const sp = spec(); return sp ? { id: 'you', p: sp.position.slice(), label: exactK() != null ? `Your seat, ${seatWords()} (eye height)` : 'Your seat (eye height)' } : null; };
  function measureOptions() {
    return [yourEyes(), ...measurePoints(st.venue, st.mode).map((m, k) => ({ id: `pt${k}`, p: m.p, label: m.label }))].filter(Boolean);
  }
  function renderMeasure() {
    if (meas.a?.id === 'you') meas.a = yourEyes();
    if (meas.b?.id === 'you') meas.b = yourEyes();
    const opts0 = measureOptions(); const box = $('.rv__meas-pts'); box.innerHTML = '';
    ['a', 'b'].forEach((k) => {
      const cur = meas[k]; const list = [...opts0];
      if (cur && !list.some((o) => o.id === cur.id)) list.push(cur);
      const s = select({ label: k === 'a' ? 'From' : 'To', value: cur?.id || '', placeholder: 'Tap a point in the view', options: list.map((o) => ({ value: o.id, label: o.label })), onChange: (v) => { meas[k] = list.find((o) => o.id === v) || null; paintMeasure(); } });
      box.append(s.el);
    });
    const f = el(html`<div class="field rv__meas-next"><span class="field__label">Next tap sets</span></div>`);
    f.append(segmented({ label: 'Next tap sets', ink: true, value: meas.next, options: [{ value: 'a', label: 'From' }, { value: 'b', label: 'To' }], onChange: (v) => { meas.next = v; } }).el);
    box.append(f);
    paintMeasure();
  }
  function paintMeasure() {
    engine?.setMeasure(meas.a?.p, meas.b?.p);
    const out = $('.rv__meas-out');
    if (meas.a && meas.b) {
      const d = Math.hypot(meas.a.p[0] - meas.b.p[0], meas.a.p[1] - meas.b.p[1], meas.a.p[2] - meas.b.p[2]);
      out.innerHTML = html`<strong>${d < 10 ? d.toFixed(1) : Math.round(d)} m</strong> in a straight line <span class="rv__tag">modelled</span>`;
    } else out.textContent = meas.a ? 'Now tap the second point, or choose it above.' : 'Tap the first point, or choose it above.';
  }
  function measureTap(x, y) {
    const hit = engine?.pick(x, y);
    if (!hit) { ctx.toast('Nothing to measure to there. Tap a seat, the stage or a marking.', { tone: 'info' }); return; }
    // A seat tap is named by its seat map address.
    if (hit.kind === 'seat') { const M = curMap(); const k = M ? nearestSeat(M, hit.p[0], hit.p[1] - 0.45, hit.p[2]) : -1; if (k >= 0) hit.label = `${seatAddress(M, k)} (seat height)`; }
    meas[meas.next] = { id: `tap-${meas.next}`, p: hit.p, label: hit.label };
    if (meas.next === 'a') meas.next = 'b';
    renderMeasure();
  }
  function startPhoto() {
    if (!engine || !firstFrame) { ctx.toast('The 3D view is still loading. Try Photo again in a moment.', { tone: 'info' }); st.tool = null; photoEl.hidden = true; stage.classList.remove('is-photo-mode'); paintModebar(); return; }
    photoSaveBtn.disabled = true;
    const hq = st.quality === 'high' && !lowPower;
    paintPhotoProgress({ progress: 0, done: false });
    engine.startPhoto({ samples: Number(new URLSearchParams(location.search).get('photosamples')) || (hq ? 64 : 32), scale: lowPower ? 1.25 : 2 });
  }
  let lastPhotoStep = -1;
  function paintPhotoProgress({ progress = 0, done = false, total = 0 }) {
    photoEl.querySelector('.rv__photo-bar span').style.transform = `scaleX(${progress.toFixed(3)})`;
    const step = done ? 4 : Math.floor(progress * 4);
    if (step !== lastPhotoStep || done) {
      lastPhotoStep = step;
      photoEl.querySelector('.rv__photo-out').textContent = done ? `Ready: ${total} frames combined into one still.` : `Refining the picture: ${Math.round(progress * 100)} per cent`;
    }
    photoSaveBtn.disabled = !done;
  }

  /* ---------- Real captures: 360 photos, splat scans, lounge tours ---------- */
  // "photo" in names below means any real capture (the hash keeps src=model for the model).
  const photoEntry = () => captureFor(st.venue, st.area, { mode: st.mode, block: spec()?.block || st.block });
  const capKey = (e) => (e ? `${e.kind}:${e.key}:${e.src || e.model}` : '');
  const wantPhoto = () => !!photoEntry() && st.src !== 'model' && st.view === 'seat' && !comparing() && !st.tool;
  function photoOn() { return wantPhoto() && capShown === capKey(photoEntry()); }
  function capCanvas(maxW) { const e = photoEntry(); return e?.kind === 'photo360' ? pano?.snapshotCanvas(maxW) : e?.kind === 'splat' ? splat?.snapshotCanvas(maxW) : null; }
  function capThumb() { const c = capCanvas(360); try { return c ? c.toDataURL('image/jpeg', 0.78) : null; } catch { return null; } }
  function hideCaptures() {
    capShown = ''; panoShown = false; pano?.setActive(false); splat?.setActive(false);
    if (!tourEl.hidden) { tourEl.hidden = true; tourEl.innerHTML = ''; }
    delete stage.dataset.capture;
  }
  async function ensureSplat() {
    if (splat) return splat;
    if (!splatPromise) {
      splatPromise = import('../viewer/splat.js').then(({ createSplatView }) => (splat = createSplatView(splatHost, { reducedMotion })))
        .catch((err) => { console.warn('[viewer] splat viewer failed to start', err); splatPromise = null; return null; });
    }
    return splatPromise;
  }
  // Shows a splat scan or a lounge tour (360 photos keep their own path below).
  async function showOtherCapture(entry) {
    const key = capKey(entry);
    if (capShown === key) return true;
    if (entry.kind === 'matterport') {
      tourEl.innerHTML = '';
      const f = document.createElement('iframe');
      f.src = matterportSrc(entry); f.title = `Real tour of ${name(area())} at ${venue().name}`;
      f.setAttribute('allow', 'fullscreen; xr-spatial-tracking'); f.setAttribute('allowfullscreen', ''); f.loading = 'lazy';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      tourEl.append(f); tourEl.hidden = false;
      pano?.setActive(false); splat?.setActive(false);
      capShown = key; return true;
    }
    if (!webglReady()) return false;
    const s = await ensureSplat(); if (!s) return false;
    const ok = await s.load(entry);
    if (!ok) return false;
    if (!wantPhoto() || capKey(photoEntry()) !== key) return false;
    pano?.setActive(false); if (!tourEl.hidden) { tourEl.hidden = true; tourEl.innerHTML = ''; }
    s.setActive(active);
    s.canvas?.setAttribute('aria-label', `Real 3D scan of ${name(area())} at ${venue().name} (${entry.credit}, ${entry.takenOn}). Drag to look around.`);
    capShown = key; return true;
  }

  async function ensurePano() {
    if (pano) return pano;
    if (!panoPromise) {
      panoPromise = import('../viewer/panorama.js').then(({ createPanorama }) => {
        pano = createPanorama(panoHost, { reducedMotion, onChange: ({ zoom }) => { if (photoOn()) zoomLevelEl.textContent = `${Math.round(zoom * 10) / 10}x`; } });
        pano.canvas.addEventListener('pointerdown', () => stage.classList.add('is-used'), { once: true });
        return pano;
      }).catch((err) => { console.warn('[viewer] 360 photo viewer failed to start, showing the 3D model', err); panoPromise = null; return null; });
    }
    return panoPromise;
  }

  function paintCaption() {
    const entry = photoEntry(); const seatV = st.view === 'seat';
    const what = { photo360: 'A real 360 photo from this area.', splat: 'A real 3D scan of this area.', matterport: 'A real tour of this lounge.' };
    if (photoOn()) capText.textContent = `${entry.kind === 'photo360' ? 'Photo' : 'Capture'}: ${entry.credit}, ${entry.takenOn}. ${what[entry.kind]}`;
    else if (st.view === 'plan') capText.textContent = 'Plan of the model, drawn from published dimensions, not a survey.';
    else capText.textContent = 'Illustrative model built from published dimensions, not an exact rendering.';
    tool.querySelector('.rv__hint').textContent = st.view === 'plan' ? ' Drag to move the plan.' : st.view === 'overview' ? ' Drag to turn the model.' : st.tool === 'measure' ? ' Tap two points to measure.' : ' Drag to look around.';
    soonEl.hidden = !(seatV && !entry);
    srcSlot.hidden = !(seatV && entry && !comparing() && !st.tool);
    srcCtl.set(st.src);
    tool.classList.toggle('is-photo-on', photoOn());
    stage.classList.toggle('is-photo', photoOn());
    if (photoOn()) stage.dataset.capture = entry.kind; else delete stage.dataset.capture;
  }

  async function paintPhoto() {
    if (!wantPhoto()) {
      hideCaptures();
      paintCaption();
      if (engine && firstFrame) { engine.setActive(engineShouldRun()); zoomLevelEl.textContent = `${Math.round((engine.heading()?.zoom || 1) * 10) / 10}x`; }
      return;
    }
    const entry = photoEntry();
    paintCaption();
    if (entry.kind !== 'photo360') {
      const ok = await showOtherCapture(entry);
      if (!ok) {
        if (wantPhoto() && capKey(photoEntry()) === capKey(entry)) {
          ctx.toast('The real capture could not load, so the 3D model is showing instead', { tone: 'warn' });
          st.src = 'model'; paintPhoto(); sync();
        }
        return;
      }
      engine?.setActive(false); paintCaption(); paintHotspots();
      return;
    }
    splat?.setActive(false); if (!tourEl.hidden) { tourEl.hidden = true; tourEl.innerHTML = ''; }
    if (!webglReady()) return;
    const p = await ensurePano();
    if (!p) { st.src = 'model'; paintPhoto(); return; }
    if (panoSrc !== entry.src) {
      panoShown = false; paintCaption();
      panoSrc = entry.src;
      const ok = await p.load(entry);
      if (!ok) {
        if (panoSrc === entry.src) panoSrc = '';
        ctx.toast('The 360 photo could not load, so the 3D model is showing instead', { tone: 'warn' });
        st.src = 'model'; paintPhoto(); sync();
        return;
      }
    }
    if (!wantPhoto() || photoEntry()?.src !== entry.src) { paintPhoto(); return; }
    panoShown = true; capShown = capKey(entry);
    p.setActive(active);
    engine?.setActive(false);
    zoomLevelEl.textContent = `${Math.round(p.zoom * 10) / 10}x`;
    paintCaption();
    p.canvas.setAttribute('aria-label', `Real 360 degree photo from ${name(area())} at ${venue().name}. Photo: ${entry.credit}, taken on ${entry.takenOn}. Drag or use the arrow keys to look around.`);
  }

  /* ---------- Real venue: Google's photorealistic 3D map ---------- */
  function realCard(kind) {
    const v = venue(); const nokey = kind === 'nokey';
    realEmpty.innerHTML = html`<div class="rv__fallback-card rv__real-card">
      <p class="eyebrow">${raw(icon('pin'))} Real venue</p>
      <h3>${nokey ? 'Live 3D map not set up yet' : 'The live map could not load'}</h3>
      <p>${nokey ? `This view will show ${v.name} from the air on a live, photorealistic 3D map. It switches on once the map service is connected.` : 'The map service did not respond just now. It may be your connection, or the service may be busy.'}</p>
      <p class="fine-print">Seat view and the overview still work as normal.</p>
      <div class="rv__real-actions">
        ${raw(nokey ? '' : html`<button type="button" class="btn btn--gold btn--sm" data-act="real-retry">${raw(icon('rotate'))}<span>Try again</span></button>`)}
        <button type="button" class="btn btn--ghost-ink btn--sm" data-act="real-back">${raw(icon('eye'))}<span>Back to seat view</span></button>
      </div>
    </div>`;
  }
  function paintReal(state) {
    realEl.dataset.state = state;
    realTools.classList.toggle('is-off', state !== 'ready');
    if (state === 'nokey' || state === 'error') realCard(state); else realEmpty.innerHTML = '';
  }
  function paintOrbit(on) {
    orbitBtn.setAttribute('aria-pressed', String(on));
    orbitBtn.innerHTML = `${icon(on ? 'pause' : 'play')}<span>${on ? 'Pause the orbit' : 'Orbit the venue'}</span>`;
  }
  async function enterReal() {
    realEl.hidden = false; realTools.hidden = false;
    paintOrbit(!!real?.orbiting);
    if (!GOOGLE_MAPS_KEY) { paintReal('nokey'); return; }
    if (!real) {
      if (!realPromise) {
        paintReal('loading');
        realPromise = import('../viewer/real-venue.js').then(({ createRealVenue }) => {
          real = createRealVenue(realMap, { key: GOOGLE_MAPS_KEY, reducedMotion, onState: paintReal, onOrbit: paintOrbit });
          return real;
        }).catch(() => { paintReal('error'); realPromise = null; return null; });
      }
      await realPromise;
      if (!real || st.view !== 'real') return;
    }
    real.setActive(active);
    if (realVenue !== st.venue) { realVenue = st.venue; real.show(venue()); }
  }
  function leaveReal() { realEl.hidden = true; realTools.hidden = true; real?.setActive(false); }
  function retryReal() { real?.dispose(); real = null; realPromise = null; realVenue = ''; enterReal(); }

  /* ---------- Overview markers ---------- */
  function buildMarkers() {
    markersEl.innerHTML = '';
    markerData.forEach((m) => {
      const cls = m.kind === 'block' ? ' is-block' : m.kind === 'standard' ? ' is-std' : '';
      const ar = areas().find((a) => a.id === m.area);
      const words = m.kind === 'block' ? `${m.label}${ar ? `, ${name(ar)}` : ''}` : m.label;
      const b = el(html`<button type="button" class="rv__marker${cls}" data-mid="${m.id}" aria-label="Go to ${words}"><span class="rv__marker-dot" aria-hidden="true"></span><span class="rv__marker-label">${m.label}</span></button>`);
      b.addEventListener('click', () => (m.kind === 'block' ? openBlock(m) : selectArea(m.area)));
      markersEl.append(b);
    });
  }
  // A block hotspot in the Dollhouse or Plan: opens that block on the seat map and flies to
  // the middle seat of its middle row.
  function openBlock(m) {
    const M = curMap(); const rec = M?.blockById.get(String(m.block).toLowerCase());
    if (!rec) { selectArea(m.area, { place: m.place, block: m.block }); return; }
    const row = rec.rowList[Math.floor(rec.rowList.length / 2)];
    pickSeat(row.seats[Math.floor(row.seats.length / 2)]);
    mapView?.focusBlock(rec);
  }
  function paintMarkers(pts) {
    pts.forEach((p) => {
      const b = markersEl.querySelector(`[data-mid="${p.id}"]`); if (!b) return;
      const m = markerData.find((x) => x.id === p.id);
      b.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      b.classList.toggle('is-off', !p.visible);
      b.classList.toggle('is-on', m?.kind === 'block' ? m.area === st.area && String(m.block) === String(spec()?.block) : p.id === st.area);
    });
  }

  /* ---------- Compare: split screen ---------- */
  function comparing() { return !!st.compare && st.compare !== st.area && areas().some((a) => a.id === st.compare); }
  const isStacked = () => viewport.clientWidth < viewport.clientHeight;
  function splitWords() { return isStacked() ? { a: '(top)', b: '(bottom)' } : { a: '(left)', b: '(right)' }; }
  const cmpSpec = () => seatSpec(st.venue, st.mode, st.compare, {});

  function paintSplit() {
    const on = comparing() && firstFrame;
    splitEl.hidden = !on; stage.classList.toggle('is-split', on);
    if (!on) return;
    const stacked = isStacked();
    stage.classList.toggle('is-stacked', stacked);
    viewport.style.setProperty('--split', split.toFixed(3));
    const a = area(); const b = areas().find((x) => x.id === st.compare);
    splitEl.querySelector('.rv__split-label--a .badge').textContent = a.kind === 'standard' ? 'Standard ticket' : 'Your choice';
    splitEl.querySelector('.rv__split-label--a .rv__split-name').textContent = name(a);
    splitEl.querySelector('.rv__split-label--b .rv__split-name').textContent = name(b);
    splitEl.querySelector('.rv__split-label--b .badge').textContent = b.kind === 'standard' ? 'Standard ticket' : 'Hospitality';
    divider.setAttribute('aria-orientation', stacked ? 'horizontal' : 'vertical');
    divider.setAttribute('aria-valuenow', String(Math.round(split * 100)));
    divider.setAttribute('aria-valuetext', `${Math.round(split * 100)} per cent of the view shows ${name(a)}`);
  }

  function renderDiff() {
    const on = comparing();
    diffEl.hidden = !on;
    if (!on) { diffEl.innerHTML = ''; return; }
    const a = area(); const b = areas().find((x) => x.id === st.compare);
    const na = seatNumbers(spec()); const nb = seatNumbers(cmpSpec());
    if (!na || !nb) { diffEl.hidden = true; return; }
    const rowsD = [
      ['Distance', na.distance, nb.distance, 'm', 0, (d) => (d < 0 ? `${Math.abs(d)} m closer` : d > 0 ? `${d} m further` : 'Same')],
      ['Eye height', na.eyeHeight, nb.eyeHeight, 'm', 1, (d) => (d > 0 ? `${d} m higher` : d < 0 ? `${Math.abs(d)} m lower` : 'Same')],
      ['Looking down', Math.max(0, na.down), Math.max(0, nb.down), '°', 0, (d) => (d > 0 ? `${d}° steeper` : d < 0 ? `${Math.abs(d)}° flatter` : 'Same')],
      [`Round from ${na.offLabel}`, na.off, nb.off, '°', 0, (d) => (d < 0 ? `${Math.abs(d)}° more central` : d > 0 ? `${d}° further round` : 'Same')],
    ];
    const max = (x, y) => Math.max(1e-6, Math.abs(x), Math.abs(y));
    const rows = rowsD.map(([label, va, vb, unit, k, words]) => {
      const ra = round(va, k); const rb = round(vb, k); const d = round(ra - rb, k);
      const m = max(ra, rb);
      return html`<li class="rv__diff-row">
        <span class="rv__diff-label">${label}</span>
        <span class="rv__diff-bars" aria-hidden="true"><span class="rv__diff-bar rv__diff-bar--a" style="--v:${Math.abs(ra) / m}"></span><span class="rv__diff-bar rv__diff-bar--b" style="--v:${Math.abs(rb) / m}"></span></span>
        <span class="rv__diff-nums">${ra}${unit} <span class="muted">vs</span> ${rb}${unit}</span>
        <span class="rv__diff-delta">${words(d)}</span>
      </li>`;
    }).join('');
    const ia = includesFor(a, st.day).length; const ib = includesFor(b, st.day).length;
    const w = splitWords();
    diffEl.innerHTML = html`<div class="rv__diff-head">
        <h3>${name(a)} <span class="muted">against</span> ${name(b)}</h3>
        <span class="badge">Modelled</span>
      </div>
      <p class="rv__diff-key"><span class="rv__diff-sw rv__diff-sw--a"></span>${name(a)} ${w.a} <span class="rv__diff-sw rv__diff-sw--b"></span>${name(b)} ${w.b}</p>
      <ul class="rv__diff-list">${raw(rows)}</ul>
      <p class="rv__diff-inc">Listed by the venue: ${ia ? `${ia} inclusion${ia === 1 ? '' : 's'}` : 'none in our research'} against ${ib ? `${ib}` : 'none'}${b.kind === 'standard' ? ' (a standard ticket is the seat or entry only)' : ''}.</p>
      <p class="fine-print">Figures come from the model, built from published dimensions and UK design guidance, not a survey.</p>`;
  }

  function paintCompare() {
    const btn = $('.rv__compare'); const std = standardArea();
    if (!std) { btn.hidden = true; return; }
    btn.hidden = false;
    const on = comparing();
    btn.querySelector('span').textContent = on ? 'Close the comparison' : st.area === std.id || area()?.kind === 'standard' ? 'Compare with hospitality' : 'Compare with a standard ticket';
    btn.setAttribute('aria-pressed', String(on));
    paintSplit(); renderDiff();
    paintPhoto();
  }
  function applyCompare() {
    if (engine && firstFrame) {
      if (comparing()) engine.setCompare(cmpSpec(), { split, stacked: isStacked() });
      else engine.setCompare(null);
    }
    paintCompare(); paintYou();
  }
  function closeCompare() { st.compare = null; engine?.setCompare(null); paintCompare(); paintYou(); }
  function toggleCompare() {
    const std = standardArea(); if (!std) return;
    if (comparing()) { closeCompare(); sync(); updateAria(); return; }
    if (st.view !== 'seat') { st.view = 'seat'; viewCtl.set('seat'); applyView(); }
    if (area()?.kind === 'standard') {
      // From a standard seat, compare against the venue's main hospitality product.
      const h = areas().find((a) => a.id === defaultAreaFor(st.venue)) || hospitalityAreasFor(st.venue, opts())[0];
      if (!h) return;
      const from = st.area; selectArea(h.id); st.compare = from;
    } else st.compare = std.id;
    applyCompare(); sync(); updateAria();
  }
  function setSplit(v) {
    split = Math.min(0.85, Math.max(0.15, v));
    if (engine && comparing()) engine.setCompare(cmpSpec(), { split, stacked: isStacked() });
    paintSplit();
  }
  divider.addEventListener('pointerdown', (e) => { try { divider.setPointerCapture(e.pointerId); } catch { /* not capturable */ } e.preventDefault(); });
  divider.addEventListener('pointermove', (e) => {
    if (!divider.hasPointerCapture?.(e.pointerId)) return;
    const r = viewport.getBoundingClientRect();
    setSplit(isStacked() ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width);
  });
  divider.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.05;
    const map = { ArrowLeft: -step, ArrowUp: -step, ArrowRight: step, ArrowDown: step };
    if (e.key in map) { e.preventDefault(); setSplit(split + map[e.key]); }
    if (e.key === 'Home') { e.preventDefault(); setSplit(0.15); }
    if (e.key === 'End') { e.preventDefault(); setSplit(0.85); }
  });
  let lastStacked = null;
  const vpObserver = new ResizeObserver(() => {
    const s = isStacked();
    if (s !== lastStacked) { lastStacked = s; if (comparing()) { setSplit(split); renderDiff(); } }
  });
  vpObserver.observe(viewport);

  /* ---------- Toolbar actions ---------- */
  tool.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    const cap = photoOn() ? photoEntry().kind : null;
    const look = cap === 'photo360' ? pano : cap ? null : engine;
    const zoomPlan = (f) => { engine.plan.setZoom(engine.plan.zoom * f); zoomLevelEl.textContent = `${Math.round(engine.plan.zoom * 10) / 10}x`; };
    if (act === 'zoom-in') { if (st.view === 'plan' && engine) zoomPlan(1.4); else look?.zoomBy(1.4); }
    if (act === 'zoom-out') { if (st.view === 'plan' && engine) zoomPlan(1 / 1.4); else look?.zoomBy(1 / 1.4); }
    if (act === 'reset') {
      if (st.view === 'plan' && engine) { engine.plan.reset(); zoomLevelEl.textContent = '1x'; return; }
      if (!seatLike()) { st.view = 'seat'; viewCtl.set('seat'); applyView(); sync(); }
      if (cap === 'photo360') pano.reset(); else if (!cap) engine?.resetLook();
    }
    if (act === 'tool-off') setTool(null);
    if (act === 'photo-save') savePhoto();
    if (act === 'orbit' && real) {
      if (!real.orbiting && reducedMotion()) { ctx.toast('The orbit is off because your device asks for reduced motion. Drag the map to look around.', { tone: 'info' }); return; }
      real.orbit(!real.orbiting);
    }
    if (act === 'preset') real?.preset(e.target.closest('[data-preset]').dataset.preset);
    if (act === 'real-retry') retryReal();
    if (act === 'real-back') { st.view = 'seat'; viewCtl.set('seat'); applyView(); sync(); }
    if (act === 'wave') {
      if (reducedMotion()) { ctx.toast('The wave is paused because your device asks for reduced motion', { tone: 'info' }); return; }
      engine?.wave();
    }
    if (act === 'race') {
      if (!engine || !firstFrame) return;
      engine.play('race');
      if (reducedMotion()) ctx.toast('Reduced motion is on, so the field is shown standing still at the finish', { tone: 'info' });
    }
    if (act === 'fullscreen') toggleFullscreen();
    if (act === 'compare') toggleCompare();
    if (act === 'spacing') toggleSpacing();
  });
  const fsBtn = $('.rv__fs');
  if (!document.fullscreenEnabled) fsBtn.hidden = true;
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stage.requestFullscreen?.().catch(() => ctx.toast('Full screen is not available here', { tone: 'warn' }));
  }
  const onFs = () => {
    const on = document.fullscreenElement === stage;
    stage.classList.toggle('is-fullscreen', on);
    fsBtn.innerHTML = icon(on ? 'minimize' : 'maximize');
    fsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  };
  document.addEventListener('fullscreenchange', onFs);

  /* ---------- Words for assistive technology ---------- */
  function directionWords() {
    const h = engine ? engine.heading() : lastHeading; const sp = spec();
    if (!h || !sp || !seatLike()) return '';
    const poi = sp.poi?.label || 'the action';
    const base = Math.atan2(sp.target[2] - sp.position[2], sp.target[0] - sp.position[0]);
    let d = h.angle - base; d = Math.atan2(Math.sin(d), Math.cos(d));
    const side = Math.abs(d) < 0.25 ? `towards ${poi}` : `${Math.abs(d) < 0.8 ? 'a little' : 'well'} to the ${d > 0 ? 'right' : 'left'} of ${poi}`;
    const vert = h.pitch > 0.15 ? ', looking up' : h.pitch < -0.45 ? ', looking down' : '';
    return `You are looking ${side}${vert}${h.zoom > 1.2 ? `, zoomed in ${h.zoom.toFixed(1)} times` : ''}.`;
  }
  function updateAria() {
    const canvas = engine?.canvas; if (!canvas) return;
    const a = area(); const sp = spec();
    const lw = LIGHT_WORDS[isOutdoor(arch()) ? 'outdoor' : 'indoor'][st.light] || '';
    const b = comparing() ? areas().find((x) => x.id === st.compare) : null;
    const w0 = splitWords(); const cap = (s) => s.replace(/[()]/g, '').replace(/^./, (c) => c.toUpperCase());
    const ev = MODE_WORDS[st.mode] || modeLabel().toLowerCase();
    const tools = st.tool === 'measure' ? ' Measuring: tap two points, or choose them in the Measure panel.' : st.tool === 'photo' ? ' Photo mode: the picture is holding still while it sharpens.' : '';
    const label = st.view === 'overview'
      ? `Dollhouse view: a 3D model of ${venue().name} from outside with the roof off, set up for ${ev}, ${lw}, with buttons for each seating area${markerData.some((m) => m.kind === 'block') ? ' and block' : ''}. Drag to turn it.${tools}`
      : st.view === 'plan'
        ? `Plan view: a top-down plan of the model of ${venue().name} set up for ${ev}, with buttons for each seating area. Drag to move the plan, use the wheel or plus and minus to zoom.${tools}`
        : `${b ? `Split screen comparing two seats. ${cap(w0.a)}: ` : ''}3D model view from ${name(a)}, ${seatWords()}, at ${venue().name} for ${ev} ${lw}. ${sp ? `You are ${describeSeat(sp)}.` : ''} ${b ? `${cap(w0.b)}: the same direction from ${name(b)}. ` : ''}${directionWords()} Drag or use the arrow keys to look round a full circle.${st.view === 'move' ? ' Move: buttons over the view step to nearby seats.' : ''}${tools}`;
    canvas.setAttribute('aria-label', label.replace(/\s+/g, ' ').trim());
  }
  function scheduleAria() { clearTimeout(headingTimer); headingTimer = setTimeout(updateAria, 400); }

  /* ---------- Params ---------- */
  function params() {
    // An exact seat writes its address (block, row label, seat number); a box its number.
    const k = exactK(); const M = curMap();
    const ref = k != null ? seatRef(M, k) : null; const bx = st.box != null ? M?.boxes[st.box] : null;
    return {
      venue: st.venue, mode: st.mode, day: st.day || undefined, area: st.area, place: st.place || undefined,
      block: ref ? (M.blocks[M.seats.blk[k]].floor ? 'Arena' : ref.block) : (st.block || undefined),
      row: ref ? ref.row : st.row, seat: ref ? ref.seat : undefined, pos: ref ? undefined : st.pos,
      box: bx && !ref ? bx.number : undefined, light: st.light, view: st.view,
      compare: comparing() ? st.compare : undefined, crowd: st.crowd !== 'full' ? st.crowd : undefined,
      src: st.src === 'model' && photoEntry() ? 'model' : undefined,
    };
  }
  function sync() { if (active) ctx.setParams(params()); }

  /* ---------- Render ---------- */
  function render() {
    defaults(true);
    resolveExact();
    sel.value = st.venue;
    $('.rv__venue-icon').innerHTML = icon(venue().icon || 'stadium');
    buildModeCtl(); buildDayCtl(); buildLightCtl(); buildAreas(); buildSeatPicker();
    viewCtl.set(st.view); crowdCtl.set(st.crowd); qualityCtl.set(st.quality);
    const outdoor = isOutdoor(arch());
    const waveBtn = $('.rv__wave'); const race = arch() === 'racecourse';
    waveBtn.hidden = arch() === 'hall';
    waveBtn.dataset.act = race ? 'race' : 'wave';
    waveBtn.innerHTML = `${icon(race ? 'play' : 'wave')}<span>${race ? 'Watch a race' : 'Start a wave'}</span>`;
    waveBtn.toggleAttribute('aria-disabled', !race && reducedMotion());
    stage.dataset.arch = arch(); stage.dataset.outdoor = String(outdoor);
    showPoster();
    if (st.view === 'real') applyView(); else { stage.classList.remove('is-real'); leaveReal(); }
    paintCompare();
    renderInfo();
    renderNumbers();
    renderMap();
    sync();
    paintModebar();
    if (active) buildScene().then(() => { if (engine && firstFrame) { engine.setLight(st.light); engine.setSeat(spec()); applyView(); applyCompare(); paintSpacing(); if (st.tool === 'measure') renderMeasure(); updateAria(); } });
  }

  function readParams(p = {}) {
    if (st.tool) setTool(null);
    meas.a = null; meas.b = null; meas.next = 'b';
    if (p.venue && venueById(p.venue)) st.venue = p.venue;
    if (p.mode) st.mode = p.mode;
    else if (p.event && MODE_FOR_EVENT[p.event] && modes().some((m) => m.id === MODE_FOR_EVENT[p.event])) st.mode = MODE_FOR_EVENT[p.event];
    if (p.day) st.day = p.day;
    if (!days().length) st.day = null;
    else if (!days().some((d) => d.id === st.day)) st.day = defaultDay(st.venue);
    if (!modes().some((m) => m.id === st.mode)) st.mode = modes()[0]?.id || null;
    st.area = p.area || st.area;
    // An area that only exists on the other raceday switches the day rather than vanishing.
    if (st.area && days().length && !areasFor(st.venue, opts()).some((a) => a.id === resolveAreaId(st.venue, st.area, opts()))) {
      const alt = days().find((d) => areasFor(st.venue, { mode: st.mode, day: d.id }).some((a) => a.id === st.area));
      if (alt) st.day = alt.id;
    }
    st.place = p.place || null; st.block = p.block || null;
    st.row = p.row != null ? String(p.row) : 'middle'; st.pos = p.pos != null ? String(p.pos) : 'centre';
    st.light = ['day', 'golden', 'night'].includes(p.light) ? p.light : null;
    const v = p.view === 'dollhouse' ? 'overview' : p.view;
    if (['seat', 'move', 'overview', 'plan', 'real'].includes(v)) st.view = v;
    st.src = p.src === 'model' ? 'model' : 'photo';
    st.compare = null;
    const aa = resolveAreaId(st.venue, st.area, opts()); const ca = resolveAreaId(st.venue, p.compare, opts());
    const find = (id) => areasFor(st.venue, opts()).find((a) => a.id === id);
    if (find(aa) && find(ca) && aa !== ca) {
      // Older links put the standard area in `area` and the hospitality area in `compare`.
      if (find(aa).kind === 'standard' && find(ca).kind === 'hospitality') { st.area = ca; st.compare = aa; } else { st.area = aa; st.compare = ca; }
    }
    if (CROWD.some((c) => c.value === p.crowd)) st.crowd = p.crowd;
    defaults(!!st.light);
    // Exact seat or box from a shared link.
    st.seatK = null; st.box = null;
    const M = curMap();
    if (M && p.seat != null && p.block != null) {
      const r = findSeat(M, p.block, p.row, p.seat);
      if (r.k >= 0) {
        const ai = M.seats.area[r.k]; const pl = M.seats.place[r.k] >= 0 ? M.places[M.seats.place[r.k]] : null;
        if (ai >= 0 && !(st.compare && M.areas[ai].id === st.compare)) { st.area = M.areas[ai].id; st.place = pl && pl.area === st.area ? pl.place : null; defaults(true); }
        st.seatK = r.k; st.seatKey = mapKey();
      }
    } else if (M && p.box != null) {
      const j = M.boxes.findIndex((b) => b.area === st.area && String(b.number) === String(p.box) && (!st.place || b.place === st.place));
      if (j >= 0) { st.box = j; st.place = M.boxes[j].place; st.pos = boxSpot(M, M.boxes[j]).pos; }
    }
  }

  const offMotion = ctx.bus.on('motion-change', () => { engine?.invalidate(); $('.rv__wave').toggleAttribute('aria-disabled', arch() !== 'racecourse' && reducedMotion()); });

  const api = {
    activate(p) { active = true; readParams(p || {}); render(); },
    deactivate() {
      active = false;
      if (st.tool === 'photo') setTool(null);
      engine?.setActive(false); pano?.setActive(false); splat?.setActive(false); real?.setActive(false);
      if (!tourEl.hidden) { tourEl.hidden = true; tourEl.innerHTML = ''; capShown = ''; }
      if (document.fullscreenElement === stage) document.exitFullscreen?.();
    },
    destroy() {
      active = false;
      offMotion?.();
      vpObserver.disconnect();
      document.removeEventListener('fullscreenchange', onFs);
      engine?.dispose(); engine = null;
      pano?.dispose(); pano = null;
      splat?.dispose(); splat = null;
      real?.dispose(); real = null;
    },
  };
  // Dev pages only (?viewerdev): a handle for automated checks. Never used by the app.
  if (devMode()) window.__rv = { st, get engine() { return engine; }, go(p) { readParams(p); render(); }, setTool, setViewMode, selectArea, paintHotspots, measureTap, get hot() { return hotTargets; }, get meas() { return meas; }, photoEntry, pickSeat, pickBox, openBlock, toggleSpacing, setPane, planTap, get map() { return curMap(); }, get mapView() { return mapView; }, exactK, spec, params, seatWords, get dims() { return dimLines; } };
  return api;
}

export default { mount };
