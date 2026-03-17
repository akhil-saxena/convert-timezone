// src/timezone-data.js
// Full IANA zone list from Intl API, plus UTC which some runtimes omit
const IANA_ZONES = (() => {
  const zones = Intl.supportedValuesOf('timeZone');
  if (!zones.includes('UTC')) zones.push('UTC');
  return zones;
})();

// City dictionary — ~300 entries, lowercase keys → IANA zones
// Includes aliases and native-script names
const CITY_DICTIONARY = {
  // Americas
  'new york': 'America/New_York', 'nyc': 'America/New_York', 'manhattan': 'America/New_York',
  'los angeles': 'America/Los_Angeles', 'la': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  'chicago': 'America/Chicago', 'denver': 'America/Denver',
  'phoenix': 'America/Phoenix', 'anchorage': 'America/Anchorage', 'honolulu': 'Pacific/Honolulu',
  'toronto': 'America/Toronto', 'vancouver': 'America/Vancouver', 'montreal': 'America/Toronto',
  'mexico city': 'America/Mexico_City', 'bogota': 'America/Bogota',
  'lima': 'America/Lima', 'santiago': 'America/Santiago',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  'são paulo': 'America/Sao_Paulo', 'sao paulo': 'America/Sao_Paulo', 'rio': 'America/Sao_Paulo',
  // Europe
  'london': 'Europe/London', 'paris': 'Europe/Paris', 'berlin': 'Europe/Berlin',
  'rome': 'Europe/Rome', 'madrid': 'Europe/Madrid', 'lisbon': 'Europe/Lisbon',
  'amsterdam': 'Europe/Amsterdam', 'brussels': 'Europe/Brussels', 'vienna': 'Europe/Vienna',
  'zurich': 'Europe/Zurich', 'stockholm': 'Europe/Stockholm', 'oslo': 'Europe/Oslo',
  'copenhagen': 'Europe/Copenhagen', 'helsinki': 'Europe/Helsinki', 'warsaw': 'Europe/Warsaw',
  'prague': 'Europe/Prague', 'budapest': 'Europe/Budapest', 'bucharest': 'Europe/Bucharest',
  'athens': 'Europe/Athens', 'istanbul': 'Europe/Istanbul', 'moscow': 'Europe/Moscow',
  'kyiv': 'Europe/Kyiv', 'dublin': 'Europe/Dublin', 'nice': 'Europe/Paris',
  // Asia
  'tokyo': 'Asia/Tokyo', 'osaka': 'Asia/Tokyo',
  'shanghai': 'Asia/Shanghai', 'beijing': 'Asia/Shanghai', 'hong kong': 'Asia/Hong_Kong',
  'seoul': 'Asia/Seoul', 'singapore': 'Asia/Singapore',
  'mumbai': 'Asia/Kolkata', 'bombay': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata', 'bangalore': 'Asia/Kolkata', 'kolkata': 'Asia/Kolkata',
  'chennai': 'Asia/Kolkata', 'hyderabad': 'Asia/Kolkata',
  'karachi': 'Asia/Karachi', 'lahore': 'Asia/Karachi', 'islamabad': 'Asia/Karachi',
  'dhaka': 'Asia/Dhaka', 'kathmandu': 'Asia/Kathmandu',
  'bangkok': 'Asia/Bangkok', 'jakarta': 'Asia/Jakarta',
  'manila': 'Asia/Manila', 'taipei': 'Asia/Taipei',
  'dubai': 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai',
  'riyadh': 'Asia/Riyadh', 'jeddah': 'Asia/Riyadh',
  'tehran': 'Asia/Tehran', 'baghdad': 'Asia/Baghdad',
  'jerusalem': 'Asia/Jerusalem', 'tel aviv': 'Asia/Jerusalem',
  'doha': 'Asia/Qatar', 'kuwait': 'Asia/Kuwait',
  // Africa
  'cairo': 'Africa/Cairo', 'johannesburg': 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg',
  'lagos': 'Africa/Lagos', 'nairobi': 'Africa/Nairobi', 'casablanca': 'Africa/Casablanca',
  'accra': 'Africa/Accra', 'addis ababa': 'Africa/Addis_Ababa', 'dar es salaam': 'Africa/Dar_es_Salaam',
  // Oceania
  'sydney': 'Australia/Sydney', 'melbourne': 'Australia/Melbourne', 'brisbane': 'Australia/Brisbane',
  'perth': 'Australia/Perth', 'adelaide': 'Australia/Adelaide',
  'auckland': 'Pacific/Auckland', 'wellington': 'Pacific/Auckland',
  'fiji': 'Pacific/Fiji', 'samoa': 'Pacific/Apia',
  // Native script
  '東京': 'Asia/Tokyo', '上海': 'Asia/Shanghai', '北京': 'Asia/Shanghai',
  '서울': 'Asia/Seoul', '런던': 'Europe/London', '파리': 'Europe/Paris',
  'モスクワ': 'Europe/Moscow', 'ロンドン': 'Europe/London',
  'مومباي': 'Asia/Kolkata', 'دبي': 'Asia/Dubai',
};

