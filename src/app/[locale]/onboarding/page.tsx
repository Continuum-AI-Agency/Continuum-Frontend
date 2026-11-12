import { redirect } from 'next/navigation';
import { OnboardingExperience } from '@/components/onboarding/v2/OnboardingExperience';
import { ActiveBrandProvider } from '@/components/providers/ActiveBrandProvider';
import { claimsIdentityOf } from '@/lib/auth/claims';
import { isStaffUser } from '@/lib/auth/staff';
import { readBrandAccess } from '@/lib/billing/brandAccess.server.ts';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { isOnboardingComplete } from '@/lib/onboarding/state';
import { ensureOnboardingState } from '@/lib/onboarding/storage';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type OnboardingPageProps = {
  searchParams?: Promise<{ brand?: string }>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await createSupabaseServerClient();
  const user = await claimsIdentityOf(supabase);

  if (!user) {
    redirect('/login');
  }

  const { brand: brandIdParam } = (searchParams ? await searchParams : {}) as {
    brand?: string;
  };
  const { activeBrandId, brandAccess, brandSummaries, permissions } = await getActiveBrandContext();
  const { brandId, state } = await ensureOnboardingState(brandIdParam);

  if (isOnboardingComplete(state)) {
    redirect('/dashboard');
  }
  // Whether billing is live does not depend on the brand, so the read the brand context already
  // made answers it; only a user with no active brand yet needs one of its own.
  const { billingLive } = activeBrandId ? brandAccess : await readBrandAccess(brandId);

  const defaultUrl = inferDomainFromEmail(user.email);

  return (
    <ActiveBrandProvider
      activeBrandId={brandId}
      brandSummaries={brandSummaries}
      user={user}
      permissions={permissions}
    >
      <OnboardingExperience
        brandId={brandId}
        initialState={state}
        defaultUrl={defaultUrl}
        planRequired={billingLive}
        staff={isStaffUser(user)}
      />
    </ActiveBrandProvider>
  );
}

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'live.com',
  'me.com',
]);

function inferDomainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}
