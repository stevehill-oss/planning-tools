// Venue layouts for the Seat Reality Viewer. Pure maths, no three.js, so the UI
// (mini-map, descriptions) can import it statically while the 3D engine loads later.
//
// Units are metres-like but ILLUSTRATIVE: these are generic archetypes, not surveys of
// any real venue. Never show these numbers to visitors as facts.
//
// Plan coordinates: x runs along the long axis (goal to goal, or stage end at +x),
// z across it, y is up. In the SVG mini-map, svg x = world x and svg y = world z.
//
// The bowl of every archetype is built from a Ring: a rounded rectangle whose offset
// curves (pushed outward by distance d) are exact, so a "profile" drawn in (d, y)
// can be swept all the way round to make tiers, roofs and fascias.
//
// HOW TO ADD AN ARCHETYPE (part 2: hall, racecourse):
//   1. Add an entry to LAYOUTS with { ring, tiers, focal(mode), areas }.
//   2. Each area has seat(mode, rowKey, posKey) returning a SeatSpec (see seatSpec()).
//   3. Add a builder module js/viewer/archetypes/<name>.js (see stadium.js header).
//   4. Add a mini-map drawer in planSvg() (or rely on the generic ring drawer).

/* ---------- Ring: rounded rectangle with exact offsets ---------- */

export class Ring {
  constructor(hx, hz, r) {
    this.hx = hx; this.hz = hz; this.r = r;
    this.ax = hx - r; this.az = hz - r;
  }

  // Nine segments, travelling from the middle of the +z side towards +x and round.
  segLen(i, d = 0) {
    const { ax, az, r } = this;
    switch (i) {
      case 0: case 8: return ax;
      case 2: case 6: return 2 * az;
      case 4: return 2 * ax;
      default: return (r + d) * Math.PI / 2;
    }
  }

  length(d = 0) { let L = 0; for (let i = 0; i < 9; i++) L += this.segLen(i, d); return L; }

  // Point and outward normal at segment i, fraction f (0..1), pushed out by d.
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
    // Tangent in the direction of travel.
    return { x, z, nx, nz, tx: nz, tz: -nx };
  }

  // Arc length (at offset d) of segment i, fraction f.
  sOf(i, f, d = 0) {
    let s = 0;
    for (let k = 0; k < i; k++) s += this.segLen(k, d);
    return s + f * this.segLen(i, d);
  }

  // Inverse of sOf: segment and fraction for arc length s at offset d.
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

  // Signed offset of plan position (x, z) from the ring (negative inside): the inverse of d.
  dOf(x, z) {
    const qx = Math.abs(x) - this.ax; const qz = Math.abs(z) - this.az;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - this.r;
  }

  // Arc length (offset d) of the point nearest to plan position (x, z).
  sNear(x, z, d = 0) {
    const L = this.length(d);
    let nearS = 0; let nearD = Infinity;
    const step = 0.5;
    for (let s = 0; s < L; s += step) {
      const p = this.at(s, d);
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < nearD) { nearD = dd; nearS = s; }
    }
    return nearS;
  }

  // Samples for sweeping a profile all the way round: [{ i, f }], closed (first repeated).
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

  // Radial lines used for aisles: [{ i, f }], open list (does not repeat the first).
  radials({ straightEvery = 9, cornerSplits = 3 } = {}) {
    const out = [];
    for (let i = 0; i < 9; i++) {
      const isCorner = i % 2 === 1;
      const len = this.segLen(i, 0);
      if (len <= 0.01 && !isCorner) continue;
      if (i === 8) { // second half of the +z side: share spacing with segment 0
        const n = Math.max(1, Math.round(len / straightEvery));
        for (let k = 0; k < n; k++) out.push({ i, f: k / n });
        continue;
      }
      const n = isCorner ? cornerSplits : Math.max(1, Math.round(len / straightEvery));
      for (let k = 0; k < n; k++) out.push({ i, f: k / n });
    }
    return out;
  }
}

/* ---------- Tier maths ---------- */

// A tier is a run of stepped rows. Row i: tread from d0 + i*depth to d0 + (i+1)*depth
// at height y(i) = y0 + rise*i + curve*i*i (a gentle parabola, like a real sightline rake).
export const rowY = (t, i) => t.y0 + t.rise * i + t.curve * i * i;
export const rowD = (t, i) => t.d0 + i * t.depth;
export const tierBackD = (t) => t.d0 + t.rows * t.depth;
export const seatD = (t, i) => rowD(t, i) + t.depth * 0.42;

const SEATED_EYE = 1.18; // above the tread
const STANDING_EYE = 1.62;

const ROWS = { front: 0, middle: 1, back: 2 };
const POS = { left: -1, centre: 0, right: 1 };
export const ROW_KEYS = ['front', 'middle', 'back'];
export const POS_KEYS = ['left', 'centre', 'right'];

// Moves arc position s along the ring towards the viewer's left or right.
function shiftAlong(ring, s, d, dir, metres, focal) {
  if (!dir) return s;
  const p = ring.at(s, d);
  // Viewer faces the focal point; their right is forward x up = (-fz, 0, fx).
  const fx = focal.x - p.x; const fz = focal.z - p.z;
  const rx = -fz; const rz = fx;
  const sign = Math.sign(p.tx * rx + p.tz * rz) || 1;
  return s + sign * dir * metres;
}

