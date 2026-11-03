// Venues, seating areas and event types for the planning tools.
// Rebuilt 02/11/2026 from dev/research/venue-facts.json (the research file, with a source,
// snippet and confidence on every fact). Viewer agent owns this file.
//
// CONTENT RULES baked in here:
// - Restricted venues are deliberately absent and must never be added.
// - The Greenwich arena is only ever "The Arena London". Its official product names carry
//   the commercial brand, so only the research displayName is used, and its source URLs are
//   never written here (they contain the brand): see venue-facts.json instead.
// - No prices, availability, sold-out status or seller names. No capacities or box sizes.
// - Product facts below (where, seat type, the venue's own view words, inclusions) are copied
//   from the research. Each area keeps its source URLs in `src` (code only, never linked:
//   the app never sends anyone off prestigecorporateevents.com).
// - Where a product's position is not published, it is placed on the best evidence and the
//   area carries `modelled` (a plain-words note shown in the UI).
//
// ---------------------------------------------------------------------------------------
// SHAPE (for the next agent reworking Seat Finder and Matchmaker against this file)
// ---------------------------------------------------------------------------------------
// VENUES[]            { id, name, city, archetype, icon, racing?, geo, days? }
//   days              racecourses only: [{ id, label }]. Area names and lists depend on it.
// VENUE_AREAS[venueId][] one entry per real product or standard seating area:
//   id                stable slug used in hash links (area=...)
//   name              display name (research displayName). nameByDay / nameByMode override.
//   kind              'hospitality' | 'standard'
//   modes?            event modes it applies to (default: every mode of the archetype)
//   days?             racecourse day ids it applies to (default: every day)
//   where             { stand?, level?, block?, side?, note? } plain display strings
//   seatType          the research seat type, in plain words
//   view?             the venue's own words about the view (a short quote), or null
//   includes[]        inclusions as listed by the venue (includesByDay overrides)
//   inc[]             ids for the Is Hospitality Worth It? hand-off (seat, lounge, dining,
//                     drinks, private, fast-track, host, parking, gift, meet)
//   modelled?         note shown in the UI when the position in the model is not published
//   places[]          where the seat camera can go: [{ id, label, section, blocks? }]
//                     section ids are defined per venue in js/viewer/layouts.js
//   src[]             research source URLs (code only)
// OTHER_SPACES[venueId][] products with no seat view (lounges, restaurants): { name, where, src }
// VENUE_FACTS[venueId][]  { text, kind: 'stated' | 'derived', src } shown in "How this model was built"
// AREA_ALIASES        old hash ids (the archetype-wide areas used before 02/11/2026) to new ids
// Helpers: venueById, areasFor(venueId, { mode, day }), allAreasFor, areaById (alias aware),
//   resolveAreaId, areaName(area, mode, day), daysFor, defaultDay, dayLabel,
//   standardAreaFor, hospitalityAreasFor, includesFor.
// AREAS (legacy, archetype-wide generic styles with opinion scores) is kept only so Seat
// Finder, Matchmaker and Corporate ROI keep working until they are reworked. The viewer no
// longer shows those scores. See the LEGACY block at the end.

export const EVENT_TYPES = [
  { id: 'football', label: 'Football', category: 'sport', archetypes: ['stadium'] },
  // Rugby has no venue in this tool, so it never opens the viewer.
  { id: 'rugby', label: 'Rugby', category: 'sport', archetypes: [] },
  { id: 'nfl', label: 'NFL', category: 'sport', archetypes: ['stadium'] },
  { id: 'horse-racing', label: 'Horse racing', category: 'sport', archetypes: ['racecourse'] },
  { id: 'boxing', label: 'Boxing', category: 'sport', archetypes: ['arena'] },
  { id: 'formula-1', label: 'Formula 1', category: 'sport', archetypes: [] },
  { id: 'cricket', label: 'Cricket', category: 'sport', archetypes: [] },
  { id: 'tennis', label: 'Tennis', category: 'sport', archetypes: [] },
  { id: 'darts', label: 'Darts', category: 'sport', archetypes: ['arena'] },
  { id: 'arena-concert', label: 'Arena concert', category: 'music', archetypes: ['arena'] },
  { id: 'stadium-concert', label: 'Stadium concert', category: 'music', archetypes: ['stadium'] },
  { id: 'festival', label: 'Festival', category: 'music', archetypes: [] },
  { id: 'orchestra', label: 'Classical and orchestral', category: 'arts', archetypes: ['hall'] },
  { id: 'theatre', label: 'Theatre', category: 'arts', archetypes: ['hall'] },
  { id: 'comedy', label: 'Comedy', category: 'arts', archetypes: ['arena', 'hall'] },
];

export const CATEGORY_LINK_KEY = { sport: 'sport', music: 'music', arts: 'arts' };

// Event modes the 3D viewer can stage inside each archetype.
export const MODES = {
  // Football is played only at Tottenham Hotspur Stadium, the one stadium in this tool.
  stadium: [
    { id: 'football', label: 'Football' },
    { id: 'nfl', label: 'NFL' },
    { id: 'concert', label: 'Concert' },
  ],
  arena: [
    { id: 'concert', label: 'Concert' },
    { id: 'boxing', label: 'Boxing' },
  ],
  hall: [
    { id: 'orchestra', label: 'Orchestra' },
  ],
  racecourse: [
    { id: 'racing', label: 'Race day' },
  ],
};

// geo: where the "Real venue" view (Google's photorealistic 3D map) points. lat and lng are
// copied from the Wikipedia infobox or the Wikidata coordinate location (source URL in the
// comment on each line, checked 30/10/2026). range, tilt and heading are framing choices.
export const VENUES = [
  // https://en.wikipedia.org/wiki/Tottenham_Hotspur_Stadium (51.6044, -0.0664)
  { id: 'tottenham-hotspur-stadium', name: 'Tottenham Hotspur Stadium', city: 'London', archetype: 'stadium', icon: 'stadium',
    geo: { lat: 51.6044, lng: -0.0664, range: 650, tilt: 62, heading: 0 } },
  // https://www.wikidata.org/wiki/Q5364202 coordinate location 51 30 10 N, 0 0 11 E (51.50278, 0.00306)
  { id: 'the-arena-london', name: 'The Arena London', city: 'London', archetype: 'arena', icon: 'music',
    geo: { lat: 51.50278, lng: 0.00306, range: 700, tilt: 60, heading: 0 } },
  // https://en.wikipedia.org/wiki/Manchester_Arena (53.48806, -2.24389)
  { id: 'ao-arena', name: 'AO Arena', city: 'Manchester', archetype: 'arena', icon: 'music',
    geo: { lat: 53.48806, lng: -2.24389, range: 550, tilt: 60, heading: 0 } },
  // https://en.wikipedia.org/wiki/Co-op_Live (53.48639, -2.19972)
  { id: 'co-op-live', name: 'Co-op Live', city: 'Manchester', archetype: 'arena', icon: 'music',
    geo: { lat: 53.48639, lng: -2.19972, range: 550, tilt: 60, heading: 0 } },
  // https://en.wikipedia.org/wiki/Royal_Albert_Hall (51.5011, -0.1774)
  { id: 'royal-albert-hall', name: 'Royal Albert Hall', city: 'London', archetype: 'hall', icon: 'hall',
    geo: { lat: 51.5011, lng: -0.1774, range: 420, tilt: 60, heading: 0 } },
  // https://en.wikipedia.org/wiki/Ascot_Racecourse (51.41611, -0.67694)
  { id: 'ascot-racecourse', name: 'Ascot Racecourse', city: 'Berkshire', archetype: 'racecourse', icon: 'racing', racing: 'flat',
    days: [{ id: 'royal', label: 'Royal Ascot' }, { id: 'raceday', label: 'Other racedays' }],
    geo: { lat: 51.41611, lng: -0.67694, range: 1400, tilt: 58, heading: 0 } },
  // https://en.wikipedia.org/wiki/Cheltenham_Racecourse (51.92028, -2.05778)
  { id: 'cheltenham-racecourse', name: 'Cheltenham Racecourse', city: 'Gloucestershire', archetype: 'racecourse', icon: 'racing', racing: 'jumps',
    days: [{ id: 'festival', label: 'The Festival' }, { id: 'other', label: 'Other racedays' }],
    geo: { lat: 51.92028, lng: -2.05778, range: 1400, tilt: 58, heading: 0 } },
];

export const venueById = (id) => VENUES.find((v) => v.id === id) || null;

/* ---------- Source URLs (research, code only) ---------- */

const SPURS_EXP = 'https://hospitality.tottenhamhotspur.com/experiences';
const SPURS_ACCESS = 'https://www.tottenhamhotspurstadium.com/plan-your-visit/accessibility';
const SPURS_WIKI = 'https://en.wikipedia.org/wiki/Tottenham_Hotspur_Stadium';
const SPURS_POPULOUS = 'https://populous.com/project/tottenham-hotspur-football-club';
const AO_FAQ = 'https://www.ao-arena.com/plan-your-visit/faqs';
const AO_PKG = 'https://www.ao-arena.com/premium-experiences/event-packages';
const COOP_ABOUT = 'https://www.cooplive.com/about-the-arena-69nb';
const COOP_CLUB = 'https://www.cooplive.com/premium-tickets-the-club-by-barclays-jmcy';
const COOP_WIKI = 'https://en.wikipedia.org/wiki/Co-op_Live';
const RAH_BOX = 'https://www.royalalberthall.com/visit/food-and-drink/food-and-drink-in-your-box';
const RAH_PARTNER = 'https://www.royalalberthall.com/visit/premium-experiences/private-box-partnerships';
const RAH_DINING = 'https://www.royalalberthall.com/visit/food-and-drink/restaurants-and-bars';
const RAH_WIKI = 'https://en.wikipedia.org/wiki/Royal_Albert_Hall';
const RAH_ACCESS = 'https://www.royalalberthall.com/plan-your-visit-essential-safety-information/accessibility/accessible-tickets-facilities-and-services/';
const ASCOT_RE = 'https://www.ascot.com/hospitality/royal-enclosure-grandstand-restaurants';
const ASCOT_QA = 'https://www.ascot.com/hospitality/queen-anne-enclosure-restaurants';
const ASCOT_ROYAL_GUIDE = 'https://www.ascot.com/royal-ascot-enclosure-guide';
const ASCOT_RACEDAY_GUIDE = 'https://www.ascot.com/racedays/enclosure-guide';
const ASCOT_VILLAGE = 'https://www.ascot.com/royal-ascot/village-enclosure';
const CHEL_REST = 'https://www.thejockeyclub.co.uk/cheltenham-festival/dining-and-hospitality/restaurant-packages/';
const CHEL_BOXES = 'https://www.thejockeyclub.co.uk/cheltenham-festival/dining-and-hospitality/private-boxes/';
const CHEL_ENCL = 'https://www.thejockeyclub.co.uk/cheltenham/plan-your-day/enclosures/';
// The Arena London: sources are in venue-facts.json under "the-arena-london" (they carry the
// commercial brand, so they are not repeated here). ARENA_LDN marks those entries.
const ARENA_LDN = 'venue-facts.json: the-arena-london';

