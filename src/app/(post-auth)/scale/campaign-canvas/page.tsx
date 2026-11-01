import { redirect } from 'next/navigation';
import CampaignFlowCanvasPage from '@/CampaignCanvas';
import { ProductGate } from '@/components/billing/ProductGate';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = {
  title: 'Campaign Flow Canvas | Continuum',
  description: 'Build and manage your Meta advertising campaigns visually with AI assistance.',
};

type CampaignCanvasPageProps = {
  /**
   * `?scaffold=<paid_scaffolds.id>` — set by a Jaina scaffold card's "Open on canvas" — and
   * `?session=`, the thread that card sits in, so the canvas can lead back to it.
   */
  searchParams: Promise<{ scaffold?: string | string[]; session?: string | string[] }>;
};

export default async function Page({ searchParams }: CampaignCanvasPageProps) {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect('/onboarding');
  }

  // A Performance+ surface, behind the same gate as every /scale page: a brand without the plan
  // landed on a working canvas here (PP-DT-C-campaign-canvas-skips-product-gate).
  const denied = await ProductGate('campaign-canvas');
  if (denied) return denied;

  const { scaffold, session } = await searchParams;
  return (
    <CampaignFlowCanvasPage
      requestedScaffoldId={typeof scaffold === 'string' ? scaffold : null}
      requestedSessionId={typeof session === 'string' ? session : null}
    />
  );
}
