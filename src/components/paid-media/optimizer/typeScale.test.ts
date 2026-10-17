import { describe, expect, it } from 'bun:test';

import * as typeScale from './typeScale';

// PP-L1V-clipped-text-figures-and-controls: a mono figure's glyph box is ~1.14em, and every
// figure sits in a `truncate` (overflow hidden) node, so any leading under 1.2 clips a
// descender somewhere on the ladder ("28,972 MXN" read scrollHeight 25 > clientHeight 22).

const NAMED_LEADING: Record<string, number> = {
  'leading-none': 1,
  'leading-tight': 1.25,
  'leading-snug': 1.375,
  'leading-normal': 1.5,
};

function leadingOf(classes: string): number | null {
  const token = classes.split(/\s+/).find((cls) => cls.startsWith('leading-'));
  if (!token) return null;
  const arbitrary = token.match(/^leading-\[(\d+(?:\.\d+)?)\]$/);
  if (arbitrary) return Number(arbitrary[1]);
  return NAMED_LEADING[token] ?? null;
}

describe('typeScale figures', () => {
  it('lead every figure at 1.2 or more', () => {
    for (const [name, classes] of Object.entries(typeScale)) {
      if (!name.startsWith('figure')) continue;
      const leading = leadingOf(classes);
      expect(leading, `${name} declares its leading`).not.toBeNull();
      expect(leading ?? 0, `${name} leads at ${leading}`).toBeGreaterThanOrEqual(1.2);
    }
  });
});
