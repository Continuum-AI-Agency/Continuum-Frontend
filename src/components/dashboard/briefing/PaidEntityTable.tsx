"use client";

import { useEffect, useMemo, useState } from "react";
import type { PaidEntityKpi, PaidRankedEntity, PaidRankingScope } from "@continuum/contracts";
import { fetchPaidRanking } from "@/lib/paid-media/paid-ranking.client";
import {
  getLatestInsights,
  type PersistedCampaignInsight,
} from "@/lib/paid-media/insight-history-client";
import { buildPaidLeaderboardRows, formatKpiValue } from "@/lib/paid-media/paid-leaderboard-rows";
import { kpiLabel, kpiUnit, metricForKpi, sortEntitiesByKpi } from "@/lib/paid-media/paid-kpi";
import { useDashboardPrefsStore } from "@/stores/dashboardPrefs";
import { InsightDataTable, type InsightColumn } from "@/components/dashboard/datatable/InsightDataTable";
import { ModuleShortcutLink } from "@/components/shared/ModuleShortcutLink";
import { InsightActionsDropdown, InsightContextActions } from "./insightActions";

const RANGE = { preset: "last_7d" } as const;
// Fetched once, ranked server-side by ROAS; re-sorting by other KPIs happens in
// place over this pool, so a modest set gives the selector room to work.
const FETCH_LIMIT = 8;
// Context KPIs shown alongside the selected one (minus whichever is selected).
const CONTEXT_KPIS: PaidEntityKpi[] = ["roas", "spend", "ctr"];

type State =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "success"; entities: PaidRankedEntity[]; insights: PersistedCampaignInsight[] };

type PaidEntityTableProps = {
  brandId: string;
  adAccountId: string | null;
  scope: PaidRankingScope;
  title: string;
  emptyMessage: string;
};

type PaidDisplayRow = PaidRankedEntity & { displayRank: number };

function kpiCell(entity: PaidRankedEntity, kpi: PaidEntityKpi): string {
  const value = metricForKpi(entity, kpi);
  return typeof value === "number" ? formatKpiValue(value, kpiUnit(kpi)) : "—";
}

// One ranked paid surface (campaigns or ad sets) as a dense, sortable data
// table. Server returns the pool ranked by ROAS; the selected KPI (from the
// persisted store) re-ranks it in place — no re-fetch.
export function PaidEntityTable({ brandId, adAccountId, scope, title, emptyMessage }: PaidEntityTableProps) {
  const paidKpi = useDashboardPrefsStore((store) => store.paidKpi);
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!adAccountId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([
      fetchPaidRanking({
        brandId,
        adAccountId,
        platform: "meta",
        scope,
        kpi: "roas",
        direction: "top",
        limit: FETCH_LIMIT,
        range: RANGE,
      }),
      getLatestInsights({ brandId, adAccountId, limit: 20 }).catch(
        () => [] as PersistedCampaignInsight[],
      ),
    ])
      .then(([entities, insights]) => {
        if (!cancelled) setState({ status: "success", entities, insights });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, adAccountId, scope]);

  const insightLineById = useMemo(() => {
    if (state.status !== "success") return new Map<string, string | undefined>();
    const rows = buildPaidLeaderboardRows({ entities: state.entities, insights: state.insights, scope });
    return new Map(rows.map((row) => [row.id, row.insightLine]));
  }, [state, scope]);

  // Re-rank the already-fetched pool by the selected KPI, in place.
  const rows = useMemo<PaidDisplayRow[]>(() => {
    if (state.status !== "success") return [];
    return sortEntitiesByKpi(state.entities, paidKpi).map((entity, index) => ({
      ...entity,
      displayRank: index + 1,
    }));
  }, [state, paidKpi]);

  const columns = useMemo<InsightColumn<PaidDisplayRow>[]>(() => {
    const contextKpis = CONTEXT_KPIS.filter((kpi) => kpi !== paidKpi).slice(0, 2);
    return [
      {
        id: "rank",
        header: "#",
        cellClassName: "w-8 text-muted-foreground",
        cell: (row) => <span className="font-mono text-xs tabular-nums">{row.displayRank}</span>,
      },
      {
        id: "name",
        header: scope === "top_adsets" ? "Ad set" : "Campaign",
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-sm leading-snug text-foreground line-clamp-2 break-words">
              {row.name.trim() || "Untitled"}
            </p>
            {scope === "top_adsets" && row.labels?.campaign ? (
              <p className="truncate text-xs text-muted-foreground">{row.labels.campaign}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: paidKpi,
        header: kpiLabel(paidKpi),
        align: "right",
        sortValue: (row) => metricForKpi(row, paidKpi) ?? Number.NEGATIVE_INFINITY,
        cellClassName: "text-foreground",
        cell: (row) => kpiCell(row, paidKpi),
      },
      ...contextKpis.map<InsightColumn<PaidDisplayRow>>((kpi) => ({
        id: kpi,
        header: kpiLabel(kpi),
        align: "right",
        sortValue: (row) => metricForKpi(row, kpi) ?? Number.NEGATIVE_INFINITY,
        cell: (row) => kpiCell(row, kpi),
      })),
    ];
  }, [scope, paidKpi]);

  return (
    <InsightDataTable
      title={title}
      metricLabel={kpiLabel(paidKpi)}
      headerAction={<ModuleShortcutLink href="/scale" label="Scale" />}
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      isLoading={state.status === "idle" || state.status === "loading"}
      emptyState={state.status === "error" ? "Couldn't load performance right now." : emptyMessage}
      contextMenu={() => <InsightContextActions />}
      rowActions={() => <InsightActionsDropdown />}
      expandedContent={(row) => (
        <div className="flex flex-col gap-2 text-xs leading-relaxed">
          {insightLineById.get(row.id) ? (
            <p className="text-foreground">{insightLineById.get(row.id)}</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono tabular-nums text-muted-foreground sm:grid-cols-4">
            <Stat label="Conv" value={kpiCell(row, "conversions")} />
            <Stat label="Conv value" value={kpiCell(row, "conversions_value")} />
            <Stat label="CPC" value={kpiCell(row, "cpc")} />
            <Stat label="CPM" value={kpiCell(row, "cpm")} />
          </dl>
        </div>
      )}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
