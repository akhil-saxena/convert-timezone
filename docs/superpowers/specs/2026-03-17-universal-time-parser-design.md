# Universal Time Parser — Design Spec

**Date:** 2026-03-17
**Status:** Draft
**Approach:** B — Preprocessing Overhaul + Chrono Core

## Problem

TimeShift's current parsing pipeline handles structured time formats well but fails on messy real-world website text: glued tokens (`3pmEST`), lowercase abbreviations (`est`), international notation (`15h00`), city-based timezones (`"3pm in London"`), and non-English date text. Users right-click text on any website and expect instant, correct conversion regardless of formatting.

## Design Decisions

- **Input source:** Primarily web-scraped text via right-click context menu
- **Ambiguity handling:** Show guessed timezone visually (amber indicator) + let user override via dropdown
- **Multilingual:** Full NLP — parse times written in any language (12 chrono locales + normalization for unsupported scripts)
- **Relative expressions:** Not supported — absolute times only
- **Ranges:** Single timezone for entire range (first detected timezone applies to both endpoints)
- **Glued token parsing:** Time+abbreviation splitting only (`3pmEST`) — not aggressive full-blob parsing
- **Timezone database:** Full IANA (~400 zones) with grouped, searchable dropdown
- **Bundle size:** Unconstrained — pack everything for maximum parsing power
- **Max input length:** 500 characters — truncate longer selections to avoid lag

## Architecture

6-stage pipeline. Stages 1-3 are new/rewritten. Stage 4 adds locale routing. Stages 5-6 are expanded but not rewritten.

**Key design constraint:** Stage 2 is split into two phases. Phase A (non-destructive: glued token splitting, AM/PM normalization, punctuation) runs before locale detection. Phase B (international format normalization: `15h00`→`15:00`, `午後3時`→`3:00 PM`) runs ONLY when the detected locale is `en` — chrono's native locale parsers handle their own formats directly.

```
Input text (raw from website)
    │
    ▼
┌─────────────────────────────────┐
│ Stage 1: HTML Sanitizer         │  Strip tags, decode entities, normalize whitespace
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Stage 2A: Tokenizer             │  Split glued tokens, normalize AM/PM,
│           (non-destructive)     │  punctuation, slash handling, noon/midnight
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Stage 3: City & Timezone        │  Extract city names, abbreviations, offsets,
│           Extractor             │  verbose names, context clues — extraction only,
│                                 │  does NOT resolve final timezone
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Stage 4: Locale Detection       │  Detect language from ORIGINAL text (pre-Stage 2),
│           + Chrono Parse        │  route to chrono locale parser.
│                                 │  If locale != en, chrono gets Stage 2A output.
│                                 │  If locale == en, apply Stage 2B normalization
│                                 │  first (international formats → English).
│                                 │  Fallback: try en if locale parser fails.
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Stage 5: Timezone Resolution    │  Single resolver — consumes Stage 3 extraction
│                                 │  signals, resolves to IANA zone. Only resolver
│                                 │  in the pipeline. Full IANA + city matching.
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Stage 6: Date Construction      │  Wall-clock → UTC via Intl
│           + Result              │  (unchanged)
└─────────────────────────────────┘
```

### File Structure

```
src/
├── sanitizer.js           (NEW — Stage 1)
├── tokenizer.js           (NEW — Stages 2A + 2B, replaces preprocessor.js)
├── city-extractor.js      (NEW — Stage 3, extraction only)
├── timezone-data.js       (NEW — full IANA database + city dictionary)
├── chrono-bundle.js       (MODIFIED — Stage 4, locale routing + orchestration)
├── timezone-resolver.js   (MODIFIED — Stage 5, sole resolver, expand to full IANA)
├── date-constructor.js    (UNCHANGED — Stage 6)
└── preprocessor.js        (DEPRECATED — logic absorbed into stages 1-3)
```

## API Contract

The top-level `parse()` function (exported from `chrono-bundle.js`) is the single entry point for the entire pipeline.

### Input

```javascript
parse(text, options = {})
```

- `text` (string): Raw input text, max 500 characters (truncated if longer)
- `options.userTimezone` (string, optional): User's IANA timezone (default: auto-detected from browser)

### Output

