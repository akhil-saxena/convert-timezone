/**
 * chrono-bundle.js — Main orchestration module (Stage 4).
 * Implements the full 6-stage pipeline with locale routing:
 *   Stage 1: Sanitizer
 *   Stage 2A: Tokenizer (non-destructive)
 *   Stage 3: City & Timezone Extractor
 *   Stage 4: Locale detection + Chrono parse (with 2B if locale == en)
 *   Stage 5: Timezone resolution
 *   Stage 6: Date construction
 *
 * Built with esbuild into libs/chrono.bundle.js as window.TimeShiftParser.
 */

const chrono = require('chrono-node');
const { sanitize } = require('./sanitizer.js');
const { tokenizePhaseA, tokenizePhaseB } = require('./tokenizer.js');
const { extract } = require('./city-extractor.js');
const { resolveTimezone, getOffsetAtDate } = require('./timezone-resolver.js');
const { constructDateInTimezone } = require('./date-constructor.js');
const { AMBIGUOUS_ABBREVIATIONS } = require('./timezone-data.js');

/**
 * Known offsets for ambiguous abbreviation candidates.
 * Maps "ABBR:IANA" -> offset in minutes.
 * Used to disambiguate when chrono detects a timezone offset from text.
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
    'GST:Asia/Dubai': 240,        // Gulf Standard Time = UTC+4
    'SST:Pacific/Pago_Pago': -660, // Samoa Standard Time = UTC-11
};

// All chrono locale parsers
const LOCALE_PARSERS = {
    de: chrono.de,
    fr: chrono.fr,
    ja: chrono.ja,
    pt: chrono.pt,
    nl: chrono.nl,
    es: chrono.es,
    zh: chrono.zh,
    ru: chrono.ru,
    uk: chrono.uk,
    it: chrono.it,
    sv: chrono.sv,
};

// Fallback locales: tried if en parser returns null (no detection cues for these)
const FALLBACK_LOCALES = ['it', 'sv', 'uk'];

/**
 * Locale detection keyword/pattern table.
 * Runs on original text (pre-tokenization) to preserve locale cues.
 * Order: check each locale's patterns; first match wins.
 */
const LOCALE_PATTERNS = [
    {
        locale: 'ja',
        patterns: [/午後/, /午前/, /時/, /月曜/, /火曜/, /水曜/, /木曜/, /金曜/, /土曜/, /日曜/]
    },
    {
        locale: 'zh',
        patterns: [/上午/, /下午/, /星期/, /點/]
    },
    {
        locale: 'ru',
        patterns: [/утра/, /вечера/, /понедельник/, /вторник/, /среда/, /четверг/, /пятница/, /часов/, /часа/]
    },
    {
        locale: 'de',
        patterns: [/\bUhr\b/i, /\bMontag\b/i, /\bDienstag\b/i, /\bMittwoch\b/i, /\bDonnerstag\b/i, /\bFreitag\b/i, /\bSamstag\b/i, /\bSonntag\b/i, /\bMärz\b/i, /\bJanuar\b/i, /\bFebruar\b/i, /\bMEZ\b/i, /\bMESZ\b/i]
    },
    {
        locale: 'fr',
        patterns: [/\bheure\b/i, /\blundi\b/i, /\bmardi\b/i, /\bmercredi\b/i, /\bjeudi\b/i, /\bvendredi\b/i, /\bsamedi\b/i, /\bdimanche\b/i, /\bmars\b/i, /\bjanvier\b/i, /\bfévrier\b/i, /\d{1,2}h\d{2}/i]
    },
    {
        locale: 'pt',
        patterns: [/\bmanhã\b/i, /\bsegunda\b/i, /\bterça\b/i, /\bquarta\b/i, /\bquinta\b/i, /\bsexta\b/i, /\bsábado\b/i, /\bdomingo\b/i, /\bda\s+tarde\b/i, /\bda\s+manhã\b/i]
    },
    {
        locale: 'nl',
        patterns: [/\bmaandag\b/i, /\bdinsdag\b/i, /\bwoensdag\b/i, /\bdonderdag\b/i, /\bvrijdag\b/i, /\bzaterdag\b/i, /\bzondag\b/i, /\buur\b/i]
    },
    {
        locale: 'es',
        patterns: [/\btarde\b/i, /\blunes\b/i, /\bmartes\b/i, /\bmiércoles\b/i, /\bjueves\b/i, /\bviernes\b/i, /\bsábado\b/i, /\bdomingo\b/i, /\bde\s+la\s+tarde\b/i, /\bde\s+la\s+mañana\b/i]
    },
];

