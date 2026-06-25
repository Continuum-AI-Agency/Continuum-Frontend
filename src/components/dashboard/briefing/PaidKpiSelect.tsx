"use client";

import type { PaidEntityKpi } from "@continuum/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardPrefsStore } from "@/stores/dashboardPrefs";
import { PAID_KPI_OPTIONS } from "@/lib/paid-media/paid-kpi";

// Chooses the KPI the top-ads tables rank by. The selection lives in the
// persisted dashboard store, so both tables re-sort their already-fetched rows
// in place and the choice survives navigation.
export function PaidKpiSelect() {
  const paidKpi = useDashboardPrefsStore((state) => state.paidKpi);
  const setPaidKpi = useDashboardPrefsStore((state) => state.setPaidKpi);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">Rank by</span>
      <Select value={paidKpi} onValueChange={(value) => setPaidKpi(value as PaidEntityKpi)}>
        <SelectTrigger className="h-7 w-[150px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAID_KPI_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
