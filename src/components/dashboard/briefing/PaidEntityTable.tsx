'use client';

import type { ReactNode } from 'react';
import type {
  PaidEntityKpi,
  PaidEntityLevel,
  PaidRankedEntity,
  PaidRankingScope,
} from '@continuum/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { ModuleShortcutLink } from '@/components/shared/ModuleShortcutLink';
import { Badge } from '@/components/ui/badge';
import {
  getLatestInsights,
  type PersistedCampaignInsight,
} from '@/lib/paid-media/insight-history-client';
import { kpiLabel, kpiUnit, metricForKpi, sortEntitiesByKpi } from '@/lib/paid-media/paid-kpi';
import {
  buildPaidLeaderboardRows,
  formatKpiValue,
  type PaidLeaderboardRow,
} from '@/lib/paid-media/paid-leaderboard-rows';
import { fetchPaidRanking } from '@/lib/paid-media/paid-ranking.client';
import { lastCompleteDays } from '@/lib/paid-media/reportingWindow';
import { figureProps } from '@/components/paid-media/optimizer/format';
import { useDashboardPrefsStore } from '@/stores/dashboardPrefs';
import { InsightActionsDropdown, InsightContextActions } from './insightActions';
import { DASHBOARD_PANEL_MAX_HEIGHT } from './panelLayout';

// Human labels for the aggregation-level pill on each leaderboard row.
const LEVEL_LABELS: Record<PaidEntityLevel, string> = {
  ad: 'Ad',
  adset: 'Ad set',
  campaign: 'Campaign',
  account: 'Account',
};

// Fetched once, ranked server-side by ROAS; re-sorting by other KPIs happens in
// place over this pool, so a modest set gives the selector room to work.
const FETCH_LIMIT = 8;
// Context KPIs shown alongside the selected one (minus whichever is selected).
const CONTEXT_KPIS: PaidEntityKpi[] = ['roas', 'spend', 'ctr'];

type State =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'success'; entities: PaidRankedEntity[]; insights: PersistedCampaignInsight[] };

type PaidEntityTableProps = {
  brandId: string;
  adAccountId: string | null;
  /** The account record's currency (what the Optimizer knows). The ranking payload carries
   *  none, so this is what its money prints in; unknown prints bare, never `$`. */
  accountCurrency?: string | null;
  scope: PaidRankingScope;
  title: string;
  emptyMessage: string;
};

type PaidDisplayRow = PaidRankedEntity & { displayRank: number };

/** One KPI as text with its provenance: money in the account currency and counts carry the
 *  raw figure, currency and window on the node (PP-L3-dashboard-and-home-have-no-data-figure-
 *  nodes); a percent or a multiplier prints to its decimals and is not stamped. */
function kpiCell(
  entity: PaidRankedEntity,
  kpi: PaidEntityKpi,
  scope: PaidRankingScope,
  currency: string | null,
): ReactNode {
  const value = metricForKpi(entity, kpi);
  if (typeof value !== 'number') return '—';
  const unit = kpiUnit(kpi);
  const text = formatKpiValue(value, unit, currency);
  const figureUnit = unit === 'currency' ? 'currency' : unit === 'number' ? 'count' : null;
  if (!figureUnit) return text;
  return (
    <span {...figureProps(`home.${scope}.${entity.id}.${kpi}`, value, currency, 'd7', figureUnit)}>
      {text}
    </span>
  );
}