/* ---------- Seating areas per venue ---------- */

export const VENUE_AREAS = {
  'tottenham-hotspur-stadium': [
    {
      id: 'tunnel-club', name: 'The Tunnel Club', kind: 'hospitality', modes: ['football', 'concert'],
      where: { stand: 'West Stand', level: 'Level 1', note: 'Seats directly behind the home dugout. The lounge overlooks the players’ tunnel.' },
      seatType: 'Padded seats in the bowl in front of a lounge',
      view: 'a unique, behind-the-scenes view of the players',
      includes: ['Glass-walled restaurant and bar', 'Three-course dining', 'Drinks package including cocktails'],
      inc: ['seat', 'lounge', 'dining', 'drinks'],
      modelled: 'Its first row is Row 3 (measured, AccessAble access survey). The rows behind it and the seat numbers are modelled.',
      places: [{ id: 'west', label: 'West Stand, behind the dugout', section: 'w-l1-dugout' }],
      src: ['https://hospitality.tottenhamhotspur.com/seasonal-memberships/the-tunnel-club', SPURS_POPULOUS],
    },
    {
      id: 'residency-grill', name: 'The Residency Grill', kind: 'hospitality', modes: ['football'],
      where: { stand: 'East Stand', level: 'Level 2', note: 'Central on the East touchline.' },
      seatType: 'Padded seats in the bowl in front of a lounge',
      view: null, // the venue's wording mentions availability, so it is not quoted
      includes: ['Three-course pre-match meal', 'Private table'],
      inc: ['seat', 'lounge', 'dining', 'private'],
      modelled: 'Level 2 is stated. The rows and the exact seats are modelled.',
      places: [{ id: 'east', label: 'East Stand, central', section: 'e-l2' }],
      src: [SPURS_EXP],
    },
    {
      id: 'residency-east', name: 'The Residency East', kind: 'hospitality', modes: ['football'],
      where: { stand: 'East Stand', level: 'Level 3', note: 'Central on the East touchline.' },
      seatType: 'Padded seats in the bowl in front of a lounge',
      view: null,
      includes: ['Five-course tasting menu to share in The Residency Restaurant', 'Private table'],
      inc: ['seat', 'lounge', 'dining', 'private'],
      modelled: 'Level 3 is stated. The rows and the exact seats are modelled.',
      places: [{ id: 'east', label: 'East Stand, central', section: 'e-l3' }],
      src: [SPURS_EXP],
    },
    {
      id: 'residency-west', name: 'The Residency West', kind: 'hospitality', modes: ['football'],
      where: { stand: 'West Stand', level: 'Level 3' },
      seatType: 'Padded seats in the bowl in front of a lounge',
      view: null,
      includes: ['Five-course tasting menu to share', 'Private table'],
      inc: ['seat', 'lounge', 'dining', 'private'],
      modelled: 'West Stand Level 3 is stated. Where along the stand is not published, so the seats are placed near the halfway line (modelled).',
      places: [{ id: 'west', label: 'West Stand', section: 'w-l3' }],
      src: [SPURS_EXP],
    },
    {
      id: 'stadium-social', name: 'Stadium Social', kind: 'hospitality', modes: ['football'],
      where: { stand: 'East Stand', note: 'On the East touchline. The level is not published.' },
      seatType: 'Padded seats in the bowl in front of a lounge',
      view: null,
      includes: ['Mediterranean three-course pre-match meal', 'Table reservation ends at kick-off'],
      inc: ['seat', 'lounge', 'dining'],
      modelled: 'The level and the place along the touchline are not published, so both are modelled.',
      places: [{ id: 'east', label: 'East touchline', section: 'e-l2-quarter' }],
      src: [SPURS_EXP],
    },
    {
      id: 'premium-seats', name: 'Premium Seats', kind: 'hospitality', modes: ['football'],
      where: { stand: 'West or East Stand', note: 'On the touchline, with the West or East Quarter premium bars and lounges. The level is not published.' },
      seatType: 'Padded seats in the bowl in front of a lounge',
      view: 'some of the best seats in the house',
      includes: ['Light hand-held food before the match', 'West or East Quarter premium bars and lounges'],
      inc: ['seat', 'lounge', 'dining'],
      modelled: 'The level and the place along the touchline are not published, so both are modelled.',
      places: [
        { id: 'west', label: 'West Stand', section: 'w-l2-quarter' },
        { id: 'east', label: 'East Stand', section: 'e-l2-quarter' },
      ],
      src: [SPURS_EXP],
    },
    {
      id: 'loge-suites', name: 'Loge Suites', kind: 'hospitality', modes: ['football'],
      where: { stand: 'East Stand', level: 'Level 2', note: 'Seats in front of a private suite.' },
      seatType: 'Seats in front of a private suite',
      view: null,
      includes: ['Pre-match three-course buffet served to the suite', 'Half-time and post-match refreshments', 'Selected beers, wines and soft drinks', 'Use of premium bars on Levels 2 and 3'],
      inc: ['seat', 'private', 'dining', 'drinks', 'lounge'],
      modelled: 'East Stand Level 2 is measured (AccessAble access survey). The model uses the back rows of Level 2, and the suite position along the stand is modelled.',
      places: [{ id: 'east', label: 'East Stand', section: 'e-loge' }],
      src: ['https://hospitality.tottenhamhotspur.com/experiences/loges'],
    },
    {
      id: 'suites-on-four', name: 'Suites On Four', kind: 'hospitality', modes: ['football'],
      where: { level: 'Level 4', note: 'The stand is not published.' },
      seatType: 'Seats in front of a private suite',
      view: 'unrivalled views of Tottenham Hotspur Stadium',
      includes: ['Three-course dining', 'Half-time and post-match refreshments'],
      inc: ['seat', 'private', 'dining', 'drinks'],
      modelled: 'Level 4 is stated (the architect also describes Level 4 suites). The stand is not published, so the model shows the West Stand.',
      places: [{ id: 'west', label: 'Level 4, West Stand (modelled)', section: 'w-l4' }],
      src: ['https://hospitality.tottenhamhotspur.com/seasonal-memberships/suites-on-four'],
    },
    {
      id: 'loge-on-four', name: 'Loge On Four', kind: 'hospitality', modes: ['football'],
      where: { level: 'Level 4, going by the name', note: 'The stand is not published.' },
      seatType: 'Not published',
      view: 'exceptional views of all the action',
      includes: ['Chef-designed gourmet dining'],
      inc: ['seat', 'private', 'dining'],
      modelled: 'Only the name points to Level 4. The stand and seat type are not published, so the model shows East Stand Level 4.',
      places: [{ id: 'east', label: 'Level 4, East Stand (modelled)', section: 'e-l4' }],
      src: ['https://hospitality.tottenhamhotspur.com/seasonal-memberships'],
    },
    {
      id: 'h-club', name: 'The H Club', kind: 'hospitality', modes: ['football', 'concert'],
      where: { stand: 'West Stand', level: 'Level 4', block: 'Blocks 407 to 410', note: 'Members’ club with the Luminaire Bar, entered at Row 3.' },
      seatType: 'Padded seats in the bowl in front of a lounge',
      view: 'exceptional views',
      includes: ['Three-course dining with celebrated chefs', 'Champagne-inclusive drinks', 'The Luminaire Bar'],
      inc: ['seat', 'lounge', 'dining', 'drinks'],
      modelled: 'West Stand Level 4, Blocks 407 to 410 and the Row 3 entrance are measured (AccessAble access survey). Row counts and seat numbers are modelled.',
      places: [{ id: 'west', label: 'West Stand, Level 4, Blocks 407 to 410', section: 'w-l4-club' }],
      src: ['https://hospitality.tottenhamhotspur.com/seasonal-memberships/the-h-club'],
    },
    {
      // Named on our own venue page, in its concert hospitality paragraph and its private box
      // FAQs for concerts and NFL games (prestige-links.json, read 02/11/2026).
      id: 'sideline-suites', name: 'Sideline Suites', kind: 'hospitality',
      where: { stand: 'West or East Stand', level: 'West Levels 2 and 4, East Level 4', note: 'Private suites with direct access to premium seats from the suite.' },
      seatType: 'Seats in front of a private suite',
      view: null,
      includes: [],
      inc: ['seat', 'private', 'dining'],
      modelled: 'The levels come from our venue page. Where along each stand is not published, so the suites are placed near the halfway line (modelled). The model shows the Level 4 suites; West Level 2 is not drawn separately.',
      places: [
        { id: 'west', label: 'West Stand, Level 4', section: 'w-l4' },
        { id: 'east', label: 'East Stand, Level 4', section: 'e-l4' },
      ],
      src: ['/venue/tottenham-hotspur-stadium-london', 'https://hospitality.tottenhamhotspur.com/seasonal-memberships/sideline-suites'],
    },
    {
      id: 'stratus', name: 'Stratus', kind: 'hospitality', modes: ['football'],
      where: { stand: 'West or East Stand', level: 'Level 5', note: 'On the halfway line, at the highest point in the stadium.' },
      seatType: 'Padded seats in the bowl in front of a lounge',
      view: 'panoramic views across London and the pitch from the highest vantage point',
      includes: ['Bowl food before and after the match', 'Selected beers, wines and soft drinks', 'Resident DJs'],
      inc: ['seat', 'lounge', 'dining', 'drinks'],
      modelled: 'Level 5 and the halfway line are stated. The architect places the top-tier lounges with seats at the front of the upper tier, so the model uses the front rows (derived).',
      places: [
        { id: 'west', label: 'West Stand', section: 'w-l5-front' },
        { id: 'east', label: 'East Stand', section: 'e-l5-front' },
      ],
      src: ['https://hospitality.tottenhamhotspur.com/experiences/stratus', 'https://populous.com/wp-content/uploads/2020/09/POPULOUS_THFC_Media-Kit_Digital.pdf'],
    },
    {
      id: 'broadcast-booths', name: 'Broadcast Booths', kind: 'hospitality', modes: ['football'],
      where: { stand: 'South-west corner', note: 'Close to the single-tier South Stand. The level is not published.' },
      seatType: 'Seats in front of a private booth',
      view: 'a unique vantage point to take in all of the action',
      includes: ['Pre-match buffet served to the booth'],
      inc: ['seat', 'private', 'dining'],
      modelled: 'The south-west corner is stated. The level is not published, so the model uses the Level 4 band.',
      places: [{ id: 'sw', label: 'South-west corner', section: 'sw-booth' }],
      src: [SPURS_EXP],
    },
    // Standard seating (the "standard ticket" comparison).
    {
      id: 'level-1', name: 'Level 1 seats', kind: 'standard',
      where: { level: 'Level 1', note: 'Reserved seats in the lower tier, all round the pitch.' },
      seatType: 'Standard tip-up seat',
      view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'Rows and blocks are not published. The model shows a seat on the East side.',
      places: [
        { id: 'east', label: 'East Stand', section: 'e-l1' },
        { id: 'north', label: 'North Stand', section: 'n-l1' },
      ],
      src: [SPURS_ACCESS],
    },
    {
      id: 'south-stand', name: 'South Stand', kind: 'standard',
      where: { stand: 'South Stand', note: 'The single-tier home end, with rail seats at the front.' },
      seatType: 'Standard seat, with rail seats in the front rows',
      view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'Its 34 degree rake and single tier are stated. Row depth and row count are modelled.',
      places: [{ id: 'south', label: 'South Stand', section: 's-l1' }],
      src: [SPURS_POPULOUS, SPURS_WIKI],
    },
    {
      id: 'level-5', name: 'Level 5 seats', kind: 'standard',
      where: { level: 'Level 5', note: 'The upper tier.' },
      seatType: 'Standard tip-up seat',
      view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'Rows are not published. Rake follows the stated 35 degree maximum.',
      places: [
        { id: 'east', label: 'East Stand', section: 'e-l5' },
        { id: 'north', label: 'North Stand', section: 'n-l5' },
      ],
      src: [SPURS_ACCESS],
    },
    {
      id: 'away-section', name: 'Away section', kind: 'standard', modes: ['football'],
      where: { stand: 'North-east corner' },
      seatType: 'Standard seat',
      view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'The corner is stated. The tier and rows are modelled.',
      places: [{ id: 'ne', label: 'North-east corner', section: 'ne-l1' }],
      src: [SPURS_WIKI],
    },
    {
      id: 'pitch-floor', name: 'Standing floor', kind: 'standard', modes: ['concert'],
      where: { note: 'For concerts the grass pitch slides away under the South Stand and the floor is used for standing.' },
      seatType: 'Standing',
      view: null, includes: ['Standing entry'], inc: ['seat'],
      modelled: 'The venue does not publish the stage end, so the stage position is modelled.',
      places: [{ id: 'floor', label: 'Standing floor', section: 'floor' }],
      src: ['https://populous.com/wp-content/uploads/2020/09/POPULOUS_THFC_Media-Kit_Digital.pdf'],
    },
  ],

  'the-arena-london': [
    {
      id: 'club-101', name: 'Club 101', kind: 'hospitality',
      where: { level: 'Level 1', block: 'Block 101', note: 'Near the stage.' },
      seatType: 'Padded seats in the bowl in front of a private lounge',
      view: 'puts you up close, so you won’t miss a moment',
      includes: ['Private lounge with a fully stocked bar', 'Complimentary food', 'Premium drinks to buy'],
      inc: ['seat', 'lounge', 'dining', 'drinks'],
      modelled: 'Level 1 and Block 101 are stated. Rows are not published, and the stage end is derived from "near the stage".',
      places: [{ id: '101', label: 'Block 101', section: 'l1', blocks: ['101'] }],
      src: [ARENA_LDN],
    },
    {
      id: 'encore-seats', name: 'Encore Seats', kind: 'hospitality',
      where: { level: 'Level 1', block: 'Blocks 101, 102, 103 or 111' },
      seatType: 'Seats in the bowl with members’ lounge entry',
      view: 'incredible Level 1 views',
      includes: ['Lounge entry before and after the show'],
      inc: ['seat', 'lounge'],
      modelled: 'The blocks are stated. Block positions round the bowl and the rows are modelled.',
      places: [{ id: 'l1', label: 'Level 1', section: 'l1', blocks: ['101', '102', '103', '111'] }],
      src: [ARENA_LDN],
    },
    {
      id: 'the-terrace', name: 'The Terrace', kind: 'hospitality',
      where: { level: 'Level 1', block: 'By Blocks 107 and 108' },
      seatType: 'Bar stool seating',
      view: null, includes: [], inc: ['seat', 'drinks'],
      modelled: 'Level 1 by Blocks 107 and 108 is stated. The model puts the stools at the back of those blocks.',
      places: [{ id: 'l1', label: 'Level 1, by Blocks 107 and 108', section: 'l1-terrace' }],
      src: [ARENA_LDN],
    },
    {
      id: 'private-suite', name: 'Private suite', kind: 'hospitality',
      where: { note: 'Balcony seats in front of a suite. The arena has 96 suites; their level is not published.' },
      seatType: 'Balcony seats in front of a private suite',
      view: 'uninterrupted views from cushy seats on an open balcony',
      includes: ['Catering options for each event', 'Lounge access before and after the show'],
      inc: ['seat', 'private', 'dining', 'lounge'],
      modelled: 'The suite level is not published. Suite 337 suggests Level 3, so the model uses a Level 3 band (derived from the number only).',
      places: [{ id: 'l3', label: 'Suite level (modelled)', section: 'suites' }],
      src: [ARENA_LDN],
    },
    {
      id: 'the-level', name: 'The LEVEL', kind: 'hospitality',
      where: { note: 'Twelve former suites turned into one space. Its position is not published.' },
      seatType: 'Premium seats with lounge access',
      view: null,
      includes: ['Premium seating with exclusive lounge access', 'Curated food and drink'],
      inc: ['seat', 'lounge', 'dining', 'drinks'],
      modelled: 'It was made from suites, so the model places it on the suite level, side-on to the stage. Treat this position as modelled.',
      places: [{ id: 'l3', label: 'Suite level (modelled)', section: 'suites-side' }],
      src: [ARENA_LDN],
    },
    { id: 'floor', name: 'Floor', nameByMode: { concert: 'Standing floor', boxing: 'Floor seats' }, kind: 'standard',
      where: { level: 'Level 0', note: 'Standing or seated, depending on the show.' },
      seatType: 'Standing or floor seats', view: null, includes: ['Entry to the floor'], inc: ['seat'],
      modelled: 'The floor size, stage end and ring position are not published, so all three are modelled.',
      places: [{ id: 'floor', label: 'Floor', section: 'floor' }], src: [ARENA_LDN] },
    { id: 'level-1', name: 'Level 1 seats', kind: 'standard',
      where: { level: 'Level 1', block: 'Blocks 101 to 116' }, seatType: 'Standard seat', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'The block numbers are stated. Their order round the bowl and the rows are modelled.',
      places: [{ id: 'l1', label: 'Level 1', section: 'l1', blocks: ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112', '113', '114', '115', '116'] }], src: [ARENA_LDN] },
    { id: 'level-4', name: 'Level 4 seats', kind: 'standard',
      where: { level: 'Level 4', block: 'Blocks 405 to 417' }, seatType: 'Standard seat', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'The block numbers are stated. Their order round the bowl and the rows are modelled.',
      places: [{ id: 'l4', label: 'Level 4', section: 'l4', blocks: ['405', '406', '407', '408', '409', '410', '411', '412', '413', '414', '415', '416', '417'] }], src: [ARENA_LDN] },
  ],

  'ao-arena': [
    {
      id: 'beautiful-north', name: 'The Beautiful North', kind: 'hospitality',
      where: { block: 'Above Block 115', note: 'Right by the stage end.' },
      seatType: 'Balcony seats',
      view: 'views of the stage that are second to none',
      includes: ['Exclusive bar', 'Premium hot and cold dishes', 'Small plates', 'Fully inclusive premium drinks'],
      inc: ['seat', 'private', 'dining', 'drinks'],
      modelled: 'Above Block 115 at the stage end is stated. The balcony height is modelled.',
      places: [{ id: '115', label: 'Above Block 115', section: 'beautiful-north' }],
      src: ['https://www.ao-arena.com/premium-experiences/the-beautiful-north'],
    },
    {
      id: 'concert-club', name: 'Concert Club seats', kind: 'hospitality',
      where: { level: 'Lower tier', block: 'Block 103 or 114' },
      seatType: 'Dedicated seats in the bowl, with lounge access',
      view: 'a great view of the stage',
      includes: ['Dedicated membership seats', 'Access to one of the exclusive lounge areas', 'Premium entrance'],
      inc: ['seat', 'lounge', 'fast-track'],
      modelled: 'Blocks 103 and 114 are stated. Rows are not published, so they are modelled.',
      places: [{ id: 'l1', label: 'Lower tier', section: 'l1', blocks: ['103', '114'] }],
      src: ['https://www.ao-arena.com/premium-experiences/concert-club-membership'],
    },
    {
      id: 'the-mezz', name: 'The Mezz', kind: 'hospitality',
      where: { note: '"Right in the heart of the action". Its level is not published.' },
      seatType: 'Padded seats in the bowl in front of a bar and restaurant',
      view: 'panoramic views of the arena bowl',
      includes: ['Premium bar for cocktails and small plates', 'Restaurant with Michelin-curated dishes', 'All-inclusive drinks option', 'Post-show bar'],
      inc: ['seat', 'lounge', 'dining', 'drinks'],
      modelled: 'The name may refer to the mezzanine level, but that is not confirmed. The model places the seats between the two tiers, facing the stage.',
      places: [{ id: 'mid', label: 'Between the tiers (modelled)', section: 'mezz' }],
      src: ['https://www.ao-arena.com/premium-experiences/the-mezz-1'],
    },
    {
      id: 'suite-experience', name: 'Private suite', kind: 'hospitality',
      where: { note: 'Private suite with an in-house chef. The level is not published.' },
      seatType: 'Not published',
      view: 'the best views in the house',
      includes: ['Private pre-show dining and drinks', 'In-house chef', 'Dishes and snacks through the event'],
      inc: ['seat', 'private', 'dining', 'drinks', 'host'],
      modelled: 'The suite level and seat type are not published. The model uses a suite band between the tiers.',
      places: [{ id: 'mid', label: 'Suite band (modelled)', section: 'suites' }],
      src: [AO_PKG],
    },
    { id: 'floor', name: 'Floor', nameByMode: { concert: 'Floor', boxing: 'Floor seats' }, kind: 'standard',
      where: { note: 'Standing, or seated floor blocks usually numbered 1 to 18, left to right as you face the stage.' },
      seatType: 'Standing or floor seats', view: null, includes: ['Entry to the floor'], inc: ['seat'],
      modelled: 'The floor size and the boxing layout are not published, so they are modelled.',
      places: [{ id: 'floor', label: 'Floor', section: 'floor' }], src: [AO_FAQ] },
    { id: 'lower-tier', name: 'Lower tier (100 level)', kind: 'standard',
      where: { level: '100 level', block: 'Blocks 102 to 115', note: 'For end-stage shows the blocks run anticlockwise from 102 to 115.' },
      seatType: 'Standard seat', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'The block order is stated. Block widths and rows are modelled.',
      places: [{ id: 'l1', label: '100 level', section: 'l1', blocks: ['102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112', '113', '114', '115'] }], src: [AO_FAQ] },
    { id: 'upper-tier', name: 'Upper tier (200 level)', kind: 'standard',
      where: { level: '200 level', block: 'Blocks 202 to 215' },
      seatType: 'Standard seat', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'The block numbering follows the 100 level (stated). Block widths and rows are modelled.',
      places: [{ id: 'l2', label: '200 level', section: 'l2', blocks: ['202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215'] }], src: [AO_FAQ] },
  ],

  'co-op-live': [
    {
      id: 'hideaway', name: 'Hideaway', kind: 'hospitality',
      where: { block: 'Section 103', note: 'Seats near the stage.' },
      seatType: 'Seats in the bowl, with a members’ space',
      view: 'premium ticketed location near the stage',
      includes: ['Mediterranean street-food menu', 'Cocktails', 'Live DJs', 'Entry before and after shows'],
      inc: ['seat', 'lounge', 'dining', 'drinks'],
      modelled: 'Section 103 is stated. Its level and rows are not published, so they are modelled on Level 1.',
      places: [{ id: '103', label: 'Section 103', section: 'l1', blocks: ['103'] }],
      src: ['https://www.cooplive.com/co-op-live-unveils-hideaway-a-new-premium-membership-experience-curated-simon-rimmer-h6xz'],
    },
    {
      id: 'gallery-suites', name: 'Gallery Suites', kind: 'hospitality',
      where: { level: 'Level 2', side: 'Left and right sides of the arena' },
      seatType: 'Premium seats in front of a suite',
      view: 'amazing views',
      includes: ['Dedicated entrance', 'Dedicated host', 'Comfort food and small plates', 'Premium seats', 'Level 2 bars and Encore Restaurant access'],
      inc: ['seat', 'private', 'host', 'dining', 'drinks', 'fast-track'],
      modelled: 'Level 2 on the left and right sides is stated. Suite positions along the sides are modelled.',
      places: [
        { id: 'left', label: 'Left side', section: 'l2-left' },
        { id: 'right', label: 'Right side', section: 'l2-right' },
      ],
      src: ['https://www.cooplive.com/gallery-suites-52tn'],
    },
    {
      id: 'the-club', name: 'The Club', kind: 'hospitality',
      where: { level: 'Level 2', note: 'A lounge with designated premium seats.' },
      seatType: 'Designated premium seat',
      view: 'amazing views of the stage',
      includes: ['Lounge before and after the show', 'Fan-favourite menu', 'Designated premium seat'],
      inc: ['seat', 'lounge', 'dining'],
      modelled: 'Level 2 is stated. Where the seats sit on Level 2 is not published, so they are modelled facing the stage.',
      places: [{ id: 'l2', label: 'Level 2', section: 'l2-end' }],
      src: [COOP_CLUB],
    },
    {
      id: 'vodka-lounge', name: 'Vodka lounge with terrace', kind: 'hospitality',
      where: { note: 'A terrace and dance floor. Its level is not published.' },
      seatType: 'Private seating and a terrace',
      view: 'unparalleled views of the stage',
      includes: ['Private seating', 'Bar', 'Dance floor', 'Terrace'],
      inc: ['seat', 'lounge', 'drinks'],
      modelled: 'Its level is not published. Level 4 holds the hospitality lounges on the north and south sides, so the model uses a Level 4 terrace (probable, not confirmed).',
      places: [{ id: 'l4', label: 'Level 4 terrace (modelled)', section: 'l4-terrace' }],
      src: [COOP_ABOUT, COOP_WIKI],
    },
    { id: 'floor', name: 'Floor', nameByMode: { concert: 'Standing floor', boxing: 'Floor seats' }, kind: 'standard',
      where: { level: 'Level 0' }, seatType: 'Standing or floor seats', view: null, includes: ['Entry to the floor'], inc: ['seat'],
      modelled: 'The floor size is not published. The end stage is derived to be at the east end, and the boxing layout is modelled.',
      places: [{ id: 'floor', label: 'Floor', section: 'floor' }], src: [COOP_WIKI] },
    { id: 'level-1', name: 'Level 1 seats', kind: 'standard',
      where: { level: 'Level 1', block: 'Blocks 102 to 114', note: 'The lower tier.' }, seatType: 'Standard seat', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'Blocks 102 to 114 and a row 24 are published, so the tier has at least 24 rows. Block positions are modelled.',
      places: [{ id: 'l1', label: 'Level 1', section: 'l1', blocks: ['102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112', '113', '114'] }],
      src: ['https://www.cooplive.com/pQ5XAUw/visitor-information/accessibility'] },
    { id: 'level-3', name: 'Level 3 seats', kind: 'standard',
      where: { level: 'Level 3', note: 'The upper tier.' }, seatType: 'Standard seat', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'The architect states no seat is more than 95 m from the stage. Rows are modelled within that limit.',
      places: [{ id: 'l3', label: 'Level 3', section: 'l3' }], src: [COOP_WIKI, 'https://populous.com/project/ovg-arena-manchester'] },
  ],

  'royal-albert-hall': [
    {
      id: 'grand-tier-box', name: 'Grand Tier box', kind: 'hospitality',
      where: { level: 'Grand Tier, Level 1' },
      seatType: 'Box seats (chairs with arms)',
      view: null,
      includes: ['Food and drink can be ordered to the box at least 48 hours ahead'],
      inc: ['seat', 'private', 'dining', 'drinks'],
      modelled: 'The Grand Tier is stated as Level 1. Box numbers and positions are not published, so the box you sit in is modelled.',
      places: [{ id: 'gt', label: 'Grand Tier', section: 'box-grand' }],
      src: [RAH_BOX, RAH_PARTNER],
    },
    {
      id: 'loggia-box', name: 'Loggia box', kind: 'hospitality',
      where: { level: 'Loggia', note: 'The Hall does not publish its level number.' },
      seatType: 'Box seats (chairs with arms)',
      view: null,
      includes: ['Food and drink can be ordered to the box'],
      inc: ['seat', 'private', 'dining', 'drinks'],
      modelled: 'The level number is not published. The model puts the Loggia below the Grand Tier, and box positions are modelled.',
      places: [{ id: 'lg', label: 'Loggia', section: 'box-loggia' }],
      src: [RAH_BOX],
    },
    {
      id: 'second-tier-box', name: 'Second Tier box', kind: 'hospitality',
      where: { level: 'Second Tier', note: 'The Hall does not publish its level number.' },
      seatType: 'Box seats (chairs with arms)',
      view: null,
      includes: ['Food and drink can be ordered to the box'],
      inc: ['seat', 'private', 'dining', 'drinks'],
      modelled: 'The level number is not published. The model puts it above the Grand Tier, and box positions are modelled.',
      places: [{ id: 'st', label: 'Second Tier', section: 'box-second' }],
      src: [RAH_BOX],
    },
    { id: 'arena', name: 'Arena', kind: 'standard',
      where: { level: 'Ground floor, Level 0', note: 'Floor level. Standing for some events, seated for others.' },
      seatType: 'Seats with fixed armrests', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'The Arena size and stage position are not published, so they are modelled.',
      places: [{ id: 'arena', label: 'Arena', section: 'arena' }], src: [RAH_WIKI] },
    { id: 'stalls', name: 'Stalls', kind: 'standard',
      where: { note: 'Rebuilt in 2000 with pivoting seats.' }, seatType: 'Seats without armrests', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'Rows and rake are not published, so they are modelled.',
      places: [{ id: 'stalls', label: 'Stalls', section: 'stalls' }], src: [RAH_WIKI] },
    { id: 'rausing-circle', name: 'Rausing Circle', kind: 'standard',
      where: { level: 'Level 3', note: 'Rebuilt in 1996 for more legroom and better sightlines.' }, seatType: 'Seats with fixed armrests', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'Level 3 is stated. Rows and rake are modelled.',
      places: [{ id: 'circle', label: 'Rausing Circle', section: 'circle' }], src: [RAH_WIKI] },
    { id: 'choir', name: 'Choir', kind: 'standard',
      where: { note: 'Seats behind the stage, rebuilt in 2000.' }, seatType: 'Seats with fixed armrests', view: null, includes: ['Seat only'], inc: ['seat'],
      modelled: 'Its exact shape is not published, so it is modelled behind the stage.',
      places: [{ id: 'choir', label: 'Choir', section: 'choir' }], src: [RAH_WIKI] },
    { id: 'gallery', name: 'Gallery', kind: 'standard',
      where: { level: 'Level 5', note: 'The highest level of the Hall.' }, seatType: 'Standing gallery', view: null, includes: ['Entry only'], inc: ['seat'],
      modelled: 'Level 5 is stated. Its depth and height are modelled.',
      places: [{ id: 'gallery', label: 'Gallery', section: 'gallery' }], src: [RAH_WIKI] },
  ],

  'ascot-racecourse': [
    {
      id: 'parade-ring-restaurant', name: 'Parade Ring Restaurant', nameByDay: { raceday: 'Parade Ring Dining Room' }, kind: 'hospitality',
      where: { level: 'Level 2', note: 'Private balconies over the Parade Ring and the track.' },
      whereByDay: { royal: { enclosure: 'Royal Enclosure' }, raceday: { enclosure: 'King Edward VII Enclosure' } },
      seatType: 'Balcony seats',
      view: 'private balconies overlooking the Parade Ring and track',
      includes: [],
      includesByDay: {
        royal: ['Five-course a la carte luncheon', 'Complimentary bar with Champagne and cocktails', 'Private table'],
        raceday: ['Grazing buffet', 'Balcony overlooking the Parade Ring'],
      },
      inc: ['seat', 'dining', 'drinks', 'private'],
      modelled: 'Level 2 is stated. Where the restaurant sits along the 480 m stand is modelled.',
      places: [{ id: 'l2', label: 'Level 2 balcony', section: 'pr-rest' }],
      src: [ASCOT_RE, 'https://media-cdn.cortextech.io/87e94703-4fa3-411e-b65a-586b250096a4.pdf'],
    },
    {
      id: 'the-vista', name: 'The Vista', kind: 'hospitality',
      where: { level: 'Level 2', note: 'A private terrace overlooking the Winning Post.' },
      whereByDay: { royal: { enclosure: 'Royal Enclosure' }, raceday: { enclosure: 'King Edward VII Enclosure' } },
      seatType: 'Terrace seats',
      view: 'private terrace overlooking the Winning Post',
      includes: [],
      includesByDay: { royal: ['Six-course tasting menu', 'Complimentary bar', 'Private table'], raceday: ['Afternoon tea'] },
      inc: ['seat', 'dining', 'drinks', 'private'],
      modelled: 'Level 2 over the Winning Post is stated. The terrace depth is modelled.',
      places: [{ id: 'l2', label: 'Level 2 terrace', section: 'vista' }],
      src: [ASCOT_RE],
    },
    {
      id: 'windsor-forest', name: 'Windsor Forest Restaurant', kind: 'hospitality', days: ['royal'],
      where: { enclosure: 'Royal Enclosure', level: 'Level 2', note: 'A private balcony overlooking the Winning Post.' },
      seatType: 'Balcony seats',
      view: 'private balcony overlooking the Winning Post',
      includes: ['Five-course a la carte lunch and afternoon tea', 'Complimentary bar', 'Private table'],
      inc: ['seat', 'dining', 'drinks', 'private'],
      modelled: 'Level 2 over the Winning Post is stated. Its place beside The Vista is modelled.',
      places: [{ id: 'l2', label: 'Level 2 balcony', section: 'windsor-forest' }],
      src: [ASCOT_RE],
    },
    {
      id: 'panoramic', name: 'The Panoramic', kind: 'hospitality', days: ['royal'],
      where: { enclosure: 'Royal Enclosure Grandstand', level: 'Level 6' },
      seatType: 'Restaurant table',
      view: 'far-reaching views across the racecourse',
      includes: ['Four-course luncheon and afternoon tea', 'Champagne reception', 'Complimentary bar', 'Private table'],
      inc: ['seat', 'dining', 'drinks', 'private'],
      modelled: 'Level 6 is stated. Where it sits along the stand is modelled.',
      places: [{ id: 'l6', label: 'Level 6', section: 'panoramic' }],
      src: ['https://www.ascot.com/hospitality/panoramic'],
    },
    {
      id: 'trackside-restaurant', name: 'Trackside Restaurant', kind: 'hospitality', days: ['royal'],
      where: { enclosure: 'Royal Enclosure', level: 'Concourse level', note: 'Just beyond the Winning Post.' },
      seatType: 'Restaurant table',
      view: null,
      includes: ['Five-course a la carte luncheon with afternoon tea', 'Complimentary bar', 'Private table'],
      inc: ['seat', 'dining', 'drinks', 'private'],
      modelled: '"Just beyond the Winning Post" is stated. The distance beyond it is modelled.',
      places: [{ id: 'conc', label: 'Concourse level', section: 'trackside' }],
      src: [ASCOT_RE],
    },
    {
      id: 'on-5', name: 'ON 5', kind: 'hospitality',
      where: { level: 'Level 5', note: 'Trackside, with floor-to-ceiling glass, a trackside balcony and a rooftop terrace.' },
      whereByDay: { royal: { enclosure: 'Queen Anne Enclosure' }, raceday: { enclosure: 'King Edward VII Enclosure' } },
      seatType: 'Restaurant table',
      view: 'floor to ceiling glass with a view down to the track',
      includes: [],
      includesByDay: { royal: ['Four-course luncheon and afternoon tea', 'Complimentary bar with Champagne', 'Trackside balcony and rooftop terrace', 'Private table'], raceday: [] },
      inc: ['seat', 'dining', 'drinks', 'private'],
      modelled: 'Level 5 is stated. Where it sits along the stand is modelled.',
      places: [{ id: 'l5', label: 'Level 5', section: 'on5' }],
      src: [ASCOT_QA],
    },
    {
      id: 'furlong-restaurant', name: 'Furlong Restaurant', kind: 'hospitality',
      where: { level: '1st Floor', note: 'A private balcony overlooking the finishing straight.' },
      whereByDay: { royal: { enclosure: 'Queen Anne Enclosure' } },
      seatType: 'Balcony seats',
      view: 'private balcony overlooking the finishing straight',
      includes: [],
      includesByDay: { royal: ['Three-course luncheon with chef stations', 'Afternoon tea', 'Complimentary bar with Champagne'], raceday: [] },
      inc: ['seat', 'dining', 'drinks'],
      modelled: 'The 1st Floor balcony is stated for Royal Ascot. Its place along the stand is modelled.',
      places: [{ id: 'l1', label: '1st Floor balcony', section: 'furlong' }],
      src: [ASCOT_QA],
    },
    {
      id: 'the-gallery', name: 'The Gallery', kind: 'hospitality', days: ['royal'],
      where: { enclosure: 'Queen Anne Enclosure', level: '1st Floor', note: 'A private balcony overlooking the Home Straight.' },
      seatType: 'Balcony seats',
      view: 'private balcony overlooking the Home Straight',
      includes: ['Three-course luncheon and afternoon tea', 'Complimentary bar', 'Champagne reception'],
      inc: ['seat', 'dining', 'drinks'],
      modelled: 'The 1st Floor is stated. Its place along the stand is modelled.',
      places: [{ id: 'l1', label: '1st Floor balcony', section: 'gallery' }],
      src: [ASCOT_QA],
    },
    {
      id: 'lawn-club', name: 'The Lawn Club', kind: 'hospitality', days: ['royal'],
      where: { enclosure: 'Queen Anne Enclosure', note: 'A private balcony overlooking the Home Straight and the Royal Procession.' },
      seatType: 'Balcony seats',
      view: 'private balcony overlooking the Home Straight and Royal Procession',
      includes: ['Four-course buffet lunch and afternoon tea from chefs’ tables', 'Complimentary bar', 'Private or shared tables'],
      inc: ['seat', 'dining', 'drinks'],
      modelled: 'The level is not published, so the model uses the 1st Floor. Its place along the stand is modelled.',
      places: [{ id: 'l1', label: 'Balcony (level modelled)', section: 'lawn-club' }],
      src: [ASCOT_QA],
    },
    {
      id: 'the-deck', name: 'The Deck', kind: 'hospitality', days: ['royal'],
      where: { enclosure: 'Queen Anne Enclosure', note: 'At the east end of the Grandstand.' },
      seatType: 'Restaurant table',
      view: null,
      includes: ['Three-course set menu and afternoon tea', 'Complimentary bar'],
      inc: ['seat', 'dining', 'drinks'],
      modelled: 'The east end is stated. The level is not published, so the model uses the 1st Floor.',
      places: [{ id: 'east', label: 'East end of the Grandstand', section: 'deck' }],
      src: [ASCOT_QA],
    },
    {
      id: 'village-restaurant', name: 'Restaurant in The Village', kind: 'hospitality', days: ['royal'],
      where: { enclosure: 'Village Enclosure', note: 'In the centre of the track, looking towards the Grandstand. Listed for Thursday to Saturday in 2027.' },
      seatType: 'Restaurant table',
      view: 'unique race viewing position from the centre of the track',
      includes: ['Three-course luncheon, desserts, cheese and afternoon tea', 'Complimentary bar', 'Private or shared tables'],
      inc: ['seat', 'dining', 'drinks'],
      modelled: 'The centre of the track is stated. Its exact place in the infield is modelled.',
      places: [{ id: 'village', label: 'The Village', section: 'village-rest' }],
      src: [ASCOT_VILLAGE],
    },
    {
      id: 'village-gazebo', name: 'Village Gazebo', kind: 'hospitality', days: ['royal'],
      where: { enclosure: 'Village Enclosure', note: 'A private picket-fenced garden overlooking the home straight.' },
      seatType: 'Garden, no allocated seat',
      view: 'overlooking the home straight',
      includes: ['Private picket-fenced garden', 'Trackside viewing'],
      inc: ['private'],
      modelled: 'Overlooking the home straight from the Village is stated. The exact spot is modelled.',
      places: [{ id: 'village', label: 'The Village', section: 'village-gazebo' }],
      src: [ASCOT_VILLAGE],
    },
    {
      id: 'private-box', name: 'Private box', kind: 'hospitality',
      where: { level: 'Grandstand Levels 2 to 6', note: 'Every box has a private balcony.' },
      whereByDay: { royal: { enclosure: 'Royal Enclosure or Queen Anne Enclosure' }, raceday: { enclosure: 'King Edward VII Enclosure' } },
      seatType: 'Box with a private balcony',
      view: 'private balcony so you won’t miss a second of the action',
      includes: ['Private bar and dining area', 'Private balcony', 'Sit-down or buffet menu', 'Complimentary bar', 'Afternoon tea'],
      inc: ['seat', 'private', 'dining', 'drinks'],
      modelled: 'Levels 2 to 6 are stated. Box positions along the stand are modelled.',
      places: [
        { id: 'l2', label: 'Level 2', section: 'boxes-2' },
        { id: 'l3', label: 'Level 3', section: 'boxes-3' },
        { id: 'l4', label: 'Level 4', section: 'boxes-4' },
        { id: 'l5', label: 'Level 5', section: 'boxes-5' },
        { id: 'l6', label: 'Level 6', section: 'boxes-6' },
      ],
      src: ['https://www.ascot.com/hospitality/royal-ascot-private-boxes'],
    },
    // Enclosures (standard admission) by day.
    { id: 'queen-anne-enclosure', name: 'Queen Anne Enclosure', kind: 'standard',
      where: { note: 'Royal Ascot’s premier public enclosure: Grandstand access, Parade Ring viewing and the Bandstand.' },
      whereByDay: { raceday: { note: 'The entry-level enclosure on other racedays, with trackside viewing lawns and Parade Ring viewing.' } },
      seatType: 'Standing on the lawn', view: null, includes: ['Enclosure entry'], inc: ['seat'],
      modelled: 'The lawn in front of the stand is modelled.',
      places: [{ id: 'lawn', label: 'Trackside lawn', section: 'qa-lawn' }], src: ['https://www.ascot.com/royal-ascot/queen-anne-enclosure', ASCOT_RACEDAY_GUIDE] },
    { id: 'windsor-enclosure', name: 'Windsor Enclosure', kind: 'standard', days: ['royal'],
      where: { note: 'Entry level at Royal Ascot, trackside along the straight mile east of the Grandstand. No Grandstand or Parade Ring access.' },
      seatType: 'Standing trackside', view: null, includes: ['Enclosure entry'], inc: ['seat'],
      modelled: 'East of the Grandstand on the straight mile is stated. The distance east is modelled.',
      places: [{ id: 'rail', label: 'Straight mile rail', section: 'windsor-lawn' }], src: [ASCOT_ROYAL_GUIDE] },
    { id: 'king-edward-vii-enclosure', name: 'King Edward VII Enclosure', kind: 'standard', days: ['raceday'],
      where: { level: 'Level 4', note: 'The premier enclosure on other racedays, with trackside and Parade Ring viewing balconies.' },
      seatType: 'Viewing balcony', view: null, includes: ['Enclosure entry'], inc: ['seat'],
      modelled: 'Level 4 is stated. Its place along the stand is modelled.',
      places: [{ id: 'l4', label: 'Level 4 balcony', section: 'kevii' }], src: [ASCOT_RACEDAY_GUIDE] },
    { id: 'winning-post-enclosure', name: 'Winning Post Enclosure', kind: 'standard', days: ['raceday'],
      where: { note: 'West end of the Grandstand concourse, beside the Winning Post. Open only on King George Day, Shergar Cup and British Champions Day.' },
      seatType: 'Standing on the lawn', view: null, includes: ['Enclosure entry'], inc: ['seat'],
      modelled: 'Beside the Winning Post is stated. The lawn shape is modelled.',
      places: [{ id: 'lawn', label: 'Lawn beside the post', section: 'wp-lawn' }], src: [ASCOT_RACEDAY_GUIDE] },
  ],

  'cheltenham-racecourse': [
    {
      id: 'chez-roux-restaurant', name: 'Chez Roux Restaurant', kind: 'hospitality', days: ['festival'],
      where: { level: 'Third floor', note: 'Balcony views over the finish.' },
      seatType: 'Balcony seats',
      view: 'unbeatable balcony views of the horses charging to victory',
      includes: ['Champagne reception', 'Four-course menu', 'Afternoon tea', 'Wines, beers and spirits'],
      inc: ['seat', 'dining', 'drinks'],
      modelled: 'The third floor is stated. Which stand it is in is not published, so its place is modelled.',
      places: [{ id: 'f3', label: 'Third floor balcony', section: 'chez-roux' }],
      src: [CHEL_REST],
    },
    {
      id: 'chez-roux-boxes', name: 'Chez Roux Private Boxes', kind: 'hospitality', days: ['festival'],
      where: { level: 'Third floor', note: 'A private balcony with a view of the racecourse and its final two fences.' },
      seatType: 'Box with a private balcony',
      view: 'a fantastic view of the racecourse and its final two fences',
      includes: ['Champagne reception', 'Private balcony', 'Canapes', 'Set menu or buffet', 'Afternoon tea', 'Bar including spirits'],
      inc: ['seat', 'private', 'dining', 'drinks'],
      modelled: 'The third floor is stated. Box positions are modelled.',
      places: [{ id: 'f3', label: 'Third floor', section: 'boxes-3' }],
      src: [CHEL_BOXES],
    },
    {
      id: 'cleeve-view-boxes', name: 'Cleeve View Boxes', kind: 'hospitality', days: ['festival'],
      where: { level: 'Second floor', note: 'Alongside the course. The boxes nearest the finishing line.' },
      seatType: 'Seats in front of a private box',
      view: 'a breath-taking view across the course and Cleeve Hill',
      includes: ['Morning coffee', 'Four-course lunch', 'Afternoon tea', 'Bar with house wines, beers and soft drinks'],
      inc: ['seat', 'private', 'dining', 'drinks'],
      modelled: 'The second floor, nearest the line, is stated. Box positions are modelled.',
      places: [{ id: 'f2', label: 'Second floor', section: 'boxes-2' }],
      src: [CHEL_BOXES],
    },
    {
      id: 'final-fence-boxes', name: 'Final Fence Boxes', kind: 'hospitality', days: ['festival'],
      where: { level: 'First floor', note: 'Alongside the course.' },
      seatType: 'Seats in front of a private box',
      view: 'a wonderful view of the action',
      includes: ['Morning coffee', 'Four-course set lunch', 'Afternoon tea', 'Bar with house wines, beers and soft drinks', 'Private bar facility', 'Club admission'],
      inc: ['seat', 'private', 'dining', 'drinks'],
      modelled: 'The first floor is stated. Box positions are modelled.',
      places: [{ id: 'f1', label: 'First floor', section: 'boxes-1' }],
      src: [CHEL_BOXES],
    },
    {
      id: 'final-fence-restaurant', name: 'Final Fence Restaurant', kind: 'hospitality', days: ['festival'],
      where: { note: 'In The Village, overlooking the final fence before the run to the Winning Post.' },
      seatType: 'Restaurant table',
      view: 'overlooks the final fence before the run to the Winning Post',
      includes: ['Champagne reception', 'Four-course grand buffet', 'Afternoon tea', 'Complimentary bar'],
      inc: ['seat', 'dining', 'drinks'],
      modelled: 'Overlooking the final fence is stated. Where The Village sits is not published, so its place is modelled.',
      places: [{ id: 'village', label: 'The Village', section: 'final-fence-rest' }],
      src: [CHEL_REST],
    },
    {
      id: 'panoramic', name: 'Panoramic', kind: 'hospitality', days: ['other'],
      where: { level: 'Fifth level of the grandstand', note: 'Overlooking the Winning Post.' },
      seatType: 'Restaurant table',
      view: 'breathtaking views of the racecourse with Cleeve Hill as backdrop',
      includes: ['Five-course a la carte menu', 'Champagne reception', 'Table service'],
      inc: ['seat', 'dining', 'drinks'],
      modelled: 'The fifth level over the Winning Post is stated. Floor heights are modelled.',
      places: [{ id: 'l5', label: 'Fifth level', section: 'panoramic' }],
      src: ['https://www.thejockeyclub.co.uk/cheltenham/hospitality/restaurant-packages/panoramic-restaurant/'],
    },
    {
      id: 'four-eighty', name: 'Four Eighty', kind: 'hospitality', days: ['other'],
      where: { note: 'Views of the finishing straight. The level is not published.' },
      seatType: 'Not published',
      view: 'unparalleled views of the finishing straight',
      includes: ['Cocktail reception', 'Three-course choice menu', 'Cheese board and afternoon tea', 'Complimentary bar'],
      inc: ['seat', 'dining', 'drinks'],
      modelled: 'The level and seat type are not published, so the model uses a fourth-level table on the straight.',
      places: [{ id: 'l4', label: 'Grandstand (level modelled)', section: 'four-eighty' }],
      src: ['https://www.thejockeyclub.co.uk/cheltenham/hospitality/restaurant-packages/four-eighty/'],
    },
    {
      id: 'private-box', name: 'Private box', kind: 'hospitality', days: ['other'],
      where: { note: 'Overlooking the course and the Winning Post, with a private balcony.' },
      seatType: 'Box with a private balcony',
      view: 'views over the course and extended views',
      includes: ['Private bar'],
      inc: ['seat', 'private', 'drinks'],
      modelled: 'The floor is not published, so the model uses the second floor.',
      places: [{ id: 'f2', label: 'Grandstand box (floor modelled)', section: 'boxes-2' }],
      src: ['https://www.thejockeyclub.co.uk/cheltenham/hospitality/'],
    },
    { id: 'club-enclosure', name: 'Club Enclosure', kind: 'standard',
      where: { note: 'Main grandstand and the Members’ lawn by the Winning Post, plus all Tattersalls areas.' },
      seatType: 'Standing on the lawn or the stand steps', view: null, includes: ['Enclosure entry'], inc: ['seat'],
      modelled: 'The lawn by the post is modelled.',
      places: [{ id: 'lawn', label: 'Members’ lawn', section: 'club-lawn' }], src: [CHEL_ENCL] },
    { id: 'tattersalls', name: 'Tattersalls Enclosure', kind: 'standard', days: ['festival'],
      where: { note: 'The Festival and November Saturday only. In the heart of the racecourse.' },
      seatType: 'Standing', view: null, includes: ['Enclosure entry'], inc: ['seat'],
      modelled: 'Its exact place is not published in text, so it is modelled along the straight.',
      places: [{ id: 'lawn', label: 'Tattersalls lawn', section: 'tatts-lawn' }], src: [CHEL_ENCL] },
    { id: 'club-tatts', name: 'Club/Tatts Enclosure', kind: 'standard', days: ['other'],
      where: { note: 'All other racedays: main grandstand, lawn or Winning Post. Tattersalls is also sold on November Saturday.' },
      seatType: 'Standing', view: null, includes: ['Enclosure entry'], inc: ['seat'],
      modelled: 'The lawn place is modelled.',
      places: [{ id: 'lawn', label: 'Lawn', section: 'club-lawn' }], src: [CHEL_ENCL] },
    { id: 'best-mate-enclosure', name: 'Best Mate Enclosure', kind: 'standard',
      where: { note: 'Directly opposite the main grandstand, beside the finish line, with head-on views.' },
      seatType: 'Standing', view: 'the best views of the racing directly opposite the main grandstand', includes: ['Enclosure entry'], inc: ['seat'],
      modelled: 'Opposite the grandstand by the finish is stated. The exact spot is modelled.',
      places: [{ id: 'opp', label: 'Opposite the grandstand', section: 'best-mate' }], src: [CHEL_ENCL] },
  ],
};

/* ---------- Other spaces at each venue (no seat view in the model) ---------- */

export const OTHER_SPACES = {
  'tottenham-hotspur-stadium': [
  ],
  'the-arena-london': [
    { name: 'The NinetyThird', where: 'A lounge with panoramic views of the full arena. Location not published', src: ARENA_LDN },
    { name: 'Suite 337', where: 'A shared suite lounge', src: ARENA_LDN },
    { name: 'The Deck', where: 'Level 1, bar stool seating with in-seat delivery', src: ARENA_LDN },
    { name: 'Members’ lounge', where: 'For Encore Seat and suite members', src: ARENA_LDN },
  ],
  'ao-arena': [
    { name: 'Electric Lounge', where: 'Level not published', src: AO_PKG },
    { name: 'Signature gin lounge', where: 'Block 117, on the arena concourse', src: AO_PKG },
    { name: 'Skyline', where: 'Its own entrance on the Hunts Bank side', src: AO_PKG },
  ],
  'co-op-live': [
    { name: 'Encore Restaurant', where: 'Level 2 steakhouse for premium guests', src: COOP_CLUB },
    { name: 'Record Room members’ club', where: 'Next to the performers’ Green Room', src: COOP_ABOUT },
    { name: 'Backstage Club', where: 'A general admission upgrade space', src: COOP_ABOUT },
  ],
  'royal-albert-hall': [
    { name: 'Coda Restaurant', where: 'Rausing Circle, Level 3', src: RAH_DINING },
    { name: 'The Elgar Room', where: 'Rausing Circle level, Door 8', src: RAH_DINING },
    { name: 'Verdi Italian Kitchen', where: 'Grand Tier level, Door 12', src: RAH_DINING },
  ],
  'ascot-racecourse': [
    { name: 'Royal Enclosure garden restaurants', where: 'Royal Enclosure Gardens, Royal Ascot', days: ['royal'], src: 'https://www.ascot.com/hospitality/fine-dining-hospitality-royal-ascot' },
    { name: 'Pavilion Restaurant', where: 'Beside the Queen Anne lawns, Royal Ascot', days: ['royal'], src: ASCOT_QA },
  ],
  'cheltenham-racecourse': [
    { name: 'Cleeve Suite', where: 'Views from the foothills of Cleeve Hill. Level not published', days: ['festival'], src: CHEL_REST },
    { name: 'Gold Cup Restaurant', where: 'Near the Hall of Fame and the Parade Ring', days: ['festival'], src: CHEL_REST },
    { name: 'Horseshoe Pavilion', where: 'In The Village', days: ['festival'], src: CHEL_REST },
    { name: 'Moscow Flyer', where: 'Not course-facing', days: ['festival'], src: CHEL_REST },
  ],
};

/* ---------- Venue facts used by the model (stated or derived, with sources) ---------- */

export const VENUE_FACTS = {
  'tottenham-hotspur-stadium': [
    { text: 'Pitch 105 x 68 m, inside a grass area of 114.58 x 79.84 m.', kind: 'stated', src: SPURS_WIKI },
    { text: 'Stands named North, South, East and West. The South Stand is a single tier raked at 34 degrees.', kind: 'stated', src: SPURS_WIKI },
    { text: 'Tiers raked at up to 35 degrees. Stands 33.2 to 35.5 m high.', kind: 'stated', src: 'https://populous.com/wp-content/uploads/2020/09/POPULOUS_THFC_Media-Kit_Digital.pdf' },
    { text: 'Front row 4.9 to 6.9 m from the pitch.', kind: 'stated', src: SPURS_POPULOUS },
    { text: 'Seating levels run from Level 1 (lowest) to Level 5 (highest).', kind: 'derived', src: SPURS_ACCESS },
    { text: 'The grass pitch splits into three trays and slides under the South Stand to reveal an artificial surface used for NFL games and concerts.', kind: 'stated', src: 'https://populous.com/wp-content/uploads/2020/09/POPULOUS_THFC_Media-Kit_Digital.pdf', modes: ['nfl', 'concert'] },
    { text: 'The NFL field sits 1.6 m below the grass surface.', kind: 'stated', src: SPURS_WIKI, modes: ['nfl'] },
    { text: 'NFL field 120 x 53 1/3 yards (about 109.7 x 48.8 m) including the end zones, from the NFL rulebook.', kind: 'standard', src: 'https://operations.nfl.com/the-rules/nfl-rulebook/', modes: ['nfl'] },
  ],
  'the-arena-london': [
    { text: 'Level 1 seating Blocks 101 to 116 and Level 4 seating Blocks 405 to 417, read from the venue’s own bar locations.', kind: 'derived', src: ARENA_LDN },
    { text: 'Club 101 is on Level 1 near the stage, so the stage end is taken to be by Block 101.', kind: 'derived', src: ARENA_LDN },
  ],
  'ao-arena': [
    { text: 'Lower tier is the 100 level and upper tier the 200 level, with seats all the way round.', kind: 'stated', src: AO_FAQ },
    { text: 'For end-stage shows the fixed seats run anticlockwise from Block 102 to Block 115.', kind: 'stated', src: AO_FAQ },
    { text: 'The Beautiful North sits above Block 115 at the stage end.', kind: 'stated', src: 'https://www.ao-arena.com/premium-experiences/the-beautiful-north' },
  ],
  'co-op-live': [
    { text: 'Three tiers on a rectangular plan. Level 0 floor, Level 1 lower tier, Level 2 premium, Level 3 upper tier, Level 4 lounges on the north and south sides.', kind: 'stated', src: COOP_WIKI },
    { text: 'No seat is more than 95 m from the stage.', kind: 'stated', src: 'https://populous.com/project/ovg-arena-manchester' },
    { text: 'For end-stage shows the stage appears to be at the east end.', kind: 'derived', src: COOP_WIKI },
  ],
  'royal-albert-hall': [
    { text: 'An ellipse, 67 x 56 m inside. The dome is 41 m high.', kind: 'stated', src: RAH_WIKI },
    { text: 'Seating areas: Arena, Stalls, Loggia, Grand Tier and Second Tier boxes, Rausing Circle, Choir and Gallery.', kind: 'stated', src: RAH_ACCESS },
    { text: 'Grand Tier is Level 1, Rausing Circle Level 3, Gallery Level 5.', kind: 'stated', src: RAH_ACCESS },
    { text: 'Fibreglass acoustic diffusers have hung below the ceiling since 1969.', kind: 'stated', src: RAH_WIKI },
  ],
  'ascot-racecourse': [
    { text: 'Grandstand 480 m long, facing north over the course.', kind: 'stated', src: 'https://populous.com/project/ascot-racecourse' },
    { text: 'Right-handed triangular round course of about a mile and three quarters, with a two and a half furlong run-in.', kind: 'stated', src: 'https://www.sportinglife.com/racing/news/course-guide-and-key-statistics-for-royal-ascot-2023/201469' },
    { text: 'The winning post is towards the west end of the Grandstand.', kind: 'derived', src: ASCOT_RACEDAY_GUIDE },
    { text: 'The course climbs 73 ft from Swinley Bottom to the winning post.', kind: 'stated', src: 'https://en.wikipedia.org/wiki/Ascot_Racecourse' },
  ],
  'cheltenham-racecourse': [
    { text: 'An uphill finish, in a natural amphitheatre below Cleeve Hill.', kind: 'stated', src: 'https://www.thejockeyclub.co.uk/cheltenham/plan-your-day/racecourse-map/' },
    { text: 'A left-handed course (racing media course guide).', kind: 'stated', src: 'https://www.sportinglife.com/racing/news/cheltenham-festival-course-guide-and-key-statistics/207917' },
    { text: 'The Best Mate Enclosure is directly opposite the main grandstand, beside the finish line.', kind: 'stated', src: CHEL_ENCL },
    { text: 'The Old Course is used on Festival days 1 and 2 and the New Course on days 3 and 4, so the run-in differs by day. The model shows one finish.', kind: 'stated', src: 'https://www.thejockeyclub.co.uk/cheltenham/plan-your-day/racecourse-map/' },
  ],
};

/* ---------- Old hash ids (before 02/11/2026) to new ids ---------- */
// Keyed by venue. A value is an id, or { mode: id } or { day: id } when it depends on the
// mode or the raceday. Old links and Seat Finder hand-offs still send these.
export const AREA_ALIASES = {
  'tottenham-hotspur-stadium': {
    'private-box': { football: 'suites-on-four', concert: 'sideline-suites', nfl: 'sideline-suites' },
    'premium-lounge': { football: 'premium-seats', concert: 'tunnel-club', nfl: 'sideline-suites' },
    pitchside: { football: 'tunnel-club', concert: 'tunnel-club', nfl: 'level-1' }, 'upper-tier': 'level-5', lower: 'level-1',
    floor: { concert: 'pitch-floor', football: 'level-1', nfl: 'level-1' },
  },
  'the-arena-london': { 'private-suite': 'private-suite', 'premium-lower': 'encore-seats', floor: 'floor', 'upper-tier': 'level-4' },
  'ao-arena': { 'private-suite': 'suite-experience', 'premium-lower': 'concert-club', floor: 'floor', 'upper-tier': 'upper-tier' },
  'co-op-live': { 'private-suite': 'gallery-suites', 'premium-lower': 'the-club', floor: 'floor', 'upper-tier': 'level-3' },
  'royal-albert-hall': { 'private-box': 'grand-tier-box', stalls: 'stalls', circle: 'rausing-circle', gallery: 'gallery', 'upper-gallery': 'gallery', floor: 'arena' },
  'ascot-racecourse': {
    'private-box': 'private-box', restaurant: 'on-5',
    'premier-enclosure': { royal: 'the-vista', raceday: 'king-edward-vii-enclosure' },
    lawn: { royal: 'windsor-enclosure', raceday: 'queen-anne-enclosure' },
  },
  'cheltenham-racecourse': {
    'private-box': { festival: 'cleeve-view-boxes', other: 'private-box' },
    restaurant: { festival: 'chez-roux-restaurant', other: 'panoramic' },
    'premier-enclosure': 'club-enclosure',
    lawn: { festival: 'tattersalls', other: 'club-tatts' },
  },
};

/* ---------- Helpers ---------- */

export const daysFor = (venueId) => venueById(venueId)?.days || [];
export const defaultDay = (venueId) => daysFor(venueId)[0]?.id || null;
export const dayLabel = (venueId, dayId) => daysFor(venueId).find((d) => d.id === dayId)?.label || '';

const fits = (a, mode, day) => (!a.modes || !mode || a.modes.includes(mode)) && (!a.days || !day || a.days.includes(day));

export const allAreasFor = (venueId) => VENUE_AREAS[venueId] || [];
export const areasFor = (venueId, { mode = null, day = null } = {}) => allAreasFor(venueId).filter((a) => fits(a, mode, day));

// Old or new id to the id that exists for this venue, mode and day (or null).
export function resolveAreaId(venueId, id, { mode = null, day = null } = {}) {
  if (!id) return null;
  const list = areasFor(venueId, { mode, day });
  if (list.some((a) => a.id === id)) return id;
  let alias = AREA_ALIASES[venueId]?.[id];
  if (alias && typeof alias === 'object') alias = alias[mode] || alias[day] || Object.values(alias)[0];
  if (alias && list.some((a) => a.id === alias)) return alias;
  // An area that exists on another day or mode keeps its id so the caller can switch day.
  return allAreasFor(venueId).some((a) => a.id === id) ? id : null;
}

export const areaById = (venueId, id, opts = {}) => {
  const rid = resolveAreaId(venueId, id, opts);
  return allAreasFor(venueId).find((a) => a.id === rid) || null;
};

export const areaName = (area, modeId, dayId) => area?.nameByMode?.[modeId] || area?.nameByDay?.[dayId] || area?.name || '';
export const includesFor = (area, dayId) => area?.includesByDay?.[dayId] ?? area?.includes ?? [];
export const whereFor = (area, dayId) => ({ ...(area?.where || {}), ...(area?.whereByDay?.[dayId] || {}) });
export const standardAreaFor = (venueId, opts) => areasFor(venueId, opts).find((a) => a.kind === 'standard') || null;
export const hospitalityAreasFor = (venueId, opts) => areasFor(venueId, opts).filter((a) => a.kind === 'hospitality');
export const otherSpacesFor = (venueId, dayId) => (OTHER_SPACES[venueId] || []).filter((s) => !s.days || !dayId || s.days.includes(dayId));

/* ---------- LEGACY (kept for Seat Finder, Matchmaker and Corporate ROI) ---------- */
// Archetype-wide generic seating styles with opinion scores. These are NOT venue facts and
// the viewer no longer shows the scores. Seat Finder still ranks with them and labels them
// "Indicative". The next agent reworking Seat Finder and Matchmaker should move them onto
// VENUE_AREAS and drop these. Old ids here are mapped to real areas by AREA_ALIASES.
export const SCORE_LABELS = {
  view: 'View',
  sound: 'Sound',
  comfort: 'Comfort',
  atmosphere: 'Atmosphere',
  networking: 'Networking',
};

export const AREAS = {
  stadium: [
    { id: 'private-box', name: 'Private box', kind: 'hospitality',
      blurb: 'An enclosed, glass-fronted suite above the action, with your own table and seats out front.',
      bestFor: ['Corporate entertaining', 'Confidential conversations'], inclusions: ['Private dining', 'Dedicated host', 'Balcony seats', 'Private bar'],
      tradeoff: 'The glass softens crowd noise, so step out to the seats for the full atmosphere.',
      position: { elevation: 'High', angle: 'Side-on', distance: 'Mid' }, scores: { view: 8, sound: 6, comfort: 10, atmosphere: 6, networking: 10 } },
    { id: 'premium-lounge', name: 'Premium lounge seats', kind: 'hospitality',
      blurb: 'Padded seats near the halfway line, with a shared lounge behind you for dining before and after.',
      bestFor: ['Client groups', 'Fans who want the classic view'], inclusions: ['Lounge dining', 'Padded seats', 'Fast-track entry', 'Matchday programme'],
      tradeoff: 'A shared lounge, so less privacy than a box.',
      position: { elevation: 'Mid', angle: 'Halfway line', distance: 'Mid' }, scores: { view: 9, sound: 8, comfort: 8, atmosphere: 8, networking: 8 } },
    { id: 'pitchside', name: 'Pitchside club', kind: 'hospitality',
      blurb: 'Low-level seats close to the touchline and the tunnel, with a club lounge a few steps away.',
      bestFor: ['Atmosphere seekers', 'Rewarding staff'], inclusions: ['Club lounge', 'Pitchside seats', 'Fast-track entry'],
      tradeoff: 'A low angle makes the far side of play harder to read.',
      position: { elevation: 'Low', angle: 'Side-on', distance: 'Close' }, scores: { view: 7, sound: 9, comfort: 7, atmosphere: 10, networking: 6 } },
    { id: 'upper-tier', name: 'Upper tier (standard ticket)', kind: 'standard',
      blurb: 'A general admission seat high in the stand. The baseline to compare hospitality against.',
      bestFor: ['Comparison only'], inclusions: ['Seat only'],
      tradeoff: 'Steep, far from the action, with concourse queues at half-time.',
      position: { elevation: 'High', angle: 'Behind the goal', distance: 'Far' }, scores: { view: 6, sound: 7, comfort: 4, atmosphere: 8, networking: 2 } },
  ],
  arena: [
    { id: 'private-suite', name: 'Private suite', kind: 'hospitality',
      blurb: 'Your own suite with lounge seating behind and private seats out front facing the stage.',
      bestFor: ['Corporate entertaining', 'Celebrations'], inclusions: ['Private catering', 'Dedicated host', 'Private seats', 'Private bar'],
      tradeoff: 'Raised and side-on, so the stage is further away than the floor.',
      position: { elevation: 'High', angle: 'Side-on', distance: 'Mid' }, scores: { view: 8, sound: 7, comfort: 10, atmosphere: 6, networking: 10 } },
    { id: 'premium-lower', name: 'Premium lower tier', kind: 'hospitality',
      blurb: 'Raised seats in the lower bowl with a clear sightline over the floor and lounge access.',
      bestFor: ['Couples', 'Small client groups'], inclusions: ['Lounge access', 'Premium seats', 'Fast-track entry'],
      tradeoff: 'Shared lounge at busy times.',
      position: { elevation: 'Low to mid', angle: 'Angled to stage', distance: 'Close' }, scores: { view: 9, sound: 9, comfort: 8, atmosphere: 8, networking: 7 } },
    { id: 'floor', name: 'Floor', kind: 'hospitality', nameByMode: { concert: 'Floor standing', boxing: 'Ringside' },
      blurb: 'On the arena floor, as close as it gets. Standing for concerts, seated ringside for boxing.',
      bestFor: ['Superfans', 'Atmosphere seekers'], inclusions: ['Closest access', 'Early entry'],
      tradeoff: 'Heads in front can block the view if you are not near the front.',
      position: { elevation: 'Floor', angle: 'Facing', distance: 'Closest' }, scores: { view: 7, sound: 10, comfort: 4, atmosphere: 10, networking: 3 } },
    { id: 'upper-tier', name: 'Upper tier (standard ticket)', kind: 'standard',
      blurb: 'A general admission seat at the top of the bowl. The baseline to compare against.',
      bestFor: ['Comparison only'], inclusions: ['Seat only'],
      tradeoff: 'Distant and steep, with the screens doing most of the work.',
      position: { elevation: 'High', angle: 'Side-on', distance: 'Far' }, scores: { view: 5, sound: 7, comfort: 4, atmosphere: 7, networking: 2 } },
  ],
  hall: [
    { id: 'private-box', name: 'Private box', kind: 'hospitality',
      blurb: 'A private box on the curve of the hall, with chairs at the rail and space to entertain behind.',
      bestFor: ['Celebrations', 'Hosting a small group'], inclusions: ['Private box', 'Interval drinks', 'In-box dining options'],
      tradeoff: 'Side-on to the stage from some positions on the curve.',
      position: { elevation: 'Mid', angle: 'Side-on', distance: 'Mid' }, scores: { view: 8, sound: 9, comfort: 9, atmosphere: 8, networking: 9 } },
    { id: 'stalls', name: 'Stalls', kind: 'hospitality',
      blurb: 'Seats close to the level of the stage with a straight-on view of the performers.',
      bestFor: ['Music lovers', 'Couples'], inclusions: ['Premium seats', 'Pre-show dining options'],
      tradeoff: 'Rows further back sit under the tier above.',
      position: { elevation: 'Low', angle: 'Facing', distance: 'Close' }, scores: { view: 9, sound: 9, comfort: 7, atmosphere: 8, networking: 5 } },
    { id: 'circle', name: 'Circle', kind: 'hospitality',
      blurb: 'Raised seats with a full view of the stage, the orchestra and the hall itself.',
      bestFor: ['First visits', 'Seeing the whole hall'], inclusions: ['Reserved seats', 'Interval drinks options'],
      tradeoff: 'Further from the stage than the stalls.',
      position: { elevation: 'Mid to high', angle: 'Facing', distance: 'Mid' }, scores: { view: 8, sound: 8, comfort: 7, atmosphere: 7, networking: 4 } },
    { id: 'gallery', name: 'Upper gallery (standard ticket)', kind: 'standard',
      blurb: 'The highest level of the hall. The baseline to compare against.',
      bestFor: ['Comparison only'], inclusions: ['Entry only'],
      tradeoff: 'Very high and distant, with a partial view from many spots.',
      position: { elevation: 'Very high', angle: 'Varies', distance: 'Far' }, scores: { view: 4, sound: 7, comfort: 3, atmosphere: 6, networking: 2 } },
  ],
  racecourse: [
    { id: 'private-box', name: 'Private box', kind: 'hospitality',
      blurb: 'Your own box in the grandstand with a balcony over the home straight and the finish.',
      bestFor: ['Corporate entertaining', 'Celebrations'], inclusions: ['Private dining', 'Dedicated host', 'Balcony', 'Private bar'],
      tradeoff: 'High up, so you watch the parade ring on screen rather than in person.',
      position: { elevation: 'High', angle: 'Facing the finish', distance: 'Mid' }, scores: { view: 9, sound: 6, comfort: 10, atmosphere: 7, networking: 10 } },
    { id: 'restaurant', name: 'Restaurant with a view', kind: 'hospitality',
      blurb: 'A glass-fronted restaurant table with race-day dining and screens for every race.',
      bestFor: ['Long lunches', 'Mixed groups'], inclusions: ['Fine dining', 'Reserved table', 'Race-day screens'],
      tradeoff: 'Behind glass, so you step outside to feel the roar at the finish.',
      position: { elevation: 'Mid', angle: 'Facing the straight', distance: 'Mid' }, scores: { view: 8, sound: 5, comfort: 9, atmosphere: 6, networking: 8 } },
    { id: 'premier-enclosure', name: 'Premier enclosure terrace', kind: 'hospitality',
      blurb: 'Open-air terrace near the winning post with a hospitality lounge behind.',
      bestFor: ['Atmosphere seekers', 'Groups of friends'], inclusions: ['Enclosure access', 'Lounge dining', 'Terrace seats'],
      tradeoff: 'Open to the weather.',
      position: { elevation: 'Low to mid', angle: 'Near the finish', distance: 'Close' }, scores: { view: 8, sound: 9, comfort: 7, atmosphere: 9, networking: 7 } },
    { id: 'lawn', name: 'Trackside lawn (standard ticket)', kind: 'standard',
      blurb: 'General admission at the rail. The baseline to compare against.',
      bestFor: ['Comparison only'], inclusions: ['Entry only'],
      tradeoff: 'Crowded on big days, standing, and you see each race pass in seconds.',
      position: { elevation: 'Ground', angle: 'Trackside', distance: 'Close' }, scores: { view: 6, sound: 9, comfort: 3, atmosphere: 9, networking: 2 } },
  ],
};