// Aim point: the focal point pushed a little beyond, so a seat looks across the action
// rather than down at a single spot (focal.push metres, horizontally away from the seat).
function aimAt(x, z, focal) {
  const dx = focal.x - x; const dz = focal.z - z; const L = Math.hypot(dx, dz) || 1;
  const k = focal.push || 0;
  return [focal.x + (dx / L) * k, focal.y, focal.z + (dz / L) * k];
}

// Builds a camera spec from a ring position.
function bowlSeat(ring, tier, rowIndex, s, d, { eye = SEATED_EYE, focal, foreground, extra = {} }) {
  const p = ring.at(s, d);
  const y = rowY(tier, rowIndex) + eye;
  return {
    position: [p.x, y, p.z],
    target: aimAt(p.x, p.z, focal),
    normal: [p.nx, 0, p.nz],
    foreground,
    rowIndex,
    tierId: tier.id,
    snapTier: tier.id, eye,
    ...extra,
  };
}

/* ---------- Stadium ---------- */

const STADIUM_RING = new Ring(60, 42, 16);
const ST_LOWER = { id: 'lower', d0: 0.6, rows: 20, depth: 0.8, y0: 1.35, rise: 0.34, curve: 0.006, frontWall: 1.1 };
const ST_UPPER = { id: 'upper', d0: 17.4, rows: 24, depth: 0.78, y0: 16.1, rise: 0.38, curve: 0.0045 };
const ST_BOX = { d0: tierBackD(ST_LOWER), balconyRows: 2, balconyY: [10.9, 11.3], glassD: 18.6, floorY: 11.65, glassTop: 14.6, backD: 25.0 };
const ST_ROOF = { backD: tierBackD(ST_UPPER) + 1.2, backY: 34.2, frontD: -3.0, frontY: 32.9, depthBack: 3.6, depthFront: 1.1 };

function stadiumFocal(mode) {
  return mode === 'concert' ? { x: 44, y: 8.5, z: 0 } : { x: 0, y: 1.2, z: 0, push: 9 };
}

const STADIUM = {
  id: 'stadium',
  ring: STADIUM_RING,
  pitch: { hx: 52.5, hz: 34 },
  tiers: { lower: ST_LOWER, upper: ST_UPPER },
  box: ST_BOX,
  roof: ST_ROOF,
  stage: { frontX: 33, backX: 50, hz: 24, deck: 2.4 },
  focal: stadiumFocal,
  areas: {
    'premium-lounge': {
      foreground: 'premium',
      seat(mode, row, pos) {
        const t = ST_LOWER; const i = [6, 10, 14][ROWS[row]];
        const d = seatD(t, i); const f = stadiumFocal(mode);
        let s = STADIUM_RING.sNear(-2, -60, d);
        s = shiftAlong(STADIUM_RING, s, d, POS[pos], 9, f);
        return bowlSeat(STADIUM_RING, t, i, s, d, { focal: f, foreground: 'premium', extra: { padded: true } });
      },
    },
    pitchside: {
      foreground: 'pitchside',
      seat(mode, row, pos) {
        const t = ST_LOWER; const i = [0, 2, 4][ROWS[row]];
        const d = seatD(t, i); const f = stadiumFocal(mode);
        let s = STADIUM_RING.sNear(24, -60, d);
        s = shiftAlong(STADIUM_RING, s, d, POS[pos], 8, f);
        return bowlSeat(STADIUM_RING, t, i, s, d, { focal: f, foreground: 'pitchside' });
      },
    },
    'private-box': {
      foreground: 'box',
      seat(mode, row, pos) {
        const f = stadiumFocal(mode);
        const b = ST_BOX;
        const r = ROWS[row];
        // front = balcony seat outside the glass, middle = at the table, back = standing at the bar.
        const d = r === 0 ? ST_LOWER.d0 + ST_LOWER.rows * ST_LOWER.depth + 1.15 : r === 1 ? b.glassD + 2.0 : b.glassD + 3.7;
        let s = STADIUM_RING.sNear(-20, -60, d);
        s = shiftAlong(STADIUM_RING, s, d, POS[pos], 7, f);
        const p = STADIUM_RING.at(s, d);
        const y = r === 0 ? b.balconyY[1] + SEATED_EYE : r === 1 ? b.floorY + 1.22 : b.floorY + STANDING_EYE;
        return {
          position: [p.x, y, p.z], target: aimAt(p.x, p.z, f), normal: [p.nx, 0, p.nz],
          foreground: r === 0 ? 'balcony' : 'box', boxRow: r, tierId: 'box',
          railDist: d - (b.d0 + 0.05), railY: b.balconyY[0] + 0.9,
          snapTier: r === 0 ? 'balcony' : null, eye: SEATED_EYE,
          glassDist: d - b.glassD, floorY: b.floorY, ceilY: b.glassTop + 0.15,
        };
      },
    },
    'upper-tier': {
      foreground: 'upper',
      seat(mode, row, pos) {
        const t = ST_UPPER; const i = [2, 12, 20][ROWS[row]];
        const d = seatD(t, i); const f = stadiumFocal(mode);
        let s = STADIUM_RING.sNear(-80, 0, d);
        s = shiftAlong(STADIUM_RING, s, d, POS[pos], 11, f);
        return bowlSeat(STADIUM_RING, t, i, s, d, { focal: f, foreground: 'upper' });
      },
    },
  },
};

