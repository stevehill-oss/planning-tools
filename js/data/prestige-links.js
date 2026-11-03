// Links to prestigecorporateevents.com for every tool. Built 02/11/2026 from
// dev/research/prestige-links.json (each path below returned 200, "index, follow", no
// redirect and a self canonical when it was checked live on 02/11/2026).
//
// RULES baked in here:
// - Only paths listed in PAGES are ever linked, and only on prestigecorporateevents.com.
// - Every outbound link carries utm_source=planning-tools, utm_medium=referral,
//   utm_campaign=<tool id> and utm_content=<outcome id>, opens in a new tab with
//   rel="noopener" and says in words where it goes.
// - Dated pages (events, seasonal guides) carry the last day they apply. The app compares
//   that with today's date in the browser and stops showing the link once it has passed.
// - The Greenwich peninsula arena is only ever "The Arena London". Our website has no venue
//   page for it, so its links go to the live music page or its event pages.
// - No prices, no availability, no seller names.
//
// API
//   outUrl(path, { tool, outcome })        full URL with UTM tags, or null if not verified
//   linkInfo(path, { tool, outcome, text }) { href, text, path, date? } or null
//   outLinkHtml(info, { cls, icon })       an <a> string (new tab, rel="noopener")
//   isLive(page, today?)                   false once a dated page has passed
//   eventLinks(eventId)  venueLinks(venueId)  categoryLink(cat)  occasionLinks(occasion)
//   productLink(venueId, areaId, { mode, day, tool })   "See this on our website"
//   upcomingEvents({ venue, eventType, today })          dated event pages still to come
//   handoffPath({ event, venue, area, mode, day })       best page for an enquiry hand-off
//   decorateLinks(root)                    adds UTM, target and rel to static [data-out] links

export const SITE = 'https://prestigecorporateevents.com';
export const PHONE = { text: '0333 305 5377', href: 'tel:+443333055377' };
export const CHECKED_ON = '02/11/2026';

