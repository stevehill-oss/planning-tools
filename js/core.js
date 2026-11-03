// Core services shared by the shell and every tool. Owned by the main session.
// Tools receive these through the ctx object passed to mount(); they should not
// import app.js. Importing core.js directly is fine for constants and helpers.

export const BRAND = {
  name: 'Prestige Corporate Events',
  phone: '0333 305 5377',
  phoneHref: 'tel:+443333055377',
};

// Verified live on 27/10/2026 and again on 02/11/2026 (each returned 200). Every other link
// to our website comes from js/data/prestige-links.js, which adds the UTM tags.
export const LINKS = {
  home: 'https://prestigecorporateevents.com/',
  sport: 'https://prestigecorporateevents.com/sport',
  music: 'https://prestigecorporateevents.com/music',
  arts: 'https://prestigecorporateevents.com/arts-culture',
  contact: 'https://prestigecorporateevents.com/contact',
};

// Tool ids keep the hashes the original Replit prototype used, so old links still work.
export const TOOLS = [
  { id: 'seat-finder', label: 'Where Should I Sit?', sub: 'Personalised seating', icon: 'pin', module: './tools/seat-finder.js' },
  { id: 'venue-guide', label: 'Venue Guide', sub: 'Every venue, verified', icon: 'map', module: './tools/venue-guide.js' },
  { id: 'reality-viewer', label: 'Seat Reality Viewer', sub: 'Preview your view', icon: 'eye', module: './tools/seat-viewer.js' },
  { id: 'vip-worth', label: 'Is Hospitality Worth It?', sub: 'Weigh up the upgrade', icon: 'scale', module: './tools/vip-value.js' },
  { id: 'occasion-matchmaker', label: 'Occasion Matchmaker', sub: 'Find your kind of event', icon: 'heart', module: './tools/matchmaker.js' },
  { id: 'corporate-roi', label: 'Corporate ROI', sub: 'Build a business case', icon: 'chart', module: './tools/corporate-roi.js' },
];

export const toolById = (id) => TOOLS.find((t) => t.id === id) || null;

/* ---------- Event bus ---------- */

const listeners = new Map();

export const bus = {
  on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
  },
  emit(type, detail) {
    (listeners.get(type) || []).forEach((fn) => {
      try { fn(detail); } catch (err) { console.error(`[bus] ${type} handler failed`, err); }
    });
  },
};

/* ---------- Storage (never throws, works in private windows) ---------- */

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
};

/* ---------- Routing ----------
   Hash shape: #<tool-id>  or  #<tool-id>?key=value&key2=a,b
   Any other hash (for example #faq) is treated as a plain in-page anchor. */

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '');
  const [id, query = ''] = raw.split('?');
  const tool = toolById(id);
  const params = Object.fromEntries(new URLSearchParams(query));
  return { tool: tool ? tool.id : null, anchor: tool ? null : id || null, params };
}

export function buildHash(toolId, params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])
  );
  // Commas stay readable in shared links (URLSearchParams would write %2C).
  const query = new URLSearchParams(clean).toString().replace(/%2C/g, ',');
  return `#${toolId}${query ? `?${query}` : ''}`;
}

// Moves to a tool (and scrolls the tools section into view). The shell listens for
// 'route' on the bus and activates the right panel.
export function navigate(toolId, params = {}, { scroll = true } = {}) {
  const hash = buildHash(toolId, params);
  if (location.hash === hash) {
    bus.emit('route', { tool: toolId, params, scroll });
  } else {
    history.pushState(null, '', hash);
    bus.emit('route', { tool: toolId, params, scroll });
  }
}

// Keeps the address bar in step with a tool's live state, so "Share" always copies
// the current result. Does not scroll and does not add history entries.
export function setParams(toolId, params) {
  const current = parseHash();
  if (current.tool !== toolId) return;
  history.replaceState(null, '', buildHash(toolId, params));
}

window.addEventListener('popstate', () => {
  const { tool, params } = parseHash();
  if (tool) bus.emit('route', { tool, params, scroll: false });
});

/* ---------- Formatting (British English, £ sterling, DD/MM/YYYY) ---------- */