// One ranked paid surface (campaigns or ad sets) as a dense, sortable data
// table. Server returns the pool ranked by ROAS; the selected KPI (from the
// persisted store) re-ranks it in place — no re-fetch.
export function PaidEntityTable({
  brandId,
  adAccountId,
  accountCurrency = null,
  scope,
  title,
  emptyMessage,
}: PaidEntityTableProps) {
  const paidKpi = useDashboardPrefsStore((store) => store.paidKpi);
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (!adAccountId) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    Promise.all([
      fetchPaidRanking({
        brandId,
        adAccountId,
        platform: 'meta',
        scope,
        kpi: 'roas',
        direction: 'top',
        limit: FETCH_LIMIT,
        range: lastCompleteDays(7),
      }),
      getLatestInsights({ brandId, adAccountId, limit: 20 }).catch(
        () => [] as PersistedCampaignInsight[],
      ),
    ])
      .then(([entities, insights]) => {
        if (!cancelled) setState({ status: 'success', entities, insights });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, adAccountId, scope]);

  // One derived leaderboard row per entity, keyed by id. The name column reads
  // level + pathLabel from here and the expanded panel reads insightLine — both
  // by id lookup, keeping the table itself thin.
  const leaderboardById = useMemo(() => {
    if (state.status !== 'success') return new Map<string, PaidLeaderboardRow>();
    const built = buildPaidLeaderboardRows({
      entities: state.entities,
      insights: state.insights,
      scope,
      currency: accountCurrency,
    });
    return new Map(built.map((row) => [row.id, row]));
  }, [state, scope, accountCurrency]);

  // Re-rank the already-fetched pool by the selected KPI, in place.
  const rows = useMemo<PaidDisplayRow[]>(() => {
    if (state.status !== 'success') return [];
    return sortEntitiesByKpi(state.entities, paidKpi).map((entity, index) => ({
      ...entity,
      displayRank: index + 1,
    }));
  }, [state, paidKpi]);

  const columns = useMemo<InsightColumn<PaidDisplayRow>[]>(() => {
    const contextKpis = CONTEXT_KPIS.filter((kpi) => kpi !== paidKpi).slice(0, 2);
    return [
      {
        id: 'rank',
        header: '#',
        cellClassName: 'w-8 text-muted-foreground',
        cell: (row) => <span className="font-mono text-xs tabular-nums">{row.displayRank}</span>,
      },
      {
        id: 'name',
        header: scope === 'top_adsets' ? 'Ad set' : 'Campaign',
        cell: (row) => {
          const meta = leaderboardById.get(row.id);
          const level = meta?.level;
          const pathLabel = meta?.pathLabel;
          return (
            <div className="min-w-0">
              <div className="flex items-start gap-1.5">
                {level ? (
                  <Badge
                    variant="secondary"
                    className="mt-0.5 shrink-0 px-1.5 py-0 text-2xs font-medium"
                  >
                    {LEVEL_LABELS[level]}
                  </Badge>
                ) : null}
                <p className="text-sm leading-snug text-foreground line-clamp-2 break-words">
                  {row.name.trim() || 'Untitled'}
                </p>
              </div>
              {pathLabel ? (
                <p className="truncate text-xs text-muted-foreground">{pathLabel}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: paidKpi,
        header: kpiLabel(paidKpi),
        align: 'right',
        sortValue: (row) => metricForKpi(row, paidKpi) ?? Number.NEGATIVE_INFINITY,
        cellClassName: 'text-foreground',
        cell: (row) => kpiCell(row, paidKpi, scope, accountCurrency),
      },
      ...contextKpis.map<InsightColumn<PaidDisplayRow>>((kpi) => ({
        id: kpi,
        header: kpiLabel(kpi),
        align: 'right',
        sortValue: (row) => metricForKpi(row, kpi) ?? Number.NEGATIVE_INFINITY,
        cell: (row) => kpiCell(row, kpi, scope, accountCurrency),
      })),
    ];
  }, [scope, paidKpi, leaderboardById, accountCurrency]);

  return (
    <InsightDataTable
      title={title}
      metricLabel={kpiLabel(paidKpi)}
      headerAction={<ModuleShortcutLink href="/scale" label="Scale" />}
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      maxHeight={DASHBOARD_PANEL_MAX_HEIGHT}
      isLoading={state.status === 'idle' || state.status === 'loading'}
      emptyState={state.status === 'error' ? "Couldn't load performance right now." : emptyMessage}
      contextMenu={() => <InsightContextActions />}
      rowActions={() => <InsightActionsDropdown />}
      expandedContent={(row) => (
        <div className="flex flex-col gap-2 text-xs leading-relaxed">
          {leaderboardById.get(row.id)?.insightLine ? (
            <p className="text-foreground">{leaderboardById.get(row.id)?.insightLine}</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono tabular-nums text-muted-foreground sm:grid-cols-4">
            <Stat label="Conv" value={kpiCell(row, 'conversions', scope, accountCurrency)} />
            <Stat label="Conv value" value={kpiCell(row, 'conversions_value', scope, accountCurrency)} />
            <Stat label="CPC" value={kpiCell(row, 'cpc', scope, accountCurrency)} />
            <Stat label="CPM" value={kpiCell(row, 'cpm', scope, accountCurrency)} />
          </dl>
        </div>
      )}
    />
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
