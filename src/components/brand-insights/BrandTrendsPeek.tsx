import type { BrandInsightsTrend } from '@/lib/schemas/brandInsights';

const PEEK_TREND_LIMIT = 3;

type BrandTrendsPeekProps = {
  trends: BrandInsightsTrend[];
  eventCount: number;
  questionCount: number;
  weekLabel?: string;
  isStale?: boolean;
};

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function BrandTrendsPeek({
  trends,
  eventCount,
  questionCount,
  weekLabel,
  isStale = false,
}: BrandTrendsPeekProps) {
  const signalCount = trends.length + eventCount + questionCount;

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          Brand insights
        </p>
        {weekLabel ? (
          <p className="text-muted-foreground shrink-0 text-xs">Week of {weekLabel}</p>
        ) : null}
      </div>

      {signalCount === 0 ? (
        <div className="border-t pt-2">
          <p className="text-sm">No trend signals for this week.</p>
          <p className="text-muted-foreground mt-0.5 text-xs">Click to open and generate them.</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2 border-t pt-2">
            {trends.slice(0, PEEK_TREND_LIMIT).map((trend) => (
              <li key={trend.id}>
                <p className="truncate text-sm font-medium">{trend.title}</p>
                <p className="text-muted-foreground line-clamp-1 text-xs">
                  {trend.description ?? trend.relevanceToBrand}
                </p>
              </li>
            ))}
            {trends.length === 0 ? (
              <li className="text-muted-foreground text-sm">No trends this week.</li>
            ) : null}
          </ul>

          <div className="text-muted-foreground flex items-center justify-between gap-2 border-t pt-2 text-xs">
            <span className="truncate">
              {pluralize(trends.length, 'trend')} · {pluralize(eventCount, 'event')} ·{' '}
              {pluralize(questionCount, 'question')}
            </span>
            <span className="shrink-0">{isStale ? 'Needs a refresh' : 'Click to open'}</span>
          </div>
        </>
      )}
    </div>
  );
}
