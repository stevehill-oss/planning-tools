// Seat plan: every seat, box and area of a venue for the seat map, built 02/11/2026.
//
// Seats come from layouts.tierSlots() with layouts.tierBuildOpts(), exactly as the 3D bowl
// builds them (js/viewer/bowl.js), so a seat on the map is a seat in the model: same x, y, z.
// Numbering follows js/data/seatmaps.js: block ids from the block runs, row labels in the
// venue's convention (numbers or letters, counted from the front row), seat numbers in the
// stated or modelled direction. Products (hospitality areas) come from the sections of each
// area in js/data/venues.js. No prices and no sales status: seats carry no such data.
//
// API
//   seatMap(venueId, mode, day) -> M (cached)           everything the map draws
//   seatRef(M, k) -> { block, row, seat }              the published-style address of seat k
//   findSeat(M, block, row, seat) -> { k, note, exact } Find my seat
//   nearestSeat(M, x, y, z, tierId?) -> k | -1
//   neighbour(M, k, dir) -> k                          dir: left, right, front, back
//   specForSeat(M, k) -> camera spec for the viewer (same shape as layouts.seatSpec)
//   boxSpot(M, box) -> { area, place, pos }            a box's seat in the viewer
//   seatFacts(M, k, spec) -> [{ label, value, status, source, note }]   the seat panel
//   seatStyleFor(venueId, mode) -> (slot) => { padded, arms }   used by the 3D builders
//   seatWords(M, k) -> 'Block 112, Row M, Seat 14'

import {
  layoutFor, tierSlots, tierBuildOpts, seatD, rowY, rowD, DESIGN, cValue, rakeDeg, seatNumbers,
  hallFloorRows, hallBoxes, bandPath, sectionZone, planFrame, plan,
} from './layouts.js';
import { SEATMAPS, STANDARDS, CHAIRS } from '../data/seatmaps.js';
import { areasFor, areaName } from '../data/venues.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const mod = (v, m) => ((v % m) + m) % m;
const inArc = (s, a, b, Lr) => mod(s - a, Lr) < (b - a) - 1e-6;

// Row labels for a run: numbers from 1 or letters from A (skipping the venue's skipped letters).
function rowLabel(style, k, skip = []) {
  if (style !== 'letters') return String(k + 1);
  const L = LETTERS.filter((c) => !skip.includes(c));
  return k < L.length ? L[k] : `${L[k % L.length]}${L[k % L.length]}`;
}

const s0Of = (ring, s, d) => { const { i, f } = ring.locate(s, d); return ring.sOf(i, f, 0); };
const PADDED = (a) => /padded/i.test(a?.seatType || '') || /cushy/i.test(a?.view || '');

/* ---------- Products: which area a seat belongs to ---------- */

// Tests for every area and place whose section holds tier seats.
function productTests(L, venueId, mode, day) {
  const list = areasFor(venueId, { mode, day });
  const tests = [];
  const order = [...list.filter((a) => a.kind === 'hospitality'), ...list.filter((a) => a.kind !== 'hospitality')];
  order.forEach((a) => (a.places || []).forEach((p) => {
    const sec = L.sections?.[p.section];
    if (!sec || (sec.modes && !sec.modes.includes(mode))) return;
    if (sec.kind === 'tier') {
      const bs = sec.blocks && L.blocks?.[sec.blocks];
      const blocks = bs ? new Set((p.blocks || bs.ids).map(String)) : null;
      tests.push({ area: a, place: p, sec, tier: sec.tier, rows: sec.rows, arc: blocks ? null : sec.arc, blocks });
    } else if (sec.kind === 'room') {
      const B = L.bands[sec.band];
      tests.push({ area: a, place: p, sec, tier: B.tier, rows: [Math.min(...B.seatRows), Math.max(...B.seatRows)], arc: sec.arc, room: true });
    }
  }));
  return { list, tests };
}

function matchProduct(tests, tierId, row, s0, blockId, Lr) {
  for (const T of tests) {
    if (T.tier !== tierId || row < T.rows[0] || row > T.rows[1]) continue;
    if (T.blocks) { if (T.blocks.has(blockId)) return T; continue; }
    if (T.arc && inArc(s0, T.arc[0], T.arc[1], Lr)) return T;
  }
  return null;
}

// Padded seats and armrests for the 3D bowl: padded only where the product's seat type says
// so (stated), armrests only where the venue states them (Royal Albert Hall).
const styleCache = {};
export function seatStyleFor(venueId, mode) {
  const key = `${venueId}:${mode}`;
  if (styleCache[key]) return styleCache[key];
  const L = layoutFor(venueId); const data = SEATMAPS[venueId] || {};
  if (!L?.ring) return (styleCache[key] = () => ({ padded: false, arms: false }));
  const { tests } = productTests(L, venueId, mode, null);
  const Lr = L.ring.length(0); const blockOf = blockLookup(L);
  const arms = data.armrests || null;
  const fn = (slot) => {
    const t = L.tiers[slot.tier]; if (!t) return { padded: false, arms: false };
    const s0 = s0Of(L.ring, slot.s, seatD(t, slot.row));
    const b = blockOf(slot.tier, slot.row, slot.mid0 ?? s0);
    const T = matchProduct(tests, slot.tier, slot.row, s0, b?.id, Lr);
    const run = b?.run;
    let a = false;
    if (arms) { const id = run?.area || (T?.area.id) || data.tiers?.[slot.tier]?.standard; a = !!(arms[id === 'rausing-circle' ? 'circle' : id]?.arms); }
    return { padded: !!(T && T.area.kind === 'hospitality' && PADDED(T.area)), arms: a };
  };
  return (styleCache[key] = fn);
}

