// Data for Where Should I Sit? and Occasion Matchmaker. Owned by the shell agent.
// Every number here is an indicative opinion used for ranking, never a fact about a
// venue. No capacities, prices or distances. Golf is deliberately absent.

import { EVENT_TYPES, VENUES, AREAS } from './venues.js';

export const PLANNABLE_EVENTS = EVENT_TYPES.filter((e) => e.id !== 'golf');

export const CATEGORY_LABEL = { sport: 'Sport', music: 'Music', arts: 'Arts and culture' };

export const BUDGETS = [
  { value: 'entry', label: 'Entry', level: 1, desc: 'Keep it sensible' },
  { value: 'mid', label: 'Mid-range', level: 2, desc: 'A step up' },
  { value: 'premium', label: 'Premium', level: 3, desc: 'Comfort matters' },
  { value: 'hospitality', label: 'Hospitality', level: 4, desc: 'Dining and service' },
  { value: 'private', label: 'Private', level: 5, desc: 'Your own space' },
];
export const budgetLevel = (v) => BUDGETS.find((b) => b.value === v)?.level ?? null;

// The viewer stages a mode inside an archetype. This maps an event type to the
// mode that best represents it.
export function modeFor(eventId, archetype) {
  const map = {
    stadium: { 'stadium-concert': 'concert' },
    arena: { boxing: 'boxing' },
  };
  const fallback = { stadium: 'football', arena: 'concert', hall: 'orchestra', racecourse: 'racing' };
  return map[archetype]?.[eventId] || fallback[archetype] || null;
}

export const venuesFor = (archetype) => VENUES.filter((v) => v.archetype === archetype);

// Regions used by the matchmaker, mapped to the cities in VENUES.
export const REGIONS = [
  { value: 'london', label: 'London', cities: ['London'] },
  { value: 'north-west', label: 'North West', cities: ['Manchester'] },
  { value: 'midlands', label: 'Midlands', cities: [] },
  { value: 'south', label: 'South', cities: ['Berkshire', 'Gloucestershire'] },
  { value: 'uk', label: 'Anywhere in the UK', cities: null },
  { value: 'europe', label: 'Europe', cities: [] },
];

// Picks a venue for a preview: one in the chosen region when there is one.
export function pickVenue(archetype, regionValue) {
  const list = venuesFor(archetype);
  const region = REGIONS.find((r) => r.value === regionValue);
  if (region?.cities?.length) {
    const hit = list.find((v) => region.cities.includes(v.city));
    if (hit) return hit;
  }
  return list[0] || null;
}

// Indicative price-tier of each hospitality area, used only to judge budget fit.
// 1 is closest to a standard ticket, 5 is a private space.
export const AREA_TIER = {
  stadium: { 'private-box': 5, 'premium-lounge': 4, pitchside: 3, 'upper-tier': 1 },
  arena: { 'private-suite': 5, 'premium-lower': 3, floor: 2, 'upper-tier': 1 },
  hall: { 'private-box': 5, stalls: 3, circle: 2, gallery: 1 },
  racecourse: { 'private-box': 5, restaurant: 4, 'premier-enclosure': 3, lawn: 1 },
};

// Generic hospitality styles for event types the viewer has no venue model for
// (Formula 1, cricket, tennis, festivals). Described in general terms only.
export const GENERIC_AREAS = [
  {
    id: 'private-space', name: 'Private hospitality suite', kind: 'hospitality', tier: 5, generic: true,
    blurb: 'A private space for your group, with dining, a host and your own view of the action where the venue offers one.',
    bestFor: ['Corporate entertaining', 'Celebrations'],
    inclusions: ['Private dining', 'Dedicated host', 'Private bar'],
    tradeoff: 'Private spaces vary a lot from venue to venue, so ask a specialist exactly where yours sits.',
    scores: { view: 8, sound: 6, comfort: 10, atmosphere: 6, networking: 10 },
  },
  {
    id: 'shared-lounge', name: 'Shared hospitality lounge with reserved seats', kind: 'hospitality', tier: 4, generic: true,
    blurb: 'Dining in a shared lounge, with reserved seats for the action and a calmer base between sessions.',
    bestFor: ['Client groups', 'Mixed groups'],
    inclusions: ['Lounge dining', 'Reserved seats', 'Lounge access'],
    tradeoff: 'Shared with other guests, so less privacy than a suite.',
    scores: { view: 8, sound: 8, comfort: 8, atmosphere: 8, networking: 8 },
  },
  {
    id: 'premium-seats', name: 'Premium seats with lounge access', kind: 'hospitality', tier: 3, generic: true,
    blurb: 'A well-placed seat for the action, with lounge access for food and drink at your own pace.',
    bestFor: ['Fans', 'Couples and friends'],
    inclusions: ['Premium seats', 'Lounge access'],
    tradeoff: 'Food and drink are less structured than a full dining package.',
    scores: { view: 9, sound: 9, comfort: 7, atmosphere: 9, networking: 5 },
  },
];

