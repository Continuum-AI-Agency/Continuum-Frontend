'use client';

// Home organic KPI strip: multi-platform summary over the same ingestion path
// as Metrics Compare (loadBrandOrganicSnapshot). Within a platform with multiple
// accounts, values are platform-blended (summable metrics only).

import type { OrganicMetricPlatform } from '@continuum/contracts';
import { useEffect, useMemo, useState } from 'react';
import type { InstagramAccountOption } from '@/components/dashboard/InstagramOrganicReportingWidget';
import { Sparkline, type SparklineTone } from '@/components/organic/cards/Sparkline';
import { DeltaBadge } from '@/components/shared/DeltaBadge';
import { MetricStrip, type MetricStripItem } from '@/components/shared/MetricStrip';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccountSelectionStore } from '@/lib/integrations/accountSelectionStore';
import { blendMetric } from '@/lib/organic/blendAccounts';
import {
  type BrandOrganicSnapshot,
  flattenAccountsByPlatform,
  loadBrandOrganicSnapshot,
  type SnapshotAccountRef,
  type SnapshotAccountResult,
} from '@/lib/organic/brandOrganicSnapshot';
import {
  restKpisExcludingPlatform,
  selectHeroAccountRow,
} from '@/lib/organic/organicMetricStripHero';
import { resolveOrganicAccount } from '@/lib/organic/resolve-organic-account';
import { resolveMetricPresentation } from '@/lib/ui/metricPresentation';

const RANGE_PRESET = 'last_7d' as const;

const PLATFORM_ORDER: OrganicMetricPlatform[] = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
];

const PLATFORM_SHORT: Record<OrganicMetricPlatform, string> = {
  instagram: 'IG',
  facebook: 'FB',
  tiktok: 'TT',
  youtube: 'YT',
  linkedin: 'LI',
};

// Preferred headline metric per platform (lowest-level product language).
const HEADLINE_METRIC: Record<
  OrganicMetricPlatform,
  { id: 'reach' | 'views' | 'impressions'; label: string }
> = {
  instagram: { id: 'reach', label: 'reach' },
  facebook: { id: 'reach', label: 'reach' },
  tiktok: { id: 'views', label: 'views' },
  youtube: { id: 'views', label: 'views' },
  linkedin: { id: 'impressions', label: 'impr.' },
};

export type OrganicMetricStripAccount = {
  integrationAccountId: string;
  name: string;
  externalAccountId?: string | null;
};

type OrganicMetricStripProps = {
  brandId: string;
  /** @deprecated prefer accountsByPlatform — kept for callers that only pass IG. */
  accounts?: OrganicMetricStripAccount[];
  youtubeAccounts?: OrganicMetricStripAccount[];
  accountsByPlatform?: Partial<Record<OrganicMetricPlatform, OrganicMetricStripAccount[]>>;
};

function resolveAccounts(props: OrganicMetricStripProps): SnapshotAccountRef[] {
  if (props.accountsByPlatform) {
    const byPlatform = {
      instagram: props.accountsByPlatform.instagram ?? [],
      facebook: props.accountsByPlatform.facebook ?? [],
      tiktok: props.accountsByPlatform.tiktok ?? [],
      youtube: props.accountsByPlatform.youtube ?? [],
      linkedin: props.accountsByPlatform.linkedin ?? [],
    };
    return flattenAccountsByPlatform(byPlatform);
  }
  const refs: SnapshotAccountRef[] = [];
  for (const account of props.accounts ?? []) {
    refs.push({
      platform: 'instagram',
      integrationAccountId: account.integrationAccountId,
      name: account.name,
    });
  }
  for (const account of props.youtubeAccounts ?? []) {
    refs.push({
      platform: 'youtube',
      integrationAccountId: account.integrationAccountId,
      name: account.name,
    });
  }
  return refs;
}

