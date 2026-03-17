# Universal Time Parser Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the preprocessor with a 6-stage pipeline that handles all time format variations — glued tokens, lowercase abbreviations, international formats, city-based timezones, multilingual text — with full IANA dropdown and 3-level confidence UI.

**Architecture:** New stages (sanitizer → tokenizer → city-extractor) feed into a locale-aware chrono parser, expanded timezone resolver, and unchanged date constructor. The tokenizer has two phases: 2A (non-destructive, always runs) and 2B (international normalization, only for English locale).

**Tech Stack:** chrono-node (all 12 locales), Intl APIs, esbuild, Node.js test runner

**Spec:** `docs/superpowers/specs/2026-03-17-universal-time-parser-design.md`

---

## Chunk 1: Foundation — Timezone Data + Sanitizer

### Task 1: Timezone Data Module (`src/timezone-data.js`)

**Files:**
- Create: `src/timezone-data.js`
- Create: `test/timezone-data.test.js`

- [ ] **Step 1: Write failing tests for timezone-data**

```javascript
// test/timezone-data.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  IANA_ZONES, CITY_DICTIONARY, COUNTRY_DICTIONARY,
  ABBREVIATION_MAP, AMBIGUOUS_ABBREVIATIONS, VERBOSE_TIMEZONE_MAP,
  CITY_BLOCKLIST
} = require('../src/timezone-data.js');

describe('timezone-data', () => {
  it('IANA_ZONES contains at least 400 zones', () => {
    assert.ok(IANA_ZONES.length >= 400);
  });

  it('IANA_ZONES contains key zones', () => {
    for (const zone of ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'UTC']) {
      assert.ok(IANA_ZONES.includes(zone), `Missing ${zone}`);
    }
  });

  it('CITY_DICTIONARY maps lowercase city names to IANA zones', () => {
    assert.equal(CITY_DICTIONARY['london'], 'Europe/London');
    assert.equal(CITY_DICTIONARY['new york'], 'America/New_York');
    assert.equal(CITY_DICTIONARY['nyc'], 'America/New_York');
    assert.equal(CITY_DICTIONARY['tokyo'], 'Asia/Tokyo');
    assert.equal(CITY_DICTIONARY['mumbai'], 'Asia/Kolkata');
    assert.equal(CITY_DICTIONARY['bombay'], 'Asia/Kolkata');
  });

  it('CITY_DICTIONARY includes native-script entries', () => {
    assert.equal(CITY_DICTIONARY['東京'], 'Asia/Tokyo');
    assert.equal(CITY_DICTIONARY['런던'], 'Europe/London');
  });

  it('COUNTRY_DICTIONARY maps country names to primary zones', () => {
    assert.equal(COUNTRY_DICTIONARY['india'], 'Asia/Kolkata');
    assert.equal(COUNTRY_DICTIONARY['japan'], 'Asia/Tokyo');
    assert.equal(COUNTRY_DICTIONARY['germany'], 'Europe/Berlin');
  });

  it('ABBREVIATION_MAP has at least 60 entries', () => {
    assert.ok(Object.keys(ABBREVIATION_MAP).length >= 60);
  });

  it('ABBREVIATION_MAP includes new abbreviations', () => {
    assert.equal(ABBREVIATION_MAP['PKT'], 'Asia/Karachi');
    assert.equal(ABBREVIATION_MAP['NPT'], 'Asia/Kathmandu');
    assert.equal(ABBREVIATION_MAP['SGT'], 'Asia/Singapore');
  });

  it('AMBIGUOUS_ABBREVIATIONS has 8 entries with defaults and candidates', () => {
    assert.ok(Object.keys(AMBIGUOUS_ABBREVIATIONS).length >= 8);
    for (const [abbr, config] of Object.entries(AMBIGUOUS_ABBREVIATIONS)) {
      assert.ok(config.default, `${abbr} missing default`);
      assert.ok(config.candidates, `${abbr} missing candidates`);
    }
  });

  it('SST defaults to Samoa, not Singapore', () => {
    assert.equal(AMBIGUOUS_ABBREVIATIONS['SST'].default, 'Pacific/Pago_Pago');
  });

  it('VERBOSE_TIMEZONE_MAP has at least 50 entries', () => {
    assert.ok(Object.keys(VERBOSE_TIMEZONE_MAP).length >= 50);
  });

  it('CITY_BLOCKLIST contains common English words that are city names', () => {
    for (const word of ['nice', 'reading', 'bath', 'mobile', 'victoria', 'orange']) {
      assert.ok(CITY_BLOCKLIST.includes(word), `Missing blocklist word: ${word}`);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/timezone-data.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement timezone-data.js**

```javascript
// src/timezone-data.js
// Full IANA zone list from Intl API
const IANA_ZONES = Intl.supportedValuesOf('timeZone');

// City dictionary — ~300 entries, lowercase keys → IANA zones
// Includes aliases and native-script names
const CITY_DICTIONARY = {
  // Americas
  'new york': 'America/New_York', 'nyc': 'America/New_York', 'manhattan': 'America/New_York',
  'los angeles': 'America/Los_Angeles', 'la': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  'chicago': 'America/Chicago', 'denver': 'America/Denver',
  'phoenix': 'America/Phoenix', 'anchorage': 'America/Anchorage', 'honolulu': 'Pacific/Honolulu',
  'toronto': 'America/Toronto', 'vancouver': 'America/Vancouver', 'montreal': 'America/Toronto',
  'mexico city': 'America/Mexico_City', 'bogota': 'America/Bogota',
  'lima': 'America/Lima', 'santiago': 'America/Santiago',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  'são paulo': 'America/Sao_Paulo', 'sao paulo': 'America/Sao_Paulo', 'rio': 'America/Sao_Paulo',
  // Europe
  'london': 'Europe/London', 'paris': 'Europe/Paris', 'berlin': 'Europe/Berlin',
  'rome': 'Europe/Rome', 'madrid': 'Europe/Madrid', 'lisbon': 'Europe/Lisbon',
  'amsterdam': 'Europe/Amsterdam', 'brussels': 'Europe/Brussels', 'vienna': 'Europe/Vienna',
  'zurich': 'Europe/Zurich', 'stockholm': 'Europe/Stockholm', 'oslo': 'Europe/Oslo',
  'copenhagen': 'Europe/Copenhagen', 'helsinki': 'Europe/Helsinki', 'warsaw': 'Europe/Warsaw',
  'prague': 'Europe/Prague', 'budapest': 'Europe/Budapest', 'bucharest': 'Europe/Bucharest',
  'athens': 'Europe/Athens', 'istanbul': 'Europe/Istanbul', 'moscow': 'Europe/Moscow',
  'kyiv': 'Europe/Kyiv', 'dublin': 'Europe/Dublin',
  // Asia
  'tokyo': 'Asia/Tokyo', 'osaka': 'Asia/Tokyo',
  'shanghai': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai', 'hong kong': 'Asia/Hong_Kong',
  'seoul': 'Asia/Seoul', 'singapore': 'Asia/Singapore',
  'mumbai': 'Asia/Kolkata', 'bombay': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata', 'bangalore': 'Asia/Kolkata', 'kolkata': 'Asia/Kolkata',
  'chennai': 'Asia/Kolkata', 'hyderabad': 'Asia/Kolkata',
  'karachi': 'Asia/Karachi', 'lahore': 'Asia/Karachi', 'islamabad': 'Asia/Karachi',
  'dhaka': 'Asia/Dhaka', 'kathmandu': 'Asia/Kathmandu',
  'bangkok': 'Asia/Bangkok', 'jakarta': 'Asia/Jakarta',
  'manila': 'Asia/Manila', 'taipei': 'Asia/Taipei',
  'dubai': 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai',
  'riyadh': 'Asia/Riyadh', 'jeddah': 'Asia/Riyadh',
  'tehran': 'Asia/Tehran', 'baghdad': 'Asia/Baghdad',
  'jerusalem': 'Asia/Jerusalem', 'tel aviv': 'Asia/Jerusalem',
  'doha': 'Asia/Qatar', 'kuwait': 'Asia/Kuwait',
  // Africa
  'cairo': 'Africa/Cairo', 'johannesburg': 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg',
  'lagos': 'Africa/Lagos', 'nairobi': 'Africa/Nairobi', 'casablanca': 'Africa/Casablanca',
  'accra': 'Africa/Accra', 'addis ababa': 'Africa/Addis_Ababa', 'dar es salaam': 'Africa/Dar_es_Salaam',
  // Oceania
  'sydney': 'Australia/Sydney', 'melbourne': 'Australia/Melbourne', 'brisbane': 'Australia/Brisbane',
  'perth': 'Australia/Perth', 'adelaide': 'Australia/Adelaide',
  'auckland': 'Pacific/Auckland', 'wellington': 'Pacific/Auckland',
  'fiji': 'Pacific/Fiji', 'samoa': 'Pacific/Apia',
  // Native script
  '東京': 'Asia/Tokyo', '上海': 'Asia/Shanghai', '北京': 'Asia/Shanghai',
  '서울': 'Asia/Seoul', '런던': 'Europe/London', '파리': 'Europe/Paris',
  'モスクワ': 'Europe/Moscow', 'ロンドン': 'Europe/London',
  'مومباي': 'Asia/Kolkata', 'دبي': 'Asia/Dubai',
};

