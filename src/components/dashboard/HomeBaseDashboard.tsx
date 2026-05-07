"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type Props = {
  paidViewSlot: React.ReactNode;
  organicViewSlot: React.ReactNode;
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
  paidViewSlot,
  organicViewSlot,
}: Props) {
  const [activeView, setActiveView] = useState<DashboardView>("organic");
  const shouldReduceMotion = useReducedMotion();
  const isPaidView = activeView === "paid";
  const activeConfig = DASHBOARD_VIEWS[activeView];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 bg-background">
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/70 bg-muted/20 px-2 py-1">
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
                  onClick={() => setActiveView(view)}
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

        <div className="min-h-0 overflow-hidden p-1">
          <motion.div
            data-dashboard-panel="paid"
            className="h-full min-h-0"
            animate={shouldReduceMotion ? undefined : { opacity: isPaidView ? 1 : 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: isPaidView ? "block" : "none" }}
          >
            {paidViewSlot}
          </motion.div>

          <motion.div
            data-dashboard-panel="organic"
            className="h-full min-h-0"
            animate={shouldReduceMotion ? undefined : { opacity: isPaidView ? 0.98 : 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: isPaidView ? "none" : "block" }}
          >
            {organicViewSlot}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
