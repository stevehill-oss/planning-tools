// The shell: routing between tools, the tab strip, toasts, the enquiry modal, the
// My brief drawer, reveal-on-scroll and the hero pass tilt. Owned by the shell agent.

import {
  TOOLS, toolById, bus, brief, share, parseHash, navigate, createContext, registerUI,
  reducedMotion, fmt, html, raw, BRAND, shareUrl,
} from './core.js';
import { icon, chips } from './ui.js';
import { injectIcons } from './icons.js';
import { handoffPath, decorateLinks } from './data/prestige-links.js';

injectIcons();
// Static links to our website (header, menu, footer, CTA band) get UTM tags, a new tab
// and rel="noopener".
decorateLinks(document);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ======================================================================
   Toasts
   ====================================================================== */

const toastHost = $('#toasts');
const MAX_TOASTS = 3;

// When a modal dialog is open everything outside it is inert, so the toast stack
// moves inside the open dialog to stay visible and clickable.
function placeToastHost() {
  const open = $$('dialog[open]').pop();
  const parent = open || document.body;
  if (toastHost.parentElement !== parent) parent.append(toastHost);
}

function dismissToast(t) {
  if (!t || t.classList.contains('is-leaving')) return;
  clearTimeout(t._timer);
  if (reducedMotion()) { t.remove(); return; }
  t.classList.add('is-leaving');
  t.addEventListener('animationend', () => t.remove(), { once: true });
  setTimeout(() => t.remove(), 400);
}

function toast(msg, { tone = 'info', action, duration } = {}) {
  placeToastHost();
  const t = document.createElement('div');
  t.className = `toast toast--${tone}`;
  const ic = tone === 'ok' ? 'check' : tone === 'warn' || tone === 'bad' ? 'info' : 'sparkle';
  t.innerHTML = html`<span class="toast__icon">${raw(icon(ic))}</span><span class="toast__msg">${msg}</span>`;
  if (action?.label && typeof action.run === 'function') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast__action';
    b.textContent = action.label;
    b.addEventListener('click', () => { dismissToast(t); action.run(); });
    t.append(b);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast__close';
  close.setAttribute('aria-label', 'Dismiss message');
  close.innerHTML = icon('x');
  close.addEventListener('click', () => dismissToast(t));
  t.append(close);

  const life = duration ?? (action ? 7000 : 4200);
  const arm = () => { clearTimeout(t._timer); t._timer = setTimeout(() => dismissToast(t), life); };
  t.addEventListener('pointerenter', () => clearTimeout(t._timer));
  t.addEventListener('pointerleave', arm);
  t.addEventListener('focusin', () => clearTimeout(t._timer));
  t.addEventListener('focusout', arm);

  toastHost.append(t);
  const live = $$('.toast:not(.is-leaving)', toastHost);
  live.slice(0, Math.max(0, live.length - MAX_TOASTS)).forEach(dismissToast);
  arm();
  return t;
}

/* ======================================================================
   Dialogs (menu sheet, enquiry modal, brief drawer)
   Native <dialog> with showModal gives Esc and an inert page; we add a Tab
   wrap, backdrop click to close and focus return.
   ====================================================================== */

const returnFocus = new WeakMap();

function openDialog(d, opener) {
  if (d.open) return;
  returnFocus.set(d, opener || document.activeElement);
  d.showModal();
  document.body.classList.add('has-dialog');
  placeToastHost();
}

function closeDialog(d) { if (d.open) d.close(); }

function wireDialog(d) {
  d.addEventListener('close', () => {
    if (!$$('dialog[open]').length) document.body.classList.remove('has-dialog');
    placeToastHost();
    const back = returnFocus.get(d);
    if (back && document.contains(back) && typeof back.focus === 'function') back.focus({ preventScroll: true });
  });
  d.addEventListener('click', (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeDialog(d);
    }
    if (e.target.closest('[data-close]')) closeDialog(d);
  });
  d.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', d)
      .filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

const menuSheet = $('#menu-sheet');
const enquiryModal = $('#enquiry-modal');
const briefDrawer = $('#brief-drawer');
[menuSheet, enquiryModal, briefDrawer].forEach(wireDialog);

$('#menu-btn').addEventListener('click', (e) => openDialog(menuSheet, e.currentTarget));
window.matchMedia('(min-width: 1041px)').addEventListener?.('change', (e) => { if (e.matches) closeDialog(menuSheet); });

