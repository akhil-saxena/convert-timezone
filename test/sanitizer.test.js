// test/sanitizer.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitize } = require('../src/sanitizer.js');

describe('sanitizer', () => {
  it('strips inline HTML tags', () => {
    assert.equal(sanitize('<span>3:00 PM</span>'), '3:00 PM');
  });

  it('replaces block-level tags with spaces', () => {
    assert.equal(sanitize('3:00 PM<br>EST'), '3:00 PM EST');
    assert.equal(sanitize('3:00 PM<div>EST</div>'), '3:00 PM EST');
  });

  it('decodes HTML entities', () => {
    assert.equal(sanitize('3:00&nbsp;PM'), '3:00 PM');
    assert.equal(sanitize('US &amp; Canada'), 'US & Canada');
    assert.equal(sanitize('GMT&#8211;5'), 'GMT\u20135');
  });

  it('decodes numeric entities', () => {
    assert.equal(sanitize('3:00&#160;PM'), '3:00 PM');
    assert.equal(sanitize('3:00&#x00A0;PM'), '3:00 PM');
  });

  it('normalizes Unicode whitespace', () => {
    assert.equal(sanitize('3:00\u00A0PM'), '3:00 PM');  // non-breaking space
    assert.equal(sanitize('3:00\u200BPM'), '3:00PM');    // zero-width space -> removed
    assert.equal(sanitize('3:00\u2009PM'), '3:00 PM');   // thin space
  });

  it('collapses multiple whitespace and newlines', () => {
    assert.equal(sanitize('3:00   PM   EST'), '3:00 PM EST');
    assert.equal(sanitize('3:00\n\nPM\nEST'), '3:00 PM EST');
  });

  it('strips bullets and list markers', () => {
    assert.equal(sanitize('• 3:00 PM EST'), '3:00 PM EST');
    assert.equal(sanitize('→ 3:00 PM EST'), '3:00 PM EST');
    assert.equal(sanitize('▸ 3:00 PM'), '3:00 PM');
    assert.equal(sanitize('1. 3:00 PM EST'), '3:00 PM EST');
  });

  it('preserves parentheses, brackets, and slashes', () => {
    assert.equal(sanitize('(GMT-5:00) [US & Canada]'), '(GMT-5:00) [US & Canada]');
    assert.equal(sanitize('3pm BST / 10am ET'), '3pm BST / 10am ET');
  });

  it('handles full HTML example from spec', () => {
    const input = "<span class='time'>3:00&nbsp;PM</span> <br> (GMT&#8211;5:00) Eastern&nbsp;[US &amp; Canada]";
    assert.equal(sanitize(input), '3:00 PM (GMT\u20135:00) Eastern [US & Canada]');
  });

  it('truncates to 500 characters', () => {
    const long = 'a'.repeat(600) + ' 3:00 PM EST';
    const result = sanitize(long);
    assert.ok(result.length <= 500);
  });

  it('truncates at word boundary', () => {
    const input = 'word '.repeat(110);  // ~550 chars
    const result = sanitize(input);
    assert.ok(result.length <= 500);
    assert.ok(!result.endsWith(' wor'));  // not mid-word
  });

  it('returns empty string for empty input', () => {
    assert.equal(sanitize(''), '');
    assert.equal(sanitize('   '), '');
  });

  it('handles nested tags', () => {
    assert.equal(sanitize('<div><span>3:00 PM</span> <b>EST</b></div>'), '3:00 PM EST');
  });
});
