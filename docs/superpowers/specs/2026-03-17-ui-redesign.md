# TimeShift UI Redesign — Design Spec

**Date:** 2026-03-17
**Status:** Approved
**Style:** Refined Glassmorphism (keep gradient + glass, fix layout)

## Layout (top to bottom)

1. **Title** — "TimeShift" centered, no subtitle/tagline
2. **Input** — white rounded input field with "Now" button inline on the right
3. **From → To row** — compact glass pills side by side with `→` between
   - Each pill shows two lines:
     - Line 1: `{ABBR} · {City}` (e.g., `EST · New York`)
     - Line 2: `{UTC offset}` smaller/dimmed (e.g., `UTC-05:00`)
   - Clicking a pill opens the full-width timezone search panel
4. **Result** — large centered converted time, date below, timezone name, Copy button
5. **Confidence** — subtle centered text below result (not a bar). Hidden when confidence is high.

## Timezone Search Panel

When a From/To pill is clicked, a full-width search panel overlays the popup:

- Header: "SELECT FROM TIMEZONE" + close (✕) button
- Large search input with focus on open
- Results: "★ RECENT" section (last 3-5 used), then continent groups
- Each result shows: **City** · UTC offset, second line: IANA zone · long timezone name
- Search bold-highlights the matched substring
- Closes on selection or ✕ or Escape

Search matches (all case-insensitive):
- City names including aliases (Mumbai, Bombay, Calcutta, NYC, LA)
- Country names (India, Japan, USA, Germany)
- Abbreviations (EST, IST, CET)
- IANA identifiers (Asia/Kolkata)
- Offsets (+5:30, UTC-5)

## Behavior Changes

- **Auto-convert** on input change and timezone selection (debounced 300ms). No "Convert Time" button.
- **No instructions section** — removed entirely
- **Confidence as subtle text** — small centered text below result. Hidden for high confidence. Shows for medium/low.

## What Stays

- Gradient background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
- Glassmorphism: `backdrop-filter: blur()`, translucent `rgba(255,255,255,0.1x)` cards
- Copy button behavior
- Now button behavior
- Context menu integration (background.js unchanged)
- Parsing pipeline (chrono-bundle.js unchanged)
- All 179 tests

## Files Changed

- `popup.html` — full rewrite of HTML structure and CSS
- `popup.js` — rewrite UI logic (timezone init, dropdown, conversion handler, auto-convert). Parsing integration stays.
- No changes to `src/`, `test/`, `background.js`, `manifest.json`
