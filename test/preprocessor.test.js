const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { preprocess } = require('../src/preprocessor.js');

describe('preprocess', () => {
    describe('parenthetical offset extraction', () => {
        it('extracts (GMT-5:00) offset', () => {
            const result = preprocess('12 PM (GMT-5:00) Eastern [US & Canada]');
            assert.equal(result.extractedOffset, -300);
            assert.ok(!result.cleanedText.includes('(GMT-5:00)'));
        });

        it('extracts (UTC+01:00) offset', () => {
            const result = preprocess('3:00 PM (UTC+01:00)');
            assert.equal(result.extractedOffset, 60);
            assert.ok(!result.cleanedText.includes('(UTC+01:00)'));
        });

        it('extracts (GMT+5:30) offset', () => {
            const result = preprocess('10 AM (GMT+5:30)');
            assert.equal(result.extractedOffset, 330);
        });

        it('returns null offset when none found', () => {
            const result = preprocess('3:00 PM EST');
            assert.equal(result.extractedOffset, null);
        });
    });

    describe('bracket context clue extraction', () => {
        it('extracts context clues from [US & Canada]', () => {
            const result = preprocess('12 PM (GMT-5:00) Eastern [US & Canada]');
            assert.ok(result.contextClues.includes('US'));
            assert.ok(result.contextClues.includes('Canada'));
            assert.ok(!result.cleanedText.includes('['));
            assert.ok(!result.cleanedText.includes(']'));
        });

        it('handles no brackets', () => {
            const result = preprocess('3:00 PM EST');
            assert.deepEqual(result.contextClues.filter(c => c === 'US' || c === 'Canada'), []);
        });
    });

    describe('verbose timezone name extraction', () => {
        it('extracts "Eastern" as context clue', () => {
            const result = preprocess('12 PM (GMT-5:00) Eastern [US & Canada]');
            assert.ok(result.contextClues.includes('Eastern'));
        });

        it('extracts "Pacific Standard Time"', () => {
            const result = preprocess('3 PM Pacific Standard Time');
            assert.ok(result.contextClues.includes('Pacific Standard Time'));
        });

        it('extracts "Central European Time"', () => {
            const result = preprocess('7 PM Central European Time');
            assert.ok(result.contextClues.includes('Central European Time'));
        });
    });

    describe('slash-separated time splitting', () => {
        it('takes first time from slash-separated pair', () => {
            const result = preprocess('3pm BST / 10am ET');
            assert.ok(result.cleanedText.includes('3pm'));
            assert.ok(!result.cleanedText.includes('10am'));
        });

        it('does NOT split date slashes like 3/15/2025', () => {
            const result = preprocess('3/15/2025 3pm ET');
            assert.ok(result.cleanedText.includes('3/15/2025'));
        });
    });

    describe('normalization', () => {
        it('normalizes noon to 12:00 PM', () => {
            const result = preprocess('12:00 noon');
            assert.ok(result.cleanedText.includes('12:00 PM'));
        });

        it('normalizes midnight to 12:00 AM', () => {
            const result = preprocess('12:00 midnight');
            assert.ok(result.cleanedText.includes('12:00 AM'));
        });

        it('normalizes em-dash to hyphen', () => {
            const result = preprocess('3 PM — 5 PM');
            assert.ok(result.cleanedText.includes('-'));
            assert.ok(!result.cleanedText.includes('—'));
        });

        it('normalizes en-dash to hyphen', () => {
            const result = preprocess('3 PM – 5 PM');
            assert.ok(result.cleanedText.includes('-'));
        });
    });

    describe('preserves original text', () => {
        it('stores originalText unchanged', () => {
            const input = '12 PM (GMT-5:00) Eastern [US & Canada]';
            const result = preprocess(input);
            assert.equal(result.originalText, input);
        });
    });
});
