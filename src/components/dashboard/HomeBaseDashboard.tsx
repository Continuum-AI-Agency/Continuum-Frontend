"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  SurfaceTourTrigger,
  useReadyAfterPaint,
} from "@/components/onboarding/v2/tour/SurfaceTourTrigger";
import { TOUR_DASHBOARD } from "@/components/onboarding/v2/tour/config";
import { useTourTabStore } from "@/components/onboarding/v2/tour/tourTabStore";

type Props = {
  activeView: DashboardView;
  activeViewSlot: React.ReactNode;
};

type DashboardView = "paid" | "organic";

const DASHBOARD_VIEWS: Record<
  DashboardView,
  {
    label: string;
    title: string;
  }
> = {
  organic: {
    label: "Organic",
    title: "Social metrics & Trend signals",
  },
  paid: {
    label: "Paid",
    title: "Performance & DCO actions",
  },
};

export function HomeBaseDashboard({
  activeView,
  activeViewSlot,
}: Props) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const shouldReduceMotion = useReducedMotion();
  const isPaidView = activeView === "paid";
  const activeConfig = DASHBOARD_VIEWS[activeView];

  const handleViewChange = React.useCallback(
    (nextView: DashboardView) => {
      if (nextView === activeView) return;
      const params = new URLSearchParams(window.location.search);
      if (nextView === "organic") {
        params.delete("view");
      } else {
        params.set("view", nextView);
      }
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `/dashboard?${query}` : "/dashboard", { scroll: false });
      });
    },
    [activeView, router]
  );

  React.useEffect(() => {
    router.prefetch(activeView === "paid" ? "/dashboard" : "/dashboard?view=paid");
  }, [activeView, router]);

  // The dashboard tour switches between the Organic and Paid views by
  // requesting a view through the shared tour store. Depend on requestId so a
  // repeated request for the same view still re-runs.
  const requestedTourView = useTourTabStore((state) => state.dashboardView);
  const tourRequestId = useTourTabStore((state) => state.requestId);
  React.useEffect(() => {
    if (requestedTourView && requestedTourView !== activeView) {
      handleViewChange(requestedTourView);
    }
  }, [requestedTourView, tourRequestId, activeView, handleViewChange]);

  // Step 1 targets the always-present dashboard shell; the tour itself walks
  // the user onto the Paid view, so gating first-run on the organic view keeps
  // the opening steps anchored.
  const tourReady = useReadyAfterPaint(activeView === "organic");

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col">
      <SurfaceTourTrigger tourName={TOUR_DASHBOARD} ready={tourReady} />
      <section
        data-tour-id="dashboard-overview"
        className="flex min-h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-[var(--app-shell-gap)] border-b border-border/70 bg-muted/20 px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
          <h1 className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {activeConfig.title}
          </h1>

          <nav
            className="inline-flex shrink-0 rounded-md border border-border/70 bg-background p-0.5"
            aria-label="Dashboard workspace"
          >
            {(Object.keys(DASHBOARD_VIEWS) as DashboardView[]).map((view) => {
              const config = DASHBOARD_VIEWS[view];
              const isActive = activeView === view;

              return (
                <button
                  key={view}
                  type="button"
                  data-tour-id={view === "paid" ? "dashboard-paid-toggle" : undefined}
                  onClick={() => handleViewChange(view)}
                  className={cn(
                    "h-6 rounded px-2.5 text-[11px] font-medium transition-colors active:scale-[0.96]",
                    isActive ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  style={{ transitionProperty: "background-color, color, scale" }}
                  aria-pressed={isActive}
                >
                  {config.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="min-h-0 flex-1 px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
          <motion.div
            key={activeView}
            data-dashboard-panel={activeView}
            className={cn(
              isPaidView
                ? "min-h-[var(--dashboard-home-paid-min-height)]"
                : "min-h-[var(--dashboard-home-organic-min-height)]"
            )}
            initial={shouldReduceMotion ? false : { opacity: 0.96 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeViewSlot}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
