/**
 * Popup Script for Convert Timezone Chrome Extension
 * Handles the popup interface with timezone dropdowns and conversion functionality
 */

// Global variables
let timezones = [];
let selectedFromTimezone = null;
let selectedToTimezone = null;
let userTimezone = null;

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
    toTimezoneOptions: null
};

/**
 * Initialize popup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', async function() {
    initializeElements();
    await initializeTimezones();
    setupEventListeners();
    detectUserTimezone();
    
    // Load saved timezone preferences
    await loadTimezonePreferences();
    
    // Check if opened from context menu
    checkForContextMenuText();
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
}

/**
 * Initialize timezone data
 */
async function initializeTimezones() {
    // Curated list of major timezones with consistent formatting
    const curatedTimezones = [
        // UTC and GMT
        { name: 'UTC', displayName: 'UTC (Coordinated Universal Time)', region: 'UTC', priority: 1 },
        
        // Americas (Eastern to Pacific)
        { name: 'America/New_York', displayName: 'New York (UTC-05:00) EST/EDT', region: 'Americas', priority: 2 },
        { name: 'America/Toronto', displayName: 'Toronto (UTC-05:00) EST/EDT', region: 'Americas', priority: 3 },
        { name: 'America/Chicago', displayName: 'Chicago (UTC-06:00) CST/CDT', region: 'Americas', priority: 3 },
        { name: 'America/Denver', displayName: 'Denver (UTC-07:00) MST/MDT', region: 'Americas', priority: 3 },
        { name: 'America/Los_Angeles', displayName: 'Los Angeles (UTC-08:00) PST/PDT', region: 'Americas', priority: 2 },
        { name: 'America/Phoenix', displayName: 'Phoenix (UTC-07:00) MST', region: 'Americas', priority: 3 },
        { name: 'America/Anchorage', displayName: 'Anchorage (UTC-09:00) AKST/AKDT', region: 'Americas', priority: 3 },
        { name: 'Pacific/Honolulu', displayName: 'Honolulu (UTC-10:00) HST', region: 'Americas', priority: 3 },
        
        // Canada
        { name: 'America/Vancouver', displayName: 'Vancouver (UTC-08:00) PST/PDT', region: 'Americas', priority: 3 },
        { name: 'America/Edmonton', displayName: 'Edmonton (UTC-07:00) MST/MDT', region: 'Americas', priority: 3 },
        { name: 'America/Winnipeg', displayName: 'Winnipeg (UTC-06:00) CST/CDT', region: 'Americas', priority: 3 },
        { name: 'America/Halifax', displayName: 'Halifax (UTC-04:00) AST/ADT', region: 'Americas', priority: 3 },
        
        // South America
        { name: 'America/Sao_Paulo', displayName: 'São Paulo (UTC-03:00) BRT', region: 'Americas', priority: 3 },
        { name: 'America/Argentina/Buenos_Aires', displayName: 'Buenos Aires (UTC-03:00) ART', region: 'Americas', priority: 3 },
        { name: 'America/Mexico_City', displayName: 'Mexico City (UTC-06:00) CST/CDT', region: 'Americas', priority: 3 },
        { name: 'America/Lima', displayName: 'Lima (UTC-05:00) PET', region: 'Americas', priority: 3 },
        
        // Europe
        { name: 'Europe/London', displayName: 'London (UTC+00:00) GMT/BST', region: 'Europe', priority: 2 },
        { name: 'Europe/Paris', displayName: 'Paris (UTC+01:00) CET/CEST', region: 'Europe', priority: 2 },
        { name: 'Europe/Berlin', displayName: 'Berlin (UTC+01:00) CET/CEST', region: 'Europe', priority: 3 },
        { name: 'Europe/Rome', displayName: 'Rome (UTC+01:00) CET/CEST', region: 'Europe', priority: 3 },
        { name: 'Europe/Madrid', displayName: 'Madrid (UTC+01:00) CET/CEST', region: 'Europe', priority: 3 },
        { name: 'Europe/Amsterdam', displayName: 'Amsterdam (UTC+01:00) CET/CEST', region: 'Europe', priority: 3 },
        { name: 'Europe/Zurich', displayName: 'Zurich (UTC+01:00) CET/CEST', region: 'Europe', priority: 3 },
        { name: 'Europe/Vienna', displayName: 'Vienna (UTC+01:00) CET/CEST', region: 'Europe', priority: 3 },
        { name: 'Europe/Stockholm', displayName: 'Stockholm (UTC+01:00) CET/CEST', region: 'Europe', priority: 3 },
        { name: 'Europe/Helsinki', displayName: 'Helsinki (UTC+02:00) EET/EEST', region: 'Europe', priority: 3 },
        { name: 'Europe/Athens', displayName: 'Athens (UTC+02:00) EET/EEST', region: 'Europe', priority: 3 },
        { name: 'Europe/Moscow', displayName: 'Moscow (UTC+03:00) MSK', region: 'Europe', priority: 3 },
        { name: 'Europe/Istanbul', displayName: 'Istanbul (UTC+03:00) TRT', region: 'Europe', priority: 3 },
        
        // Asia-Pacific
        { name: 'Asia/Tokyo', displayName: 'Tokyo (UTC+09:00) JST', region: 'Asia-Pacific', priority: 2 },
        { name: 'Asia/Shanghai', displayName: 'Shanghai (UTC+08:00) CST', region: 'Asia-Pacific', priority: 2 },
        { name: 'Asia/Hong_Kong', displayName: 'Hong Kong (UTC+08:00) HKT', region: 'Asia-Pacific', priority: 3 },
        { name: 'Asia/Singapore', displayName: 'Singapore (UTC+08:00) SGT', region: 'Asia-Pacific', priority: 3 },
        { name: 'Asia/Seoul', displayName: 'Seoul (UTC+09:00) KST', region: 'Asia-Pacific', priority: 3 },
        { name: 'Asia/Kolkata', displayName: 'Kolkata (UTC+05:30) IST', region: 'Asia-Pacific', priority: 2 },
        { name: 'Asia/Dubai', displayName: 'Dubai (UTC+04:00) GST', region: 'Asia-Pacific', priority: 3 },
        { name: 'Asia/Bangkok', displayName: 'Bangkok (UTC+07:00) ICT', region: 'Asia-Pacific', priority: 3 },
        { name: 'Asia/Manila', displayName: 'Manila (UTC+08:00) PHT', region: 'Asia-Pacific', priority: 3 },
        { name: 'Asia/Jakarta', displayName: 'Jakarta (UTC+07:00) WIB', region: 'Asia-Pacific', priority: 3 },
        { name: 'Asia/Taipei', displayName: 'Taipei (UTC+08:00) CST', region: 'Asia-Pacific', priority: 3 },
        
        // Australia & Oceania
        { name: 'Australia/Sydney', displayName: 'Sydney (UTC+10:00) AEST/AEDT', region: 'Australia/Oceania', priority: 2 },
        { name: 'Australia/Melbourne', displayName: 'Melbourne (UTC+10:00) AEST/AEDT', region: 'Australia/Oceania', priority: 3 },
        { name: 'Australia/Brisbane', displayName: 'Brisbane (UTC+10:00) AEST', region: 'Australia/Oceania', priority: 3 },
        { name: 'Australia/Perth', displayName: 'Perth (UTC+08:00) AWST', region: 'Australia/Oceania', priority: 3 },
        { name: 'Australia/Adelaide', displayName: 'Adelaide (UTC+09:30) ACST/ACDT', region: 'Australia/Oceania', priority: 3 },
        { name: 'Pacific/Auckland', displayName: 'Auckland (UTC+12:00) NZST/NZDT', region: 'Australia/Oceania', priority: 3 },
        
        // Africa
        { name: 'Africa/Cairo', displayName: 'Cairo (UTC+02:00) EET', region: 'Africa', priority: 3 },
        { name: 'Africa/Johannesburg', displayName: 'Johannesburg (UTC+02:00) SAST', region: 'Africa', priority: 3 },
        { name: 'Africa/Lagos', displayName: 'Lagos (UTC+01:00) WAT', region: 'Africa', priority: 3 },
        { name: 'Africa/Nairobi', displayName: 'Nairobi (UTC+03:00) EAT', region: 'Africa', priority: 3 },
        { name: 'Africa/Casablanca', displayName: 'Casablanca (UTC+01:00) CET', region: 'Africa', priority: 3 },
        
        // Middle East
        { name: 'Asia/Jerusalem', displayName: 'Jerusalem (UTC+02:00) IST', region: 'Middle East', priority: 3 },
        { name: 'Asia/Riyadh', displayName: 'Riyadh (UTC+03:00) AST', region: 'Middle East', priority: 3 },
        { name: 'Asia/Tehran', displayName: 'Tehran (UTC+03:30) IRST', region: 'Middle East', priority: 3 },
    ];
    
    // Create timezone objects with dynamic offset calculation
    timezones = curatedTimezones.map(tz => {
        try {
            const momentTz = moment.tz(tz.name);
            const utcOffset = momentTz.utcOffset();
            const offsetHours = Math.floor(Math.abs(utcOffset) / 60);
            const offsetMinutes = Math.abs(utcOffset) % 60;
            const offsetSign = utcOffset >= 0 ? '+' : '-';
            const dynamicOffsetString = `UTC${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
            
            // Update display name with current offset if different from static
            let displayName = tz.displayName;
            if (!displayName.includes(dynamicOffsetString)) {
                displayName = displayName.replace(/UTC[+-]\d{2}:\d{2}/, dynamicOffsetString);
            }
            
            // Parse city name from timezone name
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
        } catch (error) {
            return null;
        }
    }).filter(tz => tz !== null);
    
    // Sort by priority first (UTC, major cities, then others), then by UTC offset, then by city name
    timezones.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        if (a.utcOffset !== b.utcOffset) {
            return a.utcOffset - b.utcOffset;
        }
        return a.city.localeCompare(b.city);
    });
    
    populateTimezoneOptions();
}

/**
 * Detect user's timezone
 */
function detectUserTimezone() {
    try {
        userTimezone = moment.tz.guess();
        
        // Map legacy timezone names to modern equivalents
        userTimezone = mapLegacyTimezone(userTimezone);
    } catch (error) {
        userTimezone = 'UTC';
    }
}

/**
 * Map legacy timezone names to modern equivalents used in our timezone list
 */
function mapLegacyTimezone(timezoneName) {
    const legacyMapping = {
        'Asia/Calcutta': 'Asia/Kolkata',
        'America/Montreal': 'America/Toronto',
        'America/Shiprock': 'America/Denver',
        'America/Knox_IN': 'America/Indiana/Knox',
        'America/Louisville': 'America/Kentucky/Louisville',
        'Pacific/Ponape': 'Pacific/Pohnpei',
        'Pacific/Truk': 'Pacific/Chuuk',
        'Pacific/Yap': 'Pacific/Chuuk',
        'US/Alaska': 'America/Anchorage',
        'US/Aleutian': 'America/Adak',
        'US/Arizona': 'America/Phoenix',
        'US/Central': 'America/Chicago',
        'US/Eastern': 'America/New_York',
        'US/Hawaii': 'Pacific/Honolulu',
        'US/Mountain': 'America/Denver',
        'US/Pacific': 'America/Los_Angeles'
    };
    
    return legacyMapping[timezoneName] || timezoneName;
}

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
 * Check if query matches country or common city names
 */
function isCountryMatch(query, timezoneText) {
    const countryMappings = {
        // North America
        'usa': ['los angeles', 'new york', 'chicago', 'denver', 'phoenix', 'detroit', 'miami', 'anchorage'],
        'united states': ['los angeles', 'new york', 'chicago', 'denver', 'phoenix', 'detroit', 'miami', 'anchorage'],
        'america': ['los angeles', 'new york', 'chicago', 'denver', 'phoenix', 'detroit', 'miami', 'anchorage'],
        'canada': ['toronto', 'vancouver', 'montreal', 'halifax', 'winnipeg', 'edmonton'],
        'mexico': ['mexico city', 'tijuana', 'cancun'],
        
        // Europe
        'uk': ['london'],
        'united kingdom': ['london'],
        'britain': ['london'],
        'england': ['london'],
        'france': ['paris'],
        'germany': ['berlin'],
        'spain': ['madrid'],
        'italy': ['rome'],
        'netherlands': ['amsterdam'],
        'austria': ['vienna'],
        'poland': ['warsaw'],
        'greece': ['athens'],
        'finland': ['helsinki'],
        'portugal': ['lisbon'],
        'ireland': ['dublin'],
        'norway': ['oslo'],
        'sweden': ['stockholm'],
        'denmark': ['copenhagen'],
        'switzerland': ['zurich'],
        'belgium': ['brussels'],
        'russia': ['moscow'],
        'turkey': ['istanbul'],
        
        // Asia
        'india': ['kolkata', 'mumbai', 'delhi'],
        'china': ['shanghai', 'beijing'],
        'japan': ['tokyo'],
        'south korea': ['seoul'],
        'korea': ['seoul'],
        'singapore': ['singapore'],
        'thailand': ['bangkok'],
        'vietnam': ['ho chi minh'],
        'philippines': ['manila'],
        'indonesia': ['jakarta'],
        'malaysia': ['kuala lumpur'],
        'israel': ['jerusalem'],
        'uae': ['dubai'],
        'saudi arabia': ['riyadh'],
        'pakistan': ['karachi'],
        'bangladesh': ['dhaka'],
        'sri lanka': ['colombo'],
        
        // Australia/Oceania
        'australia': ['sydney', 'melbourne', 'perth', 'adelaide', 'darwin', 'brisbane'],
        'new zealand': ['auckland'],
        
        // Africa
        'south africa': ['johannesburg'],
        'egypt': ['cairo'],
        'kenya': ['nairobi'],
        'nigeria': ['lagos'],
        'morocco': ['casablanca'],
        
        // South America
        'brazil': ['sao paulo'],
        'argentina': ['buenos aires'],
        'chile': ['santiago'],
        'venezuela': ['caracas'],
        'uruguay': ['montevideo'],
        
        // Common timezone abbreviations
        'pst': ['los angeles', 'vancouver'],
        'est': ['new york', 'toronto'],
        'cst': ['chicago'],
        'mst': ['denver', 'phoenix'],
        'utc': ['utc'],
        'gmt': ['london'],
        'ist': ['kolkata'],
        'jst': ['tokyo'],
        'cet': ['paris', 'berlin', 'rome'],
        'aest': ['sydney', 'melbourne']
    };
    
    const mapping = countryMappings[query];
    if (mapping) {
        return mapping.some(term => timezoneText.toLowerCase().includes(term));
    }
    
    return false;
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

/**
 * Handle time conversion
 */
function handleConversion() {
    const inputText = elements.dateTimeInput.value.trim();
    
    if (!inputText) {
        showResult('Please enter a date/time to convert.', 'error');
        return;
    }
    
    // Check if the input looks like valid date/time before proceeding
    if (!looksLikeDateTime(inputText)) {
        showResult(`
            <div style="color: #f59e0b; font-weight: 600; margin-bottom: 8px;">! No Time Information Detected</div>
            <div style="font-size: 13px; line-height: 1.4;">
                Input: "<strong>${inputText}</strong>"<br><br>
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
        // Detect timezone from input text (with legacy mapping)
        const detectedFromTimezone = detectTimezoneFromTextMapped(inputText);
        
        // Determine source timezone - prioritize detected timezone from text
        let sourceTimezone;
        if (detectedFromTimezone) {
            // Use detected timezone if found in the text
            sourceTimezone = detectedFromTimezone;
        } else if (selectedFromTimezone) {
            // Use selected timezone if no timezone detected in text
            sourceTimezone = selectedFromTimezone;
        } else {
            // Fallback to user's local timezone
            sourceTimezone = userTimezone;
        }
        
        // If we detected a timezone and it's not already selected, auto-select it
        if (detectedFromTimezone && detectedFromTimezone !== selectedFromTimezone) {
            const detectedTimezoneObj = timezones.find(tz => tz.name === detectedFromTimezone);
            if (detectedTimezoneObj) {
                selectedFromTimezone = detectedFromTimezone;
                elements.fromTimezoneDropdown.querySelector('.selected-text').textContent = detectedTimezoneObj.displayName;
            }
        }
        
        // Determine target timezone
        let targetTimezone = selectedToTimezone;
        if (!targetTimezone) {
            // If we detected a timezone from text, suggest user's local timezone as target
            if (detectedFromTimezone) {
                targetTimezone = userTimezone;
                // Auto-select user timezone in "to" dropdown
                const userTimezoneObj = timezones.find(tz => tz.name === userTimezone);
                if (userTimezoneObj) {
                    selectedToTimezone = userTimezone;
                    elements.toTimezoneDropdown.querySelector('.selected-text').textContent = userTimezoneObj.displayName;
                }
            } else {
                targetTimezone = userTimezone;
            }
        }
        
        // Check if input is a time range
        const timeRangeMatch = inputText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\s*[-–—]\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i);
        
        if (timeRangeMatch) {
            // Handle time range conversion
            const startTime = timeRangeMatch[1];
            const endTime = timeRangeMatch[2];
            
            // Parse start and end times
            const parsedStartTime = parseDateTime(startTime, sourceTimezone);
            const parsedEndTime = parseDateTime(endTime, sourceTimezone);
            
            if (!parsedStartTime.isValid() || !parsedEndTime.isValid()) {
                showResult(`
                    <div style="color: #f87171; font-weight: 600; margin-bottom: 8px;">✗ Parse Error</div>
                    <div style="font-size: 13px; line-height: 1.4;">
                        Could not parse time range "${inputText}".<br><br>
                        <strong>Supported formats:</strong><br>
                        • 12:00 PM - 1:00 PM<br>
                        • 9:00 AM - 10:30 AM<br>
                        • 14:00 - 15:30
                    </div>
                `, 'error');
                return;
            }
            
            // Convert both times to target timezone
            const convertedStartTime = parsedStartTime.clone().tz(targetTimezone);
            const convertedEndTime = parsedEndTime.clone().tz(targetTimezone);
            
            // For display purposes, use the actually detected timezone or the source timezone
            const displaySourceTimezone = detectedFromTimezone || sourceTimezone;
            const displaySourceTimezoneObj = timezones.find(tz => tz.name === displaySourceTimezone);
            
            // Format result for time range
            const targetTimezoneObj = timezones.find(tz => tz.name === targetTimezone);
            
            const resultHtml = `
                <div style="color: #ffffff; font-weight: 600; margin-bottom: 12px; font-size: 14px;">✓ Time Range Converted</div>
                
                <div style="background: rgba(255,255,255,0.95); padding: 15px; border-radius: 10px; margin-bottom: 12px; text-align: center; color: #1f2937;">
                    <div style="color: #111827; font-weight: 700; font-size: 18px; margin-bottom: 6px;">
                        ${convertedStartTime.format('h:mm A')} - ${convertedEndTime.format('h:mm A')}
                    </div>
                    <div style="color: #374151; font-size: 13px; margin-bottom: 8px;">
                        ${convertedStartTime.format('dddd, MMMM D, YYYY')}
                    </div>
                    <div style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 20px; display: inline-block;">
                        <div style="color: #6b7280; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${targetTimezoneObj ? targetTimezoneObj.displayName : targetTimezone}
                        </div>
                    </div>
                </div>
                
                <div style="background: rgba(255,255,255,0.15); padding: 10px; border-radius: 8px; font-size: 12px;">
                    <div style="color: #f1f5f9; font-weight: 600; margin-bottom: 2px;">Original Range:</div>
                    <div style="color: #ffffff;">${parsedStartTime.format('h:mm A')} - ${parsedEndTime.format('h:mm A')}</div>
                    <div style="color: #e2e8f0; font-size: 11px; margin-top: 2px;">${displaySourceTimezoneObj ? displaySourceTimezoneObj.displayName : displaySourceTimezone}</div>
                </div>
            `;
            
            showResult(resultHtml, 'success');
            return;
        }
        
        // Parse the input time (single time) - strip timezone info from text first
        const cleanTimeText = stripTimezoneFromText(inputText);
        const parsedTime = parseDateTime(cleanTimeText, sourceTimezone);
        
        if (!parsedTime.isValid()) {
            showResult(`
                <div style="color: #f87171; font-weight: 600; margin-bottom: 8px;">✗ Parse Error</div>
                <div style="font-size: 13px; line-height: 1.4;">
                    Could not parse "${inputText}".<br><br>
                    <strong>Supported formats:</strong><br>
                    • 12:00 PM<br>
                    • 12:00 PM - 1:00 PM<br>
                    • Sep 2, 2025 12:00 PM<br>
                    • 2025-09-02 12:00<br>
                    • Tuesday, Sep 2, 2025 12:00 PM PST
                </div>
            `, 'error');
            return;
        }
        
        // Convert to target timezone
        const convertedTime = parsedTime.clone().tz(targetTimezone);
        
        // For display purposes, use the actually detected timezone or the source timezone
        const displaySourceTimezone = detectedFromTimezone || sourceTimezone;
        const displaySourceTimezoneObj = timezones.find(tz => tz.name === displaySourceTimezone);
        
        // Format result for single time
        const targetTimezoneObj = timezones.find(tz => tz.name === targetTimezone);
        
        const resultHtml = `
            <div style="color: #ffffff; font-weight: 600; margin-bottom: 12px; font-size: 14px;">✓ Time Converted</div>
            
            <div style="background: rgba(255,255,255,0.95); padding: 15px; border-radius: 10px; margin-bottom: 12px; text-align: center; color: #1f2937;">
                <div style="color: #111827; font-weight: 700; font-size: 22px; margin-bottom: 6px;">
                    ${convertedTime.format('h:mm:ss A')}
                </div>
                <div style="color: #374151; font-size: 13px; margin-bottom: 8px;">
                    ${convertedTime.format('dddd, MMMM D, YYYY')}
                </div>
                <div style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 20px; display: inline-block;">
                    <div style="color: #6b7280; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">
                        ${targetTimezoneObj ? targetTimezoneObj.displayName : targetTimezone}
                    </div>
                </div>
            </div>
            
            <div style="background: rgba(255,255,255,0.15); padding: 10px; border-radius: 8px; font-size: 12px;">
                <div style="color: #f1f5f9; font-weight: 600; margin-bottom: 2px;">Original Time:</div>
                <div style="color: #ffffff;">${parsedTime.format('h:mm:ss A')}</div>
                <div style="color: #e2e8f0; font-size: 11px; margin-top: 2px;">${displaySourceTimezoneObj ? displaySourceTimezoneObj.displayName : displaySourceTimezone}</div>
            </div>
        `;
        
        showResult(resultHtml, 'success');
        
    } catch (error) {
        showResult(`
            <div style="color: #f87171; font-weight: 600; margin-bottom: 8px;">❌ Error</div>
            <div style="font-size: 12px; opacity: 0.8;">${error.message}</div>
        `, 'error');
    }
}

/**
 * Parse date/time string in given timezone
 */
function parseDateTime(text, timezone) {
    // Handle time ranges - extract start time
    const timeRangeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\s*[-–—]\s*\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)/i);
    let timeText = text;
    
    if (timeRangeMatch) {
        // Use the start time from the range
        timeText = timeRangeMatch[1];
    }
    
    // Comprehensive date/time formats for natural language parsing
    const formats = [
        // Full date and time formats - US style (Month Day, Year)
        'MMMM D, YYYY h:mm A',                    // September 5, 2025 11:00 AM
        'MMMM D, YYYY h:mm a',                    // September 5, 2025 11:00 am
        'MMMM Do, YYYY h:mm A',                   // September 5th, 2025 11:00 AM
        'MMMM Do, YYYY h:mm a',                   // September 5th, 2025 11:00 am
        'MMMM Do, YYYY [at] h:mm A',              // September 5th, 2025 at 11:00 AM
        'MMMM Do, YYYY [at] h:mm a',              // September 5th, 2025 at 11:00 am
        'MMMM D YYYY h:mm A',                     // September 5 2025 11:00 AM
        'MMMM D YYYY h:mm a',                     // September 5 2025 11:00 am
        'MMMM Do YYYY h:mm A',                    // September 5th 2025 11:00 AM
        'MMMM Do YYYY h:mm a',                    // September 5th 2025 11:00 am
        'MMMM Do YYYY [at] h:mm A',               // September 5th 2025 at 11:00 AM
        'MMMM Do YYYY [at] h:mm a',               // September 5th 2025 at 11:00 am
        
        // Full date and time formats - UK/International style (Day Month Year)
        'D MMMM YYYY h:mm A',                     // 5 September 2025 11:00 AM
        'D MMMM YYYY h:mm a',                     // 5 September 2025 11:00 am
        'Do MMMM YYYY h:mm A',                    // 5th September 2025 11:00 AM
        'Do MMMM YYYY h:mm a',                    // 5th September 2025 11:00 am
        'Do MMMM YYYY [at] h:mm A',               // 5th September 2025 at 11:00 AM
        'Do MMMM YYYY [at] h:mm a',               // 5th September 2025 at 11:00 am
        'D MMMM, YYYY h:mm A',                    // 5 September, 2025 11:00 AM
        'D MMMM, YYYY h:mm a',                    // 5 September, 2025 11:00 am
        'Do MMMM, YYYY h:mm A',                   // 5th September, 2025 11:00 AM
        'Do MMMM, YYYY h:mm a',                   // 5th September, 2025 11:00 am
        'Do MMMM, YYYY [at] h:mm A',              // 5th September, 2025 at 11:00 AM
        'Do MMMM, YYYY [at] h:mm a',              // 5th September, 2025 at 11:00 am
        
        // Full date and time formats with day names
        'dddd, MMMM D, YYYY h:mm A',              // Friday, September 5, 2025 11:00 AM
        'dddd, MMMM D, YYYY h:mm a',              // Friday, September 5, 2025 11:00 am
        'dddd, MMMM Do, YYYY h:mm A',             // Friday, September 5th, 2025 11:00 AM
        'dddd, MMMM Do, YYYY h:mm a',             // Friday, September 5th, 2025 11:00 am
        'dddd, MMMM Do, YYYY [at] h:mm A',        // Friday, September 5th, 2025 at 11:00 AM
        'dddd, MMMM Do, YYYY [at] h:mm a',        // Friday, September 5th, 2025 at 11:00 am
        'dddd MMMM D, YYYY h:mm A',               // Friday September 5, 2025 11:00 AM
        'dddd MMMM D, YYYY h:mm a',               // Friday September 5, 2025 11:00 am
        'dddd MMMM Do, YYYY h:mm A',              // Friday September 5th, 2025 11:00 AM
        'dddd MMMM Do, YYYY h:mm a',              // Friday September 5th, 2025 11:00 am
        'dddd MMMM Do, YYYY [at] h:mm A',         // Friday September 5th, 2025 at 11:00 AM
        'dddd MMMM Do, YYYY [at] h:mm a',         // Friday September 5th, 2025 at 11:00 am
        'dddd, D MMMM YYYY h:mm A',               // Friday, 5 September 2025 11:00 AM
        'dddd, D MMMM YYYY h:mm a',               // Friday, 5 September 2025 11:00 am
        'dddd, Do MMMM YYYY h:mm A',              // Friday, 5th September 2025 11:00 AM
        'dddd, Do MMMM YYYY h:mm a',              // Friday, 5th September 2025 11:00 am
        'dddd, Do MMMM YYYY [at] h:mm A',         // Friday, 5th September 2025 at 11:00 AM
        'dddd, Do MMMM YYYY [at] h:mm a',         // Friday, 5th September 2025 at 11:00 am
        
        // Short month formats
        'MMM D, YYYY h:mm A',                     // Sep 5, 2025 11:00 AM
        'MMM D, YYYY h:mm a',                     // Sep 5, 2025 11:00 am
        'MMM Do, YYYY h:mm A',                    // Sep 5th, 2025 11:00 AM
        'MMM Do, YYYY h:mm a',                    // Sep 5th, 2025 11:00 am
        'MMM Do, YYYY [at] h:mm A',               // Sep 5th, 2025 at 11:00 AM
        'MMM Do, YYYY [at] h:mm a',               // Sep 5th, 2025 at 11:00 am
        'D MMM YYYY h:mm A',                      // 5 Sep 2025 11:00 AM
        'D MMM YYYY h:mm a',                      // 5 Sep 2025 11:00 am
        'Do MMM YYYY h:mm A',                     // 5th Sep 2025 11:00 AM
        'Do MMM YYYY h:mm a',                     // 5th Sep 2025 11:00 am
        'Do MMM YYYY [at] h:mm A',                // 5th Sep 2025 at 11:00 AM
        'Do MMM YYYY [at] h:mm a',                // 5th Sep 2025 at 11:00 am
        
        // Short formats with day names
        'dddd, MMM D, YYYY h:mm A',               // Friday, Sep 5, 2025 11:00 AM
        'dddd, MMM D, YYYY h:mm a',               // Friday, Sep 5, 2025 11:00 am
        'dddd, MMM Do, YYYY h:mm A',              // Friday, Sep 5th, 2025 11:00 AM
        'dddd, MMM Do, YYYY h:mm a',              // Friday, Sep 5th, 2025 11:00 am
        'dddd, MMM Do, YYYY [at] h:mm A',         // Friday, Sep 5th, 2025 at 11:00 AM
        'dddd, MMM Do, YYYY [at] h:mm a',         // Friday, Sep 5th, 2025 at 11:00 am
        'dddd, D MMM YYYY h:mm A',                // Friday, 5 Sep 2025 11:00 AM
        'dddd, D MMM YYYY h:mm a',                // Friday, 5 Sep 2025 11:00 am
        'dddd, Do MMM YYYY h:mm A',               // Friday, 5th Sep 2025 11:00 AM
        'dddd, Do MMM YYYY h:mm a',               // Friday, 5th Sep 2025 11:00 am
        'dddd, Do MMM YYYY [at] h:mm A',          // Friday, 5th Sep 2025 at 11:00 AM
        'dddd, Do MMM YYYY [at] h:mm a',          // Friday, 5th Sep 2025 at 11:00 am
        
        // Numeric date formats
        'MM/DD/YYYY h:mm A',                      // 09/05/2025 11:00 AM
        'MM/DD/YYYY h:mm a',                      // 09/05/2025 11:00 am
        'M/D/YYYY h:mm A',                        // 9/5/2025 11:00 AM
        'M/D/YYYY h:mm a',                        // 9/5/2025 11:00 am
        'DD/MM/YYYY h:mm A',                      // 05/09/2025 11:00 AM
        'DD/MM/YYYY h:mm a',                      // 05/09/2025 11:00 am
        'D/M/YYYY h:mm A',                        // 5/9/2025 11:00 AM
        'D/M/YYYY h:mm a',                        // 5/9/2025 11:00 am
        'YYYY-MM-DD h:mm A',                      // 2025-09-05 11:00 AM
        'YYYY-MM-DD h:mm a',                      // 2025-09-05 11:00 am
        'YYYY-MM-DD HH:mm',                       // 2025-09-05 11:00
        'YYYY/MM/DD h:mm A',                      // 2025/09/05 11:00 AM
        'YYYY/MM/DD h:mm a',                      // 2025/09/05 11:00 am
        'YYYY/MM/DD HH:mm',                       // 2025/09/05 11:00
        
        // Date-only formats (will default to current time)
        'MMMM D, YYYY',                           // September 5, 2025
        'MMMM Do, YYYY',                          // September 5th, 2025
        'D MMMM YYYY',                            // 5 September 2025
        'Do MMMM YYYY',                           // 5th September 2025
        'MMM D, YYYY',                            // Sep 5, 2025
        'MMM Do, YYYY',                           // Sep 5th, 2025
        'D MMM YYYY',                             // 5 Sep 2025
        'Do MMM YYYY',                            // 5th Sep 2025
        'MM/DD/YYYY',                             // 09/05/2025
        'M/D/YYYY',                               // 9/5/2025
        'DD/MM/YYYY',                             // 05/09/2025
        'D/M/YYYY',                               // 5/9/2025
        'YYYY-MM-DD',                             // 2025-09-05
        'YYYY/MM/DD',                             // 2025/09/05
        
        // Time-only formats (will use today's date)
        'h:mm A',                                 // 11:00 AM
        'h:mm a',                                 // 11:00 am
        'h:mm:ss A',                              // 11:00:30 AM
        'h:mm:ss a',                              // 11:00:30 am
        'HH:mm',                                  // 11:00
        'H:mm',                                   // 11:00
        'HH:mm:ss',                               // 11:00:30
        'H:mm:ss',                                // 11:00:30
        'ha',                                     // 11am
        'hA',                                     // 11AM
        'h a',                                    // 11 am
        'h A',                                    // 11 AM
        
        // Relative time formats
        '[today] [at] h:mm A',                    // today at 11:00 AM
        '[today] [at] h:mm a',                    // today at 11:00 am
        '[tomorrow] [at] h:mm A',                 // tomorrow at 11:00 AM
        '[tomorrow] [at] h:mm a',                 // tomorrow at 11:00 am
        '[yesterday] [at] h:mm A',                // yesterday at 11:00 AM
        '[yesterday] [at] h:mm a',                // yesterday at 11:00 am
        
        // Day-relative formats
        'dddd [at] h:mm A',                       // Friday at 11:00 AM
        'dddd [at] h:mm a',                       // Friday at 11:00 am
        '[next] dddd [at] h:mm A',                // next Friday at 11:00 AM
        '[next] dddd [at] h:mm a',                // next Friday at 11:00 am
        '[last] dddd [at] h:mm A',                // last Friday at 11:00 AM
        '[last] dddd [at] h:mm a',                // last Friday at 11:00 am
        '[this] dddd [at] h:mm A',                // this Friday at 11:00 AM
        '[this] dddd [at] h:mm a',                // this Friday at 11:00 am
        
        // Alternative "on" preposition formats
        '[on] MMMM Do, YYYY [at] h:mm A',         // on September 5th, 2025 at 11:00 AM
        '[on] MMMM Do, YYYY [at] h:mm a',         // on September 5th, 2025 at 11:00 am
        '[on] Do MMMM YYYY [at] h:mm A',          // on 5th September 2025 at 11:00 AM
        '[on] Do MMMM YYYY [at] h:mm a',          // on 5th September 2025 at 11:00 am
        '[on] dddd, MMMM Do, YYYY [at] h:mm A',   // on Friday, September 5th, 2025 at 11:00 AM
        '[on] dddd, MMMM Do, YYYY [at] h:mm a',   // on Friday, September 5th, 2025 at 11:00 am
        '[on] dddd [at] h:mm A',                  // on Friday at 11:00 AM
        '[on] dddd [at] h:mm a'                   // on Friday at 11:00 am
    ];
    
    let parsed;
    
    // First try to parse the full text
    if (timezone) {
        parsed = moment.tz(timeText, formats, timezone);
    } else {
        parsed = moment(timeText, formats);
    }
    
    // Check if input contains actual time information (enhanced patterns)
    const hasTime = /\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)|\d{1,2}:\d{2}/.test(timeText);
    
    // If no time is detected in the input, return invalid
    if (!hasTime) {
        return moment.invalid();
    }
    
    // If parsing failed and we have time-only, try adding today's date
    if (!parsed.isValid()) {
        // Extract just the time part (enhanced patterns)
        const timeOnlyMatch = timeText.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/i);
        if (timeOnlyMatch) {
            const timeOnly = timeOnlyMatch[0];
            const today = moment().format('YYYY-MM-DD');
            const fullDateTime = `${today} ${timeOnly}`;
            
            if (timezone) {
                parsed = moment.tz(fullDateTime, 'YYYY-MM-DD h:mm A', timezone);
                if (!parsed.isValid()) {
                    parsed = moment.tz(fullDateTime, 'YYYY-MM-DD HH:mm', timezone);
                }
                if (!parsed.isValid()) {
                    parsed = moment.tz(fullDateTime, 'YYYY-MM-DD ha', timezone);
                }
                if (!parsed.isValid()) {
                    parsed = moment.tz(fullDateTime, 'YYYY-MM-DD hA', timezone);
                }
            } else {
                parsed = moment(fullDateTime, 'YYYY-MM-DD h:mm A');
                if (!parsed.isValid()) {
                    parsed = moment(fullDateTime, 'YYYY-MM-DD HH:mm');
                }
                if (!parsed.isValid()) {
                    parsed = moment(fullDateTime, 'YYYY-MM-DD ha');
                }
                if (!parsed.isValid()) {
                    parsed = moment(fullDateTime, 'YYYY-MM-DD hA');
                }
            }
        }
    }
    
    // If still invalid, try more flexible parsing
    if (!parsed.isValid()) {
        if (timezone) {
            parsed = moment.tz(timeText, timezone);
        } else {
            parsed = moment(timeText);
        }
    }
    
    return parsed;
}

