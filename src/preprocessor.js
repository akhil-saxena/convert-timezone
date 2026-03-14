/**
 * Pre-processor — Stage 1 of the parsing pipeline.
 * Normalizes messy real-world text and extracts metadata (offsets, context clues)
 * into a side-channel object before stripping them from the text.
 */

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

const SINGLE_WORD_TIMEZONE_NAMES = [
    'Eastern', 'Western', 'Central', 'Pacific', 'Mountain', 'Atlantic'
];

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
        const parts = content.split(/\s*(?:&|and|,)\s*/);
        parts.forEach(p => {
            const trimmed = p.trim();
            if (trimmed) contextClues.push(trimmed);
        });
    }
    text = text.replace(/\[[^\]]+\]/g, ' ');

    // 3. Extract verbose timezone names (longest match first)
    // NOTE: Do NOT use regex.test() then regex.replace() with same /gi regex —
    // test() advances lastIndex, causing replace() to miss. Use replace-and-compare.
    const sortedVerbose = [...VERBOSE_TIMEZONE_NAMES].sort((a, b) => b.length - a.length);
    for (const name of sortedVerbose) {
        const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
        const newText = text.replace(regex, ' ');
        if (newText !== text) {
            contextClues.push(name);
            text = newText;
        }
    }

    // 4. Extract single-word timezone region names
    for (const name of SINGLE_WORD_TIMEZONE_NAMES) {
        const regex = new RegExp(`\\b${name}\\b(?!\\w)`, 'gi');
        const newText = text.replace(regex, ' ');
        if (newText !== text) {
            contextClues.push(name);
            text = newText;
        }
    }

    // 5. Handle slash-separated times: "3pm BST / 10am ET"
    const slashPattern = /^(.*?\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?.*?)\s+\/\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm).*)$/i;
    const slashMatch = text.match(slashPattern);
    if (slashMatch) {
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

    // 7. Normalize em-dash and en-dash to hyphen
    text = text.replace(/[–—]/g, '-');

    // 8. Clean up whitespace
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
