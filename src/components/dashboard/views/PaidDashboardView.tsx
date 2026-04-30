"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { DCOActionsWidget } from "@/components/dashboard/DCOActionsWidget";
import type { PaidPerformanceMetricKey } from "@/components/paid-media/PaidMediaReportingWidget";

const PaidMediaReportingWidget = dynamic(
  () =>
    import("@/components/paid-media/PaidMediaReportingWidget").then((m) => ({
      default: m.PaidMediaReportingWidget,
    })),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-lg" /> },
);

const BudgetPacingWidget = dynamic(
  () =>
    import("@/components/paid-media/budget-pacing/BudgetPacingWidget").then((m) => ({
      default: m.BudgetPacingWidget,
    })),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-lg" /> },
);

type PaidDashboardViewProps = {
  brandId: string;
};

export function PaidDashboardView({ brandId }: PaidDashboardViewProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<PaidPerformanceMetricKey>("spend");

  return (
    <div className="grid min-h-[680px] gap-3 xl:h-[calc(100dvh-8.5rem)] xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-[minmax(0,1fr)_minmax(220px,0.46fr)]">
      <section className="min-h-[420px] xl:min-h-0">
        <PaidMediaReportingWidget
          brandId={brandId}
          onAccountChange={setSelectedAccountId}
          selectedMetric={selectedMetric}
          onSelectedMetricChange={setSelectedMetric}
        />
      </section>

      <aside className="min-h-[360px] xl:row-span-2 xl:min-h-0">
        <DCOActionsWidget brandId={brandId} variant="rail" className="h-full" />
      </aside>

      <section className="min-h-[280px] overflow-hidden rounded-xl border bg-card">
        <BudgetPacingWidget
          brandId={brandId}
          selectedAccountId={selectedAccountId}
          selectedMetric={selectedMetric}
        />
      </section>
    </div>
  );
}
