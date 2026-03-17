const {
    ABBREVIATION_MAP,
    AMBIGUOUS_ABBREVIATIONS,
    VERBOSE_TIMEZONE_MAP,
    REGION_CONTEXT_MAP,
    OFFSET_PRIORITY
} = require('./timezone-data.js');

/**
 * Resolve a timezone from extraction signals.
 *
 * New API (signals-based):
 *   resolveTimezone({ signals, parsedDate, userTimezone })
 *   Returns { zone, confidence, confidenceDetail }
 *
 * Legacy API (backward compatible):
 *   resolveTimezone({ abbreviation, offsetMinutes, contextClues, parsedDate, userTimezone })
 *   Returns a zone string (or null)
 */
function resolveTimezone(args) {
    // Detect old-style call: has 'abbreviation' key directly (not nested in signals)
    if ('abbreviation' in args && !('signals' in args)) {
        return resolveTimezoneLegacy(args);
    }

    const { signals, parsedDate, userTimezone } = args;
    const {
        offset = null,
        verboseName = null,
        cityMatch = null,
        cityZone = null,
        abbreviation = null,
        contextClues = []
    } = signals || {};

    // Priority 1: Explicit offset (GMT-5, UTC+5:30) — highest, unambiguous
    if (offset !== null) {
        const resolved = resolveFromOffset(offset, contextClues, parsedDate, userTimezone);
        if (resolved) {
            return {
                zone: resolved,
                confidence: 'high',
                confidenceDetail: `Resolved from explicit offset (UTC${offset >= 0 ? '+' : ''}${offset / 60})`
            };
        }
    }

    // Priority 2: Verbose timezone name — unambiguous
    if (verboseName) {
        const verboseMatch = VERBOSE_TIMEZONE_MAP[verboseName];
        if (verboseMatch) {
            return {
                zone: verboseMatch,
                confidence: 'high',
                confidenceDetail: `Detected ${verboseName}`
            };
        }
    }

    // Priority 3: City/country match — unambiguous (from Stage 3 cityZone)
    if (cityZone) {
        return {
            zone: cityZone,
            confidence: 'high',
            confidenceDetail: `Matched city: ${cityMatch || 'unknown'} (${cityZone})`
        };
    }

    // Priority 4 & 5: Abbreviation resolution
    if (abbreviation) {
        const upper = abbreviation.toUpperCase();
        const ambiguous = AMBIGUOUS_ABBREVIATIONS[upper];

        if (ambiguous) {
            // Priority 5: Ambiguous abbreviation — medium confidence
            const resolved = resolveAmbiguousAbbreviation(upper, ambiguous, contextClues, userTimezone);
            return {
                zone: resolved,
                confidence: 'medium',
                confidenceDetail: contextClues.length > 0
                    ? `Resolved ${upper} via context clues (${resolved})`
                    : `Assumed ${upper} -> ${resolved} (ambiguous, no context clues)`
            };
        }

        // Priority 4: Unambiguous abbreviation — high confidence
        const unambiguous = ABBREVIATION_MAP[upper];
        if (unambiguous) {
            return {
                zone: unambiguous,
                confidence: 'high',
                confidenceDetail: `Detected ${upper} (${unambiguous})`
            };
        }
    }

    // Check region context clues as last signal-based attempt
    for (const clue of contextClues) {
        const regionMatch = REGION_CONTEXT_MAP[clue];
        if (regionMatch) {
            return {
                zone: regionMatch,
                confidence: 'medium',
                confidenceDetail: `Inferred from region context: ${clue}`
            };
        }
    }

    // Priority 6: User timezone fallback — lowest, no signal found
    return {
        zone: userTimezone,
        confidence: 'low',
        confidenceDetail: null
    };
}

/**
 * Legacy API — preserves exact old behavior, returns zone string or null.
 */
