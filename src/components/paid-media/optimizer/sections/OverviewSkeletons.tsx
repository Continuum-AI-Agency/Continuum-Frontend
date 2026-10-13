'use client';

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

/** The sentence while the producer reads: said to assistive tech, drawn as a sentence-long bar
 *  that wraps where the real sentence will (one line on a wide pane, two or three on a phone). */
export function HeadlineSkeleton({ label }: { label: string }) {
  return (
    <p
      className={`${typeScale.headline} max-w-[62ch]`}
      data-pending="true"
      data-testid="overview-headline"
    >
      <span className="sr-only">{label}</span>
      <SkeletonText wrap>
        The account spent 30,517 MXN in 7 days across two platforms. 19 decisions waiting.
      </SkeletonText>
    </p>
  );
}

/** What each tile's three lines stand in for: label, figure, sub-line. The words are the
 *  usual ones, so each bar is the width the real text takes. */
const TILE_WORDS = [
  { label: 'Spend · 7 days', value: '30,517 MXN', sub: '▲ 13% vs prior 7 days · Meta 36%' },
  { label: 'Conversations', value: '230', sub: '47.47 MXN each · no target' },
  { label: 'Leads', value: '14', sub: '65.75 MXN each · target 70' },
  { label: 'Decisions', value: '19', sub: 'waiting across your portfolios' },
  { label: 'Autopilot', value: '3/4', sub: '1 recommends, does not apply' },
] as const;

/** The editorial figure row while its producer reads: spend as the hero, then `cells - 1`
 *  inline tiles, the last with its action line when decisions wait. */
export function OverviewTilesSkeleton({
  cells,
  withAction,
}: {
  cells: number;
  withAction: boolean;
}) {
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
              <p className="mt-1 text-xs">
                <SkeletonText>{words.sub}</SkeletonText>
              </p>
              {decision ? (
                // The real action is a text-xs button on the cell's own line box.
                <div className="mt-1">
                  <SkeletonText className="text-xs">Review →</SkeletonText>
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
  if (hidden) {
    return (
      <div aria-hidden="true" className="px-1 text-xs" data-testid="platform-comparison-skeleton">
        <SkeletonText>Show platforms side by side</SkeletonText>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="space-y-1.5 px-1" data-testid="platform-comparison-skeleton">
      <p className={cn(typeScale.label, 'font-semibold')}>
        <SkeletonText>Platforms side by side · conversations</SkeletonText>
      </p>
      <div className="text-sm">
        <div className="flex justify-between py-1.5 text-xs">
          <SkeletonText>Conversations by platform</SkeletonText>
          <SkeletonText>Share of conversations</SkeletonText>
        </div>
        {Array.from({ length: platforms }, (_, index) => (
          <div
            className="flex justify-between border-transparent border-t py-2"
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
            key={index}
          >
            <SkeletonText>Google · cheapest</SkeletonText>
            <SkeletonText>19,598 MXN</SkeletonText>
          </div>
        ))}
      </div>
      <p className="text-xs">
        <SkeletonText>Only Meta bought conversations at a cost in the window.</SkeletonText>
      </p>
      <p className="text-xs">
        <SkeletonText>All platforms: 30,517 MXN · 230 conversations</SkeletonText>
      </p>
    </div>
  );
}

/** "What Jaina recommends" while the account read loads: its heading and one card's lines, on
 *  the page rather than in a box. One card is what most reads open with. */
export function RecommendationsSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="space-y-2"
      data-testid="overview-recommendations-skeleton"
    >
      <p className={cn(typeScale.label, 'px-1 font-semibold')}>
        <SkeletonText>What Jaina recommends</SkeletonText>
      </p>
      <div className="flex min-w-0 flex-col gap-2 p-4">
        {/* The chip row is as tall as its platform chip. */}
        <div className="flex min-h-[18px] items-center text-xs">
          <SkeletonText>Meta · Lead · High · Adjust the setting</SkeletonText>
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className={cn(typeScale.bodyLg, 'font-semibold')}>
            <SkeletonText>Account: 27% over the plan, projected against the plan</SkeletonText>
          </p>
          <p className="text-xs">
            <SkeletonText>392 MXN/day · 11,762 MXN/mo</SkeletonText>
          </p>
          <p className="text-sm">
            <SkeletonText>7056.86 over the period budget on this pace</SkeletonText>
          </p>
          <p className="text-xs">
            <SkeletonText>Acts on its own, within your limits.</SkeletonText>
          </p>
          <p className="text-xs">
            <SkeletonText>{'MENSAJES // TODOS'}</SkeletonText>
          </p>
        </div>
      </div>
    </section>
  );
}

/** The meta line's facts while the producer reads (window, top spend, attribution), so the
 *  line wraps where the real one will. */
export function SublineFactsSkeleton() {
  return (
    <>
      <SkeletonText>Oct 5 – Oct 11</SkeletonText>
      <SkeletonText wrap>· Google takes 64% of the spend</SkeletonText>
      <SkeletonText wrap>· attribution: what each platform reports</SkeletonText>
    </>
  );
}
