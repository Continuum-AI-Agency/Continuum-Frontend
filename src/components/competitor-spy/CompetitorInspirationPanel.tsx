"use client";

import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useCompetitors } from "@/lib/api/competitorSpy";
import { AdSnapshotGrid } from "./AdSnapshotGrid";
import { CompetitorSpyFilters } from "./CompetitorSpyFilters";
import { CompetitorTagInput } from "./CompetitorTagInput";

// Competitor ad creatives surfaced as searchable "inspiration" inside the Library.
// Keyword search + competitor/status filters over the indexed ad_snapshots; the
// "Manage competitors" panel tags up to 5 competitors (which also drive Trends).
export function CompetitorInspirationPanel({ brandId }: { brandId: string }) {
  const { data: competitors } = useCompetitors(brandId);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [competitorId, setCompetitorId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"active" | "paused" | undefined>(undefined);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">Inspiration</h1>
          <p className="text-xs text-muted-foreground">Competitor ad creatives, indexed for ideas.</p>
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search copy, hooks, themes…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
            aria-label="Search competitor inspiration"
          />
        </div>
        <button
          type="button"
          onClick={() => setManageOpen((v) => !v)}
          aria-pressed={manageOpen}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
            manageOpen ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Manage competitors</span>
        </button>
      </div>

      {manageOpen ? <CompetitorTagInput brandId={brandId} /> : null}

      <CompetitorSpyFilters
        competitors={competitors ?? []}
        competitorId={competitorId}
        status={status}
        onCompetitorChange={setCompetitorId}
        onStatusChange={setStatus}
      />

      <AdSnapshotGrid
        brandId={brandId}
        competitorId={competitorId}
        status={status}
        q={debounced || undefined}
        limit={60}
        inspiration
      />
    </div>
  );
}