// Inclusion names (from AREAS) turned into ids for the vip-worth hand-off.
export const inclusionId = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function areasForEvent(eventId) {
  const ev = PLANNABLE_EVENTS.find((e) => e.id === eventId);
  if (!ev) return [];
  if (!ev.archetypes.length) return GENERIC_AREAS.map((a) => ({ ...a, archetype: null }));
  return ev.archetypes.flatMap((arch) => (AREAS[arch] || [])
    .filter((a) => a.kind === 'hospitality')
    .map((a) => ({ ...a, archetype: arch, tier: AREA_TIER[arch]?.[a.id] ?? 3 })));
}

/* ---------- Occasion Matchmaker ---------- */

// phrase completes "Best matches for ..."; prefers lists the traits the occasion
// itself tends to reward, whatever the group ticks.
export const OCCASIONS = [
  { value: 'birthday', label: 'Birthday', icon: 'gift', phrase: 'a birthday', prefers: ['atmosphere', 'dining'] },
  { value: 'anniversary', label: 'Anniversary', icon: 'heart', phrase: 'an anniversary', prefers: ['dining', 'relaxed', 'black-tie'] },
  { value: 'clients', label: 'Client entertaining', icon: 'briefcase', phrase: 'entertaining clients', prefers: ['dining', 'relaxed'] },
  { value: 'team', label: 'Team reward', icon: 'trophy', phrase: 'a team reward', prefers: ['atmosphere', 'thrill'] },
  { value: 'proposal', label: 'Proposal or big moment', icon: 'sparkles', phrase: 'a proposal or big moment', prefers: ['relaxed', 'black-tie', 'dining'] },
  { value: 'family', label: 'Family day', icon: 'users', phrase: 'a family day', prefers: ['relaxed', 'outdoor'] },
  { value: 'stag-hen', label: 'Stag or hen', icon: 'glass', phrase: 'a stag or hen', prefers: ['thrill', 'atmosphere'] },
  { value: 'just-because', label: 'Just because', icon: 'star', phrase: 'a day out, just because', prefers: [] },
];

export const LIKES = [
  { value: 'outdoor', label: 'Outdoor', icon: 'sun' },
  { value: 'indoor', label: 'Indoor', icon: 'hall' },
  { value: 'sport', label: 'Sport', icon: 'trophy' },
  { value: 'music', label: 'Music', icon: 'music' },
  { value: 'arts', label: 'Arts and culture', icon: 'sparkle' },
  { value: 'dining', label: 'Fine dining', icon: 'utensils' },
  { value: 'relaxed', label: 'Relaxed pace', icon: 'clock' },
  { value: 'thrill', label: 'Thrill seeking', icon: 'zap' },
  { value: 'atmosphere', label: 'Live atmosphere', icon: 'volume' },
  { value: 'black-tie', label: 'Black tie', icon: 'crown' },
];

