// Corporate ROI: a business case for corporate hospitality spend.
// Owned by the calculator agent.
//
// How the maths works (every figure is the user's own):
// - Total cost = cost per person x (clients invited + hosts from your team).
// - Expected deals = clients x conversion rate. Return = expected deals x average deal value.
// - Scenarios: conservative uses half the user's conversion estimate, optimistic one and a
//   half times it (never above 100 per cent). Expected is the estimate itself.
// - ROI multiple = return / total cost. Net return = return - total cost.
// - Break-even deals = total cost / deal value, rounded up ("You need 1 of 8 clients to sign").
// - Payback (only when a sales cycle is chosen) assumes deals close evenly across the cycle.
// - Soft benefits carry the user's own rough values, shown beside the deal-only figures and
//   never mixed into them silently.
// All divisions are guarded: nothing renders NaN, Infinity or a negative cost.

import { select, chips, segmented, stepper, range, moneyInput, actionBar, animateNumber, ring, group, el, icon } from '../ui.js';
import { html, raw, fmt, clamp, BRAND } from '../core.js';
import { EVENT_TYPES } from '../data/venues.js';
import { pickStaging, productsFor } from '../data/occasions.js';
import { eventLinks, linkInfo, outLinkHtml } from '../data/prestige-links.js';

const EVENTS = EVENT_TYPES.slice();
const eventById = (id) => EVENTS.find((e) => e.id === id) || null;

const BENEFITS = [
  { value: 'relationship', label: 'Relationship building', icon: 'handshake', hint: 'Time with clients away from the desk' },
  { value: 'acceleration', label: 'Deal acceleration', icon: 'zap', hint: 'Moving open conversations forward' },
  { value: 'brand', label: 'Brand positioning', icon: 'crown', hint: 'How your business is seen' },
  { value: 'morale', label: 'Staff morale', icon: 'trophy', hint: 'Hosts and team who take part' },
  { value: 'retention', label: 'Client retention', icon: 'shield', hint: 'Keeping accounts you already have' },
];
const BEN = Object.fromEntries(BENEFITS.map((b) => [b.value, b]));

const SCENARIOS = [
  { value: 'conservative', label: 'Conservative', factor: 0.5, note: 'half your estimate' },
  { value: 'expected', label: 'Expected', factor: 1, note: 'your estimate' },
  { value: 'optimistic', label: 'Optimistic', factor: 1.5, note: 'one and a half times your estimate' },
];
const SCEN = Object.fromEntries(SCENARIOS.map((s) => [s.value, s]));

const CYCLES = [1, 2, 3, 6, 9, 12, 18, 24];
const CLIENTS_MIN = 1;
const CLIENTS_MAX = 100;
const HOSTS_MAX = 20;
const CONV_MIN = 1;
const CONV_MAX = 60;
const MAX_COST = 100000;
const MAX_DEAL = 10000000;
const MAX_SOFT = 10000000;

const money = (n) => fmt.gbp(n);
// Lower case for running text, but NFL and other initialisms keep their capitals.
const lcName = (s) => (/^[A-Z0-9]{2,}\b/.test(s) ? s : String(s).toLowerCase());
const signed = (n) => (Math.round(n) > 0 ? `+${money(n)}` : Math.round(n) < 0 ? `-${money(-n)}` : money(0));
const people = (n, one = 'client', many = 'clients') => `${fmt.num(n)} ${n === 1 ? one : many}`;
// Small non-zero values keep two places, so 1% of 3 clients reads "about 0.03", not "about 0".
const oneDp = (n) => {
  if (!Number.isFinite(n)) return '0';
  if (n > 0 && n < 0.1) return Math.max(0.01, Math.round(n * 100) / 100).toLocaleString('en-GB');
  return (Math.round(n * 10) / 10).toLocaleString('en-GB');
};
const capNum = (n, max) => (n == null || !Number.isFinite(n) ? null : clamp(n, 0, max));
const multiple = (n) => (Number.isFinite(n) ? (n >= 100 ? `${fmt.num(Math.round(n))}x` : fmt.multiple(n)) : '0.0x');
const listJoin = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/* ---------- Event-specific hosting tips (practical, no statistics) ---------- */

const TIPS = {
  stadium: [
    'Bring guests in early for the dining beforehand. The easiest conversations happen before the start, not during the action.',
    'Seat hosts beside the clients they most need to talk to, rather than together at the end of the table.',
    'Plan the exit: big crowds leave at once, so staying on in the lounge after the finish buys more time together.',
  ],
  racecourse: [
    'Race days are long and relaxed, with natural breaks between races. Use them for the one-to-one conversations that matter.',
    'Share the dress code with guests well ahead. Some enclosures expect formal dress.',
    'A small sweepstake on the races gives a mixed group something to talk about from the first race.',
  ],
  arena: [
    'Evening events leave less time to talk once the main event starts, so meet for dinner beforehand.',
    'Check timings for the main act or main fight with a specialist, so the meal is not rushed.',
    'Arrange travel home in advance; late finishes make the journey part of the guest experience.',
  ],
  hall: [
    'An interval drink in a private space is often a good moment for a quiet word.',
    'Choose a performance your guests will enjoy, not only one you would. Ask about their tastes when you invite them.',
    'Allow time for a meal before the performance, as conversation stops when the curtain goes up.',
  ],
  'formula-1': [
    'Race weekends run over several days. Choose the day that suits your guests, not only race day.',
    'Plan travel and parking with care, as circuits can be busy getting in and out.',
    'Ear defenders and a briefing on the schedule help guests new to the sport enjoy it.',
  ],
  cricket: [
    'A day of cricket has long, natural pauses. They suit relaxed conversation better than almost any other sport.',
    'Check the weather plan with a specialist, as rain can change the day.',
    'Invite guests for the full day but make it easy to arrive late or leave early.',
  ],
  tennis: [
    'Matches can run long or short, so plan dining around the order of play rather than fixed times.',
    'Keep the group size easy for one host to look after between courts and the hospitality area.',
    'Share the dress code and the day plan with guests in advance.',
  ],
  festival: [
    'A hospitality area gives guests a calm base to return to between sets.',
    'Send clear meeting points and travel plans ahead, as phones can be unreliable on busy sites.',
    'Keep the guest list to people who will enjoy the music; it is a social day more than a business one.',
  ],
  general: [
    'Send invitations early with a clear plan for the day, so guests can commit.',
    'Give each host a small group of named guests to look after, and agree who follows up with whom.',
    'Follow up within a week, while the day is fresh. That is where the return in this case comes from.',
  ],
};
function tipsFor(eventId) {
  const ev = eventById(eventId);
  if (!ev) return TIPS.general;
  if (TIPS[ev.id]) return TIPS[ev.id];
  const arch = ev.archetypes[0];
  return TIPS[arch] || TIPS.general;
}