/**
 * Detect timezone from text (enhanced implementation)
 */
function detectTimezoneFromText(text) {
    const timezoneMap = {
        // Pacific Time variations
        'pacific time': 'America/Los_Angeles',
        'pacific standard time': 'America/Los_Angeles',
        'pacific daylight time': 'America/Los_Angeles',
        'pt': 'America/Los_Angeles',
        'pst': 'America/Los_Angeles',
        'pdt': 'America/Los_Angeles',
        
        // Eastern Time variations
        'eastern time': 'America/New_York',
        'eastern standard time': 'America/New_York',
        'eastern daylight time': 'America/New_York',
        'et': 'America/New_York',
        'est': 'America/New_York',
        'edt': 'America/New_York',
        
        // Central Time variations
        'central time': 'America/Chicago',
        'central standard time': 'America/Chicago',
        'central daylight time': 'America/Chicago',
        'ct': 'America/Chicago',
        'cst': 'America/Chicago',
        'cdt': 'America/Chicago',
        
        // Mountain Time variations
        'mountain time': 'America/Denver',
        'mountain standard time': 'America/Denver',
        'mountain daylight time': 'America/Denver',
        'mt': 'America/Denver',
        'mst': 'America/Denver',
        'mdt': 'America/Denver',
        
        // Other common timezones
        'utc': 'UTC',
        'gmt': 'UTC',
        'greenwich mean time': 'UTC',
        'coordinated universal time': 'UTC',
        
        'ist': 'Asia/Kolkata',
        'india standard time': 'Asia/Kolkata',
        
        'jst': 'Asia/Tokyo',
        'japan standard time': 'Asia/Tokyo',
        
        'cet': 'Europe/Paris',
        'central european time': 'Europe/Paris',
        
        'bst': 'Europe/London',
        'british summer time': 'Europe/London'
    };
    
    const lowerText = text.toLowerCase();
    
    // Check for timezone names and variations using word boundaries for better precision
    for (const [key, timezone] of Object.entries(timezoneMap)) {
        // Use word boundary regex for short timezone codes (2-3 characters)
        if (key.length <= 3) {
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            if (regex.test(lowerText)) {
                return timezone;
            }
        } else {
            // For longer timezone names, use simple includes
            if (lowerText.includes(key)) {
                return timezone;
            }
        }
    }
    
    // Check for UTC offset patterns like "UTC -07:00" or "UTC-7"
    const utcOffsetMatch = lowerText.match(/utc\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/);
    if (utcOffsetMatch) {
        const sign = utcOffsetMatch[1];
        const hours = parseInt(utcOffsetMatch[2]);
        const minutes = utcOffsetMatch[3] ? parseInt(utcOffsetMatch[3]) : 0;
        
        // Convert to total minutes
        let totalMinutes = hours * 60 + minutes;
        if (sign === '-') totalMinutes = -totalMinutes;
        
        // Map common UTC offsets to major timezones
        const offsetMap = {
            '-480': 'America/Los_Angeles',  // UTC-8 (PST)
            '-420': 'America/Los_Angeles',  // UTC-7 (PDT)
            '-360': 'America/Chicago',      // UTC-6 (CST)
            '-300': 'America/Chicago',      // UTC-5 (CDT) or America/New_York (EST)
            '-240': 'America/New_York',     // UTC-4 (EDT)
            '0': 'UTC',                     // UTC+0
            '60': 'Europe/Paris',           // UTC+1 (CET)
            '120': 'Europe/Paris',          // UTC+2 (CEST)
            '330': 'Asia/Kolkata',          // UTC+5:30 (IST)
            '480': 'Asia/Shanghai',         // UTC+8 (CST China)
            '540': 'Asia/Tokyo'             // UTC+9 (JST)
        };
        
        return offsetMap[totalMinutes.toString()];
    }
    
    // If no timezone detected, return null
    return null;
}