/* ---------- Arena ---------- */

const ARENA_RING = new Ring(36, 23, 17);
const AR_LOWER = { id: 'lower', d0: 0.5, rows: 18, depth: 0.82, y0: 1.3, rise: 0.36, curve: 0.006, frontWall: 1.1 };
const AR_UPPER = { id: 'upper', d0: 16.8, rows: 22, depth: 0.78, y0: 14.6, rise: 0.44, curve: 0.006 };
const AR_SUITE = { d0: tierBackD(AR_LOWER), seatRows: 2, seatY: [9.4, 9.8], glassD: 17.2, floorY: 10.1, glassTop: 13.3, backD: 23.5 };

function arenaFocal(mode) {
  return mode === 'boxing' ? { x: 0, y: 1.6, z: 0 } : { x: 29, y: 6.5, z: 0 };
}

const ARENA = {
  id: 'arena',
  ring: ARENA_RING,
  floor: { hx: 34, hz: 21 },
  tiers: { lower: AR_LOWER, upper: AR_UPPER },
  suite: AR_SUITE,
  roofY: 38,
  stage: { frontX: 23, backX: 34, hz: 12, deck: 1.9 },
  ring3: { half: 3.65, apron: 4.6, deck: 1.15 }, // the boxing ring
  focal: arenaFocal,
  areas: {
    'private-suite': {
      foreground: 'suite',
      seat(mode, row, pos) {
        const f = arenaFocal(mode); const r = ROWS[row]; const b = AR_SUITE;
        const d = r === 0 ? b.d0 + 0.45 : r === 1 ? b.d0 + 1.25 : b.glassD + 2.0;
        let s = ARENA_RING.sNear(mode === 'boxing' ? -6 : 8, -60, d);
        s = shiftAlong(ARENA_RING, s, d, POS[pos], 6, f);
        const p = ARENA_RING.at(s, d);
        const y = r === 0 ? b.seatY[0] + SEATED_EYE : r === 1 ? b.seatY[1] + SEATED_EYE : b.floorY + 1.22;
        return {
          position: [p.x, y, p.z], target: aimAt(p.x, p.z, f), normal: [p.nx, 0, p.nz],
          foreground: r === 2 ? 'box' : 'suite-seats', boxRow: r, tierId: 'suite',
          railDist: d - (b.d0 + 0.05), railY: b.seatY[0] + 0.9,
          snapTier: r < 2 ? 'suite-seats' : null, eye: SEATED_EYE,
          glassDist: d - b.glassD, floorY: b.floorY, ceilY: b.glassTop + 0.15,
        };
      },
    },
    'premium-lower': {
      foreground: 'premium',
      seat(mode, row, pos) {
        const t = AR_LOWER; const i = [3, 7, 11][ROWS[row]];
        const d = seatD(t, i); const f = arenaFocal(mode);
        let s = mode === 'boxing' ? ARENA_RING.sNear(-40, -40, d) : ARENA_RING.sNear(-8, -60, d);
        s = shiftAlong(ARENA_RING, s, d, POS[pos], 6, f);
        return bowlSeat(ARENA_RING, t, i, s, d, { focal: f, foreground: 'premium', extra: { padded: true } });
      },
    },
    floor: {
      foreground: 'floor',
      seat(mode, row, pos) {
        const f = arenaFocal(mode); const r = ROWS[row]; const p = POS[pos];
        if (mode === 'boxing') {
          // Ringside rows on the -z side of the ring, facing it.
          const z = -(ARENA.ring3.apron + 2.2 + r * 1.9);
          const x = p * 3.2;
          return {
            position: [x, 0.25 + SEATED_EYE - 0.1, z], target: [f.x, f.y + 0.4, f.z], normal: [0, 0, -1],
            foreground: 'ringside', rowIndex: r, tierId: 'floor',
          };
        }
        const x = [17.5, 8, -4][r];
        const z = p * -6;
        return {
          position: [x, STANDING_EYE + 0.05, z], target: [f.x, f.y, f.z * 0.4], normal: [-1, 0, 0],
          foreground: 'floor', rowIndex: r, tierId: 'floor',
        };
      },
    },
    'upper-tier': {
      foreground: 'upper',
      seat(mode, row, pos) {
        const t = AR_UPPER; const i = [2, 12, 19][ROWS[row]];
        const d = seatD(t, i); const f = arenaFocal(mode);
        let s = ARENA_RING.sNear(mode === 'boxing' ? 10 : -14, 60, d);
        s = shiftAlong(ARENA_RING, s, d, POS[pos], 8, f);
        return bowlSeat(ARENA_RING, t, i, s, d, { focal: f, foreground: 'upper' });
      },
    },
  },
};

/* ---------- Concert hall (an illustrative elliptical hall, not a survey of any venue) ---------- */

