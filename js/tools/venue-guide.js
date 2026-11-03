// Venue Guide: everything verified about each of the seven venues, in one place.
// Built 02/11/2026 by the links and guide agent.
//
// Where the facts come from (so the guide, the seat map and the 3D viewer always agree):
// - Products, areas, inclusions and the venue's own view words: js/data/venues.js.
// - Block and row numbering, access places, steps and armrests: js/data/seatmaps.js.
// - Seat and row figures per level: computed from js/viewer/seatplan.js (seatMap and
//   seatFacts), the same functions the seat panel in the viewer uses.
// - Everything else (location, what is staged, shape, levels, access notes): the research
//   copied into js/data/venue-guide.js.
// - Links: js/data/prestige-links.js (verified pages only, UTM tagged, dated pages hide
//   once their date has passed).
// Every figure carries stated, measured, design standard or modelled, with a plain-words
// source. No prices, availability or seller names.

import { segmented, actionBar, el, icon } from '../ui.js';
import { html, raw } from '../core.js';
import {
  VENUES, venueById, MODES, areasFor, areaName, includesFor, whereFor, otherSpacesFor, daysFor, defaultDay, dayLabel,
} from '../data/venues.js';
import { SEATMAPS, STANDARDS, CHAIRS } from '../data/seatmaps.js';
import { GUIDE, STATUS_LABEL, sourceWords, SIZES_NOTE } from '../data/venue-guide.js';
import {
  venueLinks, productLink, upcomingEvents, linkInfo, outLinkHtml, siteProductName, PAGES, PHONE,
} from '../data/prestige-links.js';

// Lower case for running text, but NFL and other initialisms keep their capitals.
const lcName = (s) => (/^[A-Z0-9]{2,}\b/.test(String(s)) ? String(s) : String(s ?? '').toLowerCase());

const TOOL = 'venue-guide';
const listJoin = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const tagCls = (s) => (s === 'stated' || s === 'measured' ? 'ok' : s === 'standard' ? 'std' : 'mod');
const tag = (s) => (s ? `<span class="vg-tag vg-tag--${tagCls(s)}">${STATUS_LABEL[s] || s}</span>` : '');
const src = (s) => (s ? html`<span class="vg-src">Source: ${s}.</span>` : '');

// One fact: { what?, text, status, source, note? } as a list item.
function factLi(f) {
  return html`<li class="vg-fact">
    <p>${raw(f.what ? html`<strong>${f.what}.</strong> ` : '')}${f.text} ${raw(f.status ? tag(f.status) : '')}</p>
    ${raw(f.note || f.source ? html`<p class="vg-fact__meta">${raw(f.note ? html`${f.note} ` : '')}${raw(src(f.source))}</p>` : '')}
  </li>`;
}
const factList = (list, cls = '') => (list?.length ? `<ul class="vg-facts ${cls}">${list.map(factLi).join('')}</ul>` : '');

// "101 to 109, 112 and 115" from a list of ids.
function ranges(ids) {
  const out = []; let i = 0;
  const num = (s) => /^\d+$/.test(s);
  while (i < ids.length) {
    let j = i;
    while (j + 1 < ids.length && num(ids[j]) && num(ids[j + 1]) && Number(ids[j + 1]) === Number(ids[j]) + 1) j++;
    out.push(j > i ? `${ids[i]} to ${ids[j]}` : ids[i]);
    i = j + 1;
  }
  return listJoin(out);
}