// (tierId, row, s at d = 0) -> { id, status, run, j } for the block holding that point.
function blockLookup(L) {
  const Lr = L.ring.length(0);
  return (tierId, row, s) => {
    for (const r of L.runs || []) {
      if (r.tier !== tierId || row < r.rows[0] || row > r.rows[1]) continue;
      for (let j = 0; j < r.blocks.length; j++) {
        const b = r.blocks[j];
        if (inArc(s, b.arc[0], b.arc[1], Lr)) return { ...b, run: r, j };
      }
    }
    return null;
  };
}

/* ---------- The map ---------- */

const mapCache = new Map();
export function seatMap(venueId, mode, day = null) {
  const key = `${venueId}:${mode}:${day || ''}`;
  if (mapCache.has(key)) return mapCache.get(key);
  const L = layoutFor(venueId); if (!L) return null;
  const data = SEATMAPS[venueId] || {};
  const { list, tests } = productTests(L, venueId, mode, day);
  const M = {
    venueId, mode, day, arch: L.archetype, L, data, frame: planFrame(venueId, mode), baseSvg: plan(venueId, mode)?.base || '',
    areas: list.map((a) => ({ id: a.id, name: areaName(a, mode, day), kind: a.kind, padded: PADDED(a) })),
    levels: [], blocks: [], blockById: new Map(), boxes: [], zones: [], products: [], access: [], places: [],
    notes: [data.blockNote, ...(data.notes || [])].filter(Boolean), tiers: [],
  };
  M.areaIndex = new Map(M.areas.map((a, k) => [a.id, k]));
  const placeIdx = new Map();
  const placeOf = (T) => {
    const id = `${T.area.id}|${T.place.id}`;
    if (!placeIdx.has(id)) { placeIdx.set(id, M.places.length); M.places.push({ area: T.area.id, place: T.place.id, section: T.sec }); }
    return placeIdx.get(id);
  };
  const levelIdx = new Map();
  const levelOf = (id, label) => { if (!levelIdx.has(id)) { levelIdx.set(id, M.levels.length); M.levels.push({ id, label }); } return id; };

  const S = { x: [], y: [], z: [], nx: [], nz: [], w: [], row: [], blk: [], area: [], place: [], tier: [], padded: [], arms: [] };
  const sAlong = []; // arc length at d = 0 along the seat's run (orders seats in a row)
  const push = (o) => { Object.keys(S).forEach((k) => S[k].push(o[k] ?? 0)); return S.x.length - 1; };
  const armsData = data.armrests || null;
  const armsFor = (areaId) => !!(armsData && armsData[areaId === 'rausing-circle' ? 'circle' : areaId]?.arms);

  if (L.ring && L.archetype !== 'racecourse') {
    const ring = L.ring; const Lr = ring.length(0); const blockOf = blockLookup(L);
    const blockRec = new Map();
    const getBlock = (b, tierId) => {
      const k = `${b.run.k}:${b.id}`;
      if (blockRec.has(k)) return blockRec.get(k);
      const r = b.run; const lvl = levelOf(r.level, r.level);
      const t = L.tiers[tierId];
      const rec = {
        idx: M.blocks.length, id: b.id, label: r.label ? r.label(b.id) : r.prefix ? `${r.prefix} ${b.id}` : `Block ${b.id}`,
        short: r.label ? r.label(b.id).replace(/^Stalls /, '').replace(/^Rausing Circle$/, 'Circle').replace(/^Choir, section /, 'Ch') : b.id,
        level: lvl, levelLabel: r.level, stand: r.stand || '', status: b.status, tier: tierId, run: r,
        rowStyle: r.rowStyle || data.rows?.style || 'numbers', rowBase: r.rowBase || 'run',
        arc: b.arc, rows: new Map(), path: bandPath(ring, rowD(t, r.rows[0]), rowD(t, r.rows[1] + 1), b.arc[0] + 0.15, b.arc[1] - 0.15, 1.2),
        continuous: !!r.continuous, access: [], areaCount: new Map(), depthM: rowD(t, r.rows[1] + 1) - rowD(t, r.rows[0]),
      };
      const at = ring.locate((b.arc[0] + b.arc[1]) / 2, 0);
      const pm = ring.point(at.i, at.f, (rowD(t, r.rows[0]) + rowD(t, r.rows[1] + 1)) / 2);
      rec.cx = pm.x; rec.cz = pm.z;
      blockRec.set(k, rec); M.blocks.push(rec);
      return rec;
    };
    const tierIds = Object.keys(data.tiers || {}).filter((id) => L.tiers[id]);
    tierIds.forEach((tid, ti) => {
      M.tiers.push(tid);
      const t = L.tiers[tid];
      const { slots } = tierSlots(ring, t, tierBuildOpts(L, tid));
      slots.forEach((sl) => {
        const s0 = s0Of(ring, sl.s, seatD(t, sl.row));
        const b = blockOf(tid, sl.row, sl.mid0 ?? s0); if (!b) return;
        const rec = getBlock(b, tid);
        const T = matchProduct(tests, tid, sl.row, s0, b.id, Lr);
        // Area: the product whose section holds the seat, else the run's area, else the tier's
        // plain seating area; -1 where the research names nothing (premium levels).
        const runArea = b.run.area ? M.areaIndex.get(b.run.area) : undefined;
        const stdArea = data.tiers[tid]?.standard ? M.areaIndex.get(data.tiers[tid].standard) : undefined;
        const ai = T ? M.areaIndex.get(T.area.id) : runArea ?? stdArea ?? -1;
        const areaId = ai >= 0 ? M.areas[ai].id : null;
        const k = push({ x: sl.x, y: sl.y, z: sl.z, nx: sl.nx, nz: sl.nz, w: sl.w, row: sl.row, blk: rec.idx, area: ai, place: T ? placeOf(T) : -1, tier: ti, padded: T && T.area.kind === 'hospitality' && PADDED(T.area) ? 1 : 0, arms: armsFor(areaId) ? 1 : 0 });
        sAlong[k] = mod(s0 - b.run.arc[0], Lr) + b.run.arc[0];
        if (!rec.rows.has(sl.row)) rec.rows.set(sl.row, []);
        rec.rows.get(sl.row).push(k);
        rec.areaCount.set(ai, (rec.areaCount.get(ai) || 0) + 1);
      });
    });
    // Hall: the Arena floor seats (their own rows round the conductor).
    if (L.archetype === 'hall') {
      const ti = M.tiers.length; M.tiers.push('floor');
      const lvl = levelOf('Arena', 'Arena');
      const rec = { idx: M.blocks.length, id: 'Arena', label: 'Arena', short: 'Arena', level: lvl, levelLabel: 'Arena', stand: '', status: 'modelled', tier: 'floor', run: { k: -1, level: 'Arena' }, rowStyle: 'numbers', rowBase: 'run', rows: new Map(), path: '', continuous: false, access: [], areaCount: new Map(), floor: true };
      const ai = M.areaIndex.get('arena') ?? -1;
      hallFloorRows(L).forEach((row) => {
        const sorted = [...row].sort((a, b) => b.phi - a.phi);
        sorted.forEach((sl) => {
          const k = push({ x: sl.x, y: sl.y, z: sl.z, nx: sl.nx, nz: sl.nz, w: sl.w || 0.55, row: sl.row, blk: rec.idx, area: ai, place: -1, tier: ti, padded: 0, arms: armsFor('arena') ? 1 : 0 });
          if (!rec.rows.has(sl.row)) rec.rows.set(sl.row, []);
          rec.rows.get(sl.row).push(k);
        });
      });
      const xs = []; const zs = []; rec.rows.forEach((ks) => ks.forEach((k) => { xs.push(S.x[k]); zs.push(S.z[k]); }));
      rec.cx = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length); rec.cz = zs.reduce((a, b) => a + b, 0) / Math.max(1, zs.length);
      rec.path = sectionZone(L, mode, L.sections.arena);
      M.blocks.push(rec);
    }
  }

  // Typed arrays for drawing.
  const n = S.x.length;
  M.seats = { n };
  ['x', 'y', 'z', 'nx', 'nz', 'w'].forEach((k) => { M.seats[k] = Float32Array.from(S[k]); });
  M.seats.row = Int16Array.from(S.row); M.seats.blk = Int32Array.from(S.blk); M.seats.area = Int16Array.from(S.area);
  M.seats.place = Int16Array.from(S.place); M.seats.tier = Int8Array.from(S.tier); M.seats.padded = Uint8Array.from(S.padded); M.seats.arms = Uint8Array.from(S.arms);
  M.seats.num = new Int32Array(n); M.seats.rib = new Int16Array(n);

  // Rows and seat numbers, in each block (or along the whole run where numbering is continuous).
  const dirOf = (rec) => (rec.run?.seatDir || data.seats?.dir || 'acw');
  M.blocks.forEach((rec) => {
    const tierRows = [...rec.rows.keys()].sort((a, b) => a - b);
    const base = rec.rowBase === 'tier' ? 0 : (rec.run?.rows?.[0] ?? tierRows[0] ?? 0);
    rec.rowList = tierRows.map((i) => {
      const ks = rec.rows.get(i);
      if (!rec.floor) ks.sort((a, b) => sAlong[a] - sAlong[b]);
      if (dirOf(rec) === 'cw' && !rec.floor) ks.reverse();
      const label = rowLabel(rec.rowStyle, rec.floor ? i : i - base, data.rows?.skip || []);
      ks.forEach((k, j) => { M.seats.rib[k] = 0; M.seats.num[k] = j + 1; });
      return { i, label, seats: ks };
    });
    rec.rowList.forEach((r, ri) => r.seats.forEach((k) => { M.seats.rib[k] = ri; }));
    let best = -1; let bc = -1; rec.areaCount.forEach((c, a) => { if (a >= 0 && c > bc) { bc = c; best = a; } });
    rec.area = best;
    M.blockById.set(rec.id.toLowerCase(), rec);
  });
  // Continuous numbering: seat numbers run on through the aisles of a run.
  const runsSeen = new Map();
  M.blocks.forEach((rec) => { if (rec.continuous) { const k = rec.run.k; if (!runsSeen.has(k)) runsSeen.set(k, []); runsSeen.get(k).push(rec); } });
  runsSeen.forEach((recs) => {
    recs.sort((a, b) => a.run.blocks.findIndex((x) => x.id === a.id) - b.run.blocks.findIndex((x) => x.id === b.id));
    const ordered = dirOf(recs[0]) === 'cw' ? [...recs].reverse() : recs;
    const byRow = new Map();
    ordered.forEach((rec) => rec.rowList.forEach((r) => {
      const c = byRow.get(r.i) || 0;
      r.seats.forEach((k, j) => { M.seats.num[k] = c + j + 1; });
      byRow.set(r.i, c + r.seats.length);
    }));
  });

  // Access places (wheelchair platforms and spaces) on their blocks.
  (data.access || []).forEach((a) => a.blocks.forEach((id) => {
    const rec = M.blockById.get(String(id).toLowerCase()); if (!rec) return;
    let row = rec.rowList[rec.rowList.length - 1];
    if (a.rows?.length === 1) row = rec.rowList.find((r) => r.label === a.rows[0]) || row;
    const ks = row?.seats || []; const k = ks[Math.floor(ks.length / 2)];
    if (k == null) return;
    const words = a.words.replace('{id}', id);
    rec.access.push({ words, status: a.status, source: a.source });
    M.access.push({ x: M.seats.x[k], z: M.seats.z[k], block: rec.id, words, status: a.status, source: a.source });
  }));

  buildBoxesAndZones(M, L, data, list, mode, levelOf);
  buildProducts(M, L, mode);
  M.byArea = new Map();
  for (let k = 0; k < n; k++) { const a = M.seats.area[k]; if (!M.byArea.has(a)) M.byArea.set(a, k); }
  mapCache.set(key, M);
  return M;
}