const HALL_RING = new Ring(16, 13, 12.5);
// Half angle (radians, measured on the ring normal) of the organ arc behind the stage,
// where the box tiers and the circle stop and the organ case stands instead.
const HA_ORGAN = 0.62;
const HA_LOWER = { id: 'lower', d0: 0.6, rows: 12, depth: 0.85, y0: 1.0, rise: 0.42, curve: 0.006 };
const HA_BOXES = [
  { id: 'box1', frontD: 10.2, backD: 13.4, floorY: 9.0, ceilY: 11.9, pitch: 3.3 },
  { id: 'box2', frontD: 11.0, backD: 14.2, floorY: 12.2, ceilY: 15.0, pitch: 3.3 },
];
const HA_CIRCLE = { id: 'circle', d0: 11.8, rows: 9, depth: 0.9, y0: 15.9, rise: 0.5, curve: 0.01 };
// The colonnade stands at the back of the gallery (colD), behind the standing rows.
const HA_GALLERY = { d0: tierBackD(HA_CIRCLE), backD: 23.6, floorY: 22.8, colD: 23.05, colTop: 27.2 };
const HA_DOME = { springD: 23.6, springY: 27.6, apexY: 42, topD: -9.6 };
const HA_STAGE = { frontX: 3.6, bow: 0.04, deck: 1.2, conductor: [5.0, 0] };
export const HA_PARAPET = 0.85; // box parapet height above the box floor

const hallFocal = () => ({ x: 9.0, y: 2.4, z: 0 });
// Gallery colonnade: column k stands at arc length (k + 0.5) * step (offset colD).
export function hallColumns() {
  const L0 = HALL_RING.length(HA_GALLERY.colD); const n = Math.round(L0 / 3.1);
  return { n, step: L0 / n };
}
export const hallAllowed = (p) => p.nx < 0 || Math.abs(Math.atan2(p.nz, p.nx)) >= HA_ORGAN;
export const stageFrontX = (z) => HA_STAGE.frontX + HA_STAGE.bow * z * z;

// Arc-length range [sA, sB] (at offset dRef) that the box tiers and circle run along.
export function hallArc(dRef) {
  const q = HA_ORGAN / (Math.PI / 2);
  return [HALL_RING.sOf(3, q, dRef), HALL_RING.sOf(1, 1 - q, dRef) + HALL_RING.length(dRef)];
}

// Box partitions and box centres for one box tier, as ring positions { i, f }.
export function hallBoxes(b) {
  const [sA, sB] = hallArc(b.frontD);
  const n = Math.max(1, Math.round((sB - sA) / b.pitch));
  const step = (sB - sA) / n;
  const parts = []; const centres = [];
  for (let k = 0; k <= n; k++) parts.push(HALL_RING.locate(sA + k * step, b.frontD));
  for (let k = 0; k < n; k++) centres.push(HALL_RING.locate(sA + (k + 0.5) * step, b.frontD));
  return { parts, centres, step };
}

// Seats on the floor: arcs of rows facing the conductor, with two aisles. Rows are
// staggered by half a seat and stand on low risers that rake gently towards the back.
export const hallRake = (k) => Math.max(0, k - 1) * 0.085;
export const hallRowR = (k) => 4.2 + k * 0.95;
export function hallFloorRows() {
  const [cx, cz] = HA_STAGE.conductor; const rows = [];
  for (let k = 0; k < 30; k++) {
    const r = hallRowR(k); const row = [];
    const dphi = 0.55 / r;
    const n = Math.floor(1.0 / dphi);
    for (let q = -n; q <= n; q++) {
      const phi = (q + (k % 2) * 0.5) * dphi; const a = Math.abs(phi);
      if (a > 0.3 && a < 0.4) continue; // aisles
      const x = cx - r * Math.cos(phi); const z = cz + r * Math.sin(phi);
      if (HALL_RING.dOf(x, z) > -0.9 || x > stageFrontX(z) - 1.6) continue;
      row.push({ x, y: hallRake(k), z, nx: (x - cx) / r, nz: (z - cz) / r, row: k, tier: 'floor', angle: Math.atan2(z, x), w: 0.55, phi });
    }
    if (row.length) rows.push(row);
  }
  return rows;
}

function hallFloorSeat(k, pos, f) {
  const [cx, cz] = HA_STAGE.conductor; const r = hallRowR(k);
  const phi = [-0.62, 0, 0.62][POS[pos] + 1];
  const x = cx - r * Math.cos(phi); const z = cz + r * Math.sin(phi);
  return {
    position: [x, hallRake(k) + SEATED_EYE, z], target: aimAt(x, z, f), normal: [(x - cx) / r, 0, (z - cz) / r],
    foreground: 'stalls', rowIndex: k, tierId: 'floor', snapTier: 'floor', eye: SEATED_EYE,
  };
}

