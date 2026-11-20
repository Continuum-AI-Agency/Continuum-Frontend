import { redirect } from 'next/navigation';
import { ProductGate } from '@/components/billing/ProductGate';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import ApprovalsClient from './ApprovalsClient';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function ApprovalsPage() {
  const { activeBrandId, brandSummaries } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect('/onboarding');
  }

  const denied = await ProductGate('approvals');
  if (denied) return denied;

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? 'Untitled brand';

  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height)] w-full min-w-0 overflow-hidden">
      <ApprovalsClient brandProfileId={activeBrandId} brandName={brandName} />
    </div>
  );
}
