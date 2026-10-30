// Seat Reality Viewer (tool id reality-viewer). Owned by the viewer agents.
//
// This module builds the DOM around the 3D stage and lazy-imports js/viewer/engine.js
// (three.js) only the first time the tool is shown. Until the first frame is ready a
// poster (assets/poster-<archetype>.jpg, gradient fallback) and a loading state show.
// With no WebGL, the poster stays and a plain-words description of the view replaces it.
//
// State <-> hash params: venue, area, mode, row, pos, light, view, compare (+ crowd when
// not the default). compare = the hospitality area you came from when comparing with a
// standard ticket.
//
// Extending (part 2): archetypes without a layout in js/viewer/layouts.js show a designed
// "model in preparation" state; adding a layout and an archetype builder is enough to
// light them up here. Row labels per area live in ROW_LABELS below.
//
// Real imagery, layered on top of the 3D model (which always stays as the fallback):
// - view=real: "Real venue", Google's photorealistic 3D map (js/viewer/real-venue.js),
//   loaded only when first opened and only when js/config.js has a key. Without a key, or
//   when Google refuses or fails, a calm card shows instead.
// - Real 360 photos (js/viewer/panorama.js): when js/data/panoramas.js has an entry for the
//   venue and area, the seat view opens on the photo, with a toggle back to the model
//   (src=model in the hash) and a "Photo: <credit>, <date>" credit line.

import { segmented, meterRow, actionBar, el, icon } from '../ui.js';
import { html, raw, reducedMotion } from '../core.js';
import { VENUES, MODES, AREAS, venueById, areaName, SCORE_LABELS } from '../data/venues.js';
import { seatSpec, plan, hasLayout, describeSeat, ROW_KEYS, POS_KEYS } from '../viewer/layouts.js';
import { panoramaFor } from '../data/panoramas.js';
import { GOOGLE_MAPS_KEY } from '../config.js';

const ARCH_LABEL = { stadium: 'Stadium', arena: 'Arena', hall: 'Concert hall', racecourse: 'Racecourse' };
const DEFAULT_AREA = { stadium: 'premium-lounge', arena: 'premium-lower', hall: 'stalls', racecourse: 'private-box' };
const EVENT_FOR = { 'stadium:football': 'football', 'stadium:concert': 'stadium-concert', 'arena:concert': 'arena-concert', 'arena:boxing': 'boxing', 'hall:orchestra': 'orchestra', 'racecourse:racing': 'horse-racing' };
const FOCAL_WORDS = { football: 'the centre spot', concert: 'the stage', boxing: 'the ring', orchestra: 'the stage', racing: 'the finish' };
const LIGHTS = {
  outdoor: [{ value: 'day', label: 'Day', icon: 'sun' }, { value: 'golden', label: 'Golden hour', icon: 'sunset' }, { value: 'night', label: 'Night', icon: 'moon' }],
  indoor: [{ value: 'day', label: 'House lights', icon: 'sun' }, { value: 'golden', label: 'Warm wash', icon: 'sunset' }, { value: 'night', label: 'Show lighting', icon: 'moon' }],
};
const LIGHT_WORDS = { outdoor: { day: 'in daylight', golden: 'at golden hour', night: 'at night under floodlights' }, indoor: { day: 'with the house lights up', golden: 'under a warm wash', night: 'under show lighting' } };
const CROWD = [{ value: 'light', label: 'Quiet', d: 0.45 }, { value: 'busy', label: 'Busy', d: 0.75 }, { value: 'full', label: 'Full', d: 0.93 }];
const ROW_LABELS = {
  'stadium:private-box': { front: 'Balcony seat', middle: 'At the table', back: 'Back of the box' },
  'arena:private-suite': { front: 'Front seat', middle: 'Second row', back: 'Inside the suite' },
  'arena:floor:concert': { front: 'Near the stage', middle: 'Mid floor', back: 'Back of the floor' },
  'arena:floor:boxing': { front: 'Front row', middle: 'Second row', back: 'Third row' },
  'hall:private-box': { front: 'At the parapet', middle: 'Second row', back: 'Back of the box' },
  'hall:stalls': { front: 'Front stalls', middle: 'Mid stalls', back: 'Rear stalls' },
  'hall:gallery': { front: 'At the rail', middle: 'Second row', back: 'Back wall' },
  'racecourse:private-box': { front: 'On the balcony', middle: 'At the table', back: 'Back of the box' },
  'racecourse:restaurant': { front: 'Window table', middle: 'Second row', back: 'Back of the room' },
  'racecourse:lawn': { front: 'At the rail', middle: 'On the lawn', back: 'By the stand' },
};
const POS_LABEL = { left: 'Left', centre: 'Centre', right: 'Right' };
const isOutdoor = (arch) => arch === 'stadium' || arch === 'racecourse';

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

