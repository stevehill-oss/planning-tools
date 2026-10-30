// Occasion Matchmaker: occasion and tastes in, ranked event types out.
// Owned by the shell agent. Rankings use indicative affinities in js/data/occasions.js.

import { segmented, chips, optionCards, stepper, actionBar, group, el, icon } from '../ui.js';
import { html, raw } from '../core.js';
import { CATEGORY_LINK_KEY } from '../data/venues.js';
import {
  PLANNABLE_EVENTS, CATEGORY_LABEL, BUDGETS, budgetLevel, OCCASIONS, LIKES, REGIONS, EVENT_PROFILES,
  areasForEvent, pickVenue, modeFor,
} from '../data/occasions.js';

const OCC_LABEL = Object.fromEntries(OCCASIONS.map((o) => [o.value, o.label]));
const OCC_PHRASE = Object.fromEntries(OCCASIONS.map((o) => [o.value, o.phrase]));
const LIKE_LABEL = Object.fromEntries(LIKES.map((l) => [l.value, l.label]));
const REGION_LABEL = Object.fromEntries(REGIONS.map((r) => [r.value, r.label]));
const SIZE_MIN = 1;
const SIZE_MAX = 60;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const listJoin = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

const PRIVATE_OCCASIONS = new Set(['clients', 'proposal', 'anniversary']);

/* ---------- Scoring ----------
   Occasion fit 40 per cent, your likes 40 per cent, group size 10 per cent,
   budget and region 5 per cent each. Mapped onto a 40 to 98 scale. */

function scoreEvent(ev, st) {
  const p = EVENT_PROFILES[ev.id];
  if (!p) return null;
  const occ = (p.occasions[st.occasion] ?? 1) / 3;
  const likeVals = st.likes.map((l) => (p.likes[l] ?? 0) / 3);
  const likes = likeVals.length ? likeVals.reduce((a, b) => a + b, 0) / likeVals.length : null;
  let groupFit = 1;
  if (st.size > 12) groupFit = p.group / 3;
  else if (st.size <= 2) groupFit = p.group <= 2 ? 1 : 0.75;
  const lvl = budgetLevel(st.budget) || 3;
  const budgetFit = lvl >= 5 ? (ev.archetypes.length ? 1 : 0.85) : lvl <= 1 ? (p.likes.dining >= 3 ? 0.7 : 1) : 1;
  const venue = ev.archetypes.length ? pickVenue(ev.archetypes[0], st.region) : null;
  const region = REGIONS.find((r) => r.value === st.region);
  const inRegion = !!(venue && region?.cities?.includes(venue.city));
  const regionFit = inRegion ? 1 : st.region === 'uk' ? 0.8 : 0.6;
  const prefers = OCCASIONS.find((o) => o.value === st.occasion)?.prefers || [];
  const implicit = prefers.length ? prefers.reduce((s, t) => s + (p.likes[t] ?? 0) / 3, 0) / prefers.length : 0.5;

  const raw01 = likes == null
    ? occ * 0.55 + implicit * 0.2 + groupFit * 0.12 + budgetFit * 0.07 + regionFit * 0.06
    : occ * 0.35 + likes * 0.35 + implicit * 0.12 + groupFit * 0.08 + budgetFit * 0.05 + regionFit * 0.05;
  return { ev, p, occ, likeVals, groupFit, inRegion, venue, match: clamp(Math.round(40 + raw01 * 58), 40, 98) };
}

function hospitalityStyle(r, st) {
  const areas = areasForEvent(r.ev.id);
  const lvl = budgetLevel(st.budget) || 3;
  const wantPrivate = PRIVATE_OCCASIONS.has(st.occasion) || lvl >= 5 || (st.size >= 6 && st.size <= 20 && lvl >= 4);
  const byTier = areas.slice().sort((a, b) => b.tier - a.tier);
  let area;
  let why;
  if (wantPrivate) {
    area = byTier[0];
    why = st.occasion === 'clients' ? 'Space to talk and a host to look after your guests.'
      : st.occasion === 'proposal' ? 'Privacy for the moment that matters.'
        : 'Your own space makes the day feel like an occasion.';
  } else if (st.size > 12 || st.occasion === 'team' || st.occasion === 'stag-hen') {
    area = byTier.find((a) => a.tier === 4) || byTier[1] || byTier[0];
    why = 'Room for a bigger group to eat, talk and enjoy it together.';
  } else if (lvl <= 2) {
    area = byTier[byTier.length - 1];
    why = 'A comfortable step up from a standard ticket without the full package.';
  } else {
    area = byTier.find((a) => a.tier === 3) || byTier[1] || byTier[0];
    why = 'A great seat, with somewhere comfortable to eat and drink.';
  }
  const mode = area?.archetype ? modeFor(r.ev.id, area.archetype) : null;
  return { area, why, name: area ? (area.nameByMode?.[mode] || area.name) : 'Hospitality package', mode };
}

