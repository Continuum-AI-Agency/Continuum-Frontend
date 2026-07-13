'use client';

// "What's Working — Ads": the paid twin of the organic CreativeStrategyCard.
// Renders the materialized paid_media.creative_reports row — win-rate by
// creative category (funnel-stage segmented, trust-layer flags surfaced) plus
// kill/scale/iterate verdicts with figure-bearing reasons. All numbers are
// computed server-side (SQL RPC + pure verdict rules); this card only presents.

import type {
  CreativeWinRateFlag,
  CreativeWinRateRow,
  PaidCreativeVerdict,
  PaidFunnelStage,
} from '@continuum/contracts';
import { useMemo, useState } from 'react';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { cn } from '@/lib/utils';

const FUNNEL_TABS = ['all', 'tof', 'mof', 'bof'] as const;
type FunnelTab = (typeof FUNNEL_TABS)[number];

const FLAG_LABEL: Record<CreativeWinRateFlag, string> = {
  low_evidence: 'low evidence',
  spend_concentrated: 'spend concentrated',
  warm_audience_skew: 'warm-audience skew',
  confounded: 'confounded',
};

const DIMENSION_LABEL: Record<CreativeWinRateRow['dimension'], string> = {
  hook_archetype: 'Hook',
  angle: 'Angle',
  asset_type: 'Asset',
  theme: 'Theme',
  funnel_stage: 'Funnel',
  visual_style: 'Visual style',
};

const VERDICT_STYLE: Record<PaidCreativeVerdict['verdict'], string> = {
  kill: 'bg-destructive/10 text-destructive',
  scale: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  iterate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  watch: 'bg-muted text-muted-foreground',
};

