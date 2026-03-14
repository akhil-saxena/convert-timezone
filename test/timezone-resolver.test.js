const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTimezone } = require('../src/timezone-resolver.js');

describe('resolveTimezone', () => {
    describe('explicit offset resolution', () => {
        it('resolves offset -300 in January to America/New_York (EST)', () => {
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: -300,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'Asia/Kolkata'
            });
            assert.equal(result, 'America/New_York');
        });

        it('resolves offset -300 in July to America/Chicago (CDT)', () => {
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: -300,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 6, 15)),
                userTimezone: 'Asia/Kolkata'
            });
            assert.equal(result, 'America/Chicago');
        });

        it('resolves offset +330 to Asia/Kolkata', () => {
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: 330,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'UTC'
            });
            assert.equal(result, 'Asia/Kolkata');
        });
    });

    describe('abbreviation disambiguation', () => {
        it('resolves CST to America/Chicago by default', () => {
            const result = resolveTimezone({
                abbreviation: 'CST',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'America/New_York'
            });
            assert.equal(result, 'America/Chicago');
        });

        it('resolves CST to Asia/Shanghai with China context clue', () => {
            const result = resolveTimezone({
                abbreviation: 'CST',
                offsetMinutes: null,
                contextClues: ['Shanghai'],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'America/New_York'
            });
            assert.equal(result, 'Asia/Shanghai');
        });

        it('resolves IST to Asia/Kolkata for user in India', () => {
            const result = resolveTimezone({
                abbreviation: 'IST',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'Asia/Kolkata'
            });
            assert.equal(result, 'Asia/Kolkata');
        });

        it('resolves IST to Asia/Jerusalem for user in Israel', () => {
            const result = resolveTimezone({
                abbreviation: 'IST',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'Asia/Jerusalem'
            });
            assert.equal(result, 'Asia/Jerusalem');
        });

        it('resolves EST to America/New_York', () => {
            const result = resolveTimezone({
                abbreviation: 'EST',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'UTC'
            });
            assert.equal(result, 'America/New_York');
        });

        it('resolves ET to America/New_York', () => {
            const result = resolveTimezone({
                abbreviation: 'ET',
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'UTC'
            });
            assert.equal(result, 'America/New_York');
        });
    });

    describe('context clue disambiguation', () => {
        it('uses "Eastern" context clue with offset -300', () => {
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: -300,
                contextClues: ['Eastern', 'US', 'Canada'],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'Asia/Kolkata'
            });
            assert.equal(result, 'America/New_York');
        });
    });

    describe('fallback behavior', () => {
        it('returns null when nothing can be resolved', () => {
            const result = resolveTimezone({
                abbreviation: null,
                offsetMinutes: null,
                contextClues: [],
                parsedDate: new Date(Date.UTC(2025, 0, 15)),
                userTimezone: 'America/New_York'
            });
            assert.equal(result, null);
        });
    });
});
