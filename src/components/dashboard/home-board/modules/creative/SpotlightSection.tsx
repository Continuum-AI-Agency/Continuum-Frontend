'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The expanded spotlight: the brand's top ads by spend, as the read returned them. Thumbnails are
// stored Meta URLs that expire: CreativeThumb falls back to the creative report's copy, then to a
// labeled placeholder. The Home never re-resolves one from the Graph.

import type { HomeCreativeSpotlightData, HomeCreativeVerdict } from '@continuum/contracts';
import { Badge } from '@/components/ui/badge';
import { CreativeThumb } from './CreativeThumb';
import {
  SPOTLIGHT_VERDICT_LABEL,
  spotlightAgeLine,
  spotlightCostLine,
  spotlightFormatLabel,
  spotlightFrequencyLine,
  spotlightHookLine,
  spotlightName,
  spotlightSpendLine,
} from './spotlightRead';

const VERDICT_BADGE: Record<HomeCreativeVerdict, 'success' | 'warning' | 'muted'> = {
  winner: 'success',
  fading: 'warning',
  new: 'muted',
  steady: 'muted',
};

export function SpotlightSection({
  data,
  reportThumbs,
}: {
  data: HomeCreativeSpotlightData;
  /** The creative report's stored thumbnail per ad, tried when the read's own has expired. */
  reportThumbs: ReadonlyMap<string, string | null>;
}) {
  const betaUiText = useBetaTranslations('dashboard');

  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="creative-spotlight">
      <h4 className="font-semibold text-xs">
        {betaUiText('beta_faaf6ac2bcb2')} {data.window === '7d' ? '7' : '14'}{' '}
        {betaUiText('beta_ab51004e9d71')}
      </h4>
      <p className="text-2xs text-muted-foreground" data-testid="creative-spotlight-age">
        {spotlightAgeLine(data)}
        {data.currency ? betaUiText('beta_76a5c23c5ccf', { value0: String(data.currency) }) : ''}
      </p>
      <ul className="flex min-w-0 snap-x gap-2.5 overflow-x-auto pb-2">
        {data.ads.map((ad) => {
          const name = spotlightName(ad);
          return (
            <li
              className="flex w-44 shrink-0 snap-start flex-col gap-1.5 rounded-xl border bg-card p-1.5"
              data-ad={ad.adId}
              data-format={ad.format}
              data-hook-rate={ad.hookRate ?? undefined}
              data-testid="creative-spotlight-ad"
              data-verdict={ad.verdict}
              key={ad.adId}
            >
              <CreativeThumb
                alt={name}
                className="aspect-[4/5] w-full"
                fallbackUrl={reportThumbs.get(ad.adId) ?? null}
                url={ad.thumbnailUrl}
              />
              <p className="truncate px-1 font-medium text-xs" title={name}>
                {name}
              </p>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-1 px-1">
                <Badge variant={VERDICT_BADGE[ad.verdict]}>
                  {SPOTLIGHT_VERDICT_LABEL[ad.verdict]}
                </Badge>
                <span className="text-2xs text-muted-foreground">
                  {spotlightFormatLabel(ad.format)}
                </span>
              </div>
              <ul className="space-y-0.5 px-1 text-2xs tabular-nums leading-snug">
                <li className="font-semibold">{spotlightCostLine(ad, data.currency)}</li>
                <li>{spotlightHookLine(ad)}</li>
                <li>{spotlightSpendLine(ad)}</li>
                <li>{spotlightFrequencyLine(ad)}</li>
              </ul>
              <p className="line-clamp-4 px-1 text-2xs text-muted-foreground leading-snug">
                {ad.verdictWhy}
              </p>
              {ad.permalinkUrl ? (
                <a
                  className="mt-auto px-1 pb-0.5 text-2xs text-primary hover:underline"
                  href={ad.permalinkUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {betaUiText('beta_fe9715bcd31d')}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      {data.otherCurrencies.length > 0 ? (
        <p className="text-2xs text-muted-foreground">
          {betaUiText('beta_74331f28202a')}{' '}
          {data.otherCurrencies
            .map(
              (other) => `${other.adsWithSpend} in ${other.currency ?? 'an unreported currency'}`,
            )
            .join(', ')}
          .
        </p>
      ) : null}
    </section>
  );
}