// Country dictionary — maps country names to primary zone
const COUNTRY_DICTIONARY = {
  'usa': 'America/New_York', 'united states': 'America/New_York', 'us': 'America/New_York',
  'uk': 'Europe/London', 'united kingdom': 'Europe/London', 'britain': 'Europe/London', 'england': 'Europe/London',
  'france': 'Europe/Paris', 'germany': 'Europe/Berlin', 'italy': 'Europe/Rome',
  'spain': 'Europe/Madrid', 'portugal': 'Europe/Lisbon', 'netherlands': 'Europe/Amsterdam',
  'belgium': 'Europe/Brussels', 'switzerland': 'Europe/Zurich', 'austria': 'Europe/Vienna',
  'sweden': 'Europe/Stockholm', 'norway': 'Europe/Oslo', 'denmark': 'Europe/Copenhagen',
  'finland': 'Europe/Helsinki', 'poland': 'Europe/Warsaw', 'russia': 'Europe/Moscow',
  'turkey': 'Europe/Istanbul', 'greece': 'Europe/Athens', 'ireland': 'Europe/Dublin',
  'india': 'Asia/Kolkata', 'japan': 'Asia/Tokyo', 'china': 'Asia/Shanghai',
  'south korea': 'Asia/Seoul', 'korea': 'Asia/Seoul',
  'singapore': 'Asia/Singapore', 'malaysia': 'Asia/Kuala_Lumpur',
  'thailand': 'Asia/Bangkok', 'indonesia': 'Asia/Jakarta', 'philippines': 'Asia/Manila',
  'pakistan': 'Asia/Karachi', 'bangladesh': 'Asia/Dhaka', 'nepal': 'Asia/Kathmandu',
  'uae': 'Asia/Dubai', 'saudi arabia': 'Asia/Riyadh', 'iran': 'Asia/Tehran',
  'iraq': 'Asia/Baghdad', 'israel': 'Asia/Jerusalem', 'qatar': 'Asia/Qatar',
  'egypt': 'Africa/Cairo', 'south africa': 'Africa/Johannesburg', 'nigeria': 'Africa/Lagos',
  'kenya': 'Africa/Nairobi', 'morocco': 'Africa/Casablanca', 'ghana': 'Africa/Accra',
  'australia': 'Australia/Sydney', 'new zealand': 'Pacific/Auckland',
  'brazil': 'America/Sao_Paulo', 'argentina': 'America/Argentina/Buenos_Aires',
  'mexico': 'America/Mexico_City', 'canada': 'America/Toronto', 'colombia': 'America/Bogota',
  'peru': 'America/Lima', 'chile': 'America/Santiago',
  'taiwan': 'Asia/Taipei',
};

