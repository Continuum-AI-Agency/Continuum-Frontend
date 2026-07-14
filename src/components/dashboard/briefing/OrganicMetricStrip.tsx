'use client';

// Home organic KPI strip: multi-platform summary over the same ingestion path
// as Metrics Compare (loadBrandOrganicSnapshot). Within a platform with multiple
// accounts, values are platform-blended (summable metrics only).

import type { OrganicMetricPlatform } from '@continuum/contracts';
import { useEffect, useMemo, useState } from 'react';
import { MetricStrip, type MetricStripItem } from '@/components/shared/MetricStrip';
import { Skeleton } from '@/components/ui/skeleton';
import { blendMetric } from '@/lib/organic/blendAccounts';
import {
  type BrandOrganicSnapshot,
  flattenAccountsByPlatform,
  loadBrandOrganicSnapshot,
  type SnapshotAccountRef,
} from '@/lib/organic/brandOrganicSnapshot';
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

  const items = useMemo<MetricStripItem[]>(() => {
    const itemsOut: MetricStripItem[] = [];
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
      itemsOut.push({
        label: `${PLATFORM_SHORT[platform]}${suffix} ${headline.label}`,
        value: presentation.value,
        deltaPct: presentation.deltaPct,
        tone:
          presentation.state === 'error'
            ? 'danger'
            : presentation.state === 'ready'
              ? 'default'
              : 'muted',
      });
    }
    return itemsOut;
  }, [accountRefs, state]);

  if (items.length === 0) return null;

  return (
    <div data-tour-id="organic-home-metric-strip">
      {state.status === 'loading' ? (
        <div
          className="flex flex-wrap items-center gap-3"
          role="status"
          aria-label="Loading organic metrics"
        >
          {PLATFORM_ORDER.map((platform) => (
            <Skeleton key={platform} className="h-4 w-24" />
          ))}
        </div>
      ) : (
        <MetricStrip
          items={items}
          live={state.status === 'success' && items.some((item) => item.tone === 'default')}
        />
      )}
    </div>
  );
}