// Country dictionary — maps country names to primary zone
const COUNTRY_DICTIONARY = {
  'usa': 'America/New_York', 'united states': 'America/New_York', 'us': 'America/New_York',
  'uk': 'Europe/London', 'united kingdom': 'Europe/London', 'britain': 'Europe/London', 'england': 'Europe/London',
  'france': 'Europe/Paris', 'germany': 'Europe/Berlin', 'italy': 'Europe/Rome',
  'spain': 'Europe/Madrid', 'portugal': 'Europe/Lisbon', 'netherlands': 'Europe/Amsterdam',
  'belgium': 'Europe/Brussels', 'switzerland': 'Europe/Zurich', 'austria': 'Europe/Vienna',
  'sweden': 'Europe/Stockholm', 'norway': 'Europe/Oslo', 'denmark': 'Europe/Copenhagen',
  'finland': 'Europe/Helsinki', 'poland': 'Europe/Warsaw', 'russia': 'Europe/Moscow',
  'turkey': 'Europe/Istanbul', 'greece': 'Europe/Athens', 'ireland': 'Europe/Dublin',
  'india': 'Asia/Kolkata', 'japan': 'Asia/Tokyo', 'china': 'Asia/Shanghai',
  'south korea': 'Asia/Seoul', 'korea': 'Asia/Seoul',
  'singapore': 'Asia/Singapore', 'malaysia': 'Asia/Kuala_Lumpur',
  'thailand': 'Asia/Bangkok', 'indonesia': 'Asia/Jakarta', 'philippines': 'Asia/Manila',
  'pakistan': 'Asia/Karachi', 'bangladesh': 'Asia/Dhaka', 'nepal': 'Asia/Kathmandu',
  'uae': 'Asia/Dubai', 'saudi arabia': 'Asia/Riyadh', 'iran': 'Asia/Tehran',
  'iraq': 'Asia/Baghdad', 'israel': 'Asia/Jerusalem', 'qatar': 'Asia/Qatar',
  'egypt': 'Africa/Cairo', 'south africa': 'Africa/Johannesburg', 'nigeria': 'Africa/Lagos',
  'kenya': 'Africa/Nairobi', 'morocco': 'Africa/Casablanca', 'ghana': 'Africa/Accra',
  'australia': 'Australia/Sydney', 'new zealand': 'Pacific/Auckland',
  'brazil': 'America/Sao_Paulo', 'argentina': 'America/Argentina/Buenos_Aires',
  'mexico': 'America/Mexico_City', 'canada': 'America/Toronto', 'colombia': 'America/Bogota',
  'peru': 'America/Lima', 'chile': 'America/Santiago',
  'taiwan': 'Asia/Taipei',
};

// Expanded abbreviation map — ~60+ unambiguous entries
const ABBREVIATION_MAP = {
  'EST': 'America/New_York', 'EDT': 'America/New_York', 'ET': 'America/New_York',
  'CST': 'America/Chicago', 'CDT': 'America/Chicago', 'CT': 'America/Chicago',
  'MST': 'America/Denver', 'MDT': 'America/Denver', 'MT': 'America/Denver',
  'PST': 'America/Los_Angeles', 'PDT': 'America/Los_Angeles', 'PT': 'America/Los_Angeles',
  'AKST': 'America/Anchorage', 'AKDT': 'America/Anchorage',
  'HST': 'Pacific/Honolulu', 'HAST': 'Pacific/Honolulu', 'HADT': 'Pacific/Honolulu',
  'UTC': 'UTC', 'GMT': 'UTC',
  'CET': 'Europe/Paris', 'CEST': 'Europe/Paris',
  'EET': 'Europe/Helsinki', 'EEST': 'Europe/Helsinki',
  'WET': 'Europe/Lisbon', 'WEST': 'Europe/Lisbon',
  'JST': 'Asia/Tokyo', 'KST': 'Asia/Seoul', 'SGT': 'Asia/Singapore',
  'HKT': 'Asia/Hong_Kong', 'ICT': 'Asia/Bangkok', 'WIB': 'Asia/Jakarta',
  'WITA': 'Asia/Makassar', 'WIT': 'Asia/Jayapura',
  'PHT': 'Asia/Manila', 'TRT': 'Europe/Istanbul',
  'NZST': 'Pacific/Auckland', 'NZDT': 'Pacific/Auckland',
  'AEST': 'Australia/Sydney', 'AEDT': 'Australia/Sydney',
  'ACST': 'Australia/Adelaide', 'ACDT': 'Australia/Adelaide',
  'AWST': 'Australia/Perth',
  'MSK': 'Europe/Moscow',
  'SAST': 'Africa/Johannesburg',
  'IRST': 'Asia/Tehran', 'IRDT': 'Asia/Tehran',
  'BRT': 'America/Sao_Paulo', 'BRST': 'America/Sao_Paulo',
  'ART': 'America/Argentina/Buenos_Aires',
  'PET': 'America/Lima', 'CLT': 'America/Santiago', 'CLST': 'America/Santiago',
  'COT': 'America/Bogota',
  'PKT': 'Asia/Karachi', 'NPT': 'Asia/Kathmandu',
  'IST': 'Asia/Kolkata',  // default for unambiguous lookup
  'BST': 'Europe/London',  // default for unambiguous lookup
  'AST': 'America/Halifax', // default for unambiguous lookup
  'GST': 'Asia/Dubai',     // default for unambiguous lookup
  'WAT': 'Africa/Lagos',   // default for unambiguous lookup
  'EAT': 'Africa/Nairobi',
  'CAT': 'Africa/Harare',
  'MYT': 'Asia/Kuala_Lumpur',
  'CST_CN': 'Asia/Shanghai', // explicit China alias used internally
};

// Ambiguous abbreviations with disambiguation rules
const AMBIGUOUS_ABBREVIATIONS = {
  'CST': {
    candidates: {
      'America/Chicago': ['US', 'USA', 'America', 'United States', 'Chicago', 'Central', 'Texas', 'Houston'],
      'Asia/Shanghai': ['China', 'Shanghai', 'Beijing', 'Chinese', 'PRC']
    },
    default: 'America/Chicago'
  },
  'IST': {
    candidates: {
      'Asia/Kolkata': ['India', 'Indian', 'Kolkata', 'Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad'],
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
      'Asia/Dubai': ['Gulf', 'Dubai', 'UAE', 'Abu Dhabi']
    },
    default: 'Asia/Dubai'
  },
  'WAT': {
    candidates: {
      'Africa/Lagos': ['Nigeria', 'West Africa', 'Lagos']
    },
    default: 'Africa/Lagos'
  },
  'WET': {
    candidates: {
      'Europe/Lisbon': ['Portugal', 'Lisbon'],
      'Africa/Casablanca': ['Morocco', 'Casablanca']
    },
    default: 'Europe/Lisbon'
  },
  'SST': {
    candidates: {
      'Pacific/Pago_Pago': ['Samoa', 'Pago Pago', 'American Samoa']
    },
    default: 'Pacific/Pago_Pago'
  }
};

