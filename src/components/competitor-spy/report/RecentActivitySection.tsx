'use client';
import { useLocale, useTranslations } from 'next-intl';

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
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
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
            <span>{uiText('recent_competitor_activity_0ce66c3')}</span>
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
            {uiText('no_awareness_report_yet_it_refreshes_after_ea_f00eee2')}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {uiText.rich('sentence_f4610391e0a9', {
                v0: () => new Date(report.windowStart).toLocaleDateString(uiLocale),
                v1: () => new Date(report.windowEnd).toLocaleDateString(uiLocale),
              })}
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
