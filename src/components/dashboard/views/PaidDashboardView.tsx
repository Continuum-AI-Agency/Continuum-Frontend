"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Text } from "@radix-ui/themes";
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
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="px-1">
          <Text size="3" weight="medium" className="text-balance">Performance & Actions</Text>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-start">
          <PaidMediaReportingWidget
            brandId={brandId}
            onAccountChange={setSelectedAccountId}
            selectedMetric={selectedMetric}
            onSelectedMetricChange={setSelectedMetric}
          />
          <DCOActionsWidget brandId={brandId} />
        </div>
      </section>
      <section className="space-y-2">
        <BudgetPacingWidget
          brandId={brandId}
          selectedAccountId={selectedAccountId}
          selectedMetric={selectedMetric}
        />
      </section>
    </div>
  );
}
