'use client';

import type { HomeCreativeSpotlightData } from '@continuum/contracts';
import Link from 'next/link';
// H09 expanded: the Backend's Creative Spotlight when it answers (top ads by spend with hook rate,
// format and fatigue; until it deploys the module says so), every ad the stored creative report
// judged — stored thumbnail, stored reason, standing, cost — filterable by standing, the report's
// synopsis themes, and the flywheel (H10) below. Reads nothing of its own: the tile hands it both.
//
// "Make variants" links to the Optimizer only where the report cross-references a pending
// recommendation for the ad's ad set: generation starts from that recommendation there
// (optimizer_request_creative_generation is a write and stays on that page). No AI Studio route
// takes an ad, so AI Studio is linked as itself.
import { useTranslations } from 'next-intl';
import { lazy, Suspense, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { HomeBoardContext } from '../../types';
import { CreativeThumb } from './CreativeThumb';
import {
  CREATIVE_LINKS,
  type CreativeCard,
  type CreativeSpotlight,
  type CreativeStanding,
  needsNewCreative,
  STANDING_ORDER,
} from './creativeModel';
import { SpotlightSection } from './SpotlightSection';
import { STANDING_LABEL_KEYS } from './standingLabel';

const Flywheel = lazy(() => import('../flywheel/Flywheel'));

const STANDING_BADGE: Record<CreativeStanding, 'success' | 'destructive' | 'warning' | 'muted'> = {
  winning: 'success',
  losing: 'destructive',
  iterate: 'warning',
  early: 'muted',
};

type Filter = 'all' | CreativeStanding;

function Card({ card }: { card: CreativeCard }) {
  const uiText = useTranslations('dashboard');
  const reworks = card.standing === 'losing' || card.standing === 'iterate';
  return (
    <li
      className="flex w-44 shrink-0 snap-start flex-col gap-1.5 rounded-xl border bg-card p-1.5"
      data-testid="creative-card"
    >
      <CreativeThumb alt={card.adName} className="aspect-[4/5] w-full" url={card.thumbnailUrl} />
      <p className="truncate px-1 font-medium text-xs" title={card.adName}>
        {card.adName}
      </p>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-1 px-1">
        <span className="font-semibold text-xs tabular-nums">
          {card.cost ?? card.vsCohort ?? '—'}
        </span>
        <Badge variant={STANDING_BADGE[card.standing]}>
          {uiText(STANDING_LABEL_KEYS[card.standing])}
        </Badge>
      </div>
      {card.cost && card.vsCohort ? (
        <p className="px-1 text-2xs text-muted-foreground tabular-nums">{card.vsCohort}</p>
      ) : null}
      <p className="line-clamp-4 px-1 text-2xs text-muted-foreground leading-snug">{card.reason}</p>
      {card.briefTitle ? (
        <p className="px-1 text-2xs leading-snug">
          <span className="text-muted-foreground">{uiText('brief_cf6b473')} </span>
          {card.briefTitle}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-1 px-1 pb-0.5">
        {card.permalinkUrl ? (
          <a
            className="text-2xs text-primary hover:underline"
            href={card.permalinkUrl}
            rel="noreferrer"
            target="_blank"
          >
            {uiText('view_post_fe9715b')}
          </a>
        ) : null}
        {reworks && card.optimizerRecommendationId ? (
          <Link className="text-2xs text-primary hover:underline" href={CREATIVE_LINKS.optimizer}>
            {uiText('make_variants_in_the_optimizer_db4c0dd')}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function ReportSection({ spotlight }: { spotlight: CreativeSpotlight }) {
  const uiText = useTranslations('dashboard');
  const [filter, setFilter] = useState<Filter>('all');
  const filters: Filter[] = [
    'all',
    ...STANDING_ORDER.filter((standing) => spotlight.counts[standing] > 0),
  ];
  const cards =
    filter === 'all' ? spotlight.cards : spotlight.cards.filter((card) => card.standing === filter);

  return (
    <>
      <p className="text-muted-foreground text-xs leading-snug">
        {spotlight.adAccountName ? `${spotlight.adAccountName} · ` : ''}
        {spotlight.currency
          ? uiText('cost_per_result_in_currency_last_30_days_898458f', {
              currency: spotlight.currency,
            })
          : uiText('this_brand_s_meta_accounts_use_more_than_one__cbbab5b')}
      </p>
      {spotlight.refreshFailed ? (
        <p
          className="text-amber-800 text-xs dark:text-amber-300"
          data-testid="creative-refresh-failed"
        >
          {uiText('the_latest_refresh_of_this_report_failed_this_3ff3e59')}
        </p>
      ) : null}

      <div
        aria-label={uiText('filter_ads_by_standing_498ebbd')}
        className="flex flex-wrap gap-1"
        role="tablist"
      >
        {filters.map((key) => (
          <button
            aria-selected={filter === key}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs',
              filter === key
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'text-muted-foreground',
            )}
            key={key}
            onClick={() => setFilter(key)}
            role="tab"
            type="button"
          >
            {key === 'all' ? uiText('all_a52ace4') : uiText(STANDING_LABEL_KEYS[key])}{' '}
            <span className="tabular-nums">
              {key === 'all' ? spotlight.total : spotlight.counts[key]}
            </span>
          </button>
        ))}
      </div>

      <ul className="flex min-w-0 snap-x gap-2.5 overflow-x-auto pb-2" data-testid="creative-cards">
        {cards.map((card) => (
          <Card card={card} key={card.adId} />
        ))}
      </ul>

      {spotlight.themes.length > 0 ? (
        <section className="space-y-1.5">
          <h4 className="font-semibold text-xs">{uiText('what_the_report_sees_548510b')}</h4>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-snug">
            {spotlight.themes.map((theme) => (
              <li key={theme}>{theme}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export default function CreativeModule({
  ctx,
  spotlight,
  read = null,
}: {
  ctx: HomeBoardContext;
  /** The stored creative report, read for the Home; null when the brand has none. */
  spotlight: CreativeSpotlight | null;
  /** The Backend's Creative Spotlight; null until it is deployed or when it holds nothing. */
  read?: HomeCreativeSpotlightData | null;
}) {
  const uiText = useTranslations('dashboard');
  const reportThumbs = new Map(
    (spotlight?.cards ?? []).map((card) => [card.adId, card.thumbnailUrl]),
  );
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="creative-module">
      {read ? <SpotlightSection data={read} reportThumbs={reportThumbs} /> : null}
      {spotlight ? <ReportSection spotlight={spotlight} /> : null}
      {read ? null : (
        <p className="text-muted-foreground text-xs" data-testid="creative-not-readable">
          {uiText('hook_rate_format_and_a_fatigue_score_are_not__33560fc')}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          href={CREATIVE_LINKS.insights}
        >
          {uiText('open_creative_insights_fcbecd8')}
        </Link>
      </div>

      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Flywheel
          brandId={ctx.brandId}
          mode={ctx.board.mode}
          refreshCandidates={spotlight ? needsNewCreative(spotlight) : []}
          verbLabel={ctx.board.verb.label}
        />
      </Suspense>
    </div>
  );
}
