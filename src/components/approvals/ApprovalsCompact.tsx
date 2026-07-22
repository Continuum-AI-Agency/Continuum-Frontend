'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { useDryRunMode, usePendingActions } from '@/lib/approvals/queries';
import { useApprovalsStore } from '@/lib/approvals/store';
import { cn } from '@/lib/utils';
import { FocusComposer } from './FocusComposer';
import { LaneStrip } from './LaneStrip';
import { LiveStatusDot } from './LiveStatusDot';

type Props = {
  brandId: string;
  className?: string;
};

/**
 * Embedded variant: just the lane strip + focused composer. No queue list,
 * no table, no page header. Designed to fit dashboard rails and dropdowns.
 * Keyboard shortcuts are scoped to focus (no global listeners) so this can
 * coexist with the standalone /scale/approvals surface.
 */
export function ApprovalsCompact({ brandId, className }: Props) {
  const optimistic = useApprovalsStore((s) => s.pendingDecisions);
  const list = usePendingActions(brandId, 'PENDING');
  const dryRun = useDryRunMode();

  // Local focus state — do NOT share useApprovalsStore.focusedActionId with the
  // standalone route, or both surfaces fight each other when both are mounted.
  const [focusedActionId, setFocusedActionId] = React.useState<string | null>(null);

  const actions = React.useMemo(() => {
    const data = list.data?.data ?? [];
    return data.filter((row) => !optimistic[row.id]);
  }, [list.data?.data, optimistic]);

  React.useEffect(() => {
    if (!actions.length) {
      if (focusedActionId !== null) setFocusedActionId(null);
      return;
    }
    if (!focusedActionId || !actions.some((a) => a.id === focusedActionId)) {
      setFocusedActionId(actions[0]?.id ?? null);
    }
  }, [actions, focusedActionId]);

  const focusedAction = React.useMemo(
    () => actions.find((a) => a.id === focusedActionId) ?? null,
    [actions, focusedActionId],
  );

  const advance = React.useCallback(() => {
    if (!actions.length) {
      setFocusedActionId(null);
      return;
    }
    const currentIndex = actions.findIndex((a) => a.id === focusedActionId);
    const nextIndex =
      currentIndex + 1 < actions.length ? currentIndex + 1 : Math.max(0, currentIndex - 1);
    setFocusedActionId(actions[nextIndex]?.id ?? null);
  }, [actions, focusedActionId]);

  const total = list.data?.total ?? actions.length;
  const isDryRun = dryRun.data?.enabled ?? false;

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3 p-3', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pending
          </span>
          <LiveStatusDot isDryRun={isDryRun} isFetching={list.isFetching} />
          <span className="font-data text-xs tabular-nums text-muted-foreground">{total}</span>
        </div>
        <Link
          href="/scale/approvals"
          className="inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          Full surface
          <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
        </Link>
      </div>

      {actions.length > 0 ? (
        <LaneStrip
          actions={actions}
          focusedId={focusedActionId}
          onFocus={setFocusedActionId}
          bindGlobalKeys={false}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <FocusComposer
          action={focusedAction}
          brandId={brandId}
          isLoading={list.isLoading}
          onAdvance={advance}
          bindGlobalKeys={false}
        />
      </div>
    </div>
  );
}
