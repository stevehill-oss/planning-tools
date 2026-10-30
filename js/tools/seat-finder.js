// Where Should I Sit? A guided questionnaire that recommends a seating area.
// Owned by the shell agent. Scores are indicative opinions from js/data/venues.js;
// the scoring is deliberately simple and explained on screen.

import { segmented, chips, optionCards, toggle, ring, animateNumber, actionBar, group, el, icon } from '../ui.js';
import { html, raw } from '../core.js';
import { SCORE_LABELS, venueById } from '../data/venues.js';
import {
  PLANNABLE_EVENTS, CATEGORY_LABEL, BUDGETS, budgetLevel, modeFor, venuesFor, areasForEvent, inclusionId,
} from '../data/occasions.js';

const PRIORITIES = [
  { value: 'sound', label: 'Sound', icon: 'volume', desc: 'Hear every note' },
  { value: 'atmosphere', label: 'Atmosphere', icon: 'wave', desc: 'Feel the crowd' },
  { value: 'view', label: 'The view', icon: 'eye', desc: 'See it all clearly' },
  { value: 'comfort', label: 'Comfort', icon: 'shield', desc: 'Space and a proper seat' },
  { value: 'value', label: 'Value', icon: 'scale', desc: 'Most for the money' },
  { value: 'clients', label: 'Impressing clients', icon: 'briefcase', desc: 'Room to talk and host' },
  { value: 'family', label: 'Family friendly', icon: 'users', desc: 'Seated and easy-going' },
  { value: 'luxury', label: 'Luxury', icon: 'crown', desc: 'The full treatment' },
];
const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label]));

const GROUPS = [
  { value: 'couple', label: 'Two of us', icon: 'heart' },
  { value: 'friends', label: 'Friends', icon: 'glass' },
  { value: 'family', label: 'Family', icon: 'users' },
  { value: 'clients', label: 'Clients', icon: 'handshake' },
  { value: 'team', label: 'Our team', icon: 'trophy' },
];
const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.value, g.label]));

const VIBES = [
  { value: 'any', label: 'No preference' },
  { value: 'lively', label: 'Lively' },
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'refined', label: 'Refined' },
];

const ARCH_LABEL = { stadium: 'Stadium', arena: 'Arena', hall: 'Concert hall', racecourse: 'Racecourse' };
const EVENT_ICON = { sport: 'trophy', music: 'music', arts: 'sparkle' };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const eventById = (id) => PLANNABLE_EVENTS.find((e) => e.id === id) || null;
const isStanding = (area, eventId) => area.id === 'floor' && eventId !== 'boxing';
const highUp = (area) => /high/i.test(area.position?.elevation || '');

/* ---------- Scoring ----------
   1. Each priority reads one or two indicative scores (0 to 10).
   2. The first priority counts 60 per cent, the second 40 per cent.
   3. Budget, group, vibe and the three extras then nudge the result up or down. */

function priorityScore(p, a, eventId) {
  const s = a.scores;
  switch (p) {
    case 'sound': return s.sound;
    case 'atmosphere': return s.atmosphere;
    case 'view': return s.view;
    case 'comfort': return s.comfort;
    case 'value': return clamp(10 - (a.tier - 2) * 2, 2, 10) * 0.6 + ((s.view + s.sound + s.atmosphere) / 3) * 0.4;
    case 'clients': return s.networking * 0.7 + s.comfort * 0.3;
    case 'family': return s.comfort * 0.6 + s.view * 0.4 - (isStanding(a, eventId) ? 3 : 0);
    case 'luxury': return (a.tier / 5) * 10 * 0.5 + s.comfort * 0.5;
    default: return 5;
  }
}