// Expanded abbreviation map — ~60+ unambiguous entries
const ABBREVIATION_MAP = {
  'EST': 'America/New_York', 'EDT': 'America/New_York', 'ET': 'America/New_York',
  'CST': 'America/Chicago', 'CDT': 'America/Chicago', 'CT': 'America/Chicago',
  'MST': 'America/Denver', 'MDT': 'America/Denver', 'MT': 'America/Denver',
  'PST': 'America/Los_Angeles', 'PDT': 'America/Los_Angeles', 'PT': 'America/Los_Angeles',
  'AKST': 'America/Anchorage', 'AKDT': 'America/Anchorage',
  'HST': 'Pacific/Honolulu', 'HAST': 'Pacific/Honolulu', 'HADT': 'Pacific/Honolulu',
  'UTC': 'UTC', 'GMT': 'UTC',
  'CET': 'Europe/Paris', 'CEST': 'Europe/Paris',
  'EET': 'Europe/Helsinki', 'EEST': 'Europe/Helsinki',
  'WET': 'Europe/Lisbon', 'WEST': 'Europe/Lisbon',
  'JST': 'Asia/Tokyo', 'KST': 'Asia/Seoul', 'SGT': 'Asia/Singapore',
  'HKT': 'Asia/Hong_Kong', 'ICT': 'Asia/Bangkok', 'WIB': 'Asia/Jakarta',
  'WITA': 'Asia/Makassar', 'WIT': 'Asia/Jayapura',
  'PHT': 'Asia/Manila', 'TRT': 'Europe/Istanbul',
  'NZST': 'Pacific/Auckland', 'NZDT': 'Pacific/Auckland',
  'AEST': 'Australia/Sydney', 'AEDT': 'Australia/Sydney',
  'ACST': 'Australia/Adelaide', 'ACDT': 'Australia/Adelaide',
  'AWST': 'Australia/Perth',
  'MSK': 'Europe/Moscow',
  'SAST': 'Africa/Johannesburg',
  'IRST': 'Asia/Tehran', 'IRDT': 'Asia/Tehran',
  'BRT': 'America/Sao_Paulo', 'BRST': 'America/Sao_Paulo',
  'ART': 'America/Argentina/Buenos_Aires',
  'PET': 'America/Lima', 'CLT': 'America/Santiago', 'CLST': 'America/Santiago',
  'COT': 'America/Bogota',
  'PKT': 'Asia/Karachi', 'NPT': 'Asia/Kathmandu',
  'IST': 'Asia/Kolkata',  // default for unambiguous lookup
  'BST': 'Europe/London',  // default for unambiguous lookup
  'AST': 'America/Halifax', // default for unambiguous lookup
  'GST': 'Asia/Dubai',     // default for unambiguous lookup
  'WAT': 'Africa/Lagos',   // default for unambiguous lookup
  'EAT': 'Africa/Nairobi',
  'CAT': 'Africa/Harare',
  'MYT': 'Asia/Kuala_Lumpur',
  'CST_CN': 'Asia/Shanghai', // explicit China alias used internally
};

// Ambiguous abbreviations with disambiguation rules
const AMBIGUOUS_ABBREVIATIONS = {
  'CST': {
    candidates: {
      'America/Chicago': ['US', 'USA', 'America', 'United States', 'Chicago', 'Central', 'Texas', 'Houston'],
      'Asia/Shanghai': ['China', 'Shanghai', 'Beijing', 'Chinese', 'PRC']
    },
    default: 'America/Chicago'
  },
  'IST': {
    candidates: {
      'Asia/Kolkata': ['India', 'Indian', 'Kolkata', 'Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad'],
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
      'Asia/Dubai': ['Gulf', 'Dubai', 'UAE', 'Abu Dhabi']
    },
    default: 'Asia/Dubai'
  },
  'WAT': {
    candidates: {
      'Africa/Lagos': ['Nigeria', 'West Africa', 'Lagos']
    },
    default: 'Africa/Lagos'
  },
  'WET': {
    candidates: {
      'Europe/Lisbon': ['Portugal', 'Lisbon'],
      'Africa/Casablanca': ['Morocco', 'Casablanca']
    },
    default: 'Europe/Lisbon'
  },
  'SST': {
    candidates: {
      'Pacific/Pago_Pago': ['Samoa', 'Pago Pago', 'American Samoa']
    },
    default: 'Pacific/Pago_Pago'
  }
};

