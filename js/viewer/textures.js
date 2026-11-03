// Canvas-generated textures for the viewer. No image downloads: everything is drawn
// once per scene and disposed with it. Colour textures are flagged sRGB.

import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Deterministic random so every load of a venue looks identical (and screenshots match).
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function tex(c, { srgb = true, repeat = false, aniso = 8, renderer } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = renderer ? Math.min(aniso, renderer.capabilities.getMaxAnisotropy()) : aniso;
  return t;
}

/* Fine concrete: grey with soft mottling and a few pores. Tiled. */
export function concrete(renderer, base = [150, 150, 146]) {
  const [c, g] = canvas(256, 256);
  const r = rng(7);
  g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 160; k++) {
    const x = r() * 256; const y = r() * 256; const rad = 8 + r() * 40;
    const v = (r() - 0.5) * 18;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${Math.abs(v) / 255 * 2.2})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 16;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true, renderer });
}

/* Tottenham Hotspur Stadium's grass pitch (football mode only), including the grass
   surround out to the stand fronts. Covers w x h metres centred on the pitch. */
export function pitch(renderer, { w = 124, h = 88, pitchW = 105, pitchH = 68 } = {}) {
  const PX = 18; // pixels per metre
  const W = Math.round(w * PX); const H = Math.round(h * PX);
  const [c, g] = canvas(W, H);
  const r = rng(11);
  const ox = (w - pitchW) / 2 * PX; const oy = (h - pitchH) / 2 * PX;
  // Surround grass, slightly darker and unstriped.
  g.fillStyle = '#2f6a2a'; g.fillRect(0, 0, W, H);
  // Mowing stripes across the length.
  const stripes = 18;
  const sw = pitchW * PX / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#3f8634' : '#336a2a';
    g.fillRect(ox + i * sw, oy - 2.5 * PX, sw + 1, pitchH * PX + 5 * PX);
  }
  // Subtle cross mowing for depth.
  g.globalAlpha = 0.018;
  for (let j = 0; j < 12; j++) { g.fillStyle = j % 2 ? '#ffffff' : '#000000'; g.fillRect(ox - 2 * PX, oy + j * (pitchH * PX / 12), pitchW * PX + 4 * PX, pitchH * PX / 12); }
  g.globalAlpha = 1;
  // Noise and blade speckle.
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 14;
    img.data[i] += n * 0.6; img.data[i + 1] += n; img.data[i + 2] += n * 0.5;
  }
  g.putImageData(img, 0, 0);
  // Worn goalmouths and centre circle, very gently.
  const wear = (x, y, rx, ry, a) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, rx);
    grd.addColorStop(0, `rgba(120,110,60,${a})`); grd.addColorStop(1, 'rgba(120,110,60,0)');
    g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill(); g.restore();
  };
  wear(ox + 3 * PX, H / 2, 6 * PX, 9 * PX, 0.22);
  wear(ox + pitchW * PX - 3 * PX, H / 2, 6 * PX, 9 * PX, 0.22);
  wear(W / 2, H / 2, 10 * PX, 14 * PX, 0.08);
  // Line markings (0.12 m wide).
  g.strokeStyle = 'rgba(245,245,240,0.95)'; g.lineWidth = 0.12 * PX; g.lineJoin = 'miter';
  const m = (v) => v * PX;
  const L = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(ox + m(x1), oy + m(y1)); g.lineTo(ox + m(x2), oy + m(y2)); g.stroke(); };
  g.strokeRect(ox, oy, m(pitchW), m(pitchH));
  L(pitchW / 2, 0, pitchW / 2, pitchH);
  g.beginPath(); g.arc(ox + m(pitchW / 2), oy + m(pitchH / 2), m(9.15), 0, Math.PI * 2); g.stroke();
  const spot = (x, y, rr = 0.2) => { g.fillStyle = 'rgba(245,245,240,0.95)'; g.beginPath(); g.arc(ox + m(x), oy + m(y), m(rr), 0, Math.PI * 2); g.fill(); };
  spot(pitchW / 2, pitchH / 2, 0.25);
  [0, 1].forEach((side) => {
    const x0 = side ? pitchW : 0; const dir = side ? -1 : 1;
    const box = (dx, hy) => { g.strokeRect(ox + m(Math.min(x0, x0 + dir * dx)), oy + m(pitchH / 2 - hy), m(dx), m(hy * 2)); };
    box(16.5, 20.16); box(5.5, 9.16);
    spot(x0 + dir * 11, pitchH / 2);
    // Penalty arc outside the box.
    const cx = ox + m(x0 + dir * 11); const cy = oy + m(pitchH / 2);
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    if (side) g.arc(cx, cy, m(9.15), Math.PI - a, Math.PI + a); else g.arc(cx, cy, m(9.15), -a, a);
    g.stroke();
    // Corner arcs.
    [0, pitchH].forEach((y0) => {
      const a0 = side ? (y0 ? Math.PI : Math.PI / 2) : (y0 ? -Math.PI / 2 : 0);
      g.beginPath(); g.arc(ox + m(x0), oy + m(y0), m(1), a0, a0 + Math.PI / 2); g.stroke();
    });
  });
  const t = tex(c, { renderer, aniso: 16 });
  return t;
}

