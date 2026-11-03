// Venue guide: facts about each venue that are not already in js/data/venues.js (products,
// areas) or js/data/seatmaps.js (numbering, access places, steps, armrests). The guide reads
// those two files directly, so the guide, the seat map and the 3D viewer show the same thing.
// Compiled 02/11/2026 from dev/research/venue-facts.json and dev/research/seat-plans.json.
//
// Every fact is { text, status, source, note? }.
//   status: 'stated' (the venue, its architect or a planning document), 'measured' (a
//   published access survey or the venue's own step count), 'standard' (UK or FIFA design
//   guidance), 'modelled' (our own estimate or reading).
//   source: plain words, never a link. "(seen in a search summary)" marks facts the research
//   could only read through a search tool's summary of the page, one step weaker.
// Capacities appear only where the venue itself publishes them. No prices, availability or
// seller names. The Greenwich peninsula arena is only ever "The Arena London".

const S = ' (seen in a search summary)';

export const STATUS_LABEL = { stated: 'stated', measured: 'measured', standard: 'design standard', modelled: 'modelled', derived: 'modelled' };

// Plain-words source for the research URLs kept in js/data/venues.js (code only there).
export function sourceWords(src) {
  const s = String(src || '');
  if (/venue-facts\.json: the-arena-london/.test(s)) return 'the venue';
  const rules = [
    [/hospitality\.tottenhamhotspur|tottenhamhotspur\.com/, 'the club'],
    [/tottenhamhotspurstadium/, 'the stadium'],
    [/populous/, 'the architect, Populous'],
    [/wikipedia|wikidata/, 'Wikipedia'],
    [/accessable/, 'AccessAble access survey'],
    [/ao-arena|cooplive/, 'the venue'],
    [/royalalberthall/, 'the Hall'],
    [/ascot\.com|cortextech/, 'the racecourse'],
    [/thejockeyclub/, 'the racecourse'],
    [/sportinglife/, 'a racing media course guide'],
    [/nfl\.com/, 'the NFL'],
  ];
  const hit = rules.find(([re]) => re.test(s));
  return hit ? hit[1] : 'the venue';
}