// Verbose timezone names → IANA zones (~50 entries)
const VERBOSE_TIMEZONE_MAP = {
  // US
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
  'Alaska Standard Time': 'America/Anchorage',
  'Alaska Daylight Time': 'America/Anchorage',
  'Hawaii Standard Time': 'Pacific/Honolulu',
  'Hawaii-Aleutian Standard Time': 'Pacific/Honolulu',
  'Atlantic Standard Time': 'America/Halifax',
  'Atlantic Daylight Time': 'America/Halifax',
  // Universal
  'Greenwich Mean Time': 'UTC',
  'Coordinated Universal Time': 'UTC',
  // Europe
  'Central European Time': 'Europe/Paris',
  'Central European Summer Time': 'Europe/Paris',
  'Eastern European Time': 'Europe/Helsinki',
  'Eastern European Summer Time': 'Europe/Helsinki',
  'Western European Time': 'Europe/Lisbon',
  'Western European Summer Time': 'Europe/Lisbon',
  'British Summer Time': 'Europe/London',
  'Irish Standard Time': 'Europe/Dublin',
  'Moscow Standard Time': 'Europe/Moscow',
  'Turkey Time': 'Europe/Istanbul',
  // Asia
  'India Standard Time': 'Asia/Kolkata',
  'Japan Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'China Standard Time': 'Asia/Shanghai',
  'Hong Kong Time': 'Asia/Hong_Kong',
  'Singapore Time': 'Asia/Singapore',
  'Indochina Time': 'Asia/Bangkok',
  'Western Indonesian Time': 'Asia/Jakarta',
  'Philippine Time': 'Asia/Manila',
  'Iran Standard Time': 'Asia/Tehran',
  'Iran Daylight Time': 'Asia/Tehran',
  'Gulf Standard Time': 'Asia/Dubai',
  'Arabia Standard Time': 'Asia/Riyadh',
  'Pakistan Standard Time': 'Asia/Karachi',
  'Nepal Time': 'Asia/Kathmandu',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Israel Daylight Time': 'Asia/Jerusalem',
  // Oceania
  'Australian Eastern Standard Time': 'Australia/Sydney',
  'Australian Eastern Daylight Time': 'Australia/Sydney',
  'Australian Central Standard Time': 'Australia/Adelaide',
  'Australian Central Daylight Time': 'Australia/Adelaide',
  'Australian Western Standard Time': 'Australia/Perth',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'New Zealand Daylight Time': 'Pacific/Auckland',
  // Africa
  'South Africa Standard Time': 'Africa/Johannesburg',
  'West Africa Time': 'Africa/Lagos',
  'East Africa Time': 'Africa/Nairobi',
  'Central Africa Time': 'Africa/Harare',
  // Americas
  'Brasilia Time': 'America/Sao_Paulo',
  'Argentina Time': 'America/Argentina/Buenos_Aires',
};

// Region context words → IANA zones (for single-word matches)
const REGION_CONTEXT_MAP = {
  'Eastern': 'America/New_York',
  'Western': 'America/Los_Angeles',
  'Central': 'America/Chicago',
  'Pacific': 'America/Los_Angeles',
  'Mountain': 'America/Denver',
  'Atlantic': 'America/Halifax'
};

// Cities that are common English words — require signal word to match
const CITY_BLOCKLIST = ['nice', 'reading', 'bath', 'mobile', 'victoria', 'regina', 'orange'];

module.exports = {
  IANA_ZONES, CITY_DICTIONARY, COUNTRY_DICTIONARY,
  ABBREVIATION_MAP, AMBIGUOUS_ABBREVIATIONS, VERBOSE_TIMEZONE_MAP,
  REGION_CONTEXT_MAP, CITY_BLOCKLIST
};