/* NFL field on the synthetic surface (Tottenham Hotspur Stadium only). Covers w x h metres
   centred on the field. N: { hx, hz, endZone, hashZ, yd } from layouts.js (NFL rulebook:
   120 x 53 1/3 yards including the end zones, hash marks 70 ft 9 in from each sideline).
   Neutral: no team names, logos or sponsor marks. Number placement and the team areas'
   extent are modelled. Canvas x is world x and canvas y is world z. */
export function nflField(renderer, { w, h, N }) {
  const PX = 18;
  const W = Math.round(w * PX); const H = Math.round(h * PX);
  const [c, g] = canvas(W, H);
  const r = rng(23);
  const X = (x) => (x + w / 2) * PX; const Z = (z) => (z + h / 2) * PX; const m = (v) => v * PX;
  const yd = N.yd; const gl = N.hx - N.endZone; const border = 6 * 0.3048;
  // The artificial surface round the field, then the white border outside the field lines.
  g.fillStyle = '#2b5631'; g.fillRect(0, 0, W, H);
  // Team areas behind each sideline, near the middle of the field (extent modelled).
  g.fillStyle = '#284a2e';
  // Benches stand at least 30 ft back from the sideline (rulebook), so the strip reaches past that.
  const teamD = 30 * 0.3048 + 1.6 - border - 0.5;
  [-1, 1].forEach((sd) => { const z0 = sd > 0 ? N.hz + border + 0.5 : -N.hz - border - 0.5 - teamD; g.fillRect(X(-30 * yd), Z(z0), m(60 * yd), m(teamD)); });
  g.fillStyle = '#f2f2ee'; g.fillRect(X(-N.hx - border), Z(-N.hz - border), m(2 * (N.hx + border)), m(2 * (N.hz + border)));
  // Field: synthetic turf with faint 5-yard tonal bands, darker neutral end zones.
  for (let k = 0; k < 20; k++) {
    g.fillStyle = k % 2 ? '#3a7a3d' : '#357238';
    g.fillRect(X(-gl + k * 5 * yd), Z(-N.hz), m(5 * yd) + 1, m(2 * N.hz));
  }
  g.fillStyle = '#2e6233';
  g.fillRect(X(-N.hx), Z(-N.hz), m(N.endZone), m(2 * N.hz)); g.fillRect(X(gl), Z(-N.hz), m(N.endZone), m(2 * N.hz));
  // Fibre noise.
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 12; img.data[i] += n * 0.5; img.data[i + 1] += n; img.data[i + 2] += n * 0.5; }
  g.putImageData(img, 0, 0);
  // Markings, 4 inches wide.
  const lw = 0.1016; g.fillStyle = 'rgba(246,246,242,0.96)';
  const vline = (x, z0, z1) => g.fillRect(X(x) - m(lw) / 2, Z(z0), m(lw), m(z1 - z0));
  for (let k = 0; k <= 20; k++) vline(-gl + k * 5 * yd, -N.hz, N.hz); // goal lines and 5-yard lines
  // One-yard marks: at the sidelines and on the hash lines (2 ft long).
  const tick = 0.6096;
  for (let k = 1; k < 100; k++) {
    if (k % 5 === 0) continue;
    const x = -gl + k * yd;
    vline(x, -N.hz + 0.1, -N.hz + 0.1 + tick); vline(x, N.hz - 0.1 - tick, N.hz - 0.1);
    vline(x, -N.hashZ - tick / 2, -N.hashZ + tick / 2); vline(x, N.hashZ - tick / 2, N.hashZ + tick / 2);
  }
  // Short line at each 2-yard line for the try (1 yard long).
  [-1, 1].forEach((sd) => vline(sd * (gl - 2 * yd), -yd / 2, yd / 2));
  // Yard numbers every 10 yards, bottoms towards the nearest sideline, with arrows to the
  // nearer goal line (modelled placement).
  const numH = 6 * 0.3048;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(m(numH) * 1.15)}px "League Spartan", Arial, sans-serif`;
  for (let k = 1; k <= 9; k++) {
    const x = -gl + k * 10 * yd; const v = k <= 5 ? k * 10 : (10 - k) * 10;
    [-1, 1].forEach((sd) => {
      const z = sd * (N.hz - 12 * yd);
      g.save(); g.translate(X(x), Z(z)); if (sd < 0) g.rotate(Math.PI);
      g.fillText(String(v), 0, 0);
      if (v !== 50) {
        const dir = (x < 0 ? -1 : 1) * (sd < 0 ? -1 : 1); const ax = dir * m(1.55); const s = m(0.35);
        g.beginPath(); g.moveTo(ax + dir * s * 1.2, -m(numH) * 0.32); g.lineTo(ax, -m(numH) * 0.32 - s * 0.6); g.lineTo(ax, -m(numH) * 0.32 + s * 0.6); g.closePath(); g.fill();
      }
      g.restore();
    });
  }
  return tex(c, { renderer, aniso: 16 });
}

/* Dark composite floor panels that cover the pitch for a concert. */
export function floorPanels(renderer) {
  const [c, g] = canvas(512, 512);
  const r = rng(5);
  g.fillStyle = '#3a3d42'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 52 + Math.floor(r() * 14);
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`; g.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
  }
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 10; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true, renderer });
}

