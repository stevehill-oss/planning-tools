// Is Hospitality Worth It? Standard ticket versus hospitality package value.
// Owned by the calculator agent.
//
// How the maths works (all figures come from the user):
// - Standard ticket is entered per person. The package is entered either per person or as
//   a total for the group. Everything is converted to one group total first, and every
//   per-person figure is that total divided by the number of guests, so per-person and
//   group figures always reconcile (the original showed a £150 total beside £75 each).
// - Extra you pay = package total minus standard total.
// - Value of inclusions = the sum of what each ticked inclusion is worth to the user, per
//   person. The starting amounts are example assumptions the user can change, never
//   benchmarks or prices.
// - Verdict: coverage = value of inclusions divided by the extra you pay.
//   100 per cent or more: Worth it. 75 to 99 per cent: Close call. Under 75: Probably not.
//   Time, comfort and impression are noted in words and never priced.

import { select, optionCards, segmented, stepper, moneyInput, actionBar, animateNumber, ring, group, el, icon } from '../ui.js';
import { html, raw, fmt, clamp } from '../core.js';
import { EVENT_TYPES } from '../data/venues.js';

const EVENTS = EVENT_TYPES.filter((e) => e.id !== 'golf');
const eventLabel = (id) => EVENTS.find((e) => e.id === id)?.label || '';

const BUYERS = [
  { value: 'treat', label: 'Personal treat', icon: 'star', desc: 'For you, or you and a friend' },
  { value: 'celebration', label: 'Celebration', icon: 'gift', desc: 'A birthday or big moment' },
  { value: 'clients', label: 'Client entertaining', icon: 'briefcase', desc: 'Hosting for business' },
  { value: 'staff', label: 'Staff reward', icon: 'trophy', desc: 'Thanking a team' },
];
const BUYER_ALIAS = { corporate: 'clients', client: 'clients', business: 'clients', personal: 'treat', team: 'staff' };

// Example "worth to me" amounts per person. Illustrative assumptions only, always editable.
const INCLUSIONS = [
  { id: 'seat', label: 'Premium seat or view', icon: 'eye', worth: 40 },
  { id: 'lounge', label: 'Lounge access', icon: 'hall', worth: 25 },
  { id: 'dining', label: 'Dining', icon: 'utensils', worth: 55 },
  { id: 'drinks', label: 'Drinks', icon: 'glass', worth: 35 },
  { id: 'private', label: 'Private table or box', icon: 'crown', worth: 45 },
  { id: 'fast-track', label: 'Fast-track entry', icon: 'zap', worth: 10 },
  { id: 'host', label: 'Dedicated host', icon: 'users', worth: 15 },
  { id: 'parking', label: 'Parking', icon: 'pin', worth: 15 },
  { id: 'gift', label: 'Programme or gift', icon: 'gift', worth: 10 },
  { id: 'meet', label: 'Meet and greet', icon: 'handshake', worth: 50 },
];
const INC = Object.fromEntries(INCLUSIONS.map((i) => [i.id, i]));

// Inclusion ids other tools send (slugs of the seating-area inclusion names) mapped onto ours.
const INC_ALIAS = {
  'premium-seats': ['seat'], 'padded-seats': ['seat'], 'balcony-seats': ['seat'], 'pitchside-seats': ['seat'],
  'private-seats': ['seat'], 'reserved-seats': ['seat'], 'terrace-seats': ['seat'], balcony: ['seat'],
  'closest-access': ['seat'], 'premium-seat': ['seat'],
  'lounge-access': ['lounge'], 'club-lounge': ['lounge'], 'enclosure-access': ['lounge'],
  'lounge-dining': ['lounge', 'dining'], 'private-dining': ['dining', 'private'], 'private-catering': ['dining', 'private'],
  'fine-dining': ['dining'], 'in-box-dining-options': ['dining'], 'pre-show-dining-options': ['dining'],
  'private-bar': ['drinks', 'private'], 'interval-drinks': ['drinks'], 'interval-drinks-options': ['drinks'],
  'private-box': ['private'], 'reserved-table': ['private'],
  'fast-track-entry': ['fast-track'], 'early-entry': ['fast-track'], fasttrack: ['fast-track'],
  'dedicated-host': ['host'], 'matchday-programme': ['gift'], programme: ['gift'], 'meet-and-greet': ['meet'],
};
function mapInclusions(list) {
  const out = new Set();
  list.forEach((raw0) => {
    const id = String(raw0).trim().toLowerCase();
    if (INC[id]) out.add(id);
    else (INC_ALIAS[id] || []).forEach((m) => out.add(m));
  });
  return INCLUSIONS.map((i) => i.id).filter((id) => out.has(id));
}

const MAX_MONEY = 1000000;
const GUESTS_MIN = 1;
const GUESTS_MAX = 50;

const gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Whole pounds when the figure is whole, pence when it is not, so totals visibly reconcile.
function money(n) {
  if (!Number.isFinite(n)) return '£0';
  const r = Math.round(n * 100) / 100;
  return Math.abs(r - Math.round(r)) < 0.001 ? fmt.gbp(r) : gbp2.format(r);
}
const signed = (n) => (n > 0.004 ? `+${money(n)}` : n < -0.004 ? `-${money(-n)}` : money(0));
// Count-up format: whole pounds while moving, exact on the final frame.
const countFmt = (to, f = money) => (v) => f(Math.abs(v - to) < 1e-9 ? to : Math.round(v));
const listJoin = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const capMoney = (n) => (n == null || !Number.isFinite(n) ? null : clamp(n, 0, MAX_MONEY));