// kind: static | category | venue | hub | guide | event. text: the words on the link.
// until: the last day (YYYY-MM-DD) the page applies; the link hides after it.
// date / dateText: event date for display (DD/MM/YYYY).
export const PAGES = {
  '/': { kind: 'static', text: 'Visit our homepage', short: 'Our homepage' },
  '/contact': { kind: 'static', text: 'Open our contact page', short: 'Contact us' },
  '/reviews': { kind: 'static', text: 'Read our customer reviews', short: 'Customer reviews' },
  '/about': { kind: 'static', text: 'About Prestige Corporate Events', short: 'About us' },

  '/sport': { kind: 'category', text: 'Browse sport hospitality', short: 'Sport' },
  '/music': { kind: 'category', text: 'Browse music hospitality', short: 'Music' },
  '/arts-culture': { kind: 'category', text: 'Browse Arts & Culture hospitality', short: 'Arts & Culture' },
  '/sport/football': { kind: 'category', text: 'Browse football hospitality', short: 'Football' },
  '/sport/rugby': { kind: 'category', text: 'Browse rugby hospitality', short: 'Rugby' },
  '/sport/american-football': { kind: 'category', text: 'Browse American football hospitality', short: 'American football' },
  '/sport/horse-racing': { kind: 'category', text: 'Browse horse racing hospitality', short: 'Horse racing' },
  '/sport/boxing': { kind: 'category', text: 'Browse boxing hospitality', short: 'Boxing' },
  '/sport/formula-one': { kind: 'category', text: 'Browse Formula 1 hospitality', short: 'Formula 1' },
  '/sport/cricket': { kind: 'category', text: 'Browse cricket hospitality', short: 'Cricket' },
  '/sport/tennis': { kind: 'category', text: 'Browse tennis hospitality', short: 'Tennis' },
  '/sport/darts': { kind: 'category', text: 'Browse darts hospitality', short: 'Darts' },
  '/music/live-music': { kind: 'category', text: 'Browse live music hospitality', short: 'Live music' },
  '/music/festivals': { kind: 'category', text: 'Browse festival hospitality', short: 'Festivals' },
  '/arts-culture/theatre': { kind: 'category', text: 'Browse theatre hospitality', short: 'Theatre' },
  '/arts-culture/comedy': { kind: 'category', text: 'Browse comedy hospitality', short: 'Comedy' },
  '/arts-culture/awards': { kind: 'category', text: 'Browse awards night hospitality', short: 'Awards nights' },

  '/venue/tottenham-hotspur-stadium-london': { kind: 'venue', venue: 'tottenham-hotspur-stadium', text: 'See Tottenham Hotspur Stadium hospitality', short: 'Tottenham Hotspur Stadium' },
  '/venue/manchester-ao-arena': { kind: 'venue', venue: 'ao-arena', text: 'See AO Arena hospitality', short: 'AO Arena' },
  '/venue/co-op-live-manchester': { kind: 'venue', venue: 'co-op-live', text: 'See Co-op Live hospitality', short: 'Co-op Live' },
  '/venue/royal-albert-hall-london': { kind: 'venue', venue: 'royal-albert-hall', text: 'See Royal Albert Hall hospitality', short: 'Royal Albert Hall' },
  '/venue/ascot-racecourse-berkshire': { kind: 'venue', venue: 'ascot-racecourse', text: 'See Ascot Racecourse hospitality', short: 'Ascot Racecourse' },
  '/venue/cheltenham-racecourse-cheltenham': { kind: 'venue', venue: 'cheltenham-racecourse', text: 'See Cheltenham Racecourse hospitality', short: 'Cheltenham Racecourse' },

  '/genres/classical-orchestral-concerts': { kind: 'hub', text: 'See classical and orchestral concert hospitality', short: 'Classical and orchestral' },
  '/football-teams/tottenham-hotspur-fc': { kind: 'hub', text: 'See Tottenham Hotspur FC hospitality', short: 'Tottenham Hotspur FC' },
  '/competitions/premier-league': { kind: 'hub', text: 'See Premier League hospitality', short: 'Premier League' },
  '/competitions/royal-ascot': { kind: 'hub', text: 'See Royal Ascot hospitality', short: 'Royal Ascot' },
  '/races/ascot-race-days': { kind: 'hub', text: 'See Ascot race day hospitality', short: 'Ascot race days' },
  '/races/king-george-diamond-weekend': { kind: 'hub', text: 'See King George Weekend hospitality', short: 'King George Weekend' },
  '/races/british-champions-day': { kind: 'hub', text: 'See British Champions Day hospitality', short: 'British Champions Day' },
  '/races/ascot-autumn-racing-weekend': { kind: 'hub', text: 'See Ascot Autumn Racing Weekend hospitality', short: 'Ascot Autumn Racing Weekend' },
  '/races/cheltenham-festival': { kind: 'hub', text: 'See Cheltenham Festival hospitality', short: 'Cheltenham Festival' },
  '/festivals/cheltenham-november-meeting': { kind: 'hub', text: 'See Cheltenham November Meeting hospitality', short: 'Cheltenham November Meeting' },
  '/competitions/major-boxing-fights': { kind: 'hub', text: 'See major boxing fight hospitality', short: 'Major boxing fights' },
  '/experiences/nfl-london-games': { kind: 'hub', text: 'See NFL London Games hospitality', short: 'NFL London Games' },
  '/experiences/christmas-live': { kind: 'hub', text: 'See Christmas Live hospitality', short: 'Christmas Live' },
  '/tours/major-uk-stadium-concerts': { kind: 'hub', text: 'See major UK stadium concert hospitality', short: 'Major UK stadium concerts' },
  '/tours/major-comedian-arena-tours': { kind: 'hub', text: 'See major comedian arena tour hospitality', short: 'Comedian arena tours' },
  '/shows/west-end-theatre-shows': { kind: 'hub', text: 'See West End theatre show hospitality', short: 'West End theatre shows' },
  '/competitions/six-nations-championship': { kind: 'hub', text: 'See Six Nations hospitality', short: 'Six Nations' },
  '/tournaments/pdc-world-darts-championship': { kind: 'hub', text: 'See PDC World Darts Championship hospitality', short: 'PDC World Darts Championship' },
  '/tours/nickelback-uk-tour': { kind: 'hub', text: 'See Nickelback UK tour hospitality', short: 'Nickelback UK tour' },

  '/resources/Cheltenham-2027-Guide': { kind: 'guide', text: 'Read our Cheltenham 2027 guide', short: 'Cheltenham 2027 guide' },
  '/resources/Six-Nations-2027-Guide': { kind: 'guide', text: 'Read our Six Nations 2027 guide', short: 'Six Nations 2027 guide' },
  '/resources/christmas-hospitality-guide': { kind: 'guide', text: 'Read our 2026 Christmas corporate hospitality guide', short: 'Christmas hospitality guide', until: '2026-12-31' },
  '/resources/formula-1-race-guide': { kind: 'guide', text: 'Read our 2026 F1 race guide', short: '2026 F1 race guide', until: '2026-12-31' },
  '/blog/royal-ascot-dress-code-and-etiquette-quick-guide': { kind: 'guide', text: 'Read our Royal Ascot dress code guide', short: 'Royal Ascot dress code' },
  '/blog/best-travel-routes-to-ascot-racecourse': { kind: 'guide', text: 'Read our guide to getting to Ascot', short: 'Getting to Ascot' },

  // Dated event pages. until is the last day of the event.
  '/event/u2-london-2027': { kind: 'event', venue: 'tottenham-hotspur-stadium', eventType: 'stadium-concert', name: 'U2', date: '2027-06-18', until: '2027-06-19', dateText: '18/06/2027 to 19/06/2027' },
  '/event/karol-g-tottenham-hotspur-stadium-2027': { kind: 'event', venue: 'tottenham-hotspur-stadium', eventType: 'stadium-concert', name: 'Karol G', date: '2027-07-06', until: '2027-07-06', dateText: '06/07/2027' },
  '/event/the-script-man-in-the-arena-tour-or-manchester': { kind: 'event', venue: 'co-op-live', eventType: 'arena-concert', name: 'The Script', date: '2026-11-07', until: '2026-11-07', dateText: '07/11/2026' },
  '/event/stevie-wonder-manchester-2026': { kind: 'event', venue: 'co-op-live', eventType: 'arena-concert', name: 'Stevie Wonder', date: '2026-11-08', until: '2026-11-08', dateText: '08/11/2026' },
  '/event/mariah-carey-manchester-2026': { kind: 'event', venue: 'co-op-live', eventType: 'arena-concert', name: 'Mariah Carey, Christmastime', date: '2026-12-02', until: '2026-12-02', dateText: '02/12/2026' },
  '/event/kasabian-co-op-live-manchester-2026': { kind: 'event', venue: 'co-op-live', eventType: 'arena-concert', name: 'Kasabian', date: '2026-12-19', until: '2026-12-19', dateText: '19/12/2026' },
  '/event/nba-manchester-game-2027-spurs-vs-pelicans': { kind: 'event', venue: 'co-op-live', eventType: null, name: 'NBA: San Antonio Spurs v New Orleans Pelicans', date: '2027-01-17', until: '2027-01-17', dateText: '17/01/2027' },
  '/event/sonny-fodera-manchester-2027': { kind: 'event', venue: 'co-op-live', eventType: 'arena-concert', name: 'Sonny Fodera', date: '2027-03-26', until: '2027-03-26', dateText: '26/03/2027' },
  '/event/nickelback-co-op-live-manchester-2027': { kind: 'event', venue: 'co-op-live', eventType: 'arena-concert', name: 'Nickelback', date: '2027-06-02', until: '2027-06-02', dateText: '02/06/2027' },
  '/event/deacon-blue-manchester-2027': { kind: 'event', venue: 'co-op-live', eventType: 'arena-concert', name: 'Deacon Blue', date: '2027-10-22', until: '2027-10-22', dateText: '22/10/2027' },
  '/event/the-fashion-awards-2026-royal-albert-hall': { kind: 'event', venue: 'royal-albert-hall', eventType: null, name: 'The Fashion Awards 2026', date: '2026-11-30', until: '2026-11-30', dateText: '30/11/2026' },
  '/event/leona-lewis-heart-christmas-live-2026': { kind: 'event', venue: 'royal-albert-hall', eventType: null, name: 'Leona Lewis, Heart Christmas Live 2026', date: '2026-12-14', until: '2026-12-14', dateText: '14/12/2026' },
  '/event/royal-ascot-jubilee-day-village-2027': { kind: 'event', venue: 'ascot-racecourse', eventType: 'horse-racing', day: 'royal', name: 'Royal Ascot 2027, Village Enclosure', date: '2027-06-19', until: '2027-06-19', dateText: '19/06/2027' },
  '/event/ascot-king-george-friday-2027': { kind: 'event', venue: 'ascot-racecourse', eventType: 'horse-racing', day: 'raceday', name: 'King George Friday 2027', date: '2027-07-23', until: '2027-07-23', dateText: '23/07/2027' },
  '/event/british-champions-day-2027': { kind: 'event', venue: 'ascot-racecourse', eventType: 'horse-racing', day: 'raceday', name: 'British Champions Day 2027, Furlong Restaurant', date: '2027-10-16', until: '2027-10-16', dateText: '16/10/2027' },
  '/event/cheltenham-festival-champion-day-2027': { kind: 'event', venue: 'cheltenham-racecourse', eventType: 'horse-racing', day: 'festival', name: 'Cheltenham Festival 2027, Champion Day', date: '2027-03-16', until: '2027-03-16', dateText: '16/03/2027' },
  '/event/cheltenham-festival-ladies-day-2027': { kind: 'event', venue: 'cheltenham-racecourse', eventType: 'horse-racing', day: 'festival', name: 'Cheltenham Festival 2027, Ladies Day', date: '2027-03-17', until: '2027-03-17', dateText: '17/03/2027' },
  '/event/cheltenham-st-patricks-day-2027': { kind: 'event', venue: 'cheltenham-racecourse', eventType: 'horse-racing', day: 'festival', name: 'Cheltenham Festival 2027, St Patrick’s Day', date: '2027-03-18', until: '2027-03-18', dateText: '18/03/2027' },
  '/event/cheltenham-gold-cup-day-2027': { kind: 'event', venue: 'cheltenham-racecourse', eventType: 'horse-racing', day: 'festival', name: 'Cheltenham Festival 2027, Gold Cup Day', date: '2027-03-19', until: '2027-03-19', dateText: '19/03/2027' },
  // Not at a venue in this app (Cardiff, per the research), used only for boxing.
  '/event/tyson-fury-vs-anthony-joshua': { kind: 'event', venue: null, eventType: 'boxing', name: 'Anthony Joshua v Tyson Fury, Cardiff', date: '2026-12-11', until: '2026-12-12', dateText: '11/12/2026' },
};