```javascript
{
  // Core result
  utcDate: Date,                    // UTC Date object of parsed time
  sourceTimezone: string,           // IANA zone used for conversion (e.g., "America/New_York")

  // Confidence
  confidence: "high" | "medium" | "low",
    // high:   explicit offset, city match, or unambiguous abbreviation found
    // medium: ambiguous abbreviation resolved via context clues or user region
    // low:    no timezone signal in text — fell back to user's local timezone
  confidenceDetail: string,         // Human-readable explanation, e.g.:
    // "Detected EST (Eastern Standard Time)"
    // "Assumed CST → America/Chicago (ambiguous, no context clues)"
    // "No timezone detected — using your local time (America/New_York)"

  // Range support
  isRange: boolean,                 // true if input contained a time range
  rangeEndUtcDate: Date | null,     // UTC Date for range end (null if not a range)

  // Metadata
  explicitOffset: number | null,    // Extracted GMT/UTC offset in minutes (null if none)
  hasExplicitDate: boolean,         // true if a date was in the input (not just time)
  wallClock: { hour, minute, second, year, month, day },      // Parsed wall-clock components
  rangeEndWallClock: { ... } | null, // Wall-clock for range end

  // NEW fields
  detectedLocale: string,           // Locale used for parsing ("en", "de", "fr", etc.)
  cityMatch: string | null,         // City name if detected ("London", "Tokyo", null)
}
```

Returns `null` if the input is unparseable (no time found, bare number, date-only, etc.).

### Breaking changes from current API
- `confidence` now returns 3 levels (`"high"`, `"medium"`, `"low"`) instead of 2
- New fields added: `confidenceDetail`, `detectedLocale`, `cityMatch`
- `popup.js` must be updated to handle `"medium"` confidence and display the confidence indicator

## Stage 1: HTML Sanitizer (`sanitizer.js`)

Thin layer that cleans raw website text.

**Responsibilities:**
- Strip HTML tags — replace block-level tags (`<br>`, `<div>`, `<p>`) with spaces, remove inline tags
- Decode HTML entities (`&nbsp;` → space, `&amp;` → `&`, `&#8211;` → `–`)
- Normalize Unicode whitespace (non-breaking spaces, zero-width chars, thin spaces)
- Collapse multiple whitespace/newlines into single spaces
- Strip leading/trailing junk (bullets `•`, arrows `→`, list markers)
- Preserve parentheses, brackets, slashes — these carry timezone info
- **Truncate to 500 characters** after sanitization (with word-boundary awareness)

**Does NOT:** parse times, change case, extract timezones.

**Example:**
```
Input:  "<span class='time'>3:00&nbsp;PM</span> <br> (GMT&#8211;5:00) Eastern&nbsp;[US &amp; Canada]"
Output: "3:00 PM (GMT-5:00) Eastern [US & Canada]"
```

## Stage 2: Tokenizer/Normalizer (`tokenizer.js`)

Split into two phases to preserve locale-specific text for chrono's native parsers.

### Phase 2A: Non-destructive normalization (always runs)

**2A-1. AM/PM Normalization**
- Expand variants: `a.m.`, `A.M.`, `a.m`, `p.m.`, `P.M.` → `AM`/`PM`
- Normalize case: `am` → `AM`, `pm` → `PM`

**2A-2. Glued Token Splitting**
Split time glued to timezone abbreviations:
```
"3pmEST"     → "3 PM EST"
"12amCET"    → "12 AM CET"
"2:30pmIST"  → "2:30 PM IST"
"3PMEST"     → "3 PM EST"
"3pm(EST)"   → "3 PM (EST)"
"15:00CET"   → "15:00 CET"
```

Regex strategy: `(\d{1,2}(?::\d{2})?)\s*(am|pm|a\.m\.|p\.m\.)\s*([A-Za-z]{2,5})` — insert spaces between time, meridiem, and abbreviation. Also `(\d{2}:\d{2})([A-Za-z]{2,5})` for 24h glued.

**2A-3. Timezone Abbreviation Case Normalization**
- Only uppercase tokens that appear **adjacent to a time expression** (within 2 tokens of a `\d{1,2}(:\d{2})?\s*(AM|PM)?` pattern)
- Proximity is **directional**: scan forward and backward from each time pattern, counting only whitespace-delimited tokens. Intervening non-abbreviation words (like `"at"`, `"the"`, `"is"`) break the proximity chain — only the immediate neighbors of the time pattern qualify.
- This prevents false positives: `"3pm est"` → `"3 PM EST"` (adjacent), but `"the meeting est at 3pm"` → `"est"` stays lowercase (intervening words break chain)
- Known abbreviation list used as allowlist — only recognized abbreviations are uppercased