/* Arena floor: polished dark concrete with faint markings. */
export function arenaFloor(renderer) {
  const [c, g] = canvas(512, 512);
  const r = rng(9);
  g.fillStyle = '#2a2c31'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 12; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true, renderer });
}

/* LED board loop. Neutral, unbranded messages only: no venue, sponsor or company names. */
// kind: 'football' (Tottenham Hotspur Stadium's football mode only), 'nfl', 'boxing',
// 'concert' or 'neutral' (the default).
export function ledBoards(renderer, kind = 'neutral') {
  const W = 2048; const H = 64;
  const [c, g] = canvas(W, H);
  const sport = kind === 'football' || kind === 'nfl';
  const panels = [
    { bg: ['#0B1727', '#14243A'], fg: '#C9D3E0', text: kind === 'football' ? 'WELCOME TO MATCHDAY' : kind === 'boxing' ? 'FIGHT NIGHT' : 'WELCOME', font: 700 },
    { bg: ['#123A4A', '#0D2C38'], fg: '#FFFFFF', text: '', font: 700 },
    { bg: ['#1E2B3C', '#2A3A50'], fg: '#E6EBF2', text: sport ? 'ENJOY THE GAME' : kind === 'neutral' ? 'ENJOY YOUR DAY' : 'ENJOY THE SHOW', font: 700 },
    { bg: ['#30251A', '#3D2E1F'], fg: '#FFFFFF', text: '', font: 700 },
  ];
  const pw = W / panels.length;
  panels.forEach((p, i) => {
    const grd = g.createLinearGradient(i * pw, 0, (i + 1) * pw, H);
    grd.addColorStop(0, p.bg[0]); grd.addColorStop(1, p.bg[1]);
    g.fillStyle = grd; g.fillRect(i * pw, 0, pw, H);
    if (p.text) {
      g.fillStyle = p.fg; g.font = `${p.font} 34px "League Spartan", Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.text, i * pw + pw / 2, H / 2 + 2);
    } else {
      // An abstract chevron pattern in place of advertising.
      g.save(); g.beginPath(); g.rect(i * pw, 0, pw, H); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.14)';
      for (let x = i * pw - H; x < (i + 1) * pw; x += 28) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, 0); g.lineTo(x + 12 + H / 2, H / 2); g.lineTo(x + 12, H); g.lineTo(x, H); g.lineTo(x + H / 2, H / 2); g.closePath(); g.fill();
      }
      g.restore();
    }
  });
  // LED pixel grid.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  const t = tex(c, { repeat: true, renderer });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* Big screen content (static image, illustrative). */
// kind: 'football' (Tottenham's football mode only), 'nfl', or anything else for a neutral
// abstract show screen.
export function bigScreen(renderer, kind = 'neutral') {
  const [c, g] = canvas(512, 288);
  const grd = g.createLinearGradient(0, 0, 512, 288);
  grd.addColorStop(0, '#0B1727'); grd.addColorStop(1, '#182A42');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 288);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'football' || kind === 'nfl') {
    g.fillStyle = '#D8AE68'; g.font = '700 30px "League Spartan", Arial, sans-serif';
    g.fillText('HOME', 140, 110); g.fillText('AWAY', 372, 110);
    g.fillStyle = '#ffffff'; g.font = '800 96px "League Spartan", Arial, sans-serif';
    g.fillText('0', 140, 190); g.fillText('0', 372, 190);
    g.font = '600 40px "League Spartan", Arial, sans-serif'; g.fillStyle = '#A9B3C2';
    g.fillText(':', 256, 185);
    g.font = '600 24px Arial, sans-serif'; g.fillStyle = '#E8D6B3'; g.fillText(kind === 'nfl' ? '1ST QUARTER' : 'KICK OFF', 256, 60);
  } else {
    const r = rng(3);
    for (let k = 0; k < 28; k++) {
      g.fillStyle = `hsla(${200 + r() * 120},80%,${45 + r() * 25}%,0.5)`;
      g.beginPath(); g.arc(r() * 512, r() * 288, 20 + r() * 80, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ffffff'; g.font = '700 40px "League Spartan", Arial, sans-serif'; g.fillText('LIVE', 256, 144);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < 512; x += 3) g.fillRect(x, 0, 1, 288);
  return tex(c, { renderer });
}

/* Goal net: white mesh on transparent. */
export function net(renderer) {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  return tex(c, { repeat: true, renderer, srgb: true });
}

/* Soft radial glow for sprites, lamps and beam ends. */
export function glow(size = 128, inner = 'rgba(255,255,255,1)') {
  const [c, g] = canvas(size, size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return tex(c, { srgb: true });
}

/* A row of seats seen from a distance: backs and pans on transparent. One seat per tile. */
export function seatBand(renderer) {
  const [c, g] = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  // Back (upper half of the slanted card).
  g.fillStyle = '#ffffff';
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill(); };
  rr(6, 2, 52, 30, 9);
  // Pan (lower part), a little darker to read as a horizontal surface.
  g.fillStyle = '#c4c4c4';
  rr(4, 38, 56, 22, 6);
  const t = tex(c, { repeat: true, renderer, srgb: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* Glass reflection streaks for box fronts (used as alpha + colour). */
export function glassStreaks() {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  const grd = g.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0, 'rgba(255,255,255,0.0)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.10)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.0)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.06)');
  grd.addColorStop(0.64, 'rgba(255,255,255,0.0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return tex(c, { srgb: true });
}

/* Ring canvas for boxing: blue canvas with a logo circle. */
export function ringCanvas(renderer) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#E9E6DF'; g.fillRect(0, 0, 512, 512);
  const r = rng(2);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 10; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(15,29,48,0.85)'; g.lineWidth = 10;
  g.beginPath(); g.arc(256, 256, 110, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(15,29,48,0.85)'; g.font = '700 46px "League Spartan", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FIGHT NIGHT', 256, 258);
  // Corner pads tint.
  [[0, 0, '#B5202F'], [512, 512, '#2D6FE0']].forEach(([x, y, col]) => { g.fillStyle = col; g.globalAlpha = 0.18; g.beginPath(); g.arc(x, y, 90, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; });
  return tex(c, { renderer });
}

/* Vertical gradient for a night sky dome. */
export function skyGradient(top, mid, bottom) {
  const [c, g] = canvas(4, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, top); grd.addColorStop(0.55, mid); grd.addColorStop(1, bottom);
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  return tex(c, { srgb: true });
}

/* Concert hall dome. kind 'plaster': warm coffered panels between iron ribs (one rib per
   u repeat); kind 'glazed': pale glazing bars for the upper dome. */
export function dome(renderer, kind = 'plaster') {
  const [c, g] = canvas(128, 256);
  const r = rng(kind === 'glazed' ? 31 : 29);
  if (kind === 'glazed') {
    g.fillStyle = '#d9dde0'; g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 32) for (let x = 0; x < 128; x += 32) {
      const v = 200 + Math.floor(r() * 30);
      g.fillStyle = `rgb(${v},${v + 4},${v + 8})`; g.fillRect(x + 2, y + 2, 28, 28);
    }
    g.fillStyle = '#3a3f46';
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 2, 256);
    for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 128, 2);
    g.fillRect(0, 0, 6, 256);
  } else {
    g.fillStyle = '#b9a58a'; g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 64) {
      const grd = g.createLinearGradient(0, y, 0, y + 64);
      grd.addColorStop(0, 'rgba(255,240,215,0.25)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(60,40,20,0.25)');
      g.fillStyle = grd; g.fillRect(8, y + 4, 112, 56);
      g.strokeStyle = 'rgba(70,50,30,0.35)'; g.lineWidth = 2; g.strokeRect(14, y + 10, 100, 44);
    }
    const img = g.getImageData(0, 0, 128, 256);
    for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 10; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    g.putImageData(img, 0, 0);
    // The iron rib.
    g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, 7, 256);
    g.fillStyle = 'rgba(214,180,110,0.6)'; g.fillRect(7, 0, 1, 256);
  }
  return tex(c, { repeat: true, renderer });
}

/* Polished parquet for a hall floor or stage. */
export function parquet(renderer, tone = [112, 72, 42]) {
  const [c, g] = canvas(256, 256);
  const r = rng(13);
  for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 64) {
    const off = (y / 16) % 2 ? 32 : 0; const k = 0.85 + r() * 0.3;
    g.fillStyle = `rgb(${tone.map((v) => Math.round(v * k)).join(',')})`;
    g.fillRect((x + off) % 256, y, 64, 16);
    if ((x + off) % 256 > 192) g.fillRect(((x + off) % 256) - 256, y, 64, 16);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect((x + off) % 256, y, 1, 16);
  }
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 256, 1);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 8; img.data[i] += n; img.data[i + 1] += n * 0.8; img.data[i + 2] += n * 0.6; }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true, renderer });
}

/* Racecourse turf seen along the track: soft mowing bands across the width plus
   low-contrast mottling, so the long straight never shows an obvious repeat. */
export function turf(renderer, { bands = true, base = [74, 128, 58] } = {}) {
  const [c, g] = canvas(512, 512);
  const r = rng(bands ? 41 : 43);
  g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, 512, 512);
  if (bands) {
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,230,0.07)' : 'rgba(0,30,0,0.06)'; g.fillRect(0, k * 64, 512, 64); }
  }
  for (let k = 0; k < 260; k++) {
    const x = r() * 512; const y = r() * 512; const rad = 10 + r() * 60;
    const v = (r() - 0.5);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, v > 0 ? `rgba(200,220,120,${Math.abs(v) * 0.14})` : `rgba(10,40,10,${Math.abs(v) * 0.16})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 12; img.data[i] += n * 0.6; img.data[i + 1] += n; img.data[i + 2] += n * 0.4; }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true, renderer, aniso: 16 });
}

