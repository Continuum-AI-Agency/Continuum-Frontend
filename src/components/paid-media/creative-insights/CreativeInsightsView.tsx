'use client';

// Creative Insights, the presentational half: one page, general to concrete, no boxes.
//
//   1. Header — the title, the window (7 / 30 days) and the funnel filter.
//   2. The read — two sentences composed in code from the angle table's own figures.
//   3. Communication angles — every closed-vocabulary angle this account ran, then the angles
//      it never tested.
//   4. Angle to run next, per ad set — angleStanding's rows across the account.
//   5. Ads — the Scale / Iterate / Kill calls, each ad with its angle.
//
// Everything arrives as props (CreativeInsightsPage owns the reads), so a render test can
// drive every state without stubbing a module.

import type { FunnelTab, PaidCreativeSynopsis } from '@continuum/contracts';
import type { ReactNode } from 'react';
import { VerdictColumns } from '@/components/paid-media/dashboard/whats-working/VerdictColumns';
import { WhatsWorkingSynopsis } from '@/components/paid-media/dashboard/whats-working/WhatsWorkingSynopsis';
import type { VerdictsByKind } from '@/components/paid-media/dashboard/whats-working/whatsWorkingModel';
import { AdsetAngleStanding } from '@/components/paid-media/optimizer/charts/AdsetAngleStanding';
import type { AdsetAngleRow } from '@/components/paid-media/optimizer/charts/angleStanding';
import { SkeletonText } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type {
  AccountAngleRow,
  AccountAngleVerdict,
  AngleReadLine,
  AngleReadPart,
  InsightsWindow,
} from './creativeInsightsModel';

const WINDOW_OPTIONS: Array<{ value: InsightsWindow; label: string }> = [
  { value: 'd7', label: '7 days' },
  { value: 'd30', label: '30 days' },
];

const FUNNEL_OPTIONS: Array<{ value: FunnelTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'tof', label: 'Top' },
  { value: 'mof', label: 'Mid' },
  { value: 'bof', label: 'Bottom' },
];

const VERDICT_META: Record<AccountAngleVerdict, { label: string; tone: string }> = {
  double_down: { label: 'Double down', tone: 'text-emerald-600 dark:text-emerald-400' },
  rebuild_craft: { label: 'Rebuild the craft', tone: 'text-amber-600 dark:text-amber-400' },
  introduce: { label: 'Introduce', tone: 'text-primary-ink' },
  insufficient: { label: 'Not enough ads', tone: 'text-muted-foreground' },
  behind: { label: 'Losing in its ad sets', tone: 'text-muted-foreground' },
};

/** Win rate is only coloured once the sample can carry it. */
const TRUSTWORTHY_COMPARED_ADS = 3;

const pct = (value: number): string => `${Math.round(value * 100)}%`;

export type CreativeInsightsAdsState =
  | { status: 'loading' }
  | { status: 'assembling' }
  | { status: 'empty' }
  | {
      status: 'ready';
      verdictsByKind: VerdictsByKind;
      synopsis: PaidCreativeSynopsis | null;
      freshUrlById: Record<string, string>;
      onRecover: (adId: string) => void;
      angleLabelByAd: ReadonlyMap<string, string>;
    };