/* ---------- Pure calculation ---------- */

export function compute(st) {
  const clients = clamp(Math.round(st.clients) || 1, CLIENTS_MIN, CLIENTS_MAX);
  const hosts = clamp(Math.round(st.hosts) || 0, 0, HOSTS_MAX);
  const cost = capNum(st.cost, MAX_COST);
  const deal = capNum(st.deal, MAX_DEAL);
  if (cost == null || deal == null) return null;
  // Under £1 is a typing slip, not a price: it would show "£0 x 4 places" and a 7,500,000x return.
  if (cost < 1) return { error: 'cost' };
  if (deal < 1) return { error: 'deal' };
  const conv = clamp(Number(st.conv) || CONV_MIN, CONV_MIN, CONV_MAX);
  const heads = clients + hosts;
  const totalCost = cost * heads;
  const scen = SCENARIOS.map((s) => {
    const rate = Math.min(100, conv * s.factor);
    const deals = (clients * rate) / 100;
    const revenue = deals * deal;
    return { ...s, rate, deals, revenue, net: revenue - totalCost, multiple: revenue / totalCost };
  });
  const sel = scen.find((s) => s.value === st.scen) || scen[1];
  const softItems = st.benefits.map((b) => ({ ...BEN[b], amount: capNum(st.soft[b], MAX_SOFT) || 0 }));
  const softTotal = softItems.reduce((s, b) => s + b.amount, 0);
  const breakEven = Math.max(1, Math.ceil(totalCost / deal - 1e-9));
  const breakEvenRate = (breakEven / clients) * 100;
  const feasible = breakEven <= clients;
  const withSoftMultiple = (sel.revenue + softTotal) / totalCost;
  let payback = null;
  if (st.cycle) {
    // Expected deals are fractional averages, so compare money rather than whole deals.
    if (sel.revenue >= totalCost) payback = { months: Math.max(0.5, st.cycle * (totalCost / sel.revenue)), within: true };
    else payback = { months: null, within: false };
  }
  return { clients, hosts, cost, deal, conv, heads, totalCost, scen, sel, softItems, softTotal, breakEven, breakEvenRate, feasible, withSoftMultiple, payback };
}

function verdictFor(r) {
  const m = r.sel.multiple;
  if (m >= 3) return { title: 'A strong case', tone: 'strong', why: `On your ${r.sel.label.toLowerCase()} figures the deals return about ${multiple(m)} what the day costs.` };
  if (m >= 1.5) return { title: 'A sound case', tone: 'good', why: `The deals you expect cover the cost with room to spare, returning about ${multiple(m)} the spend.` };
  if (m >= 1) return { title: 'Pays its way', tone: 'ok', why: m < 1.15 ? 'The deals you expect cover the cost, with little margin. The soft benefits would be the bonus.' : `The deals you expect cover the cost, returning about ${multiple(m)} the spend. The soft benefits would be the bonus.` };
  if (r.softTotal > 0 && r.withSoftMultiple >= 1) return { title: 'Rests on the soft benefits', tone: 'soft', why: 'Deals alone fall short of the cost. With the soft values you entered, it covers itself.' };
  return { title: 'Hard to justify on deals alone', tone: 'weak', why: 'On these figures the expected deals do not cover the cost. It may still be right for relationships you want to protect.' };
}

/* ---------- Sensitivity chart: three columns of net return, hand-built SVG ---------- */

function colPath(x, y0, y1, w, r) {
  // Column from baseline y0 to data end y1, rounded at the data end only.
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return `M${x} ${y0 - 0.5}H${x + w}V${y0 + 0.5}H${x}Z`;
  const rr = Math.min(r, h, w / 2);
  if (y1 < y0) return `M${x} ${y0}V${y1 + rr}Q${x} ${y1} ${x + rr} ${y1}H${x + w - rr}Q${x + w} ${y1} ${x + w} ${y1 + rr}V${y0}Z`;
  return `M${x} ${y0}V${y1 - rr}Q${x} ${y1} ${x + rr} ${y1}H${x + w - rr}Q${x + w} ${y1} ${x + w} ${y1 - rr}V${y0}Z`;
}

function compactGbp(n) {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e6) return `${s}£${oneDp(a / 1e6)}m`;
  if (a >= 1e4) return `${s}£${Math.round(a / 1000)}k`;
  return `${s}${money(a)}`;
}

