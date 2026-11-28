'use client';

import {
  type HomeCreativeSpotlightData,
  homeCreativeSpotlightReadSchema,
} from '@continuum/contracts';
// H09 Creative spotlight, the small tile: how many ads the stored creative report judged, how
// they stand, and (at m/l) their stored thumbnails, from the brand's paid_media.creative_reports
// row (usePaidCreativeReport). The headline reproduces as
// `select jsonb_array_length(report->'verdicts') from paid_media.creative_reports
//  where brand_id = <brand>`.
//
// A second read, the Backend's Creative Spotlight (R3), adds each ad's hook rate, format and
// whether it is fading. A brand with no report can still have one, and its headline then counts the
// ads that spent. Without the read (the route is not deployed yet) the tile is as above.
import { useTranslations } from 'next-intl';
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { HomeDots } from '../../HomeDots';
import { useHomeDraft } from '../../HomePresentationContext';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import { creativeDotItems, SPOTLIGHT_VERDICT_KEYS, spotlightDotItems } from '../../homeDotItems';
import { readyDataOf } from '../../homeRead';
import type { HomeTileProps } from '../../types';
import { useHomeRead } from '../../useHomeRead';
import { CreativeThumb } from './CreativeThumb';
import { type CreativeSpotlight, creativeTileState, standingLine } from './creativeModel';
import { spotlightAgeLine, spotlightName, spotlightVerdictLine } from './spotlightRead';

const CreativeModule = lazy(() => import('./Module'));

const THUMBS_BY_SIZE = { s: 0, m: 4, l: 5 } as const;

function SpotlightLine({ data }: { data: HomeCreativeSpotlightData }) {
  const uiText = useTranslations('dashboard');
  const draft = useHomeDraft();
  return (
    <p
      className="text-muted-foreground text-xs leading-snug"
      data-ads={data.ads.length}
      data-testid="home-tile-creative-spotlight"
    >
      {uiText('top_count_by_spend_verdicts_eb26d4a', {
        count: data.ads.length,
        verdicts: spotlightVerdictLine(data),
      })}
      {draft ? (
        <>
          {' '}
          · {data.window} · {spotlightAgeLine(data)}
        </>
      ) : null}
    </p>
  );
}

function SpotlightOnlyBody({
  data,
  size,
}: {
  data: HomeCreativeSpotlightData;
  size: 's' | 'm' | 'l';
}) {
  const uiText = useTranslations('dashboard');
  const draft = useHomeDraft();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="font-semibold text-2xl tabular-nums tracking-tight"
        data-source="spotlight"
        data-testid="home-tile-creative-headline"
        data-value={data.adsWithSpend}
      >
        {data.adsWithSpend}{' '}
        <small className="font-medium text-muted-foreground text-sm tracking-normal">
          {uiText('count_plural_one_ad_spending_other_ads_spendi_790b06a', {
            count: data.adsWithSpend,
          })}
        </small>
      </div>
      {draft ? (
        <SpotlightDots data={data} />
      ) : THUMBS_BY_SIZE[size] > 0 ? (
        <div className="flex min-w-0 gap-1.5">
          {data.ads.slice(0, THUMBS_BY_SIZE[size]).map((ad) => (
            <CreativeThumb
              alt={spotlightName(ad)}
              className="aspect-[4/5] w-10 shrink-0"
              compact
              key={ad.adId}
              url={ad.thumbnailUrl}
            />
          ))}
        </div>
      ) : null}
      <SpotlightLine data={data} />
    </div>
  );
}

function SpotlightDots({ data }: { data: HomeCreativeSpotlightData }) {
  const uiText = useTranslations('dashboard');
  const present = new Set(data.ads.map((ad) => ad.verdict));
  return (
    <HomeDots
      label={uiText('ads_by_recorded_verdict_and_share_of_spend_524c602')}
      items={spotlightDotItems(data, uiText)}
      groups={Object.entries(SPOTLIGHT_VERDICT_KEYS)
        .filter(([verdict]) => present.has(verdict as keyof typeof SPOTLIGHT_VERDICT_KEYS))
        .map(([, key]) => uiText(key))}
      xAxis={{
        label: uiText('share_of_spend_in_this_window_d9224df'),
        format: (value) => `${Math.round(value * 100)}%`,
      }}
    />
  );
}

