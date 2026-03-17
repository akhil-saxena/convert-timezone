/**
 * Popup Script for TimeShift Chrome Extension
 * v2 UI — glassmorphism with pills, search panel, auto-convert
 *
 * Keeps all parsing integration (TimeShiftParser), Intl utilities, and data maps unchanged.
 * Rewrites: UI rendering, timezone selection (search panel), auto-convert, result display.
 */

// ============================================================
// Global state
// ============================================================

let timezones = [];
let selectedFromTimezone = null;
let selectedToTimezone = null;
let userTimezone = null;
let lastConversionText = '';
let recentTimezones = [];

// Which pill opened the search panel: 'from' | 'to' | null
let searchPanelTarget = null;

// Debounce timer for auto-convert
let autoConvertTimer = null;

// ============================================================
// DOM element cache
// ============================================================

const el = {};

function initializeElements() {
    el.dateTimeInput = document.getElementById('dateTimeInput');
    el.nowBtn = document.getElementById('nowBtn');
    el.fromPill = document.getElementById('fromPill');
    el.fromLine1 = document.getElementById('fromLine1');
    el.fromLine2 = document.getElementById('fromLine2');
    el.toPill = document.getElementById('toPill');
    el.toLine1 = document.getElementById('toLine1');
    el.toLine2 = document.getElementById('toLine2');
    el.resultArea = document.getElementById('resultArea');
    el.resultContent = document.getElementById('resultContent');
    el.copyBtn = document.getElementById('copyBtn');
    el.copyBtnText = document.getElementById('copyBtnText');
    el.confidenceText = document.getElementById('confidenceText');
    el.searchPanel = document.getElementById('searchPanel');
    el.searchPanelTitle = document.getElementById('searchPanelTitle');
    el.searchPanelClose = document.getElementById('searchPanelClose');
    el.searchPanelInput = document.getElementById('searchPanelInput');
    el.searchPanelResults = document.getElementById('searchPanelResults');
    el.swapArrow = document.getElementById('swapArrow');
}

// ============================================================
// Country search map
// ============================================================

const COUNTRY_SEARCH_MAP = {
    'usa': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
    'united states': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
    'us': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
    'india': ['Asia/Kolkata', 'Asia/Calcutta'],
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
// Intl-based timezone utilities (kept from v1)
// ============================================================

/**
 * Build timezone info for display.
 * Returns { displayName, longName } where:
 *   displayName = "Chicago (UTC-05:00)"
 *   longName = "Central Standard Time"
 */
function buildTimezoneInfo(ianaZone) {
    if (ianaZone === 'UTC') return {
        displayName: 'UTC (Coordinated Universal Time)',
        longName: 'Coordinated Universal Time'
    };
    try {
        const now = new Date();
        const offsetFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone, timeZoneName: 'longOffset'
        });
        const offsetStr = offsetFormatter.formatToParts(now)
            .find(p => p.type === 'timeZoneName')?.value || '';
        const utcOffset = offsetStr.replace('GMT', 'UTC');

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
 * Get the short abbreviation (e.g. EST, IST, CET) for an IANA timezone
 */
function getTimezoneAbbreviation(ianaZone) {
    if (ianaZone === 'UTC') return 'UTC';
    try {
        const now = new Date();
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone,
            timeZoneName: 'short'
        });
        const parts = fmt.formatToParts(now);
        return parts.find(p => p.type === 'timeZoneName')?.value || '';
    } catch {
        return '';
    }
}

/**
 * Format UTC offset minutes as a string like "UTC-05:00" or "UTC+05:30"
 */
function formatOffsetString(minutes) {
    if (minutes === 0) return 'UTC+00:00';
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const h = String(Math.floor(abs / 60)).padStart(2, '0');
    const m = String(abs % 60).padStart(2, '0');
    return `UTC${sign}${h}:${m}`;
}

// ============================================================
// Legacy timezone map
// ============================================================

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
        userTimezone = LEGACY_TIMEZONE_MAP[detected] || detected;
    } catch {
        userTimezone = 'UTC';
    }
}

// ============================================================
// City aliases
// ============================================================