export function sensitivitySvg(values, { width = 520, height = 220, selected = 'expected', interactive = false } = {}) {
  // values: [{ value, label, rate, net }]
  const nets = values.map((v) => v.net);
  const max = Math.max(0, ...nets);
  const min = Math.min(0, ...nets);
  // Room above for positive labels, below for negative labels, then the scenario names.
  const padT = max > 0 ? 26 : 8; const padB = 46 + (min < 0 ? 22 : 0); const padL = 8; const padR = 8;
  const plotH = height - padT - padB;
  const span = max - min || 1;
  const y = (v) => padT + ((max - v) / span) * plotH;
  const y0 = y(0);
  const band = (width - padL - padR) / values.length;
  const colW = Math.min(56, band * 0.46);
  const cols = values.map((v, i) => {
    const cx = padL + band * i + band / 2;
    const x = cx - colW / 2;
    const y1 = y(v.net);
    const pos = v.net >= 0;
    const labelY = pos ? y1 - 8 : y1 + 16;
    const sel = v.value === selected;
    return `<g class="roi-col${sel ? ' is-sel' : ''}${pos ? ' is-pos' : ' is-neg'}" data-scen="${v.value}"${interactive ? ` tabindex="-1"` : ''}>
      <rect class="roi-col__hit" x="${cx - band / 2 + 4}" y="${padT - 20}" width="${band - 8}" height="${plotH + 40}" fill="transparent"/>
      <path class="roi-col__bar" d="${colPath(x, y0, y1, colW, 4)}"/>
      <text class="roi-col__val" x="${cx}" y="${labelY}" text-anchor="middle">${signed(v.net)}</text>
      <text class="roi-col__name" x="${cx}" y="${height - 24}" text-anchor="middle">${v.label}</text>
      <text class="roi-col__rate" x="${cx}" y="${height - 8}" text-anchor="middle">${oneDp(v.rate)}% sign</text>
    </g>`;
  }).join('');
  return `<svg class="roi-sens" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Net return at each conversion scenario: ${values.map((v) => `${v.label} ${oneDp(v.rate)} per cent, ${signed(v.net)}`).join('; ')}.">
    <line class="roi-sens__zero" x1="${padL}" x2="${width - padR}" y1="${y0}" y2="${y0}"/>
    ${cols}
  </svg>`;
}

/* ---------- Mount ---------- */

