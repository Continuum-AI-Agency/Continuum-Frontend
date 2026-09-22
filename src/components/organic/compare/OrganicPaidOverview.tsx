'use client';

// /dashboard?view=all — organic reach per platform beside paid spend, for ONE period.
// Organic comes from the same per-account snapshot and Blend math as the Compare view;
// paid from the account-overview edge the paid dashboard reads, asked for the exact dates
// the organic side resolved. Reach (people) and spend (money) are different measures, so
// they sit side by side and are never added or plotted on one axis.

import * as React from 'react';
import { formatNumber } from '@/components/organic/organic-format';
import { DeltaBadge } from '@/components/shared/DeltaBadge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type BrandOrganicSnapshot,
  loadBrandOrganicSnapshot,
  type SnapshotAccountRef,
} from '@/lib/organic/brandOrganicSnapshot';
import { organicPlatformLabel } from '@/lib/organic/platforms';
import { formatKpiValue } from '@/lib/paid-media/paid-leaderboard-rows';
import {
  fetchPaidAccountOverview,
  type PaidAccountOverview,
} from '@/lib/paid-media/paid-overview.client';
import { cn } from '@/lib/utils';
import { organicPeriod, organicReachByPlatform } from './organicPaidRows';

export type PaidAdAccountRef = { id: string; name: string };

type Preset = 'last_7d' | 'last_14d' | 'last_30d';
const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'last_7d', label: '7 days' },
  { id: 'last_14d', label: '14 days' },
  { id: 'last_30d', label: '30 days' },
];

type PaidResult =
  | { account: PaidAdAccountRef; status: 'ok'; overview: PaidAccountOverview }
  | { account: PaidAdAccountRef; status: 'error'; message: string };

type Loaded = {
  snapshot: BrandOrganicSnapshot;
  period: { since: string; until: string } | null;
  paid: PaidResult[];
};

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

async function loadOverview(
  brandId: string,
  organicAccounts: SnapshotAccountRef[],
  adAccounts: PaidAdAccountRef[],
  preset: Preset,
): Promise<Loaded> {
  const snapshot = await loadBrandOrganicSnapshot({
    brandId,
    accounts: organicAccounts,
    rangePreset: preset,
  });
  const period = organicPeriod(snapshot);
  const range = period ? { preset: 'custom' as const, ...period } : { preset };
  const paid = await Promise.all(
    adAccounts.map(async (account): Promise<PaidResult> => {
      try {
        const overview = await fetchPaidAccountOverview({
          brandId,
          adAccountId: account.id,
          platform: 'meta',
          range,
        });
        return { account, status: 'ok', overview };
      } catch (error) {
        return {
          account,
          status: 'error',
          message: error instanceof Error ? error.message : 'Paid metrics unavailable.',
        };
      }
    }),
  );
  return { snapshot, period, paid };
}

const PANEL = 'flex min-w-0 flex-col rounded-lg border border-border bg-card';
const ROW = 'flex items-baseline justify-between gap-3 px-3 py-2';

export function OrganicPaidOverview({
  brandId,
  organicAccounts,
  adAccounts,
}: {
  brandId: string;
  organicAccounts: SnapshotAccountRef[];
  adAccounts: PaidAdAccountRef[];
}) {
  const [preset, setPreset] = React.useState<Preset>('last_7d');
  const [state, setState] = React.useState<
    { status: 'loading' } | { status: 'ready'; data: Loaded } | { status: 'error'; message: string }
  >({ status: 'loading' });

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadOverview(brandId, organicAccounts, adAccounts, preset)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not load this period.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, organicAccounts, adAccounts, preset]);

  const period = state.status === 'ready' ? state.data.period : null;

  return (
    <section
      data-tour-id="dashboard-all-view"
      className="flex min-w-0 flex-col gap-[var(--dashboard-section-gap)] px-[var(--card-pad)] py-[var(--app-shell-pad-block)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Organic and paid
          </h2>
          <p
            className="text-xs text-muted-foreground"
            data-period={period ? `${period.since}..${period.until}` : ''}
          >
            {period
              ? `${formatDay(period.since)} – ${formatDay(period.until)}`
              : 'Loading the period…'}
          </p>
        </div>
        <nav
          aria-label="Period"
          className="inline-flex rounded-md border border-border bg-background p-0.5"
        >
          {PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={preset === option.id}
              onClick={() => setPreset(option.id)}
              className={cn(
                'h-6 rounded px-2.5 text-xs font-medium transition-colors',
                preset === option.id
                  ? 'bg-muted/60 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </nav>
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--dashboard-section-gap)] lg:grid-cols-2">
          <OrganicPanel state={state} hasAccounts={organicAccounts.length > 0} />
          <PaidPanel state={state} hasAccounts={adAccounts.length > 0} />
        </div>
      )}
    </section>
  );
}

