'use client';

// The timeline both account feeds render as: events grouped under their day ("Today",
// "Yesterday", "Oct 3"), each on a hairline-free line of its own — a clock time in mono, a small
// dot saying how it went, the event, and its one action on the right. No card per event: the
// day heading and the time column carry the structure a border used to.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import * as typeScale from '../typeScale';

/** How an event went, as the dot reads it. Green is a change that landed, red one that stopped
 *  something or failed, primary one that waits on a person (or came from Jaina), muted the rest. */
export type TimelineTone = 'landed' | 'stopped' | 'asks' | 'neutral';

const DOT_CLASS: Record<TimelineTone, string> = {
  landed: 'bg-success',
  stopped: 'bg-destructive',
  asks: 'bg-primary',
  neutral: 'bg-muted-foreground/40',
};

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today", "Yesterday", or the short date — with the year only when it is not this one. */
export function dayLabel(ts: string, now: Date = new Date()): string {
  const at = new Date(ts);
  if (!Number.isFinite(at.getTime())) return 'Undated';
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** The 24-hour clock time of an event, in the viewer's zone. */
export function clockTime(ts: string): string {
  const at = new Date(ts);
  if (!Number.isFinite(at.getTime())) return '—';
  return at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** Consecutive items that share a day, in the order given. The feeds arrive newest first, so a
 *  day appears once; an out-of-order row starts a new group rather than being moved. */
export function groupByDay<T>(
  items: readonly T[],
  tsOf: (item: T) => string,
  now: Date = new Date(),
): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(tsOf(item), now);
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export function TimelineDay({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId} data-day={label}>
      <h3 className={cn(typeScale.label, 'pt-3 pb-1 font-semibold text-muted-foreground/80')}>
        {label}
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

export function TimelineEntry({
  ts,
  tone,
  action,
  children,
  className,
  ...rest
}: {
  ts: string;
  tone: TimelineTone;
  /** The entry's one control (Revert, Retry), right-aligned. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
} & { [dataAttribute: `data-${string}`]: string | undefined }) {
  return (
    <li
      className={cn(
        'grid grid-cols-[2.75rem_0.5rem_minmax(0,1fr)_auto] items-start gap-x-3 py-2',
        className,
      )}
      {...rest}
    >
      <time className="pt-0.5 font-mono text-muted-foreground text-xs tabular-nums" dateTime={ts}>
        {clockTime(ts)}
      </time>
      <span
        aria-hidden="true"
        className={cn('mt-1.5 size-2 rounded-full', DOT_CLASS[tone])}
        data-tone={tone}
      />
      <div className="min-w-0">{children}</div>
      <div className="flex shrink-0 items-start">{action}</div>
    </li>
  );
}

/** The feeds' quiet secondary action — "Load older history" and the like — as text, not a box. */
export function QuietTextButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="font-medium text-muted-foreground text-xs underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** The feed's one line of filters: whatever the host passes (the feed switch and the window),
 *  then this feed's own portfolio narrowing on the right. */
export function FeedToolbar({
  controls,
  children,
}: {
  controls?: ReactNode;
  children?: ReactNode;
}) {
  if (!controls && !children) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {controls}
      {children ? <div className="ml-auto">{children}</div> : null}
    </div>
  );
}
