'use client';

import { List, Table as TableIcon } from 'lucide-react';
import * as React from 'react';
import { FocusComposer } from '@/components/approvals/FocusComposer';
import { KeymapHint } from '@/components/approvals/KeymapHint';
import { LaneStrip } from '@/components/approvals/LaneStrip';
import { LiveStatusDot } from '@/components/approvals/LiveStatusDot';
import { QueueList } from '@/components/approvals/QueueList';
import { QueueTable } from '@/components/approvals/QueueTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDryRunMode, usePendingActions } from '@/lib/approvals/queries';
import { useApprovalsStore } from '@/lib/approvals/store';

type Props = {
  brandProfileId: string;
  brandName: string;
};

export default function ApprovalsClient({ brandProfileId, brandName }: Props) {
  const status = useApprovalsStore((s) => s.statusFilter);
  const viewMode = useApprovalsStore((s) => s.viewMode);
  const setViewMode = useApprovalsStore((s) => s.setViewMode);
  const focusedActionId = useApprovalsStore((s) => s.focusedActionId);
  const setFocusedActionId = useApprovalsStore((s) => s.setFocusedActionId);
  const optimistic = useApprovalsStore((s) => s.pendingDecisions);

  const list = usePendingActions(brandProfileId, status);
  const dryRun = useDryRunMode();

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
  }, [actions, focusedActionId, setFocusedActionId]);

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
    const next = actions[nextIndex];
    setFocusedActionId(next?.id ?? null);
  }, [actions, focusedActionId, setFocusedActionId]);

  // T toggles queue view mode globally.
  React.useEffect(() => {
    function handler(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        setViewMode(viewMode === 'focus' ? 'table' : 'focus');
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setViewMode, viewMode]);

  const total = list.data?.total ?? actions.length;
  const isDryRun = dryRun.data?.enabled ?? false;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-6 p-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Approvals
            <LiveStatusDot isDryRun={isDryRun} isFetching={list.isFetching} />
          </span>
        }
        description={
          <span className="font-data">
            {brandName} <span className="opacity-50">·</span> {total} {status.toLowerCase()}
          </span>
        }
        action={<KeymapHint />}
      />

      <LaneStrip actions={actions} focusedId={focusedActionId} onFocus={setFocusedActionId} />

      <FocusComposer
        action={focusedAction}
        brandId={brandProfileId}
        isLoading={list.isLoading}
        onAdvance={advance}
      />

      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'focus' | 'table')}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs uppercase tracking-wider text-muted-foreground">
            Queue ({actions.length})
          </span>
          <TooltipProvider delayDuration={200}>
            <TabsList className="h-7 p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="focus" className="size-6 p-0" aria-label="List view">
                    <List className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  List view
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="table" className="size-6 p-0" aria-label="Table view (T)">
                    <TableIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Table view · T
                </TooltipContent>
              </Tooltip>
            </TabsList>
          </TooltipProvider>
        </div>
        <TabsContent value="focus" className="mt-2">
          <QueueList actions={actions} focusedId={focusedActionId} onFocus={setFocusedActionId} />
        </TabsContent>
        <TabsContent value="table" className="mt-2">
          <QueueTable actions={actions} onSelect={setFocusedActionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
