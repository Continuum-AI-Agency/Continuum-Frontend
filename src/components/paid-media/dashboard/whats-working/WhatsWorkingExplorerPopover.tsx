'use client';

import { useLocale, useTranslations } from 'next-intl';

// "What's Working — Ads", explorer half: the win-rate category table, popped out
// of the dashboard into a click Popover so it floats over the page and dismisses
// on click-away, instead of a full-height slide-over. The dashboard keeps the
// kill/scale/iterate calls.
//
// Thin cohorts are shown, never hidden by default — but they are sorted down and
// de-emphasised, because "100%, 1/1 ads" is arithmetically true and practically
// empty, and reading it as a proud winner is the actual failure mode here. The
// numbers are the assembler's; only their prominence is ours.
//
// Grouped by dimension (Angle, Hook, Theme, ...) with the top few per section and
// a "show all" per group, under a short themes synopsis — one flat sortable table
// of every dimension x value x funnel stage read as a wall, not an answer.

import type { CreativeWinRateFlag, CreativeWinRateRow } from '@continuum/contracts';
import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { cn } from '@/lib/utils';
import { WhatsWorkingSynopsis } from './WhatsWorkingSynopsis';
import {
  categoryValueLabel,
  DIMENSION_LABEL,
  FLAG_LABEL,
  FLAG_TOOLTIP,
  FUNNEL_TABS,
  type FunnelTab,
  groupWinRatesByDimension,
  hasThinEvidence,
  MIN_TRUSTWORTHY_COHORT,
  money,
  percent,
  selectWinRateRows,
  type WinRateGroup,
} from './whatsWorkingModel';

const ROWS_PER_GROUP = 4;

const GENERIC_FLAG_TOOLTIP = 'Treat this win-rate with care — see the attribution note below.';

function FlagPills({ flags }: { flags: CreativeWinRateFlag[] }) {
  const uiText = useTranslations('scale');
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400"
          key={flag}
          title={uiText(
            flag === 'thumbnail_derived' ? 'creativeFlagThumbnailHint' : 'creativeFlagGenericHint',
          )}
        >
          {uiText('creativeFlagLabel', { flag })}
        </span>
      ))}
    </span>
  );
}

function WinRateLine({ row, showFunnel }: { row: CreativeWinRateRow; showFunnel: boolean }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();

  const thin = hasThinEvidence(row);
  return (
    <li
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_3rem_3rem_3.5rem_4.5rem] items-center gap-2 px-2 py-1',
        thin && 'opacity-60',
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-foreground text-xs">
            {categoryValueLabel(row, uiText)}
          </span>
          {showFunnel ? (
            <span className="shrink-0 rounded bg-muted px-1 text-xs text-muted-foreground uppercase">
              {row.funnelStage}
            </span>
          ) : null}
        </span>
        <FlagPills flags={row.flags} />
      </span>
      <span
        className="text-right text-xs tabular-nums"
        title={thin ? uiText('template_055dc6f3fe53', { count: row.eligibleAds }) : undefined}
      >
        {percent(row.winRate, uiLocale)}
      </span>
      <span className="text-right text-muted-foreground text-xs tabular-nums">
        {row.winners}/{row.eligibleAds}
      </span>
      <span className="text-right text-muted-foreground text-xs tabular-nums">
        {percent(row.spendShare, uiLocale)}
      </span>
      <span className="text-right text-muted-foreground text-xs tabular-nums">
        {money(row.medianCpa, row.currency, uiLocale)}
      </span>
    </li>
  );
}

function WinRateSection({ group, showFunnel }: { group: WinRateGroup; showFunnel: boolean }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.rows : group.rows.slice(0, ROWS_PER_GROUP);
  const hidden = group.rows.length - visible.length;
  return (
    <section className="rounded-md border border-border/60">
      <p className="flex items-center justify-between border-border/60 border-b bg-muted/30 px-2 py-1">
        <span className="font-medium text-foreground text-xs">
          {uiText('creativeDimensionLabel', { dimension: group.dimension })}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {uiText.rich('sentence_1885731d779b', { count: group.rows.length })}
        </span>
      </p>
      <ul className="divide-y divide-border/40">
        {visible.map((row) => (
          <WinRateLine
            key={`${row.dimension}:${row.value}:${row.funnelStage}`}
            row={row}
            showFunnel={showFunnel}
          />
        ))}
      </ul>
      {group.rows.length > ROWS_PER_GROUP ? (
        <button
          className="w-full px-2 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded
            ? uiText('show_fewer_255beb6')
            : uiText('template_a1eec0306f3f', { v0: hidden })}
        </button>
      ) : null}
    </section>
  );
}

