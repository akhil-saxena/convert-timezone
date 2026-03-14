/**
 * chrono-bundle.js — Main orchestration module (Stage 5).
 * Imports chrono-node and the three Stage modules, exposes a single parse() API.
 * Built with esbuild into libs/chrono.bundle.js as window.TimeShiftParser.
 */

const chrono = require('chrono-node');
const { preprocess } = require('./preprocessor.js');
const { resolveTimezone, getOffsetAtDate } = require('./timezone-resolver.js');
const { constructDateInTimezone } = require('./date-constructor.js');

/**
 * Known timezone abbreviations to scan for in text.
 * Ordered longest-first so "AEST" matches before "EST".
 */
const TZ_ABBREVIATIONS = [
    'NZDT', 'NZST', 'AEDT', 'AEST', 'ACDT', 'ACST', 'AWST',
    'AKDT', 'AKST', 'CEST', 'EEST', 'IRST', 'SAST',
    'EST', 'EDT', 'CST', 'CDT', 'MST', 'MDT', 'PST', 'PDT',
    'HST', 'UTC', 'GMT', 'BST', 'IST', 'CET', 'EET',
    'JST', 'KST', 'SGT', 'HKT', 'ICT', 'WIB', 'PHT',
    'MSK', 'TRT', 'GST', 'AST', 'WAT', 'EAT', 'BRT', 'ART', 'PET',
    'ET', 'CT', 'MT', 'PT'
];

/**
 * Ambiguous abbreviations: maps to candidate IANA zones.
 * When chrono provides an offset, we use it to pick among the candidates
 * by matching each candidate's known offset for that abbreviation.
 */
const AMBIGUOUS_ABBR_CANDIDATES = {
    'CST': ['America/Chicago', 'Asia/Shanghai'],
    'IST': ['Asia/Kolkata', 'Asia/Jerusalem', 'Europe/Dublin'],
    'BST': ['Europe/London', 'Asia/Dhaka'],
    'AST': ['America/Halifax', 'Asia/Riyadh'],
    'GST': ['Asia/Dubai']
};

/**
 * Known offsets for specific abbreviations (the offset that abbreviation
 * conventionally represents, used to match against chrono's offset).
 * Maps "ABBR:IANA" -> offset in minutes.
 */
const ABBR_ZONE_OFFSETS = {
    'BST:Europe/London': 60,      // British Summer Time = UTC+1
    'BST:Asia/Dhaka': 360,        // Bangladesh Standard Time = UTC+6
    'CST:America/Chicago': -360,  // Central Standard Time = UTC-6
    'CST:Asia/Shanghai': 480,     // China Standard Time = UTC+8
    'IST:Asia/Kolkata': 330,      // India Standard Time = UTC+5:30
    'IST:Asia/Jerusalem': 120,    // Israel Standard Time = UTC+2
    'IST:Europe/Dublin': 60,      // Irish Standard Time = UTC+1
    'AST:America/Halifax': -240,  // Atlantic Standard Time = UTC-4
    'AST:Asia/Riyadh': 180,       // Arabia Standard Time = UTC+3
    'GST:Asia/Dubai': 240         // Gulf Standard Time = UTC+4
};

/**
 * Regex pattern to detect a time expression in text
 * (used to reject date-only strings).
 */
const TIME_PATTERN = /\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm|AM|PM)\b|noon|midnight/i;

/**
 * Scan text for a timezone abbreviation, skipping matches that appear
 * inside parenthetical offset patterns like (GMT-5:00) or (UTC+01:00).
 * Returns the first standalone abbreviation found (as uppercase), or null.
 */
function extractTimezoneAbbreviation(text) {
    // Strip parenthetical offsets so we don't match GMT/UTC inside them
    const stripped = text.replace(/\((?:GMT|UTC)\s*[+-]\s*\d{1,2}:?\d{0,2}\)/gi, '');

    for (const abbr of TZ_ABBREVIATIONS) {
        const regex = new RegExp('\\b' + abbr + '\\b', 'i');
        if (regex.test(stripped)) {
            return abbr.toUpperCase();
        }
    }
    return null;
}

/**
 * Main parse function.
 *
 * @param {string} text - Raw text to parse (e.g. "12 PM (GMT-5:00) Eastern [US & Canada]")
 * @param {object} options
 * @param {string} options.userTimezone - User's IANA timezone (e.g. "Asia/Kolkata")
 * @returns {object|null} Parsed result or null if no time found
 */
