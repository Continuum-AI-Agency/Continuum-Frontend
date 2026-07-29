'use client';

// The workspace's right rail hosts two surfaces now: the node Inspector and the
// Runs list. They are tabs rather than a second drawer because they answer the
// same question from two directions — "what is this step" and "what did it do".
//
// `StableTabs` (a Radix Tabs fork built on Presence) is used with `forceMount`
// plus an explicit `hidden`, so the inactive panel stays MOUNTED and merely
// hidden. Plain Radix Tabs unmount it, which would throw away the inspector's
// scroll position, its focused field and any in-flight edit every time someone
// glanced at the run list.

import type { ReactNode } from 'react';
import { Tabs } from '@/components/ui/StableTabs';
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
    <Tabs.Root
      value={tab}
      onValueChange={(value) => onTabChange(value as RightRailTab)}
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <Tabs.List className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        {RIGHT_RAIL_TABS.map((candidate) => (
          <Tabs.Trigger
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
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <Tabs.Content
        value="inspector"
        forceMount
        hidden={tab !== 'inspector'}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {inspector}
      </Tabs.Content>

      <Tabs.Content
        value="runs"
        forceMount
        hidden={tab !== 'runs'}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {runs}
      </Tabs.Content>
    </Tabs.Root>
  );
}
