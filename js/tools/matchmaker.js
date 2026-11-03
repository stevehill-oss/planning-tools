// Occasion Matchmaker: occasion and tastes in, ranked event types out.
// Owned by the shell agent; reworked 02/11/2026. The order uses our own judgement of how
// well each kind of event suits an occasion and a group (EVENT_PROFILES in occasions.js), and
// says so on screen. No percentages. Each match names a real product at a venue that stages
// it (where one exists in these tools), a verified page on our website and a seat preview.

import { chips, optionCards, stepper, actionBar, group, el, icon } from '../ui.js';
import { html, raw } from '../core.js';
import { venueById, areaName, daysFor, defaultDay } from '../data/venues.js';
import {
  PLANNABLE_EVENTS, CATEGORY_LABEL, OCCASIONS, LIKES, REGIONS, EVENT_PROFILES,
  stagedAt, pickStaging, productsFor,
} from '../data/occasions.js';
import { eventLinks, occasionLinks, outLinkHtml, siteProductName } from '../data/prestige-links.js';

const TOOL = 'occasion-matchmaker';

const OCC_LABEL = Object.fromEntries(OCCASIONS.map((o) => [o.value, o.label]));
const OCC_PHRASE = Object.fromEntries(OCCASIONS.map((o) => [o.value, o.phrase]));
const LIKE_LABEL = Object.fromEntries(LIKES.map((l) => [l.value, l.label]));
const REGION_LABEL = Object.fromEntries(REGIONS.map((r) => [r.value, r.label]));
const SIZE_MIN = 1;
const SIZE_MAX = 60;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const listJoin = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

const PRIVATE_OCCASIONS = new Set(['clients', 'proposal', 'anniversary']);

/* ---------- Ordering ----------
   Our judgement, not a measurement: occasion fit 35 per cent, your likes 35 per cent, what
   the occasion itself tends to reward 15 per cent, group size 10 per cent and whether a venue
   in your region stages it 5 per cent. No likes ticked: the occasion carries more. */

function scoreEvent(ev, st) {
  const p = EVENT_PROFILES[ev.id];
  if (!p) return null;
  const occ = (p.occasions[st.occasion] ?? 1) / 3;
  const likeVals = st.likes.map((l) => (p.likes[l] ?? 0) / 3);
  const likes = likeVals.length ? likeVals.reduce((a, b) => a + b, 0) / likeVals.length : null;
  let groupFit = 1;
  if (st.size > 12) groupFit = p.group / 3;
  else if (st.size <= 2) groupFit = p.group <= 2 ? 1 : 0.75;
  const staging = pickStaging(ev.id, st.region);
  const venue = staging ? venueById(staging.venue) : null;
  const region = REGIONS.find((r) => r.value === st.region);
  const inRegion = !!(venue && region?.cities?.includes(venue.city));
  const regionFit = inRegion ? 1 : st.region === 'uk' ? 0.8 : 0.6;
  const prefers = OCCASIONS.find((o) => o.value === st.occasion)?.prefers || [];
  const implicit = prefers.length ? prefers.reduce((s, t) => s + (p.likes[t] ?? 0) / 3, 0) / prefers.length : 0.5;
  const score = likes == null
    ? occ * 0.58 + implicit * 0.2 + groupFit * 0.15 + regionFit * 0.07
    : occ * 0.35 + likes * 0.35 + implicit * 0.15 + groupFit * 0.1 + regionFit * 0.05;
  return { ev, p, occ, likeVals, groupFit, inRegion, venue, staging, score };
}

// A real product at the venue that stages the event, chosen from what the venue lists.
function suggestion(r, st) {
  if (!r.staging) return null;
  const day = daysFor(r.staging.venue).length ? defaultDay(r.staging.venue) : null;
  const list = productsFor(r.ev.id, r.staging.venue, day);
  if (!list.length) return null;
  const has = (a, k) => (a.inc || []).includes(k);
  const wantPrivate = PRIVATE_OCCASIONS.has(st.occasion) || (st.size >= 6 && st.size <= 20 && st.occasion === 'team');
  const big = st.size > 12 || st.occasion === 'team' || st.occasion === 'stag-hen';
  let area; let why;
  if (wantPrivate && (area = list.find((a) => has(a, 'private') && /suite|box|booth/i.test(a.seatType || '')))) {
    why = `${area.seatType}, so your group has its own space.`;
  } else if (big && (area = list.find((a) => has(a, 'lounge') && has(a, 'dining')))) {
    why = 'A lounge with dining listed, so a bigger group can eat and talk together.';
  } else if ((area = list.find((a) => has(a, 'dining')) || list[0])) {
    why = has(area, 'dining') ? 'Dining is listed by the venue, with seats for the action.' : `${area.seatType}.`;
  }
  return { area, why, day, name: siteProductName(r.staging.venue, area.id) || areaName(area, r.staging.mode, day) };
}

