/**
 * Popup Script for Convert Timezone Chrome Extension
 * Handles the popup interface with timezone dropdowns and conversion functionality
 * Uses TimeShiftParser (chrono-based) + native Intl APIs instead of moment.js
 */

// Global variables
let timezones = [];
let selectedFromTimezone = null;
let selectedToTimezone = null;
let userTimezone = null;
let lastConversionText = '';

// DOM elements
const elements = {
    dateTimeInput: null,
    convertBtn: null,
    result: null,
    fromTimezoneDropdown: null,
    fromTimezoneMenu: null,
    fromTimezoneSearch: null,
    fromTimezoneOptions: null,
    toTimezoneDropdown: null,
    toTimezoneMenu: null,
    toTimezoneSearch: null,
    toTimezoneOptions: null,
    nowBtn: null,
    copyBtn: null,
    copyBtnText: null,
    confidenceBar: null,
    confidenceText: null,
    confidenceChangeBtn: null,
    reportIssueLink: null
};

/**
 * Initialize popup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', async function() {
    initializeElements();
    detectUserTimezone();

    // Load recent timezones before initializing dropdowns
    await loadRecentTimezones();
    initializeTimezones();
    setupEventListeners();

    // Load saved timezone preferences
    await loadTimezonePreferences();

    // Check if opened from context menu
    checkForContextMenuText();

    // Smart placeholder — show current time as hint
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    elements.dateTimeInput.placeholder = `e.g., ${timeStr} (now)`;
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
    elements.dateTimeInput = document.getElementById('dateTimeInput');
    elements.convertBtn = document.getElementById('convertBtn');
    elements.result = document.getElementById('result');
    elements.fromTimezoneDropdown = document.getElementById('fromTimezoneDropdown');
    elements.fromTimezoneMenu = document.getElementById('fromTimezoneMenu');
    elements.fromTimezoneSearch = document.getElementById('fromTimezoneSearch');
    elements.fromTimezoneOptions = document.getElementById('fromTimezoneOptions');
    elements.toTimezoneDropdown = document.getElementById('toTimezoneDropdown');
    elements.toTimezoneMenu = document.getElementById('toTimezoneMenu');
    elements.toTimezoneSearch = document.getElementById('toTimezoneSearch');
    elements.toTimezoneOptions = document.getElementById('toTimezoneOptions');
    elements.nowBtn = document.getElementById('nowBtn');
    elements.copyBtn = document.getElementById('copyBtn');
    elements.copyBtnText = document.getElementById('copyBtnText');
    elements.confidenceBar = document.getElementById('confidenceBar');
    elements.confidenceText = document.getElementById('confidenceText');
    elements.confidenceChangeBtn = document.getElementById('confidenceChangeBtn');
    elements.reportIssueLink = document.getElementById('reportIssueLink');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Convert button
    elements.convertBtn.addEventListener('click', handleConversion);

    // Enter key in input field
    elements.dateTimeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleConversion();
        }
    });

    // Clear result when input changes
    elements.dateTimeInput.addEventListener('input', function() {
        elements.result.classList.remove('show');
        elements.confidenceBar.style.display = 'none';
        elements.reportIssueLink.style.display = 'none';
    });

    // From timezone dropdown
    elements.fromTimezoneDropdown.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleDropdown('from');
    });

    // To timezone dropdown
    elements.toTimezoneDropdown.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleDropdown('to');
    });

    // Search functionality
    elements.fromTimezoneSearch.addEventListener('input', function() {
        filterTimezones('from', this.value);
    });

    elements.toTimezoneSearch.addEventListener('input', function() {
        filterTimezones('to', this.value);
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function() {
        closeAllDropdowns();
    });

    // Prevent dropdown from closing when clicking inside
    elements.fromTimezoneMenu.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    elements.toTimezoneMenu.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // Now button — fill input with current time
    elements.nowBtn.addEventListener('click', function() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        elements.dateTimeInput.value = timeStr;
        handleConversion();
    });

    // Confidence "Change" button — opens the From timezone dropdown
    elements.confidenceChangeBtn.addEventListener('click', function() {
        toggleDropdown('from');
    });

    // Copy button — copy last conversion text to clipboard
    elements.copyBtn.addEventListener('click', function() {
        if (!lastConversionText) return;
        navigator.clipboard.writeText(lastConversionText).then(() => {
            elements.copyBtnText.textContent = 'Copied!';
            setTimeout(() => {
                elements.copyBtnText.textContent = 'Copy';
            }, 1500);
        });
    });
}

// ============================================================
// Country search map — lets users type country names to find zones
// ============================================================

const COUNTRY_SEARCH_MAP = {
    'usa': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
    'united states': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
    'us': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
    'india': ['Asia/Kolkata'],
    'japan': ['Asia/Tokyo'],
    'china': ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Urumqi'],
    'uk': ['Europe/London'],
    'united kingdom': ['Europe/London'],
    'britain': ['Europe/London'],
    'england': ['Europe/London'],
    'germany': ['Europe/Berlin'],
    'france': ['Europe/Paris'],
    'australia': ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart'],
    'canada': ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns'],
    'brazil': ['America/Sao_Paulo', 'America/Manaus', 'America/Bahia', 'America/Fortaleza'],
    'mexico': ['America/Mexico_City', 'America/Cancun', 'America/Tijuana'],
    'russia': ['Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk', 'Asia/Vladivostok'],
    'south korea': ['Asia/Seoul'],
    'korea': ['Asia/Seoul'],
    'singapore': ['Asia/Singapore'],
    'uae': ['Asia/Dubai'],
    'dubai': ['Asia/Dubai'],
    'saudi arabia': ['Asia/Riyadh'],
    'saudi': ['Asia/Riyadh'],
    'israel': ['Asia/Jerusalem'],
    'turkey': ['Europe/Istanbul'],
    'italy': ['Europe/Rome'],
    'spain': ['Europe/Madrid'],
    'netherlands': ['Europe/Amsterdam'],
    'switzerland': ['Europe/Zurich'],
    'sweden': ['Europe/Stockholm'],
    'norway': ['Europe/Oslo'],
    'finland': ['Europe/Helsinki'],
    'greece': ['Europe/Athens'],
    'poland': ['Europe/Warsaw'],
    'portugal': ['Europe/Lisbon'],
    'ireland': ['Europe/Dublin'],
    'egypt': ['Africa/Cairo'],
    'south africa': ['Africa/Johannesburg'],
    'nigeria': ['Africa/Lagos'],
    'kenya': ['Africa/Nairobi'],
    'morocco': ['Africa/Casablanca'],
    'thailand': ['Asia/Bangkok'],
    'indonesia': ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'],
    'philippines': ['Asia/Manila'],
    'taiwan': ['Asia/Taipei'],
    'hong kong': ['Asia/Hong_Kong'],
    'malaysia': ['Asia/Kuala_Lumpur'],
    'vietnam': ['Asia/Ho_Chi_Minh'],
    'pakistan': ['Asia/Karachi'],
    'bangladesh': ['Asia/Dhaka'],
    'iran': ['Asia/Tehran'],
    'new zealand': ['Pacific/Auckland'],
    'argentina': ['America/Argentina/Buenos_Aires'],
    'chile': ['America/Santiago'],
    'colombia': ['America/Bogota'],
    'peru': ['America/Lima'],
};

// ============================================================
// Intl-based timezone utilities
// ============================================================

/**
 * Build a human-readable display name for an IANA timezone using Intl APIs
 */
