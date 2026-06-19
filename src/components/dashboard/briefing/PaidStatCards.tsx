"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchPaidAccountOverview, type PaidAccountOverview } from "@/lib/paid-media/paid-overview.client";
import { buildPaidStatCards, type PaidStatDetailRow } from "@/lib/paid-media/paid-stat-cards";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/datatable/StatCard";

const RANGE = { preset: "last_7d" } as const;

type State =
  | { status: "idle" | "loading" }
  | { status: "error" }
  | { status: "success"; overview: PaidAccountOverview };

function StatDetail({ rows }: { rows: PaidStatDetailRow[] }) {
  return (
    <dl className="flex flex-col gap-1 text-[11px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="font-mono tabular-nums text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The KPI header for the paid dashboard: spend, ROAS, and CTR over the last 7
// days, each with its delta, daily bar series, and a hover detail (prior window
// plus secondary metrics). Sourced from the paid account-overview edge scope.
export function PaidStatCards({ brandId, adAccountId }: { brandId: string; adAccountId: string | null }) {
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    if (!adAccountId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetchPaidAccountOverview({ brandId, adAccountId, platform: "meta", range: RANGE })
      .then((overview) => {
        if (!cancelled) setState({ status: "success", overview });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, adAccountId]);

  const cards = useMemo(
    () => (state.status === "success" ? buildPaidStatCards(state.overview) : null),
    [state],
  );

  if (state.status === "idle" || state.status === "error") return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards
        ? cards.map((card) => (
            <StatCard
              key={card.id}
              label={card.label}
              value={card.value}
              deltaPct={card.deltaPct}
              series={card.series}
              live
              detail={<StatDetail rows={card.detail} />}
            />
          ))
        : Array.from({ length: 3 }).map((_, index) => <StatCardSkeleton key={index} />)}
    </div>
  );
}