/* ---------- Boxes and other areas ---------- */

function buildBoxesAndZones(M, L, data, list, mode, levelOf) {
  const boxData = data.boxes || {};
  list.forEach((a) => (a.places || []).forEach((p) => {
    const sec = L.sections?.[p.section];
    if (!sec || (sec.modes && !sec.modes.includes(mode))) return;
    const ai = M.areaIndex.get(a.id);
    if (sec.kind === 'hall-box') {
      const b = L.boxes[sec.box]; const bd = boxData[p.section] || {};
      const lvl = levelOf(b.id, `${b.label} boxes`);
      if (M.boxes.some((x) => x.level === lvl)) return;
      const { parts, centres } = hallBoxes(L, b); const ring = L.ring;
      centres.forEach((c, k) => {
        const s0 = ring.sOf(parts[k].i, parts[k].f, 0); const s1 = ring.sOf(parts[k + 1].i, parts[k + 1].f, 0);
        const pm = ring.point(c.i, c.f, (b.frontD + b.backD) / 2);
        M.boxes.push({ idx: M.boxes.length, id: `${b.id}-${k + 1}`, number: String(k + 1), label: `${bd.label || b.label} ${k + 1}`, numStatus: bd.status || 'modelled', level: lvl, levelLabel: `${b.label} boxes`, area: a.id, ai, place: p.id, pos: centres.length > 1 ? (k / (centres.length - 1)) * 100 : 50, path: bandPath(ring, b.frontD + 0.05, b.backD - 0.05, s0 + 0.08, s1 - 0.08, 0.6), cx: pm.x, cz: pm.z, note: bd.note });
      });
      return;
    }
    if (sec.kind === 'rc-room' && sec.style === 'box') {
      const F = L.floors[sec.floor]; const bd = boxData[p.section] || {};
      const lvl = levelOf(`f${sec.floor}`, F.label);
      if (M.boxes.some((x) => x.section === p.section && x.area === a.id)) return;
      const [x0, x1] = sec.x; const zF = -8 - F.frontD; const zB = -8 - F.glassD - 3.2;
      const cells = [];
      if (bd.groups) {
        const N = bd.groups.reduce((s, [g0, g1]) => s + (g1 - g0 + 1), 0); const gap = 5;
        const w = (x1 - x0 - gap * (bd.groups.length - 1)) / N; let x = x0;
        bd.groups.forEach(([g0, g1], gi) => { for (let num = g0; num <= g1; num++) { cells.push({ num: String(num), a: x, b: x + w }); x += w; } if (gi < bd.groups.length - 1) x += gap; });
      } else {
        const n = Math.max(1, Math.floor((x1 - x0) / 4.9)); const w = (x1 - x0) / n;
        for (let k = 0; k < n; k++) cells.push({ num: null, a: x0 + k * w, b: x0 + (k + 1) * w, k });
      }
      cells.forEach((c, k) => {
        const cx = (c.a + c.b) / 2;
        M.boxes.push({
          idx: M.boxes.length, id: `${p.section}-${c.num || k + 1}`, number: c.num || String(k + 1), label: c.num ? `Box ${c.num}` : `Box, ${ordinal(k + 1)} from the right (number not published)`,
          numStatus: c.num ? 'stated' : 'unpublished', posStatus: 'modelled', level: lvl, levelLabel: F.label, area: a.id, ai, place: p.id, section: p.section,
          pos: ((cx - x0) / (x1 - x0)) * 100, path: rectPath(c.a + 0.15, c.b - 0.15, zB, zF), cx, cz: (zF + zB) / 2, note: data.boxNote,
        });
      });
      return;
    }
    // Areas with no numbered seats: floors, lawns, restaurants, terraces, rooms inside.
    if (sec.kind === 'tier' || sec.kind === 'room' || sec.kind === 'hall-floor') return;
    const path = sectionZone(L, mode, sec);
    if (!path) return;
    let lvl = 'ground'; let lvlLabel = 'Ground level';
    if (sec.kind === 'rc-room') { lvl = `f${sec.floor}`; lvlLabel = L.floors[sec.floor].label; }
    else if (sec.kind === 'gallery') { lvl = 'gallery'; lvlLabel = 'Gallery'; }
    else if (sec.kind === 'terrace') { lvl = 'terrace'; lvlLabel = 'Terraces'; }
    else if (L.archetype !== 'racecourse') { lvl = 'floor'; lvlLabel = L.archetype === 'hall' ? 'Arena' : 'Floor'; }
    levelOf(lvl, lvlLabel);
    const c = pathCentre(path);
    M.zones.push({ idx: M.zones.length, area: a.id, ai, place: p.id, level: lvl, levelLabel: lvlLabel, path, cx: c[0], cz: c[1], label: areaName(a, mode, M.day), kind: sec.kind });
  }));
  // Levels in a sensible order: ground and floor first, then by name.
  const rank = (l) => (l.id === 'ground' || l.id === 'floor' || l.id === 'Arena' ? 0 : l.id === 'gallery' ? 9 : 1);
  M.levels.sort((a, b) => rank(a) - rank(b));
  if (L.archetype === 'hall') {
    // Stalls, Choir and Arena share a plan; boxes, Circle and Gallery overhang them.
    const order = ['Arena', 'Stalls', 'Choir', 'box-loggia', 'box-grand', 'box-second', 'Rausing Circle', 'gallery'];
    M.levels.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  if (L.archetype === 'racecourse') {
    const fl = (id) => (id === 'ground' ? -1 : Number(id.slice(1)));
    M.levels.sort((a, b) => fl(a.id) - fl(b.id));
  }
}

const ordinal = (k) => `${k}${k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th'}`;
const rectPath = (x0, x1, z0, z1) => `M${x0.toFixed(2)},${z0.toFixed(2)}H${x1.toFixed(2)}V${z1.toFixed(2)}H${x0.toFixed(2)}Z`;
function pathCentre(d) {
  const nums = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  // Paths are M x,z L x,z ... or rect (M x,z H x V z H x Z): average the coordinates we can pair.
  if (/H/.test(d)) { const [x0, z0, x1, z1] = nums; return [(x0 + x1) / 2, (z0 + z1) / 2]; }
  let sx = 0; let sz = 0; let c = 0;
  for (let k = 0; k + 1 < nums.length; k += 2) { sx += nums[k]; sz += nums[k + 1]; c++; }
  return c ? [sx / c, sz / c] : [0, 0];
}

// Hospitality product outlines (tinted on the map), from each product's sections.
function buildProducts(M, L, mode) {
  const seen = new Set();
  M.areas.forEach((a, ai) => {
    if (a.kind !== 'hospitality') return;
    const area = areasFor(M.venueId, { mode, day: M.day }).find((x) => x.id === a.id);
    const paths = [];
    (area?.places || []).forEach((p) => {
      const sec = L.sections?.[p.section]; if (!sec || (sec.modes && !sec.modes.includes(mode))) return;
      if (sec.kind !== 'tier' && sec.kind !== 'room') return;
      if (p.blocks && sec.blocks) p.blocks.forEach((b) => { const d = sectionZone(L, mode, sec, b); if (d) paths.push(d); });
      else { const d = sectionZone(L, mode, sec); if (d) paths.push(d); }
    });
    if (!paths.length) return;
    const key = paths.join('|'); if (seen.has(key)) return; seen.add(key);
    const c = pathCentre(paths[0]);
    M.products.push({ ai, area: a.id, name: a.name, paths, cx: c[0], cz: c[1], level: null });
  });
  // Levels of each product: the level of its first seat.
  M.products.forEach((p) => {
    for (let k = 0; k < M.seats.n; k++) if (M.seats.area[k] === p.ai) { p.level = M.blocks[M.seats.blk[k]].level; break; }
  });
}

/* ---------- Addresses ---------- */

export function seatRef(M, k) {
  if (k == null || k < 0 || k >= M.seats.n) return null;
  const b = M.blocks[M.seats.blk[k]]; const r = b.rowList[M.seats.rib[k]];
  return { block: b.id, row: r.label, seat: String(M.seats.num[k]) };
}

export function seatWords(M, k) {
  const b = M.blocks[M.seats.blk[k]]; const r = b.rowList[M.seats.rib[k]];
  return `${b.label}, Row ${r.label}, Seat ${M.seats.num[k]}`;
}

// The numbering status of each part of a seat's address.
export function refStatus(M, k) {
  const b = M.blocks[M.seats.blk[k]]; const d = M.data;
  const rowConv = b.floor ? 'modelled' : (d.rows?.status === 'stated' ? 'convention' : 'modelled');
  // A row label is exactly stated only where the venue publishes the full row list (AO Arena).
  const rowsExact = M.venueId === 'ao-arena' && (b.tier === 'lower' || b.tier === 'upper');
  return {
    block: b.floor ? 'modelled' : b.status,
    row: rowsExact ? 'stated' : rowConv,
    seat: 'modelled',
    seatDir: b.floor ? 'modelled' : d.seats?.status || 'modelled',
  };
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/^(block|section|row|seat|box)\s*/, '').replace(/\s+/g, ' ');

// Find my seat. Returns { k, exact, note } (k = -1 when nothing fits).
export function findSeat(M, blockQ, rowQ, seatQ) {
  const bq = norm(blockQ); const rq = norm(rowQ).toUpperCase(); const sq = Number(norm(seatQ));
  if (!bq) return { k: -1, note: 'Type a block or section first.' };
  let recs = M.blocks.filter((b) => b.id.toLowerCase() === bq || b.short.toLowerCase() === bq || b.label.toLowerCase() === bq || b.label.toLowerCase().replace(/^stalls /, '') === bq);
  if (!recs.length && /circle/.test(bq)) recs = M.blocks.filter((b) => /circle/i.test(b.label));
  if (!recs.length && /choir/.test(bq)) recs = M.blocks.filter((b) => /choir/i.test(b.label));
  if (!recs.length && /arena|floor/.test(bq)) recs = M.blocks.filter((b) => b.floor);
  if (!recs.length) return { k: -1, note: `We could not find "${String(blockQ).trim()}" in this model.` };
  const notes = [];
  // Rows: exact label, else the nearest by position.
  let rowsets = recs.map((b) => ({ b, r: b.rowList.find((r) => r.label.toUpperCase() === rq) }));
  let hit = rowsets.filter((x) => x.r);
  if (!hit.length) {
    const b = recs[0]; const n = Number(rq);
    let r = null;
    if (rq && Number.isFinite(n) && b.rowStyle === 'numbers') r = b.rowList.reduce((best, x) => (Math.abs(Number(x.label) - n) < Math.abs(Number(best.label) - n) ? x : best), b.rowList[0]);
    else if (rq && b.rowStyle === 'letters') { const idx = LETTERS.indexOf(rq[0]); r = b.rowList[Math.max(0, Math.min(b.rowList.length - 1, idx))] || b.rowList[0]; }
    else r = b.rowList[Math.floor(b.rowList.length / 2)];
    if (rq) notes.push(`Row ${rq} is not in our model of ${b.label}, so this is Row ${r.label}.`);
    hit = [{ b, r }];
  }
  // Seats: the number in this block's row, or along the run's row where numbering is continuous.
  const all = hit.flatMap(({ r }) => r.seats);
  let k = Number.isFinite(sq) && sq > 0 ? all.find((x) => M.seats.num[x] === sq) : undefined;
  if (k == null) {
    if (Number.isFinite(sq) && sq > 0) {
      const nums = all.map((x) => M.seats.num[x]); const lo = Math.min(...nums); const hi = Math.max(...nums);
      k = all.reduce((best, x) => (Math.abs(M.seats.num[x] - sq) < Math.abs(M.seats.num[best] - sq) ? x : best), all[0]);
      notes.push(`In our model this row holds Seats ${lo} to ${hi}, so this is Seat ${M.seats.num[k]}.`);
    } else { k = all[Math.floor(all.length / 2)]; if (norm(seatQ)) notes.push('Seat numbers are numbers, so this is the middle of the row.'); }
  }
  return { k, exact: !notes.length, note: notes.join(' ') };
}

export function nearestSeat(M, x, y, z, tierId = null) {
  let best = -1; let bd = Infinity; const S = M.seats;
  const ti = tierId ? M.tiers.indexOf(tierId) : -1;
  for (let k = 0; k < S.n; k++) {
    if (ti >= 0 && S.tier[k] !== ti) continue;
    const d = (S.x[k] - x) ** 2 + (S.z[k] - z) ** 2 + (y == null ? 0 : (S.y[k] - y) ** 2 * 4);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

// Keyboard: 'next' and 'prev' along the row (seat number up or down, across the aisle into
// the neighbouring block), 'front' and 'back' between rows of the block.
export function neighbour(M, k, dir) {
  const b = M.blocks[M.seats.blk[k]]; const ri = M.seats.rib[k];
  const row = b.rowList[ri]; const j = row.seats.indexOf(k);
  if (dir === 'next' || dir === 'prev') {
    const step = dir === 'next' ? 1 : -1;
    if (j + step >= 0 && j + step < row.seats.length) return row.seats[j + step];
    if (b.floor) return k;
    // Seats are numbered with rising arc length ('acw') unless the run says 'cw'.
    const up = (b.run?.seatDir || M.data.seats?.dir || 'acw') !== 'cw' ? step : -step;
    const Lr = M.L.ring.length(0); const edge = up > 0 ? b.arc[1] + 0.3 : b.arc[0] - 0.3;
    const sib = M.blocks.find((x) => x !== b && x.tier === b.tier && !x.floor && x.rows.has(row.i) && inArc(edge, x.arc[0], x.arc[1], Lr));
    if (!sib) return k;
    const seats = sib.rowList.find((r) => r.i === row.i).seats;
    return step > 0 ? seats[0] : seats[seats.length - 1];
  }
  const nri = ri + (dir === 'back' ? 1 : -1);
  if (nri < 0 || nri >= b.rowList.length) return k;
  const target = b.rowList[nri].seats;
  const frac = row.seats.length > 1 ? j / (row.seats.length - 1) : 0.5;
  return target[Math.round(frac * (target.length - 1))];
}

/* ---------- Camera spec for a seat ---------- */

export function specForSeat(M, k) {
  if (k == null || k < 0 || k >= M.seats.n) return null;
  const L = M.L; const S = M.seats; const tid = M.tiers[S.tier[k]]; const b = M.blocks[S.blk[k]];
  const poi = L.focal(M.mode);
  const x = S.x[k]; const y = S.y[k]; const z = S.z[k];
  let spec;
  if (tid === 'floor') {
    spec = { position: [x, y + DESIGN.eye, z], normal: [S.nx[k], 0, S.nz[k]], foreground: 'stalls', rowIndex: S.row[k], tierId: 'floor', snapTier: 'floor', eye: DESIGN.eye };
  } else {
    const t = L.tiers[tid]; const i = S.row[k]; const eye = t.eye ?? DESIGN.eye;
    const pl = S.place[k] >= 0 ? M.places[S.place[k]] : null; const sec = pl?.section;
    let fg; const extra = {};
    if (L.archetype === 'hall') fg = tid === 'circle' ? 'circle' : 'stalls';
    else if (sec?.kind === 'room' || ((tid === 'band' || tid === 'l4') && i <= 1)) {
      // Seats behind the glass balustrade at the front of a suite or club tier.
      const first = sec?.kind === 'room' ? L.bands[sec.band].seatRows[0] : 0;
      fg = i === 0 || i === first ? 'balcony' : 'premium';
      Object.assign(extra, { railDist: seatD(t, i) - (t.d0 + 0.05), railY: rowY(t, 0) + 0.9, boxRow: Math.min(1, Math.max(0, i - first)) });
    } else if (sec?.kind === 'tier') fg = sec.fg === 'standard' ? (tid === 'upper' || tid === 'l5' ? 'upper' : 'front') : (sec.fg || 'front');
    else fg = tid === 'upper' || tid === 'l5' ? 'upper' : (tid === 'band' || tid === 'l2' || tid === 'l4') ? 'premium' : 'front';
    spec = { position: [x, y + eye, z], normal: [S.nx[k], 0, S.nz[k]], rowIndex: i, tierId: tid, snapTier: tid, eye, tier: t, foreground: fg, padded: !!S.padded[k], ...extra };
    if (sec?.stool) { spec.position[1] += 0.35; spec.eye += 0.35; spec.snapTier = null; spec.foreground = 'front'; }
  }
  spec.poi = poi; spec.target = [poi.x, poi.y, poi.z]; spec.venueId = M.venueId; spec.mode = M.mode;
  const ref = seatRef(M, k);
  spec.block = b.floor ? null : b.id; spec.rowLabel = `Row ${ref.row}`; spec.seatK = k; spec.seatRef = ref;
  return spec;
}

// The viewer seat a box opens: its area, place and position along the run of boxes.
export const boxSpot = (M, box) => ({ area: box.area, place: box.place, pos: String(Math.round(box.pos * 10) / 10) });

/* ---------- Show spacing: dimension lines round seat k ---------- */

// [{ id, a, b, at, label }] in world metres. The chair sits at the seat origin; local +z
// (inward, towards the action) is -normal. Figures are all modelled, and say so.
export function spacingLines(M, k) {
  if (k == null || k < 0) return [];
  const S = M.seats; const L = M.L; const tid = M.tiers[S.tier[k]];
  const C = S.padded[k] ? CHAIRS.padded : CHAIRS.standard;
  const x = S.x[k]; const y = S.y[k]; const z = S.z[k];
  const ix = -S.nx[k]; const iz = -S.nz[k];            // inward
  const rx = -iz; const rz = ix;                        // along the row (to the right as you face the action)
  const P = (a, b, h) => [x + ix * a + rx * b, y + h, z + iz * a + rz * b];
  const out = [];
  const W = C.width; const hw = W / 2;
  out.push({ id: 'width', a: P(0.24, -hw, C.panY + 0.02), b: P(0.24, hw, C.panY + 0.02), label: `Seat width ${Math.round(W * 1000)} mm`, tag: 'modelled' });
  // Seat centres: to the next seat along the row (or the previous one at a row end).
  const b = M.blocks[S.blk[k]]; const row = b.rowList[S.rib[k]]; const j = row.seats.indexOf(k);
  const nk = row.seats[j + 1] ?? row.seats[j - 1];
  if (nk != null) {
    const q = [S.x[nk], S.y[nk] + C.panY + 0.16, S.z[nk]];
    out.push({ id: 'centres', a: [x, y + C.panY + 0.16, z], b: q, label: `Seat centres ${Math.round(Math.hypot(q[0] - x, q[2] - z) * 1000)} mm`, tag: 'modelled' });
  }
  if (tid !== 'floor') {
    const t = L.tiers[tid]; const i = S.row[k]; const T = t.depth; const back = 0.42 * T; // seat origin sits 0.42 of the tread back from its front edge
    const side = hw + 0.12;
    out.push({ id: 'depth', a: P(back, side, 0.03), b: P(back - T, side, 0.03), label: `Row depth ${Math.round(T * 1000)} mm`, tag: Math.abs(T - 0.8) < 1e-6 ? 'design standard' : 'modelled' });
    if (i > 0) {
      const dy = rowY(t, i - 1) - y;
      // From the back of the seat in front (its backrest is 0.2 m behind its origin) to the front of your folded seat.
      const frontBack = T - 0.2; const yourFront = C.depth - 0.2;
      out.push({ id: 'clear', a: P(frontBack, -hw * 0.4, C.panY + 0.08), b: P(yourFront, -hw * 0.4, C.panY + 0.08), label: `Clear seatway ${Math.round((T - C.depth) * 1000)} mm`, tag: 'modelled' });
      const steps = M.data.steps?.perRow || M.data.steps?.perRowByTier?.[tid] || 2;
      out.push({ id: 'step', a: P(back, -side, dy), b: P(back, -side, 0), label: `Row rise ${Math.round(-dy * 1000)} mm (${steps} steps of ${Math.round((-dy / steps) * 1000)} mm)`, tag: 'modelled' });
    }
  }
  out.forEach((l) => { l.at = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2, (l.a[2] + l.b[2]) / 2]; });
  return out;
}

/* ---------- The seat panel ---------- */

const mm = (m) => Math.round(m * 1000);
// Facts about seat k, each { label, value, status, source?, note? }. spec from specForSeat.
export function seatFacts(M, k, spec) {
  const S = M.seats; const out = [];
  const add = (label, value, status, source = '', note = '') => out.push({ label, value, status, source, note });
  const L = M.L; const tid = M.tiers[S.tier[k]]; const b = M.blocks[S.blk[k]]; const row = b.rowList[S.rib[k]];
  const st = refStatus(M, k);
  const padded = !!S.padded[k]; const arms = !!S.arms[k];
  const C = padded ? CHAIRS.padded : CHAIRS.standard;
  const ai = S.area[k]; const area = ai >= 0 ? M.areas[ai] : null;
  // Seat type.
  const armsData = M.data.armrests;
  const armWords = armsData ? (arms ? 'Fixed armrests (stated).' : 'No armrests (stated).') : 'Armrests are not published.';
  add('Seat type', `${padded ? 'Padded tip-up seat' : 'Tip-up seat'}${arms ? ' with arms' : ''}`, padded || armsData ? 'stated' : 'modelled', padded || armsData ? 'the venue' : '', `${padded ? 'Padded seats are stated for this area. ' : ''}${armWords} The chair drawn in 3D is our model.`);
  add('Seat width (the chair)', `${mm(C.width)} mm`, 'modelled', '', 'No venue publishes its seat sizes.');
  const w = S.w[k];
  add('Seat centres', `${mm(w)} mm`, 'modelled', '', `Laid out on ${STANDARDS.seatCentresNew.words} (design standard: ${STANDARDS.seatCentresNew.source}), stretched evenly to fill the block.`);
  if (tid !== 'floor') {
    const t = L.tiers[tid];
    const depthStd = Math.abs(t.depth - 0.8) < 1e-6;
    add('Row depth', `${mm(t.depth)} mm`, depthStd ? 'standard' : 'modelled', depthStd ? STANDARDS.rowDepth.source : '', depthStd ? STANDARDS.rowDepth.words : `Our model; ${STANDARDS.rowDepthMin.words} (design standard).`);
    const clear = t.depth - C.depth;
    add('Clear seatway', `${mm(clear)} mm`, 'modelled', '', `Row depth less the ${mm(C.depth)} mm the chair takes up when folded. Design standard: ${STANDARDS.clearway.words} (${STANDARDS.clearway.source}).`);
    const i = S.row[k];
    const riser = i > 0 ? rowY(t, i) - rowY(t, i - 1) : (t.rows > 1 ? rowY(t, 1) - rowY(t, 0) : 0);
    const stepsData = M.data.steps; const per = stepsData?.perRow || stepsData?.perRowByTier?.[tid] || 2;
    add('Step height', `${mm(riser / per)} mm a step, ${per} steps a row`, 'modelled', '', stepsData ? `${stepsData.words} (${stepsData.status}, ${stepsData.source}). Each row rises ${mm(riser)} mm in our model.` : `Each row rises ${mm(riser)} mm in our model, with an aisle half-step.`);
    const rk = i > 0 ? rakeDeg(t, i) : null;
    if (rk != null) add('Rake of your row', `${Math.round(rk)}°`, 'modelled', '', `Design standard: ${STANDARDS.rake.words} (${STANDARDS.rake.source}).`);
  } else {
    add('Row depth', 'about 920 mm between row centres', 'modelled', '', 'Arena floor rows are our model; each rises 60 mm.');
  }
  // Viewing numbers.
  const n = seatNumbers(spec);
  if (n) {
    add(`Distance to ${n.poiLabel}`, `${Math.round(n.distance)} m`, 'modelled', '', 'Straight line from your eyes.');
    add('Eye height above your floor', `${(spec.eye ?? DESIGN.eye).toFixed(2)} m`, 'modelled', '', `${STANDARDS.eyeHeight.words} (${STANDARDS.eyeHeight.source}).`);
    add(`Eye height above ${n.floorWord || 'the action'}`, `${n.eyeHeight.toFixed(1)} m`, 'modelled');
    add('Looking down at it', `${Math.max(0, Math.round(n.down))}°`, 'modelled', '', n.down < 1 ? 'About level.' : '');
    add(`Off-centre: round from ${n.offLabel}`, `${Math.round(n.off)}°`, 'modelled');
    if (n.c != null) {
      const cmm = Math.round(n.c * 1000);
      add('Sightline C-value', `${cmm} mm`, 'modelled', '', `${n.cNote}. ${STANDARDS.cValue.words} (design standard).`);
      // The head in front: about 120 mm from eye to crown (modelled).
      const head = 0.12; const clear = n.c - head;
      const t = L.tiers[tid];
      const over = L.sightTo?.(t, M.mode); const tt = over ? { ...t, ...over } : t;
      const i = S.row[k];
      // Sightline to the point of interest, over the same head.
      const P = spec.poi; const dx = Math.hypot(P.x - spec.position[0], P.z - spec.position[2]);
      const drop = (spec.position[1] - P.y) * (t.depth / Math.max(1, dx));
      const headTop = rowY(t, i - 1) + (t.eye ?? DESIGN.eye) + head; const clearPoi = (spec.position[1] - drop) - headTop;
      void tt;
      const verdict = clear >= 0 ? 'Below your sightline' : clear >= -0.06 ? 'You see between heads' : 'In your sightline to the near edge';
      add('Head in front', verdict, 'modelled', '',
        `${clear >= 0 ? `The sightline to ${L.designPoint(t, M.mode)} clears the head in front by ${mm(clear)} mm.` : `To ${L.designPoint(t, M.mode)} the head in front is ${mm(-clear)} mm into your sightline, so you look between heads.`} To ${n.poiLabel} it is ${clearPoi >= 0 ? `${mm(clearPoi)} mm below` : `${mm(-clearPoi)} mm above`} your sightline. Eye to crown taken as 120 mm (modelled).`);
    } else add('Sightline C-value', 'Not applicable', 'modelled', '', tid === 'floor' ? 'The Arena floor is nearly flat, so heads in front matter more than rows.' : n.cNote);
  }
  // Where you are in the row.
  const j = row.seats.indexOf(k);
  const aisle = j === 0 || j === row.seats.length - 1;
  add('Seats in this row of the block', `${row.seats.length}${aisle ? ' (yours is on the aisle)' : ''}`, 'modelled', '', 'Seats per row are not published.');
  void area; void st;
  return out;
}
