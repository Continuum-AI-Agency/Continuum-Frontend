'use client';

// Creative DNA, on the asset itself: where this creative ran, what it earned, and
// which version won.
//
// Two rules shape every pixel below, because the Library is a system of record and
// a pretty lie here is worse than no panel at all:
//
//   1. A null was never measured — it renders as an em dash, never as 0 (see
//      lib/library/performance.ts).
//   2. A trust flag sits NEXT TO the number it qualifies, never in a footnote. A
//      visual-embedding link is a GUESS: the figures behind one may belong to a
//      different creative, and that must be visible without hovering anything.
//
// Top-funnel and bottom-funnel run side by side on purpose — "2,700 clicks, zero
// conversions" is the sentence this panel exists to let you read at a glance.

import type {
  AssetDeployment,
  AssetPerformance,
  AssetUsage,
  AssetVersionRollup,
  DeploymentAd,
  DeploymentLinkMethod,
  DeploymentPost,
  DeploymentTrustFlag,
  PaidMetricWindow,
} from '@continuum/contracts';
import {
  isInferredLinkMethod,
  isUnderperformingRanking,
  META_REPORTED_ATTRIBUTION_NOTE,
} from '@continuum/contracts';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useUiErrorMessage } from '@/i18n/errors';
import {
  type AssetPerformanceResponse,
  fetchAssetPerformance,
  formatCount,
  formatMoney,
  formatMultiple,
  formatRate,
  LINK_METHOD_LABEL,
  leadingRollup,
  PERFORMANCE_WINDOWS,
  TRUST_FLAG_LABEL,
  TRUST_FLAG_TITLE,
  versionLabel,
  WINDOW_LABEL,
} from '@/lib/library/performance';
import { usePerformanceDisplay } from '@/lib/library/usePerformanceDisplay';
import { cn } from '@/lib/utils';

const VERDICT_STYLE: Record<NonNullable<DeploymentAd['verdict']>, string> = {
  kill: 'bg-destructive/10 text-destructive',
  scale: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  iterate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  watch: 'bg-muted text-muted-foreground',
};

type MetricEntry = { label: string; value: string };

function VerdictChip({ verdict }: { verdict: NonNullable<DeploymentAd['verdict']> }) {
  const { VERDICT_LABEL } = usePerformanceDisplay();
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide',
        VERDICT_STYLE[verdict],
      )}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function TrustBadges({ flags }: { flags: readonly DeploymentTrustFlag[] }) {
  const { TRUST_FLAG_LABEL, TRUST_FLAG_TITLE } = usePerformanceDisplay();

  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          title={TRUST_FLAG_TITLE[flag]}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-3xs',
            // An inferred link is the one flag that says the numbers may not be
            // this creative's at all, so it is the loudest thing on the card.
            flag === 'inferred_link'
              ? 'bg-destructive/10 font-medium text-destructive'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
          )}
        >
          {flag === 'inferred_link' && <TriangleAlert className="size-2.5" />}
          {TRUST_FLAG_LABEL[flag]}
        </span>
      ))}
    </span>
  );
}

// How we know this creative ran here. A guess must never look like an observation.
function LinkBadge({
  linkMethod,
  confidence,
}: {
  linkMethod: DeploymentLinkMethod;
  confidence: number;
}) {
  const { TRUST_FLAG_TITLE, LINK_METHOD_LABEL } = usePerformanceDisplay();

  const translateUi = useUiTranslations('library');

  const inferred = isInferredLinkMethod(linkMethod);
  return (
    <span
      title={
        inferred
          ? TRUST_FLAG_TITLE.inferred_link
          : translateUi('this_link_was_observed_not_guessed__e57620b3')
      }
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 py-0.5 text-3xs',
        inferred
          ? 'bg-destructive/10 font-medium text-destructive'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {inferred && <TriangleAlert className="size-2.5" />}
      {LINK_METHOD_LABEL[linkMethod]}
      {inferred && translateUi('performanceConfidence', { confidence })}
    </span>
  );
}

