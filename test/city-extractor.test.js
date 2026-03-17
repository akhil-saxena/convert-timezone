// test/city-extractor.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { extract } = require('../src/city-extractor.js');

describe('city-extractor', () => {
  // GMT/UTC offset extraction
  it('extracts parenthetical GMT offset', () => {
    const r = extract('3:00 PM (GMT-5:00) Eastern');
    assert.equal(r.signals.offset, -300);
  });

  it('extracts bare UTC offset', () => {
    const r = extract('3:00 PM UTC+5:30');
    assert.equal(r.signals.offset, 330);
  });

  it('extracts bare GMT offset without minutes', () => {
    const r = extract('12 PM GMT-5');
    assert.equal(r.signals.offset, -300);
  });

  // Verbose timezone names
  it('extracts verbose timezone name', () => {
    const r = extract('3:00 PM Eastern Standard Time');
    assert.equal(r.signals.verboseName, 'Eastern Standard Time');
  });

  it('extracts longest verbose match first', () => {
    const r = extract('3:00 PM Central European Summer Time');
    assert.equal(r.signals.verboseName, 'Central European Summer Time');
  });

  // City patterns
  it('matches "{time} in {city}"', () => {
    const r = extract('3 PM in London');
    assert.equal(r.signals.cityMatch, 'london');
    assert.equal(r.signals.cityZone, 'Europe/London');
  });

  it('matches "{time} {city} time"', () => {
    const r = extract('3 PM Tokyo time');
    assert.equal(r.signals.cityMatch, 'tokyo');
    assert.equal(r.signals.cityZone, 'Asia/Tokyo');
  });

  it('matches "{city} {time}"', () => {
    const r = extract('London 3 PM');
    assert.equal(r.signals.cityMatch, 'london');
  });

  it('matches multi-word city', () => {
    const r = extract('3 PM in New York');
    assert.equal(r.signals.cityZone, 'America/New_York');
  });

  it('matches country name', () => {
    const r = extract('3 PM India time');
    assert.equal(r.signals.cityZone, 'Asia/Kolkata');
  });

  it('matches native script city', () => {
    const r = extract('3 PM \u6771\u4eac');
    assert.equal(r.signals.cityZone, 'Asia/Tokyo');
  });

  // False positive protection
  it('does NOT match blocklisted city without signal word', () => {
    const r = extract('Reading 3 PM');
    assert.equal(r.signals.cityMatch, null);
  });

  it('does NOT match blocklisted city mid-sentence', () => {
    const r = extract('3pm in Nice weather');
    assert.equal(r.signals.cityMatch, null);
  });

  it('DOES match blocklisted city with "in" at end of string', () => {
    const r = extract('3 PM in Nice');
    assert.equal(r.signals.cityZone, 'Europe/Paris');  // Nice -> Europe/Paris
  });

  // Abbreviation extraction
  it('extracts timezone abbreviation', () => {
    const r = extract('3:00 PM EST');
    assert.equal(r.signals.abbreviation, 'EST');
  });

  it('extracts abbreviation from normalized glued text', () => {
    // Input has already been through Phase 2A: "3pmEST" -> "3 PM EST"
    const r = extract('3 PM EST');
    assert.equal(r.signals.abbreviation, 'EST');
  });

  // Bracket context clues
  it('extracts bracket context clues', () => {
    const r = extract('3:00 PM [US & Canada]');
    assert.deepEqual(r.signals.contextClues, ['US', 'Canada']);
  });

  // Text stripping
  it('strips timezone tokens from cleanedText', () => {
    const r = extract('3:00 PM EST');
    assert.ok(!r.cleanedText.includes('EST'));
    assert.ok(r.cleanedText.includes('3:00 PM'));
  });

  it('strips city from cleanedText', () => {
    const r = extract('3 PM in London');
    assert.ok(!r.cleanedText.includes('London'));
    assert.ok(!r.cleanedText.includes(' in '));
  });
});