// Event pages get their link words from their name and date.
Object.entries(PAGES).forEach(([, p]) => {
  if (p.kind === 'event') { p.text = `See ${p.name} hospitality (${p.dateText})`; p.short = p.name; }
});

/* ---------- Outcome map ---------- */

// best first, then other useful pages (research outcomes.eventTypes).
export const EVENT_LINKS = {
  football: ['/sport/football', '/competitions/premier-league', '/football-teams/tottenham-hotspur-fc', '/venue/tottenham-hotspur-stadium-london'],
  rugby: ['/sport/rugby', '/competitions/six-nations-championship', '/resources/Six-Nations-2027-Guide'],
  nfl: ['/experiences/nfl-london-games', '/sport/american-football', '/venue/tottenham-hotspur-stadium-london'],
  'horse-racing': ['/sport/horse-racing', '/venue/ascot-racecourse-berkshire', '/venue/cheltenham-racecourse-cheltenham', '/competitions/royal-ascot', '/races/ascot-race-days', '/races/cheltenham-festival', '/resources/Cheltenham-2027-Guide'],
  boxing: ['/sport/boxing', '/competitions/major-boxing-fights', '/event/tyson-fury-vs-anthony-joshua'],
  'formula-1': ['/sport/formula-one', '/resources/formula-1-race-guide'],
  cricket: ['/sport/cricket'],
  tennis: ['/sport/tennis'],
  darts: ['/sport/darts', '/tournaments/pdc-world-darts-championship'],
  'arena-concert': ['/music/live-music', '/venue/co-op-live-manchester', '/venue/manchester-ao-arena'],
  'stadium-concert': ['/tours/major-uk-stadium-concerts', '/venue/tottenham-hotspur-stadium-london', '/music/live-music'],
  festival: ['/music/festivals'],
  orchestra: ['/genres/classical-orchestral-concerts', '/venue/royal-albert-hall-london'],
  theatre: ['/arts-culture/theatre', '/shows/west-end-theatre-shows'],
  comedy: ['/arts-culture/comedy', '/tours/major-comedian-arena-tours'],
};

