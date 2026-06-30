"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { useShortcut } from "@/lib/keyboard/useShortcut";
import { useAwarenessReport, useCompetitors } from "@/lib/api/competitorSpy";
import { AdSnapshotGrid } from "./AdSnapshotGrid";
import { InstagramPostGrid } from "./InstagramPostGrid";
import { CompetitorRail } from "./CompetitorRail";
import { CompetitorSearchPalette } from "./CompetitorSearchPalette";
import { BoardsPanel } from "./BoardsPanel";
import { AwarenessReportView } from "./AwarenessReportView";
import { CompetitorsTab } from "./CompetitorsTab";

type TabId = "overview" | "organic" | "paid" | "boards" | "competitors";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "organic", label: "Instagram Posts" },
  { id: "paid", label: "Paid Ads" },
  { id: "boards", label: "Boards" },
  { id: "competitors", label: "Competitors" },
];

// Dashboard spy shortcuts deep-link a sub-view via ?tab=; anything else opens
// Overview. Initial value only — in-page switching uses local state.
function resolveTab(value: string | null): TabId {
  return value === "organic" || value === "paid" || value === "boards" || value === "competitors"
    ? value
    : "overview";
}

function tabClass(active: boolean): string {
  return `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
  }`;
}

const STATUS_OPTIONS: Array<{ id: "all" | "active" | "paused"; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];

function StatusSegmented({
  value,
  onChange,
}: {
  value?: "active" | "paused";
  onChange: (value: "active" | "paused" | undefined) => void;
}) {
  const current = value ?? "all";
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      {STATUS_OPTIONS.map((option) => {
        const active = current === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id === "all" ? undefined : option.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const RAIL_CLASS = "md:sticky md:top-0 md:w-60 md:shrink-0 md:self-start";

export function CompetitorSpyClient({ brandId }: { brandId: string }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => resolveTab(searchParams.get("tab")));
  const [competitorId, setCompetitorId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"active" | "paused" | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { data: competitors } = useCompetitors(brandId);
  const { data: awareness } = useAwarenessReport(brandId);

  useShortcut(
    "competitor-spy-search",
    { key: "/", description: "Search competitors", allowInInput: false },
    (event) => {
      event.preventDefault();
      setPaletteOpen(true);
    },
  );

  // Selecting a brand/ad from search scopes the rail-driven tabs to it.
  function focusCompetitor(id: string): void {
    setCompetitorId(id);
    setTab((current) => (current === "organic" || current === "paid" ? current : "paid"));
  }

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

        {tab === "organic" ? (
          <div className="flex flex-col gap-4 md:flex-row md:gap-5">
            <CompetitorRail
              competitors={competitors ?? []}
              selectedId={competitorId}
              onSelect={setCompetitorId}
              onAdd={() => setTab("competitors")}
              className={RAIL_CLASS}
            />
            <div className="min-w-0 flex-1">
              <InstagramPostGrid brandId={brandId} competitorId={competitorId} />
            </div>
          </div>
        ) : null}

        {tab === "paid" ? (
          <div className="flex flex-col gap-4 md:flex-row md:gap-5">
            <CompetitorRail
              competitors={competitors ?? []}
              selectedId={competitorId}
              onSelect={setCompetitorId}
              onAdd={() => setTab("competitors")}
              className={RAIL_CLASS}
            />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex justify-end">
                <StatusSegmented value={status} onChange={setStatus} />
              </div>
              <AdSnapshotGrid brandId={brandId} competitorId={competitorId} status={status} />
            </div>
          </div>
        ) : null}

        {tab === "boards" ? <BoardsPanel brandId={brandId} /> : null}

        {tab === "competitors" ? <CompetitorsTab brandId={brandId} /> : null}
      </div>

      <CompetitorSearchPalette
        brandId={brandId}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSelectCompetitor={focusCompetitor}
        onTrackNew={() => setTab("competitors")}
      />
    </div>
  );
}
