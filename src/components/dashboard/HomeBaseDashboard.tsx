'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import React from 'react';
import { FirstRunSetup } from '@/components/dashboard/first-run/FirstRunSetup';
import type { DashboardSetupState } from '@/components/dashboard/first-run/setupState';
import { cn } from '@/lib/utils';

type Props = {
  activeView: DashboardView;
  activeViewSlot: React.ReactNode;
  // Absent = treat the brand as fully set up (render the normal data dashboard).
  // Present + incomplete = surface the first-run guided setup.
  setup?: DashboardSetupState;
  brandBookRefreshedAt?: string | null;
};

type DashboardView = 'paid' | 'organic';

const DASHBOARD_VIEWS: Record<
  DashboardView,
  {
    label: string;
    title: string;
    microcopy: string;
  }
> = {
  organic: {
    label: 'Organic',
    title: 'Social metrics & Trend signals',
    microcopy: 'Social performance, audience insights, and trend signals.',
  },
  paid: {
    label: 'Paid',
    title: 'Performance & DCO actions',
    microcopy: 'Ad performance, budget pacing, and DCO actions.',
  },
};

export function HomeBaseDashboard({
  activeView,
  activeViewSlot,
  setup,
  brandBookRefreshedAt = null,
}: Props) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const shouldReduceMotion = useReducedMotion();
  const activeConfig = DASHBOARD_VIEWS[activeView];

  const hasData = setup === undefined || setup.hasConnectedData;
  // Narrow to the value (not a boolean) so `firstRunSetup` is a concrete
  // DashboardSetupState wherever it is truthy — the FirstRunSetup prop is
  // non-optional and a boolean flag would not narrow `setup` at the call site.
  const firstRunSetup = setup !== undefined && !setup.isComplete ? setup : null;

  const handleViewChange = React.useCallback(
    (nextView: DashboardView) => {
      if (nextView === activeView) return;
      const params = new URLSearchParams(window.location.search);
      if (nextView === 'organic') {
        params.delete('view');
      } else {
        params.set('view', nextView);
      }
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `/dashboard?${query}` : '/dashboard', { scroll: false });
      });
    },
    [activeView, router],
  );

  React.useEffect(() => {
    router.prefetch(activeView === 'paid' ? '/dashboard' : '/dashboard?view=paid');
  }, [activeView, router]);

  return (
    <section
      data-tour-id="dashboard-overview"
      className="flex h-[var(--app-content-h)] min-h-[var(--workspace-min-height,600px)] w-full min-w-0 flex-col overflow-hidden bg-background"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-[var(--app-shell-gap)] border-b border-border bg-muted/20 px-[var(--card-pad)] py-[var(--app-shell-pad-block)]">
        {hasData ? (
          <>
            <div className="flex min-w-0 flex-col">
              <h1 className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {activeConfig.title}
              </h1>
              <p className="min-w-0 truncate text-[11px] text-muted-foreground/80">
                {activeConfig.microcopy}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dashboard view
              </span>
              <nav
                className="inline-flex rounded-md border border-border bg-background p-0.5"
                aria-label="Dashboard view options"
              >
                {(Object.keys(DASHBOARD_VIEWS) as DashboardView[]).map((view) => {
                  const config = DASHBOARD_VIEWS[view];
                  const isActive = activeView === view;

                  return (
                    <button
                      key={view}
                      type="button"
                      data-tour-id={view === 'paid' ? 'dashboard-paid-toggle' : undefined}
                      title={config.microcopy}
                      onClick={() => handleViewChange(view)}
                      className={cn(
                        'h-6 rounded px-2.5 text-xs font-medium transition-colors active:scale-[0.96]',
                        isActive
                          ? 'bg-muted/60 text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      style={{ transitionProperty: 'background-color, color, scale' }}
                      aria-pressed={isActive}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </>
        ) : (
          <h1 className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Get started
          </h1>
        )}
      </div>

      {/* No inline padding: the panes inside own their own gutter, so adding one
          here charges the shell gutter a second time and misaligns nothing. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {firstRunSetup ? (
          <FirstRunSetup setup={firstRunSetup} brandBookRefreshedAt={brandBookRefreshedAt} />
        ) : null}

        {hasData ? (
          <>
            {firstRunSetup ? (
              <div className="flex items-center gap-2 px-[var(--card-pad)]">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Your live data
                </span>
                <span className="h-px flex-1 bg-border/70" aria-hidden="true" />
              </div>
            ) : null}
            <motion.div
              key={activeView}
              data-dashboard-panel={activeView}
              className="min-w-0"
              initial={shouldReduceMotion ? false : { opacity: 0.96 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeViewSlot}
            </motion.div>
          </>
        ) : null}
      </div>
    </section>
  );
}