// research outcomes.venues. The Arena London has no venue page by rule.
export const VENUE_LINKS = {
  'tottenham-hotspur-stadium': ['/venue/tottenham-hotspur-stadium-london', '/football-teams/tottenham-hotspur-fc', '/competitions/premier-league', '/tours/major-uk-stadium-concerts', '/experiences/nfl-london-games'],
  'the-arena-london': ['/music/live-music', '/sport/boxing', '/arts-culture/comedy', '/tours/major-comedian-arena-tours', '/tours/nickelback-uk-tour'],
  'ao-arena': ['/venue/manchester-ao-arena', '/music/live-music'],
  'co-op-live': ['/venue/co-op-live-manchester', '/music/live-music'],
  'royal-albert-hall': ['/venue/royal-albert-hall-london', '/genres/classical-orchestral-concerts', '/experiences/christmas-live', '/arts-culture/awards'],
  'ascot-racecourse': ['/venue/ascot-racecourse-berkshire', '/competitions/royal-ascot', '/races/ascot-race-days', '/races/king-george-diamond-weekend', '/races/british-champions-day', '/races/ascot-autumn-racing-weekend', '/blog/royal-ascot-dress-code-and-etiquette-quick-guide', '/blog/best-travel-routes-to-ascot-racecourse'],
  'cheltenham-racecourse': ['/venue/cheltenham-racecourse-cheltenham', '/races/cheltenham-festival', '/festivals/cheltenham-november-meeting', '/resources/Cheltenham-2027-Guide'],
};

