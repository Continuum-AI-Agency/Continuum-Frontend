"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { DCOActionsWidget } from "@/components/dashboard/DCOActionsWidget";

const PaidMediaReportingWidget = dynamic(
  () =>
    import("@/components/paid-media/PaidMediaReportingWidget").then((m) => ({
      default: m.PaidMediaReportingWidget,
    })),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-lg" /> },
);

type PaidDashboardViewProps = {
  brandId: string;
};

export function PaidDashboardView({ brandId }: PaidDashboardViewProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-start">
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <PaidMediaReportingWidget brandId={brandId} />
      </div>
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <DCOActionsWidget brandId={brandId} />
      </div>
    </div>
  );
}