const EXAMPLE = {
  event: 'football', buyer: 'celebration', std: 85, pkg: 240, basis: 'pp', guests: 2,
  inc: ['seat', 'lounge', 'dining', 'drinks', 'fast-track', 'gift'],
};

const VERDICT = {
  yes: { title: 'Worth it', badge: 'badge--ok', icon: 'check', tone: 'yes' },
  close: { title: 'Close call', badge: 'badge--warn', icon: 'scale', tone: 'close' },
  no: { title: 'Probably not', badge: 'badge--bad', icon: 'info', tone: 'no' },
  pending: { title: 'Tick what is included', badge: '', icon: 'sparkle', tone: 'pending' },
};

/* ---------- Pure calculation ---------- */

export function compute(st) {
  const g = clamp(Math.round(st.guests) || 1, GUESTS_MIN, GUESTS_MAX);
  const std = capMoney(st.std);
  const pkg = capMoney(st.pkg);
  if (std == null || pkg == null || pkg <= 0) return null;
  const stdTotal = std * g;
  const pkgTotal = st.basis === 'pp' ? pkg * g : pkg;
  const pkgPP = pkgTotal / g;
  const extraTotal = pkgTotal - stdTotal;
  const extraPP = extraTotal / g;
  const items = st.inc.map((id) => ({ ...INC[id], value: worthOf(st, id), custom: st.worth[id] != null }));
  const valuePP = items.reduce((s, i) => s + i.value, 0);
  const valueTotal = valuePP * g;
  const netTotal = valueTotal - extraTotal;
  const netPP = netTotal / g;
  let coverage = null;
  let verdict;
  if (extraTotal <= 0) { verdict = 'yes'; coverage = null; }
  else if (!items.length) { verdict = 'pending'; coverage = 0; }
  else {
    coverage = valuePP / extraPP;
    verdict = coverage >= 1 ? 'yes' : coverage >= 0.75 ? 'close' : 'no';
  }
  return { g, std, stdTotal, pkgPP, pkgTotal, extraPP, extraTotal, items, valuePP, valueTotal, netPP, netTotal, coverage, verdict };
}

function worthOf(st, id) {
  const w = st.worth[id];
  return w != null && Number.isFinite(w) ? clamp(w, 0, MAX_MONEY) : INC[id].worth;
}

/* ---------- Chart: three stacked bars, hand-built SVG ---------- */

const SERIES = {
  ticket: { label: 'Standard ticket', cls: 'vw-s-ticket' },
  extra: { label: 'Extra you pay for hospitality', cls: 'vw-s-extra' },
  value: { label: 'What the inclusions are worth to you', cls: 'vw-s-value' },
};

function roundedEnd(x, y, w, h, r) {
  if (w <= 0) return '';
  const rr = Math.min(r, w, h / 2);
  return `M${x} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h - rr}Q${x + w} ${y + h} ${x + w - rr} ${y + h}H${x}Z`;
}
const flatRect = (x, y, w, h) => (w <= 0 ? '' : `M${x} ${y}H${x + w}V${y + h}H${x}Z`);

function chartRows(r, scale) {
  const k = scale;
  const ticketInPkg = Math.min(r.std, r.pkgPP);
  return [
    { label: 'Standard ticket', segs: [{ s: 'ticket', v: r.std * k }] },
    { label: 'Hospitality package', segs: [{ s: 'ticket', v: ticketInPkg * k }, { s: 'extra', v: Math.max(0, r.extraPP) * k }] },
    { label: 'Standard ticket plus what the inclusions are worth', segs: [{ s: 'ticket', v: r.std * k }, { s: 'value', v: r.valuePP * k }] },
  ];
}

/* ---------- Mount ---------- */

