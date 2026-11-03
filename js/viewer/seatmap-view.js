// Seat map view: a 2D plan of every seat, block, box and area (js/viewer/seatplan.js),
// drawn on one canvas in the same plan frame as the 3D Plan mode (world x left to right,
// world z top to bottom). Built 02/11/2026.
//
// No prices and no sales status, ever: seats are drawn neutrally and hospitality areas are
// tinted by product. Colours here are canvas paint, like the colours inside the 3D scene.
//
// new SeatMapView(host, { onPick(sel), onCursor(sel) })
//   setMap(M, { level, selection })   selection: { kind: 'seat', k } | { kind: 'box', idx } | { kind: 'zone', idx }
//   setSelection(sel, { reveal })     marks your seat (reveal pans and zooms to it)
//   setYou({ x, z, angle, half } | null)  your view direction (from the 3D camera)
//   setLevel(id | 'all'), zoomBy(f), reset(), focusBlock(rec), focus(), dispose()
//   view.level, view.levels (for the level picker)
// Keyboard (canvas focused): arrows move seat by seat (left, right) and row by row (up is
// towards the front), Enter or Space chooses, + and - zoom, 0 resets.

import { neighbour, seatWords, refStatus } from './seatplan.js';

const TINTS = ['#d8ae68', '#5fb3a1', '#9c7fd1', '#d77a8f', '#6aa3e0', '#c9c26a', '#e08d5b', '#7fc46f', '#b98bb0', '#5ec4d6', '#d0a0a0', '#8fa8c8', '#c4a77d', '#88b0a0', '#b0b874', '#d69bd0'];
const BASE = {
  'mm-shell': ['#13233a'], 'mm-upper': ['#1a2c48'], 'mm-mid': ['#1f2735'], 'mm-lower': ['#1c2e4a'], 'mm-inner': ['#0e1a2b'],
  'mm-pitch': ['#2f6a2a'], 'mm-floor': ['#2a2d33'], 'mm-stage': ['#c9a35c'], 'mm-turf': ['#24432a'], 'mm-track': ['#3f7a34'],
  'mm-parade': ['#3d6b35', 'rgba(255,255,255,.6)'], 'mm-line': [null, 'rgba(255,255,255,.6)'], 'mm-rail': [null, 'rgba(255,255,255,.8)'],
  'mm-post': [null, '#e0525c'], 'mm-dir': [null, 'rgba(255,255,255,.7)'], 'mm-organ': ['#b39a6a'],
};
const SEAT_ZOOM = 7;      // px per metre at which single seats are drawn
const NUM_ZOOM = 46;      // px per metre at which seat numbers are drawn
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class SeatMapView {
  constructor(host, { onPick = () => {}, onCursor = () => {} } = {}) {
    this.host = host; this.onPick = onPick; this.onCursor = onCursor;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sm__canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-roledescription', 'seat map');
    this.tip = document.createElement('div'); this.tip.className = 'sm__tip'; this.tip.hidden = true; this.tip.setAttribute('aria-hidden', 'true');
    this.live = document.createElement('p'); this.live.className = 'visually-hidden sm__live'; this.live.setAttribute('aria-live', 'polite');
    host.append(this.canvas, this.tip, this.live);
    this.ctx = this.canvas.getContext('2d');
    this.M = null; this.level = 'all'; this.sel = null; this.cursor = null; this.hover = null; this.you = null;
    this.zoom = 1; this.cx = 0; this.cz = 0; this.anim = 0; this.raf = 0;
    this.pointers = new Map(); this.drag = null;
    this.bind();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
  }

  /* ---------- Data ---------- */

  setMap(M, { level = null, selection = null } = {}) {
    this.M = M; this.sel = selection; this.cursor = selection; this.hover = null;
    this.prepare();
    this.levels = M.levels;
    this.level = level && (level === 'all' || M.levels.some((l) => l.id === level)) ? level : this.defaultLevel(selection);
    this.canvas.setAttribute('aria-label', `Seat map of the model. ${M.blocks.length ? 'Arrow keys move seat by seat and row by row, Enter chooses the seat. Plus and minus zoom.' : 'Arrow keys move between boxes and areas, Enter chooses.'}`);
    this.reset(false);
    // Stands open on the whole venue with your seat marked; a box (a long racecourse stand,
    // a tier of boxes) opens zoomed to it, once the map has a size.
    this.pendingReveal = selection && selection.kind !== 'seat' ? selection : null;
    if (this.pendingReveal && this.W) { this.reveal(this.pendingReveal, false); this.pendingReveal = null; }
    this.draw();
  }

  defaultLevel(sel) {
    const M = this.M;
    const overlapping = M.arch === 'hall' || M.arch === 'racecourse';
    if (!overlapping) return 'all';
    const lv = this.levelOf(sel);
    return lv || M.levels.find((l) => l.id !== 'ground')?.id || M.levels[0]?.id || 'all';
  }

  levelOf(sel) {
    const M = this.M; if (!sel) return null;
    if (sel.kind === 'seat') return M.blocks[M.seats.blk[sel.k]]?.level;
    if (sel.kind === 'box') return M.boxes[sel.idx]?.level;
    if (sel.kind === 'zone') return M.zones[sel.idx]?.level;
    return null;
  }

  // Path2D objects, tints and a grid index of seats, once per map.
  prepare() {
    const M = this.M;
    this.tint = new Map(); let t = 0;
    M.areas.forEach((a, i) => { if (a.kind === 'hospitality') this.tint.set(i, TINTS[t++ % TINTS.length]); });
    this.base = [];
    try {
      const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${M.baseSvg || ''}</svg>`, 'image/svg+xml');
      doc.documentElement.childNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const cls = n.getAttribute('class') || ''; const paint = BASE[cls];
        if (n.tagName === 'text') { if (cls === 'mm-label') this.base.push({ text: n.textContent, x: +n.getAttribute('x'), y: +n.getAttribute('y') }); return; }
        if (!paint) return;
        let p = null;
        if (n.tagName === 'path') p = new Path2D(n.getAttribute('d'));
        else if (n.tagName === 'rect') { p = new Path2D(); p.rect(+n.getAttribute('x'), +n.getAttribute('y'), +n.getAttribute('width'), +n.getAttribute('height')); }
        else if (n.tagName === 'circle') { p = new Path2D(); p.arc(+n.getAttribute('cx'), +n.getAttribute('cy'), +n.getAttribute('r'), 0, Math.PI * 2); }
        else if (n.tagName === 'ellipse') { p = new Path2D(); p.ellipse(+n.getAttribute('cx'), +n.getAttribute('cy'), +n.getAttribute('rx'), +n.getAttribute('ry'), 0, 0, Math.PI * 2); }
        if (p) this.base.push({ p, fill: paint[0], stroke: paint[1] || null, dash: cls === 'mm-post' });
      });
    } catch { this.base = []; }
    this.blockPaths = M.blocks.map((b) => (b.path ? new Path2D(b.path) : null));
    this.productPaths = M.products.map((p) => p.paths.map((d) => new Path2D(d)));
    this.boxPaths = M.boxes.map((b) => new Path2D(b.path));
    this.zonePaths = M.zones.map((z) => new Path2D(z.path));
    // Grid of seats, 2 m cells.
    this.grid = new Map(); const S = M.seats;
    for (let k = 0; k < S.n; k++) { const key = `${Math.floor(S.x[k] / 2)},${Math.floor(S.z[k] / 2)}`; let a = this.grid.get(key); if (!a) this.grid.set(key, a = []); a.push(k); }
    this.blockLevel = M.blocks.map((b) => b.level);
  }

  visibleLevel(id) { return this.level === 'all' || this.level === id; }
  setLevel(id) { this.level = id; this.hover = null; this.draw(); }

  /* ---------- View ---------- */

  resize() {
    const w = this.host.clientWidth; const h = this.host.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.dpr = dpr; this.W = w; this.H = h;
    if (this.pendingReveal && this.M) { const s = this.pendingReveal; this.pendingReveal = null; this.reveal(s, false); }
    this.draw();
  }
  fitScale() { const f = this.M?.frame; if (!f || !this.W) return 1; return Math.min(this.W / f.w, this.H / f.h) * 0.96; }
  scale() { return this.fitScale() * this.zoom; }
  maxZoom() { return Math.max(4, 110 / this.fitScale()); }
  toScreen(x, z) { const s = this.scale(); return [this.W / 2 + (x - this.cx) * s, this.H / 2 + (z - this.cz) * s]; }
  toWorld(px, py) { const s = this.scale(); return [this.cx + (px - this.W / 2) / s, this.cz + (py - this.H / 2) / s]; }
  reset(draw = true) { const f = this.M?.frame; this.zoom = 1; if (f) { this.cx = f.cx; this.cz = f.cz; } if (draw) this.draw(); }
  zoomBy(f, px = this.W / 2, py = this.H / 2) {
    const [wx, wz] = this.toWorld(px, py);
    this.zoom = clamp(this.zoom * f, 1, this.maxZoom());
    const s = this.scale(); this.cx = wx - (px - this.W / 2) / s; this.cz = wz - (py - this.H / 2) / s;
    this.clampPan(); this.draw();
  }
  clampPan() { const f = this.M?.frame; if (!f) return; this.cx = clamp(this.cx, f.x0, f.x0 + f.w); this.cz = clamp(this.cz, f.z0, f.z0 + f.h); }
  // Glide the view to a centre and zoom (a jump under reduced motion).
  glideTo(cx, cz, zoom) {
    zoom = clamp(zoom, 1, this.maxZoom());
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cancelAnimationFrame(this.anim);
    if (reduce || !this.W) { this.cx = cx; this.cz = cz; this.zoom = zoom; this.clampPan(); this.draw(); return; }
    const a = { cx: this.cx, cz: this.cz, z: Math.log(this.zoom) }; const b = { cx, cz, z: Math.log(zoom) }; const t0 = performance.now();
    const step = () => {
      const u = Math.min(1, Math.max(0, (performance.now() - t0) / 420)); const e = 1 - (1 - u) ** 3;
      this.cx = a.cx + (b.cx - a.cx) * e; this.cz = a.cz + (b.cz - a.cz) * e; this.zoom = Math.exp(a.z + (b.z - a.z) * e);
      this.draw(); if (u < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }
  // Pans (and zooms in if needed) so a selection is on screen.
  reveal(sel, glide = true) {
    const M = this.M; if (!sel || !this.W) return;
    let x; let z; let want = this.zoom;
    // Close enough to see single seats (first showing: just past the seat zoom, so the
    // stand round your seat stays in view).
    if (sel.kind === 'seat') { x = M.seats.x[sel.k]; z = M.seats.z[sel.k]; want = Math.max(this.zoom, (SEAT_ZOOM * (glide ? 2.2 : 1.3)) / this.fitScale()); }
    else if (sel.kind === 'box') { const b = M.boxes[sel.idx]; x = b.cx; z = b.cz; want = Math.max(this.zoom, 14 / this.fitScale()); }
    else if (sel.kind === 'zone') { const q = M.zones[sel.idx]; x = q.cx; z = q.cz; }
    if (x == null) return;
    const lv = this.levelOf(sel); if (lv && this.level !== 'all' && this.level !== lv) this.level = lv;
    const [px, py] = this.toScreen(x, z);
    const inside = px > 40 && px < this.W - 40 && py > 40 && py < this.H - 40;
    if (inside && want === this.zoom) { this.draw(); return; }
    if (glide) this.glideTo(x, z, want); else { this.cx = x; this.cz = z; this.zoom = clamp(want, 1, this.maxZoom()); this.clampPan(); }
  }
  focusBlock(rec) {
    if (!rec) return;
    if (this.level !== 'all' && this.level !== rec.level) this.level = rec.level;
    const xs = []; const zs = []; const S = this.M.seats;
    rec.rowList.forEach((r) => r.seats.forEach((k) => { xs.push(S.x[k]); zs.push(S.z[k]); }));
    if (!xs.length) return;
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const z0 = Math.min(...zs); const z1 = Math.max(...zs);
    const span = Math.max(x1 - x0, z1 - z0, 6) * 1.35;
    this.glideTo((x0 + x1) / 2, (z0 + z1) / 2, Math.min(this.W, this.H) / span / this.fitScale());
  }

  setSelection(sel, { reveal = false } = {}) { this.sel = sel; this.cursor = sel; if (reveal) this.reveal(sel); else this.draw(); }
  setYou(you) { this.you = you; this.draw(); }
  focus() { this.canvas.focus({ preventScroll: true }); }

  /* ---------- Drawing ---------- */

  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
  }

  paint() {
    const M = this.M; const g = this.ctx; if (!M || !this.W) return;
    const dpr = this.dpr; const s = this.scale();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0a1422'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const tx = dpr * (this.W / 2 - this.cx * s); const tz = dpr * (this.H / 2 - this.cz * s);
    g.setTransform(dpr * s, 0, 0, dpr * s, tx, tz);
    const px = 1 / s; // one CSS pixel in world units
    // Base plan (pitch, stage, track, stand shells).
    this.base.forEach((b) => {
      if (!b.p) return;
      if (b.fill) { g.fillStyle = b.fill; g.fill(b.p); }
      if (b.stroke) { g.strokeStyle = b.stroke; g.lineWidth = 1.2 * px; g.setLineDash(b.dash ? [3 * px, 3 * px] : []); g.stroke(b.p); g.setLineDash([]); }
    });
    // Blocks.
    const hoverBlock = this.hover?.kind === 'seat' ? M.seats.blk[this.hover.k] : this.hover?.kind === 'block' ? this.hover.idx : -1;
    const selBlock = this.sel?.kind === 'seat' ? M.seats.blk[this.sel.k] : -1;
    M.blocks.forEach((b, i) => {
      const p = this.blockPaths[i]; if (!p || !this.visibleLevel(b.level)) return;
      g.fillStyle = b.floor ? '#34302a' : (i === hoverBlock ? '#3a5276' : '#2b3e5e'); g.fill(p);
      g.strokeStyle = i === selBlock ? 'rgba(232,194,122,.95)' : 'rgba(255,255,255,.22)'; g.lineWidth = (i === selBlock ? 2 : 1) * px; g.stroke(p);
    });
    // Hospitality products, tinted.
    M.products.forEach((pr, j) => {
      if (pr.level && !this.visibleLevel(pr.level)) return;
      const c = this.tint.get(pr.ai) || TINTS[0];
      this.productPaths[j].forEach((p) => { g.globalAlpha = 0.34; g.fillStyle = c; g.fill(p); g.globalAlpha = 1; g.strokeStyle = c; g.lineWidth = 1.6 * px; g.stroke(p); });
    });
    // Areas without numbered seats.
    M.zones.forEach((zn, j) => {
      if (!this.visibleLevel(zn.level)) return;
      const c = this.tint.get(zn.ai);
      const on = this.sel?.kind === 'zone' && this.sel.idx === j; const hov = this.hover?.kind === 'zone' && this.hover.idx === j;
      g.globalAlpha = c ? (hov ? 0.55 : 0.4) : (hov ? 0.4 : 0.25); g.fillStyle = c || '#9aa7b8'; g.fill(this.zonePaths[j]); g.globalAlpha = 1;
      g.strokeStyle = on ? '#f3d9a4' : (c || 'rgba(255,255,255,.4)'); g.lineWidth = (on ? 2.4 : 1.2) * px; g.stroke(this.zonePaths[j]);
    });
    // Boxes.
    M.boxes.forEach((bx, j) => {
      if (!this.visibleLevel(bx.level)) return;
      const c = this.tint.get(bx.ai) || '#8fa8c8';
      const on = this.sel?.kind === 'box' && this.sel.idx === j; const hov = (this.hover?.kind === 'box' && this.hover.idx === j) || (this.cursor?.kind === 'box' && this.cursor.idx === j);
      g.globalAlpha = on ? 0.95 : hov ? 0.75 : 0.5; g.fillStyle = on ? '#e8c27a' : c; g.fill(this.boxPaths[j]); g.globalAlpha = 1;
      g.strokeStyle = on ? '#fff' : 'rgba(10,20,34,.9)'; g.lineWidth = (on ? 2 : 1) * px; g.stroke(this.boxPaths[j]);
    });
    // Seats.
    const S = M.seats;
    const [wx0, wz0] = this.toWorld(-10, -10); const [wx1, wz1] = this.toWorld(this.W + 10, this.H + 10);
    if (s >= SEAT_ZOOM && S.n) {
      const r = Math.min(0.22, Math.max(0.16, 2.2 / s));
      const groups = new Map();
      for (let k = 0; k < S.n; k++) {
        const x = S.x[k]; const z = S.z[k];
        if (x < wx0 || x > wx1 || z < wz0 || z > wz1) continue;
        if (!this.visibleLevel(this.blockLevel[S.blk[k]])) continue;
        const c = this.tint.get(S.area[k]) || '#b9c6d8';
        let path = groups.get(c); if (!path) groups.set(c, path = new Path2D());
        path.moveTo(x + r, z); path.arc(x, z, r, 0, Math.PI * 2);
      }
      groups.forEach((path, c) => { g.fillStyle = c; g.fill(path); });
    }
    // Access places.
    if (M.access.length) {
      g.fillStyle = '#4f9cff'; g.strokeStyle = '#fff'; g.lineWidth = 1.2 * px;
      M.access.forEach((a) => {
        const blk = M.blockById.get(String(a.block).toLowerCase()); if (blk && !this.visibleLevel(blk.level)) return;
        const rr = Math.max(0.5, 4 * px); g.beginPath(); g.arc(a.x, a.z, rr, 0, Math.PI * 2); g.fill(); g.stroke();
      });
    }
    // Hover, cursor and selection marks (world space).
    const ring = (k, color, w, rad) => { g.beginPath(); g.arc(S.x[k], S.z[k], rad, 0, Math.PI * 2); g.strokeStyle = color; g.lineWidth = w * px; g.stroke(); };
    if (this.hover?.kind === 'seat' && s >= SEAT_ZOOM) ring(this.hover.k, '#fff', 1.6, Math.max(0.32, 5 * px));
    if (this.cursor?.kind === 'seat' && this.cursor.k !== this.sel?.k && document.activeElement === this.canvas) { g.setLineDash([2 * px, 2 * px]); ring(this.cursor.k, '#f3d9a4', 1.6, Math.max(0.36, 6 * px)); g.setLineDash([]); }
    if (this.sel?.kind === 'seat') {
      const k = this.sel.k; const x = S.x[k]; const z = S.z[k];
      if (this.you) {
        const L0 = 70 * px; const a = this.you.angle; const h = this.you.half || 0.5;
        g.beginPath(); g.moveTo(x, z); g.arc(x, z, L0, a - h, a + h); g.closePath();
        g.fillStyle = 'rgba(243,217,164,.28)'; g.fill();
      }
      g.beginPath(); g.arc(x, z, Math.max(0.24, 4.2 * px), 0, Math.PI * 2); g.fillStyle = '#e8c27a'; g.fill();
      g.lineWidth = 2 * px; g.strokeStyle = '#fff'; g.stroke();
      ring(k, 'rgba(232,194,122,.9)', 1.4, Math.max(0.5, 9 * px));
    }
    // Labels (screen space).
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    this.base.forEach((b) => {
      if (!b.text) return; const [x, y] = this.toScreen(b.x, b.y);
      g.font = '600 10px Poppins, Arial, sans-serif'; g.fillStyle = 'rgba(232,214,179,.7)'; g.fillText(b.text, x, y);
    });
    const blockPx = (b) => Math.hypot(b.arc ? (b.arc[1] - b.arc[0]) : 8, 4) * s;
    M.blocks.forEach((b, i) => {
      if (!this.visibleLevel(b.level) || !b.path) return;
      const [x, y] = this.toScreen(b.cx, b.cz);
      if (x < -20 || y < -20 || x > this.W + 20 || y > this.H + 20) return;
      if (blockPx(b) < (b.short.length > 3 ? 34 : 20)) return;
      if (b.depthM && b.depthM * s < 11) return; // too thin to label (suite rows at a distance)
      const big = s >= SEAT_ZOOM;
      g.font = `${big ? 700 : 600} ${big ? 12 : 10}px Poppins, Arial, sans-serif`;
      const label = b.short;
      if (big) { const w = g.measureText(label).width + 10; g.fillStyle = 'rgba(7,17,31,.78)'; g.fillRect(x - w / 2, y - 9, w, 18); }
      g.fillStyle = i === selBlock ? '#f3d9a4' : 'rgba(255,255,255,.88)'; g.fillText(label, x, y);
    });
    // Row labels and seat numbers for the blocks round your seat or the pointer, when close.
    if (s >= 18) {
      const focusBlocks = new Set([selBlock, hoverBlock, this.cursor?.kind === 'seat' ? S.blk[this.cursor.k] : -1].filter((v) => v >= 0));
      focusBlocks.forEach((bi) => {
        const b = M.blocks[bi]; if (!this.visibleLevel(b.level)) return;
        g.font = '600 10px Poppins, Arial, sans-serif'; g.fillStyle = 'rgba(243,217,164,.95)';
        b.rowList.forEach((r) => {
          const k0 = r.seats[0]; const k1 = r.seats[1] ?? k0; if (k0 == null) return;
          const ex = S.x[k0] - (S.x[k1] - S.x[k0]) * 1.6; const ez = S.z[k0] - (S.z[k1] - S.z[k0]) * 1.6;
          const [x, y] = this.toScreen(ex, ez); g.fillText(r.label, x, y);
          if (s >= NUM_ZOOM) {
            g.font = '600 9px Poppins, Arial, sans-serif'; g.fillStyle = 'rgba(7,17,31,.95)';
            r.seats.forEach((k) => { const [sx, sy] = this.toScreen(S.x[k], S.z[k]); if (sx > -10 && sy > -10 && sx < this.W + 10 && sy < this.H + 10) g.fillText(String(S.num[k]), sx, sy + 0.5); });
            g.font = '600 10px Poppins, Arial, sans-serif'; g.fillStyle = 'rgba(243,217,164,.95)';
          }
        });
      });
    }
    // Box numbers and area names.
    M.boxes.forEach((bx, j) => {
      if (!this.visibleLevel(bx.level) || !bx.number) return;
      const [x, y] = this.toScreen(bx.cx, bx.cz); if (x < -20 || x > this.W + 20 || y < -20 || y > this.H + 20) return;
      const w = this.boxPaths && s * 3; if (w < 16) return;
      g.font = '600 9px Poppins, Arial, sans-serif'; g.fillStyle = this.sel?.kind === 'box' && this.sel.idx === j ? '#07111f' : 'rgba(7,17,31,.95)';
      g.fillText(bx.number, x, y);
    });
    const named = [...M.products.map((p) => ({ x: p.cx, z: p.cz, t: p.name, level: p.level })), ...M.zones.map((zn) => ({ x: zn.cx, z: zn.cz, t: zn.label, level: zn.level }))];
    if (s < SEAT_ZOOM * 1.6) {
      g.font = '600 10px Poppins, Arial, sans-serif';
      const placed = [];
      named.forEach((n) => {
        if (n.level && !this.visibleLevel(n.level)) return;
        const [x, y] = this.toScreen(n.x, n.z); const w = g.measureText(n.t).width + 10;
        if (x < 0 || x > this.W || y < 0 || y > this.H) return;
        if (placed.some((p) => Math.abs(p[0] - x) < (p[2] + w) / 2 && Math.abs(p[1] - y) < 16)) return;
        placed.push([x, y, w]);
        g.fillStyle = 'rgba(7,17,31,.82)'; g.fillRect(x - w / 2, y - 8, w, 16);
        g.fillStyle = '#f3d9a4'; g.fillText(n.t, x, y);
      });
    }
  }

  /* ---------- Hit testing ---------- */

  hitAt(px, py) {
    const M = this.M; if (!M) return null;
    const [x, z] = this.toWorld(px, py); const s = this.scale(); const S = M.seats;
    if (s >= SEAT_ZOOM && S.n) {
      const R = Math.max(0.4, 9 / s); let best = -1; let bd = R * R;
      for (let gx = Math.floor((x - R) / 2); gx <= Math.floor((x + R) / 2); gx++) {
        for (let gz = Math.floor((z - R) / 2); gz <= Math.floor((z + R) / 2); gz++) {
          (this.grid.get(`${gx},${gz}`) || []).forEach((k) => {
            if (!this.visibleLevel(this.blockLevel[S.blk[k]])) return;
            const d = (S.x[k] - x) ** 2 + (S.z[k] - z) ** 2; if (d < bd) { bd = d; best = k; }
          });
        }
      }
      if (best >= 0) return { kind: 'seat', k: best };
    }
    const g = this.ctx; g.setTransform(1, 0, 0, 1, 0, 0);
    for (let j = 0; j < M.boxes.length; j++) if (this.visibleLevel(M.boxes[j].level) && g.isPointInPath(this.boxPaths[j], x, z)) return { kind: 'box', idx: j };
    for (let i = 0; i < M.blocks.length; i++) { const p = this.blockPaths[i]; if (p && this.visibleLevel(M.blocks[i].level) && g.isPointInPath(p, x, z)) return { kind: 'block', idx: i }; }
    for (let j = M.zones.length - 1; j >= 0; j--) if (this.visibleLevel(M.zones[j].level) && g.isPointInPath(this.zonePaths[j], x, z)) return { kind: 'zone', idx: j };
    return null;
  }

  words(h) {
    const M = this.M; if (!h) return '';
    if (h.kind === 'seat') {
      const k = h.k; const st = refStatus(M, k); const a = M.seats.area[k] >= 0 ? M.areas[M.seats.area[k]] : null;
      const b = M.blocks[M.seats.blk[k]];
      const bits = [st.block === 'stated' ? 'block number stated' : 'block number modelled', st.row === 'stated' ? 'row stated' : 'row modelled', 'seat number modelled'];
      return { main: seatWords(M, k), sub: a ? (a.name.includes(b.levelLabel) ? a.name : `${a.name}, ${b.levelLabel}`) : `${b.levelLabel}: no product placed here in our research`, fine: bits.join(', ') };
    }
    if (h.kind === 'box') { const b = M.boxes[h.idx]; const a = M.areas[b.ai]; return { main: b.label, sub: `${a?.name || ''}, ${b.levelLabel}`, fine: b.numStatus === 'stated' ? 'box number stated, position modelled' : 'position modelled' }; }
    if (h.kind === 'block') { const b = M.blocks[h.idx]; return { main: `${b.label}, ${b.levelLabel}`, sub: b.area >= 0 ? M.areas[b.area].name : '', fine: `${b.status === 'modelled' ? 'number modelled' : `number ${b.status}`}. Select to zoom in.` }; }
    if (h.kind === 'zone') { const zn = M.zones[h.idx]; return { main: zn.label, sub: zn.levelLabel, fine: 'no numbered seats' }; }
    return '';
  }

  showTip(h, px, py) {
    if (!h) { this.tip.hidden = true; return; }
    const w = this.words(h);
    this.tip.innerHTML = '';
    const a = document.createElement('strong'); a.textContent = w.main; this.tip.append(a);
    if (w.sub) { const b = document.createElement('span'); b.textContent = w.sub; this.tip.append(b); }
    if (w.fine) { const c = document.createElement('small'); c.textContent = w.fine; this.tip.append(c); }
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth; const th = this.tip.offsetHeight;
    const x = clamp(px + 14, 4, this.W - tw - 4); const y = py + 18 + th > this.H ? py - th - 12 : py + 18;
    this.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(4, y))}px)`;
  }

  /* ---------- Input ---------- */

  bind() {
    const c = this.canvas;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => {
      try { c.setPointerCapture?.(e.pointerId); } catch { /* not an active pointer (synthetic event) */ }
      this.pointers.set(e.pointerId, pos(e));
      if (this.pointers.size === 1) this.drag = { start: pos(e), last: pos(e), moved: 0 };
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.zoom, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const target = clamp(this.pinch.z * (d / Math.max(1, this.pinch.d)), 1, this.maxZoom());
        this.zoomBy(target / this.zoom, this.pinch.mid[0], this.pinch.mid[1]); this.tip.hidden = true;
        if (this.drag) this.drag.moved = 99;
        return;
      }
      if (this.drag && this.pointers.size === 1) {
        const dx = p[0] - this.drag.last[0]; const dy = p[1] - this.drag.last[1];
        this.drag.moved += Math.abs(dx) + Math.abs(dy); this.drag.last = p;
        if (this.drag.moved > 5) { const s = this.scale(); this.cx -= dx / s; this.cz -= dy / s; this.clampPan(); this.tip.hidden = true; this.draw(); return; }
      }
      if (e.pointerType === 'mouse') { const h = this.hitAt(p[0], p[1]); this.setHover(h); this.showTip(h, p[0], p[1]); c.style.cursor = h ? 'pointer' : 'grab'; }
    });
    const end = (e) => {
      const p = pos(e);
      const wasTap = this.drag && this.drag.moved <= 5 && this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) { const d = this.drag; this.drag = null; if (wasTap && d) this.tap(p[0], p[1]); }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.drag = null; this.pinch = null; });
    c.addEventListener('pointerleave', () => { this.setHover(null); this.tip.hidden = true; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = pos(e); this.zoomBy(Math.exp(-e.deltaY * 0.0016), x, y); }, { passive: false });
    c.addEventListener('keydown', (e) => this.key(e));
    c.addEventListener('focus', () => { if (!this.cursor) this.cursor = this.sel || this.firstCursor(); this.announce(); this.draw(); });
    c.addEventListener('blur', () => this.draw());
  }

  setHover(h) {
    const same = (a, b) => (a?.kind === b?.kind) && (a?.k === b?.k) && (a?.idx === b?.idx);
    if (same(h, this.hover)) return; this.hover = h; this.draw();
  }

  tap(px, py) {
    const h = this.hitAt(px, py); if (!h) return;
    if (h.kind === 'block') { const b = this.M.blocks[h.idx]; this.focusBlock(b); const mid = b.rowList[Math.floor(b.rowList.length / 2)]; const k = mid?.seats[Math.floor(mid.seats.length / 2)]; if (k != null) { this.cursor = { kind: 'seat', k }; this.onCursor(this.cursor); } return; }
    this.cursor = h; this.onPick(h);
  }

  firstCursor() {
    const M = this.M;
    if (M.seats.n) { const b = M.blocks.find((x) => this.visibleLevel(x.level)) || M.blocks[0]; const r = b.rowList[0]; return { kind: 'seat', k: r.seats[0] }; }
    const bx = M.boxes.findIndex((x) => this.visibleLevel(x.level)); if (bx >= 0) return { kind: 'box', idx: bx };
    const zn = M.zones.findIndex((x) => this.visibleLevel(x.level)); if (zn >= 0) return { kind: 'zone', idx: zn };
    return null;
  }

  announce() {
    const w = this.words(this.cursor);
    this.live.textContent = w ? `${w.main}. ${w.sub || ''}. ${w.fine || ''}. Press Enter to choose.`.replace(/\.\s*\./g, '.') : '';
  }

  key(e) {
    const M = this.M; if (!M) return;
    const k = e.key;
    if (k === '+' || k === '=') { e.preventDefault(); this.zoomBy(1.4); return; }
    if (k === '-' || k === '_') { e.preventDefault(); this.zoomBy(1 / 1.4); return; }
    if (k === '0') { e.preventDefault(); this.reset(); return; }
    if (!this.cursor) this.cursor = this.sel || this.firstCursor();
    const cur = this.cursor; if (!cur) return;
    if (k === 'Enter' || k === ' ') { e.preventDefault(); this.onPick(cur); return; }
    const dir = { ArrowLeft: 'prev', ArrowRight: 'next', ArrowUp: 'front', ArrowDown: 'back', Home: 'home', End: 'end' }[k];
    if (!dir) return;
    e.preventDefault();
    if (cur.kind === 'seat') {
      let nk = cur.k;
      if (dir === 'home' || dir === 'end') { const b = M.blocks[M.seats.blk[cur.k]]; const r = b.rowList[M.seats.rib[cur.k]]; nk = dir === 'home' ? r.seats[0] : r.seats[r.seats.length - 1]; }
      else nk = neighbour(M, cur.k, dir);
      this.cursor = { kind: 'seat', k: nk };
      if (this.scale() < SEAT_ZOOM) this.reveal(this.cursor); else this.reveal(this.cursor);
    } else {
      const list = cur.kind === 'box' ? M.boxes : M.zones;
      const vis = list.map((x, j) => j).filter((j) => this.visibleLevel(list[j].level));
      const pos0 = vis.indexOf(cur.idx);
      const step = dir === 'next' || dir === 'back' ? 1 : -1;
      const nj = dir === 'home' ? vis[0] : dir === 'end' ? vis[vis.length - 1] : vis[clamp(pos0 + step, 0, vis.length - 1)];
      this.cursor = { kind: cur.kind, idx: nj }; this.reveal(this.cursor);
    }
    this.onCursor(this.cursor); this.announce(); this.draw();
  }

  dispose() { this.ro.disconnect(); cancelAnimationFrame(this.raf); cancelAnimationFrame(this.anim); this.host.innerHTML = ''; }
}
