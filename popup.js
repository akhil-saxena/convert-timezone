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
    copyBtnText: null
};

/**
 * Initialize popup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', async function() {
    initializeElements();
    initializeTimezones();
    setupEventListeners();
    detectUserTimezone();

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
// Curated timezone list (IANA name + region + priority only)
// Display names and offsets are computed dynamically via Intl
// ============================================================

const CURATED_TIMEZONES = [
    // UTC and GMT
    { name: 'UTC', region: 'UTC', priority: 1 },

    // Americas (Eastern to Pacific)
    { name: 'America/New_York', region: 'Americas', priority: 2 },
    { name: 'America/Toronto', region: 'Americas', priority: 3 },
    { name: 'America/Chicago', region: 'Americas', priority: 3 },
    { name: 'America/Denver', region: 'Americas', priority: 3 },
    { name: 'America/Los_Angeles', region: 'Americas', priority: 2 },
    { name: 'America/Phoenix', region: 'Americas', priority: 3 },
    { name: 'America/Anchorage', region: 'Americas', priority: 3 },
    { name: 'Pacific/Honolulu', region: 'Americas', priority: 3 },

    // Canada
    { name: 'America/Vancouver', region: 'Americas', priority: 3 },
    { name: 'America/Edmonton', region: 'Americas', priority: 3 },
    { name: 'America/Winnipeg', region: 'Americas', priority: 3 },
    { name: 'America/Halifax', region: 'Americas', priority: 3 },

    // South America
    { name: 'America/Sao_Paulo', region: 'Americas', priority: 3 },
    { name: 'America/Argentina/Buenos_Aires', region: 'Americas', priority: 3 },
    { name: 'America/Mexico_City', region: 'Americas', priority: 3 },
    { name: 'America/Lima', region: 'Americas', priority: 3 },

    // Europe
    { name: 'Europe/London', region: 'Europe', priority: 2 },
    { name: 'Europe/Paris', region: 'Europe', priority: 2 },
    { name: 'Europe/Berlin', region: 'Europe', priority: 3 },
    { name: 'Europe/Rome', region: 'Europe', priority: 3 },
    { name: 'Europe/Madrid', region: 'Europe', priority: 3 },
    { name: 'Europe/Amsterdam', region: 'Europe', priority: 3 },
    { name: 'Europe/Zurich', region: 'Europe', priority: 3 },
    { name: 'Europe/Vienna', region: 'Europe', priority: 3 },
    { name: 'Europe/Stockholm', region: 'Europe', priority: 3 },
    { name: 'Europe/Helsinki', region: 'Europe', priority: 3 },
    { name: 'Europe/Athens', region: 'Europe', priority: 3 },
    { name: 'Europe/Moscow', region: 'Europe', priority: 3 },
    { name: 'Europe/Istanbul', region: 'Europe', priority: 3 },

    // Asia-Pacific
    { name: 'Asia/Tokyo', region: 'Asia-Pacific', priority: 2 },
    { name: 'Asia/Shanghai', region: 'Asia-Pacific', priority: 2 },
    { name: 'Asia/Hong_Kong', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Singapore', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Seoul', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Kolkata', region: 'Asia-Pacific', priority: 2 },
    { name: 'Asia/Dubai', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Bangkok', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Manila', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Jakarta', region: 'Asia-Pacific', priority: 3 },
    { name: 'Asia/Taipei', region: 'Asia-Pacific', priority: 3 },

    // Australia & Oceania
    { name: 'Australia/Sydney', region: 'Australia/Oceania', priority: 2 },
    { name: 'Australia/Melbourne', region: 'Australia/Oceania', priority: 3 },
    { name: 'Australia/Brisbane', region: 'Australia/Oceania', priority: 3 },
    { name: 'Australia/Perth', region: 'Australia/Oceania', priority: 3 },
    { name: 'Australia/Adelaide', region: 'Australia/Oceania', priority: 3 },
    { name: 'Pacific/Auckland', region: 'Australia/Oceania', priority: 3 },

    // Africa
    { name: 'Africa/Cairo', region: 'Africa', priority: 3 },
    { name: 'Africa/Johannesburg', region: 'Africa', priority: 3 },
    { name: 'Africa/Lagos', region: 'Africa', priority: 3 },
    { name: 'Africa/Nairobi', region: 'Africa', priority: 3 },
    { name: 'Africa/Casablanca', region: 'Africa', priority: 3 },

    // Middle East
    { name: 'Asia/Jerusalem', region: 'Middle East', priority: 3 },
    { name: 'Asia/Riyadh', region: 'Middle East', priority: 3 },
    { name: 'Asia/Tehran', region: 'Middle East', priority: 3 },
];

// ============================================================
// Intl-based timezone utilities
// ============================================================

/**
 * Build a human-readable display name for an IANA timezone using Intl APIs
 */
