'use client';

// H12 Market radar, expanded: competitor moves on top (named, newest first), trends below
// (stored text in the account's language, newest first, then most confident). It reads the
// same two stored sources as the tile, plus the brand's competitor list for the names.
import Link from 'next/link';
import { useTranslations as useBetaTranslations, useLocale as useMarketLocale } from 'next-intl';
import { useMemo } from 'react';
import { useCompetitors } from '@/lib/api/competitorSpy';
import { groupMoves, moveSentence, orderTrends, shortDay } from './marketRadarModel';
import { useMarketRadar } from './useMarketRadar';

export const RADAR_ORDER_NOTE =
  'Newest first. Trends carry no relevance score, so same-day trends are ordered by confidence.';

function confidenceLabel(confidence: number | null): string | null {
  return confidence === null ? null : `${Math.round(confidence * 100)}% confidence`;
}

export default function MarketRadarModule({ brandId }: { brandId: string }) {
  const betaUiText = useBetaTranslations('dashboard');
  const marketLocale = useMarketLocale();

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
      <p className="text-2xs text-muted-foreground">{betaUiText('radarOrder')}</p>

      <section aria-label={betaUiText('beta_16b33aa7beea')} className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="font-semibold text-xs">{betaUiText('beta_e699b0b54366')}</h4>
          <Link className="text-2xs underline underline-offset-2" href="/competitor-spy">
            {betaUiText('beta_b553090894da')}
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {radar.reportExists ? betaUiText('beta_aef98fb85064') : betaUiText('beta_e11a6e8744c8')}
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
                    {betaUiText('beta_927aabe915b2')} {shortDay(group.day, marketLocale)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={betaUiText('beta_e856c6c6a48b')} className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="font-semibold text-xs">{betaUiText('beta_e856c6c6a48b')}</h4>
          <Link className="text-2xs underline underline-offset-2" href="/organic?tab=metrics">
            {betaUiText('beta_d927bffe1e72')}
          </Link>
        </div>
        {trends.length === 0 ? (
          <p className="text-muted-foreground text-xs">{betaUiText('beta_cccfc051d870')}</p>
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
                      {['Trend', trend.day ? shortDay(trend.day, marketLocale) : null, confidence]
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