function scoreArea(a, st) {
  const pri = st.priority.length ? st.priority : ['view'];
  const weights = pri.length === 2 ? [0.6, 0.4] : [1];
  let fit = pri.reduce((sum, p, i) => sum + weights[i] * priorityScore(p, a, st.event), 0) * 10;
  const s = a.scores;
  const lvl = budgetLevel(st.budget);
  const diff = lvl ? a.tier - lvl : 0;
  if (lvl) fit -= diff > 0 ? diff * 9 : -diff * 4;
  if (st.group === 'clients') fit += (s.networking - 7) * 2;
  if (st.group === 'team') fit += ((s.atmosphere + s.networking) / 2 - 7) * 2;
  if (st.group === 'couple') fit += ((s.comfort + s.view) / 2 - 7) * 1.5;
  if (st.group === 'friends') fit += (s.atmosphere - 7) * 1.5;
  if (st.group === 'family') fit += (s.comfort - 7) * 2 - (isStanding(a, st.event) ? 10 : 0);
  if (st.vibe === 'lively') fit += (s.atmosphere - 7) * 2;
  if (st.vibe === 'relaxed') fit += (s.comfort - 7) * 2;
  if (st.vibe === 'refined') fit += ((s.comfort + s.networking) / 2 - 7) * 2;
  if (st.access) fit -= (isStanding(a, st.event) ? 25 : 0) + (highUp(a) ? 4 : 0);
  if (st.crowd) fit += (isStanding(a, st.event) ? -15 : 0) + (s.atmosphere >= 9 ? -6 : 0) + (a.tier === 5 ? 5 : 0);
  if (st.exit) fit += (highUp(a) ? -4 : 0) + (a.tier === 5 ? 2 : 0);
  return { area: a, match: clamp(Math.round(fit), 35, 98), diff };
}

function rank(st) {
  return areasForEvent(st.event).map((a) => scoreArea(a, st)).sort((x, y) => y.match - x.match);
}

/* ---------- Words ---------- */

function reasonLine(r, st) {
  const pri = st.priority.map((p) => PRIORITY_LABEL[p].toLowerCase());
  const lead = pri.length === 2 ? `${pri[0]} and ${pri[1]}` : pri[0];
  const budget = BUDGETS.find((b) => b.value === st.budget);
  let tail = '';
  // "an entry budget", not "a entry budget"
  const art = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
  const bl = budget ? budget.label.toLowerCase() : '';
  if (budget) tail = r.diff > 0 ? `, though it usually sits above ${art(bl)} ${bl} budget` : `, within ${art(bl)} ${bl} budget`;
  return `The strongest fit for ${lead}${tail}.`;
}

function ticks(r, st) {
  const a = r.area;
  const out = [];
  st.priority.forEach((p, i) => {
    const key = { sound: 'sound', atmosphere: 'atmosphere', view: 'view', comfort: 'comfort', clients: 'networking' }[p];
    if (key) out.push(`${SCORE_LABELS[key]} rated ${a.scores[key]}/10 (indicative), ${i === 0 ? 'your top priority' : 'your second priority'}`);
    else if (p === 'value') out.push(r.diff <= 0 ? 'Good value for what is included at your budget level' : 'Strong on the experience, if the budget stretches');
    else if (p === 'family') out.push(isStanding(a, st.event) ? 'Lively, but standing, so better for older children' : 'Seated, with space to settle in together');
    else if (p === 'luxury') out.push(a.tier >= 4 ? 'Full hospitality, with dining and service' : 'A comfortable step up from a standard ticket');
  });
  if (a.inclusions?.length) out.push(`Typically includes ${a.inclusions.slice(0, 2).join(' and ').toLowerCase()}`);
  if (st.budget && r.diff === 0) out.push('Sits right at your budget level');
  if (st.budget && r.diff < 0) out.push('Comes in under your budget level');
  if (st.access && !isStanding(a, st.event)) out.push('Seated throughout, with no standing area');
  if (st.crowd && a.tier === 5) out.push('Your own space, away from dense crowds');
  if (a.bestFor?.[0] && a.bestFor[0] !== 'Comparison only') out.push(`Often chosen for ${a.bestFor[0].toLowerCase()}`);
  return [...new Set(out)].slice(0, 5);
}

