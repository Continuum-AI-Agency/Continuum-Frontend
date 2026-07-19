'use client';

// "What's Working — Ads", dashboard half: the kill / scale / iterate calls only.
// The win-rate category table moved out to WhatsWorkingExplorerSheet so the
// dashboard keeps its vertical budget for charts.
//
// Rows are deliberately one line — identity plus efficiency. The figure-bearing
// reason, the spend, and the creative itself live in the hover (VerdictHoverCard).
// A small thumb still renders in the row so expired Meta CDN URLs start
// re-resolving before the user hovers, and the hover reveals a real image.

import type { PaidCreativeVerdict } from '@continuum/contracts';
import { useMemo, useState } from 'react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromPaidVerdict } from '@/components/chat/media/media';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePaidCreativeRecovery } from '@/hooks/usePaidCreativeRecovery';
import { usePaidCreativeReport } from '@/hooks/usePaidCreativeReport';
import { cn } from '@/lib/utils';
import { VerdictHoverCard } from './VerdictHoverCard';
import {
  FUNNEL_TABS,
  type FunnelTab,
  isHttpUrl,
  money,
  selectVerdictsByKind,
  VERDICT_STYLE,
} from './whatsWorkingModel';

const MAX_ROWS_PER_COLUMN = 5;

type RecoveryProps = {
  freshUrlById: Record<string, string>;
  onRecover: (adId: string) => void;
};

function VerdictRow({
  verdict,
  freshUrlById,
  onRecover,
}: { verdict: PaidCreativeVerdict } & RecoveryProps) {
  const freshUrl = freshUrlById[verdict.adId] ?? null;
  const media = mediaFromPaidVerdict({
    ...verdict,
    thumbnailUrl: freshUrl ?? verdict.thumbnailUrl,
  });
  const label = verdict.adName ?? verdict.adId;
  const rowClass =
    'flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  const body = (
    <>
      {media ? (
        <span className="relative block size-6 shrink-0 overflow-hidden rounded-sm">
          <ChatMediaThumb
            className="rounded-sm"
            fallbackSeed={label}
            media={media}
            onRecover={() => onRecover(verdict.adId)}
          />
        </span>
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-muted text-3xs text-muted-foreground">
          AD
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{label}</span>
      <span className="shrink-0 text-3xs text-muted-foreground tabular-nums">
        {money(verdict.cpa)}
      </span>
    </>
  );

  return (
    <VerdictHoverCard freshUrl={freshUrl} onRecover={onRecover} verdict={verdict}>
      {isHttpUrl(verdict.permalinkUrl) ? (
        <a className={rowClass} href={verdict.permalinkUrl} rel="noreferrer" target="_blank">
          {body}
        </a>
      ) : (
        <span className={rowClass}>{body}</span>
      )}
    </VerdictHoverCard>
  );
}

function VerdictColumn({
  kind,
  verdicts,
  freshUrlById,
  onRecover,
}: {
  kind: PaidCreativeVerdict['verdict'];
  verdicts: PaidCreativeVerdict[];
} & RecoveryProps) {
  return (
    <div className="min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 p-1">
      <p className="flex items-center justify-between px-1 pb-1">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide',
            VERDICT_STYLE[kind],
          )}
        >
          {kind}
        </span>
        <span className="text-3xs text-muted-foreground tabular-nums">{verdicts.length}</span>
      </p>
      {verdicts.length === 0 ? (
        <p className="px-1 py-1.5 text-3xs text-muted-foreground">None right now.</p>
      ) : (
        verdicts
          .slice(0, MAX_ROWS_PER_COLUMN)
          .map((verdict) => (
            <VerdictRow
              freshUrlById={freshUrlById}
              key={verdict.adId}
              onRecover={onRecover}
              verdict={verdict}
            />
          ))
      )}
    </div>
  );
}

export function WhatsWorkingAdsCard({
  brandId,
  adAccountId,
}: {
  brandId: string;
  adAccountId: string | null;
}) {
  const { status, report, isLoading } = usePaidCreativeReport(brandId);
  const [funnel, setFunnel] = useState<FunnelTab>('all');
  const { freshUrlById, recover } = usePaidCreativeRecovery({ brandId, adAccountId });

  const verdictsByKind = useMemo(() => selectVerdictsByKind(report, funnel), [report, funnel]);

  if (status === 'assembling' && !report) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-background/70 px-3 py-2">
        <p className="text-sm font-medium text-foreground">What&apos;s Working — Ads</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isLoading
            ? 'Loading creative intelligence…'
            : 'Analyzing your ad creatives — verdicts appear after the first sync completes.'}
        </p>
      </div>
    );
  }

  if (status === 'empty' || !report) {
    return (
      <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
        <p className="text-sm font-medium text-foreground">What&apos;s Working — Ads</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No labeled ads with enough spend yet. Verdicts appear once ads clear the evidence floors
          ($50 spend, 3,000 impressions).
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border/70 bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
        <p className="text-sm font-medium text-foreground">
          What&apos;s Working — Ads
          <span className="ml-2 text-3xs font-normal text-muted-foreground">
            hover a row for the creative and the reasoning
          </span>
        </p>
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

      <div className="flex flex-col gap-1.5 p-2 lg:flex-row">
        <VerdictColumn
          freshUrlById={freshUrlById}
          kind="kill"
          onRecover={recover}
          verdicts={verdictsByKind.kill}
        />
        <VerdictColumn
          freshUrlById={freshUrlById}
          kind="scale"
          onRecover={recover}
          verdicts={verdictsByKind.scale}
        />
        <VerdictColumn
          freshUrlById={freshUrlById}
          kind="iterate"
          onRecover={recover}
          verdicts={verdictsByKind.iterate}
        />
      </div>
    </section>
  );
}