/* Race-day big screen: a stylised live picture of the course with a caption bar. */
export function raceScreen(renderer) {
  const [c, g] = canvas(512, 288);
  const sky = g.createLinearGradient(0, 0, 0, 150);
  sky.addColorStop(0, '#6f9fd0'); sky.addColorStop(1, '#cfe0ee');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 150);
  g.fillStyle = '#3d6a3a'; g.fillRect(0, 120, 512, 30);
  const grass = g.createLinearGradient(0, 140, 0, 288);
  grass.addColorStop(0, '#5f9a48'); grass.addColorStop(1, '#3f7a34');
  g.fillStyle = grass; g.fillRect(0, 140, 512, 148);
  g.strokeStyle = '#ffffff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 196); g.lineTo(512, 176); g.stroke();
  g.beginPath(); g.moveTo(0, 270); g.lineTo(512, 236); g.stroke();
  const r = rng(8); const silks = ['#b5202f', '#f2c230', '#2d6fe0', '#ffffff', '#0e9384', '#7a2f5a'];
  for (let k = 0; k < 6; k++) {
    const x = 150 + k * 46 + r() * 20; const y = 214 + r() * 10;
    g.fillStyle = '#3b2416'; g.fillRect(x, y, 34, 12); g.fillRect(x + 30, y - 8, 8, 12);
    g.fillRect(x + 2, y + 10, 3, 12); g.fillRect(x + 28, y + 10, 3, 12);
    g.fillStyle = silks[k]; g.fillRect(x + 12, y - 10, 10, 10);
  }
  g.fillStyle = 'rgba(7,17,31,0.85)'; g.fillRect(0, 0, 512, 40);
  g.fillStyle = '#D8AE68'; g.font = '700 22px "League Spartan", Arial, sans-serif'; g.textBaseline = 'middle';
  g.fillText('LIVE', 16, 21);
  g.fillStyle = '#ffffff'; g.font = '600 18px Arial, sans-serif'; g.fillText('RACE DAY', 76, 21);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  for (let x = 0; x < 512; x += 3) g.fillRect(x, 0, 1, 288);
  return tex(c, { renderer });
}

/* Roof cladding: pale standing-seam panels. Tiled along the ring. */
export function roofPanels(renderer) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c9ced4'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) { g.fillStyle = 'rgba(60,70,80,0.35)'; g.fillRect(x, 0, 2, 256); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, 0, 1, 256); }
  const r = rng(17);
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.04})`; g.fillRect(Math.floor(r() * 8) * 32, 0, 32, 256); }
  return tex(c, { repeat: true, renderer });
}