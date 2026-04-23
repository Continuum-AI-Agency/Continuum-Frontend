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
  const isPaidView = activeView === "paid";

  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 shrink-0 px-4 py-3 border-b flex items-center justify-between bg-background">
        <Text size="1" className="uppercase tracking-[0.14em] text-muted-foreground">Dashboard</Text>
        <Tabs.Root value={activeView} onValueChange={(v) => setActiveView(v as "paid" | "organic")}>
          <Tabs.List size="2">
            <Tabs.Trigger value="paid">Paid Media</Tabs.Trigger>
            <Tabs.Trigger value="organic">Organic Media</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>

      <div className={cn("p-4 space-y-3 transition-colors duration-200", isPaidView ? "bg-amber-500/[0.04]" : "bg-emerald-500/[0.04]")}>
        <AnimatePresence mode="wait" initial={false}>
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
