import { describe, expect, test } from 'bun:test';
import { PLAN_SCREEN, resumeScreenFor } from '../resumeScreen';
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
