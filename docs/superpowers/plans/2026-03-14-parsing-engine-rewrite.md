# TimeShift v2.0 Parsing Engine Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace moment.js + hand-rolled regex parsing with chrono-node NLP + native Intl APIs for bulletproof timezone conversion.

**Architecture:** 4-stage pipeline (pre-processor → chrono-node parse → timezone resolution → UTC date construction) exposed via `window.TimeShiftParser.parse()` global. Build with esbuild. UI code in popup.js calls the bundle API.

**Tech Stack:** chrono-node v2.9.x, esbuild, Intl.DateTimeFormat, Node.js test runner (requires Node 18+ for `Intl.supportedValuesOf`)

**Note:** The extension will be non-functional between Task 6 (HTML script tag swap) and Task 8 completion (popup.js rewrite). Do not test in Chrome until Task 8 is done.

**Spec:** `docs/superpowers/specs/2026-03-14-parsing-engine-rewrite-design.md`

---

## Chunk 1: Build System + Date Constructor (Foundation)

### Task 1: Initialize npm project and build pipeline

**Files:**
- Create: `package.json`
- Create: `.gitattributes`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "timeshift-extension",
  "version": "2.0.0",
  "private": true,
  "description": "TimeShift: Global Timezone Converter - Chrome Extension",
  "scripts": {
    "build": "esbuild src/chrono-bundle.js --bundle --minify --outfile=libs/chrono.bundle.js --format=iife --global-name=TimeShiftParser",
    "build:dev": "esbuild src/chrono-bundle.js --bundle --outfile=libs/chrono.bundle.js --format=iife --global-name=TimeShiftParser --sourcemap",
    "test": "node --test test/*.test.js"
  },
  "devDependencies": {
    "esbuild": "^0.25.0"
  },
  "dependencies": {
    "chrono-node": "^2.9.0"
  }
}
```

- [ ] **Step 2: Create .gitattributes**

```
libs/chrono.bundle.js linguist-generated=true
libs/chrono.bundle.js.map linguist-generated=true
```

- [ ] **Step 3: Install dependencies**

Run: `cd /Users/akhilsaxena/Documents/TimeShift-Extension-Final-v1.2.0 && npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 4: Add node_modules to .gitignore**

Create `.gitignore`:
```
node_modules/
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitattributes .gitignore
git commit -m "chore: initialize npm project with chrono-node and esbuild"
```

---

### Task 2: Date Constructor module (Stage 4)

This is the most algorithmically critical piece — build and test it first.

**Files:**
- Create: `src/date-constructor.js`
- Create: `test/date-constructor.test.js`

- [ ] **Step 1: Write failing tests for constructDateInTimezone**

File: `test/date-constructor.test.js`

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { constructDateInTimezone } = require('../src/date-constructor.js');

describe('constructDateInTimezone', () => {
    it('constructs 3 PM Eastern (EST) as correct UTC', () => {
        // Jan 15, 2025 3:00 PM in America/New_York (EST = UTC-5)
        // Expected UTC: Jan 15, 2025 8:00 PM (20:00)
        const result = constructDateInTimezone(2025, 0, 15, 15, 0, 0, 'America/New_York');
        assert.equal(result.getUTCHours(), 20);
        assert.equal(result.getUTCMinutes(), 0);
        assert.equal(result.getUTCDate(), 15);
        assert.equal(result.getUTCMonth(), 0);
    });

    it('constructs 3 PM Eastern (EDT) as correct UTC', () => {
        // Jul 15, 2025 3:00 PM in America/New_York (EDT = UTC-4)
        // Expected UTC: Jul 15, 2025 7:00 PM (19:00)
        const result = constructDateInTimezone(2025, 6, 15, 15, 0, 0, 'America/New_York');
        assert.equal(result.getUTCHours(), 19);
        assert.equal(result.getUTCMinutes(), 0);
    });

    it('constructs midnight correctly', () => {
        // Jan 1, 2025 0:00 AM in Asia/Kolkata (IST = UTC+5:30)
        // Expected UTC: Dec 31, 2024 6:30 PM (18:30)
        const result = constructDateInTimezone(2025, 0, 1, 0, 0, 0, 'Asia/Kolkata');
        assert.equal(result.getUTCHours(), 18);
        assert.equal(result.getUTCMinutes(), 30);
        assert.equal(result.getUTCDate(), 31);
        assert.equal(result.getUTCMonth(), 11); // December
        assert.equal(result.getUTCFullYear(), 2024);
    });

    it('handles half-hour offset (IST +5:30)', () => {
        // Jan 15, 2025 10:00 AM in Asia/Kolkata (IST = UTC+5:30)
        // Expected UTC: Jan 15, 2025 4:30 AM
        const result = constructDateInTimezone(2025, 0, 15, 10, 0, 0, 'Asia/Kolkata');
        assert.equal(result.getUTCHours(), 4);
        assert.equal(result.getUTCMinutes(), 30);
    });

    it('handles DST spring-forward gap (snaps forward)', () => {
        // Mar 9, 2025 2:30 AM in America/New_York does NOT exist
        // Clocks jump from 2:00 AM to 3:00 AM
        // Should snap forward to 3:00 AM EDT (UTC-4) = 7:00 AM UTC
        const result = constructDateInTimezone(2025, 2, 9, 2, 30, 0, 'America/New_York');
        // The result should be valid and near 7:00 AM UTC
        assert.ok(result instanceof Date);
        assert.ok(!isNaN(result.getTime()));
        // After snap-forward, the time in New York should be 3:00 AM or later
        const nyFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric', minute: 'numeric',
            hourCycle: 'h23'
        });
        const parts = nyFormatter.formatToParts(result);
        const hour = parseInt(parts.find(p => p.type === 'hour').value);
        assert.ok(hour >= 3, `Expected hour >= 3 after spring-forward, got ${hour}`);
    });

    it('handles UTC timezone', () => {
        // Jan 15, 2025 10:00 AM UTC
        // Expected: same time in UTC
        const result = constructDateInTimezone(2025, 0, 15, 10, 0, 0, 'UTC');
        assert.equal(result.getUTCHours(), 10);
        assert.equal(result.getUTCMinutes(), 0);
    });

    it('handles negative offset (US Pacific PST)', () => {
        // Jan 15, 2025 10:00 AM in America/Los_Angeles (PST = UTC-8)
        // Expected UTC: Jan 15, 2025 6:00 PM (18:00)
        const result = constructDateInTimezone(2025, 0, 15, 10, 0, 0, 'America/Los_Angeles');
        assert.equal(result.getUTCHours(), 18);
        assert.equal(result.getUTCMinutes(), 0);
    });

    it('handles large positive offset (NZDT +13)', () => {
        // Jan 15, 2025 10:00 AM in Pacific/Auckland (NZDT = UTC+13)
        // Expected UTC: Jan 14, 2025 9:00 PM (21:00) — previous day
        const result = constructDateInTimezone(2025, 0, 15, 10, 0, 0, 'Pacific/Auckland');
        assert.equal(result.getUTCDate(), 14);
        assert.equal(result.getUTCHours(), 21);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/akhilsaxena/Documents/TimeShift-Extension-Final-v1.2.0 && node --test test/date-constructor.test.js`
Expected: FAIL — `Cannot find module '../src/date-constructor.js'`

- [ ] **Step 3: Implement constructDateInTimezone**

File: `src/date-constructor.js`

```js
/**
 * Date Constructor — Stage 4 of the parsing pipeline.
 * Converts wall-clock time components in a source timezone to a UTC Date object.
 *
 * Uses Intl.DateTimeFormat to compute offsets — no moment-timezone dependency.
 */

/**
 * Construct a UTC Date from wall-clock components in a given IANA timezone.
 *
 * @param {number} year - Full year (e.g., 2025)
 * @param {number} month - Month (0-indexed: 0=January, 11=December)
 * @param {number} day - Day of month (1-31)
 * @param {number} hour - Hour (0-23)
 * @param {number} minute - Minute (0-59)
 * @param {number} second - Second (0-59)
 * @param {string} ianaZone - IANA timezone name (e.g., 'America/New_York')
 * @returns {Date} UTC Date object
 */
function constructDateInTimezone(year, month, day, hour, minute, second, ianaZone) {
    // Step 1: Create a rough UTC estimate (treat wall-clock as if it were UTC)
    const roughUtc = new Date(Date.UTC(year, month, day, hour, minute, second));

    // Step 2: Format roughUtc in the source timezone to see what wall-clock
    // time it corresponds to there.
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hourCycle: 'h23'
    });

    // Step 3: Compute offset from the formatted parts
    const offsetMs = computeOffsetMs(formatter, roughUtc);

    // Step 4: Adjust — the real UTC is the desired wall-clock minus the offset
    const realUtc = new Date(roughUtc.getTime() - offsetMs);

    // Step 5: Verify by round-tripping — format realUtc in source timezone
    // and confirm it matches the original wall-clock components
    const verifyParts = formatter.formatToParts(realUtc);
    const vHour = parseInt(verifyParts.find(p => p.type === 'hour').value);
    const vMinute = parseInt(verifyParts.find(p => p.type === 'minute').value);
    const vDay = parseInt(verifyParts.find(p => p.type === 'day').value);

    if (vHour !== hour || vMinute !== minute || vDay !== day) {
        // Mismatch — we're near a DST transition. Apply second-pass correction.
        const secondOffsetMs = computeOffsetMs(formatter, realUtc);
        return new Date(roughUtc.getTime() - secondOffsetMs);
    }

    return realUtc;
}

