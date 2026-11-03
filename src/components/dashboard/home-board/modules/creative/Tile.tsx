'use client';

// H09 Creative spotlight, the small tile: how many ads the stored creative report judged, how
// they stand, and (at m/l) their stored thumbnails. One read: the brand's
// paid_media.creative_reports row (usePaidCreativeReport). The headline reproduces as
// `select jsonb_array_length(report->'verdicts') from paid_media.creative_reports
//  where brand_id = <brand>`.
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { CreativeThumb } from './CreativeThumb';
import { type CreativeSpotlight, creativeTileState, standingLine } from './creativeModel';

const CreativeModule = lazy(() => import('./Module'));

const THUMBS_BY_SIZE = { s: 0, m: 4, l: 5 } as const;

function ReadyBody({ spotlight, size }: { spotlight: CreativeSpotlight; size: 's' | 'm' | 'l' }) {
  const thumbs = spotlight.cards.slice(0, THUMBS_BY_SIZE[size]);
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
              key={card.adId}
              url={card.thumbnailUrl}
            />
          ))}
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs leading-snug">{standingLine(spotlight.counts)}</p>
    </div>
  );
}

export default function CreativeTile({ ctx, tile }: HomeTileProps) {
  const read = usePaidCreativeReport(ctx.brandId);
  const view = creativeTileState(read, ctx.adAccounts);

  if (view.state === 'ready') {
    const { spotlight } = view;
    return (
      <HomeTileFrame
        badge={`${spotlight.total} ads judged · ${spotlight.counts.winning} winning`}
        expanded={<CreativeModule ctx={ctx} spotlight={spotlight} />}
        expandedDescription="Every ad the stored creative report judged, and the flywheel between organic, paid and creative."
        state="ready"
        tile={tile}
      >
        <ReadyBody size={tile.size} spotlight={spotlight} />
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
