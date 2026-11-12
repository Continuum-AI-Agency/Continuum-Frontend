import { connection } from 'next/server';
import { Suspense } from 'react';
import { OrganicCalendarWorkspace } from '@/components/organic/primitives/OrganicCalendarWorkspace';

// usePlannerDateAnchors seeds the visible week from `new Date()` during render,
// which cannot be prerendered. connection() pins this subtree to request time
// while the wrapper above the boundary still ships in the static shell.
async function PlannerWorkspace() {
  await connection();
  return <OrganicCalendarWorkspace />;
}

export default function OrganicPrimitivesPage() {
  return (
    <div className="space-y-6 w-full max-w-none px-2 sm:px-3 lg:px-4">
      <Suspense fallback={null}>
        <PlannerWorkspace />
      </Suspense>
    </div>
  );
}