/**
 * Detect the locale of the input text by scanning for locale-specific keywords.
 * @param {string} rawText - Original text (pre-tokenization)
 * @returns {string} Detected locale code ('en', 'de', 'fr', etc.)
 */
function detectLocale(rawText) {
    for (const { locale, patterns } of LOCALE_PATTERNS) {
        for (const pattern of patterns) {
            if (pattern.test(rawText)) {
                return locale;
            }
        }
    }
    return 'en';
}

/**
 * Try to parse text with a chrono locale parser.
 * Uses casual mode for non-English locales (their strict mode often rejects
 * locale-specific idioms like "3 de la tarde" or "Montag 15:30").
 * Returns the chrono result array or empty array.
 */
function parseWithLocale(locale, text) {
    const parser = LOCALE_PARSERS[locale];
    if (!parser) return [];

    // Try casual first for non-en locales (captures locale idioms)
    let results = parser.casual.parse(text);
    if (results.length > 0) return results;

    // Fallback to strict
    results = parser.strict.parse(text);
    return results;
}

/**
 * Main parse function — 6-stage pipeline.
 *
 * @param {string} text - Raw text to parse
 * @param {object} options
 * @param {string} options.userTimezone - User's IANA timezone (e.g. "Asia/Kolkata")
 * @returns {object|null} Parsed result or null if no time found
 */