function ReadyBody({
  spotlight,
  read,
  size,
}: {
  spotlight: CreativeSpotlight;
  read: HomeCreativeSpotlightData | null;
  size: 's' | 'm' | 'l';
}) {
  const uiText = useTranslations('dashboard');
  const draft = useHomeDraft();
  const thumbs = spotlight.cards.slice(0, THUMBS_BY_SIZE[size]);
  const readThumb = (adId: string) =>
    read?.ads.find((ad) => ad.adId === adId)?.thumbnailUrl ?? null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="font-semibold text-2xl tabular-nums tracking-tight"
        data-testid="home-tile-creative-headline"
        data-value={spotlight.total}
      >
        {spotlight.total}{' '}
        <small className="font-medium text-muted-foreground text-sm tracking-normal">
          {uiText('count_plural_one_ad_judged_other_ads_judged_6425d61', {
            count: spotlight.total,
          })}
        </small>
      </div>
      {draft ? (
        read ? (
          <SpotlightDots data={read} />
        ) : (
          <HomeDots
            label={uiText('ads_judged_in_the_stored_creative_report_7a145d3')}
            items={creativeDotItems(spotlight, uiText)}
          />
        )
      ) : thumbs.length > 0 ? (
        <div className="flex min-w-0 gap-1.5">
          {thumbs.map((card) => (
            <CreativeThumb
              alt={card.adName}
              className="aspect-[4/5] w-10 shrink-0"
              compact
              fallbackUrl={readThumb(card.adId)}
              key={card.adId}
              url={card.thumbnailUrl}
            />
          ))}
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs leading-snug">{standingLine(spotlight.counts)}</p>
      {read ? <SpotlightLine data={read} /> : null}
    </div>
  );
}

export default function CreativeTile({ ctx, tile }: HomeTileProps) {
  const uiText = useTranslations('dashboard');
  const read = usePaidCreativeReport(ctx.brandId);
  const view = creativeTileState(read, ctx.adAccounts);
  const spotlightRead = readyDataOf(
    useHomeRead<HomeCreativeSpotlightData>({
      name: 'creativeSpotlight',
      brandId: ctx.brandId,
      schema: homeCreativeSpotlightReadSchema,
    }),
  );

  if (view.state === 'ready') {
    const { spotlight } = view;
    return (
      <HomeTileFrame
        badge={uiText('judged_plural_one_ad_judged_other_ads_judged__858207e', {
          judged: spotlight.total,
          winning: spotlight.counts.winning,
        })}
        expanded={<CreativeModule ctx={ctx} read={spotlightRead} spotlight={spotlight} />}
        expandedDescription={
          spotlightRead
            ? uiText('the_brand_s_top_ads_by_spend_every_ad_the_sto_3f435ce')
            : uiText('every_ad_the_stored_creative_report_judged_an_9ad7122')
        }
        state="ready"
        tile={tile}
      >
        <ReadyBody read={spotlightRead} size={tile.size} spotlight={spotlight} />
      </HomeTileFrame>
    );
  }

  if (spotlightRead && view.state === 'missing') {
    return (
      <HomeTileFrame
        badge={uiText('count_plural_one_ad_spending_other_ads_spendi_9e51364', {
          count: spotlightRead.adsWithSpend,
        })}
        expanded={<CreativeModule ctx={ctx} read={spotlightRead} spotlight={null} />}
        expandedDescription={uiText('the_brand_s_top_ads_by_spend_and_the_flywheel_60ac49c')}
        state="ready"
        tile={tile}
      >
        <SpotlightOnlyBody data={spotlightRead} size={tile.size} />
      </HomeTileFrame>
    );
  }

  return (
    <HomeTileFrame state={view.state} tile={tile}>
      {view.state === 'missing' ? <TileMissing>{view.sentence}</TileMissing> : null}
      {view.state === 'loading' ? (
        <div className="space-y-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-40" />
        </div>
      ) : null}
      {view.state === 'error' ? (
        <p className="text-destructive-ink text-xs" role="alert">
          {uiText('the_creative_report_could_not_be_read_3ac238f')}{' '}
          <Button
            className="h-5 px-1 text-xs"
            onClick={() => void read.refetch()}
            size="sm"
            type="button"
            variant="link"
          >
            {uiText('retry_942087c')}
          </Button>
        </p>
      ) : null}
    </HomeTileFrame>
  );
}
