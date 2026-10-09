// The MP1 frame's headline and tiles, read from public.optimizer_get_account_platform_metrics
// (frontend.html §2). "All" leads with the account: one sentence, then spend with each
// platform's share, one tile per result kind naming the platform that buys it cheapest,
// decisions waiting and autopilot. A platform tab leads with that platform from the same
// payload, so a figure on a tab is always one the "All" frame summed.
//
// Nothing here adds two currencies or two result kinds together; the model hands over the
// rows already split, and every figure node carries its provenance for the digit gate.

import type { AccountPlatformMetrics } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { KpiRow, KpiTile } from '../../components/KpiTile';
import { figureProps, formatCurrency } from '../../format';
import * as typeScale from '../../typeScale';
import {
  accountsReadLabel,
  capitalise,
  connectedTotals,
  coverageNote,
  figureWindowOfMetrics,
  formatResults,
  headlineKindClauses,
  kindPlatformSplit,
  kindTileLabel,
  kindTileSub,
  kindWords,
  MAX_KIND_TILES,
  MIN_TILES,
  oneCurrency,
  platformCountLabel,
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

function decisionsSentence(count: number): string {
  if (count === 0) return 'No decisions waiting.';
  return count === 1 ? '1 decision waiting.' : `${count} decisions waiting.`;
}

export function AllPlatformsHeadline({ metrics }: { metrics: AccountPlatformMetrics }) {
  const window = figureWindowOfMetrics(metrics);
  const clauses = headlineKindClauses(metrics);
  return (
    <p
      className={`${typeScale.headline} max-w-[62ch] text-foreground`}
      data-source="account-platform-metrics"
      data-testid="overview-headline"
    >
      The account spent{' '}
      {metrics.spend_by_currency.map((row, index) => (
        <span key={row.currency ?? 'none'}>
          {index > 0 ? (index === metrics.spend_by_currency.length - 1 ? ' and ' : ', ') : ''}
          <span
            className="tabular-nums"
            {...figureProps(
              `overview.spend.${row.currency ?? 'none'}`,
              row.spend,
              row.currency,
              window,
            )}
          >
            {formatCurrency(row.spend, row.currency)}
          </span>
        </span>
      ))}{' '}
      in {windowDaysLabel(metrics)} {platformCountLabel(metrics)}
      {clauses.length > 0 ? ': ' : '. '}
      {clauses.map((clause, index) => (
        <span key={`${clause.kind.kind}|${clause.kind.currency}`}>
          {index > 0 ? (index === clauses.length - 1 ? ' and ' : ', ') : ''}
          {clause.kind.cost_per_result == null ? (
            <>
              <span
                className="tabular-nums"
                {...figureProps(
                  `overview.kind.${clause.kind.kind}.results`,
                  clause.kind.results,
                  null,
                  window,
                  'count',
                )}
              >
                {formatResults(clause.kind.results)}
              </span>{' '}
              {clause.words.many}
            </>
          ) : (
            <>
              {clause.words.many} at{' '}
              <span
                className="tabular-nums"
                {...figureProps(
                  `overview.kind.${clause.kind.kind}.cost`,
                  clause.kind.cost_per_result,
                  clause.kind.currency,
                  window,
                )}
              >
                {formatCurrency(clause.kind.cost_per_result, clause.kind.currency)}
              </span>
              {clause.cheapest ? (
                <>
                  , cheapest on {PLATFORM_NAMES[clause.cheapest.platform]} at{' '}
                  <span
                    className="tabular-nums"
                    {...figureProps(
                      `overview.kind.${clause.kind.kind}.cheapest`,
                      clause.cheapest.cost_per_result,
                      clause.cheapest.currency,
                      window,
                    )}
                  >
                    {formatCurrency(clause.cheapest.cost_per_result, clause.cheapest.currency)}
                  </span>
                </>
              ) : clause.only ? (
                ` on ${PLATFORM_NAMES[clause.only]}`
              ) : null}
            </>
          )}
        </span>
      ))}
      {clauses.length > 0 ? '. ' : ''}
      <span
        className={cn('tabular-nums', metrics.decisions_waiting > 0 && 'text-primary')}
        data-testid="overview-decisions"
      >
        {decisionsSentence(metrics.decisions_waiting)}
      </span>
    </p>
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

export function AllPlatformsTiles({
  metrics,
  onOpenActions,
}: {
  metrics: AccountPlatformMetrics;
  onOpenActions: () => void;
}) {
  const window = figureWindowOfMetrics(metrics);
  const currency = oneCurrency(metrics);
  const total = currency != null ? (metrics.spend_by_currency[0]?.spend ?? null) : null;
  const kinds = rankedKinds(metrics).slice(0, MAX_KIND_TILES);
  const connected = connectedTotals(metrics).length;
  const showPlatforms = 3 + kinds.length < MIN_TILES;
  return (
    <KpiRow source="account-platform-metrics" testId="account-tiles">
      <KpiTile
        emphasis="hero"
        figure={figureProps('tiles.spend', total, currency, window)}
        label={`Spend · ${windowDaysLabel(metrics)}`}
        sub={spendSplitLabel(metrics)}
        testId="tile-spend"
        value={
          metrics.spend_by_currency.length > 1
            ? metrics.spend_by_currency
                .map((row) => formatCurrency(row.spend, row.currency))
                .join(' · ')
            : formatCurrency(total ?? metrics.spend_by_currency[0]?.spend ?? 0, currency)
        }
        variant="inline"
      />
      {kinds.map((kind) => (
        <KpiTile
          breakdown={kindPlatformSplit(kind)}
          figure={figureProps(`tiles.kind.${kind.kind}`, kind.results, null, window, 'count')}
          key={`${kind.kind}|${kind.currency}`}
          label={kindTileLabel(metrics, kind)}
          sub={kindTileSub(metrics, kind)}
          testId={`tile-kind-${kind.kind}`}
          value={formatResults(kind.results)}
          variant="inline"
        />
      ))}
      <KpiTile
        action={
          metrics.decisions_waiting > 0 ? (
            <button
              className="font-semibold text-primary text-xs hover:underline"
              onClick={onOpenActions}
              type="button"
            >
              Review →
            </button>
          ) : null
        }
        emphasis={metrics.decisions_waiting > 0 ? 'decision' : undefined}
        figure={figureProps(
          'tiles.decisions-waiting',
          metrics.decisions_waiting,
          null,
          'none',
          'count',
        )}
        label="Decisions"
        sub={
          metrics.decisions_waiting > 0
            ? 'waiting across your portfolios'
            : 'nothing waits for your decision'
        }
        testId="tile-decisions"
        value={String(metrics.decisions_waiting)}
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
        value={
          <>
            {metrics.autopilot.on}
            <span className="text-muted-foreground/60">/{metrics.autopilot.total}</span>
          </>
        }
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
