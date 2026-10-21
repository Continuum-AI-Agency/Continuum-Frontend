'use client';

import type { ReactNode } from 'react';
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';

export type TraceStepStatus = 'running' | 'error' | 'pending';

type TraceStepProps = {
  /** `running` shimmers the title, `error` turns the row destructive, `pending` dims it. Done = unset. */
  status?: TraceStepStatus;
  icon?: ReactNode;
  /** The icon box is a fixed 16px square; widen it for an icon that isn't one (a glyph spinner). */
  iconClassName?: string;
  title: ReactNode;
  description?: ReactNode;
  /** What the row expands to. A row without children is a static line. */
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  contentClassName?: string;
};

/**
 * One agent step — a tool call, a sub-agent, a reasoning block — as a Trace row. The same row
 * is used by every agent chat (Jaina, Organic, the Canvas Composer) so their activity reads alike.
 */
export function TraceStep({
  status,
  icon,
  iconClassName,
  title,
  description,
  children,
  open,
  onOpenChange,
  defaultOpen,
  contentClassName,
}: TraceStepProps) {
  const line = (
    <TraceLine status={status}>
      {icon ? <TraceIcon className={iconClassName}>{icon}</TraceIcon> : null}
      <TraceTitle>{title}</TraceTitle>
      {description ? <TraceDescription>{description}</TraceDescription> : null}
    </TraceLine>
  );

  if (children === undefined || children === null || children === false) return line;

  return (
    <TraceCollapsible
      {...(open === undefined
        ? { defaultOpen }
        : { open, onOpenChange: (next: boolean) => onOpenChange?.(next) })}
    >
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className={contentClassName}>{children}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

export function formatDurationMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
