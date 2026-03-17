# TimeShift v2 — UI Enhancements & Icon Update

**Date:** 2026-03-15
**Status:** Approved

## Scope

6 quick-win enhancements + icon replacement. No architectural changes — all work is in popup.html, popup.js, and icon files.

## 1. Icon Update

Replace the current pixelated PNG clock icon with the new "Minimal Shift" design (clock hands + orbit arc arrow, purple gradient background, wide-filled arrowhead).

**Files:** `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

User exports PNGs from the brainstorm export page at 16/48/128px and replaces the files. Optionally add `icons/icon256.png` and `icons/icon512.png` for store listing.

## 2. "Now" Button

A small clock icon button positioned inside the date/time input field (right side). Clicking it:
1. Fills the input with the current time: `h:mm AM/PM` format (e.g., `3:45 PM`)
2. No date, no timezone appended — those come from the dropdown selections
3. Automatically triggers `handleConversion()`

**Implementation:**
- Add a `<button>` element inside the `.input-group` (absolutely positioned right)
- Use a simple SVG clock icon (inline, ~20x20px)
- Style: semi-transparent, subtle, doesn't obscure input text
- Add `padding-right` to the input to make room for the button

## 3. Swap Button

A swap button (`⇅`) between the From and To timezone dropdowns. Clicking it:
1. Swaps `selectedFromTimezone` ↔ `selectedToTimezone`
2. Swaps both dropdown label texts
3. Calls `saveTimezonePreferences()` to persist the swap
4. If either side is null (auto-detect), swap still works — null moves to the other side

**Implementation:**
- Add a `<button>` element between the two `.timezone-group` divs
- Style: centered, small, semi-transparent white, rounded
- Text content: `⇅` (or SVG arrows)

## 4. Copy Result

A "Copy" button in the result card. Clicking it copies the converted time as plain text to clipboard.

**Copy format (single time):**
```
3:45:00 PM → 1:15:00 AM IST
```

**Copy format (range):**
```
2:00 PM - 3:30 PM EST → 12:30 AM - 2:00 AM IST
```

**Implementation:**
- Add a small copy icon button (top-right of `.result` div)
- Use `navigator.clipboard.writeText()`
- On click: change button text to "Copied!" for 1.5 seconds, then revert
- Store the plain-text conversion string in a variable during `handleConversion()` so copy can access it

## 5. Auto-convert on Context Menu

Currently, `checkForContextMenuText()` sets a 200ms timeout before calling `handleConversion()`. Change:
- Remove the artificial delay
- Call `handleConversion()` immediately after populating the input
- The result appears instantly when the popup opens from right-click

**Implementation:**
- In `checkForContextMenuText()`, replace `setTimeout(() => handleConversion(), 200)` with direct `handleConversion()` call
- Ensure timezone preferences are loaded before this runs (they already are — `loadTimezonePreferences()` is awaited before `checkForContextMenuText()`)

## 6. Smart Placeholder

The input placeholder dynamically shows the current local time as a hint.

**Format:** `e.g., 3:45 PM (now)`

**Implementation:**
- In the `DOMContentLoaded` handler, after initialization, update the placeholder:
  ```js
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  elements.dateTimeInput.placeholder = `e.g., ${timeStr} (now)`;
  ```
- Static — set once on popup open (no live updating needed since popup is short-lived)

## UI Cleanup Notes

- No structural HTML changes beyond adding the 3 new buttons (Now, Swap, Copy)
- Existing gradient background, glassmorphism cards, dropdown styling remain unchanged
- New buttons use the same semi-transparent white style as existing `.btn` but smaller

## Files Changed

| File | Change |
|---|---|
| `icons/icon16.png` | Replaced with new icon |
| `icons/icon48.png` | Replaced with new icon |
| `icons/icon128.png` | Replaced with new icon |
| `popup.html` | Add Now button, Swap button, Copy button HTML + CSS |
| `popup.js` | Now button handler, Swap handler, Copy handler, auto-convert fix, smart placeholder |
