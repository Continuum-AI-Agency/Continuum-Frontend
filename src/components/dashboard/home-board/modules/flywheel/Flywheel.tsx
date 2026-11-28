'use client';

import type { HomeMode, OrganicWinner } from '@continuum/contracts';
import Link from 'next/link';
// H10 Flywheel: a section of the Creative expanded module, never a board tile. Three lanes, each
// from a read that exists or honestly marked as not available (see flywheelModel.ts). The organic
// winners read mounts here, so it runs only when someone opens the Creative module.
//
// The organic lane acts only in operate mode, where the board's verb ("Create paused") is exactly
// what the existing promote route does. In every other mode it links to the Organic page, where
// the same action already lives.
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganicWinners } from '@/hooks/useOrganicWinners';
import { cn } from '@/lib/utils';
import { HOME_DRAFT_READ_ONLY, useHomeDraft } from '../../HomePresentationContext';
import { CREATIVE_LINKS, type CreativeCard } from '../creative/creativeModel';
import { STANDING_LABEL_KEYS } from '../creative/standingLabel';
import {
  FLYWHEEL_LANES,
  type FLYWHEEL_SENTENCES,
  type FlywheelLaneId,
  liftLine,
  winnerTitle,
} from './flywheelModel';
import { PromoteWinnerDialog } from './PromoteWinnerDialog';

/** FLYWHEEL_SENTENCES' catalog keys: each sentence said in the UI language. */
const SENTENCE_KEYS = {
  noWinners: 'no_organic_winners_yet_a_post_counts_after_3__733ef38',
  winnersFailed: 'the_organic_winners_could_not_be_read_bf6eca1',
  nothingToRefresh: 'no_ad_needs_a_new_creative_in_the_stored_crea_c777d8d',
  noReport: 'no_creative_report_yet_so_no_ad_is_flagged_fo_67d1f43',
  notAvailable: 'not_available_yet_continuum_does_not_link_a_p_2b3b1af',
} as const satisfies Record<keyof typeof FLYWHEEL_SENTENCES, string>;

/** FLYWHEEL_LANES' label and description keys, per lane. */
const LANE_KEYS = {
  'organic-to-paid': {
    label: 'organic_paid_8ece0eb',
    description: 'posts_that_beat_the_account_s_median_ready_to_9f64f4d',
  },
  'paid-to-creative': {
    label: 'paid_creative_a5cbc2c',
    description: 'ads_the_creative_report_says_need_a_new_creat_e7fa740',
  },
  'creative-to-organic': {
    label: 'creative_organic_26ec151',
    description: 'new_variants_to_publish_as_organic_posts_90748e6',
  },
} as const satisfies Record<FlywheelLaneId, { label: string; description: string }>;

export type FlywheelProps = {
  brandId: string;
  mode: HomeMode;
  /** The board's verb for this mode; used only where the promote route backs it. */
  verbLabel: string;
  /** Ads the stored creative report says need a new creative (needsNewCreative). */
  refreshCandidates: CreativeCard[];
};

function LaneEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs leading-snug" data-testid="flywheel-lane-empty">
      {children}
    </p>
  );
}

