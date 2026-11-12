'use client';

// H10 Flywheel: a section of the Creative expanded module, never a board tile. Three lanes, each
// from a read that exists or honestly marked as not available (see flywheelModel.ts). The organic
// winners read mounts here, so it runs only when someone opens the Creative module.
//
// The organic lane acts only in operate mode, where the board's verb ("Create paused") is exactly
// what the existing promote route does. In every other mode it links to the Organic page, where
// the same action already lives.
import type { HomeMode, OrganicWinner } from '@continuum/contracts';
import Link from 'next/link';
import { useTranslations as useBetaTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganicWinners } from '@/hooks/useOrganicWinners';
import { cn } from '@/lib/utils';
import { CREATIVE_LINKS, type CreativeCard, STANDING_LABEL } from '../creative/creativeModel';
import {
  FLYWHEEL_LANES,
  FLYWHEEL_SENTENCES,
  type FlywheelLaneId,
  liftLine,
  winnerTitle,
} from './flywheelModel';
import { PromoteWinnerDialog } from './PromoteWinnerDialog';

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
  const betaUiText = useBetaTranslations('dashboard');

  const winners = useOrganicWinners(brandId);
  const [promoting, setPromoting] = useState<OrganicWinner | null>(null);

  if (winners.isLoading) return <Skeleton className="h-16 w-full" />;
  if (winners.isError && !winners.data) {
    return (
      <p className="text-destructive-ink text-xs" role="alert">
        {FLYWHEEL_SENTENCES.winnersFailed}{' '}
        <Button
          className="h-5 px-1 text-xs"
          onClick={() => void winners.refetch()}
          size="sm"
          type="button"
          variant="link"
        >
          {betaUiText('beta_942087cc2d41')}
        </Button>
      </p>
    );
  }
  const list = winners.data?.winners ?? [];
  if (list.length === 0) return <LaneEmpty>{FLYWHEEL_SENTENCES.noWinners}</LaneEmpty>;

  const actionFor = (winner: OrganicWinner): ReactNode => {
    if (winner.promotion !== null) {
      return (
        <span className="text-muted-foreground text-xs">{betaUiText('beta_9e284f5cc45c')}</span>
      );
    }
    if (mode === 'operate') {
      return (
        <Button onClick={() => setPromoting(winner)} size="xs" type="button" variant="outline">
          {verbLabel}
        </Button>
      );
    }
    return (
      <Link className="text-primary text-xs hover:underline" href={CREATIVE_LINKS.organicWinners}>
        {betaUiText('beta_f91ae7624cc8')}
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
      {promoting ? (
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
  const betaUiText = useBetaTranslations('dashboard');

  return (
    <div className="space-y-2">
      {candidates.length === 0 ? (
        <LaneEmpty>{FLYWHEEL_SENTENCES.nothingToRefresh}</LaneEmpty>
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
                  {STANDING_LABEL[card.standing]}
                </Badge>
                {card.optimizerRecommendationId ? (
                  <Link
                    className="text-primary text-xs hover:underline"
                    href={CREATIVE_LINKS.optimizer}
                  >
                    {betaUiText('beta_175c5bc29a0a')}
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
        {betaUiText('beta_a71e73726a76')}
      </Link>
    </div>
  );
}

export default function Flywheel({ brandId, mode, verbLabel, refreshCandidates }: FlywheelProps) {
  const betaUiText = useBetaTranslations('dashboard');

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
      <h4 className="font-semibold text-sm">{betaUiText('beta_9ecaa1f12f13')}</h4>
      <div
        aria-label={betaUiText('beta_2ab1c22af2d0')}
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
            {candidate.label}
            <span className="tabular-nums">
              {candidate.available
                ? (counts[candidate.id] ?? '…')
                : betaUiText('beta_d4c8bb83e473')}
            </span>
          </button>
        ))}
      </div>
      <div className="min-w-0" role="tabpanel">
        <p className="mb-2 text-muted-foreground text-xs">{lane.description}</p>
        {lane.id === 'organic-to-paid' ? (
          <OrganicToPaid brandId={brandId} mode={mode} verbLabel={verbLabel} />
        ) : null}
        {lane.id === 'paid-to-creative' ? <PaidToCreative candidates={refreshCandidates} /> : null}
        {lane.id === 'creative-to-organic' ? (
          <p
            className="text-muted-foreground text-xs leading-snug"
            data-testid="flywheel-lane-unavailable"
          >
            {FLYWHEEL_SENTENCES.notAvailable}
          </p>
        ) : null}
      </div>
    </section>
  );
}
