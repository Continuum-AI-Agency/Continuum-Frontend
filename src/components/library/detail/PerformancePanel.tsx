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
import { useCallback, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
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
import { cn } from '@/lib/utils';

const VERDICT_STYLE: Record<NonNullable<DeploymentAd['verdict']>, string> = {
  kill: 'bg-destructive/10 text-destructive',
  scale: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  iterate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  watch: 'bg-muted text-muted-foreground',
};

type MetricEntry = { label: string; value: string };

function VerdictChip({ verdict }: { verdict: NonNullable<DeploymentAd['verdict']> }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide',
        VERDICT_STYLE[verdict],
      )}
    >
      {verdict}
    </span>
  );
}

function TrustBadges({ flags }: { flags: readonly DeploymentTrustFlag[] }) {
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
  const inferred = isInferredLinkMethod(linkMethod);
  return (
    <span
      title={
        inferred
          ? TRUST_FLAG_TITLE.inferred_link
          : 'This link was observed, not guessed — the numbers belong to this creative.'
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
      {inferred && ` · ${Math.round(confidence * 100)}% confident`}
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
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      <MetricColumn title="Top of funnel" entries={top} />
      <MetricColumn title="Bottom of funnel" entries={bottom} />
    </div>
  );
}

function adFunnel(ad: DeploymentAd): { top: MetricEntry[]; bottom: MetricEntry[] } {
  const metrics = ad.metrics;
  return {
    top: [
      { label: 'Impressions', value: formatCount(metrics.impressions) },
      // Both click numbers, always together. Meta's `clicks` counts likes, comments
      // and shares, so showing only it (and only its CPC) flatters an ad nobody
      // actually visited from — on a live account $3.58/click vs $6.10/visit.
      { label: 'Clicks (all)', value: formatCount(metrics.clicks) },
      { label: 'Link clicks', value: formatCount(metrics.linkClicks) },
      { label: 'CPC (all)', value: formatMoney(metrics.cpc) },
      { label: 'Cost/visit', value: formatMoney(metrics.costPerLinkClick) },
      { label: 'Link CTR', value: formatRate(metrics.linkCtr) },
      { label: 'CPM', value: formatMoney(metrics.cpm) },
      { label: 'Frequency', value: formatMultiple(metrics.frequency) },
      { label: 'Hook', value: formatRate(metrics.hookRate) },
      { label: 'Hold', value: formatRate(metrics.holdRate) },
    ],
    bottom: [
      { label: 'Purchases', value: formatCount(metrics.purchases) },
      { label: 'Leads', value: formatCount(metrics.leads) },
      { label: 'Cost/purchase', value: formatMoney(metrics.costPerPurchase) },
      { label: 'Cost/lead', value: formatMoney(metrics.costPerLead) },
      { label: 'ROAS', value: formatMultiple(metrics.roas) },
      { label: 'Completion', value: formatRate(metrics.completionRate) },
    ],
  };
}

const RANKING_LABEL: Record<string, string> = {
  quality: 'Quality',
  engagement: 'Engagement',
  conversion: 'Conversion',
};

/**
 * Meta's own grade for this creative against everything else bidding for the same
 * impression. It is the one judgement in the panel that is not ours, and it can
 * disagree with our verdict — an ad can be cheap per lead AND a weak creative in the
 * auction. Showing it is how that tension becomes visible instead of invisible.
 */
function MetaRankings({ metrics }: { metrics: DeploymentAd['metrics'] }) {
  const entries = [
    ['quality', metrics.qualityRanking],
    ['engagement', metrics.engagementRateRanking],
    ['conversion', metrics.conversionRateRanking],
  ] as const;
  const present = entries.filter(([, value]) => typeof value === 'string' && value.length > 0);
  if (present.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-3xs text-muted-foreground">Meta ranks this creative:</span>
      {present.map(([key, value]) => {
        const weak = isUnderperformingRanking(value);
        return (
          <span
            key={key}
            className={cn(
              'rounded px-1 py-0.5 text-3xs tabular-nums',
              weak ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
            )}
            title={
              weak
                ? `Meta rates this creative below most ads competing for the same impression (${value})`
                : String(value)
            }
          >
            {RANKING_LABEL[key]} {String(value).replace(/_/g, ' ').toLowerCase()}
          </span>
        );
      })}
    </div>
  );
}

function VerdictMix({ mix }: { mix: Record<string, number> }) {
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
          {verdict} × {count}
        </span>
      ))}
    </span>
  );
}