/**
 * Build timezone info for display.
 * Returns { displayName, longName } where:
 *   displayName = "Chicago (UTC-05:00)" — shown in dropdown trigger + result labels
 *   longName = "Central Standard Time" — shown as second line in dropdown options
 */
function buildTimezoneInfo(ianaZone) {
    if (ianaZone === 'UTC') return {
        displayName: 'UTC (Coordinated Universal Time)',
        longName: 'Coordinated Universal Time'
    };
    try {
        const now = new Date();
        // Offset like "GMT-04:00" → "UTC-04:00"
        const offsetFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone, timeZoneName: 'longOffset'
        });
        const offsetStr = offsetFormatter.formatToParts(now)
            .find(p => p.type === 'timeZoneName')?.value || '';
        const utcOffset = offsetStr.replace('GMT', 'UTC');

        // Long timezone name like "Central Standard Time"
        const longFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone, timeZoneName: 'long'
        });
        const longName = longFormatter.formatToParts(now)
            .find(p => p.type === 'timeZoneName')?.value || '';

        const city = ianaZone.split('/').pop().replace(/_/g, ' ');
        const displayName = `${city} (${utcOffset})`;

        return { displayName, longName };
    } catch {
        return { displayName: ianaZone, longName: '' };
    }
}

/**
 * Get the current UTC offset in minutes for an IANA timezone
 */
function getTimezoneOffsetMinutes(ianaZone) {
    if (ianaZone === 'UTC') return 0;
    try {
        const now = new Date();
        const f = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone, year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'
        });
        const parts = f.formatToParts(now);
        const get = (t) => parseInt(parts.find(p => p.type === t).value);
        const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
        return Math.round((wall - now.getTime()) / 60000);
    } catch {
        return 0;
    }
}

/**
 * Detect user's timezone using Intl
 */
/**
 * Map legacy IANA timezone names to modern equivalents in our curated list.
 */
const LEGACY_TIMEZONE_MAP = {
    'Asia/Calcutta': 'Asia/Kolkata',
    'America/Montreal': 'America/Toronto',
    'America/Shiprock': 'America/Denver',
    'US/Alaska': 'America/Anchorage',
    'US/Arizona': 'America/Phoenix',
    'US/Central': 'America/Chicago',
    'US/Eastern': 'America/New_York',
    'US/Hawaii': 'Pacific/Honolulu',
    'US/Mountain': 'America/Denver',
    'US/Pacific': 'America/Los_Angeles'
};

function detectUserTimezone() {
    try {
        let detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        // Map legacy IANA names to modern equivalents
        userTimezone = LEGACY_TIMEZONE_MAP[detected] || detected;
    } catch {
        userTimezone = 'UTC';
    }
}

