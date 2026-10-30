# Hospitality Planning Tools (prototype)

A working prototype of the Prestige Corporate Events planning tools page. It rebuilds the
first Replit version (polished-prototype--stevehill4.replit.app) with five deeper tools, a
much more realistic 3D seat viewer, and an app feel: tools hand off to each other, any
result can be saved to "My brief", shared by link, printed, or sent to a specialist.

It is a static website. There is no build step, no server code, no database and no login.
Nothing typed into it is sent anywhere: the enquiry form, newsletter form and brief all stay
in the visitor's own browser.

## Open it on this laptop

1. Open a terminal in this folder:
   `C:\Users\User\Desktop\Claude\prototypes\vip-experience-tools`
2. Run: `python -m http.server 8730`
3. In Chrome, go to: http://127.0.0.1:8730/
4. To stop it, press Ctrl+C in the terminal.

Opening `index.html` by double-clicking will not work, because browsers block the tool
files when a page is opened straight from disk. Always use the small server above.

To see the phone layout on a desktop, open http://127.0.0.1:8730/dev/phone.html (it shows the
page at 390 pixels wide).

## Put it on Replit

1. Create a new Repl using the "Static HTML" (or plain HTML, CSS, JS) template.
2. Delete the template's starter files.
3. Upload the whole contents of this folder, keeping the folder structure. `index.html`
   must sit at the top level, next to the `css`, `js`, `assets` and `vendor` folders.
4. Press Run. No install or build is needed.

The `dev` folder holds test pages. It does no harm online, but you can leave it out.
Everything the page needs is inside the folder (Three.js and GSAP are included in
`vendor`). The only outside requests are Google Fonts, links to the live site and, once a
key is added and someone opens "Real venue", Google's 3D map.

## The five tools

Each tool has its own address, so old links from the first prototype still work
(for example `#corporate-roi` or `#seat-finder`).

1. **Where Should I Sit?** (`#seat-finder`). Pick the event, what matters most, a budget
   level and who is going. It recommends a seating area with the reasons, indicative scores,
   trade-offs and a runner-up. Buttons take you to the 3D view of that seat or to the
   value check.
2. **Seat Reality Viewer** (`#reality-viewer`). A 3D view from the seat. Seven venues across
   four venue types: a stadium (football or concert), an arena (concert or boxing), a concert
   hall (orchestra) and a racecourse (race day, with a "Watch a race" button). Choose the
   area, row and position, day, golden hour or night, and how busy it is. Overview mode
   shows the whole venue with clickable area markers. "Compare with a standard ticket"
   shows hospitality and a standard seat side by side. "Save this view" downloads a picture.
3. **Is Hospitality Worth It?** (`#vip-worth`). Type a standard ticket price and the package
   price you have been quoted, tick what the package includes, and say what each part is
   worth to you. It gives a verdict per person and for the group, a chart and a breakdown.
   For client entertaining it offers "Build a business case".
4. **Occasion Matchmaker** (`#occasion-matchmaker`). Start from the occasion (birthday, client
   entertaining, team reward and so on), the group size, budget level, region and tastes. It
   ranks the top three kinds of event, with a suggested hospitality style, a seat preview
   where one exists, and a link to browse that category on the live site.
5. **Corporate ROI** (`#corporate-roi`). Cost per person, clients invited, what a won client
   is worth and how many you expect to sign. It shows the return, how many clients must sign
   to break even, cautious and bold scenarios, and builds a one-page business case to print,
   save as PDF or copy as text.

Every result ends with the same four actions: Add to my brief, Share result, a next step,
and Speak to a specialist. "My brief" (top right) collects results; from there you can copy
a summary, print it, share it, or send it to a specialist as a pre-filled enquiry.

## Real imagery in the Seat Reality Viewer

The viewer has three buttons over the picture: **Seat view**, **Overview** and **Real venue**.
The 3D model is always there underneath. If a photo or the live map is missing or fails,
the model shows instead.

- **Real venue** shows the real building from the air on Google's live, photorealistic 3D
  map. It turns slowly round the venue until you drag it (no turning for people whose
  device asks for reduced motion). Buttons give three camera angles. It stays switched off
  until a Google key is added (see below). Until then it shows a calm "Live 3D map not set
  up yet" card. If Google refuses or cannot be reached, it shows "The live map could not
  load". Seat view and Overview keep working either way.
- **Real 360 photos.** When a seating area has a photo, Seat view opens on it. You drag
  to look around, and a "360 photo / 3D model" switch sits under the picture. The credit
  line reads "Photo: <who took it>, <date>". Areas without a photo show the 3D model with
  the note "Real 360 photo from this area coming soon."

### How to add a 360 photo of a seat

1. **Take the photo.**
   - Use a 360 camera (for example an Insta360 or a Ricoh Theta) on a small stand or
     monopod.
   - Put it where a guest's eyes would be while seated: in the seat itself, at about head
     height.
   - Point the camera's front lens at the pitch, stage or finish line.
   - Take it in daylight or with the house lights up. Hide yourself behind a pillar or
     duck down, or use the camera's timer.
   - Only photograph where the venue allows it, and keep strangers' faces out where you can.
2. **Export it** from the camera app as a single **equirectangular** JPEG. That is the
   flat, stretched picture that is exactly twice as wide as it is tall (2:1), for example
   6000 x 3000 pixels. Smaller is fine, for example 4000 x 2000.
