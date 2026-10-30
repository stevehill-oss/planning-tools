// Control factories built on the components.css vocabulary. Owned by the main session.
// Each factory returns { el, get(), set(value) } and calls onChange(value) on user input.
// Every control is keyboard operable and labelled.

import { icon } from './icons.js';
import { html, raw, reducedMotion, fmt } from './core.js';

export { icon };

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

/* Segmented control, single choice. options: [{ value, label, icon? }] */
export function segmented({ label, options, value, onChange, ink = false, block = false }) {
  const root = el(`<div class="seg${ink ? ' seg--ink' : ''}${block ? ' seg--block' : ''}" role="group"></div>`);
  if (label) root.setAttribute('aria-label', label);
  let current = value;
  const buttons = options.map((o) => {
    const b = el(html`<button type="button" data-value="${o.value}">${raw(o.icon ? icon(o.icon) : '')}<span>${o.label}</span></button>`);
    b.addEventListener('click', () => { if (current !== o.value) { set(o.value); onChange?.(o.value); } });
    root.append(b);
    return b;
  });
  function set(v) {
    current = v;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(v))));
  }
  set(value);
  return { el: root, get: () => current, set };
}

/* Chips, single or multi choice. options: [{ value, label, icon? }] */
export function chips({ label, options, value, multi = true, onChange }) {
  const root = el('<div class="chips" role="group"></div>');
  if (label) root.setAttribute('aria-label', label);
  let selected = new Set(multi ? (value || []) : (value != null ? [value] : []));
  const buttons = options.map((o) => {
    const b = el(html`<button type="button" class="chip" data-value="${o.value}">${raw(o.icon ? icon(o.icon) : '')}<span>${o.label}</span></button>`);
    b.addEventListener('click', () => {
      if (multi) {
        selected.has(o.value) ? selected.delete(o.value) : selected.add(o.value);
      } else {
        selected = new Set([o.value]);
      }
      paint();
      onChange?.(get());
    });
    root.append(b);
    return b;
  });
  const get = () => (multi ? [...selected] : [...selected][0] ?? null);
  function paint() { buttons.forEach((b) => b.setAttribute('aria-pressed', String(selected.has(b.dataset.value)))); }
  function set(v) { selected = new Set(multi ? (v || []) : (v != null ? [v] : [])); paint(); }
  paint();
  return { el: root, get, set };
}

/* Option cards, the larger tile version of chips. options: [{ value, label, desc?, icon? }] */
export function optionCards({ label, options, value, multi = false, onChange, max }) {
  const root = el('<div class="option-grid" role="group"></div>');
  if (label) root.setAttribute('aria-label', label);
  let selected = new Set(multi ? (value || []) : (value != null ? [value] : []));
  const buttons = options.map((o) => {
    const b = el(html`<button type="button" class="option-card" data-value="${o.value}">
      ${raw(o.icon ? icon(o.icon) : '')}
      <span class="option-card__label">${o.label}</span>
      ${raw(o.desc ? html`<span class="option-card__desc">${o.desc}</span>` : '')}
    </button>`);
    b.addEventListener('click', () => {
      if (multi) {
        if (selected.has(o.value)) selected.delete(o.value);
        else if (!max || selected.size < max) selected.add(o.value);
      } else {
        selected = new Set([o.value]);
      }
      paint();
      onChange?.(get());
    });
    root.append(b);
    return b;
  });
  const get = () => (multi ? [...selected] : [...selected][0] ?? null);
  function paint() { buttons.forEach((b) => b.setAttribute('aria-pressed', String(selected.has(b.dataset.value)))); }
  function set(v) { selected = new Set(multi ? (v || []) : (v != null ? [v] : [])); paint(); }
  paint();
  return { el: root, get, set };
}

/* Toggle switch */
export function toggle({ label, hint, checked = false, onChange }) {
  const id = nextId('tg');
  const root = el(html`<label class="toggle" for="${id}">
    <span class="toggle__text"><strong>${label}</strong>${raw(hint ? html`<span>${hint}</span>` : '')}</span>
    <input type="checkbox" role="switch" id="${id}">
    <span class="toggle__track" aria-hidden="true"></span>
  </label>`);
  const input = root.querySelector('input');
  input.checked = checked;
  input.addEventListener('change', () => onChange?.(input.checked));
  return { el: root, get: () => input.checked, set: (v) => { input.checked = !!v; } };
}

