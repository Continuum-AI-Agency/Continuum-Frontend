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
    <div className="h-full min-h-0 w-full p-2 sm:p-3">
      <section className="grid h-[calc(100dvh-5.5rem)] min-h-[680px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border bg-background">
        <div className="flex min-h-10 items-center justify-between gap-2 border-b px-2 py-1.5 sm:px-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">{activeConfig.title}</h1>
          </div>

          <nav
            className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5"
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
                    "h-7 rounded-md px-3 text-xs font-medium transition-colors sm:h-8 sm:px-3.5 sm:text-sm",
                    isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-pressed={isActive}
                >
                  {config.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="min-h-0 overflow-y-auto p-2 sm:p-3">
          <motion.div
            data-dashboard-panel="paid"
            className="h-full"
            animate={shouldReduceMotion ? undefined : { opacity: isPaidView ? 1 : 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: isPaidView ? "block" : "none" }}
          >
            {paidViewSlot}
          </motion.div>

          <motion.div
            data-dashboard-panel="organic"
            className="h-full"
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
