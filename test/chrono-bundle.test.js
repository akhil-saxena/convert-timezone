const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../src/chrono-bundle.js');

describe('TimeShiftParser.parse', () => {
    describe('Bug #1: GMT offset pattern', () => {
        it('parses "12 PM (GMT-5:00) Eastern [US & Canada]" as New York', () => {
            const result = parse('12 PM (GMT-5:00) Eastern [US & Canada]', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result, 'Should not return null');
            assert.equal(result.sourceTimezone, 'America/New_York');
            assert.equal(result.confidence, 'high');
            assert.equal(result.utcDate.getUTCHours(), 17); // 12 PM EST = 5 PM UTC
        });
    });

    describe('Bug #7: parenthetical offset', () => {
        it('parses "3:00 PM (UTC+01:00)" correctly', () => {
            const result = parse('3:00 PM (UTC+01:00)', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.utcDate.getUTCHours(), 14); // 3 PM CET = 2 PM UTC
            assert.equal(result.confidence, 'high');
        });
    });

    describe('common formats', () => {
        it('parses "Webinar at 2:00 PM EST"', () => {
            const result = parse('Webinar at 2:00 PM EST', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.sourceTimezone, 'America/New_York');
            assert.equal(result.confidence, 'high');
        });

        it('parses "The ceremony begins at 7:00 PM CET on March 20th"', () => {
            const result = parse('The ceremony begins at 7:00 PM CET on March 20th', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.sourceTimezone, 'Europe/Paris');
            assert.equal(result.confidence, 'high');
        });

        it('parses "3:00 PM" with low confidence (no timezone)', () => {
            const result = parse('3:00 PM', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.confidence, 'low');
        });

        it('parses slash-separated "3pm BST / 10am ET" — takes first', () => {
            const result = parse('3pm BST / 10am ET', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.sourceTimezone, 'Europe/London');
        });
    });

    describe('time ranges', () => {
        it('parses "2:00 PM - 3:30 PM EST" as a range', () => {
            const result = parse('2:00 PM - 3:30 PM EST', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.isRange, true);
            assert.ok(result.rangeEndUtcDate);
            assert.equal(result.sourceTimezone, 'America/New_York');
        });

        it('parses "2pm to 4pm ET" with "to" separator', () => {
            const result = parse('2pm to 4pm ET', {
                userTimezone: 'Asia/Kolkata'
            });
            assert.ok(result);
            assert.equal(result.isRange, true);
        });
    });

    describe('rejection cases', () => {
        it('returns null for gibberish', () => {
            const result = parse('hello world', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('returns null for bare number "12"', () => {
            const result = parse('12', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('returns null for date-only "March 15, 2025"', () => {
            const result = parse('March 15, 2025', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });

        it('returns null for abbreviation only "EST"', () => {
            const result = parse('EST', { userTimezone: 'UTC' });
            assert.equal(result, null);
        });
    });

    describe('locale detection and routing', () => {
        it('detects German locale from "Uhr"', () => {
            const r = parse('15.30 Uhr MEZ', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.detectedLocale, 'de');
        });

        it('detects French locale from "15h00"', () => {
            const r = parse('15h00 CET', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.detectedLocale, 'fr');
        });

        it('detects Spanish locale', () => {
            const r = parse('lunes a las 3 de la tarde', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.detectedLocale, 'es');
        });

        it('defaults to English locale', () => {
            const r = parse('3:00 PM EST', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.detectedLocale, 'en');
        });

        it('falls back to English when locale parser fails', () => {
            // German word but English time format — de parser may fail on "3:00 PM"
            // but en fallback should succeed
            const r = parse('Montag 3:00 PM EST', { userTimezone: 'UTC' });
            assert.ok(r);
            // Should still parse even if de parser fails on "3:00 PM"
        });

        it('returns confidenceDetail in result', () => {
            const r = parse('3:00 PM EST', { userTimezone: 'UTC' });
            assert.ok(r.confidenceDetail);
            assert.ok(r.confidenceDetail.includes('EST'));
        });

        it('returns cityMatch in result', () => {
            const r = parse('3 PM in London', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.cityMatch, 'london');
        });

        it('returns 3-level confidence', () => {
            const high = parse('3:00 PM EST', { userTimezone: 'UTC' });
            assert.equal(high.confidence, 'high');

            const low = parse('3:00 PM', { userTimezone: 'UTC' });
            assert.equal(low.confidence, 'low');
        });

        it('handles glued tokens after tokenizer', () => {
            const r = parse('3pmEST', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.sourceTimezone, 'America/New_York');
        });

        it('handles lowercase abbreviations', () => {
            const r = parse('3pm est', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.sourceTimezone, 'America/New_York');
        });

        it('truncates input over 500 chars', () => {
            const long = 'x '.repeat(300) + '3:00 PM EST';
            const r = parse(long, { userTimezone: 'UTC' });
            // May or may not parse depending on truncation — should not crash
            assert.ok(r === null || typeof r === 'object');
        });
    });

    describe('new API contract fields', () => {
        it('returns detectedLocale field', () => {
            const r = parse('3:00 PM EST', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(typeof r.detectedLocale, 'string');
        });

        it('returns cityMatch as null when no city detected', () => {
            const r = parse('3:00 PM EST', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.cityMatch, null);
        });

        it('returns cityMatch when city detected', () => {
            const r = parse('3 PM in Tokyo', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.cityMatch, 'tokyo');
            assert.equal(r.sourceTimezone, 'Asia/Tokyo');
        });

        it('returns confidenceDetail as a string', () => {
            const r = parse('3:00 PM', { userTimezone: 'America/New_York' });
            assert.ok(r);
            assert.equal(typeof r.confidenceDetail, 'string');
            assert.ok(r.confidenceDetail.length > 0);
        });

        it('returns all required fields', () => {
            const r = parse('3:00 PM EST', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.ok(r.utcDate instanceof Date);
            assert.equal(typeof r.sourceTimezone, 'string');
            assert.ok(['high', 'medium', 'low'].includes(r.confidence));
            assert.equal(typeof r.confidenceDetail, 'string');
            assert.equal(typeof r.isRange, 'boolean');
            assert.equal(typeof r.hasExplicitDate, 'boolean');
            assert.ok(r.wallClock);
            assert.equal(typeof r.detectedLocale, 'string');
        });
    });

    describe('6-stage pipeline end-to-end', () => {
        it('sanitizes HTML before parsing', () => {
            const r = parse('<span>3:00&nbsp;PM</span> <br>EST', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.sourceTimezone, 'America/New_York');
        });

        it('handles verbose timezone names', () => {
            const r = parse('3:00 PM Eastern Standard Time', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.sourceTimezone, 'America/New_York');
            assert.equal(r.confidence, 'high');
        });

        it('handles city-based timezone with "in" pattern', () => {
            const r = parse('3pm in London', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.sourceTimezone, 'Europe/London');
            assert.equal(r.confidence, 'high');
            assert.equal(r.cityMatch, 'london');
        });

        it('handles city-based timezone with "time" pattern', () => {
            const r = parse('Meeting at 3pm Tokyo time', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.sourceTimezone, 'Asia/Tokyo');
            assert.equal(r.cityMatch, 'tokyo');
        });

        it('handles Japanese locale text', () => {
            const r = parse('午後3時', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.detectedLocale, 'ja');
            assert.equal(r.wallClock.hour, 15);
        });

        it('handles Chinese locale text', () => {
            const r = parse('下午3點', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.detectedLocale, 'zh');
            assert.equal(r.wallClock.hour, 15);
        });

        it('handles AM/PM dotted variants via tokenizer', () => {
            const r = parse('3:00 p.m. EST', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.sourceTimezone, 'America/New_York');
        });

        it('handles complex real-world text with offset + verbose + brackets', () => {
            const r = parse('3:00 PM (GMT-5:00) Eastern [US & Canada]', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.confidence, 'high');
            assert.equal(r.explicitOffset, -300);
        });

        it('handles range with new API fields', () => {
            const r = parse('2:00 PM - 3:30 PM EST', { userTimezone: 'UTC' });
            assert.ok(r);
            assert.equal(r.isRange, true);
            assert.ok(r.rangeEndUtcDate);
            assert.ok(r.rangeEndWallClock);
            assert.equal(typeof r.detectedLocale, 'string');
        });
    });
});
