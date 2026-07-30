import { describe, expect, it } from 'bun:test';

import {
  ANGLE_VOCAB_VERSION,
  GLOBAL_ANGLE_COUNT,
  GLOBAL_ANGLE_DEFINITIONS,
  GLOBAL_ANGLE_LABELS,
  globalAngleIdSchema,
} from './angles';

describe('globalAngleIdSchema', () => {
  it('holds exactly 29 entries so the closed vocabulary cannot silently drift', () => {
    expect(globalAngleIdSchema.options).toHaveLength(29);
    expect(GLOBAL_ANGLE_COUNT).toBe(29);
    expect(globalAngleIdSchema.options).toHaveLength(GLOBAL_ANGLE_COUNT);
  });

  it('has no duplicate members', () => {
    expect(new Set(globalAngleIdSchema.options).size).toBe(globalAngleIdSchema.options.length);
  });

  it('is closed — an off-list angle is rejected, never coerced', () => {
    expect(globalAngleIdSchema.safeParse('offer_discount').success).toBe(true);
    expect(globalAngleIdSchema.safeParse('unknown').success).toBe(true);
    expect(globalAngleIdSchema.safeParse('offer_flash_sale').success).toBe(false);
    expect(globalAngleIdSchema.safeParse('OFFER_DISCOUNT').success).toBe(false);
    expect(globalAngleIdSchema.safeParse('').success).toBe(false);
  });

  it('carries an explicit unknown member for non-assignment', () => {
    expect(globalAngleIdSchema.options).toContain('unknown');
  });
});

describe('GLOBAL_ANGLE_DEFINITIONS', () => {
  it('defines every enum member', () => {
    for (const angleId of globalAngleIdSchema.options) {
      expect(GLOBAL_ANGLE_DEFINITIONS[angleId]).toBeDefined();
    }
  });

  it('has no key that is not an enum member', () => {
    for (const key of Object.keys(GLOBAL_ANGLE_DEFINITIONS)) {
      expect(globalAngleIdSchema.safeParse(key).success).toBe(true);
    }
  });

  it('is exactly the same key set as the enum', () => {
    expect(Object.keys(GLOBAL_ANGLE_DEFINITIONS).sort()).toEqual(
      [...globalAngleIdSchema.options].sort(),
    );
  });

  it('gives each angle a real sentence, not a restated label', () => {
    for (const angleId of globalAngleIdSchema.options) {
      const definition = GLOBAL_ANGLE_DEFINITIONS[angleId];
      expect(definition.length).toBeGreaterThan(40);
      expect(definition.trim()).toBe(definition);
      expect(definition.toLowerCase()).not.toBe(GLOBAL_ANGLE_LABELS[angleId].toLowerCase());
    }
  });

  it('keeps every definition distinct', () => {
    const definitions = Object.values(GLOBAL_ANGLE_DEFINITIONS);
    expect(new Set(definitions).size).toBe(definitions.length);
  });

  it('discriminates the two risk-reversal angles on before-vs-after purchase', () => {
    const trial = GLOBAL_ANGLE_DEFINITIONS.risk_reversal_trial.toLowerCase();
    const guarantee = GLOBAL_ANGLE_DEFINITIONS.risk_reversal_guarantee.toLowerCase();
    // A trial lowers the barrier to ENTRY: day passes and free first sessions land here.
    expect(trial).toContain('trial');
    expect(trial).toContain('day pass');
    expect(trial).toContain('before');
    // A guarantee only applies once money has changed hands.
    expect(guarantee).toContain('money back');
    expect(guarantee).toContain('after');
    expect(guarantee).not.toContain('day pass');
  });
});

describe('GLOBAL_ANGLE_LABELS', () => {
  it('labels every enum member and nothing else', () => {
    expect(Object.keys(GLOBAL_ANGLE_LABELS).sort()).toEqual(
      [...globalAngleIdSchema.options].sort(),
    );
  });
});

describe('ANGLE_VOCAB_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(ANGLE_VOCAB_VERSION)).toBe(true);
    expect(ANGLE_VOCAB_VERSION).toBeGreaterThan(0);
  });
});