export type CreativeInsightsViewProps = {
  lookback: InsightsWindow;
  onLookbackChange: (lookback: InsightsWindow) => void;
  funnel: FunnelTab;
  onFunnelChange: (funnel: FunnelTab) => void;
  /** The win-rate explorer trigger, rendered at the right of the header. */
  explorer?: ReactNode;
  /** 'brand' when the account's ad-set list could not be read and the rows are brand-wide. */
  scope: 'account' | 'brand';
  anglesLoading: boolean;
  anglesError: boolean;
  angleRows: AccountAngleRow[];
  neverTested: Array<{ angleId: string; label: string }>;
  nextRows: AdsetAngleRow[];
  read: AngleReadLine[];
  currency: string | null;
  ads: CreativeInsightsAdsState;
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <Tabs onValueChange={(next) => onChange(next as T)} value={value}>
      <TabsList aria-label={label} className="h-7">
        {options.map((option) => (
          <TabsTrigger className="px-2 text-xs" key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function windowPhrase(lookback: InsightsWindow): string {
  return lookback === 'd7' ? 'last 7 days' : 'last 30 days';
}

function TheRead({
  read,
  lookback,
  eligibleAds,
}: {
  read: AngleReadLine[];
  lookback: InsightsWindow;
  eligibleAds: number;
}) {
  if (read.length === 0) return null;
  return (
    <section className="max-w-[64ch] space-y-1.5" data-testid="creative-insights-read">
      <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
        {lookback === 'd7' ? "This week's read" : "This month's read"} ·{' '}
        <span className="tabular-nums">{eligibleAds}</span> ads with enough delivery
      </p>
      {read.map((line) => (
        <p
          className={cn(
            'text-base leading-snug',
            line.kind === 'next' ? 'text-muted-foreground' : 'text-foreground',
          )}
          data-kind={line.kind}
          key={line.kind}
        >
          {line.parts.map((part, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a line's parts are a fixed sequence
            <ReadPart key={index} part={part} />
          ))}
        </p>
      ))}
    </section>
  );
}

const TONE_CLASS = { better: 'text-success', worse: 'text-destructive' } as const;

function ReadPart({ part }: { part: AngleReadPart }) {
  if (part.kind === 'angle') {
    return <span className="font-semibold text-foreground">{part.text}</span>;
  }
  if (part.kind === 'figure') return <span className="font-mono tabular-nums">{part.text}</span>;
  return part.tone ? <span className={TONE_CLASS[part.tone]}>{part.text}</span> : part.text;
}

const ANGLE_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 @2xl/ci:grid-cols-[minmax(0,1.6fr)_3.5rem_minmax(0,1.2fr)_5.5rem_9rem] @2xl/ci:items-center';

function AngleTableRow({ row }: { row: AccountAngleRow }) {
  const verdict = VERDICT_META[row.verdict];
  const trustworthy = row.comparedAds >= TRUSTWORTHY_COMPARED_ADS;
  const winTone =
    row.winRate === null || !trustworthy
      ? 'text-foreground'
      : row.winRate >= 0.5
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-destructive';

  return (
    <div
      className={cn(ANGLE_GRID, 'border-border/60 border-t py-2.5')}
      data-testid="creative-insights-angle-row"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground text-xs">{row.label}</p>
        {row.exampleAdName ? (
          <p className="truncate text-xs text-muted-foreground">{row.exampleAdName}</p>
        ) : null}
      </div>
      <span className={cn('text-right font-semibold text-xs @2xl/ci:order-last', verdict.tone)}>
        {verdict.label}
      </span>
      <div className="col-span-2 flex items-center gap-4 @2xl/ci:contents">
        <span className="text-muted-foreground text-xs tabular-nums @2xl/ci:text-right @2xl/ci:text-foreground">
          <span className="@2xl/ci:hidden">Ads </span>
          {row.ads}
        </span>
        <div className="flex flex-1 items-center gap-2">
          <span className="relative h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/45"
              style={{ width: `${Math.round((row.spendShare ?? 0) * 100)}%` }}
            />
          </span>
          <span className="w-9 text-right text-muted-foreground text-xs tabular-nums">
            {row.spendShare === null ? '—' : pct(row.spendShare)}
          </span>
        </div>
        <span className="text-xs tabular-nums @2xl/ci:text-right">
          {row.winRate === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              <span className={cn('font-semibold', winTone)}>{pct(row.winRate)}</span>
              <span className="ml-1 text-xs text-muted-foreground">
                {row.winners}/{row.comparedAds}
              </span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function CommunicationAngles({
  rows,
  neverTested,
  error,
  lookback,
  funnel,
  scope,
}: {
  rows: AccountAngleRow[];
  neverTested: Array<{ angleId: string; label: string }>;
  error: boolean;
  lookback: InsightsWindow;
  funnel: FunnelTab;
  scope: 'account' | 'brand';
}) {
  const notes = [
    'win rate is inside each ad set, so audience and budget are held constant',
    funnel === 'all' ? null : 'angles cover every funnel stage',
    scope === 'brand'
      ? "every ad account on this brand — this account's ad sets could not be read"
      : null,
  ].filter((note): note is string => note !== null);

  return (
    <section className="space-y-2" data-testid="creative-insights-angles">
      <SectionHeading sub={notes.join(' · ')} title="Communication angles" />
      {error ? (
        <p className="text-muted-foreground text-xs">
          The angle read did not answer. Try again in a moment.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No ad in this account has a confirmed angle with enough delivery in the{' '}
          {windowPhrase(lookback)} yet.
        </p>
      ) : (
        <div>
          <div
            aria-hidden="true"
            className={cn(
              ANGLE_GRID,
              'hidden pb-1.5 font-semibold text-xs text-muted-foreground uppercase tracking-wider @2xl/ci:grid',
            )}
          >
            <span>Angle</span>
            <span className="text-right">Ads</span>
            <span>Share of spend</span>
            <span className="text-right">Win rate</span>
            <span className="text-right">Verdict</span>
          </div>
          {rows.map((row) => (
            <AngleTableRow key={row.angleId} row={row} />
          ))}
          <p className="border-border/60 border-t pt-2 text-xs text-muted-foreground">
            Cost per result by angle is not shown: the angle read carries spend and wins, not the
            results behind them.
          </p>
        </div>
      )}
      {neverTested.length > 0 ? (
        <div className="space-y-1.5 pt-2" data-testid="creative-insights-never-tested">
          <h4 className="font-semibold text-foreground text-xs">Never tested in this account</h4>
          <div className="flex flex-wrap gap-1.5">
            {neverTested.map((angle) => (
              <span
                className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-foreground/80"
                key={angle.angleId}
              >
                {angle.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdsSection({ ads, currency }: { ads: CreativeInsightsAdsState; currency: string | null }) {
  return (
    <section className="space-y-3" data-testid="creative-insights-ads">
      <SectionHeading
        sub="last 30 days · hover a row for the creative and the reasoning"
        title="Ads"
      />
      {ads.status === 'loading' ? (
        <p className="text-muted-foreground text-xs">Loading creative intelligence…</p>
      ) : ads.status === 'assembling' ? (
        <p className="text-muted-foreground text-xs">
          Analyzing your ad creatives — verdicts appear after the first sync completes.
        </p>
      ) : ads.status === 'empty' ? (
        <p className="text-muted-foreground text-xs">
          No labeled ads with enough spend yet. Verdicts appear once ads clear the evidence floors
          (50 in spend, 3,000 impressions).
        </p>
      ) : (
        <>
          <WhatsWorkingSynopsis synopsis={ads.synopsis} />
          <VerdictColumns
            angleLabelByAd={ads.angleLabelByAd}
            currency={currency}
            freshUrlById={ads.freshUrlById}
            onRecover={ads.onRecover}
            verdictsByKind={ads.verdictsByKind}
          />
        </>
      )}
    </section>
  );
}

/**
 * The page body while the angle reads load. Every section below the header grows when those
 * reads land — the read is inserted above the angle table, and the table, the per-ad-set list and
 * the ads grow under it — so none of them is laid out yet: this block is replaced whole, and
 * nothing that was on screen moves (PP-DT-C-creative-insights-layout-shift-0.955, CLS 0.955 on a
 * phone). Borderless bars, never a card.
 */
function CreativeInsightsLoading() {
  return (
    <div
      aria-busy="true"
      className="flex flex-col gap-8"
      data-testid="creative-insights-loading"
      role="status"
    >
      <span className="sr-only">Loading Creative Insights…</span>
      <div aria-hidden="true" className="max-w-[64ch] space-y-1.5">
        <p className="text-xs">
          <SkeletonText>This week's read · 12 ads with enough delivery</SkeletonText>
        </p>
        <p className="text-base leading-snug">
          <SkeletonText wrap>
            Proof by someone like you wins most often. Discount offer carries 72% of the spend.
          </SkeletonText>
        </p>
      </div>
      <div aria-hidden="true" className="space-y-2">
        <p className="text-sm">
          <SkeletonText>Communication angles</SkeletonText>
        </p>
        {['a1', 'a2', 'a3', 'a4'].map((key) => (
          <p className="border-border/60 border-t py-2.5 text-xs" key={key}>
            <SkeletonText>Proof by someone like you · 6 ads · 24% · 83%</SkeletonText>
          </p>
        ))}
      </div>
    </div>
  );
}

export function CreativeInsightsView(props: CreativeInsightsViewProps) {
  const eligibleAds = props.angleRows.reduce((sum, row) => sum + row.ads, 0);
  return (
    <div className="@container/ci flex flex-col gap-8" data-testid="creative-insights">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="mr-auto font-semibold text-base text-foreground">Creative Insights</h2>
        <Segmented
          label="Window"
          onChange={props.onLookbackChange}
          options={WINDOW_OPTIONS}
          value={props.lookback}
        />
        <Segmented
          label="Funnel stage"
          onChange={props.onFunnelChange}
          options={FUNNEL_OPTIONS}
          value={props.funnel}
        />
        {props.explorer}
      </header>

      {props.anglesLoading ? (
        <CreativeInsightsLoading />
      ) : (
        <>
          <TheRead eligibleAds={eligibleAds} lookback={props.lookback} read={props.read} />

          <CommunicationAngles
            error={props.anglesError}
            funnel={props.funnel}
            neverTested={props.neverTested}
            rows={props.angleRows}
            lookback={props.lookback}
            scope={props.scope}
          />

          <section className="space-y-2" data-testid="creative-insights-next">
            <SectionHeading
              sub="what each ad set's own ads have proven"
              title="Angle to run next, per ad set"
            />
            <AdsetAngleStanding
              currency={props.currency}
              emptyMessage="Appears once this account's ad sets have analyzed creatives."
              rows={props.nextRows}
            />
          </section>

          {/* Last on the page, so its own read landing later grows nothing above it. */}
          <AdsSection ads={props.ads} currency={props.currency} />
        </>
      )}
    </div>
  );
}
