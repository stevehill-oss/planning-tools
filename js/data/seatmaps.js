// Seat maps: how each venue numbers its blocks, rows, seats and boxes, and what is
// published versus modelled. Pure data with no imports, so js/viewer/layouts.js can read the
// block plan without a cycle. js/viewer/seatplan.js turns it into every seat, with its 3D
// position taken from the same tier geometry the 3D model is built from.
// Compiled 02/11/2026 from dev/research/seat-plans.json and venue-facts.json.
//
// STATUS WORDS (shown next to every figure and label in the app)
//   stated          the venue, its architect or a planning document says it
//   measured        a published access survey (AccessAble) or the venue's own step count
//   design standard UK or FIFA guidance, not specific to the venue
//   modelled        our estimate from geometry, or our own numbering
//
// SHAPE (per venue)
//   rows:    { style: 'numbers' | 'letters', skip: ['I', 'O'], status, note }   row labels,
//            counted from the front row of each tier (row 1 or A)
//   seats:   { dir: 'acw' | 'cw', status, note }   which way seat numbers rise. 'acw' means
//            anticlockwise seen from above, which is left to right as you face the action
//   runs:    [{ tier, rows?: [first, last] (0-based tier rows), level, stand, from: [seg, f],
//              to: [seg, f], order: 'acw' | 'cw', ids: [...], stated: [...] | 'all',
//              prefix?, continuous?, rowStyle?, rowBase?, span?, area?, label? }]
//            A run is a stretch of one tier divided into equal blocks (aisles at the block
//            edges, in the 3D model too). from and to are ring positions: segment 0 to 8 of
//            the venue's ring (see Ring in js/viewer/layouts.js) and a fraction along it, in
//            increasing arc length. order says which end ids[0] is at. stated lists the ids
//            the venue publishes; every other id is our own numbering (modelled).
//            continuous: seat numbers run on along a row through the aisles of the run.
//            statedAs: 'measured' when the published ids come from an access survey.
//   tiers:   { tierId: { level, standard: areaId } }   level names and the plain seating
//            area a seat belongs to when no hospitality product covers it
//   access:  [{ blocks, rows?, words, status, source }]   wheelchair and companion places
//   products:{ areaId: { words, status, source } }   where the research places a product
//   boxes:   { level: { label, groups: [[from, to], ...], status, order, note } } racecourse
//   notes:   [plain words] shown under the map
//
// Hook for the next agent: WEBSITE_LINKS (bottom of this file) maps venue and area ids to
// a "See this on our website" path on prestigecorporateevents.com. It ships empty; fill it
// from js/data/prestige-links.js. The seat panel shows the link only when one is set.

const range = (a, b, prefix = '') => { const out = []; for (let k = a; k <= b; k++) out.push(`${prefix}${k}`); return out; };

export const STATUS_WORDS = {
  stated: 'stated', measured: 'measured', standard: 'design standard', modelled: 'modelled',
};

/* ---------- Seat and spacing standards (design standard) ---------- */

