'use client';

// Autopilot changes parked for a human.
//
// A guardrail HOLD is not the same as an engine FREEZE (HeldPill / reportModel.freezeLabel):
//   engine freeze    -> the ad set was not scored this cycle (CBO budget, no signal, thin window)
//   guardrail hold   -> it WAS scored, and the move is bigger than max_change_pct_per_cycle,
//                       so autopilot refused to write it without you.
//
// Approving records the decision (optimizer_request_apply_item -> apply_status
// 'approved_pending'). "Apply N approved" then executes those rows via
// optimizer-apply-approved (dryRun:false) — real Meta budget writes, ledger-guarded.

import type { CycleItemRow } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '../format';
import { partitionHeldItems } from '../reportModel';
import { useApplyApproved, useOptimizerMutations } from '../useOptimizerData';

type HeldChangesPanelProps = {
  brandId: string;
  adAccountId: string;
  portfolioId: string;
  runId: string | null;
  items: CycleItemRow[];
  currency?: string | null;
};

export function HeldChangesPanel({
  brandId,
  adAccountId,
  portfolioId,
  runId,
  items,
  currency,
}: HeldChangesPanelProps) {
  const { requestApply } = useOptimizerMutations(brandId, adAccountId);
  const applyApproved = useApplyApproved();
  const [applyNote, setApplyNote] = React.useState<string | null>(null);

  const { held, approved } = partitionHeldItems(items);
  if (held.length === 0 && approved.length === 0) return null;

  const handleApplyApproved = () => {
    setApplyNote(null);
    applyApproved.mutate(
      {
        portfolio_id: portfolioId,
        brandId,
        accountId: adAccountId,
        run_id: runId ?? undefined,
        dryRun: false,
      },
      {
        onSuccess: (data) => {
          if (!data?.ok) {
            setApplyNote(
              data?.reason === 'observe_mode'
                ? 'Observe mode blocks Meta writes.'
                : (data?.error ?? data?.reason ?? 'Apply approved failed.'),
            );
            return;
          }
          setApplyNote(
            `Applied ${data.applied ?? 0}` +
              (data.failed ? ` · ${data.failed} failed` : '') +
              (data.deduped ? ` · ${data.deduped} already applied` : ''),
          );
        },
        onError: (err) => {
          setApplyNote(err instanceof Error ? err.message : 'Apply approved failed.');
        },
      },
    );
  };

  return (
    <div className="space-y-2.5 rounded-lg border border-border/70 bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Held for your approval</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Autopilot scored these but the change is larger than this portfolio&apos;s per-cycle cap,
          so it did not write them. Approve each change, then apply the approved set to Meta.
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
          <p className="text-2xs text-muted-foreground">
            {applyNote ??
              `Ready to write ${approved.length} approved change${approved.length === 1 ? '' : 's'} to Meta.`}
          </p>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 px-3 text-xs"
            disabled={applyApproved.isPending || !runId}
            onClick={handleApplyApproved}
          >
            {applyApproved.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Apply {approved.length} approved
          </Button>
        </div>
      ) : null}
    </div>
  );
}
