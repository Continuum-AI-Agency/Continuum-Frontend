"use client";

import React, { startTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@radix-ui/themes";
import { prefetchMetricsDashboard } from "@/lib/prefetch/organic-metrics-cache";

// ViewTransition ships in the React canary build bundled by Next.js (experimental.viewTransition: true).
// Stable @types/react doesn't include it yet, so we pull it at runtime via cast.
const ViewTransition = (React as unknown as { ViewTransition: React.ComponentType<{ children: React.ReactNode }> }).ViewTransition;

type MetricsPrefetchParams = {
  brandId: string;
  integrationAccountId: string;
  platform: "instagram" | "facebook" | "tiktok";
};

type Props = {
  plannerSlot: React.ReactNode;
  metricsSlot: React.ReactNode;
  metricsPrefetchParams?: MetricsPrefetchParams;
};

export function OrganicWorkspaceTabs({ plannerSlot, metricsSlot, metricsPrefetchParams }: Props) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialView: "planner" | "metrics" = tabParam === "metrics" ? "metrics" : "planner";
  const [activeView, setActiveView] = React.useState<"planner" | "metrics">(initialView);
  // Track whether metrics tab has ever been shown — once mounted, keep it alive
  // so switching back doesn't re-fetch / re-mount the chart components.
  const [metricsEverShown, setMetricsEverShown] = React.useState(initialView === "metrics");

  // Prefetch metrics data while user is on the planner tab
  React.useEffect(() => {
    if (activeView !== "planner" || !metricsPrefetchParams) return;
    const { brandId, integrationAccountId, platform } = metricsPrefetchParams;
    if (!integrationAccountId) return;

    const idleHandle = typeof requestIdleCallback === "function"
      ? requestIdleCallback(() => prefetchMetricsDashboard({ brandId, integrationAccountId, platform }))
      : setTimeout(() => prefetchMetricsDashboard({ brandId, integrationAccountId, platform }), 2000);

    return () => {
      if (typeof cancelIdleCallback === "function" && typeof idleHandle === "number") {
        cancelIdleCallback(idleHandle);
      } else {
        clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      }
    };
  }, [activeView, metricsPrefetchParams]);

  React.useEffect(() => {
    const nextView: "planner" | "metrics" = tabParam === "metrics" ? "metrics" : "planner";
    if (nextView !== activeView) {
      setActiveView(nextView);
      if (nextView === "metrics") setMetricsEverShown(true);
    }
  }, [activeView, tabParam]);

  const handleValueChange = React.useCallback(
    (value: string) => {
      const nextView: "planner" | "metrics" = value === "planner" ? "planner" : "metrics";

      const apply = () => {
        setActiveView(nextView);
        if (nextView === "metrics") setMetricsEverShown(true);
        // Use history.replaceState instead of router.replace to avoid triggering
        // a Next.js server re-render (which would flash the Suspense fallback).
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", nextView);
        window.history.replaceState(null, "", `?${params.toString()}`);
      };

      startTransition(apply);
    },
    [searchParams]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      <div className="shrink-0 px-1 pb-1">
        <Tabs.Root value={activeView} onValueChange={handleValueChange}>
          <Tabs.List>
            <Tabs.Trigger value="planner">Planner</Tabs.Trigger>
            <Tabs.Trigger value="metrics">Metrics Dashboard</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>

      <ViewTransition>
        <div className="flex-1 min-h-0">
          {/* Always render planner — it's the default tab */}
          <div className="h-full w-full" hidden={activeView !== "planner"}>{plannerSlot}</div>
          {/* Defer metrics mount until first viewed, then keep alive to avoid re-fetch */}
          {metricsEverShown && (
            <div className="h-full w-full" hidden={activeView !== "metrics"}>{metricsSlot}</div>
          )}
        </div>
      </ViewTransition>
    </div>
  );
}
