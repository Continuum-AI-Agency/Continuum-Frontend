'use client';

// Autopilot changes parked for a human.
//
// A guardrail HOLD is not the same as an engine FREEZE (HeldPill / reportModel.freezeLabel):
//   engine freeze    -> the ad set was not scored this cycle (CBO budget, no signal, thin window)
//   guardrail hold   -> it WAS scored, and the move is bigger than max_change_pct_per_cycle,
//                       so autopilot refused to write it without you.
//
// Approving records the decision (optimizer_request_apply_item -> apply_status
// 'approved_pending' + a portfolio_audits row). It is a DB-only write: nothing reaches Meta.
// Executing the approved set is a real Meta write and stays disabled until the sandbox-apply
// bench validates that write on a Meta test ad account — the same gate as every other Apply
// button in this tab. Approved items simply wait; they are never silently dropped.

import type { CycleItemRow } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '../format';
import { partitionHeldItems } from '../reportModel';
import { useOptimizerMutations } from '../useOptimizerData';

type HeldChangesPanelProps = {
  brandId: string;
  adAccountId: string;
  runId: string | null;
  items: CycleItemRow[];
  currency?: string | null;
};

export function HeldChangesPanel({
  brandId,
  adAccountId,
  runId,
  items,
  currency,
}: HeldChangesPanelProps) {
  const { requestApply } = useOptimizerMutations(brandId, adAccountId);

  const { held, approved } = partitionHeldItems(items);
  if (held.length === 0 && approved.length === 0) return null;

  return (
    <div className="space-y-2.5 rounded-lg border border-border/70 bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Held for your approval</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Autopilot scored these but the change is larger than this portfolio&apos;s per-cycle cap,
          so it did not write them. Approving records your decision.
        </p>
      </div>

      <div className="space-y-2">
        {held.map((item) => {
          const busy = requestApply.isPending && requestApply.variables?.adset_id === item.adset_id;
          const changePct = item.change_pct != null ? item.change_pct * 100 : null;
          return (
            <div
              key={item.adset_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium tracking-tight">
                  {formatCurrency(item.current_budget ?? 0, currency)} →{' '}
                  {formatCurrency(item.final_budget ?? 0, currency)}
                  {changePct != null ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({changePct > 0 ? '+' : ''}
                      {changePct.toFixed(1)}%)
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="warning" className="text-3xs uppercase">
                    Held
                  </Badge>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{item.adset_id}</code>
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 gap-1.5 px-3 text-xs"
                disabled={busy || !runId}
                onClick={() =>
                  runId && requestApply.mutate({ run_id: runId, adset_id: item.adset_id })
                }
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Approve this change
              </Button>
            </div>
          );
        })}

        {approved.map((item) => (
          <div
            key={item.adset_id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium tracking-tight">
                {formatCurrency(item.current_budget ?? 0, currency)} →{' '}
                {formatCurrency(item.final_budget ?? 0, currency)}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-3xs uppercase">
                  Approved
                </Badge>
                <code className="rounded bg-muted px-1 py-0.5 text-xs">{item.adset_id}</code>
              </p>
            </div>
          </div>
        ))}
      </div>

      {approved.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <p className="text-2xs text-muted-foreground italic">
            Applying approved changes is disabled while the real Meta write is validated on a test
            ad account. Your approvals are recorded and will run once it is enabled.
          </p>
          <Button
            type="button"
            size="sm"
            disabled
            aria-disabled="true"
            className="h-7 px-3 text-xs"
          >
            Apply {approved.length} approved
          </Button>
        </div>
      ) : null}
    </div>
  );
}