const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const num0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export const fmt = {
  gbp: (n) => (Number.isFinite(n) ? gbp0.format(Math.round(n)) : '£0'),
  num: (n) => (Number.isFinite(n) ? num0.format(n) : '0'),
  pct: (n, dp = 0) => `${(Number.isFinite(n) ? n : 0).toFixed(dp)}%`,
  multiple: (n) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}x`,
  date: (d = new Date()) => d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
};

/* ---------- Motion preference ---------- */

const rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => rmQuery.matches;
rmQuery.addEventListener?.('change', () => bus.emit('motion-change', { reduced: rmQuery.matches }));

/* ---------- My Brief (shortlist that every tool can add to) ----------
   Item shape:
   { id, tool, title, subtitle, lines: [string], params: {}, thumb?: dataURL (small JPEG), createdAt: ISO string } */

const BRIEF_KEY = 'pce-brief-v1';
let briefItems = store.get(BRIEF_KEY, []);
if (!Array.isArray(briefItems)) briefItems = [];

function saveBrief() {
  if (!store.set(BRIEF_KEY, briefItems) && briefItems.some((i) => i.thumb)) {
    // Thumbnails can exceed the storage quota; keep the text if they do.
    store.set(BRIEF_KEY, briefItems.map(({ thumb, ...rest }) => rest));
  }
  bus.emit('brief:change', { items: brief.list() });
}

export const brief = {
  list: () => briefItems.slice(),
  count: () => briefItems.length,
  add(item) {
    const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const entry = { lines: [], params: {}, ...item, id, createdAt: new Date().toISOString() };
    briefItems.unshift(entry);
    saveBrief();
    ui.toast(`Added to your brief: ${entry.title}`, { tone: 'ok', action: { label: 'View brief', run: () => ui.openBrief() } });
    return id;
  },
  remove(id) {
    briefItems = briefItems.filter((i) => i.id !== id);
    saveBrief();
  },
  clear() {
    briefItems = [];
    saveBrief();
  },
  toText() {
    const lines = [`My hospitality brief (${fmt.date()})`, ''];
    briefItems.slice().reverse().forEach((item, n) => {
      lines.push(`${n + 1}. ${item.title}${item.subtitle ? `: ${item.subtitle}` : ''}`);
      item.lines.forEach((l) => lines.push(`   ${l}`));
      lines.push(`   ${shareUrl(item.tool, item.params)}`);
      lines.push('');
    });
    lines.push(`${BRAND.name}, ${BRAND.phone}`);
    return lines.join('\n');
  },
};

/* ---------- Sharing ---------- */

export function shareUrl(toolId, params = {}) {
  return `${location.origin}${location.pathname}${buildHash(toolId, params)}`;
}

export const share = {
  url: shareUrl,
  async copy(text, message = 'Link copied') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      ta.remove();
    }
    ui.toast(message, { tone: 'ok' });
  },
  // Uses the device share sheet where there is one, otherwise copies the link.
  async send({ title, text, url }) {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    await share.copy(url);
  },
};

/* ---------- UI services ----------
   The shell (app.js) registers the real implementations at boot. Until then,
   these fall back to console output so a tool never crashes calling them. */

export const ui = {
  toast: (msg) => console.info('[toast]', msg),
  openEnquiry: (prefill) => console.info('[enquiry]', prefill),
  openBrief: () => console.info('[brief] open'),
};

export function registerUI(impl) {
  Object.assign(ui, impl);
}

/* ---------- Small helpers ---------- */

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Tagged template that escapes interpolated values. Use for any user-entered text.
export function html(strings, ...values) {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return strings.reduce((out, s, i) => out + s + (i < values.length ? (values[i]?.__raw ?? esc(values[i])) : ''), '');
}
// Marks a string as already safe HTML for the html`` tag.
export const raw = (s) => ({ __raw: String(s) });

// The ctx object handed to each tool's mount().
export function createContext(toolId) {
  return {
    toolId,
    bus,
    store,
    brief,
    share,
    fmt,
    links: LINKS,
    brandInfo: BRAND,
    navigate,
    setParams: (params) => setParams(toolId, params),
    shareUrl: (params) => shareUrl(toolId, params),
    toast: (...a) => ui.toast(...a),
    openEnquiry: (...a) => ui.openEnquiry(...a),
    openBrief: (...a) => ui.openBrief(...a),
    reducedMotion,
  };
}
