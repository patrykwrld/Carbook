import { describe, expect, it } from 'vitest';
import { isValidPlate, normalizePlate } from '../src/plate';

describe('normalizePlate', () => {
  it('uppercases and strips spaces and punctuation', () => {
    expect(normalizePlate('abc 123')).toBe('ABC123');
    expect(normalizePlate('ab-123-cd')).toBe('AB123CD');
  });
});

describe('isValidPlate', () => {
  it('accepts alphanumeric plates within length bounds', () => {
    expect(isValidPlate('ABC123')).toBe(true);
    expect(isValidPlate('AB')).toBe(true);
  });

  it('rejects empty, too-long, or non-alphanumeric plates', () => {
    expect(isValidPlate('')).toBe(false);
    expect(isValidPlate('A')).toBe(false);
    expect(isValidPlate('A'.repeat(11))).toBe(false);
    expect(isValidPlate('AB!123')).toBe(false);
  });
});