export const GUIDE = {
  'tottenham-hotspur-stadium': {
    where: [{ text: 'Tottenham, London. The West Stand faces the High Road.', status: 'stated', source: 'Wikipedia, a secondary source' }],
    staged: [
      { what: 'Football', text: 'Tottenham Hotspur home games on a 105 x 68 m grass pitch. This is the only venue in this guide that stages football.', status: 'stated', source: 'the architect, Populous' },
      { what: 'NFL', text: 'The grass pitch splits into three steel trays and slides under the South Stand in about 25 minutes, showing a synthetic pitch underneath, with separate NFL locker rooms. At least two regular-season games a year.', status: 'stated', source: 'the architect, Populous' },
      { what: 'Concerts', text: 'Stadium concerts on the synthetic surface, with the grass pitch slid away.', status: 'stated', source: `the stadium${S}` },
      { what: 'Boxing', text: 'Boxing nights are staged here too.', status: 'stated', source: `the stadium${S}` },
      { what: 'Rugby union', text: 'Rugby union matches, for example the Saracens Showdown series.', status: 'stated', source: `the stadium${S}` },
    ],
    modelNote: 'Our seat view has football, NFL and concert layouts. It has no boxing or rugby layout.',
    capacity: null,
    capacityNote: 'Not shown. Three different totals are published, by the architect and on Wikipedia, and none by the stadium itself.',
    shape: [
      { text: 'Pitch 105 x 68 m, inside a grass area of 114.58 x 79.84 m including the surrounds.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { text: 'Front row 4.9 to 6.9 m from the pitch.', status: 'stated', source: 'the architect, Populous', note: 'A planning document quoted on Wikipedia gives 7.97 m (East, North and West) and 4.985 m (South). The two sources do not match.' },
      { text: 'Tiers raked at up to 35 degrees.', status: 'stated', source: 'the architect, Populous' },
      { text: 'For NFL games the field sits 1.6 m below the grass pitch.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { text: 'NFL field 120 x 53 1/3 yards (about 109.7 x 48.8 m) including the 10-yard end zones.', status: 'standard', source: 'the NFL rulebook' },
      { text: 'Stadium 48 m high. A cable net roof is held by an elliptical compression ring, with reflective panels underneath that limit the loss of crowd noise.', status: 'stated', source: 'Wikipedia, a secondary source' },
    ],
    levels: [
      { what: 'South Stand', text: 'A single tier, the home end. 34.1 m high and raked at 34 degrees. The pitch slides away underneath it.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { what: 'North Stand', text: 'Three tiers, 35.5 m high. The away section is in the north-east corner.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { what: 'East Stand', text: 'Four tiers, 33.8 m high.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { what: 'West Stand', text: 'Four tiers, 33.2 m high. The players’ tunnel and home dugout side.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { what: 'Levels', text: 'Seats and lounges are referred to by Level 1 (lowest) to Level 5 (highest).', status: 'stated', source: 'the stadium', note: 'The access survey numbers building floors differently (Stratus is on its Levels 8 and 9). Tickets use seating Levels 1 to 5.' },
    ],
    numbering: [
      { text: 'Safe-standing rows: South Stand Rows 1 to 29 in Blocks 248 to 252, 254 and 256 to 260, and Rows 71 to 82 in Blocks 323, 324 and 451 to 453, plus the away section.', status: 'stated', source: 'the club' },
      { text: 'Lounge doors open onto set rows: East Level 2 at Row 6, East Level 3 at Row 7, East Level 4 at Row 3, West Level 3 at Row 7 (Blocks 301 to 311) and West Level 4 at Row 3 (Blocks 407 to 410).', status: 'measured', source: `AccessAble access survey${S}` },
    ],
    access: [
      { text: 'Wheelchair places on Level 1 round the pitch, on Levels 2 and 5 and in premium areas. A companion ticket is booked beside the accessible seat.', status: 'stated', source: 'the stadium' },
      { text: 'Stairs into Level 5: 15 steps of 17 cm in the East Stand, and 15 or more steps of 18 cm in the West Stand.', status: 'measured', source: `AccessAble access survey${S}` },
      { text: 'The Tunnel Club: 11 steps of 16 cm up to Row 3, then 1 to 6 steps to the other rows.', status: 'measured', source: `AccessAble access survey${S}` },
      { text: 'Sensory suite by Block 416 in the North Stand. During concerts, views of the stage from it may be limited.', status: 'stated', source: 'the stadium' },
    ],
    naming: [
      { text: 'The architect called the top-tier lounges the Sky Lounge in 2019. The current product is Stratus.', status: 'stated', source: 'the architect, Populous, and the club' },
      { text: 'Our venue page names The Tunnel Club, The H Club and Sideline Suites for concerts, and East Quarter and Travel Club as shared lounges.', status: 'stated', source: 'our Tottenham Hotspur Stadium page' },
    ],
    gaps: ['Rows per block, seats per row and which end of a row is seat 1.', 'The concert stage end and the standing capacity.', 'The level and stand of Loge On Four.'],
  },

  'the-arena-london': {
    where: [{ text: 'London, on the Greenwich peninsula.', status: 'stated', source: 'Wikipedia, a secondary source' }],
    staged: [
      { what: 'Concerts', text: 'Arena concerts, with a standing or seated floor depending on the show.', status: 'stated', source: 'the venue' },
      { what: 'Darts', text: 'Premier League Darts nights.', status: 'stated', source: `the venue${S}` },
      { what: 'Boxing', text: 'Boxing nights.', status: 'stated', source: `the venue${S}` },
      { what: 'Comedy', text: 'Comedy is listed among the arena’s event types.', status: 'stated', source: `the venue${S}` },
    ],
    modelNote: 'Our seat view has concert and boxing layouts. Darts and comedy are shown with the concert stage.',
    capacity: { text: '20,000 people', status: 'stated', source: 'the venue' },
    extraCounts: [{ text: '96 suites', status: 'stated', source: 'the venue' }],
    shape: [
      { text: 'The arena roof sits under the tent liner, with at least 4 m between them for air and smoke reservoirs.', status: 'stated', source: 'the architect, Populous' },
      { text: 'The floor converts between ice rink, basketball, exhibition and concert layouts, and seating can be changed throughout.', status: 'stated', source: 'Wikipedia, a secondary source' },
    ],
    levels: [
      { what: 'Level 0', text: 'The floor, with a bar at the back.', status: 'stated', source: 'the venue' },
      { what: 'Level 1', text: 'Lower seating, Blocks 101 to 116.', status: 'stated', source: 'the venue' },
      { what: 'Level 4', text: 'Upper seating, Blocks 405 to 417.', status: 'stated', source: 'the venue' },
      { what: 'Getting round', text: 'Lifts and escalators serve floors G to 4. Information desks on Levels 1 and 4.', status: 'measured', source: `AccessAble access survey${S}` },
    ],
    numbering: [],
    access: [
      { text: 'Ambulant accessible seats on every level. Some wheelchair bays have power, and assistance dogs are allowed in the bays.', status: 'stated', source: 'the venue' },
    ],
    naming: [
      { text: 'Several of the arena’s own lounge and bar names carry its commercial brand or a sponsor’s name, so this guide uses plain names.', status: 'stated', source: 'Prestige Corporate Events naming rule' },
      { text: 'Our website has no venue page for this arena, so links go to our live music page and event pages.', status: 'stated', source: 'Prestige Corporate Events' },
    ],
    gaps: ['Bowl shape, floor size and roof height.', 'Rows per block, rake and riser heights.', 'Which level the suites are on, and where The NinetyThird and The LEVEL are.', 'Which end of a row is seat 1.'],
  },

  'ao-arena': {
    where: [{ text: 'Manchester. A bridge level links to the City Rooms entrance, and Skyline has its own entrance on the Hunts Bank side.', status: 'stated', source: 'the venue' }],
    staged: [
      { what: 'Concerts', text: 'End-stage shows, and some shows in the round with seats behind the stage.', status: 'stated', source: 'the venue' },
      { what: 'Boxing', text: 'Boxing nights.', status: 'stated', source: `the venue${S}` },
      { what: 'Darts', text: 'A Premier League Darts night each season, under a deal running to at least 2027.', status: 'stated', source: `the Professional Darts Corporation${S}` },
      { what: 'Comedy', text: 'Comedy shows.', status: 'stated', source: `the venue${S}` },
      { what: 'Tennis', text: 'The Davis Cup Finals group stage in 2024.', status: 'stated', source: `the venue${S}` },
    ],
    modelNote: 'Our seat view has concert and boxing layouts. Darts and comedy are shown with the concert stage; tennis is not modelled.',
    capacity: { text: '23,000 people', status: 'stated', source: 'the venue' },
    shape: [
      { text: 'Seating all the way round on both tiers.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { text: 'The main roof truss spans 105 m.', status: 'stated', source: 'Wikipedia, a secondary source' },
    ],
    levels: [
      { what: 'Levels', text: 'Event floor, lower tier (100 level) and upper tier (200 level), plus a mezzanine level, a bridge level and the concourse.', status: 'stated', source: 'the venue' },
      { what: 'Lower tier', text: 'Row X is 10 steps down from the concourse and Row A is 73 steps down. The first 10 steps have a handrail.', status: 'measured', source: 'the venue’s access guide' },
      { what: 'Upper tier', text: 'It starts 16 steps above the concourse. Row R is 3 steps down from the top. The handrail is intermittent and a lift goes to the top.', status: 'measured', source: 'the venue’s access guide', note: 'The guide’s table jumps 6 steps between Rows M and N, possibly a cross aisle or a typing slip.' },
    ],
    numbering: [],
    access: [
      { text: 'Each access platform takes one wheelchair user and a companion. There is also a camera platform.', status: 'stated', source: 'the venue' },
    ],
    naming: [
      { text: 'Skyline was formerly called Sky Lounge. The Mezz is a product, not necessarily on the mezzanine level.', status: 'stated', source: 'the venue' },
      { text: 'Our venue page calls the private suite The Suite Experience.', status: 'stated', source: 'our AO Arena page' },
    ],
    gaps: ['Floor size, roof height, rake and riser heights.', 'Seats per row and aisle positions.', 'The levels of The Mezz, the suites, Electric Lounge and Skyline.'],
  },

  'co-op-live': {
    where: [{ text: 'Manchester.', status: 'stated', source: 'Wikipedia, a secondary source' }],
    staged: [
      { what: 'Concerts', text: 'End-stage, centre-stage and 360-degree shows.', status: 'stated', source: `the venue${S}` },
      { what: 'Boxing', text: 'Boxing nights, including British and Commonwealth title fights.', status: 'stated', source: `the venue${S}` },
      { what: 'Comedy', text: 'Comedy shows.', status: 'stated', source: `the venue${S}` },
      { what: 'Wrestling', text: 'WWE Friday Night Smackdown.', status: 'stated', source: `the venue${S}` },
    ],
    modelNote: 'Our seat view has concert and boxing layouts. Comedy is shown with the concert stage.',
    capacity: null,
    capacityNote: 'Not shown. The published totals come from the architect and a planning document quoted on Wikipedia, not from the venue itself.',
    shape: [
      { text: 'Three tiers on a rectangular plan.', status: 'stated', source: 'the architect, Populous' },
      { text: 'No seat is more than 95 m from the stage, and the rear tier is up to 23 m closer than in comparable venues.', status: 'stated', source: 'the architect, Populous' },
      { text: 'The ceiling is described as low, but no height is given.', status: 'stated', source: 'the venue' },
      { text: 'For end-stage shows the stage appears to be at the east end.', status: 'modelled', source: 'our reading of a planning document quoted on Wikipedia' },
    ],
    levels: [
      { what: 'Level 0', text: 'Standing floor, with retractable seating.', status: 'stated', source: 'Wikipedia, quoting the planning statement' },
      { what: 'Level 1', text: 'Lower tier, retractable seating. At least 24 rows.', status: 'stated', source: 'Wikipedia and the venue' },
      { what: 'Level 2', text: 'Premium seating, Gallery Suites and The Club.', status: 'stated', source: 'Wikipedia and the venue' },
      { what: 'Level 3', text: 'Upper tier. Three steps per row, with handrails that are not continuous.', status: 'stated', source: `the venue${S}` },
      { what: 'Level 4', text: 'Lounges on the north and south sides.', status: 'stated', source: 'Wikipedia, quoting the planning statement' },
    ],
    numbering: [
      { text: 'Floor Blocks D1 and D2: 3 steps, then 2 steps per row.', status: 'stated', source: `the venue${S}` },
    ],
    access: [
      { text: 'Wheelchair platforms on Row 24 of Blocks 102 to 114, and Level 3 platforms 307AP and 314AP.', status: 'stated', source: `the venue${S}` },
    ],
    naming: [
      { text: 'The Club was called AMP Club before. Hideaway replaced the Decibel Lounge in October 2024. One suite is named after the company that sells it, so it is left out here.', status: 'stated', source: 'the venue' },
      { text: 'Our Co-op Live page describes private suites, a Level 2 club lounge and a pre-show restaurant without product names, so the names below are the venue’s own.', status: 'stated', source: 'our Co-op Live page' },
    ],
    gaps: ['Ceiling height, floor size, rake and riser heights.', 'The number of suites.', 'The levels of Hideaway, the Record Room and the vodka lounge.', 'The stage end, as stated by the venue.'],
  },

  'royal-albert-hall': {
    where: [{ text: 'London.', status: 'stated', source: 'Wikipedia, a secondary source' }],
    staged: [
      { what: 'Classical', text: 'The BBC Proms, held at the Hall since 1941.', status: 'stated', source: `the Hall${S}` },
      { what: 'Concerts, comedy, circus, dance and film', text: 'All listed in the Hall’s programme, with in-the-round and big-screen layouts for some events.', status: 'stated', source: `the Hall${S}` },
      { what: 'Boxing', text: 'Professional boxing returned in 2011, 2012 and on 08/03/2019.', status: 'stated', source: `the Hall${S}` },
      { what: 'Tennis', text: 'Champions Tennis, a regular event since 1970.', status: 'stated', source: `the Hall${S}` },
    ],
    modelNote: 'Our seat view shows the standard layout with the stage at one end.',
    capacity: null,
    capacityNote: 'Not shown. The total we found comes from Wikipedia, not from the Hall itself.',
    shape: [
      { text: 'An ellipse in plan: 83 x 72 m outside, 67 x 56 m inside. The dome is 41 m high.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { text: 'Fibreglass diffuser discs have hung below the ceiling since 1969 for the acoustics.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { text: 'The Stalls and the Choir were rebuilt in 2000 with pivoting seats. The Circle was rebuilt in 1996 for more legroom and better sightlines.', status: 'stated', source: 'Wikipedia, a secondary source' },
    ],
    levels: [
      { what: 'Levels', text: 'Ground floor Level 0 (Arena and Stalls), Grand Tier Level 1, Second Tier Level 2, Rausing Circle Level 3, Gallery Level 5. The Loggia level number was not found.', status: 'stated', source: `the Hall${S}` },
      { what: 'Getting round', text: 'Lifts at Doors 1 and 8 serve every level from the basement to the Gallery.', status: 'stated', source: `the Hall${S}` },
    ],
    // The Second Tier level number is stated in the newer research; the product card shows it.
    areaWhere: { 'second-tier-box': { level: 'Second Tier, Level 2', status: 'stated', source: `the Hall${S}` } },
    numbering: [],
    access: [
      { text: 'Ramped entrances at Doors 1, 3, 8 and 9, and the Box Office at Door 12.', status: 'stated', source: `the Hall${S}` },
    ],
    naming: [
      { text: 'The Circle is officially the Rausing Circle. The Grand Tier is Level 1.', status: 'stated', source: 'the Hall' },
      { text: 'Our venue page calls the boxes Loggia Boxes, Grand Tier Boxes and Second Tier Boxes. Box sizes are not shown here.', status: 'stated', source: 'our Royal Albert Hall page' },
    ],
    gaps: ['Arena floor size, rows per section and rake.', 'The full list of Stalls section letters, and box numbering by tier.', 'The Loggia level number.'],
  },

  'ascot-racecourse': {
    where: [{ text: 'Ascot, Berkshire. The grandstand faces north over the course.', status: 'stated', source: 'the architect, Populous' }],
    staged: [
      { what: 'Horse racing', text: 'Flat and jump racing: Royal Ascot (the Royal Meeting) and other racedays through the year.', status: 'stated', source: `the racecourse${S}` },
    ],
    modelNote: 'Our seat view shows a race day from the grandstand, the lawns and the Village, with a raceday picker.',
    capacity: null,
    capacityNote: 'Not shown. The grandstand seat total we found comes from the architect, not from the racecourse itself.',
    shape: [
      { text: 'A right-handed, triangular round course of about a mile and three quarters, with a run-in of two and a half furlongs.', status: 'stated', source: 'a racing media course guide' },
      { text: 'A straight mile course, moved in 1954 to make room for spectators.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { text: 'The jumps course is laid out inside the flat course, about 1 mile 5 furlongs round.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { text: 'The course climbs 73 ft from Swinley Bottom, its lowest point, to the winning post, its highest.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { text: 'Grandstand 480 m long, a shallow-arched shape facing north over the course.', status: 'stated', source: 'the architect, Populous' },
      { text: 'The winning post is towards the west end of the grandstand.', status: 'modelled', source: 'our reading of the racecourse’s Winning Post Enclosure description' },
      { text: 'The parade ring was moved to the front of the grandstand. The Parade Ring Restaurant on Level 2 has balconies over both the Parade Ring and the track.', status: 'stated', source: 'the architect, Populous, and the racecourse' },
    ],
    levels: [
      { what: 'Grandstand floors', text: 'Concourse level, 1st Floor, then Levels 2 to 6. Private boxes are on Levels 2 to 6.', status: 'stated', source: 'the racecourse’s accessibility map (January 2026)' },
      { what: 'Concourse', text: 'Numbered aisles (for example 2, 3, 10, 15, 16, 20 and 21) above the standing steps. The King Edward VII Enclosure balcony on Level 4 is reached through Doors 2, 4, 6, 8, 10 and 12. Lifts serve all floors.', status: 'stated', source: 'the racecourse’s accessibility map (January 2026)' },
    ],
    numbering: [
      { text: 'Box types: Single (10 or 12 seats), Terrace (12), 20 seat, Double (24), Triple (30 or 36), Quad (48) and Long (72). The same page also gives 108 as a maximum.', status: 'stated', source: 'the racecourse' },
      { text: '265 box numbers in all. There are fewer boxes to hire, because Double, Triple, Quad and Long boxes combine numbers.', status: 'modelled', source: 'our count from the racecourse’s box numbers' },
      { text: 'Sofas, tables, chairs and picnic furniture across the course are first come, first served.', status: 'stated', source: 'the racecourse’s accessibility guide (January 2026)' },
    ],
    access: [
      { text: 'Wheelchair viewing in the King Edward VII Enclosure: the Level 4 balcony, a raised ramp at the rail and concourse aisles 2, 3, 20 and 21.', status: 'stated', source: 'the racecourse’s accessibility map (January 2026)' },
      { text: 'Wheelchair viewing in the Queen Anne Enclosure: a raised ramp, concourse aisles 10 and 15, under the Royal Box, and beside the Parade Ring and Pre-Parade Ring.', status: 'stated', source: 'the racecourse’s accessibility map (January 2026)' },
    ],
    days: {
      intro: 'Royal Ascot and other racedays use different enclosures, and some restaurants change name or enclosure between them. Pick the day to see what applies.',
      notes: [
        { text: 'Royal Ascot: the Royal Enclosure is for members and their guests; the Queen Anne Enclosure is the premier public enclosure; the Village Enclosure sits in the centre of the track (listed for Thursday to Saturday in 2027); the Windsor Enclosure is entry level, trackside on the straight mile, with no grandstand access.', status: 'stated', source: 'the racecourse' },
        { text: 'Other racedays: the King Edward VII Enclosure on Level 4 is the premier enclosure; the Queen Anne Enclosure is entry level; the Winning Post Enclosure opens only on King George Day, Shergar Cup and British Champions Day.', status: 'stated', source: 'the racecourse' },
        { text: 'Our venue page names the King Edward VII Enclosure as the hospitality base on a standard race day, with private boxes. Our British Champions Day 2027 page offers the Furlong Restaurant.', status: 'stated', source: 'our Ascot Racecourse and British Champions Day pages' },
      ],
    },
    naming: [
      { text: 'The Queen Anne Enclosure is the premier public enclosure at Royal Ascot but entry level on other racedays.', status: 'stated', source: 'the racecourse' },
      { text: 'Panoramic is a restaurant name at both Ascot (Level 6) and Cheltenham (fifth level).', status: 'stated', source: 'both racecourses' },
    ],
    gaps: ['Grandstand rake, rows and step heights.', 'Where each box group sits along the stand.', 'Restaurant table plans.'],
  },

  'cheltenham-racecourse': {
    where: [{ text: 'Cheltenham, Gloucestershire, in a natural amphitheatre below Cleeve Hill on the Cotswold escarpment.', status: 'stated', source: 'the racecourse' }],
    staged: [
      { what: 'Horse racing', text: 'Jump racing: The Festival, and the November, December, New Year’s Day, Trials Day and April meetings.', status: 'stated', source: 'the racecourse' },
    ],
    modelNote: 'Our seat view shows a race day with one finish, with a Festival or other raceday picker.',
    capacity: { text: 'Princess Royal Stand: about 7,000, with standing steps for about 3,000 at the front', status: 'stated', source: 'the racecourse', note: 'Wikipedia gives 6,500.' },
    shape: [
      { text: 'A left-handed course with an uphill finish, the Cheltenham Hill.', status: 'stated', source: 'the racecourse and a racing media course guide' },
      { text: 'Old Course: The Showcase, The November Meeting and Festival days 1 and 2. New Course: the Christmas Meeting, New Year’s Day, Trials Day, the April Meeting and Festival days 3 and 4. The Cross Country course is inside the main course.', status: 'stated', source: 'the racecourse' },
      { text: 'The New Course has the longer steeplechase run-in.', status: 'stated', source: 'Wikipedia, a secondary source' },
      { text: 'The Best Mate Enclosure is directly opposite the main grandstand, beside the finish line.', status: 'stated', source: 'the racecourse' },
    ],
    levels: [
      { what: 'Main grandstand', text: 'Final Fence Boxes on the first floor, Cleeve View Boxes on the second, Chez Roux on the third and Panoramic on the fifth level.', status: 'stated', source: 'the racecourse' },
      { what: 'Princess Royal Stand', text: '11 boxes on Level 3 plus the Royal Box. The Cheltenham Club Room is on its top floor and public steps are on its front.', status: 'measured', source: `AccessAble access survey and the racecourse${S}` },
    ],
    numbering: [
      { text: 'Racecourse View, by the finish in the main grandstand, is the only reserved, numbered public seating. Rows are lettered, and Row R onwards is sheltered from straight rain. Seats 19 to 42 face the finishing post, 42 onwards the final straight, and Seat 77 is the last sheltered seat. Stairs only.', status: 'stated', source: 'the racecourse' },
      { text: 'Box numbers: main grandstand Level 4 about 4008 to 4070. Level 5 has 23 boxes, numbered 5030 to 5052, 5054 to 5066 and 5068 to 5076. Which product uses which box is not published.', status: 'measured', source: `AccessAble access survey${S}` },
      { text: 'In the National Hunt Rooms on Level 3, one row is 55 cm wide (the clear space between rows).', status: 'measured', source: `AccessAble access survey${S}` },
    ],
    access: [
      { text: 'Wheelchair viewing areas A to I are mapped round the course (October 2023 map).', status: 'stated', source: 'the racecourse' },
      { text: 'Princess Royal Stand, Cheltenham Club (Level 4): 4 medium steps down to the front of the viewing area, with no handrails.', status: 'measured', source: `AccessAble access survey${S}` },
    ],
    days: {
      intro: 'The Festival and other racedays have different restaurants and enclosures. Pick the day to see what applies.',
      notes: [
        { text: 'The Festival: Chez Roux Restaurant and Private Boxes, Cleeve View Boxes, Final Fence Boxes and the Final Fence Restaurant. Tattersalls is open at The Festival and on November Saturday only.', status: 'stated', source: 'the racecourse' },
        { text: 'Other racedays: Panoramic, Four Eighty and private boxes. The Club/Tatts Enclosure covers the main grandstand, the lawn and the Winning Post.', status: 'stated', source: 'the racecourse' },
        { text: 'Our Cheltenham page describes the two formats we arrange ourselves, restaurant packages and private boxes, rather than the racecourse’s own package names. The names below are the racecourse’s own.', status: 'stated', source: 'our Cheltenham Racecourse page' },
      ],
    },
    naming: [
      { text: 'The Final Fence Restaurant and the Final Fence Boxes are different products. Chez Roux is both a restaurant and a box package.', status: 'stated', source: 'the racecourse' },
      { text: 'The Old Course and the New Course alternate across Festival days, so the run-in differs by day.', status: 'stated', source: 'the racecourse' },
    ],
    gaps: ['Course length and run-in lengths from an authoritative source.', 'Grandstand rake and rows.', 'Which stand each restaurant and box is in, and restaurant table plans.'],
  },
};

// What the guide says about seat sizes everywhere (no venue publishes them).
export const SIZES_NOTE = 'No venue in this guide publishes its seat width, row depth or seat height. The figures below are UK and FIFA design standards, and the sizes our model uses, each labelled.';
