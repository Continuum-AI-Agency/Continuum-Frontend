import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultOnboardingState } from "../state";
import { needsOnboardingReminder } from "../reminders";

test("does not require reminder when state is missing", () => {
  assert.equal(needsOnboardingReminder(null), false);
  assert.equal(needsOnboardingReminder(undefined), false);
});

test("requires reminder when onboarding is incomplete", () => {
  const state = createDefaultOnboardingState();
  assert.equal(needsOnboardingReminder(state), true);
});

test("does not require reminder after completing onboarding", () => {
  const state = createDefaultOnboardingState();
  state.completedAt = new Date().toISOString();
  assert.equal(needsOnboardingReminder(state), false);
});

