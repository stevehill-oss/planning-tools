// Site settings Steve can change without touching any tool code.
//
// GOOGLE_MAPS_KEY switches on the "Real venue" view in the Seat Reality Viewer (Google's
// photorealistic 3D map of the venue). Leave it empty and that view shows a calm
// "Live 3D map not set up yet" card, while everything else keeps working.
//
// To switch it on, paste a Google Maps Platform BROWSER key between the quotes. A browser
// key is visible to anyone who opens the page, so before pasting it, restrict it in the
// Google Cloud console (APIs and Services, Credentials, the key):
//   1. Application restrictions: Websites (HTTP referrers), allowing only
//        https://stevehill-oss.github.io/*
//        http://127.0.0.1:8730/*
//   2. API restrictions: Maps JavaScript API only (plus Map Tiles API if Google asks for it).
//   3. Set a budget alert on the billing account.
// README.md has the full step by step guide. Never paste a server key or any other secret.
export const GOOGLE_MAPS_KEY = '';