function ExplorerEmpty() {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  return (
    <div className="space-y-2 p-4 text-xs text-muted-foreground">
      <p className="font-medium text-foreground text-sm">
        {uiText('no_labeled_ads_to_rank_yet_c1c0312')}
      </p>
      <p>
        {uiText.rich('sentence_0f236c1e20f8', {
          v0: () => <span className="tabular-nums">{uiText('50_spend_37c377a')}</span>,
          v1: () => <span className="tabular-nums">{uiText('3_000_impressions_419c7b1')}</span>,
        })}
      </p>
      <p>{uiText('if_this_brand_s_ads_were_only_just_connected__79d9f29')}</p>
    </div>
  );
}

function ExplorerBody({ brandId }: { brandId: string }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const { status, report, refreshedAt, isLoading } = usePaidCreativeReport(brandId);
  const [funnel, setFunnel] = useState<FunnelTab>('all');
  const [hideThinEvidence, setHideThinEvidence] = useState(false);
  const groups = useMemo(
    () => groupWinRatesByDimension(selectWinRateRows(report, funnel, { hideThinEvidence })),
    [report, funnel, hideThinEvidence],
  );

  if (status === 'empty' || (!report && !isLoading)) {
    return <ExplorerEmpty />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <WhatsWorkingSynopsis synopsis={report?.synopsis} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs onValueChange={(value) => setFunnel(value as FunnelTab)} value={funnel}>
          <TabsList className="h-7">
            {FUNNEL_TABS.map((tab) => (
              <TabsTrigger className="px-2 text-xs uppercase" key={tab} value={tab}>
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <label
          className="flex items-center gap-2 text-xs text-muted-foreground"
          htmlFor="whats-working-thin-evidence"
        >
          {uiText.rich('sentence_459a061f07f8', {
            v0: () => (
              <Switch
                checked={hideThinEvidence}
                id="whats-working-thin-evidence"
                onCheckedChange={setHideThinEvidence}
              />
            ),
            v1: MIN_TRUSTWORTHY_COHORT,
          })}
        </label>
      </div>

      <div className="max-h-[60vh] min-h-0 flex-1 space-y-2 overflow-y-auto">
        <p className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3.5rem_4.5rem] gap-2 px-2 text-xs text-muted-foreground">
          <span>{uiText('category_292c06f')}</span>
          <span className="text-right">{uiText('win_rate_4be2547')}</span>
          <span className="text-right">{uiText('ads_9210f3b')}</span>
          <span className="text-right">{uiText('spend_85f3d55')}</span>
          <span className="text-right">{uiText('median_cpa_771e995')}</span>
        </p>
        {isLoading && !report ? (
          <p className="px-2 py-3 text-muted-foreground text-xs">{uiText('loading_ba3bbbe')}</p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-3 text-muted-foreground text-xs">
            {uiText('no_categories_at_this_funnel_stage_yet_518b317')}
          </p>
        ) : (
          groups.map((group) => (
            <WinRateSection
              group={group}
              // Remount on filter change so a section's "show all" resets with it.
              key={`${group.dimension}:${funnel}:${hideThinEvidence}`}
              showFunnel={funnel === 'all'}
            />
          ))
        )}
      </div>

      {report ? (
        <div className="space-y-1 border-border/60 border-t pt-2">
          <p className="text-xs text-muted-foreground">
            {uiText.rich('sentence_0f8fb9e94e69', {
              count: report.sourceCounts.labeled,
              ads: report.sourceCounts.ads,
              hasDate: refreshedAt ? 'yes' : 'no',
              date: refreshedAt ? new Date(refreshedAt).toLocaleString(uiLocale) : '',
            })}
          </p>
          <p className="text-xs text-muted-foreground">{report.attributionNote}</p>
        </div>
      ) : null}
    </div>
  );
}

export function WhatsWorkingExplorerPopover({ brandId }: { brandId: string }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button className="h-7 gap-1.5 px-2 text-xs" size="sm" type="button" variant="ghost">
            <Sparkles className="size-3.5" />
            {uiText('win_rates_by_category_edaecd0')}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="flex max-h-[80vh] w-[40rem] max-w-[92vw] flex-col gap-0 p-0"
      >
        <div className="space-y-1 border-border/60 border-b p-4">
          <p className="font-medium text-foreground text-sm">
            {uiText('win_rates_by_category_edaecd0')}
          </p>
          <p className="text-muted-foreground text-xs">
            {uiText('win_rate_by_creative_category_over_the_last_3_1e0acae')}
          </p>
        </div>
        {open ? <ExplorerBody brandId={brandId} /> : null}
      </PopoverContent>
    </Popover>
  );
}