/**
 * Compute the timezone offset in milliseconds by comparing a UTC timestamp
 * to what it looks like when formatted in the target timezone.
 */
function computeOffsetMs(formatter, utcDate) {
    const parts = formatter.formatToParts(utcDate);
    const get = (type) => parseInt(parts.find(p => p.type === type).value);

    const tzYear = get('year');
    const tzMonth = get('month') - 1; // JS months are 0-indexed
    const tzDay = get('day');
    const tzHour = get('hour');
    const tzMinute = get('minute');
    const tzSecond = get('second');

    const tzWallMs = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond);
    return tzWallMs - utcDate.getTime();
}

module.exports = { constructDateInTimezone };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/akhilsaxena/Documents/TimeShift-Extension-Final-v1.2.0 && node --test test/date-constructor.test.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/date-constructor.js test/date-constructor.test.js
git commit -m "feat: add date-constructor module (Stage 4 — wall-clock to UTC)"
```

---

### Task 3: Pre-processor module (Stage 1)

**Files:**
- Create: `src/preprocessor.js`
- Create: `test/preprocessor.test.js`

- [ ] **Step 1: Write failing tests for preprocess**

File: `test/preprocessor.test.js`

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { preprocess } = require('../src/preprocessor.js');

describe('preprocess', () => {
    describe('parenthetical offset extraction', () => {
        it('extracts (GMT-5:00) offset', () => {
            const result = preprocess('12 PM (GMT-5:00) Eastern [US & Canada]');
            assert.equal(result.extractedOffset, -300);
            assert.ok(!result.cleanedText.includes('(GMT-5:00)'));
        });

        it('extracts (UTC+01:00) offset', () => {
            const result = preprocess('3:00 PM (UTC+01:00)');
            assert.equal(result.extractedOffset, 60);
            assert.ok(!result.cleanedText.includes('(UTC+01:00)'));
        });

        it('extracts (GMT+5:30) offset', () => {
            const result = preprocess('10 AM (GMT+5:30)');
            assert.equal(result.extractedOffset, 330);
        });

        it('returns null offset when none found', () => {
            const result = preprocess('3:00 PM EST');
            assert.equal(result.extractedOffset, null);
        });
    });

    describe('bracket context clue extraction', () => {
        it('extracts context clues from [US & Canada]', () => {
            const result = preprocess('12 PM (GMT-5:00) Eastern [US & Canada]');
            assert.ok(result.contextClues.includes('US'));
            assert.ok(result.contextClues.includes('Canada'));
            assert.ok(!result.cleanedText.includes('['));
            assert.ok(!result.cleanedText.includes(']'));
        });

        it('handles no brackets', () => {
            const result = preprocess('3:00 PM EST');
            assert.deepEqual(result.contextClues.filter(c => c === 'US' || c === 'Canada'), []);
        });
    });

    describe('verbose timezone name extraction', () => {
        it('extracts "Eastern" as context clue', () => {
            const result = preprocess('12 PM (GMT-5:00) Eastern [US & Canada]');
            assert.ok(result.contextClues.includes('Eastern'));
        });

        it('extracts "Pacific Standard Time"', () => {
            const result = preprocess('3 PM Pacific Standard Time');
            assert.ok(result.contextClues.includes('Pacific Standard Time'));
        });

        it('extracts "Central European Time"', () => {
            const result = preprocess('7 PM Central European Time');
            assert.ok(result.contextClues.includes('Central European Time'));
        });
    });

    describe('slash-separated time splitting', () => {
        it('takes first time from slash-separated pair', () => {
            const result = preprocess('3pm BST / 10am ET');
            assert.ok(result.cleanedText.includes('3pm'));
            assert.ok(!result.cleanedText.includes('10am'));
        });

        it('does NOT split date slashes like 3/15/2025', () => {
            const result = preprocess('3/15/2025 3pm ET');
            assert.ok(result.cleanedText.includes('3/15/2025'));
        });
    });

    describe('normalization', () => {
        it('normalizes noon to 12:00 PM', () => {
            const result = preprocess('12:00 noon');
            assert.ok(result.cleanedText.includes('12:00 PM'));
        });

        it('normalizes midnight to 12:00 AM', () => {
            const result = preprocess('12:00 midnight');
            assert.ok(result.cleanedText.includes('12:00 AM'));
        });

        it('normalizes em-dash to hyphen', () => {
            const result = preprocess('3 PM — 5 PM');
            assert.ok(result.cleanedText.includes('-'));
            assert.ok(!result.cleanedText.includes('—'));
        });

        it('normalizes en-dash to hyphen', () => {
            const result = preprocess('3 PM – 5 PM');
            assert.ok(result.cleanedText.includes('-'));
        });
    });

    describe('preserves original text', () => {
        it('stores originalText unchanged', () => {
            const input = '12 PM (GMT-5:00) Eastern [US & Canada]';
            const result = preprocess(input);
            assert.equal(result.originalText, input);
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/preprocessor.test.js`
Expected: FAIL — `Cannot find module '../src/preprocessor.js'`

- [ ] **Step 3: Implement preprocessor**

File: `src/preprocessor.js`

```js
/**
 * Pre-processor — Stage 1 of the parsing pipeline.
 * Normalizes messy real-world text and extracts metadata (offsets, context clues)
 * into a side-channel object before stripping them from the text.
 */

// Verbose timezone names to extract as context clues
const VERBOSE_TIMEZONE_NAMES = [
    'Pacific Standard Time', 'Pacific Daylight Time', 'Pacific Time',
    'Eastern Standard Time', 'Eastern Daylight Time', 'Eastern Time',
    'Central Standard Time', 'Central Daylight Time', 'Central Time',
    'Mountain Standard Time', 'Mountain Daylight Time', 'Mountain Time',
    'Greenwich Mean Time', 'Coordinated Universal Time',
    'Central European Time', 'Central European Summer Time',
    'Eastern European Time', 'Eastern European Summer Time',
    'British Summer Time', 'India Standard Time',
    'Japan Standard Time', 'China Standard Time',
    'Australian Eastern Standard Time', 'Australian Eastern Daylight Time',
    'New Zealand Standard Time', 'New Zealand Daylight Time'
];

// Single-word timezone region names to extract
const SINGLE_WORD_TIMEZONE_NAMES = [
    'Eastern', 'Western', 'Central', 'Pacific', 'Mountain', 'Atlantic'
];

/**
 * Pre-process raw input text for the parsing pipeline.
 *
 * @param {string} rawText - Raw input from user or context menu
 * @returns {{
 *   cleanedText: string,
 *   extractedOffset: number|null,
 *   contextClues: string[],
 *   originalText: string
 * }}
 */
function preprocess(rawText) {
    const contextClues = [];
    let text = rawText;

    // 1. Extract parenthetical offsets: (GMT-5:00), (UTC+01:00), (GMT+5:30)
    const offsetRegex = /\((?:GMT|UTC)\s*([+-])\s*(\d{1,2}):?(\d{2})?\)/gi;
    let extractedOffset = null;
    const offsetMatch = offsetRegex.exec(text);
    if (offsetMatch) {
        const sign = offsetMatch[1] === '+' ? 1 : -1;
        const hours = parseInt(offsetMatch[2]);
        const minutes = offsetMatch[3] ? parseInt(offsetMatch[3]) : 0;
        extractedOffset = sign * (hours * 60 + minutes);
        text = text.replace(offsetMatch[0], ' ');
    }

    // 2. Extract bracket content as context clues: [US & Canada]
    const bracketRegex = /\[([^\]]+)\]/g;
    let bracketMatch;
    while ((bracketMatch = bracketRegex.exec(text)) !== null) {
        const content = bracketMatch[1];
        // Split on common separators: &, and, ,
        const parts = content.split(/\s*(?:&|and|,)\s*/);
        parts.forEach(p => {
            const trimmed = p.trim();
            if (trimmed) contextClues.push(trimmed);
        });
    }
    text = text.replace(/\[[^\]]+\]/g, ' ');

    // 3. Extract verbose timezone names as context clues (longest match first)
    // NOTE: Do NOT use regex.test() then regex.replace() with the same /gi regex —
    // test() advances lastIndex, causing replace() to miss the match.
    // Instead, attempt replace and check if text changed.
    const sortedVerbose = [...VERBOSE_TIMEZONE_NAMES].sort((a, b) => b.length - a.length);
    for (const name of sortedVerbose) {
        const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
        const newText = text.replace(regex, ' ');
        if (newText !== text) {
            contextClues.push(name);
            text = newText;
        }
    }

    // 4. Extract single-word timezone region names (only if followed by
    // non-alphanumeric or end-of-string, to avoid matching inside words)
    for (const name of SINGLE_WORD_TIMEZONE_NAMES) {
        const regex = new RegExp(`\\b${name}\\b(?!\\w)`, 'gi');
        const newText = text.replace(regex, ' ');
        if (newText !== text) {
            contextClues.push(name);
            text = newText;
        }
    }

    // 5. Handle slash-separated times: "3pm BST / 10am ET"
    // Only split when "/" is surrounded by whitespace AND both sides look like times
    const slashPattern = /^(.*?\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?.*?)\s+\/\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm).*)$/i;
    const slashMatch = text.match(slashPattern);
    if (slashMatch) {
        // Verify both sides have time-like patterns
        const timePattern = /\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)|\d{1,2}:\d{2}/i;
        if (timePattern.test(slashMatch[1]) && timePattern.test(slashMatch[2])) {
            text = slashMatch[1];
        }
    }

    // 6. Normalize noon/midnight
    text = text.replace(/\b12:00\s*noon\b/gi, '12:00 PM');
    text = text.replace(/\bnoon\b/gi, '12:00 PM');
    text = text.replace(/\b12:00\s*midnight\b/gi, '12:00 AM');
    text = text.replace(/\bmidnight\b/gi, '12:00 AM');

    // 7. Normalize em-dash and en-dash to hyphen (for range handling)
    text = text.replace(/[–—]/g, '-');

    // 8. Clean up extra whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return {
        cleanedText: text,
        extractedOffset: extractedOffset,
        contextClues: contextClues,
        originalText: rawText
    };
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { preprocess };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/preprocessor.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/preprocessor.js test/preprocessor.test.js
git commit -m "feat: add preprocessor module (Stage 1 — text normalization + metadata)"
```

