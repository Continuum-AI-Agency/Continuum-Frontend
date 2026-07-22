import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultOnboardingState,
  mergeOnboardingState,
  normalizeOnboardingState,
} from '../state';

test('default onboarding state opts into the email report', () => {
  const state = createDefaultOnboardingState();
  assert.equal(state.emailReportOptIn, true);
});

test('normalizing legacy state without the field defaults to opt-in', () => {
  const { emailReportOptIn, ...legacy } = createDefaultOnboardingState();
  void emailReportOptIn;
  const normalized = normalizeOnboardingState(legacy);
  assert.equal(normalized.emailReportOptIn, true);
});

test('normalizing preserves an explicit opt-out', () => {
  const normalized = normalizeOnboardingState({
    ...createDefaultOnboardingState(),
    emailReportOptIn: false,
  });
  assert.equal(normalized.emailReportOptIn, false);
});

test('merge flips the opt-in when the toggle patch is applied', () => {
  const state = createDefaultOnboardingState();
  const next = mergeOnboardingState(state, { emailReportOptIn: false });
  assert.equal(next.emailReportOptIn, false);
});

test('merge leaves the opt-in untouched when the patch omits it', () => {
  const state = mergeOnboardingState(createDefaultOnboardingState(), {
    emailReportOptIn: false,
  });
  const next = mergeOnboardingState(state, { step: 3 });
  assert.equal(next.emailReportOptIn, false);
});