3. **Make it light.** Save as JPEG at about quality 80 and keep the file under about 3 MB.
   On phones, anything wider than 4096 pixels is scaled down automatically.
4. **Name and place the file.** Put it in `assets/360/<venue id>/<area id>.jpg`, using
   the ids from `js/data/venues.js`. Use lower case with hyphens. For example:
   `assets/360/tottenham-hotspur-stadium/premium-lounge.jpg`
   - Venue ids: `tottenham-hotspur-stadium`, `the-arena-london`, `ao-arena`, `co-op-live`,
     `royal-albert-hall`, `ascot-racecourse`, `cheltenham-racecourse`.
   - Area ids: stadium `private-box`, `premium-lounge`, `pitchside`, `upper-tier`;
     arena `private-suite`, `premium-lower`, `floor`, `upper-tier`; hall `private-box`,
     `stalls`, `circle`, `gallery`; racecourse `private-box`, `restaurant`,
     `premier-enclosure`, `lawn`.
5. **Add an entry** to `js/data/panoramas.js`, inside the `PANORAMAS = { ... }` braces:

   ```js
   'tottenham-hotspur-stadium/premium-lounge': {
     src: 'assets/360/tottenham-hotspur-stadium/premium-lounge.jpg',
     credit: 'Prestige Corporate Events',
     takenOn: '14/03/2027',
     permission: 'Taken by Steve Hill on a site visit, venue agreed by email 01/03/2027',
     heading: 0,
   },
   ```

   - `credit` and `takenOn` (DD/MM/YYYY) appear on screen.
   - `permission` is a private note of where the photo came from. It is not shown.
   - `heading` turns the first view: 0 faces the middle of the photo; 30 turns 30 degrees
     to the right, minus 30 to the left. If the camera's front lens faced the action, 0
     is right.
   - For a photo that only applies to one event layout, add the mode to the key, for
     example `'the-arena-london/floor/boxing'`.
6. **Check it** on the laptop (see "Open it on this laptop"): open the viewer, pick that
   venue and area, and make sure the photo shows, the credit is right and the first view
   faces the action.

Never use photos copied from the web or from other companies, and never a render of the
3D model presented as a photo. Only photos we took, or photos supplied with written
permission, go in.

### How to switch on the live Google 3D map

You need a Google Maps Platform browser key. Creating one needs a Google account with a
billing card, because Google charges for map use beyond its free allowance. Check Google's
current pricing page before you start.

1. Go to the Google Cloud console (console.cloud.google.com) and sign in.
2. **Create a project**, for example "Prestige planning tools".
3. **Turn on billing** for the project (Billing, link a billing account).
4. **Enable the APIs.** Go to APIs and Services, Library and enable **Maps JavaScript API**.
   At the time of writing (30/10/2026), Google's 3D map guide lists only the Maps
   JavaScript API. If the map later reports that the **Map Tiles API** is needed, enable
   that too.
5. **Create the key:** APIs and Services, Credentials, Create credentials, API key.
6. **Restrict the key straight away** (Edit API key):
   - Application restrictions: **Websites**. Add exactly these two:
     `https://stevehill-oss.github.io/*` and `http://127.0.0.1:8730/*`
     (add any other address the site will live on, such as a Replit address).
   - API restrictions: **Restrict key**, tick Maps JavaScript API (and Map Tiles API if you
     enabled it). Save.
7. **Set a budget alert:** Billing, Budgets and alerts, Create budget. Choose a monthly
   amount you are comfortable with and alerts at 50, 90 and 100 per cent. (An alert emails
   you; it does not stop spending by itself.)
8. **Paste the key** into `js/config.js` between the quotes:
   `export const GOOGLE_MAPS_KEY = 'AIza...';`
   Save, publish, and open Real venue to check it.

The key is visible to anyone who views the page source. That is normal for a browser key.
The restrictions in step 6 are what stop other sites using it. Never paste any other kind
of key or password into this project.

Google's imagery is only ever shown live through Google's own map. It is never saved, put
into "Save this view" or added to the brief, and Google's logo and credits stay visible.
Map labels are switched off, so the building is not labelled with any brand name.

## What is illustrative

- **3D views are illustrative models**, not exact renderings of any venue. The viewer says so
  on screen at all times. Venue names pick the venue type; the buildings are generic.
- **Scores** (view, sound, comfort, atmosphere, networking) and match percentages are
  indicative opinions for comparison, and are labelled "Indicative".
- **No prices from Prestige Corporate Events appear anywhere.** The calculators use figures the
  visitor types. "Try example figures" fills in made-up numbers, labelled on screen as
  illustrative and not quotes. The "worth to you" amounts for each inclusion are example
  assumptions the visitor can change.
- The enquiry form, newsletter sign-up and brief are prototypes: they show a success message
  but send nothing.

## Known limits

- The 3D viewer needs WebGL. Without it, the page shows a still picture and a written
  description of the seat instead.
- The 3D scenes are heavy. They were checked in software rendering only, where they run
  slowly. Speed and touch control (drag, pinch) still need testing on a real phone and a
  normal laptop graphics card.
- People in the crowd look blocky at middle distance.
- "Save this view" gives a picture the size of the on-screen viewer, not a large print file.
- The brief is stored in the visitor's browser only. Clearing site data, or a different
  browser or device, starts an empty brief.
- The calculators cap very large figures (for example £1,000,000 for a ticket or package)
  and say so under the field.
- No screen reader test, Lighthouse run or real-device test has been done yet.