---

## Chunk 2: Timezone Resolver + chrono-node Bundle

### Task 4: Timezone Resolver module (Stage 3)

**Files:**
- Create: `src/timezone-resolver.js`
- Create: `test/timezone-resolver.test.js`

- [ ] **Step 1: Write failing tests for resolveTimezone**

File: `test/timezone-resolver.test.js`

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTimezone } = require('../src/timezone-resolver.js');

describe('resolveTimezone', () => {
    describe('explicit offset resolution', () => {
        it('resolves offset -300 in January to America/New_York (EST)', () => {
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: -300,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'Asia/Kolkata'
            });
            assert.equal(result, 'America/New_York');
        });

        it('resolves offset -300 in July to America/Chicago (CDT)', () => {
            // In July, UTC-5 is CDT (Chicago), not EST (New York is UTC-4 in July)
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: -300,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 6, 15)),
                userTimezone: 'Asia/Kolkata'
            });
            // -300 in July: New York is EDT (UTC-4), so -300 must be CDT = Chicago
            assert.equal(result, 'America/Chicago');
        });

        it('resolves offset +330 to Asia/Kolkata', () => {
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: 330,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'UTC'
            });
            assert.equal(result, 'Asia/Kolkata');
        });
    });

    describe('abbreviation disambiguation', () => {
        it('resolves CST to America/Chicago by default', () => {
            const result = resolveTimezone({
                abbreviation: 'CST',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'America/New_York'
            });
            assert.equal(result, 'America/Chicago');
        });

        it('resolves CST to Asia/Shanghai with China context clue', () => {
            const result = resolveTimezone({
                abbreviation: 'CST',
                offsetMinutes: null,
                contextClues: ['Shanghai'],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'America/New_York'
            });
            assert.equal(result, 'Asia/Shanghai');
        });

        it('resolves IST to Asia/Kolkata for user in India', () => {
            const result = resolveTimezone({
                abbreviation: 'IST',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'Asia/Kolkata'
            });
            assert.equal(result, 'Asia/Kolkata');
        });

        it('resolves IST to Asia/Jerusalem for user in Israel', () => {
            const result = resolveTimezone({
                abbreviation: 'IST',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'Asia/Jerusalem'
            });
            assert.equal(result, 'Asia/Jerusalem');
        });

        it('resolves EST to America/New_York', () => {
            const result = resolveTimezone({
                abbreviation: 'EST',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'UTC'
            });
            assert.equal(result, 'America/New_York');
        });

        it('resolves ET to America/New_York', () => {
            const result = resolveTimezone({
                abbreviation: 'ET',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'UTC'
            });
            assert.equal(result, 'America/New_York');
        });
    });

    describe('context clue disambiguation', () => {
        it('uses "Eastern" context clue with offset -300', () => {
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: -300,
                contextClues: ['Eastern', 'US', 'Canada'],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'Asia/Kolkata'
            });
            assert.equal(result, 'America/New_York');
        });
    });

    describe('fallback behavior', () => {
        it('returns UTC when nothing can be resolved', () => {
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'America/New_York'
            });
            assert.equal(result, null);
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/timezone-resolver.test.js`
Expected: FAIL — `Cannot find module '../src/timezone-resolver.js'`

- [ ] **Step 3: Implement timezone resolver**

File: `src/timezone-resolver.js`

```js
/**
 * Timezone Resolver — Stage 3 of the parsing pipeline.
 * Maps abbreviations and UTC offsets to IANA timezone names using
 * priority-based disambiguation with context clues.
 */

// Unambiguous abbreviation → IANA mapping
const UNAMBIGUOUS_ABBREVIATIONS = {
    'EST': 'America/New_York',
    'EDT': 'America/New_York',
    'ET': 'America/New_York',
    'CST': 'America/Chicago',     // Ambiguous — overridden by context
    'CDT': 'America/Chicago',
    'CT': 'America/Chicago',
    'MST': 'America/Denver',
    'MDT': 'America/Denver',
    'MT': 'America/Denver',
    'PST': 'America/Los_Angeles',
    'PDT': 'America/Los_Angeles',
    'PT': 'America/Los_Angeles',
    'AKST': 'America/Anchorage',
    'AKDT': 'America/Anchorage',
    'HST': 'Pacific/Honolulu',
    'UTC': 'UTC',
    'GMT': 'UTC',
    'BST': 'Europe/London',       // Ambiguous — overridden by context
    'IST': 'Asia/Kolkata',        // Ambiguous — overridden by context
    'CET': 'Europe/Paris',
    'CEST': 'Europe/Paris',
    'EET': 'Europe/Helsinki',
    'EEST': 'Europe/Helsinki',
    'JST': 'Asia/Tokyo',
    'KST': 'Asia/Seoul',
    'SGT': 'Asia/Singapore',
    'HKT': 'Asia/Hong_Kong',
    'ICT': 'Asia/Bangkok',
    'WIB': 'Asia/Jakarta',
    'PHT': 'Asia/Manila',
    'NZST': 'Pacific/Auckland',
    'NZDT': 'Pacific/Auckland',
    'AEST': 'Australia/Sydney',
    'AEDT': 'Australia/Sydney',
    'ACST': 'Australia/Adelaide',
    'ACDT': 'Australia/Adelaide',
    'AWST': 'Australia/Perth',
    'MSK': 'Europe/Moscow',
    'TRT': 'Europe/Istanbul',
    'GST': 'Asia/Dubai',          // Ambiguous — overridden by context
    'AST': 'America/Halifax',     // Ambiguous — overridden by context
    'SAST': 'Africa/Johannesburg',
    'WAT': 'Africa/Lagos',
    'EAT': 'Africa/Nairobi',
    'IRST': 'Asia/Tehran',
    'BRT': 'America/Sao_Paulo',
    'ART': 'America/Argentina/Buenos_Aires',
    'PET': 'America/Lima'
};

// Ambiguous abbreviations with candidates
const AMBIGUOUS_ABBREVIATIONS = {
    'CST': {
        candidates: {
            'America/Chicago': ['US', 'USA', 'America', 'United States', 'Chicago', 'Central'],
            'Asia/Shanghai': ['China', 'Shanghai', 'Beijing', 'Chinese']
        },
        default: 'America/Chicago'
    },
    'IST': {
        candidates: {
            'Asia/Kolkata': ['India', 'Indian', 'Kolkata', 'Mumbai', 'Delhi', 'Bangalore'],
            'Asia/Jerusalem': ['Israel', 'Israeli', 'Jerusalem', 'Tel Aviv'],
            'Europe/Dublin': ['Ireland', 'Irish', 'Dublin']
        },
        default: 'Asia/Kolkata'
    },
    'BST': {
        candidates: {
            'Europe/London': ['UK', 'Britain', 'British', 'England', 'London'],
            'Asia/Dhaka': ['Bangladesh', 'Dhaka']
        },
        default: 'Europe/London'
    },
    'AST': {
        candidates: {
            'America/Halifax': ['Atlantic', 'Canada', 'Halifax', 'US', 'America'],
            'Asia/Riyadh': ['Arabia', 'Saudi', 'Riyadh']
        },
        default: 'America/Halifax'
    },
    'GST': {
        candidates: {
            'Asia/Dubai': ['Gulf', 'Dubai', 'UAE', 'Abu Dhabi'],
        },
        default: 'Asia/Dubai'
    }
};

// Offset-to-IANA priority table (offset in minutes → ranked IANA zones)
const OFFSET_PRIORITY = {
    '-600': ['Pacific/Honolulu'],
    '-540': ['America/Anchorage'],
    '-480': ['America/Los_Angeles', 'America/Vancouver'],
    '-420': ['America/Denver', 'America/Phoenix', 'America/Edmonton'],
    '-360': ['America/Chicago', 'America/Winnipeg', 'America/Mexico_City'],
    '-300': ['America/New_York', 'America/Toronto', 'America/Lima'],
    '-240': ['America/Halifax'],
    '-180': ['America/Sao_Paulo', 'America/Argentina/Buenos_Aires'],
    '0': ['UTC', 'Europe/London'],
    '60': ['Europe/Paris', 'Europe/Berlin', 'Africa/Lagos'],
    '120': ['Europe/Helsinki', 'Europe/Athens', 'Africa/Cairo', 'Africa/Johannesburg'],
    '180': ['Europe/Moscow', 'Europe/Istanbul', 'Asia/Riyadh', 'Africa/Nairobi'],
    '210': ['Asia/Tehran'],
    '240': ['Asia/Dubai'],
    '270': ['Asia/Kabul'],
    '300': ['Asia/Karachi'],
    '330': ['Asia/Kolkata'],
    '345': ['Asia/Kathmandu'],
    '360': ['Asia/Dhaka'],
    '390': ['Asia/Yangon'],
    '420': ['Asia/Bangkok', 'Asia/Jakarta'],
    '480': ['Asia/Shanghai', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Taipei', 'Australia/Perth'],
    '540': ['Asia/Tokyo', 'Asia/Seoul'],
    '570': ['Australia/Adelaide'],
    '600': ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane'],
    '660': ['Pacific/Noumea'],
    '720': ['Pacific/Auckland'],
    '780': ['Pacific/Apia']
};

// Verbose timezone name → IANA mapping
const VERBOSE_TIMEZONE_MAP = {
    'Eastern Time': 'America/New_York',
    'Eastern Standard Time': 'America/New_York',
    'Eastern Daylight Time': 'America/New_York',
    'Central Time': 'America/Chicago',
    'Central Standard Time': 'America/Chicago',
    'Central Daylight Time': 'America/Chicago',
    'Mountain Time': 'America/Denver',
    'Mountain Standard Time': 'America/Denver',
    'Mountain Daylight Time': 'America/Denver',
    'Pacific Time': 'America/Los_Angeles',
    'Pacific Standard Time': 'America/Los_Angeles',
    'Pacific Daylight Time': 'America/Los_Angeles',
    'Greenwich Mean Time': 'UTC',
    'Coordinated Universal Time': 'UTC',
    'Central European Time': 'Europe/Paris',
    'Central European Summer Time': 'Europe/Paris',
    'Eastern European Time': 'Europe/Helsinki',
    'Eastern European Summer Time': 'Europe/Helsinki',
    'British Summer Time': 'Europe/London',
    'India Standard Time': 'Asia/Kolkata',
    'Japan Standard Time': 'Asia/Tokyo',
    'China Standard Time': 'Asia/Shanghai',
    'Australian Eastern Standard Time': 'Australia/Sydney',
    'Australian Eastern Daylight Time': 'Australia/Sydney',
    'New Zealand Standard Time': 'Pacific/Auckland',
    'New Zealand Daylight Time': 'Pacific/Auckland'
};

// Context clue keywords → IANA zone for region-name disambiguation
const REGION_CONTEXT_MAP = {
    'Eastern': 'America/New_York',
    'Western': 'America/Los_Angeles',
    'Central': 'America/Chicago',
    'Pacific': 'America/Los_Angeles',
    'Mountain': 'America/Denver',
    'Atlantic': 'America/Halifax'
};

/**
 * Resolve a timezone abbreviation/offset to an IANA timezone name.
 *
 * @param {{
 *   abbreviation: string|null,
 *   offsetMinutes: number|null,
 *   contextClues: string[],
 *   parsedDate: Date,
 *   userTimezone: string
 * }} params
 * @returns {string|null} IANA timezone name, or null if unresolvable
 */
function resolveTimezone({ abbreviation, offsetMinutes, contextClues, parsedDate, userTimezone }) {
    // Step 1: Check verbose timezone names in context clues
    for (const clue of contextClues) {
        const verboseMatch = VERBOSE_TIMEZONE_MAP[clue];
        if (verboseMatch) return verboseMatch;
    }

    // Step 2: If we have an explicit offset, resolve using priority table
    if (offsetMinutes !== null) {
        const resolved = resolveFromOffset(offsetMinutes, contextClues, parsedDate, userTimezone);
        if (resolved) return resolved;
    }

    // Step 3: If we have an abbreviation, resolve with disambiguation
    if (abbreviation) {
        const upper = abbreviation.toUpperCase();
        return resolveFromAbbreviation(upper, contextClues, userTimezone);
    }

    // Step 4: Check region names in context clues (e.g., "Eastern" alone)
    for (const clue of contextClues) {
        const regionMatch = REGION_CONTEXT_MAP[clue];
        if (regionMatch) return regionMatch;
    }

    // Nothing to resolve
    return null;
}

/**
 * Resolve an offset to an IANA zone using the priority table.
 */
function resolveFromOffset(offsetMinutes, contextClues, parsedDate, userTimezone) {
    const key = String(offsetMinutes);

    // Direct lookup in priority table
    const candidates = OFFSET_PRIORITY[key];
    if (candidates && candidates.length > 0) {
        // If context clues suggest a specific region, prefer that
        for (const candidate of candidates) {
            if (matchesContextClues(candidate, contextClues)) {
                return candidate;
            }
        }

        // Verify which candidates actually have this offset at the parsed date
        const verified = candidates.filter(zone => {
            const actualOffset = getOffsetAtDate(zone, parsedDate);
            return actualOffset === offsetMinutes;
        });

        if (verified.length > 0) return verified[0];

        // If no candidate matches at parsed date (DST shifted), return first anyway
        return candidates[0];
    }

    // Fallback: scan all IANA zones for matching offset
    return resolveFromOffsetFallback(offsetMinutes, parsedDate, userTimezone);
}

/**
 * Resolve abbreviation with disambiguation.
 */
function resolveFromAbbreviation(abbr, contextClues, userTimezone) {
    // Check if abbreviation is ambiguous
    const ambiguous = AMBIGUOUS_ABBREVIATIONS[abbr];
    if (ambiguous) {
        // Check context clues against each candidate
        for (const [zone, keywords] of Object.entries(ambiguous.candidates)) {
            for (const clue of contextClues) {
                if (keywords.some(kw => kw.toLowerCase() === clue.toLowerCase())) {
                    return zone;
                }
            }
        }

        // Check user locale preference
        for (const [zone] of Object.entries(ambiguous.candidates)) {
            if (userTimezone === zone) return zone;
            // Check if user is in the same region
            const userRegion = userTimezone.split('/')[0];
            const zoneRegion = zone.split('/')[0];
            if (userRegion === zoneRegion) return zone;
        }

        // Fall back to default
        return ambiguous.default;
    }

    // Unambiguous abbreviation
    return UNAMBIGUOUS_ABBREVIATIONS[abbr] || null;
}

/**
 * Get the UTC offset (in minutes) for a zone at a specific date.
 */
function getOffsetAtDate(ianaZone, date) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone,
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
            hourCycle: 'h23'
        });
        const parts = formatter.formatToParts(date);
        const get = (type) => parseInt(parts.find(p => p.type === type).value);

        const tzWallMs = Date.UTC(
            get('year'), get('month') - 1, get('day'),
            get('hour'), get('minute'), get('second')
        );
        return Math.round((tzWallMs - date.getTime()) / 60000);
    } catch {
        return null;
    }
}