// Notes that already carry their own labels in brackets get no extra tag.
const inlineLabelled = (t) => /\((stated|measured|modelled|estimate|design standard)/i.test(t);
const noteStatus = (t) => (inlineLabelled(t) ? null : /measured/.test(t) ? 'measured' : /stated/.test(t) ? 'stated' : 'modelled');
// "Access platforms 108 and 109" from "Access platform {id}" and its blocks.
function accessWords(a) {
  const ids = a.blocks.map(String);
  if (!a.words.includes('{id}')) return a.words;
  return a.words.replace(/(\S*)\{id\}([A-Za-z]*)/, (m, pre, post) => listJoin(ids.map((id) => `${pre}${id}${post}`)))
    .replace(/\bplatform\b/i, (w) => (ids.length > 1 ? `${w}s` : w));
}
const DAY_WORDS = { royal: 'Royal Ascot', raceday: 'other racedays', festival: 'the Festival', other: 'other racedays' };

const ICON = { stadium: 'stadium', arena: 'music', hall: 'hall', racecourse: 'racing' };
const productName = (venueId, a, mode, day) => siteProductName(venueId, a.id) || areaName(a, mode, day);

export function mount(root, ctx) {
  const st = { venue: VENUES[0].id, mode: null, day: null };
  const levelCache = new Map();
  let renderToken = 0;

  root.innerHTML = '';
  const wrap = el('<div class="tool vg"></div>');
  root.append(wrap);

  wrap.append(el(html`<header class="tool__head vg-head">
    <p class="eyebrow">${raw(icon('map'))} Venue guide</p>
    <h2>Everything we have verified about each venue</h2>
    <p>Where it is, what is staged there, how the seats are numbered and sized, the hospitality in each area, access notes and our dated events. Every figure says where it comes from.</p>
  </header>`));

  wrap.append(el(html`<div class="vg-legend" role="note" aria-label="What the labels mean">
    <span>${raw(tag('stated'))} the venue, its architect or a planning document says it (where we read it in a secondary source such as Wikipedia, the source line says so)</span>
    <span>${raw(tag('measured'))} a published access survey or the venue’s own step count</span>
    <span>${raw(tag('standard'))} UK or FIFA design guidance</span>
    <span>${raw(tag('modelled'))} our own estimate from geometry</span>
  </div>`));

  // Venue picker: a tab strip of the seven venues.
  const picker = el(`<div class="vg-picker" role="tablist" aria-label="Choose a venue"></div>`);
  VENUES.forEach((v) => {
    const b = el(html`<button type="button" role="tab" class="vg-pick" data-venue="${v.id}" aria-selected="false" tabindex="-1">
      ${raw(icon(ICON[v.archetype] || 'pin'))}<span><strong>${v.name}</strong><span>${v.city}</span></span></button>`);
    picker.append(b);
  });
  wrap.append(picker);

  const body = el('<div class="vg-body" role="tabpanel" tabindex="-1" aria-live="off"></div>');
  wrap.append(body);

  const bar = actionBar({
    onBrief: () => addToBrief(),
    onShare: () => shareResult(),
    onEnquire: () => enquire(),
    extra: [{ label: 'Print this venue', icon: 'printer', cls: 'btn--ghost', run: () => printGuide() }],
  });
  bar.el.classList.add('vg-actions');
  wrap.append(bar.el);
  wrap.append(el('<p class="fine-print vg-fine">Facts come from the venues, their architects, planning documents, access surveys and UK design guidance, as labelled. Seat numbers and sizes marked modelled are ours and may not match a ticket. A hospitality specialist confirms the exact seats and inclusions.</p>'));

  const pickButtons = [...picker.querySelectorAll('[data-venue]')];
  function paintPicker() {
    pickButtons.forEach((b) => {
      const on = b.dataset.venue === st.venue;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) body.setAttribute('aria-labelledby', b.id || (b.id = `vg-tab-${b.dataset.venue}`));
    });
  }
  pickButtons.forEach((b) => { b.id = `vg-tab-${b.dataset.venue}`; });
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('[data-venue]');
    if (!b || b.dataset.venue === st.venue) return;
    setVenue(b.dataset.venue);
  });
  picker.addEventListener('keydown', (e) => {
    const i = pickButtons.indexOf(document.activeElement);
    if (i < 0) return;
    let n = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % pickButtons.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + pickButtons.length) % pickButtons.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = pickButtons.length - 1;
    if (n == null) return;
    e.preventDefault();
    pickButtons[n].focus();
    setVenue(pickButtons[n].dataset.venue);
  });

  function setVenue(id) {
    st.venue = id; st.mode = null; st.day = null;
    normalise();
    render();
    const b = pickButtons.find((x) => x.dataset.venue === id);
    b?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: ctx.reducedMotion() ? 'auto' : 'smooth' });
  }

  const venue = () => venueById(st.venue);
  const modes = () => MODES[venue().archetype] || [];
  // Products differ by mode only where an area is limited to some modes (Tottenham).
  const modeMatters = () => modes().length > 1 && areasFor(st.venue).some((a) => a.modes && a.kind === 'hospitality');
  function normalise() {
    if (!venueById(st.venue)) st.venue = VENUES[0].id;
    if (!modes().some((m) => m.id === st.mode)) st.mode = modes()[0]?.id || null;
    const days = daysFor(st.venue);
    if (!days.length) st.day = null;
    else if (!days.some((d) => d.id === st.day)) st.day = defaultDay(st.venue);
  }

  const params = () => ({ venue: st.venue, mode: modeMatters() && st.mode !== modes()[0]?.id ? st.mode : null, day: daysFor(st.venue).length && st.day !== defaultDay(st.venue) ? st.day : null });

  /* ---------- Sections ---------- */

  function viewerHref(p) {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v != null && v !== '')).toString();
    return `#reality-viewer${q ? `?${q}` : ''}`;
  }
  const viewerBtn = (p, label, cls = 'btn btn--ink btn--sm') => html`<a class="${cls}" href="${viewerHref(p)}" data-viewer='${JSON.stringify(p)}'>${raw(icon('eye'))}<span>${label}</span></a>`;

  function glance(v, G) {
    const links = venueLinks(v.id, { tool: TOOL });
    const best = links[0];
    const cap = G.capacity
      ? html`<p>${G.capacity.text} ${raw(tag(G.capacity.status))} ${raw(src(G.capacity.source))}${G.capacity.note ? ` ${G.capacity.note}` : ''}</p>`
      : html`<p class="muted">${G.capacityNote || 'Not published by the venue.'}</p>`;
    const extra = (G.extraCounts || []).map((c) => html`<p>${c.text} ${raw(tag(c.status))} ${raw(src(c.source))}</p>`).join('');
    return html`<section class="vg-sec" id="vg-glance" aria-labelledby="vg-glance-h">
      <h3 id="vg-glance-h">At a glance</h3>
      <div class="vg-glance">
        <div class="card vg-card">
          <h4>${raw(icon('pin'))} Where it is</h4>
          ${raw(factList(G.where, 'vg-facts--plain'))}
          <h4>${raw(icon('users'))} Capacity</h4>
          ${raw(cap)}${raw(extra)}
          <p class="fine-print">Opening years are not shown: none of the dates we found is published by the venue itself.</p>
        </div>
        <div class="card vg-card">
          <h4>${raw(icon('calendar'))} What is staged here</h4>
          ${raw(factList(G.staged, 'vg-facts--plain'))}
          <p class="vg-model-note">${raw(icon('info'))}<span>${G.modelNote}</span></p>
        </div>
      </div>
      <div class="vg-cta-row">
        ${raw(viewerBtn({ venue: v.id, mode: modeMatters() ? st.mode : null, day: st.day }, 'Open this venue in the seat viewer'))}
        ${raw(best ? outLinkHtml(best, { cls: 'btn btn--ghost btn--sm', iconSvg: icon('external') }) : '')}
      </div>
    </section>`;
  }

  function shapeSection(G) {
    return html`<section class="vg-sec" id="vg-shape" aria-labelledby="vg-shape-h">
      <h3 id="vg-shape-h">Shape and dimensions</h3>
      ${raw(factList(G.shape))}
    </section>`;
  }

  function levelsSection(G) {
    return html`<section class="vg-sec" id="vg-levels" aria-labelledby="vg-levels-h">
      <h3 id="vg-levels-h">${venue().archetype === 'racecourse' ? 'Stands and floors' : 'Stands, tiers and levels'}</h3>
      ${raw(factList(G.levels))}
    </section>`;
  }

  function runLines(D) {
    const groups = new Map();
    (D.runs || []).forEach((r) => {
      if (r.label || r.prefix) return; // Hall sections and suite-level labels are covered by the notes.
      const key = `${r.level}|${r.stand || ''}`;
      if (!groups.has(key)) groups.set(key, { level: r.level, stand: r.stand || '', ids: [], stated: [] });
      const g = groups.get(key);
      g.ids.push(...r.ids);
      g.stated.push(...(r.stated === 'all' ? r.ids : r.stated));
    });
    return [...groups.values()].map((g) => {
      const all = g.stated.length === g.ids.length; const none = !g.stated.length;
      const status = all ? 'stated' : 'modelled';
      const words = all ? 'All published.' : none ? 'These numbers are ours.' : `Published: ${ranges(g.stated)}. The rest are ours.`;
      return { what: `${g.level}${g.stand ? `, ${g.stand}` : ''}`, text: `Blocks ${ranges(g.ids)}. ${words}`, status };
    });
  }

  function numberingSection(v, G) {
    const D = SEATMAPS[v.id] || {};
    const top = [];
    if (D.rows?.note) top.push({ what: 'Rows', text: D.rows.note, status: D.rows.status });
    if (D.seats?.note) top.push({ what: 'Seats', text: D.seats.note, status: D.seats.status });
    if (D.blockNote) top.push({ what: v.archetype === 'racecourse' ? 'Seating' : 'Blocks', text: D.blockNote, status: noteStatus(D.blockNote) });
    if (D.boxNote) top.push({ what: 'Boxes', text: D.boxNote, status: noteStatus(D.boxNote) });
    const boxes = Object.values(D.boxes || {}).filter((b) => b.groups).map((b) => ({ what: b.label, text: `Boxes ${listJoin(b.groups.map(([a, z]) => `${a} to ${z}`))}.`, status: b.status }));
    const hallBoxes = Object.values(D.boxes || {}).filter((b) => !b.groups && b.note).map((b) => ({ what: b.label, text: b.note, status: b.status }));
    const runs = runLines(D);
    return html`<section class="vg-sec" id="vg-numbering" aria-labelledby="vg-numbering-h">
      <h3 id="vg-numbering-h">Block, row and box numbering</h3>
      ${raw(factList(top))}
      ${raw(runs.length ? html`<h4 class="vg-sub">Blocks by level</h4>${raw(factList(runs, 'vg-facts--compact'))}` : '')}
      ${raw(boxes.length ? html`<h4 class="vg-sub">Box numbers by level</h4>${raw(factList(boxes, 'vg-facts--compact'))}` : '')}
      ${raw(hallBoxes.length ? factList(hallBoxes, 'vg-facts--compact') : '')}
      ${raw(factList(G.numbering))}
      ${raw((D.notes || []).length ? factList(D.notes.map((n) => ({ text: n, status: noteStatus(n) })), 'vg-facts--compact') : '')}
    </section>`;
  }

  function sizesSection(v) {
    const D = SEATMAPS[v.id] || {};
    const hall = v.archetype === 'hall';
    const keys = ['seatCentresNew', 'seatCentresOld', 'rowDepthMin', 'rowDepth', 'clearway', 'clearwayShort', ...(hall ? ['seatway'] : []), 'rake', 'cValue', 'wheelchair', 'eyeHeight'];
    const stds = keys.map((k) => ({ text: STANDARDS[k].words[0].toUpperCase() + STANDARDS[k].words.slice(1) + '.', status: k === 'eyeHeight' ? 'modelled' : 'standard', source: STANDARDS[k].source }));
    const mm = (m) => `${Math.round(m * 1000)} mm`;
    const chairs = [
      { what: 'Standard seat', text: `${CHAIRS.standard.words}: ${mm(CHAIRS.standard.width)} wide, ${mm(CHAIRS.standard.depth)} deep folded, seat ${mm(CHAIRS.standard.panY)} above the floor, backrest top ${mm(CHAIRS.standard.backTop)}.`, status: 'modelled' },
      { what: 'Padded seat', text: `${CHAIRS.padded.words}: ${mm(CHAIRS.padded.width)} wide, ${mm(CHAIRS.padded.depth)} deep folded, seat ${mm(CHAIRS.padded.panY)} above the floor. Used only where the venue says a product has padded seats.`, status: 'modelled' },
    ];
    const extra = [];
    if (D.steps) extra.push({ what: 'Steps', text: `${D.steps.words}.`, status: D.steps.status, source: D.steps.source });
    if (D.armrests) extra.push(...Object.entries(D.armrests).map(([k, a]) => ({ what: { stalls: 'Stalls', choir: 'Choir', circle: 'Rausing Circle', arena: 'Arena', box: 'Boxes' }[k] || k, text: `${a.words}.`, status: a.status, source: 'the Hall' })));
    const racecourse = v.archetype === 'racecourse';
    return html`<section class="vg-sec" id="vg-sizes" aria-labelledby="vg-sizes-h">
      <h3 id="vg-sizes-h">Seat and row sizes</h3>
      <p class="callout vg-callout">${raw(icon('info'))}<span>${SIZES_NOTE}</span></p>
      ${raw(extra.length ? factList(extra) : '')}
      ${raw(racecourse ? '' : html`<h4 class="vg-sub">By level, from our seat model</h4>
        <p class="muted vg-sub-note">One example seat per level, with the same figures the seat panel in the viewer shows for it. Open it to see the view and the dimension lines.</p>
        <div class="vg-levels" data-levels><div class="skeleton"></div><div class="skeleton"></div></div>`)}
      <div class="vg-two">
        <div><h4 class="vg-sub">UK and FIFA design standards</h4>${raw(factList(stds, 'vg-facts--compact'))}</div>
        <div><h4 class="vg-sub">The chairs in our 3D model</h4>${raw(factList(chairs, 'vg-facts--compact'))}</div>
      </div>
    </section>`;
  }

  function productCard(v, a, G) {
    const name = productName(v.id, a, st.mode, st.day);
    const w = { ...whereFor(a, st.day) };
    const over = G.areaWhere?.[a.id];
    if (over) { w.level = over.level; if (/does not publish its level/i.test(w.note || '')) delete w.note; }
    const bits = [w.enclosure, w.stand, w.level, w.block, w.side].filter(Boolean);
    const whereText = [bits.join(', '), (w.note || '').replace(/\.$/, '')].filter(Boolean).join('. ');
    const D = SEATMAPS[v.id]?.products?.[a.id];
    const inc = includesFor(a, st.day);
    const venueSrc = sourceWords(a.src?.[0]);
    const offered = a.modes && modes().length > 1 ? `Offered for ${listJoin(a.modes.map((m) => lcName(modes().find((x) => x.id === m)?.label)).filter(Boolean))}.` : '';
    const site = productLink(v.id, a.id, { mode: st.mode, day: st.day, tool: TOOL, name });
    const unpublishedSeat = /not published/i.test(a.seatType || '');
    return html`<article class="card vg-product" data-area="${a.id}">
      <header class="vg-product__head">
        <h4>${name}</h4>
        ${raw(offered ? html`<p class="vg-product__modes">${offered}</p>` : '')}
      </header>
      <dl class="vg-dl">
        <div><dt>Where</dt><dd>${whereText ? `${whereText}.` : 'Not published.'} ${raw(tag(over ? over.status : bits.length ? 'stated' : null))} ${raw(src(over ? over.source : bits.length ? venueSrc : ''))}</dd></div>
        ${raw(D ? html`<div><dt>Seats in</dt><dd>${D.words} ${raw(tag(D.status))} ${raw(src(D.source))}</dd></div>` : '')}
        <div><dt>Seat type</dt><dd>${unpublishedSeat ? 'Not published' : a.seatType} ${raw(unpublishedSeat ? '' : tag('stated'))} ${raw(unpublishedSeat ? '' : src(venueSrc))}</dd></div>
        <div><dt>The view</dt><dd>${a.view ? raw(html`“${a.view}” ${raw(tag('stated'))} ${raw(src(`${venueSrc}, its own words`))}`) : 'The venue does not describe it.'}</dd></div>
        <div><dt>Includes</dt><dd>${inc.length ? raw(html`<ul class="vg-inc">${raw(inc.map((i) => html`<li>${i}</li>`).join(''))}</ul>${raw(tag('stated'))} ${raw(src(`${venueSrc}, as listed`))}`) : 'Not listed for this day.'}</dd></div>
        ${raw(a.modelled ? html`<div><dt>In our model</dt><dd>${a.modelled} ${raw(tag('modelled'))}</dd></div>` : '')}
      </dl>
      <div class="vg-product__links">
        ${raw(viewerBtn({ venue: v.id, area: a.id, mode: modeMatters() ? st.mode : null, day: st.day }, 'See the view from a seat'))}
        ${raw(site ? outLinkHtml(site, { cls: 'btn btn--ghost btn--sm', iconSvg: icon('external') }) : '')}
      </div>
    </article>`;
  }

  function hospitalitySection(v, G) {
    const opts = { mode: st.mode, day: st.day };
    const list = areasFor(v.id, opts);
    const hosp = list.filter((a) => a.kind === 'hospitality');
    const std = list.filter((a) => a.kind === 'standard');
    const other = otherSpacesFor(v.id, st.day);
    const dayInfo = G.days;
    // Names and enclosures that change between racedays, read from the data.
    const diffs = [];
    if (daysFor(v.id).length) {
      areasFor(v.id).forEach((a) => {
        if (a.nameByDay) Object.entries(a.nameByDay).forEach(([d, n]) => diffs.push(`${a.name} is called ${n} on ${DAY_WORDS[d] || d}.`));
        if (a.whereByDay) {
          const enc = daysFor(v.id).map((d) => [d, a.whereByDay[d.id]?.enclosure]).filter(([, e]) => e);
          if (enc.length > 1 && new Set(enc.map(([, e]) => e)).size > 1) diffs.push(`${a.name}: ${listJoin(enc.map(([d, e]) => `${e} at ${DAY_WORDS[d.id] || d.label}`))}.`);
        }
      });
    }
    return html`<section class="vg-sec" id="vg-hospitality" aria-labelledby="vg-hosp-h">
      <h3 id="vg-hosp-h">Hospitality by area</h3>
      <div class="vg-filter" data-filter></div>
      ${raw(dayInfo ? html`<div class="card card--soft vg-days">
        <p>${dayInfo.intro}</p>
        ${raw(factList(dayInfo.notes, 'vg-facts--compact'))}
        ${raw(diffs.length ? html`<p class="vg-sub">Name and enclosure changes</p><ul class="vg-diffs">${raw(diffs.map((d) => html`<li>${d}</li>`).join(''))}</ul>` : '')}
      </div>` : '')}
      <p class="muted">${hosp.length} hospitality ${hosp.length === 1 ? 'product' : 'products'}${daysFor(v.id).length ? ` on ${dayLabel(v.id, st.day).toLowerCase()}` : modeMatters() ? ` for ${modes().find((m) => m.id === st.mode)?.label.toLowerCase()}` : ''}. Names are the ones our website uses where it names the product, otherwise the venue’s own.</p>
      <div class="vg-products">${raw(hosp.map((a) => productCard(v, a, G)).join(''))}</div>
      ${raw(std.length ? html`<h4 class="vg-sub">Standard seating</h4><ul class="vg-std">${raw(std.map((a) => {
        const w = whereFor(a, st.day); const bits = [w.level, w.block, w.stand].filter(Boolean);
        return html`<li><strong>${areaName(a, st.mode, st.day)}</strong>${bits.length ? `, ${bits.join(', ')}` : ''}. ${a.seatType}.${w.note ? ` ${w.note}` : ''}</li>`;
      }).join(''))}</ul>` : '')}
      ${raw(other.length ? html`<h4 class="vg-sub">Also at this venue (no seat view)</h4><ul class="vg-std">${raw(other.map((s) => html`<li><strong>${s.name}</strong>: ${s.where}. ${raw(tag('stated'))} ${raw(src(sourceWords(s.src)))}</li>`).join(''))}</ul>` : '')}
    </section>`;
  }

  function accessSection(v, G) {
    const D = SEATMAPS[v.id] || {};
    const places = (D.access || []).map((a) => ({
      what: a.words.includes('{id}') ? '' : `Block${a.blocks.length > 1 ? 's' : ''} ${ranges(a.blocks.map(String))}${a.rows ? `, Row${a.rows.length > 1 ? 's' : ''} ${a.rows.join(' to ')}` : ''}`,
      text: `${accessWords(a)}.`, status: a.status, source: a.source,
    }));
    const products = Object.entries(D.products || {}).filter(([id]) => id === 'private-box').map(([, p]) => ({ text: `${p.words}.`, status: p.status, source: p.source }));
    return html`<section class="vg-sec" id="vg-access" aria-labelledby="vg-access-h">
      <h3 id="vg-access-h">Access</h3>
      ${raw(factList([...places, ...products, ...(G.access || [])]))}
      <p class="fine-print">Access needs differ by event and layout, so tell a specialist what you need and they will confirm the route and seats.</p>
    </section>`;
  }

  function eventsSection(v) {
    const paths = upcomingEvents({ venue: v.id });
    const items = paths.map((p) => {
      const info = linkInfo(p, { tool: TOOL, outcome: `dated-${p.split('/').pop()}` });
      if (!info) return '';
      const page = PAGES[p];
      return html`<li class="vg-event">
        <span class="vg-event__date">${raw(icon('calendar'))}${page.dateText}</span>
        <span class="vg-event__name">${page.name}${raw(page.day ? html` <span class="badge">${dayLabel(v.id, page.day)}</span>` : '')}</span>
        ${raw(outLinkHtml(info, { cls: 'btn btn--ghost btn--sm', iconSvg: icon('external'), label: 'See it on our website' }))}
      </li>`;
    }).join('');
    const best = venueLinks(v.id, { tool: TOOL })[0];
    return html`<section class="vg-sec" id="vg-events" aria-labelledby="vg-events-h">
      <h3 id="vg-events-h">Our upcoming events here</h3>
      ${raw(items ? html`<ul class="vg-events">${raw(items)}</ul>` : html`<div class="empty-state vg-empty"><p>No dated event pages at this venue on our website right now.${best ? ' See what we offer here instead:' : ''}</p>${raw(best ? outLinkHtml(best, { cls: 'btn btn--ghost btn--sm', iconSvg: icon('external') }) : '')}</div>`)}
      <p class="fine-print">Dates are the ones on our event pages. Each one disappears from this list once its date has passed.</p>
    </section>`;
  }

  function moreSection(v, G) {
    const links = venueLinks(v.id, { tool: TOOL });
    return html`<section class="vg-sec" id="vg-more" aria-labelledby="vg-more-h">
      <h3 id="vg-more-h">Names, gaps and links</h3>
      <div class="vg-two">
        <div>
          <h4 class="vg-sub">Names worth knowing</h4>
          ${raw(factList(G.naming, 'vg-facts--compact'))}
          <h4 class="vg-sub">Not published anywhere we looked</h4>
          <ul class="vg-gaps">${raw((G.gaps || []).map((g) => html`<li>${g}</li>`).join(''))}</ul>
        </div>
        <div>
          <h4 class="vg-sub">On our website</h4>
          <ul class="vg-links">${raw(links.map((l) => html`<li>${raw(outLinkHtml(l, { cls: 'vg-link', iconSvg: icon('external') }))}</li>`).join(''))}</ul>
          <p class="vg-call">${raw(icon('phone'))}<span>Or call a specialist on <a href="${PHONE.href}">${PHONE.text}</a>.</span></p>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Levels from the seat model (same figures as the seat panel) ---------- */

  const WANT = ['Seat type', 'Seat width (the chair)', 'Seat centres', 'Row depth', 'Clear seatway', 'Step height', 'Rake of your row', 'Distance to', 'Sightline C-value', 'Seats in this row of the block'];
  async function levelData(venueId, mode, day) {
    const key = `${venueId}:${mode}:${day || ''}`;
    if (levelCache.has(key)) return levelCache.get(key);
    const sp = await import('../viewer/seatplan.js');
    const M = sp.seatMap(venueId, mode, day);
    const out = [];
    if (M) {
      const groups = new Map();
      M.blocks.forEach((b) => {
        if (!b.rowList?.length) return;
        const k = b.levelLabel || String(b.level);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(b);
      });
      groups.forEach((blocks, label) => {
        const stated = blocks.filter((b) => b.status === 'stated' || b.status === 'measured');
        const pool = stated.length ? stated : blocks;
        const b = pool[Math.floor((pool.length - 1) / 2)];
        const row = b.rowList[Math.floor((b.rowList.length - 1) / 2)];
        const k = row.seats[Math.floor((row.seats.length - 1) / 2)];
        const spec = sp.specForSeat(M, k);
        const facts = sp.seatFacts(M, k, spec).filter((f) => WANT.some((w) => f.label.startsWith(w)));
        const ref = sp.seatRef(M, k);
        const status = sp.refStatus(M, k);
        const ai = M.seats.area[k];
        const counts = blocks.map((x) => x.rowList.length);
        out.push({
          label, k, ref, status, facts, words: sp.seatWords(M, k), area: ai >= 0 ? M.areas[ai].id : null, areaName: ai >= 0 ? M.areas[ai].name : null,
          blocks: blocks.length, rowsMin: Math.min(...counts), rowsMax: Math.max(...counts),
          first: b.rowList[0].label, last: b.rowList[b.rowList.length - 1].label, floor: !!b.floor,
        });
      });
    }
    levelCache.set(key, out);
    return out;
  }

  function levelCard(v, L) {
    // Block, row and seat numbers each keep their own label, so a published block number
    // never makes a modelled row or seat number look published.
    const known = (s) => (s === 'stated' || s === 'measured' ? 'stated' : 'modelled');
    const seatStatusHtml = (S) => {
      const parts = [['block', known(S.block)], ['row', known(S.row)], ['seat', known(S.seat)]];
      if (parts.every(([, s]) => s === parts[0][1])) return tag(parts[0][1]);
      return parts.map(([k, s]) => html`<span class="vg-level__part">${k} ${raw(tag(s))}</span>`).join(' ');
    };
    const rowsStated = L.status.row === 'stated';
    const rows = L.floor ? `Rows ${L.first} to ${L.last}` : L.rowsMin === L.rowsMax ? `${L.rowsMax} rows, ${L.first} to ${L.last}` : `${L.rowsMin} to ${L.rowsMax} rows a block; ${L.first} to ${L.last} in the example block`;
    const p = { venue: v.id, mode: modeMatters() ? st.mode : null, day: st.day, area: L.area, block: L.ref.block, row: L.ref.row, seat: L.ref.seat };
    return html`<article class="card vg-level" data-level="${L.label}">
      <header class="vg-level__head">
        <h5>${L.label}</h5>
        <p>${L.floor ? 'Arena floor' : `${L.blocks} ${L.blocks === 1 ? 'block' : 'blocks'}`}. ${rows} ${raw(tag(rowsStated ? 'stated' : 'modelled'))}</p>
      </header>
      <p class="vg-level__seat">Example seat: <strong data-seat-words>${L.words}</strong> ${raw(seatStatusHtml(L.status))}${raw(L.areaName ? html` <span class="vg-level__area">${L.areaName}</span>` : '')}</p>
      <dl class="vg-dl vg-dl--grid">${raw(L.facts.map((f) => html`<div data-fact="${f.label}"><dt>${f.label}</dt><dd><span data-v>${f.value}</span> ${raw(tag(f.status))}</dd></div>`).join(''))}</dl>
      <p class="vg-level__links">${raw(viewerBtn(p, 'See this seat in the viewer', 'btn btn--ghost btn--sm'))}</p>
    </article>`;
  }

  async function fillLevels(token) {
    const host = body.querySelector('[data-levels]');
    if (!host) return;
    const v = venue();
    try {
      const levels = await levelData(v.id, st.mode, st.day);
      if (token !== renderToken) return;
      host.innerHTML = levels.length ? levels.map((L) => levelCard(v, L)).join('') : '<p class="muted">No numbered seats in this model.</p>';
    } catch (err) {
      if (token !== renderToken) return;
      console.error('[venue-guide] seat model failed', err);
      host.innerHTML = '<p class="muted">The seat figures could not be worked out here. Open the seat viewer to see them.</p>';
    }
  }

  /* ---------- Render ---------- */

  function render({ write = true } = {}) {
    normalise();
    paintPicker();
    const v = venue();
    const G = GUIDE[v.id] || {};
    const token = ++renderToken;
    const nav = [['vg-glance', 'At a glance'], ['vg-shape', 'Shape'], ['vg-levels', 'Levels'], ['vg-numbering', 'Numbering'], ['vg-sizes', 'Seat sizes'], ['vg-hospitality', 'Hospitality'], ['vg-access', 'Access'], ['vg-events', 'Events'], ['vg-more', 'Links']];
    body.innerHTML = html`
      <div class="vg-title">
        <p class="eyebrow">${v.city}</p>
        <h3 class="vg-venue-name">${v.name}</h3>
      </div>
      <nav class="vg-nav" aria-label="Sections of this venue guide">${raw(nav.map(([id, t]) => html`<a href="#${id}" data-jump="${id}">${t}</a>`).join(''))}</nav>
      ${raw(glance(v, G))}
      ${raw(shapeSection(G))}
      ${raw(levelsSection(G))}
      ${raw(numberingSection(v, G))}
      ${raw(sizesSection(v))}
      ${raw(hospitalitySection(v, G))}
      ${raw(accessSection(v, G))}
      ${raw(eventsSection(v))}
      ${raw(moreSection(v, G))}`;
    // Day or event pickers inside Hospitality.
    const filter = body.querySelector('[data-filter]');
    if (daysFor(v.id).length) {
      const seg = segmented({ label: 'Raceday', options: daysFor(v.id).map((d) => ({ value: d.id, label: d.label })), value: st.day, onChange: (d) => { st.day = d; render(); body.querySelector('#vg-hospitality')?.scrollIntoView({ block: 'start' }); } });
      filter.append(el('<span class="vg-filter__label">Raceday</span>'), seg.el);
    } else if (modeMatters()) {
      const seg = segmented({ label: 'Event', options: modes().map((m) => ({ value: m.id, label: m.label })), value: st.mode, onChange: (m) => { st.mode = m; render(); body.querySelector('#vg-hospitality')?.scrollIntoView({ block: 'start' }); } });
      filter.append(el('<span class="vg-filter__label">Event</span>'), seg.el);
    } else filter.remove();
    fillLevels(token);
    if (write) ctx.setParams(params());
  }

  body.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      e.preventDefault();
      const t = body.querySelector(`#${jump.dataset.jump}`);
      t?.scrollIntoView({ behavior: ctx.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      t?.querySelector('h3')?.setAttribute('tabindex', '-1');
      t?.querySelector('h3')?.focus({ preventScroll: true });
      return;
    }
    const a = e.target.closest('[data-viewer]');
    if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) {
      e.preventDefault();
      let p = {};
      try { p = JSON.parse(a.dataset.viewer); } catch { /* keep empty */ }
      ctx.navigate('reality-viewer', Object.fromEntries(Object.entries(p).filter(([, x]) => x != null && x !== '')));
    }
  });

  /* ---------- Brief, share, enquiry, print ---------- */

  function summaryLines() {
    const v = venue(); const G = GUIDE[v.id] || {};
    const hosp = areasFor(v.id, { mode: st.mode, day: st.day }).filter((a) => a.kind === 'hospitality');
    const events = upcomingEvents({ venue: v.id }).map((p) => `${PAGES[p].name}, ${PAGES[p].dateText}`);
    return [
      G.where?.[0] ? `Where: ${G.where[0].text}` : null,
      G.staged?.length ? `Staged here: ${G.staged.map((s) => s.what).join(', ')}` : null,
      daysFor(v.id).length ? `Raceday: ${dayLabel(v.id, st.day)}` : null,
      hosp.length ? `Hospitality: ${hosp.map((a) => productName(v.id, a, st.mode, st.day)).join(', ')}` : null,
      events.length ? `Our dated events here: ${events.slice(0, 4).join('; ')}` : null,
    ].filter(Boolean);
  }
  function addToBrief() {
    const v = venue();
    ctx.brief.add({ tool: TOOL, title: `${v.name}: venue guide`, subtitle: daysFor(v.id).length ? dayLabel(v.id, st.day) : v.city, lines: summaryLines(), params: params() });
  }
  function shareResult() {
    const v = venue();
    ctx.share.send({ title: `${v.name}: venue guide`, text: `Verified facts about ${v.name}: seats, hospitality and access.`, url: ctx.shareUrl(params()) });
  }
  function enquire() {
    const v = venue();
    ctx.openEnquiry({ tool: TOOL, event: v.name, summary: `Hospitality at ${v.name}`, lines: summaryLines(), context: { venue: v.id, day: st.day, mode: st.mode } });
  }
  function printGuide() {
    const rootEl = document.documentElement;
    rootEl.classList.add('printing-guide');
    const done = () => rootEl.classList.remove('printing-guide');
    window.addEventListener('afterprint', done, { once: true });
    requestAnimationFrame(() => setTimeout(() => { window.print(); setTimeout(done, 1000); }, 60));
  }

  function fromParams(p = {}) {
    if (!p.venue && !p.day && !p.mode) return false;
    if (venueById(p.venue)) { if (p.venue !== st.venue) { st.mode = null; st.day = null; } st.venue = p.venue; }
    if (p.mode) st.mode = p.mode;
    if (p.day) st.day = p.day;
    return true;
  }

  normalise();
  render({ write: false });

  return {
    activate(p) { fromParams(p || {}); render(); },
    deactivate() {},
    destroy() { root.innerHTML = ''; },
  };
}

export default { mount };
