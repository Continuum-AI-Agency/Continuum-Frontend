'use client';

// The workspace's right rail hosts two surfaces now: the node Inspector and the
// Runs list. They are tabs rather than a second drawer because they answer the
// same question from two directions — "what is this step" and "what did it do".
//
// The inactive panel must stay MOUNTED, or switching to the run list throws away
// the inspector's scroll position, its focused field and any in-flight edit.
// Base UI expresses that as `keepMounted` on the panel; this used to need a
// 281-line fork of Radix Tabs built on its private Presence internals.

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type RightRailTab = 'inspector' | 'runs';

export const RIGHT_RAIL_TABS: readonly RightRailTab[] = ['inspector', 'runs'];

export function RightRailTabs({
  tab,
  onTabChange,
  inspector,
  runs,
}: {
  tab: RightRailTab;
  onTabChange: (tab: RightRailTab) => void;
  inspector: ReactNode;
  runs: ReactNode;
}) {
  return (
    <TabsPrimitive.Root
      value={tab}
      onValueChange={(value) => onTabChange(value as RightRailTab)}
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <TabsPrimitive.List className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        {RIGHT_RAIL_TABS.map((candidate) => (
          <TabsPrimitive.Tab
            key={candidate}
            value={candidate}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
              candidate === tab
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {candidate}
          </TabsPrimitive.Tab>
        ))}
      </TabsPrimitive.List>

      <TabsPrimitive.Panel value="inspector" keepMounted className="min-h-0 flex-1 overflow-hidden">
        {inspector}
      </TabsPrimitive.Panel>

      <TabsPrimitive.Panel value="runs" keepMounted className="min-h-0 flex-1 overflow-hidden">
        {runs}
      </TabsPrimitive.Panel>
    </TabsPrimitive.Root>
  );
}