function toAccountOptions(accounts: OrganicMetricStripAccount[] = []): InstagramAccountOption[] {
  return accounts.map((account) => ({
    integrationAccountId: account.integrationAccountId,
    name: account.name,
    externalAccountId: account.externalAccountId ?? null,
  }));
}

// The selected account's own KPI (single-account "blend" is identity), used as
// the hero so the value, delta, and sparkline all reflect that one account.
function buildAccountHero(row: SnapshotAccountResult): PlatformKpi | null {
  const headline = HEADLINE_METRIC[row.platform];
  const blended = blendMetric([row], headline.id);
  const presentation = resolveMetricPresentation({
    connected: true,
    loading: false,
    failed: false,
    total: blended.kind === 'sum' ? blended.total : undefined,
    deltaPct: blended.kind === 'sum' ? blended.comparison?.percentageChange : undefined,
  });
  if (presentation.state !== 'ready') return null;
  return {
    platform: row.platform,
    label: `${PLATFORM_SHORT[row.platform]} ${headline.label}`,
    accountName: row.name,
    value: presentation.value,
    deltaPct: presentation.deltaPct,
    ready: true,
    tone: 'default',
    series: blended.kind === 'sum' ? blended.trends.map((point) => point.value) : [],
  };
}

type State =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'success'; snapshot: BrandOrganicSnapshot };