function whyItFits(r, st) {
  const out = [];
  const phrase = OCC_PHRASE[st.occasion];
  if (r.occ >= 1) out.push(`A natural choice for ${phrase}`);
  else if (r.occ >= 0.66) out.push(`Works well for ${phrase}`);
  const hits = st.likes.filter((l) => (r.p.likes[l] ?? 0) >= 2).map((l) => LIKE_LABEL[l].toLowerCase());
  if (hits.length) out.push(`Matches ${listJoin(hits.slice(0, 3))} from your list`);
  if (st.size > 12 && r.p.group >= 3) out.push(`Suits a large group of ${st.size}`);
  else if (st.size <= 2 && r.p.group <= 2) out.push(st.size === 1 ? 'Easy to enjoy on your own terms' : 'Easy to make feel personal for two');
  if (r.inRegion && r.venue) out.push(`Staged at ${r.venue.name}, in ${REGION_LABEL[st.region]}`);
  if (!out.length) out.push('A versatile option that suits most groups');
  return out.slice(0, 3);
}

/* ---------- Mount ---------- */

export function mount(root, ctx) {
  const fresh = () => ({ occasion: null, size: 4, region: 'uk', likes: [] });
  const st = fresh();

  root.innerHTML = '';
  const wrap = el('<div class="tool mm"></div>');
  const inputs = el('<div class="tool__inputs mm-inputs"></div>');
  const results = el('<div class="tool__results mm-results"></div>');
  wrap.append(inputs, results);
  root.append(wrap);

  inputs.append(el(html`<header class="tool__head">
    <p class="eyebrow">${raw(icon('heart'))} Occasion Matchmaker</p>
    <h2>Start with the occasion, not the event</h2>
    <p>Tell us what you are celebrating and what your group enjoys. We rank the kinds of event that fit best.</p>
  </header>`));

  const g1 = group('What is the occasion?', '1');
  const occ = optionCards({ label: 'Occasion', options: OCCASIONS, value: null, onChange: (v) => { st.occasion = v; update(); } });
  occ.el.classList.add('mm-occasions');
  g1.append(occ.el);

  const g2 = group('How many are going?', '2');
  const size = stepper({ label: 'How many people?', min: SIZE_MIN, max: SIZE_MAX, value: st.size, onChange: (v) => { st.size = v; update(); } });
  const sizeHint = el(`<p class="mm-hint">For groups over ${SIZE_MAX}, a specialist can plan it with you.</p>`);
  g2.append(size.el, sizeHint);

  const g3 = group('Where?', '3');
  const region = chips({ label: 'Region', options: REGIONS.map((r) => ({ value: r.value, label: r.label })), multi: false, value: st.region, onChange: (v) => { st.region = v; update(); } });
  g3.append(region.el);

  const g4 = group('What does your group enjoy?', '4');
  const likes = chips({ label: 'What your group enjoys', options: LIKES, multi: true, value: [], onChange: (v) => { st.likes = v; update(); } });
  g4.append(el('<p class="mm-hint">Pick as many as you like.</p>'), likes.el);

  inputs.append(g1, g2, g3, g4);

  /* ---------- Results ---------- */

  const live = el('<p class="visually-hidden" aria-live="polite"></p>');
  const head = el('<div class="mm-head"></div>');
  const empty = el('<div class="empty-state mm-empty"></div>');
  const list = el('<ol class="mm-list" aria-label="Your top three matches"></ol>');
  const note = el('<p class="fine-print mm-note"></p>');
  const bar = actionBar({
    onBrief: () => addToBrief(),
    onShare: () => shareResult(),
    onEnquire: () => enquire(),
    extra: [{ label: 'Find where to sit', icon: 'pin', cls: 'btn--ghost', run: () => top && ctx.navigate('seat-finder', { event: top[0].ev.id }) }],
  });
  results.append(live, head, empty, list, note, bar.el);

  empty.innerHTML = html`<div class="mm-empty__inner">
    <div class="mm-empty__stack" aria-hidden="true"><span></span><span></span><span></span></div>
    <h3>Choose an occasion to see your matches</h3>
    <p>Your top three kinds of event appear here, ranked, with the reasons and a suggested hospitality style.</p>
  </div>`;

  let top = null;
  let lastKey = '';
  let liveTimer = null;

  const params = () => ({ occasion: st.occasion, size: st.size, region: st.region !== 'uk' ? st.region : null, likes: st.likes });

  function update({ write = true } = {}) {
    if (write) ctx.setParams(params());
    const ready = !!st.occasion;
    empty.hidden = ready;
    [head, list, note, bar.el].forEach((n) => { n.hidden = !ready; });
    if (!ready) { top = null; lastKey = ''; return; }

    top = PLANNABLE_EVENTS.map((ev) => scoreEvent(ev, st)).filter(Boolean)
      .sort((a, b) => b.score - a.score || a.ev.label.localeCompare(b.ev.label)).slice(0, 3);

    const who = st.size === 1 ? 'just you' : `${st.size} people`;
    head.innerHTML = html`<p class="eyebrow">${raw(icon('sparkles'))} Our top three suggestions</p>
      <h3>For ${OCC_PHRASE[st.occasion]}</h3>
      <p class="muted">${who[0].toUpperCase() + who.slice(1)}, ${REGION_LABEL[st.region]}${st.likes.length ? `, enjoys ${listJoin(st.likes.map((l) => LIKE_LABEL[l].toLowerCase()))}` : ''}.</p>`;

    const key = top.map((r) => r.ev.id).join(',');
    const reorder = key !== lastKey;
    lastKey = key;

    if (reorder) {
      list.innerHTML = top.map((r, i) => cardHtml(r, i)).join('');
      if (!ctx.reducedMotion()) list.querySelectorAll('.mm-card').forEach((c) => c.classList.add('is-entering'));
    } else {
      top.forEach((r, i) => {
        const c = list.children[i];
        const fresh = el(cardHtml(r, i));
        ['[data-why]', '[data-style]', '[data-actions]'].forEach((s) => { c.querySelector(s).replaceWith(fresh.querySelector(s)); });
      });
    }

    const extra = occasionLinks(st.occasion, { tool: TOOL });
    note.innerHTML = html`This order is our own judgement from your answers, not a measurement. Seat previews are illustrative models, not exact venue renderings.${raw(extra.length ? html` Also useful: ${raw(extra.map((l) => outLinkHtml(l, { cls: 'mm-note__link' })).join(', '))}.` : '')}`;

    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = `Top suggestions: ${top.map((r) => r.ev.label).join(', ')}.`; }, 700);
  }

  function cardHtml(r, i) {
    const sug = suggestion(r, st);
    const cat = r.ev.category;
    const link = eventLinks(r.ev.id, { tool: TOOL })[0] || null;
    const venue = sug ? venueById(r.staging.venue) : null;
    const others = stagedAt(r.ev.id).filter((s) => s.venue !== r.staging?.venue).map((s) => venueById(s.venue)?.name).filter(Boolean);
    return html`<li class="mm-card${i === 0 ? ' mm-card--top' : ''}" style="--i:${i}" data-event="${r.ev.id}">
      <div class="mm-card__head">
        <span class="mm-card__rank" aria-hidden="true">${i + 1}</span>
        <div class="mm-card__title">
          <p class="mm-card__cat">${CATEGORY_LABEL[cat]}${raw(i === 0 ? ' <span class="badge badge--gold">Our first suggestion</span>' : '')}</p>
          <h4>${r.ev.label}</h4>
        </div>
      </div>
      <div class="mm-card__grid">
        <div data-why>
          <p class="mm-sub">Why it fits</p>
          <ul class="tick-list">${raw(whyItFits(r, st).map((t) => html`<li>${raw(icon('check'))}<span>${t}</span></li>`).join(''))}</ul>
        </div>
        <div>
          <p class="mm-sub">What the day feels like</p>
          <p class="mm-feel">${r.p.feel}</p>
        </div>
      </div>
      <div class="mm-style" data-style>
        <span class="mm-style__icon">${raw(icon('crown'))}</span>
        <div>${raw(sug ? html`<p class="mm-sub">A product to look at</p><p class="mm-style__name">${sug.name}, ${venue.name}</p><p class="mm-style__why">${sug.why}${others.length ? ` Also staged at ${listJoin(others)}.` : ''}</p>`
          : html`<p class="mm-sub">Where to look</p><p class="mm-style__name">${r.ev.label} on our website</p><p class="mm-style__why">We do not model a venue for this in these tools, so our website lists what we offer.</p>`)}</div>
      </div>
      <div class="mm-card__actions" data-actions>
        ${raw(sug ? html`<button type="button" class="btn btn--ink btn--sm" data-preview data-venue="${venue.id}" data-area="${sug.area.id}" data-mode="${r.staging.mode}" data-day="${sug.day || ''}">${raw(icon('eye'))}<span>Preview the seats</span></button>` : '')}
        ${raw(link ? outLinkHtml(link, { cls: 'btn btn--ghost btn--sm', iconSvg: icon('external') }) : '')}
      </div>
    </li>`;
  }

  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preview]');
    if (!b) return;
    ctx.navigate('reality-viewer', Object.fromEntries(Object.entries({ venue: b.dataset.venue, area: b.dataset.area, mode: b.dataset.mode, day: b.dataset.day }).filter(([, v]) => v)));
  });

  function lines() {
    if (!top) return [];
    return [
      `Occasion: ${OCC_LABEL[st.occasion]}, ${st.size === 1 ? '1 person' : `${st.size} people`}`,
      `Region: ${REGION_LABEL[st.region]}`,
      st.likes.length ? `Enjoys: ${st.likes.map((l) => LIKE_LABEL[l]).join(', ')}` : null,
      ...top.map((r, i) => { const s = suggestion(r, st); return `${i + 1}. ${r.ev.label}${s ? `, for example ${s.name} at ${venueById(r.staging.venue).name}` : ''}`; }),
    ].filter(Boolean);
  }

  function addToBrief() {
    if (!top) return;
    ctx.brief.add({
      tool: TOOL,
      title: `${OCC_LABEL[st.occasion]}: ${top[0].ev.label}`,
      subtitle: `Our first suggestion, then ${top[1].ev.label} and ${top[2].ev.label}`,
      lines: lines(),
      params: { ...params(), event: top[0].ev.id },
    });
  }

  function shareResult() {
    if (!top) return;
    ctx.share.send({ title: 'Occasion Matchmaker', text: `Our first suggestion for ${OCC_PHRASE[st.occasion]}: ${top[0].ev.label}`, url: ctx.shareUrl(params()) });
  }

  function enquire() {
    const s = top ? suggestion(top[0], st) : null;
    ctx.openEnquiry({
      tool: TOOL,
      size: st.size,
      summary: top ? `${OCC_LABEL[st.occasion]} for ${st.size === 1 ? '1 person' : `${st.size} people`}` : 'Help choosing an event',
      lines: lines(),
      context: top ? { event: top[0].ev.id, venue: s ? top[0].staging.venue : null, area: s ? s.area.id : null, mode: s ? top[0].staging.mode : null, day: s?.day || null } : null,
    });
  }

  function applyToControls() {
    occ.set(st.occasion);
    size.set(st.size);
    region.set(st.region);
    likes.set(st.likes);
  }

  function fromParams(p = {}) {
    const keys = ['occasion', 'size', 'region', 'likes'];
    if (!keys.some((k) => p[k] != null && p[k] !== '')) return false;
    const next = fresh();
    if (OC_OK(p.occasion)) next.occasion = p.occasion;
    const n = parseInt(p.size, 10);
    if (Number.isFinite(n)) next.size = clamp(n, SIZE_MIN, SIZE_MAX);
    if (REGION_LABEL[p.region]) next.region = p.region;
    next.likes = String(p.likes || '').split(',').filter((l) => LIKE_LABEL[l]);
    Object.assign(st, next);
    return true;
  }
  const OC_OK = (v) => !!OCC_LABEL[v];

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
