// The MP1 frame's headline and tiles, read from public.optimizer_get_account_platform_metrics
// (frontend.html §2). "All" leads with the account: one sentence, then spend with each
// platform's share, one tile per result kind naming the platform that buys it cheapest,
// decisions waiting and autopilot. A platform tab leads with that platform from the same
// payload, so a figure on a tab is always one the "All" frame summed.
//
// Nothing here adds two currencies or two result kinds together; the model hands over the
// rows already split, and every figure node carries its provenance for the digit gate.

import type { AccountPlatformMetrics, KindAcrossPlatforms } from '@continuum/contracts';
import { KpiDelta, KpiRow, KpiTile } from '../../components/KpiTile';
import { figureProps, formatCurrency } from '../../format';
import * as typeScale from '../../typeScale';
import { HeadlineSentence } from '../account/HeadlineSentence';
import {
  accountSpendDeltaPct,
  accountsReadLabel,
  allPlatformsHeadlineSegments,
  capitalise,
  connectedTotals,
  coverageNote,
  figureWindowOfMetrics,
  formatResults,
  kindPlatformSplit,
  kindPriorMove,
  kindTileLabel,
  kindTileSub,
  kindWords,
  MAX_KIND_TILES,
  MIN_TILES,
  oneCurrency,
  platformKindSub,
  platformKinds,
  platformSpendFigure,
  platformSpendSub,
  platformTotals,
  rankedKinds,
  spendSplitLabel,
  topSpendLabel,
  windowDaysLabel,
} from './accountPlatformMetricsModel';
import { windowRangeLabel } from './googleAdsOverviewModel';
import { PlatformChip } from './PlatformChip';
import { PlatformReadingNote } from './PlatformReadingNote';
import { type AdPlatform, PLATFORM_NAMES } from './platformTabsModel';

export function AllPlatformsHeadline({
  metrics,
  pendingCount,
}: {
  metrics: AccountPlatformMetrics;
  /** The actions queue the Review button opens; see `allPlatformsHeadlineSegments`. */
  pendingCount: number;
}) {
  return (
    <HeadlineSentence
      segments={allPlatformsHeadlineSegments(metrics, pendingCount)}
      source="account-platform-metrics"
    />
  );
}

/** The sub-line's facts: the producer's window, the top-spend fact, and what was left out. */
export function AllPlatformsSubline({ metrics }: { metrics: AccountPlatformMetrics }) {
  const facts = [
    windowRangeLabel(metrics.window.since, metrics.window.until),
    topSpendLabel(metrics),
    'attribution: what each platform reports',
    coverageNote(metrics),
  ].filter((fact): fact is string => Boolean(fact));
  return (
    <>
      {facts.map((fact, index) => (
        <span data-testid={index === 0 ? 'overview-window' : undefined} key={fact}>
          {index > 0 ? <span aria-hidden="true">· </span> : null}
          {fact}
        </span>
      ))}
    </>
  );
}

/** The spend tile's line: the move against the prior window, then how the platforms split it. */
function SpendSub({ metrics }: { metrics: AccountPlatformMetrics }) {
  const delta = accountSpendDeltaPct(metrics);
  const prior = metrics.prior_window;
  return (
    <>
      {delta != null && prior ? (
        <>
          <KpiDelta
            better="neutral"
            pct={delta}
            testId="spend-prior-delta"
            title={`vs ${windowRangeLabel(prior.since, prior.until)}`}
          />{' '}
          vs prior {windowDaysLabel(metrics)} ·{' '}
        </>
      ) : null}
      {spendSplitLabel(metrics)}
    </>
  );
}

/** A kind tile's line: its cost and target, then its cost's move against the prior window. */
function KindSub({
  metrics,
  kind,
}: {
  metrics: AccountPlatformMetrics;
  kind: KindAcrossPlatforms;
}) {
  const move = kindPriorMove(metrics, kind);
  return (
    <>
      {kindTileSub(metrics, kind)}
      {move ? (
        <>
          {' · '}
          <KpiDelta
            better="down"
            pct={move.pct}
            testId="cost-prior-delta"
            title={`prev. ${windowDaysLabel(metrics)} ${formatCurrency(move.priorCostPerResult, kind.currency)}`}
          />
        </>
      ) : null}
    </>
  );
}

