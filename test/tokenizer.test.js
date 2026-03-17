// test/tokenizer.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tokenizePhaseA, tokenizePhaseB } = require('../src/tokenizer.js');

describe('tokenizer Phase 2A', () => {
  // AM/PM normalization
  it('normalizes a.m./p.m. variants', () => {
    assert.equal(tokenizePhaseA('3 a.m. EST').normalizedText, '3 AM EST');
    assert.equal(tokenizePhaseA('3 p.m. EST').normalizedText, '3 PM EST');
    assert.equal(tokenizePhaseA('3 A.M. EST').normalizedText, '3 AM EST');
    assert.equal(tokenizePhaseA('3 P.M. EST').normalizedText, '3 PM EST');
  });

  it('normalizes lowercase am/pm', () => {
    assert.equal(tokenizePhaseA('3pm EST').normalizedText, '3 PM EST');
    assert.equal(tokenizePhaseA('3am EST').normalizedText, '3 AM EST');
  });

  // Glued token splitting
  it('splits time glued to timezone abbreviation', () => {
    assert.equal(tokenizePhaseA('3pmEST').normalizedText, '3 PM EST');
    assert.equal(tokenizePhaseA('12amCET').normalizedText, '12 AM CET');
    assert.equal(tokenizePhaseA('2:30pmIST').normalizedText, '2:30 PM IST');
    assert.equal(tokenizePhaseA('3PMEST').normalizedText, '3 PM EST');
  });

  it('splits 24h time glued to abbreviation', () => {
    assert.equal(tokenizePhaseA('15:00CET').normalizedText, '15:00 CET');
    assert.equal(tokenizePhaseA('14:30JST').normalizedText, '14:30 JST');
  });

  it('splits time glued to parenthetical abbreviation', () => {
    assert.equal(tokenizePhaseA('3pm(EST)').normalizedText, '3 PM (EST)');
  });

  // Proximity-based abbreviation uppercasing
  it('uppercases abbreviation adjacent to time', () => {
    assert.equal(tokenizePhaseA('3pm est').normalizedText, '3 PM EST');
    assert.equal(tokenizePhaseA('3:00 pm cet').normalizedText, '3:00 PM CET');
  });

  it('does NOT uppercase non-adjacent abbreviation-like words', () => {
    const result = tokenizePhaseA('Paris est belle at 3pm');
    assert.ok(!result.normalizedText.includes('EST'), 'should not uppercase "est" far from time');
  });

  it('does NOT uppercase unknown abbreviations', () => {
    assert.equal(tokenizePhaseA('3pm xyz').normalizedText, '3 PM xyz');
  });

  // Punctuation normalization
  it('converts em-dash and en-dash to hyphen', () => {
    assert.equal(tokenizePhaseA('3 PM — 5 PM').normalizedText, '3 PM - 5 PM');
    assert.equal(tokenizePhaseA('3 PM – 5 PM').normalizedText, '3 PM - 5 PM');
  });

  it('normalizes noon and midnight', () => {
    assert.equal(tokenizePhaseA('noon EST').normalizedText, '12:00 PM EST');
    assert.equal(tokenizePhaseA('midnight EST').normalizedText, '12:00 AM EST');
  });

  // Slash handling
  it('takes first time from slash-separated times', () => {
    const result = tokenizePhaseA('3pm BST / 10am ET');
    assert.equal(result.normalizedText, '3 PM BST');
  });

  it('preserves date slashes', () => {
    const result = tokenizePhaseA('3/15/2025 3pm ET');
    assert.ok(result.normalizedText.includes('3/15/2025'));
  });

  // rawText preservation
  it('preserves rawText for locale detection', () => {
    const result = tokenizePhaseA('15.30 Uhr MEZ');
    assert.equal(result.rawText, '15.30 Uhr MEZ');
  });
});

describe('tokenizer Phase 2B', () => {
  it('converts French 15h00 notation', () => {
    assert.equal(tokenizePhaseB('15h00'), '15:00');
    assert.equal(tokenizePhaseB('15h30'), '15:30');
    assert.equal(tokenizePhaseB('9h45'), '9:45');
  });

  it('converts German Uhr notation', () => {
    assert.equal(tokenizePhaseB('15.30 Uhr'), '15:30');
    assert.equal(tokenizePhaseB('8.00 Uhr'), '8:00');
  });

  it('converts Scandinavian kl. notation', () => {
    assert.equal(tokenizePhaseB('kl. 15.30'), '15:30');
    assert.equal(tokenizePhaseB('kl 8.00'), '8:00');
  });

  it('converts CJK time expressions', () => {
    assert.equal(tokenizePhaseB('下午3點'), '3:00 PM');
    assert.equal(tokenizePhaseB('上午9點30分'), '9:30 AM');
    assert.equal(tokenizePhaseB('午後3時'), '3:00 PM');
    assert.equal(tokenizePhaseB('午前9時30分'), '9:30 AM');
  });

  it('converts Korean time expressions', () => {
    assert.equal(tokenizePhaseB('오후 3시'), '3:00 PM');
    assert.equal(tokenizePhaseB('오전 9시 30분'), '9:30 AM');
  });

  it('converts Russian informal notation', () => {
    assert.equal(tokenizePhaseB('15ч00'), '15:00');
    assert.equal(tokenizePhaseB('9ч30'), '9:30');
  });

  it('passes through already-standard text unchanged', () => {
    assert.equal(tokenizePhaseB('3:00 PM'), '3:00 PM');
    assert.equal(tokenizePhaseB('15:30'), '15:30');
  });
});