/**
 * Check if an IANA zone name matches any context clues.
 */
function matchesContextClues(ianaZone, contextClues) {
    const zoneLower = ianaZone.toLowerCase();
    const parts = ianaZone.split('/');
    const city = parts[parts.length - 1].replace(/_/g, ' ').toLowerCase();

    for (const clue of contextClues) {
        const clueLower = clue.toLowerCase();
        if (zoneLower.includes(clueLower) || city.includes(clueLower)) {
            return true;
        }
        // Check region words
        if (REGION_CONTEXT_MAP[clue]) {
            const regionZone = REGION_CONTEXT_MAP[clue];
            if (ianaZone === regionZone) return true;
        }
    }
    return false;
}

/**
 * Fallback: scan all available IANA zones for a matching offset.
 * Uses Intl.supportedValuesOf('timeZone') — Chrome 93+.
 */
function resolveFromOffsetFallback(offsetMinutes, parsedDate, userTimezone) {
    try {
        const allZones = Intl.supportedValuesOf('timeZone');
        const matches = [];

        for (const zone of allZones) {
            const zoneOffset = getOffsetAtDate(zone, parsedDate);
            if (zoneOffset === offsetMinutes) {
                matches.push(zone);
            }
        }

        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];

        // Prefer zone closest to user's locale
        const userRegion = userTimezone.split('/')[0];
        const sameRegion = matches.find(z => z.split('/')[0] === userRegion);
        if (sameRegion) return sameRegion;

        return matches[0];
    } catch {
        // Intl.supportedValuesOf not available — return null
        return null;
    }
}

