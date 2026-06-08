"use client";

import { useState } from "react";
import { useAwarenessReport, useCompetitors } from "@/lib/api/competitorSpy";
import { AdSnapshotGrid } from "./AdSnapshotGrid";
import { CompetitorSpyFilters } from "./CompetitorSpyFilters";
import { AwarenessReportView } from "./AwarenessReportView";
import { CompetitorManager } from "./CompetitorManager";

type TabId = "overview" | "feed" | "competitors";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "feed", label: "Ad Feed" },
  { id: "competitors", label: "Competitors" },
];

function tabClass(active: boolean): string {
  return `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
  }`;
}

export function CompetitorSpyClient({ brandId }: { brandId: string }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [competitorId, setCompetitorId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"active" | "paused" | undefined>(undefined);

  const { data: competitors } = useCompetitors(brandId);
  const { data: awareness } = useAwarenessReport(brandId);

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">Competitor Spy</h1>
        <p className="text-sm text-muted-foreground">
          Track competitors&apos; paid ad creatives and how they evolve over time.
        </p>
      </header>

      <nav role="tablist" aria-label="Competitor spy sections" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={tabClass(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto">
        {tab === "overview" ? <AwarenessReportView report={awareness ?? null} /> : null}
        {tab === "feed" ? (
          <div className="space-y-4">
            <CompetitorSpyFilters
              competitors={competitors ?? []}
              competitorId={competitorId}
              status={status}
              onCompetitorChange={setCompetitorId}
              onStatusChange={setStatus}
            />
            <AdSnapshotGrid brandId={brandId} competitorId={competitorId} status={status} />
          </div>
        ) : null}
        {tab === "competitors" ? <CompetitorManager brandId={brandId} /> : null}
      </div>
    </div>
  );
}