function parse(text, options = {}) {
    const userTimezone = options.userTimezone || 'UTC';

    // Stage 1: Preprocess
    const preprocessed = preprocess(text);
    const { cleanedText, extractedOffset, contextClues, originalText } = preprocessed;

    // Parse with chrono.strict (rejects bare numbers like "12")
    const chronoResults = chrono.strict.parse(cleanedText);
    if (chronoResults.length === 0) {
        return null;
    }

    const chronoResult = chronoResults[0];
    const startComp = chronoResult.start;

    // Reject date-only input: chrono parsed something but no explicit time component
    if (!startComp.isCertain('hour')) {
        return null;
    }

    // Extract time components from chrono
    const year = startComp.get('year');
    const month = startComp.get('month') - 1; // JS months are 0-indexed
    const day = startComp.get('day');
    const hour = startComp.get('hour');
    const minute = startComp.get('minute');
    const second = startComp.get('second') || 0;

    // Detect timezone abbreviation from the original text
    const abbreviation = extractTimezoneAbbreviation(originalText);

    // Get chrono's timezone offset if it parsed one
    const chronoOffset = startComp.isCertain('timezoneOffset')
        ? startComp.get('timezoneOffset')
        : null;

    // Build a rough date for timezone resolution
    const roughDate = new Date(Date.UTC(year, month, day, hour, minute, second));

    // Stage 2: Resolve timezone
    // Strategy:
    // - If the preprocessor extracted an explicit offset (e.g. "(GMT-5:00)"),
    //   pass it as offsetMinutes — it's authoritative user input.
    // - If we found a text abbreviation:
    //   a) For unambiguous abbreviations (EST, PST, etc.): resolve by abbreviation only.
    //      Don't pass chrono's offset because it would cause the resolver to pick
    //      a different zone via offset priority when DST shifts the actual offset.
    //   b) For ambiguous abbreviations (BST, CST, IST, etc.): pass chrono's offset
    //      to help disambiguate among candidates.
    // - If no abbreviation but chrono gave us an offset, pass that offset.
    let resolvedZone;

    if (extractedOffset !== null) {
        // Preprocessor found an explicit offset like (GMT-5:00)
        resolvedZone = resolveTimezone({
            abbreviation,
            offsetMinutes: extractedOffset,
            contextClues,
            parsedDate: roughDate,
            userTimezone
        });
    } else if (abbreviation && AMBIGUOUS_ABBR_CANDIDATES[abbreviation]) {
        // Ambiguous abbreviation — first try resolving by abbreviation + context clues
        resolvedZone = resolveTimezone({
            abbreviation,
            offsetMinutes: null,
            contextClues,
            parsedDate: roughDate,
            userTimezone
        });
        // If chrono gave us an offset, validate/correct the resolution by matching
        // the offset against the known offsets for each candidate zone.
        // This handles cases like BST (user in Asia) where region-matching picks
        // Asia/Dhaka but chrono's +60 offset tells us it's Europe/London.
        if (chronoOffset !== null) {
            const candidates = AMBIGUOUS_ABBR_CANDIDATES[abbreviation];
            for (const zone of candidates) {
                const key = abbreviation + ':' + zone;
                const knownOffset = ABBR_ZONE_OFFSETS[key];
                if (knownOffset !== undefined && knownOffset === chronoOffset) {
                    resolvedZone = zone;
                    break;
                }
            }
        }
    } else if (abbreviation) {
        // Unambiguous abbreviation — resolve by abbreviation only
        resolvedZone = resolveTimezone({
            abbreviation,
            offsetMinutes: null,
            contextClues,
            parsedDate: roughDate,
            userTimezone
        });
    } else if (chronoOffset !== null) {
        // No abbreviation in text, but chrono parsed an offset
        resolvedZone = resolveTimezone({
            abbreviation: null,
            offsetMinutes: chronoOffset,
            contextClues,
            parsedDate: roughDate,
            userTimezone
        });
    } else {
        // No timezone info at all
        resolvedZone = resolveTimezone({
            abbreviation: null,
            offsetMinutes: null,
            contextClues,
            parsedDate: roughDate,
            userTimezone
        });
    }

    // Determine confidence
    const confidence = resolvedZone ? 'high' : 'low';

    // The timezone to use for date construction
    const effectiveZone = resolvedZone || userTimezone;

    // Stage 4: Construct the UTC date
    // When we have an explicit offset from the preprocessor (e.g. "(GMT-5:00)"),
    // use the offset directly for UTC computation. This is because the user
    // specified a fixed offset, and the resolved zone might currently observe
    // a different offset due to DST (e.g. New York in summer is EDT/-4 not EST/-5).
    let utcDate;
    if (extractedOffset !== null) {
        // Direct offset computation: wallTime - offset = UTC
        const wallMs = Date.UTC(year, month, day, hour, minute, second);
        utcDate = new Date(wallMs - extractedOffset * 60000);
    } else {
        utcDate = constructDateInTimezone(year, month, day, hour, minute, second, effectiveZone);
    }

    // Check if this is a range (chrono natively detects ranges with - / to / through)
    const isRange = chronoResult.end !== null && chronoResult.end !== undefined;
    let rangeEndUtcDate = null;

    if (isRange) {
        const endComp = chronoResult.end;
        const endYear = endComp.get('year');
        const endMonth = endComp.get('month') - 1;
        let endDay = endComp.get('day');
        const endHour = endComp.get('hour');
        const endMinute = endComp.get('minute');
        const endSecond = endComp.get('second') || 0;

        // Cross-midnight: if end time < start time, advance end day by 1
        // Use constructDateInTimezone (not raw ms math) as per requirements
        if (endHour < hour || (endHour === hour && endMinute < minute)) {
            endDay += 1;
        }

        if (extractedOffset !== null) {
            const endWallMs = Date.UTC(endYear, endMonth, endDay, endHour, endMinute, endSecond);
            rangeEndUtcDate = new Date(endWallMs - extractedOffset * 60000);
        } else {
            rangeEndUtcDate = constructDateInTimezone(
                endYear, endMonth, endDay, endHour, endMinute, endSecond, effectiveZone
            );
        }
    }

    return {
        utcDate,
        sourceTimezone: effectiveZone,
        confidence,
        isRange,
        rangeEndUtcDate,
        // When user explicitly stated an offset like (GMT-5:00), carry it
        // so the UI shows "UTC-05:00" instead of the zone's current DST label
        explicitOffset: extractedOffset,
        // Carry original wall-clock components so the UI can display
        // what the user typed (e.g. "12 PM") rather than reformatting
        // through the zone's current DST offset (which could show "1 PM")
        wallClock: { year, month, day, hour, minute, second },
        rangeEndWallClock: isRange ? {
            year: chronoResult.end.get('year'),
            month: chronoResult.end.get('month') - 1,
            day: chronoResult.end.get('day'),
            hour: chronoResult.end.get('hour'),
            minute: chronoResult.end.get('minute'),
            second: chronoResult.end.get('second') || 0
        } : null
    };
}

module.exports = { parse };
