import { InboxIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { ErrorRetryState } from '@/components/shared/state/ErrorRetryState';
import { LoadingState } from '@/components/shared/state/LoadingState';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// One shared empty / error / loading chrome for every optimizer visualization, so
// a chart body degrades to a single consistent look instead of ad-hoc
// `return null`s and bespoke dashed placeholders. Empty is the COMMON runtime
// state for this surface — the optimizer runs on a schedule and the service is not
// live yet — so it must render, never vanish. Composes the shared state kit.

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <LoadingState label="Loading chart">
      <Skeleton className={cn('w-full rounded-lg bg-muted/70', className ?? 'h-24')} />
    </LoadingState>
  );
}

export function ChartEmpty({
  message,
  icon,
  className,
}: {
  message: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid min-h-[70px] place-items-center rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center',
        className,
      )}
    >
      <span className="flex max-w-[42ch] flex-col items-center gap-1.5 text-xs text-muted-foreground">
        {icon ?? <InboxIcon aria-hidden="true" className="size-4 opacity-60" />}
        {message}
      </span>
    </div>
  );
}

export function ChartError({
  message = 'This chart could not load.',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return <ErrorRetryState className={cn('py-6', className)} message={message} onRetry={onRetry} />;
}
