// Venue geometry for the Seat Reality Viewer, at true scale in metres. Pure maths, no
// three.js, so the UI (seat picker, numbers panel, mini-map) imports it statically while
// the 3D engine loads later. Rebuilt 02/11/2026 from dev/research/venue-facts.json.
//
// WHAT IS STATED AND WHAT IS MODELLED
// - Stated or derived figures from the research are marked "stated" in the comment next to
//   them (pitch size, rake limits, the Royal Albert Hall's internal axes and dome height,
//   Ascot's 480 m grandstand and 2.5 furlong run-in, and so on).
// - Everything else is modelled: row counts, row depths, tier heights, corner radii, block
//   widths, floor heights in the racecourse stands, the arena bowls. Where a row profile is
//   not published, tiers are designed the way UK stands are designed: rows of 0.8 m tread
//   (FIFA minimum), each riser chosen so the sightline over the head in front clears it by
//   the FIFA preferred C-value of 90 mm, capped at the 35 degree UK maximum rake.
// - The seated eye height (1.1 m above the tread) is our estimate, worked out from the Sports
//   Ground Safety Authority's Accessible Stadia figures (a wheelchair user's eye at 1155 mm,
//   40 to 60 mm above a seated spectator's). The Green Guide and BS EN 13200-1 are paywalled.
// - Block runs (js/data/seatmaps.js) put the aisles of every seated tier at block edges, so
//   the 3D bowl and the seat map share one set of seats: tierSlots() below is the only place
//   seat positions are made (bowl.js builds the 3D seats from it, seatplan.js the map).
//
// Plan coordinates: x and z in metres, y up. In the SVG mini-map, svg x = world x and
// svg y = world z. Ring venues sweep a profile (d across, y up) round a rounded rectangle
// whose offset curves are exact. Arc length s grows anticlockwise seen from above, which
// is always the seated viewer's right.
//
// Public API
//   layoutFor(venueId)                      the venue's layout (cached)
//   seatSpec(venueId, mode, areaId, seat)   camera spec; seat = { place, block, row, pos }
//   seatChoices(venueId, mode, areaId, placeId)  what the seat picker offers
//   seatNumbers(spec)                       distance, eye height, angles, C-value
//   describeSeat(spec), plan(venueId, mode, day), hasLayout(venueId)

import { VENUES, venueById, areaById } from '../data/venues.js';
import { SEATMAPS } from '../data/seatmaps.js';

/* ---------- Ring: rounded rectangle with exact offsets ---------- */

export class Ring {
  constructor(hx, hz, r) {
    this.hx = hx; this.hz = hz; this.r = r;
    this.ax = hx - r; this.az = hz - r;
  }

  segLen(i, d = 0) {
    const { ax, az, r } = this;
    switch (i) {
      case 0: case 8: return ax;
      case 2: case 6: return 2 * az;
      case 4: return 2 * ax;
      default: return Math.max(0, r + d) * Math.PI / 2;
    }
  }

  length(d = 0) { let L = 0; for (let i = 0; i < 9; i++) L += this.segLen(i, d); return L; }

  point(i, f, d = 0) {
    const { hx, hz, ax, az, r } = this;
    const R = r + d;
    let x, z, nx, nz, a;
    switch (i) {
      case 0: x = f * ax; z = hz + d; nx = 0; nz = 1; break;
      case 1: a = Math.PI / 2 * (1 - f); nx = Math.cos(a); nz = Math.sin(a); x = ax + R * nx; z = az + R * nz; break;
      case 2: x = hx + d; z = az - 2 * az * f; nx = 1; nz = 0; break;
      case 3: a = -Math.PI / 2 * f; nx = Math.cos(a); nz = Math.sin(a); x = ax + R * nx; z = -az + R * nz; break;
      case 4: x = ax - 2 * ax * f; z = -hz - d; nx = 0; nz = -1; break;
      case 5: a = -Math.PI / 2 - Math.PI / 2 * f; nx = Math.cos(a); nz = Math.sin(a); x = -ax + R * nx; z = -az + R * nz; break;
      case 6: x = -hx - d; z = -az + 2 * az * f; nx = -1; nz = 0; break;
      case 7: a = Math.PI - Math.PI / 2 * f; nx = Math.cos(a); nz = Math.sin(a); x = -ax + R * nx; z = az + R * nz; break;
      default: x = -ax + ax * f; z = hz + d; nx = 0; nz = 1; break;
    }
    return { x, z, nx, nz, tx: nz, tz: -nx };
  }

  sOf(i, f, d = 0) {
    let s = 0;
    for (let k = 0; k < i; k++) s += this.segLen(k, d);
    return s + f * this.segLen(i, d);
  }

  locate(s, d = 0) {
    const L = this.length(d);
    s = ((s % L) + L) % L;
    for (let i = 0; i < 9; i++) {
      const len = this.segLen(i, d);
      if (s <= len || i === 8) return { i, f: len > 0 ? Math.min(1, s / len) : 0 };
      s -= len;
    }
    return { i: 8, f: 1 };
  }

  at(s, d = 0) { const { i, f } = this.locate(s, d); return { ...this.point(i, f, d), s }; }

  dOf(x, z) {
    const qx = Math.abs(x) - this.ax; const qz = Math.abs(z) - this.az;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - this.r;
  }

  sNear(x, z, d = 0) {
    const L = this.length(d);
    let nearS = 0; let nearD = Infinity;
    for (let s = 0; s < L; s += 0.5) {
      const p = this.at(s, d);
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < nearD) { nearD = dd; nearS = s; }
    }
    return nearS;
  }

  samples({ straightStep = 6, cornerSteps = 14 } = {}) {
    const out = [];
    for (let i = 0; i < 9; i++) {
      const isCorner = i % 2 === 1;
      const len = this.segLen(i, 0);
      const n = isCorner ? cornerSteps : Math.max(1, Math.ceil(len / straightStep));
      if (len <= 0) continue;
      for (let k = 0; k < n; k++) out.push({ i, f: k / n });
    }
    out.push({ i: 8, f: 1 });
    return out;
  }

  radials({ straightEvery = 9, cornerSplits = 3 } = {}) {
    const out = [];
    for (let i = 0; i < 9; i++) {
      const isCorner = i % 2 === 1;
      const len = this.segLen(i, 0);
      if (len <= 0.01 && !isCorner) continue;
      if (i === 8) {
        const n = Math.max(1, Math.round(len / straightEvery));
        for (let k = 0; k < n; k++) out.push({ i, f: k / n });
        continue;
      }
      const n = isCorner ? cornerSplits : Math.max(1, Math.round(len / straightEvery));
      for (let k = 0; k < n; k++) out.push({ i, f: k / n });
    }
    return out;
  }

  // Arc length at d = 0 for a plan position on a named side ('e' +z, 'n' +x, 'w' -z,
  // 's' -x) or corner ('ne', 'nw', 'sw', 'se'): v is x on e and w, z on n and s, and the
  // fraction 0..1 round a corner.
  sAt(side, v) {
    const { ax, az } = this;
    const L = this.length(0);
    switch (side) {
      case 'e': return v >= 0 ? v : L + v;
      case 'ne': return this.sOf(1, v);
      case 'n': return this.sOf(2, az > 0 ? (az - v) / (2 * az) : 0.5);
      case 'nw': return this.sOf(3, v);
      case 'w': return this.sOf(4, (ax - v) / (2 * ax));
      case 'sw': return this.sOf(5, v);
      case 's': return this.sOf(6, az > 0 ? (v + az) / (2 * az) : 0.5);
      case 'se': return this.sOf(7, v);
      default: return 0;
    }
  }
}

