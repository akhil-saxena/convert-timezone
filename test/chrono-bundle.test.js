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
});
