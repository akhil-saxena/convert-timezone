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

describe('timezone-resolver expanded', () => {
    it('resolves city match at priority 3', () => {
        const result = resolveTimezone({
            signals: {
                offset: null, verboseName: null,
                cityMatch: 'london', cityZone: 'Europe/London',
                abbreviation: null, contextClues: []
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'America/New_York'
        });
        assert.equal(result.zone, 'Europe/London');
        assert.equal(result.confidence, 'high');
    });

    it('offset beats city match', () => {
        const result = resolveTimezone({
            signals: {
                offset: -300, verboseName: null,
                cityMatch: 'london', cityZone: 'Europe/London',
                abbreviation: null, contextClues: []
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
        });
        // Offset should win — it's priority 1
        assert.ok(result.zone !== 'Europe/London');
    });

    it('returns medium confidence for ambiguous abbreviation', () => {
        const result = resolveTimezone({
            signals: {
                offset: null, verboseName: null,
                cityMatch: null, cityZone: null,
                abbreviation: 'CST', contextClues: []
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
        });
        assert.equal(result.confidence, 'medium');
        assert.equal(result.zone, 'America/Chicago');
    });

    it('returns high confidence for unambiguous abbreviation', () => {
        const result = resolveTimezone({
            signals: {
                offset: null, verboseName: null,
                cityMatch: null, cityZone: null,
                abbreviation: 'JST', contextClues: []
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
        });
        assert.equal(result.confidence, 'high');
        assert.equal(result.zone, 'Asia/Tokyo');
    });

    it('returns low confidence when no signals', () => {
        const result = resolveTimezone({
            signals: {
                offset: null, verboseName: null,
                cityMatch: null, cityZone: null,
                abbreviation: null, contextClues: []
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'America/New_York'
        });
        assert.equal(result.confidence, 'low');
        assert.equal(result.zone, 'America/New_York');
    });

    it('SST defaults to Samoa', () => {
        const result = resolveTimezone({
            signals: {
                offset: null, verboseName: null,
                cityMatch: null, cityZone: null,
                abbreviation: 'SST', contextClues: []
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
        });
        assert.equal(result.zone, 'Pacific/Pago_Pago');
    });

    it('generates confidenceDetail string', () => {
        const result = resolveTimezone({
            signals: {
                offset: null, verboseName: null,
                cityMatch: null, cityZone: null,
                abbreviation: 'EST', contextClues: []
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
        });
        assert.ok(result.confidenceDetail.includes('EST'));
    });

    it('verbose name beats city match', () => {
        const result = resolveTimezone({
            signals: {
                offset: null, verboseName: 'India Standard Time',
                cityMatch: 'london', cityZone: 'Europe/London',
                abbreviation: null, contextClues: []
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
        });
        assert.equal(result.zone, 'Asia/Kolkata');
        assert.equal(result.confidence, 'high');
    });

    it('resolves ambiguous abbreviation with context clue', () => {
        const result = resolveTimezone({
            signals: {
                offset: null, verboseName: null,
                cityMatch: null, cityZone: null,
                abbreviation: 'CST', contextClues: ['Shanghai']
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'UTC'
        });
        assert.equal(result.zone, 'Asia/Shanghai');
        assert.equal(result.confidence, 'medium');
    });

    it('generates low confidence detail for fallback', () => {
        const result = resolveTimezone({
            signals: {
                offset: null, verboseName: null,
                cityMatch: null, cityZone: null,
                abbreviation: null, contextClues: []
            },
            parsedDate: new Date('2026-01-15'), userTimezone: 'America/New_York'
        });
        assert.ok(result.confidenceDetail.toLowerCase().includes('no timezone'));
    });
});