function WinnerItem({ winner, action }: { winner: OrganicWinner; action: ReactNode }) {
  const title = winnerTitle(winner);
  const lifts = liftLine(winner);
  return (
    <li
      className="flex min-w-0 items-start justify-between gap-3 border-t py-2 first:border-t-0"
      data-testid="flywheel-winner"
    >
      <div className="min-w-0">
        {winner.permalink && /^https?:\/\//i.test(winner.permalink) ? (
          <a
            className="block truncate text-sm hover:underline"
            href={winner.permalink}
            rel="noreferrer"
            target="_blank"
          >
            {title}
          </a>
        ) : (
          <span className="block truncate text-sm">{title}</span>
        )}
        {lifts ? <span className="text-muted-foreground text-xs tabular-nums">{lifts}</span> : null}
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

function OrganicToPaid({ brandId, mode, verbLabel }: Omit<FlywheelProps, 'refreshCandidates'>) {
  const uiText = useTranslations('dashboard');
  const draft = useHomeDraft();
  const winners = useOrganicWinners(brandId);
  const [promoting, setPromoting] = useState<OrganicWinner | null>(null);

  if (winners.isLoading) return <Skeleton className="h-16 w-full" />;
  if (winners.isError && !winners.data) {
    return (
      <p className="text-destructive-ink text-xs" role="alert">
        {uiText(SENTENCE_KEYS.winnersFailed)}{' '}
        <Button
          className="h-5 px-1 text-xs"
          onClick={() => void winners.refetch()}
          size="sm"
          type="button"
          variant="link"
        >
          {uiText('retry_942087c')}
        </Button>
      </p>
    );
  }
  const list = winners.data?.winners ?? [];
  if (list.length === 0) return <LaneEmpty>{uiText(SENTENCE_KEYS.noWinners)}</LaneEmpty>;

  const actionFor = (winner: OrganicWinner): ReactNode => {
    if (winner.promotion !== null) {
      return (
        <span className="text-muted-foreground text-xs">{uiText('running_as_ad_9e284f5')}</span>
      );
    }
    if (mode === 'operate') {
      return (
        <Button
          disabled={draft}
          title={draft ? uiText(HOME_DRAFT_READ_ONLY) : undefined}
          onClick={() => {
            if (!draft) setPromoting(winner);
          }}
          size="xs"
          type="button"
          variant="outline"
        >
          {verbLabel}
        </Button>
      );
    }
    return (
      <Link className="text-primary text-xs hover:underline" href={CREATIVE_LINKS.organicWinners}>
        {uiText('open_in_organic_f91ae76')}
      </Link>
    );
  };

  return (
    <>
      <ul>
        {list.map((winner) => (
          <WinnerItem action={actionFor(winner)} key={winner.mediaId} winner={winner} />
        ))}
      </ul>
      {!draft && promoting ? (
        <PromoteWinnerDialog
          brandId={brandId}
          onClose={() => setPromoting(null)}
          winner={promoting}
        />
      ) : null}
    </>
  );
}

function PaidToCreative({ candidates }: { candidates: CreativeCard[] }) {
  const uiText = useTranslations('dashboard');
  return (
    <div className="space-y-2">
      {candidates.length === 0 ? (
        <LaneEmpty>{uiText(SENTENCE_KEYS.nothingToRefresh)}</LaneEmpty>
      ) : (
        <ul>
          {candidates.map((card) => (
            <li
              className="flex min-w-0 items-start justify-between gap-3 border-t py-2 first:border-t-0"
              data-testid="flywheel-refresh"
              key={card.adId}
            >
              <div className="min-w-0">
                <span className="block truncate text-sm" title={card.adName}>
                  {card.adName}
                </span>
                <span className="line-clamp-2 text-muted-foreground text-xs leading-snug">
                  {card.briefTitle ?? card.reason}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={card.standing === 'losing' ? 'destructive' : 'warning'}>
                  {uiText(STANDING_LABEL_KEYS[card.standing])}
                </Badge>
                {card.optimizerRecommendationId ? (
                  <Link
                    className="text-primary text-xs hover:underline"
                    href={CREATIVE_LINKS.optimizer}
                  >
                    {uiText('variants_in_the_optimizer_175c5bc')}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
        href={CREATIVE_LINKS.studio}
      >
        {uiText('open_ai_studio_a71e737')}
      </Link>
    </div>
  );
}

export default function Flywheel({ brandId, mode, verbLabel, refreshCandidates }: FlywheelProps) {
  const uiText = useTranslations('dashboard');
  const [laneId, setLaneId] = useState<FlywheelLaneId>('organic-to-paid');
  const winners = useOrganicWinners(brandId);
  const counts: Record<FlywheelLaneId, number | null> = {
    'organic-to-paid': winners.data ? winners.data.winners.length : null,
    'paid-to-creative': refreshCandidates.length,
    'creative-to-organic': null,
  };
  const lane = FLYWHEEL_LANES.find((candidate) => candidate.id === laneId) ?? FLYWHEEL_LANES[0];

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border p-3" data-testid="flywheel">
      <h4 className="font-semibold text-sm">{uiText('flywheel_9ecaa1f')}</h4>
      <div
        aria-label={uiText('flywheel_lanes_2ab1c22')}
        className="flex flex-wrap gap-1"
        role="tablist"
      >
        {FLYWHEEL_LANES.map((candidate) => (
          <button
            aria-selected={candidate.id === laneId}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
              candidate.id === laneId
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'text-muted-foreground',
            )}
            key={candidate.id}
            onClick={() => setLaneId(candidate.id)}
            role="tab"
            type="button"
          >
            {uiText(LANE_KEYS[candidate.id].label)}
            <span className="tabular-nums">
              {candidate.available
                ? (counts[candidate.id] ?? '…')
                : `· ${uiText('not_available_yet_787406d')}`}
            </span>
          </button>
        ))}
      </div>
      <div className="min-w-0" role="tabpanel">
        <p className="mb-2 text-muted-foreground text-xs">
          {uiText(LANE_KEYS[lane.id].description)}
        </p>
        {lane.id === 'organic-to-paid' ? (
          <OrganicToPaid brandId={brandId} mode={mode} verbLabel={verbLabel} />
        ) : null}
        {lane.id === 'paid-to-creative' ? <PaidToCreative candidates={refreshCandidates} /> : null}
        {lane.id === 'creative-to-organic' ? (
          <p
            className="text-muted-foreground text-xs leading-snug"
            data-testid="flywheel-lane-unavailable"
          >
            {uiText(SENTENCE_KEYS.notAvailable)}
          </p>
        ) : null}
      </div>
    </section>
  );
}
