"use client";

import dynamic from "next/dynamic";
import { Text } from "@radix-ui/themes";
import { Skeleton } from "@/components/ui/skeleton";
import { DCOActionsWidget } from "@/components/dashboard/DCOActionsWidget";

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
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="px-1">
          <Text size="3" weight="medium" className="text-balance">Performance and Action Signals</Text>
          <Text size="2" className="text-pretty text-muted-foreground">
            Compare spend momentum with DCO execution activity in a single view.
          </Text>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-start">
          <PaidMediaReportingWidget brandId={brandId} />
          <DCOActionsWidget brandId={brandId} />
        </div>
      </section>
      <section className="space-y-2">
        <div className="px-1">
          <Text size="3" weight="medium">Budget Pace</Text>
          <Text size="2" className="text-muted-foreground">
            Track pacing pressure before it turns into underdelivery.
          </Text>
        </div>
        <BudgetPacingWidget brandId={brandId} />
      </section>
    </div>
  );
}
