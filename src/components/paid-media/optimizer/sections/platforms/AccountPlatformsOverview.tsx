import { useLocale, useTranslations } from 'next-intl';
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  return (
    <HeadlineSentence
      segments={allPlatformsHeadlineSegments(metrics, pendingCount, uiText, uiLocale)}
      source="account-platform-metrics"
    />
  );
}

/** The sub-line's facts: the producer's window, the top-spend fact, and what was left out. */
export function AllPlatformsSubline({ metrics }: { metrics: AccountPlatformMetrics }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const facts = [
    windowRangeLabel(metrics.window.since, metrics.window.until, uiLocale),
    topSpendLabel(metrics, uiText),
    uiText('platformAttribution'),
    coverageNote(metrics, uiText, uiLocale),
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');

  const delta = accountSpendDeltaPct(metrics);
  const prior = metrics.prior_window;
  return (
    <>
      {delta != null && prior ? (
        <>
          {uiText.rich('sentence_555db3284338', {
            v0: () => (
              <KpiDelta
                better="neutral"
                pct={delta}
                testId="spend-prior-delta"
                title={uiText('template_c67c180645e5', {
                  v0: windowRangeLabel(prior.since, prior.until, uiLocale),
                })}
              />
            ),
            v1: windowDaysLabel(metrics, uiText),
          })}{' '}
        </>
      ) : null}
      {spendSplitLabel(metrics, uiText, uiLocale)}
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
  const uiText = useTranslations('scale');

  const uiLocale = useLocale();
  const move = kindPriorMove(metrics, kind);
  return (
    <>
      {kindTileSub(metrics, kind, uiText, uiLocale)}
      {move ? (
        <>
          {' · '}
          <KpiDelta
            better="down"
            pct={move.pct}
            testId="cost-prior-delta"
            title={uiText('template_3f413026d936', {
              v0: windowDaysLabel(metrics, uiText),
              v1: formatCurrency(move.priorCostPerResult, kind.currency, uiLocale),
            })}
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
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
        label={uiText('template_d02860d6eac6', { v0: windowDaysLabel(metrics, uiText) })}
        sub={<SpendSub metrics={metrics} />}
        testId="tile-spend"
        value={
          metrics.spend_by_currency.length > 1
            ? metrics.spend_by_currency
                .map((row) => formatCurrency(row.spend, row.currency, uiLocale))
                .join(' · ')
            : formatCurrency(total, currency, uiLocale)
        }
        variant="inline"
      />
      {kinds.map((kind) => (
        <KpiTile
          breakdown={kindPlatformSplit(kind, uiLocale)}
          figure={figureProps(`tiles.kind.${kind.kind}`, kind.results, null, window, 'count')}
          key={`${kind.kind}|${kind.currency}`}
          label={kindTileLabel(metrics, kind, uiText)}
          sub={<KindSub kind={kind} metrics={metrics} />}
          testId={`tile-kind-${kind.kind}`}
          value={formatResults(kind.results, uiLocale)}
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
              {uiText('review_ab7681e')}
            </button>
          ) : null
        }
        emphasis={pendingCount > 0 ? 'decision' : undefined}
        figure={figureProps('tiles.decisions-waiting', pendingCount, null, 'none', 'count')}
        label={uiText('decisions_cfa6a08')}
        sub={
          pendingCount > 0
            ? uiText('platformWaitingPortfolios')
            : uiText('optimizer_nothingWaiting')
        }
        testId="tile-decisions"
        value={formatResults(pendingCount, uiLocale)}
        variant="inline"
      />
      <KpiTile
        figure={figureProps('tiles.on-autopilot', metrics.autopilot.on, null, 'none', 'count')}
        label={uiText('autopilot_0c62cfc')}
        sub={
          metrics.autopilot.total === 0
            ? uiText('platformNoActivePortfolio')
            : metrics.autopilot.on === metrics.autopilot.total
              ? uiText('platformAllAutopilot')
              : uiText('helper_ad155f8a02cf', {
                  v0: metrics.autopilot.total - metrics.autopilot.on,
                })
        }
        testId="tile-autopilot"
        value={formatResults(metrics.autopilot.on, uiLocale)}
        valueSuffix={`/${formatResults(metrics.autopilot.total, uiLocale)}`}
        variant="inline"
      />
      {showPlatforms ? (
        <KpiTile
          figure={figureProps('tiles.platforms', connected, null, 'none', 'count')}
          label={uiText('platforms_ab9bd75')}
          sub={connected === 3 ? uiText('platformAllRead') : uiText('platformConnectOthers')}
          testId="tile-platforms"
          value={uiText('platformReadFraction', { read: connected, total: 3 })}
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
}: {
  metrics: AccountPlatformMetrics;
  platform: AdPlatform;
  /** The platform's own live read renders under this section: when the Optimizer has not read
   *  the platform, the section says that the figures below are that read. */
  liveBelow?: boolean;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
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
        <PlatformReadingNote platform={platform} where="below" />
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
            uiText('template_2e4f17f8d23b', { v0: name })
          ) : (
            <>
              {uiText.rich('sentence_cfa67d38df05', {
                name: name,
                spend: () => (
                  <span
                    className="tabular-nums"
                    {...figureProps(`${platform}.spend`, spend, row.currency, window)}
                  >
                    {formatCurrency(spend, row.currency, uiLocale)}
                  </span>
                ),
                window: windowDaysLabel(metrics, uiText),
                hasShare: row.share_of_spend != null ? 'yes' : 'no',
                share: Math.round((row.share_of_spend ?? 0) * 100),
                hasLead: lead && lead.cost_per_result != null ? 'yes' : 'no',
                results: lead ? formatResults(lead.results, uiLocale) : '',
                kind: lead ? kindWords(lead.kind, uiText).many : '',
                cost:
                  lead && lead.cost_per_result != null
                    ? formatCurrency(lead.cost_per_result, row.currency, uiLocale)
                    : '',
              })}
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
          <PlatformChip platform={platform} />
          <span>{windowRangeLabel(metrics.window.since, metrics.window.until, uiLocale)}</span>
          <span aria-hidden="true">·</span>
          <span>{accountsReadLabel(row, uiText)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {row.coverage === 'portfolios'
              ? uiText('counts_what_its_portfolios_hold_5af164f')
              : uiText('every_campaign_of_the_connected_accounts_4eab65b')}
          </span>
          {row.spend != null && !row.currency ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{uiText('currency_not_reported_e2e9e63')}</span>
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
            label={uiText('template_d02860d6eac6', { v0: windowDaysLabel(metrics, uiText) })}
            sub={platformSpendSub(row, uiText, uiLocale)}
            testId="platform-tile-spend"
            value={spend == null ? '—' : formatCurrency(spend, row.currency, uiLocale)}
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
              label={capitalise(kindWords(kind.kind, uiText).many)}
              sub={platformKindSub(kind, row.currency, uiText, uiLocale)}
              testId={`platform-tile-kind-${kind.kind}`}
              value={formatResults(kind.results, uiLocale)}
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
              label={uiText('no_result_kind_14c10ae')}
              sub={uiText('platformUnclassifiedDeclared')}
              testId="platform-tile-unclassified"
              value={formatCurrency(row.unclassified_spend, row.currency, uiLocale)}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
