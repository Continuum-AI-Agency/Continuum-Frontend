import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CompetitorSpyClient } from '@/components/competitor-spy/CompetitorSpyClient';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

export const metadata: Metadata = {
  title: 'Brand Spy | Continuum AI',
  description: 'Track competitor Instagram posts and paid ad creatives in one Ad Spy workspace.',
};

export default async function CompetitorSpyPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect('/onboarding');
  }

  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height,600px)] w-full min-w-0 overflow-hidden">
      <CompetitorSpyClient brandId={activeBrandId} />
    </div>
  );
}
