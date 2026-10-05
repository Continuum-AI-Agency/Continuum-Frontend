'use client';

// The Home overview: one strip with the goals this brand measures itself by, then one block per
// module. Performance + shows where the main goal's results came from, Organic + the week's
// reach and engagement, Creative + the best and the worst ad by cost per main-goal result.
// Goals come from the saved profile for the scope on screen, else the brand's, else they are
// inferred from the account's own results, so the Home always has something to show.

import {
  HOME_OBJECTIVE_METRICS,
  HOME_PROFILE_BRAND_SCOPE,
  type HomeObjective,
  type HomeProfileRow,
  resolveHomeObjectives,
} from '@continuum/contracts';
import { ArrowUpRight, ImageOff } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import {
  resetHomeObjectivesAction,
  saveHomeObjectivesAction,
} from '@/app/(post-auth)/dashboard/actions';
import { DeltaBadge } from '@/components/shared/DeltaBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast-imperative';
import { type SnapshotAccountRef, summableRollups } from '@/lib/organic/brandOrganicSnapshot';
import { cn } from '@/lib/utils';
import { formatCount, formatFigure, formatMoney, formatRatio } from './format';
import { objectiveFigure, resultTotalsOf } from './homeOverviewModel';
import { costLabelFor, ObjectiveStrip } from './ObjectiveStrip';
import {
  type HomeAdAccount,
  type RankedWithAccount,
  useAccountTotals,
  useCreativeExtremes,
  useOrganicSnapshot,
  useTopCampaigns,
} from './useHomeOverviewData';

type Props = {
  brandId: string;
  adAccounts: HomeAdAccount[];
  organicAccounts: SnapshotAccountRef[];
  profileRows: HomeProfileRow[];
};

function ModuleCard({
  title,
  accent,
  href,
  children,
}: {
  title: string;
  accent: 'perf' | 'org' | 'cre';
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-home-module={accent}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 border-t-2',
        accent === 'perf' && 'border-t-amber-500',
        accent === 'org' && 'border-t-emerald-500',
        accent === 'cre' && 'border-t-violet-500',
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Open <ArrowUpRight className="size-3" />
        </Link>
      </header>
      {children}
    </section>
  );
}

