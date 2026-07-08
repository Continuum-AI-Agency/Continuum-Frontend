import type { ReactNode } from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type InsightSeverity = 'positive' | 'negative' | 'neutral';

export type InsightListItem = {
  id: string;
  text: string;
  severity: InsightSeverity;
  label?: string;
  detail?: string;
};

const TONE: Record<InsightSeverity, string> = {
  positive: 'bg-emerald-500',
  negative: 'bg-red-500',
  neutral: 'bg-muted-foreground/40',
};

type InsightsListProps = {
  title: string;
  items: InsightListItem[];
  isLoading?: boolean;
  emptyState?: ReactNode;
  headerAction?: ReactNode;
  // Cap the list height and scroll the body vertically (header stays pinned
  // above). Omit to let the list grow with its rows.
  maxHeight?: number | string;
};

// A dense list of analysis insights — a severity dot, an optional category/source
// label, the insight line, and an optional recommendation. Shared by the organic
// and paid dashboards (both emit positive/negative/neutral severities).
export function InsightsList({
  title,
  items,
  isLoading = false,
  emptyState,
  headerAction,
  maxHeight,
}: InsightsListProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border/70 bg-card">
      <SectionHeader title={title} action={headerAction} />

      {isLoading ? (
        <div className="flex flex-col gap-3 p-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          {emptyState ?? 'No insights yet.'}
        </p>
      ) : (
        <ul
          className={cn('divide-y divide-border/50', maxHeight != null && 'overflow-y-auto')}
          style={maxHeight != null ? { maxHeight } : undefined}
        >
          {items.map((item) => (
            <li key={item.id} className="flex gap-2.5 px-3 py-2.5">
              <span
                className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', TONE[item.severity])}
                aria-hidden="true"
              />
              <div className="min-w-0">
                {item.label ? (
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </p>
                ) : null}
                <p className="text-sm leading-snug text-foreground">{item.text}</p>
                {item.detail ? (
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{item.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