module.exports = { resolveTimezone, getOffsetAtDate };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/timezone-resolver.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/timezone-resolver.js test/timezone-resolver.test.js
git commit -m "feat: add timezone-resolver module (Stage 3 — IANA disambiguation)"
```

---

### Task 5: chrono-node Bundle Entry Point (Stage 2 + full API)

**Files:**
- Create: `src/chrono-bundle.js`
- Create: `test/chrono-bundle.test.js`

- [ ] **Step 1: Write failing tests for TimeShiftParser.parse**

File: `test/chrono-bundle.test.js`

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// We test the individual modules here since the bundle is an IIFE for browser.
// Import the parse function directly from the source.
const { parse } = require('../src/chrono-bundle.js');

describe('TimeShiftParser.parse', () => {
    describe('Bug #1: GMT offset pattern', () => {
        it('parses "12 PM (GMT-5:00) Eastern [US & Canada]" as New York', () => {
            const result = parse('12 PM (GMT-5:00) Eastern [US & Canada]', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'America/New_York');
            assert.equal(result.confidence, 'high');
            assert.equal(result.utcDate.getUTCHours(), 17); // 12 PM EST = 5 PM UTC
        });
    });

    describe('Bug #7: parenthetical offset', () => {
        it('parses "3:00 PM (UTC+01:00)" correctly', () => {
            const result = parse('3:00 PM (UTC+01:00)', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.utcDate.getUTCHours(), 14); // 3 PM CET = 2 PM UTC
            assert.equal(result.confidence, 'high');
        });
    });

    describe('common formats', () => {
        it('parses "Webinar at 2:00 PM EST"', () => {
            const result = parse('Webinar at 2:00 PM EST', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.sourceTimezone, 'America/New_York');
            assert.equal(result.confidence, 'high');
        });

        it('parses "The ceremony begins at 7:00 PM CET on March 20th"', () => {
            const result = parse('The ceremony begins at 7:00 PM CET on March 20th', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.sourceTimezone, 'Europe/Paris');
            assert.equal(result.confidence, 'high');
        });

        it('parses "3:00 PM" with low confidence (no timezone)', () => {
            const result = parse('3:00 PM', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.confidence, 'low');
        });

        it('parses slash-separated "3pm BST / 10am ET" — takes first', () => {
            const result = parse('3pm BST / 10am ET', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.sourceTimezone, 'Europe/London');
        });
    });

    describe('time ranges', () => {
        it('parses "2:00 PM - 3:30 PM EST" as a range', () => {
            const result = parse('2:00 PM - 3:30 PM EST', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.isRange, true);
            assert.ok(result.rangeEndUtcDate);
            assert.equal(result.sourceTimezone, 'America/New_York');
        });

        it('parses "2pm to 4pm ET" with "to" separator', () => {
            const result = parse('2pm to 4pm ET', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.isRange, true);
        });
    });

    describe('rejection cases', () => {
        it('returns null for gibberish', () => {
            const result = parse('hello world', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('returns null for bare number "12"', () => {
            const result = parse('12', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('returns null for date-only "March 15, 2025"', () => {
            const result = parse('March 15, 2025', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('returns null for abbreviation only "EST"', () => {
            const result = parse('EST', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/chrono-bundle.test.js`
Expected: FAIL — `Cannot find module '../src/chrono-bundle.js'`

- [ ] **Step 3: Implement chrono-bundle.js**

File: `src/chrono-bundle.js`

```js
/**
 * TimeShift Parser — chrono-node bundle entry point.
 * Orchestrates the 4-stage parsing pipeline:
 *   Stage 1: Pre-processor (normalize + extract metadata)
 *   Stage 2: chrono-node parse (with custom refiners)
 *   Stage 3: Timezone resolution (IANA disambiguation)
 *   Stage 4: Date construction (wall-clock → UTC)
 *
 * Exposes: window.TimeShiftParser.parse() in browser,
 *          or module.exports.parse() in Node.js for testing.
 */

const chrono = require('chrono-node');
const { preprocess } = require('./preprocessor.js');
const { resolveTimezone } = require('./timezone-resolver.js');
const { constructDateInTimezone } = require('./date-constructor.js');

/**
 * Create a custom chrono instance with our refiners.
 */
function createChronoInstance() {
    // Use chrono.strict (not chrono.casual) to prevent bare numbers like "12"
    // from being interpreted as times. chrono.casual would parse "12" as noon,
    // violating Bug #8 requirement. chrono.strict requires more explicit
    // time patterns (AM/PM, colon-separated, etc.)
    const custom = chrono.strict.clone();

    // Note: Custom refiners from the spec (Parenthetical Offset Refiner,
    // Verbose Timezone Name Refiner) are handled externally:
    // - Offset extraction is done by the pre-processor (Stage 1)
    // - Verbose timezone name resolution is done by the timezone-resolver (Stage 3)
    // This keeps chrono's pipeline clean and our logic testable independently.

    return custom;
}

const chronoInstance = createChronoInstance();

/**
 * Detect if a time range separator exists between two time patterns.
 * Returns { isRange, separator, startText, endText } or { isRange: false }
 */
function detectRange(text) {
    // Pattern: time-like expression SEPARATOR time-like expression
    // Separators: - (hyphen), to, through, until
    // Time-like: digits with optional :MM and optional AM/PM, or HH:MM

    const timePattern = '\\d{1,2}(?::\\d{2})?\\s*(?:AM|PM|am|pm)?';
    const separators = [
        { regex: new RegExp(`(${timePattern}[^\\-]*)\\s*-\\s*(${timePattern}.*)`, 'i'), sep: '-' },
        { regex: new RegExp(`(${timePattern}[^\\w]*)\\s+to\\s+(${timePattern}.*)`, 'i'), sep: 'to' },
        { regex: new RegExp(`(${timePattern}[^\\w]*)\\s+through\\s+(${timePattern}.*)`, 'i'), sep: 'through' },
        { regex: new RegExp(`(${timePattern}[^\\w]*)\\s+until\\s+(${timePattern}.*)`, 'i'), sep: 'until' }
    ];

    for (const { regex, sep } of separators) {
        const match = text.match(regex);
        if (match) {
            // For hyphen, verify both sides have time patterns to avoid date hyphens
            if (sep === '-') {
                const timeCheck = /\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)|\d{1,2}:\d{2}/i;
                if (!timeCheck.test(match[1]) || !timeCheck.test(match[2])) {
                    continue;
                }
            }
            return {
                isRange: true,
                separator: sep,
                startText: match[1].trim(),
                endText: match[2].trim()
            };
        }
    }

    return { isRange: false };
}

/**
 * Parse a single time string through chrono and resolve timezone.
 * Returns { utcDate, sourceTimezone, confidence } or null.
 */
function parseSingle(text, metadata, options) {
    try {
        // Stage 2: chrono-node parse
        const results = chronoInstance.parse(text, new Date(), { forwardDate: true });

        if (!results || results.length === 0) return null;

        const chronoResult = results[0];

        // Reject date-only (no time component)
        if (!chronoResult.start.isCertain('hour') && !chronoResult.start.isCertain('minute')) {
            // Check if input actually had time-like patterns
            const hasTimePattern = /\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)|\d{1,2}:\d{2}/i.test(text);
            if (!hasTimePattern) return null;
        }

        // Extract what chrono found
        const chronoDate = chronoResult.start;
        const year = chronoDate.get('year');
        const month = chronoDate.get('month') - 1; // chrono is 1-indexed, JS is 0-indexed
        const day = chronoDate.get('day');
        const hour = chronoDate.get('hour') || 0;
        const minute = chronoDate.get('minute') || 0;
        const second = chronoDate.get('second') || 0;

        // Get chrono's timezone detection
        const chronoOffset = chronoDate.isCertain('timezoneOffset')
            ? chronoDate.get('timezoneOffset')
            : null;

        // Stage 3: Timezone resolution
        // Determine what abbreviation chrono detected (if any)
        let abbreviation = null;
        const tzAbbrMatch = metadata.originalText.match(
            /\b(EST|EDT|ET|CST|CDT|CT|MST|MDT|MT|PST|PDT|PT|AKST|AKDT|HST|UTC|GMT|BST|IST|CET|CEST|EET|EEST|JST|KST|SGT|HKT|ICT|WIB|PHT|NZST|NZDT|AEST|AEDT|ACST|ACDT|AWST|MSK|TRT|GST|AST|SAST|WAT|EAT|IRST|BRT|ART|PET)\b/i
        );
        if (tzAbbrMatch) {
            abbreviation = tzAbbrMatch[1].toUpperCase();
        }

        // Determine the effective offset (prefer pre-processor extracted offset)
        const effectiveOffset = metadata.extractedOffset !== null
            ? metadata.extractedOffset
            : chronoOffset;

        const resolvedTimezone = resolveTimezone({
            abbreviation,
            offsetMinutes: effectiveOffset,
            contextClues: metadata.contextClues,
            parsedDate: new Date(Date.UTC(year, month, day)),
            userTimezone: options.userTimezone
        });

        // Determine source timezone and confidence
        let sourceTimezone;
        let confidence;

        if (resolvedTimezone) {
            sourceTimezone = resolvedTimezone;
            confidence = 'high';
        } else if (options.userTimezone) {
            sourceTimezone = options.userTimezone;
            confidence = 'low';
        } else {
            sourceTimezone = 'UTC';
            confidence = 'low';
        }

        // Stage 4: Construct UTC date
        const utcDate = constructDateInTimezone(year, month, day, hour, minute, second, sourceTimezone);

        return {
            utcDate,
            sourceTimezone,
            confidence,
            year, month, day, hour, minute, second
        };
    } catch {
        return null;
    }
}

/**
 * Main parse function — the single API entry point.
 *
 * @param {string} text - Raw input text
 * @param {{ userTimezone: string }} options
 * @returns {{
 *   utcDate: Date,
 *   sourceTimezone: string,
 *   confidence: 'high'|'medium'|'low',
 *   isRange: boolean,
 *   rangeEndUtcDate?: Date,
 *   displayNote?: string
 * } | null}
 */
function parse(text, options = {}) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return null;
    }

    try {
        // Stage 1: Pre-process
        const metadata = preprocess(text.trim());

        // Check for time range
        const rangeInfo = detectRange(metadata.cleanedText);

        if (rangeInfo.isRange) {
            // Parse start and end separately
            const startMeta = { ...metadata, cleanedText: rangeInfo.startText };
            const endMeta = { ...metadata, cleanedText: rangeInfo.endText };

            const startResult = parseSingle(rangeInfo.startText, startMeta, options);
            const endResult = parseSingle(rangeInfo.endText, endMeta, options);

            if (!startResult && !endResult) return null;

            // If only one half parsed, fall back to single-time
            if (!startResult) {
                return {
                    utcDate: endResult.utcDate,
                    sourceTimezone: endResult.sourceTimezone,
                    confidence: endResult.confidence,
                    isRange: false,
                    displayNote: 'Could not parse start of time range'
                };
            }
            if (!endResult) {
                return {
                    utcDate: startResult.utcDate,
                    sourceTimezone: startResult.sourceTimezone,
                    confidence: startResult.confidence,
                    isRange: false,
                    displayNote: 'Could not parse end of time range'
                };
            }

            // Use start's timezone for both
            const sourceTimezone = startResult.sourceTimezone;

            // Reconstruct end time in start's timezone
            let endUtcDate = constructDateInTimezone(
                endResult.year, endResult.month, endResult.day,
                endResult.hour, endResult.minute, endResult.second,
                sourceTimezone
            );

            // Cross-midnight: if end is before start, reconstruct with next day
            // (Use constructDateInTimezone instead of adding 86400000ms to handle DST days)
            if (endUtcDate.getTime() <= startResult.utcDate.getTime()) {
                endUtcDate = constructDateInTimezone(
                    endResult.year, endResult.month, endResult.day + 1,
                    endResult.hour, endResult.minute, endResult.second,
                    sourceTimezone
                );
            }

            const confidence = lowerConfidence(startResult.confidence, endResult.confidence);

            return {
                utcDate: startResult.utcDate,
                sourceTimezone,
                confidence,
                isRange: true,
                rangeEndUtcDate: endUtcDate,
                displayNote: buildDisplayNote(confidence, sourceTimezone, options.userTimezone)
            };
        }

        // Single time parse
        const result = parseSingle(metadata.cleanedText, metadata, options);
        if (!result) return null;

        return {
            utcDate: result.utcDate,
            sourceTimezone: result.sourceTimezone,
            confidence: result.confidence,
            isRange: false,
            displayNote: buildDisplayNote(result.confidence, result.sourceTimezone, options.userTimezone)
        };
    } catch {
        return null;
    }
}

function lowerConfidence(a, b) {
    const order = { 'low': 0, 'medium': 1, 'high': 2 };
    return order[a] <= order[b] ? a : b;
}

function buildDisplayNote(confidence, sourceTimezone, userTimezone) {
    if (confidence === 'high') return null;
    if (confidence === 'medium') return `Timezone from your selection`;
    return `No timezone detected in text — using ${userTimezone || 'your local timezone'}. Select a source timezone for accurate results.`;
}

// Export for both Node.js testing and browser bundle
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parse };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/chrono-bundle.test.js`
Expected: All tests PASS

