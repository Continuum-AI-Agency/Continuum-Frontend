import { describe, expect, it } from 'bun:test';

import {
  BLOCK_BUDGETS,
  boundedText,
  boundedTextArray,
  classifyFreeformLength,
  countCodePoints,
  FREEFORM_PROMPT_HARD_LIMIT,
  FREEFORM_PROMPT_SOFT_LIMIT,
  isTrimmable,
  UNTRIMMABLE_BLOCKS,
} from './limits';

/** Two UTF-16 units, one code point. The whole reason `boundedText` exists. */
const THUMB = '👍';
/** Family emoji: 11 UTF-16 units, 5 code points once the ZWJ joiners are counted. */
const FAMILY = '👨‍👩‍👧';

describe('countCodePoints', () => {
  it('disagrees with String.length exactly where UTF-16 does', () => {
    expect(THUMB.length).toBe(2);
    expect(countCodePoints(THUMB)).toBe(1);
    expect(FAMILY.length).toBeGreaterThan(countCodePoints(FAMILY));
  });

  it('counts a decomposed accent as its component code points', () => {
    const composed = 'é';
    const decomposed = 'é';
    expect(countCodePoints(composed)).toBe(1);
    expect(countCodePoints(decomposed)).toBe(2);
  });
});

describe('boundedText', () => {
  it('measures the upper bound in code points, not UTF-16 units', () => {
    const schema = boundedText(1, 3);
    const three = THUMB.repeat(3);
    expect(three.length).toBe(6);
    expect(schema.safeParse(three).success).toBe(true);
    expect(schema.safeParse(THUMB.repeat(4)).success).toBe(false);
  });

  it('measures the lower bound in code points too', () => {
    const schema = boundedText(3, 10);
    expect(schema.safeParse(THUMB.repeat(2)).success).toBe(false);
    expect(schema.safeParse(THUMB.repeat(3)).success).toBe(true);
  });

  it('reports the overage in the same unit it counted', () => {
    const result = boundedText(1, 3).safeParse(THUMB.repeat(4));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('code points');
    }
  });

  it('permits the empty string when the floor is zero', () => {
    expect(boundedText(0, 10).safeParse('').success).toBe(true);
    expect(boundedText(1, 10).safeParse('').success).toBe(false);
  });
});

describe('boundedTextArray', () => {
  it('bounds each entry as well as the list', () => {
    const schema = boundedTextArray(1, 2).max(2);
    expect(schema.safeParse([THUMB, THUMB.repeat(2)]).success).toBe(true);
    expect(schema.safeParse([THUMB.repeat(3)]).success).toBe(false);
    expect(schema.safeParse([THUMB, THUMB, THUMB]).success).toBe(false);
  });
});

describe('classifyFreeformLength', () => {
  it('is ok at the soft limit and warns one code point past it', () => {
    expect(classifyFreeformLength('a'.repeat(FREEFORM_PROMPT_SOFT_LIMIT))).toBe('ok');
    expect(classifyFreeformLength('a'.repeat(FREEFORM_PROMPT_SOFT_LIMIT + 1))).toBe('soft-warn');
  });

  it('warns at the hard limit and refuses one code point past it', () => {
    expect(classifyFreeformLength('a'.repeat(FREEFORM_PROMPT_HARD_LIMIT))).toBe('soft-warn');
    expect(classifyFreeformLength('a'.repeat(FREEFORM_PROMPT_HARD_LIMIT + 1))).toBe('hard-refuse');
  });

  it('measures an emoji-heavy brief by code points, so it is not charged double', () => {
    const brief = THUMB.repeat(FREEFORM_PROMPT_SOFT_LIMIT);
    expect(brief.length).toBe(FREEFORM_PROMPT_SOFT_LIMIT * 2);
    expect(classifyFreeformLength(brief)).toBe('ok');
    expect(classifyFreeformLength(THUMB.repeat(FREEFORM_PROMPT_HARD_LIMIT + 1))).toBe(
      'hard-refuse',
    );
  });
});

describe('block budgets', () => {
  it('freezes the allocation table', () => {
    expect(Object.isFrozen(BLOCK_BUDGETS)).toBe(true);
    expect(Object.isFrozen(UNTRIMMABLE_BLOCKS)).toBe(true);
  });

  it('marks the guarantee-carrying blocks as untrimmable', () => {
    expect(isTrimmable('brandDirection')).toBe(false);
    expect(isTrimmable('exactCopy')).toBe(false);
    expect(isTrimmable('exclusions')).toBe(false);
    expect(isTrimmable('references')).toBe(false);
    expect(isTrimmable('examples')).toBe(true);
  });
});