const HALL = {
  id: 'hall',
  ring: HALL_RING,
  tiers: { lower: HA_LOWER, circle: HA_CIRCLE },
  boxes: HA_BOXES, gallery: HA_GALLERY, dome: HA_DOME, stage: HA_STAGE, organ: HA_ORGAN,
  focal: hallFocal,
  areas: {
    'private-box': {
      seat(mode, row, pos) {
        const f = hallFocal(); const b = HA_BOXES[0];
        const { centres, step } = hallBoxes(b);
        let k = 0; let best = Infinity;
        centres.forEach((c, n) => { const p = HALL_RING.point(c.i, c.f, b.frontD); const dd = (p.x + 3) ** 2 + (p.z + 60) ** 2; if (dd < best) { best = dd; k = n; } });
        // Left or right takes you to the neighbouring box.
        if (POS[pos]) {
          const c0 = HALL_RING.point(centres[k].i, centres[k].f, b.frontD);
          const c1 = HALL_RING.point(centres[k + 1].i, centres[k + 1].f, b.frontD);
          const rx = -(f.z - c0.z); const rz = f.x - c0.x; // the viewer's right
          const sign = Math.sign((c1.x - c0.x) * rx + (c1.z - c0.z) * rz) || 1;
          k = Math.max(0, Math.min(centres.length - 1, k + sign * POS[pos]));
        }
        const r = ROWS[row];
        const d = b.frontD + [0.42, 1.4, 2.5][r];
        const c = centres[k];
        const p = HALL_RING.point(c.i, c.f, d);
        // The second row sits between the two front chairs, on a raised chair.
        const off = r === 1 ? 0.4 : 0;
        const y = b.floorY + [SEATED_EYE + 0.04, SEATED_EYE + 0.24, STANDING_EYE][r];
        return {
          position: [p.x + p.nz * off, y, p.z - p.nx * off], target: aimAt(p.x, p.z, f), normal: [p.nx, 0, p.nz],
          foreground: 'hall-box', boxRow: r, tierId: 'box1', eye: SEATED_EYE,
          parapetDist: d - b.frontD, parapetY: b.floorY + HA_PARAPET, floorY: b.floorY, ceilY: b.ceilY,
          boxHalf: step / 2 - 0.08, boxDepth: b.backD - b.frontD,
        };
      },
    },
    stalls: {
      seat(mode, row, pos) {
        const f = hallFocal(); const r = ROWS[row];
        if (r < 2) return hallFloorSeat([2, 9][r], pos, f);
        // Back of the stalls: the raked rows that sit under the box tier.
        const t = HA_LOWER; const i = 11; const d = seatD(t, i);
        let s = HALL_RING.sNear(-60, 0, d);
        s = shiftAlong(HALL_RING, s, d, POS[pos], 5, f);
        return bowlSeat(HALL_RING, t, i, s, d, { focal: f, foreground: 'stalls' });
      },
    },
    circle: {
      seat(mode, row, pos) {
        const f = hallFocal(); const t = HA_CIRCLE; const i = [0, 4, 8][ROWS[row]];
        const d = seatD(t, i);
        let s = HALL_RING.sNear(-60, -6, d);
        s = shiftAlong(HALL_RING, s, d, POS[pos], 6, f);
        return bowlSeat(HALL_RING, t, i, s, d, { focal: f, foreground: 'circle', extra: { railDist: d - t.d0 } });
      },
    },
    gallery: {
      seat(mode, row, pos) {
        const f = hallFocal(); const g = HA_GALLERY; const r = ROWS[row];
        // Second row looks over the rail just clears the stage; the back wall row honestly does not.
        const d = g.d0 + [0.55, 0.95, 1.9][r];
        // Stand on a line midway between two columns, so none is in your face.
        const { step } = hallColumns(); const dc = g.colD;
        let s = HALL_RING.sNear(-60, -24, dc);
        s = shiftAlong(HALL_RING, s, dc, POS[pos], 6, f);
        s = Math.round(s / step) * step;
        const { i: ci, f: cf } = HALL_RING.locate(s, dc);
        const p = HALL_RING.point(ci, cf, d);
        return {
          position: [p.x, g.floorY + STANDING_EYE, p.z], target: aimAt(p.x, p.z, f), normal: [p.nx, 0, p.nz],
          foreground: 'gallery', rowIndex: r, tierId: 'gallery', eye: STANDING_EYE, clear: 0.6, clearAhead: d - g.d0 + 0.2,
        };
      },
    },
  },
};

/* ---------- Racecourse (an illustrative grandstand and home straight) ---------- */

// The grandstand is built along the straight -z side of a long, thin Ring, so the bowl
// kit (sweeps, tiers, seat fields) works unchanged: z = -8 - d along that side.
const RC_STAND = new Ring(400, 8, 1);
// The track: a long loop whose -z straight is the home straight in front of the stand.
// Near (stands side) rail at d = 0, which is z = 10; far rail at d = -26, z = 36.
const RC_TRACK = new Ring(600, 260, 220);
const RC = {
  standX: [-140, 90],
  terrace: { id: 'terrace', d0: 0.4, rows: 10, depth: 0.9, y0: 1.0, rise: 0.36, curve: 0 },
  premierX: [-40, 28],
  rest: { floorY: 4.6, glassD: 10.6, backD: 18, ceilY: 9.0 },
  box: { floorY: 9.6, frontD: 7.4, glassD: 10.6, backD: 16.2, ceilY: 13.0, pitch: 5 },
  top: { id: 'top', d0: 8.6, rows: 8, depth: 0.85, y0: 13.8, rise: 0.45, curve: 0 },
  roof: { y: 21, frontD: -1.0, backD: 17.5 },
  track: { cx: 60, cz: 270, width: 26 },
  postX: 0, railZ: 10, farRailZ: 36,
  fences: [-125, -262], // birch fences on the straight (jumps courses only)
  screen: { x: 24, z: 96, w: 16, h: 9 },
  parade: { x: 118, z: -6, rx: 14, rz: 9 },
};
// Ring position on the grandstand side for plan x.
export const standAt = (x) => ({ i: 4, f: (RC_STAND.ax - x) / (2 * RC_STAND.ax) });
const standPoint = (x, d) => { const { i, f } = standAt(x); return RC_STAND.point(i, f, d); };
const raceFocal = () => ({ x: 0, y: 1.2, z: 24 });
const raceTarget = (x) => [x + 10, 1.0, 34];
// Facing the track (+z), the viewer's left is +x.
const raceShift = (pos, m) => -POS[pos] * m;