export function mount(root, ctx) {
  /* ---------- State ---------- */
  const st = {
    venue: VENUES[0].id, area: null, mode: null, row: 'middle', pos: 'centre', light: null, view: 'seat',
    compare: null, crowd: 'full', src: 'photo',
  };
  let engine = null; let enginePromise = null; let active = false; let built = ''; let firstFrame = false;
  let pano = null; let panoPromise = null; let panoSrc = ''; let panoShown = false;
  let real = null; let realPromise = null; let realVenue = '';
  let headingTimer = 0; let lastHeading = null; let split = 0.5;
  const venue = () => venueById(st.venue) || VENUES[0];
  const arch = () => venue().archetype;
  const areas = () => AREAS[arch()] || [];
  const area = () => areas().find((a) => a.id === st.area) || areas()[0];
  const modes = () => MODES[arch()] || [];
  const modeLabel = () => modes().find((m) => m.id === st.mode)?.label || '';
  const lightSet = () => (isOutdoor(arch()) ? LIGHTS.outdoor : LIGHTS.indoor);
  const lightLabel = () => lightSet().find((l) => l.value === st.light)?.label || '';
  const rowLabels = () => ({ front: 'Front row', middle: 'Middle', back: 'Back row', ...(ROW_LABELS[`${arch()}:${st.area}:${st.mode}`] || ROW_LABELS[`${arch()}:${st.area}`] || {}) });
  const standardArea = () => areas().find((a) => a.kind === 'standard');

  function defaults(keepLight = false) {
    if (!modes().some((m) => m.id === st.mode)) st.mode = modes()[0]?.id || null;
    if (!areas().some((a) => a.id === st.area)) st.area = DEFAULT_AREA[arch()] || areas()[0]?.id;
    if (!keepLight || !st.light) st.light = isOutdoor(arch()) && st.mode !== 'concert' ? 'day' : 'night';
    if (!ROW_KEYS.includes(st.row)) st.row = 'middle';
    if (!POS_KEYS.includes(st.pos)) st.pos = 'centre';
  }

  /* ---------- DOM ---------- */
  root.innerHTML = '';
  const tool = el(html`<div class="rv">
    <header class="tool__head rv__head">
      <p class="eyebrow">${raw(icon('eye'))} Seat Reality Viewer</p>
      <h2>See the view from your seat</h2>
      <p>Pick a venue, an event and a seating area, then look around as if you were sitting there. Compare hospitality with a standard ticket in one tap.</p>
    </header>
    <div class="rv__pickers">
      <div class="field rv__venue">
        <label class="field__label" for="rv-venue">Venue</label>
        <div class="rv__venue-wrap"><span class="rv__venue-icon" aria-hidden="true"></span><select class="select" id="rv-venue"></select></div>
      </div>
      <div class="field rv__mode"><span class="field__label" id="rv-mode-l">Event</span><div class="rv__mode-slot"></div></div>
    </div>
    <div class="rv__areas" role="group" aria-label="Seating area"></div>
    <div class="rv__layout">
      <div class="rv__main">
        <div class="rv__stage on-ink" data-state="idle">
          <div class="rv__viewport">
            <div class="rv__poster" aria-hidden="true"><img alt="" width="1280" height="720" decoding="async" hidden></div>
            <div class="rv__canvas-host"></div>
            <div class="rv__pano-host"></div>
            <div class="rv__real" hidden data-state="idle">
              <div class="rv__real-map"></div>
              <div class="rv__real-loading" role="status" aria-live="polite"><span class="rv__spinner" aria-hidden="true"></span><span>Loading the live map</span></div>
              <div class="rv__real-empty"></div>
            </div>
            <div class="rv__markers" hidden></div>
            <div class="rv__fade" aria-hidden="true"></div>
            <div class="rv__loading" role="status" aria-live="polite"><span class="rv__spinner" aria-hidden="true"></span><span class="rv__loading-text">Preparing your view</span></div>
            <div class="rv__fallback" hidden></div>
            <div class="rv__toolbar rv__toolbar--top">
              <div class="rv__view-slot"></div>
            </div>
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
            <p class="rv__caption">${raw(icon('info'))}<span class="rv__cap-body"><span class="rv__cap-text">Illustrative model, not an exact venue rendering.</span><span class="rv__hint"> Drag to look around.</span><span class="rv__soon" hidden>Real 360 photo from this area coming soon.</span></span></p>
            <div class="rv__dev" hidden></div>
          </div>
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
            <button type="button" class="btn btn--ghost-ink btn--sm rv__wave" data-act="wave">${raw(icon('wave'))}<span>Start a wave</span></button>
            <button type="button" class="btn btn--ghost-ink btn--sm btn--icon rv__fs" data-act="fullscreen" aria-label="Full screen">${raw(icon('maximize'))}</button>
          </div>
        </div>
        <section class="card rv__diff" hidden aria-live="polite" aria-label="Score differences"></section>
        <div class="rv__below">
          <div class="rv__seatbar">
            <div class="field"><span class="field__label">Row</span><div class="rv__row-slot"></div></div>
            <div class="field"><span class="field__label">Position</span><div class="rv__pos-slot"></div></div>
            <button type="button" class="btn btn--ghost btn--sm rv__compare" data-act="compare">${raw(icon('compare'))}<span>Compare with a standard ticket</span></button>
          </div>
          <div class="rv__map-card on-ink">
            <p class="rv__label">Where you are</p>
            <div class="rv__map"></div>
          </div>
        </div>
      </div>
      <aside class="rv__info" aria-label="About this seating area"></aside>
    </div>
  </div>`);
  root.append(tool);

  const $ = (s) => tool.querySelector(s);
  const stage = $('.rv__stage'); const host = $('.rv__canvas-host'); const poster = $('.rv__poster');
  const posterImg = poster.querySelector('img');
  const loading = $('.rv__loading'); const loadingText = $('.rv__loading-text');
  const fallback = $('.rv__fallback'); const markersEl = $('.rv__markers'); const fade = $('.rv__fade');
  const info = $('.rv__info'); const areasEl = $('.rv__areas'); const devEl = $('.rv__dev');
  const zoomLevelEl = $('.rv__zoom-level');
  const splitEl = $('.rv__split'); const divider = $('.rv__divider'); const diffEl = $('.rv__diff');
  const viewport = $('.rv__viewport');
  const sel = $('#rv-venue');
  const panoHost = $('.rv__pano-host'); const realEl = $('.rv__real'); const realMap = $('.rv__real-map');
  const realEmpty = $('.rv__real-empty'); const realTools = $('.rv__real-tools'); const orbitBtn = $('.rv__orbit');
  const srcSlot = $('.rv__src-slot'); const capText = $('.rv__cap-text'); const soonEl = $('.rv__soon');

  // Venue select, grouped by archetype.
  const groups = {};
  VENUES.forEach((v) => { (groups[v.archetype] ||= []).push(v); });
  sel.innerHTML = Object.entries(groups).map(([a, list]) => html`<optgroup label="${ARCH_LABEL[a] || a}">${raw(list.map((v) => html`<option value="${v.id}">${v.name.includes(v.city) ? v.name : `${v.name}, ${v.city}`}</option>`).join(''))}</optgroup>`).join('');
  sel.addEventListener('change', () => { st.venue = sel.value; const prevArch = built.split(':')[0]; defaults(prevArch === arch()); closeCompare(); render(); });

  let modeCtl = null; let viewCtl = null; let lightCtl = null; let crowdCtl = null; let rowCtl = null; let posCtl = null;

  viewCtl = segmented({
    label: 'Camera', ink: true, value: st.view,
    options: [{ value: 'seat', label: 'Seat view', icon: 'eye' }, { value: 'overview', label: 'Overview', icon: 'map' }, { value: 'real', label: 'Real venue', icon: 'pin' }],
    onChange: (v) => { if (v !== 'seat' && comparing()) closeCompare(); st.view = v; applyView(); sync(); },
  });
  $('.rv__view-slot').append(viewCtl.el);

  // 360 photo or 3D model, shown only when the area has a real photo.
  const srcCtl = segmented({
    label: 'Show', ink: true, value: st.src,
    options: [{ value: 'photo', label: '360 photo', icon: 'camera' }, { value: 'model', label: '3D model', icon: 'layers' }],
    onChange: (v) => { st.src = v; paintPhoto(); sync(); },
  });
  srcSlot.append(srcCtl.el);

  crowdCtl = segmented({ label: 'Crowd', ink: true, value: st.crowd, options: CROWD.map((c) => ({ value: c.value, label: c.label })), onChange: (v) => { st.crowd = v; engine?.setDensity(CROWD.find((c) => c.value === v).d); sync(); } });
  crowdCtl.el.classList.add('rv__crowd');
  $('.rv__crowd-slot').append(crowdCtl.el);

  function buildModeCtl() {
    const slot = $('.rv__mode-slot'); slot.innerHTML = '';
    modeCtl = segmented({ label: 'Event', value: st.mode, options: modes().map((m) => ({ value: m.id, label: m.label })), onChange: (v) => { st.mode = v; st.light = isOutdoor(arch()) && v !== 'concert' ? 'day' : 'night'; render(); } });
    modeCtl.el.setAttribute('aria-labelledby', 'rv-mode-l');
    slot.append(modeCtl.el);
  }
  function buildLightCtl() {
    const slot = $('.rv__light-slot'); slot.innerHTML = '';
    lightCtl = segmented({ label: 'Lighting', ink: true, value: st.light, options: lightSet(), onChange: (v) => { st.light = v; engine?.setLight(v); updateAria(); sync(); } });
    lightCtl.el.classList.add('rv__light');
    slot.append(lightCtl.el);
  }
  function buildRowPos() {
    const rl = rowLabels();
    const r = $('.rv__row-slot'); r.innerHTML = '';
    rowCtl = segmented({ label: 'Row', value: st.row, options: ROW_KEYS.map((k) => ({ value: k, label: rl[k] })), onChange: (v) => { st.row = v; moveSeat(); } });
    r.append(rowCtl.el);
    const p = $('.rv__pos-slot'); p.innerHTML = '';
    posCtl = segmented({ label: 'Position', value: st.pos, options: POS_KEYS.map((k) => ({ value: k, label: POS_LABEL[k] })), onChange: (v) => { st.pos = v; moveSeat(); } });
    p.append(posCtl.el);
  }

  function buildAreas() {
    areasEl.innerHTML = '';
    areas().forEach((a) => {
      const b = el(html`<button type="button" class="option-card rv__area" data-area="${a.id}" aria-pressed="false">
        <span class="badge ${a.kind === 'hospitality' ? 'badge--gold' : ''} rv__kind">${a.kind === 'hospitality' ? 'Hospitality' : 'Standard ticket'}</span>
        <span class="option-card__label">${areaName(a, st.mode)}</span>
        <span class="option-card__desc">${a.position.elevation}, ${a.position.angle.toLowerCase()}</span>
      </button>`);
      b.addEventListener('click', () => selectArea(a.id, { fromUser: true }));
      areasEl.append(b);
    });
    paintAreas();
  }
  function paintAreas() { areasEl.querySelectorAll('.rv__area').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.area === st.area))); }

  /* ---------- Info panel ---------- */
  function renderInfo() {
    const a = area(); if (!a) { info.innerHTML = ''; return; }
    const v = venue();
    const name = areaName(a, st.mode);
    const std = a.kind === 'standard';
    info.innerHTML = html`
      <div class="card rv__card">
        <div class="rv__card-head">
          <span class="badge ${std ? '' : 'badge--gold'}">${std ? 'Standard ticket' : 'Hospitality'}</span>
          <h3>${name}</h3>
          <p class="muted">${v.name}, ${modeLabel().toLowerCase()}</p>
        </div>
        <p>${a.blurb}</p>
        <div class="rv__chips" aria-label="Position">
          <span class="chip rv__pchip">${raw(icon('layers'))}<span>Height: ${a.position.elevation}</span></span>
          <span class="chip rv__pchip">${raw(icon('compare'))}<span>Angle: ${a.position.angle}</span></span>
          <span class="chip rv__pchip">${raw(icon('target'))}<span>Distance: ${a.position.distance}</span></span>
        </div>
        <div class="rv__scores">
          <p class="rv__label">Scores <span class="badge">Indicative</span></p>
          ${raw(Object.entries(a.scores).map(([k, val]) => meterRow(SCORE_LABELS[k], val)).join(''))}
          <p class="fine-print">Indicative opinions for comparing areas, not ratings.</p>
        </div>
        <div>
          <p class="rv__label">Typically included</p>
          <ul class="tick-list">${raw(a.inclusions.map((i) => html`<li>${raw(icon('check'))}<span>${i}</span></li>`).join(''))}</ul>
        </div>
        <div class="callout">${raw(icon('info'))}<span><strong>Worth knowing:</strong> ${a.tradeoff}</span></div>
        <div>
          <p class="rv__label">Often chosen for</p>
          <div class="rv__best">${raw(a.bestFor.map((b) => html`<span class="badge">${b}</span>`).join(''))}</div>
        </div>
        <div class="rv__handoff"></div>
        <div class="rv__actions"></div>
      </div>`;
    const hand = info.querySelector('.rv__handoff');
    const hb = el(html`<button type="button" class="btn btn--ink btn--block">${raw(icon('scale'))}<span>${std ? 'Is hospitality worth it?' : 'Is this worth the upgrade?'}</span>${raw(icon('arrow-right'))}</button>`);
    hb.addEventListener('click', () => {
      const inc = (std ? areas().find((x) => x.kind === 'hospitality') : a).inclusions.map((i) => i.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
      ctx.navigate('vip-worth', { event: EVENT_FOR[`${arch()}:${st.mode}`], inc });
    });
    hand.append(hb);
    const bar = actionBar({
      onBrief: () => {
        // Never a picture of the live Google map (their terms forbid copying it).
        const thumb = st.view === 'real' ? null : photoOn() ? pano.snapshot(360) : engine && firstFrame && hasLayout(arch()) ? engine.snapshot(360) : null;
        ctx.brief.add({ tool: 'reality-viewer', title: `${name}, ${v.name}`, subtitle: `${modeLabel()}, ${rowLabels()[st.row].toLowerCase()}, ${POS_LABEL[st.pos].toLowerCase()}`, lines: summaryLines(), params: params(), ...(thumb ? { thumb } : {}) });
      },
      onShare: () => ctx.share.send({ title: `${name} at ${v.name}`, text: `The view from ${name.toLowerCase()} at ${v.name} (illustrative)`, url: ctx.shareUrl(params()) }),
      onEnquire: () => ctx.openEnquiry({ tool: 'reality-viewer', event: EVENT_FOR[`${arch()}:${st.mode}`], summary: `I am interested in ${name.toLowerCase()} at ${v.name} (${modeLabel().toLowerCase()}).`, lines: summaryLines() }),
      extra: hasLayout(arch()) ? [{ label: 'Save this view', icon: 'download', run: saveView }] : [],
    });
    info.querySelector('.rv__actions').append(bar.el);
  }

  function summaryLines() {
    const a = area();
    return [
      `Venue: ${venue().name}`, `Event: ${modeLabel()}`, `Area: ${areaName(a, st.mode)} (${a.kind === 'hospitality' ? 'hospitality' : 'standard ticket'})`,
      `Seat: ${rowLabels()[st.row]}, ${POS_LABEL[st.pos].toLowerCase()}`, `Typically included: ${a.inclusions.join(', ')}`,
      photoOn() ? `View shown is a real 360 photo from this area (photo: ${photoEntry().credit}, ${photoEntry().takenOn}).` : 'View shown is an illustrative model, not an exact venue rendering.',
    ];
  }

  // Saves the current view as a PNG with a small branded caption strip underneath.
  function saveView() {
    if (st.view === 'real') { ctx.toast('The live map cannot be saved as a picture. Switch to Seat view to save one.', { tone: 'info' }); return; }
    const photo = photoOn() ? photoEntry() : null;
    if (!photo && (!engine || !firstFrame)) return;
    const shot = photo ? pano.snapshotCanvas(1600) : engine.snapshotCanvas(1600);
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
      ? `${venue().name}: ${areaName(a, st.mode)} ${splitWords().a}, ${areaName(cmpArea, st.mode)} ${splitWords().b}`
      : `${venue().name}: ${areaName(a, st.mode)}, ${rowLabels()[st.row].toLowerCase()}`;
    g.fillStyle = '#FFFFFF'; g.font = `500 ${Math.round(strip * 0.22)}px Poppins, Arial, sans-serif`;
    g.fillText(where, pad, mid + strip * 0.2, W - pad * 2 - strip * (photo ? 7 : 3.2));
    g.textAlign = 'right'; g.fillStyle = 'rgba(232,214,179,0.85)'; g.font = `500 ${Math.round(strip * 0.22)}px Poppins, Arial, sans-serif`;
    g.fillText(photo ? `Photo: ${photo.credit}, ${photo.takenOn}` : 'Illustrative view', W - pad, mid);
    const done = (blob) => {
      if (!blob) { ctx.toast('Could not save the view on this device', { tone: 'warn' }); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `prestige-view-${st.venue}-${st.area}.png`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      ctx.toast('View saved as a PNG', { tone: 'ok' });
    };
    try { c.toBlob(done, 'image/png'); } catch { done(null); }
  }

  /* ---------- Mini-map ---------- */
  let mm = null;
  function renderMap() {
    const box = tool.querySelector('.rv__map'); if (!box) return;
    const P = plan(arch(), st.mode);
    if (!P) { box.innerHTML = '<p class="fine-print">A plan of this venue type is on its way.</p>'; mm = null; return; }
    const zones = Object.entries(P.zones).map(([id, d]) => {
      const a = areas().find((x) => x.id === id);
      return html`<path class="mm-zone${id === st.area ? ' is-on' : ''}" d="${d}" data-area="${id}" tabindex="0" role="button" aria-label="${areaName(a, st.mode)}"><title>${areaName(a, st.mode)}</title></path>`;
    }).join('');
    box.innerHTML = html`<svg class="rv__svg" viewBox="${P.viewBox}" role="group" aria-label="Plan of the venue. Choose an area.">
      <g aria-hidden="true">${raw(P.base)}</g>${raw(zones)}
      <g class="mm-other" aria-hidden="true" hidden><circle class="mm-dot-b" r="3.2"/></g>
      <g class="mm-you" aria-hidden="true"><path class="mm-cone" d="M0,0 L60,-20 A63,63 0 0 1 60,20 Z"/><circle class="mm-dot" r="3.4"/><circle class="mm-dot-ring" r="6"/></g>
    </svg>
    <p class="rv__map-key"><span class="rv__map-you"></span>You are here <span class="rv__map-other" hidden><span class="rv__map-b"></span>Standard ticket</span> <span class="muted">(plan not to scale)</span></p>`;
    mm = { svg: box.querySelector('svg'), you: box.querySelector('.mm-you'), cone: box.querySelector('.mm-cone'), other: box.querySelector('.mm-other'), otherKey: box.querySelector('.rv__map-other'), P };
    box.querySelectorAll('.mm-zone').forEach((z) => {
      const go = () => selectArea(z.dataset.area, { fromUser: true });
      z.addEventListener('click', go);
      z.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    paintYou();
  }

  function paintYou(h = lastHeading) {
    if (!mm) return;
    const spec = seatSpec(arch(), st.mode, st.area, st.row, st.pos);
    if (!spec) return;
    const x = h && st.view === 'seat' ? h.x : spec.position[0];
    const z = h && st.view === 'seat' ? h.z : spec.position[2];
    let ang = Math.atan2(spec.target[2] - spec.position[2], spec.target[0] - spec.position[0]);
    let half = 0.6;
    if (h && st.view === 'seat') { ang = h.angle; half = Math.min(1.2, h.hfov / 2); }
    const L = 62; const ex = Math.cos(half) * L; const ey = Math.sin(half) * L;
    mm.cone.setAttribute('d', `M0,0 L${ex.toFixed(1)},${(-ey).toFixed(1)} A${L},${L} 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)} Z`);
    const k = (mm.P.mark || 1).toFixed(3);
    mm.you.setAttribute('transform', `translate(${x.toFixed(1)} ${z.toFixed(1)}) rotate(${(ang * 180 / Math.PI).toFixed(1)}) scale(${k})`);
    mm.cone.style.opacity = st.view === 'overview' ? '0.25' : '';
    // The standard-ticket seat while the split screen is on.
    const b = comparing() ? seatSpec(arch(), st.mode, st.compare, 'middle', 'centre') : null;
    mm.other.toggleAttribute('hidden', !b); mm.otherKey.toggleAttribute('hidden', !b);
    if (b) mm.other.setAttribute('transform', `translate(${b.position[0].toFixed(1)} ${b.position[2].toFixed(1)}) scale(${k})`);
  }

  /* ---------- Engine ---------- */
  function setStageState(s, text) {
    stage.dataset.state = s;
    if (text) loadingText.textContent = text;
  }

  function showPoster() {
    // Resolved from this module, so it works from index.html and from dev pages alike.
    const src = new URL(`../../assets/poster-${arch()}.jpg`, import.meta.url).href;
    posterImg.hidden = true;
    poster.dataset.arch = arch();
    const img = new Image();
    img.onload = () => { posterImg.src = img.src; posterImg.hidden = false; };
    img.onerror = () => { /* gradient fallback stays */ };
    img.src = src;
  }

  function showFallback(reason) {
    const a = area(); const spec = seatSpec(arch(), st.mode, st.area, st.row, st.pos);
    fallback.hidden = false;
    fallback.innerHTML = html`<div class="rv__fallback-card">
      <p class="eyebrow">${reason === 'model' ? 'Model in preparation' : '3D view unavailable'}</p>
      <h3>${areaName(a, st.mode)} at ${venue().name}</h3>
      <p>${a.blurb}${spec ? ` From here you are ${describeSeat(spec)}.` : ''}</p>
      <p class="fine-print">${reason === 'model'
        ? `The 3D model for ${ARCH_LABEL[arch()].toLowerCase()}s is being prepared. The seat details on this page still apply.`
        : 'This device or browser cannot show 3D graphics, so here is the view in words instead.'}</p>
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
        lowPower: lowPowerDevice(),
        reducedMotion,
        onCamera: (h) => { lastHeading = h; paintYou(h); scheduleAria(); zoomLevelEl.textContent = `${Math.round(h.zoom * 10) / 10}x`; },
        onFlyEnd: () => { st.view = 'seat'; viewCtl.set('seat'); markersEl.hidden = true; stage.classList.remove('is-overview'); updateAria(); paintPhoto(); sync(); },
        onProject: (pts) => paintMarkers(pts),
        onFrame: devMode() ? (s) => { devEl.hidden = false; devEl.textContent = `frame ${s.cpuMs.toFixed(1)} ms cpu | ${Math.round(s.fps)} fps | ${s.calls} calls | ${(s.tris / 1e6).toFixed(2)}M tris | ${s.view}`; } : null,
        onLost: () => showFallback('webgl'),
      });
      e.canvas.addEventListener('pointerdown', () => stage.classList.add('is-used'), { once: true });
      e.canvas.addEventListener('keydown', scheduleAria);
      e.canvas.addEventListener('pointerup', scheduleAria);
      engine = e;
      return e;
    }).catch((err) => {
      console.warn('[viewer] 3D engine failed to start, showing the description instead', err);
      showFallback('webgl');
      return null;
    });
    return enginePromise;
  }

  // Builds (or rebuilds) the scene when venue archetype or mode changes, then places the seat.
  async function buildScene() {
    const variant = venue().racing || '';
    const key = `${arch()}:${st.mode}:${variant}`;
    if (!hasLayout(arch())) { engine?.setActive(false); showFallback('model'); built = key; return; }
    fallback.hidden = true;
    const e = await ensureEngine();
    if (!e) return;
    if (built !== key) {
      setStageState(firstFrame ? 'switching' : 'loading', firstFrame ? `Setting up ${ARCH_LABEL[arch()].toLowerCase()}` : 'Preparing your view');
      built = key;
      e.setActive(false);
      const ok = await e.load({ archetype: arch(), mode: st.mode, variant: variant || undefined });
      if (!ok || built !== key) return;
      e.setDensity(CROWD.find((c) => c.value === st.crowd).d);
      e.setLight(st.light);
      e.setMarkers(areas().map((a) => ({ id: a.id, position: lift(seatSpec(arch(), st.mode, a.id, 'middle', 'centre').position) })));
      buildMarkers();
      e.setSeat(seatSpec(arch(), st.mode, st.area, st.row, st.pos));
      if (st.view === 'overview') applyView(true);
      e.setActive(engineShouldRun());
      requestAnimationFrame(() => requestAnimationFrame(() => { firstFrame = true; setStageState('ready'); applyCompare(); updateAria(); }));
    } else {
      e.setActive(engineShouldRun());
    }
  }
  // The 3D loop rests while the live map or a 360 photo covers it.
  const engineShouldRun = () => active && st.view !== 'real' && !photoOn();
  const lift = ([x, y, z]) => [x, y + 2.2, z];

  function moveSeat({ fly = false } = {}) {
    sync();
    renderInfo();
    if (!engine || !hasLayout(arch()) || !firstFrame) { paintYou(); return; }
    const spec = seatSpec(arch(), st.mode, st.area, st.row, st.pos);
    if (fly && st.view === 'overview') {
      engine.setSeat(spec, { fly: true });
      markersEl.hidden = true;
      return;
    }
    if (!reducedMotion() && st.view === 'seat') {
      fade.classList.add('is-on');
      setTimeout(() => { engine.setSeat(spec); requestAnimationFrame(() => fade.classList.remove('is-on')); updateAria(); }, 160);
    } else {
      engine.setSeat(spec); updateAria();
    }
  }

  function selectArea(id, { fromUser = false } = {}) {
    if (!areas().some((a) => a.id === id)) return;
    // Picking a seat from the live map takes you to that seat.
    if (st.view === 'real') { st.view = 'seat'; viewCtl.set('seat'); applyView(); }
    const wasOverview = st.view === 'overview';
    // Choosing the compared area itself ends the split screen.
    if (st.compare && id === st.compare) { st.compare = null; engine?.setCompare(null); }
    void fromUser;
    st.area = id;
    paintAreas();
    buildRowPos();
    moveSeat({ fly: wasOverview });
    renderMap();
    if (wasOverview && (reducedMotion() || !engine)) { st.view = 'seat'; viewCtl.set('seat'); applyView(); }
    paintCompare();
    paintPhoto();
  }

  function applyView(force) {
    const isReal = st.view === 'real';
    stage.classList.toggle('is-real', isReal);
    if (isReal) {
      markersEl.hidden = true; stage.classList.remove('is-overview');
      engine?.setActive(false);
      enterReal();
      paintPhoto();
      return;
    }
    leaveReal();
    paintPhoto();
    if (!engine || !firstFrame && !force) return;
    engine.setView(st.view);
    engine.setActive(engineShouldRun());
    const ov = st.view === 'overview';
    markersEl.hidden = !ov;
    stage.classList.toggle('is-overview', ov);
    updateAria();
  }

  /* ---------- Real 360 photos ---------- */
  const photoEntry = () => panoramaFor(st.venue, st.area, st.mode);
  const wantPhoto = () => !!photoEntry() && st.src !== 'model' && st.view === 'seat' && !comparing();
  function photoOn() { return !!pano && panoShown && wantPhoto(); }

  async function ensurePano() {
    if (pano) return pano;
    if (!panoPromise) {
      panoPromise = import('../viewer/panorama.js').then(({ createPanorama }) => {
        pano = createPanorama(panoHost, {
          reducedMotion,
          onChange: ({ zoom }) => { if (photoOn()) zoomLevelEl.textContent = `${Math.round(zoom * 10) / 10}x`; },
        });
        pano.canvas.addEventListener('pointerdown', () => stage.classList.add('is-used'), { once: true });
        return pano;
      }).catch((err) => { console.warn('[viewer] 360 photo viewer failed to start, showing the 3D model', err); panoPromise = null; return null; });
    }
    return panoPromise;
  }

  function paintCaption() {
    const entry = photoEntry();
    const seat = st.view === 'seat';
    if (photoOn()) capText.textContent = `Photo: ${entry.credit}, ${entry.takenOn}. A real 360 photo from this area.`;
    else capText.textContent = 'Illustrative model, not an exact venue rendering.';
    soonEl.hidden = !(seat && !entry);
    srcSlot.hidden = !(seat && entry && !comparing());
    srcCtl.set(st.src);
    tool.classList.toggle('is-photo-on', photoOn());
    stage.classList.toggle('is-photo', photoOn());
  }

  // Shows the photo when the area has one and the visitor has not asked for the model.
  async function paintPhoto() {
    if (!wantPhoto()) {
      panoShown = false; pano?.setActive(false);
      paintCaption();
      if (engine && firstFrame) { engine.setActive(engineShouldRun()); zoomLevelEl.textContent = `${Math.round((engine.heading()?.zoom || 1) * 10) / 10}x`; }
      return;
    }
    const entry = photoEntry();
    paintCaption();
    if (!webglReady()) return; // the words-only fallback already covers the stage
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
    panoShown = true;
    p.setActive(active);
    engine?.setActive(false);
    zoomLevelEl.textContent = `${Math.round(p.zoom * 10) / 10}x`;
    paintCaption();
    p.canvas.setAttribute('aria-label', `Real 360 degree photo from ${areaName(area(), st.mode).toLowerCase()} at ${venue().name}. Photo: ${entry.credit}, taken on ${entry.takenOn}. Drag or use the arrow keys to look around.`);
  }

  /* ---------- Real venue: Google's photorealistic 3D map ---------- */
  function realCard(kind) {
    const v = venue();
    const nokey = kind === 'nokey';
    realEmpty.innerHTML = html`<div class="rv__fallback-card rv__real-card">
      <p class="eyebrow">${raw(icon('pin'))} Real venue</p>
      <h3>${nokey ? 'Live 3D map not set up yet' : 'The live map could not load'}</h3>
      <p>${nokey
        ? `This view will show ${v.name} from the air on a live, photorealistic 3D map. It switches on once the map service is connected.`
        : 'The map service did not respond just now. It may be your connection, or the service may be busy.'}</p>
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
  function leaveReal() {
    realEl.hidden = true; realTools.hidden = true;
    real?.setActive(false);
  }
  function retryReal() {
    real?.dispose(); real = null; realPromise = null; realVenue = '';
    enterReal();
  }

  /* ---------- Overview markers (HTML buttons over the canvas) ---------- */
  function buildMarkers() {
    markersEl.innerHTML = '';
    areas().forEach((a) => {
      const b = el(html`<button type="button" class="rv__marker${a.kind === 'standard' ? ' is-std' : ''}" data-area="${a.id}"><span class="rv__marker-dot" aria-hidden="true"></span><span class="rv__marker-label">${areaName(a, st.mode)}</span></button>`);
      b.addEventListener('click', () => selectArea(a.id, { fromUser: true }));
      markersEl.append(b);
    });
  }
  function paintMarkers(pts) {
    pts.forEach((p) => {
      const b = markersEl.querySelector(`[data-area="${p.id}"]`); if (!b) return;
      b.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      b.classList.toggle('is-off', !p.visible);
      b.classList.toggle('is-on', p.id === st.area);
    });
  }

  /* ---------- Compare: split screen, your seat against the standard ticket ---------- */
  // st.compare holds the second area's id (the standard ticket) while the split is on.
  // Both halves share one drag, so turning your head turns both views the same way.
  function comparing() { return !!st.compare && st.compare !== st.area && areas().some((a) => a.id === st.compare); }
  const isStacked = () => viewport.clientWidth < viewport.clientHeight;
  function splitWords() { return isStacked() ? { a: '(top)', b: '(bottom)' } : { a: '(left)', b: '(right)' }; }

  function paintSplit() {
    const on = comparing() && firstFrame && hasLayout(arch());
    splitEl.hidden = !on; stage.classList.toggle('is-split', on);
    if (!on) return;
    const stacked = isStacked();
    stage.classList.toggle('is-stacked', stacked);
    viewport.style.setProperty('--split', split.toFixed(3));
    const a = area(); const b = areas().find((x) => x.id === st.compare);
    splitEl.querySelector('.rv__split-label--a .badge').textContent = a.kind === 'standard' ? 'Standard ticket' : 'Your choice';
    splitEl.querySelector('.rv__split-label--a .rv__split-name').textContent = areaName(a, st.mode);
    splitEl.querySelector('.rv__split-label--b .rv__split-name').textContent = areaName(b, st.mode);
    splitEl.querySelector('.rv__split-label--b .badge').textContent = b.kind === 'standard' ? 'Standard ticket' : 'Hospitality';
    divider.setAttribute('aria-orientation', stacked ? 'horizontal' : 'vertical');
    divider.setAttribute('aria-valuenow', String(Math.round(split * 100)));
    divider.setAttribute('aria-valuetext', `${Math.round(split * 100)} per cent of the view shows ${areaName(a, st.mode).toLowerCase()}`);
  }

  function renderDiff() {
    const on = comparing();
    diffEl.hidden = !on;
    if (!on) { diffEl.innerHTML = ''; return; }
    const a = area(); const b = areas().find((x) => x.id === st.compare);
    const rows = Object.keys(SCORE_LABELS).map((k) => {
      const va = a.scores[k]; const vb = b.scores[k]; const d = va - vb;
      return html`<li class="rv__diff-row">
        <span class="rv__diff-label">${SCORE_LABELS[k]}</span>
        <span class="rv__diff-bars" aria-hidden="true"><span class="rv__diff-bar rv__diff-bar--a" style="--v:${va / 10}"></span><span class="rv__diff-bar rv__diff-bar--b" style="--v:${vb / 10}"></span></span>
        <span class="rv__diff-nums">${va} <span class="muted">vs</span> ${vb}</span>
        <span class="rv__diff-delta${d > 0 ? ' is-up' : d < 0 ? ' is-down' : ''}">${d === 0 ? 'Same' : d > 0 ? `+${d}` : `−${Math.abs(d)}`}</span>
      </li>`;
    }).join('');
    const w = splitWords();
    diffEl.innerHTML = html`<div class="rv__diff-head">
        <h3>${areaName(a, st.mode)} <span class="muted">against</span> ${areaName(b, st.mode)}</h3>
        <span class="badge">Indicative</span>
      </div>
      <p class="rv__diff-key"><span class="rv__diff-sw rv__diff-sw--a"></span>${areaName(a, st.mode)} ${w.a} <span class="rv__diff-sw rv__diff-sw--b"></span>${areaName(b, st.mode)} ${w.b}</p>
      <ul class="rv__diff-list">${raw(rows)}</ul>
      <p class="fine-print">Scores out of 10 are indicative opinions for comparing areas, not ratings. Both views are illustrative models.</p>`;
  }

  function paintCompare() {
    const btn = $('.rv__compare'); const std = standardArea();
    if (!std) { btn.hidden = true; return; }
    btn.hidden = false;
    const on = comparing();
    btn.querySelector('span').textContent = on ? 'Close the comparison' : st.area === std.id ? 'Compare with hospitality' : 'Compare with a standard ticket';
    btn.setAttribute('aria-pressed', String(on));
    paintSplit(); renderDiff();
    paintPhoto(); // the split screen always compares two 3D views
  }

  function applyCompare() {
    if (engine && firstFrame) {
      if (comparing()) engine.setCompare(seatSpec(arch(), st.mode, st.compare, 'middle', 'centre'), { split, stacked: isStacked() });
      else engine.setCompare(null);
    }
    paintCompare(); paintYou();
  }
  function closeCompare() { st.compare = null; engine?.setCompare(null); paintCompare(); paintYou(); }
  function toggleCompare() {
    const std = standardArea(); if (!std) return;
    if (comparing()) { closeCompare(); sync(); updateAria(); return; }
    if (st.view !== 'seat') { st.view = 'seat'; viewCtl.set('seat'); applyView(); }
    st.compare = std.id;
    if (st.area === std.id) {
      const h = areas().find((a) => a.id === DEFAULT_AREA[arch()]) || areas().find((a) => a.kind === 'hospitality');
      selectArea(h.id);
    }
    applyCompare(); sync(); updateAria();
  }
  function setSplit(v) {
    split = Math.min(0.85, Math.max(0.15, v));
    if (engine && comparing()) engine.setCompare(seatSpec(arch(), st.mode, st.compare, 'middle', 'centre'), { split, stacked: isStacked() });
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
    const look = photoOn() ? pano : engine;
    if (act === 'zoom-in') look?.zoomBy(1.4);
    if (act === 'zoom-out') look?.zoomBy(1 / 1.4);
    if (act === 'reset') {
      if (st.view !== 'seat') { st.view = 'seat'; viewCtl.set('seat'); applyView(); sync(); }
      if (photoOn()) pano.reset(); else engine?.resetLook();
    }
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
    const h = engine ? engine.heading() : lastHeading; const spec = seatSpec(arch(), st.mode, st.area, st.row, st.pos);
    if (!h || !spec || st.view !== 'seat') return '';
    const base = Math.atan2(spec.target[2] - spec.position[2], spec.target[0] - spec.position[0]);
    let d = h.angle - base; d = Math.atan2(Math.sin(d), Math.cos(d));
    const side = Math.abs(d) < 0.25 ? `towards ${FOCAL_WORDS[st.mode] || 'the action'}` : `${Math.abs(d) < 0.8 ? 'a little' : 'well'} to the ${d > 0 ? 'right' : 'left'} of ${FOCAL_WORDS[st.mode] || 'the action'}`;
    const vert = h.pitch > 0.15 ? ', looking up' : h.pitch < -0.45 ? ', looking down' : '';
    return `You are looking ${side}${vert}${h.zoom > 1.2 ? `, zoomed in ${h.zoom.toFixed(1)} times` : ''}.`;
  }
  function updateAria() {
    const canvas = engine?.canvas; if (!canvas) return;
    const a = area(); const spec = seatSpec(arch(), st.mode, st.area, st.row, st.pos);
    const lw = LIGHT_WORDS[isOutdoor(arch()) ? 'outdoor' : 'indoor'][st.light] || '';
    const b = comparing() ? areas().find((x) => x.id === st.compare) : null;
    const w0 = splitWords(); const cap = (s) => s.replace(/[()]/g, '').replace(/^./, (c) => c.toUpperCase());
    const w = { a: `(${cap(w0.a)})`, b: `(${cap(w0.b)})` };
    const label = st.view === 'overview'
      ? `Illustrative 3D overview of ${/^[aeiou]/i.test(ARCH_LABEL[arch()]) ? 'an' : 'a'} ${ARCH_LABEL[arch()].toLowerCase()} set up for ${({ concert: 'a concert', orchestra: 'an orchestral concert', racing: 'a race day' })[st.mode] || modeLabel().toLowerCase()}, ${lw}, with markers for each seating area.`
      : `${b ? `Split screen comparing two seats. ${w.a.replace(/[()]/g, '')}: ` : ''}Illustrative 3D view from ${areaName(a, st.mode).toLowerCase()}, ${rowLabels()[st.row].toLowerCase()}, ${POS_LABEL[st.pos].toLowerCase()}, at ${venue().name} for ${({ concert: 'a concert', orchestra: 'an orchestral concert', racing: 'a race day' })[st.mode] || modeLabel().toLowerCase()} ${lw}. ${spec ? `You are ${describeSeat(spec)}.` : ''} ${b ? `${w.b.replace(/[()]/g, '')}: the same direction from ${areaName(b, st.mode).toLowerCase()}. ` : ''}${directionWords()}`;
    canvas.setAttribute('aria-label', label.replace(/\s+/g, ' ').trim());
  }
  function scheduleAria() { clearTimeout(headingTimer); headingTimer = setTimeout(updateAria, 400); }

  /* ---------- Params ---------- */
  function params() {
    return {
      venue: st.venue, area: st.area, mode: st.mode, row: st.row, pos: st.pos, light: st.light, view: st.view,
      compare: st.compare || undefined, crowd: st.crowd !== 'full' ? st.crowd : undefined,
      src: st.src === 'model' && photoEntry() ? 'model' : undefined,
    };
  }
  function sync() { if (active) ctx.setParams(params()); }

  /* ---------- Render ---------- */
  function render() {
    defaults(true);
    sel.value = st.venue;
    $('.rv__venue-icon').innerHTML = icon(venue().icon || 'stadium');
    buildModeCtl(); buildLightCtl(); buildAreas(); buildRowPos();
    viewCtl.set(st.view); crowdCtl.set(st.crowd);
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
    renderMap();
    sync();
    if (active) buildScene().then(() => { if (engine && firstFrame) { engine.setLight(st.light); engine.setSeat(seatSpec(arch(), st.mode, st.area, st.row, st.pos)); applyView(); applyCompare(); updateAria(); } });
  }

  function readParams(p = {}) {
    if (p.venue && venueById(p.venue)) st.venue = p.venue;
    if (p.mode) st.mode = p.mode;
    if (p.area) st.area = p.area;
    if (p.row) st.row = p.row;
    if (p.pos) st.pos = p.pos;
    st.light = ['day', 'golden', 'night'].includes(p.light) ? p.light : null;
    if (p.view === 'overview' || p.view === 'seat' || p.view === 'real') st.view = p.view;
    st.src = p.src === 'model' ? 'model' : 'photo';
    // compare = the second area of the split screen. Older links put the standard area in
    // `area` and the hospitality area in `compare`; those are swapped round here.
    st.compare = null;
    const list = AREAS[venue().archetype] || [];
    const ca = list.find((a) => a.id === p.compare); const aa = list.find((a) => a.id === st.area);
    if (ca && aa && ca.id !== aa.id) {
      if (aa.kind === 'standard' && ca.kind === 'hospitality') { st.area = ca.id; st.compare = aa.id; } else st.compare = ca.id;
    }
    if (CROWD.some((c) => c.value === p.crowd)) st.crowd = p.crowd;
    defaults(!!st.light);
  }

  // Reduced-motion changes mid-session: the engine checks the preference every frame;
  // refresh the hint and re-render once.
  const offMotion = ctx.bus.on('motion-change', () => { engine?.invalidate(); $('.rv__wave').toggleAttribute('aria-disabled', arch() !== 'racecourse' && reducedMotion()); });

  return {
    activate(p) {
      active = true;
      readParams(p || {});
      render();
    },
    deactivate() {
      active = false;
      engine?.setActive(false); pano?.setActive(false); real?.setActive(false);
      if (document.fullscreenElement === stage) document.exitFullscreen?.();
    },
    destroy() {
      active = false;
      offMotion?.();
      vpObserver.disconnect();
      document.removeEventListener('fullscreenchange', onFs);
      engine?.dispose(); engine = null;
      pano?.dispose(); pano = null;
      real?.dispose(); real = null;
    },
  };
}

export default { mount };
