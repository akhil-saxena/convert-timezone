/**
 * integration.test.js — End-to-end tests for the full parse() pipeline.
 * Covers real-world format matrix, rejection cases, and bug regressions.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../src/chrono-bundle.js');

describe('Integration: full parse() pipeline', () => {

    describe('Real-world format matrix', () => {

        it('Google Calendar: "12 PM (GMT-5:00) Eastern [US & Canada]" → America/New_York, high confidence', () => {
            const result = parse('12 PM (GMT-5:00) Eastern [US & Canada]', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'America/New_York');
            assert.equal(result.confidence, 'high');
            // 12 PM with offset -300 (UTC-5) → UTC 17:00
            assert.equal(result.utcDate.getUTCHours(), 17);
            assert.equal(result.utcDate.getUTCMinutes(), 0);
        });

        it('University email: "Webinar at 2:00 PM EST" → America/New_York, high confidence', () => {
            const result = parse('Webinar at 2:00 PM EST', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'America/New_York');
            assert.equal(result.confidence, 'high');
        });

        it('Sports site: "Kickoff: 8 PM ET (Saturday, March 15)" → America/New_York', () => {
            const result = parse('Kickoff: 8 PM ET (Saturday, March 15)', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'America/New_York');
            assert.equal(result.confidence, 'high');
        });

        it('News article: "The ceremony begins at 7:00 PM CET on March 20th" → Europe/Paris', () => {
            const result = parse('The ceremony begins at 7:00 PM CET on March 20th', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'Europe/Paris');
            assert.equal(result.confidence, 'high');
        });

        it('Broadcast: "Live at 3pm BST / 10am ET" → Europe/London (first time taken)', () => {
            const result = parse('Live at 3pm BST / 10am ET', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'Europe/London');
            assert.equal(result.confidence, 'high');
        });

        it('24h range: "14:00 - 15:30 CET" → isRange=true, Europe/Paris', () => {
            const result = parse('14:00 - 15:30 CET', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.isRange, true);
            assert.ok(result.rangeEndUtcDate instanceof Date, 'rangeEndUtcDate should be a Date');
            assert.equal(result.sourceTimezone, 'Europe/Paris');
            assert.equal(result.confidence, 'high');
        });

        it('Bare time: "3:00 PM" → low confidence (no timezone info)', () => {
            const result = parse('3:00 PM', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.confidence, 'low');
        });

        it('Outlook invite: "Tuesday, Sep 2, 2025 12:00 PM" → low confidence (no tz in text)', () => {
            const result = parse('Tuesday, Sep 2, 2025 12:00 PM', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.confidence, 'low');
        });

        it('Long paragraph: extracts "3 PM EST" from surrounding text → America/New_York', () => {
            const text = 'Join us for the annual tech conference. The keynote starts at 3 PM EST and will cover exciting topics.';
            const result = parse(text, {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'America/New_York');
            assert.equal(result.confidence, 'high');
        });

        it('Date with slash: "3/15/2025 3pm ET" — slash is date separator, not time split → America/New_York', () => {
            const result = parse('3/15/2025 3pm ET', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'America/New_York');
            assert.equal(result.confidence, 'high');
        });

    });

    describe('Rejection cases', () => {

        it('"March 15, 2025" (date only) → null', () => {
            const result = parse('March 15, 2025', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('"hello world" → null', () => {
            const result = parse('hello world', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('"12" (bare number) → null', () => {
            const result = parse('12', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('"EST" (abbreviation only) → null', () => {
            const result = parse('EST', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('"The meeting is about timezone issues" → null', () => {
            const result = parse('The meeting is about timezone issues', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

    });

    describe('Bug regressions', () => {

        it('Bug #1: "12 PM (GMT-5:00) Eastern [US & Canada]" must NOT resolve to UTC', () => {
            const result = parse('12 PM (GMT-5:00) Eastern [US & Canada]', {
                userTimezone: 'UTC'
            });
            assert.ok(result, 'Should not return null');
            assert.notEqual(result.sourceTimezone, 'UTC',
                'sourceTimezone must not be UTC — it should resolve to America/New_York');
            assert.equal(result.sourceTimezone, 'America/New_York');
        });

        it('Bug #3: "3 PM CST" defaults to America/Chicago', () => {
            const result = parse('3 PM CST', { userTimezone: 'UTC' });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'America/Chicago');
        });

        it('Bug #8: bare number "12" is rejected (returns null)', () => {
            const result = parse('12', { userTimezone: 'UTC' });
            assert.equal(result, null, 'Bare number "12" should be rejected as not a time expression');
        });

    });

});

describe('Universal parser integration', () => {

    // Glued tokens
    describe('Glued tokens', () => {

        it('parses 3pmEST', () => {
            const r = parse('3pmEST', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'America/New_York');
            assert.equal(r.confidence, 'high');
        });

        it('parses 3pm est (lowercase)', () => {
            const r = parse('3pm est', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'America/New_York');
        });

        it('parses 2:30pmIST', () => {
            const r = parse('2:30pmIST', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'Asia/Kolkata');
        });

    });

    // AM/PM variants
    describe('AM/PM variants', () => {

        it('parses 3:00 p.m. EST', () => {
            const r = parse('3:00 p.m. EST', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'America/New_York');
        });

    });

    // International formats
    describe('International formats', () => {

        it('parses 15h00 CET (French)', () => {
            const r = parse('15h00 CET', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'Europe/Paris');
        });

        it('parses 15.30 Uhr MEZ (German)', () => {
            const r = parse('15.30 Uhr MEZ', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
        });

    });

    // City-based
    describe('City-based timezones', () => {

        it('parses "3pm in London"', () => {
            const r = parse('3pm in London', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'Europe/London');
            assert.equal(r.confidence, 'high');
        });

        it('parses "Meeting at 3pm Tokyo time"', () => {
            const r = parse('Meeting at 3pm Tokyo time', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'Asia/Tokyo');
        });

    });

    // Verbose timezone
    describe('Verbose timezone names', () => {

        it('parses "3:00 p.m. Eastern Standard Time"', () => {
            const r = parse('3:00 p.m. Eastern Standard Time', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'America/New_York');
        });

    });

    // Complex real-world
    describe('Complex real-world formats', () => {

        it('parses "3:00 PM (GMT-5:00) Eastern [US & Canada]"', () => {
            const r = parse('3:00 PM (GMT-5:00) Eastern [US & Canada]', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.confidence, 'high');
        });

    });

    // Confidence levels
    describe('Confidence levels', () => {

        it('returns low confidence for bare time', () => {
            const r = parse('3:00 PM', { userTimezone: 'America/New_York' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.confidence, 'low');
        });

        it('returns high confidence for CST (disambiguated via chrono offset)', () => {
            const r = parse('3pm CST', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'America/Chicago');
            // CST is ambiguous but chrono offset disambiguation upgrades to high
            assert.equal(r.confidence, 'high');
        });

    });

    // Rejections (should still work)
    describe('Rejections', () => {

        it('rejects bare number', () => {
            assert.equal(parse('12', { userTimezone: 'UTC' }), null);
        });

        it('rejects date-only', () => {
            assert.equal(parse('March 15, 2025', { userTimezone: 'UTC' }), null);
        });

        it('rejects gibberish', () => {
            assert.equal(parse('hello world', { userTimezone: 'UTC' }), null);
        });

    });

    // HTML sanitization end-to-end
    describe('HTML sanitization end-to-end', () => {

        it('parses time from HTML-heavy input', () => {
            const r = parse('<span>3:00&nbsp;PM</span> <br>EST', { userTimezone: 'UTC' });
            assert.ok(r, 'Should not return null');
            assert.equal(r.sourceTimezone, 'America/New_York');
        });

    });

});