/* ======================================================================
   Form validation helpers
   ====================================================================== */

function setError(input, message) {
  const field = input.closest('.field') || input.closest('form');
  const err = input.type === 'checkbox'
    ? document.getElementById(input.getAttribute('aria-describedby') || `${input.id}-err`)
    : field?.querySelector('.field__error');
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (!err) return;
  if (!err.id) err.id = `${input.id}-err`;
  const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
  describedBy.add(err.id);
  input.setAttribute('aria-describedby', [...describedBy].join(' '));
  err.textContent = message || '';
  err.hidden = !message;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseUkDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

// Live validation: errors appear only after a field has been left once (or on submit),
// and clear as soon as the value becomes valid.
function liveValidate(form, rules) {
  const touched = new Set();
  Object.entries(rules).forEach(([id, rule]) => {
    const input = document.getElementById(id);
    if (!input) return;
    const check = () => setError(input, rule(input));
    input.addEventListener('blur', () => { if (input.value.trim() !== '' || touched.has(id)) { touched.add(id); check(); } });
    input.addEventListener('input', () => { if (touched.has(id)) check(); });
    input.addEventListener('change', () => { if (touched.has(id)) check(); });
  });
  return {
    validateAll() {
      let firstBad = null;
      Object.entries(rules).forEach(([id, rule]) => {
        const input = document.getElementById(id);
        touched.add(id);
        const msg = rule(input);
        setError(input, msg);
        if (msg && !firstBad) firstBad = input;
      });
      return firstBad;
    },
    reset() {
      touched.clear();
      Object.keys(rules).forEach((id) => { const input = document.getElementById(id); if (input) setError(input, ''); });
    },
  };
}

/* ======================================================================
   Enquiry hand-off. Nothing is sent from this page: the modal copies the brief to the
   clipboard and opens the most relevant page on our website in a new tab (UTM tagged),
   with the phone number as a click-to-call link. It never claims anything was sent.
   ====================================================================== */

const enqForm = $('#enquiry-form');
const enqContext = $('#enq-context');
const handoffOpen = $('#handoff-open');
const handoffLabel = $('#handoff-open-label');
const handoffWhere = $('#handoff-where');
const handoffStatus = $('#handoff-status');
let handoffPage = 'our website';

const enqValidator = liveValidate(enqForm, {
  'enq-date': (i) => {
    const v = i.value.trim();
    if (!v) return '';
    const d = parseUkDate(v);
    if (!d) return 'Please use the format DD/MM/YYYY, for example 14/06/2027.';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return d < today ? 'That date has passed. Please choose a future date.' : '';
  },
  'enq-size': (i) => {
    const v = i.value.trim();
    if (!v) return '';
    const n = Number(v);
    return !Number.isInteger(n) || n < 1 ? 'Please enter a whole number, 1 or more, or leave it blank.' : n > 500 ? 'For groups over 500, call us on 0333 305 5377.' : '';
  },
});

// "our Tottenham Hotspur Stadium page", "our contact page", "our homepage".
function pageWords(link) {
  if (!link) return 'our website';
  if (link.path === '/') return 'our homepage';
  if (link.path === '/contact') return 'our contact page';
  return `our ${link.short} page`;
}

function handoffText() {
  const date = $('#enq-date').value.trim();
  const size = $('#enq-size').value.trim();
  const extra = [date && `Preferred date: ${date}`, size && `Group size: ${size}`].filter(Boolean);
  return [
    `Hospitality brief from the Prestige Corporate Events planning tools (${fmt.date()})`,
    '',
    $('#enq-message').value.trim(),
    ...(extra.length ? ['', ...extra] : []),
  ].join('\n').trim();
}

// Copies at once inside the click (so it works even as the new tab takes focus), with the
// async clipboard as a second try.
function copyNow(text) {
  let ok = false;
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  enqForm.append(ta);
  ta.select();
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  if (!ok && navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
}

// Context for the best page: the tool's own ids, else the ids in the address bar.
function contextFrom(prefill) {
  if (prefill.context) return prefill.context;
  const p = parseHash().params || {};
  return { venue: p.venue || null, area: p.area || null, mode: p.mode || null, day: p.day || null, event: p.event || null };
}

function openEnquiry(prefill = {}) {
  const opener = document.activeElement;
  // Leaving a drawer to open the hand-off: return focus to whatever opened the drawer.
  const fromDrawer = briefDrawer.open;
  const drawerOpener = fromDrawer ? ([returnFocus.get(briefDrawer)].find((o) => o && o !== document.body) || $('#brief-btn')) : null;
  if (fromDrawer) { returnFocus.set(briefDrawer, null); closeDialog(briefDrawer); }
  if (menuSheet.open) { returnFocus.set(menuSheet, null); closeDialog(menuSheet); }

  enqValidator.reset();
  handoffStatus.textContent = '';

  const tool = prefill.tool ? toolById(prefill.tool) : null;
  const lines = Array.isArray(prefill.lines) ? prefill.lines.filter(Boolean) : [];
  const message = [prefill.summary, ...lines, tool ? `Planning tools link: ${shareUrl(tool.id, parseHash().tool === tool.id ? parseHash().params : {})}` : ''].filter(Boolean).join('\n');
  $('#enq-message').value = message;
  $('#enq-date').value = '';
  $('#enq-size').value = prefill.size ? String(prefill.size) : '';

  const link = handoffPath({ ...contextFrom(prefill), tool: prefill.tool || 'enquiry' });
  handoffPage = pageWords(link);
  handoffOpen.href = link.href;
  handoffLabel.textContent = `Copy my brief and open ${handoffPage}`;
  handoffWhere.textContent = `We will open ${handoffPage} on prestigecorporateevents.com in a new tab.`;

  const from = tool ? tool.label : prefill.tool === 'brief' ? 'My brief' : '';
  if (from || prefill.summary) {
    enqContext.hidden = false;
    enqContext.innerHTML = html`${raw(icon('bookmark'))}<span>${from ? `From ${from}: ` : ''}${prefill.summary || 'your result'}. The details are in your brief below, so edit anything you like.</span>`;
  } else {
    enqContext.hidden = true;
    enqContext.innerHTML = '';
  }
  openDialog(enquiryModal, fromDrawer ? drawerOpener : opener);
  $('#enq-message').focus();
}

handoffOpen.addEventListener('click', (e) => {
  const bad = enqValidator.validateAll();
  if (bad) { e.preventDefault(); bad.focus(); return; }
  copyNow(handoffText());
  handoffStatus.textContent = `Brief copied. Paste it into your enquiry on ${handoffPage}, which opens in a new tab.`;
});
$('#handoff-copy').addEventListener('click', () => {
  const bad = enqValidator.validateAll();
  if (bad) { bad.focus(); return; }
  copyNow(handoffText());
  handoffStatus.textContent = 'Brief copied. Paste it into your enquiry on our website, or an email to a colleague.';
});
enqForm.addEventListener('submit', (e) => { e.preventDefault(); $('#handoff-copy').click(); });

$$('[data-open-enquiry]').forEach((b) => b.addEventListener('click', () => openEnquiry({})));

/* ======================================================================
   My brief drawer
   ====================================================================== */

const briefBody = $('#brief-body');
const briefFoot = $('#brief-foot');
const briefCount = $('#brief-count');
const briefBtn = $('#brief-btn');

function relTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `Saved ${fmt.date(d)}`;
}

function renderBrief() {
  const items = brief.list();
  briefFoot.hidden = !items.length;
  if (!items.length) {
    briefBody.innerHTML = html`<div class="brief-empty">
      ${raw(icon('bookmark'))}
      <h3>Your brief is empty</h3>
      <p>Use "Add to my brief" on any tool result to collect seats, views and figures here. You can then copy, print or take the lot to a specialist.</p>
      <button type="button" class="btn btn--ink btn--sm" data-close data-goto="seat-finder">Start with Where Should I Sit?</button>
    </div>`;
    return;
  }
  briefBody.innerHTML = items.map((item) => {
    const tool = toolById(item.tool);
    const thumb = typeof item.thumb === 'string' && item.thumb.startsWith('data:image/')
      ? html`<img class="brief-item__thumb" src="${item.thumb}" alt="" width="64" height="48">`
      : html`<span class="brief-item__thumb">${raw(icon(tool?.icon || 'bookmark'))}</span>`;
    return html`<article class="brief-item" data-id="${item.id}">
      ${raw(thumb)}
      <div>
        <p class="brief-item__tool">${tool?.label || 'Result'}</p>
        <h3>${item.title}</h3>
        ${raw(item.subtitle ? html`<p class="brief-item__sub">${item.subtitle}</p>` : '')}
        ${raw(item.lines?.length ? `<ul>${item.lines.slice(0, 4).map((l) => html`<li>${l}</li>`).join('')}</ul>` : '')}
        ${raw(tool ? html`<a class="brief-item__open" href="${shareUrl(item.tool, item.params)}" data-open-item="${item.id}">Open this result ${raw(icon('arrow-right'))}</a>` : '')}
      </div>
      <button type="button" class="brief-item__remove" data-remove="${item.id}" aria-label="Remove ${item.title} from brief">${raw(icon('trash'))}</button>
    </article>`;
  }).join('') + html`<p class="fine-print">${relTime(items[items.length - 1].createdAt)}${items.length > 1 ? ` to ${fmt.date(new Date(items[0].createdAt))}` : ''}. Scores are indicative. Prestige Corporate Events confirms seats and prices when you enquire.</p>`;
}

function updateBriefBadge(bump = false) {
  const n = brief.count();
  briefCount.textContent = String(n);
  briefCount.hidden = n === 0;
  briefBtn.setAttribute('aria-label', `My brief, ${n === 0 ? 'no items' : n === 1 ? '1 item' : `${n} items`}`);
  if (bump && n > 0 && !reducedMotion()) {
    briefCount.classList.remove('is-bumped');
    void briefCount.offsetWidth;
    briefCount.classList.add('is-bumped');
  }
}

let lastCount = brief.count();
bus.on('brief:change', () => {
  const n = brief.count();
  updateBriefBadge(n > lastCount);
  lastCount = n;
  if (briefDrawer.open) renderBrief();
});

function openBrief(opener) {
  renderBrief();
  let back = opener || document.activeElement;
  if (menuSheet.open) { returnFocus.set(menuSheet, null); closeDialog(menuSheet); back = $('#menu-btn'); }
  if (enquiryModal.open) { returnFocus.set(enquiryModal, null); closeDialog(enquiryModal); }
  openDialog(briefDrawer, back);
  const h = $('.drawer__head h2', briefDrawer);
  h.setAttribute('tabindex', '-1');
  h.focus();
}

$$('[data-open-brief]').forEach((b) => b.addEventListener('click', () => openBrief()));

briefBody.addEventListener('click', (e) => {
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    const art = rm.closest('.brief-item');
    const next = art.nextElementSibling?.querySelector?.('[data-remove]') || art.previousElementSibling?.querySelector?.('[data-remove]');
    const title = art.querySelector('h3')?.textContent || 'Item';
    brief.remove(rm.dataset.remove);
    toast(`Removed: ${title}`);
    (next && document.contains(next) ? briefBody.querySelector(`[data-remove="${next.dataset.remove}"]`) : $('.drawer__head h2', briefDrawer))?.focus();
    return;
  }
  const open = e.target.closest('[data-open-item]');
  if (open) {
    e.preventDefault();
    const item = brief.list().find((i) => i.id === open.dataset.openItem);
    returnFocus.set(briefDrawer, null);
    closeDialog(briefDrawer);
    if (item) navigate(item.tool, item.params || {});
    return;
  }
  const go = e.target.closest('[data-goto]');
  if (go) { returnFocus.set(briefDrawer, null); closeDialog(briefDrawer); navigate(go.dataset.goto, lastParams[go.dataset.goto] || {}); }
});

