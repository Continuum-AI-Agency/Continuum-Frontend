import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { GoalsPageClient } from '@/components/goals/GoalsPageClient';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return {
    title: t('goals_continuum_ai_7d5b193'),
    description: t('shared_outcomes_evidence_and_reviewed_deliver_9ebe350'),
  };
}

export default async function GoalsPage() {
  const { activeBrandId, brandSummaries } = await getActiveBrandContext();
  if (!activeBrandId) redirect('/onboarding');

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ??
    (await getTranslations('dashboard'))('m_abf537e51b');

  return <GoalsPageClient brandId={activeBrandId} brandName={brandName} />;
}
