import { describe, expect, test } from 'bun:test';
import {
  emptyStarterSlots,
  onboardingStarterRunSchema,
  starterProgress,
  starterSlotSchema,
} from './starter-kit';

describe('onboarding starter kit', () => {
  test('counts saved results, not provider time, and remains company funded', () => {
    const slots = emptyStarterSlots();
    slots.product.status = 'ready';
    slots.character.status = 'failed';
    const run = onboardingStarterRunSchema.parse({
      id: crypto.randomUUID(),
      brandId: crypto.randomUUID(),
      status: 'running',
      slots,
      updatedAt: new Date().toISOString(),
      fundedBy: 'continuum',
    });
    expect(starterProgress(run)).toEqual({ ready: 1, failed: 1, total: 7, active: true });
    expect(onboardingStarterRunSchema.safeParse({ ...run, fundedBy: 'user' }).success).toBe(false);
    expect(starterSlotSchema.safeParse({ ...slots.product, attempts: 3 }).success).toBe(false);
  });
});
