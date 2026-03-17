# TimeShift Parsing Engine Rewrite — Design Spec

**Date:** 2026-03-14
**Status:** Approved
**Approach:** chrono-node + drop moment.js entirely (Approach C)
**Version bump:** 1.2.0 → 2.0.0 (full engine rewrite)

## Problem Statement

The current time parsing engine uses a hand-maintained list of 100+ moment.js format strings and a manual regex-based timezone detection map. This approach has fundamental logic gaps:

### Critical Bugs

1. **GMT offset regex only matches UTC prefix** — `(GMT-5:00) Eastern [US & Canada]` hits the `'gmt': 'UTC'` entry in the timezone map instead of parsing the offset, causing conversion to UTC instead of Eastern.
2. **Wrong UTC offset → timezone mapping** — `-300` (UTC-5) maps to `America/Chicago` (Central) instead of `America/New_York` (Eastern). `-240` (UTC-4, EDT) maps to New York. The static offset map conflates standard/daylight offsets.
3. **CST ambiguity** — `'cst': 'America/Chicago'` ignores China Standard Time (UTC+8).
4. **IST ambiguity** — `'ist': 'Asia/Kolkata'` ignores Israel Standard Time and Irish Standard Time.
5. **Timezone stripping over-matches** — Short codes like `ET`, `CT`, `MT`, `PT` with `\b` word boundaries can match unrelated text in web page selections.
6. **Static UTC offsets in display** — Hardcoded `(UTC-05:00) EST/EDT` doesn't update during DST. The dynamic update only fixes the offset number, not the abbreviation.
7. **No parenthetical offset support** — Formats like `12 PM (GMT-5:00) Eastern [US & Canada]` (common in Google Calendar, Outlook) are completely unhandled.
8. **Dangerous moment() fallback** — When strict parsing fails, `moment.tz(text, timezone)` without format strings guesses incorrectly (e.g., "12" as December).

### Structural Issues

- Brittle: every new website format requires a new regex/format string
- 100+ format strings tried sequentially — slow and error-prone
- `isCountryMatch()` function defined but never called in the filter pipeline
- moment.js is a deprecated library (maintenance mode)
- moment-timezone bundles a snapshot of the IANA database that goes stale

## Solution Overview

Replace the entire parsing + conversion stack:

| Current | New |
|---|---|
| moment.js + moment-timezone | Removed entirely |
| 100+ hardcoded format strings | chrono-node NLP parser |
| Hand-maintained timezone map (15 entries) | chrono's built-in abbreviations + 2 custom refiners |
| Static UTC offset display in dropdowns | Dynamic via `Intl.DateTimeFormat` |
| `isCountryMatch()` (dead code) | Removed |
| `looksLikeDateTime()` pre-check | chrono returns empty array — same purpose, more accurate |

**Bundle sizes:** Actual sizes to be measured from a real build. Estimated net reduction since chrono-node (zero deps, tree-shakeable English-only parser) replaces moment.js (57KB) + moment-timezone with full IANA data (762KB uncompressed).

**What stays the same:**
- UI/HTML structure, styling, dropdown UX
- Context menu flow (background.js)
- Chrome storage for preferences
- General popup architecture (init → detect → convert → display)

## Architecture — 3-Stage Parsing Pipeline

```
Input text
  → Stage 1: Pre-processor (normalize messy text, extract metadata)
  → Stage 2: chrono-node parse (with custom refiners)
  → Stage 3: Timezone resolution (IANA lookup using preserved metadata)
  → Stage 4: Source-timezone Date construction (UTC timestamp)
  → Output: { utcDate: Date, sourceTimezone: string, confidence: 'high'|'medium'|'low' }
```

### Stage 1 — Pre-processor

Runs before chrono-node to normalize messy real-world text. Critically, **extracts and preserves metadata** (offsets, context clues) in a side-channel object before stripping them from the text.

```js
// Pre-processor returns both cleaned text and extracted metadata
function preprocess(rawText) {
    return {
        cleanedText: '12 PM',                     // stripped for chrono
        extractedOffset: -300,                     // from (GMT-5:00), in minutes
        contextClues: ['US', 'Canada', 'Eastern'], // from [US & Canada], verbose names
        wasRange: false,
        originalText: rawText
    };
}
```