// Verbose timezone names → IANA zones (~50 entries)
const VERBOSE_TIMEZONE_MAP = {
  // US
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
  'Alaska Standard Time': 'America/Anchorage',
  'Alaska Daylight Time': 'America/Anchorage',
  'Hawaii Standard Time': 'Pacific/Honolulu',
  'Hawaii-Aleutian Standard Time': 'Pacific/Honolulu',
  'Atlantic Standard Time': 'America/Halifax',
  'Atlantic Daylight Time': 'America/Halifax',
  // Universal
  'Greenwich Mean Time': 'UTC',
  'Coordinated Universal Time': 'UTC',
  // Europe
  'Central European Time': 'Europe/Paris',
  'Central European Summer Time': 'Europe/Paris',
  'Eastern European Time': 'Europe/Helsinki',
  'Eastern European Summer Time': 'Europe/Helsinki',
  'Western European Time': 'Europe/Lisbon',
  'Western European Summer Time': 'Europe/Lisbon',
  'British Summer Time': 'Europe/London',
  'Irish Standard Time': 'Europe/Dublin',
  'Moscow Standard Time': 'Europe/Moscow',
  'Turkey Time': 'Europe/Istanbul',
  // Asia
  'India Standard Time': 'Asia/Kolkata',
  'Japan Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'China Standard Time': 'Asia/Shanghai',
  'Hong Kong Time': 'Asia/Hong_Kong',
  'Singapore Time': 'Asia/Singapore',
  'Indochina Time': 'Asia/Bangkok',
  'Western Indonesian Time': 'Asia/Jakarta',
  'Philippine Time': 'Asia/Manila',
  'Iran Standard Time': 'Asia/Tehran',
  'Iran Daylight Time': 'Asia/Tehran',
  'Gulf Standard Time': 'Asia/Dubai',
  'Arabia Standard Time': 'Asia/Riyadh',
  'Pakistan Standard Time': 'Asia/Karachi',
  'Nepal Time': 'Asia/Kathmandu',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Israel Daylight Time': 'Asia/Jerusalem',
  // Oceania
  'Australian Eastern Standard Time': 'Australia/Sydney',
  'Australian Eastern Daylight Time': 'Australia/Sydney',
  'Australian Central Standard Time': 'Australia/Adelaide',
  'Australian Central Daylight Time': 'Australia/Adelaide',
  'Australian Western Standard Time': 'Australia/Perth',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'New Zealand Daylight Time': 'Pacific/Auckland',
  // Africa
  'South Africa Standard Time': 'Africa/Johannesburg',
  'West Africa Time': 'Africa/Lagos',
  'East Africa Time': 'Africa/Nairobi',
  'Central Africa Time': 'Africa/Harare',
  // Americas
  'Brasilia Time': 'America/Sao_Paulo',
  'Argentina Time': 'America/Argentina/Buenos_Aires',
};

// Region context words → IANA zones (for single-word matches)
const REGION_CONTEXT_MAP = {
  'Eastern': 'America/New_York',
  'Western': 'America/Los_Angeles',
  'Central': 'America/Chicago',
  'Pacific': 'America/Los_Angeles',
  'Mountain': 'America/Denver',
  'Atlantic': 'America/Halifax'
};

// Cities that are common English words — require signal word to match
const CITY_BLOCKLIST = ['nice', 'reading', 'bath', 'mobile', 'victoria', 'regina', 'orange'];