- [ ] **Step 5: Build the bundle**

Run: `npm run build`
Expected: `libs/chrono.bundle.js` created. Verify it exists and is non-empty:
Run: `ls -la libs/chrono.bundle.js`

- [ ] **Step 6: Commit**

```bash
git add src/chrono-bundle.js test/chrono-bundle.test.js libs/chrono.bundle.js
git commit -m "feat: add chrono-node bundle with full parsing pipeline (Stages 1-4)"
```

---

## Chunk 3: popup.js Rewrite + HTML Update + Cleanup

### Task 6: Update popup.html — swap script tags

**Files:**
- Modify: `popup.html:364-366`

- [ ] **Step 1: Replace moment.js script tags with chrono bundle**

In `popup.html`, replace:
```html
    <script src="libs/moment.min.js"></script>
    <script src="libs/moment-timezone.min.js"></script>
    <script src="popup.js"></script>
```

With:
```html
    <script src="libs/chrono.bundle.js"></script>
    <script src="popup.js"></script>
```

- [ ] **Step 2: Commit**

```bash
git add popup.html
git commit -m "chore: replace moment.js script tags with chrono bundle in popup.html"
```

---

### Task 7: Rewrite popup.js — timezone data + dropdowns (Intl-based)

**Files:**
- Modify: `popup.js` (rewrite timezone initialization, keep UI code)

- [ ] **Step 1: Rewrite the timezone data section of popup.js**

Replace everything from `async function initializeTimezones()` through `function populateTimezoneOptions()` and `function detectUserTimezone()` and `function mapLegacyTimezone()` with Intl-based versions. Keep all UI/DOM code (event listeners, dropdown toggle, etc.) unchanged.

New `initializeTimezones()`:

```js
/**
 * Curated timezone list — IANA names only.
 * Display names and offsets are computed dynamically via Intl.
 */
const CURATED_TIMEZONES = [
    { name: 'UTC', region: 'UTC', priority: 1 },
    { name: 'America/New_York', region: 'Americas', priority: 2 },
    { name: 'America/Toronto', region: 'Americas', priority: 3 },
    { name: 'America/Chicago', region: 'Americas', priority: 3 },
    { name: 'America/Denver', region: 'Americas', priority: 3 },
    { name: 'America/Los_Angeles', region: 'Americas', priority: 2 },
    { name: 'America/Phoenix', region: 'Americas', priority: 3 },
    { name: 'America/Anchorage', region: 'Americas', priority: 3 },
    { name: 'Pacific/Honolulu', region: 'Americas', priority: 3 },
    { name: 'America/Vancouver', region: 'Americas', priority: 3 },
    { name: 'America/Edmonton', region: 'Americas', priority: 3 },
    { name: 'America/Winnipeg', region: 'Americas', priority: 3 },
    { name: 'America/Halifax', region: 'Americas', priority: 3 },
    { name: 'America/Sao_Paulo', region: 'Americas', priority: 3 },
    { name: 'America/Argentina/Buenos_Aires', region: 'Americas', priority: 3 },
    { name: 'America/Mexico_City', region: 'Americas', priority: 3 },
    { name: 'America/Lima', region: 'Americas', priority: 3 },
    { name: 'Europe/London', region: 'Europe', priority: 2 },
    { name: 'Europe/Paris', region: 'Europe', priority: 2 },
    { name: 'Europe/Berlin', region: 'Europe', priority: 3 },
    { name: 'Europe/Rome', region: 'Europe', priority: 3 },
    { name: 'Europe/Madrid', region: 'Europe', priority: 3 },
    { name: 'Europe/Amsterdam', region: 'Europe', priority: 3 },
    { name: 'Europe/Zurich', region: 'Europe', priority: 3 },
    { name: 'Europe/Vienna', region: 'Europe', priority: 3 },
    { name: 'Europe/Stockholm', region: 'Europe', priority: 3 },
    { name: 'Europe/Helsinki', region: 'Europe', priority: 3 },
    { name: 'Europe/Athens', region: 'Europe', priority: 3 },
    { name: 'Europe/Moscow', region: 'Europe', priority: 3 },
    { name: 'Europe/Istanbul', region: 'Europe', priority: 3 },
    { name: 'Asia/Tokyo', region: 'Asia-Pacific', priority: 2 },
    { name: 'Asia/Shanghai', region: 'Asia-Pacific', priority: 2 },
    { name: 'Asia/Hong_Kong', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Singapore', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Seoul', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Kolkata', region: 'Asia-Pacific', priority: 2 },
    { name: 'Asia/Dubai', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Bangkok', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Manila', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Jakarta', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Taipei', region: 'Asia-Pacific', priority: 3 },
    { name: 'Australia/Sydney', region: 'Australia/Oceania', priority: 2 },
    { name: 'Australia/Melbourne', region: 'Australia/Oceania', priority: 3 },
    { name: 'Australia/Brisbane', region: 'Australia/Oceania', priority: 3 },
    { name: 'Australia/Perth', region: 'Australia/Oceania', priority: 3 },
    { name: 'Australia/Adelaide', region: 'Australia/Oceania', priority: 3 },
    { name: 'Pacific/Auckland', region: 'Australia/Oceania', priority: 3 },
    { name: 'Africa/Cairo', region: 'Africa', priority: 3 },
    { name: 'Africa/Johannesburg', region: 'Africa', priority: 3 },
    { name: 'Africa/Lagos', region: 'Africa', priority: 3 },
    { name: 'Africa/Nairobi', region: 'Africa', priority: 3 },
    { name: 'Africa/Casablanca', region: 'Africa', priority: 3 },
    { name: 'Asia/Jerusalem', region: 'Middle East', priority: 3 },
    { name: 'Asia/Riyadh', region: 'Middle East', priority: 3 },
    { name: 'Asia/Tehran', region: 'Middle East', priority: 3 },
];

/**
 * Build a display name for a timezone using Intl.
 * E.g., "New York (UTC-04:00) EDT"
 */
function buildTimezoneDisplayName(ianaZone) {
    if (ianaZone === 'UTC') return 'UTC (Coordinated Universal Time)';

    try {
        const now = new Date();

        // Get offset string like "GMT-04:00"
        const offsetFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone,
            timeZoneName: 'longOffset'
        });
        const offsetParts = offsetFormatter.formatToParts(now);
        const offsetStr = offsetParts.find(p => p.type === 'timeZoneName')?.value || '';
        // Convert "GMT-04:00" to "UTC-04:00"
        const utcOffset = offsetStr.replace('GMT', 'UTC');

        // Get abbreviation like "EDT"
        const abbrFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone,
            timeZoneName: 'short'
        });
        const abbrParts = abbrFormatter.formatToParts(now);
        const abbr = abbrParts.find(p => p.type === 'timeZoneName')?.value || '';

        // Get city name from IANA name
        const parts = ianaZone.split('/');
        const city = parts[parts.length - 1].replace(/_/g, ' ');

        return `${city} (${utcOffset}) ${abbr}`;
    } catch {
        return ianaZone;
    }
}

/**
 * Get the numeric UTC offset in minutes for sorting.
 */
function getTimezoneOffsetMinutes(ianaZone) {
    if (ianaZone === 'UTC') return 0;
    try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone,
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
            hourCycle: 'h23'
        });
        const parts = formatter.formatToParts(now);
        const get = (type) => parseInt(parts.find(p => p.type === type).value);
        const tzWallMs = Date.UTC(get('year'), get('month') - 1, get('day'),
            get('hour'), get('minute'), get('second'));
        return Math.round((tzWallMs - now.getTime()) / 60000);
    } catch {
        return 0;
    }
}

async function initializeTimezones() {
    timezones = CURATED_TIMEZONES.map(tz => {
        const displayName = buildTimezoneDisplayName(tz.name);
        const parts = tz.name.split('/');
        const city = parts[parts.length - 1].replace(/_/g, ' ');
        const utcOffset = getTimezoneOffsetMinutes(tz.name);

        return {
            name: tz.name,
            city: city,
            region: tz.region,
            displayName: displayName,
            searchText: `${tz.name} ${city} ${tz.region} ${displayName}`.toLowerCase(),
            utcOffset: utcOffset,
            priority: tz.priority
        };
    });

    timezones.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.utcOffset !== b.utcOffset) return a.utcOffset - b.utcOffset;
        return a.city.localeCompare(b.city);
    });

    populateTimezoneOptions();
}

function detectUserTimezone() {
    try {
        userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        userTimezone = 'UTC';
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add popup.js
git commit -m "refactor: replace moment.js timezone init with Intl-based dynamic computation"
```

