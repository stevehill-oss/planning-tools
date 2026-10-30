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
`vendor`). The only outside requests are Google Fonts and links to the live site.

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
