// src/tokenizer.js
const { ABBREVIATION_MAP, AMBIGUOUS_ABBREVIATIONS } = require('./timezone-data.js');

// Build a Set of all known abbreviation strings (uppercase)
const KNOWN_ABBREVIATIONS = new Set([
  ...Object.keys(ABBREVIATION_MAP),
  ...Object.keys(AMBIGUOUS_ABBREVIATIONS)
]);

// Time pattern for proximity detection (matches digits with optional colon-minutes and optional AM/PM)
const TIME_REGEX = /\d{1,2}(?::\d{2})?\s*(?:AM|PM)?/i;
// Also treat standalone AM/PM as time-adjacent markers
const MERIDIEM_REGEX = /^(?:AM|PM)$/i;

/**
 * Phase 2A: Non-destructive normalization (always runs).
 * Returns { normalizedText, rawText }
 */
function tokenizePhaseA(text) {
  const rawText = text;
  let t = text;

  // 1. Normalize AM/PM variants: a.m. → AM, p.m. → PM
  // Handle dotted forms first (a.m., p.m., A.M., P.M.)
  t = t.replace(/a\.m\./gi, 'AM');
  t = t.replace(/p\.m\./gi, 'PM');
  // Handle plain am/pm (including glued to digits like 3pm or 3pmEST)
  // Note: no /i flag so [^a-z] won't exclude uppercase letters
  t = t.replace(/(\d)([aApP])[mM](?=[^a-z]|$)/g, (_, digit, letter) => digit + (letter.toLowerCase() === 'a' ? ' AM' : ' PM'));
  t = t.replace(/\bam\b/gi, 'AM');
  t = t.replace(/\bpm\b/gi, 'PM');

  // 2. Split glued tokens: 3 PMEST → 3 PM EST
  // 12h with meridiem glued to parenthetical abbreviation
  t = t.replace(/(\d{1,2}(?::\d{2})?)\s*(AM|PM)\s*\(([A-Za-z]{2,5})\)/gi, '$1 $2 ($3)');
  // 12h with meridiem glued to abbreviation
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
      if (TIME_REGEX.test(tokens[i]) || MERIDIEM_REGEX.test(tokens[i])) {
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