function parse(text, options = {}) {
    const userTimezone = options.userTimezone || 'UTC';

    // ---- Stage 1: Sanitize ----
    const sanitized = sanitize(text);
    if (!sanitized) return null;

    // ---- Stage 2A: Tokenizer Phase A (non-destructive) ----
    const { normalizedText, rawText } = tokenizePhaseA(sanitized);

    // ---- Stage 3: City & Timezone Extractor ----
    const { cleanedText, signals, normalizedInputText } = extract(normalizedText);

    // ---- Stage 4: Locale Detection + Chrono Parse ----
    const detectedLocale = detectLocale(rawText);

    let chronoResults = [];

    if (detectedLocale !== 'en') {
        // Non-English locale: feed Stage 2A output (non-destructive only) to locale parser
        chronoResults = parseWithLocale(detectedLocale, cleanedText);

        // If locale parser fails, apply Stage 2B and try English
        if (chronoResults.length === 0) {
            const phaseBText = tokenizePhaseB(cleanedText);
            chronoResults = chrono.strict.parse(phaseBText);
        }
    } else {
        // English locale: apply Stage 2B normalization first
        const phaseBText = tokenizePhaseB(cleanedText);
        chronoResults = chrono.strict.parse(phaseBText);
    }

    // If still no result, try fallback locales (it, sv, uk) as last resort
    if (chronoResults.length === 0) {
        for (const fallbackLocale of FALLBACK_LOCALES) {
            if (fallbackLocale === detectedLocale) continue; // already tried
            chronoResults = parseWithLocale(fallbackLocale, cleanedText);
            if (chronoResults.length > 0) break;
        }
    }

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

    // Build a rough date for timezone resolution
    const roughDate = new Date(Date.UTC(year, month, day, hour, minute, second));

    // ---- Stage 5: Timezone Resolution ----
    const resolved = resolveTimezone({
        signals,
        parsedDate: roughDate,
        userTimezone,
    });

    let effectiveZone = resolved.zone;
    let confidence = resolved.confidence;
    let confidenceDetail = resolved.confidenceDetail;

    // Chrono offset disambiguation for ambiguous abbreviations:
    // If Stage 3 found an ambiguous abbreviation, try parsing the pre-extraction text
    // through chrono to get its timezone offset interpretation. This helps disambiguate
    // cases like BST where chrono knows the offset is +1 (Europe/London) not +6 (Asia/Dhaka).
    if (signals.abbreviation && AMBIGUOUS_ABBREVIATIONS[signals.abbreviation] && confidence === 'medium') {
        const chronoWithAbbr = chrono.strict.parse(normalizedInputText);
        if (chronoWithAbbr.length > 0) {
            const abbrStart = chronoWithAbbr[0].start;
            const chronoOffset = abbrStart.isCertain('timezoneOffset')
                ? abbrStart.get('timezoneOffset')
                : null;
            if (chronoOffset !== null) {
                const ambiguous = AMBIGUOUS_ABBREVIATIONS[signals.abbreviation];
                const candidates = Object.keys(ambiguous.candidates);
                for (const zone of candidates) {
                    const key = signals.abbreviation + ':' + zone;
                    const knownOffset = ABBR_ZONE_OFFSETS[key];
                    if (knownOffset !== undefined && knownOffset === chronoOffset) {
                        effectiveZone = zone;
                        confidence = 'high';
                        confidenceDetail = `Detected ${signals.abbreviation} (${zone}) via chrono offset`;
                        break;
                    }
                }
            }
        }
    }

    // ---- Stage 6: Date Construction ----
    let utcDate;
    if (signals.offset !== null) {
        // Direct offset computation: wallTime - offset = UTC
        const wallMs = Date.UTC(year, month, day, hour, minute, second);
        utcDate = new Date(wallMs - signals.offset * 60000);
    } else {
        utcDate = constructDateInTimezone(year, month, day, hour, minute, second, effectiveZone);
    }

    // Check if this is a range
    const isRange = chronoResult.end !== null && chronoResult.end !== undefined;
    let rangeEndUtcDate = null;
    let rangeEndWallClock = null;

    if (isRange) {
        const endComp = chronoResult.end;
        const endYear = endComp.get('year');
        const endMonth = endComp.get('month') - 1;
        let endDay = endComp.get('day');
        const endHour = endComp.get('hour');
        const endMinute = endComp.get('minute');
        const endSecond = endComp.get('second') || 0;

        // Cross-midnight: if end time < start time, advance end day by 1
        if (endHour < hour || (endHour === hour && endMinute < minute)) {
            endDay += 1;
        }

        if (signals.offset !== null) {
            const endWallMs = Date.UTC(endYear, endMonth, endDay, endHour, endMinute, endSecond);
            rangeEndUtcDate = new Date(endWallMs - signals.offset * 60000);
        } else {
            rangeEndUtcDate = constructDateInTimezone(
                endYear, endMonth, endDay, endHour, endMinute, endSecond, effectiveZone
            );
        }

        rangeEndWallClock = {
            year: endYear,
            month: endMonth,
            day: endDay,
            hour: endHour,
            minute: endMinute,
            second: endSecond,
        };
    }

    return {
        utcDate,
        sourceTimezone: effectiveZone,
        confidence,
        confidenceDetail,
        isRange,
        rangeEndUtcDate,
        explicitOffset: signals.offset,
        hasExplicitDate: startComp.isCertain('day') || startComp.isCertain('month') || startComp.isCertain('year'),
        wallClock: { year, month, day, hour, minute, second },
        rangeEndWallClock,
        detectedLocale,
        cityMatch: signals.cityMatch || null,
    };
}

module.exports = { parse };
