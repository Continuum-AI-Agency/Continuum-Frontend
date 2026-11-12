'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';

// Small competitor-evidence card rendered inside expanded table rows and the
// gap evidence panel. Exemplar text/meta comes denormalized on the report;
// media bytes resolve through the signed creative-url route.

import type { GapCompetitorExemplar } from '@continuum/contracts';
import { useCreativeUrl } from '@/lib/api/competitorSpy';
import { nonUsCountriesLabel } from './gapPresentation';

export function CompetitorExemplarCard({ exemplar }: { exemplar: GapCompetitorExemplar }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  const { data: mediaUrl } = useCreativeUrl(exemplar.snapshotId, exemplar.hasCreativeMedia);
  const countries = nonUsCountriesLabel(exemplar.fetchedCountries, uiText, uiLocale);

  return (
    <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background/60">
      {exemplar.hasCreativeMedia && mediaUrl ? (
        <img
          alt={
            exemplar.competitorName
              ? uiText('m_9284ccc3a9', { name: exemplar.competitorName })
              : uiText('competitor_ad_3bbf525')
          }
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
          src={mediaUrl}
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {exemplar.competitorName ?? uiText('unknown_competitor_2beff7b')}
        </p>
        {exemplar.hook ? (
          <p className="line-clamp-2 text-xs font-medium text-foreground">{exemplar.hook}</p>
        ) : null}
        {exemplar.body ? (
          <p className="line-clamp-3 text-2xs text-muted-foreground">{exemplar.body}</p>
        ) : null}
        <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-3xs text-muted-foreground">
          <span className="capitalize">
            {localizeCompetitorCopy(exemplar.status === 'active' ? 'Active' : 'Paused', uiText)}
          </span>
          {countries ? <span>{countries}</span> : null}
        </p>
      </div>
    </div>
  );
}

export function CompetitorExemplarStrip({ exemplars }: { exemplars: GapCompetitorExemplar[] }) {
  const uiText = useTranslations('competitor');
  if (exemplars.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('no_exemplar_ads_captured_for_this_row_98a0dfa')}
      </p>
    );
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {exemplars.map((exemplar) => (
        <CompetitorExemplarCard exemplar={exemplar} key={exemplar.snapshotId} />
      ))}
    </div>
  );
}
