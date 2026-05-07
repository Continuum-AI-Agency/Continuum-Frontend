"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { DCOActionsWidget } from "@/components/dashboard/DCOActionsWidget";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
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
    <div className="h-full min-h-[680px]">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={72} minSize={50}>
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={65} minSize={35} className="min-h-[420px] xl:min-h-0">
              <PaidMediaReportingWidget
                brandId={brandId}
                onAccountChange={setSelectedAccountId}
                selectedMetric={selectedMetric}
                onSelectedMetricChange={setSelectedMetric}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={35} minSize={20} className="min-h-[280px] xl:min-h-0">
              <div className="h-full overflow-hidden rounded-xl border bg-card">
                <BudgetPacingWidget
                  brandId={brandId}
                  selectedAccountId={selectedAccountId}
                  selectedMetric={selectedMetric}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={28} minSize={15} maxSize={45} className="min-h-[360px] xl:min-h-0">
          <DCOActionsWidget brandId={brandId} variant="rail" className="h-full" />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
