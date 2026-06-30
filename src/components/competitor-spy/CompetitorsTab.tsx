"use client";

import { CompetitorTagInput } from "./CompetitorTagInput";
import { TrackedCompetitorsList } from "./TrackedCompetitorsList";
import { RecommendedCompetitors } from "./RecommendedCompetitors";

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