// ============================================================
// Timezone initialization — full IANA from Intl.supportedValuesOf
// ============================================================

/**
 * Map IANA prefix to continent/region group name
 */
function getRegionGroup(ianaName) {
    if (ianaName === 'UTC') return 'UTC';
    const prefix = ianaName.split('/')[0];
    switch (prefix) {
        case 'America': return 'Americas';
        case 'Europe': return 'Europe';
        case 'Asia': return 'Asia';
        case 'Africa': return 'Africa';
        case 'Australia': return 'Australia/Oceania';
        case 'Pacific': return 'Pacific';
        case 'Indian': return 'Indian Ocean';
        case 'Atlantic': return 'Atlantic';
        case 'Arctic': return 'Arctic';
        case 'Antarctica': return 'Antarctica';
        default: return 'Other';
    }
}

/**
 * Ordered list of region groups for display
 */
const REGION_ORDER = [
    'UTC', 'Americas', 'Europe', 'Asia', 'Africa',
    'Australia/Oceania', 'Pacific', 'Indian Ocean', 'Atlantic', 'Arctic', 'Antarctica', 'Other'
];

/**
 * Generate full timezone list from all IANA zones via Intl.supportedValuesOf
 */
function generateAllTimezones() {
    let allZones;
    try {
        allZones = Intl.supportedValuesOf('timeZone');
    } catch {
        // Fallback for older environments — return a minimal set
        allZones = [
            'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
            'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
            'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
            'Australia/Sydney', 'Pacific/Auckland', 'Africa/Cairo', 'Africa/Lagos'
        ];
    }

    // Always ensure UTC is included
    if (!allZones.includes('UTC')) {
        allZones.unshift('UTC');
    }

    const result = [];
    for (const zoneName of allZones) {
        try {
            const { displayName, longName } = buildTimezoneInfo(zoneName);
            const utcOffset = getTimezoneOffsetMinutes(zoneName);
            const parts = zoneName.split('/');
            const city = parts[parts.length - 1].replace(/_/g, ' ');
            const region = getRegionGroup(zoneName);

            result.push({
                name: zoneName,
                city: city,
                region: region,
                displayName: displayName,
                longName: longName,
                searchText: `${zoneName} ${city} ${region} ${displayName} ${longName}`.toLowerCase(),
                utcOffset: utcOffset
            });
        } catch {
            // Skip zones that fail to resolve
        }
    }

    return result;
}

/**
 * Initialize timezone data from all IANA zones with dynamic Intl-computed display names
 */
function initializeTimezones() {
    timezones = generateAllTimezones();

    // Sort within each region by UTC offset, then city name
    timezones.sort((a, b) => {
        const aRegionIdx = REGION_ORDER.indexOf(a.region);
        const bRegionIdx = REGION_ORDER.indexOf(b.region);
        if (aRegionIdx !== bRegionIdx) return aRegionIdx - bRegionIdx;
        if (a.utcOffset !== b.utcOffset) return a.utcOffset - b.utcOffset;
        return a.city.localeCompare(b.city);
    });

    populateTimezoneOptions();
}

// ============================================================
// Dropdown population, filtering, selection (kept as-is)
// ============================================================

// ============================================================
// Recent timezones — stored in chrome.storage.local
// ============================================================

let recentTimezones = [];

/**
 * Load recent timezones from storage
 */
async function loadRecentTimezones() {
    try {
        const result = await chrome.storage.local.get('recentTimezones');
        recentTimezones = result.recentTimezones || [];
    } catch {
        recentTimezones = [];
    }
}

/**
 * Add a timezone to the recents list (max 5, deduped)
 */
async function addToRecentTimezones(timezoneName) {
    if (!timezoneName || timezoneName === 'UTC') return;
    recentTimezones = recentTimezones.filter(tz => tz !== timezoneName);
    recentTimezones.unshift(timezoneName);
    if (recentTimezones.length > 5) recentTimezones = recentTimezones.slice(0, 5);
    try {
        await chrome.storage.local.set({ recentTimezones });
    } catch {
        // Silent fail
    }
}

// ============================================================
// Dropdown population with continent grouping and recents
// ============================================================

/**
 * Create a timezone option element
 */
function createTimezoneOption(timezone, type) {
    const option = document.createElement('div');
    option.className = 'dropdown-option';
    option.innerHTML = `${escapeHtml(timezone.displayName)}${timezone.longName ? `<span class="tz-long-name">${escapeHtml(timezone.longName)}</span>` : ''}`;
    option.dataset.timezone = timezone.name;
    option.dataset.searchtext = timezone.searchText;
    option.addEventListener('click', function() {
        selectTimezone(type, timezone.name, timezone.displayName);
    });
    return option;
}

/**
 * Create a group header element
 */
function createGroupHeader(label) {
    const header = document.createElement('div');
    header.className = 'dropdown-group-header';
    header.textContent = label;
    return header;
}

/**
 * Populate timezone dropdown options with continent groups and recents
 */