function MetricColumn({ title, entries }: { title: string; entries: readonly MetricEntry[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-3xs uppercase tracking-wide text-muted-foreground/70">{title}</p>
      <dl className="space-y-0.5">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-baseline justify-between gap-2">
            <dt className="truncate text-2xs text-muted-foreground">{entry.label}</dt>
            <dd className="shrink-0 text-2xs tabular-nums text-foreground">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// The two halves of performance, side by side — never one without the other.
function FunnelSplit({
  top,
  bottom,
}: {
  top: readonly MetricEntry[];
  bottom: readonly MetricEntry[];
}) {
  const translateUi = useUiTranslations('library');

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      <MetricColumn title={translateUi('top_of_funnel_e105db01')} entries={top} />
      <MetricColumn title={translateUi('bottom_of_funnel_67beb068')} entries={bottom} />
    </div>
  );
}

function adFunnel(
  ad: DeploymentAd,
  display: ReturnType<typeof usePerformanceDisplay>,
): { top: MetricEntry[]; bottom: MetricEntry[] } {
  const { formatCount, formatMoney, formatRate, formatMultiple } = display;
  const metrics = ad.metrics;
  return {
    top: [
      { label: display.t('impressions_c6310e90'), value: formatCount(metrics.impressions) },
      // Both click numbers, always together. Meta's `clicks` counts likes, comments
      // and shares, so showing only it (and only its CPC) flatters an ad nobody
      // actually visited from — on a live account $3.58/click vs $6.10/visit.
      { label: display.t('clicks_all_54555b1a'), value: formatCount(metrics.clicks) },
      { label: display.t('link_clicks_87128bf9'), value: formatCount(metrics.linkClicks) },
      { label: display.t('cpc_all_35ed1ed4'), value: formatMoney(metrics.cpc) },
      { label: display.t('cost_visit_abf569e3'), value: formatMoney(metrics.costPerLinkClick) },
      { label: display.t('link_ctr_87c51753'), value: formatRate(metrics.linkCtr) },
      { label: display.t('cpm_13269d41'), value: formatMoney(metrics.cpm) },
      { label: display.t('frequency_16b6668d'), value: formatMultiple(metrics.frequency) },
      { label: display.t('hook_536ff505'), value: formatRate(metrics.hookRate) },
      { label: display.t('hold_8e685d54'), value: formatRate(metrics.holdRate) },
    ],
    bottom: [
      { label: display.t('purchases_a0718ef8'), value: formatCount(metrics.purchases) },
      { label: display.t('leads_2f10a267'), value: formatCount(metrics.leads) },
      { label: display.t('cost_purchase_f3110ca2'), value: formatMoney(metrics.costPerPurchase) },
      { label: display.t('cost_lead_148ac999'), value: formatMoney(metrics.costPerLead) },
      { label: display.t('roas_b81bd97d'), value: formatMultiple(metrics.roas) },
      { label: display.t('completion_557fe004'), value: formatRate(metrics.completionRate) },
    ],
  };
}

const RANKING_KEYS = {
  quality: 'performanceQuality',
  engagement: 'performanceEngagement',
  conversion: 'performanceConversion',
} as const;
const RANKING_VALUES = {
  ABOVE_AVERAGE: 'performanceRankingAbove',
  AVERAGE: 'performanceRankingAverage',
  BELOW_AVERAGE: 'performanceRankingBelow',
  BELOW_AVERAGE_35: 'performanceRankingBottom35',
  BELOW_AVERAGE_20: 'performanceRankingBottom20',
  BELOW_AVERAGE_10: 'performanceRankingBottom10',
} as const;

/**
 * Meta's own grade for this creative against everything else bidding for the same
 * impression. It is the one judgement in the panel that is not ours, and it can
 * disagree with our verdict — an ad can be cheap per lead AND a weak creative in the
 * auction. Showing it is how that tension becomes visible instead of invisible.
 */
function MetaRankings({ metrics }: { metrics: DeploymentAd['metrics'] }) {
  const translateUi = useUiTranslations('library');

  const entries = [
    ['quality', metrics.qualityRanking],
    ['engagement', metrics.engagementRateRanking],
    ['conversion', metrics.conversionRateRanking],
  ] as const;
  const present = entries.filter(([, value]) => typeof value === 'string' && value.length > 0);
  if (present.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-3xs text-muted-foreground">
        {translateUi('meta_ranks_this_creative_5c732ea6')}
      </span>
      {present.map(([key, value]) => {
        const weak = isUnderperformingRanking(value);
        const ranking =
          value && Object.hasOwn(RANKING_VALUES, value)
            ? translateUi(RANKING_VALUES[value as keyof typeof RANKING_VALUES])
            : String(value).replace(/_/g, ' ').toLowerCase();
        return (
          <span
            key={key}
            className={cn(
              'rounded px-1 py-0.5 text-3xs tabular-nums',
              weak ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
            )}
            title={weak ? translateUi('performanceRankingBelowTitle', { ranking }) : ranking}
          >
            {translateUi(RANKING_KEYS[key])} {ranking}
          </span>
        );
      })}
    </div>
  );
}

function VerdictMix({ mix }: { mix: Record<string, number> }) {
  const translateUi = useUiTranslations('library');
  const { VERDICT_LABEL } = usePerformanceDisplay();
  const entries = Object.entries(mix).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([verdict, count]) => (
        <span
          key={verdict}
          className={cn(
            'rounded-full px-1.5 py-0.5 text-3xs',
            VERDICT_STYLE[verdict as NonNullable<DeploymentAd['verdict']>] ??
              'bg-muted text-muted-foreground',
          )}
        >
          {translateUi('performanceVerdictCount', {
            verdict: Object.hasOwn(VERDICT_LABEL, verdict)
              ? VERDICT_LABEL[verdict as keyof typeof VERDICT_LABEL]
              : verdict,
            count,
          })}
        </span>
      ))}
    </span>
  );
}

