'use client';

// The frame every board module draws inside: a card with the module's title (product chrome,
// English), the reading's reason for it (generated, in the account's language) and an optional
// action on the right. The size decides the grid footprint (BOARD_SIZE_CLASS), so the board can
// reorder modules without any of them knowing where it sits.
import type { BoardModuleSize } from '@continuum/contracts';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BOARD_SIZE_CLASS } from './types';

export type ModuleFrameProps = {
  title: string;
  size: BoardModuleSize;
  /** data-testid of the module: board-module-<id>. */
  testId: string;
  /** The reading's sentence for this module. */
  reason?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function ModuleFrame({
  title,
  size,
  testId,
  reason,
  action,
  className,
  children,
}: ModuleFrameProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground',
        BOARD_SIZE_CLASS[size],
        className,
      )}
      data-size={size}
      data-testid={testId}
    >
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-semibold text-sm tracking-tight">{title}</h3>
          {reason ? (
            <p
              className="text-muted-foreground text-xs leading-snug"
              data-testid={`${testId}-reason`}
            >
              {reason}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

/** What a module shows while its figures load: the frame at its own size, so nothing moves
 *  when the figures land. */
export function ModuleFrameSkeleton({ size, testId }: { size: BoardModuleSize; testId: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-xl border bg-muted/40',
        size === 'l' ? 'min-h-72' : size === 's' ? 'min-h-36' : 'min-h-44',
        BOARD_SIZE_CLASS[size],
      )}
      data-testid={`${testId}-skeleton`}
    />
  );
}
