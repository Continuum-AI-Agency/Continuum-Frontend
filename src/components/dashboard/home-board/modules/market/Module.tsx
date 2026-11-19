'use client';

import Link from 'next/link';
// H12 Market radar, expanded: competitor moves on top (named, newest first), trends below
// (stored text in the account's language, newest first, then most confident). It reads the
// same two stored sources as the tile, plus the brand's competitor list for the names.
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useCompetitors } from '@/lib/api/competitorSpy';
import { groupMoves, moveSentence, orderTrends, shortDay } from './marketRadarModel';
import { useMarketRadar } from './useMarketRadar';

export default function MarketRadarModule({ brandId }: { brandId: string }) {
  const uiText = useTranslations('dashboard');
  const confidenceLabel = (confidence: number | null): string | null =>
    confidence === null
      ? null
      : uiText('percent_confidence_ee34148', { percent: Math.round(confidence * 100) });
  const radar = useMarketRadar(brandId);
  const competitors = useCompetitors(brandId);
  const nameById = useMemo(
    () => new Map((competitors.data ?? []).map((competitor) => [competitor.id, competitor.name])),
    [competitors.data],
  );
  const groups = useMemo(() => groupMoves(radar.moves), [radar.moves]);
  const trends = useMemo(() => orderTrends(radar.trends), [radar.trends]);

  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="home-market-module">
      <p className="text-2xs text-muted-foreground">
        {uiText('newest_first_trends_carry_no_relevance_score__c7b9731')}
      </p>

      <section
        aria-label={uiText('competitor_moves_16b33aa')}
        className="flex min-w-0 flex-col gap-2"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="font-semibold text-xs">{uiText('competitors_e699b0b')}</h4>
          <Link className="text-2xs underline underline-offset-2" href="/competitor-spy">
            {uiText('open_brand_spy_b553090')}
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {radar.reportExists
              ? uiText('no_competitor_moves_in_the_last_scan_aef98fb')
              : uiText('no_competitors_tracked_yet_add_them_in_brand__e11a6e8')}
          </p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-1.5">
            {groups.map((group) => (
              <li
                className="grid min-w-0 grid-cols-[10px_minmax(0,1fr)] gap-2.5 rounded-lg border p-2 text-xs"
                data-testid="home-market-move"
                key={group.key}
              >
                <i aria-hidden="true" className="mt-1 size-2.5 rounded-full bg-chart-5" />
                <span className="min-w-0">
                  {moveSentence(group, nameById.get(group.competitorId) ?? null)}
                  <small className="block text-2xs text-muted-foreground">
                    {uiText('competitor_day_45da08c', { day: shortDay(group.day) })}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={uiText('trends_e856c6c')} className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="font-semibold text-xs">{uiText('trends_e856c6c')}</h4>
          <Link className="text-2xs underline underline-offset-2" href="/organic?tab=metrics">
            {uiText('open_trends_d927bff')}
          </Link>
        </div>
        {trends.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {uiText('no_trends_read_for_this_brand_yet_cccfc05')}
          </p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-1.5">
            {trends.map((trend) => {
              const confidence = confidenceLabel(trend.confidence);
              return (
                <li
                  className="grid min-w-0 grid-cols-[10px_minmax(0,1fr)] gap-2.5 rounded-lg border p-2 text-xs"
                  data-testid="home-market-trend"
                  key={trend.id}
                >
                  <i aria-hidden="true" className="mt-1 size-2.5 rounded-full bg-chart-2" />
                  <span className="min-w-0">
                    <span className="font-medium">{trend.title}</span>
                    {trend.relevance ? (
                      <span className="mt-0.5 block text-muted-foreground">{trend.relevance}</span>
                    ) : null}
                    <small className="mt-0.5 block text-2xs text-muted-foreground tabular-nums">
                      {[uiText('trend_9e21771'), trend.day ? shortDay(trend.day) : null, confidence]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
