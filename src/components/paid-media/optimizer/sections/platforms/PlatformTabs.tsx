'use client';

// The row of platform tabs above the Overview's headline: All · Meta · Google · TikTok. The
// active tab is underlined in its platform's colour ("All" in the foreground colour, it is no
// platform). A platform without a connection stays in the row and says "Connect" — it never
// disappears, because a missing tab reads as "we don't do TikTok" rather than "you haven't
// connected it yet" (frontend.html §2, Recomendación).

import { cn } from '@/lib/utils';
import { PlatformIcon, platformColor } from './PlatformChip';
import {
  type AdPlatform,
  PLATFORM_TABS,
  type PlatformTab,
  platformTabLabel,
} from './platformTabsModel';

type PlatformTabsProps = {
  value: PlatformTab;
  onChange: (tab: PlatformTab) => void;
  connected: Record<AdPlatform, boolean>;
};

export function PlatformTabs({ value, onChange, connected }: PlatformTabsProps) {
  return (
    <div
      aria-label="Ad platform"
      className="flex items-end gap-1 overflow-x-auto border-border/70 border-b px-1"
      data-testid="platform-tabs"
      role="tablist"
    >
      {PLATFORM_TABS.map((tab) => {
        const active = tab === value;
        const platform = tab === 'all' ? null : tab;
        const disconnected = platform != null && !connected[platform];
        return (
          <button
            aria-selected={active}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? cn(
                    'font-semibold text-foreground',
                    platform ? platformColor(platform).underline : 'border-foreground',
                  )
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            data-connected={platform == null ? undefined : String(!disconnected)}
            data-tab={tab}
            data-testid={`platform-tab-${tab}`}
            key={tab}
            onClick={() => onChange(tab)}
            role="tab"
            type="button"
          >
            {platform ? <PlatformIcon platform={platform} /> : null}
            {platformTabLabel(tab)}
            {disconnected ? (
              <span className="font-normal text-muted-foreground text-xs">· Connect</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