const RACECOURSE = {
  id: 'racecourse',
  ring: RC_STAND,
  trackRing: RC_TRACK,
  ...RC,
  focal: raceFocal,
  areas: {
    'private-box': {
      seat(mode, row, pos) {
        const b = RC.box; const r = ROWS[row];
        const k0 = Math.round((-18 - RC.standX[0]) / b.pitch - 0.5);
        const k = k0 + -POS[pos];
        const x = RC.standX[0] + b.pitch * (k + 0.5);
        // Front: standing at the balcony rail (where box guests watch the race).
        const d = [8.3, 12.0, 14.4][r];
        const p = standPoint(x, d);
        const y = b.floorY + [STANDING_EYE, SEATED_EYE + 0.04, STANDING_EYE][r];
        return {
          position: [p.x, y, p.z], target: raceTarget(x), normal: [0, 0, -1],
          foreground: r === 0 ? 'race-balcony' : 'box', boxRow: r, tierId: 'box', eye: SEATED_EYE,
          railDist: d - (b.frontD + 0.05), railY: b.floorY + 1.05,
          glassDist: d - b.glassD, floorY: b.floorY, ceilY: b.ceilY, boxHalfW: b.pitch / 2 - 0.06,
        };
      },
    },
    restaurant: {
      seat(mode, row, pos) {
        const R0 = RC.rest; const r = ROWS[row];
        const x = -55 + raceShift(pos, 7);
        const d = [11.5, 13.6, 15.8][r];
        const p = standPoint(x, d);
        return {
          position: [p.x, R0.floorY + SEATED_EYE + 0.04, p.z], target: raceTarget(x), normal: [0, 0, -1],
          foreground: 'restaurant', boxRow: r, tierId: 'restaurant', eye: SEATED_EYE,
          glassDist: d - R0.glassD, floorY: R0.floorY, ceilY: R0.ceilY,
        };
      },
    },
    'premier-enclosure': {
      seat(mode, row, pos) {
        const t = RC.terrace; const i = [1, 4, 8][ROWS[row]];
        const x = 8 + raceShift(pos, 7); const d = seatD(t, i);
        const p = standPoint(x, d);
        return {
          position: [p.x, rowY(t, i) + SEATED_EYE, p.z], target: raceTarget(x), normal: [0, 0, -1],
          foreground: 'premium', rowIndex: i, tierId: 'terrace', snapTier: 'terrace', eye: SEATED_EYE,
        };
      },
    },
    lawn: {
      seat(mode, row, pos) {
        const r = ROWS[row];
        const x = -28 + raceShift(pos, 8); const z = [8.5, 5.2, 1.6][r];
        return {
          position: [x, STANDING_EYE, z], target: [x + 10, r === 0 ? -2.2 : 0.4, 34], normal: [0, 0, -1],
          foreground: 'lawn', rowIndex: r, tierId: 'lawn', eye: STANDING_EYE, railDist: RC.railZ - z, clear: 0.95, clearAhead: RC.railZ - z + 0.5,
        };
      },
    },
  },
};

export const LAYOUTS = { stadium: STADIUM, arena: ARENA, hall: HALL, racecourse: RACECOURSE };

export const hasLayout = (archetype) => !!LAYOUTS[archetype];

// The one function everything uses to place the camera.
// Returns { position:[x,y,z], target:[x,y,z], normal, foreground, ... } or null.
export function seatSpec(archetype, mode, areaId, row = 'middle', pos = 'centre') {
  const L = LAYOUTS[archetype];
  const a = L?.areas?.[areaId];
  if (!a) return null;
  return a.seat(mode, ROWS[row] != null ? row : 'middle', POS[pos] != null ? pos : 'centre');
}

/* ---------- Plain-words geometry for descriptions ---------- */

export function describeSeat(spec) {
  if (!spec) return '';
  const [x, y, z] = spec.position; const [tx, ty, tz] = spec.target;
  const dist = Math.hypot(tx - x, tz - z);
  const height = y - ty;
  const near = dist < 18 ? 'very close to' : dist < 40 ? 'a short distance from' : dist < 70 ? 'a moderate distance from' : 'a long way from';
  const high = height < 3 ? 'at almost the same level as' : height < 10 ? 'a little above' : height < 22 ? 'well above' : 'high above';
  return `${near} the action and ${high} it`;
}

/* ---------- Mini-map (SVG strings) ---------- */

export function ringPath(ring, d, step = 2) {
  const L = ring.length(d);
  const pts = [];
  for (let s = 0; s < L; s += step) { const p = ring.at(s, d); pts.push(`${p.x.toFixed(1)},${p.z.toFixed(1)}`); }
  return `M${pts.join('L')}Z`;
}

function ringBand(ring, d0, d1, s0, s1, step = 1.5) {
  // A band of the ring between arc fractions s0..s1 (0..1 of the length at offset d0).
  const L0 = ring.length(d0); const L1 = ring.length(d1);
  const a = []; const b = [];
  const n = Math.max(2, Math.ceil(((s1 - s0) * L1) / step));
  for (let k = 0; k <= n; k++) {
    const u = s0 + (s1 - s0) * (k / n);
    const p0 = ring.at(u * L0, d0); const p1 = ring.at(u * L1, d1);
    a.push(`${p0.x.toFixed(1)},${p0.z.toFixed(1)}`);
    b.unshift(`${p1.x.toFixed(1)},${p1.z.toFixed(1)}`);
  }
  return `M${a.join('L')}L${b.join('L')}Z`;
}

