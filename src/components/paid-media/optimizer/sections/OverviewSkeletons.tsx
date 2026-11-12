'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

// The Overview's loading rows, built to the size of the rows they become (PP-L1V-cls-overview).
// The page used to lay out the sentence, the band and the portfolio rows, then INSERT the figure
// row, the platforms table and the recommendation cards above the rows when their reads landed —
// 0.87 of cumulative layout shift, the rows pushed down twice. Each placeholder here reserves its
// block with the same classes as the real one and text-sized bars (SkeletonText), so the rows
// below never move. Borderless: bars on the page, never a card-shaped box (redesign constraint).

import { SkeletonText } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { KpiRow } from '../components/KpiTile';
import * as typeScale from '../typeScale';

/** How many platforms the brand reads, known from its connected accounts before the producer
 *  answers. The placeholders say what the page will say for that many: one platform has no
 *  top-spend fact and no platform split, and its sentence ends "on Meta". */
type PlatformCount = { platforms: number };

/** The sentence while the producer reads: said to assistive tech, drawn as a sentence-long bar
 *  that wraps where the real sentence will (one line on a wide pane, two or three on a phone). */
export function HeadlineSkeleton({ label, platforms }: { label: string } & PlatformCount) {
  const uiText = useTranslations('scale');
  return (
    <p
      className={`${typeScale.headline} max-w-[62ch]`}
      data-pending="true"
      data-testid="overview-headline"
    >
      <span className="sr-only">{label}</span>
      <SkeletonText wrap>
        {platforms >= 2
          ? uiText('the_account_spent_30_517_mxn_in_7_days_across_0b0a2ea')
          : uiText('the_account_spent_13_890_mxn_in_7_days_on_met_cce34f1')}
      </SkeletonText>
    </p>
  );
}

/** What each tile's three lines stand in for: label, figure, sub-line. The words are the
 *  usual ones, so each bar is the width the real text takes. */
const SPEND_SUB = {
  several: '▲ 136% vs prior 7 days · Meta 36% · Google 64%',
  one: 'Meta 13,890 MXN',
} as const;

/** The editorial figure row while its producer reads: spend as the hero, then `cells - 1`
 *  inline tiles, the last with its action line when decisions wait. */