export function AllPlatformsTiles({
  metrics,
  pendingCount,
  onOpenActions,
}: {
  metrics: AccountPlatformMetrics;
  /** The decisions tile counts the actions queue its Review button opens (the portfolio
   *  list's pending recommendations and budget moves), the one source for the count on this
   *  screen; the producer's `decisions_waiting` is not read here. */
  pendingCount: number;
  onOpenActions: () => void;
}) {
  const window = figureWindowOfMetrics(metrics);
  const currency = oneCurrency(metrics);
  // One spend row is one figure, whether or not the producer named its currency: the stamp
  // carries the raw spend the tile prints, and `none` when the code is unknown. Only several
  // currencies have no single total.
  const total =
    metrics.spend_by_currency.length === 1 ? (metrics.spend_by_currency[0]?.spend ?? null) : null;
  const kinds = rankedKinds(metrics).slice(0, MAX_KIND_TILES);
  const connected = connectedTotals(metrics).length;
  const showPlatforms = 3 + kinds.length < MIN_TILES;
  return (
    <KpiRow source="account-platform-metrics" testId="account-tiles">
      <KpiTile
        emphasis="hero"
        figure={figureProps('tiles.spend', total, currency, window)}
        label={`Spend · ${windowDaysLabel(metrics)}`}
        sub={<SpendSub metrics={metrics} />}
        testId="tile-spend"
        value={
          metrics.spend_by_currency.length > 1
            ? metrics.spend_by_currency
                .map((row) => formatCurrency(row.spend, row.currency))
                .join(' · ')
            : formatCurrency(total, currency)
        }
        variant="inline"
      />
      {kinds.map((kind) => (
        <KpiTile
          breakdown={kindPlatformSplit(kind)}
          figure={figureProps(`tiles.kind.${kind.kind}`, kind.results, null, window, 'count')}
          key={`${kind.kind}|${kind.currency}`}
          label={kindTileLabel(metrics, kind)}
          sub={<KindSub kind={kind} metrics={metrics} />}
          testId={`tile-kind-${kind.kind}`}
          value={formatResults(kind.results)}
          variant="inline"
        />
      ))}
      <KpiTile
        action={
          pendingCount > 0 ? (
            <button
              className="hit-area font-semibold text-primary-ink text-xs hover:underline"
              onClick={onOpenActions}
              type="button"
            >
              Review →
            </button>
          ) : null
        }
        emphasis={pendingCount > 0 ? 'decision' : undefined}
        figure={figureProps('tiles.decisions-waiting', pendingCount, null, 'none', 'count')}
        label="Decisions"
        sub={
          pendingCount > 0 ? 'waiting across your portfolios' : 'nothing waits for your decision'
        }
        testId="tile-decisions"
        value={String(pendingCount)}
        variant="inline"
      />
      <KpiTile
        figure={figureProps('tiles.on-autopilot', metrics.autopilot.on, null, 'none', 'count')}
        label="Autopilot"
        sub={
          metrics.autopilot.total === 0
            ? 'no active portfolio'
            : metrics.autopilot.on === metrics.autopilot.total
              ? 'all apply on their own'
              : `${metrics.autopilot.total - metrics.autopilot.on} recommend, do not apply`
        }
        testId="tile-autopilot"
        value={String(metrics.autopilot.on)}
        valueSuffix={`/${metrics.autopilot.total}`}
        variant="inline"
      />
      {showPlatforms ? (
        <KpiTile
          figure={figureProps('tiles.platforms', connected, null, 'none', 'count')}
          label="Platforms"
          sub={connected === 3 ? 'Meta, Google and TikTok read' : 'connect the rest in Settings'}
          testId="tile-platforms"
          value={`${connected} of 3`}
          variant="inline"
        />
      ) : null}
    </KpiRow>
  );
}