let clearArmed = null;
briefFoot.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-brief]');
  if (!b) return;
  const act = b.dataset.brief;
  if (act === 'copy') {
    share.copy(brief.toText(), 'Brief copied, ready to paste');
  } else if (act === 'print') {
    printBrief();
  } else if (act === 'share') {
    const text = brief.toText();
    if (navigator.share) {
      try { await navigator.share({ title: 'My hospitality brief', text }); } catch { /* cancelled */ }
    } else {
      share.copy(text, 'Brief copied. Paste it into an email or message to share it.');
    }
  } else if (act === 'send') {
    const items = brief.list().slice().reverse();
    // Group size from the saved results; the page to open from the newest result that names
    // a venue, else an event type, else our contact page.
    const sizes = items.map((i) => {
      const p = i.params || {};
      const n = Number(p.size || p.guests || (p.clients ? Number(p.clients) + Number(p.hosts ?? 1) : 0));
      return Number.isFinite(n) && n > 0 ? n : 0;
    }).filter(Boolean);
    const newest = brief.list();
    const withVenue = newest.find((i) => i.params?.venue);
    const withEvent = newest.find((i) => i.params?.event);
    const context = withVenue
      ? { venue: withVenue.params.venue, area: withVenue.params.area || null, mode: withVenue.params.mode || null, day: withVenue.params.day || null, event: withVenue.params.event || null }
      : { event: withEvent?.params?.event || null };
    openEnquiry({
      tool: 'brief',
      context,
      size: sizes.length ? Math.min(500, Math.max(...sizes)) : undefined,
      summary: items.length === 1 ? '1 saved result' : `${items.length} saved results`,
      lines: items.flatMap((i, n) => [`${n + 1}. ${i.title}${i.subtitle ? `: ${i.subtitle}` : ''}`, ...(i.lines || []).map((l) => `   ${l}`), `   ${shareUrl(i.tool, i.params)}`]),
    });
  } else if (act === 'clear') {
    const label = b.querySelector('span');
    if (clearArmed) {
      clearTimeout(clearArmed); clearArmed = null;
      label.textContent = 'Clear all';
      brief.clear();
      toast('Brief cleared');
      $('.drawer__head h2', briefDrawer).focus();
    } else {
      label.textContent = 'Tap again to clear';
      clearArmed = setTimeout(() => { clearArmed = null; label.textContent = 'Clear all'; }, 4000);
    }
  }
});

