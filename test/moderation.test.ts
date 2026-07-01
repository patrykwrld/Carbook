import { describe, expect, it } from 'vitest';
import {
  AUTO_HIDE_FLAG_THRESHOLD,
  MAX_AUTHOR_NAME_LENGTH,
  MAX_COMMENT_LENGTH,
  sanitizeAuthorName,
  sanitizeCommentBody,
  shouldAutoHide,
} from '../src/moderation';

describe('sanitizeCommentBody', () => {
  it('trims whitespace and collapses internal runs of whitespace', () => {
    expect(sanitizeCommentBody('  hello   world  ')).toBe('hello world');
  });

  it('rejects comments below the minimum length', () => {
    expect(sanitizeCommentBody('hi')).toBeNull();
    expect(sanitizeCommentBody('   ')).toBeNull();
  });

  it('rejects comments above the maximum length', () => {
    expect(sanitizeCommentBody('a'.repeat(MAX_COMMENT_LENGTH + 1))).toBeNull();
  });

  it('accepts a well-formed comment', () => {
    expect(sanitizeCommentBody('Cut me off on the highway')).toBe('Cut me off on the highway');
  });
});

describe('sanitizeAuthorName', () => {
  it('returns null for empty or missing input', () => {
    expect(sanitizeAuthorName(undefined)).toBeNull();
    expect(sanitizeAuthorName(null)).toBeNull();
    expect(sanitizeAuthorName('   ')).toBeNull();
  });

  it('trims and truncates to the max length', () => {
    expect(sanitizeAuthorName('  Alex  ')).toBe('Alex');
    expect(sanitizeAuthorName('a'.repeat(100))?.length).toBe(MAX_AUTHOR_NAME_LENGTH);
  });
});

describe('shouldAutoHide', () => {
  it('stays visible below the threshold', () => {
    expect(shouldAutoHide(AUTO_HIDE_FLAG_THRESHOLD - 1)).toBe(false);
  });

  it('hides once the threshold is reached', () => {
    expect(shouldAutoHide(AUTO_HIDE_FLAG_THRESHOLD)).toBe(true);
    expect(shouldAutoHide(AUTO_HIDE_FLAG_THRESHOLD + 5)).toBe(true);
  });
});