function VersionRollupCard({ rollup, leading }: { rollup: AssetVersionRollup; leading: boolean }) {
  const surfaces = [
    rollup.adCount > 0 ? `${rollup.adCount} ad${rollup.adCount === 1 ? '' : 's'}` : null,
    rollup.postCount > 0 ? `${rollup.postCount} post${rollup.postCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-medium text-foreground">
          {versionLabel(rollup.versionNumber)}
        </span>
        {leading && (
          <span
            title="Highest ROAS of the versions we could measure."
            className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-3xs font-medium text-emerald-600 dark:text-emerald-400"
          >
            leading
          </span>
        )}
        <span className="text-2xs text-muted-foreground">{surfaces.join(' · ')}</span>
        <span className="ml-auto text-2xs tabular-nums text-muted-foreground">
          {formatMoney(rollup.spend)} spent
        </span>
      </div>

      <div className="mb-1.5">
        <TrustBadges flags={rollup.trustFlags} />
      </div>

      <FunnelSplit
        top={[
          { label: 'Impressions', value: formatCount(rollup.impressions) },
          { label: 'Clicks', value: formatCount(rollup.clicks) },
          { label: 'CTR', value: formatRate(rollup.ctr) },
          { label: 'Organic reach', value: formatCount(rollup.organicReach) },
          { label: 'Interactions', value: formatCount(rollup.organicInteractions) },
        ]}
        bottom={[
          { label: 'Purchases', value: formatCount(rollup.purchases) },
          { label: 'Leads', value: formatCount(rollup.leads) },
          { label: 'Cost/purchase', value: formatMoney(rollup.costPerPurchase) },
          { label: 'Cost/lead', value: formatMoney(rollup.costPerLead) },
          { label: 'ROAS', value: formatMultiple(rollup.roas) },
        ]}
      />

      <div className="mt-1.5">
        <VerdictMix mix={rollup.verdictMix} />
      </div>
    </div>
  );
}

function AdDeploymentCard({ deployment, ad }: { deployment: AssetDeployment; ad: DeploymentAd }) {
  const funnel = adFunnel(ad);
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
            {[ad.campaignName, ad.adsetName].filter(Boolean).join(' · ') || 'Meta ad'}
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
          {formatMoney(ad.metrics.spend)} spent
        </span>
      </div>

      <FunnelSplit top={funnel.top} bottom={funnel.bottom} />

      <MetaRankings metrics={ad.metrics} />

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
              ? new Date(post.publishedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Published post'}
          </p>
        </div>
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
          >
            View post
            <ExternalLink className="size-3" />
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
          { label: 'Reach', value: formatCount(metrics.reach) },
          { label: 'Views', value: formatCount(metrics.views) },
          { label: 'Engagement', value: formatRate(metrics.engagementRate) },
        ]}
        bottom={[
          { label: 'Likes', value: formatCount(metrics.likes) },
          { label: 'Comments', value: formatCount(metrics.comments) },
          { label: 'Shares', value: formatCount(metrics.shares) },
          { label: 'Saves', value: formatCount(metrics.saved) },
        ]}
      />
    </li>
  );
}

function DeploymentCard({ deployment }: { deployment: AssetDeployment }) {
  if (deployment.surface === 'meta_ad' && deployment.ad) {
    return <AdDeploymentCard deployment={deployment} ad={deployment.ad} />;
  }
  if (deployment.surface === 'organic_post' && deployment.post) {
    return <PostDeploymentCard deployment={deployment} post={deployment.post} />;
  }
  // The ledger says it ran here; the surface store has no row for it yet.
  return (
    <li className="rounded-md border border-border p-2.5 text-2xs text-muted-foreground">
      Deployed to {deployment.surface === 'meta_ad' ? 'a Meta ad' : 'a post'} we can no longer read.
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
  if (usage.derivedAssets.length === 0) return null;
  return (
    <Section title="Used in">
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
                {derived.depth > 1 ? `${derived.depth} hops · ` : ''}
                {derived.operation?.replaceAll('_', ' ') ?? 'legacy relation'}
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
  const deployments = performance?.deployments ?? [];
  const rollups = performance?.versionRollups ?? [];
  const leader = leadingRollup(rollups);
  const hasPaid = deployments.some((deployment) => deployment.surface === 'meta_ad');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground/70">
          Performance
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
              <p className="text-xs text-foreground">This creative hasn&apos;t run anywhere yet.</p>
              <p className="mt-1 text-2xs text-muted-foreground">
                Nothing links it to a Meta ad or a published post. Numbers appear here once it does.
              </p>
            </div>
            {usage && <UsedIn usage={usage} />}
          </div>
        ) : (
          <div className="space-y-4 p-3">
            {rollups.length > 0 && (
              <Section title="By version">
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

            <Section title={`Where it ran (${deployments.length})`}>
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
        setError(err instanceof Error ? err.message : 'Could not load performance');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandId, assetId, window]);

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