// A convex rounded polygon with exact offsets (a racecourse loop). Same interface as Ring:
// segments alternate straight and arc; d > 0 is outwards. Used for the round courses.
export class Loop {
  constructor(verts, radii) {
    const n = verts.length; this.n = n;
    let area = 0;
    for (let k = 0; k < n; k++) { const a = verts[k]; const b = verts[(k + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    this.sign = area > 0 ? 1 : -1;
    this.corners = verts.map((v, k) => {
      const p = verts[(k - 1 + n) % n]; const q = verts[(k + 1) % n];
      const a = norm([v[0] - p[0], v[1] - p[1]]); const b = norm([q[0] - v[0], q[1] - v[1]]);
      const turn = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
      const r = radii[k]; const t = r * Math.tan(turn / 2);
      const nIn = [-a[1] * this.sign, a[0] * this.sign]; // inward normal of the incoming edge
      const c = [v[0] - a[0] * t + nIn[0] * r, v[1] - a[1] * t + nIn[1] * r];
      const t0 = [v[0] - a[0] * t, v[1] - a[1] * t]; const t1 = [v[0] + b[0] * t, v[1] + b[1] * t];
      return { v, a, b, r, turn, c, t0, t1 };
    });
  }

  segLen(j, d = 0) {
    const k = j >> 1; const C = this.corners[k];
    if (j % 2 === 0) { const N = this.corners[(k + 1) % this.n]; return Math.hypot(N.t0[0] - C.t1[0], N.t0[1] - C.t1[1]); }
    return Math.max(0, this.corners[(k + 1) % this.n].r + d) * this.corners[(k + 1) % this.n].turn;
  }

  get segs() { return this.n * 2; }
  length(d = 0) { let L = 0; for (let j = 0; j < this.segs; j++) L += this.segLen(j, d); return L; }

  point(j, f, d = 0) {
    const k = j >> 1; const C = this.corners[k]; const N = this.corners[(k + 1) % this.n];
    if (j % 2 === 0) {
      const ox = -C.b[1] * this.sign * -1; const oz = C.b[0] * this.sign * -1; // outward normal
      const x = C.t1[0] + (N.t0[0] - C.t1[0]) * f + ox * d; const z = C.t1[1] + (N.t0[1] - C.t1[1]) * f + oz * d;
      return { x, z, nx: ox, nz: oz, tx: C.b[0], tz: C.b[1] };
    }
    const a0 = Math.atan2(N.t0[1] - N.c[1], N.t0[0] - N.c[0]);
    const ang = a0 + this.sign * N.turn * f;
    const nx = Math.cos(ang); const nz = Math.sin(ang); const R = N.r + d;
    return { x: N.c[0] + nx * R, z: N.c[1] + nz * R, nx, nz, tx: -nz * this.sign, tz: nx * this.sign };
  }

  sOf(j, f, d = 0) { let s = 0; for (let q = 0; q < j; q++) s += this.segLen(q, d); return s + f * this.segLen(j, d); }
  locate(s, d = 0) {
    const L = this.length(d); s = ((s % L) + L) % L;
    for (let j = 0; j < this.segs; j++) { const len = this.segLen(j, d); if (s <= len || j === this.segs - 1) return { i: j, f: len > 0 ? Math.min(1, s / len) : 0 }; s -= len; }
    return { i: this.segs - 1, f: 1 };
  }
  at(s, d = 0) { const { i, f } = this.locate(s, d); return { ...this.point(i, f, d), s }; }
  samples({ straightStep = 8, cornerSteps = 40 } = {}) {
    const out = [];
    for (let j = 0; j < this.segs; j++) {
      const n = j % 2 ? cornerSteps : Math.max(1, Math.ceil(this.segLen(j) / straightStep));
      for (let k = 0; k < n; k++) out.push({ i: j, f: k / n });
    }
    out.push({ i: this.segs - 1, f: 1 });
    return out;
  }
}
const norm = ([x, z]) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

/* ---------- Design defaults (research _designGuideDefaults) ---------- */

export const DESIGN = {
  eye: 1.1,        // modelled: seated eye height above the tread, estimated from SGSA Accessible Stadia figures
  standEye: 1.62,  // modelled assumption: standing eye height
  tread: 0.8,      // design-guide default: FIFA minimum row depth, 800 mm
  c: 0.09,         // design-guide default: FIFA preferred C-value, 90 mm (60 minimum, 120 optimal)
  cMin: 0.06, cOpt: 0.12,
  maxRake: 35,     // stated for Tottenham and quoted by Populous as the UK maximum, 35 degrees
};
const rad = (deg) => deg * Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Tier maths ---------- */

// A tier is a run of stepped rows. Row i: tread from rowD(i) to rowD(i + 1) at height
// rowY(i). Designed tiers carry their heights in ys (from designTier()); older ones use
// y0 + rise * i + curve * i * i.
export const rowY = (t, i) => {
  if (t.ys) {
    const n = t.ys.length;
    if (i < n) return t.ys[Math.max(0, i)];
    return t.ys[n - 1] + (i - n + 1) * (t.ys[n - 1] - t.ys[n - 2] || 0.4);
  }
  return t.y0 + t.rise * i + t.curve * i * i;
};
export const rowD = (t, i) => t.d0 + i * t.depth;
export const tierBackD = (t) => t.d0 + t.rows * t.depth;
export const seatD = (t, i) => rowD(t, i) + t.depth * 0.42;

// Designs a tier the way UK stands are designed: each riser makes the sightline from the
// eye of row i over the head of row i - 1 to the focal point clear it by c, capped at the
// maximum rake. focalD: horizontal distance from the ring line (d = 0) to the focal point
// (nearest touchline, stage front, floor edge). fixedRake: a stated rake in degrees.
export function designTier(o) {
  const t = { id: o.id, d0: o.d0, rows: o.rows, depth: o.depth ?? DESIGN.tread, rise: 0, curve: 0,
    focalD: o.focalD ?? 1, focalY: o.focalY ?? 0, eye: o.eye ?? DESIGN.eye, c: o.c ?? DESIGN.c,
    maxRake: o.maxRake ?? DESIGN.maxRake, fixedRake: o.fixedRake ?? null, label: o.label || '' };
  const T = t.depth; const maxR = T * Math.tan(rad(t.maxRake));
  const D = (i) => t.focalD + seatD(t, i);
  const ys = [o.y0];
  for (let i = 1; i < t.rows; i++) {
    let R;
    if (t.fixedRake != null) R = T * Math.tan(rad(t.fixedRake));
    else {
      const Np = ys[i - 1] + t.eye - t.focalY;
      R = (Np + t.c) * (D(i) / D(i - 1)) - Np;
    }
    ys.push(ys[i - 1] + clamp(R, o.minRise ?? 0.12, maxR));
  }
  t.ys = ys; t.y0 = ys[0];
  return t;
}

// Sightline C-value (metres) for row i of a designed tier, against its focal point.
export function cValue(t, i) {
  if (!t || !t.ys || i < 1) return null;
  const R = rowY(t, i) - rowY(t, i - 1);
  const D = (t.focalD ?? 1) + seatD(t, i);
  const N = rowY(t, i) + (t.eye ?? DESIGN.eye) - (t.focalY ?? 0);
  return R - N * t.depth / D;
}
export const rakeDeg = (t, i) => (i < 1 ? null : Math.atan((rowY(t, i) - rowY(t, i - 1)) / t.depth) * 180 / Math.PI);

/* ---------- Seat slots (shared by the 3D bowl and the seat map) ---------- */

// Seats sit on 500 mm centres (design standard minimum, FIFA and the Green Guide for new
// stands), stretched evenly to fill each block; aisles are 1.15 m wide (modelled) and a
// vomitory mouth clears 1.35 m either side of its radial line (modelled).
export const SEAT_W = 0.5; export const AISLE_W = 1.15; export const VOM_HALF = 1.35;

// Every seat of a tier: rows of seats between aisle radial lines, split round vomitories,
// limited by allow(point). opts.radials is a list of { i, f } ring positions or a function
// of the row index (block runs differ by row). Returns
//   slots:  [{ x, y, z, nx, nz, row, tier, s, w, angle, mid0 }]  (mid0: arc length at d = 0
//           of the middle of the aisle-to-aisle stretch, which names the block)
//   pieces: [{ row, p0, p1, w, first, count, dS, y }] runs of seats for the distant band
//   steps:  aisle half-steps; voms: the radial lines that carry a vomitory.
export function tierSlots(ring, t, opts = {}) {
  const radialsAt = typeof opts.radials === 'function' ? opts.radials : (() => opts.radials || ring.radials());
  const allow = opts.allow || null; const N = t.rows; const Lr0 = ring.length(0);
  const voms = [];
  if (opts.vom) {
    radialsAt(opts.vom.rows[0]).forEach((r, k) => {
      if (k % opts.vom.every !== Math.floor(opts.vom.every / 2)) return;
      if (opts.vom.straightOnly !== false && r.i % 2 === 1) return;
      if (allow && !allow(ring.point(r.i, r.f, t.d0))) return;
      if (opts.vom.allow && !opts.vom.allow(ring.point(r.i, r.f, t.d0))) return;
      voms.push(r);
    });
  }
  const splitAllowed = (a0, a1, dS) => {
    const out = []; let cur = null;
    for (let s = a0; s < a1 - 1e-6; s += 0.5) {
      const m = Math.min(s + 0.5, a1);
      if (allow(ring.at((s + m) / 2, dS))) { if (cur) cur[1] = m; else cur = [s, m]; } else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
  };
  const slots = []; const pieces = []; const steps = [];
  for (let i = 0; i < N; i++) {
    const radials = radialsAt(i); if (!radials || !radials.length) continue;
    const dS = seatD(t, i); const y = rowY(t, i);
    const sList = radials.map((r) => ring.sOf(r.i, r.f, dS));
    const s0List = radials.map((r) => ring.sOf(r.i, r.f, 0));
    const Ltot = ring.length(dS);
    const vomS = voms.map((r) => ring.sOf(r.i, r.f, dS));
    const inVomRow = opts.vom && i >= opts.vom.rows[0] && i <= opts.vom.rows[1];
    for (let a = 0; a < sList.length; a++) {
      const s0 = sList[a] + AISLE_W / 2;
      const s1 = (a + 1 < sList.length ? sList[a + 1] : sList[0] + Ltot) - AISLE_W / 2;
      if (s1 - s0 < SEAT_W) continue;
      const e0 = s0List[a]; const e1 = a + 1 < s0List.length ? s0List[a + 1] : s0List[0] + Lr0;
      const mid0 = (((e0 + e1) / 2) % Lr0 + Lr0) % Lr0;
      // Half-step in the aisle at the start of this block (between rows).
      if (i < N - 1) {
        const p = ring.at(sList[a], rowD(t, i) + t.depth * 0.75);
        if (!allow || allow(p)) steps.push({ x: p.x, z: p.z, y0: y, y1: y + (rowY(t, i + 1) - y) / 2, d: t.depth * 0.5, nx: p.nx, nz: p.nz });
      }
      let parts = [[s0, s1]];
      if (allow) parts = splitAllowed(s0, s1, dS);
      if (inVomRow) {
        vomS.forEach((vs) => {
          for (let q = parts.length - 1; q >= 0; q--) {
            const [a0, a1] = parts[q]; const v0 = vs - VOM_HALF; const v1 = vs + VOM_HALF;
            if (v1 <= a0 || v0 >= a1) continue;
            parts.splice(q, 1);
            if (v0 - a0 > SEAT_W) parts.push([a0, v0]);
            if (a1 - v1 > SEAT_W) parts.push([v1, a1]);
          }
        });
        parts.sort((u, v) => u[0] - v[0]);
      }
      parts.forEach(([p0, p1]) => {
        const n = Math.floor((p1 - p0) / SEAT_W);
        if (n < 1) return;
        const w = (p1 - p0) / n; const first = slots.length;
        for (let k = 0; k < n; k++) {
          const s = p0 + (k + 0.5) * w; const p = ring.at(s, dS);
          slots.push({ x: p.x, y, z: p.z, nx: p.nx, nz: p.nz, row: i, tier: t.id, s, angle: Math.atan2(p.z, p.x), w, mid0 });
        }
        pieces.push({ row: i, p0, p1, w, first, count: n, dS, y });
      });
    }
  }
  return { slots, pieces, steps, voms };
}

/* ---------- Block runs (js/data/seatmaps.js) ---------- */

// Each run as arcs at d = 0: { ...run, arc, rows, blocks: [{ id, arc, status, ord }] }.
function runsFor(L, venueId) {
  const data = SEATMAPS[venueId];
  if (!data?.runs || !L.ring || L.archetype === 'racecourse') return [];
  const ring = L.ring; const Lr = ring.length(0);
  return data.runs.map((r, k) => {
    let a = ring.sOf(r.from[0], r.from[1]); let b = ring.sOf(r.to[0], r.to[1]);
    if (b <= a + 1e-6) b += Lr;
    if (r.span) { const w0 = b - a; [a, b] = [a + w0 * r.span[0], a + w0 * r.span[1]]; }
    const n = r.ids.length; const w = (b - a) / n; const t = L.tiers[r.tier];
    const stated = new Set(r.stated === 'all' ? r.ids.map(String) : (r.stated || []).map(String));
    const blocks = r.ids.map((id, j) => {
      const q = r.order === 'cw' ? n - 1 - j : j;
      return { id: String(id), arc: [a + w * q, a + w * (q + 1)], status: stated.has(String(id)) ? (r.statedAs || 'stated') : 'modelled', ord: j };
    });
    return { ...r, k, arc: [a, b], rows: r.rows || [0, (t?.rows || 1) - 1], blocks };
  });
}

// Arc at d = 0 covering the named blocks of a venue's runs (for product sections).
function blockSpan(ring, venueId, tierId, ids) {
  const Lr = ring.length(0); let lo = Infinity; let hi = -Infinity;
  (SEATMAPS[venueId]?.runs || []).filter((r) => r.tier === tierId).forEach((r) => {
    let a = ring.sOf(r.from[0], r.from[1]); let b = ring.sOf(r.to[0], r.to[1]); if (b <= a + 1e-6) b += Lr;
    if (r.span) { const w0 = b - a; [a, b] = [a + w0 * r.span[0], a + w0 * r.span[1]]; }
    const n = r.ids.length; const w = (b - a) / n;
    r.ids.forEach((id, j) => { if (!ids.includes(String(id))) return; const q = r.order === 'cw' ? n - 1 - j : j; lo = Math.min(lo, a + w * q); hi = Math.max(hi, a + w * (q + 1)); });
  });
  return Number.isFinite(lo) ? [lo + 0.5, hi - 0.5] : null;
}

// The aisle radial lines of a tier for a given row: every block edge of the runs that cover
// that row, in ring order. Returns a function of the row index, or null (no runs).
export function tierRadials(L, tierId) {
  const runs = (L.runs || []).filter((r) => r.tier === tierId);
  if (!runs.length) return null;
  const ring = L.ring; const Lr = ring.length(0); const cache = new Map();
  return (i) => {
    const on = runs.filter((r) => i >= r.rows[0] && i <= r.rows[1]);
    const key = on.map((r) => r.k).join(',');
    if (cache.has(key)) return cache.get(key);
    const ss = [];
    on.forEach((r) => r.blocks.forEach((b) => ss.push(b.arc[0], b.arc[1])));
    const sorted = ss.map((s) => ((s % Lr) + Lr) % Lr).sort((x, y) => x - y);
    const uniq = [];
    sorted.forEach((s) => { if (!uniq.length || s - uniq[uniq.length - 1] > 0.05) uniq.push(s); });
    if (uniq.length > 1 && uniq[0] + Lr - uniq[uniq.length - 1] < 0.05) uniq.pop();
    const out = uniq.map((s) => ring.locate(s, 0));
    cache.set(key, out);
    return out;
  };
}

// Everything tierSlots needs for one tier, exactly as the 3D builder uses it.
export function tierBuildOpts(L, tierId) {
  const o = L.tierOpts?.[tierId] || {};
  return { radials: tierRadials(L, tierId) || o.radials || L.ring.radials(), vom: o.vom || null, allow: o.allow || null };
}

/* ---------- Seat choices ---------- */

export const ROW_KEYS = ['front', 'middle', 'back'];
export const POS_KEYS = ['left', 'centre', 'right'];
const POS_U = { left: 0.15, centre: 0.5, right: 0.85 };

// Row choice to an index 0..n-1. row: 'front' | 'middle' | 'back' | a row number (1-based).
export function rowIndex(row, n) {
  if (n <= 1) return 0;
  const k = Number(row);
  if (Number.isFinite(k) && k >= 1) return clamp(Math.round(k) - 1, 0, n - 1);
  if (row === 'front') return 0;
  if (row === 'back') return n - 1;
  return Math.floor((n - 1) / 2);
}
// Position choice to a fraction 0..1 along the row, from the viewer's left.
export function posFrac(pos) {
  if (pos in POS_U) return POS_U[pos];
  const k = Number(pos);
  return Number.isFinite(k) ? clamp(k / 100, 0, 1) : 0.5;
}

/* ---------- Shared seat helpers ---------- */

function aimAt(p, poi) { return [poi.x, poi.y, poi.z]; }

function tierSeatAt(L, t, i, s, extra = {}) {
  const ring = L.ring; const { i: si, f } = ring.locate(s, 0); const d = seatD(t, i);
  const p = ring.point(si, f, d);
  const eye = extra.eye ?? t.eye ?? DESIGN.eye;
  return { position: [p.x, rowY(t, i) + eye, p.z], normal: [p.nx, 0, p.nz], rowIndex: i, tierId: t.id, snapTier: t.id, eye, tier: t, ...extra };
}

function sectionArc(L, sec, block) {
  let [a, b] = sec.arc;
  const bs = sec.blocks && L.blocks?.[sec.blocks];
  if (bs && block) {
    const k = bs.ids.indexOf(String(block));
    if (k >= 0) {
      const w = (bs.arc[1] - bs.arc[0]) / bs.ids.length;
      a = bs.arc[0] + w * k + 0.6; b = a + w - 1.2;
    }
  }
  return [a, b];
}

/* ---------- Tottenham Hotspur Stadium ---------- */

function tottenham() {
  // Stated: pitch 105 x 68 m inside a grass area of 114.58 x 79.84 m (planning statement).
  // The ring is the edge of that grass area. Corner radius modelled.
  const ring = new Ring(57.29, 39.92, 12);
  const pitch = { hx: 52.5, hz: 34 };
  // Distance from the ring line to the nearest touchline (sides) and goal line (ends).
  const sideGap = ring.hz - pitch.hz; const endGap = ring.hx - pitch.hx;
  // Multi-tier stands (East, West, North). Front row about 6.8 m from the touchline at the
  // sides (stated range 4.9 to 6.9 m). Levels 1 to 5 stated; tier heights modelled so the
  // top of Level 5 sits near the stated 33.2 to 35.5 m stand heights.
  const l1 = designTier({ id: 'l1', label: 'Level 1', d0: 0.6, y0: 1.0, rows: 18, focalD: sideGap });
  const l2 = designTier({ id: 'l2', label: 'Levels 2 and 3', d0: tierBackD(l1) + 0.8, y0: rowY(l1, l1.rows - 1) + 2.2, rows: 8, depth: 0.9, focalD: sideGap });
  const lounge = { glassD: tierBackD(l2) + 0.4, floorY: rowY(l2, l2.rows - 1), top: rowY(l2, l2.rows - 1) + 3.6, backD: tierBackD(l2) + 7.5 };
  // Level 4: four rows (modelled; The H Club is entered at Row 3, measured, so there are at
  // least three), the last two in front of the suites.
  const l4 = designTier({ id: 'l4', label: 'Level 4', d0: lounge.glassD - 0.2, y0: lounge.top + 0.45, rows: 4, depth: 1.0, focalD: sideGap });
  const suites = { glassD: tierBackD(l4) + 0.35, floorY: rowY(l4, 3), top: rowY(l4, 3) + 2.9, backD: tierBackD(l4) + 6.5 };
  // Level 5 starts far enough back that its front row still clears the near touchline at
  // the 35 degree cap (eye height over distance about 0.62, a C-value near 60 mm).
  const l5y = suites.top + 1.0;
  const l5 = designTier({ id: 'l5', label: 'Level 5', d0: Math.max(suites.glassD + 0.6, (l5y + DESIGN.eye) / 0.62 - sideGap - 0.34), y0: l5y, rows: 16, focalD: sideGap });
  // South Stand: stated single tier raked at 34 degrees, 34.1 m high. Rows modelled.
  const s1 = designTier({ id: 's1', label: 'South Stand', d0: 0.6, y0: 1.0, rows: 58, fixedRake: 34, focalD: endGap });
  const roof = { frontD: -1.5, frontY: 39.5, backY: 41.5 }; // modelled; stated overall height 48 m
  const Lr = ring.length(0);
  // The South Stand runs from the middle of the south-west corner to the middle of the
  // south-east corner (modelled split); the multi-tier stands cover the rest.
  const sArc = [ring.sOf(5, 0.5), ring.sOf(7, 0.5)];
  const mArc = [sArc[1], sArc[0] + Lr];
  const stands = [
    { id: 'multi', arc: mArc, tiers: ['l1', 'l2', 'l4', 'l5'], backD: tierBackD(l5) + 1.2 },
    { id: 'south', arc: sArc, tiers: ['s1'], backD: tierBackD(s1) + 1.2 },
  ];
  const side = (sd, a, b) => sideArc(ring, sd, a, b);
  const T = { l1, l2, l4, l5, s1 };
  const tierSec = (tier, arc, rows, extra = {}) => ({ kind: 'tier', tier, arc, rows: rows || [0, T[tier].rows - 1], ...extra });
  const sections = {
    // The Tunnel Club's first row is Row 3 (measured, AccessAble).
    'w-l1-dugout': tierSec('l1', side('w', 18, 4), [2, 9], { fg: 'front', padded: true }),
    'e-l1': tierSec('l1', side('e', 18, 42), null, { fg: 'standard' }),
    'n-l1': tierSec('l1', side('n', 22, -22), null, { fg: 'standard', modes: ['football', 'nfl'] }),
    'ne-l1': tierSec('l1', [ring.sOf(1, 0.12), ring.sOf(1, 0.88)], null, { fg: 'standard' }),
    's-l1': tierSec('s1', side('s', -28, 28), null, { fg: 'standard' }),
    'e-l2': tierSec('l2', side('e', -11, 11), [0, 3], { fg: 'premium', padded: true }),
    'e-l3': tierSec('l2', side('e', -11, 11), [4, 7], { fg: 'premium', padded: true }),
    'w-l3': tierSec('l2', side('w', 11, -11), [4, 7], { fg: 'premium', padded: true }),
    'e-l2-quarter': tierSec('l2', side('e', 13, 32), [0, 7], { fg: 'premium', padded: true }),
    'w-l2-quarter': tierSec('l2', side('w', -13, -32), [0, 7], { fg: 'premium', padded: true }),
    'e-loge': { kind: 'room', band: 'lounge', arc: side('e', -34, -14) },
    // West Level 4 suites sit south of The H Club (modelled), which takes Blocks 407 to 410.
    'w-l4': { kind: 'room', band: 'suites', arc: side('w', -2, -40) },
    'e-l4': { kind: 'room', band: 'suites', arc: side('e', -24, 24) },
    // The H Club: West Stand Level 4, Blocks 407 to 410, entered at Row 3 (measured, AccessAble).
    'w-l4-club': tierSec('l4', blockSpan(ring, 'tottenham-hotspur-stadium', 'l4', ['407', '408', '409', '410']), [0, 3], { fg: 'premium', padded: true }),
    'sw-booth': { kind: 'room', band: 'suites', arc: [ring.sOf(5, 0.1), ring.sOf(5, 0.45)] },
    'w-l5-front': tierSec('l5', side('w', 9, -9), [0, 3], { fg: 'premium', padded: true }),
    'e-l5-front': tierSec('l5', side('e', -9, 9), [0, 3], { fg: 'premium', padded: true }),
    'e-l5': tierSec('l5', side('e', 16, 40), null, { fg: 'upper' }),
    'n-l5': tierSec('l5', side('n', 20, -20), null, { fg: 'upper', modes: ['football', 'nfl'] }),
    floor: { kind: 'floor' },
  };
  const bands = {
    // The Level 2 and 3 lounges behind the club rows: loge suites use the last two Level 2
    // rows (East Level 2 is measured, AccessAble).
    lounge: { tier: 'l2', seatRows: [2, 3], glassD: lounge.glassD, floorY: lounge.floorY, top: lounge.top, backD: lounge.backD, pitch: 5.2 },
    suites: { tier: 'l4', seatRows: [2, 3], glassD: suites.glassD, floorY: suites.floorY, top: suites.top, backD: suites.backD, pitch: 5.6 },
  };
  // How each tier is built (the 3D bowl and the seat map both read this). Vomitories sit away
  // from the middle rows, so a default seat is not beside a tunnel mouth.
  const angleOf = (p) => Math.abs(Math.atan2(p.nz, p.nx));
  const inSouth = (p) => angleOf(p) >= Math.PI * 0.75; const inMulti = (p) => !inSouth(p);
  const tierOpts = {
    l1: { allow: inMulti, vom: { every: 3, rows: [12, 14] } },
    l2: { allow: inMulti }, l4: { allow: inMulti },
    l5: { allow: inMulti, vom: { every: 3, rows: [10, 12] } },
    s1: { allow: inSouth, vom: { every: 3, rows: [18, 20] } },
  };
  const stage = { frontX: 30, backX: 50, hz: 24, deck: 2.4 }; // modelled: the venue does not publish the stage end
  // NFL (design standard: the NFL rulebook): 120 x 53 1/3 yards including the end zones,
  // 10-yard end zones, hash marks 70 ft 9 in from each sideline, goalposts on the end lines.
  // Stated: the NFL field sits 1.6 m below the grass, which slides away under the South
  // Stand. The field runs along the pitch's long axis (x) like the football pitch (modelled).
  const YD = 0.9144;
  const nfl = { hx: 60 * YD, hz: (160 / 6) * YD, endZone: 10 * YD, level: -1.6, hashZ: (160 / 2 - 70.75) * 0.3048, yd: YD };
  // Design points for NFL sightlines: the nearest sideline (sides) or end line (ends).
  const nflFocal = (t) => (t.id === 's1' ? { focalD: ring.hx - nfl.hx, focalY: nfl.level } : { focalD: ring.hz - nfl.hz, focalY: nfl.level });
  return {
    id: 'tottenham-hotspur-stadium', archetype: 'stadium', ring, pitch, tiers: T, lounge, suites, roof, stands, sections, bands, stage, nfl, tierOpts, inSouth, inMulti,
    dugouts: { home: 11, away: -11 },
    focal: (mode) => (mode === 'concert'
      ? { x: stage.frontX + 2, y: stage.deck + 1.7, z: 0, label: 'the front of the stage', floorY: 0 }
      : mode === 'nfl'
        ? { x: 0, y: nfl.level, z: 0, label: 'the 50-yard line, mid-field', floorY: nfl.level, floorWord: 'the field' }
        : { x: 0, y: 0, z: 0, label: 'the centre spot', floorY: 0 }),
    axis: (mode) => (mode === 'concert' ? { x: -1, z: 0, label: 'the stage’s centre line' }
      : mode === 'nfl' ? { x: 0, z: 1, label: 'the 50-yard line', fold: true }
        : { x: 0, z: 1, label: 'the halfway line', fold: true }),
    designPoint: (t, mode) => (mode === 'nfl' ? (t.id === 's1' ? 'the end line' : 'the nearest sideline')
      : t.id === 's1' ? 'the goal line' : 'the nearest touchline'),
    // Per-mode sightline design point (the C-value is measured to it).
    sightTo: (t, mode) => (mode === 'nfl' ? nflFocal(t) : null),
    overview: { position: [-60, 210, 150], target: [0, 0, 6] },
  };
}

// An arc [sA, sB] along a side, always increasing (it may run past the ring length).
function sideArc(ring, sd, a, b) {
  const A = ring.sAt(sd, a); let B = ring.sAt(sd, b);
  if (B < A) B += ring.length(0);
  return [A, B];
}

/* ---------- Arenas ---------- */

// Shared arena kit: lower tier, a suite band (front seat rows plus glass suites), upper
// tier, optional terraces at the top. Values per venue below; all modelled except where a
// comment says stated. Design points (modelled): 6 m into the floor for the lower tiers,
// 10 m for the upper tier, which starts far enough back to keep its sightline at 35 degrees.
function arenaKit(o) {
  const ring = new Ring(o.hx, o.hz, o.r);
  const lower = designTier({ id: 'lower', label: o.lowerLabel, d0: 0.6, y0: 1.2, rows: o.lowerRows, focalD: 6 });
  const sd0 = tierBackD(lower) + 0.3;
  const band = designTier({ id: 'band', label: o.bandLabel, d0: sd0, y0: rowY(lower, lower.rows - 1) + 1.9, rows: o.bandRows || 2, depth: 0.95, focalD: 6 });
  const suite = { d0: sd0, glassD: tierBackD(band) + 0.35, floorY: rowY(band, band.rows - 1), glassTop: rowY(band, band.rows - 1) + 3.0 };
  suite.backD = suite.glassD + 5.5; suite.seatY = [rowY(band, 0), rowY(band, Math.min(1, band.rows - 1))];
  const uy = suite.glassTop + 1.4;
  const upper = designTier({ id: 'upper', label: o.upperLabel, d0: Math.max(suite.glassD - 0.8, (uy + DESIGN.eye) / 0.62 - 10 - 0.34), y0: uy, rows: o.upperRows, focalD: 10 });
  const roofY = rowY(upper, upper.rows - 1) + o.roofGap;
  const floor = { hx: o.hx - 2, hz: o.hz - 2 };
  const stage = { frontX: o.hx - 13, backX: o.hx - 1.5, hz: Math.min(13, o.hz - 5), deck: 1.9 };
  const Lr = ring.length(0);
  // Seated blocks run anticlockwise round everything except the stage end.
  const blocksArc = [ring.sOf(3, 0.85), ring.sOf(1, 0.15) + Lr];
  return { ring, lower, band, suite, upper, roofY, floor, stage, Lr, blocksArc, ring3: { half: 3.65, apron: 4.6, deck: 1.15 } };
}

function arenaLayout(id, o, build) {
  const K = arenaKit(o);
  const { ring } = K;
  const side = (sd, a, b) => sideArc(ring, sd, a, b);
  const T = { lower: K.lower, band: K.band, upper: K.upper };
  const sec = build({ ...K, side, T });
  return {
    id, archetype: 'arena', ring, tiers: T, suite: K.suite, roofY: K.roofY, floor: K.floor, stage: K.stage, ring3: K.ring3,
    tierOpts: { lower: { vom: { every: 3, rows: [7, 9] } }, band: {}, upper: { vom: { every: 3, rows: [6, 8] } } },
    terraces: sec.terraces || [], sections: sec.sections, blocks: sec.blocks, bands: {
      suite: { tier: 'band', seatRows: [0, Math.min(1, K.band.rows - 1)], glassD: K.suite.glassD, floorY: K.suite.floorY, top: K.suite.glassTop, backD: K.suite.backD, pitch: 4.6 },
    },
    focal: (mode) => (mode === 'boxing'
      ? { x: 0, y: K.ring3.deck + 1.2, z: 0, label: 'the centre of the ring', floorY: 0 }
      : { x: K.stage.frontX + 1.5, y: K.stage.deck + 1.7, z: 0, label: 'the front of the stage', floorY: 0 }),
    axis: (mode) => (mode === 'boxing' ? { square: true, label: 'the nearest side of the ring' } : { x: -1, z: 0, label: 'the stage’s centre line' }),
    designPoint: () => 'the edge of the floor',
    overview: { position: [-(o.hx + 40), 120, o.hz + 70], target: [4, 0, 0] },
    notes: o.notes || [],
  };
}

function theArenaLondon() {
  return arenaLayout('the-arena-london', { hx: 34, hz: 23, r: 16, lowerRows: 22, bandRows: 2, upperRows: 22, roofGap: 7, lowerLabel: 'Level 1', bandLabel: 'Suite level', upperLabel: 'Level 4' }, ({ ring, side, T, blocksArc, Lr }) => {
    const l4Arc = [blocksArc[0] + (blocksArc[1] - blocksArc[0]) * 0.12, blocksArc[0] + (blocksArc[1] - blocksArc[0]) * 0.88];
    const blocks = {
      // Stated block numbers (from the venue's bar locations); order round the bowl modelled,
      // starting by the stage so Block 101 is "near the stage" (Club 101, stated).
      l1: { tier: 'lower', ids: range(101, 116), arc: blocksArc },
      l4: { tier: 'upper', ids: range(405, 417), arc: l4Arc },
    };
    void Lr;
    return {
      blocks,
      sections: {
        l1: { kind: 'tier', tier: 'lower', arc: blocksArc, rows: [0, T.lower.rows - 1], blocks: 'l1', fg: 'standard' },
        'l1-terrace': { kind: 'tier', tier: 'lower', arc: blockArc(blocks.l1, ['107', '108']), rows: [T.lower.rows - 1, T.lower.rows - 1], fg: 'standard', stool: true },
        l4: { kind: 'tier', tier: 'upper', arc: l4Arc, rows: [0, T.upper.rows - 1], blocks: 'l4', fg: 'upper' },
        suites: { kind: 'room', band: 'suite', arc: side('w', 6, -14) },
        'suites-side': { kind: 'room', band: 'suite', arc: side('e', -20, 2) },
        floor: { kind: 'floor' },
      },
    };
  });
}

function aoArena() {
  // Stated: 100 level and 200 level, seats all round, end-stage blocks 102 to 115
  // anticlockwise, main roof truss spans 105 m. The bowl is sized so the outside of the
  // upper tier is about 105 m across the short way (modelled, from the truss span).
  // Rows stated: lower tier A to X and upper tier A to R, skipping I and O (22 and 16 rows).
  return arenaLayout('ao-arena', { hx: 31, hz: 19, r: 14, lowerRows: 22, bandRows: 2, upperRows: 16, roofGap: 6, lowerLabel: '100 level', bandLabel: 'Suite level', upperLabel: '200 level' }, ({ side, T, blocksArc }) => {
    const blocks = {
      l1: { tier: 'lower', ids: range(102, 115), arc: blocksArc },
      l2: { tier: 'upper', ids: range(202, 215), arc: blocksArc },
    };
    return {
      blocks,
      sections: {
        l1: { kind: 'tier', tier: 'lower', arc: blocksArc, rows: [0, T.lower.rows - 1], blocks: 'l1', fg: 'standard' },
        l2: { kind: 'tier', tier: 'upper', arc: blocksArc, rows: [0, T.upper.rows - 1], blocks: 'l2', fg: 'upper' },
        // Above Block 115, by the stage end (stated).
        'beautiful-north': { kind: 'room', band: 'suite', arc: blockArc(blocks.l1, ['115']) },
        mezz: { kind: 'tier', tier: 'band', arc: side('s', -10, 10), rows: [0, T.band.rows - 1], fg: 'premium', padded: true },
        suites: { kind: 'room', band: 'suite', arc: side('w', 4, -16) },
        floor: { kind: 'floor' },
      },
    };
  });
}

function coopLive() {
  // Stated: three tiers on a rectangular plan; Level 1 lower, Level 2 premium, Level 3
  // upper, Level 4 lounges on the north and south sides; no seat more than 95 m from the
  // stage; a Level 1 row 24 exists. Derived: end stage at the east end (+x here).
  return arenaLayout('co-op-live', { hx: 31, hz: 22, r: 6, lowerRows: 26, bandRows: 4, upperRows: 18, roofGap: 3.8, lowerLabel: 'Level 1', bandLabel: 'Level 2', upperLabel: 'Level 3' }, ({ ring, side, T, blocksArc }) => {
    const blocks = { l1: { tier: 'lower', ids: range(102, 114), arc: blocksArc } };
    // Level 4 terraces at the top of the upper tier on the long (north and south) sides.
    const terraces = [
      { id: 'l4n', arc: side('w', 18, -18) },
      { id: 'l4s', arc: side('e', -18, 18) },
    ];
    void ring;
    return {
      blocks, terraces,
      sections: {
        l1: { kind: 'tier', tier: 'lower', arc: blocksArc, rows: [0, T.lower.rows - 1], blocks: 'l1', fg: 'standard' },
        'l2-left': { kind: 'room', band: 'suite', arc: side('w', 2, -18) },
        'l2-right': { kind: 'room', band: 'suite', arc: side('e', -18, 2) },
        'l2-end': { kind: 'tier', tier: 'band', arc: side('s', -12, 12), rows: [0, T.band.rows - 1], fg: 'premium', padded: true },
        l3: { kind: 'tier', tier: 'upper', arc: side('s', -16, 16), rows: [0, T.upper.rows - 1], fg: 'upper' },
        'l4-terrace': { kind: 'terrace', terrace: 'l4n', arc: side('w', 8, -8) },
        floor: { kind: 'floor' },
      },
    };
  });
}

function range(a, b) { const out = []; for (let k = a; k <= b; k++) out.push(String(k)); return out; }
function blockArc(bs, ids) {
  const w = (bs.arc[1] - bs.arc[0]) / bs.ids.length;
  const ks = ids.map((id) => bs.ids.indexOf(id)).filter((k) => k >= 0);
  return [bs.arc[0] + w * Math.min(...ks) + 0.5, bs.arc[0] + w * (Math.max(...ks) + 1) - 0.5];
}

/* ---------- Royal Albert Hall ---------- */

// Stated: an ellipse 67 x 56 m inside, dome 41 m high, Grand Tier Level 1, Rausing Circle
// Level 3, Gallery Level 5, boxes in the Loggia, Grand Tier and Second Tier, choir seats.
// The plan is a rounded rectangle whose outer wall (the back of the gallery) is 67 x 56 m.
// All tier depths and heights are modelled. Stage at +x, with the choir behind it.
const HA_ORGAN = 0.62; // half angle of the arc behind the stage where boxes and circle stop
export const HA_PARAPET = 0.85;
function royalAlbertHall() {
  const backD = 19.5;
  const ring = new Ring(33.5 - backD, 28 - backD, 28 - backD);
  // Design points (modelled): the stalls and circle look over the Arena to the stage.
  const lower = designTier({ id: 'lower', label: 'Stalls', d0: 0.6, y0: 0.95, rows: 9, depth: 0.85, focalD: 10, maxRake: 32 });
  const sb = rowY(lower, lower.rows - 1);
  const boxes = [
    { id: 'box-loggia', label: 'Loggia', frontD: tierBackD(lower) - 0.1, depth: 2.6, floorY: sb + 0.75, h: 2.6, pitch: 3.0 },
  ];
  const b2 = { id: 'box-grand', label: 'Grand Tier', frontD: boxes[0].frontD + 0.45, depth: 2.6, floorY: boxes[0].floorY + 3.0, h: 2.65, pitch: 3.2 };
  const b3 = { id: 'box-second', label: 'Second Tier', frontD: b2.frontD + 0.45, depth: 2.5, floorY: b2.floorY + 3.0, h: 2.6, pitch: 2.8 };
  boxes.push(b2, b3);
  boxes.forEach((b) => { b.backD = b.frontD + b.depth; b.ceilY = b.floorY + b.h; });
  const circle = designTier({ id: 'circle', label: 'Rausing Circle', d0: b3.frontD + 1.2, y0: b3.ceilY + 0.9, rows: 7, depth: 0.9, focalD: 16 });
  const gallery = { d0: tierBackD(circle), backD, floorY: rowY(circle, circle.rows - 1) + 1.6, colD: backD - 0.5 };
  gallery.colTop = gallery.floorY + 3.6;
  const dome = { springD: backD, springY: gallery.colTop + 0.6, apexY: 41, topD: -5.2 }; // apex: stated 41 m
  const stage = { frontX: 2.6, bow: 0.05, deck: 1.2, conductor: [3.8, 0] };
  return {
    id: 'royal-albert-hall', archetype: 'hall', ring, tiers: { lower, circle }, boxes, gallery, dome, stage, organ: HA_ORGAN,
    tierOpts: { lower: {}, circle: { allow: hallAllowed } },
    sections: {
      arena: { kind: 'hall-floor' },
      stalls: { kind: 'tier', tier: 'lower', arc: [ring.sOf(5, 0.15), ring.sOf(7, 0.85)], rows: [0, lower.rows - 1], fg: 'stalls' },
      choir: { kind: 'tier', tier: 'lower', arc: [ring.sOf(1, 0.72), ring.sOf(3, 0.28)], rows: [1, lower.rows - 1], fg: 'stalls', choir: true },
      circle: { kind: 'tier', tier: 'circle', arc: [ring.sOf(5, 0.2), ring.sOf(7, 0.8)], rows: [0, circle.rows - 1], fg: 'circle' },
      'box-loggia': { kind: 'hall-box', box: 0 },
      'box-grand': { kind: 'hall-box', box: 1 },
      'box-second': { kind: 'hall-box', box: 2 },
      gallery: { kind: 'gallery' },
    },
    focal: () => ({ x: stage.conductor[0] + 1.5, y: stage.deck + 1.4, z: 0, label: 'the centre of the stage', floorY: 0 }),
    axis: () => ({ x: -1, z: 0, label: 'the stage’s centre line' }),
    designPoint: (t) => (t.id === 'circle' ? 'the front of the stage' : 'the edge of the Arena floor'),
    overview: { position: [-52, 70, 46], target: [2, 6, 0] },
  };
}

export const hallAllowed = (p) => p.nx < 0 || Math.abs(Math.atan2(p.nz, p.nx)) >= HA_ORGAN;
export function hallArc(L, dRef) {
  const q = HA_ORGAN / (Math.PI / 2);
  return [L.ring.sOf(3, q, dRef), L.ring.sOf(1, 1 - q, dRef) + L.ring.length(dRef)];
}
export function hallBoxes(L, b) {
  const [sA, sB] = hallArc(L, b.frontD);
  const n = Math.max(1, Math.round((sB - sA) / b.pitch));
  const step = (sB - sA) / n;
  const parts = []; const centres = [];
  for (let k = 0; k <= n; k++) parts.push(L.ring.locate(sA + k * step, b.frontD));
  for (let k = 0; k < n; k++) centres.push(L.ring.locate(sA + (k + 0.5) * step, b.frontD));
  return { parts, centres, step };
}
export const stageFrontX = (L, z) => L.stage.frontX + L.stage.bow * z * z;
export const hallRake = (k) => Math.max(0, k - 1) * 0.06;
export const hallRowR = (k) => 3.4 + k * 0.92;
export function hallFloorRows(L) {
  const [cx, cz] = L.stage.conductor; const rows = [];
  for (let k = 0; k < 30; k++) {
    const r = hallRowR(k); const row = [];
    const dphi = 0.55 / r; const n = Math.floor(1.05 / dphi);
    for (let q = -n; q <= n; q++) {
      const phi = (q + (k % 2) * 0.5) * dphi; const a = Math.abs(phi);
      if (a > 0.3 && a < 0.38) continue;
      const x = cx - r * Math.cos(phi); const z = cz + r * Math.sin(phi);
      if (L.ring.dOf(x, z) > -0.9 || x > stageFrontX(L, z) - 1.4) continue;
      row.push({ x, y: hallRake(k), z, nx: (x - cx) / r, nz: (z - cz) / r, row: k, tier: 'floor', angle: Math.atan2(z, x), w: 0.55, phi });
    }
    if (row.length) rows.push(row);
  }
  return rows;
}
export function hallColumns(L) {
  const L0 = L.ring.length(L.gallery.colD); const n = Math.round(L0 / 3.0);
  return { n, step: L0 / n };
}

/* ---------- Racecourses ---------- */

// The grandstand runs along the -z side of a long ring (so the bowl kit works unchanged):
// z = -8 - d. The winning post is at x = 0. Floors are modelled at 4.5 m spacing.
export const STAND_RING = new Ring(1400, 8, 1);
export const standAt = (x) => ({ i: 4, f: (STAND_RING.ax - x) / (2 * STAND_RING.ax) });
const standPoint = (x, d) => { const { i, f } = standAt(x); return STAND_RING.point(i, f, d); };
const FURLONG = 201.168;

function racecourseLayout(o) {
  const floors = o.floors.map((f, k) => ({
    ...f, k, floorY: f.floorY, frontD: f.frontD, glassD: f.frontD + (f.balcony ?? 2.6), backD: f.frontD + (f.balcony ?? 2.6) + 10, ceilY: f.floorY + 3.6,
  }));
  const terrace = designTier({ id: 'terrace', label: 'Terrace', d0: 0.4, y0: 0.6, rows: 10, depth: 0.85, focalD: o.railZ + 8 + 1, minRise: 0.2 });
  const top = floors[floors.length - 1];
  const roof = { y: top.ceilY + 1.6, frontD: -0.6, backD: top.backD + 1 };
  const trackW = o.trackW;
  const railZ = o.railZ; const farRailZ = railZ + trackW;
  const post = { x: 0, railZ, farRailZ };
  return {
    archetype: 'racecourse', ring: STAND_RING, standX: o.standX, floors, terrace, roof, railZ, farRailZ, trackW, post,
    dir: o.dir, loop: o.loop, straight: o.straight, elevation: o.elevation, hills: o.hills, fences: o.fences || [], furlongs: o.furlongs,
    parade: o.parade, screen: o.screen, village: o.village, sections: o.sections, lawns: o.lawns, venue: o.venue,
    focal: () => ({ x: 0, y: o.elevation(0, (railZ + farRailZ) / 2) + 1.6, z: (railZ + farRailZ) / 2, label: 'the winning line, mid-track', floorY: o.elevation(0, (railZ + farRailZ) / 2) }),
    axis: () => ({ x: 0, z: 1, label: 'the winning line', fold: true }),
    designPoint: () => 'the near rail',
    overview: o.overview,
  };
}

function ascot() {
  // Stated: 480 m grandstand facing north over the course, winning post towards its west
  // end (derived), right-handed round course of about 1.75 miles with a 2.5 furlong run-in,
  // a straight mile, and a 73 ft climb from Swinley Bottom to the post (the highest point).
  // Here the runners pass the stand travelling +x (east to west), so west is +x.
  const railZ = 12; const trackW = 30;
  const runIn = 2.5 * FURLONG; // stated
  // Round course: a rounded triangle on the near (stands side) rail. Its apex distance is
  // solved so the course is 1.75 miles round at mid-track (stated length, shape modelled).
  const target = 1.75 * 1609.344;
  // Vertices: east corner, west corner, north apex (Swinley Bottom). Solve the apex.
  let lo = 300; let hi = 2000; let loop = null;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    loop = makeAscotLoop(mid, railZ, runIn);
    if (loop.length(-trackW / 2) > target) hi = mid; else lo = mid;
  }
  const swinley = loop.corners[2].v[1];
  const elevation = (x, z) => -22.25 * smooth01((z - railZ - 40) / Math.max(200, swinley - railZ - 40)); // stated 73 ft = 22.25 m
  const floors = [
    { id: 'f1', label: '1st Floor', floorY: 5.0, frontD: 6.4 },
    { id: 'f2', label: 'Level 2', floorY: 9.5, frontD: 7.0 },
    { id: 'f3', label: 'Level 3', floorY: 14.0, frontD: 7.6 },
    { id: 'f4', label: 'Level 4', floorY: 18.5, frontD: 8.2 },
    { id: 'f5', label: 'Level 5', floorY: 23.0, frontD: 8.8 },
    { id: 'f6', label: 'Level 6', floorY: 27.5, frontD: 9.4 },
  ];
  const standX = [-420, 60]; // stated 480 m long; post 60 m in from the west end (modelled)
  const bal = (floor, x0, x1, style, extra = {}) => ({ kind: 'rc-room', floor, x: [x0, x1], style, ...extra });
  const sections = {
    'pr-rest': bal(1, 34, 58, 'restaurant'),
    'windsor-forest': bal(1, 10, 33, 'restaurant'),
    vista: bal(1, -12, 9, 'terrace'),
    panoramic: bal(5, -46, -4, 'restaurant', { inside: true }),
    trackside: { kind: 'rc-lawn', x: [10, 40], z: [-6, -2.5], seated: true, label: 'Concourse level' },
    on5: bal(4, -110, -66, 'restaurant', { inside: true }),
    furlong: bal(0, -205, -160, 'restaurant'),
    gallery: bal(0, -150, -112, 'restaurant'),
    'lawn-club': bal(0, -270, -222, 'restaurant'),
    deck: bal(0, -418, -380, 'restaurant', { inside: true }),
    'boxes-2': bal(1, -330, -60, 'box'),
    'boxes-3': bal(2, -330, -10, 'box'),
    'boxes-4': bal(3, -330, -70, 'box'),
    'boxes-5': bal(4, -330, -115, 'box'),
    'boxes-6': bal(5, -330, -50, 'box'),
    kevii: bal(3, -66, 20, 'terrace'),
    'qa-lawn': { kind: 'rc-lawn', x: [-260, -70], z: [-7, railZ - 0.8] },
    'wp-lawn': { kind: 'rc-lawn', x: [-12, 58], z: [-7, railZ - 0.8] },
    'windsor-lawn': { kind: 'rc-lawn', x: [-500, -440], z: [-4, railZ - 0.8] },
    'village-rest': { kind: 'rc-infield', at: [-190, 92], face: [-190, -8], seated: true, marquee: true },
    'village-gazebo': { kind: 'rc-infield', at: [-120, railZ + trackW + 6], face: [-60, railZ], seated: false },
  };
  const furlongs = [];
  for (let k = 1; k <= 8; k++) furlongs.push({ x: -k * FURLONG, label: `${k}f` });
  return racecourseLayout({
    venue: 'ascot', dir: 1, railZ, trackW, loop, floors, standX, sections, elevation,
    straight: { x0: -8 * FURLONG, x1: 0 }, // the straight mile ends at the post (stated straight mile)
    furlongs, fences: [],
    parade: { x: 40, z: -66, rx: 26, rz: 16 }, // modelled: behind the west end of the stand
    screen: { x: -120, z: 110, w: 24, h: 13 },
    village: { x: -200, z: 120, w: 220, d: 90 },
    lawns: [[-420, 60]],
    hills: 'ascot',
    overview: { position: [-380, 230, 360], target: [-150, 6, 30] },
  });
}

function makeAscotLoop(apexZ, railZ, runIn) {
  // East corner radius 160 m; its tangent point on the straight is placed 2.5 furlongs
  // before the post, so the run-in is exact. West corner just past the stand.
  const r0 = 160; const r1 = 180; const r2 = 200;
  const xW = 360; const xApex = -260;
  // Work out the east vertex so the corner's tangent point lands at x = -runIn.
  let xE = -runIn - 200;
  for (let k = 0; k < 6; k++) {
    const a = norm([xE - xApex, railZ - apexZ]); // incoming edge apex -> east vertex
    const turn = Math.acos(clamp(a[0] * 1 + a[1] * 0, -1, 1));
    const t = r0 * Math.tan(turn / 2);
    xE = -runIn - t;
  }
  // Vertex order: anticlockwise in plan (x, z): east, west, apex.
  return new Loop([[xE, railZ], [xW, railZ], [xApex, apexZ]], [r0, r2, r1]);
}

function cheltenham() {
  // Stated: left-handed (runners pass the stand travelling -x here), uphill finish,
  // natural amphitheatre below Cleeve Hill, Best Mate Enclosure directly opposite the main
  // grandstand beside the finish line. Course length, run-in and stand length are not
  // published: all modelled.
  const railZ = 12; const trackW = 26;
  const loop = new Loop([[-420, railZ], [760, railZ], [760, 560], [-420, 560]], [210, 210, 210, 210]);
  // Uphill finish (stated): the straight climbs towards the post. Level at the stand, then
  // falling away up the straight; the gradient is modelled.
  const elevation = (x, z) => {
    const nearStraight = 1 - smooth01((z - railZ - trackW - 30) / 200);
    return -5 * smooth01((x - 150) / 450) * nearStraight;
  };
  const floors = [
    { id: 'f1', label: 'First floor', floorY: 5.0, frontD: 6.4 },
    { id: 'f2', label: 'Second floor', floorY: 9.5, frontD: 7.0 },
    { id: 'f3', label: 'Third floor', floorY: 14.0, frontD: 7.6 },
    { id: 'f4', label: 'Fourth level', floorY: 18.5, frontD: 8.2 },
    { id: 'f5', label: 'Fifth level', floorY: 23.0, frontD: 8.8 },
  ];
  const standX = [-130, 230];
  const bal = (floor, x0, x1, style, extra = {}) => ({ kind: 'rc-room', floor, x: [x0, x1], style, ...extra });
  return racecourseLayout({
    venue: 'cheltenham', dir: -1, railZ, trackW, loop, floors, standX, elevation,
    sections: {
      panoramic: bal(4, -22, 22, 'restaurant', { inside: true }),
      'chez-roux': bal(2, 24, 62, 'restaurant'),
      'boxes-3': bal(2, 64, 200, 'box'),
      'boxes-2': bal(1, -12, 150, 'box'),
      'boxes-1': bal(0, 40, 220, 'box'),
      'four-eighty': bal(3, 50, 110, 'restaurant', { inside: true }),
      'final-fence-rest': { kind: 'rc-infield', at: [262, -14], face: [200, railZ + trackW / 2], seated: true, marquee: true, stands: true },
      'club-lawn': { kind: 'rc-lawn', x: [-40, 40], z: [-7, railZ - 0.8] },
      'tatts-lawn': { kind: 'rc-lawn', x: [60, 225], z: [-7, railZ - 0.8] },
      'best-mate': { kind: 'rc-lawn', x: [-26, 26], z: [railZ + trackW + 1.2, railZ + trackW + 14], far: true },
    },
    furlongs: [], fences: [220, 470], // final two fences on the straight (positions modelled)
    straight: null,
    parade: { x: -60, z: -70, rx: 24, rz: 15 },
    screen: { x: 60, z: railZ + trackW + 70, w: 22, h: 12 },
    village: null, lawns: [[-130, 230]], hills: 'cleeve',
    overview: { position: [-160, 200, 330], target: [40, 6, 30] },
  });
}

function smooth01(x) { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); }

/* ---------- Registry ---------- */

const MAKERS = {
  'tottenham-hotspur-stadium': tottenham,
  'the-arena-london': theArenaLondon,
  'ao-arena': aoArena,
  'co-op-live': coopLive,
  'royal-albert-hall': royalAlbertHall,
  'ascot-racecourse': ascot,
  'cheltenham-racecourse': cheltenham,
};
const cache = {};
export function layoutFor(venueId) {
  if (!MAKERS[venueId]) return null;
  if (cache[venueId]) return cache[venueId];
  const L = MAKERS[venueId]();
  L.venueId = venueId;
  L.runs = runsFor(L, venueId);
  return (cache[venueId] = L);
}
export const hasLayout = (venueId) => !!MAKERS[venueId] || VENUES.some((v) => v.archetype === venueId);

/* ---------- Seat picker data ---------- */

// What the picker shows for an area: its places (stand, side), the blocks for the chosen
// place (only where the venue publishes block numbers), and the row choice.
export function seatChoices(venueId, mode, areaId, placeId) {
  const L = layoutFor(venueId); const area = areaById(venueId, areaId, { mode });
  if (!L || !area) return null;
  const places = (area.places || []).filter((p) => { const s = L.sections[p.section]; return s && (!s.modes || s.modes.includes(mode)); });
  const place = places.find((p) => p.id === placeId) || places[0];
  const sec = place ? L.sections[place.section] : null;
  if (!sec) return { places, place: null, blocks: [], rows: { kind: 'none', n: 1 } };
  let rows;
  if (sec.kind === 'tier') {
    const n = sec.rows[1] - sec.rows[0] + 1;
    rows = { kind: 'numbered', n, first: sec.rows[0] };
  } else if (sec.kind === 'room') {
    rows = { kind: 'spots', options: [['front', 'Front seat'], ['middle', 'Second row'], ['back', 'Inside the suite']] };
  } else if (sec.kind === 'hall-box') {
    rows = { kind: 'spots', options: [['front', 'At the parapet'], ['middle', 'Second row'], ['back', 'Back of the box']] };
  } else if (sec.kind === 'rc-room') {
    rows = { kind: 'spots', options: sec.style === 'box' ? [['front', 'On the balcony'], ['middle', 'At the table'], ['back', 'Back of the box']]
      : sec.style === 'terrace' ? [['front', 'At the rail'], ['middle', 'Terrace table'], ['back', 'By the glass']]
        : sec.inside ? [['front', 'Window table'], ['middle', 'Second row'], ['back', 'Back of the room']]
          : [['front', 'On the balcony'], ['middle', 'Window table'], ['back', 'Back of the room']] };
  } else if (sec.kind === 'floor') {
    rows = { kind: 'spots', options: mode === 'boxing' ? [['front', 'Front row'], ['middle', 'Third row'], ['back', 'Sixth row']] : [['front', 'Near the stage'], ['middle', 'Mid floor'], ['back', 'Back of the floor']] };
  } else if (sec.kind === 'hall-floor') {
    rows = { kind: 'spots', options: [['front', 'Front of the Arena'], ['middle', 'Mid Arena'], ['back', 'Back of the Arena']] };
  } else if (sec.kind === 'gallery') {
    rows = { kind: 'spots', options: [['front', 'At the rail'], ['middle', 'Second row'], ['back', 'Back wall']] };
  } else if (sec.kind === 'rc-lawn') {
    rows = { kind: 'spots', options: sec.seated ? [['front', 'Front table'], ['middle', 'Middle'], ['back', 'Back']] : [['front', 'At the rail'], ['middle', 'On the lawn'], ['back', 'Back of the lawn']] };
  } else if (sec.kind === 'terrace') {
    rows = { kind: 'spots', options: [['front', 'At the rail'], ['middle', 'Terrace seat'], ['back', 'By the lounge']] };
  } else {
    rows = { kind: 'spots', options: [['front', 'Front'], ['middle', 'Middle'], ['back', 'Back']] };
  }
  const bs = sec.blocks && L.blocks?.[sec.blocks];
  const blocks = bs ? (place.blocks || bs.ids).filter((id) => bs.ids.includes(id)) : [];
  return { places, place, section: sec, blocks, rows, posAlong: sec.kind !== 'rc-infield' };
}

/* ---------- Seat specs ---------- */

// The one function everything uses to place the camera.
// seat: { place, block, row, pos }. Returns { position, target, normal, foreground, ... }.
export function seatSpec(venueId, mode, areaId, seat = {}) {
  const L = layoutFor(venueId);
  const ch = seatChoices(venueId, mode, areaId, seat.place);
  if (!L || !ch || !ch.section) return null;
  const sec = ch.section;
  const block = ch.blocks.length ? (ch.blocks.includes(String(seat.block)) ? String(seat.block) : ch.blocks[Math.floor((ch.blocks.length - 1) / 2)]) : null;
  const poi = L.focal(mode);
  let spec = null;
  const u = posFrac(seat.pos);
  const spot = ROW_KEYS.includes(seat.row) ? seat.row : (Number(seat.row) >= 1 ? (Number(seat.row) <= 1 ? 'front' : 'middle') : 'middle');
  const r = ROW_KEYS.indexOf(spot);
  switch (sec.kind) {
    case 'tier': {
      const t = L.tiers[sec.tier]; const n = sec.rows[1] - sec.rows[0] + 1;
      const i = sec.rows[0] + rowIndex(seat.row, n);
      const [a, b] = sectionArc(L, sec, block);
      spec = tierSeatAt(L, t, i, a + (b - a) * u, { foreground: sec.fg === 'standard' ? (t.id === 'upper' || t.id === 'l5' ? 'upper' : 'front') : (sec.fg || 'front'), padded: !!sec.padded });
      if (sec.stool) { spec.position[1] += 0.35; spec.eye += 0.35; spec.snapTier = null; spec.foreground = 'front'; }
      break;
    }
    case 'room': spec = roomSeat(L, sec, r, u); break;
    case 'terrace': spec = terraceSeat(L, sec, r, u); break;
    case 'floor': spec = L.archetype === 'stadium' ? stadiumFloorSeat(L, mode, r, u) : arenaFloorSeat(L, mode, r, u); break;
    case 'hall-floor': spec = hallFloorSeat(L, r, u); break;
    case 'hall-box': spec = hallBoxSeat(L, sec, r, u); break;
    case 'gallery': spec = gallerySeat(L, r, u); break;
    case 'rc-room': spec = rcRoomSeat(L, sec, r, u); break;
    case 'rc-lawn': spec = rcLawnSeat(L, sec, r, u); break;
    case 'rc-infield': spec = rcInfieldSeat(L, sec, r); break;
    default: return null;
  }
  if (!spec) return null;
  spec.target = spec.target || aimAt(spec.position, poi);
  spec.poi = poi; spec.venueId = venueId; spec.mode = mode; spec.block = block;
  spec.rowLabel = rowWords(sec, spec, ch);
  return spec;
}

function rowWords(sec, spec, ch) {
  if (sec.kind === 'tier') {
    const k = spec.rowIndex - sec.rows[0] + 1; const n = ch.rows.n;
    return `Row ${k} of ${n}`;
  }
  return '';
}

function roomSeat(L, sec, r, u) {
  const B = L.bands[sec.band]; const t = L.tiers[B.tier]; const ring = L.ring;
  const [a, b] = sec.arc; const s = a + (b - a) * u;
  const { i: si, f } = ring.locate(s, 0);
  if (r < 2) {
    const i = B.seatRows[r];
    const spec = tierSeatAt(L, t, i, s, { foreground: 'balcony', padded: true });
    spec.railDist = seatD(t, i) - (t.d0 + 0.05); spec.railY = rowY(t, 0) + 0.9; spec.boxRow = r;
    if (r === 1) { spec.foreground = 'premium'; }
    return spec;
  }
  const d = B.glassD + 1.8; const p = ring.point(si, f, d);
  return {
    position: [p.x, B.floorY + 1.22, p.z], normal: [p.nx, 0, p.nz], foreground: 'box', boxRow: 2, tierId: 'box', eye: DESIGN.eye,
    glassDist: d - B.glassD, floorY: B.floorY, ceilY: B.top + 0.1, boxHalfW: B.pitch / 2 - 0.08, snapTier: null,
  };
}

function terraceSeat(L, sec, r, u) {
  const ring = L.ring; const t = L.tiers.upper;
  const [a, b] = sec.arc; const s = a + (b - a) * u;
  const { i: si, f } = ring.locate(s, 0);
  const base = rowY(t, t.rows - 1) + 0.5; const d0 = tierBackD(t) + 0.3;
  const d = d0 + [0.5, 1.4, 3.2][r];
  const p = ring.point(si, f, d);
  const eye = r === 2 ? DESIGN.standEye : DESIGN.eye;
  return { position: [p.x, base + eye, p.z], normal: [p.nx, 0, p.nz], foreground: r === 0 ? 'balcony' : 'premium', tierId: 'terrace', eye, railDist: d - d0, railY: base + 1.0 };
}

function stadiumFloorSeat(L, mode, r, u) {
  const st = L.stage; const x = st.frontX - [6, 30, 58][r]; const z = (u - 0.5) * 2 * (L.pitch.hz - 6);
  return { position: [x, DESIGN.standEye + 0.05, z], normal: [-1, 0, 0], foreground: 'floor', rowIndex: r, tierId: 'floor', eye: DESIGN.standEye, standing: true };
}

function arenaFloorSeat(L, mode, r, u) {
  const p = (u - 0.5) * 2;
  if (mode === 'boxing') {
    const z = -(L.ring3.apron + 2.2 + [0, 2, 5][r] * 1.0);
    return { position: [p * 3.6, 0.25 + DESIGN.eye - 0.1, z], normal: [0, 0, -1], foreground: 'ringside', rowIndex: r, tierId: 'floor', eye: DESIGN.eye };
  }
  const x = L.stage.frontX - [5, 17, 32][r];
  return { position: [Math.max(-L.floor.hx + 3, x), DESIGN.standEye + 0.05, p * (L.floor.hz - 5)], normal: [-1, 0, 0], foreground: 'floor', rowIndex: r, tierId: 'floor', eye: DESIGN.standEye, standing: true };
}

function hallFloorSeat(L, r, u) {
  const [cx, cz] = L.stage.conductor; const k = [1, 6, 11][r]; const rr = hallRowR(k);
  const phi = (u - 0.5) * 1.3;
  const x = cx - rr * Math.cos(phi); const z = cz + rr * Math.sin(phi);
  return { position: [x, hallRake(k) + DESIGN.eye, z], normal: [(x - cx) / rr, 0, (z - cz) / rr], foreground: 'stalls', rowIndex: k, tierId: 'floor', snapTier: 'floor', eye: DESIGN.eye };
}

function hallBoxSeat(L, sec, r, u) {
  const b = L.boxes[sec.box]; const ring = L.ring;
  const { centres, step } = hallBoxes(L, b);
  const k = clamp(Math.round(u * (centres.length - 1)), 0, centres.length - 1);
  const d = b.frontD + [0.42, 1.35, 2.15][r];
  const c = centres[k];
  const p = ring.point(c.i, c.f, d);
  const off = r === 1 ? 0.4 : 0;
  const y = b.floorY + [DESIGN.eye + 0.04, DESIGN.eye + 0.24, DESIGN.standEye][r];
  return {
    position: [p.x + p.nz * off, y, p.z - p.nx * off], normal: [p.nx, 0, p.nz],
    foreground: 'hall-box', boxRow: r, tierId: b.id, eye: DESIGN.eye, boxIndex: k, boxCount: centres.length,
    parapetDist: d - b.frontD, parapetY: b.floorY + HA_PARAPET, floorY: b.floorY, ceilY: b.ceilY, boxHalf: step / 2 - 0.08, boxDepth: b.backD - b.frontD,
  };
}

function gallerySeat(L, r, u) {
  const g = L.gallery; const ring = L.ring;
  const d = g.d0 + [0.55, 1.0, Math.max(1.4, g.colD - g.d0 - 0.4)][r];
  const { step } = hallColumns(L);
  const [a, b] = [ring.sOf(5, 0.1, g.colD), ring.sOf(7, 0.9, g.colD)];
  let s = a + (b - a) * u; s = Math.round(s / step) * step;
  const { i, f } = ring.locate(s, g.colD); const p = ring.point(i, f, d);
  return { position: [p.x, g.floorY + DESIGN.standEye, p.z], normal: [p.nx, 0, p.nz], foreground: 'gallery', rowIndex: r, tierId: 'gallery', eye: DESIGN.standEye, clear: 0.6, clearAhead: d - g.d0 + 0.2, standing: true };
}

function rcRoomSeat(L, sec, r, u) {
  const F = L.floors[sec.floor];
  const x = sec.x[0] + (sec.x[1] - sec.x[0]) * u;
  let d; let y; let fg;
  if (sec.inside) { d = F.glassD + [0.9, 2.6, 5.6][r]; y = F.floorY + DESIGN.eye + 0.04; fg = 'restaurant'; }
  else if (sec.style === 'terrace') { d = [F.frontD + 0.5, F.frontD + 1.6, F.glassD - 0.3][r]; y = F.floorY + (r === 0 ? DESIGN.standEye : DESIGN.eye + 0.04); fg = 'race-balcony'; }
  else { d = [F.frontD + 0.85, F.glassD + 1.2, F.glassD + 4.6][r]; y = F.floorY + (r === 0 ? DESIGN.standEye : r === 1 ? DESIGN.eye + 0.04 : DESIGN.standEye); fg = r === 0 ? 'race-balcony' : (sec.style === 'box' ? 'box' : 'restaurant'); }
  const p = standPoint(x, d);
  return {
    position: [p.x, y, p.z], target: raceTarget(L, p.x, p.z), normal: [0, 0, -1],
    foreground: fg, boxRow: r, tierId: sec.style === 'box' ? 'box' : 'restaurant', eye: DESIGN.eye,
    railDist: d - (F.frontD + 0.05), railY: F.floorY + 1.05, glassDist: d - F.glassD, floorY: F.floorY, ceilY: F.ceilY,
    boxHalfW: sec.style === 'box' ? 2.45 : 6, standing: y - F.floorY > 1.4,
  };
}

function rcLawnSeat(L, sec, r, u) {
  const x = sec.x[0] + (sec.x[1] - sec.x[0]) * u;
  const [z0, z1] = sec.z;
  if (sec.far) {
    const z = [z0 + 0.6, (z0 + z1) / 2, z1 - 1][r]; const y = L.elevation(x, z);
    return { position: [x, y + DESIGN.standEye, z], target: raceTarget(L, x, z), normal: [0, 0, 1], foreground: 'lawn', rowIndex: r, tierId: 'lawn', eye: DESIGN.standEye, railDist: z - L.farRailZ, clear: 0.95, clearAhead: z - L.farRailZ + 0.5, standing: true, far: true };
  }
  const z = [z1 - 0.6, (z0 + z1) / 2, z0 + 1.2][r]; const y = L.elevation(x, z);
  const eye = sec.seated ? DESIGN.eye : DESIGN.standEye;
  return { position: [x, y + eye, z], target: raceTarget(L, x, z), normal: [0, 0, -1], foreground: sec.seated ? 'restaurant-open' : 'lawn', rowIndex: r, tierId: 'lawn', eye, railDist: L.railZ - z, clear: 0.95, clearAhead: L.railZ - z + 0.5, standing: !sec.seated };
}

// Racecourse aim: the winning line (mid-track at the post), but never more than 60 degrees
// off straight across the track, so a seat far up the straight still faces the course.
function raceTarget(L, x, z) {
  const P = L.focal(); const dz = Math.abs(P.z - z) || 1;
  const lim = Math.tan(rad(60)) * dz;
  const tx = x + clamp(P.x - x, -lim, lim);
  return [tx, L.elevation(tx, P.z) + 1.6, P.z];
}

function rcInfieldSeat(L, sec, r) {
  const [x, z] = sec.at; const [fx, fz] = sec.face;
  const back = [0, 3, 6][r]; const dx = fx - x; const dz = fz - z; const l = Math.hypot(dx, dz) || 1;
  const px = x - (dx / l) * back; const pz = z - (dz / l) * back;
  const y = L.elevation(px, pz) + (sec.marquee ? 0.5 : 0);
  const eye = sec.seated ? DESIGN.eye : DESIGN.standEye;
  return { position: [px, y + eye, pz], target: [fx, L.elevation(fx, fz) + 2.5, fz], normal: [-dx / l, 0, -dz / l], foreground: sec.seated ? 'restaurant-open' : 'lawn', rowIndex: r, tierId: 'infield', eye, standing: !sec.seated, clear: 1.2 };
}

/* ---------- Your seat in numbers ---------- */

// All figures come from the modelled geometry. C-value: for a tiered seat, the clearance
// of the sightline over the head of the row in front, measured to the tier's design point.
export function seatNumbers(spec) {
  if (!spec?.poi) return null;
  const L = layoutFor(spec.venueId);
  const [x, y, z] = spec.position; const P = spec.poi;
  const dx = P.x - x; const dz = P.z - z; const dy = y - P.y;
  const horiz = Math.hypot(dx, dz);
  const distance = Math.hypot(horiz, dy);
  const eyeHeight = y - (P.floorY ?? 0);
  const down = Math.atan2(y - P.y, horiz) * 180 / Math.PI;
  let off = null; const ax = L.axis(spec.mode);
  if (ax.square) {
    const a = Math.abs(Math.atan2(z - P.z, x - P.x)) % (Math.PI / 2);
    off = Math.min(a, Math.PI / 2 - a) * 180 / Math.PI;
  } else {
    const vx = x - P.x; const vz = z - P.z; const lv = Math.hypot(vx, vz) || 1;
    let a = Math.acos(clamp((vx * ax.x + vz * ax.z) / lv, -1, 1)) * 180 / Math.PI;
    if (ax.fold) a = Math.min(a, 180 - a);
    off = a;
  }
  // Sports: "round from" is how far round from the halfway (or 50-yard) line you are.
  let c = null; let cNote = '';
  if (spec.tier && spec.tier.ys) {
    // A mode can move the design point (NFL: the sideline of a field 1.6 m lower).
    const over = L.sightTo?.(spec.tier, spec.mode);
    const tier = over ? { ...spec.tier, ...over } : spec.tier;
    if (spec.rowIndex > 0) { c = cValue(tier, spec.rowIndex); cNote = `over the row in front, to ${L.designPoint(spec.tier, spec.mode)}`; }
    else cNote = 'front row: no row in front of you';
  } else if (spec.standing) cNote = 'standing: depends on the people in front';
  else cNote = 'box, balcony or table: no row in front';
  const rake = spec.tier && spec.tier.ys && spec.rowIndex > 0 ? rakeDeg(spec.tier, spec.rowIndex) : null;
  return { distance, eyeHeight, down, off, offLabel: ax.label, c, cNote, rake, poiLabel: P.label, floorWord: P.floorWord || null };
}

/* ---------- Plain words ---------- */

export function describeSeat(spec) {
  if (!spec) return '';
  const n = seatNumbers(spec);
  if (!n) return '';
  const near = n.distance < 25 ? 'very close to' : n.distance < 50 ? 'a short distance from' : n.distance < 90 ? 'a moderate distance from' : 'a long way from';
  const high = n.eyeHeight < 3 ? 'at almost the same level as' : n.eyeHeight < 10 ? 'a little above' : n.eyeHeight < 22 ? 'well above' : 'high above';
  return `${near} ${n.poiLabel} (about ${Math.round(n.distance)} metres, modelled) and ${high} it`;
}

/* ---------- Mini-map (SVG strings) ---------- */

export function ringPath(ring, d, step = 2) {
  const L = ring.length(d); const pts = [];
  for (let s = 0; s < L; s += step) { const p = ring.at(s, d); pts.push(`${p.x.toFixed(1)},${p.z.toFixed(1)}`); }
  return `M${pts.join('L')}Z`;
}

// A band between offsets d0 and d1 over the arc [sA, sB] (arc lengths at d = 0).
function bandPath(ring, d0, d1, sA, sB, step = 1.5) {
  const a = []; const b = [];
  const n = Math.max(2, Math.ceil(Math.abs(sB - sA) / step));
  for (let k = 0; k <= n; k++) {
    const { i, f } = ring.locate(sA + (sB - sA) * (k / n), 0);
    const p0 = ring.point(i, f, d0); const p1 = ring.point(i, f, d1);
    a.push(`${p0.x.toFixed(1)},${p0.z.toFixed(1)}`); b.unshift(`${p1.x.toFixed(1)},${p1.z.toFixed(1)}`);
  }
  return `M${a.join('L')}L${b.join('L')}Z`;
}
const rect = (x0, x1, z0, z1) => `M${x0.toFixed(1)},${z0.toFixed(1)}H${x1.toFixed(1)}V${z1.toFixed(1)}H${x0.toFixed(1)}Z`;

function zoneOf(L, mode, sec, block) {
  if (!sec) return '';
  const ring = L.ring;
  if (sec.kind === 'tier') {
    const t = L.tiers[sec.tier]; const [a, b] = sectionArc(L, sec, block);
    return bandPath(ring, rowD(t, sec.rows[0]), rowD(t, sec.rows[1] + 1), a, b);
  }
  if (sec.kind === 'room') { const B = L.bands[sec.band]; const t = L.tiers[B.tier]; return bandPath(ring, rowD(t, B.seatRows[0]), B.backD, sec.arc[0], sec.arc[1]); }
  if (sec.kind === 'terrace') { const t = L.tiers.upper; return bandPath(ring, tierBackD(t), tierBackD(t) + 4, sec.arc[0], sec.arc[1]); }
  if (sec.kind === 'floor') {
    if (L.archetype === 'stadium') return rect(-L.pitch.hx + 4, L.stage.frontX - 2, -L.pitch.hz + 2, L.pitch.hz - 2);
    if (mode === 'boxing') { const a = L.ring3.apron; return rect(-a - 6, a + 6, -a - 7, -a - 1); }
    return rect(-L.floor.hx + 3, L.stage.frontX - 2, -L.floor.hz + 2, L.floor.hz - 2);
  }
  if (sec.kind === 'hall-floor') return rect(-ring.hx + 1, L.stage.frontX - 1, -ring.hz + 1, ring.hz - 1);
  if (sec.kind === 'hall-box') { const b = L.boxes[sec.box]; const [sA, sB] = hallArc(L, 0); return bandPath(ring, b.frontD, b.backD, sA, sB); }
  if (sec.kind === 'gallery') return bandPath(ring, L.gallery.d0, L.gallery.backD, ring.sOf(5, 0.1), ring.sOf(7, 0.9));
  if (sec.kind === 'rc-room') { const F = L.floors[sec.floor]; return rect(sec.x[0], sec.x[1], -8 - F.backD, -8 - F.frontD); }
  if (sec.kind === 'rc-lawn') return rect(sec.x[0], sec.x[1], sec.z[0], sec.z[1]);
  if (sec.kind === 'rc-infield') { const [x, z] = sec.at; return rect(x - 8, x + 8, z - 6, z + 6); }
  return '';
}

// The plan outline (an SVG path in world metres) of a section, for the seat map.
export const sectionZone = (L, mode, sec, block) => zoneOf(L, mode, sec, block);
export { bandPath };

// Returns { viewBox, base (svg markup), zones: { areaId: d }, focal: [x, z], mark }.
// seats(areaId) gives the plan position of an area's default seat.
export function plan(venueId, mode, areas = [], choice = {}) {
  const L = layoutFor(venueId); if (!L) return null;
  const parts = []; let vb;
  const ring = L.ring;
  if (L.archetype === 'stadium') {
    const outer = Math.max(...L.stands.map((s) => s.backD));
    vb = [-(ring.hx + outer + 3), -(ring.hz + outer + 3), 2 * (ring.hx + outer + 3), 2 * (ring.hz + outer + 3)];
    L.stands.forEach((st) => parts.push(`<path class="mm-shell" d="${bandPath(ring, 0, st.backD, st.arc[0], st.arc[1], 3)}"/>`));
    const multi = L.stands[0];
    ['l1', 'l2', 'l4'].forEach((id, k) => parts.push(`<path class="${k === 0 ? 'mm-lower' : 'mm-mid'}" d="${bandPath(ring, L.tiers[id].d0, tierBackD(L.tiers[id]), multi.arc[0], multi.arc[1], 3)}"/>`));
    parts.push(`<path class="mm-upper" d="${bandPath(ring, L.tiers.l5.d0, tierBackD(L.tiers.l5), multi.arc[0], multi.arc[1], 3)}"/>`);
    parts.push(`<path class="mm-lower" d="${bandPath(ring, L.tiers.s1.d0, tierBackD(L.tiers.s1), L.stands[1].arc[0], L.stands[1].arc[1], 3)}"/>`);
    const { hx, hz } = L.pitch;
    if (mode === 'concert') {
      parts.push(`<rect class="mm-floor" x="${-hx}" y="${-hz}" width="${2 * hx}" height="${2 * hz}" rx="1"/>`);
      parts.push(`<rect class="mm-stage" x="${L.stage.frontX}" y="${-L.stage.hz}" width="${L.stage.backX - L.stage.frontX}" height="${2 * L.stage.hz}" rx="1"/>`);
    } else if (mode === 'nfl') {
      const N = L.nfl; const ez = N.hx - N.endZone;
      parts.push(`<rect class="mm-pitch" x="${(-N.hx).toFixed(2)}" y="${(-N.hz).toFixed(2)}" width="${(2 * N.hx).toFixed(2)}" height="${(2 * N.hz).toFixed(2)}" rx="0.3"/>`);
      let yl = '';
      for (let k = -10; k <= 10; k += 2) yl += `M${(k * 5 * N.yd).toFixed(2)},${(-N.hz).toFixed(2)}V${N.hz.toFixed(2)}`;
      parts.push(`<path class="mm-line" d="M${(-ez).toFixed(2)},${(-N.hz).toFixed(2)}V${N.hz.toFixed(2)}M${ez.toFixed(2)},${(-N.hz).toFixed(2)}V${N.hz.toFixed(2)}${yl}"/>`);
    } else {
      parts.push(`<rect class="mm-pitch" x="${-hx}" y="${-hz}" width="${2 * hx}" height="${2 * hz}" rx="0.5"/>`);
      parts.push(`<path class="mm-line" d="M0,${-hz}V${hz}M${-hx},-20.16h16.5v40.32h-16.5M${hx},-20.16h-16.5v40.32h16.5"/>`);
      parts.push('<circle class="mm-line" cx="0" cy="0" r="9.15"/>');
    }
    // Stand names (stated compass names; orientation of the pitch itself is modelled).
    const lab = (x, z, t) => `<text class="mm-label" x="${x}" y="${z}" text-anchor="middle">${t}</text>`;
    parts.push(lab(0, -(ring.hz + 26), 'WEST'), lab(0, ring.hz + 30, 'EAST'), lab(ring.hx + 26, 2, 'NORTH'), lab(-(ring.hx + 33), 2, 'SOUTH'));
  } else if (L.archetype === 'arena') {
    const outer = tierBackD(L.tiers.upper) + 2;
    vb = [-(ring.hx + outer + 2), -(ring.hz + outer + 2), 2 * (ring.hx + outer + 2), 2 * (ring.hz + outer + 2)];
    parts.push(`<path class="mm-shell" d="${ringPath(ring, outer)}"/>`);
    parts.push(`<path class="mm-upper" d="${ringPath(ring, tierBackD(L.tiers.upper))}"/>`);
    parts.push(`<path class="mm-mid" d="${ringPath(ring, L.tiers.upper.d0)}"/>`);
    parts.push(`<path class="mm-lower" d="${ringPath(ring, tierBackD(L.tiers.lower))}"/>`);
    parts.push(`<path class="mm-inner" d="${ringPath(ring, 0)}"/>`);
    const { hx, hz } = L.floor;
    parts.push(`<rect class="mm-floor" x="${-hx}" y="${-hz}" width="${2 * hx}" height="${2 * hz}" rx="3"/>`);
    if (mode === 'boxing') { const h = L.ring3.half; parts.push(`<rect class="mm-stage" x="${-h}" y="${-h}" width="${2 * h}" height="${2 * h}"/>`); }
    else parts.push(`<rect class="mm-stage" x="${L.stage.frontX}" y="${-L.stage.hz}" width="${L.stage.backX - L.stage.frontX}" height="${2 * L.stage.hz}" rx="1"/>`);
    // Published block numbers, at their modelled places.
    Object.values(L.blocks || {}).forEach((bs) => {
      const t = L.tiers[bs.tier]; const w = (bs.arc[1] - bs.arc[0]) / bs.ids.length;
      bs.ids.forEach((id, k) => {
        if (bs.ids.length > 14 && k % 2) return;
        const { i, f } = ring.locate(bs.arc[0] + w * (k + 0.5), 0); const p = ring.point(i, f, (t.d0 + tierBackD(t)) / 2);
        parts.push(`<text class="mm-block" x="${p.x.toFixed(1)}" y="${(p.z + 1.4).toFixed(1)}" text-anchor="middle">${id}</text>`);
      });
    });
  } else if (L.archetype === 'hall') {
    const outer = L.gallery.backD + 1.2;
    vb = [-(ring.hx + outer + 1), -(ring.hz + outer + 1), 2 * (ring.hx + outer + 1), 2 * (ring.hz + outer + 1)];
    parts.push(`<path class="mm-shell" d="${ringPath(ring, outer, 1)}"/>`);
    parts.push(`<path class="mm-upper" d="${ringPath(ring, L.gallery.backD, 1)}"/>`);
    parts.push(`<path class="mm-mid" d="${ringPath(ring, L.gallery.d0, 1)}"/>`);
    parts.push(`<path class="mm-lower" d="${ringPath(ring, L.boxes[2].backD, 1)}"/>`);
    parts.push(`<path class="mm-mid" d="${ringPath(ring, tierBackD(L.tiers.lower), 1)}"/>`);
    parts.push(`<path class="mm-floor" d="${ringPath(ring, -0.3, 1)}"/>`);
    const z0 = -ring.hz + 0.6; const pts = [];
    for (let k = 0; k <= 16; k++) { const z = z0 + (2 * -z0) * (k / 16); pts.push(`${stageFrontX(L, z).toFixed(1)},${z.toFixed(1)}`); }
    parts.push(`<path class="mm-stage" d="M${pts.join('L')}L${ring.hx - 0.4},${-z0}L${ring.hx - 0.4},${z0}Z"/>`);
  } else {
    const [sx0, sx1] = L.standX;
    const x0 = Math.min(sx0, ...Object.values(L.sections).filter((s) => s.x).map((s) => s.x[0])) - 20; const x1 = sx1 + 40;
    const zTop = -8 - L.roof.backD - 14; const zBot = L.village ? L.village.z + L.village.d / 2 + 10 : L.farRailZ + 40;
    vb = [x0, zTop, x1 - x0, zBot - zTop];
    parts.push(`<rect class="mm-turf" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}"/>`);
    parts.push(`<rect class="mm-track" x="${vb[0]}" y="${L.railZ}" width="${vb[2]}" height="${L.trackW}"/>`);
    parts.push(`<path class="mm-rail" d="M${vb[0]},${L.railZ}H${vb[0] + vb[2]}M${vb[0]},${L.farRailZ}H${vb[0] + vb[2]}"/>`);
    parts.push(`<path class="mm-post" d="M0,${L.railZ - 3}V${L.farRailZ + 3}"/>`);
    parts.push(`<rect class="mm-upper" x="${sx0}" y="${-8 - L.roof.backD}" width="${sx1 - sx0}" height="${L.roof.backD}"/>`);
    parts.push(`<rect class="mm-lower" x="${sx0}" y="${-8 - tierBackD(L.terrace)}" width="${sx1 - sx0}" height="${tierBackD(L.terrace)}"/>`);
    if (L.village) parts.push(`<rect class="mm-parade" x="${L.village.x - L.village.w / 2}" y="${L.village.z - L.village.d / 2}" width="${L.village.w}" height="${L.village.d}" rx="6"/>`);
    const pr = L.parade; parts.push(`<ellipse class="mm-parade" cx="${pr.x}" cy="${pr.z}" rx="${pr.rx}" ry="${pr.rz}"/>`);
    const arrowY = L.farRailZ + 9; const ax0 = L.dir > 0 ? -60 : 60;
    parts.push(`<path class="mm-dir" d="M${ax0},${arrowY}h${L.dir * 40}m${-L.dir * 8},-5l${L.dir * 8},5l${-L.dir * 8},5"/>`);
    parts.push(`<text class="mm-label" x="4" y="${L.farRailZ + 20}">POST</text>`);
  }
  const zones = {};
  areas.forEach((a) => {
    const ch = seatChoices(venueId, mode, a.id, a.id === choice.area ? choice.place : null);
    if (!ch?.section) return;
    zones[a.id] = zoneOf(L, mode, ch.section, a.id === choice.area ? choice.block : null);
  });
  const f = L.focal(mode);
  return { viewBox: vb.map((v) => v.toFixed(1)).join(' '), base: parts.join(''), zones, focal: [f.x, f.z], mark: vb[2] / 220 };
}

/* ---------- Plan frame and projection (Plan mode and the seat map) ---------- */

// The world rectangle (metres) a plan of the venue shows: the same box as the mini-map
// viewBox. World x runs left to right on the plan and world z top to bottom.
export function planFrame(venueId, mode) {
  const P = plan(venueId, mode); if (!P) return null;
  const [x0, z0, w, h] = P.viewBox.split(' ').map(Number);
  return { x0, z0, w, h, cx: x0 + w / 2, cz: z0 + h / 2 };
}
// How a frame fits a width x height box (aspect kept, centred, pad pixels all round).
// zoom > 1 magnifies about the frame centre; (panX, panZ) moves the centre in metres.
export function planFit(frame, width, height, { pad = 0, zoom = 1, panX = 0, panZ = 0 } = {}) {
  const scale = Math.min((width - 2 * pad) / frame.w, (height - 2 * pad) / frame.h) * zoom;
  return { scale, cx: frame.cx + panX, cz: frame.cz + panZ, width, height };
}
// World (x, z) to pixels in that box, and back. The engine's Plan camera uses the same fit,
// so a seat map drawn with these lines up with the 3D plan underneath.
export function worldToPlan(fit, x, z) {
  return { px: fit.width / 2 + (x - fit.cx) * fit.scale, py: fit.height / 2 + (z - fit.cz) * fit.scale };
}
export function planToWorld(fit, px, py) {
  return { x: fit.cx + (px - fit.width / 2) / fit.scale, z: fit.cz + (py - fit.height / 2) / fit.scale };
}

/* ---------- Seats of a section, generated from the tier geometry ---------- */

// Every seat in the section an area, place and block point to, row by row, at 500 mm
// centres (the FIFA minimum seat width, a design standard) along the section arc. Row i
// sits at seatD(tier, i) out from the ring line and rowY(tier, i) up. Seat k of n in a row
// is the same point seatSpec gives for { row: i + 1, pos: (k + 0.5) / n * 100 }, so a seat
// map can hand a click straight to the viewer. Returns null for boxes, rooms and floors.
export function sectionSeats(venueId, mode, areaId, placeId, block) {
  const L = layoutFor(venueId); const ch = seatChoices(venueId, mode, areaId, placeId);
  if (!L || !ch?.section || ch.section.kind !== 'tier') return null;
  const sec = ch.section; const t = L.tiers[sec.tier]; const ring = L.ring;
  const b0 = ch.blocks.length ? (ch.blocks.includes(String(block)) ? String(block) : ch.blocks[Math.floor((ch.blocks.length - 1) / 2)]) : null;
  const [a, b] = sectionArc(L, sec, b0);
  const rows = [];
  for (let i = sec.rows[0]; i <= sec.rows[1]; i++) {
    const d = seatD(t, i);
    // Arc length at this row's offset (longer than at d = 0 round the corners).
    let len = 0; let prev = null;
    for (let k = 0; k <= 40; k++) { const { i: si, f } = ring.locate(a + (b - a) * (k / 40), 0); const p = ring.point(si, f, d); if (prev) len += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
    const n = Math.max(1, Math.floor(len / 0.5));
    const seats = [];
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n; const { i: si, f } = ring.locate(a + (b - a) * u, 0); const p = ring.point(si, f, d);
      seats.push({ k, pos: Math.round(u * 1000) / 10, x: p.x, y: rowY(t, i), z: p.z, nx: p.nx, nz: p.nz });
    }
    rows.push({ row: i - sec.rows[0] + 1, tierRow: i, seats });
  }
  return { tier: t.id, block: b0, rows };
}

/* ---------- Move hotspots and measuring points ---------- */

// Places a short step away from the current seat: the rows in front and behind, along the
// row, the neighbouring blocks, and the nearest other areas. Each has the seat it leads to
// ({ area, place, block, row, pos }), a label and the floor point under it (for the ring).
export function moveTargets(venueId, mode, areaId, seat, areaList = []) {
  const ch = seatChoices(venueId, mode, areaId, seat.place); const here = seatSpec(venueId, mode, areaId, seat);
  if (!ch || !here) return [];
  const out = [];
  const floorOf = (sp) => [sp.position[0], sp.position[1] - (sp.eye ?? DESIGN.eye) - (sp.standing ? DESIGN.standEye - DESIGN.eye : 0), sp.position[2]];
  const add = (id, label, s, area = areaId) => {
    const sp = seatSpec(venueId, mode, area, s); if (!sp) return;
    const d = Math.hypot(sp.position[0] - here.position[0], sp.position[2] - here.position[2], sp.position[1] - here.position[1]);
    if (d < 0.6) return;
    out.push({ id, label, seat: { area, ...s }, floor: floorOf(sp), position: sp.position, dist: d });
  };
  const pk = POS_KEYS.includes(seat.pos) ? POS_U[seat.pos] * 100 : Number(seat.pos);
  const pos = Number.isFinite(pk) ? pk : 50;
  if (ch.rows.kind === 'numbered') {
    const n = ch.rows.n; const cur = rowIndex(seat.row, n) + 1;
    const stepR = Math.max(2, Math.round(n / 5));
    if (cur > 1) add('row-front', `Row ${Math.max(1, cur - stepR)}`, { ...seat, row: String(Math.max(1, cur - stepR)) });
    if (cur < n) add('row-back', `Row ${Math.min(n, cur + stepR)}`, { ...seat, row: String(Math.min(n, cur + stepR)) });
  } else if (ch.rows.kind === 'spots') {
    const r = ROW_KEYS.indexOf(ROW_KEYS.includes(seat.row) ? seat.row : 'middle');
    ch.rows.options.forEach(([k, l], j) => { if (Math.abs(j - r) === 1) add(`spot-${k}`, l, { ...seat, row: k }); });
  }
  if (ch.posAlong) {
    if (pos > 12) add('left', 'Along to the left', { ...seat, pos: String(Math.max(0, Math.round(pos - 22))) });
    if (pos < 88) add('right', 'Along to the right', { ...seat, pos: String(Math.min(100, Math.round(pos + 22))) });
  }
  if (ch.blocks.length > 1) {
    const k = ch.blocks.indexOf(String(here.block));
    [-1, 1].forEach((dk) => { const b = ch.blocks[k + dk]; if (b) add(`block-${b}`, `Block ${b}`, { ...seat, block: b, pos: '50' }); });
  }
  // The nearest other areas (their default seat).
  const others = areaList.filter((a) => a.id !== areaId).map((a) => {
    const sp = seatSpec(venueId, mode, a.id, {}); if (!sp) return null;
    return { a, d: Math.hypot(sp.position[0] - here.position[0], sp.position[2] - here.position[2], sp.position[1] - here.position[1]) };
  }).filter(Boolean).sort((x, y) => x.d - y.d).slice(0, 3);
  others.forEach(({ a }) => add(`area-${a.id}`, a.label || a.id, {}, a.id));
  return out;
}

// Named points a measurement can snap to: the action (stage, ring, pitch, field markings,
// the winning post, rails) in world metres. Seats are added by the engine from the model.
export function measurePoints(venueId, mode) {
  const L = layoutFor(venueId); if (!L) return [];
  const P = []; const add = (label, x, y, z) => P.push({ label, p: [x, y, z] });
  const f = L.focal(mode); add(f.label.replace(/^the /, 'The '), f.x, f.y, f.z);
  if (L.archetype === 'stadium') {
    if (mode === 'football') {
      const { hx, hz } = L.pitch;
      add('The centre spot', 0, 0, 0); add('The north goal', hx, 0, 0); add('The south goal', -hx, 0, 0);
      add('Halfway line, west touchline', 0, 0, -hz); add('Halfway line, east touchline', 0, 0, hz);
      add('North penalty spot', hx - 11, 0, 0); add('South penalty spot', -hx + 11, 0, 0);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => add(`${sx > 0 ? 'North' : 'South'}-${sz > 0 ? 'east' : 'west'} corner flag`, sx * hx, 0, sz * hz));
    } else if (mode === 'nfl') {
      const N = L.nfl; const y = N.level; const gl = N.hx - N.endZone;
      add('North goal line', gl, y, 0); add('South goal line', -gl, y, 0);
      add('North goalposts', N.hx, y, 0); add('South goalposts', -N.hx, y, 0);
      add('50-yard line, west sideline', 0, y, -N.hz); add('50-yard line, east sideline', 0, y, N.hz);
    } else {
      const S = L.stage; add('Stage front, centre', S.frontX, S.deck, 0); add('Stage front, left', S.frontX, S.deck, -S.hz); add('Stage front, right', S.frontX, S.deck, S.hz);
    }
  } else if (L.archetype === 'arena') {
    if (mode === 'boxing') { const h = L.ring3.half; add('Centre of the ring', 0, L.ring3.deck, 0); [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b], k) => add(`Ring corner ${k + 1}`, a * h, L.ring3.deck, b * h)); }
    else { const S = L.stage; add('Stage front, centre', S.frontX, S.deck, 0); add('Stage front, left', S.frontX, S.deck, -S.hz); add('Stage front, right', S.frontX, S.deck, S.hz); }
  } else if (L.archetype === 'hall') {
    add('The conductor', L.stage.conductor[0], L.stage.deck, 0); add('Front of the stage', L.stage.frontX, L.stage.deck, 0);
  } else if (L.archetype === 'racecourse') {
    const yP = (x, z) => L.elevation(x, z);
    add('Winning post, near rail', 0, yP(0, L.railZ), L.railZ); add('Winning post, far rail', 0, yP(0, L.farRailZ), L.farRailZ);
    (L.furlongs || []).slice(0, 3).forEach((fl) => add(`${fl.label.replace('f', ' furlong')} marker`, fl.x, yP(fl.x, L.railZ), L.railZ));
    (L.fences || []).forEach((x, k) => add(k === 0 ? 'Last fence (modelled position)' : 'Second last fence (modelled position)', x, yP(x, (L.railZ + L.farRailZ) / 2), (L.railZ + L.farRailZ) / 2));
  }
  return P;
}

// Default area for a venue (used when a link names none).
export function defaultAreaFor(venueId) {
  const v = venueById(venueId);
  return ({ 'tottenham-hotspur-stadium': 'tunnel-club', 'the-arena-london': 'club-101', 'ao-arena': 'beautiful-north', 'co-op-live': 'gallery-suites', 'royal-albert-hall': 'grand-tier-box', 'ascot-racecourse': 'private-box', 'cheltenham-racecourse': 'cleeve-view-boxes' })[v?.id] || null;
}
