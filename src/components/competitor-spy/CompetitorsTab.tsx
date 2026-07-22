'use client';

import { CompetitorTagInput } from './CompetitorTagInput';
import { RecommendedCompetitors } from './RecommendedCompetitors';
import { TrackedCompetitorsList } from './TrackedCompetitorsList';

// Competitors tab: search-based add (CompetitorTagInput), the clear tracked list,
// then onboarding-derived recommendations the user accepts one-by-one.
export function CompetitorsTab({ brandId }: { brandId: string }) {
  return (
    <div className="space-y-6">
      <CompetitorTagInput brandId={brandId} />
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Tracked competitors</h3>
        <TrackedCompetitorsList brandId={brandId} />
      </section>
      <RecommendedCompetitors brandId={brandId} />
    </div>
  );
}
