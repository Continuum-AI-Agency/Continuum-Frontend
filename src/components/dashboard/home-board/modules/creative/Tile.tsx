'use client';

// H09 Creative spotlight, the small tile: how many ads the stored creative report judged, how
// they stand, and (at m/l) their stored thumbnails, from the brand's paid_media.creative_reports
// row (usePaidCreativeReport). The headline reproduces as
// `select jsonb_array_length(report->'verdicts') from paid_media.creative_reports
//  where brand_id = <brand>`.
//
// A second read, the Backend's Creative Spotlight (R3), adds each ad's hook rate, format and
// whether it is fading. A brand with no report can still have one, and its headline then counts the
// ads that spent. Without the read (the route is not deployed yet) the tile is as above.
import {
  type HomeCreativeSpotlightData,
  homeCreativeSpotlightReadSchema,
} from '@continuum/contracts';
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import { readyDataOf } from '../../homeRead';
import type { HomeTileProps } from '../../types';
import { useHomeRead } from '../../useHomeRead';
import { CreativeThumb } from './CreativeThumb';
import { type CreativeSpotlight, creativeTileState, standingLine } from './creativeModel';
import { spotlightName, spotlightVerdictLine } from './spotlightRead';

const CreativeModule = lazy(() => import('./Module'));

const THUMBS_BY_SIZE = { s: 0, m: 4, l: 5 } as const;

function SpotlightLine({ data }: { data: HomeCreativeSpotlightData }) {
  return (
    <p
      className="text-muted-foreground text-xs leading-snug"
      data-ads={data.ads.length}
      data-testid="home-tile-creative-spotlight"
    >
      Top {data.ads.length} by spend: {spotlightVerdictLine(data)}
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
          {data.adsWithSpend === 1 ? 'ad spending' : 'ads spending'}
        </small>
      </div>
      {THUMBS_BY_SIZE[size] > 0 ? (
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

function ReadyBody({
  spotlight,
  read,
  size,
}: {
  spotlight: CreativeSpotlight;
  read: HomeCreativeSpotlightData | null;
  size: 's' | 'm' | 'l';
}) {
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
          {spotlight.total === 1 ? 'ad judged' : 'ads judged'}
        </small>
      </div>
      {thumbs.length > 0 ? (
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
        badge={`${spotlight.total} ads judged · ${spotlight.counts.winning} winning`}
        expanded={<CreativeModule ctx={ctx} read={spotlightRead} spotlight={spotlight} />}
        expandedDescription={
          spotlightRead
            ? 'The brand’s top ads by spend, every ad the stored report judged, and the flywheel between organic, paid and creative.'
            : 'Every ad the stored creative report judged, and the flywheel between organic, paid and creative.'
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
        badge={`${spotlightRead.adsWithSpend} ads spending`}
        expanded={<CreativeModule ctx={ctx} read={spotlightRead} spotlight={null} />}
        expandedDescription="The brand’s top ads by spend, and the flywheel between organic, paid and creative."
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
          The creative report could not be read.{' '}
          <Button
            className="h-5 px-1 text-xs"
            onClick={() => void read.refetch()}
            size="sm"
            type="button"
            variant="link"
          >
            Retry
          </Button>
        </p>
      ) : null}
    </HomeTileFrame>
  );
}