function whyItFits(r, st) {
  const out = [];
  const phrase = OCC_PHRASE[st.occasion];
  if (r.occ >= 1) out.push(`A natural choice for ${phrase}`);
  else if (r.occ >= 0.66) out.push(`Works well for ${phrase}`);
  const hits = st.likes.filter((l) => (r.p.likes[l] ?? 0) >= 2).map((l) => LIKE_LABEL[l].toLowerCase());
  if (hits.length) out.push(`Matches ${listJoin(hits.slice(0, 3))} from your list`);
  if (st.size > 12 && r.p.group >= 3) out.push(`Handles a large group of ${st.size} well`);
  else if (st.size <= 2 && r.p.group <= 2) out.push(st.size === 1 ? 'Easy to enjoy on your own terms' : 'Easy to make feel personal for two');
  if (r.inRegion && r.venue) out.push(`One of our example venues is in ${REGION_LABEL[st.region]}: ${r.venue.name}`);
  if (!out.length) out.push('A versatile option that suits most groups');
  return out.slice(0, 3);
}

/* ---------- Mount ---------- */

export function mount(root, ctx) {
  const fresh = () => ({ occasion: null, size: 4, budget: null, region: 'uk', likes: [] });
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

  const g2 = group('Group and budget', '2');
  const size = stepper({ label: 'How many people?', min: SIZE_MIN, max: SIZE_MAX, value: st.size, onChange: (v) => { st.size = v; update(); } });
  const sizeHint = el(`<p class="mm-hint">For groups over ${SIZE_MAX}, a specialist can plan it with you.</p>`);
  const budgetField = el('<div class="field"><span class="field__label">Budget level</span></div>');
  const budget = segmented({ label: 'Budget level', options: BUDGETS.map((b) => ({ value: b.value, label: b.label })), value: null, onChange: (v) => { st.budget = v; update(); } });
  budget.el.classList.add('mm-budget');
  budgetField.append(budget.el);
  g2.append(size.el, sizeHint, budgetField);

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

  const params = () => ({ occasion: st.occasion, size: st.size, budget: st.budget, region: st.region !== 'uk' ? st.region : null, likes: st.likes });

  function update({ write = true } = {}) {
    if (write) ctx.setParams(params());
    const ready = !!st.occasion;
    empty.hidden = ready;
    [head, list, note, bar.el].forEach((n) => { n.hidden = !ready; });
    if (!ready) { top = null; lastKey = ''; return; }

    top = PLANNABLE_EVENTS.map((ev) => scoreEvent(ev, st)).filter(Boolean)
      .sort((a, b) => b.match - a.match || a.ev.label.localeCompare(b.ev.label)).slice(0, 3);

    const who = st.size === 1 ? 'just you' : `${st.size} people`;
    head.innerHTML = html`<p class="eyebrow">${raw(icon('sparkles'))} Your top three</p>
      <h3>Best matches for ${OCC_PHRASE[st.occasion]}</h3>
      <p class="muted">${who[0].toUpperCase() + who.slice(1)}, ${REGION_LABEL[st.region]}${st.budget ? `, ${BUDGETS.find((b) => b.value === st.budget).label.toLowerCase()} budget` : ''}${st.likes.length ? `, enjoys ${listJoin(st.likes.map((l) => LIKE_LABEL[l].toLowerCase()))}` : ''}.</p>`;

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
        c.querySelector('[data-pct]').textContent = `${r.match}%`;
        c.querySelector('.mm-bar span').style.setProperty('--v', String(r.match / 100));
        c.querySelector('.mm-bar').setAttribute('aria-valuenow', String(r.match));
        ['[data-why]', '[data-style]', '[data-actions]'].forEach((s) => { c.querySelector(s).replaceWith(fresh.querySelector(s)); });
      });
    }

    const region = REGIONS.find((r) => r.value === st.region);
    note.textContent = st.region === 'europe'
      ? 'For events in Europe, a specialist can tell you what is available on your dates. Previews use our example UK venues. Match scores are indicative.'
      : region && Array.isArray(region.cities) && !region.cities.length
        ? 'Previews use our example venues, which may be outside your region. A specialist can find options nearer to you. Match scores are indicative.'
        : 'Match scores are indicative, based on your answers. Seat previews are illustrative models, not exact venue renderings.';

    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = `Top matches: ${top.map((r) => `${r.ev.label} ${r.match} per cent`).join(', ')}.`; }, 700);
  }

  function cardHtml(r, i) {
    const style = hospitalityStyle(r, st);
    const cat = r.ev.category;
    const link = ctx.links[CATEGORY_LINK_KEY[cat]];
    const arch = r.ev.archetypes[0];
    const canPreview = !!(arch && style.area && !style.area.generic);
    const venue = canPreview ? pickVenue(arch, st.region) : null;
    return html`<li class="mm-card${i === 0 ? ' mm-card--top' : ''}" style="--i:${i}" data-event="${r.ev.id}">
      <div class="mm-card__head">
        <span class="mm-card__rank" aria-hidden="true">${i + 1}</span>
        <div class="mm-card__title">
          <p class="mm-card__cat">${CATEGORY_LABEL[cat]}${raw(i === 0 ? ' <span class="badge badge--gold">Top match</span>' : '')}</p>
          <h4>${r.ev.label}</h4>
        </div>
        <span class="mm-card__pct" data-pct>${r.match}%</span>
      </div>
      <div class="mm-bar" role="meter" aria-label="Match for ${r.ev.label}, indicative" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r.match}"><span style="--v:${r.match / 100}"></span></div>
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
        <div><p class="mm-sub">Suggested hospitality style</p><p class="mm-style__name">${style.name}</p><p class="mm-style__why">${style.why}</p></div>
      </div>
      <div class="mm-card__actions" data-actions>
        ${raw(canPreview ? html`<button type="button" class="btn btn--ink btn--sm" data-preview data-venue="${venue.id}" data-area="${style.area.id}" data-mode="${style.mode}">${raw(icon('eye'))}<span>Preview the seats</span></button>` : '')}
        <a class="btn btn--ghost btn--sm" href="${link}" target="_blank" rel="noopener">${raw(icon('external'))}<span>Browse ${CATEGORY_LABEL[cat].toLowerCase()} events</span></a>
      </div>
    </li>`;
  }

  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preview]');
    if (!b) return;
    ctx.navigate('reality-viewer', { venue: b.dataset.venue, area: b.dataset.area, mode: b.dataset.mode });
  });

  function lines() {
    if (!top) return [];
    return [
      `Occasion: ${OCC_LABEL[st.occasion]}, ${st.size === 1 ? '1 person' : `${st.size} people`}`,
      `Region: ${REGION_LABEL[st.region]}${st.budget ? `, budget level: ${BUDGETS.find((b) => b.value === st.budget).label}` : ''}`,
      st.likes.length ? `Enjoys: ${st.likes.map((l) => LIKE_LABEL[l]).join(', ')}` : null,
      ...top.map((r, i) => `${i + 1}. ${r.ev.label}, ${r.match}% match (indicative), suggested: ${hospitalityStyle(r, st).name}`),
    ].filter(Boolean);
  }

  function addToBrief() {
    if (!top) return;
    ctx.brief.add({
      tool: 'occasion-matchmaker',
      title: `${OCC_LABEL[st.occasion]}: ${top[0].ev.label}`,
      subtitle: `Top match ${top[0].match}%, then ${top[1].ev.label} and ${top[2].ev.label}`,
      lines: lines(),
      params: params(),
    });
  }

  function shareResult() {
    if (!top) return;
    ctx.share.send({ title: 'Occasion Matchmaker', text: `Top match for ${OCC_PHRASE[st.occasion]}: ${top[0].ev.label}`, url: ctx.shareUrl(params()) });
  }

  function enquire() {
    ctx.openEnquiry({
      tool: 'occasion-matchmaker',
      event: top ? `${OCC_LABEL[st.occasion]}, ${top[0].ev.label.toLowerCase()} or similar` : '',
      size: st.size,
      summary: top ? `${OCC_LABEL[st.occasion]} for ${st.size === 1 ? '1 person' : `${st.size} people`}` : 'Help choosing an event',
      lines: lines(),
    });
  }

  function applyToControls() {
    occ.set(st.occasion);
    size.set(st.size);
    budget.set(st.budget);
    region.set(st.region);
    likes.set(st.likes);
  }

  function fromParams(p = {}) {
    const keys = ['occasion', 'size', 'budget', 'region', 'likes'];
    if (!keys.some((k) => p[k] != null && p[k] !== '')) return false;
    const next = fresh();
    if (OC_OK(p.occasion)) next.occasion = p.occasion;
    const n = parseInt(p.size, 10);
    if (Number.isFinite(n)) next.size = clamp(n, SIZE_MIN, SIZE_MAX);
    if (BUDGETS.some((b) => b.value === p.budget)) next.budget = p.budget;
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