// Zone shapes (for clicking) per area, as SVG path strings in world plan coordinates.
function zoneFor(L, archetype, mode, areaId) {
  const spec = seatSpec(archetype, mode, areaId, 'middle', 'centre');
  if (!spec) return '';
  const [x, , z] = spec.position;
  if (spec.tierId === 'floor') {
    if (mode === 'boxing') return `M${-7},${-L.ring3.apron - 1.2}L7,${-L.ring3.apron - 1.2}L7,${-L.ring3.apron - 7.5}L-7,${-L.ring3.apron - 7.5}Z`;
    return `M-8,-11L21,-11L21,11L-8,11Z`;
  }
  const ring = L.ring;
  const tier = spec.tierId === 'upper' ? L.tiers.upper : spec.tierId === 'lower' ? L.tiers.lower : null;
  const d0 = tier ? tier.d0 : (L.box || L.suite).d0;
  const d1 = tier ? tierBackD(tier) : (L.box || L.suite).backD;
  const dm = (d0 + d1) / 2;
  const Lm = ring.length(dm);
  const s = ring.sNear(x, z, dm) / Lm;
  const half = (spec.tierId === 'box' || spec.tierId === 'suite' ? 14 : 17) / Lm;
  return ringBand(ring, d0, d1, s - half, s + half);
}

// Returns { viewBox, base (svg markup), zones: { areaId: pathD }, seats: { areaId: [x,z] } }.
export function plan(archetype, mode) {
  const L = LAYOUTS[archetype];
  if (!L) return null;
  if (archetype === 'hall') return hallPlan(mode);
  if (archetype === 'racecourse') return racePlan(mode);
  const ring = L.ring;
  const outer = archetype === 'stadium' ? tierBackD(L.tiers.upper) + 2 : tierBackD(L.tiers.upper) + 1.5;
  const W = ring.hx + outer + 4; const H = ring.hz + outer + 4;
  const parts = [];
  parts.push(`<path class="mm-shell" d="${ringPath(ring, outer)}"/>`);
  parts.push(`<path class="mm-upper" d="${ringPath(ring, tierBackD(L.tiers.upper))}"/>`);
  parts.push(`<path class="mm-mid" d="${ringPath(ring, L.tiers.upper.d0)}"/>`);
  parts.push(`<path class="mm-lower" d="${ringPath(ring, tierBackD(L.tiers.lower))}"/>`);
  parts.push(`<path class="mm-inner" d="${ringPath(ring, 0)}"/>`);
  if (archetype === 'stadium') {
    const { hx, hz } = L.pitch;
    if (mode === 'concert') {
      parts.push(`<rect class="mm-floor" x="${-hx}" y="${-hz}" width="${2 * hx}" height="${2 * hz}" rx="1"/>`);
      const st = L.stage;
      parts.push(`<rect class="mm-stage" x="${st.frontX}" y="${-st.hz}" width="${st.backX - st.frontX}" height="${2 * st.hz}" rx="1"/>`);
    } else {
      parts.push(`<rect class="mm-pitch" x="${-hx}" y="${-hz}" width="${2 * hx}" height="${2 * hz}" rx="0.5"/>`);
      parts.push(`<path class="mm-line" d="M0,${-hz}V${hz}M${-hx},-20.16h16.5v40.32h-16.5M${hx},-20.16h-16.5v40.32h16.5"/>`);
      parts.push(`<circle class="mm-line" cx="0" cy="0" r="9.15"/>`);
    }
  } else if (archetype === 'arena') {
    const { hx, hz } = L.floor;
    parts.push(`<rect class="mm-floor" x="${-hx}" y="${-hz}" width="${2 * hx}" height="${2 * hz}" rx="4"/>`);
    if (mode === 'boxing') {
      const r = L.ring3.half;
      parts.push(`<rect class="mm-stage" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}"/>`);
    } else {
      const st = L.stage;
      parts.push(`<rect class="mm-stage" x="${st.frontX}" y="${-st.hz}" width="${st.backX - st.frontX}" height="${2 * st.hz}" rx="1"/>`);
    }
  }
  const zones = {}; const seats = {};
  Object.keys(L.areas).forEach((id) => {
    zones[id] = zoneFor(L, archetype, mode, id);
    const sp = seatSpec(archetype, mode, id);
    seats[id] = [sp.position[0], sp.position[2]];
  });
  const focal = L.focal(mode);
  return { viewBox: `${-W} ${-H} ${2 * W} ${2 * H}`, base: parts.join(''), zones, seats, focal: [focal.x, focal.z], mark: (2 * W) / 220 };
}

function seatsOf(archetype, L, mode) {
  const seats = {};
  Object.keys(L.areas).forEach((id) => { const sp = seatSpec(archetype, mode, id); seats[id] = [sp.position[0], sp.position[2]]; });
  return seats;
}

function polyPath(pts) { return `M${pts.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join('L')}Z`; }