/**
 * Detect timezone from text (enhanced implementation) with legacy mapping
 */
function detectTimezoneFromTextMapped(text) {
    const detectedTimezone = detectTimezoneFromText(text);
    return detectedTimezone ? mapLegacyTimezone(detectedTimezone) : null;
}

/**
 * Strip timezone information from text to get clean time for parsing
 */
function stripTimezoneFromText(text) {
    // List of timezone patterns to remove (with word boundaries for precision)
    const timezonePatterns = [
        /\b(pacific time|pacific standard time|pacific daylight time)\b/gi,
        /\b(eastern time|eastern standard time|eastern daylight time)\b/gi,
        /\b(central time|central standard time|central daylight time)\b/gi,
        /\b(mountain time|mountain standard time|mountain daylight time)\b/gi,
        /\b(pst|pdt|est|edt|cst|cdt|mst|mdt|pt|et|ct|mt)\b/gi,
        /\b(utc|gmt|greenwich mean time|coordinated universal time)\b/gi,
        /\b(ist|india standard time)\b/gi,
        /\b(jst|japan standard time)\b/gi,
        /\b(cet|central european time)\b/gi,
        /\b(bst|british summer time)\b/gi,
        /utc\s*[+-]\s*\d{1,2}(?::\d{2})?/gi  // UTC offset patterns
    ];
    
    let cleanText = text;
    
    // Remove timezone patterns
    for (const pattern of timezonePatterns) {
        cleanText = cleanText.replace(pattern, '');
    }
    
    // Clean up extra whitespace and trim
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    
    return cleanText;
}