function VersionRollupCard({ rollup, leading }: { rollup: AssetVersionRollup; leading: boolean }) {
  const { formatCount, formatMoney, formatRate, formatMultiple, versionLabel } =
    usePerformanceDisplay();

  const translateUi = useUiTranslations('library');

  const surfaces = [
    rollup.adCount > 0 ? translateUi('performanceAdCount', { count: rollup.adCount }) : null,
    rollup.postCount > 0 ? translateUi('performancePostCount', { count: rollup.postCount }) : null,
  ].filter(Boolean);

  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-medium text-foreground">
          {versionLabel(rollup.versionNumber)}
        </span>
        {leading && (
          <span
            title={translateUi('highest_roas_of_the_versions_we_cou_68df2b1e')}
            className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-3xs font-medium text-emerald-600 dark:text-emerald-400"
          >
            {' '}
            {translateUi('leading_30adc606')}{' '}
          </span>
        )}
        <span className="text-2xs text-muted-foreground">{surfaces.join(' · ')}</span>
        <span className="ml-auto text-2xs tabular-nums text-muted-foreground">
          {formatMoney(rollup.spend)} {translateUi('spent_2705d83f')}{' '}
        </span>
      </div>

      <div className="mb-1.5">
        <TrustBadges flags={rollup.trustFlags} />
      </div>

      <FunnelSplit
        top={[
          { label: translateUi('impressions_c6310e90'), value: formatCount(rollup.impressions) },
          { label: translateUi('clicks_921fc980'), value: formatCount(rollup.clicks) },
          { label: translateUi('ctr_07fce34d'), value: formatRate(rollup.ctr) },
          { label: translateUi('organic_reach_b9faa630'), value: formatCount(rollup.organicReach) },
          {
            label: translateUi('interactions_9089e4b7'),
            value: formatCount(rollup.organicInteractions),
          },
        ]}
        bottom={[
          { label: translateUi('purchases_a0718ef8'), value: formatCount(rollup.purchases) },
          { label: translateUi('leads_2f10a267'), value: formatCount(rollup.leads) },
          {
            label: translateUi('cost_purchase_f3110ca2'),
            value: formatMoney(rollup.costPerPurchase),
          },
          { label: translateUi('cost_lead_148ac999'), value: formatMoney(rollup.costPerLead) },
          { label: translateUi('roas_b81bd97d'), value: formatMultiple(rollup.roas) },
        ]}
      />

      <div className="mt-1.5">
        <VerdictMix mix={rollup.verdictMix} />
      </div>
    </div>
  );
}

