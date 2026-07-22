'use client';

// The creative calls on ONE ad set's ads, rendered directly under the budget move
// being made on that ad set — so the operator decides the budget and the creative
// in one look instead of two surfaces.
//
// Lazy by construction: this component is only mounted while its ad set is
// expanded, which is what keeps the ad-level read disabled on a workspace holding
// dozens of ad sets.
//
// Verdicts come from the brand-wide paid_media.creative_reports row and are
// joined by ad id; the assembler's rules are never re-derived here. Coverage is
// partial in the normal case, so an uncovered ad says so on its own row and the
// panel repeats the count — an empty box must never read as "nothing wrong".
//
// Thumbnails render through ChatMediaThumb rather than a raw img so an expired
// Meta CDN URL re-resolves through the recovery hook; a letter tile is a failure,
// not a graceful degrade.

import type { AdsetAd, PaidAdAngle } from '@continuum/contracts';
import { useMemo } from 'react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromPaidVerdict } from '@/components/chat/media/media';
import { VerdictHoverCard } from '@/components/paid-media/dashboard/whats-working/VerdictHoverCard';
import { VERDICT_STYLE } from '@/components/paid-media/dashboard/whats-working/whatsWorkingModel';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePaidCreativeRecovery } from '@/hooks/usePaidCreativeRecovery';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { cn } from '@/lib/utils';
import { formatCpa, humanize } from '../format';
import { useOptimizerAdAngles, useOptimizerAdsetAds } from '../useOptimizerData';
import {
  type AdsetCreativeVerdictRow,
  joinAdsetCreativeRows,
  summarizeVerdictCoverage,
  verdictCoverageNotice,
} from './adsetVerdictRows';

/** The communication-angle chip for one ad — the labeler's angle archetype, with
 *  its hook + confidence exposed on hover. Shared with the pre-creation preview
 *  drill-in. Renders nothing until the labeler has tagged the ad. */
export function AngleChip({ angle }: { angle: PaidAdAngle }) {
  const confidence =
    typeof angle.confidence === 'number' ? `${Math.round(angle.confidence * 100)}%` : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="shrink-0 text-3xs" variant="secondary">
          {humanize(angle.angle)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1">
        {angle.hook ? <p className="text-2xs">&ldquo;{angle.hook}&rdquo;</p> : null}
        <p className="text-3xs text-muted-foreground">
          {humanize(angle.angle)}
          {confidence ? ` · ${confidence} confidence` : ''}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

type AdsetCreativeVerdictsProps = {
  brandId: string;
  accountId: string | null;
  adsetId: string;
  currency?: string | null;
};

type CreativeRowProps = {
  row: AdsetCreativeVerdictRow;
  angle?: PaidAdAngle | null;
  currency?: string | null;
  freshUrl: string | null;
  onRecover: (adId: string) => void;
};

function adLabel(ad: AdsetAd): string {
  return ad.name || ad.id;
}

function CreativeRow({ row, angle, currency, freshUrl, onRecover }: CreativeRowProps) {
  const { ad, verdict, thinEvidence } = row;
  const label = adLabel(ad);
  const media = mediaFromPaidVerdict({
    adId: ad.id,
    adName: label,
    thumbnailUrl: freshUrl ?? verdict?.thumbnailUrl ?? ad.thumbnailUrl ?? null,
    permalinkUrl: verdict?.permalinkUrl ?? null,
  });

  const body = (
    <div className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted/40">
      {media ? (
        <span className="relative block size-6 shrink-0 overflow-hidden rounded-sm">
          <ChatMediaThumb
            className="rounded-sm"
            fallbackSeed={label}
            media={media}
            onRecover={() => onRecover(ad.id)}
          />
        </span>
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-muted text-3xs text-muted-foreground">
          AD
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-2xs text-foreground">{label}</span>
      {angle ? <AngleChip angle={angle} /> : null}
      {verdict ? (
        <>
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 font-semibold text-3xs uppercase tracking-wide',
              VERDICT_STYLE[verdict.verdict],
              thinEvidence && 'opacity-60',
            )}
          >
            {verdict.verdict}
          </span>
          {thinEvidence ? (
            <span className="shrink-0 text-3xs text-muted-foreground">thin evidence</span>
          ) : null}
          <span className="shrink-0 text-3xs text-muted-foreground tabular-nums">
            {formatCpa(verdict.cpa, currency)}
          </span>
        </>
      ) : (
        <span className="shrink-0 text-3xs text-muted-foreground">no verdict</span>
      )}
    </div>
  );

  if (!verdict) return <li>{body}</li>;

  return (
    <li>
      <VerdictHoverCard freshUrl={freshUrl} onRecover={onRecover} verdict={verdict}>
        {body}
      </VerdictHoverCard>
    </li>
  );
}

export function AdsetCreativeVerdicts({
  brandId,
  accountId,
  adsetId,
  currency,
}: AdsetCreativeVerdictsProps) {
  const adsQuery = useOptimizerAdsetAds(brandId, accountId, adsetId);
  const anglesQuery = useOptimizerAdAngles(brandId, accountId, adsetId);
  const { report, isLoading: isReportLoading } = usePaidCreativeReport(brandId);
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId: accountId });
  const angleByAd = useMemo(
    () => new Map(anglesQuery.data.map((angle) => [angle.ad_id, angle])),
    [anglesQuery.data],
  );

  if (adsQuery.isLoading || isReportLoading) {
    return (
      <div className="space-y-1 py-1 pl-6">
        <Skeleton className="h-7 rounded-md" />
        <Skeleton className="h-7 w-2/3 rounded-md" />
      </div>
    );
  }

  if (adsQuery.isError) {
    return (
      <p className="py-1.5 pl-6 text-2xs text-warning">
        Couldn&rsquo;t load the ads in this ad set, so no creative verdicts are shown.
      </p>
    );
  }

  const ads = adsQuery.data;
  if (ads.length === 0) {
    return <p className="py-1.5 pl-6 text-2xs text-muted-foreground">No ads in this ad set.</p>;
  }

  const rows = joinAdsetCreativeRows({ ads, verdicts: report?.verdicts ?? [] });
  const notice = verdictCoverageNotice(
    summarizeVerdictCoverage({ rows, hasReport: Boolean(report) }),
  );

  return (
    <div className="space-y-1 pl-6">
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <CreativeRow
            angle={angleByAd.get(row.ad.id) ?? null}
            currency={currency}
            freshUrl={freshUrlById[row.ad.id] ?? null}
            key={row.ad.id}
            onRecover={recover}
            row={row}
          />
        ))}
      </ul>
      {notice ? <p className="px-1 pb-1 text-3xs text-muted-foreground">{notice}</p> : null}
    </div>
  );
}