function populateTimezoneOptions() {
    elements.fromTimezoneOptions.innerHTML = '';
    elements.toTimezoneOptions.innerHTML = '';

    // Add auto-detect option for "to" timezone
    const autoDetectOption = document.createElement('div');
    autoDetectOption.className = 'dropdown-option special';
    autoDetectOption.textContent = 'Auto-detect';
    autoDetectOption.addEventListener('click', function() {
        selectTimezone('to', null, 'Auto-detect');
    });
    elements.toTimezoneOptions.appendChild(autoDetectOption);

    // Add recent timezones section if any exist
    if (recentTimezones.length > 0) {
        const recentZones = recentTimezones
            .map(name => timezones.find(tz => tz.name === name))
            .filter(Boolean);

        if (recentZones.length > 0) {
            const fromRecentHeader = createGroupHeader('\u2605 Recent');
            const toRecentHeader = createGroupHeader('\u2605 Recent');
            elements.fromTimezoneOptions.appendChild(fromRecentHeader);
            elements.toTimezoneOptions.appendChild(toRecentHeader);

            recentZones.forEach(tz => {
                elements.fromTimezoneOptions.appendChild(createTimezoneOption(tz, 'from'));
                elements.toTimezoneOptions.appendChild(createTimezoneOption(tz, 'to'));
            });
        }
    }

    // Group timezones by region and add with headers
    let currentRegion = null;
    timezones.forEach(timezone => {
        if (timezone.region !== currentRegion) {
            currentRegion = timezone.region;
            const fromHeader = createGroupHeader(currentRegion);
            const toHeader = createGroupHeader(currentRegion);
            elements.fromTimezoneOptions.appendChild(fromHeader);
            elements.toTimezoneOptions.appendChild(toHeader);
        }

        elements.fromTimezoneOptions.appendChild(createTimezoneOption(timezone, 'from'));
        elements.toTimezoneOptions.appendChild(createTimezoneOption(timezone, 'to'));
    });
}

/**
 * Filter timezones based on search query, including country name matching
 */
function filterTimezones(type, query) {
    const optionsContainer = type === 'from' ? elements.fromTimezoneOptions : elements.toTimezoneOptions;
    const allChildren = optionsContainer.children;

    query = query.toLowerCase().trim();

    // Build a set of timezone names that match via country search
    const countryMatchZones = new Set();
    if (query) {
        for (const [country, zones] of Object.entries(COUNTRY_SEARCH_MAP)) {
            if (country.includes(query)) {
                zones.forEach(z => countryMatchZones.add(z.toLowerCase()));
            }
        }
    }

    let anyVisibleInGroup = false;
    let lastHeader = null;

    for (let i = 0; i < allChildren.length; i++) {
        const child = allChildren[i];

        if (child.classList.contains('dropdown-group-header')) {
            // If we had a previous header with no visible options, hide it
            if (lastHeader && !anyVisibleInGroup) {
                lastHeader.style.display = 'none';
            }
            lastHeader = child;
            anyVisibleInGroup = false;
            // Tentatively show the header; we'll hide it if no children match
            child.style.display = query === '' ? '' : 'none';
            continue;
        }

        if (child.classList.contains('special')) {
            child.style.display = '';
            continue;
        }

        if (query === '') {
            child.style.display = '';
            anyVisibleInGroup = true;
            if (lastHeader) lastHeader.style.display = '';
            continue;
        }

        const searchText = child.dataset.searchtext || child.textContent.toLowerCase();
        const tzName = (child.dataset.timezone || '').toLowerCase();
        const isMatch = searchText.includes(query) || tzName.includes(query) || countryMatchZones.has(tzName);

        child.style.display = isMatch ? '' : 'none';
        if (isMatch) {
            anyVisibleInGroup = true;
            if (lastHeader) lastHeader.style.display = '';
        }
    }

    // Handle the last group header
    if (lastHeader && !anyVisibleInGroup && query !== '') {
        lastHeader.style.display = 'none';
    }
}

/**
 * Toggle dropdown open/close
 */
function toggleDropdown(type) {
    const dropdown = type === 'from' ? elements.fromTimezoneDropdown : elements.toTimezoneDropdown;
    const menu = type === 'from' ? elements.fromTimezoneMenu : elements.toTimezoneMenu;
    const search = type === 'from' ? elements.fromTimezoneSearch : elements.toTimezoneSearch;

    const isOpen = dropdown.classList.contains('open');

    // Close all dropdowns first
    closeAllDropdowns();

    if (!isOpen) {
        dropdown.classList.add('open');
        menu.classList.add('open');
        search.focus();
        search.value = '';
        filterTimezones(type, '');
    }
}

/**
 * Close all dropdowns
 */
function closeAllDropdowns() {
    elements.fromTimezoneDropdown.classList.remove('open');
    elements.fromTimezoneMenu.classList.remove('open');
    elements.toTimezoneDropdown.classList.remove('open');
    elements.toTimezoneMenu.classList.remove('open');
}

/**
 * Save timezone preferences to storage
 */
async function saveTimezonePreferences() {
    try {
        await chrome.storage.local.set({
            'preferredFromTimezone': selectedFromTimezone,
            'preferredToTimezone': selectedToTimezone,
            'timezonePrefsTimestamp': Date.now()
        });
    } catch (error) {
        // Silent fail for preferences save
    }
}

