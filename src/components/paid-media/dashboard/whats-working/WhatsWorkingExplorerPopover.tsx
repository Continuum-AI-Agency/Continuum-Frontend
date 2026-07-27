'use client';

// "What's Working — Ads", explorer half: the win-rate category table, popped out
// of the dashboard into a click Popover so it floats over the page and dismisses
// on click-away, instead of a full-height slide-over. The dashboard keeps the
// kill/scale/iterate calls.
//
// Thin cohorts are shown, never hidden by default — but they are sorted down and
// de-emphasised, because "100%, 1/1 ads" is arithmetically true and practically
// empty, and reading it as a proud winner is the actual failure mode here. The
// numbers are the assembler's; only their prominence is ours.

import type { CreativeWinRateFlag, CreativeWinRateRow } from '@continuum/contracts';
import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { cn } from '@/lib/utils';
import {
  DIMENSION_LABEL,
  FLAG_LABEL,
  FLAG_TOOLTIP,
  FUNNEL_TABS,
  type FunnelTab,
  hasThinEvidence,
  humanize,
  MIN_TRUSTWORTHY_COHORT,
  money,
  percent,
  selectWinRateRows,
} from './whatsWorkingModel';

const GENERIC_FLAG_TOOLTIP = 'Treat this win-rate with care — see the attribution note below.';

function FlagPills({ flags }: { flags: CreativeWinRateFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-3xs text-amber-600 dark:text-amber-400"
          key={flag}
          title={FLAG_TOOLTIP[flag] ?? GENERIC_FLAG_TOOLTIP}
        >
          {FLAG_LABEL[flag]}
        </span>
      ))}
    </span>
  );
}

function buildColumns(): InsightColumn<CreativeWinRateRow>[] {
  return [
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
      cell: (row) => (
        <span
          className={cn(
            'text-xs tabular-nums',
            hasThinEvidence(row) ? 'text-muted-foreground' : 'text-foreground',
          )}
          title={
            hasThinEvidence(row)
              ? `Computed over ${row.eligibleAds} ad${row.eligibleAds === 1 ? '' : 's'} — too small a cohort to separate the creative from the ad.`
              : undefined
          }
        >
          {percent(row.winRate)}
        </span>
      ),
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
  ];
}

function ExplorerEmpty() {
  return (
    <div className="space-y-2 p-4 text-xs text-muted-foreground">
      <p className="font-medium text-foreground text-sm">No labeled ads to rank yet</p>
      <p>
        Win-rate categories appear once this brand&apos;s ads are analysed and clear the evidence
        floors — <span className="tabular-nums">$50 spend</span> and{' '}
        <span className="tabular-nums">3,000 impressions</span> in the window.
      </p>
      <p>
        If this brand&apos;s ads were only just connected, labelling runs on the next sync. Nothing
        to do here in the meantime.
      </p>
    </div>
  );
}

function ExplorerBody({ brandId }: { brandId: string }) {
  const { status, report, refreshedAt, isLoading } = usePaidCreativeReport(brandId);
  const [funnel, setFunnel] = useState<FunnelTab>('all');
  const [hideThinEvidence, setHideThinEvidence] = useState(false);
  const columns = useMemo(buildColumns, []);

  const rows = useMemo(
    () => selectWinRateRows(report, funnel, { hideThinEvidence }),
    [report, funnel, hideThinEvidence],
  );

  if (status === 'empty' || (!report && !isLoading)) {
    return <ExplorerEmpty />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs onValueChange={(value) => setFunnel(value as FunnelTab)} value={funnel}>
          <TabsList className="h-7">
            {FUNNEL_TABS.map((tab) => (
              <TabsTrigger className="px-2 text-3xs uppercase" key={tab} value={tab}>
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <label
          className="flex items-center gap-2 text-3xs text-muted-foreground"
          htmlFor="whats-working-thin-evidence"
        >
          <Switch
            checked={hideThinEvidence}
            id="whats-working-thin-evidence"
            onCheckedChange={setHideThinEvidence}
          />
          Only cohorts of {MIN_TRUSTWORTHY_COHORT}+ ads
        </label>
      </div>

      <div className="max-h-[60vh] min-h-0 flex-1 overflow-y-auto">
        <InsightDataTable
          columns={columns}
          // Evidence first: a 100% win rate on one ad must not out-rank a 70%
          // win rate on twelve.
          defaultSort={{ columnId: 'ads', direction: 'desc' }}
          emptyState={
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No categories at this funnel stage yet.
            </p>
          }
          getRowId={(row) => `${row.dimension}:${row.value}:${row.funnelStage}`}
          isLoading={isLoading}
          rows={rows}
        />
      </div>

      {report ? (
        <div className="space-y-1 border-border/60 border-t pt-2">
          <p className="text-3xs text-muted-foreground">
            {report.sourceCounts.labeled} creatives labeled across {report.sourceCounts.ads} ads
            {refreshedAt ? ` · refreshed ${new Date(refreshedAt).toLocaleString()}` : ''}
          </p>
          <p className="text-3xs text-muted-foreground">{report.attributionNote}</p>
        </div>
      ) : null}
    </div>
  );
}

export function WhatsWorkingExplorerPopover({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="h-8 gap-1.5 px-2 text-xs" size="sm" type="button" variant="secondary">
          <Sparkles className="size-3.5" />
          What&apos;s working
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[80vh] w-[40rem] max-w-[92vw] flex-col gap-0 p-0"
      >
        <div className="space-y-1 border-border/60 border-b p-4">
          <p className="font-medium text-foreground text-sm">What&apos;s Working — Ads</p>
          <p className="text-muted-foreground text-xs">
            Win rate by creative category over the last 30 days, segmented by funnel stage. Kill,
            scale, and iterate calls stay on the dashboard.
          </p>
        </div>
        {open ? <ExplorerBody brandId={brandId} /> : null}
      </PopoverContent>
    </Popover>
  );
}
