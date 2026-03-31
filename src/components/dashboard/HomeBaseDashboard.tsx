"use client";

import React, { useState } from "react";
import { Tabs, Text } from "@radix-ui/themes";

type Props = {
  paidViewSlot: React.ReactNode;
  organicViewSlot: React.ReactNode;
};

export function HomeBaseDashboard({
  paidViewSlot,
  organicViewSlot,
}: Props) {
  const [activeView, setActiveView] = useState<"paid" | "organic">("organic");

  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 shrink-0 px-4 py-3 border-b flex items-center justify-between bg-background">
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

      <div className="bg-muted/20 p-4 space-y-4">
        <div className={activeView !== "paid" ? "hidden" : undefined}>
          {paidViewSlot}
        </div>
        <div className={activeView !== "organic" ? "hidden" : undefined}>
          {organicViewSlot}
        </div>
      </div>
    </div>
  );
}