/**
 * Show conversion result
 */
function showResult(html, type) {
    elements.result.innerHTML = html;
    elements.result.className = `result show`;
    
    // Add error class for error styling
    if (type === 'error') {
        elements.result.className = `result show error`;
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
                
                // Auto-convert if text looks like a date/time
                if (looksLikeDateTime(result.selectedText)) {
                    // Small delay to ensure UI is ready and timezone preferences are loaded
                    setTimeout(() => {
                        handleConversion();
                    }, 200);
                } else {
                    // Show a helpful message if it doesn't look like date/time
                    showResult(`
                        <div style="color: #f59e0b; font-weight: 600; margin-bottom: 8px;">! No Time Information Detected</div>
                        <div style="font-size: 13px; line-height: 1.4;">
                            Selected text: "<strong>${result.selectedText}</strong>"<br><br>
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

/**
 * Check if text looks like a date/time
 */
function looksLikeDateTime(text) {
    if (!text || typeof text !== 'string') return false;
    
    const lowerText = text.toLowerCase();
    
    // Time patterns - must have actual time information
    const hasTime = /\d{1,2}(?::\d{2}(?::\d{2})?)?\s*(?:AM|PM|am|pm)|\d{1,2}:\d{2}/.test(text);
    
    // Date patterns
    const hasDate = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text);
    
    // Day patterns
    const hasDay = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.test(text);
    
    // Relative time indicators
    const hasRelativeTime = /\b(today|tomorrow|yesterday|tonight|morning|afternoon|evening|night|noon|midnight)\b/i.test(text);
    
    // Relative day indicators
    const hasRelativeDay = /\b(next|last|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|year)\b/i.test(text);
    
    // Timezone indicators
    const hasTimezone = /(pst|est|cst|mst|utc|gmt|pdt|edt|cdt|mdt|pt|et|ct|mt|pacific|eastern|central|mountain|atlantic|greenwich|india|japan|british|central european)\b/i.test(text);
    
    // Preposition indicators for time
    const hasTimePreposition = /\b(at|on|in|during|by|before|after|around|about|approximately)\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\b/i.test(text);
    
    // Must have time information OR clear date/time context
    if (!hasTime && !hasRelativeTime && !hasTimePreposition) {
        return false;
    }
    
    // Additional validation patterns
    const additionalPatterns = [
        hasTime,
        hasDate,
        hasDay,
        hasRelativeTime,
        hasRelativeDay,
        hasTimezone,
        hasTimePreposition
    ];
    
    // Must match at least one pattern
    return additionalPatterns.some(pattern => pattern);
}
