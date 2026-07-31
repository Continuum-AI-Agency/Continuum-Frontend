'use client';

import { useSearchParams } from 'next/navigation';
import React, { startTransition } from 'react';
import { GenerationsPopover } from '@/components/organic/agent/GenerationsPopover';
import { useGenerationJobsRealtime } from '@/components/organic/hooks/useGenerationJobsRealtime';
import { writePlannerUrlState } from '@/lib/organic/plannerUrlState';
import { useCalendarStore } from '@/lib/organic/store';
import { prefetchMetricsDashboard } from '@/lib/prefetch/organic-metrics-cache';
import { cn } from '@/lib/utils';

// ViewTransition ships in the React canary build bundled by Next.js (experimental.viewTransition: true).
// Stable @types/react doesn't include it yet, so we pull it at runtime via cast.
const ViewTransition =
  (React as unknown as { ViewTransition?: React.ComponentType<{ children: React.ReactNode }> })
    .ViewTransition ??
  function ViewTransitionFallback({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };

type MetricsPrefetchParams = {
  brandId: string;
  integrationAccountId: string;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin';
};

type Props = {
  plannerSlot: React.ReactNode;
  metricsSlot: React.ReactNode;
  metricsPrefetchParams?: MetricsPrefetchParams;
  agentSlot?: React.ReactNode;
  brandId?: string | null;
};

const WORKSPACE_LABELS: Record<'planner' | 'metrics' | 'agent', string> = {
  planner: 'Planner',
  metrics: 'Metrics',
  agent: 'Agent',
};

export function OrganicWorkspaceTabs({
  plannerSlot,
  metricsSlot,
  metricsPrefetchParams,
  agentSlot,
  brandId,
}: Props) {
  const searchParams = useSearchParams();
  const setSelectedDraftId = useCalendarStore((s) => s.setSelectedDraftId);
  const tabParam = searchParams.get('tab');
  const initialView: 'planner' | 'metrics' | 'agent' =
    tabParam === 'metrics' ? 'metrics' : tabParam === 'agent' ? 'agent' : 'planner';
  const [activeView, setActiveView] = React.useState<'planner' | 'metrics' | 'agent'>(initialView);
  // Track whether metrics/agent tabs have ever been shown — once mounted, keep alive
  // so switching back doesn't re-fetch / re-mount the components.
  const [metricsEverShown, setMetricsEverShown] = React.useState(initialView === 'metrics');
  const [agentEverShown, setAgentEverShown] = React.useState(initialView === 'agent');

  // Prefetch metrics data while user is on the planner tab
  React.useEffect(() => {
    if (activeView !== 'planner' || !metricsPrefetchParams) return;
    const { brandId, integrationAccountId, platform } = metricsPrefetchParams;
    if (!integrationAccountId) return;

    const idleHandle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(() =>
            prefetchMetricsDashboard({ brandId, integrationAccountId, platform }),
          )
        : setTimeout(
            () => prefetchMetricsDashboard({ brandId, integrationAccountId, platform }),
            2000,
          );

    return () => {
      if (typeof cancelIdleCallback === 'function' && typeof idleHandle === 'number') {
        cancelIdleCallback(idleHandle);
      } else {
        clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      }
    };
  }, [activeView, metricsPrefetchParams]);

  React.useEffect(() => {
    const nextView: 'planner' | 'metrics' | 'agent' =
      tabParam === 'metrics' ? 'metrics' : tabParam === 'agent' ? 'agent' : 'planner';
    if (nextView !== activeView) {
      setActiveView(nextView);
      if (nextView === 'metrics') setMetricsEverShown(true);
      if (nextView === 'agent') setAgentEverShown(true);
    }
  }, [activeView, tabParam]);

  const handleValueChange = React.useCallback((value: string) => {
    const nextView = value as 'planner' | 'metrics' | 'agent';

    const apply = () => {
      setActiveView(nextView);
      if (nextView === 'metrics') setMetricsEverShown(true);
      if (nextView === 'agent') setAgentEverShown(true);
      // One writer for every planner URL param (see plannerUrlState): still
      // history.replaceState under the hood, so no Next re-render and no Suspense flash.
      writePlannerUrlState({ tab: nextView });
    };

    startTransition(apply);
  }, []);

  // Active brand for the shell-wide ticker. Realtime on organic.post_generation_jobs
  // keeps the live generation summaries fresh on every tab (the ticker lives here,
  // outside the tab panels, so its counts survive tab switches).
  const tickerBrandId = brandId ?? metricsPrefetchParams?.brandId ?? null;
  useGenerationJobsRealtime(tickerBrandId);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border bg-background">
      <div className="flex min-h-10 items-center justify-between gap-[var(--app-shell-gap)] border-b px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
        <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">Organic</h1>

        <div className="flex shrink-0 items-center gap-2">
          {/* Shell-wide live generations: visible on every tab once any post is generating. */}
          <GenerationsPopover
            brandId={tickerBrandId}
            onViewDraftAction={(draftId) => {
              setSelectedDraftId(draftId);
              handleValueChange('planner');
            }}
          />

          <nav
            className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5"
            aria-label="Organic workspace"
          >
            {(
              ['planner', 'metrics', ...(agentSlot !== undefined ? ['agent'] : [])] as Array<
                'planner' | 'metrics' | 'agent'
              >
            ).map((view) => {
              const isActive = activeView === view;

              return (
                <button
                  key={view}
                  type="button"
                  data-tour-id={
                    view === 'metrics'
                      ? 'organic-metrics-tab'
                      : view === 'agent'
                        ? 'organic-agent-tab'
                        : undefined
                  }
                  onClick={() => handleValueChange(view)}
                  className={cn(
                    'h-7 rounded-md px-3 text-xs font-medium transition-colors sm:h-8 sm:px-3.5 sm:text-sm',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={isActive}
                >
                  {WORKSPACE_LABELS[view]}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <ViewTransition>
        <div className="min-h-0 overflow-hidden px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
          {/* Always render planner — it's the default tab */}
          <div className="h-full w-full min-h-0 overflow-hidden" hidden={activeView !== 'planner'}>
            {plannerSlot}
          </div>
          {/* Defer metrics mount until first viewed, then keep alive to avoid re-fetch */}
          {metricsEverShown && (
            <div
              className="h-full w-full min-h-0 overflow-hidden"
              hidden={activeView !== 'metrics'}
            >
              {metricsSlot}
            </div>
          )}
          {/* Defer agent mount until first viewed, then keep alive */}
          {agentSlot !== undefined && agentEverShown && (
            <div className="h-full w-full min-h-0 overflow-hidden" hidden={activeView !== 'agent'}>
              {agentSlot}
            </div>
          )}
        </div>
      </ViewTransition>
    </div>
  );
}