function resolveTimezoneLegacy({ abbreviation, offsetMinutes, contextClues, parsedDate, userTimezone }) {
    // Check verbose names in context clues
    for (const clue of contextClues) {
        const verboseMatch = VERBOSE_TIMEZONE_MAP[clue];
        if (verboseMatch) return verboseMatch;
    }

    if (offsetMinutes !== null) {
        const resolved = resolveFromOffset(offsetMinutes, contextClues, parsedDate, userTimezone);
        if (resolved) return resolved;
    }

    if (abbreviation) {
        const upper = abbreviation.toUpperCase();
        return resolveFromAbbreviation(upper, contextClues, userTimezone);
    }

    for (const clue of contextClues) {
        const regionMatch = REGION_CONTEXT_MAP[clue];
        if (regionMatch) return regionMatch;
    }

    return null;
}

function resolveFromOffset(offsetMinutes, contextClues, parsedDate, userTimezone) {
    const key = String(offsetMinutes);
    const candidates = OFFSET_PRIORITY[key];
    if (candidates && candidates.length > 0) {
        for (const candidate of candidates) {
            if (matchesContextClues(candidate, contextClues)) return candidate;
        }
        const verified = candidates.filter(zone => {
            const actualOffset = getOffsetAtDate(zone, parsedDate);
            return actualOffset === offsetMinutes;
        });
        if (verified.length > 0) return verified[0];
        return candidates[0];
    }
    return resolveFromOffsetFallback(offsetMinutes, parsedDate, userTimezone);
}

/**
 * Resolve an ambiguous abbreviation using context clues, user timezone, and defaults.
 */
function resolveAmbiguousAbbreviation(abbr, ambiguous, contextClues, userTimezone) {
    // Try context clue match
    for (const [zone, keywords] of Object.entries(ambiguous.candidates)) {
        for (const clue of contextClues) {
            if (keywords.some(kw => kw.toLowerCase() === clue.toLowerCase())) return zone;
        }
    }
    // Try exact user timezone match
    for (const [zone] of Object.entries(ambiguous.candidates)) {
        if (userTimezone === zone) return zone;
    }
    // Try user region match
    const userRegion = userTimezone.split('/')[0];
    for (const [zone] of Object.entries(ambiguous.candidates)) {
        const zoneRegion = zone.split('/')[0];
        if (userRegion === zoneRegion) return zone;
    }
    return ambiguous.default;
}

/**
 * Legacy abbreviation resolution — handles both ambiguous and unambiguous.
 * Uses the old inline UNAMBIGUOUS_ABBREVIATIONS map behavior via ABBREVIATION_MAP.
 */
function resolveFromAbbreviation(abbr, contextClues, userTimezone) {
    const ambiguous = AMBIGUOUS_ABBREVIATIONS[abbr];
    if (ambiguous) {
        return resolveAmbiguousAbbreviation(abbr, ambiguous, contextClues, userTimezone);
    }
    return ABBREVIATION_MAP[abbr] || null;
}

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
        const tzWallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
        return Math.round((tzWallMs - date.getTime()) / 60000);
    } catch { return null; }
}

function matchesContextClues(ianaZone, contextClues) {
    const parts = ianaZone.split('/');
    const city = parts[parts.length - 1].replace(/_/g, ' ').toLowerCase();
    for (const clue of contextClues) {
        const clueLower = clue.toLowerCase();
        if (ianaZone.toLowerCase().includes(clueLower) || city.includes(clueLower)) return true;
        if (REGION_CONTEXT_MAP[clue] && ianaZone === REGION_CONTEXT_MAP[clue]) return true;
    }
    return false;
}

function resolveFromOffsetFallback(offsetMinutes, parsedDate, userTimezone) {
    try {
        const allZones = Intl.supportedValuesOf('timeZone');
        const matches = [];
        for (const zone of allZones) {
            if (getOffsetAtDate(zone, parsedDate) === offsetMinutes) matches.push(zone);
        }
        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];
        const userRegion = userTimezone.split('/')[0];
        const sameRegion = matches.find(z => z.split('/')[0] === userRegion);
        if (sameRegion) return sameRegion;
        return matches[0];
    } catch { return null; }
}

module.exports = { resolveTimezone, getOffsetAtDate };
