'use client';

// Compact agent-scoped automations list rendered inside the chat sidebars
// (Jaina conversations / Organic sessions) when the Automations mode is
// toggled on. Rows open the detail sheet; the host sidebar's header owns the
// "+ New" button (wired to the same sheet store).

import type { AgentTarget, AutomationRunStatus } from '@continuum/contracts';
import { CalendarClockIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useAutomations } from '@/lib/automations/automations';
import { describeSchedule, formatInTimezone } from '@/lib/automations/schedule';
import { cn } from '@/lib/utils';

const STATUS_INDICATOR: Record<AutomationRunStatus, 'success' | 'error' | 'warning' | 'info'> = {
  completed: 'success',
  failed: 'error',
  running: 'info',
  queued: 'warning',
};

type AutomationsSidebarPanelProps = {
  agent: AgentTarget;
  brandId: string | null;
};

export function AutomationsSidebarPanel({ agent, brandId }: AutomationsSidebarPanelProps) {
  const { data, isLoading } = useAutomations(brandId ?? undefined);
  const router = useRouter();

  const automations = useMemo(
    () => (data ?? []).filter((automation) => automation.agent === agent),
    [data, agent],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="max-h-44 md:max-h-none md:flex-1 md:min-h-0">
        {isLoading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-14 w-full bg-muted/70" />
            <Skeleton className="h-14 w-full bg-muted/70" />
          </div>
        ) : automations.length === 0 ? (
          <Empty className="border-0 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarClockIcon />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No automations yet</EmptyTitle>
              <EmptyDescription className="text-xs">
                Schedule a prompt and email the report to your stakeholders.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-1 p-2">
            {automations.map((automation) => (
              <li key={automation.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full rounded-md border border-transparent px-2.5 py-2 text-left transition-colors',
                    'hover:border-border/70 hover:bg-muted/40',
                  )}
                  onClick={() => router.push(`/automations/${automation.id}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{automation.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {automation.lastRunStatus && (
                        <PillIndicator
                          variant={STATUS_INDICATOR[automation.lastRunStatus]}
                          pulse={automation.lastRunStatus === 'running'}
                        />
                      )}
                      {!automation.enabled && (
                        <Pill className="px-1.5 py-0 text-[10px]">Paused</Pill>
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {describeSchedule(automation.schedule)}
                  </p>
                  {automation.enabled && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                      Next:{' '}
                      {formatInTimezone(
                        new Date(automation.nextRunAt),
                        automation.schedule.timezone,
                      )}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