/* Range slider with live value label. format(v) renders the value text. */
export function range({ label, min = 0, max = 100, step = 1, value = 50, format = (v) => String(v), onChange, hint, ticks }) {
  const id = nextId('rg');
  const root = el(html`<div class="field">
    <label class="field__label" for="${id}"><span>${label}</span><output class="field__value" for="${id}"></output></label>
    <input class="range" type="range" id="${id}" min="${min}" max="${max}" step="${step}">
    ${raw(ticks ? html`<div class="range__ticks" aria-hidden="true"><span>${ticks[0]}</span><span>${ticks[1]}</span></div>` : '')}
    ${raw(hint ? html`<span class="field__hint">${hint}</span>` : '')}
  </div>`);
  const input = root.querySelector('input');
  const out = root.querySelector('output');
  function paint() {
    const v = Number(input.value);
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    out.textContent = format(v);
    input.setAttribute('aria-valuetext', format(v));
  }
  input.value = value;
  paint();
  input.addEventListener('input', () => { paint(); onChange?.(Number(input.value)); });
  return { el: root, get: () => Number(input.value), set: (v) => { input.value = v; paint(); } };
}

/* Stepper for small whole numbers such as guest counts */
export function stepper({ label, min = 1, max = 50, value = 2, onChange, suffix = '' }) {
  const id = nextId('st');
  const root = el(html`<div class="field">
    <span class="field__label" id="${id}">${label}</span>
    <div class="stepper" role="group" aria-labelledby="${id}">
      <button type="button" aria-label="Decrease">${raw(icon('minus'))}</button>
      <output aria-live="polite"></output>
      <button type="button" aria-label="Increase">${raw(icon('plus'))}</button>
    </div>
  </div>`);
  const [dec, inc] = root.querySelectorAll('button');
  const out = root.querySelector('output');
  let v = value;
  const paint = () => { out.textContent = `${v}${suffix}`; dec.disabled = v <= min; inc.disabled = v >= max; };
  const change = (d) => { const n = Math.min(max, Math.max(min, v + d)); if (n !== v) { v = n; paint(); onChange?.(v); } };
  dec.addEventListener('click', () => change(-1));
  inc.addEventListener('click', () => change(1));
  paint();
  return { el: root, get: () => v, set: (n) => { v = n; paint(); } };
}

/* Money input with a £ prefix. Empty means null, so tools can show an empty state. */
// Pence are kept when typed (80.50 stays 80.50; the old whole-pound format showed 81 while
// the maths used 80.5). `max` (optional) caps the value and says so under the field.
const money2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = (n) => (Number.isInteger(n) ? fmt.num(n) : money2.format(Math.round(n * 100) / 100));
export function moneyInput({ label, value = null, placeholder = '', hint, max = 1000000, onChange }) {
  const id = nextId('mi');
  const root = el(html`<div class="field">
    <label class="field__label" for="${id}">${label}</label>
    <div class="input-affix"><span class="input-affix__prefix" aria-hidden="true">£</span>
      <input class="input" id="${id}" inputmode="decimal" autocomplete="off" placeholder="${placeholder}" aria-describedby="${id}-cap">
    </div>
    ${raw(hint ? html`<span class="field__hint">${hint}</span>` : '')}
    <span class="field__hint" id="${id}-cap" hidden>This calculator works up to £${fmt.num(max)}, so that figure is used.</span>
  </div>`);
  const input = root.querySelector('input');
  const capNote = root.querySelector(`#${id}-cap`);
  const parse = () => {
    const n = parseFloat(input.value.replace(/[£,\s]/g, ''));
    if (!(Number.isFinite(n) && n >= 0)) return null;
    return Math.min(n, max);
  };
  const paintCap = () => {
    const n = parseFloat(input.value.replace(/[£,\s]/g, ''));
    capNote.hidden = !(Number.isFinite(n) && n > max);
  };
  input.value = value != null ? fmtMoney(value) : '';
  input.addEventListener('input', () => {
    const n = parse();
    input.setAttribute('aria-invalid', String(input.value.trim() !== '' && n == null));
    paintCap();
    onChange?.(n);
  });
  input.addEventListener('blur', () => {
    const n = parse();
    if (n == null) return;
    input.value = fmtMoney(n); // the cap note (set while typing) stays until the figure is edited
  });
  return { el: root, get: parse, set: (n) => { input.value = n != null ? fmtMoney(Math.min(n, max)) : ''; paintCap(); } };
}