function buildTimezoneDisplayName(ianaZone) {
    if (ianaZone === 'UTC') return 'UTC (Coordinated Universal Time)';
    try {
        const now = new Date();
        // Get offset like "GMT-04:00" and convert to "UTC-04:00"
        const offsetFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone, timeZoneName: 'longOffset'
        });
        const offsetStr = offsetFormatter.formatToParts(now)
            .find(p => p.type === 'timeZoneName')?.value || '';
        const utcOffset = offsetStr.replace('GMT', 'UTC');
        // Get abbreviation like "EDT"
        const abbrFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: ianaZone, timeZoneName: 'short'
        });
        const abbr = abbrFormatter.formatToParts(now)
            .find(p => p.type === 'timeZoneName')?.value || '';
        const city = ianaZone.split('/').pop().replace(/_/g, ' ');
        // If abbreviation is just a GMT offset (e.g. "GMT+5:30"), skip it —
        // we already show the UTC offset in parentheses
        if (abbr && !abbr.startsWith('GMT') && !abbr.startsWith('UTC')) {
            return `${city} (${utcOffset}) ${abbr}`;
        }
        return `${city} (${utcOffset})`;
    } catch {
        return ianaZone;
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
// Timezone initialization
// ============================================================

/**
 * Initialize timezone data from curated list with dynamic Intl-computed display names
 */
function initializeTimezones() {
    timezones = CURATED_TIMEZONES.map(tz => {
        try {
            const displayName = buildTimezoneDisplayName(tz.name);
            const utcOffset = getTimezoneOffsetMinutes(tz.name);
            const parts = tz.name.split('/');
            const city = parts[parts.length - 1].replace(/_/g, ' ');

            return {
                name: tz.name,
                city: city,
                region: tz.region,
                displayName: displayName,
                searchText: `${tz.name} ${city} ${tz.region} ${displayName}`.toLowerCase(),
                utcOffset: utcOffset,
                priority: tz.priority,
                sortKey: `${tz.priority}_${utcOffset.toString().padStart(5, '0')}_${city}`
            };
        } catch {
            return null;
        }
    }).filter(tz => tz !== null);

    // Sort by priority, then by UTC offset, then by city name
    timezones.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.utcOffset !== b.utcOffset) return a.utcOffset - b.utcOffset;
        return a.city.localeCompare(b.city);
    });

    populateTimezoneOptions();
}

// ============================================================
// Dropdown population, filtering, selection (kept as-is)
// ============================================================

/**
 * Populate timezone dropdown options
 */
function populateTimezoneOptions() {
    // Clear existing options
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

    // Add timezone options without separators
    timezones.forEach((timezone) => {
        // From timezone option
        const fromOption = document.createElement('div');
        fromOption.className = 'dropdown-option';
        fromOption.textContent = timezone.displayName;
        fromOption.dataset.timezone = timezone.name;
        fromOption.addEventListener('click', function() {
            selectTimezone('from', timezone.name, timezone.displayName);
        });
        elements.fromTimezoneOptions.appendChild(fromOption);

        // To timezone option
        const toOption = document.createElement('div');
        toOption.className = 'dropdown-option';
        toOption.textContent = timezone.displayName;
        toOption.dataset.timezone = timezone.name;
        toOption.addEventListener('click', function() {
            selectTimezone('to', timezone.name, timezone.displayName);
        });
        elements.toTimezoneOptions.appendChild(toOption);
    });
}

/**
 * Filter timezones based on search query
 */
function filterTimezones(type, query) {
    const optionsContainer = type === 'from' ? elements.fromTimezoneOptions : elements.toTimezoneOptions;
    const options = optionsContainer.querySelectorAll('.dropdown-option');

    query = query.toLowerCase().trim();

    options.forEach(option => {
        if (option.classList.contains('special')) {
            // Always show auto-detect option
            option.style.display = 'block';
            return;
        }

        const text = option.textContent.toLowerCase();
        const timezone = option.dataset.timezone ? option.dataset.timezone.toLowerCase() : '';
        const isMatch = query === '' || text.includes(query) || timezone.includes(query);

        option.style.display = isMatch ? 'block' : 'none';
    });
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
 * Handle time conversion
 */
function handleConversion() {
    const inputText = elements.dateTimeInput.value.trim();

    if (!inputText) {
        showResult('Please enter a date/time to convert.', 'error');
        return;
    }

    // Parse using TimeShiftParser
    const parseResult = TimeShiftParser.parse(inputText, {
        userTimezone: selectedFromTimezone || userTimezone
    });

    if (!parseResult) {
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
                    <div style="color: #e2e8f0; font-size: 11px; margin-top: 2px;">${escapeHtml(sourceDisplay)}</div>
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
                    <div style="color: #e2e8f0; font-size: 11px; margin-top: 2px;">${escapeHtml(sourceDisplay)}</div>
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

    } catch (error) {
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
