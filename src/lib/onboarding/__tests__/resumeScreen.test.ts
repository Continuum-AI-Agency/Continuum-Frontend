import { describe, expect, test } from 'bun:test';
import type { BrandAccess } from '@/lib/billing/productAccess';
import { completesOnLoad, PLAN_SCREEN, resumeScreenFor } from '../resumeScreen';
import { createDefaultOnboardingState, mergeOnboardingState } from '../state';

const atStep = (step: number) => mergeOnboardingState(createDefaultOnboardingState(), { step });

describe('resumeScreenFor', () => {
  test('billing live: a brand that reached "Choose your plan" resumes on it (Checkout return)', () => {
    expect(resumeScreenFor(atStep(PLAN_SCREEN), true)).toBe(PLAN_SCREEN);
  });

  test('billing NOT live: the wizard ends on screen 7 exactly as before, whatever was persisted', () => {
    expect(resumeScreenFor(atStep(PLAN_SCREEN), false)).toBe(7);
    expect(resumeScreenFor(atStep(7), false)).toBe(7);
  });

  test('earlier screens resume the same either way', () => {
    for (const step of [0, 3, 5]) {
      expect(resumeScreenFor(atStep(step), true)).toBe(resumeScreenFor(atStep(step), false));
    }
  });
});

describe('completesOnLoad', () => {
  const access: Pick<BrandAccess, 'billingLive' | 'products'> = {
    billingLive: true,
    products: ['studio', 'organic_agent', 'mcp', 'trends'],
  };

  test('an admin-granted brand that reached "Choose your plan" passes the gate on load', () => {
    expect(completesOnLoad(atStep(PLAN_SCREEN), access)).toBe(true);
  });

  test('a contract grant counts the same as any other product', () => {
    expect(
      completesOnLoad(atStep(PLAN_SCREEN), { billingLive: true, products: ['paid_media'] }),
    ).toBe(true);
  });

  test('a brand that never did the earlier steps is not completed, granted or not', () => {
    expect(completesOnLoad(atStep(0), access)).toBe(false);
    expect(completesOnLoad(atStep(5), access)).toBe(false);
    expect(completesOnLoad(atStep(7), access)).toBe(false);
  });

  test('no product keeps the plan screen', () => {
    expect(completesOnLoad(atStep(PLAN_SCREEN), { billingLive: true, products: [] })).toBe(false);
  });

  test('before billing go-live nothing completes on load', () => {
    expect(completesOnLoad(atStep(PLAN_SCREEN), { ...access, billingLive: false })).toBe(false);
  });

  test('an already completed state is left alone', () => {
    const completed = mergeOnboardingState(atStep(PLAN_SCREEN), {
      completedAt: '2026-11-20T22:48:17.841Z',
    });
    expect(completesOnLoad(completed, access)).toBe(false);
  });
});