function printBrief() {
  const items = brief.list().slice().reverse();
  const host = $('#print-brief');
  host.innerHTML = html`<div class="print-brief__head">
      <img src="assets/logo-dark.png" width="600" height="146" alt="Prestige Corporate Events">
      <p>My hospitality brief<br>${fmt.date()}</p>
    </div>
    <h1>My hospitality brief</h1>
    ${raw(items.map((i) => {
      const tool = toolById(i.tool);
      const hasThumb = typeof i.thumb === 'string' && i.thumb.startsWith('data:image/');
      return html`<section class="print-brief__item${hasThumb ? '' : ' no-thumb'}">
        ${raw(hasThumb ? html`<img src="${i.thumb}" alt="">` : '')}
        <div>
          <p class="print-brief__tool">${tool?.label || 'Result'}</p>
          <h2>${i.title}</h2>
          ${raw(i.subtitle ? html`<p>${i.subtitle}</p>` : '')}
          ${raw(i.lines?.length ? `<ul>${i.lines.map((l) => html`<li>${l}</li>`).join('')}</ul>` : '')}
          <p class="print-brief__link">${shareUrl(i.tool, i.params)}</p>
        </div>
      </section>`;
    }).join(''))}
    <p class="print-brief__foot">Scores are indicative opinions and 3D views are illustrative models. A hospitality specialist confirms seats, inclusions and prices. ${BRAND.name}, ${BRAND.phone}.</p>`;
  const root = document.documentElement;
  root.classList.add('printing-brief');
  const done = () => { root.classList.remove('printing-brief'); host.innerHTML = ''; };
  window.addEventListener('afterprint', done, { once: true });
  // Let the logo decode before the print snapshot.
  requestAnimationFrame(() => setTimeout(() => window.print(), 60));
}

