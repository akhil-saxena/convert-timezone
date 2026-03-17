const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { constructDateInTimezone } = require('../src/date-constructor.js');

describe('constructDateInTimezone', () => {
    it('constructs 3 PM Eastern (EST) as correct UTC', () => {
        // Jan 15, 2025 3:00 PM in America/New_York (EST = UTC-5)
        // Expected UTC: Jan 15, 2025 8:00 PM (20:00)
        const result = constructDateInTimezone(2025, 0, 15, 15, 0, 0, 'America/New_York');
        assert.equal(result.getUTCHours(), 20);
        assert.equal(result.getUTCMinutes(), 0);
        assert.equal(result.getUTCDate(), 15);
        assert.equal(result.getUTCMonth(), 0);
    });

    it('constructs 3 PM Eastern (EDT) as correct UTC', () => {
        // Jul 15, 2025 3:00 PM in America/New_York (EDT = UTC-4)
        // Expected UTC: Jul 15, 2025 7:00 PM (19:00)
        const result = constructDateInTimezone(2025, 6, 15, 15, 0, 0, 'America/New_York');
        assert.equal(result.getUTCHours(), 19);
        assert.equal(result.getUTCMinutes(), 0);
    });

    it('constructs midnight correctly', () => {
        // Jan 1, 2025 0:00 AM in Asia/Kolkata (IST = UTC+5:30)
        // Expected UTC: Dec 31, 2024 6:30 PM (18:30)
        const result = constructDateInTimezone(2025, 0, 1, 0, 0, 0, 'Asia/Kolkata');
        assert.equal(result.getUTCHours(), 18);
        assert.equal(result.getUTCMinutes(), 30);
        assert.equal(result.getUTCDate(), 31);
        assert.equal(result.getUTCMonth(), 11); // December
        assert.equal(result.getUTCFullYear(), 2024);
    });

    it('handles half-hour offset (IST +5:30)', () => {
        // Jan 15, 2025 10:00 AM in Asia/Kolkata (IST = UTC+5:30)
        // Expected UTC: Jan 15, 2025 4:30 AM
        const result = constructDateInTimezone(2025, 0, 15, 10, 0, 0, 'Asia/Kolkata');
        assert.equal(result.getUTCHours(), 4);
        assert.equal(result.getUTCMinutes(), 30);
    });

    it('handles DST spring-forward gap (snaps forward)', () => {
        // Mar 9, 2025 2:30 AM in America/New_York does NOT exist
        // Clocks jump from 2:00 AM to 3:00 AM
        // Should snap forward to 3:00 AM EDT (UTC-4) = 7:00 AM UTC
        const result = constructDateInTimezone(2025, 2, 9, 2, 30, 0, 'America/New_York');
        assert.ok(result instanceof Date);
        assert.ok(!isNaN(result.getTime()));
        const nyFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric', minute: 'numeric',
            hourCycle: 'h23'
        });
        const parts = nyFormatter.formatToParts(result);
        const hour = parseInt(parts.find(p => p.type === 'hour').value);
        assert.ok(hour >= 3, `Expected hour >= 3 after spring-forward, got ${hour}`);
    });

    it('handles UTC timezone', () => {
        // Jan 15, 2025 10:00 AM UTC
        const result = constructDateInTimezone(2025, 0, 15, 10, 0, 0, 'UTC');
        assert.equal(result.getUTCHours(), 10);
        assert.equal(result.getUTCMinutes(), 0);
    });

    it('handles negative offset (US Pacific PST)', () => {
        // Jan 15, 2025 10:00 AM in America/Los_Angeles (PST = UTC-8)
        // Expected UTC: Jan 15, 2025 6:00 PM (18:00)
        const result = constructDateInTimezone(2025, 0, 15, 10, 0, 0, 'America/Los_Angeles');
        assert.equal(result.getUTCHours(), 18);
        assert.equal(result.getUTCMinutes(), 0);
    });

    it('handles large positive offset (NZDT +13)', () => {
        // Jan 15, 2025 10:00 AM in Pacific/Auckland (NZDT = UTC+13)
        // Expected UTC: Jan 14, 2025 9:00 PM (21:00) — previous day
        const result = constructDateInTimezone(2025, 0, 15, 10, 0, 0, 'Pacific/Auckland');
        assert.equal(result.getUTCDate(), 14);
        assert.equal(result.getUTCHours(), 21);
    });
});
