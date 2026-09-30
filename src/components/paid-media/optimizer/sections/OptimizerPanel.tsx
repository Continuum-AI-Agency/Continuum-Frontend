import type { ReactNode } from 'react';

import { Panel } from '@/components/shared/Panel';
import { cn } from '@/lib/utils';

// The shared Panel plus the optimizer surface's card chrome. Kept as its own
// component because the optimizer still reads as a stack of discrete cards,
// unlike the flattened dashboard panes.
export function OptimizerPanel({
  title,
  meta,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Panel
      title={title}
      meta={
        // The shared header keeps its right cluster from shrinking, so a long legend beside
        // the title pushed the whole header past a phone's panel. Below `sm` it wraps instead.
        meta ? (
          <span className="block max-w-[55vw] text-right sm:max-w-none">{meta}</span>
        ) : undefined
      }
      action={action}
      bodyClassName={bodyClassName}
      className={cn('overflow-hidden rounded-lg border bg-card text-card-foreground', className)}
    >
      {children}
    </Panel>
  );
}