const CITY_ALIASES = {
    'Asia/Kolkata': 'mumbai bombay delhi bangalore chennai hyderabad india calcutta',
    'Asia/Calcutta': 'mumbai bombay delhi bangalore chennai hyderabad india kolkata ist',
    'Europe/Kiev': 'ukraine kyiv',
    'Asia/Saigon': 'vietnam ho chi minh hcmc',
    'Asia/Rangoon': 'myanmar yangon burma',
    'Pacific/Truk': 'chuuk micronesia',
    'Pacific/Ponape': 'pohnpei micronesia',
    'Asia/Shanghai': 'beijing china shenzhen guangzhou',
    'America/New_York': 'nyc manhattan usa east coast',
    'America/Los_Angeles': 'la san francisco usa west coast hollywood',
    'America/Chicago': 'houston dallas usa midwest',
    'Europe/London': 'uk england britain',
    'Europe/Istanbul': 'turkey constantinople',
    'America/Sao_Paulo': 'brazil rio',
    'America/Argentina/Buenos_Aires': 'argentina',
    'Asia/Tokyo': 'japan osaka',
    'Asia/Seoul': 'korea busan',
    'Asia/Dubai': 'uae abu dhabi',
    'Asia/Riyadh': 'saudi arabia jeddah mecca',
    'Asia/Jerusalem': 'israel tel aviv',
    'Asia/Karachi': 'pakistan lahore islamabad',
    'Asia/Dhaka': 'bangladesh',
    'Asia/Kathmandu': 'nepal',
    'Europe/Moscow': 'russia',
    'Europe/Paris': 'france',
    'Europe/Berlin': 'germany',
    'Europe/Rome': 'italy milan',
    'Europe/Madrid': 'spain barcelona',
    'Europe/Amsterdam': 'netherlands holland',
    'Africa/Cairo': 'egypt',
    'Africa/Johannesburg': 'south africa cape town',
    'Africa/Lagos': 'nigeria',
    'Africa/Nairobi': 'kenya',
    'Africa/Casablanca': 'morocco',
    'Australia/Sydney': 'australia',
    'Pacific/Auckland': 'new zealand wellington',
    'America/Toronto': 'canada ontario',
    'America/Vancouver': 'canada bc',
    'Asia/Singapore': 'singapore',
    'Asia/Hong_Kong': 'hong kong hk',
    'Asia/Taipei': 'taiwan',
    'Asia/Bangkok': 'thailand',
    'Asia/Jakarta': 'indonesia',
    'Asia/Manila': 'philippines',
    'Asia/Tehran': 'iran persia',
    'Europe/Athens': 'greece',
    'Europe/Helsinki': 'finland',
    'Europe/Stockholm': 'sweden',
    'Europe/Oslo': 'norway',
    'Europe/Copenhagen': 'denmark',
    'Europe/Warsaw': 'poland',
    'Europe/Zurich': 'switzerland',
    'Europe/Vienna': 'austria',
    'Europe/Dublin': 'ireland',
    'Europe/Lisbon': 'portugal',
};

function getCityAliases(zoneName) {
    return CITY_ALIASES[zoneName] || '';
}

// Modern display names for legacy IANA identifiers
const CITY_DISPLAY_OVERRIDE = {
    'Asia/Calcutta': 'Kolkata',
    'Europe/Kiev': 'Kyiv',
    'Asia/Saigon': 'Ho Chi Minh',
    'Asia/Rangoon': 'Yangon',
    'Pacific/Truk': 'Chuuk',
    'Pacific/Ponape': 'Pohnpei',
};

// ============================================================
// Region grouping
// ============================================================

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

const REGION_ORDER = [
    'UTC', 'Americas', 'Europe', 'Asia', 'Africa',
    'Australia/Oceania', 'Pacific', 'Indian Ocean', 'Atlantic', 'Arctic', 'Antarctica', 'Other'
];

// ============================================================
// Timezone data generation
// ============================================================