function hallPlan(mode) {
  const L = HALL; const ring = L.ring;
  const outer = HA_GALLERY.backD + 1.4;
  const W = ring.hx + outer + 2; const H = ring.hz + outer + 2;
  const parts = [];
  parts.push(`<path class="mm-shell" d="${ringPath(ring, outer, 1)}"/>`);
  parts.push(`<path class="mm-upper" d="${ringPath(ring, HA_GALLERY.backD, 1)}"/>`);
  parts.push(`<path class="mm-mid" d="${ringPath(ring, HA_GALLERY.d0, 1)}"/>`);
  parts.push(`<path class="mm-lower" d="${ringPath(ring, HA_BOXES[0].backD, 1)}"/>`);
  parts.push(`<path class="mm-mid" d="${ringPath(ring, tierBackD(HA_LOWER), 1)}"/>`);
  parts.push(`<path class="mm-inner" d="${ringPath(ring, 0, 1)}"/>`);
  // Organ arc behind the stage.
  const q = HA_ORGAN / (Math.PI / 2);
  const sA = ring.sOf(1, 1 - q, 11); const sB = ring.sOf(3, q, 11);
  const Lo = ring.length(11);
  parts.push(`<path class="mm-organ" d="${ringBand(ring, 10.9, 12.2, sA / Lo, sB / Lo, 0.8)}"/>`);
  // Floor and stage.
  const floorPts = []; const stagePts = [];
  const L0 = ring.length(-0.4);
  for (let s = 0; s < L0; s += 0.6) {
    const p = ring.at(s, -0.4);
    (p.x < stageFrontX(p.z) ? floorPts : stagePts).push([p.x, p.z]);
  }
  parts.push(`<path class="mm-floor" d="${ringPath(ring, -0.4, 1)}"/>`);
  // Stage points run in ring order from the +z side round to the -z side; close along the curved front.
  const z0 = stagePts[stagePts.length - 1][1]; const z1 = stagePts[0][1];
  const front = []; for (let k = 1; k < 12; k++) { const z = z0 + (z1 - z0) * (k / 12); front.push([stageFrontX(z), z]); }
  parts.push(`<path class="mm-stage" d="${polyPath([...stagePts, ...front])}"/>`);
  // Zones.
  const zones = {};
  const band = (d0, d1, sx, sz, half) => {
    const dm = (d0 + d1) / 2; const Lm = ring.length(dm); const s = ring.sNear(sx, sz, dm) / Lm;
    return ringBand(ring, d0, d1, s - half / Lm, s + half / Lm, 0.8);
  };
  const sp = (id) => seatSpec('hall', mode, id);
  const bx = sp('private-box').position; zones['private-box'] = band(HA_BOXES[0].frontD, HA_BOXES[0].backD, bx[0], bx[2], 5);
  const cp = sp('circle').position; zones.circle = band(HA_CIRCLE.d0, tierBackD(HA_CIRCLE), cp[0], cp[2], 9);
  const gp = sp('gallery').position; zones.gallery = band(HA_GALLERY.d0, HA_GALLERY.backD, gp[0], gp[2], 9);
  zones.stalls = polyPath(floorPts.filter((p) => p[0] < HA_STAGE.frontX - 1.2));
  return { viewBox: `${-W} ${-H} ${2 * W} ${2 * H}`, base: parts.join(''), zones, seats: seatsOf('hall', HALL, mode), focal: [hallFocal().x, 0], mark: (2 * W) / 220 };
}

function racePlan(mode) {
  const R0 = RACECOURSE; const vb = [-125, -40, 250, 150];
  const parts = [];
  const [sx0, sx1] = R0.standX;
  parts.push(`<rect class="mm-turf" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}"/>`);
  parts.push(`<rect class="mm-track" x="${vb[0]}" y="${R0.railZ}" width="${vb[2]}" height="${R0.farRailZ - R0.railZ}"/>`);
  parts.push(`<path class="mm-rail" d="M${vb[0]},${R0.railZ}H${vb[0] + vb[2]}M${vb[0]},${R0.farRailZ}H${vb[0] + vb[2]}"/>`);
  parts.push(`<path class="mm-post" d="M0,${R0.railZ - 2}V${R0.farRailZ}"/>`);
  parts.push(`<rect class="mm-upper" x="${sx0}" y="${-8 - R0.roof.backD}" width="${sx1 - sx0}" height="${R0.roof.backD}"/>`);
  parts.push(`<rect class="mm-lower" x="${sx0}" y="${-8 - tierBackD(R0.terrace)}" width="${sx1 - sx0}" height="${tierBackD(R0.terrace)}"/>`);
  const scr = R0.screen;
  parts.push(`<rect class="mm-stage" x="${scr.x - scr.w / 2}" y="${scr.z - 1}" width="${scr.w}" height="2"/>`);
  const pr = R0.parade;
  parts.push(`<ellipse class="mm-parade" cx="${pr.x}" cy="${pr.z}" rx="${pr.rx}" ry="${pr.rz}"/>`);
  const rect = (x0, x1, z0, z1) => `M${x0},${z0}H${x1}V${z1}H${x0}Z`;
  const zones = {
    lawn: rect(-62, -2, -7.6, 9.4),
    'premier-enclosure': rect(-6, 28, -17.4, -8.4),
    'private-box': rect(-38, -6, -24.2, -15.4),
    restaurant: rect(-78, -40, -26, -18.6),
  };
  return { viewBox: vb.join(' '), base: parts.join(''), zones, seats: seatsOf('racecourse', RACECOURSE, mode), focal: [0, 24], mark: vb[2] / 220 };
}
