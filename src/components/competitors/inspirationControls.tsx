'use client';

// The Inspiration surface's two control shapes: a segmented switch for exclusive
// modes (source, sort) and a chip row for filters, where each chip carries how
// many posts it would return.

import { cn } from '@/lib/utils';

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  label,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  return (
    <fieldset
      aria-label={label}
      className="inline-flex min-w-0 items-center gap-0.5 rounded-lg border border-border p-0.5"
    >
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export function FilterChips<T extends string>({
  label,
  value,
  options,
  total,
  onChange,
}: {
  label: string;
  value: T | 'all';
  options: Array<{ id: T; label: string; count: number }>;
  total: number;
  onChange: (id: T | 'all') => void;
}) {
  const chips: Array<{ id: T | 'all'; label: string; count: number }> = [
    { id: 'all', label: 'All', count: total },
    ...options,
  ];
  return (
    <fieldset aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span aria-hidden className="w-20 shrink-0 text-2xs font-medium text-muted-foreground">
        {label}
      </span>
      {chips.map((chip) => {
        const active = value === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={active}
            data-chip={chip.id}
            onClick={() => onChange(chip.id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              active
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            {chip.label}
            <span className={cn('tabular-nums', active ? 'opacity-70' : 'opacity-60')}>
              {chip.count}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
