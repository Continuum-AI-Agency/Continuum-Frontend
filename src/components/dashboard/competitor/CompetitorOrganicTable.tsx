"use client";

import { SectionHeader } from "@/components/shared/SectionHeader";
import { CompetitorOrganicExplorer } from "@/components/competitors/CompetitorOrganicExplorer";
import { CompetitorSpyLink } from "./CompetitorSpyLink";

// What the watched competitors are posting organically, as a compact masonry
// that expands on hover to show the post copy and metrics. A search box looks up
// any public handle via the same Business Discovery feed the Brand Spy subsystem
// uses; the full workspace is one click away.
export function CompetitorOrganicTable({ brandId }: { brandId: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card">
      <SectionHeader title="Competitor organic" action={<CompetitorSpyLink href="/competitor-spy?tab=organic" />} />
      <div className="p-3">
        <CompetitorOrganicExplorer brandId={brandId} feedLimit={12} columnsClassName="columns-3 sm:columns-4" />
      </div>
    </div>
  );
}