export function OverviewTilesSkeleton({
  cells,
  withAction,
  platforms,
}: {
  cells: number;
  withAction: boolean;
} & PlatformCount) {
  const uiText = useTranslations('scale');
  const TILE_WORDS = useMemo(
    () =>
      [
        { label: uiText('spend_7_days_352823b'), value: '30,517 MXN', sub: SPEND_SUB.several },
        { label: uiText('conversations_1d432f5'), value: '230', sub: '47.47 MXN each · no target' },
        { label: uiText('leads_2f10a26'), value: '14', sub: '65.75 MXN each · target 70' },
        { label: uiText('decisions_cfa6a08'), value: '19', sub: 'waiting across your portfolios' },
        { label: uiText('autopilot_0c62cfc'), value: '3/4', sub: '1 recommends, does not apply' },
      ] as const,
    [uiText],
  );

  const shown = TILE_WORDS.slice(0, Math.max(2, Math.min(cells, TILE_WORDS.length)));
  return (
    <KpiRow testId="account-tiles-skeleton">
      {shown.map((words, index) => {
        const hero = index === 0;
        const decision = withAction && index === shown.length - 2;
        return (
          <div
            aria-hidden="true"
            className="flex min-w-0 flex-col gap-1.5 py-1"
            data-testid="tile-skeleton"
            key={words.label}
          >
            <span className={cn(typeScale.label, 'font-semibold')}>
              <SkeletonText>{words.label}</SkeletonText>
            </span>
            <div className="min-w-0">
              <p className={hero ? typeScale.figureHero : typeScale.figureTile}>
                <SkeletonText>{words.value}</SkeletonText>
              </p>
              {/* The sub-line wraps as the real one does: the spend split runs to two lines on a
               *  217px tile at 768, which a one-line bar left 14px short. */}
              <p className="mt-1 text-xs">
                <SkeletonText wrap>
                  {hero && platforms < 2 ? SPEND_SUB.one : words.sub}
                </SkeletonText>
              </p>
              {decision ? (
                // The real action is a text-xs button on the cell's own line box.
                <div className="mt-1">
                  <SkeletonText className="text-xs">{uiText('review_ab7681e')}</SkeletonText>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </KpiRow>
  );
}

/** The platforms side by side while the producer reads: its label line, the column heads, one
 *  row per connected platform and the two sentences under the table. A viewer who hid the table
 *  gets the one "Show" line it collapses to. */
export function PlatformComparisonSkeleton({
  platforms,
  hidden,
}: {
  platforms: number;
  hidden: boolean;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const exampleAmount = useMemo(
    () => new Intl.NumberFormat(uiLocale, { maximumFractionDigits: 0 }).format(19598),
    [uiLocale],
  );
  if (hidden) {
    return (
      <div aria-hidden="true" className="px-1 text-xs" data-testid="platform-comparison-skeleton">
        <SkeletonText>{uiText('show_platforms_side_by_side_86c3386')}</SkeletonText>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="space-y-1.5 px-1" data-testid="platform-comparison-skeleton">
      <p className={cn(typeScale.label, 'font-semibold')}>
        <SkeletonText>{uiText('platforms_side_by_side_conversations_70baa0b')}</SkeletonText>
      </p>
      <div className="text-sm">
        <div className="flex justify-between py-1.5 text-xs">
          <SkeletonText>{uiText('conversations_by_platform_846a674')}</SkeletonText>
          <SkeletonText>{uiText('share_of_conversations_a778e84')}</SkeletonText>
        </div>
        {Array.from({ length: platforms }, (_, index) => (
          <div
            className="flex justify-between border-transparent border-t py-2"
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={index}
          >
            <SkeletonText>{uiText('google_cheapest_f5af8f1')}</SkeletonText>
            <SkeletonText>{exampleAmount} MXN</SkeletonText>
          </div>
        ))}
      </div>
      <p className="text-xs">
        <SkeletonText>
          {uiText('only_meta_bought_conversations_at_a_cost_in_t_dc18efc')}
        </SkeletonText>
      </p>
      <p className="text-xs">
        <SkeletonText>{uiText('all_platforms_30_517_mxn_230_conversations_c81c25a')}</SkeletonText>
      </p>
    </div>
  );
}

/** "What Jaina recommends" while the account read loads: its heading and one card's lines, on
 *  the page rather than in a box. One card is what most reads open with. The card's own grid is
 *  kept — the title column beside the footer's "Ask Jaina" — so the title wraps where a real
 *  title does: a full-width one-line bar was 21px shorter than the card at 768. */
export function RecommendationsSkeleton() {
  const uiText = useTranslations('scale');
  return (
    <section
      aria-hidden="true"
      className="space-y-2"
      data-testid="overview-recommendations-skeleton"
    >
      <p className={cn(typeScale.label, 'px-1 font-semibold')}>
        <SkeletonText>{uiText('what_jaina_recommends_865694a')}</SkeletonText>
      </p>
      <div className="@container/recs">
        <div className="flex min-w-0 flex-col gap-2 p-4">
          {/* The chip row is as tall as its platform chip. */}
          <div className="flex min-h-[18px] items-center text-xs">
            <SkeletonText>{uiText('meta_lead_high_adjust_the_setting_6a799f0')}</SkeletonText>
          </div>
          <div className="grid gap-x-6 gap-y-3 @2xl/recs:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-1.5">
              <p className={cn(typeScale.bodyLg, 'font-semibold')}>
                <SkeletonText wrap>
                  {uiText('account_27_over_the_plan_33_158_mxn_projected_9510b21')}
                </SkeletonText>
              </p>
              <p className="text-xs">
                <SkeletonText>{uiText('392_mxn_day_11_762_mxn_mo_45fd396')}</SkeletonText>
              </p>
              <p className="text-sm">
                <SkeletonText>
                  {uiText('7056_86_over_the_period_budget_on_this_pace_70d166b')}
                </SkeletonText>
              </p>
              <p className="text-xs">
                <SkeletonText>{uiText('acts_on_its_own_within_your_limits_79bac8e')}</SkeletonText>
              </p>
              <p className="text-xs">
                <SkeletonText>{'MENSAJES // TODOS'}</SkeletonText>
              </p>
            </div>
            {/* The card's footer: a small ghost button's height and width ("Ask Jaina"). */}
            <div
              className="flex h-7 items-center self-start px-2.5 text-[0.8rem]"
              data-testid="recommendation-footer-skeleton"
            >
              <SkeletonText>{uiText('ask_jaina_5653497')}</SkeletonText>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The read's freshness fact on the meta line while the account read loads ("Read 21 hours
 *  ago · 2026-10-13 UTC  Re-read"). Arriving unreserved, it wrapped the line at 768. */
export function AccountReadFreshnessSkeleton() {
  const uiText = useTranslations('scale');
  return (
    <span aria-hidden="true" data-testid="account-read-freshness-skeleton">
      <SkeletonText>{uiText('read_21_hours_ago_2026_10_13_utc_re_read_b37a23b')}</SkeletonText>
    </span>
  );
}

/** The meta line's facts while the producer reads (window, top spend, attribution), so the
 *  line wraps where the real one will. */
export function SublineFactsSkeleton({ platforms }: PlatformCount) {
  const uiText = useTranslations('scale');
  return (
    <>
      <SkeletonText>{uiText('oct_5_oct_11_b5c04f3')}</SkeletonText>
      {platforms >= 2 ? (
        <SkeletonText wrap>{uiText('google_takes_64_of_the_spend_46c91b0')}</SkeletonText>
      ) : null}
      <SkeletonText wrap>{uiText('attribution_what_each_platform_reports_5b75533')}</SkeletonText>
    </>
  );
}