/**
 * Load timezone preferences from storage
 */
async function loadTimezonePreferences() {
    try {
        const result = await chrome.storage.local.get([
            'preferredFromTimezone',
            'preferredToTimezone',
            'timezonePrefsTimestamp'
        ]);

        // Only load preferences if they were saved recently (within 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        if (result.timezonePrefsTimestamp && result.timezonePrefsTimestamp > thirtyDaysAgo) {
            // Restore "From" timezone if available and valid
            if (result.preferredFromTimezone) {
                const fromTimezoneObj = timezones.find(tz => tz.name === result.preferredFromTimezone);
                if (fromTimezoneObj) {
                    selectedFromTimezone = result.preferredFromTimezone;
                    elements.fromTimezoneDropdown.querySelector('.selected-text').textContent = fromTimezoneObj.displayName;
                }
            }

            // Restore "To" timezone if available and valid
            if (result.preferredToTimezone) {
                const toTimezoneObj = timezones.find(tz => tz.name === result.preferredToTimezone);
                if (toTimezoneObj) {
                    selectedToTimezone = result.preferredToTimezone;
                    elements.toTimezoneDropdown.querySelector('.selected-text').textContent = toTimezoneObj.displayName;
                } else if (result.preferredToTimezone === null) {
                    // Handle auto-detect case
                    selectedToTimezone = null;
                    elements.toTimezoneDropdown.querySelector('.selected-text').textContent = 'Auto-detect';
                }
            }
        }
    } catch (error) {
        // Silent fail for preferences load
    }
}

/**
 * Select a timezone
 */
function selectTimezone(type, timezoneName, displayName) {
    if (type === 'from') {
        selectedFromTimezone = timezoneName;
        elements.fromTimezoneDropdown.querySelector('.selected-text').textContent = displayName;
    } else {
        selectedToTimezone = timezoneName;
        elements.toTimezoneDropdown.querySelector('.selected-text').textContent = displayName;
    }

    closeAllDropdowns();

    // Save timezone preferences whenever a selection is made
    saveTimezonePreferences();

    // Add to recents and re-render dropdowns to show updated recents
    if (timezoneName) {
        addToRecentTimezones(timezoneName).then(() => {
            populateTimezoneOptions();
        });
    }
}

// ============================================================
// Intl-based formatting helpers
// ============================================================

/**
 * Format a time in the given IANA timezone using Intl
 */
function formatInTimezone(utcDate, ianaZone, opts = {}) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        hour: 'numeric',
        minute: '2-digit',
        second: opts.showSeconds ? '2-digit' : undefined,
        hour12: true,
        ...opts
    }).format(utcDate);
}

/**
 * Format a date (weekday, month, day, year) in the given IANA timezone using Intl
 */
function formatDateInTimezone(utcDate, ianaZone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(utcDate);
}

/**
 * Format wall-clock components as a time string.
 * Shows what the user originally typed, not the zone's current DST interpretation.
 */
function formatWallClock(wc, opts = {}) {
    if (!wc) return '';
    let h = wc.hour;
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    const min = String(wc.minute).padStart(2, '0');
    if (opts.showSeconds) {
        const sec = String(wc.second || 0).padStart(2, '0');
        return `${h}:${min}:${sec} ${ampm}`;
    }
    return `${h}:${min} ${ampm}`;
}

/**
 * Format a short date (e.g. "Sat, Mar 15") for cross-midnight range display
 */
function formatShortDateInTimezone(utcDate, ianaZone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    }).format(utcDate);
}

/**
 * Escape HTML to prevent XSS in user input displayed in result
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// Conversion logic — uses TimeShiftParser + Intl formatting
// ============================================================

/**
 * Build a mailto: URL pre-filled with bug report details
 */
function buildReportMailto(inputText, parseResult, convertedOutput) {
    const to = 'saxena.akhil42@gmail.com';
    const subject = encodeURIComponent('TimeShift Bug Report \u2014 Incorrect Conversion');

    const body = encodeURIComponent(
`TimeShift Bug Report
=====================

Input Text: "${inputText}"

Parse Result:
- Source Timezone: ${parseResult.sourceTimezone}
- Confidence: ${parseResult.confidence}
- Confidence Detail: ${parseResult.confidenceDetail || 'N/A'}
- Detected Locale: ${parseResult.detectedLocale || 'en'}
- City Match: ${parseResult.cityMatch || 'None'}
- Explicit Offset: ${parseResult.explicitOffset ?? 'None'}
- Is Range: ${parseResult.isRange}
- Has Explicit Date: ${parseResult.hasExplicitDate}
- Wall Clock: ${JSON.stringify(parseResult.wallClock)}
- UTC Date: ${parseResult.utcDate?.toISOString() || 'N/A'}

Converted Output: "${convertedOutput}"

Expected Output:
[Please describe what the correct conversion should be]

Additional Context:
[Any other details about where you found this time text]

---
TimeShift v2.2.0 | ${new Date().toISOString()}
User Timezone: ${userTimezone}
User Agent: ${navigator.userAgent}
`
    );

    return `mailto:${to}?subject=${subject}&body=${body}`;
}

