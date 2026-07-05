"use client";

import { SectionHeader } from "@/components/shared/SectionHeader";
import { InspirationBrowser } from "@/components/competitors/InspirationBrowser";
import { CompetitorSpyLink } from "./CompetitorSpyLink";

// What the watched competitors are posting organically, as a compact thumbnail
// grid that expands on hover. The shared InspirationBrowser adds an inline source
// toggle, on-demand Sync, per-competitor health summary, and Save-to-board on
// each card; the full workspace is one click away.
export function CompetitorOrganicTable({ brandId }: { brandId: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card">
      <SectionHeader title="Competitor organic" action={<CompetitorSpyLink href="/competitor-spy?tab=inspiration" />} />
      <div className="p-3">
        <InspirationBrowser
          brandId={brandId}
          defaultSource="organic"
          variant="compact"
          showSync
          feedLimit={18}
          gridClassName="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2"
        />
      </div>
    </div>
  );
}
