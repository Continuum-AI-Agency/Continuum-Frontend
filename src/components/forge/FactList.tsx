import type { LucideIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// Facts about one thing as label / value pairs: two columns of pairs when there is room, one when
// there is not. The width that decides is the list's own, not the viewport's, and the first value
// column is capped so on a wide screen the second pair stays near the first.

export type Fact = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  /** Mono, tabular figures, so counts line up down the list. */
  numeric?: boolean;
  /** A dashed rule across the list before this fact. */
  ruleBefore?: boolean;
};

export function FactList({ facts, className }: { facts: Fact[]; className?: string }) {
  return (
    <div className={cn('@container min-w-0', className)}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] content-start items-center gap-x-3 gap-y-1.5 text-xs @md:grid-cols-[auto_minmax(0,14rem)_auto_minmax(0,1fr)]">
        {facts.map(({ icon: Icon, label, value, numeric, ruleBefore }) => (
          <Fragment key={label}>
            {ruleBefore ? (
              <Separator className="col-span-full border-t border-dashed border-border bg-transparent data-horizontal:h-0" />
            ) : null}
            <dt className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
              {label}
            </dt>
            <dd className={cn('min-w-0', numeric && 'font-mono tabular-nums')}>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