export function mount(root, ctx) {
  const fresh = () => ({ event: null, clients: 8, hosts: 1, cost: null, deal: null, conv: 10, cycle: null, benefits: [], soft: {}, scen: 'expected' });
  const st = fresh();

  root.innerHTML = '';
  const wrap = el('<div class="tool roi"></div>');
  const inputs = el('<div class="tool__inputs roi-inputs"></div>');
  const results = el('<div class="tool__results tool__results--sticky roi-results"></div>');
  wrap.append(inputs, results);
  root.append(wrap);

  inputs.append(el(html`<header class="tool__head">
    <p class="eyebrow">${raw(icon('chart'))} Corporate ROI</p>
    <h2>Make the business case with your own numbers</h2>
    <p>Enter what the day costs and what a won client is worth to you. See the return, how many clients need to sign to break even, and print a one-page case for whoever signs off the budget.</p>
  </header>`));

  const exampleBar = el(html`<div class="roi-example">
    <button type="button" class="btn btn--ghost btn--sm" data-clear hidden>${raw(icon('rotate'))}<span>Start again</span></button>
    <p class="fine-print">Use your own figures. We never show prices or typical results here.</p>
  </div>`);
  inputs.append(exampleBar);

  // 1. The event and guests
  const g1 = group('The event and your guests', '1');
  const eventSel = select({
    label: 'Event type', placeholder: 'Choose an event type (optional)',
    options: EVENTS.map((e) => ({ value: e.id, label: e.label })), value: null,
    hint: 'Used for hosting tips and the hospitality preview.',
    onChange: (v) => { st.event = v; update(); },
  });
  const clients = stepper({ label: 'Clients invited', min: CLIENTS_MIN, max: CLIENTS_MAX, value: st.clients, onChange: (v) => { st.clients = v; conv.set(st.conv); update(); } });
  const hosts = stepper({ label: 'Hosts from your team', min: 0, max: HOSTS_MAX, value: st.hosts, onChange: (v) => { st.hosts = v; update(); } });
  const headRow = el('<div class="roi-row"></div>');
  headRow.append(clients.el, hosts.el);
  g1.append(eventSel.el, headRow, el('<p class="roi-hint">Hosts need places too, so their cost is counted. Set hosts to 0 if their places are covered elsewhere.</p>'));

  // 2. Money
  const g2 = group('Cost and value', '2');
  const cost = moneyInput({ label: 'Hospitality cost per person', max: MAX_COST, placeholder: 'The price you have been quoted', onChange: (v) => { st.cost = v; update(); } });
  const costNote = el('<p class="roi-recon" aria-live="polite"></p>');
  cost.el.append(costNote);
  const deal = moneyInput({ label: 'Average value of a won client', max: MAX_DEAL, placeholder: 'Your figure, such as first-year revenue', hint: 'Use revenue, or profit if you would rather judge the case on margin.', onChange: (v) => { st.deal = v; update(); } });
  const conv = range({
    label: 'How many invited clients do you expect to sign?', min: CONV_MIN, max: CONV_MAX, step: 1, value: st.conv,
    format: (v) => `${v}% (${oneDp((st.clients * v) / 100)} of ${st.clients})`,
    ticks: ['Cautious', 'Bold'],
    hint: 'Your own estimate. There is no standard figure, so use your sales history if you have it.',
    onChange: (v) => { st.conv = v; update(); },
  });
  const cycle = select({
    label: 'Sales cycle (optional)', placeholder: 'Not sure',
    options: CYCLES.map((m) => ({ value: String(m), label: `${m} ${m === 1 ? 'month' : 'months'}` })), value: null,
    hint: 'Roughly how long a deal takes to close. Used for the payback estimate.',
    onChange: (v) => { st.cycle = v ? Number(v) : null; update(); },
  });
  g2.append(cost.el, deal.el, conv.el, cycle.el);

  // 3. Soft benefits
  const g3 = group('Benefits beyond new deals', '3');
  const ben = chips({ label: 'Benefits that matter to you', options: BENEFITS.map((b) => ({ value: b.value, label: b.label, icon: b.icon })), value: [], onChange: (v) => { st.benefits = BENEFITS.map((b) => b.value).filter((b) => v.includes(b)); update(); } });
  const softList = el('<div class="roi-soft"></div>');
  const softInputs = {};
  BENEFITS.forEach((b) => {
    const mi = moneyInput({ label: `${b.label}: rough value to you`, max: MAX_SOFT, placeholder: 'Optional', onChange: (v) => { st.soft[b.value] = v; update(); } });
    const cell = el(html`<div class="roi-soft__item" data-ben="${b.value}" hidden></div>`);
    mi.el.querySelector('.field__label').append(el('<span class="roi-tag">Your assumption</span>'));
    cell.append(mi.el);
    softList.append(cell);
    softInputs[b.value] = { mi, cell };
  });
  g3.append(el('<p class="roi-hint">Pick the ones that matter. You can give each a rough value for the whole event; they are shown alongside the deal figures, never mixed in.</p>'), ben.el, softList);

  inputs.append(g1, g2, g3);

  /* ---------- Results ---------- */

  const live = el('<p class="visually-hidden" aria-live="polite"></p>');
  const empty = el('<div class="empty-state roi-empty"></div>');
  const out = el('<div class="roi-out"></div>');
  results.append(live, empty, out);

  function paintEmpty(err) {
    empty.innerHTML = html`<div class="roi-empty__inner">
      <div class="roi-empty__icon">${raw(icon('chart'))}</div>
      <h3>${err ? 'One figure needs a look' : 'Your business case builds here'}</h3>
      <p>${err === 'cost' ? 'Enter a cost per person of at least one pound to work out a return.' : err === 'deal' ? 'Enter a deal value of at least one pound to work out how many clients need to sign.' : 'Add the cost per person and what a won client is worth. Everything else has a sensible starting point you can change.'}</p>
      <ul class="roi-empty__list">
        <li class="${st.cost > 0 ? 'is-ok' : ''}">${raw(icon('ticket'))}<span>Hospitality cost per person</span></li>
        <li class="${st.deal > 0 ? 'is-ok' : ''}">${raw(icon('briefcase'))}<span>Average value of a won client</span></li>
      </ul>
    </div>`;
  }

  out.innerHTML = html`
    <article class="card result-card roi-verdict">
      <div class="roi-verdict__top">
        <div class="roi-ring">${raw(ring(0, 100, { size: 132, stroke: 10, caption: 'return' }))}</div>
        <div class="roi-verdict__text">
          <p class="eyebrow">${raw(icon('chart'))} <span data-v-eyebrow>Your business case</span></p>
          <h3 data-v-title></h3>
          <p class="roi-verdict__why" data-v-why></p>
          <div class="roi-scen" data-scen></div>
        </div>
      </div>
      <div class="roi-break" data-break></div>
      <div class="roi-stats">
        <div class="roi-stat"><span class="roi-stat__label">Total cost</span><span class="roi-stat__value" data-s="cost"></span><span class="roi-stat__sub" data-s="cost-sub"></span></div>
        <div class="roi-stat"><span class="roi-stat__label">Expected return</span><span class="roi-stat__value" data-s="rev"></span><span class="roi-stat__sub" data-s="rev-sub"></span></div>
        <div class="roi-stat"><span class="roi-stat__label">Net return</span><span class="roi-stat__value" data-s="net"></span><span class="roi-stat__sub" data-s="net-sub"></span></div>
        <div class="roi-stat"><span class="roi-stat__label">Payback</span><span class="roi-stat__value roi-stat__value--sm" data-s="pay"></span><span class="roi-stat__sub" data-s="pay-sub"></span></div>
      </div>
    </article>
    <section class="card roi-chart-card" aria-labelledby="roi-chart-title">
      <div class="roi-chart-card__head">
        <h4 id="roi-chart-title">If fewer or more clients sign</h4>
        <p class="muted">Net return at each scenario, measured from the break-even line. Choose a column to switch.</p>
      </div>
      <div class="roi-chart" data-chart></div>
      <div class="roi-tip" hidden></div>
      <p class="fine-print" data-chart-note></p>
    </section>
    <section class="card card--soft roi-softcard" data-softcard hidden></section>
    <section class="card roi-case-cta">
      <div class="roi-case-cta__icon">${raw(icon('printer'))}</div>
      <div class="roi-case-cta__text">
        <h4>Build a business case</h4>
        <p class="muted">A one-page document with your inputs, assumptions, results and chart. Print it, save it as a PDF or copy it as text.</p>
      </div>
      <button type="button" class="btn btn--ink" data-case>${raw(icon('arrow-right', 'icon--nudge'))}<span>Build a business case</span></button>
    </section>
    <div class="roi-site" data-site></div>
    <section class="card roi-tips" aria-labelledby="roi-tips-title">
      <h4 id="roi-tips-title"></h4>
      <ul class="roi-tips__list" data-tips></ul>
    </section>
    <div data-actions></div>
    <p class="fine-print roi-fine">These are estimates built only from the figures you entered. They are not a forecast, a quote, typical results or financial advice. Conversion rate and soft values are your own assumptions.</p>`;

  const $ = (s) => out.querySelector(s);
  const ringFill = $('.ring__fill');
  const ringVal = $('[data-ring-value]');
  const ringC = Number(ringFill.getAttribute('stroke-dasharray'));
  const chartHost = $('[data-chart]');
  const tip = $('.roi-tip');

  const scenSeg = segmented({
    label: 'Scenario', ink: true,
    options: SCENARIOS.map((s) => ({ value: s.value, label: s.label })),
    value: st.scen, onChange: (v) => { st.scen = v; update(); },
  });
  $('[data-scen]').append(scenSeg.el);

  const bar = actionBar({
    onBrief: () => addToBrief(),
    onShare: () => shareResult(),
    onEnquire: () => enquire(),
    extra: [{ label: 'Preview the hospitality', icon: 'eye', cls: 'btn--ghost', run: () => previewHospitality() }],
  });
  $('[data-actions]').append(bar.el);

  let res = null;
  let lastTitle = '';
  let liveTimer = null;
  let prevNets = null;
  let anim = 0;

  /* ---------- State ---------- */

  const params = () => ({
    event: st.event, clients: st.clients, cost: st.cost, deal: st.deal, conv: st.conv,
    benefits: st.benefits,
    hosts: st.hosts !== 1 ? st.hosts : null,
    cycle: st.cycle,
    scen: st.scen !== 'expected' ? st.scen : null,
    soft: st.benefits.filter((b) => st.soft[b] != null).map((b) => `${b}:${st.soft[b]}`),
  });

  function applyToControls() {
    eventSel.set(st.event);
    clients.set(st.clients);
    hosts.set(st.hosts);
    cost.set(st.cost);
    deal.set(st.deal);
    conv.set(st.conv);
    cycle.set(st.cycle ? String(st.cycle) : null);
    ben.set(st.benefits);
    BENEFITS.forEach((b) => softInputs[b.value].mi.set(st.soft[b.value] ?? null));
    scenSeg.set(st.scen);
  }

  function fromParams(p = {}) {
    const keys = ['event', 'clients', 'cost', 'deal', 'conv', 'benefits', 'hosts', 'cycle', 'scen', 'soft'];
    if (!keys.some((k) => p[k] != null && p[k] !== '')) return false;
    const next = fresh();
    if (eventById(p.event)) next.event = p.event;
    const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
    const num = (v, max) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? clamp(n, 0, max) : null; };
    if (int(p.clients) != null) next.clients = clamp(int(p.clients), CLIENTS_MIN, CLIENTS_MAX);
    if (int(p.hosts) != null) next.hosts = clamp(int(p.hosts), 0, HOSTS_MAX);
    next.cost = num(p.cost, MAX_COST);
    next.deal = num(p.deal, MAX_DEAL);
    if (num(p.conv, 100) != null) next.conv = clamp(Math.round(num(p.conv, 100)), CONV_MIN, CONV_MAX);
    if (CYCLES.includes(int(p.cycle))) next.cycle = int(p.cycle);
    if (SCEN[p.scen]) next.scen = p.scen;
    next.benefits = BENEFITS.map((b) => b.value).filter((b) => String(p.benefits || '').split(',').includes(b));
    String(p.soft || '').split(',').forEach((pair) => {
      const [k, v] = pair.split(':');
      if (BEN[k] && num(v, MAX_SOFT) != null) next.soft[k] = num(v, MAX_SOFT);
    });
    Object.assign(st, next);
    return true;
  }

  function clearAll() {
    Object.assign(st, fresh());
    applyToControls();
    update();
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) clearAll();
    else if (e.target.closest('[data-case]')) openCase();
  });

  /* ---------- Render ---------- */

  function paintInputs() {
    const heads = st.clients + st.hosts;
    costNote.textContent = st.cost > 0 ? `${money(st.cost)} x ${heads} ${heads === 1 ? 'place' : 'places'} (${people(st.clients)}${st.hosts ? `, ${people(st.hosts, 'host', 'hosts')}` : ''}) = ${money(st.cost * heads)} in total.` : '';
    BENEFITS.forEach((b) => { softInputs[b.value].cell.hidden = !st.benefits.includes(b.value); });
    exampleBar.querySelector('[data-clear]').hidden = !(st.cost != null || st.deal != null || st.event || st.benefits.length);
  }

  function update({ write = true } = {}) {
    if (write) ctx.setParams(params());
    paintInputs();
    const r = compute(st);
    res = r && !r.error ? r : null;
    empty.hidden = !!res;
    out.hidden = !res;
    if (!res) { paintEmpty(r?.error); lastTitle = ''; prevNets = null; return; }
    paintResult(res);
  }

  function paintResult(r) {
    const v = verdictFor(r);
    paintSite();
    const card = $('.roi-verdict');
    card.dataset.tone = v.tone;
    if (lastTitle && lastTitle !== v.title && !ctx.reducedMotion()) {
      card.classList.remove('is-settling'); void card.offsetWidth; card.classList.add('is-settling');
    }
    lastTitle = v.title;

    const m = r.sel.multiple;
    ringFill.setAttribute('stroke-dashoffset', String(ringC * (1 - clamp(m / 3, 0, 1))));
    animateNumber(ringVal, m, { format: (n) => multiple(n) });
    $('.ring').setAttribute('aria-label', `Return of ${multiple(m)} the cost, ${r.sel.label.toLowerCase()} scenario`);
    $('[data-v-eyebrow]').textContent = 'Your business case';
    $('[data-v-title]').textContent = v.title;
    $('[data-v-why]').textContent = v.why;

    // Break-even headline
    $('[data-break]').innerHTML = r.feasible
      ? html`${raw(icon('target'))}<p><strong>You need ${fmt.num(r.breakEven)} of ${r.clients} ${r.clients === 1 ? 'client' : 'clients'} to sign</strong> to cover the cost. That is ${/^(8|11|18)/.test(oneDp(r.breakEvenRate)) ? 'an' : 'a'} ${oneDp(r.breakEvenRate)}% conversion rate, against your estimate of ${r.conv}%.</p>`
      : html`${raw(icon('info'))}<p><strong>Even if every client signs, deals alone do not cover the cost.</strong> You would need ${fmt.num(r.breakEven)} won clients at this deal value, and you are inviting ${r.clients}.</p>`;
    $('[data-break]').dataset.ok = String(r.feasible && r.sel.revenue >= r.totalCost);

    animateNumber($('[data-s="cost"]'), r.totalCost, { format: (n) => money(n) });
    $('[data-s="cost-sub"]').textContent = `${money(r.cost)} x ${r.heads} ${r.heads === 1 ? 'place' : 'places'}`;
    animateNumber($('[data-s="rev"]'), r.sel.revenue, { format: (n) => money(n) });
    $('[data-s="rev-sub"]').textContent = `about ${oneDp(r.sel.deals)} won ${r.sel.deals === 1 ? 'client' : 'clients'} x ${money(r.deal)}`;
    animateNumber($('[data-s="net"]'), r.sel.net, { format: (n) => signed(n) });
    $('[data-s="net-sub"]').textContent = r.softTotal > 0 ? `${signed(r.sel.net + r.softTotal)} with your soft values` : 'deals minus total cost';
    $('[data-s="net"]').closest('.roi-stat').dataset.sign = Math.round(r.sel.net) > 0 ? 'pos' : Math.round(r.sel.net) < 0 ? 'neg' : 'zero';
    const pay = $('[data-s="pay"]');
    if (r.sel.revenue < r.totalCost) { pay.textContent = 'Not on deals alone'; $('[data-s="pay-sub"]').textContent = 'expected deals fall short of the cost'; }
    else if (!r.payback) { pay.textContent = 'Set a cycle'; $('[data-s="pay-sub"]').textContent = 'choose a sales cycle to estimate'; }
    else if (r.payback.within) { pay.textContent = `About ${oneDp(r.payback.months)} ${r.payback.months === 1 ? 'month' : 'months'}`; $('[data-s="pay-sub"]').textContent = 'if deals close evenly over your cycle'; }
    else { pay.textContent = 'Not on deals alone'; $('[data-s="pay-sub"]').textContent = `fewer deals expected than the ${fmt.num(r.breakEven)} needed`; }

    drawChart();
    $('[data-chart-note]').textContent = `Conservative uses half your conversion estimate (${oneDp(r.scen[0].rate)}%), optimistic one and a half times it (${oneDp(r.scen[2].rate)}%). Deal value ${money(r.deal)}, total cost ${money(r.totalCost)}.`;

    paintSoft(r);
    paintTips();

    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = `${v.title}. Return ${multiple(m)} the cost. You need ${fmt.num(r.breakEven)} of ${r.clients} clients to sign to break even.`; }, 700);
  }

  function paintSoft(r) {
    const box = $('[data-softcard]');
    if (!r.softItems.length) { box.hidden = true; return; }
    box.hidden = false;
    const priced = r.softItems.filter((b) => b.amount > 0);
    box.innerHTML = html`<h4>Benefits beyond new deals</h4>
      <ul class="roi-soft__list">${raw(r.softItems.map((b) => html`<li>${raw(icon(b.icon))}<span><strong>${b.label}</strong><span>${b.hint}</span></span><span class="roi-soft__amt">${b.amount > 0 ? money(b.amount) : 'Not priced'}</span></li>`).join(''))}</ul>
      ${raw(priced.length ? html`<p class="roi-soft__sum">With your soft values the return is about <strong>${multiple(r.withSoftMultiple)}</strong> the cost (deals alone: ${multiple(r.sel.multiple)}).</p>` : '')}
      <p class="fine-print">Soft values are your own rough assumptions for the whole event, not measured results.</p>`;
  }

  function paintTips() {
    const ev = eventById(st.event);
    $('#roi-tips-title').textContent = ev ? `Hosting tips for ${lcName(ev.label)}` : 'Hosting tips';
    $('[data-tips]').innerHTML = tipsFor(st.event).map((t) => html`<li>${raw(icon('check'))}<span>${t}</span></li>`).join('');
  }

  /* ---------- Chart ---------- */

  function chartValues(nets) {
    return res.scen.map((s, i) => ({ value: s.value, label: s.label, rate: s.rate, net: nets ? nets[i] : s.net }));
  }

  function drawChart({ instant = false } = {}) {
    if (!res) return;
    const W = clamp(Math.round(chartHost.clientWidth || 520), 260, 900);
    const H = 230;
    const target = res.scen.map((s) => s.net);
    const from = prevNets && prevNets.length === 3 ? prevNets : target.map(() => 0);
    prevNets = target;
    const render = (nets) => {
      chartHost.innerHTML = sensitivitySvg(chartValues(nets), { width: W, height: H, selected: st.scen, interactive: true });
    };
    cancelAnimationFrame(anim);
    if (instant || ctx.reducedMotion()) { render(target); return; }
    const start = performance.now();
    const step = (now) => {
      if (!res || res.error) return; // the figures became invalid mid-tween (was a TypeError)
      const t = Math.min(1, (now - start) / 600);
      const e = 1 - Math.pow(1 - t, 3);
      render(t >= 1 ? target : from.map((f, i) => f + (target[i] - f) * e));
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  chartHost.addEventListener('click', (e) => {
    const g = e.target.closest('[data-scen]');
    if (g && SCEN[g.dataset.scen]) { st.scen = g.dataset.scen; scenSeg.set(st.scen); update(); }
  });
  chartHost.addEventListener('pointermove', (e) => {
    const g = e.target.closest('[data-scen]');
    if (!g || !res) { tip.hidden = true; return; }
    const s = res.scen.find((x) => x.value === g.dataset.scen);
    const box = $('.roi-chart-card').getBoundingClientRect();
    tip.innerHTML = html`<strong>${s.label}</strong><br>${oneDp(s.rate)}% sign, about ${oneDp(s.deals)} won<br>Return ${money(s.revenue)}, net ${signed(s.net)} (${multiple(s.multiple)})`;
    tip.hidden = false;
    const x = clamp(e.clientX - box.left, 110, box.width - 110);
    tip.style.transform = `translate(${x}px, ${e.clientY - box.top - 14}px) translate(-50%, -100%)`;
  });
  chartHost.addEventListener('pointerleave', () => { tip.hidden = true; });

  let ro = null;
  let lastW = 0;
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(() => {
      const w = Math.round(chartHost.clientWidth);
      if (w && Math.abs(w - lastW) > 2) { lastW = w; if (res && chartHost.firstChild) drawChart({ instant: true }); }
    });
    ro.observe(chartHost);
  }

  /* ---------- Hand-offs, brief, share, enquiry ---------- */

  // Opens the viewer at a venue that really stages this event type, at its first real
  // hospitality product. Event types with no venue model open the viewer's own picker.
  function previewHospitality() {
    const s = st.event ? pickStaging(st.event, 'uk') : null;
    if (!s) { ctx.navigate('reality-viewer', {}); return; }
    const area = productsFor(st.event, s.venue)[0];
    ctx.navigate('reality-viewer', { venue: s.venue, mode: s.mode, area: area?.id });
  }

  // The matching page on our website: the event type's best page, else the homepage.
  function paintSite() {
    const host = $('[data-site]');
    const info = (st.event && eventLinks(st.event, { tool: 'corporate-roi' })[0]) || linkInfo('/', { tool: 'corporate-roi', outcome: 'home' });
    host.innerHTML = info ? html`<p class="roi-site__lead">Next step: see the hospitality we offer${st.event ? ` for ${lcName(eventName())}` : ''}.</p>${raw(outLinkHtml(info, { cls: 'btn btn--gold', iconSvg: icon('external') }))}` : '';
  }

  function eventName() { return eventById(st.event)?.label || 'a live event'; }

  function lines() {
    if (!res) return [];
    const r = res;
    return [
      `Event: ${eventName()}, ${people(r.clients)}, ${people(r.hosts, 'host', 'hosts')}`,
      `Cost: ${money(r.cost)} per person, ${money(r.totalCost)} in total`,
      `Average value of a won client: ${money(r.deal)}`,
      `Conversion estimate: ${r.conv}% (my assumption), ${r.sel.label.toLowerCase()} scenario ${oneDp(r.sel.rate)}%`,
      `Return: ${money(r.sel.revenue)}, ${multiple(r.sel.multiple)} the cost, net ${signed(r.sel.net)}`,
      `Break even: ${fmt.num(r.breakEven)} of ${r.clients} clients need to sign`,
      r.softTotal > 0 ? `Soft values (my assumptions): ${money(r.softTotal)}, ${multiple(r.withSoftMultiple)} with them` : null,
    ].filter(Boolean);
  }

  function addToBrief() {
    if (!res) return;
    ctx.brief.add({
      tool: 'corporate-roi',
      title: `Business case: ${verdictFor(res).title.toLowerCase()}`,
      subtitle: `${eventName()}, ${people(res.clients)}, ${multiple(res.sel.multiple)} return`,
      lines: lines(),
      params: params(),
    });
  }

  function shareResult() {
    if (!res) return;
    ctx.share.send({ title: 'Corporate ROI', text: `${verdictFor(res).title}: ${multiple(res.sel.multiple)} return, ${fmt.num(res.breakEven)} of ${res.clients} clients to break even.`, url: ctx.shareUrl(params()) });
  }

  function enquire() {
    ctx.openEnquiry({
      tool: 'corporate-roi',
      event: st.event ? eventName() : '',
      size: st.clients + st.hosts,
      summary: `Client hospitality for ${people(st.clients)}${st.hosts ? ` and ${people(st.hosts, 'host', 'hosts')}` : ''}${st.event ? ` at ${lcName(eventName())}` : ''}`,
      lines: lines(),
    });
  }

  /* ---------- Business case document ---------- */

  let layer = null;
  let returnFocus = null;
  let prevOverflow = '';
  const logoUrl = new URL('../../assets/logo-dark.png', import.meta.url).href;

  function caseText() {
    const r = res;
    const v = verdictFor(r);
    const L = [
      `Business case: client hospitality, ${eventName()}`,
      `Prepared ${fmt.date()}`,
      '',
      `Recommendation: ${v.title}. ${v.why}`,
      '',
      'The proposal',
      `- Event: ${eventName()}`,
      `- Guests: ${people(r.clients)} and ${people(r.hosts, 'host', 'hosts')} from our team (${r.heads} places)`,
      `- Cost per person: ${money(r.cost)}. Total cost: ${money(r.totalCost)}`,
      `- Average value of a won client: ${money(r.deal)}`,
      st.cycle ? `- Sales cycle: about ${st.cycle} ${st.cycle === 1 ? 'month' : 'months'}` : null,
      '',
      'Assumptions (ours, not measured results)',
      `- Conversion estimate: ${r.conv}% of invited clients sign`,
      `- Conservative ${oneDp(r.scen[0].rate)}%, optimistic ${oneDp(r.scen[2].rate)}%`,
      ...r.softItems.map((b) => `- ${b.label}: ${b.amount > 0 ? `${money(b.amount)} (rough value)` : 'not priced'}`),
      '',
      `Results (${r.sel.label.toLowerCase()} scenario)`,
      `- Expected return: ${money(r.sel.revenue)} from about ${oneDp(r.sel.deals)} won clients`,
      `- ROI: ${multiple(r.sel.multiple)} the cost. Net return: ${signed(r.sel.net)}`,
      `- Break even: ${fmt.num(r.breakEven)} of ${r.clients} clients need to sign (${oneDp(r.breakEvenRate)}%)`,
      r.payback ? `- Payback: ${r.payback.within ? `about ${oneDp(r.payback.months)} months, if deals close evenly` : 'not reached on deals alone'}` : null,
      r.softTotal > 0 ? `- Including soft values: ${multiple(r.withSoftMultiple)} the cost` : null,
      '',
      'Sensitivity (net return)',
      ...r.scen.map((s) => `- ${s.label} (${oneDp(s.rate)}% sign): ${signed(s.net)}, ${multiple(s.multiple)}`),
      '',
      'Next steps',
      ...nextSteps(r).map((s, i) => `${i + 1}. ${s}`),
      '',
      `${BRAND.name}, ${BRAND.phone}`,
      'Estimates from the figures above only. Not a quote, a forecast or financial advice.',
    ];
    return L.filter((l) => l !== null).join('\n');
  }

  function nextSteps(r) {
    return [
      `Agree the budget of ${money(r.totalCost)} and a guest list of ${people(r.clients)}.`,
      `Speak to a ${BRAND.name} specialist about dates and hospitality options${st.event ? ` for ${lcName(eventName())}` : ''}.`,
      'Give each host named guests to look after, and agree who follows up with whom.',
      `Review the result against this case${st.cycle ? ` after about ${st.cycle} ${st.cycle === 1 ? 'month' : 'months'}` : ' at the end of your sales cycle'}.`,
    ];
  }

  function caseHtml() {
    const r = res;
    const v = verdictFor(r);
    const row = (k, val, tag = '') => html`<tr><th scope="row">${k}</th><td>${val}${raw(tag ? html` <span class="roi-doc__tag">${tag}</span>` : '')}</td></tr>`;
    return html`<article class="roi-doc" aria-labelledby="roi-doc-title">
      <header class="roi-doc__head">
        <img src="${logoUrl}" alt="${BRAND.name}" width="600" height="146">
        <div><p>Business case</p><p>Prepared ${fmt.date()}</p></div>
      </header>
      <h1 id="roi-doc-title" tabindex="-1">Client hospitality: ${st.event ? eventName() : 'a live event'}</h1>
      <div class="roi-doc__rec">
        <p class="roi-doc__kicker">Recommendation</p>
        <p><strong>${v.title}.</strong> ${v.why}</p>
      </div>
      <div class="roi-doc__kpis">
        <div><span>Total cost</span><strong>${money(r.totalCost)}</strong></div>
        <div><span>Return, ${r.sel.label.toLowerCase()}</span><strong>${money(r.sel.revenue)}</strong></div>
        <div><span>Return on cost</span><strong>${multiple(r.sel.multiple)}</strong></div>
        <div><span>Break even</span><strong>${fmt.num(r.breakEven)} of ${r.clients} sign</strong></div>
      </div>
      <div class="roi-doc__cols">
        <section>
          <h2>The proposal</h2>
          <table>${raw([
            row('Event', eventName()),
            row('Clients invited', fmt.num(r.clients)),
            row('Hosts from our team', fmt.num(r.hosts)),
            row('Cost per person', money(r.cost), 'quoted'),
            row('Total cost', `${money(r.totalCost)} (${r.heads} places)`),
            row('Value of a won client', money(r.deal), 'our figure'),
            row('Sales cycle', st.cycle ? `${st.cycle} ${st.cycle === 1 ? 'month' : 'months'}` : 'Not set'),
          ].join(''))}</table>
        </section>
        <section>
          <h2>Assumptions</h2>
          <table>${raw([
            row('Conversion estimate', `${r.conv}%`, 'assumption'),
            row('Conservative', `${oneDp(r.scen[0].rate)}%`, 'half'),
            row('Optimistic', `${oneDp(r.scen[2].rate)}%`, 'x 1.5'),
            ...r.softItems.map((b) => row(b.label, b.amount > 0 ? money(b.amount) : 'Not priced', 'assumption')),
          ].join(''))}</table>
          <p class="roi-doc__note">Assumptions are our own estimates, not measured results or typical figures.</p>
        </section>
      </div>
      <section class="roi-doc__results">
        <h2>Results, ${r.sel.label.toLowerCase()} scenario</h2>
        <div class="roi-doc__split">
          <table>${raw([
            row('Expected won clients', `about ${oneDp(r.sel.deals)}`),
            row('Expected return', money(r.sel.revenue)),
            row('Net return', signed(r.sel.net)),
            row('Break-even conversion', `${oneDp(r.breakEvenRate)}%`),
            row('Payback', r.payback ? (r.payback.within ? `about ${oneDp(r.payback.months)} months` : 'Not on deals alone') : 'Sales cycle not set'),
            r.softTotal > 0 ? row('Including soft values', multiple(r.withSoftMultiple)) : '',
          ].join(''))}</table>
          <figure>
            ${raw(sensitivitySvg(chartValues(), { width: 330, height: 200, selected: st.scen }))}
            <figcaption>Net return if fewer or more clients sign. The line marks break even.</figcaption>
          </figure>
        </div>
      </section>
      <section>
        <h2>Next steps</h2>
        <ol class="roi-doc__steps">${raw(nextSteps(r).map((s) => html`<li>${s}</li>`).join(''))}</ol>
      </section>
      <footer class="roi-doc__foot">
        <p>${BRAND.name} &middot; ${BRAND.phone}</p>
        <p>Estimates built only from the figures above. Not a quote, a forecast, typical results or financial advice.</p>
      </footer>
    </article>`;
  }

  function openCase() {
    if (!res) return;
    closeCase(false);
    returnFocus = document.activeElement;
    layer = el(html`<div class="roi-case-layer" role="dialog" aria-modal="true" aria-label="Business case document">
      <div class="roi-case__bar">
        <p class="roi-case__title">${raw(icon('briefcase'))} Business case</p>
        <div class="roi-case__btns">
          <button type="button" class="btn btn--gold btn--sm" data-print>${raw(icon('printer'))}<span>Print or save as PDF</span></button>
          <button type="button" class="btn btn--ghost-ink btn--sm" data-copy>${raw(icon('copy'))}<span>Copy as text</span></button>
        </div>
        <button type="button" class="btn btn--ghost-ink btn--sm btn--icon roi-case__close" data-close aria-label="Close the business case">${raw(icon('x'))}</button>
      </div>
      <div class="roi-case__scroll"><div class="roi-case__paper"></div></div>
    </div>`);
    layer.querySelector('.roi-case__paper').innerHTML = caseHtml();
    document.body.append(layer);
    document.documentElement.classList.add('printing-roi-case');
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    layer.addEventListener('click', (e) => {
      if (e.target.closest('[data-print]')) window.print();
      else if (e.target.closest('[data-copy]')) ctx.share.copy(caseText(), 'Business case copied as text');
      else if (e.target.closest('[data-close]')) closeCase();
    });
    layer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeCase(); }
      if (e.key === 'Tab') {
        // Focus starts on the document title, which sits after the toolbar buttons, so a
        // Tab from anywhere that is not a listed control wraps to the first button
        // (before this, Tab from the title left the overlay and Esc stopped working).
        const f = [...layer.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      }
    });
    requestAnimationFrame(() => layer?.classList.add('is-open'));
    layer.querySelector('#roi-doc-title').focus({ preventScroll: true });
  }

  function closeCase(restore = true) {
    if (!layer) return;
    layer.remove();
    layer = null;
    document.documentElement.classList.remove('printing-roi-case');
    document.documentElement.style.overflow = prevOverflow;
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }

  applyToControls();
  update({ write: false });

  return {
    activate(p) {
      if (fromParams(p)) applyToControls();
      update();
    },
    deactivate() { clearTimeout(liveTimer); cancelAnimationFrame(anim); tip.hidden = true; closeCase(false); },
    destroy() { clearTimeout(liveTimer); cancelAnimationFrame(anim); ro?.disconnect(); closeCase(false); root.innerHTML = ''; },
  };
}

export default { mount };