module.exports = {
  IANA_ZONES, CITY_DICTIONARY, COUNTRY_DICTIONARY,
  ABBREVIATION_MAP, AMBIGUOUS_ABBREVIATIONS, VERBOSE_TIMEZONE_MAP,
  REGION_CONTEXT_MAP, CITY_BLOCKLIST
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/timezone-data.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/timezone-data.js test/timezone-data.test.js
git commit -m "feat: add timezone data module with full IANA database and city dictionary"
```

---

### Task 2: HTML Sanitizer (`src/sanitizer.js`)

**Files:**
- Create: `src/sanitizer.js`
- Create: `test/sanitizer.test.js`

- [ ] **Step 1: Write failing tests for sanitizer**

```javascript
// test/sanitizer.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitize } = require('../src/sanitizer.js');

describe('sanitizer', () => {
  it('strips inline HTML tags', () => {
    assert.equal(sanitize('<span>3:00 PM</span>'), '3:00 PM');
  });

  it('replaces block-level tags with spaces', () => {
    assert.equal(sanitize('3:00 PM<br>EST'), '3:00 PM EST');
    assert.equal(sanitize('3:00 PM<div>EST</div>'), '3:00 PM EST');
  });

  it('decodes HTML entities', () => {
    assert.equal(sanitize('3:00&nbsp;PM'), '3:00 PM');
    assert.equal(sanitize('US &amp; Canada'), 'US & Canada');
    assert.equal(sanitize('GMT&#8211;5'), 'GMT–5');
  });

  it('decodes numeric entities', () => {
    assert.equal(sanitize('&#160;'), ' ');
    assert.equal(sanitize('&#x00A0;'), ' ');
  });

  it('normalizes Unicode whitespace', () => {
    assert.equal(sanitize('3:00\u00A0PM'), '3:00 PM');  // non-breaking space
    assert.equal(sanitize('3:00\u200BPM'), '3:00PM');    // zero-width space → removed
    assert.equal(sanitize('3:00\u2009PM'), '3:00 PM');   // thin space
  });

  it('collapses multiple whitespace and newlines', () => {
    assert.equal(sanitize('3:00   PM   EST'), '3:00 PM EST');
    assert.equal(sanitize('3:00\n\nPM\nEST'), '3:00 PM EST');
  });

  it('strips bullets and list markers', () => {
    assert.equal(sanitize('• 3:00 PM EST'), '3:00 PM EST');
    assert.equal(sanitize('→ 3:00 PM EST'), '3:00 PM EST');
    assert.equal(sanitize('▸ 3:00 PM'), '3:00 PM');
    assert.equal(sanitize('1. 3:00 PM EST'), '3:00 PM EST');
  });

  it('preserves parentheses, brackets, and slashes', () => {
    assert.equal(sanitize('(GMT-5:00) [US & Canada]'), '(GMT-5:00) [US & Canada]');
    assert.equal(sanitize('3pm BST / 10am ET'), '3pm BST / 10am ET');
  });

  it('handles full HTML example from spec', () => {
    const input = "<span class='time'>3:00&nbsp;PM</span> <br> (GMT&#8211;5:00) Eastern&nbsp;[US &amp; Canada]";
    assert.equal(sanitize(input), '3:00 PM (GMT–5:00) Eastern [US & Canada]');
  });

  it('truncates to 500 characters', () => {
    const long = 'a'.repeat(600) + ' 3:00 PM EST';
    const result = sanitize(long);
    assert.ok(result.length <= 500);
  });

  it('truncates at word boundary', () => {
    const input = 'word '.repeat(110);  // ~550 chars
    const result = sanitize(input);
    assert.ok(result.length <= 500);
    assert.ok(!result.endsWith(' wor'));  // not mid-word
  });

  it('returns empty string for empty input', () => {
    assert.equal(sanitize(''), '');
    assert.equal(sanitize('   '), '');
  });

  it('handles nested tags', () => {
    assert.equal(sanitize('<div><span>3:00 PM</span> <b>EST</b></div>'), '3:00 PM EST');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/sanitizer.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement sanitizer.js**

```javascript
// src/sanitizer.js
const MAX_LENGTH = 500;

// Block-level tags that should become spaces
const BLOCK_TAGS = /(<\/?(div|p|br|hr|li|tr|td|th|h[1-6]|blockquote|pre|section|article|header|footer|nav|main|aside|details|summary|figure|figcaption|table|thead|tbody|tfoot|dl|dt|dd|ol|ul)\b[^>]*\/?>)/gi;

// All remaining HTML tags
const ALL_TAGS = /<[^>]+>/g;

// Named HTML entities
const NAMED_ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&apos;': "'", '&ndash;': '–', '&mdash;': '—',
  '&lsquo;': '\u2018', '&rsquo;': '\u2019', '&ldquo;': '\u201C', '&rdquo;': '\u201D',
  '&bull;': '•', '&middot;': '·', '&hellip;': '…', '&trade;': '™',
  '&copy;': '©', '&reg;': '®', '&deg;': '°', '&times;': '×',
};

// Leading junk: bullets, arrows, list markers
const LEADING_JUNK = /^[\s•▸▹►▻→⟶➤➜✦✧★☆\-–—\d]+\.\s*/;
const BULLET_CHARS = /[•▸▹►▻→⟶➤➜✦✧★☆]/g;

function sanitize(rawText) {
  if (!rawText || !rawText.trim()) return '';

  let text = rawText;

  // 1. Replace block-level tags with spaces
  text = text.replace(BLOCK_TAGS, ' ');

  // 2. Remove remaining HTML tags
  text = text.replace(ALL_TAGS, '');

  // 3. Decode named HTML entities
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    text = text.split(entity).join(char);
    // Case-insensitive version
    const lower = entity.toLowerCase();
    if (lower !== entity) text = text.split(lower).join(char);
  }

  // 4. Decode numeric entities (decimal and hex)
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // 5. Remove zero-width characters
  text = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

  // 6. Normalize Unicode whitespace to regular space
  text = text.replace(/[\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');

  // 7. Strip bullet/arrow characters
  text = text.replace(BULLET_CHARS, ' ');

  // 8. Strip leading list markers like "1. " or "- "
  text = text.replace(LEADING_JUNK, '');

  // 9. Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // 10. Truncate to MAX_LENGTH at word boundary
  if (text.length > MAX_LENGTH) {
    const truncated = text.substring(0, MAX_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    text = lastSpace > MAX_LENGTH * 0.8 ? truncated.substring(0, lastSpace) : truncated;
  }

  return text;
}

module.exports = { sanitize };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/sanitizer.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/sanitizer.js test/sanitizer.test.js
git commit -m "feat: add HTML sanitizer (Stage 1)"
```

---

## Chunk 2: Tokenizer (Phase 2A + 2B)

### Task 3: Tokenizer (`src/tokenizer.js`)

**Files:**
- Create: `src/tokenizer.js`
- Create: `test/tokenizer.test.js`

- [ ] **Step 1: Write failing tests for tokenizer**

```javascript
// test/tokenizer.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tokenizePhaseA, tokenizePhaseB } = require('../src/tokenizer.js');

describe('tokenizer Phase 2A', () => {
  // AM/PM normalization
  it('normalizes a.m./p.m. variants', () => {
    assert.equal(tokenizePhaseA('3 a.m. EST').normalizedText, '3 AM EST');
    assert.equal(tokenizePhaseA('3 p.m. EST').normalizedText, '3 PM EST');
    assert.equal(tokenizePhaseA('3 A.M. EST').normalizedText, '3 AM EST');
    assert.equal(tokenizePhaseA('3 P.M. EST').normalizedText, '3 PM EST');
  });

  it('normalizes lowercase am/pm', () => {
    assert.equal(tokenizePhaseA('3pm EST').normalizedText, '3 PM EST');
    assert.equal(tokenizePhaseA('3am EST').normalizedText, '3 AM EST');
  });

  // Glued token splitting
  it('splits time glued to timezone abbreviation', () => {
    assert.equal(tokenizePhaseA('3pmEST').normalizedText, '3 PM EST');
    assert.equal(tokenizePhaseA('12amCET').normalizedText, '12 AM CET');
    assert.equal(tokenizePhaseA('2:30pmIST').normalizedText, '2:30 PM IST');
    assert.equal(tokenizePhaseA('3PMEST').normalizedText, '3 PM EST');
  });

  it('splits 24h time glued to abbreviation', () => {
    assert.equal(tokenizePhaseA('15:00CET').normalizedText, '15:00 CET');
    assert.equal(tokenizePhaseA('14:30JST').normalizedText, '14:30 JST');
  });

  it('splits time glued to parenthetical abbreviation', () => {
    assert.equal(tokenizePhaseA('3pm(EST)').normalizedText, '3 PM (EST)');
  });

  // Proximity-based abbreviation uppercasing
  it('uppercases abbreviation adjacent to time', () => {
    assert.equal(tokenizePhaseA('3pm est').normalizedText, '3 PM EST');
    assert.equal(tokenizePhaseA('3:00 pm cet').normalizedText, '3:00 PM CET');
  });

  it('does NOT uppercase non-adjacent abbreviation-like words', () => {
    const result = tokenizePhaseA('Paris est belle at 3pm');
    assert.ok(!result.normalizedText.includes('EST'), 'should not uppercase "est" far from time');
  });

  it('does NOT uppercase unknown abbreviations', () => {
    assert.equal(tokenizePhaseA('3pm xyz').normalizedText, '3 PM xyz');
  });

  // Punctuation normalization
  it('converts em-dash and en-dash to hyphen', () => {
    assert.equal(tokenizePhaseA('3 PM — 5 PM').normalizedText, '3 PM - 5 PM');
    assert.equal(tokenizePhaseA('3 PM – 5 PM').normalizedText, '3 PM - 5 PM');
  });

  it('normalizes noon and midnight', () => {
    assert.equal(tokenizePhaseA('noon EST').normalizedText, '12:00 PM EST');
    assert.equal(tokenizePhaseA('midnight EST').normalizedText, '12:00 AM EST');
  });

  // Slash handling
  it('takes first time from slash-separated times', () => {
    const result = tokenizePhaseA('3pm BST / 10am ET');
    assert.equal(result.normalizedText, '3 PM BST');
  });

  it('preserves date slashes', () => {
    const result = tokenizePhaseA('3/15/2025 3pm ET');
    assert.ok(result.normalizedText.includes('3/15/2025'));
  });

  // rawText preservation
  it('preserves rawText for locale detection', () => {
    const result = tokenizePhaseA('15.30 Uhr MEZ');
    assert.equal(result.rawText, '15.30 Uhr MEZ');
  });
});

describe('tokenizer Phase 2B', () => {
  it('converts French 15h00 notation', () => {
    assert.equal(tokenizePhaseB('15h00'), '15:00');
    assert.equal(tokenizePhaseB('15h30'), '15:30');
    assert.equal(tokenizePhaseB('9h45'), '9:45');
  });

  it('converts German Uhr notation', () => {
    assert.equal(tokenizePhaseB('15.30 Uhr'), '15:30');
    assert.equal(tokenizePhaseB('8.00 Uhr'), '8:00');
  });

  it('converts Scandinavian kl. notation', () => {
    assert.equal(tokenizePhaseB('kl. 15.30'), '15:30');
    assert.equal(tokenizePhaseB('kl 8.00'), '8:00');
  });

  it('converts CJK time expressions', () => {
    assert.equal(tokenizePhaseB('下午3點'), '3:00 PM');
    assert.equal(tokenizePhaseB('上午9點30分'), '9:30 AM');
    assert.equal(tokenizePhaseB('午後3時'), '3:00 PM');
    assert.equal(tokenizePhaseB('午前9時30分'), '9:30 AM');
  });

  it('converts Korean time expressions', () => {
    assert.equal(tokenizePhaseB('오후 3시'), '3:00 PM');
    assert.equal(tokenizePhaseB('오전 9시 30분'), '9:30 AM');
  });

  it('converts Russian informal notation', () => {
    assert.equal(tokenizePhaseB('15ч00'), '15:00');
    assert.equal(tokenizePhaseB('9ч30'), '9:30');
  });

  it('passes through already-standard text unchanged', () => {
    assert.equal(tokenizePhaseB('3:00 PM'), '3:00 PM');
    assert.equal(tokenizePhaseB('15:30'), '15:30');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/tokenizer.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tokenizer.js**

```javascript
// src/tokenizer.js
const { ABBREVIATION_MAP, AMBIGUOUS_ABBREVIATIONS } = require('./timezone-data.js');

// Build a Set of all known abbreviation strings (uppercase)
const KNOWN_ABBREVIATIONS = new Set([
  ...Object.keys(ABBREVIATION_MAP),
  ...Object.keys(AMBIGUOUS_ABBREVIATIONS)
]);

// Time pattern for proximity detection
const TIME_REGEX = /\d{1,2}(?::\d{2})?\s*(?:AM|PM)?/i;

/**
 * Phase 2A: Non-destructive normalization (always runs).
 * Returns { normalizedText, rawText }
 */
function tokenizePhaseA(text) {
  const rawText = text;
  let t = text;

  // 1. Normalize AM/PM variants: a.m. → AM, p.m. → PM
  t = t.replace(/\ba\.?\s?m\.?\b/gi, 'AM');
  t = t.replace(/\bp\.?\s?m\.?\b/gi, 'PM');

  // 2. Split glued tokens: 3pmEST → 3 PM EST
  // 12h with meridiem glued to abbreviation
  t = t.replace(/(\d{1,2}(?::\d{2})?)\s*(AM|PM)\s*\(([A-Za-z]{2,5})\)/gi, '$1 $2 ($3)');
  t = t.replace(/(\d{1,2}(?::\d{2})?)\s*(AM|PM)([A-Za-z]{2,5})\b/gi, '$1 $2 $3');
  // 24h glued: 15:00CET → 15:00 CET
  t = t.replace(/(\d{2}:\d{2})([A-Za-z]{2,5})\b/g, '$1 $2');

  // 3. Proximity-based abbreviation case normalization
  // Find all time patterns, then uppercase known abbreviations immediately adjacent
  const tokens = t.split(/(\s+)/);  // split preserving whitespace
  const timeIndices = [];
  let tokenIdx = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\s+$/.test(tokens[i])) {
      if (TIME_REGEX.test(tokens[i])) {
        timeIndices.push(tokenIdx);
      }
      tokenIdx++;
    }
  }

  // Rebuild with uppercasing: walk non-whitespace tokens,
  // uppercase if it's a known abbreviation and adjacent to a time token
  tokenIdx = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (/^\s+$/.test(tokens[i])) continue;
    const upper = tokens[i].toUpperCase();
    if (KNOWN_ABBREVIATIONS.has(upper)) {
      // Check if any time index is within 1 non-ws token distance
      const isAdjacent = timeIndices.some(ti => Math.abs(ti - tokenIdx) <= 1);
      if (isAdjacent) {
        tokens[i] = upper;
      }
    }
    tokenIdx++;
  }
  t = tokens.join('');

  // 4. Normalize em-dash and en-dash
  t = t.replace(/[–—]/g, '-');

  // 5. Normalize noon/midnight
  t = t.replace(/\b12:00\s*noon\b/gi, '12:00 PM');
  t = t.replace(/\bnoon\b/gi, '12:00 PM');
  t = t.replace(/\b12:00\s*midnight\b/gi, '12:00 AM');
  t = t.replace(/\bmidnight\b/gi, '12:00 AM');

  // 6. Slash-separated times: take first
  const slashPattern = /^(.*?\d{1,2}(?::\d{2})?\s*(?:AM|PM)?.*?)\s+\/\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM).*)$/i;
  const slashMatch = t.match(slashPattern);
  if (slashMatch) {
    const timePattern = /\d{1,2}(?::\d{2})?\s*(?:AM|PM)|\d{1,2}:\d{2}/i;
    if (timePattern.test(slashMatch[1]) && timePattern.test(slashMatch[2])) {
      t = slashMatch[1];
    }
  }

  // 7. Clean up whitespace
  t = t.replace(/\s+/g, ' ').trim();

  return { normalizedText: t, rawText };
}

