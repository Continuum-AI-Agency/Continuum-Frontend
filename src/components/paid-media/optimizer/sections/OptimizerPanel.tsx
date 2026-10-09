import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

// One section of the optimizer's portfolio read (P1, "Lectura continua"): a heading, its muted
// meta beside it, an optional action on the right, then the content. No border, no radius, no
// card surface — sections are told apart by the whitespace between them, so a chart or a table
// inside one never ends up as a box inside a box.
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
    <section className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h3 className="font-semibold text-foreground text-sm">{title}</h3>
          {meta ? <div className="min-w-0 text-muted-foreground text-xs">{meta}</div> : null}
        </div>
        {action}
      </div>
      <div className={cn('min-w-0', bodyClassName)}>{children}</div>
    </section>
  );
}
