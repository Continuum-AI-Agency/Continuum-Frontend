'use client';

import { InstagramLogoIcon, LinkedInLogoIcon } from '@radix-ui/react-icons';
import type * as React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import type { CalendarPlacement } from '@/lib/organic/calendar-generation';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

interface PlacementNotificationCardProps {
  placement: CalendarPlacement;
  timestamp: string;
  onSelect?: (placementId: string) => void;
}

const platformIcons: Record<string, React.ReactNode> = {
  instagram: <InstagramLogoIcon className="w-3.5 h-3.5" />,
  linkedin: <LinkedInLogoIcon className="w-3.5 h-3.5" />,
};

const platformLabels: Record<string, string> = {
  instagram: 'IG',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

export function PlacementNotificationCard({
  placement,
  timestamp,
  onSelect,
}: PlacementNotificationCardProps) {
  const platform = placement.platform.name;
  const content = placement.content;
  const titleTopic = content?.titleTopic || 'New placement';
  const format = content?.format || 'Post';
  const timeLabel = formatRelativeTime(timestamp);

  return (
    <button
      type="button"
      data-testid="placement-card"
      className={cn(
        'w-full cursor-pointer rounded-lg border bg-card p-3 text-left transition-all duration-200',
        'hover:shadow-sm hover:border-primary/50',
      )}
      onClick={() => onSelect?.(placement.placementId)}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pill
              variant="muted"
              className={cn(
                platform === 'instagram' && 'bg-fuchsia-100 text-fuchsia-700',
                platform === 'linkedin' && 'bg-sky-100 text-sky-700',
              )}
            >
              {platformIcons[platform] || null}
              <span>{platformLabels[platform] || platform}</span>
            </Pill>
            <span className="text-xs text-muted-foreground">{format}</span>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{timeLabel}</span>
        </div>

        <span className="text-sm font-medium line-clamp-2">{titleTopic}</span>

        {placement.creative?.creativeIdea && (
          <span className="text-xs text-muted-foreground line-clamp-1">
            {placement.creative.creativeIdea}
          </span>
        )}
      </div>
    </button>
  );
}