export function mount(root, ctx) {
  const fresh = () => ({ event: null, buyer: null, std: null, pkg: null, basis: 'total', guests: 2, inc: [], worth: {}, example: false });
  const st = fresh();
  let chartScale = 'pp';

  root.innerHTML = '';
  const wrap = el('<div class="tool vw"></div>');
  const inputs = el('<div class="tool__inputs vw-inputs"></div>');
  const results = el('<div class="tool__results tool__results--sticky vw-results"></div>');
  wrap.append(inputs, results);
  root.append(wrap);

  inputs.append(el(html`<header class="tool__head">
    <p class="eyebrow">${raw(icon('scale'))} Is Hospitality Worth It?</p>
    <h2>Weigh up the upgrade with your own numbers</h2>
    <p>Put a standard ticket beside a hospitality package, tick what the package includes and say what each part is worth to you. You get a straight answer, per person and for the whole group.</p>
  </header>`));

  const exampleBar = el(html`<div class="vw-example">
    <button type="button" class="btn btn--ghost btn--sm" data-example>${raw(icon('sparkles'))}<span>Try example figures</span></button>
    <button type="button" class="btn btn--ghost btn--sm vw-clear" data-clear hidden>${raw(icon('rotate'))}<span>Start again</span></button>
    <p class="fine-print">Example figures are illustrative only, not prices or quotes.</p>
  </div>`);
  inputs.append(exampleBar);

  // 1. The occasion
  const g1 = group('The occasion', '1');
  const eventSel = select({
    label: 'Event type', placeholder: 'Choose an event type (optional)',
    options: EVENTS.map((e) => ({ value: e.id, label: e.label })),
    value: null, onChange: (v) => { st.event = v; update(); },
  });
  const buyerField = el('<div class="field"><span class="field__label">Who is it for?</span></div>');
  const buyer = optionCards({ label: 'Who is it for?', options: BUYERS, value: null, onChange: (v) => { st.buyer = v; update(); } });
  buyer.el.classList.add('vw-buyers');
  buyerField.append(buyer.el);
  g1.append(eventSel.el, buyerField);

  // 2. Prices
  const g2 = group('Prices you have been quoted', '2');
  const guests = stepper({ label: 'Guests', min: GUESTS_MIN, max: GUESTS_MAX, value: st.guests, onChange: (v) => { st.guests = v; update(); } });
  const std = moneyInput({ label: 'Standard ticket, per person', placeholder: 'For example 85', onChange: (v) => { st.std = v; st.example = false; update(); } });
  const stdRecon = el('<p class="vw-recon" aria-live="polite"></p>');
  std.el.append(stdRecon);
  const basisField = el('<div class="field"><span class="field__label">How is the package priced?</span></div>');
  const basis = segmented({
    label: 'How is the package priced?', block: true,
    options: [{ value: 'total', label: 'Group total' }, { value: 'pp', label: 'Per person' }],
    value: st.basis,
    onChange: (v) => { convertBasis(v); update(); },
  });
  basisField.append(basis.el);
  const pkg = moneyInput({ label: 'Hospitality package, total for the group', placeholder: 'For example 480', onChange: (v) => { st.pkg = v; st.example = false; update(); } });
  const pkgLabel = pkg.el.querySelector('.field__label');
  const pkgRecon = el('<p class="vw-recon" aria-live="polite"></p>');
  pkg.el.append(pkgRecon);
  const priceRow = el('<div class="vw-price-row"></div>');
  priceRow.append(std.el, guests.el);
  g2.append(priceRow, basisField, pkg.el);

  // 3. Inclusions
  const g3 = group('What the package includes', '3');
  const inc = optionCards({
    label: 'What the package includes', multi: true, value: [],
    options: INCLUSIONS.map((i) => ({ value: i.id, label: i.label, icon: i.icon, desc: ' ' })),
    onChange: (v) => { st.inc = INCLUSIONS.map((i) => i.id).filter((id) => v.includes(id)); update(); },
  });
  inc.el.classList.add('vw-incs');
  const assume = el(html`<details class="vw-assume">
    <summary><span>${raw(icon('sliders'))} Your assumptions: what each inclusion is worth to you</span>${raw(icon('chevron-down', 'vw-assume__chev'))}</summary>
    <div class="vw-assume__body">
      <p class="vw-assume__note">${raw(icon('info'))}<span>The starting amounts are <strong>example assumptions</strong> to get you going. They are not benchmarks or prices. Change any of them to what that part of the day is worth to you, per person.</span></p>
      <div class="vw-assume__grid"></div>
      <button type="button" class="btn btn--ghost btn--sm" data-reset-worth>${raw(icon('rotate'))}<span>Reset all to the examples</span></button>
    </div>
  </details>`);
  const assumeGrid = assume.querySelector('.vw-assume__grid');
  const worthInputs = {};
  INCLUSIONS.forEach((i) => {
    const cell = el(html`<div class="vw-worth" data-id="${i.id}"></div>`);
    const mi = moneyInput({
      label: i.label, value: i.worth,
      onChange: (v) => { st.worth[i.id] = v == null ? 0 : v; update(); },
    });
    const tag = el('<span class="vw-worth__tag"></span>');
    mi.el.querySelector('.field__label').append(tag);
    cell.append(mi.el);
    assumeGrid.append(cell);
    worthInputs[i.id] = { mi, tag, cell };
  });
  g3.append(el('<p class="vw-hint">Tick everything the package includes. Each one carries a "worth to me" amount you can change below.</p>'), inc.el, assume);

  inputs.append(g1, g2, g3);

  /* ---------- Results ---------- */

  const live = el('<p class="visually-hidden" aria-live="polite"></p>');
  const empty = el('<div class="empty-state vw-empty"></div>');
  const out = el('<div class="vw-out"></div>');
  results.append(live, empty, out);

  empty.innerHTML = html`<div class="vw-empty__inner">
    <div class="vw-empty__icon">${raw(icon('scale'))}</div>
    <h3>Your verdict appears here</h3>
    <p>Add the two prices and tick what the package includes. We compare them per person and for your whole group.</p>
    <ul class="vw-empty__list">
      <li data-need="std">${raw(icon('ticket'))}<span>Standard ticket price per person</span></li>
      <li data-need="pkg">${raw(icon('crown'))}<span>Hospitality package price</span></li>
      <li data-need="inc">${raw(icon('check'))}<span>What the package includes</span></li>
    </ul>
    <button type="button" class="btn btn--ink" data-example>${raw(icon('sparkles'))}<span>Try example figures</span></button>
    <p class="fine-print">Example figures are illustrative, not prices or quotes.</p>
  </div>`;

  out.innerHTML = html`
    <p class="vw-example-note" hidden>${raw(icon('info'))}<span><strong>Example figures.</strong> These are illustrative values to show how the tool works, not prices or quotes. Replace them with the prices you have been given.</span></p>
    <article class="card result-card vw-verdict">
      <div class="vw-verdict__top">
        <div class="vw-ring">${raw(ring(0, 100, { size: 132, stroke: 10, caption: 'covered' }))}</div>
        <div class="vw-verdict__text">
          <p class="eyebrow">${raw(icon('scale'))} <span data-v-eyebrow>Your verdict</span></p>
          <h3 data-v-title>Worth it</h3>
          <p class="vw-verdict__why" data-v-why></p>
          <div class="vw-verdict__badges" data-v-badges></div>
        </div>
      </div>
      <div class="vw-stats">
        <div class="vw-stat"><span class="vw-stat__label">Extra you pay</span><span class="vw-stat__value" data-s="extra">£0</span><span class="vw-stat__sub" data-s="extra-sub"></span></div>
        <div class="vw-stat"><span class="vw-stat__label">Inclusions worth to you</span><span class="vw-stat__value" data-s="value">£0</span><span class="vw-stat__sub" data-s="value-sub"></span></div>
        <div class="vw-stat"><span class="vw-stat__label">Net difference</span><span class="vw-stat__value" data-s="net">£0</span><span class="vw-stat__sub" data-s="net-sub"></span></div>
      </div>
    </article>
    <div class="callout vw-hint-card" data-hint hidden></div>
    <section class="card vw-chart-card" aria-labelledby="vw-chart-title">
      <div class="vw-chart-card__head">
        <div>
          <h4 id="vw-chart-title">How the money stacks up</h4>
          <p class="muted" data-chart-sub>Per person</p>
        </div>
        <div data-chart-scale></div>
      </div>
      <ul class="vw-legend" aria-hidden="true">
        <li><i class="vw-s-ticket"></i>Standard ticket</li>
        <li><i class="vw-s-extra"></i>Extra you pay</li>
        <li><i class="vw-s-value"></i>What the inclusions are worth to you</li>
      </ul>
      <div class="vw-chart" data-chart></div>
      <div class="vw-tip" role="presentation" hidden></div>
      <p class="fine-print">If the bottom bar reaches past the middle one, what you value covers the extra you pay.</p>
    </section>
    <section class="card vw-breakdown" aria-labelledby="vw-bd-title">
      <h4 id="vw-bd-title">The breakdown</h4>
      <div data-breakdown></div>
    </section>
    <section class="card card--soft vw-intang" aria-labelledby="vw-int-title">
      <h4 id="vw-int-title">Not priced, but worth weighing</h4>
      <p class="muted">These are left out of the verdict on purpose, because only you can judge them.</p>
      <ul class="vw-intang__list" data-intang></ul>
    </section>
    <div class="vw-next" data-next></div>
    <div data-actions></div>
    <p class="fine-print vw-fine">This is a guide to help you decide, based only on the figures and values you entered. It is not a price, a quote or financial advice. What each inclusion is worth is your own assumption.</p>`;

  const $ = (s) => out.querySelector(s);
  const ringFill = $('.ring__fill');
  const ringVal = $('[data-ring-value]');
  const ringC = Number(ringFill.getAttribute('stroke-dasharray'));
  const tip = $('.vw-tip');
  const chartHost = $('[data-chart]');

  const scaleSeg = segmented({
    label: 'Show the chart', options: [{ value: 'pp', label: 'Per person' }, { value: 'group', label: 'Whole group' }],
    value: chartScale, onChange: (v) => { chartScale = v; drawChart(); },
  });
  scaleSeg.el.classList.add('vw-scale');
  $('[data-chart-scale]').append(scaleSeg.el);

  const bar = actionBar({
    onBrief: () => addToBrief(),
    onShare: () => shareResult(),
    onEnquire: () => enquire(),
    extra: [{ label: 'Change my assumptions', icon: 'sliders', cls: 'btn--ghost', run: () => openAssumptions() }],
  });
  $('[data-actions]').append(bar.el);

  function openAssumptions() {
    assume.open = true;
    assume.scrollIntoView({ behavior: ctx.reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    const first = assume.querySelector('.vw-worth.is-on input') || assume.querySelector('input');
    setTimeout(() => first?.focus({ preventScroll: true }), ctx.reducedMotion() ? 0 : 450);
  }

  let res = null;
  let lastVerdict = null;
  let liveTimer = null;

  /* ---------- State helpers ---------- */

  function convertBasis(next) {
    // Keep the same package when switching basis: convert the figure already entered.
    if (next === st.basis) return;
    const g = st.guests;
    if (st.pkg != null) {
      st.pkg = next === 'pp' ? Math.round((st.pkg / g) * 100) / 100 : Math.round(st.pkg * g * 100) / 100;
      pkg.set(st.pkg);
    }
    st.basis = next;
  }

  const params = () => ({
    event: st.event, buyer: st.buyer, std: st.std, pkg: st.pkg, guests: st.guests,
    pkgb: st.basis === 'pp' ? 'pp' : null,
    inc: st.inc,
    w: Object.entries(st.worth).filter(([id, v]) => v != null && v !== INC[id]?.worth).map(([id, v]) => `${id}:${v}`),
    ex: st.example ? 1 : null,
  });

  function applyToControls() {
    eventSel.set(st.event);
    buyer.set(st.buyer);
    std.set(st.std);
    pkg.set(st.pkg);
    basis.set(st.basis);
    guests.set(st.guests);
    inc.set(st.inc);
    INCLUSIONS.forEach((i) => worthInputs[i.id].mi.set(worthOf(st, i.id)));
  }

  function fromParams(p = {}) {
    const keys = ['event', 'buyer', 'std', 'pkg', 'guests', 'inc', 'pkgb', 'w', 'ex'];
    if (!keys.some((k) => p[k] != null && p[k] !== '')) return false;
    const next = fresh();
    if (EVENTS.some((e) => e.id === p.event)) next.event = p.event;
    const b = BUYER_ALIAS[p.buyer] || p.buyer;
    if (BUYERS.some((x) => x.value === b)) next.buyer = b;
    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? clamp(n, 0, MAX_MONEY) : null; };
    next.std = num(p.std);
    next.pkg = num(p.pkg);
    next.basis = p.pkgb === 'pp' ? 'pp' : 'total';
    const gn = parseInt(p.guests, 10);
    if (Number.isFinite(gn)) next.guests = clamp(gn, GUESTS_MIN, GUESTS_MAX);
    next.inc = mapInclusions(String(p.inc || '').split(',').filter(Boolean));
    String(p.w || '').split(',').forEach((pair) => {
      const [id, v] = pair.split(':');
      const n = num(v);
      if (INC[id] && n != null) next.worth[id] = n;
    });
    next.example = p.ex === '1';
    Object.assign(st, next);
    return true;
  }

  function loadExample() {
    Object.assign(st, fresh(), { ...EXAMPLE, inc: EXAMPLE.inc.slice(), worth: {}, example: true });
    applyToControls();
    update();
    ctx.toast('Example figures loaded. They are illustrative, not prices.', { tone: 'info' });
  }

  function clearAll() {
    Object.assign(st, fresh());
    applyToControls();
    update();
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-example]')) loadExample();
    else if (e.target.closest('[data-clear]')) clearAll();
    else if (e.target.closest('[data-reset-worth]')) { st.worth = {}; INCLUSIONS.forEach((i) => worthInputs[i.id].mi.set(i.worth)); update(); }
  });

  /* ---------- Render ---------- */

  function paintInputs() {
    const g = st.guests;
    stdRecon.textContent = st.std != null && st.std > 0 ? `${money(st.std)} each, ${money(st.std * g)} for ${g} ${g === 1 ? 'guest' : 'guests'}.` : '';
    pkgLabel.textContent = st.basis === 'pp' ? 'Hospitality package, per person' : 'Hospitality package, total for the group';
    let recon = '';
    if (st.pkg != null && st.pkg > 0) {
      recon = st.basis === 'pp'
        ? `${money(st.pkg)} each, ${money(st.pkg * g)} for ${g} ${g === 1 ? 'guest' : 'guests'}.`
        : `${money(st.pkg)} in total, ${money(st.pkg / g)} per person for ${g} ${g === 1 ? 'guest' : 'guests'}.`;
      if (st.std != null && (st.basis === 'pp' ? st.pkg : st.pkg / g) < st.std) recon += ' That is less than the standard ticket, so check the figures.';
    } else if (st.pkg === 0) recon = 'Enter a package price above £0.';
    pkgRecon.textContent = recon;
    pkgRecon.classList.toggle('is-warn', /check|above/.test(recon));
    INCLUSIONS.forEach((i) => {
      const v = worthOf(st, i.id);
      const custom = st.worth[i.id] != null && st.worth[i.id] !== i.worth;
      const w = worthInputs[i.id];
      w.tag.textContent = custom ? 'Your figure' : 'Example assumption';
      w.tag.classList.toggle('is-custom', custom);
      w.cell.classList.toggle('is-on', st.inc.includes(i.id));
      const card = inc.el.querySelector(`[data-value="${i.id}"] .option-card__desc`);
      if (card) card.textContent = `Worth ${money(v)} each${custom ? ', your figure' : ' (example)'}`;
    });
    exampleBar.querySelector('[data-clear]').hidden = !(st.std != null || st.pkg != null || st.inc.length || st.buyer || st.event);
  }

  function update({ write = true } = {}) {
    if (write) ctx.setParams(params());
    paintInputs();
    res = compute(st);
    const ready = !!res;
    empty.hidden = ready;
    out.hidden = !ready;
    empty.querySelector('[data-need="std"]').classList.toggle('is-ok', st.std != null);
    empty.querySelector('[data-need="pkg"]').classList.toggle('is-ok', st.pkg != null && st.pkg > 0);
    empty.querySelector('[data-need="inc"]').classList.toggle('is-ok', st.inc.length > 0);
    if (!ready) { lastVerdict = null; return; }
    paintResult(res);
  }

  function paintResult(r) {
    const v = VERDICT[r.verdict];
    $('.vw-example-note').hidden = !st.example;
    const card = $('.vw-verdict');
    card.dataset.tone = v.tone;
    if (lastVerdict !== r.verdict && !ctx.reducedMotion()) {
      card.classList.remove('is-settling'); void card.offsetWidth; card.classList.add('is-settling');
    }
    lastVerdict = r.verdict;

    // Ring
    const pct = r.coverage == null ? 100 : Math.round(r.coverage * 100);
    ringFill.setAttribute('stroke-dashoffset', String(ringC * (1 - clamp(pct, 0, 100) / 100)));
    animateNumber(ringVal, r.coverage == null ? 100 : pct, { format: (n) => `${Math.round(n)}%` });
    $('.ring').setAttribute('aria-label', r.coverage == null ? 'The package costs no more than the standard ticket' : `Inclusions cover ${pct} per cent of the extra you pay`);

    $('[data-v-title]').textContent = v.title;
    $('[data-v-eyebrow]').textContent = st.example ? 'Verdict on example figures' : 'Your verdict';
    $('[data-v-why]').textContent = reasoning(r);
    const who = BUYERS.find((b) => b.value === st.buyer);
    $('[data-v-badges]').innerHTML = [
      `<span class="badge vw-badge-ink">${icon('users')}${r.g} ${r.g === 1 ? 'guest' : 'guests'}</span>`,
      st.event ? html`<span class="badge vw-badge-ink">${eventLabel(st.event)}</span>` : '',
      who ? html`<span class="badge vw-badge-ink">${who.label}</span>` : '',
    ].join('');

    // Stats: per person primary, group total underneath, always from the same total.
    animateNumber($('[data-s="extra"]'), r.extraPP, { format: countFmt(r.extraPP, signedOrPlain) });
    $('[data-s="extra-sub"]').textContent = `per person, ${money(Math.abs(r.extraTotal))}${r.extraTotal < 0 ? ' less' : ''} for the group`;
    animateNumber($('[data-s="value"]'), r.valuePP, { format: countFmt(r.valuePP) });
    $('[data-s="value-sub"]').textContent = `per person, ${money(r.valueTotal)} for the group`;
    animateNumber($('[data-s="net"]'), r.netPP, { format: countFmt(r.netPP, signed) });
    $('[data-s="net-sub"]').textContent = `per person, ${signed(r.netTotal)} for the group`;
    $('[data-s="net"]').closest('.vw-stat').dataset.sign = r.netTotal > 0.004 ? 'pos' : r.netTotal < -0.004 ? 'neg' : 'zero';

    paintHint(r);
    drawChart();
    paintBreakdown(r);
    paintIntangibles(r);
    paintNext();

    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = `${v.title}. ${reasoning(r)}`; }, 700);
  }

  const signedOrPlain = (n) => (n < -0.004 ? `-${money(-n)}` : money(n));

  function reasoning(r) {
    const extra = money(r.extraPP);
    const val = money(r.valuePP);
    if (r.extraTotal <= 0) return 'The package costs no more per person than the standard ticket, so everything it includes comes at no extra cost.';
    if (r.verdict === 'pending') return `You would pay ${extra} more per person. Tick what the package includes to see whether it is worth that to you.`;
    if (r.verdict === 'yes') return `What you value in the package comes to ${val} per person, which covers the ${extra} extra you would pay. On your own figures, the upgrade pays its way.`;
    if (r.verdict === 'close') return `What you value comes to ${val} per person, ${Math.round(r.coverage * 100)}% of the ${extra} extra. It comes down to the things that are hard to put a price on.`;
    return `What you value comes to ${val} per person, well short of the ${extra} extra you would pay. A standard ticket may suit you better unless the unpriced parts matter a lot.`;
  }

  function paintHint(r) {
    const box = $('[data-hint]');
    if (!(r.verdict === 'close' || r.verdict === 'no')) { box.hidden = true; return; }
    const gapPP = r.extraPP - r.valuePP;
    const missing = INCLUSIONS.filter((i) => !st.inc.includes(i.id))
      .map((i) => ({ ...i, value: worthOf(st, i.id) })).filter((i) => i.value > 0)
      .sort((a, b) => b.value - a.value).slice(0, 2);
    const ask = missing.length
      ? html`<li>Ask whether the package includes ${listJoin(missing.map((m) => `${m.label.toLowerCase()} (${money(m.value)} each to you)`))}.</li>`
      : '';
    box.innerHTML = html`${raw(icon('target'))}<div>
      <strong>What would make it worth it</strong>
      <ul class="vw-hint-list">
        <li>A package about ${money(gapPP)} less per person (${money(gapPP * r.g)} less for the group) would cover it.</li>
        <li>Or the inclusions being worth ${money(gapPP)} more to each of you.</li>
        ${raw(ask)}
      </ul></div>`;
    box.hidden = false;
  }

  function paintBreakdown(r) {
    const g = r.g;
    const row = (label, pp, total, cls = '', note = '') => html`<div class="vw-bd__row ${cls}">
      <span class="vw-bd__label">${label}${raw(note)}</span>
      <span class="vw-bd__pp">${pp}</span><span class="vw-bd__total">${total}</span></div>`;
    const incRows = r.items.length
      ? r.items.map((i) => row(i.label, money(i.value), money(i.value * g), 'vw-bd__row--sub', i.custom && i.value !== INC[i.id].worth ? ' <span class="vw-tag vw-tag--you">your figure</span>' : ' <span class="vw-tag">example</span>')).join('')
      : html`<p class="vw-bd__none">No inclusions ticked yet.</p>`;
    $('[data-breakdown]').innerHTML = html`<div class="vw-bd" role="table" aria-label="Breakdown per person and for the group">
      <div class="vw-bd__row vw-bd__row--head" role="row"><span role="columnheader">Item</span><span role="columnheader">Each</span><span role="columnheader">${g} ${g === 1 ? 'guest' : 'guests'}</span></div>
      ${raw(row('Standard ticket', money(r.std), money(r.stdTotal)))}
      ${raw(row('Hospitality package', money(r.pkgPP), money(r.pkgTotal)))}
      ${raw(row('Extra you pay', signedOrPlain(r.extraPP), signedOrPlain(r.extraTotal), 'vw-bd__row--strong'))}
      <p class="vw-bd__group">What the inclusions are worth to you</p>
      ${raw(incRows)}
      ${raw(row('Value of inclusions', money(r.valuePP), money(r.valueTotal), 'vw-bd__row--strong'))}
      ${raw(row('Net difference', signed(r.netPP), signed(r.netTotal), 'vw-bd__row--net'))}
    </div>
    <p class="fine-print">Per-person figures are the group total divided by ${g}, so the two columns always agree. Net difference is the value of inclusions minus the extra you pay.</p>`;
    $('[data-breakdown]').querySelectorAll('.vw-bd__row').forEach((n) => { n.setAttribute('role', 'row'); n.querySelectorAll(':scope > span').forEach((s) => s.setAttribute('role', 'cell')); });
  }

  function paintIntangibles(r) {
    const has = (id) => st.inc.includes(id);
    const time = has('fast-track') || has('host') || has('parking')
      ? 'Fast-track entry, a host or parking take some of the waiting and fuss out of the day.'
      : 'How much of the day goes on queues for entry, food and drink, and whether that matters to you.';
    const comfort = has('lounge') || has('dining') || has('private')
      ? 'A lounge or your own table gives you somewhere calm to be before, during breaks and after.'
      : 'Somewhere comfortable to sit, eat and talk away from the busiest parts of the venue.';
    const impression = {
      clients: 'How the day reflects on your business, and whether you get time to talk properly with your guests.',
      celebration: 'Whether the day feels like the occasion it is meant to be, and the memory it leaves.',
      staff: 'How valued the team feels, and whether it feels like a thank you rather than just a ticket.',
      treat: 'Whether it feels like a treat, and how much the extra comfort adds to your enjoyment.',
    }[st.buyer] || 'How the day feels, and the memory it leaves for you and your guests.';
    $('[data-intang]').innerHTML = [
      ['clock', 'Time', time], ['hall', 'Comfort', comfort], ['sparkle', 'Impression', impression],
    ].map(([ic, t, d]) => html`<li>${raw(icon(ic))}<div><strong>${t}</strong><span>${d}</span></div></li>`).join('');
  }

  function paintNext() {
    const items = [
      html`<button type="button" class="vw-next__btn" data-go="seat">
        <span class="vw-next__icon">${raw(icon('pin'))}</span>
        <span><strong>Find where to sit</strong><span>Match a seating area to your group${st.event ? ` for ${eventLabel(st.event).toLowerCase()}` : ''}</span></span>
        ${raw(icon('arrow-right', 'icon--nudge'))}</button>`,
    ];
    if (st.buyer === 'clients') {
      items.push(html`<button type="button" class="vw-next__btn vw-next__btn--ink" data-go="roi">
        <span class="vw-next__icon">${raw(icon('chart'))}</span>
        <span><strong>Build a business case</strong><span>Carry this event and ${st.guests} ${st.guests === 1 ? 'guest' : 'guests'} into Corporate ROI</span></span>
        ${raw(icon('arrow-right', 'icon--nudge'))}</button>`);
    }
    $('[data-next]').innerHTML = items.join('');
  }

  out.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    if (b.dataset.go === 'seat') ctx.navigate('seat-finder', st.event ? { event: st.event } : {});
    if (b.dataset.go === 'roi') {
      const p = { event: st.event, clients: st.guests };
      if (res && res.pkgPP > 0) p.cost = Math.round(res.pkgPP * 100) / 100; // keep pence so ROI totals match
      ctx.navigate('corporate-roi', p);
    }
  });

  /* ---------- Chart ---------- */

  let prevGeom = {};
  let anim = 0;

  function drawChart({ instant = false } = {}) {
    if (!res) return;
    const W = Math.max(260, Math.round(chartHost.clientWidth || 520));
    const k = chartScale === 'group' ? res.g : 1;
    $('[data-chart-sub]').textContent = chartScale === 'group' ? `Whole group, ${res.g} ${res.g === 1 ? 'guest' : 'guests'}` : 'Per person';
    const rows = chartRows(res, k);
    const labelW = 0;
    const valueW = 78;
    const plotW = W - labelW - valueW;
    const maxV = Math.max(1, ...rows.map((rw) => rw.segs.reduce((s, x) => s + x.v, 0)));
    const barH = 22;
    const rowH = 60;
    const H = rows.length * rowH - 8;
    const geom = {};
    rows.forEach((rw, ri) => {
      let x = 0;
      rw.segs.forEach((sg, si) => {
        const w = (sg.v / maxV) * plotW;
        geom[`${ri}-${si}`] = { x, w, s: sg.s, v: sg.v };
        x += w;
      });
      geom[`${ri}-end`] = { x, w: 0, v: rw.segs.reduce((s, q) => s + q.v, 0) };
    });

    const svgNS = 'http://www.w3.org/2000/svg';
    let svg = chartHost.querySelector('svg');
    if (!svg || Number(svg.dataset.w) !== W) {
      chartHost.innerHTML = '';
      svg = document.createElementNS(svgNS, 'svg');
      svg.dataset.w = String(W);
      svg.setAttribute('width', String(W));
      svg.setAttribute('height', String(H));
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('role', 'img');
      svg.innerHTML = rows.map((rw, ri) => `<g data-row="${ri}" transform="translate(0 ${ri * rowH})">
          <text class="vw-chart__label" x="0" y="13"></text>
          <line class="vw-chart__base" x1="0.5" x2="0.5" y1="20" y2="${20 + barH + 4}"></line>
          ${rw.segs.map((_, si) => `<path data-seg="${si}"></path>`).join('')}
          <text class="vw-chart__value" y="${20 + barH / 2 + 5}"></text>
        </g>`).join('');
      chartHost.append(svg);
      prevGeom = {};
    }
    svg.setAttribute('aria-label', `${chartScale === 'group' ? 'Whole group' : 'Per person'}: standard ticket ${money(rows[0].segs[0].v)}, hospitality package ${money(geom['1-end'].v)}, standard ticket plus what the inclusions are worth ${money(geom['2-end'].v)}.`);
    rows.forEach((rw, ri) => {
      const g = svg.querySelector(`[data-row="${ri}"]`);
      g.querySelector('.vw-chart__label').textContent = rw.label;
      rw.segs.forEach((sg, si) => {
        const p = g.querySelector(`[data-seg="${si}"]`);
        p.setAttribute('class', SERIES[sg.s].cls);
        p.dataset.tipText = `${SERIES[sg.s].label}: ${money(sg.v)}`;
      });
    });

    const from = prevGeom;
    const to = geom;
    const paint = (t) => {
      rows.forEach((rw, ri) => {
        const g = svg.querySelector(`[data-row="${ri}"]`);
        const n = rw.segs.length;
        let endX = 0;
        rw.segs.forEach((sg, si) => {
          const key = `${ri}-${si}`;
          const a = from[key] || { x: 0, w: 0 };
          const b = to[key];
          const x = a.x + (b.x - a.x) * t;
          const w = a.w + (b.w - a.w) * t;
          // 2px surface gap between touching segments; last visible segment gets the rounded end.
          const lastVisible = rw.segs.slice(si + 1).every((q) => q.v <= 0);
          const gap = si > 0 && w > 0 ? 2 : 0;
          const d = lastVisible ? roundedEnd(x + gap, 20, Math.max(0, w - gap), barH, 4) : flatRect(x + gap, 20, Math.max(0, w - gap), barH);
          g.querySelector(`[data-seg="${si}"]`).setAttribute('d', d);
          if (si === n - 1) endX = x + w;
        });
        const val = g.querySelector('.vw-chart__value');
        val.setAttribute('x', String(Math.max(0, endX) + 8));
        const ve = to[`${ri}-end`].v;
        val.textContent = money(t >= 1 ? ve : Math.round((from[`${ri}-end`]?.v ?? 0) + (ve - (from[`${ri}-end`]?.v ?? 0)) * t));
      });
    };
    cancelAnimationFrame(anim);
    if (instant || ctx.reducedMotion()) { paint(1); prevGeom = geom; return; }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 650);
      paint(1 - Math.pow(1 - t, 3));
      if (t < 1) anim = requestAnimationFrame(step);
    };
    paint(0);
    anim = requestAnimationFrame(step);
    prevGeom = geom;
  }

  chartHost.addEventListener('pointermove', (e) => {
    const p = e.target.closest('path[data-tip-text]');
    if (!p) { tip.hidden = true; return; }
    const box = $('.vw-chart-card').getBoundingClientRect();
    tip.textContent = p.dataset.tipText;
    tip.hidden = false;
    const x = clamp(e.clientX - box.left, 70, box.width - 70);
    tip.style.transform = `translate(${x}px, ${e.clientY - box.top - 12}px) translate(-50%, -100%)`;
  });
  chartHost.addEventListener('pointerleave', () => { tip.hidden = true; });

  let ro = null;
  let lastW = 0;
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(() => {
      const w = Math.round(chartHost.clientWidth);
      if (w && Math.abs(w - lastW) > 2) { lastW = w; if (res) { cancelAnimationFrame(anim); prevGeom = {}; chartHost.innerHTML = ''; drawChart({ instant: true }); } }
    });
    ro.observe(chartHost);
  }


  /* ---------- Brief, share, enquiry ---------- */

  function lines() {
    if (!res) return [];
    const r = res;
    return [
      st.example ? 'Example figures (illustrative, not prices)' : null,
      `${st.event ? `${eventLabel(st.event)}, ` : ''}${r.g} ${r.g === 1 ? 'guest' : 'guests'}${st.buyer ? `, ${BUYERS.find((b) => b.value === st.buyer).label.toLowerCase()}` : ''}`,
      `Standard ticket: ${money(r.std)} per person, ${money(r.stdTotal)} in total`,
      `Hospitality package: ${money(r.pkgPP)} per person, ${money(r.pkgTotal)} in total`,
      `Extra you pay: ${signedOrPlain(r.extraPP)} per person, ${signedOrPlain(r.extraTotal)} in total`,
      `Inclusions: ${r.items.length ? r.items.map((i) => `${i.label} (${money(i.value)})`).join(', ') : 'none ticked'}`,
      `Value of inclusions to me: ${money(r.valuePP)} per person (my assumptions)`,
      `Net difference: ${signed(r.netPP)} per person, ${signed(r.netTotal)} in total`,
      `Verdict: ${VERDICT[r.verdict].title}`,
    ].filter(Boolean);
  }

  function addToBrief() {
    if (!res) return;
    ctx.brief.add({
      tool: 'vip-worth',
      title: `Is hospitality worth it? ${VERDICT[res.verdict].title}`,
      subtitle: `${st.event ? `${eventLabel(st.event)}, ` : ''}${res.g} ${res.g === 1 ? 'guest' : 'guests'}, net ${signed(res.netPP)} per person`,
      lines: lines(),
      params: params(),
    });
  }

  function shareResult() {
    if (!res) return;
    ctx.share.send({ title: 'Is Hospitality Worth It?', text: `${VERDICT[res.verdict].title}: ${reasoning(res)}`, url: ctx.shareUrl(params()) });
  }

  function enquire() {
    ctx.openEnquiry({
      tool: 'vip-worth',
      event: st.event ? eventLabel(st.event) : '',
      size: st.guests,
      summary: res ? `Weighing up hospitality for ${res.g} ${res.g === 1 ? 'guest' : 'guests'}${st.event ? ` at ${eventLabel(st.event).toLowerCase()}` : ''}` : 'Help weighing up a hospitality package',
      lines: lines(),
    });
  }

  applyToControls();
  update({ write: false });

  return {
    activate(p) {
      if (fromParams(p)) applyToControls();
      update();
    },
    deactivate() { clearTimeout(liveTimer); cancelAnimationFrame(anim); tip.hidden = true; },
    destroy() { clearTimeout(liveTimer); cancelAnimationFrame(anim); ro?.disconnect(); root.innerHTML = ''; },
  };
}

export default { mount };