export const CATEGORY_LINKS = { sport: '/sport', music: '/music', arts: '/arts-culture' };

// No page exists for any occasion or group type (research): the matched event type or
// venue link comes first, then these.
export const OCCASION_LINKS = {
  clients: ['/resources/christmas-hospitality-guide', '/reviews', '/about'],
  team: ['/resources/christmas-hospitality-guide'],
};

// The product names our own venue pages use (research venueProducts). Shown in place of the
// venue's name where they differ. Products not listed keep the venue's current name.
export const SITE_PRODUCT_NAMES = {
  'ao-arena': { 'suite-experience': 'The Suite Experience' },
  'royal-albert-hall': { 'grand-tier-box': 'Grand Tier Boxes', 'loggia-box': 'Loggia Boxes', 'second-tier-box': 'Second Tier Boxes' },
};
// Products our venue page names (so the link can say so).
const ON_OUR_PAGE = {
  'tottenham-hotspur-stadium': ['tunnel-club', 'h-club', 'sideline-suites'],
  'ao-arena': ['the-mezz', 'beautiful-north', 'suite-experience'],
  'royal-albert-hall': ['grand-tier-box', 'loggia-box', 'second-tier-box'],
  'ascot-racecourse': ['private-box', 'king-edward-vii-enclosure'],
  'cheltenham-racecourse': ['private-box'],
};
export const siteProductName = (venueId, areaId) => SITE_PRODUCT_NAMES[venueId]?.[areaId] || null;

/* ---------- Dates ---------- */

const pad = (n) => String(n).padStart(2, '0');
// Today in the visitor's own time zone, as YYYY-MM-DD.
export const todayIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isLive = (page, today = todayIso()) => !!page && (!page.until || page.until >= today);

/* ---------- Building links ---------- */

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export function outUrl(path, { tool = 'planning-tools', outcome = '' } = {}) {
  if (!PAGES[path]) return null;
  const q = new URLSearchParams({ utm_source: 'planning-tools', utm_medium: 'referral', utm_campaign: slug(tool) || 'planning-tools' });
  if (outcome) q.set('utm_content', slug(outcome));
  return `${SITE}${path}?${q.toString()}`;
}