// Free sources only: the Green Guide 6th edition as quoted by the Sports Ground Safety
// Authority, its Accessible Stadia guide, FIFA Stadium Guidelines, BS 9999 as quoted in a
// Camden planning document. The Green Guide itself and BS EN 13200 are paywalled.
export const STANDARDS = {
  seatCentresNew: { mm: 500, words: 'at least 500 mm between seat centres in new stands', source: 'the Green Guide (6th edition) via the Sports Ground Safety Authority, and FIFA' },
  seatCentresOld: { mm: 460, words: 'at least 460 mm in existing stands', source: 'the Green Guide (6th edition) via the Sports Ground Safety Authority' },
  rowDepthMin: { mm: 700, words: 'row depth at least 700 mm in new stands', source: 'the Green Guide (6th edition) via the Sports Ground Safety Authority' },
  rowDepth: { mm: 800, words: '800 mm row depth (FIFA minimum, Green Guide preferred)', source: 'FIFA Stadium Guidelines and the Green Guide' },
  clearway: { mm: 400, words: 'at least 400 mm clear between rows', source: 'the Green Guide (6th edition) and FIFA' },
  clearwayShort: { mm: 305, words: '305 mm allowed for short rows', source: 'the Green Guide (6th edition) via the Sports Ground Safety Authority' },
  seatway: { mm: 300, words: 'seatway at least 300 mm in a theatre or concert hall', source: 'BS 9999, quoted in a Camden planning document' },
  rake: { deg: 35, words: '35 degrees, the steepest seated stand allowed in the UK', source: 'the Green Guide, quoted by the architect, Populous' },
  cValue: { words: 'C-value 90 mm preferred, 60 mm minimum, 120 mm optimal', source: 'FIFA Stadium Guidelines and the Green Guide' },
  wheelchair: { mm: 1400, words: 'wheelchair space 1400 x 1400 mm with a companion alongside', source: 'the Sports Ground Safety Authority, Accessible Stadia' },
  eyeHeight: { mm: 1100, words: 'seated eye height about 1100 mm above the floor, worked out from the 1155 mm wheelchair user eye height and the 40 to 60 mm a wheelchair user’s head sits above a seated spectator’s', source: 'our estimate from the Sports Ground Safety Authority, Accessible Stadia' },
};

// The chairs in the 3D model (modelled). No venue publishes its seat sizes, so these are
// sized to sit on the design standard seat centres with a gap between neighbours.
// depth: back of the backrest to the front edge of the seat, folded up (tip-up seats) or
// down (fixed chairs). panY: top of the seat pan above the tread.
export const CHAIRS = {
  standard: { width: 0.45, depth: 0.40, panY: 0.44, backTop: 0.86, words: 'Tip-up seat with a backrest', tipUp: true },
  padded: { width: 0.47, depth: 0.40, panY: 0.46, backTop: 0.9, words: 'Padded tip-up seat with a backrest', tipUp: true },
  armW: 0.05,
};

/* ---------- Venues ---------- */