/**
 * Phase 2B: International format normalization.
 * Only runs when detected locale is 'en'.
 * Converts non-English time notation to chrono-parseable form.
 */
function tokenizePhaseB(text) {
  let t = text;

  // French: 15h00 → 15:00, 15h30 → 15:30
  t = t.replace(/(\d{1,2})h(\d{2})/gi, '$1:$2');

  // German: 15.30 Uhr → 15:30 (remove Uhr)
  t = t.replace(/(\d{1,2})\.(\d{2})\s*Uhr/gi, '$1:$2');

  // Scandinavian: kl. 15.30 → 15:30 (remove kl.)
  t = t.replace(/kl\.?\s*(\d{1,2})\.(\d{2})/gi, '$1:$2');

  // Chinese: 下午3點30分 → 3:30 PM, 上午9點 → 9:00 AM
  t = t.replace(/下午\s*(\d{1,2})\s*點\s*(\d{1,2})\s*分/g, '$1:$2 PM');
  t = t.replace(/下午\s*(\d{1,2})\s*點/g, '$1:00 PM');
  t = t.replace(/上午\s*(\d{1,2})\s*點\s*(\d{1,2})\s*分/g, '$1:$2 AM');
  t = t.replace(/上午\s*(\d{1,2})\s*點/g, '$1:00 AM');

  // Japanese: 午後3時30分 → 3:30 PM, 午前9時 → 9:00 AM
  t = t.replace(/午後\s*(\d{1,2})\s*時\s*(\d{1,2})\s*分/g, '$1:$2 PM');
  t = t.replace(/午後\s*(\d{1,2})\s*時/g, '$1:00 PM');
  t = t.replace(/午前\s*(\d{1,2})\s*時\s*(\d{1,2})\s*分/g, '$1:$2 AM');
  t = t.replace(/午前\s*(\d{1,2})\s*時/g, '$1:00 AM');

  // Korean: 오후 3시 30분 → 3:30 PM, 오전 9시 → 9:00 AM
  t = t.replace(/오후\s*(\d{1,2})\s*시\s*(\d{1,2})\s*분/g, '$1:$2 PM');
  t = t.replace(/오후\s*(\d{1,2})\s*시/g, '$1:00 PM');
  t = t.replace(/오전\s*(\d{1,2})\s*시\s*(\d{1,2})\s*분/g, '$1:$2 AM');
  t = t.replace(/오전\s*(\d{1,2})\s*시/g, '$1:00 AM');

  // Russian informal: 15ч00 → 15:00
  t = t.replace(/(\d{1,2})ч(\d{2})/g, '$1:$2');

  return t;
}

module.exports = { tokenizePhaseA, tokenizePhaseB };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/tokenizer.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/tokenizer.js test/tokenizer.test.js
git commit -m "feat: add tokenizer with Phase 2A and 2B normalization"
```

---

## Chunk 3: City & Timezone Extractor

### Task 4: City Extractor (`src/city-extractor.js`)

**Files:**
- Create: `src/city-extractor.js`
- Create: `test/city-extractor.test.js`

- [ ] **Step 1: Write failing tests for city-extractor**

```javascript
// test/city-extractor.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extract } = require('../src/city-extractor.js');

