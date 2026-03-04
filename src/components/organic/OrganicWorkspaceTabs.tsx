"use client";

import React from "react";
import { Tabs } from "@radix-ui/themes";

type Props = {
  plannerSlot: React.ReactNode;
  metricsSlot: React.ReactNode;
};

export function OrganicWorkspaceTabs({ plannerSlot, metricsSlot }: Props) {
  const [activeView, setActiveView] = React.useState<"planner" | "metrics">("planner");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      <div className="shrink-0 px-1 pb-1">
        <Tabs.Root value={activeView} onValueChange={(value) => setActiveView(value as "planner" | "metrics")}>
          <Tabs.List>
            <Tabs.Trigger value="planner">Planner</Tabs.Trigger>
            <Tabs.Trigger value="metrics">Metrics Dashboard</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>

      <div className="flex-1 min-h-0">
        <div className="h-full w-full" style={{ display: activeView === "planner" ? "block" : "none" }}>
          {plannerSlot}
        </div>
        <div className="h-full w-full" style={{ display: activeView === "metrics" ? "block" : "none" }}>
          {metricsSlot}
        </div>
      </div>
    </div>
  );
}
