"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { useShortcut } from "@/lib/keyboard/useShortcut";
import { useAwarenessReport } from "@/lib/api/competitorSpy";
import { InspirationBrowser } from "@/components/competitors/InspirationBrowser";
import { CompetitorSearchPalette } from "./CompetitorSearchPalette";
import { BoardsPanel } from "./BoardsPanel";
import { AwarenessReportView } from "./AwarenessReportView";
import { CompetitorsTab } from "./CompetitorsTab";

type TabId = "overview" | "inspiration" | "boards" | "competitors";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "inspiration", label: "Inspiration" },
  { id: "boards", label: "Boards" },
  { id: "competitors", label: "Competitors" },
];

// Dashboard spy shortcuts deep-link a sub-view via ?tab=; legacy organic|paid
// links resolve to the unified Inspiration tab. Initial value only — in-page
// switching uses local state.
function resolveTab(value: string | null): TabId {
  if (value === "boards" || value === "competitors") return value;
  if (value === "inspiration" || value === "organic" || value === "paid") return "inspiration";
  return "overview";
}

function tabClass(active: boolean): string {
  return `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
  }`;
}

export function CompetitorSpyClient({ brandId }: { brandId: string }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => resolveTab(searchParams.get("tab")));
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { data: awareness } = useAwarenessReport(brandId);

  useShortcut(
    "competitor-spy-search",
    { key: "/", description: "Search competitors", allowInInput: false },
    (event) => {
      event.preventDefault();
      setPaletteOpen(true);
    },
  );

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Brand Spy"
        description="Track competitor Instagram posts and paid ad creatives in one Ad Spy workspace."
        action={
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            Search
            <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-xs">/</kbd>
          </button>
        }
      />

      <div role="tablist" aria-label="Competitor spy sections" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={tabClass(tab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {tab === "overview" ? <AwarenessReportView report={awareness ?? null} /> : null}

        {tab === "inspiration" ? (
          <InspirationBrowser
            brandId={brandId}
            defaultSource="all"
            showRail
            showSync
            onManageCompetitors={() => setTab("competitors")}
          />
        ) : null}

        {tab === "boards" ? <BoardsPanel brandId={brandId} /> : null}

        {tab === "competitors" ? <CompetitorsTab brandId={brandId} /> : null}
      </div>

      <CompetitorSearchPalette
        brandId={brandId}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSelectCompetitor={() => setTab("inspiration")}
        onTrackNew={() => setTab("competitors")}
      />
    </div>
  );
}