function Bars({ rows }: { rows: { name: string; value: number; label: string }[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li
          key={row.name}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 text-xs"
        >
          <span className="truncate text-muted-foreground" title={row.name}>
            {row.name}
          </span>
          <span className="font-mono tabular-nums">{row.label}</span>
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-amber-500/80"
              style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Unavailable({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function CreativeSlot({
  tone,
  row,
  image,
  valueLabel,
}: {
  tone: 'best' | 'worst';
  row: RankedWithAccount | null;
  image: string | null | undefined;
  valueLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span
        className={cn(
          'text-2xs font-semibold uppercase tracking-wide',
          tone === 'best' ? 'text-success' : 'text-destructive',
        )}
      >
        {tone === 'best' ? 'Best' : 'Worst'}
      </span>
      {row ? (
        <>
          <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
            {image ? (
              // biome-ignore lint/performance/noImgElement: Meta CDN URLs expire and are not in next/image remotePatterns.
              <img src={image} alt={row.name} className="size-full object-cover" loading="lazy" />
            ) : (
              <span className="flex size-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-5" />
              </span>
            )}
            <span className="absolute left-1.5 top-1.5 rounded-full bg-background/90 px-1.5 py-0.5 font-mono text-2xs tabular-nums">
              {valueLabel}
            </span>
          </div>
          <span className="truncate text-xs" title={row.name}>
            {row.name}
          </span>
        </>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-border text-center text-2xs text-muted-foreground">
          No second ad with results this week
        </div>
      )}
    </div>
  );
}

export function HomeOverview({ brandId, adAccounts, organicAccounts, profileRows }: Props) {
  const [scope, setScope] = useState<string>(HOME_PROFILE_BRAND_SCOPE);
  const [rows, setRows] = useState<HomeProfileRow[]>(profileRows);
  const [, startSaving] = useTransition();

  const scopedAccounts = useMemo(
    () =>
      scope === HOME_PROFILE_BRAND_SCOPE ? adAccounts : adAccounts.filter((a) => a.id === scope),
    [adAccounts, scope],
  );
  const currencies = new Set(scopedAccounts.map((account) => account.currency).filter(Boolean));
  const currency = currencies.size === 1 ? ([...currencies][0] ?? null) : null;

  const totalsState = useAccountTotals(brandId, scopedAccounts);
  const totals = totalsState.status === 'ready' ? totalsState.data : null;

  const resolved = resolveHomeObjectives({
    scope,
    rows,
    totals: totals ? resultTotalsOf(totals) : {},
  });
  const objectives = resolved.objectives;
  const primary =
    objectives.find((objective) => objective.role === 'primary') ?? objectives[0] ?? null;
  const figures = totals ? objectives.map((objective) => objectiveFigure(objective, totals)) : [];
  const spendFigure = totals
    ? objectiveFigure({ id: 'spend', label: 'Spend', metric: 'spend', role: 'secondary' }, totals)
    : null;

  const campaigns = useTopCampaigns(brandId, scopedAccounts, primary?.metric ?? null);
  const creatives = useCreativeExtremes(brandId, scopedAccounts, primary?.metric ?? null);
  const organic = useOrganicSnapshot(brandId, organicAccounts);

  const saveObjectives = (next: HomeObjective[]) => {
    const previous = rows;
    const optimistic: HomeProfileRow = {
      brand_id: brandId,
      scope,
      objectives: next,
      source: 'user',
    };
    setRows([...rows.filter((row) => row.scope !== scope), optimistic]);
    startSaving(async () => {
      const result = await saveHomeObjectivesAction(brandId, scope, next);
      if (!result.ok) {
        setRows(previous);
        toast.error(result.message);
      }
    });
  };

  const resetObjectives = () => {
    const previous = rows;
    setRows(rows.filter((row) => row.scope !== scope));
    startSaving(async () => {
      const result = await resetHomeObjectivesAction(brandId, scope);
      if (!result.ok) {
        setRows(previous);
        toast.error(result.message);
      }
    });
  };

  const scopeHasOwnRow = rows.some((row) => row.scope === scope);
  const sourceNote =
    resolved.source === 'inferred'
      ? 'Goals suggested from your results'
      : resolved.fromScope === scope
        ? 'Goals set by your team'
        : 'Using the brand goals';

  const primaryFigure = figures.find((figure) => figure.objective.id === primary?.id) ?? null;
  const reach =
    organic.status === 'ready'
      ? summableRollups(organic.data.accounts, ['reach', 'totalInteractions', 'newFollowers'])
      : [];
  const reachByPlatform =
    organic.status === 'ready'
      ? organic.data.accounts
          .map((account) => ({
            name: account.name,
            platform: account.platform,
            value: Number(account.metrics.reach ?? 0),
          }))
          .filter((row) => row.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 4)
      : [];
  const reachDelta = (() => {
    if (organic.status !== 'ready') return null;
    let now = 0;
    let before = 0;
    for (const account of organic.data.accounts) {
      const comparison = account.comparison?.reach;
      if (typeof comparison?.current === 'number' && typeof comparison.previous === 'number') {
        now += comparison.current;
        before += comparison.previous;
      }
    }
    return before > 0 ? ((now - before) / before) * 100 : null;
  })();

  const primaryCostLabel = primary ? HOME_OBJECTIVE_METRICS[primary.metric].costLabel : null;
  const creativeRankLabel = primary
    ? primaryCostLabel
      ? costLabelFor(primary, primaryCostLabel).toLowerCase()
      : primary.label.toLowerCase()
    : 'results';

  const creativeValueLabel = (row: RankedWithAccount) =>
    row.kpi_unit === 'currency'
      ? formatMoney(row.kpi_value, currency)
      : row.kpi_unit === 'multiplier'
        ? formatRatio(row.kpi_value)
        : formatCount(row.kpi_value);

  return (
    <div data-home-overview className="flex min-w-0 flex-col gap-4 px-[var(--card-pad)] py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-medium text-foreground">
            Last 7 days, compared with the 7 before
          </span>
          <span className="text-2xs text-muted-foreground">
            {sourceNote}
            {scopeHasOwnRow ? (
              <>
                {' · '}
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={resetObjectives}
                >
                  {scope === HOME_PROFILE_BRAND_SCOPE ? 'Use suggested goals' : 'Use brand goals'}
                </button>
              </>
            ) : null}
          </span>
        </div>
        {adAccounts.length > 1 ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only">Ad accounts in view</span>
            <select
              id="home-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value={HOME_PROFILE_BRAND_SCOPE}>All ad accounts</option>
              {adAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {adAccounts.length === 0 ? (
        <Unavailable>Connect a Meta ad account to see paid results and goals here.</Unavailable>
      ) : totalsState.status === 'loading' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 rounded-lg bg-muted/70" />
          ))}
        </div>
      ) : totalsState.status === 'error' ? (
        <Unavailable>
          Paid results could not be loaded right now. Try again in a minute.
        </Unavailable>
      ) : (
        <ObjectiveStrip
          figures={
            spendFigure && objectives.every((o) => o.metric !== 'spend') && objectives.length < 3
              ? [...figures, spendFigure]
              : figures
          }
          objectives={objectives}
          currency={currency}
          onChange={saveObjectives}
        />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ModuleCard title="Performance +" accent="perf" href="/scale">
          {primaryFigure?.available && primaryFigure.value !== null ? (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {formatFigure(primaryFigure.value, primaryFigure.unit, currency)}
              </span>
              <span className="text-xs text-muted-foreground">{primary?.label.toLowerCase()}</span>
              {primaryFigure.deltaPct !== null ? (
                <DeltaBadge value={primaryFigure.deltaPct} />
              ) : null}
            </div>
          ) : null}
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
            Campaigns that brought the most {primary?.label.toLowerCase() ?? 'results'}
          </span>
          {campaigns.status === 'loading' ? (
            <Skeleton className="h-24 bg-muted/70" />
          ) : campaigns.status === 'error' ? (
            <Unavailable>Campaigns could not be loaded right now.</Unavailable>
          ) : campaigns.data.length === 0 ? (
            <Unavailable>
              No campaign brought {primary?.label.toLowerCase() ?? 'results'} this week.
            </Unavailable>
          ) : (
            <Bars
              rows={campaigns.data.map((row) => ({
                name: row.name,
                value: row.kpi_value,
                label:
                  row.kpi_unit === 'currency'
                    ? formatMoney(row.kpi_value, currency)
                    : formatCount(row.kpi_value),
              }))}
            />
          )}
        </ModuleCard>

        <ModuleCard title="Organic +" accent="org" href="/organic?tab=metrics">
          {organicAccounts.length === 0 ? (
            <Unavailable>Connect Instagram or Facebook to see organic reach here.</Unavailable>
          ) : organic.status === 'loading' ? (
            <Skeleton className="h-32 bg-muted/70" />
          ) : organic.status === 'error' || reach.every((item) => item.value === null) ? (
            <Unavailable>Organic results could not be loaded right now.</Unavailable>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {reach.map((item) =>
                  item.value === null ? null : (
                    <div key={item.metricId} className="flex flex-col">
                      <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-xl font-semibold tabular-nums">
                          {formatCount(item.value)}
                        </span>
                        {item.metricId === 'reach' && reachDelta !== null ? (
                          <DeltaBadge value={reachDelta} />
                        ) : null}
                      </span>
                    </div>
                  ),
                )}
              </div>
              {organicAccounts.every((account) => account.platform !== 'instagram') ? (
                <p className="text-2xs text-muted-foreground">
                  Only a Facebook Page is connected. Connect Instagram to see its reach and new
                  followers here.
                </p>
              ) : null}
              {reachByPlatform.length > 0 ? (
                <>
                  <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                    Reach by account
                  </span>
                  <ul className="flex flex-col gap-1.5">
                    {reachByPlatform.map((row) => {
                      const max = reachByPlatform[0]?.value ?? 1;
                      return (
                        <li
                          key={`${row.platform}-${row.name}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 text-xs"
                        >
                          <span className="truncate text-muted-foreground">
                            {row.name} <span className="capitalize">· {row.platform}</span>
                          </span>
                          <span className="font-mono tabular-nums">{formatCount(row.value)}</span>
                          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-emerald-500/80"
                              style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
                            />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </ModuleCard>

        <ModuleCard title="Creative +" accent="cre" href="/library">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">
            Ads ranked by {creativeRankLabel}
          </span>
          {creatives.status === 'loading' ? (
            <Skeleton className="h-40 bg-muted/70" />
          ) : creatives.status === 'error' ? (
            <Unavailable>Ads could not be loaded right now.</Unavailable>
          ) : !creatives.data.best ? (
            <Unavailable>
              No ad brought {primary?.label.toLowerCase() ?? 'results'} this week.
            </Unavailable>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <CreativeSlot
                tone="best"
                row={creatives.data.best}
                image={creatives.data.images[creatives.data.best.id]}
                valueLabel={creativeValueLabel(creatives.data.best)}
              />
              <CreativeSlot
                tone="worst"
                row={creatives.data.worst}
                image={creatives.data.worst ? creatives.data.images[creatives.data.worst.id] : null}
                valueLabel={creatives.data.worst ? creativeValueLabel(creatives.data.worst) : ''}
              />
            </div>
          )}
        </ModuleCard>
      </div>
    </div>
  );
}
