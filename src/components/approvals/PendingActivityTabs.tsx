'use client';

import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePendingActions } from '@/lib/approvals/queries';
import { cn } from '@/lib/utils';
import { ApprovalsCompact } from './ApprovalsCompact';

type Variant = 'rail' | 'dropdown';

type Props = {
  brandId: string;
  variant?: Variant;
  className?: string;
  /** The existing Activity Log content — kept untouched, mounted in the Activity tab. */
  activityContent: React.ReactNode;
};

/**
 * Tab control that fronts the live Pending queue (compact Approvals) alongside
 * the existing DCO Activity Log. Drops in where DCOActionsWidget or
 * DCOActionAlertsBox were mounted previously; the consumer passes the activity
 * widget as `activityContent`.
 */
export function PendingActivityTabs({
  brandId,
  variant = 'rail',
  activityContent,
  className,
}: Props) {
  const list = usePendingActions(brandId, 'PENDING');
  const pendingCount = list.data?.total ?? 0;

  return (
    <Tabs
      defaultValue={pendingCount > 0 ? 'pending' : 'activity'}
      className={cn('flex h-full min-h-0 flex-col', className)}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-2 border-b border-border/70 bg-card px-2 py-1.5',
          variant === 'dropdown' && 'px-3',
        )}
      >
        <TabsList className="h-7 p-0.5">
          <TabsTrigger value="pending" className="h-6 gap-1.5 px-2 text-xs">
            Pending
            {pendingCount > 0 ? (
              <Badge
                variant="secondary"
                className="h-4 min-w-[1rem] justify-center px-1 font-data text-3xs tabular-nums leading-none"
              >
                {pendingCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="activity" className="h-6 px-2 text-xs">
            Activity
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="pending" className="min-h-0 flex-1 overflow-hidden">
        <ApprovalsCompact brandId={brandId} />
      </TabsContent>

      <TabsContent value="activity" className="min-h-0 flex-1 overflow-hidden">
        {activityContent}
      </TabsContent>
    </Tabs>
  );
}