// Indicative affinity, 0 to 3, between each event type and each like and occasion.
// group: how well it suits large groups (0 to 3). feel: what the day is like.
export const EVENT_PROFILES = {
  football: {
    likes: { outdoor: 2, indoor: 0, sport: 3, music: 0, arts: 0, dining: 2, relaxed: 0, thrill: 2, atmosphere: 3, 'black-tie': 0 },
    occasions: { birthday: 2, anniversary: 1, clients: 3, team: 3, proposal: 0, family: 2, 'stag-hen': 2, 'just-because': 2 },
    group: 3,
    feel: 'Matchday noise from the first whistle, with a lounge to retreat to before kick-off and after the final whistle.',
  },
  rugby: {
    likes: { outdoor: 2, indoor: 0, sport: 3, music: 0, arts: 0, dining: 2, relaxed: 1, thrill: 2, atmosphere: 3, 'black-tie': 0 },
    occasions: { birthday: 2, anniversary: 1, clients: 3, team: 3, proposal: 0, family: 2, 'stag-hen': 3, 'just-because': 2 },
    group: 3,
    feel: 'Big crowds, good-humoured rivalry and a long lunch before kick-off.',
  },
  nfl: {
    likes: { outdoor: 2, indoor: 0, sport: 3, music: 1, arts: 0, dining: 1, relaxed: 0, thrill: 3, atmosphere: 3, 'black-tie': 0 },
    occasions: { birthday: 3, anniversary: 1, clients: 2, team: 3, proposal: 0, family: 2, 'stag-hen': 3, 'just-because': 2 },
    group: 3,
    feel: 'Spectacle as much as sport: a long build-up, big-screen moments and plenty to talk about afterwards.',
  },
  'horse-racing': {
    likes: { outdoor: 3, indoor: 0, sport: 2, music: 0, arts: 0, dining: 3, relaxed: 2, thrill: 2, atmosphere: 2, 'black-tie': 2 },
    occasions: { birthday: 3, anniversary: 2, clients: 3, team: 3, proposal: 1, family: 1, 'stag-hen': 3, 'just-because': 2 },
    group: 3,
    feel: 'A full day out, paced by the races, with dining in between and a rush of noise at every finish.',
  },
  boxing: {
    likes: { outdoor: 0, indoor: 3, sport: 3, music: 0, arts: 0, dining: 1, relaxed: 0, thrill: 3, atmosphere: 3, 'black-tie': 1 },
    occasions: { birthday: 2, anniversary: 0, clients: 2, team: 2, proposal: 0, family: 0, 'stag-hen': 3, 'just-because': 2 },
    group: 2,
    feel: 'A slow build through the undercard to a main event that holds the whole arena.',
  },
  'formula-1': {
    likes: { outdoor: 3, indoor: 0, sport: 3, music: 0, arts: 0, dining: 2, relaxed: 0, thrill: 3, atmosphere: 2, 'black-tie': 0 },
    occasions: { birthday: 3, anniversary: 1, clients: 3, team: 2, proposal: 0, family: 1, 'stag-hen': 2, 'just-because': 3 },
    group: 2,
    feel: 'Noise, speed and a long day outdoors, with hospitality as your base between sessions.',
  },
  cricket: {
    likes: { outdoor: 3, indoor: 0, sport: 3, music: 0, arts: 0, dining: 2, relaxed: 3, thrill: 0, atmosphere: 1, 'black-tie': 0 },
    occasions: { birthday: 2, anniversary: 1, clients: 3, team: 2, proposal: 0, family: 2, 'stag-hen': 2, 'just-because': 2 },
    group: 3,
    feel: 'An unhurried day with time to talk, eat well and follow the game as it unfolds.',
  },
  tennis: {
    likes: { outdoor: 2, indoor: 1, sport: 3, music: 0, arts: 0, dining: 2, relaxed: 2, thrill: 1, atmosphere: 1, 'black-tie': 1 },
    occasions: { birthday: 2, anniversary: 2, clients: 3, team: 1, proposal: 1, family: 2, 'stag-hen': 0, 'just-because': 2 },
    group: 1,
    feel: 'Quiet concentration broken by applause, with plenty of time between matches.',
  },
  darts: {
    likes: { outdoor: 0, indoor: 3, sport: 2, music: 1, arts: 0, dining: 0, relaxed: 0, thrill: 2, atmosphere: 3, 'black-tie': 0 },
    occasions: { birthday: 3, anniversary: 0, clients: 1, team: 3, proposal: 0, family: 0, 'stag-hen': 3, 'just-because': 2 },
    group: 3,
    feel: 'Loud, sociable and full of crowd singing, more party than spectator sport.',
  },
  'arena-concert': {
    likes: { outdoor: 0, indoor: 3, sport: 0, music: 3, arts: 1, dining: 1, relaxed: 1, thrill: 2, atmosphere: 3, 'black-tie': 0 },
    occasions: { birthday: 3, anniversary: 2, clients: 2, team: 2, proposal: 2, family: 2, 'stag-hen': 2, 'just-because': 3 },
    group: 2,
    feel: 'Lights down, a roar from the crowd and a show built for the room.',
  },
  'stadium-concert': {
    likes: { outdoor: 3, indoor: 0, sport: 0, music: 3, arts: 0, dining: 1, relaxed: 0, thrill: 2, atmosphere: 3, 'black-tie': 0 },
    occasions: { birthday: 3, anniversary: 2, clients: 2, team: 3, proposal: 1, family: 2, 'stag-hen': 2, 'just-because': 3 },
    group: 3,
    feel: 'A show on the biggest scale, with a whole stadium singing along.',
  },
  festival: {
    likes: { outdoor: 3, indoor: 0, sport: 0, music: 3, arts: 1, dining: 1, relaxed: 2, thrill: 1, atmosphere: 3, 'black-tie': 0 },
    occasions: { birthday: 2, anniversary: 1, clients: 1, team: 2, proposal: 1, family: 1, 'stag-hen': 2, 'just-because': 3 },
    group: 2,
    feel: 'Several acts across the day, with a hospitality area to rest, eat and regroup.',
  },
  orchestra: {
    likes: { outdoor: 0, indoor: 3, sport: 0, music: 3, arts: 3, dining: 2, relaxed: 3, thrill: 0, atmosphere: 1, 'black-tie': 3 },
    occasions: { birthday: 2, anniversary: 3, clients: 2, team: 1, proposal: 3, family: 1, 'stag-hen': 0, 'just-because': 2 },
    group: 1,
    feel: 'A seated, attentive evening where the hall and the sound are part of the occasion.',
  },
  theatre: {
    likes: { outdoor: 0, indoor: 3, sport: 0, music: 1, arts: 3, dining: 2, relaxed: 3, thrill: 0, atmosphere: 1, 'black-tie': 2 },
    occasions: { birthday: 2, anniversary: 3, clients: 2, team: 1, proposal: 2, family: 3, 'stag-hen': 1, 'just-because': 2 },
    group: 1,
    feel: 'Dinner and a show, with an interval drink to talk over the first half.',
  },
  comedy: {
    likes: { outdoor: 0, indoor: 3, sport: 0, music: 0, arts: 2, dining: 1, relaxed: 2, thrill: 0, atmosphere: 2, 'black-tie': 0 },
    occasions: { birthday: 3, anniversary: 2, clients: 1, team: 3, proposal: 0, family: 1, 'stag-hen': 3, 'just-because': 3 },
    group: 2,
    feel: 'Easy, shared laughter that suits mixed groups who do not share one passion.',
  },
};