/* Native select, styled. options: [{ value, label }] */
export function select({ label, options, value, placeholder, onChange, hint }) {
  const id = nextId('sl');
  const root = el(html`<div class="field">
    <label class="field__label" for="${id}">${label}</label>
    <select class="select" id="${id}"></select>
    ${raw(hint ? html`<span class="field__hint">${hint}</span>` : '')}
  </div>`);
  const sel = root.querySelector('select');
  sel.innerHTML = (placeholder ? html`<option value="">${placeholder}</option>` : '')
    + options.map((o) => html`<option value="${o.value}">${o.label}</option>`).join('');
  sel.value = value ?? '';
  sel.addEventListener('change', () => onChange?.(sel.value || null));
  return { el: root, get: () => sel.value || null, set: (v) => { sel.value = v ?? ''; } };
}

/* Score meter row (returns HTML string). value and max are numbers. */
export function meterRow(label, value, max = 10, { ink = false } = {}) {
  return html`<div class="meter-row">
    <span>${label}</span>
    <div class="meter${ink ? ' meter--ink' : ''}" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" aria-label="${label}">
      <div class="meter__fill" style="--v:${Math.max(0, Math.min(1, value / max))}"></div>
    </div>
    <span class="meter-row__value">${value}/${max}</span>
  </div>`;
}

/* Score ring (returns HTML string). */
export function ring(value, max = 100, { size = 132, stroke = 10, caption = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, value / max)));
  return html`<div class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="${caption || 'Score'} ${value} out of ${max}">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="ring__fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    </svg>
    <div class="ring__label"><div><span class="ring__value" data-ring-value>${value}</span>${raw(caption ? html`<span class="ring__caption">${caption}</span>` : '')}</div></div>
  </div>`;
}

/* Counts a number up to its new value. Instant when reduced motion is on. */
export function animateNumber(node, to, { format = fmt.num, duration = 700 } = {}) {
  if (!node) return;
  const from = Number(node.dataset.n ?? 0);
  node.dataset.n = String(to);
  // A newer call cancels any tween still running on this node. Without this, a quick run of
  // changes let an older tween finish last and leave a stale number (ring showed 98, result 97).
  const token = (node.__tween = (node.__tween || 0) + 1);
  if (reducedMotion() || from === to) { node.textContent = format(to); return; }
  const start = performance.now();
  const step = (now) => {
    if (node.__tween !== token) return;
    const t = Math.min(1, (now - start) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    node.textContent = format(from + (to - from) * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  node.classList.remove('is-updated');
  void node.offsetWidth;
  node.classList.add('is-updated');
}

/* The standard action bar every tool shows under its result. */
export function actionBar({ onBrief, onShare, onEnquire, extra = [] }) {
  const root = el('<div class="actions"></div>');
  const add = (cls, ic, label, run) => {
    const b = el(html`<button type="button" class="btn ${cls}">${raw(icon(ic))}<span>${label}</span></button>`);
    b.addEventListener('click', run);
    root.append(b);
    return b;
  };
  if (onBrief) add('btn--ink', 'bookmark', 'Add to my brief', onBrief);
  if (onShare) add('btn--ghost', 'share', 'Share result', onShare);
  extra.forEach((x) => add(x.cls || 'btn--ghost', x.icon || 'arrow-right', x.label, x.run));
  if (onEnquire) add('btn--gold', 'phone', 'Speak to a specialist', onEnquire);
  return { el: root };
}

/* Wraps a control in a titled group card. Returns the group element. */
export function group(title, step) {
  const id = nextId('gp');
  return el(html`<div class="group" role="group" aria-labelledby="${id}"><p class="group__title" id="${id}">${raw(step ? html`<span class="step">${step}</span>` : '')}${title}</p></div>`);
}

export { el };