function generateAllTimezones() {
    let allZones;
    try {
        allZones = Intl.supportedValuesOf('timeZone');
    } catch {
        allZones = [
            'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
            'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
            'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
            'Australia/Sydney', 'Pacific/Auckland', 'Africa/Cairo', 'Africa/Lagos'
        ];
    }

    if (!allZones.includes('UTC')) {
        allZones.unshift('UTC');
    }

    const result = [];
    for (const zoneName of allZones) {
        try {
            const { displayName, longName } = buildTimezoneInfo(zoneName);
            const utcOffset = getTimezoneOffsetMinutes(zoneName);
            const abbreviation = getTimezoneAbbreviation(zoneName);
            const parts = zoneName.split('/');
            const city = CITY_DISPLAY_OVERRIDE[zoneName] || parts[parts.length - 1].replace(/_/g, ' ');
            const region = getRegionGroup(zoneName);
            const offsetStr = formatOffsetString(utcOffset);

            result.push({
                name: zoneName,
                city: city,
                region: region,
                displayName: displayName,
                longName: longName,
                abbreviation: abbreviation,
                offsetString: offsetStr,
                searchText: `${zoneName} ${city} ${region} ${displayName} ${longName} ${abbreviation} ${offsetStr} ${getCityAliases(zoneName)}`.toLowerCase(),
                utcOffset: utcOffset
            });
        } catch {
            // Skip zones that fail to resolve
        }
    }

    return result;
}

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
}

// ============================================================
// Recent timezones (chrome.storage.local)
// ============================================================

async function loadRecentTimezones() {
    try {
        const result = await chrome.storage.local.get('recentTimezones');
        recentTimezones = result.recentTimezones || [];
    } catch {
        recentTimezones = [];
    }
}

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
// Timezone preferences (chrome.storage.local)
// ============================================================

async function saveTimezonePreferences() {
    try {
        await chrome.storage.local.set({
            'preferredFromTimezone': selectedFromTimezone,
            'preferredToTimezone': selectedToTimezone,
            'timezonePrefsTimestamp': Date.now()
        });
    } catch {
        // Silent fail
    }
}

async function loadTimezonePreferences() {
    try {
        const result = await chrome.storage.local.get([
            'preferredFromTimezone',
            'preferredToTimezone',
            'timezonePrefsTimestamp'
        ]);

        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        if (result.timezonePrefsTimestamp && result.timezonePrefsTimestamp > thirtyDaysAgo) {
            if (result.preferredFromTimezone) {
                const fromTz = timezones.find(tz => tz.name === result.preferredFromTimezone);
                if (fromTz) {
                    selectedFromTimezone = result.preferredFromTimezone;
                    updatePillDisplay('from', fromTz);
                }
            }

            if (result.preferredToTimezone) {
                const toTz = timezones.find(tz => tz.name === result.preferredToTimezone);
                if (toTz) {
                    selectedToTimezone = result.preferredToTimezone;
                    updatePillDisplay('to', toTz);
                } else if (result.preferredToTimezone === null) {
                    selectedToTimezone = null;
                    updatePillDisplay('to', null);
                }
            }
        }
    } catch {
        // Silent fail
    }
}

// ============================================================
// Pill display
// ============================================================

/**
 * Update a timezone pill's display text.
 * @param {'from'|'to'} type
 * @param {object|null} tzObj — timezone object from the timezones array, or null for auto-detect
 * @param {string} [overrideLine1] — optional override for line 1 (e.g. explicit offset display)
 * @param {string} [overrideLine2]
 */
function updatePillDisplay(type, tzObj, overrideLine1, overrideLine2) {
    const line1El = type === 'from' ? el.fromLine1 : el.toLine1;
    const line2El = type === 'from' ? el.fromLine2 : el.toLine2;

    if (!tzObj) {
        // Show user's local timezone info instead of generic "Auto-detect"
        const localTz = timezones.find(tz => tz.name === userTimezone);
        if (localTz) {
            line1El.textContent = `${localTz.abbreviation} \u00B7 ${localTz.city}`;
            line2El.textContent = localTz.offsetString;
        } else {
            line1El.textContent = userTimezone || 'Auto-detect';
            line2El.innerHTML = '&nbsp;';
        }
        return;
    }

    line1El.textContent = overrideLine1 || `${tzObj.abbreviation} \u00B7 ${tzObj.city}`;
    line2El.textContent = overrideLine2 || tzObj.offsetString;
}

// ============================================================
// Search panel
// ============================================================

