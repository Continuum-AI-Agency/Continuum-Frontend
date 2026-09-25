'use client';

// The 3 / 7 / 14-day switch for cost-per-result reads. These are the engine's own
// scoring windows (the numbers a move was judged on), which is why the choice stops at 14.

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { STORY_LOOKBACKS, type StoryLookback } from './reallocationStoryModel';

type LookbackToggleProps = {
  value: StoryLookback;
  onChange: (next: StoryLookback) => void;
  className?: string;
  /** `lg` is the roomier Activity-tab scale; the default keeps the dense chart chrome. */
  size?: LookbackToggleSize;
};

type LookbackToggleSize = 'default' | 'lg';

const ITEM_CLASS: Record<LookbackToggleSize, string> = {
  default: 'h-6 px-2 text-2xs',
  lg: 'h-9 px-3 text-sm',
};

export function LookbackToggle({
  value,
  onChange,
  className,
  size = 'default',
}: LookbackToggleProps) {
  return (
    <ToggleGroup
      aria-label="Cost per result lookback"
      className={className}
      onValueChange={(next) => {
        if (next) onChange(Number(next) as StoryLookback);
      }}
      size="sm"
      type="single"
      value={String(value)}
      variant="outline"
    >
      {STORY_LOOKBACKS.map((days) => (
        <ToggleGroupItem className={ITEM_CLASS[size]} key={days} value={String(days)}>
          {days}d
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