const humanize = (value: string): string => value.replace(/_/g, ' ');
const percent = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)}%`;
const money = (value: number | null): string => (value === null ? '—' : `$${value.toFixed(2)}`);
const isHttp = (value: string | null): value is string =>
  typeof value === 'string' && /^https?:\/\//.test(value);

function FlagPills({ flags }: { flags: CreativeWinRateFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-3xs text-amber-600 dark:text-amber-400"
          title="Treat this win-rate with care — see the attribution note below."
        >
          {FLAG_LABEL[flag]}
        </span>
      ))}
    </span>
  );
}

function VerdictRow({ verdict }: { verdict: PaidCreativeVerdict }) {
  const thumb = isHttp(verdict.thumbnailUrl) ? verdict.thumbnailUrl : null;
  const body = (
    <>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={verdict.adName ?? verdict.adId}
          className="h-9 w-9 shrink-0 rounded object-cover"
          src={thumb}
        />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-muted text-3xs text-muted-foreground">
          AD
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">
            {verdict.adName ?? verdict.adId}
          </span>
          <span className="rounded bg-muted px-1 py-px text-3xs uppercase text-muted-foreground">
            {verdict.funnelStage}
          </span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-3xs text-muted-foreground">
          {verdict.reason}
        </span>
      </span>
      <span className="shrink-0 text-right text-3xs text-muted-foreground">
        {money(verdict.spend)}
        <span className="block">30d spend</span>
      </span>
    </>
  );

  const rowClass = 'flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/40';
  if (isHttp(verdict.permalinkUrl)) {
    return (
      <a className={rowClass} href={verdict.permalinkUrl} rel="noreferrer" target="_blank">
        {body}
      </a>
    );
  }
  return <div className={rowClass}>{body}</div>;
}

function VerdictColumn({
  kind,
  verdicts,
}: {
  kind: PaidCreativeVerdict['verdict'];
  verdicts: PaidCreativeVerdict[];
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background/60 p-1.5">
      <p className="flex items-center justify-between px-1 pb-1">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide',
            VERDICT_STYLE[kind],
          )}
        >
          {kind}
        </span>
        <span className="text-3xs text-muted-foreground">{verdicts.length}</span>
      </p>
      {verdicts.length === 0 ? (
        <p className="px-1.5 py-2 text-3xs text-muted-foreground">None right now.</p>
      ) : (
        verdicts.slice(0, 4).map((verdict) => <VerdictRow key={verdict.adId} verdict={verdict} />)
      )}
    </div>
  );
}

export function WhatsWorkingAdsCard({ brandId }: { brandId: string }) {
  const { status, report, refreshedAt, isLoading } = usePaidCreativeReport(brandId);
  const [funnel, setFunnel] = useState<FunnelTab>('all');

  const winRateRows = useMemo(() => {
    const rows = (report?.winRates ?? []).filter((row) => row.dimension !== 'funnel_stage');
    return funnel === 'all'
      ? rows
      : rows.filter((row) => row.funnelStage === (funnel as PaidFunnelStage));
  }, [report, funnel]);

  const verdictsByKind = useMemo(() => {
    const verdicts = (report?.verdicts ?? []).filter(
      (verdict) => funnel === 'all' || verdict.funnelStage === (funnel as PaidFunnelStage),
    );
    return {
      kill: verdicts.filter((v) => v.verdict === 'kill'),
      scale: verdicts.filter((v) => v.verdict === 'scale'),
      iterate: verdicts.filter((v) => v.verdict === 'iterate'),
    };
  }, [report, funnel]);

  const columns: InsightColumn<CreativeWinRateRow>[] = useMemo(
    () => [
      {
        id: 'category',
        header: 'Category',
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-muted px-1 py-px text-3xs text-muted-foreground">
              {DIMENSION_LABEL[row.dimension]}
            </span>
            <span className="truncate text-xs text-foreground">{humanize(row.value)}</span>
          </span>
        ),
        sortValue: (row) => `${row.dimension}:${row.value}`,
      },
      {
        id: 'funnel',
        header: 'Funnel',
        cell: (row) => <span className="text-xs uppercase">{row.funnelStage}</span>,
        sortValue: (row) => row.funnelStage,
      },
      {
        id: 'winRate',
        header: 'Win rate',
        align: 'right',
        cell: (row) => <span className="text-xs tabular-nums">{percent(row.winRate)}</span>,
        sortValue: (row) => row.winRate,
      },
      {
        id: 'ads',
        header: 'Ads',
        align: 'right',
        cell: (row) => (
          <span className="text-xs tabular-nums">
            {row.winners}/{row.eligibleAds}
          </span>
        ),
        sortValue: (row) => row.eligibleAds,
      },
      {
        id: 'spendShare',
        header: 'Spend share',
        align: 'right',
        cell: (row) => <span className="text-xs tabular-nums">{percent(row.spendShare)}</span>,
        sortValue: (row) => row.spendShare ?? -1,
      },
      {
        id: 'medianCpa',
        header: 'Cohort median CPA',
        align: 'right',
        cell: (row) => <span className="text-xs tabular-nums">{money(row.medianCpa)}</span>,
        sortValue: (row) => row.medianCpa ?? -1,
      },
      {
        id: 'flags',
        header: 'Flags',
        cell: (row) => <FlagPills flags={row.flags} />,
        sortValue: (row) => row.flags.length,
      },
    ],
    [],
  );

  if (status === 'assembling' && !report) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-background/70 px-3 py-4">
        <p className="text-sm font-medium text-foreground">What&apos;s Working — Ads</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isLoading
            ? 'Loading creative intelligence…'
            : 'Analyzing your ad creatives — labels and win-rates appear after the first sync completes.'}
        </p>
      </div>
    );
  }

  if (status === 'empty' || !report) {
    return (
      <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
        <p className="text-sm font-medium text-foreground">What&apos;s Working — Ads</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No labeled ads with enough spend yet. Categories appear once ads clear the evidence floors
          ($50 spend, 3,000 impressions).
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border/70 bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div>
          <p className="text-sm font-medium text-foreground">What&apos;s Working — Ads</p>
          <p className="text-3xs text-muted-foreground">
            {report.sourceCounts.labeled} creatives labeled across {report.sourceCounts.ads} ads
            {refreshedAt ? ` · refreshed ${new Date(refreshedAt).toLocaleString()}` : ''}
          </p>
        </div>
        <Tabs onValueChange={(value) => setFunnel(value as FunnelTab)} value={funnel}>
          <TabsList className="h-7">
            {FUNNEL_TABS.map((tab) => (
              <TabsTrigger className="px-2 text-3xs uppercase" key={tab} value={tab}>
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <div className="space-y-2 p-2">
        <InsightDataTable
          columns={columns}
          defaultSort={{ columnId: 'winRate', direction: 'desc' }}
          emptyState={
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No categories at this funnel stage yet.
            </p>
          }
          getRowId={(row) => `${row.dimension}:${row.value}:${row.funnelStage}`}
          maxHeight={260}
          rows={winRateRows}
        />

        <div className="flex flex-col gap-1.5 lg:flex-row">
          <VerdictColumn kind="kill" verdicts={verdictsByKind.kill} />
          <VerdictColumn kind="scale" verdicts={verdictsByKind.scale} />
          <VerdictColumn kind="iterate" verdicts={verdictsByKind.iterate} />
        </div>

        <p className="px-1 text-3xs text-muted-foreground">{report.attributionNote}</p>
      </div>
    </section>
  );
}