// { href, text, short, path, kind, dateText? } for a verified, still-live page, else null.
export function linkInfo(path, { tool, outcome, text, today } = {}) {
  const p = PAGES[path];
  if (!p || !isLive(p, today)) return null;
  return { href: outUrl(path, { tool, outcome: outcome || `${p.kind}-${path.split('/').pop() || 'home'}` }), text: text || p.text, short: p.short, path, kind: p.kind, dateText: p.dateText || null, page: p };
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// iconSvg: optional ready-made icon markup. The visible text says where the link goes.
export function outLinkHtml(info, { cls = 'btn btn--ghost btn--sm', iconSvg = '', label } = {}) {
  if (!info) return '';
  return `<a class="${esc(cls)}" href="${esc(info.href)}" target="_blank" rel="noopener" data-out-path="${esc(info.path)}">${iconSvg}<span>${esc(label || info.text)}</span><span class="visually-hidden"> (opens our website in a new tab)</span></a>`;
}

const live = (paths, opts) => paths.map((p) => linkInfo(p, opts)).filter(Boolean);

export function eventLinks(eventId, { tool, today } = {}) {
  return live(EVENT_LINKS[eventId] || [], { tool, today, outcome: `event-${eventId}` });
}
export function venueLinks(venueId, { tool, today } = {}) {
  return live(VENUE_LINKS[venueId] || [], { tool, today, outcome: `venue-${venueId}` });
}
export function categoryLink(cat, { tool } = {}) {
  return CATEGORY_LINKS[cat] ? linkInfo(CATEGORY_LINKS[cat], { tool, outcome: `category-${cat}` }) : null;
}
export function occasionLinks(occasion, { tool, today } = {}) {
  return live(OCCASION_LINKS[occasion] || [], { tool, today, outcome: `occasion-${occasion}` });
}

// Dated event pages still to come, soonest first.
export function upcomingEvents({ venue = null, eventType = null, day = null, today = todayIso() } = {}) {
  return Object.entries(PAGES)
    .filter(([, p]) => p.kind === 'event' && isLive(p, today)
      && (!venue || p.venue === venue) && (!eventType || p.eventType === eventType) && (!day || !p.day || p.day === day))
    .sort((a, b) => a[1].date.localeCompare(b[1].date))
    .map(([path]) => path);
}

// The best page for one product. Prefers a dated event page that sells it, then the hub for
// the day or mode, then the venue page (never one for The Arena London).
// name: the product's display name, used in the link words when our venue page names it.
export function productLink(venueId, areaId, { mode = null, day = null, tool = 'reality-viewer', today, name = '' } = {}) {
  const outcome = `product-${venueId}-${areaId}`;
  const named = (ON_OUR_PAGE[venueId] || []).includes(areaId);
  let path = null;
  if (venueId === 'ascot-racecourse' && areaId === 'furlong-restaurant' && isLive(PAGES['/event/british-champions-day-2027'], today)) path = '/event/british-champions-day-2027';
  else if (venueId === 'ascot-racecourse' && day === 'royal') path = '/competitions/royal-ascot';
  else if (venueId === 'cheltenham-racecourse' && day === 'festival') path = '/races/cheltenham-festival';
  else if (venueId === 'tottenham-hotspur-stadium' && mode === 'nfl') path = '/experiences/nfl-london-games';
  else path = VENUE_LINKS[venueId]?.[0] || null;
  const info = path ? linkInfo(path, { tool, outcome, today }) : null;
  if (!info) return null;
  if (info.kind === 'venue' && named && name) info.text = `See ${name} on our ${info.short} page`;
  return info;
}
export const namedOnOurPage = (venueId, areaId) => (ON_OUR_PAGE[venueId] || []).includes(areaId);

// The most relevant page for an enquiry hand-off: a product or venue, else the event type,
// else the contact page.
export function handoffPath({ event = null, venue = null, area = null, mode = null, day = null, tool = 'brief' } = {}) {
  if (venue && area) { const p = productLink(venue, area, { mode, day, tool }); if (p) return p; }
  if (venue) { const v = venueLinks(venue, { tool })[0]; if (v) return v; }
  if (event) { const e = eventLinks(event, { tool })[0]; if (e) return e; }
  return linkInfo('/contact', { tool, outcome: 'contact' });
}

// Static links in index.html: <a href="https://prestigecorporateevents.com/sport" data-out="header">
// get the UTM tags (campaign = the data-out value), a new tab and rel="noopener".
export function decorateLinks(root = document) {
  root.querySelectorAll('a[data-out]').forEach((a) => {
    let url;
    try { url = new URL(a.getAttribute('href')); } catch { return; }
    if (url.origin !== SITE) return;
    const path = url.pathname === '' ? '/' : url.pathname;
    const href = outUrl(path, { tool: a.dataset.out, outcome: a.dataset.outContent || `${a.dataset.out}-${path.split('/').pop() || 'home'}` });
    if (!href) return;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    if (!a.querySelector('.visually-hidden')) a.insertAdjacentHTML('beforeend', '<span class="visually-hidden"> (opens our website in a new tab)</span>');
  });
}
