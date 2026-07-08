import type { ReactNode } from 'react';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// The calm-dense panel used across the optimizer surface: a Card (rounded-lg, 1px
// border, no shadow) with the shared SectionHeader bar on top and a padded body.
// Replaces the hand-rolled `Card + CardHeader border-b p-4 + CardContent p-4`
// blocks that were repeated per panel — one structure, styleguide-conformant.
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
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      <SectionHeader title={title} meta={meta} action={action} />
      <div className={cn('p-[var(--card-pad)]', bodyClassName)}>{children}</div>
    </Card>
  );
}
