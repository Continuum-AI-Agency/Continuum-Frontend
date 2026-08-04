import { describe, expect, it } from 'bun:test';

import { brandVoiceSchema, coerceStringArray } from './brand-voice';

describe('coerceStringArray', () => {
  const coerce = coerceStringArray({ maxLen: 420, maxItems: 10 });

  it('splits a delimited string into pillars', () => {
    expect(coerce('Pillar A; Pillar B\n• Pillar C')).toEqual(['Pillar A', 'Pillar B', 'Pillar C']);
  });

  it('splits numbered and pipe-delimited strings', () => {
    expect(coerce('1. First 2. Second | Third')).toEqual(['First', 'Second', 'Third']);
  });

  it('returns a single-element array when there is no delimiter', () => {
    expect(coerce('Just one message')).toEqual(['Just one message']);
  });

  it('passes arrays through, trimming and dropping empties', () => {
    expect(coerce(['  A  ', '', 'B'])).toEqual(['A', 'B']);
  });

  it("never stringifies objects to '[object Object]' — extracts a text field or drops", () => {
    expect(coerce([{ text: 'Pillar A' }, { value: 'Pillar B' }])).toEqual(['Pillar A', 'Pillar B']);
    expect(coerce([{ nope: 1 }, { also: {} }])).toEqual([]);
    expect(coerce([{ text: 'Keep' }, { junk: true }, 'Plain'])).toEqual(['Keep', 'Plain']);
  });

  it('preserves null and undefined for nullable/optional handling', () => {
    expect(coerce(null)).toBeNull();
    expect(coerce(undefined)).toBeUndefined();
  });

  it('caps element length and item count', () => {
    const long = 'x'.repeat(500);
    const many = Array.from({ length: 15 }, (_, i) => `item ${i}`);
    expect((coerce(long) as string[])[0]).toHaveLength(420);
    expect(coerce(many)).toHaveLength(10);
  });
});

describe('brandVoiceSchema key_messaging coercion', () => {
  it('accepts a stringy key_messaging without throwing (regression for the 500)', () => {
    const result = brandVoiceSchema.safeParse({
      key_messaging: 'Speed; Trust; Craftsmanship',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.key_messaging).toEqual([
      'Speed',
      'Trust',
      'Craftsmanship',
    ]);
  });

  it('still accepts a proper array and null', () => {
    expect(brandVoiceSchema.safeParse({ key_messaging: ['A', 'B'] }).success).toBe(true);
    expect(brandVoiceSchema.safeParse({ key_messaging: null }).success).toBe(true);
    expect(brandVoiceSchema.safeParse({}).success).toBe(true);
  });
});
