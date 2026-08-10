'use client';

// Collapsible wrapper around the awareness report — the lifecycle/activity
// blocks that used to be the Overview tab now live at the bottom of the
// Competitive Report as "Recent activity".

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAwarenessReport } from '@/lib/api/competitorSpy';
import { cn } from '@/lib/utils';
import { BlockCard } from '../AwarenessReportView';

export function RecentActivitySection({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  const { data: report } = useAwarenessReport(brandId);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger
        render={
          <button
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
            type="button"
          >
            <span>Recent competitor activity</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        }
      />
      <CollapsibleContent className="space-y-4 pt-3">
        {!report ? (
          <p className="text-xs text-muted-foreground">
            No awareness report yet — it refreshes after each scan.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Window: {new Date(report.windowStart).toLocaleDateString()} –{' '}
              {new Date(report.windowEnd).toLocaleDateString()}
            </p>
            {report.blocks.map((block, i) => (
              <BlockCard block={block} key={`${block.category}-${i}`} />
            ))}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