function AdDeploymentCard({ deployment, ad }: { deployment: AssetDeployment; ad: DeploymentAd }) {
  const { formatMoney, versionLabel } = usePerformanceDisplay();

  const translateUi = useUiTranslations('library');

  const performanceDisplay = usePerformanceDisplay();
  const funnel = adFunnel(ad, performanceDisplay);
  const inferred = isInferredLinkMethod(deployment.linkMethod);

  return (
    <li
      className={cn(
        'rounded-md border p-2.5',
        // A matched-by-similarity ad must not read like an observed one.
        inferred ? 'border-destructive/40 bg-destructive/5' : 'border-border',
      )}
    >
      <div className="mb-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{ad.adName ?? ad.adId}</p>
          <p className="truncate text-2xs text-muted-foreground">
            {[ad.campaignName, ad.adsetName].filter(Boolean).join(' · ') ||
              translateUi('meta_ad_a5d0436f')}
          </p>
        </div>
        {ad.verdict && <VerdictChip verdict={ad.verdict} />}
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded bg-muted px-1 py-0.5 text-3xs text-muted-foreground">
          {versionLabel(deployment.versionNumber)}
        </span>
        <LinkBadge linkMethod={deployment.linkMethod} confidence={deployment.confidence} />
        <span className="ml-auto text-2xs tabular-nums text-muted-foreground">
          {formatMoney(ad.metrics.spend)} {translateUi('spent_2705d83f')}{' '}
        </span>
      </div>

      <FunnelSplit top={funnel.top} bottom={funnel.bottom} />

      <MetaRankings metrics={ad.metrics} />

      {ad.virality || ad.outcome || ad.attributionSetting ? (
        <div className="mt-1.5 flex flex-wrap gap-1 text-3xs text-muted-foreground">
          {ad.virality ? (
            <span className="rounded bg-muted px-1 py-0.5">
              {' '}
              {translateUi('virality_4df0f609')} {ad.virality.predicted_overall} ·{' '}
              {ad.virality.grade}
              {ad.virality.prediction_only
                ? translateUi('prediction_56e4978e')
                : translateUi('observed_7a22a63f')}
            </span>
          ) : null}
          {ad.outcome ? (
            <span className="rounded bg-muted px-1 py-0.5">
              {ad.outcome.decision_kind.replaceAll('_', ' ')} ·{' '}
              {ad.outcome.result ??
                translateUi('value0_7_delivery_days_35ea0a68', {
                  value0: String(ad.outcome.delivery_days),
                })}
            </span>
          ) : null}
          {ad.attributionSetting ? (
            <span className="rounded bg-muted px-1 py-0.5">{ad.attributionSetting}</span>
          ) : null}
        </div>
      ) : null}

      {ad.verdictReason && (
        <p className="mt-1.5 text-2xs leading-relaxed text-muted-foreground">{ad.verdictReason}</p>
      )}
    </li>
  );
}