function openSearchPanel(type) {
    searchPanelTarget = type;
    el.searchPanelTitle.textContent = type === 'from' ? 'SELECT FROM TIMEZONE' : 'SELECT TO TIMEZONE';
    el.searchPanel.classList.add('open');
    el.searchPanelInput.value = '';
    el.searchPanelInput.focus();
    renderSearchResults('');
}

function closeSearchPanel() {
    el.searchPanel.classList.remove('open');
    searchPanelTarget = null;
    el.searchPanelInput.value = '';
}

/**
 * Render search results into the search panel.
 * Shows recent section + continent-grouped timezones filtered by query.
 */
function renderSearchResults(query) {
    const container = el.searchPanelResults;
    container.innerHTML = '';
    const q = query.toLowerCase().trim();

    // Build country match set
    const countryMatchZones = new Set();
    if (q) {
        for (const [country, zones] of Object.entries(COUNTRY_SEARCH_MAP)) {
            if (country.includes(q)) {
                zones.forEach(z => countryMatchZones.add(z));
            }
        }
    }

    // Filter function
    function matches(tz) {
        if (!q) return true;
        return tz.searchText.includes(q) || countryMatchZones.has(tz.name);
    }

    // Highlight matched substring in text
    function highlight(text, query) {
        if (!query) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const idx = escaped.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return escaped;
        return escaped.slice(0, idx) + '<mark>' + escaped.slice(idx, idx + query.length) + '</mark>' + escaped.slice(idx + query.length);
    }

    // Build a result item DOM node
    function createResultItem(tz) {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.setAttribute('role', 'option');
        item.dataset.timezone = tz.name;

        const line1 = document.createElement('div');
        line1.className = 'search-result-line1';
        line1.innerHTML = highlight(tz.city, q) + ' <span class="offset">' + escapeHtml(tz.offsetString) + '</span>';

        const line2 = document.createElement('div');
        line2.className = 'search-result-line2';
        line2.innerHTML = highlight(tz.name, q) + ' \u00B7 ' + escapeHtml(tz.longName);

        item.appendChild(line1);
        item.appendChild(line2);

        item.addEventListener('click', function() {
            selectTimezone(searchPanelTarget, tz.name);
        });

        return item;
    }

    // Build a group header
    function createHeader(label) {
        const h = document.createElement('div');
        h.className = 'search-group-header';
        h.textContent = label;
        return h;
    }

    // Score results by relevance (lower = better)
    function relevanceScore(tz) {
        if (!q) return 100;
        const name = tz.name.toLowerCase();
        const city = tz.city.toLowerCase();
        const aliases = getCityAliases(tz.name).toLowerCase();
        const abbr = tz.abbreviation.toLowerCase();

        // Exact city name match
        if (city === q) return 1;
        // Exact alias match (word boundary)
        if (aliases.split(/\s+/).includes(q)) return 2;
        // Exact abbreviation match
        if (abbr === q) return 3;
        // Country map match
        if (countryMatchZones.has(tz.name)) return 4;
        // City starts with query
        if (city.startsWith(q)) return 10;
        // Alias word starts with query
        if (aliases.split(/\s+/).some(w => w.startsWith(q))) return 11;
        // City or alias contains query
        if (city.includes(q) || aliases.includes(q)) return 20;
        // IANA name contains query
        if (name.includes(q)) return 30;
        // Long name / display name contains query
        return 50;
    }

    let totalResults = 0;

    // --- Recent section ---
    if (recentTimezones.length > 0) {
        const recentZones = recentTimezones
            .map(name => timezones.find(tz => tz.name === name))
            .filter(Boolean)
            .filter(matches);

        if (recentZones.length > 0) {
            container.appendChild(createHeader('\u2605 Recent'));
            recentZones.forEach(tz => {
                container.appendChild(createResultItem(tz));
                totalResults++;
            });
        }
    }

    // --- Filtered and sorted results ---
    if (q) {
        // When searching, sort by relevance instead of region grouping
        const matched = timezones.filter(matches);
        matched.sort((a, b) => relevanceScore(a) - relevanceScore(b) || a.city.localeCompare(b.city));

        // Limit to 50 results for performance
        const capped = matched.slice(0, 50);
        if (capped.length > 0) {
            container.appendChild(createHeader('Results'));
            capped.forEach(tz => {
                container.appendChild(createResultItem(tz));
                totalResults++;
            });
        }
    } else {
        // No query — show all grouped by continent
        let currentRegion = null;
        for (const tz of timezones) {
            if (tz.region !== currentRegion) {
                currentRegion = tz.region;
                container.appendChild(createHeader(currentRegion));
            }
            container.appendChild(createResultItem(tz));
            totalResults++;
        }
    }

    // No results message
    if (totalResults === 0 && q) {
        const noResults = document.createElement('div');
        noResults.className = 'search-no-results';
        noResults.textContent = 'No timezones found';
        container.appendChild(noResults);
    }
}

