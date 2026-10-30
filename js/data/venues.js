// Shared venue, seating-area and event-type data. Owned by the main session.
// Agents may ADD fields they need (for example camera presets live in js/viewer/),
// but must not rename ids, because hashes and cross-tool links depend on them.
//
// Content rules baked in here:
// - Tier-one restricted venues are deliberately absent and must never be added.
// - The O2 appears only as "The Arena London". Wembley is not listed.
// - No capacities, box numbers, distances in metres or prices: nothing we cannot source.
// - Scores are indicative opinions for comparison, always labelled as such in the UI.

export const EVENT_TYPES = [
  { id: 'football', label: 'Football', category: 'sport', archetypes: ['stadium'] },
  { id: 'rugby', label: 'Rugby', category: 'sport', archetypes: ['stadium'] },
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
  stadium: [
    { id: 'football', label: 'Football' },
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

export const VENUES = [
  { id: 'tottenham-hotspur-stadium', name: 'Tottenham Hotspur Stadium', city: 'London', archetype: 'stadium', icon: 'stadium' },
  { id: 'the-arena-london', name: 'The Arena London', city: 'London', archetype: 'arena', icon: 'music' },
  { id: 'ao-arena', name: 'AO Arena', city: 'Manchester', archetype: 'arena', icon: 'music' },
  { id: 'co-op-live', name: 'Co-op Live', city: 'Manchester', archetype: 'arena', icon: 'music' },
  { id: 'royal-albert-hall', name: 'Royal Albert Hall', city: 'London', archetype: 'hall', icon: 'hall' },
  { id: 'ascot-racecourse', name: 'Ascot Racecourse', city: 'Berkshire', archetype: 'racecourse', icon: 'racing', racing: 'flat' },
  { id: 'cheltenham-racecourse', name: 'Cheltenham Racecourse', city: 'Gloucestershire', archetype: 'racecourse', icon: 'racing', racing: 'jumps' },
];

export const venueById = (id) => VENUES.find((v) => v.id === id) || null;

// Seating areas per archetype. "position" is qualitative on purpose.
// kind: 'hospitality' for packages Prestige would talk about, 'standard' for the
// general-admission baseline a buyer compares against.
export const AREAS = {
  stadium: [
    {
      id: 'private-box', name: 'Private box', kind: 'hospitality',
      blurb: 'An enclosed, glass-fronted suite above the action, with your own table, host and balcony seats.',
      bestFor: ['Corporate entertaining', 'Confidential conversations'],
      inclusions: ['Private dining', 'Dedicated host', 'Balcony seats', 'Private bar'],
      tradeoff: 'The glass softens crowd noise, so step out to the balcony seats for the full atmosphere.',
      position: { elevation: 'High', angle: 'Side-on', distance: 'Mid' },
      scores: { view: 8, sound: 6, comfort: 10, atmosphere: 6, networking: 10 },
    },
    {
      id: 'premium-lounge', name: 'Premium lounge seats', kind: 'hospitality',
      blurb: 'Padded seats near the halfway line, with a shared lounge behind you for dining before and after.',
      bestFor: ['Client groups', 'Fans who want the classic view'],
      inclusions: ['Lounge dining', 'Padded seats', 'Fast-track entry', 'Matchday programme'],
      tradeoff: 'A shared lounge, so less privacy than a box.',
      position: { elevation: 'Mid', angle: 'Halfway line', distance: 'Mid' },
      scores: { view: 9, sound: 8, comfort: 8, atmosphere: 8, networking: 8 },
    },
    {
      id: 'pitchside', name: 'Pitchside club', kind: 'hospitality',
      blurb: 'Low-level seats close to the touchline and the tunnel, with a club lounge a few steps away.',
      bestFor: ['Atmosphere seekers', 'Rewarding staff'],
      inclusions: ['Club lounge', 'Pitchside seats', 'Fast-track entry'],
      tradeoff: 'A low angle makes the far side of play harder to read.',
      position: { elevation: 'Low', angle: 'Side-on', distance: 'Close' },
      scores: { view: 7, sound: 9, comfort: 7, atmosphere: 10, networking: 6 },
    },
    {
      id: 'upper-tier', name: 'Upper tier (standard ticket)', kind: 'standard',
      blurb: 'A general admission seat high in the stand. The baseline to compare hospitality against.',
      bestFor: ['Comparison only'],
      inclusions: ['Seat only'],
      tradeoff: 'Steep, far from the action, with concourse queues at half-time.',
      position: { elevation: 'High', angle: 'Behind the goal', distance: 'Far' },
      scores: { view: 6, sound: 7, comfort: 4, atmosphere: 8, networking: 2 },
    },
  ],
  arena: [
    {
      id: 'private-suite', name: 'Private suite', kind: 'hospitality',
      blurb: 'Your own suite with lounge seating behind and private seats out front facing the stage.',
      bestFor: ['Corporate entertaining', 'Celebrations'],
      inclusions: ['Private catering', 'Dedicated host', 'Private seats', 'Private bar'],
      tradeoff: 'Raised and side-on, so the stage is further away than the floor.',
      position: { elevation: 'High', angle: 'Side-on', distance: 'Mid' },
      scores: { view: 8, sound: 7, comfort: 10, atmosphere: 6, networking: 10 },
    },
    {
      id: 'premium-lower', name: 'Premium lower tier', kind: 'hospitality',
      blurb: 'Raised seats in the lower bowl with a clear sightline over the floor and lounge access.',
      bestFor: ['Couples', 'Small client groups'],
      inclusions: ['Lounge access', 'Premium seats', 'Fast-track entry'],
      tradeoff: 'Shared lounge at busy times.',
      position: { elevation: 'Low to mid', angle: 'Angled to stage', distance: 'Close' },
      scores: { view: 9, sound: 9, comfort: 8, atmosphere: 8, networking: 7 },
    },
    {
      id: 'floor', name: 'Floor', kind: 'hospitality',
      nameByMode: { concert: 'Floor standing', boxing: 'Ringside' },
      blurb: 'On the arena floor, as close as it gets. Standing for concerts, seated ringside for boxing.',
      bestFor: ['Superfans', 'Atmosphere seekers'],
      inclusions: ['Closest access', 'Early entry'],
      tradeoff: 'Heads in front can block the view if you are not near the front.',
      position: { elevation: 'Floor', angle: 'Facing', distance: 'Closest' },
      scores: { view: 7, sound: 10, comfort: 4, atmosphere: 10, networking: 3 },
    },
    {
      id: 'upper-tier', name: 'Upper tier (standard ticket)', kind: 'standard',
      blurb: 'A general admission seat at the top of the bowl. The baseline to compare against.',
      bestFor: ['Comparison only'],
      inclusions: ['Seat only'],
      tradeoff: 'Distant and steep, with the screens doing most of the work.',
      position: { elevation: 'High', angle: 'Side-on', distance: 'Far' },
      scores: { view: 5, sound: 7, comfort: 4, atmosphere: 7, networking: 2 },
    },
  ],
  hall: [
    {
      id: 'private-box', name: 'Private box', kind: 'hospitality',
      blurb: 'A private box on the curve of the hall, with chairs at the rail and space to entertain behind.',
      bestFor: ['Celebrations', 'Hosting a small group'],
      inclusions: ['Private box', 'Interval drinks', 'In-box dining options'],
      tradeoff: 'Side-on to the stage from some positions on the curve.',
      position: { elevation: 'Mid', angle: 'Side-on', distance: 'Mid' },
      scores: { view: 8, sound: 9, comfort: 9, atmosphere: 8, networking: 9 },
    },
    {
      id: 'stalls', name: 'Stalls', kind: 'hospitality',
      blurb: 'Seats on the level of the stage with a straight-on view of the performers.',
      bestFor: ['Music lovers', 'Couples'],
      inclusions: ['Premium seats', 'Pre-show dining options'],
      tradeoff: 'Rows further back sit under the tier above.',
      position: { elevation: 'Low', angle: 'Facing', distance: 'Close' },
      scores: { view: 9, sound: 9, comfort: 7, atmosphere: 8, networking: 5 },
    },
    {
      id: 'circle', name: 'Circle', kind: 'hospitality',
      blurb: 'Raised seats with a full view of the stage, the orchestra and the hall itself.',
      bestFor: ['First visits', 'Seeing the whole hall'],
      inclusions: ['Reserved seats', 'Interval drinks options'],
      tradeoff: 'Further from the stage than the stalls.',
      position: { elevation: 'Mid to high', angle: 'Facing', distance: 'Mid' },
      scores: { view: 8, sound: 8, comfort: 7, atmosphere: 7, networking: 4 },
    },
    {
      id: 'gallery', name: 'Upper gallery (standard ticket)', kind: 'standard',
      blurb: 'The highest level of the hall. The baseline to compare against.',
      bestFor: ['Comparison only'],
      inclusions: ['Entry only'],
      tradeoff: 'Very high and distant, with a partial view from many spots.',
      position: { elevation: 'Very high', angle: 'Varies', distance: 'Far' },
      scores: { view: 4, sound: 7, comfort: 3, atmosphere: 6, networking: 2 },
    },
  ],
  racecourse: [
    {
      id: 'private-box', name: 'Private box', kind: 'hospitality',
      blurb: 'Your own box in the grandstand with a balcony over the home straight and the finish.',
      bestFor: ['Corporate entertaining', 'Celebrations'],
      inclusions: ['Private dining', 'Dedicated host', 'Balcony', 'Private bar'],
      tradeoff: 'High up, so you watch the parade ring on screen rather than in person.',
      position: { elevation: 'High', angle: 'Facing the finish', distance: 'Mid' },
      scores: { view: 9, sound: 6, comfort: 10, atmosphere: 7, networking: 10 },
    },
    {
      id: 'restaurant', name: 'Restaurant with a view', kind: 'hospitality',
      blurb: 'A glass-fronted restaurant table with race-day dining and screens for every race.',
      bestFor: ['Long lunches', 'Mixed groups'],
      inclusions: ['Fine dining', 'Reserved table', 'Race-day screens'],
      tradeoff: 'Behind glass, so you step outside to feel the roar at the finish.',
      position: { elevation: 'Mid', angle: 'Facing the straight', distance: 'Mid' },
      scores: { view: 8, sound: 5, comfort: 9, atmosphere: 6, networking: 8 },
    },
    {
      id: 'premier-enclosure', name: 'Premier enclosure terrace', kind: 'hospitality',
      blurb: 'Open-air terrace seats near the winning post with a hospitality lounge behind.',
      bestFor: ['Atmosphere seekers', 'Groups of friends'],
      inclusions: ['Enclosure access', 'Lounge dining', 'Terrace seats'],
      tradeoff: 'Open to the weather.',
      position: { elevation: 'Low to mid', angle: 'Near the finish', distance: 'Close' },
      scores: { view: 8, sound: 9, comfort: 7, atmosphere: 9, networking: 7 },
    },
    {
      id: 'lawn', name: 'Trackside lawn (standard ticket)', kind: 'standard',
      blurb: 'General admission at the rail. The baseline to compare against.',
      bestFor: ['Comparison only'],
      inclusions: ['Entry only'],
      tradeoff: 'Crowded on big days, standing, and you see each race pass in seconds.',
      position: { elevation: 'Ground', angle: 'Trackside', distance: 'Close' },
      scores: { view: 6, sound: 9, comfort: 3, atmosphere: 9, networking: 2 },
    },
  ],
};

export const areasFor = (venueId) => {
  const v = venueById(venueId);
  return v ? AREAS[v.archetype] : [];
};

export const areaById = (venueId, areaId) => areasFor(venueId).find((a) => a.id === areaId) || null;

export const areaName = (area, modeId) => (area?.nameByMode?.[modeId]) || area?.name || '';

export const SCORE_LABELS = {
  view: 'View',
  sound: 'Sound',
  comfort: 'Comfort',
  atmosphere: 'Atmosphere',
  networking: 'Networking',
};
