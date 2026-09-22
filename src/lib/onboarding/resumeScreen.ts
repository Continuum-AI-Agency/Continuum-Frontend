import { LAST_ONBOARDING_STEP, type OnboardingState } from './state';

// Which onboarding screen a brand resumes on. Pure, so the billing-live and not-live wizards are
// both unit-tested without rendering it.

export type ScreenIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** "Choose your plan": after the last screen, and only once billing is live. */
export const PLAN_SCREEN = LAST_ONBOARDING_STEP;

export function resumeScreenFor(state: OnboardingState, planRequired: boolean): ScreenIndex {
  const brand = state.brand;
  const hasAnyConnection = Object.values(state.connections).some((c) => c.connected);
  const hasDna = Boolean(brand.overview) || brand.colors.length > 0 || Boolean(brand.brandVoice);
  const hasInvites = (state.invites?.length ?? 0) > 0;
  const hasDocuments = (state.documents?.length ?? 0) > 0;

  // No catalog floor: whether the brand imported products is not derivable from
  // OnboardingState (the products are Elements, read over HTTP), and a floor that
  // guessed would skip the step for a brand that never saw it.
  let dataFloor: ScreenIndex = 0;
  if (brand.website) dataFloor = 1;
  if (hasDocuments) dataFloor = 2;
  if (hasAnyConnection) dataFloor = 4;
  if (hasInvites) dataFloor = 5;
  if (hasDna) dataFloor = 5;

  // billing-cutover: before go-live the wizard ends on screen 7, exactly as it always has.
  const lastScreen = planRequired ? PLAN_SCREEN : 7;
  const persistedStep = Math.min(lastScreen, Math.max(0, state.step ?? 0)) as ScreenIndex;
  return Math.max(persistedStep, dataFloor) as ScreenIndex;
}
