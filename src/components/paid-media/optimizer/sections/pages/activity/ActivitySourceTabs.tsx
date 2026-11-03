'use client';

// Which hand the page shows — All, Optimizer, Team, Platform — with each one's count and its
// colour, so the filter is also the chart's legend. It narrows the markers and the list together.

import { cn } from '@/lib/utils';
import {
  ACTIVITY_SOURCES,
  type ActivitySource,
  type ActivitySourceFilter,
  SOURCE_COLOR,
  SOURCE_COPY,
} from './activityModel';

export function ActivitySourceTabs({
  value,
  counts,
  onChange,
}: {
  value: ActivitySourceFilter;
  counts: Record<ActivitySource, number>;
  onChange: (value: ActivitySourceFilter) => void;
}) {
  const total = ACTIVITY_SOURCES.reduce((sum, source) => sum + counts[source], 0);
  const options: { value: ActivitySourceFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: total },
    ...ACTIVITY_SOURCES.map((source) => ({
      value: source,
      label: SOURCE_COPY[source].label,
      count: counts[source],
    })),
  ];
  return (
    <fieldset
      className="hit-area-row inline-flex max-w-full shrink-0 gap-0.5 overflow-x-auto rounded-lg border-0 bg-muted/60 p-0.5 [--hit-area-gap:calc(var(--spacing)*0.5)] [scrollbar-width:none]"
      data-testid="activity-source-filter"
    >
      <legend className="sr-only">Show changes made by</legend>
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={cn(
            'hit-area inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-xs tabular-nums transition-colors',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          data-source-option={option.value}
          key={option.value}
          onClick={() => onChange(option.value)}
          title={option.value === 'all' ? undefined : SOURCE_COPY[option.value].hint}
          type="button"
        >
          {option.value === 'all' ? null : (
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: SOURCE_COLOR[option.value] }}
            />
          )}
          {option.label}
          <span className="text-muted-foreground">{option.count}</span>
        </button>
      ))}
    </fieldset>
  );
}