// ============================================================
// Timezone selection
// ============================================================

function selectTimezone(type, timezoneName) {
    const tzObj = timezoneName ? timezones.find(tz => tz.name === timezoneName) : null;

    if (type === 'from') {
        selectedFromTimezone = timezoneName;
        updatePillDisplay('from', tzObj);
    } else {
        selectedToTimezone = timezoneName;
        updatePillDisplay('to', tzObj);
    }

    closeSearchPanel();
    saveTimezonePreferences();

    // Add to recents
    if (timezoneName) {
        addToRecentTimezones(timezoneName);
    }

    // Auto-convert after timezone change
    triggerAutoConvert();
}

// ============================================================
// Swap timezones
// ============================================================

function swapTimezones() {
    const tempFrom = selectedFromTimezone;
    const tempTo = selectedToTimezone;

    selectedFromTimezone = tempTo;
    selectedToTimezone = tempFrom;

    const fromTz = selectedFromTimezone ? timezones.find(tz => tz.name === selectedFromTimezone) : null;
    const toTz = selectedToTimezone ? timezones.find(tz => tz.name === selectedToTimezone) : null;

    updatePillDisplay('from', fromTz);
    updatePillDisplay('to', toTz);

    saveTimezonePreferences();
    triggerAutoConvert();
}

// ============================================================
// Auto-convert (debounced 300ms)
// ============================================================

function triggerAutoConvert() {
    clearTimeout(autoConvertTimer);
    autoConvertTimer = setTimeout(() => {
        const input = el.dateTimeInput.value.trim();
        if (input) {
            handleConversion();
        }
    }, 300);
}

// ============================================================
// Intl-based formatting helpers (kept from v1)
// ============================================================

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

function formatDateInTimezone(utcDate, ianaZone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(utcDate);
}

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

function formatShortDateInTimezone(utcDate, ianaZone) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: ianaZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    }).format(utcDate);
}

/**
 * Compute day difference between source wall-clock and target display.
 * Returns "" for same day, "+1 day" for next day, "-1 day" for previous day, etc.
 */