| Input pattern | Action |
|---|---|
| `3pm BST / 10am ET` | Take first time+tz pair (before `/`). Slash-split only triggers when `/` is surrounded by whitespace (` / `) AND both sides contain time-like patterns (digits + AM/PM or HH:MM). This avoids false positives on dates like `3/15/2025`. This is a deliberate simplification — slash-separated listings are redundant representations of the same moment. |
| `[US & Canada]` | Extract "US", "Canada" as context clues, then strip brackets from text |
| `(GMT-5:00)` or `(UTC+01:00)` | Extract offset in minutes, preserve in metadata, strip from text |
| `"Eastern"`, `"Pacific Time"` etc. | Extract as context clue, strip from text |
| `12:00 noon` | Normalize to `12:00 PM` |
| `12:00 midnight` | Normalize to `12:00 AM` |
| em-dash `–` or `—` in ranges | Normalize to `-` |

### Stage 2 — chrono-node Parse

Uses chrono-node v2 as the core NLP parser with two custom refiners:

**Refiner 1: Parenthetical Offset Refiner**

Catches patterns common in calendar apps:
- `12 PM (GMT-5:00) Eastern [US & Canada]`
- `3:00 PM (UTC+01:00)`
- `10 AM (GMT+5:30)`

If the pre-processor extracted an offset, this refiner injects it into chrono's parsed result as the timezone offset (in minutes).

**Refiner 2: Verbose Timezone Name Refiner**

Catches long-form timezone names that chrono doesn't map natively:
- `"Eastern Time"`, `"Pacific Standard Time"`, `"Central European Time"`
- `"India Standard Time"`, `"Japan Standard Time"`

Post-parse refiner: if chrono's result has no timezone, checks the pre-processor's `contextClues` for verbose timezone names and assigns the correct IANA zone.

**Note on chrono's built-in abbreviations:** chrono-node v2 handles ~30-40 common abbreviations natively (EST, PST, CET, JST, etc.) plus allows custom timezone mappings via the `timezones` option. The custom refiners extend coverage to verbose names and parenthetical offsets that chrono doesn't handle.

### Stage 3 — Timezone Resolution

Maps chrono's offset/abbreviation to a proper IANA timezone using priority-based disambiguation. Uses the **preserved metadata** from Stage 1 (context clues, extracted offsets).

**Resolution order:**

1. **Explicit offset wins** — If pre-processor extracted `(GMT-5:00)`, the offset `-300` overrides any abbreviation. Match offset to the IANA zone using the **parsed date/time** as reference (not "now"), because DST status may differ for future/past dates. For offset `-300` on a January date → `America/New_York` (EST). For offset `-300` on a July date → `America/Chicago` (CDT). If both standard and daylight candidates exist, prefer the one where the abbreviation context (if any) matches.

2. **Surrounding context clues** — Uses context clues preserved from Stage 1 (bracket text, country names, city names). E.g., `"CST"` + context clue `"Shanghai"` → `Asia/Shanghai`. `"CST"` + context clue `"US"` → `America/Chicago`.

3. **User locale preference** — Default disambiguation based on user's own timezone region. If user is in India, `IST` → `Asia/Kolkata`. If in Israel, → `Asia/Jerusalem`.

4. **Statistical default** — Most common meaning globally as final fallback.

**Ambiguity map:**

| Abbreviation | Candidates | Default |
|---|---|---|
| CST | US Central (`America/Chicago`), China Standard (`Asia/Shanghai`) | US Central |
| IST | India (`Asia/Kolkata`), Israel (`Asia/Jerusalem`), Ireland (`Europe/Dublin`) | India |
| BST | British Summer (`Europe/London`), Bangladesh (`Asia/Dhaka`) | British Summer |
| AST | Atlantic (`America/Halifax`), Arabia (`Asia/Riyadh`) | Atlantic |
| GST | Gulf (`Asia/Dubai`), South Georgia | Gulf |
| EET | Eastern European (multiple countries) | Europe/Helsinki |

**Offset-to-IANA priority table:**

For each common offset, a ranked list of IANA zones (most likely first). The ranking uses the **parsed time's date** to determine DST status:

| Offset (minutes) | Priority order |
|---|---|
| -480 (UTC-8) | America/Los_Angeles, America/Vancouver |
| -420 (UTC-7) | America/Los_Angeles (PDT), America/Denver, America/Phoenix |
| -360 (UTC-6) | America/Chicago, America/Mexico_City, America/Denver (MDT) |
| -300 (UTC-5) | America/New_York, America/Toronto, America/Chicago (CDT), America/Lima |
| -240 (UTC-4) | America/New_York (EDT), America/Halifax, America/Toronto (EDT) |
| 0 (UTC±0) | UTC, Europe/London |
| +60 (UTC+1) | Europe/Paris, Europe/Berlin, Europe/London (BST) |
| +120 (UTC+2) | Europe/Helsinki, Europe/Athens, Europe/Paris (CEST) |
| +330 (UTC+5:30) | Asia/Kolkata |
| +480 (UTC+8) | Asia/Shanghai, Asia/Singapore, Asia/Hong_Kong |
| +540 (UTC+9) | Asia/Tokyo, Asia/Seoul |

When an offset has DST ambiguity (e.g., `-300` could be EST or CDT), the resolver checks whether the parsed date falls within the DST period for each candidate zone using `Intl.DateTimeFormat` to compute the zone's offset at that specific date.

**Fallback for unlisted offsets:** The priority table above covers the most common offsets. For offsets not in the table (e.g., +345 Nepal, +390 Myanmar, +765 Chatham Islands), the resolver uses `Intl.supportedValuesOf('timeZone')` (available in Chrome 93+, 2021) to enumerate all IANA zones, computes each zone's offset at the parsed date via `Intl.DateTimeFormat`, collects matches, and ranks by proximity to the user's locale. If only one zone matches, use it directly. This makes the system future-proof without needing an exhaustive hardcoded table.

### Stage 4 — Source-Timezone Date Construction

**This is the critical step the conversion depends on.** After parsing, we have a "wall clock" time (e.g., "3:00 PM") and a source IANA timezone (e.g., `America/New_York`). We need to construct the correct UTC `Date` object.

**Problem:** `new Date(2025, 8, 5, 15, 0)` creates 3 PM in the USER'S local timezone, not the source timezone. We need 3 PM Eastern → correct UTC.

**Solution:** Use `Intl.DateTimeFormat` to compute the source timezone's UTC offset at the target date, then adjust.

```js
function constructDateInTimezone(year, month, day, hour, minute, second, ianaZone) {
    // Step 1: Create a rough UTC estimate (treat wall-clock as if it were UTC)
    const roughUtc = new Date(Date.UTC(year, month, day, hour, minute, second));

    // Step 2: Format roughUtc in the source timezone to see what wall-clock
    // time it corresponds to there. Use hourCycle:'h23' to avoid the
    // "24" midnight problem that hour12:false has in some engines.
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(roughUtc);

    // Step 3: Parse formatted parts into numbers
    const get = (type) => parseInt(parts.find(p => p.type === type).value);
    const tzYear = get('year');
    const tzMonth = get('month') - 1; // JS months are 0-indexed
    const tzDay = get('day');
    const tzHour = get('hour');
    const tzMinute = get('minute');
    const tzSecond = get('second');

    // Step 4: Compute the offset = (roughUtc as wall-clock) - (what roughUtc
    // actually shows in the source timezone). The difference is the offset.
    const tzWallMs = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond);
    const offsetMs = tzWallMs - roughUtc.getTime();

    // Step 5: Adjust — the real UTC is the desired wall-clock minus the offset
    const realUtc = new Date(roughUtc.getTime() - offsetMs);

    // Step 6: Verify by round-tripping. Format realUtc in source timezone
    // and confirm it matches the original wall-clock components.
    const verifyParts = formatter.formatToParts(realUtc);
    const vGet = (type) => parseInt(verifyParts.find(p => p.type === type).value);
    if (vGet('hour') !== hour || vGet('minute') !== minute || vGet('day') !== day) {
        // Mismatch — we're near a DST transition. Apply second-pass correction.
        const vWallMs = Date.UTC(vGet('year'), vGet('month') - 1, vGet('day'),
                                  vGet('hour'), vGet('minute'), vGet('second'));
        const secondOffsetMs = vWallMs - realUtc.getTime();
        return new Date(roughUtc.getTime() - secondOffsetMs);
    }

    return realUtc;
}
```

