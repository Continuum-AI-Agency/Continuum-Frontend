'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type {
  AccountAngleRow,
  AccountAngleVerdict,
  AngleReadLine,
  AngleReadPart,
  InsightsWindow,
} from './creativeInsightsModel';

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

function windowPhrase(
  lookback: InsightsWindow,
  t: ReturnType<typeof useTranslations<'scale'>>,
): string {
  return t('creativeWindowPhrase', { days: lookback });
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
  const uiText = useTranslations('scale');
  if (read.length === 0) return null;
  return (
    <section className="max-w-[64ch] space-y-1.5" data-testid="creative-insights-read">
      <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
        {uiText.rich('sentence_6ebc4bac55fe', {
          v0:
            lookback === 'd7'
              ? uiText('this_week_s_read_7d2122c')
              : uiText('this_month_s_read_806ecb2'),
          v1: () => <span className="tabular-nums">{eligibleAds}</span>,
        })}
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
  const uiText = useTranslations('scale');
  const VERDICT_META: Record<AccountAngleVerdict, { label: string; tone: string }> = useMemo(
    () => ({
      double_down: {
        label: uiText('double_down_5c8d3be'),
        tone: 'text-emerald-600 dark:text-emerald-400',
      },
      rebuild_craft: {
        label: uiText('rebuild_the_craft_bdb1ce4'),
        tone: 'text-amber-600 dark:text-amber-400',
      },
      introduce: { label: uiText('introduce_317dca7'), tone: 'text-primary-ink' },
      insufficient: { label: uiText('not_enough_ads_47a441e'), tone: 'text-muted-foreground' },
      behind: { label: uiText('losing_in_its_ad_sets_fcc81ea'), tone: 'text-muted-foreground' },
    }),
    [uiText],
  );

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
          <span className="@2xl/ci:hidden">{uiText('ads_9210f3b')}</span>
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
  loading,
  error,
  lookback,
  funnel,
  scope,
}: {
  rows: AccountAngleRow[];
  neverTested: Array<{ angleId: string; label: string }>;
  loading: boolean;
  error: boolean;
  lookback: InsightsWindow;
  funnel: FunnelTab;
  scope: 'account' | 'brand';
}) {
  const uiText = useTranslations('scale');
  const notes = [
    'win rate is inside each ad set, so audience and budget are held constant',
    funnel === 'all' ? null : 'angles cover every funnel stage',
    scope === 'brand'
      ? "every ad account on this brand — this account's ad sets could not be read"
      : null,
  ].filter((note): note is string => note !== null);

  return (
    <section className="space-y-2" data-testid="creative-insights-angles">
      <SectionHeading sub={notes.join(' · ')} title={uiText('communication_angles_832ae5f')} />
      {loading ? (
        <p className="text-muted-foreground text-xs">{uiText('loading_angles_522dde1')}</p>
      ) : error ? (
        <p className="text-muted-foreground text-xs">
          {uiText('the_angle_read_did_not_answer_try_again_in_a__09aa49c')}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {uiText.rich('sentence_d5b72952b694', { v0: windowPhrase(lookback, uiText) })}
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
            <span>{uiText('angle_1968034')}</span>
            <span className="text-right">{uiText('ads_9210f3b')}</span>
            <span>{uiText('share_of_spend_eadd3f9')}</span>
            <span className="text-right">{uiText('win_rate_4be2547')}</span>
            <span className="text-right">{uiText('verdict_4a36f89')}</span>
          </div>
          {rows.map((row) => (
            <AngleTableRow key={row.angleId} row={row} />
          ))}
          <p className="border-border/60 border-t pt-2 text-xs text-muted-foreground">
            {uiText('cost_per_result_by_angle_is_not_shown_the_ang_feb5c6c')}
          </p>
        </div>
      )}
      {neverTested.length > 0 ? (
        <div className="space-y-1.5 pt-2" data-testid="creative-insights-never-tested">
          <h4 className="font-semibold text-foreground text-xs">
            {uiText('never_tested_in_this_account_5be3dcb')}
          </h4>
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
  const uiText = useTranslations('scale');
  return (
    <section className="space-y-3" data-testid="creative-insights-ads">
      <SectionHeading sub={uiText('creativeAdsReadHint')} title={uiText('ads_9210f3b')} />
      {ads.status === 'loading' ? (
        <p className="text-muted-foreground text-xs">
          {uiText('loading_creative_intelligence_7089eaf')}
        </p>
      ) : ads.status === 'assembling' ? (
        <p className="text-muted-foreground text-xs">
          {uiText('analyzing_your_ad_creatives_verdicts_appear_a_a8861a2')}
        </p>
      ) : ads.status === 'empty' ? (
        <p className="text-muted-foreground text-xs">
          {uiText('no_labeled_ads_with_enough_spend_yet_verdicts_34733ae')}
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

export function CreativeInsightsView(props: CreativeInsightsViewProps) {
  const uiText = useTranslations('scale');
  const WINDOW_OPTIONS: Array<{ value: InsightsWindow; label: string }> = useMemo(
    () => [
      { value: 'd7', label: uiText('7_days_7f920bb') },
      { value: 'd30', label: uiText('30_days_ffd7280') },
    ],
    [uiText],
  );

  const FUNNEL_OPTIONS: Array<{ value: FunnelTab; label: string }> = useMemo(
    () => [
      { value: 'all', label: uiText('all_a52ace4') },
      { value: 'tof', label: uiText('top_d5cdfcf') },
      { value: 'mof', label: uiText('creativeFunnelMid') },
      { value: 'bof', label: uiText('bottom_479ad21') },
    ],
    [uiText],
  );

  const eligibleAds = props.angleRows.reduce((sum, row) => sum + row.ads, 0);
  return (
    <div className="@container/ci flex flex-col gap-8" data-testid="creative-insights">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="mr-auto font-semibold text-base text-foreground">
          {uiText('creative_insights_48bfa3e')}
        </h2>
        <Segmented
          label={uiText('window_19734a1')}
          onChange={props.onLookbackChange}
          options={WINDOW_OPTIONS}
          value={props.lookback}
        />
        <Segmented
          label={uiText('funnel_stage_3331264')}
          onChange={props.onFunnelChange}
          options={FUNNEL_OPTIONS}
          value={props.funnel}
        />
        {props.explorer}
      </header>

      {props.anglesLoading ? null : (
        <TheRead eligibleAds={eligibleAds} lookback={props.lookback} read={props.read} />
      )}

      <CommunicationAngles
        error={props.anglesError}
        funnel={props.funnel}
        loading={props.anglesLoading}
        neverTested={props.neverTested}
        rows={props.angleRows}
        lookback={props.lookback}
        scope={props.scope}
      />

      <section className="space-y-2" data-testid="creative-insights-next">
        <SectionHeading
          sub={uiText('creativeAdsetProofHint')}
          title={uiText('angle_to_run_next_per_ad_set_2d875c2')}
        />
        {props.anglesLoading ? (
          <p className="text-muted-foreground text-xs">{uiText('loading_ad_sets_6efe89e')}</p>
        ) : (
          <AdsetAngleStanding
            currency={props.currency}
            emptyMessage={uiText('analyzed_creatives_empty')}
            rows={props.nextRows}
          />
        )}
      </section>

      <AdsSection ads={props.ads} currency={props.currency} />
    </div>
  );
}
