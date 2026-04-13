"use client";

import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Tabs, Text } from "@radix-ui/themes";
import { cn } from "@/lib/utils";

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

        <Text size="2" color={activeView === "paid" ? "amber" : "green"}>
          {activeView === "paid" ? "Campaign performance & DCO logs" : "Social metrics & Trend signals"}
        </Text>
      </div>

      <div className={cn("p-4 space-y-4 transition-colors duration-200", activeView === "paid" ? "bg-amber-500/[0.04]" : "bg-emerald-500/[0.04]")}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeView === "paid" ? paidViewSlot : organicViewSlot}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
