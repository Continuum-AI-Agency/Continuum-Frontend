import { useTranslations } from 'next-intl';
import { pluralize } from '@/lib/format/pluralize';
import type { BrandInsightsTrend } from '@/lib/schemas/brandInsights';

const PEEK_TREND_LIMIT = 3;

type BrandTrendsPeekProps = {
  trends: BrandInsightsTrend[];
  eventCount: number;
  questionCount: number;
  weekLabel?: string;
  isStale?: boolean;
};

export function BrandTrendsPeek({
  trends,
  eventCount,
  questionCount,
  weekLabel,
  isStale = false,
}: BrandTrendsPeekProps) {
  const tUi = useTranslations('common');

  const signalCount = trends.length + eventCount + questionCount;

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-2xs font-semibold tracking-wide uppercase">
          {tUi('m_3c32f0af0c')}
        </p>
        {weekLabel ? (
          <p className="text-muted-foreground shrink-0 text-xs">
            {tUi('m_7f262e0a5d')}
            {weekLabel}
          </p>
        ) : null}
      </div>

      {signalCount === 0 ? (
        <div className="border-t pt-2">
          <p className="text-sm">{tUi('m_913d8eb018')}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">{tUi('m_3973a13771')}</p>
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
              <li className="text-muted-foreground text-sm">{tUi('m_136d4e3ef2')}</li>
            ) : null}
          </ul>

          <div className="text-muted-foreground flex items-center justify-between gap-2 border-t pt-2 text-xs">
            <span className="truncate">
              {pluralize(trends.length, 'trend')} · {pluralize(eventCount, 'event')} ·{' '}
              {pluralize(questionCount, 'question')}
            </span>
            <span className="shrink-0">{isStale ? tUi('m_d21640a743') : tUi('m_f724b8f0f8')}</span>
          </div>
        </>
      )}
    </div>
  );
}
