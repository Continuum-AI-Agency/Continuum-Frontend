import { redirect } from 'next/navigation';
import { TierAccessRedirect } from '@/components/ui/TierAccessRedirect';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { bareAccountId } from '@/lib/paid-media/accountId';
import {
  fetchAssignedAdAccountIds,
  fetchTimelineAccounts,
} from '@/lib/paid-media/paid-media-data.server';
import PaidMediaClientPage from './PaidMediaClient';

export default async function PaidMediaPage() {
  const { activeBrandId, activeBrandTier, brandSummaries } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect('/onboarding');
  }

  // Permission gate: allow only tiers 1,2,3; tier 0 (or missing) is blocked.
  if (activeBrandTier === 0) {
    return (
      <TierAccessRedirect description="Paid Media is a paid feature. Please contact an Administrator." />
    );
  }

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? 'Untitled brand';

  // Fetch accounts in parallel with layout; campaign indexes load client-side
  // after account selection to avoid a sequential server waterfall.
  const [initialAccounts, assignedAccountIds] = await Promise.all([
    fetchTimelineAccounts(activeBrandId),
    fetchAssignedAdAccountIds(activeBrandId),
  ]);

  // Seed the selection with an ASSIGNED account so first paint never pins one the
  // brand can merely reach (which the optimizer would then reject). Prefer a
  // timeline-present assigned account (a Meta account, matching the default
  // platform) for an instant render; otherwise seed null and let the now
  // assigned-scoped client picker resolve one — never the reachable superset. An
  // empty assigned set means "nothing assigned" OR the lookup was unavailable;
  // both degrade to today's behavior (first reachable account) rather than a
  // dead-ended page.
  const assignedSet = new Set(assignedAccountIds.map(bareAccountId));
  const firstAccountId =
    assignedSet.size > 0
      ? (initialAccounts.find((account) => assignedSet.has(bareAccountId(account.id)))?.id ?? null)
      : (initialAccounts[0]?.id ?? null);

  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height)] w-full min-w-0 overflow-hidden">
      <PaidMediaClientPage
        brandProfileId={activeBrandId}
        brandName={brandName}
        initialAccounts={initialAccounts}
        initialAdAccountId={firstAccountId}
      />
    </div>
  );
}