**DST Edge Cases:**

- **DST "spring forward" gap** (e.g., 2:30 AM on March 9 in US Eastern does not exist — clocks jump from 2:00 AM to 3:00 AM): The requested wall-clock time is invalid. **Behavior: snap forward** to the first valid time after the gap (3:00 AM). The round-trip verification in Step 6 detects the mismatch and the second-pass correction handles this automatically.

- **DST "fall back" overlap** (e.g., 1:30 AM on November 2 in US Eastern exists twice — once in EDT and once in EST): The wall-clock time is ambiguous. **Behavior: prefer standard time** (the second occurrence). Rationale: if the user's text contained a specific abbreviation (EDT vs EST), Stage 3 already resolved the correct offset; this only applies when no abbreviation was given, and standard time is the safer assumption for future-looking event times.

- **The two-pass approach** handles all transitions: the first pass computes an approximate offset, the verification round-trip catches any DST-boundary error, and the second pass corrects it. This converges in at most 2 iterations because timezone offsets change by at most ±1-2 hours, and the correction is exact.

This approach avoids any dependency on moment-timezone's offset database. The browser's `Intl` engine handles DST transitions, historical timezone changes, and half-hour offsets correctly.

**After this step**, the output `utcDate` is a standard JS `Date` in UTC. Converting to any target timezone is then a simple `Intl.DateTimeFormat` format call with `timeZone: targetIANA`.

## Conversion Engine — Native Browser APIs

### Timezone Conversion

