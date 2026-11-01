import { connection } from 'next/server';
import { Suspense } from 'react';
import { ProductGate } from '@/components/billing/ProductGate';
import { OrganicCalendarWorkspace } from '@/components/organic/primitives/OrganicCalendarWorkspace';

// usePlannerDateAnchors seeds the visible week from `new Date()` during render,
// which cannot be prerendered. connection() pins this subtree to request time
// while the wrapper above the boundary still ships in the static shell.
async function PlannerWorkspace() {
  await connection();
  return <OrganicCalendarWorkspace />;
}

export default async function OrganicPrimitivesPage() {
  // The planner is Organic Plus, behind the same gate as /organic: a brand without the plan
  // opened it by URL (PP-DT-C-campaign-canvas-skips-product-gate, residual). Before the
  // Suspense boundary, so such a brand never sees the planner skeleton.
  const denied = await ProductGate('organic');
  if (denied) return denied;
  return (
    <div className="space-y-6 w-full max-w-none px-2 sm:px-3 lg:px-4">
      <Suspense fallback={null}>
        <PlannerWorkspace />
      </Suspense>
    </div>
  );
}
