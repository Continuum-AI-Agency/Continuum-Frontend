import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { GoalsPageClient } from '@/components/goals/GoalsPageClient';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

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
