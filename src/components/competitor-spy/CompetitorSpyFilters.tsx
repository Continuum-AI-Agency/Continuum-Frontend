"use client";

import type { Competitor } from "@continuum/contracts";

const SELECT_CLASS =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground";

export function CompetitorSpyFilters({
  competitors,
  competitorId,
  status,
  onCompetitorChange,
  onStatusChange,
}: {
  competitors: Competitor[];
  competitorId?: string;
  status?: "active" | "paused";
  onCompetitorChange: (id: string | undefined) => void;
  onStatusChange: (status: "active" | "paused" | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={SELECT_CLASS}
        value={competitorId ?? ""}
        onChange={(e) => onCompetitorChange(e.target.value || undefined)}
        aria-label="Filter by competitor"
      >
        <option value="">All competitors</option>
        {competitors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className={SELECT_CLASS}
        value={status ?? ""}
        onChange={(e) => onStatusChange((e.target.value || undefined) as "active" | "paused" | undefined)}
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
      </select>
    </div>
  );
}
