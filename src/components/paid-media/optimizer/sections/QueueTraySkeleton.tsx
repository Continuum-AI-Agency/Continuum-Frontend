'use client';
import { useTranslations } from 'next-intl';

// One portfolio's queue while its report loads (PP-L1V-cls-overview — Actions CLS 0.57). The
// tray used to hold a 112px card-shaped block and then open to its real 700–1,900px, pushing the
// next portfolio's queue down the page under the reader. The portfolio row already says how
// much is waiting (pending recommendations and budget moves), so the placeholder lays out that
// many rows, plus the reallocation story when money moves — on the page, no box.

import type { PortfolioListItem } from '@continuum/contracts';

import { SkeletonText } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type QueueSkeletonShape = {
  /** Queue rows: one per pending recommendation and budget move. */
  rows: number;
  /** Ad-set rows in the reallocation story; 0 when no money moves. A move has a giver and a
   *  taker, so the story shows one more ad set than it has moves. */
  storyRows: number;
};

/** How many rows the tray will open to, from the counts the portfolio row already carries. */
export function queueSkeletonShape(
  portfolio: Pick<PortfolioListItem, 'pending_recommendations' | 'pending_budget_moves'>,
): QueueSkeletonShape {
  const moves = Math.max(0, portfolio.pending_budget_moves ?? 0);
  const recommendations = Math.max(0, portfolio.pending_recommendations);
  return {
    rows: Math.max(1, recommendations + moves),
    storyRows: moves > 0 ? moves + 1 : 0,
  };
}

function RowLines({ className }: { className?: string }) {
  const uiText = useTranslations('scale');
  return (
    <div className={cn('flex flex-col gap-1 py-3', className)} data-testid="queue-skeleton-row">
      <p className="text-sm">
        <SkeletonText className="w-2/5">EASY/BROAD/OCTUBRE</SkeletonText>
      </p>
      <p className="text-xs">
        <SkeletonText className="w-4/5">
          {uiText('why_earned_a_smaller_share_of_the_pool_7bc3ef1')}
        </SkeletonText>
      </p>
      <p className="text-xs">
        <SkeletonText className="w-1/3">
          {uiText('skeleton_funds_campaign', { name: 'EASY/LKL / OCTUBRE' })}
        </SkeletonText>
      </p>
    </div>
  );
}

export function QueueTraySkeleton({
  portfolio,
}: {
  portfolio: Pick<PortfolioListItem, 'name' | 'pending_recommendations' | 'pending_budget_moves'>;
}) {
  const uiText = useTranslations('scale');
  const shape = queueSkeletonShape(portfolio);
  return (
    <section
      aria-busy="true"
      aria-label={uiText('template_adaee28a3042', { v0: portfolio.name })}
      className="space-y-3"
      data-testid="queue-tray-skeleton"
    >
      <div aria-hidden="true" className="space-y-1">
        <p className="text-base">
          <SkeletonText>{portfolio.name}</SkeletonText>
        </p>
        <p className="text-xs">
          <SkeletonText>{uiText('as_of_oct_8_2_34_pm_next_attempt_oct_13_fa19f9b')}</SkeletonText>
        </p>
      </div>
      <p aria-hidden="true" className="text-sm">
        <SkeletonText>{uiText('3_waiting_on_a_decision_bd429ef')}</SkeletonText>
      </p>
      <p aria-hidden="true" className="py-1 text-xs">
        <SkeletonText>{uiText('all_budget_pause_creative_fatigue_settings_87fe990')}</SkeletonText>
      </p>
      {shape.storyRows > 0 ? (
        <div aria-hidden="true" className="space-y-3 py-3" data-testid="queue-skeleton-story">
          <p className="text-sm">
            <SkeletonText wrap>
              {uiText('moving_13_85_mxn_day_from_2_ad_sets_to_2_ad_s_e2813a4')}
            </SkeletonText>
          </p>
          <p className="py-1 text-xs">
            <SkeletonText>{uiText('ad_set_cpa_daily_budget_024a5bd')}</SkeletonText>
          </p>
          <div>
            {Array.from({ length: shape.storyRows }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
              <RowLines key={index} />
            ))}
          </div>
          <p className="text-xs">
            <SkeletonText>
              {uiText('dot_cost_per_result_over_the_last_14_days_d2a3863')}
            </SkeletonText>
          </p>
        </div>
      ) : null}
      <div aria-hidden="true">
        {Array.from({ length: shape.rows }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
          <RowLines key={index} />
        ))}
      </div>
    </section>
  );
}