---

### Task 8: Rewrite popup.js — conversion + display logic

**Files:**
- Modify: `popup.js` (rewrite handleConversion, remove all moment/parsing functions)

- [ ] **Step 1: Replace handleConversion and all parsing/display functions**

Remove these functions entirely from popup.js:
- `handleConversion()` — rewrite (see below)
- `parseDateTime()` — deleted (replaced by TimeShiftParser.parse)
- `detectTimezoneFromText()` — deleted
- `detectTimezoneFromTextMapped()` — deleted
- `stripTimezoneFromText()` — deleted
- `looksLikeDateTime()` — deleted (replaced by inline `TimeShiftParser.parse() !== null` check)
- `isCountryMatch()` — deleted (dead code)

**IMPORTANT:** Also update `checkForContextMenuText()` — it currently calls
`looksLikeDateTime()` which is being deleted. Replace that call:

```js
// In checkForContextMenuText(), replace:
//   if (looksLikeDateTime(result.selectedText)) {
// With:
if (TimeShiftParser.parse(result.selectedText, { userTimezone: userTimezone }) !== null) {
```

Keep `populateTimezoneOptions()`, `filterTimezones()`, `selectTimezone()`,
`toggleDropdown()`, `closeAllDropdowns()`, `saveTimezonePreferences()`,
`loadTimezonePreferences()`, `setupEventListeners()`, `initializeElements()`,
and all other UI/DOM functions unchanged.

**Note:** `mapLegacyTimezone()` was already removed in Task 7.

New `handleConversion()`:

```js
/**
 * Handle time conversion using TimeShiftParser.
 */
function handleConversion() {
    const inputText = elements.dateTimeInput.value.trim();

    if (!inputText) {
        showResult('Please enter a date/time to convert.', 'error');
        return;
    }

    try {
        const result = TimeShiftParser.parse(inputText, {
            userTimezone: selectedFromTimezone || userTimezone
        });

        if (!result) {
            showResult(`
                <div style="color: #f59e0b; font-weight: 600; margin-bottom: 8px;">No Time Information Detected</div>
                <div style="font-size: 13px; line-height: 1.4;">
                    Input: "<strong>${escapeHtml(inputText)}</strong>"<br><br>
                    Please include time information for conversion.<br><br>
                    <strong>Supported formats:</strong><br>
                    &bull; 12:00 PM EST<br>
                    &bull; 12:00 PM - 1:00 PM ET<br>
                    &bull; Sep 2, 2025 12:00 PM<br>
                    &bull; 12 PM (GMT-5:00) Eastern [US &amp; Canada]<br>
                    &bull; The ceremony begins at 7:00 PM CET on March 20th
                </div>
            `, 'info');
            return;
        }

        // Upgrade confidence to 'medium' if user explicitly selected a "from" timezone
        // (The parser only returns 'high' or 'low' — 'medium' means "timezone from dropdown")
        if (result.confidence === 'low' && selectedFromTimezone) {
            result.confidence = 'medium';
            result.displayNote = 'Timezone from your selection';
        }

        // Update "From" dropdown if timezone was auto-detected
        if (result.confidence === 'high') {
            const detectedTzObj = timezones.find(tz => tz.name === result.sourceTimezone);
            if (detectedTzObj) {
                selectedFromTimezone = result.sourceTimezone;
                elements.fromTimezoneDropdown.querySelector('.selected-text').textContent = detectedTzObj.displayName;
            }
        }

        // Determine target timezone
        let targetTimezone = selectedToTimezone || userTimezone;

        // If source was auto-detected from text, auto-select user's tz as target
        if (result.confidence === 'high' && !selectedToTimezone) {
            targetTimezone = userTimezone;
            const userTzObj = timezones.find(tz => tz.name === userTimezone);
            if (userTzObj) {
                selectedToTimezone = userTimezone;
                elements.toTimezoneDropdown.querySelector('.selected-text').textContent = userTzObj.displayName;
            }
        }

        if (result.isRange) {
            displayRangeResult(result, targetTimezone);
        } else {
            displaySingleResult(result, targetTimezone);
        }

    } catch (error) {
        showResult(`
            <div style="color: #f87171; font-weight: 600; margin-bottom: 8px;">Error</div>
            <div style="font-size: 12px; opacity: 0.8;">Could not process this text. Please try a different format.</div>
        `, 'error');
    }
}

/**
 * Format a UTC date in a target timezone using Intl.
 */
function formatInTimezone(utcDate, ianaZone, options = {}) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        hour: 'numeric',
        minute: '2-digit',
        second: options.showSeconds ? '2-digit' : undefined,
        hour12: true,
        ...options
    });
    return formatter.format(utcDate);
}

function formatDateInTimezone(utcDate, ianaZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    return formatter.format(utcDate);
}

function getAbbreviationInTimezone(utcDate, ianaZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        timeZoneName: 'short'
    });
    const parts = formatter.formatToParts(utcDate);
    return parts.find(p => p.type === 'timeZoneName')?.value || '';
}

/**
 * Display result for single time conversion.
 */
function displaySingleResult(result, targetTimezone) {
    const targetTzObj = timezones.find(tz => tz.name === targetTimezone);
    const sourceTzObj = timezones.find(tz => tz.name === result.sourceTimezone);

    const convertedTime = formatInTimezone(result.utcDate, targetTimezone, { second: '2-digit' });
    const convertedDate = formatDateInTimezone(result.utcDate, targetTimezone);
    const originalTime = formatInTimezone(result.utcDate, result.sourceTimezone, { second: '2-digit' });

    // Confidence indicator
    const confidenceHtml = buildConfidenceHtml(result);

    const resultHtml = `
        ${confidenceHtml}
        <div style="color: #ffffff; font-weight: 600; margin-bottom: 12px; font-size: 14px;">&#10003; Time Converted</div>

        <div style="background: rgba(255,255,255,0.95); padding: 15px; border-radius: 10px; margin-bottom: 12px; text-align: center; color: #1f2937;">
            <div style="color: #111827; font-weight: 700; font-size: 22px; margin-bottom: 6px;">
                ${convertedTime}
            </div>
            <div style="color: #374151; font-size: 13px; margin-bottom: 8px;">
                ${convertedDate}
            </div>
            <div style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 20px; display: inline-block;">
                <div style="color: #6b7280; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${targetTzObj ? targetTzObj.displayName : targetTimezone}
                </div>
            </div>
        </div>

        <div style="background: rgba(255,255,255,0.15); padding: 10px; border-radius: 8px; font-size: 12px;">
            <div style="color: #f1f5f9; font-weight: 600; margin-bottom: 2px;">Original Time:</div>
            <div style="color: #ffffff;">${originalTime}</div>
            <div style="color: #e2e8f0; font-size: 11px; margin-top: 2px;">${sourceTzObj ? sourceTzObj.displayName : result.sourceTimezone}</div>
        </div>
    `;

    showResult(resultHtml, 'success');
}

/**
 * Display result for time range conversion.
 */
function displayRangeResult(result, targetTimezone) {
    const targetTzObj = timezones.find(tz => tz.name === targetTimezone);
    const sourceTzObj = timezones.find(tz => tz.name === result.sourceTimezone);

    const convertedStart = formatInTimezone(result.utcDate, targetTimezone);
    const convertedEnd = formatInTimezone(result.rangeEndUtcDate, targetTimezone);
    const convertedDate = formatDateInTimezone(result.utcDate, targetTimezone);
    const originalStart = formatInTimezone(result.utcDate, result.sourceTimezone);
    const originalEnd = formatInTimezone(result.rangeEndUtcDate, result.sourceTimezone);

    const confidenceHtml = buildConfidenceHtml(result);

    const resultHtml = `
        ${confidenceHtml}
        <div style="color: #ffffff; font-weight: 600; margin-bottom: 12px; font-size: 14px;">&#10003; Time Range Converted</div>

        <div style="background: rgba(255,255,255,0.95); padding: 15px; border-radius: 10px; margin-bottom: 12px; text-align: center; color: #1f2937;">
            <div style="color: #111827; font-weight: 700; font-size: 18px; margin-bottom: 6px;">
                ${convertedStart} - ${convertedEnd}
            </div>
            <div style="color: #374151; font-size: 13px; margin-bottom: 8px;">
                ${convertedDate}
            </div>
            <div style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 20px; display: inline-block;">
                <div style="color: #6b7280; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${targetTzObj ? targetTzObj.displayName : targetTimezone}
                </div>
            </div>
        </div>

        <div style="background: rgba(255,255,255,0.15); padding: 10px; border-radius: 8px; font-size: 12px;">
            <div style="color: #f1f5f9; font-weight: 600; margin-bottom: 2px;">Original Range:</div>
            <div style="color: #ffffff;">${originalStart} - ${originalEnd}</div>
            <div style="color: #e2e8f0; font-size: 11px; margin-top: 2px;">${sourceTzObj ? sourceTzObj.displayName : result.sourceTimezone}</div>
        </div>
    `;

    showResult(resultHtml, 'success');
}

/**
 * Build confidence indicator HTML.
 */
function buildConfidenceHtml(result) {
    if (result.confidence === 'high') return '';
    if (result.confidence === 'medium') {
        return `<div style="color: #e2e8f0; font-size: 11px; margin-bottom: 8px; opacity: 0.8;">Timezone from your selection</div>`;
    }
    return `<div style="color: #fbbf24; font-size: 11px; margin-bottom: 8px;">&#9888; ${result.displayNote || 'No timezone detected in text'}</div>`;
}

