import { redirect } from 'next/navigation';
import { ProductGate } from '@/components/billing/ProductGate';
import { resolveAutomationDeploymentEnvironment } from '@/lib/automations/access';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { resolveInitialMetaAdAccountId } from '@/lib/paid-media/accountId';
import {
  fetchAssignedAdAccounts,
  fetchTimelineAccounts,
} from '@/lib/paid-media/paid-media-data.server';
import PaidMediaClientPage from './PaidMediaClient';

export default async function PaidMediaPage() {
  const { activeBrandId, brandSummaries } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect('/onboarding');
  }

  const denied = await ProductGate('scale');
  if (denied) return denied;

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? 'Untitled brand';

  // Fetch accounts in parallel with layout; campaign indexes load client-side
  // after account selection to avoid a sequential server waterfall.
  const [initialAccounts, assignedAccounts] = await Promise.all([
    fetchTimelineAccounts(activeBrandId),
    fetchAssignedAdAccounts(activeBrandId),
  ]);

  // Seed the selection with an ASSIGNED account so first paint never pins one the
  // brand can merely reach (which the optimizer would then reject). Prefer its
  // timeline representation, but retain the brand-scoped assignment as a safe
  // fallback when the timeline Edge lookup is unavailable. An empty assigned set
  // means "nothing assigned" OR the lookup was unavailable; both preserve today's
  // first-reachable fallback rather than dead-ending the page.
  const firstAccountId = resolveInitialMetaAdAccountId(initialAccounts, assignedAccounts);

  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height)] w-full min-w-0 overflow-hidden">
      <PaidMediaClientPage
        brandProfileId={activeBrandId}
        brandName={brandName}
        initialAccounts={initialAccounts}
        initialAdAccountId={firstAccountId}
        deploymentEnvironment={resolveAutomationDeploymentEnvironment({
          nodeEnv: process.env.NODE_ENV,
          vercelEnv: process.env.VERCEL_ENV,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
        })}
      />
    </div>
  );
}