function PostDeploymentCard({
  deployment,
  post,
}: {
  deployment: AssetDeployment;
  post: DeploymentPost;
}) {
  const { formatCount, formatRate, versionLabel } = usePerformanceDisplay();

  const displayLocale = useUiLocale();

  const translateUi = useUiTranslations('library');

  const metrics = post.metrics;
  const inferred = isInferredLinkMethod(deployment.linkMethod);

  return (
    <li
      className={cn(
        'rounded-md border p-2.5',
        inferred ? 'border-destructive/40 bg-destructive/5' : 'border-border',
      )}
    >
      <div className="mb-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {post.platform}
            {post.postType ? ` · ${post.postType.toLowerCase()}` : ''}
          </p>
          <p className="truncate text-2xs text-muted-foreground">
            {post.publishedAt
              ? new Date(post.publishedAt).toLocaleDateString(displayLocale, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : translateUi('published_post_59823c97')}
          </p>
        </div>
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
          >
            {' '}
            {translateUi('view_post_fe9715bc')} <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded bg-muted px-1 py-0.5 text-3xs text-muted-foreground">
          {versionLabel(deployment.versionNumber)}
        </span>
        <LinkBadge linkMethod={deployment.linkMethod} confidence={deployment.confidence} />
      </div>

      <FunnelSplit
        top={[
          { label: translateUi('reach_2068b81b'), value: formatCount(metrics.reach) },
          { label: translateUi('views_69c40459'), value: formatCount(metrics.views) },
          { label: translateUi('engagement_ea68771a'), value: formatRate(metrics.engagementRate) },
        ]}
        bottom={[
          { label: translateUi('likes_cca0662f'), value: formatCount(metrics.likes) },
          { label: translateUi('comments_355f79f2'), value: formatCount(metrics.comments) },
          { label: translateUi('shares_d4ea333d'), value: formatCount(metrics.shares) },
          { label: translateUi('saves_98971626'), value: formatCount(metrics.saved) },
        ]}
      />
    </li>
  );
}

function DeploymentCard({ deployment }: { deployment: AssetDeployment }) {
  const translateUi = useUiTranslations('library');

  if (deployment.surface === 'meta_ad' && deployment.ad) {
    return <AdDeploymentCard deployment={deployment} ad={deployment.ad} />;
  }
  if (deployment.surface === 'organic_post' && deployment.post) {
    return <PostDeploymentCard deployment={deployment} post={deployment.post} />;
  }
  // The ledger says it ran here; the surface store has no row for it yet.
  return (
    <li className="rounded-md border border-border p-2.5 text-2xs text-muted-foreground">
      {' '}
      {translateUi('deployed_to_06de7cfe')}{' '}
      {deployment.surface === 'meta_ad'
        ? translateUi('a_meta_ad_f194d272')
        : translateUi('a_post_179c02fe')}{' '}
      {translateUi('we_can_no_longer_read_98dc4f00')}{' '}
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {title}
      </h3>
      {children}
    </section>
  );
}

function WindowSwitcher({
  window,
  onChange,
}: {
  window: PaidMetricWindow;
  onChange: (next: PaidMetricWindow) => void;
}) {
  const { WINDOW_LABEL } = usePerformanceDisplay();

  return (
    <div className="flex items-center gap-1">
      {PERFORMANCE_WINDOWS.map((candidate) => (
        <button
          key={candidate}
          type="button"
          onClick={() => onChange(candidate)}
          aria-pressed={candidate === window}
          className={cn(
            'rounded-md px-1.5 py-0.5 text-2xs transition-colors',
            candidate === window
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {WINDOW_LABEL[candidate]}
        </button>
      ))}
    </div>
  );
}

function UsedIn({ usage }: { usage: AssetUsage }) {
  const translateUi = useUiTranslations('library');

  if (usage.derivedAssets.length === 0) return null;
  return (
    <Section title={translateUi('used_in_a02dadd1')}>
      <ul className="space-y-1">
        {usage.derivedAssets.map((derived) => (
          <li
            key={`${derived.assetId}:${derived.derivedVersionId ?? 'legacy'}`}
            className="flex items-baseline justify-between gap-2 rounded-md border border-border px-2 py-1.5"
            style={{ marginLeft: `${Math.min(derived.depth - 1, 4) * 8}px` }}
          >
            <span className="min-w-0">
              <span className="block truncate text-2xs text-foreground">
                {derived.title ?? derived.fileName}
              </span>
              <span className="block truncate text-3xs text-muted-foreground">
                {derived.depth > 1
                  ? translateUi('value0_hops_35e6fa4e', { value0: String(derived.depth) })
                  : ''}
                {derived.operation?.replaceAll('_', ' ') ?? translateUi('legacy_relation_ea9906e4')}
              </span>
            </span>
            <span className="shrink-0 text-3xs uppercase tracking-wide text-muted-foreground">
              {derived.kind}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 p-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

export type PerformanceViewProps = {
  performance: AssetPerformance | null;
  usage: AssetUsage | null;
  loading: boolean;
  error: string | null;
  window: PaidMetricWindow;
  onWindowChange: (next: PaidMetricWindow) => void;
};

// Presentation only — every display rule this feature guarantees lives here, so a
// test can render it against fixtures without touching the network.
export function PerformanceView({
  performance,
  usage,
  loading,
  error,
  window,
  onWindowChange,
}: PerformanceViewProps) {
  const translateUi = useUiTranslations('library');

  const deployments = performance?.deployments ?? [];
  const rollups = performance?.versionRollups ?? [];
  const leader = leadingRollup(rollups);
  const hasPaid = deployments.some((deployment) => deployment.surface === 'meta_ad');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground/70">
          {' '}
          {translateUi('performance_442aded8')}{' '}
        </span>
        <WindowSwitcher window={window} onChange={onWindowChange} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <PanelSkeleton />
        ) : error ? (
          <p className="px-3 py-6 text-center text-xs text-destructive">{error}</p>
        ) : deployments.length === 0 ? (
          <div className="space-y-4 p-3">
            <div className="px-1 py-6 text-center">
              <p className="text-xs text-foreground">
                {translateUi('this_creative_hasn_t_run_anywhere_y_d066a117')}
              </p>
              <p className="mt-1 text-2xs text-muted-foreground">
                {' '}
                {translateUi('nothing_links_it_to_a_meta_ad_or_a__92013f92')}{' '}
              </p>
            </div>
            {usage && <UsedIn usage={usage} />}
          </div>
        ) : (
          <div className="space-y-4 p-3">
            {rollups.length > 0 && (
              <Section title={translateUi('by_version_8685173f')}>
                <div className="space-y-2">
                  {rollups.map((rollup) => (
                    <VersionRollupCard
                      key={rollup.versionNumber ?? 'unknown'}
                      rollup={rollup}
                      leading={leader !== null && leader.versionNumber === rollup.versionNumber}
                    />
                  ))}
                </div>
              </Section>
            )}

            <Section
              title={translateUi('where_it_ran_value0_f1ba81ea', {
                value0: String(deployments.length),
              })}
            >
              <ul className="space-y-2">
                {deployments.map((deployment) => (
                  <DeploymentCard key={deployment.deploymentId} deployment={deployment} />
                ))}
              </ul>
            </Section>

            {usage && <UsedIn usage={usage} />}

            {hasPaid && (
              <p className="border-t border-border pt-2 text-3xs leading-relaxed text-muted-foreground/80">
                {META_REPORTED_ATTRIBUTION_NOTE}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export type PerformancePanelProps = {
  brandId: string;
  assetId: string;
};

export function PerformancePanel({ brandId, assetId }: PerformancePanelProps) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

  const [window, setWindow] = useState<PaidMetricWindow>('d30');
  const [data, setData] = useState<AssetPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAssetPerformance({ brandId, assetId, window })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(uiErrorText(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandId, assetId, window, translateUi, uiErrorText]);

  const changeWindow = useCallback((next: PaidMetricWindow) => setWindow(next), []);

  return (
    <PerformanceView
      performance={data?.performance ?? null}
      usage={data?.usage ?? null}
      loading={loading}
      error={error}
      window={window}
      onWindowChange={changeWindow}
    />
  );
}