describe('city-extractor', () => {
  // GMT/UTC offset extraction
  it('extracts parenthetical GMT offset', () => {
    const r = extract('3:00 PM (GMT-5:00) Eastern');
    assert.equal(r.signals.offset, -300);
  });

  it('extracts bare UTC offset', () => {
    const r = extract('3:00 PM UTC+5:30');
    assert.equal(r.signals.offset, 330);
  });

  it('extracts bare GMT offset without minutes', () => {
    const r = extract('12 PM GMT-5');
    assert.equal(r.signals.offset, -300);
  });

  // Verbose timezone names
  it('extracts verbose timezone name', () => {
    const r = extract('3:00 PM Eastern Standard Time');
    assert.equal(r.signals.verboseName, 'Eastern Standard Time');
  });

  it('extracts longest verbose match first', () => {
    const r = extract('3:00 PM Central European Summer Time');
    assert.equal(r.signals.verboseName, 'Central European Summer Time');
  });

  // City patterns
  it('matches "{time} in {city}"', () => {
    const r = extract('3 PM in London');
    assert.equal(r.signals.cityMatch, 'london');
    assert.equal(r.signals.cityZone, 'Europe/London');
  });

  it('matches "{time} {city} time"', () => {
    const r = extract('3 PM Tokyo time');
    assert.equal(r.signals.cityMatch, 'tokyo');
    assert.equal(r.signals.cityZone, 'Asia/Tokyo');
  });

  it('matches "{city} {time}"', () => {
    const r = extract('London 3 PM');
    assert.equal(r.signals.cityMatch, 'london');
  });

  it('matches multi-word city', () => {
    const r = extract('3 PM in New York');
    assert.equal(r.signals.cityZone, 'America/New_York');
  });

  it('matches country name', () => {
    const r = extract('3 PM India time');
    assert.equal(r.signals.cityZone, 'Asia/Kolkata');
  });

  it('matches native script city', () => {
    const r = extract('3 PM 東京');
    assert.equal(r.signals.cityZone, 'Asia/Tokyo');
  });

  // False positive protection
  it('does NOT match blocklisted city without signal word', () => {
    const r = extract('Reading 3 PM');
    assert.equal(r.signals.cityMatch, null);
  });

  it('does NOT match blocklisted city mid-sentence', () => {
    const r = extract('3pm in Nice weather');
    assert.equal(r.signals.cityMatch, null);
  });

  it('DOES match blocklisted city with "in" at end of string', () => {
    const r = extract('3 PM in Nice');
    assert.equal(r.signals.cityZone, 'Europe/Paris');  // Nice → Europe/Paris
  });

  // Abbreviation extraction
  it('extracts timezone abbreviation', () => {
    const r = extract('3:00 PM EST');
    assert.equal(r.signals.abbreviation, 'EST');
  });

  it('extracts abbreviation from normalized glued text', () => {
    // Input has already been through Phase 2A: "3pmEST" → "3 PM EST"
    const r = extract('3 PM EST');
    assert.equal(r.signals.abbreviation, 'EST');
  });

  // Bracket context clues
  it('extracts bracket context clues', () => {
    const r = extract('3:00 PM [US & Canada]');
    assert.deepEqual(r.signals.contextClues, ['US', 'Canada']);
  });

  // Text stripping
  it('strips timezone tokens from cleanedText', () => {
    const r = extract('3:00 PM EST');
    assert.ok(!r.cleanedText.includes('EST'));
    assert.ok(r.cleanedText.includes('3:00 PM'));
  });

  it('strips city from cleanedText', () => {
    const r = extract('3 PM in London');
    assert.ok(!r.cleanedText.includes('London'));
    assert.ok(!r.cleanedText.includes(' in '));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/city-extractor.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement city-extractor.js**

```javascript
// src/city-extractor.js
const {
  CITY_DICTIONARY, COUNTRY_DICTIONARY, ABBREVIATION_MAP,
  AMBIGUOUS_ABBREVIATIONS, VERBOSE_TIMEZONE_MAP,
  REGION_CONTEXT_MAP, CITY_BLOCKLIST
} = require('./timezone-data.js');

// Build sorted verbose names (longest first) for greedy matching
const VERBOSE_NAMES_SORTED = Object.keys(VERBOSE_TIMEZONE_MAP)
  .sort((a, b) => b.length - a.length);

// Build sorted region names
const REGION_NAMES = Object.keys(REGION_CONTEXT_MAP);

// All known abbreviations (longest first)
const ALL_ABBREVIATIONS = [
  ...new Set([
    ...Object.keys(ABBREVIATION_MAP),
    ...Object.keys(AMBIGUOUS_ABBREVIATIONS)
  ])
].sort((a, b) => b.length - a.length);

// Merge city + country dictionaries for matching
// Multi-word entries sorted longest first
const ALL_LOCATION_ENTRIES = [
  ...Object.entries(CITY_DICTIONARY),
  ...Object.entries(COUNTRY_DICTIONARY),
].sort((a, b) => b[0].length - a[0].length);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract all timezone signals from normalized text.
 * Returns { cleanedText, signals, normalizedInputText }
 */
function extract(text) {
  const signals = {
    offset: null,
    verboseName: null,
    cityMatch: null,
    cityZone: null,
    abbreviation: null,
    contextClues: [],
  };

  let t = text;
  const normalizedInputText = text;

  // 1. Extract GMT/UTC offsets — parenthetical first, then bare
  const parenOffsetRegex = /\((?:GMT|UTC)\s*([+-])\s*(\d{1,2}):?(\d{2})?\)/gi;
  const parenMatch = parenOffsetRegex.exec(t);
  if (parenMatch) {
    const sign = parenMatch[1] === '+' ? 1 : -1;
    const hours = parseInt(parenMatch[2]);
    const minutes = parenMatch[3] ? parseInt(parenMatch[3]) : 0;
    signals.offset = sign * (hours * 60 + minutes);
    t = t.replace(parenMatch[0], ' ');
  }

  if (signals.offset === null) {
    const bareOffsetRegex = /\b(?:GMT|UTC)\s*([+-])\s*(\d{1,2}):?(\d{2})?\b/gi;
    const bareMatch = bareOffsetRegex.exec(t);
    if (bareMatch) {
      const sign = bareMatch[1] === '+' ? 1 : -1;
      const hours = parseInt(bareMatch[2]);
      const minutes = bareMatch[3] ? parseInt(bareMatch[3]) : 0;
      signals.offset = sign * (hours * 60 + minutes);
      t = t.replace(bareMatch[0], ' ');
    }
  }

  // 2. Extract bracket context clues
  const bracketRegex = /\[([^\]]+)\]/g;
  let bracketMatch;
  while ((bracketMatch = bracketRegex.exec(t)) !== null) {
    const parts = bracketMatch[1].split(/\s*(?:&|and|,)\s*/);
    parts.forEach(p => {
      const trimmed = p.trim();
      if (trimmed) signals.contextClues.push(trimmed);
    });
  }
  t = t.replace(/\[[^\]]+\]/g, ' ');

  // 3. Extract verbose timezone names (longest first)
  for (const name of VERBOSE_NAMES_SORTED) {
    const regex = new RegExp('\\b' + escapeRegex(name) + '\\b', 'gi');
    const newText = t.replace(regex, ' ');
    if (newText !== t) {
      signals.verboseName = name;
      t = newText;
      break;  // take first (longest) match
    }
  }

  // 4. Extract single-word region names as context clues
  for (const name of REGION_NAMES) {
    const regex = new RegExp('\\b' + escapeRegex(name) + '\\b(?!\\w)', 'gi');
    const newText = t.replace(regex, ' ');
    if (newText !== t) {
      signals.contextClues.push(name);
      t = newText;
    }
  }

  // 5. City/country pattern matching
  if (!signals.cityMatch) {
    // Try "{time} in {location}" — location must be at end or followed by punctuation
    for (const [name, zone] of ALL_LOCATION_ENTRIES) {
      const isSingleWord = !name.includes(' ');
      const isBlocked = CITY_BLOCKLIST.includes(name.toLowerCase());

      // Pattern: "in {name}" at end of string
      const inPattern = new RegExp(
        '\\bin\\s+' + escapeRegex(name) + '\\s*$', 'i'
      );
      const inMatch = t.match(inPattern);
      if (inMatch) {
        // Blocklisted: "in Nice" at end is OK, "in Nice weather" is not (handled by $ anchor)
        if (isBlocked) {
          // "in {blocked}" at end of string is allowed
          signals.cityMatch = name.toLowerCase();
          signals.cityZone = zone;
          t = t.replace(inMatch[0], ' ');
          break;
        }
        signals.cityMatch = name.toLowerCase();
        signals.cityZone = zone;
        t = t.replace(inMatch[0], ' ');
        break;
      }

      // Pattern: "{name} time"
      const timePattern = new RegExp(
        '\\b' + escapeRegex(name) + '\\s+time\\b', 'i'
      );
      const timeMatch = t.match(timePattern);
      if (timeMatch) {
        signals.cityMatch = name.toLowerCase();
        signals.cityZone = zone;
        t = t.replace(timeMatch[0], ' ');
        break;
      }

      // Pattern: "{name} {time}" at start OR "{time} {name}" — but only for
      // non-blocklisted, or multi-word names
      if (!isBlocked && (!isSingleWord || isWellKnownCity(name))) {
        const nameRegex = new RegExp('\\b' + escapeRegex(name) + '\\b', 'i');
        if (nameRegex.test(t)) {
          signals.cityMatch = name.toLowerCase();
          signals.cityZone = zone;
          t = t.replace(nameRegex, ' ');
          break;
        }
      }
    }
  }

  // 6. Extract timezone abbreviations
  // Strip parenthetical offsets first so we don't match GMT/UTC inside them
  const strippedForAbbr = t.replace(/\((?:GMT|UTC)\s*[+-]\s*\d{1,2}:?\d{0,2}\)/gi, '');
  for (const abbr of ALL_ABBREVIATIONS) {
    const regex = new RegExp('\\b' + abbr + '\\b', 'i');
    if (regex.test(strippedForAbbr)) {
      signals.abbreviation = abbr.toUpperCase();
      // Strip from cleaned text
      t = t.replace(new RegExp('\\b' + abbr + '\\b', 'i'), ' ');
      break;
    }
  }

  // 7. Clean up
  t = t.replace(/\s+/g, ' ').trim();

  return {
    cleanedText: t,
    signals,
    normalizedInputText,
  };
}

/**
 * Well-known cities that can match freely (not blocklisted, population >1M)
 */
function isWellKnownCity(name) {
  const wellKnown = [
    'london', 'paris', 'tokyo', 'shanghai', 'beijing', 'seoul', 'singapore',
    'mumbai', 'delhi', 'dubai', 'sydney', 'melbourne', 'cairo', 'moscow',
    'istanbul', 'bangkok', 'jakarta', 'manila', 'karachi', 'lagos',
    'nairobi', 'toronto', 'chicago', 'houston', 'phoenix',
  ];
  return wellKnown.includes(name.toLowerCase());
}

module.exports = { extract };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/city-extractor.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/city-extractor.js test/city-extractor.test.js
git commit -m "feat: add city and timezone extractor (Stage 3)"
```

---

## Chunk 4: Locale Detection + Chrono Rewrite + Timezone Resolver Expansion

### Task 5: Expand timezone-resolver.js

**Files:**
- Modify: `src/timezone-resolver.js`
- Modify: `test/timezone-resolver.test.js`

- [ ] **Step 1: Write new failing tests for expanded resolver**

Add these tests to `test/timezone-resolver.test.js`:

```javascript
// Append to existing test file
describe('timezone-resolver expanded', () => {
  it('resolves city match at priority 3', () => {
    const result = resolveTimezone({
      signals: {
        offset: null, verboseName: null,
        cityMatch: 'london', cityZone: 'Europe/London',
        abbreviation: null, contextClues: []
      },
      parsedDate: new Date('2026-01-15'), userTimezone: 'America/New_York'
    });
    assert.equal(result.zone, 'Europe/London');
    assert.equal(result.confidence, 'high');
  });

  it('offset beats city match', () => {
    const result = resolveTimezone({
      signals: {
        offset: -300, verboseName: null,
        cityMatch: 'london', cityZone: 'Europe/London',
        abbreviation: null, contextClues: []
      },
      parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
    });
    // Offset should win — it's priority 1
    assert.ok(result.zone !== 'Europe/London');
  });

  it('returns medium confidence for ambiguous abbreviation', () => {
    const result = resolveTimezone({
      signals: {
        offset: null, verboseName: null,
        cityMatch: null, cityZone: null,
        abbreviation: 'CST', contextClues: []
      },
      parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
    });
    assert.equal(result.confidence, 'medium');
    assert.equal(result.zone, 'America/Chicago');
  });

  it('returns high confidence for unambiguous abbreviation', () => {
    const result = resolveTimezone({
      signals: {
        offset: null, verboseName: null,
        cityMatch: null, cityZone: null,
        abbreviation: 'JST', contextClues: []
      },
      parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
    });
    assert.equal(result.confidence, 'high');
    assert.equal(result.zone, 'Asia/Tokyo');
  });

  it('returns low confidence when no signals', () => {
    const result = resolveTimezone({
      signals: {
        offset: null, verboseName: null,
        cityMatch: null, cityZone: null,
        abbreviation: null, contextClues: []
      },
      parsedDate: new Date('2026-01-15'), userTimezone: 'America/New_York'
    });
    assert.equal(result.confidence, 'low');
    assert.equal(result.zone, 'America/New_York');
  });

  it('SST defaults to Samoa', () => {
    const result = resolveTimezone({
      signals: {
        offset: null, verboseName: null,
        cityMatch: null, cityZone: null,
        abbreviation: 'SST', contextClues: []
      },
      parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
    });
    assert.equal(result.zone, 'Pacific/Pago_Pago');
  });

  it('generates confidenceDetail string', () => {
    const result = resolveTimezone({
      signals: {
        offset: null, verboseName: null,
        cityMatch: null, cityZone: null,
        abbreviation: 'EST', contextClues: []
      },
      parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
    });
    assert.ok(result.confidenceDetail.includes('EST'));
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail (existing pass)**

Run: `node --test test/timezone-resolver.test.js`
Expected: New tests FAIL, existing tests still PASS

- [ ] **Step 3: Rewrite timezone-resolver.js with new signals-based API**

Refactor `resolveTimezone` to accept `{ signals, parsedDate, userTimezone }` and return `{ zone, confidence, confidenceDetail }`. Keep backward compatibility by detecting old-style calls. Import data from `timezone-data.js`. Add 3-level confidence. See spec Section "Stage 5" for full priority ordering.

The implementation should:
- Import all maps from `timezone-data.js` instead of defining them inline
- Accept `signals` object from city-extractor
- Return `{ zone, confidence, confidenceDetail }` instead of just a zone string
- Keep all existing resolution logic (offset matching, abbreviation disambiguation, context clues)
- Add city match at priority 3
- Add `confidenceDetail` generation

- [ ] **Step 4: Run all timezone-resolver tests**

Run: `node --test test/timezone-resolver.test.js`
Expected: All PASS (old and new)

- [ ] **Step 5: Commit**

```bash
git add src/timezone-resolver.js test/timezone-resolver.test.js
git commit -m "feat: expand timezone resolver with signals API and 3-level confidence"
```

---

### Task 6: Rewrite chrono-bundle.js with locale routing

**Files:**
- Modify: `src/chrono-bundle.js`
- Modify: `test/chrono-bundle.test.js`

- [ ] **Step 1: Write new failing tests for locale routing**

Add to `test/chrono-bundle.test.js`:

```javascript
describe('locale detection and routing', () => {
  it('detects German locale from "Uhr"', () => {
    const r = parse('15.30 Uhr MEZ', { userTimezone: 'UTC' });
    assert.ok(r);
    assert.equal(r.detectedLocale, 'de');
  });

  it('detects French locale from "15h00"', () => {
    const r = parse('15h00 CET', { userTimezone: 'UTC' });
    assert.ok(r);
    assert.equal(r.detectedLocale, 'fr');
  });

  it('detects Spanish locale', () => {
    const r = parse('lunes a las 3 de la tarde', { userTimezone: 'UTC' });
    assert.ok(r);
    assert.equal(r.detectedLocale, 'es');
  });

  it('defaults to English locale', () => {
    const r = parse('3:00 PM EST', { userTimezone: 'UTC' });
    assert.ok(r);
    assert.equal(r.detectedLocale, 'en');
  });

  it('falls back to English when locale parser fails', () => {
    // German word but English time format
    const r = parse('Montag 3:00 PM EST', { userTimezone: 'UTC' });
    assert.ok(r);
    // Should still parse even if de parser fails on "3:00 PM"
  });

  it('returns confidenceDetail in result', () => {
    const r = parse('3:00 PM EST', { userTimezone: 'UTC' });
    assert.ok(r.confidenceDetail);
    assert.ok(r.confidenceDetail.includes('EST'));
  });

  it('returns cityMatch in result', () => {
    const r = parse('3 PM in London', { userTimezone: 'UTC' });
    assert.ok(r);
    assert.equal(r.cityMatch, 'london');
  });

  it('returns 3-level confidence', () => {
    const high = parse('3:00 PM EST', { userTimezone: 'UTC' });
    assert.equal(high.confidence, 'high');

    const low = parse('3:00 PM', { userTimezone: 'UTC' });
    assert.equal(low.confidence, 'low');
  });

  it('handles glued tokens after tokenizer', () => {
    const r = parse('3pmEST', { userTimezone: 'UTC' });
    assert.ok(r);
    assert.equal(r.sourceTimezone, 'America/New_York');
  });

  it('handles lowercase abbreviations', () => {
    const r = parse('3pm est', { userTimezone: 'UTC' });
    assert.ok(r);
    assert.equal(r.sourceTimezone, 'America/New_York');
  });

  it('truncates input over 500 chars', () => {
    const long = 'x '.repeat(300) + '3:00 PM EST';
    const r = parse(long, { userTimezone: 'UTC' });
    // May or may not parse depending on truncation — should not crash
    assert.ok(r === null || typeof r === 'object');
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `node --test test/chrono-bundle.test.js`
Expected: New tests FAIL, existing PASS

- [ ] **Step 3: Rewrite chrono-bundle.js**

Rewrite to:
1. Import `sanitize` from `./sanitizer.js`
2. Import `tokenizePhaseA`, `tokenizePhaseB` from `./tokenizer.js`
3. Import `extract` from `./city-extractor.js`
4. Import all 12 chrono locales
5. Implement `detectLocale(rawText)` function
6. Implement new `parse()` flow: sanitize → tokenize 2A → extract → detect locale → chrono parse (with 2B if en) → resolve timezone → construct date
7. Return new API contract fields (`confidenceDetail`, `detectedLocale`, `cityMatch`)
8. Keep existing rejection logic, range handling, wall-clock extraction

- [ ] **Step 4: Run ALL tests**

Run: `node --test test/*.test.js`
Expected: All PASS (old and new across all suites)

- [ ] **Step 5: Commit**

```bash
git add src/chrono-bundle.js test/chrono-bundle.test.js
git commit -m "feat: rewrite chrono-bundle with locale routing and 6-stage pipeline"
```

---

## Chunk 5: UI Changes — Full IANA Dropdown + Confidence Indicator

### Task 7: Update popup.js — Full IANA dropdown

**Files:**
- Modify: `popup.js`
- Modify: `popup.html` (if dropdown structure needs changes)

- [ ] **Step 1: Replace timezone initialization with full IANA list**

In `popup.js`, replace the curated ~40 timezone array with dynamic generation from `Intl.supportedValuesOf('timeZone')`. Group by continent. Compute display names and offsets dynamically.

- [ ] **Step 2: Add continent grouping to dropdown rendering**

Update the dropdown rendering to show continent headers (Americas, Europe, Asia, Africa, Pacific, etc.) with zones grouped underneath.

- [ ] **Step 3: Add recent zones section**

Pin last 5 used zones at top of dropdown (stored in `chrome.storage.local`). Update on each conversion.

- [ ] **Step 4: Update search to match city, country, abbreviation, offset, long name**

Expand the existing search filter to match against all these fields.

- [ ] **Step 5: Test manually — load extension, verify dropdown**

- Open extension popup
- Verify dropdown shows all ~400 zones grouped by continent
- Verify search works for city, country, abbreviation
- Verify recent zones appear at top after using a zone

- [ ] **Step 6: Commit**

```bash
git add popup.js popup.html
git commit -m "feat: full IANA timezone dropdown with continent grouping and recents"
```

---

### Task 8: Add confidence indicator to popup.js

**Files:**
- Modify: `popup.js`
- Modify: `popup.html` (add confidence bar element)

- [ ] **Step 1: Add confidence indicator HTML element**

Add an amber bar element between the input section and results section in `popup.html`.

- [ ] **Step 2: Update conversion logic to handle 3-level confidence**

In the `convertTime()` function in `popup.js`:
- Read `confidence` and `confidenceDetail` from parse result
- Show/hide confidence bar based on level
- Wire `[Change]` button to open From timezone picker

- [ ] **Step 3: Test manually**

- Type `"3:00 PM"` → low confidence bar shows "No timezone detected — using your local time [Change]"
- Type `"3:00 PM CST"` → medium confidence bar shows "Assumed: CST → US Central [Change]"
- Type `"3:00 PM EST"` → no confidence bar (high)
- Click [Change] → From dropdown opens

- [ ] **Step 4: Commit**

```bash
git add popup.js popup.html
git commit -m "feat: add confidence indicator bar for medium/low confidence results"
```

---

## Chunk 6: Integration Tests + Build + Version Bump

### Task 9: Integration tests

**Files:**
- Modify: `test/integration.test.js`

- [ ] **Step 1: Add new real-world integration tests**

Add ~35 new tests covering the full pipeline end-to-end:

```javascript
// Append to test/integration.test.js
describe('universal parser integration', () => {
  // Glued tokens
  it('parses 3pmEST', () => {
    const r = parse('3pmEST', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.sourceTimezone, 'America/New_York'); assert.equal(r.confidence, 'high');
  });

  it('parses 3pm est (lowercase)', () => {
    const r = parse('3pm est', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.sourceTimezone, 'America/New_York');
  });

  it('parses 2:30pmIST', () => {
    const r = parse('2:30pmIST', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.sourceTimezone, 'Asia/Kolkata');
  });

  // AM/PM variants
  it('parses 3:00 p.m. EST', () => {
    const r = parse('3:00 p.m. EST', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.sourceTimezone, 'America/New_York');
  });

  // International formats
  it('parses 15h00 CET (French)', () => {
    const r = parse('15h00 CET', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.sourceTimezone, 'Europe/Paris');
  });

  it('parses 15.30 Uhr MEZ (German)', () => {
    const r = parse('15.30 Uhr MEZ', { userTimezone: 'UTC' });
    assert.ok(r);
  });

  // City-based
  it('parses "3pm in London"', () => {
    const r = parse('3pm in London', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.sourceTimezone, 'Europe/London'); assert.equal(r.confidence, 'high');
  });

  it('parses "Meeting at 3pm Tokyo time"', () => {
    const r = parse('Meeting at 3pm Tokyo time', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.sourceTimezone, 'Asia/Tokyo');
  });

  // Verbose timezone
  it('parses "3:00 p.m. Eastern Standard Time"', () => {
    const r = parse('3:00 p.m. Eastern Standard Time', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.sourceTimezone, 'America/New_York');
  });

  // Complex real-world
  it('parses "3:00 PM (GMT-5:00) Eastern [US & Canada]"', () => {
    const r = parse('3:00 PM (GMT-5:00) Eastern [US & Canada]', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.confidence, 'high');
  });

  // Confidence levels
  it('returns low confidence for bare time', () => {
    const r = parse('3:00 PM', { userTimezone: 'America/New_York' });
    assert.ok(r); assert.equal(r.confidence, 'low');
  });

  it('returns medium confidence for ambiguous CST', () => {
    const r = parse('3pm CST', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.confidence, 'medium');
  });

  // Rejections (should still work)
  it('rejects bare number', () => {
    assert.equal(parse('12', { userTimezone: 'UTC' }), null);
  });

  it('rejects date-only', () => {
    assert.equal(parse('March 15, 2025', { userTimezone: 'UTC' }), null);
  });

  it('rejects gibberish', () => {
    assert.equal(parse('hello world', { userTimezone: 'UTC' }), null);
  });

  // HTML sanitization end-to-end
  it('parses time from HTML-heavy input', () => {
    const r = parse('<span>3:00&nbsp;PM</span> <br>EST', { userTimezone: 'UTC' });
    assert.ok(r); assert.equal(r.sourceTimezone, 'America/New_York');
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `node --test test/*.test.js`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add test/integration.test.js
git commit -m "test: add integration tests for universal parser"
```

---

### Task 10: Build, version bump, migrate preprocessor tests

**Files:**
- Modify: `manifest.json` — version to `2.2.0`
- Modify: `package.json` — version to `2.2.0`
- Delete (or deprecate): reference to `preprocessor.js` from pipeline

- [ ] **Step 1: Migrate preprocessor tests**

Review `test/preprocessor.test.js`. Ensure equivalent coverage exists in `sanitizer.test.js`, `tokenizer.test.js`, and `city-extractor.test.js`. Any gaps → add tests to the appropriate new suite.

- [ ] **Step 2: Run full test suite**

Run: `node --test test/*.test.js`
Expected: All PASS

- [ ] **Step 3: Build the bundle**

Run: `npm run build`
Expected: `libs/chrono.bundle.js` generated, ~500-600KB

- [ ] **Step 4: Verify bundle size**

Run: `ls -la libs/chrono.bundle.js`
Expected: ~500-600KB

- [ ] **Step 5: Bump version**

Update `manifest.json` and `package.json` version to `2.2.0`.

- [ ] **Step 6: Build release zip**

```bash
zip -r TimeShift.zip manifest.json popup.html popup.js background.js libs/ icons/ -x "*.DS_Store"
```

- [ ] **Step 7: Final full test run**

Run: `node --test test/*.test.js`
Expected: All PASS (~160 tests)

- [ ] **Step 8: Commit all**

```bash
git add -A
git commit -m "chore: bump version to 2.2.0, build bundle, add release zip"
```

- [ ] **Step 9: Push and update PR**

```bash
git push origin feat/universal-time-parser
```

The PR at https://github.com/akhil-saxena/convert-timezone/pull/5 will auto-update. Do NOT merge — user will test first.