function getDayDiffLabel(utcDate, sourceTimezone, targetTimezone) {
    try {
        const srcDay = new Intl.DateTimeFormat('en-US', { timeZone: sourceTimezone, day: 'numeric', month: 'numeric', year: 'numeric' }).format(utcDate);
        const tgtDay = new Intl.DateTimeFormat('en-US', { timeZone: targetTimezone, day: 'numeric', month: 'numeric', year: 'numeric' }).format(utcDate);
        if (srcDay === tgtDay) return '';
        // Parse MM/DD/YYYY to compare
        const [sm, sd, sy] = srcDay.split('/').map(Number);
        const [tm, td, ty] = tgtDay.split('/').map(Number);
        const srcDate = new Date(sy, sm - 1, sd);
        const tgtDate = new Date(ty, tm - 1, td);
        const diffDays = Math.round((tgtDate - srcDate) / (24 * 60 * 60 * 1000));
        if (diffDays === 0) return '';
        if (diffDays === 1) return '+1 day';
        if (diffDays === -1) return '-1 day';
        return `${diffDays > 0 ? '+' : ''}${diffDays} days`;
    } catch {
        return '';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// Conversion logic (kept from v1 — result display rewritten)
// ============================================================

function handleConversion() {
    const inputText = el.dateTimeInput.value.trim();

    if (!inputText) {
        el.confidenceText.classList.remove('show');
        showError('Please enter a date/time to convert.');
        return;
    }

    // Parse using TimeShiftParser
    const parseResult = TimeShiftParser.parse(inputText, {
        userTimezone: selectedFromTimezone || userTimezone
    });

    if (!parseResult) {
        el.confidenceText.classList.remove('show');
        showInfo(inputText);
        return;
    }

    try {
        let { utcDate, sourceTimezone, confidence, isRange, rangeEndUtcDate } = parseResult;

        // Upgrade low confidence if user manually selected From timezone
        if (confidence === 'low' && selectedFromTimezone) {
            confidence = 'medium';
        }

        // Show or hide confidence
        if (confidence === 'high') {
            el.confidenceText.classList.remove('show');
        } else {
            const detail = parseResult.confidenceDetail || (confidence === 'medium'
                ? 'Timezone inferred \u2014 verify the source timezone'
                : 'Low confidence \u2014 please select the source timezone');
            el.confidenceText.textContent = detail;
            el.confidenceText.classList.add('show');
        }

        // High confidence — auto-update From pill with detected timezone
        if (confidence === 'high' && sourceTimezone !== selectedFromTimezone) {
            const detectedObj = timezones.find(tz => tz.name === sourceTimezone);
            if (detectedObj) {
                selectedFromTimezone = sourceTimezone;
                if (parseResult.explicitOffset !== null && parseResult.explicitOffset !== undefined) {
                    const sign = parseResult.explicitOffset >= 0 ? '+' : '-';
                    const absMin = Math.abs(parseResult.explicitOffset);
                    const h = String(Math.floor(absMin / 60)).padStart(2, '0');
                    const m = String(absMin % 60).padStart(2, '0');
                    const city = sourceTimezone.split('/').pop().replace(/_/g, ' ');
                    updatePillDisplay('from', detectedObj, `${detectedObj.abbreviation} \u00B7 ${city}`, `UTC${sign}${h}:${m}`);
                } else {
                    updatePillDisplay('from', detectedObj);
                }
            }
        }

        // Determine target timezone
        let targetTimezone = selectedToTimezone;
        if (!targetTimezone || (confidence === 'high' && targetTimezone !== userTimezone)) {
            targetTimezone = userTimezone;
            const userTzObj = timezones.find(tz => tz.name === userTimezone);
            if (userTzObj) {
                selectedToTimezone = userTimezone;
                updatePillDisplay('to', userTzObj);
            }
        }

        // Look up display objects — try exact match first, then partial match on city
        const sourceTimezoneObj = timezones.find(tz => tz.name === sourceTimezone);
        let targetTimezoneObj = timezones.find(tz => tz.name === targetTimezone);
        // Fallback: if target not found by exact name, try building info dynamically
        if (!targetTimezoneObj && targetTimezone) {
            try {
                const { displayName, longName } = buildTimezoneInfo(targetTimezone);
                const utcOff = getTimezoneOffsetMinutes(targetTimezone);
                const abbr = getTimezoneAbbreviation(targetTimezone);
                const city = targetTimezone.split('/').pop().replace(/_/g, ' ');
                targetTimezoneObj = {
                    name: targetTimezone, city, displayName, longName,
                    abbreviation: abbr, offsetString: formatOffsetString(utcOff),
                    utcOffset: utcOff, region: getRegionGroup(targetTimezone)
                };
            } catch { /* ignore */ }
        }
        const targetDisplay = targetTimezoneObj ? targetTimezoneObj.displayName : targetTimezone;

        // Source display — use explicit offset if provided
        let sourceDisplay;
        if (parseResult.explicitOffset !== null && parseResult.explicitOffset !== undefined) {
            const sign = parseResult.explicitOffset >= 0 ? '+' : '-';
            const absMin = Math.abs(parseResult.explicitOffset);
            const h = String(Math.floor(absMin / 60)).padStart(2, '0');
            const m = String(absMin % 60).padStart(2, '0');
            sourceDisplay = `UTC${sign}${h}:${m}`;
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

            // Date display
            let dateText = '';
            if (parseResult.hasExplicitDate) {
                const startDate = formatDateInTimezone(utcDate, targetTimezone);
                const endDate = formatDateInTimezone(rangeEndUtcDate, targetTimezone);
                if (startDate === endDate) {
                    dateText = startDate;
                } else {
                    dateText = `${formatShortDateInTimezone(utcDate, targetTimezone)} - ${formatShortDateInTimezone(rangeEndUtcDate, targetTimezone)}`;
                }
            } else {
                const startDay = new Intl.DateTimeFormat('en-US', { timeZone: targetTimezone, day: 'numeric' }).format(utcDate);
                const endDay = new Intl.DateTimeFormat('en-US', { timeZone: targetTimezone, day: 'numeric' }).format(rangeEndUtcDate);
                if (startDay !== endDay) {
                    dateText = `${formatShortDateInTimezone(utcDate, targetTimezone)} - ${formatShortDateInTimezone(rangeEndUtcDate, targetTimezone)}`;
                }
            }

            const targetTzName = targetTimezoneObj ? `${targetTimezoneObj.abbreviation} \u00B7 ${targetTimezoneObj.longName}` : targetTimezone;

            el.resultContent.innerHTML = `
                <div class="result-range-time">${convertedStartTime} - ${convertedEndTime}</div>
                ${dateText ? `<div class="result-date">${escapeHtml(dateText)}</div>` : ''}
                <div class="result-tz-name">${escapeHtml(targetTzName)}</div>
                <div class="result-original">
                    <span class="result-original-time">${originalStartTime} - ${originalEndTime}</span>
                    <br>${escapeHtml(sourceDisplay)}${sourceLongName ? ` \u00B7 ${escapeHtml(sourceLongName)}` : ''}
                </div>
            `;

            // Copy text
            const sourceAbbr = sourceTimezoneObj ? sourceTimezone.split('/').pop().replace(/_/g, ' ') : sourceTimezone;
            const targetAbbr = targetTimezoneObj ? targetTimezone.split('/').pop().replace(/_/g, ' ') : targetTimezone;
            lastConversionText = `${originalStartTime} - ${originalEndTime} ${sourceAbbr} \u2192 ${convertedStartTime} - ${convertedEndTime} ${targetAbbr}`;

            showResultSuccess();
        } else {
            // ---- Single time conversion ----
            const convertedTime = formatInTimezone(utcDate, targetTimezone, { showSeconds: true });
            const originalTime = parseResult.wallClock ? formatWallClock(parseResult.wallClock, { showSeconds: true }) : formatInTimezone(utcDate, sourceTimezone, { showSeconds: true });

            const singleDateText = parseResult.hasExplicitDate
                ? formatDateInTimezone(utcDate, targetTimezone)
                : '';

            const targetTzName = targetTimezoneObj ? `${targetTimezoneObj.abbreviation} \u00B7 ${targetTimezoneObj.longName}` : targetTimezone;
            const dayDiff = getDayDiffLabel(utcDate, sourceTimezone, targetTimezone);

            el.resultContent.innerHTML = `
                <div class="result-converted-time">${convertedTime}${dayDiff ? `<span class="day-diff">${dayDiff}</span>` : ''}</div>
                ${singleDateText ? `<div class="result-date">${escapeHtml(singleDateText)}</div>` : ''}
                <div class="result-tz-name">${escapeHtml(targetTzName)}</div>
                <div class="result-original">
                    <span class="result-original-time">${originalTime}</span>
                    <br>${escapeHtml(sourceDisplay)}${sourceLongName ? ` \u00B7 ${escapeHtml(sourceLongName)}` : ''}
                </div>
            `;

            // Copy text
            const singleSourceAbbr = sourceTimezoneObj ? sourceTimezone.split('/').pop().replace(/_/g, ' ') : sourceTimezone;
            const singleTargetAbbr = targetTimezoneObj ? targetTimezone.split('/').pop().replace(/_/g, ' ') : targetTimezone;
            lastConversionText = `${originalTime} ${singleSourceAbbr} \u2192 ${convertedTime} ${singleTargetAbbr}`;

            showResultSuccess();
        }

    } catch (error) {
        el.confidenceText.classList.remove('show');
        showError(error.message);
    }
}

// ============================================================
// Result display helpers
// ============================================================

function showResultSuccess() {
    el.resultArea.className = 'result-area show';
    el.copyBtn.className = 'copy-btn visible';
}

function showError(message) {
    el.resultContent.innerHTML = `
        <div class="result-error-title">Error</div>
        <div class="result-error-body">${escapeHtml(message)}</div>
    `;
    el.resultArea.className = 'result-area show error';
    el.copyBtn.className = 'copy-btn';
    lastConversionText = '';
}

function showInfo(inputText) {
    el.resultContent.innerHTML = `
        <div class="result-error-title">No Time Information Detected</div>
        <div class="result-error-body">
            Input: "${escapeHtml(inputText)}"<br><br>
            Please include time information for conversion.<br><br>
            <strong>Supported formats:</strong><br>
            &bull; 12:00 PM<br>
            &bull; 12:00 PM - 1:00 PM<br>
            &bull; Sep 2, 2025 12:00 PM<br>
            &bull; 2025-09-02 12:00<br>
            &bull; Tuesday, Sep 2, 2025 12:00 PM PST
        </div>
    `;
    el.resultArea.className = 'result-area show';
    el.copyBtn.className = 'copy-btn';
    lastConversionText = '';
}

// ============================================================
// Context menu check (kept from v1)
// ============================================================

async function checkForContextMenuText() {
    try {
        const result = await chrome.storage.local.get(['selectedText', 'fromContextMenu', 'timestamp']);
        if (result.fromContextMenu && result.selectedText) {
            const isRecent = result.timestamp && (Date.now() - result.timestamp < 60000);

            if (isRecent) {
                el.dateTimeInput.value = result.selectedText;
                await chrome.storage.local.remove(['selectedText', 'fromContextMenu', 'timestamp']);

                if (TimeShiftParser.parse(result.selectedText, { userTimezone: userTimezone }) !== null) {
                    handleConversion();
                } else {
                    showInfo(result.selectedText);
                }

                if (chrome.action && chrome.action.setBadgeText) {
                    chrome.action.setBadgeText({ text: '' });
                }
            } else {
                await chrome.storage.local.remove(['selectedText', 'fromContextMenu', 'timestamp']);
            }
        }
    } catch {
        // Silent fail
    }
}

// ============================================================
// Event listeners
// ============================================================

function setupEventListeners() {
    // Input field — auto-convert on input (debounced)
    el.dateTimeInput.addEventListener('input', function() {
        triggerAutoConvert();
    });

    // Enter key — immediate convert
    el.dateTimeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            clearTimeout(autoConvertTimer);
            handleConversion();
        }
    });

    // Now button
    el.nowBtn.addEventListener('click', function() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        el.dateTimeInput.value = timeStr;
        handleConversion();
    });

    // Pill clicks — open search panel
    el.fromPill.addEventListener('click', function() {
        openSearchPanel('from');
    });
    el.toPill.addEventListener('click', function() {
        openSearchPanel('to');
    });

    // Pill keyboard accessibility
    el.fromPill.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSearchPanel('from');
        }
    });
    el.toPill.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSearchPanel('to');
        }
    });

    // Swap arrow — reverse From and To
    el.swapArrow.addEventListener('click', swapTimezones);
    el.swapArrow.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            swapTimezones();
        }
    });

    // Search panel close button
    el.searchPanelClose.addEventListener('click', closeSearchPanel);

    // Search panel Escape key
    el.searchPanel.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeSearchPanel();
        }
    });

    // Search panel input — filter results
    el.searchPanelInput.addEventListener('input', function() {
        renderSearchResults(this.value);
    });

    // Copy button
    el.copyBtn.addEventListener('click', function() {
        if (!lastConversionText) return;
        navigator.clipboard.writeText(lastConversionText).then(() => {
            el.copyBtnText.textContent = 'Copied!';
            setTimeout(() => {
                el.copyBtnText.textContent = 'Copy';
            }, 1500);
        });
    });
}

// ============================================================
// Initialization
// ============================================================

document.addEventListener('DOMContentLoaded', async function() {
    initializeElements();
    detectUserTimezone();

    await loadRecentTimezones();
    initializeTimezones();
    setupEventListeners();

    await loadTimezonePreferences();

    // Set initial pill display (show local timezone if no preference loaded)
    if (!selectedFromTimezone) updatePillDisplay('from', null);
    if (!selectedToTimezone) updatePillDisplay('to', null);

    // Check if opened from context menu
    checkForContextMenuText();

    // Smart placeholder
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    el.dateTimeInput.placeholder = `e.g., ${timeStr} (now)`;
});