registerUI({ toast, openEnquiry, openBrief });
updateBriefBadge();

/* ======================================================================
   Header state
   ====================================================================== */

const header = $('#site-header');
let headerTick = false;
function paintHeader() { header.classList.toggle('is-scrolled', window.scrollY > 8); headerTick = false; }
window.addEventListener('scroll', () => { if (!headerTick) { headerTick = true; requestAnimationFrame(paintHeader); } }, { passive: true });
paintHeader();

/* ======================================================================
   Tabs and routing
   ====================================================================== */

const tablist = $('#tablist');
const scroller = $('#tab-scroller');
const indicator = $('#tab-indicator');
const tabs = $$('[role="tab"]', tablist);
const panelsWrap = $('.tool-panels');
const panelFor = (id) => document.getElementById(`panel-${id}`);

const state = new Map(); // toolId -> { status, api, promise }
const lastParams = {};
const loggedFailures = new Set();
let current = null;

function moveIndicator() {
  const tab = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
  if (!tab) return;
  indicator.style.setProperty('--ix', `${tab.offsetLeft}px`);
  indicator.style.setProperty('--iw', String(tab.offsetWidth / 100));
}

function paintFades() {
  const max = scroller.scrollWidth - scroller.clientWidth;
  scroller.classList.toggle('has-fade-left', scroller.scrollLeft > 4);
  scroller.classList.toggle('has-fade-right', scroller.scrollLeft < max - 4);
}
scroller.addEventListener('scroll', paintFades, { passive: true });