export function OrganicMetricStrip(props: OrganicMetricStripProps) {
  const { brandId } = props;
  const accountKey = [
    ...(props.accounts ?? []).map((a) => `ig:${a.integrationAccountId}`),
    ...(props.youtubeAccounts ?? []).map((a) => `yt:${a.integrationAccountId}`),
    ...PLATFORM_ORDER.flatMap((p) =>
      (props.accountsByPlatform?.[p] ?? []).map((a) => `${p}:${a.integrationAccountId}`),
    ),
  ].join('|');

  const accountRefs = useMemo(
    () => resolveAccounts(props),
    // accountKey captures id set; props object identity is not stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandId, accountKey],
  );

  // Follow the same account the user is selected in elsewhere on the home
  // dashboard (insights list + creatives table read this same store), so the
  // hero re-points live when they switch accounts in the reporting widget.
  const igSelection = useAccountSelectionStore(
    (store) => store.selections[`${brandId}:instagram`] ?? null,
  );
  const ytSelection = useAccountSelectionStore(
    (store) => store.selections[`${brandId}:youtube`] ?? null,
  );
  const selectedAccount = useMemo(
    () =>
      resolveOrganicAccount(
        brandId,
        toAccountOptions(props.accounts ?? props.accountsByPlatform?.instagram),
        toAccountOptions(props.youtubeAccounts ?? props.accountsByPlatform?.youtube),
      ),
    // igSelection/ytSelection force a recompute when the remembered account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandId, accountKey, igSelection, ytSelection],
  );

  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (accountRefs.length === 0) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    loadBrandOrganicSnapshot({
      brandId,
      accounts: accountRefs,
      rangePreset: RANGE_PRESET,
      forceRefresh: false,
    })
      .then((snapshot) => {
        if (!cancelled) setState({ status: 'success', snapshot });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [accountRefs, brandId]);

  const kpis = useMemo<PlatformKpi[]>(() => {
    const out: PlatformKpi[] = [];
    for (const platform of PLATFORM_ORDER) {
      const headline = HEADLINE_METRIC[platform];
      const configuredAccounts = accountRefs.filter((account) => account.platform === platform);
      const connected = configuredAccounts.length > 0;
      const snapshotAccounts =
        state.status === 'success'
          ? state.snapshot.accounts.filter((account) => account.platform === platform)
          : [];
      const blended =
        snapshotAccounts.length > 0 ? blendMetric(snapshotAccounts, headline.id) : null;
      const presentation = resolveMetricPresentation({
        connected,
        loading: connected && (state.status === 'idle' || state.status === 'loading'),
        failed: connected && state.status === 'error',
        total: blended?.kind === 'sum' ? blended.total : undefined,
        deltaPct: blended?.kind === 'sum' ? blended.comparison?.percentageChange : undefined,
      });
      const suffix = configuredAccounts.length > 1 ? ' Σ' : '';
      out.push({
        platform,
        label: `${PLATFORM_SHORT[platform]}${suffix} ${headline.label}`,
        value: presentation.value,
        deltaPct: presentation.deltaPct,
        ready: presentation.state === 'ready',
        tone:
          presentation.state === 'error'
            ? 'danger'
            : presentation.state === 'ready'
              ? 'default'
              : 'muted',
        series: blended?.kind === 'sum' ? blended.trends.map((point) => point.value) : [],
      });
    }
    return out;
  }, [accountRefs, state]);

  if (kpis.length === 0) return null;

  if (state.status === 'loading') {
    return (
      <div
        data-tour-id="organic-home-metric-strip"
        className="flex flex-col gap-2"
        role="status"
        aria-label="Loading organic metrics"
      >
        <Skeleton className="h-16 w-full max-w-sm rounded-lg" />
        <div className="flex flex-wrap items-center gap-3">
          {PLATFORM_ORDER.slice(1).map((platform) => (
            <Skeleton key={platform} className="h-4 w-24" />
          ))}
        </div>
      </div>
    );
  }

  // The hero follows the account the user is selected in on the home dashboard:
  // its own per-account KPI + sparkline. When there is no selection or its data
  // has not loaded, fall back to the first connected+ready channel (IG by
  // priority). The remaining channels — disconnected ones included — collapse
  // into a quiet muted strip, minus the hero's platform so it is not shown twice.
  const selectedRow =
    state.status === 'success' ? selectHeroAccountRow(state.snapshot, selectedAccount) : null;
  const hero =
    (selectedRow ? buildAccountHero(selectedRow) : null) ?? kpis.find((kpi) => kpi.ready) ?? null;
  const rest = restKpisExcludingPlatform(kpis, hero?.platform ?? null);
  const restItems: MetricStripItem[] = rest.map((kpi) => ({
    label: kpi.label,
    value: kpi.value,
    deltaPct: kpi.deltaPct,
    tone: kpi.tone,
  }));

  return (
    <div
      data-tour-id="organic-home-metric-strip"
      className="flex flex-col items-start gap-2.5"
    >
      {hero ? <MetricHero kpi={hero} /> : null}
      <MetricStrip items={restItems} live={!hero && kpis.some((kpi) => kpi.ready)} />
    </div>
  );
}

type PlatformKpi = {
  platform: OrganicMetricPlatform;
  label: string;
  /** Present when the hero is a specific selected account (vs a platform blend). */
  accountName?: string;
  value: string;
  deltaPct?: number;
  ready: boolean;
  tone: 'default' | 'muted' | 'danger';
  series: number[];
};

function sparklineTone(deltaPct: number | undefined): SparklineTone {
  if (typeof deltaPct !== 'number' || deltaPct === 0) return 'flat';
  return deltaPct > 0 ? 'positive' : 'negative';
}

function MetricHero({ kpi }: { kpi: PlatformKpi }) {
  return (
    <div className="flex w-full max-w-[22rem] items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="size-1.5 shrink-0 rounded-full bg-success live-pulse" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-2xs uppercase tracking-wide text-muted-foreground">
          {kpi.accountName ? `${kpi.accountName} · ${kpi.label}` : kpi.label}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
            {kpi.value}
          </span>
          {typeof kpi.deltaPct === 'number' ? <DeltaBadge value={kpi.deltaPct} /> : null}
        </div>
      </div>
      <Sparkline
        values={kpi.series}
        tone={sparklineTone(kpi.deltaPct)}
        width={96}
        height={32}
        className="ml-auto shrink-0"
        ariaLabel={`${kpi.label} trend`}
      />
    </div>
  );
}
