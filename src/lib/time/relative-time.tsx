'use client';

import { type ComponentProps, useEffect, useState } from 'react';
import { formatRelativeTime, toEpochMs } from './relativeTime';

// Auto-updating "time ago" label. Renders a semantic <time> and re-computes once
// a minute so "2m ago" stays honest without a full re-render upstream. For a
// static render (Server Components, tables that already re-fetch) call
// formatRelativeTime directly instead.
export function RelativeTime({
  date,
  ...props
}: { date: string | number | Date } & Omit<ComponentProps<'time'>, 'dateTime' | 'children'>) {
  const epoch = toEpochMs(date);
  const [label, setLabel] = useState(() => formatRelativeTime(epoch));

  useEffect(() => {
    setLabel(formatRelativeTime(epoch));
    const id = setInterval(() => setLabel(formatRelativeTime(epoch)), 60_000);
    return () => clearInterval(id);
  }, [epoch]);

  const iso = Number.isFinite(epoch) ? new Date(epoch).toISOString() : undefined;

  return (
    <time dateTime={iso} {...props}>
      {label}
    </time>
  );
}