**2A-4. Punctuation Normalization** (carried over)
- Em-dash `—` and en-dash `–` → hyphen `-`
- `noon` → `12:00 PM`, `midnight` → `12:00 AM`
- Collapse whitespace

**2A-5. Slash-separated Time Handling** (carried over)
- `3pm BST / 10am ET` → take first: `3pm BST`
- Protect date slashes: `3/15/2025` stays intact

### Phase 2B: International format normalization (runs only when locale == en)

Convert non-English time notation to chrono-parseable English form. This phase is skipped when a non-English locale is detected, because chrono's native locale parsers handle their own formats.

```
"15h00"       → "15:00"        (French — only if chrono.fr didn't parse it)
"15h30"       → "15:30"        (French)
"15.30 Uhr"  → "15:30"        (German — only if chrono.de didn't parse it)
"kl. 15.30"  → "15:30"        (Scandinavian)
"下午3點"     → "3:00 PM"      (Chinese — time expressions only, not dates)
"午後3時"     → "3:00 PM"      (Japanese — time expressions only, not dates)
"오후 3시"    → "3:00 PM"      (Korean — time expressions only, not dates)
"15ч00"       → "15:00"        (Russian informal)
```

**Note on CJK/Korean:** Normalization covers **time expressions only**. Date components in these languages (e.g., `"3月17日"` = March 17) are not normalized and will be lost. If a full CJK date+time is needed, the `zh` or `ja` chrono locale parser handles it natively in Stage 4.

**Output:** `{ normalizedText, rawText }` (`rawText` is the true pre-Stage-2 input, preserved for locale detection in Stage 4)

## Stage 3: City & Timezone Extractor (`city-extractor.js`)

**Extraction only** — this stage finds timezone signals and returns them as structured data. It does NOT resolve the final IANA timezone. All resolution happens in Stage 5.

### Timezone Data Module (`timezone-data.js`)

Static data module powering both the extractor and the dropdown UI:

