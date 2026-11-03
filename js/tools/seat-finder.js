// Where Should I Sit? Questions in, a real named hospitality product at a real venue out.
// Reworked 02/11/2026 (links and guide agent).
//
// How it decides (explained on screen too):
// - Products are the venue's real hospitality areas from js/data/venues.js, for the event
//   layout the venue stages (js/data/occasions.js STAGED_AT). Football only at Tottenham.
// - Each priority reads one fact: what the venue lists as included (dining, drinks, a lounge),
//   the seat type it states (padded, a private suite or box), or a number from our 3D model
//   (distance to the action, eye height, how far off centre), worked out by the same
//   geometry as the seat viewer (js/viewer/layouts.js seatSpec and seatNumbers).
// - The first priority counts 60 per cent, the second 40 per cent. Who is going and the
//   extras then nudge the order. There are no opinion scores and no prices.
// - Every reason shown is a labelled fact: stated (the venue), or modelled (our geometry).

import { segmented, chips, optionCards, toggle, actionBar, group, el, icon } from '../ui.js';
import { html, raw } from '../core.js';
import { venueById, includesFor, whereFor, areaName, daysFor, defaultDay, dayLabel } from '../data/venues.js';
import { SEATMAPS } from '../data/seatmaps.js';
import { PLANNABLE_EVENTS, CATEGORY_LABEL, stagedAt, stagingFor, productsFor } from '../data/occasions.js';
import { sourceWords } from '../data/venue-guide.js';
import {
  eventLinks, productLink, upcomingEvents, linkInfo, outLinkHtml, siteProductName,
} from '../data/prestige-links.js';

// Lower case for running text, but NFL and other initialisms keep their capitals.
const lcName = (s) => (/^[A-Z0-9]{2,}\b/.test(String(s)) ? String(s) : String(s ?? '').toLowerCase());

const TOOL = 'seat-finder';

const PRIORITIES = [
  { value: 'close', label: 'Close to the action', icon: 'target', desc: 'Shortest distance in our model' },
  { value: 'high', label: 'A view over it all', icon: 'eye', desc: 'Highest eyes in our model' },
  { value: 'central', label: 'A central view', icon: 'compare', desc: 'Least off-centre in our model' },
  { value: 'dining', label: 'Dining included', icon: 'utensils', desc: 'Listed by the venue' },
  { value: 'drinks', label: 'Drinks included', icon: 'glass', desc: 'Listed by the venue' },
  { value: 'lounge', label: 'A lounge to use', icon: 'hall', desc: 'Before, during or after' },
  { value: 'private', label: 'A private space', icon: 'crown', desc: 'Suite, box or own table' },
  { value: 'padded', label: 'A padded seat', icon: 'shield', desc: 'Stated by the venue' },
];
const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label]));
// Older links used opinion-based priorities; they map onto the nearest fact.
const PRIORITY_ALIAS = { view: 'central', sound: 'central', atmosphere: 'close', comfort: 'padded', value: 'lounge', clients: 'private', family: 'padded', luxury: 'dining' };

const GROUPS = [
  { value: 'couple', label: 'Two of us', icon: 'heart' },
  { value: 'friends', label: 'Friends', icon: 'glass' },
  { value: 'family', label: 'Family', icon: 'users' },
  { value: 'clients', label: 'Clients', icon: 'handshake' },
  { value: 'team', label: 'Our team', icon: 'trophy' },
];
const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.value, g.label]));
const EVENT_ICON = { sport: 'trophy', music: 'music', arts: 'sparkle' };

const listJoin = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const eventById = (id) => PLANNABLE_EVENTS.find((e) => e.id === id) || null;
const tag = (s) => `<span class="sf-tag sf-tag--${s === 'modelled' ? 'mod' : 'ok'}">${s}</span>`;

const RE = {
  dining: /dining|lunch|luncheon|menu|meal|buffet|dishes|plates|food|afternoon tea|canap/i,
  drinks: /drink|bar\b|champagne|wine|cocktail|beers?/i,
  lounge: /lounge|club|restaurant and bar/i,
};