/**
 * Handle time conversion
 */
function handleConversion() {
    const inputText = elements.dateTimeInput.value.trim();

    if (!inputText) {
        elements.confidenceBar.style.display = 'none';
        elements.reportIssueLink.style.display = 'none';
        showResult('Please enter a date/time to convert.', 'error');
        return;
    }

    // Parse using TimeShiftParser
    const parseResult = TimeShiftParser.parse(inputText, {
        userTimezone: selectedFromTimezone || userTimezone
    });

    if (!parseResult) {
        elements.confidenceBar.style.display = 'none';
        elements.reportIssueLink.style.display = 'none';
        showResult(`
            <div style="color: #f59e0b; font-weight: 600; margin-bottom: 8px;">! No Time Information Detected</div>
            <div style="font-size: 13px; line-height: 1.4;">
                Input: "<strong>${escapeHtml(inputText)}</strong>"<br><br>
                Please include time information for conversion.<br><br>
                <strong>Supported formats:</strong><br>
                • 12:00 PM<br>
                • 12:00 PM - 1:00 PM<br>
                • Sep 2, 2025 12:00 PM<br>
                • 2025-09-02 12:00<br>
                • Tuesday, Sep 2, 2025 12:00 PM PST
            </div>
        `, 'info');
        return;
    }

    try {
        let { utcDate, sourceTimezone, confidence, isRange, rangeEndUtcDate } = parseResult;

        // If confidence is low but user manually selected a From timezone, upgrade
        if (confidence === 'low' && selectedFromTimezone) {
            confidence = 'medium';
        }

        // Show or hide confidence indicator
        if (confidence === 'high') {
            elements.confidenceBar.style.display = 'none';
        } else {
            const detail = parseResult.confidenceDetail || (confidence === 'medium'
                ? 'Timezone inferred — verify the source timezone'
                : 'Low confidence — please select the source timezone');
            elements.confidenceText.textContent = detail;
            elements.confidenceBar.style.display = 'flex';
        }

        // If confidence is high, auto-update From dropdown with detected timezone
        if (confidence === 'high' && sourceTimezone !== selectedFromTimezone) {
            const detectedObj = timezones.find(tz => tz.name === sourceTimezone);
            if (detectedObj) {
                selectedFromTimezone = sourceTimezone;
                // If explicit offset was given, show it in dropdown instead of current DST label
                if (parseResult.explicitOffset !== null && parseResult.explicitOffset !== undefined) {
                    const sign = parseResult.explicitOffset >= 0 ? '+' : '-';
                    const absMin = Math.abs(parseResult.explicitOffset);
                    const h = String(Math.floor(absMin / 60)).padStart(2, '0');
                    const m = String(absMin % 60).padStart(2, '0');
                    const city = sourceTimezone.split('/').pop().replace(/_/g, ' ');
                    elements.fromTimezoneDropdown.querySelector('.selected-text').textContent = `${city} (UTC${sign}${h}:${m})`;
                } else {
                    elements.fromTimezoneDropdown.querySelector('.selected-text').textContent = detectedObj.displayName;
                }
            }
        }

        // Determine target timezone
        // When confidence is high (timezone detected from text), always default To
        // to the user's local timezone — this gives the most useful result
        // (e.g., "EST → your local time") regardless of previously saved prefs
        let targetTimezone = selectedToTimezone;
        if (!targetTimezone || (confidence === 'high' && targetTimezone !== userTimezone)) {
            targetTimezone = userTimezone;
            const userTzObj = timezones.find(tz => tz.name === userTimezone);
            if (userTzObj) {
                selectedToTimezone = userTimezone;
                elements.toTimezoneDropdown.querySelector('.selected-text').textContent = userTzObj.displayName;
            }
        }

        // Look up display objects
        const sourceTimezoneObj = timezones.find(tz => tz.name === sourceTimezone);
        const targetTimezoneObj = timezones.find(tz => tz.name === targetTimezone);
        const targetDisplay = targetTimezoneObj ? targetTimezoneObj.displayName : targetTimezone;

        // When user explicitly stated an offset like (GMT-5:00), show that offset
        // instead of the zone's current DST label (which might show UTC-4/EDT)
        let sourceDisplay;
        if (parseResult.explicitOffset !== null && parseResult.explicitOffset !== undefined) {
            const sign = parseResult.explicitOffset >= 0 ? '+' : '-';
            const absMin = Math.abs(parseResult.explicitOffset);
            const h = String(Math.floor(absMin / 60)).padStart(2, '0');
            const m = String(absMin % 60).padStart(2, '0');
            sourceDisplay = `UTC${sign}${h}:${m}`;
            // Also add context clues if we resolved a zone
            if (sourceTimezoneObj) {
                const city = sourceTimezone.split('/').pop().replace(/_/g, ' ');
                sourceDisplay = `${city} (${sourceDisplay})`;
            }
        } else {
            sourceDisplay = sourceTimezoneObj ? sourceTimezoneObj.displayName : sourceTimezone;
        }
        const sourceLongName = sourceTimezoneObj ? sourceTimezoneObj.longName : '';

        if (isRange && rangeEndUtcDate) {
            // ---- Time range conversion ----
            const convertedStartTime = formatInTimezone(utcDate, targetTimezone, { showSeconds: false });
            const convertedEndTime = formatInTimezone(rangeEndUtcDate, targetTimezone, { showSeconds: false });
            const originalStartTime = parseResult.wallClock ? formatWallClock(parseResult.wallClock) : formatInTimezone(utcDate, sourceTimezone, { showSeconds: false });
            const originalEndTime = parseResult.rangeEndWallClock ? formatWallClock(parseResult.rangeEndWallClock) : formatInTimezone(rangeEndUtcDate, sourceTimezone, { showSeconds: false });

            // Date display: only if user provided a date, and handle cross-midnight
            let dateHtml = '';
            if (parseResult.hasExplicitDate) {
                const startDate = formatDateInTimezone(utcDate, targetTimezone);
                const endDate = formatDateInTimezone(rangeEndUtcDate, targetTimezone);
                if (startDate === endDate) {
                    dateHtml = `<div style="color: #374151; font-size: 13px; margin-bottom: 8px;">${startDate}</div>`;
                } else {
                    // Cross-midnight: show date for each time
                    dateHtml = `<div style="color: #374151; font-size: 13px; margin-bottom: 8px;">${formatShortDateInTimezone(utcDate, targetTimezone)} - ${formatShortDateInTimezone(rangeEndUtcDate, targetTimezone)}</div>`;
                }
            } else {
                // No explicit date: check if range crosses midnight and show dates if so
                const startDay = new Intl.DateTimeFormat('en-US', { timeZone: targetTimezone, day: 'numeric' }).format(utcDate);
                const endDay = new Intl.DateTimeFormat('en-US', { timeZone: targetTimezone, day: 'numeric' }).format(rangeEndUtcDate);
                if (startDay !== endDay) {
                    dateHtml = `<div style="color: #374151; font-size: 13px; margin-bottom: 8px;">${formatShortDateInTimezone(utcDate, targetTimezone)} - ${formatShortDateInTimezone(rangeEndUtcDate, targetTimezone)}</div>`;
                }
            }

            const resultHtml = `
                <div style="color: #ffffff; font-weight: 600; margin-bottom: 12px; font-size: 14px;">&#10003; Time Range Converted</div>

                <div style="background: rgba(255,255,255,0.95); padding: 15px; border-radius: 10px; margin-bottom: 12px; text-align: center; color: #1f2937;">
                    <div style="color: #111827; font-weight: 700; font-size: 18px; margin-bottom: 6px;">
                        ${convertedStartTime} - ${convertedEndTime}
                    </div>
                    ${dateHtml}
                    <div style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 20px; display: inline-block;">
                        <div style="color: #6b7280; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${escapeHtml(targetDisplay)}
                        </div>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.15); padding: 10px; border-radius: 8px; font-size: 12px;">
                    <div style="color: #f1f5f9; font-weight: 600; margin-bottom: 2px;">Original Range:</div>
                    <div style="color: #ffffff;">${originalStartTime} - ${originalEndTime}</div>
                    <div style="color: #e2e8f0; font-size: 11px; margin-top: 2px;">${escapeHtml(sourceDisplay)}</div>${sourceLongName ? `<div style="color: #cbd5e1; font-size: 10px; margin-top: 1px;">${escapeHtml(sourceLongName)}</div>` : ''}
                </div>
            `;

            // Build plain text for copy: "2:00 PM - 3:30 PM EST → 12:30 AM - 2:00 AM IST"
            const sourceAbbr = sourceTimezoneObj
                ? (sourceTimezone.split('/').pop().replace(/_/g, ' '))
                : sourceTimezone;
            const targetAbbr = targetTimezoneObj
                ? (targetTimezone.split('/').pop().replace(/_/g, ' '))
                : targetTimezone;
            lastConversionText = `${originalStartTime} - ${originalEndTime} ${sourceAbbr} \u2192 ${convertedStartTime} - ${convertedEndTime} ${targetAbbr}`;

            showResult(resultHtml, 'success');
        } else {
            // ---- Single time conversion ----
            const convertedTime = formatInTimezone(utcDate, targetTimezone, { showSeconds: true });
            const originalTime = parseResult.wallClock ? formatWallClock(parseResult.wallClock, { showSeconds: true }) : formatInTimezone(utcDate, sourceTimezone, { showSeconds: true });

            // Only show date if user explicitly provided one
            const singleDateHtml = parseResult.hasExplicitDate
                ? `<div style="color: #374151; font-size: 13px; margin-bottom: 8px;">${formatDateInTimezone(utcDate, targetTimezone)}</div>`
                : '';

            const resultHtml = `
                <div style="color: #ffffff; font-weight: 600; margin-bottom: 12px; font-size: 14px;">&#10003; Time Converted</div>

                <div style="background: rgba(255,255,255,0.95); padding: 15px; border-radius: 10px; margin-bottom: 12px; text-align: center; color: #1f2937;">
                    <div style="color: #111827; font-weight: 700; font-size: 22px; margin-bottom: 6px;">
                        ${convertedTime}
                    </div>
                    ${singleDateHtml}
                    <div style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 20px; display: inline-block;">
                        <div style="color: #6b7280; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${escapeHtml(targetDisplay)}
                        </div>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.15); padding: 10px; border-radius: 8px; font-size: 12px;">
                    <div style="color: #f1f5f9; font-weight: 600; margin-bottom: 2px;">Original Time:</div>
                    <div style="color: #ffffff;">${originalTime}</div>
                    <div style="color: #e2e8f0; font-size: 11px; margin-top: 2px;">${escapeHtml(sourceDisplay)}</div>${sourceLongName ? `<div style="color: #cbd5e1; font-size: 10px; margin-top: 1px;">${escapeHtml(sourceLongName)}</div>` : ''}
                </div>
            `;

            // Build plain text for copy: "3:45:00 PM → 1:15:00 AM IST"
            const singleSourceAbbr = sourceTimezoneObj
                ? (sourceTimezone.split('/').pop().replace(/_/g, ' '))
                : sourceTimezone;
            const singleTargetAbbr = targetTimezoneObj
                ? (targetTimezone.split('/').pop().replace(/_/g, ' '))
                : targetTimezone;
            lastConversionText = `${originalTime} ${singleSourceAbbr} \u2192 ${convertedTime} ${singleTargetAbbr}`;

            showResult(resultHtml, 'success');
        }

        // Wire up "Report Issue" mailto link after successful conversion
        elements.reportIssueLink.href = buildReportMailto(inputText, parseResult, lastConversionText);
        elements.reportIssueLink.style.display = 'inline';

    } catch (error) {
        elements.confidenceBar.style.display = 'none';
        elements.reportIssueLink.style.display = 'none';
        showResult(`
            <div style="color: #f87171; font-weight: 600; margin-bottom: 8px;">Error</div>
            <div style="font-size: 12px; opacity: 0.8;">${escapeHtml(error.message)}</div>
        `, 'error');
    }
}