function selectTab(id) {
  tabs.forEach((t) => {
    const on = t.dataset.tab === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  moveIndicator();
  const tab = tabs.find((t) => t.dataset.tab === id);
  if (tab && scroller.scrollWidth > scroller.clientWidth) {
    const left = tab.offsetLeft - (scroller.clientWidth - tab.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
}

function panelTop() {
  const headerH = header.getBoundingClientRect().height;
  const tabH = $('#tabbar').getBoundingClientRect().height;
  return panelsWrap.getBoundingClientRect().top + window.scrollY - headerH - tabH + 8;
}

function scrollToPanel(mode) {
  const top = panelTop();
  if (mode === 'if-needed' && window.scrollY <= top + 4) return;
  // 'instant', not 'auto': html has scroll-behavior: smooth, which 'auto' would inherit.
  window.scrollTo({ top, behavior: reducedMotion() || mode === 'instant' ? 'instant' : 'smooth' });
}

// Sticky results that are taller than the screen would hide their own bottom. Setting a
// negative top lets a tall column scroll until its end is in view, then pin there.
const stickyEls = new Set();
function paintSticky(node) {
  const offset = header.getBoundingClientRect().height + $('#tabbar').getBoundingClientRect().height + 16;
  const h = node.getBoundingClientRect().height;
  node.style.top = `${Math.round(Math.min(offset, window.innerHeight - h - 16))}px`;
}
const stickyRO = 'ResizeObserver' in window ? new ResizeObserver((entries) => entries.forEach((en) => paintSticky(en.target))) : null;
function smartSticky(node) {
  stickyEls.add(node);
  stickyRO?.observe(node);
  paintSticky(node);
}
window.addEventListener('resize', () => stickyEls.forEach(paintSticky));

function renderLoading(el) {
  el.innerHTML = `<div class="panel-loading" aria-busy="true" aria-label="Loading tool">
    <div class="stack"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    <div class="skeleton skeleton--tall"></div></div>`;
}

function renderPending(el, tool) {
  const others = TOOLS.filter((t) => t.id !== tool.id).slice(0, 2);
  el.innerHTML = html`<div class="panel-state">
    <div class="empty-state">
      <div>
        <span class="panel-state__icon">${raw(icon(tool.icon))}</span>
        <h3>${tool.label} is coming soon</h3>
        <p>This tool is still being finished for the prototype. Try another tool in the meantime, or speak to a hospitality specialist.</p>
        <div class="actions">
          <button type="button" class="btn btn--ghost btn--sm" data-retry>${raw(icon('rotate'))}<span>Try again</span></button>
          ${raw(others.map((o) => html`<button type="button" class="btn btn--ink btn--sm" data-goto="${o.id}">${raw(icon(o.icon))}<span>${o.label}</span></button>`).join(''))}
          <button type="button" class="btn btn--gold btn--sm" data-enquire>${raw(icon('phone'))}<span>Speak to a specialist</span></button>
        </div>
      </div>
    </div>
  </div>`;
  el.querySelector('[data-retry]').addEventListener('click', () => {
    state.delete(tool.id);
    show(tool.id, lastParams[tool.id] || {}, {});
  });
  el.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.goto, lastParams[b.dataset.goto] || {}, { scroll: 'if-needed' })));
  el.querySelector('[data-enquire]').addEventListener('click', () => openEnquiry({ tool: tool.id }));
}

function ensureMounted(id) {
  let st = state.get(id);
  if (st) return st;
  const tool = toolById(id);
  const el = panelFor(id);
  st = { status: 'loading', api: null };
  state.set(id, st);
  renderLoading(el);
  st.promise = import(tool.module)
    .then((mod) => {
      const mount = mod.mount || mod.default?.mount;
      if (typeof mount !== 'function') throw new Error('module has no mount()');
      el.innerHTML = '';
      st.api = mount(el, createContext(id)) || {};
      st.status = 'ready';
      el.querySelectorAll('.tool__results--sticky').forEach(smartSticky);
    })
    .catch((err) => {
      st.status = 'failed';
      renderPending(el, tool);
      if (!loggedFailures.has(id)) {
        loggedFailures.add(id);
        console.info(`[shell] ${id} is not available yet, showing the coming soon state.`, err?.message || err);
      }
    });
  return st;
}

let showToken = 0;
async function show(id, params = {}, { scroll = false } = {}) {
  const tool = toolById(id);
  if (!tool) return;
  const token = ++showToken;

  if (current && current !== id) {
    const h = parseHash();
    if (h.tool === current) lastParams[current] = h.params;
    const prev = state.get(current);
    if (prev?.api?.deactivate) { try { prev.api.deactivate(); } catch (err) { console.error(err); } }
  }
  const switching = current !== id;
  current = id;
  selectTab(id);
  TOOLS.forEach((t) => { panelFor(t.id).hidden = t.id !== id; });
  const panel = panelFor(id);
  if (switching && !reducedMotion()) {
    panel.classList.remove('is-entering');
    void panel.offsetWidth;
    panel.classList.add('is-entering');
    setTimeout(() => panel.classList.remove('is-entering'), 500);
  }
  if (scroll) scrollToPanel(scroll === true ? 'smooth' : scroll);

  const st = ensureMounted(id);
  await st.promise;
  if (token !== showToken || st.status !== 'ready') return;
  try { st.api.activate?.(params || {}); } catch (err) { console.error(`[shell] ${id} activate failed`, err); }
}

bus.on('route', ({ tool, params, scroll }) => show(tool, params, { scroll }));

tabs.forEach((t) => {
  t.addEventListener('click', () => {
    const id = t.dataset.tab;
    if (id === current) return;
    navigate(id, lastParams[id] || {}, { scroll: 'if-needed' });
  });
});

tablist.addEventListener('keydown', (e) => {
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  let n = null;
  if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === 'Home') n = 0;
  else if (e.key === 'End') n = tabs.length - 1;
  if (n == null) return;
  e.preventDefault();
  tabs[n].focus();
  tabs[n].click();
});

