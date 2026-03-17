const UNAMBIGUOUS_ABBREVIATIONS = {
    'EST': 'America/New_York', 'EDT': 'America/New_York', 'ET': 'America/New_York',
    'CST': 'America/Chicago', 'CDT': 'America/Chicago', 'CT': 'America/Chicago',
    'MST': 'America/Denver', 'MDT': 'America/Denver', 'MT': 'America/Denver',
    'PST': 'America/Los_Angeles', 'PDT': 'America/Los_Angeles', 'PT': 'America/Los_Angeles',
    'AKST': 'America/Anchorage', 'AKDT': 'America/Anchorage', 'HST': 'Pacific/Honolulu',
    'UTC': 'UTC', 'GMT': 'UTC',
    'BST': 'Europe/London', 'IST': 'Asia/Kolkata',
    'CET': 'Europe/Paris', 'CEST': 'Europe/Paris',
    'EET': 'Europe/Helsinki', 'EEST': 'Europe/Helsinki',
    'JST': 'Asia/Tokyo', 'KST': 'Asia/Seoul', 'SGT': 'Asia/Singapore',
    'HKT': 'Asia/Hong_Kong', 'ICT': 'Asia/Bangkok', 'WIB': 'Asia/Jakarta',
    'PHT': 'Asia/Manila', 'NZST': 'Pacific/Auckland', 'NZDT': 'Pacific/Auckland',
    'AEST': 'Australia/Sydney', 'AEDT': 'Australia/Sydney',
    'ACST': 'Australia/Adelaide', 'ACDT': 'Australia/Adelaide', 'AWST': 'Australia/Perth',
    'MSK': 'Europe/Moscow', 'TRT': 'Europe/Istanbul',
    'GST': 'Asia/Dubai', 'AST': 'America/Halifax',
    'SAST': 'Africa/Johannesburg', 'WAT': 'Africa/Lagos', 'EAT': 'Africa/Nairobi',
    'IRST': 'Asia/Tehran', 'BRT': 'America/Sao_Paulo',
    'ART': 'America/Argentina/Buenos_Aires', 'PET': 'America/Lima'
};

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

const OFFSET_PRIORITY = {
    '-600': ['Pacific/Honolulu'],
    '-540': ['America/Anchorage'],
    '-480': ['America/Los_Angeles', 'America/Vancouver'],
    '-420': ['America/Denver', 'America/Phoenix', 'America/Edmonton'],
    '-360': ['America/Chicago', 'America/Winnipeg', 'America/Mexico_City'],
    '-300': ['America/New_York', 'America/Toronto', 'America/Chicago', 'America/Lima'],
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

const REGION_CONTEXT_MAP = {
    'Eastern': 'America/New_York',
    'Western': 'America/Los_Angeles',
    'Central': 'America/Chicago',
    'Pacific': 'America/Los_Angeles',
    'Mountain': 'America/Denver',
    'Atlantic': 'America/Halifax'
};

function resolveTimezone({ abbreviation, offsetMinutes, contextClues, parsedDate, userTimezone }) {
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

function resolveFromAbbreviation(abbr, contextClues, userTimezone) {
    const ambiguous = AMBIGUOUS_ABBREVIATIONS[abbr];
    if (ambiguous) {
        for (const [zone, keywords] of Object.entries(ambiguous.candidates)) {
            for (const clue of contextClues) {
                if (keywords.some(kw => kw.toLowerCase() === clue.toLowerCase())) return zone;
            }
        }
        for (const [zone] of Object.entries(ambiguous.candidates)) {
            if (userTimezone === zone) return zone;
        }
        const userRegion = userTimezone.split('/')[0];
        for (const [zone] of Object.entries(ambiguous.candidates)) {
            const zoneRegion = zone.split('/')[0];
            if (userRegion === zoneRegion) return zone;
        }
        return ambiguous.default;
    }
    return UNAMBIGUOUS_ABBREVIATIONS[abbr] || null;
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