export const SEATMAPS = {
  'tottenham-hotspur-stadium': {
    rows: { style: 'numbers', status: 'stated', note: 'Rows are numbered from Row 1 at the front (stated). Rows per block are not published, so our row counts are modelled.' },
    seats: { dir: 'acw', status: 'modelled', note: 'Which end of a row is seat 1 is not published. Our seat numbers rise from left to right as you face the pitch (modelled).' },
    blockNote: 'The first digit of a block number is its level (measured). The numbers rise clockwise from the West Stand (estimate). Numbers marked modelled are ours and may not match your ticket.',
    tiers: {
      l1: { level: 'Level 1', standard: 'level-1' },
      l2: { level: 'Levels 2 and 3', standard: null },
      l4: { level: 'Level 4', standard: null },
      l5: { level: 'Level 5', standard: 'level-5' },
      s1: { level: 'South Stand', standard: 'south-stand' },
    },
    runs: [
      // Level 1: third-party sites give 101 to 124; the NFL access guide confirms Block 105 in the West Stand.
      { tier: 'l1', level: 'Level 1', stand: 'West Stand', from: [3, 0.5], to: [5, 0.5], order: 'cw', ids: range(101, 109), stated: ['105'] },
      { tier: 'l1', level: 'Level 1', stand: 'North Stand', from: [1, 0.5], to: [3, 0.5], order: 'cw', ids: range(110, 115), stated: [] },
      { tier: 'l1', level: 'Level 1', stand: 'East Stand', from: [7, 0.5], to: [1, 0.5], order: 'cw', ids: range(116, 124), stated: [] },
      // Levels 2 and 3 (one band of eight rows in the model: rows 1 to 4 are Level 2, 5 to 8 Level 3).
      { tier: 'l2', rows: [0, 3], level: 'Level 2', stand: 'West Stand', from: [3, 0.5], to: [5, 0.5], order: 'cw', ids: range(202, 212), stated: ['212'], statedAs: 'measured' },
      { tier: 'l2', rows: [4, 7], level: 'Level 3', stand: 'West Stand', from: [3, 0.5], to: [5, 0.5], order: 'cw', ids: range(301, 311), stated: 'all', statedAs: 'measured' },
      { tier: 'l2', level: 'Level 2', stand: 'North Stand', from: [1, 0.5], to: [3, 0.5], order: 'cw', ids: range(213, 218), stated: [] },
      { tier: 'l2', rows: [0, 3], level: 'Level 2', stand: 'East Stand', from: [7, 0.5], to: [1, 0.5], order: 'cw', ids: range(219, 228), stated: [] },
      { tier: 'l2', rows: [4, 7], level: 'Level 3', stand: 'East Stand', from: [7, 0.5], to: [1, 0.5], order: 'cw', ids: range(312, 321), stated: ['312', '321'], statedAs: 'measured' },
      // Level 4: West 407 to 410 (The H Club) and North 416, 422 to 424 are measured.
      { tier: 'l4', level: 'Level 4', stand: 'West Stand', from: [3, 0.5], to: [5, 0.5], order: 'cw', ids: range(401, 412), stated: ['407', '408', '409', '410'], statedAs: 'measured' },
      { tier: 'l4', level: 'Level 4', stand: 'North Stand', from: [1, 0.5], to: [3, 0.5], order: 'cw', ids: range(413, 424), stated: ['416', '422', '423', '424'], statedAs: 'measured' },
      { tier: 'l4', level: 'Level 4', stand: 'East Stand', from: [7, 0.5], to: [1, 0.5], order: 'cw', ids: range(425, 436), stated: [] },
      // Level 5: West 501 to 510 and East 520 to 530 are measured.
      { tier: 'l5', level: 'Level 5', stand: 'West Stand', from: [3, 0.5], to: [5, 0.5], order: 'cw', ids: range(501, 510), stated: 'all', statedAs: 'measured' },
      { tier: 'l5', level: 'Level 5', stand: 'North Stand', from: [1, 0.5], to: [3, 0.5], order: 'cw', ids: range(511, 519), stated: [] },
      { tier: 'l5', level: 'Level 5', stand: 'East Stand', from: [7, 0.5], to: [1, 0.5], order: 'cw', ids: range(520, 530), stated: 'all', statedAs: 'measured' },
      // South Stand: front rows in Blocks 248 to 260, rear rows in 323, 324 and 451 to 453 (stated).
      { tier: 's1', rows: [0, 28], level: 'South Stand, front', stand: 'South Stand', from: [5, 0.5], to: [7, 0.5], order: 'cw', ids: range(248, 260), stated: 'all' },
      // rowBase 'tier': rows keep counting from the front of the stand (it is one tier).
      { tier: 's1', rows: [29, 57], level: 'South Stand, rear', stand: 'South Stand', from: [5, 0.5], to: [7, 0.5], order: 'cw', ids: ['323', '324', '451', '452', '453'], stated: 'all', rowBase: 'tier' },
    ],
    access: [
      { blocks: ['501', '509', '510', '520', '521', '526', '530'], words: 'Wheelchair spaces in this block', status: 'measured', source: 'AccessAble' },
      { blocks: ['422', '423', '424'], words: 'Wheelchair spaces across Blocks 422 to 424', status: 'measured', source: 'AccessAble' },
      { blocks: ['312', '321'], words: 'Wheelchair seating in this block', status: 'measured', source: 'AccessAble' },
    ],
    products: {
      'h-club': { words: 'West Stand, Level 4, Blocks 407 to 410, entered at Row 3', status: 'measured', source: 'AccessAble' },
      'sideline-suites': { words: 'East Stand, Level 4', status: 'measured', source: 'AccessAble' },
      'loge-suites': { words: 'East Stand, Level 2', status: 'measured', source: 'AccessAble' },
      'tunnel-club': { words: 'West Stand behind the home dugout; first row is Row 3', status: 'measured', source: 'AccessAble' },
      'stratus': { words: 'Front of the upper tier, East and West; Stratus West is entered at Row 22', status: 'measured', source: 'AccessAble and the architect, Populous' },
    },
    notes: [
      'South Stand rows run to at least Row 82 (stated). Our model has 58 rows there, so rear row numbers in the model will not match a ticket.',
      'Safe-standing rows have rails 900 mm high (stated) and the same legroom as other seats (stated by the architect, Populous).',
    ],
  },

  'the-arena-london': {
    rows: { style: 'letters', skip: ['I', 'O'], status: 'stated', note: 'Rows are lettered (stated: Row H in Block 101, Rows C to L in Block 112). Which letters are skipped and how many rows each block has are not published (modelled).' },
    seats: { dir: 'acw', status: 'modelled', note: 'Which end of a row is seat 1 is not published (modelled: left to right as you face the stage).' },
    blockNote: 'Level 1 Blocks 101 to 116 and Level 4 Blocks 405 to 417 are stated. Their order round the bowl is modelled, starting by the stage. Other numbers are ours.',
    tiers: {
      lower: { level: 'Level 1', standard: 'level-1' },
      band: { level: 'Suite level', standard: null },
      upper: { level: 'Level 4', standard: 'level-4' },
    },
    runs: [
      { tier: 'lower', level: 'Level 1', key: 'l1', from: [3, 0.85], to: [1, 0.15], order: 'acw', ids: range(101, 116), stated: 'all' },
      // Platform W118 suggests Level 1 runs past 116 (stated platform name).
      { tier: 'lower', level: 'Level 1', stand: 'Stage end', from: [1, 0.15], to: [3, 0.85], order: 'acw', ids: ['117', '118'], stated: [] },
      { tier: 'band', level: 'Suite level', from: [3, 0.85], to: [1, 0.15], order: 'acw', ids: range(1, 16, 'S'), stated: [], prefix: 'Suite level section' },
      { tier: 'band', level: 'Suite level', stand: 'Stage end', from: [1, 0.15], to: [3, 0.85], order: 'acw', ids: ['S17', 'S18'], stated: [], prefix: 'Suite level section' },
      // span: the part of the from..to arc this run covers (fractions), here the middle 76%.
      { tier: 'upper', level: 'Level 4', from: [3, 0.85], to: [1, 0.15], span: [0, 0.12], order: 'acw', ids: range(401, 404), stated: [] },
      { tier: 'upper', level: 'Level 4', key: 'l4', from: [3, 0.85], to: [1, 0.15], span: [0.12, 0.88], order: 'acw', ids: range(405, 417), stated: 'all' },
      { tier: 'upper', level: 'Level 4', from: [3, 0.85], to: [1, 0.15], span: [0.88, 1], order: 'acw', ids: range(418, 421), stated: [] },
      { tier: 'upper', level: 'Level 4', stand: 'Stage end', from: [1, 0.15], to: [3, 0.85], order: 'acw', ids: ['422', '423'], stated: [] },
    ],
    access: [
      { blocks: ['101', '105', '108', '113', '118'], words: 'Wheelchair platform W{id} (not open for every layout)', status: 'stated', source: 'the venue' },
    ],
    products: {
      'club-101': { words: 'Level 1, Block 101, near the stage', status: 'stated', source: 'the venue' },
      'encore-seats': { words: 'Level 1, Blocks 101, 102, 103 or 111', status: 'stated', source: 'the venue' },
      'the-terrace': { words: 'Level 1 by Blocks 107 and 108', status: 'stated', source: 'the venue' },
    },
    notes: ['Block 101 Row H and Block 112 Rows C to L are down many steps with no handrail (stated). Level 4 is not recommended for people afraid of heights (stated).'],
  },

  'ao-arena': {
    rows: { style: 'letters', skip: ['I', 'O'], status: 'stated', note: 'Lower tier Rows A to X and upper tier Rows A to R, skipping I and O (stated). Rows Y and Z at the back of Block 105 are not drawn.' },
    seats: { dir: 'acw', status: 'stated', note: 'Seat 1 is nearest the stage in Blocks 102 to 105 and furthest in 112 to 115 (stated), so seat numbers rise anticlockwise round the bowl. Seats per row are not published (modelled).' },
    blockNote: 'Blocks 101 to 122 and 201 to 222 are stated, with 102 to 115 running anticlockwise for end-stage shows (stated). Positions round the bowl are modelled.',
    tiers: {
      lower: { level: '100 level', standard: 'lower-tier' },
      band: { level: 'Suite level', standard: null },
      upper: { level: '200 level', standard: 'upper-tier' },
    },
    runs: [
      { tier: 'lower', level: '100 level', key: 'l1', from: [3, 0.85], to: [1, 0.15], order: 'acw', ids: range(102, 115), stated: 'all' },
      { tier: 'lower', level: '100 level', stand: 'Stage end', from: [1, 0.15], to: [3, 0.85], order: 'acw', ids: [...range(116, 122), '101'], stated: 'all' },
      { tier: 'band', level: 'Suite level', from: [3, 0.85], to: [1, 0.15], order: 'acw', ids: range(1, 14, 'S'), stated: [], prefix: 'Suite level section' },
      { tier: 'band', level: 'Suite level', stand: 'Stage end', from: [1, 0.15], to: [3, 0.85], order: 'acw', ids: range(15, 18, 'S'), stated: [], prefix: 'Suite level section' },
      { tier: 'upper', level: '200 level', key: 'l2', from: [3, 0.85], to: [1, 0.15], order: 'acw', ids: range(202, 215), stated: 'all' },
      { tier: 'upper', level: '200 level', stand: 'Stage end', from: [1, 0.15], to: [3, 0.85], order: 'acw', ids: [...range(216, 222), '201'], stated: 'all' },
    ],
    steps: { perRow: 3, status: 'measured', source: 'the venue’s access guide', words: 'Three aisle steps per row in both tiers' },
    access: [
      { blocks: ['108', '109'], words: 'Access platform {id}', status: 'stated', source: 'the venue' },
      { blocks: ['105'], words: 'Platform at Row Z of Block 105; ambulant seats in Rows X and Y', status: 'stated', source: 'the venue' },
      { blocks: ['114'], rows: ['L', 'X'], words: 'Hearing loop, Rows L to X', status: 'stated', source: 'the venue' },
    ],
    products: {
      'concert-club': { words: 'Blocks 103 and 114', status: 'stated', source: 'the venue' },
      'beautiful-north': { words: 'Balcony above Block 115, by the stage end', status: 'stated', source: 'the venue' },
    },
    notes: ['Floor blocks are usually numbered 1 to 18, left to right as you face the stage (stated). They change with each show, so the floor is drawn as one area.'],
  },

  'co-op-live': {
    rows: { style: 'numbers', status: 'stated', note: 'Rows are numbered; Level 1 has at least 24 rows (stated). Our row counts are modelled.' },
    seats: { dir: 'acw', status: 'modelled', note: 'Seat 1 position is not published (modelled: left to right as you face the stage).' },
    blockNote: 'Level 1 Blocks 102 to 114 are stated (platforms on Row 24). Level 3 Blocks 307 and 314 are stated. All positions and every other number are modelled.',
    tiers: {
      lower: { level: 'Level 1', standard: 'level-1' },
      band: { level: 'Level 2', standard: null },
      upper: { level: 'Level 3', standard: 'level-3' },
    },
    runs: [
      { tier: 'lower', level: 'Level 1', key: 'l1', from: [3, 0.85], to: [1, 0.15], order: 'acw', ids: range(102, 114), stated: 'all' },
      { tier: 'lower', level: 'Level 1', stand: 'Stage end', from: [1, 0.15], to: [3, 0.85], order: 'acw', ids: ['115', '116', '117', '101'], stated: [] },
      { tier: 'band', level: 'Level 2', from: [3, 0.85], to: [1, 0.15], order: 'acw', ids: range(202, 214), stated: [] },
      { tier: 'band', level: 'Level 2', stand: 'Stage end', from: [1, 0.15], to: [3, 0.85], order: 'acw', ids: ['215', '216', '217', '201'], stated: [] },
      { tier: 'upper', level: 'Level 3', from: [3, 0.85], to: [1, 0.15], order: 'acw', ids: range(302, 314), stated: ['307', '314'] },
      { tier: 'upper', level: 'Level 3', stand: 'Stage end', from: [1, 0.15], to: [3, 0.85], order: 'acw', ids: ['315', '316', '317', '301'], stated: [] },
    ],
    steps: { perRowByTier: { lower: 2, upper: 3 }, status: 'stated', source: 'the venue', words: 'Two steps per row on floor Blocks D1 and D2, three per row on Level 3; Level 1 is not published, so we use two' },
    access: [
      { blocks: range(102, 114), rows: ['24'], words: 'Step-free platform on Row 24', status: 'stated', source: 'the venue' },
      { blocks: ['307', '314'], words: 'Platform {id}AP, layout dependent', status: 'stated', source: 'the venue' },
    ],
    products: {
      hideaway: { words: 'Section 103, near the stage', status: 'stated', source: 'the venue' },
      'gallery-suites': { words: 'Level 2, left and right sides', status: 'stated', source: 'the venue' },
    },
    notes: ['Level 3 is not recommended for people with vertigo (stated).'],
  },

  'royal-albert-hall': {
    rows: { style: 'numbers', status: 'stated', note: 'Rows are numbered (stated: Stalls J Row 5, Rausing Circle from Row 1). Rows per section are not published (modelled).' },
    seats: { dir: 'acw', status: 'modelled', note: 'Seat numbers run on along each row (stated examples reach Seat 57 in the Circle and Seat 60 in the Stalls). Which end is seat 1 is not published (modelled).' },
    blockNote: 'Stalls sections are lettered (Stalls J is stated). The full list of letters is not published, so ours are modelled. The Circle is drawn as one level, since sections there are not confirmed.',
    tiers: {
      lower: { level: 'Stalls', standard: 'stalls' },
      circle: { level: 'Rausing Circle', standard: 'rausing-circle' },
      floor: { level: 'Arena', standard: 'arena' },
    },
    runs: [
      { tier: 'lower', level: 'Choir', stand: 'Behind the stage', area: 'choir', from: [1, 0.72], to: [3, 0.28], order: 'acw', ids: ['Choir 1', 'Choir 2', 'Choir 3'], stated: [], continuous: true, label: (id) => id.replace(' ', ', section ') },
      { tier: 'lower', level: 'Stalls', from: [3, 0.28], to: [1, 0.72], order: 'acw', ids: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R'], stated: ['J'], continuous: true, label: (id) => `Stalls ${id}` },
      { tier: 'circle', level: 'Rausing Circle', from: [3, 0.3947], to: [1, 0.6053], order: 'acw', ids: range(1, 12, 'RC'), stated: [], continuous: true, label: () => 'Rausing Circle' },
    ],
    boxes: {
      'box-loggia': { label: 'Loggia box', status: 'modelled', note: 'Box numbers and positions are not published, so ours are modelled.' },
      'box-grand': { label: 'Grand Tier box', status: 'modelled', note: 'Boxes are numbered by tier (stated examples: Grand Tier 10 and 12). Our numbers and positions are modelled.' },
      'box-second': { label: 'Second Tier box', status: 'modelled', note: 'Boxes are numbered by tier (stated examples: Second Tier 26 and 66). Our numbers and positions are modelled.' },
    },
    armrests: {
      stalls: { arms: false, words: 'No armrests', status: 'stated' },
      choir: { arms: true, words: 'Fixed armrests', status: 'stated' },
      circle: { arms: true, words: 'Fixed armrests', status: 'stated' },
      arena: { arms: true, words: 'Fixed armrests', status: 'stated' },
      box: { arms: true, words: 'Chairs with arms; most can be changed to armless', status: 'stated' },
    },
    access: [],
    products: {},
    notes: ['Wheelchair spaces are in the Stalls, Rausing Circle and Gallery (stated); their exact places are not published, so they are not drawn.', 'The Rausing Circle is steep, with support rails at each row (stated).'],
  },

  'ascot-racecourse': {
    rows: null, seats: null,
    blockNote: 'No public seats are numbered: enclosure seating is first come, first served and the front of the Grandstand is standing steps (stated). Only box places and restaurant tables are allocated.',
    boxes: {
      'boxes-2': { label: 'Level 2', groups: [[201, 215], [216, 244], [245, 265]], status: 'stated' },
      'boxes-3': { label: 'Level 3', groups: [[301, 315], [316, 339], [340, 360]], status: 'stated' },
      'boxes-4': { label: 'Level 4', groups: [[401, 412], [413, 419], [420, 439], [440, 454]], status: 'stated' },
      'boxes-5': { label: 'Level 5', groups: [[501, 506], [507, 525]], status: 'stated' },
      'boxes-6': { label: 'Level 6', groups: [[601, 612], [613, 641], [642, 661]], status: 'stated' },
    },
    boxNote: 'Box numbers by level are stated, in groups split by the four stair and lift cores. Which end is lowest and where each box sits are not published, so positions are modelled. Some boxes combine several numbers (Double, Triple, Quad and Long boxes).',
    access: [],
    products: { 'private-box': { words: 'Every box has a balcony that takes wheelchairs', status: 'stated', source: 'the venue' } },
    notes: [],
  },

  'cheltenham-racecourse': {
    rows: null, seats: null,
    blockNote: 'Enclosures have no numbered seats. Racecourse View in the Main Grandstand is the only reserved, numbered public seating (stated); it is not drawn in this model.',
    boxes: {
      'boxes-1': { label: 'First floor', status: 'modelled', unnumbered: true },
      'boxes-2': { label: 'Second floor', status: 'modelled', unnumbered: true },
      'boxes-3': { label: 'Third floor', status: 'modelled', unnumbered: true },
    },
    boxNote: 'Box numbers on Main Grandstand Levels 4 and 5 are measured, but which product uses which boxes is not published, so the boxes here are unnumbered and their positions modelled.',
    access: [],
    products: {},
    notes: ['Box viewing areas have a front and a back row (measured). Step heights of 16 cm and 22 cm in the National Hunt Rooms and 26 cm at the Hatton’s Grace Room front row are measured (AccessAble).'],
  },
};

/* ---------- Hook: "See this on our website" ---------- */

// Next agent: fill from js/data/prestige-links.js. Shape:
//   WEBSITE_LINKS['venue-id'] = { _venue: '/venue/...', 'area-id': '/hospitality/...' }
// Paths only (on prestigecorporateevents.com). Never a venue page for The Arena London.
export const WEBSITE_LINKS = {};

// The seat panel calls this; it returns { href, label } or null.
export function websiteLinkFor(venueId, areaId) {
  const v = WEBSITE_LINKS[venueId]; if (!v) return null;
  const href = v[areaId] || null;
  return href ? { href, label: 'See this on our website' } : null;
}
