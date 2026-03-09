"use client";

import React, { useState } from "react";
import { Tabs, Text } from "@radix-ui/themes";

type Props = {
  activeBrandId?: string;
  paidViewSlot: React.ReactNode;
  organicViewSlot: React.ReactNode;
};

export function HomeBaseDashboard({
  activeBrandId,
  paidViewSlot,
  organicViewSlot,
}: Props) {
  const [activeView, setActiveView] = useState<"paid" | "organic">("organic");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between bg-background">
        <Tabs.Root value={activeView} onValueChange={(v) => setActiveView(v as "paid" | "organic")}>
          <Tabs.List>
            <Tabs.Trigger value="paid">Paid Media</Tabs.Trigger>
            <Tabs.Trigger value="organic">Organic Media</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
        
        <Text size="2" color="gray">
          {activeView === "paid" ? "Campaign performance & DCO logs" : "Social metrics & Trend signals"}
        </Text>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-muted/20">
        <div className="w-full h-full" style={{ display: activeView === "paid" ? "block" : "none" }}>
          {paidViewSlot}
        </div>
        <div className="w-full h-full" style={{ display: activeView === "organic" ? "block" : "none" }}>
          {organicViewSlot}
        </div>
      </div>
    </div>
  );
}
