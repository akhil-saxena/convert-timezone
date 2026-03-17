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
 * Check if string contains only printable ASCII characters.
 * Non-Latin scripts (CJK, Cyrillic, Arabic, etc.) don't work with \b word boundaries.
 */
function isAsciiText(str) {
  return /^[\x20-\x7E]+$/.test(str);
}

/**
 * Test if a non-ASCII name appears in the text (case-insensitive).
 * Returns the matched substring and index, or null.
 */
function findNonAsciiName(text, name) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(name.toLowerCase());
  if (idx === -1) return null;
  return { index: idx, match: text.substring(idx, idx + name.length) };
}

/**
 * Remove a non-ASCII name from text, replacing with a space.
 */
function stripNonAsciiName(text, name) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(name.toLowerCase());
  if (idx === -1) return text;
  return text.substring(0, idx) + ' ' + text.substring(idx + name.length);
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

  // 1. Extract GMT/UTC offsets -- parenthetical first, then bare
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
    // Try "{time} in {location}" -- location must be at end or followed by punctuation
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

      // Pattern: "{name} {time}" at start OR "{time} {name}" -- but only for
      // non-blocklisted, multi-word names, well-known cities, or non-ASCII scripts
      if (!isBlocked && (!isSingleWord || isWellKnownCity(name) || !isAsciiText(name))) {
        if (isAsciiText(name)) {
          const nameRegex = new RegExp('\\b' + escapeRegex(name) + '\\b', 'i');
          if (nameRegex.test(t)) {
            signals.cityMatch = name.toLowerCase();
            signals.cityZone = zone;
            t = t.replace(nameRegex, ' ');
            break;
          }
        } else {
          // Non-ASCII names (CJK, Cyrillic, Arabic, etc.) -- \b doesn't work
          const found = findNonAsciiName(t, name);
          if (found) {
            signals.cityMatch = name.toLowerCase();
            signals.cityZone = zone;
            t = stripNonAsciiName(t, name);
            break;
          }
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
