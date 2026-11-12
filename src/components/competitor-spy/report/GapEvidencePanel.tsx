'use client';
import { useLocale, useTranslations } from 'next-intl';

// Per-gap evidence drill-down: competitor exemplars on the left, the brand's
// own ads carrying the (matched) value on the right — or an honest empty note
// when the brand runs nothing there.

import type {
  CompetitiveGapReport,
  CompetitiveGapRow,
  GapOwnAdExemplar,
} from '@continuum/contracts';
import { CompetitorExemplarStrip } from './CompetitorExemplarCard';
import { money } from './gapPresentation';

export function GapEvidencePanel({
  row,
  exemplars,
}: {
  row: CompetitiveGapRow;
  exemplars: CompetitiveGapReport['exemplars'];
}) {
  const uiText = useTranslations('competitor');
  const competitorExemplars = row.competitorEvidence.exemplarSnapshotIds
    .slice(0, 3)
    .map((snapshotId) => exemplars.competitor[snapshotId])
    .filter((exemplar) => Boolean(exemplar));

  const ownExemplars = (row.ownEvidence?.exemplarAdIds ?? [])
    .slice(0, 3)
    .map((adId) => exemplars.own[adId])
    .filter((exemplar): exemplar is GapOwnAdExemplar => Boolean(exemplar));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {uiText('what_they_re_running_7f0ce81')}
        </p>
        <CompetitorExemplarStrip exemplars={competitorExemplars} />
      </div>

      <div className="space-y-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {uiText('your_ads_here_705b904')}
        </p>
        {row.ownEvidence === null || ownExemplars.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {uiText('no_ads_of_yours_carry_this_angle_yet_d8a858b')}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {ownExemplars.map((ad) => (
              <OwnAdRow ad={ad} key={ad.adId} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OwnAdRow({ ad }: { ad: GapOwnAdExemplar }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  return (
    <li className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
      {ad.thumbnailUrl ? (
        <img
          alt={ad.adName ?? uiText('ad_thumbnail_49a1c2c')}
          className="size-9 shrink-0 rounded object-cover"
          loading="lazy"
          src={ad.thumbnailUrl}
        />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded bg-muted text-3xs text-muted-foreground">
          {uiText('ad_c7bf4bb')}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">
            {ad.adName ?? ad.adId}
          </span>
          {ad.funnelStage ? (
            <span className="rounded bg-muted px-1 py-px text-3xs uppercase text-muted-foreground">
              {ad.funnelStage}
            </span>
          ) : null}
        </span>
        <span className="block text-3xs text-muted-foreground">
          {uiText.rich('sentence_182e2464f658', { v0: () => money(ad.spendD30, uiLocale) })}
        </span>
      </span>
      {ad.permalinkUrl ? (
        <a
          className="shrink-0 text-2xs font-medium text-primary hover:underline"
          href={ad.permalinkUrl}
          rel="noreferrer"
          target="_blank"
        >
          {uiText('open_in_meta_0ffd70a')}
        </a>
      ) : null}
    </li>
  );
}