function tradeoffs(r, st) {
  const a = r.area;
  const out = [a.tradeoff];
  const budget = BUDGETS.find((b) => b.value === st.budget);
  if (budget && r.diff > 0) out.push(`Usually above ${/^[aeiou]/i.test(budget.label) ? 'an' : 'a'} ${budget.label.toLowerCase()} budget. The runner-up may be the closer fit on price.`);
  if (st.access) out.push('Step-free routes differ by venue, so a specialist confirms access for your exact seats.');
  if (st.exit) out.push('Ask a specialist which exits and transport links serve this area.');
  if (st.crowd && a.scores.atmosphere >= 9) out.push('This is one of the busier, louder parts of the venue.');
  return out;
}

function runnerHint(runner, best) {
  const a = runner.area;
  const b = best.area;
  const better = Object.keys(SCORE_LABELS).filter((k) => a.scores[k] > b.scores[k]).map((k) => SCORE_LABELS[k].toLowerCase());
  if (a.tier < b.tier) return `Choose it if you want to spend less${better.length ? `, and it scores higher for ${better.slice(0, 2).join(' and ')}` : ''}.`;
  if (better.length) return `Choose it if ${better.slice(0, 2).join(' and ')} matter more to you.`;
  return 'A close alternative if your first choice is not available on the date.';
}

/* ---------- Mount ---------- */

