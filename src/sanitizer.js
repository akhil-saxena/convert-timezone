// src/sanitizer.js
const MAX_LENGTH = 500;

// Block-level tags that should become spaces
const BLOCK_TAGS = /(<\/?(div|p|br|hr|li|tr|td|th|h[1-6]|blockquote|pre|section|article|header|footer|nav|main|aside|details|summary|figure|figcaption|table|thead|tbody|tfoot|dl|dt|dd|ol|ul)\b[^>]*\/?>)/gi;

// All remaining HTML tags
const ALL_TAGS = /<[^>]+>/g;

// Named HTML entities
const NAMED_ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&apos;': "'", '&ndash;': '\u2013', '&mdash;': '\u2014',
  '&lsquo;': '\u2018', '&rsquo;': '\u2019', '&ldquo;': '\u201C', '&rdquo;': '\u201D',
  '&bull;': '\u2022', '&middot;': '\u00B7', '&hellip;': '\u2026', '&trade;': '\u2122',
  '&copy;': '\u00A9', '&reg;': '\u00AE', '&deg;': '\u00B0', '&times;': '\u00D7',
};

// Leading junk: bullets, arrows, list markers
// The dot must be followed by whitespace (not a digit) to avoid stripping "15.30" German time notation
const LEADING_JUNK = /^[\s\u2022\u25B8\u25B9\u25BA\u25BB\u2192\u27F6\u27A4\u279C\u2726\u2727\u2605\u2606\-\u2013\u2014\d]+\.(?=\s)[\s]*/;
const BULLET_CHARS = /[\u2022\u25B8\u25B9\u25BA\u25BB\u2192\u27F6\u27A4\u279C\u2726\u2727\u2605\u2606]/g;

function sanitize(rawText) {
  if (!rawText || !rawText.trim()) return '';

  let text = rawText;

  // 1. Replace block-level tags with spaces
  text = text.replace(BLOCK_TAGS, ' ');

  // 2. Remove remaining HTML tags
  text = text.replace(ALL_TAGS, '');

  // 3. Decode named HTML entities
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    text = text.split(entity).join(char);
    // Case-insensitive version
    const lower = entity.toLowerCase();
    if (lower !== entity) text = text.split(lower).join(char);
  }

  // 4. Decode numeric entities (decimal and hex)
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // 5. Remove zero-width characters
  text = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

  // 6. Normalize Unicode whitespace to regular space
  text = text.replace(/[\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');

  // 7. Strip bullet/arrow characters
  text = text.replace(BULLET_CHARS, ' ');

  // 8. Strip leading list markers like "1. " or "- "
  text = text.replace(LEADING_JUNK, '');

  // 9. Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // 10. Truncate to MAX_LENGTH at word boundary
  if (text.length > MAX_LENGTH) {
    const truncated = text.substring(0, MAX_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    text = lastSpace > MAX_LENGTH * 0.8 ? truncated.substring(0, lastSpace) : truncated;
  }

  return text;
}

module.exports = { sanitize };