/**
 * Escape HTML to prevent XSS from user/context-menu input.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

- [ ] **Step 2: Commit**

```bash
git add popup.js
git commit -m "feat: rewrite conversion logic to use TimeShiftParser + Intl formatting"
```

---

### Task 9: Delete moment.js files + version bump

**Files:**
- Delete: `libs/moment.min.js`
- Delete: `libs/moment-timezone.min.js`
- Modify: `manifest.json:3` (version bump)

- [ ] **Step 1: Delete old library files**

Run: `rm libs/moment.min.js libs/moment-timezone.min.js`

- [ ] **Step 2: Bump version in manifest.json**

Change `"version": "1.2.0"` to `"version": "2.0.0"` in `manifest.json`.

- [ ] **Step 3: Commit**

```bash
git add -u libs/moment.min.js libs/moment-timezone.min.js
git add manifest.json
git commit -m "chore: remove moment.js, bump version to 2.0.0"
```

---

### Task 10: Full integration test + manual verification

**Files:**
- Create: `test/integration.test.js`

- [ ] **Step 1: Write integration tests that cover the full pipeline**

File: `test/integration.test.js`

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../src/chrono-bundle.js');

describe('Integration: Real-world format matrix', () => {
    it('Google Calendar: "12 PM (GMT-5:00) Eastern [US & Canada]"', () => {
        const result = parse('12 PM (GMT-5:00) Eastern [US & Canada]', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.equal(result.sourceTimezone, 'America/New_York');
        assert.equal(result.confidence, 'high');
    });

    it('University email: "Webinar at 2:00 PM EST"', () => {
        const result = parse('Webinar at 2:00 PM EST', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.equal(result.sourceTimezone, 'America/New_York');
    });

    it('Sports site: "Kickoff: 8 PM ET (Saturday, March 15)"', () => {
        const result = parse('Kickoff: 8 PM ET (Saturday, March 15)', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.equal(result.sourceTimezone, 'America/New_York');
    });

    it('News article: "The ceremony begins at 7:00 PM CET on March 20th"', () => {
        const result = parse('The ceremony begins at 7:00 PM CET on March 20th', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.equal(result.sourceTimezone, 'Europe/Paris');
    });

    it('Broadcast: "Live at 3pm BST / 10am ET"', () => {
        const result = parse('Live at 3pm BST / 10am ET', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.equal(result.sourceTimezone, 'Europe/London');
    });

    it('24h range: "14:00 - 15:30 CET"', () => {
        const result = parse('14:00 - 15:30 CET', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.equal(result.isRange, true);
        assert.equal(result.sourceTimezone, 'Europe/Paris');
    });

    it('Bare time: "3:00 PM" — low confidence', () => {
        const result = parse('3:00 PM', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.equal(result.confidence, 'low');
    });

    it('Outlook invite: "Tuesday, Sep 2, 2025 12:00 PM"', () => {
        const result = parse('Tuesday, Sep 2, 2025 12:00 PM', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.equal(result.confidence, 'low'); // no timezone in text
    });

    it('Long paragraph with time buried in it', () => {
        const result = parse(
            'Join us for the annual tech conference. The keynote starts at 3 PM EST and will cover exciting topics.',
            { userTimezone: 'Asia/Kolkata' }
        );
        assert.ok(result);
        assert.equal(result.sourceTimezone, 'America/New_York');
    });

    it('Date with slash: "3/15/2025 3pm ET" — slash is date, not time split', () => {
        const result = parse('3/15/2025 3pm ET', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.equal(result.sourceTimezone, 'America/New_York');
    });
});

describe('Integration: Rejection cases', () => {
    it('rejects date-only', () => {
        assert.equal(parse('March 15, 2025', { userTimezone: 'UTC' }), null);
    });

    it('rejects gibberish', () => {
        assert.equal(parse('hello world', { userTimezone: 'UTC' }), null);
    });

    it('rejects bare number', () => {
        assert.equal(parse('12', { userTimezone: 'UTC' }), null);
    });

    it('rejects abbreviation only', () => {
        assert.equal(parse('EST', { userTimezone: 'UTC' }), null);
    });

    it('rejects timezone-related text without time', () => {
        assert.equal(parse('The meeting is about timezone issues', { userTimezone: 'UTC' }), null);
    });
});

describe('Integration: Bug regression', () => {
    it('Bug #1: GMT offset does not map to UTC', () => {
        const result = parse('12 PM (GMT-5:00) Eastern [US & Canada]', {
            userTimezone: 'Asia/Kolkata'
        });
        assert.ok(result);
        assert.notEqual(result.sourceTimezone, 'UTC', 'Must NOT resolve to UTC');
        assert.equal(result.sourceTimezone, 'America/New_York');
    });

    it('Bug #3: CST defaults to US Central, not China', () => {
        const result = parse('3 PM CST', { userTimezone: 'America/New_York' });
        assert.ok(result);
        assert.equal(result.sourceTimezone, 'America/Chicago');
    });

    it('Bug #8: bare number "12" is rejected', () => {
        assert.equal(parse('12', { userTimezone: 'UTC' }), null);
    });
});
```

- [ ] **Step 2: Run all tests**

Run: `cd /Users/akhilsaxena/Documents/TimeShift-Extension-Final-v1.2.0 && npm test`
Expected: All tests across all 4 test files PASS

- [ ] **Step 3: Build and verify bundle**

Run: `npm run build && ls -la libs/chrono.bundle.js`
Expected: Bundle exists, reasonable size

- [ ] **Step 4: Manual smoke test in Chrome**

Load the extension unpacked in Chrome:
1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select the project directory
4. Click the extension icon → test these inputs:
   - `12 PM (GMT-5:00) Eastern [US & Canada]` → should convert from Eastern, NOT UTC
   - `3:00 PM EST` → should detect Eastern
   - `2pm to 4pm ET` → should show range
   - `hello world` → should show helpful error
5. Right-click selected text on a webpage → test context menu conversion

- [ ] **Step 5: Final commit**

```bash
git add test/integration.test.js
git commit -m "test: add integration tests covering real-world formats and bug regressions"
```

- [ ] **Step 6: Tag release**

```bash
git tag v2.0.0
```