export function mount(root, ctx) {
  const st = { event: null, priority: [], budget: null, group: null, vibe: 'any', access: false, crowd: false, exit: false, venue: null };
  const fresh = () => ({ event: null, priority: [], budget: null, group: null, vibe: 'any', access: false, crowd: false, exit: false, venue: null });

  root.innerHTML = '';
  const wrap = el(`<div class="tool sf"></div>`);
  const inputs = el(`<div class="tool__inputs sf-inputs"></div>`);
  const results = el(`<div class="tool__results tool__results--sticky sf-results"></div>`);
  wrap.append(inputs, results);
  root.append(wrap);

  inputs.append(el(html`<header class="tool__head">
    <p class="eyebrow">${raw(icon('pin'))} Where should I sit?</p>
    <h2>Find the right seats for your group</h2>
    <p>Answer a few quick questions. Your recommendation updates as you go, with the reasons shown.</p>
  </header>`));

  const progress = el(`<div class="sf-progress" aria-hidden="true">
    <div class="sf-progress__bar"><span></span></div>
    <span class="sf-progress__text"></span>
  </div>`);
  inputs.append(progress);

  // 1. Event type, grouped by category, one selection across all three rows.
  const g1 = group('What are you going to?', '1');
  const catRows = {};
  ['sport', 'music', 'arts'].forEach((cat) => {
    const opts = PLANNABLE_EVENTS.filter((e) => e.category === cat).map((e) => ({ value: e.id, label: e.label }));
    const row = el(html`<div class="sf-cat"><span class="sf-cat__label">${raw(icon(EVENT_ICON[cat]))}${CATEGORY_LABEL[cat]}</span></div>`);
    const c = chips({ label: CATEGORY_LABEL[cat], options: opts, multi: false, value: null, onChange: (v) => {
      Object.entries(catRows).forEach(([k, other]) => { if (k !== cat) other.set(null); });
      st.event = v; st.venue = null; update();
    } });
    catRows[cat] = c;
    row.append(c.el);
    g1.append(row);
  });

  // 2. Priorities, up to two.
  const g2 = group('What matters most?', '2');
  const priHint = el('<p class="sf-hint">Pick up to two. The first counts most.</p>');
  const pri = optionCards({ label: 'What matters most, pick up to two', options: PRIORITIES, multi: true, max: 2, value: [], onChange: (v) => {
    // Keep the order in which they were chosen.
    const kept = st.priority.filter((p) => v.includes(p));
    v.forEach((p) => { if (!kept.includes(p)) kept.push(p); });
    // A click on a third card while two are chosen changes nothing, so explain why.
    const blocked = v.length === 2 && st.priority.length === 2 && v.every((p) => st.priority.includes(p));
    st.priority = kept.slice(0, 2);
    paintPriorityOrder();
    if (blocked) { ctx.toast('You can pick two. Untick one to swap it.'); return; }
    update();
  } });
  pri.el.classList.add('sf-priorities');
  g2.append(priHint, pri.el);

  // 3. Budget
  const g3 = group('Budget level', '3');
  const budget = segmented({ label: 'Budget level', options: BUDGETS.map((b) => ({ value: b.value, label: b.label })), value: null, onChange: (v) => { st.budget = v; update(); } });
  budget.el.classList.add('sf-budget');
  g3.append(budget.el, el('<p class="sf-hint">A guide to the kind of package, not a price. A specialist gives you real prices.</p>'));

  // 4. Who is going
  const g4 = group('Who is going?', '4');
  const who = chips({ label: 'Who is going', options: GROUPS, multi: false, value: null, onChange: (v) => { st.group = v; update(); } });
  g4.append(who.el);

  // 5. Vibe (optional)
  const g5 = group('The vibe you want (optional)', '5');
  const vibe = segmented({ label: 'Vibe', options: VIBES, value: 'any', onChange: (v) => { st.vibe = v; update(); } });
  g5.append(vibe.el);

  // 6. Extras
  const g6 = group('Anything else? (optional)', '6');
  const tAccess = toggle({ label: 'Accessibility needs', hint: 'Prefer seated areas and simpler access', onChange: (v) => { st.access = v; update(); } });
  const tCrowd = toggle({ label: 'Avoid dense crowds', hint: 'Favour calmer, more private spaces', onChange: (v) => { st.crowd = v; update(); } });
  const tExit = toggle({ label: 'Easy exit matters', hint: 'Getting away promptly at the end', onChange: (v) => { st.exit = v; update(); } });
  g6.append(tAccess.el, tCrowd.el, tExit.el);

  const groups = [g1, g2, g3, g4, g5, g6];
  groups.forEach((g, i) => { g.classList.add('sf-step'); g.dataset.step = String(i + 1); });
  inputs.append(...groups);

  function paintPriorityOrder() {
    pri.el.querySelectorAll('.option-card').forEach((c) => {
      const n = st.priority.indexOf(c.dataset.value);
      c.dataset.rank = n >= 0 ? String(n + 1) : '';
      c.classList.toggle('is-full', st.priority.length === 2 && n < 0);
    });
  }

  /* ---------- Results ---------- */

  const live = el('<p class="visually-hidden" aria-live="polite"></p>');
  results.append(live);
  const empty = el(`<div class="empty-state sf-empty"></div>`);
  const card = el(`<div class="card result-card sf-result" hidden></div>`);
  results.append(empty, card);

  card.innerHTML = html`
    <div class="sf-result__top">
      <div class="sf-ring">${raw(ring(0, 100, { size: 116, stroke: 9, caption: 'Match' }))}</div>
      <div class="sf-result__title">
        <p class="eyebrow">${raw(icon('sparkle'))} Recommended for you</p>
        <h3 data-name></h3>
        <p class="sf-result__reason" data-reason></p>
        <div class="sf-result__badges" data-badges></div>
      </div>
    </div>
    <div class="sf-result__body">
      <p class="sf-result__blurb" data-blurb></p>
      <div class="sf-cols">
        <div>
          <h4 class="sf-sub">Why this suits you</h4>
          <ul class="tick-list" data-ticks></ul>
        </div>
        <div>
          <h4 class="sf-sub">Scores <span class="badge">Indicative</span></h4>
          <div class="sf-meters" data-meters></div>
        </div>
      </div>
      <div class="callout sf-trade" data-trade></div>
      <div class="sf-runner" data-runner></div>
      <div class="sf-venues" data-venues></div>
      <div class="sf-next" data-next></div>
    </div>`;

  const q = (s) => card.querySelector(s);
  const ringFill = q('.ring__fill');
  const ringValue = q('[data-ring-value]');
  const ringEl = q('.ring');
  const circ = Number(ringFill.getAttribute('stroke-dasharray'));

  // Persistent meters so their fills animate between results.
  const meterKeys = Object.keys(SCORE_LABELS);
  q('[data-meters]').innerHTML = meterKeys.map((k) => html`<div class="meter-row" data-k="${k}">
      <span>${SCORE_LABELS[k]}</span>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0" aria-label="${SCORE_LABELS[k]}, indicative"><div class="meter__fill" style="--v:0"></div></div>
      <span class="meter-row__value">0/10</span>
    </div>`).join('');

  const bar = actionBar({
    onBrief: () => addToBrief(),
    onShare: () => shareResult(),
    onEnquire: () => enquire(),
    extra: [{ label: 'Start again', icon: 'rotate', cls: 'btn--ghost', run: () => resetAll() }],
  });
  bar.el.classList.add('sf-actions');
  card.append(bar.el);
  card.append(el('<p class="fine-print sf-fine">Scores are indicative opinions for comparison, not measurements. A hospitality specialist confirms the exact seats and inclusions.</p>'));

  let lastBest = null;
  let liveTimer = null;
  let current = null;

  function params() {
    return {
      event: st.event, priority: st.priority, budget: st.budget, group: st.group,
      vibe: st.vibe !== 'any' ? st.vibe : null, access: st.access ? 1 : null, crowd: st.crowd ? 1 : null,
      exit: st.exit ? 1 : null, venue: st.venue,
    };
  }

  function paintProgress() {
    const answered = [st.event, st.priority.length, st.budget, st.group].filter(Boolean).length;
    progress.querySelector('.sf-progress__bar span').style.setProperty('--p', String(answered / 4));
    progress.querySelector('.sf-progress__text').textContent = answered === 4 ? 'All four key questions answered' : `${answered} of 4 key questions answered`;
    const done = [!!st.event, st.priority.length > 0, !!st.budget, !!st.group, st.vibe !== 'any', st.access || st.crowd || st.exit];
    const next = done.findIndex((d, i) => !d && i < 4);
    groups.forEach((g, i) => {
      g.classList.toggle('is-done', done[i]);
      g.classList.toggle('is-next', i === next);
      const step = g.querySelector('.step');
      if (step) step.innerHTML = done[i] && i < 4 ? icon('check') : String(i + 1);
    });
  }

  function paintEmpty() {
    const need = [
      [!!st.event, 'Choose the kind of event'],
      [st.priority.length > 0, 'Pick what matters most'],
      [!!st.budget, 'Set a budget level (optional for a first look)'],
      [!!st.group, 'Say who is going (optional for a first look)'],
    ];
    empty.innerHTML = html`<div class="sf-empty__inner">
      <span class="sf-empty__icon">${raw(icon('pin'))}</span>
      <h3>Your recommendation appears here</h3>
      <p>Answer the first two questions for a first look. Each extra answer sharpens it.</p>
      <ul class="sf-empty__list">${raw(need.map(([ok, t]) => html`<li class="${ok ? 'is-ok' : ''}">${raw(icon(ok ? 'check' : 'chevron-right'))}<span>${t}</span></li>`).join(''))}</ul>
    </div>`;
  }

  function update({ write = true } = {}) {
    paintProgress();
    const ready = st.event && st.priority.length;
    empty.hidden = !!ready;
    card.hidden = !ready;
    if (!ready) {
      paintEmpty();
      current = null;
      if (write) ctx.setParams(params());
      return;
    }

    const ranked = rank(st);
    const best = ranked[0];
    const runner = ranked[1];
    const ev = eventById(st.event);
    const a = best.area;
    const arch = a.archetype;
    const mode = arch ? modeFor(st.event, arch) : null;
    const venues = arch ? venuesFor(arch) : [];
    if (!st.venue || !venues.some((v) => v.id === st.venue)) st.venue = venues[0]?.id || null;
    current = { best, runner, ev, a, arch, mode };

    const changed = lastBest !== `${st.event}:${a.id}:${arch}`;
    lastBest = `${st.event}:${a.id}:${arch}`;
    q('[data-name]').textContent = a.nameByMode?.[mode] || a.name;
    if (changed && !ctx.reducedMotion()) {
      card.classList.remove('is-new'); void card.offsetWidth; card.classList.add('is-new');
    }
    q('[data-reason]').textContent = reasonLine(best, st);
    q('[data-badges]').innerHTML = html`<span class="badge badge--gold">${ev.label}</span>${raw(arch ? html`<span class="badge sf-badge-ink">${ARCH_LABEL[arch]}</span>` : html`<span class="badge sf-badge-ink">General recommendation</span>`)}`;
    q('[data-blurb]').textContent = a.blurb;

    // Ring
    ringFill.style.strokeDashoffset = String(circ * (1 - best.match / 100));
    ringEl.setAttribute('aria-label', `Match ${best.match} out of 100`);
    animateNumber(ringValue, best.match, { format: (n) => String(Math.round(n)) });

    q('[data-ticks]').innerHTML = ticks(best, st).map((t) => html`<li>${raw(icon('check'))}<span>${t}</span></li>`).join('');

    meterKeys.forEach((k) => {
      const row = q(`[data-k="${k}"]`);
      const v = a.scores[k];
      row.querySelector('.meter__fill').style.setProperty('--v', String(v / 10));
      row.querySelector('.meter').setAttribute('aria-valuenow', String(v));
      row.querySelector('.meter-row__value').textContent = `${v}/10`;
    });

    q('[data-trade]').innerHTML = html`${raw(icon('info'))}<div><strong>Worth knowing</strong><ul>${raw(tradeoffs(best, st).map((t) => html`<li>${t}</li>`).join(''))}</ul></div>`;

    q('[data-runner]').innerHTML = runner ? html`<div class="sf-runner__inner">
        <span class="sf-runner__score">${runner.match}<small>Match</small></span>
        <div><p class="sf-runner__kicker">Runner-up</p><p class="sf-runner__name">${runner.area.nameByMode?.[mode] || runner.area.name}</p><p class="sf-runner__hint">${runnerHint(runner, best)}</p></div>
      </div>` : '';

    if (arch) {
      q('[data-venues]').innerHTML = html`<h4 class="sf-sub">Venues with this kind of seating</h4>
        <div class="chips sf-venue-chips" role="group" aria-label="Choose a venue to preview">${raw(venues.map((v) => html`<button type="button" class="chip" data-venue="${v.id}" aria-pressed="${String(v.id === st.venue)}">${raw(icon(v.icon))}<span>${v.name}</span><span class="sf-venue-city">${v.city}</span></button>`).join(''))}</div>
        <p class="sf-hint">Pick one to preview. Seat views are illustrative models, not exact venue renderings.</p>`;
    } else {
      q('[data-venues]').innerHTML = html`<div class="sf-generic">${raw(icon('map'))}<p>Venues for ${ev.label.toLowerCase()} vary a lot, so this is a general recommendation. A specialist will match it to the exact venue and date.</p></div>`;
    }

    const venue = venueById(st.venue);
    q('[data-next]').innerHTML = html`
      ${raw(arch ? html`<button type="button" class="sf-next__btn sf-next__btn--ink" data-go="viewer">
        <span class="sf-next__icon">${raw(icon('eye'))}</span>
        <span><strong>See the view from this seat</strong><span>${venue ? `Illustrative 3D view, ${venue.name}` : 'Illustrative 3D view'}</span></span>${raw(icon('arrow-right', 'icon--nudge'))}</button>` : '')}
      <button type="button" class="sf-next__btn" data-go="worth">
        <span class="sf-next__icon">${raw(icon('scale'))}</span>
        <span><strong>Is the upgrade worth it?</strong><span>Compare with a standard ticket, using your figures</span></span>${raw(icon('arrow-right', 'icon--nudge'))}</button>`;

    if (write) ctx.setParams(params());
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = `Recommended: ${q('[data-name]').textContent}, match ${best.match} out of 100.`; }, 700);
  }

  card.addEventListener('click', (e) => {
    const v = e.target.closest('[data-venue]');
    if (v) { st.venue = v.dataset.venue; update(); card.querySelector(`[data-venue="${st.venue}"]`)?.focus(); return; }
    const go = e.target.closest('[data-go]');
    if (!go || !current) return;
    if (go.dataset.go === 'viewer') {
      ctx.navigate('reality-viewer', { venue: st.venue, area: current.a.id, mode: current.mode });
    } else {
      ctx.navigate('vip-worth', { event: st.event, inc: current.a.inclusions.map(inclusionId) });
    }
  });

  function summaryLines() {
    if (!current) return [];
    const { best, runner, ev, a } = current;
    const venue = venueById(st.venue);
    return [
      `Event: ${ev.label}`,
      `Recommended: ${q('[data-name]').textContent} (${best.match} match, indicative)`,
      `Priorities: ${st.priority.map((p) => PRIORITY_LABEL[p]).join(' and ')}`,
      st.budget ? `Budget level: ${BUDGETS.find((b) => b.value === st.budget).label}` : null,
      st.group ? `Group: ${GROUP_LABEL[st.group]}` : null,
      venue ? `Venue to look at: ${venue.name}` : null,
      runner ? `Runner-up: ${runner.area.nameByMode?.[current.mode] || runner.area.name} (${runner.match} match)` : null,
      a.inclusions?.length ? `Typically includes: ${a.inclusions.join(', ')}` : null,
    ].filter(Boolean);
  }

  function addToBrief() {
    if (!current) return;
    ctx.brief.add({
      tool: 'seat-finder',
      title: q('[data-name]').textContent,
      subtitle: `${current.ev.label}, ${current.best.match} match`,
      lines: summaryLines().slice(2),
      params: params(),
    });
  }

  function shareResult() {
    if (!current) return;
    ctx.share.send({ title: 'Where should I sit?', text: `${q('[data-name]').textContent} for ${current.ev.label}`, url: ctx.shareUrl(params()) });
  }

  function enquire() {
    ctx.openEnquiry({
      tool: 'seat-finder',
      event: current ? current.ev.label : '',
      summary: current ? `${q('[data-name]').textContent} for ${current.ev.label}` : 'Help choosing seats',
      lines: summaryLines(),
    });
  }

  function applyToControls() {
    const ev = eventById(st.event);
    Object.entries(catRows).forEach(([cat, c]) => c.set(ev && ev.category === cat ? ev.id : null));
    pri.set(st.priority);
    paintPriorityOrder();
    budget.set(st.budget);
    who.set(st.group);
    vibe.set(st.vibe);
    tAccess.set(st.access);
    tCrowd.set(st.crowd);
    tExit.set(st.exit);
  }

  function resetAll() {
    Object.assign(st, fresh());
    applyToControls();
    lastBest = null;
    update();
    inputs.querySelector('.chip')?.focus();
    ctx.toast('Answers cleared');
  }

  function fromParams(p = {}) {
    const keys = ['event', 'priority', 'budget', 'group', 'vibe', 'access', 'crowd', 'exit', 'venue'];
    if (!keys.some((k) => p[k] != null && p[k] !== '')) return false;
    const next = fresh();
    if (eventById(p.event)) next.event = p.event;
    next.priority = String(p.priority || '').split(',').filter((v) => PRIORITY_LABEL[v]).slice(0, 2);
    if (BUDGETS.some((b) => b.value === p.budget)) next.budget = p.budget;
    if (GROUP_LABEL[p.group]) next.group = p.group;
    if (VIBES.some((v) => v.value === p.vibe)) next.vibe = p.vibe;
    next.access = p.access === '1' || p.access === 'true';
    next.crowd = p.crowd === '1' || p.crowd === 'true';
    next.exit = p.exit === '1' || p.exit === 'true';
    if (venueById(p.venue)) next.venue = p.venue;
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
