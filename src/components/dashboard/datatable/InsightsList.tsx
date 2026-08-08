import { AlertTriangle, type LucideIcon, Minus, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Panel } from '@/components/shared/Panel';
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

// A quiet severity cue: a small tinted icon carries good/attention/neutral without
// the typographic weight of a filled pill. `label` stays available to assistive tech.
const SEVERITY: Record<InsightSeverity, { label: string; Icon: LucideIcon; className: string }> = {
  positive: { label: 'Positive', Icon: TrendingUp, className: 'text-success' },
  negative: {
    label: 'Needs attention',
    Icon: AlertTriangle,
    className: 'text-amber-600 dark:text-amber-500',
  },
  neutral: { label: 'Informational', Icon: Minus, className: 'text-muted-foreground' },
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

// A dense list of analysis insights — a severity icon, an optional category/source
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
    <Panel title={title} action={headerAction} bodyClassName="p-0">
      {isLoading ? (
        <div
          className="flex flex-col gap-3 p-[var(--card-pad)]"
          role="status"
          aria-label="Loading recent insights"
        >
          <p className="text-xs text-muted-foreground">Loading recent insights…</p>
          {['92%', '78%', '86%', '68%'].map((width) => (
            <div key={width} className="flex items-center gap-2.5">
              <Skeleton className="h-3.5 w-3.5 rounded-full" />
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
          {normalizedItems.map((item) => {
            const { label, Icon, className } = SEVERITY[item.severity];
            return (
              <li key={item.id} className="flex items-start gap-2.5 px-[var(--card-pad)] py-2">
                <span className={cn('mt-0.5 flex-shrink-0', className)}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">{label}</span>
                </span>
                <div className="min-w-0 flex-1">
                  {item.label ? (
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </p>
                  ) : null}
                  <p className="text-sm leading-snug text-foreground">{item.text}</p>
                  {item.detail ? (
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {item.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