Uses `Intl.DateTimeFormat` with `timeZone` option:
- Zero bytes (built into Chrome)
- Updated with Chrome releases (Chrome bundles its own ICU/IANA database, not the OS's — updated per Chrome release, not OS update)
- Handles DST transitions correctly

```js
function formatInTimezone(utcDate, targetIANA) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: targetIANA,
        year: 'numeric', month: 'long', day: 'numeric',
        weekday: 'long',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
        hour12: true, timeZoneName: 'short'
    });
    return formatter.formatToParts(utcDate);
}
```

### Display Formatting

`Intl.DateTimeFormat.formatToParts()` returns structured output for custom styling.

### Timezone Abbreviation Display

`timeZoneName: 'short'` returns the correct current abbreviation automatically (EDT vs EST).

### Dropdown Live Offsets

```js
function getCurrentOffset(ianaZone) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone, timeZoneName: 'longOffset'
    }).formatToParts(now);
    // Extract "GMT-04:00" from parts
}
```

Dropdown labels always show the correct current offset and abbreviation.

## Time Range Handling

### Detection

Pre-processor detects ranges before chrono parses. Range separator detection requires **time-aware context** to avoid false positives:

- `-` is only a range separator when it appears **between two time expressions** (with AM/PM markers or HH:MM patterns on both sides). This avoids matching dashes in dates (`2025-09-05`) or offsets (`UTC-5`).
- `to`, `through`, `until` matched as whole words between time expressions.
- `–` (en-dash) and `—` (em-dash) are always range separators when between time expressions.

### Processing

1. Split into start and end tokens at the separator
2. Parse each independently through chrono
3. Timezone from first token applies to both (ranges are in the same timezone)

### Supported Patterns

- `2:00 PM - 3:30 PM EST` — shared timezone
- `2:00 PM EST - 3:30 PM EST` — redundant timezone
- `14:00 - 15:30 CET` — 24-hour format
- `2pm to 4pm ET` — "to" as separator
- `9:00 AM – 10:30 AM (GMT-5:00)` — em-dash + parenthetical

### Edge Cases

**Cross-midnight ranges:** If end time < start time (e.g., `11 PM - 2 AM`), assume end is next day.

**Cross-midnight display:** After conversion, if range crosses midnight in target timezone:
> `11:30 PM (Sat, Mar 15) - 2:30 AM (Sun, Mar 16)`

**Partial parse failure:** If start parses but end doesn't (or vice versa), fall back to single-time conversion of the successfully parsed half. Show a note that the range couldn't be fully parsed.

## Date-Only Input Handling

If chrono parses a date with no time component (e.g., "September 5, 2025"), **reject the input** with a helpful message: "Date detected but no time found. Please include a time for conversion (e.g., 'Sep 5, 2025 3:00 PM EST')."

Rationale: timezone conversion of a date without a time is meaningless for the user's use case (converting event/meeting times). Showing midnight would be confusing.

## Confidence Scoring

Every conversion result includes a confidence level:

- **High**: chrono parsed time + timezone detected (abbreviation or explicit offset in text)
- **Medium**: chrono parsed time but timezone came from user's dropdown selection or auto-detect
- **Low**: chrono parsed time but no timezone signal at all — using user's local timezone as fallback

**For ranges:** confidence is the **lower** of start and end confidence. If one half fails to parse, confidence is "low" and a note is shown.

**UI treatment:**
- **High**: Green checkmark, no extra text
- **Medium**: Subtle note: "Timezone from your selection" or "Using your local timezone"
- **Low**: Yellow warning: "No timezone detected in text — using [Your Timezone]. Select a source timezone for accurate results."

## Error Handling

The parsing pipeline must never crash the popup. Every stage catches exceptions and degrades gracefully:

- **Stage 1 (pre-processor):** If normalization throws, pass the raw text through unchanged.
- **Stage 2 (chrono parse):** If chrono throws internally, return empty results (same as "could not parse").
- **Stage 3 (timezone resolution):** If `Intl.DateTimeFormat` throws for an invalid timezone string, fall back to UTC.
- **Stage 4 (date construction):** If the two-pass algorithm produces an unexpected result, return the rough estimate with a "medium" confidence.
- **Display:** If `formatToParts` throws, fall back to `Date.toLocaleString()`.

All errors are caught silently (no console.error in production) — the user sees a friendly "Could not parse this text" message, never a stack trace.

## Bundle API Surface

The chrono bundle exposes a single global:

```js
window.TimeShiftParser = {
    parse(text, options) {
        // options: { userTimezone: string, userLocale?: string }
        // returns: {
        //   utcDate: Date,
        //   sourceTimezone: string,     // IANA zone name
        //   confidence: 'high' | 'medium' | 'low',
        //   isRange: boolean,
        //   rangeEndUtcDate?: Date,     // only if isRange
        //   displayNote?: string        // e.g., "No timezone detected — using your local timezone"
        // } | null (if nothing could be parsed)
    }
};
```

`popup.js` calls only this API — it never imports chrono directly.

## Dependencies

### Added
- `chrono-node` v2.9.x (zero transitive deps, English parser only)

### Removed
- `moment.js`
- `moment-timezone` (with full IANA data bundle)

### Net change
- Estimated significant reduction. **Actual sizes to be measured from build.**

## Build System

The current extension has no build step — it loads vendored `.min.js` files via script tags. Introducing chrono-node requires a minimal build pipeline:

### Setup
- `package.json` at project root with `chrono-node` as a dependency
- `esbuild` as dev dependency (fastest bundler, zero config)
- Single build script: `esbuild src/chrono-bundle.js --bundle --minify --outfile=libs/chrono.bundle.js`

### Source structure
```
/src/
  chrono-bundle.js       # Entry point: imports chrono, registers custom refiners, exports API
  preprocessor.js        # Stage 1: text normalization + metadata extraction
  timezone-resolver.js   # Stage 3: IANA disambiguation
  date-constructor.js    # Stage 4: wall-clock → UTC Date
/libs/
  chrono.bundle.js       # Built output (committed to repo for simplicity)
```

### Workflow
- `npm run build` generates `libs/chrono.bundle.js`
- The built bundle **is committed to the repo** so the extension works without a build step for testing/loading unpacked in Chrome
- `popup.html` loads `libs/chrono.bundle.js` via a script tag (same as current moment.js)
- `popup.js` calls the global API exposed by the bundle

### Developer experience
- Edit source in `/src/`, run `npm run build`, reload extension
- No CI required (single developer project)
- Custom refiners are in the bundle source, testable via Node.js
- Add `.gitattributes` entry: `libs/chrono.bundle.js linguist-generated=true` to suppress diff noise on the minified bundle

## i18n / Locale Scope

**Current scope: English only.** chrono-node supports multiple locales (Japanese, French, German, etc.) but this rewrite uses only the English parser (`chrono.en`). This keeps bundle size smaller.

**Future path:** To add locale support, import additional chrono locale parsers and detect the page language or let the user configure. The architecture does not prevent this.

## Testing Strategy

### Regression Test Suite

Every bug from the Problem Statement becomes a test case:

| Test | Input | Expected |
|---|---|---|
| Bug #1 | `12 PM (GMT-5:00) Eastern [US & Canada]` | Parsed as 12 PM in America/New_York, NOT UTC |
| Bug #2 | `3 PM` with offset -300 on Jan date | Resolves to America/New_York (EST), not Chicago |
| Bug #3 | `3 PM CST` (user in US) | America/Chicago |
| Bug #3b | `3 PM CST` (user in China) | Asia/Shanghai |
| Bug #4 | `3 PM IST` (user in India) | Asia/Kolkata |
| Bug #7 | `12 PM (GMT-5:00) Eastern [US & Canada]` | Correctly extracts offset and timezone |
| Bug #8 | `12` (bare number) | Rejected — not a valid time |

### Real-World Format Matrix

| Source | Input | Expected parse |
|---|---|---|
| Google Calendar | `12 PM (GMT-5:00) Eastern [US & Canada]` | 12 PM, America/New_York |
| University email | `Webinar at 2:00 PM EST` | 2 PM, America/New_York |
| Sports site | `Kickoff: 8 PM ET (Saturday, March 15)` | 8 PM Sat Mar 15, America/New_York |
| News article | `The ceremony begins at 7:00 PM CET on March 20th` | 7 PM Mar 20, Europe/Paris |
| Broadcast page | `Live at 3pm BST / 10am ET` | 3 PM, Europe/London |
| Outlook invite | `Tuesday, Sep 2, 2025 12:00 PM` | 12 PM Sep 2 2025, user's local tz |
| 24h format | `14:00 - 15:30 CET` | Range: 2-3:30 PM, Europe/Paris |
| Bare time | `3:00 PM` | 3 PM, user's local tz (confidence: low) |

### Negative / Rejection Test Cases

| Input | Expected |
|---|---|
| `March 15, 2025` (date only) | Rejected — "no time found" message |
| `hello world` (gibberish) | Rejected — null parse result |
| `EST` (abbreviation only, no time) | Rejected — null parse result |
| `12` (bare number) | Rejected — not a valid time |
| `The meeting is about timezone issues` | Rejected — contains "timezone" but no time |
| Very long paragraph with `3 PM EST` buried in it | Parses `3 PM EST` correctly |
| `3/15/2025 3pm ET` | Parses as March 15, 2025 3 PM ET (slash is date separator, not time-split) |

### Test Runner

- Tests run in Node.js (not requiring Chrome extension load)
- The parsing engine (`/src/`) is pure JS with no Chrome API dependencies
- Chrome-specific code (storage, context menu, DOM) stays in `popup.js`
- Test file: `test/parsing-engine.test.js` using a lightweight runner (Node's built-in test runner or vitest)

## Migration Plan

- **Big-bang replacement** — the parsing engine is a single module with clear boundaries. Incremental migration would require maintaining two parallel parsers, adding complexity for no benefit.
- **Version bump to 2.0.0** — signals to users that the engine changed fundamentally.
- **No feature flags** — the old moment.js code is deleted. If a regression is found, it's fixed in the new engine (chrono + refiners), not by reverting to moment.
- **The old code remains in git history** for reference if needed.

## Files Changed

| File | Change |
|---|---|
| `package.json` | New — chrono-node + esbuild deps |
| `src/chrono-bundle.js` | New — chrono entry point with custom refiners |
| `src/preprocessor.js` | New — Stage 1 text normalization |
| `src/timezone-resolver.js` | New — Stage 3 IANA disambiguation |
| `src/date-constructor.js` | New — Stage 4 wall-clock → UTC |
| `popup.js` | Rewritten — new parsing calls, Intl formatting, same UI logic |
| `popup.html` | Updated — remove moment script tags, add chrono bundle |
| `libs/moment.min.js` | Deleted |
| `libs/moment-timezone.min.js` | Deleted |
| `libs/chrono.bundle.js` | New — built output |
| `test/parsing-engine.test.js` | New — regression + format matrix tests |
| `manifest.json` | Version bump to 2.0.0 |
| `background.js` | No change |