// Any link to a tool (hero chips, journey steps, footer) routes instead of jumping.
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-tool-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  const id = a.dataset.toolLink;
  navigate(id, lastParams[id] || {}, { scroll: true });
});

if ('ResizeObserver' in window) {
  new ResizeObserver(() => { moveIndicator(); paintFades(); }).observe(tablist);
} else {
  window.addEventListener('resize', () => { moveIndicator(); paintFades(); });
}
document.fonts?.ready?.then(() => { moveIndicator(); paintFades(); });

// First load. A tool hash (including old links such as #corporate-roi) opens that tool
// and scrolls to it; otherwise Where Should I Sit? is shown without moving the page.
{
  const { tool, params } = parseHash();
  if (tool) {
    show(tool, params, {});
    // Jump now, and again once web fonts settle the hero height, unless the visitor moved.
    let moved = false;
    const mark = () => { moved = true; };
    ['wheel', 'touchstart', 'keydown'].forEach((t) => window.addEventListener(t, mark, { once: true, passive: true }));
    const jump = () => { if (!moved) scrollToPanel('instant'); };
    requestAnimationFrame(jump);
    document.fonts?.ready?.then(() => requestAnimationFrame(jump));
    // The browser can reset the position at load while it looks for the fragment.
    if (document.readyState !== 'complete') window.addEventListener('load', () => requestAnimationFrame(jump), { once: true });
  } else {
    show('seat-finder', {}, {});
  }
  paintFades();
}

/* ======================================================================
   Insights, newsletter
   ====================================================================== */

$$('.insight__toggle').forEach((b) => b.addEventListener('click', () => {
  const more = document.getElementById(b.getAttribute('aria-controls'));
  const open = b.getAttribute('aria-expanded') !== 'true';
  b.setAttribute('aria-expanded', String(open));
  more.hidden = !open;
  b.querySelector('span').textContent = open ? 'Show less' : 'Read more';
}));