// Facts about one product, read from the data (no opinions).
function featuresOf(a, day) {
  const inc = includesFor(a, day);
  const seat = a.seatType || '';
  const has = (k) => (a.inc || []).includes(k);
  const first = (re) => inc.find((i) => re.test(i)) || null;
  return {
    inc,
    dining: has('dining') ? (first(RE.dining) || 'Dining') : null,
    drinks: has('drinks') ? (first(RE.drinks) || 'Drinks') : null,
    lounge: has('lounge') ? (first(RE.lounge) || (/lounge/i.test(seat) ? seat : 'Lounge access')) : null,
    private: has('private') ? (/private|box|suite|booth/i.test(seat) ? seat : (inc.find((i) => /private/i.test(i)) || 'A private space')) : null,
    padded: /padded|cushy/i.test(`${seat} ${a.view || ''}`) ? seat : null,
    standing: /standing|stool|no allocated seat/i.test(seat),
  };
}

/* ---------- Mount ---------- */

export function mount(root, ctx) {
  const fresh = () => ({ event: null, venue: null, day: null, priority: [], group: null, access: false, crowd: false });
  const st = fresh();
  let geo = null; // { layouts, seatplan } once loaded
  let geoLoading = null;
  const loadGeo = () => (geoLoading ||= Promise.all([import('../viewer/layouts.js'), import('../viewer/seatplan.js')])
    .then(([layouts, seatplan]) => { geo = { layouts, seatplan }; update({ write: false }); })
    .catch((err) => { console.error('[seat-finder] geometry failed to load', err); }));

  root.innerHTML = '';
  const wrap = el('<div class="tool sf"></div>');
  const inputs = el('<div class="tool__inputs sf-inputs"></div>');
  const results = el('<div class="tool__results tool__results--sticky sf-results"></div>');
  wrap.append(inputs, results);
  root.append(wrap);

  inputs.append(el(html`<header class="tool__head">
    <p class="eyebrow">${raw(icon('pin'))} Where should I sit?</p>
    <h2>Find the right hospitality for your group</h2>
    <p>Pick the event and the venue, then what matters most. We recommend a real, named product at that venue, with the reasons, and take you to the view from that exact seat.</p>
  </header>`));

  const progress = el(`<div class="sf-progress" aria-hidden="true"><div class="sf-progress__bar"><span></span></div><span class="sf-progress__text"></span></div>`);
  inputs.append(progress);

  // 1. Event type
  const g1 = group('What are you going to?', '1');
  const catRows = {};
  ['sport', 'music', 'arts'].forEach((cat) => {
    const opts = PLANNABLE_EVENTS.filter((e) => e.category === cat).map((e) => ({ value: e.id, label: e.label }));
    const row = el(html`<div class="sf-cat"><span class="sf-cat__label">${raw(icon(EVENT_ICON[cat]))}${CATEGORY_LABEL[cat]}</span></div>`);
    const c = chips({ label: CATEGORY_LABEL[cat], options: opts, multi: false, value: null, onChange: (v) => {
      Object.entries(catRows).forEach(([k, other]) => { if (k !== cat) other.set(null); });
      st.event = v; st.venue = null; st.day = null; paintVenues(); update();
    } });
    catRows[cat] = c;
    row.append(c.el);
    g1.append(row);
  });

  // 2. Venue (only venues that stage the event), and the raceday at racecourses.
  const g2 = group('Which venue?', '2');
  const venueHost = el('<div class="sf-venue-pick"></div>');
  g2.append(venueHost);

  // 3. Priorities, up to two.
  const g3 = group('What matters most?', '3');
  const pri = optionCards({ label: 'What matters most, pick up to two', options: PRIORITIES, multi: true, max: 2, value: [], onChange: (v) => {
    const kept = st.priority.filter((p) => v.includes(p));
    v.forEach((p) => { if (!kept.includes(p)) kept.push(p); });
    const blocked = v.length === 2 && st.priority.length === 2 && v.every((p) => st.priority.includes(p));
    st.priority = kept.slice(0, 2);
    paintPriorityOrder();
    if (blocked) { ctx.toast('You can pick two. Untick one to swap it.'); return; }
    update();
  } });
  pri.el.classList.add('sf-priorities');
  g3.append(el('<p class="sf-hint">Pick up to two. The first counts most. Each one reads a fact the venue publishes or a number from our 3D model.</p>'), pri.el);

  // 4. Who is going
  const g4 = group('Who is going?', '4');
  const who = chips({ label: 'Who is going', options: GROUPS, multi: false, value: null, onChange: (v) => { st.group = v; update(); } });
  g4.append(who.el);

  // 5. Extras
  const g5 = group('Anything else? (optional)', '5');
  const tAccess = toggle({ label: 'Accessibility needs', hint: 'Prefer seated areas, and show the venue’s access notes', onChange: (v) => { st.access = v; update(); } });
  const tCrowd = toggle({ label: 'Avoid dense crowds', hint: 'Favour private spaces', onChange: (v) => { st.crowd = v; update(); } });
  g5.append(tAccess.el, tCrowd.el);

  const groups = [g1, g2, g3, g4, g5];
  groups.forEach((g, i) => { g.classList.add('sf-step'); g.dataset.step = String(i + 1); });
  inputs.append(...groups);

  function paintPriorityOrder() {
    pri.el.querySelectorAll('.option-card').forEach((c) => {
      const n = st.priority.indexOf(c.dataset.value);
      c.dataset.rank = n >= 0 ? String(n + 1) : '';
      c.classList.toggle('is-full', st.priority.length === 2 && n < 0);
    });
  }

  function paintVenues() {
    const list = st.event ? stagedAt(st.event) : [];
    if (!st.event) { venueHost.innerHTML = '<p class="sf-hint">Choose the event first.</p>'; return; }
    if (!list.length) {
      venueHost.innerHTML = html`<p class="sf-hint">We do not model a venue for ${lcName(eventById(st.event).label)} in these tools. Your result shows where to look on our website.</p>`;
      st.venue = null; return;
    }
    if (!list.some((s) => s.venue === st.venue)) st.venue = list[0].venue;
    const days = daysFor(st.venue);
    if (days.length && !days.some((d) => d.id === st.day)) st.day = defaultDay(st.venue);
    if (!days.length) st.day = null;
    venueHost.innerHTML = '';
    const c = chips({
      label: 'Venue', multi: false, value: st.venue,
      options: list.map((s) => { const v = venueById(s.venue); return { value: v.id, label: `${v.name}, ${v.city}`, icon: v.icon }; }),
      onChange: (v) => { st.venue = v; st.day = null; paintVenues(); update(); },
    });
    c.el.classList.add('sf-venue-chips');
    venueHost.append(c.el);
    if (days.length) {
      const seg = segmented({ label: 'Raceday', options: days.map((d) => ({ value: d.id, label: d.label })), value: st.day, onChange: (d) => { st.day = d; update(); } });
      venueHost.append(el('<p class="sf-hint sf-hint--tight">Raceday: products and their names change between them.</p>'), seg.el);
    }
    const s = stagingFor(st.event, st.venue);
    if (s?.closest) venueHost.append(el(html`<p class="sf-hint">Our seat view shows ${lcName(eventById(st.event).label)} with the ${s.mode === 'orchestra' ? 'concert hall' : 'concert'} stage, the nearest layout we model.</p>`));
  }

  /* ---------- Ranking ---------- */

  // Numbers for a seat in the middle of the product's first place. Where the seat map has a
  // numbered seat there, the numbers are for that exact seat, the one the viewer opens.
  function numbersFor(a, mode) {
    if (!geo) return null;
    const spec0 = geo.layouts.seatSpec(st.venue, mode, a.id, { place: a.places?.[0]?.id, row: 'middle', pos: 50 });
    if (!spec0) return null;
    let spec = spec0; let ref = null; let words = null;
    try {
      const M = geo.seatplan.seatMap(st.venue, mode, st.day);
      if (M && M.seats.n) {
        const k = geo.seatplan.nearestSeat(M, spec0.position[0], null, spec0.position[2], spec0.tier?.id || null);
        if (k >= 0 && M.areas[M.seats.area[k]]?.id === a.id) {
          spec = geo.seatplan.specForSeat(M, k) || spec0;
          ref = geo.seatplan.seatRef(M, k);
          words = geo.seatplan.seatWords(M, k);
        }
      }
    } catch (err) { console.error('[seat-finder] seat lookup failed', err); }
    const n = geo.layouts.seatNumbers(spec);
    return n ? { ...n, spec, ref, words } : null;
  }

  function rank() {
    const s = stagingFor(st.event, st.venue);
    if (!s) return [];
    const list = productsFor(st.event, st.venue, st.day).map((a) => ({ a, f: featuresOf(a, st.day), n: numbersFor(a, s.mode), mode: s.mode }));
    const withN = list.filter((r) => r.n);
    const norm = (key, dir) => {
      const vals = withN.map((r) => r.n[key]);
      const lo = Math.min(...vals); const hi = Math.max(...vals);
      return (r) => (!r.n || hi - lo < 1e-6 ? 0.5 : dir > 0 ? (r.n[key] - lo) / (hi - lo) : (hi - r.n[key]) / (hi - lo));
    };
    const metric = { close: norm('distance', -1), high: norm('eyeHeight', 1), central: norm('off', -1) };
    const pri = st.priority.length ? st.priority : [];
    const weights = pri.length === 2 ? [0.6, 0.4] : [1];
    list.forEach((r) => {
      let score = pri.reduce((sum, p, i) => sum + weights[i] * (metric[p] ? metric[p](r) : r.f[p] ? 1 : 0), 0);
      if (st.group === 'clients') score += (r.f.private ? 0.15 : 0) + (r.f.dining ? 0.1 : 0);
      if (st.group === 'team') score += (r.f.lounge || r.f.dining ? 0.1 : 0);
      if (st.group === 'family' || st.group === 'couple') score += (r.f.padded ? 0.05 : 0) - (r.f.standing ? 0.3 : 0);
      if (st.access) score -= r.f.standing ? 0.5 : 0;
      if (st.crowd) score += r.f.private ? 0.2 : 0;
      r.score = score;
    });
    return list.sort((x, y) => y.score - x.score || (x.n?.distance ?? 999) - (y.n?.distance ?? 999));
  }

  /* ---------- Words: every reason is a labelled fact ---------- */

  const name = (a) => siteProductName(st.venue, a.id) || areaName(a, stagingFor(st.event, st.venue)?.mode, st.day);
  const srcOf = (a) => sourceWords(a.src?.[0]);

  function reasons(r, list) {
    const out = [];
    const { a, f, n } = r;
    const others = list.filter((x) => x.n && x !== r);
    st.priority.forEach((p) => {
      if (p === 'close' && n) {
        const closer = others.filter((x) => x.n.distance < n.distance).length;
        out.push({ text: `About ${Math.round(n.distance)} m from ${n.poiLabel}${closer === 0 && others.length ? ', the closest of the products here' : ''}`, status: 'modelled' });
      } else if (p === 'high' && n) {
        out.push({ text: `Eyes about ${n.eyeHeight.toFixed(1)} m above ${n.floorWord || 'the action'}, looking down about ${Math.max(0, Math.round(n.down))}°`, status: 'modelled' });
      } else if (p === 'central' && n) {
        out.push({ text: `About ${Math.round(n.off)}° round from ${n.offLabel}`, status: 'modelled' });
      } else if (f[p]) {
        // Only the chosen priority is read: the other features can be null.
        const words = p === 'dining' || p === 'drinks' ? `Includes ${String(f[p]).toLowerCase()}` : String(f[p]);
        out.push({ text: words, status: 'stated', source: srcOf(a) });
      }
    });
    if (st.group === 'clients' && f.private && !st.priority.includes('private')) out.push({ text: `${f.private}, so your group has its own space`, status: 'stated', source: srcOf(a) });
    if ((st.access || st.group === 'family') && !f.standing) out.push({ text: a.seatType, status: 'stated', source: srcOf(a) });
    return out.slice(0, 5);
  }

  function caveats(r) {
    const out = [];
    const { a, f } = r;
    st.priority.forEach((p) => {
      if (!['close', 'high', 'central'].includes(p) && !f[p]) out.push(`The venue does not list ${PRIORITY_LABEL[p].toLowerCase().replace(/^an? /, '')} for this product.`);
    });
    if (f.standing) out.push(`${a.seatType}: not a fixed seat for the whole event.`);
    if (a.modelled) out.push(`Where it sits in our model: ${a.modelled}`);
    if (st.access) out.push('Access differs by layout, so tell a specialist what you need and they will confirm the route and seats.');
    return out;
  }

  /* ---------- Results ---------- */

  const live = el('<p class="visually-hidden" aria-live="polite"></p>');
  const empty = el('<div class="empty-state sf-empty"></div>');
  const card = el('<div class="card result-card sf-result" hidden></div>');
  results.append(live, empty, card);

  const bar = actionBar({ onBrief: () => addToBrief(), onShare: () => shareResult(), onEnquire: () => enquire(), extra: [{ label: 'Start again', icon: 'rotate', cls: 'btn--ghost', run: () => resetAll() }] });
  bar.el.classList.add('sf-actions');

  let current = null;
  let lastKey = '';
  let liveTimer = null;

  const params = () => ({
    event: st.event, venue: st.venue, day: st.day && st.day !== defaultDay(st.venue) ? st.day : null,
    priority: st.priority, group: st.group, access: st.access ? 1 : null, crowd: st.crowd ? 1 : null,
  });

  function paintProgress() {
    const done = [!!st.event, !!st.venue || (st.event && !stagedAt(st.event).length), st.priority.length > 0, !!st.group, st.access || st.crowd];
    const answered = done.slice(0, 4).filter(Boolean).length;
    progress.querySelector('.sf-progress__bar span').style.setProperty('--p', String(answered / 4));
    progress.querySelector('.sf-progress__text').textContent = answered === 4 ? 'All four key questions answered' : `${answered} of 4 key questions answered`;
    const next = done.findIndex((d, i) => !d && i < 4);
    groups.forEach((g, i) => {
      g.classList.toggle('is-done', !!done[i]);
      g.classList.toggle('is-next', i === next);
      const step = g.querySelector('.step');
      if (step) step.innerHTML = done[i] && i < 4 ? icon('check') : String(i + 1);
    });
  }

  function paintEmpty() {
    const need = [[!!st.event, 'Choose the kind of event'], [!!st.venue, 'Choose the venue'], [st.priority.length > 0, 'Pick what matters most'], [!!st.group, 'Say who is going (optional for a first look)']];
    empty.innerHTML = html`<div class="sf-empty__inner">
      <span class="sf-empty__icon">${raw(icon('pin'))}</span>
      <h3>Your recommendation appears here</h3>
      <p>Choose the event, the venue and one thing that matters for a first look. Each extra answer sharpens it.</p>
      <ul class="sf-empty__list">${raw(need.map(([ok, t]) => html`<li class="${ok ? 'is-ok' : ''}">${raw(icon(ok ? 'check' : 'chevron-right'))}<span>${t}</span></li>`).join(''))}</ul>
    </div>`;
  }

  const reasonLi = (x) => html`<li>${raw(icon('check'))}<span>${x.text} ${raw(tag(x.status))}${raw(x.source ? html` <span class="sf-src">Source: ${x.source}.</span>` : '')}</span></li>`;

  // The viewer opens on the exact seat the numbers are for, where the seat map has one.
  function viewerParams(r) {
    const p = { venue: st.venue, area: r.a.id, mode: r.mode, day: st.day, place: r.a.places?.[0]?.id };
    if (r.n?.ref) Object.assign(p, { block: r.n.ref.block, row: r.n.ref.row, seat: r.n.ref.seat, words: r.n.words });
    return p;
  }

  function generic(ev) {
    const links = eventLinks(ev.id, { tool: TOOL });
    const events = upcomingEvents({ eventType: ev.id }).map((pth) => linkInfo(pth, { tool: TOOL, outcome: `dated-${pth.split('/').pop()}` })).filter(Boolean);
    card.innerHTML = html`<div class="sf-result__top sf-result__top--plain">
        <div class="sf-result__title">
          <p class="eyebrow">${raw(icon('map'))} Where to look</p>
          <h3>${ev.label}</h3>
          <p class="sf-result__reason">We do not model a venue for ${lcName(ev.label)} in these tools, so we cannot name a product or show a seat view. Our website lists what we offer.</p>
          <div class="sf-result__badges"><span class="badge badge--gold">${CATEGORY_LABEL[ev.category]}</span></div>
        </div>
      </div>
      <div class="sf-result__body">
        <div class="sf-links">${raw(links.map((l, i) => outLinkHtml(l, { cls: `btn ${i === 0 ? 'btn--ink' : 'btn--ghost'} btn--sm`, iconSvg: icon('external') })).join(''))}</div>
        ${raw(events.length ? html`<h4 class="sf-sub">Dated events on our website</h4><ul class="sf-dated">${raw(events.map((l) => html`<li>${raw(outLinkHtml(l, { cls: 'sf-dated__link', iconSvg: icon('calendar') }))}</li>`).join(''))}</ul>` : '')}
      </div>`;
    card.append(bar.el);
    current = { generic: true, ev, links };
  }

  function update({ write = true } = {}) {
    paintProgress();
    const ev = eventById(st.event);
    const ready = ev && (st.venue ? st.priority.length > 0 : !stagedAt(st.event).length);
    empty.hidden = !!ready;
    card.hidden = !ready;
    if (write) ctx.setParams(params());
    if (!ready) { paintEmpty(); current = null; lastKey = ''; return; }
    if (!st.venue) { generic(ev); return; }
    if (!geo) {
      card.innerHTML = '<div class="sf-loading" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>';
      loadGeo();
      return;
    }
    const list = rank();
    if (!list.length) { generic(ev); return; }
    const best = list[0];
    const runners = list.slice(1, 3);
    const v = venueById(st.venue);
    const w = whereFor(best.a, st.day);
    const where = [w.enclosure, w.stand, w.level, w.block, w.side].filter(Boolean).join(', ');
    const D = SEATMAPS[st.venue]?.products?.[best.a.id];
    const vp = viewerParams(best);
    const site = productLink(st.venue, best.a.id, { mode: best.mode, day: st.day, tool: TOOL, name: name(best.a) });
    const events = upcomingEvents({ venue: st.venue, eventType: st.event, day: st.day }).map((pth) => linkInfo(pth, { tool: TOOL, outcome: `dated-${pth.split('/').pop()}` })).filter(Boolean);
    const n = best.n;
    current = { best, runners, ev, v, vp, site };

    const key = `${st.event}:${st.venue}:${st.day}:${best.a.id}`;
    const changed = key !== lastKey; lastKey = key;
    card.innerHTML = html`
      <div class="sf-result__top sf-result__top--plain">
        <div class="sf-result__title">
          <p class="eyebrow">${raw(icon('sparkle'))} Recommended for you</p>
          <h3 data-name>${name(best.a)}</h3>
          <p class="sf-result__reason">${v.name}${where ? `, ${where}` : ''}.</p>
          <div class="sf-result__badges"><span class="badge badge--gold">${ev.label}</span><span class="badge sf-badge-ink">${v.name}</span>${raw(st.day ? html`<span class="badge sf-badge-ink">${dayLabel(st.venue, st.day)}</span>` : '')}</div>
        </div>
      </div>
      <div class="sf-result__body">
        ${raw(best.a.view ? html`<p class="sf-result__blurb">“${best.a.view}” ${raw(tag('stated'))} <span class="sf-src">The venue’s own words.</span></p>` : '')}
        <div class="sf-cols">
          <div>
            <h4 class="sf-sub">Why this fits</h4>
            <ul class="tick-list">${raw((reasons(best, list).length ? reasons(best, list) : [{ text: 'The best match for your answers among the products here', status: 'modelled' }]).map(reasonLi).join(''))}</ul>
          </div>
          <div>
            <h4 class="sf-sub">From our 3D model</h4>
            ${raw(n ? html`<dl class="sf-nums">
              <div><dt>Distance to ${n.poiLabel}</dt><dd>${Math.round(n.distance)} m</dd></div>
              <div><dt>Eyes above ${n.floorWord || 'the action'}</dt><dd>${n.eyeHeight.toFixed(1)} m</dd></div>
              <div><dt>Looking down</dt><dd>${Math.max(0, Math.round(n.down))}°</dd></div>
              <div><dt>Round from ${n.offLabel}</dt><dd>${Math.round(n.off)}°</dd></div>
            </dl><p class="sf-src">All modelled, ${vp.words ? html`for ${vp.words}` : 'for a seat in the middle of this area'}. Our model, not a survey.</p>` : '<p class="muted">No seat figures for this area.</p>')}
          </div>
        </div>
        <div class="sf-facts">
          <p><strong>Seat type:</strong> ${best.a.seatType} ${raw(tag('stated'))}</p>
          ${raw(D ? html`<p><strong>Where the seats are:</strong> ${D.words} ${raw(tag(D.status === 'measured' ? 'measured' : 'stated'))} <span class="sf-src">Source: ${D.source}.</span></p>` : '')}
          ${raw(best.f.inc.length ? html`<p><strong>Listed by the venue:</strong> ${best.f.inc.join(', ')}.</p>` : '')}
        </div>
        ${raw(caveats(best).length ? html`<div class="callout sf-trade">${raw(icon('info'))}<div><strong>Worth knowing</strong><ul>${raw(caveats(best).map((t) => html`<li>${t}</li>`).join(''))}</ul></div></div>` : '')}
        ${raw(runners.length ? html`<div class="sf-runners"><h4 class="sf-sub">Also consider</h4>${raw(runners.map((r) => html`<div class="sf-runner__inner">
          <div><p class="sf-runner__name">${name(r.a)}</p><p class="sf-runner__hint">${runnerHint(r, best)}</p></div>
          <button type="button" class="btn btn--ghost btn--sm" data-pick="${r.a.id}">${raw(icon('eye'))}<span>See its view</span></button>
        </div>`).join(''))}</div>` : '')}
        <div class="sf-next">
          <a class="sf-next__btn sf-next__btn--ink" href="#reality-viewer" data-go="viewer">
            <span class="sf-next__icon">${raw(icon('eye'))}</span>
            <span><strong>See the view from this seat</strong><span>${vp.words ? `${vp.words}, illustrative 3D view` : `Illustrative 3D view, ${v.name}`}</span></span>${raw(icon('arrow-right', 'icon--nudge'))}</a>
          ${raw(site ? outLinkHtml(site, { cls: 'sf-next__btn sf-next__btn--site', iconSvg: html`<span class="sf-next__icon">${raw(icon('external'))}</span>`, label: site.text }) : '')}
          <button type="button" class="sf-next__btn" data-go="guide">
            <span class="sf-next__icon">${raw(icon('map'))}</span>
            <span><strong>Read the venue guide</strong><span>Seats, numbering and access at ${v.name}</span></span>${raw(icon('arrow-right', 'icon--nudge'))}</button>
          <button type="button" class="sf-next__btn" data-go="worth">
            <span class="sf-next__icon">${raw(icon('scale'))}</span>
            <span><strong>Is the upgrade worth it?</strong><span>Compare with a standard ticket, using your figures</span></span>${raw(icon('arrow-right', 'icon--nudge'))}</button>
        </div>
        ${raw(events.length ? html`<h4 class="sf-sub">Our dated events at ${v.name}</h4><ul class="sf-dated">${raw(events.map((l) => html`<li>${raw(outLinkHtml(l, { cls: 'sf-dated__link', iconSvg: icon('calendar') }))}</li>`).join(''))}</ul>` : '')}
      </div>`;
    card.append(bar.el);
    card.append(el(`<p class="fine-print sf-fine">How we chose: ${st.priority.length === 2 ? 'your first priority counts 60 per cent and your second 40 per cent' : 'your priority'}, read from what the venue lists and from our 3D model. A hospitality specialist confirms the exact seats and inclusions.</p>`));
    if (changed && !ctx.reducedMotion()) { card.classList.remove('is-new'); void card.offsetWidth; card.classList.add('is-new'); }
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = `Recommended: ${name(best.a)} at ${v.name}.`; }, 700);
  }

  function runnerHint(r, best) {
    const bits = [];
    if (r.n && best.n && r.n.distance < best.n.distance - 2) bits.push(`closer, about ${Math.round(r.n.distance)} m (modelled)`);
    if (r.n && best.n && r.n.eyeHeight > best.n.eyeHeight + 2) bits.push(`higher, eyes about ${r.n.eyeHeight.toFixed(1)} m up (modelled)`);
    ['private', 'dining', 'drinks', 'lounge', 'padded'].forEach((k) => { if (r.f[k] && !best.f[k]) bits.push({ private: 'a private space', dining: 'dining listed', drinks: 'drinks listed', lounge: 'a lounge', padded: 'padded seats' }[k]); });
    return bits.length ? `Choose it for ${listJoin(bits.slice(0, 2))}.` : r.a.seatType ? `${r.a.seatType}.` : 'A close alternative here.';
  }

  card.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick && current?.runners) {
      const r = current.runners.find((x) => x.a.id === pick.dataset.pick);
      if (r) { const p = viewerParams(r); delete p.words; ctx.navigate('reality-viewer', clean(p)); }
      return;
    }
    const go = e.target.closest('[data-go]');
    if (!go || !current || current.generic) return;
    e.preventDefault();
    if (go.dataset.go === 'viewer') { const p = { ...current.vp }; delete p.words; ctx.navigate('reality-viewer', clean(p)); }
    else if (go.dataset.go === 'guide') ctx.navigate('venue-guide', clean({ venue: st.venue, day: st.day }));
    else ctx.navigate('vip-worth', clean({ event: st.event, inc: current.best.a.inc || [] }));
  });
  const clean = (p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));

  function summaryLines() {
    if (!current) return [];
    if (current.generic) return [`Event: ${current.ev.label}`, 'No venue model in the planning tools for this event type.', current.links[0] ? `Where to look: ${current.links[0].text} (${current.links[0].path})` : null].filter(Boolean);
    const { best, runners, ev, v, vp } = current;
    return [
      `Event: ${ev.label}${st.day ? `, ${dayLabel(st.venue, st.day)}` : ''}`,
      `Venue: ${v.name}`,
      `Recommended: ${name(best.a)}`,
      vp.words ? `Example seat in our model: ${vp.words}` : null,
      st.priority.length ? `Priorities: ${st.priority.map((p) => PRIORITY_LABEL[p]).join(' and ')}` : null,
      st.group ? `Group: ${GROUP_LABEL[st.group]}` : null,
      best.f.inc.length ? `Listed by the venue: ${best.f.inc.join(', ')}` : null,
      runners.length ? `Also consider: ${runners.map((r) => name(r.a)).join(', ')}` : null,
    ].filter(Boolean);
  }

  function addToBrief() {
    if (!current) return;
    ctx.brief.add({
      tool: TOOL,
      title: current.generic ? current.ev.label : name(current.best.a),
      subtitle: current.generic ? 'Where to look on our website' : `${current.ev.label}, ${current.v.name}`,
      lines: summaryLines().slice(current.generic ? 1 : 3),
      params: { ...params(), area: current.generic ? null : current.best.a.id, mode: current.generic ? null : current.best.mode },
    });
  }

  function shareResult() {
    if (!current) return;
    ctx.share.send({ title: 'Where should I sit?', text: current.generic ? current.ev.label : `${name(current.best.a)} at ${current.v.name}`, url: ctx.shareUrl(params()) });
  }

  function enquire() {
    ctx.openEnquiry({
      tool: TOOL,
      size: null,
      summary: current ? (current.generic ? `Hospitality for ${current.lcName(ev.label)}` : `${name(current.best.a)} at ${current.v.name} for ${current.lcName(ev.label)}`) : 'Help choosing seats',
      lines: summaryLines(),
      context: current && !current.generic ? { venue: st.venue, area: current.best.a.id, mode: current.best.mode, day: st.day, event: st.event } : { event: st.event },
    });
  }

  function applyToControls() {
    const ev = eventById(st.event);
    Object.entries(catRows).forEach(([cat, c]) => c.set(ev && ev.category === cat ? ev.id : null));
    paintVenues();
    pri.set(st.priority);
    paintPriorityOrder();
    who.set(st.group);
    tAccess.set(st.access);
    tCrowd.set(st.crowd);
  }

  function resetAll() {
    Object.assign(st, fresh());
    applyToControls();
    lastKey = '';
    update();
    inputs.querySelector('.chip')?.focus();
    ctx.toast('Answers cleared');
  }

  function fromParams(p = {}) {
    const keys = ['event', 'venue', 'day', 'priority', 'group', 'access', 'crowd'];
    if (!keys.some((k) => p[k] != null && p[k] !== '')) return false;
    const next = fresh();
    if (eventById(p.event)) next.event = p.event;
    if (next.event && stagedAt(next.event).some((s) => s.venue === p.venue)) next.venue = p.venue;
    if (next.venue && daysFor(next.venue).some((d) => d.id === p.day)) next.day = p.day;
    next.priority = [...new Set(String(p.priority || '').split(',').map((v) => PRIORITY_LABEL[v] ? v : PRIORITY_ALIAS[v]).filter(Boolean))].slice(0, 2);
    if (GROUP_LABEL[p.group]) next.group = p.group;
    next.access = p.access === '1' || p.access === 'true';
    next.crowd = p.crowd === '1' || p.crowd === 'true';
    Object.assign(st, next);
    return true;
  }

  applyToControls();
  update({ write: false });

  return {
    activate(p) {
      if (fromParams(p)) applyToControls();
      update();
    },
    deactivate() { clearTimeout(liveTimer); },
    destroy() { clearTimeout(liveTimer); root.innerHTML = ''; },
  };
}

export default { mount };
