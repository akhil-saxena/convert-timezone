// test/timezone-data.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  IANA_ZONES, CITY_DICTIONARY, COUNTRY_DICTIONARY,
  ABBREVIATION_MAP, AMBIGUOUS_ABBREVIATIONS, VERBOSE_TIMEZONE_MAP,
  CITY_BLOCKLIST
} = require('../src/timezone-data.js');

describe('timezone-data', () => {
  it('IANA_ZONES contains at least 400 zones', () => {
    assert.ok(IANA_ZONES.length >= 400);
  });

  it('IANA_ZONES contains key zones', () => {
    for (const zone of ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'UTC']) {
      assert.ok(IANA_ZONES.includes(zone), `Missing ${zone}`);
    }
  });

  it('CITY_DICTIONARY maps lowercase city names to IANA zones', () => {
    assert.equal(CITY_DICTIONARY['london'], 'Europe/London');
    assert.equal(CITY_DICTIONARY['new york'], 'America/New_York');
    assert.equal(CITY_DICTIONARY['nyc'], 'America/New_York');
    assert.equal(CITY_DICTIONARY['tokyo'], 'Asia/Tokyo');
    assert.equal(CITY_DICTIONARY['mumbai'], 'Asia/Kolkata');
    assert.equal(CITY_DICTIONARY['bombay'], 'Asia/Kolkata');
  });

  it('CITY_DICTIONARY includes native-script entries', () => {
    assert.equal(CITY_DICTIONARY['東京'], 'Asia/Tokyo');
    assert.equal(CITY_DICTIONARY['런던'], 'Europe/London');
  });

  it('COUNTRY_DICTIONARY maps country names to primary zones', () => {
    assert.equal(COUNTRY_DICTIONARY['india'], 'Asia/Kolkata');
    assert.equal(COUNTRY_DICTIONARY['japan'], 'Asia/Tokyo');
    assert.equal(COUNTRY_DICTIONARY['germany'], 'Europe/Berlin');
  });

  it('ABBREVIATION_MAP has at least 60 entries', () => {
    assert.ok(Object.keys(ABBREVIATION_MAP).length >= 60);
  });

  it('ABBREVIATION_MAP includes new abbreviations', () => {
    assert.equal(ABBREVIATION_MAP['PKT'], 'Asia/Karachi');
    assert.equal(ABBREVIATION_MAP['NPT'], 'Asia/Kathmandu');
    assert.equal(ABBREVIATION_MAP['SGT'], 'Asia/Singapore');
  });

  it('AMBIGUOUS_ABBREVIATIONS has 8 entries with defaults and candidates', () => {
    assert.ok(Object.keys(AMBIGUOUS_ABBREVIATIONS).length >= 8);
    for (const [abbr, config] of Object.entries(AMBIGUOUS_ABBREVIATIONS)) {
      assert.ok(config.default, `${abbr} missing default`);
      assert.ok(config.candidates, `${abbr} missing candidates`);
    }
  });

  it('SST defaults to Samoa, not Singapore', () => {
    assert.equal(AMBIGUOUS_ABBREVIATIONS['SST'].default, 'Pacific/Pago_Pago');
  });

  it('VERBOSE_TIMEZONE_MAP has at least 50 entries', () => {
    assert.ok(Object.keys(VERBOSE_TIMEZONE_MAP).length >= 50);
  });

  it('CITY_BLOCKLIST contains common English words that are city names', () => {
    for (const word of ['nice', 'reading', 'bath', 'mobile', 'victoria', 'orange']) {
      assert.ok(CITY_BLOCKLIST.includes(word), `Missing blocklist word: ${word}`);
    }
  });
});
