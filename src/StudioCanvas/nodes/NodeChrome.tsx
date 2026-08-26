// The chrome every block node shares: one 24px title bar and one badge.
//
// Six nodes hand-rolled the same header div with four different paddings, and each
// wrapped its preview in a `rounded border` box inside a padded NodeContent — a
// container drawn inside a container, which is the dead space. The bar is the ONLY
// chrome; everything below it is edge-to-edge, and controls float over the surface
// (the ImageNode/VideoGenBlock pattern) rather than taking a row of their own.

import type { LucideIcon } from 'lucide-react';
import type React from 'react';

import { cn } from '@/lib/utils';

export function NodeTitleBar({
  icon: Icon,
  label,
  title,
  className,
  children,
}: {
  icon: LucideIcon;
  label: string;
  /** Hover text — descriptions belong here, not in a row that costs 20px forever. */
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-6 shrink-0 items-center gap-1.5 border-b border-border/60 bg-muted/40 pr-0.5 pl-1.5 text-[11px] font-medium',
        className,
      )}
    >
      <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={title}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** The `Image`/`Video`/`Text`/count pill that sits at the right of a title bar. */
export function NodeBadge({ className, children, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm bg-muted px-1 text-[10px] font-medium text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** A strip floated over the bottom of an edge-to-edge preview — errors, notes. */
export function NodeOverlayNote({
  tone = 'muted',
  className,
  children,
}: {
  tone?: 'muted' | 'destructive';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 z-10 px-1.5 py-1 text-[10px] leading-snug backdrop-blur-sm',
        tone === 'destructive'
          ? 'bg-destructive/85 text-destructive-foreground'
          : 'bg-background/85 text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}