/** One platform's headline and tiles, from the same payload the "All" frame summed. */
export function PlatformMetricsSection({
  metrics,
  platform,
  liveBelow = false,
  onCreatePortfolio,
}: {
  metrics: AccountPlatformMetrics;
  platform: AdPlatform;
  /** The platform's own live read renders under this section: when the Optimizer has not read
   *  the platform, the section says that the figures below are that read. */
  liveBelow?: boolean;
  onCreatePortfolio?: () => void;
}) {
  const row = platformTotals(metrics, platform);
  if (!row?.connected) return null;
  const window = figureWindowOfMetrics(metrics);
  const spend = platformSpendFigure(row);
  const kinds = platformKinds(row).slice(0, MAX_KIND_TILES);
  const name = PLATFORM_NAMES[platform];
  const lead = kinds[0];
  if (row.spend == null && liveBelow) {
    return (
      <section
        className="space-y-1"
        data-source="account-platform-metrics"
        data-testid={`platform-metrics-${platform}`}
      >
        <PlatformReadingNote
          onCreatePortfolio={onCreatePortfolio}
          platform={platform}
          where="below"
        />
      </section>
    );
  }
  return (
    <section
      className="space-y-3"
      data-source="account-platform-metrics"
      data-testid={`platform-metrics-${platform}`}
    >
      <div className="space-y-1 px-1">
        <p
          className={`${typeScale.bodyLg} font-semibold leading-snug text-foreground`}
          data-testid="platform-headline"
        >
          {row.spend == null ? (
            `${name} is connected, but nothing has been read from it yet.`
          ) : (
            <>
              {name} spent{' '}
              <span
                className="tabular-nums"
                {...figureProps(`${platform}.spend`, spend, row.currency, window)}
              >
                {formatCurrency(spend, row.currency)}
              </span>{' '}
              in {windowDaysLabel(metrics)}
              {row.share_of_spend != null
                ? ` (${Math.round(row.share_of_spend * 100)}% of the account)`
                : ''}
              {lead && lead.cost_per_result != null
                ? `: ${formatResults(lead.results)} ${kindWords(lead.kind).many} at ${formatCurrency(lead.cost_per_result, row.currency)}.`
                : '.'}
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
          <PlatformChip platform={platform} />
          <span>{windowRangeLabel(metrics.window.since, metrics.window.until)}</span>
          <span aria-hidden="true">·</span>
          <span>{accountsReadLabel(row)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {row.coverage === 'portfolios'
              ? 'counts what its portfolios hold'
              : 'every campaign of the connected accounts'}
          </span>
          {row.spend != null && !row.currency ? (
            <>
              <span aria-hidden="true">·</span>
              <span>currency not reported</span>
            </>
          ) : null}
        </div>
      </div>
      {row.spend == null ? null : (
        <div
          className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6"
          data-testid={`platform-tiles-${platform}`}
        >
          <KpiTile
            figure={figureProps(`${platform}.tiles.spend`, spend, row.currency, window)}
            label={`Spend · ${windowDaysLabel(metrics)}`}
            sub={platformSpendSub(row)}
            testId="platform-tile-spend"
            value={spend == null ? '—' : formatCurrency(spend, row.currency)}
          />
          {kinds.map((kind) => (
            <KpiTile
              figure={figureProps(
                `${platform}.tiles.kind.${kind.kind}`,
                kind.results,
                null,
                window,
                'count',
              )}
              key={kind.kind}
              label={capitalise(kindWords(kind.kind).many)}
              sub={platformKindSub(kind, row.currency)}
              testId={`platform-tile-kind-${kind.kind}`}
              value={formatResults(kind.results)}
            />
          ))}
          {row.unclassified_spend != null && row.unclassified_spend > 0 ? (
            <KpiTile
              figure={figureProps(
                `${platform}.tiles.unclassified`,
                row.unclassified_spend,
                row.currency,
                window,
              )}
              label="No result kind"
              sub="spend on campaigns with no declared result"
              testId="platform-tile-unclassified"
              value={formatCurrency(row.unclassified_spend, row.currency)}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