- **Full IANA zone list** (~400 zones) — generated at build time from `Intl.supportedValuesOf('timeZone')`
- **City dictionary** (~300 entries) — maps city names/aliases to IANA zones:
  - `"london"` → `Europe/London`
  - `"new york"` / `"nyc"` → `America/New_York`
  - `"tokyo"` / `"東京"` → `Asia/Tokyo`
  - `"mumbai"` / `"bombay"` → `Asia/Kolkata`
  - Includes common aliases and native-script names
  - **Blocklist:** Common English words that are also city names are excluded from pattern matching unless preceded by a signal word (`"in"`, `"time"`). Blocklisted cities: `Nice`, `Reading`, `Bath`, `Mobile`, `Victoria`, `Regina`, `Orange`, `Paris` (Paris is allowed only with `"time"` signal since it's well-known enough). This prevents `"3pm in Nice weather"` from matching Nice, France.
- **Country dictionary** — maps country names to primary zone:
  - `"india"` → `Asia/Kolkata`, `"japan"` → `Asia/Tokyo`
- **Abbreviation map** — expanded from ~37 to ~60 (adds `AEST`, `NZST`, `WIB`, `ICT`, `PKT`, `NPT`, etc.)
- **Verbose name map** — expanded from ~26 to ~50

### Extraction Pipeline (priority order)

The extractor scans normalized text and collects ALL signals found, tagged by type. It does not pick a winner — Stage 5 does that.

1. **GMT/UTC explicit offsets** (highest signal quality)
   - `(GMT-5:00)`, `UTC+5:30`, `GMT-5` → extract offset minutes
   - Carried over from current preprocessor

2. **Verbose timezone names**
   - `"Pacific Standard Time"`, `"Central European Summer Time"` → IANA zone
   - Longest-first matching to avoid partial matches

3. **City/country patterns** (NEW)
   - `"{time} in {city}"` → `"3pm in London"` — `{city}` must be at end of string or followed by punctuation/timezone/EOL
   - `"{time} {city} time"` → `"3pm Tokyo time"` — requires `"time"` keyword as anchor
   - `"{city} {time}"` → `"London 3pm"` — `{city}` must be at start of string or preceded by punctuation
   - Case-insensitive, accent-insensitive, native script support
   - Country matching: `"3pm India time"` → `Asia/Kolkata`
   - **False positive mitigation:** Only multi-word city names (`"New York"`, `"São Paulo"`) match freely. Single-word cities require a signal word (`"in"`, `"time"`) or position anchoring (start/end of string) unless the city is unambiguous and well-known (population > 1M and not a common English word).

4. **Timezone abbreviations**
   - Scans the **Stage 2A normalized text** (not originalText) so glued tokens like `3pmEST` → `3 PM EST` are correctly detected with word boundaries
   - Expanded map, same disambiguation logic
   - Ambiguous abbreviations collect context clues for Stage 5

5. **Bracket context clues**
   - `[US & Canada]`, `[China]` → stored as disambiguation hints for Stage 5

After extraction, timezone/city tokens are stripped from text so chrono gets clean input.

**Output:**
```javascript
{
  cleanedText: "3:00 PM",           // timezone tokens removed for chrono
  signals: {
    offset: -300,                    // or null — extracted GMT/UTC offset in minutes
    verboseName: "Eastern Standard Time",  // or null
    cityMatch: "London",             // or null — matched city name
    cityZone: "Europe/London",       // or null — IANA zone for matched city
    abbreviation: "EST",             // or null
    contextClues: ["US", "Canada"],  // array of disambiguation hints
  },
  normalizedInputText: "3:00 PM EST"  // Stage 2A output (post-normalization, pre-extraction)
}
```

## Stage 4: Locale Detection + Chrono Parse (modified `chrono-bundle.js`)

### Locale Detection

Runs on the **original text** (pre-Stage 2) to preserve locale cues that normalization might destroy.

Keyword/pattern matching:

| Detected cue | Locale | Chrono parser |
|---|---|---|
| `"Uhr"`, `"Montag"`, `"März"` | de | `chrono.de.strict` |
| `"heure"`, `"lundi"`, `"mars"`, `"15h00"` | fr | `chrono.fr.strict` |
| `"午後"`, `"時"`, `"月曜"` | ja | `chrono.ja.strict` |
| `"manhã"`, `"segunda"`, `"terça"` | pt | `chrono.pt.strict` |
| `"maandag"`, `"uur"` | nl | `chrono.nl.strict` |
| `"tarde"`, `"lunes"`, `"martes"` | es | `chrono.es.strict` |
| `"上午"`, `"下午"`, `"星期"` | zh | `chrono.zh.strict` |
| `"утра"`, `"вечера"`, `"понедельник"` | ru | `chrono.ru.strict` |
| `"alle"`, `"ora"`, `"lunedì"` | it | `chrono.it.strict` |
| `"klockan"`, `"måndag"`, `"tisdag"` | sv | `chrono.sv.strict` |
| No match | en | `chrono.strict` |

**All 12 chrono-node locales** are included: en, de, fr, ja, pt, nl, es, zh, ru, it, sv, uk (Ukrainian). Ukrainian has no explicit detection cues — it activates via the fallback chain if English parsing fails.

### Parsing Flow

```
1. Detect locale from originalText
2. If locale != en:
   a. Feed Stage 2A output (non-destructive normalization only) to locale parser
   b. If locale parser returns a result → use it
   c. If locale parser fails → apply Stage 2B normalization → try chrono.strict (en)
3. If locale == en:
   a. Apply Stage 2B normalization (international formats → English)
   b. Feed to chrono.strict
4. If still no result → return null (unparseable)
```

### Additional locale fallback

For the 3 locales without explicit detection cues (it, sv, uk): if the English parser returns null, try each of these parsers in sequence as a last resort before returning null. This adds negligible latency since it only runs on otherwise-unparseable input.

**Existing logic unchanged:** rejection rules (bare numbers, date-only, abbreviation-only), range detection, wall-clock extraction.

**Bundle impact:** ~261KB → ~500-600KB (all 12 chrono locales + expanded timezone data). Acceptable per design decision.

## Stage 5: Timezone Resolution (modified `timezone-resolver.js`)

**Stage 5 is the sole timezone resolver in the pipeline.** Stage 3 extracts signals; Stage 5 consumes them and makes the final decision.

### Resolution Priority (single canonical ordering)

```
1. Explicit offset (GMT-5, UTC+5:30)               ← highest, unambiguous
2. Verbose timezone name                            ← unambiguous
3. City/country match                               ← unambiguous (from Stage 3 cityZone)
4. Unambiguous abbreviation (EST, PST, JST, etc.)   ← single mapping
5. Ambiguous abbreviation (CST, IST, BST, etc.)     ← uses context clues + user region
6. User timezone fallback                            ← lowest, when no signal found
```

### Changes from current

**Full IANA zone matching:** All ~400 zones imported from `timezone-data.js`, used in offset validation.

**City match integration:** If Stage 3 found `cityZone`, it's used directly at priority 3 — no disambiguation needed.

**Abbreviation extraction moved:** The `extractTimezoneAbbreviation()` function currently in `chrono-bundle.js` (which scans `originalText`) is replaced by Stage 3's abbreviation extraction (which scans Stage 2A normalized text). This ensures glued tokens like `3pmEST` → `3 PM EST` are correctly detected via word boundaries.

**Expanded abbreviation map:** ~37 → ~60 unambiguous, 5 → 8 ambiguous.

**New ambiguous abbreviations with full disambiguation rules:**
- `WAT`: Africa/Lagos (default). Context: `"Nigeria"`, `"West Africa"` → Africa/Lagos
- `EAT`: Africa/Nairobi (default). Context: `"Kenya"`, `"East Africa"` → Africa/Nairobi
- `WET`: Europe/Lisbon (default). Context: `"Portugal"`, `"Lisbon"` → Europe/Lisbon, `"Morocco"`, `"Casablanca"` → Africa/Casablanca
- `SST`: Pacific/Pago_Pago (default — Samoa Standard Time). Singapore is already covered by `SGT` in the unambiguous map, so `SST` defaults to Samoa. Context: `"Samoa"`, `"Pago Pago"` → Pacific/Pago_Pago

**3-level confidence model:**
- `high`: explicit offset, verbose name, city match, or unambiguous abbreviation
- `medium`: ambiguous abbreviation resolved via context clues or user region guess
- `low`: no timezone signal found, using user's local timezone

Each level produces a `confidenceDetail` string for the UI (see API Contract).

**Existing logic unchanged:** core disambiguation algorithm, Intl offset verification via `getOffsetAtDate()`, all current tests pass.

## Stage 6: Date Construction (unchanged)

`date-constructor.js` is unchanged. Wall-clock → UTC conversion via `Intl.DateTimeFormat` continues to handle DST gaps, half-hour offsets, cross-day boundaries.

## UI Changes

### Full IANA Dropdown

Replace 40-zone dropdown with ~400 IANA zones:

```
[Search box — filters as you type]
─────────────────────────────────
★ Recent (last 5 used zones)
─────────────────────────────────
Americas
  New York (UTC-05:00) — Eastern Standard Time
  Chicago (UTC-06:00) — Central Standard Time
  ...
Europe
  London (UTC+00:00) — Greenwich Mean Time
  Paris (UTC+01:00) — Central European Time
  ...
Asia
  Tokyo (UTC+09:00) — Japan Standard Time
  ...
Africa / Pacific / Australia / Antarctica
```

- **Grouped by continent** from IANA identifier prefix
- **Each entry:** city name + current UTC offset + long timezone name
- **Search matches:** city, country, abbreviation, offset, long name
- **Recent zones** pinned at top (chrome.storage.local, existing TTL pattern)
- **Offsets dynamic** via `Intl.DateTimeFormat` — always current DST state

### Confidence Indicator

Shown between input and result when confidence is medium or low:

- **High:** nothing shown — clean result
- **Medium:** amber bar — shows `confidenceDetail` (e.g., `"Assumed: CST → US Central"`) with `[Change ▾]` button that opens the From timezone picker
- **Low:** amber bar — shows `confidenceDetail` (e.g., `"No timezone detected — using your local time"`) with `[Change ▾]` button

Clicking `[Change]` sets the From dropdown and re-converts immediately.

### popup.js Changes

- Replace `extractTimezoneAbbreviation()` call — abbreviation now comes from Stage 3 signals
- Handle 3-level `confidence` from parse result (currently only handles `"high"` / `"low"`)
- Render confidence indicator bar with `confidenceDetail` text
- Replace 40-zone dropdown with full IANA dropdown (data from `timezone-data.js`)
- Add continent grouping and recent zones UI

### No Other UI Changes

Glassmorphic design, result display, copy button, Now button, range formatting — all unchanged.

## Testing Strategy

### Existing Tests — All Preserved

All 65 current tests pass (18 preprocessor + 12 chrono-bundle + 13 timezone-resolver + 8 date-constructor + 14 integration). Deprecated `preprocessor.js` tests migrated to `sanitizer.js` + `tokenizer.js`.

### New Test Suites

```
test/
├── sanitizer.test.js          (~15 tests)
├── tokenizer.test.js          (~25 tests)
├── city-extractor.test.js     (~20 tests)
├── timezone-data.test.js      (~10 tests)
├── chrono-bundle.test.js      (existing 12 + ~15 new locale tests)
├── timezone-resolver.test.js  (existing 13 + ~10 new expansion tests)
├── date-constructor.test.js   (existing 8, unchanged)
├── integration.test.js        (existing 14 + ~35 new real-world tests)
└── confidence.test.js         (~10 tests)
```

### Key Test Categories

**Sanitizer:** HTML tags, entities, Unicode whitespace, bullet stripping, preserves timezone punctuation, truncation at 500 chars

**Tokenizer Phase 2A:**
- Glued tokens: `3pmEST`, `12amCET`, `2:30pmIST`, `15:00CET`
- Case variants: `3pm est`, `3PM EST`, `3Pm eSt`
- AM/PM variants: `a.m.`, `A.M.`, `p.m.`
- Proximity-based abbreviation uppercasing: `"3pm est"` → uppercase, `"Paris est belle"` → no change
- Slash handling, noon/midnight, dash normalization

**Tokenizer Phase 2B:**
- International: `15h00`, `15.30 Uhr`, `kl. 15.30`, `午後3時`, `오후 3시`
- Only runs when locale == en

**City extractor:**
- Patterns: `"3pm in London"`, `"noon Tokyo time"`, `"London 3pm"`, `"3pm India time"`
- Native script: `"3pm 東京"`, `"3pm 런던"`
- False positive rejection: `"3pm in Nice weather"` → no city match, `"3pm in Nice"` → Nice, France
- Blocklisted words: `"Reading 3pm"` → no match (common English word)
- Offset extraction, abbreviation extraction, context clues
- Output is signals only — no resolution

**Locale detection:**
- German, French, Japanese, Spanish, Chinese, Russian text → correct locale router
- Mixed language → English fallback
- Italian/Swedish/Ukrainian → fallback chain

**Timezone resolution:**
- Priority ordering: offset > verbose > city > unambiguous abbrev > ambiguous abbrev > fallback
- New ambiguous abbreviations: WAT, EAT, WET, SST with context keywords
- SST defaults to Samoa (Singapore covered by SGT)
- 3-level confidence with detail strings

**Integration (real-world corpus, ~35 new):**
```
"3:00 PM EST"                              → high, America/New_York
"3pmEST"                                   → high, America/New_York
"3pm est"                                  → high, America/New_York
"3:00 p.m. Eastern Standard Time"          → high, America/New_York
"15h00 CET"                                → high, Europe/Paris
"3pm in London"                            → high, Europe/London
"Meeting at 3pm Tokyo time"                → high, Asia/Tokyo
"3:00 PM (GMT-5:00) Eastern [US & Canada]" → high, America/New_York
"Montag, 15.30 Uhr MEZ"                   → high, Europe/Paris (de locale)
"lunes a las 3 de la tarde EST"            → high, America/New_York (es locale)
"下午3點 CST"                               → high (zh locale, CST context)
"3:00 PM"                                  → low, user's local timezone
"3pm CST"                                  → medium, America/Chicago (default)
"3pm in Nice weather"                      → no city match ("Nice" followed by non-timezone word)
"3pm in Nice"                              → high, Europe/Paris (signal word "in" overrides blocklist)
"Paris est belle at 3pm"                   → "est" not uppercased (>2 tokens from time, intervening words break proximity)
```

**Target: ~160 total tests** (65 existing + ~95 new)

## Migration Path

1. Build new stages (sanitizer, tokenizer, city-extractor, timezone-data) alongside existing code
2. Modify chrono-bundle.js: add locale routing, split Phase 2A/2B, update `parse()` return contract
3. Expand timezone-resolver.js: sole resolver, full IANA, new ambiguous abbreviations, 3-level confidence
4. Update popup.js: full IANA dropdown, confidence indicator, handle new API fields
5. Deprecate preprocessor.js (keep file, remove from pipeline)
6. Move `extractTimezoneAbbreviation()` from chrono-bundle.js into Stage 3 (city-extractor)
7. Migrate preprocessor tests to new test suites
8. Run full test suite — all ~160 tests pass
9. Build new bundle (`npm run build`) — verify bundle size ~500-600KB
