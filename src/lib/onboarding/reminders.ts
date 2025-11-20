import type { OnboardingState } from "./state";
import { isOnboardingComplete } from "./state";

export function needsOnboardingReminder(state: OnboardingState | null | undefined): boolean {
  return Boolean(state && !isOnboardingComplete(state));
}

