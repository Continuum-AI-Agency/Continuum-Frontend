import 'server-only';

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { decideProductGate, type GatedSurface } from '@/lib/billing/productAccess';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { LegacyTierRedirect } from './LegacyTierRedirect';

/**
 * The page-level product gate. Call it at the top of a gated page, after the active-brand check
 * and before any data fetching:
 *
 *   const denied = await ProductGate('scale');
 *   if (denied) return denied;
 *
 * A brand without the product is sent to Settings → Billing with the plan that grants it
 * highlighted. The courtesy, not the boundary — the Backend answers the same brand 402.
 */
export async function ProductGate(surface: GatedSurface): Promise<ReactNode | null> {
  const { brandAccess } = await getActiveBrandContext();
  const decision = decideProductGate(surface, brandAccess);
  switch (decision.kind) {
    case 'allow':
      return null;
    case 'billing':
      return redirect(decision.href);
    case 'legacy':
      // The tier gate this page had before billing: billing is not live, or a grandfathered
      // brand opened Forge below tier 3.
      return <LegacyTierRedirect description={decision.description} />;
  }
}
