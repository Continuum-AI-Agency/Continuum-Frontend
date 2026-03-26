"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@radix-ui/themes";

type Props = {
  plannerSlot: React.ReactNode;
  metricsSlot: React.ReactNode;
};

export function OrganicWorkspaceTabs({ plannerSlot, metricsSlot }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const initialView: "planner" | "metrics" = tabParam === "metrics" ? "metrics" : "planner";
  const [activeView, setActiveView] = React.useState<"planner" | "metrics">(initialView);

  React.useEffect(() => {
    const nextView: "planner" | "metrics" = tabParam === "metrics" ? "metrics" : "planner";
    if (nextView !== activeView) {
      setActiveView(nextView);
    }
  }, [activeView, tabParam]);

  const handleValueChange = React.useCallback(
    (value: string) => {
      const nextView: "planner" | "metrics" = value === "planner" ? "planner" : "metrics";
      setActiveView(nextView);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextView);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
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

      <div className="flex-1 min-h-0">
        {activeView === "planner" ? (
          <div className="h-full w-full">{plannerSlot}</div>
        ) : (
          <div className="h-full w-full">{metricsSlot}</div>
        )}
      </div>
    </div>
  );
}
