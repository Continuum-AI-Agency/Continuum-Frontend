import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { GoalsPageClient } from '@/components/goals/GoalsPageClient';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: 'Goals | Continuum AI',
  description: 'Shared outcomes, evidence, and reviewed deliverables for your marketing team.',
};

export default async function GoalsPage() {
  const { activeBrandId, brandSummaries } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? 'your brand';

  return <GoalsPageClient brandId={activeBrandId} brandName={brandName} />;
}