// ============================================================
// Result display + context menu check
// ============================================================

/**
 * Show conversion result
 */
function showResult(html, type) {
    // Rebuild the copy button HTML since innerHTML replaces everything
    const copyBtnHtml = `<button class="copy-btn${type === 'success' ? ' visible' : ''}" id="copyBtn" title="Copy result">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="5" width="9" height="9" rx="1.5"/>
            <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/>
        </svg>
        <span id="copyBtnText">Copy</span>
    </button>`;

    elements.result.innerHTML = copyBtnHtml + html;
    elements.result.className = `result show`;

    // Add error class for error styling
    if (type === 'error') {
        elements.result.className = `result show error`;
    }

    // Re-bind copy button references and event
    elements.copyBtn = document.getElementById('copyBtn');
    elements.copyBtnText = document.getElementById('copyBtnText');
    elements.copyBtn.addEventListener('click', function() {
        if (!lastConversionText) return;
        navigator.clipboard.writeText(lastConversionText).then(() => {
            elements.copyBtnText.textContent = 'Copied!';
            setTimeout(() => {
                elements.copyBtnText.textContent = 'Copy';
            }, 1500);
        });
    });

    // Clear copy text for non-success states
    if (type !== 'success') {
        lastConversionText = '';
    }
}

/**
 * Check for text from context menu
 */