const NL_INTERESTS = ['Sport', 'Music', 'Arts & Culture', 'Comedy', 'Racing', 'Football', 'Boxing', 'Rugby', 'Formula 1', 'Darts', 'Cricket', 'Tennis', 'NFL'];
const nlChips = chips({ label: 'Interests', options: NL_INTERESTS.map((l) => ({ value: l, label: l })), value: [], multi: true });
$('#nl-interests').replaceWith(Object.assign(nlChips.el, { id: 'nl-interests' }));

const nlForm = $('#newsletter-form');
const nlValidator = liveValidate(nlForm, {
  'nl-email': (i) => (!i.value.trim() ? 'Please add your email address.' : !EMAIL_RE.test(i.value.trim()) ? 'That email address does not look complete.' : ''),
  'nl-consent': (i) => (i.checked ? '' : 'Please tick the box so we can email you.'),
});
nlForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const bad = nlValidator.validateAll();
  if (bad) { bad.focus(); return; }
  $('.newsletter__fields', nlForm).hidden = true;
  const done = $('.newsletter__done', nlForm);
  done.hidden = false;
  done.focus();
});
$('[data-nl-reset]', nlForm).addEventListener('click', () => {
  nlForm.reset();
  nlChips.set([]);
  nlValidator.reset();
  $('.newsletter__done', nlForm).hidden = true;
  $('.newsletter__fields', nlForm).hidden = false;
  $('#nl-email').focus();
});

// The browser's own Print on the Venue Guide prints just the guide, as its button does.
window.addEventListener('beforeprint', () => {
  const root = document.documentElement;
  if (root.classList.contains('printing-brief') || parseHash().tool !== 'venue-guide') return;
  root.classList.add('printing-guide');
  window.addEventListener('afterprint', () => root.classList.remove('printing-guide'), { once: true });
});

$('#year').textContent = String(new Date().getFullYear());

/* ======================================================================
   Reveal on scroll (contract in base.css: content visible until armed)
   ====================================================================== */

function initReveal() {
  const items = $$('[data-reveal]');
  if (!items.length || !('IntersectionObserver' in window) || reducedMotion()) return;
  const revealAll = () => items.forEach((el) => el.classList.add('is-revealed'));
  const vh = window.innerHeight;
  items.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < vh && r.bottom > 0) el.classList.add('is-revealed');
  });
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-revealed');
      obs.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
  items.forEach((el) => { if (!el.classList.contains('is-revealed')) io.observe(el); });
  document.documentElement.classList.add('reveal-ready');

  // Fail-safe: if the page has not finished loading in a few seconds, show everything.
  const failSafe = setTimeout(revealAll, 3500);
  if (document.readyState === 'complete') clearTimeout(failSafe);
  else window.addEventListener('load', () => clearTimeout(failSafe), { once: true });
  document.addEventListener('focusin', (e) => e.target.closest?.('[data-reveal]')?.classList.add('is-revealed'));
  bus.on('motion-change', ({ reduced }) => { if (reduced) revealAll(); });
}
initReveal();

/* ======================================================================
   Hero pass: pointer tilt and optional poster image
   ====================================================================== */

{
  const stage = $('#pass-stage');
  const pass = $('#hero-pass');
  const MAX = 9;
  const reset = () => {
    pass.classList.remove('is-tracking');
    pass.style.setProperty('--rx', '0deg');
    pass.style.setProperty('--ry', '0deg');
    pass.style.setProperty('--gx', '50%');
    pass.style.setProperty('--gy', '30%');
  };
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || reducedMotion()) return;
    const r = stage.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    pass.classList.add('is-tracking');
    // Positive rotateY tips the right edge back, positive rotateX tips the top edge back,
    // so the corner under the pointer moves away from the reader.
    pass.style.setProperty('--ry', `${(nx * MAX).toFixed(2)}deg`);
    pass.style.setProperty('--rx', `${(-ny * MAX).toFixed(2)}deg`);
    pass.style.setProperty('--gx', `${((nx + 1) * 50).toFixed(1)}%`);
    pass.style.setProperty('--gy', `${((ny + 1) * 50).toFixed(1)}%`);
  });
  stage.addEventListener('pointerleave', reset);
  bus.on('motion-change', reset);

  const img = $('.pass__img', pass);
  const src = img?.dataset.src;
  if (src) {
    const probe = new Image();
    probe.onload = () => { img.src = src; img.hidden = false; };
    probe.onerror = () => { /* poster not built yet: the CSS pitch illustration stays */ };
    probe.src = src;
  }
}
