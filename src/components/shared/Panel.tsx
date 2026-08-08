import type { ReactNode } from 'react';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { cn } from '@/lib/utils';

// The canonical panel: a SectionHeader bar over a padded body, and nothing else.
// Deliberately carries no border, radius or surface colour — app panes are flat
// and get their structure from the parent's hairline dividers, so nesting one
// panel inside another can never produce a card-in-card. Surfaces that genuinely
// float (popovers, dialogs) opt into chrome via `className`.
//
// Pass `bodyClassName="p-0"` when the body owns its own gutter (tables and lists
// pad their own cells/rows); tailwind-merge drops the default padding.
export function Panel({
  title,
  eyebrow,
  meta,
  action,
  children,
  className,
  bodyClassName,
  ...props
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
} & Omit<React.ComponentProps<'section'>, 'title'>) {
  return (
    <section className={cn('flex min-w-0 flex-col', className)} {...props}>
      <SectionHeader title={title} eyebrow={eyebrow} meta={meta} action={action} />
      <div className={cn('min-h-0 flex-1 p-[var(--card-pad)]', bodyClassName)}>{children}</div>
    </section>
  );
}
