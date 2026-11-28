import 'server-only';

import { after } from 'next/server';
import { getClaimsIdentity } from '@/lib/auth/claims';
import { isStaffUser } from '@/lib/auth/staff';
import { readBrandAccess } from '@/lib/billing/brandAccess.server';
import { onboardingNeedsPlan } from '@/lib/billing/productAccess';
import { log } from '@/lib/observability/logger';
import { getPostHogClient } from '@/lib/posthog-server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LAST_ONBOARDING_STEP, type OnboardingState } from './state';
import { applyOnboardingPatch } from './storage';

// Finishing onboarding, shared by the completion server actions and the onboarding page, which
// completes an already-entitled brand on load. Callers that are server actions revalidate.

const PLAN_REQUIRED_MESSAGE = 'Choose a plan to finish setting up this brand.';

export async function completeOnboarding(
  brandId: string,
  options?: { staffSkip?: boolean },
): Promise<OnboardingState> {
  const user = await getClaimsIdentity();
  // Once billing is live a brand finishes onboarding only with a product — bought through
  // Checkout or granted as a Contract — unless Continuum staff skip the plan step. The plan
  // screen never calls this without one of those; this is the boundary for anything that does.
  const access = await readBrandAccess(brandId);
  if (onboardingNeedsPlan(access) && !(options?.staffSkip && (await verifiedStaff()))) {
    throw new Error(PLAN_REQUIRED_MESSAGE);
  }
  const state = await applyOnboardingPatch(brandId, {
    completedAt: new Date().toISOString(),
    // The last screen. Bumped with the wizard when the product-catalog step landed —
    // completing at anything short of the final index resumes a completed brand onto a
    // screen it already finished. The plan screen is last only once billing is live.
    step: access.billingLive ? LAST_ONBOARDING_STEP : 7,
  });

  // Completion analytics are emitted only after the durable completion write.
  // A failed persistence attempt must never be counted as a completed onboarding.
  if (user?.id) {
    const integrationCount = Object.values(state.connections ?? {}).reduce(
      (count, connection) =>
        count + connection.accounts.filter((account) => account.selected).length,
      0,
    );
    after(async () => {
      const posthog = getPostHogClient();
      try {
        posthog.capture({
          distinctId: user.id,
          event: 'onboarding_completed',
          properties: {
            brand_id: brandId,
            integration_count: integrationCount,
          },
        });
      } finally {
        await posthog.shutdown();
      }
    });
  }

  // Warm the dashboard caches the first-value report reads, so the email that the
  // completedAt trigger just enqueued has full data and the dashboard the user is
  // about to open is already warm. Fire-and-forget; the report worker also warms
  // defensively on its first attempt.
  after(async () => {
    try {
      const { warmBrandNowServer } = await import('@/lib/api/warmBrand.server.ts');
      await warmBrandNowServer(brandId);
    } catch (error) {
      log.error('[completeOnboardingAction] brand warm failed', error, { brandId });
    }
  });

  return state;
}

// The staff skip is a billing boundary, so it reads the Auth server rather than token claims that
// can be up to an hour stale (a revoked admin). Only this path pays for the round trip.
async function verifiedStaff(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isStaffUser(user);
}