function PanelHeader({ title, unit }: { title: string; unit: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <span className="text-2xs text-muted-foreground">{unit}</span>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-2 p-3">
      <Skeleton className="h-5 w-full bg-muted/70" />
      <Skeleton className="h-5 w-4/5 bg-muted/70" />
    </div>
  );
}

function OrganicPanel({
  state,
  hasAccounts,
}: {
  state: { status: 'loading' } | { status: 'ready'; data: Loaded };
  hasAccounts: boolean;
}) {
  const rows = state.status === 'ready' ? organicReachByPlatform(state.data.snapshot) : [];
  const missing = state.status === 'ready' ? state.data.snapshot.missing : [];
  return (
    <section aria-label="Organic reach" className={PANEL}>
      <PanelHeader title="Organic reach" unit="people reached" />
      {!hasAccounts ? (
        <p className="p-3 text-sm text-muted-foreground">
          No Instagram or Facebook account is connected to this brand.
        </p>
      ) : state.status === 'loading' ? (
        <LoadingRows />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.platform}
              data-organic-platform={row.platform}
              data-reach={row.reach ?? ''}
              data-account-ids={row.accounts
                .map((account) => account.integrationAccountId)
                .join(',')}
            >
              <div className={ROW}>
                <span className="min-w-0 truncate text-sm text-foreground">
                  {organicPlatformLabel(row.platform)}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {row.accounts.map((account) => account.name).join(', ')}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatNumber(row.reach)}
                  </span>
                  {typeof row.deltaPct === 'number' ? <DeltaBadge value={row.deltaPct} /> : null}
                </span>
              </div>
            </li>
          ))}
          {missing.map((account) => (
            <li key={account.integrationAccountId} className={ROW}>
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {organicPlatformLabel(account.platform)} · {account.name}
              </span>
              <span className="text-xs text-muted-foreground">Unavailable</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PaidPanel({
  state,
  hasAccounts,
}: {
  state: { status: 'loading' } | { status: 'ready'; data: Loaded };
  hasAccounts: boolean;
}) {
  const results = state.status === 'ready' ? state.data.paid : [];
  return (
    <section aria-label="Paid spend" className={PANEL}>
      <PanelHeader title="Paid spend" unit="Meta ads" />
      {!hasAccounts ? (
        <p className="p-3 text-sm text-muted-foreground">
          No Meta ad account is connected to this brand.
        </p>
      ) : state.status === 'loading' ? (
        <LoadingRows />
      ) : (
        <ul className="divide-y divide-border">
          {results.map((result) =>
            result.status === 'ok' ? (
              <li
                key={result.account.id}
                data-ad-account={result.account.id}
                data-spend={result.overview.metrics.spend}
                className={ROW}
              >
                <span className="min-w-0 truncate text-sm text-foreground">
                  {result.account.name}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatKpiValue(result.overview.metrics.spend, 'currency')}
                  </span>
                  {typeof result.overview.comparison?.spend?.percentageChange === 'number' ? (
                    <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                      {`${result.overview.comparison.spend.percentageChange >= 0 ? '+' : ''}${result.overview.comparison.spend.percentageChange.toFixed(1)}%`}
                    </span>
                  ) : null}
                </span>
              </li>
            ) : (
              <li key={result.account.id} className={ROW}>
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {result.account.name}
                </span>
                <span className="text-xs text-muted-foreground">Unavailable</span>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
