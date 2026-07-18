'use client';

// Small competitor-evidence card rendered inside expanded table rows and the
// gap evidence panel. Exemplar text/meta comes denormalized on the report;
// media bytes resolve through the signed creative-url route.

import type { GapCompetitorExemplar } from '@continuum/contracts';
import { useCreativeUrl } from '@/lib/api/competitorSpy';
import { nonUsCountriesLabel } from './gapPresentation';

export function CompetitorExemplarCard({ exemplar }: { exemplar: GapCompetitorExemplar }) {
  const { data: mediaUrl } = useCreativeUrl(exemplar.snapshotId, exemplar.hasCreativeMedia);
  const countries = nonUsCountriesLabel(exemplar.fetchedCountries);

  return (
    <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background/60">
      {exemplar.hasCreativeMedia && mediaUrl ? (
        <img
          alt={exemplar.competitorName ? `Ad by ${exemplar.competitorName}` : 'Competitor ad'}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
          src={mediaUrl}
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {exemplar.competitorName ?? 'Unknown competitor'}
        </p>
        {exemplar.hook ? (
          <p className="line-clamp-2 text-xs font-medium text-foreground">{exemplar.hook}</p>
        ) : null}
        {exemplar.body ? (
          <p className="line-clamp-3 text-2xs text-muted-foreground">{exemplar.body}</p>
        ) : null}
        <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-3xs text-muted-foreground">
          <span className="capitalize">{exemplar.status}</span>
          {countries ? <span>{countries}</span> : null}
        </p>
      </div>
    </div>
  );
}

export function CompetitorExemplarStrip({ exemplars }: { exemplars: GapCompetitorExemplar[] }) {
  if (exemplars.length === 0) {
    return <p className="text-xs text-muted-foreground">No exemplar ads captured for this row.</p>;
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {exemplars.map((exemplar) => (
        <CompetitorExemplarCard exemplar={exemplar} key={exemplar.snapshotId} />
      ))}
    </div>
  );
}
