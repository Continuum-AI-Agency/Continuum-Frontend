import type { ReactNode } from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
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

const SEVERITY: Record<
  InsightSeverity,
  { label: string; variant: 'success' | 'destructive' | 'muted' }
> = {
  positive: { label: 'Positive', variant: 'success' },
  negative: { label: 'Needs attention', variant: 'destructive' },
  neutral: { label: 'Informational', variant: 'muted' },
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

function insightFingerprint(item: InsightListItem): string {
  return `${item.text} ${item.detail ?? ''}`
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function normalizeInsightItems(items: readonly InsightListItem[]): InsightListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const fingerprint = insightFingerprint(item);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

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
  const normalizedItems = normalizeInsightItems(items);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border/70 bg-card">
      <SectionHeader title={title} action={headerAction} />

      {isLoading ? (
        <div className="flex flex-col gap-3 p-3" role="status" aria-label="Loading recent insights">
          <p className="text-xs text-muted-foreground">Loading recent insights…</p>
          {['92%', '78%', '86%', '68%'].map((width) => (
            <div key={width} className="flex items-center gap-2.5">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4" style={{ width }} />
            </div>
          ))}
        </div>
      ) : normalizedItems.length === 0 ? (
        <Empty className="min-h-28">
          <EmptyHeader>
            <EmptyTitle>No insights yet</EmptyTitle>
            <EmptyDescription>{emptyState ?? 'Insights will appear here.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul
          className={cn('divide-y divide-border/50', maxHeight != null && 'overflow-y-auto')}
          style={maxHeight != null ? { maxHeight } : undefined}
        >
          {normalizedItems.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5 px-3 py-2.5">
              <Badge variant={SEVERITY[item.severity].variant} className="mt-0.5 text-2xs">
                {SEVERITY[item.severity].label}
              </Badge>
              <div className="min-w-0 flex-1">
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
