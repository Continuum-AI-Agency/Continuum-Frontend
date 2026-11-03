'use client';

// H12 Market radar, expanded: competitor moves on top (named, newest first), trends below
// (stored text in the account's language, newest first, then most confident). It reads the
// same two stored sources as the tile, plus the brand's competitor list for the names.
import Link from 'next/link';
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
      <p className="text-2xs text-muted-foreground">{RADAR_ORDER_NOTE}</p>

      <section aria-label="Competitor moves" className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="font-semibold text-xs">Competitors</h4>
          <Link className="text-2xs underline underline-offset-2" href="/competitor-spy">
            Open Brand Spy
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {radar.reportExists
              ? 'No competitor moves in the last scan.'
              : 'No competitors tracked yet — add them in Brand Spy.'}
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
                    Competitor · {shortDay(group.day)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Trends" className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="font-semibold text-xs">Trends</h4>
          <Link className="text-2xs underline underline-offset-2" href="/organic?tab=metrics">
            Open trends
          </Link>
        </div>
        {trends.length === 0 ? (
          <p className="text-muted-foreground text-xs">No trends read for this brand yet.</p>
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
                      {['Trend', trend.day ? shortDay(trend.day) : null, confidence]
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