async function checkForContextMenuText() {
    try {
        const result = await chrome.storage.local.get(['selectedText', 'fromContextMenu', 'timestamp']);
        if (result.fromContextMenu && result.selectedText) {
            // Check if the data is recent (within 60 seconds)
            const isRecent = result.timestamp && (Date.now() - result.timestamp < 60000);

            if (isRecent) {
                // Fill the input with selected text
                elements.dateTimeInput.value = result.selectedText;

                // Clear the storage
                await chrome.storage.local.remove(['selectedText', 'fromContextMenu', 'timestamp']);

                // Auto-convert if text looks like a date/time (use TimeShiftParser)
                if (TimeShiftParser.parse(result.selectedText, { userTimezone: userTimezone }) !== null) {
                    handleConversion();
                } else {
                    // Show a helpful message if it doesn't look like date/time
                    showResult(`
                        <div style="color: #f59e0b; font-weight: 600; margin-bottom: 8px;">! No Time Information Detected</div>
                        <div style="font-size: 13px; line-height: 1.4;">
                            Selected text: "<strong>${escapeHtml(result.selectedText)}</strong>"<br><br>
                            Please include time information for conversion.<br><br>
                            <strong>Supported formats:</strong><br>
                            • 12:00 PM<br>
                            • 12:00 PM - 1:00 PM<br>
                            • Sep 2, 2025 12:00 PM<br>
                            • 2025-09-02 12:00<br>
                            • Tuesday, Sep 2, 2025 12:00 PM PST
                        </div>
                    `, 'info');
                }

                // Clear any badge notifications
                if (chrome.action && chrome.action.setBadgeText) {
                    chrome.action.setBadgeText({ text: '' });
                }
            } else {
                // Clear old data
                await chrome.storage.local.remove(['selectedText', 'fromContextMenu', 'timestamp']);
            }
        }
    } catch (error) {
        // Silent fail for context menu check
    }
}
